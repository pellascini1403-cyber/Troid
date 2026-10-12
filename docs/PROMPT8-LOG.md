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
| Pruebas unitarias y de integración | **2292 en 145 archivos** (eran 2257 en 143: +35: planificador 18, escenas 6, escenario del pintor y del empaquetador 5+…, entorno) |
| E2E (desarrollo) | **44/44** (el nuevo `room-art`; ver los problemas de más abajo) |
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

### Pendiente de la fase B (a propósito)

- **Revisión artística.** Todo el escenario lo ha pintado código: las formas son repetitivas a ojo de ilustrador (las columnas, los arcos y los árboles comparten gramática), no hay fotogramas de animación (el movimiento es solo de *sway/pulse/drift* en tiempo de ejecución) y la paleta
  se calibró en capturas del mismo motor, no en una pantalla real. Un artista puede sustituir cualquier PNG sin tocar código.
- **Calibración en dispositivo real** (brillo y contraste en pantallas OLED/LCD de teléfono, ancho de banda de la carga, memoria de las 4 páginas).
- **R2, R3 y R4 siguen en bloqueo** (fases C, D y E).
