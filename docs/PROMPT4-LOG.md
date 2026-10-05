# Bitácora del Prompt 4 — migración a 2D + PixiJS y primer vertical slice

> Registro técnico de la ejecución (pasos S0–S11 de [MIGRATION-2D §7](MIGRATION-2D.md)): qué se hizo, qué se midió, qué se desvió y por qué.
> Las decisiones del Prompt 3 están **cerradas** ([ADR-0003](adr/0003-arquitectura-2d-definitiva.md)); aquí solo se documenta su implementación.
> Cifras medidas ✅ en este entorno (Chromium sin GPU: render por software; sirve para comparar, no como cifra absoluta).

## Estado

| Paso | Estado | Commit |
|---|---|---|
| **S0** baseline y etiqueta | ✅ | (ver historial) |
| **S1** spike Pixi | ✅ | (ver historial) |
| **S2** cámara 2D | ✅ | (ver historial) |
| **S3** sprites y animación | ✅ | (ver historial) |
| S4 retirar Three.js | ⬜ | |
| S5 agacharse | ⬜ | |
| S6 combate | ⬜ | |
| S7 VFX | ⬜ | |
| S8 muerte, reaparición, i18n | ⬜ | |
| S9 Ink Slime | ⬜ | |
| S10 sala R1 | ⬜ | |
| S11 E2E, rendimiento, documentación | ⬜ | |

---

## S0 — Baseline

**Punto de partida:** rama `claude/troid-vertical-slice` en `ac74b46` (F5 + documentos del Prompt 3), árbol limpio.

| Comprobación | Resultado ✅ |
|---|---|
| Typecheck (`tsc --noEmit`) | 0 errores |
| Tests | **192/192** en 11 archivos |
| Build de producción | OK en 1.0 s · JS de la app 15.2 KB gz + *chunk* de Three 163.8 KB gz |
| E2E `movement` | OK en dev (3.6 s) y en producción (1.9 s) |
| Escena 3D `movement_test` | **7 *draw calls*, 14 136 triángulos**, ≈ 9.6 fps (render por software) |

**Etiqueta `proto-3d-f5`** (anotada) sobre `ac74b46`: último estado 3D verificado.

> ⚠️ **Limitación del entorno:** el *gateway* de git de esta sesión **rechaza el push de etiquetas** (tanto anotadas como ligeras: «remote end hung up unexpectedly»; los pushes de ramas sí funcionan). La etiqueta existe **en el repositorio local**; para que el baseline quede también anclado en el remoto se publicó la **rama `archive/proto-3d-f5`** apuntando al mismo commit. Para crear la etiqueta remota basta, desde cualquier máquina con permisos: `git push origin ac74b46:refs/tags/proto-3d-f5`.

## Reglas de ejecución que se siguen

- Un commit (o varios) por paso; cada paso termina con typecheck, tests, build y, cuando hay algo visible, E2E y revisión de consola.
- La simulación solo crece: los **40 tests de movimiento** no se modifican; los 192 se conservan salvo la lista explícita de [MIGRATION-2D §4](MIGRATION-2D.md).
- `wip/f6-combat-core` **no se toca** (`b695c98`); lo reutilizado se documenta en S6.
- Sin arte final: el protagonista usa **solo** el *placeholder* abstracto del Prompt 3.


---

## S1 — Spike de PixiJS v8 ✅

**Dependencia añadida:** `pixi.js@^8.22.0` (instalada 8.22.0, la misma del *benchmark* de la auditoría). Única dependencia de runtime nueva.

