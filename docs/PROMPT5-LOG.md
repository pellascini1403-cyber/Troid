# Bitácora del Prompt 5 — capa de interacción móvil y sistemas del jugador

> Registro técnico de la ejecución (pasos S12–S20): qué se hizo, qué se midió, qué se desvió y por qué.
> Las decisiones de los Prompts 3 y 4 están **cerradas** ([ADR-0003](adr/0003-arquitectura-2d-definitiva.md), [GAME-SPEC-2D](GAME-SPEC-2D.md)); aquí solo se documenta su implementación. Si algo choca con ellas, se marca con **⚠ CONFLICTO**.
> Cifras medidas ✅ en este entorno (Chromium sin GPU: render por software; sirve para comparar, no como cifra absoluta). **No se ha verificado nada en un iPhone ni en un Android reales.**

## Estado

| Paso | Estado | Commit |
|---|---|---|
| **S12** baseline y revisión del bundle | ✅ | (ver historial) |
| **S13** input unificado (4 commits: contrato, gestos, gamepad, capa DOM + E2E) | ✅ | (ver historial) |
| **S14** HUD (DOM) y los recursos que muestra (2 commits: recursos, HUD) | ✅ | (ver historial) |
| **S15** magia y Spirit Bolt | ✅ | (ver historial) |
| **S16** cartas y botellas | ✅ | (ver historial) |
| **S17** interacción contextual | ✅ | (ver historial) |
| **S18** idioma persistente y ajustes | ✅ | (ver historial) |
| **S19** integración en R1 y los 8 escenarios E2E | ✅ | (ver historial) |
| **S20** validación final y documentación | ⏳ | |

---

## Reglas de ejecución que se siguen

- **Simulación → eventos de juego → presentación / UI → adaptadores de input.** El HUD no modifica la física; los botones táctiles no llaman a métodos internos del jugador (emiten *acciones* al `InputManager`); Pixi no conoce las reglas; el DOM no depende de las entidades (lee un modelo plano alimentado por eventos).
- La simulación sigue siendo determinista (60 Hz fijo): mismo input ⇒ mismo estado, bit a bit.
- Los **617 tests** de partida no se modifican para esconder una divergencia: si algo choca, se adapta el *driver* o se añade una capa y se documenta.
- Un commit pequeño por unidad de trabajo; cada paso termina con typecheck, tests, build y, cuando hay algo visible, E2E y revisión de consola.
- `wip/f6-combat-core` **no se toca** (`b695c98`); la rama `archive/proto-3d-f5` tampoco.
- Sin arte final: **el protagonista sigue siendo el *placeholder* abstracto (cápsula) del Prompt 3/4.** No se inventa rostro, cabeza humana, pelo, máscara, ropa ni silueta alternativa; el HUD y los controles táctiles usan solo la paleta cerrada (negro, blanco, cian/azul; violeta para los avisos enemigos; carmín opcional y apagado).

---

## S12 — Baseline y revisión del bundle ✅

**Punto de partida:** rama `claude/troid-vertical-slice` en `2985f23` (fin del Prompt 4), árbol limpio, sincronizada con el remoto.

| Comprobación | Resultado ✅ |
|---|---|
| Typecheck (`tsc --noEmit`) | 0 errores |
| Tests (`vitest run`) | **617/617** en 42 archivos |
| Build de producción (`npm run build`) | OK en 0.8 s |
| E2E producción (`npm run test:e2e -- --prod`) | **12/12** |
| E2E desarrollo (`npm run test:e2e`) | **12/12** |
| *Draw calls* | R1: 10–12 en la salida, **peor caso de toda la sala 14** (presupuesto 60) |
| Bundle de arranque en frío de R1 (`npm run bench:bundle`) | **195.6 KB gz** (624.4 KB raw), 27 scripts — presupuesto 200 KB |

### El problema: 4.4 KB de margen frente a un prompt que añade mucho código

El Prompt 5 añade reconocedor de gestos, controles táctiles DOM, gamepad, HUD, magia, habilidades, cartas, botellas, interacción, proyectil, ajustes con almacenamiento… Es TypeScript propio (estimación previa: 12–20 KB gz). Con 4.4 KB de margen **no cabría**, así que antes de añadir nada se midió qué entra de Pixi y se comprobó si se puede importar solo lo necesario (regla del Prompt 5: *no optimizar de forma destructiva, no sacrificar funcionalidad por una cifra*).

### Qué entra en el arranque en frío (antes de tocar nada)

| Origen | gz | Detalle |
|---|---|---|
| **App** (nuestro código) | ≈ 57 KB | `Game2D` 25.1 (simulación, combate, jugador, enemigos, cámara, mundo, depuración) · `ActorSprite` 13.2 (sprites, animación, validadores) · `VfxSystem` 6.1 · `Renderer2D` 4.7 · `vocabulary` 4.3 (contenido) · `ProceduralActor` 1.8 · resto 1.8 |
| **Pixi** (WebGL + escena) | ≈ 122 KB | `Geometry` 22.3 · `GraphicsContext` 20.0 · `WebGLRenderer` 19.2 · `RenderTargetSystem` 15.9 · `Filter` 11.7 · `init` 8.0 · `CanvasRenderer` 7.8 · `GCManagedHash` 6.2 · `ParticleContainer` 4.9 · `getTexelRangeRects` 3.0 · `canvasUtils` 2.0 · otros 1.0 |
| **Pixi, carga automática del entorno** | **16.0 KB** | `browserAll` 10.9 + `init` 4.4 + `defaultFilter.vert`/`getPo2Texture` 0.7 |

Diagnóstico (Pixi 8.22.0, leído en `node_modules/pixi.js/lib`):

- `Renderer.init()` llama a `loadEnvironmentExtensions()`, que importa en caliente `browserAll`: **accesibilidad** (`AccessibilitySystem`, que además escucha `Tab` y crea nodos DOM), **`DOMContainer`**, **sistema de eventos** (`EventSystem`, `FederatedContainer`), **spritesheets** y **filtros** (`FilterSystem`, `FilterPipe`).
- El juego no usa **ninguno**: el HUD, los controles táctiles y el texto son DOM (ARCHITECTURE-2D §8), el input lo gestiona `input/` y no hay filtros en el juego (solo en el laboratorio de estrés).
- Pixi documenta la salida para este caso: la opción `skipExtensionImports` (*«Used for custom tree-shaken builds»*, `skills/pixijs-application/references/application-options.md`). `Assets`, `Texture.from` y las fuentes de textura **no** dependen de ella (se registran en sus propios módulos).

### Qué se cambió (mínimo y reversible)

- `render/Renderer2D.ts`: `skipExtensionImports: true` (con el motivo en un comentario).
- `app/labs/stressLab.ts`: `import 'pixi.js/filters'` — el único sitio que usa un filtro lo importa él mismo (el laboratorio es un *chunk* aparte).

No se cambió de versión ni de API de Pixi, no se eliminó ninguna función y no se tocó el comportamiento de las escenas.

### Resultado ✅

| | Antes | Después |
|---|---|---|
| Arranque en frío de R1 | 195.6 KB gz · 27 scripts | **179.6 KB gz · 23 scripts** (−16.0 KB, −8.2 %) |
| Margen frente a 200 KB | 4.4 KB | **20.4 KB** |
| Tests | 617/617 | 617/617 |
| E2E producción | 12/12 | 12/12 (tras importar los filtros en el laboratorio de estrés, que fue lo único que falló) |
| E2E desarrollo | 12/12 | 12/12 |

**Opciones no tomadas (ya medidas, por si hicieran falta):** cargar el panel de depuración (`DebugPanel`, `TuningInspector`, `ColliderOverlay2D`) solo con `?debug=1` (≈ 3–4 KB gz) · separar de `Graphics` los *pipes* de canvas que `scene/graphics/init` registra (≈ 4–5 KB gz, requiere configurar el agrupado de *chunks* de Rolldown: más frágil) · cargar el código táctil solo en dispositivos con puntero grueso (**descartado**: la plataforma prioritaria es el móvil, la cifra sería artificial).

**Regla para el resto del prompt:** el bundle se vuelve a medir al terminar cada paso que añade código visible (S13, S14, S16, S18) y la cifra queda en esta bitácora. Si algún día supera 200 KB gz, se diagnostica y se documenta aquí en lugar de recortar funcionalidad.


---

## S13 — Input unificado ✅ (`S13a` contrato · `S13b` gestos · `S13c` gamepad · `S13d` capa DOM, hooks y E2E)

Tres dispositivos, **una** abstracción: teclado/ratón, táctil y gamepad llaman a `InputManager.setAction / setAxis / requestBottle`; la simulación solo ve un `InputFrame`. Nada de gameplay conoce teclas, botones ni elementos de UI.

### 1. El hallazgo del Prompt 4 y el contrato de ejes (decisión explícita)

