# Bitácora del Prompt 6 — de una sala aislada a un mini-mundo metroidvania conectado

> Registro técnico de la ejecución (pasos S21–S32): qué se hizo, qué se midió, qué se desvió y por qué.
> Las decisiones de los Prompts 3, 4 y 5 están **cerradas** ([ADR-0003](adr/0003-arquitectura-2d-definitiva.md), [GAME-SPEC-2D](GAME-SPEC-2D.md), [PROMPT5-LOG](PROMPT5-LOG.md)); aquí solo se documenta su ampliación. Si algo choca con ellas, se marca con **⚠ CONFLICTO**.
> Cifras medidas ✅ en este entorno (Chromium sin GPU: render por software; sirve para comparar, no como cifra absoluta). **No se ha verificado nada en un iPhone, un iPad ni un Android reales, ni con un mando físico.**

## Estado

| Paso | Estado | Commit |
|---|---|---|
| **S21** baseline | ✅ | `1b4756a` |
| **S22** grafo de mundo (`WorldDefinition`, R1–R4, validación) | ✅ | `99f0649` |
| **S23** transiciones entre salas | ✅ | `ce5ab17` |
| **S24** guardado de progreso y checkpoints | ✅ | `fc6acb8` |
| **S25** peligros | ✅ | `056c038` |
| **S26** zonas de cámara | ✅ | `dad0241` |
| **S27** cuarta botella | ✅ | `2dbe0c6` |
| **S28** Spirit Bolt en R3 | ✅ | (ver historial) |
| **S29** jefe | ⏳ | |
| **S30** ajustes (volumen, remapeo, calidad, posición táctil) | ⏳ | |
| **S31** calibración móvil (solo geometría y documentación) | ⏳ | |
| **S32** integración final | ⏳ | |

---

## Reglas de ejecución que se siguen

- **Simulación → eventos de juego → presentación / UI → adaptadores de input** (lo impone `tests/unit/architecture.test.ts`). El mundo, el guardado, los peligros y el jefe son **simulación pura y determinista** (60 Hz fijos, azar solo por el `Rng` de la sesión); lo que se ve (fundido, vistas, barra del jefe, menús) escucha eventos.
- Los **1180 tests** de partida no se debilitan: si un test fija algo que Prompt 6 cambia **a propósito** (la carta provisional de R1, la salida de R1, el punto de reaparición «la entrada de la sala»), se **adapta** conservando su intención y se lista aquí; nunca se borra.
- Un commit pequeño por unidad de trabajo; cada paso termina con `tsc`, tests, build y, cuando hay algo visible, E2E (dev **y** producción) y revisión de consola.
- Nada de `src/` mientras corre una suite E2E de desarrollo (el HMR de Vite reinicia la página).
- Sin arte final: **el protagonista sigue siendo el *placeholder* abstracto (cápsula con espada) del Prompt 3/4.** No se inventa rostro, cabeza, pelo, máscara, ropa ni silueta alternativa. El jefe y los peligros usan formas abstractas procedurales en la paleta cerrada (negro, blanco, cian/azul; **violeta** para lo enemigo y sus avisos; carmín opcional y apagado). **No se copia nada de Hollow Knight ni de Solo Leveling** (ni personajes, ni enemigos, ni mapas, ni UI, ni ataques, ni nombres): todo lo del jefe y de las salas es propio.

---

## S21 — Baseline ✅

**Punto de partida:** rama `claude/troid-vertical-slice` en `2977c04` (fin del Prompt 5), árbol limpio y sincronizada con el remoto. Leído: `PROMPT5-LOG` (sobre todo S20 y «Para el Prompt 6»), `GAME-SPEC-2D` (§9 muerte, §11 botellas, §12 interacción, §14 mundo, §15.2 jefe, §16 cámara, §17 HUD, §20 persistencia), `ARCHITECTURE-2D` (§5.8 muerte, §5.10 jefes, §5.11 mundo, §11 persistencia, §13 cámara) y `ROADMAP`.

| Comprobación | Resultado ✅ |
|---|---|
| Typecheck (`tsc --noEmit`) | 0 errores |
| Tests (`vitest run`) | **1180/1180** en 82 archivos |
| Build de producción (`npm run build`) | OK en 0.9 s |
| E2E desarrollo (`npm run test:e2e`) | **23/23** |
| E2E producción (`npm run test:e2e -- --prod`) | **23/23** |
| Consola | 0 errores, 0 avisos en las 46 ejecuciones |
| *Draw calls* (peor momento) | R1 12 · sala completa 14 · R1 completa 14 · juego aleatorio 22 (presupuesto 60) |
| Bundle de arranque en frío de R1 (`npm run bench:bundle`) | **197.9 KB gz** (628.5 KB raw), 27 *scripts* — presupuesto 200 KB (**margen 2.1 KB**) |

Nada estaba roto antes de S21: se continúa sin correcciones previas.

### Lo que el Prompt 5 dejó listo y se reutiliza (no se rehace)

| Pieza | Para qué sirve en el Prompt 6 |
|---|---|
| `RoomDefinition.exits[].to`, `entries`, `gates`, `spawns.defeatFlag`, `interactables`, `killY`, `camera.bounds` | la sala ya declara casi todo lo que pide el grafo; falta el **destino con spawn**, los peligros, las zonas de cámara y la arena |
| `WorldFlags` + `gate:changed` | memoria del mundo y puertas; **es** el progreso de «enemigos únicos derrotados» y «jefe derrotado» |
| `InteractionSystem` y sus acciones cerradas (`acquireCard`, `addBottleSlot`, `setFlag`, `clearFlag`) | checkpoints, cuarta botella, carta de R3 y recompensa del jefe son **interactuables** |
| `DeathFlow` (con las dos correcciones de S20) y `rescuePlayer` | la muerte vuelve al checkpoint con el mismo flujo; la muerte en transición y fuera del mundo ya están cubiertas por sondeos |
| `CameraRig.setBounds(bounds, smoothTime)`, `setZoom`, `CameraAdapter2D.lockBounds` | las zonas y la arena solo deciden **qué límites** pide la cámara |
| `Enemy` + `EnemyBrain` + `AttackDefinition` + `CombatSystem` (varios *hurtboxes* con `part`, `hits:[…]`) | el jefe es un arquetipo más; el sello y los peligros usan el mismo canal de golpes |
| `SettingsStore` (escritura segura, `.bak`, `.corrupt`, cola) | el guardado de progreso reutiliza **la misma robustez** (se extrae un almacén seguro genérico) |
| `Scheduler` con dueño, `Rng` con semilla | fundido de transición y elección de ataques del jefe, deterministas |

### Decisiones de diseño tomadas antes de escribir código

1. **Mundo = datos + validación pura.** `world/WorldDefinition` (tipos), `world/worldGraph` (construir el grafo, validar y analizar alcanzabilidad) y `content/world.ts` (los datos del mini-mundo). `Game2D` no sabe qué sala va después de cuál: lo dicen las salidas (`exit.to = { room, entry }`).
2. **Una transición es un flujo de simulación**, como la derrota: `RoomTransition` (en `gameplay/`) corre por el `Scheduler` con dueño propio, en ticks, con `room:exiting` / `room:entered`. Durante ella la entrada va neutralizada (no ataca, no vuelve a activar una salida) y una muerte la cancela.
3. **El punto de reaparición pasa a ser el último checkpoint.** Una sesión **sin mundo** (los tests de una sola sala) conserva el comportamiento de siempre (la entrada por la que se entró); una sesión con mundo siempre tiene un checkpoint válido (el inicio del mundo por defecto), así que **la reaparición siempre tiene un spawn válido**.
4. **Los checkpoints son interactuables** (`kind: 'save'`, acción `checkpoint`): reutilizan el icono, el verbo localizado, la pose de 12 ticks y el *buffer*.
5. **Ajustes y progreso son dos modelos y dos claves** (`troid.settings` / `troid.progress`), con un único almacén seguro genérico debajo.
6. **Los peligros pasan por el combate**: una zona estática envía su *hitbox* cada tick; los *i-frames*, el empuje, el *hit-stop* y los eventos son los de siempre.
7. **La cámara no decide**: un resolvedor puro (`CameraZones`) devuelve los límites que corresponden a la posición del jugador y a las banderas; el adaptador solo los aplica con suavizado.
8. **El Spirit Bolt abre algo de verdad**: en R3 la salida hacia el jefe está tras un **sello de energía** que solo abre un Spirit Bolt (un objetivo neutral que ignora todo lo que no sea esa habilidad). Es la progresión «el mundo tiene rutas que aún no se pueden abrir» de GAME-SPEC-2D §13, sin árbol de habilidades.
9. **El jefe es un `Enemy` con un arquetipo propio**, varios ataques en datos, azar del `Rng` de la sesión y una arena que cierra y abre puertas por banderas.
10. **Medir el bundle después de cada bloque.** El margen es de 2.1 KB: lo que no haga falta al arrancar (menú ampliado, y si hace falta el jefe y las salas posteriores) se carga bajo demanda.

