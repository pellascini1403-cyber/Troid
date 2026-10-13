# Cómo entregar el arte del entorno (y qué pide el mundo)

> **Estado (Prompt 8, fase D): R1, R2 y R3 ya se dibujan con imágenes.** El juego dibuja una sala con las imágenes de su paquete de entorno **cuando las tiene** (`RoomArtView`) y deja al *blockout* lo que no cubren. Las imágenes que hoy hay (`art/ruins-ground`, `art/ruins-back`, `art/ruins-light`, `art/ruins-roots`, `art/ruins-seal`) **no son de una mano**: las hace un **pintor** (`npm run art:build`, ART-PIPELINE-2D parte M) y son **provisionales**: necesitan revisión artística o sustitución. **Sustituir una pieza por arte hecho a mano es entregar un PNG con las mismas etiquetas** (§2): el juego no cambia.
>
> Esta guía dice **qué pide el mundo** y **cómo se entrega**. Para el detalle técnico: [ART-PIPELINE-2D.md](../ART-PIPELINE-2D.md) (partes I y M). Para el protagonista: [deliver-protagonist-art.md](deliver-protagonist-art.md).

## 1. Qué pide el mundo

No es una lista escrita a mano: **sale de los datos de las cuatro salas** (`R1`–`R4`), así que cambia sola cuando una sala usa un material nuevo. `npm run assets:missing` la imprime con lo entregado y lo que falta. Hoy son **14 piezas obligatorias** y 16 opcionales (entregadas por el pintor: 13 de las 14 obligatorias; falta la runa del Air Dash de R4):

| Pieza (`role`) | De qué (`material:` / `kind:` / `backdrop:`) | Partes (`part:`) — **obligatoria** en negrita | Dibuja | Salas |
|---|---|---|---|---|
| `solid` | `stone`, `earth` | **`fill`**, `cap` (borde superior), `edge-l`, `edge-r` | el suelo, las paredes y los bloques | R1–R4 |
| `platform` | `wood` | **`body`**, `cap-l`, `cap-r` | las plataformas que se atraviesan saltando | R1–R3 |
| `door` | `gate`, `seal` | **`body`**, `top`, `bottom`, `glow` (la luz del sello: un dibujo suave, aditivo, ajustado a toda la puerta) | las puertas (se **disuelven** en 0.6 s cuando se abren) | R1, R3, R4 |
| `hazard` | `spikes` | **`cell`** | las espinas | R2 |
| `backdrop` | `ruins` | **`far`**, **`mid`**, **`near`** | el fondo en tres capas de paralaje | R1–R4 |
| `foreground` | `ruins` | `strip` | siluetas oscuras delante de la acción | R1–R4 |
| `interactive` | `rest` (santuario), `pickup` (con `variant:bottle`, `variant:card` o `variant:rune`) | **una imagen** por clase y variante | lo que se puede tomar o usar | R2–R4 |
| `seal` | — | **una imagen** | el sigilo que el héroe debe golpear | R3 |
| `light` | — | una imagen | el haz de luz sobre cada salida | R1–R4 |
| `decor` | — | una imagen por objeto | objetos que no chocan con nada: **los coloca una escena** (§6), en cualquier capa | R1–R3 (sus escenas) |

## 2. Cómo se declara

Un paquete de categoría **`environment`** en `art/` (índice y manifiesto: [ART-PIPELINE-2D §B](../ART-PIPELINE-2D.md)), con `"load": "zone"` y las salas en `zones` (se descarga mientras el fundido las tapa). **Un *sprite* por pieza**, y cada uno **dice qué dibuja con sus etiquetas** (`tags`):

```jsonc
{
  "manifestVersion": 1, "id": "ancient_forest", "category": "environment", "status": "provisional",
  "sprites": [
    { "id": "stone_fill", "artPxPerMeter": 64, "pivot": [0, 0], "height": 1,
      "tags": ["role:solid", "material:stone", "part:fill"],
      "clips": { "idle": { "frames": "stone_fill_", "count": 1 } } },
    { "id": "ruins_far", "artPxPerMeter": 64, "pivot": [0, 1], "height": 8,
      "tags": ["role:backdrop", "backdrop:ruins", "part:far"],
      "clips": { "idle": { "frames": "ruins_far_", "count": 1 } } }
  ]
}
```

