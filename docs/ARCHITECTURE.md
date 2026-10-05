# Arquitectura de Troid

> Documento vivo. Fuente de verdad de las decisiones estructurales; si el código y este documento
> discrepan, se corrige uno de los dos en la misma PR. Stack y motivos: [ADR-0001](adr/0001-stack.md).

> ⚠️ **Parcialmente obsoleto (2026-10-05).** Los principios, la simulación, el input, el sistema de eventos y el test de arquitectura
> siguen vigentes. Lo que describe de Three.js, glTF y la cámara 3D corresponde al prototipo 3D y se reemplazará si se confirma
> [ADR-0002](adr/0002-direction-2d.md) (propuesta). Mapa actual y arquitectura propuesta: [AUDIT-2026-10 §3 y §5](AUDIT-2026-10.md).

## 1. Principios

1. **La simulación no sabe que existe un renderizador.** Todo lo que decide el resultado del juego
   (movimiento, combate, IA, progresión, guardado) es TypeScript puro, determinista y ejecutable sin
   navegador. Three.js y el DOM solo existen en la capa de vista.
2. **Los datos mandan.** Enemigos, jefes, habilidades, rooms, gates y checkpoints son `*Definition`
   (objetos tipados). Añadir contenido = añadir datos, no tocar sistemas.
3. **Todo asset es reemplazable sin tocar gameplay.** Modelo, animaciones, materiales, VFX, audio y UI
   se enlazan por *id lógico*, nunca por nombre de archivo ni de clip.
4. **Mobile-first.** Cada decisión visual se valida a tamaño de teléfono; los presupuestos de
   rendimiento se miden (no se suponen).
5. **Nada se queda vivo sin dueño.** Listeners, timers y recursos GPU se registran en un
   `DisposableStore` / `Scheduler` con propietario; descargar una room o cerrar el juego los libera.
   Hay tests que lo comprueban.
6. **Primero jugabilidad.** Prioridad de diseño: gameplay › respuesta › cámara › combate › arquitectura › rendimiento › calidad visual › contenido.

## 2. Capas y módulos

```
┌────────────────────────── app/ (composition root, navegador) ──────────────────────────┐
│  VISTA / PLATAFORMA (pueden usar three, DOM, WebAudio)                                  │
│  render/  vfx/  ui/  audio/  assets/  debug/ (overlays)  camera/ (adaptador three)      │
│  input/sources (teclado, pointer/touch, gamepad)   *Visual.ts / *View.ts en cada módulo │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│  SIMULACIÓN (TypeScript puro, sin three, sin DOM, determinista, headless)               │
│  gameplay/  player/  combat/  enemies/  bosses/  world/  progression/  save/            │
│  input/InputFrame+bindings   camera/CameraRig (matemática)                              │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│  core/  (math, EventBus, Scheduler, StateMachine, Pool, Rng, Observable, Lifecycle…)    │
└─────────────────────────────────────────────────────────────────────────────────────────┘
        content/  (instancias de *Definition: datos del juego)    tools/  (generadores, E2E)
```

| Módulo | Responsabilidad | Capa |
|---|---|---|
| `core/` | Utilidades base: matemáticas, `EventBus`, `Scheduler` (timers de simulación), `StateMachine`, `Pool`, `Rng`, `Observable`, `DisposableStore`, `FixedStepper`, tuning, logger | base |
| `gameplay/` | `GameSession` (raíz de la simulación), orden del tick, `Entity`/`Actor`, hit-stop, flujo muerte/respawn y transiciones, catálogo de eventos | sim |
| `player/` | `PlayerController` (lógica), locomoción, acciones (ataque/dash/hurt), `PlayerDefinition`; **vista**: `PlayerVisual` | sim + vista |
| `combat/` | `AttackDefinition`, hitbox/hurtbox, `CombatSystem`, daño/knockback/hit-once | sim |
| `enemies/` | `EnemyDefinition`, `EnemyBrain` (FSM), comportamientos; **vista**: `EnemyVisual` | sim + vista |
| `bosses/` | `BossController`, `BossStateMachine`, `BossPhase`, `BossAttack`, `BossHealth`, `ArenaController` | sim |
| `world/` | `World → Region → Room`, colisión (`CollisionWorld`), exits/entries, gates, secretos, pickups; **vista**: constructores de entorno | sim + vista |
| `progression/` | `AbilitySystem`, flags, items, requisitos (`Requirement`) | sim |
| `save/` | `SaveSystem` versionado, migraciones, adaptadores de storage | sim |
| `input/` | `InputFrame` + bindings (puro); fuentes teclado/touch/gamepad (plataforma); `InputManager` | mixto |
| `camera/` | `CameraRig` (seguimiento, dead zone, límites, shake — puro) + adaptador a `THREE.Camera` | mixto |
| `render/` | Renderer, perfiles de calidad, luces, materiales toon, atmósfera, post | vista |
| `assets/` | `AssetManager`, carga glTF, clonado de rigs, registro de modelos/clips/sockets | vista |
| `vfx/` | `VfxSystem` con pooling; definiciones de VFX reemplazables | vista |
| `audio/` | `MusicManager`, `SfxManager`, `AmbientManager`; backend WebAudio sintético | vista |
| `ui/` | HUD (view-model + vista DOM), controles táctiles, menús, prompts, skins PNG | vista |
| `debug/` | Cheats, overlays de colliders/hitboxes, FPS (ocultos en juego normal) | vista |
| `content/` | Instancias de definiciones (jugador, enemigos, jefes, rooms, regiones) y validación de integridad | datos |
| `app/` | `Game` (composición), bucle de render, wiring | plataforma |

