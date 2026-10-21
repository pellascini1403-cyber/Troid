# Los tres botones táctiles — los PNG del artista

Estos tres archivos **son los originales, byte a byte** (los entregó el artista; no se redibujaron, no se recortaron, no se
recolorearon ni se pasaron por ningún filtro). El juego los muestra con un `<img>` y los escala **en proporción**; nada más
(`../art.ts`). Si hay que cambiar el aspecto de un botón, se sustituye el archivo por el nuevo original y se actualizan esta tabla
y `TOUCH_ART_ORIGINALS` de `tests/helpers/touchArt.ts` —la prueba `tests/unit/ui/touchArt.test.ts` y la escena E2E `touchEditor`
fallan si los bytes (o los píxeles que el navegador decodifica) no coinciden con él—.

| Botón | Archivo | Tamaño | SHA-256 |
|---|---|---|---|
| Ataque cuerpo a cuerpo | `touch-attack.png` | 2560 × 1440 px · 40 885 B | `0be2c04f9382e8373aa11a5be29077a0df8ee3ad4696c8761684693b793cd5bc` |
| Dash | `touch-dash.png` | 2560 × 1440 px · 47 664 B | `15f3a2a7c4cf1275f46f1217802643517cd677380b02eb8dd2c5a4f9a01afcf7` |
| Ataque a distancia / magia | `touch-magic.png` | 2560 × 1440 px · 55 182 B | `dbb1f02a10be8cc88b5cf5122ae483171357020926688b18756b186e2fa36298` |

Cada archivo es una placa hexagonal blanca, medio transparente, con el glifo recortado en ella, sobre un lienzo 16:9 casi vacío.
**La placa ocupa el mismo rectángulo en los tres**: `x 717 · y 131 · 1182 × 1222` px del archivo (`ART_PLATE` en `../art.ts`, comprobado
contra los píxeles por la misma prueba). El botón es esa placa: el archivo se muestra entero dentro de una caja del tamaño de la
placa, así que lo que sobra del lienzo no se ve ni cuenta para el tamaño ni para el toque.

No hay nada más que hacer con ellos: el estado «pulsado» es CSS (`scale(0.93)` de la caja), el «no disponible» es la opacidad de
la caja, y la opacidad que el jugador elige en Ajustes se aplica a toda la capa. El archivo no se descarga en un equipo sin pantalla
táctil (la capa táctil pide las imágenes la primera vez que se muestra).

La carpeta se llama `buttons` y no `art` a propósito: la escena E2E `boot` simula «el arte no llega» rechazando todo lo que cuelga de una carpeta `art/`, y en
desarrollo estos PNG son peticiones del navegador (en producción son archivos con *hash* en `assets/`).
