# Calibración móvil — qué se verificó y qué NO

> **Estado:** Prompt 6, S31 · **Aviso, sin letra pequeña:** **nada de este juego se ha calibrado en un iPhone, un iPad ni un Android reales.**
> No hay ninguna cifra de dispositivo en este documento y **no se ha inventado ninguna**. Lo que sí hay es: la **geometría** de la interfaz comprobada
> con números (pura, sin navegador), la **lógica** de los gestos probada con fuentes simuladas, y el juego **visto en Chromium sin GPU** con
> ventanas del tamaño de cada clase de móvil y con toques del protocolo DevTools (CDP). Los umbrales táctiles reales **siguen pendientes de prueba
> en un iPhone, un iPad y un Android**; las tablas de resultados de abajo están **vacías a propósito**.

---

## 1. Qué se ha comprobado aquí, con qué método y qué NO dice

| Qué | Cómo (reproducible) | Qué demuestra | Qué **no** demuestra |
|---|---|---|---|
| La **disposición** de los controles táctiles, el HUD, el botón de pausa y la barra del jefe en cada clase de pantalla (apaisado y vertical), con y sin *notch* / isla / esquinas redondeadas, a tres tamaños de controles (80 %, 100 %, 140 %), en los dos lados y en las posiciones que ofrece el menú | `tests/unit/ui/mobileGeometry.test.ts` (16 tests sobre funciones puras: **2 160 combinaciones** de ventana × margen × tamaño × lado × posición para los controles, más el HUD, la pausa y la barra), `bossBarLayout.test.ts`, `touchLayout.test.ts` | que **ninguna** combinación solapa dos zonas táctiles, saca algo del área segura, tapa el HUD, la pausa o la barra del jefe, ni deja la zona de movimiento inservible; que cada zona táctil mide **≥ 44 px CSS** | que el pulgar **alcance** cada botón sin incomodar, ni que el tamaño en milímetros sea cómodo (depende de la densidad real y de la mano) |
| La **lógica de los gestos** (correr, andar, zona muerta, saltar, agacharse, atravesar plataformas, varios dedos, cancelar) | `tests/unit/input/*`, `tests/integration/touchControls.test.ts` + sondeos aleatorios | que cada gesto da la acción que dice la especificación, que un dedo no cambia de dueño y que nada queda pulsado | que los **umbrales** (distancias en dp, tiempos) sean los que una mano real necesita |
| El juego **en ventanas del tamaño de cada clase** de móvil, con capa táctil y toques del protocolo DevTools | E2E `mobile` (`npm run test:e2e -- mobile`; Chromium con `isMobile` + `hasTouch`, densidad 2 – 3, márgenes de seguridad simulados con `?safe=`) | que lo anterior **se cumple en la página real** (los rectángulos del DOM, no solo las cuentas): cada botón mide ≥ 44 px, está dentro del área segura, no pisa a otro, ni al HUD, ni a la pausa; la barra del jefe está donde dice la función pura; la página no se desplaza ni se amplía; y **mover + atacar + esquivar + lanzar la habilidad + beber con varios dedos a la vez** funciona (cada botón responde donde está en el DOM y al soltar nada queda pulsado) | el rendimiento en un móvil (Chromium dibuja aquí **por software**: las cifras sirven para comparar, no son absolutas), el comportamiento de Safari o de Chrome para Android, ni el tacto. Un toque del protocolo DevTools es **un dedo perfecto** (sin radio ni presión, sin rechazo de palma, con el reloj de los toques **virtual**: los tiempos de los gestos no se han probado contra el reloj de un dispositivo) |
| **Densidad y resolución** (`devicePixelRatio` 1 – 3, tope de resolución por perfil) | `tests/unit/presentation/viewport.test.ts`, E2E `settings` (lienzo a 1055 / 1477 / 1688 px) y `mobile` (densidades 2, 2.625 y 3) | que el lienzo se dibuja a la resolución que dice el perfil | cuánto cuesta eso en una GPU móvil |
| **Guardado de la disposición** | E2E `settings` y `mobile` (la disposición guardada —el lugar y el tamaño de cada botón, el tamaño y la opacidad de todos— es la que la página coloca **desde el primer fotograma**; hasta el Prompt 14 era el lado y dos desplazamientos del bloque) | que lo que el jugador elige vuelve tras recargar | nada sobre un dispositivo |

Las clases de ventana (**tamaños en píxeles CSS, no mediciones de dispositivos**; se usan como clases de tamaño y nada más — no dicen «esto es un modelo X»):

| Clase | Apaisado (ancho × alto) | Notas de la prueba |
|---|---|---|
| móvil pequeño | 667 × 375 | con *notch* simulado: 47 px de margen lateral y 21 px abajo |
| móvil mediano | 844 × 390 | el tamaño de diseño del juego (referencia de `uiScale`); *notch* simulado |
| móvil grande | 932 × 430 | con isla simulada: 59 px laterales |
| Android alto | 915 × 412 | sin márgenes |
| móvil muy ancho | 1260 × 540 | 21:9 |
| tableta pequeña | 1133 × 744 | margen superior de 24 px y 20 abajo |
| tableta 4:3 | 1024 × 768 | el aspecto mínimo del área de juego |
| tableta | 1180 × 820 | (solo en las pruebas puras) |
| escritorio | 1280 × 720 | (solo en las pruebas puras) |
| ventana mínima | 568 × 320 | más pequeña que cualquier móvil al que apunta el juego: solo se exige que **nada se salga ni se pise** |
| vertical | 390 × 844 (y 820 × 1180 en las pruebas puras) | la imagen del juego queda pequeña con bandas; ver §6 |

### Lo que midió el E2E `mobile` en Chromium (no en dispositivos)

