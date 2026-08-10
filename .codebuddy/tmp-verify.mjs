import { validatePool, validateSite } from '../src/config/schema.js';

const caps = {};
const o = [{ addr: 'a.example.com', scheme: 'https', port: 443, engine: 'fetch', enabled: true, weight: 1 }];
const o2 = { ...o[0], addr: 'b.example.com' };
const t = (n, v) => console.log((v ? 'PASS' : 'FAIL') + '  ' + n);

let r = validatePool({ name: 'x', kind: 'single', origins: o }, caps);
t('single 合法，策略强制 chain', r.ok && r.value.kind === 'single' && r.value.strategy === 'chain');

r = validatePool({ name: 'x', kind: 'single', strategy: 'roundrobin', origins: o }, caps);
t('single 忽略传入策略', r.ok && r.value.strategy === 'chain');

r = validatePool({ name: 'x', kind: 'single', origins: [o[0], o2] }, caps);
t('single 拒绝多源站', !r.ok);

r = validatePool({ name: 'p', kind: 'pool', strategy: 'roundrobin', origins: [o[0], o2] }, caps);
t('pool 合法且保留策略', r.ok && r.value.kind === 'pool' && r.value.strategy === 'roundrobin');

r = validatePool({ name: 'legacy', origins: o }, caps);
t('kind 缺省回落 single', r.ok && r.value.kind === 'single');

r = validatePool({ name: 's', kind: 'single', origins: o, createdBy: 'Site.COM' }, caps);
t('createdBy 落库并小写', r.ok && r.value.createdBy === 'site.com');

r = validateSite({ host: 'x.com' });
t('站点缺 poolId 被拒', !r.ok && r.errors.join(';').includes('poolId'));

r = validateSite({ host: 'x.com', poolId: 'pl_abc' });
t('站点有 poolId 通过', r.ok && r.value.poolId === 'pl_abc');
t('站点不再产出 origins/originStrategy',
  r.ok && !('origins' in r.value) && !('originStrategy' in r.value) && !('originFailover' in r.value));
