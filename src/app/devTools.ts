import type { Hurtbox } from '@/combat/Combatant';
import { DisposableStore } from '@/core/lifecycle';
import type { Rect } from '@/core/math';
import { ColliderOverlay2D } from '@/debug/ColliderOverlay2D';
import type { DebugActions } from '@/debug/DebugActions';
import { DebugPanel } from '@/debug/DebugPanel';
import type { DebugState } from '@/debug/DebugState';
import type { DrawCallCounter } from '@/debug/DrawCallCounter';
import type { FpsMeter } from '@/debug/FpsMeter';
import type { GameSession } from '@/gameplay/GameSession';
import type { InputManager } from '@/input/InputManager';
import type { Renderer2D } from '@/render/Renderer2D';

/** What the developer tools need from the game, and nothing more (they never reach into the rest of it). */
export interface DevToolsHost {
  session: GameSession;
  debug: DebugState;
  actions: DebugActions;
  fps: FpsMeter;
  counter: DrawCallCounter;
  input: InputManager;
  renderer: Renderer2D;
  /** Runs one simulation tick (the panel's "step" button while paused). */
  step(): void;
  /** Puts a training dummy / an Ink Slime in the world (the game builds them: the tools do not import the enemies, which keeps their chunk small). */
  spawn: { dummy(x: number, y: number, facing: 1 | -1): void; slime(x: number, y: number, facing: 1 | -1): void };
}

/**
 * The developer panel, the collision overlay and the debug actions (docs/ARCHITECTURE-2D.md §10). It is a TOOL, not part of the
 * game: it lives in its own module so the game fetches its code only when it is asked for (`?debug=1`, or the backquote key in a
 * development build) and a player's first load does not carry it (docs/PROMPT5-LOG.md S17: it paid for the bundle budget of the
 * interface). Deleting it changes nothing else.
 */
export class DevTools {
  private readonly store = new DisposableStore();
  private readonly panel: DebugPanel;
  private colliders: ColliderOverlay2D | null = null;

  constructor(
    private readonly host: DevToolsHost,
    ui: HTMLElement,
  ) {
    this.registerActions();
    const s = host.session;
    const p = s.player;
    this.panel = new DebugPanel(ui, {
      state: host.debug,
      actions: host.actions,
      fps: host.fps,
      step: () => host.step(),
      readout: () => {
        const b = p.body;
        const c = p.controller;
        const vp = host.renderer.viewport;
        return [
          `room   ${s.room.id}   tick ${s.now}`,
          `pos    ${b.x.toFixed(2)}, ${b.y.toFixed(2)}`,
          `vel    ${b.vx.toFixed(2)}, ${b.vy.toFixed(2)}`,
          `state  ${c.state}  anim ${p.view.anim}`,
          `ground ${b.grounded ? 'yes' : 'no'}  dash cd ${c.dashCooldown01.toFixed(2)}  hp ${p.health.current}/${p.health.max}`,
          `abil   ${s.abilities.serialize().join(',') || '—'}`,
          `input  ${host.input.device}`,
          `view   ${vp.contentWidth.toFixed(0)}×${vp.contentHeight.toFixed(0)}  ×${vp.resolution.toFixed(2)}  ${vp.ppm.toFixed(1)} px/m  draws ${host.counter.median}`,
        ].join('\n');
      },
      tuning: [{ title: 'movement', target: p.def.movement }],
    });
    this.store.add(() => this.panel.dispose());
    this.store.add(
      host.debug.changed.on('change', ({ key, value }) => {
        if (key === 'colliders') this.setColliders(Boolean(value));
      }),
    );
    this.setColliders(Boolean(host.debug.get('colliders')));
  }

  /** Once per rendered frame. */
  frame(now: number): void {
    this.panel.update(now);
    if (this.host.debug.get('colliders') && this.colliders) this.updateColliders();
  }

  /** A room was (re)built: the overlay draws its solids. */
  setRoom(): void {
    this.colliders?.setRoom(this.host.session.collision);
  }

  dispose(): void {
    this.colliders?.destroy();
    this.colliders = null;
    this.store.dispose();
  }

  // ------------------------------------------------------------------------------------------------ colliders

  /** Bodies (green), hurtboxes (blue) and the hitboxes active in the last tick (magenta). */
  private updateColliders(): void {
    const s = this.host.session;
    const bodies = [s.player.body];
    for (const e of s.entities) if ('body' in e) bodies.push((e as unknown as { body: typeof s.player.body }).body);
    this.colliders?.updateBodies(bodies);
    const hurt: Rect[] = [];
    const scratch: Hurtbox[] = [];
    for (const c of s.combat.all) {
      scratch.length = 0;
      c.collectHurtboxes(scratch);
      for (const h of scratch) hurt.push(h.rect);
    }
    this.colliders?.updateCombat(hurt, s.combat.activeHitboxes.map((h) => h.rect));
  }

  private setColliders(on: boolean): void {
    if (on && !this.colliders) {
      this.colliders = new ColliderOverlay2D(this.host.renderer.layers.debug);
      this.colliders.setRoom(this.host.session.collision);
    } else if (!on && this.colliders) {
      this.colliders.destroy();
      this.colliders = null;
    }
  }

  // --------------------------------------------------------------------------------------------------- actions

  private registerActions(): void {
    const a = this.host.actions;
    const s = this.host.session;
    const add = (group: string, label: string, run: () => void): void => void this.store.add(a.register(group, label, run));
    add('abilities', 'unlock all', () => s.abilities.list().filter((d) => d.implemented).forEach((d) => s.abilities.unlock(d.id)));
    add('abilities', 'lock all', () => s.abilities.list().forEach((d) => s.abilities.lock(d.id)));
    add('player', 'rescue', () => s.rescuePlayer());
    add('combat', 'spawn dummy', () => {
      const p = s.player;
      this.host.spawn.dummy(p.x + p.facing * 3, p.y, -p.facing as 1 | -1);
    });
    add('combat', 'spawn ink slime', () => {
      const p = s.player;
      this.host.spawn.slime(p.x + p.facing * 6, p.y, -p.facing as 1 | -1);
    });
    add('combat', 'heal', () => s.player.health.restore());
    // the player's resources (magic, bottles, cards): the panel can put them in any state
    add('resources', 'refill magic', () => s.magic.restore());
    add('resources', 'spend 30 magic', () => void s.magic.spend(30));
    add('resources', 'give the Spirit Bolt card', () => void s.loadout.acquire('card_spirit_bolt'));
    add('resources', 'take the card off', () => void s.loadout.equip(null));
    add('resources', 'drink a bottle', () => void s.bottles.consume(s.bottles.resolve(-1)));
    add('resources', 'refill bottles', () => s.bottles.refillAll());
    add('resources', 'add a bottle slot', () => void s.bottles.addSlot('energy_bottle'));
    add('combat', 'revive', () => {
      s.player.revive();
      s.rescuePlayer();
    });
    add('room', 'reset room', () => {
      s.loadRoom(s.room.id); // the `room:loaded` event rebuilds the scenery
    });
  }
}
