# Prompt 8 — de la slice técnica a una slice producida (S45 →)

> **Qué es esto.** El encargo del Prompt 8 es llevar la vertical slice técnica (que ya se juega de punta a punta) hacia una versión **visualmente cercana a una producción real**, **sin rehacer la arquitectura** y con la
> jugabilidad, los controles, la lógica, el rendimiento y los contratos intactos. Se hace por **fases, en orden estricto** (una zona se termina antes de empezar la siguiente):
> **A** protagonista · **B** R1 · **C** R2 · **D** R3 · **E** R4 · **F** jefe · **G** enemigos · **H** VFX · **I** iluminación y parallax · **J** integración y regresión completa.
>
> **Dirección visual.** Dos referencias principales: **Hollow Knight** (estructura, composición de salas, siluetas, profundidad, atmósfera oscura) y **Solo Leveling** (energía, VFX, partículas, auras, impactos, iluminación y contraste
> entre oscuridad y energía luminosa). No Zelda / BOTW / TOTK. **Propiedad intelectual original: no se copia ningún personaje, enemigo, escenario, símbolo, UI ni efecto de ninguna referencia.**
> Paleta: negro, blanco, cian/azul de energía y violeta para lo enemigo; el carmín solo atenuado y secundario.
>
> **Regla absoluta sobre el protagonista.** Las imágenes que aportó el usuario son la máxima autoridad: no se rediseña, no se «mejora», no se humaniza, no se cambia la cabeza, la cara, el pelo, la máscara, la silueta, la ropa,
> las proporciones ni la paleta, y no existe un protagonista alternativo. El escenario, los enemigos y los VFX sí pueden crearse de nuevo, siempre que sean coherentes con esa dirección.
>
> **Regla sobre los *placeholders*.** Una zona no se da por terminada mientras dependa visualmente de cápsulas, rectángulos, geometría procedural, fondos planos, VFX temporales o *sprites* genéricos. Al final de cada fase se dice
> **exactamente qué *placeholder* se quitó** y cuáles quedan.

## Fase A — el protagonista definitivo (S45)

**Resultado en una frase:** el protagonista **se dibuja con los píxeles de la hoja de poses del usuario** (`art/player/source/hero-sheet.png`, guardada bit a bit) en **todos** los estados del juego; la cápsula ya no aparece en
modo `auto`. Pero la hoja es **de concepto** —una pose por acción—, así que **no es un protagonista animado**: es lo que la hoja permite, dicho con todas sus letras más abajo.

### Qué se hizo (y qué no)

- **Solo operaciones técnicas sobre la hoja** (`tools/assets/poses.ts`): fondo transparente por proyección de color con *des-mezcla* del borde, y nada más. **No se dibuja, no se recolorea, no se suaviza, no se retoca, no se añade un píxel.**
  Lo que no es la figura (sombra del suelo, líneas de velocidad, polvo, destellos y arcos de energía **roja** sueltos) se deja fuera; el rojo que **toca** la figura (el filo de la espada, un detalle de su armadura) se queda.
- **Una descripción de datos, no código** (`art/player/source/hero.poses.json`): qué rectángulo de la hoja es cada pose, dónde están sus pies, dónde se sostiene la espada, qué pose mira a la izquierda (se **espeja**, nada más) y a qué
  escala visual se dibujó. `npm run assets:poses` lo ejecuta y `-- --check` comprueba que los fotogramas versionados son **exactamente** los que la hoja produce: nadie los ha tocado a mano.
- **Escala y anclas medidas sobre la imagen**: 130 px/m, lienzo común de 344 × 320, pivote en los pies; `hand_r`, `weapon_grip`, `weapon_tip`, `hit_origin`, `vfx_origin` y `projectile_origin` por fotograma, en metros desde los pies.
  El agarre de la espada coincide con la mano (**0.00 m**, la regla del contrato es ≤ 4 cm).
- **Un único contrato nuevo**, necesario porque las poses se dibujaron a tamaños distintos: `FrameMeta.scale` (multiplicador visual de **ese fotograma** alrededor de los pies; un ajuste de integración, como `visualScale`: cambia lo que
  se ve y **nunca** lo que ocurre). Lo usa la pose de lanzamiento (×1.3).

### Los 15 clips de la entrega

| | Clip | Origen |
|---|---|---|
| **Arte propio** (7) | `idle`, `walk` (la pose de carrera), `jump`, `fall`, `attack1` (la estocada baja), `hurt`, `cast` (la espada en alto, espejada, ×1.3) | un fotograma cada uno, de la hoja |
| **Extra** | `land` (la agachada de aterrizaje) | de la hoja; no es de los 15, pero el héroe publica 18 estados |
| ***Stand-ins*** (8) | `dash`, `attack2`, `attackAir`, `crouch`, `attackCrouch`, `death`, `drink`, `interact` | **la pose de otro clip**, porque la hoja no tiene pose propia; etiqueta `stand-in` y un comentario que dice cuál reutiliza |

`npm run assets:missing` **los cuenta como NO entregados**: hoy dice **7 de 15 clips con arte propio**. Las poses 2, 8, 9 y 10 de la hoja no se usan (la 2 es una segunda postura quieta que ningún estado pide; las otras tres tienen el efecto
rojo fundido con el cuerpo o la espada, y separarlo sería dibujar).

### *Placeholders* quitados y los que quedan

- **Quitado:** la **cápsula con espada** del protagonista, en **todos** los estados, con `?visual=auto` (el valor por defecto). Sigue existiendo como camino de vuelta (`?visual=placeholder`) y como *fallback* por estado.
- **Quedan, dentro del propio protagonista:** 8 de 15 clips son la pose de otro clip; **ninguno está animado** (un fotograma por clip: el héroe «salta» entre poses, no se mueve entre ellas); el *dash* se ve como la carrera.

### Archivos

Nuevos: `tools/assets/poses.ts`, `heroFrames.ts`, `poses-cli.ts` · `art/player/source/{hero-sheet.png,hero-portrait.jpg,hero.poses.json}` · `art/player/hero/*.png` (16 fotogramas generados) · `public/art/**` (empaquetado, versionado) ·
`tests/unit/tools/{poses,heroFrames}.test.ts`. Modificados: `src/presentation/{SpriteSetDefinition,artManifest}.ts` (`FrameMeta.scale`), `src/render/ActorSprite.ts` (escala por fotograma), `src/app/labs/playerLab.ts`,
`tools/assets/missing.ts` (los *stand-ins*), `art/player/player.pack.json`, `package.json` (`assets:poses`), 4 archivos de pruebas unitarias y 7 escenarios E2E (ver «Pruebas que se adaptaron»), `tools/e2e/run.ts` (`--only=`), la documentación.

### Herramientas usadas

`npm run assets:poses` (y `-- --check`), `npm run assets:missing`, `?lab=player&look=art` (un clip cada vez, con anclas, espada, escala y las cuatro cajas del juego) y *scripts* de película que reproducen el juego real y apilan fotogramas (en el espacio de
trabajo, fuera del repositorio).

### Verificación

| | Resultado |
|---|---|
| `tsc` | limpio |
| Pruebas unitarias y de integración | **2257 en 143 archivos** (eran 2223 en 141: +34, las de la extracción de poses y de los fotogramas del héroe) |
| E2E (desarrollo y producción) | **43/43 en los dos modos** |
| `build` (con `assets:check`) | limpio |
| Llamadas de dibujo | sin cambios (el escenario `art-performance` y `r1` miden las mismas: R1 entera ≤ 12) |
| Arranque en frío (KB gzip, 200 de presupuesto) | **190.8** (antes 190.7): el arte se descarga después del primer fotograma |
| Primera sesión entera con el arte | 216.4 (el *chunk* de arte, 10.5 KB gzip, y los demás diferidos) |

### Pruebas que se adaptaron (y por qué)

El repositorio **ya tiene arte propio por defecto**; varias pruebas suponían lo contrario. Se adaptaron **conservando lo que prueban** y sin bajar la base:
`artRepo.test.ts` (×3) y `missing.test.ts` (×1) describían el repositorio «sin arte» y ahora describen el estado honesto (7 de 15, 8 *stand-ins*); los escenarios `assets`, `player-art`, `player-lab` y `player-r1` abren la página con
`art=` / `art=art-test` para seguir probando el *fallback* sin arte y el arte sintético completo; `movement`, `crouch` y `combat` miraban fotogramas del *placeholder* por nombre y ahora piden `visual=placeholder`. Se añadió una sección que
prueba el arte real del repositorio.

### Problemas encontrados (y resueltos)

1. **Una carrera en un escenario** (`player-r1`, solo en producción): la primera muestra de la partida con el arte se tomaba entre «el arte está puesto» y el siguiente fotograma dibujado, y `visual.shows` todavía decía `placeholder`.
   No era del juego —en desarrollo el fotograma llegaba antes— sino de la prueba, que esperaba al estado equivocado. Ahora espera a `art attached && shows === 'art'`.
2. **Reinicios del entorno** cortaron dos pasadas largas de E2E; el ejecutor aprende `--only=a,b,c` (nombres exactos) para reanudar donde se cortó.
3. Los hallazgos de la extracción (rojo pegado a la figura, bordes mezclados con el fondo, agujeros cerrados por la figura, la pose espejada) están en `docs/ART-PIPELINE-2D.md`, parte L.

### Pendiente de la fase A (a propósito, no se puede resolver sin un artista)

- **Animación real**: ciclo de caminar/correr, ataques de varios fotogramas, muerte, beber, interactuar, *dash*, agacharse (el contrato ya los pide; la guía de entrega dice cómo).
- **Legibilidad**: el héroe es casi negro. Se resuelve en la composición de los escenarios (luz **detrás**, oscuridad **delante**, riesgo R14) y, si hace falta, con un borde de energía en tiempo de ejecución (fase I).
- **Revisión artística** de la pose de lanzamiento (escalada ×1.3 y espejada) y de la estocada (una embestida baja frente a una caja de golpe que no cambió).

## Fase B — R1 «Puerta de las Ruinas» vestida (S46)

**Resultado en una frase:** la primera sala **se dibuja con arte pintado en el motor** —suelo, piedra, plataformas de madera, puerta del guardián, haz de luz de la salida, tres capas de parallax, hojas en primer plano, luces, bruma y los *props*
colocados a mano y con semilla (108 colocaciones en tres escenas)— y **el bloqueo (los rectángulos) ya no se ve en R1**; sigue existiendo debajo como *fallback* por ranura. **Ese arte lo pinta código** (`tools/art`), no una mano: es una producción de tipo «pintura generativa» con una
luz y una paleta únicas, **no** arte de un ilustrador, y necesita revisión artística (ver «Pendiente»). **R1 no se da por terminada del todo:** el Ink Slime sigue siendo procedural (fase G) y los VFX son los de la fase 7 (fase H).

### Qué se hizo

- **El contrato se amplió sin romper nada** (todo opcional y compatible hacia atrás; ver `docs/ART-PIPELINE-2D.md`, parte M):
  paquetes con `atlasMode: "shared"` (los fotogramas de **todos** los *sprite sets* comparten páginas: 3 paquetes → 3 páginas, no 50 texturas) y `scenes` (la escena de cada sala); `role:decor` en todas las capas; etiquetas `grid:CxR` (teselas periódicas
  sin costuras), `rise:`/`reach:` (cuánto sobresale una pieza de su caja), `blend:add` y `layer:`; la parte `glow` de las puertas.
- **Dos módulos puros nuevos** en `presentation/`: `roomScene` (el formato de la escena de una sala, validado contra su paquete) y **`roomPlan`**, el planificador: reparte `RoomDefinition.solids` en teselas **enteras** más un resto **recortado** (nunca escalado),
  remates solo en bordes **expuestos**, bordes en los lados abiertos, plataformas con extremos, columna de puerta y bandas de parallax con la altura exacta que pide la cámara; recorta lo que la cámara no ve. **La colisión sigue siendo `RoomDefinition.solids`:
  el arte es una piel** (probado: el cuerpo, los colliders y las cuatro cajas del héroe no cambian con ni sin arte).