| Regla | Por qué | Si no se cumple |
|---|---|---|
| **Un `role:`** de la tabla, **el sujeto** que ese rol pide (`material:`, `kind:` o `backdrop:`) y **una parte** (`part:`) si el rol las tiene | para saber **qué dibuja** cada imagen sin adivinar por el nombre | **error** (el *build* se para) |
| **El pivote donde empieza la repetición:** `[0, 0]` (esquina superior izquierda) para `solid` y `platform`; `[0, 1]` (abajo a la izquierda) para `door`, `hazard`, `backdrop` y `foreground`; `[0.5, 1]` (los pies) para `decor`, `interactive` y `light`; `[0.5, 0.5]` para `seal` | es el punto del mundo donde se coloca la imagen | **error** |
| **Un clip `idle`** (una imagen quieta es un `idle` de un fotograma; un farol que parpadea, un `idle` de varios) | es el clip que todo set tiene | **error** |
| **Prefijo de fotograma único** en todo el paquete (`stone_fill_00`, no `idle_00`) | un paquete nombra cada fotograma una vez | **error** |
| **Una sola escala por familia** (`artPxPerMeter`): las piezas que se **encuentran** (suelo, muros, plataformas, puertas, *props*) comparten malla de píxeles; cada capa de *parallax* y la luz son su propia familia | las piezas de un sitio comparten rejilla de píxeles, o sus costuras no encajan; una capa lejana no se encuentra con otra | aviso |
| Dos *sprites* para la misma pieza | solo se puede dibujar una | aviso |
| Faltan piezas **obligatorias** que el mundo pide (juzgado sobre **todos los paquetes de entorno juntos**) | el *blockout* las dibuja en su lugar | **error** si el paquete es `final`; **aviso** si es `provisional` (lo normal mientras llega el arte) |

`npm run assets:check` (y por tanto `npm run build`) las comprueba **sin abrir un navegador** y dice la ruta y qué hacer.

## 3. Cómo se rellena un rectángulo (la regla de repetición)

**El rectángulo de la sala es la verdad y el arte se recorta a él, nunca al revés.** Los bloques del juego no están en una rejilla (un bloque de 1.4 × 1.1 m es normal), así que:

- **`solid`**: la pieza `fill` se repite desde la **esquina superior izquierda**, en celdas enteras; la última columna y la última fila se **recortan** a lo que queda (jamás se estiran ni se escalan). `cap` va en la fila de arriba, `edge-l`/`edge-r` en las columnas de los lados.
- **`platform`**: `body` se repite a lo largo; `cap-l` y `cap-r` cierran los extremos; el grosor es el de la imagen.
- **`door`**: `body` se repite hacia arriba desde el suelo y se recorta arriba; `top` y `bottom` rematan.
- **`hazard`**: `cell` se repite a lo largo de la zona, desde su suelo, al tamaño que diga el arte.
- **`backdrop`/`foreground`**: tiras **sin costura** horizontal que se repiten sobre toda la anchura de su capa (§4).

## 4. Capas y paralaje

| Capa (de atrás adelante) | Factor | Tira mínima en R1 (115 m) | Qué lleva |
|---|---|---|---|
| `backdropFar` | **0.15** | 65 m | la lejanía: neblina, cordilleras |
| `backdropMid` | **0.4** | 94 m | troncos, copas |
| `backdropNear` | **0.75** | 134 m | pilares, arcos |
| `propsBack` · `terrain` · `actors` | 1 | — | lo que está detrás de la acción · el suelo, las puertas, las espinas · los personajes |
| `foreground` | **1.2** (corre más que el mundo) | 186 m | siluetas oscuras delante (nunca sobre la banda del héroe) |

Una capa con factor *f* se mueve *f* × la cámara, así que cubre **`f × (ancho de la sala) + 48 m`** (la vista más ancha, 21:9, a ambos lados): **una tira sin costura se repite hasta cubrirlo**. La luz va **detrás** del héroe y la oscuridad **delante** (el héroe es oscuro y ha de leerse).