**Qué existe ahora**
- `presentation/` (pura, 15 tests): `palette.ts` (tokens del GAME-SPEC §3.2), `viewport.ts` (proporción 4:3–21:9, barras, px por metro, resolución = min(DPR, tope)), `worldTransform.ts` (cámara → contenedor del mundo en metros, eje Y invertido en un solo sitio, redondeo a píxel de dispositivo, parallax).
- `render/`: `Renderer2D` (`Application`, `autoStart: false` + `app.render()` manual, resize, DPR, barras), `layers.ts` (grafo de escena de ARCHITECTURE-2D §7.4), `RoomView2D` (*blockout* con borde superior iluminado).
- `assets/proceduralTextures.ts` (gradiente, brillo, chispa generados con canvas: sin dependencia de arte).
- `debug/`: `ColliderOverlay2D` (Graphics, `pixelLine`) y `DrawCallCounter` (envuelve los `draw*` de WebGL como el *benchmark*).
- `app/Game2D.ts` (raíz de composición 2D tras `?view=2d`, con `window.__troid` de la misma forma + `draws`, `view`, `canvas`) y `app/labs/stressLab.ts` (`?view=2d&lab=stress`).
- `camera/camera2d.ts`: valores de partida de la cámara 2D (GAME-SPEC §16); `CameraRig` **no se modificó**.
- E2E: `movement` ahora se ejecuta en las dos vistas (`movement`, `movement-2d`), más `render-2d` (resize, DPR, proporciones) y `stress-2d`.

**Medidas ✅ (Chromium con render por software)**

| Escena | *Draw calls* por frame | Criterio |
|---|---:|---|
| **Estrés**: 800 sprites animados de un atlas + 4 capas de parallax + 1 filtro (`ColorMatrixFilter`) + 240 partículas (`ParticleContainer`, aditivo) | **5** (peor frame 5) | ≤ 60 ✅ |
| Juego 2D en `movement_test` (cielo, terreno, jugador) | **1** | ≤ 60 ✅ |
| (referencia) escena 3D del baseline | 7 | — |

El lote de Pixi v8 agrupa hasta 16 texturas distintas por llamada, por eso las capas de parallax con texturas propias no multiplican las llamadas.

**API de Pixi v8 verificada en este paso ✅** (pasa de ⚠️ a ✅ en ARCHITECTURE-2D §7.12; se sincroniza en S11): `Application.init` con `resolution`, `autoDensity`, `powerPreference`; `renderer.resize(w, h, resolution)`; `Container` (`pivot`, `scale`, `position`, `rotation`, `sortableChildren`; `blendMode: 'add'` en el `ParticleContainer`; la herencia del modo aditivo desde un contenedor normal a sus hijos se comprobará en S7); `Graphics` encadenada (`rect().fill()`, `.stroke({ pixelLine })`, `clear()`); `ParticleContainer`/`Particle` (`dynamicProperties`, `addParticle`, `tint`, `alpha`); `ColorMatrixFilter` sobre un contenedor; texturas desde `canvas`; **sin errores ni avisos de consola**.

**Desviaciones y notas**
- El jugador de este paso es una **caja gris con muesca** (provisional, no es el personaje): S3 lo sustituye por el *placeholder* abstracto del pipeline de sprites.
- La comprobación de resize/DPR/proporciones (que el plan asignaba en parte a S2) se hizo ya aquí porque `viewport` es una función pura; S2 se centra en el comportamiento de la **cámara**.
- `__troid.ready()` es inmediato en 2D (todavía no hay assets que cargar de forma asíncrona).


---

## S2 — Cámara 2D ✅

**Qué existe ahora**
- `render/CameraAdapter2D.ts`: la matemática del `CameraRig` de F4 (seguimiento amortiguado, zona muerta, anticipación, política vertical por suelo, límites, zoom, *shake*) gobernando el contenedor del mundo. **No sabe de Pixi** (recibe un `CameraSink`), así que se prueba en Node. Recibe el aspecto del **área de juego** (4:3–21:9 tras el *clamp* del viewport), de modo que una sala nunca revela más ancho del diseñado.
- `CameraRig`: único cambio, **aditivo** (`pose.shake`: el desplazamiento del *shake* en metros). Los 30 tests del rig siguen intactos; los campos de pose 3D se retiran en S4.
- `Game2D` usa el adaptador (`setRoom`, `snap`, `update`); `window.__troid.state()` expone `camera` (centro y altura visible).
- `viewHeight` = 13.5 m (GAME-SPEC §16); el rig usa los valores de partida de `camera/camera2d.ts` (desplazamiento y +2.3 m, zona muerta ±1.2 × ±1.4, anticipación 3.0 m).

