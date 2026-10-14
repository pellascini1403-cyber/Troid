# Prompt 12 — «Integralas igualmente»: las Hojas 2 y 3 entran en el juego, con lo que traen

> **Lo que pasó.** Tras el informe del Prompt 11 (la Hoja 2 trae **16 poses y no 19, con arcos cian pintados** que las unen; la Hoja 3 trae **12 poses repartidas 4 + 4 + 4**, no 2 + 4 + 6; `crouchWalk` no cabía en sus límites de tamaño), el usuario contestó **«Integralas igualmente»**. No contestó a las cuatro preguntas que quedaban abiertas, así que **las decisiones están tomadas aquí, una por una, con su motivo y su forma de revertirlas** (§1).
> **Los seis clips que faltaban son ya dibujos del usuario**: `crouch`, `crouchWalk`, `walk` (Hoja 3) y `aerialAttack`, `crouchAttack`, `attack2` (Hoja 2), por el mecanismo `delivered`, **sin deformar, redibujar ni borrar un píxel** (cada pose es un recorte **sin reescalar** de la hoja, **un único factor de escala por clip**, una traslación como mucho). **10 de los 18 clips son dibujos nuevos y ninguno es un *stand-in***; 106 → 90 fotogramas; atlas del héroe 7056 KB decodificados.
> **Para poder hacerlo sin forzar nada en silencio, la herramienta de recepción aprendió tres cosas** (con permiso expreso y pruebas): aceptar **a propósito** un fallo concreto **con su motivo** (`waivers.json`), **recordar lo pedido frente a lo entregado** (`delivery`) y juzgar el golpe que **avanza** (`tipAdvances`).
> **Y una prueba nueva comprueba lo que antes solo se afirmaba**: que cada entrega archivada (la hoja, las anclas, la colocación, lo aceptado a propósito) **reproduce, byte a byte, los fotogramas del juego y las anclas del manifiesto**: pasan los 10 clips, y encontró un defecto real (referencias a fotogramas que ya no existían, §4.4).
> **Lo que no se tocó:** `src/` (el motor, la física, las colisiones, el daño, las habilidades, las botellas, los *checkpoints*, los controles táctiles), `hero-sheet.png`, `hero-portrait.jpg` y los otros **12 clips** (los 49 fotogramas de `idle`, `run`, `jump`, `fall`, `land`, `attack1`, `hurt` y `cast` y los 15 de la Hoja 1: **byte a byte los mismos**).
> **Lo que no se puede afirmar:** que **se vea bien en un dispositivo** (nada se ha visto fuera de las hojas de contacto y de capturas del navegador de pruebas) y que **sea el mismo personaje en cada pose** (lo mira una persona: la herramienta mide tamaño, halo, color, escala y anclas, no si el dibujo está bien). Los límites, en §7.

---

## 1 · Las decisiones que el usuario no dio, tomadas

El usuario dijo «Integralas igualmente» y no contestó a las cuatro preguntas del informe anterior. Lo que se hizo, y cómo se deshace cada cosa:

| Pregunta que quedó abierta | Qué se hizo | Por qué | Cómo se revierte |
|---|---|---|---|
| ¿Pedir otra vez la Hoja 2 (19 poses, sin arcos)? | **No**: se integra la que hay | «Integralas igualmente» | pedir otra hoja y `npm run assets:intake -- <clip> --accept --replace` |
| ¿Ensanchar los límites de tamaño de `crouchWalk`? | **Sí**: 0.9–3.0 m de ancho y 1.1–2.1 de alto (eran 0.9–2.1 y 1.1–1.8) | los límites eran del **encargo** (una figura **sin** espada), no del juego; los dibujos llevan la espada a la vista | `requests.json` |
| ¿Qué **2** de las 4 agachadas de la fila 1 para `crouch`? | La **1** (asentada) y la **4** (la misma, con la cabeza y el pecho algo más altos): son las más parecidas (solapamiento de siluetas **0.707** con la cabeza alineada; el resto, 0.52–0.62), así que el bucle de respiración no salta; la 2 y la 3 (esta, a rastras) **quedan en la hoja sin usar** | un clip de 2 fotogramas a 2 fps | cambiar los dos PNG de `art/player/inbox/crouch/` y `--replace` |
| ¿`walk` con 4 poses a 8 fps o pedir 2 más? | **4 poses a 8 fps** (0.5 s: lo mismo que 6 a 12) | no se inventan poses; la cadencia del motor ya escala con la velocidad | idem |

