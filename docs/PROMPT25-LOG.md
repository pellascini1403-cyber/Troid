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

## 3. Resumen ejecutivo

**El juego es, por dentro, sólido; lo que le falta para producción es casi todo externo.** Revisadas las cinco condiciones de «crítico» (pérdida de progreso, bloqueo, corrupción, fallo de arranque, imposibilidad de publicar), **ninguna se cumple dentro del código**: el guardado es la parte mejor construida (§4.4), la simulación es determinista y se repite bit a bit en el navegador (§4.7, §4.11), no hay ciclos de importación ni fugas medibles (§4.3) y cada fallo de arranque que se pudo provocar tiene una salida (§4.15). **Lo único que hoy impide publicar es externo** (§5 P0-1, §7.3): no hay cáscara nativa ni cuentas, certificados, identificadores, iconos de marca, política de privacidad alojada ni dispositivos físicos.

**Lo que sí estaba mal, y se vio fallar** (fallos confirmados):

| Hallazgo | Evidencia | Estado |
|---|---|---|
| El arranque en frío estaba a **808 B** (0,4 %) del techo y cada fase gastaba el margen de la anterior | `bench:bundle`, mapas de fuentes (§4.1) | ✅ **7 500 B de margen** sin subir el techo (P1-1) |
| La CI corría **20 de 69** escenas E2E; el resto no tenía guardián | `.github/workflows/ci.yml` (§4.2) | ✅ las 69, en ocho grupos balanceados (P1-2) |
| Al entrar en la CI, una de las 49 escenas olvidadas resultó **roja en el corredor y verde en local** (`arrival`) | CI nº 154, 155 y 156 (§4.2.1, §6) | ⏳ en curso: la escena ya dice qué vio al fallar (`b3eb312`); la causa está en §6 |
| Tres pruebas gastaban más de la mitad del límite por defecto y una de ellas (`worldAudio`) falló en 3 de las 7 CI rojas | pasada con el límite a la mitad (§4.2.1) | ✅ límite de 15 s, ninguna prueba tocada (P1-3) |
| La CI no dejaba evidencia de un rojo, no acotaba un trabajo colgado y acoplaba el presupuesto a las escenas | `ci.yml` y `run.ts` (§4.2) | ✅ capturas, plazo por escena, límites y trabajo `budget` (P1-4) |
| **Nada comprobaba que el texto cupiera en su caja** | no existía detector (§4.9) | ✅ detector y escena `textFit`: ningún texto cortado hoy (P1-5) |
| Siete empujes seguidos en rojo sin que nadie lo viera | CI nº 142–148 (§4.2) | ✅ práctica adoptada: se mira la CI en cada fase (P1-6) |

**Riesgos potenciales** (algo que puede fallar y no se ha visto fallar): criaturas que se salen del mundo (8 avisos en `fullrun`, P2-2); una sola copia `.corrupt` por clave (P2-3); `leech_bite` con aviso de 200 ms y 2 de daño (P2-4); el sonido no arranca con un mando solo y no lo dice (P2-8); sin modo de 30 fps (P2-7); accesibilidad incompleta (P2-9); dos avisos de seguridad de gravedad alta en dependencias **de desarrollo** (P2-14); la CSP exige `unsafe-eval` por Pixi (P3-3).

**Mejoras** (ni fallo ni riesgo): el segundo golpe del combo se leía como el primero (✅ P2-1, solo presentación); una arena piloto con una pieza que añada una decisión (P2-5); audio propio de las 34 especies (P2-6); cobertura como herramienta (P2-11); mapas de fuentes fuera del paquete (P2-12); iconos para instalar la versión web (P2-13).

**Lo que esta auditoría no pudo ver** (§7.2): nada en un dispositivo físico, ni a una persona jugando: fotogramas por segundo en un móvil, batería, el pulgar sobre el cristal, el audio de iOS, un mando físico. Una CI en verde y 6 mil pruebas verdes **no** dicen que el juego esté listo para publicarse.

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

#### 4.2.1 Márgenes de las pruebas, dependencia del tiempo y diferencias entre la CI y local (✅🔎)

- **Cómo se midió:** dos pasadas de la suite completa con informe JSON: la de referencia (6 124 pruebas, todas verdes) y otra con el límite por defecto **a la mitad** (`--testTimeout=2500`), que suspende las pruebas que ya gastan más de la mitad de su límite.
- **Resultado:** la pasada con el límite a la mitad suspende **tres** pruebas —`noTopLevelAwait` (3,1 s), `hudArt` (3,0 s) y `intake` «una pose dibujada a otra escala» (2,6 s)—, entre el 52 y el 62 % de los 5 s por defecto; con una máquina más ocupada pasaban de los 5 s. El límite por defecto sube a **15 s** (margen ≥ 4,8× para esas tres) y **ninguna prueba se toca**. Hay 57 pruebas de más de 2,5 s y todas las de más de 5 s tienen un límite explícito.
- **Las más lentas y su margen** (duración de referencia / límite explícito): `intake` 123 s / 240 s (1,9×), `artRepo` 112 s / 300 s (2,7×), `engineIndependence` 103 s / 240 s (2,3×), `fullRun` 102 s / 600 s (5,9×), `spire` 21 s / 300 s. Con la instrumentación de cobertura de V8 y la máquina ocupada con otras tareas —una condición hostil a propósito— **ocho pruebas pasaron de su límite** (`engineIndependence`, `artRepo` y seis de `intake`, dos de ellas con el límite por defecto de 15 s); todas son de cálculo puro de CPU, ninguna de espera: el margen práctico de esas tres familias es de **2 a 3 veces**, no más. En la CI (sin cobertura) el trabajo `check` entero —instalación, tipos, suite y *build*— tarda **9,3–10,8 min** en cinco ejecuciones seguidas.
- **Dependencia del tiempo en las pruebas unitarias y de integración:** `Math.random()` 0 usos, `new Date()` 0, `Date.now()` en 2 archivos (3 usos), `useFakeTimers` en 3; el juego tampoco usa `Math.random()` en la simulación (un solo uso en `src/`, una marca de comprobación del guardado nativo). Es decir, **la suite no depende del reloj de pared**: lo que la hace lenta es el cálculo, no la espera.
- **Dependencia del tiempo en las escenas E2E:** 253 `waitForTimeout` en 65 archivos y 50 `Date.now()` en 19: esperas fijas para que se dibuje un fotograma, más unas pocas escenas que miden tiempo real **por diseño** (`arrival`, `focus`, `resilience`, `boot`). En el corredor, el tiempo de una misma escena varió **de una a dos veces** entre ejecuciones (`resilience` 244–492 s, `focus` 145–312 s, `pauseMap` 133–269 s), de modo que cualquier espera fija es un riesgo y cualquier aserción sobre cuántos fotogramas caben en un intervalo, también.
- **Diferencia entre la CI y local, hallada:** al entrar en la CI las 49 escenas que corrían a mano, **una resultó roja en el corredor y verde en local**: `arrival` (sección D, la espera que se rinde: «the indicator told the player the game was waiting, not frozen»), tres ejecuciones de tres. Pasa en esta máquina también con **un solo núcleo**, con la máquina cargada y tras `progression` y `transition`; está en §6 con su causa.
- **Lo que no cambia el valor de una prueba verde:** que una prueba pase una vez no la hace estable; por eso las cifras de §6 son de varias ejecuciones y los tiempos de los grupos se midieron en cinco.

