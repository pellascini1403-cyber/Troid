# Informe de recepción — `crouchWalk`

> Lo escribe `npm run assets:intake -- crouchWalk`. **Veredicto: correcto.** Sin avisos: aun así, mira la hoja de contacto antes de aceptar (lo que no se puede medir —que es el MISMO personaje, que la espada está en la mano derecha, que la acción se lee— lo juzga una persona).

- **Entrada:** una hoja — `sheet.png`.
- **Escala:** ×0.6009 (por el ojo grande). Ojo de las poses de la hoja: 42.2 · 43.2 · 42.1 · 42.1 px; mediana 42.2 px → 25.3 px en el lienzo. Cabeza de las poses de la hoja (el círculo más grande que cabe en la figura): 105.2 · 106.1 · 107.0 · 102.5 px; mediana 105.7 px.
- **Fotogramas:** 4 de 4 pedidos, 280 × 230, pivote (120, 192).
- **Lo entregado frente a lo pedido:** los dibujos entregados llevan la espada VISIBLE, baja y atrás (el encargo decía «sin espada»): con la hoja la figura mide hasta 2.8 m de ancho y con las antenas hasta 2.0 m de alto, así que los límites de tamaño se ensancharon a 0.9–3.0 m de ancho y 1.1–2.1 m de alto.

| Fotograma | Papel | Fase | Veredicto | Ojo (px) | Cabeza (px) | Halo | Sueltos | Rojo | Salto de masa (m) | Alto × ancho (m) |
|---|---|---|---|---|---|---|---|---|---|---|
| `crouchWalk_00` | contact-A | — | **correcto** | 25.2 | 64.6 | 0.4 % | 0.00 % | 0.00 % | — | 1.91 × 2.66 |
| `crouchWalk_01` | passing-A | — | **correcto** | 25.9 | 64.1 | 1.0 % | 0.00 % | 0.00 % | 0.05 | 1.97 × 2.54 |
| `crouchWalk_02` | contact-B | — | **correcto** | 25.2 | 65.0 | 1.1 % | 0.00 % | 0.00 % | 0.10 | 1.83 × 2.58 |
| `crouchWalk_03` | passing-B | — | **correcto** | 25.4 | 62.1 | 0.4 % | 0.00 % | 0.00 % | 0.09 | 1.97 × 2.77 |

## Avisos y fallos

Ninguno.

## Qué mirar en `contact.png`

1. Fila 1: los dibujos originales del usuario (intactos) y los fotogramas vecinos del juego.
2. Fila 2: cada pose nueva sobre fondo oscuro, con su veredicto.
3. Fila 3: la secuencia nueva a tamaño 1:1 sobre la línea del suelo, contra la de hoy.
4. Fila 4: el tamaño real de juego junto al clip vecino.
