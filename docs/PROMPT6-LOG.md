# Bitácora del Prompt 6 — de una sala aislada a un mini-mundo metroidvania conectado

> Registro técnico de la ejecución (pasos S21–S32): qué se hizo, qué se midió, qué se desvió y por qué.
> Las decisiones de los Prompts 3, 4 y 5 están **cerradas** ([ADR-0003](adr/0003-arquitectura-2d-definitiva.md), [GAME-SPEC-2D](GAME-SPEC-2D.md), [PROMPT5-LOG](PROMPT5-LOG.md)); aquí solo se documenta su ampliación. Si algo choca con ellas, se marca con **⚠ CONFLICTO**.
> Cifras medidas ✅ en este entorno (Chromium sin GPU: render por software; sirve para comparar, no como cifra absoluta). **No se ha verificado nada en un iPhone, un iPad ni un Android reales, ni con un mando físico.**

## Estado

| Paso | Estado | Commit |
|---|---|---|
| **S21** baseline | ✅ | (ver historial) |
| **S22** grafo de mundo (`WorldDefinition`, R1–R4, validación) | ⏳ | |
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
