import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { AssetManager, type GltfLike } from '@/assets/AssetManager';
import { CharacterModel, type ModelAsset } from '@/assets/CharacterModel';
import { ActorVisual } from '@/assets/ActorVisual';
import { validateModel } from '@/assets/validateModel';
import { createActorViewState } from '@/gameplay/actorViewState';
import { MANNEQUIN } from '@/content/models';
import { ANIM_STATES, SOCKET_IDS } from '@/models/vocabulary';
import type { ModelDefinition } from '@/models/ModelDefinition';
import { loadGlb } from '../../helpers/loadGlb';
import { log } from '@/core/log';

let glb: GltfLike;
beforeAll(async () => {
  log.setSink(() => {}); // fallbacks log warnings by design; keep test output clean
  glb = await loadGlb('assets/models/mannequin.glb');
});

const asset = (): ModelAsset => ({ def: MANNEQUIN, scene: glb.scene, animations: glb.animations });

describe('mannequin asset contract', () => {
  it('the committed GLB satisfies its ModelDefinition with no errors or warnings', () => {
    const issues = validateModel(MANNEQUIN, glb.scene, glb.animations).filter((i) => i.level !== 'info');
    expect(issues).toEqual([]);
  });

  it('is a real rig: one skinned mesh, 18 joints, every logical state has a clip', () => {
    let skinned: THREE.SkinnedMesh | undefined;
    glb.scene.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned = o as THREE.SkinnedMesh;
    });
    expect(skinned).toBeDefined();
    expect(skinned!.skeleton.bones).toHaveLength(18);
    const clipNames = new Set(glb.animations.map((c) => c.name));
    for (const state of ANIM_STATES) {
      const mapped = MANNEQUIN.clips[state];
      if (mapped === undefined) continue;
      expect(clipNames.has(typeof mapped === 'string' ? mapped : mapped.clip)).toBe(true);
    }
  });

  it('is fully white (no baked colour) and 1.83 m tall', () => {
    const box = new THREE.Box3();
    glb.scene.traverse((o) => {
      const sk = o as THREE.SkinnedMesh;
      if (sk.isSkinnedMesh) {
        sk.geometry.computeBoundingBox();
        box.copy(sk.geometry.boundingBox!);
        const mat = sk.material as THREE.MeshStandardMaterial;
        expect(mat.color.getHex()).toBe(0xffffff);
      }
    });
    expect(box.max.y - box.min.y).toBeGreaterThan(1.75);
    expect(box.max.y - box.min.y).toBeLessThan(1.9);
  });

  it('validateModel reports a wrong clip name, a missing idle, and a scale problem', () => {
    const bad: ModelDefinition = {
      ...MANNEQUIN,
      scale: 100,
      clips: { run: 'DoesNotExist' },
    };
    const msgs = validateModel(bad, glb.scene, glb.animations).map((i) => `${i.level}:${i.message}`);
    expect(msgs.some((m) => m.startsWith('error:') && m.includes('DoesNotExist'))).toBe(true);
    expect(msgs.some((m) => m.startsWith('error:') && m.includes('idle'))).toBe(true);
    expect(msgs.some((m) => m.startsWith('warn:') && m.includes('Suggested scale'))).toBe(true);
  });
});

