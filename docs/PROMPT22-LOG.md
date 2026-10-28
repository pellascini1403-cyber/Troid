# Prompt 22 — Finalización real del metroidvania

> Documento del encargo «Continuá desde el estado actual… terminar el juego existente y elevarlo a un estado de producto completo»: **cerrar las carencias reales** del juego de siete zonas y 64 salas, **verificar lo que pueda verificarse automáticamente** y dejar **claramente identificados los pocos pasos que requieren recursos del propietario, dispositivos físicos o acciones externas**. Sin reconstruir, sin ampliar el mundo, sin tocar los PNG aprobados, sin inventar arte definitivo y sin dar nada por terminado porque una bitácora lo diga. Este archivo se escribe **a medida que se trabaja**: cada sección dice qué se hizo, qué se comprobó y qué no.

---

## 1 · Inspección (antes de tocar una línea)

### 1.1 · Estado de partida

| Qué | Lo que se leyó |
|---|---|
| Git | Rama `claude/troid-vertical-slice`, `HEAD` = `origin` = `8975fec` (*Prompt 21 (E10): `rearmExit` tenía una ruta sin prueba…*); árbol limpio; la CI de `8975fec` (nº 122) en verde (`check`, `e2e play`, `e2e stability`, Firefox, WebKit) |
| Cifras de los datos, leídas del código (no de la bitácora) | **64 salas** en `WORLD` (8 · 9 · 10 · 10 · 10 · 10 · 7), **139 salidas** (138 que llevan a otra sala + 1 que termina el mundo), 31 con requisito; **15 definiciones de enemigo** (14 arquetipos + el fragmento de cristal), **7 jefes**, `ABILITIES` con 14 entradas de las que **2 (`grapple`, `swim`) son `implemented: false`**, **8 vasijas** (`UPGRADES`) y 6 reliquias (habilidades pasivas), **15 santuarios**, **10 sellos y suelos/muros partidos**, 20 objetos, 167 puntos de aparición, 7 colocaciones de jefe. **Coinciden con la bitácora del Prompt 21.** |
| Pruebas | `tsc` limpio; 249 archivos y 4 640 pruebas unitarias y de integración; 66 escenas E2E (66 de 66 en producción y en desarrollo al cerrar el Prompt 21) |
| Arranque en frío | 203 236 B de 204 800 (quedan 1 564 B); el mundo posterior al Santuario viaja en un *chunk* de ≈ 28 KB gz |

### 1.2 · Lo que la bitácora anterior decía y el código no sostiene

Contrastar la documentación con el código real encontró **estas diferencias** (cada una se trabaja más abajo):

| # | Lo que se decía | Lo que hay | Gravedad |
|---|---|---|---|
| D1 | «Cada **arena** se pelea con un jugador de guion hasta que el jefe cae y deja su recompensa» (PROMPT21-LOG §10, y «los catorce arquetipos y los siete guardianes, jugados») | Las pruebas de arena (`describeArena`) **derriban al jefe de un golpe de 1 000 000 con el héroe invulnerable**; `bosses.test.ts` pelea con un «héroe perfecto» **invulnerable que no se mueve** y cuya espada se inyecta como una caja de golpe; `creatures.test.ts` deja al héroe **inmortal y quieto**. **Ninguna prueba demuestra que un héroe mortal, que se mueve con las entradas de una persona, pueda vencer a uno de los seis jefes nuevos ni a las criaturas en sus salas.** Solo el Custodio de Tinta tiene un luchador de guion (`fightTheWarden`). | **Alta** |
| D2 | «El mundo se comprueba por tramos que se encadenan» | Cierto, y **no hay una partida continua** de la partida nueva a los créditos (ya dicho en §11.4 del Prompt 21) | **Alta** |
| D3 | `controls.touchPauseHow`: «El icono de arriba, **en el centro**» | El botón de pausa está **arriba a la derecha** (Prompt 19; se ve en las capturas): el texto de la pantalla de controles quedó viejo | Media |
| D4 | «Salto doble, salto de pared y golpe al suelo: 6 habilidades que abren el mundo» | La pantalla de **Controles no dice cómo se usan** (ni una fila del salto doble, el salto de pared o el golpe al suelo) y **al ganar una habilidad no aparece ningún texto** (solo el brillo y el sonido genérico de «habilidad ganada»): un jugador nuevo no tiene cómo saber que existe el golpe al suelo | Alta |
| D5 | «Probado con teclado y táctil» | Las pruebas táctiles cubren correr, saltar, agacharse, atacar, esquivar, magia, interactuar y botellas; **ninguna cubre el salto doble, el salto de pared ni el golpe al suelo con gestos táctiles** (el golpe al suelo pide *abajo sostenido + ataque en el aire*) | Media |
| D6 | «Los suelos y muros partidos y la palanca se dibujan con el *blockout*» | Cierto, y **se ve mal**: un suelo partido (la Nave, el Salón de las Minas) se dibuja como un **rectángulo blanco brillante con un sigilo**, que se lee como un sello de energía y no como piedra agrietada; la palanca, como un poste con una bola | Media |
| D7 | «El tiempo jugado» | El perfil guarda solo el total de ticks, muertes, bajas y salas visitadas: **no hay tiempo por zona, por sala, en combate ni contra jefes** | Media (pedido §11) |

