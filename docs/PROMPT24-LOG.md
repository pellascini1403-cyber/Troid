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
| F4 | 10 guardianes, cada uno con otra silueta, otros materiales, otra manera de mostrar su punto débil y otra muerte (§5) | **hecho** (los diez revisados en su sala real, a escala de móvil) |
| F5 | Los 6 estados pendientes del héroe (segundo golpe, golpe en el aire, agacharse, gatear, golpe agachado, beber) — 26 fotogramas hechos de los dibujos de la dueña | **hecho** (los seis vistos en el juego, fotograma a fotograma) |
| F6 | Arenas con identidad y peligros reales | **parcial** — repisas a 3 m en cinco arenas, atadas a las alturas de cada guardián, y la contradicción de la lava resuelta; lo que no se hizo está dicho en §7 |
| F7 | Verificación final y documentación | pendiente |

## 5. Los guardianes (F4)

Los diez comparten **cómo se hacen** (`rigs/kit/boss.ts`: `Opening` suaviza la abertura del punto débil, `Waking` el despertar, `surge` el rugido del cambio de fase, `Beacon` la luz y los anillos que dicen «aquí, ahora») y **nada de cómo se ven**: ninguno es una cúpula con otro color. Lo que dispara cada gesto no se adivina de la animación: `Boss.publish()` pone en la vista, solo para pintar, `exposed` (el punto débil está abierto de verdad), `attackId` (la clave del ataque en curso), `hpFrac` y `phaseNo`.

| Guardián | Anatomía y material | Cómo muestra el punto débil | Lo que se lee antes de cada golpe | Cómo muere |
|---|---|---|---|---|
| Tirano de Raíces | Tronco de cuatro metros con cara de corteza, siete contrafuertes, dos brazos de rama con dedos de raíz, corona de astas | El corazón de savia tras **dos puertas de corteza** que se abren | Un brazo echado atrás (barrido); los dos brazos clavados al suelo y las raíces que se encienden (erupciones, marcha) | El tronco se parte en dos y cae; el corazón se apaga |
| Matriarca del Cenagal | El sapo del cenagal hecho enorme y viejo: anzuelo con farol, aletas pálidas, lengua que se lanza | El **vientre pálido** que cuelga cuando se desploma | Se agacha con la garganta hinchada (escupitajo), el farol arde (cambio de fase) | Suelta todo el aire y se apaga como una lámpara |
| Coloso de Cristal | Gigante de prismas cortados, cuatro patas-pilar, espinas en los hombros, un solo visor | La **ventana hexagonal** del pecho: cuatro postigos que giran de canto y dejan ver el núcleo | Puños en alto y rocas reuniéndose (lluvia de rocas); una pierna alzada (pisotón) | Se deshace por sus facetas, de la cabeza abajo |
| Custodio de la Campana | Campana que flota, corona, ojos con párpados, seis campanitas en órbita, cadenas | El **badajo** que cae y arde bajo la boca de la campana | Las campanitas aceleran y brillan una tras otra (tañido); se inclina de punta (picado) | La campana cae, se parte y los trozos ruedan |
| Motor de la Fundición | Locomotora hecha animal: caldera, tres ruedas con bielas que siguen el ángulo real, faro-ojo bajo una ceja, arado de barras por mandíbula | La **trampilla de ventilación** de la cabina, que salta con un chorro de vapor | Silba el vapor, las ruedas giran en el sitio, el faro se hincha (carga); se alza sobre las ruedas traseras (pistones); la chimenea escupe (chispas) | La caldera revienta: chimenea, cúpula y cabina por un lado, ruedas rodando por el otro |
| Soberano del Corazón de Tinta | Rey de tinta que flota sobre su charco, manto, collar de cuernos, máscara con tres ranuras, corona de espinas, dos brazos de tres cuchillas | El **corazón** violeta, siempre visible en el pecho abierto: se hincha y late más rápido, con anillos, cuando está agotado | Se disuelve y reaparece detrás con el brazo en alto, media luna en el aire (corte); gotas negras sobre la corona (lluvia); cinco esferas en la mano (orbes); brazos abiertos y pecho en llamas (nova) | El manto se hunde en el charco, la corona se deshace y el corazón se agrieta |
| Pastor del Ocaso | Árbol quemado que anda en zancos: jaula de costillas, cráneo de carnero con cuernos enroscados, capa de ceniza, **cayado con farol** | La **esfera de brasa** que sube de la jaula a la mano alzada y, después de la volea, queda en el aire con las costillas abiertas | El cayado echado sobre el hombro (barrido); alzado y clavado de culata (pisón); ambas manos arriba con la esfera encendida (volea) | Arde de abajo arriba; los cuernos se caen del cráneo y el cayado queda de pie en la ceniza |
| Jardinero de la Arboleda | Bulbo calcinado sobre cuatro patas de raíz, cara con ranuras de brasa, dos látigos de enredadera, seis vainas colgando, y un **capullo de ocho pétalos** | Los pétalos **caen abiertos como una mano** y enseñan el pistilo de brasa blanca con estambres encendidos | Se agacha (salto) y el capullo se aprieta; las vainas se hinchan y arden (anillo); los látigos arriba y clavados (raíces) | Los pétalos se caen uno a uno, el bulbo se parte y las vainas se apagan |
| Behemot del Cráter | Bestia de basalto de cuatro patas con un **cono volcánico** en el lomo, colmillos, mandíbula que se abre sobre lava | La **tapa de corteza** del cráter salta sobre su bisagra y el cráter se enciende con brasas y anillos | Raspa el suelo con el puño y baja la cabeza (carga); se alza sobre las patas traseras (pisotón); la lava se hincha en la garganta (bombas) | El cono revienta, la lava se derrama y el cuerpo se enfría: el brillo de las grietas es lo último que se apaga |
| Soberano de Ceniza | Caballero de placa negra con grietas de brasa: yelmo de visera en cruz, corona de cinco cuernos con llama en cada punta, penacho de fuego, hombreras con púas, **mandoble** de hoja agrietada | El **núcleo** de brasa dentro de tres bandas que giran como un giroscopio: cerradas lo tapan; agotado, giran de canto y se separan | Se desvanece en brasas y vuelve con el mandoble tras la cabeza (corte); la hoja alzada y hundida en diagonal en el suelo (géiseres); tres esferas en la mano libre (orbes); mandoble horizontal y todo el cuerpo adelante (carrera); brazos abiertos (nova) | La placa se cae pieza a pieza, el núcleo se apaga en un destello |

