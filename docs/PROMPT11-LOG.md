# Prompt 11 — La Hoja 1 del usuario entra en el juego, la herramienta aprende la cabeza que gira y las Hojas 2 y 3 se revisan sin integrarlas

> **Lo que pasó.** El usuario generó con sus propias herramientas tres hojas con dibujos nuevos del protagonista y las pasó a la recepción del Prompt 10 (`npm run assets:intake`).
> **La Hoja 1** (15 poses: `dash`, `death`, `drink`, `interact`) **entra en el juego**: los cuatro clips dejan de ser *stand-ins* y pasan a ser **dibujos del usuario**, por el mecanismo `delivered`, sin deformar ni redibujar un píxel.
> Para que entrara `death` hizo falta **ampliar la herramienta** (con permiso expreso): cuando la cabeza gira, el ojo ya no mide el tamaño de la pose, y la hoja se escala y se juzga por **la cabeza**.
> **Las Hojas 2 y 3 se han revisado y NO se han integrado**: tienen **16 y 12 poses**, no las 19 y 12 previstas en el reparto de clips (la 2 trae además efectos azules pintados en 8 poses). Los resultados y lo que hay que decidir están en el apartado 6.
> **El repositorio:** `src/`, el motor, la física, los controles, los dibujos originales del usuario (`hero-sheet.png`, `hero-portrait.jpg`) y los otros 14 clips **no se han tocado**; los otros 91 fotogramas del protagonista son **byte a byte los mismos**.

---

## 1 · Lo que llegó

Tres PNG RGB de 1536 × 1024 (8 bits, sin canal alfa, fondo casi blanco —254 ± 2—), generados por el usuario a partir de sus dibujos y de los briefs del kit:

| Hoja | Poses anunciadas | Poses que hay | Reparto anunciado | Reparto real (filas) |
|---|---|---|---|---|
| **1** | 15 | **15** | `dash` 3 · `death` 5 · `drink` 4 · `interact` 3 | 3 · 5 · 4 · 3 ✓ |
| **2** | 19 | **16** | `attack2` 7 · `aerialAttack` 6 · `crouchAttack` 6 | 5 · 6 · 5 |
| **3** | 12 | **12** | `crouch` 2 · `crouchWalk` 4 · `walk` 6 | 4 · 4 · 4 |

**Cómo se cuentan las poses sin fiarse del ojo.** Los cuerpos oscuros de la hoja (lo que es negro o azul marino: la figura, la armadura, el alma de la espada, las antenas) se agrupan con un radio de 6 y otro de 10 px; los trazos azules de efecto, claros, no los unen. El método se **validó contra la Hoja 1**, cuyo recuento se conocía (15, con los dos radios) y da **16** en la Hoja 2 y **12** en la Hoja 3, con los dos radios; las imágenes numeradas lo confirman a simple vista ([Hoja 2](img/prompt11/hoja2-poses-numeradas.png) · [Hoja 3](img/prompt11/hoja3-poses-numeradas.png)). (Un segundo detector, de ojos, no resultó fiable —en la Hoja 1 solo encontraba 8 de 15— y no se usa como prueba.)

**Y lo que dice la propia herramienta** (`cutSheet`, la misma función que usa `assets:intake`, sobre la hoja entera): la **Hoja 1** se separa en 15; la **Hoja 3** en **12, con cualquier radio de 4 a 24 px**; la **Hoja 2 no se separa ni como 19 ni como 16** (con los distintos radios salen 10, 8, 7, 14, 14 y 17 piezas): los arcos azules pintados **unen poses vecinas y dejan fragmentos sueltos**, y la herramienta se niega en vez de adivinar dónde acaba una pose y empieza otra.

## 2 · La Hoja 1: separación y recepción

**Separación.** Entre las cuatro filas hay **tres huecos horizontales totalmente vacíos** (24, 45 y 14 px): ninguna pose cruza de una fila a otra, así que cortar por filas **no pierde nada**. `assets:intake` recibe **un clip por hoja**, de modo que cada fila se recortó **sin reescalar y sin tocar un píxel** (`convert -crop`) a `art/player/inbox/<clip>/sheet.png` (la bandeja no se versiona; cada carpeta lleva un `_source.txt` con el recorte). Los recortes, de la hoja original (sha256 `e9956bd0e7e03b1c…`) y en este orden: `dash` 1536 × 273 + 0 + 0 · `death` 1536 × 261 + 0 + 273 · `drink` 1536 × 241 + 0 + 534 · `interact` 1536 × 249 + 0 + 775; lo que se archiva en `art/player/source/delivered/<clip>/` es ese recorte, con su informe y su `delivery.json` (la hoja original es del usuario y no se guarda). Las 15 poses se separan con cualquier radio de 4 a 12 px.