Lo que **sí** se comprobó cierto: botón de pausa arriba a la derecha, el mapa como primera vista a la izquierda y las opciones en la columna de la derecha (capturas de `pauseMap`), el mapa que descubre sala a sala y conserva su estado, 66 escenas E2E, la CI en verde, 0 archivos de imagen o sonido cambiados desde `1944de4`.

### 1.3 · Recursos: qué hay de verdad

| Recurso | Estado en el repositorio |
|---|---|
| Protagonista (la hoja del propietario, `art/player/source/character-sheet.png`, intacta) | **12 clips** con dibujo en el manifiesto (`idle`, `walk`, `run`, `jump`, `fall`, `land`, `attack1`, `cast`, `dash`, `interact`, `hurt`, `death`; `assets:missing` dice «10 de 15» porque cuenta solo los 15 estados que el juego pide a la hoja). **Faltan 6 clips, 26 dibujos, que NO existen en el repositorio** (ni en `art/player/source/delivered/`, ni en `inbox/`): `attack2` (5), `crouch` (2), `crouchWalk` (4), `aerialAttack` (6), `crouchAttack` (5), `drink` (4). El kit para pedirlos está hecho (`art/player/requests/`: un `brief.md` y una `reference.png` por clip, `requests.json`, el lienzo y la herramienta de recepción `npm run assets:intake`). **El juego dibuja esos estados con el marcador del motor**; no se ha inventado ni reutilizado ningún dibujo. |
| HUD (las dos hojas del propietario, `src/ui/hud/png/original/`, bloqueadas por `sha256` en `npm run hud:check`) | Intactas. |
| Enemigos | **Solo el Ink Slime** tiene arte pintado (por código, provisional). Los **13 arquetipos restantes** se dibujan con siluetas procedurales (`PROCEDURAL_LOOKS`: 21 «looks», de los que 2 tienen arte). |
| Jefes | **Solo el Custodio de Tinta** tiene arte pintado (por código, provisional). Los **6 jefes del motor** se dibujan con siluetas procedurales. |
| Escenario | 6 paquetes `ruins-*` **pintados por código** (provisionales). Piezas sin pintar: la **piedra partida** (`door:stone`, 4 piezas) y la **palanca** (`interactive:activate`); `assets:missing`: «14 de 16 piezas». |
| Audio | **Todo sintetizado por código** (recetas deterministas, sin muestras de nadie): 81 sonidos y 8 piezas (4 de música: `chamber`, `ruins`, `sanctum`, `warden`; 4 lechos de ambiente). Los siete jefes comparten `warden`. No hay sonido propio del salto doble, del salto de pared, del golpe al suelo (la señal `player:slammed` solo mueve la cámara), de la palanca frente al resto de «activar», de la piedra que se parte, ni de ninguno de los 13 enemigos nuevos. |
| Cáscara nativa | **No existe** (`capacitor.config`, `ios/`, `android/`): el juego está preparado, no empaquetado. |

> **Regla de este encargo respecto de los recursos.** No se redibuja ni se sustituye ningún PNG aprobado; no se presenta como definitivo nada que sea una silueta procedural, un dibujo pintado por código o un sonido sintetizado; lo que falta y debe aportar el propietario se pide **con el nombre del archivo, las dimensiones y el uso**, y no bloquea el resto.

---

## 2 · Lista de tareas, por importancia y dependencias

| # | Tarea | Por qué ahora | Depende de |
|---|---|---|---|
| T1 | **Un piloto** que juega con las entradas de una persona (caminar, saltar según el solucionador, esperar, interactuar, cruzar salidas) en una sesión real | Sin él no hay partida completa; revela defectos de movimiento que el solucionador no ve | — |
| T2 | **Luchadores de guion** para las criaturas y los seis jefes, con el héroe **mortal** | D1: es lo que hace que un encuentro sea un encuentro; mide si el combate es justo | T1 |
| T3 | **La partida completa** de la partida nueva a los créditos (guardar/cargar en los santuarios, jefes, habilidades, final real) y su **reproducción en el navegador** | D2: el objetivo más importante | T1, T2 |
| T4 | **Tiempos de sesión** (por zona y sala, combate, jefes, muertes), registro exportable y el informe de la partida de guion | D7 y §11: lo que se puede medir sin una persona | T3 |
| T5 | **Modelo de soft-locks**: desde ningún estado alcanzable se pierde la posibilidad de terminar | §5: habilidades fuera de orden, puertas de un solo sentido, caídas | — |
| T6 | **Texto y controles de las habilidades**: filas de Controles, el texto viejo de la pausa táctil, un aviso al ganar una habilidad; pruebas táctiles y de mando | D3, D4, D5 | — |
| T7 | **Audio**: sonido de cada habilidad nueva, de los mecanismos y los objetos, música por zona y por jefe, comprobaciones de duplicados y de volúmenes | §4 | T6 (nombres de señales) |
| T8 | **Arte funcional**: la palanca, la piedra partida y los suelos y muros partidos con el pintor del escenario; revisión de las siete zonas | D6, §2 | — |
| T9 | **Recepción de arte de criaturas y jefes**: el contrato de piezas para cualquier criatura y la lista exacta de lo que debe aportar el propietario | §2: sin bloquear | — |
| T10 | **Animaciones del protagonista**: ningún estado atascado, retorno al reposo, y los seis pedidos listos para cuando lleguen | §3 | — |
| T11 | **Guardado a escala del mundo**, ranuras, datos dañados, versiones | §9 | T3 |
| T12 | **Mapa y pausa** (verificación en escritorio y móvil) | §8 | — |
| T13 | **Estabilidad completa** (`tsc`, Vitest, E2E de producción y desarrollo, memoria, audio duplicado, CI) | §12: al cerrar cada grupo y al final | todo |
| T14 | **Publicación**: lo que existe y lo que requiere dispositivos, firmas y cuentas | §13 | — |
| T15 | **Bitácora, README, ROADMAP, PUBLISHING, ARCHITECTURE-2D** e informe final | §14–§15 | todo |

