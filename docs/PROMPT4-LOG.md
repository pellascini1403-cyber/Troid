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
| **S4** retirar Three.js | ✅ | (ver historial) |
| **S5** agacharse | ✅ | (ver historial) |
| **S6** combate | ✅ | (ver historial) |
| **S7** VFX | ✅ | (ver historial) |
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


---

## S4 — Retirar Three.js ✅

**Puerta de salida cumplida:** `grep -rn "from 'three"` en `src/`, `tests/` y `tools/` está **vacío** (solo queda la cadena `'three'` dentro de la regla del test de arquitectura que lo prohíbe); `three` y `@types/three` ya no están en `package.json` ni en `package-lock.json`; la única dependencia de runtime es `pixi.js`.

**Borrado (todo sigue en el *tag* `proto-3d-f5` / rama `archive/proto-3d-f5`):**
- Vista 3D: `app/Game.ts`, `render/{SunRig,createRenderer,dispose}.ts`, `render/materials/{outline,toon}.ts`, `world/view/RoomBlockout.ts`, `player/PlayerVisual.ts`, `camera/CameraView.ts`, `debug/ColliderOverlay.ts`.
- Pipeline glTF: `assets/{ActorVisual,AnimationController,AssetManager,CharacterModel,validateModel}.ts`, `models/` (`ModelDefinition`, `vocabulary` → ya vive en `presentation/`), `content/models.ts`, `public/assets/models/mannequin.glb`, `tools/gen/` (generador de modelos) y el script `gen:models`.
- Laboratorios 3D: `app/labs/{modelLab,cameraLab}.ts`.
- Tests: `tests/unit/assets/assets.test.ts` (los **23 ya estaban portados en S3**) y `tests/helpers/loadGlb.ts`.
- Re-exports transitorios de S3: `gameplay/actorViewState.ts` (los imports apuntan a `presentation/`), `models/vocabulary.ts`. `PlayerDefinition.modelId` desaparece (queda `spriteSetId`).

**Modificado**
- `app/main.ts`: la vista 2D es **la** vista (`?view=2d` ya no hace falta; se ignora); rutas `?lab=sprites` y `?lab=stress`.
- `camera/CameraRig.ts`: sin pose 3D (`position`, `lookAt`, `projection`, `fovDeg`, `distance`; config `projection`, `fovDeg`, `pitchDeg`, `swayDeg`, `near`, `far`; `distanceForView`). Queda lo que usa la vista 2D: `center`, `viewHeight`, `viewHalfWidth`, `shake`, `rollRad`. La matemática de seguimiento, zona muerta, anticipación, política vertical, límites, zoom y *shake* **no cambia**.
- `app/options.ts`: `?cam/fov/pitch` desaparecen; `?vh=` se conserva.
- `vite.config.ts`: `optimizeDeps` pre-empaqueta `pixi.js` en vez de `three`.
- Escenarios E2E: sin variante 3D; `movement-2d` → `movement`, `render-2d` → `render`, `camera-2d` → `camera`, `sprites-2d` → `sprites`, `stress-2d` → `stress`.
- `?lab=sprites&set=<id>` muestra cualquier *sprite set* registrado.

**Test de arquitectura (16 → 19):** módulos puros actualizados (`models` fuera; `abilities`, `interaction`, `i18n` declarados para los pasos siguientes), «puros no importan `pixi.js`», **`three` prohibido en todo `src/`**, `presentation/` e `i18n/` solo importan `core/`, `ui/` no importa `pixi.js` ni `render/` y `render/vfx/assets` no importan `ui/`. Sin cambios: `core` aislado, solo `app/`/`content/` importan `content/`, los 11 patrones de determinismo.

**Tests: 265 → 242** — −23 (assets 3D, portados en S3), −4 y +1 en `cameraRig` (30 → 27: se retiran *pitch*, proyección ortográfica, *sway* y «distancia para cualquier FOV» porque ese comportamiento ya no existe; se añade «la pose informa exactamente `viewHeight`», cuyo equivalente de render ya lo cubren `worldTransform`/`viewport`/`cameraAdapter2d`; el de *shake* se adapta a `pose.shake`), +3 en `architecture`. **Los 40 de movimiento no se tocaron** (`git status tests/integration` limpio) y siguen verdes.

