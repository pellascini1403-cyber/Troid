# Prompt 19 — La pausa que se abre sobre el mapa del mundo

> Documento del encargo «reorganizar el sistema actual de pausa»: **no hay un botón de mapa aparte**; el botón de **PAUSA** que ya existía pasa a la **esquina superior derecha** y lo que abre es, como primera vista, el **mapa del mundo real** en el panel principal (a la izquierda), con las **opciones que ya existían** en una columna a la derecha. Etapas: M1 inspección · M2 modelo del mapa · M3 vista del mapa · M4 la pausa con el mapa integrado · M5 el botón de pausa · M6 pruebas, documentación y cierre. **Lo que no se hizo o no se pudo comprobar lo dice la [§9](#9--lo-que-no-hay-y-lo-que-no-se-vio); nada se da por hecho sin una prueba que lo mire.**

---

## 1 · Inspección (antes de tocar una línea)

| Pregunta | Respuesta, leída en el repositorio |
|---|---|
| **¿Dónde estaba el botón de pausa?** | **Arriba al centro** (`ui/touch/layout.ts` → `pauseOrigin`: centrado en lo usable, o pegado al HUD cuando la ventana es más estrecha que el HUD). Un icono de 44 px (`ui/settings/PauseButton.ts`) con `data-ui-block`: un clic sobre él nunca es un ataque. |
| **¿Qué abría?** | El `PauseMenu` (`ui/settings/PauseMenu.ts`, Prompt 14): una lista corta (Continuar, Ajustes, Controles, Partidas, Perfil) junto a una ficha de «dónde estás». Cada entrada abría una pantalla propia a pantalla completa y el camino de vuelta era «Volver» a la lista. **No había mapa** de ninguna clase. |
| **¿Qué congelaba?** | Todo lo del mundo, de verdad: `menuOpen` detiene el bucle (`loop.paused`), pone a cero `worldDt`, la animación y los efectos, suelta las teclas y los dedos (`input.releaseAll()`, `touchControls.releaseAll()`) y esconde el botón; las teclas escritas dentro de `[data-ui-block]` no llegan al juego salvo la de pausa. **Eso ya estaba bien y se reutiliza tal cual.** |
| **¿Existe un mapa del mundo?** | **No como interfaz.** Sí existen los datos de los que sale uno: `WORLD` (cuatro salas en línea, R1⇄R2⇄R3⇄R4), `ROOMS` con la extensión de cada sala, sus sólidos, sus salidas (`exits`: a qué sala llevan y qué bandera piden), sus compuertas (`gates`), santuarios (`interactables` de tipo `rest` con acción `checkpoint`), sellos (`seals`) y guardianes (`bosses`), y `buildWorldGraph`. |
| **¿Existe un registro de lo descubierto?** | **Sí, ya guardado:** `PlayStats.rooms` (las salas en las que el héroe ha estado, añadidas en cada `room:loaded`), que `attachProgressRecorder` guarda en `ProgressData.stats.rooms` y `restoreFromProgress` devuelve al cargar; el perfil (`buildProfile`) lee la misma lista. Las banderas del mundo (`session.flags`) dicen qué caminos están abiertos y qué guardianes cayeron. **El mapa no necesita un registro propio, y por eso no tiene uno** (un segundo registro sería un segundo sitio donde desincronizarse). |
| **¿Qué opciones tenía la pausa?** | Continuar, Ajustes (idioma, volúmenes, calidad gráfica, accesibilidad), Controles (referencia, teclas, botones táctiles y su editor), Partidas, Perfil. **No hay «Salir al menú principal» porque el juego no tiene menú principal** (la página es el juego; se guarda al ocultarse): no se inventó. |
| **¿Qué hay que cuidar?** | El arranque en frío está a **8 B** del techo (204 792 de 204 800 B gz, Prompt 18): **todo lo nuevo viaja en el *chunk* diferido del menú**, salvo el cambio de `pauseOrigin` (que está en `ui/touch/layout.ts`, frío y compartido) y se midió después. El HUD ocupa la esquina superior izquierda y los tres botones táctiles la derecha **más abajo**: la esquina superior derecha estaba libre, salvo el aviso de guardado, que ya la usaba. |

---

## 2 · Plan y estado

| Etapa | Qué | Estado | Evidencia |
|---|---|---|---|
| **M1** | Inspección | hecha | [§1](#1--inspección-antes-de-tocar-una-línea) |
| **M2** | Modelo del mapa **puro** sobre los datos reales del mundo y lo descubierto | hecha | [§3](#3--m2--el-modelo-del-mapa), `tests/unit/world/worldMap.test.ts` (32), `tests/integration/mapDiscovery.test.ts` (10) |
| **M3** | Vista del mapa: salas, conexiones, posición, puntos de interés, zoom y desplazamiento (ratón, rueda, teclado, botones, dos dedos) | hecha | [§4](#4--m3--la-vista), `tests/unit/ui/mapViewport.test.ts` (18), `tests/unit/ui/mapView.test.ts` (23) |
| **M4** | La pausa se abre sobre el mapa; las opciones, a la derecha; cada una se abre en el panel principal y se vuelve al mapa | hecha | [§5](#5--m4--la-pausa-con-el-mapa-dentro), `tests/unit/ui/pauseMenu.test.ts` (41), E2E `pauseMap` B–E |
| **M5** | El botón de pausa a la esquina superior derecha, sin tocar HUD ni controles | hecha | [§6](#6--m5--el-botón-de-pausa), `pauseButton`, `mobileGeometry`, `saveNotice`, E2E `pauseMap` A y G |
| **M6** | Pruebas, regresión, presupuesto, documentación | ver [§8](#8--m6--pruebas-y-resultados) | [§8](#8--m6--pruebas-y-resultados) |

**Reglas que se mantuvieron todo el encargo.** (1) *Un solo mundo*: el mapa se construye de `WORLD`/`ROOMS` y de lo que el juego ya cuenta y guarda; no hay una lista de salas, de conexiones ni de descubrimientos que alguien tenga que mantener a la par. (2) *Nada de lo que ya funcionaba se rehízo*: el congelado, las pantallas de Ajustes, Controles, Partidas y Perfil, el editor táctil y el almacenamiento son los de antes; solo cambia dónde se muestran. (3) *Nada del mapa entra en el arranque en frío.* (4) *No se inventó ninguna opción que no haga algo.* (5) *Lo que no se pudo comprobar se dice.*

---

## 3 · M2 — El modelo del mapa

`src/world/worldMap.ts` (puro: sin DOM, sin importar `content`; la prueba de arquitectura lo vigila).

**`buildMapLayout(world, registry)`** coloca las salas en un plano **una vez**: la primera sala en el origen y cada vecina contra el muro de su puerta, con la puerta de vuelta **a la misma altura**, de modo que un pasillo de salas es una línea de salas. Una sala que cae sobre otra se desliza a lo largo del muro hasta quedar libre; las salas a las que ninguna puerta llega van en una fila debajo. El mismo mundo da siempre el mismo plano. Qué muro es el de una salida lo decide `sideOfExit`: una salida a menos de `min(6 m, 20 % del ancho)` de un muro lateral está en él (aunque esté apoyada en el suelo); una lejos de ambos (un pozo) está en el techo o el suelo, el más cercano.

**`mapScene(layout, entrada)`** dice qué de ese plano ha **ganado** el jugador:

| Elemento | Cuándo aparece, y cómo se ve |
|---|---|
| **sala** | cuando el héroe ha estado en ella (`stats.rooms`) o está en ella ahora; las demás **no existen** para el mapa: no se dibujan ni se cuentan |
| **terreno** (suelo y plataformas) | con su sala; las compuertas (la puerta de piedra de R1) se dibujan **cerradas** hasta que su bandera está puesta |
| **puerta de salida** | con su sala; **cerrada** mientras la bandera que pide no esté puesta (la cerradura), **abierta** si no pide ninguna o ya está; si la sala a la que lleva **no está en el mapa**, termina en un **tramo discontinuo hacia lo desconocido** |
| **conexión** | cuando **ambas** salas están en el mapa; va de puerta a puerta y se dibuja distinta si alguna puerta sigue cerrada |
| **punto de interés** | con su sala: **santuario** (el que da punto de control; el activo, es decir el de la sesión, se marca), **sello** (roto o intacto según su bandera) y **guardián** (su arena; caído o no según su bandera) |
| **zona** | el nombre de la región (Ruinas del bosque antiguo, Santuario) sobre las salas descubiertas de ella |
| **posición** | el héroe, en su sala y en su sitio exacto (limitado al cuadro de la sala: un héroe caído en un pozo está en el suelo del mapa) |
| **resumen** | «Estás en X. Salas descubiertas: n de m» (para lectores de pantalla y la cabecera) |

**De dónde sale lo descubierto, sin un registro nuevo.** `app/menu.ts` llama a `mapScene` con `d.stats.snapshot(…).rooms` (la misma lista que el juego guarda en `ProgressData.stats.rooms` y que lee el perfil), `session.flags`, la sala y la posición de `session.player.body` y `session.checkpoint`. El mapa se vuelve a calcular **cada vez que se abre el menú**, así que refleja la entrada en una sala, una conexión descubierta o una ruta desbloqueada sin avisar a nadie. **Guardar y cargar no necesita código nuevo**: `restoreFromProgress` ya devuelve esa lista y el mapa de después de cargar sale idéntico (probado, [§8.1](#81-qué-se-ejecutó-y-qué-dio)). Una partida v1 (sin esa lista) abre el mapa con la sala en la que se está; las salas con un id que el mundo no conoce se ignoran.

---

## 4 · M3 — La vista

`src/ui/map/` (DOM + SVG; vive en el *chunk* del menú).

| Módulo | Qué hace |
|---|---|
| `viewport.ts` (puro) | la aritmética de ver un mapa: `fitView` (todo lo descubierto, centrado, sin ampliar una sala hasta llenar el panel: `ZOOM.start`), `openingView` (si todo no cabe a una escala legible, a `ZOOM.legible` alrededor del héroe), `zoomAbout` (el punto bajo el cursor o el centro del pellizco **no se mueve**), `panBy`, `clampView` (siempre quedan **72 px** del mapa en el panel: no se puede perder fuera de la pantalla), `pinchOf`, `wheelFactor` (rueda de líneas, de píxeles y el pellizco de un panel táctil, que llega como rueda con Ctrl). `TOOLS_CORNER` (64 × 164 px, la esquina de los botones de zoom): la vista inicial **no pone nada bajo los botones** —encaja el mapa en lo que queda a su izquierda solo si, encajado en todo el panel, llegaría a esa esquina; un mapa delgado en un panel alto no llega y tiene todo el ancho— |
| `MapView.ts` | un `div` (`data-testid="map"`, enfocable, `role="group"`) con una capa SVG **del mundo** (salas y terreno, escalada) y otra **de pantalla** (nombres, puertas, puntos de interés y héroe, que **conservan su tamaño** al hacer zoom). Arrastre con un dedo o el ratón, **pellizco con dos dedos** (el medio arrastra y la distancia hace zoom), rueda, teclado (flechas, `+`/`-`, `0`/Inicio) y tres botones (más, menos, centrar). `touch-action: none` y captura de puntero. La vista que el jugador movió **se conserva** mientras se vuelve a dibujar la escena, salvo que se pida empezar de nuevo (un menú que acaba de abrirse). Un panel sin lugares dice «No hay mapa de este lugar.» y no ofrece zoom. Lleva una lista y un resumen **solo para lectores de pantalla** |
| `mapIcons.ts`, `mapStyle.ts` | los glifos (brasero, sello, corona, candado, salida, zoom, centrar), como trazos en una caja de 24 × 24 igual que los del menú, y el CSS con la paleta del juego (`PALETTE`) |

Lo que se ve está en `MapView` y lo que se decide, en las funciones puras de arriba: lo primero se prueba con `happy-dom` (la estructura, los estados y los eventos) y lo segundo sin pantalla.

---

## 5 · M4 — La pausa con el mapa dentro

`src/ui/settings/PauseMenu.ts` (reescrito el DOM, **conservada** la clase, su anfitrión y sus pantallas).

**Disposición.** Un marco de dos columnas: **panel principal** (`pm-stage`, a la izquierda, `minmax(0, 1fr)`) y **columna de opciones** (`pm-side`, `clamp(200px, 25vw, 270px)`). Al abrirse, el panel principal muestra el **mapa** (`show('main')`) con, encima, **dónde estás** (el nombre de la sala, el tiempo jugado y la partida) y, debajo, la **leyenda** (tu posición, descanso, sello, guardián, camino cerrado).

**Las opciones**, en orden: **Reanudar**, **Mapa**, **Controles**, **Sonido**, **Ajustes**, **Partidas**, **Perfil**. Cada una **abre su pantalla dentro del panel principal** (no por encima ni a pantalla completa) y la columna de la derecha **queda donde está**, con la entrada abierta marcada (`aria-current="page"`). **Volver al mapa** es un toque en «Mapa», el botón «Volver» de la pantalla o la tecla de pausa; Reanudar cierra. Abrir una pantalla, volver y volver a abrirla **no pierde nada** (la vista del mapa se conserva; lo que se cambió en un ajuste ya estaba aplicado) y **no cierra la pausa**: el mundo sigue parado.

| Entrada | Qué es | ¿Existía? |
|---|---|---|
| Reanudar | cierra el menú | sí |
| **Mapa** | vuelve al mapa | **nueva** — no es un botón que abra el mapa desde el juego: es la entrada de la columna que **ya está abierta** al abrirse |
| Controles | referencia de controles, teclas, botones táctiles y su editor (`SettingsMenu` en `screen: 'controls'`) | sí |
| **Sonido** | los cuatro volúmenes independientes (general, música, efectos, ambiente) (`screen: 'sound'`) | **sus controles ya existían** dentro de Ajustes; ahora tienen pantalla propia, que es lo que pedía «Sonido/música con volúmenes independientes» |
| Ajustes | idioma, calidad gráfica y accesibilidad (`screen: 'settings'`) | sí (sin el sonido) |
| Partidas | las ranuras y el autoguardado (`SavesScreen`), **solo donde el juego guarda** | sí |
| Perfil | el perfil local (`ProfileScreen`), **solo donde el juego guarda** | sí |
| «Salir al menú principal» | — | **no se añadió: el juego no tiene menú principal** |

**Que nada atraviesa el menú.** El menú sigue siendo `data-ui-block`: un clic o un toque sobre él no es un ataque ni un movimiento, las teclas escritas en él (incluidas las flechas, `+`, `-`, `0` del mapa y las de la columna) no llegan al juego salvo la de pausa, y al abrirse se sueltan las teclas y los dedos. Las flechas de la columna de opciones funcionan en cualquier pantalla, así que no hay que volver al mapa para cambiar de opción con teclado.

**Presentación adaptable.** El marco se mide en porcentajes de lo que deja la muesca (`--safe-*-px` / `env(safe-area-inset-*)`, como el HUD y los botones táctiles), no en `vh`. *Escritorio y apaisado:* mapa a la izquierda, opciones a la derecha (en un teléfono apaisado de 844 × 390 la columna es de **252 px** con las opciones **en dos columnas de 44 px de alto**, para que quepan las siete sin recortar el mapa; la leyenda se oculta). *En vertical* (≤ 700 px de ancho): el mapa arriba y las opciones debajo en dos columnas, cada una de al menos 44 px, de modo que el mapa y los controles se leen. El mapa tiene siempre más área que la columna de opciones (lo comprueba la escena E2E en los tres tamaños).

---

## 6 · M5 — El botón de pausa

`ui/touch/layout.ts` (`pauseOrigin`), `ui/settings/PauseButton.ts`, `ui/overlays/SaveNotice.ts`.

- **Esquina superior derecha**: a `margin` del área segura (el botón crece alrededor de su centro con `uiScale`, así que se coloca por lo que mide ya escalado). **Misma función, mismo estilo, mismo tamaño táctil (≥ 44 px), mismas teclas (Escape, P, Start del mando)**: solo cambia de sitio.
- **Sin pisar el HUD**: el HUD (vida, magia, retrato, botellas, poder) está arriba a la izquierda. Donde una ventana es **tan estrecha que el HUD y el botón no caben uno al lado del otro** (un teléfono en vertical con el HUD en su tamaño máximo) el botón se queda en el borde derecho y **baja por debajo del HUD** (redondeado hacia abajo, nunca dentro). El HUD cuenta con su ancho máximo, así que el botón no se mueve al encontrar una cuarta botella.
- **Sin pisar los botones táctiles** (Ataque, Esquiva, Habilidad): viven en la derecha **más abajo**; lo comprueban `mobileGeometry` (en cada clase de ventana) y la escena E2E (la caja del botón contra cada control visible, en vertical y en apaisado).
- **El aviso de guardado**, que ya vivía en esa esquina, **cuelga justo debajo** del botón y crece hacia la izquierda; si en una ventana estrecha el aviso más largo llegaría al HUD, baja también bajo el HUD.
- Mientras el menú está abierto el botón se **esconde** (como antes: no se puede pulsar «detrás» del menú).

---

## 7 · Lo que el navegador real enseñó

1. **Chromium no hace `click` de un toque que sigue a un pellizco o que llega con otro dedo apoyado en el mapa** (escena `pauseMap`, sección G). Es lo que el Prompt 15 ya había documentado (`docs/PROMPT15-LOG.md` §6.4: «no fabrica un `click` para un toque que llega justo después de un arrastre sobre una superficie `touch-action: none` ni para un toque que es uno de dos dedos») y **el mapa es justo una superficie así**: tras arrastrar y pellizcar el mapa, el toque siguiente sobre «Sonido» **llegaba** (`pointerdown`, `touchstart`, `pointerup`, `touchend` sobre el elemento correcto) y **no producía el clic**. Se aisló en una página de sonda: sin esperar, **1 de 4** toques hacía clic tras un pellizco; con 400 ms de espera (de los toques o reales), **4 de 4**; con un dedo apoyado en el mapa y otro que pulsa «Sonido», **0 de 5** clics (y la pantalla se abría 5 de 5 con lo que sigue). *Un primer diagnóstico culpó al entorno de pruebas (el reloj virtual de los toques, fotogramas lentos con el *software rendering* a 2×); era a medias: eso hace que el fallo sea **intermitente** en las pruebas, pero la causa es la de Chromium y **un jugador puede encontrarla** (un pulgar apoyado en el mapa mientras la otra mano pulsa una opción es normal).* **Arreglo en el producto, no en la prueba:** las siete entradas de la columna y los tres botones del mapa actúan **al levantar el dedo** (`app/press.ts`, `onPress`: el mismo recurso del botón de pausa y del editor táctil; el ratón, el lápiz y el teclado siguen actuando con el `click`, y el `click` que sí llegue tras un toque no es una segunda pulsación). Que un deslizador arrastrado y un «Volver» inmediato **sí** hacen clic (6 de 6) se midió también: «Volver» no lo necesita. **La escena lo vigila de forma determinista**: con un dedo apoyado en el mapa pulsa el botón «+» y «Sonido» (y, justo después de arrastrar y pellizcar, hace lo mismo sin esperar nada); **comprobado con mutantes: con las entradas actuando al `click` la escena falla en «Sonido» y con los botones del mapa al `click` falla en «+» (9.594 → 9.594)**. **Se midió también que el menú nuevo no cuesta más fotogramas que el anterior** (tres ventanas de 8 s en apaisado a 2×: 309 / 276 / 271 ms con el menú nuevo, 288 / 277 / 272 ms con el anterior; en este entorno todo va a 150–450 ms por fotograma, así que no dice nada de un teléfono). **No se ha visto en un dispositivo real** si un dedo que cae enseguida tras un pellizco hace clic, ni cómo reparte Safari esos casos.
2. **El dedo que se queda sobre el mapa.** Si una opción esconde el mapa con un dedo encima (el pulgar apoyado mientras la otra mano pulsa «Sonido»), el mapa se quedaba con ese dedo apuntado y **el siguiente arrastre con un dedo se leía como un pellizco** (con el fantasma, dos dedos). Ahora el mapa **olvida los dedos** (`MapView.cancelGestures`) cuando el menú lo aparta o se cierra, y también cuando el navegador suelta la captura (`lostpointercapture`). Probado con pruebas unitarias (y con dos mutantes que mueren) y con la escena (tras volver al mapa, un dedo arrastra y la escala no cambia).
3. **La vista inicial pisaba la puerta cerrada.** En un teléfono apaisado el tramo hacia lo desconocido de la puerta oriental de R1 quedaba **debajo del botón «+» del zoom** (se vio en la captura). La vista inicial **no pone el mapa bajo la esquina de los botones** (`TOOLS_CORNER`): si, encajado en todo el panel, el mapa llegaría a esa esquina, se encaja en lo que queda a su izquierda; si no llega (un mapa delgado en un panel alto: un teléfono en vertical) tiene todo el ancho —una primera versión reservaba la franja siempre, y en vertical encogía el mapa un 30 % sin necesidad: se vio en la captura—. La escena comprueba que la puerta y su tramo no están bajo ninguno de los tres botones.
4. **El subtítulo repetido.** La pantalla de Sonido decía «Sonido» como título y otra vez como encabezado de su sección. La sección ya no repite el nombre cuando es la única de la pantalla (el panel completo, que no tiene título propio, lo conserva).
5. **La muesca.** El menú no respetaba el área segura: con una muesca (`?safe=44,47,21,47`, la de las demás escenas de teléfono) el marco del menú iba por debajo de ella. Ahora la raíz del menú deja el relleno de la muesca (`--safe-*-px` / `env(safe-area-inset-*)`, como el HUD y los botones) y el marco se mide en porcentajes de lo que queda, no en `vh` (que en un navegador móvil con la barra visible es más alto que la pantalla). La escena comprueba, **en los cuatro casos** (apaisado y vertical, con y sin muesca), que el marco, el mapa y la columna **están dentro de lo que la muesca deja** y que el botón de pausa está bajo ella.
6. **Una regla del plano que los datos corrigieron.** `sideOfExit` tomaba una salida apoyada en el suelo y pegada a una esquina por una puerta del suelo (la caja de la sala también termina en el suelo): la regla es ahora «las puertas de un metroidvania están en los muros laterales», y las de un pozo, en el techo o el suelo.
7. **El presupuesto del arranque en frío se pasó por 11 B.** Lo único que el encargo toca en el código del primer fotograma es `pauseOrigin` (`ui/touch/layout.ts`, compartido con la capa táctil) y una llamada en `Game2D`: medido por *chunk* contra el *build* del Prompt 18 sumaba **+11 B (204 803 de 204 800)**. Se escribió `pauseOrigin` de varias formas equivalentes y se midió cada una (el gzip de un *chunk* se mueve ± 5 B con solo cambiar los *hashes* de los nombres que otros *chunks* importan): la que **redondea siempre hacia abajo de la pantalla** (`Math.ceil`, un píxel como mucho más abajo en la esquina y nunca por encima del HUD) deja **204 792 B, lo mismo que antes del encargo: quedan 8 B**.
8. **Dos instrumentos que el encargo dejó viejos** (la corrida completa de E2E en desarrollo los encontró): `language` esperaba el botón de pausa **arriba al centro** y `audio` volvía a «Ajustes» donde ahora hay que volver a «Sonido». Corregidos sin tocar lo que afirman del juego.

---

## 8 · M6 — Pruebas y resultados

### 8.1 Qué se ejecutó y qué dio

| Qué | Resultado |
|---|---|
| `npx tsc --noEmit` | limpio |
| `npx vitest run` | ‹vitest› |
| E2E en desarrollo | ‹e2e-dev› |
| E2E contra el *build* de producción | ‹e2e-prod› |
| `npm run build` | ‹build› |
| `npm run bench:bundle` | ‹bundle› |

**Pruebas nuevas o adaptadas de este encargo**

| Archivo | Qué mira |
|---|---|
| `tests/unit/world/worldMap.test.ts` (32) | el plano: las puertas se enfrentan y quedan a la misma altura, una sala que cae sobre otra se desliza, las no alcanzables van debajo, determinismo; `sideOfExit` y `mapPoint`; la escena: solo lo visitado y la sala actual, puertas cerradas por su bandera, tramos hacia lo desconocido, conexiones solo con las dos salas, estados de los puntos de interés, regiones, cuenta de descubiertas |
| `tests/integration/mapDiscovery.test.ts` (10) | **con el mundo de verdad** (`WORLD`, `ROOMS`, una `GameSession`): el mapa sigue al héroe sala a sala, las banderas abren los caminos, los puntos de interés con el santuario real donde se descansa, **guardar → cargar da el mismo mapa** (con `attachProgressRecorder` y `restoreFromProgress`), una partida v1, ids de sala desconocidos ignorados, **el mapa y el perfil leen un único registro** |
| `tests/unit/ui/mapViewport.test.ts` (18) | encajar, centrar, **mantener la esquina de los botones libre solo donde el mapa llegaría a ella**, no pasar de la escala mínima ni de la máxima, el punto bajo el cursor no se mueve, `clampView`, pellizco, rueda |
| `tests/unit/ui/mapView.test.ts` (23) | estructura, estados de puertas, puntos de interés y héroe, vacío, la vista inicial, la vista que se conserva, botones, rueda, ratón, dos dedos, teclado, limpieza |
| `tests/unit/ui/pauseMenu.test.ts` (41, 9 del mapa) | el mapa es la primera vista, la leyenda, las entradas y su orden, cada pantalla en el panel principal, volver al mapa, `aria-current`, flechas en cualquier pantalla, el mapa se vuelve a calcular al abrir, el sonido en su pantalla |
| `tests/unit/ui/pauseButton.test.ts`, `mobileGeometry.test.ts`, `saveNotice.test.ts` | el botón en la esquina superior derecha en cada clase de ventana, bajo el HUD cuando no cabe, sin tocar los botones táctiles; el aviso debajo del botón |
| `tests/unit/ui/settingsMenu.test.ts` (62) | Ajustes sin el sonido, la pantalla de Sonido con sus cuatro volúmenes y nada más, sin el subtítulo repetido |
| `tests/unit/i18n/catalogs.test.ts` | las familias de claves `map` y `region` en los catálogos del menú |
| escena E2E **`pauseMap`** (≈ 105 s) | ver [§8.2](#82-la-escena-e2e-pausemap) |
| escenas E2E adaptadas | `settings`, `audio`, `mobile`, `accessibility` (el botón arriba a la derecha, el Sonido en su pantalla, la pista de desplazamiento de Ajustes): **sus afirmaciones sobre el juego no se tocaron** |

### 8.2 La escena E2E `pauseMap`

Nueve secciones; cada una es una pregunta que solo un navegador real contesta:

| § | Pregunta | Respuesta medida |
|---|---|---|
| A | ¿El botón está arriba a la derecha y no pisa el HUD? | a ≤ 24 px del borde derecho y del superior, ≥ 44 px, en la esquina (x > 90 % del ancho), sin solaparse con el HUD |
| B | ¿La pausa se abre sobre el mapa y el mundo se para? | el menú abre en `main` con el mapa visible y **ninguna** otra pantalla construida; el reloj de simulación y el héroe **no avanzan en seis muestras**; el mapa a la izquierda, las opciones a la derecha, el mapa con el doble de ancho y la mitad de la altura; las siete entradas en orden y de ≥ 40 px; **solo R1** descubierta, el héroe dentro de ella, la puerta oriental **cerrada y hacia lo desconocido** (un tramo), ninguna conexión |
| C | ¿Las opciones se abren en el panel y se vuelve al mapa? | cada una llena el panel, la columna sigue, la entrada abierta está marcada, el juego sigue parado; Escape y «Mapa» vuelven; un volumen movido en Sonido **está en vigor** al volver |
| D | ¿Se mueve y se amplía? | botones, rueda (hacia el cursor), arrastre con el ratón, teclas, límites de zoom, **no se puede perder el mapa fuera del panel**, la vista se conserva al ir y volver de una opción, «centrar» la devuelve |
| E | ¿Atraviesa algo el menú? | nada tecleado ni pulsado llega al juego (ni salto, ni ataque, ni la tecla del mapa) |
| F | ¿El mapa es el mundo que el héroe ha recorrido? | crece R1 → R2 → R3, **los caminos que el mundo abre se abren en el mapa**, el guardado conserva `stats.rooms`, **al recargar el mapa es el mismo** (tres salas, no cuatro, la misma puerta abierta, el sello de la tercera sala intacto) y **el perfil cuenta las mismas salas** |
| G | ¿Y en un teléfono —apaisado y en vertical, **con y sin muesca** (`?safe=44,47,21,47`)— con toques de verdad? | botón en el borde derecho de lo usable, ≥ 44 px y bajo la muesca, **sin pisar el HUD ni los tres botones táctiles**; **el marco, el mapa y la columna dentro de lo que la muesca deja**; el mapa ≥ 240 × 150 y el más grande de los dos, las siete entradas **de ≥ 44 px**, sin desplazamiento horizontal; **la puerta cerrada y su tramo no están bajo los botones de zoom**; **un dedo mueve el mapa, dos lo amplían**, y el héroe ni se mueve ni ataca ni avanza el reloj; **justo después del pellizco, sin esperar nada, el botón «+» responde; con un dedo apoyado en el mapa, «+» y «Sonido» responden** (ver §7.1); al volver al mapa, **un dedo arrastra y no amplía** (ningún dedo fantasma); Sonido, Mapa y Reanudar con toques |
| H | ¿Se para de verdad **todo** el mundo? | con el limo despierto, **un proyectil en vuelo**, la carta en su enfriamiento y la magia gastándose, se abre el menú y se suelta el bucle: **ocho muestras idénticas** (reloj, héroe y su fotograma, cámara, magia, vida, botellas, la carta, **cada enemigo con su propio reloj y su posición, cada proyectil**); al reanudar **sí se mueve** y la carta vuelve a estar lista |
| I | ¿Y un lugar sin mapa? | el campo de pruebas (`room=movement_test`) abre el menú con «No hay mapa de este lugar.», sin zoom ni salas, y las opciones funcionan |

### 8.3 Que las pruebas fallan si se rompe lo que miran (mutaciones comprobadas a mano)

Un guion cambia **una línea** del código, corre las pruebas que deberían verla y devuelve el archivo byte a byte (`cmp`): **34 mutantes de la lógica**, **2 de los dedos que se quedan sobre el mapa** y **2 de la escena de navegador**. **Murieron todos menos uno, y ese es una guarda puesta dos veces a propósito** (abajo).

| Se cambió | La prueba que lo vio |
|---|---|
| *(plano)* una puerta de un muro lateral se confunde con una del suelo (alcance 0) · dos salas que se enfrentan no quedan a la misma altura · una sala que cae sobre otra no se desliza | 5 · 3 · 1 pruebas del plano |
| *(escena)* la sala donde está el héroe no sale si no se contó · una puerta nunca está cerrada · todo camino lleva a algo conocido (sin tramos) · una sala cuenta como descubierta aunque no lo esté · el héroe no está en el mapa · el héroe fuera de la sala se dibuja fuera de ella | 1 · 5 · 4 · 5 · 4 · 1 |
| *(puntos de interés)* el guardián caído sigue en pie · el santuario al que se vuelve tras una derrota no se marca | 2 · 2 |
| *(aritmética de ver)* el zoom mueve el punto bajo el cursor · el mapa se puede arrastrar fuera del panel · la esquina de los botones de zoom no se aparta · un mundo grande se enseña demasiado pequeño · la rueda amplía al revés · el medio de dos dedos es uno de ellos | 3 · 3 · 2 · 2 · 2 · 1 |
| *(`MapView`)* dos dedos no amplían · lo que el jugador movió no se conserva al dibujar la escena de nuevo · el botón «+» no se apaga en el límite · la rueda desplaza la página | 1 · 2 · 1 · 1 |
| *(`PauseMenu`)* al abrirse no pone el mapa en su vista inicial · la entrada abierta no se marca · «volver» desde una pantalla no vuelve al mapa · no se vuelve a pedir el mapa al juego · el mapa sigue a la vista cuando se abre una pantalla | 1 · 1 · 2 · 4 · 1 |
| *(`pauseOrigin`)* el botón nunca baja bajo el HUD · el botón está en la esquina superior izquierda · el redondeo sube hacia el HUD | 4 · 5 · 2 |
| *(aviso de guardado)* el aviso se pone sobre el botón de pausa | 1 |
| *(el cableado de `app/menu.ts`, sobre el juego real)* el mapa no lee las salas contadas · ignora las banderas · no pone al héroe | 1 · 1 · 1 |
| *(dedos)* el menú no manda olvidar los dedos al apartar el mapa · `cancelGestures` no olvida nada | 1 · 1 |
| *(escena de navegador)* **las entradas de la columna actúan al `click`** · **los botones del mapa actúan al `click`** | la escena `pauseMap` falla en «Sonido» (con un dedo apoyado en el mapa: ningún clic) · falla en «+» (9.594 → 9.594) |

**El que sobrevivió:** *«una conexión necesita solo una de sus dos salas»* (`!onMap.has(a.room) && !onMap.has(b.room)` en lugar de `||`). No es un hueco: **la misma comprobación está dos veces** —las puertas que se buscan (`doorOf`) solo son las de las salas que se enseñan, así que una conexión con una sala que no está en el mapa ya se descarta por no encontrar su puerta—. Quitando **las dos** (las puertas de todas las salas buscables y solo una sala exigida; o ninguna) mueren 4 pruebas («draws the connection between two rooms only when both are on the map…» y las de una partida nueva).

### 8.4 Cómo se encontró cada cosa (para quien herede esto)

(1) Una escena con **dedos de verdad** (el protocolo de depuración, no eventos de DOM) vio lo del toque tras un pellizco; **reproducirlo aislado** en una página de cuatro líneas antes de arreglar nada separó lo del entorno de lo del juego, y **medir el mismo coste de fotograma en la versión anterior** (un *worktree* del último *commit*) dijo que el menú nuevo no era la causa. (2) Mirar la **captura** de cada tamaño encontró lo de la puerta bajo los botones. (3) Medir `pauseOrigin` contra el HUD con la caja **ya escalada** encontró el 0.2 px de solape cuando el botón baja bajo el HUD.

---

## 9 · Lo que no hay y lo que no se vio

1. **«Salir al menú principal» no existe** porque el juego **no tiene menú principal** (la página es el juego, se guarda al ocultarse). No se añadió un botón que no hiciera nada; si algún día hay un título, será una entrada más de la columna, con confirmación.
2. **Nada se ha visto en un dispositivo real.** Todo se ejecutó en un Chromium 141 sin cabeza con *software rendering*: el pellizco, el arrastre y los toques se enviaron con el protocolo de depuración. **No se ha medido la fluidez del mapa ni del menú en un teléfono** (en este entorno cada fotograma tarda 150–450 ms con y sin el menú, así que lo que se ve ahí no dice nada de un teléfono), **ni la muesca de un teléfono de verdad** (la de las pruebas es `?safe=44,47,21,47`), **ni qué reparte un navegador real entre `click` y toque** (§7.1). Ver el protocolo de comprobación en `docs/MOBILE-CALIBRATION.md`.
3. **Los puntos de interés aparecen con su sala**, no por separado: un guardián y un sello se ven en el mapa en cuanto se ha entrado en su sala, hayan sido o no «encontrados». El juego no registra «este santuario/este sello se ha visto» aparte de la sala; añadirlo sería un segundo registro. Lo que **sí** sigue al progreso es su **estado** (sello roto, guardián caído, santuario activo).
4. **Una sala en la que se ha estado se ve entera.** El mapa no tiene «niebla» dentro de una sala (la parte que el héroe no ha pisado también se dibuja): el juego cuenta salas, no celdas.
5. **El mapa solo conoce el mundo actual** (`WORLD`, cuatro salas): las salas nuevas se verán sin tocar código **si** sus salidas llevan a otra sala (el plano se calcula del grafo); una sala sin ninguna puerta que la una al resto va debajo, en fila.
6. **El juego sigue dibujando fotogramas con el menú abierto** (el mundo está parado, pero el lienzo se vuelve a pintar cada fotograma). No cambió en este encargo; **en un teléfono modesto un menú que pintara solo cuando algo cambia gastaría menos batería**. Es una mejora posible, no pedida.
7. **La carta, el HUD y el resto de la interfaz del juego no cambiaron**; el botón de pausa y el aviso de guardado son lo único que se movió.
8. **Navegadores:** Chromium. Firefox, Safari y iOS no se han visto (entre otras cosas, los gestos de pellizco y la rueda con Ctrl de un panel táctil en Safari).

---

## 10 · Cómo se usa

- **Jugador:** pulsa el botón de pausa (arriba a la derecha), `Esc`, `P` o *Start*. Se abre el mapa; arrastra con el dedo o el ratón, amplía con dos dedos, la rueda, `+`/`-` o los botones, `0` o el botón de la mira para volver a tu posición. Las opciones están a la derecha; «Mapa» o `Esc` vuelven; «Reanudar» sigue la partida.
- **Programador:** el mapa es `mapScene(buildMapLayout(WORLD, ROOMS), entrada)` (`src/world/worldMap.ts`); un mundo nuevo no necesita nada más que sus salas con sus salidas. La vista está en `src/ui/map/`; el menú pide la escena a su anfitrión (`PauseHost.map`), de modo que un anfitrión sin mapa (`map` ausente) abre el menú con «No hay mapa de este lugar.».
- **Pruebas de navegador:** `npx tsx tools/e2e/run.ts --only=pauseMap` (`TROID_E2E_STACK=1` imprime dónde falló una aserción).
