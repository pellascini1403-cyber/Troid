# Prompt 10 — Producción del arte que falta del protagonista (bitácora)

> **Resumen, sin letra pequeña.** El encargo era **producir los dibujos nuevos** que le faltan al protagonista (el *dash*, el segundo tajo, la agachada, la marcha, el tajo en el aire y agachado, la muerte, beber, interactuar), con el mismo personaje y sin tocar los originales.
> **No se ha podido, y no se ha fingido.** En el entorno de esta sesión **no había ninguna herramienta de generación de imágenes** (solo ImageMagick y `ffmpeg`, que editan píxeles pero no inventan un dibujo; ni GPU ni credenciales de ningún servicio de imágenes). El propio encargo dice qué hacer entonces: **no sustituir lo que falta por polígonos, siluetas dibujadas con código ni más deformaciones de las mismas poses**, completar el diagnóstico y **preparar una entrega de producción concreta**. Eso es lo que hay:
>
> - **0 dibujos nuevos y 0 fotogramas nuevos.** Ningún clip ha dejado de ser un *stand-in* (9 de 18 siguen siéndolo; `walk` sigue siendo un único dibujo deformado). Lo que falta son **46 PNG en 10 clips**, listados uno a uno (§B).
> - **El kit de producción** (`art/player/requests/`): para cada clip, un tablero de referencia hecho con **tus** dibujos sin tocar y con los fotogramas vecinos del juego, un *prompt* listo para pegar (inglés, que es lo que leen los generadores, y su gemelo en español) con el diseño descrito con lo medido, el *prompt* negativo y los requisitos técnicos; más el tablero del personaje y las plantillas del lienzo. Se regenera con `npm run assets:intake -- kit` y una prueba comprueba que lo versionado es lo que producen los datos.
> - **La herramienta que recibe lo que llegue** (`npm run assets:intake`): recorta la hoja, la escala con un único factor por el ojo grande, coloca cada pose, **la comprueba** (halo, piezas sueltas, rojo, color ajeno, escala entre poses, salto de masa, margen, tamaño, espada), escribe la **hoja de contacto comparativa** y, solo si tú aceptas y no hay fallos, la integra por el mecanismo `delivered` que ya existía, **archiva la hoja de la que salió** y **se deshace entera si algo falla**. Probada con **tu hoja real** (encuentra las 12 poses, en orden, en 1 s) y con una **hoja de autoprueba hecha con fotogramas del propio juego** (que **no es arte nuevo**, y la imagen lo dice).
> - **Nada del motor, del cargador, del atlas, de la física, de las colisiones, del daño, de las botellas ni de los controles se ha tocado**: el juego es byte a byte el del Prompt 9. Lo único que cambió en pruebas es que las que contaban los *stand-ins* de memoria **leen ahora el manifiesto**, para que aceptar un clip no ponga la batería en rojo.
>
> **Lo que necesito de ti** (§H): quién genera los 10 clips (un artista, o un generador que acepte imágenes de referencia: **si es un servicio de terceros, tus dibujos salen del entorno, y eso lo decides tú**), el color del filo de la espada (rojo en tus dibujos 7/8, cian en el 12) y si la hoja larga se queda.
>
> Documento técnico: [ART-PIPELINE-2D](ART-PIPELINE-2D.md) parte **O** · cómo entregar: [guía](guides/deliver-protagonist-art.md) §4 («El camino corto») · el kit: [`art/player/requests/README.md`](../art/player/requests/README.md).

---

# Informe final obligatorio (A–F)

## A. Arte producido

| | |
|---|---|
| Poses creadas | **0** |
| Rutas exactas de los PNG nuevos | **ninguna** (no existen) |
| Fotogramas nuevos | **0** |
| Poses descartadas y por qué | las de la hoja del usuario que **no** se usan, y las vías de producción que no se tomaron: abajo |

**Lo que se descartó, y por qué:**

