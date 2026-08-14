import { readFileSync, writeFileSync } from 'fs';
const files = [
  'web/app/ui.js', 'web/app/router.js', 'web/app/util.js', 'web/app/state.js',
  'web/app/rule-editor/conditions.js', 'web/app/rule-editor/status.js', 'web/app/rule-editor/ops.js',
  'web/app/rule-editor/card.js', 'web/app/rule-editor/global.js', 'web/app/rule-editor/shared.js',
  'web/app/views/overview.js', 'web/app/views/sites.js', 'web/app/views/sequence.js',
  'web/app/views/pools.js', 'web/app/views/cache.js', 'web/app/views/system.js',
];
let bad = 0;
for (const f of files) {
  const lines = readFileSync(f, 'utf8').split('\n');
  const out = lines.filter((l) => {
    if (/^\s*import\s+\{[^}]*\}\s+from\s+['"][^'"]+['"];?\s*$/.test(l)) {
      if (!/['"][^'"]*\.js['"]\s*;?\s*$/.test(l)) { bad++; console.log('BAD', f, l.trim()); return false; }
    }
    return true;
  });
  writeFileSync(f, out.join('\n'));
}
console.log('removed bad imports:', bad);
