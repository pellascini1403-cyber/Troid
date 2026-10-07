# Prompt 7 — el pipeline de arte 2D (S33 → S44)

> **Lo primero, sin letra pequeña: el arte final del protagonista NO está físicamente disponible en el repositorio.** No hay un solo *sprite* suyo en `art/`, `public/` ni en ningún otro sitio versionado
> (las únicas imágenes versionadas son una captura del *placeholder* para el estudio de cámara y el icono SVG). Las imágenes de referencia que se compartieron en la conversación son ilustraciones de
> concepto sin canal alfa, están fuera del repositorio y **no son *sprites***. **No se ha generado, dibujado, recortado de esas ilustraciones, imitado, recoloreado ni «mejorado» nada.** El protagonista del juego sigue
> siendo la **cápsula abstracta con espada** (el *placeholder*), y **no se ha integrado ningún arte real**: lo que se hizo es dejar el proyecto **técnicamente preparado para recibirlo de forma limpia, eficiente y reversible**.

**Alcance del Prompt 7 tal como se ejecutó.** El objetivo era establecer el **pipeline definitivo de assets 2D** (resolución, escala, atlas, sustitución segura de *placeholders*, integración del arte real del protagonista *cuando exista*, arquitectura
para enemigos, entorno y VFX) **sin romper** gameplay, input, cámara, HUD, guardado ni pruebas. **No** se rehízo ningún sistema anterior, **no** se reabrió ninguna decisión cerrada, **no** se volvió a Three.js y **no** se tocó PixiJS (8.22.0, fijado).
El documento técnico completo es [ART-PIPELINE-2D](ART-PIPELINE-2D.md) (partes A–K); este es el registro de lo que se hizo, en qué orden, qué se encontró y qué se midió.

## Los pasos

| Paso | Commit | Qué entregó | Pruebas tras él |
|---|---|---|---|
| **S33** auditoría | `835074f` | cómo funcionaba el pipeline **antes de tocar nada**: 13 hallazgos (parte A) | — |
| **S34** contrato | `9b0321c` | el manifiesto de datos (índice y paquete), escala px → metros por variantes de resolución, pivote, clips con alias, anclas (con `hit_origin`) y etiquetas | → |
| **S35** atlas y carga diferida | `83b7fd5` | empaquetador **sin pérdida** (`assets:pack`), política `boot`/`zone`/`lazy`, biblioteca de arte en un *chunk* aparte; el arranque en frío **baja de 198.4 a 188.2 KB** | 1980 |
| **S36** visual intercambiable | `1048466` | `PlayerVisual` + conmutador: el *placeholder* siempre presente, el arte real cuando existe, **estado por estado**, reversible en cualquier momento | 2005 |
| **S37** validación en el *build* | `81f3b0b` | el arte roto no compila: tamaño, alfa, atlas, fotogramas, clips completos, anclas, espada, nombres y referencias, **con la ruta del archivo** | 2046 |
| **S38** importación del protagonista | `a16d11f` | el hueco declarado (`art/player/player.pack.json`, `awaiting-art`, 15 clips), `assets:missing` (**0 de 15**), extracción de hojas sin tocar un píxel, la guía de entrega | 2062 |
| **S39** laboratorio | `24e478f` | `?lab=player`: un clip cada vez, anclas, espada, escala, cajas del juego, *placeholder* frente a arte | 2074 |
| **S40** R1 con el arte completo | `19e3ae4` | las **cuatro cajas** del héroe separadas y a la vista; la reptación deja de ser cápsula (hallazgo) | 2096 |
| **S41** VFX y audio | `d296609` | el contrato visual de los efectos y las **17 señales de audio** (sin sonido) | 2166 |
| **S42** entorno | `08a0d54` | capas y paralaje, las 12 piezas que pide el mundo, la regla de repetición, la colisión que no es el dibujo | 2211 |
| **S43** rendimiento | `d9d22e2` | `?lab=art-stress`: 100/500/1000 *sprites* de varias páginas, con alfa, luz y efectos, medidos | 2223 |
| **S44** cierre | *(este commit)* | `world-art` (la slice entera con arte puesto, bit a bit), **pausar es inmediato** (una carrera hallada por la integración), documentación, informe | 2223 (sin cambios: S44 añade E2E, no pruebas unitarias) |