> El resto de este documento se rellena **tarea a tarea**, con lo que se hizo y lo que se comprobó.

---

## 3 · El piloto: un jugador de guion con las entradas de una persona (T1)

**Qué es.** `tests/helpers/pilot.ts`: camina por lo que pisa, se levanta donde el solucionador (`reach.ts`) dice que un salto funciona, **juega las entradas del salto leyendo el cuerpo real del héroe tick a tick** (no reproduce una grabación hecha para otro cuerpo), se agacha y repta bajo un techo bajo, y entra por la salida. Para ello el solucionador se refactorizó sin cambiar su comportamiento (las 283 pruebas de salas del mundo siguen igual): la lógica de entradas por tick de un guion salió a la clase `ScriptRunner`, que usan el solucionador y el piloto.

**Qué se comprobó.** `tests/integration/pilotRoad.test.ts`: el piloto cruza **las 55 salas del camino principal** (de `r1_gate` a `ih_end`), cada una desde la entrada por la que el camino llega hasta la salida por la que sale, en la sesión real, con lo que el héroe tiene en ese punto, **con 0 saltos que caigan donde el solucionador no decía**. Las salas se toman sin criaturas y con el héroe inmortal: es la pregunta del *terreno*, hecha al cuerpo real (los combates son otra pregunta, §4). Tiempo de simulación acumulado de esa travesía pura: **32 019 ticks = 8,9 minutos** (sin combates, sin objetos, sin muertes: es el *suelo* de la duración, no una estimación de lo que tarda una persona).

**Qué encontró** (cuatro hallazgos reales, todos arreglados y con prueba):

| # | Hallazgo | Arreglo |
|---|---|---|
| H1 | **`sp_chimney` (Chimenea de Bronce): el único salto que sube el pozo cruza la zona de su puerta oeste.** La puerta medía 4 m (`y` de 2 a 6) y el primer rebote contra la pared izquierda toca a 4 m de altura, cayendo: el héroe que subía era llevado a la Sacristía. Los 64 audit anteriores no lo veían: la auditoría de salas (`bare()`) **quitaba las salidas** de la sala antes de probar el terreno. | La puerta del pie de la chimenea es una rendija de 1 m al nivel del suelo (`rect(1, 2, 3.4, 3)`). **Nueva regla en la auditoría de las 64 salas** (`crossesExit`, `tests/helpers/audit.ts`): *las salidas son muros de fuego (con un palmo de margen) para el héroe que va a otra parte, y todo objetivo sigue alcanzándose*. Resultado: las otras 63 salas la cumplen; solo fallaba esa. |
| H2 | **`PlayerController.reset()` en mitad de un dash dejaba al héroe con un salto y un enfriamiento.** `Player.respawn` (cambio de sala, reaparición) borra el controlador y manda el estado a `free`; salir del dash ejecuta `exitDash()`, que devuelve el ascenso que el dash había guardado y arranca el enfriamiento **después** de borrar. Efecto: quien cruza una salida o reaparece en mitad de un dash llegaba **subiendo a 8,9 m/s** (un salto involuntario) y con el dash aún no listo. Lo destapó el solucionador: sus pruebas se contaminaban entre sí y el único salto de la chimenea fallaba según lo que se hubiera probado antes. | `reset()` pone a cero `dashSavedVy` antes de salir del estado y el enfriamiento después. Prueba `tests/integration/resetMidDash.test.ts` (falla sin el arreglo: «no hop on arrival: expected 8.9 to be 0»). Las 283 pruebas de salas siguen verdes con el solucionador ya sin estado contaminado. |
| H3 | El túnel de agacharse de `r1_gate` (12 m con 1,2 m de altura) **no existía para el solucionador** (no hay suelo «de pie» bajo el techo). | El piloto detecta los pasos bajos (suelo continuo, hueco para el cuerpo agachado) y los atraviesa reptando. |
| H4 | Un salto que despega en el mismo borde de la repisa (sin carrerilla) cae 15 cm corto si el piloto se queda a 10 cm del borde. | El piloto despega desde el borde exacto cuando la carrerilla del salto es menor de 0,5 m. |

**Lo que no se afirma.** El piloto *no es una persona*: sus saltos son los que encuentra un solucionador y los ejecuta con precisión de máquina. Demuestra que **cada sala del camino se cruza con las entradas que una persona tiene** (no que a una persona le resulte fácil); la chimenea, por ejemplo, tiene **un único** salto que la sube con los guiones del solucionador (hay más maneras humanas, con una espera en la pared, que el solucionador no prueba). Quien la juegue dirá si su dificultad es la que se quería (§11: pendiente de medición humana).

---

## 4 · Los encuentros, ganados por un héroe mortal (T2)

**El problema (D1).** Hasta el Prompt 21 la prueba de que un jefe o una criatura «se podía vencer» era un héroe que no podía morir (`godMode`), uno que estaba quieto o un golpe de 1 000 000 puesto a mano en el jefe. Solo el Custodio de Tinta tenía un luchador de guion. Nada demostraba que **un héroe con cinco puntos de vida, tres botellas y las entradas de una persona** pudiera con los seis jefes del motor ni con las catorce criaturas.

