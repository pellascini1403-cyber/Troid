# Cómo sustituir el arte de un personaje (o enemigo / jefe): *sprite sets*

> Sustituye a la guía glTF 3D ([replace-model.md](replace-model.md), obsoleta). El principio no cambia: el gameplay habla en **estados lógicos**
> (`'run'`, `'attack'`…) y **anclas lógicas** (`'weapon_tip'`…), nunca en archivos ni fotogramas. Sustituir el arte = **declarar un paquete de arte** y
> dejar que el motor lo cargue. No se toca gameplay, IA, combate, cámara ni input.
>
> Las imágenes del protagonista son la **fuente de verdad** ([GAME-SPEC-2D §2](../GAME-SPEC-2D.md)): se integran tal cual, **sin recolorear,
> recortar a ojo, remuestrear ni redibujar**. Mientras no existan, el juego usa el *placeholder* abstracto
> (`src/content/placeholders/playerPlaceholder.ts`), que atraviesa exactamente el mismo pipeline.
>
> **Estado (Prompt 7, S35):** esta guía describe el camino de **archivos**: carpeta `art/` → `npm run assets:pack` → `public/art/` → biblioteca de arte
> (`assets/artLibrary.ts`). El detalle técnico —reglas de atlas, empaquetador, política de carga— está en [ART-PIPELINE-2D.md](../ART-PIPELINE-2D.md) (partes B y C).
> Lo que todavía **no** está (el adaptador que **dibuja** al héroe con el arte cargado, S36; el laboratorio `?lab=player`, S39) está marcado en cada paso.
> **Hoy no hay arte real en el repositorio.**

## 1. Qué entrega el artista

Dos formas, a elegir (se pueden mezclar por paquete):

| Forma | Qué se entrega | Qué hace el motor |
|---|---|---|
| **A · Fotogramas sueltos** | un **PNG por fotograma**: `art/<paquete>/<set>/<nombre>.png` (`idle_00.png`, `attack1_03.png`…), **todos dibujados en el mismo lienzo** | el empaquetador los **recorta** (solo alfa 0), **deduplica**, **empaqueta** en páginas ≤ 2048 y escribe el JSON; sin pérdida |
| **B · Atlas ya empaquetado** | las imágenes y el JSON **«hash» de TexturePacker / Aseprite / Free-Tex-Packer** (sin rotación), declarados en `atlases` del manifiesto | se **copian tal cual, byte a byte**, tras las mismas comprobaciones |

| Entregable | Detalle |
|---|---|
| Orientación | El arte mira a la **derecha**; el motor lo espeja para `facing = -1` (no se entregan fotogramas espejados). |
| Nombres | `<prefijo>NN` con dos dígitos (`idle_00`, `run_05`, `attack1_03`); el prefijo se declara en el clip (`"frames": "attack1_"`). **Prefijos únicos dentro del paquete.** |
| Lienzo y pivote | **Todos los fotogramas de un set comparten lienzo.** El pivote (`[0.5, 0.95]`, o `pivotPx` con `frameSize`) es una fracción de ese lienzo: es el centro de los pies. |
| Escala | `artPxPerMeter` = píxeles de arte por metro de mundo **de la imagen maestra**; `scale` es un multiplicador visual (dirección de arte, 0.25–4). **El tamaño en pantalla no depende de la resolución del arte** (S34: `artManifest.test.ts`, `actorSprite.test.ts`). |
| Variantes de resolución | Si el artista exporta una variante a la mitad (`"resolution": 0.5`), el motor **elige** la que conviene a la pantalla; **no fabrica** variantes por su cuenta. |
| Formato | PNG; RGBA de 8 bits es lo ideal. 16 bits se redondean a 8 (se avisa). Exporta en **sRGB**: un perfil de color incrustado no se arrastra (se avisa). Sin entrelazado. |
| Anclas por fotograma | `anchors` en el manifiesto (`frames.<nombre>.anchors`) o en el JSON del atlas (`meta.troid.frames`): **metros respecto a los pies**, +x adelante, +y arriba. `heightPx` en **píxeles de la maestra**. |

### Anclas

`feet · head · hand_r · weapon_grip · weapon_tip · hit_origin · vfx_origin · projectile_origin · interaction`

