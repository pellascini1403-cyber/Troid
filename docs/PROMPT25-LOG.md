# Prompt 25 — Auditoría integral y camino a producción

> Registro de trabajo, en el orden en que ocurrió: primero **medir y leer** (§2–§4), después **ordenar** (§5) y después **hacer** (§6). Lo que sigue es el estado real, no el plan.
> Leyenda de la evidencia: ✅ comprobado ejecutándolo en esta sesión · 🔎 medido (en este entorno: Chromium con GL por *software*, sin hardware físico) · 📖 leído en el código o en la CI, sin ejecutar · ❌ no existe.
> Cada hallazgo es un **fallo confirmado** (algo que falló y se vio fallar), un **riesgo potencial** (algo que puede fallar y no se ha visto fallar) o una **mejora opcional**: no se mezclan.

## 1. El mandato

Continuar F1–F7 (la rama `claude/troid-vertical-slice`, último commit informado `934a929`) llevando el proyecto hacia producción: estabilidad, rendimiento, arquitectura, jugabilidad, controles móviles, interfaz, guardado, audio, localización, accesibilidad, monetización, seguridad, pruebas, CI, distribución y documentación. Auditar **todo**, no solo lo que el encargo nombra; ordenar en P0–P3; ejecutar P0 y P1 en fases pequeñas, con pruebas, escenas reales, medida y documentación tras cada una; **no** ocultar fallos, **no** desactivar pruebas, **no** cambiar diseños aprobados, **no** declarar nada «listo» porque los tests estén verdes.

## 2. Cómo se obtuvo este diagnóstico

| Comprobación | Cómo | Resultado |
|---|---|---|
| Estado de la rama y de la CI | `git`, `gh run list` / `gh run view` | `934a929`; CI nº 149, 150 y 151 **en verde** (tres seguidas); las nº 142–148 en rojo: causas en §4.2 |
| Qué ocupa el arranque en frío | los mapas de fuentes de cada trozo del *build* (`dist/assets/*.map`) decodificados con un guion propio (`mappings` VLQ → bytes por módulo, repartidos en gzip por la razón del trozo) | §4.1 |
| Estabilidad de las pruebas | la suite completa con informe JSON (duraciones por prueba) y una segunda pasada con el límite por defecto **a la mitad** (`--testTimeout=2500`), para ver qué pruebas gastan casi todo su margen | §4.2 |
| Ciclos de dependencias y código muerto | un grafo de importaciones de `src/` (estáticas y dinámicas), componentes fuertemente conexos de Tarjan, alcanzabilidad desde `src/app/main.ts` | §4.3 |
| Coste de CPU de los rigs | el laboratorio (`?lab=rigs&crowd=10`), `RigActor.sync` por criatura y fotograma, las 34 especies | §4.14 |
| Texto cortado | un detector nuevo (`tools/e2e/fit.ts`) pasado por cada pantalla del menú y por lo que se dibuja sobre el juego, en dos idiomas y tres ventanas | §4.9 |
| Todo lo demás | lectura del código y de las bitácoras (PROMPT4–24), ejecución de los guiones de auditoría de §4 | cada apartado dice cuál |

**No medido, y por tanto no afirmado:** nada en un dispositivo físico (iOS, Android, mando, pantalla táctil real), ni el tiempo de un fotograma en un teléfono, ni batería ni temperatura, ni Safari de iPhone (el WebKit de CI es el de Linux). Los números de CPU de este entorno valen para comparar una versión con otra, no como cifras de un móvil.

## 4. Hallazgos (evidencia por área)

### 4.1 El presupuesto de arranque (✅🔎)

**Qué es.** `npm run bench:bundle` abre el *build* de producción en Chromium y suma, en gzip, todo el JavaScript que el navegador pide antes del momento en que el juego pide sus partes cosméticas (`troid:cosmetics`): el código de **el primer fotograma de R1**. El techo es 204 800 B (200 KiB, `docs/MIGRATION-2D.md` §9). Al empezar esta fase: **203 992 B, quedan 808 B (0,4 %)**. Un cambio de unas docenas de líneas en el primer fotograma rompía el *build*; los cuatro últimos prompts ganaron margen sacando código a *chunks* diferidos, y cada uno lo gastó.

**Qué lo ocupa** (gzip, repartido por módulo a partir de los mapas de fuentes; es una estimación por proporción, no una medida del compresor módulo a módulo):

