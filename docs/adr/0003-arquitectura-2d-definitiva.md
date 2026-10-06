# ADR-0003 — Decisiones definitivas de la arquitectura 2D

**Estado:** aceptada · **Fecha:** 2026-10-05 · **Fase:** Prompt 3 (especificación definitiva)
· Desarrolla [ADR-0002](0002-direction-2d.md) (aceptada) y revisa la parte de Three.js/glTF de [ADR-0001](0001-stack.md).
Detalle: [GAME-SPEC-2D](../GAME-SPEC-2D.md) · [ARCHITECTURE-2D](../ARCHITECTURE-2D.md) · [MIGRATION-2D](../MIGRATION-2D.md).

## Contexto

Tras la auditoría del Prompt 2 el propietario del proyecto fijó la **dirección definitiva**: metroidvania **2D puro**, renderer **PixiJS v8**, protagonista ya diseñado (sus imágenes son la fuente de verdad), paleta cian/azul (descartada «todo rojo»), controles móviles sin joystick visible, localización es/en desde el principio. Este ADR registra **todas** las decisiones que ya no requieren aprobación (`DC-xx`) y las únicas que esperan respuesta (`DP-x`).

## Decisiones cerradas

| ID | Decisión | Motivo | Coste de revertir |
|---|---|---|---|
| **DC-01** | Juego **2D puro**: sin 3D, 2.5D ni modelos 3D | mandato del propietario | — |
| **DC-02** | **PixiJS v8** como capa de presentación (`^8.22`, WebGL) | 1 *draw call* por 800 sprites ✅; −15 KB gz; filtros, partículas y atlas ya existen | medio (la vista está aislada; alternativa: Three ortográfico + *batcher* propio) |
| **DC-03** | Three.js sale de la arquitectura; se retira en el paso S4 por **estrangulamiento** tras la etiqueta `proto-3d-f5` | convivencia mínima hasta la paridad | — |
| **DC-04** | La **simulación se conserva** (72.4 % del código es A o B ✅); contrato `ActorViewState` + eventos **sin retirar nada** (solo `z`) | la separación sim/vista permite el cambio | — |
| **DC-05** | HUD, controles táctiles, iconos de interacción y overlays en **DOM**, no en Pixi | texto localizable, zonas seguras, multitáctil nativo, independencia del renderer | bajo |
| **DC-06** | Mundo en metros; `viewHeight` 13.5 m; proporción 4:3–21:9; apaisado fijo en móvil; arte maestro a **2×** (`artPxPerMeter` 160) con variante 1×; atlas ≤ 2048 | tamaño legible del héroe (≈ 12.6 %), presupuesto de memoria | bajo (datos) |
| **DC-07** | Bucle propio (60 Hz fijos + interpolación); Pixi con `autoStart: false` y `app.render()` manual ✅; perfiles `low/medium/high` + gobernador de resolución | un solo bucle; control del rendimiento | bajo |
| **DC-08** | Localización **es/en** desde el Prompt 4; claves `área.entidad.campo`; **ningún literal de interfaz**; respaldo `en` | preparar fr/pt/zh/ja/ko/ru sin tocar código | — |
| **DC-09** | Audio: arquitectura WebAudio dirigida por **eventos** con **ids lógicos** y manifiesto de datos; sin audio definitivo todavía | asset reemplazable sin tocar gameplay | — |
| **DC-10** | Persistencia: **progreso y ajustes separados**, versionados, copia `.bak`, migraciones, adaptadores (web/Capacitor/memoria); ajustes en P5, progreso en P6 | R7 (pérdida de partidas) | — |
| **DC-11** | **Protagonista = imágenes del usuario**; **imagen > texto**; sin rediseño, sin cara humana, sin recolor, sin recorte automático, sin redibujo | mandato del propietario | — |
| **DC-12** | **Paleta:** negro base + blanco + **cian/azul**; **descartada «todo rojo»** (opciones A y B de la auditoría); energía enemiga **violeta**; acento carmesí de tu hoja permitido **solo para diferenciar** y apagado por defecto | mandato del propietario; legibilidad | bajo (datos) |
| **DC-13** | Mientras no haya sprites: **piel provisional que no es el personaje** (silueta abstracta + muesca de orientación + marcador de mano) | respeta «no redibujes» | bajo |
| **DC-14** | **Contrato de la espada:** `weapon_grip` ≈ `hand_r` (≤ 6 px de arte) en todo fotograma con arma; lo valida `validateSpriteSet` | «no debe existir una espada flotando» | — |
| **DC-15** | **Legibilidad del héroe negro:** luz detrás/oscuridad delante, rim light, charco de luz, ojos como ancla; métrica de contraste en P7 | contraste medido 1.0–1.4 : 1 con fondos oscuros ✅ | bajo |
| **DC-16** | Enemigos: **tinta negra con ojos blancos**; *telegraph* = aura violeta + ojos incandescentes + deformación; el primero es **procedural** | tu referencia de enemigos | bajo |
| **DC-17** | Identidad: *metroidvania 2D oscuro + fantasía sobrenatural + energía cian/azul + siluetas fuertes + VFX espectaculares*; referencias = **principios**, nunca contenido; puntos de guardado **no son bancos** | IP propia | — |
| **DC-18** | HUD **propio** arriba a la izquierda (carta, vida, magia, 3–4 botellas), oscuro, con acentos cian/azul; vida en segmentos, magia continua, botellas como viales | no copiar HUD de terceros | bajo |
| **DC-19** | Movimiento de F5 **conservado** (valores intactos); la escala en pantalla la fija la cámara; el cuerpo se ajusta a la silueta chibi **con pruebas** | feel medido, 40 tests | — |
| **DC-20** | **Agacharse:** cuerpo 1.7→1.0 m, hurtbox 1.55→0.9 m, histéresis −0.6/−0.4, espacio para levantarse, dash agachado, atravesar *one-way* | «no solo una animación» | bajo |
| **DC-21** | **Combate** en ticks: *startup/active/recovery*, hit-once, hit-stop, cadena de 2 + aéreo + agachado; valores iniciales en GAME-SPEC-2D §7.2 | prioridad ataque → impacto → daño → knockback → recuperación | bajo (datos) |
| **DC-22** | I-frames: **dash 0.13 s** (existente ✅) · **daño 60 ticks** con parpadeo | evitar «encadenar» al jugador | bajo |
| **DC-23** | **Magia:** barra 100, regeneración gradual 6/s tras 1 s sin gastar, nunca instantánea; Spirit Bolt cuesta 30 | «se recarga gradualmente» | bajo |
| **DC-24** | **Carta = habilidad equipada**; una en la slice; el botón de Habilidad ejecuta la equipada; sin carta, el botón y la carta **no se muestran**; sin inventario | «no construyas un inventario complejo» | bajo |
| **DC-25** | **Botellas:** 3 ranuras (hasta 4), efecto por dato (curación de 2), canal 0.4 s interrumpible sin consumo, recarga **secuencial 60 s** + completa en puntos de guardado, independiente de la magia | «recuperación lenta, no instantánea» | bajo (datos) |
| **DC-26** | **Táctil:** zona izquierda invisible con origen flotante; **salto = arrastre/*flick* hacia arriba** con histéresis (0.55/0.25/0.30); agacharse = arrastre hacia abajo; atravesar = *flick* abajo; 3 botones; **chip contextual de botella** + iconos del HUD; **icono contextual** de interacción; multitáctil con dueño por puntero | «sin joystick visible, sin botón de salto ni de interacción permanentes» | bajo (datos) |
| **DC-27** | Acciones lógicas `left right up down jump attack dash ability bottle interact drop pause`; mapeo inicial PC/gamepad en GAME-SPEC-2D §4.2 (E interactúa, L/Q botella; LT interactúa, LB botella) | «mapping inicial cambiable» | trivial |
| **DC-28** | **Interacción:** icono solo con interacción válida; más cercano con histéresis; táctil = tocar el icono; PC/gamepad = `interact` | mandato | bajo |
| **DC-29** | **Muerte:** estado de muerte → control desactivado → derrota con fundido → reinicio en la entrada de sala (P4) o punto de guardado (P6); **sin pérdidas**; botellas no se rellenan | mandato | bajo (datos) |
| **DC-30** | **Vida** 5 por defecto (configurable); daño estándar 1; knockback y estado `hurt` | mandato | trivial |
| **DC-31** | **Progresión** metroidvania de habilidades y acceso; sin estadísticas; cadena de la slice: sello de energía → Spirit Bolt → Air Dash (anuncio) | mandato | bajo |
| **DC-32** | **Mundo:** `RoomDefinition` ampliada (campos opcionales), transiciones deterministas en ticks, estado por **flags** | reset/carga deterministas | bajo |
| **DC-33** | Primer enemigo **Ink Slime** (FSM completa, *telegraph* de 24 ticks) | «el primer enemigo debe ser sencillo» | bajo (datos) |
| **DC-34** | **Jefe:** arquitectura prevista (fases, patrones, arena); implementación en P6; **no ahora** | mandato | — |
| **DC-35** | **Cámara 2D real**; `CameraRig` conserva la matemática; sin cámara 3D ortográfica; se retiran `projection/fov/pitch/sway/near/far` | mandato | — |
| **DC-36** | **Módulos nuevos** (`presentation`, `abilities`, `interaction`, `i18n`, …) y reglas de dependencia ampliadas en el test de arquitectura | separación clara | bajo |
| **DC-37** | **Migración** por estrangulamiento, pasos S0–S11 y **cortes seguros A/B/C** | riesgo primero, siempre verde | — |
| **DC-38** | **Tests:** los 192 se conservan; 23 se **portan** antes de retirar código; 3 de pose 3D se retiran **porque su comportamiento deja de existir**; los 40 de movimiento son puerta de regresión | no borrar por ser «3D» | — |
| **DC-39** | **WIP `wip/f6-combat-core` intacto** (`b695c98`); se rescata **copiando archivos** desde el commit | mandato | — |
| **DC-40** | Corregir en P5 el dato `magic_attack.implemented: true` (no hay comportamiento) | hallazgo ✅ | trivial · **✅ resuelto en el Prompt 5 (S15, R25):** el comportamiento existe |
| **DC-41** | **No se versionan capturas de otros juegos** (referencias de escenarios) en el repositorio | prudencia de propiedad intelectual | — |
| **DC-42** | Nombres de trabajo: región «Ancient Forest Ruins», enemigo «Ink Slime», habilidad «Spirit Bolt»; son **claves de texto** | cambiar un nombre = editar un catálogo | trivial |

## Decisiones pendientes (ninguna bloquea el Prompt 4; todas tienen valor por defecto)

| ID | Pregunta | Por defecto (si no respondes) | Bloquea |
|---|---|---|---|
| **DP-1** | ¿Quieres ver **tu personaje real** durante el desarrollo? Alternativa a la piel provisional abstracta: **recortes verificados pieza a pieza** de tu hoja, solo uso interno provisional (no son sprites finales) | piel abstracta (DC-13) | nada |
| **DP-2** | ¿Guardo tus **3 imágenes propias** (protagonista, hoja, enemigos) en el repositorio (`docs/reference/`)? Depende de si el repositorio es privado y de quién tiene los derechos | **no** se guardan (solo mediciones y descripciones) | nada (continuidad entre sesiones) |
| **DP-3** | ¿Quién produce los **sprites finales** del protagonista (tú, un artista, otro flujo) y en qué formato/plazo? Los requisitos están en GAME-SPEC-2D §2.5 | se asume entrega futura con ese contrato | **Prompt 7** |

## Mapa de las decisiones D1–D6 de la auditoría

| Auditoría | Resolución |
|---|---|
| D1 dirección 2D | **aceptada** → DC-01 |
| D2 PixiJS v8 | **aceptada** → DC-02 (ADR-0002 pasa a *aceptada*) |
| D3 piel provisional = redibujo vectorial fiel a la silueta | **retirada** (contradice «no redibujes»): sustituida por DC-13 y DP-1 |
| D4 color A (todo rojo) / B (ojos rojos) | **rechazadas ambas** → DC-12 (el protagonista no se recolorea) |
| D5 escala de arte | **precisada** → DC-06 |
| D6 persistencia nativa | **confirmada** → DC-10 |

Las 8 lagunas del brief señaladas en la auditoría (§10.2): botella en táctil → DC-26 · cambiar carta → DC-24 (selector posterior) · números de magia y botellas → DC-23/DC-25 · qué es una mejora → DC-31 · reglas de muerte → DC-29 · agacharse → DC-20 · interacción en PC/gamepad → DC-27 · idiomas → DC-08.

## Consecuencias

- El Prompt 4 puede empezar sin ambigüedad: orden, criterios y límites están en MIGRATION-2D.
- Cualquier decisión cerrada se **revisa cambiando este ADR y el documento afectado en el mismo commit**; los valores marcados «datos» se cambian sin tocar código.
- Quedan **sin verificar** (y no se afirman): iOS y Android reales, rendimiento móvil, audio, gamepad, empaquetado nativo y requisitos de tiendas.
