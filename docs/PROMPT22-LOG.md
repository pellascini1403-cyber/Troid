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
| D6 | «Los suelos y muros partidos y la palanca se dibujan con el *blockout*» | Cierto, y **se ve mal**: un suelo partido (la Nave, el Salón de las Minas) se dibuja como un **rectángulo blanco brillante con un sigilo**, que se lee como un sello de energía y no como piedra agrietada; la palanca, como un poste con una bola. **Causa hallada y arreglada (§10.2):** el escenario con arte colgaba el sigilo violeta de los sellos **también** de la piedra partida. | Media |
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
| Audio | **Todo sintetizado por código** (recetas deterministas, sin muestras de nadie): 81 sonidos y 8 piezas (4 de música: `chamber`, `ruins`, `sanctum`, `warden`; 4 lechos de ambiente). Los siete jefes comparten `warden`. Lo que **no** tiene sonido propio (medido en §11): el salto doble y el de pared suenan como el salto en el aire, el golpe al suelo suena como un aterrizaje pesado y sacude la cámara (su espera y su bajada están en silencio), la palanca es el «activar» de todo, la piedra que se parte suena como el sello violeta que se rompe y las 13 criaturas nuevas usan los sonidos del Slime. |
| Cáscara nativa | **No existe** (`capacitor.config`, `ios/`, `android/`): el juego está preparado, no empaquetado. |

> **Regla de este encargo respecto de los recursos.** No se redibuja ni se sustituye ningún PNG aprobado; no se presenta como definitivo nada que sea una silueta procedural, un dibujo pintado por código o un sonido sintetizado; lo que falta y debe aportar el propietario se pide **con el nombre del archivo, las dimensiones y el uso**, y no bloquea el resto.

---

## 2 · Lista de tareas, por importancia y dependencias

| # | Tarea | Por qué ahora (apartado del encargo) | Depende de |
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
| T16 | **La CI en rojo** (añadida al descubrirla): la escena `fullrun` divergía del Node en el Chromium del ejecutor (§5.1) | §12: no se dan por buenas unas pruebas que la CI rechaza | T3 |

> El resto de este documento se rellena **tarea a tarea**, con lo que se hizo y lo que se comprobó; cómo terminó cada una, en la tabla final (§16). Cambios respecto del plan: **T8** no genera arte nuevo con el pintor (no se inventa arte; se arregla lo que sí era un defecto del código y se pide lo que falta, §10) y **T9** se amplía a cerrar el camino de arte de los seis guardianes del motor; se añade **T16**, la causa de la CI en rojo (§5.1). Los *commits* llevan otra numeración (la del orden en que se hicieron: `T1` a `T11` y `T4b`), con la correspondencia en §14.

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

## 5 · La partida completa, de la partida nueva a la salida del mundo (T3) — y lo que destapó sobre el determinismo

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

### 5.1 · La CI estaba roja por esto (T16): `Math.sin` no es el mismo en Node y en Chromium

Las ejecuciones de CI de los *commits* `0252430`, `c1d1028`, `0031273`, `b5afbaa` y `4954d86` (nº 126 a 130) **fallaron** —solo el trabajo `e2e (journey)`, la escena `fullrun` en producción; `check`, Firefox, WebKit y los otros dos trabajos E2E pasaron—. El registro dice: *«the browser diverged from the simulation at tick 14400»*, con **un murciélago en picada** en otro sitio (`35,256 · 10,360` en Node, `35,178 · 10,237` en el navegador); todo lo demás del resumen, igual. En el contenedor de trabajo la misma escena pasaba, en desarrollo y en producción.

**Causa, demostrada.** El lenguaje fija el resultado de `+ − × ÷ √`; **no** el de `Math.sin`, `Math.cos`, `Math.atan2`, `Math.hypot`, `Math.pow`, `Math.exp`…, que cada motor, cada versión y cada compilación calcula como quiere. Medido aquí con 400 000 argumentos: **`Math.sin` y `Math.cos` de Node 22 y del Chromium 141 difieren en el último bit en 1 de cada 30 entradas** (`atan2` e `hypot` coincidían en esa pareja de motores; en el Chromium 153 que instala la CI no se pudo medir, la descarga está bloqueada aquí). La simulación gobierna el vuelo del murciélago con `atan2/cos/sin` (el rumbo), la deriva de las linternas con `sin`, los proyectiles de los jefes con `atan2/cos/sin`, y varias distancias con `hypot`. Un bit de diferencia en un rumbo no se nota… hasta que una decisión (una colisión, un umbral) cae al otro lado: a los 14 400 ticks, en CI, un murciélago acabó su picada a un decímetro de donde la acabó en la grabación.

**Reproducido en local, en el mismo tick.** `tests/integration/engineIndependence.test.ts` graba una aventura completa (101 887 fotogramas) con el `Math` del motor, guarda las entradas fotograma a fotograma y la juega otra vez, desde una partida nueva, **sobre un motor cuyas funciones trascendentes responden una unidad en el último lugar de más —o de menos—**; el resumen de la simulación, cada 50 ticks, tiene que ser el mismo. Con la simulación como estaba, la prueba falla **en el tick 14 400** —el de la CI—.

**Arreglo.** `src/core/dmath.ts`: `dsin`, `dcos`, `datan2` y `dhypot`, hechas solo de las operaciones cuyo resultado es el mismo en todos los motores (suma, resta, producto, cociente, raíz cuadrada), con los coeficientes de los núcleos de fdlibm, precisas a ~1e-16 (`tests/unit/core/dmath.test.ts` las compara con las del motor en 800 000 ángulos, 300 000 vectores y los valores especiales del lenguaje: ceros con signo, infinitos, NaN). La simulación las usa en lugar de las del motor (murciélago, linterna, jefes, distancias de la IA y de la interacción); la **regla de arquitectura** `tests/unit/architecture.test.ts` impide que `gameplay`, `player`, `combat`, `abilities`, `enemies`, `interaction`, `world`, `progression` y `core` (salvo las ayudas de la cámara en `core/math.ts`) vuelvan a llamar a una función trascendente de `Math` o a `**`. Con la simulación independiente del motor, la prueba pasa con el `Math` alterado en las dos direcciones; con un mutante que vuelve a llamar a `Math.sin/cos` en `dmath.ts`, **falla en el tick 14 400**.

**Resultado en la CI.** La ejecución nº 131 (`a38363c`, este arreglo) pasó **en sus seis trabajos**, incluido `e2e (journey)` —la partida completa, 5 min 15 s—, que era el único que fallaba en las cinco anteriores (§14). **Lo que NO se afirma:** que dos motores *distintos* de verdad (Gecko, JavaScriptCore) coincidan con Node en toda la partida: el trabajo `engines` de la CI ya compara un tramo con Firefox y WebKit; la partida completa solo se ha repetido en Chromium (141 aquí).

**Recompensas, muerte y reaparición** (lo que cada partida comprueba además de llegar al final): al caer cada guardián el héroe tiene lo que ese guardián da —las **cinco habilidades del camino** (Esquiva, Esquiva aérea, Salto doble, Salto de pared, Golpe al suelo), el **Rayo** de la carta y las **vasijas de vida** (más de 5 puntos de vida al final)—; las derrotas que cuenta el corredor, las que cuenta el perfil de la página y la suma de las caídas por zona **coinciden**; tras cada derrota el héroe reaparece en el último santuario con lo ganado intacto (la partida de la semilla 2 cayó 16 veces y siguió hasta el final); y una partida **cerrada y abierta de nuevo en cuatro santuarios** conserva todo lo que se había ganado y cada guardado posterior contiene al anterior.

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

## 8 · El tiempo jugado y la duración (T4, y lo que se sabe de verdad)

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

---

## 9 · Las animaciones del protagonista (T10)

**La pregunta.** ¿Puede algún estado del héroe quedarse colgado —la animación atascada en un golpe, en un trago, en la muerte— y qué pasa con los seis clips que faltan?

**Lo que se comprobó** (`tests/integration/heroContinuity.test.ts`, 20 pruebas, con la simulación y **los dos presentadores reales**, el del marcador y el del arte, como los mueve `PlayerVisual`):

