import { readFileSync, writeFileSync } from 'fs';
// 给 conditions.js / status.js 的所有顶层 const 加 export（这些是模块级共享常量）
for (const f of ['web/app/rule-editor/conditions.js', 'web/app/rule-editor/status.js']) {
  let code = readFileSync(f, 'utf8');
  code = code.replace(/^(\s*)const\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=/gm, (m, ind, name) => {
    if (new RegExp(`export\\s+const\\s+${name}\\b`).test(code)) return m;
    return `${ind}export const ${name} =`;
  });
  writeFileSync(f, code);
  console.log('exported consts in', f);
}