- **`RoomArtView`** (en el *chunk* de arte, que una página sin arte no descarga) dibuja la sala **sobre el *blockout***; `RoomView2D.cover/uncover` le quita al bloqueo **solo** lo que el arte cubre (sólidos, puertas, salidas, fondos) y le deja el resto.
  Las puertas se disuelven con su *gate* (0.6 s de tiempo real) y las dos animaciones —la del arte y la del bloqueo— van juntas.
- **El pintor** (`tools/art`, `npm run art:build`): ~3 100 líneas de TypeScript sobre Canvas2D de Chromium y pasadas por píxel —una sola fuente de luz fría desde arriba y delante, ambiente azul profundo y borde de luz; siluetas con perfil cilíndrico y bisel;
  ruido periódico (teselas sin costura); un canal emisivo para los brillos cian y violeta; runas **originales y abstractas** (sin letras, sin símbolos de ninguna referencia); paleta negro / azul-verdoso / cian, con el violeta **solo** para el sello y lo enemigo.
  Todo se versiona ya pintado en `art/` y `public/art/`: **nadie necesita ejecutar el pintor para jugar**, y un artista puede sustituir cualquier PNG a mano (la guía `docs/guides/deliver-environment-art.md` lo explica).
- **`tools/assets`** empaqueta con páginas compartidas, copia y **verifica** las escenas (rutas seguras, *sprites* y fotogramas que existen, el paquete correcto) y juzga la cobertura de ranuras sobre **todos** los paquetes de entorno a la vez.

### Los activos (todo de `tools/art`, estado `provisional`)

| Paquete | *Sprite sets* | Qué es |
|---|---|---|
| `ruins-ground` | 35 | tierra y piedra (relleno 4×2, remate, bordes), madera de plataforma (cuerpo + dos extremos), puerta (cuerpo, remate, base, **resplandor aditivo**), velo de suelo, helechos, hierba, escombros, setas, cristales, raíces, 3 columnas, piedra rúnica, efigie |
| `ruins-back` | 8 | las **tres bandas** de parallax (lejos 1200×340, medio 1536×448, cerca 1536×691), 2 arcos colosales y 3 hojas de primer plano |
| `ruins-light` | 7 | haz de la salida, 2 brillos (cian, violeta), 2 haces, banco de bruma, motas |
| **Escena `r1_gate`** | **77 + 13 + 18 colocaciones** (terreno 68, *props* 9 / arcos 4, hojas 9 / haces 3 + 1, luces 14) | 539 *sprites* en pantalla en el peor encuadre |

En disco: 2 491 KB (PNG sin pérdida; 2.14 MB las tres páginas de escenario + 0.35 MB del héroe). En memoria: **4 páginas, 22.4 MiB** (héroe 620×672 · suelo 1216×1216 · fondos 1728×1708 · luz 1008×1008) frente a un presupuesto propuesto de 32 MiB.

### *Placeholders* quitados y los que quedan

- **Quitados en R1** (con `?visual=auto`, el valor por defecto): los **rectángulos de suelo, muros, bloques, escaleras, techo del túnel y puerta**; el **haz de la salida** (un rectángulo con degradado) y las **cuatro capas de fondo** (franjas planas de color). Nada de eso se dibuja ya en R1.
  El bloqueo sigue siendo el camino de vuelta (`?art=`) y el *fallback* por ranura (probado con un paquete sintético que solo tiene tierra: lo que tiene lo dibuja, lo que le falta sigue siendo el bloqueo).
- **Quedan en R1:** el **Ink Slime** (procedural, fase G) y los VFX de ataque, impacto y aviso (fase H); los 8 *stand-ins* y la falta de animación del protagonista (fase A).
- **Quedan en el mundo** (el empaquetador lo dice con 5 avisos, y la prueba `artRepo` los lista): cuerpo de la puerta del sello (R3), celda de las espinas (R2), objetos «recoger» (R2, R3, R4), santuario de descanso (R2, R4) y el sello (R3). **R2, R3 y R4 son todavía el bloqueo de siempre** a propósito:
  los paquetes solo declaran `r1_gate` en sus zonas hasta que cada fase termine su sala (una sala no se «medio viste» con materiales que no se compusieron para ella; el aviso violeta del jefe, por ejemplo, se dibujó sobre un suelo desnudo y se juzgará sobre el escenario que le dé la fase E).

### Archivos

Nuevos: `src/presentation/{roomPlan,roomScene}.ts` · `src/render/RoomArtView.ts` · `tools/art/**` (`build`, `spec`, `packs/ruins`, `scenes/r1`, `painter/*` ×17) · `art/ruins-{ground,back,light}/**` (fotogramas, manifiestos, escenas) ·
`public/art/ruins-*/**` (empaquetado) · `tests/unit/presentation/{roomPlan,roomScene}.test.ts` · `tools/e2e/scenarios/roomArt.ts`.
Modificados: `src/presentation/{artManifest,environment}.ts` · `src/assets/artLibrary.ts` · `src/render/RoomView2D.ts` · `src/app/{Game2D,art,testHooks}.ts` · `tools/assets/{build,verify}.ts` · `tools/e2e/{run,scenario}.ts` · `package.json` (`art:build`) ·
`art/index.json`, `public/art/index.json` · `docs/{ART-PIPELINE-2D,ARCHITECTURE-2D,ROADMAP,PROMPT8-LOG}.md`, `docs/guides/deliver-environment-art.md`, `README.md`.

### Herramientas usadas

`npm run art:build` (el pintor) + `assets:pack` / `assets:check`; capturas del juego real a 844×390 y 1920×1080 en seis puntos del recorrido; *scripts* que apilan cada capa por separado y miden luminancia (así se encontró el haz de la salida dibujado a 1 m/px y la luz que lavaba al héroe);
`?lab=art-stress`; el escenario `room-art` (nuevo).

### Verificación

| | Resultado |
|---|---|
| `tsc` | limpio |
| Pruebas unitarias y de integración | **2294 en 145 archivos** (eran 2257 en 143: +37: planificador 18, escenas 6, pintor y empaquetador 5, entorno, y 2 de la biblioteca de arte tras el fallo de la zona) |
| E2E | **44/44 en producción** con el código final (44 escenarios: el nuevo `room-art`) y **44/44 en desarrollo** (pasada completa + repetición dirigida de 15 escenarios tras los arreglos) |
| Llamadas de dibujo | **R1 entera: 13 como máximo** en seis encuadres a tamaño teléfono (presupuesto 60); el resto del juego, sin cambios |
| Memoria del arte residente | 22.4 MiB (4 páginas) |
| Tiempo de carga de la zona (software GL, sin dispositivo real) | ≈ 0.2–0.3 s |
| Arranque en frío (200 KB de presupuesto) | **192.7 KB gz** (antes 190.8: +1.9, el cargador de escenas y el contrato nuevo) |
| *Chunk* de arte (perezoso) | 15.0 KB gz (antes 10.5) |

> Nada de esto está medido en un dispositivo real: SwiftShader en Chromium no dice cómo irá un teléfono de gama media (riesgo R6).

### Pruebas que se adaptaron (y por qué)

`environment.test.ts` (la expresión de un mensaje cambió), `artRepo.test.ts` (×4: el repositorio ya trae **cuatro** paquetes, empaquetarlo tarda ~9 s —tiempo de espera explícito, una construcción compartida— y los 5 avisos honestos de «lo que sigue siendo bloqueo» se
listan en `STILL_THE_BLOCKOUT` en vez de exigir «ningún aviso»; encoger esa lista es el progreso), `room.ts` (E2E: el violeta del aviso del slime se mide **alrededor del slime**, no en toda la pantalla, porque el escenario azul ya aporta violeta de fondo; sigue exigiendo que el aviso **añada** ≥ 40 px),
`playerArt.ts` (E2E: la biblioteca lista cuatro paquetes) y `environment.ts` (E2E: el recuento de objetos por capa se hace **sin arte** —es el del bloqueo, la vara con la que se mide el arte— y una sección nueva prueba que **con arte** reconstruir la sala tres veces
deja exactamente las mismas capas). Ninguna prueba se bajó ni se borró.

### Problemas encontrados (y resueltos)

1. **Luz que lavaba al héroe** (primera composición): los haces cayendo *delante* de la acción. Ahora caen detrás (en las capas de parallax, sumados a lo que hay), con alfa bajo, bruma con borde difuminado y motas más escasas.
2. **Haz de la salida a 1 m/px** (inundaba la pantalla de cian): faltaba aplicar la escala de píxeles por metro al *sprite*.
3. **Runas que parecían letras** (y una cara sonriente): rediseñadas como glifos abstractos.
4. **Bandas de parallax demasiado bajas** para las cámaras de R3 y R4 (se veía el cielo por encima): la banda cercana pasa de 653 a 691 px (18.0 m; la cámara más exigente pide 17.5 m). Hoy esas salas no usan el arte, pero lo harán.
5. **El aviso violeta del jefe pierde fuerza sobre el escenario azul** (el escenario `boss` lo detectó: 948 → 986 px de violeta, no ≥ +60). **No se «arregló» el aviso en esta fase**: R4 se queda como bloqueo hasta la fase E y el aviso se rediseña en las fases F/H. Queda
   como **riesgo de legibilidad conocido**, hermano de R14 (fase I): el violeta de lo enemigo debe contrastar con el azul del escenario, y eso se resuelve con el propio VFX (más saturación, luminosidad y borde), no relajando la prueba.
6. Un escenario (`environment`) contaba objetos por capa con el arte puesto; ver «Pruebas que se adaptaron».
7. **Un fallo real de carga de zona, encontrado por la pasada de producción** (`room` y `transition` rojos solo allí). Al entrar en R1 por una transición, `enterZone` se pedía dos veces
   (`transition:started` y `room:loaded`) y la **segunda volvía de inmediato** mientras la primera aún descargaba las páginas: la sala se vestía **con medio paquete** (suelo sí; puerta,
   bandas y haz de la salida no) hasta la siguiente reconstrucción. El diagnóstico salió de imprimir las etiquetas de cada capa cuando dos grafos de escena difieren. Arreglo en tres puntos
   (commit aparte, `a65aeea`): la biblioteca devuelve **la carga en curso** a la segunda petición; `RoomArtView.clear()` anula cualquier construcción en vuelo; y `Game2D.dressRoom` ignora un
   recubrimiento que ya no es para el bloqueo que hay. Dos pruebas unitarias lo fijan (la primera falla sin el arreglo).

### Pendiente de la fase B (a propósito)

- **Revisión artística.** Todo el escenario lo ha pintado código: las formas son repetitivas a ojo de ilustrador (las columnas, los arcos y los árboles comparten gramática), no hay fotogramas de animación (el movimiento es solo de *sway/pulse/drift* en tiempo de ejecución) y la paleta
  se calibró en capturas del mismo motor, no en una pantalla real. Un artista puede sustituir cualquier PNG sin tocar código.
- **Calibración en dispositivo real** (brillo y contraste en pantallas OLED/LCD de teléfono, ancho de banda de la carga, memoria de las 4 páginas).
- **R2, R3 y R4 siguen en bloqueo** (fases C, D y E).

## Fase C — R2 «Galería de Raíces» (S47)

**Resultado en una frase:** la segunda sala **se dibuja con arte pintado en el motor** —las mismas teselas, fondos y luz de R1, más un paquete propio de R2 (`ruins-roots`): arco de raíces sobre el vestíbulo, cortinas de raíces, columnas tomadas por el bosque,
raíces que reptan por el suelo, zarcillos en primer plano, **las espinas del foso, el santuario donde se descansa y el frasco de la cuarta botella**—, y el motor aprende a dibujar con arte **tres cosas que antes solo dibujaba el *blockout***: las zonas que
hacen daño, los santuarios/palancas y los objetos. R2 no se da por terminada del todo: el Ink Slime sigue siendo procedural (fase G) y los VFX son los de siempre (fase H).

### Qué se hizo

- **Contrato:** `role:hazard · kind:spikes · part:cell` (una fila de celdas desde el suelo de la zona), `role:interactive · kind:rest|pickup|activate` con **segundo fotograma = encendido**, y `variant:bottle|card|rune` para los objetos (un `pickup` se pide **por lo que da**,
  leído de los datos de la sala: una ranura de botella → frasco, una habilidad → runa, lo demás → carta). Las ranuras obligatorias pasan de **12 a 14**. Todo opcional y compatible hacia atrás.
