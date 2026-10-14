# Prompt 9 — animación de producción del protagonista

> **Qué es esto.** El encargo del Prompt 9 es que el protagonista sea **un personaje visualmente terminado, con animaciones reales integradas en el juego**, **respetando estrictamente el diseño original**: tus dos imágenes
> (`art/player/source/hero-sheet.png` y `hero-portrait.jpg`, guardadas bit a bit) son la **fuente de verdad**; no se rediseña, no se recolorea, no se deforma como estilo y no se reinterpreta (diseño oscuro, proporciones estilizadas, acentos
> azul/cian, la espada en la mano derecha; Hollow Knight y Solo Leveling como **lenguaje**, nunca como copia). **Un clip no se llama animado si solo mueve, rota, escala o parpadea un sprite quieto**; no se inventan detalles; si el material no
> alcanza, se hace **la mejor solución compatible y se dice la limitación**; y no se simula la generación de imágenes con polígonos hechos por código. Fases: **A** inspección y estrategia · **B** producción por prioridad · **C** integración por el *pipeline*
> existente · **D** pruebas y evidencia · **E** documentación, *commit* y entrega.
>
> **Alcance.** Solo el protagonista. No se tocó nada de las salas, el jefe, el audio, la monetización ni funcionalidades nuevas; ni controles, combate, progresión, guardado o balance; **ni tiempos, colisiones, daño, magia ni enemigos**.

## Resultado en una frase

El protagonista **se mueve de verdad**: **114 fotogramas en 18 clips**, hechos **moviendo los píxeles de tus dibujos** (una deformación rígida y suave guiada por puntos de control, más una pieza rígida para la hoja de la espada), por el mismo camino de siempre y sin tocar el
motor. **9 clips tienen un dibujo tuyo de esa misma acción; 9 son *stand-ins*** (el movimiento es real, el dibujo es el de otra acción, porque la hoja no tiene uno): **eso es lo que separa esto de un protagonista terminado**, y se dice clip por clip.
**No se ha dibujado ningún píxel.**

## Fase A — qué había y qué estrategia

**Qué había (Prompt 8):** 16 fotogramas —**uno por clip**—, de la hoja de poses de concepto; 7 de los 15 clips con su pose y 8 *stand-ins*; el protagonista **posaba**, no se movía.

**La hoja:** 12 poses, de las que **9 se pueden separar limpiamente** (1 de pie, 2 de pie en tres cuartos, 3 la carrera, 4 subiendo, 5 cayendo, 6 el aterrizaje, 7 el tajo bajo, 11 golpeado, 12 la espada en alto) y **3 no** (8, 9 y 10: el rojo es parte
del dibujo). La pose **2**, que ningún estado usaba, es el dibujo de la **marcha**.

**Opciones consideradas** ([ART-PIPELINE-2D](ART-PIPELINE-2D.md) §N.1):

| Opción | Veredicto |
|---|---|
| Dibujar o re-dibujar fotogramas con código | Descartada por la regla: sería inventar un personaje que no es el tuyo |
| Generar imágenes con un modelo | Descartada: no hay uno en el entorno, y reinterpretaría el diseño |
| Recortar el dibujo en piezas (brazo, pierna) y girarlas | Descartada: lo que una pieza tapa no está en la imagen y habría que inventarlo. **Solo se hace con la hoja de la espada**, que está sobre fondo transparente |
| Mover, girar o escalar el dibujo entero | No es animar (lo dice el encargo) |
| **Deformación rígida por puntos de control (*puppet warp*) de tus píxeles, una capa rígida para la espada y secuenciar tus propios dibujos** | **Elegida**: mueve los píxeles que hay y no inventa ninguno |

**La limitación que sale de ahí, dicha desde el principio:** un dibujo **se puede deformar, no se puede mirar desde otro lado**. No hay cruce de piernas al andar, ni una mano que se abre, ni una espalda, ni una pose nueva (agacharse, morir, beber). Para eso hace
falta **el dibujo** y es lo que piden los 9 *stand-ins*.

## Fase B — producción

**Herramientas nuevas** (`tools/assets/`, todo puro y determinista; mismos datos, mismos píxeles):