**Tamaño del bundle ✅** (build de producción, gzip de todos los `.js`)

| | Antes (S3) | Después (S4) |
|---|---:|---:|
| JS total | 377.6 KB (39 archivos) | **211.0 KB** (30 archivos) |
| *Chunk* de Three (`createRenderer`) | 156.7 KB | — |
| `dist/` completo (con *sourcemaps*) | 7.9 MB | 3.7 MB |

**E2E (dev y producción): 5/5** (`movement`, `render`, `camera`, `sprites`, `stress`), **sin ningún aviso de consola** (desaparece el `THREE.WebGLShadowMap` del prototipo).

**Docs:** [replace-sprites.md](guides/replace-sprites.md) (guía de *sprite sets*, sucesora de la de glTF, que queda con banner de obsoleta) y README actualizado. Los documentos históricos (`ARCHITECTURE.md`, `ART_DIRECTION.md`, `AUDIT`, ADR-0001/0002) se conservan.


---

## S5 — Agacharse ✅ (solo entrada PC; el táctil es del Prompt 5)

Agacharse es un **estado con consecuencias de colisión** ([GAME-SPEC §6](GAME-SPEC-2D.md)), no una animación.

| Regla del spec | Implementación | Verificado |
|---|---|---|
| Cuerpo 1.7 m → **1.0 m** (mismo ancho) | `MovementTuning.crouch.height`; `PlayerController.setCrouched` cambia `body.height` con los pies fijos | test + E2E (`bodyHeight`) |
| Hurtbox 1.55 m → **0.9 m** (los golpes a la cabeza fallan) | `PlayerDefinition.body.hurtbox` (como en el WIP) + `Player.hurtbox()` según la postura | test: un golpe a 1.2–1.5 m acierta de pie y **falla agachado**; la hurtbox siempre cabe en el cuerpo |
| Velocidad agachado **3.0 m/s** | tope `crouch.speed` sobre las aceleraciones de suelo (un gesto leve sigue siendo más lento) | test + E2E (vx = 3.00) |
| Entrada `move.y ≤ −0.6`, salida `≥ −0.4` | histéresis en `updateFree` | test (−0.5 no entra; −0.45 no sale; −0.4 sale) |
| Espacio para levantarse; **agachado forzado** bajo techo | `CollisionWorld.hasRoom(body, standHeight)` | test + E2E: soltar `S` bajo el techo **mantiene** el agachado hasta salir |
| **Dash agachado** (el cuerpo mantiene la altura y el deslizamiento sigue bajo el pasaje) | la postura es una propiedad del cuerpo, independiente del estado `dash`; al acabar vuelve a `crouch` y se levanta cuando se permite | test (altura 1.0 durante todo el dash; queda agachado bajo techo; se levanta al salir) + E2E |
| Salto desde agachado **solo con espacio**; sobre *one-way*, agachado + salto = atravesar | `canLeaveCrouch()`; la rama de atravesar sigue siendo la existente | test (sin espacio no hay salto; con espacio, de pie; *one-way* se atraviesa también desde el agachado) |
| La cámara no se mueve | el objetivo es la posición de los **pies** | E2E (`camera.y` constante) |

**Diseño.** `PlayerStateId` gana `crouch`; `free` y `crouch` comparten una sola rutina (`updateFree(crouching)`), de modo que **la lógica de movimiento, salto y gravedad no se duplicó ni se tocó**: solo se añadió el tope de velocidad, las salidas de postura y la condición «hay espacio» al salto. El único cambio de `MovementTuning` es el bloque `crouch` (los valores existentes están intactos).

**Desviaciones y notas**
- El spec pedía comprobar el espacio con `overlapsSolid` sobre el rectángulo de pie. `hasRoom` usa `overlapsSolid` pero **solo sobre la franja que queda encima del cuerpo actual**: es equivalente (lo ocupado no puede colisionar) y no se deja engañar por el ruido de punto flotante en los pies.
- Un dash agachado usa la animación **`crouchWalk` rápida** (no `dash`): la pose estirada del placeholder sobresaldría del techo bajo. Es una decisión del placeholder; el arte final decidirá si añade un clip de deslizamiento.
- `content/rooms/crouchTest.ts` (`?room=crouch_test`): sandbox con pasajes de 1.2 m y 1.4 m (los extremos del rango de GAME-SPEC §6). `movement_test` **no se tocó** (su túnel de 2.1 m no exige agacharse). El primer pasaje «solo agachado» del juego es el de la sala R1 (S10).

