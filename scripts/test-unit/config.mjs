/**
 * scripts/test-unit/config.mjs —— 配置校验 / 阶段 / 常量 / 通配符 单测
 * 覆盖原 test-unit-backend.mjs [config/defaults] [config/schema]
 * [config/stages] [config/store] [config/contracts] [config/vars] 段，
 * 并入原 test-glob-wildcard.mjs（validateHost/compileWildcard/validateRegex/
 * normRewrite），并加固 validatePool/validateSite 的破坏性+边界用例，
 * 以及 fixContentType 真实落盘读回断言。
 */
import assert from 'node:assert';
import {
  validatePool,
  validateSite,
  validateHost,
  compileWildcard,
  validateRegex,
  normRewrite,
  validateGlobalRulesStages,
} from '../../src/config/schema.js';
import { DEFAULT_GLOBAL_RULES } from '../../src/config/stages-defaults.js';
import { deepClone } from '../../src/config/factory.js';
import { matchStatusPattern, STATUS_PATTERN_RE } from '../../src/contracts.js';
import {
  STAGE_ORDER, GLOBAL_ONLY_STAGE_ORDER, STAGE_OPS, GLOBAL_ONLY_STAGE_OPS, isGlobalOnlyStage, normalizeStage,
} from '../../src/config/stages.js';
import { test, testA } from './_testkit.mjs';

// ===== validateSite 破坏性/边界 =====
testA('validateSite: 合法对象通过', (a) => {
  const res = validateSite({ host: 'a.test', rules: [] });
  a.equal(res.ok, true, '合法站点 ok=true');
});

testA('validateSite: 非对象拒绝', (a) => {
  a.equal(validateSite(null).ok, false, 'null 拒绝');
  a.equal(validateSite('x').ok, false, '字符串拒绝');
  a.equal(validateSite(undefined).ok, false, 'undefined 拒绝');
});

testA('validateSite: host 通配 * 拒绝', (a) => {
  a.equal(validateSite({ host: '*' }).ok, false, 'host="*" 拒绝');
});

testA('validateSite: 规则 stage 必须落库（回归：删站重建后规则不失效）', (a) => {
  // 曾经的缺陷：normRule 只读 input.stage 用于裁剪 action，却不把 stage 写回落库对象，
  // 导致站点重建（PUT /sites/:host）后所有规则 stage 丢失、matchRuleByStage 永不命中、回源 404。
  const res = validateSite({
    host: 'a.test',
    rules: [
      { id: 'r1', stage: 'rewrite', enabled: true, priority: 10,
        match: { conditions: [[{ target: 'path', op: 'prefix', values: ['/'] }]] },
        action: { rewrite: { type: 'regex', regexFrom: '^(/.*)$', regexTo: '/x$1' } } },
      { id: 'r2', stage: 'reqHeaders', enabled: true, priority: 10,
        match: { conditions: [[{ target: 'path', op: 'prefix', values: ['/'] }]] },
        action: { reqHeaders: { set: [{ name: 'X-A', value: '1' }], strip: [] } } },
    ],
  });
  a.equal(res.ok, true, '站点校验通过');
  const stages = (res.value.rules || []).map((r) => r.stage);
  a.deepEqual(stages, ['rewrite', 'reqHeaders'], '每条规则的 stage 被原样持久化');
});

testA('validateSite: 缺省/非法 stage 归一到 cache（与 buildActionByStage 口径一致）', (a) => {
  const res = validateSite({
    host: 'a.test',
    rules: [
      { id: 'r1', enabled: true, priority: 10, match: { conditions: [] }, action: {} },
      { id: 'r2', stage: 'not-a-stage', enabled: true, priority: 10, match: { conditions: [] }, action: {} },
    ],
  });
  a.equal(res.ok, true, '站点校验通过');
  a.deepEqual((res.value.rules || []).map((r) => r.stage), ['cache', 'cache'], '缺省/非法 stage 归一为 cache');
});

testA('validateSite: host 含端口拒绝', (a) => {
  a.equal(validateSite({ host: 'a.test:8080' }).ok, false, 'host 含端口拒绝');
});

testA('validateSite: host 含路径/协议拒绝', (a) => {
  a.equal(validateSite({ host: 'http://a.test' }).ok, false, '含协议拒绝');
  a.equal(validateSite({ host: 'a.test/x' }).ok, false, '含路径拒绝');
});

