# ADR-0001 — Stack tecnológico

**Estado:** aceptada; la parte de **Three.js / glTF queda sustituida** por [ADR-0002](0002-direction-2d.md) (aceptada) y [ADR-0003](0003-arquitectura-2d-definitiva.md). Siguen vigentes TypeScript estricto, Vite, Vitest, Playwright y Capacitor ·
**Fecha:** 2026-10-01 · **Fase:** F1

## Contexto: qué se encontró al inspeccionar el repositorio

| Comprobación | Resultado |
|---|---|
| Archivos en el working tree | ninguno (solo `.git/`) |
| Commits locales | 0 (`master` sin nacer) |
| Remoto `pellascini1403-cyber/troid` | vacío (API de GitHub: `409 Git Repository is empty`, 0 ramas) |
| Stack previo / arquitectura previa | **no existe** |

No hay nada que respetar ni que migrar: el stack se decide aquí. Se evaluó contra el entorno
real en el que se construye (contenedor Linux sin GPU, sin Xcode, sin editor de Unity/Godot,
con Node 22, Chromium + Playwright preinstalados) y contra los requisitos del juego
(iOS + Android + PC, 3D estilizado con cámara lateral, mobile-first, contenido data-driven,
assets reemplazables, pruebas automáticas).

## Decisión

**TypeScript (strict) + Three.js (WebGL2) + Vite**, empaquetado para iOS/Android con
**Capacitor** y para PC en navegador (o Electron/Tauri más adelante). Pruebas con
**Vitest** (simulación) y **Playwright** (E2E y capturas).

La simulación es **TypeScript puro sin dependencias de Three.js ni del DOM**; Three.js solo
vive en la capa de vista. Los modelos entran como **glTF/GLB** (esqueleto + animaciones + sockets).

## Alternativas consideradas

| Opción | A favor | En contra (decisivo) |
|---|---|---|
| **Unity (C#)** | Estándar de la industria móvil; toolchain 3D maduro | No se puede ejecutar ni verificar aquí (sin editor/licencia/GPU). Habría que escribir C#, escenas y `.meta` a ciegas. Imposible cumplir «ejecuta el proyecto». |
| **Godot 4** | Ligero, buen 2.5D, export móvil | Mismo problema de verificación; export iOS requiere macOS+Xcode. GDScript no es reutilizable fuera del motor. |
| **Babylon.js** | Motor más completo (GUI, físicas, inspector) | Más pesado para móvil; el juego necesita un controlador cinemático propio de todos modos, no física genérica. |
| **Unreal** | Calidad visual máxima | Desproporcionado para móvil 2.5D de bajo polígono; no verificable aquí. |
| **Three.js + TS + Vite** ✔ | Es lo único que puedo **ejecutar, medir y ver** en este entorno; se prueba en un teléfono real con solo abrir una URL; glTF es el pipeline estándar de modelo→esqueleto→animación→sockets; la simulación pura en TS se testea de forma determinista; cero fricción de build. | Techo de rendimiento menor que un motor nativo; WebView en móviles antiguos; sin consolas. |

## Consecuencias y mitigaciones

- **Rendimiento móvil** (riesgo principal). Estética de bajo polígono + toon, geometría de sala fusionada,
  instancing, pooling, perfiles de calidad (`low/medium/high`), resolución dinámica y presupuesto de
  draw calls verificado por test E2E (F18). Sin post-procesado pesado en el perfil bajo.
- **Empaquetado nativo.** `base: './'` en Vite para que el mismo build funcione en Capacitor.
  Capacitor se integra en F13 (orientación, safe-area, ciclo de vida). *La compilación nativa
  (Xcode / Android SDK) no se puede verificar en este entorno* y se documenta como pendiente de validar en
  máquina del usuario.
- **Portabilidad futura.** Toda la lógica de juego está en capas puras y datos (`*Definition`).
  Si algún día se migra de motor, los diseños, números y datos viajan; el código de vista se reescribe.
- **Criterios para reevaluar:** <45 fps sostenidos en un Android de gama media tras F18; necesidad
  de consolas; necesidad de IK/blend trees complejos que el pipeline glTF + `AnimationMixer` no cubra.

## Referencias de versión (fijadas al instalar)

three 0.186 · vite 8 · vitest 5 · typescript 5.9 · playwright-core 1.56+