| Archivo | Qué es |
|---|---|
| `warp.ts` | El *puppet warp*: mínimos cuadrados móviles **rígidos** (Schaefer et al. 2006, α = 1.5), calculado hacia atrás, con interpolación bilineal premultiplicada y área de 3 × 3 muestras. Identidad con ningún punto movido; un punto va donde se pide; **lo transparente sigue transparente** |
| `heroRig.ts` | El rig: puntos de control, grupos jerárquicos con pivote, `pivotCcw` (la bisagra gira sobre su esquina), anclas que siguen a su grupo, los ojos atenuables (solo `death`), `ground`, capas rígidas |
| `heroClips.ts` | Los 18 clips: qué dibujo es cada fotograma y cuánto se mueve cada grupo (curvas: una respiración es un coseno, un vaivén se retrasa) |
| `heroAnimation.ts`, `animate.ts`, `animate-cli.ts` | La parte pura y la herramienta (`npm run assets:animate`, `-- --check`); comprueba el margen del lienzo y escribe los fotogramas y el manifiesto |
| `art/player/source/hero.rig.json` | **Datos**: los puntos de control de cada uno de los 9 dibujos (medidos sobre el dibujo) y el lienzo (280 × 230, pivote 120, 192, 65 px/m) |

**Los 18 clips, por prioridad del encargo** (tabla completa en §N.4 de ART-PIPELINE-2D):

| Prioridad | Clips | Con dibujo propio | *Stand-ins* |
|---|---|---|---|
| **1** idle · walk · jump · fall | `idle` 8, `walk` 8, `jump` 6, `fall` 4 (+ `run` 8, `land` 4) | los cuatro (y `run`, `land`) | — |
| **2** dash · attack1 · attack2 · attackAir | `attack1` 7, `dash` 4, `attack2` 8, `aerialAttack` 7 | `attack1` | `dash`, `attack2`, `aerialAttack` |
| **3** crouch · attackCrouch · hurt · death · cast · drink · interact | `hurt` 5, `cast` 7, `crouch` 6, `crouchAttack` 7, `death` 9, `drink` 6, `interact` 4 (+ `crouchWalk` 6) | `hurt`, `cast` | `crouch`, `attackCrouch`, `death`, `drink`, `interact` (+ `crouchWalk`) |

**Lo que fue mal en el camino, y cómo se arregló** (sin un orden estricto):

1. **La espada se doblaba como una serpiente**, dejaba una **copia fantasma** y **emborronaba la cabeza** al girar el brazo con el *warp* solo: una hoja **no se dobla, gira**. Solución: **pieza rígida** (el polígono de la hoja sobre el fondo transparente se corta, se gira entera sobre la empuñadura y se pone encima) con
   `pivotCcw` (la bisagra gira sobre la esquina en la que cierra, y no abre un hueco); y las anclas siguen a la hoja.
2. **Las antenas de `fall` se retorcían** (un clavo suelto, `cape2`, caía sobre una antena): puntos densos a lo largo de las antenas y se quitó el clavo.
3. **La muerte se cortaba por abajo** (el cuerpo tumbado se salía del lienzo): se dibuja en un lienzo con 128 filas más, se busca la fila más baja con cuerpo, se apoya en el pivote y se recorta.
4. **La generación tardaba 405 s** (3.3 s por fotograma): rejilla del mapa en las esquinas de cada píxel, pesos baratos y salto de los píxeles vacíos → **6 s** para los 114.
5. **Demasiado peso** (8.3 MiB y 2.15 MB de PNG a escala 0.55): escala 0.5, lienzo 280 × 230, menos fotogramas por clip → **7.0 MiB** y **1.76 MB**.
6. **`attack2` tenía 8 fotogramas y las fases cubrían 7**: fases explícitas (recuperación 4–7); lo atrapó `heroPlayback.test.ts`.
7. **La marcha saltaba al cortar desde el *idle*** (el centro de masa de los dos dibujos no coincidía): el pivote del dibujo 2 se movió para alinear los centros (`feet` 74 → 90) y se midió con la hoja de «fantasmas».
8. **`drink` e `interact` flotaban 1 px**: `ground: true` los apoya sobre el pivote.

## Fase C — integración

