# Bandeja de trabajo del protagonista

Aquí se **preparan** los dibujos del protagonista antes de integrarlos, y de aquí los recoge `npm run assets:intake`. El diseño de hoy es el de la hoja de personaje del usuario
(`../source/character-sheet.png`, bit a bit; `../source/character-sheet.json` dice dónde está cada pose y de qué clip es). Nada de esta carpeta se sube al repositorio.

```
art/player/inbox/<clip>/sheet.png        la parte de la hoja de personaje de la que sale el clip: un recorte exacto, ningún píxel cambiado (lo escribe `from-sheet`)
art/player/inbox/<clip>/poses.json       un rectángulo por pose dentro de sheet.png, en el orden de los fotogramas (lo escribe `from-sheet`)
art/player/inbox/<clip>/scale.json       solo el clip de referencia (idle): {"factor": 1, "why": "…"} — la hoja a su propio tamaño; los demás se escalan por la cabeza
art/player/inbox/<clip>/anchors.json     solo el clip con espada y el que dispara: la empuñadura / la mano y la punta / la salida del proyectil de cada fotograma
art/player/inbox/<clip>/placement.json   opcional: desplazar a mano un fotograma ({"<clip>_03": {"dx": 0, "dy": 4}})
art/player/inbox/<clip>/waivers.json     opcional: aceptar a propósito un FALLO concreto, con su motivo ({"<clip>_05:clipped": "motivo de al menos 20 caracteres"})
art/player/inbox/<clip>/erase.json       opcional: quitar los EFECTOS pintados dentro del dibujo, con polígonos en píxeles del lienzo y su motivo ({"<clip>_01": {"why": "…", "polygons": [[[x, y], …]]}}); solo se vuelven transparentes los píxeles de dentro
art/player/inbox/_reports/<clip>/        lo escribe la herramienta: hoja de contacto, informe, fotogramas preparados
```

```
npm run assets:intake -- sheet                comprueba que la hoja es la de sus datos y que cada pose está contada (usada por un clip, o dicha como no usada con su motivo)
npm run assets:intake -- from-sheet <clip>    escribe sheet.png y poses.json del clip desde la hoja de personaje (sin tocar lo demás de la carpeta)
npm run assets:intake -- status               qué es cada clip (dibujado desde la hoja, o sin dibujo) y qué hay aquí
npm run assets:intake -- <clip>               quita el fondo, escala, coloca, comprueba y escribe el informe
npm run assets:intake -- <clip> --accept      lo integra por `delivered` (solo lo que enseñó el último informe, sin fallos); --replace para volver a entregar uno ya entregado
```

Al aceptar un clip, **la parte de la hoja de la que salió**, sus rectángulos, escala, anclas, colocación, lo que se quitó (`erase.json`), lo aceptado a propósito (`waivers.json`) y el informe quedan archivados en
`art/player/source/delivered/<clip>/`, que sí se versiona: `deliveries.test.ts` vuelve a preparar cada archivo y exige **los mismos bytes** que los fotogramas del juego.

Lo que la hoja **no** tiene (segundo golpe, golpe en el aire, agacharse, gatear, golpe agachado, beber) está pedido en `../requests/` (qué es cada uno, con su tablero de referencia y su encargo); no se saca de
otro clip. El diseño anterior está en `../archive/design-v1/` y no es referencia de nada.