---

## S22 — Grafo de mundo ✅

**Qué es.** El mundo pasa a ser **datos + validación pura**: `world/WorldDefinition` (tipos), `world/worldGraph` (construir el grafo, validarlo y «jugarlo sobre el papel») y `content/world.ts` (los datos del mini-mundo). Nada de `Game2D` ni de la simulación sabe qué sala va detrás de cuál: lo dicen **las salidas** de cada sala (`exit.to = { room, entry }`).

```
WORLD ancient_forest ──▶ ROOMS ──▶ EXITS ──▶ DESTINATION { room, entry } ──▶ SPAWN POINT (el `entry` de la sala de destino)
```

### El grafo final (S22)

```
 R1 «Puerta de las Ruinas»      R2 «Galería de Raíces»       R3 «Cámara del Sello»        R4 «Santuario»
 r1_gate                        r2_hall                      r3_chamber                   r4_sanctum
 ┌─ entries: start, east        ┌─ entries: west, east       ┌─ entries: west, east       ┌─ entries: west
 └─ exit east ─────────────────▶ west                        │                            │
    (requires defeated:r1_slime) exit east ─────────────────▶ west                        │
 ◀──────────────── exit west ── ◀─ entry east                exit east ─────────────────▶ west
                                 ◀──────────── exit west ──  ◀─ entry east                exit east → FIN (`end`)
                                                             ◀──────────── exit west ──
```

| Conexión | Salida (zona) | Destino (sala : spawn) | Requisito |
|---|---|---|---|
| R1 → R2 | `r1_gate/east` x 109–112.5 | `r2_hall:west` (4, 0, →) | `defeated:r1_slime` (además de la puerta física) |
| R2 → R1 | `r2_hall/west` x 0–2.4 | `r1_gate:east` (106.6, 0, ←) | — |
| R2 → R3 | `r2_hall/east` x 88–91 | `r3_chamber:west` (4, 0, →) | — |
| R3 → R2 | `r3_chamber/west` x 0–2.4 | `r2_hall:east` (84.5, 0, ←) | — |
| R3 → R4 | `r3_chamber/east` x 76–79 | `r4_sanctum:west` (4, 0, →) | — (S28 añade el sello) |
| R4 → R3 | `r4_sanctum/west` x 0–2.4 | `r3_chamber:east` (72.5, 0, ←) | — |
| R4 → fin | `r4_sanctum/east` x 95–98 | fuera del mundo (`end: true`) | — (S29 exige `defeated:r4_boss`) |

Cada sala declara lo que pide la especificación: `id`, dimensiones (`bounds`), puntos de aparición (`entries`), salidas (`exits`), puertas (`gates`), enemigos (`spawns`), recogibles (`interactables`), cámara (`camera`), **banderas requeridas** (`requiredFlags(room)`: `requires` de las salidas, `openWhen` de las puertas, `whenSet` de los interactuables) y **banderas concedidas** (`grantedFlags(room)`: `defeatFlag` de los enemigos y `setFlag` de los interactuables). Los peligros y las zonas de cámara se añaden a la sala en S25 y S26.

### Las salas (bloque de geometría; los extras llegan en su paso)

| Sala | Tamaño | Qué tiene en S22 |
|---|---|---|
| **R1** (la de siempre) | 115 × 30 m | movimiento, foso de 5 m, escaleras *one-way*, pasaje bajo, arena, Ink Slime y puerta; **ahora su salida lleva a R2** y tiene una entrada `east` para el regreso. La carta provisional sigue aquí hasta S28 |
| **R2** «Galería de Raíces» | 93 × 30 m | entrada llana; **bifurcación** sobre una zanja de 3.2 m: *camino bajo* (bajar por dos escalones, recorrer el suelo de la zanja, subir) y *camino alto* (cuatro plataformas *one-way* a 2.4 m con 3 m entre ellas); una cornisa a 4.8 m sobre el final de la tercera (la futura 4.ª botella); un Ink Slime opcional (`defeated:r2_slime`) en el tramo final; salida a R3 |
| **R3** «Cámara del Sello» | 81 × 30 m | entrada, **ascenso** a una cornisa de 4.8 m en dos saltos (2.4 + 2.4 m) y un pasillo llano de 40 m hacia R4 (donde irá el sello) |
| **R4** «Santuario» | 101 × 30 m | vestíbulo, arena de 40 m y cámara de recompensa en línea recta; salida del mundo (`end`). Puertas, jefe y checkpoint llegan en S29 |

### Reglas del validador (`validateWorld`)

`world-empty`, `world-room-duplicate`, `world-room-unknown`, `start-room`, `start-entry`, `exit-both` / `exit-no-destination` (cada salida va a algún sitio o es el fin del mundo, nunca ambas ni ninguna), `exit-room`, `exit-entry`, `empty-flag`, `entry-in-exit` (llegar no debe dejar al jugador **dentro** de una salida: rebotaría de vuelta), `room-unreachable`, `flag-ungranted` (algo espera una bandera que nada alcanzable concede) y `room-trapped` (una sala sin camino de vuelta al inicio). El análisis de progresión (`analyzeProgression`) recorre el mundo sobre el papel: desde la primera sala concede las banderas de los guardianes y recogibles de las salas alcanzadas y abre las salidas cuyo `requires` ya se tiene, hasta que no cambia nada (el orden de los datos no importa); un círculo («la palanca que abre la puerta está detrás de la puerta») deja la sala cerrada y se detecta.

### Decisiones y desvíos

- **`ExitDef` gana `requires` y `end`.** `requires` refleja la puerta física para que el validador pueda **demostrar que el mundo se acaba** (una puerta cuya bandera nada concede es un error de datos, no un soft-lock en medio de una partida). `end` marca la única salida sin destino (el fin de la rebanada): una sala del mundo no puede tener una salida que no lleve a ninguna parte por descuido.
- **Las salidas siguen inertes en S22**: solo registran `exit:reached`. La transición real es S23.
- **La cornisa de R2 se movió tras medirla.** Con la cornisa (4.8 m) justo encima de la zona donde cae un salto corrido desde la plataforma anterior, un salto completo aterrizaba en ella **sin querer** (lo descubrió el *test* de física: el bot acababa en la cornisa, no en la plataforma). Ahora la tercera plataforma mide 7 m y la cornisa cubre solo sus últimos 3: llegar a ella es una decisión (salto vertical desde el final de la plataforma).
- **R3 y R4 son bloques sin sus extras**: no llevan puertas ni *flags* hasta S28/S29, porque el validador (con razón) rechazaría una puerta cuya bandera nada concede todavía. En cada paso el *test* del mundo crece con lo que se añade.
- **Sala alcanzable por física, no por coordenadas.** `tests/integration/worldRooms.test.ts` recorre cada sala con las mismas entradas que un jugador (el bot de R1 para el camino bajo, y *hops* guionizados —`tests/helpers/hops.ts`— para el alto y la cornisa) y comprueba que **no hay atajos** (un salto desde el suelo no llega a la cornisa de R3) ni sitios sin salida.

### Medido ✅

| | Antes (S21) | S22 |
|---|---|---|
| Tests | 1180 / 82 archivos | **1249 / 85 archivos** (+69: 29 del grafo sintético, 14 del mundo real, 26 de física de R2–R4 y entradas) |
| `tsc` | 0 | 0 |
| Build | OK | OK |
| Bundle de arranque en frío de R1 | 197.9 KB gz | **198.5 KB gz** (+0.6 KB: tres salas, sus nombres y el mundo; el grafo y el validador solo se usan en tests y no entran) — **margen 1.5 KB** |

> ⚠ El margen del bundle ya es de 1.5 KB y faltan transiciones, guardado, peligros, jefe y ajustes. El plan es el de las decisiones 10: medir tras cada bloque y, si hace falta, cargar bajo demanda lo que no se necesita para empezar R1 (las salas R2–R4 y el jefe son candidatas naturales). Se documentará con las dos cifras: «arranque en frío de R1» y «toda la rebanada».

---

## S23 — Transiciones entre salas ✅

**Qué es.** Tocar una salida que lleva a alguna parte ya no solo emite un evento: arranca una **transición determinista**, un flujo de simulación como la derrota (`RoomTransition` en `gameplay/`), que corre por el `Scheduler` con dueño propio:

