# Troid

Metroidvania 2D de acción y exploración, pensado primero para **iOS y Android** y jugable en **PC**.
Dirección definitiva: **2D puro con sprites**, renderer **PixiJS v8**, energía cian/azul, controles móviles por gestos.
Este repositorio contiene la base técnica y, en construcción, la *vertical slice* «Ancient Forest Ruins» (15–30 min).

> **Estado real (2026-10-07):** el **Prompt 7 está completo** —es el **pipeline de arte 2D**, no el arte (ver el párrafo siguiente)— sobre los Prompts 4, 5 y 6. El juego corre en **2D puro con PixiJS v8** (Three.js está retirado; el último estado 3D está en el
> *tag* `proto-3d-f5` y en la rama `archive/proto-3d-f5`) y hay un **mini-mundo metroidvania de cuatro salas jugable de principio a fin** —**R1 → R2 → R3 → R4 → jefe → recompensa → salida**—:
> la slice entera se recorre en el navegador **con el teclado de punta a punta** y **con teclado y mando en una sola sentada** (el mando, abstracto, desde R3 hasta el final, jefe incluido), y los **controles
> táctiles por gestos** se ejercitan con toques reales del protocolo DevTools en R1 entera, en cada botón y en el último tramo de R4 (**no se ha peleado con el jefe a toques**). Moverse, saltar, agacharse, atacar, hacer dash; **vida (5), magia (100) y cartas** en un HUD en DOM; **botellas de energía** (3, y una
> **cuarta** en R2 para quien elige el camino alto); **peligros** (pinchos); el **Spirit Bolt** en R3, que **rompe un sello de tinta** que cierra el camino; **santuarios** (checkpoints) donde se
> descansa; **guardado de progreso** automático (sobrevive a recargar la página); **cámara** con zonas; y **el Custodio de Tinta**, un jefe original con dos ataques avisados en violeta, dos fases y una
> recompensa (el **Air Dash**). **Menú de pausa** con idioma (es/en), volumen (preparado: todavía no suena nada), calidad, teclas y disposición táctil. **El protagonista se dibuja con tu hoja de poses y se mueve** (Prompts 8 y 9: 114 fotogramas en 18 clips hechos **moviendo tus dibujos**, sin dibujar nada; 9 clips con un dibujo tuyo de esa acción y 9 *stand-ins* —el dibujo de otra acción, en movimiento—; provisional; ver abajo); **las cuatro salas, el jefe y el enemigo se dibujan con arte pintado por código** (fases B–G: provisional); lo demás —los efectos— sigue siendo
> *placeholder* abstracto: **no hay arte final** de ellos.
> ⚠ **Nada se ha verificado ni calibrado en un iPhone, un iPad ni un Android reales** (ni con un mando físico): lo táctil se prueba con toques del protocolo DevTools y con la geometría, el mando con uno
> abstracto. Qué se verificó y qué falta: [MOBILE-CALIBRATION](docs/MOBILE-CALIBRATION.md). Qué se hizo, qué se midió y qué queda: [bitácora del Prompt 7](docs/PROMPT7-LOG.md), [del 6](docs/PROMPT6-LOG.md) (y de los
> [Prompt 5](docs/PROMPT5-LOG.md) y [Prompt 4](docs/PROMPT4-LOG.md)).
>
> **Arte.** *Prompt 7:* el **pipeline** que recibe el arte de forma limpia, eficiente y reversible: el manifiesto de datos, el empaquetador de atlas **sin pérdida**, la carga diferida (el arranque en frío **no crece**), la validación en el *build*
> (el arte roto no compila), el conmutador *placeholder* ↔ arte **estado por estado**, un laboratorio (`?lab=player`), los contratos de VFX, de audio y de entorno y una escena de estrés medida.
> *Prompt 8, fase A:* **el protagonista ya se dibuja con los píxeles de tu hoja de poses** (`art/player/source/hero-sheet.png`, guardada bit a bit), solo con operaciones técnicas (fondo transparente; **nada dibujado, recoloreado ni suavizado**).
> La hoja es de **concepto** —una pose por acción—: **7 de los 15 clips tienen un dibujo tuyo de esa acción y 8 enseñan el dibujo de otra** (*stand-ins*, contados como no entregados). `npm run assets:missing` dice exactamente qué falta (hoy: **7 de 15 clips** con arte propio y **14 de 14 piezas** obligatorias del entorno).
> *Prompt 9:* **el protagonista se anima de verdad** y **sin dibujar un píxel**: `npm run assets:animate` mueve tus dibujos con una deformación rígida y suave guiada por puntos de control (el pecho respira, la cabeza y las antenas arrastran un compás detrás, las piernas
> se turnan al andar y al correr, la figura se aplasta al saltar y al aterrizar, **la hoja de la espada es una pieza rígida que gira sobre la empuñadura** y queda siempre en la mano derecha): **114 fotogramas en 18 clips**, los golpes pintados por las fases de la simulación,
> todo por el mismo camino (`art/` → manifiesto → `assets:check` → `assets:pack` → `public/art/`), con `?visual=auto|placeholder|art` y `?lab=player` y **sin tocar** controles, combate, física ni tiempos. **Lo que no se puede hacer con un dibujo**: ver desde otro lado —no hay cruce de
> piernas al andar, ni un agachado, una muerte, un beber o un interactuar **propios**: esos 9 clips mueven el dibujo de otra acción—. Documento técnico: [ART-PIPELINE-2D](docs/ART-PIPELINE-2D.md) (partes L y **N**) · cómo entregar lo que falta (**y que el generador no lo borre**):
> [protagonista](docs/guides/deliver-protagonist-art.md) y [entorno](docs/guides/deliver-environment-art.md) · bitácora: [PROMPT9-LOG](docs/PROMPT9-LOG.md). *Fases B a G:* **las cuatro salas, el jefe y el enemigo se dibujan ya con arte pintado en el motor** (suelo, piedra, raíces, espinas, santuarios, frasco, el sello con su sigilo, la carta, el salón monumental de R4 con la runa del Air Dash el Custodio de Tinta pintado por partes, con un muro de un ojo que arde mientras dura la pelea, y el Ink Slime, una criatura encorvada con un sigilo en el pecho; **pintado por código** —`npm run art:build`—: provisional, necesita revisión artística); *Fase H:* **los efectos son luz producida**: dos paquetes de arte (`vfx-shapes`, las diez formas, y `vfx-flipbooks`, las doce secuencias) arrancan con el juego y el corte de la espada, el fogonazo del golpe, el *Spirit Bolt* por etapas (se junta, sale, vuela, cae y deja un resplandor), la tinta que salta de lo que cae, el pilar de luz de un lugar que despierta (detrás del héroe), la runa de un poder ganado y los avisos y la columna de tinta del jefe se dibujan con ellas (`?vfx=procedural` los deja con las formas de siempre); el héroe lleva unas motas de luz propia mientras la magia está alta; *Fase I:* **la energía ilumina el lugar y la pantalla tiene noche**: el héroe lleva un charco de luz cian (crece con su magia) que le recorta la silueta oscura contra el fondo, el *Spirit Bolt* enciende las salas que cruza, el aviso de un enemigo y el Custodio echan luz violeta, cada momento del juego deja un destello donde ocurre, y la pantalla cierra la noche de cada sala desde las esquinas (una viñeta del tono de la sala, más cerrada en la pelea) y contesta a un golpe recibido (borde carmín atenuado), a un poder ganado o a un descanso (luz); sin filtros ni capas nuevas, y `?light=off` devuelve el juego a como era. *Fase J:* **la regresión completa y la primera impresión**: el arranque en frío ya no enseña el *blockout* —la página es el negro del juego con una luz que respira hasta que el arte de la primera sala está dentro (`?hooks=1` y las pruebas no la tienen)— y quedan como pruebas que cada piel se quita y la partida acaba igual con todas o con ninguna. **Informe final del Prompt 8** (lo terminado, lo que sigue siendo *placeholder*, lo que necesita revisión artística y calibración en un dispositivo, lo que falta): [PROMPT8-LOG](docs/PROMPT8-LOG.md). Lo siguiente: dibujos propios para los 9 *stand-ins* del protagonista y sustituir el arte provisional por arte hecho a mano ([ROADMAP](docs/ROADMAP.md)).
>
> *Prompt 10:* **faltan 46 dibujos del protagonista en 10 clips y no había ninguna herramienta de generación de imágenes en el entorno, así que no se ha dibujado nada** (y no se ha sustituido nada por polígonos, siluetas hechas con código ni más deformaciones: ningún clip ha dejado de ser un *stand-in*).
> Lo que hay es **el kit para pedirlos** (`art/player/requests/`: la lista exacta de PNG, un tablero de referencia con **tus** dibujos y un *prompt* por clip, `npm run assets:intake -- kit`) y **la herramienta que los recibe** (`npm run assets:intake -- <clip>`: recorta la hoja, la escala con un único factor por el
> ojo grande, la coloca, la **comprueba** y escribe una hoja de contacto comparativa; `--accept` la integra por `delivered` solo si no hay fallos y es lo que enseñó el informe; `-- status` dice qué es cada clip). Probada con tu hoja real (12 poses encontradas, en orden) y con una hoja de autoprueba hecha con fotogramas del propio juego.
> Detalle: [ART-PIPELINE-2D](docs/ART-PIPELINE-2D.md) (parte **O**) · [guía de entrega](docs/guides/deliver-protagonist-art.md) · bitácora: [PROMPT10-LOG](docs/PROMPT10-LOG.md).
> *Prompt 11:* **la Hoja 1 del usuario entra en el juego: `dash`, `death`, `drink` e `interact` ya son dibujos suyos** (por `delivered`, sin deformar ni redibujar un píxel: **4 de los 18 clips** son dibujos nuevos, quedan 5 *stand-ins* y `walk`; 114 → 106 fotogramas, el atlas del héroe 1.76 → 1.72 MB). Para que entrara `death` la recepción
> aprendió a **escalar y juzgar por la cabeza cuando la cabeza gira** (el ojo se encoge o desaparece; la cabeza no): **una diferencia de escala real sigue fallando**. Las **Hojas 2 y 3 se han revisado y no se han integrado**: traen **16 y 12 poses** (no las 19 y 12 previstas por clip; la 2, además, con efectos azules pintados en 8 poses).
> Detalle: [ART-PIPELINE-2D](docs/ART-PIPELINE-2D.md) (**O.4.1**) · bitácora: [PROMPT11-LOG](docs/PROMPT11-LOG.md).
> *Prompt 12:* **«Integralas igualmente»: las Hojas 2 y 3 entran en el juego** (`crouch`, `crouchWalk`, `walk`, `aerialAttack`, `crouchAttack`, `attack2`): **10 de los 18 clips son dibujos del usuario y ninguno es un *stand-in*** (106 → 90 fotogramas; los otros 12 clips, byte a byte los mismos).
> Lo que llegó **no era exactamente lo pedido** (`attack2` y `crouchAttack` con 5 poses, `walk` con 4, efectos cian pintados en la imagen, una pose sin espada, un segundo golpe que avanza en vez de subir) y **el encargo se reescribió a lo que son los dibujos**; la recepción aprendió a **aceptar a propósito un fallo concreto con su motivo** (`waivers.json`, archivado con la entrega), a recordar **lo pedido frente a lo entregado** y a juzgar el golpe que **avanza**. **Los efectos cian pintados dentro de la imagen se quitaron** con `erase.json` (polígonos en píxeles del lienzo, con su motivo: solo se vuelven transparentes los píxeles de dentro, la herramienta se niega a tocar el cuerpo o la hoja de la espada y el dibujo original sigue archivado): **9 314 píxeles en 7 fotogramas**, comprobado sobre las entregas reales.
> **No se ha visto nada en un dispositivo real**: [límites, §7 de la bitácora](docs/PROMPT12-LOG.md).
> Detalle: [ART-PIPELINE-2D](docs/ART-PIPELINE-2D.md) (**O.10** y **O.11**) · [guía de entrega](docs/guides/deliver-protagonist-art.md) · bitácora: [PROMPT12-LOG](docs/PROMPT12-LOG.md).

