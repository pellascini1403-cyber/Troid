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
> recompensa (el **Air Dash**). **Menú de pausa** con idioma (es/en), volumen (preparado: todavía no suena nada), calidad, teclas y disposición táctil. Todo con *placeholders* abstractos: **no hay
> arte final** y el protagonista sigue siendo la **cápsula abstracta con espada** de los Prompts 3/4, sin rediseñar.
> ⚠ **Nada se ha verificado ni calibrado en un iPhone, un iPad ni un Android reales** (ni con un mando físico): lo táctil se prueba con toques del protocolo DevTools y con la geometría, el mando con uno
> abstracto. Qué se verificó y qué falta: [MOBILE-CALIBRATION](docs/MOBILE-CALIBRATION.md). Qué se hizo, qué se midió y qué queda: [bitácora del Prompt 7](docs/PROMPT7-LOG.md), [del 6](docs/PROMPT6-LOG.md) (y de los
> [Prompt 5](docs/PROMPT5-LOG.md) y [Prompt 4](docs/PROMPT4-LOG.md)).
>
> **Arte (Prompt 7): el arte final del protagonista NO está en el repositorio.** Lo que hay es el **pipeline** que lo recibirá de forma limpia, eficiente y reversible: el manifiesto de datos, el empaquetador de atlas
> **sin pérdida**, la carga diferida (el arranque en frío **no crece**), la validación en el *build* (el arte roto no compila), el conmutador *placeholder* ↔ arte **estado por estado**, un laboratorio (`?lab=player`), los
> contratos de VFX, de audio y de entorno y una escena de estrés medida. **No se ha generado, dibujado ni imitado ningún arte** y el protagonista sigue siendo la cápsula con espada. `npm run assets:missing` dice exactamente qué
> falta (hoy: **0 de 15 clips** del protagonista y **0 de 12 piezas** obligatorias del entorno). Documento técnico: [ART-PIPELINE-2D](docs/ART-PIPELINE-2D.md) · cómo entregarlo:
> [protagonista](docs/guides/deliver-protagonist-art.md) y [entorno](docs/guides/deliver-environment-art.md). Lo siguiente es entregar el arte, pulir y probar en dispositivos reales ([ROADMAP](docs/ROADMAP.md)).

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
npm run test:e2e                                           # 43 escenarios E2E con Playwright (--prod: contra el build; un nombre filtra: `-- finale`)
npm run bench:bundle                                       # qué descarga un arranque en frío del build de producción (KB gz)
npm run assets:missing                                     # qué arte falta exactamente (protagonista y entorno); --strict falla mientras falte algo
npm run assets:check                                       # valida el arte de art/ sin escribir nada (lo ejecuta `build`: el arte roto no compila)
npm run assets:pack                                        # empaqueta art/ → public/art/ (atlas sin pérdida); assets:verify comprueba lo empaquetado
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
`?lab=slime` (las poses del Ink Slime y su aviso en vivo, `&mode=live&manual=1`) · `?lab=stress` (presupuesto de render) · `?lab=player` (el arte del protagonista, un clip cada vez, con anclas, espada, escala y las cajas del juego; el *placeholder* al lado) ·
`?lab=art-stress` (100/500/1000 *sprites* de varias páginas de atlas con alfa, luz y efectos: llamadas de dibujo, memoria, fotogramas; `&art=<carpeta>` mide el arte real cuando llegue).
`?visual=placeholder|art|auto` elige qué dibuja al protagonista (por defecto `auto`: el arte donde lo hay, el *placeholder* donde no) y `?art=<carpeta>` apunta a otra carpeta de arte.

## Estructura

```
src/        código (módulos por responsabilidad; ver docs/ARCHITECTURE-2D.md §2)
tests/      unit · integration
tools/      arnés E2E (Playwright: escenarios, decodificador de PNG, grabación y reproducción de partidas) · medición del bundle · assets/ (empaquetador y validador del arte)
art/        el arte AUTORAL: índice y manifiestos (hoy solo el hueco del protagonista, `awaiting-art`; ver docs/ART-PIPELINE-2D.md)
public/     assets estáticos (icono, manifiesto web) y, tras `assets:pack`, `art/` (generado: no se edita a mano)
docs/       arquitectura, ADR, dirección de arte, guías
```

## Principio rector

La **simulación** (movimiento, combate, IA, progresión, guardado) es TypeScript puro y determinista;
**el renderer (PixiJS) y el DOM** solo existen en la capa de vista. Por eso cualquier asset (personaje, enemigo, UI, VFX, audio)
se puede reemplazar sin reescribir gameplay. Un test arquitectónico lo hace cumplir.
