# Bitácora del Prompt 5 — capa de interacción móvil y sistemas del jugador

> Registro técnico de la ejecución (pasos S12–S20): qué se hizo, qué se midió, qué se desvió y por qué.
> Las decisiones de los Prompts 3 y 4 están **cerradas** ([ADR-0003](adr/0003-arquitectura-2d-definitiva.md), [GAME-SPEC-2D](GAME-SPEC-2D.md)); aquí solo se documenta su implementación. Si algo choca con ellas, se marca con **⚠ CONFLICTO**.
> Cifras medidas ✅ en este entorno (Chromium sin GPU: render por software; sirve para comparar, no como cifra absoluta). **No se ha verificado nada en un iPhone ni en un Android reales.**

## Estado

| Paso | Estado | Commit |
|---|---|---|
| **S12** baseline y revisión del bundle | ✅ | (ver historial) |
| **S13** input unificado (4 commits: contrato, gestos, gamepad, capa DOM + E2E) | ✅ | (ver historial) |
| **S14** HUD (DOM) | ⏳ | |
| **S15** magia y Spirit Bolt | ⏳ | |
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
