# Cómo entregar el arte del protagonista (y qué falta exactamente)

> **Estado (Prompt 16): el protagonista es OTRO — el de la hoja de personaje que entregó el usuario — y esta guía es la de hoy.** La hoja
> (`art/player/source/character-sheet.png`, **bit a bit**, 1536 × 1024; `character-sheet.json` dice dónde está cada pose y de qué clip es) es **la única referencia** de cómo se ve: de ella salen
> **44 fotogramas en 12 clips** (`idle`, `walk`, `run`, `jump`, `fall`, `land`, `attack1`, `cast`, `dash`, `interact`, `hurt`, `death`), solo con operaciones técnicas (quitar el fondo blanco, **una escala por clip**
> —la de la cabeza— y mover el dibujo un número entero de píxeles: **nada redibujado, recoloreado ni suavizado**). **Faltan 5 de los 15 clips que pide el juego** (`attack2`, `attackAir`, `crouch`,
> `attackCrouch`, `drink`; y el gateo `crouchWalk`, que es extra): la hoja no tiene dibujo para ellos, **no se han inventado ni sacado de otro clip**, y esos estados los dibuja el *placeholder* (la cápsula) hasta que
> lleguen — salvo el segundo golpe, que el motor **repite con el dibujo del primero** (su *stand-in* declarado en `visualSource.ts`). `npm run assets:missing` lo cuenta: **10 de 15 con dibujo propio**.
> El diseño anterior está **guardado entero, fuera del juego**, en `art/player/archive/design-v1/` (con cómo volver a él), y el generador por rig (`assets:animate`) pertenece a él: ya no hace los fotogramas del juego.
> Lo que sigue en esta guía de los Prompts 9 a 12 describe el flujo y el diseño **anteriores**, y se conserva porque sus **requisitos de todo fotograma** (§2), **las anclas** (§3) y el **camino de la recepción** (`assets:intake`) siguen siendo los mismos.
> Para pedir lo que falta: `art/player/requests/` (un encargo y un tablero de referencia **con la hoja nueva** por cada clip pendiente); para recibirlo: `npm run assets:intake -- <clip>` (ver `art/player/inbox/README.md`).

> **Estado (Prompt 9): el protagonista está animado —con tus dibujos, movidos— y esta guía dice qué falta para que sea arte completo.**
> Tu hoja (`art/player/source/hero-sheet.png`, guardada bit a bit) es una hoja de **concepto**: **una pose por acción**, sobre fondo casi blanco, con sombras, líneas de velocidad, polvo y energía roja alrededor. De ella, **solo con operaciones técnicas**
> (fondo transparente y una deformación rígida y suave guiada por puntos de control: **nada dibujado, recoloreado ni suavizado**; [ART-PIPELINE-2D](../ART-PIPELINE-2D.md) partes L y N), `npm run assets:animate` hace **114 fotogramas en 18 clips**.
> **7 de los 15 clips tienen un dibujo tuyo de esa misma acción** (`idle`, `walk`, `jump`, `fall`, `attack1`, `hurt`, `cast`: respiran, andan, saltan, golpean con la hoja girando sobre la empuñadura…) y **8 son *stand-ins***
> (`dash`, `attack2`, `attackAir`, `crouch`, `attackCrouch`, `death`, `drink`, `interact`): **el movimiento es real, pero el dibujo es el de otra acción**, porque la hoja no tiene uno para esta. `npm run assets:missing` los cuenta como **no entregados**.
> Lo que sigue (§1 y §4) es lo que falta y cómo entregarlo; un clip que llegue **sustituye** a su *stand-in*, y el generador **lo deja en paz** (§4).
>
> **Estado (Prompt 10): no se ha dibujado nada nuevo** —no había ninguna herramienta de generación de imágenes en el entorno, y la regla del encargo prohíbe sustituir lo que falta por polígonos, siluetas hechas con código o más deformaciones—, **así que ningún clip ha dejado de ser un *stand-in***. Lo que hay es **el kit para pedir los dibujos** (`art/player/requests/`: la lista exacta de **46 PNG en 10 clips**, una referencia y un *prompt* por clip) y **la herramienta que los recibe** (`npm run assets:intake`: recorta, escala, coloca, comprueba y, con tu aceptación, integra por `delivered`; §4, «El camino corto»). Detalle: [ART-PIPELINE-2D parte O](../ART-PIPELINE-2D.md) y [PROMPT10-LOG](../PROMPT10-LOG.md).
>
> **Estado (Prompts 11 y 12): los 46 dibujos llegaron** (tres hojas del usuario, generadas con el kit) **y entraron por `npm run assets:intake`**: **10 de los 18 clips son dibujos suyos y ninguno es un *stand-in*** (`npm run assets:missing`: «15 de 15 clips entregados»; 106 → 90 fotogramas). Lo que llegó **no era exactamente lo pedido** —`attack2` trajo 5 poses (de 7), `crouchAttack` 5 (de 6), `walk` 4 (de 6), `crouch` 4 agachadas de las que se eligieron 2, y los golpes traen **efectos cian dibujados en la propia imagen**— y **el encargo se reescribió a lo que son los dibujos** (con `delivery` en `requests.json`: lo pedido y en qué se aparta). La tabla de abajo es la de lo que se **pidió**; la columna «Hoy» dice lo que hay. Los pasos de §4 siguen siendo el camino para **cambiar** un clip (`--replace`). Detalle: [PROMPT11-LOG](../PROMPT11-LOG.md) y [PROMPT12-LOG](../PROMPT12-LOG.md).
>
> Esta guía dice **exactamente qué falta** y **cómo se entrega**. Para el detalle técnico: [ART-PIPELINE-2D.md](../ART-PIPELINE-2D.md) (partes B–F, L y N). Para sustituir el arte de otros personajes: [replace-sprites.md](replace-sprites.md).

