# Informe de recepción — `run`

> Lo escribe `npm run assets:intake -- run`. **Veredicto: aviso.** Se puede aceptar, pero mira primero los avisos en la hoja de contacto.

- **Entrada:** una hoja — `sheet.png`.
- **Escala:** ×1.0924 (por el tamaño de la cabeza: la cabeza gira y el ojo se ve más pequeño o desaparece, así que no mide el tamaño de la pose). Ojo de las poses de la hoja: 19.9 · 18.8 · 18.2 · 18.0 · 18.2 px; mediana 18.2 px. Cabeza de las poses de la hoja (el círculo más grande que cabe en la figura): 51.5 · 52.5 · 51.6 · 51.5 · 51.1 px; mediana 51.5 px → 56.2 px en el lienzo.
- **Fotogramas:** 5 de 5 pedidos, 320 × 230, pivote (160, 192).
- **Lo entregado frente a lo pedido:** las cinco poses del panel, en su orden; el ciclo dura 0.4 s como el anterior.

| Fotograma | Papel | Fase | Veredicto | Ojo (px) | Cabeza (px) | Halo | Sueltos | Rojo | Salto de masa (m) | Alto × ancho (m) |
|---|---|---|---|---|---|---|---|---|---|---|
| `run_00` | stride-1 | — | **correcto** | 21.7 | 56.5 | 0.0 % | 0.00 % | 0.00 % | — | 2.05 × 2.09 |
| `run_01` | stride-2 | — | **correcto** | 20.5 | 57.4 | 0.0 % | 0.00 % | 0.00 % | 0.02 | 2.09 × 2.14 |
| `run_02` | stride-3 | — | **correcto** | 19.9 | 57.0 | 0.8 % | 0.00 % | 0.00 % | 0.02 | 2.08 × 2.00 |
| `run_03` | stride-4 | — | **correcto** | 19.9 | 56.5 | 0.0 % | 0.00 % | 0.00 % | 0.04 | 2.15 × 1.95 |
| `run_04` | stride-5 | — | **correcto** | 20.0 | 56.5 | 0.0 % | 0.00 % | 0.00 % | 0.05 | 2.05 × 2.34 |

## Avisos y fallos

- **aviso** · resolution: la imagen entregada es MÁS PEQUEÑA que los fotogramas (la escala es ×1.09): sus píxeles se agrandan y el dibujo se ve borroso — pide una hoja de al menos el doble de tamaño que los fotogramas

## Qué mirar en `contact.png`

1. Fila 1: los dibujos originales del usuario (intactos) y los fotogramas vecinos del juego.
2. Fila 2: cada pose nueva sobre fondo oscuro, con su veredicto.
3. Fila 3: la secuencia nueva a tamaño 1:1 sobre la línea del suelo, contra la de hoy.
4. Fila 4: el tamaño real de juego junto al clip vecino.
