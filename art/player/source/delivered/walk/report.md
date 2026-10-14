# Informe de recepción — `walk`

> Lo escribe `npm run assets:intake -- walk`. **Veredicto: correcto.** Sin avisos: aun así, mira la hoja de contacto antes de aceptar (lo que no se puede medir —que es el MISMO personaje, que la espada está en la mano derecha, que la acción se lee— lo juzga una persona).

- **Entrada:** una hoja — `sheet.png`.
- **Escala:** ×0.6245 (por el ojo grande). Ojo de las poses de la hoja: 40.2 · 39.7 · 40.9 · 41.1 px; mediana 40.6 px → 25.3 px en el lienzo. Cabeza de las poses de la hoja (el círculo más grande que cabe en la figura): 102.1 · 101.4 · 104.2 · 102.3 px; mediana 102.2 px.
- **Fotogramas:** 4 de 4 pedidos, 280 × 230, pivote (120, 192).
- **Lo entregado frente a lo pedido:** se pedían 6 dibujos a 12 fps; la hoja trae 4 poses de marcha (no 6), así que el ciclo es de 4 dibujos a 8 fps: dura 0.5 s, lo mismo que las 6 poses a 12 fps que se pedían. La espada va baja y atrás, como se pedía, y los límites de tamaño no cambian.

| Fotograma | Papel | Fase | Veredicto | Ojo (px) | Cabeza (px) | Halo | Sueltos | Rojo | Salto de masa (m) | Alto × ancho (m) |
|---|---|---|---|---|---|---|---|---|---|---|
| `walk_00` | passing | — | **correcto** | 25.4 | 64.3 | 0.5 % | 0.00 % | 0.00 % | — | 2.38 × 2.03 |
| `walk_01` | stride-A | — | **correcto** | 24.9 | 64.3 | 1.2 % | 0.00 % | 0.00 % | 0.06 | 2.31 × 2.00 |
| `walk_02` | stride-B | — | **correcto** | 25.5 | 65.6 | 0.5 % | 0.00 % | 0.00 % | 0.05 | 2.37 × 2.11 |
| `walk_03` | stride-C | — | **correcto** | 25.8 | 64.2 | 0.9 % | 0.00 % | 0.00 % | 0.01 | 2.32 × 2.05 |

## Avisos y fallos

Ninguno.

## Qué mirar en `contact.png`

1. Fila 1: los dibujos originales del usuario (intactos) y los fotogramas vecinos del juego.
2. Fila 2: cada pose nueva sobre fondo oscuro, con su veredicto.
3. Fila 3: la secuencia nueva a tamaño 1:1 sobre la línea del suelo, contra la de hoy.
4. Fila 4: el tamaño real de juego junto al clip vecino.
