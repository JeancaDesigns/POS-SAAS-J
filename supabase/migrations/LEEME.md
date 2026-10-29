# Migraciones de la auditoría (actualizado 2026-10-16, contra el esquema real)

El 2026-10-16 revisé la base de producción y ajusté estos archivos a lo que existe de verdad.

**Estado (2026-10-16, ~02:10 hora Colombia):**
- Publicadas `change-password` (v2) y `create-user` (v9) con verificación del llamador.
- `prueba_rls.sql` pasó las 23 pruebas (mesero, admin, dev, anónimo) y se confirmó que no dejó rastro.
- **APLICADAS en producción:** 0200, 0300, 0400 y 0500. La 0100 no se aplicó porque afectaba 0 filas.
- Advisor de seguridad: sin errores. Quedan avisos esperados (RPC públicas a propósito) y
  "Leaked password protection" (se activa en el Dashboard).

**0600 (2026-10-16, rama `tarea/bugs-revision`): APLICADA en producción.**
- Qué hace: (1) un solo pedido activo por mesa normal (trigger), (2) una sola caja abierta por
  restaurante, (3) arregla la política de turnos (`user_id` guarda `users.id`, no `auth.uid()`; antes 2
  usuarios no podían iniciar turno), (4) la RPC del pedido público valida el horario en hora Colombia.
- Antes de aplicarla: no había mesas con 2 pedidos activos ni 2 cajas abiertas. Se probó completa
  dentro de una transacción con rollback (todo se creó y la RPC respondió bien) y luego se aplicó.
- Verificado después: trigger e índice creados, política nueva, anon puede llamar
  `crear_pedido_publico` pero no `_crear_pedido_publico_base`. Cada bloque trae su "Deshacer".
- El frontend de la rama funciona con o sin 0600 (ya maneja el error 23505).
- **No** se agregó trigger de inventario: la cocina sigue descontando desde la app, pero ahora solo
  una vez por línea.

**0700 (2026-10-28, rama `tarea/pedido-publico`): APLICADA en producción.**
- Columnas nuevas: `restaurants.whatsapp`, `restaurants.address`, `orders.tip_amount` (0–2000, no es venta),
  `orders.transfer_amount` (parte por transferencia del pago mixto), `orders.customer_note`.
- `_crear_pedido_publico_base`: WhatsApp obligatorio de 10 dígitos, dirección obligatoria en domicilio,
  total recalculado con precios reales, valida efectivo / transferencia / mixto y propina ≤ $2.000,
  máximo 3 pedidos activos por teléfono, mesa de domicilio fija (la de número más bajo).
- `estado_pedido_publico` devuelve también `delivery_type`.
- Probada antes con rollback: 1 pedido válido en efectivo con propina, 1 mixto, y 6 rechazos esperados.

**0800 (2026-10-29, rama `tarea/diseno-tickets`): APLICADA en producción.**
- Columnas opcionales `restaurants.instagram` y `restaurants.ticket_message` (encabezado y pie del ticket).

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
