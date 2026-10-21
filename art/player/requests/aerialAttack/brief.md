# Ataque aéreo — `aerialAttack` (en el encargo: `attackAir`) (grupo F · prioridad 2)

> **Estado: PEDIDO — los dibujos no existen todavía.** Este archivo lo escribe `npm run assets:intake -- kit` a partir de `../requests.json`: no se edita a mano.

## Por qué hace falta

La hoja no trae un tajo en el aire. Hoy el juego dibuja el ataque aéreo con el marcador del motor. Hace falta un tajo EN EL AIRE que se distinga del terrestre: cuerpo suspendido, la hoja bajando en diagonal desde arriba.

## Lo que hay que entregar: 6 dibujos

| # | Archivo final | Papel | Fase del golpe | Qué muestra |
|---|---|---|---|---|
| 0 | `aerialAttack_00.png` | tuck | startup | RECOGIDA. En el aire: las rodillas recogidas, el cuerpo algo encogido, la espada alzada detrás de la cabeza en la mano derecha, la bufanda de fuego hacia arriba. |
| 1 | `aerialAttack_01.png` | wind-up | startup | PREPARACIÓN. El cuerpo arqueado atrás, la espada en lo más alto detrás de la cabeza, las piernas colgando. |
| 2 | `aerialAttack_02.png` | slash-begins | active | EMPIEZA EL TAJO. La hoja bajando por delante. |
| 3 | `aerialAttack_03.png` | slash | active | EL TAJO. La hoja barrida en diagonal hacia abajo, a la altura del pecho, delante, el brazo recto. |
| 4 | `aerialAttack_04.png` | follow-through | recovery | DESPUÉS DEL TAJO. La hoja llevada baja al frente, el cuerpo inclinándose. |
| 5 | `aerialAttack_05.png` | ready-to-land | recovery | LISTO PARA ATERRIZAR. Las piernas estirándose hacia abajo, la espada de vuelta al costado. |

- **Cuánto dura:** lo marcan las fases de la simulación (6 fotogramas).
- **Fases** (índices de fotograma, inclusivos): preparación 0–1 · activa 2–3 · recuperación 4–5.
- **Lo que fija el juego:** Fases de la simulación (no se tocan): 3 de preparación, 4 activos, 9 de recuperación; en el aire la gravedad se reduce al 60 %. La zona de daño: 0.15–1.55 m al frente y 0.3–1.5 m de alto.
- **Colocación:** el cuerpo en el aire: el centro de masa a 1.0 m sobre el pivote (a la altura de la fila 127); el centro del cuerpo (torso y cabeza, sin la espada, las antenas ni la capa) en la columna 120, donde está centrada la caja del jugador. Lo hace la herramienta; si un fotograma queda mal, se corrige con `placement.json` (ver la guía).
- **Espada:** sí, en la mano derecha en TODOS los fotogramas. Cada fotograma necesita dos anclas, la empuñadura (`grip`: donde la mano agarra la hoja) y la punta (`tip`); las lee quien integra sobre la cuadrícula que dibuja la herramienta (`anchors-grid.png`) y las escribe en `art/player/inbox/aerialAttack/anchors.json`.
- **Intención del golpe** (la herramienta lo comprueba con las anclas): el tajo en el aire BAJA: la punta de la hoja baja al menos 0.4 m entre la preparación (alzada detrás de la cabeza) y la fase activa (delante, a la altura del pecho).
- **Tamaño de la figura** (con las antenas): 1.3–3 m de alto y 1.2–3.2 m de ancho a 65 px por metro.
- **Referencias:** El cuerpo está EN EL AIRE: los pies no tocan el suelo en ninguna pose.

## Cómo producirlo

1. Adjunta al generador de imágenes **`art/player/requests/aerialAttack/reference.png`**, **`art/player/requests/character-reference.png`** y **`art/player/source/character-sheet.png`** (la hoja entera del usuario). El generador tiene que ver los dibujos del usuario: sin ellos inventa otro personaje.
2. Pega el **prompt en inglés** de abajo (los generadores lo leen mejor; el gemelo en español está debajo). **Una hoja por clip**: todas las poses en una fila sobre fondo blanco.
3. Guarda lo que salga en **`art/player/inbox/aerialAttack/`**: la hoja entera como `sheet.png`, o un PNG por pose (`aerialAttack_00.png` …, en orden). Solo PNG: si el generador devuelve JPEG o WebP, conviértelo (`magick in.webp out.png`). Si la hoja trae fondo transparente, se usa tal cual; si trae fondo blanco liso, la herramienta lo quita (solo operaciones técnicas, no se pinta nada).
4. `npm run assets:intake -- aerialAttack` recorta las 6 poses, las escala, las coloca y las **comprueba** (transparencia, halos, piezas sueltas, escala, centro de masa, paleta, la espada) y escribe la **hoja de contacto comparativa** en `art/player/inbox/_reports/aerialAttack/contact.png` y la cuadrícula para leer las anclas (`anchors-grid.png`). **Nada se integra solo**: `npm run assets:intake -- aerialAttack --accept`, y solo si no hay ningún fallo y lo aceptado es exactamente lo que enseña la hoja de contacto, lo integra y archiva sus fuentes en `art/player/source/delivered/aerialAttack/`.

