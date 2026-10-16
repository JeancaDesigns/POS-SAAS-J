import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Roles que un admin de restaurante puede asignar. 'dev' solo lo asigna otro dev.
const STAFF_ROLES = ['admin', 'cajero', 'mesero', 'cocina', 'domiciliario']

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { email, password, name, username, roles, restaurant_id } = await req.json()

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // ── Verificar quién llama ────────────────────────────────────────────────
    // verify_jwt también acepta la llave anon, así que hay que exigir un usuario real.
    const jwt = req.headers.get('Authorization')?.replace('Bearer ', '')
    const { data: { user: callerUser } } = await supabaseAdmin.auth.getUser(jwt)
    if (!callerUser) return json({ error: 'No autorizado' }, 401)

    const { data: callerProfile } = await supabaseAdmin
      .from('users')
      .select('roles, restaurant_id, active')
      .eq('auth_user_id', callerUser.id)
      .single()

    const callerIsDev = callerProfile?.roles?.includes('dev')
    const callerIsAdmin = callerProfile?.roles?.includes('admin')
    if (!callerProfile?.active || (!callerIsAdmin && !callerIsDev)) {
      return json({ error: 'No autorizado' }, 403)
    }

    // Un admin solo crea usuarios en su propio restaurante; el dev puede elegir.
    const targetRestaurantId = callerIsDev ? (restaurant_id ?? callerProfile.restaurant_id) : callerProfile.restaurant_id

    const safeRoles: string[] = (Array.isArray(roles) ? roles : [roles]).filter(Boolean)
    const allowedRoles = callerIsDev ? [...STAFF_ROLES, 'dev'] : STAFF_ROLES
    if (safeRoles.length === 0 || safeRoles.some(r => !allowedRoles.includes(r))) {
      return json({ error: 'Rol no permitido' }, 403)
    }

    // ── Crear usuario ────────────────────────────────────────────────────────
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      user_metadata: {},
      email_confirm: true,
      app_metadata: { provider: 'email', providers: ['email'] },
    })

    if (authError) {
      console.error(authError)
      return json({ error: authError.message }, 400)
    }

    const { error: dbError } = await supabaseAdmin
      .from('users')
      .insert({
        auth_user_id: authData.user.id,
        restaurant_id: targetRestaurantId,
        name,
        username,
        email,
        roles: safeRoles,
        active: true,
      })

    if (dbError) {
      console.error(dbError)
      // No dejar el usuario de Auth huérfano: si no, el email queda "ya registrado"
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
      return json({ error: dbError.message }, 400)
    }

    return json({ success: true })
  } catch (error) {
    return json({ error: error.message }, 400)
  }
})
