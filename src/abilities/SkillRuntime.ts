import { secondsToTicks } from '@/core/time';
import type { Magic } from './Magic';
import type { SkillDefinition } from './SkillDefinition';

/** Why a cast cannot start right now (`ok` = it can). */
export type CastCheck = 'ok' | 'noSkill' | 'noMagic' | 'cooldown';

/**
 * What the skills REMEMBER: how long each one still has to wait. Pure state in simulation ticks (the session's resources step
 * advances it, and a hit-stop freezes it with everything else). The decision "can this be cast?" lives here so that the
 * HUD (a dimmed card), the Ability button and the player's cast all ask the same question.
 */
export class SkillRuntime {
  private readonly cooldownLeft = new Map<string, number>();

  constructor(private readonly defs: Readonly<Record<string, SkillDefinition>>) {}

  definition(id: string): SkillDefinition | undefined {
    return this.defs[id];
  }

  /** Can `skillId` be cast now with this magic? Order of reasons: unknown skill → cooldown → not enough magic. */
  check(skillId: string, magic: Magic): CastCheck {
    const def = this.defs[skillId];
    if (!def) return 'noSkill';
    if ((this.cooldownLeft.get(skillId) ?? 0) > 0) return 'cooldown';
    return magic.canSpend(def.cost) ? 'ok' : 'noMagic';
  }

  /** The skill was released: it has to wait its cooldown. */
  startCooldown(skillId: string): void {
    const def = this.defs[skillId];
    if (def) this.cooldownLeft.set(skillId, secondsToTicks(def.cooldown));
  }

  /** 0 = ready … 1 = just released (the radial sweep of the HUD card). */
  cooldown01(skillId: string): number {
    const def = this.defs[skillId];
    const total = def ? secondsToTicks(def.cooldown) : 0;
    return total > 0 ? Math.min(1, (this.cooldownLeft.get(skillId) ?? 0) / total) : 0;
  }

  /** Ticks left before `skillId` can be cast again. */
  ticksLeft(skillId: string): number {
    return this.cooldownLeft.get(skillId) ?? 0;
  }

  /** One simulation tick of every cooldown. */
  tick(): void {
    for (const [id, left] of this.cooldownLeft) {
      if (left <= 1) this.cooldownLeft.delete(id);
      else this.cooldownLeft.set(id, left - 1);
    }
  }

  /** A fresh start (the player respawns): no skill is cooling down. */
  reset(): void {
    this.cooldownLeft.clear();
  }
}
