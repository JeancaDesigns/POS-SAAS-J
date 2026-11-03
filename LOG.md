# LOG

## 2026-10-15 — Auditoría de solo lectura

### Fallos (regla: si algo falla dos veces, parar y anotar)
- **Gemini CLI (v0.64.0) falló 2 veces** (`gemini -p` para UX y para lógica, con el código pasado por stdin). Error: `When using Gemini API, you must specify the GEMINI_API_KEY environment variable.` (exit 41). No lo reintenté. Para usarlo: configurar `GEMINI_API_KEY` o hacer `gemini` login interactivo. La auditoría se hizo sin segunda opinión.
- No se consultó la base de datos en vivo de Supabase (fuera del alcance "clon de solo lectura"). Por eso RLS, triggers y RPC quedan "por confirmar".

### Resumen (10 líneas)
1. Hice una auditoría de solo lectura de `main@12621e6`: no cambié código ni hice commits. Solo creé AUDITORIA.md y LOG.md.
2. Encontré 35 hallazgos: 6 críticos, 10 altos, 12 medios y 7 bajos (detalle en AUDITORIA.md).
3. Crítico: la Edge Function `create-user` no verifica quién la llama; con la llave anon se puede crear un usuario `dev` en cualquier restaurante.
4. Crítico: la tabla `users` no tiene RLS y el registro público está activo, así que cualquiera puede leer todos los perfiles y subirse el rol.
5. Crítico: el esperado de caja suma las transferencias como efectivo, así que el cierre nunca cuadra.
6. Crítico: el cobro offline en caja lanza un ReferenceError (`setOrders`) y la cola offline no es idempotente (pagos y pedidos duplicados o perdidos).
7. Alto: hay una clave de borrado escrita en `TicketsPanel.jsx:6` (commit ee37e82), roles validados solo en el cliente, perfiles con `auth_user_id` NULL que se desloguean al recargar y el chequeo de restaurante activo no funciona.
8. Historial git: solo está la llave **anon** en el commit 5a7f9aa (`src/supabaseClient.js`). No hay service_role ni otros secretos.
9. UX: cocina se cierra sola a los 30 min, el cajero debe escribir el total a mano y el mesero tiene 2 pasos redundantes en "+". Las soluciones propuestas casi nunca añaden pasos.
10. Falta: confirmar RLS y RPC en Supabase (Advisors o `supabase db pull`), configurar Gemini y luego aplicar los arreglos en ramas `tarea/...` siguiendo el plan de AUDITORIA.md.

## 2026-10-16 — Prueba de Gemini tras configurar la API key
- La key ya funciona: el error `GEMINI_API_KEY` desapareció y la petición llega a la API de Google.
- **Falló 2 veces** con `503 UNAVAILABLE: "This model is currently experiencing high demand"`. El CLI reintentó solo (6 o más intentos cada vez) hasta que lo cortó el timeout de 2-3 min (exit 124). Paré según la regla.
- Causa: saturación temporal del modelo por defecto en el lado de Google. No es un problema de configuración local.
- Próximo paso: reintentar más tarde o elegir otro modelo con `gemini -m <modelo> -p "..."`.

## 2026-10-16 — Correcciones de la auditoría (7 ramas, commits locales)
- `npm ci` (con permiso). La línea base compilaba con 72 problemas de lint.
- Ramas, todas desde `main` salvo las encadenadas:
  - `tarea/seguridad-edge-functions` (5906e5d)
  - `tarea/sesion-y-acceso` (7bc11a8)
  - `tarea/caja-y-cobros` (020afe5)
  - `tarea/cola-offline` (55bda5c)
  - `tarea/ux-personal` (e68840c)
  - `tarea/reportes` (sobre `caja-y-cobros`; 0b0d38a, 3538e80)
  - `tarea/rls-supabase` (sobre `reportes`; d9afb11)