Todos los mensajes de *commit* están en español y terminan con los dos *trailers* del proyecto; cada paso verificó `tsc`, las pruebas relevantes, el *build*, el E2E y la medición del *bundle*.

## Lo que se encontró (lo que no estaba en el encargo)

1. **La reptación se habría cruzado como cápsula** (S40). El héroe publica **18 estados**, no los 15 de la entrega: además de ellos, `run`, `land` y `crouchWalk`. Los dos primeros ya se resolvían; `crouchWalk` —la reptación y el deslizamiento bajo el pasaje de R1— no tenía sustituto, así que con los 15 clips reales el túnel de R1 se habría cruzado dibujado por la cápsula en un juego dibujado a mano. Corregido (`crouchWalk ← crouch`), con la prueba que **cuenta los estados que la simulación publica de verdad** y la que falla si se quita la corrección.
2. **Las cuatro cajas del héroe** (qué se ve · qué choca · qué se hiere · qué golpea) ahora se pueden **ver a la vez** en el juego (`state().boxes`) y **una regla de arquitectura impide que la simulación mire el dibujo** (S40): una imagen más grande, más pequeña o ausente no cambia nada de lo que el héroe pisa, recibe o hace.
3. **Un paquete nombra cada fotograma una vez** (S42/S43): obliga a que cada *sprite* —las piezas del escenario, los personajes de un paquete— tenga su **propio prefijo**; el manifiesto ya lo comprobaba y las guías ahora lo dicen.
4. **Lo que rompe un lote de dibujo es cambiar de mezcla, no cambiar de página** (S43): 1000 *sprites* de 24 páginas son **1** llamada de dibujo; la luz mezclada con los *sprites* normales en una capa son **301 frente a 2**. La regla de diseño para todo el arte de VFX que llegue: la luz va en su capa.
5. **Un laboratorio compartiendo módulos con el juego cuesta décimas de KB** en el arranque (S39: +0.8, S43: +0.2) por cómo el empaquetador reparte *chunks*: se midió, se aceptó (margen de 9.3 KB) y está dicho.
6. **Pausar no era inmediato** (S44, hallado por la ejecución completa contra el *build* de producción). El bucle se pausaba al final del *siguiente* fotograma, así que un fotograma que llegaba tarde —GL por software, subir una textura, una página ocupada— encontraba el bucle todavía en marcha y corría de golpe los pasos que se le debían (**hasta cinco**, el tope del `FixedStepper`) en medio de lo que se hacía con la simulación parada. Dos escenarios (`player-art` y `player-r1`), que comparan partidas guionizadas *tick a tick*, fallaron en producción con **exactamente cinco ticks de más**; con tres bucles ocupando la CPU el mismo desfase de cinco ticks reapareció en el código anterior (`player-r1`) y no en el corregido (los tres escenarios `player-*` en verde): una comparación de un solo intento por lado, no una estadística. Arreglo: una pausa del estado de depuración (el panel, un gancho de prueba) pausa el bucle **al instante** (`Game2D`, 7 líneas); prueba: `devtools` deja la página ocupada 400 ms justo después de pausar y exige que **ni un tick** corra después (falla sin el arreglo: `18 !== 17`). No era un fallo del arte ni de la simulación —el menú de pausa ya paraba el bucle al abrirse—, pero una prueba de determinismo que depende del humor del último fotograma no prueba nada.

## Decisiones (todas conservan las anteriores)

- **El *placeholder* siempre está.** Es el camino de vuelta y el *fallback* de cada estado: con arte parcial se ve al héroe real donde lo hay y la cápsula donde no, sin parpadeos y sin avisos en la consola de un jugador.
- **El arte real nunca se genera.** Si no está físicamente, se prepara, se declara y se **dice exactamente qué falta** (`npm run assets:missing`); nada lo finge.
- **Las operaciones técnicas del empaquetador son sin pérdida** (recorte transparente exacto, relleno, extrusión, fotogramas idénticos una vez): el fotograma original se reconstruye **bit a bit** (lo prueba `pack.test.ts` con cada fotograma que empaqueta).
- **La colisión es de los datos de la sala y del cuerpo, no del dibujo** (héroe y escenario): comprobado por arquitectura y por simulación.
- **Los contratos son datos + una función pura que los comprueba**, no una prosa: VFX (`vfxContract`), señales de audio (`audioCues`), entorno (`environment`), cajas (`pictureBounds`).
- **Lo que no se puede construir sin arte delante no se construye**: el dibujo de una sala con imágenes, los *flipbooks* de VFX, la comprobación de costuras y el alfa por pieza están **diseñados y documentados**, no escritos (ART-PIPELINE-2D §H.3, §I.8).

