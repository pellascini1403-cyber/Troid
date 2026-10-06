# Migración a 2D + PixiJS — plan, matriz y criterios

> **Estado:** definitivo para iniciar el Prompt 4 · **Fecha:** 2026-10-05 · **Fase:** Prompt 3 (documentación; **no se ha iniciado la migración**).
> Qué se construye: [GAME-SPEC-2D](GAME-SPEC-2D.md) · Cómo: [ARCHITECTURE-2D](ARCHITECTURE-2D.md) · Registro de decisiones: [ADR-0003](adr/0003-arquitectura-2d-definitiva.md) · Diagnóstico de partida: [AUDIT-2026-10](AUDIT-2026-10.md).
>
> Clases: **A** conservar · **B** adaptar · **C** reemplazar · **D** nuevo. Cifras medidas ✅ sobre `claude/troid-vertical-slice` (F5 + documentos).

---

## 1. Principios de la migración

1. **Estrangulamiento, no cirugía a corazón abierto.** La vista 2D nace **junto** a la 3D (detrás de `?view=2d`) y la 3D se retira **solo** cuando la 2D alcanza la paridad verificada (paso S4). Mientras tanto el juego sigue compilando y jugándose.
2. **La simulación solo crece.** Se **añade** (combate, agacharse, enemigos…), no se reescribe. Los 40 tests de movimiento actúan de **puerta de regresión** tras cada paso.
3. **Riesgo primero.** Pixi (R8/R17) se valida en el primer paso; después, gameplay.
4. **Cada paso termina en verde:** `npm run check`, `npm run build` y, si hay algo visible, E2E; **un commit por paso**.
5. **Nada se borra sin rastro:** se etiqueta `proto-3d-f5`, se documenta por qué se retira cada archivo (§3) y `wip/f6-combat-core` no se toca.
6. **Los tests se conservan.** Los 23 tests de la etapa 3D se **portan** a su equivalente 2D **antes** de retirar el código que cubrían (§4).
7. **La documentación se sincroniza en el mismo paso** que el código que describe.

---

## 2. Matriz de sistemas

| # | Sistema | Estado actual | Clase | Acción | Fase |
|--:|---|---|:-:|---|---|
| 1 | Movimiento horizontal (aceleración/frenada, giro, aire) | existente ✅ (40 tests) | A | conservar | — |
| 2 | Salto (variable, coyote, buffer, apex) | existente ✅ | A | conservar | — |
| 3 | Dash (i-frames, enfriamiento, buffer, dash aéreo) | existente ✅ | A | conservar; añadir feedback/VFX | P4 (VFX) · P6 (mejora Air Dash) |
| 4 | Colisión AABB, *one-way*, atravesar | existente ✅ | A | conservar | — |
| 5 | **Agacharse** (cuerpo, hurtbox, espacio, dash agachado) | inexistente | D | nuevo | P4-S5 (PC) · P5 (táctil) |
| 6 | Estados del jugador (FSM) | parcial (`free`/`dash`) ✅ | B | ampliar con `crouch/attack/cast/drink/hurt/dead/locked` | P4 (+P5) |
| 7 | Cámara: matemática (`CameraRig`) | existente ✅ (30 tests) | B | adaptar a 2D (retirar pose 3D) | P4-S4 |
| 8 | Cámara: adaptador a la vista | `CameraView` (three) | C→D | `CameraAdapter2D` | P4-S2 |
| 9 | Combate (ataque, hitbox/hurtbox, daño, knockback, hit-stop) | **WIP** ⚠️ no compila | B | rescatar de `wip/f6-combat-core` | P4-S6 |
| 10 | Vida | WIP (`Health`) | B | rescatar | P4-S6 |
| 11 | Muerte y reinicio | inexistente | D | nuevo (`DeathFlow`) | P4-S8 |
| 12 | Enemigos (FSM, telegraph) | inexistente | D | nuevo (Ink Slime) | P4-S9 |
| 13 | Jefe y arena | inexistente | D | arquitectura prevista | P6 |
| 14 | Magia (barra regenerativa) | WIP `Resource` (sin regeneración) | D | nuevo (`Magic`) | P5 |
| 15 | Habilidades activas y cartas | posesión ✅ (`AbilitySystem`); ejecución ❌ | A+D | `SkillRuntime`, `CardLoadout` | P5 |
| 16 | Botellas | inexistente | D | nuevo (`BottleSet`) | P5 |
| 17 | Modificadores y mejoras | inexistente | D | `ModifierStack` | P5/P6 |
| 18 | Interacción contextual | inexistente | D | nuevo | P5 |
| 19 | Sala (`RoomDefinition`) | mínima ✅ | B | ampliar (campos opcionales) | P4 |
| 20 | Transiciones entre salas | `loadRoom` ✅ sin disparadores | B+D | salidas + `RoomTransition` | P4 (1 salida) · P6 |
| 21 | Estado persistente del mundo (flags) | inexistente | D | `WorldFlags` | P6 |
| 22 | Guardado | inexistente (solo diseño) | D | arquitectura prevista | P5 (ajustes) · P6 (progreso) |
| 23 | Puntos de guardado | inexistente | D | arquitectura prevista | P6 |
| 24 | Input abstracto (`InputFrame`, `bindings`, `InputManager`) | existente ✅ (21 tests) | B | ampliar acciones | P4 · P5 |
| 25 | Teclado y ratón | existente ✅ | A | conservar | — |
| 26 | Táctil por gestos | inexistente | D | reconocedor puro + DOM | P5 |
| 27 | Gamepad | inexistente (mapeo en datos ✅) | D | preparar → implementar | P5 |
| 28 | **Renderer** | Three.js ✅ | **C** | **reemplazar por PixiJS v8** | P4-S1…S4 |
| 29 | Materiales *toon*, sol, contorno, `createRenderer`, `dispose` | existente (three) | C | retirar tras la paridad | P4-S4 |
| 30 | Pipeline de assets glTF (`AssetManager`, `CharacterModel`, `AnimationController`, `ActorVisual`, `validateModel`) | existente (three) | C | reemplazar por el pipeline de sprites; **portar sus 23 tests** | P4-S3 |
| 31 | Sprites, atlas y animación 2D | inexistente | D | nuevo | P4-S3 |
| 32 | Vocabulario lógico (`AnimState`, anclas, *fallbacks*) | existente ✅ | B | conservar y ampliar; sockets → anclas | P4 |
| 33 | VFX | inexistente | D | nuevo (mínimo) | P4-S7 · P7 |
| 34 | HUD | inexistente (solo panel de debug) | D | nuevo (DOM) | P5 |
| 35 | UI: prompts y overlays | inexistente | D | overlay de derrota y fundidos | P4-S8 · P5 |
| 36 | Localización (es/en) | inexistente | D | nuevo | P4-S8 (esqueleto) · P5 |
| 37 | Audio | inexistente | D | arquitectura + *stubs* | P5 · P7 |
| 38 | Depuración (panel oculto, flags, *tuning*, FPS, pausa/paso) | existente ✅ | A | conservar | — |
| 39 | Overlay de colliders | existente (three) | B | portar a `Graphics` + hitboxes/hurtboxes | P4-S1/S6 |
| 40 | Núcleo (`EventBus`, `Scheduler`, `StateMachine`, `Pool`, `Rng`, `Observable`, `lifecycle`, `FixedStepper`) | existente ✅ (62 tests) | A | conservar | — |
| 41 | Bucle de juego (`GameLoop`) | existente ✅ | A | conservar | — |
| 42 | Test de arquitectura | existente ✅ (16) | B | actualizar listas y reglas (§6) | P4-S4 |
| 43 | E2E (Playwright, `__troid`) | existente ✅ | B | adaptar métricas (*draw calls* por contador GL) | P4-S1 |
| 44 | CI (GitHub Actions) | definido ✅, no ejecutado (remoto recién poblado) | A | conservar | — |
| 45 | Empaquetado nativo (Capacitor) | inexistente | D | pendiente | P7 |
| 46 | Generador de modelos 3D (`tools/gen`) y `mannequin.glb` | existente | C | retirar | P4-S4 |
| 47 | Contenido (jugador, habilidades, sala de pruebas) | mínimo ✅ | B | ampliar | P4 → |
| 48 | Sala de pruebas de alcance (`movement_test`) | existente ✅ | A | conservar (la usan los tests) | — |