- Integración probada: las 7 se fusionan sin conflictos, compilan y el lint baja a 67 sin errores nuevos (se fueron los 3 `no-undef`).
- Gemini revisó las ramas 1-4 (descarté sus falsos positivos). En la rama 5 falló 2 veces (503 y luego 429 por cuota diaria gratuita agotada, que se renueva en unas 18 h). Paré y revisé las ramas 5-7 a mano.
- **No hay push:** el remoto tiene `origin DISABLED (push)`. No cambié esa configuración.
- **Ninguna migración SQL está aplicada.** Ver `supabase/migrations/LEEME.md`.
- Pendiente: probar en dispositivo real (offline y por rol), `supabase db pull` y aplicar las migraciones en staging, M6 (inventario con trigger) y B7 (toasts de error).
- 2026-10-16: subí las 7 ramas a `origin`. `tarea/seguridad-edge-functions` ya la había subido el usuario. No toqué `main`.

## 2026-10-16 (noche) — Revisión de producción y preparación de RLS
- Leí la base de producción con el MCP de Supabase, solo lectura. Hallazgos en `supabase/migrations/LEEME.md`.
- 🔴 URGENTE: la `change-password` publicada no verifica quién llama (permite tomar cualquier cuenta). `create-user` publicada es la vieja.
- El clasificador de Claude Code **bloqueó** publicar la Edge Function, y luego también las lecturas SQL. No apliqué ni publiqué nada en Supabase.
- Rama `tarea/rls-supabase` (3562c88, subida): migraciones ajustadas al esquema real y `supabase/tests/prueba_rls.sql`, una prueba por rol que se deshace sola.
- Falta: publicar las 2 Edge Functions, correr la prueba, aplicar 0200-0500, fusionar la rama y desactivar el registro público.

## 2026-10-16 (~02:10) — RLS aplicado en producción
- Publicadas `change-password` v2 (antes sin protección) y `create-user` v9.
- `prueba_rls.sql`: 23/23 pruebas OK (mesero, admin, dev, anónimo). Comprobé que no dejó rastro.
- Aplicadas en producción 0200 (unit_price), 0300 (RLS users), 0400 (huecos de pagos, restaurantes y turnos; menú público) y 0500 (RPC del pedido público).
- Advisor de seguridad: 0 errores.
- Rama `tarea/rls-supabase` actualizada y subida. Falta: fusionarla (activa la nueva página de pedidos), desactivar "Allow new users to sign up" y activar "Leaked password protection" en el Dashboard.
- Mientras no se fusione: la página pública ya muestra el menú, pero sigue sin poder crear pedidos (igual que antes) y ya no muestra el nombre del domiciliario.
- Si algo falla con el personal: `alter table public.users disable row level security;` vuelve `users` al estado anterior.

## 2026-10-16 — Rediseño "Nítido" claro/oscuro (rama tarea/rediseno-nitido, subida)
- Base: index.css con tokens claro/oscuro, 4 temas de restaurante con variante oscura, Manrope + JetBrains Mono, preferencia por dispositivo (Claro/Oscuro/Auto) en el menú lateral.
- Rediseñado: NavBar, menú lateral, Login, selector, Mesas (mesero), Tomar pedido, Caja (tickets y cuenta), Cocina (tablero de comandas), encabezados de admin/domiciliario, pedido público, login dev, banner de conexión.
- Paneles de admin, deudas y reportes: adaptados por tokens (funcionan en oscuro), pero no rediseñados pantalla por pantalla.
- Verificación: compila y el lint no tiene errores nuevos (67 vs 72). No pude ver las pantallas internas: Firefox headless captura antes de que React pinte.
- Vista previa en Vercel: https://pos-restaurante-ehok4i2kk-jeancadesigns-2365s-projects.vercel.app (usa la base real).

