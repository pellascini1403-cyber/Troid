# Prompt 24 — Dirección artística autónoma: el elenco con anatomía propia

> Registro de trabajo. Se actualiza fase a fase; lo que sigue es el estado real, no el plan.

## 1. El mandato

El propietario no va a producir más hojas de sprites, dibujos, partes anatómicas, animaciones ni referencias. **Todo el apartado artístico pendiente es de quien programa**: auditar cada criatura y cada guardián, decidir su diseño, producirlo, implementarlo en el juego, revisarlo con capturas reales y corregirlo. Sin una lista de preguntas por fase: lo que no está decidido, lo decide el diseño.

Lo que **no** se toca (y por qué):

| Intocable | Razón |
|---|---|
| La identidad del protagonista (ojos, colores, anatomía, ropa) | El diseño «ojo rojo + corona dorada» de una de las hojas **no está aprobado** y no se usa como referencia |
| `hitbox`, colisiones, IA, estados de combate, ataques, puntos débiles, aparición/desaparición, daño | La vista **lee** el estado; nunca lo decide. La simulación sigue siendo bit a bit la misma (`fullrun`) |
| El presupuesto del arranque en frío (204 800 B gz) | Todo el arte nuevo viaja en trozos diferidos |
| Las 60 llamadas de dibujo por fotograma y los 40 MiB de arte por sala | Los rigs son geometría y unas pocas texturas grises compartidas, no páginas de arte |

**Una corrección de hecho.** El encargo habla de «la arquitectura actual de Godot». El proyecto es **PixiJS 8 + TypeScript** (Vite; Capacitor para móviles). Los objetivos de rendimiento móvil se aplican sobre esa arquitectura.

## 2. El lenguaje visual (de las cuatro hojas)

Las cuatro hojas (Murciélago de cueva, Behemot del cráter, Sombra del velo, Soberano de ceniza) se usan **solo como dirección de arte**: cómo se dibuja, no qué se dibuja. De ellas salen las reglas que comparte todo el elenco:

1. **Cuerpo oscuro y lustroso.** Casi negro, húmedo; el volumen lo dan la luz de borde y el brillo, no el relleno.
2. **Luz de borde fina y coloreada** en el lado que mira a la luz (arriba y *detrás*: la cueva brilla a la espalda de las cosas oscuras), más un reflejo tenue desde el suelo en el borde inferior. Se calcula del propio contorno (`kit/geometry#rimBands`), así que cualquier forma queda iluminada igual.
3. **Lente de brillo**: una elipse tenue y otra pequeña y más clara dentro.
4. **Ojos incandescentes** con *bloom*; se cierran al dolor y se agrandan con el aviso.
5. **Halo de energía** detrás del cuerpo, que **crece con el aviso** (el telegrafiado se lee primero en la luz y en la silueta, después en el detalle).
6. **Sombra de contacto** bajo las criaturas de suelo.
7. **Destello blanco** al golpe: la silueta entera en blanco aditivo.
8. **Muerte** como disolución (charco, ceniza, astillas), nunca un simple desvanecer.

Cada especie añade **su anatomía y su material** sobre ese lenguaje; no hay cuerpos compartidos que solo cambien de color.

## 3. Arquitectura: los rigs

Un *rig* es una criatura dibujada como **partes articuladas** (`src/rigs`) y animada por código. Cada especie tiene su propia anatomía —un murciélago tiene alas, una araña tiene patas, un sapo tiene una garganta que se hincha— y ninguna está obligada a compartir partes con otra. El contrato de seis partes del ProceduralActor (cuerpo, destello, ojos, sigilo, púas, charco) **sigue existiendo** para la Babosa de Tinta (que tiene arte) y como *fallback*; un rig no lo usa.

```
src/rigs/
  kit/geometry.ts   contornos suaves (Catmull–Rom → Bézier), normales, bandas de luz de borde, color
  kit/assets.ts     las pocas rampas grises compartidas (se tiñen) + caché de geometría por especie
  kit/paint.ts      el «pincel» (Pen): una superficie entera de una vez — relleno, borde, luz, brillo
  kit/materials.ts  tinta, sólido, calcinado…: cómo se ve de qué está hecho
  kit/kit.ts        Part · Ribbon (tiras que siguen una espina) · Patch (membrana) · Cloth (velo) · Kit
  kit/motion.ts     muelles, IK de dos huesos, ciclo de paso, cadenas, tentáculos, motas
  RigActor.ts       la EntityView: interpola, refleja por el lado al que mira, deriva los «sentimientos»
  species/*.ts      un archivo por especie
```

