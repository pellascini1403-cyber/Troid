import { Container } from 'pixi.js';

// The parallax factors are DATA of the environment contract (docs/ART-PIPELINE-2D.md, part I): one place, tested against this scene graph.
export { PARALLAX_FACTOR } from '@/presentation/environment';

/**
 * The scene graph, back to front. Everything inside `world` lives in METRES (view space: +Y down, see
 * presentation/worldTransform.ts); `sky` and `screen` live in screen pixels. The HUD is NOT here: it is DOM.
 */
export interface Layers {
  /** Screen space, BEHIND the world: placeholder sky. */
  sky: Container;
  /** Camera space (metres). Transform = camera. */
  world: Container;
  backdropFar: Container;
  backdropMid: Container;
  backdropNear: Container;
  propsBack: Container;
  terrain: Container;
  actors: Container;
  /** Normal blend: ink splashes, smoke and dust (dark things cannot be additive). */
  fxNormal: Container;
  /** Additive: projectiles, slash arcs, trails, sparks, light pools. */
  fxWorld: Container;
  foreground: Container;
  /** Additive: light shafts, fog, ambient motes. */
  lightOverlay: Container;
  /** World space, only populated with `?debug=1`. */
  debug: Container;
  /** Screen space, in FRONT: vignette, flashes, fades, bars. */
  screen: Container;
}

export function createLayers(stage: Container): Layers {
  const sky = new Container({ label: 'sky' });
  const world = new Container({ label: 'world' });
  const screen = new Container({ label: 'screen' });

  const child = (label: string, blendMode?: 'add'): Container => {
    const c = new Container({ label });
    if (blendMode) c.blendMode = blendMode;
    world.addChild(c);
    return c;
  };

  const layers: Layers = {
    sky,
    world,
    backdropFar: child('backdropFar'),
    backdropMid: child('backdropMid'),
    backdropNear: child('backdropNear'),
    propsBack: child('propsBack'),
    terrain: child('terrain'),
    actors: child('actors'),
    fxNormal: child('fxNormal'),
    fxWorld: child('fxWorld', 'add'),
    foreground: child('foreground'),
    lightOverlay: child('lightOverlay', 'add'),
    debug: child('debug'),
    screen,
  };
  layers.actors.sortableChildren = true;
  stage.addChild(sky, world, screen);
  return layers;
}
