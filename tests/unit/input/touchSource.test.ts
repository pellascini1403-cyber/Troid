import { describe, expect, it } from 'vitest';
import { TouchRig } from '../../helpers/touch';

/**
 * TouchSource: the owner of every finger (docs/GAME-SPEC-2D.md §4.3.7). The combinations that must work are the ones the
 * spec lists: move + attack, move + dash, move + ability, attack + dash, dash + ability, move + jump + attack.
 */
const ZONE = { x: 120, y: 300 };

describe('touch buttons and the movement zone are independent', () => {
  it('move + attack: running while the attack is held, and each lets go on its own', () => {
    const rig = new TouchRig();
    const move = rig.finger(1).down('zone', ZONE.x, ZONE.y);
    const attack = rig.finger(2).down('attack', 700, 340);
    let f = rig.frame(); // the tick that follows the press sees the edge...
    expect([f.attackPressed, f.attackHeld]).toEqual([true, true]);
    move.drag(56, 0, 3); // ...and the run goes on while the button stays held (each drag step is a tick)
    f = rig.frame();
    expect([f.move.x, f.attackPressed, f.attackHeld]).toEqual([1, false, true]);
    attack.up();
    f = rig.frame();
    expect(f.attackHeld).toBe(false);
    expect(f.move.x).toBe(1); // the run did not notice
    move.up();
    expect(rig.frame().move.x).toBe(0);
  });

  it('move + dash and move + ability (the ability only arrives as an action: what it does is the card\'s business)', () => {
    const rig = new TouchRig();
    const move = rig.finger(1).down('zone', ZONE.x, ZONE.y).drag(56, 0, 2);
    const dash = rig.finger(2).down('dash', 650, 350);
    let f = rig.frame();
    expect([f.move.x, f.dashPressed, f.dashHeld]).toEqual([1, true, true]);
    const ability = rig.finger(3).down('ability', 640, 250);
    f = rig.frame();
    expect([f.move.x, f.dashPressed, f.dashHeld, f.abilityPressed, f.abilityHeld]).toEqual([1, false, true, true, true]);
    dash.up();
    f = rig.frame();
    expect([f.move.x, f.dashHeld, f.abilityHeld]).toEqual([1, false, true]);
    ability.up();
    move.up();
    f = rig.frame();
    expect([f.move.x, f.abilityHeld]).toEqual([0, false]);
  });

  it('attack + dash, dash + ability and attack + ability held together never interfere', () => {
    const rig = new TouchRig();
    const attack = rig.finger(1).down('attack', 700, 340);
    const dash = rig.finger(2).down('dash', 650, 350);
    let f = rig.frame();
    expect([f.attackHeld, f.dashHeld, f.abilityHeld]).toEqual([true, true, false]);
    attack.up();
    const ability = rig.finger(3).down('ability', 640, 250);
    f = rig.frame();
    expect([f.attackHeld, f.dashHeld, f.abilityHeld]).toEqual([false, true, true]);
    dash.up();
    f = rig.frame();
    expect([f.attackHeld, f.dashHeld, f.abilityHeld]).toEqual([false, false, true]);
    ability.up();
    expect(rig.frame().abilityHeld).toBe(false);
  });

  it('move + jump + attack: the same finger runs and jumps while another one attacks', () => {
    const rig = new TouchRig();
    const move = rig.finger(1).down('zone', ZONE.x, ZONE.y);
    const attack = rig.finger(2).down('attack', 700, 340);
    move.drag(56, -30, 3);
    const f = rig.frame();
    expect([f.move.x, f.jumpPressed, f.jumpHeld, f.attackHeld]).toEqual([1, true, true, true]);
    attack.up();
    move.up();
  });

  it('a short tap of a button between two ticks still delivers one press (latched), and one release', () => {
    const rig = new TouchRig();
    const tap = rig.finger(1).down('dash', 650, 350);
    tap.up();
    const f = rig.frame();
    expect(f.dashPressed).toBe(true);
    expect(f.dashHeld).toBe(false);
    expect(rig.frame().dashPressed).toBe(false);
  });
});

