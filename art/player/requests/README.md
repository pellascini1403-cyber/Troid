# Los dibujos del protagonista — kit de producción (todo entregado)

> **Estado: no queda ningún clip por pedir.** Los 10 clips que pedía este kit se han entregado y aceptado con `npm run assets:intake` y hoy son **dibujos del usuario** en `art/player/hero/`: `dash`, `attack2`, `crouch`, `crouchWalk`, `walk`, `aerialAttack`, `crouchAttack`, `death`, `drink`, `interact`. De cada uno se archivó la hoja de la que salió, sus anclas, su colocación, los fallos que se aceptaron a propósito y el informe en `art/player/source/delivered/<clip>/`: la misma hoja con los mismos archivos da los mismos fotogramas. Este archivo lo escribe `npm run assets:intake -- kit` desde `requests.json`.

## Lo entregado

| Grupo | Clip | Fotogramas | Se pedían | Archivo de la entrega |
|---|---|---|---|---|
| A | `dash` | 3 | 3 | [`dash/`](../source/delivered/dash/) |
| B | `attack2` | 5 | 7 | [`attack2/`](../source/delivered/attack2/) |
| C | `crouch` | 2 | 2 | [`crouch/`](../source/delivered/crouch/) |
| D | `crouchWalk` | 4 | 4 | [`crouchWalk/`](../source/delivered/crouchWalk/) |
| E | `walk` | 4 | 6 | [`walk/`](../source/delivered/walk/) |
| F | `aerialAttack` | 6 | 6 | [`aerialAttack/`](../source/delivered/aerialAttack/) |
| G | `crouchAttack` | 5 | 6 | [`crouchAttack/`](../source/delivered/crouchAttack/) |
| H | `death` | 5 | 5 | [`death/`](../source/delivered/death/) |
| I | `drink` | 4 | 4 | [`drink/`](../source/delivered/drink/) |
| J | `interact` | 3 | 3 | [`interact/`](../source/delivered/interact/) |

## Lo que llegó distinto de lo pedido

El encargo se reescribió a lo que son los dibujos para que la herramienta los pudiera juzgar (el número de fotogramas, las fases, los límites de tamaño), y cada entrega dice en qué se aparta:

- **`attack2`** (se pedían 7 dibujos a 28 fps): la fila 1 de la Hoja 2 trae CINCO dibujos (no siete), así que el golpe es de cinco fotogramas: salida [0, 1], corte activo [2, 3] y recuperación [4]; las fases de la simulación (3 + 3 + 11 ticks) no cambian y cada fase tiene tantos fotogramas como ticks admite. Los arcos cian de los dibujos 2, 3 y 4 vienen dibujados en la propia imagen y se tocan entre sí: la hoja no se puede cortar sola (cutSheet) y cada pose se recortó a mano, sin reescalar, con un rectángulo (los restos de la vecina que cayeron dentro los descarta el recorte como piezas sueltas). El dibujo 4 muestra DOS hojas, una en cada mano: las anclas siguen la de la mano derecha, la de delante. La intención del golpe cambia con los dibujos: se pedía un corte ASCENDENTE (la punta sube ≥ 0.4 m) y el segundo golpe que se dibujó es un tajo hacia delante a ras de suelo (la punta pasa de 1.6 m detrás del pivote a 1.4 m delante), así que la intención pasó de «sube» a «avanza» (≥ 1 m) y el escenario E2E player-anim comprueba eso.
- **`crouch`** (se pedían 2 dibujos a 2 fps): la hoja trae CUATRO agachadas (fila 1 de la Hoja 3), no dos: se han tomado la 1 (asentada) y la 4 (la misma agachada con el pecho y la cabeza algo más altos, para respirar), que son las más parecidas entre sí (solapamiento de siluetas 0.71 con la cabeza alineada); la 2 y la 3 (más baja, a rastras) quedan en la hoja sin usar. Los dibujos llevan la espada VISIBLE, baja y atrás (el encargo decía «sin espada»): los límites de tamaño se ensancharon a 0.9–3.0 m de ancho y 1.1–2.1 m de alto.
- **`crouchWalk`**: los dibujos entregados llevan la espada VISIBLE, baja y atrás (el encargo decía «sin espada»): con la hoja la figura mide hasta 2.8 m de ancho y con las antenas hasta 2.0 m de alto, así que los límites de tamaño se ensancharon a 0.9–3.0 m de ancho y 1.1–2.1 m de alto.
- **`walk`** (se pedían 6 dibujos a 12 fps): la hoja trae 4 poses de marcha (no 6), así que el ciclo es de 4 dibujos a 8 fps: dura 0.5 s, lo mismo que las 6 poses a 12 fps que se pedían. La espada va baja y atrás, como se pedía, y los límites de tamaño no cambian.
- **`aerialAttack`** (se pedían 6 dibujos a 26 fps): son los seis dibujos de la fila 2 de la Hoja 2, uno por fotograma y en el orden pedido. La pose 3 (el tajo en picado) lleva dibujada una estela cian que la hace medir 2.95 m de alto: se subió 22 px con placement.json para que la estela cupiera en el lienzo (límite de alto ensanchado a 3.0 m). La pose 6 (la caída) está dibujada SIN espada a la vista: sus anclas son una estimación aceptada a propósito con waivers.json. Las estelas y destellos cian de las poses 3 y 6 vienen en el propio dibujo.
- **`crouchAttack`** (se pedían 6 dibujos a 26 fps): la fila 3 de la Hoja 2 trae CINCO dibujos (no seis), así que el golpe es de cinco fotogramas: salida [0, 1], barrido activo [2, 3] y recuperación [4]; las fases de la simulación (4 + 3 + 9 ticks) no cambian y cada fase tiene tantos fotogramas como ticks admite. Los dibujos 2, 3 y 4 traen el arco cian del barrido dibujado en la propia imagen (el motor pone además el suyo). La figura es más alta y ancha de lo pedido (la espada visible, las antenas y los arcos): límites de tamaño ensanchados a 1.0–2.4 m de alto y 1.2–3.6 m de ancho. El fotograma crouchAttack_01 (el segundo) se corrió 6 px a la derecha con placement.json porque la punta de la espada quedaba a 3 px del borde izquierdo del lienzo (el contrato pide 4).

## Si hay que pedir algo otra vez

Poner `"status": "requested"` al clip en `requests.json` y `npm run assets:intake -- kit`: el kit vuelve a escribir su *brief* y su tablero de referencias. La entrega nueva se suelta en `art/player/inbox/<clip>/` y se acepta con `npm run assets:intake -- <clip> --accept --replace` (lo ya aprobado no se sobrescribe sin pedirlo por su nombre). Guía: [`docs/guides/deliver-protagonist-art.md`](../../../docs/guides/deliver-protagonist-art.md).

## Guías

- `canvas-template.png` y `canvas-template-idle.png`: el lienzo a 4× con el suelo, el pivote, las alturas del cuerpo de pie (1.7 m) y agachado (1.0 m) y el margen: **guías de composición, no arte**.
- `character-reference.png`: las poses que definen el diseño, de la hoja del usuario.