**Regla de dependencias** (la comprueba `tests/unit/architecture.test.ts`):

- `core` no importa de ningún otro módulo.
- La capa de simulación no importa `three`, `render/`, `vfx/`, `ui/`, `audio/`, `assets/`, `app/` ni globals del DOM.
- La vista **lee** el estado de la simulación y **escucha eventos**; solo escribe en ella mediante la API de
  `GameSession` y el `InputFrame`.
- Prohibido `setTimeout`/`setInterval` en la simulación: los temporizadores pasan por `Scheduler`.

## 3. Bucle y orden del tick

Simulación a **60 Hz fijos**; el render va a la frecuencia de la pantalla e interpola.

```
requestAnimationFrame
 ├─ input.sample()                   → InputFrame (pulsaciones latcheadas: ningún tap se pierde entre ticks)
 ├─ stepper.advance(dtReal)          → n ticks de 1/60 s (máx. 5 por frame: sin espiral de la muerte)
 │    session.tick(frame):
 │       1  entrada → buffers (salto, ataque, dash)
 │       2  jugador (locomoción / acciones)
 │       3  IA de enemigos y jefes → intenciones
 │       4  proyectiles
 │       5  movimiento + resolución de colisiones
 │       6  combate: hitboxes activas vs hurtboxes → daño, knockback, hit-stop
 │       7  triggers: pickups, checkpoints, exits, arenas, prompts
 │       8  progresión / guardado
 │       9  scheduler (timers de simulación)
 │      10  vaciado de eventos
 ├─ views.sync(alpha)                → posiciones interpoladas, estados de animación
 ├─ camera.update(dtReal)            → suavizado en tiempo real (inmune al hit-stop)
 ├─ vfx.update(dtReal), audio.update()
 └─ renderer.render()
```

*Hit-stop*: congela los ticks de entidades; cámara, shake y partículas usan tiempo real.

## 4. Unidades y coordenadas

- Unidades = **metros**. Tick = 1/60 s. Duraciones de ataque en **ticks (frames a 60 Hz)**.
- Three.js: **+X derecha**, **+Y arriba**, **+Z hacia la cámara**. El plano de juego es `z = 0`.
- Jugador: 1.8 m de alto; cápsula lógica 0.7 × 1.7 m. Posición de entidad = **centro de los pies**.
- La simulación es **2D (X,Y)**. La profundidad es solo visual y controlada por el nivel: `DepthLane`
  (zonas rectangulares con un `z` objetivo al que el personaje se acerca suavemente). Nunca es libre.
- Encuadre objetivo: el jugador ocupa ≈ 10–12 % del alto de pantalla (alto visible ≈ 15–16 m) — se valida en
  pantalla de teléfono (844×390).

## 5. Pipeline de assets (modelo → esqueleto → animación → material → sockets → gameplay)

```
 .glb  ──AssetManager──▶  ModelAsset ──instantiate()──▶ CharacterModel
                                                          ├─ root / skeleton / mixer
                                                          ├─ sockets  (weapon_r, weapon_l, shield, projectile_origin,
                                                          │            vfx_feet, vfx_hand_r, interaction, head, back)
                                                          ├─ materials (reemplazables por MaterialSet)
                                                          └─ AnimationController (estado lógico → clip)
 Gameplay solo habla con:  AnimState lógico ('idle','run','attack'…)  y  SocketId lógico.
```

- **Gameplay jamás lee la malla ni nombres de clip.** Hitboxes y orígenes de proyectil son datos de la
  `*Definition` (offsets lógicos), no posiciones de huesos. Cambiar el modelo no altera el combate.
- `ModelDefinition` declara: `url`, `scale`, `yawOffset`, mapa **estado lógico → clip** (con cadena de
  *fallback*: `walk→run`, `attack2→attack`…), mapa **socket lógico → nombre de nodo**, opciones de material y outline.
- **Convención de nombres** (para el artista): huesos y nodos sin puntos ni espacios (`upperArm_L`, no `upperArm.L`);
  sockets = nodos vacíos `SOCKET_<id>` hijos del hueso correspondiente; el modelo mira hacia **+Z** en reposo.