**Por el mismo camino de siempre** (`art/` → manifiesto → `assets:check` → `assets:pack` → `public/art/` → `ArtLibrary` → `PlayerVisualSwitch`), y con **el motor intacto**: ni `SpriteAnimator`, ni los estados, ni las fases, ni `deriveAnimation`, ni el
cambio de piel (`?visual=auto|placeholder|art`), ni el laboratorio (`?lab=player`), ni `assets:missing` cambiaron. Lo único nuevo en `src/` es **un gancho de pruebas** (`window.__troid.advanceAnimation`: el reloj de animación sigue al tiempo real y está quieto
mientras el juego está en pausa o en *hit-stop*; las pruebas lo avanzan a mano). **La simulación no sabe nada del dibujo**: el mismo guion de teclas con el arte, con el camino de vuelta y con solo el arte da la misma simulación, *tick* a *tick*.

| Cambio | Por qué |
|---|---|
| `package.json`: `assets:poses` → **`assets:animate`** | el generador de un fotograma por clip se sustituye por el del rig |
| `src/presentation/stressModel.ts`: presupuesto de memoria de la **zona 32 → 40 MiB** (arranque 24 y residente 96 sin cambio) | el héroe pasó de 1.6 a **7.0 MiB** decodificados; R2 con él **supera** 32 (34.8). Se **propone** el nuevo presupuesto con su motivo en el comentario; el peor caso (R4, 35.9 MiB) queda por debajo |
| `tools/assets/missing.ts` | el texto de los *stand-ins*: ahora dicen que **se mueven** («made by moving ANOTHER action's drawing») |
| **`delivered`** en `hero.rig.json` + `assets:animate` | el día que un *stand-in* reciba su dibujo, el generador **no lo borra ni lo toca** (antes habría borrado `art/player/hero/` entera) y conserva su entrada del manifiesto |
| retirados `heroFrames.ts`, `poses-cli.ts`, `heroFrames.test.ts` | los sustituye `animate*` |

**Pruebas que se adaptaron** (suponían un fotograma por clip o el presupuesto de 32): `artRepo.test.ts` (los clips con dibujo propio y los *stand-ins* se cuentan distinto: 18 clips), `missing.test.ts` (el texto), `stressModel.test.ts` (zona 40), el escenario `room-art`
(lee el presupuesto en vez de una constante) y `player-art` (sección E: «un fotograma del clip», no «el fotograma 0»).

## Fase D — pruebas, regresión y evidencia

### Pruebas nuevas

| Archivo | Pruebas | Qué fija |
|---|---|---|
| `tests/unit/tools/warp.test.ts` | 8 | identidad · el punto va donde se pide · movimiento rígido · píxeles enteros sin pérdida · determinismo · lo transparente es negro transparente · la media escala equivale a promediar por área · transformaciones |
| `tests/unit/tools/heroRig.test.ts` | 9 | la pieza cortada es una **partición** · la hoja gira sin doblarse (recta, la misma longitud, la bisagra quieta) · `over`/`under` · la figura tumbada reposa sobre el pivote · las anclas la siguen · los ojos solo se atenúan |
| `tests/unit/tools/heroAnimation.test.ts` | 11 | **los originales intactos (hash)** · los dibujos son los píxeles de la hoja **al bit** · los 18 clips con los fotogramas de la tabla · **el ojo grande conserva su tamaño y su color en los 114 fotogramas** (la muerte lo apaga, a propósito) · **cada clip está de verdad en movimiento** y el bucle cierra sin salto · los pies sobre el pivote y sin tocar el borde · **la espada en la mano en los cuatro golpes** · cada fotograma de un golpe se ve ≥ 1 *tick* · cada clip dura lo que la acción en el juego · los *stand-ins* lo dicen y dicen por qué · **lo versionado es lo que producen la hoja, el rig y los clips** |
| `tests/unit/tools/animate.test.ts` | 4 | la herramienta sobre una copia: escribe, y una desviación de cada tipo (un archivo de más, un fotograma que falta, un manifiesto cambiado) · **un clip entregado a mano no se hace ni se borra y lo demás sale idéntico byte a byte** · lo que falta o sobra de un clip entregado · lo que se rechaza |
| `tests/unit/presentation/heroPlayback.test.ts` | 8 | el manifiesto que el juego descarga · **qué clip pinta cada estado** (nunca un *fallback*) · la marcha en orden y a su ritmo · la cadencia sigue a la velocidad · las acciones de una vez · **las fases de un golpe** · la duración contra el *gameplay* |
| E2E `player-anim` (dev y prod) | 1 (6 secciones) | el héroe de verdad con el arte del repositorio, en el navegador (§N.8) |

### Regresión

| Comprobación | Resultado |
|---|---|
| `npx tsc --noEmit` | ✅ sin errores |
| `npx vitest run` | ✅ **162 archivos · 2533 pruebas** (Prompt 8: 158 · 2504: +40 nuevas, −11 de `heroFrames` retiradas) en ~55 s |
| `npm run assets:animate -- --check` | ✅ «the frames are what the sheet, the rig and the clips produce» |
| `npm run assets:check` · `assets:verify` | ✅ `art: OK` (11 paquetes, 7000 KB en disco y 47 545 KB descomprimidos) |
| `npm run assets:missing` | el protagonista: **7 de 15 clips con dibujo propio, 8 *stand-ins*, nada con el *placeholder*** (el entorno: 14 de 14 piezas obligatorias) |
| `npm run build` (`tsc` + `assets:check` + `vite build`) | ✅ |
| `npm run bench:bundle` | **JavaScript del arranque en frío 195.8 KB gz (idéntico al del Prompt 8)** · *chunks* cosméticos 41.1 KB gz · primera sesión 236.9 KB gz. **Imágenes que espera la primera imagen: 4135 KB (antes 2746): +1.4 MB, todo el atlas del héroe** |
| E2E en **desarrollo** | ✅ **49 de 49** (los 48 de siempre + `player-anim`) |
| E2E en **producción** (`--prod`, contra `dist/`) | ✅ **49 de 49** |
| Llamadas de dibujo (peor momento) | desarrollo ≤ **25** (`soak`; el jefe y el final, 22; las salas, 13–20) · producción **23–25** (`soak`: 23, 23, 23 en tres ejecuciones aisladas y 25 en la cadena completa; el Prompt 8 dio 23): **sin cambio** dentro de lo que varía una ejecución de otra |
| Memoria del arte residente | R1 **29.0** · R2 **34.8** · R3 **32.7** · R4 **35.9 MiB** (Prompt 8: 23.7 · 29.5 · 27.4 · 30.6); presupuesto propuesto de la zona **32 → 40 MiB** |
| Arranque en frío con la red a 600 KB/s | telón levantado a los **8.8–10.0 s** (tres arranques, razón `art`); Prompt 8: 6.4–7.8 s |
| Sin arte (`fallbacks`: tres pieles × cuatro salas) | ✅ la partida acaba igual con todas las pieles o con ninguna |

**Qué se encontró y cómo se resolvió en la regresión:**

1. El E2E **`player-art`** (sección E, el arte del repositorio) fallaba porque suponía **un fotograma por clip** (`idle_00`, `walk_00`…): se adaptó a «un fotograma del clip» (ocho de `idle`, ocho de `walk` o `run`, siete de `attack1`, seis de `crouch`…) y se volvió a pasar en desarrollo y producción.
2. El presupuesto de memoria de la **zona (32 MiB)** se pasaba en R2: se **propone 40 MiB** con su motivo (§N.7) en vez de esconder el exceso.
3. **El coste que no es un fallo pero se paga**: +1.4 MB de PNG en el camino crítico y ~2.3 s más de telón a 600 KB/s (§N.7, §N.9). El JavaScript no creció.
4. Las llamadas de dibujo del `soak` en producción dieron 25 una vez en la cadena y 23 las tres veces que se repitió aislado: el héroe es **una** página de atlas como antes, y la cifra varía de una ejecución a otra en ±2 (en el Prompt 8 se vieron 22, 23 y 23 en producción y 25 en desarrollo).
5. **No hubo ninguna regresión de simulación**: los 48 escenarios previos (`movement`, `combat`, `touch`, `mobile`, `boss`, `finale`, `soak`…) pasan sin tocar una aserción de juego; solo `player-art` (suposición de un fotograma) y `room-art` (la constante del presupuesto) cambiaron.

**Lo que no se pudo ejecutar** (dicho exactamente): **nada en un dispositivo real** (ni iPhone, ni iPad, ni Android; ni con un mando físico); todo es Chromium sin cabeza con GL por **software** (SwiftShader), que mide llamadas de dibujo, bytes y cuándo se enseña qué fotograma, **no milisegundos de GPU ni la sensación del movimiento en una mano**; y **ninguna persona** (artista ni jugador) ha mirado las animaciones: las miró quien las hizo, con las hojas de contacto y las capturas de abajo.

### Evidencia

Todo está en el repositorio, en **`docs/img/prompt9/`** (5.2 MB), salvo lo que dice «lo regenera»:

| Qué | Dónde | Qué se ve |
|---|---|---|
| **Hojas de contacto de los 18 clips** (fotogramas reales, a ×2, con el pivote marcado y cada clip etiquetado «own drawing» o «STAND-IN») | `clips-1-idle-walk-run-jump-fall-land.png` · `clips-2-attacks-dash.png` · `clips-3-crouch-hurt-death-cast-drink-interact.png` | prioridad 1 (idle, walk, run, jump, fall, land) · prioridad 2 (los cuatro golpes y el *dash*) · prioridad 3 (agachado, gateo, golpe recibido, muerte, *cast*, beber, interactuar) |
| **El diseño original frente al fotograma** | `fidelity-sheet-vs-frames.png` | nueve filas: el dibujo de la hoja (con sus sombras, líneas de velocidad y rojo) · el fotograma de reposo del clip sobre el blanco de la hoja y sobre el oscuro del juego, ×2. Es **la misma figura**: lo que cambia es que se le quita lo que no es figura y que está a media escala |
| **Las tres pieles** | `looks-placeholder-art-auto.png` | el mismo momento (de pie, corriendo, el corte del primer golpe) con `?visual=placeholder`, `?visual=art` y `?visual=auto`: **`auto` es el arte, nunca la cápsula**, y la cápsula sigue ahí como camino de vuelta |
| **Reproducción real, juego a juego** (el juego de verdad, con el arte de verdad, 844 × 390, DPR 2; un recorte del héroe cada pocos *ticks*, con el clip y el fotograma) | `game-idle.jpg` · `game-walk.jpg` · `game-run.jpg` · `game-turn.jpg` · `game-jump.jpg` · `game-dash.jpg` · `game-hurt.jpg` · `game-death.jpg` · `game-drink.jpg` · `game-interact.jpg` | cada estado dibujado por su clip, los giros, el salto con su caída y su aterrizaje, la muerte hasta el suelo |
| **La espada en la mano derecha, con las anclas dibujadas** (anillo cian = `hand_r`, punto amarillo = `weapon_grip`, punto rojo = `weapon_tip`, línea blanca = el filo, **calculado por el juego en ese *tick***) | `game-attack-anchors.jpg` · `game-airattack-anchors.jpg` · `game-crouch-anchors.jpg` · `game-cast-anchors.jpg` | el primer y el segundo golpe, el golpe en el aire y el agachado: **el punto amarillo está dentro del anillo en cada fotograma**; la punta sube en la anticipación y baja por el corte |
| **El laboratorio `?lab=player&look=art` con el arte real** (anclas, espada, límites del dibujo, cajas del juego) | `lab-player-attack1-active.png` | el fotograma `attack1_02` (activo): `hand_r` (0.56, 0.33) · `weapon_grip` (0.56, 0.33) · `weapon_tip` (1.46, 0.10) y el propio laboratorio dice «**sword: grip is 0.00 m from the hand ✓**»; lienzo 4.31 × 3.54 m a 65 px/m |
| **Los cortes entre clips** (el último fotograma del que acaba en tonos cálidos y el primero del que empieza en fríos, sobre el pivote) | `transitions-cuts-between-clips.png` | veinte cortes: **los pies no saltan**; la cabeza de un dibujo y la del siguiente no miden lo mismo y **se ve** (§N.9.3) |
| **Trazas *tick* a *tick*** (qué pidió la simulación y qué fotograma puso el arte: estado → clip → fotograma → fase → punta de la espada) | `traces/*.txt` (14 actos) | p. ej. `traces/attack.txt`, el primer golpe: anticipación en 5 *ticks* (la pulsación cuenta uno: `attack1_00` ×2 y `01` ×3), activa en 3 (`02` y `03` ×2), recuperación en 8 (`04` ×2, `05` ×3, `06` ×3), y la punta de la espada de 1.04 m de altura (alzada) a 0 m (en el corte) |

**Lo que se verificó mirando** (lo hizo quien escribe esto con las imágenes de arriba, no un artista ni un jugador): que cada clip enseña **movimiento** y no un fotograma repetido, que la figura **es la del dibujo** (ojos con sus tres reflejos, antenas, silueta, armadura, el filo de la hoja) y no una reinterpretación, que **no hay fleco claro ni halo** en el borde, que los pies están sobre el suelo en los clips apoyados, que el giro espeja sin saltos, y que en cada golpe **la hoja está en la mano**.

**Lo que se verificó con pruebas** (temporal y funcional): `heroPlayback.test.ts` (qué fotograma enseña el animador en cada *tick*, a 60 Hz, con el manifiesto real) y el E2E `player-anim`, que juega en un navegador **cada estado** y comprueba, *tick* a *tick*: que lo dibuja **su clip**, que los fotogramas **avanzan en orden**, que **cada fase de un golpe dibuja sus fotogramas**, que el agarre está a ≤ 0.04 m de la mano en los cuatro golpes, que el *dash* mantiene hacia dónde mira, que el aterrizaje de una caída dura dura sus 10 *ticks*, que el golpe recibido (12–20 *ticks*), beber (24), morir y interactuar (12) duran lo que dura el estado, y que **el mismo guion con las tres pieles da la misma simulación**.

**Se regenera** (no está en el repositorio: `.shots/` y `tools/e2e/.lab/` son locales): las hojas, las trazas y las capturas salen de los *scripts* de laboratorio (`overview`, `anim-trace` —con `ANCHORS=1`—, `looks`, `ghosts`, `fidelity-view`, `eye-frames`); lo que **sí** está en el repositorio y se puede repetir es el generador (`npm run assets:animate`), las pruebas y el E2E.

## Fase E — informe final

> Esta es la entrega pedida (A–E). Las palabras del encargo se usan tal cual: **animación completa** = un dibujo tuyo de esa acción, movido, integrado y probado (con los límites que se dicen); **solución provisional** = el movimiento es real pero el dibujo es el de otra acción (*stand-in*); **clip pendiente** = no hay nada que enseñar (**ninguno**: no queda un solo estado en manos del *placeholder*).

### A · Estado del repositorio

- **Rama** `claude/troid-vertical-slice` (remoto `origin`), encima de `5807889` (el cierre del Prompt 8). El *hash* del *commit* de cierre lo da el informe de la conversación (un archivo no puede llevar el *hash* del *commit* que lo guarda). **No se abrió ningún *pull request*.**
- **Creados:** `tools/assets/{warp,heroRig,heroClips,heroAnimation,animate,animate-cli}.ts` · `art/player/source/hero.rig.json` · `tests/unit/tools/{warp,heroRig,heroAnimation,animate}.test.ts` · `tests/unit/presentation/heroPlayback.test.ts` · `tools/e2e/scenarios/playerAnim.ts` · `docs/PROMPT9-LOG.md` · `docs/img/prompt9/` (21 imágenes y 14 trazas) · los 98 fotogramas nuevos de `art/player/hero/`.
- **Modificados:** los 16 fotogramas de `art/player/hero/` (ahora 114, generados), `art/player/player.pack.json`, `art/player/source/hero.poses.json` (solo la extracción), `public/art/player/{hero_0.png,hero_0.json,player.pack.json}` (empaquetado), `package.json` (`assets:poses` → `assets:animate`), `src/app/testHooks.ts` (**el único cambio en `src/` que no es un dato: `advanceAnimation`, un gancho de pruebas**), `src/presentation/stressModel.ts` (presupuesto de la zona 32 → 40 MiB, con su motivo), `tools/assets/missing.ts`, `tools/e2e/run.ts`, los escenarios `room-art` y `player-art`, las pruebas `artRepo`, `missing` y `stressModel`, y la documentación (README, ROADMAP, GAME-SPEC-2D, ART-PIPELINE-2D **parte N**, MOBILE-CALIBRATION, PROMPT8-LOG, la guía de entrega del protagonista).
- **Retirados:** `tools/assets/heroFrames.ts`, `tools/assets/poses-cli.ts` y `tests/unit/tools/heroFrames.test.ts` (sustituidos por `animate*`).
- **Tus originales, intactos:** `art/player/source/hero-sheet.png` (SHA-256 `9146b74e…d472`) y `hero-portrait.jpg` (`3930665b…ea1a5`) **no aparecen en ningún `git diff`** y una prueba (`heroAnimation.test.ts`) falla si alguien los toca. **Nada de ellos se sobrescribió con una versión procesada**: los dibujos se cortan en memoria y los fotogramas son archivos aparte.
- **Árbol limpio** tras el *commit* (`.shots/` y `tools/e2e/.lab/`, locales, están excluidos).

### B · Estado de las 15 animaciones (y los 3 extras)

«Fotogramas propios» = ¿hay un **dibujo tuyo de esa misma acción**? Ninguno de los 114 fotogramas está dibujado: **todos son tus píxeles, movidos**.

| # | Clip | Estado | Fotogramas reales | Método | Integrado y probado | Limitaciones |
|---|---|---|---|---|---|---|
| 1 | `idle` | **completa** | 8 · 8 fps · bucle | dibujo 1; el pecho respira, la cabeza lo sigue un compás después, las antenas se balancean | sí (E2E `player-anim` A; `heroPlayback`) | el dibujo de pie **no lleva la hoja de la espada**; el ritmo (1 s por respiración) no se ha visto en un dispositivo |
| 2 | `walk` | **completa con límite** | 8 · 16 fps · bucle | dibujo 2 (tres cuartos); las piernas se turnan, el cuerpo sube y baja, la cabeza y la capa arrastran | sí | **no hay cruce de piernas** (un solo dibujo): los pies resbalan algo |
| 3 | `jump` | **completa** | 6 · 14 fps | dibujo 4; el impulso aplasta y estira, luego vuela con los miembros y la capa retrasados | sí | el corte a `fall` (dibujo 5) es un cambio de pose |
| 4 | `fall` | **completa** | 4 · 12 fps · bucle | dibujo 5; antenas y púas al viento | sí | — |
| 5 | `dash` | **provisional** | 4 · 24 fps | el dibujo de la carrera (3) lanzado hacia delante | sí (dura los 10 *ticks* del juego) | la hoja no tiene dibujo del *dash* (es una estela roja) |
| 6 | `attack1` | **completa** | 7 · 28 fps · por fases | dibujo 7; **la hoja es una pieza rígida** que gira sobre la empuñadura: alzada en la anticipación, baja por el corte, vuelve | sí (fases de la simulación, agarre ≤ 0.04 m, la punta baja > 0.5 m) | la espada del dibujo es **larga**; la zona de daño (no tocada) no coincide del todo con el tajo dibujado |
| 7 | `attack2` | **provisional** | 8 · 28 fps · por fases | el dibujo del primer tajo, la hoja girando al revés | sí (la punta sube > 0.4 m) | el segundo tajo de la hoja no se separa de su arco rojo |
| 8 | `attackAir` | **provisional** | 7 · 26 fps · por fases | el primer tajo con las piernas recogidas | sí | la hoja no tiene un tajo en el aire |
| 9 | `crouch` | **provisional** | 6 · 6 fps · bucle | la agachada del aterrizaje (6), sostenida y respirando | sí | la hoja no tiene un agachado |
| 10 | `attackCrouch` | **provisional** | 7 · 26 fps · por fases | el primer tajo, bajado sobre las piernas | sí | la hoja no tiene un tajo agachado |
| 11 | `hurt` | **completa** | 5 · 20 fps | dibujo 11; el golpe lo lanza un poco más lejos, las antenas restallan, se asienta | sí | — |
| 12 | `death` | **provisional** | 9 · 12 fps | el dibujo del golpe (11) cae hasta el suelo, apoyado, y los ojos se apagan | sí (9 fotogramas en orden, descansa en el último) | la hoja no tiene una muerte |
| 13 | `cast` | **completa** | 7 · 14 fps · por fases | dibujo 12 (espejado, ×1.3): la figura se concentra, suelta, se asienta | sí | el brazo se mueve con el *warp* (la hoja solapa la cabeza: no es pieza rígida) |
| 14 | `drink` | **provisional** | 6 · 15 fps | el dibujo de pie hace el gesto | sí (24 *ticks* del canal) | **no hay botella ni mano a la boca**: no se inventan |
| 15 | `interact` | **provisional** | 4 · 20 fps | el dibujo de pie se inclina y asiente | sí (12 *ticks*) | **no hay una mano que alcanza**: no se inventa |
| extra | `run` | **completa** | 8 · 20 fps · bucle | dibujo 3; la pierna de atrás bombea, la de delante responde (nunca se cruzan) | sí | — |
| extra | `land` | **completa** | 4 · 24 fps | dibujo 6; llega el peso, se aplasta y se asienta | sí (10 *ticks* de una caída dura) | — |
| extra | `crouchWalk` | **provisional** | 6 · 14 fps · bucle | la agachada avanza a pasitos | sí | igual que `crouch` |

**En cuentas:** de los 18 clips, **9 completos** (8 sin reservas importantes y `walk` con el límite dicho) y **9 provisionales**; de los **15 clips de la entrega**, 7 completos y 8 provisionales (las mismas cuentas del Prompt 8: la diferencia es que **ninguno es ya un fotograma quieto**). **Clips pendientes: 0.**

### C · Evidencia

Ver «Evidencia» arriba (`docs/img/prompt9/`, `traces/` y las pruebas). Resumen: hojas de contacto de los 18 clips · el diseño original frente al fotograma · las tres pieles · 14 reproducciones reales del juego · la espada en la mano con las anclas dibujadas en 4 golpes · los cortes entre clips · trazas *tick* a *tick*. **Mirado por quien las hizo, no por un artista ni un jugador.**

### D · Regresión técnica

Ver «Regresión» arriba. Resumen: `tsc` ✅ · **2533 pruebas** ✅ · `assets:check/verify/animate --check` ✅ · `build` ✅ · **E2E 49/49 en desarrollo y 49/49 en producción** ✅ · JavaScript del arranque en frío **195.8 KB gz (sin cambio)** · llamadas de dibujo **≤ 25** (sin cambio) · memoria del arte **R4 35.9 MiB** (presupuesto propuesto de la zona 32 → **40**) · **sin regresiones de simulación**. **Los costes que sí hay:** **+1.4 MB de PNG** en el camino crítico del arranque (el atlas del héroe: 339 KB → 1.76 MB) y **~2.3 s más de telón** con la red a 600 KB/s (6.4–7.8 → 8.8–10.0 s: roza el tope de 10 s del telón).

### E · Pendiente

1. **Lo que impide que esté «visualmente terminado»:** los **9 *stand-ins***: un agachado, un *dash*, una muerte, un beber, un interactuar, un segundo tajo, un tajo en el aire y uno agachado **propios**; **el cruce de piernas al andar**; y **los cortes entre dibujos** (la cabeza de un dibujo y la del siguiente no miden lo mismo: ±15 %). No se arregla con más código: **un dibujo solo se puede deformar, no mirar desde otro lado**.
2. **Material extra estrictamente necesario** (de quien dibujó la hoja), por orden de lo que más se ve jugando: **(a)** el *dash*; **(b)** el segundo tajo, **sin el arco rojo fundido con la espada** (o con el efecto en otra capa); **(c)** agacharse y gatear; **(d)** beber (con la botella); **(e)** el tajo en el aire y el agachado; **(f)** la muerte; **(g)** interactuar. Y, para la marcha, **4–8 poses de las piernas** (contacto, bajada, paso, subida). Formato: **PNG con fondo transparente**, el mismo lienzo (280 × 230, pies en 120, 192, 65 px por metro) o la hoja de siempre con **la figura sin los efectos pintados encima**; cómo se entregan **sin que el generador los borre**: [deliver-protagonist-art](guides/deliver-protagonist-art.md) §4 (`delivered`).
3. **Siguiente paso recomendado:** pedir (a)–(c) —lo que más se ve en las salas y en el combate— y, cuando lleguen, ponerlos en `art/player/hero/` con `delivered`, quitar la etiqueta `stand-in` y **partir el atlas del héroe** (los clips de uso frecuente en el arranque y el resto después del telón) para recuperar los ~2 s; eso último **necesita que el motor sepa completar un *sprite set* que llega a trozos** (§N.9.5).
4. **Lo que sigue sin verse nunca:** **un dispositivo real** (iPhone, iPad, Android, un mando físico): la fluidez con 114 fotogramas, la decodificación de una página de 1344², los 7 MiB del héroe, y sobre todo **la sensación** (el peso del golpe, el ritmo de la marcha, si la anticipación de 4 *ticks* se lee). El protocolo está en [MOBILE-CALIBRATION](MOBILE-CALIBRATION.md) §7.
5. **Una decisión de diseño que es tuya:** la espada del dibujo del tajo es **larga** y el encargo la describe **pequeña**; no se tocó.
