# Calibración móvil — qué se verificó y qué NO

> **Estado:** Prompt 6, S31 · **Aviso, sin letra pequeña:** **nada de este juego se ha calibrado en un iPhone, un iPad ni un Android reales.**
> No hay ninguna cifra de dispositivo en este documento y **no se ha inventado ninguna**. Lo que sí hay es: la **geometría** de la interfaz comprobada
> con números (pura, sin navegador), la **lógica** de los gestos probada con fuentes simuladas, y el juego **visto en Chromium sin GPU** con
> ventanas del tamaño de cada clase de móvil y con toques CDP. Los umbrales táctiles reales **siguen pendientes de prueba en un iPhone, un iPad
> y un Android**; las tablas de resultados de abajo están **vacías a propósito**.

---

## 1. Qué se ha comprobado aquí, con qué método y qué NO dice

| Qué | Cómo (reproducible) | Qué demuestra | Qué **no** demuestra |
|---|---|---|---|
| La **disposición** de los controles táctiles, el HUD, el botón de pausa y la barra del jefe en cada clase de pantalla (apaisado y vertical), con y sin *notch* / isla / esquinas redondeadas, a los tres tamaños de controles (80 %, 100 %, 140 %), en los dos lados y en las posiciones que ofrece el menú | `tests/unit/ui/mobileGeometry.test.ts` (funciones puras: miles de combinaciones) | que **ninguna** combinación solapa dos zonas táctiles, saca algo del área segura, tapa el HUD o la barra del jefe, ni deja la zona de movimiento inservible | que el pulgar **alcance** cada botón sin incomodar, ni que el tamaño en milímetros sea cómodo (depende de la densidad real y de la mano) |
| La **lógica de los gestos** (correr, andar, zona muerta, saltar, agacharse, atravesar plataformas, varios dedos, cancelar) | `tests/unit/input/*`, `tests/integration/touchControls.test.ts` + sondeos aleatorios | que cada gesto da la acción que dice la especificación, que un dedo no cambia de dueño y que nada queda pulsado | que los **umbrales** (distancias en dp, tiempos) sean los que una mano real necesita |
| El juego **en ventanas del tamaño de cada clase** de móvil, con capa táctil y toques reales del protocolo DevTools | E2E `mobile` (Chromium, `isMobile` + `hasTouch`, densidad 2–3, márgenes de seguridad simulados con `?safe=`) | que lo anterior **se cumple en la página real** (los rectángulos del DOM, no solo las cuentas) y que mover + atacar + esquivar a la vez funciona | el rendimiento en un móvil (Chromium aquí dibuja **por software**: las cifras sirven para comparar, no son absolutas), el comportamiento de Safari o de Chrome móvil, ni el tacto |
| **Densidad y resolución** (`devicePixelRatio` 1–3, tope de resolución por perfil) | `tests/unit/presentation/viewport.test.ts`, E2E `settings` (lienzo a 1055 / 1477 / 1688 px) | que el lienzo se dibuja a la resolución que dice el perfil | cuánto cuesta eso en una GPU móvil |

Las clases de ventana (**tamaños en píxeles CSS, no mediciones de dispositivos**; se usan como clases de tamaño y nada más):

| Clase | Apaisado (ancho × alto) | Notas de la prueba |
|---|---|---|
| móvil pequeño | 667 × 375 | con *notch* simulado: 47 / 21 px de margen lateral / inferior |
| móvil mediano | 844 × 390 | el tamaño de diseño del juego (referencia de `uiScale`) |
| móvil grande | 932 × 430 | con isla simulada: 59 px laterales |
| Android alto | 915 × 412 | |
| móvil muy ancho | 1260 × 540 | 21:9 |
| tableta pequeña | 1133 × 744 | |
| tableta | 1180 × 820 | |
| tableta 4:3 | 1024 × 768 | el aspecto mínimo del área de juego |
| vertical (cualquiera) | 390 × 844 | la imagen del juego queda pequeña con bandas; ver §5 |

---

## 2. Los números que hay que calibrar en un dispositivo real

Todos son **datos**, no código: calibrar es editar un objeto, no un algoritmo. **Ninguno se ha tocado por una prueba de dispositivo.**