## 2026-10-16 — Rediseño profundo (segunda pasada, rama tarea/rediseno-nitido)
- Mesas: se quitó el botón "Nuevo pedido". `src/components/NuevoPedidoModal.jsx` quedó sin uso, pero no lo borré porque `rm` está bloqueado en la configuración.
- Caja: 3 columnas (efectivo esperado y vistas / lista con buscador / cobro con métodos, billetes sugeridos, cambio, fiado).
- Tomar pedido y Pedido activo: catálogo compartido (ProductPicker) con buscador y carrito lateral. Corregido: con variantes, quitar o anotar afectaba la línea equivocada.
- Cocina: filtros Todos / Mesas / Domicilios / Para recoger y barra "Por preparar".
- Domicilios: modo ruta (Por salir / En ruta / Entregados) con cambio a llevar.
- Admin: menú lateral agrupado y Dashboard con gráfica de 14 días; Menú, Caja, Usuarios, Mesas, Configuración, Tickets e Inventario rediseñados; Deudas y Desglose como paneles laterales.
- Hallazgos: (1) el admin no puede guardar Configuración por RLS (solo dev), así que ahora se muestra el error; (2) Caja admin pedía "efectivo + transferencia" al cerrar, corregido a solo efectivo; (3) Tickets cargaba todo el historial, ahora se pagina por periodo.
- Pendiente de revisar: `active_shifts.user_id` se guarda con users.id, pero la política compara con auth.uid(). Si son distintos, iniciar turno falla.
- Verificación: cada commit compila sin errores nuevos de lint. No vi las pantallas renderizadas.

## 2026-10-16 — Revisión de bugs (solo lectura, rama tarea/rediseno-nitido)
- Leí caja, cola offline, toma de pedido, pedido activo, cocina, domicilios, login, paneles de admin, pedido público y la RPC. No cambié código.
- Encontré unos 20 bugs. Los más graves: el cobro en línea marca el pedido como pagado aunque falle el pago; los pagos offline quedan con la hora de la sincronización; doble toque en cocina descuenta el inventario dos veces; descartar un cancelado libera una mesa ocupada; el domiciliario cobra $1.000 aunque el domicilio sea gratis y no aplica descuentos.
- Falta: decidir qué arreglar primero y hacerlo en ramas `tarea/...`.

## 2026-10-16 (tarde) — Corrección de los bugs de la revisión (rama tarea/bugs-revision, subida)
- 9 commits sobre `tarea/rediseno-nitido`. Cada uno compila; lint sin errores nuevos (65 vs 64, un aviso más de hooks).
- Corregidos los 23 puntos de la revisión. Lo principal: cobro verificado paso a paso y sin pagos duplicados; pagos offline con su hora real; cocina sin doble descuento de inventario (y descuenta lo marcado sin conexión); mesa de domicilio con varios pedidos; domicilios con descuentos y valor real; paneles de admin muestran errores.
- Nuevo: `src/utils/totales.js`, `mesas.js`, `inventario.js`, `hora.js`.
- Migración `0600_bugs_revision.sql` escrita y **no aplicada** (un pedido por mesa, una caja abierta, política de turnos, horario en la RPC). La prueba con rollback desde el MCP fue rechazada (`Invalid or expired requestState`); verifiqué que producción quedó intacta.
- Bug 23 confirmado en producción (solo lectura): 2 usuarios con auth_user_id ≠ id no pueden iniciar turno hasta aplicar 0600.
- Gemini falló 2 veces (503 saturado; luego `gemini-2.5-flash` ya no existe, sugiere `gemini-3.8-flash`). Paré y revisé el diff a mano.
- Falta: probar en dispositivo (cobro, fiado, offline, cocina), aplicar 0600 y fusionar. Conocido: si un cobro falla después de guardar el pago y se cambian los montos antes de reintentar, queda el pago con los montos originales.

## 2026-10-16 — Migración 0600 aplicada
- Probada en producción con rollback (ok) y aplicada con `apply_migration` (`bugs_revision`).
- Verificado: trigger un-pedido-por-mesa, índice una-caja-abierta, política de turnos nueva, RPC pública con horario.
- Falta: hacer PR `tarea/bugs-revision` → `main` y probar en dispositivo (cobro, fiado, offline, cocina, turnos de domiciliario).