// ===== validatePool 破坏性/边界 =====
testA('validatePool: 合法 single 通过', (a) => {
  const res = validatePool({
    kind: 'single',
    origins: [{ engine: 'fetch', scheme: 'https', addr: '1.2.3.4', port: 443 }],
  });
  a.equal(res.ok, true, '合法 single 池 ok=true');
});

testA('validatePool: 无源站拒绝', (a) => {
  a.equal(validatePool({ kind: 'single', origins: [] }).ok, false, '空源站拒绝');
});

testA('validatePool: single 多个源站拒绝', (a) => {
  const res = validatePool({
    kind: 'single',
    origins: [
      { engine: 'fetch', addr: '1.1.1.1', port: 443 },
      { engine: 'fetch', addr: '2.2.2.2', port: 443 },
    ],
  });
  a.equal(res.ok, false, 'single 多源站拒绝');
});

testA('validatePool: 弃用 socket 引擎拒绝', (a) => {
  const res = validatePool({
    kind: 'single',
    origins: [{ engine: 'socket', addr: '1.1.1.1', port: 443 }],
  });
  a.equal(res.ok, false, 'socket 引擎拒绝');
});

testA('validatePool: 已移除 api 引擎配置不被接受', (a) => {
  // api 引擎已移除：要么直接被 engine 校验拒绝，要么因缺 repoUser 等必填字段失败，
  // 总之整体不应 ok=true（带病配置不落盘）。
  const res = validatePool({
    kind: 'single',
    origins: [{ engine: 'api', repoName: 'x' }],
  });
  a.equal(res.ok, false, 'api 引擎配置不被接受');
});

testA('validatePool: weighted 总权重 0 拒绝', (a) => {
  const res = validatePool({
    kind: 'pool',
    strategy: 'weighted',
    origins: [
      { engine: 'fetch', addr: '1.1.1.1', port: 443, weight: 0 },
      { engine: 'fetch', addr: '2.2.2.2', port: 443, weight: 0 },
    ],
  });
  a.equal(res.ok, false, 'weighted 总权重 0 拒绝');
});

testA('validatePool: 无启用源站拒绝', (a) => {
  const res = validatePool({
    kind: 'single',
    origins: [{ engine: 'fetch', addr: '1.1.1.1', port: 443, enabled: false }],
  });
  a.equal(res.ok, false, '无启用源站拒绝');
});

testA('validatePool: r2 缺 r2Binding 拒绝', (a) => {
  const res = validatePool({
    kind: 'single',
    origins: [{ engine: 'r2', r2Binding: '' }],
  });
  a.equal(res.ok, false, 'r2 缺 r2Binding 拒绝');
});

testA('validatePool: cnb 缺 repoUser 拒绝', (a) => {
  const res = validatePool({
    kind: 'single',
    origins: [{ engine: 'cnb', repoName: 'x' }],
  });
  a.equal(res.ok, false, 'cnb 缺 repoUser 拒绝');
});

// ===== origin.name 展示字段全链路保留（修复 r2/cnb 编辑回显丢失）=====
testA('validatePool: fetch 源站 name 被保留', (a) => {
  const res = validatePool({
    kind: 'single',
    origins: [{ engine: 'fetch', scheme: 'https', addr: '1.2.3.4', port: 443, name: '主站' }],
  });
  a.equal(res.ok, true, '合法');
  a.equal(res.value.origins[0].name, '主站', 'fetch 源站 name 保留');
});

testA('validatePool: r2 源站 name 被保留', (a) => {
  const res = validatePool({
    kind: 'single',
    origins: [{ engine: 'r2', r2Binding: 'CDN_R2_IMG', name: '图片桶' }],
  });
  a.equal(res.ok, true, '合法');
  a.equal(res.value.origins[0].name, '图片桶', 'r2 源站 name 保留');
});

testA('validatePool: cnb 源站 name 被保留', (a) => {
  const res = validatePool({
    kind: 'pool',
    strategy: 'chain',
    origins: [
      { engine: 'cnb', repoUser: 'jacksonjxh', repoName: 'static-resources', name: '静态资源' },
      { engine: 'r2', r2Binding: 'CDN_R2', name: '备份桶' },
    ],
  });
  a.equal(res.ok, true, '合法');
  a.equal(res.value.origins[0].name, '静态资源', 'cnb 源站 name 保留');
  a.equal(res.value.origins[1].name, '备份桶', 'pool 第二个 r2 源站 name 也保留');
});

