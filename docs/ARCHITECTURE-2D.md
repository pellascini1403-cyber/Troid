# Arquitectura 2D — Troid

> **Estado:** implementada en el Prompt 4 (pasos S0–S11; [bitácora](PROMPT4-LOG.md)) y ampliada en el **Prompt 5** (pasos S12–S20; [bitácora](PROMPT5-LOG.md): entrada unificada, controles táctiles por gestos, HUD, magia, cartas, botellas, interacción, idioma y ajustes persistentes) · **Fecha:** 2026-10-06 · **Fase:** vertical slice jugable en 2D con PixiJS v8 por teclado, táctil y mando; Three.js retirado.
> Este documento conserva el diseño; donde la implementación se apartó de él, la desviación está anotada en el apartado (*«Implementado: …»*) y en la bitácora.
> Qué se construye: [GAME-SPEC-2D](GAME-SPEC-2D.md) · En qué orden y qué se conserva: [MIGRATION-2D](MIGRATION-2D.md) · Registro de decisiones: [ADR-0003](adr/0003-arquitectura-2d-definitiva.md).
>
> **Relación con [ARCHITECTURE.md](ARCHITECTURE.md):** sus principios, el bucle de 60 Hz, el modelo de datos, el sistema de eventos y la regla de pruebas **siguen vigentes**.
> Este documento **sustituye** lo que ese describe sobre Three.js, glTF, la cámara 3D, el pipeline de modelos, los presupuestos de render y los puntos de reemplazo del lado de la vista.
>
> Leyenda: ✅ verificado en esta sesión (código, medición o *benchmark*) · 📐 valor de diseño que vive en datos · ⚠️ no verificado todavía (se comprueba en el *spike* del Prompt 4 o en dispositivo).

---

## 1. Principios

1. **La simulación no sabe que existe un renderizador.** Todo lo que decide el resultado del juego es TypeScript puro, determinista y ejecutable sin navegador. PixiJS y el DOM solo existen en la capa de vista.
2. **PixiJS es la capa de presentación.** Dibuja lo que la simulación publica (`ActorViewState` + eventos); nunca decide gameplay ni escribe en la simulación.
3. **Los datos mandan.** Enemigos, habilidades, cartas, botellas, salas, VFX, sonidos y textos son `*Definition` (objetos tipados); añadir contenido es añadir datos.
4. **Todo asset es reemplazable sin tocar gameplay.** Sprites, animaciones, VFX, audio y UI se enlazan por **id lógico**; el gameplay habla en estados y anclas lógicos, nunca en archivos, fotogramas ni rutas.
5. **Mobile-first.** Cada decisión visual se valida a tamaño de teléfono; los presupuestos se **miden** (no se suponen).
6. **Nada se queda vivo sin dueño.** Listeners, timers y recursos GPU se registran en un `DisposableStore` / `Scheduler` con propietario; descargar una sala o cerrar el juego los libera. Hay tests que lo comprueban.
7. **Determinismo.** Simulación a 60 Hz fijos, azar solo por `Rng`, tiempo solo por `Scheduler`; la vista usa su propio tiempo real y su propio azar.
8. **El mundo va en el *canvas*; la interfaz va en el DOM.** HUD, controles táctiles, iconos de interacción y overlays son DOM (§8).
9. **Cero asignaciones por frame en régimen estable** en los caminos calientes (pooling, arrays preasignados).
10. **Orden de prioridad de diseño:** movimiento › combate › exploración › progresión › HUD › VFX › audio › contenido.

---

## 2. Capas y reglas de dependencia

```
┌──────────────────────────────── app/ (raíz de composición, navegador) ──────────────────────────────┐
│  VISTA / PLATAFORMA (pueden usar pixi.js, DOM, WebAudio, Capacitor)                                  │
│  render/  assets/  vfx/  audio/  ui/  debug/        input/sources/ (teclado, táctil, gamepad)        │
├──────────────────────────────────────────────────────────────────────────────────────────────────────┤
│  PRESENTACIÓN PURA (datos y matemática de presentación, sin Pixi ni DOM)                            │
│  presentation/  (vocabulario lógico, SpriteSetDefinition, VfxDefinition, palette, viewport, animation)│
├──────────────────────────────────────────────────────────────────────────────────────────────────────┤
│  SIMULACIÓN (TypeScript puro, sin pixi, sin DOM, determinista, headless)                            │
│  gameplay/ player/ combat/ abilities/ progression/ enemies/ bosses/ interaction/ world/ save/ i18n/ │
│  input/ (InputFrame, bindings, gestures/)   camera/ (CameraRig: matemática)                         │
├──────────────────────────────────────────────────────────────────────────────────────────────────────┤
│  core/  (math, EventBus, Scheduler, StateMachine, Pool, Rng, Observable, lifecycle, tiempo, log)    │
└──────────────────────────────────────────────────────────────────────────────────────────────────────┘
        content/  (instancias de *Definition: datos del juego)        tools/  (E2E, atlas, validadores)
```

| Módulo | Responsabilidad | Capa | Estado |
|---|---|---|---|
| `core/` | utilidades base | base | ✅ A |
| `presentation/` | vocabulario lógico (`AnimState`, `AnchorId`, *fallbacks*), `SpriteSetDefinition`, `VfxDefinition`, `RoomArtDefinition`, `palette`, matemática de viewport y de selección de fotograma | pura | B (nace de `models/`) |
| `gameplay/` | `GameSession`, orden del tick, `Actor`, `SimEntity`, flujo de muerte, transiciones, eventos | sim | B |
| `player/` | `Player`, `PlayerController` (FSM), `PlayerCombat`, `PlayerBody` (agachado), tuning, definición | sim | B |
| `combat/` | `AttackDefinition`, `Combatant`, `CombatSystem`, `Health`, geometría de hitboxes, proyectiles | sim | D (rescata el WIP) |
| `abilities/` | `SkillDefinition/Runtime`, `CardDefinition/Loadout`, `Magic`, `BottleSet`, `ModifierStack` | sim | D |
| `progression/` | `AbilitySystem` (posesión de habilidades), `Requirement`, `WorldFlags` | sim | A + D |
| `enemies/` · `bosses/` | `EnemyDefinition`, `Enemy`, `EnemyBrain` (FSM); contratos de jefe | sim | D |
| `interaction/` | `Interactable`, `InteractionSystem` | sim | D |
| `world/` | colisión, `RoomDefinition`, `RegionDefinition`, `RoomRuntime`, constructores | sim | A + B + D |
| `input/` | `InputFrame`, `bindings`, `InputManager`, `gestures/` (reconocedor táctil **puro**); `sources/` (plataforma) | mixto | B |
| `camera/` | `CameraRig` (matemática pura, sin pose 3D) | sim | B |
| `i18n/` | traductor y catálogos | pura | D |
| `save/` | `SaveData`, `SettingsData`, migraciones, adaptadores de almacenamiento | pura | D |
| `content/` | instancias de definiciones | datos | B |
| `render/` | `Renderer2D`, capas, vistas de sala y de actores, adaptador de cámara, efectos de pantalla | vista | C → D |
| `assets/` | carga y caché de atlas, validador de *sprite sets*, texturas procedurales | vista | C → D |
| `vfx/` | `VfxSystem`, `VfxDirector`, emisores | vista | D |
| `audio/` | motor WebAudio, director de eventos, música | vista | D |
| `ui/` | HUD, controles táctiles, prompts, overlays, *skins* | vista | D |
| `debug/` | panel oculto, *tuning*, overlays de colliders/hitboxes | vista | A + B |
| `app/` | `Game2D` (composición), `GameLoop`, opciones, arranque | plataforma | B |

### 2.1 Reglas de dependencia (las comprueba `tests/unit/architecture.test.ts`)

Las **existentes** ✅ se mantienen: `core` no importa de nadie · la simulación no importa vistas ni globals del DOM · solo `app/` y `content/` importan `content/` · nada de `setTimeout`, `setInterval`, `requestAnimationFrame`, `Math.random`, `Date.now`, `performance.now`, `window`, `document`, `navigator`, `localStorage` ni `addEventListener` en la simulación.

Se **añaden** (Prompt 4, paso S4; están en MIGRATION-2D §6):

| Regla | Motivo |
|---|---|
| `pixi.js` solo en `render/`, `assets/`, `vfx/`, `debug/` y `app/` | PixiJS es presentación |
| `three` prohibido en todo el repositorio | Three.js sale de la arquitectura |
| `ui/` no importa `pixi.js` ni `render/` | el HUD es DOM y no depende del renderer |
| `render/`, `vfx/`, `assets/` no importan `ui/` | la vista del mundo no conoce la interfaz |
| `presentation/` e `i18n/` solo importan `core/` | datos puros, testeables en Node |
| ningún literal de texto de interfaz asignado a `textContent`/`innerText`/`innerHTML` en `ui/` | localización desde el principio (§9) |

> **Implementado en el Prompt 5:** todas estas reglas se cumplen y las comprueba `tests/unit/architecture.test.ts`, que en el Prompt 5 ganó: `abilities/`, `interaction/`, `save/`, `i18n/` y `input/` (salvo `input/sources/`, plataforma) entre los módulos **puros** (sin Pixi, sin DOM, sin globales) · `ui/` no importa `pixi.js` ni `render/` (el HUD, el icono de interacción, los controles táctiles y el menú son DOM) · solo `app/` y `content/` importan `content/` · los catálogos `es.json`/`en.json` tienen las mismas claves y parámetros, **ningún texto idéntico** entre ambos y **ninguna clave huérfana** (cada clave aparece como literal en `src/`; las claves de datos se escriben `*Key:`).

---

## 3. Estructura de carpetas propuesta

`[A]` conservar · `[B]` adaptar · `[C]` reemplazar · `[D]` nuevo. Se detalla archivo a archivo en MIGRATION-2D §3.