**Lo que hay ahora.** Un luchador que lee lo que la criatura *está haciendo* (su estado es el aviso que dibuja la imagen) y responde como dice el contenido:

| Pieza | Qué hace |
|---|---|
| `tests/helpers/brawler.ts` | Las entradas de quien pelea: caminar, saltar, atacar (un golpe cada 15 ticks), dash, golpe al suelo, botella; percibe criaturas y proyectiles; esquiva olas (salto) y escupitajos. |
| `tests/helpers/tactics.ts` | **Una táctica por criatura** (14), leída de su estado y de los números de su definición: *esperar fuera del alcance y golpear en la recuperación* (baba, esquirla, sanguijuela, sombra), *saltar la embestida* (reptador, esquirlón), *correr del lugar de caída* (sapo), *golpear cuando baja el escudo o por la espalda* (Lomo de piedra), *esperar a que la nube se disipe* (espora), *saltar el disparo y acercarse* (escupidor, campanero), *atravesar con el dash la picada* (murciélago), *apagarlo antes de que estalle o correr* (fuego fatuo), *salirse de la línea y golpear al pistón clavado* (pistón), *ir a por quien fabrica criaturas* (tejedor). Hay también un luchador **ingenuo** (`NAIVE`: solo camina y golpea) como línea de base. |
| `tests/helpers/bossFight.ts` | El luchador de **un guardián del motor**, el mismo para los seis: lee los avisos del suelo (columnas, carriles, caída, aterrizaje del salto), sale de ellos (con dash si no hay tiempo), salta el temblor del suelo, cruza bajo la embestida y la sigue, espera a que pasen los proyectiles que vuelan, bebe cuando la vida es baja y nada va a caer, y **golpea el punto débil cuando se abre** (de pie, con salto y tajo en el aire, o con el **golpe al suelo desde arriba** si ya lo tiene el héroe). Perfiles escritos una vez para lo que un jefe exige de más (el Coloso: pegarse a él, dentro del anillo donde caen sus esquirlas, y saltar el temblor). |
| `tests/helpers/hall.ts`, `tests/helpers/road.ts` | La sala larga donde se prueba una criatura sola y la descripción del camino principal (lo que el héroe tiene al llegar a cada sala), compartidas por las pruebas. |
| `tests/integration/encounters.test.ts` | 22 pruebas. Catorce criaturas × tres distancias × tres semillas; el mismo combate con el luchador ingenuo; seis jefes × cuatro semillas, en **su propia sala del mundo**, con las habilidades y vasijas que el camino ha dado hasta ahí. |

**Resultados** (`ENCOUNTERS_REPORT=<archivo> npx vitest run tests/integration/encounters.test.ts` los escribe):

| Criatura | Vida perdida (media / máx.) | Ingenuo (media) | Notas |
|---|---|---|---|
| Baba de tinta | 0 / 0 | 0 | indulgente: muere antes de terminar el aviso de 24 ticks |
| Reptador espinoso | 0 / 0 | 1 | |
| Sapo del cenagal | 0 / 0 | 0,7 | |
| Lomo de piedra | 0 / 0 | **5 y pierde 9 de 9** | el escudo exige respuesta |
| Espora luminosa | 0 / 0 | 1 | |
| Escupidor de Tinta | 0,3 / 1 | 1 | |
| Murciélago de cueva | 0 / 0 | 1 | |
| Fuego fatuo de farol | 0 / 0 | 2 | |
| Campanero | 0 / 0 | 0 | indulgente: muere antes de su segundo toque |
| Esquirlón | 0 / 0 | 3 | |
| Dron de pistón | 0 / 0 | 2 | pelea larga (≈ 20 s) |
| Sanguijuela del suelo | 0 / 0 | 2 | |
| Tejedor de tinta | 0 / 0 | 0 | indulgente |
| Sombra del velo | 0 / 0 | 0 | indulgente: el golpe la interrumpe |

**Lectura honesta.** Las catorce se vencen sin pérdida con el luchador que las lee; **nueve cuestan vida al que no las lee** y una (el Lomo de Piedra) lo mata: ahí hay un encuentro de verdad. **Cuatro (baba de tinta, campanero, tejedor, sombra del velo) no cuestan nada ni al ingenuo en una sala vacía**: no son un defecto, pero tampoco una amenaza por sí solas (cuentan en conjunto, en las salas del camino, §5); si la persona que juega los siente blandos, es un ajuste de datos, no de arquitectura. No se ha cambiado ninguna vida ni daño de criatura.

| Jefe (sala) | Semillas ganadas | Duración (s) | Vida perdida (con botellas) | Botellas | Fase final |
|---|---|---|---|---|---|
| Tirano de Raíces (`rt_arena`, 6 de vida) | 4 / 4 | 82 – 95 | 0 – 4 | 0 – 1 | 2 |
| Matriarca del Cenagal (`mr_lair`, 7) | 4 / 4 | 41 – 82 | 2 – 4 | 0 – 1 | 2 |
| Coloso de Cristal (`mn_arena`, 7) | 4 / 4 | 32 – 50 | 2 | 0 | 2 |
| Custodio de la Campana (`sp_arena`, 7) | 4 / 4 | 36 – 42 | 7 – 10 | 1 – 3 | 2 |
| Motor de la Fundición (`fd_arena`, 7) | 4 / 4 | 80 – 115 | 0 – 2 | 0 | 3 |
| Soberano del Corazón de Tinta (`ih_arena`, 7) | 4 / 4 | 44 – 48 | 4 – 8 | 1 – 3 | 3 |

