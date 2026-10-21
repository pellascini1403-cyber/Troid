# Informe de recepción — `hurt`

> Lo escribe `npm run assets:intake -- hurt`. **Veredicto: aviso.** Se puede aceptar, pero mira primero los avisos en la hoja de contacto.

- **Entrada:** una hoja — `sheet.png`.
- **Escala:** ×1.4099 (por el tamaño de la cabeza: la cabeza gira y el ojo se ve más pequeño o desaparece, así que no mide el tamaño de la pose). Ojo de las poses de la hoja: 13.2 · 16.9 · 12.2 px; mediana 13.2 px. Cabeza de las poses de la hoja (el círculo más grande que cabe en la figura): 38.9 · 39.9 · 40.9 px; mediana 39.9 px → 56.2 px en el lienzo.
- **Fotogramas:** 3 de 3 pedidos, 320 × 230, pivote (160, 192).
- **Lo entregado frente a lo pedido:** las tres poses del panel. Las gotas cian sueltas que la hoja pinta lejos del cuerpo son un efecto: se quitan (erase.json); las ascuas pegadas a la bufanda se quedan.

| Fotograma | Papel | Fase | Veredicto | Ojo (px) | Cabeza (px) | Halo | Sueltos | Rojo | Salto de masa (m) | Alto × ancho (m) |
|---|---|---|---|---|---|---|---|---|---|---|
| `hurt_00` | recoil | — | **correcto** | 18.7 | 54.3 | 1.6 % | 0.00 % | 0.00 % | — | 2.18 × 1.80 |
| `hurt_01` | thrown | — | **correcto** | 23.9 | 56.0 | 0.0 % | 0.00 % | 0.00 % | 0.10 | 2.23 × 1.97 |
| `hurt_02` | knocked-back | — | **correcto** | 17.4 | 57.8 | 0.4 % | 0.00 % | 0.00 % | 0.26 | 1.97 × 2.12 |

## Avisos y fallos

- **aviso** · resolution: la imagen entregada es MÁS PEQUEÑA que los fotogramas (la escala es ×1.41): sus píxeles se agrandan y el dibujo se ve borroso — pide una hoja de al menos el doble de tamaño que los fotogramas

## Píxeles borrados a propósito (`erase.json`)

El dibujo traía efectos pintados dentro de la propia figura (arcos y estelas del tajo), donde el motor pone los suyos. Una persona marcó con polígonos —en píxeles del lienzo, como las anclas— lo que se quita: los píxeles de dentro pasan a transparentes y **nada más cambia** (ningún píxel se mueve, se recolorea ni se rehace). La herramienta se niega a borrar un píxel del cuerpo o un punto de la hoja de la espada. El dibujo entregado sigue archivado sin tocar: quitar `erase.json` y volver a entregar el clip lo devuelve entero. Lo quitado, en magenta, está en `erased.png`.

- `hurt_00` — 208 píxeles, 2 polígonos — The droplets painted flying off to the right of the head in the sheet: a hit effect, not the character; the embers at the tail of the scarf stay
- `hurt_02` — 648 píxeles, 6 polígonos — The droplets painted flying around the head in the sheet: a hit effect, not the character; the embers at the tail of the scarf stay

## Qué mirar en `contact.png`

1. Fila 1: los dibujos originales del usuario (intactos) y los fotogramas vecinos del juego.
2. Fila 2: cada pose nueva sobre fondo oscuro, con su veredicto.
3. Fila 3: la secuencia nueva a tamaño 1:1 sobre la línea del suelo, contra la de hoy.
4. Fila 4: el tamaño real de juego junto al clip vecino.
5. `erased.png`: lo que quitó `erase.json` (en magenta) y el fotograma como se entrega.