| Parte | KB gz | % | Notas |
|---|---|---|---|
| **PixiJS 8** | ≈ 118 | 58 | los sistemas del renderizador (WebGL + lo compartido + el respaldo de canvas) 48,7; `scene/graphics` 19,6 (Graphics, GraphicsContext, `earcut`, rutas); `scene/container` 10,7; el lote 3,9; las máscaras 3,7; `@pixi/colord` 2,8; formas 2,6; `earcut` 2,3 |
| **el juego (`src/`)** | ≈ 79 | 39 | `app` 12,9 (`Game2D.ts` 9,4); `render` 9,1; `player` 7,8 (`PlayerController` 5,8); `gameplay` 7,7 (`GameSession` 4,7); `presentation` 6,6; `content` 5,5; `enemies` 5,4; `ui` 5,4; `input` 3,8; `i18n` 3,3; `save` 3,2; `core` 2,6; `assets` 2,6; … |
| el cargador de los trozos | ≈ 1 | 0,5 | `preload-helper` y lo mínimo |

**Lo que se descarga y el juego nunca usa en una sesión normal** (fallo confirmado de **inicialización innecesaria**, ✅ medido sobre el *build*):

| Qué | KB gz | Por qué está |
|---|---|---|
| Código **solo del respaldo de canvas** (adaptadores, `CanvasContextSystem`, `canvasUtils`, `CanvasGraphicsAdaptor`, `CanvasStencilMaskPipe`…) | ≈ 9,0 | el renderizador de canvas solo se usa si el navegador no da WebGL (Firefox sin GPU en la CI), pero el *chunk* `CanvasRenderer` es una dependencia **estática** del *chunk* `app`: el empaquetador puso allí `Graphics` (19 KB, que el juego sí usa) y arrastró consigo lo del canvas |
| El sistema de **`Assets`**, el resolvedor de rutas, la caché y los **spritesheets** de Pixi | ≈ 5,2 | `spritesheet/init` (efecto lateral de `pixi.js`) registra su analizador, y este arrastra a `Assets`; el juego no usa `Assets` ni `Spritesheet` en ningún sitio (`grep` sobre `src/`: ninguna coincidencia) |
| **`VideoSource`** y la detección del alfa del vídeo | ≈ 2,5 | `rendering/init` (efecto lateral) lo registra; el juego no usa vídeo |
| Código **de pruebas, de desarrollo y de *placeholders*** en el primer fotograma (`playerPlaceholder`, `TrainingDummy`, las salas de prueba, `placeholderAtlas`, `DrawCallCounter`, `FpsMeter`…) | ≈ 3,5 | están en los registros del primer fotograma (`content/core.ts`) |
| El catálogo del **idioma que no se usa** | ≈ 1,4 | `i18n/catalogs.ts` lleva los dos idiomas |
| Analizador de **SVG**, degradados y patrones de `GraphicsContext` | ≈ 4,1 | son importaciones estáticas de `Graphics`: no se pueden quitar sin tocar Pixi |

Suma de lo **recuperable sin tocar el comportamiento del juego**: ≈ 20 KB (10 % del techo). La ejecución (§6) recupera la parte que se puede recuperar con seguridad y fija una **protección automática** (§5, P1-1).

### 4.2 La integración continua (✅📖)

**Las siete rojas (nº 142–148), una a una** (`gh run view`):

| CI | Trabajo que falló | Causa | Estado |
|---|---|---|---|
| 142, 143, 144 | `check` → `npm test` | `tests/integration/bossesEmber.test.ts` no encontraba las miradas de los guardianes que F1 había sacado del primer fotograma (determinista); y en la 142 y la 144 además dos pruebas de `worldAudio` **agotaron los 5 s** por defecto de Vitest | la primera, corregida en F4; la segunda, **intermitente**, corregida en F7 (límite de 60 s) |
| 145, 146 | `e2e (play)`, `e2e (journey)` | llamadas de dibujo por encima del presupuesto de 60 (`rooms`, `fullrun`): los *rigs* costaban de 2 a 14 llamadas cada uno | corregido en F7 (las capas de luz) |
| 147 | `check` → `npm test` | solo las dos de `worldAudio` (tiempo agotado: ≈ 5 s de duración típica contra un límite de 5 s) | corregido en F7 |
| 148 | cuatro trabajos | sin WebGL el *chunk* de los rigs se rechazaba y la página no arrancaba; el presupuesto de dibujo | corregido en F7 |