**Tests: +29 (242 → 271)** en `tests/integration/crouch.test.ts` (archivo nuevo): postura e histéresis (9), techos bajos (5: cabe de lado a lado, agachado forzado, sin salto sin espacio, 1.4/1.0/0.95 m, *one-way* no bloquea), dash (5), hurtbox (3), reset, **determinismo** (traza tick a tick idéntica), **fuzz de 2000 ticks sin quedar nunca dentro de un sólido**, animación (1) y `hasRoom` (3).
**Puerta de regresión: los 40 tests de `movement.test.ts` no se modificaron** (`git status` limpio) y pasan.

**E2E `crouch` (dev y producción, 6/6 en total):** `S` agacha (1.7 → 1.0, sprite `crouch_`), cámara quieta, caminar agachado a 3.0 m/s (`crouchWalk_`), pasaje de 1.2 m, agachado forzado al soltar `S` bajo el techo, sale y se levanta; de pie queda bloqueado por el pasaje de 1.4 m; dash agachado con cuerpo 1.0 m; ≤ 60 *draw calls*. Capturas revisadas.


---

## S6 — Combate ✅ (rescate de `wip/f6-combat-core`)

**La rama WIP sigue intacta** (`b695c98`, local y en `origin`; verificado al terminar el paso). No se hizo `cherry-pick` ni `checkout` sobre archivos existentes: los archivos **nuevos** se copiaron con `git show wip/f6-combat-core:<ruta>` y los **compartidos** (que la rama principal ya había cambiado desde F5) se fusionaron a mano.

| Archivo del WIP | Qué se hizo | Por qué |
|---|---|---|
| `combat/AttackDefinition.ts` | copiado; import de `AnimState` → `presentation/vocabulary`; **sin `energyOnHit`** | la magia/energía es del Prompt 5 |
| `combat/Combatant.ts` · `Health.ts` · `hitboxGeometry.ts` | copiados **sin cambios** | |
| `combat/CombatSystem.ts` | copiado; campo no usado eliminado; el bus pasa por una interfaz mínima `CombatBus` (TypeScript no unifica el `emit` condicional de dos catálogos); + `activeHitboxes` y `all` para el overlay de depuración | |
| `combat/Resource.ts` | **no rescatado** | barra de energía sin regeneración: la sustituye `Magic` (P5); no se empieza un sistema reservado |
| `gameplay/SimEntity.ts` | copiado + gancho opcional `onSpawn(sim)` | el alta en sistemas (combate) ocurre al entrar en el mundo |
| `gameplay/SimServices.ts` · `events.ts` · `Actor.ts` | fusionados a mano (`combat`, `player: PlayerTarget`, `godMode`, `spawn/despawn`, `requestHitStop`; eventos de combate, `player:attacked/hurt/died`, ciclo de vida de entidades; `Team` desde `combat/`). Sin `player:energy` | |
| `player/PlayerCombat.ts` | adaptado: sin energía; `begin('ground'｜'air'｜'crouch')`; `peekPhase()`; `progress()` (fase + progreso 0..1 para el sprite); `shortenRecovery()`; el hitbox enviado es una copia | variante agachada, animación por fases |
| `player/PlayerDefinition.ts` | fusionado (bloque `combat` con **ticks**, `crouchAttack`, `hurt.deathHitStop`) + `body.hurtbox` | |
| `PlayerController` (borrador) | **no recuperable** (no se guardó): se escribió de nuevo contra los tests; `free`/`crouch`/`dash` no cambiaron | |