| Comprobación | Resultado |
|---|---|
| Cada movimiento, jugado una vez y con las manos fuera después —tajo, cadena de dos, tajo aéreo, tajo agachado, Rayo, beber (también con un golpe en medio, que no gasta la botella), interactuar, el golpe con **el aturdimiento más largo del juego**, las esquivas en el suelo, en el aire y agachado, el salto doble, el deslizamiento por la pared, el golpe al suelo, una derrota— deja al héroe **libre, en el suelo, con la pose `idle`, sin fase y sin destello**, en los ticks que dicen sus propios datos (el tajo, el canal de la botella, la interacción…). | ✅ |
| 24 partidas al azar (6 semillas × 4 entradas, 2 400 ticks, todos los controles en cualquier orden, la criatura de la sala y golpes de guion, derrotas incluidas) | Ningún estado dura más de la cota que da su dato (cadena de dos golpes 32 ticks, Rayo 14, beber 24, interacción 12, aturdimiento 26, esquiva 10, derrota 162), ninguna pose fuera del vocabulario, ninguna pose que no corresponda al estado, todas terminan **en reposo**. Con mutantes (un aturdimiento que no acaba, una interacción que no acaba) la prueba se rompe. |
| El marcador | Tiene **un clip propio para cada una de las 18 poses** que publica el héroe: nunca cae a un *fallback* (que registraría un aviso por pose). |
| El arte | Dibuja **todo menos cinco poses**: `crouch`, `crouchWalk`, `attackAir`, `attackCrouch`, `drink` (las dibuja el marcador), y la segunda estocada (`attack2`) repite la primera (la sustitución declarada `attack2 → attack1`). |
| Fase y cuadro | El cuadro que se ve durante un golpe es el que el clip asigna a la fase en que está la simulación (`startup`, `active`, `recovery`) y **los cuadros nunca retroceden** (tajo, segundo tajo y Rayo con el arte real). |

**Lo que no cambió.** El deslizamiento por una pared usa la pose `fall`, y el golpe al suelo la del tajo aéreo (`attackAir`: la espera es su preparación, la bajada su golpe, el aterrizaje su recuperación): no hay clip propio de ninguno de los dos y no se han inventado.

### 9.1 · Los seis clips pendientes: lo que se necesita exactamente

**No se ha dibujado, rehecho ni integrado ninguno** (`art/player/source/character-sheet.png`, la hoja del propietario, intacta). El kit para pedirlos está hecho (`art/player/requests/`) y la herramienta que los recibe, comprueba e integra, también (`npm run assets:intake`). El repositorio dice el estado con `npm run assets:intake -- status` y con `npm run assets:missing`.

| Clip del kit | Dibujos | Estado del juego que lo usará | Fases de la simulación (no se tocan) | Cadencia | Brief |
|---|---|---|---|---|---|
| `attack2` | 5 | segunda estocada del combo (hoy repite el primer tajo) | 3 preparación · 3 activos · 11 recuperación (17 ticks) | 28 fps, una vez | `art/player/requests/attack2/brief.md` |
| `crouch` | 2 | agachado, mantenido (hoy: marcador) | — | 2 fps, bucle | `…/crouch/brief.md` |
| `crouchWalk` | 4 | gateo y esquiva agachada (hoy: marcador) | — | 10 fps, bucle | `…/crouchWalk/brief.md` |
| `aerialAttack` (`attackAir`) | 6 | tajo en el aire y golpe al suelo (hoy: marcador) | 3 · 4 · 9 (16 ticks) | 26 fps, una vez | `…/aerialAttack/brief.md` |
| `crouchAttack` (`attackCrouch`) | 5 | barrido agachado (hoy: marcador) | 4 · 3 · 9 (16 ticks) | 26 fps, una vez | `…/crouchAttack/brief.md` |
| `drink` | 4 | beber una botella (hoy: marcador) | canal de 24 ticks | 10 fps (0,4 s), una vez | `…/drink/brief.md` |

Total: **26 dibujos** en 6 hojas. Cómo se entrega: se suelta cada hoja en `art/player/inbox/<clip>/` (la hoja entera como `sheet.png`, o un PNG por pose), `npm run assets:intake -- <clip>` la recorta, la escala por la cabeza al tamaño del `idle`, la coloca y la comprueba, y escribe la hoja de contacto en `art/player/inbox/_reports/<clip>/`; cuando se ve bien, `npm run assets:intake -- <clip> --accept` la integra. **`heroContinuity.test.ts` comprueba que lo pedido encaja con la simulación**: los ticks que declara el kit son los de la simulación, ninguna fase tiene más cuadros que ticks (ningún cuadro se saltaría) y las fases cubren todos los cuadros en orden. Mientras no lleguen, el juego dibuja esos estados con el marcador del motor y **ninguno se queda sin dibujo**.

---

## 10 · El arte (T8, T9): qué hay, qué es provisional y qué falta

> **Regla.** No se ha redibujado, reconstruido ni sustituido ningún PNG aprobado, y **ninguna silueta procedural, dibujo pintado por código o sonido sintetizado se presenta como definitivo**. `npm run assets:missing` imprime el estado **vivo** de todo lo de abajo (y `--strict` falla mientras falte algo).

| Parte | Lo que hay | Qué es | Qué falta |
|---|---|---|---|
| **Protagonista** | 12 clips de 18 (la hoja del propietario, sin tocar) | **del propietario** | 6 clips, 26 dibujos (§9.1) |
| **HUD** | Las dos hojas del propietario, bloqueadas por `sha256` | **del propietario** | — |
| **Escenario** | 6 paquetes `ruins-*`: tierra, piedra, tablones, puerta del guardián, puerta del sello, pinchos, tres fondos, luz, santuarios, recogidas, sigilo | **pintado por código** (`tools/art/painter`), `provisional`: *no* es la mano de una ilustradora | **2 piezas obligatorias**: la piedra (`door:stone`, `body`; opcionales `top`, `bottom`, `glow`) en **8 salas** (`ru_nave`, `rt_tangle`, `mr_stilts`, `mn_hall`, `mn_forge`, `mn_descent`, `sp_bridge`, `fd_line`) y la palanca (`interactive:activate`) en **7** (`rt_cellar`, `mr_approach`, `mn_approach`, `sp_belfry`, `sp_approach`, `fd_control`, `ih_approach`); opcional: la franja de primer plano. Mientras faltan, el *blockout* las dibuja (legibles: se miraron en el navegador, §10.2). |
| **Criaturas** | **1 de 15** con arte: el Ink Slime (`art/ink-slime`, 6 partes, 96 px/m) | **pintado por código**, `provisional` | **14 apariencias** con siluetas por código (13 arquetipos y el fragmento de cristal, que nace de otra criatura), 165 colocaciones en 50 salas |
| **Jefes** | **1 de 7** con arte: el Custodio de Tinta (`art/ink-warden`, 5 partes, 112 px/m) | **pintado por código**, `provisional` | **6 guardianes del motor** con siluetas por código, una sala cada uno |

### 10.1 · Criaturas y guardianes: la lista exacta (`npm run assets:missing`, sección «The creatures' and the guardians' art»)

El contrato de entrega **no cambia por criatura** (`docs/guides/deliver-environment-art.md` §9): **seis partes** de un paquete `enemies` con las etiquetas `enemy:<look>` y `part:<parte>` —`body` (el cuerpo, 1 o más cuadros en bucle, con las anclas `head` y `vfx_origin`), `flash` (la misma silueta en blanco), `eyes`, `sigil`, `spines` (3 cuadros) y `pool` (el charco)—, con `zones` de las salas donde vive. **Tamaño:** lo que hoy ocupan las formas, en metros (a 96 px/m, la densidad del Slime, es `ancho × 96` por `alto × 96` píxeles, más margen para la cerda y el halo: los píxeles no tocan el lado izquierdo, el derecho ni el borde alto del lienzo).

