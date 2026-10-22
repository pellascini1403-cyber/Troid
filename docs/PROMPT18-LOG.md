# Prompt 18 — El audio: un motor de sonido, una banda sonora y los efectos del juego, hechos en este repositorio y conectados a lo que de verdad pasa

> Documento de trabajo del encargo «implementación de audio profesional». Se va completando por etapas (A: auditoría · B: motor · C: efectos del protagonista · D: música · E: ambientes y enemigos · F: pausa, ajustes y guardado · G: pruebas y cierre). Lo que no esté terminado lo dice.

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

## 2 · Plan

(se completa a medida que avanzan las etapas)
