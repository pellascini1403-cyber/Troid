# Pipeline de arte 2D — cómo entra el arte al juego

> **Estado:** Prompt 7. Este documento se amplía **paso a paso** (S33 → S44). La **Parte A** es la **auditoría de S33**: cómo funcionaba el pipeline **antes de tocar nada** (es una foto histórica: lo que S35 cambió está marcado en ella y explicado en la **Parte C**). La **Parte B** es el contrato (S34) y la **Parte C** los atlas, la carga diferida y el presupuesto (S35). El resto —el visual intercambiable (D), la validación en el *build* (E), el protagonista (F), el laboratorio y R1 con el arte completo (G), VFX y audio (H), el entorno (I), el coste medido (J)— se añadió con cada paso, y la **Parte K** (S44) es el cierre: el *pipeline* entero de un vistazo, la lista de lo que hacer el día que llegue el arte, qué falta exactamente y qué no se ha medido. **El Prompt 7 está cerrado: el *pipeline* está listo y el arte del protagonista, no (0 de 15 clips).**
>
> **Aviso, sin letra pequeña:** **en el repositorio no hay arte real del protagonista** (ni de nada). Todo lo que se dibuja hoy sale de generadores procedurales (un atlas de *canvas*). Este pipeline existe para que, cuando llegue el arte real **del usuario**, entre **sin tocar el gameplay**. **No se ha generado, redibujado ni imitado el protagonista**, y nada de este documento lo hace (§A.12).

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
| **Capas de la escena** | `sky · world{ backdropFar, backdropMid, backdropNear, propsBack, terrain, actors, fxNormal, fxWorld(add), foreground, lightOverlay(add), debug } · screen` | `render/layers.ts` |

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
3. Si hay índice, el *chunk* `art-*.js` se pide **después del primer fotograma**, junto a los efectos (a los 2 s en reposo, o de inmediato con `?hooks=1`).
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

Veintiún disparadores (`VfxTrigger`), de siete familias que conoce un jugador y cuatro más:

| Familia | Disparadores → efectos | Evento de la simulación | Nace… |
|---|---|---|---|
| **tajo** | `slash` · `slashFinisher` → arco de la espada (3 capas) | `player:attackActive` (el tick en que el *hitbox* existe) | 0.8 m sobre los pies, **ajustado al *hitbox*** |
| **impacto** | `hitLanded` → chispas + destello + anillo | `combat:hit` (contra algo que no es el héroe) | en el punto de contacto |
| **daño** | `playerHurt` → esquirlas + destello | `player:hurt` | en el torso |
| ***dash*** | `dashStart` · `dashDust` · `dashTrail` → ráfaga, polvo y estela **a lo largo de la distancia recorrida** | `player:dashed` / `player:dashEnded` | pecho · pies · 0.85 m |
| **muerte** | `enemyDied` (tinta + motas + destello, **violeta/negro**) · `playerDied` (la energía se dispersa) | `actor:died` · `player:died` | 0.7 m · 0.9 m |
| **aviso** | `enemyTelegraph` → anillo + motas **violeta** | `enemy:telegraph` | 0.45 m |
| ***Spirit Bolt*** | `boltCast` · `boltImpact` · `boltEnd` | `skill:cast` · `combat:hit` de un proyectil · `projectile:ended` | la mano · el contacto · donde se acaba |
| botella · objeto · sello · jefe | `drinkStart/Heal` · `pickup` · `sealRejected` · `bossWake/Strike/Phase/Defeated` | `bottle:*` · `interaction:performed` · `seal:rejected` · `boss:*` | según el contrato |

Todo corre en **tiempo real** (un *hit-stop* congela el mundo, no las chispas), sale de **pools** (después del calentamiento no se crea ni un objeto: `stats.poolCreated` deja de crecer) y respeta el presupuesto por perfil (**150 / 300 / 400 partículas** y **24 / 40 / 64 efectos de *sprite***).

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

`checkVfxContract(defs, bindings)` dice, **con el disparador y el efecto**, qué regla se rompe; sobre lo que se publica da una lista vacía, y la prueba lo demuestra con **ocho pruebas de mutación** (vida de más, partículas de más, capas de más, paleta ajena, un disparador sin efecto o con uno que no existe, números rotos, topes que no caben en el presupuesto, un momento que desborda el perfil bajo).

## H.3 Cómo se sustituirá un efecto (tres niveles, de menos a más arte)

1. **Datos (hoy, sin código).** Un `VfxDefinition` de `content/vfx.ts`: tamaños, cuentas, vidas, colores, gravedad. `checkVfxContract` dice si sigue valiendo.
2. **La forma (cuando haya arte).** `VfxSystem` solo dibuja con **ocho formas** del `VfxAtlas` —`glow`, `spark`, `shard`, `ring`, `dust`, `ink`, `streak`, `arc`—, **máscaras blancas** que la paleta tiñe al dibujar (así el cian y el violeta siguen siendo **la identidad**, pongan lo que pongan en la imagen). Sustituirlas es dar otro `VfxAtlas` con el mismo contrato de formas: los mismos nombres, la orientación (`arc` se curva hacia +x, `shard` se dibuja a lo largo de +x, `streak` es horizontal) y **una sola página** (el `ParticleContainer` de Pixi comparte la fuente de la textura: una llamada de dibujo por modo de mezcla). Enganche: `createEffects({ atlas })`. **No está construido:** hoy el atlas se dibuja con código y cambiar su origen antes de tener el arte sería diseñar contra nada.
3. **Animación por fotogramas.** Un efecto que no es una máscara teñida sino una secuencia dibujada (un tajo de cinco fotogramas). Reglas ya fijadas: su **tiempo es el del dato** (se reparte en `life`, no en los fps del arte), nace en el **origen del contrato**, cuenta **como un *sprite*** del presupuesto y vive en un *pool*. **No está construido:** sin arte no hay cuántos fotogramas, ni si se tiñe, ni dónde está su pivote; cuando lo haya, se añade `kind: 'flipbook'` a `VfxDefinition` y `checkVfxContract` ya sabe medirlo.

**En ningún nivel cambia:** el evento, el origen, la vida, el presupuesto, los colores ni el *pool*. Y **nada del juego se entera**: el director es de la vista y la simulación no sabe que existe.

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
| `fxNormal` · `fxWorld` | mundo | 1 | normal · **aditiva** | tinta, humo, polvo · luz: proyectiles, tajos, el sigilo del sello | — · `seal` |
| `foreground` | mundo | **1.2** | normal | siluetas oscuras delante (más rápido que el mundo) | `foreground`, `decor` |
| `lightOverlay` | mundo | 1 | **aditiva** | haces sobre las salidas, objetos que flotan | `light`, `interactive` |
| `debug` · `screen` | mundo · pantalla | 1 · — | normal | `?debug=1` · viñeta, destellos, fundidos | — |

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

`npm run assets:missing` la imprime (`0 of 12 required pieces` hoy) con las salas que usan cada una; `--strict` falla mientras falte algo.

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
