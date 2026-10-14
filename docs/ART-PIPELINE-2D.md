# Pipeline de arte 2D — cómo entra el arte al juego

> **Estado:** Prompt 7. Este documento se amplía **paso a paso** (S33 → S44). La **Parte A** es la **auditoría de S33**: cómo funcionaba el pipeline **antes de tocar nada** (es una foto histórica: lo que S35 cambió está marcado en ella y explicado en la **Parte C**). La **Parte B** es el contrato (S34) y la **Parte C** los atlas, la carga diferida y el presupuesto (S35). El resto —el visual intercambiable (D), la validación en el *build* (E), el protagonista (F), el laboratorio y R1 con el arte completo (G), VFX y audio (H), el entorno (I), el coste medido (J)— se añadió con cada paso, y la **Parte K** (S44) es el cierre: el *pipeline* entero de un vistazo, la lista de lo que hacer el día que llegue el arte, qué falta exactamente y qué no se ha medido. **El Prompt 7 está cerrado: el *pipeline* está listo y el arte del protagonista, no (0 de 15 clips).**
>
> **Aviso, sin letra pequeña:** **en el repositorio no hay arte real del protagonista** (ni de nada). Todo lo que se dibuja hoy sale de generadores procedurales (un atlas de *canvas*). Este pipeline existe para que, cuando llegue el arte real **del usuario**, entre **sin tocar el gameplay**. **No se ha generado, redibujado ni imitado el protagonista**, y nada de este documento lo hace (§A.12).

> **Actualización (Prompts 8, 9 y 10):** el aviso de arriba es el del Prompt 7. Desde entonces el repositorio **sí** tiene el protagonista del usuario (su hoja de poses, guardada bit a bit; partes **L** y **N**: de la hoja a 114 fotogramas movidos por un rig, **sin dibujar nada**) y un escenario, un jefe, un enemigo y unos efectos **pintados por código** (parte **M**, provisionales). `npm run assets:missing` dice qué falta en cada momento. **Parte O (Prompt 10): lo que falta son 46 dibujos en 10 clips; no había generador de imágenes, así que no se dibujó nada, y lo que hay es el kit para pedirlos y la herramienta que los recibe, comprueba e integra.** **Prompts 11 y 12: el usuario generó los 46 dibujos en tres hojas y entraron por esa herramienta (O.4.1 y O.10): 10 de los 18 clips son dibujos nuevos y ninguno es un *stand-in*; las cifras que siguen de «114 fotogramas» son las de antes de las entregas (hoy 90).**

---

# Parte A — El pipeline REAL (auditoría de S33)

## A.1 Mapa de módulos

| Módulo | Capa | Qué hace |
|---|---|---|
| `presentation/vocabulary.ts` | pura | los **ids lógicos**: estados de animación (`idle`, `walk`, `attack`…), **anclas** (`feet`, `head`, `hand_r`, `weapon_grip`, `weapon_tip`, `vfx_origin`…), la cadena de *fallbacks* de cada estado y cuáles son *one-shot* |
| `presentation/SpriteSetDefinition.ts` | pura | el **contrato** de un conjunto de sprites: `id`, `atlas`, `artPxPerMeter`, `pivot`, `height`, `clips`, `anchors`, `placeholder`; y `AtlasMeta` / `FrameMeta` (datos **por fotograma**: `heightPx`, `anchors`) |
| `presentation/animation.ts` | pura | `SpriteAnimator`: **qué clip** juega un estado (con *fallbacks*) y **qué fotograma** muestra un instante o una **fase** de la simulación |
| `presentation/anchors.ts` | pura | `resolveAnchor`: dónde está un ancla **en este fotograma** (dato del fotograma → dato fijo del set → proporcional) |
| `presentation/ActorPresenter.ts` | pura | une un `ActorViewState` (lo que escribe la simulación) con un set: interpola la posición, lleva el animador, calcula giro, destello y parpadeo → un `SpritePose` (sin tipos de Pixi) |
| `presentation/validateSpriteSet.ts` | pura | el **validador** del contrato: pivote, `idle`, fotogramas que existen, fases, contrato de la espada, escala |
| `presentation/placeholder.ts` + `content/placeholders/playerPlaceholder.ts` | pura | la **tabla de poses** del *placeholder* abstracto del héroe y los generadores de su `SpriteSetDefinition`, sus anclas por fotograma y su disposición de atlas |
| `assets/SpriteAssetManager.ts` | vista (genérica) | carga y **cachea** sets por `def.id`: una sola carga por set, **cuenta de referencias**, libera al llegar a 0, una carga fallida no envenena la caché, **valida** al cargar |
| `assets/spriteLoader.ts` | vista (Pixi) | `SpriteSetDefinition` → texturas: atlas **`procedural:<id>`** (canvas) o atlas **de archivo** (`<base><atlas>.json` + imagen). **(S35: la rama de archivo salió de aquí — era el único uso de `Assets` de Pixi en el arranque —; hoy es solo el atlas procedural y `texturesFromFrames`; los atlas de archivo los carga `assets/artLibrary.ts`, §C.5.)** |
| `assets/placeholderAtlas.ts`, `assets/proceduralTextures.ts` | vista | pintan el atlas del *placeholder* y las texturas generadas (brillos, degradados) con un *canvas* |
| `assets/vfxAtlas.ts` | vista | **un** atlas procedural de formas blancas para todos los VFX (`glow`, `spark`, `shard`, `ring`, `dust`, `ink`, `streak`, `arc`); el color sale de la paleta en tiempo de ejecución |
| `render/ActorSprite.ts` | vista (Pixi) | aplica un `SpritePose` a **dos** sprites (cuerpo + destello aditivo); pivote = `def.pivot`, escala = `1 / artPxPerMeter`, giro = `scale.x` |
| `render/ProceduralActor.ts` | vista (Pixi) | enemigos **sin fotogramas** (formas deformadas por el estado): el Ink Slime |
| `render/RoomView2D.ts`, `render/backdrops.ts`, `render/layers.ts` | vista | el entorno **procedural**: rectángulos de `room.solids` con color por material, puertas, pinchos, columnas de luz; fondos de *parallax* por id (`room.art.backdrop`) |
| `render/Renderer2D.ts` | vista | la `Application` de Pixi, las capas, el viewport (altura visible fija 13.5 m), la resolución por perfil de calidad |
| `debug/DrawCallCounter.ts`, `app/testHooks.ts` | vista (solo dev / `?hooks=1`) | cuentan las llamadas de dibujo; `state().sprite` expone set, fotograma, giro y anclas del héroe |
| `app/labs/spriteLab.ts` (`?lab=sprites`) | herramienta (*chunk* aparte) | hoja de contacto de un set con las anclas dibujadas y un actor vivo; prueba el cambio de resolución |

## A.2 El camino de un PNG (de principio a fin)

```
ARTISTA        hero.png  +  hero.json   (JSON de spritesheet «hash» de TexturePacker / Aseprite / Free-Tex-Packer)
                                          frames{ idle_00:{frame{x,y,w,h}, trimmed, spriteSourceSize, sourceSize}, … }
                                          meta{ image:'hero.png', troid:{ frames:{ idle_00:{ heightPx, anchors{hand_r,weapon_grip,weapon_tip,…} } } } }
                  │  se copia a  public/<atlas>.json  y  public/<atlas>.png      (hoy: public/ NO tiene ninguno)
                  ▼
CONTENIDO      content/sprites.ts   SPRITE_SETS[id] = SpriteSetDefinition { atlas:'sprites/hero', artPxPerMeter, pivot, height, clips{estado:{frames:'idle_', count, fps, loop, phases}}, anchors }
                  │  PlayerDefinition.spriteSetId = id
                  ▼
ARRANQUE       Game2D.create → sprites = new SpriteAssetManager(createPixiSpriteLoader({procedural}))
                  │             playerSet = await sprites.acquire(SPRITE_SETS[PLAYER.spriteSetId])   ← ANTES del primer fotograma
                  ▼
CARGA          spriteLoader: def.atlas empieza por 'procedural:'  →  canvas (hoy, el único camino ejercitado)
                              si no:  fetch(`${BASE_URL}${atlas}.json`) → imagen = new URL(json.meta.image ?? `<atlas>.png`, URL del JSON)
                                      → Assets.load(imagen) → texturesFromFrames(source, json.frames)   (honra trim y sourceSize)
                  │  → { meta: json.meta.troid, textures: Map<nombre de fotograma, Texture>, dispose }
                  ▼
VALIDACIÓN     SpriteAssetManager.report: validateSpriteSet(def, meta, nombres de fotogramas) → log.error / log.warn (una vez por conjunto)
                  ▼
               ⚠ (S35) la rama «si no» de CARGA (archivo, `Assets.load`) YA NO EXISTE en `spriteLoader`: el camino de archivo es hoy
                 art/ → `npm run assets:pack` → public/art/ → `ArtLibrary` (§C.2, §C.5), y la carga de PNG no usa `Assets` de Pixi (§C.7)
VISTA          new ActorSprite(set)  →  body: Sprite + flash: Sprite(add) ; anchor = def.pivot ; scale = 1 / artPxPerMeter
                  ▼  cada fotograma del juego
ANIMACIÓN      Player.view (ActorViewState: anim, animSpeed, animSerial, phase, phaseT, prevX…, facing, flash, blink, opacity)
                  → ActorPresenter.sync → SpriteAnimator.play(anim, {phase, phaseT, speed, restart}) → nombre `${clip.frames}${NN}`
                  → ActorSprite.show(textures.get(nombre)) ; root en los pies (metros, +y abajo) ; root.scale.x = facing
```

## A.3 Las nueve preguntas, contestadas con el código

| Pregunta | Respuesta (dónde) |
|---|---|
| **¿Cómo entra un PNG al juego?** | Por un **atlas**: un `<atlas>.json` + su imagen en `public/`, referenciados por `SpriteSetDefinition.atlas`. El cargador hace `fetch` del JSON y `Assets.load` de la imagen (`assets/spriteLoader.ts`). **Hoy no hay ningún PNG**: el único atlas es el procedural del *placeholder* |
| **¿Cómo se convierte en textura?** | `texturesFromFrames(source, frames)`: **una `Texture` por fotograma**, todas con el **mismo `TextureSource`** (una sola subida a la GPU), con su `frame`, su `orig` (tamaño sin recortar) y su `trim` si el empaquetador recortó transparencias |
| **¿Cómo se asocia a un fotograma?** | **Por nombre**: un clip declara un prefijo y una cuenta (`frames:'attack_', count:6`) y el animador produce `attack_00 … attack_05` (`frameName`). El mapa `textures` está indexado por esos nombres. El validador exige que existan |
| **¿Cómo se escala?** | `sprite.scale = 1 / def.artPxPerMeter`: el sprite se mide en **metros**, no en píxeles. El mundo ya trabaja en metros; la cámara pone `ppm` (px CSS por metro) y la resolución del perfil hace el resto (§A.4). **Cambiar la resolución del arte = cambiar `artPxPerMeter`** (lo prueba el laboratorio: el mismo set a 56 y a 36 px/m ocupa lo mismo en pantalla) |
| **¿Cómo se posiciona?** | `ActorSprite.root` va en el **centro de los pies** del actor en el espacio de vista (metros, +y abajo); `ActorPresenter` interpola entre el tick anterior y el actual. Ningún offset por fotograma: el **pivote es constante** |
| **¿Cómo se anima?** | `SpriteAnimator` (puro): la **simulación** pide un estado lógico (`deriveAnimation` en `player/playerAnimation.ts`); si el set no tiene ese clip se sigue la **cadena de *fallbacks*** (`walk → run → move → idle`; termina siempre en `idle`). Los clips con `phases` toman el fotograma de la **fase** de la simulación (`startup → active → recovery`): el golpe visible coincide con el *hitbox* aunque se retoque el equilibrio. Los demás, del **tiempo** × `animSpeed` |
| **¿Cómo se establece el pivote?** | `def.pivot` **normalizado al fotograma SIN recortar** (`[0.5, 1]` = abajo al centro; el *placeholder* usa `[0.45, 0.92]`). Se aplica como `sprite.anchor`; como `Texture.orig` es el tamaño original, el recorte del empaquetador no mueve el pivote |
| **¿Cómo se establece el ancla de la espada?** | **Por fotograma**, en `meta.troid.frames[nombre].anchors` (`hand_r`, `weapon_grip`, `weapon_tip`), en **metros relativos a los pies** (+x hacia delante, +y arriba). Precedencia: dato del fotograma → ancla fija del set → proporcional (`fallbackAnchor`). El **contrato** (`SWORD_GRIP_TOLERANCE = 0.04 m`): en cada fotograma de los clips de ataque `weapon_grip` está a ≤ 4 cm de `hand_r` y existe `weapon_tip` |
| **¿Cómo se sustituye un asset sin tocar gameplay?** | El gameplay solo habla en **ids lógicos** (`AnimState`, `AnchorId`) y en `ActorViewState`; ninguna cosa de gameplay conoce un nombre de fotograma, un atlas o una textura. Sustituir = **apuntar otra `SpriteSetDefinition`** (otro `atlas`, `artPxPerMeter`, nombres de clips) y, en caliente, `ActorSprite.setSpriteSet(set)`. `PlayerDefinition.spriteSetId` es el único enlace |

## A.4 Unidades, resolución y escala (los números reales)

El **mundo** está en metros (el héroe mide 1.7 m; la altura visible de la cámara es fija: **13.5 m**). El renderer calcula:

`ppm` (px CSS por metro) = alto del área de juego / 13.5 · `resolución` = `min(devicePixelRatio, tope del perfil)` con topes **1.25 / 1.75 / 2** (baja / equilibrada / alta) · **píxeles de render del héroe** = 1.7 × `ppm` × `resolución`.

| Pantalla | `ppm` | Héroe (px CSS) | Resolución | Héroe (px de render) |
|---|---:|---:|---:|---:|
| móvil 844 × 390, DPR 3, perfil equilibrado | 28.9 | 49 | ×1.75 | **86** (alta: 98) |
| móvil pequeño 667 × 375, DPR 2 | 27.8 | 47 | ×1.75 | 83 |
| tableta 1180 × 820, DPR 2 | 60.7 | 103 | ×1.75 | **181** (alta: 206) |
| escritorio 1920 × 1080, DPR 1 | 80 | 136 | ×1 | **136** |
| escritorio 4K 3840 × 2160, DPR 1 | 160 | 272 | ×1 | **272** (el peor caso) |

Consecuencias que el contrato (S34) y los atlas (S35) tienen que respetar:

- Un maestro a **160 px/m** (héroe de 272 px) coincide 1:1 con el caso más exigente (4K a DPR 1) y queda **entre 1.4× y 3.2× por encima** de lo que un móvil o una tableta dibujan: se **reduce** (filtrado lineal; los *mipmaps* solo valdrían la pena en fondos grandes). Una variante a la mitad (80 px/m) cuesta **4× menos memoria** y basta para móviles y para el perfil bajo.
- Hoy **solo existe una resolución por set** (`artPxPerMeter`): la «variante» del laboratorio (`?lab=sprites&variant=1`) es una **prueba** de que el pipeline mide en metros, no una selección en el juego.
- **Memoria:** un RGBA de 2048² son 16 MiB. El atlas del *placeholder* (62 fotogramas, 8 columnas de celdas de 202 × 134 px a 56 px/m) mide **1616 × 1072 = 6.6 MiB** porque **no está recortado** (cada celda es de 3.6 × 2.4 m para un héroe de 1.7 m): un atlas real **debe** ir recortado (`trim`) y empaquetado apretado.

## A.5 La animación, separada del gameplay

- **La simulación decide el estado, la presentación decide el fotograma.** `Player.view` (`ActorViewState`) lleva `anim` (id lógico), `animSpeed` (para que los pies casen con la velocidad real), `animSerial` (cambia para **reiniciar** el clip: ataques repetidos), `animDuration` (ajusta un clip al tiempo de un ataque), `phase` + `phaseT` y los datos de posición y de estado visual (`flash`, `blink`, `opacity`, `visible`).
- **Ningún cruce de fotogramas:** un cambio de estado es un **corte** al primer fotograma (o, en clips por fases, al fotograma de la fase actual). Es lo que mantiene el golpe visible alineado con la simulación.
- **Clips que hoy tiene el *placeholder*** (18): `idle` 4 · `walk` 6 · `run` 6 · `jump` 2 · `fall` 2 · `land` 2 · `crouch` 2 · `crouchWalk` 4 · `dash` 2 · `attack` 6 · `attack2` 6 · `attackAir` 6 · `attackCrouch` 6 · `hurt` 2 · `death` 6 · `cast` 6 (los de `attack2`) · `drink` 4 · `interact` 4 (los de `idle`): **62 fotogramas**. Los ataques son de 6 fotogramas con fases `startup [0,1] · active [2,3] · recovery [4,5]`.
- **Nombres:** el vocabulario usa `attack` / `attack1` (alias), `attack2`, `attackAir`, `attackCrouch`. Un artista que diga «aerialAttack» o «crouchAttack» necesita una **tabla de alias** (S34).

## A.6 Anclas y espada

- Ocho anclas lógicas: `feet`, `head`, `hand_r`, `weapon_grip`, `weapon_tip`, `vfx_origin`, `projectile_origin`, `interaction`.
- **El *placeholder* dibuja la espada como una línea desde la mano**, así que sus anclas **salen de la misma tabla de poses que la imagen** (`poseAnchors`): no pueden separarse de lo dibujado. Con arte real la espada **está cocida en la imagen** y las anclas son **datos que aporta quien exporta el atlas**: el validador las comprueba, no las inventa.
- **Quién consume las anclas hoy:** el **validador**, el gancho de pruebas (`state().sprite.hand/grip/tip`) y el laboratorio. **Ni el gameplay ni los VFX las usan**, a propósito: el origen de un proyectil y el *hitbox* de un ataque son dato en `*Definition` (GAME-SPEC-2D §2.6), y los arcos de espada se ajustan al *hitbox*.
- **Lo que el validador comprueba de la espada hoy:** solo los clips `attack, attack1, attack2, attackAir, attackCrouch, special`. **No** mira `idle`, `walk`, `dash`, `jump`, `hurt`: S37 lo amplía.

## A.7 Visual ≠ colisión ≠ *hitbox* ≠ *hurtbox*

| Qué | Dónde vive | Valor hoy |
|---|---|---|
| **Cuerpo de colisión** | `content/player.ts` → `PLAYER.body` | mitad de ancho 0.35 m, alto 1.7 m (agachado: `movement.crouch.height`) |
| **Hurtbox** (lo que puede ser herido) | `PLAYER.body.hurtbox` | mitad de ancho 0.30 m, alto 1.55 m (más pequeña que el cuerpo, a propósito) |
| **Hitbox** de cada ataque | `content/attacks.ts` (`AttackDefinition.hitbox`: `x, y, w, h` relativos al cuerpo mirando a la derecha) | p. ej. `slash_1` 1.4 × 1.1 m |
| **Límites visuales** | `SpriteSetDefinition.height` (solo **validación** y anclas de reserva) y el tamaño de cada fotograma | 1.7 m |

**Ninguno de los cuatro primeros se lee del sprite.** Cambiar el tamaño visual cambia `artPxPerMeter` / `height` y nada más.

**Desde S40 se pueden *ver* las cuatro a la vez en el juego** (`state().boxes` de los ganchos de prueba, §G.3): `visual` —el rectángulo de **lo que se ve**: los píxeles del fotograma en pantalla, recortados, en metros de mundo (`ActorSprite.bounds()`, `presentation/pictureBounds.ts`)—, `body`, `hurtbox` y `hitbox` (el del golpe del héroe en el último tick, o `null`). La primera es **del dibujo**; las otras tres, **de la simulación**, y **`architecture.test.ts` impide que la simulación mire el dibujo**: `player/`, `combat/`, `gameplay/`, `world/`, `enemies/`, `abilities/`, `interaction/` y `progression/` solo pueden importar de `presentation/` el **vocabulario** (`vocabulary`, `actorViewState`), y nada de `render/`, `assets/`, `vfx/` ni de los datos de sprites.

## A.8 Carga y ciclo de vida

- **Hoy se carga un solo set (el del jugador), `await`-ado antes del primer fotograma** (`Game2D.create`). Con el atlas procedural cuesta ≈ 0; con un PNG real sería **ruta crítica** (red + decodificación). Los enemigos (procedurales), el atlas de VFX (procedural) y el entorno (procedural) no se cargan: se **dibujan**.
- `SpriteAssetManager`: una carga compartida por `def.id`; `acquire` / `release` con cuenta; `dispose` libera las texturas al llegar a cero; **una carga fallida se borra de la caché** (no envenena).
- **Lo que NO existe:** carga **por sala o región**, precarga durante el fundido, selección de variante de resolución por perfil, ni un *bundle* declarado por categoría (`boot`, `region:<id>`). El diseño de ARCHITECTURE-2D §7.6 los prevé; no están construidos.
- **Cuidado conocido (se comprobará en S35):** el cargador usa `Assets.load(url)` de Pixi, que **cachea por URL**; `dispose` destruye la textura pero no la saca de esa caché, así que **volver a cargar el mismo atlas** tras liberarlo podría devolver una textura destruida.

## A.9 Presupuesto medido (antes de Prompt 7)

| | Valor |
|---|---|
| Arranque en frío de R1 (JS) | **198.4 KB gz** (31 *scripts*), presupuesto 200 → **margen 1.6 KB** |
| Toda la primera sesión | 212.9 KB gz (35 *scripts*); diferido en reposo 14.4 KB (efectos, partículas, vistas del jefe) |
| *Draw calls* en el peor momento de cualquier escenario | ≤ 22 (el héroe cuesta 2 lotes: cuerpo + destello aditivo) de un presupuesto de 60 |
| Tests | 1833 en 116 archivos |

El *benchmark* de *bundle* cuenta **solo JavaScript**: ni imágenes ni JSON. S35 lo amplía para que el arte **también** se mida.

## A.10 Pruebas y ganchos que ya protegen el pipeline

- **Unitarias:** `tests/unit/sprites/` (`animator`, `actorSprite`, `placeholderContract` —el *placeholder* cumple el contrato y **no se parece al héroe**: un test vigila los tonos—, `placeholderStates`, `spriteAssetManager`), `tests/unit/presentation/` (`worldTransform`, `viewport`, `proceduralPose`), `tests/unit/render/*`, `tests/unit/vfx/*`.
- **E2E:** `sprites` (el set valida sin problemas, 62 fotogramas, los estados llegan a sus clips, las **fases** dan el fotograma esperado, las anclas siguen a la mano, el **cambio de resolución** mantiene el tamaño en pantalla), `stress` (800 sprites de **un** atlas + 4 capas + 1 filtro + 240 partículas ≤ 60 llamadas de dibujo), `render`, `vfx`.
- **Ganchos:** `window.__troid.state().sprite` (set, fotograma, giro, anclas del héroe) y, en el laboratorio, `window.__sprites` (`play`, `frame`, `anchor`, `swap`, `report`).

## A.11 VFX y entorno: lo que hay y por dónde se sustituirá

| | Hoy | Dato que lo gobierna |
|---|---|---|
| **VFX** | **un** atlas procedural de ocho formas **blancas** (`assets/vfxAtlas.ts`); el color sale de una **ranura de paleta** (`energy`, `enemy`…) en tiempo de ejecución; *pooling* y presupuesto de partículas / efectos de sprite por perfil (150/300/400 · 24/40/64) | `VfxDefinition` (`presentation/vfx.ts`: partículas, arco, destello), `VFX_BINDINGS` (disparador → definiciones) y el director (eventos → disparadores), en `content/vfx.ts` |
| **Entorno** | rectángulos por material (`MATERIAL_FILL`) con borde superior iluminado, puertas, pinchos, columnas de luz; fondos de *parallax* **procedurales por id** (`room.art.backdrop = 'ruins'`, `seed`) con los factores de `PARALLAX_FACTOR` (0.15 · 0.4 · 0.75 · primer plano 1.2) | `RoomDefinition.art = { backdrop, seed }`; la **colisión** sale de `room.solids` y **no** depende del arte |
| **Capas de la escena** | `sky · world{ backdropFar, backdropMid, backdropNear, propsBack, terrain, fxBack(add), actors, fxNormal, fxWorld(add), foreground, lightOverlay(add), debug } · screen` | `render/layers.ts` |

## A.12 Qué arte real hay en el repositorio (nada) y qué se puede hacer con lo que existe fuera

- **En el repositorio:** `public/icon.svg` y `public/manifest.webmanifest` (la app, no el juego) y `docs/img/camera-study.png` (un estudio de cámara del prototipo 3D). **Ningún sprite del protagonista, ningún atlas, ningún fotograma.** La historia de git conserva dos vistas previas **recoloreadas** (`docs/img/*-recolor-preview.jpg`) y un maniquí 3D (`public/assets/models/mannequin.glb`) del prototipo retirado: **no son arte del juego y no se usan** (recolorear al protagonista está prohibido).
- **Fuera del repositorio** (la carpeta de adjuntos de la sesión, **no versionada** y que no viaja con el código): **20 imágenes** —10 PNG (una de 1536 × 1024 y nueve de 2752 × 2064) y 10 JPEG— que son el *concept art* y las referencias que aportó el usuario (el retrato, la hoja de poses, las «babas negras», capturas de escenarios: inventario de GAME-SPEC-2D §2.2). Comprobado ahora con `file`: **todas son RGB sin canal alfa**. **No son sprites**: según ese inventario tienen fondo blanco o gris con ruido, escala distinta por pose (193–321 px), efectos rojos fundidos con el cuerpo, una sola imagen por pose y **no incluyen** los clips que el juego necesita (un ciclo de caminar, un salto en fases, 6 fotogramas por ataque…). El GAME-SPEC-2D §2.1 ya lo dice: *«las imágenes son concept art, no sprites de producción»*, y §2.7 dice que usar recortes **verificados pieza a pieza** como piel provisional **requiere que el usuario lo autorice** (DP-1; por defecto, no) — y **no se ha autorizado**.
- **Conclusión de S33:** los assets reales del protagonista **no están disponibles** como sprites. El pipeline se prepara **completo** (contrato, cargador, validación, adaptador, laboratorio) y el *placeholder* abstracto sigue siendo la piel. Qué falta exactamente: la **Parte E** (se escribe en S38).

## A.13 Hallazgos de la auditoría (lo que Prompt 7 cierra)

| # | Hallazgo | Se cierra en |
|---|---|---|
| H1 | El contrato de un set es **TypeScript escrito a mano** en `content/`: añadir arte exige editar código y recompilar; no hay un **manifiesto de datos** que una herramienta o un artista pueda soltar. Faltan `scale`, `width`/`height`, `tags`, anclas de *hitbox* y alias de nombres | **S34** |
| H2 | Solo hay **una resolución** por set; no hay variantes ni regla de elección por perfil/pantalla | S34 (regla) · S35 (variantes) |
| H3 | El cargador **de archivos** (`fetch` + `Assets.load`) **nunca se ha ejercitado con un archivo**; la caché de `Assets` puede devolver una textura destruida tras `dispose` | S35 |
| H4 | **No hay atlas por categoría ni por zona**; el set del jugador se espera **antes del primer fotograma**; `spriteLoader` (y con él `Assets`) están en el *chunk* principal aunque el camino de archivos no se use | S35 |
| H5 | **No hay interfaz `PlayerVisual`**: `Game2D` crea el `ActorSprite` con un `LoadedSpriteSet` directamente; no hay *fallback* por clip hacia el *placeholder*, ni forma de elegir/volver a él en depuración | **S36** |
| H6 | La validación **solo corre en el navegador al cargar** y **no mira archivos** (PNG: dimensiones, alfa, límites; JSON del atlas contra la imagen); la espada se valida solo en los clips de ataque | **S37** |
| H7 | **No hay `?lab=player`**: el laboratorio actual es una hoja de contacto; no avanza fotograma a fotograma ni dibuja *hitbox*/*hurtbox*/límites ni cambia *placeholder* ↔ real | **S39** |
| H8 | R1 se juega con un `ActorSprite` fijo: **no se ha probado** con un visual de archivo, ni con un set que tenga clips que faltan | S40 |
| H9 | Los VFX son **solo procedurales**: no hay forma declarada de sustituir una forma por una textura o por una animación de fotogramas, ni de anclarlos a un ancla del actor | S41 |
| H10 | **Eventos de audio:** los eventos de gameplay existen (`player:attacked`, `combat:hit`, `player:dashed`, `skill:cast`, `boss:strike`, `transition:started`…) pero **no hay una tabla de *cues*** lógicas que el audio futuro consuma | S41 |
| H11 | El entorno es **procedural por id**: no hay `RoomArtDefinition` (capas con textura, *parallax*, *tiles*, decorados, objetos interactivos) | S42 |
| H12 | La escena de estrés mide **800 sprites de un atlas**: no mezcla atlas ni alfa ni VFX, y no mide **memoria** ni **carga** | S43 |

> **Regla de oro que sale de la auditoría:** el pipeline **ya es el correcto** (ids lógicos → definición de datos → cargador → vista); Prompt 7 **no lo rehace**, le añade un **contrato declarativo**, una **vía de archivos probada**, **carga diferida**, un **adaptador reversible**, **validación en el *build*** y las **herramientas** para ver lo que entra.

---

# Parte B — El contrato de assets (S34)

> **Qué es:** lo que un paquete de arte **declara** para que el motor lo use sin que una línea de gameplay lo sepa. Dos archivos JSON versionados (`manifestVersion: 1`): el **índice** (`art/index.json`) y el **paquete** (`art/<paquete>/<id>.pack.json`). Código: `presentation/artManifest.ts` (**puro**: lo lee igual el navegador, Node y los tests). Tests: `tests/unit/presentation/artManifest.test.ts`.
> **Lo que NO es:** arte. Los ejemplos de abajo son **números y nombres técnicos**; ningún archivo del repositorio describe, dibuja ni imita al protagonista.

## B.1 El índice: qué paquetes hay y cuándo se descarga cada uno

```jsonc
// public/art/index.json            (no existe mientras no haya arte: no hay petición, no hay aviso)
{ "manifestVersion": 1,
  "packs": [
    { "id": "player",  "category": "player",      "load": "boot", "manifest": "player/player.pack.json" },
    { "id": "r2_art",  "category": "environment", "load": "zone", "zones": ["r2_hall"], "manifest": "r2/r2.pack.json" },
    { "id": "labs",    "category": "vfx",         "load": "lazy", "manifest": "labs/labs.pack.json" } ] }
```

| Campo | Qué dice |
|---|---|
| `category` | `player` · `enemies` · `environment` · `vfx` · `ui`: **un paquete pertenece a una sola** (así un atlas nunca mezcla lo que no se necesita a la vez; S35) |
| `load` | **`boot`**: con el juego, **después del primer fotograma** (nunca antes) · **`zone`**: cuando el héroe entra en una de sus `zones` (salas o regiones; se pide durante el fundido de la transición) · **`lazy`**: solo cuando algo lo pide por nombre (un laboratorio, una escena de estrés) |
| `manifest` | ruta del paquete, **relativa al índice y dentro de la carpeta `art/`**: nunca `..`, ni `/`, ni esquema (`https:`), ni `\` |

## B.2 El paquete: atlas y conjuntos de sprites

```jsonc
// public/art/<paquete>/<id>.pack.json   (cifras ILUSTRATIVAS)
{ "manifestVersion": 1, "id": "hero", "category": "player", "status": "final", "tags": ["hero"],
  "atlases": [
    { "id": "hero_2x", "source": "hero_2x.png", "data": "hero_2x.json", "width": 1024, "height": 512, "resolution": 1   },
    { "id": "hero_1x", "source": "hero_1x.png", "data": "hero_1x.json", "width":  512, "height": 256, "resolution": 0.5 } ],
  "sprites": [ {
    "id": "hero", "atlases": ["hero_2x", "hero_1x"],
    "artPxPerMeter": 160, "scale": 1, "pivot": [0.5, 0.95], "frameSize": [200, 300], "height": 1.7, "facing": "right",
    "missingClips": "placeholder",
    "clips": {
      "idle":    { "frames": "idle_", "count": 8, "fps": 8 },
      "attack1": { "frames": "atk1_", "count": 7, "frameDuration": 70, "phases": { "startup": [0,1], "active": [2,4], "recovery": [5,6] } },
      "aerialAttack": { "frames": "air_", "count": 6, "fps": 12 } },
    "anchors": { },
    "frames":  { "atk1_03": { "heightPx": 270, "anchors": { "hand_r": [0.62,1.02], "weapon_grip": [0.62,1.02], "weapon_tip": [1.5,1.3], "hit_origin": [1.35,1.25] } } },
    "tags": ["sword"] } ] }