---

## 3. Clasificación por archivo (`src/`, 69 archivos, 5 228 líneas)

| Clase | Archivos | Líneas | % |
|:-:|--:|--:|--:|
| **A** conservar | 31 | 2 000 | 38.3 % |
| **B** adaptar | 21 | 1 786 | 34.2 % |
| **C** reemplazar | 17 | 1 442 | 27.6 % |
| **D** nuevo | — (módulos por crear) | — | — |
| **Reutilizable (A + B)** | 52 | 3 786 | **72.4 %** |

**Conciliación con la auditoría.** El Prompt 2 midió el **acoplamiento a Three** (17 archivos, 1 730 líneas = 33.1 %; el 66.9 % restante no importa `three`). Esta clasificación mide **qué se hace con cada archivo**: de esos 17, 15 son **C** (1 334 líneas) y 2 son **B** porque su lógica se aprovecha (`app/Game.ts`, 310; `debug/ColliderOverlay.ts`, 86). Además hay 2 archivos que no importan `three` pero son específicos de glTF y salen (**C**: `content/models.ts`, `models/ModelDefinition.ts`; 108 líneas). Las dos cifras son correctas y compatibles: 1 730 − 396 + 108 = 1 442.

Detalle por archivo (⚠️three = importa `three`):

| Archivo | Líneas | Clase | Destino / motivo |
|---|--:|:-:|---|
| `app/Game.ts` | 310 | **B** ⚠️three | Raíz de composición: se conserva el cableado (sesión, bucle, input, debug, hooks `__troid`); se sustituye todo lo 3D → `Game2D` (convive tras `?view=2d` hasta la paridad) |
| `app/GameLoop.ts` | 83 | **A** | Bucle fijo 60 Hz + interpolación; no sabe de render |
| `app/dom.ts` | 40 | **A** | Helper de listeners con dueño |
| `app/labs/cameraLab.ts` | 139 | **C** ⚠️three | Estudio de proyecciones 3D; queda en el tag `proto-3d-f5` |
| `app/labs/modelLab.ts` | 133 | **C** ⚠️three | Visor de modelos glTF → `spriteLab` (D) |
| `app/main.ts` | 24 | **A** | Arranque |
| `app/options.ts` | 38 | **B** | Opciones por URL: `?cam/fov/pitch` (3D) → `?vh`, `?view`, `?quality` |
| `assets/ActorVisual.ts` | 89 | **C** ⚠️three | Interpolación/giro/parpadeo → `ActorSprite` (se portan sus 4 tests) |
| `assets/AnimationController.ts` | 165 | **C** ⚠️three | Mezcla de clips → `SpriteAnimator` por fases (se portan sus 6 tests) |
| `assets/AssetManager.ts` | 128 | **C** ⚠️three | Descarga única + ref-count → `SpriteAssetManager` sobre `Assets` de Pixi (se portan sus 4 tests) |
| `assets/CharacterModel.ts` | 180 | **C** ⚠️three | Sockets/materiales glTF → anclas lógicas de sprite (se portan sus 5 tests) |
| `assets/validateModel.ts` | 85 | **C** ⚠️three | Contrato del modelo → `validateSpriteSet` (+ contrato de espada en mano) |
| `camera/CameraRig.ts` | 366 | **B** | Matemática de seguimiento/límites/shake se conserva; se retira la pose 3D (pitch/FOV/sway/near/far/distance) |
| `camera/CameraView.ts` | 55 | **C** ⚠️three | Aplica la pose a una `THREE.Camera` → `CameraAdapter2D` |
| `camera/index.ts` | 1 | **A** |  |
| `content/abilities.ts` | 15 | **B** | Corregir `magic_attack.implemented`; añadir ids de habilidades del slice |
| `content/index.ts` | 12 | **B** | Registro de contenido: +sprites, +enemigos, +salas |
| `content/models.ts` | 44 | **C** | Definiciones glTF del maniquí → `content/sprites.ts` (D) |
| `content/player.ts` | 9 | **B** | `modelId` → `spriteSetId`; bloque `combat`; dimensiones de cuerpo/agachado |
| `content/rooms/movementTest.ts` | 48 | **A** | Sala de pruebas de alcance (la usan los tests); se conserva como sandbox |
| `core/events.ts` | 72 | **A** |  |
| `core/ids.ts` | 15 | **A** |  |
| `core/index.ts` | 12 | **A** |  |
| `core/lifecycle.ts` | 76 | **A** |  |
| `core/log.ts` | 64 | **A** |  |
| `core/math.ts` | 133 | **A** |  |
| `core/observable.ts` | 50 | **A** |  |
| `core/pool.ts` | 78 | **A** |  |
| `core/rng.ts` | 56 | **A** |  |
| `core/scheduler.ts` | 122 | **A** |  |
| `core/stateMachine.ts` | 104 | **A** |  |
| `core/time.ts` | 50 | **A** |  |
| `core/types.ts` | 21 | **A** |  |
| `debug/ColliderOverlay.ts` | 86 | **B** ⚠️three | Misma lógica (qué dibujar), otra API → overlay con `Graphics` de Pixi |
| `debug/DebugActions.ts` | 38 | **A** |  |
| `debug/DebugPanel.ts` | 185 | **A** | Panel DOM; independiente del render |
| `debug/DebugState.ts` | 48 | **A** |  |
| `debug/FpsMeter.ts` | 26 | **A** |  |
| `debug/TuningInspector.ts` | 57 | **A** | Ajuste en vivo; se reutiliza para combate/magia/botellas |
| `debug/index.ts` | 3 | **A** |  |
| `gameplay/Actor.ts` | 56 | **A** | Cuerpo + estado de vista (en el WIP, `Team` pasa a `combat/`) |
| `gameplay/GameSession.ts` | 137 | **B** | Se amplía: combate, entidades, hit-stop, transiciones, flujo de muerte (orden del tick ya documentado) |
| `gameplay/SimServices.ts` | 20 | **B** | Se amplía como en el WIP (`combat`, `player`, `spawn/despawn`, `requestHitStop`) |
| `gameplay/actorViewState.ts` | 45 | **B** | Contrato sim→vista: se mantiene; `z` (carriles de profundidad) se retira |
| `gameplay/events.ts` | 14 | **B** | Catálogo de eventos: + combate, muerte, botellas, magia, interacción, salas |
| `input/InputFrame.ts` | 48 | **B** | + `bottle`, `interact`, `drop`; el resto intacto |
| `input/InputManager.ts` | 132 | **B** | Se conserva el latch/OR/eje; + petición de botella con ranura |
| `input/bindings.ts` | 60 | **B** | + acciones nuevas y mapeo inicial de gamepad completo |
| `input/sources/KeyboardMouseSource.ts` | 79 | **A** |  |
| `models/ModelDefinition.ts` | 64 | **C** | Datos glTF (url, yaw, toon) → `presentation/SpriteSetDefinition` (D) |
| `models/index.ts` | 2 | **B** | Pasa a `presentation/index.ts` |
| `models/vocabulary.ts` | 62 | **B** | Estados lógicos de animación y anclas: se conserva; + `crouch`, `cast`, `drink`, `telegraph`, `interact`…; sockets → anclas 2D |
| `player/MovementTuning.ts` | 100 | **A** | Valores intactos; solo se añade un bloque `crouch` |
| `player/Player.ts` | 57 | **B** | + vida, combatiente, estados nuevos |
| `player/PlayerController.ts` | 276 | **B** | FSM `free/dash` intacta + `crouch/attack/cast/drink/hurt/dead` |
| `player/PlayerDefinition.ts` | 17 | **B** | + `combat`, `crouch`, hurtbox (como en el WIP) |
| `player/PlayerVisual.ts` | 23 | **C** ⚠️three | Envoltorio 3D → `ActorSprite` |
| `player/playerAnimation.ts` | 37 | **B** | Función pura estado→animación: se amplía con los estados nuevos |
| `progression/AbilitySystem.ts` | 87 | **A** | API `has/unlock/serialize/restore` intacta |
| `render/SunRig.ts` | 48 | **C** ⚠️three | Luz solar 3D |
| `render/createRenderer.ts` | 30 | **C** ⚠️three | `WebGLRenderer` → `Renderer2D` (Pixi) |
| `render/dispose.ts` | 16 | **C** ⚠️three | Liberación de recursos three |
| `render/materials/outline.ts` | 48 | **C** ⚠️three | Contorno por casco invertido (3D) |
| `render/materials/toon.ts` | 128 | **C** ⚠️three | Material toon (3D) |
| `world/RoomDefinition.ts` | 43 | **B** | + salidas, spawns, interactuables, peligros, arte, música (todo opcional) |
| `world/builders.ts` | 27 | **A** |  |
| `world/collision.ts` | 242 | **A** | AABB cinemático; `overlapsSolid` ya sirve para la comprobación de espacio al levantarse |
| `world/index.ts` | 3 | **A** |  |
| `world/view/RoomBlockout.ts` | 67 | **C** ⚠️three | Bloques 3D de la sala → `RoomView2D` |

