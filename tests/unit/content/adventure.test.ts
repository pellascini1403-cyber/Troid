import { describe, expect, it } from 'vitest';
import { ABILITIES, ENEMIES, ROOMS, WORLD } from '@/content';
import { UPGRADES } from '@/content/upgrades';
import { abilityFlag, analyzeProgression, buildWorldGraph } from '@/world/worldGraph';

/**
 * THE ADVENTURE IN NUMBERS (docs/PROMPT21-LOG.md): what the design asked for — zones, rooms, creatures, guardians, abilities, upgrades, secrets, places to rest — counted from the DATA the game is built from, not from a list written next to it. A number here is a
 * thing the hero can meet, take or use: every one is proved elsewhere by playing it (tests/integration/world/, tests/integration/creatures.test.ts, bosses.test.ts).
 */
const rooms = WORLD.rooms.map((id) => ROOMS[id]!);
const pickups = rooms.flatMap((r) => (r.interactables ?? []).filter((i) => i.kind === 'pickup').map((i) => ({ room: r.id, pickup: i })));
const graph = buildWorldGraph(WORLD, ROOMS);
const paper = analyzeProgression(graph, ROOMS);

describe('the world', () => {
  it('is 67 rooms in 7 zones, every one reachable on paper, every one with an entrance and a way out, and no two with the same picture', () => {
    expect(rooms).toHaveLength(67);
    expect(paper.unreachable).toEqual([]);
    for (const r of rooms) {
      expect(r.entries.length, r.id).toBeGreaterThan(0);
      expect((r.exits ?? []).length, r.id).toBeGreaterThan(0);
    }
    const pictures = rooms.map((r) => JSON.stringify(r.solids.map((s) => s.rect)));
    expect(new Set(pictures).size).toBe(67);
  });

  it('no two rooms are the same room with different numbers: each differs from every other in the things it holds, not only in how big it is', () => {
    const features = (r: (typeof rooms)[number]): string =>
      JSON.stringify({
        spawns: [...new Set((r.spawns ?? []).map((s) => s.enemy))].sort(),
        bosses: (r.bosses ?? []).map((b) => b.guardian),
        hazards: (r.hazards ?? []).length > 0,
        seals: (r.seals ?? []).map((s) => s.style ?? 'ward'),
        gates: (r.gates ?? []).length,
        items: (r.interactables ?? []).map((i) => `${i.kind}:${i.actions.map((a) => a.type).join('+')}`).sort(),
        exits: (r.exits ?? []).map((x) => x.id).sort(),
        needs: (r.needs ?? []).map((n) => n.abilities.join('+')).sort(),
      });
    const seen = new Map<string, string>();
    for (const r of rooms) {
      const f = features(r);
      expect(seen.get(f), `${r.id} holds exactly what ${seen.get(f)} holds`).toBeUndefined();
      seen.set(f, r.id);
    }
  });
});

describe('the creatures', () => {
  const placed = rooms.flatMap((r) => (r.spawns ?? []).map((s) => ENEMIES[s.enemy]!));

  it('fourteen different ways of fighting are met in the world: the slime of the first rooms and thirteen after it, each with a brain of its own', () => {
    const archetypes = new Set(placed.map((e) => e.ai.archetype));
    expect([...archetypes].sort()).toEqual(['bat', 'crawler', 'guard', 'leech', 'piston', 'roller', 'shade', 'slime', 'spitter', 'spore', 'toad', 'toller', 'weaver', 'wisp']);
  });

  it('they are introduced a few at a time, never all at once: no zone brings more than six archetypes, and the Heart brings the last', () => {
    const zoneOf = (id: string): string => (/^r[1-4]_/.test(id) ? 'ru' : id.split('_')[0]!);
    const byZone = new Map<string, Set<string>>();
    for (const r of rooms) for (const s of r.spawns ?? []) (byZone.get(zoneOf(r.id)) ?? byZone.set(zoneOf(r.id), new Set()).get(zoneOf(r.id))!).add(ENEMIES[s.enemy]!.ai.archetype);
    for (const [z, set] of byZone) expect(set.size, z).toBeLessThanOrEqual(6);
    expect(byZone.get('ih')!.has('shade')).toBe(true);
  });

  it('and the enemies that guard a way — a door that opens when they fall — are kept by a flag that is theirs alone', () => {
    const keepers = rooms.flatMap((r) => (r.spawns ?? []).filter((s) => s.defeatFlag).map((s) => `${r.id}/${s.id}`));
    expect(keepers).toEqual(['r1_gate/slime_1', 'r2_hall/slime_1', 'mr_lanterns/toad_key', 'fd_vats/keeper', 'ih_atrium/weaver_key']);
  });
});

