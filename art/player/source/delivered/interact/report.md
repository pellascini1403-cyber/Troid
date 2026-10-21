# Informe de recepción — `interact`

> Lo escribe `npm run assets:intake -- interact`. **Veredicto: aviso.** Se puede aceptar, pero mira primero los avisos en la hoja de contacto.

- **Entrada:** una hoja — `sheet.png`.
- **Escala:** ×1.3804 (por el tamaño de la cabeza: la cabeza gira y el ojo se ve más pequeño o desaparece, así que no mide el tamaño de la pose). Ojo de las poses de la hoja: 14.4 · 15.3 · 15.5 · 14.4 px; mediana 14.8 px. Cabeza de las poses de la hoja (el círculo más grande que cabe en la figura): 41.0 · 41.0 · 40.5 · 39.8 px; mediana 40.7 px → 56.2 px en el lienzo.
- **Fotogramas:** 4 de 4 pedidos, 320 × 230, pivote (160, 192).
- **Lo entregado frente a lo pedido:** las cuatro poses del panel. Los destellos en forma de rombo que la hoja pinta delante de la mano son un efecto: se quitan (erase.json).

| Fotograma | Papel | Fase | Veredicto | Ojo (px) | Cabeza (px) | Halo | Sueltos | Rojo | Salto de masa (m) | Alto × ancho (m) |
|---|---|---|---|---|---|---|---|---|---|---|
| `interact_00` | reach-1 | — | **correcto** | 19.6 | 56.0 | 0.0 % | 0.00 % | 0.00 % | — | 2.12 × 1.86 |
| `interact_01` | reach-2 | — | **correcto** | 19.8 | 56.8 | 0.0 % | 0.00 % | 0.00 % | 0.01 | 2.15 × 1.83 |
| `interact_02` | reach-3 | — | **correcto** | 19.6 | 55.4 | 0.0 % | 0.00 % | 0.00 % | 0.00 | 2.17 × 1.66 |
| `interact_03` | withdraw | — | **correcto** | 19.6 | 54.9 | 0.0 % | 0.00 % | 0.00 % | 0.00 | 2.17 × 1.66 |

## Avisos y fallos

- **aviso** · resolution: la imagen entregada es MÁS PEQUEÑA que los fotogramas (la escala es ×1.38): sus píxeles se agrandan y el dibujo se ve borroso — pide una hoja de al menos el doble de tamaño que los fotogramas

## Píxeles borrados a propósito (`erase.json`)

El dibujo traía efectos pintados dentro de la propia figura (arcos y estelas del tajo), donde el motor pone los suyos. Una persona marcó con polígonos —en píxeles del lienzo, como las anclas— lo que se quita: los píxeles de dentro pasan a transparentes y **nada más cambia** (ningún píxel se mueve, se recolorea ni se rehace). La herramienta se niega a borrar un píxel del cuerpo o un punto de la hoja de la espada. El dibujo entregado sigue archivado sin tocar: quitar `erase.json` y volver a entregar el clip lo devuelve entero. Lo quitado, en magenta, está en `erased.png`.

- `interact_00` — 1121 píxeles, 1 polígono — The diamond-shaped sparkle painted ahead of the reaching hand in the sheet: an effect, not the character; the game draws its own interaction glow
- `interact_01` — 975 píxeles, 1 polígono — The diamond-shaped sparkle painted ahead of the reaching hand in the sheet: an effect, not the character; the game draws its own interaction glow
- `interact_02` — 1015 píxeles, 1 polígono — The diamond-shaped sparkle painted ahead of the reaching hand in the sheet: an effect, not the character; the game draws its own interaction glow

## Qué mirar en `contact.png`

1. Fila 1: los dibujos originales del usuario (intactos) y los fotogramas vecinos del juego.
2. Fila 2: cada pose nueva sobre fondo oscuro, con su veredicto.
3. Fila 3: la secuencia nueva a tamaño 1:1 sobre la línea del suelo, contra la de hoy.
4. Fila 4: el tamaño real de juego junto al clip vecino.
5. `erased.png`: lo que quitó `erase.json` (en magenta) y el fotograma como se entrega.