1. **Los dibujos 8, 9 y 10 de la hoja del usuario** (el segundo tajo, la carga cubierta de llamas rojas, el *dash* como una estela roja). Tienen el **rojo fundido con la figura** (el rojo es el 22 % de los píxeles de la pose 8, el 35 % de la 9 y el 41 % de la 10): no se puede separar la figura de su efecto sin **recortar a mano** (inventar dónde acaba el brazo y empieza la llama) ni **recolorear** (la regla: efectos cian, ningún rojo de conveniencia). Se enseñan en los tableros **solo como actitud** («ATTITUDE ONLY», en rojo en el tablero): la postura ancha del 8 para el segundo tajo, el cuerpo estirado del 10 para el *dash*, **sin el rojo**. El 9 («no usable») se enseña solo para que nadie lo reproduzca.
2. **Deformar más los mismos dibujos** (girarlos, aplastarlos, doblar las piernas): es justo lo que hizo el Prompt 9 para los 9 *stand-ins* y lo que el encargo dice que no se repita. Un dibujo se deforma, no se **mira desde otro lado**.
3. **Polígonos, siluetas o «completar» lo que falta con código**: prohibido por el encargo y por el Prompt 9 (inventaría otro personaje).
4. **Un generador de terceros** (el catálogo de *plugins* de la sesión ofrece alguno, no activado: lo tendrías que activar tú) **o una API pública de texto a imagen** (no se ha probado ni usado): cualquiera de los dos habría **sacado tus dibujos del entorno sin que lo hubieras decidido** (para que copie el personaje hay que adjuntárselos); y uno que solo recibe texto no puede copiar un personaje ya diseñado: se desviaría del diseño, que es lo que el encargo manda rechazar.

## B. Estado de los clips

**Ninguno ha dejado de ser provisional.** El mismo reparto del Prompt 9 (`npm run assets:missing` y `npm run assets:intake -- status`):

| Con un dibujo del usuario de esa acción (9) | *Stand-ins*: el movimiento es real, el dibujo es el de otra acción (9) |
|---|---|
| `idle` (dibujo 1) · `walk` (2) · `run` (3) · `jump` (4) · `fall` (5) · `land` (6) · `attack1` (7) · `hurt` (11) · `cast` (12) | `dash` · `attack2` · `aerialAttack` · `crouch` · `crouchWalk` · `crouchAttack` · `death` · `drink` · `interact` |

**Lo que sigue faltando: 46 PNG en 10 clips** (los 9 *stand-ins* y la marcha, que con un solo dibujo en tres cuartos no tiene cruce de piernas). En el orden de producción del encargo, con los nombres del *pipeline* (el encargo decía `attackAir`/`attackCrouch`; los clips son `aerialAttack`/`crouchAttack`):

| | Clip | PNG |
|---|---|---|
| A | `dash` (3) | `dash_00.png` `dash_01.png` `dash_02.png` |
| B | `attack2` (7) | `attack2_00.png` … `attack2_06.png` |
| C | `crouch` (2) | `crouch_00.png` `crouch_01.png` |
| D | `crouchWalk` (4) | `crouchWalk_00.png` … `crouchWalk_03.png` |
| E | `walk` (6) | `walk_00.png` … `walk_05.png` |
| F | `aerialAttack` (6) | `aerialAttack_00.png` … `aerialAttack_05.png` |
| G | `crouchAttack` (6) | `crouchAttack_00.png` … `crouchAttack_05.png` |
| H | `death` (5) | `death_00.png` … `death_04.png` |
| I | `drink` (4) | `drink_00.png` … `drink_03.png` |
| J | `interact` (3) | `interact_00.png` `interact_01.png` `interact_02.png` |