Otras tres decisiones que salen de lo que traían las hojas (todas en `requests.json`, en el campo `delivery`, con lo pedido y lo entregado):

- **`attack2` pasa de 7 a 5 fotogramas y `crouchAttack` de 6 a 5**: son los dibujos que hay en sus filas. Las fases se reparten **[0,1] salida · [2,3] golpe · [4] recuperación** (las dos), de modo que **cada fase tiene tantos fotogramas como *ticks* admite la simulación** (`attack2` 3 + 3 + 11, `crouchAttack` 4 + 3 + 9, que **no se tocan**): ninguno se salta.
- **El segundo golpe deja de «subir» y pasa a «avanzar»** (§4.3): se pedía un corte ascendente (la punta sube ≥ 0.4 m) y el segundo golpe **dibujado** es un tajo bajo hacia delante.
- **Los efectos cian dibujados dentro de la imagen se quedan** (§7): no hay operación técnica que los quite sin editar el dibujo.

## 2 · Cómo se separaron las hojas

Las tres hojas son PNG RGB de 1536 × 1024 con el fondo casi blanco; las originales no se guardan en el repositorio (son del usuario), solo los recortes que se usaron (en `art/player/source/delivered/<clip>/`). **Los huecos entre filas están totalmente vacíos** (ningún píxel de figura ni de efecto cruza de una fila a otra), así que cortar por filas **no pierde nada**:

| Hoja | Filas (y, píxeles) | Huecos vacíos entre ellas |
|---|---|---|
| 2 (`797d87b8c9fd64e0…`) | 95–309 · 364–712 · 735–929 | 310–363 · 713–734 (y 0–94, 930–1023) |
| 3 (`c5d9538edea7a203…`) | 101–344 · 439–650 · 707–952 | 345–438 · 651–706 (y 0–100, 953–1023) |

**Dentro de una fila**, las poses están separadas por huecos de columna también vacíos **salvo en la fila 1 de la Hoja 2** (`attack2`): allí el arco de la pose 2 llega hasta el **x = 634**, la punta de la hoja de la pose 3 empieza en el **x = 630**, y los arcos de la 3 llegan hasta el **x = 937** mientras la hoja de la 4 empieza en el **x = 892**; ninguna línea vertical las separa sin cortar un trazo. Por eso **esa fila entra como un PNG por pose**, con rectángulos que **se solapan** y de los que la recepción descarta, como «piezas sueltas», los restos de la vecina que caen dentro (`el recorte dejó fuera N pieza(s)`).

**Recortes, sin reescalar y sin tocar un píxel** (`convert -crop`, `+repage`), cada carpeta con su `_source.txt`:

| Clip | De | Recorte(s) | Modo |
|---|---|---|---|
| `crouchWalk` | Hoja 3, fila 2 | `1536×287+0+392` | `sheet.png` (4 poses) |
| `walk` | Hoja 3, fila 3 | `1536×310+0+679` | `sheet.png` (4 poses) |
| `crouch` | Hoja 3, fila 1 | pose 1 `363×342+34+50` · pose 4 `371×342+1121+50` | 2 PNG (`crouch_00`, `crouch_01`) |
| `aerialAttack` | Hoja 2, fila 2 | `1536×387+0+337` | `sheet.png` (6 poses) |
| `crouchAttack` | Hoja 2, fila 3 | `1536×253+0+724` | `sheet.png` (5 poses) |
| `attack2` | Hoja 2, fila 1 | `263×290+0+47` · `379×290+262+47` · `320×290+626+47` · `333×290+886+47` · `318×290+1218+47` | 5 PNG (`attack2_00` … `attack2_04`) |

