import { Boss } from './Boss';
import { registerBossEngine } from './registry';

/** Importing this teaches the session to build the data-driven guardians (see `registry.ts`). */
registerBossEngine((id, def, at, arena) => new Boss(id, def, at, arena));