3 + 7 + 2 + 4 + 6 + 6 + 6 + 5 + 4 + 3 = **46**. Cada uno es 280 × 230, RGBA, fondo transparente, pivote (120, 192), 65 px/m, mirando a la derecha, sin efectos, sin sombra y sin rojo; **qué muestra cada uno, cuánto dura, qué fases tiene y qué referencias lo sustentan** está en `art/player/requests/<clip>/brief.md` (y la tabla con los papeles, en [ART-PIPELINE-2D](ART-PIPELINE-2D.md) O.1). Los tiempos pedidos **conservan la duración que el juego da a cada acción** (*dash* 10 ticks = 3 fotogramas a 18 fps; beber 0.4 s; interactuar 0.2 s; muerte 0.71 s; los golpes, las fases de la simulación 3·3·11, 3·4·9 y 4·3·9).

La imagen [`docs/img/prompt10/stand-ins-today.png`](img/prompt10/stand-ins-today.png) enseña **lo que el juego muestra hoy** de cada uno de los 10 clips (los fotogramas versionados, a 1:1): el agachado es el aterrizaje sostenido, el *dash* es la carrera lanzada, el segundo tajo es el primero al revés… Es la prueba de lo que falta, **no arte nuevo**.

## C. Fidelidad visual

- **Los originales, intactos.** `hero-sheet.png` y `hero-portrait.jpg` no se han abierto para escribir: `heroAnimation.test.ts` comprueba su **hash** contra el de la entrega (y pasa), y `git status` no muestra cambios bajo `art/player/source/`. El kit **recorta** la hoja para los tableros (en memoria, para escribir un PNG **nuevo**); no la modifica.
- **No hay dibujos nuevos que comparar** (el original · la pose nueva · la secuencia · el tamaño real de juego): la **hoja de contacto comparativa existe como herramienta**, y lo único que se ha podido mostrar con ella es una **autoprueba** — [`docs/img/prompt10/self-test-contact-sheet.png`](img/prompt10/self-test-contact-sheet.png) — hecha con los fotogramas `attack2_00…06` **del propio juego** (los del *stand-in* del segundo golpe) ampliados ×3 sobre una hoja blanca con sombras de suelo, recortados, escalados por el ojo, colocados y juzgados por la herramienta. **Lleva un rótulo rojo que lo dice: no es arte nuevo.** Sirve para ver que la herramienta devuelve la misma figura (IoU 0.93–0.97 con el original tras alinear el centro de masa; el factor de escala 0.3326 frente a 0.3333 de la ampliación) y que **avisa justo donde debe** (en los dos fotogramas de la preparación, donde la hoja de la espada baja 23 y 32 px por debajo de los pies).
- **Sobre tu hoja real**: [`docs/img/prompt10/cut-of-the-real-sheet.png`](img/prompt10/cut-of-the-real-sheet.png) — el recorte automático encuentra **las 12 poses, en el orden de la hoja**, con sombras, líneas, polvo y energía roja alrededor, y mide el ojo grande en las 12 (33.8–50.4 px: **tus dibujos no están a una escala común**, de modo que la herramienta no usa una constante, §D).
- **La espada en la mano derecha**: no hay fotogramas nuevos con espada. Para los que lleguen, la herramienta exige **en cada fotograma** la empuñadura y la punta (que se leen sobre una cuadrícula en píxeles), calcula `hand_r = weapon_grip`, comprueba que ambos puntos caen **sobre la figura** y que la hoja mide lo que la del juego (0.93 m, admitido 0.6–1.3), y dibuja el agarre (amarillo) y la punta (magenta) en la hoja de contacto: **que está en la mano derecha lo mira una persona sobre esa hoja** (no se puede medir).
- **Reproducción dentro del juego**: los clips existentes se siguen reproduciendo por el estado real (`player-anim`, §E); **no hay secuencias nuevas que inspeccionar**.

## D. Integración

**Lo que NO cambió** (y por eso la simulación y el juego son idénticos): `src/` entero, `public/art/` entero, `art/player/hero/` (los 114 fotogramas), `art/player/player.pack.json`, `art/player/source/hero.rig.json` (`delivered` sigue siendo `[]`), `hero.poses.json` y la hoja. `?visual=auto|art|placeholder` y `?lab=player` se comportan como en el Prompt 9 (los comprueban `player-art`, `player-lab` y `fallbacks`). No se ha tocado la física, las colisiones, el daño, las habilidades, las botellas, los *checkpoints* ni los controles táctiles, y **no se ha reescrito el motor ni el cargador ni partido el atlas**.