**Lo que dice sobre el proceso** (riesgo, ✅): siete empujes seguidos en rojo sin que nadie lo viera (la CI se miraba al cerrar, no en cada fase); y la causa más repetida de rojo (`worldAudio`) **pasó en cuatro de las siete ejecuciones**: una prueba que pasa «casi siempre» es la peor, porque su rojo parece ruido.

**La suite**, medida (🔎): 274 archivos, 6 124 pruebas, **todas verdes** en una ejecución de referencia con informe JSON (≈ 11 min en esta máquina con otra tarea en marcha). Los archivos más lentos: `tools/intake.test.ts` (413 s, límites explícitos de 60–240 s), `integration/fullRun.test.ts` (395 s: cuatro semillas de ≈ 100 s con 600 s de límite), `tools/artRepo.test.ts` (222 s: dos pruebas de ≈ 105 s, que se pasaron de sus 120 s en F7 con la máquina ocupada y hoy tienen 300 s), `engineIndependence` (103 s de 240 s), `deadEnds` (79 s de 300 s), `pilotRoad`. Las pruebas de las zonas del mundo duran de 6 a 21 s con 300 s de límite. Todas las pruebas de más de 5 s tienen un límite explícito (si no, habrían fallado); el resto de la comprobación de márgenes —qué pruebas gastan casi todo el suyo— está en §4.2.1.

**Lo que la CI no corría** (fallo confirmado, ✅): `.github/workflows/ci.yml` corría **20 de las 69** escenas E2E; las otras 49 («la suite entera se corre a mano antes de un lanzamiento») no tenían guardián: `touch` falló en esta máquina ya en el commit anterior a todo el Prompt 24, y `player-art` solo se halló roja al correr la suite completa en el Prompt 23. Además `bench:bundle` solo corre dentro de los trabajos E2E (no en `check`), de modo que un presupuesto roto se ve después de la compilación, no antes.

### 4.3 Arquitectura y mantenibilidad (✅📖)

- **Ciclos de importación: ninguno** (✅). Un grafo de las importaciones de valor de los 377 archivos de `src/` (estáticas y dinámicas; las importaciones solo de tipos no cuentan, desaparecen al compilar) no tiene un solo componente fuertemente conexo. La prueba `tests/unit/architecture.test.ts` (29 pruebas) ya fija las capas: la simulación no importa la vista, `rigs` no entra en el primer fotograma, etc.
- **Código muerto:** diez archivos de `src/` no los alcanza nadie desde `main.ts`, y los diez son barriles `index.ts` o módulos solo de tipos (`SkillDefinition`, `EnemyBrain`, `SimEntity`, `PlayerDefinition`, `core/types`): no pesan en el *build*. Otros diez solo los usan herramientas o pruebas (no se envían). No hay código vivo huérfano.
- **Separación jugabilidad / vista / IA / combate / guardado / audio:** las costuras que el encargo nombra existen y están probadas: la simulación es de ticks fijos y no sabe de Pixi (`engineIndependence.test.ts` la repite con otras funciones trascendentes), las vistas **leen** estado (`ActorViewState`, los campos de vista de los jefes) y los resúmenes de `fullrun` comparan solo estado de simulación; el guardado es un modelo puro (`ProgressData`) sobre un almacén (`SafeStore`) sobre un adaptador (`StorageAdapter`: `localStorage` o `@capacitor/preferences`).
- **Lo que sí pesa** (riesgo, 📖): `Game2D.ts` es la pieza más grande del primer fotograma (9,4 KB gz) y concentra el montaje de todo (vistas, eventos, carga diferida, ciclo de vida); funciona y está cubierta por las escenas E2E, pero es el sitio donde un cambio toca más cosas a la vez. No se toca sin una razón técnica (§5, P3-4).
- **Fugas y recursos:** el ciclo de vida de `Game2D` registra cada escucha y cada recurso en `lifecycle` y lo suelta en `destroy`; `resilience` cuenta, tras 30 ciclos de arrancar y cerrar el juego, los *listeners* (`window` 33 → 33, `document` 4 → 4), los temporizadores (1 → 1) y los nodos del DOM (611 → 611), y el *heap* sube cada vez menos (0,77 → 0,47 → 0,30 MB: sin tendencia de fuga). Las capas de luz de F7 se sueltan solas al destruirse la criatura (una prueba lo fija).