## Prompt (copiar y pegar)

```text
Create ONE sprite sheet for a 2D side-scrolling platformer: 6 poses of the SAME existing character, in a single row from left to right in the order given.

THE CHARACTER — copy the attached reference images exactly. It already exists: do NOT redesign, restyle or reinterpret it:
1. A tiny chibi creature that faces right in side view. A big smooth near-black rounded head with two small pointed cat-like ears on top and nothing on its face — no nose, no mouth. The head is about 37% of the whole figure's height (antennae included) and about half of the body's (feet to ear tips).
2. Two huge round glowing eyes: a soft cyan rim, a pale blue-white fill and THREE white highlights each (one large, two small). From the front both are full ovals; from the side the near eye is a full oval and the far one a thin sliver at the edge of the face.
3. Two long, thin, smooth black antennae that rise from the top of the head and curve up, back and outward, ending in a plain rounded tip. Always thin, never thick.
4. A small, simple, near-black body: short rounded arms and legs, rounded black hands and feet, no armour and no clothing other than the scarf; a few very thin glowing cyan lines run along the suit.
5. A scarf-cape of translucent blue fire: saturated sky blue at the neck (#3ba4cf) fading to pale cyan (#71d5f6) and almost white at the tips, with flame-shaped tongues that stream behind the character (to the left when it faces right) and a few small detached embers. It is a drawing of fire, soft and glowing — not cloth, not a cape with seams.
6. The sword, in the poses that have one: a thin, straight, near-black rod (a short blade with a tiny guard), about a fifth to a quarter of the whole figure's height, held in the right hand — the hand nearest the viewer when it faces right; it hangs down and trails behind when the character is not striking.
7. Palette (measured on the sheet): near-black #0b0c0e for the head, body, antennae and sword; sky blue #3ba4cf to pale cyan #71d5f6 for the scarf; cyan #3fa7d2 to #4fd0f5 for the rim and lines; pale blue-white fill and pure white highlights in the eyes only.

STRICT RULES
1. The attached reference sheet is the ONLY source of the character's design. Do not redesign, restyle, humanise, simplify or "improve" it: the same head, ears, eyes, antennae, body, scarf of fire and sword, in the same proportions.
2. Nothing human: no hair, no human face, no mouth or nose, no mask, no clothing besides the scarf, no skin tones, no new accessories, no armour, no extra limbs, no second sword.
3. Render it exactly in the sheet's style: soft, clean cel shading, a near-black silhouette with a hint of rim light, glowing cyan eyes with their white highlights, a soft translucent blue-fire scarf.
4. Side view, facing RIGHT, like the sheet's poses; the whole body inside the picture, nothing cropped.
5. Pure flat white background (#FFFFFF): no gradient, no floor, no ground line, no cast shadow.
6. NO effects of any kind besides the scarf and its embers: no motion lines, no speed streaks, no dust, no sparks, no slash arcs, no energy bolts, no sparkles, no droplets. The game adds its own effects.
7. The poses must read as the SAME character in different moments of one action: the same size of head and eyes in every pose of the sheet (the head is the measure), the same proportions, the same colours.

THIS SHEET: Air attack.
POSES (left to right, ALL at exactly the same scale):
1. TUCK. Airborne: the knees drawn up, the body slightly curled, the sword raised behind the head in the right hand, the scarf of fire streaming up.
2. WIND-UP. The body arched back, the sword at its highest behind the head, the legs trailing.
3. THE SLASH BEGINS. The blade coming down in front.
4. THE SLASH. The blade swept down diagonally to chest height in front, the arm straight.
5. FOLLOW-THROUGH. The blade carried low in front, the body tilting forward.
6. READY TO LAND. The legs reaching down, the sword back to the side.

LAYOUT
1. ONE image only, landscape, containing every pose of the list in a SINGLE ROW, left to right in the order given.
2. Wide empty white gaps between the poses: no pose may touch, overlap or cross another, and none may be cropped by the edge of the image.
3. Every pose at exactly the same scale (the heads must be the same size in all of them) and on the same invisible ground line when the pose stands on the ground.
4. No captions, numbers, arrows, guides or frames.
```

### Prompt negativo (si el generador lo admite)