**Lo que se añadió (todo en `tools/`, `art/player/requests|inbox`, `tests/`, `docs/`):**

| Archivo | Qué es |
|---|---|
| `tools/assets/figure.ts` | lo que se puede medir de una figura: el ojo grande, el cuerpo (centro de masa, suelo), la limpieza (halo, sueltos, rojo, color ajeno) — calibrado con los 114 fotogramas |
| `tools/assets/intake.ts` | el núcleo puro: recorte de la hoja, escala por el ojo, colocación, juicio, anclas de la espada |
| `tools/assets/intakeReport.ts` | la hoja de contacto comparativa, la cuadrícula de anclas, el dibujo del recorte fallido y el informe |
| `tools/assets/intakeRun.ts` | los archivos: leer la bandeja, preparar, escribir el informe, **aceptar** (con reversión), archivar, estado |
| `tools/assets/intake-cli.ts` | `npm run assets:intake -- status \| kit [--check] \| <clip> [--scale k] \| <clip> --accept [--replace]` |
| `tools/assets/kit.ts`, `bitmapFont.ts`, `heroRepo.ts` | el kit (tableros, *briefs*, plantillas), su tipografía de 5 × 7 sin archivos de fuente, y dónde vive el protagonista |
| `art/player/requests/**` (24 archivos) | **el kit**: `requests.json` (los datos: 10 clips, 46 fotogramas), `README.md`, `character-reference.png`, `canvas-template(-idle).png` y, por clip, `brief.md` + `reference.png` |
| `art/player/inbox/` | la bandeja de entrada (`README.md`); lo que se suelte dentro **no se versiona** (`.gitignore`) |
| `tests/unit/tools/figure.test.ts`, `intake.test.ts` | **+42 pruebas** (§E) |
| pruebas y E2E adaptados | `heroAnimation.test.ts`, `artRepo.test.ts`, `heroPlayback.test.ts` y `player-anim` **leen el manifiesto y `delivered`** en vez de contar los *stand-ins* de memoria: comportamiento idéntico hoy, y aceptar un clip ya no las pone en rojo |
| `docs/…` | esta bitácora, la parte O de ART-PIPELINE-2D, la guía de entrega (§4, «El camino corto»), README, ROADMAP, y `docs/img/prompt10/` (3 imágenes) |

**Decisiones de diseño que importan:**

1. **La escala se mide, no se asume.** El ojo grande mide **25.1 px** en el idle, 24.2 en la marcha, 23.1 en la carrera, 20.3–22.0 en los tajos, 19.5 en la agachada, 18.7–19.4 en el aterrizaje y **16.9 en la caída**: los dibujos del usuario **no están a una escala común**, así que no existe «el tamaño del ojo». Cada clip nuevo se lleva a lo que miden los fotogramas del clip con el que se encadena en el juego (`scaleLike`: `dash`→`run`, `attack2` y `aerialAttack`→`attack1`, `death`→`hurt`, el resto→`idle`), con **un factor por hoja**.
2. **El centro de masa del cuerpo en la columna 120** (torso y cabeza, sin la espada ni las antenas: es donde está centrada la caja del jugador) y **lo más bajo de la figura en la fila 192**. En los fotogramas del juego, lo más bajo de una pose de tajo es a veces la punta de la espada y no el pie (la hoja baja 5–20 px por debajo de las botas): la herramienta **avisa** cuando lo más bajo no es el cuerpo, y `placement.json` permite bajar el fotograma a mano.
3. **El golpe tiene que hacer lo que el encargo dice.** Lo único que el escenario E2E `player-anim` exige del *contenido* de un golpe es que **el segundo suba** (la punta, ≥ 0.4 m entre la preparación y la fase activa): una hoja de generador con un segundo golpe horizontal o descendente pasaría todas las medidas de limpieza y fallaría ahí, tarde. Por eso `requests.json` lleva la `intent` de cada golpe (el segundo **sube**, el tajo en el aire **baja**) y la herramienta la comprueba con las anclas: el segundo golpe que no sube es un **fallo** (no se puede aceptar); el tajo en el aire que no baja, un aviso.
4. **La espada necesita a una persona.** La hoja es oscura y está pegada a un cuerpo oscuro: detectarla sola sería adivinar. Se leen **dos puntos por fotograma** sobre una cuadrícula y la herramienta deriva el resto con las proporciones del rig del primer tajo.
5. **Nada se acepta sin haberse enseñado.** `--accept` solo acepta lo que enseñó el último informe (*hashes* de fotogramas y anclas), sin ningún fallo, y **nunca sobrescribe un clip ya entregado** (`--replace`, a propósito). Si falla después de escribir el primer archivo, **devuelve todo a como estaba** (lo prueba un test que sabotea el generador).
6. **Lo versionado es producto de una hoja.** Al aceptar, la hoja, las anclas, el ajuste y el informe se archivan en `art/player/source/delivered/<clip>/`: los mismos orígenes dan los mismos fotogramas.