### 4.4 Guardado, recuperación e integridad (✅📖)

El apartado que el encargo llama crítico es, con diferencia, **la parte mejor construida** del proyecto: no se encontró un fallo confirmado.

- **Escritura** (`SafeStore.put`): copia de seguridad `key.bak` del valor bueno anterior → se relee que la copia llegó → se escribe `key` → se relee → solo entonces se borra la copia. Si algo se detiene a la mitad queda una copia buena; una copia dañada no sustituye nunca a una buena. Las escrituras se **serializan** (dos cambios seguidos llegan en orden, gana el último) y una escritura de exactamente lo que ya hay no hace nada.
- **Lectura:** un valor ilegible se **conserva** como `key.corrupt` (nunca se tira) y se prueba la copia; si tampoco sirve, el juego empieza de cero y **dice** que no pudo leerlo (`inspect()` mira sin reparar: la pantalla de partidas no reescribe nada).
- **Versiones y migraciones:** `PROGRESS_VERSION = 2`; la cadena de migraciones (`1 → 2`) tiene fichero dorado; una versión **más nueva** que la del juego se aparta (nunca se pisa en silencio); un hueco en la cadena es «no se puede confiar» y no un intento.
- **Integridad de los datos:** `repairProgress` limpia lo leído **y** lo que está a punto de escribirse (tipos, nombres válidos, sin repetidos, números acotados, claves desconocidas fuera) y tiene límites dimensionados para un mundo (1 024 señales, 256 salas…) que una prueba del mundo comprueba; un lugar que el mundo ya no tiene no se cree (`restoreFromProgress`).
- **Dos pestañas** (`writeGuarded`): una página con una imagen vieja del valor se entera en vez de pisar lo que guardó la otra (escena `tabs`). **Almacenamiento lleno o bloqueado:** no lanza; el juego sigue en memoria, avisa una vez y la interfaz sabe si el almacenamiento es duradero (`isDurable`).
- **Cierres inesperados:** `pagehide` y `visibilitychange` vacían las escrituras pendientes (`gameSaves.ts`); lo más que se pierde en un cierre brusco es lo ocurrido desde la última entrada en una sala o descanso.
- **Duplicar recompensas / perder objetos:** habilidades, cartas, botellas y la señal de «cogido» van en **una** instantánea (`ProgressData`), de modo que no hay un estado intermedio guardado en el que el objeto esté dado y la señal no (o al revés). Los soak `progressSoak` y `storageSoak` (8 semillas) y `saveJourney` lo recorren.
- **Riesgos menores** (✅📖, ninguno P0): hay **una sola** copia `.corrupt` por clave (una segunda corrupción sobrescribe la primera: P2-3); un guardado de una versión más nueva en un juego más viejo queda apartado, pero el jugador pierde su continuidad hasta actualizar (aceptable: es un descenso de versión); y los guardados de las partidas (`slots`) usan la misma maquinaria, así que lo dicho vale para cada ranura.

### 4.5 Protagonista y animaciones (✅🔎)

- **Los 18 estados están en el juego** (12 de la dueña + 6 derivados en F5), con duraciones, fases y anclas de espada que la simulación mide (`heroContinuity.test.ts`).
- **«El segundo golpe repite el primero»** (el punto que el encargo señala): comprobado mirando los fotogramas de `attack1` (4) y `attack2` (5) uno junto al otro y el contenido de `SLASH_1`/`SLASH_2`. **Lo que sí los distingue:** el segundo golpe tiene su propio clip, otro arco del tajo (`slash_2`: rotación −0,7 → 0,4 contra 0,62 → −0,28 del primero, y el efecto «finisher» al encadenarlo), más parada de impacto (6 contra 4 ticks), más sacudida (0,14 contra 0,06), más empuje (9 contra 5) y **sin** el avance del primero (`lunge`). **Lo que no los distingue lo bastante:** los dos clips son el mismo cuerpo con la espada empujada hacia delante (el segundo es una deformación del primero, F5): a la vista, de lado y a 53 px/m, leen como «la misma estocada dos veces». Es una **mejora de pulido** (P2-1), no un fallo: se resuelve con movimiento procedimental y no con dibujos nuevos (§5).
- **Transiciones** (agacharse ↔ levantarse, ataque agachado, ataque aéreo, beber, recibir daño, morir, reaparecer): cubiertas por `crouch`, `death`, `resetMidDash`, `heroContinuity`, `playerAnim` y la escena `death`; sin un estado en el que el jugador quede sin control (`inputSoak`: 6 semillas de 4 000 ticks de entradas aleatorias).