```text
human, person, hair, human face, mouth, nose, lips, mask, clothes, clothing, armour, armor, skin, extra arms, extra legs, extra swords, two swords, text, letters, watermark, signature, frame, border, background scenery, floor, ground, shadow, motion lines, speed lines, dust, sparks, red, red flames, slash arc, energy bolt, orb, sparkle, droplets, particles, glow trail, realistic, photo, 3d plastic render, thick antennae, different eyes, different head, cloth cape with seams
```

### El mismo prompt en español

```text
Crea UNA hoja de sprites para un juego de plataformas 2D de scroll lateral: 6 poses del MISMO personaje ya existente, en una sola fila de izquierda a derecha y en el orden indicado.

EL PERSONAJE — copia exactamente las imágenes de referencia adjuntas. Ya existe: NO lo rediseñes, no lo restilices ni lo reinterpretes:
1. Una criatura chibi diminuta que mira a la derecha, de perfil. Cabeza grande, lisa, redondeada y casi negra, con dos orejitas puntiagudas de gato arriba y nada en la cara: sin nariz, sin boca. La cabeza mide ≈ 37 % de la altura de toda la figura (con las antenas) y ≈ la mitad de la del cuerpo (de los pies a la punta de las orejas).
2. Dos ojos enormes, redondos y luminosos: borde cian suave, relleno azul pálido-blanco y TRES reflejos blancos cada uno (uno grande, dos pequeños). De frente los dos son óvalos completos; de perfil el cercano es un óvalo completo y el lejano una rendija fina en el borde de la cara.
3. Dos antenas largas, finas y lisas, negras, que salen de lo alto de la cabeza y se curvan hacia arriba, atrás y afuera, acabando en una punta lisa y redondeada. Siempre finas, nunca gruesas.
4. Cuerpo pequeño, sencillo y casi negro: brazos y piernas cortos y redondeados, manos y pies negros y redondeados, sin armadura y sin más ropa que la bufanda; unas pocas líneas cian luminosas muy finas recorren el traje.
5. Una bufanda-capa de fuego azul translúcido: azul cielo saturado en el cuello (#3ba4cf) que se aclara a cian pálido (#71d5f6) y casi blanco en las puntas, con lenguas en forma de llama que se estiran detrás del personaje (a la izquierda cuando mira a la derecha) y unas pocas ascuas sueltas. Es un dibujo de fuego, suave y luminoso: ni tela ni una capa con costuras.
6. La espada, en las poses que la llevan: una varilla fina, recta y casi negra (una hoja corta con una guarda diminuta), de entre una quinta y una cuarta parte de la altura de toda la figura, sostenida por la mano derecha —la más cercana al espectador cuando mira a la derecha—; cuelga hacia abajo y atrás cuando el personaje no golpea.
7. Paleta (medida en la hoja): casi negro #0b0c0e en cabeza, cuerpo, antenas y espada; azul cielo #3ba4cf a cian pálido #71d5f6 en la bufanda; cian #3fa7d2 a #4fd0f5 en el borde y las líneas; relleno azul pálido-blanco y reflejos blancos puros solo en los ojos.

REGLAS ESTRICTAS
1. La hoja de referencia adjunta es la ÚNICA fuente del diseño. No rediseñes, no restilices, no humanices, no simplifiques ni «mejores» nada: la misma cabeza, orejas, ojos, antenas, cuerpo, bufanda de fuego y espada, con las mismas proporciones.
2. Nada humano: ni pelo, ni cara humana, ni boca ni nariz, ni máscara, ni ropa aparte de la bufanda, ni tonos de piel, ni accesorios nuevos, ni armadura, ni extremidades de más, ni una segunda espada.
3. Renderiza exactamente en el estilo de la hoja: sombreado limpio y suave, silueta casi negra con un toque de luz de borde, ojos cian luminosos con sus reflejos blancos, una bufanda de fuego azul translúcido y suave.
4. De perfil, mirando a la DERECHA, como las poses de la hoja; todo el cuerpo dentro de la imagen, sin recortes.
5. Fondo blanco liso (#FFFFFF): sin degradado, sin suelo, sin línea de suelo, sin sombra proyectada.
6. NINGÚN efecto aparte de la bufanda y sus ascuas: ni líneas de movimiento, ni estelas de velocidad, ni polvo, ni chispas, ni arcos de tajo, ni proyectiles de energía, ni destellos, ni gotas. El juego pone después sus propios efectos.
7. Las poses han de leerse como el MISMO personaje en momentos distintos de una acción: mismo tamaño de cabeza y de ojos en todas las poses de la hoja (la cabeza es la medida), mismas proporciones, mismos colores.

ESTA HOJA: Ataque aéreo.
POSES (de izquierda a derecha, TODAS exactamente a la misma escala):
1. RECOGIDA. En el aire: las rodillas recogidas, el cuerpo algo encogido, la espada alzada detrás de la cabeza en la mano derecha, la bufanda de fuego hacia arriba.
2. PREPARACIÓN. El cuerpo arqueado atrás, la espada en lo más alto detrás de la cabeza, las piernas colgando.
3. EMPIEZA EL TAJO. La hoja bajando por delante.
4. EL TAJO. La hoja barrida en diagonal hacia abajo, a la altura del pecho, delante, el brazo recto.
5. DESPUÉS DEL TAJO. La hoja llevada baja al frente, el cuerpo inclinándose.
6. LISTO PARA ATERRIZAR. Las piernas estirándose hacia abajo, la espada de vuelta al costado.

DISPOSICIÓN
1. UNA sola imagen, apaisada, con todas las poses de la lista en UNA SOLA FILA, de izquierda a derecha en el orden dado.
2. Huecos blancos anchos entre las poses: ninguna pose puede tocar, solapar ni cruzar a otra, ni quedar recortada por el borde de la imagen.
3. Todas las poses exactamente a la misma escala (las cabezas del mismo tamaño en todas) y sobre la misma línea de suelo invisible cuando la pose se apoya en el suelo.
4. Sin rótulos, números, flechas, guías ni marcos.
```