## 1. Qué falta, exactamente: 15 clips

El juego pide al protagonista **un solo *sprite set*** — el paquete `player`, el set `hero` (declarado en `art/player/player.pack.json`, hoy `status: "provisional"`) — con estos **15 clips**.
Cada clip es una **secuencia de fotogramas** (cuántos, lo decide el arte: de 1 a 96). `npm run assets:missing` te dice **en cada momento** cuáles están entregados y cuáles no.

| # | Clip | Otros nombres válidos | Qué es | Tipo | Espada | Validar primero | Hoy |
|---|---|---|---|---|---|---|---|
| 1 | `idle` | — | de pie, quieto (el **último recurso** de todo estado: sin él, el arte no se usa) | bucle | — | **sí** | **la hoja del personaje** (panel IDLE, poses 5 y 6), 2 fotogramas, a su propio tamaño (×1): bit a bit |
| 2 | `walk` | — | caminar/correr (el juego usa el mismo clip para ambas marchas) | bucle | — | **sí** | **la hoja** (panel CAMINANDO), 6 fotogramas a 12 fps (y `run`, extra: panel CORRIENDO, 5 a 12.5 fps) |
| 3 | `jump` | — | el salto, subiendo | una vez | — | **sí** | **la hoja** (SALTANDO), 4 fotogramas |
| 4 | `fall` | — | cayendo | bucle | — | | **la hoja** (CAÍDA), 4 fotogramas (y `land`, extra: la 5.ª pose de CAÍDA, 1 fotograma) |
| 5 | `dash` | — | la carrera corta / esquiva | una vez | — | **sí** | **la hoja** (DASH), 4 fotogramas |
| 6 | `attack1` | — | el primer tajo | una vez | **sí** | **sí** | **la hoja** (ATAQUE CUERPO A CUERPO), 4 fotogramas con las anclas de la espada |
| 7 | `attack2` | — | el segundo tajo del combo | una vez | **sí** | | **falta** — el motor repite `attack1` (*stand-in* declarado); la hoja no tiene un segundo golpe |
| 8 | `attackAir` | `aerialAttack`, `airAttack` | el tajo en el aire | una vez | **sí** | | **falta** — lo dibuja el *placeholder* |
| 9 | `crouch` | — | agachado (quieto) | bucle | — | | **falta** — lo dibuja el *placeholder* (y el gateo, `crouchWalk`) |
| 10 | `attackCrouch` | `crouchAttack` | el tajo agachado | una vez | **sí** | | **falta** — lo dibuja el *placeholder* |
| 11 | `hurt` | `damage` | recibir un golpe | una vez | — | **sí** | **la hoja** (DAÑO / GOLPE), 3 fotogramas |
| 12 | `death` | `die` | la muerte | una vez | — | | **la hoja** (MUERTE), 3 fotogramas |
| 13 | `cast` | — | lanzar el Spirit Bolt (preparar y soltar) | una vez | — | | **la hoja** (DISPARO / MAGIA), 4 fotogramas con la mano y la salida del proyectil |
| 14 | `drink` | — | beber una botella | una vez | — | | **falta** — lo dibuja el *placeholder* |
| 15 | `interact` | — | interactuar (palanca, tarjeta, altar) | una vez | — | | **la hoja** (INTERACCIÓN), 4 fotogramas |