### 4.6 Criaturas y guardianes: integración funcional (✅🔎📖)

- **Diseño:** completo y no se toca (24 criaturas y 10 guardianes con anatomía propia, F2–F4); las capas de luz compartidas de F7 se compararon contra el dibujo anterior en las 34 especies (cambia poco, y lo que cambia está dicho en `PROMPT24-LOG` §8).
- **Aparición, desaparición, muerte, respawn:** `creatures.test.ts` (las 24 criaturas con su cerebro), `enemySoak` (6 semillas), `enemyFall`, `bossWorld`, `bossesEmber`, `encounters*.test.ts` (cada guardián se gana con un héroe mortal) y las escenas `boss`, `boss-death`, `slime`. **Las criaturas no dan recompensa** (no hay moneda ni experiencia en este juego: lo que se gana son habilidades, cartas y botellas, atadas a salas y a guardianes), de modo que «recompensas de enemigos» no existe y no es un hueco.
- **Rendimiento con muchos enemigos:** una criatura con rig cuesta **0** llamadas de dibujo más (4 en total para 1 o 10, las 34 especies; F7) y **0,024 ms de CPU por criatura y fotograma** de media (la peor, 0,084 ms; diez de las peores a la vez: 0,46 ms de 16,7 ms) 🔎: la animación por código no es un riesgo. Sin medir queda el relleno de pantalla en una GPU móvil (las luces son *sprites* grandes y aditivos): §4.14.
- **Legibilidad de los avisos entre partículas, fondos y efectos** (✅ en lo visual, 🔎 en lo medido): los avisos de los guardianes se leen en las capturas de producción (anillos de aviso, halos que crecen, la silueta antes que el detalle); las partículas se presupuestan (300 por defecto, 150 en el perfil bajo) y ninguna escena las enfrenta a un aviso de forma automática. Es lo que más pediría una persona que juegue en un teléfono (§7).
- **Entre especies, las capas de luz** no producen errores visuales: la prueba `lights.test.ts` comprueba que **toda** la luz de las 34 especies está en las capas, y la comparación píxel a píxel con y sin capas no halló nada fuera de lo explicado en `PROMPT24-LOG` §8.
- **Hallazgo menor** (riesgo, 🔎): durante `fullrun` salen **ocho avisos distintos** `[world] "<criatura>" fell out of "<sala>" and was put back where it was placed` (p. ej. `ink_spitter25` en `rt_bridge`, `mire_toad41` en `mr_edge`): una criatura salió del mundo (un salto o un empuje hacia el vacío) y el sistema la devolvió a su sitio. Está resuelto con elegancia, pero indica sitios donde una criatura puede caerse: P2-2.

### 4.7 Combate y sensación de juego (✅📖)

- **Cobertura:** `combat`, `crouch`, `hazards`, `death`, `resetMidDash`, `spiritBolt`, `soak` (8 semillas de 6 000 ticks), `encounters` y `encountersEmber` (todos los guardianes ganables con un héroe mortal sin caerse), `pilotRoad`, `deadEnds` (no hay lugar del que no se pueda salir), la escena `combat` y `hazard`.
- **Qué mecánicas existen:** golpe de dos tiempos con cancelación (`cancelWindow`), golpe aéreo, golpe agachado, **dash con invulnerabilidad de 0,13 s** (8 ticks de 10; 0,42 s de enfriamiento), parada de impacto, empuje, aturdimiento, magia (Spirit Bolt), botellas y cartas. **No existen** (y por tanto no se auditan como si existieran): *parry* o bloqueo, durabilidad de armas, inventario más allá de cartas y botellas, ni misiones.
- **Justicia de los ataques** (medida sobre los datos, 🔎): los avisos (`startup`) de **todos los ataques de los guardianes son ≥ 28 ticks (467 ms)**, más de lo que cualquiera tarda en reaccionar. Entre las **criaturas**, el aviso medio es de 26 ticks (433 ms) y los más cortos son `toad_shock`/`magma_shock` (0: son la onda del **aterrizaje**, anunciada por un salto de 60 ticks, así que se lee), `shard_nip` (10 ticks, 167 ms, 1 de daño: la esquirla solo existe en una pelea), **`leech_bite` (12 ticks, 200 ms, 2 de daño)** y los dos murciélagos (16–18 ticks). Ninguno es imposible de esquivar —el dash tiene 8 ticks de invulnerabilidad y 14 de movimiento— pero **la sanguijuela es el único ataque con aviso por debajo del tiempo de reacción visual (≈ 250 ms) y con daño doble**: riesgo potencial P2-4, que se mide en una pelea antes de tocarlo (no se cambia la dificultad sin medir).
- **Sin un estado que deje al jugador sin control:** `inputSoak` (entradas aleatorias), `death` (flujo de derrota y reaparición), `resetMidDash`, y `deadEnds`.

