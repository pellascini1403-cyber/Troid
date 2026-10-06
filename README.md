# Troid

Metroidvania 2D de acción y exploración, pensado primero para **iOS y Android** y jugable en **PC**.
Dirección definitiva: **2D puro con sprites**, renderer **PixiJS v8**, energía cian/azul, controles móviles por gestos.
Este repositorio contiene la base técnica y, en construcción, la *vertical slice* «Ancient Forest Ruins» (15–30 min).

> **Estado real (2026-10-06):** el **Prompt 4 está completo**: el juego corre en **2D puro con PixiJS v8** (Three.js está retirado del código y de las
> dependencias; el último estado 3D está en el *tag* `proto-3d-f5` y en la rama `archive/proto-3d-f5`) y hay un **primer vertical slice jugable con
> teclado**: la sala R1 «Puerta de las Ruinas» (moverse, saltar, plataformas, pasaje bajo, **Ink Slime**, puerta, salida), con combate, VFX, muerte y
> reaparición localizadas (es/en). Todo con *placeholders* abstractos: **no hay arte final**. Qué se hizo, qué se midió y qué falta:
> [bitácora del Prompt 4](docs/PROMPT4-LOG.md). Lo siguiente es el Prompt 5 (controles táctiles, HUD, magia, cartas, botellas, interacción).

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
npm run test:e2e                                           # 12 escenarios E2E con Playwright (--prod: contra el build; un nombre filtra: `-- room`)
npm run bench:bundle                                       # qué descarga un arranque en frío del build de producción (KB gz)
```

### Jugar (teclado)

| Acción | Teclas |
|---|---|
| Moverse | `A` `D` / `←` `→` |
| Saltar (variable, *coyote*, *buffer*) | `Espacio` |
| Agacharse (pasaje bajo; con salto, atraviesa plataformas *one-way*) | `S` / `↓` |
| Atacar (cadena de 2, aéreo, agachado) | `J` / clic izquierdo |
| Dash (*i-frames*) | `Shift` |
| Panel de depuración (colliders, hitboxes, vida, tiempo) | `` ` `` (o `?debug=1`) |

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