```
tick que ve la salida ─▶ fadeOut (12) ─▶ SWAP ─▶ hold (6, negro) ─▶ fadeIn (14) ─▶ control de vuelta
                         `transition:started` + `transition:fadeOut`     │            `transition:fadeIn`      `transition:finished`
                                                          `room:exiting` · `room:loaded` · `room:entered`
```

Dura **32 ticks simulados** (≈ 0.53 s) contando el tick que vio la salida. El *swap* es **un solo paso**: se descarga la sala vieja (todo lo que vivía en ella: entidades, *hitboxes*, colliders, interactuables, temporizadores de la sala) y se construye la nueva con el jugador en el `entry` que nombra la salida; no existe un instante con dos salas, ni con ninguna. Vida, magia, carta, botellas y *flags* pasan tal cual (es el mismo `Player` y el mismo `WorldFlags`).

### Reglas (cada una con su test)

| Regla | Cómo se garantiza |
|---|---|
| **No se puede atacar, saltar, esquivar, lanzar, interactuar ni beber durante la transición** | `tick()` sustituye el `InputFrame` por `NEUTRAL_INPUT` mientras `transition.active` (igual que la pantalla de derrota). Una pulsación hecha durante ella **no se recuerda**: no hay salto al recuperar el control. Un ataque que estaba en curso al tocar la salida termina con la sala vieja (`player.respawn` reinicia el controlador al entrar) |
| **Una transición cada vez** | `begin()` se rechaza mientras corre otra: tocar la misma salida, otra distinta, o llamar a `begin` a mano a mitad del fundido no arranca nada |
| **Una salida cerrada no hace nada** | `exit.requires` sin la bandera: ni evento, ni transición, y la zona **no se gasta** (si se pone la bandera con el jugador dentro, pasa) |
| **Una salida sin destino solo emite el evento** | salas de pruebas y `end` (el fin de la rebanada) |
| **Un destino que la sesión no tiene no rompe nada** | `exit:reached` + aviso en el log, sin transición (los tests que recorren una sola sala) |
| **Morir durante la transición no es permanente** | `player:died` **cancela** la transición (`transition:cancelled {reason:'death'}`): ninguna sala se cambia bajo un héroe caído, y el flujo de derrota lo trae de vuelta. Vale en el fundido de salida, en el negro y en el fundido de entrada |
| **Morir en el mismo tick en que se toca la salida** | un héroe muerto no activa salidas: no hay transición |
| **Tocar una salida mientras la derrota trae al jugador de vuelta** (su fundido de entrada) | no arranca, y la zona no se gasta: cuando el flujo acaba, si sigue dentro, pasa |
| **Cargar una sala a mano a mitad de transición** (`loadRoom`) | la cancela (`reason:'reload'`); nunca hay un *swap* después |
| **Un *hit-stop* a mitad solo la retrasa** | los temporizadores esperan igual que en la derrota |
| **Determinista** | mismos eventos en los mismos ticks, bit a bit (test del viaje completo y réplica en el navegador) |

### Eventos nuevos

`transition:started {from, exitId, to, ticks}` · `transition:fadeOut {ticks}` · `transition:fadeIn {ticks}` · `transition:finished {room, entry}` · `transition:cancelled {reason}` · `room:exiting {roomId, exitId, to}` (el último momento para guardar lo que pertenece a la sala) · `room:entered {roomId, entryId, from}` (solo por conexión: `room:loaded` también salta en una reaparición o una carga de depuración). El interfaz solo escucha: `TransitionOverlay` (DOM, sin texto, `pointer-events: none`, z-index 38 entre el HUD y la derrota) pinta un negro que es función pura de la instantánea (`transitionOpacity`).

### Decisiones y desvíos

- **El mundo no se congela durante el fundido: la entrada se neutraliza.** El héroe **desacelera solo** (un paso corriendo se desliza un poco bajo el fundido) en vez de quedarse clavado; un enemigo cercano sigue siendo peligroso, y por eso la muerte **cancela** en vez de ignorarse. Se descartó congelar el mundo porque haría imposible el caso «muerte durante la transición» (que el enunciado pide cubrir) y porque un fundido con la animación del héroe a medias queda peor. Lo que sí se corta en el *swap* es cualquier acción en curso.
- **Un dash empezado en el mismo tick de la salida termina solo** (el control del dash no mira la entrada): lo descubrió el E2E (`vx = 21` a mitad del fundido). No es un fallo: la acción empezó antes; la transición solo impide empezar otras.
- **El respawn sigue siendo, por ahora, la entrada por la que se entró** (como en el Prompt 4/5): una conexión convierte la llegada en el nuevo punto de reaparición. **S24 lo cambia al último *checkpoint*** (con los dos tests que lo fijan adaptados a propósito).
- **`room:entered` y `room:loaded` son dos cosas.** El autoguardado de S24 escucha `room:entered`; las vistas, `room:loaded`.
- **El viaje se graba una vez y se reproduce dos.** `tests/helpers/journey.ts` (`playWorld`) lo recorre con el bot (R1 con su slime, R2 por el camino bajo, R3, R4); `worldJourney.test.ts` lo afirma y el escenario `world` lo **graba en Node y lo reproduce por el teclado real del navegador**, comparando el *digest* de toda la simulación —ahora con la sala y la fase de la transición— cada 50 ticks: **2964 ticks, tres transiciones, idéntico bit a bit**.

### Pruebas y E2E

- **Tests (+53):** `transitions.test.ts` (32: R1→R2→R3→R4 y vuelta, **todas** las aristas del grafo con su posición y orientación de llegada, doble transición bloqueada, entrada bloqueada y sin pulsaciones recordadas, ataque en curso, ni una entidad/colisionador/temporizador/oyente de más tras 40 viajes de ida y vuelta, derrota en cada fase, `requires`, salidas sin destino, determinismo), `roomTransition.test.ts` (17: la máquina de estados con un anfitrión falso, el modelo de opacidad y el overlay DOM) y `worldJourney.test.ts` (4: el mundo de punta a punta con 4 semillas).
- **E2E (nuevos):** `transition` (26 transiciones: negro real en el *swap* con teclas pulsadas, sala sin fugas en la escena y en el DOM tras 16 viajes, una derrota a mitad del fundido) y `world` (el viaje completo en el navegador, bit a bit).
- **E2E adaptados (misma intención):** `r1`, `room` y `vertical` ahora terminan con la salida **llevando a R2** (el escenario comprueba la llegada); las grabaciones en Node usan el mundo entero (`freshR1`/`fresh`) para que Node y navegador transiten en el mismo tick.

### Medido ✅

| | S22 | S23 |
|---|---|---|
| Tests | 1249 / 85 archivos | **1302 / 88 archivos** |
| `tsc` | 0 | 0 |
| E2E producción | — | **25/25** (los 23 + `transition` + `world`) |
| Bundle de arranque en frío de R1 | 198.5 KB gz | **199.1 KB gz** (+0.6 KB: `RoomTransition`, overlay y cambios en la sesión) — **margen 0.9 KB** |

> ⚠ **El margen del bundle es ya de 0.9 KB** y faltan guardado, peligros, jefe y ajustes. Hasta aquí todo está en el arranque en frío. La decisión sobre **qué cargar bajo demanda** se toma con datos tras S24 (que sí es del arranque) y se diseña **desde el principio** en S29 (el jefe, su arena y su sala son lo único que no hace falta para empezar R1).

---

## S24 — Guardado de progreso, checkpoints y regla de muerte ✅

### El modelo: PROGRESO ≠ AJUSTES

Dos modelos, dos claves de almacenamiento, un único almacén seguro debajo. Quien reinicia una cosa no pierde la otra.

| | Ajustes | **Progreso** |
|---|---|---|
| Clave | `troid.settings` | **`troid.progress`** (+ `.bak`, `.corrupt`) |
| Versión | `version` | **`saveVersion`** (v1) |
| Qué guarda | idioma, tamaño y opacidad del control táctil | **dónde está el héroe (`at`), dónde vuelve tras una derrota (`checkpoint`), las banderas del mundo, las habilidades, las cartas (y la equipada) y los huecos de botella** |
| Módulo | `save/SettingsData` + `SettingsStore` | `save/ProgressData` + `ProgressStore` |

**`ProgressData` v1** (`save/ProgressData.ts`, puro):

