# Informe de recepción — `dash`

> Lo escribe `npm run assets:intake -- dash`. **Veredicto: aviso.** Se puede aceptar, pero mira primero los avisos en la hoja de contacto.

- **Entrada:** una hoja — `sheet.png`.
- **Escala:** ×1.2552 (por el tamaño de la cabeza: la cabeza gira y el ojo se ve más pequeño o desaparece, así que no mide el tamaño de la pose). Ojo de las poses de la hoja: 16.0 · 16.6 · 16.5 · 15.4 px; mediana 16.3 px. Cabeza de las poses de la hoja (el círculo más grande que cabe en la figura): 43.7 · 48.9 · 45.4 · 44.2 px; mediana 44.8 px → 56.2 px en el lienzo.
- **Fotogramas:** 4 de 4 pedidos, 320 × 230, pivote (160, 192).
- **Lo entregado frente a lo pedido:** las cuatro poses del panel. El arco cian que la hoja pinta en la segunda es un efecto: se quita (erase.json); el juego dibuja su estela de dash.

| Fotograma | Papel | Fase | Veredicto | Ojo (px) | Cabeza (px) | Halo | Sueltos | Rojo | Salto de masa (m) | Alto × ancho (m) |
|---|---|---|---|---|---|---|---|---|---|---|
| `dash_00` | launch | — | **correcto** | 19.9 | 54.4 | 0.0 % | 0.00 % | 0.00 % | — | 1.72 × 2.51 |
| `dash_01` | strike | — | **correcto** | 20.8 | 61.5 | 0.0 % | 0.00 % | 0.00 % | 0.10 | 1.82 × 2.43 |
| `dash_02` | stream-A | — | **correcto** | 20.6 | 56.6 | 0.0 % | 0.00 % | 0.00 % | 0.15 | 1.55 × 3.06 |
| `dash_03` | stream-B | — | **correcto** | 19.1 | 54.4 | 0.0 % | 1.52 % | 0.00 % | 0.11 | 1.78 × 3.02 |

## Avisos y fallos

- **aviso** · resolution: la imagen entregada es MÁS PEQUEÑA que los fotogramas (la escala es ×1.26): sus píxeles se agrandan y el dibujo se ve borroso — pide una hoja de al menos el doble de tamaño que los fotogramas

## Píxeles borrados a propósito (`erase.json`)

El dibujo traía efectos pintados dentro de la propia figura (arcos y estelas del tajo), donde el motor pone los suyos. Una persona marcó con polígonos —en píxeles del lienzo, como las anclas— lo que se quita: los píxeles de dentro pasan a transparentes y **nada más cambia** (ningún píxel se mueve, se recolorea ni se rehace). La herramienta se niega a borrar un píxel del cuerpo o un punto de la hoja de la espada. El dibujo entregado sigue archivado sin tocar: quitar `erase.json` y volver a entregar el clip lo devuelve entero. Lo quitado, en magenta, está en `erased.png`.

- `dash_01` — 4377 píxeles, 2 polígonos — The slash arc painted below and ahead of the figure in the sheet (a long cyan crescent with a faint tail of streaks): an effect, not the character; the game draws its own dash trail

## Qué mirar en `contact.png`

1. Fila 1: los dibujos originales del usuario (intactos) y los fotogramas vecinos del juego.
2. Fila 2: cada pose nueva sobre fondo oscuro, con su veredicto.
3. Fila 3: la secuencia nueva a tamaño 1:1 sobre la línea del suelo, contra la de hoy.
4. Fila 4: el tamaño real de juego junto al clip vecino.
5. `erased.png`: lo que quitó `erase.json` (en magenta) y el fotograma como se entrega.