- **Planificador puro** (`roomPlan`): `planHazards` y `planInteractables` (con pruebas: celdas enteras, recorte de la última, `grid` por posición, flotación del objeto con la misma constante `PICKUP_FLOAT` que usa el *blockout*, lo que falta se reporta por ranura).
- **Vistas:** `RoomArtView` dibuja las espinas y cada interactuable (un `ArtInteractable` que **sigue lo que dice la simulación**: presente/ausente y encendido, con el mismo pulso y balanceo que tenía la marca del *blockout*); `RoomView2D` e `InteractableViews`
  ceden **solo** lo que el arte cubre. La colisión, el daño y la interacción son los de siempre.
- **El pintor aprendió a pintar «tubos»** (`SilhouetteLayer.tube`): una raíz redonda se ilumina como cilindro **vaya por donde vaya** (antes se redondeaba por la caja del objeto, bien para una columna y mal para una raíz curva). Con eso: raíces trenzadas con
  surcos de corteza, nudos, ramas y nódulos de luz cian; espinas negras con la punta de un **carmín apagado** (lo único cálido de la sala, pequeño); un santuario de dos celdas (reposo / encendido, con un charco de luz); un frasco pintado como luz.
- **Una guarda nueva del primer plano** (`notes`): sus piezas cuelgan del borde alto de la pantalla y su borde superior **no puede verse** con la cámara más alta de la sala; los compositores cuelgan las piezas desde `foregroundTop(sala)`.
- **Zonas:** los tres paquetes compartidos declaran `r1_gate` **y** `r2_hall`; `ruins-roots`, solo `r2_hall` (se descarga al entrar y se suelta al salir).

### Los activos nuevos (todo de `tools/art`, estado `provisional`)

| Paquete | *Sprite sets* | Qué es |
|---|---|---|
| `ruins-roots` (nuevo) | 15 | 2 arcos de raíces (14 × 10 m), 2 cortinas, 2 columnas con raíces, 3 raíces de suelo, 3 zarcillos de primer plano, **espinas** (4 celdas), **santuario** (2 fotogramas), **frasco** |
| Escena `r2_hall` | **124 colocaciones** (suelo y *props* 67, raíces 32 —arcos, cortinas, columnas, raíces de suelo y zarcillos—, luz 24, fondos 1) | 444 *sprites* en pantalla |

### *Placeholders* quitados y los que quedan

- **Quitados en R2** (con `?visual=auto`): los **rectángulos de suelo, foso, escalones y plataformas**; los **triángulos violeta de las espinas**; la **columna con cristal del santuario** (dibujada con `Graphics`); el **frasco de la cuarta botella** (idem); los **haces de las salidas** y las **cuatro capas de fondo planas**.
- **Quedan en R2:** el **Ink Slime** (procedural, fase G) y los VFX de ataque/impacto/aviso (fase H); la **variedad de gran escala del suelo** del foso (la misma tierra que la de fuera: sin charcos ni estratos).
- **Quedan en el mundo** (4 avisos del empaquetador, listados en `STILL_THE_BLOCKOUT` de `artRepo.test`): cuerpo de la puerta del sello (R3), el sello (R3), la carta (R3) y la runa (R4). **R3 y R4 siguen siendo el bloqueo de siempre.**

### Archivos

Nuevos: `tools/art/painter/roots.ts`, `tools/art/scenes/{common,r2}.ts`, `art/ruins-roots/**`, `art/ruins-*/scenes/r2_hall.json`, `public/art/ruins-roots/**`. Modificados: `src/presentation/{environment,roomPlan}.ts`, `src/render/{RoomArtView,RoomView2D,InteractableViews}.ts`,
`src/app/{Game2D,testHooks}.ts`, `tools/art/{packs/ruins,painter/{silhouette,flora,pieces},scenes/r1}.ts`, `art/index.json`, `public/art/index.json`, 6 archivos de pruebas, `tools/e2e/{png,scenario}.ts` y 3 escenarios, la documentación.

### Verificación

| | Resultado |
|---|---|
| `tsc` | limpio |
| Pruebas unitarias y de integración | **2308 en 145 archivos** (2294 al cerrar la fase B: +14: planificador de espinas y objetos, variantes del contrato) |
| E2E | **44/44 en producción** y **44/44 en desarrollo** (la pasada completa de desarrollo tuvo `hud` —un fallo por tiempo— y `hazard` —una prueba que medía el *blockout*— en rojo, y los dos en verde después: ver los problemas) |
| Llamadas de dibujo | R2 entera: **11 como máximo** en seis puntos del recorrido (presupuesto 60); R1, 13 |
| Memoria del arte en R2 | **26.6 MiB** residentes (5 páginas; presupuesto propuesto 32 MiB: el paquete de R2 añade 5.5 MiB) |
| Arranque en frío (200 KB) | **193.1 KB gz** (192.7 antes: +0.4) · *chunk* de arte 16.0 KB gz · primera sesión 224.3 KB gz |

> Sigue sin medirse nada en un dispositivo real.

### Pruebas que se adaptaron (y por qué)

`environment.test` (los pickups se piden por variante: 14 piezas), `missing.test` ×2 (12 → 14), `verifyArt.test` (el generador de paquetes completos etiqueta con `variant:`), `artRepo.test` (cinco paquetes y la lista honesta `STILL_THE_BLOCKOUT`, ahora de 4),
`playerArt` (E2E: cinco paquetes en la biblioteca) y `hazard` (E2E: medía las **puntas violeta** del *blockout*; ahora mide el color de aviso de las puntas —violeta del *blockout* **o** carmín del arte— con el mismo umbral). Ninguna prueba se bajó ni se borró.

### Problemas encontrados (y resueltos)

1. **Un corte plano a la vista** (la lámina negra en lo alto de la pantalla): las piezas del primer plano cuelgan del borde de la pantalla y, con la cámara más alta de R2 (el héroe sobre una repisa), su borde superior se veía. Guarda nueva + los compositores cuelgan desde `foregroundTop`. **Arreglaba también a R1** (sus hojas colgaban demasiado bajas).
2. **Los arcos colosales estaban cortados por el borde del dibujo** (desde la fase B): la parte alta del anillo caía fuera del lienzo. Ahora el anillo cabe entero (con su copa de hojas encima); R1 cambia un poco, a mejor.
3. **El santuario se perdía** (oscuro y pequeño al lado del arco): rediseñado un cuarto más grande, con el cristal en reposo visible, raíces más claras con nódulos de luz y un charco de luz en el fotograma encendido.
4. **Una raíz del suelo tapaba las espinas** (la escena la puso encima de la zona): movida fuera de 39.5 … 42.
5. **`hazard` medía el color del *blockout*** (violeta); ahora mide el aviso de las puntas sea cual sea el dibujo.
6. **`hud` rojo una vez en la pasada completa** («el segmento perdido deja un fantasma») y verde las demás veces: es una transitoria del HUD medida en tiempo real, sensible a la carga; no tiene que ver con el arte (pasó solo, y en la repetición dirigida). Queda anotado como **flaky por tiempo**, no como arreglado.

### Pendiente de la fase C (a propósito)

- **Revisión artística**: las raíces comparten una gramática (trenzas + nudos + ramas) que a ojo de ilustrador se repite; el santuario en reposo y las espinas son pequeños al lado del arco; el suelo del foso necesita charcos y estratos.
- **Calibración en dispositivo real**: legibilidad de las puntas carmín y del santuario en pantallas pequeñas.
- **R3, R4**: fases D y E.

## Fase D — R3 «Cámara del Sello» (S48)

**Resultado en una frase:** la tercera sala **se dibuja con arte pintado en el motor** —los tres paquetes compartidos más uno propio de R3 (`ruins-seal`): **la puerta del sello** (piedra con canales de runas cian que acaban en violeta), **el sigilo del sello** (dos fotogramas: colgado y destello),
**la carta del Spirit Bolt**, el altar, muros tallados, el portal de piedra, el empedrado ritual con su línea de luz y los círculos donde ponerse—, y el motor aprende a dibujar con arte **una cosa más que antes solo dibujaba el *blockout***: **el sello, que es una entidad**.
R3 no se da por terminada del todo: **el momento del Spirit Bolt** (la carga, el disparo, el impacto, la rotura del sello) conserva los efectos de siempre hasta la fase H.

### Qué se hizo

- **Contrato:** `role:seal` (un `blend:add` de dos fotogramas, colgado / destello; pivote en el centro) y la vista de la puerta del sello usa lo que ya existía (`material:seal`: cuerpo, cabeza con el rombo, pie y luz). La carta es `variant:card` (la tercera variante de la fase C).
  Una **regla de densidad**: las piezas `blend:add` de un mismo paquete forman la familia `light` y **comparten `ppm`** (todo lo aditivo de `ruins-seal` es 96 px/m).
- **Planificador puro** (`roomPlan.planSeals`, con 3 pruebas: la altura del sigilo es la del *blockout* —la mitad del alto del sello, con tope a 1.8 m—, un puesto por sello con los fotogramas del arte, y lo que falta se reporta por ranura).
- **Vistas.** El sello es una **entidad** (la sala la hace nacer), no una colocación de escena: `RoomArtView` crea un **`ArtSeal`** por sello y `SealView.dress(art)` lo **cuelga de la vista del sello**. El arte **lee los mismos tres números** que leía el *blockout* (`rejected`, `opacity`, `broken`) y no decide nada: respira, se encoge al golpe, se hincha al romperse, se enciende
  el destello al rechazar. Las formas del *blockout* **se ocultan, no se destruyen**: si la sala se reconstruye o el arte se suelta, el sello vuelve a ser el de formas en el mismo fotograma (2 pruebas). `EntityViews.each(kind, fn)` encuentra las vistas de un tipo.
- **El pintor de R3** (`tools/art/painter/seal.ts`): sigilo, carta, altar, relieves, pilastras y dintel del portal, empedrado, círculos de runas y trazo de runas. **Runas originales y abstractas** (trazos, anillos, marcas de cuenta: **ninguna letra de ningún alfabeto**, nada copiado). Una función común, `inlay`, **talla una máscara en la piedra**
  (más baja, más oscura, con luz emisiva dentro): todos los canales de luz del paquete salen de ella.
- **La composición** (`tools/art/scenes/r3.ts`): un camino ritual de piedra gastada con una línea de luz cian incrustada que va de la entrada al sello, sube a la repisa de la carta y sigue por la nave larga hasta el portal. **Cian es del héroe; violeta es del sello.**
- **Zonas:** los tres paquetes compartidos declaran ahora `r1_gate`, `r2_hall` **y** `r3_chamber`; `ruins-seal`, solo `r3_chamber` (se descarga al entrar y se suelta al salir).

### Los activos nuevos (todo de `tools/art`, estado `provisional`)

| Paquete | *Sprite sets* | Qué es |
|---|---|---|
| `ruins-seal` (nuevo, 96 px/m) | 16 | puerta del sello (cuerpo, cabeza, pie, resplandor), **sigilo** (2 fotogramas), **carta**, altar, 2 relieves, pilastra y dintel del portal, 3 empedrados, círculo de runas, trazo de runas |
| Escena `r3_chamber` | **93 colocaciones** (suelo y *props* 38, sello 31, fondos y primer plano 9, luz 15) | 370 *sprites* en pantalla |

El paquete pesa ≈ 0.8 MB en disco (4.2 MB descomprimido); entre los seis paquetes: 4109.6 KB en disco y 31507 KB descomprimidos.

### *Placeholders* quitados y los que quedan

- **Quitados en R3** (con `?visual=auto`): los **rectángulos de suelo, subida, repisa y puerta**; la **losa violeta de la puerta del sello** (el `drawSealDoor` del *blockout*); las **formas del sigilo** (rombo, halo y destello dibujados con `Graphics`); la **carta** (también `Graphics`); los **haces de las salidas** y las **cuatro capas de fondo planas**.
- **Quedan en R3:** el **momento del Spirit Bolt** —la carga, el proyectil, el impacto, el estallido del sello y su disolución— son los efectos de siempre (fase H); la puerta se desvanece con el fundido de siempre.
- **Quedan en el mundo** (el empaquetador lo lista, **un** aviso en `STILL_THE_BLOCKOUT` de `artRepo.test`, que ya no son cuatro): la **runa** del Air Dash (R4). **R4 y el jefe siguen siendo el bloqueo de siempre** (fases E y F).