El Custodio de Tinta (`r4_sanctum`) sigue probándose con `fightTheWarden` en `bossWorld.test.ts` (doce semillas). **Ningún jefe deja al héroe por debajo de 2 puntos de vida**; el que más desgasta es el Custodio de la Campana (sus olas de suelo tras la picada) y el Soberano (el abanico de orbes a quemarropa).

**Un defecto real, encontrado al hacer ganable el Motor.** El Motor de la Fundición se anuncia como *«la ventilación de su espalda se abre cuando su embestida acaba contra una pared (aturdimiento largo)»*. La embestida mide 11,0 m y, **después de una embestida desde la pared, la siguiente de vuelta mide exactamente 11,0 m hasta ella**: que el último tick del reloj fuera también el tick en que el cuerpo toca la pared dependía de **menos de un centímetro**, y desde la segunda embestida el aturdimiento *casi nunca* llegaba (el luchador, con 267 s de pelea, no pasaba de 52/60). `handlers.ts` (`charge`) ahora trata como chocada la embestida que acaba a menos de medio metro de un muro; prueba nueva en `bosses.test.ts` (*«a charge that stops a hair short of the wall is stunned like one that touches it»*, falla sin el arreglo). Con ello el Motor cae en 80 – 115 s.

**Lo que no se afirma.** Que *a una persona* estos combates le parezcan justos o divertidos: el luchador no se cansa, no se equivoca de tecla y ve todo el estado interno de las criaturas (no solo la imagen). Demuestran **que cada encuentro tiene una respuesta, que esa respuesta cuesta poco al que la conoce y que el que no la conoce paga**. La dificultad humana (y sus tiempos) queda para la medición con personas (§11).


---

## 5 · La partida completa, de la partida nueva a la salida del mundo (T3, T4) — y lo que destapó sobre el determinismo

**Qué es.** `tests/helpers/runner.ts` (`Runner`) es un jugador de guion que recorre **los 56 salones del camino principal** con las entradas de una persona y **un héroe que puede morir**: el piloto cruza (§3), el luchador pelea (§4: el Rayo contra las linternas, el golpe primero contra la sombra del velo sobre un tablón), los siete guardianes caen, las palancas se tiran, los sellos se rompen como cada uno pide, y **en cada santuario descansa y la partida se guarda con el mismo registrador que usa la página** (`attachProgressRecorder` + `ProgressStore` + `PlayStats`), leída de vuelta como la lee la página. Ninguna acción de la partida es un atajo de la simulación: todo pasa por un `InputFrame`.

| Prueba | Qué comprueba |
|---|---|
| `tests/integration/fullRun.test.ts` | Tres semillas más una partida **cerrada y abierta de nuevo en cuatro santuarios** (`mr_shrine`, `mn_camp`, `sp_shrine`, `ih_shrine`): llega a la salida de la última sala (`adventure:ended`), con los siete guardianes caídos, las cinco habilidades del camino más el Rayo, lo guardado igual a las banderas de la simulación, una partida guardada por santuario, las zonas sumando el tiempo jugado al tick y coincidiendo (±40 ticks) con lo que el corredor midió por fuera, las derrotas iguales a las caídas, los guardianes en el orden del camino, entre 15 y 60 minutos y como mucho 30 derrotas. |
| Escena E2E `fullrun` (`tools/e2e/scenarios/fullrun.ts`) | La **misma** partida (101 887 fotogramas), grabada en Node y repetida en Chromium por la «mano guionizada» de los ganchos de prueba (`__troid.script`: una fuente más del `InputManager`, con el stick tal como se grabó): **2 038 resúmenes de toda la simulación iguales** (héroe, banderas, enemigos, guardianes, sala, transición, generador), en desarrollo y en producción; al final la página está donde acaba el juego —pantalla de cierre abierta, mundo detenido, partida guardada como **completada** en el almacenamiento de la página— y lo guardado son las banderas de la simulación. Memoria de 14 a 41 MB sin crecer, 122 → 129 nodos de DOM y 27 llamadas de dibujo en el peor momento, muestreados a lo largo de 28 minutos de juego. |

**Resultados** (`FULLRUN_REPORT=<archivo> npx vitest run tests/integration/fullRun.test.ts`):

| Partida | Tiempo de simulación | Derrotas | En combate | Hasta cada guardián (min) |
|---|---|---|---|---|
| semilla 1 | **27,5 min** | 3 | 6,4 min | Custodio 1,6 · Tirano 6,1 · Matriarca 8,9 · Coloso 15,3 · Campana 18,9 · Motor 25,4 · Soberano 27,3 |
| semilla 2 | **37,7 min** | 16 (15 en la Fundición) | 11,3 min | … · Motor 35,5 · Soberano 37,5 |
| semilla 3 | **26,2 min** | 2 | 6,3 min | … · Motor 24,1 · Soberano 26,0 |
| cerrada y abierta 4 veces | 29,8 min | 6 | | |

Por zona (semilla 1, minutos): Ruinas y Santuario 1,8 · Raíces 4,4 · Cenagal 2,9 · Minas 6,3 · Campanario 3,7 · Fundición 6,4 · Corazón 2,0. La semilla 2 pasó **17,2 minutos en la Fundición con 15 caídas**: es el tramo más débil del jugador de guion (pasarelas y sala de control), no una medida de lo que le pasará a una persona.