> **Medido en el Prompt 6, con el diseño de entonces** (un bloque de cuatro botones con un lado y dos desplazamientos). **El Prompt 15 cambió ese diseño** (tres botones con los PNG del artista, la disposición de la referencia y un lugar por botón): su escena `mobile` mide las mismas ventanas con la geometría nueva, y la regla común sigue siendo ésta —lo que se ve cabe, no se pisa y respeta el HUD, la pausa y la barra del jefe—. Las dos filas «lado izquierdo / al máximo hacia dentro» de abajo corresponden al modelo anterior.

Cada fila es lo que la **página** colocó (rectángulos del DOM) con el HUD en su mayor tamaño (cinco segmentos de vida, cuatro botellas, una carta equipada y el botón de botella visible):

| Ventana (densidad) | Controles táctiles (escala) | HUD (px) | Barra del jefe (ancho, px) |
|---|---|---|---|
| 667 × 375 (2) con *notch* | ×0.90 | 185 × 69 | 264 (se aparta de los botones: empieza en x = 134) |
| 844 × 390 (3) con *notch* | ×0.97 | 200 × 75 | 345 |
| 932 × 430 (3) con isla | ×1.07 | 220 × 82 | 374 |
| 915 × 412 (2.625) | ×1.03 | 211 × 79 | 421 |
| 1260 × 540 (2) | ×1.34 | 277 × 103 | 440 |
| 1133 × 744 (2) | ×1.34 | 277 × 103 | 440 |
| 1024 × 768 (2) | ×1.21 | 250 × 93 | 440 |
| 844 × 390, lado izquierdo, al máximo hacia dentro y arriba, ×1.4 | ×0.87 (**el tamaño pedido no cabe junto al HUD y cede**) | 200 × 75 | 345 |
| 667 × 375, derecha, al máximo hacia dentro y arriba, ×1.4 | ×1.26 | 185 × 69 | 264 |
| 390 × 844 vertical (3) | ×0.90 | 185 × 69 | 168 |

> **El HUD de esas filas es el anterior.** Desde el Prompt 17 el HUD es **el del artista**: un bloque de **218.3 × 78.9 dp** a `uiScale` (y al tamaño que elija el jugador), con 25.7 dp de margen a la zona segura (`ui/hud/layout.ts`). El E2E `mobile` lo mide, en esas mismas ventanas, en **196 × 71 px** (667 × 375 y 390 × 844), **212 × 77** (844 × 390), **234 × 84** (932 × 430), **224 × 81** (915 × 412), **293 × 106** (1260 × 540 y 1133 × 744) y **265 × 96** (1024 × 768): sigue arriba a la izquierda, dentro del área segura, sin tocar los botones, el botón de pausa ni la barra del jefe, y las reglas de abajo siguen valiendo. (El E2E `hud` lo comprueba además en 1024 × 768, 1280 × 720, 844 × 390, 1260 × 540 y 667 × 375, y con una muesca.)

---

## 2. Las reglas de la disposición (lo que las pruebas exigen en **todas** las combinaciones)

| Regla | Dónde se hace cumplir |
|---|---|
| Cada zona táctil (los tres botones, el chip de botella, la pausa, cada botella del HUD) mide **≥ 44 px CSS** a cualquier tamaño de ventana y de controles (también la Magia, cuya placa es de 31 dp: su zona táctil crece hasta un dedo) | `computeTouchLayout` (la escala de los botones nunca baja de **0.72** —`FIT_FLOOR`—, que es el 80 % a la escala mínima de la interfaz, 0.9), `HUD_DESIGN.vial.hitH`, `PauseButton` |
| Nada táctil sale del **área segura** (*notch*, isla, indicador de inicio, esquinas) | todas |
| Dos zonas táctiles **nunca se pisan** (un dedo = una acción) | `computeTouchLayout` |
| Los botones **no llegan al HUD, al botón de pausa ni a la sala de la barra del jefe**, estén donde estén (también los que el jugador movió): **el tamaño que pide el jugador cede ante lo que cabe**, nunca al revés (no se recorta lo que cabe: si cabe lo pedido, se respeta); y si ni así cabe, ceden de uno en uno la barra del jefe, la pausa, el HUD y la separación entre botones, por ese orden | `resolveButtons` (el lugar libre más cercano, exacto, + bisección del tamaño) |
| La placa de cada botón guarda su margen de los bordes laterales (28 dp × escala: el sistema se queda el borde) | `resolveButtons` |
| **Un lugar elegido por el jugador es una fracción del área segura**: al girar el teléfono o cambiar de ventana se vuelve a resolver contra la ventana de ese momento, y **jamás deja un botón fuera de pantalla ni inutilizable** (lo guardado, vuelto a pedir, es donde el botón se queda) | `resolveButtons` (idempotente), `repairSettings`, `touchLayout.test`, E2E `touchEditor` |
| La zona de movimiento conserva **≥ 30 %** del ancho útil (46 % si los botones la dejan) y ningún botón entra en ella | `computeTouchLayout` |
| La barra del jefe está dentro del área segura, mide **≥ 160 px** y **nunca queda bajo un botón**: se centra si puede y, si no, se desliza al tramo libre más ancho cercano al centro | `computeBossBarLayout` (puro) + `BossBarView.place` |
| El botón de pausa va en la **esquina superior derecha del área útil** (desde el Prompt 19; antes, arriba al centro); si la ventana es tan estrecha que el HUD y el botón no caben uno junto al otro, baja **por debajo del HUD**, nunca encima | `pauseOrigin` (puro), `PauseButton` |
| La página **no se desplaza ni se amplía** y ningún valor es `NaN` / infinito / negativo | E2E `mobile`, `mobileGeometry.test.ts` |