| Apariencia (`<look>`) | Tamaño (m) | Colocaciones | Salas |
|---|---|---|---|
| `bramble_crawler` | 1,1 × 0,7 | 7 | `ru_nave`, `ru_archive`, `rt_mouth`, `rt_tangle`, `rt_gallery` |
| `mire_toad` | 1,2 × 0,9 | 14 | `mr_edge`, `mr_stilts`, `mr_lanterns`, `mr_toadpit`, `mr_climb`, `mr_approach`, `mr_den` |
| `stoneback` | 1,4 × 1,4 | 17 | `mn_seam`, `mn_hall`, `mn_forge`, `mn_descent`, `mn_rails`, `mn_approach`, `mn_vault`, `fd_gate`, `fd_vats`, `fd_catwalks`, `fd_control`, `fd_scrap` |
| `glow_spore` | 0,9 × 1,1 | 6 | `rt_hollow`, `rt_gallery`, `mr_climb`, `mr_approach` |
| `ink_spitter` | 0,9 × 1,2 | 16 | `ru_nave`, `ru_archive`, `rt_bridge`, `rt_echo`, `mr_stilts`, `mr_approach`, `fd_line`, `fd_furnace`, `fd_vats`, `fd_catwalks` |
| `cave_bat` | 0,9 × 0,55 | 25 | `rt_mouth`, `rt_tangle`, `rt_hollow`, `rt_bridge`, `mn_gate`, `mn_seam`, `mn_hall`, `mn_descent`, `mn_approach`, `sp_foot`, `sp_gallery`, `sp_stair`, `sp_belfry`, `sp_bridge`, `sp_approach` |
| `lantern_wisp` | 0,7 × 0,7 | 18 | `mr_stilts`, `mr_lanterns`, `mr_shrine`, `mr_climb`, `mr_approach`, `sp_stair`, `sp_chimney`, `sp_belfry`, `sp_bridge`, `ih_ascent` |
| `bell_toller` | 1,2 × 1,8 | 15 | `sp_foot`, `sp_gallery`, `sp_stair`, `sp_belfry`, `sp_bridge`, `sp_approach`, `sp_loft`, `ih_veins`, `ih_approach` |
| `shardling` | 1,2 × 0,9 | 10 | `mn_gate`, `mn_camp`, `mn_descent`, `mn_rails`, `mn_approach`, `mn_vault` |
| `crystal_shard` | 0,6 × 0,45 | 0 (nace de otra criatura) | — |
| `piston_drone` | 1,2 × 1,0 | 8 | `fd_gate`, `fd_press`, `fd_furnace`, `fd_catwalks`, `fd_scrap` |
| `floor_leech` | 1,2 × 0,55 | 16 | `ru_cistern`, `rt_tangle`, `rt_gallery`, `rt_hideout`, `mr_stilts`, `mr_sink`, `fd_line`, `fd_furnace`, `fd_workshop`, `fd_control`, `ih_shrine` |
| `ink_weaver` | 1,0 × 1,6 | 6 | `fd_line`, `fd_vats`, `fd_control`, `ih_veins`, `ih_approach` |
| `veil_shade` | 0,9 × 1,7 | 7 | `ih_threshold`, `ih_veins`, `ih_ascent`, `ih_approach` |
| `boss_root_tyrant` | 3 × 4,2 | 1 | `rt_arena` |
| `boss_mire_matriarch` | 2,8 × 2,4 | 1 | `mr_lair` |
| `boss_colossus` | 3,2 × 4,6 | 1 | `mn_arena` |
| `boss_bell_warden` | 2,4 × 2,2 | 1 | `sp_arena` |
| `boss_engine` | 3,6 × 3,4 | 1 | `fd_arena` |
| `boss_sovereign` | 2,2 × 3 | 1 | `ih_arena` |

(Con arte: `ink_slime`, 1,1 × 0,9, `r1_gate` y `r2_hall`; `ink_warden`, 1,6 × 2,9, `r4_sanctum`.)

### 10.2 · Lo que se encontró y se arregló

1. **Los seis guardianes del motor no podían recibir arte**: `BossView.dress` era una función vacía, así que un arte pintado para cualquiera de ellos **no se habría visto nunca**, por bien entregado que estuviera. Ahora toman las seis partes de una criatura (`enemy:boss_root_tyrant`…), y sin arte siguen dibujándose con sus formas. `bossView.test.ts` (falla sin el cambio) y la escena K de `room-art` en el navegador, con arte sintético del Tirano de Raíces, lo prueban (y la escena falla sin el cableado de `Game2D`).
2. **Los suelos y muros partidos recibían el sigilo violeta de un sello** cuando el escenario tiene arte: se leían como un sello de energía y ocultaban que eran piedra (D6). Ahora conservan su propio dibujo (una grieta con un hilo de luz) hasta que haya arte de piedra partida (`planSeals`, con prueba sobre las 8 de la tabla del mundo).
3. **`npm run assets:missing` no decía nada de criaturas ni de guardianes**: ahora imprime las 22 apariencias, con sus salas y tamaños, y cuáles tienen arte (2 de 22), leído de los datos del juego (no puede quedar desactualizado).

**Lo que se miró y no se arregló.** (a) **Las tiras de fondo son más cortas que lo que la cámara necesita en 43 de las 64 salas** (82 avisos del modo de desarrollo: «the near strip is 18.0 m tall and the camera of "sp_stair" needs 43.0 m: the sky shows over it»): en las salas altas (`sp_stair`, `ih_ascent`, `rt_hollow`, `fd_press`, `mn_seam`, `sp_chimney`…) se ve, por encima de la tira, una banda de fondo plano con un borde nítido (capturas de `ih_ascent` y `sp_stair` a media altura: sutil, no roto). Arreglarlo con tiras más altas **sube la memoria de las páginas de la zona** (R4 ya está en 37,2 MiB frente a los 40 MiB del presupuesto de una zona, `MEMORY_BUDGET_MIB.zone`) y es trabajo de escenario: se pide como parte del arte (tiras de 22 a 43 m de alto para esas salas). (b) La palanca y la piedra se ven bien como *blockout* (mirado en `rt_cellar`, `sp_belfry`, `ru_nave`, `fd_line`), pero no son arte.

---

## 11 · El audio (T7)

**Qué es.** Todo el sonido del juego —**81 sonidos y 8 piezas** (260 archivos Opus y MP3, 12,09 MiB)— está **sintetizado por código del propio repositorio** (`tools/audio`: osciladores, ruido, filtros, reverberación y partituras escritas para este juego; el `index.json` lo declara en su campo `origin`: «No recording, sample, library or third-party material is used»). **No hay una sola grabación ni muestra de nadie**: es original, y por eso **es provisional**: no se presenta como audio final.

| Comprobación | Resultado |
|---|---|
| `npm run audio:check` | 81 sonidos, 8 piezas, 260 archivos, **0 errores, 0 avisos** |
| `npm run audio:verify` (decodifica lo que se publica, en los dos formatos, y mide lo que recibe un navegador) | 260 archivos, **0 errores**, 1 aviso de nivel (`hazard.spikes` en Opus, −1,4 LU de su objetivo) |
| `tests/unit/audio/worldAudio.test.ts` (16 pruebas, con el manifiesto real, la tabla real de lugares y el conductor real sobre un Web Audio de mentira) | **Las 64 salas** ponen la pieza y la cama de su lugar, **nunca dos copias** de nada, y lo que hay en memoria no pasa de 52 MiB; los sonidos pequeños que suenan son los de la lista de su sala y **ninguno faltaba en memoria**; **los siete combates** (el Custodio y los seis guardianes del motor) traen su pieza al despertar, la suben en la segunda fase y tras la caída vuelve la del lugar, con la victoria entre medias; y, con la **simulación de verdad** alimentando el audio, suenan el dash, el dash aéreo, el salto doble, el salto de pared, el golpe, el Rayo, el golpe al suelo, la palanca, la puerta y el suelo agrietado roto por el golpe (un `seal.break` mudo rompe la prueba). |
| Volúmenes | General, música, efectos y ambiente son **independientes y persistentes** (`SettingsData`, con sus archivos dorados v1–v5); un volumen a cero no carga ni reproduce nada de su categoría. Escenas E2E `audio` (E: la ganancia sigue al deslizador, cero es silencio y solo de su categoría; G: los cuatro deslizadores desde el menú real, guardados y vueltos a leer), `settings`. |
| Duplicados, bucles colgados, pausa, foco | E2E `audio` (D: nunca dos copias de nada, lo que el héroe deja se suelta de memoria; F: la pausa detiene los sonidos del mundo y atenúa la música sin reiniciarla; I: una tormenta de 600 peticiones no pone nunca más voces que el límite y todo termina), `focus`, `pause`. |

