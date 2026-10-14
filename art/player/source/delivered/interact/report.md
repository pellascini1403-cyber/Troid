# Informe de recepción — `interact`

> Lo escribe `npm run assets:intake -- interact`. **Veredicto: aviso.** Se puede aceptar, pero mira primero los avisos en la hoja de contacto.

- **Entrada:** una hoja — `sheet.png`.
- **Escala:** ×0.6794 (por el ojo grande). Ojo de las poses de la hoja: 37.6 · 37.3 · 36.7 px; mediana 37.3 px → 25.3 px en el lienzo. Cabeza de las poses de la hoja (el círculo más grande que cabe en la figura): 92.4 · 95.3 · 88.9 px; mediana 92.4 px.
- **Fotogramas:** 3 de 3 pedidos, 280 × 230, pivote (120, 192).

| Fotograma | Papel | Fase | Veredicto | Ojo (px) | Cabeza (px) | Halo | Sueltos | Rojo | Salto de masa (m) | Alto × ancho (m) |
|---|---|---|---|---|---|---|---|---|---|---|
| `interact_00` | lean | — | **aviso** | 25.6 | 64.2 | 0.9 % | 0.00 % | 0.00 % | — | 2.18 × 2.40 |
| `interact_01` | touch | — | **aviso** | 25.3 | 65.8 | 0.3 % | 0.00 % | 0.00 % | 0.02 | 2.14 × 2.45 |
| `interact_02` | withdraw | — | **correcto** | 25.0 | 61.7 | 1.3 % | 0.00 % | 0.00 % | 0.02 | 2.18 × 2.02 |

## Avisos y fallos

- `interact_00` · **aviso** · size-width: la figura mide 2.40 m de ancho; el encargo de este clip dice 1–2.2 m
- `interact_01` · **aviso** · size-width: la figura mide 2.45 m de ancho; el encargo de este clip dice 1–2.2 m

## Qué mirar en `contact.png`

1. Fila 1: los dibujos originales del usuario (intactos) y los fotogramas vecinos del juego.
2. Fila 2: cada pose nueva sobre fondo oscuro, con su veredicto.
3. Fila 3: la secuencia nueva a tamaño 1:1 sobre la línea del suelo, contra la de hoy.
4. Fila 4: el tamaño real de juego junto al clip vecino.
