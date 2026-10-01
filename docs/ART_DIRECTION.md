# Dirección de arte

> Palabra clave: **STYLIZED 3D SIDE-SCROLLING ADVENTURE**. Identidad propia: no «Zelda en 2D», no «Hades con
> otro personaje», no «Castlevania con gráficos 3D». Las referencias aportan **principios**, nunca contenido.

## 1. Qué se toma de cada referencia (y qué no)

| Referencia | Principio que adoptamos | No se copia |
|---|---|---|
| Zelda BotW / TotK | Sensación de mundo previo al jugador, naturaleza fundida con ruinas, escala, luz natural, materiales estilizados simples, bioma por región | Diseños, formas, símbolos, mapas, criaturas, UI |
| Hades / Hades II | Legibilidad a escala pequeña, siluetas fuertes, acentos de color sobre fondos contenidos, FX de ataque muy visibles, poses exageradas, luz dramática | Estética griega, personajes, iconografía, UI |
| Castlevania: Belmont's Curse | Estructura de acción-exploración lateral, salas, secretos, trampas, jefes, ritmo de combate, contraste entre ambientes | Gótico obligatorio, arquitectura/enemigos/armas/lore |

## 2. Lectura de las capturas de referencia aportadas (medidas, no para copiar)

Medido sobre las 5 capturas (alto útil ≈ 1120 px):

- El personaje ocupa **≈ 9 %** del alto visible; el jefe ≈ **2.5×** el jugador; puertas/pilares ≈ **7×**.
  → Nuestro objetivo: jugador **10–12 %** del alto visible (≈ 15–16 m de alto de visión con un jugador de 1.8 m) y se
  valida en 844×390 antes de tocar la escala.
- **Un matiz dominante por sala** (verde-azulado, amarillo-verdoso, carmesí) y los actores son **más cálidos y
  saturados** que su entorno → contraste cromático figura/fondo.
- **Siluetas negras en primer plano** (goteras arriba, hierba/rejas abajo) enmarcan la pantalla en los
  **bordes**, nunca en el centro de la acción.
- **Luz motivada**: velas con halo circular, haces por ventanas, cascadas emisivas, reflejo en agua,
  motas de polvo. Todo apoya la lectura del plano jugable.
- HUD mínimo arriba-izquierda, barra de jefe abajo-centro, textos contextuales abajo-centro.
  → Nuestra UI es **provisional y propia**, hecha para ser sustituida por PNG.
- FX de ataque amplios (arcos azules/dorados), números de daño flotantes, destellos de impacto.

## 3. Reglas de legibilidad (obligatorias)

Jerarquía de valor/saturación, de más a menos llamativo:

1. **Jugador** — el más luminoso (blanco) + *rim light* + contorno fino oscuro.
2. **Amenazas** (enemigos, proyectiles, telegraphs) — acento saturado propio por rol y *flash* de aviso.
3. **Interactivos** (checkpoint, pickups, gates, paredes rompibles) — emisivos suaves y pulso.
4. **Plano de juego** (suelo, plataformas) — valor medio, bordes superiores claros (silueta del camino).
5. **Fondos** — desaturados y velados por niebla atmosférica; **primer plano** — oscuro, solo en los bordes.

Prueba obligatoria: captura a 844×390 y preguntarse *¿se entiende qué hace el personaje?* Si no: más
contraste/silueta/FX/luz, **no** más tamaño de personaje.

Roles de color de actores: jugador blanco · pequeño ámbar · pesado carmesí · volador violeta · a distancia
turquesa · mini-jefe cobre · jefe magenta/oro. Los fondos nunca usan esos tonos con esa saturación.

## 4. Color script por región (provisional)

| Región | Dominante | Luz | Acento |
|---|---|---|---|
| Ancient Forest Ruins — exterior | verdes + tierra + dorados | cálida, oblicua, motas de polvo | piedra clara |
| Ruins (interior) | piedra + verdes apagados | cálida localizada | musgo luminoso |
| Root Cavern | azules / ocres | luces puntuales (cristales, brasas) | turquesa emisivo |
| Arenas (mini-jefe / jefe) | piedra + dorado | cenital dramática, contraste alto | acento del jefe |
| Corrupción (futuro) | oscuros | baja | magenta saturado |

## 5. Capas de profundidad

`FAR` (z −60…−200: montañas, ruinas gigantes, cielo) · `MID` (z −10…−40: árboles, arcos, muros) ·
`WORLD` (z −4…+3: plano de juego y su volumen) · `FOREGROUND` (z +3…+10: ramas, hojas, piedras;
**solo bordes superior/inferior**, oscuros y poco densos) · `ATMOSPHERE` (niebla, haces de luz, polvo, luciérnagas).
El parallax sale gratis de una cámara en perspectiva real; nada se «simula» con sprites desplazados.

## 6. Luz

Una direccional con sombra (clave, sigue al jugador para sombra nítida), hemisférica por región, *rim* en el
shader de personajes (separación garantizada independientemente de la escena), luces puntuales ≤ 3
(brazas, cristales) y emisivos + halos aditivos para el resto. **Nunca** un filtro oscuro uniforme.

## 7. Materiales

Toon de 3–4 tonos con rampa por región, vértice coloreado para variación y «AO» barato (oscuro abajo, musgo en
las caras superiores), roughness controlada. Piedra, madera, vegetación y metal se distinguen por valor y
rampa, no por texturas fotográficas. Todo comparte el mismo lenguaje.

## 8. Cámara — estudio (se completa en F4)

Candidatas: **ortográfica**, **perspectiva FOV estrecho (20–30°)**, **perspectiva FOV medio (40°)**.
Criterio: lateralidad jugable (distorsión mínima en el plano `z=0`) + profundidad visual (parallax real). Los
resultados con capturas y la decisión final se registran aquí cuando exista `CameraRig`.

## 9. Criterio visual final (checklist antes de dar por buena una decisión visual)

- ¿Ayuda a crear un mundo de aventura estilizado y cinematográfico?
- ¿El personaje sigue siendo legible? ¿Los enemigos se distinguen?
- ¿El escenario tiene profundidad? ¿Los colores tienen intención?
- ¿La luz ayuda al gameplay? ¿Los VFX tienen impacto?
- ¿Se siente bien en una pantalla de teléfono?
- ¿Se parece demasiado a una referencia concreta? → cambiarlo.