**Qué midió la herramienta**, por clip (todos con halo ≤ 1.6 %, **0 % de piezas sueltas y 0 % de rojo**; las hojas de contacto, en [`img/prompt11/`](img/prompt11/)):

| Clip | Poses | Escala | Se escaló por | Veredicto | Avisos |
|---|---|---|---|---|---|
| `dash` | 3 | ×0.5336 | el ojo: 23.1 px (= `run`) | aviso | ancho 2.77 y 2.94 m (el encargo dice ≤ 2.7): la espada arrastra |
| `death` | 5 | ×0.5528 | **la cabeza**: 51.9 px (`hurt`: 51.8) | **ok** | ninguno |
| `drink` | 4 | ×0.6596 | el ojo: 25.2 px (`idle`: 25.3) | aviso | ancho 1.92–2.12 m (≤ 1.9): la espada |
| `interact` | 3 | ×0.6794 | el ojo: 25.3 px (`idle`: 25.3) | aviso | ancho 2.40 y 2.45 m (≤ 2.2): la espada |

**`dash`: el encuadre.** Sin ajuste, `dash_00` quedaba a 2 px del borde (el contrato pide 4) y `dash_01` se salía 3 px por la izquierda: la espada que arrastra hace la pose más ancha que el lienzo. El usuario eligió la **opción B**: `placement.json` con **dx +3 en `dash_00` y +8 en `dash_01`**, que mueve el fotograma **entero** (una traslación; el centro de masa queda 3 y 8 px —0.05 y 0.12 m— por delante de la caja) **sin tocar la escala ni un píxel**. La alternativa (una escala menor, ×0.50) habría encogido el ojo un 7 % respecto al de la carrera.

**Decisiones del usuario aplicadas:** `drink` e `interact` se aceptan **con la espada a la vista** (en idle, walk, run, jump, land y hurt no se ve; en `dash`, `cast` y los ataques sí: se verá aparecer y desaparecer al beber o interactuar); el filo de la espada **se queda cian** en estas animaciones y los ataques originales conservan el suyo (rojo en los dibujos 7 y 8).

**Lo que la herramienta no puede juzgar y se miró en la hoja de contacto:** es **el mismo personaje** (cúpula con cresta, ojos con tres reflejos, antenas finas, armadura con líneas cian; **la proporción cabeza/ojo es 2.3–2.6 en las hojas nuevas y 2.2–3.0 en los fotogramas del juego**); la espada, en la mano derecha; sin partes duplicadas. Diferencias de acabado (no fallos): un render más brillante y los paneles azules translúcidos de los costados dibujados como placas oscuras. En `death` los **ojos se quedan a pleno brillo hasta el suelo** (el brief pedía apagarlos hasta el 10 % para que se lea «derrotado, no dormido»; los fotogramas antiguos sí se apagaban) y la caída es **hacia delante** (el brief pedía de espaldas).

## 3 · La herramienta: la cabeza que gira

Con la hoja real de `death` la herramienta **falló la primera pose** («dibujada a otra escala», +33.1 %) y ningún `--scale` lo arreglaba. No era la pose: el ojo medía **41.6 · 35.0 · 31.2 · 24.3 · 25.8 px** porque la cabeza se gira y cae, mientras que **la cabeza medía casi lo mismo en toda la hoja** (96.8 · 93.6 · 93.9 · 84.5 · 84.5 px). Al escalar por la mediana de unos ojos que se encogen, la primera pose salía un tercio más grande que `hurt_00`, el fotograma que la precede en el juego (se veía en la fila 4 de la hoja de contacto).

La ampliación (`docs/ART-PIPELINE-2D.md`, **O.4.1**): `headDiameter` mide **el círculo más grande que cabe dentro de la figura**; y la regla (`scaleProxy`) es **una sola, con la tolerancia de siempre (±14 %)**: se mide por el ojo, **salvo** que los ojos de la hoja discrepen (o se vean en menos de la mitad de las poses) **y sus cabezas coincidan**; entonces se escala y se juzga por la cabeza. **Si discrepan las dos medidas es una diferencia de escala real y falla por el ojo, como antes.** Los tres clips que ya pasaban salen con **exactamente** la misma escala de antes.

