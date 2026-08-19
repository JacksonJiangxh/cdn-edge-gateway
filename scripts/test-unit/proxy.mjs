/**
 * scripts/test-unit/proxy.mjs —— 回源引擎 / 平台能力 单测
 * 覆盖 2026-08 澄清后的核心逻辑：
 *   - caps.detectCaps：hasRawIpFetch（CF/EO 支持裸 IP；ESA 官方明确不支持）
 *                       hasSocket（仅 CF 具备 cloudflare:sockets）
 *   - fetchEngine.needCustomSni：Host 头 ≠ URL hostname 判定（与是否裸 IP 无关）
 *   - socketEngine.computeServername：SNI 跟随 Host（裸 IP / 域名 / 自定义 Host）
 */
import assert from 'node:assert';
import { detectCaps } from '../../src/platform/caps.js';
import { needCustomSni } from '../../src/proxy/engines/fetchEngine.js';
import { computeServername } from '../../src/proxy/engines/socketEngine.js';
import { test, testA } from './_testkit.mjs';

// ===== caps：跨平台 hasRawIpFetch / hasSocket =====
testA('caps: CF 支持裸 IP fetch + 具备 sockets', (a) => {
  const caps = detectCaps({ CLOUD_PLATFORM: 'cf' });
  a.equal(caps.platform, 'cf', '平台识别为 cf');
  a.equal(caps.hasRawIpFetch, true, 'CF fetch 支持裸 IP');
  a.equal(caps.hasSocket, true, 'CF 具备 cloudflare:sockets');
});

testA('caps: EO 支持裸 IP fetch 但无 sockets', (a) => {
  const caps = detectCaps({ CLOUD_PLATFORM: 'eo' });
  a.equal(caps.platform, 'eo', '平台识别为 eo');
  a.equal(caps.hasRawIpFetch, true, 'EO fetch 支持裸 IP（官方文档未禁止）');
  a.equal(caps.hasSocket, false, 'EO 无可编程 TCP（无 cloudflare:sockets）');
});

testA('caps: ESA 不支持裸 IP fetch 且无 sockets', (a) => {
  const caps = detectCaps({ CLOUD_PLATFORM: 'esa' });
  a.equal(caps.platform, 'esa', '平台识别为 esa');
  a.equal(caps.hasRawIpFetch, false, 'ESA 官方明确不支持裸 IP');
  a.equal(caps.hasSocket, false, 'ESA 无 cloudflare:sockets');
});

// ===== needCustomSni：Host 头 ≠ URL hostname =====
testA('needCustomSni: Host 与 URL hostname 一致 → false', (a) => {
  const h = new Headers({ Host: 'example.com' });
  a.equal(needCustomSni('https://example.com/path', h), false, '同域名无需自定义 SNI');
});

testA('needCustomSni: 自定义 Host（加速域名 A 回源 DNS 目标 B）→ true', (a) => {
  // 加速域名 A 回源，DNS 目标 B：URL=B，Host=A
  const h = new Headers({ Host: 'a.example.com' });
  a.equal(needCustomSni('https://b.example.com/path', h), true, 'Host=A ≠ URL=B 需自定义 SNI');
});

testA('needCustomSni: 裸 IP 回源 + 真实域名 Host → true', (a) => {
  const h = new Headers({ Host: 'real.example.com' });
  a.equal(needCustomSni('https://1.2.3.4/path', h), true, '裸 IP URL + 域名 Host 需自定义 SNI');
});

testA('needCustomSni: 裸 IP URL + 裸 IP Host（同值）→ false', (a) => {
  const h = new Headers({ Host: '1.2.3.4' });
  a.equal(needCustomSni('https://1.2.3.4/path', h), false, '裸 IP URL 与裸 IP Host 同值无需自定义 SNI');
});

testA('needCustomSni: Host 带端口仍只比主机名', (a) => {
  const h = new Headers({ Host: 'a.example.com:8443' });
  a.equal(needCustomSni('https://a.example.com/path', h), false, 'Host 含端口但主机名一致 → false');
});

testA('needCustomSni: 无 Host 头 → false', (a) => {
  const h = new Headers();
  a.equal(needCustomSni('https://example.com/path', h), false, '缺 Host 头不触发自定义 SNI');
});

testA('needCustomSni: 支持传入 URL 对象', (a) => {
  const h = new Headers({ Host: 'x.test' });
  a.equal(needCustomSni(new URL('https://y.test/'), h), true, 'URL 对象入参同样判定');
});

// ===== computeServername：SNI 跟随 Host =====
testA('computeServername: 自定义域名 Host → SNI=Host', (a) => {
  const h = new Headers({ Host: 'c.example.com' });
  a.equal(computeServername('https://1.2.3.4/', h), 'c.example.com', 'SNI 跟随自定义 Host C');
});

testA('computeServername: 裸 IP Host → SNI=裸 IP', (a) => {
  const h = new Headers({ Host: '9.9.9.9' });
  a.equal(computeServername('https://9.9.9.9/', h), '9.9.9.9', '裸 IP Host 时 SNI 即裸 IP');
});

testA('computeServername: Host 带端口 → SNI 只取主机名', (a) => {
  const h = new Headers({ Host: 'c.example.com:8443' });
  a.equal(computeServername('https://1.2.3.4/', h), 'c.example.com', 'SNI 剥离端口');
});

testA('computeServername: 无 Host 头 → 空串（回退 URL hostname）', (a) => {
  const h = new Headers();
  a.equal(computeServername('https://1.2.3.4/', h), '', '无 Host 时返回空串');
});
