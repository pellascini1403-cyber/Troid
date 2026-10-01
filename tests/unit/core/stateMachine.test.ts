import { describe, expect, it } from 'vitest';
import { StateMachine, type StateHooks } from '@/core/stateMachine';

type Id = 'idle' | 'attack' | 'recover';
interface Ctx {
  log: string[];
}

function make(extra: Partial<Record<Id, StateHooks<Ctx, Id>>> = {}) {
  const ctx: Ctx = { log: [] };
  const hooks = (name: Id): StateHooks<Ctx, Id> => ({
    enter: (c, from) => c.log.push(`enter:${name}<-${from}`),
    exit: (c, to) => c.log.push(`exit:${name}->${to}`),
    ...extra[name],
  });
  const fsm = new StateMachine<Ctx, Id>(ctx, { idle: hooks('idle'), attack: hooks('attack'), recover: hooks('recover') }, 'idle');
  return { ctx, fsm };
}

describe('StateMachine', () => {
  it('runs enter of the initial state and exit→enter in order on transitions', () => {
    const { ctx, fsm } = make();
    fsm.go('attack');
    expect(ctx.log).toEqual(['enter:idle<-null', 'exit:idle->attack', 'enter:attack<-idle']);
    expect(fsm.current).toBe('attack');
    expect(fsm.previous).toBe('idle');
  });

  it('ignores go(current) unless forced', () => {
    const { ctx, fsm } = make();
    fsm.go('idle');
    expect(ctx.log).toEqual(['enter:idle<-null']);
    fsm.go('idle', true);
    expect(ctx.log).toEqual(['enter:idle<-null', 'exit:idle->idle', 'enter:idle<-idle']);
  });

  it('ticksInState is 0 on the first update and counts up', () => {
    const seen: number[] = [];
    const { fsm } = make({ idle: { update: (_c, t) => void seen.push(t) } });
    fsm.update();
    fsm.update();
    fsm.update();
    expect(seen).toEqual([0, 1, 2]);
    expect(fsm.ticksInState).toBe(3);
  });

  it('defers a transition requested inside update until the hook returns', () => {
    const trace: string[] = [];
    const { fsm } = make({
      idle: {
        update: () => {
          fsm.go('attack');
          trace.push(`still:${fsm.current}`); // the state that started the update is still current
        },
      },
    });
    fsm.update();
    expect(trace).toEqual(['still:idle']);
    expect(fsm.current).toBe('attack');
    expect(fsm.ticksInState).toBe(0); // new state's first update sees 0
  });

  it('resolves chained transitions requested from enter hooks, in order', () => {
    const order: string[] = [];
    const { fsm } = make({
      attack: { enter: () => (order.push('enter:attack'), fsm.go('recover')) },
      recover: { enter: () => order.push('enter:recover') },
    });
    fsm.go('attack');
    expect(order).toEqual(['enter:attack', 'enter:recover']);
    expect(fsm.current).toBe('recover');
    expect(fsm.previous).toBe('attack');
  });

  it('an A→B→A chain inside one update restarts ticksInState (no off-by-one)', () => {
    type S = 'a' | 'b';
    const ctx: Ctx = { log: [] };
    let bounced = false;
    let fsm!: StateMachine<Ctx, S>;
    fsm = new StateMachine<Ctx, S>(
      ctx,
      {
        a: {
          update: () => {
            if (bounced) return;
            bounced = true;
            fsm.go('b');
          },
        },
        b: { enter: () => fsm.go('a') }, // bounces straight back
      },
      'a',
    );
    fsm.update();
    expect(fsm.current).toBe('a');
    expect(fsm.ticksInState).toBe(0); // a fresh entry into 'a', not 1
  });

  it('breaks infinite transition loops instead of hanging', () => {
    const ctx: Ctx = { log: [] };
    let fsm!: StateMachine<Ctx, 'a' | 'b'>;
    fsm = new StateMachine<Ctx, 'a' | 'b'>(
      ctx,
      {
        a: { enter: () => fsm?.go('b') },
        b: { enter: () => fsm?.go('a') },
      },
      'a',
    );
    // Reaching here (no hang) is the assertion; also verify it is still usable.
    expect(['a', 'b']).toContain(fsm.current);
  });

  it('onChange fires once per transition', () => {
    const { fsm } = make();
    const changes: string[] = [];
    fsm.onChange = (from, to) => changes.push(`${from}->${to}`);
    fsm.go('attack');
    fsm.go('recover');
    expect(changes).toEqual(['idle->attack', 'attack->recover']);
  });
});