El **Custodio de Tinta** de la Babosa de Tinta sigue siendo arte propio (`GuardianView`), no un rig.

## 6. El protagonista (F5)

La hoja de la dueña tiene doce acciones y el juego pide dieciocho; los seis estados que faltaban (`attack2`, `crouch`, `crouchWalk`, `aerialAttack`, `crouchAttack`, `drink`) los dibujaba una cápsula gris. **No se rediseña a nadie ni se usa el héroe «ojo rojo + corona dorada»**: los 26 fotogramas se **derivan de los dibujos de la dueña** con lo único que el repositorio ya tenía para mover un dibujo sin inventar un píxel —la deformación de títere de `tools/assets/warp.ts` (mínimos cuadrados móviles, localmente rígida)— y unos pocos movimientos rígidos de la figura entera. Todo está en recetas (`tools/assets/heroDerivedClips.ts`) y lo ejecuta `npm run assets:derive`; `--check` (y `characterArt.test.ts`) exigen que lo commiteado sea, byte a byte, lo que las recetas producen.

| Clip | Fotogramas | De dónde sale |
|---|---|---|
| `crouch` | 2, bucle, 2 fps | `land_00` (el aterrizaje de la dueña: rodillas dobladas, cabeza adelantada, bufanda tendida) y su respiración (cabeza y pecho 3 px más arriba) |
| `crouchWalk` | 4, bucle, 10 fps | el mismo dibujo arrastrado: dos contactos (cabeza adelantada, cuerpo bajo, inclinación ±) y dos pasos (cabeza algo más alta) |
| `crouchAttack` | 5, una vez, 26 fps | los golpes de `attack1` con el cuerpo bajado (la cabeza y la bufanda conservan su tamaño; solo se aprieta el cuerpecito) — la hoja barre a la altura de la rodilla — y la agachada para asentarse |
| `attack2` | 5, una vez, 28 fps | los dibujos de `attack1` girados **sobre la mano** para que la hoja **suba** cruzando el pecho donde el primer golpe empuja: enroscarse, el impulso, el tajo ascendente, la estocada, asentarse |
| `aerialAttack` | 6, una vez, 26 fps | el salto de la dueña para recoger las piernas, los dibujos del primer golpe volcados al otro lado (la hoja **baja** en diagonal por delante) y su caída para prepararse a aterrizar |
| `drink` | 4, una vez, 10 fps | los dibujos de reposo con **un frasco de vidrio con líquido cian y el brazo pequeño que lo sostiene** (lo único que la hoja no puede prestar), pintados en el mismo oscuro con un filo de luz, la cabeza echada hacia atrás sobre el cuello y el ojo más brillante al final |

