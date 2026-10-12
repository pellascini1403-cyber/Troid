# Prompt 8 — de la slice técnica a una slice producida (S45 →)

> **Qué es esto.** El encargo del Prompt 8 es llevar la vertical slice técnica (que ya se juega de punta a punta) hacia una versión **visualmente cercana a una producción real**, **sin rehacer la arquitectura** y con la
> jugabilidad, los controles, la lógica, el rendimiento y los contratos intactos. Se hace por **fases, en orden estricto** (una zona se termina antes de empezar la siguiente):
> **A** protagonista · **B** R1 · **C** R2 · **D** R3 · **E** R4 · **F** jefe · **G** enemigos · **H** VFX · **I** iluminación y parallax · **J** integración y regresión completa.
>
> **Dirección visual.** Dos referencias principales: **Hollow Knight** (estructura, composición de salas, siluetas, profundidad, atmósfera oscura) y **Solo Leveling** (energía, VFX, partículas, auras, impactos, iluminación y contraste
> entre oscuridad y energía luminosa). No Zelda / BOTW / TOTK. **Propiedad intelectual original: no se copia ningún personaje, enemigo, escenario, símbolo, UI ni efecto de ninguna referencia.**
> Paleta: negro, blanco, cian/azul de energía y violeta para lo enemigo; el carmín solo atenuado y secundario.
>
> **Regla absoluta sobre el protagonista.** Las imágenes que aportó el usuario son la máxima autoridad: no se rediseña, no se «mejora», no se humaniza, no se cambia la cabeza, la cara, el pelo, la máscara, la silueta, la ropa,
> las proporciones ni la paleta, y no existe un protagonista alternativo. El escenario, los enemigos y los VFX sí pueden crearse de nuevo, siempre que sean coherentes con esa dirección.
>
> **Regla sobre los *placeholders*.** Una zona no se da por terminada mientras dependa visualmente de cápsulas, rectángulos, geometría procedural, fondos planos, VFX temporales o *sprites* genéricos. Al final de cada fase se dice
> **exactamente qué *placeholder* se quitó** y cuáles quedan.

## Fase A — el protagonista definitivo (S45)

**Resultado en una frase:** el protagonista **se dibuja con los píxeles de la hoja de poses del usuario** (`art/player/source/hero-sheet.png`, guardada bit a bit) en **todos** los estados del juego; la cápsula ya no aparece en
modo `auto`. Pero la hoja es **de concepto** —una pose por acción—, así que **no es un protagonista animado**: es lo que la hoja permite, dicho con todas sus letras más abajo.

### Qué se hizo (y qué no)

- **Solo operaciones técnicas sobre la hoja** (`tools/assets/poses.ts`): fondo transparente por proyección de color con *des-mezcla* del borde, y nada más. **No se dibuja, no se recolorea, no se suaviza, no se retoca, no se añade un píxel.**
  Lo que no es la figura (sombra del suelo, líneas de velocidad, polvo, destellos y arcos de energía **roja** sueltos) se deja fuera; el rojo que **toca** la figura (el filo de la espada, un detalle de su armadura) se queda.
- **Una descripción de datos, no código** (`art/player/source/hero.poses.json`): qué rectángulo de la hoja es cada pose, dónde están sus pies, dónde se sostiene la espada, qué pose mira a la izquierda (se **espeja**, nada más) y a qué
  escala visual se dibujó. `npm run assets:poses` lo ejecuta y `-- --check` comprueba que los fotogramas versionados son **exactamente** los que la hoja produce: nadie los ha tocado a mano.
- **Escala y anclas medidas sobre la imagen**: 130 px/m, lienzo común de 344 × 320, pivote en los pies; `hand_r`, `weapon_grip`, `weapon_tip`, `hit_origin`, `vfx_origin` y `projectile_origin` por fotograma, en metros desde los pies.
  El agarre de la espada coincide con la mano (**0.00 m**, la regla del contrato es ≤ 4 cm).
- **Un único contrato nuevo**, necesario porque las poses se dibujaron a tamaños distintos: `FrameMeta.scale` (multiplicador visual de **ese fotograma** alrededor de los pies; un ajuste de integración, como `visualScale`: cambia lo que
  se ve y **nunca** lo que ocurre). Lo usa la pose de lanzamiento (×1.3).

### Los 15 clips de la entrega

| | Clip | Origen |
|---|---|---|
| **Arte propio** (7) | `idle`, `walk` (la pose de carrera), `jump`, `fall`, `attack1` (la estocada baja), `hurt`, `cast` (la espada en alto, espejada, ×1.3) | un fotograma cada uno, de la hoja |
| **Extra** | `land` (la agachada de aterrizaje) | de la hoja; no es de los 15, pero el héroe publica 18 estados |
| ***Stand-ins*** (8) | `dash`, `attack2`, `attackAir`, `crouch`, `attackCrouch`, `death`, `drink`, `interact` | **la pose de otro clip**, porque la hoja no tiene pose propia; etiqueta `stand-in` y un comentario que dice cuál reutiliza |