### 4.8 Arenas y encuentros de jefes (✅📖)

Diez arenas; cinco ganaron repisas a 3 m en F6 (Pastor, Jardinero, Behemot, Soberano de Ceniza, Coloso); el Tirano de Raíces y la Matriarca ya tenían las suyas. **Lo que falta** es lo que `PROMPT24-LOG` §7 ya dice: elementos destructibles, elementos interactivos y cambios de arena por fase. Es **mejora** (P2-5/P3), no fallo: cada guardián se gana hoy con las reglas de su arena, `encountersEmber.test.ts` fija esas reglas y añadir una mecánica de arena obliga a volver a ganarlas todas. La decisión de qué arena merece qué mecánica está en §5 (P2-5): cuatro de las diez ganarían con **una sola** cosa cada una (no con todas).

### 4.9 Controles, interfaz y experiencia de usuario (✅🔎)

- **Controles táctiles:** la escena `mobile` mide, en el DOM de la página real (Chromium con `isMobile` y `hasTouch`), siete clases de ventana —del móvil pequeño de 667×375 a la tableta 4:3— con las zonas del sistema (muesca, isla, indicador de inicio): cada botón ≥ 44 px, dentro del área segura, sin pisar al resto, al HUD ni al botón de pausa; la zona de movimiento conserva un tramo útil; y con **multitáctil real** por el protocolo (un dedo corriendo, un segundo en Atacar, luego Dash, Habilidad y botella) cada botón responde en su sitio y nada queda pulsado. `touch` recorre el movimiento, el salto (barrido hacia arriba, mantenido y corto), agacharse con su histéresis, el descenso por plataformas y el multitáctil entre los tres botones. **Los botones son configurables** (tamaño 70–150 %, posición libre, escala 80–140 %, opacidad 30–100 %, intercambio de manos; `touchEditor`). **Lo que no dice, y la escena lo dice:** nada sobre una mano, un pulgar o una pantalla real (las ventanas son *clases* de píxeles CSS).
- **Texto cortado** (✅, hallazgo de cobertura): `readable` comprobaba el contraste y el tamaño mínimo de letra pero **nada comprobaba que el texto cupiera**; F-A0 añade `tools/e2e/fit.ts` y la escena `textFit`. Resultado medido contra producción: **ningún texto cortado** en las 6 pantallas del menú (es/en, escritorio, móvil horizontal y vertical), en el HUD, en las barras de los once guardianes (el nombre más largo es «Soberano del Corazón de Tinta») ni en el aviso de las once habilidades, en 3 ventanas (el móvil más pequeño, uno corriente y un escritorio): 46 textos por combinación. El detector se comprobó contra cortes hechos a propósito.
- **Cámara, pausa, mapa, ajustes, perfil, guardados, mando en los menús, orientación, pérdida del foco, desconexión del mando:** `pause`, `pauseMap`, `pauseZone`, `settings`, `slots`, `focus`, `camera`, `vertical`, `gamepad`, `accessibility`, `language`: todas en verde (✅ 47 de 47 escenas locales, F7).
- **Lo que no se pudo ver** (§7): el pulgar sobre un cristal, el menú con la muesca de verdad, la nitidez de los PNG reducidos en una pantalla de 3×, el desplazamiento del menú en un teléfono.

### 4.10 Audio (✅📖)

