import { readFileSync, appendFileSync } from 'fs';
const src = readFileSync('web/app.js.bak', 'utf8').split('\n');
const line = (n) => src[n - 1];

// 补充漏提取的函数：conditionsEditor(1199-1254)、stringListEditor(1547-1575)
let cond = '\nexport function conditionsEditor(groups) {\n';
for (let i = 1200; i <= 1254; i++) cond += line(i) + '\n';
cond += '}\n';
appendFileSync('web/app/rule-editor/conditions.js', cond);

let sl = '\nexport function stringListEditor(initial, opts) {\n';
for (let i = 1548; i <= 1575; i++) sl += line(i) + '\n';
sl += '}\n';
appendFileSync('web/app/rule-editor/status.js', sl);

console.log('appended conditionsEditor + stringListEditor');