---

## 3. Los números que hay que calibrar en un dispositivo real

Todos son **datos**, no código: calibrar es editar un objeto, no un algoritmo. **Ninguno se ha tocado por una prueba de dispositivo.**

| Dato | Valor hoy | Dónde | Síntoma de que está mal | Qué probar |
|---|---|---|---|---|
| `rx`, `ry` | 56, 44 dp | `input/gestures/TouchConfig.ts` | el héroe no llega a correr o hace falta arrastrar mucho; agacharse es difícil | el recorrido del pulgar para correr y para agacharse, con una mano |
| `deadZoneX` | 12 % de `rx` | ídem | el héroe se mueve solo con el pulgar quieto, o no anda con un arrastre suave | apoyar el pulgar sin mover |
| `jumpEnter`, `jumpRearm`, `jumpHold` | 0.55, 0.25, 0.30 | ídem | **saltos accidentales por deriva del pulgar al correr (R18)**, o saltar cuesta | correr 30 s seguidos con una mano sin querer saltar |
| `dropFlickDistance`, `dropFlickWindowMs` | 28 dp, 100 ms | ídem | atravesar una plataforma fina falla o salta sola | el gesto de bajada rápida, 20 veces |
| `leftZoneWidth` | 46 % del ancho útil | ídem | la zona de movimiento es demasiado grande o pequeña para el pulgar | zonas en pantallas anchas y estrechas |
| `edgeMargin` | 28 dp | ídem | los gestos del sistema (volver, cambiar de app) se disparan al pulsar un botón | tocar los botones más cercanos al borde |
| posición y diámetro de los 3 botones **de la referencia** | Ataque (−65, −100) · Dash (−166, −63) · Magia (−126, −109) dp desde la esquina inferior derecha segura; placas de 70 · 70 · 31 dp | `BUTTON_DESIGN` en `input/gestures/TouchConfig.ts` | un botón queda fuera del alcance natural del pulgar, o se pisa al sujetar el móvil | sujetar el móvil y tocar cada botón sin cambiar el agarre (la disposición es la de la referencia, **no una calibrada**) |
| el chip de botella | placa de 52 dp, cuelga a 16 dp sobre el Ataque | `TOUCH_DESIGN.chip` | se pulsa sin querer al atacar, o no se ve | pelear con una botella lista |
| la zona táctil de cada botón | placa + 8 dp, nunca menos de 44 px; las placas vecinas se reparten el hueco | `PAD`, `MIN_TOUCH` en `ui/touch/layout.ts` | el pulgar roza el botón de al lado | pulsar Ataque y Dash en rápida sucesión |
| la separación entre placas | 8 dp (al menos) | `BUTTON_GAP` | se pulsa el vecino | ídem |
| el tamaño de un botón puesto por el jugador | 70 – 150 % del de diseño, sobre el de todos (80 – 140 %) | `TOUCH_LIMITS` en `save/SettingsData.ts` | el máximo no basta para la mano, o el mínimo es incómodo | editar la disposición a una mano |
| el suelo del tamaño cuando no caben | 0.72 | `FIT_FLOOR` | los botones pequeños no se encuentran con el pulgar | el lado izquierdo con los controles grandes y arriba, en el móvil más bajo que haya |
| `uiScale` | `min(ancho, alto × 2.1) / 844`, acotado a 0.9–1.6 | `input/gestures/TouchConfig.ts` | todo se ve pequeño en una tableta o enorme en un móvil muy ancho | mirar las tabletas y los móviles de 21:9 |
| altura de los botones de botella del HUD | **49 dp** de alto (44 px CSS a la escala mínima 0.9), paso de **19.8 dp** (el de la fila de botellas del artista; los cuadros táctiles no se pisan) | `ui/hud/layout.ts` (`HUD_DESIGN.vial`) | se pulsa la botella vecina | beber con el pulgar en el HUD |
| tamaño del botón de pausa | 50 px (disco visible de 38) | `ui/settings/PauseButton.ts` | se pulsa sin querer, o no se encuentra | abrir y cerrar el menú en movimiento |
| ancho de la barra del jefe | 46 % del ancho útil, entre 160 y 440 px | `ui/hud/bossBarLayout.ts` (`BOSS_BAR`) | el nombre o la barra no se leen a la distancia a la que se juega | pelear con el Custodio mirando la barra |

---

## 4. Protocolo de prueba en dispositivo (para quien tenga uno)

Para **cada** dispositivo (iPhone con Safari, iPad con Safari, Android con Chrome; idealmente uno de gama baja):

