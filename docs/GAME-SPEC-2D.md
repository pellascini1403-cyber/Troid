# Especificación del juego 2D — Troid

> **Estado:** definitiva para iniciar el Prompt 4 · **Fecha:** 2026-10-05 · **Fase:** Prompt 3 (solo documentación: no se tocó código).
> Complementos: [ARCHITECTURE-2D](ARCHITECTURE-2D.md) (cómo se construye) · [MIGRATION-2D](MIGRATION-2D.md) (en qué orden, qué se conserva, riesgos) ·
> [ADR-0003](adr/0003-arquitectura-2d-definitiva.md) (registro de decisiones `DC-xx` cerradas y `DP-x` pendientes) · [AUDIT-2026-10](AUDIT-2026-10.md) (diagnóstico del Prompt 2, que sigue vigente).
>
> Leyenda: ✅ verificado en esta sesión (código, imágenes o medición) · 📐 valor inicial de diseño: vive en datos y se ajusta jugando ·
> ⚠️ riesgo o dato que no se puede verificar aquí. Las cifras de pantalla están en **dp** (= píxeles CSS) salvo que se diga otra cosa.
> Un tick = 1/60 s. Una unidad de mundo = 1 metro.

---

## 0. Cómo leer este documento

Cada sección separa lo que **es obligatorio** (decisión cerrada) de los **valores iniciales** (se retocan en datos con el inspector en vivo, sin tocar código).
Lo que no está aquí no se implementa en el Prompt 4. Si algo de este documento contradice una imagen que aportaste, **gana la imagen** (§2.1).

---

## 1. Dirección del proyecto

| | |
|---|---|
| **Género** | Metroidvania 2D de acción y exploración |
| **Plataformas** | iOS y Android (prioridad), PC |
| **Dimensión** | **2D puro.** Sin 3D, sin 2.5D, sin modelos 3D, sin cámara 3D ortográfica «de compromiso» |
| **Renderer** | **PixiJS v8** (solo capa de presentación). Three.js sale de la arquitectura final |
| **Referencias de dirección** | *Hollow Knight*: estructura metroidvania, salas conectadas, combate 2D, lectura de siluetas, ritmo, progresión, sensación de mundo. *Solo Leveling*: energía sobrenatural, efectos de habilidades, partículas, auras, iluminación, sensación de poder, atmósfera |
| **Orden de prioridad** | movimiento → combate → exploración → progresión (y después: HUD, VFX, audio, contenido) |

### 1.1 Qué se toma de las referencias y qué no

Las referencias son **dirección**, no contenido. No se copian personajes, enemigos, mapas, UI, animaciones, ataques, nombres, diseños reconocibles, escenarios ni composiciones concretas.

| Referencia | Se toma (principio) | No se toma |
|---|---|---|
| Hollow Knight | Salas conectadas con rutas bloqueadas por habilidad; combate lateral legible; siluetas fuertes sobre fondos con profundidad; mundo que se siente previo al jugador; capas de parallax, niebla, haces de luz y primer plano oscuro | Caballero sin rostro con cuernos, HUD de máscaras y alma, bancos como guardado, títulos de zona con ornamento, bestiario, mapa, lore |
| Solo Leveling | Energía sobrenatural que se lee como poder: auras, arcos de ataque, estelas, ráfagas de partículas, luz que nace del propio personaje | Diseños de personajes, poses, armaduras, efectos específicos, UI |
| Capturas de escenarios aportadas | Estructura de capas, valores (luz detrás, oscuro delante), densidad de detalle, partículas ambientales | Composiciones, arquitectura, criaturas, HUD (ver §3.6) |

**Objetivo de identidad (DC-17):** *metroidvania 2D oscuro + fantasía sobrenatural + energía cian/azul + siluetas fuertes + VFX espectaculares*.
La inspiración debe notarse en la calidad y el lenguaje visual, no en la copia: no debe quedar como «Hollow Knight con un personaje de Solo Leveling».
Los rasgos propios que se protegen: la silueta del protagonista (§2), el lenguaje de energía cian contra energía violeta enemiga (§3.5) y los enemigos de tinta (§3.4).

### 1.2 Lo que el juego NO es

3D · 2.5D · RPG de estadísticas · mundo abierto · multijugador · inventario complejo · árbol de talentos. La progresión es de **habilidades y acceso** (§13).

---

## 2. Protagonista — fuente de verdad

### 2.1 Regla de precedencia (DC-11)

1. **Las imágenes que aportaste son la fuente de verdad visual del protagonista.** Si una descripción escrita (de este documento o de cualquier prompt) contradice la imagen, **se respeta la imagen**.
2. El protagonista **ya está diseñado**. No se rediseña, no se redibuja, no se le cambia la cabeza, no se le pone cara humana, no se le cambian los colores.
3. Las imágenes son **concept art**, no sprites de producción: no se asumen hojas de sprites, ni transparencia, ni escala o pivote coherentes.
4. **No se recortan automáticamente** partes del personaje para convertirlas en sprites finales sin verificar pieza a pieza.
5. Las animaciones de producción **se derivan del diseño existente**; no crean un personaje nuevo.

La lectura de «proporciones chibi» (que sí pides) frente a «no lo conviertas en humano/chibi» (que también pides): se interpreta como *chibi sí, humano no*; el criterio de desempate es la imagen, que muestra una criatura insectoide de proporciones chibi.

### 2.2 Inventario de referencias (medido ✅)

| Referencia | Formato real | Qué es | Qué **no** es | Uso permitido |
|---|---|---|---|---|
| Retrato «YOUR MAJESTY» | JPEG 720×720, sin alfa, fondo blanco con ruido de compresión, **lleva texto** | Concept art de identidad: cabeza, ojos, antenas, paleta, proporciones | Sprite; no incluye espada ni capa definida | Referencia de identidad y de paleta |
| Hoja de poses | PNG 1536×1024, sin alfa, fondo blanco roto, sombras suaves | 12 poses (lectura mía de cada una: idle ×2, carrera, salto, caída, aterrizaje, 2 ataques, carga con aura, dash, daño, pose con arma) y el **lenguaje de VFX** (arcos, estelas, ráfagas) | Spritesheet: escala de 193 a 321 px según la pose, pivotes distintos, efectos rojos fusionados con el cuerpo, una sola imagen por pose | Referencia de poses, timing y **formas** de VFX |
| Enemigos «babas negras» | JPEG 800×698, sin alfa, fondo gris azulado `#818795` | 12 siluetas de tinta negra con ojos blancos ovalados; superficies lisas y curvas | Sprites ni diseño final de enemigos | Referencia de estilo y de variedad de silueta |
| Escenarios (12 imágenes) | JPEG/PNG de capturas de otros juegos | Referencia de capas, valores, luz y partículas | Assets ni composiciones a copiar | Solo análisis de estilo (§3.6). **No se versionan en el repositorio** |

### 2.3 Rasgos que deben respetarse

| Requisito (tuyo) | Qué se ve en las imágenes ✅ | Consecuencia para producción |
|---|---|---|
| Cabeza/cráneo de criatura, **sin rostro humano** | Cabeza negra de contorno puntiagudo, sin boca ni nariz, dos ojos enormes redondos | Nada de rasgos humanos añadidos; los ojos son el rasgo de identidad |
| Estética insectoide humanoide | Dos antenas largas y finas; manos con garras; pies con púas | Las antenas son parte de la silueta: deben leerse a escala de teléfono |
| Proporciones chibi/estilizadas | Cabeza ≈ la mitad de la altura; cuerpo pequeño | Se mantienen en todas las poses |
| Armadura/ropa predominantemente negra | Negro azulado `#101316`: 42 % de los píxeles del personaje | El negro es la base; ver §3.3 sobre legibilidad |
| Detalles de energía cian/azul | Ojos y líneas del torso en cian `#7fdaf2` | Es la identidad de color; **no se recolorea** (DC-12) |
| Pequeños acentos luminosos | Reflejos blancos en los ojos (3 por ojo), líneas luminosas | Se conservan; en la pose de carga los ojos pasan a blanco incandescente |
| **Capa** | Las imágenes muestran piezas azul oscuro/claro tipo alas o capa; **su forma exacta no está definida con claridad** | La forma final la decide quien produce el arte, fiel a las imágenes. Debe ser una pieza separable del cuerpo |
| Separación entre cuello, cuerpo, brazos y manos | En el retrato cabeza, cuello y torso se funden en negro; en la hoja hay poses con piezas pegadas | **Requisito de producción**: capas o zonas separables por pose |
| **Espada pequeña en la mano derecha** | El retrato **no lleva espada**; en la hoja aparece una hoja larga en las poses de ataque con un agarre poco claro | **Requisito de producción**: espada pequeña, físicamente sujeta por la mano derecha **en todos los fotogramas donde aparezca**; nunca flotando dentro de la capa. Se valida por anclas (§2.6) |
| Silueta oscura pero legible | Hero casi negro (luminancia relativa 0.006) | Riesgo conocido R14: ver §3.3 |

### 2.4 Sobre Beru

Beru es una **referencia de inspiración** para entender la dirección general. El juego usa **el diseño que tú entregaste**, como personaje propio. No se reproducen su diseño exacto, rostro, proporciones exactas, armadura, animaciones, poses ni efectos distintivos.
El riesgo de propiedad intelectual de «parecerse a un personaje existente» queda registrado (R10) y es una decisión de quien posee el diseño, no técnica.

### 2.5 Qué se necesita para producción (lista de animaciones)

Derivadas del diseño existente. Cantidades **orientativas** (≈ 95–110 fotogramas en total):

| Animación | Fotogramas | Se enlaza con (sim) | Notas |
|---|---:|---|---|
| idle | 6–8 | `idle` | bucle |
| caminar / correr | 8 + 8 | `walk` / `run` | velocidad de reproducción ligada a la velocidad real |
| salto (subida) · apex · caída | 3 · 1–2 · 3 | `jump` / `fall` | |
| aterrizaje / recuperación | 3 | `land` | |
| agacharse (entrada + bucle) · caminar agachado | 2 + 2 · 6 | `crouch` / `crouchWalk` | |
| ataque 1 · ataque 2 | 6–8 c/u | `attack1` / `attack2` | rangos *startup / active / recovery* declarados en el manifiesto |
| ataque aéreo · ataque agachado | 6–8 · 5–6 | `attackAir` / `attackCrouch` | |
| dash (deslizamiento) | 4–5 | `dash` | la estela es VFX aparte |
| daño | 3 | `hurt` | |
| muerte | 8–10 | `death` | |
| magia (lanzar) | 6 | `cast` | |
| botella (beber) | 6 | `drink` | |
| interacción | 4 | `interact` | |

Requisitos técnicos de cada pieza (ARCHITECTURE-2D §7.5–7.6): PNG con alfa real; **misma escala y pivote en los pies** en todos los fotogramas; sin sombras horneadas; **VFX en capas aparte**; ojos y cuerpo separables (para el brillo); anclas por fotograma: `hand_r`, `weapon_grip`, `weapon_tip`, `head`, `feet`, `vfx_origin`.