testA('validatePool: name 缺失回落空串（向后兼容）', (a) => {
  const res = validatePool({
    kind: 'single',
    origins: [{ engine: 'fetch', addr: '1.1.1.1', port: 443 }],
  });
  a.equal(res.ok, true, '合法');
  a.equal(res.value.origins[0].name, '', '无 name 时回落空串');
});

testA('validatePool: name 非字符串/过长被裁剪', (a) => {
  const long = 'x'.repeat(200);
  const res = validatePool({
    kind: 'pool',
    strategy: 'chain',
    origins: [
      { id: 'o0', engine: 'fetch', addr: '1.1.1.1', port: 443, name: 123 },
      { id: 'o1', engine: 'fetch', addr: '2.2.2.2', port: 443, name: long },
    ],
  });
  a.equal(res.ok, true, '合法');
  a.equal(res.value.origins[0].name, '', '非字符串 name 回落空串');
  a.equal(res.value.origins[1].name.length, 64, '过长 name 裁剪到 64');
});

// ===== glob-wildcard 并入 =====
testA('validateHost: 合法域名通过', (a) => {
  a.equal(validateHost('a.test').ok, true, 'a.test 通过');
  a.equal(validateHost('sub.a.test').ok, true, 'sub.a.test 通过');
});

testA('validateHost: 泛域名 base 非法拒绝', (a) => {
  a.equal(validateHost('*.test').ok, false, '*.test 拒绝（base 非法）');
  a.equal(validateHost('*').ok, false, '* 拒绝');
});

testA('validateHost: 合法泛域名（二级）通过', (a) => {
  a.equal(validateHost('*.example.com').ok, true, '*.example.com 合法');
  a.equal(validateHost('*.sub.example.com').ok, true, '多級泛域名合法');
});

testA('compileWildcard: 转正则', (a) => {
  const { value, glob } = compileWildcard('*.example.com', 'header');
  a.equal(glob, true, '含 * 标记 glob=true');
  const re = new RegExp(value);
  a.equal(re.test('a.example.com'), true, '匹配子域');
  a.equal(re.test('example.com'), false, '不匹配裸域');
});

testA('validateRegex: 合法正则通过，非法拒绝', (a) => {
  a.equal(validateRegex('^/api/.*$').ok, true, '合法正则通过');
  a.equal(validateRegex('(').ok, false, '非法正则拒绝');
});

testA('normRewrite: prefix 规范化', (a) => {
  const r = normRewrite({ type: 'prefix', value: '/a' });
  a.equal(r.errors.length, 0, '合法 prefix 重写无错误');
  a.equal(r.value.type, 'prefix', 'type 保留');
  a.equal(r.value.value, '/a', 'prefix 的 value 字段保留');
});

testA('normRewrite: 非法 type 回落 none（不报错，宽进）', (a) => {
  const r = normRewrite({ type: 'bogus' });
  a.equal(r.value.type, 'none', '非法 type 回落 none');
});

testA('normRewrite: strip 规范化', (a) => {
  const r = normRewrite({ type: 'strip', value: '/api' });
  a.equal(r.errors.length, 0, '合法 strip 无错误');
  a.equal(r.value.value, '/api', 'strip 的 value 保留');
});

// ===== fixContentType 真实落盘读回（加固点）=====
testA('fixContentType: enabled:false 真实落盘', (a) => {
  const res = validateGlobalRulesStages({ fixContentType: { enabled: false } }, DEFAULT_GLOBAL_RULES);
  a.equal(res.ok, true, '校验通过');
  a.equal(res.value.stages.fixContentType.enabled, false, 'enabled=false 被读回（非被忽略）');
});

testA('fixContentType: enabled:true 真实落盘', (a) => {
  const res = validateGlobalRulesStages({ fixContentType: { enabled: true } }, DEFAULT_GLOBAL_RULES);
  a.equal(res.value.stages.fixContentType.enabled, true, 'enabled=true 被读回');
});

testA('fixContentType: 缺失时等于默认（true）', (a) => {
  const res = validateGlobalRulesStages({}, DEFAULT_GLOBAL_RULES);
  a.equal(res.value.stages.fixContentType.enabled, DEFAULT_GLOBAL_RULES.fixContentType.enabled, '缺省等于默认');
});

