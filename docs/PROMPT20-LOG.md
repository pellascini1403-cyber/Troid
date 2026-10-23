# Prompt 20 — Fase final: completado, estabilización y preparación para el lanzamiento

> Documento del encargo «FASE FINAL — COMPLETADO, ESTABILIZACIÓN Y PREPARACIÓN PARA EL LANZAMIENTO DEL JUEGO»: llevar el proyecto existente a un estado completo, estable y listo para publicar **implementando, corrigiendo, integrando y probando** —no auditando—, sin rehacer lo visual ni lo que ya funcionaba y sin dar nada por terminado porque exista código o interfaz. Etapas: **A** inspección · **B** sistemas críticos (guardado, progresión, combate, transiciones, estabilidad) · **C** compatibilidad y experiencia · **D** integraciones comerciales · **E** validación final. **Lo que no se pudo hacer desde este entorno —dispositivos, cuentas de tienda, firma, Xcode, Android SDK— lo dice la [§12](#12--lo-que-queda-y-quién-lo-hace); nada se da por hecho sin una prueba que lo mire, y ninguna prueba automática se presenta como prueba de funcionamiento en un dispositivo físico.**

---

## 1 · Inspección (Etapa A, antes de tocar una línea)

| Pregunta | Respuesta, leída en el repositorio y ejecutada |
|---|---|
| **¿Qué stack hay?** | Vite 8 + TypeScript estricto (`noUnusedLocals`, `verbatimModuleSyntax`) + PixiJS 8 (render 2D), simulación determinista pura (`GameSession`, bus de eventos tipado), DOM para HUD, menús y controles táctiles. Sin *framework* de UI, sin motor de terceros, sin proyecto nativo en el repositorio. Pruebas: `vitest` + `happy-dom` (unitarias e integración) y E2E con `playwright-core` sobre Chromium (`tools/e2e`). CI en cada *push*: `typecheck`, `test`, `build` (`.github/workflows/ci.yml`). |
| **¿Qué estado de ramas y cambios había?** | Rama `claude/troid-vertical-slice`, árbol limpio en `eaa9245` (Prompt 19 cerrado). Sin PR, sin ramas pendientes de integrar. |
| **¿Qué estaba ya terminado?** | Movimiento, combate, magia, botellas, un enemigo (Ink Slime) y un guardián con fases; mundo de 4 salas con puertas, llaves, sellos y atajos; punto de control; HUD con arte aprobado; audio completo (motor Web Audio, música, ambientes, efectos); pausa con mapa del mundo; menús (ajustes, sonido, controles, partidas, perfil); guardado v2 con tres ranuras, copias, validación y migraciones; controles táctiles con editor; gamepad con la misma abstracción que el teclado. **No se rehízo nada de ello.** |
| **¿Qué faltaba de verdad?** | (1) **El final**: la última salida del mundo no hacía nada —ni victoria, ni créditos, ni registro de partida completada—. (2) Un enemigo empujado a un foso sin suelo **caía para siempre** y dejaba sin poner la bandera que abre una puerta: un bloqueo permanente hasta recargar. (3) El mando **no navegaba los menús** (solo abría y cerraba la pausa) y el aviso de **ventana en vertical** no existía. (4) Un toque con el dedo en «Continuar» **atacaba** (los eventos de ratón que el navegador fabrica tras un toque caían sobre el juego al cerrarse el menú). (5) Un fotograma que lanzaba una excepción **detenía el bucle para siempre** (pantalla congelada sin mensaje); un arranque fallido dejaba una **página negra**. (6) Nada documentaba lo necesario para publicar (privacidad, avisos de terceros, pasos externos). (7) La página guardaba solo en `localStorage`: ningún almacenamiento que un contenedor nativo pueda dar. |
| **¿Qué no se puede comprobar aquí?** | iOS y Android reales (no hay Xcode, Android SDK ni dispositivos), Firefox y Safari (solo hay Chromium), tiendas, firma, mando físico, vibración, rendimiento en gama baja. **No se afirma nada de eso.** |
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

**Compatibilidad analizada de forma estática** (no es una prueba en esos navegadores): el JS construido se **transforma sin pérdidas** con `esbuild` para `safari15`, `ios15`, `chrome90/98` y `firefox100`, y **no** para `safari14`/`ios14` (39 de 70 ficheros; primera causa, la espera de nivel superior); el código usa `structuredClone` (Safari 15.4, Chrome 98, Firefox 94), protege `ResizeObserver`/`createImageBitmap` y tiene alternativa de `AudioContext` y de `decodeAudioData` con *callbacks*. **Mínimos que se derivan: iOS/Safari 15.4, Chrome/WebView 98, Firefox 100.** Solo se ha ejecutado en **Chromium** (escritorio, ventanas de móvil y tableta emuladas, toques reales por CDP).

**Límites declarados.** No hay reasignación de botones del mando ni de los botones táctiles (los táctiles se **colocan** y se **escalan**; las teclas sí se reasignan); no hay vibración (no se ofrece una opción que no haría nada); las zonas de seguridad se probaron con inserciones simuladas (`?safe=`), no con una muesca real; el bloqueo de orientación lo hace el manifiesto (`orientation: landscape`) y, en nativo, la configuración de la cáscara (ver [§12](#12--lo-que-queda-y-quién-lo-hace)).

---

## 7 · Pilar 5 — Estabilidad, errores y sesión larga

**Auditoría (lo que ya estaba).** Todo lo que se carga bajo demanda (menú, capas, arte, audio, efectos, vistas del jefe, herramientas) tolera que su *chunk* no llegue y el juego sigue sin él; las salas esperan su arte con tiempos de espera; la cortina de arranque tiene su propio tope (10 s) y la página otro de respaldo (20 s); el guardado soporta cuota llena, escrituras que no vuelven y lecturas corruptas; el audio y el arte tienen alternativas; el *soak* E2E existente comprueba que tras miles de acciones aleatorias no queda un objeto de Pixi, una vista, una partícula ni un nodo del DOM de más.

**Defectos encontrados y corregidos.**

| # | Defecto | Corrección | Prueba |
|---|---|---|---|
| 1 | **Un fotograma que lanzaba una excepción detenía el bucle para siempre**: el siguiente `requestAnimationFrame` se pedía después de los *hooks*, así que la pantalla se quedaba con el último dibujo, sin respuesta y sin mensaje. | `GameLoop` captura el fallo, **suelta el tiempo que debía** (sin ráfaga de recuperación), pide el siguiente fotograma y avisa con `failed(error, racha)`. `Game2D` lo escribe en el registro (el primero de cada racha y uno de cada 60, no una línea por fotograma) y, tras **120 fallos seguidos**, detiene el bucle y muestra una página (`crash.ts`, un *chunk* propio) en el idioma de la página con «Recargar»: el juego se guarda mientras se juega, y la última partida guardada es la que vuelve. Sin nadie a quien avisar, el error no se traga: llega al navegador después de pedir el siguiente fotograma. | `gameLoop.test.ts` (+6); E2E `resilience`: cuatro fotogramas rotos se saltan y el juego sigue (una sola línea de registro); todos rotos → página «Something went wrong» / «Algo ha fallado», mundo parado, foco en el botón, recarga y **vuelve la partida guardada**. |
| 2 | **Un arranque fallido dejaba una página negra.** | La cortina de arranque no se levanta para un juego que no pudo empezar: se queda y dice qué pasó (HTML y CSS puros en `index.html`, ES/EN, `role="alert"`, «Reintentar»). Marcado por `<html data-boot>`: `failed` (el juego lanza al crearse, o **un *script* suyo no llega** —un *listener* de errores en el propio HTML, sin esperar—) y `stalled` (nada ha empezado a los 20 s; si el juego llega después, levanta la cortina como siempre). Sin coste en el JS inicial. | `curtain.test.ts` (+1); E2E `resilience`: código que no llega (inmediato), navegador sin contexto de dibujo (en español) y descarga que no termina (a los 20 s). |
| 3 | **Un navegador sin WebGL** (no se sabía qué pasaba). | Comprobado, no cambiado: Pixi cae al *canvas* 2D y **el juego se juega entero, con su imagen**. | E2E `resilience`: sin WebGL el héroe corre y la página no tiene cortina ni mensaje. |
| 4 | **La GPU quita el contexto** (un móvil que pasa a segundo plano lo hace). | Comprobado, no cambiado: Pixi lo recupera. | E2E `resilience`: `WEBGL_lose_context` → la simulación sigue, nada se lanza al jugador, el contexto vuelve y la imagen es la misma (luminancia media dentro del 15 %). |
| 5 | **El arranque en frío se pasaba del techo** con lo nuevo (204 942 de 204 800 B) y venía con 42 ficheros porque el empaquetador corta un *chunk* por cada módulo que también usa algún *chunk* diferido. | Una sola regla en `vite.config.ts`: **los módulos del juego que la página importa estáticamente viven en un solo fichero** (`codeSplitting.groups`, etiqueta `$initial`); `main.ts` importa `Game2D` estáticamente. Mismo código, 14 ficheros en vez de 42, **195 975 B** (−9 KB gz, margen 8,8 KB). | `npm run bench:bundle`; E2E en producción de 16 escenas contra el nuevo reparto. |

**Fugas y sesiones largas** (E2E `resilience`, medido con las herramientas del navegador, no a ojo): 4 vueltas de calentamiento y 30 de medida de *menú abierto → cada una de sus seis pantallas → cerrar → cambio de sala → slime que aparece → derrota del héroe → reaparición*, en desarrollo y contra el *build* de producción:

| Qué | Antes → después de 30 vueltas (producción; en desarrollo, lo mismo) |
|---|---|
| *listeners* de `window` / `document` / `body` / `#ui` / canvas (lista del depurador) | 33 / 4 / 0 / 0 / 2 → **idénticos** |
| temporizadores vivos (envoltorio de `setTimeout`/`setInterval` que cuenta los que siguen vivos) | 1 → **1** |
| nodos del DOM | 568 → **568** |
| *heap* que sobrevive a una recolección | 9,50 → 9,87 → 10,22 → 10,55 MB (lotes de 10 vueltas: +0,37, +0,35, +0,33); en desarrollo 18,8 → 19,9 MB |

Un *heap* que crece ~35 KB por vuelta **no se dio por bueno sin saber de qué era**: se tomaron **instantáneas del *heap* antes y después** de 40 cambios de sala, 40 peleas, 40 derrotas y 120 aperturas del menú, y se compararon por constructor (sondas desechables: no se conservan en el árbol). Resultado: tras recolectar, **lo que crece es el propio registro de rendimiento del navegador** (una entrada `PerformanceLongAnimationFrameTiming` por cada fotograma lento, que con el render por software de este entorno son muchos) y poco más (+0,2 MB en 40 cambios de sala; +0,04 MB en 40 peleas; +0,03 MB en 40 derrotas; el menú, plano: 0,2–0,5 MB oscilando en 120 aperturas); **ningún objeto del juego se acumula**. La primera sonda sí vio crecer las listas de actualización de Pixi (`RenderGroup.childrenToUpdate`): era un artefacto de la sonda (cargaba salas más deprisa de lo que se dibujaban fotogramas) y se vacía con cada fotograma real. Los umbrales de la prueba (< 4 MB en total y < 1 MB en el último lote) son los que dejan pasar ese ruido y detectarían una fuga de verdad.

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
| **CI con navegador real** | Un trabajo `e2e` que, tras `check`, construye el juego, mide el arranque en frío (`bench:bundle`, que **falla** por encima del techo) y juega contra el *build* de producción las escenas que prueban el camino de un jugador: arranque, movimiento, combate, sala, mundo completo, pausa y mapa, mando, foco, final, recorrido final, resiliencia, privacidad y legibilidad. La suite entera (`npm run test:e2e`, desarrollo y `-- --prod`) tarda más de lo que un *push* debe esperar y se corre a mano antes de cada versión. | `.github/workflows/ci.yml` |
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

**Resultados.** *(Se escriben al cerrar el encargo, con las cifras de las regresiones completas en desarrollo y en producción, de las pruebas unitarias y de integración y de la CI. Hasta entonces, esta sección solo dice qué prueba cada cosa.)*

---

## 11 · Estado final por pilar

*Terminado* = hecho, probado en el navegador o en la simulación según corresponda, y sin nada pendiente que dependa de este repositorio. *Parcial* = lo que se podía hacer aquí está hecho y probado, y queda algo que este entorno no permite comprobar o decidir. *Bloqueado* = no se puede avanzar desde aquí sin algo externo. Ninguna fila se marca *terminado* porque exista código o una interfaz: se marca por lo que las pruebas miran.

| # | Pilar | Estado | Qué lo sostiene | Qué lo limita |
|---|---|---|---|---|
| 1 | **Combate, mecánicas y progresión** | **Terminado** (en el contenido que existe) | Cada acción tiene una mecánica real y probada; *soaks* de cientos de peleas con invariantes por tick y resultado idéntico con la misma semilla; **un bloqueo real encontrado y corregido** (el enemigo caído a un foso); recompensas que se conceden una sola vez; progresión guardada y cargada ([§5](#5--pilar-1--combate-enemigos-jefes-y-progresión)) | El contenido es el de la porción vertical (cuatro salas, un enemigo, un guardián). El balance se juzgó con simulaciones, **no con jugadores**; no se cambió ningún valor |
| 2 | **Mapa, exploración y final real** | **Terminado** | La salida del mundo completa la aventura, guarda la partida como completada **antes** de enseñar nada, abre el cierre y créditos con dos caminos; el mundo no valida sin un final alcanzable; el mapa sale de los datos reales ([§3](#3--pilar-2--el-final-real-de-la-aventura)) | Los créditos no llevan nombres (los rellena quien publica); no hay pantalla de título (el juego arranca en la partida; las partidas están en la pausa) |
| 3 | **Controles, compatibilidad y multiplataforma** | **Parcial** | Teclado, ratón, táctil y mando con la misma abstracción; el mando recorre todos los menús (alcanzabilidad medida); foco, pausa por pérdida de foco, aviso de orientación; un defecto real corregido (el dedo que cerraba un menú atacaba); humo en Firefox y WebKit en la CI ([§6](#6--pilar-3--controles-foco-orientación-y-compatibilidad)) | **Ningún dispositivo real, ningún mando físico, ningún Safari de iPhone.** No se reasignan los botones del mando ni los gestos táctiles; no hay vibración. Los puentes de Capacitor están probados solo contra dobles |
| 4 | **Guardado, carga y protección** | **Terminado en la web · parcial en nativo** | Escritura serializada que lee de vuelta, copias, lo ilegible apartado y no borrado, una versión más nueva nunca se sobrescribe; recorridos que cierran y reabren **en cada sala y en cualquier tick**; fallos inyectados (cuota llena, escritura que no vuelve) ([§4](#4--pilar-4--guardado-carga-y-protección)) | El almacenamiento nativo (`@capacitor/preferences`) está probado contra un doble, **nunca en un dispositivo**. Es un guardado local: sin nube y sin protección contra quien edite sus propios datos (un juego de un jugador, sin red) |
| 5 | **Rendimiento y estabilidad** | **Estabilidad: terminada · rendimiento: parcial** | Un fotograma que falla no congela el juego; un arranque que falla lo dice; sin WebGL se juega en *canvas*; pérdida de contexto superada; 30 vueltas sin fugas (instantáneas del *heap*); arranque en frío bajo su techo y vigilado por la CI ([§7](#7--pilar-5--estabilidad-errores-y-sesión-larga)) | **Ninguna medida en un dispositivo.** Las cifras de fotogramas y de coste de JavaScript son de un Chromium con dibujo por software: sirven para comparar versiones y para saber dónde mirar primero, no dicen nada de un teléfono |
| 6 | **Accesibilidad, configuración y comodidad** | **Terminado, con límites declarados** | Cada opción hace algo y se prueba que lo hace; legibilidad **medida** (contraste ≥ 4,5 : 1 y letra ≥ 11 px en 16 pantallas y dos idiomas); movimiento reducido del sistema respetado; los cuatro métodos de entrada llegan a todos los controles ([§8](#8--pilar-6--accesibilidad-configuración-y-comodidad)) | **No se ha probado con un lector de pantalla ni con simuladores de daltonismo.** Sin reasignación de mando ni de gestos táctiles; sin vibración; el HUD (arte aprobado) no se midió |
| 7 | **Monetización y preparación para publicar** | **Preparación: terminada · publicación: bloqueada (externo)** · monetización: **no aplica por decisión** | Avisos de terceros generados y exigidos por el *build*; privacidad **medida** (todo al propio origen; sin cookies, analítica ni almacenamiento ajeno); sin secretos; guía [PUBLISHING.md](PUBLISHING.md); CI con navegador real ([§9](#9--pilar-7--monetización-y-preparación-para-publicar)) | Sin proyecto nativo, sin instaladores de escritorio, sin cuentas, firma ni envío, sin icono ni capturas definitivos: **[§12](#12--lo-que-queda-y-quién-lo-hace)** |
| 8 | **Pruebas de principio a fin** | **Terminado en lo automático · bloqueado en lo humano y en dispositivos** | Recorridos de jugador de guion del principio al final (simulación, navegador con teclado, mando y dedos), sesión larga, privacidad y legibilidad; regresión completa en desarrollo y en producción ([§10](#10--pilar-8--pruebas-de-principio-a-fin-y-resultados)) | **Ninguna persona ha jugado esta versión** y nada se ha ejecutado en un dispositivo físico |

**Lectura honesta de la tabla.** El juego, tal como existe, es **completo y estable como página web** y está **preparado** para empaquetarse; lo que separa este repositorio de una publicación en tiendas no es código del juego sino lo que exige un dispositivo, una cuenta o una decisión de marca. Ningún pilar se declara *terminado* en lo que depende de esas tres cosas.

---

## 12 · Lo que queda y quién lo hace

| # | Qué falta | Quién | Por qué no se hizo aquí |
|---|---|---|---|
| 1 | **Probar en dispositivos reales**: un iPhone, un Android de gama media y uno de gama baja, con la lista de [PUBLISHING §6.3](PUBLISHING.md) (táctil con varios dedos, muesca, orientación, Atrás, segundo plano, guardado tras cerrar, memoria, 60 fps en la pelea con el guardián) | QA / quien publica | No hay dispositivos |
| 2 | **Safari de iOS en particular**: el audio con el interruptor de silencio puesto, el desbloqueo del audio con el primer toque, la decodificación de MP3 | QA | No hay iPhone; el WebKit de Playwright no es Safari de iOS |
| 3 | **Un mando físico** (Bluetooth o USB): menús con la cruceta, A pulsa, B retrocede, desenchufarlo en plena pelea | QA | No hay mando; se probó con uno abstracto |
| 4 | **Crear la cáscara de Capacitor** (iOS y Android): identificador, orientación, `@capacitor/preferences` y `@capacitor/app`, `npx cap sync` ([PUBLISHING §6.1](PUBLISHING.md)) | Desarrollador con Xcode y Android Studio | No hay Xcode ni Android SDK |
| 5 | **Cuentas, firma y envío** (Apple Developer, Google Play Console; certificados y *keystore* fuera del repositorio) y las **declaraciones de privacidad y de edad** con las respuestas de [PUBLISHING §4](PUBLISHING.md) | Editor | Cuentas y credenciales |
| 6 | **Icono, pantalla de arranque, capturas, textos de ficha y la URL de la política de privacidad**; `public/icon.svg` es un marcador de posición del primer encargo | Editor / diseño | Decisión de marca: no se inventa |
| 7 | **Nombres del equipo en los créditos** (`src/content/credits.ts`) | Editor | No hay ninguno que el repositorio sepa |
| 8 | **Escritorio**: decidir el envoltorio (Electron, Tauri, itch.io, Steam), firmarlo, y probar | Editor / desarrollador | Decisión de distribución; sin cuentas |
| 9 | **Jugar con personas**: comprensión del primer minuto, balance de las peleas y del guardián, comodidad de los controles táctiles, lector de pantalla, daltonismo | Producto / QA | No hay jugadores |
| 10 | **Rendimiento en gama baja**: si no llega a 60 fotogramas, afinar «Calidad» y los presupuestos con el dispositivo delante (hoy «Automática» es el perfil equilibrado y no mide el dispositivo) | Desarrollador | Sin dispositivo |
| 11 | **Los seis dibujos que faltan del protagonista** (segundo golpe, golpe en el aire, agachado, gateo, golpe agachado, beber: `art/player/requests/`) y **el arte definitivo** de salas, enemigo y guardián (hoy pintado por código, provisional) | Arte | Decisión y trabajo de arte: no se sustituye lo aprobado |
| 12 | **El audio definitivo** (hoy es síntesis determinista del repositorio, de pre-producción; nadie lo ha oído con oídos) | Audio | Decisión y trabajo de audio |
| 13 | **Más contenido** (salas, enemigos, guardianes, habilidades): los sistemas son genéricos y el contenido son datos; hace falta diseño | Diseño | Fuera del alcance del encargo |
| 14 | **Decisiones de producto abiertas**: pantalla de título / menú principal, reasignación del mando y de los gestos, vibración, un modo de 30 fotogramas, la nube | Producto | No se piden en el encargo y cada una cambia lo aprobado o la política de datos |

**Qué hacer primero** si se retoma: 1, 2 y 3 (nada de lo demás se puede dar por bueno sin ellos), después 4–7 en paralelo, y 9 con la primera versión instalable en la mano.
