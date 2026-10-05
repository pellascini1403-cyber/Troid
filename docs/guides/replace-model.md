# Cómo reemplazar el personaje (o un enemigo / jefe)

> ⚠️ **Obsoleta.** Esta guía describe el pipeline **glTF 3D** del prototipo F3, que se retiró en el Prompt 4 (S4; el código sigue en el *tag* `proto-3d-f5`).
> Su sucesora es [replace-sprites.md](replace-sprites.md) (*sprite sets*: atlas, clips, anclas, *fallbacks*, contrato de espada). El principio no cambia:
> el gameplay habla en estados y anclas lógicos, nunca en archivos ni fotogramas.

Reemplazar un modelo = **apuntar una `ModelDefinition` a un `.glb` nuevo**. No se toca gameplay, IA, combate
ni cámara: el simulador solo habla en *estados lógicos* (`'run'`, `'attack'`…) y *sockets lógicos*
(`'weapon_r'`…), nunca en nombres de clip, huesos o archivos.

## 1. Qué debe traer el `.glb`

| Requisito | Detalle |
|---|---|
| Orientación | En reposo, el modelo **mira hacia +Z**, con los **pies en y = 0** (Y arriba). Si tu pipeline exporta otra cosa, corrígelo con `yawOffsetDeg` y `scale`, no reexportando. |
| Esqueleto | Cualquier jerarquía de huesos. **Nombres sin puntos, espacios ni corchetes** (`upperArm_L`, no `upperArm.L`): three.js los usa como ruta de animación y los sanea. |
| Animaciones | Clips con nombre. Mínimo: **uno** para `idle` (es el *fallback* de todo). El resto es opcional: lo que falte se resuelve por cadena (`walk→run→idle`, `attack2→attack→idle`, …, ver `ANIM_FALLBACKS`). |
| Sockets | Nodos vacíos hijos del hueso adecuado. Convención `SOCKET_<id>`; ids en `src/models/vocabulary.ts`: `weapon_r weapon_l shield projectile_origin vfx_feet vfx_hand_r vfx_hand_l vfx_center interaction head back`. Los que falten se sintetizan con un aviso. |
| Materiales | `look.style: 'toon'` (por defecto) conserva color/mapa base de tu material y le aplica el sombreado del juego (3 tonos + rim + contorno). `'keep'` usa tus materiales tal cual. |
| Peso | Objetivo móvil: ≤ 5 k triángulos, ≤ 1 textura de 512–1024 px por personaje. |

> El maniquí placeholder (`public/assets/models/mannequin.glb`) es la **especificación por ejemplo**:
> ábrelo en Blender para ver jerarquía, nombres y sockets. Se regenera con `npm run gen:models`.

## 2. Pasos

1. Copia el archivo a `public/assets/models/mi_personaje.glb`.
2. Añade una definición en `src/content/models.ts` y regístrala en `MODELS`:

   ```ts
   export const HERO: ModelDefinition = {
     id: 'hero',
     url: 'assets/models/mi_personaje.glb',
     scale: 1,              // → la validación te sugiere el valor si la altura no cuadra
     yawOffsetDeg: 0,
     height: 1.8,           // altura nominal en metros
     clips: { idle: 'Idle', run: 'Run', jump: 'Jump', attack: 'Slash_01' /* … */ },
     sockets: { weapon_r: 'hand.R_weapon' /* solo si NO usas SOCKET_<id> */ },
     look: { style: 'toon', outline: { thickness: 0.035, color: 0x16120f }, rim: { color: 0xfff4e4, strength: 0.7, power: 2.4 } },
   };
   ```
3. En `src/content/player.ts` cambia `modelId: 'hero'`. (Para un enemigo/jefe: el `modelId` de su definición.)
4. Mírala sin jugar: `http://localhost:5173/?lab=model&model=hero` — hoja de contacto con todos tus estados.
   Variantes: `&state=run&frames=8` (ciclo en 8 fotogramas), `&facing=-1`, `&yaw=90`.
5. Abre la consola: el **validador de contrato** (`validateModel`) avisa de clips inexistentes, huesos
   animados que no existen (animación muerta), sockets que faltan y escala incoherente (con el valor sugerido).

## 3. Qué ajustar si algo se ve raro

| Síntoma | Causa probable | Arreglo |
|---|---|---|
| Personaje gigante / minúsculo | Unidades del DCC | `scale` (usa el valor sugerido por el validador) |
| Mira hacia la cámara o de espaldas | Eje frontal distinto | `yawOffsetDeg: 90 / -90 / 180` |
| Se queda en T-pose | Nombres de clip mal en `clips` o tracks que apuntan a huesos inexistentes | Revisa el error del validador |
| Flota o se hunde | Origen del modelo no está en los pies | Mueve el origen en el DCC (pies = y 0) |
| Contorno con huecos | Normales duras (bordes rectos) | Suaviza normales o reduce `outline.thickness` |
| Una animación «salta» al repetirse | Clip no es cíclico | Marca `loop: false` en el `ClipSpec`, o hazlo cíclico |

## 4. Tiempos de animación (ataques)

El juego ajusta la duración del clip al **tiempo del ataque definido en datos** (`AttackDefinition`:
startup + active + recovery). No hace falta reexportar el clip si cambias el *balance*; hace falta que el
clip tenga la **proporción** correcta (anticipación → golpe → recuperación) para que el impacto visual caiga
dentro de los frames activos.

## 5. Qué **no** se toca

`player/` (lógica), `combat/`, `enemies/`, `bosses/`, cámara, input, guardado. Si para integrar un modelo
necesitas editar alguno de ellos, es un bug de arquitectura: repórtalo.