describe('single ownership of a finger', () => {
  it('a finger cannot change owner: touching a button with a finger that already owns the zone is ignored', () => {
    const rig = new TouchRig();
    expect(rig.touch.down(1, 'zone', 120, 300, 0)).toBe(true);
    expect(rig.touch.down(1, 'attack', 700, 340, 10)).toBe(false);
    expect(rig.touch.ownerOf(1)).toBe('zone');
    expect(rig.frame().attackHeld).toBe(false);
  });

  it('...and the other way round: a button finger that wanders into the zone is still only a button', () => {
    const rig = new TouchRig();
    const attack = rig.finger(1).down('attack', 700, 340);
    attack.to(120, 300).to(176, 300); // slid all the way over the movement zone
    const f = rig.frame();
    expect(f.attackHeld).toBe(true);
    expect(f.move.x).toBe(0);
    expect(rig.touch.ownerOf(1)).toBe('attack');
  });

  it('a button keeps its press however far the finger drifts, until it lifts', () => {
    const rig = new TouchRig();
    const dash = rig.finger(1).down('dash', 650, 350);
    dash.to(10, 10);
    expect(rig.frame().dashHeld).toBe(true);
    dash.up();
    expect(rig.frame().dashHeld).toBe(false);
  });

  it('a second finger on a button that is already held is ignored: it neither presses again nor steals the release', () => {
    const rig = new TouchRig();
    rig.finger(1).down('attack', 700, 340);
    expect(rig.frame().attackPressed).toBe(true);
    expect(rig.touch.down(2, 'attack', 705, 345, 20)).toBe(false);
    rig.finger(2).up(); // the ignored finger lifts: nothing happens
    expect(rig.frame().attackHeld).toBe(true);
    rig.finger(1).up();
    expect(rig.frame().attackHeld).toBe(false);
  });

  it('a second finger in the zone is ignored while the first moves; the first one keeps its run', () => {
    const rig = new TouchRig();
    const a = rig.finger(1).down('zone', 120, 300).drag(56, 0, 2);
    const b = rig.finger(2).down('zone', 60, 200);
    b.drag(-100, 0, 2);
    expect(rig.frame().move.x).toBe(1);
    expect(rig.touch.active).toBe(1);
    a.up();
    expect(rig.frame().move.x).toBe(0);
  });

  it('moves and releases of a pointer nobody owns are harmless', () => {
    const rig = new TouchRig();
    rig.touch.move(9, 1, 1, 0);
    rig.touch.up(9);
    rig.touch.cancel(9);
    expect(rig.touch.active).toBe(0);
    expect(rig.frame().move.x).toBe(0);
  });
});

describe('cancellation: nothing may stay stuck', () => {
  it('pointercancel on the movement finger stops the run and releases the jump', () => {
    const rig = new TouchRig();
    const move = rig.finger(1).down('zone', ZONE.x, ZONE.y).drag(56, -30, 3);
    expect(rig.frame().jumpHeld).toBe(true);
    move.cancel();
    const f = rig.frame();
    expect([f.move.x, f.move.y, f.jumpHeld, f.jumpReleased]).toEqual([0, 0, false, true]);
    expect(rig.touch.active).toBe(0);
  });

  it('pointercancel on a button releases just that button', () => {
    const rig = new TouchRig();
    rig.finger(1).down('zone', ZONE.x, ZONE.y).drag(56, 0, 2);
    const attack = rig.finger(2).down('attack', 700, 340);
    attack.cancel();
    const f = rig.frame();
    expect([f.attackHeld, f.move.x]).toEqual([false, 1]);
  });

  it('releaseAll (blur, the app hidden, a rotation, a pause) lets go of every finger at once', () => {
    const rig = new TouchRig();
    rig.finger(1).down('zone', ZONE.x, ZONE.y).drag(56, -30, 3);
    rig.finger(2).down('attack', 700, 340);
    rig.finger(3).down('dash', 650, 350);
    rig.frame();
    rig.touch.releaseAll();
    const f = rig.frame();
    expect([f.move.x, f.move.y, f.jumpHeld, f.attackHeld, f.dashHeld]).toEqual([0, 0, false, false, false]);
    expect(rig.touch.active).toBe(0);
    // and the zone and the buttons are free again
    expect(rig.touch.down(1, 'zone', 100, 100, 0)).toBe(true);
    expect(rig.touch.down(2, 'attack', 700, 340, 0)).toBe(true);
  });
});

