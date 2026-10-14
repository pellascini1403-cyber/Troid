# Bandeja de entrada de los dibujos nuevos del protagonista

Aquí se **sueltan** los dibujos que faltan (kit: [`../requests/README.md`](../requests/README.md)) y de aquí los recoge `npm run assets:intake`.

```
art/player/inbox/<clip>/sheet.png        la hoja entera (todas las poses, fondo blanco liso o transparente)
art/player/inbox/<clip>/<clip>_00.png …  o un PNG por pose, en orden
art/player/inbox/<clip>/anchors.json     solo los clips con espada: la empuñadura y la punta de cada fotograma
art/player/inbox/<clip>/placement.json   opcional: desplazar a mano un fotograma ({"<clip>_03": {"dx": 0, "dy": 4}})
art/player/inbox/_reports/<clip>/        lo escribe la herramienta: hoja de contacto, informe, fotogramas preparados
```

```
npm run assets:intake -- status               qué es cada clip y qué hay aquí
npm run assets:intake -- <clip>               recorta, escala, coloca, comprueba y escribe el informe
npm run assets:intake -- <clip> --accept      lo integra por `delivered` (solo lo que enseñó el último informe, sin fallos)
```

**Nada de lo que hay aquí se sube al repositorio** (ver `.gitignore`): son archivos de trabajo. Al aceptar un clip, la hoja de la que salió, sus anclas y el informe quedan archivados en `art/player/source/delivered/<clip>/`, que sí se versiona.
