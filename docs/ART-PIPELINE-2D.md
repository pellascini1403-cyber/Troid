# Pipeline de arte 2D — cómo entra el arte al juego

> **Estado:** Prompt 7. Este documento se amplía **paso a paso** (S33 → S44). La **Parte A** es la **auditoría de S33**: cómo funciona el pipeline **hoy**, medido y leído en el código, **antes de tocar nada**. Las partes siguientes (contrato, atlas, adaptador, validación, laboratorio, VFX, escenarios, rendimiento) se añaden con cada paso.
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
| `assets/spriteLoader.ts` | vista (Pixi) | `SpriteSetDefinition` → texturas: atlas **`procedural:<id>`** (canvas) o atlas **de archivo** (`<base><atlas>.json` + imagen) |
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
- **Conclusión de S33:** los assets reales del protagonista **no están disponibles** como sprites. El pipeline se prepara **completo** (contrato, cargador, validación, adaptador, laboratorio) y el *placeholder* abstracto sigue siendo la piel. Qué falta exactamente: [Parte E](#parte-e--qué-assets-reales-faltan-s38) (se escribe en S38).

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

*(Las partes B–G se añaden en S34–S43: contrato, atlas y carga, adaptador y *fallback*, validación, assets que faltan, laboratorio, VFX y audio, entorno, rendimiento.)*