## 2026-10-16 — Texto flotante en reportes y versión visible
- Bug: el `<caption>` de la tabla para lectores de pantalla en "Ventas por día" se veía flotando (el `sr-only` en una `<table>` no oculta su caption). Ahora el `sr-only` va en un div que envuelve la tabla.
- Menú lateral, sección Apariencia: muestra "Versión <commit> · <fecha del build>" (hora Colombia). En Vercel usa `VERCEL_GIT_COMMIT_SHA`.
- Falta: PR `tarea/version-y-grafico` → `main`.

## 2026-10-16 — Solo modo oscuro, color morado y diálogos propios
- Quedó solo el modo oscuro (sin selector Claro/Oscuro/Auto) y un solo color de marca: morado. Se quitó el selector de color en Configuración y en el panel dev (la columna `theme` de la BD no se tocó).
- Los 74 `alert`/`confirm` nativos ahora son diálogos del sistema (`src/utils/dialogo.js` + `src/components/Dialogo.jsx`).
- El selector de sección de admin en celular y los 6 `<select>` de formularios ahora abren una hoja propia (`src/components/Selector.jsx`).
- Sin usar (pendiente de permiso para borrar): `ModeSwitch.jsx`, `useThemeMode.js`, `utils/themeMode.js`, `styles/themes.css`, `App.css`.
- Falta: PR `tarea/oscuro-y-dialogos` → `main` y revisarlo en pantalla.

## 2026-10-16 — Limpieza de lint (en pausa)
- Rama `tarea/limpieza-lint` (subida, commit eee0e17, SIN PR todavía): borrados ModeSwitch.jsx, useThemeMode.js, utils/themeMode.js, styles/themes.css, App.css; arreglado el aviso de "conexión restablecida" (useState→useRef); quitadas variables y la función addPendingOrderToCache sin uso. Lint: 65 → 55.
- Quedan 55: 27 exhaustive-deps, 16 set-state-in-effect, 7 immutability (todo por el patrón de cargar datos al abrir pantalla), 3 purity (Date.now al dibujar: "hace X min"), 2 refs (cocina).
- Propuesta pendiente de que el usuario decida: (1) reorganizar la carga de datos en ~20 pantallas, (2) reloj compartido cada 30 s, (3) revisar los 2 de cocina. Opción de menos riesgo: hacer 2 y 3 primero y el 1 en rama aparte.

## 2026-10-22 — Lint en 0 (rama tarea/limpieza-lint)
- 55 → 0 problemas. Patrón nuevo en todas las pantallas: la carga de datos va DENTRO del useEffect con una bandera `vivo` (una respuesta vieja ya no pisa datos nuevos), y las recargas tras guardar usan `useRecarga()` (`src/hooks/useRecarga.js`; `await recargar()` espera a que termine). El tiempo real va en un efecto aparte que solo llama `recargar()`.
- `src/hooks/useAhora.js`: reloj compartido cada 30 s para "hace X min" (cocina y pedido).
- Menú lateral detecta la reconexión como estado derivado; pedido público decide el modal de entrada al crear el estado.
- No se pudo levantar `vite preview` (permiso denegado): falta probar en el preview de Vercel cada pantalla (caja, cocina, mesero, domicilios, admin: todas las pestañas, dev, pedido público).

## 2026-10-22 — Impresión de tickets (rama tarea/impresion, sale de tarea/limpieza-lint)
- Impresión desde el navegador (`src/utils/imprimir.js` + estilos `@media print` en index.css): sirve para tablet Android, PC y POS todo en uno.
- Plantillas en `src/utils/tickets.js`: comprobante de cobro, pre-cuenta, comanda (y "ADICIÓN" solo con lo nuevo) y cierre de caja. Totales con las mismas funciones de Caja.
- Dónde: Caja (al cobrar según preferencia, botón Pre-cuenta, Reimprimir en historial), pedido abierto (Imprimir: pre-cuenta o comanda; adición al agregar), cocina (Imprimir en la comanda), Admin › Caja (al cerrar). Toma de pedido ofrece la comanda al enviar.
- Menú lateral › "Impresión en este equipo": papel 80/58 mm, comprobante al cobrar y comanda al enviar (Preguntar/Siempre/Nunca), página de prueba.
- Selector ahora se abre en un portal (dentro del menú lateral quedaba encerrado).
- Falta: probar con impresora real; NIT/dirección/teléfono en el encabezado necesitarían columnas nuevas en `restaurants`.

