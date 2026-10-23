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

*(se rellena al cerrar el pilar)*

---

## 10 · Pilar 8 — Pruebas de principio a fin y resultados

*(se rellena al cerrar el encargo)*

---

## 11 · Estado final por pilar

*(se rellena al cerrar el encargo)*

---

## 12 · Lo que queda y quién lo hace

*(se rellena al cerrar el encargo)*