```jsonc
{ "saveVersion": 1,
  "at":         { "room": "r3_chamber", "entry": "west" },   // donde se continúa: la última sala en la que se entró (o el santuario donde se descansó)
  "checkpoint": { "room": "r2_hall",    "entry": "rest" },   // donde se vuelve tras una derrota
  "flags":      ["defeated:r1_slime", "defeated:r2_slime"], // la memoria del mundo: guardianes derrotados, puertas, recogibles, el jefe
  "abilities":  ["dash", "magic_attack"],
  "cards":      { "owned": ["card_spirit_bolt"], "equipped": "card_spirit_bolt" },
  "bottleSlots": 4 }                                        // 3 al empezar, 4 con la cuarta botella (S27)
```

- **Las banderas son el progreso.** «Enemigo único derrotado», «carta recogida», «jefe derrotado» son banderas: una partida cargada construye cada sala **igual que una reaparición**, leyéndolas. Las banderas volátiles (`~…`, una puerta que se cerró para un combate) **nunca** se guardan.
- **No se guarda** lo que se rehace solo: vida y magia (se restauran), el estado de recarga de cada botella (al cargar están llenas) ni la posición exacta (se continúa en la **entrada** de la sala).
- **Reparación y validación** (`repairProgress`, usada al **leer y al escribir**): tipos erróneos → el valor por defecto *de ese campo*; listas con solo nombres válidos (`[A-Za-z0-9_.:-]{1,64}`), sin repetidos, ordenadas y acotadas (256 banderas, 64 habilidades, 16 cartas, 8 huecos); la carta equipada debe estar entre las que se tienen; claves desconocidas, fuera. Un lugar no válido cae al otro lugar, y al lugar vacío si ninguno vale (la sesión lo convierte en el inicio del mundo).
- **Versión y migraciones** (`parseProgress`): JSON → migrado de `v` a `v+1` → reparado. `null` si no es JSON, no es un objeto, no tiene versión entera, **o es de una versión más nueva** (pertenece a un juego posterior: se aparta, nunca se sobrescribe). Un fichero de ajustes no es un guardado (no tiene `saveVersion`). Hay un **fichero dorado** por versión (`tests/unit/save/golden/progress.v1.json`) que fija byte a byte que un cambio de formato no puede dejar ilegible el guardado de un jugador.

### Robustez: la misma que los ajustes, porque es el mismo código

`SafeStore<T>` (`save/SafeStore.ts`) se extrajo de `SettingsStore` **sin cambiar su comportamiento** (los 37 tests de ajustes y su sondeo caótico pasan intactos) y es lo que usan ahora los dos:

| Promesa | Cómo |
|---|---|
| **Un guardado válido no se pierde por escribir uno corrupto** | `.bak` ← la copia anterior **si es buena** (una dañada no sustituye nunca a la copia buena) · la principal ← la nueva · se **lee de vuelta** y se comprueba · solo entonces se borra el `.bak`. Lo que se interrumpa a medias deja siempre una copia buena |
| **Un guardado corrupto se conserva** | si la principal no se puede leer, se guarda como `.corrupt` (no se pisa) y se prueba el `.bak`; si tampoco, **partida nueva** |
| **Lo de una versión posterior no se toca** | se aparta como `.corrupt` |
| **Escrituras en orden** | cola serie: dos guardados rápidos llegan en orden, gana el último; escribir exactamente lo que ya hay no escribe nada |
| **Nunca lanza** | un almacenamiento lleno o bloqueado = el juego sigue en memoria y avisa **una vez** |
| **Borrar es a propósito** | `erase()` (`?new=1`) olvida el guardado, su `.bak` y su `.corrupt`, **después** de las escrituras ya pedidas |

**Sondeo de almacenamiento** (`tests/integration/progressSoak.test.ts`, mismo `ChaosStorage` compartido con el de ajustes): cientos de guardados y arranques en frío contra un almacén que lanza antes de escribir, escribe y luego lanza, guarda solo el principio del texto, pierde la escritura sin avisar, falla al borrar, y un proceso al que se mata a mitad de un guardado. Tras **cualquier** secuencia, una carga limpia da un guardado válido **que nunca es más antiguo que el último que informó éxito**. Pasa con 8 semillas × 600 operaciones y con **40 semillas × 4000** (una caza más profunda: `SOAK_SEEDS=40 SOAK_TICKS=4000`).

### Cuándo se guarda (`app/progressRecorder.ts`)

Al cambiar algo que pertenece al progreso: una bandera (puesta o quitada), una carta, una habilidad, un hueco de botella nuevo, una sala a la que se entra por una conexión (`room:entered`), un descanso (`checkpoint:set`) y una derrota que trae al héroe a otro sitio (`death:respawned`: lo descubrió el E2E `save`, ver abajo). Las ráfagas (coger una carta pone una bandera, la equipa y enseña una habilidad en el mismo tick) son **un solo guardado**, justo después del tick (`queueMicrotask`). No se guarda nada mientras no cambie nada: una partida nueva no deja rastro. **Los *playgrounds* (`?room=`) nunca leen ni escriben el progreso**; `?new=1` empieza de cero.

### Checkpoints (santuarios)

Un santuario es un **interactuable** de tipo `rest` con la acción `{ type: 'checkpoint', entry }`: reutiliza el icono, el verbo localizado («Descansar» / «Rest»), la pose `interact` de 12 ticks y el *buffer* del Prompt 5. **Descansar:**

| Qué | Regla |
|---|---|
| **El punto de reaparición** | la entrada `entry` de la sala pasa a ser el *checkpoint*; también donde continúa una partida guardada ahora |
| **Vida y magia** | **llenas** (la regla de vida: descansar cura del todo) |
| **Botellas** | **todas llenas** — es el único sitio donde se salta la recarga lenta (que sigue siendo a propósito tras una derrota) |
| **Efecto** | la luz cálida de beber, donde está el héroe; el cristal del santuario brilla mientras es **el** *checkpoint* y se apaga si es otro |
| **Guardado** | sí (`checkpoint:set`) |
| **Reutilizable** | siempre: un santuario no se gasta |

Hay uno en **R2** (el primer sitio donde descansar tras R1) y uno en **R4** (el último antes de la arena; el del jefe llega en S29). R1 empieza en su `start` (el *checkpoint* por defecto es el inicio del mundo) y R3 no tiene.

### La regla de muerte

| Caso | Qué pasa |
|---|---|
| **Morir** | sigue siendo **5 de vida, el mismo flujo** (muriendo → fundido → título → reaparición → fundido); vida y magia llenas; **las botellas no se rellenan**; flags, cartas, habilidades y *checkpoint* intactos |
| **Dónde se vuelve** | **al último *checkpoint***, en **cualquier sala** (se cayó en R3, se vuelve a R2: la sala se descarga y se construye la del santuario, con sus enemigos de vuelta). **Una transición no mueve el *checkpoint***; sin descanso previo es el inicio del mundo |
| **Muerte durante una transición** | cancela la transición (S23); el flujo de derrota trae al héroe al *checkpoint*; nada queda a medias |
| **Muerte fuera del mundo** | caer por debajo de `killY` sigue siendo daño + rescate en el último suelo seguro; si la caída mata, la reaparición va al *checkpoint* |
| **Una reaparición siempre tiene dónde ir** | un *checkpoint* que nombra una sala o una entrada que la sesión no tiene se **ignora al empezar** y, si deja de existir después, se vuelve al **lugar donde empezó la sesión** (con un aviso), nunca a ninguna parte |
| **Sesiones sin mundo** (los tests de una sola sala) | el *checkpoint* inicial es la entrada con la que se empezó, y una sala puesta a mano (`loadRoom`) es donde se vuelve: el comportamiento de siempre |

**Cobertura de los defectos del sondeo del Prompt 5:** los cinco que encontró `S20` (la derrota que reinicia durante su fundido de entrada, el `rescuePlayer` de un héroe caído, las teclas dobles…) siguen cubiertos por sus tests; el sondeo aleatorio de la sesión (`soak.test.ts`) corre ahora sobre **el mundo entero con santuarios** y lo único que hubo que ajustar fue su *premisa*: «la vida solo sube por una botella o una reaparición» ahora también admite **un descanso** (cambio de premisa del invariante, no un defecto del juego).

### Bundle: diagnóstico, optimización y cifras (el margen se agotó aquí)

S24 llevó el arranque en frío a **201.0 KB gz** (+1.9 KB sobre S23; presupuesto 200 KB). Diagnóstico por módulo (mapa de fuentes del *chunk* principal): `SafeStore` 0.74 KB (pero `SettingsStore` bajó de 0.79 a 0.33), `ProgressData` 0.70, `progress.ts` 0.36, `ProgressStore` 0.26, `progressRecorder` 0.25, `GameSession` +0.3, `InteractableViews` (el santuario) +0.2. **No hay nada grande que quitar:** la distribución es plana y lo que pesa es PixiJS (≈ 125 KB de los 201).

