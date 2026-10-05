# Bitácora del Prompt 4 — migración a 2D + PixiJS y primer vertical slice

> Registro técnico de la ejecución (pasos S0–S11 de [MIGRATION-2D §7](MIGRATION-2D.md)): qué se hizo, qué se midió, qué se desvió y por qué.
> Las decisiones del Prompt 3 están **cerradas** ([ADR-0003](adr/0003-arquitectura-2d-definitiva.md)); aquí solo se documenta su implementación.
> Cifras medidas ✅ en este entorno (Chromium sin GPU: render por software; sirve para comparar, no como cifra absoluta).

## Estado

| Paso | Estado | Commit |
|---|---|---|
| **S0** baseline y etiqueta | ✅ | (ver historial) |
| **S1** spike Pixi | ✅ | (ver historial) |
| S2 cámara 2D | ⬜ | |
| S3 sprites y animación | ⬜ | |
| S4 retirar Three.js | ⬜ | |
| S5 agacharse | ⬜ | |
| S6 combate | ⬜ | |
| S7 VFX | ⬜ | |
| S8 muerte, reaparición, i18n | ⬜ | |
| S9 Ink Slime | ⬜ | |
| S10 sala R1 | ⬜ | |
| S11 E2E, rendimiento, documentación | ⬜ | |

---

## S0 — Baseline

**Punto de partida:** rama `claude/troid-vertical-slice` en `ac74b46` (F5 + documentos del Prompt 3), árbol limpio.

| Comprobación | Resultado ✅ |
|---|---|
| Typecheck (`tsc --noEmit`) | 0 errores |
| Tests | **192/192** en 11 archivos |
| Build de producción | OK en 1.0 s · JS de la app 15.2 KB gz + *chunk* de Three 163.8 KB gz |
| E2E `movement` | OK en dev (3.6 s) y en producción (1.9 s) |
| Escena 3D `movement_test` | **7 *draw calls*, 14 136 triángulos**, ≈ 9.6 fps (render por software) |

**Etiqueta `proto-3d-f5`** (anotada) sobre `ac74b46`: último estado 3D verificado.

> ⚠️ **Limitación del entorno:** el *gateway* de git de esta sesión **rechaza el push de etiquetas** (tanto anotadas como ligeras: «remote end hung up unexpectedly»; los pushes de ramas sí funcionan). La etiqueta existe **en el repositorio local**; para que el baseline quede también anclado en el remoto se publicó la **rama `archive/proto-3d-f5`** apuntando al mismo commit. Para crear la etiqueta remota basta, desde cualquier máquina con permisos: `git push origin ac74b46:refs/tags/proto-3d-f5`.

## Reglas de ejecución que se siguen

- Un commit (o varios) por paso; cada paso termina con typecheck, tests, build y, cuando hay algo visible, E2E y revisión de consola.
- La simulación solo crece: los **40 tests de movimiento** no se modifican; los 192 se conservan salvo la lista explícita de [MIGRATION-2D §4](MIGRATION-2D.md).
- `wip/f6-combat-core` **no se toca** (`b695c98`); lo reutilizado se documenta en S6.
- Sin arte final: el protagonista usa **solo** el *placeholder* abstracto del Prompt 3.


---

## S1 — Spike de PixiJS v8 ✅

**Dependencia añadida:** `pixi.js@^8.22.0` (instalada 8.22.0, la misma del *benchmark* de la auditoría). Única dependencia de runtime nueva.

**Qué existe ahora**
- `presentation/` (pura, 15 tests): `palette.ts` (tokens del GAME-SPEC §3.2), `viewport.ts` (proporción 4:3–21:9, barras, px por metro, resolución = min(DPR, tope)), `worldTransform.ts` (cámara → contenedor del mundo en metros, eje Y invertido en un solo sitio, redondeo a píxel de dispositivo, parallax).
- `render/`: `Renderer2D` (`Application`, `autoStart: false` + `app.render()` manual, resize, DPR, barras), `layers.ts` (grafo de escena de ARCHITECTURE-2D §7.4), `RoomView2D` (*blockout* con borde superior iluminado).
- `assets/proceduralTextures.ts` (gradiente, brillo, chispa generados con canvas: sin dependencia de arte).
- `debug/`: `ColliderOverlay2D` (Graphics, `pixelLine`) y `DrawCallCounter` (envuelve los `draw*` de WebGL como el *benchmark*).
- `app/Game2D.ts` (raíz de composición 2D tras `?view=2d`, con `window.__troid` de la misma forma + `draws`, `view`, `canvas`) y `app/labs/stressLab.ts` (`?view=2d&lab=stress`).
- `camera/camera2d.ts`: valores de partida de la cámara 2D (GAME-SPEC §16); `CameraRig` **no se modificó**.
- E2E: `movement` ahora se ejecuta en las dos vistas (`movement`, `movement-2d`), más `render-2d` (resize, DPR, proporciones) y `stress-2d`.

**Medidas ✅ (Chromium con render por software)**

| Escena | *Draw calls* por frame | Criterio |
|---|---:|---|
| **Estrés**: 800 sprites animados de un atlas + 4 capas de parallax + 1 filtro (`ColorMatrixFilter`) + 240 partículas (`ParticleContainer`, aditivo) | **5** (peor frame 5) | ≤ 60 ✅ |
| Juego 2D en `movement_test` (cielo, terreno, jugador) | **1** | ≤ 60 ✅ |
| (referencia) escena 3D del baseline | 7 | — |

El lote de Pixi v8 agrupa hasta 16 texturas distintas por llamada, por eso las capas de parallax con texturas propias no multiplican las llamadas.

**API de Pixi v8 verificada en este paso ✅** (pasa de ⚠️ a ✅ en ARCHITECTURE-2D §7.12; se sincroniza en S11): `Application.init` con `resolution`, `autoDensity`, `powerPreference`; `renderer.resize(w, h, resolution)`; `Container` (`pivot`, `scale`, `position`, `rotation`, `sortableChildren`; `blendMode: 'add'` en el `ParticleContainer`; la herencia del modo aditivo desde un contenedor normal a sus hijos se comprobará en S7); `Graphics` encadenada (`rect().fill()`, `.stroke({ pixelLine })`, `clear()`); `ParticleContainer`/`Particle` (`dynamicProperties`, `addParticle`, `tint`, `alpha`); `ColorMatrixFilter` sobre un contenedor; texturas desde `canvas`; **sin errores ni avisos de consola**.

**Desviaciones y notas**
- El jugador de este paso es una **caja gris con muesca** (provisional, no es el personaje): S3 lo sustituye por el *placeholder* abstracto del pipeline de sprites.
- La comprobación de resize/DPR/proporciones (que el plan asignaba en parte a S2) se hizo ya aquí porque `viewport` es una función pura; S2 se centra en el comportamiento de la **cámara**.
- `__troid.ready()` es inmediato en 2D (todavía no hay assets que cargar de forma asíncrona).