**El limitador es un compresor, no un muro** (hallado al repetir la tormenta del E2E, §14.3): por encima de −2,5 dBFS la salida sube un decibelio por cada veinte que entran, de modo que **en el peor caso posible —24 voces golpeadas en el mismo instante— llega a −1,19 dBFS**: por debajo de los −1 dBFS a los que se sujeta cada archivo y sin recorte, pero no en los −2,4 que el comentario del motor decía. El comentario se corrigió y el E2E calcula ese techo de los datos.

**Identidad de cada zona** (hecha con lo que hay, y dicho como una reutilización): 4 piezas de música × 4 camas de ambiente × 3 suelos × el aire de cada lugar (cuánto retiene un sonido) repartidos en las 7 zonas y las 4 salas del primer capítulo.

| Lugar | Música | Cama | Suelo | Aire (`rt60`) |
|---|---|---|---|---|
| R1 Puerta de las Ruinas · la Nave | `ruins` | `bed.ruins` | piedra | 1,8 – 2,4 s |
| R2 Galería de Raíces · las ocho salas de las Raíces | `ruins` | `bed.roots` | tierra | 1,0 – 2,6 s (la Cámara del Eco) |
| R3 Cámara del Sello · el Archivo y la Cisterna | `chamber` | `bed.chamber` | piedra húmeda (el Archivo, piedra) | 2,6 – 3,0 s |
| R4 Santuario · el Relicario · el Corazón de Tinta | `sanctum` (`warden` en la pelea) | `bed.sanctum` | piedra | 2,2 – 3,0 s |
| Cenagal | `chamber` | `bed.roots` | húmedo | 1,7 s |
| Minas de Cristal | `ruins` | `bed.chamber` | piedra | 2,2 s |
| Campanario | `ruins` | `bed.ruins` (más ráfagas que en la Puerta) | piedra | 2,3 s |
| Fundición | `chamber` | `bed.chamber` | piedra | 1,9 s |

**Lo que NO tiene sonido propio, y se dice** (no es un fallo del motor: es contenido que falta):

- **Música:** ninguna zona después del Santuario tiene **pieza propia** (usan combinaciones de las cuatro), y **los seis guardianes del motor pelean con la pieza del Custodio** (`BOSS_MUSIC`).
- **Criaturas:** las 13 criaturas nuevas **reutilizan los tres sonidos del Slime** (alerta, aviso, embestida, muerte); los golpes de los seis jefes nuevos son uno de dos (el de «lluvia» o el de «embestida»).
- **Golpe al suelo:** al caer suena como un **aterrizaje pesado** y sacude la cámara; **la espera y la bajada están en silencio** y no hay un sonido propio del golpe. El **salto de pared** suena como el salto en el aire (el mismo de la segunda saltada).
- **Mecanismos:** la palanca, la puerta y el suelo agrietado suenan (`interact.activate`, `gate.open`, `seal.break`), pero **el suelo que se parte suena como el sello violeta que se rompe**, no como piedra.

**Lo que debe aportar el propietario si quiere audio final** (no bloquea nada): piezas por zona (formato del pipeline: Opus con MP3 de respaldo a 48 kHz, bucle con la costura cerrada y capas `base` + `drive` si debe subir con el combate, `npm run audio:spec` dibuja lo que se publica), una pieza por guardián, sonidos por criatura, y el golpe al suelo. **Nada de eso se ha compuesto aquí**: música generada por código que no se puede escuchar desde este entorno es peor que la reutilización honesta de lo que ya se oyó y se ajustó.

---

## 12 · El mapa y el menú de pausa (T12)

**Lo pedido** (Prompt 19, verificado de nuevo en el código y en el navegador): el botón de pausa **arriba a la derecha**; lo que abre es **el mapa del mundo en el panel principal, a la izquierda**, con la columna de opciones a la derecha (Reanudar, Mapa, Controles, Sonido, Ajustes); el mundo se detiene de verdad; el mapa **crece a medida que se explora**, abre los caminos que el mundo abre, tiene los nombres de las zonas y **es el mismo tras recargar**; se arrastra y se acerca con ratón, rueda, teclas y dedos.

**Qué se miró.** Capturas con el mundo explorado a medias (las zonas hasta las Minas y los cuatro primeros guardianes caídos) en **escritorio (1280×720), teléfono horizontal (844×390) y teléfono vertical (390×844)**: «YOU ARE IN Collapsed Nave», la columna de opciones, la leyenda (tu posición, descanso, sello, guardián, camino cerrado), los botones de acercar, alejar y centrar, los nombres de las zonas («…S OF THE ANCIENT FOREST», «SUNKEN ROOTS») sobre las salas descubiertas, los santuarios, los sellos y los caminos abiertos. Las escenas E2E `pauseMap` (escritorio, teléfono horizontal y vertical: el botón no solapa nada, el menú se abre sobre el mapa, cada opción abre en el lugar del mapa y se vuelve con una pulsación, el mapa se arrastra y se acerca, lo escrito en el menú no llega al juego) y `pauseZone` (el menú abierto en mitad de un fundido entre zonas, esperando el arte de la sala siguiente o en medio de una derrota): `pauseMap` la ejecuta la CI en producción; `pauseZone` va en la batería completa (§14).

**Diferencias encontradas:** ninguna con lo pedido. (El texto viejo de la pausa táctil de los Controles, «arriba, en el centro», **sí** estaba mal y se corrigió en §6.)

**No verificado:** el mapa en un teléfono real (que el arrastre con el dedo y el pellizco se sientan bien) y con un mando físico; el mapa y el perfil cuentan **ocho regiones con nombre** (el Bosque Antiguo se parte en las Ruinas y el Santuario; son las siete zonas del diseño).

---

## 13 · El guardado (T11)

**Qué se auditó.** Cada comportamiento que un jugador espera de su partida, contra la prueba que lo ata:

| Comportamiento | Dónde se prueba |
|---|---|
| **Tres ranuras** independientes: la primera es la clave de siempre (una partida de antes de las ranuras es la ranura 1 tal como está, sin copiar nada); borrar una no toca otra | `saveSlots.test.ts`; E2E `slots` (guardar a mano, empezar otra ranura y la primera sigue, jugar la primera, borrar con confirmación, sacar una copia —descarga real— y meterla —selector de archivos real—) |
| **Partida nueva limpia**: empezar una partida nueva sobre una buena la reemplaza (la pantalla pregunta antes) y el siguiente guardado es una partida fresca; si la anterior no se podía leer, se guarda aparte | `saveSlots.test.ts`, `progressStore.test.ts`; E2E `save`, `slots` |
| **Datos dañados**: una copia ilegible se archiva como `.corrupt` (para quien quiera mirarla) y se recupera la copia de respaldo `.bak` si es buena; ambas ilegibles = partida nueva sin excepción; una copia dañada **nunca** reemplaza al respaldo bueno | `safeStore.test.ts`, `progressStore.test.ts` |
| **Versiones**: un guardado de versión anterior se migra (cadena de migraciones con un archivo dorado por versión: v1, v2 y ahora v2 con los conteos por zona); uno de una versión **posterior** no se lee ni se sobrescribe: se guarda aparte | `progressData.test.ts` (`golden/progress.v1.json`, `.v2.json`, `.v2.zones.json`), `progressStore.test.ts` |
| **Fallo al guardar** (disco lleno, escritura perdida en silencio, almacenamiento que se niega, navegación privada): `save` responde `false`, el juego conserva su valor, **un solo aviso**, y la última copia buena queda intacta; un guardado hecho por otra pestaña más reciente no se pisa | `progressStore.test.ts`, `safeStore.test.ts`; E2E `resilience`, `slots` («un navegador que no guarda nada lo dice») |
| **Cabe un mundo entero**: lo que el mundo puede escribir (banderas, salas, cartas) queda por debajo de **la mitad** de lo que un guardado admite (1 024 banderas, 256 salas, 32 cartas, 64 caracteres por nombre) | `world.test.ts` |
| **Estado completado**: la partida que llega a la salida del mundo se guarda como **completada** (`COMPLETED_FLAG`) y lo guardado son las banderas de la simulación; la pantalla de cierre y el perfil la muestran; la partida se puede cargar y seguir jugando | `fullRun.test.ts` (tres semillas y la partida cerrada y abierta en cuatro santuarios), E2E `fullrun`, `ending`, `finale` |
| **Contar el tiempo no cambia el juego**: las estadísticas por zona se leen de los eventos y ninguna regla las lee | `playStats.test.ts` |

