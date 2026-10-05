# Troid

Metroidvania 2D de acción y exploración, pensado primero para **iOS y Android** y jugable en **PC**.
Dirección definitiva: **2D puro con sprites**, renderer **PixiJS v8** (todavía no instalado), energía cian/azul, controles móviles por gestos.
Este repositorio contiene la base técnica y, en construcción, la *vertical slice* «Ancient Forest Ruins» (15–30 min).

> ⚠️ **Estado real (2026-10-05):** lo que hoy se ejecuta (`npm run dev`) es el **prototipo F1–F5 con vista 3D** (Three.js), que se retira en el Prompt 4
> (paso S4). La simulación —movimiento, input, cámara (matemática), debug— es la base que se **conserva**. El Prompt 3 dejó la especificación
> completa; no se ha iniciado la migración del renderer.

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
**el renderer (PixiJS) y el DOM** solo existen en la capa de vista. Por eso cualquier asset (personaje, enemigo, UI, VFX, audio)
se puede reemplazar sin reescribir gameplay. Un test arquitectónico lo hace cumplir.