*(«Una vez» = se juega entero y se queda en su último fotograma; «bucle» = se repite. «Espada» = cada fotograma lleva las anclas de la espada, §3. «Validar primero» = los seis que se miran antes: de pie, andando, el primer tajo, el *dash*, el salto y el golpe recibido, que es donde una escala mala, un pivote fuera de los pies o una espada fuera de la mano se ven de inmediato.)*

**Mientras falte un clip, el juego lo dibuja con el *placeholder***, estado por estado, sin parpadeos y sin avisos en la consola de un jugador (ART-PIPELINE-2D §D). Con solo `idle` + `walk` + `attack1`, por ejemplo, se ve al héroe real de pie, caminando y dando el primer tajo, y la cápsula al saltar, esquivar, agacharse, ser herido, morir, lanzar o beber.

## 2. Lo que se pide de todo fotograma

| Requisito | Por qué |
|---|---|
| **PNG RGBA de 8 bits, con fondo transparente** (alfa real). Exporta en **sRGB**, sin entrelazado | un PNG **sin canal alfa** (un RGB) se rechaza en el *build*: se dibujaría como un rectángulo. 16 bits se redondean a 8 (se avisa); un perfil de color incrustado no se arrastra (se avisa) |
| **Todos los fotogramas del set, en el mismo lienzo** (mismo ancho y alto) | el pivote es una fracción del lienzo: con lienzos distintos los pies saltarían |
| **El personaje mira a la derecha** | el motor lo espeja cuando mira a la izquierda: no se entregan fotogramas espejados |
| **Los pies en el pivote** que declares (`pivot`, p. ej. `[0.5, 0.95]` = centro, casi abajo) | es el punto del mundo donde está el héroe |
| **Un margen**: el arte no toca los bordes izquierdo, derecho ni superior del lienzo | si no, se puede cortar (se avisa) |
| **Escala:** declara `artPxPerMeter` (píxeles de arte por metro de mundo). El héroe mide **1.7 m** de alto en el juego (su cuerpo de colisión); el lienzo ha de contenerlo | el tamaño en pantalla **no depende de la resolución del arte**: solo de este número y de `scale` (una palanca visual que **nunca** toca colisión, velocidad ni *hitboxes*) |
| **Nombres** `<prefijo>NN`: `idle_00.png`, `idle_01.png`… (dos dígitos) | el prefijo se declara en el manifiesto; prefijos **únicos** dentro del paquete |
| **Una hoja por clip también vale**: declara la cuadrícula (`"sheets": [{ "file": "idle.png", "prefix": "idle_", "frameSize": [256, 256], "columns": 4, "count": 8 }]`) | se corta **sin tocar un píxel**; la hoja ha de medir **exactamente** lo que dice la cuadrícula (no se adivina nada) |
| Una variante a la mitad de resolución (para móviles), **si quieres** | la exporta el artista (`"resolution": 0.5`); el motor **elige**, **no fabrica** variantes |

## 3. La espada en la mano derecha (`swordAnchor` por pose)