**Hallazgo.** `InputManager.sample()` normalizaba **todo** vector combinado a la circunferencia unidad: un teclado con *derecha + abajo* daba `(0.707, −0.707)` mientras los tests de movimiento (y las grabaciones que el navegador reproduce) usan el `(1, −1)` crudo. No era solo una diferencia de tests: con la normalización, **pulsar `W` o `S` mientras se corre bajaba la velocidad horizontal a 5.8 m/s** (`speedForMagnitude(0.707)`), un defecto latente del teclado.

**Contrato** (documentado en `InputFrame.ts`; `move.x` = cuánto correr, `move.y < −0.6` = agacharse; son dos intenciones independientes y la velocidad horizontal **nunca** depende del eje vertical):

| Fuente | Semántica de los ejes |
|---|---|
| Teclado, cruceta, botones | **Digital, independiente por eje**: exactamente −1 / 0 / 1; dos teclas dan `(±1, ±1)`; sin normalizar |
| Stick del gamepad | **`radial`**: un único vector físico, recortado al disco unidad por la fuente; zona muerta radial 0.22 reescalada |
| Arrastre táctil | **`independent`**: cada eje significa otra cosa (correr / agacharse), se recorta por separado; `(1, −0.7)` se queda como está |
| Varias fuentes a la vez | Por eje gana la mayor magnitud (empate: la tecla) |

Implementación: `InputManager.registerSource(source, device, 'radial' | 'independent')` (por defecto `radial`, que conserva el comportamiento de cualquier fuente analógica antigua), y el recorte se aplica **por fuente** al muestrear. Un vector táctil radial habría desplazado el umbral de agacharse (a −0.7 con `x = 1` quedaría `(0.82, −0.57)` y no agacharía): por eso el táctil es `independent` (así lo exige GAME-SPEC-2D §4.3.2, «los ejes X e Y son independientes»).

**Consecuencias.** Se retira `Driver.keyboardLike` (el apaño temporal del Prompt 4) y la línea que lo activaba en `tests/unit/tools/replay.test.ts` y en el E2E `room`: la grabación de Node y el teclado real del navegador ya producen los mismos ejes y el *replay* sigue coincidiendo con el resumen de la simulación cada 50 ticks. **Ningún test antiguo cambió de aserción**; la única edición es el *ejemplo* de tecla sin enlazar de `keyboardSource.test.ts` (`KeyQ` → `KeyV`), porque `Q` es ahora «botella» según GAME-SPEC-2D §4.2.

### 2. Acciones nuevas

`InputFrame` gana `bottlePressed` + `bottleSlot` (−1 = «la siguiente lista»), `interactPressed` y `dropPressed`, todos latcheados (un toque más corto que un tick no se pierde; `GameSession` los conserva también a través del *hit-stop*). Datos en `input/bindings.ts` (GAME-SPEC-2D §4.2): botella `L · Q` / `LB`, interacción `E` / `LT`; *soltarse de una plataforma one-way* no tiene tecla propia (`abajo + salto`, como ya era) y en táctil es un *flick*. `PlayerController`: `dropPressed` (buffer 0.08 s, dato en `MovementTuning.dropBuffer`) atraviesa una plataforma one-way; en cualquier otro suelo se ignora.

### 3. Táctil

