# Prompt 14 — La interfaz completa: HUD de combate, pausa, ajustes, perfil local y un guardado que no pierde el progreso

> **Lo que pasó.** El usuario pidió llevar la interfaz y los sistemas de usuario «a un nivel profesional, coherente y listo para un lanzamiento comercial», **conectados a los sistemas reales del juego** y funcionando en móvil y escritorio: un HUD de combate (vida, magia, poder activo y botellas), un menú de pausa que **detenga la simulación de verdad**, configuración persistente, controles reales por plataforma, un **perfil local** hecho solo de datos reales y —**prioridad**— un sistema de guardado que no pierda el progreso al cerrar, recargar o sufrir un cierre inesperado. Con reglas duras: **inspeccionar la arquitectura antes de tocar nada**, **no duplicar lo que ya funciona**, **ningún dato falso ni opción que simule una acción que no ejecuta**, ninguna dependencia ni capacidad inventadas, **no tocar el arte ni las animaciones del protagonista ni los PNG originales**, no quitar pruebas ni rebajar validaciones, y **no declarar una fase terminada porque compile**. Las imágenes de referencia eran **inspiración, no un diseño que copiar**: negro, blanco y cian, *dark fantasy*, con identidad propia.
> **Diagnóstico** ([§1](#1--diagnóstico-etapa-a)): ya existían un HUD en DOM, el *snapshot* `GameSession.status()`, un progreso en una sola partida con escritura segura (`SafeStore`), los ajustes con migraciones y un panel de pausa único; **faltaban** el reflejo de lo que de verdad pasa (daño reciente, curación, *i-frames*, coste del poder, recarga restante), una pausa que parara **todo** (los ticks se paraban; las animaciones, las partículas, la cámara y el escenario seguían), las ranuras, el tiempo jugado y las estadísticas, la recuperación explícita y los avisos de guardado, el perfil y la accesibilidad. **No existe motor de audio** (hay señales, no sonido): el volumen general queda «preparado» y **no se ofrecen** música ni efectos por separado.
> **Qué se hizo:** un HUD que **dice lo que de verdad pasa** ([§2](#2--hud-de-combate-etapa-b)); una pausa que **detiene el mundo entero** y un menú de cinco pantallas (Continuar, Ajustes, Controles, Partidas, Perfil) ([§3](#3--pausa-y-menú-etapa-c)); ajustes y accesibilidad **con efecto real** ([§4](#4--ajustes-controles-y-accesibilidad)); un perfil local ([§5](#5--perfil-local-etapa-e)); **el guardado**: progreso v2 con tiempo y estadísticas, tres ranuras independientes, autoguardado, avisos discretos, recuperación, exportar e importar, protección contra sobrescrituras entre pestañas ([§6](#6--el-guardado-etapa-d)); y la **convivencia con las transiciones y el ciclo de vida** ([§7](#7--convivencia-con-las-transiciones-y-el-ciclo-de-vida)).
> **Lo que no se tocó:** la simulación (ninguna regla del juego cambió: un test de arquitectura impide que los ajustes lleguen a ella y un E2E comprueba que **el mismo combate sale idéntico con todas las opciones puestas y sin ninguna**), **el arte y las animaciones del protagonista** (`hero-sheet.png`, `hero-portrait.jpg`, `art/player/**`, `public/art/player/**`: byte a byte los mismos), los escenarios y todos los PNG originales (no se creó ningún recurso gráfico: la interfaz se dibuja con CSS y trazos hechos con los tokens de la paleta).
> **Lo que no se puede afirmar:** que **se vea y se maneje bien en un dispositivo real** (todo se midió en Chromium sin cabeza con GL por software); que el **audio** funcione (no hay); que el guardado local **sobreviva** a que el usuario borre los datos del sitio, desinstale o pierda el dispositivo (no puede: ver [§6.6](#66-límites-del-guardado-los-que-no-se-pueden-prometer-otra-cosa)); ni que impida las trampas (un archivo local se puede editar a mano; se valida su **forma**, no su honestidad).

---

## 1 · Diagnóstico (etapa A)

Leído en el código antes de modificar nada (el diagnóstico breve se entregó antes de implementar):

| Sistema | Lo que había | Lo que faltaba / el riesgo |
|---|---|---|
| **HUD** | DOM (`ui/hud/HudView`, decisión DC-05 de la arquitectura), alimentado por `GameSession.status()` → `HudModel` (puro) → vista que escribe **solo lo que cambió** | no reflejaba el daño reciente más que con un fantasma, ni la curación, ni los *i-frames*, ni el coste de la habilidad, ni la tecla, ni los segundos de recarga; el estilo era genérico |
| **Vida, magia, botellas** | `Health`, `MagicPool` (100, +6/s tras 1 s), `BottleSet` (3 + 1, recarga 3600 ticks), cartas (`Loadout`), `PlayerController` con ventana de *i-frames* | los datos estaban; faltaban tres campos en el *snapshot* (`life.guard01`, `card.cost`, `bottle.secondsLeft`) |
| **Pausa** | un panel único de ajustes (S30); el bucle dejaba de pedir *ticks* | las animaciones del héroe y de los enemigos, las partículas, las luces, el escenario, **la cámara** y las animaciones CSS del HUD seguían corriendo detrás: «un panel encima de un juego que sigue» |
| **Controles** | teclado/ratón con remapeo y validación (S30), táctil por gestos con geometría auditada (S31), mando abstracto (S13) | nada que **enseñara** los controles reales de cada plataforma |
| **Audio** | `MasterVolume` (preparado) y `AudioDirector` que escribe **señales** en un registro | **no hay motor ni archivos de sonido**: ningún control de música/efectos puede «modificar el audio real» |
| **Guardado** | `ProgressStore` v1 sobre `SafeStore` (`.bak`, `.corrupt`, lectura de vuelta, cola serie), `ProgressRecorder` por eventos, `SettingsStore` v2 | **una sola partida**, sin tiempo jugado ni estadísticas, sin ranuras, sin avisos, sin exportar/importar, sin saber qué pasa si el almacenamiento falta |
| **Zonas y estados** | `RoomTransition` (12 + 6 + 14 *ticks*), la llegada que sostiene el mundo (Prompt 13), `DeathFlow`, puntos de control | el menú, el guardado y la llegada tenían que **coordinarse** (nada reactiva la simulación con el menú abierto) |
| **Pruebas** | 2797 unitarias/integración, 50 escenas E2E | cobertura de las partes nuevas por escribir |

**Riesgos técnicos** identificados: (1) el **presupuesto del arranque en frío** (JS ≤ 200 KB gz; estaba en 196.7 KB y esto es mucho código de interfaz) → todo lo que no hace falta en el primer fotograma viaja en *chunks* diferidos; (2) **paridad de catálogos** (es/en, mismos parámetros, ninguna clave huérfana ni faltante, comprobada por tests) → el menú trae su **propio catálogo** (143 claves) que carga solo cuando se abre; (3) la regla de **simulación pura** (`save/`, `gameplay/`, `input/` sin `window`, `Date.now`, etc.) → el reloj y el almacenamiento los pone la plataforma; (4) **migrar sin romper**: las partidas v1 y los ajustes v1/v2 que ya existen deben seguir cargando.

**Referencias visuales.** Se tomaron como lenguaje (negro, blanco y cian; materiales con borde y luz contenida; formas cortadas) y **no se copió ningún elemento**: la vida son **segmentos inclinados** con un borde claro; la magia, un **tubo de extremos cortados** con la marca del coste; las botellas, **frascos de vidrio** con el líquido a su nivel; el poder, una **placa de esquinas cortadas** con la tecla y el coste. Todo sale de los *tokens* de `presentation/palette.ts` y de `clip-path`: **ningún PNG nuevo**.

## 2 · HUD de combate (etapa B)

`GameSession.status()` → `HudModel` (puro: la vida, la magia y los transitorios) → `HudView` (DOM, solo escribe lo que cambió; el *test* con `MutationObserver` comprueba que 20 fotogramas idénticos hacen **0** mutaciones). Cada cosa que enseña es un dato del juego:

| Elemento | De dónde sale | Cómo se ve |
|---|---|---|
| **Vida actual y máxima** | `Health.current/max` | un segmento por punto (hoy 5); `role="progressbar"` con `aria-valuenow/max` para el lector de pantalla |
| **Daño reciente** | el segmento que se pierde | **fantasma** que se apaga en 0.4 s y un destello blanco de 0.15 s (más suave con «menos destellos») |
| **Curación** | un segmento que **vuelve** (botella, descanso) | una **onda de luz fría** de 0.7 s que lo recorre (con «menos destellos», **la misma onda a un tercio de su brillo**) |
| **Invulnerabilidad** | `PlayerController.hurtGuard01`: **la propia ventana de *i-frames* de la simulación**, no una mecánica paralela | una línea bajo la vida que se **vacía** con ella (probado: constante durante un *hit-stop*) |
| **Vida crítica** | 1 punto | el último segmento late despacio (sin efectos exagerados; se apaga con «menos destellos») |
| **Magia** | `MagicPool` (100, +6/s tras 1 s de espera) | un tubo con **estela** de lo que se acaba de gastar (se queda 0.25 s y se vacía), un **brillo** mientras se recarga, el color apagado mientras **espera** y una **marca** donde cae el **coste real** de la habilidad equipada (más tenue si no se puede pagar) |
| **Poder activo** | `Loadout.equipped`, `SKILLS[...].cost`, `session.status().card` | placa con el icono, la **tecla o botón del dispositivo en uso** (cambia con el remapeo; el táctil no enseña ninguna), el **coste** en magia, el estado (`listo`, `sin magia`, `enfriamiento`) y un barrido de recarga; sacude si se rechaza el lanzamiento (`skill:denied`) |
| **Botellas** | `BottleSet` (3 + la cuarta de R2) | frascos con el **líquido a su nivel**; el que se recarga dice **los segundos que le quedan** (redondeados **hacia arriba**: nunca dice 0 sin estar lista); el que se bebe se vacía por el canal; el nuevo llega brillando; la fila sacude si no hay nada que beber |

Los transitorios corren en **tiempo real** (se ven durante un *hit-stop*) y **se detienen con la pausa** (ver §3). El HUD **no dibuja palabras**: solo cifras y la tecla en una chapa `aria-hidden`; los nombres van en `aria-label` por el traductor. No hay paneles permanentes: ocupa la esquina superior izquierda, dentro del área segura, y se escala con la ventana (`uiScale`) y con el **tamaño de la interfaz** elegido (§4).

*Código:* `ui/hud/HudModel.ts`, `HudView.ts`, `input/glyphs.ts` (`actionGlyph`), `gameplay/PlayerStatus.ts` (+3 campos), `player/PlayerController.ts` (`hurtGuard01`), `abilities/BottleSet.ts` (`secondsLeft`). *Pruebas:* `hudModel.test`, `hudView.test`, `hudStatus.test` (integración: **la vida y la magia del HUD son las de la simulación** durante un combate real), `resources.test`, `hudSoak`, E2E `hud`.

## 3 · Pausa y menú (etapa C)

### 3.1 · «Detener la simulación de verdad»

Antes, la pausa paraba los *ticks* y nada más. Ahora, mientras el menú está abierto, **`render()` calcula `worldDt = 0`** y lo usa para todo lo que pertenece al mundo: la animación del héroe y de los enemigos (`animDt`), las partículas y las luces (`vfxDt`), los pulsos de la pantalla, el escenario (`roomView`, `roomArt`, los marcadores de interacción), **la cámara** (su sacudida **no decae**) y los transitorios del HUD; las animaciones CSS del HUD se detienen con `data-paused`. El menú sigue vivo en **tiempo real** (sus transiciones son CSS). Se pierde **nada**: la posición, la cámara y el estado del héroe son los que eran; al **Continuar** no hay ráfaga de *ticks* por el tiempo pasado (el bucle no acumuló nada).

**Cómo se entra y se sale** (todas las vías ejecutan lo mismo, `toggleMenu`): el **botón** de pausa (arriba al centro: no está en el lado de los tres botones de combate y nunca toma el foco, así que `Espacio` no lo «pulsa»), `Esc`, `P`, `Start` del mando, y **la página pasando a segundo plano** (una llamada, otra app, otra pestaña: vuelve esperando; el jugador continúa cuando quiera). `Esc` **retrocede una pantalla** y, desde la lista, continúa. Si el chunk del menú no se puede traer (sin red), **el juego sigue** en vez de quedarse esperando un menú que no llega.

**La tecla de pausa se oye también mientras el mundo se sostiene** en un cambio de zona (no corre ningún *tick*, así que nadie muestrea el *input*: la página mira **solo** esa pulsación —`InputManager.takePause`, que no se come el salto ni el ataque que llegaron a la vez— y abre el menú; en el Prompt 13 la tecla no respondía durante esa espera, y solo lo hacía el botón). Lo comprueba `pauseZone` con `Esc` en mitad de la espera del arte.

**Entrar al menú suelta todo lo que estuviera pulsado** (teclas, dedos, botones) y las teclas tecleadas dentro del menú **no llegan al juego**: ninguna acción de combate se ejecuta ni queda latente. Lo comprueba el E2E `pause` (reloj, héroe, animación, cámara, HUD: **constantes** durante 1.2 s; ni siquiera un `step()` de prueba avanza; al continuar, ningún *tick* de más; diez aperturas seguidas dejan **el mismo número de nodos**).

### 3.2 · Las opciones

La lista es corta y **cada entrada hace una acción real**: **Continuar**, **Ajustes**, **Controles**, **Partidas**, **Perfil**, junto a una tarjeta que dice **dónde estás** (la zona, el tiempo jugado y la partida). **No hay «Volver al menú principal»** (el juego no tiene pantalla de título: la página **es** el juego) **ni «Salir»** (una página web no tiene proceso que terminar: cerrar la pestaña es salir, y el juego se guarda al ocultarse la página). En un banco de pruebas (`?room=`), que no guarda nada, **no se ofrecen** Partidas ni Perfil. Las acciones destructivas (borrar, empezar de nuevo sobre una partida, importar sobre una partida) **piden confirmación** dentro de la propia tarjeta, con lo que se pierde dicho claramente y **el foco en la respuesta segura** (Cancelar). Si el código de las acciones de guardado no se puede traer (la red se perdió justo después de abrir el menú), la pantalla de Partidas **lo dice y pide recargar la página** en vez de quedarse vacía, y la causa va al registro (probado en un Chromium real con la carga bloqueada: E2E `pause`).

Teclado en la lista: ↑ ↓ (y Inicio / Fin) recorren las entradas; Tab y Mayús+Tab recorren los controles de una pantalla; Intro y Espacio pulsan. **El mando abre la pausa con Start pero no navega por el menú** (se maneja con ratón, teclado o toque): ver [§10](#10--límites-reales-y-lo-pendiente).

*Código:* `ui/settings/PauseMenu.ts` (la lista y la tarjeta), `SettingsMenu.ts` (dos pantallas: `settings` y `controls`; el modo `all`, de un solo panel, se conserva como opción y solo lo usan los tests), `SavesScreen.ts`, `ProfileScreen.ts`, `menuStyle.ts`, `menuIcons.ts`, `menuFormat.ts`; `app/menu.ts` (el cableado, en el *chunk* del menú) y `app/Game2D.ts` (`worldDt`, `openMenu/closeMenu/menuBack`, la página oculta). Las pantallas se construyen **la primera vez que se abren**.

## 4 · Ajustes, controles y accesibilidad

**Sonido.** `MasterVolume` sigue «preparado»: el control existe, se guarda con los ajustes, la curva (`gain = nivel²`) es la que tendrá un nodo de ganancia y **la nota de la pantalla dice que el sonido llegará en una versión posterior** (en es y en en, comprobado por tests y E2E). **No se ofrecen música ni efectos por separado, ni se simula nada**: el encargo los pedía «cuando el sistema de audio lo permita», y no hay sistema de audio (ni un archivo de sonido). Cuando exista el motor ([ARCHITECTURE-2D §10](ARCHITECTURE-2D.md)) serán dos claves más en `SettingsData.volume` con su migración.

**Controles.** La pantalla de Controles muestra **lo que hace cada control con las teclas en vigor** (sigue el remapeo en caliente): el **teclado y el ratón**, el **mando** (con la nota «los botones del mando no se pueden reasignar»: **no se anuncia una reasignación que no existe**) y la **pantalla táctil** (los ocho gestos y botones que **existen**: mover, saltar, agacharse, atravesar, los tres botones, la botella, interactuar, la pausa). El dispositivo en uso va primero (en un teléfono sin teclado, el táctil). Debajo de la lista del teclado está **la reasignación de teclas de escritorio** (S30), con su validación: no se acepta una tecla reservada (movimiento, pausa, las del navegador), una que otra acción tenga **intercambia** las dos (nunca queda una acción sin tecla) y Esc cancela. Lo que no hay: combinaciones, perfiles, reasignar el mando.

**Opciones adicionales** (se investigó cada una; entran las que cambian algo real):

| Opción | Qué hace de verdad | Decisión |
|---|---|---|
| **Idioma** (es/en) | `Translator` (ya existía): la interfaz entera se vuelve a leer | ✅ (existente) |
| **Calidad** (Auto / Baja / Alta) | el techo de resolución y los presupuestos de partículas, sprites y luces (la «intensidad de efectos») | ✅ (existente; Auto **no mide** el dispositivo y la nota lo dice) |
| **Menos destellos** | en el HUD: el destello blanco de un segmento perdido deja de existir, su fantasma y **la onda de luz de uno que vuelve** se suavizan (la onda a un tercio), el último segmento no late, la magia no brilla al recargarse y **el resplandor blanco de una botella que se bebe o se recoge y de una carta nueva se cambia por un brillo cian fijo** (se siguen distinguiendo, sin un blanco que va y viene); los pulsos de los bordes de la pantalla (golpe, poder, descanso, guardián) bajan a **0.35** de su fuerza (siguen avisando); se conserva al reconstruir los efectos | ✅ nuevo |
| **Sin sacudida de cámara** | el golpe, el paso o la muerte de un guardián **no mueven la cámara**, y **la que está temblando se detiene** al elegirlo | ✅ nuevo |
| **Tamaño de la interfaz** (85–135 %) | el HUD crece desde su esquina; **el botón de pausa y los botones táctiles se apartan** de su nueva huella (la geometría pura lo audita en 10 clases de ventana × 4 márgenes × lados × posiciones) | ✅ nuevo |
| **Vibración** | el juego **no tiene retroalimentación háptica** y `navigator.vibrate` no existe en iOS Safari | ❌ no se añade (sería un control decorativo) |

**Las opciones no afectan al combate.** Un test de arquitectura impide que **ningún módulo de la simulación** importe los ajustes o nombre una de sus opciones, y el E2E `accessibility` juega **el mismo combate con todo puesto** (calidad baja, volumen 0, destellos, sacudida, interfaz al 135 %, teclado remapeado por defecto) **y con nada**: posición, vida, magia, botellas, el maniquí, el limo y el reloj, **idénticos**.

*Código:* `save/SettingsData.ts` (v3), `app/Game2D.ts` (`setAccessibility`, `shake`), `vfx/ScreenFx.ts` (`setCalm`), `camera/CameraRig.ts` (`clearTrauma`), `ui/touch/layout.ts` y `ui/settings/PauseButton.ts` (`hudScale`), `input/controlsReference.ts`.

## 5 · Perfil local (etapa E)

Solo **datos reales**, de dos fuentes: la sesión (lo que el héroe **tiene**) y `PlayStats` (lo que **ha hecho**, contado **desde los eventos** que la simulación ya emite: una caída es `death:started`, un enemigo vencido un `actor:died` hostil —un sello es neutral—, una sala es una sala que se construyó alrededor del héroe; el tiempo es el reloj de la sesión **en *ticks***, así que es tiempo **jugado**, no tiempo con la página abierta, y se suma al que ya traía el guardado).

| Línea | Dato |
|---|---|
| Partida | la ranura que se juega (`—` en un banco de pruebas: no hay perfil) |
| Tiempo de juego | `ticks / 60`, como `h:mm:ss` |
| Zona | `Room.nameKey` de la sala en que está |
| Salas visitadas | **las visitadas de las que tiene el mundo** (`2 de 4`): el **único** porcentaje de exploración que se puede **calcular**; no hay un «% completado» inventado |
| Habilidades | las que **tienen comportamiento** y el héroe posee (`ABILITIES` filtrado por `implemented`) |
| Cartas, botellas, vida máxima | `Loadout.owned`, `BottleSet.slots/maxSlots`, `Health.max` (las «mejoras» que el juego tiene) |
| Jefes derrotados | por **nombre**, los que tienen su bandera de victoria puesta (`defeatFlag`), sobre los que hay |
| Caídas, enemigos vencidos | los contadores de `PlayStats` |

La pantalla dice «lo que ves aquí sale de tu partida, en este dispositivo. No hay cuenta ni servidor». **No se implementó registro, inicio de sesión ni servidor** (no había una necesidad que lo justificara), y **no hay nivel, puntuación ni logros**: el juego no tiene de dónde calcularlos. *Código:* `app/profile.ts` (`buildProfile`, puro), `ui/settings/ProfileScreen.ts`, `gameplay/PlayStats.ts`.

## 6 · El guardado (etapa D)

**Se mejoró el sistema que existía (S24) sin crear un segundo sistema independiente**: sigue siendo `SafeStore` + `ProgressStore` + el grabador por eventos; lo nuevo se apoya en eso.

### 6.1 · El modelo (explícito, versionado, pequeño)

`ProgressData` **v2** (`saveVersion: 2`; **≈ 0.5 KB**: una partida avanzada, con cuatro salas, seis banderas y la carta, mide 477 bytes; nunca el estado del motor ni fotogramas):

```
saveVersion · at {room, entry}   (la entrada por la que el héroe llegó a la sala: nunca una posición intermedia)
checkpoint {room, entry}         (donde reaparece)
flags[]                          (el progreso: puertas, mecanismos, jefes, palancas; las banderas volátiles «~…» NO se guardan)
abilities[] · cards {owned[], equipped} · bottleSlots
stats {ticks, deaths, kills, rooms[]}   savedAt (ms; lo pone la plataforma: la simulación no tiene reloj)
```

Qué se **reconstruye** al cargar (reglas del juego, no datos): la vida y la magia **llenas** (cargar es descansar: la misma semántica que `rest`), las botellas llenas, los enemigos y sus estados los de la sala al construirla, las puertas según las banderas. Una sala que el mundo ya no tiene **no se confía**: se empieza al principio del mundo con lo ganado. Cada campo se **valida y se repara** al escribir y al leer, con límites (`PROGRESS_LIMITS`: 256 banderas, 64 salas, contadores acotados, nombres de 64 caracteres…): **un archivo manipulado no puede dejar referencias inválidas ni crecer sin límite**. `SettingsData` **v3** añade `accessibility {reduceFlashes, reduceShake, hudScale}` y `slot` (la **ranura seleccionada**). **Migraciones** puras con **archivos dorados** de cada versión (`PROGRESS_MIGRATIONS[1]`: v1 → v2 sin perder nada: el tiempo y las estadísticas empiezan en 0 y las salas en las dos que se conocen; `SETTINGS_MIGRATIONS[1]` y `[2]`): **un guardado v1 sigue cargando** (`AT_THE_SHRINE` de los E2E es, a propósito, uno de v1).

### 6.2 · Ranuras

**Tres**, independientes: cada una es **su propio `ProgressStore`** sobre su clave (`troid.progress`, `troid.progress.2`, `.3`), así que cada una tiene **sus propios** `.bak`, `.corrupt`, lectura de vuelta y cola serie, y **ninguna puede tocar a otra**. La **1** vive bajo la clave que el juego **siempre** usó: un guardado anterior **es** la ranura 1, byte a byte, sin copiar ni mover nada. La **seleccionada** es un ajuste (`slot`). Cambiar de partida **guarda la actual tal como está** y vuelve a abrir la página sobre la otra (una recarga: así nada del mundo viejo se queda en memoria). Mirar la lista **no reescribe nada** (`SafeStore.inspect()` es de solo lectura: una pantalla que enseña las ranuras no tiene por qué «reparar» las que el jugador no está jugando). **Nunca se sobrescribe una partida válida sin preguntar**, y **borrar una no toca a otra** (comprobado en el E2E `slots`: independencia de claves, de banderas y de copias).

### 6.3 · Cuándo se guarda

- **Al ganar algo** (`ProgressRecorder`): una bandera, una carta, una habilidad, una botella nueva, una sala en la que se entra, un descanso en un santuario, una derrota que devuelve al héroe: **una vez por ráfaga**, justo tras el *tick* que la causó (nunca a mitad de un paso ni con una sala a medio construir).
- **Cada 20 s** se comprueba si el héroe lleva **≥ 30 s de juego** desde la última escritura (`AUTOSAVE`): si no ha pasado nada, **no se escribe**; no se escribe cada fotograma ni de forma constante.
- **Al salir** (`pagehide`, página oculta o en segundo plano) **si se ha jugado algo** desde la última escritura: es el único momento en que un juego perdería su último tramo.
- **A mano** (`Guardar ahora`).
- Una escritura de **exactamente lo que ya hay** no hace nada; una que falla **nunca daña la última copia buena**.

**Avisos discretos** (`ui/overlays/SaveNotice`, arriba a la derecha, `role="status"`, sin tomar toques): «Guardado» es un **parpadeo** de 1.5 s que no pide atención en una pelea; lo que el jugador **tiene que saber** se queda a leer: «No se pudo guardar» (6 s; como mucho **una vez cada 30 s**, para no avasallar), «se recuperó la última copia buena», «la partida estaba dañada: se conserva una copia y empiezas una nueva», «este navegador no permite guardar: el progreso se perderá al cerrar» y «esta partida se guardó desde otra pestaña…» (14 s). Una advertencia **no la desplaza un «Guardado»** que llegue mientras se lee.

### 6.4 · Robustez y recuperación

- **Escritura segura** (`SafeStore`): `.bak` ← la copia **buena** anterior · se comprueba que el respaldo está · `clave` ← la nueva · **se lee de vuelta** y se compara · solo entonces se quita el `.bak`. Lo que se interrumpa a medias deja **una copia buena**; una copia dañada **nunca reemplaza** a un respaldo bueno. Las escrituras van **en cola**, en orden.
- **Carga:** `clave` → si no se puede leer se **conserva como `clave.corrupt`** (**nunca se borra lo que no se sabe interpretar**) y se prueba `clave.bak` → si tampoco, una partida nueva **y el jugador lo sabe**. Un guardado de una **versión posterior** no se lee **ni se pisa**: se aparta. Un guardado corrupto **no da una pantalla negra ni impide arrancar** (E2E `save` y `slots`).
- **Almacenamiento no disponible o lleno** (navegación privada, datos del sitio bloqueados, cuota): el juego sigue con lo que tiene en memoria y **lo dice** (aviso «este navegador no permite guardar»); «Guardar ahora» **no dice «guardada»** cuando no es verdad (responde que no pudo).
- **Dejar una partida para jugar otra nunca la pierde en silencio:** al **cambiar de ranura** o **empezar de nuevo en otra**, el orden es **guardar la que se deja tal como está → elegir la nueva (los ajustes) → parar la vieja → reabrir**. **Si la primera no se puede guardar** (el almacenamiento la rechaza), **no se deja**: la elección ni siquiera se toma (no se escribe nada en los ajustes, así que no hay nada que deshacer), el juego **sigue guardando**, la página no se reabre, **no se destruye nada** de la otra ranura y el jugador lo sabe; si lo que falla es la **elección**, se anula también en memoria (un cambio posterior de otro ajuste no la arrastraría). En un navegador que no guarda nada **no se ofrece cambiar** (la página se abriría sobre una partida vacía y esta se perdería con ella). Lo comprueba `gameSaves.test` con un almacenamiento que rechaza **solo** las claves de la partida, o **solo** los ajustes.
- **Los tics se dan por guardados cuando llegaron al almacenamiento:** un guardado que el almacenamiento rechaza **no** pone a cero «lo jugado desde el último»; el siguiente guardado silencioso (el intervalo, o salir de la página) lo reintenta. Mientras **uno está en camino** otro guardado silencioso **no pide lo mismo dos veces** (una página que se oculta dispara varios eventos a la vez y escribe una sola vez); si el que iba en camino falla, la reclamación se retira.
- **Exportar e importar**: `Exportar` entrega **un archivo real** (`troid-partida-N-AAAA-MM-DD.json`) con el guardado **legible**; `Importar` lee un archivo con el **selector de archivos del navegador** y lo trata como **dañado o manipulado**: ≤ **64 KiB** (más grande no se lee), pasa por **la misma lectura que cualquier guardado** (versión, migración, reparación), y **lo que no se puede interpretar se rechaza** con el motivo. **Sobre una partida ocupada pregunta primero**, conservando el archivo elegido mientras tanto. **Importar sobre la partida que se está jugando** hace que **las escrituras del juego esperen** (`suspend`/`resume` del grabador) mientras la copia entra: una escritura que ya estaba en camino cae **antes** (la cola es de orden de llegada) y ninguna cae después; si entra, el juego deja de escribir y la página se reabre sobre ella; **si el almacenamiento la rechaza —o algo inesperado lanza—, el juego sigue como si nada** y guarda lo que ganó mientras tanto (se suelta en un `finally`: nunca se queda sin guardar en silencio).
- **Dos pestañas del mismo juego** (el almacenamiento se comparte): el grabador recuerda **cuándo se guardó la partida que cargó y cuándo escribió por última vez**, y **qué escrituras suyas siguen en camino**; al guardar, **dentro de la cola de escritura**, mira lo que hay: si es **posterior** a todo lo que esta página conoce **y no es una de sus propias escrituras aún sin confirmar** (con un almacenamiento lento —uno nativo, o IndexedDB— puede haber varias a la vez, y una no debe tomar a la anterior por «otra pestaña»), **es de otra pestaña** y **no se escribe encima** —la página lo dice, **deja de guardar** y no ofrece un «Guardar ahora» que no podría cumplir—. Recargarla trae lo último y vuelve a guardar. (`SafeStore.writeGuarded`, `ProgressStore.saveGuarded`; E2E `tabs` con dos pestañas reales.) Queda una carrera estrechísima (dos pestañas que escriban en el mismo milisegundo entre la lectura y la escritura): cerrarla del todo pediría `navigator.locks`, que no se ha usado.
- **`?new=1`** (empezar de cero) se pide **una vez**: tras borrar se **quita de la dirección**, de modo que recargar la página **continúa** la partida en vez de borrarla otra vez.

### 6.5 · ¿IndexedDB o `localStorage`? (evaluado; se queda `localStorage`)

| | `localStorage` | IndexedDB |
|---|---|---|
| Tamaño de lo guardado | **cientos de bytes** (una partida) | pensado para MB y datos estructurados: no hace falta |
| Escritura al **ocultarse la página** | **síncrona**: termina antes de que la página se vaya (lo que justifica el guardado al salir) | transacciones **asíncronas** que el navegador puede cortar al descargar la página |
| Disponibilidad | todas las plataformas objetivo; cada acceso está protegido (puede lanzar: datos bloqueados) | igual de expuesta a la navegación privada y al borrado |
| ¿Más permanente? | **No**: ambos comparten el mismo «cubo» del sitio y se borran juntos | **No** |

La ventaja de IndexedDB (cuota, trabajo fuera del hilo principal) **no se aprovecha con una partida de unos cientos de bytes**, y la síncrona del otro es lo que hace fiable el guardado al salir. **No se ha asumido que ninguno sea universalmente seguro, permanente o compartido entre dispositivos.** Lo que sí se ofrece contra el borrado: `navigator.storage.persisted()` se **muestra** y `navigator.storage.persist()` se **pide con un botón** (el navegador puede negarlo y la pantalla lo dice tal cual; no se pide solo, porque algunos lo conceden preguntando al usuario), y **la copia exportada** es la protección que el jugador controla. Para el empaquetado nativo (Capacitor) el plan sigue siendo un adaptador de `Preferences` (R7 del plan): el almacenamiento está inyectado, así que no cambia nada de lo de arriba.

### 6.6 · Límites del guardado (los que no se pueden prometer otra cosa)

- **Es local.** Protege el progreso **dentro de ese navegador y ese dispositivo**. **No hay sincronización ni nube** (no hay servidor) y la pantalla de partidas lo dice: «no se sincronizan entre dispositivos y se pierden si borras los datos del sitio, desinstalas la aplicación o pierdes el dispositivo. Exporta una copia para ponerla a salvo».
- **No hay protección contra trampas.** Un archivo de guardado es JSON que cualquiera puede editar (**o importar a mano**): lo que se valida es su **forma y sus rangos** (para que un archivo roto o manipulado no rompa el juego), **no su honestidad**. Si algún día hay un perfil en línea o una economía competitiva, la validación de lo importante **tendrá que hacerse en un servidor**. No hay contraseñas, claves ni datos personales en el guardado.
- Algunos navegadores **limitan o borran** el almacenamiento de sitios sin uso (Safari puede borrar el de un sitio que no se visita en siete días, salvo que esté instalado en la pantalla de inicio) y **no se ha comprobado aquí en ningún dispositivo real**.
- Un guardado **no es un estado del motor**: al cargar, la vida y la magia vuelven llenas, y los enemigos y sus posiciones son los de la sala recién construida.
- **La ranura elegida vive en los ajustes**, que comparten todas las pestañas y **no tienen protección contra escrituras cruzadas**: gana la última pestaña que cambió un ajuste (si dos pestañas eligen ranuras distintas, la próxima página abre la que eligió la última). **No se toca ninguna partida guardada** por eso —las ranuras están protegidas aparte—: lo peor es abrir la ranura que no se esperaba, y el menú la muestra.

## 7 · Convivencia con las transiciones y el ciclo de vida

| Lo que se pidió | Cómo se cumple | Dónde se comprueba |
|---|---|---|
| **No mostrar un HUD con datos de la zona anterior** | el HUD lee **al jugador** (vida, magia, poder, botellas), no la zona; lo que sí es de una zona —la barra del jefe, el icono de interacción— **se retira con `room:loaded`** | E2E `hud`, `boss`, `transition` |
| **No guardar posiciones intermedias inválidas durante una transición** | se guarda **la entrada** de la sala (`at`), nunca una posición; durante una derrota, el **punto de control**; **un guardado hecho con el mundo sostenido en negro es una partida entera** | E2E `pauseZone` (guardado a mano mientras se espera el arte: `at = {r3_chamber, west}`) · `progress.test` |
| **Un guardado o una carga no reactivan la simulación con el menú abierto** | el bucle se pausa por `menuOpen` además de por la llegada y el telón; guardar no toca el bucle; cambiar de partida **recarga la página** (no hay un estado a medias que reactivar) | E2E `pauseZone`: cuando el arte llega **con el menú abierto** no corre **ni un tick**; `pause` |
| **No duplicar música, efectos, temporizadores ni controladores** | no hay música; los efectos son de eventos y no se recrean con el menú; las pantallas se construyen **una vez** y los oyentes pasan por `DisposableStore` | E2E `pause` (10 aperturas = **mismos nodos**, un menú, una hoja de estilo) |
| **No perder las preferencias al reinicializar los recursos visuales** | los ajustes los tiene `SettingsStore`; un cambio de calidad reconstruye los efectos **con** las opciones del jugador | E2E `accessibility` (cambiar la calidad conserva «menos destellos»), `settings` |
| **No guardar un estado parcialmente inicializado** | el grabador guarda el estado **de un tick terminado**, tras `room:entered`, nunca una sala a medias; el guardado se **valida y repara** antes de escribirse | `progressRecorder.test`, `progressSoak` |
| **Coordinar carga, pausa, juego activo y guardado sin carreras** | un único **bucle** decide si hay ticks (`paused ∨ menuOpen ∨ veiled ∨ arrival.blocking`); las escrituras van **en cola** y las acciones de la pantalla de partidas son **de una en una** (un mensaje tardío de una petición vieja se descarta) | `savesScreen.test`, `storageSoak`, E2E `slots` |

## 8 · Responsive y rendimiento

- **DOM y no Pixi**, por la decisión de arquitectura DC-05 (texto localizable, zonas seguras, *hit-testing* y multitáctil nativos, y que la interfaz no dependa del renderer): el encargo pedía no usar elementos HTML superpuestos **si contradice la arquitectura**; aquí **la arquitectura manda DOM** y los problemas que el encargo temía (escalado, cámara, toques) están resueltos por las funciones puras de geometría y la auditoría de `mobileGeometry.test` (10 clases de ventana, 4 márgenes seguros, tamaños, lados y posiciones, **ahora también con la interfaz al 85–135 %**).
- **Móviles:** zonas seguras (`env(safe-area-inset-*)`), el HUD nunca lo pisa un botón táctil (la geometría lo audita), objetivos de al menos **44 px**, y el menú se recoloca en **vertical y en horizontal bajo** (una sola columna o dos; el pie de cada pantalla —título, aviso y «Volver»— no se mueve y **solo desplaza lo del medio**; un teléfono en horizontal mide 390 px de alto y los ajustes no caben: **las últimas líneas se desvanecen mientras haya algo más abajo** —`ui/settings/scrollHint.ts`, una máscara que solo existe con `data-more="1"`—, y al llegar al final se ven enteras; con una ventana de escritorio, donde todo cabe, no hay desvanecido. Lo comprueba el E2E `accessibility` en un Chromium real). **Escritorio:** el HUD no se estira (escala con `uiScale`, tope 1.6) y el teclado, el ratón y el mando siguen funcionando (E2E `movement`, `gamepad`, `touch`, `mobile`).
- **Rendimiento:** el HUD escribe **solo lo que cambió** (0 mutaciones en fotogramas idénticos), sin asignaciones por fotograma; no hay filtros ni texturas nuevas (la interfaz es CSS y SVG de trazos); el menú **no cuesta nada hasta que se abre** (su pista de desplazamiento mira la capa de la pantalla solo cuando cambia algo: al desplazarla, al cambiar el tamaño de la ventana o de la capa y al cambiar su contenido). **Arranque en frío: 197.7 KB gz de JS (presupuesto 200; 196.7 antes de este encargo)**: el HUD, los negros, los avisos y el botón (`overlays`, 11.0 KB gz) y el menú con sus pantallas, su cableado y su catálogo (`menu`, 17.4 KB gz) viajan en *chunks* **diferidos**; las acciones del guardado (`saveActions`: cambiar, empezar, borrar, exportar, importar) se traen la primera vez que el menú las pide.

## 9 · Pruebas

**Unitarias y de integración: 2797 → 3020 (+223), 186 archivos, sin quitar ni debilitar ninguna** (las que cambiaron lo hicieron porque la interfaz cambió: el menú tiene dos pantallas en vez de un panel, las claves de los textos se amplían, el *snapshot* tiene tres campos más; cada una sigue comprobando lo mismo). **E2E:** 5 escenas nuevas (`pause`, `pauseZone`, `slots`, `tabs` y `accessibility`: 50 → 55); ampliada la del HUD (`hud`, que ya existía) y adaptadas al menú nuevo `settings`, `language`, `gamepad`, `lighting`, `vfxArt` y `save` (ninguna aserción se quitó sin una equivalente: cambian los identificadores de lo que se pulsa y se añaden las del comportamiento nuevo; **dos se reformularon porque el producto cambió a propósito**: «recargar deja el guardado exactamente igual» es ahora «deja igual lo que el héroe ganó» —el tiempo jugado y el sello de cuándo se escribió sí cambian—, y «el HUD no dibuja texto» es ahora «no dibuja palabras: solo cifras y la tecla del poder»). Los 15 puntos del encargo:

| # | Punto | Dónde se comprueba |
|---|---|---|
| 1 | el HUD refleja la vida y la magia reales | `hudStatus.test` (integración: un combate real), `hudModel/hudView.test`, E2E `hud` |
| 2 | los cambios de salud y recursos se representan bien | ídem + `resources.test`; E2E `hud` (daño, curación, *i-frames*, magia gastada y regenerada, botellas, carta) |
| 3 | poderes y consumibles mantienen su comportamiento | `spiritBolt*`, `bottles*`, `resources.test`; E2E `bolt`, `bottles`, `bottle4`, `magic` (sin modificar) |
| 4 | la pausa detiene la simulación y continuar no duplica estados | E2E `pause` (reloj, héroe, animación, cámara, HUD constantes; sin ráfaga; 10 aperturas sin fugas), `pauseZone`, `pauseMenu.test` |
| 5 | los ajustes de audio se aplican y persisten | E2E `settings` (volumen en vigor al instante —`MasterVolume.gain` con su curva—, guardado, y tras recargar; v1 migra; archivo dañado se repara). **El audio real no existe** (ver §10) |
| 6 | las opciones no afectan al combate | `architecture.test` (la simulación no importa los ajustes) + E2E `accessibility` (**el mismo combate, bit a bit**, con todo puesto y con nada) |
| 7 | una partida guardada se carga con el progreso | E2E `save` (sala, banderas, carta, habilidades, botellas, punto de control), `slots`; `progressData.test`, `progressStore.test` |
| 8 | cerrar y reabrir no elimina el guardado | E2E `save` (recargas), `slots` (cambiar de ranura y volver; cada ranura conserva lo suyo), `tabs` |
| 9 | datos incompletos o corruptos no bloquean el juego | `safeStore`, `progressStore`, `progressData`, `storageSoak` (fallos aleatorios); E2E `save` (dañado, con respaldo, de una versión futura, con una sala fantasma), `slots` (ranura ilegible: se muestra, se conserva, **el juego arranca**) |
| 10 | las ranuras permanecen independientes | `saveSlots.test`; E2E `slots` |
| 11 | las transiciones no producen inconsistencias | E2E `transition`, `arrival` (Prompt 13), `pauseZone` (menú en mitad de un fundido, de la espera del arte y de una derrota) |
| 12 | los controles móviles y de escritorio siguen funcionando | E2E `touch`, `mobile`, `gamepad`, `movement`; `touchLayout/mobileGeometry.test` (+ tamaños de HUD) |
| 13 | no se rompe el combate, la IA, las animaciones ni las interacciones | la **regresión completa** de E2E (§11) y las 3020 unitarias |
| 14 | las opciones del menú no simulan acciones | `pauseMenu.test` (cada entrada llama a algo del anfitrión), `pauseMenuWiring.test` (el menú **sobre el juego real**: sesión, estadísticas, ajustes y ranuras de verdad), E2E `pause`/`slots`/`settings` |
| 15 | el juego inicia sin datos previos | E2E `boot`, `save` («un juego nuevo no deja rastro»), `slots` |

## 10 · Límites reales y lo pendiente

**No implementado, dicho tal cual:**

- **Música y efectos por separado: no.** No hay motor de audio ni un archivo de sonido: el volumen general es el que existe, «preparado», y la pantalla lo dice. «Un volumen de cero silencia la categoría», «la música respeta las transiciones» y «las restricciones de reproducción del navegador» **no tienen objeto todavía** y no se simulan.
- **El mando abre la pausa (Start) pero no navega por el menú**: se maneja con ratón, teclado o toque. (La navegación con mando sería otra fuente más de la lista y de cada pantalla; no se hizo.)
- **«Volver al menú principal» y «Salir»** no existen en la plataforma (web).
- **Vibración:** no.
- **Carrera de dos pestañas** en el mismo milisegundo (§6.4).
- **Un módulo que falló al cargarse no se puede volver a pedir en la misma página:** el navegador recuerda el fallo hasta que se recarga (comprobado con Chromium: tras desbloquear la red, un segundo `import()` ni siquiera sale a la red). Por eso la pantalla de Partidas, cuando el código de sus acciones no llega, **dice que se recargue** (no ofrece un «Reintentar» que no podría servir) y el menú, si es él quien no llega, deja seguir el juego. Ocurre solo si la red se pierde entre abrir el menú y abrir Partidas.

**No verificado en un dispositivo real:** el HUD, el menú, los tamaños y los toques se midieron en Chromium sin cabeza con GL por software (≈ 3–10 fotogramas/s: los números absolutos de tiempo dependen de la máquina; lo que se comprueba es **qué hay en cada momento**, no cuánto cuesta en un teléfono de gama baja). La **legibilidad** y la **comodidad del tacto** del menú y del HUD (tamaños de letra, separación de botones) están auditadas por geometría, **no vistas ni tocadas en un iPhone, un iPad o un Android**.

**Seguridad y privacidad:** no hay cuentas, servidores ni datos personales; el guardado no lleva secretos; el archivo importado se trata como no fiable; **no hay protección anti-trampas** (§6.6).

**Sin integrar:** el modo `all` de `SettingsMenu` (todo en un panel) se conserva como opción (lo ejercitan sus 50 tests) pero **el juego ya no lo usa**.

## 11 · Resultados

*(se completa con la regresión final; ver el informe)*