- **Calibración** con los 114 fotogramas del juego: dentro de un clip la cabeza no se aparta de su mediana más del **8.5 %** (el salto), casi siempre menos del 4 %; en la muerte antigua —cinco de nueve fotogramas sin ojo medible— se mantiene en el 1.3 %.
- **Pruebas:** +12 (3 en `figure.test.ts`, 9 en `intake.test.ts`), con poses sintéticas: la medida sobre discos de 20 a 101 px (con hueco, con antena y hoja, en un borde); la cabeza no cambia cuando el ojo se apaga; la regla en todos sus casos —**incluido que una diferencia de escala real NO pasa por «cabeza girada»**—; el juicio por la cabeza (un 20 % de más avisa, un 37 % falla) y la comparación con el vecino.
- **Dos dependencias de los *stand-ins* de `death`** que una entrega rompía, ahora dirigidas por el manifiesto: la prueba `eyeless` de `intake.test.ts` y el E2E `player-anim` (fijaba `death_08` como último fotograma). Y, de la entrega anterior, la prueba que copiaba la bandeja real (commit `8204814`).

## 4 · Qué cambió en el repositorio con las entregas

- `art/player/hero/`: `dash` 4 → **3** fotogramas, `death` 9 → **5**, `drink` 6 → **4**, `interact` 4 → **3** (los que dibujó el usuario sustituyen a los del *stand-in*; sobran los antiguos y se borran). **114 → 106** fotogramas; los **91** de los otros clips, byte a byte los mismos.
- `art/player/player.pack.json`: las cuatro entradas (sin la etiqueta `stand-in`, con el comentario que dice **cómo** se escaló: `death`, «por el tamaño de la cabeza») y la cifra del comentario general (114 → 100 fotogramas que hace el generador). `hero.rig.json`: `"delivered": ["dash", "drink", "interact", "death"]`.
- `art/player/requests/`: los cuatro clips pasan a *entregados* (se quitan sus briefs y referencias; el kit queda en 16 archivos). `art/player/source/delivered/<clip>/`: la hoja, el `placement.json`, `delivery.json` y el informe de cada uno.
- `public/art/player/`: atlas del héroe **1.76 → 1.72 MB** de PNG (**1344 × 1344 → 1376 × 1372**, 6993 → **7375 KB** decodificados: +5 %).
- **Fuera de las entregas** (la herramienta, sus pruebas y la documentación): ver el apartado 3 y `docs/ART-PIPELINE-2D.md`.

## 5 · Regresión

| Comprobación | Resultado |
|---|---|
| `tsc --noEmit` | sin errores |
| Pruebas unitarias | **164 archivos · 2587 pruebas** en verde (2575 + 12 nuevas), **dos veces**: con la herramienta sola y con las cuatro entregas puestas |
| `assets:check` · `assets:verify` | OK · `animate --check`: **sin deriva** (91 fotogramas hechos por el generador, 4 clips entregados que deja como están) · `intake -- kit --check`: el kit es lo que producen los datos (16 archivos) |
| `build` | OK · arranque en frío de R1: **195.8 KB gz, sin cambio** · imágenes del arte que espera la primera imagen: 7 archivos, 4092 KB (el atlas del héroe, 1.72 MB, es uno) |
| E2E en desarrollo | **49 de 49 escenarios** en verde, incluidos `player-anim` (la muerte reproduce sus 5 fotogramas y se queda en el último), `player-art`, `player-lab`, `player-r1` (la interacción con su clip), `death`, `movement`, `bottles`, `interaction`, `fallbacks` y `soak` |
| E2E en producción (`--prod`, sobre el bundle recién construido) | **49 de 49** |

(El E2E de desarrollo se pasó dos veces: la primera coincidió unos segundos con un `git stash` accidental —deshecho al momento— y se repitió entera, limpia, para no fiarse de una pasada que pudo ver archivos antiguos. Las dos dieron 49 de 49.)

**Lo que no se ha tocado:** `src/`, el motor, la física, las colisiones, el daño, las habilidades, las botellas, los puntos de control y los controles táctiles; `hero-sheet.png` y `hero-portrait.jpg`; los otros 14 clips y sus 91 fotogramas (byte a byte los mismos). **Nada visto en un dispositivo real.**

## 6 · Las Hojas 2 y 3: lo que hay y lo que no se puede integrar

**No se ha aceptado nada** y no se ha asignado ninguna pose a un clip por suposición. Cada fila se pasó por `assets:intake` **en una copia aparte del repositorio** (nunca en el real), contra el clip al que se parece, para ver qué diría la herramienta.

### Hoja 2 — 16 poses (5 + 6 + 5), no 19

| Fila | Poses | Clip al que se parece | Lo que pide | Qué dice la herramienta |
|---|---|---|---|---|
| 1 | 1–5 | `attack2` | **7** | **Se niega**: no distingue 7 poses (hay 5, y los arcos azules unen las vecinas). Faltan 2 |
| 2 | 6–11 | `aerialAttack` | **6** ✓ | Encuentra las 6, escala por la cabeza (56.4 px, la de `attack1`: 56.5) y **falla**: sin anclas (esperable), `aerialAttack_02` **no cabe en el lienzo** (18 px por abajo) y quedan **restos de los trazos azules** (fragmentos blancos sueltos) |
| 3 | 12–16 | `crouchAttack` | **6** | **Se niega**: hay 5. Falta 1 |