### 4.3 Arquitectura y mantenibilidad (✅📖)

- **Ciclos de importación: ninguno** (✅). Un grafo de las importaciones de valor de los 377 archivos de `src/` (estáticas y dinámicas; las importaciones solo de tipos no cuentan, desaparecen al compilar) no tiene un solo componente fuertemente conexo. La prueba `tests/unit/architecture.test.ts` (29 pruebas) ya fija las capas: la simulación no importa la vista, `rigs` no entra en el primer fotograma, etc.
- **Código muerto:** diez archivos de `src/` no los alcanza nadie desde `main.ts`, y los diez son barriles `index.ts` o módulos solo de tipos (`SkillDefinition`, `EnemyBrain`, `SimEntity`, `PlayerDefinition`, `core/types`): no pesan en el *build*. Otros diez solo los usan herramientas o pruebas (no se envían). No hay código vivo huérfano.
- **Separación jugabilidad / vista / IA / combate / guardado / audio:** las costuras que el encargo nombra existen y están probadas: la simulación es de ticks fijos y no sabe de Pixi (`engineIndependence.test.ts` la repite con otras funciones trascendentes), las vistas **leen** estado (`ActorViewState`, los campos de vista de los jefes) y los resúmenes de `fullrun` comparan solo estado de simulación; el guardado es un modelo puro (`ProgressData`) sobre un almacén (`SafeStore`) sobre un adaptador (`StorageAdapter`: `localStorage` o `@capacitor/preferences`).
- **Lo que sí pesa** (riesgo, 📖): `Game2D.ts` es la pieza más grande del primer fotograma (9,4 KB gz) y concentra el montaje de todo (vistas, eventos, carga diferida, ciclo de vida); funciona y está cubierta por las escenas E2E, pero es el sitio donde un cambio toca más cosas a la vez. No se toca sin una razón técnica (§5, P3-4).
- **Calidad del código** (✅📖): 379 archivos de `src/`, 319 de `tests/` y 198 de `tools/`, todos en TypeScript con `strict`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, `noFallthroughCasesInSwitch` y `verbatimModuleSyntax` (el `typecheck` cubre `src`, `tests`, `tools` y la configuración). **No hay linter ni formateador** (solo `.editorconfig`): las reglas de estructura las hacen cumplir pruebas propias (`architecture.test.ts`, 29 pruebas; `noTopLevelAwait.test.ts`; `keyReferences.test.ts`). No es un fallo —la base es coherente—, pero nada impide hoy que un estilo se desvíe (P3-9).
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

Diez arenas; cinco ganaron repisas a 3 m en F6 (Pastor, Jardinero, Behemot, Soberano de Ceniza, Coloso); el Tirano de Raíces y la Matriarca ya tenían las suyas. **Lo que falta** es lo que `PROMPT24-LOG` §7 ya dice: elementos destructibles, elementos interactivos y cambios de arena por fase. Es **mejora** (P2-5/P3), no fallo: cada guardián se gana hoy con las reglas de su arena, `encountersEmber.test.ts` fija esas reglas y añadir una mecánica de arena obliga a volver a ganarlas todas. La decisión de qué arena merece qué mecánica está en §5 (P2-5): como mucho **una** arena piloto, y solo si da una decisión que hoy no existe.

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
- **Dependencias** (✅ `npm audit`): las **de producción** (`pixi.js`, la única) **0 vulnerabilidades**; las **de desarrollo**, **2 avisos de gravedad alta** que no se envían en el juego: `vite` 8.3.0–8.3.2 (el servidor de desarrollo: ejecución de *scripts* de otro origen por un *middleware* propio, lectura de archivos fuera de `server.fs.allow`, y `launch-editor`; el juego publicado no lleva el servidor) y `happy-dom` ≤ 21.0.3 (ejecución de código del anfitrión y SSRF al interpretar HTML **no confiable**: las pruebas solo interpretan el HTML del propio juego). La exposición real es la de quien desarrolla: `npm run dev:lan` (`vite --host`) abre el servidor de desarrollo a la red local. Arreglo: `npm audit fix` sube `vite` y `rolldown` sin rotura (en el archivo de bloqueo: 8.3.2 → ≥ 8.3.3, rolldown 1.2.12 → 1.2.19), pero toca el empaquetador del *build* y exige volver a medir el arranque (P2-14); `happy-dom` 21 es un cambio mayor.
- **Fallos de inicialización:** la página de «no se pudo arrancar» (bilingüe, con reintento), el arranque con el arte rechazado o que no llega (la escena `boot`: el juego arranca como *blockout* a los 3 s o a los 11 s), el respaldo de canvas sin WebGL (ahora con las criaturas con sus formas, F7), la pérdida del contexto WebGL (`resilience`) y un fotograma que lanza (el bucle lo salta y avisa tras una racha: `GameLoop.failed`).
- **Sin política de seguridad de contenido (CSP)** (riesgo bajo, mejora, P3-3): `index.html` no declara una, y añadirla **no es gratis**: Pixi construye funciones con `Function(...)` para sincronizar uniformes (visible en el *build*: `RenderTargetSystem`), así que `script-src 'self'` sin `'unsafe-eval'` rompería el renderizado salvo que se importe `pixi.js/unsafe-eval` (más bytes en el primer fotograma). Se documenta y se deja para cuando haya cáscara nativa.

## 5. El plan priorizado (P0 → P3)

Cada tarea dice: **problema · evidencia · archivos y sistemas · consecuencia para el jugador · dependencias · solución propuesta · cómo comprobar**; la prioridad está en el encabezado y el estado (✅ hecho en esta sesión con el *commit* · ⏳ en curso · ⛔ bloqueado por algo externo · ◻ sin empezar).
Criterio de prioridad: **P0** = pérdida de progreso, bloqueo, corrupción, fallo de arranque o imposibilidad de publicar; **P1** = hace falta antes de producción; **P2** = calidad y pulido; **P3** = futuro. Revisadas las cinco condiciones de P0 contra el código, **ninguna se cumple dentro del repositorio** (§4.4, §4.15, §4.11); la única es la última, y es externa.

