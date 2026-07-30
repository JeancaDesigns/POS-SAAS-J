import { createClient } from 'jsr:@supabase/supabase-js@2'

Deno.serve(async (req) => {
  try {
    const { email, password, name, restaurant_id, roles } = await req.json()

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const authHeader = req.headers.get('Authorization')
    const jwt = authHeader?.replace('Bearer ', '')

    const { data: { user: callerUser } } = await supabaseAdmin.auth.getUser(jwt)
    if (!callerUser) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 })
    }

    const { data: callerProfile } = await supabaseAdmin
      .from('users')
      .select('roles')
      .eq('auth_user_id', callerUser.id)
      .single()

    if (!callerProfile?.roles?.includes('dev')) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 403 })
    }

    // 1. Crear el usuario en Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (authError) {
      return new Response(JSON.stringify({ error: authError.message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 2. Crear el perfil en la tabla users
    const { error: profileError } = await supabaseAdmin
      .from('users')
      .insert({
        auth_user_id: authData.user.id,
        email,
        name,
        restaurant_id,
        roles: roles || ['admin'],
        active: true,
      })

    if (profileError) {
      // Si falla el perfil, revierte el usuario de Auth para no dejar huérfanos
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
      return new Response(JSON.stringify({ error: profileError.message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: true, user_id: authData.user.id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})