- **Efectos pintados en la propia figura: 8 de las 16 poses** (2, 3, 4, 8, 11, 13, 14 y 15: arcos y estelas azules). Los briefs piden **ninguno** (los pone el juego, y se duplicarían). La herramienta solo vigila el rojo; los arcos azules no son un recorte limpio posible.
- **El contenido frente al brief:** en la fila 1 la hoja **no sube por encima de la cintura** (el `attack2` pide un corte ascendente que acaba **sobre la cabeza**, y el E2E `player-anim` exige que la punta suba ≥ 0.4 m); en la fila 3, las poses 12 y 13 están **tan altas como las estocadas de pie** (el centro de la cabeza a 1.2–1.3 diámetros sobre los pies, contra 0.9–1.1 de una agachada); la fila 2 sí sigue los papeles del brief (recogida, preparación, tajo, seguir el golpe, caída).

### Hoja 3 — 12 poses (4 + 4 + 4), como se anunció, pero no repartidas 2 + 4 + 6

El centro de la cabeza sobre los pies, en diámetros de cabeza (una marcha de pie da 1.44–1.53; una agachada debería quedar sobre el 60 %):

| Fila | Poses | Altura de la cabeza | Es | Pide el clip | Qué dice la herramienta |
|---|---|---|---|---|---|
| 1 | 1–4 | 1.07 · 0.98 · **0.61** · 1.03 | agachada (la 3, muy baja: casi a rastras) | `crouch`: **2** (la misma agachada con un 2–3 % de «respiro») | **Se niega**: hay 4 |
| 2 | 5–8 | 0.94 · 1.00 · 0.90 · 1.06 | agachada andando | `crouchWalk`: **4** ✓ | **Procesa** (escala ×0.601 por el ojo: 25.3 px, el de `idle`); **un fallo**: `crouchWalk_03` mide 2.77 m de ancho (límite 2.1: +32 %) y las otras tres avisan (1.83–1.97 m de alto contra 1.8; 2.5–2.7 de ancho): **la espada arrastrando**, que el límite del clip no preveía |
| 3 | 9–12 | 1.53 · 1.46 · 1.44 · 1.45 | andando de pie | `walk`: **6** | **Se niega**: hay 4. Faltan 2 |

Sin efectos pintados, fondo limpio, corte limpio, el mismo personaje.

## 7 · Lo que queda por decidir (y no se ha hecho)

1. **Hoja 2.** Los tres golpes necesitan **hojas nuevas**: `attack2` (7), `aerialAttack` (6) y `crouchAttack` (6), **una hoja por clip**, con el número exacto de poses y **sin ningún trazo azul** (el prompt ya lo pide; reforzarlo con el negativo «motion streak, slash arc, trail, glow trail»). Con arcos pintados no hay recorte limpio posible y la herramienta no los quita (no es un recorte técnico: borraría píxeles de la figura).
2. **Hoja 3.** (a) `crouchWalk` (fila 2) es integrable **si se ensanchan los límites de tamaño del clip** (`widthM` y `heightM` de `requests.json`, que suponían una figura sin espada; con la espada a la vista que el usuario aceptó para `drink` e `interact`, el ancho llega a 2.8 m). (b) `crouch` necesita **2** poses y la fila trae 4: hay que **elegir cuáles** (la 3 es otra postura, no un respiro) o pedir un par nuevo. (c) `walk` necesita **6** y hay 4: **pedir 2 más**, o bajar el clip a 4 fotogramas a 8 fps (el mismo medio segundo de ciclo; es un cambio de datos del clip, no de la herramienta).
3. Mismo criterio de siempre: aceptar un clip es **mirar su hoja de contacto** y pasar `--accept`.

## 8 · Cómo se hizo

```
npm run assets:intake -- status
npm run assets:intake -- <clip>             # informe + contact.png
npm run assets:intake -- <clip> --accept    # por `delivered`, solo si no hay fallos y es lo que enseñó el informe
npm run assets:intake -- kit [--check]
```

El recuento de poses de las Hojas 2 y 3, las alturas de la cabeza y los ensayos por fila están hechos con la **propia librería de la herramienta** (`cutSheet`, `figureMask`, `headDiameter`) y la copia aparte del repositorio; nada de eso se versiona salvo las imágenes de [`img/prompt11/`](img/prompt11/).