### Archivos

Nuevos: `tools/art/painter/seal.ts`, `tools/art/scenes/r3.ts`, `art/ruins-seal/**`, `art/ruins-*/scenes/r3_chamber.json`, `public/art/ruins-seal/**`. Modificados: `src/presentation/{environment,roomPlan}.ts`, `src/render/{RoomArtView,SealView,EntityViews}.ts`, `src/app/{Game2D,testHooks}.ts`,
`tools/art/{packs/ruins,painter/{pieces,props}}.ts`, `art/index.json`, `public/art/index.json` y los manifiestos de los tres paquetes compartidos, 4 archivos de pruebas, `tools/e2e/scenario.ts` y 2 escenarios, `tools/assets/missing.ts`, la documentación.

### Verificación

| | Resultado |
|---|---|
| `tsc` | limpio |
| Pruebas unitarias y de integración | **2314 en 145 archivos** (2308 al cerrar la fase C: +6 — el planificador de sellos, la vista del sello con arte y el informe de entrega por variante) |
| E2E | **44/44 en producción** y **44/44 en desarrollo** (las dos pasadas completas, a la primera; `hud` también) |
| Llamadas de dibujo | R3 entera: **10 como máximo** en cinco puntos del recorrido (presupuesto 60); R1, 13; R2, 11 |
| Memoria del arte en R3 | **25.0 MiB** residentes (5 páginas; presupuesto propuesto 32 MiB); R1, 20.8; R2, 26.6 |
| Arranque en frío (200 KB) | **193.2 KB gz** (193.1 antes: +0.1) · *chunk* de arte 16.3 KB gz · primera sesión 224.7 KB gz |

> Sigue sin medirse nada en un dispositivo real.

### Pruebas que se adaptaron (y por qué)

`artRepo.test` (seis paquetes y la lista honesta `STILL_THE_BLOCKOUT`, ahora de **1**: solo la runa del Air Dash), `playerArt` (E2E: seis paquetes en la biblioteca) y `roomArt` (E2E: sección **G**, la de R3 —cada sólido, la puerta, el sello y la carta los dibuja el arte; el sigilo del arte cuelga de la vista del sello y las formas del *blockout* no se dibujan;
un golpe de espada rechazado enciende el destello del arte; la carta desaparece al cogerla; la puerta se desvanece al romperse el sello; ≤ 60 llamadas en cinco puntos; memoria bajo el presupuesto; con `art=` el sello vuelve a ser el de formas—). Ninguna prueba se bajó ni se borró.

### Problemas encontrados (y resueltos)

1. **El sigilo del arte nunca se colgaba de la vista del sello** (lo cazó la sección G de `room-art` en la primera pasada): `Game2D.dressRoom` buscaba el arte del sello por **el id de la entidad** (`seal#1`, que da la simulación) y el arte lo conoce por **el id de los datos de la sala** (`seal`). Ahora busca por `def.id`. El *blockout* siguió dibujando el sello correctamente mientras tanto: la guarda por ranura hizo que el fallo fuese **silencioso para el jugador** y visible solo en la prueba.
2. **La luz de un paquete tiene una sola densidad** (la comprobación por familia ya existía; lo aditivo de `ruins-seal` —resplandor de la puerta, sigilo, círculos y trazo de runas— se pinta todo a 96 px/m): la regla queda escrita en la guía (§7) y en M.10.

3. **`assets:missing` daba por «NO ENTREGADOS» el frasco y la carta que sí estaban entregados** (desde la fase C: el informe no miraba la variante de un objeto y los buscaba como `pickup` a secas; el empaquetador, que sí la mira, tenía razón). Corregido —un objeto se entrega por su variante y uno sin variante sirve a todas, la misma regla del empaquetador y del juego— con una prueba de regresión. Con eso el informe dice lo cierto: **13 de 14 piezas obligatorias** (solo falta la runa de R4).

### Pendiente de la fase D (a propósito)

- **Revisión artística:** el sigilo y la carta se leen bien pero son «de generador» (simetría perfecta, nada de mano); los relieves tallados repiten una gramática de anillos; el empedrado se repite cada 4 m.
- **El momento del Spirit Bolt** (fase H): la carga, el disparo, el impacto, el estallido del sello y el resplandor posterior.
- **Calibración en dispositivo real:** la legibilidad del sigilo violeta sobre el fondo azul en pantallas pequeñas.
- **R4 y el jefe:** fases E y F.

## Fase E — R4 «Santuario» (S49)

**Resultado en una frase:** la última sala **se dibuja con arte pintado en el motor** —los tres paquetes compartidos más uno propio de R4 (`ruins-sanctum`): **columnas más altas que la pantalla, dos guardianes de piedra, el muro con un ojo tallado detrás del lecho del Custodio, estandartes, un portal en cada extremo, el santuario del último descanso, la runa del Air Dash sobre su dais, tinta en el suelo y un anillo de luz fría en la arena**—, y con ella **todo el entorno que pide el mundo (las 14 piezas obligatorias) está entregado**: la lista de lo que sigue siendo *blockout* del entorno queda **vacía**.
**R4 no se da por terminada del todo**: el Custodio sigue siendo procedural (fase F), los avisos violeta y los efectos son los de siempre (fase H) y la lluvia, la carga y el resto de su presencia esperan a esas fases. No hizo falta **ningún cambio de motor**: R4 usa lo que las fases B–D ya enseñaron (puertas, santuario, objeto con variante `rune`, salidas).

### Qué se hizo

- **La composición, tres tramos que se distinguen antes de leer nada:** el **vestíbulo** (0 – 24), el último lugar tranquilo —un portal en el camino de vuelta, el santuario entre dos columnas, luz cian y, al fondo, **el primer rezume de la tinta** del Custodio bajo la puerta—; la **arena** (26.5 – 65.5), un salón hecho para parecer **más grande que la pantalla** —columnas que salen del encuadre, dos guardianes sobre los umbrales, el muro con el ojo **tras el lecho del Custodio**, estandartes, un anillo de luz fría en el suelo y **nada violeta en ese suelo salvo la tinta**: el violeta es el color de lo que hiere y tiene que ser lo único que grite—; la **recompensa** (67 – 99), tranquila otra vez —un dais bajo una columna de luz con la runa flotando encima y, al final, el portal que es la salida del mundo—. Un gradiente de tensión: **cian donde el héroe está a salvo, un poco de violeta donde está el Custodio**.
- **El salón vive en la capa de detrás (0.75)** y en **una sola densidad (40 px/m)**: son piezas más grandes que la pantalla y una columna no necesita los 96 del héroe para ser una columna. En el plano del héroe quedan el suelo, el empedrado, la tinta, el dais, las puertas, el santuario y la runa (a 96). La regla de familias de escala del contrato obligó a ello (ver los problemas).
- **Coordenadas de la capa de detrás:** como la capa se mueve 0.75 de lo que se mueve la cámara, una pieza en `x` aparece en el mundo en `x + 0.25 × cámara`. Se compone **en metros de la capa** —separando las piezas para que ninguna tape a otra— y se dejan libres los sitios que el ojo debe encontrar: detrás del santuario y del dais (nada oscuro donde está la luz) y el centro de la arena (el muro y el Custodio delante).
- **El pintor** (`tools/art/painter/sanctum.ts`): columna colosal (fuste con éntasis y estrías, tres collares con una línea de luz bajo cada uno, una columna de runas, **el borde alto se funde en la oscuridad**: nunca se ve un corte), guardián colosal (capa con capucha, hombros anchos, mangas que se juntan sobre el pomo de una espada clavada, dos rendijas cian; **el Custodio es uno de estos despertado**: misma capa, misma capucha), el muro con el ojo (hornacina de cabeza redonda con anillos y rayos tallados y una pupila violeta tenue), santuario (dais de tres escalones, dos obeliscos con runas, pedestal con cuenco, un cristal dentro de un anillo; **dos celdas: en espera y encendido** con un pilar de luz y un charco), runa del Air Dash (anillo, tres chevrones y tres estelas de velocidad), dais, charcos de tinta, estandartes, portal (muro con un vano apuntado, línea de luz en el borde, runas en las pilastras y un anillo sobre la clave), empedrado de tres estilos (guiones cian / marcas frías / doble línea) y el anillo de la arena. **Runas originales y abstractas** (ninguna letra de ningún alfabeto).
- **Zonas:** los tres paquetes compartidos declaran ya las cuatro salas; `ruins-sanctum`, solo `r4_sanctum`.

### Los activos nuevos (todo de `tools/art`, estado `provisional`)

| Paquete | *Sprite sets* | Qué es |
|---|---|---|
| `ruins-sanctum` (nuevo) | 18 | 2 columnas colosales, 2 guardianes, el muro con el ojo, 2 estandartes, el portal (los dos extremos con la misma pieza), el dais, 3 charcos de tinta, 3 empedrados, **el santuario** (2 fotogramas), **la runa del Air Dash**, el anillo de la arena |
| Escenas `r4_sanctum` | **100 colocaciones** (suelo y *props* 26, salón y suelo del paquete 48, fondos y primer plano 7, luz 19) | 411 *sprites* en pantalla |

El paquete pesa ≈ 0.8 MB en disco (5.6 MiB descomprimido); entre los siete paquetes: 4880.9 KB en disco y 37226 KB descomprimidos.

### *Placeholders* quitados y los que quedan

- **Quitados en R4** (con `?visual=auto`): los **rectángulos de suelo y muros**; las **dos puertas de la arena** (las losas violeta del *blockout*: ahora los pilares con runas del paquete compartido, que se cierran con la pelea); la **marca del santuario** (columna con cristal dibujada con `Graphics`); la **marca de la recompensa** (idem); los **haces de las dos salidas** y las **cuatro capas de fondo planas**.
- **Quedan en R4:** **el Custodio de Tinta** (procedural: fase F), **sus avisos violeta y sus golpes** (fase H) y la barra de vida.
- **Quedan en el mundo:** del **entorno**, nada: `STILL_THE_BLOCKOUT` de `artRepo.test` está **vacío** (el informe de entrega dice **14 de 14** piezas obligatorias). Siguen siendo *blockout*/procedurales: los **enemigos** (fase G), el **jefe** (F), los **efectos** (H) y, de la iluminación y el paralaje, lo que la fase I pula.

### Archivos

Nuevos: `tools/art/painter/sanctum.ts`, `tools/art/scenes/r4.ts`, `tests/unit/tools/sanctumScene.test.ts`, `art/ruins-sanctum/**`, `art/ruins-*/scenes/r4_sanctum.json`, `public/art/ruins-sanctum/**`. Modificados: `tools/art/{packs/ruins,painter/{pieces,seal}}.ts`, `art/index.json`, `public/art/index.json` y los manifiestos de los tres paquetes compartidos, `tests/unit/tools/artRepo.test.ts`, `tools/e2e/scenarios/{playerArt,roomArt}.ts`, la documentación. **Ningún archivo de `src/`.**

### Verificación

| | Resultado |
|---|---|
| `tsc` | limpio |
| Pruebas unitarias y de integración | **2319 en 146 archivos** (2314 al cerrar la fase D: +5, la composición de R4) |
| E2E | **44/44 en producción** y **44/44 en desarrollo** (las dos pasadas completas, a la primera) |
| Llamadas de dibujo | R4 entera: **17 como máximo** en siete puntos del recorrido, **18 en la pelea del jefe** (presupuesto 60); R1, 13; R2, 11; R3, 10 |
| Memoria del arte en R4 | **26.4 MiB** residentes (5 páginas; presupuesto propuesto 32 MiB); en la transición R3 → R4 conviven los dos paquetes de sala: ≈ 30.6 MiB |
| Arranque en frío (200 KB) | **193.2 KB gz** (sin cambios: la fase no toca `src/`) · *chunk* de arte 16.3 KB gz · primera sesión 224.7 KB gz |

> Sigue sin medirse nada en un dispositivo real.

### Pruebas que se adaptaron (y por qué)