**Optimización aplicada: los efectos (VFX) se cargan DESPUÉS del primer fotograma.** Son cosméticos, nada del primer minuto de R1 los necesita (el primer enemigo está a 90 m) y, con el `ParticleContainer` de Pixi, eran una décima parte de la descarga. `app/effects.ts` es **un módulo aparte** (`VfxSystem` + `VfxDirector` + las tablas de VFX) que `Game2D` pide cuando la página está ociosa (2 s después y en el siguiente momento ocioso, o **de inmediato con `?hooks=1`** para que un test no dependa de la suerte). Hasta que llega, el juego simplemente no tiene efectos: ninguna regla depende de ellos.

> **Un detalle de Pixi que merece quedar escrito.** Pixi construye las *render pipes* de un renderer **cuando se crea**, a partir de las extensiones que existen entonces; la de partículas (`GlParticleContainerPipe`) vive en el módulo diferido, así que el renderer no la tiene y la primera partícula lo rompía (`Cannot read properties of undefined (reading 'updateRenderable')`, lo vio el E2E a la primera). `installParticlePipe` la añade al renderer vivo (`renderPipes.particle` + la cola de destrucción), como lo habría hecho `_addPipes`. Es una dependencia de un detalle interno de `pixi.js` **fijado en 8.22.0** (lockfile); los escenarios E2E `vfx`, `combat` y `soak` dibujan partículas por ahí, así que un Pixi que lo cambiara se vería en ellos.

| Medida (`npm run bench:bundle`, ahora **sin** `?hooks=1`: es la página de un jugador) | S23 | S24 |
|---|---|---|
| **Arranque en frío de R1** (lo que bloquea poder jugar) | 199.1 KB gz | **191.7 KB gz** (28 scripts) — **margen 8.3 KB** |
| Descargado después, cuando la página está ociosa (efectos: `VfxSystem` 5.2 + `ParticleContainer` 4.9 + `effects` 0.4) | — | 10.6 KB gz |
| **La primera sesión completa** | 199.1 KB gz | **202.2 KB gz** (31 scripts) |

> Las dos cifras son verdad y se publican las dos: el **arranque en frío** cumple el presupuesto de 200 KB con 8.3 KB de margen; **toda la primera sesión** lo supera en 2.2 KB porque los efectos y su *chunk* compartido pesan 10.6 + 1.2 KB. No se ha quitado nada para conseguirlo: se ha cambiado **cuándo** se descarga lo cosmético.

### Pruebas y E2E

- **Tests (+86, de 1302 a 1388):** `progressData` (18, con fichero dorado), `progressStore` (19), `safeStore` (6), sondeo caótico de progreso (2), `checkpoints` (24: descansar, la derrota que cruza salas, nunca descansó, el último descanso cuenta, repetidas derrotas sin fugas, regreso siempre válido, caer fuera del mundo, captura y restauración, un cargado no recoge lo recogido, lugares fantasma), `progressRecorder` (9), más reglas del validador (`checkpoint-entry`, `checkpoint-far`), de la interacción y del contenido (santuarios en R2 y R4, todos los verbos en todos los idiomas).
- **E2E (nuevos):** `checkpoint` (descansar con el teclado real → la derrota en R2 y en R3 vuelven al santuario; vida, magia y botellas solo las da el descanso; el icono sobre el santuario) y `save` (guardado al ocurrir, **una sola clave**, recarga que devuelve sala, banderas, carta, habilidades, botellas y *checkpoint*, y **un Spirit Bolt lanzado tras la recarga**; copia dañada → partida nueva con el texto conservado; dañada con `.bak` → el `.bak`; versión futura → apartada; sala fantasma → inicio del mundo con lo ganado; un *playground* no toca el guardado; `?new=1`).
- **Lo que el E2E encontró:** (1) la reaparición no guardaba `at` (volver tras una derrota a otro sitio dejaba el guardado apuntando a la sala donde se cayó): ahora `death:respawned` guarda; (2) la pipe de partículas diferida (arriba); (3) una carrera de un solo toque en `vertical` (el icono sigue a la cámara fotograma a fotograma: se vuelve a medir justo antes de tocar).
- **Adaptado (misma intención):** el escenario `transition` (el *checkpoint* ya no se mueve con una transición), tres tests de S23 que fijaban «la llegada es el punto de reaparición» (ahora fijan que **no lo es**: la llegada es donde continúa un guardado) y la premisa de vida del sondeo (arriba). Ninguno se borró ni se debilitó.

---

## S25 — Peligros ✅

**Qué es.** Una sala puede declarar `hazards: HazardDef[]` — zonas que hieren al héroe mientras están dentro (`kind: 'spikes'`, `rect`, `damage` opcional). **No son enemigos**: sin vida, sin cerebro, sin aviso. Y **no pasan por un sistema nuevo de daño**: la zona **envía su *hitbox* al sistema de combate cada tick en que el héroe está dentro**, y el combate decide, con las reglas de siempre. Por eso todo lo que se pidió sale de las reglas existentes y no de código nuevo:

| Requisito | De dónde sale |
|---|---|
| ***Hitbox*** | el `rect` de la zona (`team: 'enemy'`, `hits: ['player']`: los pinchos no hieren a los enemigos ni a lo neutral) |
| **Detección del jugador** | `HazardSystem.update` comprueba el cuerpo del héroe contra cada zona antes de enviar nada (sin basura por tick) |
| **Daño** | `damage` de la zona, 1 por defecto (el golpe estándar de GAME-SPEC-2D §9.1: aturdimiento 14 ticks, *hit-stop* 6) |
| **Empuje** | hacia **arriba** (7 m/s) y un poco **lejos del centro** de la zona (3.5): quien toca pinchos sale despedido de ellos, no a lo largo. En el centro exacto, contra el lado al que miraba |
| **Respeta los *i-frames*** | el combate ignora a un blanco `invulnerable`: un segundo contacto durante los 60 ticks no hace nada; **el primero tras ellos hiere otra vez** (la repetición) |
| **Emite evento** | `hazard:hit {roomId, hazardId, kind, damage, x, y}` solo cuando el golpe **conecta** (`onConfirm`); además salen `combat:hit`, `player:hurt`, `health:changed` como en cualquier golpe |
| **Funciona con la muerte** | con 1 de vida, el golpe mata por el flujo de siempre; un héroe caído no recibe más golpes; la reaparición vuelve al *checkpoint* |
| **Funciona durante la reaparición** | tras reaparecer el héroe está vivo y los pinchos le hieren de nuevo; si una sala pusiera el punto de reaparición *dentro* de una zona letal (error de contenido), la derrota **vuelve a empezar** cada vez (la corrección S20) sin fugas ni bloqueo (test) |
| **El pozo no cambia** | caer por debajo de `killY` sigue siendo daño + rescate; los pinchos son otra cosa |

**Dos detalles que hubo que cerrar:**

- **El suelo seguro nunca está dentro de una zona** (`trackSafeGround` consulta `hazards.touches`): sin esto, un héroe que cayera al vacío justo después de pisar pinchos podría ser devuelto **encima** de ellos. Test dedicado.
- **El validador** rechaza lo que haría injusta o rota una sala: `bad-hazard`, `hazard-outside`, `hazard-damage` (entero ≥ 1), `entry-in-hazard` (**ninguna entrada, ni la de un santuario, deja al héroe dentro**: llegar o volver de una derrota no puede empezar con un golpe), `hazard-in-exit` e `interactable-in-hazard`.

**Los pinchos de R2 (el precio del camino bajo).** Una franja de **2.5 m × 0.6 m** (x 39.5 … 42) en el suelo de la zanja. Medida con el bot: un salto corrido pasa 5.4 m de un vuelo de 6 m **por encima de 0.6 m**; la franja y el cuerpo piden 3.2 m ⇒ la **ventana de despegue es de ≈ 0.25 s** (x de 37 a 38.5 con la carrera de la bajada). Antes de ajustarla era de 0.16 s (una franja de 3 m × 0.8 m): se estrechó y se bajó para que un jugador de móvil la acierte. Fallar cuesta **un punto y un empujón hacia arriba y fuera**, no la partida, y el camino alto (las plataformas) los evita del todo. La carrera del bot que recorre el mundo (`journey.ts`) los salta con `jumpAt: [37.6]` y el test del viaje afirma que **no los toca**. El diseño respeta la regla del 20 % de margen: `span ≤ 0.8 × 5.4`.

