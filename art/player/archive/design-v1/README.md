# Protagonista — diseño anterior (`design-v1`)

El protagonista que tuvo el juego **hasta el Prompt 16**, guardado entero y **fuera del juego**. El diseño de hoy es el de la hoja de personaje del usuario (`../../source/character-sheet.png`); este
es el que reemplazó. No se borró nada de él: está aquí, con la misma disposición que `art/player/` (para poder volver a ponerlo tal cual) y también en el historial de Git (etiqueta `protagonista-v1`,
el commit `48684b9`, el último con ese diseño en el juego).

```
art/player/archive/design-v1/
  hero/                 los 90 fotogramas PNG que tenía el juego (18 clips)
  player.pack.json      su manifiesto (clips, anclas de la espada, pivote, escala)
  source/               de dónde salían:
    hero-sheet.png        la hoja de poses del diseño anterior, bit a bit (el generador comprueba su hash)
    hero-portrait.jpg     su retrato de referencia
    hero.poses.json       qué pose de la hoja es cada dibujo; hero.rig.json: el rig que las mueve
    delivered/<clip>/     las entregas de dibujos nuevos que entraron por `assets:intake` (hoja, anclas, informe)
  requests/, inbox/     el kit de encargos de entonces y su bandeja
```

## Qué no es

- **No se empaqueta.** El empaquetador (`npm run assets:pack`) lee `art/<paquete>/<paquete>.pack.json` a un nivel: nada de `archive/` llega a `public/art/` ni al juego, y el juego no sabe que existe.
- **No es una referencia.** El diseño de hoy se construye y se corrige **solo** desde la hoja nueva; ninguna herramienta toma un fotograma de aquí para hacer uno nuevo, y una prueba
  (`tests/unit/tools/characterArt.test.ts`) exige que ninguno de los 44 fotogramas del juego sea uno de estos 90.
- Las herramientas y pruebas que hablan de él (`assets:animate`, el generador de fotogramas por rig, y sus pruebas) trabajan **sobre esta carpeta**, no sobre el juego: las salidas del generador se escriben
  junto a su especificación, es decir, aquí.

## Volver a este diseño

Con Git, desde un árbol limpio (todo guardado en un commit): `git rm -r -q art/player public/art/player && git checkout protagonista-v1 -- art/player public/art/player` — el `rm` primero, porque `checkout` solo añade y sobrescribe: un fotograma del diseño de hoy que el anterior no tenía (`walk_04.png`, por ejemplo) se quedaría en la carpeta. La etiqueta apunta al commit `48684b9`, el último con este diseño en el juego (`git checkout 48684b9 -- …` es lo mismo si la etiqueta no está). Después, `npm run assets:check`.

Sin Git, desde esta carpeta (los pasos que sigue la prueba de reversión; ver `docs/PROMPT16-LOG.md`):

1. Guarda el diseño de hoy por si quieres volver: `cp -r art/player/hero art/player/archive/design-v2-hero` (o muévelo a otro archivo).
2. Reemplaza lo que el juego lee: `rm -r art/player/hero && cp -r art/player/archive/design-v1/hero art/player/hero && cp art/player/archive/design-v1/player.pack.json art/player/player.pack.json`.
3. Vuelve a empaquetar y comprueba: `npm run assets:pack && npm run assets:check`.

Después de volver, las pruebas del diseño de hoy (`characterArt`, `artRepo`, `heroPlayback`, `deliveries`) fallarán a propósito — dicen qué es lo que ya no es el juego. `npm run assets:animate -- --check`
comprueba que esta carpeta sigue siendo lo que el generador produce de su hoja y su rig.
