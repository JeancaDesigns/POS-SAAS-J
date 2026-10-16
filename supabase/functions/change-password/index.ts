import { createClient } from 'jsr:@supabase/supabase-js@2'

// Versión versionada de change-password (antes solo existía desplegada).
// Solo un dev, o un admin del mismo restaurante (sobre personal que no sea admin/dev), puede cambiarla.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { user_id, new_password } = await req.json()
    if (typeof user_id !== 'string' || typeof new_password !== 'string' || new_password.length < 8) {
      return json({ error: 'Datos inválidos (mínimo 8 caracteres)' }, 400)
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const jwt = req.headers.get('Authorization')?.replace('Bearer ', '')
    const { data: { user: callerUser } } = await supabaseAdmin.auth.getUser(jwt)
    if (!callerUser) return json({ error: 'No autorizado' }, 401)

    const { data: caller } = await supabaseAdmin
      .from('users').select('roles, restaurant_id, active')
      .eq('auth_user_id', callerUser.id).single()

    const { data: target } = await supabaseAdmin
      .from('users').select('restaurant_id, roles')
      .eq('auth_user_id', user_id).single()

    if (!caller?.active || !target) return json({ error: 'No autorizado' }, 403)

    const isDev = caller.roles?.includes('dev')
    const isAdminSameRestaurant = caller.roles?.includes('admin')
      && caller.restaurant_id === target.restaurant_id
      && !target.roles?.some((r: string) => ['dev', 'admin'].includes(r))
    if (!isDev && !isAdminSameRestaurant) return json({ error: 'No autorizado' }, 403)

    const { error } = await supabaseAdmin.auth.admin.updateUserById(user_id, { password: new_password })
    if (error) return json({ error: error.message }, 400)

    return json({ success: true })
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})