82 sonidos y 8 piezas de música, **todos sintetizados en este repositorio** (`npm run audio:build`): «audio de pre-producción», sin instrumentos grabados, voces ni *foley* (la bitácora del Prompt 18 lo dice y sigue siendo verdad). Hay un motor con presupuesto de voces, mezcla por buses (general, música, efectos, ambiente), fundidos entre zonas, transiciones de música por jefe, liberación de recursos por sala (≤ 52 MiB por sala: `worldAudio.test.ts` lo comprueba en las 108 salas) y la escena `audio` (decodificación sin huecos, contexto que solo arranca con una tecla). **Lo que no existe:** un sonido propio para cada una de las 24 criaturas y 10 guardianes nuevos (reutilizan los de su arquetipo), ni música de las cuatro zonas de la segunda mitad. **Provisional y dicho:** todo el audio (P2-6/P3-1).

### 4.11 Contenido y progresión (✅📖)

- **Mundo:** 11 zonas, 108 salas, 11 guardianes (todos colocados), 25 enemigos (todos colocados salvo `crystal_shard`, que **nace** de la esquirla al partirse el `shardling`: no es un hueco), 15 habilidades y reliquias. La auditoría del solucionador de cada zona, el piloto que cruza cada sala, `deadEnds` (no hay lugar del que no se pueda salir), `worldRooms`, `progressionOrder` y `fullrun` (56 min de partida de guion de la partida nueva a la salida del mundo, repetida bit a bit en el navegador, 4 051 resúmenes iguales) prueban que **todo lo alcanzable se alcanza y que todo guardián se vence**.
- **Declarado y sin conectar** (✅, inerte, P3-2): `grapple` y `swim` están en `content/abilities.ts` con `implemented: false`; ninguna sala ni habilidad las concede ni nada las lee. No pueden aparecer ante el jugador: son una costura declarada para el futuro (el código de guardado y de interfaz ya podría nombrarlas).
- **Misiones, objetivos, inventario:** el juego **no tiene** misiones ni inventario (lo que se posee son habilidades, cartas y botellas); «misiones que no se pueden completar» no es un riesgo de este proyecto. La progresión es el orden de habilidades del mundo, que `progressionOrder` comprueba.
- **Ritmo y orientación del jugador** (riesgo, sin medir en personas): la partida de guion tarda 53–56 min y la duración humana **no se ha medido** (Prompt 23: «una cota inferior; el factor de 3 a 5 es una hipótesis»); que un jugador se quede sin saber qué hacer **no se ha podido comprobar sin personas** y es la medida más valiosa que falta (`npm run session:report` está hecho para recibirla).

### 4.12 Localización y accesibilidad (✅📖)

- **Idiomas:** español e inglés. Los catálogos tienen las mismas claves en los dos (`catalogs.test.ts`), todo lo referenciado en el código existe (`keyReferences.test.ts`), la página de fallo de arranque lleva los dos idiomas en el HTML, y la escena `textFit` comprueba además que **ninguna clave interna se lee en pantalla** (nombre de guardián, nombre de habilidad). No hay cadenas de interfaz escritas a mano fuera de los catálogos (búsqueda sobre `textContent`, `aria-label`, `title`, `placeholder`). Formatos de número: no hay (solo enteros en el HUD).
- **Accesibilidad que existe:** menos destellos, sin sacudida de cámara, tamaño del HUD (85–135 %), valores por defecto que siguen a `prefers-reduced-motion`, contraste WCAG 4,5:1 / 3:1 y letra mínima de 11 px **comprobados** en cada pantalla (`readable`), mando en todos los menús, botones táctiles configurables, aviso de girar el dispositivo, pausa al perder el foco. **Lo que no existe** (P2/P3): modo para daltonismo, subtítulos (no hay voz; los sonidos no llevan texto), tamaño de texto general más allá del HUD, alternativa a mantener pulsado, lector de pantalla para el juego (las pantallas sí llevan roles y texto para lectores).

### 4.13 Monetización y publicación (✅📖)

