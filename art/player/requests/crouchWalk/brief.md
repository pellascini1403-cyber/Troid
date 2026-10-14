# Gateo (andar agachado) — `crouchWalk` (grupo D · prioridad 2)

> **Estado: PEDIDO — los dibujos no existen todavía.** Este archivo lo escribe `npm run assets:intake -- kit` a partir de `../requests.json`: no se edita a mano.

## Por qué hace falta

Hoy es la agachada del aterrizaje «a pasitos» (deformada): un stand-in. Hace falta un ciclo corto de pasos agachados con las piernas dibujadas.

## Lo que hay que entregar: 4 dibujos

| # | Archivo final | Papel | Fase del golpe | Qué muestra |
|---|---|---|---|---|
| 0 | `crouchWalk_00.png` | contact-A | — | CONTACTO A. Un paso bajo y arrastrado: el pie delantero apenas toca el suelo delante, el trasero detrás con el talón levantado; el torso sigue bajo e inclinado al frente; pasos cortos (los pies nunca a más de una bota de distancia). La misma altura que la agachada mantenida. |
| 1 | `crouchWalk_01.png` | passing-A | — | PASO A. Las piernas juntas bajo el cuerpo, la pierna trasera adelantándose; el torso en lo más alto del ciclo (un 3–4 % más). |
| 2 | `crouchWalk_02.png` | contact-B | — | CONTACTO B. El espejo del contacto A: el OTRO pie delante. |
| 3 | `crouchWalk_03.png` | passing-B | — | PASO B. Las piernas juntas otra vez, la otra pierna adelantándose; el torso en lo más alto. |

- **Cuánto dura:** bucle: 4 fotogramas a 10 fps = 0.40 s por vuelta.
- **Fases:** ninguna (no es un golpe).
- **Lo que fija el juego:** Velocidad agachado 3 m/s. Ciclo de 4 poses a 10 fps = 0.4 s.
- **Colocación:** lo más bajo de la figura (los pies; la hoja de la espada solo si es lo que toca el suelo) en la fila 192, el suelo; el centro del cuerpo (torso y cabeza, sin la espada, las antenas ni la capa) en la columna 120, donde está centrada la caja del jugador. Lo hace la herramienta; si un fotograma queda mal, se corrige con `placement.json` (ver la guía).
- **Espada:** no hace falta ninguna ancla.
- **Tamaño de la figura** (con las antenas): 1.1–1.8 m de alto y 0.9–2.1 m de ancho a 65 px por metro.
- **Referencias:** La altura y el volumen son los de la agachada (clip crouch); las piernas, de un paso corto de la marcha.

## Cómo producirlo

1. Adjunta al generador de imágenes **`art/player/requests/crouchWalk/reference.png`**, **`art/player/requests/character-reference.png`** y **`art/player/source/hero-portrait.jpg`** (el retrato del usuario). El generador tiene que ver los dibujos del usuario: sin ellos inventa otro personaje.
2. Pega el **prompt en inglés** de abajo (los generadores lo leen mejor; el gemelo en español está debajo). **Una hoja por clip**: todas las poses en una fila sobre fondo blanco.
3. Guarda lo que salga en **`art/player/inbox/crouchWalk/`**: la hoja entera como `sheet.png`, o un PNG por pose (`crouchWalk_00.png` …, en orden). Solo PNG: si el generador devuelve JPEG o WebP, conviértelo (`magick in.webp out.png`). Si la hoja trae fondo transparente, se usa tal cual; si trae fondo blanco liso, la herramienta lo quita (solo operaciones técnicas, no se pinta nada).
4. `npm run assets:intake -- crouchWalk` recorta las 4 poses, las escala, las coloca y las **comprueba** (transparencia, halos, piezas sueltas, escala, centro de masa, paleta) y escribe la **hoja de contacto comparativa** en `art/player/inbox/_reports/crouchWalk/contact.png`. **Nada se integra solo**: `npm run assets:intake -- crouchWalk --accept`, y solo si no hay ningún fallo y lo aceptado es exactamente lo que enseña la hoja de contacto, lo integra por el mecanismo `delivered` de `hero.rig.json`.