**Por qué se retira cada archivo C** (consta arriba en «Destino»): son estrictamente de la vista 3D (materiales *toon*, contorno, sol, cámara de three, visores de modelos, carga y rig de glTF). Su **intención** se conserva: ref-count y descarga única → `SpriteAssetManager`; interpolación, giro y parpadeo → `ActorSprite`; *fallbacks* de clips → `SpriteAnimator`; validador de contrato → `validateSpriteSet`. Todo queda en el *tag* `proto-3d-f5`.

---

## 4. Tests: qué se conserva, qué se porta, qué se añade

Hoy: **192 tests en 11 archivos** ✅ (192/192 verdes).

| Archivo | Tests | Destino |
|---|--:|---|
| `core/events` · `stateMachine` · `scheduler` · `misc` | 7 · 8 · 8 · 31 | **A**, intactos |
| `gameLoop` | 8 | **A**, intacto |
| `input/inputManager` · `keyboardSource` | 13 · 8 | **A**, intactos (los tests nuevos van en archivos nuevos) |
| `integration/movement` | 40 | **A**, **puerta de regresión**: intacto y verde tras cada paso |
| `camera/cameraRig` | 30 | 25 intactos · 1 adaptado (el de *shake*, que lee `pose.lookAt`) · 4 de pose 3D: 1 se porta a los tests de `worldTransform` («muestra exactamente `viewHeight`») y 3 se retiran **porque el comportamiento que prueban deja de existir** (pitch, proyección ortográfica, sway), no por pertenecer a la etapa 3D; siguen en el *tag* |
| `architecture` | 16 | **B**: misma semántica; se actualizan listas de módulos y se añaden reglas (§6) |
| `assets/assets` | 23 | **C**: se **portan** (tabla siguiente) |

