# Roadmap — Troid (2D + PixiJS)

> **Estado a 2026-10-07.** Plan detallado, puertas y criterios de cada paso: [MIGRATION-2D](MIGRATION-2D.md) · Qué se construye: [GAME-SPEC-2D](GAME-SPEC-2D.md) ·
> Cómo: [ARCHITECTURE-2D](ARCHITECTURE-2D.md) · Decisiones: [ADR-0003](adr/0003-arquitectura-2d-definitiva.md).

**Objetivo de la vertical slice «Ancient Forest Ruins» (15–30 min):** entrar → explorar → combatir → conseguir algo → continuar → enfrentarse a un enemigo.
Cada paso termina con `npm run check` en verde, build de producción y —cuando hay algo visible— E2E y capturas (844×390 y 1920×1080).

| Fase | Contenido | Estado |
|---|---|---|
| **F1–F5** | stack, núcleo, movimiento (coyote, buffer, salto variable, dash, i-frames), input abstracto, colisión, cámara (matemática), depuración | ✅ (192 tests; la vista 3D de F3/F4 es el prototipo que se retira) |
| **Prompt 2** | auditoría técnica y plan ([AUDIT-2026-10](AUDIT-2026-10.md)) | ✅ |
| **Prompt 3** | especificación definitiva 2D, arquitectura, migración, ADR (solo documentación) | ✅ |
| **Prompt 4** | migración a 2D + PixiJS y núcleo jugable: movimiento, agacharse, combate, enemigo, sala, muerte, VFX mínimos, i18n | ✅ (617 tests · 12 escenarios E2E · R1 jugable con teclado; [bitácora](PROMPT4-LOG.md)) |
| **Prompt 5** | magia, cartas, botellas, interacción, **controles táctiles por gestos**, gamepad, HUD, ajustes e idioma persistentes | ✅ (1180 tests · 23 escenarios E2E · R1 completa por teclado, **táctil** y mando; arranque en frío 197.9 KB gz; [bitácora](PROMPT5-LOG.md)). ⚠ **Sin verificar en un iPhone ni un Android reales** |
| **Prompt 6** | mundo conectado (4 salas), transiciones, flags, checkpoints, guardado de progreso, peligros, zonas de cámara, cuarta botella, el Spirit Bolt en R3 tras un sello, el jefe (Custodio de Tinta), ajustes v2 y calibración móvil (solo geometría) | ✅ (**1833 tests** · **35 escenarios E2E** en desarrollo y producción · **R1 → R2 → R3 → R4 → jefe → recompensa → salida** jugable de principio a fin (recorrida en el navegador con el teclado de punta a punta y con teclado + mando en una sentada; el táctil, con toques CDP en R1 entera, los botones y el último tramo de R4); arranque en frío 198.4 KB gz; [bitácora](PROMPT6-LOG.md)). ⚠ **Nada calibrado en un dispositivo real** ([MOBILE-CALIBRATION](MOBILE-CALIBRATION.md)) |
| **Prompt 7** | **pipeline de arte 2D**: manifiesto de datos, escala y pivote, empaquetador de atlas **sin pérdida**, carga diferida, validación en el *build*, conmutador *placeholder* ↔ arte estado por estado, laboratorios (`?lab=player`, `?lab=art-stress`), contratos de VFX, de audio y de entorno, y una escena de estrés medida. **Sin arte final**: el del protagonista **no está en el repositorio** y no se inventó | ✅ (**2223 tests** · **43 escenarios E2E** en desarrollo y producción · arranque en frío **190.7 KB gz** (baja desde 198.4); [bitácora](PROMPT7-LOG.md) · [ART-PIPELINE-2D](ART-PIPELINE-2D.md)). ⚠ **Arte real entregado: 0 de 15 clips del protagonista y 0 de 12 piezas obligatorias del entorno**; **nada medido ni verificado en un dispositivo real** |
| **Siguiente** | **entregar el arte** (el protagonista primero), dibujo de las salas con imágenes, VFX finales, motor de audio, aviso de girar el dispositivo, cierre de la slice, empaquetado nativo (Capacitor), QA en dispositivos | ⬜ **siguiente** |

### Pasos del Prompt 4 ✅ (cortes seguros: **A** = S0–S4 · **B** = S5–S8 · **C** = S9–S11)

S0 base y etiqueta `proto-3d-f5` · S1 *spike* Pixi + `Game2D` · S2 cámara 2D · S3 sprites, animador, validador y tests portados · S4 retirar Three.js ·
S5 agacharse · S6 combate (rescate de `wip/f6-combat-core`) · S7 VFX mínimos · S8 muerte, i18n y overlay · S9 primer enemigo · S10 primera sala y salida · S11 E2E, rendimiento y documentación.