```

| Campo (sprite) | Significado | Regla |
|---|---|---|
| `id` | el id del conjunto (`SpriteSetDefinition.id`) | `[a-z0-9_.:-]`, único en el paquete |
| `atlases` | las imágenes que tienen **los fotogramas de este set**: atlas de **distinta** resolución son **variantes** (el móvil toma la pequeña); atlas de la **misma** resolución son las **páginas** de una variante (los fotogramas que no caben en una imagen) | ids declarados arriba; se ordenan **de mayor a menor resolución** y, dentro de una, en el orden en que se listan |
| `artPxPerMeter` | píxeles de arte por metro **de la imagen maestra** (`resolution: 1`) | > 0. **Es el único vínculo entre los píxeles del arte y los metros del mundo** |
| `scale` | multiplicador **visual** sobre el pie (dirección de arte); por defecto 1 | 0.25–4. **No toca colisión, velocidad ni ningún hitbox** (§A.7) |
| `pivot` / `pivotPx` | el pivote de los pies, normalizado al fotograma **sin recortar** (`[0.5, 0.95]`), o en píxeles (necesita `frameSize`) | dentro del fotograma; uno de los dos, no ambos |
| `frameSize` | tamaño del fotograma sin recortar, en px | opcional; el *checker* lo compara con el atlas |
| `height` | altura **dibujada** del personaje de pie, en metros a la densidad nominal | para validar la escala y las anclas de reserva |
| `facing` | el arte **mira a la derecha**; el motor lo refleja con el `facing` | solo `"right"` |
| `missingClips` | qué mostrar si el arte **no tiene** el clip de un estado: `placeholder` (el clip del *placeholder*) o `chain` (la cadena de *fallbacks* del propio set) | por defecto `placeholder` (§D) |
| `clips` | `estado → { frames, count, fps \| frameDuration, loop?, phases?, tags? }` | los ids del motor **o sus alias**: `aerialAttack → attackAir`, `crouchAttack → attackCrouch`, `landing → land`, `damage → hurt`, `die → death`. Un nombre desconocido es **un error que lista los conocidos** |
| `anchors` | anclas fijas del set (metros desde los pies, +x adelante) | solo ids conocidos |
| `frames` | datos **por fotograma** (`heightPx`, `anchors`) escritos en el propio manifiesto | alternativa a `meta.troid` del JSON del atlas |
| `tags` | etiquetas cortas `[a-z0-9_.:-]` (`sword`, `hero`, `provisional`…) | para herramientas |

| Campo (atlas) | Significado |
|---|---|
| `source` | la imagen (`.png` o `.webp`), **relativa a la carpeta del paquete** |
| `data` | el JSON que exporta el empaquetador (rectángulos, recortes): formato «hash» de TexturePacker. **Obligatorio** mientras el paquete lleve arte: una imagen sola no dice dónde están sus fotogramas |
| `width`, `height` | tamaño **declarado** de la imagen; el *checker* (S37) lo compara con la cabecera real del archivo. > 2048 en un lado: **aviso** (un móvil puede no aceptarlo); > 4096: error |
| `resolution` | densidad de **esta** imagen respecto a la maestra: `1` = la maestra, `0.5` = una variante a la mitad |

## B.3 Resolución y escala: cómo cambia el arte sin cambiar el juego

1. **El mundo está en metros** y no sabe de píxeles. El único número que los une es `artPxPerMeter`.
2. **Un sprite se dibuja a `scale / (artPxPerMeter × resolution)` metros por píxel de arte** (`metresPerPixel`). Cambiar la resolución del arte (una variante a la mitad, un maestro a 3×) cambia `artPxPerMeter` o `resolution` y **nada más**: el pivote, las anclas (metros), los clips, las fases y la altura son los mismos. Lo prueban `artManifest.test.ts` («las dos variantes son el MISMO set medido en metros») y `actorSprite.test.ts` («el mismo arte a dos resoluciones cubre los mismos metros y tiene las mismas anclas»; en el navegador, `?lab=sprites&variant=1`).
3. **Qué variante se carga** (`chooseAtlasVariant`): la **menor** que aún tiene al menos el 85 % de los píxeles que la pantalla va a dibujar (`ppm × resolución × scale`), o la mayor que haya. Con los números de §A.4: un móvil (51 px/m dibujados) toma la variante a la mitad (80 px/m); una tableta (106) y un monitor 4K (160) toman la maestra.
4. **`scale` y `pivot` son las dos palancas** para un sprite visualmente más grande o desplazado: ajustan **solo su representación** (`ActorSprite` escala `visualScale / artPxPerMeter` y las anclas crecen con él). **La física nunca se ajusta sola** a lo que se ve (§A.7).
5. **Anclas:** se escriben en **metros del arte nominal**, relativas a los pies. Las anclas de espada del contrato (`hand_r`, `weapon_grip`, `weapon_tip`) y la de golpe (`hit_origin`, **solo para herramientas y efectos cosméticos**; el *hitbox* es dato en `AttackDefinition`) viajan por fotograma.

## B.4 Qué hace el motor con el contrato

| Función (`presentation/artManifest.ts`) | Para qué |
|---|---|
| `parseArtIndex(json)` · `parseArtPack(json)` | leen y comprueban **sin lanzar nunca**: devuelven `{ value, issues }` con la **ruta del campo** (`sprites[0].clips.idle.count`), **todos los problemas de una vez**, y `value = null` si hay algún error. Las claves desconocidas son **avisos** (un typo no pasa en silencio; una herramienta más nueva puede escribir más) |
| `atlasVariants(sprite, atlases)` · `chooseAtlasVariant(sprite, atlases, pxPorMetroDibujados)` | las **variantes** de un set (cada una con sus páginas) y la que conviene a una pantalla |
| `toSpriteSetDefinition(pack, sprite, variante)` | el **único puente** al `SpriteSetDefinition` que ya entienden `ActorSprite`, el animador y el validador: la densidad pasa a ser la **de esa imagen** (maestra × resolución); el id es `<paquete>/<set>` y `atlas` es la referencia `art:<paquete>/<set>@<resolución>` (`parseArtAtlasRef` la lee de vuelta) |
| `missingClips(sprite, queridos)` | qué estados faltan por dibujar |
| `CLIP_ALIASES`, `isSafeRelativePath` | los nombres que un artista puede usar y la regla de rutas |

**Un manifiesto no puede salirse de su carpeta, ni apuntar a una URL, ni nombrar un estado que el motor no conozca.** Un paquete con `status: "awaiting-art"` **declara lo que tendrá** (clips, cuentas, fases, pivote, escala) **sin imágenes**: es lo que S38 usa para decir exactamente qué falta.

---

# Parte C — Atlas, carga diferida y presupuesto (S35)

> **Qué es:** las **reglas** con las que el arte se empaqueta en atlas y se carga en memoria, y el código que las cumple. Piezas: `presentation/artAtlas.ts` (puro: lee el JSON del empaquetador y comprueba un set contra sus páginas), `tools/assets/*` (el empaquetador y el *build* del arte: Node), `assets/artLibrary.ts` + `assets/artIO.ts` + `app/art.ts` (la biblioteca que lo carga en el navegador: un *chunk* aparte).
> **Lo que NO hace:** no hay arte real en el repositorio, así que **nada de esto se ha ejercitado con arte del usuario**; se ha probado con **arte sintético** (ruido sobre un lienzo transparente, generado en Node, nunca guardado en el repositorio). Ninguna pieza dibuja, rediseña, recolorea ni «mejora» nada: las operaciones del empaquetador son **técnicas y sin pérdida** (§C.3).

## C.1 Reglas de atlas

| Regla | Por qué |
|---|---|
| **Un paquete = una categoría** (`player`, `enemies`, `environment`, `vfx`, `ui`) y **un atlas nunca mezcla categorías** | lo que se necesita a la vez se carga a la vez; el jugador no paga la memoria de lo que no ve |
| **Un set de sprites = sus propias páginas** (`<set>_0.png`, `<set>_1.png`…) | carga **por personaje**: el héroe no arrastra a un enemigo, ni un enemigo a otro. Dos sets comparten una página solo si el artista la empaqueta con su herramienta y la declara en ambos (la biblioteca la carga una vez) |
| **Páginas ≤ 2048 × 2048** (el empaquetador no hace una mayor; el manifiesto avisa por encima de 2048 y rechaza más de 4096) | es lo que toda GPU de móvil acepta. **Nada de atlas gigante**: si no cabe, abre otra página |
| **Cada página, tan pequeña como pueda**: el menor cuadrado que lo contiene todo, recortado a lo que usa y redondeado a múltiplos de 4 | un héroe de 12 fotogramas no cuesta una página de 2048 |
| **Recorte transparente exacto (*trim*)**: solo filas y columnas con **alfa 0** en todos sus píxeles; se anota dónde estaban los píxeles (`spriteSourceSize`, `sourceSize`) | el pivote es una fracción del fotograma **original**: recortar no lo mueve. **Un solo píxel visible** (alfa 1) conserva su fila y su columna. No es un «auto-recorte» creativo |
| **Relleno de 2 px y extrusión de 1 px** (el borde del propio fotograma repetido hacia fuera, **fuera** de su rectángulo) | un sprite en posición fraccionaria no enseña a su vecino. El fotograma en sí no cambia ni un bit |
| **Fotogramas idénticos, una sola vez** (mismos píxeles recortados, mismo desplazamiento, mismo tamaño original) | una pose mantenida (`idle_00` = `idle_02`) no ocupa dos veces. Los píxeles *desplazados* **no** son idénticos: moverían el pivote |
| **Sin rotación, sin remuestreo, sin filtros, sin cambios de color ni de alfa** | el arte del usuario es la fuente de verdad (§A.12). `unpackFrame` reconstruye cada fotograma original **bit a bit** desde las páginas (lo prueba `pack.test.ts` para cada fotograma que empaqueta, y `buildArt.test.ts` a través de la biblioteca del juego) |
| **Un tamaño original por set**: todos los fotogramas de un set se dibujan en el **mismo lienzo** | el pivote (`[0.5, 0.95]`) es una fracción de ese lienzo; con lienzos distintos los pies saltarían |
| **Nombres:** `<prefijo>NN` (`idle_00`), prefijos **únicos dentro del paquete** | el atlas nombra cada fotograma una sola vez |
| **PNG RGBA 8 bits** (alfa recto; Pixi lo premultiplica al subirlo, como el resto del juego) | un PNG de 16 bits se redondea a 8 (la GPU tiene 8) y **se avisa**; un perfil de color incrustado (`iCCP`) **no se arrastra** y se avisa: exporta en sRGB para que nada cambie |
| **Variantes de resolución las pone el artista** (`resolution: 0.5` = la mitad) | el motor **no remuestrea** nada por su cuenta: elegir la variante es cosa del motor (§B.3), fabricarla es del artista |

### Memoria: la cuenta

`memoria de una página = ancho × alto × 4 bytes` (RGBA8). La imagen vive **dos veces**: en la GPU y, mientras el navegador la guarda, decodificada en el lado de la CPU; el presupuesto de abajo cuenta **una** (la biblioteca informa de esa: `bytes`); súmale otra tanto de margen.

| Presupuesto **propuesto** (decodificado) | Objetivo |
|---|---|
| paquete que arranca con el juego (`boot`: el protagonista) | ≤ 24 MiB |
| un paquete de zona (`zone`) | ≤ 32 MiB |
| todo el arte residente a la vez | ≤ 96 MiB |

Son **objetivos de diseño**, no mediciones: S43 los contrasta con la escena de estrés **en Chromium de escritorio**; **no hay mediciones en iOS ni Android**.

## C.2 De la carpeta del artista a lo que descarga el juego

```
art/                                  ← lo que entrega el artista (en el repositorio; NUNCA se sirve tal cual)
  index.json                          el índice AUTORADO (§B.1): paquetes, categoría, cuándo se cargan, zonas
  <paquete>/<id>.pack.json            el manifiesto (§B.2) SIN `atlases`: los escribe el empaquetador
  <paquete>/<set>/<fotograma>.png     un PNG por fotograma, con el nombre que dicen los clips (idle_00.png…)
        │   npm run assets:pack        (tools/assets/cli.ts → build.ts → pack.ts → maxrects.ts + png.ts)
        ▼
public/art/                           ← lo que descarga el juego (GENERADO: lleva un README.txt que lo dice; no se edita)
  index.json, README.txt
  <paquete>/<id>.pack.json            el manifiesto con `atlases` y los `atlases` de cada set rellenos
  <paquete>/<set>_<n>.png + .json     las páginas y su JSON «hash» de TexturePacker
```

- **Un paquete que ya trae sus atlas** (`atlases` no vacío: el artista los empaquetó con TexturePacker, Aseprite o Free-Tex-Packer) **se copia tal cual, byte a byte**, tras las mismas comprobaciones.
- **Un paquete `awaiting-art`** (el contrato de arte que **aún no se ha entregado**) se **comprueba y se informa, pero no se publica**: sin arte, el juego no pide nada.
- **Todo o nada:** el *build* calcula todo en memoria y escribe solo si **no hay ningún error**. Un *build* fallido deja `public/art/` como estaba. **Nunca escribe** en una carpeta de salida que no generó él (sin su `README.txt`): se niega, con el motivo.
- **Determinista:** mismos PNG de entrada, **mismos bytes** de salida (orden de fotogramas, algoritmo de empaquetado, filtros y compresión fijos): reconstruir no ensucia el control de versiones.
- **Sin arte → sin cero:** si no existe `art/index.json` (hoy, el caso), no hace nada y no toca `public/`.

## C.3 El empaquetador (`npm run assets:pack` · `npm run assets:check`)

| Operación | Detalle |
|---|---|
| **Leer PNG** | `tools/assets/png.ts`: gris, gris + alfa, RGB, RGBA y paleta, de 1 a 16 bits, con `tRNS`; **comprueba los CRC** (un archivo dañado se rechaza con el nombre del archivo); rechaza entrelazado (Adam7) con un mensaje que dice qué hacer |
| **Recortar** | solo alfa 0 (§C.1); un fotograma **sin ningún píxel visible** (un parpadeo) se queda como **un píxel transparente** en su sitio |
| **Deduplicar** | por hash de píxeles recortados + desplazamiento + tamaño original |
| **Empaquetar** | MaxRects *best short side fit*, de mayor a menor; el menor cuadrado que lo contiene todo, o páginas de `maxSide` llenas y otra detrás |
| **Escribir** | PNG RGBA8 con el filtro de fila que menos pesa (regla de suma de diferencias de libpng) y zlib al nivel 9; el JSON «hash» con `trimmed`, `spriteSourceSize` y `sourceSize` |
| **Comprobar** | el manifiesto resultante con `parseArtPack`; el JSON de cada página con `parseAtlasData`; cada set contra sus páginas con `checkSpriteFrames` (§C.4) |
| **Informar** | por paquete y set: fotogramas, almacenados, repetidos, páginas, memoria decodificada; y todos los avisos y errores con la **ruta** del archivo |

Opciones: `--check` (no escribe; sale con 1 si hay un error), `--no-trim`, `--max-side <n>`, `--src`, `--out`. **No hay opción para remuestrear, recolorear ni filtrar**: no existen.

## C.4 Lo que se comprueba de un set contra sus páginas (`checkSpriteFrames`)

| Comprobación | Nivel |
|---|---|
| el JSON del atlas es válido: rectángulos enteros dentro de la imagen, recorte coherente con el tamaño original, nombres válidos, **sin rotación** | error |
| el tamaño que dice el JSON (`meta.size`) y el que declara el manifiesto, iguales; los fotogramas caben en la imagen declarada | error |
| **cada fotograma de cada clip está en alguna página** (y se nombra la falta: clip, nombres y cuántos) | error **del clip** |
| un fotograma no está en **dos** páginas | error |
| **todos los fotogramas comparten un tamaño original** (y es el `frameSize` declarado, si lo hay) | error |
| datos (`heightPx`, anclas) de fotogramas que no existen · una página que ningún set usa · el JSON se escribió para otra imagen | aviso |
| fotogramas del atlas que ningún clip usa | nota |

## C.5 La biblioteca de arte (`assets/artLibrary.ts`)

Genérica sobre el tipo de textura y con **dos interfaces** hacia fuera (`ArtIO`: `json(url)`, `image(url)`; `ArtTextures`: crear y destruir), de modo que **toda su lógica se prueba en Node** con un mundo de archivos falso (`tests/helpers/artWorld.ts`) y el navegador pone `fetch` + `createImageBitmap` + texturas de Pixi (`artIO.ts`). Deliberadamente **no usa `Assets` de Pixi** (§C.7).

| Método | Qué hace |
|---|---|
| `init()` · `start()` | lee el índice una vez; `start()` además carga los paquetes `boot` (después del primer fotograma) |
| `pack(id)` | el manifiesto de un paquete, leído y comprobado una vez (`null` si no está, no se puede traer o no es válido: se vuelve a intentar la próxima vez) |
| `acquire(paquete, set)` | un set **cargado y contado**, o `null` (el motivo, en el registro). **Nunca lanza.** `set.def` es la definición **podada** (ver abajo): dibuja con ella, no con la pedida |
| `acquireLoaded(paquete, set)` · `release(def)` | la versión síncrona (para código que no puede esperar) y la devolución; el último `release` libera las texturas y devuelve las páginas |
| `enterZone(zona)` | la **política de zonas** (abajo) |
| `stats()` · `snapshot()` | páginas residentes, **memoria**, pico, peticiones, fallos, tiempo de carga, zona; y el detalle por paquete (los *hooks* de las pruebas lo exponen como `state().art`) |

- **Una imagen, una subida:** las páginas se cachean por URL y se cuentan por los sets que las usan; dos sets de un mismo atlas comparten su memoria y la página se libera con el último.
- **Variante por pantalla:** se elige **una vez por set** con `chooseAtlasVariant(…, ppm × resolución)`; la que no se necesita **no se descarga**. Un cambio de tamaño de pantalla a media sesión no cambia la variante cargada (se decide al cargar; si hiciera falta, se libera y se vuelve a pedir).
- **Política de zonas:** los paquetes `boot` están siempre; al **empezar una transición** (`transition:started`) y al **cargar una sala** (`room:loaded`) el juego llama `enterZone(sala)`: se **traen primero** los paquetes `zone` de la sala nueva y **solo entonces** se sueltan los de la anterior (un paquete que comparten las dos salas **no se vuelve a pedir**); una llamada adelantada por otra más nueva le deja la limpieza. Un paquete `lazy` solo carga cuando algo lo pide **por nombre**. Quien tiene un set contado (una vista) **lo conserva** aunque la zona suelte su paquete.
- **Nada que haga el arte puede fallar el juego:** un 404, un JSON corrupto, una imagen que no es una imagen, una petición cortada, un fotograma que falta, una imagen de otro tamaño que el declarado → `null` para ese set, una nota en el registro y **ni una imagen ni una textura residente**. Quien lo pidió **se queda con su placeholder**. En una *build* de desarrollo (o con `?hooks=1`) la nota es un **aviso** de consola (`[art] …`); en la de un jugador, un `debug` silencioso: **nunca un `error`**.
- **Un clip que rompe el contrato se deja fuera, no el set:** un fotograma que falta en la página, fases incoherentes, **una espada que no está en la mano** (`weapon_grip` a más de 4 cm de `hand_r`) o sin anclas de espada en un clip de ataque → **ese clip** no se usa (su estado cae por la cadena de *fallbacks* o al *placeholder*), se anota **por qué** (`dropped()`, `snapshot().packList[].dropped`) y el resto del set sigue siendo arte real. Solo se rechaza el set entero si `idle` está roto (es el último recurso de todo estado) o si falla algo del set entero (tamaños originales distintos, un JSON de página inválido).
- **`heightPx` va en píxeles de la maestra** (donde se escriba); la biblioteca lo escala por la resolución de la variante para que el validador compare con la densidad de la imagen **que de verdad se dibuja**. Las anclas, en metros, no dependen de la resolución.

## C.6 Carga diferida: lo que cuesta, medido

El arte **nunca está en el arranque**:

1. `vite.config.ts` busca `public/art/index.json` al arrancar y fija `__TROID_ART_INDEX__` (`'art/index.json'` o `''`). **Sin arte: la cadena vacía, y `Game2D` nunca importa el *chunk* ni pide un archivo** (no hay petición, no hay aviso, no hay 404).
2. `?art=<carpeta>` (una carpeta junto a la página: letras, dígitos, `.`, `_`, `-` y `/`; **jamás** `..`, un esquema ni otro sitio) lee `<carpeta>/index.json` en su lugar: lo que usan las pruebas y las demos.
3. Si hay índice, el *chunk* `art-*.js` se pide **después del primer fotograma**, junto a los efectos: **de inmediato** con `?hooks=1` y **detrás del telón de arranque** (fase J, §M.16: la página espera al arte de la primera sala), y a los 2 s en reposo en una página que no espera (un juego sin telón).
4. Las imágenes son **PNG**, nunca módulos de JS; los JSON son datos.

| Medición (`npm run build && npm run bench:bundle`, Chromium sin GPU) | Antes de S35 | Después de S35 |
|---|---|---|
| **arranque en frío de R1** (JS, gzip; presupuesto 200 KB) | 198.4 KB (27 scripts) | **188.2 KB** (30 scripts) |
| toda la primera sesión | 212.9 KB | 202.7 KB |
| *chunk* del arte (**solo con arte**), gzip / bruto | — | 10.3 KB / 29.7 KB |
| archivos que no son JS en el arranque | — | 2 archivos, 1.6 KB (la página y un icono) |

La bajada de ~10 KB sale de **quitar el cargador `Assets` de Pixi del arranque** (el viejo `spriteLoader` lo importaba para la rama de archivo, que el juego nunca ejercitó): el arranque solo necesita el atlas procedural del *placeholder*. El pequeño aumento posterior (+1.3 KB) es el reparto en *chunks* compartidos (el *chunk* del arte comparte módulos con el juego) y el *stub* que lo importa.

**Probado en el navegador** (`tools/e2e/scenarios/assets.ts`, en desarrollo y en producción, con arte sintético servido por `context.route`): una página sin arte **no pide** ni un archivo de arte ni su código; con arte se cargan **solo** el paquete de `boot` y el de la sala actual (los de otras salas y el *lazy*, **cero** peticiones); la memoria que informa la biblioteca es **exactamente** la de las páginas servidas; al pasar de R1 a R2 el paquete nuevo llega **durante el fundido**, el viejo se suelta y el de `boot` **no se vuelve a pedir**; un paquete `lazy` carga al pedirlo y libera al soltarlo; y con una imagen corrupta y una petición cortada el juego sigue, sin errores de consola, con el *placeholder*.

## C.7 Decisiones

| Decisión | Motivo |
|---|---|
| **No usar `Assets` de Pixi** | pesa ~11 KB gzip en el arranque y el juego no necesita sus resolutores, cachés ni *parsers*: una URL, una imagen, una subida. `createImageBitmap` decodifica fuera del hilo principal; premultiplicación en la subida, como todo lo demás |
| **Un set, sus páginas** (no un atlas por paquete) | carga por personaje y por zona; compartir lo decide el artista |
| **El empaquetador no remuestrea** | resamplear es tocar el arte. Las variantes de resolución las exporta el artista; el motor las elige |
| **`awaiting-art` no se publica** | un juego sin arte no pide nada; el contrato de lo que falta vive en `art/` y en este documento (S38) |
| **La biblioteca sabe de contrato, no de gameplay** | nada de lo que hace toca la simulación: el E2E comprueba que los *ticks* siguen igual con arte, sin él y con arte roto |

## C.8 Los hallazgos de la auditoría (§A.13) que S35 cierra

| Hallazgo | Estado tras S35 |
|---|---|
| **H2** · solo una resolución por set, sin regla de elección | **Cerrado:** variantes en el manifiesto (S34) y `chooseAtlasVariant` en la biblioteca (la variante que no se necesita **no se descarga**: lo prueba `artLibrary.test.ts`) |
| **H3** · el cargador de archivos nunca se ejercitó; la caché de `Assets` podía devolver una textura destruida | **Cerrado:** ya no se usa `Assets`; el camino de archivo se ejercita en los tests unitarios (`artLibrary`, `buildArt`) y en el E2E `assets`; «cargar, soltar y volver a cargar» da texturas **nuevas** y una subida **nueva** (test explícito) |
| **H4** · sin atlas por categoría ni por zona; `spriteLoader` y `Assets` en el *chunk* principal | **Cerrado:** un paquete por categoría, páginas por set, política `boot`/`zone`/`lazy`, y el arranque en frío **baja** de 198.4 a 188.2 KB gzip. *(Queda como estaba, a propósito: el set del jugador **procedural** se espera antes del primer fotograma — no hace red; el arte real llega **después** del primero.)* |
| El *benchmark* de *bundle* solo cuenta JS | **Cerrado:** `bench:bundle` informa también de lo que **no** es JS (imágenes, JSON, página) |

## C.9 Límites honestos

- **No hay arte real**: todo se ha probado con arte **sintético**. Con arte real quedan por medir los tamaños, los tiempos de carga y la memoria (S43 lo hace en Chromium de escritorio; **iOS y Android no se han medido**).
- Un PNG con perfil de color (`iCCP`) se usa con sus números tal cual; el navegador **no** aplicará la conversión del perfil, porque el empaquetador no lo arrastra: exporta en sRGB.
- Sin *mipmaps* (Pixi no los genera por defecto): un sprite dibujado a mucho menos de la mitad de su tamaño puede brillar; la variante a la mitad (la pone el artista) es la solución.
- La imagen decodificada ocupa memoria de CPU **además** de la de GPU mientras el navegador la guarda (Pixi no cierra el `ImageBitmap` por sí solo; `artIO.ts` lo cierra al soltar la página).

---

# Parte D — El visual del protagonista y el *fallback* (S36)

> **Qué es:** cómo se dibuja al héroe, detrás de **una interfaz**, para que su aspecto —el *placeholder* o el arte real— cambie **sin que gameplay, cámara, HUD, guardado ni input lo sepan**, y se pueda **volver atrás en cualquier momento**. Código: `presentation/visualSource.ts` (**puro**: qué aspecto dibuja un estado), `render/PlayerVisual.ts` (la interfaz y el conmutador), `content/visuals.ts` (dónde está el arte del héroe y qué clips debe traer).
> **Lo que NO hace:** no hay arte real del protagonista en el repositorio: el conmutador se ha probado con **arte sintético** (§C). Con el repositorio tal cual, el juego dibuja **exactamente lo de siempre** (el *placeholder*) y no pide ni un archivo.

## D.1 La interfaz y los dos aspectos

```
Game2D ──────────────►  PlayerVisualSwitch   (implementa PlayerVisual: root · spriteSetId · frame · facing · visible · sync · anchor · anchorWorld · dispose)
 (no sabe qué aspecto)      │
                            ├── PlaceholderVisual  =  ActorSprite sobre el set procedural      (SIEMPRE está: es el camino de vuelta)
                            └── SpritePlayerVisual =  ActorSprite sobre el set REAL            (solo cuando la biblioteca de arte lo ha cargado)
```

- **`ActorSprite` ya es un `PlayerVisual`** (su superficie es exactamente esa): cada aspecto es un `ActorSprite`; el conmutador los **sincroniza los dos con el mismo estado de vista en cada fotograma** (cada uno lleva su propio tiempo de animación; pasar de uno a otro es un **corte sobre la misma pose**, nunca un reinicio) y **hace visible solo uno**: sin llamada de dibujo de más.
- El conmutador **no escribe nunca** el estado de vista ni toca posición alguna: lo que lee gameplay (cuerpo de colisión, *hurtbox*, *hitboxes*, velocidades, daño, cámara) es **dato de `player/` y `combat/`**, no del dibujo (§A.7). Lo prueba `playerVisual.test.ts` («nunca escribe el estado de vista») y el E2E `player-art` (§D.5).
- **Configurable:** `?visual=auto|placeholder|art` (por defecto `auto`), `PLAYER_VISUAL` en `content/visuals.ts` (paquete y set del arte del héroe, y los **15 clips requeridos**), y el gancho `__troid.setVisualMode(modo)` para las pruebas.
- **Reversible en cualquier momento:** `placeholder` vuelve **al instante** al *placeholder* (el arte sigue cargado: volver a `auto` es igual de inmediato); `detachArt()` quita el arte y lo devuelve a la biblioteca.

## D.2 Qué aspecto dibuja cada estado (`chooseSource`)

| Modo | Regla |
|---|---|
| **`auto`** (por defecto) | el **arte** en todo estado que **puede representar** (§D.3); el ***placeholder*** en el resto |
| **`placeholder`** | siempre el *placeholder*: el camino de vuelta |
| **`art`** | siempre el arte, y lo que le falte lo resuelve **su propia cadena de *fallbacks*** (acaba en su `idle`): para **juzgar el arte por sí solo** |
| set con `"missingClips": "chain"` en el manifiesto | en `auto` se comporta como `art`: el arte **nunca** cede al *placeholder* (el artista prefiere ver su `idle` antes que la cápsula) |
| sin arte cargado (no hay índice, el paquete no existe, la imagen está rota…) | **solo el *placeholder***, en cualquier modo |

## D.3 Qué estados «puede representar» el arte

**El clip propio del estado, o un sustituto que sea lo mismo para el ojo** — y nada más. La cadena de *fallbacks* del animador (`ANIM_FALLBACKS`) es más ancha y acaba en `idle` para todo: eso es correcto **dentro** de un set (hay que dibujar algo) y **erróneo para elegir entre dos aspectos** (un tajo no es un hechizo; un `idle` no es un *dash*). Por eso `visualSource.ts` tiene su propia tabla:

| Estado | Lo representa el arte si tiene… |
|---|---|
| `walk` · `run` · `move` | cualquiera de los tres |
| `jump` · `fall` | cualquiera de los dos |
| `attack` · `attack1` | cualquiera de los dos (`attack` es el nombre del contenido; `attack1`, el del artista: el mismo tajo) |
| `attack2` | `attack2`, o `attack1`/`attack` (el combo puede repetir el tajo) |
| `land` · `alert` | su clip, **o el `idle`** (son poses mantenidas de unos ticks: pasar al *placeholder* para 4 fotogramas sería un parpadeo, no un *fallback*) |
| `crouchWalk` | su clip, **o el `crouch`** (S40): la reptación —y el deslizamiento de un *dash* agachado bajo el pasaje de R1— es **el agachado en movimiento**: la misma postura y la misma altura del cuerpo y de la *hurtbox*. Con el `walk` en pie sería otra postura, y con la cápsula, otro personaje; es además la primera opción de la cadena del animador |
| **todo lo demás** (`crouch`, `dash`, `attackAir`, `attackCrouch`, `hurt`, `death`, `cast`, `special`, `drink`, `interact`…) | **solo su propio clip**: dice algo que ningún otro clip dice |

Consecuencia visible para el usuario: con un set que solo trae `idle`, `walk` y `attack1`, el juego dibuja **al héroe real** de pie, caminando, corriendo y dando el primer tajo (y el segundo, repitiéndolo), y **la cápsula** al saltar, al hacer *dash*, al agacharse, al ser herido, al morir, al lanzar o al beber. El arte entra **clip a clip** sin que nada más cambie.

## D.4 El *fallback* (regla de la tarea)

| Situación | Qué ve el jugador | Qué se dice |
|---|---|---|
| no hay `public/art` ni `?art=` | el *placeholder* | **nada** (ni petición, ni aviso) |
| hay arte, pero **no** el paquete `player` | el *placeholder* | en desarrollo, una vez: `pack "player" is not in the art index` |
| el paquete existe pero el set no carga (imagen o JSON rotos, 404, fotograma que falta en `idle`…) | el *placeholder* | en desarrollo, una vez: el motivo (`[art] sprite set "player/hero" could not be loaded: …`) |
| el set carga pero **le faltan clips** | arte donde puede, *placeholder* donde no (§D.3) | en desarrollo, **una** línea de `info`: qué clips faltan para completar los 15 (`the protagonist's art has no clip for …`); **no** una nota por cada estado |
| un clip rompe el contrato (fotograma ausente, espada fuera de la mano…) | ese clip cae al *placeholder* (§C.5) | en desarrollo, qué clip y por qué |
| *build* de **jugador** (no desarrollo, sin `?hooks=1`) | lo mismo que arriba | **nunca un aviso ni un error**: el registro queda en el nivel silencioso (`debug`); y los sets parciales **no** emiten la nota del animador «no clip for X» (`quietFallbacks`) |

## D.5 Probado

| Qué | Dónde |
|---|---|
| la política `chooseSource` / `providesState` / `lackedClips`: sustitutos (la reptación incluida), sin préstamos, modos, `chain`, los 15 clips | `visualSource.test.ts` (15) |
| el conmutador: un aspecto visible a la vez, el corte no mueve al héroe (posición, giro, escala), el camino de vuelta y de ida, el modo `art`, la pose invisible, el estado de vista **intacto**, quitar/cambiar/liberar el arte **una sola vez**, anclas del aspecto visible, silencio con sets parciales, `bounds` del aspecto visible | `playerVisual.test.ts` (13) |
| **navegador** (arte sintético): sin arte → *placeholder* y 15 clips por dibujar; con arte, **en cada tick** de una jugada el aspecto es el que dice la política; el tajo sigue las **fases de la simulación** (`startup`/`active`/`recovery` → fotogramas 0-1/2/3) con **la espada en la mano** (`|grip − hand| < 5 cm`, punta 0.9 m delante) y **conecta** (el *hitbox* es de la simulación); muerte y hechizo → *placeholder*; camino de vuelta e ida; arte roto o sin paquete → *placeholder* sin errores | E2E `player-art` (A–C) |
| **los estados del héroe tal como los muestra la simulación** (S40): una jugada con guion en la simulación sin cabeza —todos los movimientos, y la sala de interacción— recoge **los 18 estados** que el héroe publica; un set con **exactamente los 15 clips de la entrega** los dibuja **todos** con arte y con el clip que debe; **cada uno de los 15 lo pide algún estado** (la lista de lo que el arte debe ni sobra ni falta); sin uno cualquiera, el *placeholder* dibuja justo los estados que lo necesitan | `heroStates.test.ts` (5) |
| **la simulación no sabe nada:** el mismo guion de teclas (andar, saltar, tajo, *dash*) con **sin arte**, **arte `auto`**, **camino de vuelta** y **solo arte** da la **misma traza**, tick a tick (posición, velocidad, vida, magia, combate, *hit-stop*, golpes al muñeco) | E2E `player-art` (D) |

---

# Parte E — Validación de sprites en el *build* (S37)

> **Qué es:** todo lo que se puede saber de una carpeta de arte **sin abrir un navegador**, para que un *build* **falle ante un asset roto, con la ruta del archivo y qué hacer**, mucho antes de que alguien vea un dibujo equivocado. Código: `tools/assets/verify.ts` (lee la carpeta como la lee el juego: índice → manifiesto → atlas), `tools/assets/inspect.ts` (qué dice un dibujo de sí mismo), `presentation/artContract.ts` (**la misma función pura** que aplica el juego al cargar un set: lo que el *build* dice que se descartará es lo que el juego descartará).
> **Qué NO hace:** solo **mira**. Nunca escribe un archivo ni cambia un píxel, y nunca «corrige»: dice **qué** está mal y **dónde**.

## E.1 Dónde corre

| Orden | Qué comprueba | Cuándo |
|---|---|---|
| `npm run assets:check` | `art/` (la fuente): las mismas comprobaciones **más** las de los fotogramas sueltos (§E.3), sobre **lo que se va a publicar**, antes de escribir un byte. Si no hay `art/` pero `public/art/` trae arte (puesto a mano), **comprueba esa carpeta** | **dentro de `npm run build`** (`tsc --noEmit && npm run assets:check && vite build`): un asset roto **no compila** |
| `npm run assets:verify` | solo `public/art/` en disco (lo que el juego descargará, venga de donde venga) | a mano / CI |
| `npm run assets:pack` | las mismas comprobaciones y, **solo si no hay ningún error**, escribe `public/art/` | al entregar arte |
| `artRepo.test.ts` (parte de `npm test`) | `art/` del repositorio construye sin errores | cada `npm test`: un asset roto **no se puede commitear sin que se note** |
| la biblioteca de arte | `applyContract` + `checkSpriteFrames` al **cargar** cada set | en ejecución: lo que el *build* no pudo ver (un despliegue corrupto) nunca rompe el juego (§C.5) |

## E.2 Qué se comprueba (todo lo que pidió la tarea)

| Comprobación | Nivel | Cómo se dice |
|---|---|---|
| **Dimensiones**: el tamaño de la **cabecera real** del PNG = el `width`/`height` declarado; el JSON del atlas dice lo mismo; los fotogramas caben en la imagen | error | `the image file blob_0.png is 128 × 64 but the manifest declares 132 × 64` |
| **Dimensiones**: todos los fotogramas de un set tienen **un solo tamaño original** (el pivote es una fracción de él) y es el `frameSize` declarado | error | `the frames do not share one original size — 96 × 80 (idle_00, idle_02) vs 98 × 80 (idle_01)` |
| **Dimensiones**: el lienzo **cabe al personaje** (`alto del lienzo / artPxPerMeter ≥ height`) | error | `the canvas is 1.60 m tall at 60 px/m but the character is 1.7 m: it does not fit (is artPxPerMeter right?)` |
| **Dimensiones**: página > 2048 en un lado (> 4096 es error) | aviso | §C.1 |
| **Alfa**: la imagen **no tiene canal alfa** (un RGB) — para lo que se dibuja sobre el mundo (`player`, `enemies`, `vfx`, `ui`) | **error** | `has no alpha channel (it is an RGB picture): … the whole canvas would be drawn as a rectangle. Export it as RGBA` |
| **Alfa**: tiene canal alfa pero **todo es opaco** (¿se quitó el fondo?) | aviso | `every pixel is opaque: was the background removed?` |
| **Alfa**: fotograma **vacío** (todo transparente) | aviso | `is fully transparent: a blink between two poses may be meant, an empty frame by mistake is not` |
| **Alfa**: el arte **toca el borde izquierdo, derecho o superior** del lienzo (se puede cortar; el borde inferior solo si el pivote no está abajo) | aviso | `its pixels touch the left and right edge of the canvas: the art may be cut off there (leave a margin)` |
| El escenario (`environment`) puede llenar su lienzo | nota | solo se dice, no se reporta |
| **Atlas**: el JSON del paquetador es válido (rectángulos enteros, recorte coherente, **sin rotación**, nombres) | error | `rotated frames are not supported (turn "allow rotation" off in the packer)` |
| **Atlas**: PNG dañado (CRC), 16 bits (se redondea), perfil de color incrustado (el navegador convertiría; el empaquetador no) | error / aviso | `the PNG is corrupt (chunk IDAT fails its checksum)` |
| **Fotogramas / clips completos**: **cada** fotograma de **cada** clip está en alguna página, en **una sola** | error del clip | `missing frames walk_01 (the clip has 4)` |
| **Clips completos del protagonista:** el set `player/hero` trae los **15 clips** que pide el juego (`content/visuals.ts`) | `final`: **error** · `provisional`: aviso | `the protagonist's art lacks 12 of the 15 clips the game asks of it: jump, fall, dash, … — the placeholder draws those states` |
| **Anclas**: valores que parecen **píxeles** (> 6 m del pie; > 20 m ya lo rechaza el manifiesto con un mensaje que lo dice) | error | `anchors that look like PIXELS, not metres from the feet (a hero is under 2 m tall): attack1_00.hand_r = [120, 150]` |
| **Anclas**: fuera del dibujo (con 0.25 m de margen) | aviso | `anchors outside the picture (−0.60 … 0.60 m across…): … — are they metres FROM THE FEET, +x forward, +y up?` |
| **Ancla de espada**: en cada fotograma de un golpe (`attack…`, `special`) existen `hand_r`, `weapon_grip` y `weapon_tip` y **`\|grip − hand\| ≤ 4 cm`** | error del clip | `clip "attack1": the sword grip is not on the right hand (> 0.04 m) in 3 frame(s)` |
| **Fases** de un ataque dentro de sus fotogramas (y en orden) | error / aviso | `clip "attack1" phase "recovery" [2, 5] is outside its 3 frames` |
| **Escala**: `heightPx` (en píxeles de la maestra) frente a `height`/`artPxPerMeter` (15 %) | aviso | `the character is 4.00 m tall at 100 px/m, the definition says 1.7 m. Suggested artPxPerMeter: …` |
| **Nombres**: ids, prefijos, nombres de fotograma, estados (con alias) y anclas **conocidos**; rutas relativas y dentro de su carpeta | error | `"jump2" is not an animation state (known: …; aliases: …)` |
| **Referencias rotas**: un set que nombra un atlas que no existe; un manifiesto o una imagen o un JSON que **no están**; un manifiesto que no es el paquete que dice el índice | error | `atlases.blob_0: the image blob_0.png is not there` |
| **Qué haría el juego** (`applyContract`): por cada variante de cada set, qué clips **dejaría fuera** y si lo **rechazaría entero** | `final`: error · `provisional`: aviso · set rechazado: error | `the game would leave this clip out (…): the state would fall back — a "final" pack must not need that` |

*(Las anclas de un set van por fotograma, en el manifiesto o en el JSON del atlas; los clips que el juego deja fuera caen por la cadena de *fallbacks* o al *placeholder*: §D.)*

## E.3 Los fotogramas sueltos (solo al empaquetar)

Antes de empaquetar, cada PNG de `art/<paquete>/<set>/` pasa por `inspectPicture` (alfa, vacío, bordes) y se dice **una vez por set**, no una por fotograma: `4 frames (idle_00.png, idle_01.png, walk_00.png, …) has no alpha channel (it is an RGB picture) …`. Es la comprobación que atrapa **de verdad** lo más probable de un primer envío: imágenes con fondo opaco o sin canal alfa.

## E.4 Probado

| Qué | Dónde |
|---|---|
| cada comprobación de §E.2 (**cada una rompe UNA cosa** de una carpeta buena construida con el empaquetador real, y comprueba qué dice y con qué ruta) | `verifyArt.test.ts` (24) |
| `inspectPicture` / `pictureIssues`: categorías, bordes, páginas | `inspect.test.ts` (7) |
| `applyContract`: clip fuera, set rechazado, advertencias, sin mutar | `artContract.test.ts` (8) |
| el arte del repositorio construye sin errores | `artRepo.test.ts` |
| **E2E `assets` (F)**: el arte bueno pasa el comprobador; una imagen con un byte cambiado, un tamaño declarado distinto, un fotograma que falta y un pivote imposible se **encuentran con su archivo, sin navegador** | `tools/e2e/scenarios/assets.ts` |

---

# Parte F — El protagonista real: el estado de la importación y lo que falta (S38)

> **Estado, sin letra pequeña: el arte final del protagonista NO está físicamente disponible en el repositorio y NO se ha integrado.** No se ha generado, dibujado, recortado de las ilustraciones de referencia ni imitado nada; el juego sigue dibujando al héroe con el *placeholder* abstracto. Lo que sí está hecho es todo lo necesario para que **el arte del usuario entre limpio, eficiente y reversible** (partes B–E), el hueco del protagonista **declarado** y una orden que dice **exactamente** qué falta.
> **La guía para entregarlo:** [docs/guides/deliver-protagonist-art.md](guides/deliver-protagonist-art.md) — los 15 clips, lo que se pide de cada fotograma, las anclas de la espada, los pasos.

## F.1 Qué hay en el repositorio

| Archivo | Qué es |
|---|---|
| `art/index.json` | el índice **autorado**: el paquete `player` (categoría `player`, carga `boot`) |
| `art/player/player.pack.json` | **el hueco del protagonista**: `status: "awaiting-art"`; el *sprite set* `hero` con sus **15 clips** y sus prefijos (`idle_`, `walk_`, … `aerialAttack_`, `crouchAttack_`), `height: 1.7`, mira a la derecha, `missingClips: "placeholder"`; los seis que se validan primero llevan la etiqueta `first` y los cuatro golpes la etiqueta `sword`. **No lleva imágenes ni números inventados**: la escala, el pivote y los fotogramas por clip son lo que solo el arte puede decir y el manifiesto los trata como nominales (con una nota) mientras espera |
| `src/content/visuals.ts` | dónde está el arte del héroe (`player` / `hero`), los **15 clips requeridos** y los **6 a validar primero** (`idle, walk, attack1, dash, jump, hurt`) — **un test comprueba que el manifiesto declara exactamente esos 15** |
| `tools/assets/missing.ts` | **`npm run assets:missing`**: calcula, de la carpeta `art/` y de la lista del juego, qué clips están entregados y cuáles no (con los nombres de fotograma que faltan). Se actualiza **solo** al llegar los fotogramas |

**Nada se publica mientras el paquete espera su arte:** `npm run assets:pack` no escribe `public/art/`, el juego no pide ningún archivo ni descarga el código del arte (§C.6), y el *bundle* en frío no cambia.

## F.2 Qué falta, exactamente (hoy: todo)

```
$ npm run assets:missing
The protagonist's art — pack "player", sprite set "hero" (status: awaiting-art)
Delivered: 0 of 15 clips. The game draws the rest with its placeholder.

  clip          also called              kind  sword  first  state
  idle          —                        loop  —      first  NOT DELIVERED: no frame files yet
  walk          —                        loop  —      first  NOT DELIVERED: no frame files yet
  jump          —                        once  —      first  NOT DELIVERED: no frame files yet
  fall          —                        loop  —             NOT DELIVERED: no frame files yet
  dash          —                        once  —      first  NOT DELIVERED: no frame files yet
  attack1       —                        once  yes    first  NOT DELIVERED: no frame files yet
  attack2       —                        once  yes           NOT DELIVERED: no frame files yet
  attackAir     aerialAttack, airAttack  once  yes           NOT DELIVERED: no frame files yet
  crouch        —                        loop  —             NOT DELIVERED: no frame files yet
  attackCrouch  crouchAttack             once  yes           NOT DELIVERED: no frame files yet
  hurt          damage                   once  —      first  NOT DELIVERED: no frame files yet
  death         die                      once  —             NOT DELIVERED: no frame files yet
  cast          —                        once  —             NOT DELIVERED: no frame files yet
  drink         —                        once  —             NOT DELIVERED: no frame files yet
  interact      —                        once  —             NOT DELIVERED: no frame files yet
```

**Lo que falta, en una lista:** (1) los fotogramas PNG RGBA de los **15 clips** de arriba, todos en el mismo lienzo, mirando a la derecha; (2) `artPxPerMeter` y `pivot` del set; (3) `count`, `fps` y —en los cuatro golpes— `phases` de cada clip; (4) las **anclas de la espada** (`hand_r`, `weapon_grip`, `weapon_tip`) en cada fotograma de `attack1`, `attack2`, `attackAir` y `attackCrouch`; (5) cambiar el estado a `provisional` o `final`. **Nada de eso existe todavía.**

## F.3 La espada: `swordAnchor` por pose

La espada es **parte del dibujo** del héroe; el motor **no pega una pieza aparte**. Lo que el contrato pide por pose es lo que la tarea llama *swordAnchor*: las anclas `hand_r` + `weapon_grip` (a ≤ 4 cm una de otra: **la espada está en la mano derecha**) y `weapon_tip` (la dirección y el largo de la hoja), en cada fotograma de los golpes. Se comprueba **en tres sitios**: el *build* (`applyContract` → «el juego dejaría este clip fuera»), la biblioteca (al cargar, el clip se descarta) y el E2E `player-art` (a cada tick del golpe: `|grip − hand| < 5 cm` y la punta 0.9 m por delante). Los VFX del tajo nacen en estas anclas. **Si la espada llegara como una pieza separada**, las anclas ya llevan posición y dirección por pose: un `SwordOverlay` sería una adición pequeña; **no se ha construido** porque nada de lo entregado lo pide y sería un sistema sin arte que lo use.

## F.4 Extracción de fotogramas «cuando está claramente definida»

Si el arte llega como **una hoja por clip** en vez de un archivo por fotograma, se declara la cuadrícula en el manifiesto (`sheets`: `file`, `prefix`, `frameSize`, `columns`, `count`, `first`) y el empaquetador **recorta**. **No se adivina nada**: la hoja ha de medir **exactamente** `columns × ceil(count/columns)` celdas; si no, el *build* falla y dice las dos medidas. Un recorte es toda la operación (nada se remuestrea ni se mezcla): cada celda sale **bit a bit** como se dibujó (lo prueba `sheet.test.ts` y `buildArt.test.ts`). Los fotogramas de una hoja pasan por las mismas comprobaciones que los sueltos (§E.3), y la cuadrícula **no se publica**.

## F.5 Qué pasará cuando llegue el arte (lo que se ha probado con arte *sintético*)

1. `assets:missing` cambia solo; `assets:check` dice todo lo que esté mal, con la ruta; `assets:pack` lo empaqueta sin pérdida.
2. El héroe usa el arte **estado por estado** (§D): lo entregado, con el arte; lo que falte, con el *placeholder*; **`?visual=placeholder` vuelve atrás al instante**.
3. La simulación **no cambia**: el mismo guion de teclas da la misma traza, tick a tick, con y sin arte (E2E `player-art` D).
4. Los seis primeros que se validan (`idle`, `walk`, `attack1`, `dash`, `jump`, `hurt`) se podrán **ver** uno a uno con sus anclas en el laboratorio `?lab=player` (S39).

**Lo que NO se ha podido probar sin arte real:** cómo se ve, cuánto pesa, cuánta memoria y qué tiempo de carga tiene **el arte del usuario** (S43 mide el sistema con arte **sintético** en Chromium de escritorio; no hay mediciones en iOS ni Android).

---

# Parte G — El laboratorio del protagonista (S39) y R1 con el arte completo (S40)

> **Qué es:** `?lab=player`, una herramienta para **mirar el arte del héroe sin jugar**: un clip cada vez, fotograma a fotograma, con las anclas dibujadas encima, la espada donde el arte dice que está, los límites del propio dibujo y —**aparte del dibujo, a propósito**— el cuerpo de colisión, la *hurtbox* y la *hitbox* que el juego usa de verdad, para **ver** qué toca el arte y qué no. Código: `app/labs/playerLab.ts` (el laboratorio), `presentation/labModel.ts` (el tiempo de un clip: qué fotograma toca) y `presentation/pictureBounds.ts` (dónde cae el dibujo en metros: lo comparten el laboratorio y el juego), ambos **puros**. E2E: `player-lab`.
> **Lo que NO es:** parte del juego. Es un *chunk* aparte que **ninguna página del juego pide** (lo prueba el E2E `assets`), no escribe estado de simulación alguno y no cambia nada de lo que el juego hace.

## G.1 Qué hace (S39)

| Control | Qué hace |
|---|---|
| **look** `placeholder` · `art` · `both` | el *placeholder* solo, el arte solo, o **los dos lado a lado** a la misma escala del mundo (la forma más rápida de ver si la escala y el pivote del arte cuadran con el cuerpo). Sin arte, solo el *placeholder* (los otros botones están desactivados y el panel dice cómo cargarlo) |
| **animation** | cualquiera de los estados (los 15 requeridos primero). Si el arte **no tiene** el clip, el panel lo dice (`no clip "jump" → the game draws the placeholder here`); si lo representa **otro** clip, el panel dice cuál (`attack ← attack1`), igual que el juego |
| `◀` `❚❚/▶` `▶` y espacio / flechas | **fotograma a fotograma** (con la vuelta al principio y al final), pausa y *play* (en un clip que se juega una vez, *play* al final lo **repite** desde el principio); velocidad 0.25×–2×; `mirror` (mirar a la izquierda); *repeat* para ver en bucle un clip que el juego juega una vez |
| **show** | `anchors` (todas las anclas del fotograma; las de reserva proporcionales, tenues) · `sword` (empuñadura → punta, y un círculo que se pone **rojo si la empuñadura se aleja de la mano más de 4 cm**) · `picture bounds` (el **lienzo** entero y la parte que **conservó el recorte**, en metros) · `collision body` · `hurtbox` · `hitbox` (la del ataque del juego: tenue y **brillante en la fase `active`**) · rejilla de 0.5 m · guía de altura |
| **scale** ×0.5–×1.5 «(the picture only)» | multiplica `visualScale` de lo que se ve: **el dibujo crece y el cuerpo, la *hurtbox* y la *hitbox* no** — se ve (y el E2E lo comprueba) que la palanca visual **no toca nada del juego** (§A.7) |
| **frame** | por cada aspecto: set, clip, fotograma `(3/8)`, fps, bucle o una vez, **fase** (`startup`/`active`/`recovery`), píxeles por metro, escala, el **lienzo y la parte recortada en metros**, `hand_r` · `grip` · `tip`, y **a qué distancia está la empuñadura de la mano** (`✓` si ≤ 4 cm) |
| **still to be drawn** | los clips de los 15 que el arte aún no trae |

`?art=<carpeta>` carga el arte de una carpeta (o el que halló el *build*); `?pack=…&set=…` mira **cualquier otro set** de la biblioteca de arte (el de un enemigo, por ejemplo); `?look=`, `?clip=`, `?play=0` abren el laboratorio ya puesto.

## G.2 Probado (S39)

| Qué | Dónde |
|---|---|
| `ClipTimeline` (bucle, una vez, pausa, paso con vuelta, velocidad, *play* sobre un clip terminado, clips de 0/1 fotogramas y sin ritmo) | `labModel.test.ts` (8) |
| las cuentas en metros (el lienzo es una **fracción** del pivote; la escala visual; la misma imagen a media resolución cubre los mismos metros; la parte recortada; el rectángulo **en el mundo**, espejado al mirar a la izquierda) | `pictureBounds.test.ts` (8) |
| `standInFor`: el clip que dibuja un estado en un set (el propio, o el sustituto) | `visualSource.test.ts` |
| **navegador**, con el *placeholder* y con **arte sintético**: el panel y los 15 clips; un golpe fotograma a fotograma con la espada en la mano en cada uno y sus tres fases en orden; pausa que se queda y *play* que sigue; casillas; el cuerpo y la *hurtbox* son los del juego (`0.35 × 1.7`, `0.3 × 1.55`) **antes y después de escalar el dibujo**; límites de la escala; con arte: ambos aspectos, cada uno solo, el lienzo del arte en metros (`64 px / 60 px/m`) y su recorte, un clip que falta dicho, las fases de **su** golpe y `attack ← attack1` | E2E `player-lab` |
| ninguna página del juego pide el laboratorio | E2E `assets` (A) |

**Coste:** el *chunk* del laboratorio pesa 6.5 KB gzip y **solo se descarga con `?lab=player`**. Como comparte módulos con el juego, el *bundler* los reparte en más trozos pequeños y el arranque en frío del jugador sube **0.8 KB** (189.2 → 190.0 KB gzip; presupuesto 200) y tres archivos; es el precio de tener herramientas que miran lo mismo que el juego.

## G.3 R1 con el arte completo (S40)

> **Qué se comprobó:** que **el día que lleguen los 15 clips reales, la primera sala se juega con ellos** —todos los estados que el héroe muestra, la reptación y el deslizamiento bajo el pasaje incluidos, dibujados con arte— y que **las cuatro cajas del héroe son las que eran**. Con arte **sintético** de 15 clips (ruido sobre lienzo transparente: ni personaje ni escena) en la **R1 real** (`r1_gate`, partida nueva) y con teclado real. **No** hay arte real del protagonista en el repositorio y **nada de esto lo finge**.

**Hallazgo y corrección.** El héroe publica **18 estados**, no 15: además de los 15 clips de la entrega aparecen `run` (la carrera), `land` (el aterrizaje) y `crouchWalk` (la reptación **y** el deslizamiento de un *dash* agachado, que es como se cruza el pasaje de R1). Los dos primeros ya se resolvían (`run ← walk`, `land ← idle`); **`crouchWalk` no**: con la entrega completa, el pasaje de R1 se habría cruzado **como cápsula** dentro de un juego dibujado a mano. Corrección (§D.3): `crouchWalk ← crouch`. Lo encontró **contar los estados que la simulación publica de verdad** (`heroStates.test.ts`) en vez de fiarse de la lista de clips de la entrega; y sin la corrección el E2E `player-r1` falla en el pasaje (la jugada de R1 con arte dibuja la cápsula allí).

| Estado que publica el héroe | Clip del arte que lo dibuja |
|---|---|
| `idle` · `land` | `idle` |
| `walk` · `run` | `walk` |
| `jump` · `fall` · `dash` · `hurt` · `death` · `cast` · `drink` · `interact` | el suyo |
| `crouch` · `crouchWalk` | `crouch` |
| `attack` · `attack2` · `attackAir` · `attackCrouch` | `attack1` · `attack2` · `attackAir` · `attackCrouch` |

**Las cuatro cajas, a la vista.** `state().boxes` (ganchos de prueba) las da en metros de mundo, por tick:

| Caja | Qué es | De quién es | Cómo se comprueba |
|---|---|---|---|
| `visual` | los píxeles del fotograma en pantalla (recortados), en el mundo | **del dibujo** (`ActorSprite.bounds()` → `PlayerVisual.bounds()`) | cambia con el aspecto, y **nunca sale del lienzo** del arte ni coincide con las otras |
| `body` | el cuerpo de colisión | de la simulación (`PLAYER.body`, la postura) | `0.7 m` de ancho; alto `1.7` de pie / `1.0` agachado, **con cualquier aspecto** |
| `hurtbox` | lo que puede ser herido | de la simulación (`Player.hurtbox()`) | `0.6 m` de ancho; `1.55` de pie / `0.9` agachado (pierde la cabeza) |
| `hitbox` | el golpe del héroe en el último tick (`null` fuera de un golpe; el *Spirit Bolt* en vuelo no cuenta: es del proyectil) | de la simulación (`AttackDefinition.hitbox`) | **su tamaño es el del ataque** (`1.4 × 1.1` el primero…), no el del lienzo del dibujo (`1.6 × 2.1` m) |

**Qué hace el E2E `player-r1`** (unas 340 muestras por jugada):

| Parte | Qué prueba |
|---|---|
| **A** · R1 con el arte | el arte está en el héroe, **no falta ningún clip**, la sala se construye entera (babosa, puerta), la biblioteca **no dice nada** y el camino de vuelta no cambia ni un objeto de la escena |
| **B** · una jugada, tres aspectos | el mismo guion de teclas —quieto, andar y correr, saltar y aterrizar, *dash*, primer y segundo tajo, tajo en el aire, tajo agachado, hechizo, botella, ser herido, el pasaje de R1 agachado y con *dash*, la muerte y la reaparición— **sin arte**, **con arte** y **con arte y camino de vuelta** da **la misma simulación y las mismas tres cajas, tick a tick** (solo `visual` cambia: en el 80 % de las muestras o más) |
| **C** · cada estado, con arte | en **cada** muestra el aspecto es el arte y el fotograma en pantalla es **del clip que toca** (tabla de arriba); la jugada pasó por los **17 estados** que R1 puede mostrar; los **cuatro** `hitbox` (`slash_1`, `slash_2`, `air_slash`, `crouch_slash`) salieron con **su** tamaño; en cada fotograma de cada golpe la espada está en la mano (`< 5 cm`); la reptación usa el `crouch` con el cuerpo de `1.0 m`; las llamadas de dibujo siguen bajo el presupuesto (≤ 60) |
| **D** · la interacción | en la sala de interacción, coger la carta es el `interact` del arte; el **camino de vuelta a media pose** pone la cápsula al instante con **el mismo cuerpo, la misma *hurtbox* y el mismo sitio** (solo el dibujo cambia) y la vuelta a `auto` es igual de rápida |

**Lo que NO se ha podido comprobar (no hay arte real):** que la **escala** del dibujo, su **pivote** y la **sensación** de cada pose cuadren con el cuerpo de `0.7 × 1.7 m` y con el alcance de los golpes. Eso se mira con el arte del usuario en `?lab=player` (§G.1: la silueta junto al cuerpo, la *hurtbox* y la *hitbox*, con la guía de altura) **antes** de jugar con él; la palanca para afinarlo es `visualScale`, que no toca nada del juego (§A.7).

## G.4 Probado y coste (S40)

| Qué | Dónde |
|---|---|
| `ActorSprite.bounds()`: lienzo entero, recorte, espejo al mirar a la izquierda, sigue al actor sin cambiar de tamaño, escala visual, misma imagen a dos resoluciones, rectángulo reutilizado, fotograma ausente = punto en los pies, no depende de nada de la simulación | `actorSprite.test.ts` (+7) |
| `PlayerVisual.bounds()` es el dibujo del aspecto visible, con **los mismos pies** en los dos | `playerVisual.test.ts` (+1) |
| **la simulación no mira el dibujo**: `presentation/` solo aporta vocabulario a `player/`, `combat/`, `gameplay/`… y nada de `render/`/`assets/`/`vfx/` | `architecture.test.ts` (+3) |
| los 18 estados del héroe, todos con arte con la entrega de 15 clips | `heroStates.test.ts` (5) |
| **navegador**: A–D de arriba, en desarrollo y en producción | E2E `player-r1` |

**Coste:** `bounds()` y el espejo añaden **0.4 KB gzip** al arranque en frío (190.0 → 190.4 KB; presupuesto 200); no hay arte, no hay petición, no hay *chunk* nuevo.

---

# Parte H — Contrato visual de los VFX y señales de audio (S41)

> **Qué es:** lo que **cualquier** sustituto de un efecto debe conservar mientras cambia su **aspecto** (cuándo nace, dónde, cuánto vive, cuánto cuesta, de qué colores es), escrito como **datos** y comprobado por **una función pura**; y, aparte, la lista de **momentos para los que se hará un sonido**, cada uno atado al evento de la simulación que lo levanta. Código: `presentation/vfxContract.ts` y `presentation/audioCues.ts` (**puros**), `audio/AudioDirector.ts` (la vista que escucha el bus y entrega las señales a un *sumidero*).
> **Lo que NO es:** no hay VFX finales (los efectos de hoy —cian y blanco para el héroe, violeta para el enemigo— **se conservan tal cual**) y **no hay sonido**: ni archivos, ni WebAudio, ni música. Se deja la **costura** y se prueba.

## H.1 Los efectos que hay (y se conservan)

Veinticinco disparadores (`VfxTrigger`), de nueve familias (siete que conoce un jugador y cuatro más; la fase H —§M.14— añadió cuatro disparadores y dos familias):

| Familia | Disparadores → efectos | Evento de la simulación | Nace… |
|---|---|---|---|
| **tajo** | `slash` · `slashFinisher` → arco de la espada (3 capas; **el corte pintado** si el arte lo tiene) | `player:attackActive` (el tick en que el *hitbox* existe) | 0.8 m sobre los pies, **ajustado al *hitbox*** |
| **impacto** | `hitLanded` → chispas + destello + anillo + **fogonazo pintado** | `combat:hit` (contra algo que no es el héroe) | en el punto de contacto |
| **daño** | `playerHurt` → esquirlas + destello + fogonazo | `player:hurt` | en el torso |
| ***dash*** | `dashStart` · `dashDust` · `dashTrail` → ráfaga, **dos *chevrons* de velocidad**, polvo y estela **a lo largo de la distancia recorrida** | `player:dashed` / `player:dashEnded` | pecho · pies · 0.85 m |
| **muerte** | `enemyDied` (tinta + motas + destello + **la salpicadura pintada**, violeta/negro) · `playerDied` (la energía se dispersa **y sube una columna de luz detrás del héroe**) | `actor:died` · `player:died` | 0.7 m · 0.9 m |
| **aviso** | `enemyTelegraph` → anillo + **runa que se cierra** + motas **violeta** | `enemy:telegraph` | 0.45 m |
| ***Spirit Bolt*** | **`boltCharge`** (anillo que se cierra, luz que crece, motas que **entran**) · `boltCast` (destello, anillo, rayo hacia delante, brillo de la mano) · `boltImpact` (chispas, destello, anillo, **el impacto pintado**, **resplandor remanente**) · `boltEnd` | **`skill:castStarted`** · `skill:cast` · `combat:hit` de un proyectil · `projectile:ended` | el cañón · el cañón · el contacto · donde se acaba |
| **descanso** · **poder** | **`checkpoint`** (pilar de luz, llama, runa y anillo **detrás del héroe**) · **`abilityGained`** (la runa grande, el pilar, el anillo, el destello y las motas) | `checkpoint:set` · `ability:unlocked` | los pies del héroe |
| botella · objeto · sello · jefe | `drinkStart/Heal` · `pickup` · `sealRejected` · **`sealBroken`** · `bossWake/Strike/Phase/Defeated` | `bottle:*` · `interaction:performed` · `seal:rejected` · **`actor:died` de algo neutral** · `boss:*` | según el contrato |

Todo corre en **tiempo real** (un *hit-stop* congela el mundo, no las chispas), sale de **pools** (después del calentamiento no se crea ni un objeto: `stats.poolCreated` deja de crecer) y respeta el presupuesto por perfil (**150 / 300 / 400 partículas** y **24 / 40 / 64 efectos de *sprite***; el presupuesto de *sprites* es **uno para los tres sitios** donde se dibujan: delante, la tinta y la luz de detrás).

## H.2 El contrato

`VFX_CONTRACT` tiene una entrada por disparador. **Los topes son para los sustitutos, no los valores en uso** (los efectos de hoy están por debajo con margen): retocar dentro de un tope no pide nada; pasarse es una decisión que alguien toma a propósito, con el rendimiento delante.

| Qué se conserva | Cómo se dice | Cómo se comprueba |
|---|---|---|
| **CUÁNDO** nace | `events`: los eventos de la simulación que lo levantan. **El arte nunca decide el cuándo** | `vfxContract.test.ts`: cada disparador, levantado por su evento, arranca **exactamente** sus efectos y ninguno ajeno; el director escucha **los eventos del contrato y ninguno más** (se lee el catálogo de `GameEvents`) |
| **DÓNDE** nace | `originY`: metros sobre el punto del evento. Es el punto **alrededor del cual se dibuja** un efecto | la misma prueba mide la altura de cada efecto (`y + originY`) |
| **CUÁNTO vive** | `maxLife` (s): un tajo que sobrevive a su golpe se lee como retraso | `checkVfxContract` |
| **CUÁNTO cuesta** | `maxParticles` y `maxSprites` **por disparo**, contando la partícula al mayor `scale` que se usa (×1.3, el golpe que mata) | `checkVfxContract` + los **peores momentos** (`WORST_MOMENTS`: un golpe que mata estando herido y haciendo *dash*; la lluvia de cuatro marcas del jefe enfurecido; la caída del jefe) **suman por debajo del presupuesto del perfil bajo**, con los topes y no solo con los valores de hoy |
| **DE QUÉ COLORES** | `palettes`: el héroe, `energy` (cian y blanco); enemigos y avisos, `enemy` (violeta); el polvo, `neutral`; el acento cálido, **solo** el remate del combo y apagado por defecto | `checkVfxContract` |
| **BIEN FORMADO** | números que son números, rangos ordenados, `alpha` en 0–1, vidas > 0 | `checkVfxContract` (un sustituto llega como **datos**: esto detiene una errata antes de la pantalla) |

**La luz que lleva el héroe** (fase H) no es un disparador —ningún evento la levanta— sino **un estado**: una mota que el director suelta de vez en cuando mientras la magia está alta (cada 0.35 s con la magia llena; con la mitad, el nivel al cuadrado la espacia). Tiene un contrato propio, `AMBIENT_CONTRACT`, porque **no se acaba nunca**, así que debe costar casi nada: **una** partícula, del color del héroe, aditiva, la primera que el presupuesto suelta (prioridad ≤ 2), ≤ 2.2 s de vida y **≤ 8 vivas a la vez** (`ambientIssues`, con siete pruebas de mutación). Sin magia, o con el héroe caído, no suelta ninguna.

`checkVfxContract(defs, bindings)` dice, **con el disparador y el efecto**, qué regla se rompe; sobre lo que se publica da una lista vacía, y la prueba lo demuestra con **ocho pruebas de mutación** (vida de más, partículas de más, capas de más, paleta ajena, un disparador sin efecto o con uno que no existe, números rotos, topes que no caben en el presupuesto, un momento que desborda el perfil bajo).

## H.3 Cómo se sustituye un efecto (tres niveles, de menos a más arte) — los tres están construidos (fase H)

1. **Datos (sin código).** Un `VfxDefinition` de `content/vfx.ts`: tamaños, cuentas, vidas, colores, gravedad. `checkVfxContract` dice si sigue valiendo.
2. **La forma (construido, §M.14).** `VfxSystem` dibuja con **diez formas** del `VfxAtlas` —`glow`, `spark`, `shard`, `ring`, `rune`, `dust`, `ink`, `streak`, `arc`, `chevron`—, **máscaras blancas** que la paleta tiñe al dibujar (así el cian y el violeta siguen siendo **la identidad**, pongan lo que pongan en la imagen). El juego las dibuja él mismo (`createVfxAtlas`: lo que siempre hizo) y **el arte puede pintarlas** (`vfx-shapes`): `createArtVfxAtlas` las pone **encima** del atlas propio y solo cuando son **las diez en una sola página** (el `ParticleContainer` de Pixi comparte la fuente de la textura: una llamada de dibujo por modo de mezcla). La orientación se conserva: `arc` se curva hacia +x, `shard` y `chevron` apuntan a +x, `streak` es horizontal. Enganche: `createEffects({ atlas })`.
3. **Animación por fotogramas (construido, §M.14).** `kind: 'flipbook'`: una secuencia pintada (`vfx-flipbooks`, doce) que se reparte en la `life` del dato —**su tiempo es el del dato, no los fps del arte**—, nace en el **origen del contrato**, **cuenta como un *sprite*** del presupuesto, vive en un *pool*, se tiñe con la paleta y se coloca por el **pivote del propio arte**. **Sin la secuencia —el arte no la tiene o su paquete no cargó— el efecto simplemente no se juega** (`stats.unplayed`, que no es el presupuesto soltándolo) y los efectos que lo acompañan en el disparador llevan el momento (el contrato exige que cada disparador esté entero sin ella; el E2E lo juega con `?vfx=procedural`). El corte de la espada es un `ArcVfx` con `sequences`: con **las dos** secuencias es el del arte, con una o ninguna es el creciente de siempre.

**En ningún nivel cambia:** el evento, el origen, la vida, el presupuesto, los colores ni el *pool*. Y **nada del juego se entera**: el director es de la vista y la simulación no sabe que existe (el único añadido de la fase en la simulación es **un evento de aviso**, `skill:castStarted`, que no cambia nada de lo que ocurre).

## H.4 Las señales de audio

El juego **no tiene sonido**. Lo que tiene es la lista de **momentos para los que se hará uno**, atada al evento que lo levanta, con lo que un sonido necesita saber. Un motor de audio futuro se enchufa como un `AudioSink` y **no lee nada más**: no mira dentro de la simulación, no consulta, y la simulación no sabe que existe.

| Señal | Evento | Posición | Intensidad (0–1; 1 si no hay magnitud) | Variante |
|---|---|---|---|---|
| `attack` | `player:attackActive` | sí | 0.7 el primer golpe · 1 el remate | `slash_1` · `slash_2` · `air_slash` · `crouch_slash` |
| `hit` | `combat:hit` | sí (el contacto) | daño / 2 · 1 si mata | el ataque |
| `dash` | `player:dashed` | sí | 1 | `ground` · `air` |
| `hurt` | `player:hurt` | sí | daño / 2 | — |
| `death` | `player:died` | sí | 1 | — |
| `boltCast` · `boltImpact` | `skill:cast` · `combat:hit` de un proyectil | sí | 1 · daño / 2 | `spirit_bolt` |
| `bottleStart` · `bottleDrunk` | `bottle:drinkStarted` · `bottle:drunk` | sí | 1 · vida devuelta / 2 | — |
| `interact` | `interaction:performed` | sí | 1 | el tipo de objeto (`pickup`…) |
| `bossAttack` | `boss:strike` | sí | 1 | `warden_charge` · `warden_rain` |
| `bossDeath` | `boss:defeated` | sí | 1 | `ink_warden` |
| `roomTransition` | `transition:started` | **no** | 1 | la sala a la que lleva |
| `jump` · `land` | `player:jumped` · `player:landed` | sí | 1 · velocidad / 20 | `ground` · `air` |
| `enemyTelegraph` · `enemyDeath` | `enemy:telegraph` · `actor:died` (no del héroe) | sí | 1 | el enemigo (`ink_slime`, `ink_warden`) |

**Los once momentos que pidió la tarea** —golpe, impacto, *dash*, daño, muerte, *Spirit Bolt*, botella, interacción, ataque del jefe, caída del jefe y cambio de sala— son las trece primeras señales (el *Spirit Bolt* y la botella tienen dos cada uno); `jump`, `land`, `enemyTelegraph` y `enemyDeath` se añaden porque salen del mismo catálogo y cualquier diseño de sonido las pide en cuanto empieza. Reglas:

- **El *cuándo* es el del evento:** la señal de un golpe es el tick en que **existe su *hitbox***, no el de la pulsación (el golpe tiene 4 ticks de preparación); la de un `hit`, el tick en que **se hace el daño**; la de la bebida, cuando **cae** (24 ticks después de empezar). Cada señal lleva ese tick (`session.now`).
- **Una señal por cosa:** el golpe que hiere al héroe es `hurt`, **no** además `hit`; el proyectil es `boltImpact`, **no** `hit`; la lluvia del jefe levanta **una `bossAttack` por marca, hasta cuatro en el mismo tick** (el motor limita las voces, el juego no); al caer el jefe se levantan `bossDeath` **y** `enemyDeath` en el mismo tick (lo que suena una muerte, más lo que suena **esta**).
- **Determinista:** la misma partida desde la misma semilla levanta las mismas señales, en el mismo orden y en los mismos ticks (lo prueba el recorrido del mundo entero).
- **El sumidero:** `AudioSink.cue(evento)`. En una compilación de jugador **no se crea nada** (ni oyentes): el juego no tiene sonido. En desarrollo y con `?hooks=1` se crea un `CueLog` (cuenta cada señal y guarda las últimas 64) que `state().cues` muestra: **lo que un motor habría recibido**. Para enchufar el motor: pasar `audioSink` a `createEffects`; el volumen que ha de leer ya existe (`MasterVolume.gain`, S30).
- **Cómo encaja con ARCHITECTURE-2D §10:** el evento se vuelve **señal** (esto) y la señal se vuelve **sonido** con el manifiesto de audio (`sfx.hero.slash`…, variaciones, ganancia, voces): el manifiesto y el motor son lo que falta, y cambiar un sonido será cambiar el manifiesto, sin tocar quien lo dispara.
- **Eventos que existen y no se incluyen** (candidatos cuando el diseño de sonido los pida): `checkpoint:set`, `skill:denied` y `bottle:denied` (el «denegado»), `enemy:alerted`, `hazard:hit`, `gate:changed`, `boss:started` y `boss:phase`, `death:*`, `transition:fadeOut/fadeIn/finished`.

## H.5 Probado (S41)

| Qué | Dónde |
|---|---|
| el contrato cubre los 21 disparadores; los efectos que se publican **lo cumplen** (y con margen); el coste cuenta al ×1.3; **ocho mutaciones** rompen la regla correcta (con su mensaje); cada disparador arranca **sus** efectos, con **su** evento, a **su** altura; el director escucha los eventos del contrato y ninguno más | `vfxContract.test.ts` (39) |
| las señales: las 17, con lugar, intensidad y variante; el golpe al héroe no es `hit`; el proyectil es `boltImpact`; el jefe, el cambio de sala (sin lugar), el tick; el director se desengancha del todo; `CueLog` acotado y que da **copias** | `audioCues.test.ts` (20) |
| **en la simulación real:** el mundo entero (R1 → R4, el jefe incluido) con un director escuchando: todas las señales del recorrido, el jefe **avisa antes de golpear** y **cae una vez**, la lluvia levanta varias en el mismo tick, **determinista**; y lo que el recorrido no hace (dash, salto y aterrizaje, herido y muerte, la botella); el golpe es el tick de su *hitbox* y el `hit`, el del daño | `audioCueContract.test.ts` (11) |
| **navegador**, con teclado real: dash, salto y aterrizaje, **golpe (el tick de su *hitbox*) y daño (el tick del daño)**, herido, muerte, *Spirit Bolt* y su impacto, botella, el aviso y la caída de una babosa, el cambio de sala (sin lugar, con la sala), coger un objeto, el aviso y el golpe **del jefe** y su caída (en el mismo tick que `enemyDeath`) | E2E `audio-cues` |
| los efectos siguen sanos: *pools* estables, presupuesto por perfil | E2E `vfx` · `combat` · `settings` |

**Coste:** el *chunk* de efectos (tardío: se descarga con la página ociosa) pasa de 0.4 a **1.2 KB gzip**; el **arranque en frío no cambia (190.4 KB)**. Ni `vfxContract` ni la tabla `AUDIO_CONTRACT` viajan en ningún *chunk*: solo las pruebas las leen.

---

# Parte I — Contrato de assets de entorno (S42)

> **Qué es:** cómo se organizará, se repetirá, se pedirá y se entregará el escenario que sustituya al *blockout*, escrito como **datos y funciones puras** (`presentation/environment.ts`) y comprobado en el *build* (`tools/assets/verify.ts`, `missing.ts`): las **capas y el paralaje**, las **piezas** que el mundo pide (leídas de los datos de las salas), la **regla con que una imagen rellena un rectángulo**, las **etiquetas** con que un *sprite* dice qué dibuja y la regla de oro: **la colisión es de los datos de la sala, nunca del dibujo**.
> **Lo que NO es:** escenario. No hay arte de entorno, no se ha generado ni imitado ninguno, y **todavía no existe el código que dibuja una sala con imágenes** (§I.8). Guía para quien lo dibuje: [deliver-environment-art.md](guides/deliver-environment-art.md).

## I.1 Lo que se dibuja hoy (el *blockout*, que se conserva)

Todo es procedural, determinista (la misma sala, el mismo aspecto) y de la vista: `RoomView2D` pinta los sólidos como rectángulos planos por `material` con un borde superior iluminado, cada puerta aparte (para disolverla), las espinas y un haz de luz por salida; `backdrops.ts` genera las cuatro capas de fondo (`ruins`); `InteractableViews` y `SealView` pintan lo que se toma o se golpea. **Nada de esto toca la colisión.**

## I.2 Las capas

`ENV_LAYERS` es la escena de atrás adelante, y **una prueba la compara con `createLayers`** (lo que el renderizador construye y lo que se le dice al artista no pueden separarse):

| Capa | Espacio | Factor | Mezcla | Lleva | Arte |
|---|---|---|---|---|---|
| `sky` | pantalla | — | normal | el cielo provisional, pegado a la pantalla | — |
| `backdropFar` · `backdropMid` · `backdropNear` | mundo | **0.15 · 0.4 · 0.75** | normal | la lejanía · troncos · pilares | `backdrop` |
| `propsBack` | mundo | 1 | normal | santuarios, palancas, objetos | `decor`, `interactive` |
| `terrain` | mundo | 1 | normal | suelo, paredes, plataformas, puertas, espinas | `solid`, `platform`, `door`, `hazard` |
| `actors` | mundo | 1 | normal | el héroe, los enemigos, el jefe | — |
| `fxBack` | mundo | 1 | **aditiva** | luz **detrás** de los actores: el pilar de un lugar que despierta, la runa de un poder ganado y, desde la fase I, **las luces del mundo** (el héroe, su charco de suelo, el rayo, el Custodio, los avisos: §M.15) — la silueta oscura del héroe contra ellas | — |
| `fxNormal` · `fxWorld` | mundo | 1 | normal · **aditiva** | tinta, humo, polvo · luz: proyectiles, tajos, el sigilo del sello | — · `seal` |
| `foreground` | mundo | **1.2** | normal | siluetas oscuras delante (más rápido que el mundo) | `foreground`, `decor` |
| `lightOverlay` | mundo | 1 | **aditiva** | haces sobre las salidas, objetos que flotan y, desde la fase I, **el aire** de cada sala (campos de motas, `scatterMotes`) | `light`, `interactive` |
| `debug` · `screen` | mundo · pantalla | 1 · — | normal | `?debug=1` · las barras del *letterbox* y, bajo ellas, **la viñeta de la sala y los pulsos de borde** (fase I: `vfx/ScreenFx`) | — |

**Paralaje:** una capa con factor *f* se coloca en `(1 − f) × pivote` (el pivote es la cámara, ajustado a un píxel del dispositivo, para que no tiemble) y se mueve *f* × la cámara; cubre **`f × (ancho de la sala) + 2 × 24 m`** (`layerSpan`: la vista más ancha, 21:9 a 13.5 m, mide 31.5 m). Orden obligado: 0 < lejos < medio < cerca < 1 < primer plano.

## I.3 Los roles

Diez clases de arte, cada una con **qué dato de la sala dibuja**, **en qué capa**, **cómo rellena** lo que el dato le da y **desde qué punto del *sprite*** (`ENV_CONTRACT`):

| Rol | Dibuja | Relleno | Pivote | Partes (**obligatoria**) |
|---|---|---|---|---|
| `solid` | los `solids` de tipo sólido, por `material` | `tile` desde arriba-izquierda, recortado | `[0, 0]` | **`fill`**, `cap`, `edge-l`, `edge-r` |
| `platform` | los `solids` `oneway` | `tile-x` | `[0, 0]` | **`body`**, `cap-l`, `cap-r` |
| `door` | los `gates` (`gate`, `seal`); se disuelve en 0.6 s | `tile-y` desde abajo | `[0, 1]` | **`body`**, `top`, `bottom` |
| `hazard` | los `hazards`, por tipo | `tile-x` desde su suelo | `[0, 1]` | **`cell`** |
| `backdrop` | `art.backdrop`: tres tiras | `strip` sin costura | `[0, 1]` | **`far`**, **`mid`**, **`near`** |
| `foreground` | `art.backdrop`: siluetas delante | `strip` | `[0, 1]` | `strip` |
| `decor` | objetos que no chocan con nada | puntual | `[0.5, 1]` | — |
| `interactive` | los `interactables`, por tipo | puntual | `[0.5, 1]` | **una** por tipo |
| `seal` | los `seals` | puntual | `[0.5, 0.5]` | **una** |
| `light` | las `exits` | puntual | `[0.5, 1]` | una |

## I.4 La regla de repetición

**El rectángulo de la sala es la verdad y el arte se recorta a él, nunca al revés.** Los bloques del juego no están en una rejilla (un bloque de 1.4 × 1.1 m es normal), así que `planTiles(rect, celda)` da celdas **enteras** desde la **esquina superior izquierda** y la última columna y la última fila **recortadas** a lo que queda —**jamás escaladas**—: 1.4 × 1.1 m con una celda de 1 m son una celda entera y una tira de 0.4 m, y 0.1 m de la fila siguiente. `axisPlan` trata una longitud a una millonésima de un número entero de celdas como ese número (no dibuja una celda recortada a nada). Una prueba lo comprueba **contra cada sólido de cada sala del juego**: las celdas más lo recortado suman exactamente su largo, para cuatro tamaños de celda. Las tiras de paralaje (`stripCover`) se repiten sin costura hasta cubrir `layerSpan`.

## I.5 Lo que pide el mundo

`environmentSlots(salas)` lee los datos de las salas y da **una pieza por (rol, sujeto, parte)**: cada material de cada sólido, cada puerta, cada tipo de peligro y de objeto, los sellos, las salidas y el fondo. **Hoy (R1–R4): 26 piezas, 12 obligatorias** —`solid` `stone` y `earth` (`fill`), `platform` `wood` (`body`), `door` `gate` y `seal` (`body`), `hazard` `spikes` (`cell`), `backdrop` `ruins` (`far`, `mid`, `near`), `interactive` `rest` y `pickup`, `seal`— y sale sola: una sala con un material nuevo pide piezas nuevas. Las salas de pruebas (`moss`) no son del mundo y no cuentan.

`npm run assets:missing` la imprime (`N of 14 required pieces`: los pickups se piden por lo que dan, una pieza por variante) con las salas que usan cada una; `--strict` falla mientras falte algo.

## I.6 Cómo se entrega y qué comprueba el *build*

Un paquete `environment` con **un *sprite* por pieza** que **dice qué dibuja con etiquetas** (`role:solid`, `material:stone`, `part:fill`). `environmentPackIssues`, dentro de `assets:check` / `npm run build`:

| Regla | Nivel |
|---|---|
| un único `role:` conocido; el sujeto que ese rol pide (`material:`/`kind:`/`backdrop:`); una parte válida si el rol las tiene | **error** |
| el pivote del rol (donde empieza la repetición) | **error** |
| un clip `idle` (una imagen quieta es un `idle` de un fotograma) y un prefijo de fotograma único en el paquete (esto último, del manifiesto) | **error** |
| una sola escala por paquete; dos *sprites* para la misma pieza | aviso |
| faltan piezas obligatorias del mundo | **error** si el paquete es `final`, aviso si es `provisional` (lo que falte, el *blockout*) |
| el paquete espera su arte (`awaiting-art`) | no se mira |

## I.7 La colisión no es el dibujo

Una sala **es** sus datos: lo que el héroe pisa, golpea o atraviesa es `solids`, `gates`, `hazards` y `exits`. El `material` de un sólido y el `art` de la sala son **vestido**. Se garantiza en tres sitios:

1. **Arquitectura** (`architecture.test.ts`, S40): ni `world/` ni `player/`, `combat/`, `gameplay/`… pueden importar nada de `presentation/` salvo el vocabulario —`presentation/environment` no está entre ello—, ni de `render/`.
2. **Prueba de la simulación** (`artIndependence.test.ts`): la **misma jugada** (correr, saltar, golpear, *dash*, agacharse) en R1 y R2 con su fondo, **sin fondo**, con **un fondo que no existe**, y con **todos los sólidos de otro material** (incluido uno que nadie ha dibujado) da **los mismos ticks y los mismos colisionadores**.
3. **Navegador** (E2E `environment`): lo dibujado es lo que los datos piden.

## I.8 Lo que no está construido (y por qué)

- **El dibujo de una sala con imágenes** (un `EnvironmentView` que use `planTiles` y `stripCover`, con el *blockout* como respaldo pieza a pieza y el camino de vuelta, como `PlayerVisualSwitch`): sin una imagen real no hay tamaño de celda, ni alto de tira, ni se sabe si una pieza lleva cara de fondo; escribirlo ahora sería diseñar contra nada. El contrato fija **qué ha de poder hacer** y las funciones que lo harán ya están probadas.
- **`decor` en `RoomDefinition`:** ninguna sala lista objetos decorativos; añadir el campo sin arte que lo use sería un dato sin dueño. El rol existe y, el día que una sala los liste, nombrará un *sprite* de este rol.
- **Comprobar costuras** (que el borde derecho de una tira case con el izquierdo): necesita imágenes reales para calibrar el umbral; se añadirá a `verify` con ellas.
- **Alfa por pieza:** un `cap` o una puerta necesitan esquinas transparentes y un `fill` puede ser opaco; hoy `inspect` solo exige alfa a personajes, enemigos, VFX e interfaz, y pide una nota (no un error) en el escenario opaco. Se afinará por rol con el arte delante.

## I.9 Probado (S42)

| Qué | Dónde |
|---|---|
| la escena del contrato **es** la que construye `createLayers`; los factores son monótonos; capas ↔ roles se corresponden en ambos sentidos; `layerSpan`/`stripCover`; `axisPlan`/`planTiles` (incluido **contra cada sólido de cada sala**); lo que el mundo pide (las 12 obligatorias, los opcionales, qué salas, es **dato**: material nuevo → pieza nueva); las etiquetas; **cada regla del paquete con su caso que la rompe** | `environment.test.ts` (30) |
| el *build*: un paquete `final` completo verifica limpio; un *sprite* sin decir qué dibuja, un pivote equivocado y piezas que faltan (error en `final`, aviso en `provisional`) paran o avisan, con la ruta; un paquete que espera arte, o de otra categoría, ni se mira | `verifyArt.test.ts` (+6) |
| el informe de lo entregado: sin carpeta, una pieza entregada (etiquetas + fotograma + paquete listo), nada mientras espera arte / sin fotograma / sin etiquetas, el texto | `missing.test.ts` (+4) |
| la colisión no es el dibujo | `artIndependence.test.ts` (5) |
| **navegador:** cada dato de cada sala del mundo tiene su objeto dibujado, en su capa y sin sobrantes; el paralaje coloca cada capa en `(1 − f) × pivote` y la mueve *f* × la cámara, con el orden debido (**falla** si el renderizador aplica otro factor) | E2E `environment` |

*Adaptado sin cambiar su intención:* el ensayo «un escenario opaco es solo una nota» (`verifyArt.test.ts`, S37) y los paquetes de `environment` del E2E `assets` ahora **dicen qué dibujan** (etiquetas y pivote), porque el contrato lo exige.

**Coste:** `presentation/environment.ts` se reparte con el renderizador (`PARALLAX_FACTOR` y `layerSpan` viven aquí y las importan `render/layers` y `render/backdrops`); el resto —censo, reglas de paquete, repetición— lo leen solo las herramientas y las pruebas y **no viaja en el juego**.

---

# Parte J — El coste del arte, medido (S43)

> **Qué es:** una escena de estrés del arte (`?lab=art-stress`, un *chunk* aparte que nadie descarga jugando) y el E2E `art-performance` que la mide: una multitud de **100, 500 y 1000 *sprites*** repartidos entre **varias páginas de atlas que llegan por la biblioteca de arte real**, con transparencia, con luz y con los **efectos reales**, dibujados por el renderizador real. Mide **llamadas de dibujo**, **memoria**, **regularidad de los fotogramas** y **tiempo de carga del arte**; y **afirma lo que es propiedad del diseño** (≤ 60 llamadas de dibujo, la memoria contra los presupuestos de la parte C, los efectos dentro de su presupuesto de partículas).
> **Lo que NO es:** una medición en dispositivos. El arte es **sintético** (ruido sobre lienzos transparentes, del tamaño que tendría arte plausible: **no** es el arte del usuario) y el navegador de pruebas dibuja con **GL por software** (SwiftShader) en la CPU de este contenedor. **No hay mediciones en iOS ni en Android**, y nada de lo de abajo dice cómo irá en un móvil.

## J.1 Qué mide cada número, y qué puede y qué no puede decir

| Medida | Cómo | Qué dice | Qué **no** dice |
|---|---|---|---|
| **Llamadas de dibujo por fotograma** | se cuentan las llamadas `draw*` de WebGL (`DrawCallCounter`) | **cómo está construida la escena**: es una propiedad del diseño, no de la máquina; por eso se **afirma** (≤ 60) | cuántas unidades de textura tiene una GPU concreta (WebGL2 garantiza ≥ 16 por etapa; por encima de eso depende del dispositivo y **no se ha medido**) |
| **Memoria** | la biblioteca cuenta lo que retiene: ancho × alto × 4 bytes por página (RGBA8), y se contrasta con lo que escribió el empaquetador | la cuenta **exacta** de las páginas, contra los presupuestos propuestos (24 / 32 / 96 MiB) | la memoria real de la GPU (la imagen vive también decodificada en la CPU: súmale otro tanto), ni la de ningún móvil |
| **Fotogramas** | el tiempo entre `requestAnimationFrame` (media, p50, p95, máximo, desviación, *hitches* = más del doble de la mediana) | cómo se compara **una escena con otra aquí** | nada sobre un dispositivo: es CPU de contenedor con GL por software. **No se afirma ningún umbral** |
| **Carga del arte** | de pedir el índice a tener todas las páginas como texturas | lo que cuestan **leer, decodificar y subir** | la red: se sirve desde una ruta local, **sin latencia ni ancho de banda** |

## J.2 El arte sintético

Ocho *sprites sets* de 16 fotogramas de 256 × 256 (un grupo de personajes, cada set en sus páginas); el suelo de una zona (3 imágenes de 1536 × 1024, residentes sin dibujarse, para la memoria); y 24 sets diminutos (64 × 64) para la escena de más páginas de las que una GPU enlaza a la vez. **Son tamaños plausibles, no los del arte del usuario.** El mismo laboratorio mide su arte cuando llegue: `?lab=art-stress&art=<carpeta>&use=paquete/set,…`.

## J.3 Lo que salió (una medición, en este contenedor: Chromium sin cabeza + SwiftShader)

**Carga:** 9 páginas, **23.2 MiB** (14.7 el grupo + 8.5 el suelo), 21 ficheros, **listo en ≈ 0.6 s** por una ruta local (≈ 0.5 s de imágenes); montón de JavaScript ≈ 6 MiB (compilación de producción).

| Escena | Llamadas de dibujo | Fotograma (media · p95) |
|---|---|---|
| 100 / 500 *sprites*, 1 / 4 / 8 páginas | **1** | 16.7–17.8 ms · 16.8–33.3 ms |
| **1000** *sprites*, 1 / 4 / 8 páginas, ordenados | **1** | 22–24 ms · 33–50 ms |
| 1000 *sprites*, 4 / 8 páginas, **intercalados** (cada vecino de otra página) | **1** | 23 ms · 33–50 ms |
| 1000 *sprites*, **16 y 24 páginas**, ordenados o intercalados | **1** | 22–26 ms · 33–50 ms |
| 500 *sprites* a **alfa 0.5** | **1** (igual que opacos) | 17 ms · 17 ms |
| 500 *sprites* con el **30 % con luz** (aditiva) en **su propia capa** | **2** | 20 ms · 33 ms |
| 500 *sprites* con el 30 % con luz **mezclado en la misma capa** | **301** | 24–33 ms · 33–50 ms |
| 500 *sprites* + **efectos de combate** (20 ráfagas por segundo) | **4** (pico ≈ 170 / 300 partículas, 0 descartadas) | 20 ms · 33 ms |
| **lo peor a la vez:** 1000 *sprites* en 8 páginas intercalados, translúcidos, animados, 30 % con luz y 30 ráfagas por segundo | **5** (pico ≈ 240 / 300, 0 descartadas) | 21–27 ms · 33–50 ms |

Contra los presupuestos propuestos: el grupo (14.7 MiB) cabe en el de arranque (24), el suelo (8.5) en el de zona (32) y todo lo residente (23.2) en 96.

## J.4 Las reglas que salen de las medidas

1. **Las páginas no cuestan llamadas de dibujo, hasta donde la GPU enlaza texturas.** 1000 *sprites* de 24 páginas distintas, ordenados o intercalados, son **una** llamada: el renderizador agrupa en un lote los de varias texturas. WebGL2 garantiza al menos 16 unidades; la regla de diseño es **no más de 16 páginas a la vista por capa**. Por encima de eso el coste depende del dispositivo y **no se ha medido en ninguno**.
2. **Lo que rompe un lote es cambiar de mezcla.** La luz (aditiva) mezclada con *sprites* normales en una misma capa rompe el lote en cada cambio: **301 llamadas frente a 2**. La regla: **la luz va en su capa** (`fxWorld` y `lightOverlay` son aditivas y existen para eso). Es la que más importa para el arte de VFX que llegue: **nunca dentro de `actors`**.
3. **La transparencia no cuesta una llamada de dibujo** (sí relleno de píxeles, que aquí no se puede medir bien: GL por software).
4. **Animar dentro de una página no cuesta nada** en llamadas: cambiar de fotograma es cambiar el rectángulo de la misma textura.
5. **Memoria:** 16 fotogramas de 256 × 256 recortados cuestan ≈ 1.8 MiB por personaje; **una página de 2048 × 2048 son 16 MiB**: una sola se come dos tercios del presupuesto de arranque. Por eso las páginas son *tan pequeñas como puedan* (§C.1).
6. **Los efectos respetan su presupuesto** bajo carga: ≈ 240 de 300 partículas en el perfil medio, 0 descartadas; el gobernador (150 / 300 / 400 por perfil) existe para cuando no.

## J.5 Lo que no se ha medido

Dispositivos reales (iOS, Android); la memoria de GPU de verdad; calor y batería; la descarga por red móvil (el peso de los PNG reales, no del ruido, que se comprime distinto); el *hitching* de subir una textura grande en un teléfono; el coste de relleno de la transparencia en una GPU móvil; el tiempo de decodificación de PNG reales de 2048². Todo eso se medirá con el arte y el aparato delante: **esto es el instrumento y las reglas de diseño, no el resultado en un teléfono.**

## J.6 Probado (S43)

| Qué | Dónde |
|---|---|
| el reparto de la multitud entre los sets (ordenado: en bloques; intercalado: por turnos), el resumen de los fotogramas (media, percentiles, desviación, *hitches*), la mediana, la cuenta de una página, los presupuestos | `stressModel.test.ts` (12) |
| **navegador:** la biblioteca retiene **exactamente** las páginas que escribió el empaquetador y pidió **exactamente** los ficheros que había; el grupo, el suelo y todo lo residente caben en sus presupuestos; la multitud es una o dos llamadas de dibujo con 1, 4, 8, 16 y 24 páginas, ordenadas o intercaladas; la transparencia no añade ninguna; la luz en su capa añade una y **mezclada multiplica por más de veinte**; los efectos no pasan de su presupuesto de partículas; lo peor a la vez cabe en 60 | E2E `art-performance` |
| ninguna página del juego pide el laboratorio | E2E `assets` |

**Coste:** el *chunk* del laboratorio pesa 3.0 KB gzip y solo se descarga con `?lab=art-stress`; el arranque en frío sube **0.2 KB** (190.4 → 190.6 KB gzip; presupuesto 200) por el reparto de módulos en *chunks*.

---

# Parte K — Integración y cierre del Prompt 7 (S44)

> **Estado, sin letra pequeña:** el arte final del protagonista **no está físicamente disponible en el repositorio** y **no se ha integrado**. No hay un solo *sprite* suyo en `art/`, `public/` ni en ningún sitio versionado; las ilustraciones de referencia que se compartieron en la conversación son de concepto, sin canal alfa y fuera del repositorio. **No se ha generado, dibujado, recortado, imitado, recoloreado ni «mejorado» nada, y no se ha creado ningún sustituto.** El protagonista del juego sigue siendo la **cápsula abstracta con espada** (el *placeholder*, el único que existe), y todo lo de este documento está **preparado, probado con arte sintético y declarado**, no integrado.

## K.1 El *pipeline*, de punta a punta

```
 EL ARTISTA                       EL REPOSITORIO                                   EL JUEGO

 PNG + manifiesto  ──────▶  art/<paquete>/…  ─── npm run assets:check ───▶  (el build NO compila si el arte está mal,
 (fotogramas o hojas)        art/index.json       npm run assets:verify        con la ruta del archivo y qué corregir)
                                   │
                                   ├─ npm run assets:missing   →  qué clips y piezas faltan, en una tabla (hoy: 0/15 y 0/12)
                                   ▼
                          npm run assets:pack  ──▶  public/art/…  (generado: páginas de atlas SIN PÉRDIDA, índice, manifiestos)
                                                           │
                                                           ▼
                      ┌──────────  chunk diferido ArtLibrary (solo si hay un índice; boot · zone · lazy)  ──────────┐
                      ▼                                                                                            ▼
        PlayerVisual: el placeholder SIEMPRE está + el arte,                                        Entorno / VFX / enemigos:
        estado por estado (chooseSource · STAND_INS)                                                 contratos ya escritos (partes H–I)
                      │
   ?visual=placeholder | art | auto   ·   ?lab=player (ver)   ·   ?lab=art-stress (medir)   ·   state().boxes / .cues / .parallax (comprobar)
```

Reglas que atraviesan todo el *pipeline*, cada una con una prueba que falla si se rompe:

| Regla | Dónde se hace cumplir |
|---|---|
| **El *placeholder* nunca desaparece**: es el camino de vuelta y el *fallback* de cada estado que el arte no cubra | `chooseSource` / `PlayerVisual` (parte D), E2E `player-art` |
| **El arte no mueve nada del juego**: la simulación no importa lo que dibuja; las cuatro cajas del héroe están separadas | `architecture.test.ts`, `artIndependence.test.ts`, E2E `player-r1` y `world-art` |
| **El empaquetador es sin pérdida**: el fotograma original se reconstruye bit a bit | `pack.test.ts` (cada fotograma que empaqueta) |
| **El arte roto no compila** (tamaño, alfa, atlas, fotogramas, clips, anclas, espada, nombres) | `verifyArt.test.ts`, `npm run build` |
| **Un paquete nombra cada fotograma una vez** (cada *sprite* con su propio prefijo) | manifiesto + `verifyArt` |
| **Una página sin arte no descarga nada de arte** | E2E `assets` (ni una petición de arte, ni de su código, ni de los laboratorios; `state().art` es nulo) |
| **La luz va en su capa** (cambiar de mezcla rompe el lote: 301 llamadas frente a 2) | E2E `art-performance` (parte J) |
| **La colisión es de los datos de la sala, no del dibujo** | `environment.test.ts`, E2E `environment` |

## K.2 La integración (lo que S44 añade a lo anterior)

El E2E **`world-art`** recorre **la slice entera** (R1 → R2 → R3 → R4 → jefe → recompensa → salida, la misma partida grabada que `world`) **con el arte puesto**: los paquetes del héroe sintéticos servidos por la biblioteca real, el héroe dibujado con el arte estado por estado. Comprueba que **el resultado del juego es el mismo bit a bit**: los *digests* de la simulación cada 50 *ticks* de la reproducción con arte son los de la reproducción sin él. Es la prueba, a escala de toda la slice, de que **poner o quitar el arte no cambia a dónde se llega, qué se recibe ni qué se hace**. Con las suites previas intactas (los tests no se retiran; se adaptaron solo los que fijaban un comportamiento cambiado a propósito, y están en el mensaje de cada *commit*), el *placeholder* sigue jugando exactamente como antes.

> Es arte **sintético** (ruido sobre lienzos transparentes del tamaño de un héroe): prueba el **cableado**, no el aspecto. Cómo se verá el arte real **no se ha podido ver**.

**Lo que la integración encontró** (y no tenía que ver con el arte): la ejecución completa contra el *build* de producción hizo fallar dos escenarios que comparan partidas guionizadas *tick a tick* (`player-art` y `player-r1`) con **exactamente cinco ticks de más** —el tope del `FixedStepper`—. Pausar no era inmediato: el bucle se pausaba al final del *siguiente* fotograma, y un fotograma que llegaba tarde (GL por software, subir una textura) encontraba el bucle en marcha y corría los pasos que se le debían en medio de la partida guionizada. Corregido en `Game2D` (una pausa del estado de depuración pausa el bucle al instante) y fijado con una prueba en `devtools` que deja la página ocupada 400 ms justo tras pausar y exige que no corra ni un tick; falla sin el arreglo. **Coste:** 0.1 KB en el arranque en frío (190.6 → 190.7 KB gzip).

## K.3 Qué hacer el día que llegue el arte (el orden)

1. **Entregar** los PNG en `art/player/hero/` y completar `art/player/player.pack.json` con lo que solo el arte sabe ([deliver-protagonist-art](guides/deliver-protagonist-art.md)); para el entorno, [deliver-environment-art](guides/deliver-environment-art.md).
2. `npm run assets:missing` → qué clips y piezas hay y cuáles faltan.
3. `npm run assets:check` → todo lo que está mal, con la ruta del archivo. **Se corrige en el arte o en el manifiesto, nunca en el código del juego.**
4. `npm run assets:pack` → `public/art/`.
5. `npm run dev` y **`?lab=player`**: un clip cada vez, con las anclas, la espada, la escala y las cajas del juego; el *placeholder* al lado. **Lo primero a validar son los seis de `PLAYER_VISUAL.first`** (`idle`, `walk`, `attack1`, `dash`, `jump`, `hurt`): ahí se ven a la vez una escala mal, un pivote fuera de los pies o la espada fuera de la mano.
6. Jugar R1 con `?visual=art` (solo arte) y con `?visual=placeholder` (vuelta inmediata): el cambio es reversible en cualquier momento.
7. Medir con **`?lab=art-stress&art=<carpeta>&use=paquete/set,…`** (llamadas de dibujo, memoria, fotogramas, carga) y decidir los presupuestos de memoria con **un dispositivo real delante**.
8. `npm run build` y `npm run bench:bundle`: el arranque en frío no debe pasar de 200 KB gz (el arte son imágenes, no JavaScript).
9. **Solo entonces** escribir lo que está diseñado y no construido (K.5).

## K.4 Qué falta del arte real (exactamente)

| Pieza | Entregado | Falta |
|---|---|---|
| **Protagonista** (`art/player`, *sprite set* `hero`, `awaiting-art`) | **0 de 15 clips** | `idle` · `walk` · `jump` · `fall` · `dash` · `attack1` · `attack2` · `attackAir` · `crouch` · `attackCrouch` · `hurt` · `death` · `cast` · `drink` · `interact`; los cuatro golpes con las anclas de la espada en cada fotograma |
| **Entorno** (sin paquete en `art/`) | **0 de 12 piezas obligatorias** (y 14 opcionales) | `solid` `stone`/`earth` (`fill`) · `platform` `wood` (`body`) · `door` `gate`/`seal` (`body`) · `hazard` `spikes` (`cell`) · `backdrop` `ruins` (`far`, `mid`, `near`) · `interactive` `rest`/`pickup` · `seal` |
| **Enemigos y jefe** | procedurales (por código) | su arte, con el mismo contrato que el héroe ([replace-sprites](guides/replace-sprites.md)) |
| **VFX finales** | los efectos de hoy se conservan | su sustitución en tres niveles (§H.3) |
| **Audio** | ni archivos ni motor | el motor y un manifiesto de sonidos; las 17 señales están (§H.4) |

`npm run assets:missing` imprime las dos primeras filas, y `--strict` falla (código de salida distinto de 0) mientras falte algo: **la orden no deja fingir una integración**.

## K.5 Lo que está diseñado y no construido (a propósito)

Sin arte delante no se construye, para no inventar un contrato que luego el arte real contradiga: el **dibujo de las salas con imágenes** (las funciones puras que lo sostienen —`planTiles`, `stripCover`, `layerSpan`, `environmentSlots`— ya están probadas contra cada sólido de cada sala, §I.8), la comprobación de costuras y el alfa por pieza, los ***flipbooks* de VFX** (§H.3) y el arte de **enemigos y jefe**.

## K.6 Lo que no se ha verificado (⚠ sin cambios)

Nada del Prompt 7 se ha visto ni medido en un **iPhone, un iPad ni un Android reales**, ni con un **mando físico**. Las medidas de la parte J son de **Chromium sin cabeza con GL por software** (SwiftShader) en la CPU de un contenedor, con arte **sintético**: dicen cómo está construida la escena (llamadas de dibujo, que sí son propiedad del diseño), **no** cómo irá en un teléfono. Los presupuestos de memoria (24 / 32 / 96 MiB) son una **propuesta**.

## K.7 Medido al cierre

| | Fin del Prompt 6 | Fin del Prompt 7 |
|---|---|---|
| Pruebas unitarias y de integración | 1833 | **2223** (141 archivos) |
| Escenarios E2E (desarrollo y producción) | 35 | **43** |
| Arranque en frío (KB gzip; presupuesto 200) | 198.4 | **190.7** (34 *scripts*) |
| Primera sesión entera (KB gzip) | — | 205.9 |
| `tsc` | limpio | limpio |

---

# Parte L — El protagonista del usuario: de su hoja de poses a los fotogramas (Prompt 8, fase A)

> **Nota (Prompt 9):** esta parte describe la **extracción** de los dibujos de la hoja (L.1, L.2: siguen valiendo) y el estado del Prompt 8, que era **un fotograma por clip**. Desde el Prompt 9 cada clip tiene entre 4 y 9 fotogramas, hechos moviendo esos mismos dibujos: la parte **N**. Lo que dice abajo de «no hay animación» y de `assets:poses` **ya no es cierto** (`npm run assets:animate` lo sustituye; las cuentas de clips con dibujo propio y *stand-ins* no cambian: 7 y 8 de los 15).

> **Estado, sin letra pequeña.** El protagonista del juego **ya no es la cápsula**: se dibuja con **los píxeles de tu hoja de poses** (`art/player/source/hero-sheet.png`, el PNG que entregaste, guardado **bit a bit**). Pero la hoja es una **hoja de concepto** —**una pose por acción**, sobre fondo casi blanco, con sombras de suelo, líneas de velocidad, polvo y energía **roja** dibujados alrededor—, no una hoja de *sprites*: de ella salen **7 de los 15 clips con arte propio** (de **un solo fotograma** cada uno) y **8 estados que enseñan la pose de otro clip** (*stand-ins*, marcados y contados como **NO entregados**). **No hay animación**: no hay fotogramas intermedios, y **no se ha dibujado ninguno**. Lo que falta está dicho en L.6.

## L.1 Qué se hizo —y qué no— con tus imágenes

`tools/assets/poses.ts` convierte **un rectángulo de la hoja** en **un fotograma con alfa**, con operaciones **solo técnicas**:

| Se hace | Cómo | Qué garantiza |
|---|---|---|
| **Fondo transparente** | se buscan los píxeles seguros de la figura (oscuros —es negra y azul marino— o de brillo cian) y se crece unos píxeles hacia lo que no es casi blanco; lo que no toca la figura no es la figura | donde la figura es sólida, **su píxel es el de tu hoja, sin cambio**: colores, brillos y contorno |
| **Borde sin halo blanco** | el contorno de un píxel era una mezcla de la figura y del blanco sobre el que se dibujó; se resuelve cuánto de cada uno y se separa el color | el borde no lleva un fleco blanco sobre un fondo oscuro (una prueba lo comprueba) |
| **Lo que no es la figura se deja fuera** | la sombra del suelo, las líneas de velocidad, el polvo y la **energía roja** (otra capa del dibujo: el juego pinta sus propios efectos, en cian) | pero **el rojo que toca la figura** —el filo de una hoja que brilla— **se queda** |
| **Los huecos que la figura cierra** | el blanco dentro de los ojos es de la figura; el hueco blanco entre una antena y la cabeza **no** | los ojos conservan sus tres reflejos |
| **Espejo** | una pose que la hoja dibuja mirando a la izquierda (la 12) se refleja: el contrato pide el arte mirando a la derecha | el espejo mueve píxeles y no cambia ninguno |
| **Traslación entera al lienzo común** | cada pose se coloca con sus pies sobre el pivote: un desplazamiento en píxeles enteros | **nada se remuestrea** |

**Lo que no se hace jamás:** dibujar, redibujar, recolorear, suavizar, cambiar proporciones, silueta, cabeza, ojos, capa, armadura ni espada; inventar una pose; pasar nada por un filtro. Si una pose **no se puede separar** de su energía roja sin llevarse la figura, **no se usa** (L.2).

Todo lo que es una **decisión de una persona** —qué rectángulo es qué pose, dónde están sus pies, dónde está la empuñadura y la punta de la espada— es **dato**, en `art/player/source/hero.poses.json`, y se **comprueba mirando el resultado** en `?lab=player`. `npm run assets:animate` regenera los fotogramas y el manifiesto (desde el Prompt 9: antes `assets:poses`, que copiaba un dibujo por clip); `npm run assets:animate -- --check` dice si lo versionado es lo que la hoja, ese archivo y el rig producen (y lo repite una prueba: **nadie los dibujó ni los tocó**).

## L.2 Las doce poses de la hoja

| # | Pose de la hoja | Se usa para | Notas |
|---|---|---|---|
| 1 | de pie, tranquilo | `idle` (y de *stand-in* de `drink` e `interact`) | |
| 2 | de pie, tres cuartos, en guardia | — | ningún estado la pide todavía |
| 3 | la carrera, inclinado | `walk` (el juego usa el mismo clip para andar y correr) y de *stand-in* del `dash` | |
| 4 | subiendo | `jump` | sus líneas de velocidad se dejan fuera |
| 5 | cayendo de cabeza | `fall` | sus líneas de velocidad se dejan fuera |
| 6 | el aterrizaje, agachado | `land` y, de *stand-in*, `crouch` | su polvo se deja fuera |
| 7 | el tajo bajo, espada al frente | `attack1` y, de *stand-in*, `attack2`, `attackAir` y `attackCrouch` | el arco rojo se deja fuera |
| 8 | el segundo tajo | — | **no se usa**: la espada y su arco rojo son **un solo dibujo**; el arco es el efecto y no se puede sacar sin llevarse la hoja |
| 9 | la carga | — | **no se usa**: las llamas rojas cubren la figura |
| 10 | el *dash* | — | **no se usa**: la figura **es** una estela roja |
| 11 | golpeado, lanzado hacia atrás | `hurt` y, de *stand-in*, `death` | sus chispas rojas se dejan fuera |
| 12 | la espada en alto | `cast` (a ×1.3: está dibujada más pequeña) | **reflejada**: la hoja la dibuja mirando a la izquierda |

## L.3 Los clips

**Con arte propio (7 de los 15, un fotograma cada uno):** `idle`, `walk`, `jump`, `fall`, `attack1`, `hurt`, `cast` — y `land`, un octavo que la hoja trae y que la entrega no pedía.

**Estados con la pose de otro clip (8; etiqueta `stand-in` y un comentario con el porqué en el manifiesto):**

| Estado | Enseña | Por qué no tiene arte propio |
|---|---|---|
| `dash` | la carrera (3) | la pose del *dash* de la hoja es una estela roja, no una figura |
| `attack2` | el primer tajo (7) | el segundo tajo de la hoja no se puede separar de su arco rojo |
| `attackAir` | el primer tajo (7) | la hoja no tiene un tajo en el aire |
| `crouch` | el aterrizaje agachado (6) | la hoja no tiene un agachado |
| `attackCrouch` | el primer tajo, que ya es una estocada baja (7) | la hoja no tiene un tajo agachado |
| `death` | el golpe (11) | la hoja no tiene una muerte |
| `drink` | de pie (1) | la hoja no tiene beber |
| `interact` | de pie (1) | la hoja no tiene interactuar |

**Qué cuenta `npm run assets:missing`:** *«Delivered: 7 of 15 clips of its own. 8 more are drawn with ANOTHER clip's pose»*, y `--strict` **falla** mientras quede un *stand-in*. Con ellos **ningún estado cae ya al *placeholder***, y **ninguno de ellos es arte entregado**: cuando llegue un clip de verdad, se quita la etiqueta y el *stand-in* desaparece.

## L.4 Escala, pivote, anclas

- **Un lienzo para todo el *sprite set***: 344 × 320 px, los pies en el pivote (140, 306) y **130 px de arte por metro**: la figura de pie mide ≈ 1.64 m de los pies a lo alto de la cabeza (el cuerpo de colisión mide 1.7) y ≈ 2.25 m con las antenas. Todos los fotogramas dejan margen a la izquierda, la derecha y arriba (el *build* lo comprueba).
- **La escala de un fotograma** (`FrameMeta.scale`, **nueva en este paso**): las poses de una hoja no se dibujaron todas al mismo tamaño. La 12 está dibujada al 77 % de la 1 (su cabeza mide 100 px frente a 132), así que se dibuja a **×1.3** *alrededor de los pies*. Es una palanca de integración como `visualScale`: **cambia lo que se ve y nunca lo que pasa**; las anclas del manifiesto están en metros **ya con ella**. El laboratorio, el juego y los límites del dibujo (`bounds`) la aplican igual. Las demás se dibujaron entre ×0.93 y ×1.07 de la 1 (por el ancho de la cabeza; la caída y el aterrizaje, con la cabeza inclinada, no son comparables) y **no se tocan**: «lo que entregas es lo que se dibuja».
- **La espada en la mano:** en el único golpe con arte propio (`attack1`) la **empuñadura está en la mano** (0.00 m, el contrato pide ≤ 4 cm) y la punta **al frente**; sus anclas (`hand_r`, `weapon_grip`, `weapon_tip`, `hit_origin`, `vfx_origin`) están **medidas sobre el dibujo** con una cuadrícula y las heredan los tres golpes que lo reusan. `cast` lleva `hand_r` y `projectile_origin`. **El golpe visible es una estocada baja: la punta llega a ras de suelo**, mientras la *hitbox* del juego (datos de `combat/`, que **no cambian**) cubre de 0.3 a 1.4 m de altura: el dibujo y la zona de daño no coinciden del todo, y **eso es de la *hitbox*, no del dibujo** (§A.7).
- **Las cuatro cajas** siguen separadas (S40): `state().boxes` publica lo que se ve, lo que choca, lo que se hiere y lo que golpea, y cambiar el arte no mueve ninguna de las tres últimas: lo hace cumplir la regla de arquitectura (la simulación no importa nada de lo que se dibuja) y lo prueban, bit a bit, `player-art` y `world-art` (con arte sintético).

## L.5 Medido

| | |
|---|---|
| Fotogramas | 16 (8 distintos: los 8 *stand-ins* repiten los píxeles de otra pose y el empaquetador los guarda una vez) |
| Página de atlas | 1 de 1627.5 KB descomprimida (≈ 1.6 MiB), 343 KB en disco |
| Carga | `boot` (después del primer fotograma): el arranque en frío **no crece** (el arte son imágenes, no JavaScript) |
| Llamadas de dibujo | **las mismas** con el arte real que antes con la cápsula: la suite completa, con el héroe ya dibujado por el arte, da `r1` 12, `room` 14, `world` 15, `boss` 15, `finale` 15, el *soak* 22 (presupuesto 60) |

## L.6 Lo que falta y lo que necesita revisión artística

1. **Animación.** Cada clip es **un fotograma**: el héroe **posa**, no se anima. No hay ciclo de andar, ni respiración al estar quieto, ni anticipación del golpe. Los fotogramas de verdad los tiene que dibujar quien dibujó la hoja (o quien él decida): la guía de entrega ([deliver-protagonist-art](guides/deliver-protagonist-art.md)) dice cómo.
2. **Los ocho *stand-ins*.** Un agachado, una muerte, un beber, un interactuar, un tajo en el aire, un tajo agachado, un segundo tajo y un *dash* **propios**.
3. **El tajo.** Una sola pose de ataque, y baja (L.4).
4. **La espada.** En la hoja es **larga**; el encargo la quería **pequeña**. Es el dibujo del usuario y **no se ha tocado**: decide quien posee el diseño.
5. **El rojo.** Las poses con energía roja (8, 9, 10) no se usan y los efectos rojos de las que sí se usan **se han dejado fuera**: la paleta del juego es cian/azul. Los detalles rojos **de la figura** (el filo de la hoja, unos puntos en las botas) **se conservan**.
6. **Legibilidad.** El héroe es casi negro (luminancia ≈ 0.006): sobre un fondo oscuro **solo se leen los ojos y las líneas cian** (riesgo R14 del GAME-SPEC). Es un problema **de los escenarios y de la luz** (fases B–I), no del dibujo.
7. **Un detalle de la hoja, no del juego:** el reflejo blanco de los ojos es **tres puntos**; en la pose 12 hay una marca roja junto a la boca que no está en el retrato. Se conservan tal cual.

---

# Parte M — El escenario producido: el pintor, las escenas y la sala dibujada con arte (Prompt 8, fase B)

> **Estado, sin letra pequeña.** **R1 ya no se dibuja con rectángulos**: suelo, muros, plataformas, puerta, tres capas de fondo, hojas delante, luz y *props* son **imágenes** que carga el `ArtLibrary` por zona y dibuja una vista nueva (`RoomArtView`) a partir de **los datos de la sala** y de **una escena**. Pero **ninguna de esas imágenes la ha dibujado una persona**: las hace un **pintor** (código, `tools/art/painter/`) que corre en el Chromium del proyecto —el *canvas* 2D hace las curvas, los degradados y los desenfoques— a partir de formas, ruido y **una sola luz**. Es **original** (el vocabulario es el del proyecto —ruinas, raíces, musgo, cristales de energía cian, sellos violeta—; no se copia ningún personaje, enemigo, símbolo ni escenario de ninguna referencia: las referencias fijan *estructura y atmósfera*, no formas), es **determinista** (cada pieza es función de una semilla y sus parámetros) y es **provisional**: **necesita revisión artística** y, llegado el caso, sustitución por arte hecho a mano **por el mismo camino** (§M.2) sin tocar una línea del juego.

## M.1 Por qué un pintor, y qué es

El encargo pedía que una zona **no se diera por terminada** mientras dependiera de rectángulos, geometría procedural o fondos planos. La única forma de tener imágenes de escenario *sin un artista delante* es **generarlas**, y la forma honesta de hacerlo es **como una herramienta más del pipeline**, versionada, con sus semillas y su documento —no como una caja negra—:

```
tools/art/packs/ruins.ts      qué piezas hay, con qué parámetros y para qué sirve cada una (etiquetas del contrato)
tools/art/painter/            el pintor (se empaqueta con esbuild y corre en el Chromium del proyecto)
tools/art/scenes/r1.ts        dónde van las piezas de R1 (la composición, con semillas)
npm run art:build             pinta → art/<paquete>/<pieza>/<pieza>_NN.png + art/<paquete>/<paquete>.pack.json + escenas
npm run assets:pack           comprueba y empaqueta (atlas compartidos) → public/art/
```

**Lo que sabe hacer el pintor** (`painter/`): ruido y ruido celular **periódicos** (una textura sin costura); mampostería por hiladas o ciclópea, con mortero, astillas, manchas de agua, grietas, musgo y, en las grietas más hondas, un poco de **luz cian** (el hilo de Solo Leveling: energía que se cuela por la piedra); **una luz** (`light.ts`: clave fría desde arriba y algo por delante del héroe, ambiente azul profundo, brillo de borde) que ilumina una altura y un albedo, y una **silueta redondeada** (`silhouette.ts`: cada objeto trae su perfil, así una columna plana se ilumina como un cilindro); troncos con ramas y raíces, copas, columnas y arcos rotos, hiedra, helechos, hierba, cristales y hongos que brillan, piedras con runas, un efigie con capucha; y luces (haz, rayo en diagonal, resplandor, bruma, motas).
**Runas originales**: marcas abstractas de pocos trazos (anillos, rombos, espirales, ondas), **ninguna que sea una letra de ningún alfabeto**.

## M.2 El camino (el mismo de siempre) y lo que cambió del contrato

`tools/art` → `art/` → manifiestos → `assets:check` → `assets:pack` → `public/art/` → `ArtLibrary` → vista. Lo que este paso añadió al contrato, **todo opcional y retrocompatible** (un paquete que no dice nada de ello se comporta como antes):

| Qué | Dónde | Para qué |
|---|---|---|
| `atlasMode: "shared"` | manifiesto de un paquete | el empaquetador pone **los fotogramas de todos los *sprite sets*** del paquete en las **mismas páginas** (cada set lista las páginas donde están los suyos). Un personaje quiere páginas propias (`sprite`, lo de siempre); un escenario no: cientos de piezas distintas en una capa serían **una llamada de dibujo por pieza** |
| `scenes: { "<sala>": "scenes/<sala>.json" }` | manifiesto de un paquete | **la ropa que el paquete le pone a una sala** (§M.4): dónde está cada pieza que **no** sale de los datos de la sala |
| `role:decor` en **cualquier capa** | `ENV_CONTRACT`, `ENV_LAYERS` | arcos, columnas, raíces, helechos, bruma… van en `backdropFar/Mid/Near`, `propsBack`, `terrain`, `foreground` y `lightOverlay`; la escena dice cuál |
| etiquetas `grid:CxR`, `rise:<m>`, `reach:<m>`, `blend:add`, `layer:<id>` | sprites del entorno | `grid`: los fotogramas del clip `idle` son **las celdas de un dibujo periódico** (una pared de cien celdas no repite una dos veces seguidas y no tiene costuras); `rise`/`reach`: lo que la pieza sobresale por encima / por fuera del borde que viste; `blend:add`: es luz |
| la parte `glow` de una puerta | `door` | la luz de su sello: un solo dibujo suave, ajustado a toda la puerta, aditivo |
| la regla de escala **por familia** | `environmentPackIssues` | las piezas que **se encuentran** (suelo, muros, plataformas, puerta) comparten malla de píxeles; **una capa de *parallax* no se encuentra con otra**, así que el fondo lejano puede dibujarse a 20 px/m y el cercano a 38 sin aviso |
| cobertura **entre paquetes** | `environmentCoverageIssues` | «lo que el mundo pide y ningún paquete tiene» se juzga sobre **todos los paquetes de entorno juntos** (suelo, fondo y luz son paquetes distintos) |

El validador del *build* mira ahora también **las escenas** (existen, son JSON válido, son de la sala que dicen y **solo colocan piezas de su paquete**, con el fotograma que piden) y, con atlas compartidos, juzga cada set por **sus** fotogramas.

## M.3 Los paquetes de R1 (zona: las cuatro salas del *slice*)

| Paquete | Qué lleva | Densidad |
|---|---|---|
| `ruins-ground` | tierra y piedra (relleno en una **cuadrícula periódica de 4 × 2 celdas de 2 m**, borde superior —hierba o losa—, bordes laterales), plataformas de madera, la puerta del guardián (cuerpo, dintel, umbral y resplandor del sello), un velo de oscuridad para el suelo, y los *props*: helechos, hierba, escombros, cristales y hongos que brillan, raíces colgantes, columnas, una piedra de runas y el efigie del guardián | **96 px/m** (la del héroe) |
| `ruins-back` | las tres tiras de *parallax* (lejos: cielo, luz y siluetas de bosque con ruinas; medio: troncos con ramas y copas; cerca: una columnata con arcos y muros), dos arcos colosales y las hojas oscuras que cuelgan delante | 20 / 25.6 / 38.4 px/m y 48 los arcos |
| `ruins-light` | el haz sobre la salida, resplandores cian y violeta, rayos, bruma y motas | 32 px/m |

Las tres son `zone`: se cargan al entrar en cualquier sala del *slice* (por ahora solo R1 tiene escena: en R2–R4 el fondo y el suelo ya se dibujan con las piezas del paquete, y su ropa llega en las fases C–E).

## M.4 La escena de una sala

Una escena (`presentation/roomScene.ts`; `scenes/<sala>.json`) es **solo datos**: capas → lista de colocaciones `{ sprite, x, y, scale?, w?, h?, flip?, alpha?, tint?, frame?, motion? }`, con coordenadas **en el espacio de la propia capa** (metros, +y arriba: una capa de factor *f* se desplaza a *f* × la cámara, así que se coloca donde se verá desde mitad de la sala, no donde «está» en el mundo). `motion` (`sway`, `pulse`, `drift`) es **cosmética**: nada la lee. **No lleva colisión ni lógica**: cualquier escena —más, menos, ninguna, una equivocada— deja lo que el héroe pisa, golpea y atraviesa **exactamente donde lo puso la sala** (lo prueba `room-art` y lo hace cumplir la regla de arquitectura de siempre).
**Lo que ya dicen los datos de la sala** —sus sólidos, plataformas, puertas, salidas— **no se repite en la escena**: lo dibuja `roomPlan` (§M.5). La escena de R1 la compone `tools/art/scenes/r1.ts`: el **esparcido** (helechos, hierba, escombros, hongos y cristales sobre cada tramo abierto del suelo, con semilla) y los **hitos colocados a mano** que cuentan el recorrido —el camino de entrada bajo los árboles viejos (una piedra de runas que brilla junto al inicio), el abismo con sus pilares rotos y la bruma que sube, las escaleras con raíces colgando, el túnel de gateo bajo la sala en ruinas (raíces cortas, hongos), el patio con los dos efigies que vigilan la puerta del sello violeta, y la luz que va del azul pálido del principio al violeta del final.

## M.5 La vista

`presentation/roomPlan.ts` (**pura**: sin Pixi, sin texturas) decide, con números, **qué celda de qué pieza va dónde**: el relleno de cada bloque desde su esquina superior izquierda con celdas enteras y **la última fila y la última columna recortadas a lo que queda, nunca escaladas** (`cropFrame` calcula el recorte respetando el recorte transparente del empaquetador); el **borde superior solo donde da al cielo** y los laterales solo donde dan al aire (`exposedEdges`: un bloque sobre el suelo no tiene borde donde se apoya); el cuerpo y los extremos de una plataforma; la columna de una puerta desde abajo; y las tiras de *parallax* (`planStrip`: dónde está su base para que **la pantalla se llene a cualquier altura de la cámara**, y un aviso en desarrollo si la tira es demasiado baja). `render/RoomArtView.ts` convierte eso en *sprites* y coloca la escena. Vive en el *chunk* diferido del arte: **el arranque en frío no recibe esa vista**.

**El *blockout* es el respaldo, por ranura.** La vista dice qué cubre (`solids`, `gates`, `exits`, `backdrop`, y lo que **falta** del paquete: `lacking`); `RoomView2D` deja de dibujar **exactamente eso** y sigue dibujando el resto. Un material sin pieza, una capa que la escena no llena, una sala sin escena, o una página sin arte, siguen viéndose como antes, **nunca como nada**. Las puertas se desvanecen con su compuerta (`gate:changed`, 0.6 s de tiempo real): la vista del arte y la del *blockout* comparten la misma animación.

## M.6 Medido (Chromium sin cabeza con GL por software; **nada en un dispositivo real**)

| | |
|---|---|
| R1 | **539 *sprites*** en sus capas; **13 llamadas de dibujo** en el peor punto de las seis posiciones del recorrido (presupuesto 60), con luz aditiva, bruma y *parallax* |
| Memoria del arte de la zona | **22.4 MiB** residentes entre el héroe (1.6) y los tres paquetes del escenario (4 páginas, ≈ 5.9 + 15.7 + 3.9 MB descomprimidas) — **por debajo de los 32 MiB propuestos** (una propuesta que un dispositivo debe confirmar); en disco, **2.7 MB** de PNG empaquetados |
| Carga | las tres páginas del escenario llegan **después del primer fotograma** y se descartan al salir de la zona (la política de siempre) |
| Arranque en frío | **192.7 KB gz** (190.8 antes de la fase: +1.9 KB de lo que `Game2D`/`RoomView2D` necesitan para hablar con la vista); el *chunk* del arte, 15.0 KB gz, es diferido |
| Tiempo de pintar | ≈ 35 s para los tres paquetes, en este contenedor |

## M.7 Lo que falta y lo que necesita revisión artística

1. **Todo el escenario es de un pintor, no de una mano.** Necesita **revisión artística** pieza a pieza: la mampostería, la silueta de los troncos y las copas, los arcos, el efigie y los helechos se leen bien a 844 × 390 y a 1920 × 1080, pero **no tienen el trabajo de una ilustradora**. Cualquiera de ellas se sustituye entregando un PNG con las mismas etiquetas en `art/`.
2. **Los fondos son estáticos** salvo la deriva de la bruma y las motas, el pulso de los resplandores y el balanceo de lo que lo declare. No hay follaje que responda al héroe, ni luz que cambie con el combate (fases H–I).
3. ~~**R3 y R4 siguen sin su ropa**~~ **Resuelto**: las cuatro salas están vestidas (R1 fase B, R2 fase C §M.9, R3 fase D §M.10, R4 fase E §M.11) y el jefe tiene su arte desde la fase F (§M.12). Lo que sigue siendo procedural está en la lista de cada fase (los enemigos, fase G; los efectos, fase H).
4. **El suelo** (el relleno ciclópeo de la tierra) es oscuro y plano a propósito —para que el héroe, casi negro, se lea sobre un fondo más claro (R14)—; falta **variación a gran escala** (estratos visibles, raíces gruesas, charcos).
5. **Sin calibrar en un dispositivo real**: la densidad (96 px/m en el suelo, menos en los fondos) y la memoria están pensadas para un teléfono, **no medidas en uno**.

## M.8 Probado (S45–S46)

`roomPlan.test.ts` (celdas, recortes, bordes expuestos, plataformas, puertas, tiras, `cropFrame`), `roomScene.test.ts` (leer y comprobar escenas), ampliaciones de `environment.test.ts` (etiquetas, malla por familia, cobertura entre paquetes) y de `buildArt.test.ts` (**páginas compartidas**, las escenas se empaquetan y se leen contra su paquete, la biblioteca las lee por una página común), y el escenario E2E **`room-art`**: R1 con el arte (cada sólido, la puerta y la salida las dibuja el arte; ≤ 60 llamadas en seis puntos del recorrido; memoria bajo el presupuesto), la puerta se desvanece con su compuerta, **sin arte** el *blockout* lo dibuja todo, y **con arte de solo la tierra** lo demás sigue siendo del *blockout*.

## M.9 R2, «Galería de Raíces» (fase C): lo que el contrato aprendió

R2 se viste como R1 —las mismas teselas, los mismos fondos y la misma luz de los tres paquetes compartidos— y añade un cuarto paquete **solo de R2** (`ruins-roots`, `zones: ["r2_hall"]`: se descarga al entrar y se suelta al salir): el arco de raíces que cubre el vestíbulo, las cortinas que cuelgan de la oscuridad, las columnas que el bosque se ha tomado, las raíces que reptan por el suelo, los zarcillos del primer plano, **las espinas del foso, el santuario y el frasco de la cuarta botella**.

**Tres piezas de los datos de la sala que antes solo dibujaba el *blockout*:**

- **Las zonas que hacen daño** (`hazards`): `roomPlan.planHazards` reparte una fila de celdas de la pieza `role:hazard · kind:spikes · part:cell` a lo largo de la zona **desde su suelo**, de ancho entero y con la última recortada (nunca escalada), tan alta como diga el arte (la zona es lo que hiere; el dibujo solo dice dónde). `grid:4x1` da la variedad de una tira periódica. La vista le quita al *blockout* **solo** esas zonas (`BlockoutCover.hazards`).
- **Lo que se usa** (`interactables`): `planInteractables` coloca una pieza `role:interactive · kind:<tipo>` sobre el punto que nombran los datos: un **santuario** (`rest`) detrás de la acción, un **objeto** (`pickup`) flotando `PICKUP_FLOAT` (0.85 m, la misma constante que usa el *blockout*) por encima en la capa de luz. Una pieza con **segundo fotograma** lo muestra *encendido* sobre el primero (el santuario que es el *checkpoint*, la palanca que aún sirve). Cada interactuable lo dibuja un `ArtInteractable` que **sigue lo que dice la simulación** —está/ no está, encendido— en el mismo gancho del *blockout* (`InteractableViews.cover`); la vista **no decide nada**.
- **La variante de un objeto** (`variant:bottle|card|rune`): un `pickup` se pide **por lo que da** (una ranura de botella es un frasco, una habilidad una runa, lo demás una carta), leído de los datos de la sala (`interactiveVariant`). Una pieza sin variante sirve a todas. Así el slice pide **14 piezas obligatorias** (eran 12): la cuarta botella llega en R2, la carta en R3 y la runa en R4, cada una en su fase.

**Una guarda nueva para el primer plano.** Las piezas del primer plano cuelgan del borde alto de la pantalla; si su borde superior queda a la vista (la cámara más alta de la sala, el héroe en la repisa más alta) se ve un corte plano en el aire. `RoomArtView` avisa (`notes`, y el escenario `room-art` exige que no haya ninguno) y los compositores de escenas cuelgan las piezas desde `foregroundTop(sala)`. Esto **corrigió R1** también: sus hojas colgaban demasiado bajas para la cámara más alta, y el **arco colosal** estaba cortado por el borde del dibujo (ahora cabe entero).

**El pintor aprendió a pintar tubos** (`SilhouetteLayer.tube`): cada punto del camino estampa un disco de su radio y la altura es la de un cilindro, así que una raíz que va en **cualquier** dirección se ilumina como algo redondo (`add` redondea por la caja, bien para una columna y mal para una raíz curva). Con eso: raíces trenzadas con surcos de corteza, nudos, ramas y nódulos de luz cian; las espinas (negras, curvas, con la punta de un carmín apagado: lo único cálido de la sala y pequeño, para que el peligro se lea antes que se entienda); el santuario (un altar que se abre en copa, raíces que lo cierran como dedos y un cristal; **dos celdas**: en espera y encendido, con un charco de luz en el suelo); el frasco (luz pintada, para la capa aditiva).

**Medido** (GL por software; sin dispositivo real): R2 = 444 *sprites*, 10 llamadas de dibujo como máximo (presupuesto 60), 5 páginas residentes en R2 (≈ 26.6 MiB descomprimidas con el héroe; el paquete de R2 añade 5.5 MiB), arte de R2 ≈ 0.9 MB en disco.

**Lo que falta de R2 y necesita revisión artística:** el santuario en reposo y las espinas son pequeños comparados con el arco (se leen, pero piden el ojo de un artista); las raíces comparten una gramática (trenzas + nudos + ramas) que a ojo de ilustrador se repite; el suelo del foso es la misma tierra que la de fuera (le faltan charcos y estratos); el Ink Slime sigue procedural (fase G).


## M.10 R3, «Cámara del Sello» (fase D): lo que el contrato aprendió

R3 se viste con los mismos tres paquetes compartidos (suelo, fondos, luz: ahora declaran `r1_gate`, `r2_hall` **y** `r3_chamber`) y un quinto paquete **solo de R3** (`ruins-seal`, `zones: ["r3_chamber"]`, 96 px/m): la puerta del sello, su sigilo, la carta del Spirit Bolt, el altar, los muros tallados, el portal, el empedrado y los círculos de luz. Es la sala donde el héroe **recibe algo y después lo usa**: un camino ritual de piedra gastada, con una línea de luz cian incrustada, va de la entrada al sello; sube a la repisa donde la carta descansa en su altar y sigue por la nave larga hasta el portal. **Cian es del héroe** (camino, altar, carta, círculos donde ponerse); **violeta es del sello** (la puerta, su sigilo, la luz que se derrama).

**Una pieza de los datos de la sala que antes solo dibujaba el *blockout*: el sello (`seals`).** Es una *entidad* (la sala la hace nacer), así que no cabe en una escena: el arte se **cuelga de su vista**.

- `role:seal` (un `blend:add`, dos fotogramas: **colgado** / **destello**). `roomPlan.planSeals` coloca el sigilo a la altura de `sealSigilY` (la misma función que usa el *blockout*: la mitad del alto del sello, con tope), y lo que falta se reporta por ranura (`seal::`).
- `RoomArtView` crea un `ArtSeal` por sello y `SealView.dress(art)` lo cuelga de la vista del sello: **el arte no decide nada**, lee los mismos tres números que leía el *blockout* (`rejected`: cuánto queda del golpe que se rechazó, `opacity`: cuánto queda del sello, `broken`) y los pone en movimiento (respira, se hincha al romperse, se encoge al golpe, el destello se enciende al rechazar). Las formas del *blockout* **se ocultan, no se destruyen**: si la sala se reconstruye (el arte se limpia) o el arte se suelta, el sello vuelve a ser el de formas **en el mismo fotograma**.
- El arte conoce un sello por **el id que le dan los datos de la sala** (`def.id`), no por el id que la simulación da a la entidad (`seal#1`): `Game2D.dressRoom` busca por `def.id`. (Un fallo real de esta fase: la primera versión buscaba por el de la entidad y el sello nunca se vestía; lo cazó el E2E `room-art`.)
- La puerta que el sello sostiene es una puerta más (`material:seal`, cuatro piezas: cuerpo, cabeza con el rombo, pie y luz) con el estilo **`ward`** del pintor: piedra con canales de runas cian que acaban en violeta al llegar a la hoja.

**La carta** es un `pickup` con `variant:card` (la tercera variante del contrato): luz pintada, flotando sobre su altar. El `pickup` de R3 pide `card` porque **da una carta** (`interactiveVariant`), no por el nombre de la sala.

**Una regla de densidad que R3 deja escrita:** las piezas `blend:add` de **un mismo paquete** forman una familia (`light`) y **tienen que compartir `ppm`** (si no, el empaquetador avisa: la luz de un paquete con dos densidades se vería con dos tamaños de grano). Todo lo aditivo de `ruins-seal` es 96 px/m: el resplandor de la puerta, el sigilo, los círculos y el trazo de runas.

**Lo pintado** (todo de `tools/art/painter/seal.ts`; originales, runas **abstractas** —ninguna letra de ningún alfabeto—): sigilo (rombo con un ojo pálido, tres anillos, dos fotogramas), carta (marco de luz con un espíritu), altar (dos escalones y un pedestal con tres runas cian), relieves (muros tallados con anillos que arden), pilastras y dintel del portal, empedrado (franjas periódicas de 4 m con la línea de luz), círculos y trazo de runas (aditivos).

**Medido** (GL por software; sin dispositivo real): R3 = **370 *sprites*, 10 llamadas de dibujo como máximo** (presupuesto 60), 5 páginas residentes en R3 (**25.0 MiB** descomprimidas con el héroe), el paquete de R3 ≈ 0.8 MB en disco y 4.2 MB descomprimido.

**Lo que falta de R3 y necesita revisión artística:** el sigilo y la carta se leen bien pero son «de generador» (simetría perfecta, ninguna imperfección de mano); los relieves tallados repiten una gramática de anillos; el sello **roto** (la rotura es el momento del Spirit Bolt) es el mismo hincharse y desvanecerse de siempre: lo que lo hace épico son los VFX de la fase H.

## M.11 R4, «Santuario» (fase E): lo que el pipeline aprendió

R4 se viste con los mismos tres paquetes compartidos (suelo, fondos, luz: ahora declaran las **cuatro** salas) y un sexto paquete **solo de R4** (`ruins-sanctum`, `zones: ["r4_sanctum"]`, 96 px/m en el plano del héroe y 40 px/m en la capa de detrás): columnas más altas que la pantalla, guardianes de piedra, el muro con un ojo tallado, estandartes, los portales de los dos extremos, el santuario del último descanso, la runa del Air Dash, el dais, la tinta del Custodio, el empedrado y el anillo de luz fría de la arena. **No pidió ningún cambio de motor**: usa las puertas de `gate`, un `rest`, un `pickup` de `variant:rune` y dos salidas, que las fases B–D ya enseñaron; con ella, **las 14 piezas obligatorias del entorno están entregadas** (`npm run assets:missing`: 14 de 14) y la lista de lo que sigue siendo *blockout* del entorno queda vacía.

**Lo monumental vive en la capa de detrás y a una sola densidad.** El contrato exige que las piezas de una misma **familia de escala** compartan `ppm` (las del plano del héroe —`props-back`, `terrain`, los interactuables— son la familia «suelo»; cada capa de paralaje es la suya): un suelo con tres densidades se vería con tres granos. Una columna de 12 m, un portal de 13 m o un guardián de 15 m a los 96 px/m del héroe cuestan MiB de memoria que no compran nada (se ven oscuros y lejos), así que **todo lo más grande que la pantalla va a `backdrop-near` a 40 px/m** y en el plano del héroe solo queda lo pequeño y cercano a 96. (La primera versión puso las columnas a 56, el portal a 48 y el dais a 96 en la misma familia, y el empaquetador lo avisó.)

**Se compone en metros de la capa, no del mundo.** Una pieza de la capa 0.75 en `x` aparece en el mundo en `x + 0.25 × cámara`: a 99 m de mundo le corresponden 74 m de capa, y una composición hecha con `0.75 × X` monta las piezas de tramos vecinos (un guardián y una columna). El compositor de R4 separa las piezas **en la capa**, deja libres los sitios que el ojo debe encontrar (detrás del santuario y del dais: nada oscuro donde está la luz; el centro de la arena: el muro y, delante, el Custodio) y esas reglas están como pruebas (`tests/unit/tools/sanctumScene.test.ts`: empedrado sin huecos ni sobre una puerta, ninguna pieza grande tapa a otra, los estandartes no tapan el muro ni los portales, ninguna columna delante del muro).

**La luz de una sala se reparte por su función.** Cian es del héroe (el santuario, las runas del salón, el anillo de la arena); violeta es del Custodio y de **lo que hiere** (el ojo del muro, tenue; la tinta, el brillo de las puertas) y **ningún suelo de la arena es violeta**, para que los avisos de sus ataques sean lo único que grite sobre él. La luz tallada se queda **por debajo** del héroe y del Custodio (la primera versión era un neón y el muro del ojo más claro que el jefe).

**Medido** (GL por software; sin dispositivo real): R4 = **411 *sprites*, 17 llamadas de dibujo como máximo** (18 en la pelea del jefe; presupuesto 60), 5 páginas residentes (**26.4 MiB** con el héroe), el paquete de R4 ≈ 0.8 MB en disco y 5.6 MiB descomprimido; en la transición R3 → R4 conviven el paquete de R3 y el de R4 (≈ 30.6 MiB).

**Lo que falta de R4 y necesita revisión artística:** el salón es correcto pero de generador (simetría, gramática de collares y runas repetida, guardianes casi gemelos, estandartes lisos); el Custodio (fase F) y sus avisos (fase H) siguen siendo los del *blockout* delante de un salón que ya no lo es.

## M.12 El Custodio de Tinta (fase F): un jefe se pinta por partes

El jefe del Santuario deja de ser un montón de `Graphics`. Se pinta con arte en **un séptimo paquete, `ink-warden`** (`category: "enemies"`, `zones: ["r4_sanctum"]`, 112 px/m): el primer paquete de la categoría `enemies` que el juego dibuja con arte. Se descarga al entrar en R4 y se suelta al salir, como el de la sala. **La lógica no cambia:** 36 de vida, la FSM, los dos ataques con sus avisos, el daño, la fase 2, las puertas, el *checkpoint* y la persistencia de la muerte son los de siempre; la vista lee el mismo estado de la simulación y las poses son **las mismas cifras** con arte y sin él.

**Por qué por partes y no un clip.** La pose del Custodio *es* el estado de la simulación, y es la vista quien la lee: el cuerpo se hunde y se inclina en el aviso, la cresta sube, las esquirlas se levantan, el ojo arde más, y al caer se derrite en el charco en que está de pie. Un clip de fotogramas no puede hacer eso sin que el arte decida cuándo; unas pocas imágenes, cada una con su trabajo, sí. El pintor entrega **cinco *sprite sets***, y dos etiquetas por cada uno dicen **de quién** y **cuál**:

| Parte (`part:`) | Fotogramas del clip `idle` | Pivote | Qué es |
|---|---|---|---|
| `body` | **2**: la tinta, y la misma silueta en blanco (el destello de un golpe) | `[0.5, 1]` (los pies) | una capa de tinta mojada con la capucha puesta, una costura de luz violeta con una columna de glifos, venas bajo la superficie y un dobladillo que gotea hasta el suelo. Sin cara y sin miembros |
| `eye` | 1 (aditivo) | `[0.5, 0.5]` | la ranura pálida donde estaría la cara, con su halo dentro |
| `crest` | **3**: tenue, despierta, furiosa (la fase 2) | `[0.5, 0.5]` | la corona de luz violeta que flota sobre la capucha (aditiva) |
| `shard` | 1 (el juego cuelga **dos**) | `[0.5, 0.5]` | una esquirla de tinta cristalizada |
| `pool` | 1 | `[0.5, 1]` | el charco en el que está de pie y en el que se derrite |

`boss:<lookId>` dice **de quién** es la parte (el `view.lookId` de la definición del guardián: `ink_warden`) y `part:<nombre>`, **cuál**. Un paquete `enemies` que lleve estas etiquetas se valida con `bossArtIssues` (`src/presentation/bossArt.ts`, puro, usado por `assets:check`): **error** si una parte dice dos jefes o dos partes, nombra una que no existe o no tiene clip `idle`; **aviso** si dos *sprites* reclaman la misma parte, si al cuerpo le falta el fotograma del destello o a la cresta alguno de sus estados (los que faltan repiten el último), o si sobra algún fotograma (no se dibuja); y un aviso por jefe al que le falte alguna parte. **Una parte que falta no deja un jefe a medio pintar:** el motor lo viste **entero o nada** y, sin partes completas, sigue dibujando las formas de siempre. (Y para un paquete de la categoría `enemies` rige la regla de bordes de siempre: los píxeles no tocan los lados ni el borde alto del lienzo —el halo vive *dentro* de la imagen—; el borde de abajo sí, con el pivote abajo.)

**El motor** (una vista, sin tocar la simulación):

- `RoomArtView` toma de `heldPacks('enemies')` las partes de cada jefe y las entrega en `RoomArtCoverage.guardians` (por `lookId`); el arte de la sala y el del jefe llegan **por el mismo camino**.
- `GuardianView.dress(art | null)` cuelga los *sprites* **donde estaban las formas** (las formas **se ocultan, no se destruyen**: con `dress(null)` —la sala se reconstruyó o el arte se soltó— vuelven en el mismo fotograma) y los alimenta con **los mismos números**: el cuerpo, el destello (`v.flash`), el ojo, el fotograma de la cresta (`enraged ? 2 : awake ? 1 : 0`), las esquirlas, el charco (que se ensancha al caer). Los resplandores —el aura, el halo de la cresta, la luz del ojo— siguen siendo luz suave compartida con los efectos; la luz del ojo se atenúa a 0.55 porque el ojo pintado ya trae su halo. Las marcas del suelo (los avisos violeta) **no cambian**: son de la fase H.
- `Game2D` lo viste en dos momentos (como el sello): al vestir la sala (`dressRoom`, la vista puede ser una `LateView` cuyo código aún viene de camino: se viste al llegar) y al **nacer** la vista (un jefe que despierta cuando el arte de la zona ya está en memoria).

**Una escena que contesta a lo que pasa en la sala: `Placement.whenSet` / `whenClear`.** Una colocación puede llevar el nombre de una bandera del mundo (`~fight:r4_boss` volátil, `defeated:r4_boss` permanente): la pieza se ve **mientras** esa bandera está puesta (`whenSet`) y/o **mientras** no lo está (`whenClear`); entra en 0.9 s y sale en 0.6 s. Son las mismas dos condiciones que ya tiene un interactuable de los datos de la sala. **El decorado solo las LEE** (`RoomArtView.update(dt, isSet)` recibe una función de lectura; ninguna escena puede poner una bandera, así que ninguna escena puede cambiar lo que decide una regla). La primera vez que se evalúa una pieza se pone en su destino sin fundido (una sala que se abre con el Custodio ya caído no enciende despacio su ojo apagado). Una pieza con `motion: 'pulse'` multiplica su alfa por el nivel. `RoomArtView.gated()` y `state().roomArtGates` dicen cómo de visible está cada una (para las pruebas y el panel de depuración).

**R4 contesta a la pelea con tres cosas**, todas de la escena:

- **El ojo del muro** arde mientras el Custodio pelea (`eye_awake`, aditivo, mismo centro que el ojo tallado) y se **cierra para siempre** cuando cae (`eye_dead`: una oscuridad suave sobre él, pintada pequeña y ajustada con `w`/`h`).
- **El anillo de la arena** gana una capa más (alfa 0.35, pulso) mientras dura la pelea.
- **La recompensa se enciende al caer el Custodio:** la columna de luz del dais, el resplandor de la runa y el del portal de salida solo existen cuando `defeated:r4_boss` está puesta (antes de eso el dais está en reposo).

**Medido** (GL por software; sin dispositivo real): R4 con el jefe y las capas de reacción = **414 *sprites*, 17 llamadas de dibujo como máximo** (presupuesto 60), 6 páginas residentes (**28.2 MiB** con el héroe; el paquete del jefe añade 1.35 MiB descomprimidos y ≈ 190 KB en disco); en la transición R3 → R4 conviven los paquetes de las dos salas (≈ 32 MiB, bajo el techo propuesto de 96 MiB para todo lo residente). El arranque en frío no cambia (el jefe es del *chunk* perezoso de R4).

**Lo que falta del Custodio y necesita revisión artística:** el cuerpo es una silueta correcta y legible pero **de generador** (simetría, un dobladillo que gotea siempre igual, la costura de glifos repetida); no tiene un animador que le dé peso: las poses son las del cuerpo moviéndose entero (hundirse, inclinarse), sin deformarse. Sus **avisos violeta, la lluvia de tinta, los impactos y la muerte** (el charco que se lo traga) siguen siendo los efectos de siempre: son la **fase H**. La barra de vida del jefe es de la interfaz (no se rehace en este prompt).

## M.13 El Ink Slime (fase G): una criatura de tinta, por partes y con identidad propia

El enemigo ordinario de la slice deja de ser una cúpula de `Graphics` con dos ojos. Se pinta con arte en **un octavo paquete, `ink-slime`** (`category: "enemies"`, `zones: ["r1_gate", "r2_hall"]` —las dos salas donde vive uno—, 96 px/m, 0.53 MiB descomprimido): se descarga al entrar en R1 o R2 y se suelta al salir. **La lógica no cambia** (3 de vida, la FSM del *slime*, el aviso de 24 ticks, la embestida, la ventana de castigo, la muerte en 40 ticks): la vista lee el mismo estado y las poses son **las mismas cifras** con arte y sin él.

**Por qué por partes y no un clip.** Es el mismo razonamiento del Custodio (§M.12) con una razón más: el vocabulario de animación del héroe no tiene un estado «agotado tras la embestida» (la simulación lo da como `idle` con `phase: 'recovery'`), y la pose procedural ya sabe aplastarse, estirarse y desplomarse a lo largo de los 24 + 10 + 36 ticks de un ataque. Un clip de fotogramas habría perdido eso o habría tenido que reinventarlo. Así que el arte pone **las imágenes** y la vista conserva **la pose**: `ProceduralActor` deforma el cuerpo pintado sobre los pies (aplasta, estira, inclina) exactamente como deformaba la cúpula.

**La identidad** (hecha para leerse a ≈ 26 px/m en un teléfono a 1×, y a 78 con densidad 3×):

- una **criatura baja y encorvada**, no una cúpula: lomo alto con **la cresta echada hacia atrás como la punta de una capucha**, un hueco donde estaría el cuello, una cabeza baja con la frente sobre los ojos y la capa arrastrando por el suelo. Es la misma tinta y el mismo borde violeta frío que el Custodio (que es de donde gotea): ambos pintados con **`painter/ink.ts`**, el material compartido;
- **dos rendijas pálidas e inclinadas** por ojos (un ceño, no una mirada fija);
- **el sigilo**: un rombo en un anillo violeta, una astilla del sello, que arde en el pecho (brasa mientras duerme, blanco incandescente cuando se prepara, con un latido lento);
- **la cerda**: espinas de tinta que se levantan por el lomo **mientras el aviso crece** (tres estados: nada, algunas, todas). **El *telegraph* se lee en la silueta antes que en el color**, que es lo que un jugador ve antes en una pantalla pequeña.

**Las seis partes** (cada una un *sprite set*; dos etiquetas en cada uno: `enemy:<lookId>` —el `proceduralId` de la definición: `ink_slime`— y `part:<nombre>`):

| Parte | Fotogramas (clip `idle`) | Pivote | Qué es |
|---|---|---|---|
| `body` | **4** (cualquier número ≥ 1: son **un bucle**) | `[0.5, 1]` (los pies) | la tinta; los cuatro fotogramas «hierven» a 6 Hz (la superficie nunca descansa: el truco de la animación dibujada a mano para mantener viva la tinta). **Lleva las anclas `head` y `vfx_origin`**: dónde están los ojos y el sigilo en el cuerpo (metros desde los pies, +x delante) |
| `flash` | 1 (aditivo) | `[0.5, 1]` | la misma silueta en blanco: el destello de un golpe |
| `eyes` | 1 (aditivo) | `[0.5, 0.5]` | las dos rendijas con su halo; la vista las cierra con el parpadeo |
| `sigil` | 1 (aditivo) | `[0.5, 0.5]` | el rombo en el anillo |
| `spines` | **3** (nada, algunas, todas), en el marco del cuerpo | `[0.5, 1]` | la cerda |
| `pool` | 1 | `[0.5, 1]` | el charco en el que va y en el que se deshace |

`presentation/enemyArt` (puro) lee las etiquetas y valida el paquete (`enemyArtIssues`, que usa `assets:check`): **error** si una parte dice dos criaturas o dos partes, nombra una que no existe o no tiene clip `idle`; **aviso** si dos *sprites* reclaman la misma parte, si la cerda tiene menos de tres estados, si sobran fotogramas (un destello de dos fotogramas), si al cuerpo le falta `head` o `vfx_origin`, o si falta alguna parte de una criatura. **Todas las partes (y las dos anclas) o ninguna**: sin ellas, la vista sigue dibujando la criatura con sus formas. *(Una regla de lectura que esta fase dejó escrita: `part:` lo comparten el escenario, los jefes y los enemigos; solo la etiqueta `boss:` o `enemy:` dice de qué es la parte. Un lector no mira los *sprites* que no nombran a los suyos.)*

**El motor** (una vista, sin tocar la simulación):

- `RoomArtView` toma de `heldPacks('enemies')` las partes de cada criatura y las entrega en `RoomArtCoverage.creatures` (por `lookId`), con las posiciones de los ojos y del sigilo leídas de las anclas del cuerpo.
- `ProceduralActor.dress(art | null)` cuelga los *sprites* donde estaban las formas (se ocultan, **no se destruyen**: con `dress(null)` —la sala se reconstruyó o el arte se soltó bajo la vista— el *slime* vuelve a ser el de formas en el mismo fotograma) y los alimenta con los mismos números de la pose: el cuerpo cambia de fotograma a su ritmo (congelado en un *hit-stop* o una pausa, como la respiración), los ojos se cierran con `squint`, el sigilo sube con `eyeGlow`, la cerda con `aura` (nada por debajo de 0.2, algunas hasta 0.55, todas desde ahí: sube **a lo largo de los 24 ticks del aviso**), el charco se ensancha con el aplastamiento y es **lo último en irse al morir**. El aura y el brillo de los ojos —luz suave compartida con los efectos— siguen siendo lo que eran.
- `Game2D` lo viste en dos momentos (como el sello y el jefe): al vestir la sala (`dressRoom`) y al **nacer** la vista de un enemigo (uno que se coloca cuando el arte de la zona ya está en memoria).

**Pintado** (`tools/art/painter/slime.ts`, determinista: una semilla, los mismos píxeles): el cuerpo con el mismo `SilhouetteLayer`/`bevel`/`shade` que el Custodio, iluminado desde arriba (`SLIME_LOOK`: el *slime* se refleja con su orientación, así que su luz no puede venir de un lado), con dos destellos de lo mojado y burbujas que crecen y se hunden a lo largo del bucle; la cerda con su hilo de violeta en el borde y la punta caliente; las anclas están **una sola vez** en el pintor (`SLIME_EYES`, `SLIME_SIGIL`) y el paquete las importa.

**Medido** (GL por software; sin dispositivo real): *sprites* y llamadas de dibujo de R1/R2 con el *slime* vestido, memoria (+0.5 MiB: una página), *bundle* y E2E — ver el registro de la fase.

**Lo que falta del *slime* y necesita revisión artística:** es **correcto y coherente pero de generador** (la silueta es una curva, no el dibujo de una ilustradora; el «hervor» son cuatro variaciones de ruido, no un animador); **un solo cuerpo para las dos salas** (los dos *slimes* son idénticos); no tiene poses propias de la embestida ni del aturdimiento (se estira y se aplasta entero). **Los efectos de su aviso, su muerte y sus golpes** (el anillo violeta que se cierra, las motas, la tinta que salpica) siguen siendo los de siempre: **fase H**.

## M.14 La luz (fase H): las formas y las secuencias del arte, y el momento del *Spirit Bolt*

Hasta la fase G los efectos eran **datos con formas dibujadas por código** (§H): una cuenta de partículas, ocho máscaras blancas hechas con un lienzo, ningún arte. La fase H los convierte en **luz producida**: dos paquetes nuevos de la categoría `vfx` (**noveno y décimo**: `vfx-shapes` y `vfx-flipbooks`, `load: "boot"`, sin zonas) se descargan **con el juego** —un golpe llega en el primer minuto— y se retienen mientras corre; los efectos dibujan con **las formas y las secuencias que el arte pintó**. **Nada de la simulación cambia** (un solo evento nuevo, de aviso, `skill:castStarted`), el contrato de los efectos se conserva y **sin el arte todo es como era**.

**La decisión de contrato: máscaras blancas.** El alfa **es** la luz y el color lo pone la paleta al dibujar (cian para el héroe, violeta para los enemigos, negro para la tinta). Así **una imagen sirve a los dos bandos y la identidad —negro, blanco, cian y violeta— no depende de lo que haya pintado el arte**: un artista que sustituya una forma no puede romperla.

**Las diez formas** (`vfx-shapes`, *una sola página* de 356 × 384: el `ParticleContainer` dibuja todas las partículas desde **una** fuente de textura; 0.53 MiB): `glow`, `spark` (una estrella de cuatro puntas), `shard` (una esquirla de cristal a lo largo de +x), `ring` (un anillo roto con marcas), `rune` (anillo doble con un rombo: el signo de un lugar que despierta y de un poder ganado), `dust`, `ink` (una mancha con gotas), `streak` (un cometa), `arc` (el creciente de la espada) y `chevron` (una marca de velocidad hacia +x).

**Las doce secuencias** (`vfx-flipbooks`, 3.06 MiB descomprimido; cada una, un *sprite set* con su clip `idle`; **el tiempo es el de la `life` del dato, no un ritmo del arte**):

| Secuencia | Fotogramas | Qué es | La usa |
|---|---|---|---|
| `slash_body` · `slash_edge` | 6 + 6 (192 × 160) | **el corte** de la espada **barriendo**: una cometa curva de cabeza fina y brillante cuya cola la sigue y se apaga, más **el filo** blanco aparte (para teñir el cuerpo de cian y el filo de blanco incandescente) | `slash_arc`, `slash_arc_finisher` (el creciente es el respaldo) |
| `impact` | 6 (128²) | **el fogonazo** de un golpe: una estrella de cuchillas **gruesas** que salen a lo largo del golpe (largas delante, cortas detrás) y adelgazan, con chispas | `impact_burst` · `hurt_burst` |
| `bolt_body` · `bolt_core` | 4 + 4 (128 × 64) | **el *Spirit Bolt* en vuelo**: una gota de energía con llamas que se estiran hacia atrás, en cuatro fotogramas que **arden en bucle**; el corazón, más caliente y blanco, aparte | `render/ProjectileView` |
| `bolt_impact` | 7 (160²) | **donde cae el rayo**: una flor de puntas con **arcos de choque** que se abren y chispas | `bolt_impact_seq` |
| `ink_splash` · `ink_splash_gloss` | 6 + 6 (160 × 128 y la mitad) | **la tinta que salta** de lo que cae: una corona de tentáculos gruesos y curvos que acaban en gota, las gotas que se sueltan y vuelan, el charco; el brillo violeta **solo en los bordes que miran arriba y a la izquierda** | `death_splash`/`death_gloss`, `seal_break_*`, `boss_defeat_*` |
| `ink_column` · `ink_column_glow` | 8 + 8 (96 × 288 y la mitad) | **la columna de tinta** que el jefe levanta donde cae su golpe: sube, aguanta con la corona irregular y se desploma; el hilo de luz por dentro y por los bordes aparte | `boss_strike_column(_glow)` |
| `pillar` | 6 (48 × 160) | **el pilar de luz** de un lugar que despierta (pie en el suelo) | `checkpoint_pillar`, `ability_pillar`, `death_pillar` |
| `aura` | 6 (64 × 96) | **la llama de luz** que sube alrededor de un héroe armado | `checkpoint_aura`, `drink_heal_aura` |

**Las etiquetas** (`presentation/vfxArt`, puro): `vfx:shape` + `shape:<nombre>` o `vfx:seq` + `seq:<nombre>`. `vfxArtIssues` (que usa `assets:check`) da **error** si una etiqueta no nombra nada o nombra dos cosas, o si falta el clip `idle`; **aviso** si una forma tiene más de un fotograma, si dos *sprites* reclaman el mismo nombre, si las formas están en más de una página o si falta alguna. `vfxCoverageIssues` mira **los dos paquetes juntos** (las formas están en uno y las secuencias en otro).

**El motor** (todo en la vista; el *chunk* de efectos y el del arte, sin tocar el arranque en frío):

- `assets/vfxAtlas.ts`: el `VfxAtlas` gana `heightPx`, `sequences` y `origin` (`procedural` | `art`); el juego dibuja las **diez** formas (`rune` y `chevron` son nuevas; `PROCEDURAL_SHAPES` lo prueba contra la lista del arte).
- `assets/vfxArtAtlas.ts#createArtVfxAtlas(art, base)`: toma de la biblioteca los *sprite sets* de los paquetes `vfx` retenidos y construye el atlas **encima del propio**: las formas del arte **solo si son las diez y están en una sola página** (se usa el tamaño **original** del fotograma —el empaquetador recorta el borde transparente y dice dónde estaba—), y **cada secuencia con todos sus fotogramas**. No puede fallar el juego: si el arte no pintó nada, devuelve `null` y el juego sigue con el suyo. `Game2D` lo adopta tras `art.start()` y **reconstruye los efectos** (lo mismo que hace un cambio de calidad); `?vfx=procedural` lo impide (para comparar y para ver el respaldo).
- `FlipbookVfx` (`kind: 'flipbook'`): la secuencia a lo largo de su `life`, tamaño por **el ancho de la imagen entera** (la altura sigue su proporción), el **pivote del propio arte** sobre el punto del evento, `aim: none | facing | dir` (`dir`: espejada **y girada a lo largo del golpe**), `offset`, `layer`. Sin la secuencia, **no se juega** (`stats.unplayed`) y no es el presupuesto soltándolo.
- `ArcVfx.sequences`: el corte pintado, **solo si el arte tiene las dos secuencias** (todo o nada). Mantiene la caja del *hitbox* (el golpe visible **es** el área que golpea) agrandada por el factor del arte (su barrido ocupa el centro de su imagen); no gira durante su vida (barre solo) pero sí **se inclina** como la variante y **se voltea** para el remate, que sube.
- `FlashVfx.offset | turn` y `ParticleVfx.inward` (partículas que nacen dispersas y **vuelan hacia** el punto del efecto: la luz que se junta antes del rayo).
- `layer: 'back'` + **`fxBack`**, una capa aditiva **detrás de los actores** (entre el terreno y los actores, en el contrato del entorno): el pilar de un lugar que despierta, la llama y la runa van **detrás** del héroe, y su silueta oscura se recorta contra la luz en lugar de perderse en ella. Los tres sitios donde se dibujan los *sprites* (luz delante, tinta, luz detrás) **comparten el presupuesto** (un fallo que cazó la prueba: con tres *pools* cada uno aceptaba el tope entero).
- `render/ProjectileView`: con las secuencias del *bolt* es un **resplandor suave bajo el cuerpo y el corazón pintados**, que crece en una décima de segundo al salir de la mano; sin ellas, las formas de siempre.
- `render/GuardianMarks`: **los avisos del jefe en el suelo ya no son geometría** sino sprites de las formas de la luz —la lluvia, una **runa tumbada que gira** con un anillo que se cierra, un anillo blanco que se cierra más deprisa y una columna de luz que sube a medida que cae el golpe; la embestida, una banda de luz, una línea brillante hacia donde terminará y *chevrons* que apuntan hacia donde se deslizará—. La simulación decide cuándo y dónde; esto solo lo dibuja.

**El momento del *Spirit Bolt*, por etapas** (cada una, un disparador con su evento):

1. **Carga** (`boltCharge`, el evento nuevo `skill:castStarted`: la simulación avisa al **empezar** la preparación, sin cambiar nada de lo que ocurre): un anillo que se cierra sobre el cañón, una luz que crece y chispas que **entran** desde alrededor. Los seis ticks de preparación son lo que dura.
2. **Lanzamiento** (`boltCast`): destello, anillo que se abre, un **rayo de luz hacia delante** y el brillo de la mano, que sigue encendido cuando el rayo ya salió.
3. **Trayectoria**: el *bolt* pintado (gota con llamas que arden, núcleo blanco).
4. **Impacto** (`boltImpact`): chispas, destello, anillo, **la flor de puntas con arcos de choque** y un **resplandor remanente** de 0.8 s donde cayó.
5. **El sello que se rompe** (`sealBroken`: el `actor:died` de algo neutral): el destello blanco-cian de lo que lo rompió, un anillo violeta, la tinta que se lanza con su brillo violeta y las esquirlas.

**Otros momentos pintados:** el tajo y el fogonazo del golpe (y del daño recibido, que se lanza hacia donde empuja), dos ***chevrons*** de velocidad que el *dash* deja atrás, la **runa que se cierra** sobre el enemigo que se prepara, la salpicadura de tinta de su muerte, el **pilar de luz** de un lugar que despierta (`checkpoint`, ya no el brillo de una botella), **la runa grande de un poder ganado** (`abilityGained`), la columna del jefe, su runa al despertar y su caída.

**La luz que lleva el héroe** (`AMBIENT_CONTRACT`, §H.2): una mota cada 0.35 s con la magia llena, nada con la magia gastada: **el héroe con el rayo listo no es el héroe que está vacío**.

**Pintado** (`tools/art/painter/vfx.ts`, determinista; máscaras blancas hechas con el lienzo del navegador: luces aditivas, degradados y desenfoques): cada pieza se hace para leerse **al tamaño de un teléfono** (formas gruesas, núcleo caliente, borde limpio, y un halo que es solo un halo); el corte se dibuja en un espacio donde su elipse es un círculo para que los degradados que corren a lo largo del arco sean verdaderos.

**Medido** (GL por software; sin dispositivo real): ver el registro de la fase.

**Lo que falta de la luz y necesita revisión artística:** todo es **«de generador»**: el corte, el fogonazo, la tinta, el pilar y la llama son correctos y coherentes pero no los dibujó una ilustradora ni un animador de efectos (el corte barre con seis fotogramas; la tinta es una corona simétrica de tentáculos; el pilar y la llama son geométricos); **`rune` es un anillo con marcas**, no un signo con significado; **no hay un lenguaje de runas** (las del escenario, las del sello y las de los efectos son tres familias); el brillo del *dash* y del impacto **tapa al héroe** unos fotogramas (la silueta es de la imagen de referencia: no se retoca, pero se puede afinar la luz alrededor). Y **nada de esto se ha visto en un dispositivo real**: el tamaño de las formas finas (una línea de 2 px a 1×) y el contraste de la luz sobre los fondos más claros es lo que un teléfono debe confirmar.

## M.15 La luz del mundo y la atmósfera de la pantalla (fase I): lo que la energía hace al lugar

La fase H dejó la luz **dentro de los efectos**: cada destello brillaba pero el escenario no se enteraba. La fase I hace que la energía **ilumine el lugar** y que la pantalla tenga **noche**, sin añadir una sola capa a la escena, sin filtros y sin *render targets*, y **sin tocar un píxel del protagonista**. Nada de la simulación cambia: la luz es una función pura de lo que las vistas ya leen (`presentation/lighting`) y la dibuja un *pool* de *sprites* (`vfx/LightField`); la atmósfera es una función pura (`presentation/atmosphere`) que dibuja `vfx/ScreenFx`. **Ninguna es arte de archivo**: usan la forma `glow` que ya arrancaba con el juego (§M.14) y una textura procedural de 128² para la viñeta, y se cablean donde se montan los efectos (`app/effects.ts`).

**La decisión de diseño: luz de escenario, no iluminación de sprites.** El héroe es casi negro (luminancia relativa 0.006) y el fondo es oscuro: lo que le da legibilidad no es iluminarle a él sino iluminar **lo que tiene detrás**. Cada luz es un charco **aditivo** de la forma `glow`, teñido con la ranura de paleta (`energy` cian para el héroe, `enemy` violeta para lo enemigo), dibujado en **`fxBack`** —sobre el escenario y **debajo de los actores**—: el suelo, los muros y las tiras del fondo se aclaran donde está la energía y quien está delante queda como una silueta oscura recortada. Es la regla 1 de GAME-SPEC §3.3 («luz detrás, oscuridad delante») hecha dinámica.

**Las luces** (`LIGHT_KINDS`; datos en `content/lights.ts`, reglas en `LIGHT_CONTRACT`):

| Clase | Qué es | Color | Radio | Fuerza (alfa en el corazón) | Rango |
|---|---|---|---|---|---|
| `hero` | un charco redondo a la altura del pecho (0.85 m) | cian | 3.8 m | `0.2 → 0.46` según la magia (gastado nunca se apaga) | 0 |
| `floor` | un charco plano (`squash 0.18`) **sobre el suelo real** bajo sus pies; se apaga a 3 m de altura | cian | 3.2 m | `0.12 → 0.24` | 2 |
| `bolt` | cada *Spirit Bolt* en vuelo, en su posición interpolada | cian | 4.6 m | `0.5` | 1 |
| `boss` | el Custodio: grande | violeta | 6.8 m | dormido `0.04`, despierto `0.13`, furioso `0.22`, + aviso `0.2`, + golpe `0.16` | 3 |
| `foe` | un enemigo despierto, que sube con su aviso | violeta | 2.7 m | `0.07`; aviso `0.12 → 0.38`; golpe `0.3` | 4 |

**El contrato** (`LIGHT_CONTRACT`, `lightIssues` y una prueba): techo por clase (0.5 · 0.3 · 0.62 · 0.42 · 0.42: sumar luz a una escena oscura es lo que la mantiene oscura si hay un tope), radio entre 0.8 y 8 m, **luz apilada máxima 1.25** sobre el corazón del héroe (la suya + el charco + un rayo que sale de su mano), color solo de las ranuras `energy` / `enemy`, y **capacidad por perfil** (3 / 6 / 8 luces a la vez; el rango decide qué sobra y **las tres primeras —héroe, rayo, suelo— caben siempre**). Una luz a más de 24 m del héroe no se dibuja.

**El aviso se queda violeta.** La luz cian del héroe sobre un enemigo que prepara un golpe **grisaba** su aviso (lo cazó el E2E `slime`: 581 píxeles violeta contra el mínimo de 864). Por eso la luz del héroe y su charco **ceden** (`duck 0.6`, tope `0.75`: el héroe nunca se pierde del todo) en proporción al aviso del enemigo más amenazador a ≤ 7 m (a ≤ 14 m si es el Custodio, cuyos golpes cubren la arena): 1498 píxeles violeta con luz contra 868 sin ella.

**Los pulsos: la luz que deja un momento** (`LIGHT_PULSES`, `PULSE_CONTRACT`): 18 de los 25 disparadores de efectos dejan además un destello donde ocurren (el golpe que cae, el *dash*, la muerte de un enemigo, la carga, el lanzamiento y el impacto del *Spirit Bolt*, el sello roto, el *checkpoint*, el poder ganado, el jefe que despierta, golpea, cambia de fase y cae, la muerte del héroe…). Suben deprisa (cuadrático hasta su pico) y caen despacio (`k^1.5`); el director avisa por `onFire`, **no cuentan en el presupuesto de los efectos** y tienen su capacidad (2 / 3 / 4 por perfil) y su contrato (pico ≤ 0.62, vida ≤ 1.8 s, radio 1.2–9.5 m, 1 o 2 por disparador).

**`LightField`:** los *sprites* se hacen una vez y solo se mueven y se tiñen (nada se asigna al jugar); una luz sube a 11/s y baja a 6/s (exponencial: el rayo ilumina la sala en una décima de segundo y el héroe que cae se apaga en un tercio); la que nadie pide ya se apaga y libera su sitio, y una nueva sin sitio toma el de la más débil. Con el tiempo de efectos **parado** (`dt = 0`: solo una herramienta lo hace, el menú del jugador no) las luces se **plantan** en su valor: una captura quieta muestra la luz que es y no una luz de camino.

**La atmósfera** (`ATMOSPHERE_CONTRACT`, `ROOM_MOODS`, `EDGE_PULSES`; `atmosphereIssues` y una prueba):

- **Una viñeta por sala**: una textura blanca de 128² cuyo alfa se calcula **píxel a píxel con la misma función que mide el contrato** (`vignetteAlpha`: nada en el tercio central, subida suave por el borde, fuerza plena en la esquina), estirada sobre la imagen y **teñida con el casi-negro del matiz de la sala** (`r1_gate` `#020a12` · `r2_hall` `#03100d` · `r3_chamber` `#040a1a` · `r4_sanctum` `#07040f`; fuerzas 0.5 / 0.52 / 0.52 / 0.62; un tono con un canal > 0x30 no es «casi negro» y el contrato lo rechaza). Mientras el Custodio está despierto cierra a **0.7** y vira al violeta (`#07031a`); al caer, reaparecer el héroe o salir de la sala, vuelve a la de la sala. Llega con una transición de 0.9 s (no aparece de golpe).
- **Cinco pulsos de borde** que responden a eventos del juego: `hurt` (carmín atenuado `#a51e2c`, mezcla normal, 0.3 durante 0.42 s: **el único que oscurece**), `power` (cian, aditivo, 0.26 / 1.0 s), `rest` (cian claro, 0.18 / 0.8 s), `guardian` (violeta, 0.26 / 1.0 s) y `fall` (violeta, 0.34 / 1.3 s).
- **El contrato** lo que nunca puede hacer: esquinas ≤ **0.72** (también con el ánimo de pelea) y mitad de un borde ≤ **0.34** (la plataforma de lo alto de un salto sigue ahí: el héroe está en el centro, lo que hay que ver está arriba y abajo), pulsos ≤ 0.5 y ≤ 1.4 s.
- **Cuesta:** seis *sprites* (la viñeta y los cinco pulsos) de **una** textura en la capa `screen`, bajo las barras del *letterbox*.

**El aire** (`tools/art/scenes/common.ts#scatterMotes`): campos de la pieza `motes_a` (16 × 12 m de luz suave que deriva) repartidos por toda la sala en `lightOverlay` (aditivos, delante de la acción y débiles: alfa 0.16–0.36), con el tono de la sala (polvo azul pálido en R1, esporas verde-cian en R2, chispas cian en R3, brasas violeta y cian en R4). Posición, tamaño y brillo salen de una semilla (reconstruir no cambia nada) y evitan los sitios con un campo hecho a mano y la arena de R4, donde los avisos del jefe son lo que debe gritar. Son entradas de las escenas (`art/ruins-light/scenes/*.json`): **cambian con `npm run art:build`, no con el motor**.

**Capas y *parallax* (auditoría):** las capas del §I.2 (lejos 0.15 · medio 0.4 · cerca 0.75 · plano de juego 1 · primer plano 1.2) dan profundidad perceptible con pocos recursos y se revisaron a 844 × 390, 4:3 y 21:9 sin encontrar nada que cambiar; **no se añadió ninguna capa**. `fxBack` lleva ahora, además de la luz de los efectos (§M.14), las luces del mundo; `screen` lleva la viñeta y los pulsos de borde por debajo de las barras.

**Herramientas:** `?light=off` (el juego sin luces del mundo ni atmósfera: para comparar y para ver qué añaden), `TROID_E2E_QUERY='&light=off'` (el mismo escenario del E2E con la opción), `window.__troid.state().lights | screen` y `advanceEffects(s)` (los efectos están quietos mientras el juego está en pausa), y el escenario `lighting` (con y sin luz, en las cuatro salas).

**Legibilidad medida** (GAME-SPEC §3.3, R14; contraste WCAG entre `hero.ink` y la luz media de un anillo de 1 m alrededor de la silueta, sin luz → con luz): R1 1.30 → 2.09 y 2.20 → 3.11 · R2 1.06 → 1.62 y 1.04 → 1.61 · R3 1.32 → 2.13 y 1.49 → 2.28 · R4 2.13 → 3.24 y 1.31 → 2.06 : 1. **Sube en los ocho puntos; solo dos superan el aviso de 2.5 : 1.** No se ha puesto una luz de borde (*rim light*) al héroe: cambiaría los bordes de la imagen de referencia del usuario.

**Lo que falta de la luz del mundo y necesita revisión artística:** las luces son **charcos planos y aditivos** —no hay oclusión (una luz atraviesa un muro), ni mapas de normales, ni luz por *sprite*—, **correctas y legibles pero no bonitas**: sin forma ni dirección; las fuentes **pintadas** del escenario (cristales, runas, el ojo del muro) **no echan luz dinámica**; la viñeta es **estática** y no hay *bloom*; las motas son un campo de generador, no un diseño de atmósfera. Y **nada se ha medido en un dispositivo real**: el brillo de una pantalla OLED o LCD, el contraste del anillo al sol y el coste de relleno de ~8 luces aditivas grandes en una GPU móvil (medimos llamadas de dibujo, no milisegundos de GPU) son lo primero que un teléfono debe confirmar.

## M.16 El arranque en frío (fase J): el telón

El arte son imágenes que llegan **después del primer fotograma** (§C.6: el arranque en frío no debe crecer, y las imágenes no son JavaScript). Con arte pintado eso tenía un coste que ningún E2E veía —todos abren la página con `?hooks=1`, que pide el arte al instante—: **un jugador veía el *blockout* técnico (rectángulos planos y una cápsula con espada) durante los 3 s que tardan en llegar los 2.7 MB de R1 en una línea local, y ~8 s con la red a 600 KB/s**, antes del aspecto producido. La fase J lo mide (§ el primer minuto de producción, sin ganchos) y lo arregla **sin tocar el reparto en *chunks***:

- **La página es el telón** (`#boot-curtain`, `index.html`): `#03070b` y una luz cian de 14 px que respira (CSS: `prefers-reduced-motion` la deja quieta). Existe **desde el primer pintado**, antes de que corra una línea del juego.
- **El mundo no empieza detrás de él** (`Game2D.veiled`): el juego se construye y dibuja, pero no corre un *tick* hasta que el arte de la primera sala está dentro (`dressRoom`). Como detrás del telón no se ve nada, **los efectos y el arte se piden al instante**: el aspecto producido llega *antes* que cuando esperaban 2 s en reposo (a los 0.9–1.9 s en local; 6.4–7.8 s a 600 KB/s frente a 8.7 s).
- **No puede encerrar a nadie**: se levanta cuando el arte está (`art`), cuando no hay arte que esperar (`no-art`), cuando falla (`art-failed`) o a los **10 s** (`timeout`: el juego empieza como *blockout* y se viste cuando el arte llega); un seguro de 20 s en la propia página lo quita si no corre ni el *script*, y `main.ts` lo quita en los laboratorios y si el juego no se puede construir. Un juego sin arte, `?hooks=1` y `?paused=1` **no tienen telón**.
- **Deja la razón en la página** (`<html data-boot="art">`): lo lee el E2E y quien depure.
- **Qué mide el presupuesto de arranque**: 195.8 KB gz de **código del primer fotograma** (≤ 200); 41.1 KB gz de *chunks* cosméticos (efectos, partículas, vistas del jefe, el arte) que ahora se piden detrás del telón; y 2746 KB de PNG que la primera imagen espera. `bench:bundle` reparte los *scripts* por una marca que deja el juego (`troid:cosmetics`).
- **Probado** (`tools/e2e/scenarios/boot.ts`, en desarrollo y en producción): cuatro arranques en frío sin ganchos con una captura cada ~100 ms —línea rápida, línea lenta (cada archivo del arte 700 ms tarde), arte rechazado y arte colgado— y **ni un cuadro del *blockout*** (se mide el suelo plano del *blockout* en cada captura); y `fallbacks`: cada piel se quita y la partida acaba **igual** en las cuatro salas.

**Lo que falta del arranque:** **no está visto en un dispositivo real** (el telón es DOM y CSS; las áreas seguras, la barra de direcciones y la decodificación de los PNG de un teléfono son lo que hay que mirar); **una red de 3G** haría que el telón se rindiera a los 10 s con el *blockout* a la vista (hace falta la variante de media resolución de los paquetes, que el contrato admite); un jugador que vuelve con la partida en R4 espera 3.8 MB (no medido con un guardado); y el telón es **una luz que respira, no una pantalla de carga diseñada** (sin progreso: la interfaz no se rehace en este prompt).

---

# Parte N — El protagonista animado: de los dibujos del usuario a 114 fotogramas (Prompt 9)

> **Estado, sin letra pequeña.** El protagonista **se mueve de verdad**: cada uno de sus 18 clips tiene entre 4 y 9 fotogramas distintos, hechos **moviendo los píxeles de tus dibujos** (la hoja `art/player/source/hero-sheet.png`, guardada bit a bit) con una deformación rígida y suave guiada por unos pocos puntos de control; **ningún píxel de ningún fotograma está dibujado, recoloreado ni suavizado**. Eso tiene un límite que no se esconde: **un dibujo solo se puede deformar, no se puede mirar desde otro lado**. De los 18 clips, **9 tienen un dibujo tuyo de esa misma acción** (se mueven, no se re-dibujan) y **9 son *stand-ins***: el movimiento es real, pero el dibujo es el de **otra** acción, porque la hoja no tiene uno para esta. `npm run assets:missing` sigue contándolos como **no entregados**. El detalle, clip por clip, es N.4; lo que falta, N.9.

## N.1 La pregunta, y por qué no hay otro camino

La regla del encargo es absoluta: **tus imágenes son la autoridad** (diseño oscuro, proporciones estilizadas, acentos azul/cian, la espada en la mano derecha), y **mover, girar, escalar o «parpadear» un sprite quieto no es animarlo**. La hoja trae **una pose por acción** sobre fondo casi blanco: 12 poses, de las que **9 se pueden separar limpiamente** (1 de pie, 2 de pie en tres cuartos, 3 la carrera, 4 subiendo, 5 cayendo, 6 el aterrizaje, 7 el tajo bajo, 11 golpeado y 12 la espada en alto) y **3 no** (8, 9 y 10: el rojo es parte del dibujo: la espada y su arco, las llamas, la estela). Lo que se evaluó:

| Camino | Veredicto |
|---|---|
| Dibujar o re-dibujar fotogramas con código (polígonos, trazos, «completar» lo que falta) | **Descartado por la regla**: sería inventar un personaje que no es el tuyo. |
| Generar imágenes con un modelo | **Descartado**: no hay uno en el entorno, y aunque lo hubiera reinterpretaría el diseño. |
| **Recortar el dibujo en piezas** (brazo, pierna, cabeza) y girarlas | **Descartado**: los dibujos son una imagen plana; lo que una pieza tapa (el hombro bajo el brazo, el muslo bajo la capa) **no está en la imagen** y habría que inventarlo al moverla. Solo vale para **una** pieza: la hoja de la espada (N.5), que está **sobre el fondo transparente**. |
| Mover/girar/escalar el dibujo entero, o hacerlo «respirar» con un `scale` | **No es animar** (lo dice el encargo). Se usa solo como una parte del movimiento, nunca como el movimiento. |
| **Deformación rígida por puntos de control** (*puppet warp*) de **tus** píxeles, más una capa rígida para la espada, más **secuenciar tus propios dibujos** (la carrera después del salto…) | **Elegido**: mueve los píxeles que hay y **no inventa ninguno**; una región conserva su forma al moverse; lo que no se pide mover queda quieto. |

Sale de ahí lo que **no se puede hacer**, y se dice ya: **no hay cruce de piernas** al andar (el dibujo no tiene una pierna delante de la otra en otra fase del paso), **no hay una mano que se abre**, ni una espalda, ni una cara de perfil por el otro lado, ni una pose nueva (agacharse, morir): para eso hace falta el **dibujo**, y es lo que piden los 9 *stand-ins*.

## N.2 El método, de abajo arriba

| Módulo | Qué hace | Qué garantiza |
|---|---|---|
| `tools/assets/warp.ts` | **El *puppet warp***: mínimos cuadrados móviles **rígidos** (Schaefer, McPhail y Warren, 2006; α = 1.5), calculados **hacia atrás** —para cada píxel del fotograma, de qué punto del dibujo viene— sobre una rejilla de las esquinas de cada píxel, con interpolación bilineal premultiplicada y un promedio de 3 × 3 muestras por área. Transformaciones afines (`about`, `compose`, `invert`) | **Con ningún punto movido es la identidad** (el fotograma en reposo **es** el dibujo); un punto que se pide en un sitio **va exactamente ahí**; un movimiento rígido de todos los puntos se reproduce rígido (nada se dobla); un desplazamiento en píxeles enteros **no pierde ni inventa nada**; lo transparente sigue siendo negro transparente (**sin fleco ni halo**); y la media escala del juego (×0.5) **equivale a promediar por área** (error medio < 6 sobre 255 frente a la media de bloques). Determinista: mismos puntos, mismos píxeles |
| `tools/assets/heroRig.ts` | **El rig**: puntos de control por dibujo, **grupos jerárquicos** que se mueven juntos (cuerpo → cabeza → antenas; cuerpo → brazo → espada; piernas, capa), su **pivote** (y un `pivotCcw`: una bisagra gira sobre la esquina en la que cierra, no se abre un hueco), una escala por dibujo, **anclas** que siguen a su grupo, los ojos (que un fotograma puede atenuar: solo la muerte), **`ground`** (apoya el píxel más bajo sobre el pivote) y **capas rígidas** | Los puntos que un fotograma no mueve son **clavos**: lo que está cerca queda donde estaba (la cabeza sube sin que los pies se enteren). Cada fotograma sale en el **lienzo común** con los pies sobre el pivote |
| `tools/assets/heroClips.ts` | **Los clips**: qué dibujo es cada fotograma y cuánto se mueve cada grupo (una respiración es un coseno; un vaivén se retrasa respecto a lo que lo sostiene) | Datos de movimiento, **ninguna imagen** |
| `tools/assets/heroAnimation.ts` + `animate-cli.ts` | **La parte pura y la herramienta**: cortan los dibujos de la hoja (`poses.ts`, solo fondo transparente), los mueven y escriben los fotogramas y el manifiesto. Comprueba el **margen** del lienzo (≥ 4 px) en cada fotograma | `npm run assets:animate` regenera; **`-- --check`** dice si lo versionado es lo que la hoja, el rig y los clips producen (tolerancia de 3 por canal: otro motor de coma flotante puede redondear distinto); la hoja se comprueba contra su hash SHA-256 |

**Los datos que decide una persona** son archivos, no código: `art/player/source/hero.poses.json` (qué rectángulo es qué dibujo: extracción, nada más) y `art/player/source/hero.rig.json` (dónde están las partes de cada dibujo: **puntos medidos sobre el dibujo** con una cuadrícula, y se comprueban mirando el resultado en `?lab=player` y con las hojas de contacto). **Cómo se mueven** está en `heroClips.ts`.

**Lienzo:** 280 × 230 px, los pies en el pivote (120, 192), **65 px de arte por metro** (130 px/m del dibujo × 0.5): el contrato del *sprite* no cambia (`frameSize`, `pivotPx`, `artPxPerMeter`, `height 1.7`, `missingClips 'placeholder'`). Los fotogramas **se calculan a la escala del juego** (no se reducen después): lo que el atlas guarda es lo que se dibuja, sin remuestrear en pantalla.

## N.3 Qué sale del dibujo, y lo que se comprueba que no cambia

- **Cada píxel de un fotograma es un píxel (o el promedio por área de unos pocos) del dibujo del usuario**, tomado de donde la deformación dice que estaba. La deformación es **local y rígida**; solo se estira **el espacio entre puntos de control**. `warp.test.ts` y `heroRig.test.ts` lo fijan en pequeño (identidad, el punto va donde se pide, píxeles enteros sin pérdida, lo transparente sigue transparente, una pieza cortada es una **partición** del dibujo: cada píxel está en una sola mitad, sin cambio).
- **Los originales no se tocan** (`heroAnimation.test.ts`): la hoja y el retrato **son** lo que se entregó (su hash), y **donde un dibujo cortado de la hoja es sólido, su color es el de la hoja, al bit**: nada se pintó, recoloreó ni suavizó. Con la pieza cortada en reposo el fotograma es el dibujo entero (no se cortó nada: `heroRig.test.ts`), y los clips que se apoyan en el suelo **tienen los pies sobre el pivote en todos los fotogramas**, sin tocar el borde del lienzo.
- **Cada clip está de verdad en movimiento** (`heroAnimation.test.ts`): el par de fotogramas **más distinto** de un clip es una parte buena de la imagen —no hay un clip que sea un fotograma repetido ni uno que solo se corra de sitio— y **un bucle cierra sin salto** (del último fotograma al primero).
- **Los ojos** (la parte más reconocible del diseño) **no cambian de tamaño ni de color**: un fotograma solo puede **atenuarlos** hacia el oscuro de la cara, sin tocar nada fuera del ojo (`heroRig.test.ts`), y lo hace **únicamente `death`** (hasta 0.95). Medido sobre los 114 fotogramas (`heroAnimation.test.ts`: el diámetro del ojo grande y su color en cada fotograma frente al primero de su clip): el diámetro varía **≤ 5 % dentro de cada clip en 15 de los 18** y **≤ 9.2 %** en los dos golpes de embestida (`attack1` y `crouchAttack`, que encogen y estiran el cuerpo), y el color deriva **≤ 6.4 sobre 255**.
- **La espada es la del dibujo**: la hoja **mide lo que mide en el dibujo** en cada fotograma de los cuatro golpes, la punta está **sobre la hoja** y el agarre es la mano (`heroAnimation.test.ts`); no se acorta, no se redibuja, no se recolorea.
- **El diseño se compara en los tres aspectos**: `?visual=placeholder`, `?visual=art` y `auto` dan **la misma simulación bit a bit** (`player-art` sección D y `player-anim` sección F: el mismo guion con las tres pieles, serializado tick a tick y comparado).

## N.4 Los 18 clips

`fps` = ritmo cuando el clip corre por tiempo; los golpes y el *cast* **no corren por tiempo: los pinta la simulación por fases** (cada fase dibuja **sus** fotogramas; la espada está en alto antes de caer). «Dibujo» es el de la hoja que se mueve.

| Clip | Fotogramas · fps · tipo | Dibujo | Qué se mueve | Estado |
|---|---|---|---|---|
| `idle` | 8 · 8 · bucle | 1 de pie | respira: el pecho sube, la cabeza lo sigue **un compás después**, las antenas se balancean | **con dibujo propio** |
| `walk` | 8 · 16 · bucle | 2 de pie en tres cuartos | cada pierna se levanta y avanza por turnos mientras la otra se apoya y se desliza hacia atrás, el cuerpo sube al juntarse los pies y baja al separarse, la cabeza y las antenas **arrastran un compás detrás**, la capa se estira | **con dibujo propio**; **sin cruce de piernas** (N.9) |
| `run` | 8 · 20 · bucle | 3 la carrera | la pierna de atrás bombea de estirada a recogida y la de delante le responde (**nunca se cruzan**), el cuerpo sube y baja **dos veces por zancada**, la cabeza y las antenas arrastran, la capa ondea | **con dibujo propio** |
| `jump` | 6 · 14 · una vez | 4 subiendo | el impulso **aplasta y estira** la figura y luego vuela: los miembros se arrastran y se balancean, la placa y la capa aletean, las antenas se retrasan respecto a la cabeza | **con dibujo propio** |
| `fall` | 4 · 12 · bucle | 5 cayendo de cabeza | las antenas y las púas **ondulan al viento**, el cuerpo oscila y «respira» con la velocidad | **con dibujo propio** |
| `land` | 4 · 24 · una vez | 6 la agachada de aterrizaje | llega el peso: se aplasta sobre las piernas, la cabeza se hunde y las antenas se abren, y vuelve a la agachada | **con dibujo propio** (extra: no es de los 15) |
| `attack1` | 7 · 28 · una vez · fases 0–1 / 2–3 / 4–6 | 7 el tajo bajo | **la hoja es una pieza rígida que gira sobre la empuñadura** (N.5): levantada detrás mientras el cuerpo se encoge (anticipación), baja por el corte mientras la figura se lanza (activa), sigue de largo y vuelve al dibujo (recuperación) | **con dibujo propio** |
| `hurt` | 5 · 20 · una vez | 11 golpeado | llega el golpe: la figura es **lanzada un poco más lejos que el dibujo**, las antenas restallan, los miembros salen disparados; vuelve al dibujo y se asienta | **con dibujo propio** |
| `cast` | 7 · 14 · una vez · fases 0–2 / 3 / 4–6 | 12 la espada en alto (espejada, ×1.3) | la figura **se concentra** —se hunde, baja y recoge el brazo de la espada hacia dentro, pliega las antenas— y **suelta**: sube, el brazo y la hoja salen hacia arriba y delante, las antenas se abren, y se asienta | **con dibujo propio**; la hoja se mueve con el brazo (no es pieza rígida: se solapa con la cabeza) |
| `dash` | 4 · 24 · una vez | 3 la carrera | el dibujo de la zambullida de la carrera **lanzado hacia delante** | ***stand-in***: la pose del *dash* de la hoja es una estela roja, no una figura |
| `attack2` | 8 · 28 · una vez · fases 0–1 / 2–3 / 4–7 | 7 el tajo bajo | el primer tajo **al revés**: la hoja rígida gira para el otro lado | ***stand-in***: el segundo tajo de la hoja no se separa de su arco rojo |
| `aerialAttack` | 7 · 26 · una vez · fases 0–1 / 2–3 / 4–6 | 7 el tajo bajo | el tajo **con las piernas recogidas** | ***stand-in***: la hoja no tiene un tajo en el aire |
| `crouch` | 6 · 6 · bucle | 6 la agachada | el dibujo de aterrizaje **sostenido, respirando** | ***stand-in***: la hoja no tiene un agachado |
| `crouchWalk` | 6 · 14 · bucle | 6 la agachada | la agachada **avanza** a pasitos | ***stand-in*** (extra) |
| `attackCrouch` | 7 · 26 · una vez · fases 0–1 / 2–3 / 4–6 | 7 el tajo bajo | el primer tajo **bajado sobre las piernas** | ***stand-in***: la hoja no tiene un tajo agachado |
| `death` | 9 · 12 · una vez | 11 golpeado | el dibujo del golpe **cae hasta el suelo** (apoyado: el píxel más bajo en el suelo) y los ojos se **apagan** | ***stand-in***: la hoja no tiene una muerte |
| `drink` | 6 · 15 · una vez | 1 de pie | el dibujo de pie hace el **gesto** (sin botella: «no hay un dibujo de una botella; la luz de la poción es la del efecto») | ***stand-in***: la hoja no tiene beber |
| `interact` | 4 · 20 · una vez | 1 de pie | el dibujo de pie **se inclina y asiente** («no se inventa una mano que alcanza») | ***stand-in***: la hoja no tiene interactuar |

**Cuentas:** 114 fotogramas (113 guardados: el empaquetador deduplica uno idéntico); **9 de los 18 clips con dibujo propio, 9 *stand-ins*** (los 8 de siempre más `crouchWalk`, que es extra). De los **15 clips de la entrega**: **7 con dibujo propio y 8 *stand-ins*** (los mismos números del Prompt 8, **pero ya ninguno es un fotograma quieto**). El manifiesto lleva la etiqueta `stand-in` y **un comentario con el porqué** en cada uno, y `npm run assets:missing` dice: *«Delivered: 7 of 15 clips of its own. 8 more are made by moving ANOTHER action's drawing»*.

## N.5 La espada

- **Una pieza rígida** (`layers.blade` del rig del tajo): el polígono de la espada **sobre el fondo transparente** del dibujo 7 se corta (los píxeles del propio dibujo cuyo centro cae dentro: una **partición**, no se rellena nada), gira **entera** sobre la empuñadura y se pone **por encima** del resto. Una hoja **no se dobla, gira**: un primer intento con el *warp* solo la dobló como una serpiente y se descartó. Gira sobre **la esquina de la bisagra** en la que cierra (`pivotCcw`), y si el grupo no se mueve la capa se salta (el fotograma sale **exactamente** como el dibujo).
- **Las anclas siguen al grupo que las lleva**: `hand_r` y `weapon_grip` al brazo; `weapon_tip`, `hit_origin` y `vfx_origin` a la hoja. Por eso la punta está donde se ve la punta en **cada** fotograma de cada golpe. **Medido en el juego** (`player-anim`, cada *tick* de los cuatro golpes: primero, segundo, en el aire y agachado): el agarre está a **≤ 0.04 m de la mano** (la regla del contrato); el primer golpe **baja** (la punta está **> 0.5 m más alta en la anticipación que en el corte**) y el segundo **sube** (> 0.4 m de la anticipación al corte).
- **Los golpes con dibujo ajeno** (`attack2`, `aerialAttack`, `attackCrouch`) llevan la espada del **mismo** dibujo y las mismas anclas, así que **la espada sigue en la mano derecha** en los cuatro. El *cast* mueve el brazo del dibujo 12 con el *warp* (la hoja solapa la cabeza, no se puede cortar sin inventar lo que tapa).
- **La hitbox y los efectos no se tocaron**: el corte de la espada (VFX) sale de `vfx_origin` y la zona de daño es la de `combat/`, **que no cambia**; el dibujo del golpe sigue sin coincidir del todo con la caja (L.4).

## N.6 Cómo lo reproduce el motor (sin cambiarlo)

**El motor no cambió**: `SpriteAnimator`, los estados, las fases, las anclas por fotograma, `deriveAnimation`, el cambio de piel y el *fallback* son **los de siempre**. La única línea nueva es un gancho de pruebas (`window.__troid.advanceAnimation`: el reloj de animación sigue al tiempo real y está **quieto** mientras el juego está en pausa o en *hit-stop*, así que una prueba lo avanza a mano). Las propiedades que se midieron:

- **Qué clip pinta cada estado**: el suyo (`resolveClip(def, state).state === state`), **nunca un *fallback***; `attack` se llama `attack1` en el clip, `aerialAttack` y `crouchAttack` son alias de `attackAir` y `attackCrouch`; `auto` **nunca** enseña el *placeholder* (todas las poses son arte).
- **Los pasos siguen al suelo**: la marcha escala su ritmo con la velocidad (media velocidad = media cadencia, con el tope del motor de ½ a 1½ del ritmo del clip) y un ciclo dura 0.5 s en `walk` (16 fps, 8 fotogramas: un paso, 0.25 s) y 0.4 s en `run` (20 fps: un paso, 0.2 s). Como las piernas son **una sola capa** (no se cruzan), los pies **resbalan un poco** sobre el suelo a velocidad plena: la cadencia se subió para que lo disimule, no lo arregla (N.9).
- **Los golpes los pinta la simulación**: un golpe de 4/3/8 *ticks* (anticipación / activo / recuperación) enseña los fotogramas de **cada fase** en orden y **cada fotograma se ve al menos un tick**; la espada está en alto **antes** de caer; el último fotograma se queda hasta que el estado termina. El **cast** (6/1/8) igual, con **un** fotograma de fase activa.
- **Las acciones de una vez** (`jump`, `land`, `dash`, `hurt`, `death`, `drink`, `interact`) **empiezan en su primer fotograma, no vuelven atrás, se quedan en el último y tardan lo que dice su clip**: el *dash* **0.167 s** (los 10 *ticks* del juego), el aterrizaje **0.167 s**, beber **0.4 s**, interactuar **0.2 s**, morir entre 0.6 y 1 s.
- **Los cambios de estado son cortes**: el animador no mezcla (decisión del motor desde el Prompt 4); entre dibujos distintos hay un **cambio de pose**, no una transición. Se midió con una hoja de «fantasmas» (`docs/img/prompt9/transitions-cuts-between-clips.png`) que **no hay un salto grosero de posición ni de tamaño en ningún corte** (los pies se quedan sobre el pivote; el centro de masa se alineó entre `idle` y `walk`), pero **las diferencias de dibujo se ven**: la cabeza de un dibujo y la del siguiente no miden lo mismo (±15 %) y el motor no lo suaviza.
- **La orientación** sale de `ActorSprite` (espejo según `facing`): los dibujos miran a la derecha y el espejo mueve píxeles sin cambiar ninguno.
- **Sin latencia táctil**: el dibujo es **una consecuencia** del estado, nunca una causa. Un toque no espera a nada de esto: la simulación avanza antes de pintar y **el mismo guion con cualquier piel da la misma simulación bit a bit**.

## N.7 Presupuestos y coste, medidos

| | Prompt 8 | Prompt 9 |
|---|---|---|
| Fotogramas del héroe | 16 (8 distintos) | **114 (113 guardados)** |
| Página de atlas | 1 de 1627.5 KB descomprimida, **339 KB** de PNG | 1 de **1344 × 1344**, **7056.0 KB** (7.0 MiB) descomprimida, **1.76 MB** de PNG (el mejor filtro por fila y *deflate* al nivel 9: no hay una vuelta fácil más) |
| JavaScript del arranque en frío | 195.8 KB gz | **195.8 KB gz (igual)**; chunks cosméticos 41.1 KB; primera sesión 236.9 KB |
| PNG que espera la primera imagen | 2746 KB | **4135 KB** (siete archivos) |
| Presupuesto de memoria de la zona | 32 MiB | **40 MiB** (`MEMORY_BUDGET_MIB`; arranque 24 y residente 96 **sin cambio**) |
| Memoria del arte residente en cada sala | R1 23.7 · R2 29.5 · R3 27.4 · R4 30.6 MiB | **R1 29.0 · R2 34.8 · R3 32.7 · R4 35.9 MiB** |
| Llamadas de dibujo (peor momento de cada escenario) | desarrollo ≤ 25 · producción 23 | **desarrollo 25 y producción 23–25** (la partida aleatoria `soak`, con 300 partículas: tres ejecuciones aisladas en producción dieron 23 y la cadena completa, 25; entre ejecuciones varía en ±2); el jefe y el final, 22; las salas, 13–20; el héroe es **una sola página** de atlas, igual que antes |
| Arranque en frío con la red a 600 KB/s (60 ms de latencia) | 6.4–7.8 s hasta que el telón se levanta | **8.8–10.0 s** (tres arranques; siempre con el arte puesto —`data-boot="art"`—, no por el tope; el peor roza los 10 s del tope del telón) |

**Por qué el presupuesto de zona subió a 40 MiB:** el héroe pasó de 1.6 a 7.0 MiB decodificados (**+5.3 MiB**: siete veces más fotogramas), y R2 con el héroe **superaba** los 32 MiB (34.8). Lo que se hizo es lo que dice el contrato de memoria: **proponer** el presupuesto nuevo con su motivo (el comentario de `MEMORY_BUDGET_MIB`) y no esconder el exceso; el peor caso (R4, 35.9 MiB) sigue **por debajo** del nuevo. La memoria es **GPU/RAM del dispositivo** y **no se ha medido en un teléfono real**: 7 MiB para el protagonista es una decisión que un iPhone o un Android de gama baja debe confirmar.

**El coste que sí se paga y se dice:** el atlas del héroe pesa **1.4 MB más** y **va en el camino crítico del arranque** (el telón no se levanta hasta que el arte de la primera sala está dentro, §M.16). En una red rápida no se nota (el primer cuadro con arte llega a los ~2.3 s en local); con la red a 600 KB/s **se alarga unos 2.3 s** (de 6.4–7.8 a 8.8–10.0 s) y roza el tope de 10 s del telón (si lo pasara, el juego empezaría como *blockout* y se vestiría al llegar el arte: es el comportamiento previsto, no se ha visto). Lo que **no** se hizo es partir el atlas del héroe en dos (los clips raros, cargados después): **el motor no sabe vestir un *sprite set* con arte que llega a trozos** y eso es una decisión de arquitectura que este encargo no autorizaba; es lo primero que habría que hacer si el tiempo de arranque importa (N.9).

## N.8 Herramientas y pruebas

- `npm run assets:animate` (regenera) · `npm run assets:animate -- --check` (¿es lo versionado lo que producen la hoja, el rig y los clips?) · después `npm run assets:pack`. **Un clip dibujado a mano** se declara en `delivered` de `hero.rig.json`: el generador no lo hace, no borra sus archivos y conserva su entrada del manifiesto tal cual (guía de entrega §4).
- `?lab=player&look=art` (un clip cada vez, con anclas, espada, escala y las cuatro cajas) y `?lab=art-stress` (la memoria y las llamadas de dibujo con todo el arte).
- **Pruebas unitarias nuevas** (40; se retiraron las 11 de `heroFrames`): `warp.test.ts` (8: identidad, el punto va donde se pide, movimiento rígido, píxeles enteros, determinismo, transparencia, media escala, transformaciones), `heroRig.test.ts` (9: la pieza cortada es una partición, la hoja gira sin doblarse, `over`/`under`, la figura tumbada, las anclas, los ojos), `heroAnimation.test.ts` (11: **los originales intactos**, los dibujos son los píxeles de la hoja al bit, los 18 clips, **el ojo conserva su tamaño y su color**, cada clip en movimiento, los pies sobre el pivote, **la espada en la mano**, las fases de un golpe, la duración de cada clip, los *stand-ins* declarados, **lo versionado es lo que producen la hoja, el rig y los clips**), `animate.test.ts` (4: la herramienta sobre una copia —escribe, desviaciones, **un clip entregado a mano no se hace ni se borra**—) y `heroPlayback.test.ts` (8: el manifiesto que el juego descarga, **qué clip pinta cada estado**, la marcha, las acciones de una vez, **las fases de un golpe**, la duración de cada clip contra el *gameplay*).
- **E2E nuevo `player-anim`** (en desarrollo y producción): el héroe de verdad, con el arte del repositorio, en el navegador: de pie, andando, corriendo y girando · salto, caída, aterrizaje, *dash* · el primer golpe, el segundo, el golpe en el aire (fases de la simulación y la espada en la mano) · agachado, a gatas, golpe agachado · el *Spirit Bolt*, el golpe recibido, beber, morir, interactuar · las tres pieles y **un guion igual con cada una**.
- **Pruebas que se adaptaron** porque suponían un fotograma por clip: `artRepo.test.ts` (los clips con dibujo propio y los *stand-ins* se cuentan distinto), `missing.test.ts` (el texto de los *stand-ins*), `stressModel.test.ts` (el presupuesto de la zona), el escenario `room-art` (lee el presupuesto, no una constante) y `player-art` (sección E: «un fotograma del clip», no «el fotograma 0»).
- **Retiradas**: `tools/assets/heroFrames.ts`, `poses-cli.ts` y `heroFrames.test.ts` (`npm run assets:poses`): el Prompt 8 copiaba una pose por clip; `assets:animate` lo sustituye y `hero.poses.json` queda solo como la **extracción** de los dibujos.

- **Evidencia visual y trazas** (hojas de contacto, el diseño frente al fotograma, las tres pieles, la espada con las anclas, los cortes entre clips, 14 reproducciones reales y las trazas *tick* a *tick*): `docs/img/prompt9/` (ver [PROMPT9-LOG](PROMPT9-LOG.md), «Evidencia»).

## N.9 Lo que falta y lo que necesita revisión artística

1. **Dibujos propios para los 9 *stand-ins*** (`dash`, `attack2`, `aerialAttack`, `crouch`, `crouchWalk`, `attackCrouch`, `death`, `drink`, `interact`). Es lo que **separa esto de un protagonista terminado**: el movimiento está, el dibujo es el de otra acción (un agachado que es la agachada del aterrizaje sostenida, una muerte que es el golpe tumbado, un beber sin botella ni mano a la boca). **Quien dibujó la hoja** tiene que hacerlos: [deliver-protagonist-art](guides/deliver-protagonist-art.md) dice cómo (basta con **entregar los PNG de un clip** y quitar la etiqueta).
2. **El paso de la marcha.** Con un solo dibujo en tres cuartos no hay pierna delante de la otra: la zancada es **una pierna que se levanta y otra que empuja**, sin cruce, y los pies resbalan algo. Un ciclo de marcha **dibujado** (contacto, bajada, paso, subida: 4–8 poses de las piernas) lo arregla del todo.
3. **Los cortes entre dibujos.** Un salto es el dibujo 4, la caída el 5 y el aterrizaje el 6: tres figuras que miden lo mismo **solo aproximadamente** (la cabeza ±15 %) y el motor **corta**, no mezcla. Dibujar **un par de fotogramas de transición** (o pedir al motor un *crossfade* corto, que sería un cambio de motor) los suavizaría.
4. **Las partes ocultas.** Donde el dibujo no muestra algo (la mano izquierda, el otro costado, la espalda) **no se ve en ningún fotograma**: se mueve lo que hay. Un giro de cabeza, un parpadeo o una boca que habla **no son posibles** con estos dibujos.
5. **El peso de la hoja del héroe** (N.7): +1.4 MB en el camino crítico del arranque y 7 MiB decodificados; la salida buena es partir el atlas por frecuencia de uso (idle, marcha, salto y golpe primero; el resto, cuando el telón ya se levantó), que **necesita que el motor sepa completar un *sprite set* con arte que llega después**. Y la variante de **media resolución** del paquete (el contrato la admite; ninguno la tiene).
6. **No se ha visto en un dispositivo real.** Todo se midió en Chromium sin cabeza con GL por software: la fluidez a 60 fps con 114 fotogramas, la decodificación de una página de 1344² en un teléfono viejo y la **sensación** de las animaciones (el peso del golpe, el ritmo de la marcha) **necesitan ojos en un teléfono**. Lo que **sí** está medido es lo contable: qué fotograma se enseña en qué tick, cuánto dura cada clip y que la simulación no sabe nada de él.
7. **La espada.** Es la que dibujó el usuario y **no se ha tocado**: en el dibujo del tajo es **larga** (casi tan larga como la figura es alta) y el encargo la describe **pequeña**. Si el diseño la quiere más pequeña, lo decide quien posee el diseño y se **vuelve a dibujar**: acortarla con código sería cambiar el dibujo.

---

# Parte O — La recepción de los dibujos nuevos del protagonista (Prompt 10)

> **Estado, sin letra pequeña.** El Prompt 10 pedía **producir los dibujos que faltan**. **En el entorno no había ninguna herramienta de generación de imágenes** (solo ImageMagick y `ffmpeg`, que editan pero no inventan; ni GPU, ni credenciales de ningún servicio; los generadores de terceros que ofrece el catálogo de *plugins* no están activados y usarlos habría subido tus dibujos a un tercero sin que lo hubieras decidido). La regla del encargo es explícita —no sustituir lo que falta por polígonos, siluetas dibujadas con código ni más deformaciones de las mismas poses— y se ha cumplido: **no se ha dibujado nada y ningún clip ha dejado de ser un *stand-in*** (9 de los 18 siguen siéndolo, y `walk` sigue siendo un único dibujo deformado). Lo que sí se ha hecho es lo que hace falta para que, **el día que haya dibujos, entren en minutos y sin discutir nada**: el **kit** (qué dibujar, con qué referencias, con qué *prompt*) y la **herramienta de recepción** (recorta, escala, coloca, comprueba, enseña y, solo con tu aceptación, integra por `delivered`). Los dos están probados con lo único que hay: una hoja **de autoprueba** hecha con los fotogramas que el juego ya tiene, y la hoja real del usuario.

## O.1 Lo que falta, exactamente: 46 PNG en 10 clips

El orden de producción es el del encargo (A→J). Los nombres son los del *pipeline* (`CLIP_ORDER`): el encargo decía `attackAir` y `attackCrouch`; los clips se llaman `aerialAttack` y `crouchAttack` (el manifiesto acepta los dos nombres, pero el generador y `delivered` usan estos). Los fotogramas son `<clip>_NN.png`, 280 × 230, RGBA, transparente, pivote (120, 192), 65 px/m.

| | Clip | PNG | Fotogramas (papel) | Reloj | Hoy |
|---|---|---|---|---|---|
| A | `dash` | 3 | `dash_00` lanzarse · `01` estirarse · `02` frenar | 18 fps, 0.167 s (los 10 ticks del *dash*) | la carrera lanzada |
| B | `attack2` | 7 | `attack2_00` enroscarse · `01` carga · `02` el corte · `03` fin del corte · `04` seguir el golpe · `05` recuperar · `06` asentarse | 28 fps; fases 0–1 / 2–3 / 4–6 (3·3·11 ticks) | el primer tajo girado al revés |
| C | `crouch` | 2 | `crouch_00` asentada · `01` respiración | 2 fps, bucle | el aterrizaje sostenido |
| D | `crouchWalk` | 4 | `crouchWalk_00` contacto A · `01` paso A · `02` contacto B · `03` paso B | 10 fps, bucle (0.4 s) | la agachada «a pasitos» |
| E | `walk` | 6 | `walk_00` contacto A · `01` bajada A · `02` paso A · `03` contacto B · `04` bajada B · `05` paso B | 12 fps, bucle (0.5 s) | el dibujo 2 deformado (sin cruce de piernas) |
| F | `aerialAttack` | 6 | `aerialAttack_00` recogida · `01` preparación · `02` empieza el tajo · `03` el tajo · `04` seguir el golpe · `05` listo para caer | 26 fps; fases 0–1 / 2–3 / 4–5 (3·4·9) | el primer tajo con las piernas recogidas |
| G | `crouchAttack` | 6 | `crouchAttack_00` desde la agachada · `01` enroscarse · `02` barrido · `03` fin del barrido · `04` seguir el golpe · `05` asentarse | 26 fps; fases 0–1 / 2–3 / 4–5 (4·3·9) | el primer tajo bajado |
| H | `death` | 5 | `death_00` golpeado · `01` lanzado atrás · `02` cayendo · `03` impacto · `04` tumbado | 7 fps, una vez (0.71 s) | el golpe tumbado |
| I | `drink` | 4 | `drink_00` sacar · `01` alzar · `02` beber · `03` repuesto | 10 fps, una vez (0.4 s, el canal de 24 ticks) | de pie haciendo un gesto |
| J | `interact` | 3 | `interact_00` inclinarse · `01` tocar · `02` retirarse | 15 fps, una vez (0.2 s) | de pie, inclinado |

Cada fila tiene todo lo demás (descripción de cada pose en inglés y en español, límites de tamaño, qué dibujo del usuario sirve de referencia —y cuáles solo de actitud—, qué fija el juego) en `art/player/requests/requests.json`. **Los tiempos de los clips nuevos conservan la duración que el juego da a la acción** (`heroAnimation.test.ts` ya lo comprueba sobre lo versionado: cuando un clip se entregue, esa prueba lo comprueba también).

## O.2 El kit: `art/player/requests/`

Se escribe con `npm run assets:intake -- kit` **desde datos** (`requests.json` + tu hoja + los fotogramas del juego) y `kit --check` dice si lo versionado es lo que producen (hay una prueba): nadie edita un *brief* a mano. Contiene:

- **`README.md`** — los tres pasos, la tabla de los clips y lo que no se hace.
- **`character-reference.png`** — el tablero del personaje (los dibujos 1, 2, 7 y 12 de tu hoja, **recortados sin tocar**) para adjuntar a **toda** petición.
- **`<clip>/reference.png`** — el tablero del clip: tus dibujos que importan para él (los que no valen se rotulan «ATTITUDE ONLY» y se ven en rojo) y los fotogramas vecinos del juego, con rótulo.
- **`<clip>/brief.md`** — por qué hace falta, la tabla de fotogramas, qué fija el juego, la colocación, la espada, el tamaño, **el *prompt* listo para pegar (inglés, que es lo que leen los generadores, y su gemelo en español)**, el *prompt* negativo y los requisitos técnicos de integración.
- **`canvas-template.png`** y **`canvas-template-idle.png`** — el lienzo a 4× con el suelo, el pivote, las alturas de pie (1.7 m) y agachado (1.0 m) y el margen: guías de composición, **no arte**.

El *prompt* está escrito para **no inventar**: describe el diseño con lo medido en los fotogramas (cabeza ≈ 55–60 % de la altura, ojos con tres reflejos, antenas finas, paleta en hexadecimal), prohíbe lo humano, el rojo y todo efecto (el juego pone los suyos, cian) y pide una hoja con huecos anchos entre poses y **todas a la misma escala**.

## O.3 La recepción: operaciones técnicas, nada más

```
art/player/inbox/<clip>/sheet.png  (o un PNG por pose, o fotogramas ya de 280 × 230)
   │  npm run assets:intake -- <clip>
   ▼
cutSheet        la hoja → las poses: fondo transparente (el alfa, o lo que no es el color del borde), las piezas unidas por un radio (una
   │            antena o una hoja que no toca a la figura se queda con ella), las motas < 3 % descartadas; si no salen EXACTAMENTE las poses
   │            pedidas, error con lo que encontró y un dibujo (`segmentation.png`): no adivina dónde acaba una pose y empieza otra. Después, `extractPose`
   │            (poses.ts, el mismo recorte que ya se usó con tu hoja: sombras de suelo, líneas, rojo de efecto fuera, el borde suave sin resto de blanco)
   ▼
chooseScale     UN factor para toda la hoja: la mediana del ojo grande de sus poses → la del clip vecino del juego (`scaleLike`); si la cabeza
   │            gira y los ojos de la hoja discrepan mientras sus cabezas no (O.4.1), la mediana de la CABEZA → la de la cabeza del vecino
   ▼
placeFrame      escala y remuestrea UNA vez (el renderizador del Prompt 9, muestreo por área); el centro de masa del cuerpo (sin espada,
   │            antenas ni capa) en la columna 120; lo más bajo de la figura en la fila 192 (o el centro de masa a 1.0 m del pivote si el cuerpo está en el aire)
   ▼
judgeFrames     las medidas (O.5) → `ok` / `warn` / `fail` por fotograma y por clip
   ▼
contact.png · anchors-grid.png · report.md · report.json · frames/*.png      en art/player/inbox/_reports/<clip>/
```

**Lo que NO hace, nunca:** pintar, recolorear, redibujar, **espejar para fabricar una pose**, suavizar más allá del remuestreo de la escala, ni «arreglar» un dibujo que no se parece al personaje: **si no se parece, se pide de nuevo**. Módulos: `figure.ts` (lo que se puede medir de una figura: el ojo, el cuerpo, la limpieza), `intake.ts` (el recorte, la escala, la colocación, el juicio y las anclas: puro), `intakeReport.ts` (las imágenes y el informe), `intakeRun.ts` (los archivos: preparar, aceptar, estado), `heroRepo.ts` (dónde vive el protagonista), `kit.ts` y `bitmapFont.ts` (el kit y su tipografía de 5 × 7, sin ningún archivo de fuente ni programa de imágenes: los mismos bytes en cualquier máquina).

## O.4 La escala: por el ojo, y por qué no hay una constante

Una hoja generada trae su propio tamaño en píxeles; lo único del personaje que **no depende de la pose** es el **ojo grande** (un blob redondo cian y azul pálido **con sus reflejos blancos**). `eyeDiameter` lo mide con una apertura morfológica cuyo radio sigue el tamaño de la figura (las líneas finas de la armadura desaparecen, el ojo se queda) y exige que sea compacto, casi redondo y con reflejo; **se midió en los 114 fotogramas** y lo encuentra en todos menos en los cinco de la muerte donde la luz se apaga.

Lo que esa medición enseñó: **los dibujos del usuario no están a una escala común.** El ojo mide **25.1 px** en el idle, 24.2 en la marcha, 23.1 en la carrera, 20.3–22.0 en los tajos, 19.5 en la agachada, 18.7–19.4 en el aterrizaje y **16.9 en la caída** (en la hoja, 33.8–50.4 px según la pose). Por eso **no hay una constante**: cada clip nuevo se lleva a lo que miden los fotogramas del clip con el que se encadena en el juego (`scaleLike` en `requests.json`):

| Clip nuevo | se iguala a | porque |
|---|---|---|
| `dash` | `run` | se entra al *dash* desde la carrera |
| `attack2`, `aerialAttack` | `attack1` | misma familia de golpes con espada |
| `crouch`, `crouchWalk`, `crouchAttack`, `walk`, `drink`, `interact` | `idle` | la cabeza no cambia de tamaño al agacharse, y se entra y sale de ellos parado |
| `death` | `hurt` | se muere desde el golpe |

El factor es **uno por hoja**: las poses conservan los tamaños relativos que les dio quien las dibujó. Lo que se mide después, sobre los fotogramas ya hechos, es que **ninguna pose se aparte del ojo mediano del clip** más de ±14 % (aviso) o el doble (fallo): una pose dibujada a otra escala. Si el ojo no se puede medir (un generador que lo dibuja distinto), `--scale <k>` da el factor a mano.

### O.4.1 La cabeza que gira: cuando el ojo no mide el tamaño de la pose

El ojo solo mide el tamaño de una pose **mientras la cara mira de frente**. Cuando la cabeza se gira, cae o queda de lado, el ojo se ve más estrecho, más pequeño o desaparece, y una hoja entera de una caída —la primera pose de frente, las últimas con la cabeza vuelta— discrepa **consigo misma** aunque todas las poses estén dibujadas al mismo tamaño. Con la hoja real de `death` (Prompt 11) el ojo medía **41.6 · 35.0 · 31.2 · 24.3 · 25.8 px** (una dispersión del **33.5 %** respecto a la mediana) y la herramienta falló la primera pose «por haberse dibujado a otra escala»; además escalaba por la **mediana** de esos ojos, que es la de una cabeza ya vuelta, y la primera pose salía un tercio más grande que `hurt_00`, el fotograma que la precede en el juego. Ningún `--scale` lo arreglaba: la comparación es contra la mediana de la propia hoja y esa proporción no cambia con el factor.

Lo que **no** cambia cuando la cabeza gira es **la cabeza**. Este personaje es una cúpula enorme sobre un cuerpo pequeño: en toda pose lo más grueso es la cabeza (antenas, hoja, miembros y placas son más finas), así que `headDiameter` mide **el círculo más grande que cabe dentro de la figura** (con sus huecos rellenos; distancia exacta al exterior, una pasada lineal por eje) y da lo mismo gire como gire. Calibrado con los 114 fotogramas: **dentro de un clip la cabeza no se aparta de su mediana más del 8.5 %** (el salto; casi siempre menos del 4 %), y en la muerte de entonces —cinco de nueve fotogramas sin ojo medible— se mantiene en el **1.3 %**. La proporción cabeza/ojo de las poses de frente es **2.2–3.0** en los fotogramas del juego y **2.3–2.6** en las hojas nuevas: es el mismo personaje.

**La regla** (`scaleProxy`, una sola, con la misma tolerancia de siempre, ±14 %):

1. Si los ojos de la hoja **coinciden** entre sí (se ven en la mitad o más de las poses y ninguno se aparta de la mediana más de la tolerancia): **se mide por el ojo, como siempre** (`dash`, `drink` e `interact` de la Hoja 1 salen con **exactamente** la misma escala que antes: ×0.5336, ×0.6596, ×0.6794).
2. Si los ojos **discrepan** (o se ven en menos de la mitad) **y las cabezas coinciden** (ninguna se aparta de su mediana más de la tolerancia): la cabeza gira, no hay otra escala. La hoja se escala **por la cabeza** —la mediana de las cabezas de la hoja → la mediana de las cabezas de los fotogramas del clip vecino (`clipHead`)— y las poses se **juzgan por la cabeza** (aviso a > 14 %, fallo a > 28 %, el mismo criterio que tenía el ojo). El ojo se sigue midiendo y mostrando, pero no se juzga.
3. Si **ambas** discrepan, es una diferencia de escala real —se ve en las dos medidas—: **se mide por el ojo y falla**, como siempre. Nada pasa por «cabeza girada» solo porque convenga.

`--scale <k>` sigue ganando sobre la medición, y lo que se juzga sigue la regla. El informe lo dice (`Escala: ×0.5528 (por el tamaño de la cabeza: …)`, una columna **Cabeza (px)** y la mediana de las cabezas), igual que la hoja de contacto, la terminal y el comentario que `--accept` escribe en el manifiesto.

## O.5 Qué se comprueba, con qué umbrales — y qué NO se puede comprobar

Los umbrales están en una sola tabla (`LIMITS` en `intake.ts`), **calibrados contra los 114 fotogramas del juego**, que pasan con mucho margen (halo ≤ 1.2 %, piezas sueltas 0 %, rojo ≤ 0.45 % —el borde rojo oscuro de la espada—, color ajeno ≤ 0.07 %; `figure.test.ts` lo fija):

| Comprobación | Aviso | Fallo |
|---|---|---|
| **Halo** (borde suave gris pálido: el resto del fondo blanco) | > 6 % | > 15 % |
| **Piezas sueltas** (motas, una segunda figura) | > 0.4 % | > 2.5 % |
| **Rojo de efecto** en la figura (el personaje no tiene; los arcos de tus dibujos 8–10 son lo que hay que evitar) | > 1 % | > 3 % |
| **Color ajeno** (amarillo, verde, naranja, tonos de piel) | > 1 % | > 4 % |
| **Rojo en la hoja entregada** que el recorte deja fuera (una hoja o un miembro dibujado en rojo pierde su color) | > 2 % | — |
| **Escala entre poses** (ojo contra la mediana del clip; **la cabeza**, si la cabeza gira: O.4.1) | > 14 % | > 28 % |
| **Salto del centro de masa** entre fotogramas | > 0.55 m | > 1.2 m |
| **Tamaño** frente a lo que dice el encargo del clip | fuera | > 30 % fuera |
| **Margen** al borde del lienzo (contrato: ≥ 4 px) · la figura **no cabe** | — | sí |
| **Resolución**: la imagen entregada es más pequeña que los fotogramas (se agranda y se ve borrosa) | factor > 1 | factor > 2 |
| **Suelo**: lo más bajo de la figura queda más de 8 px bajo lo más bajo del cuerpo (una hoja o una mano baja de los pies: los pies pueden flotar) | sí | — |
| **Fotograma repetido** | sí | — |
| **Espada**: anclas en cada fotograma; hoja de 0.6 a 1.3 m (la del juego mide 0.93); empuñadura y punta a ≤ 4 px de la figura | — | cualquiera |
| **Intención del golpe** (con las anclas, en metros desde el pivote; `requests.json`, `intent`): el golpe que **SUBE** (`tipRises`: la punta sube ≥ N m entre la preparación y la fase activa), el que **BAJA** (`tipDrops`: el tajo en el aire, ≥ 0.4 m) o el que **AVANZA** (`tipAdvances`: la punta pasa de detrás del cuerpo a delante, ≥ N m hacia delante; es lo que pide hoy `attack2`, ≥ 1 m, y lo que comprueba el escenario E2E `player-anim`: O.10) | el tajo en el aire no baja | el golpe que sube no sube; el que avanza no avanza |

**Lo que la herramienta NO puede juzgar, y juzga una persona mirando `contact.png`:** que es **el MISMO personaje** (los ojos con sus tres reflejos, las antenas finas, la cresta, la armadura), que **no hay partes duplicadas ni miembros imposibles**, que **la espada está en la mano derecha**, que **la acción se lee** a tamaño de juego y que **no hay un diseño nuevo** (pelo, máscara, ropa). Por eso `--accept` solo acepta **lo que enseñó el último informe**: si la entrega cambió desde entonces (otra hoja, otras anclas), pide mirar de nuevo.

**`contact.png`** es la hoja de contacto comparativa del encargo: **1** los originales (tus dibujos, intactos, y los fotogramas vecinos del juego) · **2** cada pose nueva a ×2 sobre fondo oscuro (para que un halo claro se vea), con su veredicto en una banda de color y, en los golpes, la empuñadura (amarillo) y la punta (magenta) · **3** la secuencia a 1:1 sobre la línea del suelo y la columna del pivote, **contra la que el juego tiene hoy** · **4** el tamaño real de juego junto al clip vecino.

## O.6 La espada: las anclas

Los golpes (`attack2`, `aerialAttack`, `crouchAttack`) necesitan en cada fotograma `hand_r`, `weapon_grip`, `weapon_tip`, `hit_origin` y `vfx_origin` (el validador del contrato los exige). La herramienta no puede **ver** la hoja (es oscura y está pegada a un cuerpo oscuro), así que **una persona lee dos puntos por fotograma** —la empuñadura y la punta— sobre `anchors-grid.png` (cada fotograma a ×4 con una cuadrícula en píxeles del lienzo, cada 10 y rotulada cada 20) y los escribe en `art/player/inbox/<clip>/anchors.json` (`{"attack2_00": {"grip": [x, y], "tip": [x, y]}, …}`; la herramienta deja una plantilla). Ella calcula el resto **con las proporciones del rig del primer tajo**: la mano **es** la empuñadura, `vfx_origin` a 0.48 y `hit_origin` a 0.85 del camino hacia la punta, todo en metros desde el pivote (+x adelante, +y arriba). Y comprueba que cada punto cae sobre la figura y que la hoja mide lo que debe.

## O.7 Integrar: `--accept`

`npm run assets:intake -- <clip> --accept` se **niega** si hay un fallo (salvo los que una persona aceptó a propósito con su motivo: O.10), si lo que se acepta no es exactamente lo que enseñó el último informe (los *hashes* de los fotogramas, de las anclas y de los fallos aceptados), o si el clip **ya estaba entregado** (los dibujos aprobados no se sobrescriben: hace falta `--replace`, a propósito). Si acepta:

1. borra los fotogramas del *stand-in* (los del generador) y escribe los nuevos en `art/player/hero/`;
2. escribe la entrada del clip en `art/player/player.pack.json` (`frames`, `count`, `fps`, `loop`, `phases`, `tags` **sin** `stand-in`, `comment`) y, si lleva espada, las anclas de cada fotograma;
3. añade el clip a `"delivered"` en `hero.rig.json` (con una edición de texto: el resto del archivo, escrito a mano, no se toca);
4. **vuelve a ejecutar el generador** (que deja el clip en paz) y exige que `assets:animate --check` no encuentre **ninguna diferencia**;
5. pasa **las mismas comprobaciones que cualquier arte** (`buildArt` sin escribir: contrato del *sprite set*, espada, fases, escala…) sobre todo `art/`;
6. marca el clip como `delivered` en `requests.json` y reescribe el kit (el clip ya no se pide: su carpeta y su fila desaparecen);
7. archiva la hoja de la que salió, sus anclas, el ajuste de colocación, **los fallos que se aceptaron a propósito (`waivers.json`)** y el informe en **`art/player/source/delivered/<clip>/`** (lo versionado es producto de una hoja, no de una mano);
8. empaqueta `public/art/` (`npm run assets:pack`).

Si **cualquier** paso falla después de escribir el primer archivo, **se devuelven todos los archivos tocados a como estaban** (lo prueba un test que sabotea el generador). Las pruebas que describían el estado de los *stand-ins* (`heroAnimation`, `artRepo`, `heroPlayback`, el escenario `player-anim`) **leen ahora la lista `delivered` y el manifiesto** en lugar de contarlos de memoria: aceptar un clip no deja la batería en rojo.

## O.8 Probado, y con qué

Con lo único que hay —**no hay dibujos nuevos**—:

- **La hoja real del usuario** (`hero-sheet.png`, tres filas, sombras, líneas de velocidad, polvo y energía roja): `cutSheet(hoja, 12)` devuelve **las 12 poses, en el orden de la hoja, en 1 s**, y mide el ojo grande en las 12 (`docs/img/prompt10/cut-of-the-real-sheet.png`).
- **Una hoja de autoprueba** hecha con los fotogramas `attack2_00…06` **del propio juego** (los del *stand-in* del segundo golpe), ampliados ×3 sobre blanco con sombras de suelo: se recorta, se escala **por el ojo** (factor **0.3326** cuando la hoja se había ampliado ×3, es decir 0.3333: el 0.2 % de error de medir el ojo en una hoja grande y en un fotograma pequeño) y se coloca; las figuras reconstruidas coinciden con las originales con **IoU 0.93–0.97** tras alinear sus centros de masa, y la herramienta **avisa exactamente en los dos fotogramas donde la hoja de la espada baja por debajo de los pies** (la preparación, con la hoja cerca del suelo: 23 y 32 px bajo el cuerpo). **No es arte nuevo y la imagen lo dice:** `docs/img/prompt10/self-test-contact-sheet.png`.
- **Pruebas** (`figure.test.ts`, `intake.test.ts`: 42): el ojo y la calibración contra los 114 fotogramas; el recorte (orden, sombras, hoja transparente, poses que se tocan, fondo oscuro, PNG sueltos); la escala y la colocación; cada fallo hecho a propósito sobre un fotograma bueno (halo, rojo, mota, color ajeno, otra escala, no cabe, repetido, salto, espada); las anclas; la bandeja; `delivered` en el rig; y **una entrega entera en una copia del repositorio**: informe → rechazo sin anclas → rechazo si cambió → aceptación → el generador y las comprobaciones de arte no encuentran nada → archivo → se niega a sobrescribir → **reversión** cuando el generador falla.

## O.9 Lo que sigue, y lo que sigue sin resolver

1. **Los 46 dibujos.** Una generación por clip (10), con el `brief.md` de cada uno, adjuntando `reference.png`, `character-reference.png` y el retrato. Quien los genere puede ser un artista o un generador que acepte imágenes de referencia; **cualquier servicio de terceros recibiría tus dibujos, y eso lo decides tú**. Después, `npm run assets:intake -- <clip>` y mirar `contact.png`.
2. **Dos decisiones de diseño que el encargo no cierra.** (a) La hoja de la espada: en tus dibujos 7/8 el filo es **rojo** y en el 12 **cian**; los *prompts* piden el filo de la referencia (el del dibujo 7/12: lo que ya tiene el juego, con un borde rojo oscuro finísimo) y **ningún rojo de efecto**; si quieres el filo cian, hay que decirlo antes de generar. (b) La espada es **larga** en los dibujos (0.93 m) y el encargo la llama pequeña: acortarla con código sería cambiar el dibujo.
3. **La marcha (`walk`)**: es el único clip con dibujo propio que también se pide (6 poses de las piernas); la herramienta la recibe como cualquier otra y exigirá pies sobre la línea del suelo en cada pose.
4. **Nada visto en un dispositivo real.** La recepción no cambia el juego (el motor, el cargador, el atlas y las reglas son los del Prompt 9); cuando entren dibujos, el peso del atlas del héroe cambiará (PROMPT10-LOG §E: 95 fotogramas en vez de 114) y habrá que medirlo de nuevo.


## O.10 Lo que llega y no es exactamente lo pedido (Prompt 12): `waivers.json`, `delivery` y la intención «avanza»

Las Hojas 2 y 3 del usuario trajeron **menos poses de las pedidas** (5 en vez de 7 y de 6; 4 en vez de 6), **efectos cian pintados** que unen unas poses con otras, una pose **sin espada** donde el contrato la exige y un segundo golpe que **no sube**. El usuario pidió integrarlas igualmente. La recepción siguió negándose a aceptar lo que mide mal; lo que se añadió es **una forma explícita y archivada de aceptar una cosa concreta con su motivo**, nunca un umbral más bajo:

- **`art/player/inbox/<clip>/waivers.json`** — `{"<fotograma>:<comprobación>": "motivo", "<comprobación del clip>": "motivo"}`. Solo se puede aceptar un **fallo** y solo el que nombra; el motivo tiene ≥ 20 caracteres; **una excepción que no corresponde a ningún fallo se rechaza** (y dice qué fallos hay), para que una vieja no acepte en silencio lo que venga. El fallo pasa a **aviso** («FALLO ACEPTADO A PROPÓSITO»), el informe lo lista con **el motivo y lo que la herramienta decía**, **el hash del archivo entra en la huella del informe** (`--accept` solo acepta lo que el último informe enseñó) y el archivo se **archiva con la entrega**. Casos de la Hoja 2: `aerialAttack_05:sword` (la pose está dibujada sin espada a la vista: sus anclas son una estimación) y `attack2_01:loose`, `attack2_02:loose` (los arcos cian son píxeles del dibujo y no se recortan).
- **`delivery`** en `requests.json` (`{ asked: { frames, fps, phases }, note }`): el encargo de un clip que llegó distinto se **reescribe a lo que son los dibujos** (número de fotogramas, fases, límites) para poder juzgarlos, y `delivery` guarda lo que se pedía y en qué se aparta. Sale en el informe y en el README del kit (que, sin nada por pedir, lista lo entregado y sus diferencias).
- **`intent.tipAdvances`**: además de que la punta **suba** o **baje** entre la preparación y la fase activa, un golpe puede pedir que **avance** (la punta, medida desde el pivote hacia delante, ≥ N m). Es lo que pasó con `attack2`: se pedía un corte ascendente (el dibujo 8 del usuario, sin su arco rojo, leído como ascendente) y el segundo golpe que dibujó es un tajo bajo hacia delante (la punta de la hoja de delante pasa de −1.6 m a +1.4 m: avanza 3.0 m y sube 0.32). El escenario E2E `player-anim` pasó de «el segundo golpe sube > 0.4 m» a «**avanza > 1 m**».
- **Recortes que se solapan.** Una fila cuyas poses se tocan por los arcos (`attack2`) no se corta con `cutSheet` (se niega: no adivina): se entrega **un PNG por pose**, recortados de la hoja sin reescalar con rectángulos que pueden solaparse; lo de la vecina que cae dentro es, para la recepción, una pieza suelta pequeña y se descarta (`el recorte dejó fuera N pieza(s)`), y lo que está pegado a la figura se queda.
- **Las pruebas** no dependen ya de lo que pida hoy ningún clip entregado: un encargo fijo de siete fotogramas (`BLOW`) y una réplica del repositorio donde `attack2` pide eso. Detalle y números: [PROMPT12-LOG](PROMPT12-LOG.md).
