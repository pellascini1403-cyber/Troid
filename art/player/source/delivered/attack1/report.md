# Informe de recepción — `attack1`

> Lo escribe `npm run assets:intake -- attack1`. **Veredicto: aviso.** Se puede aceptar, pero mira primero los avisos en la hoja de contacto.

- **Entrada:** una hoja — `sheet.png`.
- **Escala:** ×1.0706 (por el tamaño de la cabeza: la cabeza gira y el ojo se ve más pequeño o desaparece, así que no mide el tamaño de la pose). Ojo de las poses de la hoja: 19.5 · 18.1 · 19.4 · 18.6 px; mediana 19.0 px. Cabeza de las poses de la hoja (el círculo más grande que cabe en la figura): 52.7 · 51.9 · 56.3 · 52.4 px; mediana 52.5 px → 56.2 px en el lienzo.
- **Fotogramas:** 4 de 4 pedidos, 320 × 230, pivote (160, 192).
- **Lo entregado frente a lo pedido:** las cuatro poses del panel; la preparación [0], activa [1, 2] y la recuperación [3]: las fases de la simulación (4 + 3 + 8 ticks) no cambian. El arco cian que la hoja pinta en la segunda pose es un efecto: el juego dibuja el suyo, así que se quita (erase.json).

| Fotograma | Papel | Fase | Veredicto | Ojo (px) | Cabeza (px) | Halo | Sueltos | Rojo | Salto de masa (m) | Alto × ancho (m) |
|---|---|---|---|---|---|---|---|---|---|---|
| `attack1_00` | wind-up | startup | **correcto** | 20.9 | 56.5 | 0.0 % | 0.00 % | 0.00 % | — | 1.95 × 2.25 |
| `attack1_01` | strike | active | **correcto** | 19.8 | 56.2 | 0.0 % | 0.00 % | 0.00 % | 0.11 | 1.80 × 2.14 |
| `attack1_02` | reach | active | **correcto** | 21.0 | 60.2 | 0.0 % | 0.00 % | 0.00 % | 0.05 | 1.92 × 2.71 |
| `attack1_03` | recover | recovery | **correcto** | 19.9 | 56.2 | 1.3 % | 0.00 % | 0.00 % | 0.08 | 2.03 × 2.00 |

## Avisos y fallos

- **aviso** · resolution: la imagen entregada es MÁS PEQUEÑA que los fotogramas (la escala es ×1.07): sus píxeles se agrandan y el dibujo se ve borroso — pide una hoja de al menos el doble de tamaño que los fotogramas

## Píxeles borrados a propósito (`erase.json`)

El dibujo traía efectos pintados dentro de la propia figura (arcos y estelas del tajo), donde el motor pone los suyos. Una persona marcó con polígonos —en píxeles del lienzo, como las anclas— lo que se quita: los píxeles de dentro pasan a transparentes y **nada más cambia** (ningún píxel se mueve, se recolorea ni se rehace). La herramienta se niega a borrar un píxel del cuerpo o un punto de la hoja de la espada. El dibujo entregado sigue archivado sin tocar: quitar `erase.json` y volver a entregar el clip lo devuelve entero. Lo quitado, en magenta, está en `erased.png`.

- `attack1_01` — 2972 píxeles, 2 polígonos — The slash arc painted beside the figure in the sheet (a long cyan crescent with a second thin one inside it): an effect, not the character; the game draws its own arc from the blow

## Qué mirar en `contact.png`

1. Fila 1: los dibujos originales del usuario (intactos) y los fotogramas vecinos del juego.
2. Fila 2: cada pose nueva sobre fondo oscuro, con su veredicto.
3. Fila 3: la secuencia nueva a tamaño 1:1 sobre la línea del suelo, contra la de hoy.
4. Fila 4: el tamaño real de juego junto al clip vecino.
5. `erased.png`: lo que quitó `erase.json` (en magenta) y el fotograma como se entrega.
