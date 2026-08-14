// 通配符（*）编译回归测试：覆盖 rewrite / conditions / strip 三类入口
// 运行：node scripts/test-glob-wildcard.mjs
import { compileWildcard, validateRegex, normRewrite, normRule } from '../src/config/schema.js';
import { applyRewrite } from '../src/proxy/rewrite.js';

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.log('  ✗', name); }
}

console.log('1) compileWildcard 基础编译');
{
  const r1 = compileWildcard('/img/*', 'path');
  ok('path: /img/* -> /img/([^/]*)', r1.value === '/img/([^/]*)' && r1.glob === true);
  const r2 = compileWildcard('cf-x-*', 'header');
  ok('header: cf-x-* -> cf-x-(.*)', r2.value === 'cf-x-(.*)' && r2.glob === true);
  const r3 = compileWildcard('no-star', 'path');
  ok('无 * 不编译', r3.glob === false && r3.value === 'no-star');
  const r4 = compileWildcard('/a.b/*', 'path');
  ok('正则特殊字符被转义（. -> \\.）', r4.value === '/a\\.b/([^/]*)');
  const r5 = compileWildcard('^/old/(.*)', 'path');
  ok('含括号(视为纯正则)不编译', r5.glob === false && r5.value === '^/old/(.*)');
}

console.log('2) validateRegex 经归一化统一编译');
{
  const v1 = validateRegex('/img/*', 'path');
  ok('validateRegex path 返回编译串', v1.ok && v1.value === '/img/([^/]*)' && v1.glob === true);
  const v2 = validateRegex('cf-*', 'header');
  ok('validateRegex header 返回编译串', v2.ok && v2.value === 'cf-(.*)' && v2.glob === true);
  const v3 = validateRegex('(a+)+', 'raw');
  ok('嵌套量词仍被拦截', v3.ok === false);
  const v4 = validateRegex('^/old/(.*)', 'path');
  ok('纯正则原样返回（glob=false）', v4.ok && v4.glob === false && v4.value === '^/old/(.*)');
}

console.log('3) normRewrite 通配符 + $0 映射（用户示例）');
{
  const r = normRewrite({ type: 'regex', regexFrom: '/img/*', regexTo: '/images/$0' });
  ok('无校验错误', r.errors.length === 0);
  const rw = r.value;
  ok('regexFrom 已编译为 ([^/]*)', rw.regexFrom === '/img/([^/]*)');
  ok('glob 标志透传', rw.glob === true);
  const out = applyRewrite('/img/a/b.png', rw, {});
  ok('/img/a/b.png -> /images/a/b.png', out === '/images/a/b.png');
}

console.log('4) normRewrite $1 = 完整输入 语义');
{
  const r = normRewrite({ type: 'regex', regexFrom: '/old/*', regexTo: '/new$1' });
  const out = applyRewrite('/old/foo', r.value, {});
  ok('/old/foo -> /new/old/foo ($1 为完整输入，无尾斜杠拼接)', out === '/new/old/foo');
}

console.log('5) normRewrite 多 * 段 + $0/$2 引用');
{
  const r = normRewrite({ type: 'regex', regexFrom: '/u/*/p/*', regexTo: '/x/$0/y/$2' });
  const out = applyRewrite('/u/alice/p/42', r.value, {});
  ok('/u/alice/p/42 -> /x/alice/y/42', out === '/x/alice/y/42');
}

console.log('6) conditions 正则运算符 通配符（按 target 推导 kind）');
{
  const r1 = normRule({ match: { conditions: [[{ target: 'path', op: 'regex', values: ['/img/*'] }]] }, action: {}, stage: 'request' }, 0);
  const c1 = r1.value.match.conditions[0][0];
  ok('path regex 通配符编译为 [^/]*', r1.errors.length === 0 && c1.values[0] === '/img/([^/]*)');
  const r2 = normRule({ match: { conditions: [[{ target: 'header', op: 'regex', values: ['cf-x-*'], key: 'x-custom' }]] }, action: {}, stage: 'request' }, 0);
  const c2 = r2.value.match.conditions[0][0];
  ok('header regex 通配符编译为 (.*)', r2.errors.length === 0 && c2.values[0] === 'cf-x-(.*)');
}

console.log('7) strip 剥离规则 regex 通配符（header kind）');
{
  // strip 的 regex 值统一经 validateRegex(value, 'header') 归一化（见 normGlobalOnlySubFields）
  const r = validateRegex('cf-x-*', 'header');
  ok('strip regex cf-x-* 经 validateRegex 编译为 cf-x-(.*)', r.ok && r.value === 'cf-x-(.*)' && r.glob === true);
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