### P0 — críticos

#### P0-1 · No se puede publicar: no hay cáscara nativa ni los insumos de quien publica — ⛔ externo
- **Problema:** el repositorio contiene un juego completo y probado **como página web**; no contiene proyecto de iOS ni de Android, ni nada de lo que exige una tienda.
- **Evidencia:** no existen `capacitor.config.*`, `ios/` ni `android/` (✅ `ls`); no hay Xcode ni SDK de Android en el entorno; `docs/PUBLISHING.md` §6 lo dice y es verdad (§4.13).
- **Archivos / sistemas:** `docs/PUBLISHING.md` §6 (los pasos), `src/app/native*` (la costura: guardado nativo, botón Atrás, segundo plano — ya escrita y probada con un doble), futuros `capacitor.config.ts`, `ios/`, `android/`.
- **Consecuencia para el jugador:** hoy solo puede jugar abriendo una página alojada; no puede instalarlo desde ninguna tienda.
- **Dependencias** (todas **externas**, §7): identificador de la aplicación, cuentas de desarrollador de Apple y de Google, certificados y *keystore*, iconos y fichas de tienda, política de privacidad alojada, nombres para los créditos, un Mac con Xcode, Android Studio con su SDK y **dispositivos físicos**.
- **Solución propuesta:** seguir `docs/PUBLISHING.md` §6 con esos insumos (`npx cap add ios|android`, `npx cap sync`), y recorrer la lista de comprobaciones en dispositivo de §6.3. **No se inventa ninguno de los insumos ni se crea la cáscara con valores falsos**: un identificador provisional acabaría en una ficha de tienda.
- **Cómo comprobar:** el juego instalado en un iPhone y en un Android reales, con la lista de §6.3 de `PUBLISHING.md` (audio con el interruptor de silencio, muesca, retomar desde segundo plano, botón Atrás) y `npm run bench:bundle` contra el *build* que se empaqueta.

### P1 — necesario antes de producción

#### P1-1 · El arranque en frío estaba a 808 B del techo, y cada fase gastaba el margen de la anterior — ✅ `9cb5fd7`
- **Problema:** 203 992 B de 204 800 B (0,4 %); ≈ 20 KB de lo que viajaba en el primer fotograma no lo usa el juego (§4.1).
- **Evidencia:** los mapas de fuentes del *build* (§4.1); `npm run bench:bundle` (arranque medido en Chromium real).
- **Archivos / sistemas:** `tools/build/pixiDiet.ts` (nuevo), `vite.config.ts`, `tools/bench/bundle.ts`, `tests/unit/app/pixiDiet.test.ts` (nuevo), `.github/workflows/ci.yml`.
- **Consecuencia para el jugador:** un primer fotograma más pesado tarda más en una conexión lenta de móvil; y cada cambio pequeño del código del primer fotograma rompía el *build* (o empujaba a subir el techo, que es lo que esta tarea **no** hace).
- **Dependencias:** ninguna.
- **Solución propuesta (ejecutada):** (a) un *plugin* de Vite, solo en `build`, que responde dos importaciones de efecto lateral de Pixi (`rendering/init`, `spritesheet/init`) con módulos más pequeños: sin el cargador de *spritesheets* y su `Assets`, sin `VideoSource`; (b) una **reserva de 4 KiB**: el banco falla si el arranque entra en ella, no solo si pasa del techo; (c) el presupuesto en un trabajo de CI propio (P1-4); (d) el techo no se toca.
- **Cómo comprobar:** `npm run build && npm run bench:bundle` → **196 957 B, quedan 7 843 B** (3 747 B antes de la reserva); `npx vitest run tests/unit/app/pixiDiet.test.ts` (falla si Pixi cambia lo que registran esos módulos); escenas `boot`, `rooms`, `room-art`, `render`, `sprites`, `player-art`, `lava` y `resilience` contra el *build* recortado: **8 de 8**.

#### P1-2 · La CI corría 20 de las 69 escenas E2E — ✅ `75ba403`
- **Problema:** 49 escenas («se corren a mano antes de un lanzamiento») no tenían guardián (§4.2).
- **Evidencia:** `touch` roja ya antes del Prompt 24; `player-art` hallada roja solo al correr todo.
- **Archivos / sistemas:** `tools/e2e/registry.ts`, `tools/e2e/groups.ts`, `tools/e2e/run.ts` (`--group=`), `.github/workflows/ci.yml`, `tests/unit/tools/e2eGroups.test.ts`.
- **Consecuencia para el jugador:** un fallo de controles táctiles, de arte, de un jefe o de las puertas podía llegar a una versión sin que nada lo viera.
- **Dependencias:** ninguna.
- **Solución propuesta (ejecutada):** un registro único de escenas, grupos que corren en paralelo y una prueba unitaria que **falla** si una escena no pertenece a exactamente un grupo o si el *workflow* no corre un grupo. Primero cinco grupos (`75ba403`); al medir la CI cinco veces seguidas, el tiempo de un grupo varió entre una y dos veces de una ejecución a otra (`interface` de 18,8 a 37,6 min, `play` de 15,4 a 28,3) y el límite de 60 min quedaba a un 63 % de la peor, así que se repartieron por el tiempo medido en **ocho** (`play`, `pause`, `stability`, `journey`, `controls`, `saves`, `art`, `fights`; 5–16 min de escenas cada uno; `ab182e0`).
- **Cómo comprobar:** `npx vitest run tests/unit/tools/e2eGroups.test.ts`; `npm run test:e2e -- --prod --group=<nombre>`; los ocho trabajos de la CI (§6).

#### P1-3 · Las pruebas con el límite por defecto de 5 s fallaban según la carga — ✅ `2eed8c7` (los límites explícitos de `worldAudio` y `artRepo`), `9cb5fd7` (el límite por defecto)
- **Problema:** una prueba que pasa «casi siempre» es la peor: su rojo parece ruido. `worldAudio` falló en 3 de las 7 ejecuciones rojas (§4.2).
- **Evidencia:** una pasada de la suite con el límite **a la mitad** (`--testTimeout=2500`) suspende tres pruebas que ya gastan más de la mitad de los 5 s: `noTopLevelAwait` (3,1 s), `hudArt` (3,0 s) y `intake` «una pose dibujada a otra escala» (2,6 s).
- **Archivos / sistemas:** `vitest.config.ts`, `tests/unit/audio/worldAudio.test.ts`, `tests/unit/tools/artRepo.test.ts`, `tests/helpers/zone.ts`.
- **Consecuencia para el jugador:** ninguna directa; indirecta: un rojo intermitente enseña a ignorar la CI.
- **Dependencias:** ninguna.
- **Solución propuesta (ejecutada):** límite por defecto de **15 s** (con justificación en el archivo de configuración) y límites explícitos y dimensionados en las pruebas lentas (60–300 s); ninguna prueba se desactiva ni se relaja.
- **Cómo comprobar:** `npx vitest run --testTimeout=7500` (la mitad del nuevo límite) debe pasar entera.