- **`input/gestures/`** (TypeScript puro, sin DOM ni reloj): `TouchConfig` con **todos** los números de §4.3 como dato (Rx 56 · Ry 44 dp, zona muerta 0.12, salto 0.55/0.30/0.25, *flick* 28 dp/100 ms, zona 46 %, `edgeMargin` 28) y `uiScale`; `TouchGestureRecognizer`: origen flotante que sigue al dedo (invertir la dirección cuesta 2·Rx), eje X con zona muerta reescalada, eje Y independiente (agacharse), salto por arrastre/*flick* hacia arriba con histéresis y rearmado, *flick* hacia abajo = soltarse (una sola vez por barrido), un segundo dedo en la zona se ignora.
- **`input/sources/TouchSource`**: **un único dueño por dedo** (zona, Ataque, Dash, Habilidad, icono de interacción, chip y iconos de botella); un dedo no cambia de dueño; un segundo dedo en un botón o en la zona ocupados se ignora; cancelar / soltar / `blur` / ocultar / girar / redimensionar libera lo que ese dedo sostenía. Es el `PointerRouter` de ARCHITECTURE-2D §6.4 **fusionado con la fuente** (el DOM solo traduce eventos; así todas las reglas se prueban en Node).
- **`ui/touch/layout.ts`** (función pura): posiciones de los botones colgadas de la esquina inferior derecha **segura** (`env(safe-area-inset-*)`), `uiScale`, tamaño elegido por el jugador; la zona cede ante un control si la ventana es extrema. Probado en 4:3, 16:9, 19.5:9, 20:9, 21:9 y 1080p, con y sin *notch* / isla dinámica / indicador de inicio / esquinas redondeadas, a ×0.8, ×1 y ×1.4: **ningún solape** entre áreas táctiles, huecos visibles ≥ 28 dp, nada fuera de la zona segura.
- **`ui/touch/TouchControls` (DOM)**: capa `#touch` con la zona **invisible** (sin fondo, sin hijos) y los botones **Ataque** y **Dash**; **Habilidad** y el **chip de botella** existen pero están ocultos (la Habilidad solo se dibuja con una carta equipada; el chip solo cuando una botella sirve). **No hay joystick ni botón de salto**. Glifos abstractos en SVG (`createElementNS`, sin texto) con la paleta cerrada; nombres accesibles por `t('touch.*')`. Cada elemento captura su puntero (`setPointerCapture`); el contenedor lleva `data-ui-block` para que un toque nunca sea también un «ataque» de ratón.
- **Visibilidad:** la capa se muestra con `(any-pointer: coarse)`, con `?touch=1` o con el primer toque; en un PC con ratón y teclado no aparece. **Zonas seguras:** `ui/safeArea` lee `env(safe-area-inset-*)` con una sonda; `?safe=top,right,bottom,left` los imita en pruebas por el mismo camino de código.

### 4. Gamepad

`input/sources/GamepadSource`: stick izquierdo con **zona muerta radial 0.22** reescalada (`(|v|−dz)/(1−dz)`, dirección conservada, y invertida para que arriba sea positivo), botones mapeados por **datos** a las acciones lógicas (A salto · X ataque · B/RB dash · Y habilidad · LB botella · LT interacción · Start pausa · cruceta = cuatro direcciones digitales), gatillos analógicos > 0.5, **se queda con el primer mando conectado**, al desconectarse **libera todo** (el héroe no sigue corriendo), alta en caliente. Se lee por *polling* una vez por tick (`InputManager.addPoller`). El proveedor de mandos es inyectable: los tests y el E2E usan un **mando abstracto** (`input/sources/VirtualPad`), sin dispositivo físico.

### 5. Hallazgos del propio trabajo (todos resueltos)

| Hallazgo | Dónde apareció | Solución |
|---|---|---|
| `-0` en el eje vertical con el dedo quieto | test del reconocedor | `ay = (oy − y) / ry` (da `+0`) |
| Un dedo apoyado sin moverse no cambiaba el dispositivo a «táctil» | E2E | `InputManager.noteUse(source)` al aceptar un `down` |
| La zona táctil solapaba un control con ventana pequeña + isla + controles ×1.4 | test de layout | la zona cede ante el control más a la izquierda |
| El E2E táctil no podía medir un *flick*: con render por software los `pointermove` llegan a >100 ms | sondeo de tiempos | el driver CDP da a cada evento un `timestamp` de un **reloj virtual** (el reconocedor mide con `event.timeStamp`) |
| Levantar el 2.º dedo detenía el héroe | sondeo del E2E | en CDP `touchEnd` nombra el dedo que **se suelta**, no los que quedan (error del driver, no del juego) |

### 6. Pruebas

| | Antes | Después |
|---|---|---|
| Tests (Vitest) | 617 / 42 archivos | **791 / 53 archivos** (+174) |
| E2E | 12 escenarios | **14** (`touch`: toques CDP reales, multitáctil; `gamepad`: mando abstracto) |

Nuevos: contrato de ejes (19) · teclado (4) · soltarse (9) · reconocedor (30) · fuente táctil (21) · táctil → simulación (20) · gamepad (26) + gamepad → simulación (9) · layout (14) · `TouchControls` en `happy-dom` (20) · claves de i18n referenciadas en datos (2). E2E `touch` (14 comprobaciones agrupadas): qué hay (y qué **no**) en pantalla, zona invisible, correr / caminar / zona muerta / origen flotante / invertir, salto completo y salto corto, agacharse con histéresis, soltarse con *flick* (y solo agacharse con un arrastre lento o en suelo sólido), **mover + atacar, mover + dash, atacar + dash, segundo dedo en la zona ignorado, un dedo que nunca cambia de dueño**, toque cancelado, rotación, capa oculta en escritorio, *notch* (47 px a la derecha desplazan Ataque 47 px; 21 px de indicador, 21 px).

### 7. Bundle tras S13

Arranque en frío de R1: **184.7 KB gz** (179.6 → 184.7, +5.1 KB: contrato, reconocedor, fuentes, capa DOM, iconos, claves). Margen restante frente a 200 KB: **15.3 KB**.

### 8. Pendiente / decisiones diferidas

- **Ajustes de entrada** (tamaño y opacidad de los controles, zona muerta del gamepad, remapeo): el *modelo de datos* ya está (`bindings`, `TouchControlsOptions`, `deadZone`), la **persistencia** y la pantalla de ajustes llegan en S18 junto al idioma.
- `driftRelax` (relajación del origen vertical para el riesgo R18, «apagada por defecto» en la especificación) **no se implementa**: sin dispositivo real no hay forma de calibrarla; los umbrales ya son dato.
- Visor de gestos táctiles del panel de depuración (ARCHITECTURE-2D §15): `TouchSource.gesture` ya expone origen, ejes y armado; el visor queda para el Prompt 6/7.
- Rendimiento y ergonomía en iPhone / Android **reales: sin verificar** (no hay dispositivo en este entorno).


---

## S14 — HUD (DOM) y los recursos que muestra ✅ (`S14a` recursos · `S14b` HUD)

> **Desviación de orden (documentada):** el HUD tiene que mostrar magia, botellas y carta, así que en S14 se construyeron también las **clases puras de esos recursos** (su estado y sus reglas). Lo que queda para S15 y S16 son las **acciones** que los usan (lanzar el Spirit Bolt, beber una botella, equipar una carta recogida, la Habilidad). Así el HUD nunca muestra datos de mentira ni hay código provisional que tirar.

### 1. Recursos como estado puro (`S14a`)

| Clase (`src/abilities/`) | Reglas |
|---|---|
| `Magic` | 0 … 100; gasto **exacto** (un coste de 30 quita 30 y nada más; por debajo del coste se rechaza sin tocar nada); regeneración **gradual** de 6/s tras **1.0 s** sin gastar; no regenera mientras se lanza (`tick(blocked)`); aritmética en **milésimas enteras** con acarreo: 60 ticks de regeneración dan 6.000 exactos, también con tasas que no dividen entre 60 (7/s → 7.000); eventos al gastar, ~1 por unidad regenerada (6/s, no 60/s) y al llenarse |
| `BottleSet` | 3 ranuras (máx. 4); estados `ready · empty · recharging`; recarga **secuencial de 60 s (3600 ticks), una a la vez, la primera vacía de izquierda a derecha**; una botella que espera su turno está «vacía»; `resolve(−1 \| n)` (la siguiente lista / ese icono del HUD); `addSlot` (la cuarta, recompensa) y `refillAll` (punto de guardado del Prompt 6) |
| `CardLoadout` | una carta equipada **o ninguna**; la primera adquirida se equipa sola; `serialize/restore`; sin inventario ni selector |

Datos en `content/resources.ts` (nada de números en las clases) y claves de i18n. **El héroe empieza sin carta** (no hay habilidad inicial inventada).

`GameSession` crea los recursos, los avanza en el paso 6 del tick (`magic.tick`, `bottles.tick`: **congelados por el hit-stop** igual que el resto del mundo), emite `magic:changed`, `bottle:changed` (con el estado de todas las ranuras) y `card:changed`, y al volver de una derrota rellena **vida y magia pero NO las botellas** (GAME-SPEC-2D §9.2: «su recarga es lenta a propósito»). `SimServices` expone `magic / bottles / loadout` para las habilidades de S15–S16.

**`GameSession.status(out)`** rellena un `PlayerStatus` reutilizable (vida, magia, estado de la carta, ranuras de botellas con su relleno, `bottleUseful`): es **la única puerta** por la que la interfaz lee al jugador — el HUD no importa el jugador, los recursos ni ninguna entidad.

### 2. HUD (`S14b`)

Arquitectura: **simulación → `status()` → `HudModel` (puro) → `HudView` (DOM)**; Pixi no sabe que existe.

- **`ui/hud/layout.ts`** (puro): esquina **superior izquierda** + zona segura + 16 dp, a la `uiScale` de la ventana por la preferencia de tamaño; los números de GAME-SPEC-2D §17 (tarjeta 52 × 68, segmentos 22 × 10 con hueco 3, barra 140 × 8, viales 22 × 30). **Zona táctil de los viales: 44 de alto × 36 de ancho** (su paso), en vez de 44 × 44: con el hueco de la especificación (6 dp) los 44 de ancho se solaparían entre vecinos y un dedo tiene que significar **una** botella.
- **`ui/hud/HudModel.ts`** (puro): `PlayerStatus` + `dt` real → `HudState`. Lleva los transitorios de interfaz **en tiempo real** (pasan por un *hit-stop*): el **fantasma** del segmento perdido (0.4 s) y su destello (0.15 s), la **sacudida** de barra y carta al denegar un lanzamiento (0.28 s, amortiguada), el **«pop»** del vial al beber (0.25 s), el pulso del último punto de vida.
- **`ui/hud/HudView.ts`** (DOM): tarjeta (vacía con borde discontinuo si no hay carta; icono; apagada sin magia; barrido radial en enfriamiento), **5 segmentos** de vida (uno por punto: crece con la vida máxima), **barra de magia continua** (`scaleX`, brillo que avanza mientras regenera), **3–4 viales** (lista · vacía · recargando con relleno progresivo). Escribe en el DOM **solo si algo cambió** (probado con `MutationObserver`: 20 fotogramas idénticos = 0 mutaciones). **Sin texto propio**: solo nombres accesibles (`role`, `aria-valuenow`, `aria-label` por `t('hud.*')`), que siguen al idioma. CSS generado desde los tokens de `palette.ts`; `prefers-reduced-motion` apaga sus animaciones.
- **Cableado (`Game2D`)**: un `HudView` y un `HudModel`; cada fotograma `session.status()` → modelo → vista, y el mismo estado gobierna los controles táctiles **contextuales**: el **botón de Habilidad aparece solo con una carta equipada** (con su icono, atenuado sin magia) y el **chip de botella solo cuando hay una botella lista y la vida no está al máximo**. Un dedo sobre un vial entra por el mismo `TouchSource` de dueño único (`bottle:<ranura>`) y queda **por encima de la zona de movimiento**. El título de derrota pasa a `z-index 40`: cubre HUD y controles.

### 3. Pruebas

| | Antes | Después |
|---|---|---|
| Tests | 791 / 53 archivos | **904 / 60 archivos** (+113) |
| E2E | 14 | **15** (`hud`) |

Nuevos: magia (17) · botellas (18) · cartas (9) · recursos en la sesión (18) · `HudModel` (22) · layout (9) · `HudView` en `happy-dom` (20). E2E `hud`: qué hay en pantalla (5 segmentos, barra llena, **carta vacía**, 3 viales; todo en `#ui`, **un solo canvas**, **cero texto**); posición y tamaño reales (tarjeta 52 × 68 dp a la escala de la ventana, vial con zona táctil real y **por encima** de la zona de movimiento); un punto de vida perdido = un segmento vacío + fantasma que se desvanece en < 0.7 s; vida crítica; barra de magia al 50 % y regeneración visible (brillo tras 1 s, ≈ +6 en el segundo siguiente); botellas: **solo una recarga a la vez** y la siguiente empieza al terminar la primera (3600 ticks reales); cuarta botella; carta → icono y botón de Habilidad (y se va al quitarla); chip contextual; un dedo en un vial **no** inicia el gesto de movimiento; **5 relaciones de aspecto** (4:3, 16:9, 19.5:9, 21:9 y un móvil pequeño): HUD entero en pantalla, arriba a la izquierda, a 16 dp escalados del borde y sin tocar los controles; **notch** (47 px izquierda, 44 px arriba); ES ↔ EN.

### 4. Bundle tras S14

Arranque en frío de R1: **190.3 KB gz** (184.7 → 190.3, +5.6 KB: recursos, estado, modelo + vista + CSS del HUD, claves). Margen frente a 200 KB: **9.7 KB**, con S15–S18 por venir: si se agota, las opciones ya medidas siguen siendo cargar bajo demanda el panel de depuración (≈ 3–4 KB gz) y la pantalla de ajustes (nueva), sin recortar funcionalidad.


---

## S15 — Magia y Spirit Bolt ✅

La magia (0–100, 6/s tras 1.0 s, gasto exacto) ya existía como recurso (S14a). S15 le da **su primer uso**: la habilidad activa **Spirit Bolt**, el estado de lanzamiento del jugador, su proyectil y su aspecto. Solo existe **esta** habilidad (no hay arsenal).

### 1. La habilidad como dato y su memoria

- **`abilities/SkillDefinition`** (`content/skills.ts`): coste **30** (tres lanzamientos seguidos desde la barra llena, 90 ≤ 100 < 120), enfriamiento **0.3 s** tras el lanzamiento, **6 ticks** de preparación y **8** de recuperación con **40 %** de control, proyectil a **16 m/s**, alcance **12 m**, daño **2**, sin perforar, empuje **(6, 2)**, *hit-stop* **3**. Todo de GAME-SPEC-2D §10.1, nada en el código.
- **`abilities/SkillRuntime`** (puro): enfriamientos en ticks (los congela el *hit-stop*) y **la** pregunta «¿se puede lanzar ahora?» (`ok · noSkill · cooldown · noMagic`) que comparten el jugador, la carta del HUD (se apaga sin magia, barre el enfriamiento) y el botón de Habilidad.
- **Carta → habilidad:** `CardDefinition.skillId` (la carta equipada decide qué ejecuta Habilidad, **nunca un id fijo**) y `grantsAbility`: al **adquirir** la carta, `AbilitySystem` concede `magic_attack` (la progresión sigue siendo de `AbilitySystem`; la carta es la forma de equiparla). **R25 corregido:** `magic_attack` estaba marcado `implemented: true` sin comportamiento; ahora es verdad.

### 2. El lanzamiento (estado `cast` del jugador)

`PlayerController` gana el estado `cast` (prioridad: muerto > herido > dash > ataque > **lanzar** > agacharse > libre; `free`, `crouch` y `dash` no cambian: los 40 tests de movimiento lo prueban). Reglas:

- **Sin carta equipada, Ability no es una acción**: no hay estado, ni coste, ni evento de rechazo, ni botón (no se dibuja). Con carta y magia < 30: **rechazo** (`skill:denied`, una vez por pulsación, no una por tick del buffer) y la barra y la carta se **sacuden**; un enfriamiento **no** rechaza: la pulsación espera (buffer de 0.12 s).
- **El coste se paga en la LIBERACIÓN**, no al pulsar: un golpe durante los 6 ticks de preparación cancela el lanzamiento **sin coste ni enfriamiento** (igual que una botella interrumpida no se consume). Un golpe durante la recuperación no «devuelve» el proyectil.
- Preparación 6 ticks → **liberación** (gasta exactamente 30, empieza el enfriamiento, nace el proyectil, `skill:cast`) → recuperación 8 → libre: **14 ticks** en total. El *dash* puede cancelar la **recuperación** (nunca la preparación), como con el ataque. Se puede lanzar en el aire y agachado (el proyectil sale más bajo).
- **La magia no se regenera mientras se lanza** (`magic.tick(casting)`) y el segundo de espera cuenta desde que termina el lanzamiento. Una derrota limpia el enfriamiento.
- Animación: `cast` con fases (preparación · liberación · recuperación). **El *placeholder* no gana ningún fotograma**: su clip `cast` apunta a las poses de espada ya existentes (`attack2`), de modo que reproducirlo no cae en el *fallback* (que escribe un aviso en consola cada vez). El protagonista sigue siendo la cápsula abstracta.

### 3. El proyectil (`gameplay/Projectile`, `SimEntity`)

Vuela recto 16 m/s (`⅓·0.8 m/tick`) contando **ticks enteros** (45 ticks = 12 m, sin acumular decimales), envía su área de golpe al sistema de combate en cada tick y **termina** en lo primero que daña (**no perfora**), en una pared (barrido del área que cubre ese tick: no hay *tunneling*), o al final del alcance; atraviesa las plataformas *one-way* (son suelos, no paredes); golpea también a neutrales (muros rompibles, interruptores) y nunca al héroe. Anuncia cómo acabó (`projectile:ended`: `hit · wall · range`) — **un cambio de sala bajo un proyectil en vuelo lo retira sin anunciar nada**. Si el cañón nace dentro de una pared, el lanzamiento se paga y el proyectil se apaga al instante (es el error del jugador, no un lanzamiento gratis).

### 4. Aspecto (cian con núcleo blanco)

- **VFX como datos** (`content/vfx.ts`, paleta *energy*, sin acento cálido ni violeta): `bolt_muzzle_flash` + `bolt_muzzle_sparks` (al salir), `bolt_impact_burst` + `bolt_impact_flash` + `bolt_impact_ring` (al impactar), `bolt_fizzle` (al apagarse en pared o alcance). Tres disparadores nuevos (`boltCast`, `boltImpact`, `boltEnd`) que el `VfxDirector` levanta de eventos de la simulación; **un impacto del proyectil es `boltImpact` y no `hitLanded`** (sin efectos dobles). El director no sabe de habilidades: recibe el conjunto de ids de proyectil.
- **`render/ProjectileView`**: cabeza cian + núcleo **blanco** + cola de dos estelas, todo aditivo (cuatro *sprites* del atlas de VFX: un único lote con la capa de luz, **sin dibujar nada más**). `EntityViews` enruta las vistas «de luz» (`additive`) a `layers.fxWorld`, no a la capa de actores.
- **HUD:** `skill:denied` → sacudida de barra y carta; la carta muestra `ready · noMagic · cooldown` (barrido radial) desde `SkillRuntime`.

### 5. Pruebas

| | Antes | Después |
|---|---|---|
| Tests | 904 / 60 archivos | **958 / 64 archivos** (+54) |
| E2E | 15 | **16** (`bolt`), desarrollo y producción 16/16 |
| `tsc --noEmit` | 0 errores | 0 errores |

Nuevos: `SkillRuntime` y datos (9) · Spirit Bolt en la simulación (28: sin carta no hace nada; con carta cuesta 30 **exactos en la liberación**; 6 + 8 ticks; tres seguidos y el cuarto rechazado; < 30 rechazado y exactamente 30 sí; sin regeneración mientras se lanza; enfriamiento de 0.3 s con buffer; golpe en preparación = sin coste; 40 % de control; aire y agachado; *dash* cancela la recuperación; derrota; 16 m/s y alcance 12 m; golpea por 2, empuja, *hit-stop* 3 y **no perfora**; neutrales; pared; plataformas *one-way*; cañón dentro de una pared; cambio de sala; carta del HUD; determinismo) · presentación (13: efectos como datos en la paleta del héroe, el director enruta, la vista) · placeholder (3). **Un test antiguo se amplió** (`vfxMath`: la lista fijada de disparadores gana los tres nuevos) y lo mismo el escenario `vfx` del E2E, que además comprueba que **cada** disparador nuevo produce algo, se ve y muere por completo.

E2E `bolt` (teclado real, mando abstracto, toque CDP real): sin carta Ability no hace nada · con carta: preparación 6 ticks sin gastar, liberación = **70 exactos**, barra al 70 %, carta en `cooldown`, **más píxeles de luz cian en pantalla** · 16 m/s medidos (4 m en 15 ticks) y se apaga a los 12 m · 78 ticks después de lanzar la regeneración acaba de empezar y luego **+6.0 por segundo**; ni una décima durante el lanzamiento y el segundo siguiente · tres seguidos dejan 10; el cuarto **sacude barra y carta**, no gasta, y deja la carta apagada · golpea al primero por 2 y **no toca al segundo** · el mismo Ability desde un mando (Y) y con un toque en el botón (que además se atenúa sin magia) · quitar la carta oculta el botón y Ability deja de hacer algo.

### 6. Hallazgos

| Hallazgo | Solución |
|---|---|
| Ni un solo fotograma de `cast` en el *placeholder*: el *fallback* a `attack2` escribía un aviso de consola en cada lanzamiento | clip `cast` explícito que reutiliza las poses de `attack2` (sin fotogramas nuevos; el contrato de 62 fotogramas sigue intacto) |
| Editar fuentes **mientras** corre el E2E de desarrollo reinicia la página (HMR de Vite) y hace fallar un escenario ajeno | regla de trabajo: nada en `src/` mientras corre una suite; el fallo de `death` de esa ejecución se repitió limpio |
| El escenario `vfx` del E2E falló con «boltCast produced nothing»: el laboratorio de VFX solo sabía disparar los ocho disparadores de P4 | el laboratorio emite ahora, por el bus y con los mismos eventos que el juego (`skill:cast`, `combat:hit` de la habilidad, `projectile:ended`), los tres disparadores del proyectil y recibe el conjunto de ids de proyectil como el juego |

### 7. Bundle tras S15

Arranque en frío de R1: **192.8 KB gz** (190.3 → 192.8, +2.5 KB: habilidad, proyectil, estado de lanzamiento, vista y efectos). Margen frente a 200 KB: **7.2 KB** con S16–S18 por venir. Si se agota, las opciones ya medidas (cargar bajo demanda el panel de depuración ≈ 3–4 KB gz y la pantalla de ajustes) siguen disponibles sin recortar funcionalidad.


---

## S16 — Botellas de energía (y la carta como forma de equipar) ✅

Las **cartas** ya estaban completas desde S14a/S15 (una equipada o ninguna; Ability solo funciona con carta; sin inventario ni *deckbuilding*; `card:changed` y la carta del HUD con estados `empty · ready · noMagic · cooldown`). S16 cierra el otro recurso del jugador: **las botellas se beben de verdad**.

### 1. El estado `drink` (`PlayerController`)

GAME-SPEC-2D §11, sin ninguna desviación:

- **Canal de 24 ticks (0.4 s)**, en suelo, **sin moverse** (la velocidad horizontal se frena; el stick, el salto, el ataque y el *dash* no cambian el estado: no hay recuperación que cancelar). Es dato: `BottleRules.channelSeconds` (`content/resources.ts`), `BottleSet.channelLength`.
- **El efecto cae en el ÚLTIMO tick** y **solo entonces se gasta la botella**: `consume(slot)` + `heal(2)`. Un golpe a mitad de canal **no gasta nada** (`bottle:interrupted · hit`); perder el suelo, tampoco (`air`); si la vida se llenó por otra vía durante el canal, tampoco (`full`). Un golpe que llega **en el mismo tick** en que termina el canal cae **después** del efecto (el jugador actúa primero y luego se resuelve el combate: orden definido y probado).
- **Solo si sirve:** con la vida completa o sin botella lista, la petición se **deniega una vez** (`bottle:denied · full | none`) sin gastar ni parar al héroe. Una petición hecha en el aire espera al aterrizaje dentro del *buffer* (0.12 s, el mismo que Ability) y, si no llega, caduca en silencio.
- **Qué botella:** la tecla y el chip táctil piden «la siguiente lista» (−1, la primera desde la izquierda); un icono del HUD pide **esa** (0…n) y se deniega si no está lista aunque haya otras.
- **Prioridad:** `dash` > ataque > Habilidad > botella > agacharse > libre. Desde `crouch` se puede beber y se vuelve a `crouch`.
- Eventos de simulación: `bottle:drinkStarted`, `bottle:drunk` (`healed`), `bottle:interrupted`, `bottle:denied`. Lo que el HUD, el VFX y el audio futuro necesitan sale de ahí; la simulación no sabe quién escucha.
- **La magia es independiente**: beber no la paga ni la detiene (la regeneración sigue durante el canal); la recarga de botellas sigue siendo secuencial, de una en una, 60 s cada una, y una derrota **no** las rellena.

### 2. Lo que se ve

- **HUD** (`HudModel`/`HudView`, sin tocar la simulación): el vial que se bebe **se vacía durante el canal** (`PlayerStatus.drink = { slot, progress01 }`, la única puerta) y brilla en blanco; al gastarse hace *pop* y pasa a recargándose. Una petición denegada **sacude la fila de botellas** (0.28 s, como la barra de magia ante una Habilidad denegada).
- **VFX como datos** (energía cian/blanca; sin violeta ni acento cálido): `drinkStart` = un anillo de luz que **se cierra** sobre el héroe durante el canal, `drinkHeal` = destello blanco + motas que suben. El director los levanta de `bottle:drinkStarted` y `bottle:drunk`; interrumpido o denegado no hay efecto de curación.
- **Placeholder:** el clip `drink` reutiliza las poses de `idle` en bucle (**ningún fotograma nuevo**, siguen siendo 62). El protagonista sigue siendo la cápsula abstracta.

### 3. Pruebas

| | Antes | Después |
|---|---|---|
| Tests | 958 / 64 archivos | **997 / 66 archivos** (+39) |
| E2E | 16 | **17** (`bottles`), desarrollo y producción 17/17 |
| `tsc --noEmit` | 0 errores | 0 errores |

Nuevos: `tests/integration/bottles.test.ts` (28: canal de 24 ticks y efecto en el último; +2 sin pasar del máximo; quieto; agachado; el *dash* no cancela; golpe a mitad no gasta; golpe en el tick final cae después; letal; perder el suelo; vida llena durante el canal; cambio de sala; denegación `full`/`none` una sola vez; petición diferida tras un ataque; icono de un vial vacío; qué botella se bebe; cuarta botella; espera al aterrizaje; recarga secuencial de 3600 ticks; magia independiente; derrota sin rellenar; estado del HUD; determinismo) · `bottleSet` (+1: canal como dato) · `drinkVfx` (6) · `hudModel` (+2) · `hudView` (+1) · `placeholderStates` (+1).

E2E `bottles` (teclado real L/Q, mando abstracto LB y toques reales): tres viales listos · un trago con la vida llena se deniega y **sacude la fila** · el canal: a medias el vial está a la mitad y la vida sigue en 3, **en el tick 24 la vida pasa a 5** y la botella pasa a recargándose, el héroe no se movió · un golpe a mitad de canal no gasta nada (vida 3 → 2) · el mando bebe la siguiente lista y **la segunda queda vacía esperando su turno** · la primera vuelve a los 60 s y **solo entonces** empieza la segunda · táctil: el chip aparece solo con vida que curar, tocarlo bebe; un icono del HUD bebe **ese** vial; un vial gastado denegado sacude la fila; la cuarta botella es una carga más.

### 4. Hallazgos

| Hallazgo | Solución |
|---|---|
| El E2E de la sacudida fallaba aunque el HUD funcionaba (comprobado con un observador en la página): con *render* por software **el primer fotograma tras un cambio puede tardar ~0.8 s** y el HUD reproduce sus transitorios cortos en tiempo real, así que un evento que cae dentro de ese fotograma largo ya ha terminado al siguiente | el escenario espera a que la página dibuje de verdad (`frames(page)`: 8 fotogramas seguidos) antes del evento y registra con un `MutationObserver` **cualquier** fotograma en que la fila se movió, en lugar de sondear. No se tocó el HUD ni se recortó su comportamiento. **Regla para los E2E que quedan:** esperar fotogramas antes de transitorios de tiempo real |
| Tick aritmético de mis propias pruebas: el canal «de 24 ticks» son 24 `update` **tras** el tick de la pulsación (el efecto cae 24 ticks después de pulsar) | los tests lo fijan así (23 → vida sin cambio, 24 → +2) |

### 5. Bundle tras S16

Arranque en frío de R1: **193.6 KB gz** (192.8 → 193.6, +0.8 KB). Margen frente a 200 KB: **6.4 KB** con S17 (interacción) y S18 (idioma + ajustes) por venir; la pantalla de ajustes irá cargada bajo demanda.


---

## S17 — Interacción contextual ✅

**Sin botón permanente de interacción.** Un objeto al alcance recibe un **icono** que flota sobre él; en teclado y mando se acciona con `interact` (E / LT), en táctil **el propio icono es el botón**. Si no hay nada que hacer, el icono no existe (ni recoge un dedo) y pulsar Interact no hace nada.

### 1. El sistema (`interaction/`, puro)

- **Datos** (`Interactable.ts`): `InteractableDef { id, kind (open · talk · pickup · activate · enter · use), verbKey, x, y, iconHeight?, reach?, priority?, whenSet?, whenClear?, lock?, actions[] }`. Las acciones son un conjunto **cerrado** (`acquireCard · addBottleSlot · setFlag · clearFlag`): una recompensa escribe **flags del mundo** (GAME-SPEC-2D §14.3), que es lo que hace que sobreviva a una muerte y a recargar la sala. El texto nunca vive aquí: `verbKey` es una clave del catálogo.
- **Elección** (`InteractionSystem.ts`): entre los **disponibles** (sus flags lo permiten) y **al alcance** (1.6 m de ancho, 1.2 m de alto, bordes incluidos) gana el **más cercano**; empate → mayor `priority`, luego el primero de la sala. **Histéresis de 0.3 m**: el objeto con el icono lo conserva hasta que el jugador está 0.3 m más lejos de su alcance, o hasta que otro está **claramente** más cerca (> 0.3 m); la histéresis conserva, nunca concede.
- **Eventos:** `interaction:available` (con el punto de anclaje del icono y la clave del verbo) · `interaction:lost` (también al dejar de estar disponible, al morir o al cambiar de sala) · `interaction:performed`. Posición en el tick: **4** (tras el combate, antes de los recursos), como fija ARCHITECTURE-2D §5.1. La única puerta hacia la interfaz es `PlayerStatus.interaction`.

### 2. El jugador (`interact`)

Estado nuevo con **prioridad** `dash > ataque > Habilidad > botella > interactuar > agacharse > libre`. Se acepta con un objeto al alcance **y en suelo** (en el aire la pulsación espera al aterrizaje dentro del *buffer* de 0.12 s; sin objeto, caduca **sin ningún aviso**: el icono es la única señal). Al entrar **ejecuta** las acciones, mira hacia el objeto y **retiene el control `lock` ticks (por defecto y como máximo 12)**; un golpe lo corta (lo hecho, hecho). Se puede hacer **agachado** (la carta del túnel de R1 está bajo un techo de 1.2 m) y se vuelve a `crouch`. Clip `interact` del *placeholder* = poses de `idle` en bucle: **ningún fotograma nuevo** (siguen 62).

### 3. Datos de sala y contenido

- `RoomDefinition.interactables`; `validateRoom` comprueba ids únicos, que estén dentro y **sobre un suelo**, verbo no vacío, alcance positivo, `lock` entero 0…12, banderas no vacías, que la carta/botella que dan **existan** y que una palanca pueda abrir una puerta de su sala (la bandera que pone cuenta como algo que la pone).
- **`interaction_test`** (`?room=interaction_test`): un cajón de arena con cada caso simple de §12: una **carta** (recoger), una **ranura de botella** a 2 m (el más cercano gana), una **palanca** que abre una puerta de la sala y una **puerta que se abre al interactuar con ella** (tipo `open`).
- **R1 — carta del Spirit Bolt, PROVISIONAL (⚠ desviación documentada, no conflicto):** la carta espera al final del túnel agachado (x = 74.5). GAME-SPEC-2D §14.4 la sitúa en **R3**, pero ese diseño es «inicial, ajustable en el Prompt 6»; ponerla en R1 permite que la primera sala ya muestre el bucle completo (interactuar → equipar → lanzar) que el Prompt 5 debe demostrar. Es **opcional** (nada del camino a la salida la necesita), una vez cogida no vuelve a aparecer (ni tras una muerte) y la puerta de R1 **sigue abriéndose solo con la derrota del slime** (`r1.test.ts` lo prueba). El Prompt 6 la mueve a R3.

### 4. Lo que se ve

- **`ui/prompt/InteractionPrompt`** (DOM, sin texto propio): un disco de 48 px (objetivo táctil de 60) con el icono del tipo (carta · palanca · genérico), anclado a la **parte superior del objeto** y colocado **encima** con 10 px de hueco, así el objeto nunca queda tapado sea cual sea el *zoom*; se atenúa en 120 ms; se mantiene dentro de la zona segura; en teclado/mando lleva el **nombre de la tecla/botón** (`input/glyphs.ts`, **derivado de los *bindings***: remapear cambia el icono) y en táctil nada; su nombre accesible es el verbo por el traductor (ES/EN). Escribe en el DOM solo lo que cambió, suelta el dedo si el icono desaparece bajo él y escala con los controles (el objetivo también). `z-index` 26: sobre el HUD (25), bajo las superposiciones (40).
- **`presentation/worldToScreen`** (pura, probada **contra el `Container` de Pixi**, incluido el balanceo) + `Renderer2D.worldToScreen`: el icono sigue al objeto con la transformación de **este** fotograma. `ui/` sigue sin conocer ni Pixi ni `render/`.
- **`render/InteractableViews`**: marcas abstractas en el cian/blanco del héroe — una carta flotante de luz que se desvanece al cogerla; un poste con pomo que se apaga cuando se gasta.
- **Dispositivo inicial:** una pantalla que arranca con los controles táctiles visibles **es** un dispositivo táctil (`noteUse('touch')`); sin esto el icono mostraba la tecla E hasta el primer toque.

### 5. Pruebas

| | Antes | Después |
|---|---|---|
| Tests | 997 / 66 archivos | **1082 / 71 archivos** (+85) |
| E2E | 17 | **19** (`interaction`, `devtools`), desarrollo y producción 19/19 |
| `tsc --noEmit` | 0 errores | 0 errores |

Nuevos: `InteractionSystem` (23: alcance y bordes, nearest, prioridad, histéresis, flags, muerte, acciones en orden, una sola vez, sala, lock, determinismo) · `interaction` integración (21: el icono solo al alcance y su anuncio; el estado lo trae; sin objeto no pasa nada; recoger = carta + habilidad + flag + `performed` antes que `lost`; 12 ticks sin control; mira al objeto; una sola vez; Ability al terminar; sobrevive a una muerte; golpe; agachado; en el aire; pulsación anticipada; el más cercano; palanca → puerta → atravesarla; R1 en el túnel; determinismo) · `validateRoom` (+7) · `InteractionPrompt` (14) · `InteractableViews` (7) · `worldToScreen` (+3, contra Pixi) · `glyphs` (4) · `touchControls` integración (+5: el icono con toque, sin objeto, mover + interactuar, el chip y un icono del HUD, un segundo dedo) · `placeholderStates` (+0, ampliado a `interact`).

E2E `interaction` (teclado real, toque real): sin nada al alcance **no hay icono, no recoge dedos y no hay ningún control táctil de interacción**; Interact sin objeto no hace nada · al llegar a 1.6 m aparece sobre la carta (a la posición proyectada **± 2 px**), con el verbo en el idioma del jugador y la tecla **E** · el más cercano gana (la ranura a 14 m vence a la carta a 12 m) · la tecla coge la carta, **12 ticks sin control**, el HUD la muestra y el icono desaparece · una palanca abre **la puerta de su sala** (se disuelve y se atraviesa; antes paraba) · una **puerta tipo `open`** se abre al interactuar con ella y se atraviesa · táctil: el icono lleva **sin tecla**, es un objetivo de ≥ 44 px y **un toque lo acciona** · R1: bajo el techo de 1.2 m el icono sale, se coge la carta, el héroe sigue agachado, **la puerta de R1 sigue cerrada** y la Habilidad se lanza. E2E `devtools`: una carga normal **ni pide** el código de las herramientas; `?debug=1` lo trae y el panel lista sus acciones y las ejecuta.

### 6. Hallazgos

| Hallazgo | Solución |
|---|---|
| El icono tapaba el objeto: anclado 1.4 m sobre los pies, un disco de 48 px (≈ 1.7 m a 29 px/m) cubría la carta entera | el punto de anclaje es la **parte superior del objeto** y el disco se sitúa encima con un hueco **en píxeles** (independiente del *zoom*) |
| El icono mostraba **E** en un móvil hasta el primer toque (el dispositivo inicial era «teclado») | una pantalla con controles táctiles visibles arranca como táctil |
| `Interact` hecho **2 ticks antes de llegar** se perdía | entra en el mismo *buffer* de 0.12 s que Habilidad y botella |
| **Rolldown parte en trozos pequeños lo que comparten dos *chunks* perezosos** (al sacar el panel de depuración a un módulo propio aparecieron 5 *chunks* compartidos nuevos: `dom`, `actorViewState`, `worldTransform`, `math`, `log`) | medido: el ahorro neto es menor que el tamaño del módulo (−0.8 KB gz en vez de −3.7). Se probó agrupar `src/**` en un *chunk* común con `codeSplitting.groups` (`minShareCount: 2`): **empeoró** (230 KB: arrastró módulos de Pixi) → descartado y revertido. Consecuencia para S18: la pantalla de ajustes reutilizará esos *chunks* compartidos ya creados |

### 7. Bundle tras S17 (y el panel de depuración bajo demanda)

Sumar interacción (sistema, estado, icono, marcas, glifos, contenido, claves) llevó el arranque en frío de R1 a **197.0 KB gz** (+3.4 KB sobre S16). Con solo **3.0 KB** de margen y S18 por venir, se aplicó la opción ya medida desde S12: **el panel de depuración, la rejilla de colisiones y las acciones de depuración pasan a un módulo propio (`app/devTools.ts`) que solo se descarga con `?debug=1` (o la tecla ` en desarrollo)**. Resultado: **196.3 KB gz** (28 *scripts*; −0.7 KB neto por el reparto en *chunks* de arriba), margen **3.7 KB**. Un jugador no descarga herramientas de desarrollo; su comportamiento no cambia (`devtools` E2E lo prueba).


---

## S18 — Idioma persistente y ajustes ✅ (`S18a` guardado puro · `S18b` cableado · `S18c` menú de pausa)

El idioma que elige el jugador **sobrevive** a un cambio de escena, a recargar y a abrir el navegador de nuevo; `?lang=` sigue siendo un atajo de **una sola visita** que no pisa lo guardado. Con él llega el único menú del Prompt 5: pausa + idioma + tamaño y opacidad de los controles táctiles (GAME-SPEC-2D §17 «menú de pausa mínimo»).

### 1. `save/` (puro; el almacenamiento se inyecta)

- **`StorageAdapter`** (`get/set/remove`, asíncrono como exige ARCHITECTURE-2D §11) y **`MemoryStorage`**. `app/storage.ts` aporta **`LocalStorageAdapter`**: cada acceso va protegido (la propia propiedad `localStorage` lanza con los datos del sitio bloqueados): una lectura imposible es «nada guardado», una escritura imposible lanza para que el *store* lo cuente **una vez** y el juego siga con lo que tiene en memoria. Sin almacenamiento alguno cae en memoria.
- **`SettingsData` v1** = `{ version, language: string | null, touch: { scale, opacity } }`. ⚠ **Desviación menor documentada:** ARCHITECTURE-2D §11 dibuja una v1 con volumen, *bindings*, calidad y accesibilidad; hoy **no existe nada de eso**, así que la v1 guardada lleva solo lo que existe y el resto se añade **por migración** el día que exista (cadena `SETTINGS_MIGRATIONS` ya montada, con un archivo dorado de la v1 en `tests/unit/save/golden/`). `language: null` = «no ha elegido nada: sigue al dispositivo». **`repairSettings`** arregla cualquier valor dañado campo a campo (tipos, rangos 80–140 % de tamaño y 30–100 % de opacidad, códigos de idioma, claves desconocidas fuera) y se aplica **tanto a lo leído como a lo que se va a escribir**: un valor malo no entra ni sale.
- **`SettingsStore`** (nunca lanza): **carga** `clave` → si no se puede leer **se conserva** como `clave.corrupt` y se prueba `clave.bak` (y se vuelve a poner en su sitio) → si tampoco, los valores por defecto; un valor de una **versión posterior** (de un juego más nuevo) se trata igual: se aparta, no se pisa en silencio. **Escribe** `clave.bak` ← anterior · `clave` ← nuevo · se **lee de vuelta** y se compara · solo entonces se borra el `.bak`: lo que se interrumpa a medias deja una copia buena. Las escrituras están **serializadas** (dos cambios seguidos llegan en orden, gana el último) y `update()` aplica el cambio **al instante** (la interfaz no espera al disco) y devuelve si llegó al almacenamiento.
- **`i18n/chooseLocale`**: `?lang=` > lo elegido y guardado > los idiomas del dispositivo > inglés; un idioma sin catálogo se **salta**, nunca es un error.

### 2. El juego

`Game2D.create` carga los ajustes **antes** de construir nada (el primer fotograma ya sale bien), elige el idioma con `chooseLocale`, pone `document.documentElement.lang` (y lo sigue en caliente) y arranca los controles táctiles con el tamaño y la opacidad guardados. Elegir un idioma o mover un deslizador **se aplica al instante y se guarda**; `?lang=` no se guarda nunca.

### 3. El menú (la entrada es un icono; el menú, un *chunk* aparte)

- **`ui/settings/PauseButton`** — un solo icono pequeño **arriba al centro** (no a la derecha, donde viven Ataque, Dash y Habilidad; no es un control de juego), dentro de la zona segura, objetivo de ≥ 44 px, **nunca toma el foco del teclado** (un Espacio que salta no debe «pulsarlo») y un clic en él nunca es un ataque. Es la única adición visible nueva de la interfaz táctil y **se documenta como decisión**: la lista cerrada «solo Ataque, Dash y Habilidad a la derecha» sigue intacta, y sin una entrada así el idioma sería inalcanzable en un móvil.
- **`ui/settings/SettingsMenu`** (cargado **bajo demanda**: una carga normal ni lo pide) — título, idioma (cada uno **en su propio nombre**, `Intl.DisplayNames`: los nombres de idioma no se traducen, así que no son literales ni claves), y —solo si hay capa táctil— tamaño y opacidad; **Continuar**. Sin texto propio (7 claves `settings.*`), sin estado propio (el *host* guarda los ajustes y el menú los relee cada vez que se abre), modal (recoge todo el puntero), foco en *Continuar* al abrir.
- **Pausa real:** abrir el menú **pausa la simulación** (también ante un *hook* de test que pida *ticks*), suelta todos los dedos y teclas, y la tecla de pausa (Esc / P / Start) lo abre y lo cierra: con el juego parado ningún *tick* muestrea la entrada, así que el menú vigila él mismo la pulsación por fotograma.
- **Teclas dentro de la interfaz propia:** una tecla escrita en un elemento `data-ui-block` (el menú, el panel de depuración) **ya no es entrada de juego**, salvo la de pausa (que lo cierra): antes las flechas movían al héroe en vez del deslizador.

### 4. Pruebas

| | Antes | Después |
|---|---|---|
| Tests | 1082 / 71 archivos | **1144 / 76 archivos** (+62) |
| E2E | 19 | **20** (`language`), desarrollo y producción 20/20 |
| `tsc --noEmit` | 0 errores | 0 errores |

Nuevos: `settingsData` (14: por defecto, reparación, rangos, tipos, códigos, versiones, JSON dañado, **archivo dorado v1**, cadena de migraciones, hueco en la cadena) · `settingsStore` (20: carga, copia `.corrupt`, respaldo, versión posterior, almacenamiento que lanza, escritura `.bak` → nuevo → releer → borrar, primera escritura, escrituras en cola, **escritura perdida en silencio**, **corte entre la copia y la escritura**, `remove` que falla) · `chooseLocale` (5) · `PauseButton` (9: **arriba al centro a cualquier relación de aspecto de 4:3 a 21:9**, zona segura, sin foco, recoge dedos) · `SettingsMenu` (13: cerrado/abierto, modal, ES/EN, idiomas en su nombre, deslizadores, relee al abrir, la sección táctil solo con capa táctil, *Continuar*, foco) · `keyboardSource` (+1).

E2E `language` (navegador real, teclado y almacenamiento reales): un visitante nuevo recibe el idioma del dispositivo (inglés), **no se guarda nada** y **el menú no está construido ni su código pedido** · el icono: centrado (±2 px) arriba, ≥ 44 px, sin foco · abierto, **el juego se detiene** (los *ticks* no avanzan, ni siquiera pidiéndolos) y el menú muestra «Español» / «English» · elegir español lo aplica **al instante** (HUD «Vida», `<html lang>`, el propio menú) y lo guarda · **Continuar** reanuda; **Esc** abre y cierra · **sobrevive** a recargar, a una segunda pestaña, a **un contexto de navegador nuevo con el almacenamiento guardado** y a un cambio de sala · `?lang=en` gana esa visita y **no pisa** lo guardado; la siguiente visita sigue en español · un valor guardado **dañado** no impide arrancar (idioma del dispositivo, el texto dañado se conserva en `.corrupt`, y una elección nueva se guarda bien); uno de una **versión posterior** se aparta sin pisarlo · táctil: tamaño ×1.3 y opacidad 0.5 **se aplican al instante**, se guardan y siguen ahí tras recargar.

### 5. Hallazgos

| Hallazgo | Solución |
|---|---|
| El E2E detectó que ni el icono de pausa ni el menú recibían el puntero: `#ui` es transparente al puntero **salvo lo que lo pide**, y mis dos elementos no lo pedían (en `happy-dom` no existe ese *hit-testing*, así que las pruebas unitarias pasaban) | `pointer-events:auto` en ambos, con una aserción unitaria cada uno; **el E2E es lo que lo comprobó de verdad** |
| Un icono de pausa de 44 px a la escala mínima de la interfaz (0.9) medía 40 px: por debajo del objetivo táctil | 50 px a escala 1 (≥ 44 px siempre) |
| Las flechas movían al héroe mientras el foco estaba en un deslizador del menú | `data-ui-block` filtra el teclado como ya filtraba el ratón (salvo la tecla de pausa) |
| Hacer perezoso el menú creó *chunks* compartidos nuevos (el menú comparte módulos con el juego) y el arranque en frío subió a **199.2 KB gz** | el panel de depuración ya no importa los enemigos (los pide al juego por *callbacks*): su *chunk* compartido (4.8 KB gz) desaparece y el módulo vuelve al juego → **197.8 KB** |

### 6. Bundle tras S18

Arranque en frío de R1: **197.8 KB gz** (196.3 → 197.8, +1.5 KB: guardado, selección de idioma, icono de pausa y 7 claves; el menú, 2.1 KB gz, es un *chunk* aparte). Margen frente a 200 KB: **2.2 KB**. **S19 y S20 no deben añadir código de ejecución**: son integración, E2E y documentación.

---

## S19 — Integración en R1 y los ocho escenarios E2E ✅

Hasta aquí cada sistema se demostró **por separado**. S19 demuestra que funcionan **juntos** en la primera sala de la vertical slice, con el mismo código de producción y **sin añadir una sola línea de ejecución** (solo tests y herramientas; el *bundle* no cambia).

### 1. R1 completa: teclado bit a bit y táctil con dedos reales

- **Dos recorridos guionizados**, una sola fuente (`tests/helpers/vertical.ts`): `playWin` (el túnel agachado → **recoger la carta interactuando** → dos *Spirit Bolt* → el slime golpea una vez → **una botella** → la puerta se abre → la salida) y `playDefeat` (la carta, una botella, y **gana el slime** → pantalla de derrota → reaparición). Lo mismo los afirma el test de Node y lo graba y reproduce el E2E, así que **lo que prueba uno y lo que juega el otro no pueden separarse**.
- **`tests/integration/vertical.test.ts`** (15 tests, ~0.1 s, Node puro): empieza **sin carta**, con la barra llena, tres botellas y nada con icono · el icono aparece **antes** que la pulsación y la carta se recoge una sola vez (evento, bandera y habilidad) · **dos** lanzamientos de 30 y ninguno denegado · la puerta se abre después de los proyectiles y antes de la salida · una botella: se bebe una, cura **1** (solo faltaba 1) y se recarga mientras dos siguen llenas · no se muere ni se rechaza nada · **la derrota**: vuelve a la entrada con vida y magia llenas, **la carta sigue equipada** y su bandera recordada, **la botella no se rellena**, el slime está de vuelta a plena vida, la puerta cerrada y **la carta no vuelve a estar en el suelo del túnel** · **determinismo**: dos ejecuciones iguales dan las mismas pulsaciones y el mismo resumen de la simulación cada 50 ticks, para la victoria y para la derrota.
- **E2E `vertical`**, dos mitades en Chromium:
  1. **Teclado, bit a bit.** Las dos partidas se **graban en Node** y se **reproducen por el teclado real** del navegador, tick a tick, comparando cada 50 ticks un **resumen de toda la simulación** que ahora incluye lo nuevo: la **magia** (6 decimales), **cada botella** (estado y progreso), la **carta** equipada, el **objeto que tiene el icono** y los **proyectiles**. Si el navegador se desviara un solo bit, dice en qué tick. Mientras se reproduce comprueba lo que se ve: el icono sobre la carta con la **«E»** (y no pegado a un borde de la pantalla), la carta en el HUD **sin** icono, la barra en `scaleX(0.7)` tras el primer lanzamiento, el frasco que se bebe **brilla** (`data-drinking`). Al final: carta equipada, banderas `defeated:r1_slime` + `taken:card_spirit_bolt`, salida `east`, vida 5, botellas `recharging/ready/ready`. Tras la derrota: de vuelta en la entrada con vida y magia llenas, **la carta sigue, la botella no se ha rellenado, el slime ha vuelto, la puerta está cerrada**, y no hay icono donde estaba la carta.
  2. **Táctil, con dedos reales** (CDP `TouchScreen`, reloj virtual): desde la boca del túnel, **un solo dedo** (derecha + abajo a la vez) lo cruza agachado · **un toque en el icono** recoge la carta (el icono no lleva tecla en táctil y mide ≥ 44 px) y **solo entonces aparece el botón Habilidad** · toques en **Habilidad** vencen al slime con dos *Spirit Bolt* y se abre la puerta · un golpe hace aparecer **el chip de botella** y **un toque lo bebe** (la vida vuelve a 5 y el chip desaparece) · un dedo cruza la puerta hasta `exit:reached` · **cinco golpes** → pantalla de derrota → un toque en un botón salta la espera → de vuelta con la carta, la botella aún recargándose, el slime **sigue vencido** y el botón Habilidad aún dibujado.

Recorrido de la victoria (ticks de simulación; 1367 en total ≈ 22.8 s de juego): icono disponible **628** · carta **647** · golpe del slime **1077** · *Spirit Bolt* **1109** y **1134** · slime vencido y puerta abierta **1135** · bebe **1172 → 1196** (+1) · salida **1345**.

### 2. Los ocho escenarios del prompt

| # | Requisito | Escenario | Dispositivo | Qué demuestra |
|---|---|---|---|---|
| 1 | Táctil (*driver* simulado) | `touch` + mitad táctil de `vertical` | CDP `TouchScreen` | zona izquierda invisible con origen flotante, arrastre ↑ salto / ↓ agacharse, *flick* abajo = bajar de plataforma, solo Ataque/Dash/Habilidad a la derecha, un dueño por dedo (multitáctil) |
| 2 | HUD | `hud` | teclado y táctil | vida (5), magia, carta (vacía/lista/enfriamiento/sin magia), botellas, zonas seguras, escalado, DOM sin Pixi |
| 3 | Magia | **`magic`** (nuevo) | teclado | barra 100 antes de cualquier carta · coste exacto 30 al soltar · regeneración **gradual** 6/s tras **1 s** · nada mientras lanza ni en el segundo siguiente · tres usos dejan 10 y el cuarto se **deniega** (sacudida de barra y carta, nada gastado) · los extremos (0 y 100) |
| 4 | Spirit Bolt | `bolt` | teclado, gamepad abstracto, táctil | sin carta no hay habilidad · lanzamiento de 6 ticks · vuelo 16 m/s y 12 m · daño 2 y **no perfora** · cian con núcleo blanco · Y y el botón táctil lanzan lo mismo · quitar la carta apaga el botón |
| 5 | Botellas | `bottles` | teclado y táctil | canal de 24 ticks, efecto al final, golpe que interrumpe sin gastar, denegado con vida llena, recarga **de una en una** cada 60 s, estados lista/usada/recargando |
| 6 | Interacción | `interaction` | teclado y táctil | **sin botón permanente**: el icono solo existe al alcance, flota sobre el objeto, dice la tecla del dispositivo (nada en táctil), su verbo en el idioma del jugador, **el más cercano gana**, palanca → puerta, la carta de R1 en el túnel |
| 7 | Idioma persistente | `language` | teclado, ratón y táctil | elegir español se aplica al instante y **sobrevive** a recargar, a otra pestaña, a un navegador nuevo y a un cambio de sala · `?lang=` no pisa · valor dañado no impide arrancar · tamaño/opacidad táctil persisten |
| 8 | Gamepad (*driver* abstracto) | `gamepad` | `VirtualPad` | stick radial con zona muerta 0.22, A/X/B/Y, D-pad, abajo + A baja de plataforma, desenchufar a mitad de carrera, **y ahora el Prompt 5 por el mismo mando: LT interactúa (el icono dice «LT»), Y lanza, LB bebe, Start abre y cierra el menú de pausa** |

Más: `vertical` (R1 completa), `devtools` (el panel `?debug=1` bajo demanda) y los 12 de los Prompts 3–4 (`movement`, `crouch`, `combat`, `slime`, `r1`, `room`, `death`, `render`, `camera`, `sprites`, `vfx`, `stress`).

### 3. Qué se cambió en las herramientas

- **`magic` sale de `bolt`**: el escenario `bolt` mezclaba la barra (regeneración, rechazo, extremos) con el proyectil (vuelo, daño, dispositivos). Se separaron para que los ocho escenarios del prompt sean **explícitos y cada uno falle por su causa**; `bolt` conserva un rechazo bajo 30 con su propio ángulo («no sale proyectil, no se gasta nada»).
- **`tools/e2e/replay.ts`**: el resumen y las teclas cubren lo nuevo (`ability`, `bottle`, `interact`), y la reproducción termina soltando todo.
- **`gamepad`** gana la sección del Prompt 5 (arriba) y su ayudante `pad()` sigue a `ctx.page` (al abrir otra página el contexto anterior se cierra).

### 4. Hallazgos

| Hallazgo | Solución |
|---|---|
| Un *Spirit Bolt* lanzado **a quemarropa** vive **un tick** (nace dentro del slime y le pega al siguiente): el E2E que lo esperaba «en vuelo» solo lo veía por la casualidad del troceo (cada 4 ticks) | la condición pasa a lo que sí dura (estado `cast` con 70 de magia); el vuelo se prueba en `bolt` con un blanco **lejano** |
| En la reproducción del navegador **la cámara va por detrás del héroe** (la simulación corre más rápido que el tiempo real): el icono quedaba sujeto al borde de la pantalla (correcto: nunca sale de la zona útil) y la captura salía sin héroe | se dejan pasar fotogramas reales hasta que la cámara le alcanza **antes** de mirar, y se comprueba que el icono está **sobre la carta** (±3 px), no pegado a un borde. No es un fallo del juego: en una partida real los *ticks* y la cámara avanzan a la vez |
| Al caer el guardián, `gate:changed` se emite **antes** que `flag:set` **en el mismo tick** (orden interno de la sesión) | el test no depende del orden dentro de un tick: comprueba «después de los proyectiles, antes de la salida» |

### 5. Pruebas

| | Antes | Después |
|---|---|---|
| Tests | 1144 / 76 archivos | **1159 / 77 archivos** (+15, `vertical.test.ts`) |
| E2E | 20 | **22** (`magic`, `vertical`), desarrollo y producción **22/22** |
| `tsc --noEmit` | 0 errores | 0 errores |
| Draw calls (peor momento) | R1 12 · sala completa 14 | `vertical` **14** en desarrollo y **13** en producción (presupuesto 60) |

### 6. Bundle tras S19

**197.8 KB gz** (27 *scripts*): sin cambio, porque S19 no añade código de ejecución. Margen frente a 200 KB: **2.2 KB**.
