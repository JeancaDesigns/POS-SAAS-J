# Migraciones de la auditoría (actualizado 2026-10-16, contra el esquema real)

El 2026-10-16 revisé la base de producción (solo lectura) y ajusté estos archivos a lo
que existe de verdad. **Ninguno está aplicado todavía.**

## Qué encontré en producción
- `users` tiene **RLS desactivado** y una política `INSERT with check (true)` para cualquiera.
- La función `change-password` publicada **no verifica quién llama**: cualquiera con la llave
  pública puede cambiar la contraseña de cualquier usuario. Urgente: publicar la del repo.
- `create-user` publicada es la versión vieja, sin verificar quién llama.
- `payments` permitía DELETE; cualquier empleado podía borrar su restaurante; los turnos
  (`active_shifts`) se podían leer sin sesión.
- La página pública de pedidos no funciona: 0 pedidos online en 60 días, porque anon no
  puede insertar pedidos ni leer el menú.
- Ningún perfil tiene `auth_user_id` NULL, así que la migración 0100 no cambia nada.

## Orden
| Archivo | Qué hace |
|---|---|
| `0100_backfill_auth_user_id.sql` | Opcional (0 filas afectadas hoy) |
| `0200_order_items_unit_price.sql` | Precio histórico. Independiente, se puede aplicar ya |
| `0300_rls_helpers_y_users.sql` | Activa RLS en `users` sin recursión; quita el INSERT abierto; trigger anti-escalada |
| `0400_rls_por_restaurante.sql` | Pagos sin DELETE, restaurante solo editable/borrable por dev, turnos privados, menú visible para la página pública, permisos de funciones |
| `0500_rpc_pedido_publico.sql` | RPC del pedido público. Después, desplegar el frontend de esta rama |

## Cómo probar sin riesgo
`supabase/tests/prueba_rls.sql` aplica 0300 + 0400 + 0500 y prueba mesero, admin, dev y anónimo
dentro de una transacción que **siempre se deshace** (termina con un error a propósito cuyo
mensaje trae los resultados). Pegarlo completo en SQL Editor → Run, y revisar que cada línea
coincida con su `[esperado ...]`.

Si `prueba_rls.sql` se regenera: es la concatenación de 0300, 0400, 0500 y `_bloque_pruebas.sql`.
