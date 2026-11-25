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

