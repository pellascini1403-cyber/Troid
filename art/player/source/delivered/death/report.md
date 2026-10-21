# Informe de recepción — `death`

> Lo escribe `npm run assets:intake -- death`. **Veredicto: aviso.** Se puede aceptar, pero mira primero los avisos en la hoja de contacto.

- **Entrada:** una hoja — `sheet.png`.
- **Escala:** ×1.3542 (por el tamaño de la cabeza: la cabeza gira y el ojo se ve más pequeño o desaparece, así que no mide el tamaño de la pose). Ojo de las poses de la hoja: 10.5 · — · — px; mediana 10.5 px. Cabeza de las poses de la hoja (el círculo más grande que cabe en la figura): 41.5 · 38.2 · 27.2 px; mediana 41.5 px → 56.2 px en el lienzo.
- **Fotogramas:** 3 de 3 pedidos, 320 × 230, pivote (160, 192).
- **Lo entregado frente a lo pedido:** las tres poses del panel. La escala se lee SOLO de la primera (las otras dos están tumbadas y deshechas: no tienen una cabeza entera que medir). Las gotas que suben sueltas son un efecto y se quitan (erase.json).

| Fotograma | Papel | Fase | Veredicto | Ojo (px) | Cabeza (px) | Halo | Sueltos | Rojo | Salto de masa (m) | Alto × ancho (m) |
|---|---|---|---|---|---|---|---|---|---|---|
| `death_00` | collapse | — | **correcto** | 14.8 | 56.3 | 0.0 % | 0.00 % | 0.00 % | — | 1.32 × 2.48 |
| `death_01` | lying | — | **aviso** | 5.5 | 50.9 | 10.5 % | 0.57 % | 0.00 % | 0.10 | 1.12 × 2.23 |
| `death_02` | still | — | **correcto** | — | 36.6 | 0.0 % | 0.00 % | 0.00 % | 0.15 | 0.68 × 2.11 |

## Avisos y fallos

- **aviso** · resolution: la imagen entregada es MÁS PEQUEÑA que los fotogramas (la escala es ×1.35): sus píxeles se agrandan y el dibujo se ve borroso — pide una hoja de al menos el doble de tamaño que los fotogramas
- `death_01` · **aviso** · edge: 10.5 % del borde suave es gris pálido: un resto del fondo blanco del que se recortó la figura — el recorte no está limpio

## Píxeles borrados a propósito (`erase.json`)

El dibujo traía efectos pintados dentro de la propia figura (arcos y estelas del tajo), donde el motor pone los suyos. Una persona marcó con polígonos —en píxeles del lienzo, como las anclas— lo que se quita: los píxeles de dentro pasan a transparentes y **nada más cambia** (ningún píxel se mueve, se recolorea ni se rehace). La herramienta se niega a borrar un píxel del cuerpo o un punto de la hoja de la espada. El dibujo entregado sigue archivado sin tocar: quitar `erase.json` y volver a entregar el clip lo devuelve entero. Lo quitado, en magenta, está en `erased.png`.

- `death_01` — 371 píxeles, 4 polígonos — The droplets painted rising above the lying figure in the sheet: a dissolve effect, not the character; the embers at the tail of the scarf stay
- `death_02` — 557 píxeles, 4 polígonos — The droplets painted rising above the lying figure in the sheet: a dissolve effect, not the character; the embers at the tail of the scarf stay

## Qué mirar en `contact.png`

1. Fila 1: los dibujos originales del usuario (intactos) y los fotogramas vecinos del juego.
2. Fila 2: cada pose nueva sobre fondo oscuro, con su veredicto.
3. Fila 3: la secuencia nueva a tamaño 1:1 sobre la línea del suelo, contra la de hoy.
4. Fila 4: el tamaño real de juego junto al clip vecino.
5. `erased.png`: lo que quitó `erase.json` (en magenta) y el fotograma como se entrega.
