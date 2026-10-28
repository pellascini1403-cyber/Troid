import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

/**
 * WHAT THE FIRST FRAME OF THE GAME CARRIES (docs/PROMPT21-LOG.md): the budget of the cold start (`npm run bench:bundle`, 200 KB gz) is about what a hero standing in R1 has to download, and R1 needs nothing of the sixty rooms past the
 * Sanctum, of the thirteen creatures that live in them, of their brains or of the engine of the guardians. They are a chunk of their own (`content/beyond.ts`), asked for once the first frame is up. This test holds the STRUCTURE that
 * makes it so: the modules that the page imports statically from its entry point — the closure of `import`s that are not types and not `import()` — never reach any of them. (Nothing here measures bytes: the bench does, on the real build.)
 */
const SRC = resolve(__dirname, '../../../src');

/** The modules a static `import` / `export … from` (not a type, not `import()`) of this file reaches, as files. */
function staticImports(file: string): string[] {
  const code = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, code, ts.ScriptTarget.ESNext, true);
  const out: string[] = [];
  const resolveSpec = (spec: string): string | null => {
    const base = spec.startsWith('@/') ? resolve(SRC, spec.slice(2)) : spec.startsWith('.') ? resolve(dirname(file), spec) : null;
    if (!base) return null;
    for (const candidate of [`${base}.ts`, `${base}/index.ts`, base]) if (existsSync(candidate) && candidate.endsWith('.ts')) return candidate;
    return null;
  };
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && !st.importClause?.isTypeOnly && ts.isStringLiteral(st.moduleSpecifier)) {
      // `import { type A, type B } from …` carries nothing at run time
      const named = st.importClause?.namedBindings;
      const onlyTypes = st.importClause && !st.importClause.name && named && ts.isNamedImports(named) && named.elements.length > 0 && named.elements.every((e) => e.isTypeOnly);
      if (onlyTypes) continue;
      const r = resolveSpec(st.moduleSpecifier.text);
      if (r) out.push(r);
    } else if (ts.isExportDeclaration(st) && !st.isTypeOnly && st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier)) {
      const r = resolveSpec(st.moduleSpecifier.text);
      if (r) out.push(r);
    }
  }
  return out;
}

function closure(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const f = queue.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    queue.push(...staticImports(f));
  }
  return seen;
}

const rel = (f: string): string => f.slice(SRC.length + 1);

describe('the first frame carries the first chapter and nothing past it', () => {
  const first = closure(resolve(SRC, 'app/main.ts'));
  const names = new Set([...first].map(rel));

  it('the page starts from the core content: the first four rooms, the Ink Slime and the Ink Warden', () => {
    expect(names.has('app/Game2D.ts')).toBe(true);
    for (const must of ['content/core.ts', 'content/rooms/r1Gate.ts', 'content/rooms/r4Sanctum.ts', 'content/inkSlime.ts', 'content/warden.ts', 'enemies/archetypes/index.ts', 'enemies/archetypes/inkSlime.ts', 'enemies/Guardian.ts', 'enemies/boss/registry.ts']) {
      expect(names.has(must), `${must} is in the first frame`).toBe(true);
    }
  });

  it('and not one module of the rest of the world: the sixty rooms, the creatures, the six guardians, the code that runs them and the painter of the rooms', () => {
    const rest = [
      'content/beyond.ts', 'content/index.ts', 'content/enemies.ts', 'content/creatures.ts', 'content/bosses.ts',
      'content/rooms/kit.ts', 'content/rooms/ruins.ts', 'content/rooms/roots.ts', 'content/rooms/mire.ts', 'content/rooms/mines.ts', 'content/rooms/spire.ts', 'content/rooms/foundry.ts', 'content/rooms/heart.ts',
      'enemies/archetypes/all.ts', 'enemies/archetypes/BaseBrain.ts', 'enemies/archetypes/crawler.ts', 'enemies/archetypes/shade.ts', 'enemies/boss/Boss.ts', 'enemies/boss/handlers.ts', 'enemies/boss/engine.ts',
      'world/roomMap.ts', 'world/validateRoom.ts',
    ];
    expect(rest.filter((m) => names.has(m))).toEqual([]);
    for (const m of rest) expect(existsSync(resolve(SRC, m)), `${m} exists (this list is held to the files)`).toBe(true);
  });

  it('the rest of the world is asked for with a dynamic import, in one place', () => {
    const code = readFileSync(resolve(SRC, 'app/beyond.ts'), 'utf8');
    expect(code).toMatch(/import\('@\/content\/beyond'\)/);
    const users = [...first].filter((f) => /loadBeyond/.test(readFileSync(f, 'utf8'))).map(rel).sort();
    expect(users).toEqual(['app/Game2D.ts', 'app/beyond.ts']);
  });
});

describe('the registries: the core is the first chapter, the rest arrives and adds itself', () => {
  it('a fresh content has seven rooms, the slime and the Warden until `beyond` is in — then the whole world', async () => {
    vi.resetModules();
    const core = await import('@/content/core');
    expect(Object.keys(core.ROOMS).sort()).toEqual(['crouch_test', 'interaction_test', 'movement_test', 'r1_gate', 'r2_hall', 'r3_chamber', 'r4_sanctum']);
    expect(Object.keys(core.ENEMIES)).toEqual(['ink_slime']);
    expect(Object.keys(core.BOSSES)).toEqual(['ink_warden']);
    expect(core.inCore('r4_sanctum')).toBe(true);
    expect(core.inCore('ru_nave')).toBe(false);
    expect(core.WORLD.rooms, 'the list of the rooms of the first chapter: the rest of it comes with `beyond`').toEqual(['r1_gate', 'r2_hall', 'r3_chamber', 'r4_sanctum']);
    const { hasBrain } = await import('@/enemies/archetypes');
    expect(hasBrain('slime')).toBe(true);
    expect(hasBrain('crawler'), 'the other thirteen are taught by `beyond`').toBe(false);

    await import('@/content/beyond');
    expect(Object.keys(core.ROOMS)).toHaveLength(7 + 63);
    expect(core.WORLD.rooms, 'and the list of the world is whole').toHaveLength(67);
    for (const id of core.WORLD.rooms) expect(core.ROOMS[id], id).toBeDefined();
    expect(Object.keys(core.ENEMIES), 'fifteen definitions of fourteen archetypes (the shard a shardling breaks into is a slime of its own)').toHaveLength(15);
    expect(Object.keys(core.BOSSES)).toHaveLength(7);
    for (const e of Object.values(core.ENEMIES)) expect(hasBrain(e.ai.archetype), `${e.id}: a brain for "${e.ai.archetype}"`).toBe(true);
    const { createEngineBoss } = await import('@/enemies/boss/registry');
    expect(typeof createEngineBoss).toBe('function');
  });
});
