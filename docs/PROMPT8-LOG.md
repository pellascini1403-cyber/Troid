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
