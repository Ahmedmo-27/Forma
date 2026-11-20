/**
 * Arabic UI strings, keyed by the English source text. Missing keys fall back
 * to English, so screens can be translated incrementally.
 *
 * The dictionary is split per area so each file stays reviewable. Add new
 * strings to the module that matches the screen; a key defined in two modules
 * must have the same Arabic text (enforced by `npm run i18n:check`).
 */
import common from './ar/common.js';
import components from './ar/components.js';
import core from './ar/core.js';
import member from './ar/member.js';
import sales from './ar/sales.js';
import coach from './ar/coach.js';
import owner from './ar/owner.js';
import accounting from './ar/accounting.js';
import retail from './ar/retail.js';
import reports from './ar/reports.js';
import tasks from './ar/tasks.js';
import misc from './ar/misc.js';
import modals from './ar/modals.js';
import sales2 from './ar/sales2.js';
import lib from './ar/lib.js';

export const AR_MODULES = {
  common, components, core, member, sales, coach, owner, accounting, retail, reports, tasks, misc, modals, sales2, lib,
};

const AR = Object.assign({}, ...Object.values(AR_MODULES));

export default AR;