## E. Regresión

Todo se ejecutó en esta sesión, en este orden, y **esto es lo que salió**:

| Comprobación | Resultado |
|---|---|
| `npx tsc --noEmit` | limpio |
| `npx vitest run` (unitarias + integración) | **164 archivos · 2575 pruebas, todas en verde** (el Prompt 9: 162 · 2533; **+2 archivos · +42 pruebas**: `figure.test.ts` 7, `intake.test.ts` 35); ~130 s |
| `npm run assets:check` · `npm run assets:verify` | **art: OK** las dos |
| `npx tsx tools/assets/animate-cli.ts --check` | «the frames are what the sheet, the rig and the clips produce» (5.5 s) |
| `npm run assets:intake -- kit --check` | «the kit is what the requests and the sheet produce (24 files)» |
| `npm run assets:missing` | de los 15 clips que pide el juego: 7 con dibujo propio y **8 *stand-ins*** (sin cambio; con `crouchWalk`, 9 de los 18 clips), 14 de 14 piezas del entorno |
| `npm run build` | verde (tsc + `assets:check` + vite build, 32 s) |
| `npm run bench:bundle` | arranque en frío de R1: **195.8 KB gz** (625.9 KB sin comprimir, 35 *scripts*) — **idéntico al Prompt 9**; la primera sesión entera, 236.9 KB gz (40 *scripts*); las imágenes del arte que espera el primer cuadro: 7 archivos, 4135 KB; el primer cuadro (telón levantado) a los **3399 ms** en esta máquina con un servidor local |
| E2E (Chromium sin cabeza; `npm run test:e2e -- --only=player-anim,player-art,player-lab,fallbacks,sprites,assets`) | **desarrollo: 6 escenarios, todos en verde** (assets 9.8 s · player-art 16.9 · player-anim 11.6 · player-lab 6.6 · sprites 3.9 · fallbacks 27.3). **producción (`--prod`, sobre el `dist` recién construido): 6 escenarios, todos en verde** (5.4 · 12.7 · 9.3 · 8.4 · 4.8 · 21.5; en `fallbacks`, 4 salas × 3 pieles con el mismo resultado de la partida y 18 llamadas de dibujo como máximo, presupuesto 60). Se ejecutaron **los escenarios que tocan al protagonista y al arte**, no los 49: `src/` y `public/` están intactos (`git diff --stat -- src public` vacío), así que los otros 43 no pueden haber cambiado |