**Vista.** `RoomView2D` dibuja cada zona con el terreno: filas de espinas oscuras con la punta clara en el violeta de lo que hiere (GAME-SPEC-2D §3.4) y una neblina violeta al pie; ~0.45 m por espina, una sola figura por zona, nada que actualizar. *Placeholder*: la forma sale del rectángulo.

### Pruebas y E2E

- **Tests (+33, de 1388 a 1421):** `hazardSystem` (9: sin zonas, el *hitbox* y sus números, bordes, héroe caído, dirección del empuje, varias zonas, el evento solo al confirmar, `touches`, cambio de sala), `hazards` (14 sobre la sala real: caminar dentro, el golpe de siempre —aturdido, hacia arriba y fuera, *hit-stop*, *i-frames*—, la repetición cada 60 ticks, `godMode`, saltarlos, el *i-frame* del dash, suelo seguro, el pozo de R1 intacto, morir por ellos y volver al santuario, héroe caído no herido, reaparición dentro de una zona letal, muerte en una transición, ciclo de vida de la sala, determinismo), 5 del validador, 3 de contenido y 3 de la vista.
- **E2E (nuevo) `hazard`:** los pinchos **se ven** (109 píxeles violeta en pantalla), **caminar dentro con el teclado real** cuesta un punto, empuja hacia arriba (`vy > 3`), activa el parpadeo y las invulnerabilidades, **sacude la cámara** y el HUD lo muestra; durante los *i-frames* un segundo contacto no hace nada, tras ellos hiere otra vez (≥ 60 ticks de diferencia); un **salto corrido con el teclado real los pasa sin tocarlos**; con 1 de vida **matan** y el héroe vuelve al santuario con el HUD y las capas limpios.
- **Adaptado (misma intención):** `worldRooms` (el camino bajo los salta) y `checkpoints` («caer una y otra vez» ya no se teletransporta a x = 40, que ahora está sobre los pinchos).

### Medido ✅

| | S24 | S25 |
|---|---|---|
| Tests | 1388 / 94 archivos | **1421 / 96 archivos** |
| Arranque en frío de R1 | 191.7 KB gz | **192.2 KB gz** (+0.5 KB: `HazardSystem`, la vista y las reglas del validador que no entran) — margen 7.8 KB |
| Toda la primera sesión | 202.2 KB gz | 202.7 KB gz |

---

## S26 — Zonas de cámara ✅

**Qué es.** Cada sala declara **los límites de su cámara** (`camera.bounds`: el área que la vista puede mostrar — izquierda, derecha, arriba y abajo) y, opcionalmente, **zonas** (`camera.zones`): partes de la sala donde la vista se sujeta a **otros** límites y, si se quiere, a otra altura visible. Nada de cámara cinematográfica: una zona solo decide **dentro de qué límites** debe quedarse la vista mientras el héroe está en ella, y los límites **se funden** al entrar y al salir (la vista nunca salta). La zona que importa en el Prompt 6 es la **arena del jefe** (S29), pero el mecanismo es genérico (un pozo vertical, un pasaje).

```ts
interface CameraZoneDef { id; rect; bounds; viewHeight?; whenSet?; whenClear?; smoothTime? }
```

| Pieza | Qué hace |
|---|---|
| `roomLimits(room)` | los límites de la sala: `camera.bounds`, o su extensión si no declara ninguno (una sala escrita antes sigue igual) |
| `resolveCameraView(room, flags, x, y, out)` | **función pura**: qué límites, qué altura y qué zona valen ahora. Gana **la primera zona**, en el orden en que la sala las lista, cuyo `rect` contiene **los pies** del héroe (bordes incluidos) y cuyas condiciones de bandera lo permiten (`whenSet` / `whenClear`: una arena que está cerrada mientras dura la pelea y libre cuando el guardián cae). Escribe en un objeto reutilizado (cero asignaciones por fotograma) y devuelve **el mismo objeto de límites** para la misma sala o zona, así que un cambio es una comparación de identidad |
| `CameraAdapter2D.setView(view)` | solo actúa cuando **cambia la zona**: funde los límites en `smoothTime` de la zona (el de la cámara si no tiene) y la altura visible; un corte (teletransporte, cambio de sala) los toma de golpe. `setRoom` vuelve a los límites de la sala y a la altura normal |
| Validador (`validateRoom`) | `bad-camera`, `camera-outside` (los límites no pueden salirse de la sala), `camera-entry` (los límites contienen **cada entrada con el héroe de pie**: nadie llega fuera de plano), `camera-exit`, `bad-camera-zone`, `camera-zone-bounds` (los límites de una zona **contienen la zona**: el héroe no puede salir de la imagen), `camera-zone-zoom` (4 … 30 m), `camera-zone-smooth` (≥ 0), `camera-zone-flag` (la bandera la pone algo) |

**Los límites de cada sala** (metros): R1 −1 … 114 × −6 … 11 · R2 −1 … 92 × −6 … 11 · R3 −1 … 80 × −6 … **12** (la repisa está a 4.8 m y un salto sobre ella sube más) · R4 −1 … 100 × −6 … 11. **El pie del suelo es el fondo de la imagen**: el suelo tiene 6 m de profundidad y la vista nunca baja de ahí, de modo que la zanja de R2 se ve como una zanja y no como un vacío.

**La arena de R4** (`arena`: `rect` 26.5 … 65.5 × −1 … 12, límites 25 … 67 × −6 … 10, altura visible 15 m en vez de 13.5, `smoothTime` 0.8 s). Mientras los pies del héroe están dentro la vista **queda sujeta a la arena** —con las puertas de los dos extremos, de modo que se ven— y se aleja un poco para ver lo que viene; en cuanto sale, los límites de la sala y la altura normal **vuelven fundiéndose**. Hoy no depende de ninguna bandera; en S29 llevará `whenClear: 'defeated:r4_boss'` y la cámara se soltará sola cuando el jefe caiga.

### Pruebas y E2E

- **Tests (+55, de 1421 a 1476):** `cameraZones` (17: sin cámara propia los límites son la extensión y no hay zoom; límites propios fuera de las zonas; dentro de una zona valen los suyos —límites, altura y tiempo de fundido—; **los pies** del héroe, bordes incluidos; las banderas `whenClear` y `whenSet`; **la primera zona gana**; el objeto de salida se reutiliza y los límites son el mismo objeto cada vez; en cinco tamaños de pantalla la vista nunca enseña más allá de la arena dentro de ella ni más allá de la sala fuera; entrar tira de la vista a 15 m y la sujeta, salir —o caer el guardián— la suelta a 13.5 m: **se funde, no salta**; el fundido es el de cada zona; un héroe puesto **dentro** de la arena —una reaparición, una partida cargada— la recibe de golpe, sin fundir desde la sala; una sala nueva olvida la zona de la anterior; `setView` no hace nada mientras la zona es la misma: no reinicia un fundido en curso), `roomCameras` (31: **cada sala del mundo** declara límites dentro de su extensión que contienen cada entrada, salida y superficie —con la cabeza— y no bajan del pie del suelo; y en **cada tamaño de pantalla de `SIZES`** el héroe está en pantalla de pie sobre **cada superficie** de la sala y la vista queda dentro de los límites que valen allí; la arena de R4: es una zona, es ancha para pelear, el vestíbulo y la cámara del tesoro quedan fuera) y 7 del validador (cada regla de arriba, y que una sala sin datos de cámara, con límites más justos o con una zona sana no levanta nada).
- **E2E `camera` (ampliado, dev y producción):** en cada sala del mundo la vista queda sujeta **a los límites que la sala declara** (al inicio, en el centro y en el extremo) y nunca enseña nada bajo el pie del suelo; en R4, **caminando de verdad con el teclado** hacia la arena, la zona **se activa al cruzar su borde**, los límites **se funden** (≥ 3 muestras con el borde en camino, y ningún salto de más de la mitad del recorrido entre dos muestras) y la imagen queda dentro de los límites que valen en cada instante; ya dentro, los límites son los de la arena y la altura es de 15 m; en el extremo este la vista **para en la puerta**; **fuera de la arena** vuelven los límites de la sala y los 13.5 m; y en el 21:9 y el 4:3 la vista sigue dentro de la arena. `world` (adaptado): la cámara de cada sala se compara con **sus** límites (antes, con la extensión de la sala), en los cuatro lados.
- **Gancho de pruebas nuevo:** `state().camera` ahora incluye `zone` y `limits` (los límites eficaces, ya fundidos), y `settleCamera(segundos)` deja correr el tiempo propio de la cámara sin esperar fotogramas lentos de GL por software (el escenario `camera` pasó de 100 s a 20 s sin perder cobertura: lo que se comprueba con tiempo real —el fundido al caminar— sigue usando fotogramas reales).

### Medido ✅