**Contrato de espada** (el validador lo exige en cada fotograma de `attack`, `attack1`, `attack2`, `attackAir` (`aerialAttack`), `attackCrouch` (`crouchAttack`) y `special`):
`hand_r`, `weapon_grip` y `weapon_tip` existen, y `|weapon_grip − hand_r| ≤ 0.04 m`: la espada está **en la mano derecha**.
Los VFX del tajo, los proyectiles y las chispas de impacto nacen en estas anclas, nunca en coordenadas de píxel. `hit_origin` es **solo para herramientas y
efectos cosméticos**: el *hitbox* es dato en `AttackDefinition`, nunca sale del dibujo.

### Estados y *fallbacks*

El *sprite set* **no necesita todos los estados**: lo que falta se resuelve por cadena (`walk → run → move → idle`, `death → hurt → idle`,
`attackCrouch → attack → attack1 → idle`…, ver `ANIM_FALLBACKS` en `presentation/vocabulary.ts`) y la cadena siempre acaba en `idle`. Un set con un solo clip
`idle` anima todo sin errores. Nombres que el artista puede usar además de los del motor: `aerialAttack`, `airAttack`, `crouchAttack`, `landing`, `damage`, `die`.
Mínimo recomendado para el jugador: `idle walk run jump fall land crouch crouchWalk dash attack1 attack2 attackAir attackCrouch hurt death cast drink interact`.

### Ataques por fase

Los clips de ataque declaran `phases` (rangos **inclusivos** de índices de fotograma):

```jsonc
"attack1": { "frames": "attack1_", "count": 6, "fps": 12, "phases": { "startup": [0, 1], "active": [2, 3], "recovery": [4, 5] } }
```

El fotograma que se muestra sale de la **fase de la simulación** (`startup → active → recovery`) y del progreso dentro de ella, **no del reloj**: el golpe
visible coincide con la *hitbox* aunque cambie el balance (`AttackDefinition`). El artista solo tiene que dibujar el impacto dentro de los fotogramas `active`.
No hay *cross-fade* en 2D: cada cambio de estado es un corte limpio.

## 2. Pasos

1. **Escribe los archivos** en `art/`:

   ```
   art/index.json                      { "manifestVersion": 1, "packs": [ { "id": "player", "category": "player", "load": "boot", "manifest": "player/player.pack.json" } ] }
   art/player/player.pack.json         el manifiesto (sin `atlases` si entregas fotogramas sueltos: los escribe el empaquetador)
   art/player/hero/idle_00.png …       un PNG por fotograma
   ```

   El manifiesto (campos completos y reglas en [ART-PIPELINE-2D §B.2](../ART-PIPELINE-2D.md)):

   ```jsonc
   { "manifestVersion": 1, "id": "player", "category": "player", "status": "provisional",
     "atlases": [],
     "sprites": [ {
       "id": "hero", "artPxPerMeter": 96, "pivot": [0.5, 0.96], "height": 1.7,
       "clips": {
         "idle":    { "frames": "idle_",    "count": 8, "fps": 8 },
         "attack1": { "frames": "attack1_", "count": 6, "fps": 12, "phases": { "startup": [0,1], "active": [2,3], "recovery": [4,5] } }
       },
       "frames": { "attack1_02": { "anchors": { "hand_r": [0.62, 1.02], "weapon_grip": [0.62, 1.02], "weapon_tip": [1.5, 1.3] } } }
     } ] }
   ```

   `status`: `provisional` / `final` publican el paquete; `awaiting-art` **declara lo que tendrá sin imágenes** y **no se publica** (el juego no pide nada).
2. **Compruébalo sin escribir nada:** `npm run assets:check` — informa de **todos** los problemas de una vez, con la ruta del archivo: fotogramas que faltan, imágenes **sin canal alfa**
   (un RGB: el lienzo entero se dibujaría como un rectángulo), lienzos de tamaños distintos, JSON de atlas incoherente, anclas en píxeles en vez de metros, espada fuera de la mano,
   clips que el juego dejaría fuera… Sale con 1 si hay un error, y **`npm run build` lo ejecuta**: un asset roto no compila (lista completa en [ART-PIPELINE-2D §E](../ART-PIPELINE-2D.md)).
   `npm run assets:verify` comprueba solo lo que hay en `public/art/`.
