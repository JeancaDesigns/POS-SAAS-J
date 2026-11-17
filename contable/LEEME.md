# Social Contable

App web de Leyla (contadora de Social Drinks and Coffee). Se instala en el iPhone desde Safari
(Compartir › Agregar a pantalla de inicio) y se usa igual en el PC. Vive en esta carpeta del repo del POS
porque usa la misma base de datos (Supabase): lee lo que el POS ya registra y guarda lo suyo en tablas propias.

## Qué tiene
- **Resumen** del mes: ventas, gastos, nómina y resultado; gastos por categoría; diferencias de caja;
  botón para bajar **todo el mes en Excel** (hojas Resumen, Ventas por día, Gastos, Cierres, Nómina, Turnos).
- **Gastos**: cada factura con fecha, proveedor, concepto, categoría, monto, cómo se pagó y la **foto**
  (bucket privado `facturas`, carpeta = id del restaurante; las fotos se achican a 1800 px). Editar y borrar.
- **Ventas**: cobros del POS (`payments`, sin anulados) por jornada (de la apertura a las 3:00 a. m.).
- **Cierres**: cada `cash_registers` con base, esperado, contado y diferencia.
- **Nómina** por quincena: sale de los turnos que cada empleado marca en el POS con el QR de la caja
  (`asistencia_turnos`, cálculo de `src/utils/asistencia.js`). Leyla pone ajustes (adelantos, bonos) con
  nota y la guarda; el jefe (rol `admin`) la **valida** y luego la marca **pagada**. Validada = Leyla ya no
  la cambia (trigger `nomina_guard`).

## Quién entra
Usuarios del POS con rol `contadora`, `admin` o `dev` (el dev elige el restaurante). La cuenta de Leyla se
crea en el POS: Admin › Usuarios › rol **Contadora**. Esa cuenta no entra al POS, solo aquí.

## Base de datos
Migración `supabase/migrations/20261117002500_contable.sql` (idempotente): tablas `gastos` y
`nomina_quincenas`, bucket `facturas`, función `es_contable()` y lectura de usuarios y turnos para la contadora.

## Desarrollo
```
cd contable
npm install
npm run dev      # usa VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY del .env.local de la raíz
npm run build
```
Excel sin librerías: `src/xlsx.js` arma el .xlsx (zip sin comprimir).

## Publicación (Vercel)
Proyecto aparte con **Root Directory = `contable`** y las mismas variables `VITE_SUPABASE_URL` y
`VITE_SUPABASE_ANON_KEY` del POS. Necesita "Include files outside the root directory" (viene activo):
usa `../src/utils/asistencia.js`.