## 2026-10-28 — Pedido público listo para pruebas reales (rama tarea/pedido-publico)
- Migración 0700 aplicada (probada con rollback): pago mixto, propina ≤ $2.000, indicaciones, WhatsApp/dirección del local, total validado en la BD, anti-spam 3 pedidos activos por teléfono, mesa de domicilio fija.
- Página pública reescrita: entra directo al menú, buscador, categorías sin productos ocultas, carrito con cantidades y notas, WhatsApp obligatorio, el GPS ya no borra la dirección, mapa que se centra en la ubicación, pago efectivo/transferencia/mixto con botones de copiar, propina y sugerencia de dejar el cambio, seguimiento en vivo (cada 20 s), datos del cliente recordados, nombre en la pestaña.
- Personal: "Web #058" en caja, cocina, pedido abierto, tickets y panel de tickets; caja prellena el pago declarado y avisa la propina (no es venta); domiciliario ve pago mixto, cambio, propina e indicaciones; Configuración con WhatsApp y dirección; domicilio puede ser $0.
- Falta: llenar WhatsApp y dirección en Admin › Configuración; probar en el preview de Vercel desde un celular.

## 2026-10-28 — tarea/mapa-rio-de-oro
- Hecho: el mapa del pedido público abre centrado en Río de Oro, Cesar (zoom 15) si el cliente no comparte ubicación.
- Falta: probarlo en el celular.
- Hecho: al usar la ubicación actual o tocar el mapa, la dirección se llena sola ("Ubicación marcada en el mapa") si estaba vacía.
- Hecho: ubicación con watchPosition: sigue sola tras aceptar el permiso, muestra el punto en cuanto llega, lo afina hasta 8 s, solo avisa error si no llegó nada; muestra la precisión y pide tocar el mapa si es aproximada.
- Falta: probar en celular; PC sin GPS siempre será aproximado.

## 2026-10-28 — Impresora térmica y tarea/comanda-automatica
- Impresora 3Bumen EasyPrint (USB 0519:2015, ESC/POS, 48 mm útiles) instalada en el PC con driver zj-58 (compilado en scratchpad), cola CUPS "Termica58" predeterminada, PageSize X48MMY3276MM, BlankSpace=False, FeedDist 18 mm. Pre-cuenta desde Firefox: OK.
- Hecho: estación de impresión (useEstacionImpresion): en Impresión, interruptores "comandas de todos" y "pedidos web"; escucha INSERT en order_items, agrupa 2,5 s por pedido, COMANDA o ADICIÓN, recuerda lo impreso en localStorage, sin cierre por inactividad en ese equipo.
- Falta: probar con un pedido real desde el celular; Firefox con print.always_print_silent para imprimir sin diálogo; pedidos enviados con el PC apagado no se imprimen después.
- Problema: página de prueba sacó papel en blanco sin parar (página fija de 3,2 m + probable pie de página del navegador). Hecho en tarea/impresion-papel: imprimirHTML mide el ticket y pide @page del largo exacto (+5 mm); la zona se arma fuera de pantalla para poder medirla.
- Falta: confirmar con el usuario por qué no salió la comanda automática (versión/interruptor/consola).
- Firefox silencioso: 1er intento hoja carta; 2º (user.js con paper_id X48MMY210MM) el PDF salió bien pero Firefox mandó PageSize=Custom A4 a CUPS y rastertozj crashea (segfault) con páginas anchas (reproducido con cupsfilter). Quité el paper_id adivinado del user.js y forcé gris. Pendiente: que Firefox guarde su propio id de papel desde el diálogo, o usar Chrome --kiosk-printing.
- Estación de comandas pasa a Chrome: lanzadores de usuario (~/.local/share/applications) con --kiosk-printing. Firefox queda con diálogo (always_print_silent false en user.js).
- Chrome kiosk imprime sin diálogo (PDF 58x210 mm, OK) pero con encabezado/pie. Política /etc/opt/chrome/policies/managed/pos-impresion.json: PrintHeaderFooter false, color monocromo.
- tarea/ticket-sin-logo: quitado el logo de los tickets (salía como ~2 cm en blanco arriba).
- tarea/ticket-arriba: el espacio arriba no era el logo; Chrome usa el papel de la impresora (58x210) y centraba la página medida. Se quita el @page size: ticket arriba, driver recorta abajo.