## 3 · Cada clip: qué midió la herramienta y qué se decidió

Hojas de contacto (la comparación con lo que había, la secuencia a 1:1 y a tamaño real de juego): [`img/prompt12/`](img/prompt12/); todos los fotogramas finales juntos: [`fotogramas-finales-hojas-2-y-3.png`](img/prompt12/fotogramas-finales-hojas-2-y-3.png).

| Clip | Fot. | Escala | Se escaló por | Veredicto | Lo que hubo que decidir |
|---|---|---|---|---|---|
| `crouchWalk` | 4 | ×0.6009 | el ojo: 25.3 px (= `idle`) | **correcto** | los límites (con la espada, hasta 2.77 m de ancho) |
| `walk` | 4 | ×0.6245 | el ojo: 25.3 px | **correcto** | 4 poses a 8 fps |
| `crouch` | 2 | ×0.5338 | el ojo: 25.3 px | **correcto** | cuáles 2 de las 4 (§1) |
| `aerialAttack` | 6 | ×0.6367 | **la cabeza**: 56.5 px (= `attack1`) | aviso (1 fallo aceptado) | pose 3 subida 22 px; pose 6 sin espada |
| `crouchAttack` | 5 | ×0.7422 | el ojo: 25.3 px | **correcto** | 5 fotogramas; pose 2, +6 px a la derecha; límites |
| `attack2` | 5 | ×0.6279 | el ojo: 21.6 px (= `attack1`) | aviso (2 fallos aceptados) | 5 fotogramas; arcos; dos hojas; intención «avanza» |

Los seis, con **0 % de rojo** y halo ≤ 1.2 %. Las anclas de la espada (`aerialAttack`, `crouchAttack`, `attack2`: 16 fotogramas) **se leyeron a mano sobre cada fotograma** ampliado y con cuadrícula en píxeles del lienzo (sobre fondo oscuro y también sobre fondo claro, porque la hoja es negra y sobre negro no se ve) y se comprobaron dibujadas sobre el fotograma (la empuñadura en el guantelete, la punta en la punta de la hoja): cada ancla queda **a ≤ 3.6 px de la figura** (el límite es 4; la excepción es `aerialAttack_05`, que no tiene espada, más abajo) y la hoja mide **0.87–1.30 m** de la empuñadura a la punta (la del juego: 0.93; se admite 0.6–1.3).

**Lo que hubo de particular, clip por clip:**

- **`crouchWalk`**: el único fallo era el ancho (la espada hacia atrás: 2.77 m, el encargo decía ≤ 2.1). Con los límites ensanchados, los cuatro fotogramas dan **correcto**. La cabeza mide 62–65 px (la de `idle`, 59: +9 %).
- **`walk`**: cabe en sus límites de siempre. Mide **2.38 m de alto** (el `idle`, 2.23: las antenas y la cabeza son algo mayores en los dibujos nuevos) y la cabeza 64 px; al pasar de quieto a andar el personaje **crece un 7 %**: se verá en el cambio, y es del dibujo, no de la colocación (el ojo mide lo mismo: 25.4 y 25.3 px).
- **`crouch`**: **2.02 m de alto con las antenas** (la agachada que había, la del dibujo 6 del usuario, medía 1.60). La cabeza es la de pie (el ojo no cambia al agacharse), así que el personaje agachado **no es mucho más bajo que de pie**; el cuerpo de colisión agachado (1.0 m) **no se toca**.
- **`aerialAttack`**: la hoja gira la cabeza (ojos de 17 a 21 px), así que se escaló **por la cabeza** (la regla del Prompt 11). **Pose 3** (el tajo en picado): una estela cian pintada la hace medir **2.95 m**; el fotograma se salía 18 px por abajo y se **subió 22 px** (`placement.json`), de modo que la cabeza se dibuja 22 px (0.34 m) más alta que si se hubiera dejado por el centro de masa, y **se ve como un pequeño salto de ida y vuelta en ese fotograma**. **Pose 6** (la caída): **está dibujada sin espada a la vista** (solo restos de las estelas), así que **no hay empuñadura ni punta que leer**; el validador del manifiesto exige las anclas en todos los fotogramas de un golpe, así que las de ese fotograma son una **estimación** (las del anterior, desplazadas lo que se mueve la cabeza) y se aceptaron **a propósito** (`waivers.json`, §4.1). Es recuperación: no hay golpe ni efecto anclado ahí.
- **`crouchAttack`**: las poses 2, 3 y 4 llevan el arco del barrido dibujado (finas líneas azules y manchas claras); el recorte conserva lo que está pegado o cerca de la figura y deja fuera lo suelto, así que **de los arcos quedan trozos** (§7). La pose 2 quedaba a 3 px del borde izquierdo del lienzo (el contrato pide 4): **+6 px a la derecha** con `placement.json`.
- **`attack2`**: el arco de la pose 2 (26 % de los píxeles de la figura) y los de la 3 (16 %) son **piezas aparte del cuerpo** y la herramienta los da por fallo (`loose`, el límite es 2.5 %): se aceptaron **a propósito**, con el motivo escrito, porque **son píxeles del dibujo** y no se recortan ni se rehacen. La **pose 4** muestra **dos hojas** (una en cada mano): las anclas siguen **la de delante**, que es la del tajo; la de atrás se queda como está en el dibujo.

