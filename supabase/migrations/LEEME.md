# Migraciones (borradores de la auditoría, 2026-10-16)

**Ninguna está aplicada.** El repo no tenía el esquema versionado, así que estas
migraciones se escribieron a partir de lo que usa el frontend. Antes de aplicarlas:

1. `supabase db pull` para traer el esquema y las políticas reales al repo.
2. Comparar nombres de tablas y columnas con estos archivos.
3. Probar en una rama de Supabase (branching) o en staging: iniciar sesión con cada rol
   (admin, cajero, mesero, cocina, domiciliario, dev) y hacer un pedido público.
4. Aplicar en producción en este orden:

| Archivo | Rama | Qué hace | Depende de |
|---|---|---|---|
| `20261016000100_backfill_auth_user_id.sql` | tarea/sesion-y-acceso | Vincula perfiles antiguos con su cuenta de Auth | — |
| `20261016000200_order_items_unit_price.sql` | tarea/reportes | Precio histórico por línea | — |
| `20261016000300_rls_helpers_y_users.sql` | tarea/rls-supabase | Funciones de apoyo + RLS en `users` + trigger anti-escalada | — |
| `20261016000400_rls_por_restaurante.sql` | tarea/rls-supabase | RLS por restaurante en todas las tablas; pagos sin DELETE | 0300 |
| `20261016000500_rpc_pedido_publico.sql` | tarea/rls-supabase | RPC del pedido público (sin exponer clientes) | 0400 |

Después de 0500, desplegar el frontend de `tarea/rls-supabase` (la página pública ya llama a las RPC).
También en el Dashboard: desactivar el registro público de usuarios (Auth → "Allow new users to sign up").