## Requisitos técnicos de integración

- **Lienzo final:** 320 × 230 px, PNG RGBA de 8 bits, fondo **transparente**, pivote (160, 192), 65 px de arte por metro, margen ≥ 4 px por todos los lados. La herramienta de recepción lo consigue desde una hoja sobre fondo blanco con **solo operaciones técnicas** (fondo transparente, un único factor de escala por hoja, una traslación): no se pinta nada.
- **Escala:** la herramienta mide la CABEZA de la figura (el círculo más grande que cabe en ella) en cada pose de la hoja y lleva la hoja ENTERA, con un único factor (las poses conservan los tamaños relativos que les dio quien las dibujó), a que su mediana mida 56.2 px de diámetro —lo que miden los fotogramas del clip `idle` del juego, porque es de la misma familia de golpes con espada—. Los paneles de la hoja del usuario no están dibujados a una escala común (la cabeza mide ≈ 56 px en el idle, 54 al caminar, 51 al correr y saltar, 43 en el disparo y el dash, 40 al interactuar y al ser herido): la herramienta lleva cada clip, con un único factor, a la cabeza del idle (el tamaño propio de la hoja, factor 1). Se mide la cabeza y no el ojo porque la cabeza gira y el ojo se ve distinto de un panel a otro. Por eso no importa el tamaño en píxeles de lo que devuelva el generador, pero SÍ que todas las poses de la hoja estén a la misma escala entre sí: la herramienta avisa cuando la cabeza de una pose se aparta más de ±14 % de la mediana de la hoja y la rechaza cuando se aparta más del doble.
- **Nombres:** `<clip>_NN.png` con dos dígitos, desde `00`, sin huecos.
- **Sin efectos, sin sombra, sin suelo**: el juego pinta sus propios efectos sobre la figura (los arcos de los tajos, los proyectiles, los destellos).
- **Mirando a la derecha**: el motor la espeja al mirar a la izquierda.
- **Entrada en el manifiesto** (la escribe la herramienta): `{ "frames": "aerialAttack_", "count": 6, "fps": 26, "loop": false, "tags": ["sword"], "phases": {"startup":[0,1],"active":[2,3],"recovery":[4,5]} }` y las fuentes de la entrega se archivan en `art/player/source/delivered/aerialAttack/`. Con el clip declarado, `npm run assets:missing` deja de contarlo como pendiente y el juego deja de dibujar sus estados con el marcador.

## Antes de darla por buena (lo que comprueba la herramienta y lo que no puede)

- [ ] Transparencia correcta, sin halo claro en el borde ni píxeles sueltos (la herramienta lo mide).
- [ ] Tamaño y centro de masa coherentes con los clips vecinos (la herramienta lo mide).
- [ ] Paleta del personaje: casi negro, azul cielo a cian pálido en la bufanda, cian y blanco en los ojos; ningún otro color (la herramienta lo mide).
- [ ] **Mirando la hoja de contacto**: es el MISMO personaje (los ojos con sus tres reflejos, las orejas, las antenas finas, la cabeza redonda, la bufanda de fuego), sin partes duplicadas ni extremidades imposibles, y la acción se lee a tamaño de juego (lo mira una persona: no se automatiza).
- [ ] **La espada, en la mano derecha, en todos los fotogramas**, la misma varilla fina de la referencia (se comprueba con las anclas dibujadas sobre cada fotograma).