## 4 · La herramienta de recepción: lo que se añadió

### 4.1 · `waivers.json`: aceptar un fallo concreto, a propósito y con su motivo

Hasta aquí, un solo fallo impedía aceptar un clip y no había forma de decir «ya lo sé, adelante» sin tocar la herramienta. `art/player/inbox/<clip>/waivers.json` es esa forma, **explícita, revisable y archivada**:

```json
{ "aerialAttack_05:sword": "La pose de caída está dibujada sin espada a la vista: sus anclas son una estimación (las del fotograma anterior, desplazadas lo que se mueve la cabeza)…" }
```

- La clave es `<fotograma>:<comprobación>` (un fallo de un fotograma) o la comprobación sola (`intent`: un fallo del clip). **Solo se puede aceptar un FALLO** y solo el que nombra; los demás siguen siéndolo.
- **El motivo es obligatorio** (≥ 20 caracteres: una palabra no es un motivo). **Una excepción que no corresponde a ningún fallo se rechaza** (`does not match any failure of this delivery`, con los fallos que sí hay): una vieja aceptaría en silencio lo que viniera después.
- El fallo aceptado pasa a **aviso** con el texto «FALLO ACEPTADO A PROPÓSITO», **el informe lo lista con su motivo y con lo que la herramienta decía** (apartado «Fallos aceptados a propósito») y la hoja de contacto lo muestra ámbar.
- **El hash de `waivers.json` entra en la huella del informe** (como los fotogramas y las anclas): `--accept` solo acepta lo que el último informe enseñó, también en esto; cambiar un motivo después de mirar obliga a mirar otra vez. El archivo se **archiva con la entrega** (`art/player/source/delivered/<clip>/waivers.json`).
- No baja ningún umbral: solo deja pasar un fallo nombrado con su motivo pegado.

### 4.2 · `delivery`: lo pedido frente a lo entregado

Cuando llega algo que no es lo pedido, el encargo se **reescribe a lo que son los dibujos** (su número, sus fases, sus límites) para que la herramienta pueda juzgarlos, y `delivery` en `requests.json` guarda **lo que se pedía** (`asked`: fotogramas, fps, fases) y **en qué se aparta** (`note`). Sale en el informe («Lo entregado frente a lo pedido») y en el README del kit, que ahora tiene su propio estado cuando no queda nada por pedir (la tabla de lo entregado y las diferencias).

### 4.3 · La intención «avanza»