1. **Anotar**: modelo, versión del sistema y del navegador, tamaño de ventana (`window.innerWidth × innerHeight`), densidad, márgenes de seguridad (`env(safe-area-inset-*)`) en apaisado.
2. **Cargar** el juego y abrir `?debug=1` (panel de depuración: fotogramas por segundo, llamadas de dibujo). Anotar los fotogramas medios y los peores durante la pelea con el Custodio (R4).
3. **Agarre y alcance:** con las dos manos y con una, ¿se llega al Ataque, al Dash, a la Magia y a la botella sin cambiar el agarre? Probar la otra mano (menú → Controles → Botones táctiles → Editar disposición → Invertir lados) y mover cada botón.
4. **Deriva del pulgar (R18):** correr por R1 30 s sin intención de saltar. Contar saltos accidentales.
5. **Gestos:** correr/andar (zona muerta), saltar (arrastre hacia arriba), agacharse, atravesar plataforma (gesto rápido hacia abajo), mantener el salto, varios dedos a la vez (mover + atacar + esquivar).
6. **Bordes:** pulsar los botones más cercanos al borde y los gestos del sistema (¿se dispara el «volver»?).
7. **Navegador:** ¿se desplaza, se hace zoom, aparece el menú de pulsación larga o la selección de texto al jugar? ¿Qué pasa al **ocultarse la barra de direcciones** a mitad de partida (el `resize` suelta los dedos: ver `docs/PROMPT5-LOG.md` S13)? Girar el dispositivo a mitad de partida.
8. **Menú:** abrir con el botón de pausa, editar la disposición de los botones y guardarla, el volumen y la calidad (Baja / Alta), recargar y comprobar que se conserva.
8b. **Pausa y mapa (Prompt 19):** el botón de pausa está arriba a la derecha: ¿se alcanza sin soltar el teléfono y sin pisar Ataque? Al abrirlo, **el mapa es lo primero que se ve**: ¿se lee la sala, la puerta cerrada, el héroe y el nombre de la zona? **Arrastrar con un dedo, ampliar con dos, y pulsar una opción (o el botón «+») justo al soltar** (el caso en el que Chromium no hace `click`: ¿abre la opción a la primera?); girar el dispositivo con el menú abierto; las siete opciones ¿miden un dedo y caben sin recortar el mapa?; con *notch*: ¿se cubre algo del marco? Volver al mapa con «Mapa» y con el gesto de volver del sistema; **cuántos fotogramas da y cuánto se calienta con el menú abierto** (el juego sigue pintando el lienzo parado).
9. **HUD y barra del jefe:** ¿se leen las botellas y la vida sin taparlas con la mano? ¿Se lee el nombre y la barra del Custodio mientras se pelea (¿lo tapa un pulgar?)?
10. **Rendimiento:** con la calidad en Baja y en Alta, ¿mantiene 60 fotogramas?, ¿se calienta?
11. **Escribir** lo observado en §5 **con lo que se vio**, no con lo que se esperaba. Si un umbral cambia, cambiar el dato y anotar el valor viejo y el nuevo.

---

## 5. Resultados en dispositivo — **SIN MEDIR**

| Dispositivo | Sistema y navegador | Ventana · densidad · márgenes | Umbrales cambiados (antes → después) | Salto accidental / alcance / gestos | Rendimiento (FPS) | Notas |
|---|---|---|---|---|---|---|
| iPhone — *sin medir* | | | | | | |
| iPad — *sin medir* | | | | | | |
| Android — *sin medir* | | | | | | |
| Android de gama baja — *sin medir* | | | | | | |

---

## 6. Límites conocidos de lo que hay

- **Vertical.** El juego está pensado **apaisado**. En vertical el área de juego (≥ 4:3) queda pequeña con bandas y la bandera `rotateDevice` del *viewport* existe (el E2E comprueba que se activa), pero **no hay aviso de «gira el dispositivo»** todavía (queda para P7). La geometría se comprueba también en vertical (todo dentro de la ventana, nada se pisa; el botón de pausa pasa a estar junto al HUD y no encima), pero **no se ha jugado así en un móvil**.
- **Cambios de tamaño.** Un `resize` suelta todos los dedos (decisión de seguridad): en un navegador móvil cuya barra se esconde a mitad de partida puede notarse. Pendiente de dispositivo.
- **El tamaño pedido cede ante el HUD.** (Medido en el Prompt 6, con el modelo del lado y los desplazamientos.) Sobre **2 880 combinaciones** (10 ventanas, 4 márgenes, 4 tamaños, 2 lados, 9 posiciones), el tamaño que pide el jugador cede en **392 (14 %)**: **39 a la derecha** —el diseño—, todas en la ventana mínima de 568 × 320, y **353 a la izquierda** (el botón de botella cuelga arriba del bloque y, al espejarse, queda bajo el HUD). A la derecha **nunca cede** en una ventana de móvil o de tableta (lo fija una prueba). El peor caso baja hasta el suelo (0.72). Es una decisión de diseño —el tamaño del menú es una preferencia y la ventana decide lo que cabe—, no un fallo; el menú **no avisa** de ello todavía.
- **Teclas y mando:** las teclas del teclado se pueden cambiar (S30); **el mando y el táctil no** (el táctil son gestos). Tampoco se ha probado con un mando físico.
- **Sonido:** no hay; el volumen del menú está preparado, no suena nada.
- **Rendimiento:** medido solo con Chromium dibujando por software (`bench:bundle` mide **bytes**, no fotogramas). Un móvil de gama baja puede necesitar el perfil Bajo; **«Auto» solo mide la duración de los fotogramas** (desde el Prompt 20: empieza equilibrada y baja sola a «Baja», una vez, si la mayoría de los fotogramas de varios segundos pasan de 24 ms; nunca sube ni se guarda; no mira el modelo ni la GPU) — **su umbral nunca se ha visto en un teléfono real: anote en la tabla de abajo si bajó, a qué segundo y en qué sala**.
- **Safari / Chrome para Android:** el juego usa `env(safe-area-inset-*)` y el tamaño del contenedor, no `100vh`; no se ha visto cómo se comportan los dos con la barra de direcciones que aparece y desaparece. Pendiente de dispositivo.

---

## 7. Calibración visual de los Prompts 8 y 9 — **SIN MEDIR**

Lo anterior es la geometría de los controles. El Prompt 8 añadió arte, luz y un telón de arranque y el Prompt 9 **animó al protagonista**, y **nada de ello se ha visto en un dispositivo real**: todo lo medido (contraste, llamadas de dibujo, bytes, tiempos) es de Chromium sin cabeza con GL por software. Estos son los datos que mandan en lo que se ve; **calibrarlos es editar un objeto, no un algoritmo**.