### 4.1 Portado de los 23 tests de `assets.test.ts`

| Grupo actual (3D) | Tests | Equivalente 2D (misma intención) |
|---|--:|---|
| `mannequin asset contract` | 4 | `validateSpriteSet`: el *sprite set* confirmado cumple su definición sin errores · todo estado lógico tiene clip o *fallback* · alto y escala coherentes (el héroe mide lo que dice su definición) · el validador informa de un clip mal nombrado, de la falta de `idle` y de un problema de escala. (Se sustituye «es un rig real con 18 huesos» por «anclas completas y **contrato de espada**») |
| `CharacterModel` | 5 | `ActorSprite`/anclas: resuelve todas las anclas · sintetiza anclas de respaldo (el gameplay nunca comprueba `null`) · las texturas se comparten y el asset compartido no se toca · las instancias son independientes (destellar una no destella otra) · `dispose` es idempotente y desengancha la raíz |
| `AnimationController` | 6 | `SpriteAnimator`: arranca en `idle` sin parpadeo de pose · cadena de *fallbacks* · reiniciar un clip de un solo uso lo lleva al fotograma 0 · ajuste a una duración de gameplay · los clips de un solo uso informan «terminado» y mantienen el último fotograma; los de bucle no terminan · **(el fundido entre clips no existe en 2D: se sustituye por «el fotograma sale de la fase de simulación»)** |
| `ActorVisual` | 4 | `ActorSprite`: interpola entre ticks · gira hacia `facing` · reinicia el clip solo cuando cambia `animSerial` · el parpadeo atenúa el alfa y respeta `visible = false`. (Se descarta la parte de «z de profundidad») |
| `AssetManager` | 4 | `SpriteAssetManager`: una sola descarga para peticiones simultáneas · ref-count y liberación al llegar a cero · una carga fallida no envenena la caché · error claro si se instancia algo no cargado |

### 4.2 Pruebas nuevas por paso (resumen; el detalle está en §7)

S1 `viewport`/`worldTransform` (puro) · S3 animación por fases, validador, portados · S5 agacharse · S6 combate (hit-once, i-frames, hit-stop con buffer, knockback, cadena, daño, muerte, determinismo) · S7 emisores y *pools* · S8 `DeathFlow`, i18n (paridad y literales) · S9 FSM del enemigo (transiciones, *telegraph*, determinismo) · S10 salida de sala, fugas por recarga · S11 E2E de sala completa. Después: P5 gestos, multitáctil CDP, recursos, interacción; P6 transiciones, flags, guardado/migración, jefe.

---

## 5. El WIP `wip/f6-combat-core`: cómo se rescata

**Se preserva intacta** (commit `b695c98`, rama publicada en `origin`): no se rebasa, no se reescribe, no se hace *force-push*, no se borra. La integración **copia archivos desde el commit**; nada se hace sobre la rama.

Contenido ✅ (≈ 570 líneas nuevas; **la simulación ya era 2D**, así que la geometría es reutilizable tal cual):

