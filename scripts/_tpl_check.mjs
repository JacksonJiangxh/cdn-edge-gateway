import { applyTemplate } from '../src/config/templates.js';
import { validateSite } from '../src/config/schema.js';

const origins = [{ addr: 'o.example.com', port: 443, scheme: 'https' }];

const rules = applyTemplate('website', { edgeTtl: 600, errorTtl: 10 });
const res = validateSite({ host: 'a.com', origins, rules });
console.log('校验通过:', res.ok, res.errors || '');
for (const r of res.value.rules) {
  const c = r.action.cache;
  console.log(` P${r.priority} | ${r.name} | enabled=${c.enabled} edgeTtl=${c.edgeTtl} browserTtl=${c.browserTtl} statusTtl=${JSON.stringify(c.statusTtl)}`);
  console.log(`      note: ${r.note}`);
}

console.log('\n--- 未显式配置缓存的规则，落到什么默认值 ---');
const bare = validateSite({ host: 'b.com', origins, rules: [{ match: { conditions: [[{ target: 'path', op: 'prefix', values: ['/x'] }]] }, action: {} }] });
console.log(JSON.stringify(bare.value.rules[0].action.cache));
