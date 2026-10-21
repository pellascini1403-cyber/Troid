# Los dibujos que faltan del protagonista — kit de producción

> **Lo que es esto.** El protagonista es el de la hoja del usuario (`../source/character-sheet.png`, intacta): sus poses son los fotogramas del juego, sin redibujar nada. La hoja trae el movimiento, el salto, la caída, un tajo, el disparo, el dash, la interacción, el daño y la muerte; **no trae** los clips de esta lista, y mientras no existan **el juego dibuja sus estados con el marcador del motor** (la cápsula): no se ha inventado, deformado ni reutilizado ningún dibujo para taparlos. Este kit es lo que hace falta para que alguien (tú, un artista o un generador de imágenes) los dibuje sin ambigüedad con el mismo personaje, y la herramienta que los recibe, comprueba e integra.
>
> **Cuánto es:** 6 clips y **26 dibujos** en total. Cada clip es **una hoja** (todas sus poses en una fila, sobre fondo blanco, como la hoja del usuario): 6 generaciones. Este archivo y los `brief.md` los escribe `npm run assets:intake -- kit` desde `requests.json`. Ya tienen dibujo y ya no se piden: `idle`, `dash`, `attack1`, `walk`, `run`, `jump`, `fall`, `land`, `cast`, `hurt`, `death`, `interact`.

## Los tres pasos

1. **Genera** una hoja por clip (en este orden: B, C, luego D–G, luego I). De cada clip: `<clip>/brief.md` tiene el *prompt* listo para pegar; `<clip>/reference.png`, `character-reference.png` y `../source/character-sheet.png` son lo que se adjunta al generador.
2. **Suelta** el resultado en `art/player/inbox/<clip>/` (la hoja entera como `sheet.png`, o un PNG por pose `<clip>_00.png` …).
3. **`npm run assets:intake -- <clip>`**: recorta, escala (por la cabeza, al tamaño del idle), coloca y comprueba, y escribe la hoja de contacto comparativa en `art/player/inbox/_reports/<clip>/`. Cuando la hoja se vea bien: **`npm run assets:intake -- <clip> --accept`** la integra. **`npm run assets:intake -- status`** dice, clip por clip, qué tiene dibujo y qué falta.

## Los clips que faltan, por orden de producción

| Grupo | Clip | Dibujos | Por qué falta | Brief |
|---|---|---|---|---|
| B | `attack2` | 5 | La hoja no trae un segundo tajo. | [`attack2/brief.md`](attack2/brief.md) |
| C | `crouch` | 2 | La hoja no trae ninguna agachada. | [`crouch/brief.md`](crouch/brief.md) |
| D | `crouchWalk` | 4 | La hoja no trae ningún andar agachado. | [`crouchWalk/brief.md`](crouchWalk/brief.md) |
| F | `aerialAttack` | 6 | La hoja no trae un tajo en el aire. | [`aerialAttack/brief.md`](aerialAttack/brief.md) |
| G | `crouchAttack` | 5 | La hoja no trae un tajo desde la agachada. | [`crouchAttack/brief.md`](crouchAttack/brief.md) |
| I | `drink` | 4 | La hoja no trae a nadie bebiendo. | [`drink/brief.md`](drink/brief.md) |

## Lo que NO se hace (reglas del encargo)

- No se rediseña al protagonista: nada humano, ni pelo, ni máscara, ni ropa inventada; la cabeza, las orejas, los ojos, las antenas, el cuerpo, la bufanda de fuego, la espada, la silueta, las proporciones y la paleta son los de la hoja.
- No se pintan efectos: los arcos de los tajos, los proyectiles y los destellos los pone el juego. Lo que la hoja del usuario trae pintado alrededor de las poses (el arco, la bola, los rombos, las gotas) se quita en cada clip con `erase.json`, sin tocar la figura.
- `character-sheet.png` no se toca jamás.
- La espada, en la mano derecha, es **la misma varilla de la hoja**.

## Guías

- `canvas-template.png` y `canvas-template-idle.png`: el lienzo a 4× con el suelo, el pivote, las alturas del cuerpo de pie (1.7 m) y agachado (1.0 m) y el margen: **guías de composición, no arte**.
- Cómo se entrega y por qué no se sobrescribe lo ya aprobado: [`docs/guides/deliver-protagonist-art.md`](../../../docs/guides/deliver-protagonist-art.md).