- Los modelos placeholder (maniquí blanco, 4 enemigos, 2 jefes) **se generan con `npm run gen:models`**
  (`tools/gen/`) y se cargan por el mismo camino que cargará el asset definitivo: es la especificación por ejemplo.

## 6. Datos (data-driven)

`PlayerDefinition · EnemyDefinition · BossDefinition · AbilityDefinition · ItemDefinition ·
RoomDefinition · GateDefinition · CheckpointDefinition` (+ `RegionDefinition`, `AttackDefinition`, `VfxDefinition`).

- Los tipos viven en su módulo; las **instancias** en `content/`.
- `ContentRegistry` indexa por id y `validateContent()` comprueba la integridad referencial al arrancar
  (exits que apuntan a rooms inexistentes, gates con flags desconocidos, modelos sin registrar…). También se ejecuta en tests.
- Estado persistente del mundo = **flags** (`pickup:r03_dash`, `secret:r02_wall`, `boss:miniboss`…) en `Progression`.
  Las rooms se construyen leyendo flags, así que *reset room* y *respawn* son deterministas.

## 7. Eventos y UI desacoplada

`EventBus` tipado. La simulación **emite**; HUD, VFX, audio, cámara y analítica **escuchan**.
`HealthSystem` emite `health:changed`; un adaptador actualiza el `HudModel` (datos puros);
`HudView` pinta el modelo en DOM. Reemplazar la UI por PNG propios = sustituir `HudView`/skin sin tocar
ningún sistema. Catálogo de eventos: `src/gameplay/events.ts`.

## 8. Cámara (resumen; estudio completo en `docs/ART_DIRECTION.md` §Cámara)

`CameraRig` es matemática pura: *follow* con suavizado críticamente amortiguado, dead zone, look-ahead por
dirección/velocidad, seguimiento vertical por suelo (no sigue cada salto), límites de room corregidos por el
frustum visible, transiciones, shake por trauma y offset configurable. Proyección configurable;
por defecto **perspectiva con FOV estrecho** (parallax 3D real con distorsión casi nula en el plano de juego).

## 9. Rendimiento (presupuestos de partida)

| Recurso | Móvil gama media | PC |
|---|---|---|
| Draw calls por frame | ≤ 150 | ≤ 400 |
| Triángulos visibles | ≤ 250 k | ≤ 1 M |
| Luces dinámicas | ≤ 3 (sin sombra salvo la direccional) | ≤ 6 |
| Partículas vivas | ≤ 300 | ≤ 1500 |
| Pixel ratio máx. | 2 (con resolución dinámica) | 2 |

Medios: geometría estática de la room **fusionada por material y por segmento** (frustum culling útil),
`InstancedMesh` para vegetación y props repetidos, pooling de partículas/proyectiles/números de daño,
activación **por room** (solo existe la room actual), caché de materiales/geometrías con liberación al
descargar. Perfiles `low | medium | high` autodetectados y ajustables.

## 10. Testing

| Nivel | Herramienta | Qué cubre |
|---|---|---|
| Unitario | Vitest (node) | core, movimiento, combate, FSM, habilidades, gates, guardado/migraciones |
| Integración | Vitest (node) | `GameSession` headless con inputs guiados: salto/dash/ataque, daño, muerte, respawn, checkpoint, room reset, boss |
| Fugas | Vitest | listeners, timers, entidades duplicadas y estado corrupto tras N ciclos de carga/descarga/respawn |
| Diseño de niveles | Vitest | alcanzabilidad: el gap **solo** se cruza con dash; flujo de progresión completo |
| E2E / visual | Playwright + Chromium | arranque sin errores de consola, canvas no vacío, capturas a 844×390, presupuesto de draw calls |

## 11. Puntos de reemplazo

| Quiero reemplazar… | Toco | **No** toco |
|---|---|---|
| Personaje | `content/player.ts` (`model: {url, sockets, animations}`) + el `.glb` | `player/` lógica, combate, input |
| Enemigo / jefe | su `*Definition` + `.glb` | IA, combate |
| UI / HUD | `ui/skins/*` (PNG + manifiesto) o `HudView` | `HudModel`, sistemas |
| VFX | `VfxDefinition` (mismo id) | quien dispara el efecto |
| Audio | `AudioDefinition` (mismo id, `synth`→`file`) | quien reproduce |
| Entorno | `RoomDefinition.environment` (kit procedural → escena glTF) | colisión, gameplay |
| Controles | `input/bindings.ts` (datos) | `InputFrame`, gameplay |

## 12. Preparado para crecer (no implementado en la slice)

Muchas regiones/enemigos/jefes (más datos), múltiples habilidades (`AbilityDefinition` + handler), armas
(sockets + `AttackDefinition`), inventario, mapa, quests, NPCs y diálogos (sistema de eventos y flags ya
existente; se añadirían `dialogue/`, `quests/` como módulos de simulación), coleccionables (pickups + flags).