Las anclas de la espada de los tres golpes viajan por las mismas operaciones que los píxeles (`hand_r`, `weapon_grip`, `weapon_tip`, `hit_origin`, `vfx_origin`), así que los efectos del tajo nacen de donde está la hoja. Los tiempos, los bucles y las fases son los que pidió el kit de producción (`art/player/requests/requests.json`) y que la simulación mide (`heroContinuity.test.ts`). **La dueña manda**: si algún día entrega un clip (`npm run assets:intake -- <clip> --accept`), sustituye al derivado y `assets:derive` no lo vuelve a hacer. El atlas del héroe pasa de 837 KB a 1294 KB.

## 7. Las arenas (F6) — lo que se hizo y lo que NO

**Lo que había.** Diez arenas de 53 a 61 m de suelo entre dos puertas. La Raíz y el Cenagal tenían algo (dos arcos de raíz, una isla de barro); la Cámara del Coloso y las cuatro de la segunda mitad (Corral, Jardín de Esferas, Horno, Trono) eran **un suelo plano**, distintas solo por el fondo de su zona. Y la cabecera de `bossesEmber.ts` decía «las arenas tienen lava en sus bordes» sin que ninguna la tuviera.

**La contradicción, resuelta con una decisión y no con un parche.** No se puso lava en el suelo de la pelea, y la cabecera ahora lo dice. Razones medidas, no supuestas: los guardianes de la segunda mitad se ganan con lo que ya hacen sus ataques en el suelo —las ondas del pisotón del Pastor, la sacudida del salto del Jardinero, el muro contra el que acaba la carga del Behemot (que es su apertura más larga), los géiseres del Soberano—, y un suelo que quema **cambiaría esas reglas** (el muro deja de ser muro, la onda no tiene por dónde correr) y obligaría a reafinar las cuatro peleas que `encountersEmber.test.ts` gana hoy contra un héroe mortal. La lava es **el camino hacia** ellos (todas las salas de aproximación la tienen) y el peligro de la arena es **lo que el guardián hace en el suelo**. Un peligro de adorno no es un peligro.

**Lo que sí se hizo** (datos de sala, `RoomCanvas.plat`, sin tocar IA, ataques ni colisiones del suelo): **repisas a 3 m** pensadas contra los números de cada guardián —

| Arena | Repisas | Para qué |
|---|---|---|
| Corral del Pastor | 2 de madera quemada (x 23–30 y 46–53) | por encima del alcance del barrido (2,4 m); esperar el pisotón, cuyas ondas corren por el suelo |
| Jardín de Esferas | 3 de raíz (19–25, 35–41, 51–57) | estar sobre la sacudida del salto y seguir moviéndose cuando las raíces suben en fila |
| Horno del Behemot | 2 de basalto (24–30 y 50–56) | fuera de la sacudida del pisotón, y **a la altura de la corteza de su lomo** (2,1–3,4 m) cuando pasa por debajo |
| Trono de Ceniza | 3 arcos rotos (22–28, 40–46, 58–64) | moverse entre ellos cuando corta por detrás, y a la altura del núcleo (1,4–2,7 m) para quien esté en uno cuando se agota |
| Cámara del Coloso | 2 de cristal (20–26 y 46–52) | fuera de su pisotón, a la altura del núcleo de su pecho (1,8–3,2 m) cuando giran los postigos |

Comprobado: las auditorías de cada zona (`tests/integration/world/*`), las peleas contra los guardianes (`encounters*.test.ts`: las cuatro de la segunda mitad y la del Coloso se siguen ganando, sin caer) y las arenas **vistas en el juego** (la compilación de producción: cada una con su fondo y sus repisas).

**Lo que NO se hizo, dicho sin adornos:** columnas y rocas que se rompen, elementos interactivos de arena, y cambios de la sala durante la pelea (luz que cambia con la fase, grietas que se abren) —cada uno es una regla nueva que `encountersEmber.test.ts` tendría que volver a ganar y que no se ha afinado—; ni arte nuevo de escenario para las repisas (las dibuja el material de la zona, `charwood`/`basalt`, como cualquier otra). La señal visual de la pelea en curso la dan los propios guardianes (brasas, vapor, auras, el punto débil encendido), no la sala.

## 8. Cómo se mira

`npm run dev` y `?lab=rigs&id=cave_bat` (varias con comas, `all` para todas; `&pick=0,6,8` solo esas poses; `&pose=attack:0.5` una sola; `&crowd=12` una multitud para contar llamadas de dibujo). Cada celda es una pose (el inicio, el medio y el final de cada estado), dibujada por el propio renderizador del juego. La revisión definitiva es **en el juego**: sala real, cámara real (≈ 53 píxeles por metro en un móvil horizontal: una criatura de 0,9 m mide ~48 px, de modo que lo que manda es la silueta, la luz de borde y el halo, y el detalle fino es un premio para el que se acerca).
