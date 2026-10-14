# Informe de recepción — `crouchAttack`

> Lo escribe `npm run assets:intake -- crouchAttack`. **Veredicto: correcto.** Sin avisos: aun así, mira la hoja de contacto antes de aceptar (lo que no se puede medir —que es el MISMO personaje, que la espada está en la mano derecha, que la acción se lee— lo juzga una persona).

- **Entrada:** una hoja — `sheet.png`.
- **Escala:** ×0.7422 (por el ojo grande). Ojo de las poses de la hoja: 34.6 · 34.4 · 34.1 · 33.5 · 34.1 px; mediana 34.1 px → 25.3 px en el lienzo. Cabeza de las poses de la hoja (el círculo más grande que cabe en la figura): 88.6 · 88.9 · 86.6 · 88.9 · 86.0 px; mediana 88.6 px.
- **Fotogramas:** 5 de 5 pedidos, 280 × 230, pivote (120, 192).
- **Lo entregado frente a lo pedido:** se pedían 6 dibujos a 26 fps; la fila 3 de la Hoja 2 trae CINCO dibujos (no seis), así que el golpe es de cinco fotogramas: salida [0, 1], barrido activo [2, 3] y recuperación [4]; las fases de la simulación (4 + 3 + 9 ticks) no cambian y cada fase tiene tantos fotogramas como ticks admite. Los dibujos 2, 3 y 4 traen el arco cian del barrido dibujado en la propia imagen (el motor pone además el suyo). La figura es más alta y ancha de lo pedido (la espada visible, las antenas y los arcos): límites de tamaño ensanchados a 1.0–2.4 m de alto y 1.2–3.6 m de ancho. El fotograma crouchAttack_01 (el segundo) se corrió 6 px a la derecha con placement.json porque la punta de la espada quedaba a 3 px del borde izquierdo del lienzo (el contrato pide 4).
- **Ajustes de colocación (placement.json):** `crouchAttack_01` dx 6 dy 0.
- pose 2: el recorte dejó fuera 1 pieza(s) suelta(s)
- pose 4: el recorte dejó fuera 3 pieza(s) suelta(s)

| Fotograma | Papel | Fase | Veredicto | Ojo (px) | Cabeza (px) | Halo | Sueltos | Rojo | Salto de masa (m) | Alto × ancho (m) |
|---|---|---|---|---|---|---|---|---|---|---|
| `crouchAttack_00` | from-crouch | startup | **correcto** | 25.8 | 66.1 | 0.6 % | 0.00 % | 0.00 % | — | 2.23 × 2.54 |
| `crouchAttack_01` | sweep-begins | startup | **correcto** | 25.6 | 66.5 | 0.3 % | 0.00 % | 0.00 % | 0.09 | 2.18 × 3.46 |
| `crouchAttack_02` | sweep | active | **correcto** | 25.3 | 64.5 | 0.4 % | 0.00 % | 0.00 % | 0.20 | 2.15 × 3.57 |
| `crouchAttack_03` | sweep-end | active | **correcto** | 24.8 | 66.1 | 0.5 % | 0.00 % | 0.00 % | 0.03 | 2.06 × 3.38 |
| `crouchAttack_04` | settle | recovery | **correcto** | 25.0 | 63.3 | 0.9 % | 0.00 % | 0.00 % | 0.11 | 1.77 × 2.58 |

## Avisos y fallos

Ninguno.

## Qué mirar en `contact.png`

1. Fila 1: los dibujos originales del usuario (intactos) y los fotogramas vecinos del juego.
2. Fila 2: cada pose nueva sobre fondo oscuro, con su veredicto.
3. Fila 3: la secuencia nueva a tamaño 1:1 sobre la línea del suelo, contra la de hoy.
4. Fila 4: el tamaño real de juego junto al clip vecino.