| | S25 | S26 |
|---|---|---|
| Tests | 1421 / 96 archivos | **1476 / 98 archivos** |
| Arranque en frío de R1 | 192.2 KB gz | **192.6 KB gz** (+0.4 KB: `cameraZones` y las reglas del validador que no entran) — margen 7.4 KB |
| Toda la primera sesión | 202.7 KB gz | 203.2 KB gz |

---

## S27 — Cuarta botella ✅

**Qué es.** Una botella de energía más, **en el mundo**: de las 3 con las que empieza el héroe a las 4 que permite `BOTTLES.rules.maxSlots`. Es un interactuable de R2 como cualquier otro — **no hay tienda, ni contador, ni economía**: un objeto, una bandera, una ranura.

```ts
{ id: 'bottle_fourth', kind: 'pickup', verbKey: 'interact.pickUp', x: 49.5, y: 4.8, whenClear: 'taken:bottle_fourth',
  actions: [{ type: 'addBottleSlot', bottleId: 'energy_bottle' }, { type: 'setFlag', flag: 'taken:bottle_fourth' }] }
```

**Dónde.** En la **repisa `p5`** del camino alto de R2 (x 48 … 51, a 4.8 m, sobre el extremo derecho de la tercera plataforma): la recompensa de quien **elige** el camino de arriba y se detiene a subir un escalón más. El camino hacia delante **no la necesita** (la salida de R2 no `requires` nada de esto, y el validador de mundo lo comprueba), y el diseño de S22 ya garantiza que no se llega por accidente (el salto corrido desde el borde de la segunda plataforma aterriza en la tercera, no en la repisa; desde el suelo no se llega). Con los botones de una persona: del `west` de R2, las tres primeras plataformas, un salto vertical desde debajo de la repisa y *Interact* son **385 ticks** (`fetchTheFourthBottle` en `tests/helpers/journey.ts`: la misma ruta la prueba el test de simulación y la graba y repite el E2E).

**«No se puede conseguir dos veces» — por construcción, no por un parche:**

| Situación | Por qué se cumple |
|---|---|
| Pulsar *Interact* otra vez (o cien veces, o desde otro punto de la repisa) | la ranura y la bandera se escriben **en el mismo tick**; `whenClear` oculta el objeto desde ese momento y el héroe se queda en la pose de interacción 12 ticks. Un solo `bottle:changed {added}` y un solo `interaction:performed` (test) |
| Una derrota | las banderas del mundo sobreviven a la muerte y la derrota **ni da ni quita** botellas (tampoco rellena: la que se bebió sigue vacía hasta recargar); la repisa sigue vacía |
| Una derrota **antes** de cogerla | no se pierde nada: sigue allí, una vez |
| Una transición (R2 → R3 → R2) o recargar la sala | la bandera es del mundo, no de la sala: el objeto no se vuelve a construir |
| Una partida guardada | `bottleSlots: 4` y la bandera se guardan **en la misma escritura** (una sola clave): no puede quedar guardada una sin la otra |
| Un guardado dañado a mano (4 ranuras, sin bandera) | coger el objeto no da nada más (`BottleSet` no pasa de 4: `addSlot` devuelve `false`), y la bandera lo oculta; ni siquiera con `bottleSlots: 99` salen más de 4 |
| Descansar en el santuario | rellena **las cuatro** (como las tres: S24) |

**Sensación (placeholder, sin arte final):**

- **En el mundo:** el marcador de un pickup que da una ranura de botella es **un frasco** (el del HUD: cuello, hombros, líquido encendido y tapón blanco, ~0.4 × 0.6 m) en lugar de la carta; flota 0.85 m sobre la repisa y desaparece al cogerlo. Qué dibuja cada pickup lo decide **lo que da** (`addBottleSlot` → frasco), no un campo nuevo del contenido.
- **VFX:** nuevo disparador `pickup` (anillo que se abre, destello y motas de luz que suben; paleta de energía, nada violeta), lanzado por el director con `interaction:performed` de un `pickup` **donde flotaba el objeto**. Es dato (`VFX_BINDINGS.pickup`): S28 lo reutiliza para la carta.
- **HUD:** el frasco **nuevo** llega con un resplandor blanco y un pequeño hinchado que se asienta en 0.9 s (`BottleViewState.gain`); una partida que **carga** con cuatro frascos **no** lo anuncia (el modelo solo anuncia un frasco que no estaba en el fotograma anterior).

### Pruebas y E2E

- **Tests (+35, de 1476 a 1511):** `bottleFourth` (18, sobre el mundo real: dónde está y cómo se llega con la ruta de los botones; el icono solo para quien está **sobre** la repisa; una vez, a pesar de cien pulsaciones; es una botella como las demás —se bebe, recarga una a una y el santuario rellena las cuatro—; sobrevive a una derrota, a una derrota previa, a una transición y a recargar la sala; la captura guarda las cuatro y la bandera juntas, una partida cargada las tiene sin el objeto, una guardada antes lo conserva, y un guardado dañado no da una quinta), `world` de contenido (4: una sola en el mundo y 3 + 1 = 4, sobre la repisa, su bandera es solo suya y la que lo oculta), `hudModel` (3) y `hudView` (2) del resplandor, `pickupVfx` (5), `interactableViews` (3: el frasco, más alto y más ancho que la carta, y desaparece al cogerlo).
- **E2E (nuevo, 29.º escenario) `bottle4`:** parte de una partida guardada en la entrada de R2 (la sembrada en el almacenamiento y recargada, en pausa desde el tick 0), **graba en Node** la ruta a la repisa y **la repite con el teclado real** comparando el digest de toda la simulación (botellas y banderas incluidas) cada 50 ticks. Después: cuatro botellas llenas y la bandera; el frasco nuevo **llegó brillando**; se **abrió una luz** donde flotaba; el icono se fue con el objeto y una segunda pulsación no da nada; el guardado tiene `bottleSlots: 4` y la bandera; **recargar** da cuatro (sin anunciar el cuarto) y la repisa vacía; **una transición** R2 → R3 → R2 y **una derrota** (vuelve al santuario con cuatro, y la botella bebida sigue recargando) lo dejan igual; **en táctil** el icono es el botón (verbo en el idioma del jugador, objetivo ≥ 44 px), un toque lo coge y los cuatro frascos caben en pantalla sin quedar bajo ningún botón; y una partida nueva (`?new=1`) vuelve a tener tres.
- **Adaptado:** el escenario `vfx` (y la lista de disparadores del laboratorio) incluye `pickup`.

### Medido ✅

| | S26 | S27 |
|---|---|---|
| Tests | 1476 / 98 archivos | **1511 / 100 archivos** |
| Arranque en frío de R1 | 192.6 KB gz | **192.9 KB gz** (+0.3 KB: el marcador del frasco y el resplandor del HUD; los efectos van en el *chunk* diferido) — margen 7.1 KB |
| Toda la primera sesión | 203.2 KB gz | 203.6 KB gz |

---

## S28 — Spirit Bolt en R3 ✅

**Qué cambia.** La carta del Spirit Bolt **deja de existir en R1** (era un *pickup* provisional al final del túnel de gateo, del Prompt 5) y pasa a **R3**, en la repisa de 4.8 m a la que se sube con dos saltos. Y R3 gana su razón de ser: **un sello** de tinta violeta que cierra el camino a R4 y que **solo rompe el Spirit Bolt** (la espada rebota). El jugador aprende la habilidad y la usa **en la misma sala**. Valores sin tocar: coste 30, magia máxima 100, regeneración 6/s.

```ts
// R3 «Cámara del Sello»
interactables: [{ id: 'card_spirit_bolt', kind: 'pickup', x: 34.5, y: 4.8, whenClear: 'taken:card_spirit_bolt',
                  actions: [{ type: 'acquireCard', cardId: 'card_spirit_bolt' }, { type: 'setFlag', flag: 'taken:card_spirit_bolt' }] }],
solids:  [... block('seal_wall', 63, 0, 64.2, 9, 'seal')],
gates:   [{ id: 'seal_gate', solid: 'seal_wall', openWhen: 'broken:r3_seal' }],
seals:   [{ id: 'seal', x: 63, y: 0, accepts: ['spirit_bolt'], flag: 'broken:r3_seal', needs: 'taken:card_spirit_bolt' }],
exits:   [..., { id: 'east', ..., requires: 'broken:r3_seal' }],
```

### Cómo funciona el sello (todo con piezas que ya existían)

