# Prompt 23 — Las dos estéticas del metroidvania

> Documento del encargo «Planificación y desarrollo de las dos estéticas»: la campaña tendrá **dos mitades** —la primera (0 % – 50 % de la duración), con **la estética actual**, completada y consolidada; la segunda (50 % – 100 %), con **una estética nueva definida por una imagen de referencia** (árboles retorcidos y oscuros con grandes esferas de energía roja, cielo nocturno rojizo, magenta y violeta) y con **lava como peligro jugable**— **en este orden: primero la primera mitad, después la segunda**. Reglas del encargo que gobiernan todo lo que sigue: no se vuelve a hacer la auditoría (se usa la que hay y se comprueba solo lo que cambió); no se sustituye ni se redibuja ningún PNG aprobado; no se inventa una dirección artística para la primera mitad; no se presenta como arte final lo que es una silueta provisional o una pieza repetida; no se afirma una duración sin pruebas; no se oculta un problema técnico con un arreglo visual; y **ninguna fase se da por terminada porque compile o pase una prueba: se mira el juego**. Este archivo se escribe **a medida que se trabaja**.

---

## 1 · Lo que la auditoría ya dice (y no se repite)

La auditoría de este encargo son las bitácoras de los Prompts 21 y 22 y las mediciones que ya existen (`docs/PROMPT21-LOG.md` §3, §9, §11 y §12; `docs/PROMPT22-LOG.md` §5, §8, §10 y §16). Lo que de ellas se usa, con su fuente:

| Dato | Valor | Fuente |
|---|---|---|
| El mundo | **7 zonas, 64 salas** (56 en el camino principal, 8 opcionales), 7 guardianes, 6 habilidades, 14 arquetipos de enemigo, 15 santuarios, 16 mejoras | Prompt 21 §3 |
| Duración medida (jugador de guion, de la partida nueva a la salida) | **26,2 · 27,5 · 37,7 min** (tres semillas); la travesía pura de las 55 salas del camino, **8,9 min**; el combate, 6–11 min; los siete guardianes, ≈ 6,5 min | Prompt 22 §5 y §8 (repetido hoy: 27,5 min la semilla 1) |
| Duración **humana** | **desconocida**; estimada en **1 – 2,5 h** para una primera partida del camino principal; el objetivo del encargo del Prompt 21 era de **3 – 5 h** (5 – 7 h con lo opcional) y **no se alcanza ni se ha medido** | Prompt 21 §11.1; Prompt 22 §8 |
| Lo que el propio Prompt 21 dijo que acercaría la duración | *«más tramos de vuelta con una razón para volver, más combates distintos por zona, más jefes opcionales»*, no copiar salas ni subir vidas | Prompt 21 §11.1 |
| El arte del escenario | **pintado por código** (`tools/art`), `provisional`; **un solo conjunto de fondo** (tres tiras) para las 64 salas; las 60 salas posteriores al Santuario **vestidas por un compositor** con una «mano» por zona; **la piedra partida y la palanca no tienen pieza**; las tiras de fondo **son más cortas que lo que la cámara necesita en 43 de las 64 salas** | Prompt 21 §9.4 y §12; Prompt 22 §10 |
| Criaturas y guardianes | solo el Ink Slime y el Custodio tienen arte pintado; los otros **13 arquetipos y 6 guardianes** se dibujan con siluetas procedurales | Prompt 22 §10.1 |
| El presupuesto del arranque en frío | **204 640 B de 204 800 B gz** (quedan **160 B**): nada que viaje con el primer fotograma puede crecer | Prompt 22 §14 |
| El protagonista y el HUD | de la persona propietaria, **intactos** (`art/player/source/character-sheet.png`, `src/ui/hud/png/original/`): no se tocan | Prompt 16, 17 |

**Lo que se comprobó de nuevo** (solo lo que hacía falta): el repaso visual de las salas, el reparto de tiempo por zona de la partida de guion (seed 1: Ruinas 1,0 · Santuario 0,7 · Raíces 4,4 · Ciénaga 2,9 · Minas 6,3 · Aguja 3,7 · Fundición 6,4 · Corazón 2,0 min) y la medida de los colores de la imagen de referencia (§3).

---

## 2 · El alcance de las dos mitades

### 2.1 · Qué es «el 50 %»: se mide en tiempo, no en salas

El encargo pide dividir **por duración real estimada**, no por número de salas. Lo que se puede medir hoy es el tiempo de un jugador de guion; lo que se quiere es el de una persona. El modelo que se usa (y se repite al final, §9) separa lo que está medido de lo que es una hipótesis:

| Magnitud | Cómo se obtiene | Hoy (mundo actual) |
|---|---|---|
| **Recorrido puro** | los metros del camino ÷ la velocidad de carrera (8,5 m/s), y la travesía que hace el piloto con saltos y trepadas | 3 190 m ≈ 6 min; con saltos, **8,9 min** (medido) |
| **Tiempo de guion** (cota inferior) | la partida completa del jugador de guion, con un héroe mortal | **26,2 – 37,7 min** (medido, tres semillas; 27,5 min la semilla 1) |
| **Duración humana del camino principal** | tiempo de guion × *m*, con *m* ∈ [3, 5] (**hipótesis**: orientarse, aprender cada jefe, morir, leer el mapa) | **1,4 – 2,3 h** (con 27,5 min) |
| **Con lo opcional** | + del 50 al 100 % de lo anterior (hipótesis: lugares escondidos, atajos, recompensas) | 2,1 – 4,6 h |

Con *m* entre 3 y 5, el objetivo de **3 – 5 h** del camino principal pide un tiempo de guion **total de ≈ 36 – 100 min**, con centro en **≈ 55 – 60 min** (m ≈ 4). La mitad es **≈ 28 – 30 min de guion por mitad**: la primera mitad actual (27,5 min) ya está en ese orden; **lo que falta es la otra mitad**. Es una hipótesis con su barra de error, y se dice así: el *m* no se ha medido nunca con una persona (`npm run session:report` existe para eso).

El reparto del tiempo de guion por zona (semilla 1, minutos) y lo que se gana en cada una:

| Zona | Salas | Tiempo de guion | Acumulado | Se gana |
|---|---|---|---|---|
| Ruinas (R1 – R3, Nave) | 8 | 1,0 | 3,6 % | el Dash, el Rayo |
| Santuario (R4) | — | 0,7 | 6,2 % | el Custodio de Tinta · el Impulso aéreo |
| Raíces Hundidas | 9 | 4,4 | 22,2 % | el Tirano de Raíces · el Salto doble |
| Ciénaga Luminosa | 10 | 2,9 | 32,7 % | la Matriarca · el Salto de pared |
| Minas de Cristal | 10 | 6,3 | 55,6 % | el Coloso · el Golpe al suelo (**las seis habilidades**) |
| Aguja de las Campanas | 10 | 3,7 | 69,1 % | el Custodio de la Campana |
| Fundición de Tinta | 10 | 6,4 | 92,4 % | el Motor de la Fundición |
| Corazón de Tinta | 7 | 2,0 | 100 % | el Soberano · la salida del mundo |

### 2.2 · La decisión: la primera mitad son las siete zonas actuales

**Primera mitad = las 7 zonas y las 64 salas que existen** (el camino de 56 salas y las 8 opcionales), consolidadas y moderadamente ampliadas (§5). **Segunda mitad = zonas nuevas**, en la estética de la imagen de referencia, que continúan **después** del Soberano. Tres razones, con los datos de arriba:

1. **Duración.** Con *m* = 3 – 5 el mundo actual vale 1,4 – 2,3 h: **es ya, con un margen pequeño, la mitad de un objetivo de 3 – 5 h**. Ampliarlo un 10 – 15 % (≈ 31 min de guion) lo centra en 1,5 – 2,6 h; una segunda mitad de duración parecida completa la campaña.
2. **Progresión.** Las seis habilidades llegan al final de las Minas, y la Aguja, la Fundición y el Corazón son su **aplicación**; los siete guardianes cierran un arco. Una segunda mitad tiene que ser una **continuación** (otro arco con las seis habilidades en la mano, más exigente), no un reciclado del primero.
3. **Lo que prohíbe el encargo.** *«No como un conjunto de habitaciones que solo cambian de color.»* Cortar en medio del mundo actual (donde el tiempo llega al 50 %, dentro de las Minas) obligaría a teñir de rojo **27 salas ya hechas**; y dejaría la primera mitad en 0,8 – 1,3 h, que no sostiene su duración.

**Lo que se evaluó y se descartó:** cortar al final de las Minas (el 56 % del tiempo de guion): primera mitad de 37 salas y 15,4 min de guion (0,8 – 1,3 h humanas, la mitad de lo que necesita), segunda mitad con la Aguja, la Fundición y el Corazón recoloreados más lo que hubiera que añadir; rompe el arco del Soberano, que es el clímax de la primera historia, y cambia de estética zonas que tienen pruebas, mapa, sonido y arte construidos sobre su identidad.

