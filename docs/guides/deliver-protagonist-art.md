# Cómo entregar el arte del protagonista (y qué falta exactamente)

> **Estado (Prompt 9): el protagonista está animado —con tus dibujos, movidos— y esta guía dice qué falta para que sea arte completo.**
> Tu hoja (`art/player/source/hero-sheet.png`, guardada bit a bit) es una hoja de **concepto**: **una pose por acción**, sobre fondo casi blanco, con sombras, líneas de velocidad, polvo y energía roja alrededor. De ella, **solo con operaciones técnicas**
> (fondo transparente y una deformación rígida y suave guiada por puntos de control: **nada dibujado, recoloreado ni suavizado**; [ART-PIPELINE-2D](../ART-PIPELINE-2D.md) partes L y N), `npm run assets:animate` hace **114 fotogramas en 18 clips**.
> **7 de los 15 clips tienen un dibujo tuyo de esa misma acción** (`idle`, `walk`, `jump`, `fall`, `attack1`, `hurt`, `cast`: respiran, andan, saltan, golpean con la hoja girando sobre la empuñadura…) y **8 son *stand-ins***
> (`dash`, `attack2`, `attackAir`, `crouch`, `attackCrouch`, `death`, `drink`, `interact`): **el movimiento es real, pero el dibujo es el de otra acción**, porque la hoja no tiene uno para esta. `npm run assets:missing` los cuenta como **no entregados**.
> Lo que sigue (§1 y §4) es lo que falta y cómo entregarlo; un clip que llegue **sustituye** a su *stand-in*, y el generador **lo deja en paz** (§4).
>
> Esta guía dice **exactamente qué falta** y **cómo se entrega**. Para el detalle técnico: [ART-PIPELINE-2D.md](../ART-PIPELINE-2D.md) (partes B–F, L y N). Para sustituir el arte de otros personajes: [replace-sprites.md](replace-sprites.md).

## 1. Qué falta, exactamente: 15 clips

El juego pide al protagonista **un solo *sprite set*** — el paquete `player`, el set `hero` (declarado en `art/player/player.pack.json`, hoy `status: "provisional"`) — con estos **15 clips**.
Cada clip es una **secuencia de fotogramas** (cuántos, lo decide el arte: de 1 a 96). `npm run assets:missing` te dice **en cada momento** cuáles están entregados y cuáles no.

| # | Clip | Otros nombres válidos | Qué es | Tipo | Espada | Validar primero | Hoy |
|---|---|---|---|---|---|---|---|
| 1 | `idle` | — | de pie, quieto (el **último recurso** de todo estado: sin él, el arte no se usa) | bucle | — | **sí** | **tu dibujo 1**, 8 fotogramas |
| 2 | `walk` | — | caminar/correr (el juego usa el mismo clip para ambas marchas) | bucle | — | **sí** | **tu dibujo 2**, 8 fotogramas (y `run`, extra, con el 3) |
| 3 | `jump` | — | el salto, subiendo | una vez | — | **sí** | **tu dibujo 4**, 6 fotogramas |
| 4 | `fall` | — | cayendo | bucle | — | | **tu dibujo 5**, 4 fotogramas |
| 5 | `dash` | — | la carrera corta / esquiva | una vez | — | **sí** | *stand-in*: la carrera lanzada, 4 |
| 6 | `attack1` | — | el primer tajo | una vez | **sí** | **sí** | **tu dibujo 7**, 7 fotogramas |
| 7 | `attack2` | — | el segundo tajo del combo | una vez | **sí** | | *stand-in*: el primer tajo al revés, 8 |
| 8 | `attackAir` | `aerialAttack`, `airAttack` | el tajo en el aire | una vez | **sí** | | *stand-in*: el primer tajo, piernas recogidas, 7 |
| 9 | `crouch` | — | agachado (quieto) | bucle | — | | *stand-in*: la agachada del aterrizaje, 6 |
| 10 | `attackCrouch` | `crouchAttack` | el tajo agachado | una vez | **sí** | | *stand-in*: el primer tajo bajado, 7 |
| 11 | `hurt` | `damage` | recibir un golpe | una vez | — | **sí** | **tu dibujo 11**, 5 fotogramas |
| 12 | `death` | `die` | la muerte | una vez | — | | *stand-in*: el golpe, tumbado, 9 |
| 13 | `cast` | — | lanzar el Spirit Bolt (preparar y soltar) | una vez | — | | **tu dibujo 12**, 7 fotogramas |
| 14 | `drink` | — | beber una botella | una vez | — | | *stand-in*: el dibujo de pie, 6 |
| 15 | `interact` | — | interactuar (palanca, tarjeta, altar) | una vez | — | | *stand-in*: el dibujo de pie, 4 |

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