#### P1-4 · La CI no dejaba evidencia, no acotaba nada y acoplaba el presupuesto a las escenas — ✅ `97461f7`
- **Problema:** un rojo que solo ocurre en el corredor (GL por *software*, más lento que cualquier máquina de desarrollo) solo dejaba el mensaje de la aserción; un trabajo colgado se cortaba a la hora sin decir qué escena era; el presupuesto de arranque era el primer paso de los cinco trabajos E2E y, gastado, los detenía antes de que corrieran sus escenas.
- **Evidencia:** `.github/workflows/ci.yml` antes de este cambio (§4.2); el ejecutor `tools/e2e/run.ts` no guardaba nada al fallar.
- **Archivos / sistemas:** `.github/workflows/ci.yml`, `tools/e2e/run.ts`, `tools/e2e/deadline.ts` (nuevo), `tests/unit/tools/ciWorkflow.test.ts` y `deadline.test.ts` (nuevos).
- **Consecuencia para el jugador:** ninguna directa.
- **Dependencias:** ninguna.
- **Solución propuesta (ejecutada):** plazo por escena (1 500 s por defecto: falla con su nombre y las siguientes se siguen corriendo); al fallar, la pila, los errores de la consola y una captura de la página (`.shots/e2e/<escena>-FAILED.png`) que la CI sube como artefacto; `timeout-minutes` en **todos** los trabajos; permisos mínimos (`contents: read`); el presupuesto en el trabajo `budget`.
- **Cómo comprobar:** `TROID_E2E_SCENE_LIMIT_S=7 npm run test:e2e -- --prod --only=render` falla nombrando la escena y guarda la captura; `npx vitest run tests/unit/tools/ciWorkflow.test.ts` (se comprobó que falla si se quita un tiempo límite o si el trabajo E2E vuelve a llevar el banco).

#### P1-5 · Nada comprobaba que el texto cupiera en su caja — ✅ `6074ace`
- **Problema:** `readable` comprueba contraste y tamaño de letra; ninguna prueba comprobaba que un texto largo (el nombre de un guardián, el aviso de una habilidad) no se cortara en un teléfono pequeño o en el otro idioma (§4.9).
- **Evidencia:** no existía detector; con el nuevo (probado contra cortes hechos a propósito), **ningún texto cortado** hoy.
- **Archivos / sistemas:** `tools/e2e/fit.ts`, `tools/e2e/scenarios/textFit.ts`, `tools/e2e/scenarios/readable.ts`.
- **Consecuencia para el jugador:** un nombre cortado («Soberano del Corazón de T…») o una instrucción ilegible en un móvil pequeño o en inglés.
- **Dependencias:** ninguna.
- **Solución propuesta (ejecutada):** el detector (desbordes ocultos, texto fuera de su contenedor o de la ventana; exenta el texto solo para lectores de pantalla) en cada pantalla del menú y sobre el juego: HUD, barras de los once guardianes, avisos de las once habilidades; es/en × (667×375, 844×390, 1280×720).
- **Cómo comprobar:** `npm run test:e2e -- --prod textFit readable`.

#### P1-6 · Un rojo de la CI pasó sin verse siete veces seguidas — ✅ práctica adoptada y documentada
- **Problema:** la CI se miraba al cerrar un trabajo y no en cada fase (§4.2): siete empujes seguidos en rojo.
- **Evidencia:** las ejecuciones nº 142–148 y su causa una a una (§4.2).
- **Archivos / sistemas:** el proceso de trabajo (esta bitácora, §6); `gh run list` / `gh run view`.
- **Consecuencia para el jugador:** ninguna directa; un *build* roto en la rama sigue sin poder publicarse.
- **Dependencias:** ninguna.
- **Solución propuesta (ejecutada):** tras cada empuje se consulta la CI y no se sigue sobre una base en rojo; el estado de cada ejecución se anota en §6. **No se afirma que un mecanismo de aviso automático exista:** GitHub avisa por correo a quien empuja un *workflow* fallido según su configuración personal, que no se ha podido ver desde aquí.
- **Cómo comprobar:** que §6 tenga, por cada fase, la ejecución de la CI y su resultado.

#### P1-7 · Cifras caducadas en la documentación — ⏳ (barrida final, §6)
- **Problema:** `docs/PUBLISHING.md` dice «204 723 B, quedan 77 B», «5 713 pruebas en 269 archivos», «68 escenas»; el README y otros documentos arrastran cifras de fases anteriores.
- **Evidencia:** `grep` de las cifras (§6).
- **Archivos / sistemas:** `docs/PUBLISHING.md`, `README.md`, `docs/ARCHITECTURE-2D.md`, `docs/ROADMAP.md`. Las bitácoras de cada prompt (`PROMPT15…24-LOG.md`) **no se tocan**: dicen lo que era verdad entonces.
- **Consecuencia para el jugador:** ninguna; para quien publique, una guía con cifras falsas.
- **Dependencias:** las medidas finales de esta sesión.
- **Solución propuesta:** actualizar solo lo verificable con la medida de esta sesión y borrar lo que ya no es cierto, sin quitar documentación útil.
- **Cómo comprobar:** que cada cifra de la guía se pueda reproducir con el comando que la acompaña.

### P2 — calidad y pulido