3. **Empaqueta:** `npm run assets:pack` — escribe `public/art/` (generado; lleva un `README.txt` que lo dice; **no se edita a mano**). Solo escribe si **no hay ningún error**.
4. **Reinicia `npm run dev`** (el servidor decide al arrancar si hay arte) o haz `npm run build`. Con `public/art/index.json` presente, el juego pide el arte **después del primer fotograma**;
   sin él, no pide nada. Para probar una carpeta de arte sin empaquetarla en `public/`: `?art=<carpeta junto a la página>`.
5. **El héroe lo usa solo:** si el índice lista el paquete `player` y su manifiesto declara el set `hero` (el sitio está en `src/content/visuals.ts`), el héroe se dibuja con él **en los estados en que el arte lo representa** y con el *placeholder* en el resto (§D.3 de [ART-PIPELINE-2D](../ART-PIPELINE-2D.md): `idle`, `walk`/`run`, `jump`/`fall`, `attack`/`attack1`, `attack2`… tienen sustitutos; `dash`, `crouch`, `hurt`, `death`, `cast`, `drink`, `interact`, `attackAir`, `attackCrouch` necesitan **su propio clip**). **Volver al *placeholder* en cualquier momento:** `?visual=placeholder`. **Ver solo el arte** (con su propia cadena de *fallbacks*): `?visual=art`. Los clips que el arte aún no trae los dice la consola de desarrollo (una línea).
6. **Verlo sin jugar:** *(llega con S39: `?lab=player`)*. Hoy `?lab=sprites` enseña la hoja de contacto y las anclas **del *placeholder***.
7. **La consola** (en desarrollo o con `?hooks=1`) dice lo que no cuadra, con el prefijo `[art]`: un archivo que falta, una imagen de otro tamaño que el declarado, un clip que se deja fuera y **por qué**.

## 3. Qué hace el motor si algo falla

**Nada de lo que haga el arte puede romper el juego.** Un 404, un JSON corrupto, una imagen que no es una imagen, un fotograma que falta, una espada fuera de la mano:

| Qué falla | Qué pasa |
|---|---|
| un archivo no llega o es ilegible | ese set no se carga; el juego se queda con su *placeholder*; una nota en la consola de desarrollo |
| a un **clip** le falta un fotograma, tiene fases fuera de rango o (en ataques) la espada no está en la mano | **ese clip** se deja fuera (su estado cae por la cadena de *fallbacks* o al *placeholder*); **el resto del set sigue siendo arte real**; la nota dice por qué |
| `idle` está roto, o los fotogramas del set no comparten tamaño | se rechaza el **set entero** |

## 4. Qué ajustar si algo se ve raro

| Síntoma | Causa probable | Arreglo |
|---|---|---|
| Personaje gigante / minúsculo | `artPxPerMeter` | el validador sugiere el valor cuando la altura no cuadra |
| Flota o se hunde | El pivote no está en los pies | corrige `pivot` (normalizado al lienzo **original**, no al recortado) |
| Mira hacia atrás | El arte no está dibujado hacia la derecha | reexporta (no se corrige con código) |
| El tajo no sale de la espada | Anclas por fotograma ausentes o desplazadas | revisa `frames.<nombre>.anchors` y el contrato de espada |
| El golpe visible no coincide con la *hitbox* | Rangos de `phases` mal puestos | ajusta los índices; el golpe debe caer en `active` |
| Un fotograma «no aparece» | Nombre distinto del esperado | `assets:check` lo lista; corrige el prefijo en `clips` o el nombre del archivo |
| Los pies «saltan» entre fotogramas | los lienzos no son del mismo tamaño | exporta todos los fotogramas del set en el mismo lienzo (el empaquetador lo rechaza) |

## 5. Cambiar el arte en caliente (pieles, variantes)

`ActorSprite.setSpriteSet(set)` cambia el arte de un actor vivo sin tocar el estado de simulación (`ActorViewState` queda intacto; el siguiente `sync` continúa desde el estado actual).
La biblioteca de arte cuenta referencias (`acquire` / `release`) y libera las texturas y las páginas cuando se suelta la última.

## 6. Qué **no** se toca

`player/` (lógica), `combat/`, `enemies/`, `bosses/`, cámara, input, guardado. Si para integrar un *sprite set* necesitas editar alguno de ellos, es un error de arquitectura: repórtalo.