**Lo que no se afirma.** Que un teléfono real conserve el guardado tras un cierre forzado o con poco espacio (con Capacitor se guarda en `UserDefaults`/`SharedPreferences`: `PUBLISHING.md` §6.3, sin comprobar en dispositivo).

---

## 14 · Estabilidad y pruebas (T13)

**Qué se ejecutó y con qué resultado** (contenedor Linux de 4 núcleos, Node 22, Chromium 141 de Playwright, dibujo por software; las cifras de tiempo son de este contenedor, no de un teléfono):

| Comprobación | Resultado |
|---|---|
| `npm run typecheck` (`tsc --noEmit`, modo estricto) | limpio |
| `npm test` (Vitest: unitarias y de integración) | **263 archivos, 4 966 pruebas, todas verdes** (252,8 s). Al abrir el encargo: 249 archivos y 4 640 |
| `npm run build` (`tsc` + `assets:check` + `hud:check` + `licenses:check` + `vite build`) | verde |
| `npm run bench:bundle` | arranque en frío **204 640 B gz** de 204 800 (quedan **160 B**; 12 ficheros). Al abrir el encargo: 203 236 B (**+1 404 B**: `core/dmath.ts`, que la simulación usa, y lo nuevo de la primera pantalla). **El margen es mínimo**: el siguiente cambio en el código de la primera pantalla tendrá que ir a un *chunk* diferido (`bench:bundle` falla por encima del techo) |
| `npm run audio:check` | 81 sonidos, 8 piezas, 260 archivos, **0 errores, 0 avisos** |
| E2E en **desarrollo** (`npm run test:e2e`) | **67 escenas: 63 a la primera, 4 que fallaron por causas del instrumento o de un número mal derivado (§14.2), y 67 de 67 una vez corregidas** |
| E2E contra el *build* de **producción** (`npm run test:e2e -- --prod`) | **67 de 67 a la primera, con el código final** (51,9 minutos de escenas en este contenedor) |
| CI | Las ejecuciones nº 126 a 130 fallaron solo en `e2e (journey)` (§5.1); la nº **131** (`a38363c`, el arreglo del determinismo) pasó **en sus seis trabajos**: `check` (tipos, pruebas, *build*), Firefox 155, WebKit 26.6, `e2e (play)` (13 escenas contra el *build*), `e2e (stability)` (4) y `e2e (journey)` (la partida completa, 5 min 15 s). El resultado del último *commit* se dice en el informe final |

### 14.1 · Lo que la batería completa tiene que decir de sí misma

De las 67 escenas, **18 viajan en la CI** (`play`, `stability`, `journey`); las otras 49 se ejecutan a mano antes de cerrar un encargo. Eso es lo que explica que dos de ellas estuvieran **viejas** desde hacía dos *commits* (14.2). No se añadieron a la CI: se mantiene el reparto del Prompt 20, que cuida la duración de cada trabajo, y la batería completa sigue siendo la puerta antes de cerrar.

### 14.2 · Lo que la pasada completa en desarrollo halló (y no era del juego)

| Escena | Qué falló | Causa | Qué se hizo |
|---|---|---|---|
| `audio` (I: una tormenta de 600 peticiones) | «the limiter holds the output under its ceiling… (**−1,49 dBFS**; the ceiling is −2.4 and the limit of this check −1.5)» | El **número** del instrumento y una creencia sobre el limitador: ver 14.3. El motor de audio no se tocó desde el Prompt 21 | El instrumento deriva su techo de los datos (14.3); el motor solo ganó comentarios exactos y exporta `LIMITER`. Repetida: pasa |
| `rooms` | «page.evaluate: Execution context was destroyed, most likely because of a navigation» | **Lo causé yo**: edité `src/audio/engine.ts` (los comentarios del limitador) con el servidor de desarrollo de Vite en marcha y la página se recargó en medio del escenario | Repetida sola: pasa. Regla para lo que queda: **no tocar `src/` mientras corre una pasada en desarrollo** |
| `save` | «and the defeats, the kills and the rooms» (el guardado después de recargar y jugar un minuto no era igual) | El instrumento comparaba todas las estadísticas salvo `ticks` y desde el tiempo por zona (§8) `zones` también avanza con el tiempo | `zones` se trata como el tiempo: nunca retrocede (`save.ts`); lo que se cuenta (derrotas, bajas, salas, caídas por zona, el tiempo de cada guardián) sigue siendo igual. Repetida: pasa |
| `settings` | «the touch controls, each a gesture or a button that exists» | La lista esperada de líneas táctiles de Controles no tenía las tres que se añadieron en §6 (salto doble y de pared, golpe al suelo, esquiva aérea) | La lista esperada las incluye. Repetida: pasa |

Ninguna de las cuatro era una regresión del juego: `save` y `settings` eran instrumentos que un cambio anterior había dejado viejos, `audio` un número del instrumento que no salía de ningún cálculo y `rooms` un error de procedimiento mío. Se dicen igualmente porque **una batería que no se ejecuta entera envejece sin avisar**.

### 14.3 · La tormenta de audio: el limitador es un compresor, no un muro

**El hecho.** `audio` (I) pide 600 sonidos en un fotograma con todos los volúmenes al máximo y exige que la salida no pase de un techo. Con el límite de −1,5 dBFS (0,84) que tenía, una ejecución midió −1,49 dBFS y falló; la siguiente, con el instrumento corregido, midió **−2,52**.

**La causa.** El «limitador» del motor (`LIMITER` en `src/audio/engine.ts`) es un *compresor* de razón 20 con umbral −2,5 dBFS; no es un muro. Sobre el umbral la salida sube **un decibelio por cada veinte** que entran: −2,4 dBFS para una entrada a fondo de escala, −1,5 para una entrada de +18 dBFS (×8). El límite de −1,5 salió de unas pocas ejecuciones que midieron de −1,9 a −2,6 (PROMPT18-LOG), no de un cálculo, y lo que llega al limitador depende de **cuántas voces coinciden en el mismo instante** y de lo que suena por debajo (la música, el lecho, el eco), que cambia de una ejecución a otra.

**El peor caso, de los datos** (`stormCeiling` en `tools/e2e/scenarios/audio.ts`): las voces que el motor admite a la vez (24), cada una con el pico de su archivo medido en `tools/audio/measures.json`, el recorte de su `gainDb` y el mayor lanzamiento de su variación aleatoria de nivel (`gainJitterDb`), todas golpeadas en el mismo instante y del mismo lado del estéreo (lo que ninguna mezcla hace), más una unidad completa para la música, el lecho y el eco: una entrada de **15,2 (+23,6 dBFS)**, que la curva del limitador convierte en **−1,19 dBFS** (0,8715). Es el techo físico de esa tormenta: **por debajo de los −1 dBFS** a los que se sujeta cada archivo, y por tanto sin recorte posible.

**Qué se cambió.** El instrumento ya no tiene un número: calcula ese techo de los datos (si alguien añade sonidos más fuertes, el techo se mueve con ellos) y comprueba dos cosas, **que el peor caso derivado está por debajo de −1 dBFS** y **que lo oído está por debajo del peor caso derivado**. No es subir un umbral para que pase: el umbral antiguo no se derivaba de nada, y el nuevo sí, con el cálculo a la vista y comprobado a mano (Node: 24 voces, entrada 15,16, +23,62 dBFS, salida −1,194 dBFS).

**Medido.** Ocho tormentas más, cada una con un servidor y una página nuevos: **−2,24 · −2,03 · −2,65 · −2,25 · −2,27 · −2,48 · −2,48 · −2,46 dBFS** (media −2,36; la escena completa había medido −2,52). Con la que falló (−1,49) son diez medidas, de **−2,65 a −1,49 dBFS**: la de −1,49 es la del extremo alto, y **ninguna pasa del techo derivado (−1,19)**.

**Y que el instrumento todavía muerde** (mutaciones del motor, devueltas a su estado después): con el **limitador puenteado** (`master` conectado a la salida sin pasar por él, las constantes intactas) la tormenta suena a **+3,19 dBFS** —recorta— y la escena falla («3.19 dBFS heard; at most −1.19»); con la **razón del limitador a 1** (sin comprimir) el peor caso derivado pasa a +23,6 dBFS y falla la primera comprobación. Con el motor como estaba, la escena pasa (−2,05 dBFS esa vez).