En **cada fotograma de los cuatro golpes** (`attack1`, `attack2`, `attackAir`, `attackCrouch`) hacen falta tres puntos, en **metros desde los pies** (+x hacia delante, +y hacia arriba):

```jsonc
"frames": {
  "attack1_02": { "anchors": { "hand_r": [0.62, 1.02], "weapon_grip": [0.62, 1.02], "weapon_tip": [1.5, 1.3] } }
}
```

- `hand_r` — dónde está la mano derecha; `weapon_grip` — dónde se agarra la espada; **han de estar a menos de 4 cm** (la espada está **en la mano**); `weapon_tip` — la punta.
- Los efectos del tajo, los proyectiles y las chispas **nacen de estas anclas**, nunca de coordenadas de píxel ni de números de fotograma.
- El golpe lleva `phases` (qué fotogramas son `startup`, `active` y `recovery`): `"phases": { "startup": [0, 1], "active": [2, 3], "recovery": [4, 5] }`. **El golpe que se ve coincide con la *hitbox*** (la simulación manda la fase; el dibujo la sigue).
- Opcionales: `hit_origin` (donde se ve conectar el golpe, **solo para efectos**), `vfx_origin`, `projectile_origin` (de donde sale el Spirit Bolt en `cast`), `head`.
- **La espada es parte del dibujo del héroe** (como en las referencias): el motor **no pega una espada aparte**; las anclas dicen **dónde está** y el *build* comprueba que está en la mano. Si algún día la espada se entregara como una pieza separada, las anclas ya llevan su posición y su dirección (empuñadura → punta) en cada pose.

Un clip de golpe cuya espada **no esté en la mano** (o sin anclas) **se deja fuera** —ese estado cae al *placeholder*— y se dice **por qué**; en un paquete `final`, además, el *build* **falla**.

## 4. Cómo se entrega: paso a paso

1. **Copia los PNG** a `art/player/hero/` (`idle_00.png`, `idle_01.png`… o una hoja por clip).
2. **Edita `art/player/player.pack.json`** (ya declara los 15 clips y sus prefijos): cambia `"status"` a `"provisional"` (o `"final"` cuando esté todo), y rellena **lo que solo el arte sabe**: `artPxPerMeter`, `pivot`, y en cada clip `count`, `fps` (o `frameDuration`) y, en los golpes, `phases`; y las anclas por fotograma en `frames`. Los valores que hoy no están (escala, pivote, fotogramas por clip) **no se han inventado**: el manifiesto los trata como nominales mientras `awaiting-art`.
3. `npm run assets:missing` — qué clips están y cuáles faltan, en una tabla.
4. `npm run assets:check` — **todo lo que está mal**, con la ruta del archivo: sin alfa, lienzos de distinto tamaño, fotogramas que faltan, anclas en píxeles, espada fuera de la mano, el lienzo no cabe al personaje… **`npm run build` lo ejecuta**: un asset roto no compila.
5. `npm run assets:pack` — escribe `public/art/` (recorte exacto de alfa 0, sin pérdida; el fotograma reconstruido es **idéntico bit a bit**).
6. **Reinicia `npm run dev`**: el héroe usa el arte solo, estado por estado. **`?visual=placeholder` vuelve al *placeholder* al instante**, `?visual=art` enseña solo el arte.
7. Para ver cada clip con las anclas dibujadas: el laboratorio `?lab=player` (S39).

