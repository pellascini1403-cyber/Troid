# El HUD — los PNG del artista y las piezas que salen de ellos

Los dos archivos de `original/` **son los originales, byte a byte** (los entregó el artista; no se redibujaron, no se recoloraron, no se pasaron por ningún filtro). Son dos lienzos de 2560 × 1440 px con el retrato, las dos placas, las
dos barras y las botellas dibujados en ellos:

| Archivo | Qué es | Tamaño | SHA-256 |
|---|---|---|---|
| `original/hud-complete.png` | el HUD con todo al máximo: 100 de vida, 100 de magia, tres botellas | 2560 × 1440 px · 134 858 B | `6cd823f2288a3c934b30108cedae9fa4902fafa923949f09c6422e161dede2be` |
| `original/hud-worn.png` | el mismo HUD desgastado: 75 de vida, 50 de magia, la tercera botella gastada | 2560 × 1440 px · 130 695 B | `a717b3066fbf5e4589baa55fd8c0f77448b81b54d1a6283e095751e48717d037` |

La captura de referencia (el HUD puesto en el juego, 844 × 390) está en `docs/img/prompt17/referencia-en-el-juego-844x390.png`: de ella salen el tamaño y el margen del HUD en pantalla (`../artGeometry.ts`, `../layout.ts`).

## Las piezas

El juego no puede mostrar un lienzo: las barras se mueven, los números son los del juego y cada botella cambia por su cuenta. Por eso **cada cosa** de los lienzos es un archivo propio, un rectángulo de uno de los originales,
**píxel a píxel**. Los escribe `npm run hud:cut` (`tools/hud/pieces.ts`) y los comprueba `npm run hud:check` (también parte de `npm run build`) y `tests/unit/ui/hudArt.test.ts`.

| Pieza | De dónde sale (px del lienzo) | Qué se le hizo además de cortarla |
|---|---|---|
| `portrait.png` (890 × 912) | `hud-complete` 10, 258 | nada |
| `plate-life.png`, `plate-magic.png` (310 × 172) | `hud-complete` 911, 500 y 911, 768 | nada |
| `bar-life.png` (1281 × 172) | `hud-complete` 1253, 500 | **se le quitó el número «100» que traía escrito** (el número lo escribe el juego): cada fila de la caja de los dígitos (x 33–249, y 32–142 de la barra) toma el color plano de la barra, que es el que tiene a su derecha |
| `bar-magic.png` (1281 × 173) | `hud-complete` 1253, 767 | lo mismo, con la caja x 33–249, y 31–141 |
| `bar-life-lost.png`, `bar-magic-lost.png` | `hud-worn` 1253, 500 y 1253, 767 | la parte perdida (la oscura) solo existe en el original desde el rectángulo blanco hasta la punta: **a su izquierda se continúa con copias de las columnas planas oscuras que la siguen** (cada columna de la pieza es una columna del original; ningún color se inventó) |
| `marker.png` (50 × 186) | `hud-worn` 2157, 493 | nada: es el rectángulo blanco del desgaste, 7 px más alto que la barra por arriba y por abajo |
| `bottle.png`, `bottle-used.png` (195 × 135) | `hud-complete` 1253, 1031 y `hud-worn` 1711, 1031 | nada: la botella disponible y la gastada |

Nada se escala, se recolorea, se redibuja ni se filtra. Las dos únicas piezas que no son un recorte exacto son las dos barras claras (sin el número) y las dos partes perdidas (continuadas hacia la izquierda), y por qué
es seguro hacerlo está comprobado: una barra es de un solo color de punta a punta (la prueba lo mide), así que lo que había bajo los dígitos y lo que hay a la izquierda de lo oscuro es ese color; el extremo redondeado de la parte
perdida queda cuadrado, pero nunca se ve (el rectángulo blanco es más alto que la barra y lo oscuro solo se muestra a su derecha).

## Cómo se muestran

Sin canvas, sin SVG, sin filtros: cada pieza es un `<img>` a su tamaño en el lienzo y en su lugar del lienzo (`../artGeometry.ts`), y **todo el bloque se escala de una vez** a la pantalla (`../HudView.ts`): ninguna pieza se
coloca ni se estira en una unidad que el navegador tenga que redondear. Una barra es la pieza clara recortada hasta donde llega la vida y la oscura recortada desde ahí, con el rectángulo blanco donde se juntan; una botella
es su pieza clara o la oscura (se funden una en otra al cambiar de estado). Lo único que el código escribe es el número.

Si hay que cambiar el aspecto del HUD, se sustituye el original por el nuevo, se actualizan las huellas de esta tabla y `tools/hud/originals.ts`, y se vuelve a correr `npm run hud:cut`.