> **Hoy el manifiesto y los fotogramas de `art/player/` los escribe `npm run assets:animate`** a partir de tu hoja, de `art/player/source/hero.poses.json` (qué rectángulo es qué dibujo), de `art/player/source/hero.rig.json` (dónde están las partes de cada dibujo) y de `tools/assets/heroClips.ts` (cómo se mueven): una prueba comprueba que lo versionado es exactamente eso, así que **lo que esté en `art/player/hero/` y no lo haya hecho el generador se considera una desviación** y **`assets:animate` borra y reescribe esa carpeta**. Por eso el camino para entregar **fotogramas dibujados a mano** de un clip es este, y **no** copiarlos sin más:
>
> 1. Pon tus PNG en `art/player/hero/` con el prefijo del clip (`dash_00.png`, `dash_01.png`…): **PNG sueltos**, no una hoja; del mismo lienzo que los demás (280 × 230, pies en el pivote 120, 192, 65 px de arte por metro; los pies del héroe de pie ocupan la fila 192).
> 2. En `art/player/player.pack.json` **cambia la entrada del clip** a la tuya: `{ "frames": "dash_", "count": 5, "fps": 24, "loop": false, "tags": ["first"], "comment": "…" }` **sin** la etiqueta `stand-in` (y, en los golpes, `phases` y `sword`), y las anclas de la espada por fotograma en `frames` (§3). Borra del directorio los fotogramas que el generador hizo para ese clip y no vayan a seguir (los tuyos son los únicos que cuentan).
> 3. En `art/player/source/hero.rig.json` añade el clip a **`"delivered": ["dash"]`**: a partir de ahí el generador **no hace ninguno de sus fotogramas, no borra tus archivos y conserva tu entrada del manifiesto tal cual** (`assets:animate -- --check` solo comprueba que están todos y que no sobra ninguno).
> 4. `npm run assets:animate` (los demás clips salen **idénticos byte a byte**), `npm run assets:missing` (el clip pasa a **entregado**) y `npm run assets:pack`.
>
> Cuando ya no quede ningún *stand-in*, el manifiesto pasa a ser tuyo del todo y `assets:animate` deja de hacer falta.

## 4 bis. Qué hace el motor con tu arte — y qué NO

**Hace** (todo técnico y sin pérdida): recorta solo los bordes con alfa 0 (anotando dónde estaban, para que el pivote no se mueva), deduplica fotogramas idénticos, los empaqueta en páginas ≤ 2048 con un borde de seguridad **fuera** del fotograma, y los carga **después del primer fotograma**.

**No hace jamás:** rediseñar, «mejorar», recolorear, filtrar, remuestrear, convertir a *pixel art*, simplificar proporciones, cambiar la silueta, la cabeza, los colores, la ropa, la capa o la armadura, añadir accesorios ni sustituir al personaje. **Lo que entregues es lo que se dibuja.**

## 5. Lo que cambia para el jugador

Nada del gameplay: el cuerpo de colisión, la *hurtbox*, las *hitboxes*, las velocidades, el daño y la cámara son datos del juego, no del dibujo. Lo prueba un E2E que juega **el mismo guion de teclas** sin arte, con arte, con el camino de vuelta y solo con arte, y compara la simulación **tick a tick**: es idéntica.