- **La vista lee, nunca decide.** `RigActor` convierte el `ActorViewState` (`anim`, `phase`, `phaseT`, velocidad) en un `RigFrame`: `heat` (el aviso creciendo), `strike`, `hurt`, `dying`, `open` (la abertura), y para los jefes `exposed`, `attackKey`, `hpFrac`, `enraged`. Cada especie anima sus partes desde eso.
- **Nada se asigna por fotograma**; la geometría de cada forma se construye **una vez por partida** y la comparten todas las criaturas de la especie (`GraphicsContext` compartido). Las tiras y membranas son mallas de topología fija cuyos vértices se reescriben.
- **Rampas grises teñidas**: todas las superficies sombreadas usan 5 texturas de 64×64 compartidas (`sphere`, `vert`, `tube`, `cap`, `fade`) con un tinte por forma, así que cualquier número de criaturas de cualquier color se agrupa en las mismas tandas.
- **Fallback**: una criatura o guardián cuya mirada no tiene rig (o cuyo trozo no pudo bajarse) se dibuja con sus formas procedurales, exactamente como antes. La tabla `RIGS` crece de a una especie y el juego nunca tiene un hueco.
- **Separación visual/lógica**: cambiar el dibujo de una especie no toca IA, ataques ni combate; `tests/unit/rigs/rigActor.test.ts` recorre **todos** los rigs en todos los estados del vocabulario.

### Carga diferida y presupuesto del arranque

`app/rigs.ts` es un trozo propio (como `bossViews`), que el juego pide con los efectos una vez dibujado el primer fotograma y que **la llegada a cualquier sala posterior a las cuatro primeras espera** junto con el arte de su zona. Hasta que llega, una criatura se ve con sus formas (la Babosa, que es lo único que hay antes, no espera nada).

Para pagar el gancho del primer fotograma se **sacó de él** lo que no necesitaba: las 19 miradas procedurales de las criaturas y guardianes que vienen después de la Babosa viajaban en el arranque (`content/proceduralActors.ts`); ahora solo viaja la de la Babosa (`content/slimeLook.ts`) y el resto llega con `content/beyond.ts`. **Arranque en frío: 203 809 B de 204 800 (quedan 991 B; eran 77 B)**.

## 4. Estado

| Fase | Contenido | Estado |
|---|---|---|
| F1 | Kit de rigs, `RigActor`, carga diferida, laboratorio `?lab=rigs`, pruebas, murciélago de cueva | **hecho** |
| F2 | 14 criaturas de la primera mitad (la tabla de `RIGS`: murciélago de cueva, trepador de zarza, sapo del cenagal, lomo de piedra, espora luminosa, escupidor de tinta, fuego fatuo de linterna, campana tañedora, fragmentado, esquirla de cristal, dron de pistón, sanguijuela del suelo, tejedora de tinta, sombra del velo) | **hecho** (revisión en el juego: 13 de 14 capturadas en su sala real; la esquirla solo existe en pelea) |
| F3 | 10 criaturas de la segunda mitad: escarabajo de escoria, polilla de ceniza, medusa de brasas, bestia de horno, centinela de basalto, sapo de obsidiana, gong de ceniza, peso de fragua, cangrejo-horno, segador de brasas — **ninguna es la de la primera mitad con otro color**: cada una tiene otra anatomía para el mismo cerebro | **hecho** (las 10 revisadas en su sala real) |
| F4 | 10 guardianes | pendiente |
| F5 | Los 6 estados pendientes del héroe | pendiente |
| F6 | Arenas con identidad y peligros reales | pendiente |
| F7 | Verificación final y documentación | pendiente |

## 5. Cómo se mira

`npm run dev` y `?lab=rigs&id=cave_bat` (varias con comas, `all` para todas; `&pick=0,6,8` solo esas poses; `&pose=attack:0.5` una sola; `&crowd=12` una multitud para contar llamadas de dibujo). Cada celda es una pose (el inicio, el medio y el final de cada estado), dibujada por el propio renderizador del juego. La revisión definitiva es **en el juego**: sala real, cámara real (≈ 53 píxeles por metro en un móvil horizontal: una criatura de 0,9 m mide ~48 px, de modo que lo que manda es la silueta, la luz de borde y el halo, y el detalle fino es un premio para el que se acerca).