### Pasos del Prompt 5 ✅ (S12–S20)

S12 baseline y revisión del bundle · S13 entrada unificada (contrato de ejes, gestos táctiles, mando) · S14 HUD en DOM y los recursos que muestra · S15 magia y Spirit Bolt · S16 botellas de energía y cartas · S17 interacción contextual · S18 idioma persistente y ajustes · S19 R1 completa con todo lo nuevo y los ocho escenarios E2E · S20 validación final (sondeos aleatorios que hallaron y corrigieron cinco defectos latentes) y documentación.

### Pasos del Prompt 6 ✅ (S21–S32)

S21 baseline y bitácora · S22 grafo de mundo y salas R1–R4 · S23 transiciones deterministas · S24 guardado de progreso, *checkpoints* y regla de muerte · S25 peligros · S26 zonas de cámara · S27 cuarta botella · S28 Spirit Bolt en R3 tras un sello · S29 el jefe (Custodio de Tinta), la arena y el Air Dash · S30 ajustes v2 (volumen preparado, calidad, teclas, disposición táctil) · S31 calibración móvil (geometría y documentación; **sin afirmar nada de dispositivos reales**) · S32 integración final (la slice entera guardada y reanudable desde cada guardado; un E2E de principio a fin con teclado, mando y táctil).

### Pasos del Prompt 7 ✅ (S33–S44)

S33 auditoría del pipeline (13 hallazgos) · S34 contrato de assets (manifiesto, escala, pivote, clips, anclas, etiquetas) · S35 empaquetador de atlas y carga diferida · S36 visual intercambiable del protagonista · S37 validación en el *build* · S38 importación del protagonista (el hueco declarado, `assets:missing`) · S39 laboratorio `?lab=player` · S40 R1 con el arte completo (las cuatro cajas del héroe) · S41 contrato visual de VFX y señales de audio · S42 contrato de entorno · S43 escena de estrés del arte · S44 integración y cierre (`world-art`: la slice entera con arte puesto, bit a bit). Qué se encontró y qué se midió: [bitácora del Prompt 7](PROMPT7-LOG.md).

> **Lo que el Prompt 7 NO hizo (a propósito):** no integró ningún arte real porque **no está físicamente en el repositorio**; no generó, dibujó, recortó ni imitó nada; no rediseñó el protagonista (sigue siendo la cápsula con espada); no escribió el dibujo de las salas con imágenes, ni los *flipbooks* de VFX, ni un motor de audio —sin arte o sonido delante no se construyen—; no midió nada en un dispositivo real.

### Qué queda tras el Prompt 7 (lo que el 7 dejó a propósito o a la vista)

- **El arte (⚠ lo primero):** el **pipeline está listo y el arte no ha llegado**. Faltan, exactamente (`npm run assets:missing`): los **15 clips del protagonista** (`idle`, `walk`, `jump`, `fall`, `dash`, `attack1`, `attack2`, `attackAir`, `crouch`, `attackCrouch`, `hurt`, `death`, `cast`, `drink`, `interact`, los cuatro golpes con las anclas de la espada) y las **12 piezas obligatorias del entorno** (+14 opcionales). Se entregan en `art/` siguiendo [deliver-protagonist-art](guides/deliver-protagonist-art.md) y [deliver-environment-art](guides/deliver-environment-art.md); se ven en `?lab=player`; se miden con `?lab=art-stress&art=<carpeta>`. **Hasta entonces el protagonista es la cápsula con espada y nada lo sustituye.**
- **Lo que se escribe con el arte delante:** el dibujo de las salas con imágenes (sobre las funciones ya probadas de `presentation/environment`), la comprobación de costuras y el alfa por pieza, los *flipbooks* de VFX si el arte los trae (hoy los efectos son los procedurales de siempre; su sustitución está definida en tres niveles, ART-PIPELINE-2D §H.3) y el arte de enemigos y jefe (hoy procedurales; mismo contrato que el héroe).
- **Audio:** hay **17 señales** definidas (`audioCues`, `AudioDirector`, sin sonido) y el volumen del menú; **faltan** el motor, el manifiesto de sonidos y los archivos.
- **Dispositivo real (⚠ la gran deuda, sin cambios):** nada se ha verificado en un iPhone, un iPad ni un Android, ni con un mando físico. Las medidas del arte del Prompt 7 (1000 *sprites* = 1–5 llamadas de dibujo; 9 páginas = 23.2 MiB) son de **Chromium sin cabeza con GL por software** y **no dicen nada de un teléfono**. Protocolo y tablas vacías en [MOBILE-CALIBRATION](MOBILE-CALIBRATION.md); el presupuesto de memoria de las páginas de arte (parte C de ART-PIPELINE-2D) es una **propuesta** que un dispositivo debe confirmar.
- **Sin tocar desde el Prompt 6** (lo de la lista de abajo que sigue abierto): pantalla de cierre y créditos, aviso de «gira el dispositivo», «Auto» que mida el dispositivo, aviso de que los controles pedidos no caben, remapeo de mando y táctil, y `CapacitorPreferencesAdapter` con el sello de tiempo.
- **Bundle:** arranque en frío **190.7 KB gz** de 200 (margen 9.3 KB): el arte vive en *chunks* diferidos, las imágenes no son JavaScript, y el `ArtLibrary` solo se descarga si hay arte. Primera sesión entera: 205.9 KB gz. Se mide con `npm run bench:bundle` tras cada cambio importante.