**Qué hay ahora**
- `GameSession`: orden del tick de ARCHITECTURE §5.1 (puerta de hit-stop → jugador → entidades → combate → flujos → vaciado de entidades → *scheduler*); **hit-stop real**: el mundo se congela, `now` no avanza y los **pulsos de entrada se guardan** (`latch`) para el primer tick tras el congelamiento (los *held* y el stick son los actuales); altas y bajas de entidades diferidas al final del tick; `loadRoom` elimina entidades y combatientes (sin fugas).
- `Player` es `Combatant`: `hurtbox()` (1.55 m de pie / 0.9 m agachado), `receiveHit`, `revive()`. **La vista se publica en el momento del golpe** (pose `hurt`, destello, parpadeo), porque el golpe ocurre después de publicarla y el hit-stop congela los ticks siguientes.
- `PlayerController`: estados `attack`, `hurt`, `dead` (prioridad dead > hurt > dash > attack > crouch > free). Ataques `slash_1` (4/3/8) → `slash_2` (3/3/11) encadenados por la ventana 8–15, `air_slash` (3/4/9, gravedad ×0.6, el aterrizaje acorta la recuperación), `crouch_slash` (4/3/9, se queda agachado). El **dash cancela la recuperación**, nunca *startup* ni *active*. Golpe recibido: −1 vida, empuje (5.5, 4), aturdimiento 14 ticks, **i-frames 60 ticks** con parpadeo, hit-stop 6, destello; vida 0 → `dead` (hit-stop 8, animación `death`, ignora el input hasta `revive()` + `respawn()`; el flujo completo es S8).
- Los datos de ataque están en `content/attacks.ts` (tabla de GAME-SPEC §7.2); `PLAYER.combat` en `content/player.ts`.
- `enemies/TrainingDummy.ts` (SimEntity + Combatant que no ataca) para probar el combate de punta a punta; sirve de modelo para el Ink Slime (S9).
- Vista: `EntityViews` (una vista por entidad, dirigida por `entity:spawned/despawned`) + `DummyView`; el impacto sacude la cámara (tiempo real); la animación se congela durante el hit-stop; el overlay de depuración (`` ` `` → colliders) dibuja cuerpos (verde), **hurtboxes (azul)** y **hitboxes activos (magenta)**; acciones de depuración `spawn dummy`, `heal`, `revive`.

**Notas de comportamiento (medidas)**
- Un ataque dura 16 *updates* (15 ticks de fases + 1 de gracia en el que aún puede encadenarse: es lo que hace que la ventana «8–15» del spec sea inclusiva). `slash_1` pulsado en el tick *n*: arranque *n+1…n+4*, activo 3 ticks, recuperación 8; el hitbox se envía **solo** en los 3 ticks activos.
- `slash_1 → slash_2` conecta sobre un blanco quieto a 1.4 m (se midió: el empuje de 5 m/s lo mueve ≈ 0.2 m antes de que `slash_2` esté activo, por el congelamiento).

**Tests: +65 (271 → 336)**
- `tests/unit/combat/` (21): `Health` (5), `hitboxGeometry` (3, espejo), `CombatSystem` (13: **hit-once**, equipos, **neutrales** golpeables por el jugador y no por enemigos, `hits` explícito, invulnerables y muertos sin consumir el golpe, `ignored`, **primera hurtbox y multiplicador**, bordes que solo se tocan, **hit-stop = el más largo**, `onConfirm`, retirada de combatientes, determinismo).
- `tests/integration/combat.test.ts` (44, archivo nuevo): línea de tiempo del ataque (hitbox solo en los 3 ticks activos, fase y progreso publicados, espejo a la izquierda, avance), **hit-once**, daño, **knockback** (espejado), alcance direccional, eventos, muerte del blanco, **hit-stop** (el reloj no avanza, la animación por fase se congela sola, **un pulso durante el congelamiento no se pierde**, solo las *aristas* se recuerdan), **cadena** (ventana, demasiado pronto, tras terminar, sin tercer golpe, el segundo golpe es otra instancia), ataque **aéreo** y **agachado** (hitbox bajo: falla a un blanco alto), **dash cancela solo la recuperación**, recibir daño (empuje, aturdimiento, **i-frames**, destello, **dash esquiva**, agachado esquiva golpes a la cabeza, interrumpe un ataque, `godMode`), **muerte** (evento una vez, hit-stop 8, input ignorado, no se vuelve a golpear, revivir), entidades (alta/baja al final del tick, sin fugas al recargar la sala) y **determinismo bit a bit** de una pelea con 700 ticks de entradas pseudoaleatorias.
- **Los 40 de movimiento y los 29 de agacharse no se modificaron** y pasan.

**E2E `combat` (dev y producción, 7/7 en total):** con `J`: el ataque corre por fases y el fotograma en pantalla sigue la fase (`attack_00…03`); un golpe, empuje, **el reloj de simulación se congela** y la cámara tiembla; cadena a `slash_2` (`attack2_`); ataque aéreo (`attackAir_`) y agachado (`attackCrouch_`, cuerpo 1.0 m); golpe recibido (`hurt_`, destello, parpadeo, i-frames ignoran el segundo golpe); muerte (`death_`, ignora el input) y `revive`. ≤ 60 *draw calls*. Capturas revisadas.

**Desviaciones y notas**
- En el E2E la animación temporal no avanza (el juego está en pausa para poder avanzar tick a tick): por eso la captura de la muerte muestra el primer fotograma de `death`; en juego real el clip corre.
- El *placeholder* sigue siendo el de S3; los VFX del tajo, del impacto y del daño son **S7**.


---

## S7 — VFX ✅ (slash, impacto, daño, dash, muerte; negro / blanco / cian; con *pooling*)

**Qué hay**
- `presentation/vfx.ts` (**puro**): `VfxDefinition` (`particles` · `arc` · `flash`; el rastro del dash es un `flash` con `spacing`), ranuras de paleta (`energy`, `enemy`, `accent`, `neutral` → colores por *rol* `core/hot/deep/ink`, nunca hex), emisor determinista con un `Rng` inyectado (`initParticle`, `stepParticle`, curvas de tamaño y alfa), geometría del arco (`arcPose`: encaja en el hitbox del ataque y se espeja con la orientación) y los presupuestos por perfil (**150 / 300 / 400** partículas, 24 / 40 / 64 sprites).
- `content/vfx.ts`: **16 efectos como datos** y la tabla `VFX_BINDINGS` (trigger → efectos). El color del héroe es **cian con núcleo blanco**; la energía enemiga, violeta; la tinta, **negra**. El acento cálido (`accent`) queda **apagado por defecto** (cae a cian) y solo lo pide el remate de la cadena (`slash_arc_finisher`); `?accent=1` en el laboratorio lo enciende para compararlo.
- `assets/vfxAtlas.ts`: **un solo atlas procedural en blanco** (8 formas: brillo, chispa, esquirla, anillo, polvo, tinta, estela, **arco/media luna**); el color sale de la ranura en tiempo de ejecución, así que el mismo efecto sirve al héroe y a los enemigos.
- `vfx/VfxSystem.ts`: dos `ParticleContainer` (aditivo y normal: la tinta negra no puede ser aditiva) y sprites con *pool*; **gobernador de presupuesto** (al llenarse, se descartan primero las partículas de menor `priority`; si aun así no cabe, la ráfaga se recorta o se descarta y se cuenta); corre en **tiempo real** (se le da `dt`, nunca ticks), de modo que **un hit-stop no congela las chispas**; el azar es el de la vista, **no** el `Rng` de la simulación.
- `vfx/VfxDirector.ts`: escucha el bus y levanta *triggers* (`slash`, `slashFinisher`, `hitLanded`, `playerHurt`, `dashStart`, `dashDust`, `dashTrail`, `enemyDied`, `playerDied`); un golpe que cae sobre el jugador **no** levanta el impacto genérico (lo hace `player:hurt`: sin efectos dobles); el rastro del dash se pinta por **distancia recorrida** (cada 0.45 m), no por tiempo: continuo a cualquier frame rate.
- Simulación: **nuevo evento `player:attackActive`** (primer tick activo del ataque, con el `rect` del hitbox) del que cuelga el tajo: el arco **es** la zona que golpea, así que nunca se desalinea de lo que daña.
- `render/layers.ts`: capa `fxNormal` (mezcla normal) bajo `fxWorld` (aditiva). Laboratorio `?lab=vfx` (cada trigger por el director real; `?manual=1` para fotogramas exactos, `?vh=` para acercar, `?tier=`, `?accent=1`).

**Qué se ve** (capturas revisadas en el laboratorio y en el juego): tajo en media luna con halo, cuerpo cian y núcleo blanco, con un barrido distinto por ataque (el abridor baja, el remate sube, el agachado es plano); impacto con chispas cian/blancas + destello + anillo; daño recibido con esquirlas cian-blancas y destello (no depende del rojo); dash con estela larga cian + fragmentos + ráfaga hacia atrás + polvo en el suelo; muerte de enemigo con salpicadura de **tinta negra** con subtono violeta y motas violetas; muerte del héroe con dispersión de energía cian/blanca.

**Medidas ✅**
| | Resultado |
|---|---|
| *Draw calls* con el momento más cargado en pantalla (muerte de enemigo + impacto + daño + remate a la vez) | **5** (peor fotograma 6) |
| Perfil **bajo**, 30 × todos los efectos sin descanso | pico **150/150** partículas, 241 efectos descartados por el gobernador |
| *Pools* | acotados por la necesidad simultánea **máxima** (≤ 61 objetos para un combate completo), **no** por cuántos efectos se reproduzcan: 440 combates seguidos no crean nada más; con `prewarm` el crecimiento es **cero** (0 *misses*) y 0 descartes |
| Fin de vida | todo vuelve a su *pool* (0 partículas y 0 sprites vivos tras cada trigger y tras un combate real) |

**Tests: +48 (336 → 384)**
- `tests/unit/vfx/vfxMath.test.ts` (24): ranuras → colores (acento apagado por defecto y solo en el remate), emisor determinista con semilla, rangos de velocidad/vida/tamaño, cono y dirección (adelante, atrás, arriba, circular, dirección explícita), alineación con la velocidad, radio de dispersión, conteos y escala, gravedad/arrastre/muerte, arrastre independiente del frame rate, curvas de tamaño y alfa, geometría del arco (encaja en el hitbox, espejo, barrido por ataque, *fallback*), integridad de la tabla (todo trigger ligado, todo id definido, números sanos, **nada vive más de 2 s**, la tinta negra es el único efecto normal-oscuro) y **presupuestos 150/300/400**.
- `tests/unit/vfx/vfxSystem.test.ts` (13, happy-dom sin renderer): contenedor correcto por mezcla, devolución al *pool*, **pooling acotado y sin fugas**, `prewarm` (cero *misses*), **presupuesto duro**, **prioridad** (lo importante expulsa lo trivial y no al revés; lo trivial se descarta si todo es importante), presupuesto de sprites, **determinismo**, ignora el hit-stop (solo conoce `dt`), id desconocido, `clear/destroy` idempotentes.
- `tests/unit/vfx/vfxDirector.test.ts` (7): cada evento → su trigger, el rastro por distancia (5 *puffs* en un frame largo; hacia la izquierda; se detiene al acabar; tope por frame), sin efectos dobles al recibir daño, `dispose` desuscribe todo.
- `tests/integration/combat.test.ts` (+4): `player:attackActive` una vez por ataque, en el primer tick activo y con el mismo `rect` que el hitbox; la cadena lo emite dos veces; un ataque interrumpido en *startup* no lo emite; aéreo y agachado con su id.

**E2E (dev y producción, 8/8):** `vfx` nuevo (cada trigger en pantalla y vuelve a cero, ≤ 12 *draw calls* en el peor momento, *pools* sin crecer en 46 combates, acento encendido, perfil bajo con tope duro), y `combat`/`crouch` ampliados (el tajo y el impacto, el daño y la muerte arrancan sus efectos; sin pausa, todo muere y vuelve a su *pool*; el temblor de cámara se comprueba por el evento y no por el decaimiento en tiempo real).

**Desviaciones y notas**
- **Telegraph** violeta del enemigo: es del paso **S9** (el enemigo aún no existe); la ranura `enemy` y las capas ya están listas.
- La estela del dash son *puffs* de brillo alargado + esquirlas, no imágenes residuales del sprite (ARCHITECTURE §7.7 las mencionaba): con el *placeholder* no aportan nada y el arte final decidirá (P7). `lightPool` (charco de luz bajo el actor) tampoco se implementa aún; tampoco hay polvo de aterrizaje.
- En el E2E el juego está en pausa, y los VFX **se pausan con él** (para que las capturas sean estables); sin pausa corren en tiempo real, también durante un hit-stop.