`artRepo.test` (siete paquetes y `STILL_THE_BLOCKOUT` **vacío**: el último aviso, la runa de R4, ya no existe), `playerArt` (E2E: siete paquetes en la biblioteca) y `roomArt` (E2E: sección **H**, la de R4 —cada sólido, las dos puertas, las dos salidas, el santuario y la runa los dibuja el arte; las puertas se cierran al empezar la pelea; la runa no está hasta que cae el Custodio; ≤ 60 llamadas en siete puntos, de portal a portal; memoria bajo el presupuesto; con `art=` todo vuelve a ser el *blockout*—). Pruebas nuevas: `sanctumScene.test` (5: la composición como reglas —el suelo está empedrado de pared a pared y el empedrado nunca cubre una puerta, las piezas grandes del salón no se tapan entre sí, los estandartes no tapan el muro ni los portales, ninguna columna delante del muro del Custodio—). Ninguna prueba se bajó ni se borró.

### Problemas encontrados (y resueltos)

1. **La regla de familias de escala del contrato se negaba a las piezas de salón** (el empaquetador avisó): columnas a 56 px/m, portal a 48, dais y empedrado a 96, **todos en la familia «suelo»** (plano del héroe), y los guardianes a 32 con los estandartes a 40 en la de la capa de detrás. Un suelo con tres densidades es justo lo que la regla quiere evitar. Solución de arte, no de contrato: **todo lo monumental a la capa de detrás y a 40 px/m, todo lo del plano del héroe a 96**.
2. **Una trampa del paralaje:** con la cámara a distancias distintas, componer por `0.75 × X` hacía que un guardián y una columna de tramos vecinos se **montaran** (la capa de detrás «cabe» en 0.75 del mundo). Se compone en **metros de la capa**, con las separaciones a la vista, y las reglas de composición se guardaron como pruebas (`sanctumScene.test`): la primera ejecución cazó un solapamiento de 0.2 m entre el portal y la primera columna.
3. **La primera pasada era un neón:** columnas con collares y runas muy brillantes, el muro con el ojo más luminoso que el Custodio. Se bajó la luz tallada (collares 0.85 → 0.5, runas 0.7 → 0.42, ojo 0.6 → 0.32, portales 0.8 → 0.5) y se quitaron las marcas de los collares: **el héroe y el Custodio tienen que ser lo más claro de la arena**.
4. **El anillo del suelo cruzaba el aviso de la carga:** más tenue (alpha 0.85 → 0.6). El `boss` E2E mide los píxeles violeta de los avisos sobre la arena ya vestida (la carga 331 → 1005 px, la lluvia 1014 → 1182…) y pasa.
5. **El anillo de la arena pesaba en las tres salas de antes** (+0.3 MiB en R1–R3 por la página del paquete de luz): se movió al paquete de R4, que es su única sala.

### Pendiente de la fase E (a propósito)

- **Revisión artística:** el salón es **correcto y coherente** pero *de generador*: simetría perfecta, columnas con la misma gramática de collares y runas, guardianes casi gemelos, estandartes lisos; el empedrado se repite cada 4 m. Falta el ojo de un ilustrador para la escala real (un guardián de 15 m con un rostro, un muro con un relieve de verdad).
- **El Custodio** (fase F): con el salón vestido, es lo que más desentona —un pilar violeta procedural delante de un muro tallado—; sus avisos violeta (fase H) tienen que leerse **sobre este suelo**, que ya está fijado como oscuro y sin violeta.
- **Calibración en dispositivo real:** que el cian del anillo y de las runas no moleste en pantallas OLED pequeñas, y que los avisos violeta se lean en un teléfono.

## Fase F — el Custodio de Tinta (S50)

**Resultado en una frase:** el jefe **se dibuja con arte pintado en el motor**, por partes, en un séptimo paquete (`ink-warden`, el primero de la categoría `enemies`): **una capa de tinta mojada con la capucha puesta y una costura de glifos violeta, una ranura pálida donde estaría la cara, una corona de luz en tres estados (tenue, despierta, furiosa), dos esquirlas y el charco en el que duerme y en el que se derrite**. Es el mismo manto y la misma capucha que los guardianes de piedra del salón de detrás: **el Custodio es uno de ellos, despertado, y hecho de lo que mancha el suelo de la arena**.
**La lógica no cambia:** 36 de vida, la FSM, los dos ataques con sus avisos, el daño, la fase 2, las puertas, el *checkpoint* y la persistencia de la muerte son los de siempre; la vista lee el mismo estado y **las poses son las mismas cifras** con arte y sin él (una prueba lo exige). La arena, además, **contesta a la pelea**: el ojo del muro arde mientras el Custodio pelea y se cierra para siempre cuando cae, y la recompensa se enciende al caer.

### Qué se hizo

- **El pintor** (`tools/art/painter/warden.ts`): `wardenBody` (dos celdas: la tinta y la misma silueta en blanco, el destello de un golpe), `wardenEye`, `wardenCrest` (tres celdas), `wardenShard` y `wardenPool`. **Original y abstracto:** sin cara y sin miembros —una columna de tinta que se sostiene como un manto—. Violeta es el color de lo que hiere al héroe, y también el de esta pieza; la tinta es casi negra con un borde frío (la luz de la sala doblada hacia el violeta).
- **El paquete** (`tools/art/packs/ruins.ts#INK_WARDEN`): `category: "enemies"` (el pintor aprende `PackSpec.category` y `PackSpec.tags`), `zones: ["r4_sanctum"]`, 112 px/m: se descarga al entrar en R4 y se suelta al salir.
- **El contrato** (`src/presentation/bossArt.ts`, puro): `boss:<lookId>` y `part:<body|eye|crest|shard|pool>` dicen de quién es cada imagen y cuál; `bossArtIssues` (que usa `assets:check` para los paquetes `enemies`) exige un `idle`, avisa de la cresta con menos de tres fotogramas, del cuerpo sin destello, de dos imágenes para la misma parte, y de los jefes a los que les falta alguna parte. **Todas las partes o ninguna:** sin partes completas el juego sigue dibujando al jefe con las formas de siempre (9 pruebas).
- **El motor:** `RoomArtView` entrega las partes completas por `lookId` en `RoomArtCoverage.guardians` (por el mismo camino que el arte de la sala); `GuardianView.dress(art | null)` cuelga los *sprites* donde estaban las formas (se ocultan, **no se destruyen**: con `dress(null)` —la sala se reconstruyó, el arte se soltó bajo la vista— el jefe vuelve a ser el de formas **en el mismo fotograma**) y los alimenta con los mismos números de la pose; `Game2D` lo viste al vestir la sala y al nacer la vista (que puede ser una `LateView` cuyo código aún viene de camino). Los resplandores (aura, halo de la cresta, luz del ojo) siguen siendo luz suave compartida con los efectos; la luz del ojo se atenúa a 0.55 porque el ojo pintado trae su halo. Las marcas del suelo (los avisos violeta) no cambian: son de la fase H.
- **Una escena que contesta al mundo** (`roomScene`): `Placement.whenSet` / `whenClear` —una pieza que se ve mientras una bandera está puesta y/o mientras no lo está, con un fundido de 0.9 s al entrar y 0.6 s al salir y sin fundido la primera vez que se evalúa—. **El decorado solo lee las banderas** (`RoomArtView.update(dt, isSet)`): ninguna escena puede poner una, así que ninguna escena puede cambiar lo que decide una regla.
- **La arena contesta a la pelea** (`tools/art/scenes/r4.ts`): `eye_awake` (el ojo del muro arde mientras dura la pelea: `~fight:r4_boss` puesta y `defeated:r4_boss` no), `eye_dead` (una oscuridad suave sobre el ojo cuando el Custodio cae), una segunda capa del anillo de luz fría mientras dura la pelea, y la **recompensa**: la columna de luz del dais, el resplandor de la runa y el del portal de salida solo existen cuando `defeated:r4_boss` está puesta.

### Los activos nuevos (todo de `tools/art`, estado `provisional`)

| Paquete | *Sprite sets* | Qué es |
|---|---|---|
| `ink-warden` (nuevo, categoría `enemies`, 112 px/m) | 5 | `warden_body` (2 fotogramas: tinta, destello), `warden_eye`, `warden_crest` (3: tenue, despierta, furiosa), `warden_shard`, `warden_pool` |
| `ruins-sanctum` (ampliado) | +2 | `eye_awake` (luz sobre el ojo tallado) y `eye_dead` (la oscuridad que lo cierra) |
| Escena `r4_sanctum` | +7 colocaciones con condición | el ojo, el anillo, la luz de la recompensa |

El paquete del jefe pesa ≈ 190 KB en disco (1.35 MiB descomprimido); entre los ocho paquetes: 5179.1 KB en disco y 39106 KB descomprimidos.

### *Placeholders* quitados y los que quedan

- **Quitados** (con `?visual=auto`, y solo mientras el arte de la zona está en memoria): el **cuerpo del Custodio** (un pilar de `Graphics`: polígonos violeta), su **ojo**, las **dos esquirlas**, la **cresta** y el **destello del golpe** dibujados con formas; el **ojo del muro**, que era estático.
- **Quedan en R4 y en el jefe:** los **avisos violeta del suelo** (las marcas de la carga y de la lluvia, que son `Graphics`), la **lluvia de tinta**, **los impactos** y **la disolución al morir** —los efectos de siempre: fase H—, el **aura** (un resplandor suave genérico) y la **barra de vida** (es interfaz; no se rehace). Las formas siguen existiendo **solo como respaldo** (un jefe nunca queda a medio pintar si falta una parte).
- **Quedan en el mundo:** del entorno, nada. Siguen siendo procedurales los **enemigos** (fase G) y los **efectos** (fase H).

### Archivos

Nuevos: `src/presentation/bossArt.ts`, `tools/art/painter/warden.ts`, `tests/unit/presentation/bossArt.test.ts`, `art/ink-warden/**`, `art/ruins-sanctum/eye_awake/**`, `art/ruins-sanctum/eye_dead/**`, `public/art/ink-warden/**`.
Modificados: `src/app/{Game2D,testHooks}.ts`, `src/presentation/roomScene.ts`, `src/render/{GuardianView,RoomArtView}.ts` (7 archivos de `src/`: es la primera fase desde la C que toca el motor), `tools/art/{build,spec}.ts`, `tools/art/packs/ruins.ts`, `tools/art/painter/{pieces,sanctum}.ts`, `tools/art/scenes/r4.ts`, `tools/assets/verify.ts`, `tools/e2e/scenario.ts`, `tools/e2e/scenarios/{playerArt,roomArt}.ts`, `art/index.json`, `public/art/index.json`, los manifiestos y escenas de `ruins-sanctum` y `ruins-light`, 4 archivos de pruebas, la documentación.

### Herramientas usadas

`npm run art:build -- --pack ink-warden` (el pintor), `npm run assets:check` / `assets:pack` (validación y empaquetado), el laboratorio visual de la sesión (`sheet.mts`: hojas de contacto de cada parte; capturas de la arena con el Custodio dormido, despierto, furioso y caído), `?visual=art|placeholder|auto` (para comparar con y sin arte), `window.__troid.state().roomArt.guardians` y `roomArtGates` (los ganchos de pruebas), `npm run bench:bundle`.

### Verificación

| | Resultado |
|---|---|
| `tsc` | limpio |
| Pruebas unitarias y de integración | **2339 en 147 archivos** (2319 al cerrar la fase E: +20 —`bossArt` 9, `GuardianView` con arte 7, `placementShown` y la lectura de condiciones 3, la composición del ojo 1—) |
| E2E | **44/44 en desarrollo** y **44/44 en producción** (en producción `room-art` falló una vez por la sonda de mi propia prueba, ver el problema 7, y pasó tras corregirla; los otros 43, a la primera) |
| Llamadas de dibujo | R4: **17 como máximo** en siete puntos del recorrido (`room-art`); **20 en la pelea del jefe** (`boss`, `boss-death`; eran 18 con las formas: +2, probablemente por las partes aditivas del cuerpo —destello, ojo, cresta— que cortan el lote entre las normales) · 19 en `finale` · 15 en `world-art` (presupuesto 60) |
| Memoria del arte en R4 | **28.2 MiB** residentes (6 páginas; 26.4 antes del jefe); en la transición R3 → R4 conviven los paquetes de las dos salas (≈ 32 MiB, bajo el techo propuesto de 96 MiB) |
| Arranque en frío (200 KB) | **193.3 KB gz** (193.2 antes: +0.1) · *chunk* de arte 17.0 KB gz (+0.7) · *chunk* del jefe 3.9 KB gz (+0.4) · primera sesión 226.0 KB gz (+1.3) |

