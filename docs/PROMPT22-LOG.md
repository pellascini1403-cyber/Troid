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