`npm run assets:missing` **los cuenta como NO entregados**: hoy dice **7 de 15 clips con arte propio**. Las poses 2, 8, 9 y 10 de la hoja no se usan (la 2 es una segunda postura quieta que ningún estado pide; las otras tres tienen el efecto
rojo fundido con el cuerpo o la espada, y separarlo sería dibujar).

### *Placeholders* quitados y los que quedan

- **Quitado:** la **cápsula con espada** del protagonista, en **todos** los estados, con `?visual=auto` (el valor por defecto). Sigue existiendo como camino de vuelta (`?visual=placeholder`) y como *fallback* por estado.
- **Quedan, dentro del propio protagonista:** 8 de 15 clips son la pose de otro clip; **ninguno está animado** (un fotograma por clip: el héroe «salta» entre poses, no se mueve entre ellas); el *dash* se ve como la carrera.

### Archivos

Nuevos: `tools/assets/poses.ts`, `heroFrames.ts`, `poses-cli.ts` · `art/player/source/{hero-sheet.png,hero-portrait.jpg,hero.poses.json}` · `art/player/hero/*.png` (16 fotogramas generados) · `public/art/**` (empaquetado, versionado) ·
`tests/unit/tools/{poses,heroFrames}.test.ts`. Modificados: `src/presentation/{SpriteSetDefinition,artManifest}.ts` (`FrameMeta.scale`), `src/render/ActorSprite.ts` (escala por fotograma), `src/app/labs/playerLab.ts`,
`tools/assets/missing.ts` (los *stand-ins*), `art/player/player.pack.json`, `package.json` (`assets:poses`), 4 archivos de pruebas unitarias y 7 escenarios E2E (ver «Pruebas que se adaptaron»), `tools/e2e/run.ts` (`--only=`), la documentación.

### Herramientas usadas

`npm run assets:poses` (y `-- --check`), `npm run assets:missing`, `?lab=player&look=art` (un clip cada vez, con anclas, espada, escala y las cuatro cajas del juego) y *scripts* de película que reproducen el juego real y apilan fotogramas (en el espacio de
trabajo, fuera del repositorio).

### Verificación

| | Resultado |
|---|---|
| `tsc` | limpio |
| Pruebas unitarias y de integración | **2257 en 143 archivos** (eran 2223 en 141: +34, las de la extracción de poses y de los fotogramas del héroe) |
| E2E (desarrollo y producción) | **43/43 en los dos modos** |
| `build` (con `assets:check`) | limpio |
| Llamadas de dibujo | sin cambios (el escenario `art-performance` y `r1` miden las mismas: R1 entera ≤ 12) |
| Arranque en frío (KB gzip, 200 de presupuesto) | **190.8** (antes 190.7): el arte se descarga después del primer fotograma |
| Primera sesión entera con el arte | 216.4 (el *chunk* de arte, 10.5 KB gzip, y los demás diferidos) |

### Pruebas que se adaptaron (y por qué)

El repositorio **ya tiene arte propio por defecto**; varias pruebas suponían lo contrario. Se adaptaron **conservando lo que prueban** y sin bajar la base:
`artRepo.test.ts` (×3) y `missing.test.ts` (×1) describían el repositorio «sin arte» y ahora describen el estado honesto (7 de 15, 8 *stand-ins*); los escenarios `assets`, `player-art`, `player-lab` y `player-r1` abren la página con
`art=` / `art=art-test` para seguir probando el *fallback* sin arte y el arte sintético completo; `movement`, `crouch` y `combat` miraban fotogramas del *placeholder* por nombre y ahora piden `visual=placeholder`. Se añadió una sección que
prueba el arte real del repositorio.

### Problemas encontrados (y resueltos)

1. **Una carrera en un escenario** (`player-r1`, solo en producción): la primera muestra de la partida con el arte se tomaba entre «el arte está puesto» y el siguiente fotograma dibujado, y `visual.shows` todavía decía `placeholder`.
   No era del juego —en desarrollo el fotograma llegaba antes— sino de la prueba, que esperaba al estado equivocado. Ahora espera a `art attached && shows === 'art'`.
2. **Reinicios del entorno** cortaron dos pasadas largas de E2E; el ejecutor aprende `--only=a,b,c` (nombres exactos) para reanudar donde se cortó.
3. Los hallazgos de la extracción (rojo pegado a la figura, bordes mezclados con el fondo, agujeros cerrados por la figura, la pose espejada) están en `docs/ART-PIPELINE-2D.md`, parte L.

### Pendiente de la fase A (a propósito, no se puede resolver sin un artista)

- **Animación real**: ciclo de caminar/correr, ataques de varios fotogramas, muerte, beber, interactuar, *dash*, agacharse (el contrato ya los pide; la guía de entrega dice cómo).
- **Legibilidad**: el héroe es casi negro. Se resuelve en la composición de los escenarios (luz **detrás**, oscuridad **delante**, riesgo R14) y, si hace falta, con un borde de energía en tiempo de ejecución (fase I).
- **Revisión artística** de la pose de lanzamiento (escalada ×1.3 y espejada) y de la estocada (una embestida baja frente a una caja de golpe que no cambió).
