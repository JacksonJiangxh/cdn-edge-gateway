import { readFileSync, writeFileSync } from 'fs';
const src = readFileSync('web/app.js.bak', 'utf8').split('\n');
const line = (n) => src[n - 1];

// conditions.js: 含顶部常量(1015-1083) + conditionRow(1084-1198) + conditionsEditor(1199-1254) + normalizeMatchForEditor(1853-1879)
let cond = '// conditionsEditor / conditionRow / normalizeMatchForEditor（含顶层常量）\n';
for (let i = 1015; i <= 1254; i++) cond += line(i) + '\n';
for (let i = 1853; i <= 1879; i++) cond += line(i) + '\n';
writeFileSync('web/app/rule-editor/conditions.js', cond);

// status.js: 含顶部常量(1271-1282) + 原有(1283-1546) + stringListEditor(1547-1575 之前漏的也要重加)
// 重新完整提取 1271-1575
let st = '// statusQuickPick / statusTtlEditor / statusPatternListEditor / stripRuleEditor / stringListEditor（含顶层常量）\n';
for (let i = 1271; i <= 1575; i++) st += line(i) + '\n';
writeFileSync('web/app/rule-editor/status.js', st);

console.log('re-extracted conditions.js + status.js with top-level consts');
