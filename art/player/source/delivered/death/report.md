# Informe de recepción — `death`

> Lo escribe `npm run assets:intake -- death`. **Veredicto: correcto.** Sin avisos: aun así, mira la hoja de contacto antes de aceptar (lo que no se puede medir —que es el MISMO personaje, que la espada está en la mano derecha, que la acción se lee— lo juzga una persona).

- **Entrada:** una hoja — `sheet.png`.
- **Escala:** ×0.5528 (por el tamaño de la cabeza: la cabeza gira y el ojo se ve más pequeño o desaparece, así que no mide el tamaño de la pose). Ojo de las poses de la hoja: 41.6 · 35.0 · 31.2 · 24.3 · 25.8 px; mediana 31.2 px. Cabeza de las poses de la hoja (el círculo más grande que cabe en la figura): 96.8 · 93.6 · 93.9 · 84.5 · 84.5 px; mediana 93.6 px → 51.8 px en el lienzo.
- **Fotogramas:** 5 de 5 pedidos, 280 × 230, pivote (120, 192).

| Fotograma | Papel | Fase | Veredicto | Ojo (px) | Cabeza (px) | Halo | Sueltos | Rojo | Salto de masa (m) | Alto × ancho (m) |
|---|---|---|---|---|---|---|---|---|---|---|
| `death_00` | struck | — | **correcto** | 22.9 | 54.9 | 0.9 % | 0.00 % | 0.00 % | — | 1.92 × 1.92 |
| `death_01` | knocked-back | — | **correcto** | 19.3 | 51.9 | 0.7 % | 0.00 % | 0.00 % | 0.37 | 1.45 × 1.88 |
| `death_02` | falling | — | **correcto** | 17.0 | 52.8 | 0.4 % | 0.00 % | 0.00 % | 0.11 | 1.22 × 2.52 |
| `death_03` | impact | — | **correcto** | 13.6 | 46.5 | 0.0 % | 0.00 % | 0.00 % | 0.15 | 0.95 × 2.31 |
| `death_04` | lying | — | **correcto** | 14.4 | 47.0 | 0.0 % | 0.00 % | 0.00 % | 0.01 | 0.97 × 2.22 |

## Avisos y fallos

Ninguno.

## Qué mirar en `contact.png`

1. Fila 1: los dibujos originales del usuario (intactos) y los fotogramas vecinos del juego.
2. Fila 2: cada pose nueva sobre fondo oscuro, con su veredicto.
3. Fila 3: la secuencia nueva a tamaño 1:1 sobre la línea del suelo, contra la de hoy.
4. Fila 4: el tamaño real de juego junto al clip vecino.