### 2.6 Contrato de la espada (DC-14)

La espada pequeña está en la mano derecha, siempre. Como el arte es ráster y la simulación no «ve» la espada, el contrato se verifica con **anclas por fotograma**:
si un fotograma declara `weapon_grip`, entonces la distancia a `hand_r` debe ser ≤ 6 px de arte (≈ 0.04 m) y debe existir `weapon_tip`. El validador de *sprite sets* falla si no se cumple. El hitbox del ataque **no** depende del sprite: vive en `AttackDefinition`.

### 2.7 Mientras no haya sprites de producción (DC-13, ⚠️ DP-1)

El desarrollo del Prompt 4 usa una **piel provisional que no es el personaje**: una silueta abstracta del tamaño del cuerpo (rectángulo redondeado neutro), una muesca que indica hacia dónde mira, un marcador en `hand_r` y una línea corta anclada a ese marcador como «espada». Va marcada `PLACEHOLDER` en el overlay de depuración.
**No se redibuja al protagonista ni se imita su diseño.** Cambiar el proxy por los sprites reales es cambiar un manifiesto, sin tocar gameplay. Si quieres ver tu personaje real durante el desarrollo, la alternativa es autorizar recortes **verificados pieza a pieza** de tu hoja como piel provisional de uso interno (DP-1; por defecto: no).

---

## 3. Dirección visual

### 3.1 Identidad

Oscuro, misterioso, elegante, poderoso, sobrenatural y moderno; pero **legible**, con color donde corresponda, atractivo en pantalla de móvil y reconocible como propio.
Prioridad visual (en este orden): **1 silueta clara · 2 personaje reconocible · 3 contraste · 4 energía visible · 5 VFX potentes · 6 pantalla limpia.**

### 3.2 Paleta cerrada (DC-12)

**El protagonista conserva:** negro como base · blanco para luz y lectura · **cian/azul como color principal de energía y de detalles.** Queda descartada la opción «todo rojo» (y también la variante B de la auditoría): el protagonista **no se recolorea**.
Los ataques y VFX pueden introducir otros tonos **solo cuando haga falta diferenciarlos** (§3.5). Los valores salen de **muestreo real** de tus imágenes (✅) salvo donde se indica «propuesto».

| Token | Hex | Procedencia | Uso |
|---|---|---|---|
| `hero.ink` | `#101316` | muestreo del retrato (42 % de los píxeles) | cuerpo y armadura |
| `hero.armor` | `#121d27` | muestreo | planos de armadura |
| `hero.armorLit` | `#172734` | muestreo | luz sobre la armadura |
| `energy.core` | `#7fdaf2` | muestreo (ojos y líneas) | **energía del protagonista**, UI de energía |
| `energy.mid` | `#82bcd8` | muestreo (piezas azul medio) | líneas y piezas secundarias |
| `energy.glow` | `#c1f0fc` | muestreo (decil más brillante del cian) | núcleos, brillos |
| `white.hot` | `#f7faff` | muestreo (blanco de los enemigos) | reflejos, impacto, estado «cargado» |
| `enemy.ink` | `#05060a` | propuesto (el muestreo da negro puro) | cuerpo de los enemigos |
| `enemy.eye` | `#f7faff` | muestreo | ojos de enemigos |
| `violet.core` | `#9a6bff` | **propuesto** (no hay violeta en tus imágenes) | energía de enemigos al cargar/atacar |
| `violet.glow` | `#d3c2ff` | propuesto | núcleos de la energía violeta |
| `violet.deep` | `#3a1f7a` | propuesto | sombra de la energía violeta |
| `accent.warm` | `#f4343d` | muestreo de los VFX rojos de tu hoja | **acento permitido** (§3.5); apagado por defecto |
| `world.void` | `#050409` | muestreo de **tu paleta de referencia** | negros del mundo |
| `world.night` | `#0c1019` | idem | |
| `world.deep` | `#212548` | idem | azul profundo |
| `world.dusk` | `#212c4a` | idem | |
| `world.slate` | `#4f5d8c` | idem | azul pizarra (fondo del plano de juego) |
| `world.mist` | `#686580` | idem | niebla malva |
| `world.haze` | `#859cbb` | idem | bruma |
| `world.glow` | `#acccd9` | idem | luz de fondo |
| `ui.panel` | `#0b1220` | propuesto | paneles del HUD (78 % de opacidad) |
| `ui.life` | `#e6f1f5` | propuesto | segmentos de vida |

Los tokens `propuesto` los puede cambiar el artista sin consecuencias técnicas (son datos: `presentation/palette.ts`).

### 3.3 Legibilidad de un protagonista negro (DC-15, ⚠️ R14)

Medido ✅: el contraste del negro del héroe (`#101316`) con tu paleta de escenarios es **1.0–1.4 : 1** contra los negros y azules profundos, **2.9 : 1** contra `world.slate`, **6.6 : 1** contra `world.haze` y **11.7 : 1** contra su propio cian. Un fondo oscuro detrás del héroe lo hace desaparecer; en Hollow Knight esto se resuelve con un protagonista blanco, aquí hace falta otra estrategia. Reglas:

1. **Luz detrás, oscuridad delante.** En la franja de ±1.5 m alrededor del plano de juego el fondo inmediato debe tener luminancia ≥ `world.slate` (relación ≥ 2.9 : 1 con `hero.ink`): bruma luminosa, haces de luz, niebla. El primer plano sí puede ser casi negro (siluetas de vegetación, viñeta).
2. **Los ojos son el ancla.** El cian incandescente de los ojos (`energy.core` → `white.hot` al cargar) es siempre visible: relación 11.7 : 1.
3. **Rim light cian sutil** en el borde del personaje y de los enemigos (borde luminoso de 1–2 px), horneado en el arte o por *shader* barato, a decidir en el spike con medición en móvil.
4. **Charco de luz** bajo el protagonista (sprite aditivo suave) que además da suelo.
5. **Verificación (P7):** captura por sala y métrica de contraste en un anillo de 1 m alrededor de la silueta; el umbral de aviso es 2.5 : 1.

### 3.4 Enemigos

Estilo: **babas de tinta negra** con ojos blancos ovalados, superficies lisas y curvas, silueta muy variada (alto/delgado, redondo/grande, rastrero). Se deslizan.
Cuando atacan o cargan un ataque fuerte llevan **«algo significativo»**: el equivalente violeta del estado cargado del protagonista, es decir **aura violeta + ojos blancos incandescentes + deformación de anticipación** (se aplasta/estira antes de atacar). Es el *telegraph*: legible a escala de teléfono y independiente del clip concreto.
El primer enemigo es **procedural** (formas y deformación, sin frames dibujados): coste de arte bajo y calidad final posible.

### 3.5 Lenguaje de energía y VFX

| Aspecto | Regla |
|---|---|
| Energía del héroe | **Cian/azul + núcleo blanco.** Magia, barra de magia, botellas, brillo de ojos, interfaz de energía |
| Energía enemiga | **Violeta** (`violet.*`), siempre con ojos blancos incandescentes en el estado cargado |
| Acento permitido | `accent.warm` (el carmesí de los arcos y estelas de tu hoja) **solo** para diferenciar: ataque pesado/final de cadena y golpe crítico. **Apagado por defecto**; se prueba en pantalla en P7 antes de adoptarlo. Nunca en el cuerpo del protagonista |
| Formas de referencia (de tu hoja) | arco creciente de espada · estela larga con fragmentos para el dash · aura en ráfaga con esquirlas para la carga |
| Daño recibido | destello blanco del sprite + esquirlas cian-blancas + sacudida; **no** depende del rojo |
| Color por dato | Los VFX piden *ranuras* de paleta (`energy.core`, `enemy.core`…) y no colores: la misma definición sirve para héroe y enemigos |
| Presupuesto | ≤ 400 partículas vivas en gama alta, 150 en baja; mezcla aditiva; todo con pooling |

### 3.6 Escenarios (referencias → adaptación)

Las 12 capturas muestran, entre todas: cuevas y ruinas con **3–5 planos** (fondo lejano desenfocado, arquitectura media, plano de juego, props, primer plano oscuro de siluetas), **niebla luminosa y haces de luz** detrás del plano de juego, **partículas ambientales** (luciérnagas, esporas, brasas), **iluminación localizada** (farolas, antorchas con halo), suelos de piedra con borde claro, y zonas de color propio (azul-teal, verde musgo, ámbar, lava). Una de ellas incluye una **tira de 12 colores** (azules-negros → azul pizarra → malva → cian pálido) que se adopta como paleta de mundo (`world.*`).

| Se toma | Se adapta |
|---|---|
| Capas y profundidad; valores (luz detrás, oscuro delante); densidad de detalle; partículas ambientales | Paleta hacia **azul/cian/teal** coherente con el héroe; el verde amarillo se enfría a verde-azulado; el ámbar queda como luz puntual opcional |
| Suelo de piedra con borde claro, plataformas fáciles de leer | Formas propias: ruinas de bosque antiguo con raíces y piedra, no copiar arquitectura |
| Zonas con identidad cromática | Cada zona es un `ZonePalette` en datos (primera región: teal/azul noche con haces cian) |

Para los puntos de guardado **no se usan bancos** (firma de Hollow Knight): serán **nodos de energía** (cristal o linterna cian), nombre de trabajo.
La interfaz de una de las capturas (carta + barras + botellas arriba a la izquierda) es el origen de **la disposición** que pediste; el diseño gráfico final es propio (§17).

### 3.7 Región inicial (nombre de trabajo)

**«Ancient Forest Ruins»** (es: «Ruinas del Bosque Antiguo»). Es nombre de trabajo; cambiarlo es una clave de localización.

---

## 4. Controles

### 4.1 Acciones lógicas

El gameplay solo conoce `InputFrame`; nunca teclas, botones ni elementos de UI. Acciones iniciales (DC-27):

`left · right · up · down · jump · attack · dash · ability (magia) · bottle (botella/consumible) · interact · drop · pause`

`InputFrame` (ver ARCHITECTURE-2D §6) añade a lo existente: `bottlePressed` + `bottleSlot` (−1 = «la siguiente lista»), `interactPressed`, `dropPressed`.

### 4.2 Mapeo inicial — PC y gamepad (cambiable: es dato)

| Acción | Teclado | Ratón | Gamepad (mapeo estándar) |
|---|---|---|---|
| Izquierda / derecha | A·D / ←→ | | stick izq. · cruceta |
| Arriba / abajo (agacharse) | W·S / ↑↓ | | stick izq. · cruceta |
| Salto | Espacio | | A (0) |
| Ataque | J | clic izq. | X (2) |
| Dash | Shift | | B (1) · RB (5) |
| Magia / habilidad | K | clic der. | Y (3) |
| Botella | L · Q | | LB (4) |
| Interacción | E | | LT (6) |
| Atravesar plataforma | S + Espacio | | ↓ + A |
| Caminar (mitad de velocidad) | Ctrl | | inclinar el stick |
| Pausa | Esc · P | | Start (9) |

