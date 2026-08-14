import { buildMatchSubject } from '../src/proxy/matcher.js';
import { buildOriginHeaders } from '../src/proxy/headers.js';
import { pickClientIp, CLIENT_IP_HEADERS } from '../src/config/vars.js';

const mk = (obj) => new Headers(obj);
const cases = [
  ['forwarded', pickClientIp(mk({ forwarded: 'for=1.2.3.4:5678;proto=https' }))],
  ['cloudfront', pickClientIp(mk({ 'cloudfront-viewer-address': '9.9.9.9:1234' }))],
  ['xff', pickClientIp(mk({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2' }))],
  ['ipv6', pickClientIp(mk({ forwarded: 'for="[2001:db8::1]:443";proto=https' }))],
  ['prio', pickClientIp(mk({ 'cf-connecting-ip': '5.5.5.5', 'x-real-ip': '6.6.6.6' }))],
  ['empty', JSON.stringify(pickClientIp(mk({})))],
];
for (const [k, v] of cases) console.log(k + ':', v);
console.log('headers count:', CLIENT_IP_HEADERS.length);

// matcher subject 复用
const ctx = {
  url: new URL('https://example.com/p'),
  request: { method: 'GET', headers: mk({ 'cf-connecting-ip': '5.5.5.5' }) },
  debug: {},
};
console.log('subject.clientIp:', buildMatchSubject(ctx).clientIp);

// headers 回源头注入
const octx = {
  request: { headers: mk({ forwarded: 'for=7.7.7.7;proto=https' }) },
  debug: {},
};
const out = await buildOriginHeaders(octx, {}, null, null, { enabled: true, name: 'X-Forwarded-For' });
console.log('origin XFF:', out.get('X-Forwarded-For'));
console.log('ALL OK');