| Dato | Valor hoy | Dónde | Síntoma de que está mal | Qué probar |
|---|---|---|---|---|
| luz del héroe | `0.2 → 0.46` según la magia, radio 3.8 m (tope 0.5) | `content/lights.ts` (`LIGHT_STRENGTH.hero`, `LIGHT_RECIPES.hero`) | el héroe se pierde en R2 (el anillo de 1 m está a 1.6 : 1) o la luz lo quema | verlo en R2 (la sala más oscura) en interior y al sol, con el brillo del teléfono al 50 % y al 100 % |
| charco del suelo | `0.12 → 0.24`, radio 3.2 m | ídem (`floor`) | el suelo se ve como una mancha, o no se ve dónde se pisa | caminar por una pasarela fina y por el suelo de R3 |
| el aviso violeta bajo la luz del héroe | la luz cede hasta 0.6 (tope 0.75) | ídem (`duck`) | no se lee el aviso del Slime (el E2E mide 1498 px violeta con luz y 868 sin ella) | un Slime que carga en R1 y el Custodio en R4, con y sin `?light=off` |
| viñeta de cada sala | esquinas 0.5 / 0.52 / 0.52 / 0.62, pelea 0.7; mitad de un borde ≤ 0.34 | `content/atmosphere.ts` (`ROOM_MOODS`, `FIGHT_MOOD`) | una plataforma de lo alto de un salto desaparece, o se ve **banding** (escalones) en los degradados oscuros | saltar al borde de la pantalla en R2 y en R4; mirar la viñeta en una LCD y en una OLED |
| pulsos de borde | herida 0.3 / 0.42 s · poder 0.26 · descanso 0.18 · jefe 0.26 · caída 0.34 | ídem (`EDGE_PULSES`) | el rojo de la herida molesta o no se nota | recibir un golpe del Slime a 1× |
| capacidad de luces y pulsos por perfil | 3 / 6 / 8 y 2 / 3 / 4 | `presentation/lighting.ts` (`LIGHT_CONTRACT.capacity`, `PULSE_CONTRACT.capacity`) | caída de fotogramas en la pelea del Custodio (la luz del jefe, un charco de 6.8 m) | la pelea en R4 con la calidad en Baja y en Alta |
| presupuesto de efectos por perfil | partículas 150 / 300 / 400 · *sprites* 24 / 40 / 64 | `presentation/vfx.ts` (`PARTICLE_BUDGET`, `SPRITE_FX_BUDGET`) | caída de fotogramas o se pierden efectos | el momento más cargado: una pelea con *Spirit Bolt*, golpes y el jefe |
| espera máxima del telón | 10 s | `app/curtain.ts` (`CURTAIN_TIMEOUT_MS`) | en una red lenta el juego empieza como *blockout* y salta al arte | arrancar en frío con datos móviles flojos (3G, 4G a mitad de barras) |
| tamaño de lo que se lee | el Slime mide 29 px de ancho a 1× (29 px/m); las formas finas de los efectos son 2 px | las piezas de `art/` (`tools/art`) | no se distingue la silueta del Slime del suelo, o los efectos finos desaparecen | R1 y R2 con el Slime, a 1× y a la escala de un móvil pequeño |
| contraste de la silueta | 2.5 : 1 (aviso del spec); medido 1.6–3.25 : 1 (**2 de 8** puntos lo superan) | `docs/GAME-SPEC-2D.md` §3.3 | no se ve al héroe sobre el fondo | los 8 puntos de `PROMPT8-LOG` (fase I) sobre el aparato |
| **la marcha del héroe** (Prompt 16; antes, Prompt 9) | `walk` 12 fps, 6 fotogramas (0.5 s por ciclo); `run` 12.5 fps, 5 fotogramas (0.4 s): **los mismos ciclos que antes**; la cadencia sigue a la velocidad con el tope de ½ a 1½ | `art/player/player.pack.json`, que escribe `npm run assets:intake -- <clip> --accept` desde la hoja de personaje | los pies resbalan sobre el suelo (**la hoja trae 6 y 5 poses por ciclo, no 8**), el paso parece rápido o lento | caminar y correr en la pantalla de un móvil a 1× |
| **el ritmo de reposo** (Prompt 16; antes, Prompt 9) | `idle` 2 fps, **2 fotogramas** (las dos poses de respiración de la hoja: una respiración por segundo) | ídem | el héroe parece nervioso, o muerto, o **quieto**: son solo dos poses | mirarlo parado en R1 diez segundos |
| **el peso de un golpe** (Prompt 16; antes, Prompt 9) | `attack1` **4 fotogramas** a 16 fps pintados por las fases de la simulación: anticipación 4 *ticks* (67 ms) → fotograma 0 · activa 3 → fotogramas 1 y 2 · recuperación 8 → fotograma 3 | ídem (la duración es de `content/attacks.ts`, que **no se tocó**) | no se lee la anticipación, la hoja «salta» (es corta: 0.35–0.5 m), el corte no pesa; **el arco del tajo es el del motor y no sale de la hoja** | el primer golpe, a 1×, a 844 × 390 |
| **el peso del atlas del héroe** (Prompt 16; antes, Prompt 9) | **0.84 MB de PNG, 4.0 MiB decodificados** (1024 × 1016, una página; antes 1.69 MB y 7.0 MiB: 1344 × 1344), en el camino crítico del arranque | `public/art/player/hero_0.png` | el telón tarda más; un teléfono viejo tarda en decodificar la página | el arranque en frío con datos flojos (paso 2 del protocolo) y la memoria en R2 y R4 |

### Protocolo (para quien tenga un dispositivo)