> **Implementado en el Prompt 5** (S13, [PROMPT5-LOG](PROMPT5-LOG.md)): **todas** las filas existen ✅ como datos (`input/bindings.ts`) y las prueba un E2E por dispositivo (teclado, ratón, gamepad abstracto `VirtualPad`, táctil con dedos CDP). El gamepad (`GamepadSource`) lee el stick con **zona muerta radial 0.22** (dentro lee 0; fuera, el resto se reescala para que una inclinación leve camine y una firme corra), mapea cada botón por datos, hace *polling* una vez por *tick* y suelta todo al desenchufarse. *Atravesar plataforma* es `abajo + salto` (teclado y gamepad) o un *flick* (táctil). **Contrato de ejes** (decisión de S13, no estaba en el spec): `move.x` es la velocidad y `move.y < −0.6` agacharse, **independientes**: las fuentes digitales dan exactamente −1/0/1 por eje (dos teclas dan (±1, ±1), sin normalizar), el stick se recorta al disco unidad y el arrastre táctil recorta cada eje por separado; con varias fuentes cada eje toma el de mayor magnitud. Una acción con **varias teclas** (A y ←, las dos Shift, L y Q, Esc y P) se mantiene mientras **cualquiera** siga abajo (corregido en S20: soltar una soltaba la acción aunque la otra siguiera pulsada).

### 4.3 Táctil — diseño (DC-26)

