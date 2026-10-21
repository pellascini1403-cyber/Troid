# Informe de recepción — `jump`

> Lo escribe `npm run assets:intake -- jump`. **Veredicto: aviso.** Se puede aceptar, pero mira primero los avisos en la hoja de contacto.

- **Entrada:** una hoja — `sheet.png`.
- **Escala:** ×1.0782 (por el tamaño de la cabeza: la cabeza gira y el ojo se ve más pequeño o desaparece, así que no mide el tamaño de la pose). Ojo de las poses de la hoja: 18.7 · 19.1 · 19.0 · 19.5 px; mediana 19.1 px. Cabeza de las poses de la hoja (el círculo más grande que cabe en la figura): 50.0 · 52.4 · 51.9 · 52.8 px; mediana 52.2 px → 56.2 px en el lienzo.
- **Fotogramas:** 4 de 4 pedidos, 320 × 230, pivote (160, 192).
- **Lo entregado frente a lo pedido:** las cuatro poses del panel, en su orden; el cuerpo en el aire (el centro de masa del cuerpo 1.0 m sobre el pivote).

| Fotograma | Papel | Fase | Veredicto | Ojo (px) | Cabeza (px) | Halo | Sueltos | Rojo | Salto de masa (m) | Alto × ancho (m) |
|---|---|---|---|---|---|---|---|---|---|---|
| `jump_00` | take-off | — | **correcto** | 19.9 | 54.5 | 0.0 % | 0.00 % | 0.00 % | — | 1.75 × 2.32 |
| `jump_01` | rise | — | **correcto** | 20.4 | 56.3 | 0.1 % | 0.00 % | 0.00 % | 0.00 | 1.98 × 1.85 |
| `jump_02` | apex | — | **correcto** | 20.6 | 55.8 | 0.0 % | 0.00 % | 0.00 % | 0.00 | 2.11 × 2.05 |
| `jump_03` | top-turn | — | **correcto** | 21.2 | 56.8 | 0.2 % | 1.04 % | 0.00 % | 0.00 | 2.03 × 2.14 |

## Avisos y fallos

- **aviso** · resolution: la imagen entregada es MÁS PEQUEÑA que los fotogramas (la escala es ×1.08): sus píxeles se agrandan y el dibujo se ve borroso — pide una hoja de al menos el doble de tamaño que los fotogramas

## Qué mirar en `contact.png`

1. Fila 1: los dibujos originales del usuario (intactos) y los fotogramas vecinos del juego.
2. Fila 2: cada pose nueva sobre fondo oscuro, con su veredicto.
3. Fila 3: la secuencia nueva a tamaño 1:1 sobre la línea del suelo, contra la de hoy.
4. Fila 4: el tamaño real de juego junto al clip vecino.