1. **Anotar**: modelo, versión del sistema y del navegador, tipo de pantalla (OLED / LCD), brillo, densidad, red.
2. **Arranque en frío sin caché** (cerrar el navegador, limpiar los datos del sitio): ¿se ve **el telón** (negro y una luz que respira)? ¿Cuánto tarda en aparecer la primera sala (cronómetro)? ¿Se ve **algún cuadro de rectángulos planos o de una cápsula**? (no debe verse ninguno). Repetir con la red lenta.
3. **Recorrer R1 → R4** con `?debug=1` y anotar los fotogramas medios y los peores: en R2 (raíces, espinas), en R3 (el sello y el rayo) y en la pelea con el Custodio.
4. **Mirar al héroe**: en R2 y en la sala más oscura de R4, ¿se le ve de pie contra el fondo? Con `?light=off` en la misma pantalla, ¿cuánto empeora?
5. **Los avisos violetas**: el Slime que carga y los avisos del Custodio (lluvia, embestida) con la luz del héroe encendida: ¿se leen a la distancia a la que se juega?
6. **Los bordes de la pantalla**: la viñeta en una pantalla clara y en una oscura; el pulso rojo de la herida; ¿se ve *banding*?
7. **Calidad**: los fotogramas con la calidad en Baja, Equilibrada y Alta, y si el teléfono se calienta tras 10 minutos.
8. **Ver moverse al héroe** (Prompt 9): quieto, andando, corriendo, un salto con su caída y aterrizaje, los dos golpes, agacharse y andar agachado, un golpe recibido, beber, morir. ¿Se leen **las poses** a 1×? ¿Alguna se ve como un salto de un dibujo a otro (**los cortes entre dibujos** son un límite conocido)? ¿Los 9 *stand-ins* (agachado, *dash*, muerte, beber…) **se ven provisionales**?
9. **Escribir lo observado en la tabla de abajo con lo que se vio, no con lo que se esperaba.** Si un dato cambia, cambiar el dato y anotar el valor viejo y el nuevo.

### Resultados en dispositivo — **SIN MEDIR**

| Dispositivo | Pantalla y red | Primera imagen (s) | Datos cambiados (antes → después) | Héroe legible (R2 / R4) | Avisos legibles | Fotogramas (peor momento) | Notas |
|---|---|---|---|---|---|---|---|
| iPhone — *sin medir* | | | | | | | |
| iPad — *sin medir* | | | | | | | |
| Android — *sin medir* | | | | | | | |
| Android de gama baja — *sin medir* | | | | | | | |

## 8. La interfaz del Prompt 14 (HUD, pausa, partidas) — **SIN MEDIR** (el HUD es, desde el Prompt 17, el del artista)

El HUD, el botón de pausa, el menú, el aviso de guardado y el guardado en sí **no se han visto ni tocado en un dispositivo real**: la geometría está auditada con funciones puras (10 clases de ventana × 4 márgenes seguros × tamaños × lados × posiciones, **también con la interfaz al 85–135 %**) y lo que se ve se fotografió en Chromium sin cabeza (844 × 390 a 2×, 390 × 844 a 2×, 1280 × 720). Lo que sigue son los datos que mandan y qué mirar:

| Dato | Valor hoy | Dónde | Síntoma de que está mal | Qué probar |
|---|---|---|---|---|
| tamaño del HUD | el bloque del artista (218.3 × 78.9 dp) a 1×, escala con la ventana (`uiScale`, tope 1.6) y con el ajuste (0.85–1.35) | `ui/hud/layout.ts` (`computeHudLayout`, `HUD_DESIGN`), `ui/hud/artGeometry.ts`, `SettingsData.accessibility.hudScale` | los dos números de las barras no se leen; el HUD tapa algo o lo tapa un dedo | un teléfono pequeño en horizontal con el ajuste en 100 % y en 135 % |
| nitidez y dígitos del HUD del artista | los PNG del artista (2560 × 1440) reducidos unas 12 veces por el navegador; los dos números los escribe el navegador con la tipografía ligera del sistema | `ui/hud/png/`, `ui/hud/HudView.ts` (`NUMBER_FONT`) | las barras o el retrato se ven granulosos; los dígitos se ven finos o desalineados sobre la barra, o cambian de forma de un teléfono a otro | mirar el HUD a 2× y 3× (iOS y Android) con la partida nueva y con 5 de 100 de vida |
| objetivos táctiles | ≥ 44 px (frascos del HUD, botón de pausa, botones del menú) | `ui/hud`, `ui/settings/PauseButton.ts`, `menuStyle.ts` | se pulsa el frasco de al lado; el botón de pausa se pulsa sin querer | beber con el pulgar mientras se mueve con el otro; abrir la pausa a una mano |
| el botón de pausa | **arriba a la derecha** (Prompt 19), por encima de los tres botones y a la derecha del HUD; bajo el HUD en una ventana estrecha | `pauseOrigin`, `PauseButton.pauseBox` | choca con una muesca, con la barra del navegador o con el pulgar que sostiene Ataque; no se alcanza con la mano que sostiene el teléfono | un teléfono con *notch* y con la barra del navegador visible; abrir la pausa a una mano y con el pulgar derecho en Ataque |
| el menú en horizontal bajo | un teléfono en horizontal mide ≈ 390 px de alto: el centro de cada pantalla **se desplaza** y sus últimas líneas se desvanecen mientras hay más abajo | `ui/settings/menuStyle.ts`, `scrollHint.ts` | no se ve que hay más abajo, o el desvanecido tapa un control | Ajustes y Partidas en horizontal; Controles en inglés (textos más largos) |
| el aviso de guardado | arriba a la derecha dentro del área segura, **justo debajo del botón de pausa** (Prompt 19); «Guardado» dura 1.5 s | `ui/overlays/SaveNotice.ts`, `saveNoticeModel.ts` (`NOTICE_HOLD`) | se ve como ruido en una pelea, o una advertencia desaparece antes de leerse | jugar una pelea con guardados al ganar algo; provocar «no se pudo guardar» |
| exportar e importar | un archivo `troid-partida-N-AAAA-MM-DD.json` por un enlace `download`; el archivo entra por un `<input type="file">` | `app/files.ts` | iOS Safari no ofrece guardar el archivo o el selector no deja elegirlo | exportar una partida y volver a importarla en iOS y en Android |
| protección del almacenamiento | `navigator.storage.persist()` solo con el botón | `app/storage.ts` | el navegador lo concede sin avisar, o lo niega siempre | pulsar el botón en cada navegador y mirar lo que dice la pantalla |
| borrado por falta de espacio | el guardado vive en `localStorage` | `app/storage.ts` | Safari borra el almacenamiento de un sitio sin uso (7 días) salvo que esté instalado en la pantalla de inicio | no jugar una semana en Safari, y jugar con la página instalada |

