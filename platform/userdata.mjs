/* Where each visitor's files live in public mode: one folder per identity,

     <data root>/users/<id>/documents   saved Markdown
                           /workspace   uploaded component kits
                           /uploads     files waiting to be converted
                           /state.json  last-used kit, recent Figma frames

   so no visitor can list, read or overwrite another's files. Folders untouched
   for ILOVEMD_USER_DATA_DAYS are swept, which keeps disk use bounded without
   accounts. Moving to object storage later means changing this module and
   the handful of fs calls that take these paths - the routes stay put. */

import fs from 'node:fs';
import path from 'node:path';
import { ID_RE } from './identity.mjs';

const TOUCH_EVERY_MS = 60 * 60 * 1000;

export function createUserData({ root, ttlDays }) {
  const usersDir = path.join(root, 'users');
  const lastTouch = new Map();

  function spaceFor(id) {
    if (!ID_RE.test(id)) throw new Error('bad identity');
    const base = path.join(usersDir, id);
    return {
      base,
      docsDir: path.join(base, 'documents'),
      workspaceDir: path.join(base, 'workspace'),
      uploadsDir: path.join(base, 'uploads'),
      stateFile: path.join(base, 'state.json'),
    };
  }

  // Marks a visitor as active, at most once an hour per process.
  function touch(id) {
    const now = Date.now();
    if (now - (lastTouch.get(id) || 0) < TOUCH_EVERY_MS) return;
    lastTouch.set(id, now);
    const { base } = spaceFor(id);
    fs.mkdirSync(base, { recursive: true });
    fs.writeFileSync(path.join(base, '.seen'), String(now));
  }

  function sweep() {
    const cutoff = Date.now() - ttlDays * 864e5;
    let removed = 0;
    let entries = [];
    try { entries = fs.readdirSync(usersDir, { withFileTypes: true }); } catch (e) { return 0; }
    for (const d of entries) {
      if (!d.isDirectory() || !ID_RE.test(d.name)) continue;
      const base = path.join(usersDir, d.name);
      let seen = 0;
      try { seen = fs.statSync(path.join(base, '.seen')).mtimeMs; } catch (e) { /* never touched */ }
      if (seen < cutoff) {
        fs.rmSync(base, { recursive: true, force: true });
        lastTouch.delete(d.name);
        removed++;
      }
    }
    return removed;
  }

  return { usersDir, spaceFor, touch, sweep };
}