| Archivo del WIP | Líneas | Reutilizable | Cómo se integra (S6) |
|---|--:|---|---|
| `combat/AttackDefinition.ts` | 63 | **sí** | copiar; añadir variante agachada y `cancels`; datos de ataques en `content/` |
| `combat/Combatant.ts` | 71 | **sí** | copiar; `Team` pasa a vivir aquí (`gameplay/Actor.ts` lo reexporta) |
| `combat/CombatSystem.ts` | 146 | **sí** | copiar; orden de iteración estable; eventos ya definidos |
| `combat/Health.ts` | 54 | **sí** | copiar |
| `combat/hitboxGeometry.ts` | 23 | **sí** | copiar |
| `combat/Resource.ts` | 45 | parcial | barra sin regeneración: se mantiene como gancho (`energyOnHit` = 0 por defecto) y **P5 lo sustituye por `Magic`** |
| `gameplay/SimEntity.ts` | 17 | **sí** | copiar |
| `gameplay/SimServices.ts` (+24) | — | **sí** | copiar; añade `combat`, `player` (`PlayerTarget`), `spawn/despawn`, `requestHitStop` |
| `gameplay/events.ts` (+14) | — | **sí** | copiar; los eventos nuevos de §4.2 de ARCHITECTURE-2D se añaden aparte |
| `gameplay/Actor.ts` (±3) | — | **sí** | copiar |
| `player/PlayerCombat.ts` | 153 | **sí** | copiar; añade fases publicadas a `ActorViewState.phase/phaseT` |
| `player/PlayerDefinition.ts` (+28) | — | **sí** | copiar; añade `crouch` (alturas) |

**Por qué no compila (5 errores ✅):** `GameSession` no implementa los miembros nuevos de `SimServices` (`combat`, `spawn`, `despawn`, `requestHitStop`) y `Player` no implementa `PlayerTarget` (`health`, `invulnerable`).

**Receta de S6:**
1. `git checkout b695c98 -- <los archivos de la tabla>` (la rama principal no ha tocado esos archivos desde F5, así que es una copia limpia).
2. Implementar en `GameSession`: `combat`, lista de entidades con alta/baja diferida, `spawn/despawn`, `requestHitStop` y la puerta de hit-stop del tick (con *latch* de entradas).
3. `Player`: `health`, `invulnerable`, `receiveHit` (`Combatant`); `PlayerController`: estados `attack`, `hurt`, `dead` (+ `crouch` de S5) sin alterar `free`/`dash`.
4. **No recuperable:** el borrador de la reescritura de `PlayerController` no se guardó; se reescribe en S6 contra las pruebas.
5. Pruebas: hit-once · i-frames · hit-stop con *buffer* de entradas · knockback · ventana de cadena · daño y muerte · `Combatant` neutral · determinismo bit a bit · los 40 de movimiento intactos.

**Lo que el WIP no cubre** (se escribe nuevo): agacharse (S5), lanzamiento de habilidades (P5), botellas (P5), `Combatant` de enemigos (S9), proyectiles (P5), `DeathFlow` (S8).

---

## 6. Cambios en el test de arquitectura (permitidos y necesarios)

El propio test dice que los módulos nuevos se declaran en él. Cambios (paso S4, salvo el primero):

| Cambio | Antes → después |
|---|---|
| Módulos puros | `core, models, gameplay, player, combat, enemies, bosses, world, progression, save, input, camera, content` → `core, presentation, gameplay, player, combat, abilities, enemies, bosses, interaction, world, progression, save, i18n, input, camera, content` |
| Módulos de vista | `render, vfx, ui, audio, assets, debug, app` → sin cambios |
| Regla «puros no importan `three`» | también `pixi.js` |
| Nueva | `three` prohibido en todo el repositorio |
| Nueva | `ui/` no importa `pixi.js` ni `render/`; `render/`, `vfx/`, `assets/` no importan `ui/` |
| Nueva | `presentation/` e `i18n/` solo importan `core/` |
| Nueva | ningún literal de interfaz asignado a `textContent`/`innerText`/`innerHTML` en `ui/` |
| Sin cambios | `core` aislado · solo `app/`/`content/` importan `content/` · prohibiciones de determinismo en la simulación (11 patrones) |

---

## 7. Mapa de dependencias y orden del Prompt 4

```
S0 base + tag ─► S1 spike Pixi + Game2D ─┬─► S2 cámara 2D ────────────────────────────┐
                    (riesgo R8/R17)      └─► S3 sprites + animador + validador + ports ─► S4 retirar 3D
                                                                                            │
          ┌─────────────────────────────────────────────────────────────────────────────────┘
          ▼
   S5 agacharse ─► S6 combate (WIP→main) ─► S7 VFX mínimos ─► S8 muerte + i18n + overlay ─► S9 enemigo ─► S10 sala 1 + salida ─► S11 E2E / rendimiento / docs
   (sim)            (sim + eventos)          (vista)             (sim + vista mínima)         (sim + vista)    (contenido)            (cierre)
```

**Cortes seguros** (cada uno es un estado coherente y comiteado; si la sesión se interrumpe, el proyecto queda sano):
**Corte A — render listo** (S0–S4) · **Corte B — combate listo** (S5–S8) · **Corte C — slice jugable** (S9–S11).

