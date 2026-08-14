import { handleProxy } from '../src/proxy/pipeline.js';
import { invalidateMemCache } from '../src/config/store.js';
import { detectCaps, resetCapsCache } from '../src/platform/caps.js';
import { encodeKey } from '../src/platform/keyCodec.js';
import { DEFAULT_GLOBAL_RULES } from '../src/config/defaults.js';

function createMockKV() {
  const map = new Map();
  return { async get(k){return map.has(k)?map.get(k):null;}, async put(k,v){map.set(k,v);}, async delete(k){map.delete(k);} };
}
function mockCaches(){ const p=globalThis.caches; globalThis.caches={default:{async match(){return null;},async put(){},async delete(){return false;}}}; return ()=>{globalThis.caches=p;}; }
function mockFetch(cap){ const p=globalThis.fetch; globalThis.fetch=async(i,init)=>{cap.url=String(i);cap.init=init;return new Response('OK',{status:200,headers:{'content-type':'image/jpeg'}});}; return ()=>{globalThis.fetch=p;}; }
function makeCtx(env,url,headers={}){ return { request:new Request(url,{method:'GET',headers:{'user-agent':'Mozilla/5.0','accept':'image/webp,*/*',...headers}}), url:new URL(url), env, caps:detectCaps(env), waitUntil(){}, startTime:Date.now(), reqId:'d', debug:{} }; }

async function main(){
  const kv=createMockKV(); const cap={}; const rf=mockFetch(cap); const rc=mockCaches();
  const env={CLOUD_PLATFORM:'cf',CDN_KV:kv,IMG_URL:'x',IMG_TOKEN:'t',IMG_VARIANTS:'a',IMG_OPTIONS:''};
  await invalidateMemCache(); resetCapsCache();
  // 全站
  const gs=structuredClone(DEFAULT_GLOBAL_RULES);
  gs.reqHeaders={set:{'X-Custom':'gval'},remove:[]};
  await kv.put(encodeKey('cfg:global_rules'), JSON.stringify({stages:gs}));
  // 站点 + 规则
  await kv.put(encodeKey('site:_index'), JSON.stringify({hosts:['img.example.com'],wildcards:[]}));
  await kv.put(encodeKey('pool:_index'), JSON.stringify({ids:['pool1']}));
  await kv.put(encodeKey('site:img.example.com'), JSON.stringify({host:'img.example.com',enabled:true,poolId:'pool1',defaultHostHeader:{mode:'accel',custom:''},rules:[{id:'s1',stage:'reqHeaders',priority:100,match:{},action:{reqHeaders:{set:{'X-Custom':'sval'}}}}],security:{refererMode:'off',refererList:[],allowEmptyReferer:true,uaBlacklist:[],ipBlacklist:[],ipWhitelist:[],signedUrl:{enabled:false,secret:'',ttl:3600,param:'sign'},rateLimit:{enabled:false,rpm:600},botManagement:{enabled:false,mode:'blacklist',list:[]}},cacheGen:0}));
  await kv.put(encodeKey('pool:pool1'), JSON.stringify({id:'pool1',name:'p',kind:'single',strategy:'chain',origins:[{id:'o1',enabled:true,order:1,weight:1,engine:'fetch',scheme:'https',addr:'origin1.example.net',port:443,pathPrefix:'',extraHeaders:{},hostHeader:{mode:'inherit',custom:''},sni:null,rewrite:{type:'none',value:'',regexFrom:'',regexTo:''},reqHeaders:{set:{},remove:[]},respHeaders:{set:{},remove:[]},cache:{enabled:false,mode:'ttl',edgeTtl:0,browserTtl:0},followRedirect:false,clientIpHeader:{enabled:false,name:'X-Forwarded-For'}}],failover:{enabled:true,retryOn:[500,502,503,504,522,524],maxRetries:2,timeoutMs:10000}}));
  const { getGlobalRules } = await import('../src/config/store.js');
  const gr = await getGlobalRules({env});
  console.log('global gx reqHeaders=', JSON.stringify(gr.stages.reqHeaders));
  const { mergeStageHeaderOps } = await import('../src/proxy/rewrite.js');
  const siteRule = {id:'s1',stage:'reqHeaders',priority:100,match:{},action:{reqHeaders:{set:{'X-Custom':'sval'}}}};
  const m = mergeStageHeaderOps(gr.stages.reqHeaders, siteRule.action.reqHeaders);
  console.log('merged set=', JSON.stringify(m.set));
  const ctx=makeCtx(env,'https://img.example.com/pic/photo.jpg');
  const resp=await handleProxy(ctx);
  console.log('ruleSource=',JSON.stringify(ctx.debug.ruleSource));
  console.log('ruleId=',ctx.debug.ruleId);
  console.log('X-Custom sent=', cap.init && cap.init.headers ? cap.init.headers.get('x-custom') : 'n/a');
  rf(); rc();
}
main().catch(e=>{console.error('FATAL',e);});