describe('CharacterModel', () => {
  it('resolves every socket id to a real node (no fallbacks for the mannequin)', () => {
    const model = new CharacterModel(asset());
    for (const id of SOCKET_IDS) {
      const node = model.getSocket(id);
      expect(node, id).toBeDefined();
      expect(node.name.includes('(fallback)'), id).toBe(false);
    }
    model.dispose();
  });

  it('synthesises fallback sockets for a model that has none (gameplay never needs null checks)', () => {
    const empty: ModelAsset = {
      def: { ...MANNEQUIN, id: 'bare', height: 2, scale: 1 },
      scene: new THREE.Group().add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial())),
      animations: [new THREE.AnimationClip('Idle', 1, [])],
    };
    const model = new CharacterModel(empty);
    for (const id of SOCKET_IDS) expect(model.getSocket(id).name).toContain('(fallback)');
    expect(model.getSocketWorld('head').y).toBeCloseTo(2.04, 1); // ≈ 1.02 × height
    model.dispose();
  });

  it('uses toon materials with outline hulls, one per mesh, and leaves the shared asset untouched', () => {
    const model = new CharacterModel(asset());
    expect(model.materials.length).toBeGreaterThan(0);
    expect(model.materials.every((m) => m.type === 'MeshToonMaterial')).toBe(true);
    let outlines = 0;
    model.body.traverse((o) => {
      if (o.name.endsWith('_outline')) outlines++;
    });
    expect(outlines).toBe(1);
    // the source scene still has its original material
    glb.scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) expect(((o as THREE.Mesh).material as THREE.Material).type).toBe('MeshStandardMaterial');
    });
    model.dispose();
  });

  it('instances are independent: flashing one does not flash another', () => {
    const a = new CharacterModel(asset());
    const b = new CharacterModel(asset());
    a.setFlash(1);
    expect(a.toonUniformsOfFirstMaterial!.uFlash.value).toBe(1);
    expect(b.toonUniformsOfFirstMaterial!.uFlash.value).toBe(0);
    a.dispose();
    b.dispose();
  });

  it('dispose is idempotent and detaches the root', () => {
    const model = new CharacterModel(asset());
    const parent = new THREE.Group();
    parent.add(model.root);
    model.dispose();
    model.dispose();
    expect(parent.children).toHaveLength(0);
  });
});

describe('AnimationController', () => {
  const make = (def: Partial<ModelDefinition> = {}) => {
    const model = new CharacterModel({ ...asset(), def: { ...MANNEQUIN, ...def } });
    return { model, anim: model.animation };
  };

  it('starts in idle at full weight (no T-pose flash on spawn)', () => {
    const { model, anim } = make();
    expect(anim.state).toBe('idle');
    const hips = model.body.getObjectByName('hips')!;
    model.mixer.update(0);
    // idle pose bends the knees → the hips are not at their rest height
    expect(hips.position.y).not.toBeCloseTo(0.98, 2);
    model.dispose();
  });

  it('falls back through the chain: no walk → run; no clips at all for a state → idle, never throws', () => {
    const { model, anim } = make({ clips: { idle: 'Idle', run: 'Run' } });
    anim.play('walk');
    expect(anim.state).toBe('run');
    expect(anim.requested).toBe('walk');
    anim.play('death'); // death → hurt → idle
    expect(anim.state).toBe('idle');
    expect(() => anim.play('phaseTransition')).not.toThrow();
    model.dispose();
  });

  it('restarting a one-shot clip resets it to t=0 at full weight (combo hits do not pop through the bind pose)', () => {
    const { model, anim } = make();
    anim.play('attack', { fade: 0 });
    anim.update(0.2);
    expect(anim.progress).toBeGreaterThan(0.3);
    anim.play('attack', { restart: true });
    expect(anim.progress).toBeCloseTo(0, 2);
    const action = model.mixer.clipAction(glb.animations.find((c) => c.name === 'Attack')!);
    expect(action.getEffectiveWeight()).toBe(1);
    model.dispose();
  });

  it('time-fits a clip to a gameplay duration', () => {
    const { model, anim } = make();
    anim.play('attack', { duration: 0.21 }); // clip is 0.42 s → plays at 2×
    anim.update(0.105);
    expect(anim.progress).toBeCloseTo(0.5, 1);
    model.dispose();
  });

  it('one-shots report finished and hold their last pose; loops never finish', () => {
    const { model, anim } = make();
    anim.play('hurt', { fade: 0 });
    expect(anim.finished).toBe(false);
    anim.update(1);
    expect(anim.finished).toBe(true);
    anim.play('idle', { fade: 0 });
    anim.update(10);
    expect(anim.finished).toBe(false);
    model.dispose();
  });

  it('cross-fades between different clips', () => {
    const { model, anim } = make();
    anim.play('run', { fade: 0 });
    anim.update(0.1);
    anim.play('jump'); // default fade 0.04 s
    anim.update(0.01);
    const run = model.mixer.clipAction(glb.animations.find((c) => c.name === 'Run')!);
    const jump = model.mixer.clipAction(glb.animations.find((c) => c.name === 'Jump')!);
    expect(jump.getEffectiveWeight()).toBeGreaterThan(0);
    expect(run.getEffectiveWeight()).toBeLessThan(1);
    model.dispose();
  });
});