El campo `intent` de un golpe ya sabía pedir que la punta **subiera** (`tipRises`, el segundo golpe) o **bajara** (`tipDrops`, el tajo en el aire) entre la preparación y la fase activa. Era **mi lectura** de lo que debía ser el segundo golpe (la hoja 8 del usuario, sin el arco rojo), no un dato del usuario; **el segundo golpe que dibujó es otro**: la punta pasa de **1.6 m detrás del pivote** (preparación) a **1.4 m delante** (corte), a ras de suelo, y no sube (de hecho, tomando la hoja de delante, sube 0.32 m: de 0.12 m a 0.45 m sobre el pivote). Se añadió `tipAdvances` (la punta avanza ≥ N m hacia delante) y `attack2` pasó a pedir **1 m** (avanza 3.0). El escenario E2E `player-anim` comprobaba que el segundo golpe «sube > 0.4 m»; ahora comprueba que **avanza > 1 m** (la punta, medida hacia donde mira el héroe, con las anclas del juego). Es un cambio de lo que se exige para que coincida con **el dibujo entregado**, y así se dice aquí y en la nota de `attack2`.

### 4.4 · Las pruebas

- **+7 pruebas nuevas**: `waivers.json` (lectura; lo que acepta y lo que no; el fallo del clip; la excepción vieja), la intención «avanza», el README del kit sin nada por pedir y **una entrega de punta a punta con un fallo aceptado a propósito** (con el motivo en el informe, el archivo archivado y una excepción cambiada que obliga a mirar de nuevo).
- **Las pruebas de la herramienta ya no dependen de los datos de un clip entregado**: usan un encargo fijo de siete fotogramas (`BLOW`, el que tenía `attack2` cuando se pidió) y una réplica del repositorio donde `attack2` pide eso. Antes juzgaban «lo que pida `attack2` hoy», y al entregarse y reescribirse el clip se rompían nueve; es la misma razón por la que las pruebas de la entrega del Prompt 11 se aislaron de la bandeja.
- **Una prueba nueva que ya no se fía de lo que dicen los documentos** (`tests/unit/tools/deliveries.test.ts`, 11 pruebas): cada clip entregado tiene su hoja, sus anclas, su colocación y sus excepciones archivadas en `art/player/source/delivered/<clip>/`, y lo versionado debería ser **producto** de eso y no de una mano. La prueba lo comprueba **de verdad**: prepara cada archivo otra vez, en una copia del repositorio cuya bandeja solo tiene ese archivo, y exige **los mismos bytes** en cada fotograma (contra `art/player/hero/` y contra la huella de su entrega) y **las mismas anclas** en el manifiesto. **Pasan los 10 clips** (los 4 de la Hoja 1 del Prompt 11 también, que hasta ahora solo se afirmaba). Y **encontró un defecto real**: los fotogramas de referencia de `walk` y `death` en `requests.json` apuntaban a `walk_04` y `death_08`, que ya no existen tras redefinir los clips a 4 y 5 fotogramas, así que **volver a recibir esos dos clips (`--replace`) habría fallado al preparar la hoja de contacto**; se apuntaron a fotogramas que existen.
- La suite pasa de 2575 a **2605** pruebas (164 → 165 archivos).

## 5 · Qué cambió en el repositorio

| Clip | Pedido | Entregado | Fases (entregado) | Límites (alto × ancho, m) |
|---|---|---|---|---|
| `crouch` | 2 a 2 fps | 2 a 2 fps | — | 1.1–2.1 × 0.9–3.0 (antes 1.1–1.8 × 0.9–1.9) |
| `crouchWalk` | 4 a 10 fps | 4 a 10 fps | — | 1.1–2.1 × 0.9–3.0 (antes 1.1–1.8 × 0.9–2.1) |
| `walk` | 6 a 12 fps | **4 a 8 fps** | — | 1.7–2.45 × 1–2.2 (sin cambio) |
| `aerialAttack` | 6 a 26 fps | 6 a 26 fps | [0,1] [2,3] [4,5] | 1.3–3.0 × 1.2–3.2 (antes 1.3–2.7) |
| `crouchAttack` | 6 a 26 fps | **5** a 26 fps | [0,1] [2,3] [4] | 1.0–2.4 × 1.2–3.6 (antes 1.0–1.85 × 1.2–3.3) |
| `attack2` | 7 a 28 fps | **5** a 28 fps | [0,1] [2,3] [4] | 1.4–2.7 × 1.5–3.8 (antes 1.5–3.4); intención «avanza» ≥ 1 m |

