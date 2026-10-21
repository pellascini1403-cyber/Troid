# Informe de recepción — `fall`

> Lo escribe `npm run assets:intake -- fall`. **Veredicto: aviso.** Se puede aceptar, pero mira primero los avisos en la hoja de contacto.

- **Entrada:** una hoja — `sheet.png`.
- **Escala:** ×1.0235 (por el tamaño de la cabeza: la cabeza gira y el ojo se ve más pequeño o desaparece, así que no mide el tamaño de la pose). Ojo de las poses de la hoja: 18.6 · 18.7 · 18.2 · 18.1 px; mediana 18.4 px. Cabeza de las poses de la hoja (el círculo más grande que cabe en la figura): 55.4 · 56.1 · 54.5 · 53.5 px; mediana 55.0 px → 56.2 px en el lienzo.
- **Fotogramas:** 4 de 4 pedidos, 320 × 230, pivote (160, 192).
- **Lo entregado frente a lo pedido:** las poses 1 a 4 del panel CAÍDA; la quinta, que toca el suelo, es el aterrizaje (clip land).

| Fotograma | Papel | Fase | Veredicto | Ojo (px) | Cabeza (px) | Halo | Sueltos | Rojo | Salto de masa (m) | Alto × ancho (m) |
|---|---|---|---|---|---|---|---|---|---|---|
| `fall_00` | fall-1 | — | **correcto** | 19.1 | 57.0 | 0.0 % | 0.00 % | 0.00 % | — | 2.34 × 1.37 |
| `fall_01` | fall-2 | — | **correcto** | 18.9 | 56.9 | 0.0 % | 1.11 % | 0.00 % | 0.00 | 2.63 × 1.31 |
| `fall_02` | fall-3 | — | **correcto** | 18.5 | 56.5 | 0.0 % | 0.00 % | 0.00 % | 0.01 | 2.52 × 1.25 |
| `fall_03` | fall-4 | — | **correcto** | 18.7 | 55.1 | 2.3 % | 0.00 % | 0.00 % | 0.01 | 2.43 × 1.32 |

## Avisos y fallos

- **aviso** · resolution: la imagen entregada es MÁS PEQUEÑA que los fotogramas (la escala es ×1.02): sus píxeles se agrandan y el dibujo se ve borroso — pide una hoja de al menos el doble de tamaño que los fotogramas

## Qué mirar en `contact.png`

1. Fila 1: los dibujos originales del usuario (intactos) y los fotogramas vecinos del juego.
2. Fila 2: cada pose nueva sobre fondo oscuro, con su veredicto.
3. Fila 3: la secuencia nueva a tamaño 1:1 sobre la línea del suelo, contra la de hoy.
4. Fila 4: el tamaño real de juego junto al clip vecino.
