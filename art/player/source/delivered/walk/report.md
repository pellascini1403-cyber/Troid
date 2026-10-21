# Informe de recepción — `walk`

> Lo escribe `npm run assets:intake -- walk`. **Veredicto: aviso.** Se puede aceptar, pero mira primero los avisos en la hoja de contacto.

- **Entrada:** una hoja — `sheet.png`.
- **Escala:** ×1.0283 (por el tamaño de la cabeza: la cabeza gira y el ojo se ve más pequeño o desaparece, así que no mide el tamaño de la pose). Ojo de las poses de la hoja: 22.2 · 22.2 · 22.3 · 22.1 · 22.0 · 21.9 px; mediana 22.1 px. Cabeza de las poses de la hoja (el círculo más grande que cabe en la figura): 54.4 · 54.9 · 55.5 · 54.9 · 54.4 · 54.5 px; mediana 54.7 px → 56.2 px en el lienzo.
- **Fotogramas:** 6 de 6 pedidos, 320 × 230, pivote (160, 192).
- **Lo entregado frente a lo pedido:** las seis poses del panel, en su orden; el ciclo dura 0.5 s como el anterior.

| Fotograma | Papel | Fase | Veredicto | Ojo (px) | Cabeza (px) | Halo | Sueltos | Rojo | Salto de masa (m) | Alto × ancho (m) |
|---|---|---|---|---|---|---|---|---|---|---|
| `walk_00` | step-1 | — | **correcto** | 22.8 | 56.3 | 0.0 % | 0.00 % | 0.00 % | — | 2.32 × 1.98 |
| `walk_01` | step-2 | — | **correcto** | 22.9 | 56.2 | 0.0 % | 0.00 % | 0.00 % | 0.00 | 2.35 × 1.72 |
| `walk_02` | step-3 | — | **correcto** | 23.1 | 57.1 | 0.0 % | 0.00 % | 0.00 % | 0.00 | 2.38 × 1.77 |
| `walk_03` | step-4 | — | **correcto** | 22.7 | 56.8 | 0.0 % | 0.00 % | 0.00 % | 0.02 | 2.32 × 1.72 |
| `walk_04` | step-5 | — | **correcto** | 22.6 | 55.8 | 1.3 % | 0.00 % | 0.00 % | 0.04 | 2.37 × 1.80 |
| `walk_05` | step-6 | — | **correcto** | 22.6 | 56.8 | 0.1 % | 0.00 % | 0.00 % | 0.03 | 2.37 × 1.78 |

## Avisos y fallos

- **aviso** · resolution: la imagen entregada es MÁS PEQUEÑA que los fotogramas (la escala es ×1.03): sus píxeles se agrandan y el dibujo se ve borroso — pide una hoja de al menos el doble de tamaño que los fotogramas

## Qué mirar en `contact.png`

1. Fila 1: los dibujos originales del usuario (intactos) y los fotogramas vecinos del juego.
2. Fila 2: cada pose nueva sobre fondo oscuro, con su veredicto.
3. Fila 3: la secuencia nueva a tamaño 1:1 sobre la línea del suelo, contra la de hoy.
4. Fila 4: el tamaño real de juego junto al clip vecino.