- **Monetización: no existe, por decisión** (`docs/PUBLISHING.md` §3): sin anuncios, sin compras, sin analítica, sin cuentas; ni SDK, ni proveedor de prueba, ni abstracción de «derechos» en el guardado. Por tanto **no hay nada que simular ni que verificar** y **no se afirma nada**: compras dentro de la aplicación, restauración, validación, anuncios recompensados, protección de compras duplicadas, consentimiento y tienda son **integraciones por hacer** y requieren una **decisión de negocio** primero. Lo que sí hay para cuando se tome: un guardado versionado y reparable (un derecho comprado cabría en `ProgressData` con una migración), un almacenamiento nativo (`@capacitor/preferences`) y la escena `privacy`, que prueba que hoy no sale **ningún** dato.
- **Publicación:** **no hay cáscara nativa** en el repositorio (ni `capacitor.config`, ni `ios/`, ni `android/`): `docs/PUBLISHING.md` §6 dice cómo crearla y qué hace el juego solo al detectarla (guardado nativo, botón Atrás de Android = pausa, segundo plano = pausa). Faltan, y **no los tengo ni puedo inventarlos**: el identificador de la aplicación, cuentas de desarrollador de Apple y Google, firma (certificados, `keystore`), iconos y fichas de tienda, política de privacidad alojada, nombres para los créditos, y las **herramientas** (Xcode no existe en este entorno; no hay SDK de Android). Esto es lo único que hoy **impide publicar**, y es externo (§7).

### 4.14 Rendimiento (🔎)

- **Dibujo:** presupuesto de 60 llamadas por fotograma; con las capas de luz de F7, la peor de las 108 salas es **16**, la partida completa de 56 min **23** y las peleas de los diez guardianes **16** (la CI midió lo mismo).
- **CPU del JavaScript del juego:** la escena `cost` mide lo que el código del juego tarda por fotograma en la pelea contra el Custodio de Tinta, con la CPU a ×1, ×4 y ×6 (`Emulation.setCPUThrottlingRate`): da el margen que queda sobre 16,7 ms; **no** dice que un teléfono llegue a 60 fps (no hay teléfono). Los *rigs* (34 especies) cuestan **0,024 ms por criatura y fotograma** de media 🔎.
- **Perfiles de calidad que existen:** `low` (resolución ≤ 1,25, 150 partículas), `medium` (≤ 1,75, 300), `high` (≤ 2); `auto` empieza en `medium` y **baja una vez a `low`** si el 80 % de los fotogramas de 4 s tardan más de 24 ms (< 41 fps), nunca vuelve a subir y no guarda el cambio (`qualityGovernor.ts`, probado en `adaptive`). **Lo que no existe:** un modo de **30 fps** que dibuje a mitad de frecuencia (ahorra batería y calor en un móvil que no llega a 60) —P2-7— ni una medida de batería o temperatura (requiere dispositivo).
- **Memoria:** `fullrun` mide el *heap* de toda la partida (16 → 16 MB de pico 16 en la CI), las salas se atienen a 40 MiB de arte y el audio a 52 MiB por sala (pruebas lo comprueban).

### 4.15 Seguridad y robustez (✅📖)

- **Superficie:** el juego no usa red (`privacy`: «127 peticiones, todas a 127.0.0.1; sin *beacon*, sin *socket* a terceros, sin *cookie*, sin IndexedDB, sin *service worker*; en `localStorage` solo `troid.progress` y `troid.settings`»); no hay `eval`, `new Function` ni `innerHTML =` en `src/` fuera de laboratorios y depuración. **Datos de entrada:** el guardado se valida y repara al leer **y** al escribir (§4.4); un archivo de partida importado pasa por el mismo `parseProgress`.
- **Fallos de inicialización:** la página de «no se pudo arrancar» (bilingüe, con reintento), el arranque con el arte rechazado o que no llega (la escena `boot`: el juego arranca como *blockout* a los 3 s o a los 11 s), el respaldo de canvas sin WebGL (ahora con las criaturas con sus formas, F7), la pérdida del contexto WebGL (`resilience`) y un fotograma que lanza (el bucle lo salta y avisa tras una racha: `GameLoop.failed`).
- **Sin política de seguridad de contenido (CSP)** (riesgo bajo, mejora, P3-3): `index.html` no declara una, y añadirla **no es gratis**: Pixi construye funciones con `Function(...)` para sincronizar uniformes (visible en el *build*: `RenderTargetSystem`), así que `script-src 'self'` sin `'unsafe-eval'` rompería el renderizado salvo que se importe `pixi.js/unsafe-eval` (más bytes en el primer fotograma). Se documenta y se deja para cuando haya cáscara nativa.

