# Informe de recepción — `dash`

> Lo escribe `npm run assets:intake -- dash`. **Veredicto: aviso.** Se puede aceptar, pero mira primero los avisos en la hoja de contacto.

- **Entrada:** una hoja — `sheet.png`.
- **Escala:** ×0.5336 (por el ojo grande). Ojo de las poses de la hoja: 42.7 · 43.4 · 43.2 px; mediana 43.2 px → 23.1 px en el lienzo. Cabeza de las poses de la hoja (el círculo más grande que cabe en la figura): 102.6 · 100.0 · 106.2 px; mediana 102.6 px.
- **Fotogramas:** 3 de 3 pedidos, 280 × 230, pivote (120, 192).
- **Ajustes de colocación (placement.json):** `dash_00` dx 3 dy 0, `dash_01` dx 8 dy 0.

| Fotograma | Papel | Fase | Veredicto | Ojo (px) | Cabeza (px) | Halo | Sueltos | Rojo | Salto de masa (m) | Alto × ancho (m) |
|---|---|---|---|---|---|---|---|---|---|---|
| `dash_00` | launch | — | **aviso** | 22.8 | 55.4 | 0.5 % | 0.00 % | 0.00 % | — | 1.69 × 2.77 |
| `dash_01` | stretch | — | **aviso** | 23.3 | 53.9 | 0.0 % | 0.00 % | 0.00 % | 0.18 | 1.49 × 2.94 |
| `dash_02` | brake | — | **correcto** | 23.1 | 57.8 | 0.2 % | 0.00 % | 0.00 % | 0.27 | 1.83 × 2.32 |

## Avisos y fallos

- `dash_00` · **aviso** · size-width: la figura mide 2.77 m de ancho; el encargo de este clip dice 1.3–2.7 m
- `dash_01` · **aviso** · size-width: la figura mide 2.94 m de ancho; el encargo de este clip dice 1.3–2.7 m

## Qué mirar en `contact.png`

1. Fila 1: los dibujos originales del usuario (intactos) y los fotogramas vecinos del juego.
2. Fila 2: cada pose nueva sobre fondo oscuro, con su veredicto.
3. Fila 3: la secuencia nueva a tamaño 1:1 sobre la línea del suelo, contra la de hoy.
4. Fila 4: el tamaño real de juego junto al clip vecino.
