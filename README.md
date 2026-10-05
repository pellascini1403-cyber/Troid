# Troid

Metroidvania de acción y exploración con **vista lateral 2.5D** y personajes/mundo en **3D estilizado**,
pensado primero para **iOS y Android** y jugable en **PC**. Este repositorio contiene la base técnica y la
*vertical slice* «Ancient Forest Ruins» (15–30 min).

> ⚠️ **Cambio de dirección en curso (2026-10-05):** el brief más reciente pide **2D con sprites**, no 3D/2.5D. Estado real, plan y
> decisiones pendientes: [`docs/AUDIT-2026-10.md`](docs/AUDIT-2026-10.md) · [ADR-0002](docs/adr/0002-direction-2d.md) (propuesta).
> Lo que sigue describe el prototipo F1–F5 (3D), que es lo que hoy se ejecuta.

> Estado y plan por fases: [`docs/ROADMAP.md`](docs/ROADMAP.md) · Arquitectura: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) ·
> Por qué este stack: [`docs/adr/0001-stack.md`](docs/adr/0001-stack.md) · Arte: [`docs/ART_DIRECTION.md`](docs/ART_DIRECTION.md)

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
npm run gen:models                                         # regenera los .glb placeholder
```

## Estructura

```
src/        código (módulos por responsabilidad; ver docs/ARCHITECTURE.md §2)
tests/      unit · integration · e2e
tools/      generadores de modelos y arnés E2E
public/     assets estáticos (modelos .glb, audio, skins de UI)
docs/       arquitectura, ADR, dirección de arte, guías
```

## Principio rector

La **simulación** (movimiento, combate, IA, progresión, guardado) es TypeScript puro y determinista;
**Three.js y el DOM** solo existen en la capa de vista. Por eso cualquier asset (personaje, enemigo, UI, VFX, audio)
se puede reemplazar sin reescribir gameplay. Un test arquitectónico lo hace cumplir.