- `art/player/hero/`: 90 fotogramas (eran 106): los de los seis clips son nuevos (los de `walk`, `crouch`, `crouchWalk`, `attack2` y `crouchAttack` que sobraban se borran); los de los otros 12 clips **no cambian**.
- `art/player/player.pack.json`: la entrada de cada uno de los seis, y las anclas de los 16 fotogramas de espada; **ninguno lleva ya `stand-in`**. `art/player/source/hero.rig.json`: `"delivered"` lista los 10 clips.
- `art/player/source/delivered/<clip>/`: la hoja (o los PNG) de la que salió cada clip, `anchors.json`, `placement.json` y `waivers.json` cuando los hay, el informe y `delivery.json` (la huella): **la misma entrega con los mismos archivos da los mismos fotogramas**.
- `art/player/requests/`: **no queda ningún clip por pedir**; el README del kit lo dice y lista lo entregado.
- **El juego**: `src/` no se ha tocado. Los dos escenarios E2E que dependían de lo que dibujaban los *stand-ins* se adaptaron a los dibujos y no a la inversa: `player-anim` (el segundo golpe «avanza», §4.3) y `player-art` (la agachada es **más baja que de pie** —medido en el propio escenario, no una constante de 2.0 m que la nueva agachada, de 2.02, no podía cumplir—).

## 6 · Regresión

| Comprobación | Resultado |
|---|---|
| `tsc --noEmit` | sin errores |
| Pruebas unitarias | **165 archivos · 2605 pruebas** en verde (2575 + 30: las 7 de la herramienta, las 11 de las entregas y lo que se cuenta por clip y por fotograma), con todas las entregas puestas |
| `assets:check` · `assets:verify` | OK · `animate --check`: **sin deriva** («0 de 18 clips son *stand-ins*, 10 entregados a mano»; 49 fotogramas hechos por el generador y 10 clips que deja como están) · `intake -- kit --check`: el kit es lo que producen los datos (4 archivos) · `assets:missing`: «15 de 15 clips entregados» |
| `build` | OK · arranque en frío de R1: **195.8 KB gz, sin cambio** · imágenes del arte que espera la primera imagen: 7 archivos, 4092 KB (sin cambio) · el atlas del héroe pesa **1 717 356 bytes** (antes 1 718 026: lo mismo, con 90 fotogramas mayores en vez de 106 más pequeños) y ocupa **7056 KB decodificados** (antes 7375) |
| E2E en desarrollo (los 49 escenarios) | **49 de 49** en verde, incluidos `player-anim` (el segundo golpe avanza, los tres golpes muestran todos sus fotogramas en orden dentro de las fases de la simulación, la empuñadura en la mano en cada *tick*), `player-art`, `player-lab`, `player-r1`, `crouch`, `sprites`, `fallbacks` y `soak` |
| E2E en producción (`--prod`, sobre el *bundle* recién construido) | **49 de 49** |

**El único fallo que apareció por el camino** fue el de `player-art` («la agachada es más baja que de pie», que fijaba 2.0 m: la agachada nueva mide 2.02), que está arreglado en el escenario (§5) y no en el dibujo. Los demás escenarios que miran al héroe pasaron a la primera, incluido `player-anim` con la intención nueva del segundo golpe.

**Lo que no se ha tocado:** `src/`, el motor, la física, las colisiones, el daño, las habilidades, las botellas, los puntos de control y los controles táctiles; `hero-sheet.png` y `hero-portrait.jpg`; los otros 12 clips (64 fotogramas: 49 del generador y 15 de la Hoja 1, byte a byte los mismos). **Nada visto en un dispositivo real**: las capturas del navegador de pruebas (844 × 390) enseñan al héroe pequeño y con los efectos del motor encima; sirven para comprobar que se dibuja el clip que toca, no para juzgar el dibujo.