> **Documentación vigente:** [GAME-SPEC-2D](docs/GAME-SPEC-2D.md) (qué se construye) · [ARCHITECTURE-2D](docs/ARCHITECTURE-2D.md) (cómo) ·
> [MIGRATION-2D](docs/MIGRATION-2D.md) (orden, riesgos, criterios) · [ADR-0003](docs/adr/0003-arquitectura-2d-definitiva.md) (decisiones) ·
> [ROADMAP](docs/ROADMAP.md) · [AUDIT-2026-10](docs/AUDIT-2026-10.md) (diagnóstico). Histórico: [ARCHITECTURE](docs/ARCHITECTURE.md) y
> [ART_DIRECTION](docs/ART_DIRECTION.md) (parcialmente obsoletos, 3D), [ADR-0001](docs/adr/0001-stack.md), [ADR-0002](docs/adr/0002-direction-2d.md).

## Arranque rápido

Requisitos: Node ≥ 22.12.

```bash
npm install
npm run dev          # http://localhost:5173
npm run dev:lan      # expone el servidor en tu red para probar en un teléfono real
npm run check        # typecheck + tests
npm run build        # build de producción en dist/ (base relativa: sirve también para Capacitor)
```

Herramientas de desarrollo (usan el Chromium preinstalado, ver `TROID_CHROMIUM`):