| Dato | Valor hoy | Dónde | Síntoma de que está mal | Qué probar |
|---|---|---|---|---|
| `rx`, `ry` | 56, 44 dp | `input/gestures/TouchConfig.ts` | el héroe no llega a correr o hace falta arrastrar mucho; agacharse es difícil | el recorrido del pulgar para correr y para agacharse, con una mano |
| `deadZoneX` | 12 % de `rx` | ídem | el héroe se mueve solo con el pulgar quieto, o no anda con un arrastre suave | apoyar el pulgar sin mover |
| `jumpEnter`, `jumpRearm`, `jumpHold` | 0.55, 0.25, 0.30 | ídem | **saltos accidentales por deriva del pulgar al correr (R18)**, o saltar cuesta | correr 30 s seguidos con una mano sin querer saltar |
| `dropFlickDistance`, `dropFlickWindowMs` | 28 dp, 100 ms | ídem | atravesar una plataforma fina falla o salta sola | el gesto de bajada rápida, 20 veces |
| `leftZoneWidth` | 46 % del ancho útil | ídem | la zona de movimiento es demasiado grande o pequeña para el pulgar | zonas en pantallas anchas y estrechas |
| `edgeMargin` | 28 dp | ídem | los gestos del sistema (volver, cambiar de app) se disparan al pulsar un botón | tocar los botones más cercanos al borde |
| posición y diámetros de los 4 controles | `TOUCH_CONTROLS` | `ui/touch/layout.ts` | un botón queda fuera del alcance natural del pulgar, o se pisa al sujetar el móvil | sujetar el móvil y tocar cada botón sin cambiar el agarre |
| alcance de la posición ajustable | 120 dp hacia dentro, 90 hacia arriba | `PLACEMENT_RANGE` | no basta para sacar los botones del agarre de la mano | probar el lado izquierdo y las posiciones extremas |
| `uiScale` | `min(ancho, alto × 2.1) / 844`, acotado a 0.9–1.6 | `input/gestures/TouchConfig.ts` | todo se ve pequeño en una tableta o enorme en un móvil muy ancho | mirar las tabletas y los móviles de 21:9 |
| altura de los botones de botella del HUD | 44 dp de alto, paso de 36 dp | `ui/hud/layout.ts` (`HUD_DESIGN.vial`) | se pulsa la botella vecina | beber con el pulgar en el HUD |
| tamaño del botón de pausa | 50 px | `ui/settings/PauseButton.ts` | se pulsa sin querer, o no se encuentra | abrir y cerrar el menú en movimiento |

---

## 3. Protocolo de prueba en dispositivo (para quien tenga uno)

Para **cada** dispositivo (iPhone con Safari, iPad con Safari, Android con Chrome; idealmente uno de gama baja):

1. **Anotar**: modelo, versión del sistema y del navegador, tamaño de ventana (`window.innerWidth × innerHeight`), densidad, márgenes de seguridad (`env(safe-area-inset-*)`) en apaisado.
2. **Cargar** el juego y abrir `?debug=1` (panel de depuración: fotogramas por segundo, llamadas de dibujo). Anotar los fotogramas medios y los peores durante la pelea con el Custodio (R4).
3. **Agarre y alcance:** con las dos manos y con una, ¿se llega a Atacar, Esquivar, Habilidad y la botella sin cambiar el agarre? Probar los dos lados (menú → Controles táctiles → Lado) y la posición.
4. **Deriva del pulgar (R18):** correr por R1 30 s sin intención de saltar. Contar saltos accidentales.
5. **Gestos:** correr/andar (zona muerta), saltar (arrastre hacia arriba), agacharse, atravesar plataforma (gesto rápido hacia abajo), mantener el salto, varios dedos a la vez (mover + atacar + esquivar).
6. **Bordes:** pulsar los botones más cercanos al borde y los gestos del sistema (¿se dispara el «volver»?).
7. **Navegador:** ¿se desplaza, se hace zoom, aparece el menú de pulsación larga o la selección de texto al jugar? ¿Qué pasa al **ocultarse la barra de direcciones** a mitad de partida (el `resize` suelta los dedos: ver `docs/PROMPT5-LOG.md` S13)? Girar el dispositivo a mitad de partida.
8. **Menú:** abrir con el botón de pausa, cambiar el lado de los botones, el volumen y la calidad (Baja / Alta), recargar y comprobar que se conserva.
9. **Rendimiento:** con la calidad en Baja y en Alta, ¿mantiene 60 fotogramas?, ¿se calienta?
10. **Escribir** lo observado en §4 **con lo que se vio**, no con lo que se esperaba. Si un umbral cambia, cambiar el dato y anotar el valor viejo y el nuevo.

---

## 4. Resultados en dispositivo — **SIN MEDIR**

| Dispositivo | Sistema y navegador | Ventana · densidad · márgenes | Umbrales cambiados (antes → después) | Salto accidental / alcance / gestos | Rendimiento (FPS) | Notas |
|---|---|---|---|---|---|---|
| iPhone — *sin medir* | | | | | | |
| iPad — *sin medir* | | | | | | |
| Android — *sin medir* | | | | | | |
| Android de gama baja — *sin medir* | | | | | | |

---

## 5. Límites conocidos de lo que hay

- **Vertical.** El juego está pensado **apaisado**. En vertical el área de juego (≥ 4:3) queda pequeña con bandas y la bandera `rotateDevice` del *viewport* existe, pero **no hay aviso de «gira el dispositivo»** todavía (queda para P7). Los controles caen dentro de la ventana y la geometría se comprueba también en vertical, pero **no se ha jugado así en un móvil**.
- **Cambios de tamaño.** Un `resize` suelta todos los dedos (decisión de seguridad): en un navegador móvil cuya barra se esconde a mitad de partida puede notarse. Pendiente de dispositivo.
- **Teclas y mando:** las teclas del teclado se pueden cambiar (S30); **el mando y el táctil no** (el táctil son gestos). Tampoco se ha probado con un mando físico.
- **Sonido:** no hay; el volumen del menú está preparado, no suena nada.
- **Rendimiento:** medido solo con Chromium dibujando por software (`bench:bundle` mide **bytes**, no fotogramas). Un móvil de gama baja puede necesitar el perfil Bajo; **«Auto» no mide el dispositivo** (es el perfil equilibrado).