**Qué cambia en la estructura y qué no.** El Soberano de la Tinta deja de cerrar el juego: pasa a cerrar la primera mitad. La salida de `ih_end` —hoy *«la salida del mundo»*— lleva a la primera sala de la segunda mitad, y el final del mundo (la pantalla de cierre y los créditos, que **no cambian**) se muda a la última sala de la segunda. **No se escribe ninguna historia nueva ni se toca ningún texto narrativo aprobado.**

### 2.3 · Los objetivos que se miden al final

| | Primera mitad | Segunda mitad |
|---|---|---|
| Tiempo de guion | 28 – 34 min (hoy 27,5) | 28 – 34 min |
| Salas del camino | 56 + las nuevas | ≈ 40 – 44 (más grandes y más exigentes que la media actual) |
| Estética | la actual, un fondo propio por zona | la de la imagen de referencia |
| Peligros | pinchos | pinchos y **lava** |
| Proporción de cada una (por tiempo de guion) | 45 – 55 % | 45 – 55 % |

Lo que se afirma al final es **lo que se midió** (tiempo de guion de cada mitad), con la hipótesis de *m* **dicha como hipótesis**. No se afirma ninguna duración humana.

### 2.4 · Reglas de arquitectura que se fijan antes de empezar

- **La estética es un dato de la sala**, no un `if` del motor: `RoomDefinition.art.backdrop` elige el conjunto de fondo; los paquetes de arte dicen para qué salas valen (`zones`). Cambiar de qué estética es una zona es cambiar una lista.
- **La lava es un tipo de peligro** (`HazardKind`) que usa el sistema que ya hay —combate, daño, golpe, *i-frames*, eventos—, con lo que cambia en **datos** (empuje, rescate) y no en código nuevo; el código que cuesta bytes del primer fotograma se vigila contra los **160 B** de margen del arranque en frío.
- **La segunda mitad viaja aparte**: su contenido (salas, criaturas, jefes) es un *chunk* diferido como lo es `beyond` desde el Prompt 21, y sus ids no entran en la lista del primer fotograma.
- **Los PNG de la primera mitad no cambian**: lo que se pinte es *nuevo*, y una prueba compara los archivos que ya existen byte a byte.
- **Nada se presenta como arte final**: lo pintado por código lleva el estado `provisional` y se cuenta como tal en el informe.

---

## 3 · La imagen de referencia: qué se mide y qué se toma de ella

Medida con el Chromium del proyecto (1023 × 436 px; `scratchpad`, no se guarda en el repositorio): **no es una imagen clara**, es de **luminancia baja** —percentiles 5 / 25 / 50 / 75 / 95 de 38 / 61 / 71 / 88 / 96 sobre 255—, con lo que **cabe en el tono oscuro del juego** sin romperlo.

| Elemento | Medida | Qué se toma |
|---|---|---|
| Cielo | `#43375d` arriba → `#523f65` (25 %) → `#684b70` (40 %) → `#904d67` (55 %) → `#b6455f` (65 %, la franja más viva) | un gradiente violeta-índigo a carmesí, que baja a un velo de bruma al horizonte |
| Suelo del fondo | `#7b2d45` → `#a54460` | un plano rosado oscuro bajo la bruma (el suelo que se *camina* sigue siendo la arquitectura oscura de las ruinas) |
| Esferas de energía | núcleo `#ed2e5f` / `#eb3276`; borde `#af3c68`; media `#d92866`; **reborde claro `#ff9ab8`**; las del fondo, apagadas (`#562c57`) | esferas con degradado radial, un reborde claro y **grietas oscuras** (venas), cada vez más apagadas con la distancia |
| Árboles | cerca `#3c1d2f` (casi negros), a media distancia `#422e55` – `#543958`, lejos `#60315a` | siluetas **retorcidas y delgadas**, ramas en punta, raíces como patas; **perspectiva atmosférica**: cuanto más lejos, más violeta, más transparentes |
| Motas | pequeños puntos blancos-rosados | las motas de luz que el juego ya tiene (`motes_a`), teñidas |
| Composición | espacio abierto y amplio; **un árbol con varias esferas** (la izquierda: tres de tamaños distintos), **uno con una sola esfera grande y patas** (la derecha), árboles lejanos desvaídos | los tres planos del fondo (lejos / medio / cerca) con esos tipos |

