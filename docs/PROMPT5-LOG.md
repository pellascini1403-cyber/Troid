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
| **S16** cartas y botellas | ⏳ | |
| **S17** interacción contextual | ⏳ | |
| **S18** idioma persistente | ⏳ | |
| **S19** integración en R1 y E2E | ⏳ | |
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
