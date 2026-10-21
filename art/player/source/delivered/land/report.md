# Informe de recepción — `land`

> Lo escribe `npm run assets:intake -- land`. **Veredicto: aviso.** Se puede aceptar, pero mira primero los avisos en la hoja de contacto.

- **Entrada:** una hoja — `sheet.png`.
- **Escala:** ×1.0321 (por el tamaño de la cabeza: la cabeza gira y el ojo se ve más pequeño o desaparece, así que no mide el tamaño de la pose). Ojo de las poses de la hoja: 18.6 px; mediana 18.6 px. Cabeza de las poses de la hoja (el círculo más grande que cabe en la figura): 54.5 px; mediana 54.5 px → 56.2 px en el lienzo.
- **Fotogramas:** 1 de 1 pedidos, 320 × 230, pivote (160, 192).
- **Lo entregado frente a lo pedido:** LECTURA DE LA HOJA, a confirmar: el panel se llama CAÍDA y trae cinco poses; las cuatro primeras caen y la quinta está agachada en el suelo, así que se lee como el aterrizaje. Si no lo es, basta con quitar este clip: el juego dibuja `land` con el idle.

| Fotograma | Papel | Fase | Veredicto | Ojo (px) | Cabeza (px) | Halo | Sueltos | Rojo | Salto de masa (m) | Alto × ancho (m) |
|---|---|---|---|---|---|---|---|---|---|---|
| `land_00` | land | — | **correcto** | 19.0 | 54.8 | 0.0 % | 0.00 % | 0.00 % | — | 1.65 × 2.18 |

## Avisos y fallos

- **aviso** · resolution: la imagen entregada es MÁS PEQUEÑA que los fotogramas (la escala es ×1.03): sus píxeles se agrandan y el dibujo se ve borroso — pide una hoja de al menos el doble de tamaño que los fotogramas

## Qué mirar en `contact.png`

1. Fila 1: los dibujos originales del usuario (intactos) y los fotogramas vecinos del juego.
2. Fila 2: cada pose nueva sobre fondo oscuro, con su veredicto.
3. Fila 3: la secuencia nueva a tamaño 1:1 sobre la línea del suelo, contra la de hoy.
4. Fila 4: el tamaño real de juego junto al clip vecino.
