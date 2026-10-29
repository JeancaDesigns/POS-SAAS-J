# Marca Jeanca

Logo definitivo (elegido el 2026-10-29): una ventana de app con `>_` en la barra y **JEANCA** adentro.
Ícono: la misma ventana en cuadrado con **JC**.

## Archivos

| Archivo | Uso |
|---|---|
| `svg/jeanca-logo-blanco.svg` · `svg/jeanca-logo-negro.svg` | Logo completo (392 × 172) |
| `svg/jeanca-icono-*.svg` | Ícono JC con `>_` (172 × 172) |
| `svg/jeanca-icono-*-sin-prompt.svg` | Ícono para tamaños menores de 64 px (sin `>_`, que ahí se vuelve mancha) |
| `png/` | Las mismas piezas con fondo transparente: logo a 1568 px, ícono a 512, 192 y 32 px |
| `animacion-terminal.html` | Animación del ícono al logo, escribiéndose como en una terminal |
| `fuentes/` | Bungee y JetBrains Mono (licencia SIL OFL, se pueden usar en un logo) |

"Blanco" = tinta blanca con el cuerpo negro; "negro" = al revés. Los SVG llevan las
tipografías adentro: se ven igual sin tenerlas instaladas. Para tener las letras como
trazos (por ejemplo para imprenta), en Inkscape: *Trayecto → Objeto a trayecto*.

## Medidas (no cambiar sin decidirlo)

- Ventana: 392 × 172, radio 18, borde 6, barra 38, cuerpo 128 (esquinas del cuerpo: 4 arriba, 12 abajo).
- Barra: 3 puntos de 10 px separados 8 px, a 14 px del borde; `>_` en JetBrains Mono 800, 20 px, a la derecha.
- Nombre: JEANCA en Bungee 66 px, centrado en el cuerpo.
- Ícono: la misma ventana con 172 de ancho y **JC** en Bungee 66 px.

## Color

Es bicolor (tinta + fondo), así que admite cualquier par con buen contraste.
Por ahora se usa en blanco y negro; el color de identidad está por decidir.

## Dónde se usa en el POS

- Pestaña del navegador y acceso directo en iPhone: `public/marca/jeanca-icono-blanco-32.png` y `-192.png`.
- Tickets impresos: ícono JC junto al logo del restaurante y el logo completo al pie
  (`public/marca/jeanca-icono-negro-192.png`, `public/marca/jeanca-logo-negro.png`).