## 5. Lo que el arte no decide

- **La colisión.** Es `RoomDefinition.solids` y nada más: cambiar, quitar o equivocar el arte de una sala **no mueve un píxel de lo que el héroe pisa, golpea o atraviesa** (lo demuestra el mismo recorrido con tres fondos y con cualquier material; y la simulación **no puede** importar nada del dibujo).
- **El `material` de un sólido es solo vestido:** elige el juego de piezas, nada más.
- **El estado de las puertas, los sellos y los objetos** lo sigue el dibujo (se disuelven, se apagan, desaparecen al tomarlos); jamás lo decide.

## 6. Reversible

Hoy el juego dibuja **siempre** el *blockout*, y entregar arte no cambia nada hasta que exista el dibujo con imágenes. Cuando exista, será **pieza a pieza** y con camino de vuelta, como el protagonista: lo entregado se dibuja con arte, lo que falte con el *blockout*, y quitar el paquete devuelve todo al *blockout* al instante. **Nada se rompe por tener menos arte.**

## 6. Etiquetas de dibujo, atlas compartidos y escenas (fase B)

**Cómo se dibuja una pieza** (etiquetas opcionales además de las de la §2):

| Etiqueta | Qué dice |
|---|---|
| `grid:CxR` | los fotogramas del clip `idle` son **las celdas de un dibujo periódico** de C columnas por R filas (por filas): la celda de la columna *i*, fila *j* de una repetición es el fotograma `(i mod C) + C × (j mod R)`. Una pared de cien celdas sin costuras y sin repetir una dos veces seguidas (la guía del pintor corta un dibujo de 8 × 4 m en 4 × 2 celdas de 2 m) |
| `rise:<m>` | metros de la imagen **por encima** de la línea sobre la que se apoya (las briznas de hierba por encima del borde de un bloque): la pieza se sube esa cantidad |
| `reach:<m>` | metros de un borde o extremo **por fuera** del borde que viste (una raíz colgando más allá del lado de un bloque) |
| `blend:add` | es **luz**, no materia: se dibuja aditiva |
| `layer:<id>` | la capa para la que se hizo una pieza `decor` (`terrain`, `props-back`, `backdrop-far`, `backdrop-mid`, `backdrop-near`, `foreground`, `light-overlay`) |

**Atlas compartidos.** Un paquete de escenario declara `"atlasMode": "shared"`: el empaquetador pone los fotogramas de **todos** sus *sprite sets* en las mismas páginas (cada set lista las páginas donde están los suyos). Con el modo por defecto (`sprite`) cada pieza tendría páginas propias y dibujar cien piezas distintas serían cien llamadas de dibujo.

**Escenas.** Lo que **no** sale de los datos de la sala —arcos, columnas, helechos, raíces, bruma, hojas delante— lo coloca una **escena**: `"scenes": { "r1_gate": "scenes/r1_gate.json" }` en el manifiesto del paquete, y el archivo es
`{ "sceneVersion": 1, "room": "r1_gate", "layers": { "terrain": [ { "sprite": "fern_a", "x": 12.4, "y": 0, "scale": 1.1, "flip": true } ] } }`: una lista de colocaciones por capa (`backdropFar`, `backdropMid`, `backdropNear`, `propsBack`, `terrain`, `foreground`, `lightOverlay`) con coordenadas **en el espacio de esa capa** (metros, +y arriba). Cada colocación puede llevar `scale`, `w` y `h` (para una pieza **suave**: un degradado, un resplandor), `flip`, `alpha`, `tint`, `frame` (qué variante) y `motion` (`sway`, `pulse`, `drift`: cosmética). El *build* comprueba que cada pieza **existe en su paquete** y que el fotograma pedido existe.

