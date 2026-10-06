# Bitácora del Prompt 5 — capa de interacción móvil y sistemas del jugador

> Registro técnico de la ejecución (pasos S12–S20): qué se hizo, qué se midió, qué se desvió y por qué.
> Las decisiones de los Prompts 3 y 4 están **cerradas** ([ADR-0003](adr/0003-arquitectura-2d-definitiva.md), [GAME-SPEC-2D](GAME-SPEC-2D.md)); aquí solo se documenta su implementación. Si algo choca con ellas, se marca con **⚠ CONFLICTO**.
> Cifras medidas ✅ en este entorno (Chromium sin GPU: render por software; sirve para comparar, no como cifra absoluta). **No se ha verificado nada en un iPhone ni en un Android reales.**

## Estado

| Paso | Estado | Commit |
|---|---|---|
| **S12** baseline y revisión del bundle | ✅ | (ver historial) |
| **S13** input unificado | ⏳ | |
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
