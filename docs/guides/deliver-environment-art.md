# Cómo entregar el arte del entorno (y qué pide el mundo)

> **Estado (Prompt 7, S42): no hay arte de entorno en el repositorio.** El juego dibuja un *blockout* —rectángulos planos, un fondo de capas provisional, formas de energía— y **lo que hay hecho es el contrato**: las capas y el paralaje, las piezas que el mundo pide, la regla con que una imagen rellena un rectángulo, un informe de lo que falta y un validador que para el *build*. **No se ha dibujado, generado ni imitado ningún escenario, y todavía no existe el código que dibuje una sala con imágenes** (se escribe cuando haya imágenes contra las que escribirlo: ART-PIPELINE-2D §I.8).
>
> Esta guía dice **qué pide el mundo** y **cómo se entrega**. Para el detalle técnico: [ART-PIPELINE-2D.md](../ART-PIPELINE-2D.md) (parte I). Para el protagonista: [deliver-protagonist-art.md](deliver-protagonist-art.md).

## 1. Qué pide el mundo

No es una lista escrita a mano: **sale de los datos de las cuatro salas** (`R1`–`R4`), así que cambia sola cuando una sala usa un material nuevo. `npm run assets:missing` la imprime con lo entregado y lo que falta. Hoy son **12 piezas obligatorias** y 14 opcionales:

| Pieza (`role`) | De qué (`material:` / `kind:` / `backdrop:`) | Partes (`part:`) — **obligatoria** en negrita | Dibuja | Salas |
|---|---|---|---|---|
| `solid` | `stone`, `earth` | **`fill`**, `cap` (borde superior), `edge-l`, `edge-r` | el suelo, las paredes y los bloques | R1–R4 |
| `platform` | `wood` | **`body`**, `cap-l`, `cap-r` | las plataformas que se atraviesan saltando | R1–R3 |
| `door` | `gate`, `seal` | **`body`**, `top`, `bottom` | las puertas (se **disuelven** en 0.6 s cuando se abren) | R1, R3, R4 |
| `hazard` | `spikes` | **`cell`** | las espinas | R2 |
| `backdrop` | `ruins` | **`far`**, **`mid`**, **`near`** | el fondo en tres capas de paralaje | R1–R4 |
| `foreground` | `ruins` | `strip` | siluetas oscuras delante de la acción | R1–R4 |
| `interactive` | `rest` (santuario), `pickup` | **una imagen** por clase | lo que se puede tomar o usar | R2–R4 |
| `seal` | — | **una imagen** | el sigilo que el héroe debe golpear | R3 |
| `light` | — | una imagen | el haz de luz sobre cada salida | R1–R4 |
| `decor` | — | una imagen por objeto | objetos que no chocan con nada (ninguna sala los lista todavía) | — |

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
| **Una sola escala** (`artPxPerMeter`) por paquete | las piezas de un sitio comparten rejilla de píxeles, o sus costuras no encajan | aviso |
| Dos *sprites* para la misma pieza | solo se puede dibujar una | aviso |
| Faltan piezas **obligatorias** que el mundo pide | el *blockout* las dibuja en su lugar | **error** si el paquete es `final`; **aviso** si es `provisional` (lo normal mientras llega el arte) |

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