#### P2-1 · El segundo golpe se leía como el primero — ✅ (§6)
- **Problema:** el segundo golpe del combo tiene su propio clip, otro arco de luz, más parada de impacto, sacudida y empuje, pero **el cuerpo hace lo mismo las dos veces**: su clip es el primero con la espada más adelantada y el primero tiene un paso adelante en la simulación (`lunge`) que el segundo no tiene (§4.5).
- **Evidencia:** los fotogramas del combo, tick a tick, antes del cambio (`slash_1`: `attack1_00…03`; `slash_2`: `attack2_00…04`); `src/content/attacks.ts`.
- **Archivos / sistemas:** `src/presentation/swingAccent.ts` (nuevo, función pura), `src/render/ActorSprite.ts` (opción `accent`), `src/render/PlayerVisual.ts`, `src/app/Game2D.ts`, `tests/unit/sprites/swingAccent.test.ts`.
- **Consecuencia para el jugador:** el combo se siente como un golpe repetido en vez de «corte y remate»: menos peso en el remate, que es el golpe que más empuja.
- **Dependencias:** ninguna (no hay dibujos nuevos: se mueve lo que ya está dibujado).
- **Solución propuesta (ejecutada):** una variación **procedimental solo de presentación**: en `attack2`, el cuadro se recoge hacia atrás en el arranque, se lanza adelante y se estira en el golpe, y se asienta en la recuperación (en el punto más fuerte: 14 cm hacia delante, 6,9° de inclinación y 6 % de estiramiento; topes de 16 cm, 8° y 8 %, bajo prueba, y por debajo de los 20 cm de paso adelante que el primer golpe tiene en la simulación); el primer golpe y todos los demás estados quedan **exactamente** como estaban; la simulación, las cajas, las anclas y `bounds()` no se mueven.
- **Cómo comprobar:** `npx vitest run tests/unit/sprites/swingAccent.test.ts` (10 pruebas); la hoja de contactos `docs/img/prompt25/combo_second_blow.jpg` (antes, después y diferencia, tick a tick); `heroContinuity` y las escenas `combat`, `crouch`, `death`, `player-art`, `player-anim`, `player-r1`, `player-lab`, `sprites`, `render`, `world-art` y `r1` (11 de 11 contra el *build* con la variación). **No sustituye a una persona jugando**: qué tanto cambia la sensación solo se puede decir con manos en un mando o una pantalla (§7).

#### P2-2 · Criaturas que se salen del mundo y el sistema devuelve a su sitio — ◻
- **Problema:** durante `fullrun` salen **ocho avisos distintos** `"<criatura>" fell out of "<sala>" and was put back where it was placed` (p. ej. `ink_spitter25` en `rt_bridge`, `mire_toad41` en `mr_edge`) (§4.6).
- **Evidencia:** la salida de `fullrun` (🔎); `src/gameplay/GameSession.ts:767-777` (el reposicionamiento).
- **Archivos / sistemas:** `GameSession.ts`, las salas nombradas y los cerebros de esas criaturas (`src/enemies`).
- **Consecuencia para el jugador:** una criatura que desaparece y reaparece en su sitio inicial en mitad de un pasillo: un tropiezo visual raro, nunca un bloqueo (el sistema la repone con su vida).
- **Dependencias:** ninguna.
- **Solución propuesta:** hallar para cada una de las ocho si la causa es un salto o un empuje sobre un hueco sin suelo y corregir en el cerebro (no pisar el borde) o en la sala (un suelo que falta), sin quitar la red de seguridad.
- **Cómo comprobar:** `fullrun` sin ese aviso; `enemyFall` y `enemySoak` en verde.

#### P2-3 · Una sola copia `.corrupt` por clave — ◻
- **Problema:** un guardado ilegible se **conserva** como `<clave>.corrupt`, pero una segunda corrupción sobrescribe la primera (`SafeStore.ts:46-47`) (§4.4).
- **Evidencia:** lectura del código; la prueba de `SafeStore` cubre una corrupción, no dos seguidas.
- **Archivos / sistemas:** `src/save/SafeStore.ts`, `tests/unit/save`.
- **Consecuencia para el jugador:** en el caso extremo de dos corrupciones seguidas, la primera copia —que podría haberse rescatado a mano— se pierde.
- **Dependencias:** ninguna.
- **Solución propuesta:** rotar a `.corrupt.1`, `.corrupt.2` con un tope de dos o tres copias y un límite de tamaño (el almacenamiento puede estar casi lleno).
- **Cómo comprobar:** una prueba que corrompa dos veces y compruebe que ambas copias existen y que no se acumulan más de las permitidas.

#### P2-4 · `leech_bite`: aviso de 200 ms con 2 de daño — ◻ (medir antes de tocar)
- **Problema:** es el único ataque cuyo aviso (12 ticks = 200 ms) queda por debajo del tiempo de reacción visual (≈ 250 ms) y que además hace el doble de daño (§4.7).
- **Evidencia:** `src/content/creatures.ts:203` y la tabla de avisos de los 25 enemigos y 11 guardianes (🔎 sobre los datos). No se ha **visto** que sea injusto en una pelea.
- **Archivos / sistemas:** `src/content/creatures.ts`, la IA `leech`, su rig.
- **Consecuencia para el jugador:** posible daño «sin aviso» del único enemigo emboscador; peor en un móvil con latencia de entrada.
- **Dependencias:** una medida de partidas con jugadores (o de un bot con latencia de reacción de 250 ms).
- **Solución propuesta:** **medir primero** (cuántos mordiscos acierta un bot con 250 ms de reacción en las salas donde aparece); solo si acierta de forma desproporcionada, alargar el aviso a 18 ticks o hacer que el rig lo anuncie antes (el hundimiento ya existe: `sinkTicks`). No se cambia la dificultad sin esa medida.
- **Cómo comprobar:** la medida antes y después en `tools/` o en un *soak*; `creatures.test.ts` y `encounters*.test.ts` siguen en verde.

#### P2-5 · Arenas: ¿qué mecánica de arena añade una decisión de verdad? — ◻ (decisión antes que código)
- **Problema:** diez arenas con repisas y el peligro de lo que hace cada guardián, pero sin elementos que se rompan, sin elementos interactivos y sin cambios por fase (`PROMPT24-LOG` §7) (§4.8).
- **Evidencia:** lectura de las salas de los guardianes (`src/content/rooms/*.ts`) y de las reglas que fija `encountersEmber.test.ts`.
- **Archivos / sistemas:** las salas de los guardianes, `Boss`, `HazardSystem`, `encounters*.test.ts`.
- **Consecuencia para el jugador:** las peleas son buenas por el guardián, no por la sala; ninguna sala cambia durante la pelea.
- **Dependencias:** una decisión de diseño de la dueña.
- **Solución propuesta:** de los tres tipos, el **cambio de la sala por fase solo de presentación** (la luz o las grietas cambian con `phaseNo`) es el de menor coste y riesgo (no añade reglas: `encountersEmber` no se vuelve a ganar) pero también el de menor valor (los guardianes ya señalan sus fases); **destructibles** e **interactivos** añaden reglas y obligan a ganar de nuevo cada pelea. **Recomendación: como mucho UNA arena piloto**, la del guardián cuyo ataque de zona (la lluvia de rocas del Coloso) tiene menos contrajuego posicional, con una pieza destructible que sirva de cobertura que caduca; se adopta solo si da una decisión que hoy no existe, el guardián se sigue ganando con un héroe mortal, y no cuesta más de unas llamadas de dibujo. Sin ese criterio, no se añade complejidad por añadirla.
- **Cómo comprobar:** el piloto con una prueba de pelea (`encountersEmber`) que gana con y sin la pieza, y la captura de la arena en el *build* de producción.

