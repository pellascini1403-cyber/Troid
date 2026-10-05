# Cómo sustituir el arte de un personaje (o enemigo / jefe): *sprite sets*

> Sustituye a la guía glTF 3D ([replace-model.md](replace-model.md), obsoleta). El principio no cambia: el gameplay habla en **estados lógicos**
> (`'run'`, `'attack'`…) y **anclas lógicas** (`'weapon_tip'`…), nunca en archivos ni fotogramas. Sustituir el arte = apuntar una
> `SpriteSetDefinition` a un atlas nuevo. No se toca gameplay, IA, combate, cámara ni input.
>
> Las imágenes del protagonista son la **fuente de verdad** ([GAME-SPEC-2D §2](../GAME-SPEC-2D.md)): se integran tal cual, **sin recolorear,
> recortar automáticamente ni redibujar**. Mientras no existan, el juego usa el *placeholder* abstracto
> (`src/content/placeholders/playerPlaceholder.ts`), que atraviesa exactamente el mismo pipeline.

## 1. Qué entrega el artista

| Entregable | Detalle |
|---|---|
| Atlas | `public/sprites/<id>.png` + `public/sprites/<id>.json` en formato **TexturePacker «hash»** (`frames: { nombre: { frame, spriteSourceSize, sourceSize, trimmed } }`). El recorte (*trim*) está permitido: los pivotes se miden contra el fotograma **original**. |
| Orientación | El arte mira a la **derecha**; el motor lo espeja con `scale.x = -1` para `facing = -1` (no se entregan fotogramas espejados). |
| Nombres | `<estado>_<NN>` con dos dígitos (`idle_00`, `run_05`, `attack_03`). Si el artista usa otros prefijos se declaran en `clips[estado].frames`. |
| Metadatos del motor | En el mismo JSON, `meta.troid.frames[nombre] = { heightPx, anchors }`: **anclas por fotograma** (la espada se mueve con la animación) y alto del personaje en píxeles (validación de escala). |
| Escala | Todos los fotogramas comparten celda y pivote. `artPxPerMeter` = píxeles de arte por metro de mundo; el motor escala por `1 / artPxPerMeter`, así que **el tamaño en pantalla no depende de la resolución del arte** (comprobado en E2E con 56 vs 36 px/m). |

### Anclas (metros respecto al centro de los pies; +x hacia delante, +y arriba)

`feet · head · hand_r · weapon_grip · weapon_tip · vfx_origin · projectile_origin · interaction`

**Contrato de espada** (el validador lo exige en cada fotograma de `attack`, `attack1`, `attack2`, `attackAir`, `attackCrouch` y `special`):
`hand_r`, `weapon_grip` y `weapon_tip` existen, y `|weapon_grip − hand_r| ≤ 0.04 m`: la espada está **en la mano derecha**.
Los VFX del tajo, los proyectiles y las chispas de impacto nacen en estas anclas, nunca en coordenadas de píxel.

### Estados y *fallbacks*

El *sprite set* **no necesita todos los estados**: lo que falta se resuelve por cadena (`walk → run → move → idle`, `death → hurt → idle`,
`attackCrouch → attack → attack1 → idle`…, ver `ANIM_FALLBACKS` en `presentation/vocabulary.ts`) y la cadena siempre acaba en `idle`. Un set con un solo clip
`idle` anima todo sin errores. Mínimo recomendado para el jugador: `idle walk run jump fall land crouch crouchWalk dash attack attack2 attackAir attackCrouch hurt death`.

### Ataques por fase

Los clips de ataque declaran `phases` (rangos **inclusivos** de índices de fotograma):

```ts
attack: { frames: 'attack_', count: 6, phases: { startup: [0, 1], active: [2, 3], recovery: [4, 5] } }
```

El fotograma que se muestra sale de la **fase de la simulación** (`startup → active → recovery`) y del progreso dentro de ella, **no del reloj**: el golpe
visible coincide con la *hitbox* aunque cambie el balance (`AttackDefinition`). El artista solo tiene que dibujar el impacto dentro de los fotogramas `active`.
No hay *cross-fade* en 2D: cada cambio de estado es un corte limpio.

## 2. Pasos

1. Copia `<id>.png` y `<id>.json` a `public/sprites/`.
2. Añade la definición en `src/content/sprites.ts` y regístrala en `SPRITE_SETS`:

   ```ts
   export const HERO: SpriteSetDefinition = {
     id: 'hero',
     atlas: 'sprites/hero',          // → public/sprites/hero.json (+ la imagen que nombra meta.image)
     artPxPerMeter: 96,              // el validador sugiere el valor si la altura no cuadra
     pivot: [0.5, 1],                // centro de los pies, normalizado al fotograma original
     height: 1.7,                    // alto de pie en metros (cuerpo del jugador)
     clips: {
       idle: { frames: 'idle_', count: 8, fps: 8 },
       run: { frames: 'run_', count: 8, fps: 14 },
       attack: { frames: 'attack_', count: 6, phases: { startup: [0, 1], active: [2, 3], recovery: [4, 5] } },
       // …
     },
   };
   ```
3. En `src/content/player.ts` cambia `spriteSetId: 'hero'` (para un enemigo: el de su definición).
4. Míralo sin jugar: `http://localhost:5173/?lab=sprites&set=hero` — hoja de contacto con todas las anclas dibujadas (mano, empuñadura→punta, cabeza), guía de 1.7 m y un actor en vivo.
5. Abre la consola: el **validador de contrato** (`validateSpriteSet`) informa de fotogramas que faltan en el atlas, de la falta de `idle`, de fases mal definidas,
   de la espada fuera de la mano y de la escala incoherente (con el valor sugerido). El mismo validador guarda el *placeholder* en los tests.

## 3. Qué ajustar si algo se ve raro

| Síntoma | Causa probable | Arreglo |
|---|---|---|
| Personaje gigante / minúsculo | `artPxPerMeter` | usa el valor sugerido por el validador |
| Flota o se hunde | El pivote no está en los pies | corrige `pivot` (normalizado al fotograma original, no al recortado) |
| Mira hacia atrás | El arte no está dibujado hacia la derecha | reexporta (no se corrige con código) |
| El tajo no sale de la espada | Anclas por fotograma ausentes o desplazadas | revisa `meta.troid` y el contrato de espada |
| El golpe visible no coincide con la *hitbox* | Rangos de `phases` mal puestos | ajusta los índices; el golpe debe caer en `active` |
| Un fotograma «no aparece» | Nombre distinto del esperado | el validador lo lista; corrige el prefijo en `clips` o el nombre en el atlas |

## 4. Cambiar el arte en caliente (pieles, variantes)

`ActorSprite.setSpriteSet(set)` cambia el arte de un actor vivo sin tocar el estado de simulación (`ActorViewState` queda intacto; el siguiente `sync` continúa desde el estado actual).
`SpriteAssetManager` cuenta referencias y libera las texturas cuando la última se suelta.

## 5. Qué **no** se toca

`player/` (lógica), `combat/`, `enemies/`, `bosses/`, cámara, input, guardado. Si para integrar un *sprite set* necesitas editar alguno de ellos, es un error de arquitectura: repórtalo.