> Sigue sin medirse nada en un dispositivo real.

### Pruebas que se adaptaron (y por qué)

`artRepo.test` (ocho paquetes: el del jefe, `provisional` y empaquetado), `playerArt` (E2E: ocho paquetes en la biblioteca), `sanctumScene.test` (la regla «las piezas grandes del salón no se tapan entre sí» exime a las que contestan a una bandera —el ojo que arde y el que se cierra yacen sobre el muro a propósito—; y una prueba nueva fija que comparten **el centro del ojo tallado**) y `roomArt` (E2E: sección **I**, la del jefe —sus cinco partes las tiene el arte, el jefe se dibuja con ellas y no con las formas; el ojo del muro está apagado antes de la pelea, arde con `~fight:r4_boss` y se cierra con `defeated:r4_boss`; la recompensa no existe hasta que cae; el decorado no pone ninguna bandera; una sala reconstruida con el Custodio caído enseña el ojo cerrado de golpe, sin fundido; con `art=` el jefe vuelve a ser el de formas—). Ninguna prueba se bajó ni se borró.

### Problemas encontrados (y resueltos)

1. **El contrato de `decor` rechazaba los ojos superpuestos** (pivote `[0.5, 0.5]`; el contrato exige `[0.5, 1]` para toda pieza de escena): se pintaron con el pivote abajo y la escena los sube lo que falta (`EYE_Y = 6.9 − 4.2`). Lo cazó `assets:check`.
2. **Avisos de borde en el paquete `enemies`** (el ojo y la esquirla tocaban los lados del lienzo, y la regla de este tipo de paquete es que el alfa no los toque): lienzos más grandes con el halo **dentro** de la imagen.
3. **`eye_dead` salía como un anillo, no como una oscuridad** (al pintarla pequeña, 1.6 m, el radio del degradado seguía siendo el del lienzo grande): el radio sale ahora de `min(w, h) / 2`.
4. **La primera versión del cuerpo tenía «pies» con bolas en las puntas del dobladillo** (se leían como miembros, justo lo que el diseño no quiere): lenguas irregulares con hilos finos.
5. **Un fallo de prueba, no de producto:** la primera expectativa de la vista vestida esperaba un `Graphics` aditivo visible que no existe (el suelo es otro `Graphics`); se corrigió a lo que el contrato dice de verdad.
6. **Los avisos violeta se leen mejor, no peor:** el pilar de formas era violeta y el Custodio pintado es casi negro; el `boss` E2E (que cuenta los píxeles violeta de los avisos sobre la arena ya vestida) pasa de *carga 331 → 1005 px, lluvia 1014 → 1182* a *carga 164 → 888, lluvia 840 → 1144*: el fondo violeta baja y el salto del aviso sube (+724 frente a +674).
7. **La sonda del jefe en `room-art` usaba el nombre de la clase** (`constructor.name === 'Graphics'`): en desarrollo funcionaba y en producción (`vite build` minifica las clases) no hay nombres, así que el escenario fallaba solo en la pasada de producción. Ahora identifica el nodo por cómo se renderiza (`renderPipeId`: `graphics` / `sprite`), que sobrevive a la minificación. Era la prueba, no el juego.

### Pendiente de la fase F (a propósito)

- **Revisión artística:** el Custodio es **correcto y coherente** pero «de generador»: simetría casi perfecta, un dobladillo que gotea siempre igual, la costura de glifos repetida; **no tiene un animador que le dé peso**: se mueve entero (se hunde, se inclina, se levanta), sin deformarse ni cambiar de fotograma salvo la cresta. Un ilustrador debería darle una silueta más reconocible en la oscuridad y un par de poses propias (el aviso y el golpe).
- **Los avisos violeta, la lluvia de tinta, los impactos y la muerte** (fase H). Con el Custodio y la arena ya vestidos, los avisos del suelo —`Graphics` planos— son lo que más desentona en R4.
- **Calibración en dispositivo real:** que el Custodio (casi negro) se lea sobre el suelo de la arena en una pantalla pequeña, y que los avisos violeta ganen al ojo y a la corona.

## Fase G — el Ink Slime (S51)

**Resultado en una frase:** el enemigo ordinario **se dibuja con arte pintado en el motor y con identidad propia**: ya no es una cúpula de tinta con dos ojos (la *baba* de todos los juegos) sino **una criatura baja y encorvada, hermana pequeña del Custodio** —el lomo alto con la cresta echada hacia atrás como la punta de una capucha, un hueco donde estaría el cuello, una cabeza baja con la frente sobre dos rendijas pálidas e inclinadas, la capa arrastrando por el suelo—, con **un sigilo violeta ardiendo en el pecho** (una astilla del sello: brasa mientras duerme, blanco incandescente cuando se prepara) y **una cerda de espinas de tinta que se levanta por el lomo mientras el aviso crece** (el *telegraph* se lee en la silueta antes que en el color). **La lógica no cambia** (3 de vida, la FSM, el aviso de 24 ticks, la embestida, la ventana de castigo, la muerte en 40 ticks): la vista lee el mismo estado y **las poses son las mismas cifras** con arte y sin él (una prueba lo exige).

### Qué se hizo

- **La decisión de contrato:** el arte va **por partes** (como el Custodio, §M.12) y no por clips, porque la simulación da al Slime un estado «agotado tras la embestida» (`idle` con `phase: 'recovery'`) que el vocabulario de clips del héroe no tiene, y la pose procedural ya sabe aplastarse, estirarse y desplomarse a lo largo de los 24 + 10 + 36 ticks de un ataque. El arte pone **las imágenes**; la vista conserva **la pose**.
- **El pintor** (`tools/art/painter/slime.ts`, más `ink.ts`, el material de tinta que ahora comparten el Custodio y el Slime —refactor sin cambiar un píxel del Custodio: el paquete se repinta idéntico—): el cuerpo en **cuatro fotogramas que «hierven»** (la superficie nunca descansa: el truco de la animación dibujada a mano para mantener viva la tinta; el ruido viaja en un círculo del espacio de ruido, así que el bucle cierra), su destello blanco, las dos rendijas, el sigilo (un rombo en un anillo con cuatro marcas), la cerda en tres estados (con un hilo de violeta en el borde y la punta caliente) y el charco con sus tentáculos. Iluminado desde arriba (el Slime se refleja con su orientación: su luz no puede venir de un lado).
- **El paquete** (`tools/art/packs/ruins.ts#INK_SLIME`): `category: "enemies"`, `zones: ["r1_gate", "r2_hall"]` (las dos salas donde vive uno), 96 px/m, seis *sprite sets*; las posiciones de los ojos y del sigilo viajan como **anclas del cuerpo** (`head` y `vfx_origin`), con una sola fuente (`SLIME_EYES`, `SLIME_SIGIL`, que el pintor y el paquete comparten; una prueba lo guarda).
- **El contrato** (`src/presentation/enemyArt.ts`, puro, gemelo de `bossArt`): `enemy:<lookId>` y `part:<body|flash|eyes|sigil|spines|pool>`; `enemyArtIssues` (que usa `assets:check`) exige un `idle`, avisa de la cerda con menos de tres estados, de dos imágenes para la misma parte, de las partes que faltan y de un cuerpo **sin las anclas**. **Todas las partes (y las dos anclas) o ninguna.** (`part:` lo comparten el escenario, los jefes y los enemigos: ahora cada lector solo mira los *sprites* que nombran a los suyos con `boss:` o `enemy:`.)
- **El motor:** `RoomArtView` entrega las criaturas completas por `lookId` en `RoomArtCoverage.creatures`; `ProceduralActor.dress(art | null)` cuelga los *sprites* donde estaban las formas (se ocultan, **no se destruyen**) y los alimenta con los números de la pose: el cuerpo cambia de fotograma a su ritmo (congelado en un *hit-stop*), los ojos se cierran con el parpadeo, el sigilo sube con el brillo de los ojos, la cerda con el aviso (nada por debajo de 0.2, algunas hasta 0.55, todas desde ahí), el charco se ensancha al aplastarse y es lo último en irse al morir; `Game2D` lo viste al vestir la sala y al nacer la vista.

### Los activos nuevos (todo de `tools/art`, estado `provisional`)

| Paquete | *Sprite sets* | Qué es |
|---|---|---|
| `ink-slime` (nuevo, categoría `enemies`, 96 px/m) | 6 | `slime_body` (4 fotogramas: el hervor, con las anclas), `slime_flash`, `slime_eyes`, `slime_sigil`, `slime_spines` (3 estados), `slime_pool` |

El paquete pesa ≈ 0.1 MB en disco (0.53 MiB descomprimido); entre los nueve paquetes: 5262.7 KB en disco y 39646.8 KB descomprimidos.

### *Placeholders* quitados y los que quedan

- **Quitados** (con `?visual=auto`, y solo mientras el arte de la zona está en memoria): **la cúpula de `Graphics`** (cuerpo, borde violeta y brillo), **las dos cápsulas de los ojos** y **el destello del golpe** dibujados con formas. Las formas quedan solo como **respaldo** (una criatura nunca queda a medio pintar).
- **Quedan:** el **aura** violeta del aviso (un resplandor suave genérico compartido con los efectos), y **los efectos del aviso, de los golpes y de la muerte** (el anillo que se cierra, las motas, la tinta que salpica, el arco del tajo que tapa al Slime al golpearlo): **fase H**.
- **Quedan en el mundo:** los **efectos** (H) y, de la iluminación y el paralaje, lo que la fase I pula. Del entorno, los enemigos y los jefes, **nada** es ya una forma de `Graphics` salvo como respaldo.

### Archivos

Nuevos: `src/presentation/enemyArt.ts`, `tools/art/painter/{ink,slime}.ts`, `tests/unit/presentation/enemyArt.test.ts`, `tests/unit/tools/slimeArt.test.ts`, `art/ink-slime/**`, `public/art/ink-slime/**`.
Modificados: `src/app/{Game2D,testHooks}.ts`, `src/presentation/bossArt.ts` (solo lee los `part:` de quien nombra un jefe), `src/render/{ProceduralActor,RoomArtView}.ts` (5 archivos de `src/`), `tools/art/{build,spec}.ts` (`anchors` en el *sprite set*), `tools/art/packs/ruins.ts`, `tools/art/painter/{pieces,warden}.ts` (el Custodio importa la tinta compartida), `tools/assets/verify.ts`, `tools/e2e/scenario.ts` y 2 escenarios, `art/index.json`, `public/art/index.json`, `tests/unit/render/proceduralActor.test.ts`, `tests/unit/tools/artRepo.test.ts`, la documentación.

### Herramientas usadas

`npm run art:build -- --pack ink-slime`, `assets:check` / `assets:pack`, hojas de contacto y un compositor de estados del laboratorio de la sesión (el Slime en reposo, alerta, aviso, embestida y herido, a 1× y a la densidad de un teléfono), capturas de la pelea con la cámara de R1 a 1× y a 2×, `?visual=art|placeholder|auto`, `window.__troid.state().roomArt.creatures`, `npm run bench:bundle`.

### Verificación

| | Resultado |
|---|---|
| `tsc` | limpio |
| Pruebas unitarias y de integración | **2361 en 149 archivos** (2339 al cerrar la fase F: +22 — `enemyArt` 11, la vista del enemigo vestida 8, el paquete del Slime 3) |
| E2E | **44/44 en desarrollo** (la cadena se interrumpió en el escenario 31 por un reinicio del entorno y se reanudó: los 30 anteriores y los 14 restantes, todos en verde) y **44/44 en producción** |
| Llamadas de dibujo | `slime` 5 (7 en el peor momento) · `r1` 15 en la peor del recorrido · `boss` 19, `boss-death` 20, `finale` 20, `world-art` 15 · `soak` 22 y 300 partículas (presupuesto 60) |
| Memoria del arte | R1 **21.3 MiB** (20.8 antes: +0.5) y R2 **27.1 MiB** (26.6): el paquete del Slime es **una página** de 0.53 MiB que solo se retiene en esas dos salas; R3 y R4, sin cambios |
| Arranque en frío (200 KB) | **193.9 KB gz** (193.3 antes: +0.6, el `dress` de `ProceduralActor` y la lectura de las criaturas en `RoomArtView`) · *chunk* de arte 17.2 KB gz · primera sesión 226.9 KB gz |