## Mediciones

| | Fin del Prompt 6 | Fin del Prompt 7 |
|---|---|---|
| Pruebas unitarias y de integración | 1833 | **2223** (141 archivos) |
| Escenarios E2E (desarrollo y producción) | 35 | **43** (+ `assets`, `player-art`, `player-lab`, `player-r1`, `audio-cues`, `environment`, `art-performance`, `world-art`), todos en verde en los dos modos |
| Arranque en frío (KB gzip, 200 de presupuesto) | 198.4 | **190.7** (34 *scripts*) |
| Primera sesión entera (KB gzip) | — | 205.9 (los *chunks* tardíos: efectos, jefe) |
| `tsc` | limpio | limpio |

Medidas del arte (parte J, **Chromium sin cabeza con GL por software**, arte **sintético**): 1000 *sprites* de hasta 24 páginas = **1 llamada de dibujo**; con luz en su capa, 2; con luz mezclada, 301; el peor caso a la vez (1000 *sprites*, 8 páginas, translúcidos, animados, luz y 30 ráfagas de efectos por segundo) = **5**; 9 páginas = 23.2 MiB, listas en ≈ 0.6 s por una ruta local.

## Lo que falta del arte real (exactamente)

- **Protagonista: 15 clips, 0 entregados** (`npm run assets:missing`): `idle`, `walk`, `jump`, `fall`, `dash`, `attack1`, `attack2`, `attackAir`, `crouch`, `attackCrouch`, `hurt`, `death`, `cast`, `drink`, `interact` —los cuatro golpes con las anclas de la espada en cada fotograma—. Cómo entregarlos: [deliver-protagonist-art](guides/deliver-protagonist-art.md).
- **Entorno: 0 de 12 piezas obligatorias** (y 14 opcionales) que piden los datos de las cuatro salas: `solid` `stone`/`earth` (`fill`), `platform` `wood` (`body`), `door` `gate`/`seal` (`body`), `hazard` `spikes` (`cell`), `backdrop` `ruins` (`far`, `mid`, `near`), `interactive` `rest`/`pickup`, `seal`. Cómo: [deliver-environment-art](guides/deliver-environment-art.md).
- **Enemigos y jefe:** siguen dibujados por código (procedurales); el contrato para su arte es el mismo que el del héroe ([replace-sprites](guides/replace-sprites.md)).
- **VFX finales:** los efectos de hoy se conservan; su sustitución está definida en tres niveles (ART-PIPELINE-2D §H.3).
- **Audio:** ni archivos ni motor; las señales a las que se enchufará están ([ART-PIPELINE-2D](ART-PIPELINE-2D.md) §H.4).

## Limitaciones de dispositivo (⚠ sin cambios)

Nada se ha verificado en un iPhone, un iPad ni un Android reales, ni con un mando físico; las medidas de rendimiento del arte son de un contenedor con GL por software y **no dicen nada de un teléfono**. La deuda de dispositivos reales
sigue siendo la que dejó el Prompt 6 ([MOBILE-CALIBRATION](MOBILE-CALIBRATION.md)).

## Qué sigue

1. **Entregar el arte** (el protagonista primero: `assets:missing` dice qué), verlo en `?lab=player`, y medirlo con `?lab=art-stress&art=<carpeta>`.
2. **Escribir el dibujo de las salas con imágenes** (con el arte delante) sobre las funciones que ya están probadas, y los *flipbooks* de VFX si el arte los trae.
3. **Un motor de audio** que reciba las señales (`AudioSink`) con un manifiesto de sonidos.
4. **Dispositivos reales** y el resto de lo de [ROADMAP](ROADMAP.md).