**Cómo se sustituye una pieza del pintor por arte hecho a mano:** se deja el *sprite* con el **mismo `id`** y las **mismas etiquetas** en el manifiesto del paquete (`art/ruins-ground/ruins-ground.pack.json`) y se ponen los PNG propios en `art/ruins-ground/<id>/<id>_NN.png` (con la misma cuadrícula `grid` si la pieza la tiene); **se quita del `packs/ruins.ts` del pintor** para que `npm run art:build` no la vuelva a pintar. Nada más cambia: ni la vista, ni las escenas, ni el juego.

## 7. Peligros, objetos, santuarios y sellos (fases C y D)

Cuatro piezas de los datos de la sala que ya se dibujan con arte (R2 usa las tres primeras, R3 la última y la carta; R4 usará el resto):

| Qué se dibuja | Etiquetas | Cómo se pone |
|---|---|---|
| **Una zona que hace daño** (`hazards`: las espinas) | `role:hazard`, `kind:spikes`, `part:cell`, y `grid:Cx1` si la tira es periódica | pivote **abajo a la izquierda** `[0, 1]`; una fila de celdas a lo largo de la zona **desde su suelo**, de ancho entero y la última recortada. La celda puede ser más alta que la zona (la zona es lo que hiere; el dibujo solo dice dónde). Hazla **periódica** (que el último borde empalme con el primero) |
| **Un santuario o una palanca** (`interactables`: `rest`, `activate`…) | `role:interactive`, `kind:rest` (o `activate`) | pivote **abajo en el centro** `[0.5, 1]`, sobre el punto que nombra la sala. **Un segundo fotograma** es *cómo se ve encendido* (el santuario que es el *checkpoint*, la palanca que aún sirve): el juego lo muestra sobre el primero con un pulso |
| **Un objeto** (`pickup`) | `role:interactive`, `kind:pickup`, y `variant:bottle`, `variant:card` o `variant:rune` | pivote `[0.5, 1]`; flota 0.85 m por encima del punto de la sala **centrado** (el juego sube el dibujo la mitad de su altura), sube y baja y desaparece al cogerlo. Una pieza **sin** variante sirve a todas; **por lo que da**: una ranura de botella es `bottle`, una habilidad `rune`, lo demás `card`. La capa que lo dibuja es **aditiva**: píntalo como luz (lo oscuro no se ve) |
| **Un sello** (`seals`: el sigilo que el héroe debe romper con el Spirit Bolt) | `role:seal`, `blend:add` | pivote **en el centro** `[0.5, 0.5]`; **dos fotogramas**: el sigilo **colgado** y el sigilo **destellando** (el segundo se enciende por encima del primero cuando el sello rechaza un golpe de espada). Es **luz** (capa aditiva): píntalo con fondo negro. Lo coloca el juego sobre el sello, a la mitad de su altura (con tope), y lo **hincha, encoge y desvanece** según lo que diga la simulación (cuánto queda del golpe rechazado, cuánto queda del sello, si está roto): el dibujo **no decide nada**. La **puerta** que el sello sostiene es una puerta más (`role:door`, `material:seal`, `body`/`top`/`bottom`/`glow`) |

**Los pasos de siempre:** `npm run assets:missing` dice qué pieza se pide todavía y qué salas la usan; `npm run assets:check` valida las etiquetas (una variante en algo que no es un objeto se ignora y se avisa; dos dibujos para la misma variante «reclaman la misma pieza»); `npm run assets:pack` empaqueta. **Lo que no entregues sigue siendo el *blockout* de siempre**, ranura a ranura.

**Una regla de densidad:** todas las piezas `blend:add` de **un mismo paquete** son una familia de luz y **comparten `ppm`** (si no, `assets:check` avisa: la luz de un paquete con dos densidades se vería con dos granos). En `ruins-seal` todo lo aditivo (resplandor de la puerta, sigilo, círculos y trazo de runas) es 96 px/m.

**Una guarda del primer plano:** las piezas de `layer:foreground` cuelgan del borde alto de la pantalla. Que su **borde superior nunca se vea** (si la cámara más alta de la sala lo deja a la vista se verá un corte plano en el aire): `RoomArtView` lo avisa en desarrollo (`state().roomArt.notes`) y el escenario `room-art` lo exige vacío.

