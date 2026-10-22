# Prompt 18 — El audio: un motor de sonido, una banda sonora y los efectos del juego, hechos en este repositorio y conectados a lo que de verdad pasa

> Documento del encargo «implementación de audio profesional». Etapas: A auditoría · B motor · C efectos del protagonista, combate, poderes e interacciones · D música · E ambientes y sonidos de enemigos y jefe · F pausa, ajustes, guardado y menú · G pruebas, balance y cierre. **Lo que no existe como archivo real e integrado lo dice la [§9](#9--lo-que-sigue-sin-existir); nada se da por terminado sin una prueba que lo mire.**

---

## 1 · Etapa A — Auditoría (antes de tocar una línea)

### 1.1 Lo que había

| Pregunta | Respuesta, leída en el repositorio |
|---|---|
| **¿Qué sistema de audio se usa?** | **Ninguno.** Hay una **costura**, no un motor: `src/presentation/audioCues.ts` (puro) fija **17 señales** (`attack`, `hit`, `dash`, `hurt`, `death`, `boltCast`, `boltImpact`, `bottleStart`, `bottleDrunk`, `interact`, `bossAttack`, `bossDeath`, `roomTransition`, `jump`, `land`, `enemyTelegraph`, `enemyDeath`), cada una atada al evento de la simulación que la levanta, con **lugar, intensidad y variante**; `src/audio/AudioDirector.ts` escucha el bus y las entrega a un `AudioSink`. En desarrollo el *sink* es un `CueLog` (lo que `state().cues` enseña); en una compilación de jugador es **nada** (`NO_AUDIO`). |
| **¿Qué archivos de música y efectos existen?** | **Ninguno**: `find` no encuentra un solo `.ogg`, `.mp3`, `.wav`, `.m4a`, `.opus` ni `.flac` fuera de `node_modules`. No hay música, ni efectos, ni ambientes. |
| **¿Qué acciones ya emiten sonido?** | Ninguna suena. **Levantan señal** 17 momentos (arriba). Faltan señales para momentos que el juego sí tiene: pasos, inicio de la carga del poder, poder denegado, fin del proyectil, botella interrumpida o denegada o recargada, punto de control, puertas y sello, pinchos, alerta del enemigo, despertar y cambio de fase del jefe, habilidad y carta ganadas. |
| **¿Cómo se gestionan el volumen, la pausa y las zonas?** | **Volumen:** un solo control, `MasterVolume` (`src/audio/volume.ts`: curva cuadrática de nivel a amplitud) y `settings.volume.master` (0.8 por defecto), con **un deslizador «Volumen» en Ajustes cuya nota dice «El sonido llegará en una versión posterior»**; no hay música ni efectos por separado. **Pausa:** el menú detiene el mundo entero (`worldDt = 0`) y una página oculta abre el menú; **no hay audio que pausar**. **Zonas:** hay cuatro (R1 «Puerta de las Ruinas», R2 «Galería de Raíces», R3 «Cámara del Sello», R4 «Santuario» con la arena del jefe), con una **atmósfera** de color por sala (`content/atmosphere.ts`); el audio no sabe de ellas. |
| **¿Cómo se cargan y liberan los recursos?** | No se cargan: no hay recursos. El patrón del juego para lo diferido existe y se imita (el código de los efectos, del arte y del menú viajan en *chunks* aparte, tras el primer fotograma; la sala siguiente se pide mientras dura el fundido). |
| **¿Qué limitaciones hay?** | Ver [§1.3](#13-límites-de-las-plataformas). El arranque en frío tiene **199.4 KB gz de 200**: **el audio no puede entrar en él** y va entero en un *chunk* diferido. |

**Lo que ya está bien hecho y se reutiliza** (nada se duplica): el `AudioDirector` y su contrato (`AUDIO_CONTRACT`, 17 señales, probadas por 3 archivos de pruebas y la escena E2E `audio-cues`), que ya garantizan que **cuándo** suena algo lo decide la simulación y que es **determinista**; el `CueLog`; `MasterVolume` y la curva de volumen; `SettingsStore` con su migración versionada y archivos dorados; el menú de Ajustes y su deslizador; el patrón de *chunk* diferido de `Game2D` (`loadEffects`), y los eventos de la simulación (`GameEvents`: salto, caída, *dash*, golpe, daño, muerte, transiciones, jefe, sello, punto de control, puertas, poderes, botellas, interacción, habilidades).

### 1.2 Lo que el entorno permite producir

| Herramienta | Estado | Qué permite |
|---|---|---|
| **ffmpeg 6.1** | **sí** (`libopus`, `libvorbis`, `libmp3lame`, `aac`, `flac`, `libsoxr`, filtros `loudnorm`, `ebur128`, `alimiter`, `acompressor`, `aecho`, `afir`, `showspectrumpic`, `showwavespic`) | masterizar, medir (sonoridad, pico real), codificar y **dibujar espectrogramas** para revisar un sonido sin oírlo |
| Node 22 + `tsx` | sí | escribir **la síntesis en este repositorio** (osciladores, ruido, filtros, reverberación, instrumentos, partituras) |
| Chromium sin cabeza (el de las pruebas E2E) | sí | **WebAudio real**: el reloj avanza, un `AnalyserNode` mide lo que suena, decodifica Opus, MP3 y Ogg (no AAC) |
| `sox`, `lame`, `oggenc`, `opusenc`, `fluidsynth`, bancos de sonidos, Python con `numpy` | **no** | — |
| Grabaciones, instrumentos, un compositor, un oído | **no** | **por eso la música y los efectos de este encargo son SINTETIZADOS por código, originales, y se dicen así** |

**Lo que eso significa, sin adornos.** No hay forma de producir en este entorno una banda sonora **grabada** ni de calidad de estudio. Lo que sí se puede —y se hace— es **componer y sintetizar música y efectos originales con código propio**, sin muestras de nadie (así que **no hay procedencia dudosa ni licencias que revisar: todo sale de este repositorio**), hacer que **suenen de verdad** en el juego, y medirlos (sonoridad, picos, costuras de los bucles, espectros). Es un **audio de pre-producción sintetizado**, no una banda sonora profesional: la [§9](#9--lo-que-sigue-sin-existir) dice qué habría que encargar.

### 1.3 Límites de las plataformas

| Plataforma | Límite | Qué hace el motor |
|---|---|---|
| **Todos los navegadores** | el audio **no puede empezar sin un gesto del usuario** (política de *autoplay*) | el `AudioContext` se crea y se reanuda en el **primer gesto** (tecla, toque, clic, botón del mando); antes de él los sonidos se descartan, no se acumulan |
| **Safari / iOS** | `resume()` debe llamarse **dentro** del manejador del gesto (`pointerup`, `keydown`, `touchend`, `click`); el interruptor de silencio del iPhone **mutea WebAudio** | se escucha también `touchend`/`click`; se fija `navigator.audioSession.type = 'playback'` donde existe (Safari 16.4+). **No verificado en un dispositivo real** |
| **Formatos** | Ogg Opus: Chrome, Firefox, Edge, Android (Safari solo reciente); MP3: **todos**; AAC: solo con códecs propietarios (no está en el Chromium de las pruebas) | se envían **Ogg Opus y MP3**; se elige con `canPlayType` y, si la decodificación del primero falla, se prueba el segundo |
| **Segundo plano / llamadas** | la página oculta o interrumpida suspende el contexto (en iOS aparece el estado `interrupted`) | el motor suspende al ocultarse la página, reanuda al volver y al siguiente gesto si el sistema lo interrumpió |
| **Memoria** | un `AudioBuffer` decodificado ocupa 4 bytes por muestra y canal | solo hay en memoria lo que la zona usa; la música es **una pista a la vez más la entrante** |
| **Latencia** | Bluetooth añade 100 – 200 ms que ninguna página puede quitar | `latencyHint: 'interactive'`; los efectos van **sin retardo añadido** |
| **Pestañas y *WebViews*** | los *WebViews* (Capacitor) necesitan que el contenedor nativo permita el audio sin gesto; Safari limita los `AudioContext` | **un solo contexto** para todo el juego; documentado |

---

## 2 · Plan y estado

| Etapa | Qué | Estado | Dónde está la evidencia |
|---|---|---|---|
| **A** | Auditoría del audio, de los recursos, de las plataformas y del entorno | hecha | [§1](#1--etapa-a--auditoría-antes-de-tocar-una-línea) |
| **B** | Sistema central: contexto único, buses, volúmenes por categoría, polifonía, enfriamientos, carga perezosa, desbloqueo por gesto, pausa | hecha y **verificada en un Chromium real** | [§3](#3--etapa-b--el-motor), E2E `audio` (A–I) |
| **C** | Sonidos del protagonista, del combate, de los poderes y de las interacciones | hecha: 59 efectos, 36 señales del juego cableadas | [§4](#4--etapas-c-y-e--los-sonidos), E2E `audio` (C, J) |
| **D** | Música: exploración, zona peligrosa, jefe, transiciones suaves, momentos especiales | hecha con lo que **existe en el juego** (4 piezas, 3 *stingers*); **no hay música de menú porque no hay menú principal** | [§5](#5--etapa-d--la-música), E2E `audio` (D, J) |
| **E** | Ambientes por zona; sonidos de los enemigos y del jefe, con alertas audibles | hecha | [§4.3](#43-lo-que-pasa-en-un-lugar-y-los-enemigos), E2E `audio` (D, J) |
| **F** | Pausa, ajustes (general / música / efectos / ambiente), persistencia, menú | hecha | [§6](#6--etapa-f--integración), E2E `audio` (F, G), `settings`, `language` |
| **G** | Pruebas, balance de volúmenes por sonoridad medida, regresión, empaquetado, documentación | ver [§8](#8--etapa-g--pruebas-y-resultados) | [§8](#8--etapa-g--pruebas-y-resultados) |

**Reglas que se han mantenido todo el encargo.** (1) *Todo el audio nace de código de este repositorio* (`tools/audio`): ninguna muestra, ningún archivo descargado, ninguna melodía ni efecto de otra obra; cada archivo se reproduce byte a byte con `npm run audio:build`. (2) *El motor no toca el motor del juego*: la simulación sigue sin saber que existe el sonido; solo levanta las señales de siempre (ahora 36) y el sonido las lee. (3) *Nada del audio entra en el arranque en frío* (199.4 KB gz de 200): el motor, el director de orquesta y la carga viajan en un *chunk* que se pide cuando la página está ociosa. (4) *Lo que no se pudo comprobar se dice*.

---

## 3 · Etapa B — El motor

### 3.1 Qué es y dónde vive

| Módulo | Función |
|---|---|
| `presentation/audioMix.ts` (puro) | las cuatro categorías (`master`, `music`, `sfx`, `ambience`), sus valores por defecto (0.8 · 0.7 · 0.9 · 0.8) y a qué categoría responde cada *bus* (la interfaz sigue a los efectos) |
| `presentation/audioCues.ts` (puro) | las **36 señales** del juego (17 que ya había + 19 nuevas) con lugar, intensidad y variante |
| `audio/AudioDirector.ts` | escucha el bus de eventos de la simulación y entrega señales; añade `player:stepped` y `enemy:struck` (nuevos) y la variante del ataque en `enemy:telegraph` |
| `audio/levels.ts` | `Levels`: los cuatro niveles que eligió la persona; `gain` (el cuadrado del nivel) y `audible` (un nivel 0 es **silencio**: no se arranca, no se carga, no se mantiene) |
| `audio/manifest.ts` | el manifiesto `public/audio/index.json` (81 sonidos, 8 piezas) y su validación |
| `audio/loader.ts` | `SoundLoader`: carga por **grupos** (`core`, `boss`, `amb`, `amb.<cama>`, `music.<pieza>`, `music.<pieza>.drive`), con retención y liberación con gracia, tolerante a fallos |
| `audio/engine.ts` | `AudioEngine`: **el** contexto, los buses, el limitador, las voces |
| `audio/loops.ts` | `LoopChannel`: lo que suena sin parar (música y camas): una pieza a la vez, fundido cruzado, capas, sin dos copias |
| `audio/seam.ts` | cierra de nuevo la costura de un bucle ya decodificado (ver §3.3) |
| `audio/spatial.ts`, `audio/reverb.ts` | de dónde viene un sonido; el eco de cada sala (la respuesta al impulso se fabrica en el navegador, sin archivo) |
| `audio/soundMap.ts` (puro), `audio/zoneAudio.ts` (datos), `audio/ambience.ts` | qué sonido es para qué señal; qué suena en cada sala; los sonidos sueltos de un lugar |
| `audio/conductor.ts` | el **director de orquesta**: sigue al héroe y a lo que le pasa y decide la música, la cama, el eco, el suelo, el latido, los *stingers* |
| `app/audio.ts` | el *chunk* diferido que lo junta todo y lo entrega a `Game2D` |

**Grafo del motor** (un solo `AudioContext` para todo el juego, a 48 kHz):

```
 efectos ───────► envío al eco (por categoría) ─┐
 ambiente ──┐                                    ▼
 eco ───────┴───────► puerta del mundo ────────► general ─► limitador ─► compensación ─► altavoces
 interfaz ───────────────────────────────────────► (la pausa cierra la puerta; la interfaz no pasa por ella)
 música ─► atenuación ─► color (paso bajo) ──────►
 stingers ───────────────────────────────────────►
```

**Reglas del motor** (cada una tiene una prueba unitaria; las marcadas † además se han comprobado en un Chromium real):

- **Un contexto, creado en el primer gesto** (`pointerdown`, `pointerup`, `touchend`, `mousedown`, `keydown`, `click`). Antes de él no hay contexto: los sonidos se descartan **y se cuentan** (`dropped.locked`), la música «pedida» se recuerda y arranca al desbloquear. Los archivos se decodifican con un contexto *sin conexión*, así que **el primer toque ya encuentra los sonidos del héroe en memoria**†. Un contexto que el navegador deja `suspended` se reanuda en el siguiente gesto. `navigator.audioSession.type = 'playback'` donde exista.
- **Polifonía y enfriamientos**: cada sonido tiene su enfriamiento y su número de voces (la más antigua cede); el juego entero tiene **24 voces** y, si se llena, cede la menos importante (`priority` del manifiesto); un sonido menos importante que todas las que suenan se descarta y se cuenta (`dropped.full`). Una voz que se roba tarda ~25 ms en apagarse: **las fuentes en el grafo, voces que se apagan incluidas, no pasan de 24 + 12**†.
- **Variación controlada**: nunca la misma variación dos veces seguidas; tono y nivel varían dentro de lo que dice el manifiesto (± cents, ± dB) y **nada** si el manifiesto no lo dice.
- **Espacio**: un sonido con lugar se panea hacia su lado (máximo 0.8) y se aleja: pleno hasta 9 m, hasta un tercio a 48 m, nunca por debajo.
- **Eco por sala**: cada sala fija su eco (`rt60`, oscuridad, retardo, mezcla) y la respuesta al impulso se fabrica en el navegador; cambiar de sala es un fundido entre dos ecos. El envío al eco **pasa por el nivel de su categoría**†: el deslizador de efectos baja también su eco.
- **Música bajo los efectos**: un sonido con `duck` baja la música (−3 dB … −6 dB) y se la devuelve; la pausa la baja 8 dB y la apaga a 1100 Hz; la muerte la baja 13 dB y la apaga a 800 Hz. Los stingers van por su propio *bus*.
- **Niveles**: cada nivel se mueve con una **rampa** de 40 ms desde donde está (no `setTargetAtTime`: ver §3.2)†. Un nivel 0 se oye como silencio (peak 0 exacto)†.
- **Limitador**: un compresor a −2.5 dB, razón 20, con la compensación que le quita lo que el navegador le añade (×0.849)†. Con todos los volúmenes al máximo y una ráfaga de 600 peticiones, el pico medido a la salida va de −1.9 a −2.6 dBFS según la ejecución (el techo del limitador es −2.5)†.

### 3.2 Lo que el navegador real enseñó

Las pruebas unitarias hablan con un contexto falso que se escribió para este encargo. **Un contexto falso solo confirma lo que su autor ya creía.** Por eso se escribió una escena E2E (`audio`, §8) que usa el `AudioContext` de Chromium, sus decodificadores, el teclado de verdad y un `AnalyserNode` a la salida, y **encontró seis defectos que ninguna prueba unitaria veía**. Cada uno está corregido y guardado por una prueba que falla si vuelve (se comprobó quitando la corrección):

| # | Lo que se vio | Causa | Corrección | Quién lo guarda |
|---|---|---|---|---|
| 1 | La **costura de los bucles se reabría** al decodificar: la cama de las raíces, limpia al renderizar (un escalón de −69 dBFS), salía del decodificador Opus con un escalón de **−38 dBFS, ×18** el de sus vecinos — un tic cada 12 s | un códec con pérdida codifica el principio y el final de un archivo por separado: deja ráfagas de ruido en las primeras y últimas muestras y los dos extremos ya no se encuentran | `audio/seam.ts`: tras decodificar un bucle se **vuelve a dibujar el medio milisegundo de cada lado de la costura** como una cúbica entre la tendencia de antes y la de después (la técnica de un *declicker*). Se pierde una milésima de segundo de detalle por vuelta; se gana una costura sin escalón (todos los bucles, en los dos formatos: ×0.03–0.74 de los pasos de su entorno según la ejecución) | unitarias `seam.test.ts` (16), E2E `audio` B (12 bucles × 2 formatos), `audio:verify` |
| 2 | El **eco no seguía el deslizador** de efectos ni el de ambiente (a 0.45 en vez de 0.9 la salida solo bajaba ×0.66–0.79 en lugar de ×0.25) | el envío al eco salía antes de la ganancia de la categoría | dos *buses* de envío, uno por categoría, con su nivel | unitaria («turns the echo … down with the level of its category»), E2E `audio` E |
| 3 | El **primer sonido tras mover un deslizador sonaba al nivel antiguo** (×3.1 más fuerte, +10 dB) | en Chromium, el **primer** `setTargetAtTime` de un parámetro cuyo nodo estaba inactivo no se aplica hasta que le llega sonido (reproducido en una página aislada; una rampa lineal y la asignación directa no lo tienen) | `glide()`: cancelar lo programado, fijar el valor presente y subir/bajar con rampa lineal de 40 ms; puerta del mundo: 60 ms al cerrar, 250 ms al abrir | unitarias (`glide`, niveles, puerta), E2E `audio` E (el primer sonido tras mover el deslizador es ×1.0 del segundo) |
| 4 | **El compresor añadía +1.42 dB** en todo nivel bajo el umbral (un estallido de pico 0.0630 salía con 0.0742) | la especificación hace que el compresor añada su propia compensación `(1/ganancia en plena escala)^0.6` | `LIMITER_MAKEUP = 0.849`; la cadena es de ganancia unidad | E2E `audio` E («ui.tap» a plena potencia sale con el pico de su archivo más su recorte, ±1 dB) |
| 5 | **56 fuentes en el grafo con un límite de 24 voces** en una ráfaga de 600 peticiones en un cuadro | las voces robadas siguen en el grafo los ~25 ms de su fundido y, sin avanzar el reloj, se apilan | el límite cuenta las voces que suenan; las fuentes en el grafo se limitan a 24 + 12 y el resto se descarta y se cuenta | unitaria (ráfaga), E2E `audio` I |
| 6 | El **balance por sonoridad estaba medido sobre las muestras de origen**, no sobre el archivo que se reproduce: el Opus quita hasta 2 LU a un sonido brillante (el silbido de la espada) | la medición era anterior al códec | `audio:balance` decodifica los 260 archivos y fija el recorte con la **media de los dos formatos**; `audio:verify` lo comprueba | `audio:check`, `audio:verify`, unitarias de `tools/audio` |

Y **un límite de la verificación, dicho sin adornos**: el Chromium sin cabeza de este entorno **no aplica la regla de *autoplay*** (un contexto creado por una página que nadie ha tocado arranca `running` con cualquiera de las tres opciones de `--autoplay-policy`; medido). Lo que la escena comprueba es el **cierre propio del motor** (ningún `AudioContext` hasta el primer gesto, ni con un ratón que se mueve ni con la rueda) y, para el caso en que un navegador de verdad deje el contexto suspendido, el contexto falso con `blocked: true` de las pruebas unitarias. **La regla real de Chrome, Firefox y Safari de escritorio y de móvil no se ha visto.**

### 3.3 Los bucles y la memoria

- Un bucle se reproduce con `loop = true`, `loopStart = 0`, `loopEnd = buffer.duration` (no los segundos redondeados a milésimas del manifiesto, que acortarían la vuelta: se comprobó) y a velocidad 1. El navegador lo repite **sin hueco y sin solape**: el segundo giro de un renderizado sin conexión es idéntico muestra a muestra al búfer (diferencia máxima 1.5·10⁻¹¹), los 12 bucles, en Opus y en MP3†.
- **Una pieza de música a la vez más la que entra**; pedir la que ya suena no cambia nada (R1 → R2 comparten pieza y no se reinicia)†; pedir la que se está yendo la **trae de vuelta** en vez de arrancar una segunda copia; entre varias salas rápidas, jamás dos copias de una pieza ni más de dos piezas a la vez†.
- Las capas (`base`, `drive`) arrancan a la vez y giran juntas. **`drive` es perezosa**: es un grupo aparte, no se descarga hasta la primera amenaza, entra por donde va el bucle, y se suelta tras 20 s de silencio. Una categoría a cero **no descarga ni arranca nada** y recuerda lo que se le pidió†.
- **Memoria** (decodificada, float32): `core` 14.9 MiB, `amb` 7.7, `boss` 6.5, una pieza 15.7 MiB (+7.9 su `drive`), una cama 4.4. Se suelta un grupo de música o de cama **4 s** después de que el héroe lo deje y uno de efectos a los 20 s. En el recorrido R1 → R2 → R3 medido en el navegador hay **43 MiB** en la cámara y nunca más de ~66–70 MiB en el pico de un fundido†.
- Bajada: **5.8 MiB** (Opus) o **6.3 MiB** (MP3) para todo el juego; la sala 1 pide ~1.6 MiB.

---

## 4 · Etapas C y E — Los sonidos

### 4.1 Cómo suenan (y por qué se distinguen)

Cada familia tiene una **idea sonora propia** (están en la cabecera de cada módulo de `tools/audio/sounds/`): el espadazo es **aire** (ruido barrido con un hilo de energía), el golpe es **cuerpo** (un peso, una palmada, una burbuja de tinta) y el conjuro es **luz** (un zumbido brillante y un anillo), «para que en una pelea el oído sepa cuál de los tres oye»; el héroe es pequeño y ligero (pasos, tela y aliento, no una bota); la magia es luminosa y la botella es lo más cálido del juego (corcho, burbujas, una campana que sube); el limo es húmedo, bajo y lento y su ataque **se anuncia con un siseo que sube durante todo el viento y termina donde empieza el salto**; el Guardián es piedra, un gong y una voz que no es voz, y **cada uno de sus ataques se anuncia con un sonido distinto**; la interfaz es lo más callado y breve, madera suave y una campana leve. La verificación de que **no es un mismo sonido para todo**: ningún par de variaciones comparte archivo (prueba), y en el navegador 14 sonidos de 14 tipos salieron con 14 niveles de pico distintos.

| Familia | Sonidos | Variaciones | Para qué |
|---|---|---|---|
| `hero.*` | 19 | 45 archivos | pasos en piedra / tierra / suelo mojado, salto, salto en el aire, 2 *dashes*, 3 aterrizajes (ligero, medio, pesado), 4 espadazos (1.º, 2.º, aéreo, agachado), daño ligero y pesado, muerte, reaparición, latido |
| `hit.*` | 3 | 8 | golpe ligero, pesado, del conjuro |
| `magic.*`, `bottle.*` | 4 + 5 | 6 + 5 | cargar, soltar, chispa, denegado; empezar a beber, beber, denegado, interrumpido, lista |
| `interact.*`, `gate.*`, `seal.*`, `hazard.*`, `transition.*` | 4 + 2 + 2 + 1 + 1 | 6 + 2 + 3 + 2 + 1 | recoger, abrir, activar, descansar; puerta que abre y cierra; sello rechazado y roto; pinchos; paso de sala |
| `slime.*` | 4 | 7 | aviso, anuncio del salto, salto, muerte |
| `boss.*` | 7 | 9 | despertar, cambio de fase, muerte, anuncio y golpe de la carga, anuncio y golpe de la lluvia |
| `ui.*` | 7 | 7 | abrir y cerrar la pausa, tocar, deslizador, interruptor encendido / apagado, guardado |
| `stinger.*` | 3 | 3 | carta (3.8 s), habilidad (5.8 s), victoria (8.0 s) |
| `amb.*` | 7 | 14 | gota, piedra, ráfaga, crujido de raíces, resonancia lejana, pulso mágico, aliento del santuario |
| camas (`bed.*`) y piezas (`ruins`, `chamber`, `sanctum`, `warden`) | 4 + 8 capas | 4 + 8 | ver §5 |

### 4.2 Qué sonido es para qué momento

`soundMap.ts` es una tabla pura (señal + variante + intensidad → sonidos): el golpe de la espada y el del conjuro son sonidos distintos; un aterrizaje de menos de 0.1 no suena; un golpe es «ligero» o «pesado» según su fuerza; un primer espadazo es algo más suave que su remate; un paso es más bajo agachado y suena a la superficie de la sala (piedra / tierra / mojado). Un paso, un salto, un aterrizaje, un golpe, el daño, la muerte y todos los demás están **comprobados en juego real con el teclado de verdad** (E2E `audio` J: salto → aterrizaje, 2 pasos en piedra, espadazo antes del golpe que da, grito de dolor, muerte, reaparición, conjuro y su impacto, botella, limo —aviso, anuncio, salto, muerte—, paso de sala, Guardián —despertar, anuncios y golpes, muerte, victoria—).

### 4.3 Lo que pasa en un lugar y los enemigos

- **Ambientes por zona** (`zoneAudio.ts`, datos): R1 viento en mampostería rota (cama + ráfaga + piedra); R2 las raíces (zumbido bajo + goteo + crujido de madera) y pasos de tierra; R3 agua honda y magia leve (goteo, resonancia lejana, pulsos del sello) y suelo mojado; R4 una quietud enorme (aliento del santuario, pulsos, piedra). Cada sala tiene **su eco**: R1 1.8 s, R2 1.0 s, R3 2.6 s, R4 2.8 s. Al entrar en una sala la cama anterior se funde (2.5 s) y la nueva entra; los grupos que la sala necesita se retienen y los de la anterior se sueltan con gracia†.
- **Alertas audibles**: el limo avisa al verte, anuncia su salto y salta; el Guardián despierta con su sonido y **anuncia cada ataque con un sonido propio**. Además la música lo sabe: ante cualquier amenaza (alerta, anuncio, daño al héroe, golpe a un enemigo) entra la **capa `drive`** de la pieza durante 7 s de **tiempo de juego** (2.5 s tras una muerte), con la pausa congelándola†; en un jefe entra a media (0.45) y a plena en la segunda fase.
- **Latido**: con la vida del héroe al 34 % o menos suena su corazón, más rápido cuanto menos queda.

---

## 5 · Etapa D — La música

Cuatro piezas **originales**, escritas para este juego en código (`tools/audio/music/`), con dos capas cada una (`base`: la exploración; `drive`: lo que entra cuando algo está cerca), y cuatro camas de ambiente:

| Pieza | Dónde | Tonalidad / tempo | Compases · duración | Carácter |
|---|---|---|---|---|
| «Ruinas» | R1 y R2 | re menor · 66 | 12 · 43.6 s | alguien muy solo entrando en algo muy viejo: un pad que se abre despacio, un sub que sigue Dm–B♭maj7–Gm–C–B♭–A, campanas de cristal esparcidas, cuerdas pulsadas desde el compás 6; `drive`: tambor grave, bajo pulsado, un reloj de ticks y un arco sin resolver |
| «Cámara» | R3 | fa♯ menor con 2.ª bemol · 64 | 12 · 45.0 s | un sello bajo el agua: un dibujo de cuerdas pulsadas que no se detiene, voces tarareadas a medio tono de la raíz, campanas FM; `drive`: el sello despierta (tambor como un corazón, arco que roza medio tono) |
| «Santuario» | R4 (entrada y descanso) | la menor · 56 | 10 · 42.9 s | la calma antes del Guardián: un coro «de nadie» en quintas abiertas, un gong, un violonchelo que cae por grados, una campana que repica de tarde en tarde |
| «El Guardián de tinta» | jefe | re menor, 2.ª bemol · 108 | 16 · 35.6 s | no respira, marcha: tambores tipo taiko que nunca caen donde se espera, un bajo arqueado en corcheas, coro que golpea el primer tiempo; `drive`: sesenta y cuatro en semicorcheas, doble tambor, segundo *riser* |

**Transiciones.** Entre zonas: fundido cruzado de 3.5 s; al jefe: 1.2 s (la pelea ha empezado); al salir de él: 4.5 s; al caer el jefe: silencio de 1.6 s y la calma vuelve a los 2.4 s de juego; al morir el héroe se baja la música 13 dB y se apaga (800 Hz) y vuelve al reaparecer; **la música es estado, no evento**: pedir la pieza que ya suena no cambia nada, así que reconstruir una sala (reaparecer, cambiar la calidad, recargar) no la reinicia†. Los *stingers* (carta, habilidad, victoria) esperan un cuadro por los demás del mismo momento y **solo suena el mayor**.

**Seguridad de los bucles**: cada pieza se renderiza más larga que su vuelta y lo que sobra (colas, reverberación) se pliega sobre el principio; los filtros y el limitador corren de forma circular; la modulación del reverb es periódica. Es lo que hace que la costura *renderizada* cierre (todas: paso ≤ 3.5, o salto ≤ −45 dBFS); el §3.2 explica lo que el códec le hace después y cómo se repara.

---

## 6 · Etapa F — Integración

- **Cuatro deslizadores** en Ajustes → Sonido: General, Música, Efectos, Ambiente (es / en). Ajustes pasa a **v5** (`volume: { master, music, sfx, ambience }`) con migración desde v4 (conserva el general; las otras tres entran con sus valores por defecto), archivo dorado `settings.v5.json` y reparación de valores rotos. **Un nivel 0 es «Silenciado»**: la categoría no se arranca, no se descarga y no se mantiene en marcha†, y el deslizador lo dice (`aria-valuetext`). Cada cambio se oye **al instante** y se **guarda**; recargar arranca con ellos antes de tocar nada†.
- **Pausa**: el menú cierra la **puerta del mundo** (efectos y ambiente callan, las voces del mundo se paran, no se arrancan otras: `dropped.paused`), la música se baja 8 dB y se apaga, y la interfaz sigue sonando†. Al reanudar todo vuelve **sin reiniciar nada**†. El reloj de lo que depende del tiempo del mundo (amenaza, sonidos sueltos, latido, retardos) es **tiempo de juego**: durante la pausa no avanza.
- **Página en segundo plano**: el contexto se congela (`suspended`) y se despierta al volver† (una página que se va a segundo plano abre el menú de pausa, como ya hacía; los sonidos del mundo vuelven cuando la persona reanuda).
- **Sonidos del menú** (nuevos): tocar un botón, mover un deslizador, encender / apagar un interruptor (se oye hacia dónde va, ya con el estado nuevo) y guardar la partida (solo si se guardó). «Continuar» no suena porque ya suena el cierre del menú. Los hace el propio `PauseMenu` con tres oyentes en su raíz; ninguna pantalla sabe que existe el sonido.
- **La pantalla de Ajustes es más alta** (cuatro deslizadores de sonido en vez de uno: **+145 px**): en una ventana de escritorio de 1280 × 720 ya no cabe entera, se desplaza y lo dice con el mismo difuminado que en el teléfono (el aviso de «hay más abajo» ya lo tenía desde el Prompt 14). Lo vio la corrida completa, no una prueba nueva: la escena `accessibility` afirmaba que a 1280 × 720 «cabe entera». Ahora comprueba lo que de verdad importa —que **el difuminado sea cierto**: aparece si hay algo más abajo y solo entonces, a 720 y a 960 px de alto, y al volver— y que en una ventana alta (960) la pantalla cabe sin difuminado.
- **Cambio de idioma, calidad, teclas, accesibilidad, partidas**: sin cambio de comportamiento (las pruebas E2E que ya existían pasan con el sonido encendido; **dos tuvieron que ajustar su instrumento** —`touchEditor` esperaba el archivo de ajustes en v4, `accessibility` la pantalla de ajustes a 1280 × 720 sin desplazamiento— y ninguna afirmación sobre el juego se tocó).

---

## 7 · La herramienta (`tools/audio`) y la procedencia

**Qué es.** Una cadena de producción **determinista** escrita en TypeScript: osciladores, ruido, filtros biquad, reverberación (red de retardos con realimentación), compresión, limitación, Karplus–Strong, campanas FM y aditivas, coro por formantes, un «escenario» que pone instrumentos en el tiempo y cierra el bucle. Cada receta tiene su semilla (`seedOf(id)`): **el mismo código da los mismos bytes**. `ffmpeg` solo **codifica** (Ogg Opus y MP3) y dibuja espectrogramas; no es una dependencia del juego.

| Orden | Hace |
|---|---|
| `npm run audio:build [-- --only=hero.,ui.]` | renderiza, mide (sonoridad BS.1770, pico, silencios, costura), codifica en los dos formatos, nombra cada archivo por el *hash* de su contenido y escribe el manifiesto y `tools/audio/measures.json`; después decodifica los archivos y fija los recortes |
| `npm run audio:balance` | vuelve a medir **lo que decodifica un navegador** y fija el recorte (`gainDb`) de cada sonido para que llegue a la sonoridad de su clase (`tools/audio/levels.ts`) |
| `npm run audio:check` | rápido (sin ffmpeg): archivos, manifiesto, recetas, lo que el juego pide, niveles, picos, silencios, costuras, tamaño (≤ 16 MiB entre las dos copias) |
| `npm run audio:verify` | lento (~12 s): decodifica los 260 archivos y mide largo, pico con recorte, sonoridad frente al objetivo, dispersión entre variaciones y costura (como sale del decodificador y ya reparada) |
| `npm run audio:spec -- <id>` | un espectrograma y una forma de onda de un sonido o una pieza, para **mirar** lo que no se puede oír |

**Procedencia y derechos.** Los 260 archivos de `public/audio/` los genera ese código a partir de **nada** (ruido pseudoaleatorio con semilla y funciones matemáticas). No hay muestras, grabaciones, bancos de sonidos, descargas ni modelos de terceros; no se ha copiado ni imitado a propósito ninguna melodía, motivo ni efecto de *Hollow Knight*, de *Solo Leveling* ni de ninguna otra obra. Las progresiones armónicas (menor natural, 2.ª bemol, quintas abiertas) y las escalas son material común; las melodías son notas escritas a mano en las partituras de `tools/audio/music/`. Nadie puede garantizar que una frase de cuatro notas no se parezca a otra de algún sitio: lo que sí se puede decir es que **no sale de ninguna parte**. Licencia: la del repositorio.

---

## 8 · Etapa G — Pruebas y resultados

### 8.1 Qué se ejecutó y qué dio

| Qué | Resultado |
|---|---|
| `npm run check` (tipos + pruebas) | tipos limpios; **206 archivos, 3 435 pruebas, todas pasan** (al cerrar el Prompt 17: 196 archivos y 3 187 pruebas). Nuevas o ampliadas en este encargo: motor, cargador, canales de bucle, director de orquesta, tabla de sonidos, señales, contrato, juego completo con el motor (`gameAudio`), costuras (`seam`), niveles y espacio, herramienta (`audioDsp`, `audioCheck`), menú (`pauseMenu`, `pauseMenuWiring`), ajustes v5 y movimiento / limo (los pasos y el aviso del salto) |
| `npm run build` | `tsc` + `assets:check` + `hud:check` + `vite build`: limpio. El audio entra en `dist/` (12.1 MiB: las dos copias, solo se descarga una) |
| `npm run audio:check` | 81 sonidos, 8 piezas, 260 archivos, 12.1 MiB: **0 errores, 0 avisos** |
| `npm run audio:verify` | 260 archivos decodificados con un decodificador que no los hizo: **0 errores, 1 aviso** (`hazard.spikes`, 1.4 LU bajo su objetivo por el techo de su pico). Mayor pico decodificado con su recorte: −1.04 dBFS; la mayor distancia de sonoridad al objetivo en la variación más fuerte de un sonido: 1.4 LU; la mayor dispersión entre variaciones: 2.9 LU; **todos los bucles cierran tras repararse, en los dos formatos**; los 4 que el decodificador deja abiertos tal como salen son los de la nota 1 de §3.2 |
| `npm run bench:bundle` | arranque en frío de R1: **204 792 bytes gz de los 204 800 del techo — quedan 8 B** (antes del Prompt 18: 204 186, es decir 614 B de margen; el encargo costó 606 B de código del primer fotograma); el sonido viaja en un *chunk* de 13.7 KB gz que se pide cuando la página está ociosa |
| E2E en desarrollo | **57 escenarios: 55 pasaron a la primera en la corrida completa (32 min); 2 fallaron por instrumentos que el encargo dejó viejos** —`touchEditor` esperaba el archivo de ajustes en v4 (ahora v5) y `accessibility` afirmaba que la pantalla de Ajustes cabía entera a 1280 × 720 (con cuatro deslizadores ya no cabe: §6)—; **corregidos y vueltos a correr, pasan** (122 s y 31 s). Ninguna afirmación sobre el juego se tocó |
| E2E contra el *build* de producción | **57 de 57 escenarios pasan** (≈ 35 min, sobre el *build* de arriba, con las dos escenas corregidas incluidas) |
| `?hooks=1&audio=on` en E2E antiguas | las escenas que ya existían (`settings`, `language`, `audio-cues`, `pause`…) pasan sin tocar sus aserciones de comportamiento; se adaptaron `settings` (cuatro deslizadores, v5), `language` (el texto nuevo) y `audio-cues` (las variantes y la cuenta) |

### 8.2 La escena E2E `audio` (Chromium real; ~4 min)

Diez secciones; cada una es una pregunta que solo un navegador de verdad puede contestar. Las cifras son las de la última ejecución (varían unas décimas de una a otra):

| § | Pregunta | Respuesta medida |
|---|---|---|
| A | ¿No hace nada la página hasta que se la toca? | ningún `AudioContext` (el contador de la sonda lo confirma) antes del primer gesto, ni con un ratón que se mueve ni con la rueda; los sonidos se descartan y se cuentan (`dropped.locked`); **42.9 MiB ya decodificados** antes de tocar nada (los archivos se decodifican con un contexto sin conexión); tras una tecla, un contexto a 48 kHz y la música a −30…−34 dBFS |
| B | ¿Se repiten los bucles sin hueco, y cierran? | los 12 bucles × 2 formatos miden lo que dice el manifiesto (±0.44 ms: el manifiesto guarda milisegundos); el segundo giro de un renderizado sin conexión **es idéntico al búfer** (diferencia máxima 1.5·10⁻¹¹); el motor los configura con `loopEnd = duración del búfer` y velocidad 1; **el códec había abierto 3 costuras** (las camas de las raíces, de las ruinas y de la cámara) y el cargador las cierra: ×0.03–0.74 de los pasos de su entorno, en los dos formatos |
| C | ¿Suena cada clase de sonido, sin pasarse de la escala, con la jerarquía del balance? | 14 sonidos de 14 clases: picos de −24 a −6 dBFS (paso −13, espadazo −12, grito de dolor −7, golpe pesado −8, interfaz −24); un grito se alza **16–17 dB sobre la música**; un *stinger* suena con la música encendida y no con ella a cero |
| D | ¿Sigue la música al héroe por salas de verdad? | R1 → R2: la misma pieza, **una sola vez arrancada**; R2 → R3: fundido cruzado a «Cámara» (dos fuentes, dos piezas), las Ruinas se sueltan de memoria; **43 MiB** en la cámara; cuatro cruces rápidos sin una sola pieza duplicada ni más de dos a la vez |
| E | ¿Hace caso cada deslizador, y solo el suyo? | la mitad del deslizador es un cuarto de la ganancia (−9.5 a −13.9 dB en ambiente, general y efectos: la cama varía de una ventana a otra); **cero es silencio exacto** (pico 0) y solo calla su categoría; **a plena potencia un sonido sale con el pico de su archivo más su recorte (±1 dB)**; **el primer sonido tras mover un deslizador ya está al nivel nuevo** |
| F | ¿Qué hace la pausa? | la música baja 9–12 dB y vuelve en ±1.7 dB; el mundo calla; la interfaz suena; **ningún bucle se reinicia**; el primer espadazo tras el menú sale a ×0.82–1.19 de su nivel; la página en segundo plano congela el contexto y lo despierta |
| G | ¿Se guardan y se recuerdan los volúmenes, por el menú de verdad? | los cuatro deslizadores se oyen al moverse (`ui.slider`), un botón se oye (`ui.tap`), se guardan y la página siguiente arranca con ellos; **una categoría a 0 no se descarga ni se arranca** (`music.ruins` sigue sin cargarse tras 2.5 s) y entra al subirla |
| H | ¿Y si falla la red? | cinco páginas: **sin ningún archivo de sonido** (el juego corre, dice cuántos faltan), **con los Opus rechazados** (110 MP3 los sustituyen y los 12 bucles cierran también en MP3), **sin manifiesto** (ni un contexto), **un archivo que no es audio** (el sonido sigue con sus otras variaciones), **música que tarda 3 s** (los efectos no esperan, y arranca una vez) |
| I | ¿Y una tormenta de sonidos? | 600 peticiones en un cuadro (5–8 ms de la página): **36 empezaron, 22 voces se cedieron, 564 se descartaron y se contaron**; a lo sumo 15 voces y 36 fuentes en el grafo; pico entre −1.9 y −2.6 dBFS con todos los volúmenes al máximo (techo del limitador −2.4); todo termina y se suelta |
| J | ¿Suena el juego jugado? | salto → aterrizaje, dos pasos en piedra, espadazo antes del golpe que da, grito, muerte (la música se atenúa y se quita el peligro), reaparición, conjuro y su impacto, botella, **limo** (aviso, anuncio, salto, muerte; **la capa `drive` se descarga cuando llega el peligro, entra en el mismo punto del bucle que la base y se va a los 7 s de juego**), paso de sala, **Guardián** (despertar, **su propia pieza** con el fundido de la calma, anuncios y golpes, caída, silencio, victoria, la calma de vuelta) |

### 8.3 Que la prueba falla si se quita la corrección (mutaciones comprobadas a mano)

| Se quitó | La prueba que lo vio |
|---|---|
| el cierre de costuras en el cargador | E2E `audio` B («the seam of every loop was looked at») y 4 unitarias (cierra la costura de un bucle, y solo de un bucle; cuenta lo que encontró; guarda el informe) |
| el envío del eco por el nivel de su categoría | unitaria («turns the echo … down with the level of its category») |
| `glide` (las rampas) por `setTargetAtTime` | E2E `audio` E («the first sound after the slider moved is at its new level (x3.14 …)») |
| el tope de fuentes en el grafo | unitaria de la ráfaga y E2E `audio` I |
| el enfriamiento de un sonido (puede repetirse tan rápido como se pida) | unitaria del motor («keeps a sound from repeating faster than its cooldown») |
| el tope de voces de **un** sonido | unitaria («gives a sound no more voices than the manifest allows…») |
| el tope de voces de **todo** el juego | 3 unitarias (el límite, el descarte del que importa menos, la ráfaga) |
| la pausa del mundo (sus sonidos siguen sonando) | unitaria («silences the world — its voices stop, its sounds are not started — and leaves the interface its voice») |
| el silencio de una categoría a cero (sigue sonando) | 2 unitarias del motor y 3 de los niveles |
| las rampas de los niveles (saltan de golpe) | 5 unitarias (`glide`, niveles, puerta del mundo) |
| el cargador suelta un grupo aunque otro que lo retiene siga ahí | unitaria del cargador («lets a group go a while after the last holder has…») |
| `audible`: una categoría a cero deja de ser silencio | 3 unitarias |
| la interfaz sigue el volumen de la música y no el de los efectos (`categoryOfBus`) | 3 unitarias |
| la cama de R2 (la de R1 en su lugar) | 2 unitarias («shares a piece of music between R1 and R2…», «plays the right piece and the right bed in each place…») |
| la pausa que llega del director al motor | unitaria del director de orquesta («keeps the music dimmed through a pause…») |
| **el contexto congelado deja sonar** (se quita la comprobación `running`) | **ninguna: el mutante sobrevivía.** Se escribió «starts nothing while the context is frozen…» (un sonido pedido con la página en segundo plano se suelta, no se encola) y ahora muere |
| **el umbral del aterrizaje** (`LAND_SILENCE` a 0) | **ninguna: sobrevivía**, porque la prueba usaba la propia constante («`LAND_SILENCE − 0.01`»). Se añadieron valores literales (0.05 calla, 0.15 suena) y ahora muere |
| **la pieza que ya suena se arranca de nuevo** (se quita la guarda de `play`) | sobrevivía **porque `start` tiene la misma guarda** (defensa por duplicado, no un hueco): quitando **las dos**, mueren 4 unitarias («does nothing when it is asked again for the piece that already plays», «never has more than one copy of anything…»…) |

*Cómo se hicieron las de las pruebas unitarias.* A mano, con un guion que cambia una línea del código, corre las pruebas que deberían verlo y devuelve el archivo byte a byte (`cmp`): **15 mutantes de una línea**. **Doce murieron a la primera. Tres sobrevivieron**: dos eran **huecos reales de las pruebas** (el contexto congelado y el umbral del aterrizaje, arriba), que se reforzaron y ahora mueren; el tercero era una **guarda duplicada a propósito** y muere quitando las dos. Las cuatro primeras filas son las del navegador real y se hicieron durante el encargo, con la escena `audio`.

*Una mutación que no se vio:* la puerta del mundo con `setTargetAtTime` (el original) **no** falló en la sección F: en este Chromium el primer cambio de **esa** puerta no se retrasa (los buses de efectos y de interfaz sí). La comprobación se queda (el primer espadazo tras el menú está a su nivel), pero **no** detecta ese defecto concreto.

### 8.4 El balance de volúmenes

Los niveles no son un accidente de cómo se hizo cada sonido: se **fijan** por clase en `tools/audio/levels.ts` (en LUFS, lo más fuerte de 400 ms para un sonido de menos de 3 s, entero para los demás) y `audio:balance` pone el recorte de cada sonido midiendo **el archivo decodificado** (la media de Opus y MP3; el códec le quita hasta 2 LU a un sonido brillante). Con los volúmenes por defecto (música 0.7 → −6.2 dB, efectos 0.9 → −1.8 dB, ambiente 0.8):

| Clase | Objetivo (LUFS) | Respecto a la música (−20 → −26.2 con su volumen; el volumen general sube o baja a todos por igual) |
|---|---|---|
| paso, latido, interfaz | −28 … −25 (+ efectos: −1.8) | 0.5 … 4 LU **por debajo** |
| salto, *dash*, aterrizajes ligero y medio | −25 … −21 | de al mismo nivel a 3.5 LU **por encima** |
| espadazo, golpe pesado, conjuro | −19 … −17 | 5 … 7 LU **por encima** |
| daño pesado, muerte, sello roto, jefe | −15 … −14 | 9 … 10 LU por encima |
| camas de ambiente | −32 … −30 (+ ambiente: −3.9) | 8 … 10 LU **por debajo** |
| sonidos sueltos de un lugar | −31 … −28 (+ ambiente: −3.9) | 6 … 9 LU por debajo, y lejos |

Es una decisión de ingeniería de sonido hecha **con instrumentos y no con oído**: lo que en el balance «suena bien» a una persona no se ha comprobado.

### 8.5 Cómo se encontró cada cosa (para quien herede esto)

Lo que más rindió, por orden: (1) una escena que use el `AudioContext` de verdad y mire la salida con un `AnalyserNode` (encontró todo lo de §3.2); (2) reproducir cada hallazgo **aislado** en una página de cuatro líneas antes de arreglarlo (así se supo que el primer `setTargetAtTime` de un nodo ocioso es el que se retrasa, y que el compresor añade ×1.178); (3) decodificar los archivos que se envían con otro decodificador (`audio:verify`) en lugar de fiarse de las muestras de origen; (4) medir el arranque en frío en bytes, no en kilobytes redondeados.

---


## 9 · Lo que sigue sin existir

Dicho sin adornos, por si alguien lee solo esto:

1. **Ni una nota ni un efecto de este encargo ha sido oído por una persona.** Se han juzgado con instrumentos: espectrogramas, perfil de bandas por octavas, análisis de cromas y de ataques, sonoridad y pico, costuras, y —en el navegador— el pico y el RMS a la salida del grafo. Que **«suene bien»**, que la melodía guste, que un efecto dé la sensación buscada, **no está verificado y no se afirma**.
2. **Es audio sintetizado de pre-producción, no una banda sonora profesional.** No hay instrumentos grabados, ni voces, ni foley. Las campanas son FM, el «coro» son formantes, el «tambor» es ruido y sinusoides. Una banda sonora de producción exige un compositor, instrumentistas y un diseñador de sonido: este encargo deja una **base completa, conectada, medida y sustituible** (el manifiesto es datos; cambiar un archivo no toca código).
3. **Música que no existe porque el juego no tiene dónde ponerla**: música de **menú principal** o de título (no hay menú principal: la pausa es un menú, no una pantalla), música de **créditos** o de final (no hay final), una pieza distinta para la segunda fase del jefe (cambia la intensidad de la capa `drive`, no la pieza), música de salas que el juego aún no tiene.
4. **Sonidos sin recurso definitivo** (todos son sintetizados; los que más piden sustitución por un trabajo profesional): los pasos, que son los más difíciles de hacer creíbles sin grabación; la voz de los enemigos y del jefe; los espadazos; el coro de la música; las campanas.
5. **Eventos sin sonido propio a propósito**: el descanso en el santuario suena por el punto de control (no por el objeto, para no sonar dos veces); `enemyAlert` / `enemyStrike` / `enemyTelegraph` / `bossAttack` de variantes que no existen (solo hay limo y Guardián); cualquier cosa del HUD (no se ha pedido).
6. **Plataformas que no he visto**: Safari y iOS (el desbloqueo con `touchend`, el interruptor de silencio, `audioSession`, el estado `interrupted`, la **decodificación sin hueco de MP3**, que en un decodificador que no lea la información de relleno añadiría ~23 ms al principio de cada vuelta), Firefox, Android, WebViews, **cualquier dispositivo real**, auriculares Bluetooth. Solo se ha ejecutado en un Chromium 141 sin cabeza.
7. **La regla de *autoplay* no se ha visto** (el Chromium sin cabeza no la aplica; ver §3.2). Con **mando** no se puede desbloquear el audio: los navegadores no cuentan un botón de mando como gesto, así que quien juegue solo con mando oirá cuando toque una tecla, el ratón o la pantalla.
8. **Memoria y CPU en un móvil**: el pico decodificado ronda los 66–70 MiB en un fundido; en un teléfono modesto no está medido. No hay *worklets*: el trabajo de decodificación y mezcla lo hace el navegador fuera del hilo principal, pero **no se ha medido el coste real en un dispositivo lento**.
9. **Accesibilidad**: el aviso de cada ataque del Guardián tiene también marca visual (ya la tenía); no hay subtítulos de sonidos ni opción de «mono». La función `reduceFlashes` y las demás no cambian.
10. **Nada de lo anterior impide jugar**: sin archivos, sin manifiesto, sin formatos reproducibles, con la regla de *autoplay* sin cumplir, con la página en segundo plano o con el audio apagado (`?audio=off`) el juego funciona entero, en silencio (E2E `audio` H).

---

## 10 · Cómo se usa

- **`?audio=on|off`** (por defecto *on*; con `?hooks=1` por defecto *off*, y `?audio=on` lo enciende). Una página sin `public/audio/index.json` no pide ni un archivo.
- **Ganchos de pruebas** (`?hooks=1`): `audio()` (motor, canales, director, cargador, medidor), `audioMeter()`, `playSound(id, petición)`, `setLevel(categoría, nivel)`, `audioWarm(grupos)`.
- **Cambiar un sonido**: editar su receta en `tools/audio/sounds/` o `tools/audio/music/`, `npm run audio:build`, y `npm run audio:check && npm run audio:verify`. Sustituirlo por un archivo profesional: dejar el archivo en `public/audio/<tipo>/`, ajustar la entrada del manifiesto (`index.json`) y volver a pasar `audio:balance`.