**Cómo se evita que el fondo compita con el juego** (lo que el encargo exige): el héroe es una silueta negra con luz cian —el color **opuesto** al de la escena, que lo hace más legible, no menos—; las esferas del fondo son **magenta**, y **la lava será anaranjada y amarilla** con una superficie animada y un reborde caliente, **un color y un movimiento que ninguna esfera tiene**; los árboles cercanos se atenúan por distancia (capa del fondo cercano) para no ser tan oscuros como el héroe y los enemigos; y la arquitectura transitable conserva su luz de borde, ahora rosada, para que los suelos se lean sobre el cielo.

---

## 4 · Plan por fases y puertas de calidad

| Fase | Qué | Puerta para pasar a la siguiente |
|---|---|---|
| **1** — la primera mitad | relevamiento visual; un fondo propio por zona; las piezas que faltan (piedra partida, palanca); más variedad del compositor; integración de criaturas y efectos; ampliar el contenido con lo que la auditoría recomienda | capturas de **cada zona** que se distingan a simple vista; métricas de repetición mejores que las de partida; los PNG existentes **idénticos**; todas las pruebas y las escenas de mundo en verde; el tiempo de guion dentro del objetivo |
| **2** — la segunda mitad | la estética de la imagen (pintor y paquetes); **la lava** (datos, sistema, daño, vista, sonido, solucionador y piloto); el mundo nuevo; la conexión | la lava hiere **una vez** por contacto, devuelve al héroe a un sitio seguro y se ve como lo que es; cada sala nueva auditada por el solucionador y jugada por el piloto |
| **3** — la integración | arranque en frío, carga diferida, rendimiento, mapa, guardado, audio, HUD, transiciones | `npm run bench:bundle` dentro del techo; la partida completa extendida de la nueva a los créditos |
| **4** — la verificación | duración, proporciones, repetición, E2E y pruebas | informe con lo medido y lo que no |

---

## 5 · Fase 1 (primera mitad), bloque 1: cada zona tiene su escenario

### 5.1 · El punto de partida, medido

El repaso visual de las 64 salas dio el hallazgo que ordena todo lo demás: **todas las salas compartían un único fondo** (tres tiras pintadas para las cuatro salas del corte vertical). Una captura de las Minas de Cristal y otra de la Fundición eran la misma imagen —el mismo bosque azulado, las mismas «vainas» colgando— con otro suelo en un sitio. Las medidas, con `scratchpad/p23/metrics.mts` leyendo los paquetes confirmados y los datos de las salas:

| | Antes | Después |
|---|---|---|
| Conjuntos de fondo distintos en el mundo | **1** | **7** (Ruinas + 6 zonas) |
| Capas de fondo más cortas que lo que la cámara necesita (de 192; sobre ellas se ve el cielo) | **82** (14 lejanas, 25 medias y 43 cercanas) | **3** (las tres en las Ruinas, cuyas tiras no se tocan; la altura de cada tira de las demás zonas sale de la cámara más alta de la zona: `planStrip`) |
| Piezas de decorado por detrás del paso (en las 64 salas) | 109, de **3 – 5 tipos por zona** | **186**, de **5 – 13 tipos por zona** |
| Cuota de la pieza más repetida de una zona | 25 – **71 %** | 17 – 44 % |
| Pares de piezas vecinas dentro de una sala que son la misma | 15 – 50 % | 0 – 20 % |
| Primer plano (lo que cuelga delante de la cámara) | 3 imágenes en 3 zonas; **ninguna en 4** (y en ellas se veían las «vainas» provisionales del borrador de formas) | de 2 a 5 imágenes en **todas** |
| Materiales del suelo por zona | 3 (piedra, tierra, madera) | 4 – 5 (el suelo de la Fundición es hierro y escoria; el del Corazón, tinta y hueso) |

### 5.2 · Qué se hizo

