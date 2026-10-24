# Prompt 20 — Fase final: completado, estabilización y preparación para el lanzamiento

> Documento del encargo «FASE FINAL — COMPLETADO, ESTABILIZACIÓN Y PREPARACIÓN PARA EL LANZAMIENTO DEL JUEGO»: llevar el proyecto existente a un estado completo, estable y listo para publicar **implementando, corrigiendo, integrando y probando** —no auditando—, sin rehacer lo visual ni lo que ya funcionaba y sin dar nada por terminado porque exista código o interfaz. Etapas: **A** inspección · **B** sistemas críticos (guardado, progresión, combate, transiciones, estabilidad) · **C** compatibilidad y experiencia · **D** integraciones comerciales · **E** validación final. **Lo que no se pudo hacer desde este entorno —dispositivos, cuentas de tienda, firma, Xcode, Android SDK— lo dice la [§12](#12--lo-que-queda-y-quién-lo-hace); nada se da por hecho sin una prueba que lo mire, y ninguna prueba automática se presenta como prueba de funcionamiento en un dispositivo físico.**

---

## 1 · Inspección (Etapa A, antes de tocar una línea)

| Pregunta | Respuesta, leída en el repositorio y ejecutada |
|---|---|
| **¿Qué stack hay?** | Vite 8 + TypeScript estricto (`noUnusedLocals`, `verbatimModuleSyntax`) + PixiJS 8 (render 2D), simulación determinista pura (`GameSession`, bus de eventos tipado), DOM para HUD, menús y controles táctiles. Sin *framework* de UI, sin motor de terceros, sin proyecto nativo en el repositorio. Pruebas: `vitest` + `happy-dom` (unitarias e integración) y E2E con `playwright-core` sobre Chromium (`tools/e2e`). CI en cada *push*: `typecheck`, `test`, `build` (`.github/workflows/ci.yml`; al cerrar, además, el E2E contra el *build* de producción en dos trabajos y el humo de Firefox y WebKit, [§9](#9--pilar-7--monetización-y-preparación-para-publicar)). |
| **¿Qué estado de ramas y cambios había?** | Rama `claude/troid-vertical-slice`, árbol limpio en `eaa9245` (Prompt 19 cerrado). Sin PR, sin ramas pendientes de integrar. |
| **¿Qué estaba ya terminado?** | Movimiento, combate, magia, botellas, un enemigo (Ink Slime) y un guardián con fases; mundo de 4 salas con puertas, llaves, sellos y atajos; punto de control; HUD con arte aprobado; audio completo (motor Web Audio, música, ambientes, efectos); pausa con mapa del mundo; menús (ajustes, sonido, controles, partidas, perfil); guardado v2 con tres ranuras, copias, validación y migraciones; controles táctiles con editor; gamepad con la misma abstracción que el teclado. **No se rehízo nada de ello.** |
| **¿Qué faltaba de verdad?** | (1) **El final**: la última salida del mundo no hacía nada —ni victoria, ni créditos, ni registro de partida completada—. (2) Un enemigo empujado a un foso sin suelo **caía para siempre** y dejaba sin poner la bandera que abre una puerta: un bloqueo permanente hasta recargar. (3) El mando **no navegaba los menús** (solo abría y cerraba la pausa) y el aviso de **ventana en vertical** no existía. (4) Un toque con el dedo en «Continuar» **atacaba** (los eventos de ratón que el navegador fabrica tras un toque caían sobre el juego al cerrarse el menú). (5) Un fotograma que lanzaba una excepción **detenía el bucle para siempre** (pantalla congelada sin mensaje); un arranque fallido dejaba una **página negra**. (6) Nada documentaba lo necesario para publicar (privacidad, avisos de terceros, pasos externos). (7) La página guardaba solo en `localStorage`: ningún almacenamiento que un contenedor nativo pueda dar. |
| **¿Qué no se puede comprobar aquí?** | iOS y Android reales (no hay Xcode, Android SDK ni dispositivos), Firefox y Safari (solo hay Chromium; el humo en Firefox y WebKit se añadió después y corre solo en la CI, [§6](#6--pilar-3--controles-foco-orientación-y-compatibilidad)), tiendas, firma, mando físico, vibración, rendimiento en gama baja. **No se afirma nada de eso.** |
| **¿Qué hay que cuidar?** | El **arranque en frío** tiene techo de 204 800 B gz (`npm run bench:bundle`) y estaba a ~580 B de él: todo lo nuevo viaja en *chunks* diferidos salvo lo imprescindible, y cada cambio en código frío se midió. |

---

## 2 · Plan y estado

*(La columna «Estado» de cada pilar se rellena al cerrar; ver la tabla final de la [§11](#11--estado-final-por-pilar).)*

| Etapa | Pilar | Qué | Dónde |
|---|---|---|---|
| **A** | — | Inspección | [§1](#1--inspección-etapa-a-antes-de-tocar-una-línea) |
| **B** | 2 | El final real de la aventura | [§3](#3--pilar-2--el-final-real-de-la-aventura) |
| **B** | 4 | Guardado, carga y protección | [§4](#4--pilar-4--guardado-carga-y-protección) |
| **B** | 1 | Combate, enemigos, jefes, progresión | [§5](#5--pilar-1--combate-enemigos-jefes-y-progresión) |
| **B/C** | 3 | Controles, foco, orientación, compatibilidad | [§6](#6--pilar-3--controles-foco-orientación-y-compatibilidad) |
| **B** | 5 | Estabilidad y errores | [§7](#7--pilar-5--estabilidad-errores-y-sesión-larga) |
| **C** | 6 | Accesibilidad, configuración, comodidad | [§8](#8--pilar-6--accesibilidad-configuración-y-comodidad) |
| **D** | 7 | Monetización y preparación para publicar | [§9](#9--pilar-7--monetización-y-preparación-para-publicar) |
| **E** | 8 | Recorrido de jugador, regresión y cierre | [§10](#10--pilar-8--pruebas-de-principio-a-fin-y-resultados) |

**Reglas que se mantuvieron todo el encargo.** (1) *Un solo mundo*: nada se duplicó; el final, el mapa y los créditos salen de los datos que ya existen y de banderas que ya se guardan. (2) *Lo visual aprobado no se tocó*: ni personaje, ni HUD, ni escenas, ni menús; lo nuevo reutiliza la paleta y los componentes existentes. (3) *Nada de lo nuevo entra en el arranque en frío si puede viajar en un* chunk *diferido.* (4) *Ninguna opción decorativa*: toda opción nueva hace algo y se prueba que lo hace. (5) *Lo que no se pudo comprobar se dice.* (6) *Ninguna prueba se debilitó ni se borró para ponerse en verde.*

---

## 3 · Pilar 2 — El final real de la aventura

**Qué había.** La última sala (R4, el santuario) tiene una salida al este que no llevaba a ninguna parte: el héroe podía caminar fuera del mundo sin que pasara nada.

**Qué se hizo.**

| Pieza | Qué hace | Dónde |
|---|---|---|
| **Condición de victoria** | Una salida marcada `end` en los datos de la sala completa la aventura la primera vez que se toca (si está abierta y el héroe vive): pone la bandera `completed:adventure` **antes** de nada, luego emite `adventure:ended { roomId, exitId }`. Es una bandera ordinaria del mundo: **todo guardado la conserva sin cambiar el esquema** (`saveVersion` sigue en 2). | `progression/adventure.ts`, `gameplay/GameSession.ts` (`checkExits`), `gameplay/events.ts` |
| **Validación del mundo** | `validateWorld` rechaza un mundo **sin final** (`world-no-end`) o con un final **inalcanzable** desde el inicio (`end-unreachable`): el contenido nuevo no puede olvidar su final. | `world/worldGraph.ts` |
| **Transición sin bloqueos** | El juego se detiene (el mismo congelado de la pausa), guarda la partida **como completada** (el evento dispara el autoguardado habitual) y abre la pantalla de cierre. Ninguna tecla ni toque llega al mundo mientras tanto. | `app/Game2D.ts` (`adventure:ended → openMenu('ending')`) |
| **Cierre y créditos** | «FIN», lo que el juego contó del camino (tiempo, salas, guardianes, caídas, enemigos), los créditos que ruedan solos a paso de paseo (el primer gesto de rueda, dedo o tecla los entrega al jugador; quien pidió menos movimiento al sistema recibe una lista quieta) y **dos caminos**: *Seguir explorando* (vuelve al mundo donde está el héroe, con el juego ya guardado como completado) y *Partidas* (donde se empieza una partida nueva, preguntando antes, como siempre). | `ui/settings/EndingScreen.ts`, `creditsRoll.ts`, `presentation/credits.ts`, `content/credits.ts` |
| **Los primeros instantes** | Una pulsación en los primeros 700 ms (`ENDING_GRACE_MS`) **no** responde: el cierre se abre en el instante en que el héroe toca la salida, cuando el jugador está saltando o tocando, y sin esto el Espacio de un último salto habría pulsado «Seguir explorando» y el final se habría ido sin leerse. | `EndingScreen.ts` |
| **Registro de partida completada** | Se muestra en la tarjeta de la ranura («Completada»), en el perfil y en el cierre; se conserva al cargar. Una partida completada **no vuelve a terminar sola** al cargarla, y la salida, ya gastada en la visita, se anuncia de nuevo en la siguiente. | `app/saveActions.ts`, `app/profile.ts`, `SavesScreen.ts`, `ProfileScreen.ts` |
| **Después de completar** | El menú vuelve al mapa, Esc/Start funcionan como siempre, y *Partida nueva* en la misma ranura u otra empieza **limpia** sin tocar la completada (probado). | E2E `ending` |
| **Créditos sin nombres inventados** | `content/credits.ts` lista solo lo que el repositorio sabe (motor, arte y audio originales del proyecto); **los nombres del equipo los rellena quien publica** (la prueba verifica que no hay nombres inventados). | `content/credits.ts` |

**Criterio del encargo —«jugar la ruta principal hasta el final sin herramientas de desarrollo»—**: `tests/integration/worldJourney.test.ts` y `slice.test.ts` juegan la aventura entera con el jugador de guion (R1 → R4, sello, guardián, Air Dash, salida) y terminan en el final; el E2E `ending` hace lo mismo con **teclado real** en el navegador. *Es una prueba automática con un jugador de guion, no una partida humana.*

**Pruebas del pilar.** `adventureEnd.test.ts` (10), `endingScreen.test.ts` (23), `creditsRoll.test.ts` (5), `worldGraph.test.ts` (+reglas de final), `world.test.ts`, `pauseMenu.test.ts` (+pantalla `ending`), `profileScreen`/`savesScreen` (+completada), E2E `ending` (escritorio con teclado, móvil en horizontal con dedos, movimiento reducido), `finale` y `world` actualizados.

---

## 4 · Pilar 4 — Guardado, carga y protección

**Auditoría (lo que ya estaba y se verificó, no se tocó).** `SafeStore` escribe por cola serializada, **lee de vuelta** lo escrito y conserva `.bak` (última copia buena) y `.corrupt` (lo ilegible, apartado, no borrado); `ProgressData` v2 con validación estricta y migraciones desde v1; tres ranuras aisladas (la 1 en la clave histórica); detección de otra pestaña que guardó (se deja de guardar y se avisa); puntos de guardado en bandera, tarjeta, habilidad, sala, descanso, muerte, al salir y por intervalo; una partida nueva no escribe nada hasta ganar algo; una versión **más nueva** que la conocida se aparta como dañada y **nunca se sobrescribe**; la exportación/importación valida antes de escribir. Existían *soaks* con fallos inyectados (cuota llena, escritura que no vuelve, lectura corrupta).

**Qué se añadió.**

| Pieza | Para qué | Dónde |
|---|---|---|
| **Recorrido completo con cierre y reapertura** | La aventura se juega entera con el jugador de guion y, **en cada entrada a una sala**, la partida se captura, se escribe como el texto que el navegador guarda, se vuelve a leer como lo hace un arranque en frío y se **empieza una sesión nueva** con ella: el jugador de guion sigue con la reabierta. Se comparan contra la sesión viva: sitio, punto de control, banderas, habilidades, tarjetas, botellas. | `tests/integration/saveJourney.test.ts` |
| **Guardado en un momento cualquiera** | Cada 37 ticks del recorrido (primo: no coincide con el ritmo del guion) se guarda, se reabre y se comprueba que se abre viva, en una entrada válida, con todo lo ganado y **sin banderas volátiles de combate**; incluye el medio de un fundido entre salas y de la pelea con el guardián. | idem y `tests/helpers/soak.ts` (invariante «el guardado es continuable» cada 97 ticks, en los *soaks* aleatorios) |
| **Almacenamiento nativo** | `NativeStorage` habla con `@capacitor/preferences` (UserDefaults / SharedPreferences: **no** el almacenamiento del WebView, que el sistema puede vaciar) cuando la página corre dentro de una cáscara Capacitor; se detecta sin importar el paquete (`window.Capacitor`) y **se prueba que funciona antes de fiarse de él** (guarda, lee, borra un valor de sonda). Si no funciona, la página sigue con `localStorage`. | `app/nativeStorage.ts`, `app/storage.ts` (`openStorage`), `tests/unit/app/nativeStorage.test.ts` (14) |
| **Compleción en el guardado** | La partida completada es una bandera: se guarda, se carga, se muestra y no se pierde (probado con mutación: quitarla del guardado rompe `saveJourney`). | [§3](#3--pilar-2--el-final-real-de-la-aventura) |

**Mutaciones comprobadas a mano** (se rompió el código, se vio fallar la prueba y se restauró): omitir las habilidades en `captureProgress` → falla `saveJourney` (en una primera versión **no** fallaba porque se comparaba contra sí misma; se reescribió para comparar contra la sesión viva).

**Límite honesto.** El almacenamiento nativo está probado contra un **doble** del *plugin* con su contrato documentado (`get`/`set`/`remove`); **no se ha ejecutado en ningún dispositivo**. Y una partida guardada por una versión *más nueva* del juego se aparta como dañada en una versión *más vieja*: es la decisión segura (no se sobrescribe), no un bug.

---

## 5 · Pilar 1 — Combate, enemigos, jefes y progresión

**Auditoría.** Cada acción tiene una mecánica real (ataque con combo y *hit-stop*, dash, salto de pared/aéreo, hechizo con tarjeta y coste de magia, botellas con recarga, interacción, agacharse, soltarse de plataformas); los enemigos detectan, se preparan, atacan, reciben daño con retroceso y mueren **una vez** (invariante comprobada); las recompensas se conceden una sola vez (banderas `taken:`/`defeated:`/`broken:`); el guardián tiene fases, furia, telegrafías acotadas y **no puede quedarse bloqueado** por el cambio de sala, la muerte del héroe ni la pausa.

**Qué se hizo.**

| Hallazgo | Corrección | Prueba |
|---|---|---|
| **Un enemigo empujado a un foso sin suelo caía para siempre**, y su bandera de derrota —la que abre la puerta— nunca se ponía: bloqueo permanente hasta recargar. Lo encontró el *soak* nuevo. | `GameSession.rescueFallenGuardians`: un enemigo o guardián vivo por debajo del `killY` de la sala se devuelve a su sitio de origen, con su vida, y se anota en el registro. | `tests/integration/enemyFall.test.ts` (4) y los casos de foso de `enemySoak.test.ts`; **mutación**: quitar el rescate rompe ambos. |
| No había simulación de *muchas* peleas aleatorias contra enemigos y guardián con invariantes por tick. | *Soak* determinista con LCG sembrado: ningún enemigo sale del mundo, se hunde en un muro, se queda en un estado más de lo que su definición permite, hiere sin golpe, ni muere dos veces; las telegrafías están acotadas; el resultado es **idéntico bit a bit** con la misma semilla. | `tests/integration/enemySoak.test.ts` (6) + `tests/helpers/enemySoak.ts` |
| **Balance** | Revisado con simulaciones del guardián (tiempos de ataque, daño recibido, ventana de castigo) y del slime; **no se cambió ningún valor**: no hay evidencia de un desequilibrio y el encargo prohíbe cambios arbitrarios. | scripts de medición (no se conservan en el árbol) |

**Observaciones que no se cambiaron** (diseño, no defectos): hay un solo punto de control por zona (R2 y R4); el slime espera en el borde si el héroe es inalcanzable.

---

## 6 · Pilar 3 — Controles, foco, orientación y compatibilidad

**Auditoría.** Teclado (con repetición descartada, `Esc`/`P`, teclas escritas en la interfaz sin pasar al juego), ratón (clic = ataque, nunca sobre la interfaz), táctil (zona de gestos + tres botones, multitáctil real, mantener/soltar, zonas de seguridad, `touch-action: none`, captura de puntero), gamepad (mapeo estándar, zona muerta radial, aristas que no se pierden entre ticks) y las preferencias de cada uno ya existían y estaban probadas. **No hay soporte ficticio**: el mando se prueba con un mando *abstracto* (`VirtualPad`) y el táctil con toques reales por el protocolo de Chromium; ninguno con un dispositivo físico.

**Defectos encontrados y corregidos.**

| # | Defecto | Corrección | Prueba |
|---|---|---|---|
| 1 | **Un toque de dedo en «Continuar» (o en cualquier botón que cierra su menú) era un ataque.** Tras un toque el navegador fabrica `mousedown`/`mouseup`/`click` sobre lo que haya *entonces* bajo el dedo: si el botón acaba de cerrar su menú, es el juego. Reproducido en Chromium con toques reales: el héroe atacaba al reanudar. | `KeyboardMouseSource` ignora un `mousedown` en los 700 ms siguientes a que un dedo o un lápiz se levanta (`TOUCH_ECHO_MS`): es el eco del toque, no un clic. | `keyboardSource.test.ts` (+1); E2E `focus`: abrir y cerrar el menú con dedos no ataca y los prompts siguen en «táctil». |
| 2 | **Perder el foco de la ventana no pausaba.** El origen ya soltaba las teclas, pero el juego seguía corriendo con nadie mirando. | `blur` de la ventana abre la pausa (igual que ocultar la página), salvo tras la cortina de arranque. | E2E `focus`: con la `D` pulsada, `blur` → pausa, el mundo espera, se vuelve con `Esc` y el héroe **no** sigue corriendo; una pulsación nueva juega. |
| 3 | **Un mando desenchufado en pleno juego dejaba al héroe parado en la pelea.** El origen ya soltaba todo, pero no había pausa. | `gamepaddisconnected` abre la pausa solo si el mando era el dispositivo en uso. | E2E `focus`: un mando que no era el activo no pausa; el activo, sí. |
| 4 | **El mando no podía usar los menús.** | `padNav.ts` (puro) + `PauseMenu.pad()`: la cruceta o el palo van al **control más cercano en esa dirección** (regla espacial: filas, columnas y los dos paneles se cruzan sin una tabla de vecinos), una dirección sostenida repite (420 ms y luego 130 ms), A pulsa, B retrocede (del mapa a la columna, de la columna al juego; en el cierre de la aventura no responde en sus primeros instantes), en un deslizador izquierda/derecha lo mueven (un paso de su `step`, con el evento `input` como una mano), en el mapa el palo lo mueve, A lo centra y X/Y acercan/alejan; las pantallas más altas que la ventana se desplazan. Solo oye al mando (`device === 'gamepad'`) y no en los 250 ms siguientes a abrirse. El foco se dibuja para el mando aunque el navegador no lo haría (`data-pad`). | `padNav.test.ts` (19), `padMenu.test.ts` (18); E2E `focus`: **alcanzabilidad real** de todos los controles de cada pantalla (controles, sonido, ajustes, partidas, perfil) con la disposición que hizo el navegador, a 1280×720 y a 844×390; deslizador, mapa, B en cascada, mundo quieto todo el rato. |
| 5 | **Una ventana en vertical en un dispositivo táctil no decía nada** (el juego se dibuja en una banda con los controles encima). | `RotateNotice`: una línea bajo el HUD que pide girar el dispositivo, con «Jugar así» (un toque real; **no** es una pulsación del juego); no detiene el juego, no toma el foco (la tecla que salta no la pulsa) y se va sola al girar; si el jugador eligió seguir, no vuelve hasta que el dispositivo se haya girado y vuelto a poner en vertical. Solo con controles táctiles y ventana más alta que ancha (un ratón en una ventana alta no tiene nada que girar). Sus textos viajan en un catálogo propio (`overlay.*.json`) en el *chunk* de las capas. | `rotateNotice.test.ts` (9), `hudLayout.test.ts` (+`hudBottom`), E2E `focus`: en un móvil y en una tablet verticales la línea queda dentro de la ventana, bajo la muesca y el HUD, sin tocar el botón de pausa ni los táctiles (y, en el móvil, por encima de la imagen); el toque real la cierra sin mover al héroe; girar la cierra; volver a vertical la repite. |

**Compatibilidad analizada de forma estática** (no es una prueba en esos navegadores): el JS construido se **transforma sin pérdidas** con `esbuild` para `safari15`, `ios15`, `chrome90/98` y `firefox100`, y **no** para `safari14`/`ios14` (26 de 40 ficheros; la causa es la desestructuración, que `esbuild` no sabe bajar a ese objetivo —medido sobre el *build* final; la espera de nivel superior, que antes era la primera causa, ya no está en el código, [§7 #6](#7--pilar-5--estabilidad-errores-y-sesión-larga)); el código usa `structuredClone` (Safari 15.4, Chrome 98, Firefox 94), protege `ResizeObserver`/`createImageBitmap` y tiene alternativa de `AudioContext` y de `decodeAudioData` con *callbacks*. **Mínimos que se derivan: iOS/Safari 15.4, Chrome/WebView 98, Firefox 100.** Las **pruebas de navegador completas** (la suite `test:e2e`) se han ejecutado solo en **Chromium** (escritorio, ventanas de móvil y tableta emuladas, toques reales por CDP); en los otros dos motores corre un **humo** (siguiente párrafo).

**Humo en Firefox y WebKit** (`tools/e2e/engines.ts`, `npm run test:engines -- --browser=…`; la CI lo corre en cada *push*, contra el *build* de producción): once comprobaciones que no necesitan nada de Chromium —la página arranca y levanta la cortina; **dibuja** una imagen (≥ 16 colores y ≥ 5 % distinto del fondo); una tecla sostenida mueve al héroe; una tecla y el ratón atacan **y el golpe levanta chispas**; Escape abre la pausa, un botón cambia el idioma, Escape vuelve al mapa y «Continuar» cierra; lo que el héroe gana se guarda y una recarga lo recupera; la consola queda limpia; la primera tecla despierta el motor de sonido y el navegador dice qué formatos reproduce; y, con una ventana de móvil y **dedos de verdad**, un toque abre la pausa y otro en «Continuar» la cierra **sin que el héroe ataque** (el eco que fabrica un navegador tras un toque)—. Resultados (ejecución nº 100 de la CI, `472727b`):

| Motor | Versión | Dibuja con | Resultado |
|---|---|---|---|
| Chromium (aquí) | 141.0.7390.37 | WebGL por software | 11 de 11 |
| **Firefox** (CI, Linux, sin cabeza) | 155.0 | **canvas** (no encontró WebGL) | 11 de 11 — la primera vez, **3 fallos** (el defecto de [§7 #3](#7--pilar-5--estabilidad-errores-y-sesión-larga): el primer golpe rompía cada fotograma en el canvas) |
| **WebKit** (Playwright, Linux) | 26.6 | WebGL | 11 de 11 |

**Qué dice y qué no.** Dice que el *build* arranca, dibuja, responde, guarda y vuelve en los tres motores, y que el camino del *canvas* —el que toma un navegador sin WebGL— se ha jugado de verdad en uno de ellos. **No dice nada de Safari en un iPhone** (el WebKit de Linux no es el Safari de iOS: otro sistema de audio, de memoria, de gestos y de *WebView*), ni de Firefox en un escritorio con tarjeta gráfica, ni de ningún teléfono. Una cosa a mirar en un Firefox real: en el ejecutor el contexto de audio **se quedó bloqueado** tras la primera tecla (`locked`; en Chromium y WebKit, `running`) —el ejecutor no tiene dispositivo de sonido o Firefox no tomó la tecla sintética por un gesto—, así que **el sonido en Firefox no está comprobado**.

**Límites declarados.** No hay reasignación de botones del mando ni de los botones táctiles (los táctiles se **colocan** y se **escalan**; las teclas sí se reasignan); no hay vibración (no se ofrece una opción que no haría nada); las zonas de seguridad se probaron con inserciones simuladas (`?safe=`), no con una muesca real; el bloqueo de orientación lo hace el manifiesto (`orientation: landscape`) y, en nativo, la configuración de la cáscara (ver [§12](#12--lo-que-queda-y-quién-lo-hace)).

---

## 7 · Pilar 5 — Estabilidad, errores y sesión larga

**Auditoría (lo que ya estaba).** Todo lo que se carga bajo demanda (menú, capas, arte, audio, efectos, vistas del jefe, herramientas) tolera que su *chunk* no llegue y el juego sigue sin él; las salas esperan su arte con tiempos de espera; la cortina de arranque tiene su propio tope (10 s) y la página otro de respaldo (20 s); el guardado soporta cuota llena, escrituras que no vuelven y lecturas corruptas; el audio y el arte tienen alternativas; el *soak* E2E existente comprueba que tras miles de acciones aleatorias no queda un objeto de Pixi, una vista, una partícula ni un nodo del DOM de más.

**Defectos encontrados y corregidos.**

| # | Defecto | Corrección | Prueba |
|---|---|---|---|
| 1 | **Un fotograma que lanzaba una excepción detenía el bucle para siempre**: el siguiente `requestAnimationFrame` se pedía después de los *hooks*, así que la pantalla se quedaba con el último dibujo, sin respuesta y sin mensaje. | `GameLoop` captura el fallo, **suelta el tiempo que debía** (sin ráfaga de recuperación), pide el siguiente fotograma y avisa con `failed(error, racha)`. `Game2D` lo escribe en el registro (el primero de cada racha y uno de cada 60, no una línea por fotograma) y, tras **120 fallos seguidos**, detiene el bucle y muestra una página (`crash.ts`, un *chunk* propio) en el idioma de la página con «Recargar»: el juego se guarda mientras se juega, y la última partida guardada es la que vuelve. Sin nadie a quien avisar, el error no se traga: llega al navegador después de pedir el siguiente fotograma. | `gameLoop.test.ts` (+6); E2E `resilience`: cuatro fotogramas rotos se saltan y el juego sigue (una sola línea de registro); todos rotos → página «Something went wrong» / «Algo ha fallado», mundo parado, foco en el botón, recarga y **vuelve la partida guardada**. |
| 2 | **Un arranque fallido dejaba una página negra.** | La cortina de arranque no se levanta para un juego que no pudo empezar: se queda y dice qué pasó (HTML y CSS puros en `index.html`, ES/EN, `role="alert"`, «Reintentar»). Marcado por `<html data-boot>`: `failed` (el juego lanza al crearse, o **un *script* suyo no llega** —un *listener* de errores en el propio HTML, sin esperar—) y `stalled` (nada ha empezado a los 20 s; si el juego llega después, levanta la cortina como siempre). Sin coste en el JS inicial. | `curtain.test.ts` (+1); E2E `resilience`: código que no llega (inmediato), navegador sin contexto de dibujo (en español) y descarga que no termina (a los 20 s). |
| 3 | **Un navegador sin WebGL: el primer golpe rompía todos los fotogramas.** Esta fila decía «comprobado, no cambiado: Pixi cae al *canvas* y el juego se juega entero». **No era cierto en el *build* de producción** y la prueba no podía decirlo: movía al héroe, pero no lo hacía golpear. Lo descubrió **Firefox 155 en la CI** (sin cabeza y en el ejecutor no encuentra WebGL: dibuja con el *canvas*, y el humo lo dice ahora): tras el primer golpe, *cada* fotograma lanzaba `can't access property "bind", r.shader is undefined` hasta que, a los 120, la página decía que el juego había fallado. Causa: los efectos llegan en un *chunk* aparte, después de crear el renderer; Pixi construye los *pipes* de dibujo al crearlo y el de partículas no estaba, así que `effects.ts` instalaba a mano **el de WebGL, fuera cual fuera el renderer**, y ese pide al renderer un sistema de *shaders* que uno de *canvas* no tiene. En desarrollo no se veía: Pixi registra todos los *pipes* al importar el paquete entero y el renderer ya tenía el suyo. | `particlePipeFor(tipo)` da a cada renderer su *pipe* (WebGL o *canvas*; cualquier otro se rechaza). `Renderer2D` pide `['webgl', 'canvas']` en vez de `'webgl'`, que Pixi completa con **WebGPU** en medio: un renderer en el que el juego no ha corrido nunca. Y, **por si en un dispositivo que nadie ha probado otra pieza de los efectos falla igual**, `Game2D` apaga los efectos tras 20 fotogramas seguidos que fallan (un tercio de segundo) y **el juego sigue sin ellos** —son cosméticos y ninguna regla depende de ellos—; 120 seguidos siguen siendo el final. | `particlePipe.test.ts` (3). E2E `resilience`: (a) sin WebGL el renderer es `canvas`, un golpe contra un slime genera partículas y **ningún fotograma falla**; (b) un dispositivo cuyo *pipe* de partículas lanza: una sola línea de registro, los efectos se apagan, la simulación sigue, no vuelve a fallar ningún fotograma y no sale la página de fallo. **Dos mutantes comprobados**: devolver al *canvas* el *pipe* de WebGL → la escena falla en producción con el mismo error que Firefox; quitar el apagado → falla. Además se miraron dos capturas del *build* de producción en el mismo instante de un golpe, una con WebGL y otra con el *canvas*: la misma escena (fondo, ruinas, cristales, HUD, el héroe y sus chispas) — comparación a ojo, no de píxeles. |
| 4 | **La GPU quita el contexto** (un móvil que pasa a segundo plano lo hace). | Comprobado, no cambiado: Pixi lo recupera. | E2E `resilience`: `WEBGL_lose_context` → la simulación sigue, nada se lanza al jugador, el contexto vuelve y la imagen es la misma (luminancia media dentro del 15 %). |
| 5 | **El arranque en frío se pasaba del techo** con lo nuevo (204 942 de 204 800 B) y venía con 42 ficheros porque el empaquetador corta un *chunk* por cada módulo que también usa algún *chunk* diferido. | Una sola regla en `vite.config.ts`: **los módulos del juego que la página importa estáticamente viven en un solo fichero** (`codeSplitting.groups`, etiqueta `$initial`); `main.ts` importa `Game2D` estáticamente. Mismo código, 14 ficheros en vez de 42, **195 975 B** (−9 KB gz, margen 8,8 KB); al cerrar, tras todo lo demás y sin el `await` de nivel superior de `main.ts` (fila 6), **12 ficheros y 196 569 B** (margen 8 231 B). | `npm run bench:bundle`; E2E en producción de 16 escenas contra el nuevo reparto. |
| 6 | **Los laboratorios (`?lab=…`) se quedaban colgados en producción, sin un solo error — consecuencia directa del cambio anterior (#5).** `main.ts` esperaba (`await import('./labs/…')`) en el nivel superior del módulo; con los módulos de la primera pantalla en un solo fichero, el *chunk* del laboratorio importa de ese fichero, que no termina de evaluarse hasta que el laboratorio carga: **interbloqueo de módulos**. El servidor de desarrollo (un fichero por módulo) no lo muestra, y el trabajo de CI con el *build* solo jugaba 16 escenas, ninguna de laboratorio: **lo halló la regresión completa contra el *build* de producción** (6 escenas de laboratorio con 30 s de espera agotados; el juego mismo no estaba afectado). | El arranque de la página es una función que nada espera en el nivel superior (`void start(host)`). **Ya no queda ningún `await` de nivel superior en `src/`** (tampoco lo soporta Safari 14). Efecto lateral: 12 ficheros en lugar de 14 y 196 569 B. | `noTopLevelAwait.test.ts` (3; con el `main.ts` anterior falla con 13 hallazgos); la CI juega `sprites` contra el *build*; las 6 escenas de laboratorio y `settings` pasan contra producción. |

**Fugas y sesiones largas** (E2E `resilience`, medido con las herramientas del navegador, no a ojo): 4 vueltas de calentamiento y 30 de medida de *menú abierto → cada una de sus seis pantallas → cerrar → cambio de sala → slime que aparece → derrota del héroe → reaparición*, en desarrollo y contra el *build* de producción:

| Qué | Antes → después de 30 vueltas (producción; en desarrollo, lo mismo) |
|---|---|
| *listeners* de `window` / `document` / `body` / `#ui` / canvas (lista del depurador) | 33 / 4 / 0 / 0 / 2 → **idénticos** |
| temporizadores vivos (envoltorio de `setTimeout`/`setInterval` que cuenta los que siguen vivos) | 1 → **1** |
| nodos del DOM | 568 → **568** |
| *heap* que sobrevive a una recolección | 9,50 → 9,87 → 10,22 → 10,55 MB (lotes de 10 vueltas: +0,37, +0,35, +0,33); en desarrollo 18,8 → 19,9 MB |

Un *heap* que crece ~35 KB por vuelta **no se dio por bueno sin saber de qué era**: se tomaron **instantáneas del *heap* antes y después** de 40 cambios de sala, 40 peleas, 40 derrotas y 120 aperturas del menú, y se compararon por constructor (sondas desechables: no se conservan en el árbol). Resultado: tras recolectar, **lo que crece es el propio registro de rendimiento del navegador** (una entrada `PerformanceLongAnimationFrameTiming` por cada fotograma lento, que con el render por software de este entorno son muchos) y poco más (+0,2 MB en 40 cambios de sala; +0,04 MB en 40 peleas; +0,03 MB en 40 derrotas; el menú, plano: 0,2–0,5 MB oscilando en 120 aperturas); **ningún objeto del juego se acumula**. La primera sonda sí vio crecer las listas de actualización de Pixi (`RenderGroup.childrenToUpdate`): era un artefacto de la sonda (cargaba salas más deprisa de lo que se dibujaban fotogramas) y se vacía con cada fotograma real. Los umbrales de la prueba (< 4 MB en total y < 1 MB en el último lote) son los que dejan pasar ese ruido y detectarían una fuga de verdad.

**Rendimiento: lo que se vigila, lo que se mide y lo que no.**

| Qué | Cómo | Resultado |
|---|---|---|
| **Arranque en frío** | `npm run bench:bundle` (el JS que descarga la primera pantalla, comprimido con gzip nivel 9) — **falla** por encima de 204 800 B y la CI lo corre | **196 569 B** en 12 ficheros (quedan 8 231): la calidad Automática que mide costó 489 B, la elección del *pipe* por renderer con la red de seguridad de los efectos 199 B, y quitar el `await` de nivel superior de `main.ts` ahorró 94 B |
| **Llamadas de dibujo y partículas** | contador de llamadas GL y de partículas vivas en las escenas `stress`, `art-performance`, `world`, `boss`… | ≤ 60 llamadas por fotograma (con 800 *sprites*, 4 capas de *parallax*, un filtro y 240 partículas) y ≤ 400 partículas |
| **Coste de JavaScript por fotograma** | E2E `cost`: el guardián despierto, en tiempo real, nueve segundos, midiendo **solo el fotograma del propio juego** (`GameLoop.onFrame`: los *ticks* de la simulación, la actualización de la escena y las órdenes de dibujo) con la CPU de la página limitada ×1, ×4 y ×6 (`Emulation.setCPUThrottlingRate`) | ver la tabla de abajo |
| **Calidad «Automática» que mide** | `QualityGovernor` (puro, 14 pruebas) + E2E `adaptive` con un dispositivo lento hecho con el gancho `slowFrames` | baja **una vez** a «Baja» (resolución 1,75 → 1,25; partículas 300 → 150; efectos de *sprite* 40 → 24) cuando la mayoría de los fotogramas de varios segundos pasan de 24 ms; no sube, no se guarda, no toca «Baja» ni «Alta», no cuenta el menú ni la página oculta ni el mundo retenido |

Coste de JavaScript del propio juego en el combate con el guardián (Chromium sin cabeza, dibujo **por software**, 844×390; una pasada de la escena `cost`):

| CPU de la página | fotogramas en 9 s | media | p95 | p99 | el peor | por encima de 16,7 ms |
|---|---|---|---|---|---|---|
| sin limitar | 131 | **2,17 ms** | 5,4 | 7,6 | 9,5 | 0,0 % |
| limitada ×4 | 108 | **6,20 ms** | 11,0 | 13,5 | 23,6 | 0,9 % |
| limitada ×6 | 105 | **6,53 ms** | 13,0 | 14,2 | 20,4 | 1,0 % |

**Qué dice y qué no.** Dice que el código del juego deja holgura en un fotograma de 60 Hz, incluso con la CPU de la página muy frenada, y que un cambio que lo multiplicara por varios se vería. **No dice nada de ningún teléfono**: la limitación frena solo el JavaScript de la página (no la GPU, que aquí es un programa de dibujo por software en otros hilos), el frenado no es lineal (×6 no da seis veces el coste: parte del tiempo es esperar a ese dibujo), y los fotogramas por segundo que el propio juego cuenta aquí (12–14) los marca el dibujo por software, no el código. Es un indicador para comparar una versión con la siguiente y para saber qué mirar primero en un dispositivo —el código o el dibujo—, **nunca un resultado en un dispositivo**. La escena solo comprueba que el instrumento ve el frenado (la media sube) y que el fotograma medio cabe en uno de 60 Hz con holgura.

**La calidad Automática, hecha para que no pueda hacer daño.** Hasta aquí «Automática» era el perfil equilibrado y la propia interfaz decía que *no medía el dispositivo*. Ahora mide **una sola cosa, la que cualquier dispositivo puede decir**: cuánto tarda cada fotograma. La decisión es pura (`presentation/qualityGovernor.ts`): deja pasar los primeros cuatro segundos de juego (se suben texturas y se compilan *shaders*), juzga una ventana de unos cuatro segundos y baja cuando **el 80 % o más** de sus fotogramas pasan de 24 ms (menos de ~41 por segundo); un hipo de segundos (una pestaña en segundo plano, un depurador) no cuenta como lentitud; los fotogramas del menú abierto, de la página oculta y del mundo retenido en negro no cuentan y borran la ventana; habla **una vez**. Lo que hace al hablar está pensado para no poder empeorar nada: solo **baja**, **no se guarda** (el ajuste sigue siendo «Automática» y la siguiente visita empieza equilibrada), no actúa si el jugador eligió «Baja» o «Alta», y deja una línea en el registro con el porqué. **Contra lo que no protege:** un dispositivo al que le sobra potencia y tiene la pantalla a 30 Hz (el modo de ahorro de energía de iOS) baja también —es lo que la medida ve, y quien lo quiera distinto elige «Alta»—; y baja la resolución y los presupuestos, que ayudan a un dispositivo limitado por el dibujo y a medias a uno limitado por el JavaScript. **Su umbral nunca se ha visto en un teléfono.**

**Lo que no se hizo, y por qué.** No hay manejadores globales de `error` / `unhandledrejection` que cambien el comportamiento: una promesa rechazada fuera del bucle no detiene nada (la ven la consola y la herramienta de errores de quien publique), y lo que sí deja una pantalla muerta —una excepción dentro del fotograma— tiene ya su manejador. No hay medición de FPS en dispositivos (el render por software de este entorno no vale como cifra): solo los presupuestos que el E2E vigila (≤ 60 llamadas de dibujo, ≤ 400 partículas vivas).

---

## 8 · Pilar 6 — Accesibilidad, configuración y comodidad

**Cada opción hace algo, y se prueba que lo hace** (nada decorativo; ya estaba y se verificó):

| Opción | Efecto real | Se guarda | Prueba |
|---|---|---|---|
| Idioma (es / en) | todos los textos, `<html lang>`, nombres de zona | sí | E2E `language`, `settings` |
| Volumen general, música, efectos, ambiente | los cuatro buses del motor de audio | sí | E2E `settings`, `audio`; `volume.test.ts`, `engine.test.ts` |
| Calidad (auto / baja / alta) | tope de resolución de render y presupuestos de partículas | sí | E2E `settings` |
| Menos destellos | el rectángulo blanco del HUD no se estira, los pulsos se suavizan | sí | E2E `accessibility` |
| Sin temblor de cámara | la cámara no tiembla (y el temblor que había se detiene) | sí | E2E `accessibility` |
| Tamaño del HUD | HUD, botón de pausa y botones táctiles hacen sitio | sí | E2E `accessibility`, `mobile` |
| Teclas (reasignar, restaurar) | las acciones del teclado | sí | `remap.test.ts`, E2E `settings` |
| Botones táctiles (tamaño, opacidad, colocación, editor, restaurar) | la capa táctil | sí | E2E `touch`, `touchEditor`, `mobile` |

**Lo que no hay, dicho:** reasignación de botones del mando y de los gestos táctiles (se colocan y escalan, no se reasignan); **vibración** (no existe: no se ofrece un interruptor que no haría nada); subtítulos (no hay voz ni diálogo); modos para daltonismo (no auditado: la información del juego no depende solo del color —los iconos y los textos llevan forma y palabra—, pero no se ha medido con simuladores).

**Qué se añadió en este encargo.**

- **El sistema pide menos movimiento → el juego empieza tranquilo.** Un jugador que no ha elegido nada y cuyo sistema tiene `prefers-reduced-motion: reduce` empieza con «sin temblor» y «menos destellos» activados; en cuanto elige otra cosa, lo suyo gana y se guarda (lo guardado nunca se toca). `defaultsFor` + `SettingsStore({ defaults })`; `settingsStore.test.ts` (+3); E2E `accessibility`: primera ejecución con la preferencia emulada → sin cámara que tiemble y nada escrito; el jugador activa el temblor → tras recargar sigue como él lo dejó.
- **Las acciones de los menús no atacan ni mueven al personaje.** Un defecto real del Pilar 3 ([§6](#6--pilar-3--controles-foco-orientación-y-compatibilidad), #1): el dedo que cerraba el menú atacaba. Corregido y probado con toques reales.
- **El mando navega todos los menús** ([§6](#6--pilar-3--controles-foco-orientación-y-compatibilidad), #4) y el menú ya se podía recorrer con teclado (Tab, flechas, Inicio/Fin, Esc) y con dedo/ratón: **los cuatro métodos de entrada** llegan a todos los controles.
- **Legibilidad medida, no supuesta** (`tools/e2e/contrast.ts`, escena `readable`): para cada texto de cada pantalla del menú, en los dos idiomas, a 1280×720 y en un móvil horizontal, más el cierre de la aventura y el aviso de girar el dispositivo, el navegador calcula el color con que se dibuja (su `color` y todas las `opacity` de lo que lo contiene) contra el fondo (las capas translúcidas apiladas, sobre el peor caso: negro o blanco debajo) y exige la razón de contraste de WCAG (4,5 : 1; 3 : 1 para texto grande). **Encontró y se corrigió**: los nombres violeta de la leyenda del mapa («Sello», «Guardián», «Camino cerrado») daban **4,24 : 1**; ahora son del violeta claro de la misma familia (los iconos conservan el suyo); y **cuatro rótulos de entre 10,5 y 10,9 px** (nombre de la región en el mapa, «Dónde estás», los títulos de la ficha, las insignias de las partidas) pasan a 11 px o más. Resultado: 16 pantallas × texto, **todo ≥ 4,5 : 1 y ≥ 11 px**.
- **Los menús no se solapan** (se mide, no se mira): el botón de pausa, el HUD, los botones táctiles y el aviso de girar no se tocan en móvil y tableta verticales (E2E `focus`), y las escenas `pauseMap`/`mobile`/`accessibility` ya medían lo demás.

**Límite honesto.** El contraste se mide contra el peor caso del fondo, no contra el dibujo real del juego que hay bajo un panel translúcido (los paneles del menú son casi opacos); el HUD, cuyas cifras están dibujadas sobre el arte aprobado, **no** se ha tocado ni se ha medido (es el arte de la persona que lo hizo).

---

## 9 · Pilar 7 — Monetización y preparación para publicar

**Qué había.** Una sola dependencia de producción (`pixi.js`), ningún SDK de anuncios, compras, analítica ni cuentas, ningún proyecto nativo, ningún aviso de licencias de terceros, ninguna declaración de privacidad, una descripción de manifiesto que todavía decía «3D» (del primer encargo) y un `icon.svg` que es un marcador de posición (un triángulo y un círculo), no el arte del juego.

**Decisión sobre la monetización: no hay, y por eso no hay código.** El encargo pide una capa de monetización *real*, sin dependencias ficticias. Ninguna decisión de negocio está tomada en el repositorio (ni precio, ni anuncios, ni compras), y un SDK de anuncios o de compras sin cuenta de editor, sin identificadores de producto y sin una tienda que lo valide sería exactamente la dependencia ficticia que el encargo prohíbe: compilaría, no haría nada y obligaría a declarar en las tiendas datos que el juego no recoge. Un juego de pago se vende por la tienda sin que el código intervenga. Queda dicho en [PUBLISHING §3](PUBLISHING.md) qué hay que hacer **antes** de escribir código si se decide otra cosa (elegir modelo, actualizar la declaración de privacidad, pedir consentimiento donde la ley lo exija y volver a pasar la prueba `privacy`, que fallará con razón en cuanto salga una petición a un tercero). **Estado: no aplica por decisión — no es «pendiente por hacer» ni «hecho».**

**Qué se hizo.**

| Pieza | Qué es | Dónde / prueba |
|---|---|---|
| **Avisos de software de terceros** | `public/THIRD_PARTY_NOTICES.txt`, generado de lo **instalado** (la clausura de producción de `package.json`: 12 paquetes —PixiJS y lo que lo compone—, MIT / ISC / BSD-3-Clause) con el texto de licencia de cada uno; se copia a `dist/` y viaja con el juego. `npm run licenses` lo escribe; `npm run licenses:check` forma parte de `npm run build` y **falla** si está desactualizado: no se puede añadir ni subir de versión una dependencia sin que su aviso la siga. | `tools/licenses.ts`, `tests/unit/app/webMetadata.test.ts` (el aviso existe y nombra lo que el juego lleva) |
| **Privacidad verificada, no declarada** | Una sesión completa (partida nueva, paseo, el menú de pausa con todas sus pantallas, un ajuste, un guardado, el final de la aventura, una recarga) se graba petición a petición y se lista el almacenamiento al terminar. **Todas** las peticiones son al propio origen (**590** en desarrollo, donde cada módulo se pide por separado; **125** contra el *build* de producción); ningún *beacon*; ningún *socket* a terceros; ninguna cookie; ni IndexedDB, ni *cache storage*, ni *service worker*, ni `sessionStorage`; en `localStorage` solo claves `troid.*`. Es lo que sostiene las declaraciones de tienda de [PUBLISHING §4](PUBLISHING.md). | E2E `privacy` (desarrollo y producción) |
| **Ningún secreto en el repositorio ni en el *build*** | Búsqueda de claves, *tokens*, URL con credenciales y cadenas de configuración de servicios en `src`, `public`, `tools`, `index.html`, las configuraciones y el `dist/` construido: ninguna. Tampoco hay `@font-face` (la tipografía es la del sistema): ningún fichero de fuente de otros que licenciar. | revisión a mano con expresiones regulares (no se conserva el *script*) |
| **Puentes nativos** | `nativeStorage` (las partidas y los ajustes en `UserDefaults` / `SharedPreferences` por `@capacitor/preferences`, **probando** que funcionan antes de fiarse) y `nativeApp` (el botón Atrás de Android es la tecla de pausa; pasar a segundo plano abre la pausa; por `@capacitor/app`). Se enlazan **por nombre** desde `window.Capacitor` (no hay ninguna dependencia nueva en `package.json`) y viajan en *chunks* que una página web nunca descarga. | `nativeStorage.test.ts` (14), `nativeApp.test.ts` (8): contra **dobles** del contrato documentado de cada *plugin*. **Nunca se ejecutaron en un dispositivo.** |
| **Metadatos de la página** | La descripción del manifiesto ya no dice «3D»; la página tiene `<meta name="description">`, título, enlace al manifiesto, `viewport-fit=cover` (zonas de seguridad), y los colores del manifiesto son los de la cortina de arranque. Cada icono que el manifiesto nombra es un fichero de la página. | `webMetadata.test.ts` (8) |
| **CI con navegador real** | Tras `check` (tipos, pruebas, *build*), **cuatro trabajos a la vez**: `e2e (play)` y `e2e (stability)` construyen el juego, miden el arranque en frío (`bench:bundle`, que **falla** por encima del techo) y juegan contra el *build* de producción las escenas que prueban el camino de un jugador —arranque, movimiento, combate, sala, mundo completo, pausa y mapa, mando, foco, final, recorrido final, calidad Automática; resiliencia, privacidad, legibilidad y un laboratorio (`sprites`: lo que se carga bajo demanda arranca en el *build* empaquetado)—, repartidas en dos porque un ejecutor que dibuja por software tarda ~3 veces lo que un equipo de desarrollo; `engines (firefox)` y `engines (webkit)` corren el humo de [§6](#6--pilar-3--controles-foco-orientación-y-compatibilidad). La descarga de cada navegador tiene un tope de siete minutos y tres intentos (se quedó parada más de veinte en dos ocasiones). La suite entera (`npm run test:e2e`, desarrollo y `-- --prod`, 65 escenas) tarda más de lo que un *push* debe esperar y se corre a mano antes de cada versión. | `.github/workflows/ci.yml` |
| **Guía para quien publica** | [PUBLISHING.md](PUBLISHING.md): qué hay, qué se comprobó y qué no (tabla honesta), monetización, privacidad con plantilla de política y declaraciones de tienda que se derivan, lo que decide el editor, pasos de Capacitor (orientación, notch, iconos, firma), la lista de comprobación **en dispositivo** (diez puntos que nadie ha hecho), escritorio y la lista de lanzamiento. | `docs/PUBLISHING.md` |

**Lo que este pilar NO hace, y quién lo hace** (todo ello, en la [§12](#12--lo-que-queda-y-quién-lo-hace)): no existe proyecto Xcode ni Android Studio; no hay instaladores de escritorio; no hay icono, pantalla de arranque ni capturas definitivos (decisión de quien conoce la marca: no se inventa); no hay cuentas, firma ni envío; los créditos no llevan nombres del equipo (los rellena quien publica). **Nada de esto se presenta como publicado, aprobado ni probado en un dispositivo.**

---

## 10 · Pilar 8 — Pruebas de principio a fin y resultados

**Qué prueba cada tipo de verificación, y qué no** (esta tabla no se lee saltándose la última columna):

| Tipo | Qué es | Demuestra | NO demuestra |
|---|---|---|---|
| **Unitaria** | `vitest`; funciones y clases puras, o con un DOM simulado (`happy-dom`) | que la regla hace lo que dice, con entradas límite | que el navegador la use bien |
| **Integración** | `GameSession` completa con un jugador de guion, guardados reales sobre un almacenamiento simulado, mundos enteros y *soaks* con semilla | que los sistemas juntos cumplen sus invariantes (nada se pierde, nada se duplica, nada se bloquea) a lo largo de una partida entera | un navegador |
| **E2E en navegador real** | Chromium con teclado, ratón y toques reales (protocolo DevTools) y un mando abstracto, contra el servidor de desarrollo y contra el *build* de producción | que la página arranca, dibuja, responde y no se rompe; que lo que ve el jugador es lo que dice la simulación | otro motor, ni un dispositivo |
| **Humo en otros motores** | Firefox y WebKit (Playwright, Linux), en la CI | que arranca, dibuja, mueve, pausa, guarda y recarga | un iPhone o un Android: el WebKit de Linux **no es** el Safari de iOS |
| **Construcción** | `tsc` estricto, `assets:check`, `hud:check`, `licenses:check`, `bench:bundle` | que lo que se publica es coherente y cabe en su presupuesto | rendimiento |
| **Dispositivo** | — | — | **Nadie lo ha hecho** ([PUBLISHING §6.3](PUBLISHING.md)) |
| **Humana** | — | — | **Ninguna persona ha jugado esta versión**: el balance, la comprensión y la comodidad se juzgaron con simulaciones e instrumentos |

**Los recorridos de jugador** (de una partida nueva hasta el final, de tres maneras, y siempre con un jugador de guion —nunca una persona—):

| Recorrido | Qué recorre | Dónde |
|---|---|---|
| **El mundo entero, en la simulación** | R1 → R2 → R3 (carta, sello) → R4 (guardián, Air Dash) → la salida del mundo, que completa la aventura | `worldJourney.test.ts`, `slice.test.ts` |
| **El mismo, con cierre y reapertura** | en cada entrada a una sala y cada 37 ticks se guarda, se vuelve a leer como lo haría un arranque en frío y se sigue con la partida reabierta; se compara con la viva | `saveJourney.test.ts` |
| **El mismo, en un navegador, con teclado real** | grabado en Node y reproducido tick a tick por el teclado de Chromium, comparando un resumen de toda la simulación cada 50 ticks (tres cambios de sala y el guardián) | E2E `world`, `world-art` |
| **El mismo, por tres dispositivos** | teclado en R1–R2, **mando** hasta el final y, tras recargar, **dedos** de la antesala al final; lo guardado es lo jugado; la partida queda completada | E2E `finale` |
| **El final** | la salida, el cierre sin que nada llegue al mundo, la partida completada, Escape, el segundo paso, partida nueva en otra ranura; móvil con dedos; movimiento reducido | E2E `ending` |
| **Menús** | pausa y mapa con teclado, dedo y mando; alcanzabilidad de cada control; foco y orientación | E2E `pause`, `pauseMap`, `pauseZone`, `focus`, `gamepad`, `touch`, `mobile` |
| **Una sesión larga** | miles de acciones aleatorias; 30 vueltas de menús, salas, peleas y derrotas sin fugas | E2E `soak`, `resilience` |
| **Lo que sale y lo que se guarda** | una sesión completa, petición a petición | E2E `privacy` |
| **Si se puede leer** | contraste y tamaño de letra de 16 pantallas en dos idiomas | E2E `readable` |

**Resultados** (sobre el código con el que se cierra el encargo; ningún cambio de `src/` posterior):

| Verificación | Resultado |
|---|---|
| Tipos (`tsc` estricto) | limpio |
| Unitarias e integración (`vitest`) | **228 archivos · 3 734 pruebas**, todas verdes (≈ 3 min) |
| Mutaciones de la lógica nueva | **23 de 23 muertas**: 20 con un guion desechable (una línea rota por mutante, las pruebas que debían notarlo, el archivo restaurado de git) y 3 a mano, cada una contra la prueba que la tiene que matar —el *pipe* de WebGL en un renderer de *canvas* (E2E `resilience` en producción), quitar el apagado de los efectos (E2E `resilience`) y devolver el `await` de nivel superior a `main.ts` (`noTopLevelAwait.test.ts`)— |
| Construcción (`npm run build`: `tsc` + `assets:check` + `hud:check` + `licenses:check` + `vite build`) | verde |
| Arranque en frío (`npm run bench:bundle`) | **196 569 B** de 204 800, en 12 ficheros |
| E2E en Chromium, servidor de desarrollo, **toda la suite** (`npm run test:e2e`) | **65 de 65** (≈ 37 min) |
| E2E en Chromium contra el *build* de producción, **toda la suite** (`npm run test:e2e -- --prod`) | **65 de 65** (≈ 35 min). La historia de las pasadas completas: la primera dio **58 de 65** (seis escenas de laboratorio y `settings`: [§7 #6](#7--pilar-5--estabilidad-errores-y-sesión-larga)), la siguiente **64 de 65** (`accessibility`, un instrumento que dependía de la velocidad de la máquina) y, con los dos arreglados, **65 de 65** |
| Humo en Firefox 155 y WebKit 26.6 (CI) | **11 de 11** en cada uno |
| CI en el último *push* con código (`62f6373`) | `check`, `e2e (play)`, `e2e (stability)`, `engines (firefox)` y `engines (webkit)`: **verdes** |

**Qué encontró cada tipo de verificación** (lo que ninguna de las otras habría visto):

| Defecto | Lo encontró |
|---|---|
| Un enemigo empujado a un foso dejaba la puerta cerrada para siempre | la simulación de cientos de peleas con semilla (integración) |
| Un dedo que cerraba un menú atacaba; el aviso de ventana en vertical no existía; el mando no usaba los menús | toques reales por el protocolo de Chromium y una auditoría de la entrada (E2E) |
| Un fotograma que lanzaba una excepción congelaba el juego; un arranque fallido dejaba una página negra | fallos inyectados en el navegador (E2E) |
| El arranque en frío se pasaba del techo (42 ficheros, 204 942 B) | `bench:bundle` |
| **Sin WebGL, el primer golpe rompía todos los fotogramas** | **Firefox en la CI** (dibuja con *canvas*): ni el servidor de desarrollo ni Chromium con WebGL lo muestran |
| **Los laboratorios (`?lab=`) quedaban colgados en producción** | **la suite entera contra el *build* de producción** (la CI jugaba solo 16 escenas, ninguna de laboratorio) |
| El `stack` de Firefox y de Safari no lleva el mensaje del error (el registro decía solo dónde) | el primer fallo de Firefox en la CI → `describeError` |
| Cuatro instrumentos de las pruebas medían otra cosa que el juego (el número de capturas que caben en una espera —la velocidad del ejecutor—, la lectura del temblor de la cámara unos fotogramas después de provocarlo —la de la máquina—, un tope de 5 s para una prueba que tardó 5,6 s en la CI, y una medida de coste que contaba todas las llamadas de fotograma de la página y no la del juego) | un ejecutor lento, una máquina ocupada y mirar de cerca las cifras |

**La lección del encargo.** Los dos defectos más serios del cierre —el de sin WebGL y el de los laboratorios— **solo existen fuera del servidor de desarrollo con Chromium y WebGL**: el primero en otro motor, el segundo en el *build* empaquetado. Lo que los encontró fue correr **la suite entera contra el *build*** y **el juego en otro motor**, no más pruebas del mismo tipo. Por eso quedan en la CI, a cada *push*, el humo de Firefox y WebKit, las escenas clave en producción y un laboratorio. **Nada de esto sustituye una prueba en un dispositivo o con una persona** ([§12](#12--lo-que-queda-y-quién-lo-hace)).

---

## 11 · Estado final por pilar

*Terminado* = hecho, probado en el navegador o en la simulación según corresponda, y sin nada pendiente que dependa de este repositorio. *Parcial* = lo que se podía hacer aquí está hecho y probado, y queda algo que este entorno no permite comprobar o decidir. *Bloqueado* = no se puede avanzar desde aquí sin algo externo. Ninguna fila se marca *terminado* porque exista código o una interfaz: se marca por lo que las pruebas miran.

| # | Pilar | Estado | Qué lo sostiene | Qué lo limita |
|---|---|---|---|---|
| 1 | **Combate, mecánicas y progresión** | **Terminado** (en el contenido que existe) | Cada acción tiene una mecánica real y probada; *soaks* de cientos de peleas con invariantes por tick y resultado idéntico con la misma semilla; **un bloqueo real encontrado y corregido** (el enemigo caído a un foso); recompensas que se conceden una sola vez; progresión guardada y cargada ([§5](#5--pilar-1--combate-enemigos-jefes-y-progresión)) | El contenido es el de la porción vertical (cuatro salas, un enemigo, un guardián). El balance se juzgó con simulaciones, **no con jugadores**; no se cambió ningún valor |
| 2 | **Mapa, exploración y final real** | **Terminado** | La salida del mundo completa la aventura, guarda la partida como completada **antes** de enseñar nada, abre el cierre y créditos con dos caminos; el mundo no valida sin un final alcanzable; el mapa sale de los datos reales ([§3](#3--pilar-2--el-final-real-de-la-aventura)) | Los créditos no llevan nombres (los rellena quien publica); no hay pantalla de título (el juego arranca en la partida; las partidas están en la pausa) |
| 3 | **Controles, compatibilidad y multiplataforma** | **Parcial** | Teclado, ratón, táctil y mando con la misma abstracción; el mando recorre todos los menús (alcanzabilidad medida); foco, pausa por pérdida de foco, aviso de orientación; un defecto real corregido (el dedo que cerraba un menú atacaba); humo en **Firefox 155 y WebKit 26.6** en la CI, 11 de 11 en cada uno ([§6](#6--pilar-3--controles-foco-orientación-y-compatibilidad)) | **Ningún dispositivo real, ningún mando físico, ningún Safari de iPhone, ningún Firefox con tarjeta gráfica y sonido** (el audio de Firefox quedó bloqueado en el ejecutor). No se reasignan los botones del mando ni los gestos táctiles; no hay vibración. Los puentes de Capacitor están probados solo contra dobles |
| 4 | **Guardado, carga y protección** | **Terminado en la web · parcial en nativo** | Escritura serializada que lee de vuelta, copias, lo ilegible apartado y no borrado, una versión más nueva nunca se sobrescribe; recorridos que cierran y reabren **en cada sala y en cualquier tick**; fallos inyectados (cuota llena, escritura que no vuelve) ([§4](#4--pilar-4--guardado-carga-y-protección)) | El almacenamiento nativo (`@capacitor/preferences`) está probado contra un doble, **nunca en un dispositivo**. Es un guardado local: sin nube y sin protección contra quien edite sus propios datos (un juego de un jugador, sin red) |
| 5 | **Rendimiento y estabilidad** | **Estabilidad: terminada · rendimiento: parcial** | Un fotograma que falla no congela el juego; un arranque que falla lo dice; sin WebGL se juega en *canvas* (con golpes y partículas: lo comprobó, y corrigió, Firefox); si los fotogramas siguen fallando, los efectos se apagan y el juego sigue; pérdida de contexto superada; 30 vueltas sin fugas (instantáneas del *heap*); arranque en frío bajo su techo y vigilado por la CI ([§7](#7--pilar-5--estabilidad-errores-y-sesión-larga)) | **Ninguna medida en un dispositivo.** Las cifras de fotogramas y de coste de JavaScript son de un Chromium con dibujo por software: sirven para comparar versiones y para saber dónde mirar primero, no dicen nada de un teléfono |
| 6 | **Accesibilidad, configuración y comodidad** | **Terminado, con límites declarados** | Cada opción hace algo y se prueba que lo hace; legibilidad **medida** (contraste ≥ 4,5 : 1 y letra ≥ 11 px en 16 pantallas y dos idiomas); movimiento reducido del sistema respetado; los cuatro métodos de entrada llegan a todos los controles ([§8](#8--pilar-6--accesibilidad-configuración-y-comodidad)) | **No se ha probado con un lector de pantalla ni con simuladores de daltonismo.** Sin reasignación de mando ni de gestos táctiles; sin vibración; el HUD (arte aprobado) no se midió |
| 7 | **Monetización y preparación para publicar** | **Preparación: terminada · publicación: bloqueada (externo)** · monetización: **no aplica por decisión** | Avisos de terceros generados y exigidos por el *build*; privacidad **medida** (todo al propio origen; sin cookies, analítica ni almacenamiento ajeno); sin secretos; guía [PUBLISHING.md](PUBLISHING.md); CI con navegador real ([§9](#9--pilar-7--monetización-y-preparación-para-publicar)) | Sin proyecto nativo, sin instaladores de escritorio, sin cuentas, firma ni envío, sin icono ni capturas definitivos: **[§12](#12--lo-que-queda-y-quién-lo-hace)** |
| 8 | **Pruebas de principio a fin** | **Terminado en lo automático · bloqueado en lo humano y en dispositivos** | Recorridos de jugador de guion del principio al final (simulación, navegador con teclado, mando y dedos), sesión larga, privacidad y legibilidad; regresión completa **de las 65 escenas** en desarrollo y en producción, el humo en otros dos motores y la CI a cada *push* ([§10](#10--pilar-8--pruebas-de-principio-a-fin-y-resultados)) | **Ninguna persona ha jugado esta versión** y nada se ha ejecutado en un dispositivo físico |

**Lectura honesta de la tabla.** El juego, tal como existe, es **completo y estable como página web** y está **preparado** para empaquetarse; lo que separa este repositorio de una publicación en tiendas no es código del juego sino lo que exige un dispositivo, una cuenta o una decisión de marca. Ningún pilar se declara *terminado* en lo que depende de esas tres cosas.

---

## 12 · Lo que queda y quién lo hace

| # | Qué falta | Quién | Por qué no se hizo aquí |
|---|---|---|---|
| 1 | **Probar en dispositivos reales**: un iPhone, un Android de gama media y uno de gama baja, con la lista de [PUBLISHING §6.3](PUBLISHING.md) (táctil con varios dedos, muesca, orientación, Atrás, segundo plano, guardado tras cerrar, memoria, 60 fps en la pelea con el guardián) | QA / quien publica | No hay dispositivos |
| 2 | **Safari de iOS y Firefox de escritorio en particular**: en Safari, el audio con el interruptor de silencio puesto, el desbloqueo del audio con el primer toque, la decodificación de MP3; en Firefox, que **el sonido arranque** con la primera tecla o clic (en el ejecutor de la CI el contexto quedó bloqueado) y que el juego se vea bien en *canvas* y con WebGL | QA | No hay iPhone ni un Firefox con tarjeta gráfica y sonido; el WebKit y el Firefox de Playwright (Linux, sin cabeza) no son esos |
| 3 | **Un mando físico** (Bluetooth o USB): menús con la cruceta, A pulsa, B retrocede, desenchufarlo en plena pelea | QA | No hay mando; se probó con uno abstracto |
| 4 | **Crear la cáscara de Capacitor** (iOS y Android): identificador, orientación, `@capacitor/preferences` y `@capacitor/app`, `npx cap sync` ([PUBLISHING §6.1](PUBLISHING.md)) | Desarrollador con Xcode y Android Studio | No hay Xcode ni Android SDK |
| 5 | **Cuentas, firma y envío** (Apple Developer, Google Play Console; certificados y *keystore* fuera del repositorio) y las **declaraciones de privacidad y de edad** con las respuestas de [PUBLISHING §4](PUBLISHING.md) | Editor | Cuentas y credenciales |
| 6 | **Icono, pantalla de arranque, capturas, textos de ficha y la URL de la política de privacidad**; `public/icon.svg` es un marcador de posición del primer encargo | Editor / diseño | Decisión de marca: no se inventa |
| 7 | **Nombres del equipo en los créditos** (`src/content/credits.ts`) | Editor | No hay ninguno que el repositorio sepa |
| 8 | **Escritorio**: decidir el envoltorio (Electron, Tauri, itch.io, Steam), firmarlo, y probar | Editor / desarrollador | Decisión de distribución; sin cuentas |
| 9 | **Jugar con personas**: comprensión del primer minuto, balance de las peleas y del guardián, comodidad de los controles táctiles, lector de pantalla, daltonismo | Producto / QA | No hay jugadores |
| 10 | **Rendimiento en gama baja**: si no llega a 60 fotogramas, afinar «Calidad» y los presupuestos con el dispositivo delante («Automática» baja sola a «Baja» si la mayoría de los fotogramas de varios segundos tarda más de 24 ms, pero ese umbral **nunca se ha visto en un teléfono**) | Desarrollador | Sin dispositivo |
| 11 | **Los seis dibujos que faltan del protagonista** (segundo golpe, golpe en el aire, agachado, gateo, golpe agachado, beber: `art/player/requests/`) y **el arte definitivo** de salas, enemigo y guardián (hoy pintado por código, provisional) | Arte | Decisión y trabajo de arte: no se sustituye lo aprobado |
| 12 | **El audio definitivo** (hoy es síntesis determinista del repositorio, de pre-producción; nadie lo ha oído con oídos) | Audio | Decisión y trabajo de audio |
| 13 | **Más contenido** (salas, enemigos, guardianes, habilidades): los sistemas son genéricos y el contenido son datos; hace falta diseño | Diseño | Fuera del alcance del encargo |
| 14 | **Decisiones de producto abiertas**: pantalla de título / menú principal, reasignación del mando y de los gestos, vibración, un modo de 30 fotogramas, la nube | Producto | No se piden en el encargo y cada una cambia lo aprobado o la política de datos |

**Qué hacer primero** si se retoma: 1, 2 y 3 (nada de lo demás se puede dar por bueno sin ellos), después 4–7 en paralelo, y 9 con la primera versión instalable en la mano.