```bash
npm run shot -- --out .shots/boot.png --w 844 --h 390   # captura del juego en tamaño teléfono
npm run test:e2e                                           # 49 escenarios E2E con Playwright (--prod: contra el build; un nombre filtra: `-- finale`)
npm run bench:bundle                                       # qué descarga un arranque en frío del build de producción (KB gz)
npm run assets:missing                                     # qué arte falta exactamente (protagonista y entorno); --strict falla mientras falte algo
npm run assets:check                                       # valida el arte de art/ sin escribir nada (lo ejecuta `build`: el arte roto no compila)
npm run assets:pack                                        # empaqueta art/ → public/art/ (atlas sin pérdida); assets:verify comprueba lo empaquetado
npm run assets:animate                                     # los 114 fotogramas del protagonista, de la hoja de poses del usuario movida por el rig (--check: ¿son los que la hoja, el rig y los clips producen?) ; después `assets:pack`
npm run art:build                                          # pinta el arte del escenario (tools/art: suelo, fondos, luces y las escenas de cada sala) en art/ ; después `assets:pack`
```

### Jugar

| Acción | Teclado y ratón | Mando (mapeo estándar) | Táctil |
|---|---|---|---|
| Moverse | `A` `D` / `←` `→` | stick izquierdo / cruceta | arrastrar en la **mitad izquierda** (invisible, origen flotante) |
| Saltar (variable, *coyote*, *buffer*) | `Espacio` | `A` | arrastrar / *flick* **hacia arriba** con el mismo dedo (no hay botón de salto) |
| Agacharse (pasaje bajo) y atravesar plataformas *one-way* | `S` / `↓` (con salto, atraviesa) | stick o cruceta abajo (+ `A`) | arrastrar **hacia abajo** / *flick* hacia abajo |
| Atacar (cadena de 2, aéreo, agachado) | `J` / clic izquierdo | `X` | botón **Ataque** (derecha) |
| Dash (*i-frames*) | `Shift` | `B` / `RB` | botón **Dash** (derecha) |
| Habilidad de la carta equipada (Spirit Bolt, 30 de magia) | `K` / clic derecho | `Y` | botón **Habilidad** (derecha; solo existe con una carta) |
| Botella de energía (cura) | `L` / `Q` | `LB` | chip que aparece **solo** si hace falta curar; o tocar un vial del HUD |
| Interactuar (coger, activar, abrir) | `E` | `LT` | tocar el **icono** que flota sobre el objeto (solo existe al alcance) |
| Pausa y ajustes (idioma, volumen, calidad, teclas y disposición de los controles táctiles) | `Esc` / `P` | `Start` | icono arriba al centro |
| Panel de depuración (colliders, hitboxes, vida, tiempo) | `` ` `` (o `?debug=1`) | | |

Sin parámetros se empieza en **R1** con el dash (o se **continúa** la partida guardada; `?new=1` empieza de cero). `?room=movement_test` o `?room=crouch_test` abren los patios de pruebas (las habilidades son entonces las de `?unlock=dash`),
`?lang=es|en` fuerza el idioma, `?vh=` cambia el zoom, `?touch=1` muestra los controles táctiles en un escritorio, `?safe=arriba,derecha,abajo,izquierda` imita un *notch* (px), `?paused=1` arranca con la simulación parada, `?hooks=1` expone `window.__troid` para las pruebas. Las salas de pruebas (`?room=`) nunca leen ni escriben el progreso.

Laboratorios (solo desarrollo, cargados aparte): `?lab=sprites` (hoja de contacto de un *sprite set* con sus anclas) · `?lab=vfx` (cada efecto por el director real) ·
`?lab=vfx` (cada disparador de efectos con el arte de la luz; `&vfx=procedural` con las formas del juego, `&ambient=1` la luz del héroe) · `?lab=slime` (las poses del Ink Slime y su aviso en vivo, `&mode=live&manual=1`) · `?lab=stress` (presupuesto de render) · `?lab=player` (el arte del protagonista, un clip cada vez, con anclas, espada, escala y las cajas del juego; el *placeholder* al lado) ·
`?lab=art-stress` (100/500/1000 *sprites* de varias páginas de atlas con alfa, luz y efectos: llamadas de dibujo, memoria, fotogramas; `&art=<carpeta>` mide el arte real cuando llegue).
`?visual=placeholder|art|auto` elige qué dibuja al protagonista (por defecto `auto`: el arte donde lo hay, el *placeholder* donde no) y `?art=<carpeta>` apunta a otra carpeta de arte. `?vfx=procedural` dibuja los efectos con las formas del juego en lugar de las del arte y `?light=off` quita la luz del mundo y la atmósfera de la pantalla (el juego como era antes de la fase I: para comparar y para ver qué añaden).

## Estructura

```
src/        código (módulos por responsabilidad; ver docs/ARCHITECTURE-2D.md §2)
tests/      unit · integration
tools/      arnés E2E (Playwright: escenarios, decodificador de PNG, grabación y reproducción de partidas) · medición del bundle · assets/ (empaquetador y validador del arte) · art/ (el pintor del escenario)
art/        el arte AUTORAL: índice, manifiestos y fuentes (el protagonista, desde la hoja de poses del usuario en art/player/source; el escenario de las ruinas, que pinta tools/art; ver docs/ART-PIPELINE-2D.md)
public/     assets estáticos (icono, manifiesto web) y, tras `assets:pack`, `art/` (generado: no se edita a mano)
docs/       arquitectura, ADR, dirección de arte, guías
```

## Principio rector

La **simulación** (movimiento, combate, IA, progresión, guardado) es TypeScript puro y determinista;
**el renderer (PixiJS) y el DOM** solo existen en la capa de vista. Por eso cualquier asset (personaje, enemigo, UI, VFX, audio)
se puede reemplazar sin reescribir gameplay. Un test arquitectónico lo hace cumplir.