describe('gestures reach the frame as the contract says', () => {
  it('jump gesture: pressed on the crossing, held while up, released when it comes back; the device is touch', () => {
    const rig = new TouchRig();
    const move = rig.finger(1).down('zone', ZONE.x, ZONE.y);
    move.drag(0, -30, 2);
    let f = rig.frame();
    expect([f.jumpPressed, f.jumpHeld, f.jumpReleased, f.device]).toEqual([true, true, false, 'touch']);
    f = rig.frame();
    expect([f.jumpPressed, f.jumpHeld]).toEqual([false, true]);
    move.drag(0, 25, 2); // back down
    f = rig.frame();
    expect([f.jumpHeld, f.jumpReleased]).toEqual([false, true]);
  });

  it('crouch gesture: the vertical axis is passed as it is (−0.7) even while running at full speed', () => {
    const rig = new TouchRig();
    rig.finger(1).down('zone', ZONE.x, ZONE.y).drag(56, 31, 3);
    const f = rig.frame();
    expect(f.move.x).toBe(1);
    expect(f.move.y).toBeCloseTo(-31 / 44, 9);
    expect(f.move.y).toBeLessThanOrEqual(-0.6);
  });

  it('drop gesture: a flick down becomes a dropPressed edge, exactly once', () => {
    const rig = new TouchRig();
    rig.finger(1).down('zone', ZONE.x, ZONE.y).drag(0, 34, 3); // 34 dp in 50 ms
    expect(rig.frame().dropPressed).toBe(true);
    expect(rig.frame().dropPressed).toBe(false);
  });

  it('a slow drag down is a crouch, never a drop', () => {
    const rig = new TouchRig();
    rig.finger(1).down('zone', ZONE.x, ZONE.y).drag(0, 34, 30); // half a second
    expect(rig.frame().dropPressed).toBe(false);
  });
});

describe('contextual icons: interact and bottles', () => {
  it('tapping the interaction icon is an interact press', () => {
    const rig = new TouchRig();
    const icon = rig.finger(1).down('interact', 400, 200);
    expect(rig.frame().interactPressed).toBe(true);
    icon.up();
    expect(rig.frame().interactPressed).toBe(false);
  });

  it('the contextual chip drinks the next ready bottle; a HUD icon drinks its own slot', () => {
    const rig = new TouchRig();
    rig.finger(1).down('bottle', 760, 190).up();
    let f = rig.frame();
    expect([f.bottlePressed, f.bottleSlot]).toEqual([true, -1]);
    rig.finger(2).down('bottle:2', 60, 80).up();
    f = rig.frame();
    expect([f.bottlePressed, f.bottleSlot]).toEqual([true, 2]);
    expect(rig.frame().bottlePressed).toBe(false);
  });

  it('the icons work with the movement finger down at the same time (running and drinking)', () => {
    const rig = new TouchRig();
    rig.finger(1).down('zone', ZONE.x, ZONE.y).drag(56, 0, 2);
    rig.finger(2).down('bottle', 760, 190).up();
    const f = rig.frame();
    expect([f.move.x, f.bottlePressed]).toEqual([1, true]);
  });
});
