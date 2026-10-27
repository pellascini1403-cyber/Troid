# Publicar Troid — qué está hecho, qué se comprobó y qué falta

> Guía para quien publique el juego (iOS, Android, escritorio, web). **Dice la verdad sobre el estado:** el repositorio contiene un juego completo y probado **como página web**; todo lo que exige una cuenta, un dispositivo, un certificado o una tienda **no se ha podido hacer desde el entorno de desarrollo** y está aquí como lista de pasos, no como hecho. Nada de lo que sigue afirma que el juego esté publicado, aprobado o probado en un dispositivo físico.
>
> Bitácora del encargo que lo produjo: [PROMPT20-LOG.md](PROMPT20-LOG.md).

---

## 1 · Qué es lo que hay

| Pieza | Estado |
|---|---|
| **El juego** (Vite + TypeScript + PixiJS 8, 2D) | Una aventura de **siete zonas y 64 salas** —14 arquetipos de enemigo, 7 jefes, 6 habilidades, 16 mejoras, 10 lugares escondidos, 15 santuarios—, con mapa, guardado, ajustes y **final real con créditos**. Contenido nuevo se añade como datos (`src/content`) sin tocar el motor. **Lo que no se cumple del encargo del Prompt 21:** la duración de 3–5 h (se estima en 1–2,5 h y **nadie la ha medido**) y que **una persona haya jugado el mundo**; enemigos y jefes nuevos con siluetas procedurales y una sola pieza de música para los siete jefes: [PROMPT21-LOG §11 y §12](PROMPT21-LOG.md#11--estado-final-por-objetivo-del-encargo). |
| **Build de producción** | `npm ci && npm run build` → `dist/` (JS de la primera pantalla: **203 236 B gz** de un techo de 204 800; 12 ficheros; el mundo posterior al Santuario —60 salas, 13 criaturas, 6 jefes y su código, 27,5 KB gz— viaja en un *chunk* aparte que se pide en cuanto el primer fotograma está en pantalla). Base relativa (`./`): funciona desde un servidor, desde una subcarpeta y dentro de un WebView que sirva los ficheros por `http(s)` o por un esquema propio (como hace Capacitor). **No se abre con doble clic desde `file://`**: el navegador bloquea los módulos de una página sin origen (comprobado en Chromium: «blocked by CORS policy»; el juego lo dice en la cortina de arranque en lugar de quedarse negro). Sirva `dist/` con cualquier servidor estático (`npm run preview`, `npx serve dist`). |
| **Pruebas** | `npm run check` (tipos + unitarias e integración: **4 640 pruebas** en 249 archivos), `npm run test:e2e` (66 escenas en Chromium real, desarrollo y `-- --prod`: **66 de 66 contra el *build* de producción**, **66 de 66 en desarrollo**) y `npm run test:engines -- --browser=firefox\|webkit` (humo de once comprobaciones; en la CI). Ver [PROMPT21-LOG §10](PROMPT21-LOG.md#10--pruebas-y-lo-que-se-ejecutó) y [PROMPT20-LOG §10](PROMPT20-LOG.md). |
| **Cáscara nativa (iOS / Android)** | **No existe en el repositorio.** El juego está preparado para vivir dentro de Capacitor (guardado nativo, botón Atrás, pausa al pasar a segundo plano, aviso de orientación) **pero no hay proyecto Xcode ni Android Studio**: se crea con los pasos de la [§6](#6--ios-y-android-con-capacitor-pasos-externos). |
| **Instaladores de escritorio** | **No existen.** Hoy el escritorio es el navegador (o una página alojada). Ver [§8](#8--escritorio). |
| **Monetización** | **Ninguna, por decisión de ausencia:** sin anuncios, sin compras, sin analítica, sin cuentas. Ver [§3](#3--monetización). |

---

## 2 · Lo que se comprobó, y lo que NO

| Plataforma / aspecto | Cómo se comprobó | Resultado |
|---|---|---|
| Chromium de escritorio (teclado, ratón) | E2E con Chromium real (render por software), desarrollo y producción | ✅ |
| Móvil y tableta, **emulados** (ventanas de 667×375 a 1260×540, vertical, inserciones de seguridad simuladas, toques reales por el protocolo de Chromium, varios dedos) | E2E `mobile`, `touch`, `touchEditor`, `focus` | ✅ — **no** es un dispositivo |
| Mando | un mando *abstracto* con la forma de `navigator.getGamepads()` (`VirtualPad`) en pruebas unitarias, de integración y E2E | ✅ — **ningún mando físico** probado |
| Navegador sin WebGL | E2E `resilience` contra el *build* de producción: el juego cae al *canvas*, el héroe corre, **golpea y las partículas se dibujan sin que falle un fotograma** (lo último lo corrigió Firefox en la CI: el primer golpe lo rompía) | ✅ |
| Pérdida de contexto WebGL | E2E (`WEBGL_lose_context`) | ✅ |
| Fugas en sesión larga | E2E `resilience` (listeners, temporizadores, DOM, *heap*) | ✅ en Chromium |
| Privacidad: todo lo que sale y todo lo que se guarda | E2E `privacy` | ✅ ([§4](#4--privacidad-y-cumplimiento)) |
| Abrir `dist/index.html` con doble clic (`file://`) | Chromium real | ❌ **no arranca** (CORS de los módulos desde `file://`); el juego lo dice en la cortina de arranque. Se sirve con cualquier servidor estático ([§7](#7--web-alojar-dist)) |
| Política de seguridad de contenido (CSP) | Chromium real, con tres políticas | ✅ con `'unsafe-eval'` (y el script en línea por *hash* o `'unsafe-inline'`); ❌ sin `'unsafe-eval'` el juego no arranca y lo dice ([§7](#7--web-alojar-dist)) |
| Legibilidad (contraste WCAG ≥ 4,5 : 1, letra ≥ 11 px) | E2E `readable` | ✅ en las 16 pantallas medidas |
| Navegadores mínimos | Análisis **estático** del JS construido (`esbuild` a `safari15`, `chrome98`, `firefox100`) y de las APIs usadas | mínimo derivado: **iOS/Safari 15.4, Chrome/WebView 98, Firefox 100** — *no ejecutado en ellos*. Una degradación conocida en Safari < 16: `overscroll-behavior` (lo usan el cuerpo de la página y los paneles con desplazamiento del menú) no existe y se ignora —el menú puede «rebotar» al final de su desplazamiento—; el juego en sí no depende de ello (`touch-action: none`) |
| Firefox 155 y WebKit 26.6 (Playwright, Linux, sin cabeza) | Humo de once comprobaciones contra el *build* de producción en la CI (`npm run test:engines`): arranca, dibuja, mueve, ataca, pausa, guarda y recarga, suena (formatos), un toque real cierra el menú sin atacar | ✅ en los dos (Firefox dibuja con *canvas*: ahí no hay WebGL; WebKit, con WebGL) — **no** son un Firefox de escritorio ni un Safari de iPhone; el contexto de audio de Firefox quedó bloqueado en el ejecutor (a comprobar con un Firefox real) |
| **Safari de iOS, Firefox de escritorio con GPU, Android WebView reales** | **No hay** esos navegadores ni dispositivos en el entorno | ❌ sin comprobar |
| **Rendimiento en un móvil de gama baja** | El render por software de este entorno no sirve como cifra | ❌ sin medir (hay presupuestos que el E2E vigila: ≤ 60 llamadas de dibujo, ≤ 400 partículas) |
| **Audio con el interruptor de silencio de iOS** | No comprobable aquí | ⚠️ a comprobar en un iPhone ([§6.3](#63-comprobaciones-en-dispositivo-lo-que-no-se-ha-podido-hacer)) |
| Envío a las tiendas, revisión, firma | Requiere cuentas | ❌ |

---

## 3 · Monetización

**El repositorio no contiene ningún modelo de negocio, y por eso no hay código de uno.** No hay SDK de anuncios, de compras dentro de la aplicación, de analítica ni de cuentas; no se ha añadido «quitar anuncios» porque no hay anuncios que quitar. Un juego de pago se vende por la tienda sin que el código intervenga (el precio se fija en App Store Connect y Play Console). **Si se decidiera otra cosa**, antes de escribir código hay que: elegir el modelo, actualizar la [§4](#4--privacidad-y-cumplimiento) (los datos que un SDK recoja cambian lo que se declara en las tiendas), pedir consentimiento donde la ley lo exija, y volver a pasar la prueba E2E `privacy` (que fallará, con razón, en cuanto salga una petición a un tercero).

---

## 4 · Privacidad y cumplimiento

### Qué datos tiene el juego (verificado por la prueba E2E `privacy` sobre una sesión completa)

| Cuestión | Hecho |
|---|---|
| Peticiones de red | **Todas al propio origen** (el JS, el arte, el audio y los JSON del juego): 125 en una sesión completa contra el *build* de producción (590 en desarrollo, donde cada módulo se pide por separado). Ninguna a un tercero. |
| *Beacons*, *sockets* a terceros | ninguno |
| Cookies | ninguna (`document.cookie` vacío, ninguna en el contexto) |
| Almacenamiento | solo `localStorage` con claves `troid.*` (`troid.settings`, `troid.progress`, `troid.progress.2`, `.3`, y sus copias `.bak`/`.corrupt`). Sin IndexedDB, sin *cache storage*, sin *service worker*, sin `sessionStorage` |
| Dentro de una cáscara Capacitor | el mismo contenido en las *preferences* de la plataforma (`UserDefaults` / `SharedPreferences`), por `@capacitor/preferences` |
| Datos personales, identificadores de dispositivo, ubicación, contactos, fotos, micrófono, cámara | **ninguno se pide ni se lee** |
| Permisos del sistema | **ninguno** (el audio se reproduce; el juego no graba) |
| Anuncios, compras, cuentas, contenido generado por usuarios, chat | no hay |

### Declaraciones de tienda que se derivan (a confirmar por quien publique en sus formularios)

- **Apple (App Privacy):** «*Data Not Collected*». No hay *tracking*: no hace falta *App Tracking Transparency*. Cifrado: la app no usa red ni criptografía propia → `ITSAppUsesNonExemptEncryption = NO`. Comprobar al archivar que el manifiesto de privacidad (`PrivacyInfo.xcprivacy`) declara el uso de `UserDefaults` (lo usan las *preferences*; las versiones recientes del *plugin* traen su declaración).
- **Google Play (Data safety):** «No data collected», «No data shared». Sin permisos añadidos. Público objetivo: *no* dirigido a niños (para no entrar en la política de Familias); el juego no recoge datos de nadie, así que tampoco hay nada que proteger por COPPA/RGPD-K.
- **RGPD / LOPDGDD:** el juego no trata datos personales. Aun así **las tiendas piden una URL de política de privacidad**: use la plantilla de abajo.

### Plantilla de política de privacidad (sustituir lo marcado)

> **Política de privacidad de Troid** — vigente desde [FECHA].
> Troid no recoge, transmite ni comparte datos personales. La partida y los ajustes se guardan **solo en su dispositivo** (en el almacenamiento del navegador o en las preferencias locales de la aplicación) y se borran al desinstalar la aplicación o al borrar los datos del sitio. El juego no hace peticiones de red salvo para cargar sus propios archivos, no usa analítica, publicidad ni seguimiento, no usa cookies y no pide permisos del sistema. Contacto: [CORREO DE CONTACTO]. Responsable: [NOMBRE O RAZÓN SOCIAL].
>
> *Troid does not collect, transmit or share personal data. Your game and settings are stored only on your device (in the browser's storage or the app's local preferences) and are deleted when you uninstall the app or clear the site's data. The game makes no network requests other than loading its own files, uses no analytics, advertising or tracking, sets no cookies and asks for no system permissions. Contact: [EMAIL]. Controller: [NAME OR COMPANY].*

### Clasificación por edades (propuesta, a confirmar en los cuestionarios de cada tienda)

Contenido: combate con espada contra criaturas de tinta y un guardián, sin sangre ni personajes humanos heridos, sin lenguaje soez, sin apuestas, sin compras, sin contenido de usuarios. Se espera la franja baja: *PEGI 7 / ESRB E10+ (violencia fantástica leve) / Apple 9+ / IARC «violencia de fantasía»*. **La clasificación la decide el cuestionario, no este documento.**

### Software de terceros

`public/THIRD_PARTY_NOTICES.txt` (se copia a `dist/` y viaja con el juego) reproduce las licencias de PixiJS y de sus dependencias de producción (12 paquetes: MIT, ISC, BSD-3-Clause). Se genera con `npm run licenses` y `npm run build` **falla** si está desactualizado (`licenses:check`): no se puede añadir ni actualizar una dependencia sin que su aviso la siga. El arte es el que aportó el encargo (no se ha incorporado ninguno de terceros) y el sonido se sintetiza con `tools/audio` (su procedencia la verifica `npm run audio:verify`). **Quien publique debe tener a mano los derechos del arte que aportó.** La tipografía es la del sistema (`system-ui`, `Segoe UI`, `Roboto`…): no se incrusta ninguna fuente (ningún `@font-face`).

---

## 5 · Lo que decide quien publica (el repositorio no lo inventa)

| Decisión | Dónde se aplica |
|---|---|
| **Nombre del equipo y colaboradores** (los créditos del final del juego **no llevan nombres inventados**) | `src/content/credits.ts` |
| **Identificador de la aplicación** (formato dominio inverso de un dominio **que usted controle**, p. ej. `com.suempresa.troid`) | `capacitor.config.*`, Xcode, `build.gradle` |
| **Editor / razón social, correo de contacto, URL de la política de privacidad y de soporte** | tiendas |
| **Icono, pantalla de arranque, capturas, gráfico de portada** — `public/icon.svg` es el marcador de posición del primer encargo (un triángulo y un círculo), **no el arte del juego**; las tiendas piden PNG de 1024×1024 sin transparencia y los formatos de la [§6.2](#62-iconos-y-pantalla-de-arranque) | tiendas, proyecto nativo |
| **Textos de la ficha** (título, subtítulo, descripción corta y larga, palabras clave) en los idiomas que ofrezca (el juego está en español e inglés) | tiendas |
| **Precio y modelo** | tiendas ([§3](#3--monetización)) |
| **Versión** (`package.json` `version`, hoy `0.1.0`) y **número de compilación** de cada tienda | `package.json`, Xcode (`CFBundleVersion`), Gradle (`versionCode`) |
| **Versiones mínimas del sistema** (el análisis estático pide iOS ≥ 15.4 y WebView ≥ 98) | Xcode, Gradle |
| **Escritorio sí o no, y con qué envoltorio** | [§8](#8--escritorio) |

---

## 6 · iOS y Android con Capacitor (pasos externos)

### 6.1 Crear la cáscara

Requisitos: Node ≥ 22.12; para iOS, un Mac con Xcode y una cuenta de *Apple Developer Program*; para Android, Android Studio, JDK 17+ y una cuenta de Google Play Console.

```bash
npm ci
# Capacitor: núcleo, línea de órdenes y las plataformas; y los dos plugins que el juego usa si están
npm i @capacitor/core @capacitor/preferences @capacitor/app
npm i -D @capacitor/cli @capacitor/ios @capacitor/android
npx cap init Troid <APP_ID> --web-dir dist      # APP_ID: el de la §5
npm run build
npx cap add ios
npx cap add android
npx cap sync                                     # tras cada `npm run build`
```

**Qué hace el juego solo, sin más código, cuando detecta `window.Capacitor`** (cada pieza es un *chunk* que una página web nunca descarga):

| Plugin | Qué cambia |
|---|---|
| `@capacitor/preferences` | las partidas y los ajustes se guardan en `UserDefaults` / `SharedPreferences` (**no** en `localStorage` del WebView, que el sistema puede vaciar si falta espacio). El juego **prueba** que funciona antes de fiarse (escribe, lee y borra un valor); si no funciona, sigue con `localStorage`. |
| `@capacitor/app` | el botón **Atrás** de Android es la tecla de pausa (sin esto, cierra la aplicación en mitad de una pelea) y pasar la aplicación a segundo plano abre la pausa. |

Sin esos *plugins* el juego sigue funcionando (con `localStorage` y la pausa por visibilidad de la página): **no son requisitos, son mejoras**, pero se recomiendan para publicar.

**Orientación y pantalla completa.** El juego se juega en horizontal (`manifest.webmanifest`: `orientation: landscape`; en vertical muestra un aviso con «Jugar así»). En nativo hay que fijarlo en el proyecto:
- iOS: `Info.plist` → `UISupportedInterfaceOrientations` solo `UIInterfaceOrientationLandscapeLeft` y `LandscapeRight`; `UIStatusBarHidden = YES`; `UIViewControllerBasedStatusBarAppearance = NO`.
- Android: en `AndroidManifest.xml`, `android:screenOrientation="sensorLandscape"` en la actividad; modo inmersivo (`windowFullscreen`) y `windowLayoutInDisplayCutoutMode="shortEdges"` para que la muesca no deje una franja negra.
- La página ya usa `viewport-fit=cover` y las zonas de seguridad (`env(safe-area-inset-*)`): el HUD, el botón de pausa y los botones táctiles se apartan de muescas y esquinas redondeadas (comprobado solo con inserciones **simuladas**).

### 6.2 Iconos y pantalla de arranque

| Qué | iOS | Android |
|---|---|---|
| Icono | PNG 1024×1024 **sin transparencia** (Xcode genera el resto) | icono adaptable (primer plano + fondo, zona segura central ~66 %) + 512×512 para la ficha |
| Pantalla de arranque | `LaunchScreen.storyboard` (fondo oscuro `#0b0d10`, el mismo de la página) | tema `Theme.SplashScreen` (mismo fondo) |
| Ficha | capturas 6,7″ y 6,5″ (iPhone) y, si admite iPad, 12,9″ | capturas de teléfono (y tableta si procede) + gráfico de portada 1024×500 |

La herramienta oficial `@capacitor/assets` genera todos los tamaños a partir de un icono y un fondo que **usted** proporcione.

### 6.3 Comprobaciones en dispositivo (lo que no se ha podido hacer)

Haga esta lista en **un iPhone, un Android de gama media y uno de gama baja** antes de enviar:

1. Arranca, se ve la primera sala y se oye el sonido tras el primer toque. **iPhone con el interruptor de silencio puesto:** el audio Web de un WKWebView puede quedar silenciado por él; si ocurre, se resuelve poniendo la categoría de audio de la sesión en *playback* (un *plugin* de audio nativo o una línea en `AppDelegate`) — **no se ha comprobado**.
2. Los controles táctiles responden con dos y tres dedos a la vez (mover + atacar + esquivar); el editor de botones funciona; nada queda pulsado al soltar.
3. Muesca / isla / esquinas: HUD, botón de pausa y botones táctiles dentro de la zona segura, en ambas orientaciones horizontales.
4. Girar el dispositivo a vertical muestra el aviso; volver a horizontal lo quita.
5. **Atrás** (Android) abre la pausa; desde la pausa vuelve al mapa o reanuda; nunca cierra la aplicación.
6. Pasar a segundo plano (botón de inicio, llamada, otra aplicación) y volver: el juego espera en la pausa, sin ráfaga de simulación, sin sonido atascado.
7. **Guardado:** ganar algo, cerrar la aplicación desde el selector de aplicaciones y abrir: la partida está. Repetir con el modo avión. Desinstalar y reinstalar: la partida **no** está (es lo esperado).
8. Rendimiento sostenido 60 fps en una pelea con el guardián en el dispositivo más modesto; si no llega, probar «Calidad: Baja» (Ajustes) y anotar el modelo.
9. Memoria: media hora de juego sin que el sistema cierre la aplicación.
10. Mando Bluetooth (si se anuncia): los menús se recorren con la cruceta, A pulsa, B retrocede; desconectarlo en pleno juego abre la pausa.

### 6.4 Publicar

- **App Store:** registro en App Store Connect con el identificador de la §5; archivar en Xcode (Product → Archive) con perfil de distribución; subir a TestFlight y probar; rellenar *App Privacy* ([§4](#4--privacidad-y-cumplimiento)), clasificación por edades, capturas, descripción, URL de soporte y de política; enviar a revisión. Nota para el revisor: «El juego no requiere cuenta ni conexión».
- **Google Play:** crear la aplicación en Play Console; **Play App Signing** y una clave de subida (`keystore`) que se guarda **fuera del repositorio** y con copia de seguridad; compilar el `AAB` (`cd android && ./gradlew bundleRelease`); *Data safety* y clasificación (IARC) de la [§4](#4--privacidad-y-cumplimiento); `targetSdk` al nivel que la tienda exija en la fecha de envío; las cuentas personales nuevas pueden tener que pasar por una **prueba cerrada con un número mínimo de probadores durante un periodo** antes de publicar (compruebe el requisito vigente en Play Console).
- **Nunca** meter en el repositorio claves de firma, `keystore`, certificados, contraseñas ni *tokens*: no los hay hoy (comprobado: ninguno en `src`, `public`, `tools`, `index.html` ni en el `dist/` construido) y no deben llegar.

---

## 7 · Web (alojar `dist/`)

`dist/` se sirve desde cualquier alojamiento estático (una carpeta, itch.io, GitHub Pages, un CDN). Recomendaciones: **HTTPS**; ficheros con *hash* en `assets/` con caché larga (`immutable`); `index.html` sin caché larga (para que una versión nueva se vea); compresión Brotli/gzip; tipo MIME `application/manifest+json` para `manifest.webmanifest`. No hay *service worker*: **no funciona sin conexión la primera vez** (una vez cargado, el navegador lo guarda como cualquier página).

**Si el alojamiento impone una política de seguridad de contenido (CSP)**, esta es la que se **midió** (Chromium, el *build* de producción: el juego arranca sin ningún error de consola):

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-eval' 'sha256-<hash>'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' blob: data:; worker-src 'self' blob:; font-src 'self'; object-src 'none'; base-uri 'self'
```

- **`'unsafe-eval'` lo exige PixiJS**, que genera funciones en tiempo de ejecución. Sin él el juego **no arranca** y lo dice (la cortina de arranque o la página «Algo ha fallado»); no se queda en negro. PixiJS ofrece una versión sin `eval` (`pixi.js/unsafe-eval`), **que aquí no se usa a propósito**: cargada de forma perezosa, solo donde haga falta, sube el arranque en frío **2 429 B y de 14 a 18 ficheros** (medido: comparte código con el renderizador y el empaquetador lo parte). Si una tienda o un alojamiento exigiera una CSP sin `eval`, es la opción, y el presupuesto la admite (quedan ≈ 8 KB).
- **`'sha256-<hash>'` es el *hash* del único script en línea de `index.html`** (el aviso de arranque fallido). Se calcula con `node -e "const s=require('fs').readFileSync('dist/index.html','utf8').match(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/)[1]; console.log('sha256-'+require('crypto').createHash('sha256').update(s).digest('base64'))"` y **cambia si ese script cambia**. Con `'unsafe-inline'` en `script-src` en su lugar también funciona. Sin ninguna de las dos cosas el script no corre y el juego solo pierde ese aviso.
- **`style-src 'unsafe-inline'`**: el menú inserta sus estilos al abrirse.

**No se abre con doble clic** (`file://`): el navegador bloquea los módulos de una página sin origen. Ver [§1](#1--qué-es-lo-que-hay).

---

## 8 · Escritorio

**Estado real: no hay instaladores.** El juego en escritorio es la página en un navegador moderno (teclado y ratón; mando por la API de Gamepad, probado solo con un mando abstracto). Si se quiere un ejecutable:

1. **Envoltorio:** Electron o Tauri cargando `dist/` (la base relativa lo permite); el guardado seguiría siendo `localStorage` del envoltorio (persistente) o, mejor, un fichero en la carpeta de datos del usuario (habría que escribir un adaptador `StorageAdapter`, como el nativo: `src/app/nativeStorage.ts` es el modelo).
2. **Firma:** macOS → *Developer ID* y notarización; Windows → certificado de firma de código (sin él, SmartScreen avisa); Linux → AppImage o paquete de la distribución.
3. **Distribución:** itch.io, Steam (con su SDK y sus propias reglas), la web.
4. Pruebas manuales de la lista de la [§6.3](#63-comprobaciones-en-dispositivo-lo-que-no-se-ha-podido-hacer) que apliquen (teclado, mando, ventana redimensionada, pérdida de foco).

---

## 9 · Lista de comprobación de lanzamiento (en orden)

- [ ] Rellenar `src/content/credits.ts` con el equipo real.
- [ ] Elegir identificador, nombre del editor, correo, URL de política y soporte.
- [ ] Icono, pantalla de arranque, capturas y textos de ficha (es / en).
- [ ] `npm ci && npm run check && npm run build && npm run bench:bundle` (todo en verde; arranque en frío ≤ 204 800 B).
- [ ] `npm run test:e2e` y `npm run test:e2e -- --prod` (todo en verde).
- [ ] `npm run licenses` si cambió una dependencia (el *build* lo exige).
- [ ] Crear la cáscara ([§6.1](#61-crear-la-cáscara)), fijar la orientación, instalar `@capacitor/preferences` y `@capacitor/app`, `npx cap sync`.
- [ ] Lista de la [§6.3](#63-comprobaciones-en-dispositivo-lo-que-no-se-ha-podido-hacer) en dispositivos reales.
- [ ] Formularios de privacidad y de edad con las respuestas de la [§4](#4--privacidad-y-cumplimiento).
- [ ] Prueba interna (TestFlight / prueba cerrada) con personas reales antes de la revisión.
- [ ] Enviar, y **solo entonces** decir que está enviado; «publicado» cuando la tienda lo diga.
