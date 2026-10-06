# Roadmap — Troid (2D + PixiJS)

> **Estado a 2026-10-06.** Plan detallado, puertas y criterios de cada paso: [MIGRATION-2D](MIGRATION-2D.md) · Qué se construye: [GAME-SPEC-2D](GAME-SPEC-2D.md) ·
> Cómo: [ARCHITECTURE-2D](ARCHITECTURE-2D.md) · Decisiones: [ADR-0003](adr/0003-arquitectura-2d-definitiva.md).

**Objetivo de la vertical slice «Ancient Forest Ruins» (15–30 min):** entrar → explorar → combatir → conseguir algo → continuar → enfrentarse a un enemigo.
Cada paso termina con `npm run check` en verde, build de producción y —cuando hay algo visible— E2E y capturas (844×390 y 1920×1080).

| Fase | Contenido | Estado |
|---|---|---|
| **F1–F5** | stack, núcleo, movimiento (coyote, buffer, salto variable, dash, i-frames), input abstracto, colisión, cámara (matemática), depuración | ✅ (192 tests; la vista 3D de F3/F4 es el prototipo que se retira) |
| **Prompt 2** | auditoría técnica y plan ([AUDIT-2026-10](AUDIT-2026-10.md)) | ✅ |
| **Prompt 3** | especificación definitiva 2D, arquitectura, migración, ADR (solo documentación) | ✅ |
| **Prompt 4** | migración a 2D + PixiJS y núcleo jugable: movimiento, agacharse, combate, enemigo, sala, muerte, VFX mínimos, i18n | ✅ (617 tests · 12 escenarios E2E · R1 jugable con teclado; [bitácora](PROMPT4-LOG.md)) |
| **Prompt 5** | magia, cartas, botellas, interacción, **controles táctiles por gestos**, gamepad, HUD, ajustes e idioma persistentes | ⬜ **siguiente** |
| **Prompt 6** | mundo conectado, flags, puntos de guardado, guardado, jefe con fases | ⬜ |
| **Prompt 7** | arte definitivo, VFX, pulido, rendimiento, empaquetado nativo (Capacitor), QA | ⬜ |

### Pasos del Prompt 4 ✅ (cortes seguros: **A** = S0–S4 · **B** = S5–S8 · **C** = S9–S11)

S0 base y etiqueta `proto-3d-f5` · S1 *spike* Pixi + `Game2D` · S2 cámara 2D · S3 sprites, animador, validador y tests portados · S4 retirar Three.js ·
S5 agacharse · S6 combate (rescate de `wip/f6-combat-core`) · S7 VFX mínimos · S8 muerte, i18n y overlay · S9 primer enemigo · S10 primera sala y salida · S11 E2E, rendimiento y documentación.

## Reglas de trabajo

1. Un paso no empieza hasta que el anterior pasa `npm run check` y su verificación visual (si aplica); un commit por paso.
2. La simulación **solo crece**: los 40 tests de movimiento no se modifican y deben pasar siempre.
3. Nada de features por acumular: si no sirve a *movimiento → combate → exploración → progresión* funcionando juntos, no entra.
4. Cuando el usuario entregue un asset definitivo: **se integra, no se rediseña**. Las imágenes del protagonista son la **fuente de verdad**: sin recolor, recorte automático ni redibujo.
5. No se afirma que algo funciona si no se verificó; lo no verificable (iOS/Android reales, rendimiento móvil, audio, tiendas) se declara.

---

## Histórico: plan 3D de las fases F1–F19 (obsoleto)

> ⚠️ Corresponde a la dirección 3D 2.5D del primer brief y se conserva solo como registro. F1, F2 y la lógica de F4/F5 (simulación, input, cámara) siguen siendo la base.
> El trabajo a medias de F6 está en la rama `wip/f6-combat-core` (se rescata en el paso S6).

| Fase | Entregable | Estado |
|---|---|---|
| **F1** | Inspección, ADR, arquitectura, scaffold, esqueleto que renderiza en Chromium | ✅ |
| **F2** | Core: math, EventBus, Scheduler, StateMachine, Pool, Rng, Observable, DisposableStore, FixedStepper, tuning | ✅ |
| **F3** | Maniquí 3D blanco rigged (GLB generado), `AssetManager`, `CharacterModel`, `AnimationController`, sockets, materiales toon | ✅ |
| **F4** | `CameraRig` 2.5D + estudio ortográfica vs perspectiva | ✅ |
| **F5** | Colisión cinemática, locomoción, salto (coyote/buffer), dash, input de teclado, debug base | ✅ |
| **F6** | Ataque básico (startup/active/recovery), hitbox, daño, knockback, hit-stop, shake, hit flash | ⬜ |
| **F7** | 4 enemigos 3D + IA por FSM, muerte | ⬜ |
| **F8** | World/Region/Room, transiciones, entorno 3D por capas, 3 rooms + secret + 2 arenas | ⬜ |
| **F9** | `AbilitySystem` (dash), gates, pickups, secretos, test de alcanzabilidad | ⬜ |
| **F10** | Checkpoints, muerte/respawn, `SaveSystem` versionado | ⬜ |
| **F11** | Mini-jefe + arquitectura de jefes + arena | ⬜ |
| **F12** | Jefe principal (2 fases), recompensa, nueva ruta | ⬜ |
| **F13** | Controles móviles (joystick + 4 botones), Capacitor | ⬜ |
| **F14** | Teclado/ratón/gamepad con bindings en datos | ⬜ |
| **F15** | UI temporal data-bound (HUD, boss bar, prompts) + skins PNG | ⬜ |
| **F16** | VFX reutilizables + audio placeholder (Music/SFX/Ambient/BossMusic) | ⬜ |
| **F17** | Iluminación, sombras, niebla, partículas, color script por región | ⬜ |
| **F18** | Perfiles de calidad, pooling, resolución dinámica, presupuestos | ⬜ |
| **F19** | Tests integrales (fugas, duplicados, estados), E2E, guías finales | ⬜ |

**Fuera del orden del brief, integrado donde corresponde:** *Debug mode* (§38) arranca en F5 porque acelera
todo el desarrollo y se amplía después; *Audio* (§49) no tiene fase propia en el brief y se integra en F16.

## Reglas de trabajo

1. Una fase no empieza hasta que la anterior pasa `npm run check` y su verificación visual (si aplica).
2. Nada de features por acumular código: si no sirve a *movimiento, combate, cámara, mundo, animación, VFX o
   iluminación funcionando juntos*, no entra.
3. Cuando el usuario entregue un asset definitivo: **se integra, no se rediseña** (ver *Puntos de reemplazo* en `ARCHITECTURE.md`).
