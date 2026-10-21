# Informe de recepción — `idle`

> Lo escribe `npm run assets:intake -- idle`. **Veredicto: correcto.** Sin avisos: aun así, mira la hoja de contacto antes de aceptar (lo que no se puede medir —que es el MISMO personaje, que la espada está en la mano derecha, que la acción se lee— lo juzga una persona).

- **Entrada:** una hoja — `sheet.png`.
- **Escala:** ×1.0000 (dada con --scale). Ojo de las poses de la hoja: 22.7 · 22.9 px; mediana 22.8 px → 22.8 px en el lienzo. Cabeza de las poses de la hoja (el círculo más grande que cabe en la figura): 56.0 · 56.5 px; mediana 56.2 px.
- **Fotogramas:** 2 de 2 pedidos, 320 × 230, pivote (160, 192).
- **Lo entregado frente a lo pedido:** el panel IDLE / DESCANSO trae SEIS poses, pero solo dos son de perfil mirando a la derecha (5 y 6); las otras cuatro son al personaje dándose la vuelta (de frente, de frente girado, tres cuartos mirando a la izquierda y de espaldas): vistas que el juego no enseña nunca (el héroe se ve siempre de lado y el motor lo espeja). El bucle del idle son esas dos poses (el diseño anterior tenía 8 fotogramas).

| Fotograma | Papel | Fase | Veredicto | Ojo (px) | Cabeza (px) | Halo | Sueltos | Rojo | Salto de masa (m) | Alto × ancho (m) |
|---|---|---|---|---|---|---|---|---|---|---|
| `idle_00` | rest-A | — | **correcto** | 22.7 | 56.0 | 0.0 % | 0.00 % | 0.00 % | — | 2.29 × 1.97 |
| `idle_01` | rest-B | — | **correcto** | 22.9 | 56.5 | 0.0 % | 0.00 % | 0.00 % | 0.05 | 2.29 × 1.68 |

## Avisos y fallos

Ninguno.

## Qué mirar en `contact.png`

1. Fila 1: los dibujos originales del usuario (intactos) y los fotogramas vecinos del juego.
2. Fila 2: cada pose nueva sobre fondo oscuro, con su veredicto.
3. Fila 3: la secuencia nueva a tamaño 1:1 sobre la línea del suelo, contra la de hoy.
4. Fila 4: el tamaño real de juego junto al clip vecino.