El móvil es plataforma prioritaria. **No hay joystick visible.** Se reparte así (apaisado; las medidas de abajo en dp, escaladas con `uiScale`, ver §4.3.7):

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ [carta] ▮▮▮▮▮ vida                                                            │
│         ▬▬▬▬▬▬▬ magia                          (HUD, pointer-events: none)     │
│         ⬡ ⬡ ⬡ botellas (tocables)                                  ◌ botella  │
│                                                              (chip contextual) │
│   ZONA DE MOVIMIENTO                              ┌────────┐                   │
│   (izquierda, ~46 % del ancho,                    │ Habil. │      ┌──────┐     │
│    INVISIBLE; todo el alto)                       └────────┘      │Ataque│     │
│                                              ┌──────┐             └──────┘     │
│                                              │ Dash │                          │
│                                              └──────┘                          │
└───────────────────────────────────────────────────────────────────────────────┘
```

#### 4.3.1 Zona de movimiento (izquierda, invisible)

El **puntero de movimiento** es el primer dedo que baja dentro de la zona (y no sobre un elemento interactivo superpuesto). Su punto de contacto es el **origen** `O`. Desplazamiento `d = (x − Ox, y − Oy)`; ejes normalizados:

```
ax = clamp(  dx / Rx , −1, 1)        ay = clamp( −dy / Ry , −1, 1)        (+y = arriba)
```

| Parámetro (`TouchConfig`) 📐 | Valor | Significado |
|---|---|---|
| `Rx` · `Ry` | 56 · 44 dp | radio útil horizontal / vertical |
| `deadZoneX` | 0.12 | por debajo, `move.x = 0` (el resto se reescala a 0..1) |
| `followOrigin` | sí | si `abs(dx) > Rx`, el origen sigue al dedo (`Ox += dx − sign(dx)·Rx`); igual en Y con `Ry`. Invertir la dirección solo exige un recorrido corto |
| `jumpEnter` · `jumpRearm` · `jumpHold` | 0.55 · 0.25 · 0.30 | histéresis del salto (§4.3.2) |
| `leftZoneWidth` | 0.46 del ancho útil | |
| `edgeMargin` | 28 dp | los controles no se colocan a menos de esto de los bordes laterales (gestos del sistema) |

Salida a `InputFrame` en cada tick:

- `move.x = sign(ax)·(|ax| − deadZoneX)/(1 − deadZoneX)` si `|ax| > deadZoneX`, si no `0`. La velocidad resultante es la del sistema existente ✅: inclinación leve = caminar, firme = correr (`runThreshold` 0.62).
- `move.y = ay` (negativo = agacharse, §6). El valor positivo lo ignora la simulación: el salto no se lee de `move.y`.
- Un **segundo dedo** dentro de la zona **se ignora** mientras el puntero de movimiento siga activo; si este se levanta, la zona queda libre para el siguiente `pointerdown`.
- Un toque corto sin desplazamiento no hace nada.

#### 4.3.2 Salto — especificación exacta

> **Arrastrar o hacer un *flick* hacia arriba con el mismo dedo del movimiento.**

| Evento | Condición | Efecto en `InputFrame` |
|---|---|---|
| **Pulsar** | `ay` cruza **hacia arriba** el umbral `jumpEnter` (0.55 ≈ 24 dp) **y** el gesto está *armado* | `jumpPressed = true` durante ese tick (con latch: no se pierde entre ticks) |
| **Mantener** | desde el cruce y mientras `ay ≥ jumpHold` (0.30 ≈ 13 dp) y el dedo siga apoyado | `jumpHeld = true` |
| **Soltar** | `ay` baja de `jumpHold`, o el dedo se levanta, o el puntero se cancela | `jumpReleased = true`, `jumpHeld = false` |
| **Armado** | el gesto está armado al empezar y se **desarma** al saltar; se **rearma** cuando `ay` vuelve a ≤ `jumpRearm` (0.25) | evita saltos repetidos mientras se mantiene el dedo arriba |

Consecuencias, todas ya soportadas por la simulación ✅ (no hay lógica de salto táctil dentro del jugador):

- **Altura variable:** soltar pronto recorta el salto (mínimo de 0.07 s y multiplicador 0.42, ya medidos); mantener da el salto completo (3.1 m). Un *flick* rápido y soltar da un salto corto pero válido.
- **Buffer y coyote:** un gesto un poco antes de aterrizar o justo después de dejar el borde (0.12 s / 0.1 s) funciona igual que en teclado.
- **Correr y saltar a la vez:** los ejes X e Y son independientes: arrastrar en diagonal arriba-derecha corre y salta.
- **Desde agachado:** pasar el dedo de abajo a arriba cruza `jumpEnter` (recorrido ≈ 1.15·`Ry`).

Ejemplo (844×390, 1 dp = 1 px): toca en (120, 300) · arrastra a (176, 300) → `ax = 1`, corre a la derecha · sube el dedo a (176, 270) → `ay = 0.68 ≥ 0.55` → `jumpPressed` · mantiene 250 ms → `jumpHeld` · baja el dedo a (176, 300) → `ay = 0 < 0.30` → `jumpReleased`.

**Alternativas descartadas:** toque simple en la zona izquierda (choca con «apoyar el pulgar»); zona invisible de salto a la derecha (invade los tres botones y produce errores de toque); doble toque (latencia ≥ 150 ms); botón fijo (prohibido). El riesgo conocido es el **salto accidental por deriva del pulgar** al correr (R18): los umbrales son datos y se calibran en dispositivo; la mitigación prevista es una relajación lenta del origen vertical (`driftRelax`, apagada por defecto) y subir `jumpEnter`.

#### 4.3.3 Agacharse y atravesar plataformas

- **Agacharse:** arrastrar el dedo **hacia abajo**. `move.y = ay` negativo; la simulación entra en agachado con `move.y ≤ −0.6` (≈ 26 dp) y sale con `≥ −0.4` (§6).
- **Atravesar plataforma de un solo sentido:** un *flick* hacia abajo (≥ 28 dp en ≤ 100 ms) emite `dropPressed`. Solo tiene efecto sobre una plataforma *one-way*; en cualquier otro caso se ignora.

#### 4.3.4 Botones de la derecha (los únicos fijos)

Solo **Ataque**, **Dash** y **Habilidad**. Sin botón de salto ni de interacción ni de botella. Cada botón captura **su propio puntero** (`pointerdown` activa en el acto; arrastrar fuera no cancela hasta soltar).

| Control | Centro desde la esquina inferior derecha segura (dx, dy) | Diámetro visible | Zona táctil |
|---|---|---|---|
| Ataque | (−96, −96) | 88 | 104 |
| Dash | (−196, −60) | 68 | 84 |
| Habilidad | (−184, −164) | 68 | 84 |
| Chip de botella (contextual) | (−64, −196) | 52 | 64 |

Comprobado por cálculo ✅: no hay solapes entre zonas táctiles (hueco mínimo 12 dp, entre Ataque y Dash) y los huecos visibles son ≥ 28 dp. Disposición **provisional**: se valida en dispositivo.
> **Implementado en el Prompt 5** (S18) y **ampliado en el Prompt 6** (S30, S31): el tamaño (**80–140 %**), la opacidad (**30–100 %**), el **lado** (derecha / izquierda: el bloque se espeja y la zona de movimiento pasa al otro lado) y la **posición** (hacia dentro hasta 120 dp y hacia arriba hasta 90 dp, solo hasta donde la ventana lo permite) son ajustables en el menú de pausa, se aplican al instante y se guardan (ajustes versión 2). **Qué cede ante qué (S31):** la posición y el tamaño son una **preferencia**; la ventana decide lo que cabe: los botones nunca salen del área segura, nunca se pisan, nunca llegan al HUD (si lo pedido no cabe, el tamaño baja a lo mayor que sí cabe, con un suelo de escala 0.72 en el que cada zona táctil sigue midiendo ≥ 44 px) y la zona de movimiento conserva ≥ 25 % del ancho útil. A la derecha (el diseño) el tamaño pedido se respeta en todo móvil y tableta; a la izquierda puede ceder (el botón de botella, arriba del bloque, queda bajo el HUD al espejarse). Todo esto está **verificado por geometría y con Chromium, no en un dispositivo**: ver [MOBILE-CALIBRATION](MOBILE-CALIBRATION.md).
**Habilidad** ejecuta la carta equipada (§10); si todavía no hay carta, el botón **no se dibuja** (no hay controles sobrantes).

#### 4.3.5 Botellas — solución táctil (DC-26)

Ni botón permanente ni sobrecarga del HUD. Dos accesos, mismo efecto:

1. **Chip contextual de botella (acceso primario, en combate).** Aparece cerca del pulgar derecho **solo** cuando hay una botella lista **y** su efecto sirve ahora (curación: vida < máxima). Un toque usa la siguiente botella lista. No desplaza ningún otro botón (posición fija, aparece con 120 ms de fundido).
2. **Tocar el icono de una botella en el HUD (acceso explícito).** Usa **esa** botella. Útil si las botellas tienen efectos distintos y como alternativa accesible. Los iconos tienen zona táctil de 36 dp de ancho (su paso) × **49 dp de alto** —44 px CSS a la escala mínima de la interfaz, 0.9; S31 lo subió de 44 dp tras medir 39.6 px— y quedan **por encima** de la zona de movimiento.

Descartadas: gesto sobre el botón de Habilidad (latencia y ambigüedad con el lanzamiento); mantener el pulgar quieto en la zona izquierda (apoyar el pulgar es normal); botón fijo (prohibido).

#### 4.3.6 Interacción contextual

No hay botón. Cuando existe una interacción válida aparece un **icono anclado al objeto** (círculo de 56 dp, zona táctil 64 dp) con el verbo (abrir, hablar, recoger, activar, entrar, usar). **Tocar el icono** ejecuta la interacción. En PC/gamepad el mismo icono muestra la tecla/botón y se ejecuta con `interact`. Solo existe mientras la interacción es válida (§12).

#### 4.3.7 Multitouch y robustez

- Cada dedo es un `pointerId` con **dueño único** (zona, botón, chip o icono). Un dedo no puede cambiar de dueño; un gesto de movimiento **nunca** cancela un ataque o un dash, ni al revés. `pointercancel`, pérdida de captura, `blur`, ocultar la app, cambio de orientación y pausa liberan **todo** lo que ese puntero sostenía.
- Combinaciones que deben funcionar y se prueban (E2E con toques CDP simulados ✅ posible; dispositivo real ⚠️): movimiento + ataque · movimiento + dash · movimiento + magia · ataque + dash · ataque + movimiento · dash + magia · movimiento + salto + ataque.
- `touch-action: none`, sin selección ni menú contextual, sin *zoom* (ya configurado ✅). Márgenes seguros (`env(safe-area-inset-*)`) más `edgeMargin`. Android 10+ captura gestos desde los bordes laterales: se recomienda excluir las zonas de control (R3, nativo, Prompt 7).
- `uiScale = clamp(min(ancho, alto × 2.1) / 844, 0.9, 1.6)` escala radios, botones y umbrales: iPad y móvil comparten diseño.
- El **reconocedor de gestos es TypeScript puro** (sin DOM): se prueba con secuencias de punteros sintéticas (correr, saltar, *flick*, deriva, inversión, segundo dedo, cancelación, blur).

> **Implementado en el Prompt 5** (S13, S19, S20): `input/gestures/TouchGestureRecognizer` (puro) + `input/sources/TouchSource` (un dueño por `pointerId`; objetivos `zone · attack · dash · ability · interact · bottle · bottle:n`) + `ui/touch/TouchControls` (DOM, `z-index` 20, `pointer-events:none` salvo sus hijos) con los números de arriba **sin cambios** (`TouchConfig`, `layout.ts`). Un dedo que baja no cambia de dueño; un segundo dedo en un botón o en la zona ocupados se ignora; `pointercancel`, pérdida de captura, `blur`, ocultar la app, rotar y **redimensionar** liberan todo (⚠ en un navegador móvil con barra de direcciones que se esconde, un `resize` a mitad de partida suelta los dedos: no ocurre en pantalla completa / Capacitor; a vigilar en dispositivo). El botón **Habilidad** y el **chip de botella** viven ocultos hasta que tienen sentido, y si **desaparecen bajo un dedo** lo sueltan. Probado: unitario (reconocedor, fuente, DOM), integración (gestos → `InputFrame` → `GameSession`), **E2E con dedos CDP** (movimiento + ataque, movimiento + dash…, R1 completa en `vertical`) y **sondeos aleatorios** (cinco dedos a la vez contra un modelo ingenuo; capa DOM con botones que aparecen y desaparecen). ⚠ **Nada de esto se ha verificado en un iPhone ni en un Android reales**: la ergonomía, la deriva del pulgar (R18) y el rendimiento táctil siguen pendientes de dispositivo.

---

## 5. Movimiento (conservado)

El sistema de la fase 5 **se conserva** (DC-19). Los números actuales ✅ (todos en `MovementTuning`, editables en vivo):

| Parámetro | Valor | Parámetro | Valor |
|---|---|---|---|
| Velocidad de caminar / correr | 4.2 / 8.5 m/s | Salto completo | 3.1 m |
| Aceleración / frenada en suelo | 75 / 95 m/s² | Recorte al soltar / retención mínima | ×0.42 / 0.07 s |
| Giro (turn boost) | ×1.7 | Coyote / buffer de salto | 0.10 s / 0.12 s |
| Aire: aceleración / frenada | 48 / 22 | Gravedad (caída ×1.4, apex ×0.62) | 52 m/s² |
| Dash: velocidad · duración · enfriamiento | 21 m/s · 0.17 s · 0.42 s | Dash: i-frames · dash aéreo por salto | 0.13 s · 1 |
| Retención de ascenso del dash | 0.8 | Alcance medido sin dash / con dash | ≤ 6.75 m / ≈ 11 m |

**Escala en pantalla:** la simulación no cambia (1 unidad = 1 m). El zoom lo decide la cámara (§16): con `viewHeight = 13.5 m` el cuerpo de 1.7 m ocupa ≈ 12.6 % de la altura (≈ 136 px a 1080p). El cuerpo físico se ajustará a la silueta chibi **con pruebas** (se vuelve a medir el alcance y se corren los 40 tests de movimiento sin modificarlos).

### 5.1 Estados del jugador

Máquina de estados (`StateMachine` existente). Se **añaden** estados; `free` y `dash` no cambian de comportamiento.

| Estado | Entra por | Sale por | Notas |
|---|---|---|---|
| `free` | por defecto | cualquiera de abajo | suelo y aire (idle, caminar, correr, salto, caída) |
| `crouch` | `move.y ≤ −0.6` en suelo | `move.y ≥ −0.4` **y** hay espacio para levantarse | §6 |
| `dash` | `dashPressed` (con buffer) y habilidad `dash` | fin, pared, salto desde suelo | existente ✅; admite el dash desde agachado (§6) |
| `attack` | `attackPressed` (con buffer 0.12 s) | fin de recuperación; encadena en la ventana; `dash` en recuperación | variantes suelo/aire/agachado (§7) |
| `cast` | `abilityPressed` con carta, magia suficiente y sin enfriamiento | fin de recuperación | §10 |
| `drink` | petición de botella con efecto útil, en suelo | efecto aplicado; **interrumpido** por daño | §11 |
| `hurt` | golpe recibido sin i-frames | fin del aturdimiento | §9 |
| `dead` | vida ≤ 0 | reinicio | §9 |
| `locked` | transición de sala / cinemática | fin | ignora el `InputFrame` (el reconocedor táctil sigue vivo) |

Prioridad de cancelación: `dead` > `hurt` > `locked` > `dash` (puede cancelar la **recuperación** de ataque, magia y botella, no el *startup* ni el *active*) > `cast`/`drink`/`attack` > `crouch` > `free`.
**Puerta de regresión:** los 40 tests de `tests/integration/movement.test.ts` no se modifican y deben pasar tras cada paso del Prompt 4.

---

## 6. Agacharse (DC-20)

No es una animación: **es un estado con consecuencias de colisión.**

| Aspecto | Regla 📐 |
|---|---|
| Altura del cuerpo | de pie 1.7 m → agachado **1.0 m** (mitad de ancho sin cambio) |
| Hurtbox | de pie 1.55 m → agachado **0.9 m**: los golpes a la altura de la cabeza **fallan** |
| Velocidad agachado | 3.0 m/s (aceleraciones del suelo) |
| Entrada / salida | `move.y ≤ −0.6` / `≥ −0.4` (histéresis) |
| Espacio para levantarse | se comprueba con `CollisionWorld.overlapsSolid` sobre el rectángulo de pie: si hay techo, **sigue agachado** aunque el jugador suelte (agachado forzado) |
| Pasajes | los pasajes «solo agachado» tienen altura libre de **1.0–1.4 m**; la sala de pruebas actual (2.1 m) no los exige |
| Dash agachado | permitido: el cuerpo mantiene la altura agachada durante todo el dash y, si no hay espacio al terminar, sigue agachado (**deslizamiento** bajo pasajes) |
| Salto | desde agachado solo si hay espacio; sobre *one-way*, `agachado + salto` (PC) o *flick* abajo (táctil) = atravesar |
| Ataque | ataque agachado con hitbox bajo (§7) |
| Cámara | no se mueve por agacharse |

Tests: entrar/salir con histéresis · techo bajo impide levantarse · dash bajo techo bajo · hurtbox pierde la cabeza · atravesar *one-way* · determinismo · los 40 de movimiento intactos.

---

## 7. Combate (DC-21)

Rápido, preciso, legible y satisfactorio. La primera versión **no** necesita combos enormes: **ataque → impacto → daño → knockback → recuperación.**

### 7.1 Modelo (rescata el trabajo de la rama `wip/f6-combat-core`; ver MIGRATION-2D §5)

- Un ataque es un `AttackDefinition` en **ticks**: `startup` (inofensivo, comprometido; es lo que el defensor lee) · `active` (existe el hitbox) · `recovery` (inofensivo y vulnerable).
- **Hit-once:** un ataque golpea a cada objetivo **una sola vez** por instancia.
- **Hitbox y hurtbox son datos**, en metros desde el centro del cuerpo mirando a la derecha; se reflejan al mirar a la izquierda. Nada depende del sprite.
- Multiplicador por hurtbox (puntos débiles y blindajes), `knockback`, `stun`, `hitStop`, `shake`, `lunge`, `moveControl`, `airGravityScale`, ventana de cancelación y `next` para encadenar.
- **Hit-stop:** el golpe congela la simulación unos ticks (la sensación de peso). Los pulsos de entrada se almacenan durante el congelamiento. Cámara, partículas y *shake* usan tiempo real.
- Todo es **evento** (`combat:hit`, `health:changed`, `actor:died`, `player:attacked`…): VFX, audio y HUD escuchan.

### 7.2 Ataques iniciales 📐 (se retocan jugando)

| Ataque | Fases (startup/active/recovery) | Daño | Hitbox (x, y, w, h) m | Knockback (x, y) | Aturdimiento | Hit-stop | Notas |
|---|---|---:|---|---|---:|---:|---|
| `slash_1` (suelo) | 4 / 3 / 8 | 1 | 0.2, 0.3, 1.4, 1.1 | 5, 2 | 12 | 4 | avance 3 m/s · 4 ticks; ventana de cadena ticks 8–15 |
| `slash_2` (cierre) | 3 / 3 / 11 | 1 | 0.2, 0.25, 1.6, 1.25 | 9, 3.5 | 16 | 6 | final de la cadena: más recuperación |
| `air_slash` | 3 / 4 / 9 | 1 | 0.15, 0.3, 1.4, 1.2 | 5, 2 | 12 | 4 | gravedad ×0.6 mientras ataca; aterrizar acorta la recuperación |
| `crouch_slash` | 4 / 3 / 9 | 1 | 0.2, 0.0, 1.4, 0.65 | 4, 1 | 10 | 4 | se mantiene agachado |

Cadena de **dos golpes** (no más en la primera versión). El `AttackDefinition` admite `next`, por lo que una cadena mayor es un cambio de datos.

### 7.3 Reglas de contacto

- Los ataques del jugador también golpean objetivos **neutrales** (muros rompibles, interruptores); los del enemigo, nunca.
- El enemigo daña con **hitbox de ataque** (no hay daño por simple contacto con su cuerpo, para que todo daño sea legible y tenga telegraph).
- Todo cuerpo con vida es un `Combatant`: `health`, `invulnerable`, `collectHurtboxes`, `receiveHit`.

---

## 8. Dash

El dash existente se conserva ✅ (§5): desplazamiento rápido plano, i-frames de 0.13 s, enfriamiento de 0.42 s, buffer de 0.1 s, un dash aéreo por salto, cancelable en salto desde suelo, no atraviesa paredes (ni siquiera de 0.5 m).

Se añaden **animación, feedback visual y VFX** (§3.5): estela larga con fragmentos de energía cian, destello de salida y nube de polvo en suelo; todo por eventos (`player:dashed`, `player:dashEnded`).
**Preparado para mejoras** (`ModifierStack`, §10.3): `airDashes`, distancia, enfriamiento e i-frames son datos y admiten modificadores con origen. La mejora «Air Dash» ya está declarada en `ABILITIES` (`air_dash`).

---

## 9. Vida, daño y muerte

### 9.1 Vida y daño (DC-30)

- Vida configurable; por defecto **5 puntos** (segmentos en el HUD). Daño enemigo estándar: 1.
- Al recibir daño: pierde vida · **knockback** (5.5 m/s alejándose, 4 m/s hacia arriba) · estado `hurt` (aturdimiento 14 ticks) · **i-frames de 60 ticks (1.0 s)** con parpadeo · hit-stop de 6 ticks · sacudida de cámara · destello blanco · esquirlas.
- Feedback completo por evento: animación `hurt`, VFX, y audio cuando exista (§19).
- `godMode` de depuración existente ✅.

### 9.2 Muerte (DC-29)

Cuando la vida llega a cero:

1. **Estado de muerte:** `player:died`; hit-stop de 8 ticks; animación `death` y dispersión de energía (≈ 72 ticks).
2. **Se desactiva el control normal:** el estado `dead` ignora el `InputFrame`; los enemigos dejan de atacar.
3. **Transición de derrota:** fundido a negro de 30 ticks y título localizado («Has caído» / «You fell»; clave `death.title`).
4. **Reinicio desde un punto válido:** tras 60 ticks de pausa y un fundido de entrada de 30, el jugador reaparece en la **entrada de la sala** (Prompt 4) o en el **último punto de guardado** (Prompt 6) con la **vida y la magia llenas**. Cualquier pulsación tras 30 ticks permite saltar la espera.
5. **Sin pérdidas** en la primera versión (no hay moneda): las habilidades y objetos obtenidos se conservan; los enemigos de la sala reaparecen; los jefes se reinician; **las botellas no se rellenan** (su recarga es lenta a propósito).

Todo el flujo corre por `Scheduler` con dueño y es determinista. Los puntos de guardado son santuarios sencillos, no un sistema complejo (`RespawnPoint`: ARCHITECTURE-2D §5.8).

> **Implementado en el Prompt 6** (S24, S25, S29; [PROMPT6-LOG](PROMPT6-LOG.md)): la reaparición va al **último *checkpoint*** (un santuario donde se descansó) **en cualquier sala** —se cayó en R3, se vuelve a R2: la sala se descarga y se construye la del santuario— y, sin descanso previo, al **inicio del mundo**. Vida y magia llenas; **las botellas no se rellenan** (solo descansar lo hace); banderas, cartas, habilidades y *checkpoint* intactos; los enemigos de la sala reaparecen salvo los guardianes únicos ya vencidos; **el jefe vuelve entero y dormido** con las puertas abiertas; morir durante una transición la cancela; los **pinchos** hieren por el combate de siempre (1 punto, empuje hacia arriba y fuera, *i-frames* de 60 ticks, la repetición tras ellos) y caer fuera del mundo cuesta un punto y devuelve al último suelo seguro. Una reaparición siempre tiene dónde ir: un *checkpoint* que ya no existe cae al lugar donde empezó la sesión.

---

## 10. Magia, habilidad activa y cartas

### 10.1 Magia (DC-23)

| | 📐 |
|---|---|
| Barra | **100** unidades |
| Regeneración | **gradual**: 6 unidades/s, tras **1.0 s** sin gastar; nunca instantánea; no regenera mientras lanza |
| Habilidad inicial | **Spirit Bolt** (nombre de trabajo; id `magic_attack`, ya declarado ✅): proyectil cian |
| Coste · enfriamiento | 30 (tres usos seguidos) · 0.3 s tras el lanzamiento |
| Lanzamiento | 6 ticks de preparación, 8 de recuperación, control de movimiento 0.4; proyectil a 16 m/s, alcance 12 m, daño 2, sin perforar, empuje (6, 2), hit-stop 3 |
| Feedback | arco/estela cian con núcleo blanco; la carta se apaga si falta magia; si se intenta sin magia suficiente: sacudida de la barra + sonido de «denegado» |

La arquitectura admite **muchas habilidades** (`SkillDefinition` con coste, enfriamiento, temporización, *handler* por id); la primera versión tiene **una**.

> **Implementado en el Prompt 5** (S14a, S15; detalle en [PROMPT5-LOG](PROMPT5-LOG.md)) con **todos** los números de la tabla, sin desviación y como datos (`content/resources.ts`, `content/skills.ts`):
> - `Magic` guarda **milésimas de unidad en enteros** (más un acumulador de resto): el gasto de 30 es exactamente 30, la regeneración de 6/s es 6.000 tras 60 ticks, siempre, bit a bit. No regenera **mientras se lanza** y el segundo de espera cuenta desde que **termina** el lanzamiento; una derrota la deja llena.
> - Estado `cast` del jugador: 6 ticks de preparación → **liberación** (aquí se **paga** el coste y nace el proyectil) → 8 de recuperación con 40 % de control = **14 ticks**. Un golpe en la preparación cancela **sin coste ni enfriamiento**; el *dash* cancela la recuperación; se puede lanzar en el aire y agachado.
> - Sin carta equipada, **Ability no es una acción** (ni estado, ni coste, ni rechazo, ni botón). Con carta y magia < 30: `skill:denied` **una vez por pulsación** y sacudida de barra y carta; un enfriamiento no rechaza (la pulsación espera en el *buffer* de 0.12 s).
> - `Projectile` (entidad de simulación): 16 m/s contando **ticks enteros** (45 ticks = 12 m), termina en lo primero que daña (**no perfora**), en una pared (barrido por tick: sin *tunneling*) o al final del alcance; atraviesa plataformas *one-way*; nunca golpea al héroe.
> - Aspecto: cian con núcleo blanco (`ProjectileView` + 6 efectos como datos); sin violeta ni acento cálido. La carta del HUD muestra `ready · noMagic · cooldown`.

### 10.2 Carta o habilidad equipada (DC-24)

La **carta** es la habilidad activa seleccionada y su estado. Se muestra arriba a la izquierda (§17). El botón **Habilidad** ejecuta **siempre la habilidad de la carta equipada**, nunca una fija.

- Primera slice: **una** habilidad equipada (la obtiene el jugador al explorar, §13). Antes de tenerla, el botón y la carta no se muestran.
- Estados de la carta: lista · magia insuficiente (apagada) · en enfriamiento (barrido radial).
- El sistema soporta varias (`CardLoadout`); un selector es posterior. **No hay inventario complejo.**

> **Implementado en el Prompt 5:** una carta equipada o ninguna; **no hay habilidad inicial inventada** (el héroe empieza sin carta: el botón no se dibuja y la carta del HUD muestra su casilla vacía). `CardDefinition.skillId` decide qué ejecuta Habilidad y `grantsAbility` concede `magic_attack` al **adquirir** la carta. `card:changed` anuncia `acquired · equipped · unequipped`. Tras una derrota **la carta sigue equipada** (§9.2 «sin pérdidas»).

### 10.3 Cartas y modificadores

Una `CardDefinition` referencia una habilidad y puede añadir **modificadores** (`ModifierStack`: aditivos/multiplicativos con origen, que se retiran limpiamente). En la primera slice las cartas son 1–2, solo para demostrar que el sistema funciona.

### 10.4 Mejoras

Mejora = cambio de datos con origen: más vida máxima, ranura de botella extra, mejora del dash, nueva carta. Sin árbol de talentos.

---

## 11. Botellas de energía (DC-25)

Cada botella es **una carga** con un efecto potente y una **recuperación lenta**, independiente de la magia. No son equivalentes a la magia ni se pueden «spamear».

| | 📐 |
|---|---|
| Ranuras | **3** al inicio, hasta **4** (la cuarta es una recompensa). Configurable |
| Efecto por ranura (dato) | `heal` / `shield` / `burst` … En la slice: **curación de 2 puntos** (`heal`) en todas |
| Uso | canal de **24 ticks (0.4 s)**, en suelo, sin moverse. El efecto se aplica **al final**; si un golpe interrumpe el canal **no se consume la carga** |
| Condición | solo se puede usar si el efecto sirve (curación con vida completa → «denegado», sin consumir) |
| Recarga | **secuencial**: una botella cada **60 s**, de una en una, empezando por la primera vacía de izquierda a derecha, + **recarga completa en puntos de guardado** (Prompt 6). Duración y condiciones **son dato** (`rules`: `time`, `checkpoint`, y a futuro `hits`/`kills`) |
| Estados en el HUD | **lista · vacía · recargándose** (con progreso) |
| Acceso | PC: `bottle` (usa la siguiente lista) · gamepad: LB · táctil: §4.3.5 |

Tests: recarga secuencial · interrupción sin consumo · uso denegado · efecto aplicado al final del canal · independencia de la magia · determinismo.

> **Implementado en el Prompt 5** (S14a, S16) **sin desviación**: 3 ranuras (máximo 4; la cuarta, `addBottleSlot`, es una recompensa: el Prompt 6 la coloca en R2), +2 de vida, **canal de 24 ticks** (el efecto cae en el último y **solo entonces** se gasta la botella: un golpe, perder el suelo o llenarse la vida a mitad no gastan nada), recarga **secuencial** de 60 s (una `recharging`, las demás `empty` esperando turno) y **una derrota no las rellena**. Estado `drink` del jugador (prioridad `dash > ataque > Habilidad > botella > interactuar > agacharse > libre`; desde `crouch` se puede beber y se vuelve a `crouch`). La tecla y el chip piden «la siguiente lista» (`bottleSlot` −1) y un icono del HUD pide **esa**; una petición que no sirve se **deniega una vez** (`bottle:denied · full | none`) y sacude la fila de viales. El vial que se bebe se vacía durante el canal (`PlayerStatus.drink`); estados visibles `ready · empty · recharging`. El chip táctil aparece solo con vida que curar y una botella lista (`PlayerStatus.bottleUseful`). La recarga por `hits`/`kills` no existe (es dato futuro).

> **Implementado en el Prompt 6** (S24, S27): **descansar en un santuario rellena las botellas** (`refillAll()`: el único sitio donde se salta la recarga lenta) y **la cuarta botella existe**: un *pickup* en la **repisa del camino alto de R2** (opcional —la salida de R2 no la pide—, hay que **elegir** el camino de arriba y subir un escalón más), que añade una ranura (máximo 4), se guarda **junto a su bandera** (`taken:bottle_fourth`: una sola escritura) y **no se puede conseguir dos veces** (ni pulsando cien veces, ni tras una derrota, una transición, recargar la sala o cargar la partida). El frasco nuevo llega brillando en el HUD; una partida que carga con cuatro no lo anuncia.

---

## 12. Interacción (DC-28)

Un `Interactable` define: id, tipo (`open · talk · pickup · activate · enter · use`), clave de verbo localizada, alcance, condición y acción.

- **Selección:** entre los válidos al alcance (1.6 m en horizontal, 1.2 m en vertical) se elige el **más cercano**; empate por prioridad. Histéresis de 0.3 m al salir para que el icono no parpadee.
- **Icono:** aparece solo con interacción válida, anclado al objeto, con fundido de 120 ms. Táctil: **tocar el icono**. PC/gamepad: `interact`, y el icono muestra la tecla/botón del dispositivo en uso.
- Eventos: `interaction:available`, `interaction:lost`, `interaction:performed`.
- Interactuar bloquea el control ≤ 12 ticks (pose `interact`) salvo los diálogos/menús futuros.
- Las **recompensas** (cartas, ranuras, vida) son interactuables de tipo `pickup` que escriben **flags** del mundo (§14.3).

> **Implementado en el Prompt 5** (S17) **con todos los números de arriba**: `interaction/InteractionSystem` (puro; alcance 1.6 × 1.2 m con bordes incluidos, el más cercano, empate por `priority` y luego por orden de sala, histéresis de 0.3 m que **conserva pero nunca concede**), tick 4 de `GameSession.tick`. Estado `interact` (prioridad tras la botella; solo en suelo, **agachado también**; en el aire la pulsación espera al aterrizaje dentro del *buffer* de 0.12 s y sin objeto caduca **sin ningún aviso**) que ejecuta las acciones, mira al objeto y retiene el control **≤ 12 ticks** (`lock`, dato). Las acciones son un conjunto cerrado (`acquireCard · addBottleSlot · setFlag · clearFlag`). El icono (`ui/prompt/InteractionPrompt`, DOM, `z-index` 26) se ancla a la **parte superior del objeto** con 10 px de hueco, se mantiene dentro de la zona segura, lleva el nombre de la tecla/botón derivado de los *bindings* (nada en táctil), tiene el verbo en el idioma del jugador como nombre accesible y es el **botón** en táctil (≥ 44 px); **no hay ningún botón de interacción permanente**. Casos verificables: `interaction_test` (carta · ranura de botella · palanca → puerta · puerta `open`) y la carta de R1.
> ✅ **Desviación resuelta en el Prompt 6 (S28):** durante el Prompt 5 la carta del Spirit Bolt estuvo **provisionalmente en R1** (final del túnel agachado) para que la primera sala demostrara el bucle completo interactuar → equipar → lanzar. El Prompt 6 la **movió a R3** —la repisa de 4.8 m a la que se sube con dos saltos— como pedía el diseño (§14.4): R1 ya no ofrece ningún interactuable. Las acciones de un interactuable son ahora un conjunto cerrado de **seis** (`acquireCard · addBottleSlot · setFlag · clearFlag · checkpoint · unlockAbility`): el santuario de R2 y R4 es un `rest` con `checkpoint`; la recompensa del jefe, un `pickup` con `unlockAbility`.

---

## 13. Progresión (DC-31)

Filosofía metroidvania: **explorar → descubrir una habilidad → acceder a una zona nueva → descubrir contenido nuevo.** No es un RPG de estadísticas.

| Familia | Ejemplos | Estado |
|---|---|---|
| Movimiento | Dash (base, ✅), **Air Dash** (mejora; `air_dash` declarado), doble salto, salto de pared, gancho, nado (todos declarados, no implementados) | `AbilitySystem.has(id)` |
| Magia | **Spirit Bolt** (`magic_attack`) | primera habilidad obtenida |
| Acceso | sellos de energía, mecanismos que reaccionan a la energía | flags del mundo |
| Mejoras | +1 vida, +1 ranura de botella (hasta 4), nueva carta | pickups |

Dash y agacharse son **base** (el jugador los tiene desde el principio; en pruebas, `unlock` por URL lo sigue controlando). La **primera puerta** de la slice es un **sello de energía** que solo abre el Spirit Bolt (§14.4).
Hallazgo ✅: `ABILITIES` marcaba `magic_attack` como `implemented: true` sin que existiera su comportamiento. **Resuelto en el Prompt 5 (S15, R25):** la carta del Spirit Bolt concede `magic_attack` al adquirirse y el comportamiento (estado `cast`, coste, proyectil) existe y está probado.

> **Implementado en el Prompt 6** (S28, S29): la progresión de la slice es **una cadena de banderas del mundo**, todas guardadas: `taken:card_spirit_bolt` (la carta, en la repisa de R3, que equipa la carta y enseña `magic_attack`) → `broken:r3_seal` (un **sello de tinta violeta** cierra el camino a R4 y **solo rompe el Spirit Bolt**: la espada rebota, sin daño) → `defeated:r4_boss` (el Custodio de Tinta) → `taken:air_dash` (**Air Dash**, implementado: un dash más en el aire, recompensa del jefe) → la salida del mundo. Dash y agacharse siguen siendo base. **El mundo se puede terminar y se demuestra**: `validateWorld` lo comprueba sobre el papel (una puerta o salida que espera una bandera que nada concede es un error de datos) y un jugador *scripted* con los botones de una persona lo recorre de principio a fin (`worldJourney`, `slice`).

---

## 14. Mundo

### 14.1 Salas y regiones

El mundo son **salas/zonas conectadas**. Cada `RoomDefinition` puede definir (todo opcional salvo lo ya existente ✅):

| Campo | Estado | Contenido |
|---|---|---|
| `id`, `regionId`, `name` (clave), `bounds`, `solids`, `entries`, `killY`, `camera` | ✅ existente | geometría y colisión |
| `exits` | nuevo | rectángulo de salida → `{sala, entrada}`, `requires?`, tipo de transición |
| `spawns` | nuevo | enemigos con id de definición, posición y *flags* que los anulan |
| `interactables` | nuevo | pickups, palancas, puertas, nodos de guardado |
| `hazards` | nuevo | pinchos, caída letal, zonas de daño |
| `cameraZones` | nuevo | límites y zoom por zona, bloqueo de arena |
| `art` | nuevo | id del manifiesto de arte (capas de parallax, props, luz): **separado** de la colisión |
| `music` · `ambient` · `palette` | nuevo | ids lógicos |

Una `RegionDefinition` agrupa salas y fija paleta, música y reglas de zona.

> **Implementado en el Prompt 6** (S22–S29): una sala declara, además de lo de siempre, `exits` (`{ rect, to?, end?, requires? }`: la salida lleva a otra sala **con su entrada**, o es el **fin del mundo**; `requires` refleja la bandera de la puerta física para que el validador pueda **demostrar** que el mundo se acaba), `entries` (los *spawn points*), `spawns` (enemigos, con `defeatFlag` para los únicos), `interactables` (pickups y santuarios), `gates` (`openWhen` / `closeWhen`: una puerta que se abre —o se cierra— con una bandera), `seals`, `hazards`, `bosses` y `camera.{bounds, zones}`. **No** se hicieron `RegionDefinition`, `music`, `ambient` ni `palette` (el audio y las regiones quedan fuera del alcance). `WorldDefinition` = `{ id, start, rooms }`; `worldGraph` (`validateWorld`, `analyzeProgression`) es puro y comprueba que cada sala se alcanza (`room-unreachable`) y tiene camino de vuelta al inicio (`room-trapped`), que ninguna puerta ni salida espera una bandera que nada concede (`flag-ungranted`), que llegar no deja al jugador dentro de una salida (`entry-in-exit`) y que **el final se alcanza** siguiendo solo lo que el héroe puede ganar; el validador de cada sala añade que ninguna entrada cae dentro de un peligro ni de una arena. Detalle: [PROMPT6-LOG](PROMPT6-LOG.md) S22.

### 14.2 Transiciones (determinista)

`exit` → el jugador pasa a `locked` → evento `room:exiting {ticks}` → la vista funde a negro (15 ticks) → `GameSession.loadRoom(sala, entrada)` (ya existe ✅) → `room:entered` → la vista construye y funde de entrada (15 ticks) → desbloqueo. Conserva velocidad y orientación. El bloqueo se mide en **ticks de simulación**, no en tiempo real.

> **Implementado en el Prompt 6** (S23): `gameplay/RoomTransition` (`fadeOut → swap → black → fadeIn`, en ticks, con `Scheduler` y dueño) y `ui/overlays/TransitionOverlay` (el fundido, DOM). Durante la transición el `InputFrame` es neutral y **una pulsación hecha durante ella no se recuerda**; **una transición cada vez**; una salida cerrada no hace nada (y no se gasta); morir durante ella la **cancela**; todo es determinista (el digest de la repetición en el navegador incluye la sala y la fase).

### 14.3 Estado persistente del mundo

**Flags** (`pickup:r03_bolt`, `seal:r02_door`, `secret:r02_wall`, `boss:guardian`, …). Las salas se construyen leyendo flags: *reset de sala*, reaparición y carga de partida son deterministas.

> **Implementado en el Prompt 6** (S24): las banderas son **el progreso**. Las de la slice: `defeated:r1_slime`, `defeated:r2_slime`, `taken:bottle_fourth`, `taken:card_spirit_bolt`, `broken:r3_seal`, `defeated:r4_boss`, `taken:air_dash`. Las que empiezan por `~` (`~fight:r4_boss`: una puerta que se cerró para un combate) son **volátiles**: jamás se guardan y se sueltan al descargar la sala, de modo que una derrota, una recarga o un guardado a medias nunca dejan una puerta cerrada.

### 14.4 Vertical slice «Ancient Forest Ruins» (diseño inicial, ajustable en el Prompt 6)

Pequeña. Debe permitir probar **entrar → explorar → combatir → conseguir algo → continuar → enfrentarse a un enemigo.**

| Sala | Propósito | Contenido | Enseña |
|---|---|---|---|
| **R1** «Puerta de las Ruinas» | entrar y aprender (**la sala del Prompt 4**) | suelo, plataformas, *one-way*, pasaje bajo (agachado), 1 Ink Slime, salida | moverse, saltar, dash, atacar, agacharse |
| **R2** «Salón del bosque» | explorar y combatir | 2–3 Ink Slimes, **sello de energía** visible pero cerrado, muro rompible (secreto) | el mundo tiene rutas que aún no se pueden abrir |
| **R3** «Cámara hundida» | **conseguir algo** | interactuable `pickup` con la carta **Spirit Bolt** | la magia; se muestra la carta y el botón de Habilidad |
| **R2 otra vez** | **continuar** (retroceso) | el Spirit Bolt abre el sello | el valor de volver |
| **R4** «Antesala» | descansar y prepararse | nodo de guardado (Prompt 6) | recarga de botellas |
| **R5** «Arena» | **enfrentarse a un enemigo** | jefe con fases (Prompt 6) | todo lo anterior |

> **R1 implementada en el Prompt 4** (`content/rooms/r1Gate.ts`, [PROMPT4-LOG](PROMPT4-LOG.md) S10): entrada → movimiento → plataformas (foso de 5 m, escaleras *one-way*) → pasaje bajo de 1.2 m × 12 m → arena del Ink Slime → **puerta que solo abre `defeated:r1_slime`** → salida (`exit:reached`). Un guardián con `defeatFlag` **no vuelve a colocarse** mientras su bandera esté puesta (lo ganado se conserva: §9.2 «sin pérdidas»); los enemigos sin bandera reaparecen siempre. Probada **completable por física** con un jugador *scripted* (de la entrada a la salida en 995 ticks, sin daño).

> **R1 en el Prompt 5** (`content/rooms/r1Gate.ts`, [PROMPT5-LOG](PROMPT5-LOG.md) S17/S19): gana la **carta provisional del Spirit Bolt** al final del túnel (⚠ en el diseño inicial esta carta está en R3: el Prompt 6 la mueve) y es la sala que demuestra todo lo del Prompt 5 junta: túnel agachado → **recoger la carta interactuando** → dos *Spirit Bolt* (30 de magia cada uno, 2 de daño; el slime tiene 3) → una botella tras un golpe → puerta → salida. Se juega entera **por teclado bit a bit** (el navegador reproduce una partida grabada en Node y coincide con la simulación cada 50 ticks) y **por táctil con dedos reales** (`vertical` E2E), y se pierde a propósito para ver qué conserva una derrota: **la carta sigue, la botella no se rellena, el slime vuelve y la puerta se cierra**.

Secreto: tras el muro de R2, una **cuarta ranura de botella**. Recompensa del jefe: **Air Dash** (anuncia la siguiente región).

> **Implementada en el Prompt 6 — el mundo final de la slice** (cuatro salas, no cinco; [PROMPT6-LOG](PROMPT6-LOG.md) S22–S29):
>
> | Sala | Qué es | Qué tiene |
> |---|---|---|
> | **R1** «Puerta de las Ruinas» (115 × 30 m) | entrar y aprender (la del Prompt 4) | movimiento, foso, escaleras *one-way*, pasaje bajo, **Ink Slime** (`defeated:r1_slime` abre la puerta), salida a R2 |
> | **R2** «Galería de Raíces» (93 × 30 m) | explorar y elegir | una **bifurcación** sobre una zanja: *camino bajo* (con **pinchos**: un salto corrido los pasa) o *camino alto* (cuatro plataformas *one-way*) hasta una **repisa con la cuarta botella**; un Ink Slime opcional; un **santuario** (checkpoint); salida a R3 |
> | **R3** «Cámara del Sello» (81 × 30 m) | conseguir algo | la subida a una repisa de 4.8 m en dos saltos, la **carta del Spirit Bolt** y, en el pasillo de 40 m hacia R4, el **sello de tinta** que solo rompe el bolt; salida a R4 (`requires: broken:r3_seal`) |
> | **R4** «Santuario» (101 × 30 m) | prepararse y enfrentarse | un **santuario** (el último sitio donde descansar), la **arena** de 39 m con dos puertas, el **Custodio de Tinta**, la **recompensa** (Air Dash) y la **salida del mundo** (`end`, `requires: defeated:r4_boss`) |
>
> El orden jugable es **R1 → R2 → R3 (carta, sello) → R4 (jefe, recompensa) → salida**, con la vuelta posible en cada conexión. **Desvíos del diseño inicial (todos deliberados):** cuatro salas y no cinco (la «Antesala» y la «Arena» son una sola, R4, con el santuario en el vestíbulo); el sello está **en R3** (no en R2) y la carta **en la misma sala**, de modo que se aprende y se usa sin retroceder; no hay muro rompible secreto en R2 (la cuarta botella es la recompensa de elegir el camino alto); el «retroceso» es opcional. Mundo final y reglas: [PROMPT6-LOG](PROMPT6-LOG.md) S22.

---

## 15. Enemigos

### 15.1 Primer enemigo: «Ink Slime» (baba de tinta; nombre de trabajo, `enemy.inkSlime.name`) — DC-33

FSM: `idle/patrulla → detección → aproximación (se desliza) → telegraph → ataque → recuperación → (vuelta) → daño recibido → muerte`.

| Parámetro 📐 | Valor |
|---|---|
| Vida · cuerpo | 3 · 1.1 × 0.9 m |
| Patrulla · aproximación | 1.2 · 2.4 m/s |
| Detección · distancia de ataque | 8 m · 2.2 m |
| **Telegraph** | 24 ticks: aura violeta que crece + ojos blancos incandescentes + aplastamiento |
| Ataque | embestida de 9 m/s durante 10 ticks (≈ 1.5 m), hitbox de 1.3 × 0.9 m, daño 1 |
| Recuperación | 36 ticks (ventana de castigo) |
| Aturdimiento · muerte | 14 ticks · 40 ticks (se deshace en tinta) |

Determinista (todo azar pasa por `Rng`). La arquitectura admite voladores, rápidos, a distancia, blindados y minijefes **sin implementarlos ahora**: son datos + un `EnemyBrain` por arquetipo.

> **Implementado en el Prompt 4** (`content/enemies.ts`, `enemies/archetypes/inkSlime.ts`; detalle y pruebas en [PROMPT4-LOG](PROMPT4-LOG.md) S9). Decisiones que el spec dejaba abiertas:
> - Un estado de **D ticks ocupa exactamente D ticks**, contando el de entrada: el *telegraph* son los 24 ticks **anteriores** al primer tick activo; el hitbox existe en 10; la recuperación dura 36.
> - El *telegraph* **es** el `startup` del ataque (un solo número). La embestida avanza 9 m/s × 10 ticks = **1.5 m** y se detiene donde acaba (no patina).
> - El hitbox de 1.3 × 0.9 m va **centrado en el cuerpo** (el daño ocurre donde la baba *está*): el golpe conecta hacia el tick 9 de 10, cuando el cuerpo llega al jugador, y el alcance efectivo desde la distancia de ataque es de 2.45 m. **No hay daño por contacto.**
> - Un golpe **interrumpe cualquier estado, también la embestida** (sin armadura); el aturdimiento es el del ataque que lo golpea y, si no trae, los 14 ticks de la tabla.
> - Percibe al jugador a 8 m (y lo pierde a 11: histéresis), con **tolerancia vertical** (2.4 m para verlo, 1.2 m para atacarlo) y **sin ver a través de muros**; no cae por los bordes; tras una persecución vuelve caminando a su parcela (±3 m); **deja de atacar en cuanto el jugador cae**.
> - Placeholder visual: cúpula de tinta negra con borde violeta oscuro y ojos blancos; el aviso aplasta y ensancha el cuerpo, enciende los ojos y hace crecer un aura violeta, y el VFX añade un anillo que se cierra (un reloj sin texto) y motas violetas.

### 15.2 Jefe: el Custodio de Tinta (*Ink Warden*)

Múltiples fases, patrones y *telegraphs*, ataques, barra de vida, estados y cambio de fase. Arquitectura en ARCHITECTURE-2D §5.10.

> **Implementado en el Prompt 6** (S29; [PROMPT6-LOG](PROMPT6-LOG.md)): un guardián **original y abstracto** —una columna de tinta con una cresta de luz violeta; sin rostro, sin extremidades— que duerme en la arena de 39 m de R4. **Los pies del héroe cruzando x = 27.5 lo despiertan**: las dos puertas se cierran (bandera volátil), la cámara se fija a la arena y aparece su barra. **FSM única:** `dormant → intro (84 ticks, sin poder herirse) → choose → telegraph → attack → recover → choose…` (+ `hurt` y `dead`); `choose` usa **el `Rng` de la sesión** (determinista; nunca el mismo ataque más de dos veces seguidas). **Dos ataques, ambos con aviso violeta sobre el suelo que se llena hasta el golpe:** la **carga** (aviso de 42 ticks; se desliza ≈ 8.2 m a 13 m/s; daño 2; se esquiva pasándole por encima y quedándose detrás) y la **lluvia de tinta** (aviso de 40; columnas de 1.7 × 5 m en las marcas, dejadas donde el héroe estaba; daño 1; 3 columnas, 4 en la segunda fase). **Vida 36**, la espada hace 1 (**la cresta, ×2**, se alcanza saltando); **segunda fase** a ≤ 50 %: los avisos y las aberturas duran el 72 %. **Sin daño por contacto:** todo lo que hiere es un *hitbox* avisado. Se **gana con lo que ya tiene el jugador** (un bot con los mismos botones lo vence en doce semillas). Su caída pone `defeated:r4_boss` (**guardada**; no vuelve a construirse), abre las puertas, libera la cámara, hace aparecer **el Air Dash** (un dash más en el aire) y abre la salida del mundo. Una derrota en la pelea devuelve al héroe al santuario con **el Custodio entero y dormido**.

---

## 16. Cámara 2D (DC-35)

Cámara 2D **real**: seguimiento, suavizado configurable, límites, anticipación y transiciones entre salas. **Sin cámara 3D ortográfica.** Se reutiliza la matemática de `CameraRig` ✅ (seguimiento amortiguado críticamente, zona muerta, política vertical por suelo, *look-ahead*, límites con corrección por el área visible, zoom, foco, *shake* por trauma determinista, velocidad máxima).

| Parámetro 📐 | Valor |
|---|---|
| `viewHeight` | **13.5 m** (≈ 12.6 % para el héroe de 1.7 m) |
| Proporción admitida | **4:3 – 21:9** (visible 18 – 31.5 m de ancho). Más ancha → barras laterales; más estrecha → aviso de girar el dispositivo |
| Desplazamiento · zona muerta | y +2.3 m · ±1.2 × ±1.4 m |
| Suavizado (x · y · caída) | 0.20 · 0.32 · 0.14 s (los de F4) |
| *Look-ahead* | 3.0 m máx., sesgo hacia donde mira |
| Salas | límites por sala; **corte** tras el fundido; bloqueo con easing en arenas; zoom por zona (arenas 15–16 m) |
| Nitidez | la posición se redondea a un píxel de pantalla para evitar parpadeos; cada capa de parallax redondea la suya |

Los campos 3D de `CameraConfig` (`projection`, `fovDeg`, `pitchDeg`, `swayDeg`, `near`, `far`) **se retiran** al eliminar Three (MIGRATION-2D, S4).

> **Implementado en el Prompt 6** (S26, S29): cada sala declara `camera.bounds` (lo que la vista puede mostrar; el pie del suelo es el fondo de la imagen) y, opcionalmente, **zonas** (`camera.zones`: `rect`, `bounds`, `viewHeight?`, `whenSet?`, `whenClear?`, `smoothTime?`). `resolveCameraView` (puro) elige la **primera zona cuyo rectángulo contiene los pies del héroe** y cuyas banderas lo permiten; `CameraAdapter2D.setView` **funde** los límites y la altura al entrar y salir (la vista nunca salta; un teletransporte o un cambio de sala corta). La **arena de R4** fija la vista entre sus dos puertas a 15 m en lugar de 13.5 y la **suelta cuando cae el jefe** (`whenClear: defeated:r4_boss`). El validador exige que los límites estén dentro de la sala y contengan cada entrada, salida y zona.

---

## 17. HUD (DC-18)

Minimalista, **oscuro, moderno y legible**, con acentos cian/azul. Diseño **propio**: no copia los HUD de Hollow Knight ni de Solo Leveling. Es DOM (ARCHITECTURE-2D §8), por encima del *canvas*.

```
  16 dp ┌────────┐
        │ carta  │  ▮▮▮▮▮                 vida: 5 segmentos (22×10 dp, hueco 3)
 (52×68)│  icono │  ▬▬▬▬▬▬▬▬▬▬▬▬          magia: barra continua 140×8 dp
        └────────┘  ⬡  ⬡  ⬡                botellas: 3–4 viales (22×30 dp, hueco 6; zona táctil 44×44)