#### P2-6 · Sonidos propios de las 34 especies y música de las cuatro zonas de la segunda mitad — ◻
- **Problema:** las 24 criaturas y 10 guardianes nuevos reutilizan los sonidos de su arquetipo; las cuatro zonas de la segunda mitad no tienen música propia (§4.10).
- **Evidencia:** `src/audio/soundMap.ts`, `npm run audio:check`; 82 sonidos y 8 piezas, todos sintetizados.
- **Archivos / sistemas:** `tools/audio`, `src/audio`, `public/audio`.
- **Consecuencia para el jugador:** las criaturas nuevas suenan como las viejas; la segunda mitad se oye como la primera.
- **Dependencias:** una decisión sobre si el audio será sintetizado o grabado (P3-1).
- **Solución propuesta:** ampliar el catálogo sintetizado con un timbre por especie y dos o tres piezas para la segunda mitad; todo con el presupuesto de 52 MiB por sala y las pruebas de `worldAudio`.
- **Cómo comprobar:** `npm run audio:check`, `worldAudio.test.ts` y la escena `audio-cues`.

#### P2-7 · Sin modo de 30 fotogramas por segundo — ◻
- **Problema:** el gobernador de calidad solo baja la resolución y las partículas; no existe un modo que dibuje a mitad de frecuencia (§4.14).
- **Evidencia:** `src/presentation/qualityGovernor.ts`; sin medida de batería ni de temperatura (requiere dispositivo).
- **Archivos / sistemas:** `GameLoop.ts`, `Renderer2D.ts`, los ajustes de calidad.
- **Consecuencia para el jugador:** en un móvil que no llega a 60 fps, el juego se arrastra o calienta el teléfono en vez de ir fluido a 30.
- **Dependencias:** medidas en dispositivos reales (§7).
- **Solución propuesta:** una opción de «ahorro de batería» que dibuje un fotograma de cada dos con la simulación a 60 Hz (la simulación es de ticks fijos, de modo que no cambia nada de lo jugable).
- **Cómo comprobar:** la escena `adaptive` ampliada; la simulación idéntica (`fullrun`); en un móvil real, batería y temperatura en 20 min.

#### P2-8 · El sonido no arranca con un mando solo, y el juego no lo dice — ◻
- **Problema:** los navegadores no cuentan un botón de mando como gesto del usuario, así que quien juega solo con mando (en la versión web) no oye nada hasta tocar el teclado, el ratón o la pantalla; el juego no avisa.
- **Evidencia:** `src/app/audio.ts:95` (`GESTURES`: pointer, touch, mouse, key, click; el comentario lo dice) y ninguna cadena de interfaz sobre el sonido bloqueado (📖 búsqueda en `src/`).
- **Archivos / sistemas:** `src/app/audio.ts`, `src/audio/engine.ts` (`state: 'locked'`), el menú.
- **Consecuencia para el jugador:** parece que el juego «no tiene sonido».
- **Dependencias:** ninguna.
- **Solución propuesta:** una línea en el menú de inicio mientras el motor esté `locked` («pulsa una tecla o toca la pantalla para activar el sonido»), en los dos idiomas.
- **Cómo comprobar:** una escena con el motor bloqueado: el aviso se ve y desaparece al primer gesto.

#### P2-9 · Accesibilidad que falta — ◻
- **Problema:** el *viewport* de `index.html` impide el zoom de la página (`user-scalable=no`; habitual en un juego de lienzo, cuya compensación es la escala del HUD); no hay modo para daltonismo, ni indicación visual de los sonidos (los sonidos no llevan texto), ni tamaño de texto general más allá del HUD, ni alternativa a mantener pulsado; el juego no es utilizable con lector de pantalla (§4.12).
- **Evidencia:** `src/ui/settings/`, `readable` (mide contraste y tamaño, no estas cosas).
- **Archivos / sistemas:** ajustes, HUD, avisos de peligro (`vfx`).
- **Consecuencia para el jugador:** parte de los jugadores con daltonismo, sordera o poca visión lo tiene más difícil.
- **Dependencias:** decisión sobre el alcance (qué se promete en la tienda).
- **Solución propuesta:** por orden de coste: el tamaño de texto global; el alternar en lugar de mantener; los avisos de peligro con forma y no solo con color; un filtro de daltonismo.
- **Cómo comprobar:** `accessibility` y `readable` ampliadas; una revisión con las simulaciones de daltonismo de Chromium (`Emulation.setEmulatedVisionDeficiency`).