> Sigue sin medirse nada en un dispositivo real.

### Pruebas que se adaptaron (y por qué)

`artRepo.test` (nueve paquetes: el del Slime, `provisional` y empaquetado), `playerArt` (E2E: nueve paquetes en la biblioteca) y `roomArt` (E2E: sección **J** —los dos Slimes, el de R1 y el de R2, los dibuja el arte (sus seis partes, ninguna forma), la cerda está abajo mientras duerme y **sube cuando el aviso está a punto de cumplirse**, ≤ 60 llamadas, con `art=` el Slime vuelve a ser el de formas y R3, que no guarda su arte, no lo dibuja—). Pruebas nuevas: `enemyArt.test` (11: leer las etiquetas, agrupar las partes, validar el paquete y que un jefe y un enemigo no se confundan), `proceduralActor.test` (+8: las partes se cuelgan donde estaban las formas, el cuerpo «hierve», la cerda sube con el aviso, el sigilo es brasa o blanco, el charco, **las mismas cifras de pose con arte y sin él en nueve estados**, el arte que se suelta, el que se retira bajo la vista) y `slimeArt.test` (3: las anclas del paquete son las del pintor y el paquete que se publica es una criatura entera). Ninguna prueba se bajó ni se borró.

### Problemas encontrados (y resueltos)

1. **El lector de etiquetas del jefe habría rechazado el arte del Slime** (visto al leer la comprobación contra el paquete nuevo, antes de ejecutarla): `readBossTags` leía `part:eyes` de un *sprite* que no nombra ningún jefe y lo daba por «parte que no es de un jefe» (un **error**). Ahora cada lector (`bossArt`, `enemyArt`) solo mira los *sprites* que nombran a los suyos (`boss:` / `enemy:`), con una prueba de regresión cruzada.
2. **La primera silueta no se leía como una criatura**: con un solo pico y una pendiente larga era una colina (o la aleta de un tiburón). Se le dio **cabeza** (un lóbulo bajo con la frente sobre los ojos) y **un hueco de cuello** entre el lomo y la cabeza; el pico quedó como el único gesto de la capucha.
3. **Los ojos se salían de la cabeza** (la rendija de delante sobresalía de la silueta y flotaba en el aire): se movieron dentro y se hicieron más gruesos y más inclinados.
4. **Las puntas de la cerda parecían puntos sueltos** (el hilo de las espinas era oscuro y solo se veían los brillos de las puntas): ahora cada espina lleva su hilo de violeta en el borde y las puntas son más pequeñas; y **tocaban el borde alto del lienzo** (el aviso de `assets:check`): el lienzo pasó de 1.3 a 1.45 m.
5. **El charco no sobrevivía lo bastante al cuerpo al morir** (lo cazó la prueba de pose: `1 − t³` solo le daba 0.14 de ventaja sobre la opacidad del cuerpo a mitad de la muerte): `1 − t⁴`.
6. **Un reinicio del entorno mató la cadena de E2E a media pasada** (escenario 31 de 44): el *script* es reanudable (salta lo ya hecho) y se repitió desde ahí; no es un fallo del juego ni de una prueba.

### Pendiente de la fase G (a propósito)

- **Revisión artística:** el Slime es **correcto y coherente** pero «de generador»: su silueta es una curva y no el dibujo de una ilustradora; el «hervor» son cuatro variaciones de ruido, no un animador; **los dos Slimes son idénticos** (R1 y R2); no tiene poses propias de la embestida ni del aturdimiento (se aplasta y se estira entero).
- **Los efectos que lo rodean** (fase H): el anillo violeta que se cierra, las motas, la tinta que salpica al morir (hoy unas bolas violetas con un anillo oscuro que desentonan) y el arco blanco del tajo, que al golpearlo **tapa al Slime entero** (lo vio la pelea capturada a 1× y a 2×).
- **Calibración en dispositivo real:** el Slime mide 1.1 m y a 1× son ≈ 29 px de ancho: que el sigilo, la cerda y los ojos se lean en un teléfono pequeño —y que **la silueta encorvada se distinga del suelo** de R1 y R2— es lo primero que un dispositivo debe confirmar.

## Fase H — la luz (S52)

**Resultado en una frase:** los efectos dejan de ser datos con formas dibujadas por código y pasan a ser **luz producida**: dos paquetes nuevos de arte (`vfx-shapes`, las **diez formas** de las que están hechas las partículas y los destellos, y `vfx-flipbooks`, las **doce secuencias** de los momentos grandes) **arrancan con el juego**, y los efectos dibujan con ellas —**el corte de la espada que barre, el fogonazo de un golpe, el *Spirit Bolt* por etapas (carga, lanzamiento, vuelo, impacto, resplandor), la tinta que salta de lo que cae, el pilar de luz de un lugar que despierta, la runa de un poder ganado, los avisos y la columna de tinta del jefe**—, con luz **detrás** del héroe para que su silueta oscura se recorte contra ella. **La lógica no cambia** (un evento de aviso nuevo, `skill:castStarted`, que no altera nada de lo que ocurre) y **sin el arte todo es como era**: cada momento sigue entero (los efectos hechos de una secuencia simplemente no se juegan y los demás lo llevan).

### Qué se hizo

- **El pintor de la luz** (`tools/art/painter/vfx.ts`, ~1100 líneas; determinista; máscaras **blancas** hechas con el lienzo del navegador): las diez formas (`glow`, `spark`, `shard`, `ring`, `rune`, `dust`, `ink`, `streak`, `arc`, `chevron`) y las doce secuencias (`slash_body/edge`, `impact`, `bolt_body/core`, `bolt_impact`, `ink_splash(+gloss)`, `ink_column(+glow)`, `pillar`, `aura`), cada una pensada para leerse **al tamaño de un teléfono** (formas gruesas, núcleo caliente, borde limpio). Dos paquetes de la categoría **`vfx`** (`tools/art/packs/vfx.ts`), **`load: "boot"`** y sin zonas: las formas, **todas en una sola página** (las partículas se dibujan desde una textura); las secuencias, **repintadas al 0.75** de su tamaño (`SpriteSpec.scale`, `Cut.scale`: se pintan a tamaño completo y se remuestrean: **−1.2 MiB residentes** de luz que ya es blanda).
- **El contrato** (`presentation/vfxArt`, puro): `vfx:shape` + `shape:<nombre>` y `vfx:seq` + `seq:<nombre>`; `vfxArtIssues` y `vfxCoverageIssues` (los dos paquetes juntos) en `assets:check`: **error** si una etiqueta no nombra nada o nombra dos, o si falta el clip `idle`; **aviso** si una forma tiene más de un fotograma, si dos *sprites* reclaman el mismo nombre, si las formas están en más de una página o si falta alguna.
- **El motor:** `assets/vfxArtAtlas#createArtVfxAtlas(art, base)` construye el atlas **encima del propio del juego** (las formas del arte solo si son las diez en una sola página; cada secuencia con todos sus fotogramas; el tamaño **original** del fotograma, porque el empaquetador recorta); `Game2D` lo adopta tras `art.start()` y reconstruye los efectos; `?vfx=procedural` lo impide. `FlipbookVfx` (`kind: 'flipbook'`: su vida es la del dato, cuenta como un *sprite*, se coloca por el pivote del arte; **sin la secuencia no se juega** y no es el presupuesto soltándolo: `stats.unplayed`); `ArcVfx.sequences` (el corte pintado, **solo con las dos secuencias**, con la caja del *hitbox* agrandada por el factor del arte, sin girar —barre solo— y volteado para el remate, que sube); `FlashVfx.offset | turn`; `ParticleVfx.inward` (la luz que se **junta**); **`fxBack`**, la capa aditiva nueva **detrás de los actores**, en el contrato del entorno; los tres sitios donde se dibujan *sprites* comparten **un** presupuesto (un fallo que cazó una prueba, abajo).
- **Los disparadores** (21 → **25**): **`boltCharge`** (el único evento nuevo de la simulación, `skill:castStarted`, avisa al empezar la preparación del rayo), **`checkpoint`** (antes era el brillo de una botella), **`abilityGained`** (`ability:unlocked`) y **`sealBroken`** (el `actor:died` de algo neutral: antes un sello que se rompía jugaba la muerte de una criatura). El contrato (`VFX_CONTRACT`, `WORST_MOMENTS` con tres momentos nuevos, `FlipbookVfx` en `triggerCost`/`checkVfxContract`) los mide.
- **El momento del *Spirit Bolt*, por etapas:** *carga* (anillo que se cierra, luz que crece, chispas que **entran**), *lanzamiento* (destello, anillo, rayo hacia delante, brillo de la mano), *trayectoria* (`ProjectileView` con el rayo pintado: gota con llamas que arden en bucle, corazón blanco, crece en una décima al salir de la mano), *impacto* (chispas, destello, anillo, la flor de puntas con arcos de choque) y *resplandor remanente* (0.8 s), más **el sello que se rompe** con su propio estallido.
- **El jefe:** `render/GuardianMarks` —**los avisos del suelo ya no son geometría**: la lluvia es una runa tumbada que gira, un anillo que se cierra, otro blanco que se cierra más deprisa y una columna de luz que sube; la embestida, una banda de luz, una línea brillante hacia donde terminará y *chevrons* que apuntan hacia donde se deslizará—, la **columna de tinta** donde cae cada golpe, la runa de su despertar y de su furia, y la **salpicadura enorme** de su caída.
- **La luz que lleva el héroe** (`AMBIENT_CONTRACT`): una mota de energía cian cada 0.35 s con la magia llena (el nivel al cuadrado la espacia; ninguna con la magia gastada o el héroe caído): **≤ 8 vivas a la vez**, la primera que el presupuesto suelta.
- **Resto de momentos:** el tajo y el fogonazo del golpe (y del daño recibido), dos *chevrons* de velocidad del *dash*, la runa que se cierra sobre el enemigo que se prepara, la salpicadura de tinta de su muerte, el pilar de luz de un lugar que despierta y la runa grande de un poder ganado (**detrás** del héroe), la columna de luz que sube cuando el héroe cae.
- **Herramientas de la sesión** (no entran en el repositorio salvo lo marcado): `tools/e2e/.lab/vfx-game.ts` (cada momento **en el juego real**, a tiempos fijos del reloj de los efectos), hojas de contacto compuestas del pintor, y —en el repositorio— `window.__troid.advanceEffects(s)` (los efectos están quietos mientras el juego está en pausa) y `window.__vfx.look()/setAmbient()` en el laboratorio.

### Los activos nuevos (todo de `tools/art`, estado `provisional`)

| Paquete | *Sprite sets* | Qué es |
|---|---|---|
| `vfx-shapes` (nuevo, categoría `vfx`, `boot`, 100 px/m) | 10 | las diez formas de la luz, en **una** página (0.53 MiB) |
| `vfx-flipbooks` (nuevo, categoría `vfx`, `boot`, 75 px/m) | 12 | las doce secuencias (corte, fogonazo, rayo y su impacto, tinta, columna, pilar, llama) (**1.89 MiB**, de 3.06 al 100 %) |

Entre los **once** paquetes: 5559.1 KB en disco y 42116.8 KB descomprimidos.

### *Placeholders* quitados y los que quedan

- **Quitados** (mientras el arte de la luz está en memoria, que es **desde el arranque**): **el creciente blanco de `ArcVfx`** como único tajo (queda como respaldo), **el destello redondo como único impacto**, **las bolas violetas** de la muerte del enemigo (ahora la salpicadura de tinta), **el brillo de una botella** que hacía de *checkpoint*, **la muerte de criatura** que jugaba un sello al romperse, **la geometría de `Graphics`** de los avisos del jefe (elipses y bandas dibujadas cada fotograma: ahora *sprites* de las formas de la luz; la geometría solo queda como respaldo), **los dos *streaks* y las dos luces** del rayo en vuelo (ahora el rayo pintado; quedan como respaldo).
- **Quedan:** las **partículas** son datos (cuentas, vidas, gravedad) hechos de formas pintadas; **no hay diseño de efecto a mano**; el **aura** violeta del Slime y del jefe es un resplandor suave genérico; **el héroe no tiene aura ni efecto propio** (a propósito: el diseño del protagonista es la imagen de referencia del usuario y no se retoca); no hay pantalla de efectos (destellos de pantalla, viñeta de daño).