```
src/
├─ core/                       [A]  EventBus · Scheduler · StateMachine · Pool · Rng · Observable · lifecycle · math · time · log · ids
├─ presentation/               [B]  (nace de models/) — PURO, sin Pixi ni DOM
│   ├─ vocabulary.ts                AnimState · AnchorId · fallbacks · one-shot
│   ├─ SpriteSetDefinition.ts  [D]  manifiesto de sprites (clips, fases, anclas, escala de arte)
│   ├─ animation.ts            [D]  selección de clip y fotograma (por tiempo y por fase)
│   ├─ viewport.ts             [D]  proporción, px por metro, barras, resolución
│   ├─ worldTransform.ts       [D]  cámara → pivote/escala del contenedor del mundo
│   ├─ VfxDefinition.ts        [D]
│   ├─ RoomArtDefinition.ts    [D]  capas de parallax, props, luz (separado de la colisión)
│   └─ palette.ts              [D]  tokens de color (GAME-SPEC-2D §3.2)
├─ gameplay/                   [B]  GameSession · SimServices · SimEntity · Actor · actorViewState · events
│   ├─ DeathFlow.ts            [D]
│   └─ RoomTransition.ts       [D]
├─ player/                     [B]  Player · PlayerController · MovementTuning · PlayerDefinition · playerAnimation
│   ├─ PlayerCombat.ts         [D←WIP]
│   └─ PlayerBody.ts           [D]  altura de pie/agachado, espacio para levantarse
├─ combat/                     [D←WIP]  AttackDefinition · Combatant · CombatSystem · Health · hitboxGeometry · Projectile
├─ abilities/                  [D]  SkillDefinition · SkillRuntime · CardDefinition · CardLoadout · Magic · BottleSet · BottleEffects · ModifierStack
├─ progression/                [A]  AbilitySystem   (+ [D] Requirement · WorldFlags)
├─ enemies/                    [D]  EnemyDefinition · Enemy · EnemyBrain · archetypes/inkSlime
├─ bosses/                     [D]  solo contratos hasta el Prompt 6
├─ interaction/                [D]  Interactable · InteractionSystem
├─ world/                      [B]  collision [A] · RoomDefinition [B] · builders [A] · RegionDefinition [D] · RoomRuntime [D]
├─ input/                      [B]  InputFrame · bindings · InputManager
│   ├─ gestures/               [D]  TouchGestureRecognizer (PURO) · TouchConfig
│   └─ sources/                     KeyboardMouseSource [A] · TouchSource [D] · GamepadSource [D]   (plataforma)
├─ camera/                     [B]  CameraRig (sin pose 3D)
├─ i18n/                       [D]  translator · locales/es.json · locales/en.json
├─ save/                       [D]  SaveData · SettingsData · migrations · StorageAdapter(s)
├─ content/                    [B]  player · abilities · skills · cards · bottles · enemies · rooms/ · sprites · vfx · audio
├─ render/                     [C→D]  Renderer2D · layers · RoomView2D · ParallaxLayer · ActorSprite · ProceduralActor · ActorViews · CameraAdapter2D · ScreenFx
├─ assets/                     [C→D]  SpriteAssetManager · atlasLoader · validateSpriteSet · proceduralTextures
├─ vfx/                        [D]  VfxSystem · VfxDirector · emitters
├─ audio/                      [D]  AudioEngine · AudioDirector · MusicDirector · manifest
├─ ui/                         [D]  hud/{HudModel,HudView} · touch/{TouchControls,PointerRouter,layout} · prompts/ · overlays/ · skins/
├─ debug/                      [A/B]  DebugPanel · DebugState · DebugActions · TuningInspector · FpsMeter · ColliderOverlay [B→Pixi]
└─ app/                        [B]  Game2D [D] · GameLoop [A] · dom [A] · options [B] · main [A] · labs/spriteLab [D]
tests/   unit/ integration/ e2e/ helpers/            tools/  e2e/ · atlas/ (validación)
```

Módulos que **no** existen en la carpeta hasta que se necesiten: `bosses/` (contratos en el Prompt 4, implementación en el 6), `save/` (contratos en el 5, implementación en el 6), `audio/` (arquitectura ahora, motor en el 5/7).

> **Estado real tras el Prompt 5.** `abilities/` = `Magic · BottleSet · CardLoadout (con `CardDefinition`) · SkillDefinition · SkillRuntime` (`ModifierStack` y `BottleEffects` **no existen**: no hay mejoras ni más efectos que `heal`; llegan cuando los necesite una mejora real). `interaction/` = `Interactable · InteractionSystem`. `input/` = `InputFrame · InputManager · bindings · glyphs · gestures/{TouchGestureRecognizer, TouchConfig} · sources/{KeyboardMouseSource, TouchSource, GamepadSource, VirtualPad}`. `ui/` = `hud/{HudModel, HudView, layout} · touch/{TouchControls, layout} · prompt/InteractionPrompt · settings/{PauseButton, SettingsMenu} · overlays/{DeathOverlay, deathOverlayModel} · icons · safeArea` (no hay `skins/` todavía). `save/` = `SettingsData · SettingsStore · StorageAdapter` (**solo ajustes**; el progreso es del Prompt 6). `app/` = `Game2D · GameLoop · devTools · storage · dom · options · main · labs/`. `gameplay/` ganó `PlayerStatus` y `Projectile`.

---

## 4. Contrato simulación → vista

Es lo que hace posible reemplazar sprites, animaciones y renderer sin reescribir gameplay. **No cambia**: solo se **amplía** (campos y eventos nuevos, sin retirar ninguno salvo `z`).

### 4.1 `ActorViewState` ✅ (se amplía)

```ts
interface ActorViewState {
  prevX; prevY; x; y;            // centro de los pies, tick anterior y actual (interpolación)
  facing: 1 | -1;
  anim: AnimState;               // estado LÓGICO: 'idle' | 'run' | 'attack1' | 'crouch' | 'telegraph' …
  animSpeed; animSerial;         // velocidad de reproducción; se incrementa para reiniciar el clip
  animDuration;                  // > 0: ajusta el clip a esta duración (segundos)
  flash; opacity; blink; visible;
  // NUEVO — animación guiada por fases (el fotograma sale de la simulación, no del tiempo real):
  phase: 'none' | 'startup' | 'active' | 'recovery';
  phaseT: number;                // progreso 0..1 dentro de la fase
}
// z (carriles de profundidad 3D) se retira
```

La vista **lee** este objeto y **escucha** eventos; **no escribe** en la simulación.

### 4.2 Eventos ✅ + nuevos

Convención `<sujeto>:<verboPasado>`; cargas de **datos planos** (nunca un nodo de Pixi o del DOM). El `EventBus` es síncrono y aísla errores de los *handlers*; los *handlers* de la vista **no modifican** la simulación.

| Grupo | Eventos | Escuchan |
|---|---|---|
| Movimiento ✅ | `player:jumped` · `player:landed` · `player:dashed` · `player:dashEnded` | VFX · audio · cámara |
| Combate (WIP) | `player:attacked` · `combat:hit` · `health:changed` · `actor:died` · `player:hurt` · `player:died` | VFX · audio · cámara (shake) · HUD |
| Recursos | `magic:changed` · `skill:cast` · `skill:denied` · `bottle:changed` · `bottle:used` · `bottle:denied` · `card:equipped` | HUD · VFX · audio |
| Progresión ✅ | `ability:unlocked` · `ability:locked` · `flag:set` | HUD · mundo |
| Interacción | `interaction:available` · `interaction:lost` · `interaction:performed` | HUD (icono) · audio |
| Mundo | `room:exiting {ticks}` · `room:entered` · `exit:reached` · `entity:spawned` · `entity:despawned` | vista · cámara · audio |
| Muerte | `death:started` · `death:fadeOut` · `death:respawned` | overlays · audio · cámara |
| Enemigos | `enemy:alerted` · `enemy:telegraph {ticks}` | VFX · audio |

> **Implementado en el Prompt 5** (nombres reales, `gameplay/events.ts`): `magic:changed {current, max, delta, reason: spend | regen | restore | set}` · `skill:cast {skillId, x, y, facing, cost}` · `skill:denied {reason: noMagic}` · `projectile:ended {reason: hit | wall | range}` · `bottle:changed {type: used | recharging | recharged | added | refilled, slot, states}` · `bottle:drinkStarted` · `bottle:drunk {slot, healed}` · `bottle:interrupted {reason: hit | air | full}` · `bottle:denied {reason: none | full}` (no existe `bottle:used`) · `card:changed {type: acquired | equipped | unequipped, cardId}` (no `card:equipped`) · `interaction:available | lost | performed` · `flag:set | flag:cleared` · `gate:changed` · `exit:reached` · `room:loaded` · `death:started | fadeOut | respawned | fadeIn`. El cambio de idioma **no** es un evento del bus: es el *observable* `Translator.changed` (§9).

### 4.3 Modelos de vista (puros)

