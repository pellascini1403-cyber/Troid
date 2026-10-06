# Troid

Metroidvania 2D de acción y exploración, pensado primero para **iOS y Android** y jugable en **PC**.
Dirección definitiva: **2D puro con sprites**, renderer **PixiJS v8**, energía cian/azul, controles móviles por gestos.
Este repositorio contiene la base técnica y, en construcción, la *vertical slice* «Ancient Forest Ruins» (15–30 min).

> **Estado real (2026-10-06):** el **Prompt 5 está completo** sobre el núcleo del Prompt 4. El juego corre en **2D puro con PixiJS v8** (Three.js está retirado del código y de las
> dependencias; el último estado 3D está en el *tag* `proto-3d-f5` y en la rama `archive/proto-3d-f5`) y la sala R1 «Puerta de las Ruinas» se juega **entera con teclado, con controles táctiles por
> gestos y con mando**: moverse, saltar, agacharse, atacar, hacer dash; **vida (5), magia (100) y una carta** en un HUD en DOM; **recoger la carta interactuando** y lanzar el **Spirit Bolt**
> (30 de magia); **botellas de energía** (3, se beben para curar y se recargan de una en una); interacción contextual (un icono que existe solo al alcance); **idioma español/inglés que se guarda**
> y un menú de pausa mínimo. Todo con *placeholders* abstractos: **no hay arte final** y el protagonista sigue siendo la cápsula abstracta del Prompt 3/4.
> ⚠ **No se ha verificado nada en un iPhone ni en un Android reales** (ni con un mando físico): lo táctil se prueba con toques CDP simulados y el mando con uno abstracto.
> Qué se hizo, qué se midió y qué falta: [bitácora del Prompt 5](docs/PROMPT5-LOG.md) (y del [Prompt 4](docs/PROMPT4-LOG.md)). Lo siguiente es el Prompt 6 (mundo conectado, guardado, jefe).

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
npm run test:e2e                                           # 23 escenarios E2E con Playwright (--prod: contra el build; un nombre filtra: `-- vertical`)
npm run bench:bundle                                       # qué descarga un arranque en frío del build de producción (KB gz)
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
| Pausa y ajustes (idioma, tamaño y opacidad de los controles) | `Esc` / `P` | `Start` | icono arriba al centro |
| Panel de depuración (colliders, hitboxes, vida, tiempo) | `` ` `` (o `?debug=1`) | | |

Sin parámetros se empieza en **R1** con el dash. `?room=movement_test` o `?room=crouch_test` abren los patios de pruebas (las habilidades son entonces las de `?unlock=dash`),
`?lang=es|en` fuerza el idioma, `?vh=` cambia el zoom, `?hooks=1` expone `window.__troid` para las pruebas.

Laboratorios (solo desarrollo, cargados aparte): `?lab=sprites` (hoja de contacto de un *sprite set* con sus anclas) · `?lab=vfx` (cada efecto por el director real) ·
`?lab=slime` (las poses del Ink Slime y su aviso en vivo, `&mode=live&manual=1`) · `?lab=stress` (presupuesto de render).

## Estructura

```
src/        código (módulos por responsabilidad; ver docs/ARCHITECTURE-2D.md §2)
tests/      unit · integration
tools/      arnés E2E (Playwright: escenarios, decodificador de PNG, grabación y reproducción de partidas) · medición del bundle
public/     assets estáticos (atlas de sprites, audio, skins de UI)
docs/       arquitectura, ADR, dirección de arte, guías
```

## Principio rector

La **simulación** (movimiento, combate, IA, progresión, guardado) es TypeScript puro y determinista;
**el renderer (PixiJS) y el DOM** solo existen en la capa de vista. Por eso cualquier asset (personaje, enemigo, UI, VFX, audio)
se puede reemplazar sin reescribir gameplay. Un test arquitectónico lo hace cumplir.
