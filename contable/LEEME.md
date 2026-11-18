# Social · Contabilidad

App web de la contadora de Social Drinks and Coffee (Leyla). Se instala en el iPhone desde Safari
(Compartir › Agregar a pantalla de inicio) y se usa igual en el PC.

**Independiente del POS.** Social cobra con el POS de la Sunmi T2, no con el de este repo. Esta app solo
comparte el proyecto de Supabase como servidor (cuentas, base de datos y archivos): **no lee ni escribe
ninguna tabla del POS**. Todo lo suyo vive en tablas `contable_*` y en el bucket privado `contable`.

## Secciones
- **Resumen**: ventas, gastos, nómina y utilidad del mes; ventas y gastos por día; medios de pago; gastos
  por categoría; estado de resultados; aviso de días sin cierre; **informe del mes en Excel**
  (Resumen, Cierres de caja, Gastos, Nómina).
- **Cierres de caja**: uno por día, tomado del reporte de cierre de la caja: ventas por medio de pago
  (efectivo, tarjeta, transferencia, otros), propinas, efectivo esperado y contado (diferencia) y foto/PDF del
  reporte. Muestra los días del mes que faltan por registrar.
- **Gastos y facturas**: fecha, proveedor, n.º de factura, concepto, categoría, medio de pago, valor y soporte
  (foto o PDF; las fotos se achican a 2000 px). Buscar y filtrar.
- **Nómina**: *Personal* (nombre, cargo, documento, por turno o fijo quincenal, valor) y *Liquidación
  quincenal* (turnos, bonificaciones, descuentos con observación). Contabilidad la guarda; **Gerencia la valida**
  y la marca pagada; validada = contabilidad ya no la cambia (trigger `contable_nomina_guard`).
- **Ajustes**: mi cuenta (cambiar contraseña), equipo (agregar personas con clave temporal, cambiar rol,
  suspender) y permisos.

## Roles (`contable_perfiles.rol`)
- `contadora` (Contabilidad): registra todo y prepara la nómina.
- `jefe` (Gerencia): además valida/paga la nómina y administra el equipo.
- `admin` (Administrador): todo, incluido crear otros administradores. El primero se creó con la migración
  (las cuentas de desarrollador existentes).

Agregar a alguien: Ajustes › Equipo › Agregar persona. La función `contable_crear_usuario` crea la cuenta con
una clave temporal (se muestra una sola vez) y la persona crea su propia contraseña al entrar. Si el correo ya
tenía cuenta en el proyecto, solo la enlaza y entra con su contraseña de siempre.

## Base de datos
`supabase/migrations/20261118002500_contable.sql` (idempotente; la aplica la acción de migraciones al llegar a
`main`). El texto de la interfaz trata de "usted".

## Desarrollo
```
cd contable
npm install
npm run dev      # usa VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY del .env.local de la raíz
npm run build
```
Sin librerías de gráficas ni de Excel: la gráfica es SVG propio y `src/xlsx.js` arma el .xlsx (fechas reales
de Excel, formato de pesos, título y totales). Letras incluidas: Inter y Instrument Serif (`@fontsource`).

## Publicación (Vercel)
Proyecto aparte con **Root Directory = `contable`** y las variables `VITE_SUPABASE_URL` y
`VITE_SUPABASE_ANON_KEY` (las mismas del POS).
