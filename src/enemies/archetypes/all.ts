import { BatBrain } from './bat';
import { CrawlerBrain } from './crawler';
import { registerBrain } from './index';
import { LeechBrain } from './leech';
import { PistonBrain } from './piston';
import { RollerBrain } from './roller';
import { ShadeBrain } from './shade';
import { SporeBrain } from './spore';
import { SpitterBrain } from './spitter';
import { StonebackBrain } from './stoneback';
import { ToadBrain } from './toad';
import { TollerBrain } from './toller';
import { WeaverBrain } from './weaver';
import { WispBrain } from './wisp';

/**
 * THE THIRTEEN BRAINS AFTER THE INK SLIME'S (docs/PROMPT21-LOG.md): importing this module teaches the game every one of them. It is imported by the creatures that need them (`content/creatures.ts`), so the code and the
 * data it reads are never apart — in the game, in a test, in a tool — and the cold start does not carry either.
 */
registerBrain('crawler', (e, s, p) => new CrawlerBrain(e, s, p));
registerBrain('toad', (e, s, p) => new ToadBrain(e, s, p));
registerBrain('guard', (e, s, p) => new StonebackBrain(e, s, p));
registerBrain('spore', (e, s, p) => new SporeBrain(e, s, p));
registerBrain('spitter', (e, s, p) => new SpitterBrain(e, s, p));
registerBrain('bat', (e, s, p) => new BatBrain(e, s, p));
registerBrain('wisp', (e, s, p) => new WispBrain(e, s, p));
registerBrain('toller', (e, s, p) => new TollerBrain(e, s, p));
registerBrain('roller', (e, s, p) => new RollerBrain(e, s, p));
registerBrain('piston', (e, s, p) => new PistonBrain(e, s, p));
registerBrain('leech', (e, s, p) => new LeechBrain(e, s, p));
registerBrain('weaver', (e, s, p) => new WeaverBrain(e, s, p));
registerBrain('shade', (e, s, p) => new ShadeBrain(e, s, p));