### Resultados en dispositivo — **SIN MEDIR**

| Dispositivo | HUD legible (cifras, frascos) | Pausa y menú (tacto, desplazamiento) | Aviso de guardado | Exportar / importar | Notas |
|---|---|---|---|---|---|
| iPhone — *sin medir* | | | | | |
| iPad — *sin medir* | | | | | |
| Android — *sin medir* | | | | | |
| Android de gama baja — *sin medir* | | | | | |

---

## 9. Los botones del Prompt 15 (PNG del artista y editor) — **SIN MEDIR**

Los tres botones (los PNG del artista), su disposición por defecto (la de la referencia) y el editor **no se han visto ni tocado en un dispositivo real**: la geometría está auditada con funciones puras (8 ventanas × 4 márgenes × 3 tamaños × lugares al azar, más las 10 clases de `mobileGeometry`) y lo que se ve se fotografió y se midió en Chromium sin cabeza (844 × 390 a 2×, con toques de DevTools). Lo que hay que mirar:

| Qué | Valor hoy | Síntoma de que está mal | Qué probar |
|---|---|---|---|
| la disposición de la referencia | ver §3 | un botón fuera del alcance del pulgar; la Magia (31 dp) difícil de encontrar | jugar un combate entero con una mano y con dos |
| **la nitidez de los PNG reducidos** | 2560 × 1440 escalados a ≈ 70 dp (140 – 210 px en pantalla) por el navegador | los bordes de la placa o el glifo se ven con dientes o borrosos en una pantalla de 2 – 3× | mirar los tres botones de cerca en un iPhone, un iPad y un Android de gama alta y baja |
| el peso de las imágenes | 40, 48 y 55 KB (sin tocar), pedidas la primera vez que la capa se muestra | el botón tarda en aparecer con mala red | cargar en 3G simulado: la capa debe seguir respondiendo (los botones están aunque la imagen no) |
| **arrastrar en el editor a los bordes** | el botón se detiene a 28 dp × escala del borde lateral | el gesto del sistema (volver, cambiar de app) se come el arrastre o lo cancela | arrastrar un botón hacia el borde izquierdo y derecho en iOS y en Android 10+ |
| **«Guardar» justo después de arrastrar** | actúa al **levantar el dedo** (`onPress`): Chromium no hace `click` de ese toque | iOS Safari o Firefox móvil se comportan distinto (doble acción, ninguna) | arrastrar un botón y pulsar «Guardar» sin una pausa entre medias, 20 veces |
| el editor con la barra de direcciones que se esconde | el editor se recoloca con el `resize` | el botón salta, o la capa real vuelve antes de tiempo | abrir el editor y hacer que la barra del navegador aparezca y desaparezca |
| la zona de movimiento tras recolocar los botones | se pone en el lado contrario al del centroide de los botones | el pulgar que corre cae sobre un botón | mover los tres botones a la izquierda y correr |
| el botón apagado (Dash recargando, Magia sin magia) | 45 % de opacidad; sigue siendo tocable | no se entiende que no responde | pulsar el Dash dos veces seguidas; lanzar magia sin magia |

### Resultados en dispositivo — **SIN MEDIR**

| Dispositivo | PNG nítidos | Alcance del pulgar (referencia) | Editor (arrastre, bordes, Guardar) | Notas |
|---|---|---|---|---|
| iPhone — *sin medir* | | | | |
| iPad — *sin medir* | | | | |
| Android — *sin medir* | | | | |
| Android de gama baja — *sin medir* | | | | |

## 10. El audio del Prompt 18 — **SIN MEDIR**