## Prompt (copiar y pegar)

```text
Create ONE sprite sheet for a 2D side-scrolling platformer: 4 poses of the SAME existing character, in a single row from left to right in the order given.

THE CHARACTER — copy the attached reference images exactly. It already exists: do NOT redesign, restyle or reinterpret it:
1. A tiny chibi creature. A huge near-black dome-shaped head (the head is about 55-60% of the whole figure's height) with a jagged leaf-like crest of three or four sharp points at the top and back, and a smooth featureless face: no nose, no mouth, no human features.
2. Two enormous round glowing eyes: a soft cyan rim and a bright pale-blue fill with THREE white highlights each (one large, two small). Seen in three-quarter view the near eye is a full circle and the far eye a narrow crescent at the edge of the face.
3. Two long, thin, smooth black antennae that rise from the top of the head, curve outward and back and end in a small hook. They are always thin, never thick.
4. A small, slim body in black and dark navy armour: pointed shoulder plates, a chest plate with chevron-shaped panels outlined by thin glowing cyan lines, small dark gauntlet hands, short legs ending in pointed dark boots, and a few leaf-shaped translucent blue panels hanging at the sides of the torso (like short wings).
5. Palette (measured on the real frames): near-black #101010 and dark navy #101030 for most of the figure; steel-blue accents #103050 to #305070; glowing cyan #70d0f0 to #b0f0f0; white #f0f0f0 only in the eye highlights. Tiny dark-red details only where the reference sword has them.
6. The sword, when a pose has one: the SAME long, thin, pointed dark blade as in the reference (about half the height of the figure), with a small darker guard, held by the character's RIGHT hand, which is the hand nearest the viewer when the character faces right.

STRICT RULES
1. The attached images are the ONLY source of the character's design. Do not redesign, restyle, humanise, simplify or 'improve' it.
2. No human features of any kind: no hair, no human face, no mouth or nose, no mask, no clothing, no skin tones, no new accessories, no extra limbs, no second sword.
3. Keep the proportions of the reference: huge head, tiny body, short legs, the same eyes, the same antennae, the same armour details.
4. Render it exactly in the reference's style: soft glossy cel shading, a clean dark silhouette with subtle navy gradients and thin glowing cyan lines.
5. Side view, facing RIGHT, like the reference poses; the whole body inside the picture, nothing cropped.
6. Pure flat white background (#FFFFFF): no gradient, no floor, no ground line, no cast shadow.
7. NO effects of any kind: no motion lines, no speed streaks, no dust, no sparks, no glow trails, no energy arcs, no flames, no slash trails, no particles. The game adds its own cyan effects later. In particular NO RED anywhere except the tiny details the reference sword already has.
8. The poses must read as the SAME character in different moments of one action: same size of head and eyes in every pose of the sheet, same proportions, same colours.

THIS SHEET: Crouch walk.
POSES (left to right, ALL at exactly the same scale):
1. CONTACT A. A low shuffle step: the front foot just touching down ahead, the rear foot behind with the heel lifted; the torso stays low and leaning forward; short steps (the feet never more than about one boot-length apart). Same crouch height as the held crouch.
2. PASSING A. The legs together under the body, the rear leg swinging forward; the torso at the highest point of the cycle (3 to 4% higher).
3. CONTACT B. The mirror of contact A: the OTHER foot forward.
4. PASSING B. The legs together again, the other leg swinging forward; the torso at its highest point.

LAYOUT
1. ONE image only, landscape, containing every pose of the list in a SINGLE ROW, left to right in the order given.
2. Wide empty white gaps between the poses: no pose may touch, overlap or cross another, and none may be cropped by the edge of the image.
3. Every pose at exactly the same scale (the eyes must be the same size in all of them) and on the same invisible ground line when the pose stands on the ground.
4. No captions, numbers, arrows, guides or frames.
```

### Prompt negativo (si el generador lo admite)