**«Aceptar un clip no pone la batería en rojo» — comprobado, no supuesto.** Las pruebas que describían el estado de los *stand-ins* de memoria se adaptaron para leer el manifiesto y `delivered` (`heroAnimation`, `artRepo`, `heroPlayback`, `animate`, `figure`, `intake` y el escenario `player-anim`). Para saber si bastaba, se hizo el experimento entero en una **copia completa del repositorio** (fuera de él): se entregaron por la herramienta, **con `public/art` reempaquetado y las comprobaciones de arte completas**, dos clips **sintéticos** hechos con fotogramas del propio juego —`attack2` (7 fotogramas, con anclas de espada) y `dash` (3, ya de 280 × 230)— y se pasó la batería sobre el resultado.

- **Unitarias**: 163 de 164 archivos, 2570 de 2573 pruebas en verde; las 3 que fallaron eran las del propio flujo de aceptación de `intake.test.ts`, que suponían que `attack2` seguía pendiente: se parametrizaron (ahora entregan el primer golpe con espada que se siga pidiendo y reemplazan el primero cuando ya no quede ninguno) y se re-ejecutaron en esa copia: 5 archivos, 60 pruebas, en verde.
- **E2E**: en la primera pasada `player-anim` falló en **una sola aserción**, «el segundo golpe sube»: aquel `attack2` sintético estaba hecho con los fotogramas del primer golpe (que baja). No era una rotura sino **el único requisito de *contenido* que el E2E exige a un golpe, que la herramienta no conocía**: desde entonces `requests.json` lleva la `intent` de cada golpe y la recepción la comprueba con las anclas (§D, decisión 3), de modo que un segundo golpe que no sube se rechaza **antes** de aceptarse. En la segunda pasada, con el `attack2` hecho de los fotogramas del propio *stand-in* (que sí sube) y el `dash`, **`player-art`, `player-anim`, `player-lab` y `fallbacks` pasaron en la copia** (20.2 · 11.3 · 6.7 · 26.5 s; en `fallbacks`, 18 llamadas de dibujo como máximo).

**Esos clips sintéticos no están en el repositorio** (ni son arte): la copia se desechó.

**Atlas, *bundle*, memoria y tiempos de carga: sin cambio, y es lo que debe ser** — no entró ni un píxel nuevo: `git diff --stat -- src public` está **vacío**. El atlas del héroe sigue en `public/art/player/hero_0.png`: **1 761 969 bytes (1.76 MB)** en disco y **6993 KB decodificados** (114 fotogramas), el arranque en frío **195.8 KB gz**, el presupuesto de memoria de la zona **40 MiB** (el Prompt 9 midió R4 en 35.9 MiB) y la carga en frío medida en el Prompt 9 (8.8–10.0 s a 600 KB/s) **no han cambiado**. **Lo que sí cambiará cuando entren los dibujos** (y no se esconde): los 10 clips pasarán de 65 fotogramas (los de hoy) a 46, así que el atlas del héroe **tenderá a bajar** (95 fotogramas en vez de 114), pero un dibujo de cuerpo entero con poco alfa vacío pesa más que uno deformado en un lienzo grande: hay que **medirlo entonces**, con los dibujos reales, y decir si empeoró.

**Conocidos, sin resolver:** nada visto en un **dispositivo real** (ni iPhone ni iPad: todo se midió en Chromium sin cabeza, con GL por software); el peso del atlas del héroe en el camino crítico del arranque (1.76 MB) sigue siendo del Prompt 9; y **la herramienta de recepción no se ha probado con una hoja de un generador real** —no ha habido ninguna—: se probó con tu hoja (recorte y escala) y con una autoprueba. Un generador real traerá cosas que aquí no se han visto (otro fondo, un ojo dibujado distinto, poses pegadas): **la herramienta está hecha para negarse y decir por qué** (`segmentation.png`, `--scale`, avisos), no para adivinar.

## F. Estado de Git

- Rama: `claude/troid-vertical-slice` (sin PR: no se ha pedido). Parte de `abc66cf` (Prompt 9), con el árbol limpio al empezar.
- Las ramas remotas `archive/proto-3d-f5` (`ac74b46`) y `wip/f6-combat-core` (`b695c98`) no se han tocado.
- El commit de este prompt, su *hash* y la confirmación del *push* están en el informe de la conversación (un *hash* no puede ir dentro del propio commit): `git log -1` en la rama.