| Paso | Entregable | Depende de | Puerta (debe cumplirse para seguir) |
|---|---|---|---|
| **S0** Base | `npm run check`, build y E2E verdes; etiqueta anotada `proto-3d-f5` sobre el estado 3D; copia de las cifras de partida | — | 192/192 · 0 errores de tipos · E2E dev y producción |
| **S1** Spike Pixi | `pixi.js@^8.22` (única dependencia de runtime añadida); `Renderer2D`, `layers`, `viewport`/`worldTransform` (puros), `RoomView2D` (*blockout*), `ProceduralActor` (piel provisional), overlay de colliders, `Game2D` tras `?view=2d`; `__troid` con la misma forma; contador de *draw calls* en el E2E | S0 | escenario `movement` en verde **sobre la vista 2D**; escena de estrés (≥ 800 sprites animados, 4 capas, 1 filtro, ≥ 200 partículas) **≤ 60 draw calls**; sin errores de consola; **si falla → criterio de reversión del ADR-0002** |
| **S2** Cámara 2D | `CameraAdapter2D`, seguimiento, zonas, límites, *shake*; `CameraRig` **sin modificar** | S1 | capturas 844×390, 1920×1080 y 21:9; sin vibración; límites correctos |
| **S3** Sprites | `SpriteSetDefinition`, `animation.ts` (fases/tiempo), `SpriteAnimator`, `ActorSprite`, `SpriteAssetManager`, `validateSpriteSet` (incl. contrato de espada), texturas procedurales; **23 tests portados** | S1 | tests portados verdes; estado→clip con *fallbacks*; ataque sincronizado con la fase |
| **S4** Retirar 3D | borrar los archivos C (§3), `tools/gen`, `public/assets/models`, `three` y `@types/three`; `CameraRig` sin pose 3D (−3 tests, 1 portado, 1 adaptado); actualizar el test de arquitectura (§6) | S2, S3 | `grep -rn "from 'three"` vacío · `npm run check` · build · E2E dev y prod · tamaño del bundle medido |
| **S5** Agacharse | `PlayerBody`, estado `crouch`, espacio para levantarse, dash agachado, hurtbox, atravesar; piel provisional agachada | S4 | **40 de movimiento intactos** + tests nuevos de §6 de GAME-SPEC-2D |
| **S6** Combate | restaurar el WIP (§5); `GameSession` con combate/entidades/hit-stop; `Player` combatiente; FSM `attack/hurt/dead`; *training dummy*; overlay de hitboxes/hurtboxes | S5 | tests de la receta (§5) + determinismo + 40 intactos |
| **S7** VFX mínimos | `VfxSystem`/`VfxDirector`, texturas procedurales, 4 efectos (arco, chispa de impacto, estela de dash, aura de telegraph), hit-stop y *shake* conectados, *pools* | S1, S6 | *pools* sin crecimiento · ≤ presupuesto de partículas · eventos→VFX por datos |
| **S8** Muerte + i18n | `DeathFlow`, overlay de derrota (DOM) y fundidos, `i18n/` (es/en) con paridad y regla de literales | S6, S7 | flujo determinista · paridad de claves · sin literales en `ui/` |
| **S9** Primer enemigo | `EnemyDefinition`, `Enemy`, `EnemyBrain`, arquetipo *Ink Slime*, `ProceduralActor` de tinta, *telegraph* violeta | S6, S7 | FSM y *telegraph* con tests · determinismo con enemigo |
| **S10** Primera sala | R1 (*blockout* 2D): suelo, plataformas, *one-way*, pasaje bajo, spawn del enemigo, salida → `exit:reached`; capas de fondo provisionales; límites de cámara | S5, S9 | alcanzabilidad por física · recarga de sala sin fugas |
| **S11** Cierre | escenario E2E «sala completa», capturas, sonda de rendimiento, documentos sincronizados, informe | S10 | criterios del §9 |

**Fuera del Prompt 4:** controles táctiles, HUD, magia, cartas, botellas, interacción, gamepad, audio, guardado, jefe y arte definitivo (Prompts 5–7).

**Después:** P5 (recursos, táctil, gamepad, HUD, interacción, ajustes e idioma persistente) → P6 (mundo conectado, flags, puntos de guardado, jefe) → P7 (arte definitivo, VFX, pulido, rendimiento, empaquetado nativo, QA). Dependen del arte: P7 (sprites de producción).

---

## 8. Registro de riesgos técnicos

R1–R13 vienen de la auditoría (se actualiza su estado); R14+ son nuevos.