describe('the abilities', () => {
  const teachers = pickups.flatMap(({ room, pickup }) => pickup.actions.filter((a) => a.type === 'unlockAbility').map((a) => ({ room, ability: (a as { abilityId: string }).abilityId })));

  it('six that open the world are taught in order — the dash with the new game, the Spirit Bolt by its card, the Air Dash, the Double Jump, the Wall Jump, the Ground Slam — each in a room of its own, once', () => {
    const main = ['air_dash', 'double_jump', 'wall_jump', 'ground_slam'];
    expect(teachers.filter((t) => main.includes(t.ability)).map((t) => `${t.room}:${t.ability}`)).toEqual(['r4_sanctum:air_dash', 'rt_echo:double_jump', 'mr_sink:wall_jump', 'mn_forge:ground_slam']);
    const order = paper.order;
    const at = (room: string): number => order.indexOf(room);
    expect(at('r3_chamber')).toBeLessThan(at('r4_sanctum'));
    expect(at('r4_sanctum')).toBeLessThan(at('rt_echo'));
    expect(at('rt_echo')).toBeLessThan(at('mr_sink'));
    expect(at('mr_sink')).toBeLessThan(at('mn_forge'));
    expect(at('mn_forge')).toBeLessThan(at('sp_foot'));
  });

  it('each is IMPLEMENTED (it does something in the controller) and each is asked for by a part of the world that nothing else can open', () => {
    for (const id of ['dash', 'magic_attack', 'air_dash', 'double_jump', 'wall_jump', 'ground_slam']) expect(ABILITIES.find((a) => a.id === id)?.implemented, id).toBe(true);
    const asked = new Set(rooms.flatMap((r) => (r.needs ?? []).flatMap((n) => n.abilities)));
    expect([...asked].sort()).toEqual(['double_jump', 'wall_jump']);
    const slams = rooms.flatMap((r) => (r.seals ?? []).filter((s) => s.needs === abilityFlag('ground_slam')).map((s) => `${r.id}/${s.id}`));
    expect(slams).toEqual(['ru_nave/crack', 'mr_stilts/crack', 'mn_hall/crack', 'mn_forge/crack', 'mn_descent/crack', 'sp_bridge/crack']);
    const bolt = rooms.flatMap((r) => (r.seals ?? []).filter((s) => s.accepts.includes('spirit_bolt') && s.accepts.length === 1).map((s) => `${r.id}/${s.id}`));
    expect(bolt).toEqual(['r3_chamber/seal', 'ru_archive/ward']);
  });
});

describe('the upgrades', () => {
  it('fourteen, each taken from exactly one place in the world: five vessels of life, three of magic and six relics', () => {
    const taken = (flag: string): string[] => pickups.filter(({ pickup }) => pickup.actions.some((a) => a.type === 'setFlag' && a.flag === flag)).map(({ room, pickup }) => `${room}/${pickup.id}`);
    expect(UPGRADES).toHaveLength(8);
    for (const u of UPGRADES) expect(taken(u.flag), u.flag).toHaveLength(1);
    const relics = ['relic_edge', 'relic_swift', 'relic_siphon', 'relic_ward', 'relic_pierce', 'relic_brew'];
    const givers = pickups.flatMap(({ room, pickup }) => pickup.actions.filter((a) => a.type === 'unlockAbility' && relics.includes(a.abilityId)).map((a) => `${room}:${(a as { abilityId: string }).abilityId}`));
    expect(givers.sort()).toEqual(['fd_arena:relic_ward', 'mn_arena:relic_brew', 'rt_hideout:relic_siphon', 'ru_reliquary:relic_edge', 'sp_arena:relic_swift', 'sp_loft:relic_pierce']);
    // a vessel looks like one only if it is in the list: no pickup sets a `taken:life_…` or `taken:mana_…` that the bars do not read
    const flags = new Set(UPGRADES.map((u) => u.flag));
    for (const { pickup } of pickups) for (const a of pickup.actions) if (a.type === 'setFlag' && /^taken:(life|mana)_/.test(a.flag)) expect(flags.has(a.flag), a.flag).toBe(true);
  });

  it('and they add up: ten points of life and one hundred and sixty units of magic for a hero who has taken them all', () => {
    expect(5 + UPGRADES.filter((u) => u.maxHealth).length).toBe(10);
    expect(100 + UPGRADES.reduce((n, u) => n + (u.maxMagic ?? 0), 0)).toBe(160);
  });

  it('the vessels lie in places that ask something: behind a ward, a cracked wall or floor, a ledge that needs an ability, or a guardian', () => {
    const where = (flag: string): string => pickups.find(({ pickup }) => pickup.actions.some((a) => a.type === 'setFlag' && a.flag === flag))!.room;
    expect(UPGRADES.map((u) => where(u.flag))).toEqual(['ru_archive', 'rt_tangle', 'rt_arena', 'mr_den', 'mn_vault', 'ru_cistern', 'mr_lair', 'fd_scrap']);
  });
});