`HudModel` (vida, magia, carta, botellas, prompt de interacción, jefe) es un objeto **plano** que se actualiza por eventos y se **vuelca al DOM solo si cambió** (§8). Cambiar de interfaz = cambiar `HudView`/*skin*, no los sistemas.

---

## 5. Simulación

### 5.1 Orden del tick (actualiza ARCHITECTURE.md §3)

```
GameSession.tick(input):
   0  hit-stop: si quedan ticks de congelación → se restan, los pulsos de entrada se conservan y NO avanza nada más
   1  jugador            (FSM: temporizadores → estado → integra) · publica hitboxes activos
   2  entidades          (enemigos, jefes, proyectiles: IA → intención → movimiento)
   3  combate            (hitboxes activos vs hurtboxes → daño, knockback, eventos, petición de hit-stop)
   4  interacción        (elige candidato y emite available/lost)
   5  disparadores       (salidas, peligros, pickups, nodos de guardado, arenas)
   6  recursos           (regeneración de magia, recarga de botellas, enfriamientos)
   7  flujos             (muerte/respawn, transición de sala)
   8  vaciado de entidades (alta/baja diferidas: nada se elimina mientras otro itera)
   9  scheduler          (temporizadores de simulación)
```

El orden es **parte del contrato**: los tests de determinismo ✅ (mismo input ⇒ mismo estado, bit a bit) lo cubren y se amplían con combate, enemigos y recursos.

> **Implementado** (`GameSession.tick`): `0` hit-stop (resta, **conserva los pulsos** de entrada y no avanza nada más) → `muerte` (una pulsación tras 30 ticks de pantalla negra salta la espera y **esa pulsación se gasta**) → `1` jugador → `2` entidades (enemigos, **proyectiles**) → `3` combate → `4` **interacción** (`interaction.update`, con el jugador ya movido y el combate ya resuelto; `enabled = !muerto`) → `6` recursos (`magic.tick(lanzando)`, `bottles.tick()`, `skills.tick()`: **congelados por el hit-stop** como el resto del mundo) → `7` flujos (suelo seguro, rescate, salidas) → `8` vaciado de entidades → `9` *scheduler* (el flujo de derrota vive aquí). Un detalle que importa: lo que ocurre **después** del paso 4 (el rescate del paso 7 mueve al jugador) deja el icono de interacción un tick desfasado; el siguiente tick lo corrige y ningún sistema lo lee entre medias.

### 5.2 `GameSession` y servicios

`GameSession` posee el bus, el *scheduler*, el `Rng`, `abilities`, `collision`, `combat`, las entidades, el estado de muerte y los flags. Las entidades reciben **`SimServices`** (superficie mínima ✅, ampliada como en el WIP): `bus`, `scheduler`, `rng`, `abilities`, `collision`, `combat`, `player` (solo lectura, `PlayerTarget`), `now`, `godMode`, `spawn/despawn`, `requestHitStop`. Nunca el objeto sesión completo.

### 5.3 Jugador

`Player` (Actor) posee: `health`, `combat` (`PlayerCombat`), `body` (`PlayerBody`), `magic`, `bottles`, `loadout`. `PlayerController` orquesta la FSM (`free · crouch · dash · attack · cast · drink · hurt · dead · locked`) usando la `StateMachine` existente ✅ y **no cambia** el comportamiento de `free` y `dash` (los 40 tests lo garantizan).
`playerAnimation.deriveAnimation()` sigue siendo una **función pura** (estado de lógica → `AnimState` + velocidad) y se amplía con los estados nuevos.

`PlayerBody` resuelve la altura de pie/agachado y el espacio para levantarse con `CollisionWorld.overlapsSolid` ✅ (sin tocar la colisión).

> **Implementado:** estados `free · crouch · dash · attack · cast · drink · interact · hurt · dead` (no hay `locked`). Prioridad de entrada: muerto > herido > `dash` > ataque > **Habilidad** > **botella** > **interactuar** > agacharse > libre. `free`, `crouch` y `dash` **no cambiaron** (los tests de movimiento del Prompt 4 siguen pasando sin tocarlos). Habilidad, botella e interactuar comparten el mismo *buffer* de 0.12 s. Un reinicio (`controller.reset()`) devuelve a `free`: **por eso `rescuePlayer()` no se lo hace a un héroe muerto** (corregido en S20: un cadáver que caía por debajo del mundo recuperaba el control con 0 de vida).

### 5.4 Combate

Pipeline (del WIP, ver MIGRATION-2D §5): el atacante **envía** un `HitboxSubmission` en sus ticks activos → `CombatSystem.resolve()` prueba cada envío contra los `Combatant` (hurtboxes en orden de prioridad) → aplica `receiveHit`, emite `combat:hit` y `health:changed`, y pide **hit-stop** (gana la petición más larga). Reglas: **hit-once** por instancia de ataque · `canHit` por equipos (el jugador golpea también a neutrales; el enemigo no) · orden de iteración estable (determinismo) · el multiplicador de la hurtbox escala el daño.
Todo es dato: `AttackDefinition` en ticks, hitbox en metros relativos al cuerpo.

### 5.5 Recursos

```ts
class Health  { current; max; damage(n); heal(n); setMax(n); restore() }                      // WIP ✅
class Magic   { current; max; regenPerTick; regenDelayTicks; canSpend(n); spend(n); tick() }  // regeneración gradual
class BottleSet {                                                                              // 3–4 ranuras
  slots: { definitionId; state: 'ready' | 'empty' | 'recharging'; progressTicks }[]
  canUse(slot, ctx); use(slot, ctx); tick(ctx)             // recarga SECUENCIAL por reglas
}
interface BottleDefinition { id; nameKey; iconId; effect: { type: 'heal' | 'shield' | 'burst'; params }; recharge: RechargeRule[] }
type RechargeRule = { type: 'time'; seconds; sequential } | { type: 'checkpoint'; refill: 'all' | 'one' } | { type: 'hits'; count } | { type: 'kills'; count }
```

Los efectos de botella son un **registro** (`heal`, `shield`, …) con `isUseful(ctx)` y `apply(ctx)`; la magia y las botellas son independientes.

> **Implementado:** `Magic` (milésimas enteras + acarreo: determinista bit a bit; `spend · restore · set · tick(blocked)`), `BottleSet` (`ready · empty · recharging`; recarga secuencial; `resolve · consume · addSlot · refillAll`; el efecto `heal` es un dato `{type:'heal', amount}` y el canal `channelSeconds` también), `CardLoadout` (una equipada o ninguna). Los tres son **estado puro**: qué hace *beber* (canal, interrupción, curación) es del `PlayerController`, y la regla «¿se puede lanzar ahora?» (`ok · noSkill · cooldown · noMagic`) es de `SkillRuntime`, compartida por el jugador, la carta del HUD y el botón de Habilidad. `GameSession.status(out)` rellena un `PlayerStatus` reutilizable (**sin asignar por fotograma**): es la **única puerta** por la que la interfaz lee al jugador.

### 5.6 Habilidades y cartas

`AbilitySystem` (posesión) ✅ responde «¿puede el jugador hacer X?»; **no** se duplica. `SkillDefinition` describe una habilidad **activa**: coste, enfriamiento, temporización de lanzamiento, *handler* por id y parámetros (p. ej. un proyectil). `SkillRuntime` gestiona enfriamientos y `canCast/cast`. `CardDefinition` referencia una habilidad y modificadores; `CardLoadout` guarda las cartas poseídas y la **equipada**. El botón de Habilidad ejecuta `loadout.equipped.skillId`, nunca un id fijo.
`ModifierStack` aplica modificadores aditivos/multiplicativos **con origen**, que se retiran sin residuos (mejoras del dash, cartas).

Glosario para no confundir: **Ability** = posesión/progresión (`AbilitySystem`); **Skill** = habilidad activa con coste; **Card** = la forma de equipar una Skill; **Bottle** = carga de recarga lenta.

### 5.7 Interacción

`InteractionSystem` recibe la posición del jugador y la lista de `Interactable` (entidades), elige el **más cercano** válido con histéresis y emite `available/lost`; `interactPressed` (o el toque en el icono) ejecuta la acción registrada: `pickup` (escribe flags y concede carta/habilidad), `door` (`loadRoom`), `lever`/`switch` (activa/desactiva un `Collider`), `node` (punto de guardado).

> **Implementado:** `InteractionSystem` (puro) con acciones de un conjunto cerrado (`acquireCard · addBottleSlot · setFlag · clearFlag`: una recompensa escribe **flags**, que es lo que la hace sobrevivir a una muerte) y su anfitrión `InteractionHost` (la sesión). `door` como `loadRoom` y `node` (guardado) **no existen todavía** (Prompt 6): una puerta de sala es hoy un sólido que se apaga con una bandera (`gates`), y una palanca es una acción `setFlag`.

### 5.8 Muerte y reinicio

`DeathFlow` es una máquina de fases en **ticks** con `Scheduler` y dueño: `dying (≈72) → fadeOut (30) → hold (60) → respawn → fadeIn (30)` (parámetros en datos). `RespawnPoint = { room, entry }` (la entrada de la sala hoy; el último nodo de guardado en el Prompt 6). El reinicio recarga la sala (`loadRoom`, ✅ reconstruye colisión sin fugas), restaura vida y magia y **no** rellena botellas.

> **Endurecido en S20:** una muerte **durante el `fadeIn`** (el héroe ya vive y puede volver a caer: un peligro, un golpe fuerte) **reinicia la derrota** (cancela el temporizador pendiente y vuelve a `dying`); antes `start()` la ignoraba y el héroe quedaba muerto sin flujo que lo devolviera. Hoy no hay contenido que lo provoque (el slime hace 1 de daño y el héroe vuelve con 5), pero sí lo harán los peligros y el jefe del Prompt 6.
>
> **Implementado: `DeathFlow`** (`gameplay/DeathFlow.ts`): `dying 72 → fadeOut 30 → hold 60 → reaparición → fadeIn 30` en **ticks de simulación**, `skipAfter 30` (cualquier botón tras 30 ticks de pantalla negra salta la espera y **esa pulsación se gasta**: no actúa en el jugador que vuelve). El tick de la muerte cuenta como el primero de `dying` y el hit-stop de la muerte (8) no cuenta: la reaparición llega 161 ticks después de `death:started`. El overlay es DOM (`ui/overlays`), sin texto literal (`t(clave)`), y se reconstruye con `room:loaded`.

### 5.9 Enemigos

`EnemyDefinition { id, nameKey, health, body, hurtboxes[], ai: { archetype, params }, attacks, telegraph: { ticks, vfx }, view: { spriteSetId | proceduralId } }`.
`Enemy` es `SimEntity` + `Combatant` + `Actor`. `EnemyBrain` es una FSM (`StateMachine` ✅): `idle/patrol → detect → approach → telegraph → attack → recover → hurt → dead`. Percibe al jugador solo por `PlayerTarget` (lectura) y decide con `Rng` determinista. Los arquetipos (volador, rápido, a distancia, blindado, minijefe) son nuevas definiciones + un `EnemyBrain` por arquetipo.

> **Implementado: `enemies/`** — `EnemyDefinition` (datos; `telegraph.ticks` es el `startup` del ataque, un solo número), `Enemy` (`SimEntity` + `Combatant` + `Actor`), `EnemyBrain` (interfaz) y `archetypes/inkSlime.ts` (FSM sobre `StateMachine`; `archetypes/index.ts` elige el cerebro por `ai.archetype`: un arquetipo nuevo es un `case` más). `senses.ts` (puro): suelo delante y línea de visión. La vista elige por `def.view`: `proceduralId` → `render/ProceduralActor` (hoy); `spriteSetId` → el contrato está en el tipo, la fábrica se completa con el arte (P7). Eventos: `enemy:alerted`, `enemy:telegraph`.

### 5.10 Jefes (contratos; implementación en el Prompt 6)

`BossDefinition { phases: [{ id, hpThreshold, patterns[] }], arena }` · `BossController` (FSM con fases y *telegraphs*) · `ArenaController` (límites de cámara, puertas, música) · barra de vida en `HudModel`. Comparte con `Enemy` los contratos `Combatant` (hurtboxes múltiples con `part` ✅ en el WIP) y `SimEntity`.

### 5.11 Mundo

`RoomDefinition` se amplía con campos **opcionales** (`exits`, `spawns`, `interactables`, `hazards`, `cameraZones`, `art`, `music`, `ambient`, `palette`), por lo que una sala escrita hoy sigue funcionando. `RoomRuntime` instancia entidades leyendo **flags** (`WorldFlags`: `pickup:…`, `seal:…`, `boss:…`) para que *reset de sala*, reaparición y carga de partida sean deterministas. `RoomTransition` ejecuta el protocolo `locked → room:exiting → loadRoom → room:entered` en **ticks** (GAME-SPEC-2D §14.2). `validateContent()` comprueba la integridad referencial (salidas a salas inexistentes, spawns de definiciones desconocidas, ids de sprite/habilidad/sonido/clave de texto que no existen) al arrancar y en tests.

> **Implementado en el Prompt 4:** `RoomDefinition` gana `spawns` (`{enemy, x, y, facing, defeatFlag}`), `gates` (`{solid, openWhen}`: un sólido de la sala que se apaga con una bandera), `exits` (`{rect, to?}` → `exit:reached`), `nameKey` y `art` (fondo provisional). `progression/WorldFlags` (puro; `has/set/clear/list/restore`) es la **única memoria** que sobrevive a una muerte o a una recarga; `GameSession` construye la sala completa al cargarla (los enemigos ya están en el mundo), no vuelve a colocar a un guardián cuya `defeatFlag` esté puesta y emite `flag:set`, `gate:changed` y `exit:reached` (una vez por salida y construcción). `world/validateRoom` (puro) + `tests/unit/content/rooms.test.ts` cubren la integridad referencial y física de **todas** las salas (entradas y spawns no enterrados y con suelo, enemigos y claves de texto que existen, puertas que apuntan a un sólido real y a una bandera alcanzable). Lo que sigue pendiente (P6): `RoomTransition` (fundido y carga con `ExitDef.to`), `interactables`, `hazards`, `cameraZones` y guardado de las banderas.

---

## 6. Input

### 6.1 `InputFrame` (se amplía; compatible hacia atrás ✅)

Se conserva todo lo existente (`move`, `jump*`, `attack*`, `dash*`, `ability*`, `pausePressed`, `device`) y se **añaden**: `bottlePressed`, `bottleSlot` (−1 = siguiente lista, 0..3 = ranura), `interactPressed`, `dropPressed`. `createInputFrame()` los inicializa; los tests y el `Driver` existentes siguen funcionando sin cambios. Los pulsos siguen **latcheados** ✅: ningún toque corto se pierde entre ticks.

### 6.2 Fuentes y agregación

`InputManager` ✅ agrega cualquier número de fuentes: OR de los estados mantenidos, latch de bordes, eje más fuerte, último dispositivo (para glifos), liberación por fuente en `blur`/`pointercancel`/desconexión. Se amplía con `requestBottle(slot)`.

| Fuente | Estado | Notas |
|---|---|---|
| `KeyboardMouseSource` | ✅ A | libera todo al perder el foco |
| `TouchSource` | D (Prompt 5) | une `TouchGestureRecognizer` + `TouchControls` |
| `GamepadSource` | D (Prompt 5) | *polling* en `sample()`, mapeo estándar, deadzone radial 0.22, alta/baja en caliente |

> **Implementado en el Prompt 5** (S13): las tres fuentes existen ✅ y entran por el **mismo** `InputManager` (no hay un camino paralelo al juego). Fuente por dispositivo; `registerSource(id, device, modo de ejes)`. **Contrato de ejes** (`InputFrame`): digital independiente por eje (−1/0/1, dos teclas dan (±1, ±1)), el stick `radial` (disco unidad), el táctil `independent` (cada eje recortado por separado), y con varias fuentes cada eje toma el de mayor magnitud. `TouchSource` da **un dueño único por dedo** (`down/move/up/cancel/releaseAll`; devuelve si el dedo quedó con algo). `GamepadSource` (`attachGamepad`) lee un `PadProvider` (el navegador, o un `VirtualPad` abstracto: el mismo en pruebas unitarias, de integración y E2E), **zona muerta radial 0.22**, *polling* por `sample()`, el mando en uso es el primero conectado y se mantiene, y al desconectarse suelta todo. `KeyboardMouseSource` mantiene una acción **mientras cualquiera de sus teclas/botones siga abajo** (S20) y un `blur`/`visibilitychange` los olvida a todos; una tecla escrita en un elemento `data-ui-block` (el menú, el panel de depuración) **no es entrada de juego**, salvo la de pausa. `InputManager` hace *latch* de los bordes (un toque más corto que un tick no se pierde), `requestBottle(fuente, ranura)` (−1 = la siguiente lista) y `noteUse(fuente)` (el dispositivo en uso, para el glifo del icono de interacción: `input/glyphs.ts`, derivado de los *bindings*). Gestos, botones y disposición táctil con los números de GAME-SPEC-2D §4.3 sin cambios.

### 6.3 `TouchGestureRecognizer` (TypeScript **puro**)

Entrada: eventos de puntero sintéticos `{id, tipo, x, y, t}` en dp. Salida por tick: `{ ax, ay, jumpPressed, jumpHeld, jumpReleased, dropPressed }`. Estado: puntero de movimiento, origen flotante, armado del salto. Parámetros: `TouchConfig` (GAME-SPEC-2D §4.3.1). Algoritmo:

```
down(p):   si !zonaOcupada && p en zona → mov = p; O = p.pos; armado = true
move(p):   si p == mov →
             d = p.pos − O
             si |dx| > Rx → O.x += dx − sign(dx)·Rx          (origen flotante)
             si |dy| > Ry → O.y += dy − sign(dy)·Ry
             ax = clamp(dx/Rx), ay = clamp(−dy/Ry)
             si armado && ay ≥ jumpEnter && ayPrev < jumpEnter → jumpPressed (latch); armado = false; jumpHeld = true
             si !armado && ay ≤ jumpRearm → armado = true
             si jumpHeld && ay < jumpHold → jumpHeld = false; jumpReleased (latch)
             si flick hacia abajo (≥ dropFlickDistance en ≤ dropFlickWindow) → dropPressed (latch)
up/cancel(p): si p == mov → release(); jumpHeld → jumpReleased; zona libre
```

Se prueba con secuencias sintéticas: correr · saltar · *flick* · deriva · inversión de dirección · segundo dedo · cancelación · `blur` · cambio de orientación · agacharse y saltar sin soltar.

### 6.4 `TouchControls` (DOM, `ui/touch/`)

Capa `#touch` con `pointer-events: none` y **hijos interactivos** (`pointer-events: auto`): zona de movimiento (invisible), botones Ataque/Dash/Habilidad, chip de botella, y —por encima de la zona— iconos de interacción y botellas del HUD. Un `PointerRouter` asigna **un dueño por `pointerId`** en `pointerdown` (`setPointerCapture`) y lo conserva hasta soltar; `pointercancel`, `lostpointercapture`, `blur`, `visibilitychange`, `resize`/orientación y pausa liberan todo lo que ese puntero sostenía. Disposición (esquina segura, `uiScale`, `edgeMargin`) desde datos; todo se registra en un `DisposableStore`.

### 6.5 Mapeo, remapeo y prompts

`bindings` es **dato** ✅ (teclado por `KeyboardEvent.code`, ratón, gamepad estándar). El remapeo es editar y guardar ese objeto (`SettingsData`). `InputFrame.device` decide el glifo del icono de interacción y de los avisos.

### 6.6 Pruebas

Unitarias: reconocedor, `InputManager` multi-fuente ✅ (13), teclado ✅ (12), gamepad, `TouchSource`, `TouchControls` en `happy-dom`. Integración: gestos → `InputFrame` → `GameSession` (`touchControls`, `gamepad`) y **dos sondeos aleatorios** (`inputSoak`: teclado + ratón + cinco dedos + mando a la vez contra un modelo ingenuo de «una acción está mantenida mientras CUALQUIER entrada física ligada a ella lo esté»; `touchDomSoak`: eventos de puntero contra los elementos reales con botones que aparecen y desaparecen bajo un dedo). **E2E táctil** con toques CDP (`Input.dispatchTouchEvent` ✅ dos punteros verificados) para las combinaciones de la matriz de GAME-SPEC-2D §4.3.7 (`touch`, y la mitad táctil de `vertical`, que juega R1 de un solo dedo). Dispositivo real: ⚠️ pendiente (**nada de lo táctil ni del mando se ha verificado en un iPhone, un Android ni un mando físico**).

---

## 7. Renderizado 2D con PixiJS v8

> PixiJS **no está instalado** en el Prompt 3. Todo lo marcado ✅ salió del *benchmark* y de la sonda de multitáctil realizados en la auditoría (proyecto temporal fuera del repositorio, `pixi.js 8.22.0`). Lo marcado ⚠️ es **intención de diseño**: se confirma en el *spike* del Prompt 4 (paso S1) y esta sección se corrige si difiere.

### 7.1 Por qué Pixi y qué evidencia hay ✅

800 sprites animados de un único atlas a 1280×720: **1 *draw call*** con Pixi frente a 800 con `THREE.Sprite`; bundle de Pixi 148.9 KB gz frente a 163.8 KB del *chunk* de Three actual (−15 KB). Alternativa de reversión (ADR-0002): Three ortográfico con *batcher* propio.
Este *benchmark* es una **referencia técnica**: el juego no pinta 800 sprites de forma permanente (presupuesto real: §7.10).

### 7.2 Estructura del renderer (`render/`, `assets/`, `vfx/`)

| Archivo | Responsabilidad | Pixi |
|---|---|:-:|
| `render/Renderer2D.ts` | posee la `Application`; inicializa (`await app.init({…})`), redimensiona, destruye; expone las capas; un único `render()` por frame | sí |
| `presentation/viewport.ts` | **puro**: proporción admitida, px por metro, barras, resolución efectiva | no |
| `presentation/worldTransform.ts` | **puro**: centro de cámara + `viewHeight` + *shake* → pivote/escala del mundo, con redondeo a píxel | no |
| `render/layers.ts` | crea los contenedores de capa y expone *handles* tipados | sí |
| `render/RoomView2D.ts` | dibuja la sala: *blockout* de rectángulos hoy; capas de arte y props después (`RoomArtDefinition`) | sí |
| `render/ParallaxLayer.ts` | capa con factor de parallax y *tiling* opcional | sí |
| `render/ActorSprite.ts` | actor por fotogramas: lee `ActorViewState`, aplica `SpriteAnimator`, anclas, giro, destello, parpadeo | sí |
| `render/ProceduralActor.ts` | actor por formas y deformación (enemigos de tinta, *proxy* del protagonista) | sí |
| `render/ActorViews.ts` | registro entidad → vista, con *pool*; escucha `entity:spawned/despawned` | sí |
| `render/CameraAdapter2D.ts` | aplica `CameraRig` al mundo con `worldTransform` | sí |
| `render/ScreenFx.ts` | viñeta, fundidos, destello, barras laterales (capa de pantalla) | sí |
| `assets/SpriteAssetManager.ts` | carga y caché de atlas, descarga única, **ref-count** | sí |
| `assets/validateSpriteSet.ts` | contrato de un *sprite set* (§7.5) | no* |
| `vfx/VfxSystem.ts` · `VfxDirector.ts` | efectos con *pooling* dirigidos por eventos (§7.7) | sí |
| `debug/ColliderOverlay.ts` | colliders, hitboxes, hurtboxes, límites de cámara (`Graphics`) | sí |

\* el validador opera sobre datos y metadatos del atlas; no necesita Pixi (se prueba en Node).

### 7.3 Ciclo de render

El bucle **es el nuestro** ✅ (`GameLoop`: paso fijo de 60 Hz + interpolación). Pixi se inicializa con `autoStart: false` ✅ y el renderer se invoca **a mano** una vez por frame (`app.render()` ✅): sin segundo bucle y sin el *ticker* de Pixi.

```
rAF(timeMs) → GameLoop.onFrame
   realDt = (timeMs − last)/1000
   n = stepper.advance(realDt·timeScale, tick)            // tick(): session.tick(input.sample())  — 60 Hz fijos
   frame(alpha, realDt):                                  // alpha ∈ [0,1): posición entre los dos últimos estados
      actorViews.sync(alpha)       x = prevX + (x − prevX)·alpha ; flip por facing ; anim ← ActorViewState
      camera.update(realDt)        CameraRig sobre la posición INTERPOLADA (cámara y personaje no vibran por separado ✅)
      cameraAdapter.apply()        worldTransform: pivote/escala del contenedor «world» (+ redondeo a píxel)
      parallax.update(cam)         pivote por capa = cámara × factor
      vfx.update(realDt)           tiempo real: inmune al hit-stop
      screenFx.update(realDt)
      hud.flush()                  DOM solo si cambió (§8)
      renderer.render()            ← UNA llamada a app.render()
```

- **Hit-stop y pausa:** la simulación se congela; el render sigue. La animación guiada por fases se congela sola (deriva de ticks); cámara, partículas y *shake* siguen en tiempo real.
- **Segundo plano:** `visibilitychange` detiene el bucle y libera el input ✅ (hoy ya ocurre); al volver se reinicia el reloj (`resetClock`) ✅.
- **Pérdida de contexto WebGL:** escuchar `webglcontextlost`/`webglcontextrestored` en el *canvas*, pausar y reanudar; comprobar que Pixi vuelve a subir las texturas ⚠️ (R5).

### 7.4 Grafo de escena (orden de capas, de atrás hacia delante)

Todo el mundo vive en **metros**: el contenedor `world` tiene `scale = px por metro` y `pivot = centro de cámara` (con el eje Y de la vista invertido respecto a la simulación: `viewY = −y`, una sola vez en `presentation/worldTransform.ts`). Los sprites se escalan con `1/artPxPerMeter` para quedar en metros.

```
stage
├─ world                                   (transform = cámara; unidades = metros)
│   ├─ L0 backdropFar     parallax 0.15   fondo lejano (desenfoque horneado), 1–2 sprites grandes
│   ├─ L1 backdropMid     parallax 0.40   arquitectura / bosque medio
│   ├─ L2 backdropNear    parallax 0.75   «bruma luminosa» detrás del plano de juego (legibilidad del héroe)
│   ├─ L3 propsBack       1.00            decorado detrás de los actores
│   ├─ L4 terrain         1.00            suelo y plataformas (blockout hoy; arte después)
│   ├─ L5 actors          1.00            jugador, enemigos, jefe, pickups, interactuables (orden por capa lógica y luego por y)
│   ├─ L6 fxWorld         1.00   (add)    proyectiles, arcos, estelas, chispas, charcos de luz
│   ├─ L7 foreground      1.15–1.40       siluetas oscuras de primer plano (vegetación, columnas)
│   └─ L8 lightOverlay    1.00   (add)    haces de luz, niebla, partículas ambientales
├─ screen                                  (sin cámara; píxeles de pantalla)
│   └─ viñeta · destello · fundido a negro · barras laterales
└─ debug                                   (solo con ?debug=1) colliders / hitboxes / hurtboxes / límites de cámara
```

| Capa | Mezcla | Culling | Notas |
|---|---|---|---|
| L0–L2, L7 | normal | por capa (`cullable`) ⚠️ | contenedores estáticos: candidatos a *render group* ⚠️ para no recalcular transformaciones |
| L5 | normal | por actor | pocos objetos; `sortableChildren` por capa lógica |
| L6, L8 | **aditiva** | por emisor | un *pool* por tipo; límite de partículas por perfil |

El HUD **no** está en la escena: es DOM por encima del *canvas* (§8).

### 7.5 Sprites y animaciones

**Principio:** el gameplay habla en **estados lógicos** (`idle`, `run`, `attack1`, `crouch`, `telegraph`…), **eventos** y **anclas lógicas** (`hand_r`, `weapon_grip`, `weapon_tip`, `head`, `feet`, `vfx_origin`). Un **manifiesto de datos** los enlaza con los assets.

```ts
interface SpriteSetDefinition {                  // presentation/SpriteSetDefinition.ts (puro)
  id: string;                                    // 'player', 'ink_slime'…
  atlas: string;                                 // id del atlas: 'sprites/player'
  artPxPerMeter: number;                         // 160 (arte a 2×)
  facing: 'right';                               // el arte mira a la derecha; se refleja con facing = −1
  pivot: 'feet-center';
  clips: Record<AnimState, {
    frames: string;                              // prefijo: 'idle_', 'atk1_'…  → idle_00, idle_01…
    fps?: number; loop?: boolean; speedFromVelocity?: boolean;
    phases?: { startup: [number, number]; active: [number, number]; recovery: [number, number] };  // rangos de fotograma
  }>;
  anchors: Record<AnchorId, 'per-frame' | [number, number]>;   // por fotograma: pie de atlas 'anchors.json'
  placeholder?: boolean;                         // cada sprite sintético se declara provisional
}
```

- **Animación guiada por fases.** Para clips con `phases`, el fotograma sale de `phase`/`phaseT` de la **simulación** (`startup → active → recovery`), no del tiempo real: el golpe visible coincide siempre con el hitbox aunque cambie el equilibrio, sin reexportar sprites. Los clips de bucle (idle, correr) usan tiempo real con `animSpeed`. Es una **función pura** (`presentation/animation.ts: frameForPhase / frameForTime`), probada en Node.
- **Reinicio:** un clip se reinicia solo cuando cambia `animSerial` ✅ (misma semántica que hoy).
- **Cadena de *fallbacks*** ✅ (se conserva): un estado sin clip prueba el siguiente (`walk → run → move → idle`); la cadena termina siempre en `idle`, de modo que un *sprite set* de un solo clip anima sin errores.
- **Giro:** `scale.x = facing`; el pivote en los pies conserva el apoyo; las anclas se reflejan.
- **Destello y parpadeo (sin filtros por actor):** el destello se dibuja con un segundo sprite del mismo fotograma en mezcla **aditiva** y alfa = `flash`; el parpadeo modula el alfa. Un filtro por actor se reserva para casos puntuales y de corta duración.
- **Anclas:** `getAnchor(id)` devuelve el punto en metros del fotograma actual y del `facing`; los VFX se enganchan a `weapon_tip`, `hand_r`, `vfx_origin`. **La simulación no usa las anclas**: el origen de un proyectil o un hitbox es dato en `*Definition`.
- **Capas por actor:** ≤ 4 sprites (sombra/charco de luz aditivo, cuerpo, brillo de ojos aditivo, capa o accesorio si se separa).
- **Paleta:** el *palette-swap* (filtro de matriz de color) se reserva para **variantes de enemigos y de VFX**; **no se usa para recolorear al protagonista** (DC-12).

**Validador (`validateSpriteSet`, ✅ equivalente actual: `validateModel`):** falla con un mensaje legible si hay clips mapeados inexistentes, falta `idle`, anclas ausentes, pivotes o escalas incoherentes, atlas fuera de presupuesto, y —**contrato de la espada**— si algún fotograma con `weapon_grip` tiene `hand_r` a más de 6 px de arte o le falta `weapon_tip` (GAME-SPEC-2D §2.6). Lista además qué falta para el arte final cuando `placeholder: true`.

**Actores sin fotogramas:** `ProceduralActor` dibuja formas (`Graphics`) con deformación (aplastamiento/estiramiento, deslizamiento) y ojos; es la vía de los enemigos de tinta y de la piel provisional del protagonista (GAME-SPEC-2D §2.7). Detrás de la **misma** interfaz de vista que `ActorSprite`.

> **Implementado:** `presentation/proceduralPose.ts` (**puro**: el *look* es datos —pose por animación lógica `[desde, hasta]` sobre `phaseT`, con *easing*, oscilación y temblor, y la cadena de *fallbacks* del vocabulario— y `evalPose` lo convierte en deformación) + `render/ProceduralActor.ts` (formas dibujadas **una vez**, en centímetros para que las curvas salgan suaves; por fotograma solo cambian transformadas y alfas; 2 lotes por actor) + `content/proceduralActors.ts`. Lo usa el Ink Slime; **el protagonista sigue pasando por el *pipeline* real de sprites** (el *placeholder* abstracto es un atlas procedural), no por `ProceduralActor`: así la vía de sustitución de arte queda ejercitada desde ahora.

### 7.6 Atlas de texturas

| Aspecto | Decisión |
|---|---|
| Formato | JSON de *spritesheet* compatible con Pixi (TexturePacker «JSON hash/array», Aseprite, Free-Tex-Packer) + PNG o WebP. Fotogramas con nombre `<clip>_<NN>` y *trim* con desplazamientos |
| Tamaño | ≤ **2048×2048** por página en móvil (4096 solo escritorio); relleno de 2 px + extrusión de 1 px (sin sangrado entre fotogramas); alfa **premultiplicado** |
| Resolución | **Maestro a 2×** (héroe ≈ 270 px de alto) y variante **1×** derivada en la construcción; el perfil de calidad elige. Pixi admite nombres con sufijo de resolución ⚠️ |
| Mipmaps | desactivados en sprites a ≈ 1:1; activados en fondos grandes que se reducen |
| Compresión | WebP en iOS ≥ 14 y Android modernos; texturas comprimidas por GPU (KTX2/Basis) como optimización posterior |
| Memoria | 2048² RGBA = **16 MiB**; con ~150 MB ⇒ ≤ ~8 páginas residentes: héroe 1–2, enemigos 1, VFX 1, región activa 3–4. Se **descarga** el arte de la región anterior al cambiar |
| Carga | *bundles*: `boot` (héroe, VFX, UI, texturas procedurales) y `region:<id>`; la sala siguiente se precarga durante el fundido; pantalla de carga mínima |
| Desarrollo | texturas **procedurales** (canvas) para pruebas: ✅ el *benchmark* ya genera su atlas así; ningún test depende de arte real |
| Caché | `SpriteAssetManager`: **una sola descarga** por atlas aunque se pida varias veces a la vez, **ref-count** de instancias, liberación al llegar a cero, una carga fallida no envenena la caché (mismas garantías que el `AssetManager` actual ✅, que se portan con sus tests) |

### 7.7 VFX

`VfxDirector` escucha el bus y consulta una tabla **de datos** `VFX_BINDINGS: evento → [VfxDefinition id]`; `VfxSystem` crea, actualiza y recicla instancias. Tiempo real (inmune al hit-stop). El azar de la vista usa su propio generador, **no** el `Rng` de la simulación.

```ts
type VfxKind = 'spriteAnim' | 'particles' | 'trail' | 'arc' | 'flash' | 'shake' | 'lightPool';
interface VfxDefinition {
  id: string; kind: VfxKind; priority: number; maxLive: number;
  palette: PaletteSlot;                 // 'energy' | 'enemy' | 'accent' | 'neutral' → resuelto a tokens (GAME-SPEC-2D §3.2)
  anchor?: AnchorId;                    // se engancha a un ancla lógica del actor
  blend: 'normal' | 'add';
  params: …                             // por tipo: vida, tamaño, curvas de alfa/escala, velocidad, gravedad…
}
```

- **Arco de ataque** (`arc`): media luna procedural parametrizada (radio, ángulo, grosor, vida), sin arte externo. **Estela de dash** (`trail`): cadena de imágenes residuales con alfa decreciente. **Chispas de impacto** (`particles`): ráfaga radial con esquirlas. **Aura de *telegraph*** (`particles` + `lightPool`): violeta, con los ojos incandescentes del enemigo. **Charco de luz** (`lightPool`): sprite aditivo suave bajo el actor.
- **Texturas procedurales** (brillo suave, chispa, trazo) generadas al arrancar con un *canvas*: «VFX potentes» sin depender de arte externo.
- **Partículas pequeñas y numerosas** en un contenedor especializado de Pixi v8 (`ParticleContainer` con `Particle`) ⚠️: una sola llamada de dibujo.
- **Presupuesto y gobernador:** máximo de partículas vivas por perfil (150/300/400); al superarse se descartan los efectos de menor `priority`. **Ranuras de paleta**: la misma definición sirve para el héroe (cian) y los enemigos (violeta) y admite el acento cálido desactivado por defecto (GAME-SPEC-2D §3.5).
- **Pruebas:** la matemática de emisores (crear/actualizar una partícula) es pura y determinista con un generador inyectado; los *pools* se prueban por contadores (sin crecimiento tras calentar).

### 7.8 *Pooling*

`Pool<T>` ✅ existente se usa para: vistas de actores (enemigos), instancias de VFX, partículas, proyectiles visuales y objetos `Graphics` del *overlay*. Reglas: sin `new` ni *closures* en bucles por frame; arrays preasignados; `for` clásicos; los *handlers* de eventos de alta frecuencia no asignan objetos. **Verificación:** (1) contadores de *miss* del *pool* en tests; (2) en E2E, comparar la memoria JS usada tras forzar GC antes y después de 60 s de juego con CDP (`Performance.getMetrics`/`HeapProfiler`) ⚠️.

### 7.9 Resolución, escalado y viewport

- **Altura visible fija** (`viewHeight`, 13.5 m ✅ por defecto) y **ancho variable** entre **4:3 y 21:9**: más ancho → barras laterales de `world.void`; más estrecho que 4:3 o en vertical → aviso «gira el dispositivo». Esto evita revelar de más en pantallas ultraanchas y protege el diseño de salas.
- **Px por metro** `ppm = altoDelCanvasEnPxCSS / viewHeight`. El contenedor `world` usa `scale = ppm` en las unidades lógicas del renderer: con `autoDensity` Pixi aplica `resolution` por su cuenta (si no, habría que multiplicar por `resolution`); se confirma en el *spike* ⚠️.
- **Resolución de render** `resolution = min(devicePixelRatio, tope del perfil)` con **resolución dinámica**: bajar 0.1 si el p95 del tiempo de frame supera 20 ms durante 3 s; subir si queda < 12 ms durante 10 s. `autoDensity` para mantener el tamaño CSS ⚠️.
- **Escala del arte:** maestro a 2× (`artPxPerMeter = 160`); cada sprite se escala a `1/artPxPerMeter` para quedar en metros.
- **Nitidez:** el pivote de cámara se redondea a un píxel de pantalla (no a un metro) para evitar parpadeos de fondos con parallax; cada capa redondea el suyo.
- **Márgenes seguros:** `env(safe-area-inset-*)` solo afecta al DOM (HUD y controles); el *canvas* ocupa toda la pantalla.

Ejemplos calculados ✅ (`viewHeight` 13.5 m, héroe de 1.7 m, topes de resolución 1.5/1.75/2):

| Dispositivo | Proporción | Ancho visible | px CSS / m | Héroe (px CSS) | Resolución | Almacén de píxeles | Héroe (px de render) |
|---|---:|---:|---:|---:|---:|---:|---:|
| Móvil 19.5:9 (844×390, DPR 3) | 2.16:1 | 29.2 m | 28.9 | 49 | ×1.75 | 1477×682 | 86 |
| Móvil Android (915×412, DPR 2.6) | 2.22:1 | 30.0 m | 30.5 | 52 | ×1.75 | 1601×721 | 91 |
| Móvil compacto (667×375, DPR 2) | 1.78:1 | 24.0 m | 27.8 | 47 | ×1.5 | 1000×562 | 71 |
| iPad Pro 11" (1194×834, DPR 2) | 1.43:1 | 19.3 m | 61.8 | 105 | ×2 | 2388×1668 | 210 |
| PC 16:9 (1920×1080) | 1.78:1 | 24.0 m | 80.0 | 136 | ×1 | 1920×1080 | 136 |
| PC ultraancho (3440×1440) | 2.39:1 | 31.5 m | 106.7 | 181 | ×1 | 3360×1440 (barras de 40 px) | 181 |

⚠️ En teléfono el héroe mide ≈ 49 px CSS (≈ 12.6 % de la altura): hay que **validarlo en un dispositivo real**. `viewHeight` por plataforma es un dato (p. ej. 12 m en móvil daría ≈ 14 %); es una decisión de calibración, no de arquitectura (R4/R29).

### 7.10 Adaptación a móviles y presupuesto

| Perfil | Resolución máx. | Partículas | Parallax | Filtros | Charcos de luz | Variante de atlas | Tope de fps |
|---|---:|---:|---:|---|---|---|---:|
| `low` | ×1.25 | 150 | 2 capas | ninguno | no | 1× | 60 |
| `medium` | ×1.75 | 300 | 3 capas | ninguno | sí | 2× solo héroe | 60 |
| `high` | ×2.0 | 400 | 4–5 capas | ≤ 2 pasadas a pantalla completa | sí | 2× | 60 |

- **Autodetección** por `hardwareConcurrency`, `deviceMemory`, cadena del renderer WebGL y **gobernador en vivo**; el jugador puede forzar el perfil en Ajustes.
- **Presupuesto de partida** ⚠️ (a validar en dispositivo): ≤ 60 *draw calls* por frame · ≤ ~150 MB de texturas · ≤ 400 partículas · simulación ≤ 2 ms/tick · CPU de render ≤ 6 ms en gama media · **0 asignaciones por frame** estable.
- **Sin filtros costosos en móvil:** el desenfoque de fondos va **horneado** en el arte; el *palette-swap* en `low` usa variantes pre-horneadas.
- **Batería y calor:** tope de 60 fps, pausa en segundo plano ✅, modo opcional de 30 fps.
- **Memoria:** *bundles* por región, descarga al cambiar de región, atlas ≤ 2048.
- **Interfaz DOM:** solo `transform`/`opacity` en animaciones, sin *layout* por frame, escrituras agrupadas en el *hook* de frame (§8).
- **Pantalla:** apaisado fijo (Capacitor); *safe areas*; `touch-action: none` ✅.

**Medido en el Prompt 4 ✅** (Chromium con GL por software: sirve para **comparar**, no como cifra absoluta; contador de llamadas GL envuelto, mediana y peor caso de 120 fotogramas):

| Escena | *Draw calls* (peor) | Contenido |
|---|---:|---|
| Escena de estrés `?lab=stress` (el *benchmark* de S1) | 5 (5) | 800 sprites animados de **un** atlas, 4 capas de *parallax*, 1 filtro, 240 partículas |
| Laboratorio de VFX con el momento más cargado (muerte + impacto + daño + remate a la vez) | 5 (6) | héroe, dummy y 4 efectos a la vez |
| **R1 entera**, de la entrada a la salida (héroe, slime, aviso, VFX, fondo de 4 capas, puerta, columna de salida) | 12 (**14**) | la escena real del juego |
| Presupuesto | **≤ 60** | |

**Por qué la escena real cuesta ≈ 3× más que el *benchmark* con muchísimos menos objetos:** una *draw call* no es un sprite, es un **lote** (*batch*) y un lote se rompe cada vez que cambia la textura o el modo de mezcla. El *benchmark* tiene una textura y una mezcla: 800 sprites caben en un lote. La sala real alterna: terreno (`Graphics`, normal) → héroe (atlas) → cada baba (aura *aditiva* · tinta *normal* · luz de ojos y destello *aditivos*, **2 lotes por baba**) → VFX normal → VFX aditivo → cada una de las 4 capas de fondo (cada una es su `Graphics`) → columna de luz. Consecuencias que se mantienen: el coste crece con el **número de cambios de textura/mezcla**, no con el de sprites (diez slimes son ≈ +20 lotes, no +10 000 píxeles de trabajo); añadir una pieza aditiva en medio de las normales es lo caro; y el margen (≈ 46 de 60) se gasta en enemigos, HUD (DOM: 0) y capas de arte, no en los 800 sprites del *benchmark*. Si algún día falta, la palanca es agrupar lo aditivo de todos los actores en **una** capa (auras detrás, luces delante) en vez de intercalarlo con cada cuerpo.

**Bundle JS ✅** (`npm run bench:bundle`, arranque en frío de R1 en el *build* de producción): **195.6 KB gz** (624 KB sin comprimir, 27 *scripts*) frente al presupuesto de ≤ 200 KB gz; `dist/` contiene 237 KB gz porque incluye los laboratorios (herramientas de desarrollo, partidas en *chunks* aparte) y los *renderers* WebGPU/Canvas que Pixi solo pide si la plataforma los necesita. **El margen es de ≈ 4 KB**: el HUD, las cartas y el audio de los Prompts 5–7 obligarán a recortar Pixi (importar solo lo usado) o a revisar el presupuesto.

### 7.11 Depuración visual

Modo de depuración **oculto** ✅ (`?debug=1` o tecla `` ` ``): *overlay* de colliders, **hitboxes y hurtboxes**, límites de cámara, *draw calls* (contador de llamadas GL como en el *benchmark* ✅), FPS ✅, pausa/paso/escala de tiempo ✅, inspector de *tuning* ✅ (se reutiliza para combate, magia, botellas y gestos). `window.__troid` ✅ conserva su forma (el E2E depende de ella) y añade `view: { drawCalls, sprites, textures }`.

### 7.12 Verificado frente a pendiente (API de Pixi v8)

Actualizado al terminar el Prompt 4: lo que era intención de diseño ahora está **verificado con el código que corre** (`pixi.js@8.22.0`, Chromium con GL por software) salvo lo marcado ⚠️.

| Aspecto | Estado |
|---|---|
| `Application` + `await app.init({ preference: 'webgl', antialias: false, autoStart: false, background, resolution, autoDensity: true, powerPreference: 'high-performance' })`, `app.canvas`, `app.render()` a mano (sin *ticker* de Pixi), `app.renderer.resize(w, h, resolution)` | ✅ `render/Renderer2D.ts` |
| `Sprite`, `Texture`, `Rectangle`, `Texture.from(canvas)`, `new Texture({ source, frame })`, `sprite.anchor`, `position.set`, cambiar `sprite.texture` | ✅ atlas procedurales (`assets/`), `ActorSprite`, VFX |
| `Container` (`pivot`, `scale`, `skew`, `position`, `blendMode`, `label`, `sortableChildren`) | ✅ grafo de escena de `render/layers.ts` y `ProceduralActor`. *Render groups* y `cullable`: **no usados** (R1 son ≈ 12 *draw calls*; no hacen falta) |
| `Graphics` (API encadenada de v8: `rect`, `roundRect`, `ellipse`, `moveTo/bezierCurveTo/closePath`, `.fill()`, `.stroke()`) | ✅ **con una trampa**: las curvas se subdividen con una tolerancia en las unidades *propias* de la forma; dibujadas en **metros** (un ojo de 0.15 m) salían como polígonos. Las formas curvas se dibujan en **centímetros** y se reducen con `scale` (`ProceduralActor`) |
| `ParticleContainer` (`new ParticleContainer({ texture, dynamicProperties })`) + `Particle` (`addParticle`/`removeParticle`, `tint`, `alpha`, `scaleX/Y`, `rotation`) | ✅ `vfx/VfxSystem` (un contenedor aditivo y otro normal) y escena de estrés; el modo de mezcla **no se hereda** de forma fiable: se pone explícito (`blendMode = 'add'`) en cada pieza aditiva |
| `ColorMatrixFilter` sobre una capa | ✅ escena de estrés (`filter=true`): sigue en ≈ 5 *draw calls* |
| `resolution`, `autoDensity` | ✅ (`min(dpr, 1.75)`; E2E con DPR 1 y 3). `powerPreference` ✅ pasado a `init`. `roundPixels`: se redondea la **posición de cámara a píxel de dispositivo** (`worldTransform`), no `roundPixels` |
| 1 *draw call* para 800 sprites de un atlas | ✅ 5 con 4 capas, 1 filtro y 240 partículas (ver §7.10) |
| `Assets` / `Spritesheet` | **No usados (decisión)**: `SpriteAssetManager` propio (carga por definición, cuenta de referencias, validación del contrato) sobre atlas generados o PNG; encaja con `SpriteSetDefinition` |
| Multitáctil (`pointerId` independientes) en Chromium con toques CDP | ✅ (auditoría); el reconocedor de gestos es del Prompt 5 |
| Reconstrucción de texturas tras pérdida de contexto | ⚠️ por verificar (Prompt 7) |
| Rendimiento en WebView de iOS y de Android reales | ⚠️ no verificable aquí |

---

## 8. HUD y UI (DOM)

**Decisión (DC-05):** el HUD, los controles táctiles, los iconos de interacción y los overlays son **DOM**, no Pixi. Motivos: texto localizable (incluidos CJK posteriores) sin atlas de glifos; zonas seguras con `env()`; *hit-testing* nativo y multitáctil por `pointerId`; accesibilidad; y que el HUD **no dependa del renderer** (regla `ui/` ↛ `render/`). Coste: composición DOM sobre el *canvas*; se mitiga con `transform`/`opacity`, escrituras agrupadas y actualización solo ante cambios ⚠️ (medir en Android de gama baja, R19).

- **Patrón:** `HudModel` (plano, puro) ← eventos; `HudView` lo vuelca al DOM **solo si cambió** en el *hook* de frame. Barras con `transform: scaleX()`; segmentos y viales con clases de estado.
- **Pila de capas:** `canvas` → `#ui` → HUD (`pointer-events: none`, salvo los viales) → `#touch` (zonas y botones) → prompts de interacción y chip → overlays (derrota, fundidos, aviso de giro, pausa).
- **Tema:** variables CSS generadas desde `presentation/palette.ts`; *skins* reemplazables por PNG con un manifiesto, sin tocar `HudModel`.
- **i18n:** `HudView` solo llama a `t(clave)` (§9). Sin números ni texto permanentes.
- **Accesibilidad:** opción de reducir destellos y sacudidas; contraste ≥ 4.5 : 1 en textos.
- **Pruebas:** DOM con `happy-dom` ✅ (ya es *devDependency*): el modelo y la vista se prueban sin navegador.

> **Implementado en el Prompt 5** (S14, S17, S18): el patrón es **simulación → `GameSession.status()` → `HudModel` → `HudView`**; la vista escribe **solo lo que cambió** (probado con `MutationObserver`: 20 fotogramas idénticos = 0 mutaciones) y los transitorios de interfaz (fantasma de vida, sacudidas, *pop* del vial) corren en **tiempo real**, así que se ven durante un *hit-stop*. Pila de capas real (`z-index`): `canvas` → controles táctiles **20** → botón de pausa **24** → HUD **25** (`pointer-events:none`, salvo los viales) → icono de interacción **26** → título de derrota **40** → menú de ajustes **45**; `#ui` es transparente al puntero **salvo lo que lo pide** (`pointer-events:auto`). El **menú de ajustes** (`ui/settings/SettingsMenu`) y las **herramientas de desarrollo** (`app/devTools`, panel `?debug=1`) son *chunks* **bajo demanda**: una carga normal no los pide (lo comprueban los E2E `language` y `devtools`). Capa extra: `ui/safeArea` lee `env(safe-area-inset-*)`; todo se coloca dentro de la zona segura a la `uiScale` de la ventana.

---

## 9. Localización

- **Módulo `i18n/` (puro):** `createTranslator(locale, fallback = 'en')` → `t(clave, params?)`. Interpolación `{nombre}` y plurales con `Intl.PluralRules`. Catálogos `locales/es.json`, `locales/en.json` (más idiomas = más archivos, **sin tocar código**).
- **Claves** `área.entidad.campo` (`hud.life`, `card.magicBolt.name`, `interact.open`, `death.title`, `settings.language`). Las definiciones guardan `nameKey`/`descKey`; **nunca** texto.
- **Selección:** idioma del dispositivo si es `es*`/`en*`, si no inglés; se guarda en `SettingsData.language`; cambio en caliente con el evento `i18n:changed`.
- **Fuentes:** pila del sistema con respaldo; sin texto horneado en texturas; maquetación elástica (+40 % de longitud).
- **Pruebas:** paridad de claves y de parámetros entre idiomas · toda clave referenciada por el contenido existe · ningún literal en `ui/` (comprobación estática en el test de arquitectura) · el texto de debug queda fuera del catálogo.

> **Implementado en el Prompt 5** (S18): el cambio en caliente es `Translator.changed` (un `Observable<string>` al que se suscribe la interfaz; no hay evento `i18n:changed` en el bus de juego), la selección es `chooseLocale` (pura: `?lang=` › guardado › dispositivo › inglés; un idioma sin catálogo se salta) y el idioma elegido **se guarda** en los ajustes (`save/`, §11) y se aplica a `<html lang>`. Los nombres de idioma se muestran en su propio nombre (`Intl.DisplayNames`).

---

## 10. Audio (arquitectura)

No se produce audio definitivo en los Prompts 3 ni 4. La arquitectura prevé:

| Pieza | Papel |
|---|---|
| `AudioEngine` (`audio/`) | `AudioContext`; **desbloqueo en el primer gesto**; suspende/reanuda con `visibilitychange`; buses `master → music · sfx · ambient · ui` con volumen desde `SettingsData` |
| `AudioDirector` | escucha el bus y reproduce por **id lógico** (`sfx.hero.slash`, `sfx.hit`, `sfx.dash`, `sfx.cast`, `sfx.hurt`, `sfx.die`, `sfx.interact`, `sfx.bottle.drink`, `ui.tap`) |
| `AudioManifest` (datos) | id → archivo(s), variaciones (selección con azar de la vista), ganancia, variación de tono, **enfriamiento anti-spam**, máximo de voces, bus, prioridad |
| `MusicDirector` | música por sala/región (`musicId`), fundido cruzado de 1.5 s, capas explorar/combate por eventos de combate |
| Formatos | Ogg Vorbis/Opus + AAC (m4a) según `canPlayType`; SFX cortos decodificados a `AudioBuffer`; música en *streaming* |
| Móvil | desbloqueo por gesto; el interruptor de silencio de iOS puede silenciar WebAudio (R6, plugin nativo en el Prompt 7); háptica opcional por evento |

Cada sonido debe poder reemplazarse cambiando el manifiesto, sin tocar quien lo dispara.

---

## 11. Persistencia (arquitectura)

Módulo `save/` (puro; el almacenamiento se inyecta). Se separan **progreso** y **ajustes**:

```ts
interface SaveData {                    // versión 1
  version: number;
  progress: {
    abilities: string[]; cards: string[]; equippedCard: string | null;
    maxLife: number; bottleSlots: number;
    flags: string[]; visitedRooms: string[];
    checkpoint: { room: string; entry: string } | null;
  };
}
interface SettingsData {                // versión 1
  language: 'es' | 'en' | string;
  volume: { master: number; music: number; sfx: number; ambient: number; ui: number };
  bindings: Partial<Bindings>;          // remapeo
  touch: { scale: number; opacity: number; layout?: Record<string, { dx: number; dy: number }> };
  quality: 'auto' | 'low' | 'medium' | 'high';
  accessibility: { reduceFlashes: boolean; shake: number };
}
```

- **Adaptadores** (`StorageAdapter`: `get/set/remove`, asíncronos): `LocalStorageAdapter` (web), `CapacitorPreferencesAdapter` (nativo; el almacenamiento del WebView puede purgarse, R7), `MemoryAdapter` (tests).
- **Escritura segura:** `clave.bak` ← anterior · `clave` ← nueva · se valida y se borra el `.bak`. **Carga:** `clave` → si falla, `clave.bak` → si falla, partida nueva **conservando** la copia corrupta (`clave.corrupt`).
- **Migraciones:** funciones puras `v→v+1`, con **archivos dorados** de cada versión en las pruebas. El sello de tiempo lo añade la plataforma (la simulación no usa `Date.now`).
- **Cuándo:** en cambios de sala y en puntos de guardado (progreso) · al cambiar un ajuste (ajustes). Reglas de muerte en datos (`DeathFlow`).
- **Fases:** contratos en el Prompt 4/5, ajustes en el 5, progreso en el 6.

> **Implementado en el Prompt 5** (S18, endurecido en S20): `save/` es **puro** y el almacenamiento se inyecta (`StorageAdapter` asíncrono; `MemoryStorage` en pruebas; `app/storage.ts` aporta `LocalStorageAdapter`, con cada acceso protegido: una lectura imposible es «nada guardado» y una escritura imposible lanza para que el *store* lo cuente **una vez** y el juego siga con lo que tiene en memoria; sin almacenamiento alguno cae en memoria). **Solo `SettingsData` v1** = `{ version, language: string | null, touch: { scale, opacity } }` (⚠ **desviación menor**: sin volumen, *bindings*, calidad ni accesibilidad, que no existen; cada uno llegará **por migración**, con su archivo dorado). `SettingsStore` **nunca lanza**: carga `clave` → si no se puede leer la **conserva** como `clave.corrupt` y prueba `clave.bak` → defaults (un valor de una **versión posterior** se aparta, no se pisa); escribe `clave.bak` ← anterior **buena** · comprueba el respaldo · `clave` ← nuevo · lo lee de vuelta · borra el `.bak`; las escrituras van **en cola** y un valor idéntico no se reescribe. **Probado con un sondeo de fallos aleatorios** (`storageSoak`: escrituras que lanzan, que guardan la mitad, que se pierden en silencio, borrados que fallan y el proceso muerto a mitad de un guardado): una carga limpia **jamás da algo inválido ni más viejo que el último cambio que se guardó bien**. El sello de tiempo, el progreso (`SaveData`), los puntos de guardado y `CapacitorPreferencesAdapter` **no existen todavía** (Prompt 6/7).

---

## 12. Datos y contenido

`PlayerDefinition · EnemyDefinition · BossDefinition · AbilityDefinition (posesión) · SkillDefinition · CardDefinition · BottleDefinition · AttackDefinition · InteractableDefinition · RoomDefinition · RegionDefinition · SpriteSetDefinition · VfxDefinition · AudioDefinition · RoomArtDefinition` — tipos en su módulo, **instancias** en `content/`. `ContentRegistry` indexa por id y `validateContent()` comprueba la integridad referencial al arrancar y en tests (✅ el mecanismo está previsto desde la fase 1; se implementa con el primer contenido real del Prompt 4).
Los textos viven en `i18n/locales/` y el contenido solo guarda claves.

## 13. Cámara

`CameraRig` ✅ se conserva como matemática pura (centro, `viewHeight`, zonas muertas, *look-ahead*, política vertical, límites, zoom, foco, *shake*). `CameraAdapter2D` (en `render/`) convierte el resultado en transformaciones del contenedor `world` con `worldTransform`. Los campos 3D (`projection`, `fovDeg`, `pitchDeg`, `swayDeg`, `near`, `far`, `distance`, `position`, `lookAt`) se retiran en el paso S4 junto con los 4 tests de pose 3D (MIGRATION-2D §4). Transición entre salas: **corte** tras el fundido; arenas: límites con *easing* (ya soportado ✅).

## 14. Pruebas

| Nivel | Herramienta | Qué cubre |
|---|---|---|
| Unitario | Vitest (Node) | core ✅, movimiento ✅, combate, FSM de jugador y enemigo, magia, botellas, cartas, interacción, agacharse, muerte, **reconocedor de gestos**, animación por fases, viewport, validadores, i18n, migraciones |
| Integración | Vitest (Node) | `GameSession` headless con entradas guiadas (`Driver` ✅): salto/dash/ataque/daño/muerte/respawn, transición de sala, hit-stop con buffer, determinismo bit a bit |
| Fugas | Vitest | listeners, timers y entidades tras N ciclos de carga/descarga/respawn ✅ (patrón existente) y *pools* sin crecimiento |
| Arquitectura | Vitest | capas y reglas de §2.1 ✅ (se amplía) |
| DOM | Vitest + `happy-dom` ✅ | `HudView`, `TouchControls` (sin navegador) |
| E2E / visual | Playwright (Chromium) ✅ | arranque sin errores de consola, lienzo no vacío, capturas 844×390 y 1920×1080, *draw calls*, **toques CDP** multitáctiles, escenarios de juego |
| Dispositivo real | manual | ergonomía táctil, rendimiento, audio, ciclo de vida, almacenamiento (⚠️ no se puede automatizar aquí) |

Los tests de gameplay **no importan Pixi** (lo impide la regla de capas). Los **192 tests** actuales se conservan (MIGRATION-2D §4).

> **Estado tras el Prompt 5:** **1180 tests en 82 archivos** (617 al empezar el Prompt 5) y **23 escenarios E2E** (12 al empezar), en desarrollo y en producción. Además de los casos dirigidos, hay **sondeos aleatorios con semilla** (`tests/helpers/soak.ts` y `tests/integration/{soak,hudSoak,inputSoak,touchDomSoak,storageSoak}.test.ts`, y el escenario E2E `soak`): miles de *ticks* o eventos de juego, hits, muertes, recargas de sala, dedos, teclas y fallos de almacenamiento al azar contra invariantes que **nunca** pueden romperse (magia y vida dentro de sus barras y solo cambian por una causa, una botella recargando a la vez, el icono solo sobre algo disponible y al alcance, `PlayerStatus` de acuerdo con la simulación, el DOM del HUD de acuerdo con el estado, ninguna entrada atascada, ningún ajuste más viejo que el último guardado). Una semilla dos veces da la misma simulación bit a bit. Se pueden profundizar con `SOAK_SEEDS=300 SOAK_TICKS=20000 npx vitest run tests/integration/soak.test.ts`. El E2E `vertical` graba en Node una partida completa de R1 y la **reproduce con el teclado real** del navegador comparando un resumen de **toda** la simulación (magia, botellas, carta, objeto con icono, proyectiles incluidos) cada 50 ticks.

## 15. Depuración

Se conserva el modo oculto ✅ y se amplían: visor de gestos táctiles (origen, ejes, umbrales), panel de recursos (magia, botellas, cartas), *teleport* a salas, forzar eventos de muerte/respawn y selector de perfil de calidad.

> **Implementado:** el panel, la rejilla de colisiones y las acciones de depuración viven en `app/devTools.ts`, un módulo que **solo se descarga con `?debug=1`** (o la tecla `` ` `` en desarrollo): un jugador no descarga herramientas de desarrollo (≈ 3.6 KB gz que no entran en el arranque en frío). No importa los enemigos (los pide al juego por *callbacks*) para no crear *chunks* compartidos. Los ganchos de prueba `window.__troid` (`?hooks=1`) permiten a los E2E avanzar la simulación tick a tick, teletransportar, soltar slimes, golpear al héroe, leer el estado y manejar un mando abstracto. El visor de gestos y el selector de calidad **no se han hecho** (no hacían falta para el Prompt 5).
