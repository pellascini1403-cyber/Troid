# Informe de recepción — `drink`

> Lo escribe `npm run assets:intake -- drink`. **Veredicto: aviso.** Se puede aceptar, pero mira primero los avisos en la hoja de contacto.

- **Entrada:** una hoja — `sheet.png`.
- **Escala:** ×0.6596 (por el ojo grande). Ojo de las poses de la hoja: 38.2 · 38.2 · 39.1 · 38.6 px; mediana 38.4 px → 25.3 px en el lienzo. Cabeza de las poses de la hoja (el círculo más grande que cabe en la figura): 91.1 · 90.3 · 92.7 · 93.0 px; mediana 91.9 px.
- **Fotogramas:** 4 de 4 pedidos, 280 × 230, pivote (120, 192).

| Fotograma | Papel | Fase | Veredicto | Ojo (px) | Cabeza (px) | Halo | Sueltos | Rojo | Salto de masa (m) | Alto × ancho (m) |
|---|---|---|---|---|---|---|---|---|---|---|
| `drink_00` | draw | — | **aviso** | 25.1 | 60.5 | 0.9 % | 0.00 % | 0.00 % | — | 2.17 × 2.11 |
| `drink_01` | raise | — | **aviso** | 25.3 | 60.2 | 1.0 % | 0.00 % | 0.00 % | 0.08 | 2.17 × 1.92 |
| `drink_02` | drink | — | **aviso** | 25.7 | 62.1 | 1.6 % | 0.00 % | 0.00 % | 0.04 | 2.09 × 1.94 |
| `drink_03` | refreshed | — | **aviso** | 25.2 | 62.8 | 0.6 % | 0.00 % | 0.00 % | 0.08 | 2.12 × 2.12 |

## Avisos y fallos

- `drink_00` · **aviso** · size-width: la figura mide 2.11 m de ancho; el encargo de este clip dice 0.9–1.9 m
- `drink_01` · **aviso** · size-width: la figura mide 1.92 m de ancho; el encargo de este clip dice 0.9–1.9 m
- `drink_02` · **aviso** · size-width: la figura mide 1.94 m de ancho; el encargo de este clip dice 0.9–1.9 m
- `drink_03` · **aviso** · size-width: la figura mide 2.12 m de ancho; el encargo de este clip dice 0.9–1.9 m

## Qué mirar en `contact.png`

1. Fila 1: los dibujos originales del usuario (intactos) y los fotogramas vecinos del juego.
2. Fila 2: cada pose nueva sobre fondo oscuro, con su veredicto.
3. Fila 3: la secuencia nueva a tamaño 1:1 sobre la línea del suelo, contra la de hoy.
4. Fila 4: el tamaño real de juego junto al clip vecino.