El audio se ha verificado **solo en un Chromium 141 sin cabeza** (escena E2E `audio`): allí el contexto arranca solo, la regla de *autoplay* **no se aplica** (medido: un contexto de una página que nadie ha tocado arranca `running`) y no hay altavoces. **Nada de lo que sigue se ha visto, ni oído, en un dispositivo real** ([PROMPT18-LOG §9](PROMPT18-LOG.md#9--lo-que-sigue-sin-existir)).

| Qué | Por qué importa | Qué probar | Síntoma de que está mal |
|---|---|---|---|
| el **desbloqueo** con el primer toque | los navegadores no dejan sonar a una página que nadie ha tocado; Safari exige `resume()` dentro del gesto (`touchend`, `pointerup`, `click`, `keydown`) | abrir la página y tocar la pantalla (o una tecla) una vez | no suena nada tras el primer toque, o suena solo tras el segundo |
| el **interruptor de silencio** del iPhone | en iOS silencia WebAudio salvo que la página diga que es «reproducción» (`navigator.audioSession.type = 'playback'`, Safari 16.4+) | con el interruptor en silencio, jugar | no suena nada con el interruptor puesto (en iOS anteriores a 16.4 es lo esperado: el juego no puede evitarlo) |
| **Ogg Opus y MP3** | el navegador elige con `canPlayType`; Safari reciente toma Opus, el anterior cae al MP3 | mirar `__troid.audio().formats` con `?hooks=1&audio=on` | el juego en silencio con «this browser plays none of the formats» en la consola |
| **bucles sin hueco en MP3** | un decodificador que no lea el relleno del MP3 (~23 ms) añadiría un silencio al principio de cada vuelta de la música y de las camas | oír una cama 30 s (12 s de bucle) y una pieza dos vueltas (43 s) | un «tic» o un vacío cada vuelta |
| la **memoria** del fundido entre dos piezas | ~66 – 70 MiB decodificados con las dos sonando | pasar R2 → R3 en un teléfono modesto, varias veces seguidas | la pestaña se recarga o el sonido se corta |
| el **segundo plano** y las llamadas | el contexto se congela al ocultarse la página; en iOS aparece el estado `interrupted` | recibir una llamada, cambiar de app y volver | el sonido no vuelve, o vuelve duplicado |
| los **auriculares Bluetooth** | añaden 100 – 200 ms de latencia que ninguna página puede quitar | pegar con la espada y oír el golpe | el golpe llega tarde (solo es un límite del medio) |
| el **mando** | un botón de mando **no** cuenta como gesto: quien juegue solo con mando no oirá hasta tocar una tecla, el ratón o la pantalla | jugar solo con mando | no suena nada |
| los **cuatro deslizadores** con el pulgar | el menú de Ajustes los pone en horizontal bajo | moverlos y oír el cambio al instante | un deslizador que no responde, o cuyo valor no se oye |

### Resultados en dispositivo — **SIN MEDIR**

| Dispositivo | Desbloqueo | Silencio de iOS | Formato | Bucles | Memoria | Segundo plano | Notas |
|---|---|---|---|---|---|---|---|
| iPhone — *sin medir* | | | | | | | |
| iPad — *sin medir* | | | | | | | |
| Android — *sin medir* | | | | | | | |
| Android de gama baja — *sin medir* | | | | | | | |
| Escritorio (Chrome, Firefox, Safari) — *sin medir* | | | | | | | |

## 11. Lo que añadió el Prompt 20 y hay que ver en un dispositivo — **SIN MEDIR**

> Detalle y razones: [PROMPT20-LOG §6, §7](PROMPT20-LOG.md); la lista completa para publicar, con los dispositivos que hacen falta: [PUBLISHING §6.3](PUBLISHING.md#63-comprobaciones-en-dispositivo-lo-que-no-se-ha-podido-hacer).

| Qué | Qué se comprobó (en Chromium, con toques CDP y ventanas emuladas) | Qué mirar en un dispositivo | Qué sería un fallo |
|---|---|---|---|
| **El toque que cierra un menú** | un dedo en «Continuar» ya no ataca (los eventos de ratón que el navegador fabrica tras un toque, en los 700 ms siguientes a levantarse el dedo, no son un clic) | tocar «Continuar», «Seguir explorando» y «Jugar así» en un teléfono real, varias veces | el héroe da un espadazo al reanudar |
| **El aviso de girar el dispositivo** | en un móvil y en una tableta verticales (muesca simulada) queda bajo el HUD, dentro de la zona segura, sin tocar el botón de pausa ni los táctiles; «Jugar así» lo cierra; girar lo cierra; volver a vertical lo repite | sujetar el teléfono en vertical y girarlo: con la muesca real, con la isla dinámica, con un plegable | el aviso tapa el HUD o un botón, no se va al girar, o se queda tras «Jugar así» |
| **Perder el foco / segundo plano** | `blur` y `visibilitychange` abren la pausa; ninguna tecla ni dedo queda pulsado; el mundo no avanza | llamada entrante, pantalla de bloqueo, cambiar de aplicación, el centro de control de iOS, la sombra de notificaciones de Android | el héroe sigue corriendo al volver, o hay una ráfaga de simulación |
| **El botón Atrás de Android** | contrato probado con un doble del *plugin* `@capacitor/app` | con la cáscara de Capacitor: Atrás en el juego (abre la pausa), en el mapa, en una pantalla (vuelve al mapa), en el cierre (sigue explorando) | cierra la aplicación |
| **Guardado nativo** | contrato probado con un doble de `@capacitor/preferences`; el juego comprueba que funciona antes de fiarse | ganar algo, matar la aplicación desde el selector, reabrirla | la partida no está |
| **Mando Bluetooth en los menús** | un mando abstracto recorre todas las pantallas (alcanzabilidad medida sobre la disposición real a 1280×720 y 844×390) | un mando real: cruceta y stick, A, B, deslizadores, el mapa; desconectarlo en pleno juego | un control inalcanzable, una pulsación doble, el foco perdido |
| **Legibilidad** | contraste WCAG ≥ 4,5 : 1 y letra ≥ 11 px medidos en 16 pantallas, en los dos idiomas | leer las pantallas a la distancia de un teléfono en exteriores | algo que no se lee |
| **Audio con el interruptor de silencio de iOS** | no comprobable en este entorno | un iPhone con el interruptor puesto y sin él | silencio con el interruptor puesto (ver PUBLISHING §6.3) |

### Resultados en dispositivo — **SIN MEDIR**

| Dispositivo | Toque que cierra el menú | Aviso de girar | Foco y segundo plano | Atrás | Guardado nativo | Mando | Notas |
|---|---|---|---|---|---|---|---|
| iPhone — *sin medir* | | | | — | | | |
| iPad — *sin medir* | | | | — | | | |
| Android — *sin medir* | | | | | | | |
| Android de gama baja — *sin medir* | | | | | | | |