#### P2-10 · Más margen de arranque, si hiciera falta — ◻ (no urgente: quedan 7 843 B)
- **Problema:** lo recuperable que no se tocó (§4.1): ≈ 9 KB de código de canvas (el empaquetador lo une al *chunk* de `Graphics`), ≈ 3,5 KB de pruebas/*placeholders* en los registros del primer fotograma, ≈ 1,4 KB del idioma que no se usa.
- **Evidencia:** los mapas de fuentes; el experimento de partir el *chunk* de canvas (el grupo absorbía todo el núcleo de Pixi, y sin dependencias recursivas el arranque fallaba con `Invalid extension type`: orden de evaluación) se **revirtió**.
- **Archivos / sistemas:** `vite.config.ts`, `src/content/core.ts`, `src/i18n/catalogs.ts`.
- **Consecuencia para el jugador:** ninguna hoy.
- **Dependencias:** que el margen vuelva a estrecharse.
- **Solución propuesta:** en este orden de riesgo: cargar el catálogo del otro idioma por separado; sacar los *placeholders* y las salas de prueba de los registros del primer fotograma; el canvas, solo con un empaquetador que lo permita sin romper el orden de evaluación.
- **Cómo comprobar:** `npm run bench:bundle` y las escenas de arranque.

#### P2-11 · La cobertura de las pruebas no es una herramienta del proyecto — ◻
- **Problema:** nada mide qué líneas de `src/` ejecuta la suite; se midió una vez para esta auditoría (§4.16) con un paquete que **no se añadió** a `package.json`.
- **Evidencia:** §4.16.
- **Archivos / sistemas:** `package.json`, `vitest.config.ts`, la CI.
- **Consecuencia para el jugador:** ninguna directa.
- **Dependencias:** que la dueña acepte una dependencia de desarrollo más (`@vitest/coverage-v8`, la misma versión que `vitest`).
- **Solución propuesta:** un guion `npm run coverage` y el informe como artefacto de la CI, **sin umbral** al principio (la suite es de escenas y de simulación determinista: un porcentaje de líneas dice poco); un umbral solo si una caída sostenida se vuelve un problema.
- **Cómo comprobar:** el informe se genera en la CI y en local con el mismo número.

#### P2-12 · El paquete que se publica lleva 6,8 MB de mapas de fuentes — ◻
- **Problema:** `vite.config.ts` fija `build.sourcemap: true`: cada *chunk* sale con su `.map` y con la línea `sourceMappingURL` (6,8 MB de mapas contra 1,7 MB de JavaScript, de los 49 MB de `dist/`).
- **Evidencia:** ✅ `du` sobre `dist/assets` y la lectura de `vite.config.ts`; nada del repositorio los usa (el banco de arranque no los lee).
- **Archivos / sistemas:** `vite.config.ts`, el paso que copia `dist/` a la cáscara nativa o al alojamiento.
- **Consecuencia para el jugador:** un paquete de la tienda más grande por nada (los mapas solo los baja un navegador con las herramientas de desarrollo abiertas).
- **Dependencias:** ninguna; conviene decidirlo con la cáscara nativa (P0-1).
- **Solución propuesta:** `sourcemap: 'hidden'` (los mapas se generan sin la línea que los enlaza) y excluir `*.map` al copiar `dist/` al paquete que se publica; conservarlos aparte si algún día hay informes de fallos (P3-7).
- **Cómo comprobar:** el tamaño del paquete antes y después, y `npm run bench:bundle` (no cambia: mide el JavaScript).

#### P2-13 · Instalar la versión web en la pantalla de inicio — ◻
- **Problema:** el `manifest.webmanifest` solo declara un icono SVG y `index.html` no trae `apple-touch-icon`; iOS usa entonces una captura de la página como icono. No hay *service worker* (por decisión: `privacy` prueba que no hay ninguno), así que tampoco hay modo sin conexión.
- **Evidencia:** ✅ lectura de `public/manifest.webmanifest` e `index.html`.
- **Archivos / sistemas:** `public/`, `index.html`.
- **Consecuencia para el jugador:** quien añada el juego web a su pantalla de inicio en un iPhone ve un icono que no es el del juego.
- **Dependencias:** el icono de marca definitivo (P0-1, externo).
- **Solución propuesta:** iconos PNG de 192, 512 y 180 px (`apple-touch-icon`) a partir del icono final; decidir con la dueña si se quiere un modo sin conexión (cambiaría la política de `privacy`).
- **Cómo comprobar:** la escena `privacy` sigue en verde; instalar en un iPhone y en un Android reales (§7).

#### P2-14 · Dos avisos de seguridad de gravedad alta en las dependencias de desarrollo — ◻
- **Problema:** `npm audit` marca `vite` 8.3.0–8.3.2 y `happy-dom` ≤ 21.0.3 (ver §4.15); las dependencias de producción están limpias.
- **Evidencia:** ✅ `npm audit --omit=dev` (0) y `npm audit` (2 altas); un ensayo de `npm audit fix --package-lock-only` en una copia: arregla `vite` (y sube `rolldown` de 1.2.12 a 1.2.19 y `@oxc-project/types`), y deja `happy-dom` para `--force` (21.0.4, cambio mayor).
- **Archivos / sistemas:** `package.json`, `package-lock.json`, `vite.config.ts`, `tools/build/pixiDiet.ts`, las pruebas con `// @vitest-environment happy-dom`.
- **Consecuencia para el jugador:** ninguna (no se envían). Para quien desarrolla: el servidor de desarrollo abierto a la red con `dev:lan`.
- **Dependencias:** que haya tiempo de volver a medir el empaquetado: un empaquetador nuevo puede mover el tamaño del arranque o el orden de evaluación de los módulos de Pixi (el experimento de partir el *chunk* de canvas ya mostró lo frágil que es).
- **Solución propuesta:** subir `vite`/`rolldown` por el archivo de bloqueo y comprobar `npm run build`, `npm run bench:bundle` (que no se mueva más de unos cientos de bytes), las escenas de arranque y la suite; `happy-dom` 21 en otro cambio, con la suite de pruebas de DOM. Mientras tanto, no usar `dev:lan` en redes no confiables.
- **Cómo comprobar:** `npm audit` sin altas; el banco y la suite como antes.

### P3 — futuro

- **P3-1 · Audio real** (grabado o compuesto, con voces si las hubiera). *Problema:* todo el audio es sintetizado y provisional (§4.10). *Evidencia:* `npm run audio:build`. *Sistemas:* `tools/audio`, `public/audio`. *Consecuencia:* un juego que suena a prototipo. *Dependencias:* presupuesto y un autor. *Solución:* sustituir el catálogo manteniendo los identificadores. *Comprobar:* `audio:verify`, `worldAudio`.
- **P3-2 · `grapple` y `swim` declaradas e inertes.** *Problema:* `implemented: false`; ninguna sala ni habilidad las concede (§4.11). *Evidencia:* `src/content/abilities.ts`. *Consecuencia:* ninguna (no aparecen). *Dependencias:* decisión de diseño. *Solución:* implementarlas con salas que las usen, o quitar la declaración. *Comprobar:* `progressionOrder`, `deadEnds`.
- **P3-3 · Política de seguridad de contenido.** *Problema:* `index.html` no declara CSP, y `script-src 'self'` sin `'unsafe-eval'` rompería Pixi (construye funciones con `Function(...)`) (§4.15). *Evidencia:* `docs/PUBLISHING.md` §7 (probado con tres políticas). *Consecuencia:* defensa en profundidad ausente en la versión web alojada. *Dependencias:* importar `pixi.js/unsafe-eval` (más bytes en el primer fotograma: a medir contra la reserva). *Solución:* CSP con `'unsafe-eval'` acotado y el script en línea por *hash*. *Comprobar:* arrancar con la CSP puesta en Chromium, Firefox y WebKit.
- **P3-4 · `Game2D.ts` concentra el montaje de todo** (9,4 KB gz). *Problema:* es donde un cambio toca más cosas (§4.3). *Evidencia:* tamaño y acoplamientos; las escenas E2E lo cubren. *Consecuencia:* coste de mantenimiento, no del jugador. *Dependencias:* una razón técnica concreta. *Solución:* partirlo por responsabilidades (vistas, eventos, carga diferida, ciclo de vida) **solo cuando una tarea lo exija**. *Comprobar:* `architecture.test.ts` y las 69 escenas.
- **P3-5 · Monetización, anuncios, analítica, cuentas.** *Problema:* no existen, **por decisión** (`PUBLISHING.md` §3); no hay nada que simular. *Dependencias:* una decisión de negocio, y después SDK, consentimiento, restauración y validación de compras. *Solución:* cuando se decida, una abstracción de «derechos» en `ProgressData` con migración. *Comprobar:* `privacy` (hoy: ningún dato sale) tendría que cambiar a propósito.
- **P3-6 · Más idiomas y formatos regionales.** *Problema:* español e inglés; el HUD solo muestra enteros (§4.12). *Solución:* nuevos catálogos con las mismas claves (`catalogs.test.ts` ya lo exige) y carga diferida (P2-10).
- **P3-7 · Informes de fallos con consentimiento.** *Problema:* ningún dato sale, así que un fallo en el teléfono de una persona no llega a nadie (`src/app/crash.ts` solo muestra la página). *Dependencias:* decisión de privacidad. *Solución:* un envío opcional y explícito.
- **P3-8 · Guardado en la nube y transferencia entre dispositivos.** *Problema:* el guardado vive en el dispositivo; existe exportar/importar archivo (pasa por `parseProgress`). *Dependencias:* cuentas (P3-5).
- **P3-9 · Sin linter ni formateador.** *Problema:* solo `.editorconfig` y el compilador estricto (§4.3). *Consecuencia:* ninguna para el jugador; un estilo puede desviarse sin que nada lo avise. *Dependencias:* una decisión de equipo (otra dependencia de desarrollo). *Solución:* un linter con pocas reglas (las que el compilador no cubre: promesas sin esperar, `any` implícito en JSON). *Comprobar:* `npm run lint` en la CI.
- **P3-10 · Sin respuesta háptica ni bloqueo de pantalla.** *Problema:* el código no usa `navigator.vibrate`, ni un *plugin* de háptica, ni `navigator.wakeLock`, ni bloqueo de orientación (✅ búsqueda en `src/`). *Consecuencia:* en un móvil los botones táctiles y los golpes no devuelven nada al tacto (en Safari de iPhone `vibrate` ni existe), y una pantalla que no se toca un rato (un final largo) puede apagarse. *Dependencias:* la cáscara nativa (P0-1) para iOS: un *plugin* de Capacitor. *Solución:* una capa fina de háptica detrás de un ajuste, y `wakeLock` mientras el juego está en primer plano. *Comprobar:* en un dispositivo real (§7.2).

## 6. La ejecución, fase por fase

Cada fase terminó con las pruebas de lo que tocó, las escenas reales que lo ven, la medida, la documentación y un empuje a la rama; la CI se miró después de cada uno (P1-6).

| Fase | Commit | Qué | Verificación local |
|---|---|---|---|
| A0 · medir y leer | `6074ace` | el detector de texto cortado (`tools/e2e/fit.ts`) y la escena `textFit` | `textFit` y `readable` contra producción; el detector, contra cortes hechos a propósito |
| A1 · hallazgos | `d95f3c6` … `61dca41` | la bitácora: método y hallazgos por área (§4) | — |
| P1-2 · la CI corre todo | `75ba403` | `registry.ts`, `groups.ts`, `run.ts --group=`, el *workflow* por grupos, `e2eGroups.test.ts` | 4 pruebas unitarias; `--group=` contra producción |
| P1-1 · arranque con margen | `9cb5fd7` | `tools/build/pixiDiet.ts`, la reserva de 4 KiB en `bench:bundle`, `testTimeout` de 15 s | **203 992 → 196 957 B**; 4 pruebas nuevas; 8 escenas contra el *build* recortado |
| P1-4 · evidencia y límites | `97461f7` | plazo por escena, captura al fallar, trabajo `budget`, permisos mínimos, `timeout-minutes`, artefactos | 13 pruebas nuevas; una escena colgada a propósito falla con su nombre y guarda su captura |
| P2-1 · el segundo golpe | `2770544` | `swingAccent.ts`, `ActorSprite.accent`, la hoja de contactos | 10 pruebas nuevas; 11 escenas del héroe; primer golpe idéntico al píxel; +343 B de arranque |
| CI · `arrival` (1) | `b3eb312` | la escena dice qué vio cuando falla | — |
| P1-2b · grupos balanceados | `ab182e0` | ocho grupos por el tiempo medido en cinco ejecuciones | `e2eGroups` y `ciWorkflow` |
| docs | `32604d9` | §3, §4.2.1, §5, `ARCHITECTURE-2D` §21, `PUBLISHING` | — |
| CI · `arrival` (2) | `d37e3bf` | la espera de la sección D de 4 s y el muestreo de la F dentro de la página; límite del trabajo a 60 min | `arrival` 96,6 s con la máquina cargada |

### 6.1 Lo que dijo la CI

| CI | Commit | Resultado | Qué dijo |
|---|---|---|---|
| 149, 150, 151 | `2eed8c7`, `b855e83`, `934a929` | ✅ ✅ ✅ | el punto de partida (20 escenas E2E) |
| 152, 153 | `6074ace`, `d95f3c6` | ✅ ✅ | con `textFit`, todavía con la lista corta de escenas |
| 154 | `75ba403` | ❌ `e2e (world)` | **la primera vez que las 49 escenas olvidadas corrían en el corredor, una resultó roja**: `arrival` (sección D) |
| 155, 156 | `ea635ac`, `61dca41` | ❌ `e2e (world)` | `arrival` (sección D), la misma aserción |
| 157 | `9cb5fd7` | ❌ `e2e (world)` | `arrival` otra vez, pero **otra aserción** (sección F): la D había pasado |
| 158 | `97461f7` | ⏳ | `budget` ✅ (196 957 B, **la misma cifra al byte que en local**), `check`, `play`, `stability`, `journey`, `interface` y los dos motores ✅; `world`: pendiente |
| 159 … | `b3eb312` … | ⏳ | con el diagnóstico de `arrival`, los ocho grupos y la corrección |

**La causa de `arrival`, y lo que no está probado.** Dos aserciones distintas, en dos secciones distintas, fallaron en ejecuciones distintas, y las dos cuentan algo **dentro de una ventana de tiempo**: la D, si el indicador de carga llegó a verse durante una espera de 1 500 ms (de los que 450 son de gracia y uno más el fundido de entrada); la F, si las muestras de la proporción descargada pasaron por la mitad de una carga limitada a 260 KB/s (con una ida y vuelta del controlador por muestra). En local pasan siempre, también con un solo núcleo (`taskset -c 0`), con la máquina cargada y tras `progression` y `transition`. **Hipótesis que explica los dos datos** (no confirmada con fotogramas del corredor, que no se tenían): en una sala posterior al Santuario la página compila ≈ 220 KB de JavaScript (los *rigs*, los guardianes) sin dibujar un solo fotograma, y en el corredor eso se come la ventana; la nº 157 lo sugiere (la espera de 1 500 ms tardó 1 873 en notarse cumplida). **No es un fallo del juego:** el indicador sale en cuanto hay fotogramas. Se hizo lo que no relaja lo que se prueba: una espera de 4 s en vez de 1,5 s (lo que se prueba es que una espera que sigue se le dice al jugador) y el muestreo hecho **dentro** de la página (119 muestras de 0,00 a 1,00 donde el controlador veía 30–38), y se dejó el diagnóstico en el mensaje de las aserciones por si hubiera otra causa.