**Lo que NO se afirma.** Que el audio *suene* bien (nadie lo ha oído, §11); que el limitador sea un limitador de pared (no lo es: en el peor caso la salida llega a −1,19 dBFS, 1,2 dB por encima de su «techo» de −2,4, y a 1,2 dB de la saturación digital); que una tormenta así se dé jugando (24 voces coincidentes de efectos de golpe es un caso extremo del instrumento).

### 14.4 · Memoria y recursos en una partida entera

| Medida | Resultado |
|---|---|
| `fullrun` (28 minutos de juego, 18 muestras) | en desarrollo: memoria de la página **44 → 62 MB** (pico 74), nodos de DOM **107 → 113** (pico 114); contra el *build*: **14 → 25 MB** (pico 66), DOM **129 → 135** nodos (281 en la pantalla de cierre, que es lo último que se muestra); objetos de escena pico 87 y **27 – 28 llamadas de dibujo** en el peor momento (presupuesto: 60) |
| `resilience` (treinta vueltas de menús, salas, peleas y derrotas) | *listeners* iguales al principio y al final (37/4/0/0/2 en desarrollo; 33/4/0/0/2 contra el *build*), temporizadores 2 → 2 (1 → 1), DOM 584 → 584 (609 → 609), memoria 20,6 → 21,7 MB (10,0 → 11,4): **nada de más** |
| `soak` (1 600 rondas de juego al azar) | 39 golpes, 8 derrotas, 13 cargas de sala, 14 rayos (5 rechazados), 5 bebidas, peor momento **23 llamadas de dibujo y 300 partículas** (presupuesto: 60 y 400); DOM 107 → 113 |
| `privacy` | todas las peticiones al propio origen (**109** contra el *build*, 677 en desarrollo, donde cada módulo se pide aparte), sin *beacons*, *sockets* a terceros, cookies, IndexedDB, caché ni *service worker*; solo `troid.progress` y `troid.settings` en `localStorage` |
| Audio (`audio` D, I; `worldAudio`) | nunca dos copias de una pieza, a lo sumo dos fuentes de música en un fundido, a lo sumo 15 voces en la tormenta (36 fuentes con las que se apagan), lo que el héroe deja se suelta de memoria, el mundo entero queda por debajo de 52 MiB |

### 14.5 · De qué *commit* es cada cosa

Los *commits* llevan la numeración del orden en que se hicieron, que no es la del plan de §2:

| *Commit* | Qué | Tarea del plan |
|---|---|---|
| `fb831e0` (T1) | el piloto de entradas humanas y sus cuatro hallazgos | T1 |
| `47eaf28` (T2) | los encuentros con un héroe mortal; el aturdimiento del Motor | T2 |
| `ff3a615` (T3), `0252430` (T4) | la partida completa en Node y su repetición en el navegador | T3 |
| `c1d1028` (T6) | las habilidades: aviso, Controles, gestos de cada dispositivo | T6 |
| `0031273` (T5) | ningún lugar del mundo es una trampa | T5 |
| `b5afbaa` (T4b) | el tiempo jugado por zona | T4 |
| `1524851` (T7) | ningún estado del héroe se queda colgado | T10 |
| `6b6f595` (T8) | el arte de criaturas y guardianes: inventario vivo y el camino de los seis guardianes | T8, T9 |
| `9121e6d` (T9) | el audio de todo el mundo | T7 |
| `4954d86` (T10) | el formato del guardado, con los conteos por zona | T11 |
| `a38363c` (T11) | el determinismo entre motores (la CI en rojo) | T16 |
| los últimos | la pasada completa, el techo de la tormenta de audio, las dos escenas viejas, la publicación y la documentación | T12 a T15 |

### 14.6 · Lo que no se ejecutó

Las escenas E2E completas **solo se ejecutan en Chromium**: Firefox 155 y WebKit 26.6 pasan el humo de once comprobaciones de la CI, no la batería. Nada se ejecutó en un dispositivo físico, con un mando físico ni en Safari de iOS. La partida completa se repitió en el Chromium de este contenedor (141) y en el del ejecutor de la CI; Gecko y JavaScriptCore no la han jugado entera.

---

## 15 · Publicación (T14)

**Lo pedido.** Dejar claro qué existe y qué falta para publicar en la web, en iOS y Android (Capacitor) y en escritorio, **sin afirmar que el juego esté publicado ni listo para las tiendas** y sin inventar compras, anuncios, SDK, cuentas ni monetización. [`PUBLISHING.md`](PUBLISHING.md) es la guía; en este encargo se puso al día (cifras de pruebas y de arranque en frío, estado del contenido provisional, lo que aporta el propietario y la lista de lanzamiento) y **no se añadió nada que no exista**.

| Destino | Lo que hay en el repositorio | Lo que se comprobó | Lo que falta, y quién lo hace |
|---|---|---|---|
| **Web** | `dist/` estático (`npm run build`): base relativa, arranque en frío de 12 ficheros (**204 640 B gz de 204 800**; `bench:bundle` falla por encima), el mundo posterior al Santuario y el menú en *chunks* diferidos, arte y audio como ficheros aparte, avisos de terceros generados (el *build* falla si están viejos), manifiesto web | Chromium real (E2E, en desarrollo y contra el *build* de producción), humo de once comprobaciones en **Firefox 155 y WebKit 26.6** en la CI, la CSP medida, la privacidad medida (todo al propio origen, sin cookies ni analítica), la legibilidad medida, el juego sin WebGL | **Alojarlo** (cualquier servidor estático con HTTPS), un **icono propio** (`public/icon.svg` es el marcador del primer encargo), los **nombres del equipo** en `src/content/credits.ts` (la lista está vacía a propósito) y una **URL de política de privacidad** (hay plantilla en PUBLISHING §4). **No está publicado.** |
| **iOS y Android** | El juego reconoce Capacitor: guardado nativo (`@capacitor/preferences`, que prueba antes de fiarse), botón Atrás de Android como tecla de pausa, pausa al pasar a segundo plano, aviso de orientación; todo probado contra **dobles** de los *plugins* | Ningún dispositivo, ni emulador nativo | **La cáscara no existe** (`capacitor.config`, `ios/`, `android/`). No se generó aquí a propósito: sin Xcode, sin Android Studio y sin dispositivos, un proyecto que nadie ha podido abrir ni compilar sería **aparentar** preparación. Pasos en PUBLISHING §6: crearla, fijar la orientación, el identificador de aplicación, la firma, las cuentas de Apple Developer y de Google Play, iconos, capturas y fichas, los formularios de privacidad y de edad, y la **lista de comprobaciones de §6.3 en un iPhone y en dos Android** (gama media y baja). |
| **Escritorio** | Nada propio: el escritorio es la página en un navegador (teclado, ratón, mando por la API de Gamepad) | Teclado, ratón y un mando **abstracto** | Elegir envoltorio (Electron o Tauri), un adaptador de guardado a fichero, firmarlo (*Developer ID* y notarización en macOS, certificado de código en Windows) y distribuirlo. **No hay instaladores.** |
| **Monetización** | Ninguna, **por decisión**: sin anuncios, sin compras, sin analítica, sin cuentas | La prueba E2E `privacy` falla en cuanto sale una petición a un tercero | Si se decidiera otra cosa, PUBLISHING §3 dice qué hacer antes de escribir código. |

**Lo que se tocó en `PUBLISHING.md`:** §1 (el juego, el *build* de 204 640 B, las pruebas con sus cifras reales y la **partida completa de guion**), §2 (nuevas filas: partida completa en el navegador, el audio y el arte como provisionales, lo que ningún entorno de pruebas puede decir), §5 (el arte y el audio definitivos como decisión del propietario) y §9 (la lista de lanzamiento añade lo que debe revisar una persona antes de enviar: jugar con reloj, oír el audio, ver el arte provisional).

**Lo que NO se afirma.** Que el juego esté **publicado**, enviado, aprobado ni «listo para las tiendas»; que se haya visto en un dispositivo físico (iPhone, iPad, Android, mando físico); que Safari de iOS, Firefox de escritorio con GPU o un Android WebView lo ejecuten (solo se midió el análisis estático del código y el humo de Firefox y WebKit de Playwright en Linux, que **no son** los de un teléfono); que haya monetización; que el arte y el audio sean definitivos (§10, §11).

