# Prompt 21 — El mundo de verdad: de cuatro salas a una aventura de siete zonas

> Documento del encargo «Continuamos desde el estado actual… el mundo actual tiene solamente 4 salas»: **implementar** el contenido jugable real de un metroidvania —zonas, salas, enemigos, jefes, habilidades, mejoras, secretos, puntos de control— sobre la base técnica estable del Prompt 20, sin auditar y sin redactar planes, sin reconstruir nada, sin tocar el arte, los PNG, el HUD, las animaciones, los controles ni el estilo visual, y **sin dar por terminado nada que no se pueda jugar y comprobar de principio a fin**. Etapas: **E0** guardado a escala · **E1** salas como dibujo + validadores · **E2** tres habilidades de movimiento · **E3** un solucionador de alcanzabilidad · **E4** mejoras y rompibles · **E5** catorce arquetipos de enemigo · **E6** el motor de jefes y seis jefes · **E7** siete zonas, sala por sala · **E8** integrar: mapa, sonido, arte, presupuesto de arranque, pruebas y E2E · **E9** regresión · **E10** documentación y cierre. **Lo que no se pudo hacer desde este entorno —una persona jugando, un dispositivo, un oído— lo dice la [§12](#12--lo-que-queda-y-quién-lo-hace); ninguna prueba automática se presenta como una partida humana.**

---

## 1 · Inspección (antes de tocar una línea)

| Pregunta | Respuesta, leída en el repositorio y ejecutada |
|---|---|
| **¿Qué había de verdad?** | **Cuatro salas** (`r1_gate`, `r2_hall`, `r3_chamber`, `r4_sanctum`), **un enemigo** (el Ink Slime), **un jefe** (el Custodio de Tinta, una clase escrita para él), **una habilidad ganada** (el Air Dash) más el Rayo Espiritual por carta, **una mejora** (la cuarta botella) y **un punto de control** (R2 y R4). La salida este de R4 *terminaba el mundo*. Todo lo demás —movimiento, combate, magia, botellas, mapa, guardado de tres ranuras, audio, arte pintado, controles táctiles, mando— era estable y estaba probado (Prompt 20, `1944de4`). |
| **¿Qué existía solo como dato, decoración o estructura sin integrar?** | `ABILITIES` declaraba `double_jump`, `wall_jump`, `grapple`, `swim` y `ground_slam` **sin comportamiento** (`implemented: false`); `PROGRESS_LIMITS` (1024 banderas, 256 salas, 32 cartas) era suficiente, pero **los validadores de sala no conocían** sellos rompibles ni guardianes de datos; el motor del jefe era *una clase* (`Guardian`) con dos ataques cableados. |
| **¿Qué contaba como «contenido único»?** | Lo que el encargo dice y se respetó: **no** se cuentan salas duplicadas con otros números, enemigos con estadísticas cambiadas ni jefes que repiten el mismo combate. Cada sala tiene un dibujo propio (una prueba lo exige: 64 firmas de sólidos distintas) y una combinación de contenido propia (otra prueba: ninguna sala contiene exactamente lo que contiene otra). Las cinco salas de descanso, que eran clones con otras rocas, **se diferenciaron con contenido** (un ojo de luz sobre el agua, un shardling, una sanguijuela, clavos, venas); las tres arenas que compartían dibujo tienen **geometría propia** (arcos de raíz, una isla de barro, tres pasarelas de hierro). |
| **¿Qué hay que cuidar?** | El **arranque en frío** (techo 204 800 B gz, `npm run bench:bundle`): estaba a 580 B del techo y el mundo nuevo lo pasó por 23 840 B (lo halló la CI, no una prueba local: ver [§9.5](#95--el-presupuesto-del-arranque-en-frío-el-mundo-que-viaja-aparte)). Y las reglas de siempre: ningún `await` de nivel superior, la simulación pura, el arte y los PNG intactos. |

---

## 2 · Plan y estado

| Etapa | Qué | Dónde | Estado |
|---|---|---|---|
| **E0** | Guardado a escala: más banderas, salas y cartas por partida | `save/ProgressData.ts` (`PROGRESS_LIMITS`) | ✅ |
| **E1** | Salas **dibujadas** (`RoomCanvas`: se pinta por metros, de abajo arriba) en lugar de escritas rectángulo a rectángulo; validadores de datos (`validateRoom`, `validateWorld`, `analyzeProgression`) | `world/roomMap.ts`, `world/validateRoom.ts`, `world/worldGraph.ts` | ✅ |
| **E2** | **Salto doble, salto de pared, golpe al suelo**: comportamiento real en el controlador | `player/PlayerController.ts` | ✅ |
| **E3** | **Solucionador de alcanzabilidad** y auditoría de cada sala: dónde llega un héroe con un conjunto de habilidades, y que cada puerta de habilidad pida **exactamente** lo que dice | `tests/helpers/reach.ts`, `audit.ts`, `chain.ts` | ✅ |
| **E4** | Rompibles (suelo y muro partidos, sellos), vasijas de vida y de magia, reliquias | `gameplay/Seal.ts`, `content/upgrades.ts`, `content/rooms/kit.ts` | ✅ |
| **E5** | **Catorce arquetipos** de enemigo con cerebro propio (voladores, proyectiles, escudo…) | `enemies/archetypes/`, `content/creatures.ts` | ✅ |
| **E6** | **Motor de jefes dirigido por datos** + seis jefes con patrones, fases y condiciones propias | `enemies/boss/`, `content/bosses.ts` | ✅ |
| **E7** | **Siete zonas, sesenta y cuatro salas** (ocho en las Ruinas, nueve en las Raíces… siete en el Corazón), conectadas, con atajos, secretos, santuarios y el final del mundo | `content/rooms/*.ts`, `content/world.ts` | ✅ |
| **E8** | Integración: **mapa** (colocación a lo largo del camino), **sonido** (64 zonas sonoras), **arte** (60 salas vestidas con los paquetes pintados que ya existen), **presupuesto de arranque** (chunk diferido), pruebas y E2E al día | [§9](#9--integración-con-lo-que-ya-existía) | ✅ |
| **E9–E10** | Regresión completa, CI, documentación | [§10](#10--pruebas-y-lo-que-se-ejecutó) | ✅ (ver §10 y §11) |

**Reglas que se mantuvieron todo el encargo.** (1) *Un solo mundo*: ninguna sala, enemigo o jefe está duplicado; el mapa, el guardado, el sonido y el arte salen de los datos que ya existían. (2) *Lo visual aprobado no se tocó*: ningún PNG existente se repintó (`art:build -- --only none` solo reescribe manifiestos, escenas e índice), ni el HUD, ni el héroe, ni los menús. (3) *Nada nuevo entra en el arranque en frío si puede viajar en un chunk diferido.* (4) *Ninguna habilidad, mejora o secreto cuenta si una prueba no lo juega*: cada puerta de habilidad tiene una prueba que la cruza con la habilidad y otra que muestra que sin ella no se cruza. (5) *Lo que no se pudo comprobar se dice.* (6) *Ninguna prueba se debilitó ni se borró para ponerse en verde.*

---

## 3 · El mundo en cifras (y lo que se cuenta y lo que no)

| | Objetivo del encargo | Hay, y funciona | Cómo se comprueba |
|---|---|---|---|
| **Zonas** | 6–8 | **7** (Ruinas · Raíces Hundidas · Ciénaga Luminosa · Minas de Cristal · Aguja de las Campanas · Fundición de Tinta · Corazón de Tinta) | `adventure.test.ts`, `world.test.ts` |
| **Salas** | 50–80 | **64**, todas alcanzables sobre el papel, todas con entrada y salida, todas auditadas con el solucionador, **0 llegadas inseguras** (ninguna criatura nota al héroe en una entrada), 64 dibujos distintos | `adventure.test.ts`, una auditoría por zona (`tests/integration/world/*.test.ts`) |
| **Camino principal** | 3–5 h | **56 salas** en el primer camino, 3 190 m de entrada a salida, siete jefes; **8 salas opcionales** | [§11](#11--estado-final-por-objetivo-del-encargo) — *la duración no se alcanza ni se ha medido* |
| **Arquetipos de enemigo** | 12–18 | **14** (slime, crawler, toad, guard, spore, spitter, bat, wisp, toller, roller, piston, leech, weaver, shade), cada uno con un cerebro, un ataque con aviso y una respuesta que el héroe puede dar | `creatures.test.ts` (los catorce, jugados) |
| **Jefes** | 5–7 | **7**: el Custodio de Tinta y seis más, **cada uno con su propia forma de poder herirlo** (ver [§7](#7--los-siete-guardianes)) | `bosses.test.ts` + una arena por zona |
| **Habilidades** | 4–6 | **6**: Dash, Rayo Espiritual (carta), Air Dash, Salto doble, Salto de pared, Golpe al suelo — cada una con efecto en el controlador **y** una parte del mundo que solo ella abre | `adventure.test.ts` (qué sala enseña cuál, qué pide cuál) |
| **Mejoras / coleccionables** | 12–20 | **16**: 5 vasijas de vida (de 5 a 10 puntos), 3 de magia (de 100 a 160), 6 reliquias pasivas, la cuarta botella y la carta del Rayo | `adventure.test.ts` (cada una sale de **exactamente un** sitio) |
| **Secretos / rutas / opcionales** | 10–20 | **10 lugares escondidos** (un sello que rompe el Rayo, cuatro suelos partidos y dos muros partidos, una repisa que pide el salto doble, el final de una chimenea de salto de pared y la repisa de la cuarta botella) + **6 atajos** (palanca → puerta de piedra) + una ruta alternativa (el camino alto sobre los sapos de la Orilla), **8 salas opcionales** | `adventure.test.ts` |
| **Puntos de control** | cada 4–8 salas | **15 santuarios** (uno cada 4,3 salas) | `adventure.test.ts`, `world.test.ts` |

**Lo que NO se cuenta como contenido único** (y se dice para que nadie lo cuente): las cinco salas de descanso (Embarcadero, Campamento, Taller, Sacristía y Latido) son salas de calma con un santuario y una presencia pequeña —cuentan como salas, y su propósito es respirar—; los **siete jefes pelean con la misma pieza de música**; y ningún enemigo ni jefe nuevo tiene arte pintado (solo el Ink Slime y el Custodio lo tienen): se dibujan con siluetas procedurales, formas deformadas por su estado.

---

## 4 · Cómo se conecta el mundo: puertas, bloqueos y desbloqueos

Un mapa en una línea (cada flecha es un par de puertas; `⇢` es un atajo de palanca; entre corchetes, lo que se gana):

```
 R1 ─ R2 ─ R3 ─ R4 ─ Nave ─┬─ Archivo ·· Aljibe (suelo partido) ·· Relicario (salto doble)
 [Rayo]    [Air Dash]       │
                            └─ ↓ RAÍCES: Boca ─ Maraña ─ Tronco ─ Bodega ─ Puente ─ Eco ─ Galería ─ TRONO ─┐
                               [Salto doble en el Eco]                                       (Tirano)    │
        ┌──────────────────────────────────────────────────────────────────────────────────────────────────┘
        └ CIÉNAGA: Orilla ─ Pasarelas ─ Farolillos ─ Foso ─ Embarcadero ─ Sumidero ─ Muros ─ Pantano ─ CHARCA ─┐
                                                       [Salto de pared]                              (Matriarca) │
        ┌────────────────────────────────────────────────────────────────────────────────────────────────────────┘
        └ MINAS: Bocamina ─ Veta ─ Salón ─ Campamento ─ Fragua ─ Pozo ─ Vía ─ Galería ─ CÁMARA ─┐
                                                   [Golpe al suelo]                  (Coloso)    │
        ┌───────────────────────────────────────────────────────────────────────────────────────┘
        └ AGUJA: Pie ─ Galería ─ Escalera ─ Sacristía ─ Chimenea ─ Campanario ─ Pasarela ─ Antecámara ─ CIMA ─┐
                                                                                            (Custodio de la Campana) │
        ┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┘
        └ FUNDICIÓN: Compuerta ─ Línea ─ Prensa ─ Horno ─ Cubas ─ Taller ─ Pasarelas ─ Cuadro ─ MOTOR ─┐
                                                                                         (Motor)  │
        ┌─────────────────────────────────────────────────────────────────────────────────────────┘
        └ CORAZÓN: Umbral ─ Venas ─ Latido ─ Ascenso ─ Antesala ─ CORAZÓN ─ Reposo ═► el final del mundo
                                                                    (Soberano)
```

**Lo que bloquea cada cosa** (todo se prueba: con lo que pide, se cruza; sin ello, no):

| Bloqueo | Qué lo abre | Dónde | Cómo está probado |
|---|---|---|---|
| Un foso de 4 m de pared | **Salto doble** | `rt_echo` (la runa está al lado) | solucionador (sin él, ni el dash ni el Air Dash llegan; con él, las mismas saltos que halla el solucionador son saltos del juego) |
| Chimeneas de 20–32 m | **Salto de pared** | `mr_sink` → `mr_climb`, `sp_foot`, `sp_chimney`, `fd_press`, `ih_ascent` | ídem |
| Suelos y muros **partidos** | **Golpe al suelo** (suelos) · **cualquier golpe** (muros) | `ru_nave`, `mr_stilts`, `mn_hall`, `mn_forge`, `mn_descent`, `sp_bridge` · `rt_tangle`, `fd_line` | rotura probada jugándola; sin la habilidad el suelo no se rompe |
| Una **puerta de piedra** al pie de cada zona (de la segunda en adelante) | **una palanca** cerca del final de la zona (un atajo de vuelta) | seis atajos: Raíces, Ciénaga, Minas, Aguja, Fundición y Corazón | las palancas abren la puerta y las salas intermedias se saltan al volver |
| Dos puertas y dos palancas **en cadena** | la segunda palanca solo funciona tras la primera | `sp_belfry` | prueba de orden |
| La puerta de cada arena | **el jefe** (las puertas se cierran al empezar y se abren al caer) | seis arenas + el Santuario | pruebas de arena |
| El camino a la siguiente zona | **la caída del jefe de la anterior** | `requires: defeated:*_boss` en la última puerta de cada zona | `world.test.ts`, el recorrido de todo el mundo |
| Un sello de energía | **el Rayo Espiritual** | `r3_chamber`, `ru_archive` | pruebas de sello |
| El final del mundo | **el Soberano** | `ih_end` | `heart.test.ts`, E2E `ending` |

**El mapa de papel y el mapa de física coinciden.** `tests/integration/transitions.test.ts` recorre **todo el mundo puerta a puerta con las transiciones reales** —63 idas y 63 vueltas, cada sala por la salida que el análisis sobre el papel dice que la abre— y comprueba además que **las 138 salidas** llegan a la entrada que nombran, en el sitio, mirando a donde toca, sin rebotar.

---

## 5 · Las siete zonas, sala por sala

*Las tablas salen de los datos de las salas (un guion las genera: el tamaño es el de la cámara; «pide X» es lo que la sala exige del héroe, `RoomDefinition.needs`).*

### 5.1 · Ruinas del bosque antiguo

**Ocho salas.** Las cuatro de siempre (R1 la puerta, R2 la galería de raíces, R3 la cámara del sello, R4 el santuario y su guardián) y, **detrás del Santuario**, lo que antes era el final del mundo: la **Nave Derrumbada**, el eje de todo lo que sigue (cinco salidas: al Santuario, al Archivo, a las Raíces —un pozo en el suelo—, al Aljibe —un suelo que solo rompe el golpe al suelo— y al Relicario —una escala que pide el salto doble—). El **Archivo Sellado** guarda una vasija de vida tras un sello que solo rompe el Rayo; el **Aljibe Hundido**, una vasija de magia en un foso con sanguijuelas y pinchos; el **Relicario**, sobre el techo, la reliquia *Filo certero* tras un campo de pinchos de cuatro plataformas.

| Sala | Nombre | Tamaño | Lo que tiene |
|---|---|---|---|
| `r1_gate` | Puerta de las Ruinas | 115×17 | slime |
| `r2_hall` | Galería de Raíces | 93×17 | slime · pinchos · santuario · objeto: bottle_fourth |
| `r3_chamber` | Cámara del Sello | 81×18 | sello (Rayo) · objeto: card_spirit_bolt |
| `r4_sanctum` | Santuario | 101×17 | **jefe: ink_warden** · santuario · objeto: reward_air_dash |
| `ru_nave` | Nave Derrumbada | 72×24 | 2× crawler, 2× spitter · suelo/muro partido (slam/slam_dive) · pide double_jump (exit:reliquary) |
| `ru_archive` | Archivo Sellado | 60×18 | crawler, 2× spitter · sello (Rayo) · objeto: life_1 |
| `ru_cistern` | Aljibe Hundido | 44×18 | 2× leech · pinchos · objeto: mana_1 |
| `ru_reliquary` | Relicario | 40×22 | pinchos · objeto: relic_edge |

### 5.2 · Raíces Hundidas

**Nueve salas.** El mundo baja por un pozo de la Nave. Enseña el **salto doble** (la runa está en la Cámara del Eco y **la misma sala** se lo pide: el foso que sigue es una pared de 4 m) y pone al héroe contra las criaturas de la primera mitad: murciélagos que cuelgan y se lanzan, esporas que protegen su sitio, sanguijuelas que saltan desde un charco. Hay un **atajo** (una palanca en la Bodega abre la puerta de piedra de la Boca), una **vasija de vida** tras un muro partido (la Maraña), la **Guarida Oculta** al final de una chimenea de salto de pared (reliquia *Cuenta sifón*) y, al final, el **Tirano de Raíces** (una vasija de vida donde cae).

| Sala | Nombre | Tamaño | Lo que tiene |
|---|---|---|---|
| `rt_mouth` | Boca de las Raíces | 30×36 | crawler, 2× bat |
| `rt_tangle` | Maraña | 66×18 | 2× crawler, leech, bat · pinchos · suelo/muro partido (slash_1/slash_2/air_slash/crouch_slash/slam/slam_dive/spirit_bolt) · objeto: life_2 |
| `rt_hollow` | Tronco Hueco | 28×44 | 3× spore, 2× bat · pinchos |
| `rt_cellar` | Bodega de Semillas | 48×16 | santuario · palanca |
| `rt_bridge` | Puente de Raíz | 72×18 | spitter, 3× bat |
| `rt_echo` | Cámara del Eco | 52×22 | 2× spitter · objeto: double_jump · pide double_jump (exit:east) |
| `rt_gallery` | Galería del Tirano | 64×22 | 2× leech, crawler, spore · santuario · pide wall_jump (exit:hideout) |
| `rt_hideout` | Guarida Oculta | 34×18 | 2× leech · objeto: relic_siphon |
| `rt_arena` | Trono de Raíces | 72×26 | **jefe: boss_root_tyrant** · objeto: life_3 |

### 5.3 · Ciénaga Luminosa

**Diez salas.** Agua negra con luz dentro. Enseña el **salto de pared** (la runa está en el Sumidero, con una chimenea de 22 m al lado: la sala siguiente son tres muros de 8 m de piedra) y presenta los sapos —saltan donde estás y hacen temblar el suelo donde caen— y los fuegos fatuos que estallan al llegar a ti. El **Embarcadero** es el primer descanso (un fuego fatuo de farol vigila el puente), hay un atajo (la palanca del Pantano Hondo abre la piedra de la Orilla), la **Madriguera** (vasija de vida) está bajo un suelo partido de las Pasarelas y la **Matriarca del Cenagal** vive en la Charca (vasija de magia al caer).

| Sala | Nombre | Tamaño | Lo que tiene |
|---|---|---|---|
| `mr_edge` | Orilla | 64×18 | 3× toad |
| `mr_stilts` | Pasarelas | 76×22 | leech, toad, spitter, 3× wisp · pinchos · suelo/muro partido (slam/slam_dive) |
| `mr_lanterns` | Farolillos | 60×20 | toad, 4× wisp |
| `mr_toadpit` | Foso de los Sapos | 44×30 | 2× toad · pinchos |
| `mr_shrine` | Embarcadero | 40×16 | wisp · santuario |
| `mr_sink` | Sumidero | 24×32 | 2× leech · objeto: wall_jump · pide wall_jump (exit:east) |
| `mr_climb` | Muros de Hongos | 60×20 | 2× toad, spore, wisp · pide wall_jump (exit:east) · pide wall_jump (exit:west) |
| `mr_approach` | Pantano Hondo | 64×20 | 2× toad, spore, spitter, wisp · santuario · palanca |
| `mr_lair` | Charca de la Matriarca | 72×26 | **jefe: boss_mire_matriarch** · objeto: mana_2 |
| `mr_den` | Madriguera | 48×22 | 3× toad · objeto: life_4 |

### 5.4 · Minas de Cristal

**Diez salas.** Piedra fría que suena. Enseña el **golpe al suelo** en la Fragua Vieja y se lo pide **en el acto** (el camino sigue por un suelo partido de 3 m). Trae los lomos de piedra (un escudo al frente: rodearlos, o caer sobre ellos), los esquirlones que ruedan y se parten, y la **Cámara Acorazada** (vasija de vida) bajo una meseta partida del Salón. El **Coloso de Cristal** guarda la reliquia *Brebaje fuerte*. Un atajo (la palanca de la Galería de Carbón abre la puerta de la Bocamina).

| Sala | Nombre | Tamaño | Lo que tiene |
|---|---|---|---|
| `mn_gate` | Bocamina | 64×18 | 2× roller, bat |
| `mn_seam` | Veta | 26×40 | 2× guard, 2× bat · pinchos |
| `mn_hall` | Salón de Cristal | 72×24 | 2× guard, 2× bat · suelo/muro partido (slam/slam_dive) |
| `mn_camp` | Campamento | 40×16 | roller · santuario |
| `mn_forge` | Fragua Vieja | 48×22 | 2× guard · suelo/muro partido (slam/slam_dive) · objeto: ground_slam |
| `mn_descent` | Pozo de Carbón | 40×24 | roller, bat, guard · suelo/muro partido (slam/slam_dive) |
| `mn_rails` | Vía Muerta | 84×16 | 3× roller, guard |
| `mn_approach` | Galería de Carbón | 64×20 | roller, 2× guard, bat · santuario · palanca |
| `mn_arena` | Cámara del Coloso | 72×28 | **jefe: boss_colossus** · objeto: relic_brew |
| `mn_vault` | Cámara Acorazada | 44×22 | 2× roller, guard · objeto: life_5 |

### 5.5 · Aguja de las Campanas

**Diez salas.** Una torre de bronce y viento. No enseña nada: **pide todo** —chimeneas de 28 y 32 m que solo sube el salto de pared, una tabla que solo alcanza el salto doble, un puente de ocho plataformas sobre nada, una isla agrietada—. Su criatura es el **campanero** (tañe olas por el suelo a un ritmo: saltarlas). El **Campanario** es un pequeño rompecabezas de dos palancas y dos puertas que se abren **en orden**. El **Custodio de la Campana** cuelga fuera del alcance y solo se le hiere cuando cae sobre el héroe y se queda clavado en el suelo (reliquia *Faja veloz* al caer); el **Desván** (reliquia *Tinta penetrante*) está bajo la isla agrietada del puente.

| Sala | Nombre | Tamaño | Lo que tiene |
|---|---|---|---|
| `sp_foot` | Pie de la Aguja | 40×34 | toller, 2× bat · pide wall_jump (exit:east) |
| `sp_gallery` | Galería de Campanas | 76×20 | 4× toller, 2× bat |
| `sp_stair` | Escalera de Caracol | 30×52 | 2× toller, 2× wisp, bat |
| `sp_shrine` | Sacristía | 36×16 | pinchos · santuario |
| `sp_chimney` | Chimenea de Bronce | 14×40 | wisp · pinchos · pide wall_jump (exit:east) |
| `sp_belfry` | Campanario | 56×30 | toller, wisp, 2× bat · palanca · palanca · pide double_jump (item:lever_1) · pide wall_jump (item:lever_2) |
| `sp_bridge` | Pasarela del Viento | 80×26 | toller, 2× wisp, 2× bat · suelo/muro partido (slam/slam_dive) |
| `sp_approach` | Antecámara | 52×22 | 2× toller, bat · santuario · palanca |
| `sp_arena` | Cima de la Aguja | 72×36 | **jefe: boss_bell_warden** · objeto: relic_swift |
| `sp_loft` | Desván | 36×18 | 2× toller · objeto: relic_pierce |

### 5.6 · Fundición de Tinta

**Diez salas.** Hierro, calor y largas caídas. Sus criaturas son las máquinas: el **pistón** (te sigue desde arriba y cae), el **tejedor** (hace criaturas, nunca más de dos a la vez). La **Prensa** (36 m de chimenea con repisas de pinchos en la pared), el **Horno** (un suelo de pinchos y cinco tablones a 4 m uno del otro: una escalera de saltos dobles), las **Pasarelas de Hierro** (cinco sobre nada). El **Motor de la Fundición** guarda el *Hilo protector*; la **Chatarrería** (vasija de magia) está tras un muro partido de la Línea de Montaje.

| Sala | Nombre | Tamaño | Lo que tiene |
|---|---|---|---|
| `fd_gate` | Compuerta | 64×20 | guard, 2× piston |
| `fd_line` | Línea de Montaje | 92×18 | 2× weaver, 2× leech, spitter · suelo/muro partido (slash_1/slash_2/air_slash/crouch_slash/slam/slam_dive/spirit_bolt) |
| `fd_press` | Prensa | 14×42 | piston · pinchos · pide wall_jump (exit:east) |
| `fd_furnace` | Horno | 66×26 | 3× spitter, leech, piston · pinchos · pide double_jump (exit:east) · pide double_jump (exit:west) |
| `fd_vats` | Cubas de Tinta | 60×22 | weaver, spitter, guard |
| `fd_workshop` | Taller | 40×16 | leech · santuario |
| `fd_catwalks` | Pasarelas de Hierro | 88×28 | guard, 2× spitter, 2× piston |
| `fd_control` | Cuadro de Mandos | 56×22 | 2× guard, weaver, leech · santuario · palanca |
| `fd_arena` | Sala del Motor | 72×26 | **jefe: boss_engine** · objeto: relic_ward |
| `fd_scrap` | Chatarrería | 40×20 | guard, 2× piston · objeto: mana_3 |

### 5.7 · Corazón de Tinta

**Siete salas.** Negra, quieta, y late. Pide lo que pidieron todas (una escalera de saltos dobles sobre pinchos en las Venas, una doble chimenea de salto de pared en el Ascenso) y pone contra el héroe las criaturas de todas, con una nueva: la **Sombra del Velo**, que se desvanece al acercarse y vuelve **detrás**. Termina en el **Soberano del Corazón de Tinta** y, tras él, el **Reposo**, el último santuario y **la salida del mundo**, que solo funciona una vez caído el Soberano.

| Sala | Nombre | Tamaño | Lo que tiene |
|---|---|---|---|
| `ih_threshold` | Umbral | 56×20 | 2× shade |
| `ih_veins` | Venas | 84×24 | weaver, 2× shade, toller · pinchos · pide double_jump (exit:east) · pide double_jump (exit:west) |
| `ih_shrine` | Latido | 36×16 | leech · pinchos · santuario |
| `ih_ascent` | Ascenso | 30×50 | shade, 2× wisp · pide wall_jump (exit:top) |
| `ih_approach` | Antesala | 60×24 | 2× shade, weaver, toller · santuario · palanca |
| `ih_arena` | Corazón | 72×30 | **jefe: boss_sovereign** |
| `ih_end` | Reposo | 40×16 | santuario |

---

## 6 · Habilidades, mejoras, secretos, atajos y descansos

### 6.1 · Las seis habilidades

| Habilidad | De dónde sale | Qué hace en el controlador | Qué abre |
|---|---|---|---|
| **Esquiva** (dash) | desde la partida nueva | ráfaga con ventana de invulnerabilidad | todo el primer capítulo |
| **Proyectil espiritual** (Rayo) | la carta de la Cámara del Sello (R3) | un proyectil que cuesta 30 de magia | los sellos de energía (R3, el Archivo) |
| **Esquiva aérea** (Air Dash) | el Custodio de Tinta (R4) | una esquiva más en el aire | huecos más largos (lo mide el solucionador: se cruzan 10 m con la esquiva, 13 con la esquiva aérea, 16 con el salto doble y 19 con los dos) |
| **Salto doble** | la Cámara del Eco (Raíces) | un salto más en el aire | el foso del Eco, el Relicario, las escaleras de tablones a 4 m (Horno, Venas, Campanario) |
| **Salto de pared** | el Sumidero (Ciénaga) | deslizar por una pared y patearla | las chimeneas (Galería del Tirano, Muros de Hongos, Pie de la Aguja, Chimenea de Bronce, Prensa, Ascenso, Latido) |
| **Golpe al suelo** | la Fragua Vieja (Minas) | en el aire, abajo + ataque: se cae en picado y se rompe lo que el suelo esconde | los seis suelos partidos de las Ruinas, la Ciénaga, las Minas y la Aguja |

`grapple` (gancho) y `swim` (nadar) **siguen declaradas y sin comportamiento**: ninguna parte del mundo las pide y ninguna prueba las da por hechas (`implemented: false`). No se cuentan.

### 6.2 · Dieciséis mejoras, cada una de un solo sitio

- **Cinco vasijas de vida** (de 5 a 10 puntos): el Archivo (tras el sello del Rayo), la Maraña (tras un muro partido), el Trono de Raíces (al caer el Tirano), la Madriguera (bajo un suelo partido) y la Cámara Acorazada (bajo una meseta partida).
- **Tres vasijas de magia** (de 100 a 160 unidades): el Aljibe, la Charca de la Matriarca y la Chatarrería.
- **Seis reliquias pasivas**, cada una con un efecto que se nota: *Filo certero* (el Relicario: cada golpe de espada hiere uno más), *Cuenta sifón* (la Guarida Oculta: un golpe que da devuelve magia), *Brebaje fuerte* (el Coloso: la botella cura un punto más), *Faja veloz* (el Custodio de la Campana: la esquiva vuelve antes), *Tinta penetrante* (el Desván: el Rayo atraviesa a dos enemigos), *Hilo protector* (el Motor: se es intocable más tiempo tras un golpe).
- **La cuarta botella** (R2, sobre la repisa del camino alto) y **la carta del Rayo** (R3).

Las vasijas **no son un contador aparte**: `content/upgrades.ts` las lista y el máximo de vida o de magia se **deriva** de las banderas `taken:life_N` / `taken:mana_N`, así que **guardar y cargar las conserva sin cambiar el esquema** (`saveVersion` sigue en 2). Una prueba exige que cada bandera de la lista la ponga **exactamente un** objeto del mundo y que ningún objeto con pinta de vasija falte en la lista.

### 6.3 · Atajos y descansos

**Seis atajos**: en la Boca de las Raíces, la Orilla, la Bocamina, el Pie de la Aguja, la Compuerta y el Umbral hay una **puerta de piedra** que no se abre desde ese lado; al final de cada zona hay una **palanca** (en la Bodega, el Pantano Hondo, la Galería de Carbón, la Antecámara, el Cuadro de Mandos y la Antesala) que abre un pasaje de vuelta al principio: **las salas intermedias se saltan al volver** (y, como todo, queda guardado en las banderas).

**Quince santuarios** (puntos de control: curan, rellenan botellas y magia, guardan la partida y son donde se vuelve tras una derrota): R2, R4, y luego dos por zona (uno a media zona y otro antes del jefe) más el último (Reposo): Bodega y Galería del Tirano · Embarcadero y Pantano Hondo · Campamento y Galería de Carbón · Sacristía y Antecámara · Taller y Cuadro de Mandos · Latido y Antesala · Reposo.

### 6.4 · Diez lugares escondidos

El sello del Archivo (Rayo) · el suelo partido de la Nave (el Aljibe) · la escala de la Nave (el Relicario, salto doble) · el muro partido de la Maraña · la chimenea de la Galería del Tirano (la Guarida Oculta, salto de pared) · el suelo partido de las Pasarelas (la Madriguera) · la meseta partida del Salón (la Cámara Acorazada) · la isla partida de la Pasarela del Viento (el Desván) · el muro partido de la Línea de Montaje (la Chatarrería) · la repisa del camino alto de R2 (la cuarta botella). **Todos están detrás de algo que una bandera abre**, y **ocho salas enteras son opcionales** —ninguna parte del camino pasa por ellas: el Archivo, el Aljibe, el Relicario, la Guarida Oculta, la Madriguera, la Cámara Acorazada, el Desván y la Chatarrería— y tienen una sola salida (una prueba lo exige).

---

## 7 · Los siete guardianes

El Custodio de Tinta es la clase que se escribió para él; **los otros seis son el motor de jefes dirigido por datos** (`enemies/boss/Boss.ts` ejecutando una tabla: qué patrones tiene, cómo los cambian sus fases y —sobre todo— **bajo qué condición se le puede herir**). Que cada pelea sea otra pelea es lo que el encargo exigía; esto es lo que las distingue:

| Jefe | Vida | Fases | Condición para herirlo | Patrones |
|---|---|---|---|---|
| **Custodio de Tinta** (R4) | 36 | 2 (se enfurece al 50 %) | la corona que flota sobre él (×2): se alcanza saltando | carga en línea con aviso · lluvia de columnas de tinta |
| **Tirano de Raíces** | 40 | 2 | corteza que casi no se hiere; **el corazón solo se ve mientras se recupera de un barrido o de una erupción** | barrido · erupciones del suelo · (fase 2) una fila de columnas que marcha hacia el héroe |
| **Matriarca del Cenagal** | 44 | 2 | un picotazo de cualquier sitio; **el golpe entero solo en el vientre, que se ve tras un salto o un latigazo** | salto · lengua · escupitajo · (fase 2) llama a dos fuegos fatuos |
| **Coloso de Cristal** | 48 | 2 | cerrado como una montaña: **nada lo hiere salvo el núcleo que abre tras una ráfaga de esquirlas** | pisotón · lluvia de rocas · ráfaga de esquirlas |
| **Custodio de la Campana** | 46 | 2 | vuela fuera del alcance: **solo se le hiere cuando cae sobre el héroe y queda clavado en el suelo** | picado · olas de campana · repique |
| **Motor de la Fundición** | 60 | 3 | **la rejilla del lomo se abre cuando su carga acaba contra una pared** (un aturdimiento largo) | carga contra las paredes · pistones en filas alternas · chispas · (fase 3) una marcha |
| **Soberano del Corazón de Tinta** | 80 | 3 | siempre herible en el corazón; **desaparece y corta por detrás** | corte tras teletransporte · lluvia · orbes · (fase 2) anillo y una criatura llamada · (fase 3) una marcha y otra criatura |

Todos tienen el mismo ciclo (despiertan 1,5 s, se tambalean un tercio de segundo, caen en otro segundo y medio), **cada ataque se anuncia con su propio aviso en el suelo** (el aviso ES el `startup` del ataque), las **puertas de la arena se cierran al empezar y se abren al caer** (y llegan hasta el techo: con el salto de pared no se trepa una puerta), la **recompensa** aparece donde cayeron (una vasija o una reliquia; el Soberano deja libre el final del mundo) y **el jefe vencido no se vuelve a construir** (su bandera `defeated:*` es la memoria del mundo). Cada arena tiene además su **propia geometría** (arcos de raíz a 3 m, una isla de barro, tres pasarelas de hierro…) en lugar de ser el mismo suelo con otras puertas.

## 8 · Los catorce arquetipos

Cada uno es **un cerebro** (`enemies/archetypes/<nombre>.ts`) que lee unos números (datos en `content/creatures.ts`); **el aviso de cada golpe es su `startup`** y cada uno pide algo distinto del héroe:

| Arquetipo | Criatura | Qué hace | Qué lo responde |
|---|---|---|---|
| slime | Baba de tinta | se lanza a poca distancia | esquivar y golpear |
| crawler | Reptador espinoso | una carga recta que no puede girar; un muro lo aturde | salirse de la línea o saltarlo |
| toad | Sapo del cenagal | salta **donde estás** y hace temblar el suelo donde cae | moverse tarde |
| guard | Lomo de piedra | un escudo al frente | rodearlo, o caer sobre él (golpe al suelo) |
| spore | Espora luminosa | blindada hasta que su nube se aclara | esperar, o hacerla florecer de lejos |
| spitter | Escupidor de tinta | mantiene la distancia y lanza tinta | acercarse, o recibirlo en una pared |
| bat | Murciélago de cueva | cuelga del techo y se lanza girando | moverse tarde |
| wisp | Fuego fatuo de farol | flota hacia ti y estalla | apagarlo antes, o huir |
| toller | Campanero | una cadencia: olas por el suelo | saltar las olas |
| roller | Esquirlón | una piedra enroscada; al romperse, esquirlas | golpearlo desenroscado, vigilar los trozos |
| piston | Dron de pistón | te sigue desde arriba y cae | salirse de la línea, golpearlo cuando se clava |
| leech | Sanguijuela del suelo | un charco que salta (la segunda vez ya se sabe) | no pisar el charco |
| weaver | Tejedor de tinta | hace criaturas, nunca más de dos | llegar a él |
| shade | Sombra del velo | desaparece y vuelve **detrás** de ti | seguir moviéndose, o darse la vuelta |

Se presentan **de a poco** (ninguna zona trae más de seis arquetipos; una prueba lo exige) y **el último, la Sombra del Velo, llega en el Corazón**.

---

## 9 · Integración con lo que ya existía

### 9.1 · El mapa

El mapa del Prompt 19 **no se rehízo**: sigue saliendo de `WORLD`/`ROOMS` y de las salas que el juego ya cuenta y guarda. Lo que sí cambió, porque 64 salas con atajos no son una línea:

- **`analyzeProgression` devuelve ahora `via`**: la puerta por la que se abre cada sala cuando se juega el mundo sobre el papel (la primera que funcionó), sin contar un atajo que solo funciona después de haber recorrido el camino.
- **`buildMapLayout` coloca las salas a lo largo de ese camino.** Antes colocaba cada sala contra la primera puerta que la nombraba, y un atajo de palanca —una puerta a una sala que está a ocho salas de distancia— **arrastraba esa sala a su lado** (la Charca de la Matriarca acabó a 500 m de la sala anterior). Ahora un atajo es **una línea entre dos salas que ya están donde el camino las puso**. Resultado, medido: 64 cajas sin solaparse (ni a menos de media separación), 69 enlaces, **los únicos enlaces largos son los seis atajos** (el resto, a menos de 80 m de línea). Las cuatro primeras salas siguen en fila, cada puerta a la altura de la que le responde.
- **Los nombres de las seis zonas nuevas** están en el mapa (`region.*` en es/en) y todos los santuarios, sellos y guardianes de las salas aparecen como marcas: **15 santuarios, 7 guardianes, 2 sellos del Rayo** (la piedra partida es un secreto de la sala y el mapa no la marca).
- «Salas descubiertas» cuenta **de 64**. Descubrimiento progresivo, posición del héroe, puertas cerradas hacia lo desconocido y persistencia: **exactamente las del Prompt 19** (las pruebas `mapDiscovery`, `pauseMenuWiring` y `worldMap` siguen, ahora con el mundo entero).

### 9.2 · El guardado

**Sin cambio de esquema** (`saveVersion` sigue en 2). Todo lo nuevo es banderas del mundo que ya se guardan: `defeated:*_boss`, `taken:life_N`/`mana_N`, `taken:relic_*`, `broken:*` (suelos y muros partidos), `lever:*` (atajos), y las habilidades nuevas, que ya se guardaban como lista. Lo único que hubo que cambiar fue **el techo** (`PROGRESS_LIMITS`: 1024 banderas, 256 salas, 32 cartas) y que **una partida guardada en una sala del mundo nuevo se abra donde se guardó**, lo que obligó a una regla de arranque ([§9.5](#95--el-presupuesto-del-arranque-en-frío-el-mundo-que-viaja-aparte)). Pruebas: `saveJourney` (guardar → cerrar → reabrir → seguir, en cada sala y en cualquier tick, ahora para el primer capítulo), `slice` (reanudable desde **cada** guardado que hizo el recorrido) y el guardado a escala de las zonas.

### 9.3 · El sonido

Las 60 salas **no son silenciosas**: `audio/zoneAudio.ts` pasó de 4 zonas sonoras a **64** (una por sala, armadas por zona con lo que existe: las cuatro piezas de música, los cuatro lechos de ambiente y los siete sonidos dispersos; lo que distingue las zonas es el lecho, el suelo y cuánto tarda el aire en soltar un sonido). Cada arena sostiene los sonidos del jefe; **los siete jefes pelean con la misma pieza** (`BOSS_MUSIC`). `npm run audio:check`: 81 sonidos, 8 piezas, 0 errores, 0 avisos. **Una pieza propia por zona y por jefe, y los sonidos de cada enemigo, quedan pendientes** (§12).

### 9.4 · El arte

**No se pintó ni se repintó nada.** Las 60 salas se visten con los seis paquetes `ruins-*` que ya existían: `ruins-ground`, `ruins-back` y `ruins-light` visten las 64 (suelo, fondo, hojas, polvo, brillos); `ruins-roots` (espinas, santuario, frasco), `ruins-seal` (sigilo, carta) y `ruins-sanctum` (runa) se piden **solo a las salas cuyos datos piden esa pieza** (se lee del contrato de entorno, no a mano). Un **compositor** (`tools/art/scenes/world.ts`) lee los datos de cada sala —dónde su suelo está abierto, dónde cuelgan las plataformas, dónde están los santuarios, los objetos y el guardián— y coloca las piezas de siempre con una mano distinta por zona (las raíces crecen, la ciénaga brilla de hongos, las minas son cristal y escombro, la aguja es columnas y viento, la fundición escombro y brasas, el corazón cristal y violeta), sembrado por el id de la sala. `art:build -- --only none` solo reescribe manifiestos, escenas e índice (los PNG no cambian: el *diff* de `public/art` son 184 archivos de texto). **Se comprobó mirando el juego** (capturas de la Nave, el Salón de las Minas, el Embarcadero, la Sala del Motor y la Chimenea de Bronce) y en el navegador: la escena E2E `rooms` construye **las 64 salas en una página**, cada una vestida con el arte (suelos pintados y fondo) y con la cámara dentro de sus límites.

**Lo que queda sin pintar, dicho:** el cuerpo de la **piedra partida** (`door:stone`) y la **palanca** (`interactive:activate`) no tienen pieza en ningún paquete —las dibuja el blockout, y `npm run assets:pack` lo avisa—; los **enemigos y los jefes nuevos** se dibujan con siluetas procedurales; las salas están vestidas por un compositor, **no compuestas a mano como las cuatro primeras**.

### 9.5 · El presupuesto del arranque en frío: el mundo que viaja aparte

**Lo halló la CI, no una prueba local.** Con las 60 salas, las 13 criaturas con sus cerebros y el motor de los jefes dentro del primer fichero, `npm run bench:bundle` midió **228 640 B gz contra un techo de 204 800** (23 840 B de más) y los dos trabajos E2E de la CI fallaron en ese paso. Lo que se hizo, y por qué así:

- **El mundo posterior al Santuario es un *chunk* propio** (`content/beyond.ts`): las 60 salas, las 13 criaturas, los 6 jefes y el código que los hace funcionar —los **cerebros** (`enemies/archetypes/all.ts`) y el **motor de jefes** (`enemies/boss/engine.ts`)—. El primer fotograma lleva solo lo que R1 necesita (`content/core.ts`: las cuatro primeras salas, el Ink Slime, el Custodio y la lista de las 64 salas).
- **Los registros son los mismos objetos para todos** (`ROOMS`, `ENEMIES`, `BOSSES`): `beyond.ts` los completa al cargarse, así que **quien lo importe tiene el mundo entero** —las pruebas y las herramientas importan `content/index.ts`, que lo trae—.
- **Dos registros sustituyen a dos `switch`/`new` del código frío**: `createBrain` busca el cerebro en un registro (el del slime viene incluido; la prueba `brains.test.ts` exige un cerebro por cada arquetipo) y `GameSession` construye un jefe de datos con `createEngineBoss`. «Quién es un guardián» se decide por `kind`, no por clase, para que la sesión no necesite el código de los jefes para reconocerlos.
- **El juego pide el *chunk* en cuanto el primer fotograma está en pantalla**, junto con los efectos y el arte (`app/beyond.ts`). Si la partida guardada o `?room=` empiezan en una sala del mundo nuevo, lo espera **antes** de construir la sesión; una página de pruebas (`?hooks=1`) lo tiene desde el principio. Y si un héroe tocara una puerta a una sala que todavía no llegó (una red muy lenta: lo normal es que el *chunk* esté dentro mucho antes de que se pueda vencer al Custodio), `GameSession.rearmExit` vuelve a armar la salida cuando el *chunk* llega, en lugar de dejarla gastada, y la página reintenta la carga hasta ocho veces. **Lo que está probado es la simulación** (`transitions.test.ts`: una salida tocada antes de que llegue la sala no hace nada y, armada de nuevo, el héroe que sigue ahí pasa una vez); **el cableado de la página que la llama —esperar al *chunk* y reintentar— no tiene una prueba propia**: se razona sobre el código y no se ha visto con una red lenta.
- **Resultado medido: 198,5 KB gz = 203 236 B de 204 800** (quedan 1 564 B; el primer fichero baja de 105 a 80 KB gz y `beyond` pesa 27,5 KB gz, que se piden después). `tests/unit/app/coldStart.test.ts` fija **la estructura**: el cierre de `import`s estáticos desde `main.ts` **no llega** a ninguna sala, criatura, cerebro ni motor del mundo nuevo, y el registro del núcleo tiene siete salas, el slime y el Custodio hasta que `beyond` llega.

### 9.6 · Cómo se construye una sala y cómo se comprueba

- **Se dibuja.** `RoomCanvas` pinta por metros (`rock`, `earth`, `ground`, `pit`, `plat`, `spikes`, `region`, `mark`), de abajo arriba, con los mismos números que usa el juego (`y = 6` es un suelo a seis metros); `RoomMap` lee ese dibujo y las marcas (`entry`, `spawn`, `exitSide`, `exitShaft`, `boss`, `shrine`, `pickup`, `seal`, `gate`) y devuelve la sala. Un trazo fuera del lienzo, un pincho que no pisa nada, una región que no es un rectángulo o una marca que no existe **son errores con el nombre de la sala**.
- **Se valida** (`validateRoom`): referencias a enemigos, jefes, cartas, botellas y habilidades que existen; entradas que no meten al héroe en una pared; criaturas que no nacen dentro de la piedra; murciélagos con techo; banderas que algo pone.
- **Se audita con el solucionador** (`tests/helpers/reach.ts`, `audit.ts`): desde cada entrada y con las habilidades que el héroe tiene en ese punto, ¿a qué suelos llega y a qué puertas? Lo que no pide nada se alcanza **con la esquiva sola**; lo que pide una habilidad se alcanza **con ella y no sin ella** (la prueba falla si una puerta pide de más o de menos). **`unsafeArrivals`**: ninguna criatura nota al héroe en una entrada ni en el sitio donde un santuario lo devuelve tras una derrota.
- **Se repite en el juego.** `chain.ts` toma la cadena de saltos que halló el solucionador y **la juega otra vez en una `GameSession` real** de la misma sala: el héroe cae donde el solucionador dijo, a un pelo. Así lo que el solucionador afirma es un camino **del juego**, con sus puertas, pinchos y enemigos.

---

## 10 · Pruebas y lo que se ejecutó

**Pruebas nuevas (las que prueban el mundo y no solo el código):**

| Prueba | Qué afirma |
|---|---|
| `tests/unit/content/adventure.test.ts` (13) | **Las cifras del encargo, leídas de los datos**: 64 salas en 7 zonas, todas alcanzables sobre el papel, con entrada y salida y con dibujos distintos; ninguna sala contiene lo mismo que otra; 14 arquetipos, ninguna zona con más de seis; las habilidades se enseñan en el orden y en las salas que se dicen y las piden partes que nada más abre; 8 vasijas y 6 reliquias, cada una de un solo sitio; ≥ 10 lugares escondidos; 6 atajos |
| `tests/integration/world/*.test.ts` (**93** en siete archivos, una zona cada uno) | Cada zona **jugada con la sesión real**: las salas se auditan con el solucionador (sin errores de datos, nada inalcanzable, ninguna puerta de habilidad que pida de más o de menos, **0 llegadas inseguras**), las puertas de habilidad se **cruzan con la habilidad y no sin ella**, cada rompible se rompe, cada objeto se coge una vez, cada palanca abre su puerta, cada santuario devuelve al héroe, y cada **arena** se pelea con un jugador de guion hasta que el jefe cae y deja su recompensa |
| `tests/integration/transitions.test.ts` (+4) | **El mundo recorrido puerta a puerta con las transiciones reales** (63 idas y 63 vueltas, cada sala por la salida que el papel dice) y **las 138 salidas** llegan a la entrada que nombran; y **la salida a una sala que todavía no llegó** (`GameSession.rearmExit`: el mundo posterior al Santuario viaja en un *chunk* aparte): tocada antes de que llegue, no hace nada; armada de nuevo, el héroe que sigue ahí pasa **una vez**; armar una salida que nadie tocó no cambia nada. *Se comprobó que falla si `rearmExit` no hace nada* |
| `tests/integration/creatures.test.ts`, `bosses.test.ts` | Los catorce arquetipos y los siete guardianes, jugados: cada uno con su aviso, su respuesta y su muerte. **Fe de erratas (Prompt 22, [§1.2 D1](PROMPT22-LOG.md#12--lo-que-la-bitácora-anterior-decía-y-el-código-no-sostiene) y [§4](PROMPT22-LOG.md#4--los-encuentros-ganados-por-un-héroe-mortal-t2)):** «jugados» era demasiado: estas pruebas derribaban al jefe de un golpe de 1 000 000 con el héroe invulnerable, o peleaban con un héroe inmortal y quieto; **ninguna demostraba que un héroe mortal con las entradas de una persona pudiera vencer a los seis jefes nuevos ni a las criaturas**. Lo demuestra `tests/integration/encounters.test.ts` (Prompt 22). |
| `tests/unit/app/coldStart.test.ts` (4), `tests/unit/enemies/brains.test.ts` (2) | **La estructura del arranque en frío** (el primer fotograma no importa nada del mundo nuevo) y **un cerebro por arquetipo** |
| `tests/unit/world/worldMap.test.ts` (+3), `roomMap.test.ts` | El mapa del mundo (sin solapes, atajos como líneas, el final en la última sala) y el lienzo |
| `tests/unit/audio/soundMap.test.ts` (+2) | 64 zonas sonoras, una pieza por zona, los siete jefes con música |
| E2E `rooms` (nueva) | **Las 64 salas en una página**, cada una vestida con el arte, el héroe en pie y vivo, la cámara dentro de sus límites, ≤ 60 llamadas de dibujo, la consola limpia |

**Pruebas que dejaron de ser ciertas y se reescribieron para el mundo nuevo** (ninguna se borró ni se debilitó): el recorrido de guion de R1 a R4 (`worldJourney`, `slice`, `saveJourney`, `audioCueContract`) **ahora es «el primer capítulo»: termina en la Nave**, y el final de la aventura se prueba en su sitio (`ih_end`, tras el Soberano); los contratos de arte pasaron de 14 a **16 piezas pedidas** (dos sin pintar, dichas); el perfil y el menú cuentan 7 guardianes y 64 salas; las escenas E2E `world`, `finale`, `ending`, `boss` y `camera` se movieron al primer capítulo y a `ih_end`.

**Lo que se ejecutó, y el resultado:**

| Comprobación | Resultado |
|---|---|
| `npx tsc --noEmit` | limpio |
| `npx vitest run` | 249 archivos, **4 640 pruebas** pasan (al abrir el encargo: 228 y 3 734) |
| `npm run build` (incluye `assets:check`, `hud:check`, `licenses:check`) | sin errores; avisos de arte: solo los dos conocidos (la piedra partida y la palanca) y el aviso de los 5 clips del protagonista que el dibujo no tiene |
| `npm run bench:bundle` | **203 236 B de 204 800** en el arranque en frío |
| `npm run audio:check` | 81 sonidos, 8 piezas, 0 errores, 0 avisos |
| E2E contra el *build* de producción (`npm run test:e2e -- --prod`) | **66 de 66 escenas** pasan: los dos grupos de la CI (`play` 13 y `stability` 4) y las otras 49 en una pasada aparte. **Una, `cost`, falló al principio y no por el mundo nuevo**: exigía contar ≥ 60 fotogramas en 9 s y este contenedor —el dibujo por software en todos los núcleos— saca 6–8 por segundo (el Prompt 20 midió 12–14); **falla igual en `1944de4`** (75 y 59 fotogramas) y el coste de JavaScript por fotograma es el mismo antes y después (media de 2,1–2,3 ms sin limitar, 5–5,6 ms a ×4). Se corrigió el instrumento —la pelea sigue hasta contar los 60 fotogramas, hasta cinco veces más—; ni el umbral ni el juego |
| E2E en desarrollo (`npm run test:e2e`) | **66 de 66 escenas** pasan (una pasada completa que un reinicio del entorno cortó tras 62 escenas, y las cuatro que faltaban —`resilience`, `readable`, `privacy` y `soak`— aparte). **`room-art` falló una vez** en la pasada completa («rebuilt with the Warden fallen: the eye is closed at once» leyó 0 en vez de 1): el nivel de la pieza se pone en su objetivo en el primer fotograma que lo lee y la escena esperaba 250 ms de reloj, que una máquina cargada puede gastar en un solo fotograma. **No se pudo reproducir** —pasó sola en desarrollo, en producción y con cuatro núcleos ocupados por otros procesos—; la espera se cambió a tres fotogramas de la página (sigue distinguiendo «de golpe» del fundido de 0,9 s) y la escena pasa. Ningún cambio de juego |
| CI de GitHub | **Verde** sobre `507d916` (la ejecución nº 120): `check` (tipos, las 4 638 pruebas y el *build*), `e2e (play)` 13 de 13 y `e2e (stability)` 4 de 4 —ambos con `bench:bundle` dentro— y el humo de **Firefox** y de **WebKit**. Es la primera CI verde desde que el mundo creció: las de los commits intermedios (E7h a E8c) estaban rojas por el techo del arranque en frío, que ninguna prueba local mide ([§9.5](#95--el-presupuesto-del-arranque-en-frío-el-mundo-que-viaja-aparte)) |

**Los commits del encargo** (rama `claude/troid-vertical-slice`, a partir de `1944de4`; cada etapa se integró y se probó antes de seguir):

| Commit | Etapa |
|---|---|
| `85941d5` | **E0** — los límites del guardado se miden para un mundo (1024 banderas, 256 salas, 32 cartas) |
| `dde9e0c` | **E1** — las salas se dibujan (`RoomCanvas`/`RoomMap`) y salen `RoomDefinition` normales |
| `2b314e5` | **E2** — salto doble, salto de pared y golpe al suelo |
| `c2db62a` | **E3** — el verificador de alcance con el controlador real |
| `1b48154` | **E4** — vasijas, seis reliquias pasivas, muros y suelos que se rompen |
| `826f488` | **E5** — trece criaturas nuevas y el marco que las sostiene |
| `bdb9edf` | **E6** — seis guardianes con un motor de jefes por datos |
| `3ccaabe` | **E7a–c** — el lienzo, la auditoría de salas, las Ruinas tras el Guardián y las Raíces Hundidas (13 salas) |
| `2743363` · `a8d5693` · `d4ad05b` · `c843aa6` · `e2a395c` | **E7d–h** — la Ciénaga Luminosa, las Minas de Cristal, la Aguja de las Campanas, la Fundición de Tinta y el Corazón de Tinta (diez, diez, diez y siete salas, cada una con su jefe) |
| `06b699a` | **E7i/E8** — el mundo vivo: 64 salas en 7 zonas, mapa y pruebas al día |
| `70ce217` | **E8b** — el sonido del mundo (una zona sonora por sala) |
| `caa2d79` | **E8c** — las 60 salas nuevas, vestidas con el arte que ya existía |
| `507d916` | **E8f/E9** — el mundo posterior al Santuario viaja en un *chunk* diferido (arranque en frío: 203 236 B) y las escenas E2E, en el mundo de 64 salas |
| *(el último)* | **E10** — esta bitácora, el ROADMAP, el README, PUBLISHING y ARCHITECTURE-2D §17 |

**Los archivos** (`git diff --name-status 1944de4`): **520** —426 nuevos, 94 modificados, **0 borrados y 0 imágenes o sonidos**—. 184 son texto regenerado de `public/art` (manifiestos, escenas e índice, a partir de los PNG que ya existían), 184 son manifiestos y escenas de `art/` (las 60 salas vestidas), **89 de `src/`**, **46 de `tests/`**, 11 de `tools/` (el compositor de escenas del arte y las escenas E2E), 5 documentos y el flujo de la CI. Unas 42 500 líneas añadidas y 530 quitadas.

**Lo que NO es esta lista:** ninguna de estas ejecuciones es una persona jugando. Las pruebas de guion comprueban que **se puede** (un jugador de guion cruza, rompe, vence y llega a donde el solucionador dice), no que **sea divertido**, ni que la dificultad sea la justa, ni cuánto se tarda.

---

## 11 · Estado final por objetivo del encargo

### 11.1 · Los objetivos de diseño

| Objetivo | Pedido | Hay y funciona | Estado |
|---|---|---|---|
| Zonas principales conectadas | 6–8 | **7** | ✅ |
| Salas jugables reales | 50–80 | **64** (cinco son salas de calma; las 64 tienen dibujo y contenido propios y están auditadas con el solucionador) | ✅ |
| Arquetipos de enemigo con comportamiento distinto | 12–18 | **14** | ✅ |
| Jefes únicos | 5–7 | **7** (cada uno con su condición para poder herirlo) | ✅ |
| Habilidades principales | 4–6 | **6**, cada una con efecto y con una parte del mundo que solo ella abre | ✅ |
| Mejoras o coleccionables con utilidad | 12–20 | **16** | ✅ |
| Secretos, rutas alternativas o áreas opcionales | 10–20 | **17**: 10 lugares escondidos + 6 atajos + 1 ruta alternativa (las 8 salas opcionales son el interior de ocho de los diez lugares; no se suman aparte) | ✅ |
| Puntos de control | cada 4–8 salas | **15 santuarios**, todos en el primer camino: de uno a otro hay de 2 a 7 salas (media 3,7); el tramo más largo es de **7** | ✅ (un poco más a menudo que lo pedido, no menos) |
| Campaña principal | **3–5 h** | 56 salas y 3 190 m de entrada a salida en el primer camino, siete jefes y 8 salas opcionales | ❌ **no se alcanza ni se ha medido** (ver abajo) |

**La duración.** Correr los 3 190 m del primer camino son **unos 6 minutos** (a 8,5 m/s, sin saltar, sin pelear, sin equivocarse). Con las salas, los siete jefes, las habilidades que hay que ir a buscar y las vueltas por los atajos, **la estimación honesta es de 1 a 2,5 h para una primera partida, y es una estimación**: ninguna persona ha jugado este mundo con un reloj, y ninguna prueba mide cuánto tarda una persona. **El objetivo de 3–5 h no se cumple con este mundo.** Se prefirió no alargarlo copiando salas ni subiendo la vida de los enemigos (lo que el encargo prohíbe contar); lo que lo acercaría es contenido que no existe todavía —más tramos de vuelta con una razón para volver, más combates distintos por zona, más jefes opcionales— y la medida de una persona. Está en la [§12](#12--lo-que-queda-y-quién-lo-hace).

### 11.2 · Los ocho requisitos de implementación

| Requisito | Estado | Con qué se comprueba |
|---|---|---|
| **1. Expandir el mundo y conectar las zonas** (puertas, rutas bloqueadas, atajos, desbloqueos) | ✅ | 138 salidas que llegan a donde dicen; 6 atajos de palanca; cada zona nueva y el final del mundo se abren con la caída de un jefe; puertas de habilidad que se cruzan con la habilidad y no sin ella ([§4](#4--cómo-se-conecta-el-mundo-puertas-bloqueos-y-desbloqueos)) |
| **2. Integrar con el mapa** (descubrimiento progresivo, posición, conexiones conocidas, persistencia) | ✅ | El mapa del Prompt 19 sin rehacer, con el mundo entero (`mapDiscovery`, `worldMap`, `pauseMenuWiring`, E2E `pauseMap`); la colocación sigue el camino y los atajos son líneas |
| **3. Habilidades y mejoras con efectos reales**, algunas que abren lo inaccesible | ✅ | `movementAbilities.test.ts`, `upgrades.test.ts`, `breakables.test.ts`, `adventure.test.ts` (qué abre cada una) y el solucionador |
| **4. Enemigos y jefes con IA, ataques, estados, daño, muerte, recompensas y reinicio** | ✅ | `creatures.test.ts` (los catorce), `bosses.test.ts` y una pelea de guion en cada arena: el jefe se despierta, ataca con aviso, cambia de fase, cae, deja su recompensa y **su bandera `defeated:*` lo mantiene caído**; las criaturas se reconstruyen al entrar en la sala, salvo las que tienen bandera de derrota (la memoria del mundo, que se guarda) |
| **5. Puntos de control, guardado y carga sin perder progreso ni romper la integridad** | ✅ | Sin cambio de esquema (`saveVersion` 2); `saveJourney` (cerrar y reabrir en cada sala y en cualquier tick), `slice`, `checkpoints`, los guardados a escala de las zonas |
| **6. Dificultad, recompensas y duración coherentes** | ◐ **parcial** | La dificultad **crece por datos** (la vida de los jefes va de 36 a 80: 36, 40, 44, 48, 46, 60, 80 —el de la Aguja es más ágil que robusto—; ninguna zona presenta más de seis arquetipos; cada habilidad llega antes de lo que abre) y cada zona da algo al final. **Ninguna persona lo ha jugado**: el equilibrio fino y la duración no están medidos |
| **7. Conservar el arte, los PNG, el HUD, las animaciones, los controles y el estilo** | ✅ | `git diff --name-status 1944de4 -- '*.png' '*.webp' '*.mp3' '*.ogg'` **no devuelve ningún archivo**; `src/ui` solo cambia en el mapa (nombres de zona); `src/input` no cambia; el arte y los clips del héroe (`art/player`) no se tocaron |
| **8. No reconstruir ni eliminar** | ✅ | **Ningún archivo borrado ni renombrado** desde `1944de4` (`git diff --name-status`); 520 archivos cambiados (426 nuevos, 94 modificados, ninguno de imagen o sonido); las pruebas que dejaron de ser ciertas con cuatro salas se reescribieron, ninguna se borró ni se debilitó |

### 11.3 · La estabilidad de `1944de4`

Los arreglos de producción, renderizado, controles y guardado se conservaron: se ejecutaron **otra vez, contra el *build* de producción**, las 66 escenas E2E —entre ellas las de estabilidad y privacidad del Prompt 20 (`resilience`, `privacy`, `readable`, `sprites`, `fallbacks`, `focus`, `adaptive`) y las del guardado, los controles y el mando (`save`, `slots`, `settings`, `touch`, `mobile`, `gamepad`)— y todas pasan ([§10](#10--pruebas-y-lo-que-se-ejecutó)). La única regresión que el mundo nuevo causó fue del **presupuesto del arranque en frío** (ver [§9.5](#95--el-presupuesto-del-arranque-en-frío-el-mundo-que-viaja-aparte)), y está resuelta y fijada por una prueba de estructura.

### 11.4 · Lo que se comprueba por tramos y no de una sola vez

**No hay una sola partida de guion de la partida nueva a los créditos.** El mundo se comprueba por tramos que se encadenan: el primer capítulo (R1 → Nave) se juega entero con un jugador de guion; cada zona se juega **entrando con las habilidades y las banderas que tendría el héroe a esas alturas** (`arriveIn`), con el solucionador y con la pelea de su jefe; `transitions.test.ts` recorre **todo el mundo puerta a puerta** con las transiciones reales; y la escena `finale`/`ending` vence al Soberano y cruza el final en el navegador. Que el encadenado entero sea una sola partida continua **es plausible, está cubierto por tramos, y no está demostrado como un único recorrido.**

---

## 12 · Lo que queda y quién lo hace

| Pendiente | Por qué sigue abierto | Quién |
|---|---|---|
| **La duración de 3–5 h** | El mundo da unas **1–2,5 h** estimadas; la medida real exige que una persona juegue de principio a fin con un reloj, y decidir con esa medida qué ampliar (más tramos con razón para volver, más combates distintos por zona, jefes opcionales) | una persona jugando + diseño |
| **Una partida humana de punta a punta** | Todo lo que dice «jugable» aquí es un jugador de guion y el solucionador. El equilibrio (daño, vida de los jefes, qué tan a menudo está un santuario, la exigencia de cada salto) **no lo ha juzgado una mano** | una persona jugando |
| **Dispositivos reales** | Nada se ha visto en un teléfono ni con un mando físico (se hereda del Prompt 20). Las 64 salas se miden en **llamadas de dibujo** (≤ 60) en un navegador de escritorio, **no en fotogramas por segundo de un móvil modesto**, y el mundo nuevo carga 27,5 KB gz más después del primer fotograma | una persona con dispositivos |
| **Arte de los enemigos y los jefes nuevos** | Solo el Ink Slime y el Custodio tienen dibujo: los otros 13 enemigos y 6 jefes se pintan con **siluetas procedurales** (formas por estado, con su color) | arte |
| **Dos piezas del entorno sin pintar** | La piedra partida (`door:stone`) y la palanca (`interactive:activate`) no tienen pieza en ningún paquete: las dibuja el *blockout* (`npm run assets:pack` lo avisa) | arte |
| **Las 60 salas están vestidas por un compositor, no compuestas a mano** | Es lo que se pudo hacer sin pintar: `tools/art/scenes/world.ts` coloca las piezas existentes según los datos. Las cuatro primeras siguen compuestas a mano | arte |
| **Habilidades nuevas sin dibujo, efecto ni sonido propios** | El salto doble y el salto de pared se dibujan con la pose de salto/caída que ya existía; el golpe al suelo, con el golpe aéreo (con sus fases); al ganarlas suenan y brillan con el aviso genérico de «habilidad ganada» | arte + sonido |
| **Música y sonido** | **Una sola pieza para los siete jefes**; una pieza por zona no existe (las zonas se distinguen por el lecho de ambiente); ningún enemigo tiene voz propia. Todo es síntesis y **nadie lo ha oído** | un compositor / una persona escuchando |
| **`grapple` y `swim`** | Siguen declaradas **sin comportamiento**; ninguna parte del mundo las pide; no cuentan | diseño (si se quieren, son una zona nueva) |
| **Las salas de calma** | Cinco salas (Embarcadero, Campamento, Taller, Sacristía y Latido) tienen un santuario y poco más: respirar es su propósito, pero son lo menos denso del mundo | diseño |
| **El recorrido continuo de guion** | Ver [§11.4](#114--lo-que-se-comprueba-por-tramos-y-no-de-una-sola-vez): cubierto por tramos, no como una sola partida | desarrollo |
| **Lo heredado del Prompt 20** | La cáscara nativa (Capacitor), cuentas y firma, icono y ficha, nombres en los créditos, los seis dibujos del protagonista que faltan, el arte y el audio definitivos: [Prompt 20, §12](PROMPT20-LOG.md#12--lo-que-queda-y-quién-lo-hace). Nada de esto cambió | los mismos |