**Tests (15 nuevos en `tests/unit/camera/cameraAdapter2d.test.ts`)**: la vista **no muestra nada fuera de la sala** en 5 tamaños (4:3, 16:9, 19.5:9, 21:9 y 32:9 con barras) recorriendo toda la sala; la altura visible es exactamente `viewHeight` y el ancho sigue la proporción recortada; una sala más pequeña que la vista se centra; la anticipación empuja la vista hacia donde va el jugador (en ambos sentidos); la cámara se queda quieta si el jugador se detiene dentro de la zona muerta; no salta ante un movimiento brusco; `snap()` corta al cambiar de sala; el bloqueo de arena suaviza los límites sin saltos; el zoom mantiene la altura pedida; el *shake* desplaza y se extingue por completo.

**E2E `camera-2d`** (dev y producción): a 844×390 la vista queda recortada contra el muro izquierdo y el jugador por la izquierda del centro; al correr la cámara acompaña (|cámara − jugador| < 3.2 m); contra el muro derecho nunca se ve más allá de la sala; a 21:9 muestra 31.5 m y a 4:3 18 m, ambos dentro de la sala. Capturas revisadas.

**Hallazgo (sin cambios de diseño):** a velocidad de carrera el seguimiento amortiguado + la zona muerta (≈ 1.2 m + 1.7 m de retraso) compensan casi exactamente la anticipación de 3 m, así que el jugador corre cerca del centro de la pantalla; sin anticipación se iría hacia el borde (el test lo mide comparando con anticipación 0). El sesgo hacia donde mira queda dentro de la zona muerta (0.9 m < 1.2 m) y solo actúa con la cámara en movimiento. Son los números de F4/GAME-SPEC §16; se retocan como datos si el *playtest* lo pide.


---

## S3 — Sprites y animación ✅

**Qué existe ahora** (la lógica es pura y se prueba en Node; solo el *binder* y el cargador tocan Pixi)
- `presentation/`: `vocabulary.ts` (estados lógicos, anclas, fases, cadenas de *fallback*; sustituye a `models/vocabulary.ts`, que queda como re-export hasta S4), `actorViewState.ts` (contrato sim → vista, ahora con `phase`/`phaseT`), `SpriteSetDefinition.ts` (clips, anclas, pivote, `artPxPerMeter`), `animation.ts` (`SpriteAnimator`, `resolveClip`, `frameForTime`, `frameForPhase`), `anchors.ts`, `ActorPresenter.ts` (interpola, anima, voltea, parpadea, *flash*; devuelve un `SpritePose` sin tipos de Pixi), `validateSpriteSet.ts` (contrato de assets) y `placeholder.ts` (tabla de poses → definición + anclas + atlas).
- `render/ActorSprite.ts`: aplica el `SpritePose` a dos sprites (cuerpo + superposición aditiva blanca para el *hit flash*, sin filtro) y permite **cambiar el arte en caliente** (`setSpriteSet`) sin tocar el estado de simulación.
- `assets/`: `SpriteAssetManager<T>` (genérico, con referencias y validación al cargar), `spriteLoader.ts` (atlas `procedural:<id>` o archivo `<atlas>.json` + imagen en formato TexturePacker con recorte, que es la ruta del arte final), `placeholderAtlas.ts` (dibujo con canvas).
- `content/`: `placeholders/playerPlaceholder.ts` (62 fotogramas, 15 clips: `idle walk run jump fall land crouch crouchWalk dash attack attack2 attackAir attackCrouch hurt death`), `sprites.ts` (registro). `PlayerDefinition.spriteSetId` convive con `modelId` hasta S4.
- `Game2D` pinta al jugador con `ActorSprite` (la caja gris de S1 desaparece); `Game2D.create` carga el *sprite set* antes de construir el juego, de modo que `__troid.ready()` sigue siendo inmediato. El tiempo de animación sigue al reloj de simulación (congelado en pausa, escalado por `timeScale`).
- `app/labs/spriteLab.ts` (`?lab=sprites`): hoja de contacto con todas las anclas dibujadas, guía de 1.7 m y un actor en vivo; `window.__sprites` para E2E.