**Defectos reales hallados** (del jugador y del instrumento, y uno del juego):

1. El piloto no salía de un foso largo de pinchos (`recover` ahora camina por el suelo y usa el salto doble); una linterna en una chimenea de pared no se podía apagar (el Rayo vuela a nivel y la linterna flota sobre la cabeza: salto y tajo, o soltarse de la pared si debajo hay suelo seguro); un reloj de sesión cerrada anulaba los golpes tras una recarga; el reloj por sala del corredor acreditaba el tiempo a la sala nueva (lo destapó el cruce con las estadísticas de la página).
2. Al repetir la partida en otro motor el `ScriptRunner` entregaba **fotogramas imposibles** (el botón de salto «sostenido» sin pulsación, por la ventana del segundo salto y la cadena de patadas en la pared) y arrastraba campos de un fotograma al siguiente: corregido en el solucionador (no cambia lo que encuentra: las 283 pruebas de salas siguen igual).
3. **La simulación dependía de funciones que cada motor calcula a su manera** (siguiente apartado).

### 5.1 · La CI estaba roja por esto: `Math.sin` no es el mismo en Node y en Chromium

Las ejecuciones de CI de T4, T5, T6 y T4b (nº 126 a 129) **fallaron** —solo el trabajo `e2e (journey)`, la escena `fullrun` en producción—. El registro dice: *«the browser diverged from the simulation at tick 14400»*, con **un murciélago en picada** en otro sitio (`35,256 · 10,360` en Node, `35,178 · 10,237` en el navegador); todo lo demás del resumen, igual. En el contenedor de trabajo la misma escena pasaba, en desarrollo y en producción.

**Causa, demostrada.** El lenguaje fija el resultado de `+ − × ÷ √`; **no** el de `Math.sin`, `Math.cos`, `Math.atan2`, `Math.hypot`, `Math.pow`, `Math.exp`…, que cada motor, cada versión y cada compilación calcula como quiere. Medido aquí con 400 000 argumentos: **`Math.sin` y `Math.cos` de Node 22 y del Chromium 141 difieren en el último bit en 1 de cada 30 entradas** (`atan2` e `hypot` coincidían en esa pareja de motores; en el Chromium 153 que instala la CI no se pudo medir, la descarga está bloqueada aquí). La simulación gobierna el vuelo del murciélago con `atan2/cos/sin` (el rumbo), la deriva de las linternas con `sin`, los proyectiles de los jefes con `atan2/cos/sin`, y varias distancias con `hypot`. Un bit de diferencia en un rumbo no se nota… hasta que una decisión (una colisión, un umbral) cae al otro lado: a los 14 400 ticks, en CI, un murciélago acabó su picada a un decímetro de donde la acabó en la grabación.

**Reproducido en local, en el mismo tick.** `tests/integration/engineIndependence.test.ts` graba una aventura completa (101 887 fotogramas) con el `Math` del motor, guarda las entradas fotograma a fotograma y la juega otra vez, desde una partida nueva, **sobre un motor cuyas funciones trascendentes responden una unidad en el último lugar de más —o de menos—**; el resumen de la simulación, cada 50 ticks, tiene que ser el mismo. Con la simulación como estaba, la prueba falla **en el tick 14 400** —el de la CI—.

**Arreglo.** `src/core/dmath.ts`: `dsin`, `dcos`, `datan2` y `dhypot`, hechas solo de las operaciones cuyo resultado es el mismo en todos los motores (suma, resta, producto, cociente, raíz cuadrada), con los coeficientes de los núcleos de fdlibm, precisas a ~1e-16 (`tests/unit/core/dmath.test.ts` las compara con las del motor en 800 000 ángulos, 300 000 vectores y los valores especiales del lenguaje: ceros con signo, infinitos, NaN). La simulación las usa en lugar de las del motor (murciélago, linterna, jefes, distancias de la IA y de la interacción); la **regla de arquitectura** `tests/unit/architecture.test.ts` impide que `gameplay`, `player`, `combat`, `abilities`, `enemies`, `interaction`, `world`, `progression` y `core` (salvo las ayudas de la cámara en `core/math.ts`) vuelvan a llamar a una función trascendente de `Math` o a `**`. Con la simulación independiente del motor, la prueba pasa con el `Math` alterado en las dos direcciones; con un mutante que vuelve a llamar a `Math.sin/cos` en `dmath.ts`, **falla en el tick 14 400**.

**Lo que NO se afirma.** Que la CI quede verde: eso lo dirá la ejecución siguiente (§14). Que dos motores *distintos* de verdad (Gecko, JavaScriptCore) coincidan con Node en toda la partida: el trabajo `engines` de la CI ya compara un tramo con Firefox y WebKit; la partida completa solo se ha repetido en Chromium (141 aquí).

**Lo que prueba y lo que no.** Prueba que el mundo, **como una pieza**, se puede terminar con las entradas de una persona, que lo guardado dice *completado* y que la página lo reproduce bit a bit. **No prueba** que una persona pueda, ni cuánto tarda: los 26 – 38 minutos son **una cota inferior de un jugador que conoce el mapa de memoria, no cae casi nunca, no explora y no se equivoca de tecla** (§8).

---

## 6 · Las habilidades: cómo se aprenden, cómo se usan y con qué dispositivo (T6)