| # | Riesgo | Prob. | Impacto | Mitigación | Verificación | Estado |
|--:|---|:-:|:-:|---|---|---|
| R1 | No hay arte de producción | alta | alto | manifiesto + validador + piel provisional **que no es el personaje** | validador en CI | vigente |
| R2 | Gestos táctiles poco fiables | media | alto | especificación exacta (GAME-SPEC-2D §4.3), reconocedor puro y probado, E2E CDP | E2E ✅ · dispositivo ⚠️ | vigente |
| R3 | Gestos del sistema (bordes) | media | medio | `edgeMargin`, `touch-action: none`; exclusión nativa en P7 | dispositivo ⚠️ | vigente |
| R4 | Memoria/rendimiento móvil | media | alto | perfiles, atlas ≤ 2048, @1×/@2×, descarga por región | dispositivo ⚠️ | vigente |
| R5 | Pérdida de contexto WebGL | baja | medio | manejar `webglcontextlost/restored` | prueba simulada ⚠️ | vigente |
| R6 | Audio móvil | media | medio | desbloqueo por gesto; plugin nativo | dispositivo ⚠️ | vigente |
| R7 | Pérdida de partidas | media | alto | Preferences + `.bak` + versionado | tests de corrupción | vigente |
| R8 | Pixi v8 en Android antiguo | baja-media | alto | *spike* S1 + criterio de reversión | S1 | **se valida en S1** |
| R9 | Deriva de alcance | alta | alto | «mínimo demostrable», cortes A/B/C | criterios por paso | vigente |
| R10 | **Propiedad intelectual** (Beru, Hollow Knight, Solo Leveling) | media | alto (producto) | arte final propio y distinto; no copiar UI, personajes ni composiciones; no versionar capturas de terceros; revisión legal antes de publicar | fuera del alcance técnico | vigente |
| R11 | Tiendas no verificables aquí | cierta | medio | no afirmar «listo para publicar» | — | vigente |
| R12 | Código 3D muerto | media | bajo | `proto-3d-f5` + retirada en S4 | `grep three` vacío | **se cierra en S4** |
| R13 | Balance sin playtest | alta | medio | todo en datos + inspector en vivo | playtest | vigente |
| **R14** | **Legibilidad: héroe negro sobre escenarios oscuros** (contraste 1.0–1.4 : 1 con tus fondos) | alta | alto | luz detrás/oscuridad delante, rim light, charco de luz, ojos como ancla (GAME-SPEC-2D §3.3) | métrica de contraste y capturas (P7) | nuevo |
| **R15** | Derivar sprites de producción desde *concept art* (poses sueltas, escala y pivote inconsistentes, efectos fusionados) | alta | alto | requisitos de producción (GAME-SPEC-2D §2.5), sin recortes automáticos, validador | revisión del arte | nuevo |
| **R16** | Espada flotante / no sujeta | media | medio | contrato de anclas `weapon_grip ≈ hand_r` en el validador | `validateSpriteSet` | nuevo |
| **R17** | Particularidades de Pixi v8 (`Assets`/`Spritesheet`, `ParticleContainer`, render groups, resolución) | media | medio | fijar la versión (8.22.x), *spike*, corregir ARCHITECTURE-2D §7 | S1 | nuevo |
| **R18** | Salto accidental por deriva del pulgar | media | alto | umbrales en datos, `driftRelax`, prueba en dispositivo | dispositivo ⚠️ | nuevo |
| **R19** | HUD DOM con jank en Android de gama baja | media | medio | solo `transform`/`opacity`, escrituras agrupadas, actualizar solo ante cambios | medición en dispositivo ⚠️ | nuevo |
| **R20** | Convivencia de dos vistas durante la migración | media | medio | breve (S1–S4), `?view=2d`, retirada con puerta | S4 | nuevo |
| **R21** | El Prompt 4 es grande para una sola ejecución | alta | medio | un commit por paso, cortes A/B/C | commits | nuevo |
| **R22** | Regresión de determinismo al añadir combate/enemigos | media | alto | tests bit a bit ampliados; azar solo por `Rng` | tests | nuevo |
| **R23** | Memoria con arte a 2× en móviles | media | alto | variantes @1×/@2×, *trim*, descarga por región | dispositivo ⚠️ | nuevo |
| **R24** | Expansión de texto y CJK | baja | medio | maquetación elástica, fuentes con respaldo | pruebas con cadenas largas | nuevo |
| **R25** | `magic_attack` marcada `implemented: true` sin comportamiento | cierta | bajo | corregir el dato en P5 | test de contenido | nuevo (hallazgo ✅) |
| **R26** | Referencias propias no persisten en el repositorio (continuidad entre sesiones) | media | medio | medidas documentadas aquí; **DP-2** | — | nuevo |
| **R27** | Dimensiones del cuerpo vs silueta chibi (cuerpo 0.7×1.7 m pensado para humano) | media | medio | recalibrar con pruebas de alcance; 40 tests intactos | S5/P7 | nuevo |
| **R28** | Zoom en teléfono: héroe ≈ 49 px CSS | media | medio | `viewHeight` por plataforma (dato); validar en dispositivo | dispositivo ⚠️ | nuevo |
| **R29** | Umbrales en dp según densidad y tamaño de pantalla | media | medio | `uiScale`; pruebas con 3 tamaños | E2E + dispositivo | nuevo |
| **R30** | Cámara con parallax: parpadeo por subpíxel | media | bajo | redondeo por capa | capturas | nuevo |

---

## 9. Criterios de aceptación del Prompt 4

> **Estado: cumplidos (2026-10-06)**, con la evidencia entre paréntesis (detalle en la [bitácora](PROMPT4-LOG.md)). Lo que **no** se pudo verificar aquí se declara en el informe final y en la bitácora (§ «Limitaciones»).

**Producto (lo que se ve y se juega, con teclado):**
- [x] Entrar en la sala R1 **sin errores de consola** (el arnés E2E falla cualquier escenario con un error de consola; `r1` y `room` abren R1 por defecto).
- [x] Moverse, saltar (variable, coyote, buffer), **agacharse** (con pasaje bajo) y hacer **dash** (i-frames) exactamente como en F5 (los 40 tests de movimiento, intactos; 29 de agacharse; E2E `movement`, `crouch` y `room`).
- [x] **Atacar** (cadena de 2, aéreo, agachado) con hitbox visible en el modo de depuración; golpear: hit-stop, knockback y chispas (E2E `combat`, `slime`, `room`).
- [x] **Recibir daño:** knockback, i-frames con parpadeo, vida visible en el panel de depuración y en `state()` (E2E `combat`, `slime`, `room`).
- [x] **Derrotar** al *Ink Slime*: *telegraph* violeta legible (se mide en píxeles) y muerte (E2E `slime`, `room`).
- [x] **Morir y reaparecer**: flujo de derrota con texto localizado (es/en) (E2E `death` y `room`, con el slime venciendo al héroe de verdad).
- [x] **Llegar al final de la sala** (`exit:reached`) (E2E `r1` y `room`; prueba por física en `tests/integration/r1.test.ts`).