### Archivos

Nuevos (src): `src/presentation/vfxArt.ts`, `src/assets/vfxArtAtlas.ts`, `src/render/GuardianMarks.ts`. Nuevos (tools/arte): `tools/art/painter/vfx.ts`, `tools/art/packs/vfx.ts`, `tools/e2e/scenarios/vfxArt.ts`, `art/vfx-shapes/**`, `art/vfx-flipbooks/**`, `public/art/vfx-shapes/**`, `public/art/vfx-flipbooks/**`. Nuevos (tests): `tests/unit/presentation/vfxArt.test.ts`, `tests/unit/vfx/paintedLight.test.ts`, `tests/unit/render/guardianMarks.test.ts`, `tests/unit/tools/vfxPacks.test.ts`.
Modificados (src, 18): `src/app/{Game2D,art,effects,options,testHooks}.ts`, `src/app/labs/vfxLab.ts`, `src/assets/vfxAtlas.ts`, `src/content/vfx.ts`, `src/gameplay/events.ts`, `src/player/PlayerController.ts` (la emisión de `skill:castStarted`), `src/presentation/{environment,vfx,vfxContract}.ts`, `src/render/{GuardianView,ProjectileView,layers}.ts`, `src/vfx/{VfxDirector,VfxSystem}.ts`. Modificados (tools): `tools/art/{build,spec}.ts` y `painter/{entry,pieces}.ts`, `tools/assets/verify.ts`, `tools/e2e/{run,scenario}.ts` y 4 escenarios, `art/index.json`, `public/art/index.json`, la documentación.

### Herramientas usadas

`npm run art:build -- --pack vfx-flipbooks` (2 s), `assets:check` / `assets:pack`, hojas de contacto de las secuencias compuestas con su teñido y su mezcla (`sheet-comp`, `sheet-shapes`), **el laboratorio de efectos en el juego real** (`vfx-game.ts`: cada momento a tiempos fijos, a 7 m de altura de vista y ampliado), `?lab=vfx` (con y sin `&vfx=procedural`, y `&ambient=`), `?vfx=procedural`, `window.__troid.state().vfxLook | looks | vfx.unplayed`, `npm run bench:bundle`.

### Verificación

| | Resultado |
|---|---|
| `tsc` | limpio |
| Pruebas unitarias y de integración | **2430 en 153 archivos** (2361 al cerrar la fase G: **+69** —64 en los cuatro archivos nuevos: `vfxArt` 13, `paintedLight` 34, `guardianMarks` 10, `vfxPacks` 7; y 5 casos más en los adaptados—) |
| E2E | **45/45** en desarrollo y **45/45** en producción, sobre el código final, con la consola limpia (45 escenarios: el nuevo, `vfx-art`). Una pasada intermedia de producción falló en `boss-death` (problema 11: una carrera de la prueba, arreglada en la prueba) |
| Llamadas de dibujo | **22 como máximo** (`soak`: 1600 rondas de juego aleatorio, con 300 partículas; 21 en la derrota del jefe, 20 en su pelea, 17 con la luz pintada y en R4; 5 con el momento más pesado del laboratorio); presupuesto 60 |
| Memoria del arte | R1 23.7 · R2 29.5 · R3 27.4 · **R4 30.6 MiB** residentes (propuesto: ≤ 32 por zona; los once paquetes, 5559 KB en disco y 42 117 KB descomprimidos: la luz son 296 KB en disco y 2.4 MiB residentes) |
| Arranque en frío (200 KB) | **194.7 KB gz** (193.9 antes: +0.8 — el evento, `inward`, las dos formas del atlas propio y la vista del rayo) · *chunk* de efectos 8.0 + 4.9 KB gz · *chunk* de arte 18.0 KB gz · primera sesión 231.8 KB gz |

> Sigue sin medirse nada en un dispositivo real.

### Pruebas que se adaptaron (y por qué)

`artRepo.test` (once paquetes), `playerArt` (E2E: once paquetes en la biblioteca), `vfx` (E2E: los 23 disparadores del laboratorio —el laboratorio no reproduce `ambient`, que no es un disparador—, el arte es el del laboratorio y el respaldo `?vfx=procedural` también juega cada momento entero), `combat` (E2E: «ningún efecto vivo» pasa a «ningún *sprite* y ≤ 8 partículas: la luz del propio héroe»), `boss-death` (E2E: la huella de la sala se toma **con la sala vestida**, no antes —ver el problema 11—), `vfxContract.test` (los cuatro disparadores nuevos, y que un evento sin lugar —`ability:unlocked`— nace donde está el héroe), `sealVfx.test` (un sello que se rompe ya **no** juega la muerte de una criatura: tiene la suya, en violeta y blanco-cian, y es lo más grande de sus efectos), `pickupVfx.test` (un santuario ya **no** es el brillo de una botella: es el despertar del lugar), `vfxMath.test` (la lista de disparadores, `flipbook`, `flipY`), `tests/helpers/vfx.ts` (el atlas de prueba con las diez formas y las secuencias) y la prueba del contrato del entorno (`fxBack` en `ENV_LAYERS`). Pruebas nuevas: `vfxArt` (13), `paintedLight` (34: el atlas del arte —todo o nada—, la secuencia a lo largo de su vida, **sin secuencia no se juega y no es el presupuesto**, la tinta y la luz de detrás en su capa, el corte pintado, las partículas que se juntan, el rayo pintado, la luz del héroe y el contrato que la acota), `guardianMarks` (los avisos pintados, la embestida, la vista con y sin las formas) y `vfxPacks` (lo que el pintor declara es lo que el juego nombra, los pivotes, lo que se publica). Ninguna prueba se bajó ni se borró.

### Problemas encontrados (y resueltos)

1. **El corte pintado era pequeño y fino** (visto en el juego a 1× y a 2×, con el héroe real): el creciente tenía el filo a 0.8 del cuerpo (desalineado con el pintado) y la caja del *hitbox* le quedaba corta. Ahora el filo se apoya en el cuerpo, la hoja es más gruesa y el arte trae su propio factor (1.35 × 1.4: el corte llega a 1.47 m del héroe, dentro del alcance del golpe, 1.6 m).
2. **El fogonazo del golpe era tenue y su anillo parecía un óvalo**; **la salpicadura de tinta parecía un erizo** (espinas rectas con bolas en la punta): se reescribieron (cuchillas gruesas a lo largo del golpe; tentáculos curvos y cónicos que acaban en gota y gotas que se sueltan, con el brillo solo en los bordes que miran arriba y a la izquierda).
3. **La luz de un lugar que despierta (y de un poder ganado) enterraba al héroe** en un óvalo blanco: no hay capa entre el terreno y los actores. Nace **`fxBack`**, la luz que va **detrás** (la silueta oscura se recorta contra ella), y el destello del poder se acorta y se baja.
4. **Una prueba cazó que el presupuesto de *sprites* se rompía con tres *pools***: cada uno aceptaba el tope entero (9 > 8). Ahora el tope es de **todos** a la vez.
5. **`ability:unlocked` no trae sitio**: el director lo coloca donde está el héroe (el contrato lo dice: `originY` sobre los pies del héroe), con una receta de prueba para los eventos sin lugar.
6. **La luz del héroe y las pruebas de «nada vivo»:** dos escenarios suponían cero partículas al terminar un combate; las motas ambientales (cap ≤ 8) son legítimas: se pide ≤ 8 y cero *sprites*.
7. **La escena crecía al jugar una pelea** (`room`: 17 → 21 objetos en `fxWorld`): los *pools* de *sprites* aditivos se quedaban cortos con los fogonazos pintados (la pelea usa más de 16 a la vez). Ahora se precalientan 24 (el tope del perfil bajo).
8. **Los tres sitios de los *sprites* y la memoria:** las secuencias a tamaño completo dejaban R4 en 31.8 MiB (el presupuesto propuesto, 32): repintadas al 0.75 (`Cut.scale`) quedan en 30.6 MiB.
9. **Un descuido de la sesión:** una orden de edición dejó **truncado** `tools/e2e/scenarios/slime.ts` (se abrió el archivo para escribir antes de leerlo); se restauró con `git checkout` (no tenía cambios pendientes) y `tsc` lo confirmó. No se perdió nada.
10. **Los E2E nuevos tenían supuestos de tiempo** (el golpe aún no había acabado cuando se pulsaba el rayo; el menú no se abre con la tecla mientras el bucle está en pausa): se esperan los estados, no los tiempos, y se abre con el botón de pausa.
11. **`boss-death` falló en producción (y solo allí): una carrera de la prueba, no del juego.** El escenario toma la «huella» de la sala (cuántos objetos hay en cada capa) justo al recargar la página y la compara al volver al santuario tras la derrota; el arte vestía la sala unos **220 ms** después de que el juego estuviera listo y la prueba esperaba solo 150 ms: antes de la luz el margen alcanzaba, con dos paquetes más en el arranque (296 KB de los 3.8 MB que necesita la primera pantalla de R4: el 8 %) la carrera se perdía a veces (huella `[3,2,1,1,1,1,3]` = el *blockout*, contra `[8,2,2,3,4,2,7]` = la sala vestida). **Se midió** (laboratorio `timeline.ts`, 4 ejecuciones en producción) **si valía la pena cargar la zona en paralelo con los paquetes de arranque**: no adelanta el vestido de la sala (aquí manda la CPU del decodificado; en una red manda el ancho de banda: el mismo total llega a la vez) y retrasa la luz 170 ms, así que **se descartó y el orden del juego no cambió**. El arreglo es de la prueba: **espera a que la sala esté vestida** (`state().roomArt`) antes de tomar la huella (el estado, no el tiempo). Pasa 3 de 3 en producción.
12. **Las motas de la luz del héroe eran casi invisibles** (vistas **en vivo**, con el bucle corriendo: el laboratorio con los efectos parados no las genera, porque el director las suelta desde el fotograma del juego): tamaño `0.1–0.2 m` → **`0.2–0.36 m`** y opacidad `0.6 → 0.95` (≤ 8 vivas, sin cambio de contrato: el contrato mide cuántas y cuánto viven, no su tamaño). Se ven como chispas suaves junto a la cabeza y los hombros, sin tapar la cara.

### Pendiente de la fase H (a propósito)

- **Revisión artística (todo lo de la luz):** es **correcto y coherente pero «de generador»** —el corte barre con seis fotogramas, la salpicadura es una corona simétrica de tentáculos, el pilar y la llama son geométricos—; **`rune` es un anillo con marcas, no un signo con significado**: no hay un lenguaje de runas (las del escenario, las del sello y las de los efectos son tres familias); el fogonazo del *dash* y del impacto **tapan al héroe** unos fotogramas (su silueta es la de la imagen de referencia del usuario: no se retoca, se puede afinar la luz alrededor); la columna de tinta del jefe tiene una **corona irregular** de dientes que parece cristal más que tinta.
- **Calibración en dispositivo real:** a 29 px/m (un teléfono en horizontal a 1×) las formas finas desaparecen (se diseñaron gruesas, pero **nada se ha visto en un dispositivo real**); el contraste de la luz sobre los fondos más claros de R2 (las raíces) está sin comprobar; el coste de ~50 *sprites* aditivos a la vez en una GPU móvil, también.
- **Sin audio** (preparado: los cues siguen en `presentation/audioCues`, y los disparadores nuevos aún no tienen cue).
- **Sin variante de media resolución** para los paquetes de luz (el contrato la admite; el empaquetador solo escribe una resolución): la memoria de arte residente en R4 queda 30.6 MiB de los 32 MiB propuestos.
- **Qué falta para que la slice sea visualmente completa** (lo que queda de la fase H): la iluminación dinámica de los efectos (cada destello no ilumina el escenario: **fase I**), un efecto de **pantalla** (viñeta de daño, destello del poder ganado) y la **revisión artística** de todo lo pintado por código.