```text
human, person, hair, human face, mouth, nose, lips, mask, clothes, clothing, skin, extra arms, extra legs, extra swords, two swords, text, letters, watermark, signature, frame, border, background scenery, floor, ground, shadow, motion lines, speed lines, dust, sparks, red flames, red arc, red slash, red streak, particles, glow trail, realistic, photo, 3d plastic render, thick antennae, different eyes
```

### El mismo prompt en español

```text
Crea UNA hoja de sprites para un juego de plataformas 2D de scroll lateral: 4 poses del MISMO personaje ya existente, en una sola fila de izquierda a derecha y en el orden indicado.

EL PERSONAJE — copia exactamente las imágenes de referencia adjuntas. Ya existe: NO lo rediseñes, no lo restilices ni lo reinterpretes:
1. Una criatura chibi diminuta. Cabeza enorme en forma de cúpula casi negra (≈ 55–60 % de la altura de la figura) con una cresta dentada, como una hoja, de tres o cuatro puntas arriba y atrás, y la cara lisa y sin rasgos: sin nariz, sin boca, nada humano.
2. Dos ojos enormes, redondos y luminosos: borde cian suave y relleno azul pálido con TRES reflejos blancos cada uno (uno grande, dos pequeños). De tres cuartos, el ojo cercano es un círculo y el lejano una media luna estrecha en el borde de la cara.
3. Dos antenas largas, finas y lisas, negras, que salen de lo alto de la cabeza, se curvan hacia fuera y atrás y acaban en un pequeño gancho. Siempre finas, nunca gruesas.
4. Cuerpo pequeño y esbelto, de armadura negra y azul marino: hombreras puntiagudas, peto con paneles en «v» marcados por finas líneas cian luminosas, manoplas pequeñas y oscuras, piernas cortas con botas oscuras puntiagudas y unos paneles azules translúcidos, como hojas, colgando de los costados (como alas cortas).
5. Paleta (medida en los fotogramas reales): casi negro #101010 y azul marino #101030 en casi toda la figura; acentos azul acero #103050 a #305070; cian luminoso #70d0f0 a #b0f0f0; blanco #f0f0f0 solo en los reflejos de los ojos. Detalles rojo oscuro diminutos solo donde los tiene la espada de referencia.
6. La espada, cuando la pose la lleva: LA MISMA hoja larga, fina, puntiaguda y oscura de la referencia (≈ la mitad de la altura de la figura), con una pequeña guarda más oscura, sostenida por la mano DERECHA del personaje: la más cercana al espectador cuando mira a la derecha.

REGLAS ESTRICTAS
1. Las imágenes adjuntas son la ÚNICA fuente del diseño. No rediseñes, no restilices, no humanices, no simplifiques ni «mejores» nada.
2. Nada humano de ningún tipo: ni pelo, ni cara humana, ni boca ni nariz, ni máscara, ni ropa, ni tonos de piel, ni accesorios nuevos, ni extremidades de más, ni una segunda espada.
3. Conserva las proporciones de la referencia: cabeza enorme, cuerpo diminuto, piernas cortas, los mismos ojos, las mismas antenas, los mismos detalles de la armadura.
4. Renderiza exactamente en el estilo de la referencia: sombreado suave y brillante, silueta oscura limpia con degradados azul marino sutiles y finas líneas cian luminosas.
5. De perfil, mirando a la DERECHA, como las poses de referencia; todo el cuerpo dentro de la imagen, sin recortes.
6. Fondo blanco liso (#FFFFFF): sin degradado, sin suelo, sin línea de suelo, sin sombra proyectada.
7. NINGÚN efecto: ni líneas de movimiento, ni estelas de velocidad, ni polvo, ni chispas, ni rastros de brillo, ni arcos de energía, ni llamas, ni estelas del tajo, ni partículas. El juego pone después sus propios efectos cian. En particular NADA DE ROJO, salvo los detalles diminutos que ya tiene la espada de referencia.
8. Las poses han de leerse como el MISMO personaje en momentos distintos de una acción: mismo tamaño de cabeza y de ojos en todas las poses de la hoja, mismas proporciones, mismos colores.

ESTA HOJA: Gateo (andar agachado).
POSES (de izquierda a derecha, TODAS exactamente a la misma escala):
1. CONTACTO A. Un paso bajo y arrastrado: el pie delantero apenas toca el suelo delante, el trasero detrás con el talón levantado; el torso sigue bajo e inclinado al frente; pasos cortos (los pies nunca a más de una bota de distancia). La misma altura que la agachada mantenida.
2. PASO A. Las piernas juntas bajo el cuerpo, la pierna trasera adelantándose; el torso en lo más alto del ciclo (un 3–4 % más).
3. CONTACTO B. El espejo del contacto A: el OTRO pie delante.
4. PASO B. Las piernas juntas otra vez, la otra pierna adelantándose; el torso en lo más alto.

DISPOSICIÓN
1. UNA sola imagen, apaisada, con todas las poses de la lista en UNA SOLA FILA, de izquierda a derecha en el orden dado.
2. Huecos blancos anchos entre las poses: ninguna pose puede tocar, solapar ni cruzar a otra, ni quedar recortada por el borde de la imagen.
3. Todas las poses exactamente a la misma escala (los ojos del mismo tamaño en todas) y sobre la misma línea de suelo invisible cuando la pose se apoya en el suelo.
4. Sin rótulos, números, flechas, guías ni marcos.
```