**Placeholder (solo abstracto, GAME-SPEC §2).** Cápsula gris-lavanda con muesca blanca de orientación, marcador de mano y línea de hoja; **sin cian, sin rojo, sin silueta de insecto**: no es el protagonista ni compite con él (un test comprueba el croma de sus colores). El juego, el laboratorio y los tests lo usan a través del *mismo* pipeline que usará el arte real, de modo que cambiar de arte es apuntar `PlayerDefinition.spriteSetId` a otra definición.
- Atlas: 1616 × 1072 px (celdas de 202 × 134 px, 56 px/m), ≈ 6.6 MB RGBA en GPU. Cada pose es la única fuente del dibujo **y** de las anclas: la espada nunca se desalinea de lo dibujado.
- **Contrato de espada:** en cada fotograma de ataque existen `hand_r`, `weapon_grip` y `weapon_tip`, con `|grip − hand| ≤ 0.04 m` (el validador lo exige y falla si no).
- **Ataques por fase:** los clips `attack*` declaran `phases` (startup [0,1] · active [2,3] · recovery [4,5]) y el fotograma sale de `phase`/`phaseT` que publicará la simulación, **no del reloj**: el golpe visible coincide siempre con la *hitbox*. No existe *cross-fade* en 2D (corte limpio).

**Tests: +43 (222 → 265)** en `tests/unit/sprites/`:
- **Los 23 tests de `assets.test.ts` están portados** con la misma intención: contrato del asset (4: el set pasa el validador sin avisos, cada estado del jugador tiene su clip, es abstracto y mide 1.7 m, el validador detecta clip/idle/escala), anclas y *sprite* (5: anclas reales por fotograma, *fallbacks* proporcionales, dos instancias independientes, `dispose` idempotente, texturas compartidas intactas), animador (6: arranca en idle, cadena de *fallback*, reinicio de one-shot, ajuste de duración, `finished`/bucles, y el de *cross-fade* sustituido por «el fotograma sale de la fase de simulación»), `ActorSprite` (4: interpolación con Y invertida, volteo instantáneo, reinicio solo con `animSerial`, parpadeo y `visible`) y gestor de assets (4).
- 20 nuevos: anclas espejadas con la orientación; la empuñadura sigue a la mano en cada fase; intercambio de arte en caliente con estado de simulación intacto; las 62 poses caben en su celda; agachado 1.0 m / de pie 1.7 m; determinismo del generador; validación de fases y de `weapon_tip`; carga de atlas JSON con recorte; el gestor registra los errores del validador.
- Los tests del pipeline glTF (3D) **siguen en verde** y se retiran en S4 junto con Three.js.

**E2E (dev y producción):** `sprites-2d` (nuevo: el validador no informa nada, 62 fotogramas, estados → clips, fotogramas de ataque por fase, empuñadura = mano, y **mismo tamaño en pantalla con otra resolución de arte** (56 vs 36 px/m)); `movement-2d` ampliado (el fotograma en pantalla sigue idle/run/jump/dash, el sprite se espeja al girar, el ancla de la espada va delante, y **≤ 60 *draw calls*** en la escena real). Capturas revisadas.

**Desviaciones y notas**
- El *placeholder* pasa por el pipeline real de atlas por fotogramas (no por `ProceduralActor`, que ARCHITECTURE §7.5 sugería para el proxy): así el camino de sustitución de arte queda ejercitado desde ahora. El Ink Slime (S9) sí usará `ProceduralActor`.
- La ruta de atlas **en archivo** (`<atlas>.json` + imagen) está implementada y probada con datos en memoria (incluido el recorte); no se ha ejercitado con un archivo real porque aún no hay arte.
- El laboratorio dibuja ~100 formas de depuración (con `pixelLine`, que rompe el lote) y por eso sus *draw calls* (≈ 126) no son presupuesto; el de la escena de juego se mide en `movement-2d`.
- Los *hooks* `step`/`teleport` actualizan el sprite inmediatamente (los tests leen el estado presentado justo después de avanzar).