```

| Componente | Diseño | Estados |
|---|---|---|
| **Carta / habilidad activa** | tarjeta vertical con marco fino cian al 35 % y fondo `ui.panel`; el icono es la habilidad | lista · magia insuficiente (desaturada) · enfriamiento (barrido radial) · oculta sin carta |
| **Vida** | segmentos `ui.life`; al perder uno, destello blanco y estela de «fantasma» que se apaga en 0.4 s | último segmento: pulso lento |
| **Magia** | barra `energy.core` con brillo que avanza mientras regenera | vacía: sacudida al denegar |
| **Botellas** | viales: **listo** (lleno, brillo `energy.glow`) · **vacío** (contorno apagado) · **recargando** (llenado progresivo) | al usarse: «pop» |

Tamaño a escala `uiScale`; márgenes seguros + 16 dp. **Geometría verificada en el Prompt 6 (S31)** —por cálculo y con Chromium, **no en un dispositivo**: ver [MOBILE-CALIBRATION](MOBILE-CALIBRATION.md)—: cada zona táctil mide ≥ 44 px CSS, nada sale del área segura ni se pisa, los botones no llegan al HUD. Sin texto ni números permanentes. Otros elementos de UI: icono de interacción (§12), chip de botella (§4.3.5), título de derrota (§9.2), barra de jefe (Prompt 6: abajo al centro del área segura, el 46 % del ancho útil entre 160 y 440 px, y **se aparta de los botones táctiles** hacia el tramo libre más ancho; nunca recibe un toque) y menú de pausa mínimo (Prompt 5). Los *skins* son reemplazables por PNG propios sin tocar los sistemas.

> **Implementado en el Prompt 5** (S14, S17, S18; [PROMPT5-LOG](PROMPT5-LOG.md)) con los números de arriba. Arquitectura: **simulación → `GameSession.status()` (la única puerta) → `HudModel` (puro) → `HudView` (DOM)**; Pixi no sabe que existe y `ui/` no importa `pixi.js` ni `render/` (lo impone `tests/unit/architecture.test.ts`). Vida: **5 segmentos** (uno por punto; crece con la vida máxima), fantasma del segmento perdido 0.4 s + destello 0.15 s, pulso del último punto. Magia: barra continua 140 × 8 dp (`scaleX`), brillo mientras regenera, sacudida 0.28 s al denegar. Carta: casilla **vacía** con borde discontinuo mientras no hay carta (el botón de Habilidad no se dibuja); `ready · noMagic · cooldown` (barrido radial). Botellas: 3–4 viales `ready · empty · recharging`; el que se bebe se vacía durante el canal; zona táctil de **49** de alto (S31: eran 44; a la escala mínima, 0.9, son 44 px CSS) × **36 de ancho** (su paso: con el hueco de 6 dp los 44 de ancho se solaparían entre vecinos y un dedo debe significar **una** botella). Escribe en el DOM **solo lo que cambió**. Sin texto propio (nombres accesibles por `t('hud.*')`). Capas DOM: controles táctiles 20 · botón de pausa 24 · **HUD 25** · icono de interacción 26 · título de derrota 40 · menú de ajustes 45. El **botón de pausa** es **un solo icono pequeño arriba al centro** (no a la derecha, no es un control de juego; objetivo ≥ 44 px, nunca toma el foco del teclado; en una ventana más estrecha que el HUD —un móvil en vertical— se coloca **junto** al HUD y no encima): el «menú de pausa mínimo» que esta sección prevé, necesario para que el idioma sea alcanzable en un móvil.

---

## 18. Localización (DC-08)

Idiomas iniciales: **español** e **inglés**. Preparado para añadir francés, portugués, chino, japonés, coreano y ruso **sin tocar código**.

- **Ningún texto de interfaz está escrito en el código ni en el contenido**: las definiciones guardan **claves** (`nameKey`, `descKey`) y la interfaz llama a `t(clave, parámetros)`.
- Claves `área.entidad.campo` (`hud.life`, `card.magicBolt.name`, `interact.open`, `death.title`, `settings.language`). Catálogos JSON por idioma; respaldo `es → en`; interpolación y plurales con `Intl.PluralRules`.
- Idioma por defecto: el del dispositivo si es `es*`/`en*`, si no inglés; se guarda en los ajustes y cambia en caliente (`i18n:changed`).
- Reglas de diseño: sin texto horneado en texturas; maquetación flexible (los textos se alargan hasta ≈ 40 % en alemán/francés); fuentes con respaldo del sistema (CJK en fases posteriores).
- Pruebas obligatorias: mismas claves y mismos parámetros en todos los idiomas · toda clave referenciada por el contenido existe · ningún literal de interfaz en `ui/`.

> **Implementado en el Prompt 5** (S18): el idioma elegido **persiste** (sobrevive a recargar, a otra pestaña, a un navegador nuevo y a un cambio de sala) y se aplica al instante en toda la interfaz y en `<html lang>`. Precedencia (`i18n/chooseLocale`, pura): **`?lang=` (una sola visita, no se guarda nunca) › lo elegido y guardado › los idiomas del dispositivo › inglés**; un idioma sin catálogo se salta, nunca es un error. El cambio en caliente es el *observable* `Translator.changed` (no un evento del bus de juego como sugería `i18n:changed`: la interfaz se suscribe al traductor, la simulación no sabe de idiomas). Los nombres de idioma se muestran **en su propio nombre** (`Intl.DisplayNames`: no se traducen, así que no son literales ni claves). Los catálogos `es.json`/`en.json` tienen las mismas claves y parámetros, **ningún texto idéntico entre ambos** y **ninguna clave huérfana** (cada clave aparece como literal en `src/`); lo comprueba `tests/unit/architecture.test.ts` junto con «ningún literal de interfaz asignado a `textContent`/`innerText`/`innerHTML` en `ui/`». Solo español e inglés; los demás idiomas siguen siendo «añadir un catálogo».

---

## 19. Audio (solo arquitectura ahora)

Debe prever SFX de ataque, impactos, dash, magia, daño, muerte, interacción, ambiente y música. **No se produce audio definitivo en el Prompt 3 ni en el 4.** Los sonidos se piden por **id lógico** desde los eventos (`sfx.hero.slash`, `sfx.hit`, `sfx.dash`, `sfx.cast`, `sfx.hurt`, `sfx.die`, `sfx.interact`, `sfx.bottle.drink`, `ui.tap`) y un manifiesto de datos decide el archivo, variaciones, ganancia, bus y límite de voces. Detalle en ARCHITECTURE-2D §10.

## 20. Persistencia (solo arquitectura ahora)

Debe poder guardar progreso, habilidades, cartas, ranuras, flags, punto de guardado, configuración, idioma, volumen y controles. **Progreso** y **ajustes** se guardan por separado, versionados, con copia de seguridad y migraciones. No hay sistema de guardado en el Prompt 3; la configuración (idioma) llega con el Prompt 5 y el progreso con el 6. Detalle en ARCHITECTURE-2D §11.

> **Implementado en el Prompt 6** (S24, S30): **dos modelos, dos claves, un único almacén seguro debajo** (`SafeStore<T>`, extraído de `SettingsStore` sin cambiar su comportamiento). **Progreso** (`troid.progress`, `saveVersion` 1): `{ at, checkpoint, flags, abilities, cards: { owned, equipped }, bottleSlots }`, **reparado al leer y al escribir**, con una migración y un archivo dorado por versión; se guarda **una vez por ráfaga de cambios** (una bandera, una carta, una habilidad, una ranura, una sala a la que se entra, un descanso, una reaparición) justo después del tick; **no se guarda** lo que se rehace solo (vida, magia, recarga de botellas, posición exacta: se continúa en la **entrada** de la sala) ni las banderas volátiles; los *playgrounds* (`?room=`) nunca leen ni escriben el progreso y `?new=1` empieza de cero. **Ajustes** (`troid.settings`, versión **2**, con la migración 1 → 2 y archivos dorados de ambas): idioma, **volumen** (preparado; todavía no suena nada), **calidad** (`auto` = el perfil equilibrado, **no mide nada**, `low`, `high`), **teclas** de las acciones principales (una por acción, con intercambio, reservadas rechazadas) y **controles táctiles** (tamaño, opacidad, lado y posición). Robustez probada con sondeos de fallos aleatorios del almacenamiento: una carga limpia **jamás da algo inválido ni más viejo que el último guardado que informó éxito**. Formatos y reglas: [PROMPT6-LOG](PROMPT6-LOG.md) S24 y S30.

> **Implementado en el Prompt 5** (S18, endurecido en S20): **solo los ajustes**, versión 1 = `{ version, language | null, touch: { scale, opacity } }` (⚠ más estrecha que la v1 que dibuja ARCHITECTURE-2D §11: volumen, *bindings*, calidad y accesibilidad se añaden **por migración** el día que exista cada cosa; la cadena de migraciones y un archivo dorado de la v1 ya están). `repairSettings` arregla cualquier valor dañado campo a campo y se aplica a lo leído **y** a lo que se va a escribir. Escritura segura: `clave.bak` ← anterior **buena** · se **comprueba** que el respaldo está ahí · `clave` ← nuevo · se **lee de vuelta** · se borra el `.bak`; un valor idéntico **no se reescribe**. Carga: `clave` → si no se puede leer se **conserva** como `clave.corrupt` y se prueba `clave.bak` → defaults; un valor de una **versión posterior** se aparta, no se pisa. Garantía probada con un sondeo de **fallos aleatorios** (escrituras que lanzan, que guardan solo la primera parte, que se pierden en silencio, borrados que fallan, el proceso muerto a mitad de un guardado): una carga limpia **nunca da algo más viejo que el último cambio que se guardó bien**. *(El progreso lo trajo el Prompt 6: ver arriba.)*

## 21. Rendimiento (objetivos de juego)

Mobile-first. Presupuestos de partida (a validar en dispositivo ⚠️): ≤ 60 *draw calls* por frame, atlas ≤ 2048 px, memoria de texturas ≤ ~150 MB, ≤ 400 partículas vivas, simulación ≤ 2 ms por tick, **0 asignaciones por frame** en régimen estable. El *benchmark* de 800 sprites ✅ es una referencia técnica: el juego **no** pinta 800 sprites de forma permanente. Detalle en ARCHITECTURE-2D §7.10.

---

## 22. Aceptación del Prompt 3

La lista de criterios de la fase y dónde se cumple cada uno está en [MIGRATION-2D §11](MIGRATION-2D.md#11-cierre-del-prompt-3-criterios-y-dónde-se-cumplen).