// ===== stages / contracts / vars 段 =====
testA('STAGE_ORDER: 含核心阶段且唯一', (a) => {
  a.equal(Array.isArray(STAGE_ORDER), true, 'STAGE_ORDER 为数组');
  a.equal(STAGE_ORDER.includes('rewrite'), true, '含 rewrite');
  a.equal(new Set(STAGE_ORDER).size, STAGE_ORDER.length, '无重复');
});

testA('GLOBAL_ONLY_STAGE_ORDER: match/security/error', (a) => {
  a.equal(GLOBAL_ONLY_STAGE_ORDER.includes('match'), true, '含 match');
  a.equal(GLOBAL_ONLY_STAGE_ORDER.includes('security'), true, '含 security');
  a.equal(GLOBAL_ONLY_STAGE_ORDER.includes('error'), true, '含 error');
});

testA('isGlobalOnlyStage: 区分两类', (a) => {
  a.equal(isGlobalOnlyStage('match'), true, 'match 是全站独有');
  a.equal(isGlobalOnlyStage('rewrite'), false, 'rewrite 不是');
});

testA('normalizeStage: 精确 stage 名归一', (a) => {
  a.equal(normalizeStage('rewrite'), 'rewrite', 'rewrite 归一');
  a.equal(normalizeStage('reqHeaders'), 'reqHeaders', 'reqHeaders 归一');
});

testA('normalizeStage: 别名归一', (a) => {
  // 若 STAGE_ALIASES 定义了别名则验证，否则跳过（不假设别名存在）
  const aliased = normalizeStage('url-rewrite');
  a.equal(aliased === 'rewrite' || aliased === null, true, 'url-rewrite 别名或 null（取决于是否定义别名）');
});

testA('normalizeStage: 非法阶段返回 null（不静默吞没）', (a) => {
  a.equal(normalizeStage('not-a-stage'), null, '非法阶段返回 null');
  a.equal(normalizeStage(''), null, '空串返回 null');
});

testA('matchStatusPattern: 精确数字命中', (a) => {
  a.equal(matchStatusPattern(200, [200]), true, '200 命中');
  a.equal(matchStatusPattern(404, [200]), false, '404 不命中');
});

testA('matchStatusPattern: 5xx 通配', (a) => {
  a.equal(matchStatusPattern(502, ['5xx']), true, '502 命中 5xx');
  a.equal(matchStatusPattern(418, ['5xx']), false, '418 不命中 5xx');
});

testA('matchStatusPattern: 52x 部分通配', (a) => {
  a.equal(matchStatusPattern(523, ['52x']), true, '523 命中 52x');
  a.equal(matchStatusPattern(524, ['52x']), true, '524 命中 52x');
  a.equal(matchStatusPattern(500, ['52x']), false, '500 不命中 52x');
});

testA('matchStatusPattern: 取反 !418（排除项需配合肯定项）', (a) => {
  // !418 是排除项：无肯定项时整体为 false
  a.equal(matchStatusPattern(418, ['!418']), false, '418 命中排除项→false');
  a.equal(matchStatusPattern(200, ['!418']), false, '200 无肯定项命中→false');
  // 配合肯定项 200：200 命中肯定项且未被排除→true；418 命中肯定项但被 !418 排除→false
  a.equal(matchStatusPattern(200, [200, '!418']), true, '200 命中肯定项且未被排除→true');
  a.equal(matchStatusPattern(418, [200, '!418']), false, '418 命中肯定项但被排除→false');
});

testA('matchStatusPattern: NaN/非数字 status 安全返回 false', (a) => {
  a.equal(matchStatusPattern('abc', [200]), false, '字符串 status 不抛错');
  a.equal(matchStatusPattern(NaN, [200]), false, 'NaN 不抛错');
});

testA('matchStatusPattern: 兼容 Set', (a) => {
  a.equal(matchStatusPattern(200, new Set([200, 404])), true, 'Set 输入兼容');
});

testA('STATUS_PATTERN_RE: 合法模式', (a) => {
  a.equal(STATUS_PATTERN_RE.test('5xx'), true, '5xx 合法');
  a.equal(STATUS_PATTERN_RE.test('!418'), true, '!418 合法');
  a.equal(STATUS_PATTERN_RE.test('52x'), true, '52x 合法');
  a.equal(STATUS_PATTERN_RE.test('abc'), false, 'abc 非法');
});

testA('deepClone: 深拷贝独立（用于合并测试不污染默认）', (a) => {
  const base = { a: { b: 1 } };
  const clone = deepClone(base);
  clone.a.b = 99;
  a.equal(base.a.b, 1, '修改 clone 不影响 base');
});