---

# Cómo se hizo

## Fase A — qué falta, y qué espera el *pipeline*

Se inspeccionaron `docs/guides/deliver-protagonist-art.md` §4, `art/player/source/hero.rig.json` (con `delivered`, el mecanismo del Prompt 9), los 114 fotogramas de `art/player/hero/`, el manifiesto, `tools/assets/animate.ts` y `heroAnimation.ts` (qué hace el generador con un clip entregado: no lo hace, no borra sus fotogramas, conserva su entrada tal cual), los validadores (`validateSpriteSet`: `weapon_tip`, `weapon_grip` y `hand_r` en **cada** fotograma de un golpe, el agarre a ≤ 0.04 m de la mano) y la evidencia del Prompt 9. De ahí salen **los requisitos que espera el *pipeline***:

- **Lienzo** 280 × 230 RGBA, transparente, pivote (120, 192) = punto medio de los pies en la fila 192, 65 px por metro, margen ≥ 4 px, el arte mira a la derecha (el motor espeja), sin efectos, sin sombra, sin suelo. Nombres `<clip>_NN.png` de dos dígitos, desde `00`, sin huecos, con el nombre del *pipeline* (`CLIP_ORDER`).
- **Entrada del manifiesto** `{ frames, count, fps, loop, phases?, tags, comment }` (sin `stand-in`); anclas por fotograma **en metros desde el pivote** (+x adelante, +y arriba) en `frames`; los golpes necesitan `phases` que cubran todos los fotogramas.
- **Lo que fija el juego y no se toca**: las fases de los golpes (3·3·11, 3·4·9, 4·3·9 ticks), las cajas de daño, el *dash* de 10 ticks, el canal de beber de 24, la interacción de ≤ 12, la altura del cuerpo agachado (1.0 m; de pie 1.7 m).

La lista interna de poses que faltan, con todo esto por clip, es `art/player/requests/requests.json`.

## Fase C — el método, y lo que se averiguó

**Herramientas realmente disponibles**: ImageMagick (`convert`, `montage`, `identify`, `composite`) y `ffmpeg`, **que editan**; Python 3 sin librerías de imagen; Node con el PNG de `tools/assets/png.ts`; sin GPU, sin modelos locales, sin credenciales. Nada que **genere**. Por tanto, según el encargo: no fingir, no sustituir, completar el diagnóstico y preparar la entrega — y la entrega es lo que el encargo enumera (*archivos de referencia organizados, la lista exacta de PNG, un prompt específico por pose, los requisitos técnicos de integración*) más lo que lo hace **utilizable sin trabajo manual repetido**: la recepción.

**El *prompt***: describe el diseño con lo **medido** (cabeza ≈ 55–60 % de la altura, ojos con tres reflejos —uno grande y dos pequeños—, antenas finas con un gancho, armadura negra y azul marino con líneas cian, paletas en hexadecimal tomadas de los fotogramas), prohíbe lo humano (pelo, cara, máscara, ropa, piel), todo efecto y el rojo, pide una hoja con huecos anchos y **todas las poses a la misma escala**, y manda adjuntar tres cosas (el tablero del clip, el tablero del personaje y el retrato). El tablero del clip **marca en rojo** los dibujos que solo valen como actitud.

## Fase D — validar cada dibujo (como herramienta)

Las comprobaciones, con sus umbrales (todos en una tabla, `LIMITS`, y todos **calibrados con los 114 fotogramas**, que pasan con mucho margen: halo ≤ 1.2 %, sueltos 0 %, rojo ≤ 0.45 % —el borde rojo oscuro finísimo de la espada—, color ajeno ≤ 0.07 %), están en [ART-PIPELINE-2D](ART-PIPELINE-2D.md) O.5. Lo que **no se puede medir** y se mira en la hoja de contacto: que es **el mismo personaje**, que no hay partes duplicadas ni miembros imposibles, que la espada está en la **mano derecha** y que la acción **se lee** a tamaño de juego.

