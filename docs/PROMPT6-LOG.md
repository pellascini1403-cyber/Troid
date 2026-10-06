# Bitácora del Prompt 6 — de una sala aislada a un mini-mundo metroidvania conectado

> Registro técnico de la ejecución (pasos S21–S32): qué se hizo, qué se midió, qué se desvió y por qué.
> Las decisiones de los Prompts 3, 4 y 5 están **cerradas** ([ADR-0003](adr/0003-arquitectura-2d-definitiva.md), [GAME-SPEC-2D](GAME-SPEC-2D.md), [PROMPT5-LOG](PROMPT5-LOG.md)); aquí solo se documenta su ampliación. Si algo choca con ellas, se marca con **⚠ CONFLICTO**.
> Cifras medidas ✅ en este entorno (Chromium sin GPU: render por software; sirve para comparar, no como cifra absoluta). **No se ha verificado nada en un iPhone, un iPad ni un Android reales, ni con un mando físico.**

## Estado

| Paso | Estado | Commit |
|---|---|---|
| **S21** baseline | ✅ | `1b4756a` |
| **S22** grafo de mundo (`WorldDefinition`, R1–R4, validación) | ✅ | (ver historial) |
| **S23** transiciones entre salas | ⏳ | |
| **S24** guardado de progreso y checkpoints | ⏳ | |
| **S25** peligros | ⏳ | |
| **S26** zonas de cámara | ⏳ | |
| **S27** cuarta botella | ⏳ | |
| **S28** Spirit Bolt en R3 | ⏳ | |
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