**El problema (D3, D4, D5).** Las seis habilidades del camino —**Esquiva** (`dash`), **Rayo** (`magic_attack`, el hechizo de la carta), **Esquiva aérea** (`air_dash`), **Salto doble**, **Salto de pared** y **Golpe al suelo**— existían y se probaban con teclas, pero un jugador nuevo no tenía cómo saber que el Golpe al suelo está ahí (pide *abajo + atacar en el aire*, una combinación que nadie encuentra por casualidad): al ganar una habilidad solo había un brillo y un sonido, y la pantalla de Controles no decía nada de las tres nuevas; el texto de la pausa táctil decía «arriba, en el centro» cuando el botón está arriba a la derecha desde el Prompt 19. Y ninguna prueba hacía el salto doble, el de pared o el golpe al suelo **con los dedos ni con el mando**.

| Habilidad | Teclado | Mando | Táctil | Qué lo prueba |
|---|---|---|---|---|
| Esquiva | Mayús | B | botón de esquiva | `movement`, `touch`, `gamepad` (E2E) y `dash.test` |
| Rayo | K (con la carta puesta) | Y | botón de habilidad (aparece al equipar la carta) | `bolt`, `magic` (E2E), `abilityDevices` |
| Esquiva aérea | Mayús en el aire | B en el aire | tocar otra vez la esquiva en el aire | `airDash.test`, `abilityDevices` |
| Salto doble | Espacio otra vez en el aire | A otra vez | en el aire, bajar el dedo y arrastrarlo de nuevo hacia arriba | `movementAbilities.test`, `abilityDevices` |
| Salto de pared | contra la pared en el aire (se desliza) y Espacio | ídem | contra la pared, arrastrar hacia arriba | ídem |
| Golpe al suelo | S + J en el aire | palanca abajo + X | en el aire, dedo abajo y tocar atacar | ídem |

**Lo que hay ahora.**

- **`AbilityNotice`** (`src/ui/overlays/`, un *chunk* diferido: **+37 B** en el arranque en frío): al ganar una habilidad, el nombre de lo aprendido y **una línea de cómo se hace con los atajos, los botones del mando o los dedos que estén en uso**, hecha con los atajos vigentes (una tecla reasignada ya está en la frase); las reliquias dicen qué hacen. Se detiene mientras el menú está abierto y se encolan de una en una. Textos en español e inglés en el catálogo de los *overlays*. Probado con modelo puro (`abilityNotice.test.ts`) y en el navegador (E2E `world`: el aviso del Impulso aéreo, mirado mientras está en pantalla).
- **Controles:** filas del salto doble, el salto de pared, la esquiva aérea y el golpe al suelo (teclado y mando) y **tres líneas táctiles** (salto doble y de pared, golpe al suelo, esquiva aérea); y el texto viejo de la pausa táctil, corregido.
- **`tests/integration/abilityDevices.test.ts`:** las cuatro maniobras hechas con los gestos de cada dispositivo (el pulgar arrastrado hacia arriba, vuelto a bajar y arrastrado de nuevo; el pulgar abajo mientras el otro toca atacar; la palanca abajo y X; B dos veces en el aire) **tienen el efecto que con las teclas, y sin la habilidad no tienen ninguno**. Dos defectos del propio test, encontrados al escribirlo: un tercer toque contado cuando el héroe ya había aterrizado, y una sala demasiado baja para tres esquivas en una caída.

**Lo que no cuenta.** `grapple` (gancho) y `swim` (nadar) están **declaradas** en `ABILITIES` con `implemented: false` y **nada del juego las usa**: ninguna puerta, sello ni objeto las pide ni las enseña (lo comprueba `progressionOrder.test.ts`, §7), no salen en ninguna pantalla y no cuentan entre las seis. Si algún día se implementan, serán otra tarea.

**Lo que no se ha verificado.** El gesto de los dedos del golpe al suelo (dedo abajo + tocar atacar con el otro pulgar) está probado con **dedos simulados** (`TouchRig`), no con una mano en una pantalla real: que sea cómodo en un teléfono es una pregunta física (§16).

---

## 7 · El mundo no tiene trampas (T5)

**La pregunta.** Con el solucionador (`tests/helpers/reach.ts`: lo que un héroe puede hacer en el aire con lo que tiene) y el modelo de progresión (`analyzeProgression`), ¿hay algún lugar del mundo del que **no se pueda salir**, o algún orden de habilidades que **deje fuera de alcance el final o el principio**?

| Prueba | Qué comprueba | Resultado |
|---|---|---|
| `tests/integration/deadEnds.test.ts` (`deadEnds` en `tests/helpers/audit.ts`) | Desde **cada lugar al que un héroe puede llegar** en una sala (por un salto que se quedó corto, una caída de una repisa, una patada a la pared que no llegó), con lo que tiene al llegar, hay un camino a una salida **que no espera una palanca**. Lo que hiere **no es una trampa**: se cruza a costa de vida, y quien muere vuelve al santuario; solo es trampa un **lugar seguro del que nada sale**. | **Las 64 salas lo cumplen.** El solucionador ganó los pasillos para agacharse (`crouchLinks`, `reachFromCrawling`, que antes eran del piloto): `r1_gate` es el caso. |
| `tests/integration/progressionOrder.test.ts` | Desde **cada una de las 64 salas**, con **solo** lo que pedía el camino hasta ella, el resto del mundo —el final y el principio— sigue alcanzándose; cada puerta tiene su vuelta abierta a quien la cruzó; ninguna puerta, sello o recogida pide ni enseña el gancho ni la natación; cada habilidad que pide el camino se enseñó en la sala que se deja o antes. | Cumplido. **Dos puertas piden una habilidad que se enseña más adelante**: el Relicario (`ru_reliquary`, en las Ruinas) pide el salto doble, que se enseña en la Cámara del Eco (`rt_echo`, Raíces), y el Escondrijo (`rt_hideout`, en las Raíces) pide el salto de pared, que se enseña en el Sumidero (`mr_sink`, Cenagal): ambas llevan a salas **que no hacen falta para terminar** (los lugares a los que volver con lo aprendido). El resto de las habilidades se enseñan donde dice la tabla de §6: Esquiva aérea en el Santuario (`r4_sanctum`, al caer el Custodio), Golpe al suelo en la Forja (`mn_forge`). |

