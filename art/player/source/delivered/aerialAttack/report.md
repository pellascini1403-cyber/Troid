# Informe de recepción — `aerialAttack`

> Lo escribe `npm run assets:intake -- aerialAttack`. **Veredicto: aviso.** Se puede aceptar, pero mira primero los avisos en la hoja de contacto.

- **Entrada:** una hoja — `sheet.png`.
- **Escala:** ×0.6367 (por el tamaño de la cabeza: la cabeza gira y el ojo se ve más pequeño o desaparece, así que no mide el tamaño de la pose). Ojo de las poses de la hoja: 31.5 · 29.6 · 26.7 · 33.1 · 33.3 · 33.7 px; mediana 32.3 px. Cabeza de las poses de la hoja (el círculo más grande que cabe en la figura): 83.3 · 86.0 · 91.1 · 93.3 · 86.5 · 96.6 px; mediana 88.8 px → 56.5 px en el lienzo.
- **Fotogramas:** 6 de 6 pedidos, 280 × 230, pivote (120, 192).
- **Lo entregado frente a lo pedido:** se pedían 6 dibujos a 26 fps; son los seis dibujos de la fila 2 de la Hoja 2, uno por fotograma y en el orden pedido. La pose 3 (el tajo en picado) lleva dibujada una estela cian que la hace medir 2.95 m de alto: se subió 22 px con placement.json para que la estela cupiera en el lienzo (límite de alto ensanchado a 3.0 m). La pose 6 (la caída) está dibujada SIN espada a la vista: sus anclas son una estimación aceptada a propósito con waivers.json. Las estelas y destellos cian de las poses 3 y 6 vienen en el propio dibujo.
- **Ajustes de colocación (placement.json):** `aerialAttack_02` dx 0 dy -22.
- pose 6: el recorte dejó fuera 4 pieza(s) suelta(s)

| Fotograma | Papel | Fase | Veredicto | Ojo (px) | Cabeza (px) | Halo | Sueltos | Rojo | Salto de masa (m) | Alto × ancho (m) |
|---|---|---|---|---|---|---|---|---|---|---|
| `aerialAttack_00` | tuck | startup | **correcto** | 20.0 | 53.8 | 0.6 % | 0.00 % | 0.00 % | — | 2.09 × 2.08 |
| `aerialAttack_01` | wind-up | startup | **correcto** | 18.8 | 55.8 | 0.8 % | 0.00 % | 0.00 % | 0.01 | 2.34 × 1.78 |
| `aerialAttack_02` | slash-begins | active | **correcto** | 17.0 | 57.1 | 0.2 % | 0.00 % | 0.00 % | 0.29 | 2.95 × 2.14 |
| `aerialAttack_03` | slash | active | **correcto** | 21.2 | 60.0 | 0.3 % | 0.00 % | 0.00 % | 0.30 | 2.09 × 2.18 |
| `aerialAttack_04` | follow-through | recovery | **correcto** | 21.2 | 54.5 | 0.3 % | 0.00 % | 0.00 % | 0.00 | 2.08 × 2.34 |
| `aerialAttack_05` | ready-to-land | recovery | **aviso** | 21.3 | 61.2 | 0.5 % | 0.00 % | 0.00 % | 0.01 | 2.05 × 1.77 |

## Avisos y fallos

- `aerialAttack_05` · **aviso** · sword: FALLO ACEPTADO A PROPÓSITO (waivers.json; el motivo, en el informe) — el ancla de la empuñadura (74, 132) no está sobre la figura
- `aerialAttack_05` · **aviso** · sword: FALLO ACEPTADO A PROPÓSITO (waivers.json; el motivo, en el informe) — el ancla de la punta (17, 168) no está sobre la figura

## Fallos aceptados a propósito (`waivers.json`)

La herramienta los daba por FALLO; una persona los acepta con el motivo que se lee aquí (el archivo se archiva con la entrega). En las tablas figuran como avisos.

- `aerialAttack_05:sword` — La pose de caída (la 6.ª de la fila 2 de la Hoja 2) está dibujada sin espada a la vista, así que no hay punta ni empuñadura que leer; las anclas de este fotograma son una estimación (las del fotograma anterior, desplazadas lo que se mueve la cabeza) y solo sirven para cumplir el contrato del manifiesto: es la fase de recuperación, sin golpe ni efecto anclado.
  - la herramienta decía: el ancla de la empuñadura (74, 132) no está sobre la figura
  - la herramienta decía: el ancla de la punta (17, 168) no está sobre la figura

## Qué mirar en `contact.png`

1. Fila 1: los dibujos originales del usuario (intactos) y los fotogramas vecinos del juego.
2. Fila 2: cada pose nueva sobre fondo oscuro, con su veredicto.
3. Fila 3: la secuencia nueva a tamaño 1:1 sobre la línea del suelo, contra la de hoy.
4. Fila 4: el tamaño real de juego junto al clip vecino.