## 2026-10-29 — tarea/diseno-tickets
- Hecho: migración 0800 aplicada (restaurants.instagram, ticket_message). Encabezado [logo restaurante] × [logo Jeanca] convertidos a negro puro y recortados en el navegador (logoTermico.js), con respaldo al nombre; WhatsApp e Instagram; pie con mensaje configurable y "Sistema POS por Jeanca Designs"; letra 500 y negrita en títulos/total; comanda web sin número repetido; indicaciones en recuadro. Campos nuevos en Configuración › Ticket impreso.
- Falta: probar en la térmica (CORS del logo en Supabase), llenar WhatsApp/Instagram en Configuración. Mejora futura: agente local de impresión sin diálogo.

## 2026-10-29 — Logo Jeanca (diseño, fuera del código)
- Hecho: logo definitivo elegido (ventana angosta con >_ en la barra y JEANCA en Bungee), ícono JC + >_, animación tipo terminal. Archivos en el scratchpad de la sesión (temporal).
- Falta: exportar SVG/PNG a una carpeta permanente y reemplazar el ícono "JD" del POS y la firma del ticket.
- tarea/marca-jeanca: carpeta marca/ (SVG con fuentes incluidas, idénticos píxel a píxel al aprobado; PNG transparentes; animación; LEEME), favicon JC, tickets con ícono JC y logo al pie. Pendiente: decidir ícono de la app instalada (hoy BP-Logo-R) y borrar logo.svg/logotipo.* viejos.
- Logo dentro del sistema (inicio, pie de ingreso, menú lateral). Ticket: mostradas opciones 1 (restaurante × JEANCA, sin firma) y 2 (+ "Sistema POS por [JC]"); pendiente elección.
- Propinas: migración 0900 aplicada; Caja con "Dejó propina" (10% sugerido editable, no es venta, sale primero del efectivo); pre-cuenta Subtotal/Propina sugerida/Total; comprobante con propina y total pagado; cierre suma propinas en efectivo al esperado y muestra "Propinas para repartir". Ticket opción 2 aplicada.
- Falta: probar un cobro real con propina y un cierre de caja en la vista previa.

## 2026-10-29 — tarea/ticket-margenes
- Hecho: ancho del ticket 46 mm (58) / 70 mm (80) para que no corte a los lados; aviso de pre-cuenta en 2 renglones; todos los pesos de letra un escalón más delgados (prueba, reversible).
- Falta: imprimir para confirmar el corte y decidir si se queda la letra delgada.

## 2026-10-29 — tarea/prioridad-jeanca
- Hecho: domicilios con "Jeanca" en el nombre muestran "⭐ Prioridad" en Cocina (tarjeta y detalle), Caja (lista) y Domiciliario. No cambia el orden.