- **Un fondo por zona** (`tools/art/painter/zones.ts`, `motifs.ts`): las tres tiras —lejos, medio, cerca— de las Raíces (verde-negro, troncos y raíces en arco), la Ciénaga (verde-azulado, hongos que brillan bajo el sombrero, farolas, juncos), las Minas (azul frío, techo con dientes, cristales, vigas), la Aguja (bronce de un ocaso con viento, torres, campanas, contrafuertes), la Fundición (rojo-negro de un horno enfriado, chimeneas, depósitos, tuberías, engranajes) y el Corazón (violeta-negro, costillas, venas que brillan, quistes). **Mismo lenguaje que el de las Ruinas, otro tono**: siluetas oscuras iluminadas desde arriba, bruma delante del suelo para que el héroe se lea, lo lejano más pálido; el tono de cada zona es el que ya nombraba su ambiente (`content/atmosphere.ts`). Las tres tiras de las Ruinas **no se tocaron**: el paquete se reconstruyó y los PNG salieron idénticos byte a byte.
- **El suelo que cada zona pisa**: nuevos materiales de dato (`materials` de `mapRoom`: piedra `rock`/`masonry`/`iron`/`ink`, tierra `mud`/`gravel`/`flagstone`/`slag`/`inksoil`, plataforma `timber`/`beam`/`grate`/`bone`: 13 en total) y las pieles correspondientes en el pintor (`painter/skins.ts`: la rampa de la piedra, la de lo que crece, la luz de las grietas y la luz con que se ilumina). Las pieles son parámetros de los mismos generadores de siempre, con la piel de las Ruinas por defecto: **los PNG de las Ruinas salieron idénticos**.
- **El decorado de cada zona** (`painter/zoneProps.ts`, `scenes/zones.ts`): de 3 a 6 clases de pieza que se levantan detrás del paso (las Raíces reutilizan además los pilares y las raíces rastreras del paquete de la Galería de Raíces, que ya eran suyas) (un cristal tan alto como una casa, un depósito sobre sus patas, una campana en su marco, una farola sobre un poste, una costilla que sale del suelo…), 2 que yacen, 1 – 2 que cuelgan delante de la cámara, las puntas de los fosos en el material de la zona (cristal, hierro, tinta; las Raíces y la Ciénaga conservan las zarzas) y la luz en el color de la zona. **El compositor** ya no esparce seis piezas donde caiga la semilla: recorre el suelo abierto de la sala como lo haría quien la diseñó (una pieza cada tantos metros, distinta de las dos anteriores; un par que enmarca el santuario; las dos puertas de la arena marcadas), y solo lee los datos de la sala, así que reconstruir no cambia nada.
- **Las dos piezas que el contrato pedía y nadie pintaba** desde el Prompt 21: la **piedra partida** (`door:stone`: un muro de polígonos con grietas que dan luz, más pálido que la piedra que lo rodea, para que se lea como lo que se va a romper en cualquier zona) y la **palanca** (`interactive:activate`: dos cuadros, en reposo y encendida mientras se puede tirar de ella). `STILL_THE_BLOCKOUT` queda **vacío**.
- **Los tamaños de las tiras vienen de los datos**, no de una cifra a ojo: la sala más alta del mundo muestra 52 m de cámara (la Aguja), y la tira que la cubre mide 43 m. El límite del manifiesto para la altura de una pieza (40 m) pasó a 64 m con esa razón escrita.

### 5.3 · Lo que no cambió (y la prueba)

Colisiones, salidas, puertas, jefes, enemigos y habilidades **no se tocaron**: el único cambio en los datos de sala es el nombre del fondo y de los materiales (`art.backdrop`, `materials`), que son piel. Las pruebas que fijaban *«las dieciséis piezas sin las cuales las 64 salas no están vestidas»* ahora fijan las **cuarenta y siete** (las 16 de las Ruinas, las 18 tiras de los fondos de las zonas y los 13 materiales del suelo), con la lista escrita pieza a pieza. Presupuesto del arranque en frío tras este bloque: **204 682 B de 204 800** (quedan 118 B; el bloque cuesta 42 B: seis alias de fondo en el borrador de `render/backdrops`).

### 5.4 · Lo que sigue siendo provisional (dicho, no escondido)

Todo lo pintado por `tools/art` lleva el estado `provisional` y se cuenta como tal: los seis fondos, los 13 materiales nuevos, las 42 clases de pieza de decorado (84 imágenes: dos variantes de cada una), la palanca, la piedra partida y las puntas. Son **arte generado por código, coherente con el de las Ruinas y suficiente para jugar y juzgar el conjunto, no arte final**: un ilustrador podría sustituir cualquiera de ellos por una pieza pintada a mano sin tocar una línea del juego (el contrato lo permite pieza a pieza). Siguen sin arte propio **13 criaturas y 6 guardianes** (siluetas por código). Las tiras cercanas de las zonas nuevas se pintan a 28 px/m (las de las Ruinas, a 38,4): la sala más alta del mundo pide 43 m de tira, y a la densidad de las Ruinas serían 10 MB de memoria solo para esa capa.

*(El resto del documento se escribe al ejecutar cada fase.)*
