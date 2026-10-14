# Los dibujos que faltan del protagonista — kit de producción

> **Lo que es esto.** El Prompt 9 animó al protagonista moviendo los dibujos de tu hoja; **los clips de esta lista siguen siendo *stand-ins*** (o, en el caso de `walk`, un único dibujo deformado): el movimiento es real, pero el dibujo es el de otra acción, porque la hoja no tiene uno para ella. Un dibujo solo se puede deformar, **no mirar desde otro lado**: esos clips necesitan DIBUJOS NUEVOS del mismo personaje. En el Prompt 10 **no había ninguna herramienta de generación de imágenes** en el entorno (ni de edición que pudiera hacerlo sin inventar), así que **no se ha dibujado nada**: este kit es lo que hace falta para que alguien (tú, un artista o un generador de imágenes) los dibuje sin ambigüedad, y la herramienta que los recibe, comprueba e integra.
>
> **Cuánto es:** 10 clips y **46 dibujos** en total (sin contar los clips que ya tienen dibujo propio). Cada clip es **una hoja** (todas sus poses en una fila, sobre fondo blanco, como tu hoja de poses): 10 generaciones. Este archivo y los `brief.md` los escribe `npm run assets:intake -- kit` desde `requests.json`.

## Los tres pasos

1. **Genera** una hoja por clip (en este orden: A, B, C, luego D–G, luego H–J). De cada clip: `<clip>/brief.md` tiene el *prompt* listo para pegar; `<clip>/reference.png` y `character-reference.png` (y `../source/hero-portrait.jpg`) son lo que se adjunta al generador.
2. **Suelta** el resultado en `art/player/inbox/<clip>/` (la hoja entera como `sheet.png`, o un PNG por pose `<clip>_00.png` …).
3. **`npm run assets:intake -- <clip>`**: recorta, escala, coloca y comprueba, y escribe la hoja de contacto comparativa (el dibujo original · la pose nueva · la secuencia · el tamaño real de juego) en `art/player/inbox/_reports/<clip>/`. Cuando la hoja se vea bien: **`npm run assets:intake -- <clip> --accept`** la integra por el mecanismo `delivered`. **`npm run assets:intake -- status`** dice, clip por clip, qué tiene dibujo propio, qué es *stand-in* y qué hay en la bandeja.

## Los clips, por orden de producción

| Grupo | Clip | Dibujos | Qué sustituye | Brief |
|---|---|---|---|---|
| A | `dash` | 3 | Hoy es la carrera (dibujo 3) lanzada hacia delante: un stand-in. | [`dash/brief.md`](dash/brief.md) |
| B | `attack2` | 7 | Hoy es el primer tajo (dibujo 7) girado al revés: un stand-in. | [`attack2/brief.md`](attack2/brief.md) |
| C | `crouch` | 2 | Hoy es la agachada del aterrizaje (dibujo 6) sostenida y respirando: un stand-in. | [`crouch/brief.md`](crouch/brief.md) |
| D | `crouchWalk` | 4 | Hoy es la agachada del aterrizaje «a pasitos» (deformada): un stand-in. | [`crouchWalk/brief.md`](crouchWalk/brief.md) |
| E | `walk` | 6 | La marcha de hoy es el dibujo 2 deformado: las piernas se turnan pero no se cruzan y los pies resbalan. | [`walk/brief.md`](walk/brief.md) |
| F | `aerialAttack` | 6 | Hoy es el primer tajo (dibujo 7) con las piernas recogidas: un stand-in. | [`aerialAttack/brief.md`](aerialAttack/brief.md) |
| G | `crouchAttack` | 6 | Hoy es el primer tajo (dibujo 7) bajado sobre las piernas: un stand-in. | [`crouchAttack/brief.md`](crouchAttack/brief.md) |
| H | `death` | 5 | Hoy es el dibujo del golpe (11) tumbado y con los ojos apagándose: un stand-in. | [`death/brief.md`](death/brief.md) |
| I | `drink` | 4 | Hoy es el dibujo de pie haciendo un gesto, sin botella ni mano a la boca: un stand-in. | [`drink/brief.md`](drink/brief.md) |
| J | `interact` | 3 | Hoy es el dibujo de pie que se inclina y asiente, sin mano que alcance: un stand-in. | [`interact/brief.md`](interact/brief.md) |

## Lo que NO se hace (reglas del encargo)

- No se rediseña al protagonista: nada humano, ni pelo, ni máscara nueva, ni ropa inventada; la cabeza, la silueta, las proporciones y la paleta son las de tus dibujos.
- No se pinta rojo: los efectos (el arco del tajo, la estela del *dash*) los pone el juego, en cian. Los dibujos 8, 9 y 10 de tu hoja (con el rojo fundido) **no se usan**: solo se enseñan como actitud.
- `hero-sheet.png` y `hero-portrait.jpg` no se tocan jamás.
- La espada, en la mano derecha, es **la misma hoja de tus dibujos**.

## Guías

- `canvas-template.png` y `canvas-template-idle.png`: el lienzo a 4× con el suelo, el pivote, las alturas del cuerpo de pie (1.7 m) y agachado (1.0 m) y el margen: **guías de composición, no arte**.
- Cómo se entrega y por qué no se sobrescribe lo ya aprobado: [`docs/guides/deliver-protagonist-art.md`](../../../docs/guides/deliver-protagonist-art.md) §4.