**La hoja de contacto comparativa** que pedía el encargo (1 el dibujo original relevante · 2 la pose nueva · 3 la secuencia resultante · 4 el tamaño real de juego) se escribe en `art/player/inbox/_reports/<clip>/contact.png`, con la secuencia nueva **contra la que el juego tiene hoy** y el clip vecino al lado para comparar el tamaño.

## Fase E — integrar

Por el mecanismo `delivered` que ya existía (§D, punto 4 de ART-PIPELINE-2D O.7): ningún sistema nuevo, ningún cambio en el generador, el cargador ni el motor, y **el generador no sobrescribe un dibujo aprobado**. La prueba de integración hace una entrega entera en una **copia** del repositorio: informe → rechazo sin anclas → rechazo si la entrega cambió → aceptación → el generador (`assets:animate --check`: 0 diferencias) y las comprobaciones de arte de todo `art/` (`buildArt`) no encuentran nada que corregir → archivo → se niega a sobrescribir → reversión completa cuando el generador falla.

## Evidencia

| Imagen | Qué es | Qué NO es |
|---|---|---|
| [`stand-ins-today.png`](img/prompt10/stand-ins-today.png) | los fotogramas **versionados** de los 10 clips que faltan, a 1:1 (lo que el juego muestra hoy) | arte nuevo |
| [`self-test-contact-sheet.png`](img/prompt10/self-test-contact-sheet.png) | la hoja de contacto de la herramienta sobre una **autoprueba** (`attack2_00…06` del juego, los del *stand-in*, ampliados ×3 con sombras) | arte nuevo (lleva un rótulo rojo que lo dice) |
| [`cut-of-the-real-sheet.png`](img/prompt10/cut-of-the-real-sheet.png) | tu hoja real con las 12 poses que el recorte automático encuentra, numeradas | una modificación de tu hoja (es una copia en memoria con cajas dibujadas encima) |

Los tres se regeneran con el *script* de laboratorio `tools/e2e/.lab/p10-evidence.ts` (local, no versionado, como los del Prompt 9); lo versionado y repetible es el kit y la herramienta (`npm run assets:intake -- kit`, `-- <clip>`) y las pruebas. El kit (`art/player/requests/`) es, además, evidencia por sí mismo: `character-reference.png`, `dash/reference.png`… son lo que se adjunta a un generador.

## H. Lo que sigue (y las decisiones que no son mías)

1. **Generar los 10 clips**, uno por hoja, con el `brief.md` de cada uno (orden A→J del encargo). Quién: un artista, o un generador que acepte **imágenes de referencia** (sin ellas inventa otro personaje). **Si es un servicio de terceros, tus dibujos salen del entorno: lo decides tú**; no se ha activado ninguno.
2. **Color del filo de la espada.** En tus dibujos 7 y 8 el filo es **rojo**, en el 12 es **cian**; el encargo dice que los efectos son cian y que no se pinte rojo «por conveniencia». Los *prompts* piden **el filo de la referencia** (el que ya tiene el juego, con un borde rojo oscuro finísimo) y **ningún rojo de efecto**. Si quieres el filo cian, **hay que decirlo antes de generar**.
3. **Largo de la espada.** Es **larga** en los dibujos (0.93 m, casi lo que mide la figura) y el encargo la describe pequeña. No se ha tocado (acortarla con código sería cambiar el dibujo): si el diseño la quiere más pequeña, se redibuja.
4. **Cuando lleguen**: `npm run assets:intake -- <clip>` → mirar `contact.png` → (golpes) escribir `anchors.json` → `--accept`. Y entonces **medir de nuevo** el atlas del héroe, la memoria y la carga con los dibujos reales, y mirarlos **en un teléfono**: nada de esto se ha visto en un dispositivo real.
