# Informe de recepción — `crouch`

> Lo escribe `npm run assets:intake -- crouch`. **Veredicto: correcto.** Sin avisos: aun así, mira la hoja de contacto antes de aceptar (lo que no se puede medir —que es el MISMO personaje, que la espada está en la mano derecha, que la acción se lee— lo juzga una persona).

- **Entrada:** un PNG por pose — `crouch_00.png`, `crouch_01.png`.
- **Escala:** ×0.5338 (por el ojo grande). Ojo de las poses de la hoja: 47.5 · 47.4 px; mediana 47.5 px → 25.3 px en el lienzo. Cabeza de las poses de la hoja (el círculo más grande que cabe en la figura): 115.6 · 122.9 px; mediana 119.3 px.
- **Fotogramas:** 2 de 2 pedidos, 280 × 230, pivote (120, 192).
- **Lo entregado frente a lo pedido:** se pedían 2 dibujos a 2 fps; la hoja trae CUATRO agachadas (fila 1 de la Hoja 3), no dos: se han tomado la 1 (asentada) y la 4 (la misma agachada con el pecho y la cabeza algo más altos, para respirar), que son las más parecidas entre sí (solapamiento de siluetas 0.71 con la cabeza alineada); la 2 y la 3 (más baja, a rastras) quedan en la hoja sin usar. Los dibujos llevan la espada VISIBLE, baja y atrás (el encargo decía «sin espada»): los límites de tamaño se ensancharon a 0.9–3.0 m de ancho y 1.1–2.1 m de alto.

| Fotograma | Papel | Fase | Veredicto | Ojo (px) | Cabeza (px) | Halo | Sueltos | Rojo | Salto de masa (m) | Alto × ancho (m) |
|---|---|---|---|---|---|---|---|---|---|---|
| `crouch_00` | settle | — | **correcto** | 25.5 | 63.0 | 0.9 % | 0.00 % | 0.00 % | — | 2.02 × 2.48 |
| `crouch_01` | breath | — | **correcto** | 25.5 | 66.6 | 0.3 % | 0.00 % | 0.00 % | 0.04 | 2.03 × 2.40 |

## Avisos y fallos

Ninguno.

## Qué mirar en `contact.png`

1. Fila 1: los dibujos originales del usuario (intactos) y los fotogramas vecinos del juego.
2. Fila 2: cada pose nueva sobre fondo oscuro, con su veredicto.
3. Fila 3: la secuencia nueva a tamaño 1:1 sobre la línea del suelo, contra la de hoy.
4. Fila 4: el tamaño real de juego junto al clip vecino.