> **El camino corto (desde el Prompt 10): `npm run assets:intake`.** Hace por ti los pasos de abajo, con las comprobaciones y sin tocar nada que no deba:
>
> 1. **Pide los dibujos** con el `brief.md` de cada clip (`art/player/requests/<clip>/`: *prompt* listo para pegar, `reference.png` y `character-reference.png` para adjuntar, la lista exacta de fotogramas, los tiempos y lo que fija el juego). Una hoja por clip, en este orden: A `dash`, B `attack2`, C `crouch`, luego D–G, luego H–J. **Los nombres son los del *pipeline***: `aerialAttack` y `crouchAttack` (el encargo decía `attackAir` y `attackCrouch`).
> 2. **Suelta** el resultado en `art/player/inbox/<clip>/`: `sheet.png` (la hoja entera, fondo blanco liso o transparente) **o** un PNG por pose (`<clip>_00.png`…, o ya del tamaño del lienzo, 320 × 230). Solo PNG. (`art/player/inbox/` no se sube al repositorio.)
> 3. **`npm run assets:intake -- <clip>`** recorta las poses (con `poses.json`: **un rectángulo por pose**, y el fondo blanco se quita sin tocar la figura: `docs/ART-PIPELINE-2D.md` P.2), las escala **con un único factor por clip, por el tamaño de la cabeza** (contra la del idle, 56.25 px; el ojo cambia con la pose y la cabeza no: O.4.1 y P.3; antes del Prompt 16 era por el ojo grande), las coloca (el centro de masa **del cuerpo oscuro** en la columna 160 del lienzo, **la suela del pie** en la fila 192), las **comprueba** (halo, piezas sueltas, rojo, color ajeno, escala entre poses, salto del centro de masa, margen, tamaño, espada) y escribe en `art/player/inbox/_reports/<clip>/` la **hoja de contacto** (`contact.png`: tu dibujo original · las poses nuevas · la secuencia contra la de hoy · el tamaño real de juego) y `report.md`. Si la hoja no tiene exactamente las poses pedidas, **no adivina**: dice qué encontró y dibuja `segmentation.png`. `--scale <k>` fija el factor a mano.
> 4. **Los golpes con espada** (`attack2`, `aerialAttack`, `crouchAttack`) necesitan dos puntos por fotograma, la empuñadura y la punta: léelos en `anchors-grid.png` (cuadrícula en píxeles del lienzo) y escríbelos en `art/player/inbox/<clip>/anchors.json` (hay una plantilla). Un fotograma que queda flotando (lo más bajo de la figura es la hoja de la espada, no el pie) se baja con `placement.json`: `{"<clip>_03": {"dx": 0, "dy": 4}}`.
> 4 bis. **Lo que la herramienta da por fallo y tú decides aceptar** (una pose dibujada sin espada donde el golpe exige las anclas; unos arcos pintados que son píxeles del dibujo y la herramienta cuenta como «piezas sueltas» —aunque lo que se hace con esos arcos es quitarlos: 4 ter—) se acepta **a propósito, con su motivo**, en `art/player/inbox/<clip>/waivers.json`: `{"<clip>_05:sword": "motivo de al menos 20 caracteres…"}`. Solo vale para el **fallo que nombra** (los demás siguen siéndolo), una excepción que no corresponde a ningún fallo se rechaza, el informe la lista con el motivo y `--accept` pide mirar otra vez si la cambias; se archiva con la entrega. Si lo que llegó no es el número de poses pedido, se **reescribe el encargo** (`requests.json`: fotogramas, fases, límites) y se anota en `delivery` lo pedido y en qué se aparta. Y una hoja cuyas poses se tocan por los arcos se entrega **un PNG por pose** (`<clip>_00.png`…), recortados sin reescalar de la hoja.
>
> 4 ter. **Los efectos pintados dentro del dibujo** (un arco del tajo, una estela de velocidad: **los fotogramas no llevan efectos, el motor pone los suyos**) se quitan **con polígonos, no a mano**: `art/player/inbox/<clip>/erase.json` → `{"<clip>_01": {"why": "qué se quita y por qué es un efecto y no la figura (≥ 20 caracteres)", "polygons": [[[x, y], …], …]}}`, con los vértices en **píxeles del lienzo** (los mismos de `anchors-grid.png`). Se vuelve **transparente todo píxel visible cuyo centro queda dentro de un polígono y nada más cambia** (ni se mueve, ni se recolorea, ni se rehace). La herramienta **se niega** a quitar un píxel **del cuerpo** (oscuro y casi opaco) o un punto de **la hoja** (la línea de la empuñadura a la punta de `anchors.json`), y a un polígono que no encierra nada. Va **después** de la colocación y de las anclas (que se leen sobre el fotograma colocado), así que quitar no mueve la figura. El informe lista lo quitado con su motivo y escribe `erased.png` (lo quitado, en magenta, junto al fotograma entregado); el archivo entra en la huella (`--accept` pide mirar otra vez si lo cambias) y **se archiva con la entrega, junto al dibujo original, que no se toca**: borrar `erase.json` y volver a entregar (`--accept --replace`) devuelve el dibujo entero. Detalle: `docs/ART-PIPELINE-2D.md` O.11.
> 5. **Mira `contact.png`.** Lo que la herramienta no puede juzgar lo juzgas tú: que es **el mismo personaje**, que la espada está **en la mano derecha**, que no hay partes duplicadas ni miembros imposibles y que la acción se lee a tamaño de juego.
> 6. **`npm run assets:intake -- <clip> --accept`**: solo lo que enseñó el último informe y sin ningún fallo. Escribe los fotogramas y la entrada del manifiesto (con las anclas), añade el clip a `delivered`, vuelve a ejecutar el generador (que no debe encontrar nada que corregir), pasa las comprobaciones de arte, **archiva la hoja, las anclas, la colocación, lo aceptado a propósito y lo quitado del dibujo en `art/player/source/delivered/<clip>/`** y empaqueta `public/art/`. Un clip ya entregado **no se sobrescribe** (`--replace` si de verdad se quiere). Si algo falla, devuelve todos los archivos a como estaban.
> 7. `npm run assets:intake -- status` dice qué es cada clip (dibujo de la hoja, *stand-in* o dibujado de nuevo) y qué sigue pidiéndose.
>
> **El camino manual** (lo que hace la herramienta, por si hay que hacerlo a mano). **Desde el Prompt 16 el manifiesto y los fotogramas de `art/player/` los escribe `npm run assets:intake -- <clip> --accept`**, y el generador por rig
> (`assets:animate`) ya no hace ninguno: pertenece al diseño anterior y trabaja sobre `art/player/archive/design-v1/`. Un fotograma o un clip puesto a mano en `art/player/hero/` y en el manifiesto **sin su entrega archivada** en
> `art/player/source/delivered/<clip>/` hace fallar las pruebas (`characterArt`: «cada clip tiene una entrega que dice de dónde salió», y `deliveries`: los bytes de cada fotograma son los que su archivo produce): lo que está en el juego tiene
> que poder reproducirse desde sus fuentes. Si aun así lo haces a mano: pon los PNG en `art/player/hero/` (320 × 230, pivote 160, 192, 65 px de arte por metro), cambia la entrada del clip en `art/player/player.pack.json`
> (`{ "frames": "dash_", "count": 4, "fps": 24, "loop": false, "tags": ["first"] }`, y en los golpes `phases` y `sword` más las anclas por fotograma en `frames`, §3), y sigue con `npm run assets:missing`, `npm run assets:check`
> y `npm run assets:pack`.

## 4 bis. Qué hace el motor con tu arte — y qué NO

**Hace** (todo técnico y sin pérdida): recorta solo los bordes con alfa 0 (anotando dónde estaban, para que el pivote no se mueva), deduplica fotogramas idénticos, los empaqueta en páginas ≤ 2048 con un borde de seguridad **fuera** del fotograma, y los carga **después del primer fotograma**.

**No hace jamás:** rediseñar, «mejorar», recolorear, filtrar, remuestrear, convertir a *pixel art*, simplificar proporciones, cambiar la silueta, la cabeza, los colores, la ropa, la capa o la armadura, añadir accesorios ni sustituir al personaje. **Lo que entregues es lo que se dibuja.**

## 5. Lo que cambia para el jugador

Nada del gameplay: el cuerpo de colisión, la *hurtbox*, las *hitboxes*, las velocidades, el daño y la cámara son datos del juego, no del dibujo. Lo prueba un E2E que juega **el mismo guion de teclas** sin arte, con arte, con el camino de vuelta y solo con arte, y compara la simulación **tick a tick**: es idéntica.