| Pieza | Qué es |
|---|---|
| `SealDef` (`RoomDefinition.seals`) | datos: dónde está, qué ataques lo rompen (`accepts`), qué bandera pone (`flag`) y qué bandera dice que el héroe **tiene** con qué romperlo (`needs`, solo para el validador de mundo) |
| `Seal` (`gameplay/Seal.ts`) | un **`Combatant` neutral** (el combate ya dejaba a los ataques del jugador alcanzar a lo neutral y nunca a los enemigos): el combate le pregunta qué hace con cada golpe. **No acepta** el ataque → lo **gasta** (`blocked`, sin daño ni *hit-stop*), parpadea y anuncia `seal:rejected {x, y, dirección, sacudida}`. **Sí acepta** (`spirit_bolt`) → se rompe de un golpe y anuncia su caída con **el mismo `actor:died` que usa cualquier guardián**: así es como la sesión pone su bandera (`defeatFlags`), sin mecanismo nuevo |
| La puerta | **una `GateDef` corriente**: la losa de 9 m (más que cualquier salto desde la repisa: 4.8 + 3.1 = 7.9 m) se abre con la bandera del sello, y la salida este de R3 `requires` esa bandera (el mapa del mundo lo sabe) |
| Dónde está el área vulnerable | **delante** de la puerta (1.4 m a cada lado de x = 63): el proyectil (alcance 12 m) encuentra el sello **antes** que el muro; desde ≈ 49 m hasta el pie del sello hay carril para disparar, y más de 8 m de él alcanzan |
| Persistencia | la bandera `broken:r3_seal` es del mundo: sobrevive a derrota, transición, recarga de sala y partida guardada; un sello roto **no se vuelve a construir** y su puerta queda abierta |

**El mundo sigue siendo completable — probado, no supuesto.** `analyzeProgression` entiende los sellos: un sello concede su bandera solo cuando la `needs` ya está en el conjunto (la carta, que está **en la misma sala y antes**). `validateWorld` lo demuestra para el mundo entregado, y los tests **rompen** el mundo a propósito para ver que se queja: sin la carta, R4 queda `room-unreachable`; con la carta **detrás** del sello, `flag-ungranted` + `room-unreachable`. El validador de sala añade `bad-seal`, `seal-outside`, `seal-floating`, `seal-accepts`, `seal-needs` y `seal-orphan` (un sello que no sostiene nada: ninguna puerta de la sala se abre con su bandera ni ninguna salida la pide).

### Sensación (placeholder, sin arte final)

- **El sello:** la puerta se dibuja como **una cortina de tinta violeta** (cuerpo oscuro, bordes brillantes, peldaños de glifos y goteos; no la losa de piedra de R1) y delante de ella el **sigilo**: un rombo violeta con una rendija blanca sobre un halo que respira, en la capa de luz. Violeta = lo enemigo (GAME-SPEC-2D §3.4); **el protagonista sigue siendo la cápsula con espada, sin tocar**.
- **Un golpe rechazado:** el sigilo destella en blanco y se encoge, una **onda violeta** se abre donde cayó el golpe y salen **chispas hacia atrás** (`sealRejected`, dato en `VFX_BINDINGS`), la cámara se sacude un poco (0.1) y **nada se congela** ni se hiere.
- **Romperlo:** el bolt impacta como siempre, el sello se hincha y se desvanece en 30 ticks con **la ráfaga de tinta de cualquier muerte** (`enemyDied`), y la cortina de la puerta se disuelve.
- **Coger la carta:** la misma luz de recogida de S27 (`pickup`), y ahora **la ranura de carta del HUD llega brillando** y se asienta (`card.gain`, 0.9 s; una partida que **carga** con la carta no lo anuncia); el botón **Ability** del táctil aparece solo (ya seguía a la carta equipada).

### Lo que se adaptó (misma intención, nada borrado)

| Qué fijaba | Cómo queda |
|---|---|
| `vertical` (test y E2E): R1 completa con la carta tomada en el túnel | el héroe de esos recorridos es **el que vuelve a R1 con la carta ya ganada** (`freshR1WithBolt` en Node; `GIVE_THE_BOLT` en el navegador, antes del tick 0: el digest incluye carta y bandera). Lo demás —túnel, dos bolts, botella, puerta, salida, derrota— igual. «R1 no ofrece nada» es ahora una aserción (ningún `available:`/`performed:` en todo el recorrido; en táctil el icono no aparece al final del túnel) |
| `interaction` (test y E2E): «la carta provisional de R1» | R1 **sin** interactuables (el icono no aparece donde estaba y Interact no hace nada) y **la carta en la repisa de R3** (sin icono desde el suelo; con él sobre la repisa; Ability a la vez) |
| `transitions`, `worldRooms`, `worldJourney`, `world` (E2E), `transition` (E2E) | la salida este de R3 pide la bandera: los recorridos por teletransporte llevan `broken:r3_seal`; el carril se camina hasta **el pie de la puerta** (y no más allá) y, con el sello roto, hasta la salida; **el viaje por el mundo** (`playWorld`, que el E2E graba y repite con el teclado real) ahora **sube a la repisa, coge la carta, baja y rompe el sello de un bolt** (443 ticks desde la puerta oeste de R3) |
| `soak` | la mitad de las semillas empiezan como el héroe que vuelve con la carta (la otra mitad, sin ella: se sigue ejercitando «la barra que se gasta» y «la que se rechaza» desde el primer tick, y la carta se sigue encontrando interactuando en las salas que la tienen) |

### Pruebas y E2E

- **Tests (+70, de 1511 a 1581):** `seal` (17, en una sala sintética: se construye neutral con su puerta cerrada, su área está **delante** de la puerta, la espada rebota —una vez por golpe, sin daño, sin *hit-stop*, con parpadeo—, cualquier otro ataque y ninguno de los enemigos la rompen ni la alcanzan, un bolt la rompe —bandera, puerta, salida, coste— y se disuelve en 30 ticks, no se rompe dos veces, una cuclillas o desde el límite del alcance también llega y **desde más lejos se queda corto**, y **se queda rota** tras recargar la sala, tras una derrota y tras una partida guardada), `spiritBoltWorld` (18, sobre **R3 real**: sin carta Ability no hace nada; la repisa solo se alcanza con la subida; coger la carta equipa, enseña la habilidad y escribe la bandera en la misma pulsación; el estado del HUD; una sola vez; derrota, derrota previa, transición y partida guardada; el sello entero con su puerta cerrada, **nada más que el bolt pasa** —andar, saltar desde la repisa y dash—, la espada rebota las veces que haga falta, un bolt desde 11 m la rompe, la ruta completa con botones, sin magia no se rompe y **a los 6 s sí**), validador (+6) y grafo del mundo (+5: concede/espera, se rompe en papel solo cuando se puede tener la carta, la carta detrás del sello o una `needs` que nada pone dejan el mundo sin terminar), contenido (+7: una sola carta en el mundo y en R3, sobre la repisa, la puerta más alta que un salto, el sello delante, solo el bolt, ≥ 8 m de carril para disparar, mundo entero sobre el papel y roto sin la carta), `sealView` (8), `sealVfx` (4), HUD de la carta (3) y el viaje del mundo (+1).
- **E2E (nuevo, 30.º escenario) `progression`:** **A** una partida nueva no tiene carta (Ability no hace nada, ranura vacía). **B** desde una partida guardada en la puerta oeste de R3, **graba en Node** la subida, la carta, la bajada y un bolt, y **la repite con el teclado real** comparando el digest cada 50 ticks: el héroe **toma la carta sobre la repisa** (pose de interacción), la ranura **llega brillando**, el bolt cuesta 30, **el sello cae y su puerta se disuelve**, y el mundo contó los hechos **en orden** (carta, habilidad, equipar, lanzar, puerta, caída, impacto). **C** el guardado tiene carta + habilidad + las dos banderas; recargar da el héroe con la carta (sin anunciarla), el sello **no se construye**, la repisa vacía, Ability funciona y el camino a R4 está abierto. **D** una derrota lo conserva todo. **E** en **táctil** el icono es el botón, coger la carta dibuja el botón Ability, **un toque en Ataque es rechazado por el sello** (sin daño, sin puerta abierta, sin *hit-stop*, el sello entero) y **un toque en Ability lo rompe**.
- **Gancho/estado:** ninguno nuevo.

### Medido ✅

| | S27 | S28 |
|---|---|---|
| Tests | 1511 / 100 archivos | **1581 / 104 archivos** |
| Arranque en frío de R1 | 192.9 KB gz | **193.9 KB gz** (+1.0 KB: `Seal`, `SealView`, la cortina de la puerta, las reglas del validador/grafo que no entran, el resplandor de la carta) — margen 6.1 KB |
| Toda la primera sesión | 203.6 KB gz | 204.7 KB gz |