describe('ActorVisual', () => {
  const make = () => {
    const model = new CharacterModel(asset());
    const visual = new ActorVisual(model, { facingYawDeg: 80 });
    return { model, visual, view: createActorViewState() };
  };

  it('interpolates the position between ticks and applies depth z', () => {
    const { visual, view } = make();
    Object.assign(view, { prevX: 10, x: 12, prevY: 0, y: 1, z: -2 });
    visual.sync(view, 0.5, 1 / 60);
    expect(visual.root.position.x).toBeCloseTo(11);
    expect(visual.root.position.y).toBeCloseTo(0.5);
    expect(visual.root.position.z).toBe(-2);
  });

  it('pivots toward the facing direction and settles on ±facingYaw', () => {
    const { visual, view } = make();
    view.facing = -1;
    for (let i = 0; i < 60; i++) visual.sync(view, 0, 1 / 60);
    expect(visual.model.root.rotation.y).toBeCloseTo((-80 * Math.PI) / 180, 2);
    visual.snapFacing(1);
    expect(visual.model.root.rotation.y).toBeCloseTo((80 * Math.PI) / 180, 5);
  });

  it('restarts the clip only when animSerial changes', () => {
    const { visual, view } = make();
    view.anim = 'attack';
    visual.sync(view, 0, 1 / 60);
    visual.sync(view, 0, 0.2);
    const t = visual.model.animation.progress;
    expect(t).toBeGreaterThan(0.2);
    visual.sync(view, 0, 1 / 60); // same serial: keeps playing
    expect(visual.model.animation.progress).toBeGreaterThan(t);
    view.animSerial++;
    visual.sync(view, 0, 0);
    expect(visual.model.animation.progress).toBeCloseTo(0, 1);
  });

  it('blink dims opacity on alternate phases and respects visible=false', () => {
    const { visual, model, view } = make();
    view.blink = true;
    const seen = new Set<number>();
    for (let i = 0; i < 30; i++) {
      visual.sync(view, 0, 1 / 60);
      seen.add(Number(model.materials[0]!.opacity.toFixed(2)));
    }
    expect(seen.has(1)).toBe(true);
    expect(seen.has(0.35)).toBe(true);
    view.visible = false;
    visual.sync(view, 0, 1 / 60);
    expect(visual.root.visible).toBe(false);
  });
});

describe('AssetManager', () => {
  const make = () => {
    let loads = 0;
    const assets = new AssetManager('/base/', {
      validate: false,
      loadGltf: async (url) => {
        loads++;
        expect(url).toBe('/base/assets/models/mannequin.glb');
        return glb;
      },
    });
    return { assets, loads: () => loads };
  };

  it('shares one download between concurrent requests', async () => {
    const { assets, loads } = make();
    await Promise.all([assets.load(MANNEQUIN), assets.load(MANNEQUIN), assets.instantiate(MANNEQUIN)]);
    expect(loads()).toBe(1);
    expect(assets.size).toBe(1);
  });

  it('ref-counts instances and frees the entry when the last one is released', async () => {
    const { assets } = make();
    const a = await assets.instantiate(MANNEQUIN);
    const b = assets.instantiateLoaded(MANNEQUIN);
    expect(assets.refCount(MANNEQUIN)).toBe(2);
    a.dispose();
    assets.release(MANNEQUIN);
    expect(assets.has(MANNEQUIN)).toBe(true);
    b.dispose();
    assets.release(MANNEQUIN);
    expect(assets.has(MANNEQUIN)).toBe(false);
    expect(assets.size).toBe(0);
  });

  it('a failed load does not poison the cache', async () => {
    let fail = true;
    const assets = new AssetManager('/', {
      validate: false,
      loadGltf: async () => {
        if (fail) throw new Error('network');
        return glb;
      },
    });
    await expect(assets.load(MANNEQUIN)).rejects.toThrow('network');
    await Promise.resolve();
    fail = false;
    await expect(assets.load(MANNEQUIN)).resolves.toBeDefined();
  });

  it('instantiateLoaded throws a clear error when the model was never loaded', () => {
    const { assets } = make();
    expect(() => assets.instantiateLoaded(MANNEQUIN)).toThrow(/not loaded/);
  });
});