## Requisitos técnicos de integración

- **Lienzo final:** 280 × 230 px, PNG RGBA de 8 bits, fondo **transparente**, pivote (120, 192), 65 px de arte por metro, margen ≥ 4 px por todos los lados. La herramienta de recepción lo consigue desde una hoja sobre fondo blanco con **solo operaciones técnicas** (fondo transparente, un único factor de escala por hoja, una traslación): no se pinta nada.
- **Escala:** la herramienta mide el ojo grande de la figura en cada pose de la hoja y lleva la hoja ENTERA, con un único factor (las poses conservan los tamaños relativos que les dio quien las dibujó), a que su mediana mida 25.3 px de diámetro —lo que miden los fotogramas del clip `idle` del juego, porque es la misma cabeza que la de la agachada nueva—. Los dibujos del usuario no están a una escala común (el ojo mide 25 px en el idle, 21–22 en los tajos, 19,5 en la agachada), así que no hay una constante: se mide en los fotogramas del juego. Por eso no importa el tamaño en píxeles de lo que devuelva el generador, pero SÍ que todas las poses de la hoja estén a la misma escala entre sí: la herramienta avisa cuando el ojo de una pose se aparta más de ±14 % de la mediana de la hoja y la rechaza cuando se aparta más del doble.
- **Nombres:** `<clip>_NN.png` con dos dígitos, desde `00`, sin huecos.
- **Sin efectos, sin sombra, sin suelo, sin rojo**: el juego pinta sus propios efectos (cian) sobre la figura.
- **Mirando a la derecha**: el motor la espeja al mirar a la izquierda.
- **Entrada en el manifiesto** (la escribe la herramienta): `{ "frames": "crouchWalk_", "count": 4, "fps": 10, "loop": true, "tags": [] }` y se añade `"crouchWalk"` a `delivered` de `art/player/source/hero.rig.json`. Sin la etiqueta `stand-in`: `npm run assets:missing` deja de contarlo como pendiente.

## Antes de darla por buena (lo que comprueba la herramienta y lo que no puede)

- [ ] Transparencia correcta, sin halo claro en el borde ni píxeles sueltos (la herramienta lo mide).
- [ ] Tamaño y centro de masa coherentes con los clips vecinos (la herramienta lo mide).
- [ ] Paleta del personaje: casi negro, azul marino, cian y blanco en los ojos; **ningún rojo de efecto** (la herramienta lo mide).
- [ ] **Mirando la hoja de contacto**: es el MISMO personaje (los ojos con sus tres reflejos, las antenas finas, la cresta, la armadura), sin partes duplicadas ni extremidades imposibles, y la acción se lee a tamaño de juego (lo mira una persona: no se automatiza).
- [ ] Si lleva la espada, es la misma de la referencia y está en la mano derecha.
