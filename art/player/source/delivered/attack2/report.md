# Informe de recepción — `attack2`

> Lo escribe `npm run assets:intake -- attack2`. **Veredicto: correcto.** Sin avisos: aun así, mira la hoja de contacto antes de aceptar (lo que no se puede medir —que es el MISMO personaje, que la espada está en la mano derecha, que la acción se lee— lo juzga una persona).

- **Entrada:** un PNG por pose — `attack2_00.png`, `attack2_01.png`, `attack2_02.png`, `attack2_03.png`, `attack2_04.png`.
- **Escala:** ×0.6279 (por el ojo grande). Ojo de las poses de la hoja: 35.8 · 34.2 · 34.7 · 34.4 · 34.0 px; mediana 34.4 px → 21.6 px en el lienzo. Cabeza de las poses de la hoja (el círculo más grande que cabe en la figura): 90.5 · 87.6 · 90.5 · 85.1 · 89.6 px; mediana 89.6 px.
- **Fotogramas:** 5 de 5 pedidos, 280 × 230, pivote (120, 192).
- **Lo entregado frente a lo pedido:** se pedían 7 dibujos a 28 fps; la fila 1 de la Hoja 2 trae CINCO dibujos (no siete), así que el golpe es de cinco fotogramas: salida [0, 1], corte activo [2, 3] y recuperación [4]; las fases de la simulación (3 + 3 + 11 ticks) no cambian y cada fase tiene tantos fotogramas como ticks admite. Los arcos cian de los dibujos 2, 3 y 4 vienen dibujados en la propia imagen y se tocan entre sí: la hoja no se puede cortar sola (cutSheet) y cada pose se recortó a mano, sin reescalar, con un rectángulo (los restos de la vecina que cayeron dentro los descarta el recorte como piezas sueltas). Los arcos de attack2_01 y attack2_02, piezas aparte del cuerpo que el motor ya dibuja por su cuenta, se quitaron después con erase.json (polígonos archivados con la entrega; el dibujo original sigue archivado sin tocar): la figura y la espada no se tocan, y en attack2_03 solo hay un destello difuso pegado a la punta de la hoja de atrás, que es el filo cian de la espada y se deja. El dibujo 4 muestra DOS hojas, una en cada mano: las anclas siguen la de la mano derecha, la de delante. La intención del golpe cambia con los dibujos: se pedía un corte ASCENDENTE (la punta sube ≥ 0.4 m) y el segundo golpe que se dibujó es un tajo hacia delante a ras de suelo (la punta pasa de 1.6 m detrás del pivote a 1.4 m delante), así que la intención pasó de «sube» a «avanza» (≥ 1 m) y el escenario E2E player-anim comprueba eso.
- archivo 2: el recorte dejó fuera 1 pieza(s) suelta(s)
- archivo 3: el recorte dejó fuera 2 pieza(s) suelta(s)
- archivo 4: el recorte dejó fuera 2 pieza(s) suelta(s)

| Fotograma | Papel | Fase | Veredicto | Ojo (px) | Cabeza (px) | Halo | Sueltos | Rojo | Salto de masa (m) | Alto × ancho (m) |
|---|---|---|---|---|---|---|---|---|---|---|
| `attack2_00` | coil | startup | **correcto** | 22.5 | 56.9 | 0.4 % | 0.00 % | 0.00 % | — | 2.05 × 2.31 |
| `attack2_01` | swing-begins | startup | **correcto** | 21.5 | 55.4 | 0.6 % | 0.00 % | 0.00 % | 0.04 | 1.97 × 2.51 |
| `attack2_02` | swing | active | **correcto** | 22.0 | 58.5 | 0.5 % | 0.00 % | 0.00 % | 0.02 | 1.89 × 2.42 |
| `attack2_03` | cut | active | **correcto** | 21.6 | 54.6 | 0.6 % | 0.00 % | 0.00 % | 0.08 | 1.92 × 3.17 |
| `attack2_04` | settle | recovery | **correcto** | 21.5 | 56.8 | 0.5 % | 0.00 % | 0.00 % | 0.11 | 2.05 × 2.22 |

## Avisos y fallos

Ninguno.

## Píxeles borrados a propósito (`erase.json`)

El dibujo traía efectos pintados dentro de la propia figura (arcos y estelas del tajo), donde el motor pone los suyos. Una persona marcó con polígonos —en píxeles del lienzo, como las anclas— lo que se quita: los píxeles de dentro pasan a transparentes y **nada más cambia** (ningún píxel se mueve, se recolorea ni se rehace). La herramienta se niega a borrar un píxel del cuerpo o un punto de la hoja de la espada. El dibujo entregado sigue archivado sin tocar: quitar `erase.json` y volver a entregar el clip lo devuelve entero. Lo quitado, en magenta, está en `erased.png`.

- `attack2_01` — 2948 píxeles, 1 polígono — El arco cian del tajo está pintado en la propia imagen, delante de la figura y como una pieza aparte del cuerpo: es un efecto que dibuja el motor, no la figura. Se quita entero; la figura y la espada no se tocan.
- `attack2_02` — 1548 píxeles, 1 polígono — Los arcos cian del giro están pintados en la propia imagen, delante y debajo de la figura y como una pieza aparte del cuerpo: son un efecto que dibuja el motor, no la figura. Se quitan enteros; la figura y la espada no se tocan.

## Qué mirar en `contact.png`

1. Fila 1: los dibujos originales del usuario (intactos) y los fotogramas vecinos del juego.
2. Fila 2: cada pose nueva sobre fondo oscuro, con su veredicto.
3. Fila 3: la secuencia nueva a tamaño 1:1 sobre la línea del suelo, contra la de hoy.
4. Fila 4: el tamaño real de juego junto al clip vecino.
5. `erased.png`: lo que quitó `erase.json` (en magenta) y el fotograma como se entrega.