### Qué dejó el Prompt 6 para el 7 (referencia; su estado, arriba)

- **Dispositivo real (⚠ la gran deuda):** probar en un **iPhone, un iPad y un Android** —ergonomía y alcance de los botones, la deriva del pulgar (R18), los umbrales de `TouchConfig`, *safe areas* con *notch* e isla, la barra de direcciones que se esconde (el `resize` suelta los dedos), un mando físico, rendimiento (Android de gama baja, calor) y el perfil de calidad que conviene—. Protocolo y tablas **vacías** en [MOBILE-CALIBRATION](MOBILE-CALIBRATION.md).
- **Arte y feeling:** sprites definitivos del protagonista y los enemigos, el arte de las salas, VFX de energía cian/azul, sonido (el volumen del menú está **preparado**, no suena nada). **El protagonista sigue siendo la cápsula abstracta con espada**; nada de él se ha rediseñado.
- **El final de la slice:** hoy la salida del mundo (`end`, una columna de luz) solo emite `exit:reached`: **no hay pantalla de cierre ni créditos**. Tampoco hay aviso de «gira el dispositivo» (la bandera `rotateDevice` existe).
- **Ajustes:** «Auto» **no mide** el dispositivo (es el perfil equilibrado); el menú **no avisa** de que el tamaño de los controles pedido no cabe junto al HUD (a la izquierda cede a menudo); el mando y el táctil no se remapean.
- **Bundle:** **198.4 KB gz** de 200 (margen 1.6 KB). Palancas sin tocar: `InteractableViews` / `SealView` al *chunk* diferido (≈ 1.5 KB) y **paquetes por sala** (≈ 3 KB: la simulación y los datos del jefe solo hacen falta al llegar a R4). El arte definitivo **no cabe sin** una de ellas o sin subir el techo con una medición delante.
- **Persistencia nativa:** `CapacitorPreferencesAdapter` (el almacenamiento de un WebView puede purgarse) y el sello de tiempo.

### Qué quedó para el Prompt 6 (y no se hizo a propósito en el 5) — ✅ hecho en el 6

- **Mundo y progreso:** mover la carta del Spirit Bolt de R1 a R3 (hoy es provisional, ⚠ desviación documentada), transiciones entre salas (`RoomTransition`: fundido y carga con `ExitDef.to`), puntos de guardado (recarga completa de botellas; `refillAll()` ya está listo), **guardado del progreso** (flags, cartas, ranuras, punto de guardado: hoy solo se guardan los ajustes), peligros y zonas de cámara, jefe con fases. La cuarta ranura de botella existe (`addBottleSlot`) pero ninguna sala la coloca todavía.
- **Ajustes por migración:** volumen, *bindings* (remapeo), calidad y accesibilidad, y la **posición** de los controles táctiles (hoy solo tamaño y opacidad).
- **Dispositivo real (⚠ no verificado en el Prompt 5):** ergonomía táctil y deriva del pulgar (R18), safe areas en un iPhone con notch / Dynamic Island, un mando físico, rendimiento en Android de gama baja, el `resize` que suelta los dedos con la barra de direcciones de un navegador móvil. Ahí se calibran los umbrales de `TouchConfig` y la disposición de `layout.ts`.
- **Presupuesto de bundle:** el arranque en frío está en **197.9 KB gz** frente al techo de 200 KB (margen 2.1 KB). El Prompt 6 debe **presupuestar** antes de añadir: cargar bajo demanda más código que no haga falta en el arranque, o decidir subir el techo con una medición delante.

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