---

## 16 · Estado final por área, y lo que queda

> Cada área tiene **un** estado, de estos cuatro (los del encargo): **Terminado y verificado** (hecho, y una prueba o una medición que se puede repetir lo demuestra) · **Implementado, falta verificación humana o física** (hecho y probado hasta donde llega un entorno sin personas ni dispositivos; falta que una persona o un dispositivo lo confirme) · **Pendiente por falta de recursos o acceso externo** (depende de algo que debe aportar el propietario o de una cuenta, una herramienta o un dispositivo que este entorno no tiene) · **No implementado**. Una prueba automática **no se presenta nunca como una prueba en un dispositivo físico**.

| # | Área | Estado | Evidencia, o lo que falta |
|---|---|---|---|
| 1 | Inspección: la documentación contrastada con el código | **Terminado y verificado** | §1: 7 diferencias (D1–D7), las 7 cerradas (§3 a §13) |
| 2 | Integridad del mundo: 7 zonas, 64 salas, 139 salidas (138 entre salas y la del final), 8 salas opcionales, secretos, palancas, atajos, puertas de habilidad, recompensas de jefe, santuarios, transiciones, carga diferida, fosos | **Terminado y verificado** | §7 y las pruebas de mundo del Prompt 21 (283 pruebas de salas); **ningún lugar es una trampa** en las 64 salas (`deadEnds`) y **desde ninguna sala, con solo lo que pidió el camino, se pierde el final ni el principio** (`progressionOrder`) |
| 3 | Mapa y pausa en escritorio y en móvil **emulado** (844×390, 390×844) | **Terminado y verificado** | §12; E2E `pauseMap`, `pauseZone` |
| 4 | Mapa y pausa en un teléfono real (el pulgar, el pellizco, la muesca) | **Implementado, falta verificación humana o física** | Solo se probó con dedos simulados del protocolo de DevTools |
| 5 | **Partida completa automatizada**, de la partida nueva a la salida del mundo (héroe mortal, entradas de una persona) | **Terminado y verificado** | §5: tres semillas (27,5 · 37,7 · 26,2 min), una partida cerrada y abierta en cuatro santuarios; E2E `fullrun`: **101 887 fotogramas repetidos en Chromium, 2 038 resúmenes iguales**, en desarrollo, en producción **y en la CI** |
| 6 | Partida completa **jugada por una persona** | **Pendiente por falta de recursos o acceso externo** | Hace falta una persona con un reloj (`npm run session:report`); no se afirma que alguien haya jugado ni medido nada |
| 7 | Combate: 14 arquetipos y 7 jefes vencibles por un héroe **mortal**, sin cambiar vidas ni daños para fingir duración | **Terminado y verificado** | §4: 14 criaturas × 3 distancias × 3 semillas; 6 guardianes × 4 semillas en su sala; el Custodio, 12 semillas |
| 8 | Equilibrio y diversión del combate (¿es justo? ¿cansa? ¿atasca algún jefe?) | **Implementado, falta verificación humana o física** | Los luchadores no se cansan, no se equivocan de tecla y leen el estado interno de la criatura; cuatro criaturas no cuestan nada ni al héroe ingenuo (§4) |
| 9 | Las seis habilidades con teclado y con mando | **Terminado y verificado** | §6; `abilityDevices`, `movementAbilities`, E2E `gamepad`, `movement`, `world` |
| 10 | Las seis habilidades con los dedos en una pantalla real | **Implementado, falta verificación humana o física** | Probado con `TouchRig` (dedos simulados) y toques de DevTools; que el golpe al suelo (dedo abajo + tocar atacar) sea cómodo con dos pulgares es una pregunta física |
| 11 | Animaciones del héroe: ningún estado queda colgado, retorno al reposo, lo dibujado sigue a la simulación | **Terminado y verificado** | §9: 20 pruebas, 24 partidas al azar, con los dos presentadores |
| 12 | Seis clips del héroe: `attack2`, `crouch`, `crouchWalk`, `aerialAttack`, `crouchAttack`, `drink` (**26 dibujos**) | **Pendiente por falta de recursos o acceso externo** | No existen en el repositorio; el juego dibuja esos estados con el marcador del motor. Lista exacta abajo (A1) |
| 13 | Arte de criaturas y guardianes: el camino de entrega (contrato, herramienta, los seis guardianes del motor vestibles) | **Terminado y verificado** | §10.2; `bossView.test.ts`, `missing.test.ts`, E2E `room-art` (escena K) |
| 14 | Arte de criaturas y guardianes: **arte definitivo** (hoy 2 de 22 apariencias con arte, pintado por código) | **Pendiente por falta de recursos o acceso externo** | §10.1; lista exacta abajo (A2) |
| 15 | Escenario: la piedra partida y la palanca (**2 piezas obligatorias**) y las tiras de fondo altas | **Pendiente por falta de recursos o acceso externo** | §10; lista exacta abajo (A3) |
| 16 | Arte provisional ya presente (el escenario, el Ink Slime y el Custodio, pintados por código) | **Implementado, falta verificación humana o física** | Necesita revisión artística de una persona; no se presenta como definitivo |
| 17 | Audio: motor, cuatro volúmenes independientes y persistentes, sin duplicados ni bucles colgados, memoria acotada | **Terminado y verificado** | §11; `worldAudio` (64 salas, 7 combates, movimientos), E2E `audio` (A–J) |
| 18 | Audio: identidad por zona, música de jefe, sonidos de habilidades y mecanismos (síntesis, con la reutilización dicha) | **Implementado, falta verificación humana o física** | **Nadie lo ha oído**; los siete jefes pelean con la misma pieza; el salto doble y el de pared suenan como el salto aéreo; el golpe al suelo, como un aterrizaje pesado |
| 19 | Audio definitivo (piezas por zona y por guardián, sonidos por criatura, sonido propio del golpe al suelo) | **Pendiente por falta de recursos o acceso externo** | Lista abajo (A4); no es un bloqueo |
| 20 | Guardado y carga: tres ranuras, partida nueva limpia, datos dañados, versiones, fallo al guardar, estado completado | **Terminado y verificado** | §13 |
| 21 | Guardado en un dispositivo real (cierre forzado, poco espacio, `UserDefaults`/`SharedPreferences`) | **Implementado, falta verificación humana o física** | Probado contra dobles de los *plugins* |
| 22 | Tiempo jugado: instrumentación (por zona, guardián, derrotas), informe exportable y medición con el jugador de guion (26 – 38 min) | **Terminado y verificado** | §8; `playStats`, `session:report` |
| 23 | **Duración que vive una persona** y los objetivos de 3 – 5 h (camino) y 5 – 7 h (con lo opcional) | **Pendiente por falta de recursos o acceso externo** | **No se declara cumplido ni se sabe**: lo único medido es la cota inferior del jugador de guion; ver «Lo que se sabe de la duración» |
| 24 | Estabilidad: `tsc`, Vitest, arranque en frío, auditorías de arte y de audio | **Terminado y verificado** | §14 |
| 25 | E2E: las 67 escenas, en desarrollo y contra el *build* de producción | **Terminado y verificado** | §14 |
| 26 | CI (comprobación, Firefox y WebKit, tres trabajos E2E de Chromium) | **Terminado y verificado** | §14 |
| 27 | Web: el *build* estático, privacidad, CSP, legibilidad, tres motores en la CI | **Terminado y verificado** | §15 |
| 28 | Web: **publicarlo** (alojamiento, icono propio, política de privacidad con URL, nombres en los créditos) | **Pendiente por falta de recursos o acceso externo** | §15; lista abajo (A5). **No está publicado.** |
| 29 | iOS y Android: la cáscara de Capacitor, la firma, las tiendas y la comprobación en dispositivos | **Pendiente por falta de recursos o acceso externo** | La cáscara **no existe**; PUBLISHING §6 |
| 30 | Instaladores de escritorio | **No implementado** | Sin envoltorio elegido; PUBLISHING §8 |
| 31 | Monetización | **No implementado** | Por decisión: ni anuncios, ni compras, ni analítica, ni cuentas |

### Lo que debe aportar el propietario (nombre, medidas, uso). Nada de esto bloquea lo demás