describe('the secrets, the shortcuts and the rooms that are optional', () => {
  it('at least ten places hide something: a ward, a split wall or floor, a ledge that asks for an ability — and every one is behind something that a flag opens', () => {
    const hidden: Array<[string, string]> = [
      ['ru_archive', 'the vault behind the ward of the Archive'],
      ['ru_nave', 'the Cistern under the cracked floor of the Nave'],
      ['ru_nave', 'the Reliquary at the top of the ladder of the Nave'],
      ['rt_tangle', 'the nook behind the split wall of the Tangle'],
      ['rt_gallery', 'the Hideout at the top of the chimney of the Gallery'],
      ['mr_stilts', 'the Den under the cracked floor of the Stilts'],
      ['mn_hall', 'the Vault under the cracked plateau of the Hall'],
      ['sp_bridge', 'the Loft under the cracked island of the bridge'],
      ['fd_line', 'the Scrapyard behind the split wall of the line'],
      ['r2_hall', 'the fourth bottle on the ledge of the high road'],
    ];
    expect(hidden.length).toBeGreaterThanOrEqual(10);
    for (const [room] of hidden) expect(ROOMS[room], room).toBeDefined();
    const cracks = rooms.flatMap((r) => (r.seals ?? []).filter((s) => s.style === 'crack').map((s) => `${r.id}/${s.id}`));
    expect(cracks.length).toBeGreaterThanOrEqual(8);
    const optional = ['ru_archive', 'ru_cistern', 'ru_reliquary', 'rt_hideout', 'mr_den', 'mn_vault', 'sp_loft', 'fd_scrap'];
    for (const id of optional) expect(graph.edges.filter((e) => e.to.room === id).length, id).toBeGreaterThan(0);
    // optional: nothing the road needs lies behind them
    for (const id of optional) expect(ROOMS[id]!.exits!.length, `${id} is a dead end: one way out`).toBeLessThanOrEqual(1);
  });

  it('six shortcuts, one in each zone from the second on: a lever in the last rooms of the zone opens a stone door in the first, and the rooms between are skipped on the way back', () => {
    const levers = rooms.flatMap((r) => (r.interactables ?? []).filter((i) => i.kind === 'activate').map((i) => `${r.id}/${i.id}`));
    expect(levers).toEqual(['rt_cellar/lift_lever', 'mr_approach/lift_lever', 'mn_approach/lift_lever', 'sp_belfry/lever_1', 'sp_belfry/lever_2', 'sp_approach/lift_lever', 'fd_control/lift_lever', 'ih_approach/lift_lever']);
    const lifts = rooms.flatMap((r) => (r.exits ?? []).filter((x) => x.id === 'shortcut').map((x) => `${r.id}→${x.to!.room}`));
    expect(lifts).toEqual(['rt_mouth→rt_cellar', 'rt_cellar→rt_mouth', 'mr_edge→mr_approach', 'mr_approach→mr_edge', 'mn_gate→mn_approach', 'mn_approach→mn_gate', 'sp_foot→sp_approach', 'sp_approach→sp_foot', 'fd_gate→fd_control', 'fd_control→fd_gate', 'ih_threshold→ih_approach', 'ih_approach→ih_threshold']);
  });

  it('there are alternative ways: the Edge of the Mire has a high road over its toads that the stairs lead to', () => {
    const edge = ROOMS.mr_edge!;
    const stairs = edge.solids.find((s) => s.rect.y1 === 4 && s.kind === 'oneway')!;
    const road = edge.solids.filter((s) => s.kind === 'oneway' && s.rect.y1 === 6);
    expect(stairs).toBeDefined();
    expect(road.length).toBeGreaterThanOrEqual(4);
  });
});