**Otros comprobados y que ya existían** (Prompt 21, `tests/unit/content/world.test.ts` y `worldRooms.test.ts`): el validador del mundo (toda referencia existe, ninguna entrada cae dentro de una salida, toda sala se alcanza y se deja, y **la aventura se puede terminar**), cada conexión es de dos sentidos, el camino principal de 56 salas con **atajos que solo lo acortan** una vez usadas sus palancas, **un santuario cada cuatro a ocho salas** y uno detrás de la arena de cada guardián, la salida este de cada arena que solo funciona al caer su guardián, ninguna entrada, llegada ni reaparición dentro de una trampa de pinchos, y que lo que el mundo puede escribir en un guardado cabe en **la mitad** de lo que un guardado admite.

**Lo que no se afirma.** Que a una persona le resulte *claro* qué hacer en cada punto (los indicios del mundo —el mapa, las grietas, las palancas— no se han puesto delante de nadie) ni que no existan rincones **incómodos** (un salto que el solucionador resuelve y a una persona le cuesta). El modelo dice que **el mundo no se rompe**, no que **se entienda**.

---

## 8 · El tiempo jugado y la duración (T4b, y lo que se sabe de verdad)

**Instrumentación.** Hasta ahora el perfil guardaba el total de ticks, derrotas, bajas y salas visitadas. Ahora `PlayStats` cuenta, de los eventos que la simulación ya emite y con su propio reloj: **los ticks vividos en cada zona, las derrotas en cada zona y el tiempo jugado en que cayó por primera vez cada guardián** (campos opcionales de las estadísticas guardadas: una partida guardada antes se lee igual y empieza a contar desde ahí; las tablas se limpian al leer —nombres válidos, cuentas positivas, un tope—, `tests/unit/save/golden/progress.v2.zones.json` fija el formato). El **Perfil** lo muestra («Tiempo en cada zona», «Tiempo hasta cada guardián»). El tiempo es el de la **simulación**: no cuenta la pausa, las pantallas de carga ni los menús.

**`npm run session:report -- <archivo…>`** (`tools/sessionReport.ts`): lee una o varias partidas exportadas desde «Partidas guardadas → Exportar» y dice el tiempo total, **por zona**, las derrotas y el tiempo hasta cada guardián; con varias, el más corto, la mediana y el más largo de cada zona. **Es como se mide la duración real de quienes jueguen**: ninguna simulación la da.

**Lo que se mide hoy** (§5): el jugador de guion tarda **26 – 38 minutos** de la partida nueva a la salida (**27,5 / 37,7 / 26,2** con tres semillas), de los que **6 – 11 minutos son combate**, con 2 – 16 derrotas.

| Qué | Lo que se sabe | Lo que NO se sabe |
|---|---|---|
| Travesía pura (sin combates, sin objetos, sin muertes) de las 55 salas | 32 019 ticks = **8,9 min** (§3) | — |
| Partida completa del jugador de guion | **26 – 38 min** | Es **una cota inferior**: un jugador con el mapa de memoria, que no explora, no duda y no se equivoca de tecla. |
| Duración **de una persona** | **desconocida** | Hay 8 salas opcionales, secretos, vasijas, atajos y una segunda mitad que se vuelve a recorrer; una persona que descubre el mundo, muere aprendiendo a los jefes y explora puede tardar varias veces más. |
| «3 – 5 h el camino, 5 – 7 h con lo opcional» (objetivo del encargo) | **No se ha comprobado ni se da por cumplido** | Hacen falta partidas humanas medidas con `session:report`. |

**Lo que se puede decir con honestidad:** el mundo **es lo bastante grande para que una persona tarde bastante más de 30 minutos** (64 salas, siete zonas, siete jefes, y un camino de 56 salas con combates que cuestan vida al que no los lee), y **no hay ninguna medición que respalde las 3 – 5 horas**. Si al medir con personas resultara corto, **el ajuste es de datos** (más criaturas, jefes con más vida, más salas) y no de arquitectura; **no se ha tocado ninguna vida ni daño** para fingir duración.

**Balance, lo que ya se vio** (§4): cuatro criaturas (baba de tinta, campanero, tejedor, sombra del velo) **no cuestan nada ni al héroe ingenuo en una sala vacía**; el Lomo de piedra mata al ingenuo; el jefe que más desgasta es el Custodio de la Campana (7 – 10 puntos de vida con 1 – 3 botellas) y el más largo, el Motor (80 – 115 s). La Fundición es donde el jugador de guion más cae (15 caídas en una semilla).
