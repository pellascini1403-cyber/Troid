# Informe de recepción — `cast`

> Lo escribe `npm run assets:intake -- cast`. **Veredicto: aviso.** Se puede aceptar, pero mira primero los avisos en la hoja de contacto.

- **Entrada:** una hoja — `sheet.png`.
- **Escala:** ×1.2377 (por el tamaño de la cabeza: la cabeza gira y el ojo se ve más pequeño o desaparece, así que no mide el tamaño de la pose). Ojo de las poses de la hoja: 17.6 · 16.2 · 33.0 · 16.1 px; mediana 16.9 px. Cabeza de las poses de la hoja (el círculo más grande que cabe en la figura): 45.4 · 45.4 · 45.4 · 44.9 px; mediana 45.4 px → 56.2 px en el lienzo.
- **Fotogramas:** 4 de 4 pedidos, 320 × 230, pivote (160, 192).
- **Lo entregado frente a lo pedido:** las cuatro poses del panel. La bola de energía y su estela que la hoja pinta en las poses 2 y 3 son un efecto: el juego dibuja su proyectil, así que se quitan (erase.json).

| Fotograma | Papel | Fase | Veredicto | Ojo (px) | Cabeza (px) | Halo | Sueltos | Rojo | Salto de masa (m) | Alto × ancho (m) |
|---|---|---|---|---|---|---|---|---|---|---|
| `cast_00` | ready | startup | **correcto** | 21.8 | 56.8 | 0.0 % | 0.00 % | 0.00 % | — | 2.15 × 1.82 |
| `cast_01` | release | active | **correcto** | 20.2 | 56.1 | 0.0 % | 0.00 % | 0.00 % | 0.00 | 2.14 × 2.26 |
| `cast_02` | follow | recovery | **aviso** | 20.0 | 56.0 | 0.0 % | 0.00 % | 0.00 % | 0.01 | 2.12 × 1.94 |
| `cast_03` | settle | recovery | **correcto** | 19.9 | 56.0 | 0.0 % | 0.00 % | 0.00 % | 0.00 | 2.14 × 1.92 |

## Avisos y fallos

- **aviso** · resolution: la imagen entregada es MÁS PEQUEÑA que los fotogramas (la escala es ×1.24): sus píxeles se agrandan y el dibujo se ve borroso — pide una hoja de al menos el doble de tamaño que los fotogramas
- `cast_02` · **aviso** · clipped: FALLO ACEPTADO A PROPÓSITO (waivers.json; el motivo, en el informe) — la figura no cabe en el lienzo de 320 × 230 (se sale: izquierda 0, derecha 20, arriba 0, abajo 0 px): la pose es más grande de lo que admite el clip

## Fallos aceptados a propósito (`waivers.json`)

La herramienta los daba por FALLO; una persona los acepta con el motivo que se lee aquí (el archivo se archiva con la entrega). En las tablas figuran como avisos.

- `cast_02:clipped` — What reaches beyond the right edge of the canvas in the sheet's drawing is the painted energy bolt, which erase.json takes out; the frame as delivered ends with the arm at x = 171 (the margin check still applies)
  - la herramienta decía: la figura no cabe en el lienzo de 320 × 230 (se sale: izquierda 0, derecha 20, arriba 0, abajo 0 px): la pose es más grande de lo que admite el clip

## Píxeles borrados a propósito (`erase.json`)

El dibujo traía efectos pintados dentro de la propia figura (arcos y estelas del tajo), donde el motor pone los suyos. Una persona marcó con polígonos —en píxeles del lienzo, como las anclas— lo que se quita: los píxeles de dentro pasan a transparentes y **nada más cambia** (ningún píxel se mueve, se recolorea ni se rehace). La herramienta se niega a borrar un píxel del cuerpo o un punto de la hoja de la espada. El dibujo entregado sigue archivado sin tocar: quitar `erase.json` y volver a entregar el clip lo devuelve entero. Lo quitado, en magenta, está en `erased.png`.

- `cast_01` — 1241 píxeles, 2 polígonos — The energy bolt painted ahead of the extended arm in the sheet (a ring with a streak of sparks): an effect the game draws as its own projectile, not the character
- `cast_02` — 2231 píxeles, 1 polígono — The energy bolt painted far ahead of the extended arm in the sheet (a ring with a long streak of sparks): an effect the game draws as its own projectile, not the character

## Qué mirar en `contact.png`

1. Fila 1: los dibujos originales del usuario (intactos) y los fotogramas vecinos del juego.
2. Fila 2: cada pose nueva sobre fondo oscuro, con su veredicto.
3. Fila 3: la secuencia nueva a tamaño 1:1 sobre la línea del suelo, contra la de hoy.
4. Fila 4: el tamaño real de juego junto al clip vecino.
5. `erased.png`: lo que quitó `erase.json` (en magenta) y el fotograma como se entrega.
