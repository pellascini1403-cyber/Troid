# Roadmap — Vertical slice «Ancient Forest Ruins»

Objetivo: 15–30 min de juego (ver §43 del brief). Cada fase termina con: `npm run check` en verde
(typecheck + tests), build de producción y — cuando hay algo visible — captura en Chromium a 844×390.

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
