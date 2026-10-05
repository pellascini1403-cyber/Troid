# ADR-0002 — Dirección 2D con sprites y capa de render PixiJS

**Estado:** propuesta (**pendiente de confirmar D1 y D2**) · **Fecha:** 2026-10-05 · **Fase:** auditoría (Prompt 2)
· Modifica parcialmente [ADR-0001](0001-stack.md) (solo la parte de Three.js / glTF). Evidencia completa: [AUDIT-2026-10](../AUDIT-2026-10.md).

## Contexto

| Hecho | Fuente |
|---|---|
| El prompt maestro de esta conversación pedía **3D estilizado en 2.5D** («NO quiero 2D puro») y sobre eso se construyeron F1–F5 (Three.js). | brief 1, ADR-0001 |
| El brief actual pide un **metroidvania 2D con sprites** (Hollow Knight + Solo Leveling), y prohíbe convertir el proyecto a 3D o 2.5D. | brief 2, Prompt 2 |
| Los dos briefs son incompatibles en la dimensión del juego. Se sigue el más reciente. | AUDIT §2.4 |
| El **66.9 %** del código (3 498 / 5 228 líneas) no depende del renderizador: simulación, input, lógica de cámara, debug, tooling. | AUDIT §3 (medido) |
| 17 archivos (1 730 líneas, 33.1 %) importan `three` y forman la vista 3D. | AUDIT §3 (medido) |
| Las imágenes del arte son concept art sin alfa; no son sprites de producción. | AUDIT §6.1 (medido) |

## Decisión (propuesta)

**D1 — Dirección 2D con sprites.** Se retira la vista 3D (etiquetando antes el estado actual como `proto-3d-f5`).

**D2 — PixiJS v8 como capa de vista** (`render/`, `assets/`, `vfx/`), manteniendo **sin cambios** el contrato simulación → vista:
`ActorViewState` + `EventBus`. La simulación, el input, la lógica de `CameraRig`, el debug y el tooling se conservan.

Siguen vigentes del ADR-0001: TypeScript estricto, Vite, Vitest, Playwright, Capacitor para iOS/Android, simulación pura y determinista,
contenido como datos (`*Definition`), test de arquitectura como puerta de calidad.

## Evidencia (benchmark propio, 800 sprites animados de un atlas, 1280×720)

| Opción | Draw calls | CPU/frame (mediana)¹ | Bundle (gz) |
|---|---:|---:|---:|
| **PixiJS v8** | **1** | 0.7 ms | 148.9 KB |
| Three + `THREE.Sprite` | 800 | 2.1 ms (p95 610 ms) | 127.3 KB |
| Three + batcher instanciado propio | 1 | 0.1 ms | 126.4 KB |

¹ Render por software (SwiftShader): sirve para comparar, no como cifra absoluta. Los draw calls son exactos.

## Alternativas

| Opción | Por qué no (hoy) |
|---|---|
| Mantener 3D / 2.5D | Prohibido por el brief vigente. |
| **Three ortográfico + batcher propio** | Mismo resultado final y menos dependencias, pero hay que escribir y mantener atlas, animación por frames, filtros (palette-swap, glow), partículas y culling: ≈ +1 fase. Es **la alternativa de reversión**. |
| Canvas 2D propio | Sin filtros por GPU; glow/blur de fondos caros en móvil; todo por escribir. No medido. |
| Phaser | Su bucle, física e input duplican y chocan con la simulación propia (determinista, 60 Hz fijos). No medido. |
| Godot / Unity | No se pueden ejecutar ni verificar en este entorno (ver ADR-0001); no hay razón técnica nueva para cambiar de motor. |

## Consecuencias

- **Reutilización alta, riesgo acotado:** el cambio toca solo la capa de vista; el gameplay y sus 192 tests quedan intactos (salvo
  `assets.test.ts`, 23 tests específicos de glTF, y la actualización del test de arquitectura).
- **El bundle no empeora:** Pixi 148.9 KB gz frente a los 163.8 KB gz del chunk actual de Three.
- **Nueva dependencia de runtime** (`pixi.js`), justificada arriba; `three` y su tooling salen del runtime.
- **Arte:** el pipeline pasa de glTF a **manifiestos de sprite set** (atlas, clips, anclas, fallbacks), con animación guiada por las fases
  de la simulación y *palette-swap* por filtro (AUDIT §6).
- **Vista aislada:** una futura vuelta a Three (o a otro motor) solo afecta a `render/`, `assets/` y `vfx/`.

## Criterio de reversión

El *spike* de la Fase 0 monta una escena de prueba (≥ 800 sprites animados, capas de fondo, un filtro, ≥ 200 partículas) y mide:
**≤ 60 draw calls**, sin fugas tras recargar, y arranque sin errores en Chromium headless. Si no se cumple, o si se detecta un
bloqueo en WebViews móviles objetivo, se adopta Three ortográfico + batcher propio. El contrato de vista no cambia.

## Qué se hace al aceptarla (Fase 0, **no antes**)

1. Etiquetar `proto-3d-f5` sobre el estado actual.
2. Retirar la vista 3D (lista en el anexo de la auditoría) y `tools/gen/*`; actualizar el test de arquitectura.
3. Añadir `pixi.js` y el esqueleto de `Renderer2D`; el *spike* anterior.
4. `npm run check` + `npm run test:e2e` en verde con la vista nueva.

## Sin verificar (y por tanto no afirmado)

Rendimiento de PixiJS en WebViews de iOS y Android reales; comportamiento ante pérdida de contexto WebGL en móvil; compilación nativa
con Capacitor (no instalado). Todo ello se valida en la Fase 0 (lo que sea posible aquí) y en dispositivo real (lo que no).