**Técnico:**
- [x] `npm run check` y `npm run build` verdes. Tests: 617 (los 192 de partida, menos 3 de pose 3D, con 23 portados y 1 adaptado, más los nuevos). **Ningún** test de movimiento, núcleo ni input modificado (`git diff ac74b46 -- tests/integration/movement.test.ts tests/unit/core tests/unit/input` vacío).
- [x] `grep -rn "from 'three" src tests tools` vacío; `three` y `@types/three` fuera de `package.json`; sin `tools/gen/` ni `public/assets/models/`.
- [x] Reglas nuevas del test de arquitectura (§6) activas y verdes (22 tests: capas, `pixi` solo en vista, sin literales de interfaz en `ui/`, `i18n/` puro…).
- [x] E2E (dev **y** producción, 12 escenarios): «sala completa» (`room`) verde; capturas 844×390 y 1920×1080 no vacías; **≤ 60 *draw calls*** en la sala (R1 entera: 12–14).
- [x] *Spike* (S1): escena de estrés ≤ 60 *draw calls* (5; el criterio de reversión del ADR-0002 **no** se activó).
- [x] Determinismo bit a bit con combate y enemigo (tests de integración y **dos reproducciones en el navegador comparadas con la simulación cada 50 ticks**); **sin fugas** tras N recargas de sala (listeners, entidades, vistas, objetos de cada capa de la escena); *pools* estables.
- [x] i18n: paridad es/en y ningún literal de interfaz en `ui/` (tests de catálogos y regla de arquitectura).
- [x] Bundle JS **que descarga un arranque en frío de R1: 195.6 KB gz** (≤ 200 KB gz; `npm run bench:bundle`). Ojo: `dist/` entero suma 237 KB gz porque incluye los laboratorios y los *renderers* WebGPU/Canvas que no se descargan; el margen real es de ≈ 4 KB.

**Proceso:**
- [x] Un commit por paso (o varios pequeños: S9, S10 y S11 tienen 2–3) con los *trailers*; `wip/f6-combat-core` **intacta** (`b695c98`, local y en `origin`).
- [x] Documentos sincronizados (estado de ARCHITECTURE-2D con lo medido, ROADMAP, README, bitácora).
- [x] Informe final con **verificado / corregido / pendiente / no verificable** (iOS/Android reales, rendimiento móvil, audio y tiendas siguen sin poder comprobarse aquí).

---

## 10. Lo que NO debe modificarse todavía

**En el Prompt 3 (ahora):**
- **Ningún archivo de `src/`, `tests/`, `tools/`, `public/` ni de configuración** (`package.json`, `vite.config.ts`, `tsconfig.json`, CI). Solo `docs/` y `README.md`.
- **No instalar PixiJS** ni ninguna otra dependencia; **no eliminar Three.js**; no crear sprites finales; no rediseñar, recolorear, recortar ni redibujar al protagonista.
- **`wip/f6-combat-core`**: ni commits, ni rebase, ni *force-push*.

**Hasta que su paso lo autorice:**

| Qué | Hasta | Por qué |
|---|---|---|
| Los 192 tests | S4 (solo la lista explícita de §4) | son la red de seguridad |
| `core/*`, `world/collision.ts`, `input/InputManager.ts` (latch/OR/eje), `AbilitySystem` | siempre (solo se **añade**) | base determinista probada |
| `PlayerController`: estados `free`/`dash`, `MovementTuning` (valores por defecto) | S5 (solo se añaden estados) | el «feel» está medido: 40 tests |
| Orden del tick de `GameSession` | S6 | contrato del determinismo |
| Archivos C (vista 3D), `tools/gen`, `mannequin.glb`, `three` | S4 | convivencia hasta la paridad |
| `window.__troid` (forma) | siempre | el E2E depende de ella |
| Imágenes de referencia del usuario | siempre | fuente de verdad; sin recolor, recorte automático ni redibujo |
| Contenido histórico de `AUDIT-2026-10.md` | siempre | solo se anota, no se reescribe |
| `package.json` (dependencias) | S1 (`pixi.js`) y S4 (retirar `three`) | una dependencia por vez, justificada |

---

## 11. Cierre del Prompt 3: criterios y dónde se cumplen

| Criterio de aceptación | Dónde |
|---|---|
| Dirección 2D completamente definida | GAME-SPEC-2D §1 · ADR-0003 DC-01…DC-04 |
| PixiJS v8 decidido | ADR-0002 (aceptada) · ADR-0003 DC-02 · ARCHITECTURE-2D §7 |
| Protagonista tratado como diseño existente | GAME-SPEC-2D §2 (DC-11, DC-13, DC-14) |
| Referencias del usuario como fuente de verdad | GAME-SPEC-2D §2.1–2.2, §3.6 |
| Paleta cian/azul cerrada | GAME-SPEC-2D §3.2 (DC-12) |
| Controles móviles especificados | GAME-SPEC-2D §4.3 (salto exacto en §4.3.2) |
| Combate · magia · botellas · interacción · agacharse | GAME-SPEC-2D §7 · §10 · §11 + §4.3.5 · §12 · §6 |
| Progresión · estructura de salas | GAME-SPEC-2D §13 · §14 |
| Arquitectura especificada | ARCHITECTURE-2D |
| Migración dividida por dependencias | §7 de este documento |
| WIP de combate preservado | §5 · `wip/f6-combat-core` = `b695c98` ✅ verificado: la rama local y `origin/wip/f6-combat-core` apuntan a `b695c98`; el Prompt 3 no la tocó |
| Los 192 tests siguen intactos | ✅ `npm run check` → **192/192** tests en 11 archivos y 0 errores de tipos; `npm run build` OK (JS de la app 15.2 KB + *chunk* de Three 163.8 KB gz, como en la auditoría) |
| No se ha iniciado la migración del renderer | ✅ `git diff` fuera de `docs/` y `README.md` **vacío** (nada en `src/`, `tests/`, `tools/`, `public/` ni configuración); `pixi.js` **no** está instalado; `three` sigue en `package.json` |
