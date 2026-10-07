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
| **Guardado de la disposición** | E2E `settings` y `mobile` (la disposición guardada —lado, posición, tamaño— es la que la página coloca **desde el primer fotograma**) | que lo que el jugador elige vuelve tras recargar | nada sobre un dispositivo |

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

---

## 2. Las reglas de la disposición (lo que las pruebas exigen en **todas** las combinaciones)

| Regla | Dónde se hace cumplir |
|---|---|
| Cada zona táctil (los cuatro botones, la pausa, cada botella del HUD) mide **≥ 44 px CSS** a cualquier tamaño de ventana y de controles | `computeTouchLayout` (la escala de los botones nunca baja de **0.72**, que es el 80 % a la escala mínima de la interfaz, 0.9: el botón más pequeño, el de botella, mide entonces 46 px), `HUD_DESIGN.vial.hitH`, `PauseButton` |
| Nada táctil sale del **área segura** (*notch*, isla, indicador de inicio, esquinas) | todas |
| Dos zonas táctiles **nunca se pisan** (un dedo = una acción) | `computeTouchLayout` |
| Los botones **no llegan al HUD**: **el tamaño que pide el jugador cede ante lo que cabe**, nunca al revés (no se recorta lo que cabe: si cabe lo pedido, se respeta) | `computeTouchLayout` (`fits` + bisección) |
| El borde del que cuelgan los botones conserva su margen (28 dp: el sistema se queda el borde) | `computeTouchLayout` |
| La zona de movimiento conserva **≥ 25 %** del ancho útil y ningún botón entra en ella | `computeTouchLayout` |
| La barra del jefe está dentro del área segura, mide **≥ 160 px** y **nunca queda bajo un botón**: se centra si puede y, si no, se desliza al tramo libre más ancho cercano al centro | `computeBossBarLayout` (puro) + `BossBarView.place` |
| El botón de pausa va **arriba al centro del área útil** (junto al HUD, no encima, si la ventana es más estrecha que él) | `PauseButton` |
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
| posición y diámetros de los 4 controles | `TOUCH_CONTROLS` (Atacar 104, Esquivar 84, Habilidad 84, botella 64 dp de zona táctil) | `ui/touch/layout.ts` | un botón queda fuera del alcance natural del pulgar, o se pisa al sujetar el móvil | sujetar el móvil y tocar cada botón sin cambiar el agarre |
| alcance de la posición ajustable | 120 dp hacia dentro, 90 hacia arriba | `PLACEMENT_RANGE` | no basta para sacar los botones del agarre de la mano | probar el lado izquierdo y las posiciones extremas |
| `uiScale` | `min(ancho, alto × 2.1) / 844`, acotado a 0.9–1.6 | `input/gestures/TouchConfig.ts` | todo se ve pequeño en una tableta o enorme en un móvil muy ancho | mirar las tabletas y los móviles de 21:9 |
| escala mínima de los controles cuando ceden ante el HUD | 0.72 (el 80 % a la escala mínima de la interfaz) | `SMALLEST` en `ui/touch/layout.ts` | los botones pequeños no se encuentran con el pulgar | el lado izquierdo con los controles grandes y arriba, en el móvil más bajo que haya |
| altura de los botones de botella del HUD | **49 dp** de alto (44 px CSS a la escala mínima 0.9), paso de 36 dp | `ui/hud/layout.ts` (`HUD_DESIGN.vial`) | se pulsa la botella vecina | beber con el pulgar en el HUD |
| tamaño del botón de pausa | 50 px (disco visible de 38) | `ui/settings/PauseButton.ts` | se pulsa sin querer, o no se encuentra | abrir y cerrar el menú en movimiento |
| ancho de la barra del jefe | 46 % del ancho útil, entre 160 y 440 px | `ui/hud/bossBarLayout.ts` (`BOSS_BAR`) | el nombre o la barra no se leen a la distancia a la que se juega | pelear con el Custodio mirando la barra |

---

## 4. Protocolo de prueba en dispositivo (para quien tenga uno)

Para **cada** dispositivo (iPhone con Safari, iPad con Safari, Android con Chrome; idealmente uno de gama baja):

1. **Anotar**: modelo, versión del sistema y del navegador, tamaño de ventana (`window.innerWidth × innerHeight`), densidad, márgenes de seguridad (`env(safe-area-inset-*)`) en apaisado.
2. **Cargar** el juego y abrir `?debug=1` (panel de depuración: fotogramas por segundo, llamadas de dibujo). Anotar los fotogramas medios y los peores durante la pelea con el Custodio (R4).
3. **Agarre y alcance:** con las dos manos y con una, ¿se llega a Atacar, Esquivar, Habilidad y la botella sin cambiar el agarre? Probar los dos lados (menú → Controles táctiles → Lado) y la posición.
4. **Deriva del pulgar (R18):** correr por R1 30 s sin intención de saltar. Contar saltos accidentales.
5. **Gestos:** correr/andar (zona muerta), saltar (arrastre hacia arriba), agacharse, atravesar plataforma (gesto rápido hacia abajo), mantener el salto, varios dedos a la vez (mover + atacar + esquivar).
6. **Bordes:** pulsar los botones más cercanos al borde y los gestos del sistema (¿se dispara el «volver»?).
7. **Navegador:** ¿se desplaza, se hace zoom, aparece el menú de pulsación larga o la selección de texto al jugar? ¿Qué pasa al **ocultarse la barra de direcciones** a mitad de partida (el `resize` suelta los dedos: ver `docs/PROMPT5-LOG.md` S13)? Girar el dispositivo a mitad de partida.
8. **Menú:** abrir con el botón de pausa, cambiar el lado de los botones, el volumen y la calidad (Baja / Alta), recargar y comprobar que se conserva.
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
- **El tamaño pedido cede ante el HUD.** Sobre **2 880 combinaciones** (10 ventanas, 4 márgenes, 4 tamaños, 2 lados, 9 posiciones), el tamaño que pide el jugador cede en **392 (14 %)**: **39 a la derecha** —el diseño—, todas en la ventana mínima de 568 × 320, y **353 a la izquierda** (el botón de botella cuelga arriba del bloque y, al espejarse, queda bajo el HUD). A la derecha **nunca cede** en una ventana de móvil o de tableta (lo fija una prueba). El peor caso baja hasta el suelo (0.72). Es una decisión de diseño —el tamaño del menú es una preferencia y la ventana decide lo que cabe—, no un fallo; el menú **no avisa** de ello todavía.
- **Teclas y mando:** las teclas del teclado se pueden cambiar (S30); **el mando y el táctil no** (el táctil son gestos). Tampoco se ha probado con un mando físico.
- **Sonido:** no hay; el volumen del menú está preparado, no suena nada.
- **Rendimiento:** medido solo con Chromium dibujando por software (`bench:bundle` mide **bytes**, no fotogramas). Un móvil de gama baja puede necesitar el perfil Bajo; **«Auto» no mide el dispositivo** (es el perfil equilibrado).
- **Safari / Chrome para Android:** el juego usa `env(safe-area-inset-*)` y el tamaño del contenedor, no `100vh`; no se ha visto cómo se comportan los dos con la barra de direcciones que aparece y desaparece. Pendiente de dispositivo.