## 2026-10-29 — Revisión general (sin cambios de código)
- Lint 0, build OK, logs sin errores de BD (solo 406 de slugs inexistentes y 3 claves malas).
- Hallazgos: propina web descuadra el cierre (domiciliario se la queda); sin internet al recargar se cierra la sesión y borra caché; SlugGuard sin internet muestra "Restaurante no encontrado"; admin no puede guardar Configuración (RLS solo dev); PagosPanel sin uso; delete_restaurant_cascade no borra pagos sin pedido; Entre Horas y Origen sin mesa de domicilio; Benditas sin dirección; índices y políticas RLS duplicadas (rendimiento, bajo); protección de contraseñas filtradas apagada.
- Falta: decidir y corregir.

## 2026-10-29 — tarea/correcciones-revision
- Hecho: migración 1000 (mesa web oculta, admin edita su restaurante, borrado completo); borrados Entre Horas y Origen; sesión sin internet guardada en el equipo; SlugGuard deja pasar sin conexión; login carga todos los datos (ticket con WhatsApp/IG); propina web fuera del cajón; avisos de error en nota/tipo de entrega/mesa.
- Falta: PagosPanel sin uso (preguntar); integrar /dev y DevPanel con la app de gestión y retocarlos.

## 2026-10-29 — tarea/limpieza-archivos y tarea/dev-unificado
- Borrados: PagosPanel, NuevoPedidoModal, ConnectionBanner, logo.svg (JD), logotipo.*, BP-Logo.png, favicon.svg, icons.svg, src/assets/*.
- /dev reúne la lista de restaurantes y, por cada uno, el botón Herramientas (DevPanel con restaurantId). El menú del POS lleva a /dev.
- Falta: dominio de producción para el enlace desde la app de gestión; retoques que pida el usuario.
- App de gestión (otra sesión, jeanca-b7): tarjeta "Panel dev del POS" en Más con botón a /dev (commit 90abfda en su main, SW gestion-v22). APK sin recompilar.
- 2026-10-29: merge de correcciones-revision, limpieza-archivos y dev-unificado verificado en main (lint 0, build OK).

## 2026-10-29 — tarea/panel-dev
- Hecho: /dev rediseñado (ListaRestaurantes, DetalleRestaurante con pestañas, NuevoRestaurante, FormDatos con vista previa del logo en ticket, HerramientasDev); rutas /dev/*; DevPanel.jsx borrado. Errores corregidos: borrar sin modal, bucket del logo, desactivar sin confirmar, cancelar/eliminar pedidos, etiquetas web.
- Falta: probarlo en el celular (no se pudo ver aquí: requiere iniciar sesión).

## 2026-10-29 — tarea/rendimiento-bd y tarea/editar-sin-internet
- Migración 1100 aplicada (índices, políticas duplicadas fuera, (select auth.uid())); verificado mismo acceso antes/después.
- Edición offline de pedidos enviados (src/db/edicionOffline.js + ops add_items/update_item/update_order/cancel_order en useSyncQueue). Mover mesa y tipo de entrega siguen en línea.
- Logos huérfanos en Storage: no se pueden borrar por SQL; el usuario los borra en el panel.
- Falta: probar offline en la tablet; color del logo en el POS.
- Color del logo en el POS: el usuario eligió C (blanco y negro, como está). Sin cambios de código.

## 2026-10-30 — tarea/intro-animacion y a futuro
- Hecho: IntroJeanca (animación terminal tras iniciar sesión, sobre la app que carga por debajo; fuentes en public/marca/fuentes, precacheadas).
- A FUTURO (pedido del usuario): publicidad y presentación del POS para captar restaurantes y empezar a cobrar (landing, demo, video, planes y precios, Benditas Papas como caso de éxito).
- tarea/fondos-marca: 6 fondos de pantalla en marca/fondos (terminal, minimal, patrón; celular y PC).

## 2026-11-03 — tarea/caja-cerrada
- Hecho: sin caja abierta no se reciben pedidos. Página pública: aviso "estamos organizando todo…" y botón bloqueado (revisa cada minuto); la BD también lo rechaza (migración 1300). Mesero: al confirmar, si la caja está cerrada avisa y el carrito queda guardado.
- Falta: aplicar la migración 1300 en producción y probarlo con la caja cerrada y abierta.