## 7 · Lo que no está resuelto, y los límites de lo hecho

1. **Efectos dibujados dentro del fotograma.** `attack2` (2 fotogramas), `crouchAttack` (3) y `aerialAttack` (2: la estela de la pose 3 y los restos de la 6) llevan **arcos y estelas cian dibujados en la imagen**, además de los que pone el motor al golpear: se verá **el doble de efecto** en esos fotogramas. No hay operación técnica que los quite sin editar el dibujo, y no se ha editado: lo que quedó en cada fotograma es lo que el recorte conserva de lo pegado o cercano a la figura (de los arcos de `crouchAttack` y de `attack2` quedan manchas claras y líneas finas sueltas, **no el arco entero**). Si no gusta, la salida limpia es pedir esas poses **sin** efecto (el kit lo explica) o **decidir** quitar los arcos como edición del dibujo.
2. **La agachada ya no es baja.** `crouch` mide 2.02 m (la anterior, 1.60) y `crouchWalk` 1.91: el personaje agachado es solo ~12 % más bajo que de pie (cabeza y antenas no cambian). Su **cuerpo de colisión agachado sigue siendo de 1.0 m**: una cabeza dibujada por encima de un techo bajo es **visual**, no de juego.
3. **`aerialAttack_05` no tiene espada.** Sus anclas son una estimación (aceptadas a propósito, §4.1): sirven para cumplir el manifiesto, **no dicen dónde está la espada**, que no se ve.
4. **`attack2_03` tiene dos hojas** (una por mano); se ancla la de delante.
5. **`aerialAttack_02`**: la cabeza se dibuja 22 px más alta por la traslación que evita que la estela se corte (§3): un salto pequeño de ida y vuelta de un fotograma.
6. **Los dos pares de poses de la Hoja 3 que no entran**: las agachadas 2 y 3 (`crouch`), que quedan en la hoja de la que se recortaron las otras.
7. **Lo que la herramienta no puede juzgar** (lo mira una persona): que sea **el mismo personaje**, que la espada esté **en la mano derecha** (en `attack2_03` hay dos hojas), que **no haya miembros imposibles** y que la acción **se lea a tamaño de juego**. Se miró en las hojas de contacto y en los fotogramas ampliados; **no se ha visto nada en un dispositivo real**.
8. **El tamaño al cambiar de clip.** Los clips entran escalados por el ojo (o la cabeza) contra el clip vecino, como todos: `walk` queda un 7 % más alto que `idle` (el ojo mide igual, la cabeza y las antenas del dibujo nuevo son mayores) y el salto se ve al empezar a andar.

## 8 · Cómo se hizo

1. Contar y medir (§2): los cuerpos oscuros y los trazos cian de cada hoja, **huecos de fila y de columna totalmente vacíos** (`tsx`, sobre la máscara de figura de la propia herramienta), y las zonas donde unas poses entran en el espacio de otras.
2. Recortar (`convert -crop`, sin reescalar) a `art/player/inbox/<clip>/` y `npm run assets:intake -- <clip>` (informe y hoja de contacto en `art/player/inbox/_reports/<clip>/`).
3. **Leer las anclas** de cada golpe sobre el fotograma colocado, ampliado 3–7× con cuadrícula cada 10 px (sobre fondo oscuro **y sobre fondo claro**), escribir `anchors.json` y **dibujarlas encima** (empuñadura amarilla, punta magenta, la línea entre las dos) para comprobar que están donde deben.
4. `placement.json` y `waivers.json` solo donde hizo falta, con motivo.
5. Mirar `contact.png`; `npm run assets:intake -- <clip> --accept` (solo lo que enseñó el último informe y sin fallos: lo que se aceptó a propósito va con su motivo).
6. Regresión completa (§6) y documentación.