**A1 · Seis clips del protagonista (26 dibujos, 6 hojas).** Se entregan en `art/player/inbox/<clip>/` (la hoja entera como `sheet.png`, o un PNG por pose, `<clip>_00.png`…, solo PNG) y se integran con `npm run assets:intake -- <clip>` (comprueba y escribe la hoja de contacto) y `-- <clip> --accept`. Lienzo de 320 × 230 px a 65 px por metro y pivote en (160, 192) (`art/player/requests/requests.json`); la herramienta de recepción coloca la figura (los pies en la fila 192) y la comprueba; el brief de cada clip (`art/player/requests/<clip>/brief.md`) dice poses, fases y colocación, y su `reference.png`, qué copiar. Se usan en `attack2` (segunda estocada del combo, hoy repite la primera), `crouch` (agachado), `crouchWalk` (gateo y esquiva agachada), `aerialAttack` (tajo en el aire y golpe al suelo), `crouchAttack` (barrido agachado) y `drink` (beber).

| Clip | Dibujos | Cadencia | Fases de la simulación (no se tocan) |
|---|---|---|---|
| `attack2` | 5 | 28 fps, una vez | 3 preparación · 3 activos · 11 recuperación |
| `crouch` | 2 | 2 fps, bucle | — |
| `crouchWalk` | 4 | 10 fps, bucle | — |
| `aerialAttack` | 6 | 26 fps, una vez | 3 · 4 · 9 |
| `crouchAttack` | 5 | 26 fps, una vez | 4 · 3 · 9 |
| `drink` | 4 | 10 fps, una vez | canal de 24 ticks |

**A2 · Arte de criaturas y guardianes (20 apariencias).** Un paquete `enemies` por cada una (o uno para varias), en `art/<paquete>/` y registrado en `art/index.json`, con **seis partes** etiquetadas `enemy:<apariencia>` y `part:<parte>` —`body` (1 o más cuadros en bucle, con las anclas `head` y `vfx_origin`), `flash` (la misma silueta en blanco), `eyes`, `sigil`, `spines` (3 cuadros) y `pool` (el charco)— y `zones` con las salas donde vive. Densidad de 96 px/m (la del Slime): ancho × 96 por alto × 96 píxeles más margen, sin píxeles tocando el lado izquierdo, el derecho ni el borde alto. Contrato: `docs/guides/deliver-environment-art.md` §9 (y §9.1 para los guardianes). Qué falta y dónde se usa, con tamaños en metros: la tabla de §10.1 (`bramble_crawler` 1,1 × 0,7 · `mire_toad` 1,2 × 0,9 · `stoneback` 1,4 × 1,4 · `glow_spore` 0,9 × 1,1 · `ink_spitter` 0,9 × 1,2 · `cave_bat` 0,9 × 0,55 · `lantern_wisp` 0,7 × 0,7 · `bell_toller` 1,2 × 1,8 · `shardling` 1,2 × 0,9 · `crystal_shard` 0,6 × 0,45 · `piston_drone` 1,2 × 1,0 · `floor_leech` 1,2 × 0,55 · `ink_weaver` 1,0 × 1,6 · `veil_shade` 0,9 × 1,7; guardianes: `boss_root_tyrant` 3 × 4,2 · `boss_mire_matriarch` 2,8 × 2,4 · `boss_colossus` 3,2 × 4,6 · `boss_bell_warden` 2,4 × 2,2 · `boss_engine` 3,6 × 3,4 · `boss_sovereign` 2,2 × 3). `npm run assets:missing` imprime el estado vivo.

**A3 · Escenario.** La **piedra partida** (`door:stone`, parte `body` obligatoria; opcionales `top`, `bottom`, `glow`) en 8 salas (`ru_nave`, `rt_tangle`, `mr_stilts`, `mn_hall`, `mn_forge`, `mn_descent`, `sp_bridge`, `fd_line`) y la **palanca** (`interactive:activate`) en 7 (`rt_cellar`, `mr_approach`, `mn_approach`, `sp_belfry`, `sp_approach`, `fd_control`, `ih_approach`); **opcional:** tiras de fondo de 22 a 43 m de alto para las 43 salas altas que hoy muestran una banda plana sobre la tira (82 avisos del modo de desarrollo), que sube la memoria de las páginas de cada zona (R4 ya está en 37,2 de 40 MiB).

**A4 · Audio definitivo (opcional).** Formato del *pipeline*: Opus con MP3 de respaldo a 48 kHz, bucle con la costura cerrada, capas `base` + `drive` si debe subir con el combate (`npm run audio:spec -- <id>` dibuja lo que se publica). Qué se pide: una pieza por zona (hoy usan combinaciones de las cuatro que hay), una por guardián (hoy los siete comparten `warden`), sonidos por criatura (las 13 nuevas usan los del Slime) y el sonido propio del golpe al suelo, del salto de pared y de la piedra que se parte.

**A5 · Para publicar.** Nombres del equipo en `src/content/credits.ts`; identificador de aplicación de un dominio que se controle; icono de 1024 × 1024 sin transparencia (y el adaptable de Android), pantalla de arranque, capturas y textos de ficha en español e inglés; editor, correo, URL de política de privacidad (hay plantilla en PUBLISHING §4) y de soporte; cuentas de Apple Developer y Google Play; claves de firma **fuera del repositorio**.

### Lo que solo una persona, un dispositivo o una cuenta pueden verificar

1. **Jugar el mundo de principio a fin con un reloj** y exportar la partida (Partidas guardadas → Exportar) a `npm run session:report`: la duración real, qué jefe atasca, qué salto frustra, si los santuarios están donde se necesitan, si se entiende qué hacer en cada sala (§7 dice que el mundo no se rompe, no que se entienda).
2. **Oír el audio** (el balance, las melodías, cómo suena cada golpe): nadie lo ha oído.
3. **Mirar el arte provisional en una pantalla** y decidir qué se encarga a una ilustradora.
4. **Probar en un iPhone y en dos Android (gama media y baja) con un mando físico:** PUBLISHING §6.3 (el audio con el interruptor de silencio, la muesca, el rendimiento a 60 fps en la pelea más cargada, la memoria en media hora, el guardado tras cerrar la aplicación, Atrás, las dos y tres manos a la vez, los gestos de las seis habilidades).
5. **Los pasos de las tiendas** (cuentas, firma, fichas, formularios de privacidad y de edad, revisión): PUBLISHING §6.4 y §9.

### Lo que se sabe de la duración, y lo que no

| Se sabe (medido) | No se sabe |
|---|---|
| La travesía pura (sin combates, sin objetos, sin muertes) de las 55 salas del camino son **32 019 ticks = 8,9 min** | Cuánto tarda **una persona** que descubre el mundo, muere aprendiendo a los jefes y explora (hay 8 salas opcionales, secretos, vasijas, atajos y una segunda mitad que se vuelve a recorrer) |
| La partida de guion completa tarda **26,2 · 27,5 · 37,7 minutos** (tres semillas), con 2 · 3 · 16 derrotas; **6 – 11 minutos son combate** | Si el camino principal es de 3 – 5 h y con lo opcional de 5 – 7 h: **no hay ninguna medición que lo respalde y no se declara cumplido** |
| El jugador de guion conoce el mapa de memoria, no explora, no duda y no se equivoca de tecla: sus 26 – 38 minutos son una **cota inferior** | Si el equilibrio es justo: no se tocó ninguna vida ni daño para fingir duración |

### Estado de Git y de la CI al cerrar

- **Rama** `claude/troid-vertical-slice`: al cerrar, el árbol queda limpio y todo lo hecho está en `origin`. El hash exacto del último *commit* y el resultado de su ejecución de la CI se dicen en el informe final: un *commit* no puede llevar dentro su propio hash.
- **CI:** las ejecuciones nº 126 a 130 estuvieron en rojo solo en `e2e (journey)` (§5.1); la nº **131** (`a38363c`, el arreglo del determinismo) pasó en sus seis trabajos. Lo que se hizo después de `a38363c` no cambia el comportamiento del juego: comentarios y una exportación en el motor de audio (el arranque en frío es el mismo, 204 640 B), tres escenas E2E (`audio`, `save`, `settings`) y documentación.
- **Lo que la CI no ejecuta** y se ejecutó a mano antes de cerrar: 49 de las 67 escenas E2E, que pasan en desarrollo y contra el *build* de producción (§14.1).
