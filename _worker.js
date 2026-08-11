// cdn-edge-gateway — built at 2026-08-11T14:54:50.663Z
// 构建产物，请勿手动编辑。修改源码请编辑 src/ 目录后重新运行 npm run build
var Ys=Object.defineProperty;var Qs=(e=>typeof require<"u"?require:typeof Proxy<"u"?new Proxy(e,{get:(n,t)=>(typeof require<"u"?require:n)[t]}):e)(function(e){if(typeof require<"u")return require.apply(this,arguments);throw Error('Dynamic require of "'+e+'" is not supported')});var X=(e,n,t)=>()=>{if(t)throw t[0];try{return e&&(n=e(e=0)),n}catch(r){throw t=[r],r}};var ze=(e,n)=>{for(var t in n)Ys(e,t,{get:n[t],enumerable:!0})};function cr(e){return e>="0"&&e<="9"||e>="a"&&e<="z"||e>="A"&&e<="Z"}function me(e){if(typeof e!="string"||e==="")throw new TypeError(`encodeKey: 键必须是非空字符串，收到 ${JSON.stringify(e)}`);let n=gn.get(e);if(n!==void 0)return n;let t="";for(let r of e){if(cr(r)){t+=r;continue}if(r==="_"){t+="__";continue}let o=ra.encode(r);for(let s=0;s<o.length;s++)t+="_"+o[s].toString(16).toUpperCase().padStart(2,"0")}if(t.length>512)throw new RangeError(`encodeKey: 键 "${e}" 编码后为 ${t.length} B，超过 512 B 上限`);return gn.size>=oa&&gn.clear(),gn.set(e,t),t}function dr(e){if(typeof e!="string"||e==="")return null;let n=[];for(let t=0;t<e.length;t++){let r=e[t];if(cr(r)){n.push(r.charCodeAt(0));continue}if(r!=="_")return null;let o=e[t+1];if(o===void 0)return null;if(o==="_"){n.push(95),t+=1;continue}let s=e.slice(t+1,t+3);if(s.length!==2||!/^[0-9A-Fa-f]{2}$/.test(s))return null;n.push(parseInt(s,16)),t+=2}try{return new TextDecoder("utf-8",{fatal:!0}).decode(new Uint8Array(n))}catch{return null}}function pr(e){return typeof e=="string"&&e!==""&&/^[0-9A-Za-z_]+$/.test(e)}function ur(e){return typeof e!="string"||e===""?"":me(e)}var ra,dc,gn,oa,lt=X(()=>{ra=new TextEncoder,dc=new TextDecoder,gn=new Map,oa=2e3});function aa(e){return!!(e&&typeof e=="object"&&typeof e.get=="function"&&typeof e.put=="function")}function ia(e){if(!e)return null;for(let n of sa)if(aa(e[n]))return e[n];return null}function hr(e){if(e==null)return null;if(typeof e=="string")return{name:e};let n=e.name??e.key??e.Key;if(typeof n!="string"||n==="")return null;let t={name:n};return typeof e.expiration=="number"&&(t.expiration=e.expiration),e.metadata!=null&&(t.metadata=e.metadata),t}function la(e){let n=fr.get(e);if(n)return n;let t={async get(r,o="text"){if(typeof r!="string"||r==="")return null;let s;try{s=me(r)}catch{return null}let a;try{a=await e.get(s,"text")}catch{try{a=await e.get(s)}catch{return null}}if(a==null)return null;let i;if(typeof a=="string")i=a;else if(a instanceof ArrayBuffer||ArrayBuffer.isView(a))try{i=new TextDecoder().decode(a instanceof ArrayBuffer?a:a.buffer)}catch{return null}else{if(typeof a=="object")return o==="json"?a:JSON.stringify(a);i=String(a)}if(o!=="json")return i;try{return JSON.parse(i)}catch{return null}},async put(r,o,s){if(typeof r!="string"||r==="")return;let a=me(r),i=typeof o=="string"?o:JSON.stringify(o),l;s&&typeof s.expirationTtl=="number"&&s.expirationTtl>0&&(l={expirationTtl:Math.max(60,Math.floor(s.expirationTtl))});try{l?await e.put(a,i,l):await e.put(a,i)}catch(c){throw new Error(`KV put failed for "${r}": ${c&&c.message?c.message:c}`)}},async delete(r){if(typeof r!="string"||r===""||typeof e.delete!="function")return;let o=me(r);try{await e.delete(o)}catch(s){throw new Error(`KV delete failed for "${r}": ${s&&s.message?s.message:s}`)}},async list(r){if(typeof e.list!="function")return{keys:[],list_complete:!0};let o={...r||{}};if(typeof o.prefix=="string"&&o.prefix!=="")try{o.prefix=ur(o.prefix)}catch{return{keys:[],list_complete:!0}}let s;try{s=await e.list(o)}catch{return{keys:[],list_complete:!0}}if(!s)return{keys:[],list_complete:!0};let a=Array.isArray(s.keys)?s.keys:Array.isArray(s)?s:[],i=[];for(let p of a){let u=hr(p);if(!u)continue;let h=dr(u.name);h===null?u.legacy=!0:u.name=h,i.push(u)}let l=typeof s.list_complete=="boolean"?s.list_complete:typeof s.listComplete=="boolean"?s.listComplete:!0,c={keys:i,list_complete:l},d=s.cursor??s.next_cursor;return typeof d=="string"&&d!==""&&(c.cursor=d),c}};return t.raw={async get(r){try{let o=await e.get(r,"text");return o==null?null:typeof o=="string"?o:String(o)}catch{try{let o=await e.get(r);return o==null?null:typeof o=="string"?o:String(o)}catch{return null}}},async delete(r){if(typeof e.delete!="function")return!1;try{return await e.delete(r),!0}catch{return!1}},async list(r){if(typeof e.list!="function")return{keys:[],list_complete:!0};let o;try{o=await e.list(r||{})}catch{return{keys:[],list_complete:!0}}if(!o)return{keys:[],list_complete:!0};let s=Array.isArray(o.keys)?o.keys:Array.isArray(o)?o:[],a=[];for(let d of s){let p=hr(d);p&&a.push(p)}let i=typeof o.list_complete=="boolean"?o.list_complete:typeof o.listComplete=="boolean"?o.listComplete:!0,l={keys:a,list_complete:i},c=o.cursor??o.next_cursor;return typeof c=="string"&&c!==""&&(l.cursor=c),l}},fr.set(e,t),t}function O(e){let n=ia(e);return n?la(n):null}async function gr(e,n){return O(e)}var sa,fr,se=X(()=>{lt();sa=["CDN_KV","KV"],fr=new WeakMap});var f,Re,mn,mr,br,xr,hc,be,N=X(()=>{f=Object.freeze({UNAUTHORIZED:"UNAUTHORIZED",FORBIDDEN:"FORBIDDEN",NOT_FOUND:"NOT_FOUND",BAD_REQUEST:"BAD_REQUEST",CONFLICT:"CONFLICT",RATE_LIMITED:"RATE_LIMITED",INTERNAL:"INTERNAL",STORAGE_UNAVAILABLE:"STORAGE_UNAVAILABLE"}),Re=Object.freeze([500,502,503,504,522,524]),mn=Object.freeze(new Set([400,401,402,403,404,405,406,407,408,409,410,411,412,413,414,415,416,417,418,421,422,423,424,425,426,428,429,431,500,501,502,503,504,505,506,507,508,510,511,520,521,522,523,524,525,526,527])),mr=Object.freeze(new Set(["range","if-range","if-none-match","if-modified-since","accept","accept-encoding","accept-language","content-type","content-length"])),br=Object.freeze({"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",Accept:"text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8","Accept-Language":"zh-CN,zh;q=0.9,en;q=0.8"}),xr=Object.freeze(["cross-origin-resource-policy","cross-origin-embedder-policy","content-security-policy","content-security-policy-report-only","x-frame-options","set-cookie"]),hc=Object.freeze(new Set(["7z","avi","avif","apk","bin","bmp","bz2","class","css","csv","doc","docx","dmg","ejs","eot","eps","exe","flac","gif","gz","ico","iso","jar","jpg","jpeg","js","json","m3u8","mid","midi","mkv","mp3","mp4","ogg","otf","pdf","pict","pls","png","ppt","pptx","ps","rar","svg","svgz","swf","tar","tif","tiff","ts","ttf","txt","webm","webp","woff","woff2","xls","xlsx","xml","zip","zst"])),be="1.0.0"});function bn(e){if(Array.isArray(e))return e.map(bn);if(e&&typeof e=="object"){let n={};for(let t of Object.keys(e))n[t]=bn(e[t]);return n}return e}function Rr(){return bn(xn)}function D(e){return bn(e)}var z,yr,ct,xn,Ke,dt,Z,Ce,yn,ca,bc,vr,wr,kr,pt,ut,vn,da,xc,je,wn,kn,ft,Pe,Sr,G,yc,ht,Ar,Tr,Er,ae=X(()=>{N();z="EdgeGateway",yr=Object.freeze({mode:"inherit",custom:""}),ct=Object.freeze({mode:"accel",custom:""}),xn=Object.freeze({adminPath:"__panel",passwordHash:"",passwordSalt:"",tokenTtl:7200,statsEnabled:!0,statsDriver:"kv",configCacheTtl:60,globalRateLimit:0,disguise:Object.freeze({mode:"static",target:"",status:200}),version:be}),Ke=xn.disguise,dt=Object.freeze({ignoreCase:!1,includeScheme:!1,headers:Object.freeze([]),cookies:Object.freeze([])}),Z=Object.freeze({enabled:!1,mode:"ttl",edgeTtl:0,staleWhileRevalidate:0,browserTtl:0,ignoreQuery:!1,queryWhitelist:Object.freeze([]),key:dt,statusTtl:Object.freeze({}),preRefresh:!1,preRefreshPercent:80,offlineCache:!1}),Ce=Object.freeze({set:Object.freeze({}),remove:Object.freeze([])}),yn=Object.freeze({type:"none",value:"",regexFrom:"",regexTo:""}),ca=Object.freeze({conditions:Object.freeze([]),pathPrefix:"",pathRegex:"",extIn:Object.freeze([]),methodIn:Object.freeze([])}),bc=Object.freeze({target:"path",op:"prefix",values:Object.freeze([]),key:"",ignoreCase:!0}),vr=Object.freeze(["host","path","fullUrl","query","extension","filename","directory","method","protocol","header","cookie","clientIp","clientCountry","userAgent","referer","origin"]),wr=Object.freeze(["equal","notEqual","contain","notContain","prefix","notPrefix","suffix","notSuffix","regex","notRegex","exists","notExists"]),kr=Object.freeze(["header","cookie","query"]),pt=Object.freeze({enabled:!1,status:302,target:"",keepQuery:!0}),ut=Object.freeze({enabled:!1,status:200,contentType:"text/html; charset=utf-8",body:""}),vn=Object.freeze({enabled:!1,name:"X-EdgeGateway-Client-IP"}),da=Object.freeze({poolId:"",rewrite:yn,cache:Z,reqHeaders:Ce,respHeaders:Ce,hostHeader:yr,redirect:pt,directResponse:ut,clientIpHeader:vn,forceHttps:!1,followRedirect:!1,originTimeoutMs:0,engine:"",scheme:"",port:0}),xc=Object.freeze({id:"",priority:0,enabled:!0,match:ca,action:da}),je=Object.freeze({enabled:!1,secret:"",ttl:3600,param:"sign"}),wn=Object.freeze({enabled:!1,rpm:600}),kn=Object.freeze({enabled:!1,mode:"blacklist",list:Object.freeze([])}),ft=Object.freeze({refererMode:"off",refererList:Object.freeze([]),allowEmptyReferer:!0,uaBlacklist:Object.freeze([]),ipBlacklist:Object.freeze([]),ipWhitelist:Object.freeze([]),signedUrl:je,rateLimit:wn,botManagement:kn}),Pe=Object.freeze({enabled:!0,retryOn:Re,maxRetries:2,timeoutMs:1e4}),Sr=Object.freeze({host:"",enabled:!0,poolId:"",defaultHostHeader:ct,rules:Object.freeze([]),security:ft,ipv6Support:!1,cacheGen:0,updatedAt:0}),G=Object.freeze({id:"",enabled:!0,order:0,weight:1,engine:"fetch",scheme:"https",addr:"",port:443,pathPrefix:"",extraHeaders:Object.freeze({}),hostHeader:yr,sni:null,rewrite:yn,reqHeaders:Ce,respHeaders:Ce,cache:Z,followRedirect:!1,originTimeoutMs:0,clientIpHeader:vn,r2Binding:"",r2KeyPrefix:"",r2KeyMode:"none",r2KeyPrefixRule:"",r2KeyRegexTo:"",r2ContentType:"application/octet-stream"}),yc=Object.freeze(["fetch","socket","r2"]),ht=Object.freeze({id:"",name:"",kind:"single",strategy:"chain",origins:Object.freeze([]),failover:Pe,createdBy:"",updatedAt:0}),Ar=Object.freeze(["single","pool"]),Tr=Object.freeze({hosts:Object.freeze([]),wildcards:Object.freeze([])}),Er=Object.freeze({ids:Object.freeze([])})});function Cr(){return{errors:[]}}function v(e,n="",t=w.STR_MAX){if(typeof e!="string")return n;let r=e.trim();return r.length>t?r.slice(0,t):r}function R(e,n=!1){return typeof e=="boolean"?e:n}function T(e,n,t,r){let o=typeof e=="number"?e:parseInt(e,10);return Number.isFinite(o)?Math.min(r,Math.max(t,Math.floor(o))):n}function K(e,n=w.LIST_MAX,t=w.STR_MAX){if(!Array.isArray(e))return[];let r=[],o=new Set;for(let s of e){if(r.length>=n)break;let a=v(s,"",t);!a||o.has(a)||(o.add(a),r.push(a))}return r}function L(e,n,t){return n.includes(e)?e:t}function pa(){let e=Date.now().toString(36),n="";try{let t=new Uint8Array(6);(globalThis.crypto||Qs("crypto")).getRandomValues(t),n=Array.from(t).map(r=>r.toString(36)).join("")}catch{n=Math.random().toString(36).slice(2,10)}return`pl_${e}_${n}`}function ua(e){let n=v(e,"",w.HOST_MAX).toLowerCase();if(!n)return{ok:!1,error:"host 不能为空"};if(n.length>w.HOST_MAX)return{ok:!1,error:"host 过长"};if(/[\s]/.test(n))return{ok:!1,error:"host 不能包含空格"};if(n.includes("://"))return{ok:!1,error:"host 不应包含协议前缀"};if(n.includes("/"))return{ok:!1,error:"host 不应包含路径"};if(n.includes(":"))return{ok:!1,error:"host 不应包含端口"};if(n==="*"||n==="*.")return{ok:!1,error:"不允许匹配全部域名的通配符"};if(n.startsWith("*.")){let t=n.slice(2);return!t||!gt(t)?{ok:!1,error:`泛域名格式不正确: ${e}`}:t.includes(".")?{ok:!0,value:n}:{ok:!1,error:"泛域名至少需要二级域名，如 *.example.com"}}return gt(n)?{ok:!0,value:n}:{ok:!1,error:`host 格式不正确: ${e}`}}function gt(e){return e.length>w.HOST_MAX?!1:/^\d{1,3}(\.\d{1,3}){3}$/.test(e)?e.split(".").every(n=>Number(n)<=255):/^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))*$/.test(e)}function fa(e){let n=v(e,"",w.HOST_MAX).toLowerCase();if(!n)return{ok:!1,error:"源站地址不能为空"};if(n.includes("://"))return{ok:!1,error:"源站地址不应包含协议，请用 scheme 字段"};if(n.includes("/"))return{ok:!1,error:"源站地址不应包含路径，请用 pathPrefix 字段"};if(n.includes(":")){let t=n.startsWith("[")&&n.endsWith("]")?n.slice(1,-1):n;return/^[0-9a-f:]+$/.test(t)?{ok:!0,value:`[${t}]`}:{ok:!1,error:"源站地址不应包含端口，请用 port 字段"}}return gt(n)?{ok:!0,value:n}:{ok:!1,error:`源站地址格式不正确: ${e}`}}function Sn(e){let n=v(e,"",w.REGEX_MAX);if(!n)return{ok:!0,value:""};if(n.length>w.REGEX_MAX)return{ok:!1,error:`正则过长（上限 ${w.REGEX_MAX} 字符）`};if(/\([^)]*[+*}]\)\s*[+*]|\([^)]*[+*]\s*\)\s*\{/.test(n))return{ok:!1,error:"正则包含嵌套量词，存在灾难性回溯风险，请简化"};try{new RegExp(n)}catch(t){return{ok:!1,error:`正则语法错误: ${t.message}`}}return{ok:!0,value:n}}function We(e){return typeof e=="string"&&/^[A-Za-z0-9!#$%&'*+\-.^_`|~]+$/.test(e)}function ha(e){return typeof e=="string"&&!/[\r\n\0]/.test(e)}function Pr(e,n){let t={},r=[];if(!E(e))return{value:t,errors:r};let o=0;for(let[s,a]of Object.entries(e)){if(o>=w.HEADERS_MAX){r.push(`${n} 数量超过上限 ${w.HEADERS_MAX}，多余项已忽略`);break}if(!We(s)){r.push(`${n} 中存在非法头名: ${s}`);continue}let i=String(a??"");if(!ha(i)){r.push(`${n} 中头 ${s} 的值包含非法字符（换行符）`);continue}if(i.length>w.STR_MAX){r.push(`${n} 中头 ${s} 的值过长`);continue}t[s]=i,o++}return{value:t,errors:r}}function _e(e,n){let t=[];if(!E(e))return{value:D(Ce),errors:t};let r=Pr(e.set,`${n}.set`);t.push(...r.errors);let o=K(e.remove,w.HEADERS_MAX,128).map(s=>s.toLowerCase()).filter(s=>We(s)?!0:(t.push(`${n}.remove 中存在非法头名: ${s}`),!1));return{value:{set:r.value,remove:o},errors:t}}function ga(e){let n=dt;return E(e)?{ignoreCase:R(e.ignoreCase,n.ignoreCase),includeScheme:R(e.includeScheme,n.includeScheme),headers:K(e.headers,10,128).map(t=>t.toLowerCase()).filter(We),cookies:K(e.cookies,10,128)}:D(n)}function ma(e){let n={};if(!E(e))return n;let t=0;for(let[r,o]of Object.entries(e)){if(t>=20)break;let s=T(r,0,100,599);s<100||(n[String(s)]=T(o,0,0,w.TTL_MAX),t++)}return n}function mt(e){let n=Z;if(!E(e))return D(n);let t=L(e.mode,["ttl","origin","noCache"],n.mode);return{enabled:R(e.enabled,n.enabled)&&t!=="noCache",mode:t,edgeTtl:T(e.edgeTtl,n.edgeTtl,0,w.TTL_MAX),staleWhileRevalidate:T(e.staleWhileRevalidate,n.staleWhileRevalidate,0,w.TTL_MAX),browserTtl:T(e.browserTtl,n.browserTtl,-1,w.TTL_MAX),ignoreQuery:R(e.ignoreQuery,n.ignoreQuery),queryWhitelist:K(e.queryWhitelist,50,128),key:ga(e.key),statusTtl:ma(e.statusTtl),preRefresh:R(e.preRefresh,n.preRefresh),preRefreshPercent:T(e.preRefreshPercent,n.preRefreshPercent,1,99),offlineCache:R(e.offlineCache,n.offlineCache)}}function ba(e,n){let t=[],r=[];if(!Array.isArray(e))return{value:r,errors:t};for(let o=0;o<Math.min(e.length,10);o++){let s=e[o];if(!Array.isArray(s))continue;let a=[];for(let i=0;i<Math.min(s.length,10);i++){let l=s[i];if(!E(l))continue;let c=`${n} 条件[${o}.${i}]`,d=L(l.target,vr,"");if(!d){t.push(`${c} 不支持的匹配对象: ${l.target}`);continue}let p=L(l.op,wr,"");if(!p){t.push(`${c} 不支持的操作符: ${l.op}`);continue}let u=v(l.key,"",128);if((d==="header"||d==="cookie")&&!u){t.push(`${c} 匹配 ${d} 时必须填写键名`);continue}if(d==="header"&&!We(u)){t.push(`${c} 非法头名: ${u}`);continue}let h=p!=="exists"&&p!=="notExists",g=K(l.values,50,w.STR_MAX);if(h&&g.length===0){t.push(`${c} 操作符 ${p} 需要至少一个匹配值`);continue}if(p==="regex"||p==="notRegex"){let b=!1;for(let y of g){let x=Sn(y);x.ok||(t.push(`${c} ${x.error}`),b=!0)}if(b)continue}a.push({target:d,op:p,values:h?g:[],key:u,ignoreCase:R(l.ignoreCase,!0)})}a.length&&r.push(a)}return{value:r,errors:t}}function xa(e,n){let t=[],r=pt;if(!E(e))return{value:D(r),errors:t};let o=R(e.enabled,r.enabled),s=v(e.target,"",2048);if(o){if(!s)t.push(`${n} 启用重定向时必须填写目标 URL`);else if(!s.startsWith("/"))try{let a=new URL(s);a.protocol!=="http:"&&a.protocol!=="https:"&&t.push(`${n} 重定向目标仅支持 http/https 或以 / 开头的路径`)}catch{t.push(`${n} 重定向目标不是合法 URL`)}}return{value:{enabled:o,status:L(T(e.status,r.status,300,399),[301,302,303,307,308],r.status),target:s,keepQuery:R(e.keepQuery,r.keepQuery)},errors:t}}function ya(e){let n=ut;return E(e)?{enabled:R(e.enabled,n.enabled),status:T(e.status,n.status,100,599),contentType:v(e.contentType,n.contentType,128),body:v(e.body,"",64*1024)}:D(n)}function bt(e,n){let t=[],r=vn;if(!E(e))return{value:D(r),errors:t};let o=v(e.name,r.name,128);return o&&!We(o)?(t.push(`${n} 客户端 IP 头名非法: ${o}`),{value:D(r),errors:t}):{value:{enabled:R(e.enabled,r.enabled),name:o||r.name},errors:t}}function xt(e){let n=[],t=yn;if(!E(e))return{value:D(t),errors:n};let r=L(e.type,["none","prefix","strip","regex"],"none"),o={type:r,value:"",regexFrom:"",regexTo:""};if(r==="prefix"||r==="strip"){let s=v(e.value,"");s?(s.startsWith("/")||(s="/"+s),s=s.replace(/\/+$/,""),o.value=s):n.push(`重写模式 ${r} 需要填写 value`)}else if(r==="regex"){let s=Sn(e.regexFrom);s.ok?s.value?o.regexFrom=s.value:n.push("重写模式 regex 需要填写 regexFrom"):n.push(`重写正则: ${s.error}`),o.regexTo=v(e.regexTo,"")}return{value:o,errors:n}}function va(e){let n=[],t=ft;if(!E(e))return{value:D(t),errors:n};let r=E(e.signedUrl)?e.signedUrl:{},o=E(e.rateLimit)?e.rateLimit:{},s=E(e.botManagement)?e.botManagement:{},a=R(r.enabled,je.enabled),i=v(r.secret,"",512);return a&&!i&&n.push("启用签名 URL 时必须设置 secret"),{value:{refererMode:L(e.refererMode,["off","whitelist","blacklist"],t.refererMode),refererList:K(e.refererList).map(l=>l.toLowerCase()),allowEmptyReferer:R(e.allowEmptyReferer,t.allowEmptyReferer),uaBlacklist:K(e.uaBlacklist),ipBlacklist:K(e.ipBlacklist,w.LIST_MAX,64),ipWhitelist:K(e.ipWhitelist,w.LIST_MAX,64),signedUrl:{enabled:a,secret:i,ttl:T(r.ttl,je.ttl,30,86400*7),param:v(r.param,je.param,32)||"sign"},rateLimit:{enabled:R(o.enabled,wn.enabled),rpm:T(o.rpm,wn.rpm,1,1e6)},botManagement:{enabled:R(s.enabled,kn.enabled),mode:L(s.mode,["blacklist","allowlist"],kn.mode),list:K(s.list,w.LIST_MAX,256)}},errors:n}}function _r(e,n){let t=[],r=`规则[${n}]`;if(!E(e))return{value:null,errors:[`${r} 不是合法对象`]};let o=v(e.id,"",64)||`r_${n}_${Date.now().toString(36)}`,s=E(e.match)?e.match:{},a=E(e.action)?e.action:{},i=v(s.pathPrefix,"");i&&!i.startsWith("/")&&(i="/"+i);let l=Sn(s.pathRegex);l.ok||t.push(`${r} ${l.error}`);let c=K(s.extIn,100,16).map(S=>S.toLowerCase().replace(/^\./,"")),d=K(s.methodIn,10,16).map(S=>S.toUpperCase()).filter(S=>{let he=["GET","HEAD","POST","PUT","DELETE","PATCH","OPTIONS"].includes(S);return he||t.push(`${r} 存在不支持的方法: ${S}`),he}),p=ba(s.conditions,r);t.push(...p.errors);let u=xt(a.rewrite);t.push(...u.errors.map(S=>`${r} ${S}`));let h=_e(a.reqHeaders,`${r} 请求头`);t.push(...h.errors);let g=_e(a.respHeaders,`${r} 响应头`);t.push(...g.errors);let b=xa(a.redirect,r);t.push(...b.errors);let y=bt(a.clientIpHeader,r);t.push(...y.errors);let x=E(a.hostHeader)?a.hostHeader:{},P=L(x.mode,["inherit","origin","client","custom"],"inherit"),_=v(x.custom,"",w.HOST_MAX).toLowerCase();P==="custom"&&!_&&t.push(`${r} 回源 Host 为 custom 时必须填写 custom 值`);let F=L(a.engine,["","fetch","socket","r2"],""),q=L(a.scheme,["","http","https"],""),U=T(a.port,0,0,65535);return{value:{id:o,name:v(e.name,"",128),note:v(e.note,"",512),priority:T(e.priority,0,-1e5,1e5),enabled:R(e.enabled,!0),match:{conditions:p.value,pathPrefix:i,pathRegex:l.ok?l.value:"",extIn:c,methodIn:d},action:{poolId:v(a.poolId,"",64),inlineOrigins:wa(a.inlineOrigins,r),rewrite:u.value,cache:mt(a.cache),reqHeaders:h.value,respHeaders:g.value,hostHeader:{mode:P,custom:_},redirect:b.value,directResponse:ya(a.directResponse),clientIpHeader:y.value,forceHttps:R(a.forceHttps,!1),forceHttpsStatus:T(a.forceHttpsStatus,301,301,308),followRedirect:R(a.followRedirect,!1),originTimeoutMs:T(a.originTimeoutMs,0,0,12e4),engine:F,scheme:q,port:U}},errors:t}}function Ir(e){let n=_r(e,0);return n.value?(n.value.priority===0&&(e==null||e.priority==null)&&(n.value.priority=0),{ok:n.errors.length===0,value:n.value,errors:n.errors}):{ok:!1,errors:n.errors}}function wa(e,n){if(!Array.isArray(e)||e.length===0)return[];let t=[];for(let r=0;r<Math.min(e.length,w.ORIGINS_MAX);r++){let o=Hr(e[r],r);o.value&&t.push(o.value)}return t}function xe(e){let n=Cr();if(!E(e))return{ok:!1,errors:["站点配置不是合法对象"]};let t=ua(e.host);if(!t.ok)return{ok:!1,errors:[t.error]};let r=v(e.poolId,"",64),o=E(e.defaultHostHeader)?e.defaultHostHeader:{},s=L(o.mode,["accel","origin","custom"],ct.mode),a=v(o.custom,"",w.HOST_MAX).toLowerCase();s==="custom"&&!a&&n.errors.push("默认回源 Host 为 custom 时必须填写 custom 值");let i=R(e.ipv6Support,!1),l=Array.isArray(e.rules)?e.rules:[];l.length>w.RULES_MAX&&n.errors.push(`规则数量超过上限 ${w.RULES_MAX}`);let c=[],d=new Set;for(let u=0;u<Math.min(l.length,w.RULES_MAX);u++){let h=_r(l[u],u);if(n.errors.push(...h.errors),!!h.value){if(d.has(h.value.id)){n.errors.push(`规则 id 重复: ${h.value.id}`);continue}d.add(h.value.id),c.push(h.value)}}c.sort((u,h)=>h.priority-u.priority);let p=va(e.security);return n.errors.push(...p.errors),n.errors.length?{ok:!1,errors:n.errors}:{ok:!0,value:{host:t.value,enabled:R(e.enabled,Sr.enabled),ipv6Support:i,poolId:r,defaultHostHeader:{mode:s,custom:a},rules:c,security:p.value,cacheGen:T(e.cacheGen,0,0,Number.MAX_SAFE_INTEGER),updatedAt:T(e.updatedAt,0,0,Number.MAX_SAFE_INTEGER)}}}function ka(e,n,t,r){let o=v(e.r2Binding,"",64);o?/^[A-Za-z_][A-Za-z0-9_]*$/.test(o)||r.push(`${t} r2Binding 必须是合法标识符（字母/数字/下划线，且以字母或下划线开头）`):r.push(`${t} engine='r2' 时必须填写 r2Binding（R2 绑定名，如 CDN_R2）`);let s=L(e.r2KeyMode,["none","prefix","strip","regex"],"none"),a=v(e.r2KeyPrefix,""),i=v(e.r2KeyPrefixRule,""),l=v(e.r2KeyRegexTo,""),c=v(e.r2ContentType,G.r2ContentType,128)||G.r2ContentType;if(s==="prefix"||s==="strip")i||r.push(`${t} r2KeyMode='${s}' 时必须填写 r2KeyPrefixRule`);else if(s==="regex"){let x=Sn(e.r2KeyPrefixRule);x.ok?x.value||r.push(`${t} r2KeyMode='regex' 时必须填写 r2KeyPrefixRule`):r.push(`${t} r2KeyPrefixRule 正则非法: ${x.error}`)}let d=xt(e.rewrite);r.push(...d.errors);let p=_e(e.reqHeaders,`${t} reqHeaders`);r.push(...p.errors);let u=_e(e.respHeaders,`${t} respHeaders`);r.push(...u.errors);let h=mt(e.cache),g=R(e.followRedirect,G.followRedirect),b=T(e.originTimeoutMs,G.originTimeoutMs,0,6e4),y=bt(e.clientIpHeader,`${t} clientIpHeader`);return r.push(...y.errors),{value:{id:v(e.id,"",64)||`o_${n}_${Date.now().toString(36)}`,enabled:R(e.enabled,!0),order:T(e.order,n,0,1e4),weight:T(e.weight,G.weight,0,1e4),engine:"r2",scheme:"https",addr:"",port:443,pathPrefix:"",extraHeaders:Object.freeze({}),hostHeader:{mode:"inherit",custom:""},sni:null,rewrite:d.value,reqHeaders:p.value,respHeaders:u.value,cache:h,followRedirect:g,originTimeoutMs:b,clientIpHeader:y.value,r2Binding:o,r2KeyPrefix:a,r2KeyMode:s,r2KeyPrefixRule:i,r2KeyRegexTo:l,r2ContentType:c},errors:r}}function Hr(e,n){let t=[],r=`源站[${n}]`;if(!E(e))return{value:null,errors:[`${r} 不是合法对象`]};let o=L(e.engine,["fetch","socket","r2"],G.engine);if(o==="r2")return ka(e,n,r,t);let s=fa(e.addr);if(!s.ok)return{value:null,errors:[`${r} ${s.error}`]};let a=L(e.scheme,["http","https"],G.scheme),i=T(e.port,a==="https"?443:80,1,65535),l=v(e.pathPrefix,"");l&&(l.startsWith("/")||(l="/"+l),l=l.replace(/\/+$/,""));let c=Pr(e.extraHeaders,`${r} extraHeaders`);t.push(...c.errors);let d=E(e.hostHeader)?e.hostHeader:{},p=L(d.mode,["inherit","origin","client","custom"],"inherit"),u=v(d.custom,"",w.HOST_MAX).toLowerCase();p==="custom"&&!u&&t.push(`${r} hostHeader 为 custom 时必须填写 custom 值`),o==="fetch"&&(p==="client"||p==="custom")&&t.push(`${r} fetch 引擎不支持自定义 Host 头（平台限制会静默丢弃），请改用 socket 引擎（仅 Cloudflare Workers）或将 hostHeader 设为 inherit`);let h=xt(e.rewrite);t.push(...h.errors);let g=_e(e.reqHeaders,`${r} reqHeaders`);t.push(...g.errors);let b=_e(e.respHeaders,`${r} respHeaders`);t.push(...b.errors);let y=mt(e.cache),x=R(e.followRedirect,G.followRedirect),P=T(e.originTimeoutMs,G.originTimeoutMs,0,6e4),_=bt(e.clientIpHeader,`${r} clientIpHeader`);return t.push(..._.errors),{value:{id:v(e.id,"",64)||`o_${n}_${Date.now().toString(36)}`,enabled:R(e.enabled,!0),order:T(e.order,n,0,1e4),weight:T(e.weight,G.weight,0,1e4),engine:o,scheme:a,addr:s.value,port:i,pathPrefix:l,extraHeaders:c.value,hostHeader:{mode:p,custom:u},sni:e.sni?v(e.sni,"",w.HOST_MAX).toLowerCase():null,rewrite:h.value,reqHeaders:g.value,respHeaders:b.value,cache:y,followRedirect:x,originTimeoutMs:P,clientIpHeader:_.value,r2Binding:"",r2KeyPrefix:"",r2KeyMode:"none",r2KeyPrefixRule:"",r2KeyRegexTo:"",r2ContentType:G.r2ContentType},errors:t}}function Sa(e){let n=Pe;if(!E(e))return D(n);let t=[];if(Array.isArray(e.retryOn)){let r=new Set;for(let o of e.retryOn){let s=T(o,0,100,599);s>=100&&s<=599&&!r.has(s)&&(r.add(s),t.push(s))}}return t.length===0&&(t=[...Re]),{enabled:R(e.enabled,n.enabled),retryOn:t,maxRetries:T(e.maxRetries,n.maxRetries,0,10),timeoutMs:T(e.timeoutMs,n.timeoutMs,1e3,6e4)}}function V(e,n){let t=Cr();if(!E(e))return{ok:!1,errors:["源站池配置不是合法对象"]};let r=v(e.id,"",64);r||(r=pa());let o=v(e.name,"",64).trim(),s=L(e.kind,Ar,ht.kind),a=Array.isArray(e.origins)?e.origins:[];if(a.length===0)return{ok:!1,errors:[s==="single"?"单一源站必须填写源站地址":"源站池至少需要配置一个源站"]};if(s==="single"&&a.length>1)return{ok:!1,errors:["单一源站只能包含 1 个源站；需要多个请改用「源站池」类型"]};a.length>w.ORIGINS_MAX&&t.errors.push(`源站数量超过上限 ${w.ORIGINS_MAX}`);let i=[],l=new Set;for(let d=0;d<Math.min(a.length,w.ORIGINS_MAX);d++){let p=Hr(a[d],d);if(t.errors.push(...p.errors),!!p.value){if(l.has(p.value.id)){t.errors.push(`源站 id 重复: ${p.value.id}`);continue}l.add(p.value.id),i.push(p.value)}}i.length===0&&t.errors.length===0&&t.errors.push("没有任何有效的源站");let c=s==="single"?"chain":L(e.strategy,["chain","roundrobin","random","weighted","iphash"],ht.strategy);return c==="weighted"&&i.length>0&&i.filter(p=>p.enabled).reduce((p,u)=>p+u.weight,0)<=0&&t.errors.push("权重策略下，启用的源站权重之和必须大于 0"),i.length>0&&!i.some(d=>d.enabled)&&t.errors.push("至少需要启用一个源站"),n&&n.hasSocket===!1&&i.forEach((d,p)=>{d.engine==="socket"&&t.errors.push(`源站[${p}] 使用了 socket 引擎，但当前平台（${n.platform||"unknown"}）不支持 TCP Socket；请改用 fetch 引擎`)}),t.errors.length?{ok:!1,errors:t.errors}:(i.sort((d,p)=>d.order-p.order),{ok:!0,value:{id:r,name:o||r,kind:s,strategy:c,origins:i,failover:Sa(e.failover),createdBy:v(e.createdBy,"",w.HOST_MAX).toLowerCase(),updatedAt:T(e.updatedAt,0,0,Number.MAX_SAFE_INTEGER)}})}function Aa(e){let n=Ke;if(!E(e))return D(n);let t=L(e.mode,["static","proxy","none"],n.mode),r=v(e.target,"",512),o="";if(r)try{let s=new URL(r);(s.protocol==="http:"||s.protocol==="https:")&&(o=s.toString())}catch{o=""}return t==="proxy"&&!o&&(t="static"),{mode:t,target:o,status:T(e.status,n.status,200,599)}}function ye(e,n,t){let r=xn,o=E(t)?t:{};if(!E(e))return{ok:!0,value:D(r)};let s=e.adminPath,i=s==null||String(s).trim()===""?o.adminPath!=null&&o.adminPath!==""?o.adminPath:r.adminPath:String(s).trim().replace(/^\/+/,"").replace(/\/+$/,"");(!i||!/^[a-zA-Z0-9_-]+$/.test(i))&&(i=o.adminPath&&/^[a-zA-Z0-9_-]+$/.test(o.adminPath)?o.adminPath:r.adminPath);let l=e.tokenTtl,d=l==null||String(l).trim()===""?o.tokenTtl!=null?o.tokenTtl:r.tokenTtl:T(l,r.tokenTtl,300,86400*30),p=e.configCacheTtl,h=p==null||String(p).trim()===""?o.configCacheTtl!=null?o.configCacheTtl:r.configCacheTtl:T(p,r.configCacheTtl,0,600),g=T(e.globalRateLimit,r.globalRateLimit,0,1e6);g>0&&g<10&&(g=10);let b={adminPath:i,passwordHash:v(e.passwordHash,"",512),passwordSalt:v(e.passwordSalt,"",512),tokenTtl:d,statsEnabled:R(e.statsEnabled,r.statsEnabled),statsDriver:L(e.statsDriver,["kv","d1","none"],r.statsDriver),configCacheTtl:h,globalRateLimit:g,disguise:Aa(e.disguise),version:v(e.version,be,32)},y=Ta(b,n);return y.length?{ok:!1,errors:y}:{ok:!0,value:b}}function Ta(e,n){let t=[];return n&&n.hasD1===!1&&e.statsDriver==="d1"&&t.push(`统计驱动设为 d1，但当前平台（${n.platform||"unknown"}）不支持 D1；请改用 'kv' 或 'none'`),t}var w,E,ee=X(()=>{ae();N();w=Object.freeze({HOST_MAX:253,RULES_MAX:50,ORIGINS_MAX:20,LIST_MAX:200,REGEX_MAX:200,STR_MAX:2048,HEADERS_MAX:30,TTL_MAX:31536e3});E=e=>e!==null&&typeof e=="object"&&!Array.isArray(e)});var $r={};ze($r,{deletePool:()=>St,deleteSite:()=>wt,getGlobal:()=>H,getGlobalRules:()=>ke,getPool:()=>ce,getSite:()=>j,invalidateMemCache:()=>le,listAllSites:()=>ve,listPools:()=>we,listSites:()=>Cn,putGlobal:()=>Ne,putGlobalRules:()=>At,putPool:()=>te,putSite:()=>Q});function Xe(e){let n=Y.get(e);if(n){if(Date.now()>n.expireAt){Y.delete(e);return}return Y.delete(e),Y.set(e,n),n.value}}function ie(e,n){let t=Tn>0?Tn:Ca;if(Y.size>=Ra){let r=Y.keys().next().value;r!==void 0&&Y.delete(r)}Y.set(e,{value:n,expireAt:Date.now()+t})}function yt(e){Y.delete(e)}function le(){Y.clear()}function vt(e){let n=O(e.env);if(!n){let r=e?.caps?.platform==="edgeone"?"未检测到 KV 绑定，配置无法保存。EdgeOne 请在「项目设置 → 存储绑定」中创建 KV 命名空间，并以 CDN_KV 为变量名绑定到本项目（KV 仅在 Edge Functions 中可用）":"未检测到 KV 绑定，配置无法保存。请先创建 KV Namespace 并以 CDN_KV 为变量名绑定到本项目";throw new Error(r)}return n}async function ne(e,n){let t=O(e.env);if(!t)return null;try{return await t.get(n,"json")}catch(r){return console.error(`[store] 读取 ${n} 失败:`,r?.message),null}}async function De(e,n,t){await vt(e).put(n,JSON.stringify(t))}async function H(e){let n=Xe(Ie);if(n)return n;let t=await ne(e,Ie),r;t?r=ye(t).value:r=Rr();let o=e.env?.ADMIN_PATH;typeof o=="string"&&/^[a-zA-Z0-9_/-]+$/.test(o)&&(r.adminPath==="__panel"||r.adminPath==null||r.adminPath==="")&&(r.adminPath=o.replace(/^\/+/,"").replace(/\/+$/,"")||r.adminPath);let s=Math.max(0,(r.configCacheTtl??60)*1e3);return e?.caps?.platform==="edgeone"&&s<Or&&(s=Or),Tn=s,ie(Ie,r),r}async function Ne(e,n){let r={...ye(n).value,passwordHash:n.passwordHash||"",passwordSalt:n.passwordSalt||""};await De(e,Ie,r),yt(Ie),ie(Ie,r),Tn=Math.max(0,(r.configCacheTtl??30)*1e3)}async function Rn(e){let n=Xe(He);if(n)return n;let t=await ne(e,He),r=t&&Array.isArray(t.hosts)?{hosts:t.hosts.filter(o=>typeof o=="string"),wildcards:Array.isArray(t.wildcards)?t.wildcards:[]}:D(Tr);return ie(He,r),r}async function Lr(e,n){await De(e,He,n),yt(He),ie(He,n)}function Pa(e,n){if(!e.startsWith("*."))return!1;let t=e.slice(2);return n.endsWith("."+t)}async function j(e,n,t={}){if(!n||typeof n!="string")return null;let r=n.toLowerCase(),o=`${Le(r)}${t.exact?"#e":""}`,s=Xe(o);if(s!==void 0)return s;let a=await ne(e,Le(r));if(!a&&!t.exact){let c=[...(await Rn(e)).wildcards||[]].sort((d,p)=>(p.pattern?.length||0)-(d.pattern?.length||0));for(let d of c)if(d?.pattern&&Pa(d.pattern,r)){a=await ne(e,Le(d.pattern));break}}let i=a||null;return ie(o,i),i}async function Q(e,n){let t=String(n.host).toLowerCase(),r=await Rn(e),o=t.startsWith("*."),s=!1;r.hosts.includes(t)||(r.hosts.push(t),s=!0),o&&((r.wildcards||[]).some(i=>i.pattern===t)||(r.wildcards=[...r.wildcards||[],{pattern:t,host:t}],s=!0)),s&&await Lr(e,r),await De(e,Le(t),n),le()}async function wt(e,n){let t=String(n).toLowerCase(),r=vt(e),o=await Rn(e);o.hosts=o.hosts.filter(s=>s!==t),o.wildcards=(o.wildcards||[]).filter(s=>s.pattern!==t),await Lr(e,o),await r.delete(Le(t)),le()}async function Cn(e,n){let r=(await Rn(e)).hosts||[];if(r.length===0)return{sites:[],total:0,offset:0,truncated:!1};let o=Math.max(0,Math.floor(Number(n?.offset)||0)),s=Math.floor(Number(n?.limit)||An),a=Math.min(Math.max(s,1),An),i=r.slice(o,o+a),l=[],c=10;for(let d=0;d<i.length;d+=c){let p=i.slice(d,d+c),u=await Promise.all(p.map(h=>ne(e,Le(h))));for(let h of u)h&&l.push(h)}return{sites:l,total:r.length,offset:o,truncated:o+i.length<r.length}}async function ve(e){let n=[],t=0,r=!1;for(;;){let o=await Cn(e,{offset:t,limit:An});if(n.push(...o.sites),!o.truncated)break;if(t+=An,n.length>=Ea){r=!0;break}}return{sites:n,truncated:r}}async function kt(e){let n=Xe(Oe);if(n)return n;let t=await ne(e,Oe),r=t&&Array.isArray(t.ids)?{ids:t.ids.filter(o=>typeof o=="string")}:D(Er);return ie(Oe,r),r}async function Dr(e,n){await De(e,Oe,n),yt(Oe),ie(Oe,n)}async function ce(e,n){if(!n||typeof n!="string")return null;let t=En(n),r=Xe(t);if(r!==void 0)return r;let o=await ne(e,t)||null;return ie(t,o),o}async function te(e,n){let t=String(n.id);await De(e,En(t),n);let r=await kt(e);r.ids.includes(t)||(r.ids.push(t),await Dr(e,r)),le()}async function St(e,n){let t=String(n);await vt(e).delete(En(t));let o=await kt(e);o.ids=o.ids.filter(s=>s!==t),await Dr(e,o),le()}async function we(e){let t=(await kt(e)).ids||[];if(t.length===0)return[];let r=[],o=10;for(let s=0;s<t.length;s+=o){let a=t.slice(s,s+o),i=await Promise.all(a.map(l=>ne(e,En(l))));for(let l of i)l&&r.push(l)}return r}async function ke(e){let n=await ne(e,Nr);return!n||!Array.isArray(n.rules)?[]:n.rules}async function At(e,n){await De(e,Nr,{rules:Array.isArray(n)?n:[]}),le()}var Ie,He,Oe,Le,En,An,Ea,Y,Ra,Tn,Ca,Or,Nr,$=X(()=>{se();ae();ee();Ie="cfg:global",He="site:_index",Oe="pool:_index",Le=e=>`site:${e}`,En=e=>`pool:${e}`,An=30,Ea=300,Y=new Map,Ra=500,Tn=3e4,Ca=1e3,Or=12e4;Nr="cfg:global_rules"});var Bt={};ze(Bt,{clearStats:()=>li,isAvailable:()=>ri,listStatHosts:()=>ii,pruneStats:()=>ci,queryStats:()=>ai,writeStats:()=>oi});function Me(e){try{let n=e||{};for(let t of["CDN_DB","DB","D1"]){let r=n[t];if(r&&typeof r.prepare=="function"&&typeof r.batch=="function")return r}for(let t of["CDN_DB","DB","D1"]){let r=n[t];if(r&&typeof r.prepare=="function")return r}return null}catch{return null}}function ri(e){return Me(e&&e.env)!==null}async function en(e){if(Ft)return!0;try{let n=[e.prepare(`CREATE TABLE IF NOT EXISTS ${pe} (
           host        TEXT    NOT NULL,
           hour        TEXT    NOT NULL,
           requests    INTEGER NOT NULL DEFAULT 0,
           status_2xx  INTEGER NOT NULL DEFAULT 0,
           status_3xx  INTEGER NOT NULL DEFAULT 0,
           status_4xx  INTEGER NOT NULL DEFAULT 0,
           status_5xx  INTEGER NOT NULL DEFAULT 0,
           status_other INTEGER NOT NULL DEFAULT 0,
           bytes       INTEGER NOT NULL DEFAULT 0,
           cache_hit   INTEGER NOT NULL DEFAULT 0,
           cache_miss  INTEGER NOT NULL DEFAULT 0,
           dur_sum     INTEGER NOT NULL DEFAULT 0,
           dur_p95     INTEGER NOT NULL DEFAULT 0,
           updated_at  INTEGER NOT NULL DEFAULT 0,
           PRIMARY KEY (host, hour)
         )`),e.prepare(`CREATE INDEX IF NOT EXISTS idx_${pe}_hour ON ${pe} (hour)`),e.prepare(`CREATE TABLE IF NOT EXISTS stats_origin_hourly (
           host      TEXT    NOT NULL,
           hour      TEXT    NOT NULL,
           origin_id TEXT    NOT NULL,
           requests  INTEGER NOT NULL DEFAULT 0,
           PRIMARY KEY (host, hour, origin_id)
         )`)];if(typeof e.batch=="function")await e.batch(n);else for(let t of n)await t.run();return Ft=!0,!0}catch{return!1}}function qt(e){let n=new Date(Number.isFinite(e)?e:Date.now());return`${n.getUTCFullYear()}`+String(n.getUTCMonth()+1).padStart(2,"0")+String(n.getUTCDate()).padStart(2,"0")+String(n.getUTCHours()).padStart(2,"0")}function Ut(e){return String(e||"unknown").toLowerCase().replace(/[^a-z0-9.\-_*]/g,"").slice(0,128)||"unknown"}function C(e){let n=Math.round(Number(e));return Number.isFinite(n)&&n>0?n:0}async function oi(e,n){let t=Me(e&&e.env);if(!t)return!1;if(!Array.isArray(n)||n.length===0)return!0;if(!await en(t))return!1;let o=qt(),s=Date.now(),a=`INSERT INTO ${pe}
      (host, hour, requests, status_2xx, status_3xx, status_4xx, status_5xx,
       status_other, bytes, cache_hit, cache_miss, dur_sum, dur_p95, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
    ON CONFLICT (host, hour) DO UPDATE SET
      requests     = requests     + excluded.requests,
      status_2xx   = status_2xx   + excluded.status_2xx,
      status_3xx   = status_3xx   + excluded.status_3xx,
      status_4xx   = status_4xx   + excluded.status_4xx,
      status_5xx   = status_5xx   + excluded.status_5xx,
      status_other = status_other + excluded.status_other,
      bytes        = bytes        + excluded.bytes,
      cache_hit    = cache_hit    + excluded.cache_hit,
      cache_miss   = cache_miss   + excluded.cache_miss,
      dur_sum      = dur_sum      + excluded.dur_sum,
      dur_p95      = MAX(dur_p95, excluded.dur_p95),
      updated_at   = excluded.updated_at`,i=`INSERT INTO stats_origin_hourly (host, hour, origin_id, requests)
    VALUES (?1, ?2, ?3, ?4)
    ON CONFLICT (host, hour, origin_id) DO UPDATE SET
      requests = requests + excluded.requests`,l=[];for(let c of n){let d=Ut(c&&c.host),p=C(c.requests),u=C(c.durSum)||C(c.durAvg)*p;if(l.push(t.prepare(a).bind(d,o,p,C(c.status2xx),C(c.status3xx),C(c.status4xx),C(c.status5xx),C(c.statusOther),C(c.bytes),C(c.cacheHit),C(c.cacheMiss),u,C(c.durP95),s)),c.origins&&typeof c.origins=="object")for(let[h,g]of Object.entries(c.origins))l.push(t.prepare(i).bind(d,o,String(h).slice(0,64),C(g)))}try{if(typeof t.batch=="function")await t.batch(l);else for(let c of l)await c.run();return!0}catch(c){try{console.warn("[stats/d1] 写入失败：",String(c&&c.message||c))}catch{}return Ft=!1,!1}}function No(){return{requests:0,status2xx:0,status3xx:0,status4xx:0,status5xx:0,statusOther:0,bytes:0,cacheHit:0,cacheMiss:0,durSum:0,durAvg:0,cacheHitRate:0}}function si(e){let n=C(e.requests),t=C(e.cache_hit),r=C(e.cache_miss),o=C(e.dur_sum),s=t+r;return{hour:e.hour,requests:n,status2xx:C(e.status_2xx),status3xx:C(e.status_3xx),status4xx:C(e.status_4xx),status5xx:C(e.status_5xx),statusOther:C(e.status_other),bytes:C(e.bytes),cacheHit:t,cacheMiss:r,durSum:o,durP95:C(e.dur_p95),durAvg:n>0?Math.round(o/n):0,cacheHitRate:s>0?Math.round(t/s*1e4)/100:0}}async function ai(e,n,t=24){let r=Math.min(ti,Math.max(1,Math.floor(Number(t)||24))),o=Ut(n),s={driver:"d1",host:o,hours:r,total:No(),series:[],available:!1},a=Me(e&&e.env);if(!a||!await en(a))return s;s.available=!0;let l=qt(Date.now()-(r-1)*36e5);try{let c=await a.prepare(`SELECT * FROM ${pe} WHERE host = ?1 AND hour >= ?2 ORDER BY hour ASC LIMIT ?3`).bind(o,l,r).all(),d=c&&c.results||[],p=No();for(let h of d){let g=si(h);s.series.push(g),p.requests+=g.requests,p.status2xx+=g.status2xx,p.status3xx+=g.status3xx,p.status4xx+=g.status4xx,p.status5xx+=g.status5xx,p.statusOther+=g.statusOther,p.bytes+=g.bytes,p.cacheHit+=g.cacheHit,p.cacheMiss+=g.cacheMiss,p.durSum+=g.durSum}p.durAvg=p.requests>0?Math.round(p.durSum/p.requests):0;let u=p.cacheHit+p.cacheMiss;p.cacheHitRate=u>0?Math.round(p.cacheHit/u*1e4)/100:0,s.total=p;try{let h=await a.prepare(`SELECT origin_id, SUM(requests) AS n FROM stats_origin_hourly
           WHERE host = ?1 AND hour >= ?2 GROUP BY origin_id ORDER BY n DESC LIMIT 32`).bind(o,l).all(),g={};for(let b of h&&h.results||[])g[b.origin_id]=C(b.n);s.total.origins=g}catch{s.total.origins={}}}catch(c){try{console.warn("[stats/d1] 查询失败：",String(c&&c.message||c))}catch{}}return s}async function ii(e){let n=Me(e&&e.env);if(!n)return[];if(!await en(n))return[];try{let t=await n.prepare(`SELECT DISTINCT host FROM ${pe} LIMIT 500`).all();return(t&&t.results||[]).map(r=>r.host)}catch{return[]}}async function li(e,n){let t=Me(e&&e.env);if(!t||!await en(t))return!1;let r=Ut(n);try{let o=[t.prepare(`DELETE FROM ${pe} WHERE host = ?1`).bind(r),t.prepare("DELETE FROM stats_origin_hourly WHERE host = ?1").bind(r)];if(typeof t.batch=="function")await t.batch(o);else for(let s of o)await s.run();return!0}catch{return!1}}async function ci(e,n=30){let t=Me(e&&e.env);if(!t||!await en(t))return!1;let r=Math.max(1,Math.floor(Number(n)||30)),o=qt(Date.now()-r*24*36e5);try{let s=[t.prepare(`DELETE FROM ${pe} WHERE hour < ?1`).bind(o),t.prepare("DELETE FROM stats_origin_hourly WHERE hour < ?1").bind(o)];if(typeof t.batch=="function")await t.batch(s);else for(let a of s)await a.run();return!0}catch{return!1}}var pe,Ft,ti,zt=X(()=>{pe="stats_hourly",Ft=!1,ti=2160});var rn={};ze(rn,{KV_STATS_META:()=>bi,clearStats:()=>mi,hourKey:()=>qe,listStatHosts:()=>gi,queryStats:()=>hi,writeStats:()=>ui});function qe(e){let n=new Date(Number.isFinite(e)?e:Date.now()),t=n.getUTCFullYear(),r=String(n.getUTCMonth()+1).padStart(2,"0"),o=String(n.getUTCDate()).padStart(2,"0"),s=String(n.getUTCHours()).padStart(2,"0");return`${t}${r}${o}${s}`}function Gt(e){return String(e||"unknown").toLowerCase().replace(/[^a-z0-9.\-_*]/g,"").slice(0,128)||"unknown"}function Mo(e,n,t){return`${tn}${e}:${n}:${t}`}function $o(e,n){return`${tn}${e}:${n}:c`}function Te(){return{requests:0,status2xx:0,status3xx:0,status4xx:0,status5xx:0,statusOther:0,bytes:0,cacheHit:0,cacheMiss:0,durSum:0,durP95Max:0,origins:{}}}function nn(e,n){if(!n||typeof n!="object")return e;if(e.requests+=M(n.requests),e.status2xx+=M(n.status2xx),e.status3xx+=M(n.status3xx),e.status4xx+=M(n.status4xx),e.status5xx+=M(n.status5xx),e.statusOther+=M(n.statusOther),e.bytes+=M(n.bytes),e.cacheHit+=M(n.cacheHit),e.cacheMiss+=M(n.cacheMiss),e.durSum+=M(n.durSum)||M(n.durAvg)*M(n.requests),e.durP95Max=Math.max(e.durP95Max,M(n.durP95)),n.origins&&typeof n.origins=="object")for(let[t,r]of Object.entries(n.origins))e.origins[t]=(e.origins[t]||0)+M(r);return e}function M(e){let n=Number(e);return Number.isFinite(n)&&n>0?n:0}async function ui(e,n){let t=O(e&&e.env);if(!t)return!1;if(!Array.isArray(n)||n.length===0)return!0;let r=qe(),o=[];for(let s of n){let a=Gt(s&&s.host),i=Math.floor(Math.random()*Fe),l=Mo(a,r,i);o.push((async()=>{try{let c=await t.get(l,"json"),d=nn(c?{...Te(),...fi(c)}:Te(),s);d.host=a,d.hour=r,d.updatedAt=Date.now(),await t.put(l,JSON.stringify(d),{expirationTtl:Gn})}catch{}})())}return await Promise.all(o),!0}function fi(e){let n=Te();return nn(n,e)}async function hi(e,n,t=24){let r=O(e&&e.env),o=Math.min(di,Math.max(1,Math.floor(Number(t)||24))),s={driver:"kv",host:Gt(n),hours:o,total:Te(),series:[],available:!!r};if(!r)return s;let a=Date.now(),i=[];for(let u=o-1;u>=0;u--)i.push(qe(a-u*36e5));let l=s.host,c=qe(a),d=pi,p=await Promise.all(i.map(async u=>{let h=u!==c;if(h)try{let x=await r.get($o(l,u),"json");if(x)return{hour:u,...zn(nn(Te(),x))}}catch{}if(h&&d<Fe)return s.partial=!0,{hour:u,...zn(Te())};d-=Fe;let g=Te(),b=await Promise.all(Array.from({length:Fe},(x,P)=>r.get(Mo(l,u,P),"json").catch(()=>null))),y=!1;for(let x of b)x&&(nn(g,x),y=!0);if(h&&y)try{let x={...g,host:l,hour:u,compacted:!0};await r.put($o(l,u),JSON.stringify(x),{expirationTtl:Gn})}catch{}return{hour:u,...zn(g)}}));for(let u of p)s.series.push(u),nn(s.total,u);return s.total=zn(s.total),s}function zn(e){let n=e.cacheHit+e.cacheMiss;return{...e,durAvg:e.requests>0?Math.round(e.durSum/e.requests):0,cacheHitRate:n>0?Math.round(e.cacheHit/n*1e4)/100:0}}async function gi(e){let n=O(e&&e.env);if(!n||typeof n.list!="function")return[];let t=[qe(),qe(Date.now()-36e5)],r=new Set;for(let o of t)try{let s;do{let a=await n.list({prefix:tn,cursor:s,limit:1e3});for(let i of a.keys||[]){let c=i.name.slice(tn.length).split(":");c.length>=3&&c[c.length-2]===o&&r.add(c.slice(0,c.length-2).join(":"))}s=a.list_complete?null:a.cursor}while(s)}catch{break}return Array.from(r)}async function mi(e,n){let t=O(e&&e.env);if(!t||typeof t.list!="function")return 0;let r=`${tn}${Gt(n)}:`,o=0;try{let s;do{let a=await t.list({prefix:r,cursor:s,limit:1e3});await Promise.all((a.keys||[]).map(async i=>{try{await t.delete(i.name),o+=1}catch{}})),s=a.list_complete?null:a.cursor}while(s)}catch{}return o}var Fe,Gn,tn,di,pi,bi,on=X(()=>{se();Fe=8,Gn=72*3600,tn="stat:",di=Math.min(336,Math.ceil(Gn/3600)+24),pi=Fe*3;bi=Object.freeze({shardCount:Fe,ttlSec:Gn})});var Qt={};ze(Qt,{UI_CSS:()=>Ki,UI_HTML:()=>Gi,UI_JS:()=>ji});var Gi,Ki,ji,Jt=X(()=>{Gi=`<!DOCTYPE html><html lang="zh-CN" data-theme="auto"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="dark light"><meta name="robots" content="noindex,nofollow"><title>EdgeCDN 控制台</title><link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><text y='26' font-size='26'>⚡</text></svg>">
<style>:root{--bg:#0e1116;--bg-soft:#151a21;--panel:#171d26;--panel-2:#1d2430;--border:#262e3b;--border-soft:#1f2733;--text:#e6edf3;--text-dim:#9aa7b6;--text-mute:#6b7888;--primary:#3b82f6;--primary-hover:#2f74e6;--primary-soft:rgba(59,130,246,.14);--success:#22c55e;--warn:#f59e0b;--danger:#ef4444;--danger-soft:rgba(239,68,68,.13);--info:#38bdf8;--shadow:0 8px 28px rgba(0,0,0,.45);--radius:10px;--radius-sm:7px;--sidebar-w:216px;--mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace}@media (prefers-color-scheme:light){:root[data-theme="auto"]{--bg:#f4f6f9;--bg-soft:#eceff4;--panel:#ffffff;--panel-2:#f7f9fc;--border:#dde3ec;--border-soft:#e8edf4;--text:#16202c;--text-dim:#55637a;--text-mute:#8794a8;--primary-soft:rgba(59,130,246,.1);--danger-soft:rgba(239,68,68,.08);--shadow:0 8px 28px rgba(19,32,51,.12)}}:root[data-theme="light"]{--bg:#f4f6f9;--bg-soft:#eceff4;--panel:#ffffff;--panel-2:#f7f9fc;--border:#dde3ec;--border-soft:#e8edf4;--text:#16202c;--text-dim:#55637a;--text-mute:#8794a8;--primary-soft:rgba(59,130,246,.1);--danger-soft:rgba(239,68,68,.08);--shadow:0 8px 28px rgba(19,32,51,.12)}*{box-sizing:border-box}html,body{margin:0;padding:0;height:100%}body{background:var(--bg);color:var(--text);font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei","Helvetica Neue",Arial,sans-serif;-webkit-font-smoothing:antialiased;overflow-wrap:break-word}a{color:var(--primary);text-decoration:none}h1,h2,h3,h4{margin:0;font-weight:600}[hidden]{display:none !important}.grow{flex:1}.mono{font-family:var(--mono);font-size:12.5px}.nowrap{white-space:nowrap}::-webkit-scrollbar{width:10px;height:10px}::-webkit-scrollbar-thumb{background:var(--border);border-radius:6px;border:2px solid transparent;background-clip:content-box}::-webkit-scrollbar-thumb:hover{background:var(--text-mute);background-clip:content-box}:focus-visible{outline:2px solid var(--primary);outline-offset:2px}.login-wrap{min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:20px;background:radial-gradient(1000px 480px at 50% -8%,var(--primary-soft),transparent 62%),var(--bg)}.login-card{width:100%;max-width:380px;background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:34px 28px 26px;box-shadow:var(--shadow)}.login-logo{font-size:40px;text-align:center;line-height:1}.login-title{text-align:center;font-size:20px;margin-top:12px}.login-sub{text-align:center;color:var(--text-dim);font-size:13px;margin:6px 0 22px}.login-foot{text-align:center;color:var(--text-mute);font-size:12px;margin:16px 0 0}.pwd-box{position:relative}.pwd-box .input{padding-right:40px}.pwd-eye{position:absolute;right:4px;top:50%;transform:translateY(-50%);background:none;border:0;cursor:pointer;font-size:15px;padding:6px 8px;border-radius:6px;opacity:.65}.pwd-eye:hover{opacity:1}.app{display:flex;min-height:100dvh}.sidebar{width:var(--sidebar-w);flex:0 0 var(--sidebar-w);background:var(--bg-soft);border-right:1px solid var(--border);display:flex;flex-direction:column;position:sticky;top:0;height:100dvh}.brand{display:flex;align-items:center;gap:9px;padding:16px 16px 14px;border-bottom:1px solid var(--border-soft)}.brand-logo{font-size:20px}.brand-text{font-weight:700;font-size:16px;letter-spacing:.3px}.sidebar-close{display:none;margin-left:auto}.nav{padding:10px 8px;display:flex;flex-direction:column;gap:2px;overflow-y:auto}.nav-item{display:flex;align-items:center;gap:10px;padding:9px 11px;border-radius:var(--radius-sm);color:var(--text-dim);font-size:13.5px;transition:background .15s,color .15s}.nav-item:hover{background:var(--panel-2);color:var(--text)}.nav-item.active{background:var(--primary-soft);color:var(--primary);font-weight:600}.nav-ico{font-size:15px;width:18px;text-align:center}.sidebar-foot{margin-top:auto;padding:12px;border-top:1px solid var(--border-soft)}.plat-badge{font-size:11.5px;color:var(--text-mute);background:var(--panel);border:1px solid var(--border-soft);border-radius:6px;padding:6px 8px;text-align:center;font-family:var(--mono)}.main{flex:1;min-width:0;display:flex;flex-direction:column}.topbar{height:56px;display:flex;align-items:center;gap:12px;padding:0 18px;border-bottom:1px solid var(--border);background:color-mix(in srgb,var(--bg) 82%,transparent);backdrop-filter:blur(8px);position:sticky;top:0;z-index:20}.page-title{font-size:16px}.topbar-actions{margin-left:auto;display:flex;align-items:center;gap:8px}.menu-btn{display:none}.content{padding:20px;max-width:1220px;width:100%}.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:8px 14px;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--panel-2);color:var(--text);font-size:13.5px;font-family:inherit;cursor:pointer;white-space:nowrap;transition:background .15s,border-color .15s,opacity .15s}.btn:hover:not(:disabled){border-color:var(--text-mute)}.btn:disabled{opacity:.5;cursor:not-allowed}.btn-primary{background:var(--primary);border-color:var(--primary);color:#fff}.btn-primary:hover:not(:disabled){background:var(--primary-hover);border-color:var(--primary-hover)}.btn-danger{background:var(--danger);border-color:var(--danger);color:#fff}.btn-danger:hover:not(:disabled){filter:brightness(1.08)}.btn-ghost{background:transparent}.btn-ghost:hover:not(:disabled){background:var(--panel-2)}.btn-sm{padding:5px 10px;font-size:12.5px}.btn-xs{padding:3px 8px;font-size:12px;border-radius:5px}.btn-block{width:100%;padding:10px;font-size:14.5px;margin-top:4px}.btn-link{background:none;border:0;color:var(--primary);cursor:pointer;padding:2px 4px;font-size:13px;font-family:inherit}.btn-danger-text{color:var(--danger)}.icon-btn{background:none;border:0;color:var(--text-dim);cursor:pointer;font-size:16px;padding:6px 8px;border-radius:6px;line-height:1}.icon-btn:hover{background:var(--panel-2);color:var(--text)}.field{margin-bottom:15px}.label{display:block;font-size:12.5px;color:var(--text-dim);margin-bottom:6px;font-weight:500}.label .req{color:var(--danger);margin-left:2px}.form-field{margin-bottom:12px}.field-hint{font-size:12px;line-height:1.5;margin-top:4px;color:var(--text-mute)}.input,.select,.textarea{width:100%;padding:8px 11px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text);font:inherit;font-size:13.5px;transition:border-color .15s,box-shadow .15s}.input:focus,.select:focus,.textarea:focus{outline:none;border-color:var(--primary);box-shadow:0 0 0 3px var(--primary-soft)}.input::placeholder,.textarea::placeholder{color:var(--text-mute)}.input:disabled,.select:disabled{opacity:.55;cursor:not-allowed}.input.invalid,.textarea.invalid{border-color:var(--danger)}.textarea{resize:vertical;min-height:74px;font-family:var(--mono);font-size:12.5px}.select{cursor:pointer;appearance:none;padding-right:30px;background-image:linear-gradient(45deg,transparent 50%,var(--text-mute) 50%),linear-gradient(135deg,var(--text-mute) 50%,transparent 50%);background-position:right 14px center,right 9px center;background-size:5px 5px,5px 5px;background-repeat:no-repeat}.hint{font-size:12px;color:var(--text-mute);margin-top:5px}.err{font-size:12px;color:var(--danger);margin-top:5px}.hint.warn{color:var(--warn,#d97706);background:color-mix(in srgb,var(--warn,#d97706) 10%,transparent);border-left:3px solid var(--warn,#d97706);padding:8px 10px;border-radius:var(--radius-sm,6px)}.tpl-params{margin:10px 0 4px;padding:12px 14px;background:var(--bg-soft,rgba(127,127,127,.06));border-left:3px solid var(--primary,#3b82f6);border-radius:var(--radius-sm,6px)}.tpl-params>.hint{margin:0 0 10px}.tpl-params .form-field:last-child{margin-bottom:0}.row{display:flex;gap:12px;flex-wrap:wrap}.row>.field{flex:1;min-width:150px}.grid-2{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:0 12px}.switch{display:inline-flex;align-items:center;gap:9px;cursor:pointer;user-select:none}.switch input{position:absolute;opacity:0;width:0;height:0}.switch-track{width:38px;height:21px;border-radius:11px;background:var(--border);position:relative;transition:background .18s;flex:0 0 auto}.switch-track::after{content:"";position:absolute;width:17px;height:17px;border-radius:50%;background:#fff;top:2px;left:2px;transition:transform .18s;box-shadow:0 1px 3px rgba(0,0,0,.3)}.switch input:checked+.switch-track{background:var(--primary)}.switch input:checked+.switch-track::after{transform:translateX(17px)}.switch input:disabled+.switch-track{opacity:.5}.switch-label{font-size:13.5px}.radio-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px}.radio-card{display:flex;gap:9px;padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);cursor:pointer;background:var(--panel-2);transition:border-color .15s,background .15s}.radio-card:hover{border-color:var(--text-mute)}.radio-card.checked{border-color:var(--primary);background:var(--primary-soft)}.radio-card input{margin-top:3px;accent-color:var(--primary);flex:0 0 auto}.radio-card-body{min-width:0}.radio-card-title{font-size:13.5px;font-weight:600}.radio-card-desc{font-size:12px;color:var(--text-dim);margin-top:2px;line-height:1.45}.check-tags{display:flex;flex-wrap:wrap;gap:6px}.check-tag{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border:1px solid var(--border);border-radius:14px;cursor:pointer;font-size:12.5px;background:var(--panel-2);user-select:none;transition:border-color .15s,background .15s,color .15s}.check-tag:hover{border-color:var(--text-mute)}.check-tag.checked{border-color:var(--primary);background:var(--primary-soft);color:var(--primary)}.check-tag input{display:none}.quick-btns{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}.range-row{display:flex;align-items:center;gap:11px}.range-row input[type=range]{flex:1;accent-color:var(--primary);cursor:pointer}.range-val{min-width:40px;text-align:right;font-family:var(--mono);font-size:13px}.kv-list{display:flex;flex-direction:column;gap:6px}.kv-row{display:flex;gap:6px;align-items:center}.kv-row .input{flex:1;min-width:0}.kv-row .input.kv-k{flex:0 0 34%}.card{background:var(--panel);border:1px solid var(--border);border-radius:var(--radius);padding:16px}.card+.card{margin-top:14px}.card-head{display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap}.card-title{font-size:14.5px}.card-sub{font-size:12.5px;color:var(--text-dim);margin-top:3px}.section{margin-bottom:22px}.section:last-child{margin-bottom:0}.section-title{font-size:13px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px;padding-bottom:7px;margin-bottom:12px;border-bottom:1px solid var(--border-soft)}.stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(158px,1fr));gap:12px;margin-bottom:16px}.stat-card{background:var(--panel);border:1px solid var(--border);border-radius:var(--radius);padding:14px 16px}.stat-label{font-size:12.5px;color:var(--text-dim);display:flex;align-items:center;gap:5px}.stat-value{font-size:25px;font-weight:700;margin-top:7px;line-height:1.15;letter-spacing:-.4px}.stat-unit{font-size:13px;font-weight:500;color:var(--text-dim);margin-left:3px}.stat-foot{font-size:11.5px;color:var(--text-mute);margin-top:5px}.bars{display:flex;flex-direction:column;gap:9px}.bar-item{display:grid;grid-template-columns:62px 1fr 96px;align-items:center;gap:10px}.bar-label{font-family:var(--mono);font-size:12.5px;color:var(--text-dim)}.bar-track{height:9px;background:var(--bg-soft);border-radius:5px;overflow:hidden;border:1px solid var(--border-soft)}.bar-fill{height:100%;border-radius:5px;background:var(--primary);transition:width .45s cubic-bezier(.3,.9,.4,1);min-width:2px}.bar-fill.s2{background:var(--success)}.bar-fill.s3{background:var(--info)}.bar-fill.s4{background:var(--warn)}.bar-fill.s5{background:var(--danger)}.bar-value{font-size:12.5px;color:var(--text-dim);text-align:right;font-family:var(--mono)}.table-wrap{overflow-x:auto;margin:0 -16px -16px;padding:0 16px 16px}.table{width:100%;border-collapse:collapse;font-size:13.5px}.table th,.table td{padding:10px 12px;text-align:left;border-bottom:1px solid var(--border-soft)}.table th{font-size:12px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:.4px;white-space:nowrap}.table tbody tr:last-child td{border-bottom:0}.table tbody tr:hover{background:var(--panel-2)}.table .col-actions{text-align:right;white-space:nowrap}.table .cell-main{font-weight:600}.badge{display:inline-block;padding:2px 8px;border-radius:11px;font-size:11.5px;font-weight:500;background:var(--panel-2);border:1px solid var(--border);color:var(--text-dim)}.badge-on{color:var(--success);border-color:color-mix(in srgb,var(--success) 40%,transparent);background:color-mix(in srgb,var(--success) 12%,transparent)}.badge-off{color:var(--text-mute)}.badge-warn{color:var(--warn);border-color:color-mix(in srgb,var(--warn) 40%,transparent);background:color-mix(in srgb,var(--warn) 12%,transparent)}.badge-danger{color:var(--danger);border-color:color-mix(in srgb,var(--danger) 40%,transparent);background:color-mix(in srgb,var(--danger) 12%,transparent)}.badge-info{color:var(--info);border-color:color-mix(in srgb,var(--info) 40%,transparent);background:color-mix(in srgb,var(--info) 12%,transparent)}.badge-single{color:var(--text-mute);border-color:color-mix(in srgb,var(--text-mute) 35%,transparent);background:color-mix(in srgb,var(--text-mute) 10%,transparent)}.badge-pool{color:var(--info);border-color:color-mix(in srgb,var(--info) 45%,transparent);background:color-mix(in srgb,var(--info) 14%,transparent)}.dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:5px;vertical-align:middle}.dot-up{background:var(--success);box-shadow:0 0 0 3px color-mix(in srgb,var(--success) 20%,transparent)}.dot-down{background:var(--danger);box-shadow:0 0 0 3px color-mix(in srgb,var(--danger) 20%,transparent)}.dot-unknown{background:var(--text-mute)}.state{text-align:center;padding:46px 20px;color:var(--text-dim)}.state-ico{font-size:34px;opacity:.55}.state-title{font-size:14.5px;margin-top:10px;color:var(--text);font-weight:600}.state-text{font-size:13px;margin-top:5px}.state-act{margin-top:15px}.spinner{width:26px;height:26px;border:2.5px solid var(--border);border-top-color:var(--primary);border-radius:50%;margin:0 auto;animation:spin .7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.skeleton{background:linear-gradient(90deg,var(--panel-2) 25%,var(--border-soft) 50%,var(--panel-2) 75%);background-size:200% 100%;animation:shimmer 1.3s infinite;border-radius:5px;height:13px}@keyframes shimmer{to{background-position:-200% 0}}.drawer-mask,.sidebar-mask,.modal-mask{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:60;animation:fade .16s}@keyframes fade{from{opacity:0}}.drawer{position:fixed;top:0;right:0;bottom:0;width:min(860px,100%);background:var(--panel);border-left:1px solid var(--border);z-index:61;display:flex;flex-direction:column;box-shadow:var(--shadow);animation:slide-in .2s cubic-bezier(.3,.9,.4,1)}@keyframes slide-in{from{transform:translateX(22px);opacity:.4}}.drawer-head{display:flex;align-items:center;padding:15px 18px;border-bottom:1px solid var(--border);flex:0 0 auto}.drawer-head h3{font-size:15.5px;flex:1;min-width:0}.drawer-body{flex:1;overflow-y:auto;padding:22px}.drawer-foot{display:flex;align-items:center;gap:9px;padding:13px 18px;border-top:1px solid var(--border);background:var(--panel-2);flex:0 0 auto}.drawer-hint{font-size:12px;color:var(--text-mute)}.tabs{display:flex;gap:2px;border-bottom:1px solid var(--border);margin-bottom:18px;overflow-x:auto}.tab{padding:8px 15px;border:0;background:none;color:var(--text-dim);cursor:pointer;font-size:13.5px;font-family:inherit;border-bottom:2px solid transparent;margin-bottom:-1px;white-space:nowrap;transition:color .15s,border-color .15s}.tab:hover{color:var(--text)}.tab.active{color:var(--primary);border-bottom-color:var(--primary);font-weight:600}.item-list{display:flex;flex-direction:column;gap:9px}.item{border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--panel-2);overflow:hidden}.item.disabled{opacity:.62}.item-head{display:flex;align-items:center;gap:8px;padding:9px 11px;cursor:pointer;user-select:none}.item-head:hover{background:var(--border-soft)}.item-caret{font-size:10px;color:var(--text-mute);transition:transform .15s;flex:0 0 auto}.item.open .item-caret{transform:rotate(90deg)}.item-title{font-size:13.5px;font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.item-meta{font-size:12px;color:var(--text-mute);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.item-tools{margin-left:auto;display:flex;align-items:center;gap:3px;flex:0 0 auto}.item-body{padding:13px;border-top:1px solid var(--border);background:var(--panel)}.empty-inline{text-align:center;padding:22px;color:var(--text-mute);font-size:13px;border:1px dashed var(--border);border-radius:var(--radius-sm)}.alert{display:flex;gap:9px;padding:10px 12px;border-radius:var(--radius-sm);font-size:12.5px;line-height:1.55;margin-bottom:12px;border:1px solid}.alert-warn{background:color-mix(in srgb,var(--warn) 11%,transparent);border-color:color-mix(in srgb,var(--warn) 32%,transparent);color:var(--text)}.alert-info{background:color-mix(in srgb,var(--info) 10%,transparent);border-color:color-mix(in srgb,var(--info) 30%,transparent);color:var(--text)}.alert-danger{background:var(--danger-soft);border-color:color-mix(in srgb,var(--danger) 34%,transparent);color:var(--text)}.alert-ico{flex:0 0 auto}.modal-mask{display:flex;align-items:center;justify-content:center;padding:20px;z-index:80}.modal{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:22px;width:100%;max-width:400px;box-shadow:var(--shadow);animation:pop .16s cubic-bezier(.3,.9,.4,1)}@keyframes pop{from{transform:scale(.96);opacity:0}}.modal-title{font-size:16px}.modal-text{color:var(--text-dim);font-size:13.5px;margin:10px 0 0;line-height:1.6}.modal-extra{margin-top:14px}.modal-foot{display:flex;justify-content:flex-end;gap:9px;margin-top:20px}.toasts{position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:100;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;width:min(420px,calc(100% - 32px))}.toast{background:var(--panel);border:1px solid var(--border);border-left:3px solid var(--primary);border-radius:var(--radius-sm);padding:10px 14px;font-size:13.5px;box-shadow:var(--shadow);animation:toast-in .2s cubic-bezier(.3,.9,.4,1);max-width:100%;pointer-events:auto}.toast.ok{border-left-color:var(--success)}.toast.err{border-left-color:var(--danger)}.toast.warn{border-left-color:var(--warn)}.toast.hide{animation:toast-out .18s forwards}@keyframes toast-in{from{transform:translateY(-10px);opacity:0}}@keyframes toast-out{to{transform:translateY(-10px);opacity:0}}@media (max-width:860px){.sidebar{position:fixed;left:0;top:0;z-index:70;transform:translateX(-100%);transition:transform .22s cubic-bezier(.3,.9,.4,1)}.sidebar.open{transform:none}.sidebar-close{display:block}.menu-btn{display:block}.content{padding:14px}.topbar{padding:0 12px}.drawer{width:100%}.drawer-body{padding:14px}.stat-grid{grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:9px}.stat-value{font-size:21px}.bar-item{grid-template-columns:50px 1fr 72px;gap:7px}.table th,.table td{padding:9px 8px}.kv-row{flex-wrap:wrap}.kv-row .input.kv-k{flex:1 1 100%}}@media (max-width:480px){.login-card{padding:26px 20px 20px}.radio-cards{grid-template-columns:1fr}}@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms !important;transition-duration:.01ms !important}}.subhead{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:18px 0 10px;padding-bottom:7px;border-bottom:1px solid var(--border-soft);font-size:13.5px;font-weight:600;color:var(--text)}.rules-box{display:flex;flex-direction:column;gap:12px}.rule-card{border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--panel-2);overflow:hidden}.rule-head{display:flex;align-items:center;gap:12px;padding:10px 12px;border-bottom:1px solid var(--border);background:var(--bg-soft);flex-wrap:wrap}.rule-head .field{margin-bottom:0;min-width:130px;flex:0 0 auto}.subcard{border:1px solid var(--border-soft);border-radius:var(--radius-sm);margin:10px 12px;overflow:hidden;background:var(--panel)}.subcard:last-child{margin-bottom:14px}.section-toggle{display:flex;align-items:center;gap:7px;padding:9px 12px;cursor:pointer;user-select:none;background:var(--panel-2)}.section-toggle:hover{background:var(--border-soft)}.section-toggle .tw{font-size:10px;color:var(--text-mute);transition:transform .15s}.subcard.collapsed .tw{transform:rotate(0deg)}.subcard:not(.collapsed) .tw{transform:rotate(90deg)}.section-toggle strong{font-size:13px}.section-toggle .muted{color:var(--text-mute);font-size:12px;font-weight:400}.section-toggle .op-remove{margin-left:auto;padding:2px 10px;font-size:12px;flex:none}.ops-list{display:flex;flex-direction:column;gap:12px}.rw-editor{display:flex;flex-direction:column;gap:10px}.rw-desc{font-size:12px;line-height:1.5;margin-top:-4px}.rw-fields{display:flex;flex-direction:column;gap:10px}.rw-example{font-size:12px;line-height:1.5}.rw-preview-row{display:flex;flex-direction:column;gap:10px}.rw-preview-wrap{display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:var(--bg-soft,#f6f7f9);border:1px dashed var(--border);border-radius:8px;padding:8px 10px}.rw-preview{font-family:var(--mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:13px;color:var(--text);word-break:break-all}.ro-tag{flex:none;font-size:11px;line-height:1;padding:2px 6px;border-radius:4px;background:var(--bg-inset,#eceef1);color:var(--muted,#888);border:1px solid var(--border);user-select:none}.rw-examples{display:flex;flex-direction:column;gap:6px;margin-top:4px;padding:8px 10px;background:var(--bg-soft,#f6f7f9);border:1px solid var(--border);border-radius:8px}.rw-example-item{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.rw-example-btn{font-family:var(--mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:12px;cursor:pointer;background:var(--bg);color:var(--text);border:1px solid var(--accent,#3b82f6);border-radius:6px;padding:3px 8px;line-height:1.4}.rw-example-btn:hover{background:var(--accent-soft,#eef4ff)}.section-body{padding:12px;border-top:1px solid var(--border-soft)}.subcard.collapsed .section-body{display:none}.origin-row .subcard{margin:10px 0}.inline-origin-box{margin:6px 0 4px;padding:14px;border:1px dashed var(--border-soft);border-radius:8px;background:color-mix(in srgb,var(--bg-soft) 50%,transparent)}.inline-origin-box .origin-row{margin:8px 0}.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:0 14px}.op-add{display:flex;align-items:center;flex-wrap:wrap;gap:10px;padding:10px 12px;margin-bottom:14px;background:var(--panel-2);border:1px dashed var(--border);border-radius:var(--radius-sm)}.op-add-label{font-size:13px;font-weight:600;color:var(--text)}.op-add .input{min-width:260px;flex:1;max-width:420px}.op-add .hint{margin-top:0}.seq-page .seq-pick{display:flex;align-items:center;gap:8px}.seq-pick .input{min-width:240px}.seq-flow{margin-top:16px;padding-left:8px;border-left:3px solid var(--border);display:flex;flex-direction:column;gap:0}.seq-stage{position:relative;display:flex;align-items:flex-start;gap:14px;padding:14px 16px 14px 22px;margin-left:14px;background:var(--panel);border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:-1px}.seq-stage::before{content:'';position:absolute;left:-15px;top:-16px;bottom:50%;width:2px;background:var(--border)}.seq-stage:first-child::before{display:none}.seq-icon{flex:0 0 auto;width:38px;height:38px;display:flex;align-items:center;justify-content:center;font-size:20px;background:var(--panel-2);border:1px solid var(--border);border-radius:50%}.seq-main{flex:1 1 auto;min-width:0}.seq-title{display:flex;align-items:center;gap:10px;font-weight:600;font-size:15px;color:var(--text);margin-bottom:4px}.seq-summary{font-size:13px;color:var(--muted);line-height:1.5;word-break:break-word}.seq-note{font-size:12px;line-height:1.5;margin-bottom:4px;color:var(--text-mute);word-break:break-word}.seq-owner{margin-top:6px;font-size:11px;color:var(--muted);opacity:.8;font-style:italic}.seq-group{position:relative;display:flex;align-items:flex-start;gap:10px;margin:18px 0 2px -15px;padding:6px 12px 6px 14px}.seq-group-no{flex:0 0 auto;font-size:13px;font-weight:700;color:var(--accent);background:color-mix(in srgb,var(--accent) 14%,transparent);border-radius:6px;padding:2px 8px;line-height:20px}.seq-group-main{min-width:0}.seq-group-title{font-size:14px;font-weight:700;color:var(--text)}.seq-group-desc{font-size:12px;color:var(--muted);margin-top:2px;line-height:1.5}.seq-substeps{margin:2px 0 6px 52px;padding:10px 14px;border-left:2px dashed var(--border);display:flex;flex-direction:column;gap:6px}.seq-substep{display:flex;gap:10px;flex-wrap:wrap;align-items:baseline}.seq-substep-t{font-size:12px;font-weight:600;color:var(--text);white-space:nowrap}.seq-substep-d{font-size:12px;color:var(--muted)}.frag-note{border-left:3px solid var(--accent);padding-left:10px;margin-bottom:12px}.seq-badge{font-size:11px;font-weight:600;padding:1px 8px;border-radius:999px;line-height:18px;white-space:nowrap}.seq-badge.on{background:color-mix(in srgb,var(--accent) 18%,transparent);color:var(--accent)}.seq-badge.off{background:var(--panel-2);color:var(--muted);border:1px solid var(--border)}.seq-go{flex:0 0 auto;align-self:center;font-size:12px;font-weight:600;color:var(--accent);white-space:nowrap}.seq-stage.clickable{cursor:pointer;transition:border-color .15s,transform .05s}.seq-stage.clickable:hover{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 6%,var(--panel))}.seq-stage.clickable:active{transform:scale(.997)}.seq-stage.disabled{opacity:.55}.seq-rule{border-left:3px solid var(--accent)}.seq-rule-list{margin:2px 0 6px 26px;display:flex;flex-direction:column;gap:8px}.seq-rule-inpack{border-left:3px solid var(--border);background:color-mix(in srgb,var(--panel-2) 40%,transparent)}.seq-rule-head{display:flex;align-items:center;gap:10px;margin-bottom:4px}.seq-rule-prio{font-size:11px;font-weight:700;color:var(--accent);background:color-mix(in srgb,var(--accent) 14%,transparent);padding:1px 7px;border-radius:5px}.seq-rule-name{font-weight:600;font-size:15px;color:var(--text)}.seq-subs{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.seq-chip{font-size:12px;padding:2px 9px;background:var(--panel-2);color:var(--text-2);border:1px solid var(--border);border-radius:999px}.flash-anchor{animation:flashAnchor 1.6s ease-out;box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 45%,transparent)}@keyframes flashAnchor{0%{box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 55%,transparent)}100%{box-shadow:0 0 0 3px transparent}}.seq-rule-drag{cursor:grab}.seq-rule-drag .seq-grip{flex:0 0 auto;align-self:center;font-size:15px;line-height:1;color:var(--muted);cursor:grab;user-select:none;padding:0 2px;border-radius:5px}.seq-rule-drag .seq-grip:hover{color:var(--accent);background:var(--panel-2)}.seq-rule-drag.dragging{opacity:.4;cursor:grabbing}.seq-rule-drag.drop-before{box-shadow:inset 0 3px 0 0 var(--accent)}.seq-rule-drag.drop-after{box-shadow:inset 0 -3px 0 0 var(--accent)}.seq-rule-head .seq-grip+.seq-rule-prio{margin-left:0}.seq-site-head{position:relative;margin:18px 0 4px 14px;padding:10px 14px;background:var(--panel-2);border:1px solid var(--border);border-radius:var(--radius-sm);display:flex;flex-direction:column;gap:6px}.seq-site-head:first-of-type{margin-top:4px}.seq-site-name{font-weight:700;font-size:16px;color:var(--text);word-break:break-all}.seq-site-meta{display:flex;flex-wrap:wrap;align-items:center;gap:6px}.seq-site-go{margin-left:auto}.seq-site-click{position:absolute;inset:0;cursor:pointer}.seq-site-head:hover{border-color:var(--accent)}.section>.section-title{color:var(--accent)}.check-row{display:flex;flex-wrap:wrap;gap:8px;padding-top:4px}.check{display:inline-flex;align-items:center;gap:6px;padding:4px 9px;border:1px solid var(--border);border-radius:14px;cursor:pointer;font-size:12.5px;background:var(--panel-2);user-select:none;transition:border-color .15s,background .15s,color .15s}.check:hover{border-color:var(--text-mute)}.check input{accent-color:var(--primary);margin:0}.check:has(input:checked){border-color:var(--primary);background:var(--primary-soft);color:var(--primary)}.kv-label{font-size:12px;color:var(--text-dim);margin:8px 0 5px}.header-editor{display:flex;flex-direction:column}.header-editor .btn{align-self:flex-start;margin-top:6px}.header-editor .kv-row .hk{flex:0 0 36%}.header-editor .kv-row .hv{flex:1;min-width:0}.muted{color:var(--text-mute);font-size:12px}.check .muted{margin-left:2px}.cond-groups{display:flex;flex-direction:column;gap:10px;margin:10px 0}.cond-group{border:1px dashed var(--border);border-radius:var(--radius-sm);padding:10px;background:var(--panel);position:relative}.cond-group+.cond-group{margin-top:14px}.cond-group+.cond-group::before{content:'或 (OR)';position:absolute;top:-9px;left:12px;padding:0 6px;font-size:11px;color:var(--text-mute);background:var(--panel-2);border-radius:8px}.cond-group-head{display:flex;align-items:center;gap:8px;margin-bottom:8px}.cond-group-head .badge{font-size:11px;padding:2px 7px;border-radius:8px;background:var(--primary-soft);color:var(--primary)}.cond-rows{display:flex;flex-direction:column;gap:6px}.cond-row{display:grid;grid-template-columns:minmax(120px,1.1fr) minmax(0,0.9fr) minmax(110px,1fr) minmax(0,1.6fr) auto auto;gap:6px;align-items:center}.cond-row .input{min-width:0}.cond-cell{min-width:0}.cond-row .check{padding:4px 8px}@media (max-width:720px){.cond-row{grid-template-columns:1fr 1fr}}.rules-box textarea.input{resize:vertical;font-family:inherit}</style> </head><body><div id="view-login" class="login-wrap"><form class="login-card" id="login-form" novalidate><div class="login-logo">⚡</div><h1 class="login-title">EdgeCDN 控制台</h1><p class="login-sub">请输入管理密码以继续</p><div class="field"><label class="label" for="login-pwd">管理密码</label><div class="pwd-box"><input class="input" id="login-pwd" type="password" autocomplete="current-password" placeholder="请输入密码" spellcheck="false"><button class="pwd-eye" type="button" id="login-eye" title="显示/隐藏密码" aria-label="显示或隐藏密码">👁</button></div><div class="err" id="login-err" hidden></div></div><button class="btn btn-primary btn-block" type="submit" id="login-btn">登 录</button><p class="login-foot">会话通过 HttpOnly Cookie 保持，请勿在公共设备上保存密码</p></form></div><div id="view-app" class="app" hidden><aside class="sidebar" id="sidebar"><div class="brand"><span class="brand-logo">⚡</span><span class="brand-text">EdgeCDN</span><button class="icon-btn sidebar-close" id="sidebar-close" aria-label="关闭菜单">✕</button></div><nav class="nav" id="nav"><a class="nav-item" href="#/overview"><span class="nav-ico">📊</span><span>概览</span></a><a class="nav-item" href="#/sites"><span class="nav-ico">🌐</span><span>站点管理</span></a><a class="nav-item" href="#/sequence"><span class="nav-ico">🛰️</span><span>流量序列</span></a><a class="nav-item" href="#/pools"><span class="nav-ico">🗄️</span><span>源站</span></a><a class="nav-item" href="#/cache"><span class="nav-ico">🧹</span><span>缓存管理</span></a><a class="nav-item" href="#/system"><span class="nav-ico">⚙️</span><span>系统设置</span></a></nav><div class="sidebar-foot"><div class="plat-badge" id="plat-badge">检测中…</div></div></aside><div class="sidebar-mask" id="sidebar-mask" hidden></div><div class="main"><header class="topbar"><button class="icon-btn menu-btn" id="menu-btn" aria-label="打开菜单">☰</button><h2 class="page-title" id="page-title">概览</h2><div class="topbar-actions"><button class="icon-btn" id="theme-btn" title="切换主题" aria-label="切换主题">🌓</button><button class="btn btn-ghost btn-sm" id="logout-btn">退出</button></div></header><main class="content" id="content"></main></div></div><div class="drawer-mask" id="drawer-mask" hidden></div><aside class="drawer" id="drawer" hidden aria-modal="true" role="dialog"><header class="drawer-head"><h3 id="drawer-title">编辑</h3><button class="icon-btn" id="drawer-close" aria-label="关闭">✕</button></header><div class="drawer-body" id="drawer-body"></div><footer class="drawer-foot"><span class="drawer-hint" id="drawer-hint"></span><div class="grow"></div><button class="btn btn-ghost" id="drawer-cancel">取消</button><button class="btn btn-primary" id="drawer-save">保存</button></footer></aside><div class="modal-mask" id="confirm-mask" hidden><div class="modal" role="alertdialog" aria-modal="true"><h3 class="modal-title" id="confirm-title">确认操作</h3><p class="modal-text" id="confirm-text"></p><div class="modal-extra" id="confirm-extra" hidden><label class="label" id="confirm-extra-label">请输入名称以确认</label><input class="input" id="confirm-input" spellcheck="false" autocomplete="off"></div><div class="modal-foot"><button class="btn btn-ghost" id="confirm-cancel">取消</button><button class="btn btn-danger" id="confirm-ok">确认删除</button></div></div></div><div class="toasts" id="toasts" aria-live="polite"></div> <script>
/**
 * ============================================================================
 * API 客户端封装
 * ----------------------------------------------------------------------------
 * 所有接口前缀 /{adminPath}/api，adminPath 由 Worker 运行时注入到 window.__BASE__。
 * 统一响应格式：成功 { ok:true, data }  失败 { ok:false, error:{code,message} }
 * ============================================================================
 */

/** 业务错误：携带后端错误码与 HTTP 状态码 */
class ApiError extends Error {
  constructor(code, message, status, data) {
    super(message || code || '请求失败');
    this.name = 'ApiError';
    this.code = code || 'INTERNAL';
    this.status = status || 0;
    this.data = data || null;
  }
}

/** 取 API 根路径。__BASE__ 形如 "/__panel"，兜底取当前路径第一段 */
function apiBase() {
  let base = (typeof window !== 'undefined' && window.__BASE__) || '';
  if (!base) {
    const seg = location.pathname.split('/').filter(Boolean)[0];
    base = seg ? '/' + seg : '';
  }
  if (base && !base.startsWith('/')) base = '/' + base;
  return base.replace(/\\/$/, '') + '/api';
}

/**
 * 底层请求。自动处理 JSON 编解码、鉴权失效、限流锁定。
 * @param {string} path   形如 "/sites"
 * @param {Object} [opts] { method, body, query, raw }
 */
async function request(path, opts = {}) {
  const { method = 'GET', body, query, raw = false } = opts;

  let url = apiBase() + path;
  if (query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    }
    const s = qs.toString();
    if (s) url += '?' + s;
  }

  const init = {
    method,
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  };
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  let resp;
  try {
    resp = await fetch(url, init);
  } catch (e) {
    throw new ApiError('NETWORK', '网络连接失败，请检查网络后重试', 0);
  }

  // 需要原始响应（导出配置下载等）
  if (raw) {
    if (!resp.ok) throw await toApiError(resp);
    return resp;
  }

  let payload = null;
  const text = await resp.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!resp.ok || !payload || payload.ok !== true) {
    const err = payload && payload.error ? payload.error : {};
    const e = new ApiError(
      err.code || httpFallbackCode(resp.status),
      err.message || httpFallbackMessage(resp.status),
      resp.status,
      payload && payload.data ? payload.data : null
    );
    // 429 锁定：尽力解析剩余秒数，供登录页倒计时使用
    if (resp.status === 429) {
      const ra = resp.headers.get('Retry-After');
      e.retryAfter = Number(ra) || (e.data && e.data.retryAfter) || 0;
    }
    throw e;
  }

  return payload.data;
}

async function toApiError(resp) {
  let payload = null;
  try {
    payload = await resp.json();
  } catch {}
  const err = (payload && payload.error) || {};
  return new ApiError(
    err.code || httpFallbackCode(resp.status),
    err.message || httpFallbackMessage(resp.status),
    resp.status
  );
}

function httpFallbackCode(status) {
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 400) return 'BAD_REQUEST';
  if (status === 409) return 'CONFLICT';
  if (status === 429) return 'RATE_LIMITED';
  return 'INTERNAL';
}

function httpFallbackMessage(status) {
  const map = {
    400: '请求参数有误',
    401: '登录已失效，请重新登录',
    403: '没有权限执行该操作',
    404: '请求的资源不存在',
    409: '资源冲突，可能已存在同名项',
    429: '操作过于频繁，请稍后再试',
    500: '服务器内部错误',
    503: '存储服务不可用，请检查 KV 绑定',
  };
  return map[status] || '请求失败（HTTP ' + status + '）';
}

const get = (p, query) => request(p, { method: 'GET', query });
const put = (p, body) => request(p, { method: 'PUT', body });
const post = (p, body) => request(p, { method: 'POST', body });
const del = (p) => request(p, { method: 'DELETE' });

/** 对外 API 门面 */
const API = {
  ApiError,
  base: apiBase,

  auth: {
    login: (password) => post('/auth/login', { password }),
    logout: () => post('/auth/logout', {}),
    me: () => get('/auth/me'),
    changePassword: (oldPassword, newPassword) =>
      post('/auth/password', { oldPassword, newPassword }),
  },

  sites: {
    list: () => get('/sites'),
    /** 新建站点可选的场景模板 + 参数元信息（名称/说明/范围） */
    templates: () => get('/sites/templates'),
    get: (host) => get('/sites/' + encodeURIComponent(host)),
    save: (host, site) => put('/sites/' + encodeURIComponent(host), site),
    remove: (host) => del('/sites/' + encodeURIComponent(host)),
    // 片段 API：各段只保存自己的字段，互不影响（绝不越界）
    saveBasics: (host, payload) => put('/sites/' + encodeURIComponent(host) + '/basics', payload),
    saveRules: (host, rules) => put('/sites/' + encodeURIComponent(host) + '/rules', { rules }),
    saveSecurity: (host, security) => put('/sites/' + encodeURIComponent(host) + '/security', { security }),
  },

  pools: {
    list: () => get('/pools'),
    get: (id) => get('/pools/' + encodeURIComponent(id)),
    /** 保存：有 id 走 PUT（更新），无 id 走 POST（新建，机器 id 由后端生成） */
    save: (id, pool) => (id ? put('/pools/' + encodeURIComponent(id), pool) : post('/pools', pool)),
    create: (pool) => post('/pools', pool),
    remove: (id) => del('/pools/' + encodeURIComponent(id)),
  },

  cache: {
    /** @param {{host?:string,prefix?:string,urls?:string[]}} payload */
    purge: (payload) => post('/cache/purge', payload),
  },

  stats: {
    overview: () => get('/stats/overview'),
    host: (host, hours = 24) =>
      get('/stats/host/' + encodeURIComponent(host), { hours }),
  },

  system: {
    info: () => get('/system/info'),
    export: () => request('/system/export', { method: 'GET', raw: true }),
    import: (config) => post('/system/import', config),
  },

  config: {
    get: () => get('/config/global'),
    save: (payload) => put('/config/global', payload),
  },

  rules: {
    /** 全站通用规则（兜底），对所有站点生效、优先级最低 */
    global: () => get('/rules/global'),
    saveGlobal: (rules) => put('/rules/global', rules),
  },
};

if (typeof window !== 'undefined') window.API = API;

/**
 * ============================================================================
 * web/app.js —— 管理面前端逻辑（单页应用，哈希路由）
 * ----------------------------------------------------------------------------
 * 运行环境约定（由 api.js / 注入脚本提供）：
 *  - window.__BASE__   管理面基础路径（如 "/__panel"）
 *  - window.__PLATFORM__  运行平台标识
 *  - window.API        数据访问门面（见 api.js）
 *                      响应统一为 { ok, data }，API.*.list() 返回 data 字段
 *  - 鉴权基于 HttpOnly Cookie：登录后后端写入，fetch 同源自动携带
 *
 * 本文件只负责「交互 + 视图渲染」，一切数据走 window.API。
 * 约定：元素显隐统一使用 [hidden] 属性（标准 HTML 语义）。
 * ============================================================================
 */

(function () {
  'use strict';

  const API = window.API;
  const PLATFORM = window.__PLATFORM__ || 'unknown';

  // 小工具 ----------------------------------------------------------------
  // 单参: document.getElementById(id)
  // 双参: 在 root 内按 CSS 选择器查找（$('.o-addr', row)）
  const $ = (sel, root) => {
    if (root) return root.querySelector(sel);
    return typeof sel === 'string' ? document.getElementById(sel) : sel;
  };
  const APP_DATA = { global: null, sites: [], pools: [], stats: null, info: null };

  function el(tag, attrs, children) {
    const n = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') n.className = v;
        else if (k === 'text') n.textContent = v;
        else if (k === 'html') n.innerHTML = v;
        else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
        else n.setAttribute(k, v === true ? '' : String(v));
      }
    }
    if (children != null) {
      (Array.isArray(children) ? children : [children]).forEach((c) => {
        if (c == null) return;
        n.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
      });
    }
    return n;
  }
  const clear = (node) => { while (node && node.firstChild) node.removeChild(node.firstChild); };

  function fmtNum(n) {
    n = Number(n) || 0;
    if (n >= 1e9) return (n / 1e9).toFixed(2) + ' GB';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + ' MB';
    if (n >= 1e3) return (n / 1e3).toFixed(2) + ' KB';
    return String(n) + ' B';
  }
  const fmtRate = (r) => (r == null || isNaN(r) ? '0%' : (r * 100).toFixed(1) + '%');
  const fmtDate = (ts) => (ts ? new Date(ts).toLocaleString() : '-');

  // 把秒数换算成人话，追加在输入框说明后面。
  // 「15552000 秒」没人读得出是多久，写成「≈ 180 天」才能让用户立刻意识到
  // 自己填的值意味着什么——尤其是缓存时间这种设错代价很大的参数。
  function humanSecs(s) {
    if (!Number.isFinite(s)) return '';
    if (s < 0) return '　当前：跟随源站，不改写';
    if (s === 0) return '　当前：0（不缓存）';
    if (s < 60) return \`　当前：\${s} 秒\`;
    if (s < 3600) return \`　当前：≈ \${(s / 60).toFixed(s % 60 ? 1 : 0)} 分钟\`;
    if (s < 86400) return \`　当前：≈ \${(s / 3600).toFixed(s % 3600 ? 1 : 0)} 小时\`;
    return \`　当前：≈ \${(s / 86400).toFixed(s % 86400 ? 1 : 0)} 天\`;
  }

  // 全局提示 --------------------------------------------------------------
  function toast(msg, type) {
    const host = $('toasts');
    if (!host) return;
    const t = el('div', { class: 'toast' + (type ? ' ' + type : '') }, msg);
    host.appendChild(t);
    setTimeout(() => {
      t.classList.add('hide');
      setTimeout(() => t.remove(), 200);
    }, 3000);
  }

  // 抽屉 ------------------------------------------------------------------
  function openDrawer(title, hint, bodyNode, onSave) {
    $('drawer-title').textContent = title;
    $('drawer-hint').textContent = hint || '';
    const body = $('drawer-body');
    clear(body);
    body.appendChild(bodyNode);
    $('drawer-mask').hidden = false;
    $('drawer').hidden = false;
    // onSave 为空 → 只读抽屉（如「引用详情」），隐藏保存按钮
    $('drawer-save').hidden = !onSave;
    if (!onSave) { $('drawer-save').onclick = null; return; }
    $('drawer-save').onclick = async () => {
      try {
        $('drawer-save').disabled = true;
        await onSave();
        closeDrawer();
        toast('已保存', 'ok');
        await route(location.hash); // 刷新当前视图
      } catch (e) {
        toast(e.message || '保存失败', 'err');
      } finally {
        $('drawer-save').disabled = false;
      }
    };
  }
  function closeDrawer() {
    $('drawer').hidden = true;
    $('drawer-mask').hidden = true;
  }

  // 流量序列跳转：抽屉打开后滚动到指定片段锚点并高亮
  function scrollToAnchor(anchor) {
    if (!anchor) return;
    requestAnimationFrame(() => {
      const tgt = document.getElementById(anchor);
      if (!tgt) return;
      tgt.scrollIntoView({ block: 'start', behavior: 'smooth' });
      tgt.classList.add('flash-anchor');
      setTimeout(() => tgt.classList.remove('flash-anchor'), 1600);
    });
  }

  // 确认弹窗 --------------------------------------------------------------
  function confirmDialog(title, text, options) {
    options = options || {};
    return new Promise((resolve) => {
      $('confirm-title').textContent = title;
      $('confirm-text').textContent = text || '';
      const extra = $('confirm-extra');
      const input = $('confirm-input');
      if (options.confirmText) {
        extra.hidden = false;
        $('confirm-extra-label').textContent = options.confirmLabel || '';
        input.value = '';
        input.placeholder = options.confirmPlaceholder || '';
      } else {
        extra.hidden = true;
      }
      const mask = $('confirm-mask');
      mask.hidden = false;
      const done = (ok) => {
        mask.hidden = true;
        if (ok && options.confirmText) {
          resolve(input.value.trim() === options.confirmText);
        } else {
          resolve(ok);
        }
      };
      $('confirm-ok').onclick = () => done(true);
      $('confirm-cancel').onclick = () => done(false);
    });
  }

  // 登录态 ----------------------------------------------------------------
  async function ensureAuth() {
    try {
      const me = await API.auth.me();
      return !!(me && me.authed);
    } catch {
      return false;
    }
  }

  async function doLogin(pwd) {
    const errEl = $('login-err');
    errEl.hidden = true;
    try {
      await API.auth.login(pwd);
      enterApp();
    } catch (e) {
      errEl.textContent = e.message || '登录失败';
      errEl.hidden = false;
    }
  }

  async function doLogout() {
    try { await API.auth.logout(); } catch {}
    showLogin();
  }

  // 视图切换 --------------------------------------------------------------
  function showLogin() {
    $('view-app').hidden = true;
    $('view-login').hidden = false;
  }
  function enterApp() {
    $('view-login').hidden = true;
    $('view-app').hidden = false;
    // 启动后拉取首屏数据
    loadAll().catch((e) => toast(e.message, 'err'));
    route(location.hash);
  }

  async function loadAll() {
    const [info, sites, pools] = await Promise.all([
      API.system.info().catch(() => null),
      API.sites.list().catch(() => ({ sites: [] })),
      API.pools.list().catch(() => ({ pools: [] })),
    ]);
    APP_DATA.info = info;
    APP_DATA.sites = sites.sites || [];
    APP_DATA.pools = pools.pools || [];
    APP_DATA.poolsLegacySites = pools.legacySites || [];
    renderPlatBadge();
  }

  function renderPlatBadge() {
    const badge = $('plat-badge');
    if (!badge) return;
    const caps = (APP_DATA.info && APP_DATA.info.caps) || {};
    const parts = ['平台: ' + (APP_DATA.info ? APP_DATA.info.platform : PLATFORM)];
    if (caps.hasEdgeCache) parts.push('边缘缓存 ✓');
    if (!caps.hasSocket) parts.push('socket ✗');
    if (!caps.hasD1) parts.push('D1 ✗');
    badge.textContent = parts.join(' · ');
    badge.title = (APP_DATA.info && APP_DATA.info.limitations || []).map((l) => l.message).join('\\n');
  }

  // 路由 ------------------------------------------------------------------
  const ROUTES = {
    overview: renderOverview,
    sites: renderSites,
    sequence: renderTrafficSequence,
    pools: renderPools,
    cache: renderCache,
    system: renderSystem,
  };
  const TITLES = {
    overview: '概览', sites: '站点管理', sequence: '流量序列', pools: '源站',
    cache: '缓存管理', system: '系统设置',
  };

  async function route(hash) {
    const key = (hash || location.hash || '').replace(/^#\\/?/, '') || 'overview';
    const fn = ROUTES[key] || renderOverview;
    $('page-title').textContent = TITLES[key] || '概览';
    // 高亮导航
    $nav().forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#/' + key));
    const content = $('content');
    clear(content);
    content.appendChild(el('div', { class: 'loading' }, '加载中…'));
    try {
      const node = await fn();
      clear(content);
      if (node) content.appendChild(node);
    } catch (e) {
      clear(content);
      content.appendChild(el('div', { class: 'empty err' }, e.message || '加载失败'));
    }
  }
  function $nav() {
    return Array.from(document.querySelectorAll('#nav a[href^="#/"]'));
  }

  // 通用组件 --------------------------------------------------------------
  function table(headers, rows) {
    const t = el('table', { class: 'table' });
    t.appendChild(el('thead', {}, el('tr', {}, headers.map((h) => el('th', {}, h)))));
    const tb = el('tbody');
    rows.forEach((r) => tb.appendChild(el('tr', {}, r.map((c) => (c && c.nodeType ? el('td', {}, c) : el('td', {}, String(c)))))));
    t.appendChild(tb);
    return t;
  }
  function actions(btns) {
    return el('div', { class: 'row-actions' }, btns.map((b) =>
      el('button', { class: 'btn btn-sm ' + (b.cls || 'btn-ghost'), text: b.label, onclick: b.onClick })
    ));
  }

  // ====== 概览 ======
  async function renderOverview() {
    const wrap = el('div', { class: 'section' });
    wrap.appendChild(el('h3', {}, '概览'));

    let stats = null;
    try { stats = await API.stats.overview(); } catch {}
    const totalSites = APP_DATA.sites.length;
    const totalPools = APP_DATA.pools.length;
    const cards = el('div', { class: 'cards' }, [
      statCard('站点数', String(totalSites)),
      statCard('源站数', String(totalPools)),
      statCard('请求数(24h)', stats && stats.enabled ? fmtNum(stats.requests) : '未启用'),
      statCard('缓存命中率', stats && stats.enabled ? fmtRate(stats.hitRate) : '—'),
    ]);
    wrap.appendChild(cards);

    if (stats && stats.enabled && Array.isArray(stats.topHosts)) {
      wrap.appendChild(el('h4', {}, 'Top 站点'));
      const rows = stats.topHosts.slice(0, 8).map((h) => [
        h.host, fmtNum(h.requests), fmtNum(h.bytes), fmtRate(h.hitRate),
      ]);
      wrap.appendChild(table(['Host', '请求', '流量', '命中率'], rows));
    } else {
      wrap.appendChild(el('p', { class: 'empty' }, '统计未启用，可在「系统设置」中开启。'));
    }

    // 快速入口
    wrap.appendChild(el('div', { class: 'quick' }, [
      el('button', { class: 'btn btn-primary', text: '+ 新建站点', onclick: () => openSiteDrawer(null) }),
      el('button', { class: 'btn btn-primary', text: '+ 新建源站池', onclick: () => openPoolDrawer(null, 'pool') }),
    ]));
    return wrap;
  }
  function statCard(label, value) {
    return el('div', { class: 'card' }, [
      el('div', { class: 'card-label' }, label),
      el('div', { class: 'card-value' }, value),
    ]);
  }

  // ====== 站点管理 ======
  async function renderSites() {
    const wrap = el('div', { class: 'section' });
    wrap.appendChild(el('div', { class: 'section-head' }, [
      el('h3', {}, '站点管理'),
      el('button', { class: 'btn btn-primary', text: '+ 新建站点', onclick: () => openSiteDrawer(null) }),
    ]));
    if (!APP_DATA.sites.length) {
      wrap.appendChild(el('p', { class: 'empty' }, '暂无站点，点击右上角新建。'));
      return wrap;
    }
    const rows = APP_DATA.sites.map((s) => {
      const p = APP_DATA.pools.find((x) => x.id === s.poolId);
      return [
        s.host,
        s.enabled ? '启用' : '停用',
        p
          ? el('span', {}, [
            el('span', { class: 'badge ' + (poolKind(p) === 'single' ? 'badge-single' : 'badge-pool') },
              poolKind(p) === 'single' ? '单一' : '池'),
            el('span', { text: ' ' + (p.name || p.id) }),
          ])
          : (s.poolId || '—'),
        String((s.rules || []).length),
        String(s.cacheGen || 0),
        actions([
          { label: '编辑', onClick: () => openSiteDrawer(s.host) },
          { label: '缓存', onClick: () => openCacheDrawer(s.host) },
          { label: '删除', cls: 'btn-danger', onClick: () => removeSite(s.host) },
        ]),
      ];
    });
    wrap.appendChild(table(['Host', '状态', '源站', '规则数', '代次', '操作'], rows));
    return wrap;
  }

  // ====== 流量序列（借鉴 Cloudflare Traffic Sequence 的前端方案）======
  /** 根据池 id 取用户可见名称（找不到时回退 id 本体） */
  function poolName(id) {
    if (!id) return '未设置';
    const p = APP_DATA.pools.find((x) => x.id === id);
    return (p && (p.name || p.id)) || id;
  }

  // 把一个站点（或所有站点）的请求处理流程，按「请求入口 → 最终用户」的真实顺序，
  // 渲染成一条可点击的竖向流水线。点击任一阶段，跳转到对应环节的设置；单站点下规则可拖拽排序。
  async function renderTrafficSequence() {
    const wrap = el('div', { class: 'section seq-page' });

    if (!APP_DATA.sites.length) {
      wrap.appendChild(el('h3', {}, '流量序列'));
      wrap.appendChild(el('p', { class: 'empty' }, '暂无站点，请先在「站点管理」中创建站点。'));
      return wrap;
    }

    const ALL = '__all__';
    const initial = decodeURIComponent(location.hash.split('?host=')[1] || '');
    const initHost = (initial && (initial === ALL || initial === '__global__' || APP_DATA.sites.some((s) => s.host === initial)))
      ? initial : APP_DATA.sites[0].host;

    wrap.appendChild(el('div', { class: 'section-head' }, [
      el('h3', {}, '流量序列'),
      el('div', { class: 'seq-pick' }, [
        el('label', { class: 'muted', text: '站点：' }),
        (() => {
          const sel = select('', [
            { value: ALL, label: '全部站点总览（跨域名）' },
            { value: '__global__', label: '全站通用规则（兜底默认）' },
            ...APP_DATA.sites.map((s) => ({ value: s.host, label: s.host })),
          ], initHost);
          sel.className = 'input';
          return sel;
        })(),
      ]),
    ]));
    wrap.appendChild(el('p', { class: 'hint' }, '本图是请求从进入网关到返回浏览器的完整处理顺序（顺序固定、不可更改），共 18 个阶段，采用 Cloudflare 流量序列风格：每个阶段卡片本身就是一个独立的规则引擎或配置入口，阶段之间相互独立（AND），阶段内部可有多个规则集（OR：从上到下匹配，命中即跳出本阶段进入下一阶段）。某阶段站点未做任何设置时，自动回落「全站通用规则」作为实际生效（看卡片上的「回落全站兜底」提示）。点击阶段卡片或其中规则即可编辑。'));

    const hostSel = $('select', wrap);
    const flow = el('div', { class: 'seq-flow' });
    wrap.appendChild(flow);

    // 预取全站通用规则（兜底），用于各阶段「站点未设置→回落全站兜底」的标注与跳转
    let GLOBAL_RULES = [];
    try {
      const gr = await API.rules.global().catch(() => null);
      GLOBAL_RULES = (gr && gr.rules) || [];
    } catch { GLOBAL_RULES = []; }
    GLOBAL_RULES = GLOBAL_RULES.slice().sort((a, b) => (b.priority || 0) - (a.priority || 0));

    // 汇总一条规则的动作子阶段（用于序列展示）
    function ruleSubs(r) {
      const a = r.action || {};
      const subs = [];
      const rw = a.rewrite || {};
      if (rw.type && rw.type !== 'none') subs.push(\`URL重写(\${rw.type})\`);
      if (a.forceHttps) subs.push('强制HTTPS');
      if (a.redirect && a.redirect.enabled) subs.push(\`重定向(\${a.redirect.status || 302})\`);
      if (a.directResponse && a.directResponse.enabled) subs.push(\`自定义响应(\${a.directResponse.status || 200})\`);
      if (a.poolId) subs.push(\`源站→\${poolName(a.poolId)}\`);
      if (a.hostHeader && a.hostHeader.mode && a.hostHeader.mode !== 'accel') subs.push(\`回源Host(\${a.hostHeader.mode})\`);
      if (a.clientIpHeader && a.clientIpHeader.enabled) subs.push(\`客户端IP→\${a.clientIpHeader.name || 'X-EdgeGateway-Client-IP'}\`);
      if (a.followRedirect) subs.push('回源跟随3xx');
      if (a.originTimeoutMs) subs.push(\`回源超时\${a.originTimeoutMs}ms\`);
      if (a.engine) subs.push(\`引擎(\${a.engine})\`);
      if (a.scheme) subs.push(\`协议(\${a.scheme})\`);
      if (Number(a.port) > 0) subs.push(\`端口(\${a.port})\`);
      const cp = a.cache || {};
      if (cp && cp.mode === 'noCache') subs.push('不缓存');
      else if (cp && cp.enabled) subs.push('缓存');
      const rh = a.reqHeaders || {};
      if (rh.set && Object.keys(rh.set).length || (rh.remove || []).length) subs.push('改请求头');
      const rph = a.respHeaders || {};
      if (rph.set && Object.keys(rph.set).length || (rph.remove || []).length) subs.push('改响应头');
      return subs;
    }

    // 渲染单个站点的完整序列（draggable=true 时规则可拖拽）
    // 严格按「①→⑱」18 个阶段顺序；阶段间相互独立（AND），阶段内规则集是 OR（按 priority 降序从上到下匹配，命中即跳出本阶段）。
    // 某阶段站点无规则时，回落全站通用规则（GLOBAL_RULES）作为实际生效，卡片显示「回落全站兜底」。
    function renderSite(site, draggable) {
      const rules = (site.rules || [])
        .slice()
        .sort((a, b) => (b.priority || 0) - (a.priority || 0));
      const ruleNodes = [];

      const sec = site.security || {};

      // 统一渲染一个「规则引擎型」阶段：站点规则按本阶段 match 命中子集；为空则回落全站兜底
      function renderRuleStage(no, icon, title, stageSummary, matchFn, opts) {
        const matched = rules.filter((r) => { try { return matchFn(r.action || {}); } catch { return false; } });
        const globalMatched = GLOBAL_RULES.filter((r) => { try { return matchFn(r.action || {}); } catch { return false; } });
        const hasSite = matched.length > 0;
        const hasGlobal = !hasSite && globalMatched.length > 0;
        const badge = hasSite ? \`\${matched.length} 条\` : (hasGlobal ? '回落全站兜底' : '未配置');
        const summary = hasSite
          ? \`\${matched.length} 条规则（按优先级从上到下匹配，命中即跳出本阶段）；\${stageSummary}\`
          : (hasGlobal
            ? \`本站无设置 → 实际生效为「全站通用规则」\${globalMatched.length} 条（点击前往编辑）\`
            : \`本站无设置，且无全站兜底；\${stageSummary}\`);
        const onClick = opts
          ? () => openRulesDrawer(site.host, opts)
          : (hasGlobal ? () => { location.hash = '#/sequence?host=__global__'; } : null);
        const owner = opts ? opts.owner : (hasGlobal ? '全站通用规则（兜底，点击前往）' : null);
        flow.appendChild(seqStage(icon, \`\${no} \${title}\`, summary, badge, 'sec-rules', onClick, owner));
        if (hasSite && matched.length) {
          flow.appendChild(el('div', { class: 'seq-rule-list' }, matched.map((r) => {
            const condCount = (r.match && r.match.conditions || []).reduce((n, g) => n + g.length, 0)
              + Object.keys(legacyMatchFields(r.match || {})).length;
            const idx = rules.indexOf(r);
            const node = seqRuleInPack(r, ruleSubs(r), condCount, site.host, draggable);
            if (draggable && idx >= 0) ruleNodes.push({ node, index: idx });
            return node;
          })));
        }
      }

      // ── ① 匹配站点 ─────────────────────────────────────────────
      flow.appendChild(seqGroup('①', '匹配站点', '按 Host 命中站点配置，决定后续整条管线走哪套设置'));
      flow.appendChild(seqStage('🛰️', '① 匹配站点 matchSite',
        \`\${site.host} · \${site.enabled === false ? '已停用' : '启用'} · IPv6 \${site.ipv6Support ? '已开启' : '未开启'}\`,
        site.enabled === false ? '已停用' : '启用', 'sec-basic',
        () => openSiteDrawer(site.host, 'sec-basic'), '站点基础抽屉'));

      // ── ② 安全校验：5 个最小任务包，各自独立成片段 ───────────────
      flow.appendChild(seqGroup('②', '安全校验 checkSecurity', 'fail-closed：自身异常也按 403 拦截，绝不放行。以下 5 包全部通过才继续 ③'));

      const ipCnt = (sec.ipBlacklist || []).length + (sec.ipWhitelist || []).length;
      flow.appendChild(seqStage('🚧', '②.1 IP 访问规则',
        ipCnt ? \`黑名单 \${(sec.ipBlacklist || []).length} 条 · 白名单 \${(sec.ipWhitelist || []).length} 条\` : '未配置 IP 访问控制',
        ipCnt ? '已配置' : '未配置', 'sec-ip',
        () => openSecurityDrawer(site.host, 'sec-ip'), '安全防护抽屉 · IP 访问控制'));

      const wafItems = [];
      if (sec.refererMode && sec.refererMode !== 'off') wafItems.push(\`防盗链 \${sec.refererMode === 'whitelist' ? '白名单' : '黑名单'} \${(sec.refererList || []).length} 条\`);
      if ((sec.uaBlacklist || []).length) wafItems.push(\`UA 黑名单 \${(sec.uaBlacklist || []).length} 条\`);
      flow.appendChild(seqStage('🛡️', '②.2 WAF · 自定义规则（UA / Referer）',
        wafItems.length ? wafItems.join(' · ') : '未配置 UA / Referer 校验',
        wafItems.length ? '已配置' : '未配置', 'sec-waf',
        () => openSecurityDrawer(site.host, 'sec-waf'), '安全防护抽屉 · UA黑名单 / 防盗链'));

      const bm = sec.botManagement || {};
      flow.appendChild(seqStage('🤖', '②.3 自动程序（Bot 管理）',
        bm.enabled
          ? \`已启用 · \${bm.mode === 'allowlist' ? '白名单仅放行' : '黑名单拦截'} \${(bm.list || []).length} 条特征\`
          : '未启用 Bot 管理（独立字段 botManagement）',
        bm.enabled ? '已启用' : '未配置', 'sec-bot',
        () => openSecurityDrawer(site.host, 'sec-bot'), '安全防护抽屉 · 自动程序（独立最小任务包）'));

      const su = sec.signedUrl || {};
      flow.appendChild(seqStage('🔑', '②.4 Access · 令牌鉴权（签名 URL）⚠️实验特性',
        su.enabled ? \`已启用 · 参数 \${su.param || 'sign'}\${su.ttl ? ' · 有效期 ' + su.ttl + 's' : ''}\` : '未启用签名 URL',
        su.enabled ? '已启用' : '未配置', 'sec-token',
        () => openSecurityDrawer(site.host, 'sec-token'), '安全防护抽屉 · 签名 URL（内置签发工具待开发）'));

      const rl = sec.rateLimit || {};
      flow.appendChild(seqStage('⏱️', '②.5 速率限制',
        rl.enabled ? \`已启用 · \${rl.rpm || 0} 次/分钟\` : '未启用请求限速',
        rl.enabled ? '已启用' : '未配置', 'sec-ratelimit',
        () => openSecurityDrawer(site.host, 'sec-ratelimit'), '安全防护抽屉 · 请求限速'));

      // ── ③ 首要分流：由负载均衡实际选出一个具体临时回源对象 ───────
      flow.appendChild(seqGroup('③', '首要分流：选出「本次回源对象」（真实推导的具体临时对象）', '不是虚拟占位：单源站 = 该源站本身；源站池 = 按负载均衡策略（chain/roundrobin/随机/加权/IP哈希）实际选出的某一个 oX。这个具体对象即后续 ⑤~⑱ 规则的「回源目标」匹配维度（target=origin / originAddr），可在一条线上用它做多分支。'));
      const defPool = APP_DATA.pools.find((p) => p.id === site.poolId);
      const defKind = defPool ? poolKind(defPool) : '';
      const originId = defPool && defKind === 'single'
        ? (defPool.origins && defPool.origins[0] && defPool.origins[0].id)
        : (defPool ? '按策略选出的 oX' : '');
      flow.appendChild(seqStage('🎯', '③ 本次回源对象（推导·只读）',
        site.poolId
          ? (defPool
            ? (defKind === 'single'
              ? \`单一源站：\${defPool.name || defPool.id} · \${originSummary(defPool)}（回源目标 id=\${defPool.origins && defPool.origins[0] && defPool.origins[0].id}）\`
              : \`源站池：\${defPool.name || defPool.id} · 策略 \${defPool.strategy || 'roundrobin'} · \${(defPool.origins || []).length} 个源站（每次按策略选出一个 oX 作为回源目标）\`)
            : \`源站已被删除或不可用：\${site.poolId}\`)
          : '未设置默认源站',
        site.poolId ? '推导' : '未配置', 'sec-origin',
        // ③ 是由「单站点选定单源站 / 单源站池按负载均衡自动选定」推导出的抽象虚拟临时对象，
        // 本身不可直接干预；如需更改回源对象，应去「① 站点基础 / 源站池」或「⑨ Origin Rules」编辑。
        () => toast('③ 是推导出的临时虚拟回源对象，不可直接编辑。如需更改回源对象，请到「① 匹配站点」改默认源站、到「源站」页编辑源站池，或用「⑨ Origin Rules」规则覆盖。', 'info'),
        null));

      // ── ④ URL 规范化（我们当前未实现，作为只读占位，可跳过）────
      flow.appendChild(seqGroup('④', 'URL 规范化', '把请求 URL 统一成标准形态（大小写、尾部斜杠、查询排序等）。本网关暂未实现该阶段，流量直接跳过进入 ⑤'));
      flow.appendChild(seqStage('🔧', '④ URL 规范化 normalize',
        '本网关暂不支持 URL 规范化，请求原样进入 ⑤ URL 重写阶段。',
        '暂不支持', null, null, null));

      // ── ⑤~⑪ 规则驱动阶段：每个阶段卡片即一个独立规则引擎 ────────
      flow.appendChild(seqGroup('⑤-⑪', '规则驱动阶段（每个阶段 = 一个独立规则引擎）', '流量依次经过这些阶段，每个阶段内部按 priority 降序（从上到下）匹配，命中即跳出本阶段进入下游；站点无设置则回落全站通用规则。多分支用「回源目标」条件表达：在规则匹配里加 target=origin/originAddr（③ 选出的具体源站），如「路径=/img/ 且 回源目标=oX → 动作」，⑦~⑱ 全部共用一条线，⑩⑭ 是真实只读的实际生效结果。'));

      renderRuleStage('⑤', '✂️', 'URL 重写', '按规则改写客户端请求路径（不含源站 pathPrefix）',
        (a) => a.rewrite && a.rewrite.type && a.rewrite.type !== 'none',
        { title: 'URL 重写规则', owner: '路由规则抽屉 · URL 重写', allowedOps: ['rewrite'], hideTargetPool: true, match: (a) => a.rewrite && a.rewrite.type && a.rewrite.type !== 'none' });

      renderRuleStage('⑥', '↪️', '重定向规则', '把请求重定向到其它 URL（命中即终止回源）',
        (a) => a.redirect && a.redirect.enabled,
        { title: '重定向规则', owner: '路由规则抽屉 · 重定向', allowedOps: ['redirect'], hideTargetPool: true, match: (a) => a.redirect && a.redirect.enabled });

      renderRuleStage('⑦', '🔒', '强制 HTTPS / 直接响应（终止型）', '命中 http 返回 301/307 跳 https，或直接用自定义 body/status 响应，不再回源',
        (a) => a.forceHttps || (a.directResponse && a.directResponse.enabled),
        { title: '强制 HTTPS / 直接响应规则', owner: '路由规则抽屉 · 强制HTTPS / 直接响应', allowedOps: ['forceHttps', 'directResponse'], hideTargetPool: true, match: (a) => a.forceHttps || (a.directResponse && a.directResponse.enabled) });

      renderRuleStage('⑧', '📤', '修改请求头', '在回源请求发出去之前增 / 删 / 改 HTTP 头',
        (a) => { const h = a.reqHeaders || {}; return (h.set && Object.keys(h.set).length) || (h.remove || []).length; },
        { title: '修改请求头规则', owner: '路由规则抽屉 · 修改请求头', allowedOps: ['reqHeaders'], hideTargetPool: true, match: (a) => { const h = a.reqHeaders || {}; return (h.set && Object.keys(h.set).length) || (h.remove || []).length; } });

      renderRuleStage('⑨', '🔀', 'Origin Rules', '更改回源目标：回源 Host、回源连接参数（引擎/协议/端口）或候选源站',
        (a) => a.poolId || (a.inlineOrigins || []).length || (a.hostHeader && a.hostHeader.mode && a.hostHeader.mode !== 'accel') || a.engine || a.scheme || Number(a.port) > 0,
        { title: 'Origin Rules', owner: '路由规则抽屉 · Origin Rules', allowedOps: ['hostHeader', 'originConn', 'targetPool'], hideTargetPool: false, match: (a) => a.poolId || (a.inlineOrigins || []).length || (a.hostHeader && a.hostHeader.mode && a.hostHeader.mode !== 'accel') || a.engine || a.scheme || Number(a.port) > 0 });

      // ── ⑩ 确定实际源站（运行时推导，纯只读）──────────────────
      const ovrPool = rules.find((r) => r.action && r.action.poolId);
      const globalOv = !ovrPool && GLOBAL_RULES.find((r) => r.action && r.action.poolId);
      flow.appendChild(seqGroup('⑩', '确定实际源站', '沿用 ③ 首要分流结果，或被 ⑨「Origin Rules」阶段命中的规则覆盖（运行时推导，无独立配置项）'));
      flow.appendChild(seqStage('🧭', '⑩ 实际源站',
        ovrPool
          ? \`存在站点规则覆盖 → \${poolName(ovrPool.action.poolId)}（命中该规则时生效）\`
          : (globalOv
            ? \`站点无覆盖 → 回落全站兜底 → \${poolName(globalOv.action.poolId)}\`
            : \`无规则覆盖 → 沿用 ③ 的 \${site.poolId ? poolName(site.poolId) : '未配置'}\`),
        '推导', null, null, null));

      renderRuleStage('⑪', '📥', 'Cache Rules（缓存请求设置）', '缓存策略（edgeTtl / SWR / browserTtl / 绕过缓存）等请求级缓存设置',
        (a) => a.cache && (a.cache.enabled || a.cache.mode === 'noCache'),
        { title: 'Cache Rules', owner: '路由规则抽屉 · Cache Rules（缓存策略）', allowedOps: ['cache'], hideTargetPool: true, match: (a) => a.cache && (a.cache.enabled || a.cache.mode === 'noCache') });

      // ── ⑫ 缓存键（可干预：站点 cacheGen）──────────────────────
      flow.appendChild(seqGroup('⑫', '缓存键', '合并 policy = 默认 < 源站级 cache < ⑪ Cache Rules；本环节可干预项：站点 cacheGen（代次）。'));
      const cacheRules = rules.filter((r) => r.action && r.action.cache && (r.action.cache.enabled || r.action.cache.mode === 'noCache'));
      const hasCache = cacheRules.some((r) => r.action.cache.enabled);
      flow.appendChild(seqStage('🔖', '⑫ 合并缓存策略 & 构造缓存键',
        \`⑪ 缓存动作 \${cacheRules.length} 条 · 站点 cacheGen=\${site.cacheGen || 0}\${hasCache ? '（已启用节点缓存）' : ''}\`,
        '推导', null, () => openCacheGenDrawer(site.host, cacheRules.length, hasCache), '缓存键抽屉（仅调整 cacheGen 代次）'));

      // ── ⑬ 查边缘缓存（运行时，纯只读）──────────────────────────
      flow.appendChild(seqGroup('⑬', '查缓存', '命中则直接返回（X-Cache: HIT），未命中继续 ⑭ 真正回源。运行时行为。'));
      flow.appendChild(seqStage('⚡', '⑬ 查边缘缓存 cacheMatch',
        '命中则直接返回（响应头 X-Cache: HIT），未命中继续 ⑭ 真正回源。运行时行为，无配置项。',
        '运行时', null, null, null));

      // ── ⑭ 回源循环（此时才真正发出回源请求；可干预：源站/池）────
      const effPoolId = (ovrPool && ovrPool.action.poolId) || (globalOv && globalOv.action.poolId) || site.poolId;
      const pool = APP_DATA.pools.find((p) => p.id === effPoolId);
      const fo = (pool && pool.failover) || {};
      const connRule = rules.find((r) => { const a = r.action || {}; return (a.clientIpHeader && a.clientIpHeader.enabled) || a.originTimeoutMs || a.followRedirect; });
      const gConnRule = !connRule && GLOBAL_RULES.find((r) => { const a = r.action || {}; return (a.clientIpHeader && a.clientIpHeader.enabled) || a.originTimeoutMs || a.followRedirect; });
      flow.appendChild(seqGroup('⑭', '回源循环 requestWithFailover（真正发出回源请求）', '逐个源站尝试；⑤⑨⑧ 各阶段规则在此对每个源站落地；回源连接参数受规则 clientIp / 超时 / 跟随3xx 影响。可干预：源站地址、策略、故障转移。'));
      flow.appendChild(seqStage('🗄️', '⑭ 源站与故障转移',
        pool
          ? (poolKind(pool) === 'single'
            ? \`单一源站 \${pool.name || pool.id} · \${originSummary(pool)} · 重试 \${fo.maxRetries != null ? fo.maxRetries : 2} 次\${connRule || gConnRule ? '（受规则回源参数影响）' : ''}\`
            : \`源站池 \${pool.name || pool.id} · 策略 \${pool.strategy || 'roundrobin'} · \${(pool.origins || []).length} 个源站 · 重试 \${fo.maxRetries != null ? fo.maxRetries : 2} 次\${connRule || gConnRule ? '（受规则回源参数影响）' : ''}\`)
          : '未配置源站',
        pool ? '已配置' : '未配置', null,
        pool ? () => openPoolDrawer(pool.id) : () => openInitialOriginDrawer(site.host, 'sec-origin'),
        pool ? '源站抽屉' : '初始回源对象抽屉 · 源站方式'));

      const subSteps = [
        ['⑭.1 合并本源站配置', '源站级打底 + ⑤⑧⑨ 规则级覆盖，形成回源改写输入'],
        ['⑭.2 构造回源 URL', '落实 ⑤「URL 重写」与 ⑨「Origin Rules」的路径 / Host 改写'],
        ['⑭.3 构造回源请求头', '源站 extraHeaders + ⑧「修改请求头」规则的改写 + 客户端IP'],
        ['⑭.4 选择引擎并发起', 'fetch / socket 引擎按源站配置分派（真正发请求）'],
        ['⑭.5 处理响应 / 异常', '命中 retryOn 状态码或异常 → 换下一源站'],
      ];
      flow.appendChild(el('div', { class: 'seq-substeps' },
        subSteps.map(([t, d]) => el('div', { class: 'seq-substep' }, [
          el('span', { class: 'seq-substep-t', text: t }),
          el('span', { class: 'seq-substep-d', text: d }),
        ]))));

      // ── ⑮ clone ─────────────────────────────────────────────────
      flow.appendChild(seqGroup('⑮', 'clone 原始响应', 'cacheKey 已在 ⑫ 固定，不随 ⑭ 换源变化。运行时行为。'));
      flow.appendChild(seqStage('🧬', '⑮ clone 原始响应',
        'cacheKey 已在 ⑫ 固定，不随 ⑭ 换源变化。运行时行为。', '运行时', null, null, null));

      // ── ⑯ 改写响应头（含 response cache rule）──────────────────
      flow.appendChild(seqGroup('⑯', '改写响应头（含 response cache rule）', '回源响应返回用户前的所有响应头改写，以及 CF 风格 response cache rule（响应级缓存控制）。'));
      renderRuleStage('⑯', '📝', '改写响应头 / Response Cache Rule', '增 / 删 / 改响应头，以及响应级缓存控制（response cache rule）',
        (a) => { const h = a.respHeaders || {}; return (h.set && Object.keys(h.set).length) || (h.remove || []).length; },
        { title: '改写响应头规则', owner: '路由规则抽屉 · 改写响应头 / Response Cache Rule', allowedOps: ['respHeaders'], hideTargetPool: true, match: (a) => { const h = a.respHeaders || {}; return (h.set && Object.keys(h.set).length) || (h.remove || []).length; } });

      // ── ⑰ 写缓存 ───────────────────────────────────────────────
      flow.appendChild(seqGroup('⑰', '写边缘缓存', '按 ⑫ 的 cacheKey 写入 ⑪ 定义的缓存策略。'));
      flow.appendChild(seqStage('💾', '⑰ 写边缘缓存',
        hasCache ? '应用 ⑪「Cache Rules」的缓存策略，按 ⑫ 的 cacheKey 写入。' : '未启用缓存，跳过写入。',
        '运行时', null, null, null));

      // ── ⑱ 返回用户 ─────────────────────────────────────────────
      flow.appendChild(seqGroup('⑱', '返回最终用户', '统一注入品牌响应头并记录统计，固定行为。'));
      flow.appendChild(seqStage('👤', '⑱ 响应 & 最终用户',
        '统一注入品牌响应头 Server: EdgeGateway、Via: 1.1 EdgeGateway，并记录统计。固定行为。',
        '固定', null, null, null));

      return { ruleNodes, rules };
    }

    // 拖拽排序：松手后重算 priority（降序）并保存
    function wireRuleDrag(ruleNodes, rules, site) {
      let dragNode = null;
      const clearMarks = () => ruleNodes.forEach(({ node }) =>
        node.classList.remove('drop-before', 'drop-after', 'dragging'));

      ruleNodes.forEach(({ node, index }) => {
        node.addEventListener('dragstart', (e) => {
          dragNode = node;
          node.classList.add('dragging');
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', String(index));
        });
        node.addEventListener('dragend', clearMarks);
        node.addEventListener('dragover', (e) => {
          e.preventDefault();
          if (node === dragNode) return;
          const rect = node.getBoundingClientRect();
          const after = e.clientY > rect.top + rect.height / 2;
          clearMarks();
          dragNode && dragNode.classList.add('dragging');
          node.classList.add(after ? 'drop-after' : 'drop-before');
        });
        node.addEventListener('drop', async (e) => {
          e.preventDefault();
          if (!dragNode || dragNode === node) return;
          const from = Number(e.dataTransfer.getData('text/plain'));
          const to = index;
          const moved = rules.splice(from, 1)[0];
          rules.splice(to, 0, moved);
          const updated = {
            ...site,
            rules: rules.map((r, i) => ({ ...r, priority: (rules.length - i) * 10 })),
          };
          // 同步内存，便于切换站点后保持一致
          const idx = APP_DATA.sites.findIndex((s) => s.host === site.host);
          if (idx >= 0) APP_DATA.sites[idx] = updated;
          try {
            await API.sites.save(site.host, updated);
            render(hostSel.value);
            toast('已保存规则优先级', 'ok');
          } catch (err) {
            toast('保存失败：' + (err && err.message ? err.message : '未知错误'), 'err');
            render(hostSel.value);
          }
        });
      });
    }

    // 全部站点总览：每个域名一个分组，列出其完整序列
    function renderAll() {
      APP_DATA.sites.forEach((site) => {
        const sec = site.security || {};
        const secOn = ['refererMode', 'uaBlacklist', 'ipBlacklist', 'ipWhitelist', 'signedUrl', 'rateLimit', 'botManagement']
          .some((k) => {
            if (k === 'refererMode') return sec.refererMode && sec.refererMode !== 'off';
            if (k === 'signedUrl' || k === 'rateLimit' || k === 'botManagement') return sec[k] && sec[k].enabled;
            return (sec[k] || []).length;
          });
        flow.appendChild(el('div', { class: 'seq-site-head' }, [
          el('div', { class: 'seq-site-name', text: site.host }),
          el('div', { class: 'seq-site-meta' }, [
            el('span', { class: 'seq-chip', text: \`\${(site.rules || []).length} 条规则\` }),
            el('span', { class: 'seq-chip', text: secOn ? '安全已启用' : '安全未配置' }),
            site.poolId ? el('span', { class: 'seq-chip', text: '源站 ' + poolName(site.poolId) }) : null,
            el('span', { class: 'seq-go seq-site-go', text: '编辑站点 →' }),
          ]),
          el('div', { class: 'seq-site-click', onclick: () => openSiteDrawer(site.host) }),
        ]));
        renderSite(site, false);
      });
    }

    const render = (host) => {
      clear(flow);
      if (host === ALL) { renderAll(); return; }
      if (host === '__global__') { renderGlobal(); return; }
      const site = APP_DATA.sites.find((s) => s.host === host) || APP_DATA.sites[0];
      if (!site) return;
      const { ruleNodes, rules } = renderSite(site, true);
      wireRuleDrag(ruleNodes, rules, site);
    };

    // 全站通用规则（兜底）视图：对所有站点生效、优先级最低
    function renderGlobal() {
      const gRules = GLOBAL_RULES.slice();
      // 全站通用规则视图：同样按 18 阶段展示，每阶段列出属于该阶段的全局规则（OR：从上到下匹配）
      // 全站规则是兜底默认，无更上级兜底；点击阶段或规则进入全局规则编辑器。
      function gStage(no, icon, title, stageSummary, matchFn) {
        const matched = gRules.filter((r) => { try { return matchFn(r.action || {}); } catch { return false; } });
        const summary = matched.length
          ? \`\${matched.length} 条规则（按优先级从上到下匹配，命中即跳出本阶段）；\${stageSummary}\`
          : \`未配置；\${stageSummary}\`;
        flow.appendChild(seqStage(icon, \`\${no} \${title}\`, summary, matched.length ? \`\${matched.length} 条\` : '未配置', 'sec-rules',
          () => openGlobalRulesDrawer(), '全站通用规则编辑器'));
        if (matched.length) {
          flow.appendChild(el('div', { class: 'seq-rule-list' }, matched.map((r) => {
            const condCount = (r.match && r.match.conditions || []).reduce((n, g) => n + g.length, 0)
              + Object.keys(legacyMatchFields(r.match || {})).length;
            const node = seqRuleInPack(r, ruleSubs(r), condCount, '__global__', false);
            return node;
          })));
        }
      }

      flow.appendChild(seqGroup('全站', '全站通用规则（兜底默认）', '以下规则对任何站点都生效，仅当站点自身规则未命中时才触发，相当于全局默认设置。按 18 阶段分布，每个阶段内部按优先级降序 OR 匹配。'));

      flow.appendChild(seqStage('🛰️', '① 匹配站点', '全站规则不参与匹配站点，仅作为兜底作用于已命中的站点。', '—', null, null, null));

      flow.appendChild(seqGroup('②-③', '安全 / 首要分流（全站维度）', '全站通用规则当前不承载安全包与源站选择，阶段显示空。'));
      flow.appendChild(seqStage('🚧', '②.1~②.5 安全包', '全站通用规则暂不含安全配置，安全在各站点自身配置。', '未配置', null, null, null));
      flow.appendChild(seqStage('🎯', '③ 初始回源对象', '全站通用规则不选择初始源站，源站由各站点自身决定。', '未配置', null, null, null));
      flow.appendChild(seqStage('🔧', '④ URL 规范化', '全站通用规则暂不支持 URL 规范化。', '暂不支持', null, null, null));

      flow.appendChild(seqGroup('⑤-⑪', '规则驱动阶段（全站兜底）', '各阶段全站兜底规则；站点序列某阶段无设置时，即实际生效这些规则。'));
      gStage('⑤', '✂️', 'URL 重写', '按规则改写客户端请求路径', (a) => a.rewrite && a.rewrite.type && a.rewrite.type !== 'none');
      gStage('⑥', '↪️', '重定向规则', '把请求重定向到其它 URL', (a) => a.redirect && a.redirect.enabled);
      gStage('⑦', '🔒', '强制 HTTPS / 直接响应', '命中 http 跳 https，或直接响应', (a) => a.forceHttps || (a.directResponse && a.directResponse.enabled));
      gStage('⑧', '📤', '修改请求头', '回源前增删改 HTTP 头', (a) => { const h = a.reqHeaders || {}; return (h.set && Object.keys(h.set).length) || (h.remove || []).length; });
      gStage('⑨', '🔀', 'Origin Rules', '改回源 Host / 回源连接参数 / 候选源站', (a) => a.poolId || (a.inlineOrigins || []).length || (a.hostHeader && a.hostHeader.mode && a.hostHeader.mode !== 'accel') || a.engine || a.scheme || Number(a.port) > 0);
      gStage('⑪', '📥', 'Cache Rules（缓存请求设置）', '缓存策略等请求级缓存设置', (a) => a.cache && (a.cache.enabled || a.cache.mode === 'noCache'));
      gStage('⑯', '📝', '改写响应头 / Response Cache Rule', '响应头改写与响应级缓存控制', (a) => { const h = a.respHeaders || {}; return (h.set && Object.keys(h.set).length) || (h.remove || []).length; });

      flow.appendChild(seqGroup('⑫-⑱', '缓存 / 回源 / 响应（运行时）', '全站兜底规则在此被应用；以下为运行时推导行为。'));
      flow.appendChild(seqStage('🔖', '⑫ 缓存键', '合并 policy 时，全站规则的缓存动作作为最低优先级兜底。', '推导', null, null, null));
      flow.appendChild(seqStage('⚡', '⑬ 查缓存', '运行时行为。', '运行时', null, null, null));
      flow.appendChild(seqStage('🗄️', '⑭ 回源循环', '受全站规则的回源连接参数影响。', '运行时', null, null, null));
      flow.appendChild(seqStage('🧬', '⑮ clone', '运行时行为。', '运行时', null, null, null));
      flow.appendChild(seqStage('💾', '⑰ 写缓存', '按 ⑪ 全站缓存策略写入。', '运行时', null, null, null));
      flow.appendChild(seqStage('👤', '⑱ 返回用户', '固定行为。', '固定', null, null, null));

      const btn = el('button', { class: 'btn', text: '编辑全站通用规则' });
      btn.onclick = () => openGlobalRulesDrawer();
      flow.appendChild(el('div', { class: 'seq-tools' }, [btn]));
    }

    hostSel.addEventListener('change', () => render(hostSel.value));
    render(initHost);
    return wrap;
  }

  // 流量序列：阶段分组标题（对应 11-request-flow.md 的 ①②③… 大阶段）
  function seqGroup(no, title, desc) {
    return el('div', { class: 'seq-group' }, [
      el('span', { class: 'seq-group-no', text: no }),
      el('div', { class: 'seq-group-main' }, [
        el('div', { class: 'seq-group-title', text: title }),
        desc ? el('div', { class: 'seq-group-desc', text: desc }) : null,
      ]),
    ]);
  }

  // 流量序列：单个阶段卡片。owner = 该最小任务包归属的抽屉（片段边界，一包一抽屉）
  function seqStage(icon, title, summary, badge, anchor, onClick, owner) {
    const off = badge === '未配置' || badge === '未使用' || badge === '已停用';
    const node = el('div', { class: 'seq-stage' + (onClick ? ' clickable' : '') }, [
      el('div', { class: 'seq-icon', text: icon }),
      el('div', { class: 'seq-main' }, [
        el('div', { class: 'seq-title' }, [
          el('span', {}, title),
          badge != null ? el('span', { class: 'seq-badge ' + (off ? 'off' : 'on') }, badge) : null,
        ]),
        el('div', { class: 'seq-summary', text: summary }),
        owner ? el('div', { class: 'seq-owner', text: '归属：' + owner }) : null,
      ]),
      onClick ? el('div', { class: 'seq-go', text: '前往设置 →' }) : null,
    ]);
    if (onClick) node.onclick = onClick;
    return node;
  }

  // 流量序列：挂在 ④ 规则引擎环节下的具体规则节点。点击打开规则编辑器
  // （整条规则及其所有 action 都在此编辑，不按 action 类型拆子环节）。
  // draggable=true 时整体可拖拽（手柄 + draggable 属性），用于调整优先级。
  function seqRuleInPack(rule, subs, condCount, host, draggable) {
    const a = rule.action || {};
    const head = el('div', { class: 'seq-rule-head' }, [
      draggable ? el('span', { class: 'seq-grip', title: '拖拽调整优先级', text: '⠿' }) : null,
      el('span', { class: 'seq-rule-prio', text: 'P' + (rule.priority || 0) }),
      el('span', { class: 'seq-rule-name', text: (rule.name || (rule.id ? '#' + rule.id : '规则')) + (a.poolId ? ' → ' + poolName(a.poolId) : '') }),
      el('span', { class: 'seq-badge ' + (rule.enabled === false ? 'off' : 'on'), text: rule.enabled === false ? '停用' : '启用' }),
    ]);
    const sub = el('div', { class: 'seq-subs' },
      (subs.length ? subs : ['（无动作，仅作为匹配占位）']).map((s) => el('span', { class: 'seq-chip', text: s })));
    const node = el('div', { class: 'seq-stage seq-rule seq-rule-inpack' + (rule.enabled === false ? ' disabled' : '') + (draggable ? ' seq-rule-drag' : '') }, [
      el('div', { class: 'seq-icon', text: '↳' }),
      el('div', { class: 'seq-main' }, [
        head,
        rule.note ? el('div', { class: 'seq-note muted', text: rule.note }) : null,
        el('div', { class: 'seq-summary', text: \`匹配条件：\${condCount} 项\${condCount ? '（命中即执行下列动作）' : '（匹配全部请求）'}\` }),
        sub,
      ]),
      el('div', { class: 'seq-go', text: '编辑规则 →' }),
    ]);
    if (draggable) node.draggable = true;
    node.onclick = () => openRulesDrawer(host);
    return node;
  }

  // ---------------------------------------------------------------------------
  // 通用子组件
  // ---------------------------------------------------------------------------

  // 键值对头部编辑器（set）+ 删除列表（remove）
  // 返回 { root, read() }，read() 返回 { set:{}, remove:[] }
  function headerEditor(initial) {
    initial = initial || { set: {}, remove: [] };
    const setWrap = el('div', { class: 'kv-list' });
    const removeWrap = el('div', { class: 'kv-list' });
    const read = () => {
      const set = {};
      Array.from(setWrap.children).forEach((row) => {
        const k = $('.hk', row).value.trim();
        const v = $('.hv', row).value;
        if (k) set[k] = v;
      });
      const remove = [];
      Array.from(removeWrap.children).forEach((row) => {
        const k = $('.hk', row).value.trim();
        if (k) remove.push(k);
      });
      return { set, remove };
    };
    const addKv = (wrap, k0, v0, withVal) => {
      const row = el('div', { class: 'kv-row' }, [
        el('input', { class: 'input hk', value: k0 || '', placeholder: 'Header-Name' }),
        withVal ? el('input', { class: 'input hv', value: v0 || '', placeholder: 'value' }) : el('span', { class: 'muted', text: '(移除)' }),
        el('button', { class: 'btn btn-sm btn-danger', text: '×', onclick: () => row.remove() }),
      ]);
      wrap.appendChild(row);
    };
    Object.keys(initial.set || {}).forEach((k) => addKv(setWrap, k, initial.set[k], true));
    (initial.remove || []).forEach((k) => addKv(removeWrap, k, '', false));
    if (!setWrap.children.length) addKv(setWrap, '', '', true);
    if (!removeWrap.children.length) addKv(removeWrap, '', '', false);
    const root = el('div', { class: 'header-editor' }, [
      el('div', { class: 'kv-label' }, '新增 / 修改（把某个请求头设成指定值）：'),
      setWrap,
      el('button', { class: 'btn btn-sm', text: '+ 添加', onclick: () => addKv(setWrap, '', '', true) }),
      el('div', { class: 'kv-label' }, '删除（回源 / 返回时去掉某个请求头）：'),
      removeWrap,
      el('button', { class: 'btn btn-sm', text: '+ 添加', onclick: () => addKv(removeWrap, '', '', false) }),
      el('div', { class: 'field-hint muted', text: '请求头就像信封上的备注。回源请求头在请求发给源站前改；节点响应头在结果返回给用户前改。不知道填什么可留空。' }),
    ]);
    root.__read = read;
    return { root, read };
  }

  // 折叠分区（功能分组卡片样式）
  function section(title, desc, children) {
    const body = el('div', { class: 'section-body' }, children);
    const head = el('div', { class: 'section-toggle' }, [
      el('span', { class: 'tw', text: '▸' }),
      el('strong', {}, title),
      desc ? el('span', { class: 'muted', text: ' ' + desc }) : null,
    ]);
    const wrap = el('div', { class: 'subcard' }, [head, body]);
    head.onclick = () => wrap.classList.toggle('collapsed');
    return wrap;
  }

  // 规则操作子模块：默认折叠，仅在「已启用」时展开。
  // watch 为控制开启的控件（checkbox / select）；勾选或切换到非 off 时自动展开，
  // 避免把所有操作的参数一股脑全列出来让用户误以为都要填。
  function opSection(key, title, desc, opts, children) {
    const body = el('div', { class: 'section-body' }, children);
    const head = el('div', { class: 'section-toggle' }, [
      el('span', { class: 'tw', text: '▸' }),
      el('strong', {}, title),
      desc ? el('span', { class: 'muted', text: ' ' + desc }) : null,
    ]);
    const wrap = el('div', { class: 'subcard', id: 'op-' + key }, [head, body]);
    const isOn = () => opts.watch
      ? (opts.watch.type === 'checkbox' ? opts.watch.checked : !!opts.watch.value && opts.watch.value !== 'off')
      : !!opts.enabled;
    if (!isOn()) wrap.classList.add('collapsed');
    head.onclick = () => wrap.classList.toggle('collapsed');
    if (opts.watch) {
      opts.watch.addEventListener('change', () => { if (isOn()) wrap.classList.remove('collapsed'); });
    }
    return wrap;
  }

  // 匹配对象 / 操作符清单
  const MATCH_TARGET_OPTS = [
    { value: 'host', label: 'Host（客户端请求域名）' },
    { value: 'path', label: 'URL 路径' },
    { value: 'fullUrl', label: '完整 URL（含协议、域名、路径、参数）' },
    { value: 'query', label: '查询字符串（Query String）' },
    { value: 'extension', label: '文件后缀' },
    { value: 'filename', label: '文件名称' },
    { value: 'directory', label: '目录' },
    { value: 'method', label: '请求方法' },
    { value: 'protocol', label: '请求协议（HTTP/HTTPS）' },
    { value: 'header', label: '请求头' },
    { value: 'cookie', label: 'Cookie' },
    { value: 'clientIp', label: '客户端 IP' },
    { value: 'clientCountry', label: '客户端地理位置（国家/地区）' },
    { value: 'userAgent', label: 'User-Agent（客户端浏览器标识）' },
    { value: 'referer', label: 'Referer（来源页面）' },
    { value: 'origin', label: '回源目标（源站 ID，由 ③ 首要分流按负载均衡选出）' },
    { value: 'originAddr', label: '回源目标地址（源站 addr，由 ③ 首要分流选出）' },
  ];
  // 运算符对齐 EO 的「运算符」下拉：等于 / 不等于 / 包含 / 正则匹配 / 正则不匹配 / 存在 / 不存在 等
  const MATCH_OP_OPTS = [
    { value: 'equal', label: '等于' },
    { value: 'notEqual', label: '不等于' },
    { value: 'contain', label: '包含' },
    { value: 'notContain', label: '不包含' },
    { value: 'prefix', label: '前缀为' },
    { value: 'notPrefix', label: '前缀不为' },
    { value: 'suffix', label: '后缀为' },
    { value: 'notSuffix', label: '后缀不为' },
    { value: 'regex', label: '正则匹配' },
    { value: 'notRegex', label: '正则不匹配' },
    { value: 'exists', label: '存在' },
    { value: 'notExists', label: '不存在' },
  ];
  const TARGETS_WITH_KEY = ['header', 'cookie', 'query'];
  const OPS_NO_VALUE = ['exists', 'notExists'];

  // 单个条件行：[匹配对象] [键名] [操作符] [值] [忽略大小写] [删除]
  function conditionRow(cond, onRemove) {
    cond = cond || { target: 'path', op: 'prefix', values: [], key: '', ignoreCase: true };
    const tSel = select('', MATCH_TARGET_OPTS, cond.target || 'path');
    tSel.className = 'input';
    const keyInput = el('input', { class: 'input', value: cond.key || '', placeholder: '键名' });
    const opSel = select('', MATCH_OP_OPTS, cond.op || 'prefix');
    opSel.className = 'input';
    const valInput = el('input', {
      class: 'input',
      value: (cond.values || []).join(', '),
      placeholder: '多个值用逗号分隔（之间为“或”）',
    });
    const icCb = el('input', { type: 'checkbox', checked: cond.ignoreCase !== false });
    const valHint = el('span', { class: 'field-hint muted' });

    const keyWrap = el('div', { class: 'cond-cell' }, [keyInput]);
    const valWrap = el('div', { class: 'cond-cell' }, [valInput, valHint]);

    // 运算符对应的填写示例，帮小白看懂“值”该写什么
    const OP_EXAMPLES = {
      equal: '例如填 /index.html 表示路径恰好等于它',
      notEqual: '例如填 /admin 表示路径不是它',
      contain: '例如填 /api 表示路径里包含 /api',
      notContain: '例如填 /private 表示路径不含 /private',
      prefix: '例如填 /img 表示以 /img 开头',
      notPrefix: '例如填 /old 表示不以 /old 开头',
      suffix: '例如填 .php 表示以 .php 结尾',
      notSuffix: '例如填 .css 表示不以 .css 结尾',
      regex: '例如 ^/old/(.*) 表示匹配 /old/ 下的路径；^(.*)$ 表示匹配整条路径（可用 $1 引用）',
      notRegex: '例如 ^/admin 表示不匹配以 /admin 开头',
      exists: '无需填值，只要这个头/参数存在就命中',
      notExists: '无需填值，只要这个头/参数不存在就命中',
    };
    const KEY_HINTS = {
      header: '要匹配的请求头名称，如 User-Agent',
      cookie: '要匹配的 Cookie 名称，如 session',
      query: '要匹配的查询参数名，如 id',
    };
    const ORIGIN_HINT = '回源目标 = ③ 首要分流按负载均衡实际选出的源站。可选源站 ID（exact 匹配）或源站地址（支持包含/前缀/正则）。例如源站池里有 3 个源站，就分别用 3 个「回源目标」条件做分支，⑦~⑱ 共用一条线、⑩⑭ 为真实只读结果。';

    // key 仅对 header/cookie/query 有意义；exists/notExists 不需要值
    const sync = () => {
      const needKey = TARGETS_WITH_KEY.includes(tSel.value);
      keyWrap.style.display = needKey ? '' : 'none';
      keyInput.placeholder = needKey ? (KEY_HINTS[tSel.value] || '键名') : '键名';
      valWrap.style.display = OPS_NO_VALUE.includes(opSel.value) ? 'none' : '';
      valHint.textContent = OPS_NO_VALUE.includes(opSel.value)
        ? ''
        : (tSel.value === 'origin' || tSel.value === 'originAddr')
          ? ORIGIN_HINT
          : (OP_EXAMPLES[opSel.value] || '');
    };
    tSel.onchange = sync;
    opSel.onchange = sync;
    sync();

    const row = el('div', { class: 'cond-row' }, [
      tSel,
      keyWrap,
      opSel,
      valWrap,
      el('label', { class: 'check', title: '不区分大小写（如 Path 与 path 视为相同）' }, [icCb, el('span', { text: '不区分大小写' })]),
      el('button', { class: 'btn btn-sm btn-danger', text: '×', onclick: () => { row.remove(); onRemove && onRemove(); } }),
    ]);

    // 读取该行的当前值（供条件组编辑器汇总）。
    // 缺失此返回值会导致 conditionsEditor 解构得到 undefined，规则编辑器一打开即崩溃。
    const read = () => {
      const value = valInput.value;
      const values = value
        ? value.split(',').map((s) => s.trim()).filter(Boolean)
        : [];
      return {
        target: tSel.value,
        op: opSel.value,
        key: keyInput.value.trim(),
        values,
        ignoreCase: icCb.checked,
      };
    };
    return { row, read };
  }

  // 条件组编辑器：外层 OR，内层 AND
  function conditionsEditor(groups) {
    groups = Array.isArray(groups) && groups.length ? groups : [];
    const wrap = el('div', { class: 'cond-groups' });
    const readers = [];

    const addGroup = (conds) => {
      const rows = el('div', { class: 'cond-rows' });
      const groupReaders = [];
      const entry = { readers: groupReaders };

      const addCond = (c) => {
        const { row, read } = conditionRow(c, () => {
          const i = groupReaders.indexOf(read);
          if (i >= 0) groupReaders.splice(i, 1);
        });
        groupReaders.push(read);
        rows.appendChild(row);
      };

      (conds && conds.length ? conds : [null]).forEach(addCond);

      const box = el('div', { class: 'cond-group' }, [
        el('div', { class: 'cond-group-head' }, [
          el('span', { class: 'badge', text: '且（AND）' }),
          el('button', { class: 'btn btn-sm', text: '+ 条件', onclick: () => addCond(null) }),
          el('button', {
            class: 'btn btn-sm btn-danger',
            text: '删除条件组',
            onclick: () => {
              box.remove();
              const i = readers.indexOf(entry);
              if (i >= 0) readers.splice(i, 1);
            },
          }),
        ]),
        rows,
      ]);
      readers.push(entry);
      wrap.appendChild(box);
    };

    groups.forEach(addGroup);

    const root = el('div', {}, [
      el('div', { class: 'muted', text: '条件组之间为「或（OR）」关系，组内条件之间为「且（AND）」关系。不添加任何条件时匹配全部请求。' }),
      wrap,
      el('button', { class: 'btn btn-sm', text: '+ 添加条件组（或）', onclick: () => addGroup(null) }),
    ]);

    const read = () =>
      readers
        .map((g) => g.readers.map((r) => r()).filter((c) => c.op && c.target))
        .filter((g) => g.length > 0);

    return { root, read };
  }

  // 把秒数翻译成人话（约 X 天/小时），小白更容易理解
  function humanDuration(sec) {
    sec = Number(sec) || 0;
    if (sec <= 0) return '';
    if (sec >= 86400) return \`（约 \${Math.round(sec / 86400)} 天）\`;
    if (sec >= 3600) return \`（约 \${Math.round(sec / 3600)} 小时）\`;
    if (sec >= 60) return \`（约 \${Math.round(sec / 60)} 分钟）\`;
    return \`（\${sec} 秒）\`;
  }

  // 缓存策略编辑器（对齐 EO 缓存配置 + 自定义 Cache Key）
  function cacheEditor(c) {
    c = c || {};
    const key = c.key || {};
    const mode = select('', [
      { value: 'ttl', label: '自定义缓存时间（推荐新手）' },
      { value: 'origin', label: '跟随源站 Cache-Control' },
      { value: 'noCache', label: '不缓存（每次回源）' },
    ], c.mode || 'ttl');
    mode.className = 'input';
    const edge = el('input', { class: 'input', type: 'number', value: c.edgeTtl != null ? c.edgeTtl : 15552000, placeholder: '秒' });
    const browser = el('input', { class: 'input', type: 'number', value: c.browserTtl != null ? c.browserTtl : 1800, placeholder: '秒，-1=跟随源站' });
    const edgeHint = el('span', { class: 'field-hint muted' });
    const browserHint = el('span', { class: 'field-hint muted' });
    const iq = el('input', { type: 'checkbox', checked: c.ignoreQuery !== false });
    const qw = el('input', { class: 'input', value: (c.queryWhitelist || []).join(', '), placeholder: '如 id, page（留空=全部保留）' });

    // 自定义 Cache Key
    const ckCase = el('input', { type: 'checkbox', checked: !!key.ignoreCase });
    const ckScheme = el('input', { type: 'checkbox', checked: !!key.includeScheme });
    const ckHeaders = el('input', { class: 'input', value: (key.headers || []).join(', '), placeholder: '如 accept-language' });
    const ckCookies = el('input', { class: 'input', value: (key.cookies || []).join(', '), placeholder: '如 tier' });

    // 高级
    const statusTtl = el('input', {
      class: 'input',
      value: Object.entries(c.statusTtl || {}).map(([k, v]) => k + ':' + v).join(', '),
      placeholder: '如 404:10, 500:5',
    });
    const preRefresh = el('input', { type: 'checkbox', checked: !!c.preRefresh });
    const preP = el('input', { class: 'input', type: 'number', value: c.preRefreshPercent || 80, placeholder: '%' });
    const offline = el('input', { type: 'checkbox', checked: !!c.offlineCache });

    const refreshHints = () => {
      edgeHint.textContent = '节点保存多久再回源' + humanDuration(edge.value);
      browserHint.textContent = '浏览器本地缓存多久（用户重复访问更快）' + humanDuration(browser.value);
    };
    edge.addEventListener('input', refreshHints);
    browser.addEventListener('input', refreshHints);
    refreshHints();

    const ttlBox = el('div', { class: 'grid2' }, [
      field('边缘缓存时长（秒）', edge, edgeHint.textContent),
      field('浏览器缓存时长（秒，-1=跟随源站）', browser, browserHint.textContent),
    ]);
    // 提前刷新百分比：只有开启「提前回源刷新」时才有意义
    const prePField = field('提前刷新触发时机（剩余百分比）', preP, '例如 80 表示缓存还剩 20% 有效期时就开始后台刷新。');
    const syncPre = () => { prePField.style.display = preRefresh.checked ? '' : 'none'; };
    preRefresh.addEventListener('change', syncPre);
    syncPre();
    // 仅当「不忽略查询串」时才需要填白名单
    // 关键：必须持有 field() 返回的容器节点引用，不能用 qw.parentElement —— 此刻
    // qw 尚未插入任何父节点，parentElement 为 null，直接取 .style 会抛
    // TypeError 并中断整个 cacheEditor / 抽屉渲染（表现为按钮点了没反应）
    const qwField = field('只保留这些查询参数（其余忽略）', qw, '关闭「忽略查询参数」后才需要填；例如 id,page，留空表示保留全部。');
    const syncIQ = () => { qwField.style.display = iq.checked ? 'none' : ''; };
    iq.addEventListener('change', syncIQ);
    syncIQ();

    // 「不缓存」模式下，以下全部与缓存相关的字段都无意义，整体隐藏
    const cacheDetail = el('div', {}, [
      ttlBox,
      el('div', { class: 'grid2' }, [
        el('label', { class: 'check' }, [iq, el('span', { text: '忽略 URL 里的查询参数 ?x=1（推荐开启，命中率更高）' })]),
        el('label', { class: 'check' }, [ckCase, el('span', { text: '缓存键不区分大小写' })]),
      ]),
      qwField,
      section('自定义缓存区分维度', '默认按 URL 缓存即可；此项仅在「同一网址但不同内容」时才用', [
        el('div', { class: 'grid2' }, [
          el('label', { class: 'check' }, [ckScheme, el('span', { text: '区分 http 与 https 为两份缓存' })]),
        ]),
        field('额外按请求头来区分（逗号分隔）', ckHeaders, '例如 accept-language，常用于多语言站点。一般不用填。'),
        field('额外按 Cookie 来区分（逗号分隔）', ckCookies, '例如 tier（会员等级）。一般不用填。'),
      ]),
      section('高级缓存', '状态码缓存 / 预刷新 / 离线兜底——一般用不到，保持默认即可', [
        field('给错误页也加缓存（格式 码:秒，逗号分隔）', statusTtl, '例如 404:10 表示 404 页面也缓存 10 秒，减轻源站压力。'),
        el('div', { class: 'grid2' }, [
          el('label', { class: 'check' }, [preRefresh, el('span', { text: '缓存即将过期时提前回源刷新' })]),
          el('label', { class: 'check' }, [offline, el('span', { text: '源站挂了就用旧缓存顶着' })]),
        ]),
        prePField,
      ]),
    ]);
    // 只有「自定义缓存时间」才需要填 TTL；「不缓存」则隐藏所有缓存细节
    const syncMode = () => {
      const noCache = mode.value === 'noCache';
      cacheDetail.style.display = noCache ? 'none' : '';
      ttlBox.style.display = mode.value === 'ttl' ? '' : 'none';
    };
    mode.onchange = syncMode;
    syncMode();

    const root = el('div', {}, [
      field('缓存模式', mode, '自定义缓存时间：固定存多久；跟随源站：由源站响应头决定；不缓存：每次都回源（适合动态内容）。'),
      cacheDetail,
    ]);

    const read = () => {
      const st = {};
      statusTtl.value.split(',').map((s) => s.trim()).filter(Boolean).forEach((pair) => {
        const [k, v] = pair.split(':').map((x) => (x || '').trim());
        if (k && v && !isNaN(Number(k)) && !isNaN(Number(v))) st[k] = Number(v);
      });
      return {
        enabled: mode.value !== 'noCache',
        mode: mode.value,
        edgeTtl: Number(edge.value) || 0,
        browserTtl: browser.value === '' ? 0 : Number(browser.value),
        ignoreQuery: iq.checked,
        queryWhitelist: qw.value.split(',').map((s) => s.trim()).filter(Boolean),
        key: {
          ignoreCase: ckCase.checked,
          includeScheme: ckScheme.checked,
          headers: ckHeaders.value.split(',').map((s) => s.trim()).filter(Boolean),
          cookies: ckCookies.value.split(',').map((s) => s.trim()).filter(Boolean),
        },
        statusTtl: st,
        preRefresh: preRefresh.checked,
        preRefreshPercent: Number(preP.value) || 80,
        offlineCache: offline.checked,
      };
    };
    return { root, read };
  }

  // 重写编辑器
  // 路径重写的纯前端预览（与 src/proxy/rewrite.js 的 applyRewrite 保持一致）
  function previewRewrite(pathname, rewrite) {
    const type = rewrite && rewrite.type || 'none';
    let out = pathname || '/';
    try {
      if (type === 'prefix') {
        const v = (rewrite.value || '').replace(/\\/+$/, '');
        const right = (out || '').replace(/^\\/+/, '');
        out = (v ? \`\${v}/\${right || ''}\` : \`/\${right}\`);
      } else if (type === 'strip') {
        const v = rewrite.value || '';
        if (v && out.startsWith(v)) out = out.slice(v.length);
      } else if (type === 'regex') {
        const re = new RegExp(rewrite.regexFrom || '', 'g');
        out = out.replace(re, rewrite.regexTo ?? '');
      }
    } catch { out = pathname; }
    if (!out.startsWith('/')) out = \`/\${out}\`;
    out = out.replace(/\\/{2,}/g, '/');
    return out || '/';
  }

  function rewriteEditor(r) {
    r = r || { type: 'none', value: '', regexFrom: '', regexTo: '' };
    const TYPES = {
      none:   { label: '不重写（保持原路径）', desc: '客户端请求什么路径，就回源什么路径。绝大多数情况选这个即可。' },
      prefix: { label: '前缀替换（在路径前加一段）', desc: '把请求路径整体“搬”到一个新目录下，例如把 /img/x.png 变成 /api/img/x.png。' },
      strip:  { label: '去除前缀（去掉开头的某段）', desc: '剥掉路径开头的固定前缀，例如把 /img/x.png 变成 /x.png（常用于隐藏子目录）。' },
      regex:  { label: '正则重写（高级，按规则改写）', desc: '用正则表达式把路径的一部分替换为另一段，适合批量/复杂改写。不懂正则也没关系，下面给了几个最常⻏又好用的简单示例，点一下就能套用。' },
    };
    const typeSel = select('', [], r.type || 'none', Object.entries(TYPES).map(([v, t]) => ({ value: v, label: t.label })));
    typeSel.className = 'input';
    const desc = el('div', { class: 'rw-desc muted' });
    const valueInput = el('input', { class: 'input rw-val', value: r.value || '', placeholder: '例如 /api 或 /img' });
    const fromInput = el('input', { class: 'input rw-from', value: r.regexFrom || '', placeholder: '例如 ^/old/(.*)' });
    const toInput = el('input', { class: 'input rw-to', value: r.regexTo || '', placeholder: '例如 /new/$1' });
    const fieldsBox = el('div', { class: 'rw-fields' });
    // 示例请求路径：仅用于本地预览，不写入规则配置（避免被误当成真实字段填写）
    const sampleInput = el('input', { class: 'input', value: '/img/photo.png', placeholder: '示例路径，仅用于预览，不会保存' });
    // 预览结果：只读展示，用户不可修改（不是编辑框）
    const previewBox = el('code', { class: 'rw-preview' });

    function renderFields() {
      const t = typeSel.value;
      desc.textContent = TYPES[t].desc;
      fieldsBox.innerHTML = '';
      if (t === 'prefix' || t === 'strip') {
        fieldsBox.appendChild(field(t === 'prefix' ? '要添加 / 去除的路径前缀' : '要去除的开头前缀', valueInput));
        fieldsBox.appendChild(el('div', { class: 'rw-example muted', text: t === 'prefix'
          ? '示例：填 /api，则 /img/x.png → /api/img/x.png'
          : '示例：填 /img，则 /img/x.png → /x.png' }));
      } else if (t === 'regex') {
        fieldsBox.appendChild(field('匹配规则（源正则）', fromInput));
        fieldsBox.appendChild(field('替换为（目标，可用 $1 $2 引用分组）', toInput));
        // 小白友好的常用简单示例：点一下即可套用（源正则 + 目标）
        const EXAMPLES = [
          { from: '^(.*)
</html>
, to: '$1', note: '整体原样透传（保留完整路径，仅做占位/后续拼接用）' },
          { from: '^/old/(.*)', to: '/new/$1', note: '目录迁移：/old/a.png → /new/a.png' },
          { from: '^(.*)\\\\.html
</html>
, to: '$1', note: '去掉 .html 后缀：/page.html → /page' },
        ];
        const exampleBox = el('div', { class: 'rw-examples' }, [
          el('div', { class: 'muted', text: '常用简单示例（点击套用）：' }),
          ...EXAMPLES.map((ex) => {
            const btn = el('button', { class: 'rw-example-btn', type: 'button', text: \`\${ex.from}  →  \${ex.to}\` });
            btn.addEventListener('click', () => {
              fromInput.value = ex.from;
              toInput.value = ex.to;
              renderPreview();
            });
            return el('div', { class: 'rw-example-item' }, [
              btn,
              el('span', { class: 'muted', text: ex.note }),
            ]);
          }),
        ]);
        fieldsBox.appendChild(exampleBox);
      }
    }
    function renderPreview() {
      const sample = sampleInput.value || '/';
      const result = previewRewrite(sample, { type: typeSel.value, value: valueInput.value, regexFrom: fromInput.value, regexTo: toInput.value });
      previewBox.textContent = \`\${sample}  →  \${result}\`;
    }
    typeSel.addEventListener('change', () => { renderFields(); renderPreview(); });
    valueInput.addEventListener('input', renderPreview);
    fromInput.addEventListener('input', renderPreview);
    toInput.addEventListener('input', renderPreview);
    sampleInput.addEventListener('input', renderPreview);

    renderFields();
    renderPreview();

    const root = el('div', { class: 'rw-editor' }, [
      field('类型', typeSel),
      desc,
      fieldsBox,
      el('div', { class: 'rw-preview-row' }, [
        field('示例请求路径（仅预览用，不保存）', sampleInput),
        el('div', { class: 'rw-preview-wrap' }, [
          el('span', { class: 'ro-tag', text: '只读预览' }),
          el('span', { class: 'muted', text: '实际回源路径：' }),
          previewBox,
        ]),
      ]),
    ]);
    const read = () => ({
      type: typeSel.value,
      value: valueInput.value,
      regexFrom: fromInput.value,
      regexTo: toInput.value,
    });
    return { root, read };
  }

  // 旧版快捷条件字段：后端 matcher 仍支持，但编辑器/流量序列只认 conditions。
  const LEGACY_MATCH_KEYS = ['extIn', 'pathPrefix', 'pathRegex', 'methodIn'];

  // 把旧版快捷条件并入 conditions（用于编辑器展示）。已存在的 conditions 不动，
  // 旧字段转换为等价的 conditions 条目追加进第 0 个 AND 组。
  function normalizeMatchForEditor(match) {
    match = match || {};
    const groups = Array.isArray(match.conditions) ? match.conditions.map((g) => (Array.isArray(g) ? g.slice() : [])) : [];
    const first = groups.length ? groups[0] : [];
    const push = (c) => first.push(c);
    if (Array.isArray(match.extIn) && match.extIn.length) {
      push({ target: 'extension', op: 'equal', ignoreCase: true, values: match.extIn.map((e) => String(e).toLowerCase().replace(/^\\./, '')) });
    }
    if (match.pathPrefix) {
      push({ target: 'path', op: 'prefix', ignoreCase: true, values: [match.pathPrefix] });
    }
    if (match.pathRegex) {
      push({ target: 'path', op: 'regex', values: [match.pathRegex] });
    }
    if (Array.isArray(match.methodIn) && match.methodIn.length) {
      push({ target: 'method', op: 'equal', values: match.methodIn.map((m) => String(m).toUpperCase()) });
    }
    if (first.length) {
      if (!groups.length) groups.push(first);
      else groups[0] = first;
    }
    return { ...match, conditions: groups };
  }

  // 提取并回写旧版快捷字段，与 conditions 并存，保证后端匹配语义不丢。
  function legacyMatchFields(match) {
    match = match || {};
    const out = {};
    for (const k of LEGACY_MATCH_KEYS) {
      if (match[k] !== undefined && match[k] !== '' && !(Array.isArray(match[k]) && !match[k].length)) out[k] = match[k];
    }
    return out;
  }

  // 构建单条规则卡片（可视化规则引擎）
  function buildRuleCard(rule, poolOptions, site, opts) {
    opts = opts || {};
    // allowedOps：受限模式下，只允许添加/编辑这些操作（一个最小任务包一个抽屉，禁止越界）。
    // 为 null 表示「完整规则编辑器」（④.1 / ④.2 通用抽屉），不做限制。
    const allowed = opts.allowedOps ? new Set(opts.allowedOps) : null;
    const hideTargetPool = !!opts.hideTargetPool;
    rule = rule || { id: '', priority: 0, enabled: true, match: { conditions: [] }, action: { poolId: '', rewrite: { type: 'none' }, cache: { enabled: true }, reqHeaders: { set: {}, remove: [] }, respHeaders: { set: {}, remove: [] } } };
    const en = el('input', { type: 'checkbox', checked: rule.enabled !== false });
    // 规则名与备注：纯展示用，不影响匹配。模板生成的规则预填了它们，
    // 手动加的规则也建议写上，否则几个月后没人记得这条规则是干嘛的。
    const rName = el('input', { class: 'input', value: rule.name || '', placeholder: '如：静态资源长缓存（选填）' });
    const rNote = el('input', { class: 'input', value: rule.note || '', placeholder: '这条规则为什么这么配（选填）' });
    const priority = el('input', { class: 'input', type: 'number', value: rule.priority || 0, placeholder: '数字，越小越靠上（先匹配）' });
    // 目标源站：下拉选择已有源站（单一源站或源站池），也可直接输入其 id；
    // 单一源站与源站池在同一个下拉里，引用方式完全一致（都是 poolId）。
    // （该字段仅属于 ④.7 候选源站，非 ④.7 的受限抽屉会隐藏它以避免越界。）
    const poolListId = 'poollist-' + (rule.id || 'new') + '-' + Math.random().toString(36).slice(2, 7);
    const poolSel = el('input', { class: 'input', list: poolListId, value: rule.action.poolId || '', placeholder: '留空=用站点默认源站；或选择本规则专用的源站' });
    const poolDatalist = el('datalist', { id: poolListId }, poolOptions.map((o) => el('option', { value: o.value, label: o.label })));
    // 旧版快捷条件（extIn / pathPrefix / pathRegex / methodIn）后端仍支持，
    // 但编辑器与流量序列只认 conditions。打开规则时把旧格式并入 conditions 用于展示，
    // 保存时原样回写这些旧字段（与 conditions 并存，后端两种都认），不丢匹配语义。
    const matchForEditor = normalizeMatchForEditor(rule.match || {});
    rule = { ...rule, match: matchForEditor };
    // 可视化条件编辑器
    const conds = conditionsEditor(rule.match.conditions);

    // —— 操作区：只渲染用户实际「添加」的操作卡片，未添加的操作根本不渲染 ——
    const ACTION_GROUPS = [
      { group: '缓存配置', items: [{ value: 'cache', label: '节点缓存 TTL / 缓存模式' }] },
      { group: 'HTTPS 优化', items: [
        { value: 'forceHttps', label: '强制 HTTPS 访问' },
        { value: 'redirect', label: '访问 URL 重定向' },
        { value: 'directResponse', label: '自定义响应（直接应答）' },
      ] },
      { group: '修改 HTTP 头', items: [
        { value: 'reqHeaders', label: '回源请求头' },
        { value: 'respHeaders', label: '节点响应头' },
        { value: 'hostHeader', label: '回源 Host' },
        { value: 'clientIp', label: '客户端 IP 透传' },
      ] },
      { group: '网络优化', items: [
        { value: 'rewrite', label: '路径重写（回源 URL 改写）' },
        { value: 'followRedirect', label: '回源跟随 3xx' },
        { value: 'originTimeout', label: '回源超时' },
        { value: 'originConn', label: '回源连接参数（引擎/协议/端口）' },
      ] },
    ];
    // 受限模式：只展示白名单内的操作分组，下拉里不会出现越界动作
    const shownGroups = allowed
      ? ACTION_GROUPS.map((g) => ({ group: g.group, items: g.items.filter((it) => allowed.has(it.value)) })).filter((g) => g.items.length)
      : ACTION_GROUPS;

    // 单个操作卡片：标题可折叠，右上角带「移除」按钮。
    function opNode(key, title, desc, bodyNodes, read) {
      const tw = el('span', { class: 'tw', text: '▸' });
      const body = el('div', { class: 'section-body' }, bodyNodes);
      const head = el('div', { class: 'section-toggle' }, [
        tw,
        el('strong', {}, title),
        desc ? el('span', { class: 'muted', text: ' ' + desc }) : null,
      ]);
      const wrap = el('div', { class: 'subcard op-node', id: 'op-' + key }, [head, body]);
      head.onclick = () => wrap.classList.toggle('collapsed');
      return { node: wrap, read };
    }

    // 每个操作的自包含构建器：返回 { node, read }，node 由 mountOp 负责加「移除」按钮。
    const OP_BUILDERS = {
      cache(a) {
        const ed = cacheEditor(a.cache);
        return opNode('cache', '缓存配置', 'EO：节点缓存 TTL、缓存模式、自定义 Cache Key', [ed.root], () => ed.read());
      },
      forceHttps(a) {
        const en = el('input', { type: 'checkbox', checked: !!a.forceHttps });
        const st = select('', [
          { value: '301', label: '301 永久重定向' },
          { value: '302', label: '302 临时重定向（默认）' },
        ], String(a.forceHttpsStatus || 301));
        st.className = 'input';
        // 未启用强制 HTTPS 时，跳转方式无意义，完全隐藏
        const stField = field('跳转方式', st);
        const syncEn = () => { stField.style.display = en.checked ? '' : 'none'; };
        en.addEventListener('change', syncEn);
        syncEn();
        const read = () => ({ forceHttps: en.checked, forceHttpsStatus: Number(st.value) || 301 });
        return opNode('forceHttps', '强制 HTTPS 访问', '开启后将 HTTP 请求跳转至 HTTPS', [
          el('div', { class: 'grid2' }, [
            el('label', { class: 'check' }, [en, el('span', { text: '启用强制 HTTPS' })]),
            stField,
          ]),
        ], read);
      },
      redirect(a) {
        const rd = a.redirect || {};
        const en = el('input', { type: 'checkbox', checked: !!rd.enabled });
        const status = select('', [
          { value: '301', label: '301 永久重定向' },
          { value: '302', label: '302 临时重定向' },
          { value: '307', label: '307 临时（保持方法）' },
          { value: '308', label: '308 永久（保持方法）' },
        ], String(rd.status || 302));
        status.className = 'input';
        const target = el('input', { class: 'input', value: rd.target || '', placeholder: '/new-path 或 https://b.com/$1' });
        const keep = el('input', { type: 'checkbox', checked: rd.keepQuery !== false });
        const read = () => ({ redirect: { enabled: en.checked, status: Number(status.value) || 302, target: target.value.trim(), keepQuery: keep.checked } });
        // 未启用重定向时，状态码 / 保留查询串 / 目标 URL 全部无意义，完全隐藏
        const grid = el('div', { class: 'grid2' }, [
          field('状态码', status),
          el('label', { class: 'check' }, [keep, el('span', { text: '保留原查询串' })]),
        ]);
        const targetField = field('目标 URL（支持 $1..$9 引用路径正则捕获组）', target);
        const syncEn = () => {
          grid.style.display = en.checked ? '' : 'none';
          targetField.style.display = en.checked ? '' : 'none';
        };
        en.addEventListener('change', syncEn);
        syncEn();
        return opNode('redirect', '访问 URL 重定向', '命中后直接 3xx 跳转，不回源', [
          el('label', { class: 'check' }, [en, el('span', { text: '启用重定向' })]),
          grid,
          targetField,
        ], read);
      },
      directResponse(a) {
        const dr = a.directResponse || {};
        const en = el('input', { type: 'checkbox', checked: !!dr.enabled });
        const status = el('input', { class: 'input', type: 'number', value: dr.status || 200 });
        const ct = el('input', { class: 'input', value: dr.contentType || 'text/html; charset=utf-8' });
        const body = el('textarea', { class: 'input', rows: 4, placeholder: '响应内容' });
        body.value = dr.body || '';
        const read = () => ({ directResponse: { enabled: en.checked, status: Number(status.value) || 200, contentType: ct.value.trim(), body: body.value } });
        // 未启用时，状态码 / Content-Type / 响应内容全部无意义，完全隐藏
        const grid = el('div', { class: 'grid2' }, [ field('状态码', status), field('Content-Type', ct) ]);
        const bodyField = field('响应内容', body);
        const syncEn = () => {
          grid.style.display = en.checked ? '' : 'none';
          bodyField.style.display = en.checked ? '' : 'none';
        };
        en.addEventListener('change', syncEn);
        syncEn();
        return opNode('directResponse', '自定义响应', '命中后直接返回内容，不回源', [
          el('label', { class: 'check' }, [en, el('span', { text: '启用自定义响应' })]),
          grid,
          bodyField,
        ], read);
      },
      reqHeaders(a) {
        const ed = headerEditor(a.reqHeaders);
        return opNode('reqHeaders', '回源请求头', '转发到源站前修改', [ed.root], () => ed.read());
      },
      respHeaders(a) {
        const ed = headerEditor(a.respHeaders);
        return opNode('respHeaders', '节点响应头', '返回给客户端前修改', [ed.root], () => ed.read());
      },
      hostHeader(a) {
        const hh = a.hostHeader || { mode: 'inherit', custom: '' };
        const sel = select('', [
          { value: 'inherit', label: '继承（用站点默认回源 Host）' },
          { value: 'origin', label: '源站域名' },
          { value: 'client', label: '客户端 Host' },
          { value: 'custom', label: '自定义' },
        ], hh.mode || 'inherit');
        sel.className = 'input';
        const custom = el('input', { class: 'input', value: hh.custom || '', placeholder: 'origin.example.com' });
        const customField = field('自定义值', custom);
        // 仅「自定义」模式需要填值，其余模式该框无效，完全隐藏避免误导
        const syncMode = () => { customField.style.display = sel.value === 'custom' ? '' : 'none'; };
        sel.addEventListener('change', syncMode);
        syncMode();
        const read = () => ({ hostHeader: { mode: sel.value, custom: sel.value === 'custom' ? custom.value.trim() : '' } });
        return opNode('hostHeader', '回源 Host', '重写回源 Host 头', [ field('模式', sel), customField ], read);
      },
      clientIp(a) {
        const cip = a.clientIpHeader || {};
        const en = el('input', { type: 'checkbox', checked: !!cip.enabled });
        const name = el('input', { class: 'input', value: cip.name || 'X-EdgeGateway-Client-IP', placeholder: 'X-EdgeGateway-Client-IP' });
        const read = () => ({ clientIpHeader: { enabled: en.checked, name: name.value.trim() || 'X-EdgeGateway-Client-IP' } });
        // 未开启透传时，头部名无意义，完全隐藏
        const nameField = field('存放客户端 IP 的头部名', name);
        const syncEn = () => { nameField.style.display = en.checked ? '' : 'none'; };
        en.addEventListener('change', syncEn);
        syncEn();
        return opNode('clientIp', '客户端 IP 透传', '将真实客户端 IP 写入指定回源头（默认 X-EdgeGateway-Client-IP），供源站识别访客', [
          el('label', { class: 'check' }, [en, el('span', { text: '向源站透传客户端 IP' })]),
          nameField,
        ], read);
      },
      rewrite(a) {
        const ed = rewriteEditor(a.rewrite);
        return opNode('rewrite', '路径重写', '改写回源 URL 路径', [ed.root], () => ed.read());
      },
      followRedirect(a) {
        const en = el('input', { type: 'checkbox', checked: !!a.followRedirect });
        const read = () => ({ followRedirect: en.checked });
        return opNode('followRedirect', '回源跟随 3xx 重定向', '', [
          el('div', { class: 'grid2' }, [
            el('label', { class: 'check' }, [en, el('span', { text: '回源跟随 3xx 重定向' })]),
          ]),
        ], read);
      },
      originTimeout(a) {
        const inp = el('input', { class: 'input', type: 'number', value: a.originTimeoutMs || 0, placeholder: '毫秒，0=沿用源站设置' });
        const read = () => ({ originTimeoutMs: Number(inp.value) || 0 });
        return opNode('originTimeout', '回源超时', '', [ field('回源超时（毫秒，0=沿用源站）', inp) ], read);
      },
      originConn(a) {
        // 回源连接参数（⑨ Origin Rules）：规则级覆盖源站物理属性。
        // 留空/0 = 沿用源站对应值，向后兼容旧版「源站级规则」语义。
        const engine = select('', [
          { value: '', label: '沿用源站引擎' },
          { value: 'fetch', label: 'fetch（HTTP 回源）' },
          { value: 'socket', label: 'socket（TCP 透传，仅 CF）' },
          { value: 'r2', label: 'r2（R2 直读，仅 CF）' },
        ], a.engine || '');
        engine.className = 'input';
        const scheme = select('', [
          { value: '', label: '沿用源站协议' },
          { value: 'https', label: 'https' },
          { value: 'http', label: 'http' },
        ], a.scheme || '');
        scheme.className = 'input';
        const port = el('input', { class: 'input', type: 'number', value: a.port || 0, placeholder: '0=沿用源站端口' });
        const read = () => ({
          engine: engine.value || '',
          scheme: scheme.value || '',
          port: Number(port.value) || 0,
        });
        return opNode('originConn', '回源连接参数', '覆盖本次回源的引擎 / 协议 / 端口（留空=沿用源站物理属性）', [
          el('div', { class: 'grid2' }, [
            field('回源引擎', engine),
            field('回源协议', scheme),
          ]),
          field('回源端口（0=沿用源站）', port),
        ], read);
      },
    };

    // 根据已有 rule.action 推断哪些操作是「已启用」的
    function activeOpKeys(a) {
      const s = new Set();
      if (a.cache) s.add('cache');
      if (a.forceHttps) s.add('forceHttps');
      if (a.redirect && a.redirect.enabled) s.add('redirect');
      if (a.directResponse && a.directResponse.enabled) s.add('directResponse');
      if (a.reqHeaders) s.add('reqHeaders');
      if (a.respHeaders) s.add('respHeaders');
      if (a.hostHeader && a.hostHeader.mode && a.hostHeader.mode !== 'inherit') s.add('hostHeader');
      if (a.clientIpHeader && a.clientIpHeader.enabled) s.add('clientIp');
      if (a.rewrite && a.rewrite.type && a.rewrite.type !== 'none') s.add('rewrite');
      if (a.followRedirect) s.add('followRedirect');
      if (Number(a.originTimeoutMs) > 0) s.add('originTimeout');
      if (a.engine || a.scheme || Number(a.port) > 0) s.add('originConn');
      return s;
    }

    const opsList = el('div', { class: 'ops-list' });
    const opReaders = [];
    const mounted = new Set();

    // 挂载一个操作卡片（已挂载则展开定位，不重复添加）
    function mountOp(key) {
      if (!OP_BUILDERS[key]) return;
      // 受限模式：不允许挂载白名单之外的操作，杜绝越界
      if (allowed && !allowed.has(key)) return;
      if (mounted.has(key)) {
        const n = document.getElementById('op-' + key);
        if (n) n.classList.remove('collapsed');
        return;
      }
      const built = OP_BUILDERS[key](rule.action);
      mounted.add(key);
      opReaders.push(built.read);
      const removeBtn = el('button', { class: 'btn btn-sm btn-danger op-remove', text: '移除' });
      removeBtn.onclick = (e) => {
        e.stopPropagation();
        built.node.remove();
        const i = opReaders.indexOf(built.read);
        if (i >= 0) opReaders.splice(i, 1);
        mounted.delete(key);
      };
      built.node.querySelector('.section-toggle').appendChild(removeBtn);
      opsList.appendChild(built.node);
      built.node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    const actionAddSel = selectWithGroups(shownGroups, '');
    actionAddSel.className = 'input';
    actionAddSel.addEventListener('change', () => {
      const v = actionAddSel.value;
      if (!v) return;
      mountOp(v);
      actionAddSel.value = '';
    });

    // 初始只挂载该规则实际启用的操作卡片（受限模式下只挂白名单内的）
    activeOpKeys(rule.action).forEach((k) => { if (!allowed || allowed.has(k)) mountOp(k); });

    const card = el('div', { class: 'rule-card', id: 'rule-' + (rule.id || 'new') }, [
      el('div', { class: 'rule-head' }, [
        el('label', { class: 'check' }, [en, el('span', { text: '启用' })]),
        field('优先级', priority),
        el('button', { class: 'btn btn-sm btn-danger', text: '删除规则', onclick: () => card.remove() }),
      ]),
      field('规则名称', rName, '给这条规则起个一眼能看懂的名字，会显示在流量序列里。'),
      field('备注', rNote, '记下这么配的原因，方便日后自己或同事回看。'),
      section('匹配条件（决定哪些请求命中此规则）', '每个条件组内的多条条件为「与」关系，多个条件组之间为「或」关系', [
        conds.root,
      ]),
      // 目标源站 + 按需添加的「操作卡片」：未添加的操作不渲染
      section('操作（命中后执行的操作）', allowed
        ? '本抽屉仅允许配置「' + opts.title + '」所属的最小任务包，不可越界添加其它动作类型。'
        : '先选「目标源站」，再点「添加操作」加入需要的动作；每个动作是独立卡片，未添加的不显示', [
        // 目标源站属于 ④.7 候选源站，非 ④.7 的受限抽屉隐藏，避免越界
        ...(hideTargetPool ? [] : [field('目标源站（这条规则命中后回到哪台后端）', el('div', {}, [poolSel, poolDatalist]),
          '决定「命中条件的请求」回源到哪个源站：留空则回退到站点默认源站；也可从「源站」页已有的单一源站 / 源站池里选一个。简单站一般不用改，留空即可。')]),
        ...(shownGroups.length ? [el('div', { class: 'op-add' }, [
          el('span', { class: 'op-add-label', text: '添加操作：' }),
          actionAddSel,
        ])] : [el('div', { class: 'hint' }, '本任务包没有可添加的子操作（仅「目标源站」一项）。')]),
        opsList,
      ]),
    ]);

    const read = () => {
      // 受限模式：以原始 action 为基底，只覆盖本包允许编辑的字段，其余字段原样保留（不丢数据、不越界）
      const action = allowed ? JSON.parse(JSON.stringify(rule.action || {})) : {};
      if (!allowed || !hideTargetPool) action.poolId = poolSel.value;
      for (const r of opReaders) Object.assign(action, r());
      return {
        id: rule.id || ('r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
        // name/note 跟随规则一起回写。不带上就会在每次保存时被抹掉，
        // 模板生成的说明文字也会随之丢失。
        name: rName.value.trim(),
        note: rNote.value.trim(),
        enabled: en.checked,
        priority: Number(priority.value) || 0,
        match: {
          // 保留原始 match 里的旧版快捷字段（extIn / pathPrefix / pathRegex / methodIn），
          // 与 conditions 并存——后端两种都认，避免任何边界下匹配语义丢失。
          ...legacyMatchFields(rule.match || {}),
          conditions: conds.read(),
        },
        action,
      };
    };
    return { card, read };
  }

  // 全站通用规则（兜底）编辑器：规则对所有站点生效，仅当站点自身规则未命中时触发
  async function openGlobalRulesDrawer() {
    let rules = [];
    try {
      const data = await API.rules.global();
      rules = (data && data.rules) || [];
    } catch (e) {
      toast('读取全站通用规则失败：' + (e && e.message ? e.message : '未知错误'), 'err');
      return;
    }
    const poolOptions = buildPoolOptions();

    const rulesBox = el('div', { class: 'rules-box' });
    const ruleReaders = [];
    rules.forEach((r) => {
      const { card, read } = buildRuleCard(r, poolOptions);
      ruleReaders.push(read);
      rulesBox.appendChild(card);
    });

    const addRuleBtn = el('button', { class: 'btn btn-sm', text: '+ 添加规则' });
    addRuleBtn.onclick = () => {
      const { card, read } = buildRuleCard(null, poolOptions);
      ruleReaders.push(read);
      rulesBox.appendChild(card);
    };

    const body = el('div', { class: 'drawer-body' }, [
      el('p', { class: 'hint' }, '全站通用规则对任何站点都生效，仅当某站点的自身规则未命中时才触发，相当于全局默认设置（EO 的全局规则概念）。按优先级从上到下匹配，每条规则可独立配置匹配条件与动作。'),
      el('div', { class: 'subhead' }, [el('span', {}, '全站通用规则'), addRuleBtn]),
      rulesBox,
    ]);

    const onSave = async () => {
      const out = [];
      for (const read of ruleReaders) {
        const r = read();
        if (r) out.push(r);
      }
      await API.rules.saveGlobal(out);
    };

    openDrawer('全站通用规则（兜底）', '以下规则对所有站点生效，仅当站点自身规则未命中时触发（全局默认设置）', body, onSave);
  }

  // ⑫ 缓存键阶段的专属抽屉：只编辑「站点缓存代次 cacheGen」，不与 ① 站点基础抽屉重复联动。
  // ⑪ Cache Rules 的缓存策略由「路由规则」抽屉管理；这里的 cacheGen 才是 ⑫ 阶段唯一可干预项。
  async function openCacheGenDrawer(host, cacheRuleCount, hasCache) {
    if (!host) { toast('请先创建站点', 'err'); return; }
    let site;
    try { site = await API.sites.get(host); } catch (e) { toast(e.message, 'err'); return; }
    const fGen = el('input', { class: 'input', id: 'f-cachegen', type: 'number', min: '0', value: site.cacheGen || 0 });
    const body = el('div', {}, [
      el('div', { class: 'subhead' }, [el('span', {}, '⑫ 缓存键 · 缓存代次')]),
      el('div', { class: 'hint' },
        '本抽屉只管理「缓存代次（cacheGen）」这一项，用于一键批量让旧缓存失效（代次 +1 后旧 key 自然失配）。'
        + '其它缓存设置（edgeTtl / SWR / browserTtl / 绕过缓存）属于 ⑪「Cache Rules」阶段，请在对应阶段的规则抽屉里配置，避免与 ① 站点基础重复。'),
      field('缓存代次 cacheGen', fGen, '整数，默认 0。修改并保存后即视为「代次 +1」语义（旧缓存 key 失配，下次回源重新填充）。'),
      el('div', { class: 'hint' },
        \`当前站点 ⑪ 缓存动作 \${cacheRuleCount} 条\${hasCache ? '（已启用节点缓存）' : '（未启用节点缓存）'}；代次变更仅影响 cacheKey 维度，不影响缓存策略本身。\`),
    ]);
    openDrawer('⑫ 缓存键: ' + host, '仅调整缓存代次，使旧缓存批量失效。', body, async () => {
      const gen = Math.max(0, Number(fGen.value) || 0);
      const patch = { cacheGen: gen };
      try {
        await API.sites.saveBasics(host, patch);
        toast('已保存缓存代次', 'ok');
        await refreshData();
      } catch (e) { toast(e.message, 'err'); }
    });
  }

  async function openSiteDrawer(host, anchor) {
    let site;
    if (host) {
      try { site = await API.sites.get(host); } catch (e) { toast(e.message, 'err'); return; }
    } else {
      site = { host: '', enabled: true, poolId: '', rules: [], security: {}, cacheGen: 0 };
    }
    const editing = !!(site && site.host);

    // ① 匹配站点：仅承载「按 Host 命中站点」这一包，不含任何源站/规则/安全配置
    const fHost = el('input', { class: 'input', id: 'f-host', value: site.host || '', placeholder: 'example.com 或 *.example.com' });
    const fEnabled = el('input', { type: 'checkbox', id: 'f-enabled', checked: site.enabled !== false });
    const fIpv6 = el('input', { type: 'checkbox', id: 'f-ipv6', checked: !!(site.ipv6Support) });

    const body = el('div', {}, [
      el('div', { class: 'subhead', id: 'sec-basic' }, [el('span', {}, '① 匹配站点')]),
      el('div', { class: 'hint' }, '按 Host 命中站点配置，决定后续整条管线走哪套设置。源站 / 规则 / 安全分别在 ③ / ④ / ② 的独立抽屉配置，互不越界。'),
      field('加速域名（Host）', fHost, editing ? '编辑时不能修改，如需更改请在「站点总览」删除重建。' : '你接入加速的域名，例如 example.com。'),
      field('启用', fEnabled),
      field('支持 IPv6 访问', fIpv6),
    ]);

    // ── ② 默认源站（仅新建时出现）────────────────────────────────────
    // 新建站点时必须绑定一个源站；可选「填写域名/IP」（自动创建单一源站）或「选择已有源站」
    let fOriginMode, fPoolSel, fAddr, fPort, fScheme, fEngine, fHostMode, fHostCustom;
    if (!editing) {
      const poolOptions = buildPoolOptions();
      fOriginMode = select('f-origin-mode', [
        { value: 'inline', label: '填写域名/IP' },
        { value: 'pool', label: '选择已有源站' },
      ], 'inline');
      fOriginMode.className = 'input';

      // 「选择已有源站」模式
      fPoolSel = select('f-dup-pool', [{ value: '', label: poolOptions.length ? '（请选择）' : '（暂无可用源站）' }, ...poolOptions], '');
      fPoolSel.className = 'input';
      const fPoolRow = field('已有源站', fPoolSel, '从「源站」标签页已创建的单一源站或源站池中选择。');

      // 「填写域名/IP」模式：最简必填项
      fAddr = el('input', { class: 'input', id: 'f-addr', value: '', placeholder: 'storage.example.com 或 1.2.3.4' });
      fPort = el('input', { class: 'input', id: 'f-port', type: 'number', value: '443' });
      fScheme = select('f-scheme', [], 'https', [{ value: 'https', label: 'https' }, { value: 'http', label: 'http' }]);
      fScheme.className = 'input';
      fEngine = select('f-engine', [], 'fetch', [
        { value: 'fetch', label: 'fetch（标准回源）' },
        { value: 'socket', label: 'socket（裸 TCP，仅 Workers）', disabled: !(APP_DATA.info && APP_DATA.info.caps && APP_DATA.info.caps.hasSocket) },
        { value: 'r2', label: 'r2（回源到 R2 桶，仅 CF）', disabled: !(APP_DATA.info && APP_DATA.info.caps && APP_DATA.info.caps.hasR2) },
      ]);
      fEngine.className = 'input';
      fHostMode = select('f-host-mode', [], 'origin', [
        { value: 'accel', label: '加速域名（当前站点 Host）' },
        { value: 'origin', label: '回源域名（源站地址本身）' },
        { value: 'custom', label: '自定义域名' },
      ]);
      fHostMode.className = 'input';
      fHostCustom = el('input', { class: 'input', id: 'f-host-custom', value: '', placeholder: '如 backend.internal' });

      const addrField = field('源站地址（域名 / IP）', fAddr, '你的真实服务器地址。r2 引擎不需要此字段。');
      const portField = field('端口', fPort, 'https 默认 443，http 默认 80。');
      const schemeField = field('回源协议', fScheme, '选择 https 则回源时走加密通道。');
      const engineField = field('引擎', fEngine, 'fetch=标准回源（所有平台可用）；socket=裸 TCP（仅 Workers，可自定义 Host）；r2=回源 R2 桶（仅 CF）。');
      const hostModeField = field('回源 Host', fHostMode, '源站响应请求时看到的 Host 头。选「自定义域名」时需填下方输入框。');
      const hostCustomField = field('回源 Host 自定义值', fHostCustom, '仅用于回源请求的 Host 头，与站点配置的「加速域名」无关。');

      const inlineFields = el('div', { id: 'origin-inline-fields' }, [
        addrField, portField, schemeField, engineField, hostModeField, hostCustomField,
      ]);

      const syncEngine = () => {
        const eng = fEngine.value;
        const isR2 = eng === 'r2';
        addrField.style.display = isR2 ? 'none' : '';
        portField.style.display = isR2 ? 'none' : '';
        schemeField.style.display = isR2 ? 'none' : '';
      };
      const syncHostCustom = () => { hostCustomField.style.display = fHostMode.value === 'custom' ? '' : 'none'; };
      const syncOriginMode = () => {
        const mode = fOriginMode.value;
        fPoolRow.style.display = mode === 'pool' ? '' : 'none';
        inlineFields.style.display = mode === 'inline' ? '' : 'none';
        if (mode === 'inline') syncEngine();
      };

      fOriginMode.onchange = syncOriginMode;
      fHostMode.onchange = syncHostCustom;
      fEngine.onchange = syncEngine;
      syncOriginMode();
      syncHostCustom();

      body.appendChild(el('div', { class: 'subhead' }, [el('span', {}, '② 默认源站')]));
      body.appendChild(el('div', { class: 'hint' },
        '选「域名/IP」填地址保存时会自动创建单一源站并绑定；选「源站池」则引用已建好的。'));
      body.appendChild(field('源站方式', fOriginMode));
      body.appendChild(fPoolRow);
      body.appendChild(inlineFields);
    }

    // ── 场景模板（仅新建时出现）────────────────────────────────────
    // 选定场景后自动铺好该场景下「一定通用」的那几条规则，省去从零配起。
    // 生成的规则落库后与手写规则完全等价，之后随便改，系统不会再覆盖。
    const tplState = { id: 'blank', params: {}, meta: {}, list: [] };
    if (!editing) {
      const tplSel = select('f-template', [], 'blank', [{ value: 'blank', label: '加载中…' }]);
      const tplDesc = el('div', { class: 'field-hint muted' }, '');
      const tplParamBox = el('div', { class: 'tpl-params' });
      const tplPreview = el('div', { class: 'field-hint muted' }, '');

      // 把模板参数渲染成可编辑输入框：默认值只是起点，重点是让用户看见并按需改。
      const renderParams = () => {
        tplParamBox.innerHTML = '';
        const tpl = tplState.list.find((t) => t.id === tplSel.value);
        tplState.id = tplSel.value;
        tplState.params = {};
        tplDesc.textContent = tpl ? tpl.desc : '';
        const keys = (tpl && tpl.tuning) || [];
        if (!keys.length) {
          tplPreview.textContent = tplSel.value === 'blank'
            ? '不会生成任何规则，建站后请自行到「流量序列 → ④ 匹配规则」添加。'
            : '';
          return;
        }
        tplParamBox.appendChild(el('div', { class: 'hint' },
          '以下为该场景的建议值，仅是起点而非最优解。请按你的实际业务修改——尤其是缓存时间，设错会导致用户看到旧内容。'));
        for (const k of keys) {
          const m = tplState.meta[k] || {};
          const inp = el('input', {
            class: 'input', type: 'number',
            value: String(tpl.params[k] != null ? tpl.params[k] : 0),
          });
          if (m.min != null) inp.min = String(m.min);
          if (m.max != null) inp.max = String(m.max);
          tplState.params[k] = inp;
          tplParamBox.appendChild(field(
            (m.label || k) + '（秒）', inp,
            (m.hint || '') + humanSecs(Number(inp.value))
          ));
          inp.oninput = () => {
            const hintEl = inp.parentNode.querySelector('.field-hint');
            if (hintEl) hintEl.textContent = (m.hint || '') + humanSecs(Number(inp.value));
          };
        }
        tplPreview.textContent = '建站后将自动生成 ' + (tpl.ruleCount != null ? tpl.ruleCount : '若干') + ' 条规则，可随时在「流量序列 → ④ 匹配规则」增删改。';
      };
      tplSel.onchange = renderParams;

      body.appendChild(el('div', { class: 'subhead' }, [el('span', {}, '站点场景模板')]));
      body.appendChild(el('div', { class: 'hint' },
        '按站点类型一次铺好该场景下通用的基础规则，避免从零配起。只预置「这类站点几乎都要」的少量参数，其余留给你自己配。'));
      body.appendChild(field('加速类型', tplSel, ''));
      body.appendChild(tplDesc);
      body.appendChild(tplParamBox);
      body.appendChild(tplPreview);

      // 异步拉取模板清单，失败则静默降级为「空白」，不阻塞建站
      API.sites.templates().then((d) => {
        tplState.list = (d && d.templates) || [];
        tplState.meta = (d && d.paramMeta) || {};
        tplSel.innerHTML = '';
        for (const t of tplState.list) {
          const o = el('option', { value: t.id }, t.name);
          if (t.id === 'website') o.selected = true; // 最常见场景作默认
          tplSel.appendChild(o);
        }
        renderParams();
      }).catch(() => {
        tplSel.innerHTML = '';
        tplSel.appendChild(el('option', { value: 'blank' }, '空白（模板加载失败）'));
      });
    }

    openDrawer(host ? '编辑站点: ' + host : '新建站点', '', body, async () => {
      const h = fHost.value.trim();
      if (!h) throw new Error('请填写 Host');
      const basics = { host: h, enabled: fEnabled.checked, ipv6Support: fIpv6.checked };
      // 新建站点时整合源站信息：选「已有源站」则传 poolId；选「域名/IP」则传 origins + defaultHostHeader
      if (!editing && fOriginMode) {
        if (fOriginMode.value === 'pool') {
          if (!fPoolSel.value) throw new Error('请选择一个已有源站');
          basics.poolId = fPoolSel.value;
        } else {
          // 「填写域名/IP」：构建 origin 对象，后端 ensureSingleOrigin 自动查重/创建并回填 poolId
          const eng = fEngine.value;
          if (eng !== 'r2' && !fAddr.value.trim()) throw new Error('请填写源站地址');
          const o = {
            addr: eng === 'r2' ? '' : fAddr.value.trim(),
            port: eng === 'r2' ? null : (Number(fPort.value) || 443),
            scheme: eng === 'r2' ? 'https' : fScheme.value,
            engine: eng,
          };
          if (eng === 'r2') o.r2Binding = '';
          basics.origins = [o];
          basics.defaultHostHeader = {
            mode: fHostMode.value,
            custom: fHostMode.value === 'custom' ? fHostCustom.value.trim() : '',
          };
        }
      }
      if (editing) {
        await API.sites.saveBasics(site.host, basics);
        toast('站点基础片段已保存');
      } else {
        // 模板只在新建这一刻起作用，后端还会再次确认「站点确实不存在」才套用
        if (tplState.id && tplState.id !== 'blank') {
          basics.template = tplState.id;
          const p = {};
          for (const [k, inp] of Object.entries(tplState.params)) {
            const n = Number(inp.value);
            if (Number.isFinite(n)) p[k] = n;
          }
          basics.templateParams = p;
        }
        await API.sites.save(h, basics);
        toast(basics.template ? '站点已创建，并已按模板生成基础规则' : '站点已创建');
      }
      await refreshData();
    });
    scrollToAnchor(anchor);
  }

  // ③ 初始回源对象（首要分流）：独立抽屉，只承载「选择回源目标」这一包。
  // 与 ① 匹配站点彻底分离（一个最小任务包一个抽屉），②/④/⑧ 各有独立抽屉。
  async function openInitialOriginDrawer(host, anchor) {
    let site;
    try { site = await API.sites.get(host); } catch (e) { toast(e.message, 'err'); return; }
    // 源站下拉：单一源站与源站池同列，用前缀标明类型（nginx upstream 式统一引用）
    const poolOptions = buildPoolOptions();

    // 站点级源站：① 选已有源站（single 或 pool）；② 直接填地址 → 自动联动创建单一源站
    const originMode = site.poolId ? 'pool' : (poolOptions.length ? 'pool' : 'inline');

    // 模式一：选择已有源站
    const fPool = select('f-pool', [{ value: '', label: '（未选择）' }, ...poolOptions], site.poolId || '');
    fPool.className = 'input';
    const fPoolField = field('默认源站（没被规则覆盖的请求就用它）', fPool, '所有规则都没命中时，请求回到这里设置的源站。列表同时包含「单一源站」与「源站池」，两者用法一致。');

    // 模式二：直接填写地址 → 保存时自动创建一条「单一源站」并绑定
    const inlineBox = el('div', { class: 'inline-origin-box' });
    const inlineOriginList = el('div', { id: 'inline-origin-list' });
    // 单一源站只有 1 个地址，无调度可言：策略字段与权重字段一律不展示
    const inlineStrategy = { value: 'chain' };
    const inlineWeightFields = [];
    const syncInlineWeight = () => {
      inlineWeightFields.forEach((f) => { f.style.display = 'none'; });
    };
    // 由下方 syncHH 定义后回填：源站引擎变化时重算站点级「回源 Host」可选项
    let onEngineChange = null;
    const addInlineOrigin = (o) => {
      o = o || { addr: '', port: 443, scheme: 'https', engine: 'fetch', weight: 1 };
      const engineSel = select('', [], o.engine || 'fetch', [
        { value: 'fetch', label: 'fetch' },
        { value: 'socket', label: 'socket（仅 Workers）', disabled: !(APP_DATA.info && APP_DATA.info.caps && APP_DATA.info.caps.hasSocket) },
        { value: 'r2', label: 'r2（回源到 R2 桶，仅 CF）', disabled: !(APP_DATA.info && APP_DATA.info.caps && APP_DATA.info.caps.hasR2) },
      ]);
      engineSel.className = 'input o-engine';
      // 源站级专用 Host：默认不启用（沿用站点级默认的回源 Host），
      // 仅当「覆盖」勾选时才出现输入框，避免无意义的冗余填写。
      const hostCustom = o.hostHeader?.mode === 'custom' ? (o.hostHeader.custom || '') : '';
      const hostEn = el('input', { type: 'checkbox', class: 'o-host-en', checked: !!hostCustom });
      const hostInput = el('input', { class: 'input o-host', value: hostCustom, placeholder: '如 api1.internal（留空=用规则/站点级 Host）' });
      const hostField = field('回源 Host 自定义值', hostInput, '仅这台源站回源时使用的 Host 头，会覆盖站点级「回源 Host」。留空等同不覆盖。');
      const syncHost = () => { hostField.style.display = engineSel.value === 'socket' && hostEn.checked ? '' : 'none'; };
      hostEn.onchange = syncHost;
      // ---- R2 引擎专用字段 ----
      const r2BindingIn = el('input', { class: 'input o-r2-binding', value: o.r2Binding || '', placeholder: 'CDN_R2（必须与 wrangler.toml 的 binding 一致）' });
      const r2KeyPrefixIn = el('input', { class: 'input o-r2-prefix', value: o.r2KeyPrefix || '', placeholder: '如 img/（桶内目录隔离，留空=无）' });
      const r2KeyModeSel = select('', [''], o.r2KeyMode || 'none', [
        { value: 'none', label: 'none（pathname 原样作 key）' },
        { value: 'prefix', label: 'prefix（在 key 前加前缀）' },
        { value: 'strip', label: 'strip（剥除开头串）' },
        { value: 'regex', label: 'regex（正则替换）' },
      ], 'o-r2-keymode');
      const r2RuleIn = el('input', { class: 'input o-r2-rule', value: o.r2KeyPrefixRule || '', placeholder: 'prefix/strip: 前缀串；regex: 正则' });
      const r2ToIn = el('input', { class: 'input o-r2-to', value: o.r2KeyRegexTo || '', placeholder: 'regex 模式下的替换值' });
      const r2RuleField = field('转换参数（r2KeyPrefixRule）', r2RuleIn, 'prefix/strip 时填前缀/要剥除的开头；regex 时填正则在 r2KeyPrefixRule。');
      const r2ToField = field('正则替换值（r2KeyRegexTo）', r2ToIn, '仅 regex 模式使用。');
      const r2Fields = el('div', { class: 'o-r2-fields' }, [
        field('R2 绑定名（r2Binding）', r2BindingIn, 'wrangler.toml 里 [[r2_buckets]].binding 的值，如 CDN_R2。引擎选 r2 时必填。'),
        field('R2 key 前缀（r2KeyPrefix）', r2KeyPrefixIn, '拼到最终 key 前面的固定串，用于多站点共用一个桶时隔离目录。'),
        field('pathname → key 转换方式（r2KeyMode）', r2KeyModeSel, 'none 原样；prefix 在前加串；strip 剥开头串；regex 用正则替换。规则级 rewrite 已先作用，这里做最后一步。'),
        r2RuleField,
        r2ToField,
      ]);
      // key 转换方式决定后续参数：none 无需参数，regex 才需要替换值
      const syncR2Key = () => {
        const m = r2KeyModeSel.value;
        r2RuleField.style.display = (m === 'prefix' || m === 'strip' || m === 'regex') ? '' : 'none';
        r2ToField.style.display = m === 'regex' ? '' : 'none';
      };
      r2KeyModeSel.onchange = syncR2Key;
      syncR2Key();
      const syncEngine = () => {
        const eng = engineSel.value;
        const isR2 = eng === 'r2';
        r2Fields.style.display = isR2 ? '' : 'none';
        // R2 不需要公网地址/端口/协议/Host，隐藏避免误填
        addrField.style.display = isR2 ? 'none' : '';
        portField.style.display = isR2 ? 'none' : '';
        schemeField.style.display = isR2 ? 'none' : '';
        // 源站级自定义 Host 只有 socket 引擎能真正手写；fetch 下 Host 恒等于回源地址
        const canHost = eng === 'socket';
        hostEnLabel.style.display = canHost ? '' : 'none';
        hostField.style.display = canHost && hostEn.checked ? '' : 'none';
        // 引擎变化会影响站点级「回源 Host」可选项（fetch 不支持加速域名），通知其重算
        if (typeof onEngineChange === 'function') onEngineChange();
      };
      const addrField = field('源站地址（域名 / IP）', el('input', { class: 'input o-addr', value: o.addr || '', placeholder: 'storage.example.net' }), '你的真实服务器地址。');
      const portField = field('端口', el('input', { class: 'input o-port', type: 'number', value: o.port || 443 }), 'https 默认 443，http 默认 80。');
      const schemeField = field('协议', select('', [''], o.scheme || 'https', [{ value: 'https', label: 'https' }, { value: 'http', label: 'http' }], 'o-scheme'));
      const hostEnLabel = el('label', { class: 'check' }, [hostEn, el('span', { text: '覆盖站点级回源 Host（源站专用）' })]);
      const weightField = field('权重', el('input', { class: 'input o-weight', type: 'number', value: o.weight || 1 }), '配合「加权」策略使用，默认 1 即可。');
      inlineWeightFields.push(weightField);
      const row = el('div', { class: 'origin-row' }, [
        addrField,
        portField,
        schemeField,
        field('路径前缀', el('input', { class: 'input o-pathprefix', value: o.pathPrefix || '', placeholder: '如 /api/v1（留空=用请求原路径）' }), '追加在请求路径前面的固定前缀，每个源站可不同。例如三台同服务源站分别填 /node1、/node2、/node3，请求 /img/x.png 会分别回源到 /node1/img/x.png 等。留空则不加。'),
        hostEnLabel,
        hostField,
        field('引擎', engineSel, '回源方式：① fetch=标准回源，Host 头由「回源域名/地址」决定（源站只看到自己的域名，最通用，所有平台可用）；② socket=仅 CF Workers 支持，基于裸 TCP 手写 HTTP，可自定义 Host / 回源裸 IP / 非标端口（用于源站要靠 Host 做虚拟主机路由、或只暴露 IP 的场景）；③ r2=回源到 R2 桶（仅 CF，需先在 wrangler.toml 绑定）。'),
        r2Fields,
        weightField,
        // 单一源站恒为 1 行，无「移除」按钮：清空地址即视为未填写
      ]);
      engineSel.onchange = syncEngine;
      syncHost();
      syncEngine();
      // 本抽屉只负责「③ 初始回源对象」这一包：地址/端口/协议/前缀/Host/引擎/权重。
      // 源站级的 rewrite/cache/reqHeaders/respHeaders/超时/跟随3xx 属于 ④.5 / ④.8 / ⑧.1，
      // 由「路由规则」「源站」抽屉各自管理；这里原样保留，保存时回写，绝不越界改写。
      row._carry = {};
      ['rewrite', 'cache', 'reqHeaders', 'respHeaders', 'originTimeoutMs', 'followRedirect', 'extraHeaders']
        .forEach((k) => { if (o[k] !== undefined) row._carry[k] = o[k]; });
      inlineOriginList.appendChild(row);
    };
    // 单一源站恰好一行地址，不再回显站点内联数组（该概念已废弃）
    addInlineOrigin();

    const modeSel = select('f-origin-mode', [
      { value: 'pool', label: '选择已有源站（单一源站 / 源站池）' },
      { value: 'inline', label: '新建单一源站（填地址，自动创建）' },
    ], originMode);
    modeSel.className = 'input';
    const syncInlineStrategy = () => {};
    const syncOriginMode = () => {
      const m = modeSel.value;
      fPoolField.style.display = m === 'pool' ? '' : 'none';
      inlineBox.style.display = m === 'inline' ? '' : 'none';
      syncInlineStrategy();
      syncHH();
    };
    modeSel.onchange = syncOriginMode;

    const defaultHH = site.defaultHostHeader || { mode: 'accel', custom: '' };
    const hhSel = select('f-hh', [
      { value: 'accel', label: '加速域名（即你访问的这个域名，默认）' },
      { value: 'origin', label: '源站域名（用源站自己的域名）' },
      { value: 'custom', label: '自定义（指定一个域名）' },
    ], defaultHH.mode || 'accel');
    hhSel.className = 'input';
    const hhCustom = el('input', { class: 'input', id: 'f-hh-custom', value: defaultHH.custom || '', placeholder: 'origin.example.com' });
    const hhField = field('回源 Host（回源时发给源站的 Host 头）', hhSel, '一般保持「加速域名」即可；仅当源站要求特定域名时才改。选择「自定义」后下方出现填写框。');
    const hhCustomField = field('回源 Host 自定义值', hhCustom);
    // fetch 引擎无法自定义 Host（平台强制 Host = 回源 URL 的 hostname），
    // 因此 accel / client 这类「Host 与回源地址不一致」的模式在 fetch 下不可实现。
    // 只有 socket 引擎能手写 Host 头。这里根据新建单一源站实际选用的引擎动态裁剪可选项。
    const hhNote = el('div', { class: 'hint' });
    const HH_ALL = [
      { value: 'accel', label: '加速域名（即你访问的这个域名，默认）', socketOnly: true },
      { value: 'origin', label: '源站域名（用源站自己的域名）', socketOnly: false },
      { value: 'custom', label: '自定义（指定一个域名）', socketOnly: false },
    ];
    // 收集正在填写的单一源站引擎；选择已有源站时由该源站自身定义，此处不判定。
    const inlineEngines = () => Array.from(inlineOriginList.querySelectorAll('.o-engine')).map((s) => s.value);
    const syncHH = () => {
      // 选择已有源站（pool）模式下：源站内每个 origin 已在各自配置里定义回源方式，
      // 站点级再做统一「回源 Host」会与源站级定义冲突，故整块完全隐藏。
      if (modeSel.value === 'pool') {
        hhField.style.display = 'none';
        hhNote.style.display = 'none';
        hhCustomField.style.display = 'none';
        return;
      }
      const engines = inlineEngines();
      // 全部源站都是 r2 → 回源 Host 完全无意义（不走 HTTP 回源），整块隐藏
      const allR2 = engines.length > 0 && engines.every((e) => e === 'r2');
      // 存在 socket 源站才允许 accel（Host ≠ 回源地址）
      const hasSocket = engines.some((e) => e === 'socket');

      hhField.style.display = allR2 ? 'none' : '';
      hhNote.style.display = allR2 ? 'none' : '';
      if (allR2) { hhCustomField.style.display = 'none'; return; }

      const allowed = HH_ALL.filter((o) => hasSocket || !o.socketOnly);
      const cur = hhSel.value;
      clear(hhSel);
      allowed.forEach((o) => {
        const node = el('option', { value: o.value }, o.label);
        if (o.value === cur) node.selected = true;
        hhSel.appendChild(node);
      });
      // 原选中项被裁掉（如 accel 在纯 fetch 下不可用）→ 回落到 origin
      if (!allowed.some((o) => o.value === cur)) hhSel.value = 'origin';

      hhNote.textContent = hasSocket
        ? ''
        : 'fetch / r2 引擎下平台强制 Host = 回源地址，无法伪装成加速域名，故「加速域名」选项不可用；需要该能力请将源站引擎改为 socket。';
      hhNote.style.display = hhNote.textContent ? '' : 'none';
      hhCustomField.style.display = hhSel.value === 'custom' ? '' : 'none';
    };
    hhSel.onchange = syncHH;
    onEngineChange = syncHH;

    // 片段边界：本抽屉 = ③ 初始回源对象（单一最小任务包）。
    const body = el('div', {}, [
      el('div', { class: 'subhead', id: 'sec-origin' }, [el('span', {}, '③ 初始回源对象（首要分流）')]),
      el('div', { class: 'hint' }, '选出「初始回源对象」，它既是规则引擎的 origin 匹配维度，也是所有规则都未命中时的兜底回源目标。'),
      field('源站方式', modeSel, '① 从「源站」页已有条目里选（单一源站和源站池都在同一个下拉里）；② 直接填地址，保存时自动创建一条「单一源站」并绑定，随后可在「源站」页统一管理。'),
      fPoolField,
      el('div', { class: 'hint', id: 'origin-mode-hint' }, '站点不再持有「内联源站」：任何直接填写的地址都会成为「源站」页里的一条单一源站，因此你能在一个地方看到全部上游及其被引用情况。需要多源站负载均衡时，请到「源站」页新建源站池，再回到这里选择它。'),
      inlineBox,
      hhField,
      hhNote,
      hhCustomField,

      el('div', { class: 'hint frag-note' }, '本抽屉只负责 ③ 这包。① 匹配站点、② 安全校验、④ 路由规则、⑧ 源站池细节均有各自独立抽屉，请在「流量序列」中点击对应阶段进入，此处不再重复承载。'),
    ]);

    // 新建单一源站编辑区（直接填地址 → 保存时联动创建）
    inlineBox.appendChild(el('div', { class: 'subhead' }, [
      el('span', {}, '新建单一源站'),
    ]));
    inlineBox.appendChild(el('div', { class: 'hint' }, '只填「这台源站是谁」——地址/端口/协议/路径前缀/引擎。保存后会在「源站」页自动出现一条同名的单一源站，并标记被本站点引用；若已存在完全相同的地址，则直接复用它而不会重复创建。需要多台源站做负载均衡，请改用「源站池」。'));
    inlineBox.appendChild(inlineOriginList);
    syncOriginMode();
    syncInlineStrategy();
    syncInlineWeight();
    syncHH();

    openDrawer('编辑回源对象: ' + host, '', body, async () => {
      const hhMode = hhSel.value;
      // 根据源站方式决定提交字段：选源站组时忽略内联源站，直接填写时清空 poolId
      const useInline = modeSel.value === 'inline';
      const inlineOrigins = [];
      Array.from(inlineOriginList.children).forEach((row, i) => {
        const engine = $('.o-engine', row).value;
        const addr = $('.o-addr', row).value.trim();
        // r2 引擎无公网地址，按 r2Binding 标识；其余引擎必须有 addr
        if (engine !== 'r2' && !addr) return;
        const r2KeyMode = $('.o-r2-keymode', row) ? $('.o-r2-keymode', row).value : 'none';
        inlineOrigins.push({
          id: 'o' + i + '_' + (engine === 'r2' ? ($('.o-r2-binding', row).value.trim() || 'r2') : addr),
          enabled: true,
          order: i,
          weight: Number($('.o-weight', row).value) || 1,
          engine,
          scheme: $('.o-scheme', row) ? $('.o-scheme', row).value : 'https',
          addr: engine === 'r2' ? '' : addr,
          port: Number($('.o-port', row).value) || 443,
          pathPrefix: ($('.o-pathprefix', row).value || '').trim(),
          hostHeader: (() => {
            const en = $('.o-host-en', row);
            const custom = ($('.o-host', row).value || '').trim();
            // 仅在勾选「覆盖」且填写了值时，才作为源站专用 Host；否则沿用站点级
            return en && en.checked && custom ? { mode: 'custom', custom } : { mode: 'inherit', custom: '' };
          })(),
          extraHeaders: {},
          ...(engine === 'r2'
            ? {
                r2Binding: $('.o-r2-binding', row).value.trim(),
                r2KeyPrefix: $('.o-r2-prefix', row).value.trim(),
                r2KeyMode,
                r2KeyPrefixRule: $('.o-r2-rule', row).value.trim(),
                r2KeyRegexTo: $('.o-r2-to', row).value.trim(),
              }
            : {}),
          ...(row._carry || {}),
        });
      });

      // 仅提交 ③ 相关字段，后端浅合并 basics；不影响 ①（基础）/②（安全）等其它包
      const basics = {};
      if (useInline) {
        if (!inlineOrigins.length) throw new Error('请填写源站地址');
        if (inlineOrigins.length > 1) throw new Error('单一源站只能有 1 个地址；需要多个请到「源站」页新建源站池');
        // 不传 poolId：后端 ensureSingleOrigin 会据此把地址落成 kind=single 源站并回填
        basics.origins = inlineOrigins;
        // 站点级「回源 Host」只在单一源站下有意义：源站池里每台源站各自定义，
        // 站点级统一值会与源站级定义冲突，故 pool 模式不提交。
        basics.defaultHostHeader = { mode: hhMode, custom: hhMode === 'custom' ? hhCustom.value.trim() : '' };
      } else {
        if (!fPool.value) throw new Error('请选择一个源站，或改用「新建单一源站」填写地址');
        basics.poolId = fPool.value;
      }
      const res = await API.sites.saveBasics(site.host, basics);
      if (res && res.createdOrigin) {
        toast(\`已自动创建单一源站「\${res.createdOrigin.name || res.createdOrigin.id}」并绑定到本站点\`, 'ok');
      } else {
        toast('初始回源对象片段已保存');
      }
      await refreshData();
    });
    scrollToAnchor(anchor);
  }

  // 安全防护：独立抽屉，只读写站点的 security 字段，不碰基础设置/规则/源站
  // 内部按 ②.1~②.5 五个最小任务包分节，anchor 可直达其中一节
  async function openSecurityDrawer(host, anchor) {
    if (!host) { toast('请先创建站点', 'err'); return; }
    let site;
    try { site = await API.sites.get(host); } catch (e) { toast(e.message, 'err'); return; }
    const sec = site.security || {};

    const refererMode = select('', [
      { value: 'off', label: '关闭' },
      { value: 'whitelist', label: '白名单（允许名单内 Referer 访问）' },
      { value: 'blacklist', label: '黑名单（拦截名单内 Referer）' },
    ], sec.refererMode || 'off');
    refererMode.className = 'input';
    const refererList = el('input', { class: 'input', value: (sec.refererList || []).join(', '), placeholder: '如 example.com, *.test.com' });
    const refererAllowEmpty = el('input', { type: 'checkbox', checked: !!sec.allowEmptyReferer });
    const uaList = el('input', { class: 'input', value: (sec.uaBlacklist || []).join(', '), placeholder: '如 BadBot, scraper' });
    const botEn = el('input', { type: 'checkbox', checked: !!(sec.botManagement && sec.botManagement.enabled) });
    const botMode = select('', [
      { value: 'blacklist', label: '黑名单（命中特征即拦截）' },
      { value: 'allowlist', label: '白名单（仅放行命中特征，其余视为 Bot）' },
    ], (sec.botManagement && sec.botManagement.mode) || 'blacklist');
    botMode.className = 'input';
    const botList = el('input', { class: 'input', value: ((sec.botManagement && sec.botManagement.list) || []).join(', '), placeholder: '如 scrapy, python-requests, HeadlessChrome' });
    const ipBlack = el('input', { class: 'input', value: (sec.ipBlacklist || []).join(', '), placeholder: '如 1.2.3.4, 10.0.0.0/8' });
    const ipWhite = el('input', { class: 'input', value: (sec.ipWhitelist || []).join(', '), placeholder: '如 192.168.1.0/24' });
    const signEn = el('input', { type: 'checkbox', checked: !!(sec.signedUrl && sec.signedUrl.enabled) });
    const signKey = el('input', { class: 'input', value: (sec.signedUrl && sec.signedUrl.secret) || '', placeholder: '签名密钥，建议 16 位以上随机串' });
    const signExpire = el('input', { class: 'input', type: 'number', value: (sec.signedUrl && sec.signedUrl.ttl) || 300 });
    const signParam = el('input', { class: 'input', value: (sec.signedUrl && sec.signedUrl.param) || 'sign', placeholder: 'URL 查询参数名' });
    const rateEn = el('input', { type: 'checkbox', checked: !!(sec.rateLimit && sec.rateLimit.enabled) });
    const rateRpm = el('input', { class: 'input', type: 'number', value: (sec.rateLimit && sec.rateLimit.rpm) || 600 });

    const commaSplit = (v) => v.split(',').map((s) => s.trim()).filter(Boolean);
    const readSecurity = () => ({
      refererMode: refererMode.value,
      refererList: commaSplit(refererList.value),
      allowEmptyReferer: refererAllowEmpty.checked,
      uaBlacklist: commaSplit(uaList.value),
      botManagement: {
        enabled: botEn.checked,
        mode: botMode.value,
        list: commaSplit(botList.value),
      },
      ipBlacklist: commaSplit(ipBlack.value),
      ipWhitelist: commaSplit(ipWhite.value),
      signedUrl: {
        enabled: signEn.checked,
        secret: signKey.value.trim(),
        ttl: Number(signExpire.value) || 300,
        param: signParam.value.trim() || 'sign',
      },
      rateLimit: {
        enabled: rateEn.checked,
        rpm: Number(rateRpm.value) || 600,
      },
    });

    // 按流程图 ②.1~②.5 分节，每节一个最小任务包，一节一个锚点
    const pack = (id, title, desc, children) => {
      const s = section(title, desc, children);
      s.id = id;
      return s;
    };
    // ---- 依赖联动：未启用/关闭的开关，其下属字段完全隐藏（不是折叠） ----
    const refererListField = field('Referer 名单（逗号分隔，可含 *.example.com 通配）', refererList);
    const refererEmptyLabel = el('label', { class: 'check' }, [refererAllowEmpty, el('span', { text: '允许 Referer 为空（直接访问）' })]);
    const syncReferer = () => {
      const on = refererMode.value !== 'off';
      refererListField.style.display = on ? '' : 'none';
      refererEmptyLabel.style.display = on ? '' : 'none';
    };
    refererMode.addEventListener('change', syncReferer);
    syncReferer();

    const botModeField = field('匹配模式', botMode);
    const botListField = field('Bot 特征关键字 / UA（逗号分隔，支持 /regex/ 正则）', botList);
    const botHint1 = el('div', { class: 'hint' }, '小白示例：直接填关键字如 scrapy、python-requests 即可拦截常见爬虫；想更灵活可写正则，如 /^HeadlessChrome/ 只拦无头浏览器，/bot/i 大小写不敏感地拦含 bot 的 UA。');
    const botHint2 = el('div', { class: 'hint' }, '黑名单：UA 命中任一特征即拦截；白名单：仅放行命中特征（如合法搜索引擎），其余视为 Bot 拦截。该字段独立于 ②.2 的 UA 黑名单，互不越界。');
    const syncBot = () => {
      const on = botEn.checked;
      [botModeField, botListField, botHint1, botHint2].forEach((n) => { n.style.display = on ? '' : 'none'; });
    };
    botEn.addEventListener('change', syncBot);
    syncBot();

    const signGrid = el('div', { class: 'grid2' }, [
      field('签名密钥', signKey),
      field('URL 参数名', signParam),
    ]);
    const signExpireField = field('签名有效期（秒）', signExpire);
    const syncSign = () => {
      const on = signEn.checked;
      signGrid.style.display = on ? '' : 'none';
      signExpireField.style.display = on ? '' : 'none';
    };
    signEn.addEventListener('change', syncSign);
    syncSign();

    const rateRpmField = field('每分钟最大请求数', rateRpm);
    const syncRate = () => { rateRpmField.style.display = rateEn.checked ? '' : 'none'; };
    rateEn.addEventListener('change', syncRate);
    syncRate();

    const body = el('div', {}, [
      el('div', { class: 'hint frag-note' }, 'fail-closed：任一包判定异常也按 403 拦截，绝不放行。以下 5 包全部通过才继续 ③ 首要分流。'),
      pack('sec-ip', '②.1 IP 访问规则', 'IP 黑名单优先于白名单拦截', [
        el('div', { class: 'grid2' }, [
          field('IP 黑名单（逗号分隔，支持 CIDR）', ipBlack),
          field('IP 白名单（逗号分隔，支持 CIDR）', ipWhite),
        ]),
      ]),
      pack('sec-waf', '②.2 WAF · 自定义规则（Referer / UA）', '防盗链校验请求 Referer；UA 关键字命中直接 403', [
        field('防盗链模式', refererMode),
        refererListField,
        refererEmptyLabel,
        field('User-Agent 黑名单关键字（逗号分隔）', uaList),
      ]),
      pack('sec-bot', '②.3 自动程序（Bot 管理）', '独立最小任务包：与 ②.2 的 UA 黑名单解耦。支持黑名单拦截 / 白名单仅放行两种模式', [
        el('label', { class: 'check' }, [botEn, el('span', { text: '启用 Bot 管理' })]),
        botModeField,
        botListField,
        botHint1,
        botHint2,
      ]),
      pack('sec-token', '②.4 Access · 令牌鉴权（签名 URL）⚠️实验特性', '仅允许携带合法签名的请求访问（常用于私有资源）。⚠️ 实验特性：校验侧已生效，但内置签名链接签发工具尚未提供，需自行用 HMAC 生成。', [
        el('label', { class: 'check' }, [signEn, el('span', { text: '启用签名 URL 校验' })]),
        signGrid,
        signExpireField,
        el('div', { class: 'hint warn' }, ['⚠️ 实验特性：内置「生成签名链接」工具待开发，开启后需自行用 HMAC-SHA256 签发带签名的 URL。']),
      ]),
      pack('sec-ratelimit', '②.5 速率限制', '单客户端（按 IP）每分钟最大请求数，超出返回 429', [
        el('label', { class: 'check' }, [rateEn, el('span', { text: '启用请求限速' })]),
        rateRpmField,
      ]),
    ]);

    openDrawer('安全防护: ' + host, '仅管理 ② 安全校验的 5 个最小任务包。不影响站点基础（①/③）、路由规则（④）与源站池（⑧）。', body, async () => {
      // 后端 saveSecurity 已是片段 API：仅合并 security 字段，互不越界
      await API.sites.saveSecurity(host, readSecurity());
      await refreshData();
    });
    scrollToAnchor(anchor);
  }

  // 路由规则：独立抽屉，只读写站点的 rules 字段，不碰基础/源站/安全（绝不越界）
  async function openRulesDrawer(host, opts) {
    if (!host) { toast('请先创建站点', 'err'); return; }
    let site;
    try { site = await API.sites.get(host); } catch (e) { toast(e.message, 'err'); return; }
    const poolOptions = buildPoolOptions();
    const confined = !!(opts && opts.allowedOps);

    const rulesBox = el('div', { class: 'rules-box' });
    const ruleReaders = [];
    const makeCard = (r) => {
      const { card, read } = buildRuleCard(r, poolOptions, site, opts || {});
      ruleReaders.push(read);
      rulesBox.appendChild(card);
    };
    const addRuleBtn = el('button', { class: 'btn btn-sm', text: '+ 添加规则' });
    addRuleBtn.onclick = () => makeCard(null);

    // 受限抽屉只展示属于本任务包的规则，避免把其它包的规则混进来导致误改
    const allRules = (site.rules && site.rules.length ? site.rules : []);
    const shownRules = confined && opts.match ? allRules.filter((r) => opts.match(r.action || {})) : allRules;
    shownRules.forEach(makeCard);

    const title = confined ? opts.title : '路由规则（规则引擎）: ' + host;
    const headText = confined ? opts.title : '路由规则（规则引擎）';
    const owner = confined ? opts.owner : '路由规则抽屉 · 规则卡片';
    // 始终把 rulesBox 放进 DOM：否则 shownRules 为空时「+ 添加规则」加进的是
    // 一个游离节点，界面毫无反应。空状态提示单独放一个节点，按列表是否为空切换。
    const emptyHint = el('p', { class: 'empty' }, '暂无属于本任务包的规则，点击「+ 添加规则」新建一条。');
    emptyHint.style.display = shownRules.length ? 'none' : '';
    const body = el('div', { id: 'sec-rules' }, [
      el('div', { class: 'hint' }, confined
        ? '本抽屉只管理「' + opts.title + '」这一最小任务包的规则，只能添加/编辑该包允许的动作类型，不会越界到其它包。保存时只合并 rules 字段。'
        : '按条件把请求路由到不同源站、改写路径、设置回源 Host、请求头、响应头、缓存等。修改不会影响站点基础设置、源站与安全防护。'),
      el('div', { class: 'subhead' }, [el('span', {}, headText), addRuleBtn]),
      emptyHint,
      rulesBox,
    ]);

    openDrawer(title, '仅管理本站点的路由规则。保存时只合并 rules 字段，互不越界。', body, async () => {
      const edited = ruleReaders.map((rd) => rd());
      if (confined && opts.match) {
        // 受限抽屉只动了属于本包的规则，其余规则原样保留，避免误删其它包的规则
        const editedIds = new Set(edited.map((r) => r.id));
        const kept = (site.rules || []).filter((r) => !editedIds.has(r.id) && !opts.match(r.action || {}));
        await API.sites.saveRules(host, kept.concat(edited));
      } else {
        await API.sites.saveRules(host, edited);
      }
      await refreshData();
    });
  }

  async function removeSite(host) {
    const ok = await confirmDialog('删除站点', '确定删除 ' + host + ' ？此操作不可恢复。');
    if (!ok) return;
    try {
      await API.sites.remove(host);
      toast('已删除', 'ok');
      await refreshData();
      await route(location.hash);
    } catch (e) { toast(e.message, 'err'); }
  }

  // ====== 源站（借鉴 nginx upstream：单一源站与源站池同为一等公民） ======

  /** 归一化 kind：兼容后端未回填 kind 的历史数据。 */
  function poolKind(p) {
    return p.kind || ((p.origins || []).length === 1 ? 'single' : 'pool');
  }

  /** 源站地址摘要，供列表「地址」列展示。 */
  function originSummary(p) {
    const list = p.origins || [];
    if (!list.length) return '—';
    const fmt = (o) => (o.engine === 'r2'
      ? \`r2:\${o.r2Binding || '?'}\`
      : \`\${o.scheme || 'https'}://\${o.addr || '?'}\${o.port && o.port !== 443 && o.port !== 80 ? ':' + o.port : ''}\`);
    return list.length === 1 ? fmt(list[0]) : \`\${fmt(list[0])} 等 \${list.length} 个\`;
  }

  /** 统一的源站下拉选项：单一源站在前、源站池在后，标签带类型前缀与地址摘要。 */
  function buildPoolOptions() {
    return [...APP_DATA.pools]
      .sort((a, b) => (poolKind(a) === poolKind(b) ? 0 : (poolKind(a) === 'single' ? -1 : 1)))
      .map((p) => ({
        value: p.id,
        label: \`\${poolKind(p) === 'single' ? '［单一］' : '［池］'} \${p.name || p.id} — \${originSummary(p)}\`,
      }));
  }

  /** 引用徽标：0 引用给出「可安全删除」提示，>0 时可点击查看是谁在用。 */
  function refsCell(p) {
    const refs = p.refs || [];
    if (!refs.length) {
      return el('span', { class: 'hint', text: '未被引用' });
    }
    const btn = el('button', {
      class: 'btn btn-sm',
      text: \`\${refs.length} 处引用\`,
      onclick: () => openRefsDrawer(p),
    });
    return btn;
  }

  async function renderPools() {
    const wrap = el('div', { class: 'section' });
    wrap.appendChild(el('div', { class: 'section-head' }, [
      el('h3', {}, '源站'),
      el('button', { class: 'btn btn-primary', text: '+ 新建源站池', onclick: () => openPoolDrawer(null, 'pool') }),
    ]));
    wrap.appendChild(el('div', { class: 'hint' },
      '这里纵览全部上游。「单一源站」= 一个地址，在新建/编辑站点时直接填写源站地址会自动创建并出现在这里；'
      + '「源站池」= 多个源站 + 负载均衡策略，只能用右上角按钮新建。两者引用方式一致，站点与规则都按同一个下拉选择。'));

    // 升级前遗留的「站点内联源站」尚未迁移：提示用户保存一次即可自动转成独立源站
    const legacy = APP_DATA.poolsLegacySites || [];
    if (legacy.length) {
      wrap.appendChild(el('div', { class: 'hint warn' },
        \`检测到 \${legacy.length} 个站点仍使用旧版「内联源站」（\${legacy.join('、')}），暂未出现在下表中。\`
        + '打开对应站点的「初始回源对象」抽屉保存一次，即可自动迁移为独立源站并纳入统一管理。'));
    }

    if (!APP_DATA.pools.length) {
      wrap.appendChild(el('p', { class: 'empty' }, '暂无源站。新建站点并填写源站地址会自动生成单一源站；需要多源站负载均衡请点「+ 新建源站池」。'));
      return wrap;
    }

    const order = { single: 0, pool: 1 };
    const sorted = [...APP_DATA.pools].sort((a, b) => {
      const d = order[poolKind(a)] - order[poolKind(b)];
      return d !== 0 ? d : String(a.name || a.id).localeCompare(String(b.name || b.id));
    });

    const rows = sorted.map((p) => {
      const kind = poolKind(p);
      const isSingle = kind === 'single';
      return [
        el('span', { class: 'badge ' + (isSingle ? 'badge-single' : 'badge-pool') },
          isSingle ? '单一源站' : '源站池'),
        p.name || p.id,
        originSummary(p),
        isSingle ? '—' : (p.strategy || 'chain'),
        String((p.origins || []).length),
        refsCell(p),
        actions([
          { label: '编辑', onClick: () => openPoolDrawer(p.id) },
          {
            label: '删除',
            cls: 'btn-danger',
            onClick: () => removePool(p.id, p),
          },
        ]),
      ];
    });
    wrap.appendChild(table(['类型', '名称', '地址', '策略', '源站数', '引用', '操作'], rows));
    return wrap;
  }

  /** 引用明细抽屉：列出谁在引用这个源站，可直接跳到对应站点。 */
  function openRefsDrawer(p) {
    const refs = p.refs || [];
    const rows = refs.map((r) => [
      r.type === 'site' ? '站点' : (r.type === 'globalRule' ? '全局规则' : '站点规则'),
      r.label || '—',
      r.detail || '—',
      r.host
        ? actions([{ label: '前往站点', onClick: () => { closeDrawer(); location.hash = '#/sites'; openSiteDrawer(r.host); } }])
        : el('span', { class: 'hint', text: '—' }),
    ]);
    const body = el('div', {}, [
      el('div', { class: 'hint' },
        \`「\${p.name || p.id}」当前被 \${refs.length} 处引用。存在引用时无法删除；请先把这些引用改指到别的源站。\`),
      rows.length
        ? table(['来源', '对象', '说明', '操作'], rows)
        : el('p', { class: 'empty' }, '暂无引用。'),
    ]);
    openDrawer('引用详情: ' + (p.name || p.id), '', body, null);
  }

  async function openPoolDrawer(id, forceKind) {
    let pool;
    if (id) {
      try { pool = await API.pools.get(id); } catch (e) { toast(e.message, 'err'); return; }
    } else {
      pool = { id: '', name: '', kind: forceKind || 'pool', strategy: 'chain', origins: [], failover: { enabled: true, maxRetries: 2, timeoutMs: 10000, retryOn: [500, 502, 503, 504, 522, 524] } };
    }
    // 类型一经创建不可随意切换：single→pool 允许（加源站即升级），pool→single 会丢数据故禁止
    const kind = forceKind || poolKind(pool);
    const isSingle = kind === 'single';
    const socketDisabled = !(APP_DATA.info && APP_DATA.info.caps && APP_DATA.info.caps.hasSocket);

    const originList = el('div', { id: 'origin-list' });
    // 调度策略下拉需在 addOrigin 之前创建：源站行里的「权重」字段要按策略显隐
    const strategySel = select('', [], pool.strategy || 'chain', [
      { value: 'chain', label: '链式回退（遇错换下一源站，最稳）' },
      { value: 'roundrobin', label: '轮询（轮流用每个源站）' },
      { value: 'random', label: '随机' },
      { value: 'weighted', label: '加权（按权重分配，权重越大越多）' },
      { value: 'iphash', label: 'IP 哈希（同 IP 总落到同一源站，利于会话）' },
    ]);
    strategySel.className = 'input';
    // 收集各源站的「权重」字段，调度策略变化时统一显隐（仅加权策略需要权重）
    const weightFields = [];
    const syncWeight = () => {
      const on = strategySel.value === 'weighted';
      weightFields.forEach((f) => { f.style.display = on ? '' : 'none'; });
    };
    strategySel.addEventListener('change', syncWeight);
    const addOrigin = (o) => {
      // 源站组只负责「地址 + 负载均衡」，回源 Host / 路径 / 请求头等一律在规则引擎里绑定
      o = o || { id: '', enabled: true, order: 0, weight: 1, engine: 'fetch', scheme: 'https', addr: '', port: 443 };
      const engineSel = select('', [], '', [
        { value: 'fetch', label: 'fetch' },
        { value: 'socket', label: 'socket（仅 Workers）', disabled: socketDisabled },
        { value: 'r2', label: 'r2（回源到 R2 桶，仅 CF）', disabled: !(APP_DATA.info && APP_DATA.info.caps && APP_DATA.info.caps.hasR2) },
      ]);
      engineSel.value = o.engine || 'fetch';
      engineSel.className = 'input o-engine';
      // ---- R2 引擎专用字段 ----
      const r2BindingIn = el('input', { class: 'input o-r2-binding', value: o.r2Binding || '', placeholder: 'CDN_R2（必须与 wrangler.toml 的 binding 一致）' });
      const r2KeyPrefixIn = el('input', { class: 'input o-r2-prefix', value: o.r2KeyPrefix || '', placeholder: '如 img/（桶内目录隔离，留空=无）' });
      const r2KeyModeSel = select('', [''], o.r2KeyMode || 'none', [
        { value: 'none', label: 'none（pathname 原样作 key）' },
        { value: 'prefix', label: 'prefix（在 key 前加前缀）' },
        { value: 'strip', label: 'strip（剥除开头串）' },
        { value: 'regex', label: 'regex（正则替换）' },
      ], 'o-r2-keymode');
      const r2RuleIn = el('input', { class: 'input o-r2-rule', value: o.r2KeyPrefixRule || '', placeholder: 'prefix/strip: 前缀串；regex: 正则' });
      const r2ToIn = el('input', { class: 'input o-r2-to', value: o.r2KeyRegexTo || '', placeholder: 'regex 模式下的替换值' });
      const r2RuleField = field('转换参数（r2KeyPrefixRule）', r2RuleIn, 'prefix/strip 时填前缀/要剥除的开头；regex 时填正则在 r2KeyPrefixRule。');
      const r2ToField = field('正则替换值（r2KeyRegexTo）', r2ToIn, '仅 regex 模式使用。');
      const r2Fields = el('div', { class: 'o-r2-fields' }, [
        field('R2 绑定名（r2Binding）', r2BindingIn, 'wrangler.toml 里 [[r2_buckets]].binding 的值，如 CDN_R2。引擎选 r2 时必填。'),
        field('R2 key 前缀（r2KeyPrefix）', r2KeyPrefixIn, '拼到最终 key 前面的固定串，用于多站点共用一个桶时隔离目录。'),
        field('pathname → key 转换方式（r2KeyMode）', r2KeyModeSel, 'none 原样；prefix 在前加串；strip 剥开头串；regex 用正则替换。规则级 rewrite 已先作用，这里做最后一步。'),
        r2RuleField,
        r2ToField,
      ]);
      // key 转换方式决定后续参数：none 无需参数，regex 才需要替换值
      const syncR2Key = () => {
        const m = r2KeyModeSel.value;
        r2RuleField.style.display = (m === 'prefix' || m === 'strip' || m === 'regex') ? '' : 'none';
        r2ToField.style.display = m === 'regex' ? '' : 'none';
      };
      r2KeyModeSel.onchange = syncR2Key;
      syncR2Key();
      const addrField = field('源站地址（域名 / IP）', el('input', { class: 'input o-addr', value: o.addr || '', placeholder: 'storage.example.net' }), '你的真实服务器地址。');
      const portField = field('端口', el('input', { class: 'input o-port', type: 'number', value: o.port || 443 }), 'https 默认 443，http 默认 80。');
      const schemeField = field('协议', select('', [''], o.scheme || 'https', [{ value: 'https', label: 'https' }, { value: 'http', label: 'http' }], 'o-scheme'));
      const hostField = field('回源 Host（该源站专用）', el('input', { class: 'input o-host', value: o.hostHeader?.custom || '', placeholder: '如 api1.internal（留空=用规则/站点级 Host）' }), '仅这台源站回源时使用的 Host 头。同组多源站各自 Host 不同时填这里；规则里再设 Host 会覆盖它。');
      // fetch 引擎无法手写 Host 头（平台强制 Host = 回源 URL hostname），
      // 该字段只有 socket 引擎能真正生效，故仅 socket 时显示。
      const hostNote = el('div', { class: 'hint', text: 'fetch 引擎下该 Host 由回源地址决定、无法自定义；如需自定义 Host 请把引擎改为 socket。' });
      // 权重仅在「加权」调度策略下生效，其余策略隐藏（syncWeight 在策略下拉建好后统一调用）
      const weightField = field('权重（加权策略生效）', el('input', { class: 'input o-weight', type: 'number', value: o.weight || 1 }), '默认 1 即可。');
      weightFields.push(weightField);
      const syncEngine = () => {
        const eng = engineSel.value;
        const isR2 = eng === 'r2';
        r2Fields.style.display = isR2 ? '' : 'none';
        addrField.style.display = isR2 ? 'none' : '';
        portField.style.display = isR2 ? 'none' : '';
        schemeField.style.display = isR2 ? 'none' : '';
        hostField.style.display = eng === 'socket' ? '' : 'none';
        hostNote.style.display = eng === 'fetch' ? '' : 'none';
      };
      engineSel.onchange = syncEngine;
      const row = el('div', { class: 'origin-row' }, [
        addrField,
        portField,
        schemeField,
        field('路径前缀', el('input', { class: 'input o-pathprefix', value: o.pathPrefix || '', placeholder: '如 /api/v1（留空=用请求原路径）' }), '追加在请求路径前面的固定前缀，每个源站可不同。例如三台同服务源站分别填 /node1、/node2、/node3，请求 /img/x.png 会分别回源到 /node1/img/x.png 等。留空则不加。'),
        hostField,
        hostNote,
        field('引擎', engineSel, '回源方式：① fetch=标准回源，Host 头由「回源域名/地址」决定（源站只看到自己的域名，最通用，所有平台可用）；② socket=仅 CF Workers 支持，基于裸 TCP 手写 HTTP，可自定义 Host / 回源裸 IP / 非标端口（用于源站要靠 Host 做虚拟主机路由、或只暴露 IP 的场景）；③ r2=回源到 R2 桶（仅 CF，需先在 wrangler.toml 绑定）。'),
        r2Fields,
        weightField,
        el('button', { class: 'btn btn-sm btn-danger', text: '移除源站', onclick: () => row.remove() }),
      ]);
      syncEngine(); // 回显时根据已有 engine 显隐 R2 字段
      originList.appendChild(row);
    };
    (pool.origins || []).forEach(addOrigin);
    if (!pool.origins || !pool.origins.length) addOrigin();
    syncWeight();

    const strategyField = field('调度策略', strategySel, '多个源站之间怎么分配请求。新手直接用「链式回退」最省心。');
    // 单一源站只有 1 个 origin，无调度可言；也不允许在这里加第 2 个源站。
    const addOriginBtn = el('button', { class: 'btn btn-sm', text: '+ 添加源站', onclick: () => { addOrigin(); syncWeight(); } });
    if (isSingle) {
      strategyField.style.display = 'none';
      addOriginBtn.style.display = 'none';
    }

    const refsInfo = (pool.refs && pool.refs.length)
      ? el('div', { class: 'hint' }, \`当前被 \${pool.refs.length} 处引用：\${pool.refs.map((r) => r.label).filter((v, i, a) => a.indexOf(v) === i).join('、')}。修改地址会立刻影响这些站点。\`)
      : el('div', { class: 'hint' }, '当前未被任何站点或规则引用。');

    const body = el('div', {}, [
      // 机器主键 id 由系统自动生成，用户绝不可填；此处仅展示（编辑时可见）
      field(
        '源站 ID（系统自动生成）',
        el('input', { class: 'input', id: 'p-id', value: pool.id || '', placeholder: '保存后自动生成（如 pl_xxx）', disabled: true })
      ),
      field('类型', el('input', {
        class: 'input',
        value: isSingle ? '单一源站（1 个地址）' : '源站池（多源站 + 负载均衡）',
        disabled: true,
      }), isSingle
        ? '单一源站通常由「新建站点时直接填写源站地址」自动创建。若要升级为源站池，请新建一个源站池并把站点改指过去。'
        : '源站池只能在「源站」页手动新建，可被多个站点/规则共享引用。'),
      field('名称（可选，用于区分）', el('input', { class: 'input', id: 'p-name', value: pool.name || '', placeholder: '如：主站源站 / 北京备份' }), '给自己看的备注，方便在站点和规则里选对源站。'),
      strategyField,
      refsInfo,
      el('div', { class: 'hint' }, '源站只负责「地址 + 负载均衡」。回源 Host、路径重写、请求头、响应头、缓存等均由「站点 → 规则引擎」按条件绑定，不在此处设置。源站按列表顺序决定链式回退（越靠前越优先）。「源站 ID」是给机器引用用的内部主键，由系统自动生成、不可改；如需给人区分，请填上面的「名称」。'),
      el('div', { id: 'origin-head', class: 'subhead' }, [
        el('span', {}, isSingle ? '源站地址' : '源站列表'),
        addOriginBtn,
      ]),
      originList,
    ]);
    const kindLabel = isSingle ? '单一源站' : '源站池';
    openDrawer(id ? \`编辑\${kindLabel}: \` + (pool.name || id) : \`新建\${kindLabel}\`, '', body, async () => {
      const pid = pool.id || ''; // 系统主键，编辑时才有；新建为空 → 后端自动生成
      const origins = [];
      Array.from(originList.children).forEach((row, i) => {
        const engine = $('.o-engine', row).value;
        const addr = $('.o-addr', row).value.trim();
        // r2 引擎无公网地址，按 r2Binding 标识；其余引擎必须有 addr
        if (engine !== 'r2' && !addr) return;
        // 保留既有源站的回源高级配置（hostHeader/extraHeaders/pathPrefix），
        // 这些由规则引擎托管，前端此处不编辑，但编辑源站池时不应清空
        const legacy = (pool.origins && pool.origins[i]) || {};
        const r2KeyMode = $('.o-r2-keymode', row) ? $('.o-r2-keymode', row).value : 'none';
        origins.push({
          id: 'o' + i + '_' + (engine === 'r2' ? ($('.o-r2-binding', row).value.trim() || 'r2') : addr),
          enabled: true, order: i, weight: Number($('.o-weight', row).value) || 1,
          engine,
          scheme: $('.o-scheme', row) ? $('.o-scheme', row).value : 'https',
          addr: engine === 'r2' ? '' : addr,
          port: Number($('.o-port', row).value) || 443,
          pathPrefix: ($('.o-pathprefix', row).value || '').trim() || legacy.pathPrefix || '',
          hostHeader: ($('.o-host', row).value || '').trim()
            ? { mode: 'custom', custom: ($('.o-host', row).value || '').trim() }
            : (legacy.hostHeader || { mode: 'inherit', custom: '' }),
          extraHeaders: legacy.extraHeaders || {},
          ...(engine === 'r2'
            ? {
                r2Binding: $('.o-r2-binding', row).value.trim(),
                r2KeyPrefix: $('.o-r2-prefix', row).value.trim(),
                r2KeyMode,
                r2KeyPrefixRule: $('.o-r2-rule', row).value.trim(),
                r2KeyRegexTo: $('.o-r2-to', row).value.trim(),
              }
            : {}),
          // 纯两层架构（站点级 + 源站级基础地址/引擎）：源站级不再承载专属回源规则
          // （路径重写/缓存/请求头/响应头/超时/跟随3xx 一律由「路由规则」按条件绑定，
          // 旧数据若残留这些字段将由后端 failover 原样保留、但不在此编辑）。
        });
      });
      if (!origins.length) throw new Error(isSingle ? '请填写源站地址' : '至少需要一个源站');
      if (isSingle && origins.length > 1) throw new Error('单一源站只能有 1 个地址；需要多个请新建「源站池」');
      const payload = {
        name: $('p-name').value.trim(),
        kind,
        strategy: isSingle ? 'chain' : strategySel.value,
        origins,
        failover: pool.failover || { enabled: true, maxRetries: 2, timeoutMs: 10000, retryOn: [500, 502, 503, 504, 522, 524] },
        ...(pool.createdBy ? { createdBy: pool.createdBy } : {}),
      };
      // 编辑（有 id）走 PUT；新建（无 id）走 POST，机器 id 由后端生成
      await API.pools.save(pid || null, payload);
      await refreshData();
    });
  }

  async function removePool(id, pool) {
    const p = pool || APP_DATA.pools.find((x) => x.id === id) || {};
    const kindName = poolKind(p) === 'single' ? '单一源站' : '源站池';
    const refs = p.refs || [];
    if (refs.length) {
      const who = [...new Set(refs.map((r) => r.label))].join('、');
      toast(\`该\${kindName}仍被 \${refs.length} 处引用（\${who}），请先改指其它源站再删除\`, 'err');
      return;
    }
    const ok = await confirmDialog(
      \`删除\${kindName}\`,
      \`确定删除「\${p.name || id}」？此操作不可恢复。\`
    );
    if (!ok) return;
    try {
      await API.pools.remove(id);
      toast('已删除', 'ok');
      await refreshData();
      await route(location.hash);
    } catch (e) { toast(e.message, 'err'); }
  }

  // ====== 缓存管理 ======
  async function renderCache() {
    const wrap = el('div', { class: 'section' });
    wrap.appendChild(el('h3', {}, '缓存管理'));
    if (!APP_DATA.sites.length) {
      wrap.appendChild(el('p', { class: 'empty' }, '暂无站点。'));
      return wrap;
    }
    const rows = APP_DATA.sites.map((s) => [
      s.host, String(s.cacheGen || 0),
      actions([
        { label: '代次失效', onClick: () => purgeSite(s.host) },
      ]),
    ]);
    wrap.appendChild(table(['Host', '当前代次', '操作'], rows));
    return wrap;
  }

  async function purgeSite(host) {
    const ok = await confirmDialog(
      '清除缓存',
      '站点 ' + host + '\\n操作：代次失效（递增缓存代次，新请求全部回源），是否继续？'
    );
    if (!ok) return;
    try {
      await API.cache.purge({ host });
      toast('已触发代次失效', 'ok');
      await refreshData();
      await route(location.hash);
    } catch (e) { toast(e.message, 'err'); }
  }

  // ====== 系统设置 ======
  async function renderSystem() {
    const wrap = el('div', { class: 'section' });
    wrap.appendChild(el('h3', {}, '系统设置'));

    let info = APP_DATA.info;
    if (!info) { try { info = await API.system.info(); APP_DATA.info = info; } catch (e) { toast(e.message, 'err'); } }

    const caps = (info && info.caps) || {};
    const rows = [
      ['运行平台', (info && info.platform) || PLATFORM],
      ['版本', (info && info.version) || '—'],
      ['边缘缓存', caps.hasEdgeCache ? '可用' : '不可用（降级）'],
      ['TCP Socket', caps.hasSocket ? '可用' : '不可用（socket 引擎降级 fetch）'],
      ['D1', caps.hasD1 ? '可用' : '不可用'],
      ['KV', caps.hasKV ? '可用' : '不可用（配置无法持久化！）'],
      ['统计驱动', (info && info.statsDriver) || 'none'],
    ];
    if (info && Array.isArray(info.limitations) && info.limitations.length) {
      wrap.appendChild(el('div', { class: 'banner warn' },
        info.limitations.map((l) => el('div', {}, '⚠ ' + l.message))));
    }
    wrap.appendChild(table(['项目', '状态'], rows));

    // 全局配置卡片（导航无独立 global 项，合并到系统页）
    //
    // 关键：这里必须持有各输入框的「节点引用」，不能靠 $('g-xxx') 按 id 全局查找。
    // renderSystem() 返回的 wrap 是在函数结束、由 route() 才 append 到 #content 的，
    // 函数体内 document 里根本不存在这些 id，$() 返回 null —— 回填时会抛
    // TypeError（表现为打开设置页永远是空值），保存时同样取不到值。
    const gAdminPath = el('input', { class: 'input', id: 'g-adminPath', placeholder: 'panel' });
    const gTokenTtl = el('input', { class: 'input', id: 'g-tokenTtl', type: 'number' });
    const gConfigCacheTtl = el('input', { class: 'input', id: 'g-configCacheTtl', type: 'number' });
    const gGlobalRateLimit = el('input', { class: 'input', id: 'g-globalRateLimit', type: 'number', placeholder: '0 表示不限制' });
    const gStatsEnabled = el('input', { type: 'checkbox', id: 'g-statsEnabled' });
    const gStatsDriver = select('g-statsDriver', [], '', [
      { value: 'kv', label: 'KV' },
      { value: 'd1', label: 'D1' + (caps.hasD1 ? '' : '（当前平台不可用）'), disabled: !caps.hasD1 },
      { value: 'none', label: '关闭' },
    ]);

    // 未启用统计时「统计驱动」无意义，完全隐藏
    const gStatsDriverField = field('统计驱动', gStatsDriver);
    const syncStats = () => { gStatsDriverField.style.display = gStatsEnabled.checked ? '' : 'none'; };
    gStatsEnabled.addEventListener('change', syncStats);
    syncStats();

    // 表单回填：统一入口，保存后与首次载入复用同一套逻辑
    const fillGlobalForm = (cfg) => {
      if (!cfg) return;
      gAdminPath.value = cfg.adminPath || '';
      gTokenTtl.value = cfg.tokenTtl != null ? cfg.tokenTtl : '';
      gConfigCacheTtl.value = cfg.configCacheTtl != null ? cfg.configCacheTtl : '';
      gStatsEnabled.checked = !!cfg.statsEnabled;
      gStatsDriver.value = cfg.statsDriver || 'none';
      gGlobalRateLimit.value = cfg.globalRateLimit != null ? cfg.globalRateLimit : '';
      syncStats();
    };

    const cfgCard = el('div', { class: 'card-block' }, [
      el('h4', {}, '全局配置'),
      el('div', { class: 'form-stack', id: 'global-form' }, [
        field('管理面路径', gAdminPath, '留空表示沿用当前已保存的值。'),
        field('Token 有效期（秒）', gTokenTtl, '留空表示沿用当前已保存的值。'),
        field('配置缓存 TTL（秒）', gConfigCacheTtl, '留空表示沿用当前已保存的值。'),
        field('全局限流（req/s）⚠️实验特性', gGlobalRateLimit, '⚠️ 实验特性（待开发）：全局请求频率上限，0 表示不限制；最少 10 req/s。当前为实验阶段，不建议生产依赖。'),
        field('启用统计', gStatsEnabled),
        gStatsDriverField,
      ]),
      el('div', { class: 'section-head' }, [
        el('button', {
          class: 'btn btn-primary', text: '保存全局配置',
          onclick: async () => {
            // 留空字段传空串，交由后端 validateGlobal(input, caps, current) 沿用旧值。
            // 注意不要用 Number(...)||0 —— 那会把「留空」变成显式 0，反而覆盖掉旧值。
            const payload = {
              adminPath: gAdminPath.value.trim(),
              tokenTtl: gTokenTtl.value.trim(),
              configCacheTtl: gConfigCacheTtl.value.trim(),
              globalRateLimit: gGlobalRateLimit.value.trim(),
              statsEnabled: gStatsEnabled.checked,
              statsDriver: gStatsDriver.value,
            };
            try {
              // 后端会静默钳制/回退非法值（如 adminPath 非法字符、tokenTtl 越界），
              // 因此以响应中的规范化结果回填表单，避免界面显示与实际存储不一致
              const saved = await API.config.save(payload);
              fillGlobalForm(saved);

              // 仅比较用户「确实填了」的字段，留空字段本就期望被后端替换成旧值，
              // 不应算作「被修正」而误报警告
              const adjusted = Object.keys(payload).filter((k) => {
                const v = payload[k];
                if (typeof v === 'string' && v === '') return false;
                return String(v) !== String(saved[k]);
              });
              if (adjusted.length) {
                toast('已保存，但部分值被后端修正：' + adjusted.join('、'), 'warn');
              } else {
                toast('已保存全局配置', 'ok');
              }
              await loadAll();
            } catch (e) { toast(e.message, 'err'); }
          },
        }),
      ]),
    ]);
    wrap.appendChild(cfgCard);

    // 载入现有全局配置填入表单（此时操作的是节点引用，无需已挂载到 document）
    try {
      fillGlobalForm(await API.config.get());
    } catch (e) { /* 配置尚未初始化时忽略 */ }

    wrap.appendChild(el('div', { class: 'section-head' }, [
      el('button', { class: 'btn', text: '导出配置', onclick: exportConfig }),
      el('button', { class: 'btn', text: '导入配置', onclick: importConfig }),
      el('button', { class: 'btn', text: '修改密码', onclick: openChangePassword }),
      el('button', { class: 'btn btn-danger', text: '退出登录', onclick: doLogout }),
    ]));
    return wrap;
  }

  // 导入配置：读本地 JSON 文件后调 /system/import 整体恢复（备份恢复手段）
  async function importConfig() {
    const ok = await confirmDialog(
      '导入配置',
      '导入将覆盖当前全部站点/源站池/全局规则/全局配置等，且不可恢复。确认继续？',
      { confirmText: 'IMPORT' }
    );
    if (!ok) return;
    const input = el('input', { type: 'file', accept: '.json,application/json' });
    input.onchange = async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      let cfg;
      try {
        cfg = JSON.parse(await file.text());
      } catch {
        toast('配置文件不是合法的 JSON', 'err');
        return;
      }
      try {
        const res = await API.system.import(cfg);
        const msg = res && res.message ? res.message : '配置已导入';
        const errs = res && Array.isArray(res.errors) && res.errors.length ? \`，\${res.errors.length} 项失败\` : '';
        toast(msg + errs, res && res.errors && res.errors.length ? 'warn' : 'ok');
        await loadAll();
      } catch (e) { toast(e.message, 'err'); }
    };
    input.click();
  }

  // 修改密码：自建轻量 modal 表单收集旧/新密码，校验后调 /auth/password。
  // 项目本身没有通用 modal()，这里直接构建覆盖层并复用样式，避免引入不存在的函数。
  function openChangePassword() {
    const oldI = el('input', { class: 'input', type: 'password', placeholder: '当前密码' });
    const newI = el('input', { class: 'input', type: 'password', placeholder: '新密码（至少 8 位）' });
    const confI = el('input', { class: 'input', type: 'password', placeholder: '确认新密码' });

    const mask = el('div', { class: 'modal-mask', style: 'display:flex;' }, [
      el('div', { class: 'modal' }, [
        el('h3', { class: 'modal-title', text: '修改密码' }),
        el('div', { class: 'modal-text', text: '修改成功后需重新登录。' }),
        el('div', { class: 'modal-extra' }, [
          field('当前密码', oldI),
          field('新密码', newI),
          field('确认新密码', confI),
        ]),
        el('div', { class: 'modal-foot', style: 'margin-top:16px;display:flex;gap:8px;justify-content:flex-end;' }, [
          el('button', { class: 'btn', text: '取消', onclick: () => mask.remove() }),
          el('button', {
            class: 'btn btn-primary',
            text: '确认修改',
            onclick: async () => {
              if ((newI.value || '').length < 8) { toast('新密码至少 8 位', 'err'); return; }
              if (newI.value !== confI.value) { toast('两次输入的新密码不一致', 'err'); return; }
              try {
                const res = await API.auth.changePassword(oldI.value, newI.value);
                mask.remove();
                toast(res && res.reloginRequired ? '密码已修改，请重新登录' : '密码已修改', 'ok');
                if (res && res.reloginRequired) setTimeout(doLogout, 800);
              } catch (e) { toast(e.message, 'err'); }
            },
          }),
        ]),
      ]),
    ]);
    document.body.appendChild(mask);
  }

  async function exportConfig() {
    try {
      const resp = await API.system.export();
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = el('a', { href: url, download: 'edgecdn-config.json' });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { toast(e.message, 'err'); }
  }

  // 表单助手 --------------------------------------------------------------
  // 表单字段：label + 控件 + 可选的人话说明 hint（小白友好）
  function field(label, control, hint) {
    return el('div', { class: 'form-field' }, [
      el('label', { class: 'label' }, label),
      control,
      hint ? el('div', { class: 'field-hint muted' }, hint) : null,
    ]);
  }

  // 把分组结构渲染成带 <optgroup> 的 <select>：分类名只做分组标题，
  // 不再作为一个 value='' 的可选项出现在下拉里（以前会误导用户去选「网络优化」）。
  function selectWithGroups(groups, value) {
    const sel = el('select', { class: 'input' });
    sel.appendChild(el('option', { value: '' }, '请选择要添加的操作…'));
    for (const g of groups) {
      const og = el('optgroup', { label: g.group });
      for (const it of g.items) og.appendChild(el('option', { value: it.value }, it.label));
      sel.appendChild(og);
    }
    if (value != null) sel.value = value;
    return sel;
  }
  function select(id, options, value, preset, extraClass) {
    const opts = preset || options.map((o) => ({ value: o.value != null ? o.value : o, label: o.label != null ? o.label : o }));
    const cls = 'input' + (extraClass ? ' ' + extraClass : '');
    const sel = el('select', id ? { id, class: cls } : { class: cls },
      opts.map((o) => {
        const node = el('option', { value: o.value }, o.label);
        if (o.value === value) node.selected = true;
        if (o.disabled) node.disabled = true;
        return node;
      }));
    return sel;
  }

  async function refreshData() {
    const [sites, pools] = await Promise.all([
      API.sites.list().catch(() => ({ sites: [] })),
      API.pools.list().catch(() => ({ pools: [] })),
    ]);
    APP_DATA.sites = sites.sites || [];
    APP_DATA.pools = pools.pools || [];
    APP_DATA.poolsLegacySites = pools.legacySites || [];
  }

  // 主题切换（轻量） ------------------------------------------------------
  function bindTheme() {
    const btn = $('theme-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const root = document.documentElement;
      const dark = !root.classList.contains('light');
      root.classList.toggle('light', dark);
    });
  }

  // 启动 ------------------------------------------------------------------
  function bindStatic() {
    const doSubmit = (e) => {
      if (e && e.preventDefault) e.preventDefault();
      // 提交期间禁用按钮，避免重复点击/原生表单提交导致的整页刷新
      const btn = $('login-btn');
      if (btn) btn.disabled = true;
      doLogin($('login-pwd').value).finally(() => {
        if (btn) btn.disabled = false;
      });
    };
    const form = $('login-form');
    if (form) form.addEventListener('submit', doSubmit);
    // 登录按钮改为显式点击触发（type=button），杜绝 form 原生 GET 提交把 URL
    // 变成 \`.../__panel?\` 并整页刷新回到登录页（CNB 公网代理环境下尤甚）
    const loginBtn = $('login-btn');
    if (loginBtn) {
      loginBtn.type = 'button';
      loginBtn.addEventListener('click', doSubmit);
    }
    const eye = $('login-eye');
    if (eye) eye.addEventListener('click', () => {
      const p = $('login-pwd');
      p.type = p.type === 'password' ? 'text' : 'password';
    });
    $('logout-btn') && $('logout-btn').addEventListener('click', doLogout);
    $('drawer-close') && ($('drawer-close').onclick = closeDrawer);
    $('drawer-cancel') && ($('drawer-cancel').onclick = closeDrawer);
    $('drawer-mask') && $('drawer-mask').addEventListener('click', closeDrawer);
    $('menu-btn') && $('menu-btn').addEventListener('click', () => { $('sidebar').classList.add('open'); $('sidebar-mask').hidden = false; });
    $('sidebar-close') && $('sidebar-close').addEventListener('click', () => { $('sidebar').classList.remove('open'); $('sidebar-mask').hidden = true; });
    $('sidebar-mask') && $('sidebar-mask').addEventListener('click', () => { $('sidebar').classList.remove('open'); $('sidebar-mask').hidden = true; });
    $nav().forEach((a) => a.addEventListener('click', () => { $('sidebar').classList.remove('open'); $('sidebar-mask').hidden = true; }));
    bindTheme();
    window.addEventListener('hashchange', () => route(location.hash));
  }

  async function boot() {
    try {
      bindStatic();
      // 先看是否已有会话（HttpOnly Cookie）
      if (await ensureAuth()) {
        enterApp();
      } else {
        showLogin();
      }
    } catch (e) {
      // 最坏情况兜底：任何启动异常都回退到登录视图，绝不白屏
      console.error('[boot] fatal:', e && e.message || e);
      showLogin();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

</script></body></html>`,Ki=`:root{--bg:#0e1116;--bg-soft:#151a21;--panel:#171d26;--panel-2:#1d2430;--border:#262e3b;--border-soft:#1f2733;--text:#e6edf3;--text-dim:#9aa7b6;--text-mute:#6b7888;--primary:#3b82f6;--primary-hover:#2f74e6;--primary-soft:rgba(59,130,246,.14);--success:#22c55e;--warn:#f59e0b;--danger:#ef4444;--danger-soft:rgba(239,68,68,.13);--info:#38bdf8;--shadow:0 8px 28px rgba(0,0,0,.45);--radius:10px;--radius-sm:7px;--sidebar-w:216px;--mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace}@media (prefers-color-scheme:light){:root[data-theme="auto"]{--bg:#f4f6f9;--bg-soft:#eceff4;--panel:#ffffff;--panel-2:#f7f9fc;--border:#dde3ec;--border-soft:#e8edf4;--text:#16202c;--text-dim:#55637a;--text-mute:#8794a8;--primary-soft:rgba(59,130,246,.1);--danger-soft:rgba(239,68,68,.08);--shadow:0 8px 28px rgba(19,32,51,.12)}}:root[data-theme="light"]{--bg:#f4f6f9;--bg-soft:#eceff4;--panel:#ffffff;--panel-2:#f7f9fc;--border:#dde3ec;--border-soft:#e8edf4;--text:#16202c;--text-dim:#55637a;--text-mute:#8794a8;--primary-soft:rgba(59,130,246,.1);--danger-soft:rgba(239,68,68,.08);--shadow:0 8px 28px rgba(19,32,51,.12)}*{box-sizing:border-box}html,body{margin:0;padding:0;height:100%}body{background:var(--bg);color:var(--text);font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei","Helvetica Neue",Arial,sans-serif;-webkit-font-smoothing:antialiased;overflow-wrap:break-word}a{color:var(--primary);text-decoration:none}h1,h2,h3,h4{margin:0;font-weight:600}[hidden]{display:none !important}.grow{flex:1}.mono{font-family:var(--mono);font-size:12.5px}.nowrap{white-space:nowrap}::-webkit-scrollbar{width:10px;height:10px}::-webkit-scrollbar-thumb{background:var(--border);border-radius:6px;border:2px solid transparent;background-clip:content-box}::-webkit-scrollbar-thumb:hover{background:var(--text-mute);background-clip:content-box}:focus-visible{outline:2px solid var(--primary);outline-offset:2px}.login-wrap{min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:20px;background:radial-gradient(1000px 480px at 50% -8%,var(--primary-soft),transparent 62%),var(--bg)}.login-card{width:100%;max-width:380px;background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:34px 28px 26px;box-shadow:var(--shadow)}.login-logo{font-size:40px;text-align:center;line-height:1}.login-title{text-align:center;font-size:20px;margin-top:12px}.login-sub{text-align:center;color:var(--text-dim);font-size:13px;margin:6px 0 22px}.login-foot{text-align:center;color:var(--text-mute);font-size:12px;margin:16px 0 0}.pwd-box{position:relative}.pwd-box .input{padding-right:40px}.pwd-eye{position:absolute;right:4px;top:50%;transform:translateY(-50%);background:none;border:0;cursor:pointer;font-size:15px;padding:6px 8px;border-radius:6px;opacity:.65}.pwd-eye:hover{opacity:1}.app{display:flex;min-height:100dvh}.sidebar{width:var(--sidebar-w);flex:0 0 var(--sidebar-w);background:var(--bg-soft);border-right:1px solid var(--border);display:flex;flex-direction:column;position:sticky;top:0;height:100dvh}.brand{display:flex;align-items:center;gap:9px;padding:16px 16px 14px;border-bottom:1px solid var(--border-soft)}.brand-logo{font-size:20px}.brand-text{font-weight:700;font-size:16px;letter-spacing:.3px}.sidebar-close{display:none;margin-left:auto}.nav{padding:10px 8px;display:flex;flex-direction:column;gap:2px;overflow-y:auto}.nav-item{display:flex;align-items:center;gap:10px;padding:9px 11px;border-radius:var(--radius-sm);color:var(--text-dim);font-size:13.5px;transition:background .15s,color .15s}.nav-item:hover{background:var(--panel-2);color:var(--text)}.nav-item.active{background:var(--primary-soft);color:var(--primary);font-weight:600}.nav-ico{font-size:15px;width:18px;text-align:center}.sidebar-foot{margin-top:auto;padding:12px;border-top:1px solid var(--border-soft)}.plat-badge{font-size:11.5px;color:var(--text-mute);background:var(--panel);border:1px solid var(--border-soft);border-radius:6px;padding:6px 8px;text-align:center;font-family:var(--mono)}.main{flex:1;min-width:0;display:flex;flex-direction:column}.topbar{height:56px;display:flex;align-items:center;gap:12px;padding:0 18px;border-bottom:1px solid var(--border);background:color-mix(in srgb,var(--bg) 82%,transparent);backdrop-filter:blur(8px);position:sticky;top:0;z-index:20}.page-title{font-size:16px}.topbar-actions{margin-left:auto;display:flex;align-items:center;gap:8px}.menu-btn{display:none}.content{padding:20px;max-width:1220px;width:100%}.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:8px 14px;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--panel-2);color:var(--text);font-size:13.5px;font-family:inherit;cursor:pointer;white-space:nowrap;transition:background .15s,border-color .15s,opacity .15s}.btn:hover:not(:disabled){border-color:var(--text-mute)}.btn:disabled{opacity:.5;cursor:not-allowed}.btn-primary{background:var(--primary);border-color:var(--primary);color:#fff}.btn-primary:hover:not(:disabled){background:var(--primary-hover);border-color:var(--primary-hover)}.btn-danger{background:var(--danger);border-color:var(--danger);color:#fff}.btn-danger:hover:not(:disabled){filter:brightness(1.08)}.btn-ghost{background:transparent}.btn-ghost:hover:not(:disabled){background:var(--panel-2)}.btn-sm{padding:5px 10px;font-size:12.5px}.btn-xs{padding:3px 8px;font-size:12px;border-radius:5px}.btn-block{width:100%;padding:10px;font-size:14.5px;margin-top:4px}.btn-link{background:none;border:0;color:var(--primary);cursor:pointer;padding:2px 4px;font-size:13px;font-family:inherit}.btn-danger-text{color:var(--danger)}.icon-btn{background:none;border:0;color:var(--text-dim);cursor:pointer;font-size:16px;padding:6px 8px;border-radius:6px;line-height:1}.icon-btn:hover{background:var(--panel-2);color:var(--text)}.field{margin-bottom:15px}.label{display:block;font-size:12.5px;color:var(--text-dim);margin-bottom:6px;font-weight:500}.label .req{color:var(--danger);margin-left:2px}.form-field{margin-bottom:12px}.field-hint{font-size:12px;line-height:1.5;margin-top:4px;color:var(--text-mute)}.input,.select,.textarea{width:100%;padding:8px 11px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text);font:inherit;font-size:13.5px;transition:border-color .15s,box-shadow .15s}.input:focus,.select:focus,.textarea:focus{outline:none;border-color:var(--primary);box-shadow:0 0 0 3px var(--primary-soft)}.input::placeholder,.textarea::placeholder{color:var(--text-mute)}.input:disabled,.select:disabled{opacity:.55;cursor:not-allowed}.input.invalid,.textarea.invalid{border-color:var(--danger)}.textarea{resize:vertical;min-height:74px;font-family:var(--mono);font-size:12.5px}.select{cursor:pointer;appearance:none;padding-right:30px;background-image:linear-gradient(45deg,transparent 50%,var(--text-mute) 50%),linear-gradient(135deg,var(--text-mute) 50%,transparent 50%);background-position:right 14px center,right 9px center;background-size:5px 5px,5px 5px;background-repeat:no-repeat}.hint{font-size:12px;color:var(--text-mute);margin-top:5px}.err{font-size:12px;color:var(--danger);margin-top:5px}.hint.warn{color:var(--warn,#d97706);background:color-mix(in srgb,var(--warn,#d97706) 10%,transparent);border-left:3px solid var(--warn,#d97706);padding:8px 10px;border-radius:var(--radius-sm,6px)}.tpl-params{margin:10px 0 4px;padding:12px 14px;background:var(--bg-soft,rgba(127,127,127,.06));border-left:3px solid var(--primary,#3b82f6);border-radius:var(--radius-sm,6px)}.tpl-params>.hint{margin:0 0 10px}.tpl-params .form-field:last-child{margin-bottom:0}.row{display:flex;gap:12px;flex-wrap:wrap}.row>.field{flex:1;min-width:150px}.grid-2{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:0 12px}.switch{display:inline-flex;align-items:center;gap:9px;cursor:pointer;user-select:none}.switch input{position:absolute;opacity:0;width:0;height:0}.switch-track{width:38px;height:21px;border-radius:11px;background:var(--border);position:relative;transition:background .18s;flex:0 0 auto}.switch-track::after{content:"";position:absolute;width:17px;height:17px;border-radius:50%;background:#fff;top:2px;left:2px;transition:transform .18s;box-shadow:0 1px 3px rgba(0,0,0,.3)}.switch input:checked+.switch-track{background:var(--primary)}.switch input:checked+.switch-track::after{transform:translateX(17px)}.switch input:disabled+.switch-track{opacity:.5}.switch-label{font-size:13.5px}.radio-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px}.radio-card{display:flex;gap:9px;padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);cursor:pointer;background:var(--panel-2);transition:border-color .15s,background .15s}.radio-card:hover{border-color:var(--text-mute)}.radio-card.checked{border-color:var(--primary);background:var(--primary-soft)}.radio-card input{margin-top:3px;accent-color:var(--primary);flex:0 0 auto}.radio-card-body{min-width:0}.radio-card-title{font-size:13.5px;font-weight:600}.radio-card-desc{font-size:12px;color:var(--text-dim);margin-top:2px;line-height:1.45}.check-tags{display:flex;flex-wrap:wrap;gap:6px}.check-tag{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border:1px solid var(--border);border-radius:14px;cursor:pointer;font-size:12.5px;background:var(--panel-2);user-select:none;transition:border-color .15s,background .15s,color .15s}.check-tag:hover{border-color:var(--text-mute)}.check-tag.checked{border-color:var(--primary);background:var(--primary-soft);color:var(--primary)}.check-tag input{display:none}.quick-btns{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}.range-row{display:flex;align-items:center;gap:11px}.range-row input[type=range]{flex:1;accent-color:var(--primary);cursor:pointer}.range-val{min-width:40px;text-align:right;font-family:var(--mono);font-size:13px}.kv-list{display:flex;flex-direction:column;gap:6px}.kv-row{display:flex;gap:6px;align-items:center}.kv-row .input{flex:1;min-width:0}.kv-row .input.kv-k{flex:0 0 34%}.card{background:var(--panel);border:1px solid var(--border);border-radius:var(--radius);padding:16px}.card+.card{margin-top:14px}.card-head{display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap}.card-title{font-size:14.5px}.card-sub{font-size:12.5px;color:var(--text-dim);margin-top:3px}.section{margin-bottom:22px}.section:last-child{margin-bottom:0}.section-title{font-size:13px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px;padding-bottom:7px;margin-bottom:12px;border-bottom:1px solid var(--border-soft)}.stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(158px,1fr));gap:12px;margin-bottom:16px}.stat-card{background:var(--panel);border:1px solid var(--border);border-radius:var(--radius);padding:14px 16px}.stat-label{font-size:12.5px;color:var(--text-dim);display:flex;align-items:center;gap:5px}.stat-value{font-size:25px;font-weight:700;margin-top:7px;line-height:1.15;letter-spacing:-.4px}.stat-unit{font-size:13px;font-weight:500;color:var(--text-dim);margin-left:3px}.stat-foot{font-size:11.5px;color:var(--text-mute);margin-top:5px}.bars{display:flex;flex-direction:column;gap:9px}.bar-item{display:grid;grid-template-columns:62px 1fr 96px;align-items:center;gap:10px}.bar-label{font-family:var(--mono);font-size:12.5px;color:var(--text-dim)}.bar-track{height:9px;background:var(--bg-soft);border-radius:5px;overflow:hidden;border:1px solid var(--border-soft)}.bar-fill{height:100%;border-radius:5px;background:var(--primary);transition:width .45s cubic-bezier(.3,.9,.4,1);min-width:2px}.bar-fill.s2{background:var(--success)}.bar-fill.s3{background:var(--info)}.bar-fill.s4{background:var(--warn)}.bar-fill.s5{background:var(--danger)}.bar-value{font-size:12.5px;color:var(--text-dim);text-align:right;font-family:var(--mono)}.table-wrap{overflow-x:auto;margin:0 -16px -16px;padding:0 16px 16px}.table{width:100%;border-collapse:collapse;font-size:13.5px}.table th,.table td{padding:10px 12px;text-align:left;border-bottom:1px solid var(--border-soft)}.table th{font-size:12px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:.4px;white-space:nowrap}.table tbody tr:last-child td{border-bottom:0}.table tbody tr:hover{background:var(--panel-2)}.table .col-actions{text-align:right;white-space:nowrap}.table .cell-main{font-weight:600}.badge{display:inline-block;padding:2px 8px;border-radius:11px;font-size:11.5px;font-weight:500;background:var(--panel-2);border:1px solid var(--border);color:var(--text-dim)}.badge-on{color:var(--success);border-color:color-mix(in srgb,var(--success) 40%,transparent);background:color-mix(in srgb,var(--success) 12%,transparent)}.badge-off{color:var(--text-mute)}.badge-warn{color:var(--warn);border-color:color-mix(in srgb,var(--warn) 40%,transparent);background:color-mix(in srgb,var(--warn) 12%,transparent)}.badge-danger{color:var(--danger);border-color:color-mix(in srgb,var(--danger) 40%,transparent);background:color-mix(in srgb,var(--danger) 12%,transparent)}.badge-info{color:var(--info);border-color:color-mix(in srgb,var(--info) 40%,transparent);background:color-mix(in srgb,var(--info) 12%,transparent)}.badge-single{color:var(--text-mute);border-color:color-mix(in srgb,var(--text-mute) 35%,transparent);background:color-mix(in srgb,var(--text-mute) 10%,transparent)}.badge-pool{color:var(--info);border-color:color-mix(in srgb,var(--info) 45%,transparent);background:color-mix(in srgb,var(--info) 14%,transparent)}.dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:5px;vertical-align:middle}.dot-up{background:var(--success);box-shadow:0 0 0 3px color-mix(in srgb,var(--success) 20%,transparent)}.dot-down{background:var(--danger);box-shadow:0 0 0 3px color-mix(in srgb,var(--danger) 20%,transparent)}.dot-unknown{background:var(--text-mute)}.state{text-align:center;padding:46px 20px;color:var(--text-dim)}.state-ico{font-size:34px;opacity:.55}.state-title{font-size:14.5px;margin-top:10px;color:var(--text);font-weight:600}.state-text{font-size:13px;margin-top:5px}.state-act{margin-top:15px}.spinner{width:26px;height:26px;border:2.5px solid var(--border);border-top-color:var(--primary);border-radius:50%;margin:0 auto;animation:spin .7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.skeleton{background:linear-gradient(90deg,var(--panel-2) 25%,var(--border-soft) 50%,var(--panel-2) 75%);background-size:200% 100%;animation:shimmer 1.3s infinite;border-radius:5px;height:13px}@keyframes shimmer{to{background-position:-200% 0}}.drawer-mask,.sidebar-mask,.modal-mask{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:60;animation:fade .16s}@keyframes fade{from{opacity:0}}.drawer{position:fixed;top:0;right:0;bottom:0;width:min(860px,100%);background:var(--panel);border-left:1px solid var(--border);z-index:61;display:flex;flex-direction:column;box-shadow:var(--shadow);animation:slide-in .2s cubic-bezier(.3,.9,.4,1)}@keyframes slide-in{from{transform:translateX(22px);opacity:.4}}.drawer-head{display:flex;align-items:center;padding:15px 18px;border-bottom:1px solid var(--border);flex:0 0 auto}.drawer-head h3{font-size:15.5px;flex:1;min-width:0}.drawer-body{flex:1;overflow-y:auto;padding:22px}.drawer-foot{display:flex;align-items:center;gap:9px;padding:13px 18px;border-top:1px solid var(--border);background:var(--panel-2);flex:0 0 auto}.drawer-hint{font-size:12px;color:var(--text-mute)}.tabs{display:flex;gap:2px;border-bottom:1px solid var(--border);margin-bottom:18px;overflow-x:auto}.tab{padding:8px 15px;border:0;background:none;color:var(--text-dim);cursor:pointer;font-size:13.5px;font-family:inherit;border-bottom:2px solid transparent;margin-bottom:-1px;white-space:nowrap;transition:color .15s,border-color .15s}.tab:hover{color:var(--text)}.tab.active{color:var(--primary);border-bottom-color:var(--primary);font-weight:600}.item-list{display:flex;flex-direction:column;gap:9px}.item{border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--panel-2);overflow:hidden}.item.disabled{opacity:.62}.item-head{display:flex;align-items:center;gap:8px;padding:9px 11px;cursor:pointer;user-select:none}.item-head:hover{background:var(--border-soft)}.item-caret{font-size:10px;color:var(--text-mute);transition:transform .15s;flex:0 0 auto}.item.open .item-caret{transform:rotate(90deg)}.item-title{font-size:13.5px;font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.item-meta{font-size:12px;color:var(--text-mute);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.item-tools{margin-left:auto;display:flex;align-items:center;gap:3px;flex:0 0 auto}.item-body{padding:13px;border-top:1px solid var(--border);background:var(--panel)}.empty-inline{text-align:center;padding:22px;color:var(--text-mute);font-size:13px;border:1px dashed var(--border);border-radius:var(--radius-sm)}.alert{display:flex;gap:9px;padding:10px 12px;border-radius:var(--radius-sm);font-size:12.5px;line-height:1.55;margin-bottom:12px;border:1px solid}.alert-warn{background:color-mix(in srgb,var(--warn) 11%,transparent);border-color:color-mix(in srgb,var(--warn) 32%,transparent);color:var(--text)}.alert-info{background:color-mix(in srgb,var(--info) 10%,transparent);border-color:color-mix(in srgb,var(--info) 30%,transparent);color:var(--text)}.alert-danger{background:var(--danger-soft);border-color:color-mix(in srgb,var(--danger) 34%,transparent);color:var(--text)}.alert-ico{flex:0 0 auto}.modal-mask{display:flex;align-items:center;justify-content:center;padding:20px;z-index:80}.modal{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:22px;width:100%;max-width:400px;box-shadow:var(--shadow);animation:pop .16s cubic-bezier(.3,.9,.4,1)}@keyframes pop{from{transform:scale(.96);opacity:0}}.modal-title{font-size:16px}.modal-text{color:var(--text-dim);font-size:13.5px;margin:10px 0 0;line-height:1.6}.modal-extra{margin-top:14px}.modal-foot{display:flex;justify-content:flex-end;gap:9px;margin-top:20px}.toasts{position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:100;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;width:min(420px,calc(100% - 32px))}.toast{background:var(--panel);border:1px solid var(--border);border-left:3px solid var(--primary);border-radius:var(--radius-sm);padding:10px 14px;font-size:13.5px;box-shadow:var(--shadow);animation:toast-in .2s cubic-bezier(.3,.9,.4,1);max-width:100%;pointer-events:auto}.toast.ok{border-left-color:var(--success)}.toast.err{border-left-color:var(--danger)}.toast.warn{border-left-color:var(--warn)}.toast.hide{animation:toast-out .18s forwards}@keyframes toast-in{from{transform:translateY(-10px);opacity:0}}@keyframes toast-out{to{transform:translateY(-10px);opacity:0}}@media (max-width:860px){.sidebar{position:fixed;left:0;top:0;z-index:70;transform:translateX(-100%);transition:transform .22s cubic-bezier(.3,.9,.4,1)}.sidebar.open{transform:none}.sidebar-close{display:block}.menu-btn{display:block}.content{padding:14px}.topbar{padding:0 12px}.drawer{width:100%}.drawer-body{padding:14px}.stat-grid{grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:9px}.stat-value{font-size:21px}.bar-item{grid-template-columns:50px 1fr 72px;gap:7px}.table th,.table td{padding:9px 8px}.kv-row{flex-wrap:wrap}.kv-row .input.kv-k{flex:1 1 100%}}@media (max-width:480px){.login-card{padding:26px 20px 20px}.radio-cards{grid-template-columns:1fr}}@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms !important;transition-duration:.01ms !important}}.subhead{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:18px 0 10px;padding-bottom:7px;border-bottom:1px solid var(--border-soft);font-size:13.5px;font-weight:600;color:var(--text)}.rules-box{display:flex;flex-direction:column;gap:12px}.rule-card{border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--panel-2);overflow:hidden}.rule-head{display:flex;align-items:center;gap:12px;padding:10px 12px;border-bottom:1px solid var(--border);background:var(--bg-soft);flex-wrap:wrap}.rule-head .field{margin-bottom:0;min-width:130px;flex:0 0 auto}.subcard{border:1px solid var(--border-soft);border-radius:var(--radius-sm);margin:10px 12px;overflow:hidden;background:var(--panel)}.subcard:last-child{margin-bottom:14px}.section-toggle{display:flex;align-items:center;gap:7px;padding:9px 12px;cursor:pointer;user-select:none;background:var(--panel-2)}.section-toggle:hover{background:var(--border-soft)}.section-toggle .tw{font-size:10px;color:var(--text-mute);transition:transform .15s}.subcard.collapsed .tw{transform:rotate(0deg)}.subcard:not(.collapsed) .tw{transform:rotate(90deg)}.section-toggle strong{font-size:13px}.section-toggle .muted{color:var(--text-mute);font-size:12px;font-weight:400}.section-toggle .op-remove{margin-left:auto;padding:2px 10px;font-size:12px;flex:none}.ops-list{display:flex;flex-direction:column;gap:12px}.rw-editor{display:flex;flex-direction:column;gap:10px}.rw-desc{font-size:12px;line-height:1.5;margin-top:-4px}.rw-fields{display:flex;flex-direction:column;gap:10px}.rw-example{font-size:12px;line-height:1.5}.rw-preview-row{display:flex;flex-direction:column;gap:10px}.rw-preview-wrap{display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:var(--bg-soft,#f6f7f9);border:1px dashed var(--border);border-radius:8px;padding:8px 10px}.rw-preview{font-family:var(--mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:13px;color:var(--text);word-break:break-all}.ro-tag{flex:none;font-size:11px;line-height:1;padding:2px 6px;border-radius:4px;background:var(--bg-inset,#eceef1);color:var(--muted,#888);border:1px solid var(--border);user-select:none}.rw-examples{display:flex;flex-direction:column;gap:6px;margin-top:4px;padding:8px 10px;background:var(--bg-soft,#f6f7f9);border:1px solid var(--border);border-radius:8px}.rw-example-item{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.rw-example-btn{font-family:var(--mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:12px;cursor:pointer;background:var(--bg);color:var(--text);border:1px solid var(--accent,#3b82f6);border-radius:6px;padding:3px 8px;line-height:1.4}.rw-example-btn:hover{background:var(--accent-soft,#eef4ff)}.section-body{padding:12px;border-top:1px solid var(--border-soft)}.subcard.collapsed .section-body{display:none}.origin-row .subcard{margin:10px 0}.inline-origin-box{margin:6px 0 4px;padding:14px;border:1px dashed var(--border-soft);border-radius:8px;background:color-mix(in srgb,var(--bg-soft) 50%,transparent)}.inline-origin-box .origin-row{margin:8px 0}.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:0 14px}.op-add{display:flex;align-items:center;flex-wrap:wrap;gap:10px;padding:10px 12px;margin-bottom:14px;background:var(--panel-2);border:1px dashed var(--border);border-radius:var(--radius-sm)}.op-add-label{font-size:13px;font-weight:600;color:var(--text)}.op-add .input{min-width:260px;flex:1;max-width:420px}.op-add .hint{margin-top:0}.seq-page .seq-pick{display:flex;align-items:center;gap:8px}.seq-pick .input{min-width:240px}.seq-flow{margin-top:16px;padding-left:8px;border-left:3px solid var(--border);display:flex;flex-direction:column;gap:0}.seq-stage{position:relative;display:flex;align-items:flex-start;gap:14px;padding:14px 16px 14px 22px;margin-left:14px;background:var(--panel);border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:-1px}.seq-stage::before{content:'';position:absolute;left:-15px;top:-16px;bottom:50%;width:2px;background:var(--border)}.seq-stage:first-child::before{display:none}.seq-icon{flex:0 0 auto;width:38px;height:38px;display:flex;align-items:center;justify-content:center;font-size:20px;background:var(--panel-2);border:1px solid var(--border);border-radius:50%}.seq-main{flex:1 1 auto;min-width:0}.seq-title{display:flex;align-items:center;gap:10px;font-weight:600;font-size:15px;color:var(--text);margin-bottom:4px}.seq-summary{font-size:13px;color:var(--muted);line-height:1.5;word-break:break-word}.seq-note{font-size:12px;line-height:1.5;margin-bottom:4px;color:var(--text-mute);word-break:break-word}.seq-owner{margin-top:6px;font-size:11px;color:var(--muted);opacity:.8;font-style:italic}.seq-group{position:relative;display:flex;align-items:flex-start;gap:10px;margin:18px 0 2px -15px;padding:6px 12px 6px 14px}.seq-group-no{flex:0 0 auto;font-size:13px;font-weight:700;color:var(--accent);background:color-mix(in srgb,var(--accent) 14%,transparent);border-radius:6px;padding:2px 8px;line-height:20px}.seq-group-main{min-width:0}.seq-group-title{font-size:14px;font-weight:700;color:var(--text)}.seq-group-desc{font-size:12px;color:var(--muted);margin-top:2px;line-height:1.5}.seq-substeps{margin:2px 0 6px 52px;padding:10px 14px;border-left:2px dashed var(--border);display:flex;flex-direction:column;gap:6px}.seq-substep{display:flex;gap:10px;flex-wrap:wrap;align-items:baseline}.seq-substep-t{font-size:12px;font-weight:600;color:var(--text);white-space:nowrap}.seq-substep-d{font-size:12px;color:var(--muted)}.frag-note{border-left:3px solid var(--accent);padding-left:10px;margin-bottom:12px}.seq-badge{font-size:11px;font-weight:600;padding:1px 8px;border-radius:999px;line-height:18px;white-space:nowrap}.seq-badge.on{background:color-mix(in srgb,var(--accent) 18%,transparent);color:var(--accent)}.seq-badge.off{background:var(--panel-2);color:var(--muted);border:1px solid var(--border)}.seq-go{flex:0 0 auto;align-self:center;font-size:12px;font-weight:600;color:var(--accent);white-space:nowrap}.seq-stage.clickable{cursor:pointer;transition:border-color .15s,transform .05s}.seq-stage.clickable:hover{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 6%,var(--panel))}.seq-stage.clickable:active{transform:scale(.997)}.seq-stage.disabled{opacity:.55}.seq-rule{border-left:3px solid var(--accent)}.seq-rule-list{margin:2px 0 6px 26px;display:flex;flex-direction:column;gap:8px}.seq-rule-inpack{border-left:3px solid var(--border);background:color-mix(in srgb,var(--panel-2) 40%,transparent)}.seq-rule-head{display:flex;align-items:center;gap:10px;margin-bottom:4px}.seq-rule-prio{font-size:11px;font-weight:700;color:var(--accent);background:color-mix(in srgb,var(--accent) 14%,transparent);padding:1px 7px;border-radius:5px}.seq-rule-name{font-weight:600;font-size:15px;color:var(--text)}.seq-subs{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.seq-chip{font-size:12px;padding:2px 9px;background:var(--panel-2);color:var(--text-2);border:1px solid var(--border);border-radius:999px}.flash-anchor{animation:flashAnchor 1.6s ease-out;box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 45%,transparent)}@keyframes flashAnchor{0%{box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 55%,transparent)}100%{box-shadow:0 0 0 3px transparent}}.seq-rule-drag{cursor:grab}.seq-rule-drag .seq-grip{flex:0 0 auto;align-self:center;font-size:15px;line-height:1;color:var(--muted);cursor:grab;user-select:none;padding:0 2px;border-radius:5px}.seq-rule-drag .seq-grip:hover{color:var(--accent);background:var(--panel-2)}.seq-rule-drag.dragging{opacity:.4;cursor:grabbing}.seq-rule-drag.drop-before{box-shadow:inset 0 3px 0 0 var(--accent)}.seq-rule-drag.drop-after{box-shadow:inset 0 -3px 0 0 var(--accent)}.seq-rule-head .seq-grip+.seq-rule-prio{margin-left:0}.seq-site-head{position:relative;margin:18px 0 4px 14px;padding:10px 14px;background:var(--panel-2);border:1px solid var(--border);border-radius:var(--radius-sm);display:flex;flex-direction:column;gap:6px}.seq-site-head:first-of-type{margin-top:4px}.seq-site-name{font-weight:700;font-size:16px;color:var(--text);word-break:break-all}.seq-site-meta{display:flex;flex-wrap:wrap;align-items:center;gap:6px}.seq-site-go{margin-left:auto}.seq-site-click{position:absolute;inset:0;cursor:pointer}.seq-site-head:hover{border-color:var(--accent)}.section>.section-title{color:var(--accent)}.check-row{display:flex;flex-wrap:wrap;gap:8px;padding-top:4px}.check{display:inline-flex;align-items:center;gap:6px;padding:4px 9px;border:1px solid var(--border);border-radius:14px;cursor:pointer;font-size:12.5px;background:var(--panel-2);user-select:none;transition:border-color .15s,background .15s,color .15s}.check:hover{border-color:var(--text-mute)}.check input{accent-color:var(--primary);margin:0}.check:has(input:checked){border-color:var(--primary);background:var(--primary-soft);color:var(--primary)}.kv-label{font-size:12px;color:var(--text-dim);margin:8px 0 5px}.header-editor{display:flex;flex-direction:column}.header-editor .btn{align-self:flex-start;margin-top:6px}.header-editor .kv-row .hk{flex:0 0 36%}.header-editor .kv-row .hv{flex:1;min-width:0}.muted{color:var(--text-mute);font-size:12px}.check .muted{margin-left:2px}.cond-groups{display:flex;flex-direction:column;gap:10px;margin:10px 0}.cond-group{border:1px dashed var(--border);border-radius:var(--radius-sm);padding:10px;background:var(--panel);position:relative}.cond-group+.cond-group{margin-top:14px}.cond-group+.cond-group::before{content:'或 (OR)';position:absolute;top:-9px;left:12px;padding:0 6px;font-size:11px;color:var(--text-mute);background:var(--panel-2);border-radius:8px}.cond-group-head{display:flex;align-items:center;gap:8px;margin-bottom:8px}.cond-group-head .badge{font-size:11px;padding:2px 7px;border-radius:8px;background:var(--primary-soft);color:var(--primary)}.cond-rows{display:flex;flex-direction:column;gap:6px}.cond-row{display:grid;grid-template-columns:minmax(120px,1.1fr) minmax(0,0.9fr) minmax(110px,1fr) minmax(0,1.6fr) auto auto;gap:6px;align-items:center}.cond-row .input{min-width:0}.cond-cell{min-width:0}.cond-row .check{padding:4px 8px}@media (max-width:720px){.cond-row{grid-template-columns:1fr 1fr}}.rules-box textarea.input{resize:vertical;font-family:inherit}`,ji=`/**
 * ============================================================================
 * API 客户端封装
 * ----------------------------------------------------------------------------
 * 所有接口前缀 /{adminPath}/api，adminPath 由 Worker 运行时注入到 window.__BASE__。
 * 统一响应格式：成功 { ok:true, data }  失败 { ok:false, error:{code,message} }
 * ============================================================================
 */

/** 业务错误：携带后端错误码与 HTTP 状态码 */
class ApiError extends Error {
  constructor(code, message, status, data) {
    super(message || code || '请求失败');
    this.name = 'ApiError';
    this.code = code || 'INTERNAL';
    this.status = status || 0;
    this.data = data || null;
  }
}

/** 取 API 根路径。__BASE__ 形如 "/__panel"，兜底取当前路径第一段 */
function apiBase() {
  let base = (typeof window !== 'undefined' && window.__BASE__) || '';
  if (!base) {
    const seg = location.pathname.split('/').filter(Boolean)[0];
    base = seg ? '/' + seg : '';
  }
  if (base && !base.startsWith('/')) base = '/' + base;
  return base.replace(/\\/$/, '') + '/api';
}

/**
 * 底层请求。自动处理 JSON 编解码、鉴权失效、限流锁定。
 * @param {string} path   形如 "/sites"
 * @param {Object} [opts] { method, body, query, raw }
 */
async function request(path, opts = {}) {
  const { method = 'GET', body, query, raw = false } = opts;

  let url = apiBase() + path;
  if (query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    }
    const s = qs.toString();
    if (s) url += '?' + s;
  }

  const init = {
    method,
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  };
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  let resp;
  try {
    resp = await fetch(url, init);
  } catch (e) {
    throw new ApiError('NETWORK', '网络连接失败，请检查网络后重试', 0);
  }

  // 需要原始响应（导出配置下载等）
  if (raw) {
    if (!resp.ok) throw await toApiError(resp);
    return resp;
  }

  let payload = null;
  const text = await resp.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!resp.ok || !payload || payload.ok !== true) {
    const err = payload && payload.error ? payload.error : {};
    const e = new ApiError(
      err.code || httpFallbackCode(resp.status),
      err.message || httpFallbackMessage(resp.status),
      resp.status,
      payload && payload.data ? payload.data : null
    );
    // 429 锁定：尽力解析剩余秒数，供登录页倒计时使用
    if (resp.status === 429) {
      const ra = resp.headers.get('Retry-After');
      e.retryAfter = Number(ra) || (e.data && e.data.retryAfter) || 0;
    }
    throw e;
  }

  return payload.data;
}

async function toApiError(resp) {
  let payload = null;
  try {
    payload = await resp.json();
  } catch {}
  const err = (payload && payload.error) || {};
  return new ApiError(
    err.code || httpFallbackCode(resp.status),
    err.message || httpFallbackMessage(resp.status),
    resp.status
  );
}

function httpFallbackCode(status) {
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 400) return 'BAD_REQUEST';
  if (status === 409) return 'CONFLICT';
  if (status === 429) return 'RATE_LIMITED';
  return 'INTERNAL';
}

function httpFallbackMessage(status) {
  const map = {
    400: '请求参数有误',
    401: '登录已失效，请重新登录',
    403: '没有权限执行该操作',
    404: '请求的资源不存在',
    409: '资源冲突，可能已存在同名项',
    429: '操作过于频繁，请稍后再试',
    500: '服务器内部错误',
    503: '存储服务不可用，请检查 KV 绑定',
  };
  return map[status] || '请求失败（HTTP ' + status + '）';
}

const get = (p, query) => request(p, { method: 'GET', query });
const put = (p, body) => request(p, { method: 'PUT', body });
const post = (p, body) => request(p, { method: 'POST', body });
const del = (p) => request(p, { method: 'DELETE' });

/** 对外 API 门面 */
const API = {
  ApiError,
  base: apiBase,

  auth: {
    login: (password) => post('/auth/login', { password }),
    logout: () => post('/auth/logout', {}),
    me: () => get('/auth/me'),
    changePassword: (oldPassword, newPassword) =>
      post('/auth/password', { oldPassword, newPassword }),
  },

  sites: {
    list: () => get('/sites'),
    /** 新建站点可选的场景模板 + 参数元信息（名称/说明/范围） */
    templates: () => get('/sites/templates'),
    get: (host) => get('/sites/' + encodeURIComponent(host)),
    save: (host, site) => put('/sites/' + encodeURIComponent(host), site),
    remove: (host) => del('/sites/' + encodeURIComponent(host)),
    // 片段 API：各段只保存自己的字段，互不影响（绝不越界）
    saveBasics: (host, payload) => put('/sites/' + encodeURIComponent(host) + '/basics', payload),
    saveRules: (host, rules) => put('/sites/' + encodeURIComponent(host) + '/rules', { rules }),
    saveSecurity: (host, security) => put('/sites/' + encodeURIComponent(host) + '/security', { security }),
  },

  pools: {
    list: () => get('/pools'),
    get: (id) => get('/pools/' + encodeURIComponent(id)),
    /** 保存：有 id 走 PUT（更新），无 id 走 POST（新建，机器 id 由后端生成） */
    save: (id, pool) => (id ? put('/pools/' + encodeURIComponent(id), pool) : post('/pools', pool)),
    create: (pool) => post('/pools', pool),
    remove: (id) => del('/pools/' + encodeURIComponent(id)),
  },

  cache: {
    /** @param {{host?:string,prefix?:string,urls?:string[]}} payload */
    purge: (payload) => post('/cache/purge', payload),
  },

  stats: {
    overview: () => get('/stats/overview'),
    host: (host, hours = 24) =>
      get('/stats/host/' + encodeURIComponent(host), { hours }),
  },

  system: {
    info: () => get('/system/info'),
    export: () => request('/system/export', { method: 'GET', raw: true }),
    import: (config) => post('/system/import', config),
  },

  config: {
    get: () => get('/config/global'),
    save: (payload) => put('/config/global', payload),
  },

  rules: {
    /** 全站通用规则（兜底），对所有站点生效、优先级最低 */
    global: () => get('/rules/global'),
    saveGlobal: (rules) => put('/rules/global', rules),
  },
};

if (typeof window !== 'undefined') window.API = API;

/**
 * ============================================================================
 * web/app.js —— 管理面前端逻辑（单页应用，哈希路由）
 * ----------------------------------------------------------------------------
 * 运行环境约定（由 api.js / 注入脚本提供）：
 *  - window.__BASE__   管理面基础路径（如 "/__panel"）
 *  - window.__PLATFORM__  运行平台标识
 *  - window.API        数据访问门面（见 api.js）
 *                      响应统一为 { ok, data }，API.*.list() 返回 data 字段
 *  - 鉴权基于 HttpOnly Cookie：登录后后端写入，fetch 同源自动携带
 *
 * 本文件只负责「交互 + 视图渲染」，一切数据走 window.API。
 * 约定：元素显隐统一使用 [hidden] 属性（标准 HTML 语义）。
 * ============================================================================
 */

(function () {
  'use strict';

  const API = window.API;
  const PLATFORM = window.__PLATFORM__ || 'unknown';

  // 小工具 ----------------------------------------------------------------
  // 单参: document.getElementById(id)
  // 双参: 在 root 内按 CSS 选择器查找（$('.o-addr', row)）
  const $ = (sel, root) => {
    if (root) return root.querySelector(sel);
    return typeof sel === 'string' ? document.getElementById(sel) : sel;
  };
  const APP_DATA = { global: null, sites: [], pools: [], stats: null, info: null };

  function el(tag, attrs, children) {
    const n = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') n.className = v;
        else if (k === 'text') n.textContent = v;
        else if (k === 'html') n.innerHTML = v;
        else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
        else n.setAttribute(k, v === true ? '' : String(v));
      }
    }
    if (children != null) {
      (Array.isArray(children) ? children : [children]).forEach((c) => {
        if (c == null) return;
        n.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
      });
    }
    return n;
  }
  const clear = (node) => { while (node && node.firstChild) node.removeChild(node.firstChild); };

  function fmtNum(n) {
    n = Number(n) || 0;
    if (n >= 1e9) return (n / 1e9).toFixed(2) + ' GB';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + ' MB';
    if (n >= 1e3) return (n / 1e3).toFixed(2) + ' KB';
    return String(n) + ' B';
  }
  const fmtRate = (r) => (r == null || isNaN(r) ? '0%' : (r * 100).toFixed(1) + '%');
  const fmtDate = (ts) => (ts ? new Date(ts).toLocaleString() : '-');

  // 把秒数换算成人话，追加在输入框说明后面。
  // 「15552000 秒」没人读得出是多久，写成「≈ 180 天」才能让用户立刻意识到
  // 自己填的值意味着什么——尤其是缓存时间这种设错代价很大的参数。
  function humanSecs(s) {
    if (!Number.isFinite(s)) return '';
    if (s < 0) return '　当前：跟随源站，不改写';
    if (s === 0) return '　当前：0（不缓存）';
    if (s < 60) return \`　当前：\${s} 秒\`;
    if (s < 3600) return \`　当前：≈ \${(s / 60).toFixed(s % 60 ? 1 : 0)} 分钟\`;
    if (s < 86400) return \`　当前：≈ \${(s / 3600).toFixed(s % 3600 ? 1 : 0)} 小时\`;
    return \`　当前：≈ \${(s / 86400).toFixed(s % 86400 ? 1 : 0)} 天\`;
  }

  // 全局提示 --------------------------------------------------------------
  function toast(msg, type) {
    const host = $('toasts');
    if (!host) return;
    const t = el('div', { class: 'toast' + (type ? ' ' + type : '') }, msg);
    host.appendChild(t);
    setTimeout(() => {
      t.classList.add('hide');
      setTimeout(() => t.remove(), 200);
    }, 3000);
  }

  // 抽屉 ------------------------------------------------------------------
  function openDrawer(title, hint, bodyNode, onSave) {
    $('drawer-title').textContent = title;
    $('drawer-hint').textContent = hint || '';
    const body = $('drawer-body');
    clear(body);
    body.appendChild(bodyNode);
    $('drawer-mask').hidden = false;
    $('drawer').hidden = false;
    // onSave 为空 → 只读抽屉（如「引用详情」），隐藏保存按钮
    $('drawer-save').hidden = !onSave;
    if (!onSave) { $('drawer-save').onclick = null; return; }
    $('drawer-save').onclick = async () => {
      try {
        $('drawer-save').disabled = true;
        await onSave();
        closeDrawer();
        toast('已保存', 'ok');
        await route(location.hash); // 刷新当前视图
      } catch (e) {
        toast(e.message || '保存失败', 'err');
      } finally {
        $('drawer-save').disabled = false;
      }
    };
  }
  function closeDrawer() {
    $('drawer').hidden = true;
    $('drawer-mask').hidden = true;
  }

  // 流量序列跳转：抽屉打开后滚动到指定片段锚点并高亮
  function scrollToAnchor(anchor) {
    if (!anchor) return;
    requestAnimationFrame(() => {
      const tgt = document.getElementById(anchor);
      if (!tgt) return;
      tgt.scrollIntoView({ block: 'start', behavior: 'smooth' });
      tgt.classList.add('flash-anchor');
      setTimeout(() => tgt.classList.remove('flash-anchor'), 1600);
    });
  }

  // 确认弹窗 --------------------------------------------------------------
  function confirmDialog(title, text, options) {
    options = options || {};
    return new Promise((resolve) => {
      $('confirm-title').textContent = title;
      $('confirm-text').textContent = text || '';
      const extra = $('confirm-extra');
      const input = $('confirm-input');
      if (options.confirmText) {
        extra.hidden = false;
        $('confirm-extra-label').textContent = options.confirmLabel || '';
        input.value = '';
        input.placeholder = options.confirmPlaceholder || '';
      } else {
        extra.hidden = true;
      }
      const mask = $('confirm-mask');
      mask.hidden = false;
      const done = (ok) => {
        mask.hidden = true;
        if (ok && options.confirmText) {
          resolve(input.value.trim() === options.confirmText);
        } else {
          resolve(ok);
        }
      };
      $('confirm-ok').onclick = () => done(true);
      $('confirm-cancel').onclick = () => done(false);
    });
  }

  // 登录态 ----------------------------------------------------------------
  async function ensureAuth() {
    try {
      const me = await API.auth.me();
      return !!(me && me.authed);
    } catch {
      return false;
    }
  }

  async function doLogin(pwd) {
    const errEl = $('login-err');
    errEl.hidden = true;
    try {
      await API.auth.login(pwd);
      enterApp();
    } catch (e) {
      errEl.textContent = e.message || '登录失败';
      errEl.hidden = false;
    }
  }

  async function doLogout() {
    try { await API.auth.logout(); } catch {}
    showLogin();
  }

  // 视图切换 --------------------------------------------------------------
  function showLogin() {
    $('view-app').hidden = true;
    $('view-login').hidden = false;
  }
  function enterApp() {
    $('view-login').hidden = true;
    $('view-app').hidden = false;
    // 启动后拉取首屏数据
    loadAll().catch((e) => toast(e.message, 'err'));
    route(location.hash);
  }

  async function loadAll() {
    const [info, sites, pools] = await Promise.all([
      API.system.info().catch(() => null),
      API.sites.list().catch(() => ({ sites: [] })),
      API.pools.list().catch(() => ({ pools: [] })),
    ]);
    APP_DATA.info = info;
    APP_DATA.sites = sites.sites || [];
    APP_DATA.pools = pools.pools || [];
    APP_DATA.poolsLegacySites = pools.legacySites || [];
    renderPlatBadge();
  }

  function renderPlatBadge() {
    const badge = $('plat-badge');
    if (!badge) return;
    const caps = (APP_DATA.info && APP_DATA.info.caps) || {};
    const parts = ['平台: ' + (APP_DATA.info ? APP_DATA.info.platform : PLATFORM)];
    if (caps.hasEdgeCache) parts.push('边缘缓存 ✓');
    if (!caps.hasSocket) parts.push('socket ✗');
    if (!caps.hasD1) parts.push('D1 ✗');
    badge.textContent = parts.join(' · ');
    badge.title = (APP_DATA.info && APP_DATA.info.limitations || []).map((l) => l.message).join('\\n');
  }

  // 路由 ------------------------------------------------------------------
  const ROUTES = {
    overview: renderOverview,
    sites: renderSites,
    sequence: renderTrafficSequence,
    pools: renderPools,
    cache: renderCache,
    system: renderSystem,
  };
  const TITLES = {
    overview: '概览', sites: '站点管理', sequence: '流量序列', pools: '源站',
    cache: '缓存管理', system: '系统设置',
  };

  async function route(hash) {
    const key = (hash || location.hash || '').replace(/^#\\/?/, '') || 'overview';
    const fn = ROUTES[key] || renderOverview;
    $('page-title').textContent = TITLES[key] || '概览';
    // 高亮导航
    $$nav().forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#/' + key));
    const content = $('content');
    clear(content);
    content.appendChild(el('div', { class: 'loading' }, '加载中…'));
    try {
      const node = await fn();
      clear(content);
      if (node) content.appendChild(node);
    } catch (e) {
      clear(content);
      content.appendChild(el('div', { class: 'empty err' }, e.message || '加载失败'));
    }
  }
  function $$nav() {
    return Array.from(document.querySelectorAll('#nav a[href^="#/"]'));
  }

  // 通用组件 --------------------------------------------------------------
  function table(headers, rows) {
    const t = el('table', { class: 'table' });
    t.appendChild(el('thead', {}, el('tr', {}, headers.map((h) => el('th', {}, h)))));
    const tb = el('tbody');
    rows.forEach((r) => tb.appendChild(el('tr', {}, r.map((c) => (c && c.nodeType ? el('td', {}, c) : el('td', {}, String(c)))))));
    t.appendChild(tb);
    return t;
  }
  function actions(btns) {
    return el('div', { class: 'row-actions' }, btns.map((b) =>
      el('button', { class: 'btn btn-sm ' + (b.cls || 'btn-ghost'), text: b.label, onclick: b.onClick })
    ));
  }

  // ====== 概览 ======
  async function renderOverview() {
    const wrap = el('div', { class: 'section' });
    wrap.appendChild(el('h3', {}, '概览'));

    let stats = null;
    try { stats = await API.stats.overview(); } catch {}
    const totalSites = APP_DATA.sites.length;
    const totalPools = APP_DATA.pools.length;
    const cards = el('div', { class: 'cards' }, [
      statCard('站点数', String(totalSites)),
      statCard('源站数', String(totalPools)),
      statCard('请求数(24h)', stats && stats.enabled ? fmtNum(stats.requests) : '未启用'),
      statCard('缓存命中率', stats && stats.enabled ? fmtRate(stats.hitRate) : '—'),
    ]);
    wrap.appendChild(cards);

    if (stats && stats.enabled && Array.isArray(stats.topHosts)) {
      wrap.appendChild(el('h4', {}, 'Top 站点'));
      const rows = stats.topHosts.slice(0, 8).map((h) => [
        h.host, fmtNum(h.requests), fmtNum(h.bytes), fmtRate(h.hitRate),
      ]);
      wrap.appendChild(table(['Host', '请求', '流量', '命中率'], rows));
    } else {
      wrap.appendChild(el('p', { class: 'empty' }, '统计未启用，可在「系统设置」中开启。'));
    }

    // 快速入口
    wrap.appendChild(el('div', { class: 'quick' }, [
      el('button', { class: 'btn btn-primary', text: '+ 新建站点', onclick: () => openSiteDrawer(null) }),
      el('button', { class: 'btn btn-primary', text: '+ 新建源站池', onclick: () => openPoolDrawer(null, 'pool') }),
    ]));
    return wrap;
  }
  function statCard(label, value) {
    return el('div', { class: 'card' }, [
      el('div', { class: 'card-label' }, label),
      el('div', { class: 'card-value' }, value),
    ]);
  }

  // ====== 站点管理 ======
  async function renderSites() {
    const wrap = el('div', { class: 'section' });
    wrap.appendChild(el('div', { class: 'section-head' }, [
      el('h3', {}, '站点管理'),
      el('button', { class: 'btn btn-primary', text: '+ 新建站点', onclick: () => openSiteDrawer(null) }),
    ]));
    if (!APP_DATA.sites.length) {
      wrap.appendChild(el('p', { class: 'empty' }, '暂无站点，点击右上角新建。'));
      return wrap;
    }
    const rows = APP_DATA.sites.map((s) => {
      const p = APP_DATA.pools.find((x) => x.id === s.poolId);
      return [
        s.host,
        s.enabled ? '启用' : '停用',
        p
          ? el('span', {}, [
            el('span', { class: 'badge ' + (poolKind(p) === 'single' ? 'badge-single' : 'badge-pool') },
              poolKind(p) === 'single' ? '单一' : '池'),
            el('span', { text: ' ' + (p.name || p.id) }),
          ])
          : (s.poolId || '—'),
        String((s.rules || []).length),
        String(s.cacheGen || 0),
        actions([
          { label: '编辑', onClick: () => openSiteDrawer(s.host) },
          { label: '缓存', onClick: () => openCacheDrawer(s.host) },
          { label: '删除', cls: 'btn-danger', onClick: () => removeSite(s.host) },
        ]),
      ];
    });
    wrap.appendChild(table(['Host', '状态', '源站', '规则数', '代次', '操作'], rows));
    return wrap;
  }

  // ====== 流量序列（借鉴 Cloudflare Traffic Sequence 的前端方案）======
  /** 根据池 id 取用户可见名称（找不到时回退 id 本体） */
  function poolName(id) {
    if (!id) return '未设置';
    const p = APP_DATA.pools.find((x) => x.id === id);
    return (p && (p.name || p.id)) || id;
  }

  // 把一个站点（或所有站点）的请求处理流程，按「请求入口 → 最终用户」的真实顺序，
  // 渲染成一条可点击的竖向流水线。点击任一阶段，跳转到对应环节的设置；单站点下规则可拖拽排序。
  async function renderTrafficSequence() {
    const wrap = el('div', { class: 'section seq-page' });

    if (!APP_DATA.sites.length) {
      wrap.appendChild(el('h3', {}, '流量序列'));
      wrap.appendChild(el('p', { class: 'empty' }, '暂无站点，请先在「站点管理」中创建站点。'));
      return wrap;
    }

    const ALL = '__all__';
    const initial = decodeURIComponent(location.hash.split('?host=')[1] || '');
    const initHost = (initial && (initial === ALL || initial === '__global__' || APP_DATA.sites.some((s) => s.host === initial)))
      ? initial : APP_DATA.sites[0].host;

    wrap.appendChild(el('div', { class: 'section-head' }, [
      el('h3', {}, '流量序列'),
      el('div', { class: 'seq-pick' }, [
        el('label', { class: 'muted', text: '站点：' }),
        (() => {
          const sel = select('', [
            { value: ALL, label: '全部站点总览（跨域名）' },
            { value: '__global__', label: '全站通用规则（兜底默认）' },
            ...APP_DATA.sites.map((s) => ({ value: s.host, label: s.host })),
          ], initHost);
          sel.className = 'input';
          return sel;
        })(),
      ]),
    ]));
    wrap.appendChild(el('p', { class: 'hint' }, '本图是请求从进入网关到返回浏览器的完整处理顺序（顺序固定、不可更改），共 18 个阶段，采用 Cloudflare 流量序列风格：每个阶段卡片本身就是一个独立的规则引擎或配置入口，阶段之间相互独立（AND），阶段内部可有多个规则集（OR：从上到下匹配，命中即跳出本阶段进入下一阶段）。某阶段站点未做任何设置时，自动回落「全站通用规则」作为实际生效（看卡片上的「回落全站兜底」提示）。点击阶段卡片或其中规则即可编辑。'));

    const hostSel = $('select', wrap);
    const flow = el('div', { class: 'seq-flow' });
    wrap.appendChild(flow);

    // 预取全站通用规则（兜底），用于各阶段「站点未设置→回落全站兜底」的标注与跳转
    let GLOBAL_RULES = [];
    try {
      const gr = await API.rules.global().catch(() => null);
      GLOBAL_RULES = (gr && gr.rules) || [];
    } catch { GLOBAL_RULES = []; }
    GLOBAL_RULES = GLOBAL_RULES.slice().sort((a, b) => (b.priority || 0) - (a.priority || 0));

    // 汇总一条规则的动作子阶段（用于序列展示）
    function ruleSubs(r) {
      const a = r.action || {};
      const subs = [];
      const rw = a.rewrite || {};
      if (rw.type && rw.type !== 'none') subs.push(\`URL重写(\${rw.type})\`);
      if (a.forceHttps) subs.push('强制HTTPS');
      if (a.redirect && a.redirect.enabled) subs.push(\`重定向(\${a.redirect.status || 302})\`);
      if (a.directResponse && a.directResponse.enabled) subs.push(\`自定义响应(\${a.directResponse.status || 200})\`);
      if (a.poolId) subs.push(\`源站→\${poolName(a.poolId)}\`);
      if (a.hostHeader && a.hostHeader.mode && a.hostHeader.mode !== 'accel') subs.push(\`回源Host(\${a.hostHeader.mode})\`);
      if (a.clientIpHeader && a.clientIpHeader.enabled) subs.push(\`客户端IP→\${a.clientIpHeader.name || 'X-EdgeGateway-Client-IP'}\`);
      if (a.followRedirect) subs.push('回源跟随3xx');
      if (a.originTimeoutMs) subs.push(\`回源超时\${a.originTimeoutMs}ms\`);
      if (a.engine) subs.push(\`引擎(\${a.engine})\`);
      if (a.scheme) subs.push(\`协议(\${a.scheme})\`);
      if (Number(a.port) > 0) subs.push(\`端口(\${a.port})\`);
      const cp = a.cache || {};
      if (cp && cp.mode === 'noCache') subs.push('不缓存');
      else if (cp && cp.enabled) subs.push('缓存');
      const rh = a.reqHeaders || {};
      if (rh.set && Object.keys(rh.set).length || (rh.remove || []).length) subs.push('改请求头');
      const rph = a.respHeaders || {};
      if (rph.set && Object.keys(rph.set).length || (rph.remove || []).length) subs.push('改响应头');
      return subs;
    }

    // 渲染单个站点的完整序列（draggable=true 时规则可拖拽）
    // 严格按「①→⑱」18 个阶段顺序；阶段间相互独立（AND），阶段内规则集是 OR（按 priority 降序从上到下匹配，命中即跳出本阶段）。
    // 某阶段站点无规则时，回落全站通用规则（GLOBAL_RULES）作为实际生效，卡片显示「回落全站兜底」。
    function renderSite(site, draggable) {
      const rules = (site.rules || [])
        .slice()
        .sort((a, b) => (b.priority || 0) - (a.priority || 0));
      const ruleNodes = [];

      const sec = site.security || {};

      // 统一渲染一个「规则引擎型」阶段：站点规则按本阶段 match 命中子集；为空则回落全站兜底
      function renderRuleStage(no, icon, title, stageSummary, matchFn, opts) {
        const matched = rules.filter((r) => { try { return matchFn(r.action || {}); } catch { return false; } });
        const globalMatched = GLOBAL_RULES.filter((r) => { try { return matchFn(r.action || {}); } catch { return false; } });
        const hasSite = matched.length > 0;
        const hasGlobal = !hasSite && globalMatched.length > 0;
        const badge = hasSite ? \`\${matched.length} 条\` : (hasGlobal ? '回落全站兜底' : '未配置');
        const summary = hasSite
          ? \`\${matched.length} 条规则（按优先级从上到下匹配，命中即跳出本阶段）；\${stageSummary}\`
          : (hasGlobal
            ? \`本站无设置 → 实际生效为「全站通用规则」\${globalMatched.length} 条（点击前往编辑）\`
            : \`本站无设置，且无全站兜底；\${stageSummary}\`);
        const onClick = opts
          ? () => openRulesDrawer(site.host, opts)
          : (hasGlobal ? () => { location.hash = '#/sequence?host=__global__'; } : null);
        const owner = opts ? opts.owner : (hasGlobal ? '全站通用规则（兜底，点击前往）' : null);
        flow.appendChild(seqStage(icon, \`\${no} \${title}\`, summary, badge, 'sec-rules', onClick, owner));
        if (hasSite && matched.length) {
          flow.appendChild(el('div', { class: 'seq-rule-list' }, matched.map((r) => {
            const condCount = (r.match && r.match.conditions || []).reduce((n, g) => n + g.length, 0)
              + Object.keys(legacyMatchFields(r.match || {})).length;
            const idx = rules.indexOf(r);
            const node = seqRuleInPack(r, ruleSubs(r), condCount, site.host, draggable);
            if (draggable && idx >= 0) ruleNodes.push({ node, index: idx });
            return node;
          })));
        }
      }

      // ── ① 匹配站点 ─────────────────────────────────────────────
      flow.appendChild(seqGroup('①', '匹配站点', '按 Host 命中站点配置，决定后续整条管线走哪套设置'));
      flow.appendChild(seqStage('🛰️', '① 匹配站点 matchSite',
        \`\${site.host} · \${site.enabled === false ? '已停用' : '启用'} · IPv6 \${site.ipv6Support ? '已开启' : '未开启'}\`,
        site.enabled === false ? '已停用' : '启用', 'sec-basic',
        () => openSiteDrawer(site.host, 'sec-basic'), '站点基础抽屉'));

      // ── ② 安全校验：5 个最小任务包，各自独立成片段 ───────────────
      flow.appendChild(seqGroup('②', '安全校验 checkSecurity', 'fail-closed：自身异常也按 403 拦截，绝不放行。以下 5 包全部通过才继续 ③'));

      const ipCnt = (sec.ipBlacklist || []).length + (sec.ipWhitelist || []).length;
      flow.appendChild(seqStage('🚧', '②.1 IP 访问规则',
        ipCnt ? \`黑名单 \${(sec.ipBlacklist || []).length} 条 · 白名单 \${(sec.ipWhitelist || []).length} 条\` : '未配置 IP 访问控制',
        ipCnt ? '已配置' : '未配置', 'sec-ip',
        () => openSecurityDrawer(site.host, 'sec-ip'), '安全防护抽屉 · IP 访问控制'));

      const wafItems = [];
      if (sec.refererMode && sec.refererMode !== 'off') wafItems.push(\`防盗链 \${sec.refererMode === 'whitelist' ? '白名单' : '黑名单'} \${(sec.refererList || []).length} 条\`);
      if ((sec.uaBlacklist || []).length) wafItems.push(\`UA 黑名单 \${(sec.uaBlacklist || []).length} 条\`);
      flow.appendChild(seqStage('🛡️', '②.2 WAF · 自定义规则（UA / Referer）',
        wafItems.length ? wafItems.join(' · ') : '未配置 UA / Referer 校验',
        wafItems.length ? '已配置' : '未配置', 'sec-waf',
        () => openSecurityDrawer(site.host, 'sec-waf'), '安全防护抽屉 · UA黑名单 / 防盗链'));

      const bm = sec.botManagement || {};
      flow.appendChild(seqStage('🤖', '②.3 自动程序（Bot 管理）',
        bm.enabled
          ? \`已启用 · \${bm.mode === 'allowlist' ? '白名单仅放行' : '黑名单拦截'} \${(bm.list || []).length} 条特征\`
          : '未启用 Bot 管理（独立字段 botManagement）',
        bm.enabled ? '已启用' : '未配置', 'sec-bot',
        () => openSecurityDrawer(site.host, 'sec-bot'), '安全防护抽屉 · 自动程序（独立最小任务包）'));

      const su = sec.signedUrl || {};
      flow.appendChild(seqStage('🔑', '②.4 Access · 令牌鉴权（签名 URL）⚠️实验特性',
        su.enabled ? \`已启用 · 参数 \${su.param || 'sign'}\${su.ttl ? ' · 有效期 ' + su.ttl + 's' : ''}\` : '未启用签名 URL',
        su.enabled ? '已启用' : '未配置', 'sec-token',
        () => openSecurityDrawer(site.host, 'sec-token'), '安全防护抽屉 · 签名 URL（内置签发工具待开发）'));

      const rl = sec.rateLimit || {};
      flow.appendChild(seqStage('⏱️', '②.5 速率限制',
        rl.enabled ? \`已启用 · \${rl.rpm || 0} 次/分钟\` : '未启用请求限速',
        rl.enabled ? '已启用' : '未配置', 'sec-ratelimit',
        () => openSecurityDrawer(site.host, 'sec-ratelimit'), '安全防护抽屉 · 请求限速'));

      // ── ③ 首要分流：由负载均衡实际选出一个具体临时回源对象 ───────
      flow.appendChild(seqGroup('③', '首要分流：选出「本次回源对象」（真实推导的具体临时对象）', '不是虚拟占位：单源站 = 该源站本身；源站池 = 按负载均衡策略（chain/roundrobin/随机/加权/IP哈希）实际选出的某一个 oX。这个具体对象即后续 ⑤~⑱ 规则的「回源目标」匹配维度（target=origin / originAddr），可在一条线上用它做多分支。'));
      const defPool = APP_DATA.pools.find((p) => p.id === site.poolId);
      const defKind = defPool ? poolKind(defPool) : '';
      const originId = defPool && defKind === 'single'
        ? (defPool.origins && defPool.origins[0] && defPool.origins[0].id)
        : (defPool ? '按策略选出的 oX' : '');
      flow.appendChild(seqStage('🎯', '③ 本次回源对象（推导·只读）',
        site.poolId
          ? (defPool
            ? (defKind === 'single'
              ? \`单一源站：\${defPool.name || defPool.id} · \${originSummary(defPool)}（回源目标 id=\${defPool.origins && defPool.origins[0] && defPool.origins[0].id}）\`
              : \`源站池：\${defPool.name || defPool.id} · 策略 \${defPool.strategy || 'roundrobin'} · \${(defPool.origins || []).length} 个源站（每次按策略选出一个 oX 作为回源目标）\`)
            : \`源站已被删除或不可用：\${site.poolId}\`)
          : '未设置默认源站',
        site.poolId ? '推导' : '未配置', 'sec-origin',
        // ③ 是由「单站点选定单源站 / 单源站池按负载均衡自动选定」推导出的抽象虚拟临时对象，
        // 本身不可直接干预；如需更改回源对象，应去「① 站点基础 / 源站池」或「⑨ Origin Rules」编辑。
        () => toast('③ 是推导出的临时虚拟回源对象，不可直接编辑。如需更改回源对象，请到「① 匹配站点」改默认源站、到「源站」页编辑源站池，或用「⑨ Origin Rules」规则覆盖。', 'info'),
        null));

      // ── ④ URL 规范化（我们当前未实现，作为只读占位，可跳过）────
      flow.appendChild(seqGroup('④', 'URL 规范化', '把请求 URL 统一成标准形态（大小写、尾部斜杠、查询排序等）。本网关暂未实现该阶段，流量直接跳过进入 ⑤'));
      flow.appendChild(seqStage('🔧', '④ URL 规范化 normalize',
        '本网关暂不支持 URL 规范化，请求原样进入 ⑤ URL 重写阶段。',
        '暂不支持', null, null, null));

      // ── ⑤~⑪ 规则驱动阶段：每个阶段卡片即一个独立规则引擎 ────────
      flow.appendChild(seqGroup('⑤-⑪', '规则驱动阶段（每个阶段 = 一个独立规则引擎）', '流量依次经过这些阶段，每个阶段内部按 priority 降序（从上到下）匹配，命中即跳出本阶段进入下游；站点无设置则回落全站通用规则。多分支用「回源目标」条件表达：在规则匹配里加 target=origin/originAddr（③ 选出的具体源站），如「路径=/img/ 且 回源目标=oX → 动作」，⑦~⑱ 全部共用一条线，⑩⑭ 是真实只读的实际生效结果。'));

      renderRuleStage('⑤', '✂️', 'URL 重写', '按规则改写客户端请求路径（不含源站 pathPrefix）',
        (a) => a.rewrite && a.rewrite.type && a.rewrite.type !== 'none',
        { title: 'URL 重写规则', owner: '路由规则抽屉 · URL 重写', allowedOps: ['rewrite'], hideTargetPool: true, match: (a) => a.rewrite && a.rewrite.type && a.rewrite.type !== 'none' });

      renderRuleStage('⑥', '↪️', '重定向规则', '把请求重定向到其它 URL（命中即终止回源）',
        (a) => a.redirect && a.redirect.enabled,
        { title: '重定向规则', owner: '路由规则抽屉 · 重定向', allowedOps: ['redirect'], hideTargetPool: true, match: (a) => a.redirect && a.redirect.enabled });

      renderRuleStage('⑦', '🔒', '强制 HTTPS / 直接响应（终止型）', '命中 http 返回 301/307 跳 https，或直接用自定义 body/status 响应，不再回源',
        (a) => a.forceHttps || (a.directResponse && a.directResponse.enabled),
        { title: '强制 HTTPS / 直接响应规则', owner: '路由规则抽屉 · 强制HTTPS / 直接响应', allowedOps: ['forceHttps', 'directResponse'], hideTargetPool: true, match: (a) => a.forceHttps || (a.directResponse && a.directResponse.enabled) });

      renderRuleStage('⑧', '📤', '修改请求头', '在回源请求发出去之前增 / 删 / 改 HTTP 头',
        (a) => { const h = a.reqHeaders || {}; return (h.set && Object.keys(h.set).length) || (h.remove || []).length; },
        { title: '修改请求头规则', owner: '路由规则抽屉 · 修改请求头', allowedOps: ['reqHeaders'], hideTargetPool: true, match: (a) => { const h = a.reqHeaders || {}; return (h.set && Object.keys(h.set).length) || (h.remove || []).length; } });

      renderRuleStage('⑨', '🔀', 'Origin Rules', '更改回源目标：回源 Host、回源连接参数（引擎/协议/端口）或候选源站',
        (a) => a.poolId || (a.inlineOrigins || []).length || (a.hostHeader && a.hostHeader.mode && a.hostHeader.mode !== 'accel') || a.engine || a.scheme || Number(a.port) > 0,
        { title: 'Origin Rules', owner: '路由规则抽屉 · Origin Rules', allowedOps: ['hostHeader', 'originConn', 'targetPool'], hideTargetPool: false, match: (a) => a.poolId || (a.inlineOrigins || []).length || (a.hostHeader && a.hostHeader.mode && a.hostHeader.mode !== 'accel') || a.engine || a.scheme || Number(a.port) > 0 });

      // ── ⑩ 确定实际源站（运行时推导，纯只读）──────────────────
      const ovrPool = rules.find((r) => r.action && r.action.poolId);
      const globalOv = !ovrPool && GLOBAL_RULES.find((r) => r.action && r.action.poolId);
      flow.appendChild(seqGroup('⑩', '确定实际源站', '沿用 ③ 首要分流结果，或被 ⑨「Origin Rules」阶段命中的规则覆盖（运行时推导，无独立配置项）'));
      flow.appendChild(seqStage('🧭', '⑩ 实际源站',
        ovrPool
          ? \`存在站点规则覆盖 → \${poolName(ovrPool.action.poolId)}（命中该规则时生效）\`
          : (globalOv
            ? \`站点无覆盖 → 回落全站兜底 → \${poolName(globalOv.action.poolId)}\`
            : \`无规则覆盖 → 沿用 ③ 的 \${site.poolId ? poolName(site.poolId) : '未配置'}\`),
        '推导', null, null, null));

      renderRuleStage('⑪', '📥', 'Cache Rules（缓存请求设置）', '缓存策略（edgeTtl / SWR / browserTtl / 绕过缓存）等请求级缓存设置',
        (a) => a.cache && (a.cache.enabled || a.cache.mode === 'noCache'),
        { title: 'Cache Rules', owner: '路由规则抽屉 · Cache Rules（缓存策略）', allowedOps: ['cache'], hideTargetPool: true, match: (a) => a.cache && (a.cache.enabled || a.cache.mode === 'noCache') });

      // ── ⑫ 缓存键（可干预：站点 cacheGen）──────────────────────
      flow.appendChild(seqGroup('⑫', '缓存键', '合并 policy = 默认 < 源站级 cache < ⑪ Cache Rules；本环节可干预项：站点 cacheGen（代次）。'));
      const cacheRules = rules.filter((r) => r.action && r.action.cache && (r.action.cache.enabled || r.action.cache.mode === 'noCache'));
      const hasCache = cacheRules.some((r) => r.action.cache.enabled);
      flow.appendChild(seqStage('🔖', '⑫ 合并缓存策略 & 构造缓存键',
        \`⑪ 缓存动作 \${cacheRules.length} 条 · 站点 cacheGen=\${site.cacheGen || 0}\${hasCache ? '（已启用节点缓存）' : ''}\`,
        '推导', null, () => openCacheGenDrawer(site.host, cacheRules.length, hasCache), '缓存键抽屉（仅调整 cacheGen 代次）'));

      // ── ⑬ 查边缘缓存（运行时，纯只读）──────────────────────────
      flow.appendChild(seqGroup('⑬', '查缓存', '命中则直接返回（X-Cache: HIT），未命中继续 ⑭ 真正回源。运行时行为。'));
      flow.appendChild(seqStage('⚡', '⑬ 查边缘缓存 cacheMatch',
        '命中则直接返回（响应头 X-Cache: HIT），未命中继续 ⑭ 真正回源。运行时行为，无配置项。',
        '运行时', null, null, null));

      // ── ⑭ 回源循环（此时才真正发出回源请求；可干预：源站/池）────
      const effPoolId = (ovrPool && ovrPool.action.poolId) || (globalOv && globalOv.action.poolId) || site.poolId;
      const pool = APP_DATA.pools.find((p) => p.id === effPoolId);
      const fo = (pool && pool.failover) || {};
      const connRule = rules.find((r) => { const a = r.action || {}; return (a.clientIpHeader && a.clientIpHeader.enabled) || a.originTimeoutMs || a.followRedirect; });
      const gConnRule = !connRule && GLOBAL_RULES.find((r) => { const a = r.action || {}; return (a.clientIpHeader && a.clientIpHeader.enabled) || a.originTimeoutMs || a.followRedirect; });
      flow.appendChild(seqGroup('⑭', '回源循环 requestWithFailover（真正发出回源请求）', '逐个源站尝试；⑤⑨⑧ 各阶段规则在此对每个源站落地；回源连接参数受规则 clientIp / 超时 / 跟随3xx 影响。可干预：源站地址、策略、故障转移。'));
      flow.appendChild(seqStage('🗄️', '⑭ 源站与故障转移',
        pool
          ? (poolKind(pool) === 'single'
            ? \`单一源站 \${pool.name || pool.id} · \${originSummary(pool)} · 重试 \${fo.maxRetries != null ? fo.maxRetries : 2} 次\${connRule || gConnRule ? '（受规则回源参数影响）' : ''}\`
            : \`源站池 \${pool.name || pool.id} · 策略 \${pool.strategy || 'roundrobin'} · \${(pool.origins || []).length} 个源站 · 重试 \${fo.maxRetries != null ? fo.maxRetries : 2} 次\${connRule || gConnRule ? '（受规则回源参数影响）' : ''}\`)
          : '未配置源站',
        pool ? '已配置' : '未配置', null,
        pool ? () => openPoolDrawer(pool.id) : () => openInitialOriginDrawer(site.host, 'sec-origin'),
        pool ? '源站抽屉' : '初始回源对象抽屉 · 源站方式'));

      const subSteps = [
        ['⑭.1 合并本源站配置', '源站级打底 + ⑤⑧⑨ 规则级覆盖，形成回源改写输入'],
        ['⑭.2 构造回源 URL', '落实 ⑤「URL 重写」与 ⑨「Origin Rules」的路径 / Host 改写'],
        ['⑭.3 构造回源请求头', '源站 extraHeaders + ⑧「修改请求头」规则的改写 + 客户端IP'],
        ['⑭.4 选择引擎并发起', 'fetch / socket 引擎按源站配置分派（真正发请求）'],
        ['⑭.5 处理响应 / 异常', '命中 retryOn 状态码或异常 → 换下一源站'],
      ];
      flow.appendChild(el('div', { class: 'seq-substeps' },
        subSteps.map(([t, d]) => el('div', { class: 'seq-substep' }, [
          el('span', { class: 'seq-substep-t', text: t }),
          el('span', { class: 'seq-substep-d', text: d }),
        ]))));

      // ── ⑮ clone ─────────────────────────────────────────────────
      flow.appendChild(seqGroup('⑮', 'clone 原始响应', 'cacheKey 已在 ⑫ 固定，不随 ⑭ 换源变化。运行时行为。'));
      flow.appendChild(seqStage('🧬', '⑮ clone 原始响应',
        'cacheKey 已在 ⑫ 固定，不随 ⑭ 换源变化。运行时行为。', '运行时', null, null, null));

      // ── ⑯ 改写响应头（含 response cache rule）──────────────────
      flow.appendChild(seqGroup('⑯', '改写响应头（含 response cache rule）', '回源响应返回用户前的所有响应头改写，以及 CF 风格 response cache rule（响应级缓存控制）。'));
      renderRuleStage('⑯', '📝', '改写响应头 / Response Cache Rule', '增 / 删 / 改响应头，以及响应级缓存控制（response cache rule）',
        (a) => { const h = a.respHeaders || {}; return (h.set && Object.keys(h.set).length) || (h.remove || []).length; },
        { title: '改写响应头规则', owner: '路由规则抽屉 · 改写响应头 / Response Cache Rule', allowedOps: ['respHeaders'], hideTargetPool: true, match: (a) => { const h = a.respHeaders || {}; return (h.set && Object.keys(h.set).length) || (h.remove || []).length; } });

      // ── ⑰ 写缓存 ───────────────────────────────────────────────
      flow.appendChild(seqGroup('⑰', '写边缘缓存', '按 ⑫ 的 cacheKey 写入 ⑪ 定义的缓存策略。'));
      flow.appendChild(seqStage('💾', '⑰ 写边缘缓存',
        hasCache ? '应用 ⑪「Cache Rules」的缓存策略，按 ⑫ 的 cacheKey 写入。' : '未启用缓存，跳过写入。',
        '运行时', null, null, null));

      // ── ⑱ 返回用户 ─────────────────────────────────────────────
      flow.appendChild(seqGroup('⑱', '返回最终用户', '统一注入品牌响应头并记录统计，固定行为。'));
      flow.appendChild(seqStage('👤', '⑱ 响应 & 最终用户',
        '统一注入品牌响应头 Server: EdgeGateway、Via: 1.1 EdgeGateway，并记录统计。固定行为。',
        '固定', null, null, null));

      return { ruleNodes, rules };
    }

    // 拖拽排序：松手后重算 priority（降序）并保存
    function wireRuleDrag(ruleNodes, rules, site) {
      let dragNode = null;
      const clearMarks = () => ruleNodes.forEach(({ node }) =>
        node.classList.remove('drop-before', 'drop-after', 'dragging'));

      ruleNodes.forEach(({ node, index }) => {
        node.addEventListener('dragstart', (e) => {
          dragNode = node;
          node.classList.add('dragging');
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', String(index));
        });
        node.addEventListener('dragend', clearMarks);
        node.addEventListener('dragover', (e) => {
          e.preventDefault();
          if (node === dragNode) return;
          const rect = node.getBoundingClientRect();
          const after = e.clientY > rect.top + rect.height / 2;
          clearMarks();
          dragNode && dragNode.classList.add('dragging');
          node.classList.add(after ? 'drop-after' : 'drop-before');
        });
        node.addEventListener('drop', async (e) => {
          e.preventDefault();
          if (!dragNode || dragNode === node) return;
          const from = Number(e.dataTransfer.getData('text/plain'));
          const to = index;
          const moved = rules.splice(from, 1)[0];
          rules.splice(to, 0, moved);
          const updated = {
            ...site,
            rules: rules.map((r, i) => ({ ...r, priority: (rules.length - i) * 10 })),
          };
          // 同步内存，便于切换站点后保持一致
          const idx = APP_DATA.sites.findIndex((s) => s.host === site.host);
          if (idx >= 0) APP_DATA.sites[idx] = updated;
          try {
            await API.sites.save(site.host, updated);
            render(hostSel.value);
            toast('已保存规则优先级', 'ok');
          } catch (err) {
            toast('保存失败：' + (err && err.message ? err.message : '未知错误'), 'err');
            render(hostSel.value);
          }
        });
      });
    }

    // 全部站点总览：每个域名一个分组，列出其完整序列
    function renderAll() {
      APP_DATA.sites.forEach((site) => {
        const sec = site.security || {};
        const secOn = ['refererMode', 'uaBlacklist', 'ipBlacklist', 'ipWhitelist', 'signedUrl', 'rateLimit', 'botManagement']
          .some((k) => {
            if (k === 'refererMode') return sec.refererMode && sec.refererMode !== 'off';
            if (k === 'signedUrl' || k === 'rateLimit' || k === 'botManagement') return sec[k] && sec[k].enabled;
            return (sec[k] || []).length;
          });
        flow.appendChild(el('div', { class: 'seq-site-head' }, [
          el('div', { class: 'seq-site-name', text: site.host }),
          el('div', { class: 'seq-site-meta' }, [
            el('span', { class: 'seq-chip', text: \`\${(site.rules || []).length} 条规则\` }),
            el('span', { class: 'seq-chip', text: secOn ? '安全已启用' : '安全未配置' }),
            site.poolId ? el('span', { class: 'seq-chip', text: '源站 ' + poolName(site.poolId) }) : null,
            el('span', { class: 'seq-go seq-site-go', text: '编辑站点 →' }),
          ]),
          el('div', { class: 'seq-site-click', onclick: () => openSiteDrawer(site.host) }),
        ]));
        renderSite(site, false);
      });
    }

    const render = (host) => {
      clear(flow);
      if (host === ALL) { renderAll(); return; }
      if (host === '__global__') { renderGlobal(); return; }
      const site = APP_DATA.sites.find((s) => s.host === host) || APP_DATA.sites[0];
      if (!site) return;
      const { ruleNodes, rules } = renderSite(site, true);
      wireRuleDrag(ruleNodes, rules, site);
    };

    // 全站通用规则（兜底）视图：对所有站点生效、优先级最低
    function renderGlobal() {
      const gRules = GLOBAL_RULES.slice();
      // 全站通用规则视图：同样按 18 阶段展示，每阶段列出属于该阶段的全局规则（OR：从上到下匹配）
      // 全站规则是兜底默认，无更上级兜底；点击阶段或规则进入全局规则编辑器。
      function gStage(no, icon, title, stageSummary, matchFn) {
        const matched = gRules.filter((r) => { try { return matchFn(r.action || {}); } catch { return false; } });
        const summary = matched.length
          ? \`\${matched.length} 条规则（按优先级从上到下匹配，命中即跳出本阶段）；\${stageSummary}\`
          : \`未配置；\${stageSummary}\`;
        flow.appendChild(seqStage(icon, \`\${no} \${title}\`, summary, matched.length ? \`\${matched.length} 条\` : '未配置', 'sec-rules',
          () => openGlobalRulesDrawer(), '全站通用规则编辑器'));
        if (matched.length) {
          flow.appendChild(el('div', { class: 'seq-rule-list' }, matched.map((r) => {
            const condCount = (r.match && r.match.conditions || []).reduce((n, g) => n + g.length, 0)
              + Object.keys(legacyMatchFields(r.match || {})).length;
            const node = seqRuleInPack(r, ruleSubs(r), condCount, '__global__', false);
            return node;
          })));
        }
      }

      flow.appendChild(seqGroup('全站', '全站通用规则（兜底默认）', '以下规则对任何站点都生效，仅当站点自身规则未命中时才触发，相当于全局默认设置。按 18 阶段分布，每个阶段内部按优先级降序 OR 匹配。'));

      flow.appendChild(seqStage('🛰️', '① 匹配站点', '全站规则不参与匹配站点，仅作为兜底作用于已命中的站点。', '—', null, null, null));

      flow.appendChild(seqGroup('②-③', '安全 / 首要分流（全站维度）', '全站通用规则当前不承载安全包与源站选择，阶段显示空。'));
      flow.appendChild(seqStage('🚧', '②.1~②.5 安全包', '全站通用规则暂不含安全配置，安全在各站点自身配置。', '未配置', null, null, null));
      flow.appendChild(seqStage('🎯', '③ 初始回源对象', '全站通用规则不选择初始源站，源站由各站点自身决定。', '未配置', null, null, null));
      flow.appendChild(seqStage('🔧', '④ URL 规范化', '全站通用规则暂不支持 URL 规范化。', '暂不支持', null, null, null));

      flow.appendChild(seqGroup('⑤-⑪', '规则驱动阶段（全站兜底）', '各阶段全站兜底规则；站点序列某阶段无设置时，即实际生效这些规则。'));
      gStage('⑤', '✂️', 'URL 重写', '按规则改写客户端请求路径', (a) => a.rewrite && a.rewrite.type && a.rewrite.type !== 'none');
      gStage('⑥', '↪️', '重定向规则', '把请求重定向到其它 URL', (a) => a.redirect && a.redirect.enabled);
      gStage('⑦', '🔒', '强制 HTTPS / 直接响应', '命中 http 跳 https，或直接响应', (a) => a.forceHttps || (a.directResponse && a.directResponse.enabled));
      gStage('⑧', '📤', '修改请求头', '回源前增删改 HTTP 头', (a) => { const h = a.reqHeaders || {}; return (h.set && Object.keys(h.set).length) || (h.remove || []).length; });
      gStage('⑨', '🔀', 'Origin Rules', '改回源 Host / 回源连接参数 / 候选源站', (a) => a.poolId || (a.inlineOrigins || []).length || (a.hostHeader && a.hostHeader.mode && a.hostHeader.mode !== 'accel') || a.engine || a.scheme || Number(a.port) > 0);
      gStage('⑪', '📥', 'Cache Rules（缓存请求设置）', '缓存策略等请求级缓存设置', (a) => a.cache && (a.cache.enabled || a.cache.mode === 'noCache'));
      gStage('⑯', '📝', '改写响应头 / Response Cache Rule', '响应头改写与响应级缓存控制', (a) => { const h = a.respHeaders || {}; return (h.set && Object.keys(h.set).length) || (h.remove || []).length; });

      flow.appendChild(seqGroup('⑫-⑱', '缓存 / 回源 / 响应（运行时）', '全站兜底规则在此被应用；以下为运行时推导行为。'));
      flow.appendChild(seqStage('🔖', '⑫ 缓存键', '合并 policy 时，全站规则的缓存动作作为最低优先级兜底。', '推导', null, null, null));
      flow.appendChild(seqStage('⚡', '⑬ 查缓存', '运行时行为。', '运行时', null, null, null));
      flow.appendChild(seqStage('🗄️', '⑭ 回源循环', '受全站规则的回源连接参数影响。', '运行时', null, null, null));
      flow.appendChild(seqStage('🧬', '⑮ clone', '运行时行为。', '运行时', null, null, null));
      flow.appendChild(seqStage('💾', '⑰ 写缓存', '按 ⑪ 全站缓存策略写入。', '运行时', null, null, null));
      flow.appendChild(seqStage('👤', '⑱ 返回用户', '固定行为。', '固定', null, null, null));

      const btn = el('button', { class: 'btn', text: '编辑全站通用规则' });
      btn.onclick = () => openGlobalRulesDrawer();
      flow.appendChild(el('div', { class: 'seq-tools' }, [btn]));
    }

    hostSel.addEventListener('change', () => render(hostSel.value));
    render(initHost);
    return wrap;
  }

  // 流量序列：阶段分组标题（对应 11-request-flow.md 的 ①②③… 大阶段）
  function seqGroup(no, title, desc) {
    return el('div', { class: 'seq-group' }, [
      el('span', { class: 'seq-group-no', text: no }),
      el('div', { class: 'seq-group-main' }, [
        el('div', { class: 'seq-group-title', text: title }),
        desc ? el('div', { class: 'seq-group-desc', text: desc }) : null,
      ]),
    ]);
  }

  // 流量序列：单个阶段卡片。owner = 该最小任务包归属的抽屉（片段边界，一包一抽屉）
  function seqStage(icon, title, summary, badge, anchor, onClick, owner) {
    const off = badge === '未配置' || badge === '未使用' || badge === '已停用';
    const node = el('div', { class: 'seq-stage' + (onClick ? ' clickable' : '') }, [
      el('div', { class: 'seq-icon', text: icon }),
      el('div', { class: 'seq-main' }, [
        el('div', { class: 'seq-title' }, [
          el('span', {}, title),
          badge != null ? el('span', { class: 'seq-badge ' + (off ? 'off' : 'on') }, badge) : null,
        ]),
        el('div', { class: 'seq-summary', text: summary }),
        owner ? el('div', { class: 'seq-owner', text: '归属：' + owner }) : null,
      ]),
      onClick ? el('div', { class: 'seq-go', text: '前往设置 →' }) : null,
    ]);
    if (onClick) node.onclick = onClick;
    return node;
  }

  // 流量序列：挂在 ④ 规则引擎环节下的具体规则节点。点击打开规则编辑器
  // （整条规则及其所有 action 都在此编辑，不按 action 类型拆子环节）。
  // draggable=true 时整体可拖拽（手柄 + draggable 属性），用于调整优先级。
  function seqRuleInPack(rule, subs, condCount, host, draggable) {
    const a = rule.action || {};
    const head = el('div', { class: 'seq-rule-head' }, [
      draggable ? el('span', { class: 'seq-grip', title: '拖拽调整优先级', text: '⠿' }) : null,
      el('span', { class: 'seq-rule-prio', text: 'P' + (rule.priority || 0) }),
      el('span', { class: 'seq-rule-name', text: (rule.name || (rule.id ? '#' + rule.id : '规则')) + (a.poolId ? ' → ' + poolName(a.poolId) : '') }),
      el('span', { class: 'seq-badge ' + (rule.enabled === false ? 'off' : 'on'), text: rule.enabled === false ? '停用' : '启用' }),
    ]);
    const sub = el('div', { class: 'seq-subs' },
      (subs.length ? subs : ['（无动作，仅作为匹配占位）']).map((s) => el('span', { class: 'seq-chip', text: s })));
    const node = el('div', { class: 'seq-stage seq-rule seq-rule-inpack' + (rule.enabled === false ? ' disabled' : '') + (draggable ? ' seq-rule-drag' : '') }, [
      el('div', { class: 'seq-icon', text: '↳' }),
      el('div', { class: 'seq-main' }, [
        head,
        rule.note ? el('div', { class: 'seq-note muted', text: rule.note }) : null,
        el('div', { class: 'seq-summary', text: \`匹配条件：\${condCount} 项\${condCount ? '（命中即执行下列动作）' : '（匹配全部请求）'}\` }),
        sub,
      ]),
      el('div', { class: 'seq-go', text: '编辑规则 →' }),
    ]);
    if (draggable) node.draggable = true;
    node.onclick = () => openRulesDrawer(host);
    return node;
  }

  // ---------------------------------------------------------------------------
  // 通用子组件
  // ---------------------------------------------------------------------------

  // 键值对头部编辑器（set）+ 删除列表（remove）
  // 返回 { root, read() }，read() 返回 { set:{}, remove:[] }
  function headerEditor(initial) {
    initial = initial || { set: {}, remove: [] };
    const setWrap = el('div', { class: 'kv-list' });
    const removeWrap = el('div', { class: 'kv-list' });
    const read = () => {
      const set = {};
      Array.from(setWrap.children).forEach((row) => {
        const k = $('.hk', row).value.trim();
        const v = $('.hv', row).value;
        if (k) set[k] = v;
      });
      const remove = [];
      Array.from(removeWrap.children).forEach((row) => {
        const k = $('.hk', row).value.trim();
        if (k) remove.push(k);
      });
      return { set, remove };
    };
    const addKv = (wrap, k0, v0, withVal) => {
      const row = el('div', { class: 'kv-row' }, [
        el('input', { class: 'input hk', value: k0 || '', placeholder: 'Header-Name' }),
        withVal ? el('input', { class: 'input hv', value: v0 || '', placeholder: 'value' }) : el('span', { class: 'muted', text: '(移除)' }),
        el('button', { class: 'btn btn-sm btn-danger', text: '×', onclick: () => row.remove() }),
      ]);
      wrap.appendChild(row);
    };
    Object.keys(initial.set || {}).forEach((k) => addKv(setWrap, k, initial.set[k], true));
    (initial.remove || []).forEach((k) => addKv(removeWrap, k, '', false));
    if (!setWrap.children.length) addKv(setWrap, '', '', true);
    if (!removeWrap.children.length) addKv(removeWrap, '', '', false);
    const root = el('div', { class: 'header-editor' }, [
      el('div', { class: 'kv-label' }, '新增 / 修改（把某个请求头设成指定值）：'),
      setWrap,
      el('button', { class: 'btn btn-sm', text: '+ 添加', onclick: () => addKv(setWrap, '', '', true) }),
      el('div', { class: 'kv-label' }, '删除（回源 / 返回时去掉某个请求头）：'),
      removeWrap,
      el('button', { class: 'btn btn-sm', text: '+ 添加', onclick: () => addKv(removeWrap, '', '', false) }),
      el('div', { class: 'field-hint muted', text: '请求头就像信封上的备注。回源请求头在请求发给源站前改；节点响应头在结果返回给用户前改。不知道填什么可留空。' }),
    ]);
    root.__read = read;
    return { root, read };
  }

  // 折叠分区（功能分组卡片样式）
  function section(title, desc, children) {
    const body = el('div', { class: 'section-body' }, children);
    const head = el('div', { class: 'section-toggle' }, [
      el('span', { class: 'tw', text: '▸' }),
      el('strong', {}, title),
      desc ? el('span', { class: 'muted', text: ' ' + desc }) : null,
    ]);
    const wrap = el('div', { class: 'subcard' }, [head, body]);
    head.onclick = () => wrap.classList.toggle('collapsed');
    return wrap;
  }

  // 规则操作子模块：默认折叠，仅在「已启用」时展开。
  // watch 为控制开启的控件（checkbox / select）；勾选或切换到非 off 时自动展开，
  // 避免把所有操作的参数一股脑全列出来让用户误以为都要填。
  function opSection(key, title, desc, opts, children) {
    const body = el('div', { class: 'section-body' }, children);
    const head = el('div', { class: 'section-toggle' }, [
      el('span', { class: 'tw', text: '▸' }),
      el('strong', {}, title),
      desc ? el('span', { class: 'muted', text: ' ' + desc }) : null,
    ]);
    const wrap = el('div', { class: 'subcard', id: 'op-' + key }, [head, body]);
    const isOn = () => opts.watch
      ? (opts.watch.type === 'checkbox' ? opts.watch.checked : !!opts.watch.value && opts.watch.value !== 'off')
      : !!opts.enabled;
    if (!isOn()) wrap.classList.add('collapsed');
    head.onclick = () => wrap.classList.toggle('collapsed');
    if (opts.watch) {
      opts.watch.addEventListener('change', () => { if (isOn()) wrap.classList.remove('collapsed'); });
    }
    return wrap;
  }

  // 匹配对象 / 操作符清单
  const MATCH_TARGET_OPTS = [
    { value: 'host', label: 'Host（客户端请求域名）' },
    { value: 'path', label: 'URL 路径' },
    { value: 'fullUrl', label: '完整 URL（含协议、域名、路径、参数）' },
    { value: 'query', label: '查询字符串（Query String）' },
    { value: 'extension', label: '文件后缀' },
    { value: 'filename', label: '文件名称' },
    { value: 'directory', label: '目录' },
    { value: 'method', label: '请求方法' },
    { value: 'protocol', label: '请求协议（HTTP/HTTPS）' },
    { value: 'header', label: '请求头' },
    { value: 'cookie', label: 'Cookie' },
    { value: 'clientIp', label: '客户端 IP' },
    { value: 'clientCountry', label: '客户端地理位置（国家/地区）' },
    { value: 'userAgent', label: 'User-Agent（客户端浏览器标识）' },
    { value: 'referer', label: 'Referer（来源页面）' },
    { value: 'origin', label: '回源目标（源站 ID，由 ③ 首要分流按负载均衡选出）' },
    { value: 'originAddr', label: '回源目标地址（源站 addr，由 ③ 首要分流选出）' },
  ];
  // 运算符对齐 EO 的「运算符」下拉：等于 / 不等于 / 包含 / 正则匹配 / 正则不匹配 / 存在 / 不存在 等
  const MATCH_OP_OPTS = [
    { value: 'equal', label: '等于' },
    { value: 'notEqual', label: '不等于' },
    { value: 'contain', label: '包含' },
    { value: 'notContain', label: '不包含' },
    { value: 'prefix', label: '前缀为' },
    { value: 'notPrefix', label: '前缀不为' },
    { value: 'suffix', label: '后缀为' },
    { value: 'notSuffix', label: '后缀不为' },
    { value: 'regex', label: '正则匹配' },
    { value: 'notRegex', label: '正则不匹配' },
    { value: 'exists', label: '存在' },
    { value: 'notExists', label: '不存在' },
  ];
  const TARGETS_WITH_KEY = ['header', 'cookie', 'query'];
  const OPS_NO_VALUE = ['exists', 'notExists'];

  // 单个条件行：[匹配对象] [键名] [操作符] [值] [忽略大小写] [删除]
  function conditionRow(cond, onRemove) {
    cond = cond || { target: 'path', op: 'prefix', values: [], key: '', ignoreCase: true };
    const tSel = select('', MATCH_TARGET_OPTS, cond.target || 'path');
    tSel.className = 'input';
    const keyInput = el('input', { class: 'input', value: cond.key || '', placeholder: '键名' });
    const opSel = select('', MATCH_OP_OPTS, cond.op || 'prefix');
    opSel.className = 'input';
    const valInput = el('input', {
      class: 'input',
      value: (cond.values || []).join(', '),
      placeholder: '多个值用逗号分隔（之间为“或”）',
    });
    const icCb = el('input', { type: 'checkbox', checked: cond.ignoreCase !== false });
    const valHint = el('span', { class: 'field-hint muted' });

    const keyWrap = el('div', { class: 'cond-cell' }, [keyInput]);
    const valWrap = el('div', { class: 'cond-cell' }, [valInput, valHint]);

    // 运算符对应的填写示例，帮小白看懂“值”该写什么
    const OP_EXAMPLES = {
      equal: '例如填 /index.html 表示路径恰好等于它',
      notEqual: '例如填 /admin 表示路径不是它',
      contain: '例如填 /api 表示路径里包含 /api',
      notContain: '例如填 /private 表示路径不含 /private',
      prefix: '例如填 /img 表示以 /img 开头',
      notPrefix: '例如填 /old 表示不以 /old 开头',
      suffix: '例如填 .php 表示以 .php 结尾',
      notSuffix: '例如填 .css 表示不以 .css 结尾',
      regex: '例如 ^/old/(.*) 表示匹配 /old/ 下的路径；^(.*)$ 表示匹配整条路径（可用 $1 引用）',
      notRegex: '例如 ^/admin 表示不匹配以 /admin 开头',
      exists: '无需填值，只要这个头/参数存在就命中',
      notExists: '无需填值，只要这个头/参数不存在就命中',
    };
    const KEY_HINTS = {
      header: '要匹配的请求头名称，如 User-Agent',
      cookie: '要匹配的 Cookie 名称，如 session',
      query: '要匹配的查询参数名，如 id',
    };
    const ORIGIN_HINT = '回源目标 = ③ 首要分流按负载均衡实际选出的源站。可选源站 ID（exact 匹配）或源站地址（支持包含/前缀/正则）。例如源站池里有 3 个源站，就分别用 3 个「回源目标」条件做分支，⑦~⑱ 共用一条线、⑩⑭ 为真实只读结果。';

    // key 仅对 header/cookie/query 有意义；exists/notExists 不需要值
    const sync = () => {
      const needKey = TARGETS_WITH_KEY.includes(tSel.value);
      keyWrap.style.display = needKey ? '' : 'none';
      keyInput.placeholder = needKey ? (KEY_HINTS[tSel.value] || '键名') : '键名';
      valWrap.style.display = OPS_NO_VALUE.includes(opSel.value) ? 'none' : '';
      valHint.textContent = OPS_NO_VALUE.includes(opSel.value)
        ? ''
        : (tSel.value === 'origin' || tSel.value === 'originAddr')
          ? ORIGIN_HINT
          : (OP_EXAMPLES[opSel.value] || '');
    };
    tSel.onchange = sync;
    opSel.onchange = sync;
    sync();

    const row = el('div', { class: 'cond-row' }, [
      tSel,
      keyWrap,
      opSel,
      valWrap,
      el('label', { class: 'check', title: '不区分大小写（如 Path 与 path 视为相同）' }, [icCb, el('span', { text: '不区分大小写' })]),
      el('button', { class: 'btn btn-sm btn-danger', text: '×', onclick: () => { row.remove(); onRemove && onRemove(); } }),
    ]);

    // 读取该行的当前值（供条件组编辑器汇总）。
    // 缺失此返回值会导致 conditionsEditor 解构得到 undefined，规则编辑器一打开即崩溃。
    const read = () => {
      const value = valInput.value;
      const values = value
        ? value.split(',').map((s) => s.trim()).filter(Boolean)
        : [];
      return {
        target: tSel.value,
        op: opSel.value,
        key: keyInput.value.trim(),
        values,
        ignoreCase: icCb.checked,
      };
    };
    return { row, read };
  }

  // 条件组编辑器：外层 OR，内层 AND
  function conditionsEditor(groups) {
    groups = Array.isArray(groups) && groups.length ? groups : [];
    const wrap = el('div', { class: 'cond-groups' });
    const readers = [];

    const addGroup = (conds) => {
      const rows = el('div', { class: 'cond-rows' });
      const groupReaders = [];
      const entry = { readers: groupReaders };

      const addCond = (c) => {
        const { row, read } = conditionRow(c, () => {
          const i = groupReaders.indexOf(read);
          if (i >= 0) groupReaders.splice(i, 1);
        });
        groupReaders.push(read);
        rows.appendChild(row);
      };

      (conds && conds.length ? conds : [null]).forEach(addCond);

      const box = el('div', { class: 'cond-group' }, [
        el('div', { class: 'cond-group-head' }, [
          el('span', { class: 'badge', text: '且（AND）' }),
          el('button', { class: 'btn btn-sm', text: '+ 条件', onclick: () => addCond(null) }),
          el('button', {
            class: 'btn btn-sm btn-danger',
            text: '删除条件组',
            onclick: () => {
              box.remove();
              const i = readers.indexOf(entry);
              if (i >= 0) readers.splice(i, 1);
            },
          }),
        ]),
        rows,
      ]);
      readers.push(entry);
      wrap.appendChild(box);
    };

    groups.forEach(addGroup);

    const root = el('div', {}, [
      el('div', { class: 'muted', text: '条件组之间为「或（OR）」关系，组内条件之间为「且（AND）」关系。不添加任何条件时匹配全部请求。' }),
      wrap,
      el('button', { class: 'btn btn-sm', text: '+ 添加条件组（或）', onclick: () => addGroup(null) }),
    ]);

    const read = () =>
      readers
        .map((g) => g.readers.map((r) => r()).filter((c) => c.op && c.target))
        .filter((g) => g.length > 0);

    return { root, read };
  }

  // 把秒数翻译成人话（约 X 天/小时），小白更容易理解
  function humanDuration(sec) {
    sec = Number(sec) || 0;
    if (sec <= 0) return '';
    if (sec >= 86400) return \`（约 \${Math.round(sec / 86400)} 天）\`;
    if (sec >= 3600) return \`（约 \${Math.round(sec / 3600)} 小时）\`;
    if (sec >= 60) return \`（约 \${Math.round(sec / 60)} 分钟）\`;
    return \`（\${sec} 秒）\`;
  }

  // 缓存策略编辑器（对齐 EO 缓存配置 + 自定义 Cache Key）
  function cacheEditor(c) {
    c = c || {};
    const key = c.key || {};
    const mode = select('', [
      { value: 'ttl', label: '自定义缓存时间（推荐新手）' },
      { value: 'origin', label: '跟随源站 Cache-Control' },
      { value: 'noCache', label: '不缓存（每次回源）' },
    ], c.mode || 'ttl');
    mode.className = 'input';
    const edge = el('input', { class: 'input', type: 'number', value: c.edgeTtl != null ? c.edgeTtl : 15552000, placeholder: '秒' });
    const browser = el('input', { class: 'input', type: 'number', value: c.browserTtl != null ? c.browserTtl : 1800, placeholder: '秒，-1=跟随源站' });
    const edgeHint = el('span', { class: 'field-hint muted' });
    const browserHint = el('span', { class: 'field-hint muted' });
    const iq = el('input', { type: 'checkbox', checked: c.ignoreQuery !== false });
    const qw = el('input', { class: 'input', value: (c.queryWhitelist || []).join(', '), placeholder: '如 id, page（留空=全部保留）' });

    // 自定义 Cache Key
    const ckCase = el('input', { type: 'checkbox', checked: !!key.ignoreCase });
    const ckScheme = el('input', { type: 'checkbox', checked: !!key.includeScheme });
    const ckHeaders = el('input', { class: 'input', value: (key.headers || []).join(', '), placeholder: '如 accept-language' });
    const ckCookies = el('input', { class: 'input', value: (key.cookies || []).join(', '), placeholder: '如 tier' });

    // 高级
    const statusTtl = el('input', {
      class: 'input',
      value: Object.entries(c.statusTtl || {}).map(([k, v]) => k + ':' + v).join(', '),
      placeholder: '如 404:10, 500:5',
    });
    const preRefresh = el('input', { type: 'checkbox', checked: !!c.preRefresh });
    const preP = el('input', { class: 'input', type: 'number', value: c.preRefreshPercent || 80, placeholder: '%' });
    const offline = el('input', { type: 'checkbox', checked: !!c.offlineCache });

    const refreshHints = () => {
      edgeHint.textContent = '节点保存多久再回源' + humanDuration(edge.value);
      browserHint.textContent = '浏览器本地缓存多久（用户重复访问更快）' + humanDuration(browser.value);
    };
    edge.addEventListener('input', refreshHints);
    browser.addEventListener('input', refreshHints);
    refreshHints();

    const ttlBox = el('div', { class: 'grid2' }, [
      field('边缘缓存时长（秒）', edge, edgeHint.textContent),
      field('浏览器缓存时长（秒，-1=跟随源站）', browser, browserHint.textContent),
    ]);
    // 提前刷新百分比：只有开启「提前回源刷新」时才有意义
    const prePField = field('提前刷新触发时机（剩余百分比）', preP, '例如 80 表示缓存还剩 20% 有效期时就开始后台刷新。');
    const syncPre = () => { prePField.style.display = preRefresh.checked ? '' : 'none'; };
    preRefresh.addEventListener('change', syncPre);
    syncPre();
    // 仅当「不忽略查询串」时才需要填白名单
    // 关键：必须持有 field() 返回的容器节点引用，不能用 qw.parentElement —— 此刻
    // qw 尚未插入任何父节点，parentElement 为 null，直接取 .style 会抛
    // TypeError 并中断整个 cacheEditor / 抽屉渲染（表现为按钮点了没反应）
    const qwField = field('只保留这些查询参数（其余忽略）', qw, '关闭「忽略查询参数」后才需要填；例如 id,page，留空表示保留全部。');
    const syncIQ = () => { qwField.style.display = iq.checked ? 'none' : ''; };
    iq.addEventListener('change', syncIQ);
    syncIQ();

    // 「不缓存」模式下，以下全部与缓存相关的字段都无意义，整体隐藏
    const cacheDetail = el('div', {}, [
      ttlBox,
      el('div', { class: 'grid2' }, [
        el('label', { class: 'check' }, [iq, el('span', { text: '忽略 URL 里的查询参数 ?x=1（推荐开启，命中率更高）' })]),
        el('label', { class: 'check' }, [ckCase, el('span', { text: '缓存键不区分大小写' })]),
      ]),
      qwField,
      section('自定义缓存区分维度', '默认按 URL 缓存即可；此项仅在「同一网址但不同内容」时才用', [
        el('div', { class: 'grid2' }, [
          el('label', { class: 'check' }, [ckScheme, el('span', { text: '区分 http 与 https 为两份缓存' })]),
        ]),
        field('额外按请求头来区分（逗号分隔）', ckHeaders, '例如 accept-language，常用于多语言站点。一般不用填。'),
        field('额外按 Cookie 来区分（逗号分隔）', ckCookies, '例如 tier（会员等级）。一般不用填。'),
      ]),
      section('高级缓存', '状态码缓存 / 预刷新 / 离线兜底——一般用不到，保持默认即可', [
        field('给错误页也加缓存（格式 码:秒，逗号分隔）', statusTtl, '例如 404:10 表示 404 页面也缓存 10 秒，减轻源站压力。'),
        el('div', { class: 'grid2' }, [
          el('label', { class: 'check' }, [preRefresh, el('span', { text: '缓存即将过期时提前回源刷新' })]),
          el('label', { class: 'check' }, [offline, el('span', { text: '源站挂了就用旧缓存顶着' })]),
        ]),
        prePField,
      ]),
    ]);
    // 只有「自定义缓存时间」才需要填 TTL；「不缓存」则隐藏所有缓存细节
    const syncMode = () => {
      const noCache = mode.value === 'noCache';
      cacheDetail.style.display = noCache ? 'none' : '';
      ttlBox.style.display = mode.value === 'ttl' ? '' : 'none';
    };
    mode.onchange = syncMode;
    syncMode();

    const root = el('div', {}, [
      field('缓存模式', mode, '自定义缓存时间：固定存多久；跟随源站：由源站响应头决定；不缓存：每次都回源（适合动态内容）。'),
      cacheDetail,
    ]);

    const read = () => {
      const st = {};
      statusTtl.value.split(',').map((s) => s.trim()).filter(Boolean).forEach((pair) => {
        const [k, v] = pair.split(':').map((x) => (x || '').trim());
        if (k && v && !isNaN(Number(k)) && !isNaN(Number(v))) st[k] = Number(v);
      });
      return {
        enabled: mode.value !== 'noCache',
        mode: mode.value,
        edgeTtl: Number(edge.value) || 0,
        browserTtl: browser.value === '' ? 0 : Number(browser.value),
        ignoreQuery: iq.checked,
        queryWhitelist: qw.value.split(',').map((s) => s.trim()).filter(Boolean),
        key: {
          ignoreCase: ckCase.checked,
          includeScheme: ckScheme.checked,
          headers: ckHeaders.value.split(',').map((s) => s.trim()).filter(Boolean),
          cookies: ckCookies.value.split(',').map((s) => s.trim()).filter(Boolean),
        },
        statusTtl: st,
        preRefresh: preRefresh.checked,
        preRefreshPercent: Number(preP.value) || 80,
        offlineCache: offline.checked,
      };
    };
    return { root, read };
  }

  // 重写编辑器
  // 路径重写的纯前端预览（与 src/proxy/rewrite.js 的 applyRewrite 保持一致）
  function previewRewrite(pathname, rewrite) {
    const type = rewrite && rewrite.type || 'none';
    let out = pathname || '/';
    try {
      if (type === 'prefix') {
        const v = (rewrite.value || '').replace(/\\/+$/, '');
        const right = (out || '').replace(/^\\/+/, '');
        out = (v ? \`\${v}/\${right || ''}\` : \`/\${right}\`);
      } else if (type === 'strip') {
        const v = rewrite.value || '';
        if (v && out.startsWith(v)) out = out.slice(v.length);
      } else if (type === 'regex') {
        const re = new RegExp(rewrite.regexFrom || '', 'g');
        out = out.replace(re, rewrite.regexTo ?? '');
      }
    } catch { out = pathname; }
    if (!out.startsWith('/')) out = \`/\${out}\`;
    out = out.replace(/\\/{2,}/g, '/');
    return out || '/';
  }

  function rewriteEditor(r) {
    r = r || { type: 'none', value: '', regexFrom: '', regexTo: '' };
    const TYPES = {
      none:   { label: '不重写（保持原路径）', desc: '客户端请求什么路径，就回源什么路径。绝大多数情况选这个即可。' },
      prefix: { label: '前缀替换（在路径前加一段）', desc: '把请求路径整体“搬”到一个新目录下，例如把 /img/x.png 变成 /api/img/x.png。' },
      strip:  { label: '去除前缀（去掉开头的某段）', desc: '剥掉路径开头的固定前缀，例如把 /img/x.png 变成 /x.png（常用于隐藏子目录）。' },
      regex:  { label: '正则重写（高级，按规则改写）', desc: '用正则表达式把路径的一部分替换为另一段，适合批量/复杂改写。不懂正则也没关系，下面给了几个最常⻏又好用的简单示例，点一下就能套用。' },
    };
    const typeSel = select('', [], r.type || 'none', Object.entries(TYPES).map(([v, t]) => ({ value: v, label: t.label })));
    typeSel.className = 'input';
    const desc = el('div', { class: 'rw-desc muted' });
    const valueInput = el('input', { class: 'input rw-val', value: r.value || '', placeholder: '例如 /api 或 /img' });
    const fromInput = el('input', { class: 'input rw-from', value: r.regexFrom || '', placeholder: '例如 ^/old/(.*)' });
    const toInput = el('input', { class: 'input rw-to', value: r.regexTo || '', placeholder: '例如 /new/$1' });
    const fieldsBox = el('div', { class: 'rw-fields' });
    // 示例请求路径：仅用于本地预览，不写入规则配置（避免被误当成真实字段填写）
    const sampleInput = el('input', { class: 'input', value: '/img/photo.png', placeholder: '示例路径，仅用于预览，不会保存' });
    // 预览结果：只读展示，用户不可修改（不是编辑框）
    const previewBox = el('code', { class: 'rw-preview' });

    function renderFields() {
      const t = typeSel.value;
      desc.textContent = TYPES[t].desc;
      fieldsBox.innerHTML = '';
      if (t === 'prefix' || t === 'strip') {
        fieldsBox.appendChild(field(t === 'prefix' ? '要添加 / 去除的路径前缀' : '要去除的开头前缀', valueInput));
        fieldsBox.appendChild(el('div', { class: 'rw-example muted', text: t === 'prefix'
          ? '示例：填 /api，则 /img/x.png → /api/img/x.png'
          : '示例：填 /img，则 /img/x.png → /x.png' }));
      } else if (t === 'regex') {
        fieldsBox.appendChild(field('匹配规则（源正则）', fromInput));
        fieldsBox.appendChild(field('替换为（目标，可用 $1 $2 引用分组）', toInput));
        // 小白友好的常用简单示例：点一下即可套用（源正则 + 目标）
        const EXAMPLES = [
          { from: '^(.*)$', to: '$1', note: '整体原样透传（保留完整路径，仅做占位/后续拼接用）' },
          { from: '^/old/(.*)', to: '/new/$1', note: '目录迁移：/old/a.png → /new/a.png' },
          { from: '^(.*)\\\\.html$', to: '$1', note: '去掉 .html 后缀：/page.html → /page' },
        ];
        const exampleBox = el('div', { class: 'rw-examples' }, [
          el('div', { class: 'muted', text: '常用简单示例（点击套用）：' }),
          ...EXAMPLES.map((ex) => {
            const btn = el('button', { class: 'rw-example-btn', type: 'button', text: \`\${ex.from}  →  \${ex.to}\` });
            btn.addEventListener('click', () => {
              fromInput.value = ex.from;
              toInput.value = ex.to;
              renderPreview();
            });
            return el('div', { class: 'rw-example-item' }, [
              btn,
              el('span', { class: 'muted', text: ex.note }),
            ]);
          }),
        ]);
        fieldsBox.appendChild(exampleBox);
      }
    }
    function renderPreview() {
      const sample = sampleInput.value || '/';
      const result = previewRewrite(sample, { type: typeSel.value, value: valueInput.value, regexFrom: fromInput.value, regexTo: toInput.value });
      previewBox.textContent = \`\${sample}  →  \${result}\`;
    }
    typeSel.addEventListener('change', () => { renderFields(); renderPreview(); });
    valueInput.addEventListener('input', renderPreview);
    fromInput.addEventListener('input', renderPreview);
    toInput.addEventListener('input', renderPreview);
    sampleInput.addEventListener('input', renderPreview);

    renderFields();
    renderPreview();

    const root = el('div', { class: 'rw-editor' }, [
      field('类型', typeSel),
      desc,
      fieldsBox,
      el('div', { class: 'rw-preview-row' }, [
        field('示例请求路径（仅预览用，不保存）', sampleInput),
        el('div', { class: 'rw-preview-wrap' }, [
          el('span', { class: 'ro-tag', text: '只读预览' }),
          el('span', { class: 'muted', text: '实际回源路径：' }),
          previewBox,
        ]),
      ]),
    ]);
    const read = () => ({
      type: typeSel.value,
      value: valueInput.value,
      regexFrom: fromInput.value,
      regexTo: toInput.value,
    });
    return { root, read };
  }

  // 旧版快捷条件字段：后端 matcher 仍支持，但编辑器/流量序列只认 conditions。
  const LEGACY_MATCH_KEYS = ['extIn', 'pathPrefix', 'pathRegex', 'methodIn'];

  // 把旧版快捷条件并入 conditions（用于编辑器展示）。已存在的 conditions 不动，
  // 旧字段转换为等价的 conditions 条目追加进第 0 个 AND 组。
  function normalizeMatchForEditor(match) {
    match = match || {};
    const groups = Array.isArray(match.conditions) ? match.conditions.map((g) => (Array.isArray(g) ? g.slice() : [])) : [];
    const first = groups.length ? groups[0] : [];
    const push = (c) => first.push(c);
    if (Array.isArray(match.extIn) && match.extIn.length) {
      push({ target: 'extension', op: 'equal', ignoreCase: true, values: match.extIn.map((e) => String(e).toLowerCase().replace(/^\\./, '')) });
    }
    if (match.pathPrefix) {
      push({ target: 'path', op: 'prefix', ignoreCase: true, values: [match.pathPrefix] });
    }
    if (match.pathRegex) {
      push({ target: 'path', op: 'regex', values: [match.pathRegex] });
    }
    if (Array.isArray(match.methodIn) && match.methodIn.length) {
      push({ target: 'method', op: 'equal', values: match.methodIn.map((m) => String(m).toUpperCase()) });
    }
    if (first.length) {
      if (!groups.length) groups.push(first);
      else groups[0] = first;
    }
    return { ...match, conditions: groups };
  }

  // 提取并回写旧版快捷字段，与 conditions 并存，保证后端匹配语义不丢。
  function legacyMatchFields(match) {
    match = match || {};
    const out = {};
    for (const k of LEGACY_MATCH_KEYS) {
      if (match[k] !== undefined && match[k] !== '' && !(Array.isArray(match[k]) && !match[k].length)) out[k] = match[k];
    }
    return out;
  }

  // 构建单条规则卡片（可视化规则引擎）
  function buildRuleCard(rule, poolOptions, site, opts) {
    opts = opts || {};
    // allowedOps：受限模式下，只允许添加/编辑这些操作（一个最小任务包一个抽屉，禁止越界）。
    // 为 null 表示「完整规则编辑器」（④.1 / ④.2 通用抽屉），不做限制。
    const allowed = opts.allowedOps ? new Set(opts.allowedOps) : null;
    const hideTargetPool = !!opts.hideTargetPool;
    rule = rule || { id: '', priority: 0, enabled: true, match: { conditions: [] }, action: { poolId: '', rewrite: { type: 'none' }, cache: { enabled: true }, reqHeaders: { set: {}, remove: [] }, respHeaders: { set: {}, remove: [] } } };
    const en = el('input', { type: 'checkbox', checked: rule.enabled !== false });
    // 规则名与备注：纯展示用，不影响匹配。模板生成的规则预填了它们，
    // 手动加的规则也建议写上，否则几个月后没人记得这条规则是干嘛的。
    const rName = el('input', { class: 'input', value: rule.name || '', placeholder: '如：静态资源长缓存（选填）' });
    const rNote = el('input', { class: 'input', value: rule.note || '', placeholder: '这条规则为什么这么配（选填）' });
    const priority = el('input', { class: 'input', type: 'number', value: rule.priority || 0, placeholder: '数字，越小越靠上（先匹配）' });
    // 目标源站：下拉选择已有源站（单一源站或源站池），也可直接输入其 id；
    // 单一源站与源站池在同一个下拉里，引用方式完全一致（都是 poolId）。
    // （该字段仅属于 ④.7 候选源站，非 ④.7 的受限抽屉会隐藏它以避免越界。）
    const poolListId = 'poollist-' + (rule.id || 'new') + '-' + Math.random().toString(36).slice(2, 7);
    const poolSel = el('input', { class: 'input', list: poolListId, value: rule.action.poolId || '', placeholder: '留空=用站点默认源站；或选择本规则专用的源站' });
    const poolDatalist = el('datalist', { id: poolListId }, poolOptions.map((o) => el('option', { value: o.value, label: o.label })));
    // 旧版快捷条件（extIn / pathPrefix / pathRegex / methodIn）后端仍支持，
    // 但编辑器与流量序列只认 conditions。打开规则时把旧格式并入 conditions 用于展示，
    // 保存时原样回写这些旧字段（与 conditions 并存，后端两种都认），不丢匹配语义。
    const matchForEditor = normalizeMatchForEditor(rule.match || {});
    rule = { ...rule, match: matchForEditor };
    // 可视化条件编辑器
    const conds = conditionsEditor(rule.match.conditions);

    // —— 操作区：只渲染用户实际「添加」的操作卡片，未添加的操作根本不渲染 ——
    const ACTION_GROUPS = [
      { group: '缓存配置', items: [{ value: 'cache', label: '节点缓存 TTL / 缓存模式' }] },
      { group: 'HTTPS 优化', items: [
        { value: 'forceHttps', label: '强制 HTTPS 访问' },
        { value: 'redirect', label: '访问 URL 重定向' },
        { value: 'directResponse', label: '自定义响应（直接应答）' },
      ] },
      { group: '修改 HTTP 头', items: [
        { value: 'reqHeaders', label: '回源请求头' },
        { value: 'respHeaders', label: '节点响应头' },
        { value: 'hostHeader', label: '回源 Host' },
        { value: 'clientIp', label: '客户端 IP 透传' },
      ] },
      { group: '网络优化', items: [
        { value: 'rewrite', label: '路径重写（回源 URL 改写）' },
        { value: 'followRedirect', label: '回源跟随 3xx' },
        { value: 'originTimeout', label: '回源超时' },
        { value: 'originConn', label: '回源连接参数（引擎/协议/端口）' },
      ] },
    ];
    // 受限模式：只展示白名单内的操作分组，下拉里不会出现越界动作
    const shownGroups = allowed
      ? ACTION_GROUPS.map((g) => ({ group: g.group, items: g.items.filter((it) => allowed.has(it.value)) })).filter((g) => g.items.length)
      : ACTION_GROUPS;

    // 单个操作卡片：标题可折叠，右上角带「移除」按钮。
    function opNode(key, title, desc, bodyNodes, read) {
      const tw = el('span', { class: 'tw', text: '▸' });
      const body = el('div', { class: 'section-body' }, bodyNodes);
      const head = el('div', { class: 'section-toggle' }, [
        tw,
        el('strong', {}, title),
        desc ? el('span', { class: 'muted', text: ' ' + desc }) : null,
      ]);
      const wrap = el('div', { class: 'subcard op-node', id: 'op-' + key }, [head, body]);
      head.onclick = () => wrap.classList.toggle('collapsed');
      return { node: wrap, read };
    }

    // 每个操作的自包含构建器：返回 { node, read }，node 由 mountOp 负责加「移除」按钮。
    const OP_BUILDERS = {
      cache(a) {
        const ed = cacheEditor(a.cache);
        return opNode('cache', '缓存配置', 'EO：节点缓存 TTL、缓存模式、自定义 Cache Key', [ed.root], () => ed.read());
      },
      forceHttps(a) {
        const en = el('input', { type: 'checkbox', checked: !!a.forceHttps });
        const st = select('', [
          { value: '301', label: '301 永久重定向' },
          { value: '302', label: '302 临时重定向（默认）' },
        ], String(a.forceHttpsStatus || 301));
        st.className = 'input';
        // 未启用强制 HTTPS 时，跳转方式无意义，完全隐藏
        const stField = field('跳转方式', st);
        const syncEn = () => { stField.style.display = en.checked ? '' : 'none'; };
        en.addEventListener('change', syncEn);
        syncEn();
        const read = () => ({ forceHttps: en.checked, forceHttpsStatus: Number(st.value) || 301 });
        return opNode('forceHttps', '强制 HTTPS 访问', '开启后将 HTTP 请求跳转至 HTTPS', [
          el('div', { class: 'grid2' }, [
            el('label', { class: 'check' }, [en, el('span', { text: '启用强制 HTTPS' })]),
            stField,
          ]),
        ], read);
      },
      redirect(a) {
        const rd = a.redirect || {};
        const en = el('input', { type: 'checkbox', checked: !!rd.enabled });
        const status = select('', [
          { value: '301', label: '301 永久重定向' },
          { value: '302', label: '302 临时重定向' },
          { value: '307', label: '307 临时（保持方法）' },
          { value: '308', label: '308 永久（保持方法）' },
        ], String(rd.status || 302));
        status.className = 'input';
        const target = el('input', { class: 'input', value: rd.target || '', placeholder: '/new-path 或 https://b.com/$1' });
        const keep = el('input', { type: 'checkbox', checked: rd.keepQuery !== false });
        const read = () => ({ redirect: { enabled: en.checked, status: Number(status.value) || 302, target: target.value.trim(), keepQuery: keep.checked } });
        // 未启用重定向时，状态码 / 保留查询串 / 目标 URL 全部无意义，完全隐藏
        const grid = el('div', { class: 'grid2' }, [
          field('状态码', status),
          el('label', { class: 'check' }, [keep, el('span', { text: '保留原查询串' })]),
        ]);
        const targetField = field('目标 URL（支持 $1..$9 引用路径正则捕获组）', target);
        const syncEn = () => {
          grid.style.display = en.checked ? '' : 'none';
          targetField.style.display = en.checked ? '' : 'none';
        };
        en.addEventListener('change', syncEn);
        syncEn();
        return opNode('redirect', '访问 URL 重定向', '命中后直接 3xx 跳转，不回源', [
          el('label', { class: 'check' }, [en, el('span', { text: '启用重定向' })]),
          grid,
          targetField,
        ], read);
      },
      directResponse(a) {
        const dr = a.directResponse || {};
        const en = el('input', { type: 'checkbox', checked: !!dr.enabled });
        const status = el('input', { class: 'input', type: 'number', value: dr.status || 200 });
        const ct = el('input', { class: 'input', value: dr.contentType || 'text/html; charset=utf-8' });
        const body = el('textarea', { class: 'input', rows: 4, placeholder: '响应内容' });
        body.value = dr.body || '';
        const read = () => ({ directResponse: { enabled: en.checked, status: Number(status.value) || 200, contentType: ct.value.trim(), body: body.value } });
        // 未启用时，状态码 / Content-Type / 响应内容全部无意义，完全隐藏
        const grid = el('div', { class: 'grid2' }, [ field('状态码', status), field('Content-Type', ct) ]);
        const bodyField = field('响应内容', body);
        const syncEn = () => {
          grid.style.display = en.checked ? '' : 'none';
          bodyField.style.display = en.checked ? '' : 'none';
        };
        en.addEventListener('change', syncEn);
        syncEn();
        return opNode('directResponse', '自定义响应', '命中后直接返回内容，不回源', [
          el('label', { class: 'check' }, [en, el('span', { text: '启用自定义响应' })]),
          grid,
          bodyField,
        ], read);
      },
      reqHeaders(a) {
        const ed = headerEditor(a.reqHeaders);
        return opNode('reqHeaders', '回源请求头', '转发到源站前修改', [ed.root], () => ed.read());
      },
      respHeaders(a) {
        const ed = headerEditor(a.respHeaders);
        return opNode('respHeaders', '节点响应头', '返回给客户端前修改', [ed.root], () => ed.read());
      },
      hostHeader(a) {
        const hh = a.hostHeader || { mode: 'inherit', custom: '' };
        const sel = select('', [
          { value: 'inherit', label: '继承（用站点默认回源 Host）' },
          { value: 'origin', label: '源站域名' },
          { value: 'client', label: '客户端 Host' },
          { value: 'custom', label: '自定义' },
        ], hh.mode || 'inherit');
        sel.className = 'input';
        const custom = el('input', { class: 'input', value: hh.custom || '', placeholder: 'origin.example.com' });
        const customField = field('自定义值', custom);
        // 仅「自定义」模式需要填值，其余模式该框无效，完全隐藏避免误导
        const syncMode = () => { customField.style.display = sel.value === 'custom' ? '' : 'none'; };
        sel.addEventListener('change', syncMode);
        syncMode();
        const read = () => ({ hostHeader: { mode: sel.value, custom: sel.value === 'custom' ? custom.value.trim() : '' } });
        return opNode('hostHeader', '回源 Host', '重写回源 Host 头', [ field('模式', sel), customField ], read);
      },
      clientIp(a) {
        const cip = a.clientIpHeader || {};
        const en = el('input', { type: 'checkbox', checked: !!cip.enabled });
        const name = el('input', { class: 'input', value: cip.name || 'X-EdgeGateway-Client-IP', placeholder: 'X-EdgeGateway-Client-IP' });
        const read = () => ({ clientIpHeader: { enabled: en.checked, name: name.value.trim() || 'X-EdgeGateway-Client-IP' } });
        // 未开启透传时，头部名无意义，完全隐藏
        const nameField = field('存放客户端 IP 的头部名', name);
        const syncEn = () => { nameField.style.display = en.checked ? '' : 'none'; };
        en.addEventListener('change', syncEn);
        syncEn();
        return opNode('clientIp', '客户端 IP 透传', '将真实客户端 IP 写入指定回源头（默认 X-EdgeGateway-Client-IP），供源站识别访客', [
          el('label', { class: 'check' }, [en, el('span', { text: '向源站透传客户端 IP' })]),
          nameField,
        ], read);
      },
      rewrite(a) {
        const ed = rewriteEditor(a.rewrite);
        return opNode('rewrite', '路径重写', '改写回源 URL 路径', [ed.root], () => ed.read());
      },
      followRedirect(a) {
        const en = el('input', { type: 'checkbox', checked: !!a.followRedirect });
        const read = () => ({ followRedirect: en.checked });
        return opNode('followRedirect', '回源跟随 3xx 重定向', '', [
          el('div', { class: 'grid2' }, [
            el('label', { class: 'check' }, [en, el('span', { text: '回源跟随 3xx 重定向' })]),
          ]),
        ], read);
      },
      originTimeout(a) {
        const inp = el('input', { class: 'input', type: 'number', value: a.originTimeoutMs || 0, placeholder: '毫秒，0=沿用源站设置' });
        const read = () => ({ originTimeoutMs: Number(inp.value) || 0 });
        return opNode('originTimeout', '回源超时', '', [ field('回源超时（毫秒，0=沿用源站）', inp) ], read);
      },
      originConn(a) {
        // 回源连接参数（⑨ Origin Rules）：规则级覆盖源站物理属性。
        // 留空/0 = 沿用源站对应值，向后兼容旧版「源站级规则」语义。
        const engine = select('', [
          { value: '', label: '沿用源站引擎' },
          { value: 'fetch', label: 'fetch（HTTP 回源）' },
          { value: 'socket', label: 'socket（TCP 透传，仅 CF）' },
          { value: 'r2', label: 'r2（R2 直读，仅 CF）' },
        ], a.engine || '');
        engine.className = 'input';
        const scheme = select('', [
          { value: '', label: '沿用源站协议' },
          { value: 'https', label: 'https' },
          { value: 'http', label: 'http' },
        ], a.scheme || '');
        scheme.className = 'input';
        const port = el('input', { class: 'input', type: 'number', value: a.port || 0, placeholder: '0=沿用源站端口' });
        const read = () => ({
          engine: engine.value || '',
          scheme: scheme.value || '',
          port: Number(port.value) || 0,
        });
        return opNode('originConn', '回源连接参数', '覆盖本次回源的引擎 / 协议 / 端口（留空=沿用源站物理属性）', [
          el('div', { class: 'grid2' }, [
            field('回源引擎', engine),
            field('回源协议', scheme),
          ]),
          field('回源端口（0=沿用源站）', port),
        ], read);
      },
    };

    // 根据已有 rule.action 推断哪些操作是「已启用」的
    function activeOpKeys(a) {
      const s = new Set();
      if (a.cache) s.add('cache');
      if (a.forceHttps) s.add('forceHttps');
      if (a.redirect && a.redirect.enabled) s.add('redirect');
      if (a.directResponse && a.directResponse.enabled) s.add('directResponse');
      if (a.reqHeaders) s.add('reqHeaders');
      if (a.respHeaders) s.add('respHeaders');
      if (a.hostHeader && a.hostHeader.mode && a.hostHeader.mode !== 'inherit') s.add('hostHeader');
      if (a.clientIpHeader && a.clientIpHeader.enabled) s.add('clientIp');
      if (a.rewrite && a.rewrite.type && a.rewrite.type !== 'none') s.add('rewrite');
      if (a.followRedirect) s.add('followRedirect');
      if (Number(a.originTimeoutMs) > 0) s.add('originTimeout');
      if (a.engine || a.scheme || Number(a.port) > 0) s.add('originConn');
      return s;
    }

    const opsList = el('div', { class: 'ops-list' });
    const opReaders = [];
    const mounted = new Set();

    // 挂载一个操作卡片（已挂载则展开定位，不重复添加）
    function mountOp(key) {
      if (!OP_BUILDERS[key]) return;
      // 受限模式：不允许挂载白名单之外的操作，杜绝越界
      if (allowed && !allowed.has(key)) return;
      if (mounted.has(key)) {
        const n = document.getElementById('op-' + key);
        if (n) n.classList.remove('collapsed');
        return;
      }
      const built = OP_BUILDERS[key](rule.action);
      mounted.add(key);
      opReaders.push(built.read);
      const removeBtn = el('button', { class: 'btn btn-sm btn-danger op-remove', text: '移除' });
      removeBtn.onclick = (e) => {
        e.stopPropagation();
        built.node.remove();
        const i = opReaders.indexOf(built.read);
        if (i >= 0) opReaders.splice(i, 1);
        mounted.delete(key);
      };
      built.node.querySelector('.section-toggle').appendChild(removeBtn);
      opsList.appendChild(built.node);
      built.node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    const actionAddSel = selectWithGroups(shownGroups, '');
    actionAddSel.className = 'input';
    actionAddSel.addEventListener('change', () => {
      const v = actionAddSel.value;
      if (!v) return;
      mountOp(v);
      actionAddSel.value = '';
    });

    // 初始只挂载该规则实际启用的操作卡片（受限模式下只挂白名单内的）
    activeOpKeys(rule.action).forEach((k) => { if (!allowed || allowed.has(k)) mountOp(k); });

    const card = el('div', { class: 'rule-card', id: 'rule-' + (rule.id || 'new') }, [
      el('div', { class: 'rule-head' }, [
        el('label', { class: 'check' }, [en, el('span', { text: '启用' })]),
        field('优先级', priority),
        el('button', { class: 'btn btn-sm btn-danger', text: '删除规则', onclick: () => card.remove() }),
      ]),
      field('规则名称', rName, '给这条规则起个一眼能看懂的名字，会显示在流量序列里。'),
      field('备注', rNote, '记下这么配的原因，方便日后自己或同事回看。'),
      section('匹配条件（决定哪些请求命中此规则）', '每个条件组内的多条条件为「与」关系，多个条件组之间为「或」关系', [
        conds.root,
      ]),
      // 目标源站 + 按需添加的「操作卡片」：未添加的操作不渲染
      section('操作（命中后执行的操作）', allowed
        ? '本抽屉仅允许配置「' + opts.title + '」所属的最小任务包，不可越界添加其它动作类型。'
        : '先选「目标源站」，再点「添加操作」加入需要的动作；每个动作是独立卡片，未添加的不显示', [
        // 目标源站属于 ④.7 候选源站，非 ④.7 的受限抽屉隐藏，避免越界
        ...(hideTargetPool ? [] : [field('目标源站（这条规则命中后回到哪台后端）', el('div', {}, [poolSel, poolDatalist]),
          '决定「命中条件的请求」回源到哪个源站：留空则回退到站点默认源站；也可从「源站」页已有的单一源站 / 源站池里选一个。简单站一般不用改，留空即可。')]),
        ...(shownGroups.length ? [el('div', { class: 'op-add' }, [
          el('span', { class: 'op-add-label', text: '添加操作：' }),
          actionAddSel,
        ])] : [el('div', { class: 'hint' }, '本任务包没有可添加的子操作（仅「目标源站」一项）。')]),
        opsList,
      ]),
    ]);

    const read = () => {
      // 受限模式：以原始 action 为基底，只覆盖本包允许编辑的字段，其余字段原样保留（不丢数据、不越界）
      const action = allowed ? JSON.parse(JSON.stringify(rule.action || {})) : {};
      if (!allowed || !hideTargetPool) action.poolId = poolSel.value;
      for (const r of opReaders) Object.assign(action, r());
      return {
        id: rule.id || ('r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
        // name/note 跟随规则一起回写。不带上就会在每次保存时被抹掉，
        // 模板生成的说明文字也会随之丢失。
        name: rName.value.trim(),
        note: rNote.value.trim(),
        enabled: en.checked,
        priority: Number(priority.value) || 0,
        match: {
          // 保留原始 match 里的旧版快捷字段（extIn / pathPrefix / pathRegex / methodIn），
          // 与 conditions 并存——后端两种都认，避免任何边界下匹配语义丢失。
          ...legacyMatchFields(rule.match || {}),
          conditions: conds.read(),
        },
        action,
      };
    };
    return { card, read };
  }

  // 全站通用规则（兜底）编辑器：规则对所有站点生效，仅当站点自身规则未命中时触发
  async function openGlobalRulesDrawer() {
    let rules = [];
    try {
      const data = await API.rules.global();
      rules = (data && data.rules) || [];
    } catch (e) {
      toast('读取全站通用规则失败：' + (e && e.message ? e.message : '未知错误'), 'err');
      return;
    }
    const poolOptions = buildPoolOptions();

    const rulesBox = el('div', { class: 'rules-box' });
    const ruleReaders = [];
    rules.forEach((r) => {
      const { card, read } = buildRuleCard(r, poolOptions);
      ruleReaders.push(read);
      rulesBox.appendChild(card);
    });

    const addRuleBtn = el('button', { class: 'btn btn-sm', text: '+ 添加规则' });
    addRuleBtn.onclick = () => {
      const { card, read } = buildRuleCard(null, poolOptions);
      ruleReaders.push(read);
      rulesBox.appendChild(card);
    };

    const body = el('div', { class: 'drawer-body' }, [
      el('p', { class: 'hint' }, '全站通用规则对任何站点都生效，仅当某站点的自身规则未命中时才触发，相当于全局默认设置（EO 的全局规则概念）。按优先级从上到下匹配，每条规则可独立配置匹配条件与动作。'),
      el('div', { class: 'subhead' }, [el('span', {}, '全站通用规则'), addRuleBtn]),
      rulesBox,
    ]);

    const onSave = async () => {
      const out = [];
      for (const read of ruleReaders) {
        const r = read();
        if (r) out.push(r);
      }
      await API.rules.saveGlobal(out);
    };

    openDrawer('全站通用规则（兜底）', '以下规则对所有站点生效，仅当站点自身规则未命中时触发（全局默认设置）', body, onSave);
  }

  // ⑫ 缓存键阶段的专属抽屉：只编辑「站点缓存代次 cacheGen」，不与 ① 站点基础抽屉重复联动。
  // ⑪ Cache Rules 的缓存策略由「路由规则」抽屉管理；这里的 cacheGen 才是 ⑫ 阶段唯一可干预项。
  async function openCacheGenDrawer(host, cacheRuleCount, hasCache) {
    if (!host) { toast('请先创建站点', 'err'); return; }
    let site;
    try { site = await API.sites.get(host); } catch (e) { toast(e.message, 'err'); return; }
    const fGen = el('input', { class: 'input', id: 'f-cachegen', type: 'number', min: '0', value: site.cacheGen || 0 });
    const body = el('div', {}, [
      el('div', { class: 'subhead' }, [el('span', {}, '⑫ 缓存键 · 缓存代次')]),
      el('div', { class: 'hint' },
        '本抽屉只管理「缓存代次（cacheGen）」这一项，用于一键批量让旧缓存失效（代次 +1 后旧 key 自然失配）。'
        + '其它缓存设置（edgeTtl / SWR / browserTtl / 绕过缓存）属于 ⑪「Cache Rules」阶段，请在对应阶段的规则抽屉里配置，避免与 ① 站点基础重复。'),
      field('缓存代次 cacheGen', fGen, '整数，默认 0。修改并保存后即视为「代次 +1」语义（旧缓存 key 失配，下次回源重新填充）。'),
      el('div', { class: 'hint' },
        \`当前站点 ⑪ 缓存动作 \${cacheRuleCount} 条\${hasCache ? '（已启用节点缓存）' : '（未启用节点缓存）'}；代次变更仅影响 cacheKey 维度，不影响缓存策略本身。\`),
    ]);
    openDrawer('⑫ 缓存键: ' + host, '仅调整缓存代次，使旧缓存批量失效。', body, async () => {
      const gen = Math.max(0, Number(fGen.value) || 0);
      const patch = { cacheGen: gen };
      try {
        await API.sites.saveBasics(host, patch);
        toast('已保存缓存代次', 'ok');
        await refreshData();
      } catch (e) { toast(e.message, 'err'); }
    });
  }

  async function openSiteDrawer(host, anchor) {
    let site;
    if (host) {
      try { site = await API.sites.get(host); } catch (e) { toast(e.message, 'err'); return; }
    } else {
      site = { host: '', enabled: true, poolId: '', rules: [], security: {}, cacheGen: 0 };
    }
    const editing = !!(site && site.host);

    // ① 匹配站点：仅承载「按 Host 命中站点」这一包，不含任何源站/规则/安全配置
    const fHost = el('input', { class: 'input', id: 'f-host', value: site.host || '', placeholder: 'example.com 或 *.example.com' });
    const fEnabled = el('input', { type: 'checkbox', id: 'f-enabled', checked: site.enabled !== false });
    const fIpv6 = el('input', { type: 'checkbox', id: 'f-ipv6', checked: !!(site.ipv6Support) });

    const body = el('div', {}, [
      el('div', { class: 'subhead', id: 'sec-basic' }, [el('span', {}, '① 匹配站点')]),
      el('div', { class: 'hint' }, '按 Host 命中站点配置，决定后续整条管线走哪套设置。源站 / 规则 / 安全分别在 ③ / ④ / ② 的独立抽屉配置，互不越界。'),
      field('加速域名（Host）', fHost, editing ? '编辑时不能修改，如需更改请在「站点总览」删除重建。' : '你接入加速的域名，例如 example.com。'),
      field('启用', fEnabled),
      field('支持 IPv6 访问', fIpv6),
    ]);

    // ── ② 默认源站（仅新建时出现）────────────────────────────────────
    // 新建站点时必须绑定一个源站；可选「填写域名/IP」（自动创建单一源站）或「选择已有源站」
    let fOriginMode, fPoolSel, fAddr, fPort, fScheme, fEngine, fHostMode, fHostCustom;
    if (!editing) {
      const poolOptions = buildPoolOptions();
      fOriginMode = select('f-origin-mode', [
        { value: 'inline', label: '填写域名/IP' },
        { value: 'pool', label: '选择已有源站' },
      ], 'inline');
      fOriginMode.className = 'input';

      // 「选择已有源站」模式
      fPoolSel = select('f-dup-pool', [{ value: '', label: poolOptions.length ? '（请选择）' : '（暂无可用源站）' }, ...poolOptions], '');
      fPoolSel.className = 'input';
      const fPoolRow = field('已有源站', fPoolSel, '从「源站」标签页已创建的单一源站或源站池中选择。');

      // 「填写域名/IP」模式：最简必填项
      fAddr = el('input', { class: 'input', id: 'f-addr', value: '', placeholder: 'storage.example.com 或 1.2.3.4' });
      fPort = el('input', { class: 'input', id: 'f-port', type: 'number', value: '443' });
      fScheme = select('f-scheme', [], 'https', [{ value: 'https', label: 'https' }, { value: 'http', label: 'http' }]);
      fScheme.className = 'input';
      fEngine = select('f-engine', [], 'fetch', [
        { value: 'fetch', label: 'fetch（标准回源）' },
        { value: 'socket', label: 'socket（裸 TCP，仅 Workers）', disabled: !(APP_DATA.info && APP_DATA.info.caps && APP_DATA.info.caps.hasSocket) },
        { value: 'r2', label: 'r2（回源到 R2 桶，仅 CF）', disabled: !(APP_DATA.info && APP_DATA.info.caps && APP_DATA.info.caps.hasR2) },
      ]);
      fEngine.className = 'input';
      fHostMode = select('f-host-mode', [], 'origin', [
        { value: 'accel', label: '加速域名（当前站点 Host）' },
        { value: 'origin', label: '回源域名（源站地址本身）' },
        { value: 'custom', label: '自定义域名' },
      ]);
      fHostMode.className = 'input';
      fHostCustom = el('input', { class: 'input', id: 'f-host-custom', value: '', placeholder: '如 backend.internal' });

      const addrField = field('源站地址（域名 / IP）', fAddr, '你的真实服务器地址。r2 引擎不需要此字段。');
      const portField = field('端口', fPort, 'https 默认 443，http 默认 80。');
      const schemeField = field('回源协议', fScheme, '选择 https 则回源时走加密通道。');
      const engineField = field('引擎', fEngine, 'fetch=标准回源（所有平台可用）；socket=裸 TCP（仅 Workers，可自定义 Host）；r2=回源 R2 桶（仅 CF）。');
      const hostModeField = field('回源 Host', fHostMode, '源站响应请求时看到的 Host 头。选「自定义域名」时需填下方输入框。');
      const hostCustomField = field('回源 Host 自定义值', fHostCustom, '仅用于回源请求的 Host 头，与站点配置的「加速域名」无关。');

      const inlineFields = el('div', { id: 'origin-inline-fields' }, [
        addrField, portField, schemeField, engineField, hostModeField, hostCustomField,
      ]);

      const syncEngine = () => {
        const eng = fEngine.value;
        const isR2 = eng === 'r2';
        addrField.style.display = isR2 ? 'none' : '';
        portField.style.display = isR2 ? 'none' : '';
        schemeField.style.display = isR2 ? 'none' : '';
      };
      const syncHostCustom = () => { hostCustomField.style.display = fHostMode.value === 'custom' ? '' : 'none'; };
      const syncOriginMode = () => {
        const mode = fOriginMode.value;
        fPoolRow.style.display = mode === 'pool' ? '' : 'none';
        inlineFields.style.display = mode === 'inline' ? '' : 'none';
        if (mode === 'inline') syncEngine();
      };

      fOriginMode.onchange = syncOriginMode;
      fHostMode.onchange = syncHostCustom;
      fEngine.onchange = syncEngine;
      syncOriginMode();
      syncHostCustom();

      body.appendChild(el('div', { class: 'subhead' }, [el('span', {}, '② 默认源站')]));
      body.appendChild(el('div', { class: 'hint' },
        '选「域名/IP」填地址保存时会自动创建单一源站并绑定；选「源站池」则引用已建好的。'));
      body.appendChild(field('源站方式', fOriginMode));
      body.appendChild(fPoolRow);
      body.appendChild(inlineFields);
    }

    // ── 场景模板（仅新建时出现）────────────────────────────────────
    // 选定场景后自动铺好该场景下「一定通用」的那几条规则，省去从零配起。
    // 生成的规则落库后与手写规则完全等价，之后随便改，系统不会再覆盖。
    const tplState = { id: 'blank', params: {}, meta: {}, list: [] };
    if (!editing) {
      const tplSel = select('f-template', [], 'blank', [{ value: 'blank', label: '加载中…' }]);
      const tplDesc = el('div', { class: 'field-hint muted' }, '');
      const tplParamBox = el('div', { class: 'tpl-params' });
      const tplPreview = el('div', { class: 'field-hint muted' }, '');

      // 把模板参数渲染成可编辑输入框：默认值只是起点，重点是让用户看见并按需改。
      const renderParams = () => {
        tplParamBox.innerHTML = '';
        const tpl = tplState.list.find((t) => t.id === tplSel.value);
        tplState.id = tplSel.value;
        tplState.params = {};
        tplDesc.textContent = tpl ? tpl.desc : '';
        const keys = (tpl && tpl.tuning) || [];
        if (!keys.length) {
          tplPreview.textContent = tplSel.value === 'blank'
            ? '不会生成任何规则，建站后请自行到「流量序列 → ④ 匹配规则」添加。'
            : '';
          return;
        }
        tplParamBox.appendChild(el('div', { class: 'hint' },
          '以下为该场景的建议值，仅是起点而非最优解。请按你的实际业务修改——尤其是缓存时间，设错会导致用户看到旧内容。'));
        for (const k of keys) {
          const m = tplState.meta[k] || {};
          const inp = el('input', {
            class: 'input', type: 'number',
            value: String(tpl.params[k] != null ? tpl.params[k] : 0),
          });
          if (m.min != null) inp.min = String(m.min);
          if (m.max != null) inp.max = String(m.max);
          tplState.params[k] = inp;
          tplParamBox.appendChild(field(
            (m.label || k) + '（秒）', inp,
            (m.hint || '') + humanSecs(Number(inp.value))
          ));
          inp.oninput = () => {
            const hintEl = inp.parentNode.querySelector('.field-hint');
            if (hintEl) hintEl.textContent = (m.hint || '') + humanSecs(Number(inp.value));
          };
        }
        tplPreview.textContent = '建站后将自动生成 ' + (tpl.ruleCount != null ? tpl.ruleCount : '若干') + ' 条规则，可随时在「流量序列 → ④ 匹配规则」增删改。';
      };
      tplSel.onchange = renderParams;

      body.appendChild(el('div', { class: 'subhead' }, [el('span', {}, '站点场景模板')]));
      body.appendChild(el('div', { class: 'hint' },
        '按站点类型一次铺好该场景下通用的基础规则，避免从零配起。只预置「这类站点几乎都要」的少量参数，其余留给你自己配。'));
      body.appendChild(field('加速类型', tplSel, ''));
      body.appendChild(tplDesc);
      body.appendChild(tplParamBox);
      body.appendChild(tplPreview);

      // 异步拉取模板清单，失败则静默降级为「空白」，不阻塞建站
      API.sites.templates().then((d) => {
        tplState.list = (d && d.templates) || [];
        tplState.meta = (d && d.paramMeta) || {};
        tplSel.innerHTML = '';
        for (const t of tplState.list) {
          const o = el('option', { value: t.id }, t.name);
          if (t.id === 'website') o.selected = true; // 最常见场景作默认
          tplSel.appendChild(o);
        }
        renderParams();
      }).catch(() => {
        tplSel.innerHTML = '';
        tplSel.appendChild(el('option', { value: 'blank' }, '空白（模板加载失败）'));
      });
    }

    openDrawer(host ? '编辑站点: ' + host : '新建站点', '', body, async () => {
      const h = fHost.value.trim();
      if (!h) throw new Error('请填写 Host');
      const basics = { host: h, enabled: fEnabled.checked, ipv6Support: fIpv6.checked };
      // 新建站点时整合源站信息：选「已有源站」则传 poolId；选「域名/IP」则传 origins + defaultHostHeader
      if (!editing && fOriginMode) {
        if (fOriginMode.value === 'pool') {
          if (!fPoolSel.value) throw new Error('请选择一个已有源站');
          basics.poolId = fPoolSel.value;
        } else {
          // 「填写域名/IP」：构建 origin 对象，后端 ensureSingleOrigin 自动查重/创建并回填 poolId
          const eng = fEngine.value;
          if (eng !== 'r2' && !fAddr.value.trim()) throw new Error('请填写源站地址');
          const o = {
            addr: eng === 'r2' ? '' : fAddr.value.trim(),
            port: eng === 'r2' ? null : (Number(fPort.value) || 443),
            scheme: eng === 'r2' ? 'https' : fScheme.value,
            engine: eng,
          };
          if (eng === 'r2') o.r2Binding = '';
          basics.origins = [o];
          basics.defaultHostHeader = {
            mode: fHostMode.value,
            custom: fHostMode.value === 'custom' ? fHostCustom.value.trim() : '',
          };
        }
      }
      if (editing) {
        await API.sites.saveBasics(site.host, basics);
        toast('站点基础片段已保存');
      } else {
        // 模板只在新建这一刻起作用，后端还会再次确认「站点确实不存在」才套用
        if (tplState.id && tplState.id !== 'blank') {
          basics.template = tplState.id;
          const p = {};
          for (const [k, inp] of Object.entries(tplState.params)) {
            const n = Number(inp.value);
            if (Number.isFinite(n)) p[k] = n;
          }
          basics.templateParams = p;
        }
        await API.sites.save(h, basics);
        toast(basics.template ? '站点已创建，并已按模板生成基础规则' : '站点已创建');
      }
      await refreshData();
    });
    scrollToAnchor(anchor);
  }

  // ③ 初始回源对象（首要分流）：独立抽屉，只承载「选择回源目标」这一包。
  // 与 ① 匹配站点彻底分离（一个最小任务包一个抽屉），②/④/⑧ 各有独立抽屉。
  async function openInitialOriginDrawer(host, anchor) {
    let site;
    try { site = await API.sites.get(host); } catch (e) { toast(e.message, 'err'); return; }
    // 源站下拉：单一源站与源站池同列，用前缀标明类型（nginx upstream 式统一引用）
    const poolOptions = buildPoolOptions();

    // 站点级源站：① 选已有源站（single 或 pool）；② 直接填地址 → 自动联动创建单一源站
    const originMode = site.poolId ? 'pool' : (poolOptions.length ? 'pool' : 'inline');

    // 模式一：选择已有源站
    const fPool = select('f-pool', [{ value: '', label: '（未选择）' }, ...poolOptions], site.poolId || '');
    fPool.className = 'input';
    const fPoolField = field('默认源站（没被规则覆盖的请求就用它）', fPool, '所有规则都没命中时，请求回到这里设置的源站。列表同时包含「单一源站」与「源站池」，两者用法一致。');

    // 模式二：直接填写地址 → 保存时自动创建一条「单一源站」并绑定
    const inlineBox = el('div', { class: 'inline-origin-box' });
    const inlineOriginList = el('div', { id: 'inline-origin-list' });
    // 单一源站只有 1 个地址，无调度可言：策略字段与权重字段一律不展示
    const inlineStrategy = { value: 'chain' };
    const inlineWeightFields = [];
    const syncInlineWeight = () => {
      inlineWeightFields.forEach((f) => { f.style.display = 'none'; });
    };
    // 由下方 syncHH 定义后回填：源站引擎变化时重算站点级「回源 Host」可选项
    let onEngineChange = null;
    const addInlineOrigin = (o) => {
      o = o || { addr: '', port: 443, scheme: 'https', engine: 'fetch', weight: 1 };
      const engineSel = select('', [], o.engine || 'fetch', [
        { value: 'fetch', label: 'fetch' },
        { value: 'socket', label: 'socket（仅 Workers）', disabled: !(APP_DATA.info && APP_DATA.info.caps && APP_DATA.info.caps.hasSocket) },
        { value: 'r2', label: 'r2（回源到 R2 桶，仅 CF）', disabled: !(APP_DATA.info && APP_DATA.info.caps && APP_DATA.info.caps.hasR2) },
      ]);
      engineSel.className = 'input o-engine';
      // 源站级专用 Host：默认不启用（沿用站点级默认的回源 Host），
      // 仅当「覆盖」勾选时才出现输入框，避免无意义的冗余填写。
      const hostCustom = o.hostHeader?.mode === 'custom' ? (o.hostHeader.custom || '') : '';
      const hostEn = el('input', { type: 'checkbox', class: 'o-host-en', checked: !!hostCustom });
      const hostInput = el('input', { class: 'input o-host', value: hostCustom, placeholder: '如 api1.internal（留空=用规则/站点级 Host）' });
      const hostField = field('回源 Host 自定义值', hostInput, '仅这台源站回源时使用的 Host 头，会覆盖站点级「回源 Host」。留空等同不覆盖。');
      const syncHost = () => { hostField.style.display = engineSel.value === 'socket' && hostEn.checked ? '' : 'none'; };
      hostEn.onchange = syncHost;
      // ---- R2 引擎专用字段 ----
      const r2BindingIn = el('input', { class: 'input o-r2-binding', value: o.r2Binding || '', placeholder: 'CDN_R2（必须与 wrangler.toml 的 binding 一致）' });
      const r2KeyPrefixIn = el('input', { class: 'input o-r2-prefix', value: o.r2KeyPrefix || '', placeholder: '如 img/（桶内目录隔离，留空=无）' });
      const r2KeyModeSel = select('', [''], o.r2KeyMode || 'none', [
        { value: 'none', label: 'none（pathname 原样作 key）' },
        { value: 'prefix', label: 'prefix（在 key 前加前缀）' },
        { value: 'strip', label: 'strip（剥除开头串）' },
        { value: 'regex', label: 'regex（正则替换）' },
      ], 'o-r2-keymode');
      const r2RuleIn = el('input', { class: 'input o-r2-rule', value: o.r2KeyPrefixRule || '', placeholder: 'prefix/strip: 前缀串；regex: 正则' });
      const r2ToIn = el('input', { class: 'input o-r2-to', value: o.r2KeyRegexTo || '', placeholder: 'regex 模式下的替换值' });
      const r2RuleField = field('转换参数（r2KeyPrefixRule）', r2RuleIn, 'prefix/strip 时填前缀/要剥除的开头；regex 时填正则在 r2KeyPrefixRule。');
      const r2ToField = field('正则替换值（r2KeyRegexTo）', r2ToIn, '仅 regex 模式使用。');
      const r2Fields = el('div', { class: 'o-r2-fields' }, [
        field('R2 绑定名（r2Binding）', r2BindingIn, 'wrangler.toml 里 [[r2_buckets]].binding 的值，如 CDN_R2。引擎选 r2 时必填。'),
        field('R2 key 前缀（r2KeyPrefix）', r2KeyPrefixIn, '拼到最终 key 前面的固定串，用于多站点共用一个桶时隔离目录。'),
        field('pathname → key 转换方式（r2KeyMode）', r2KeyModeSel, 'none 原样；prefix 在前加串；strip 剥开头串；regex 用正则替换。规则级 rewrite 已先作用，这里做最后一步。'),
        r2RuleField,
        r2ToField,
      ]);
      // key 转换方式决定后续参数：none 无需参数，regex 才需要替换值
      const syncR2Key = () => {
        const m = r2KeyModeSel.value;
        r2RuleField.style.display = (m === 'prefix' || m === 'strip' || m === 'regex') ? '' : 'none';
        r2ToField.style.display = m === 'regex' ? '' : 'none';
      };
      r2KeyModeSel.onchange = syncR2Key;
      syncR2Key();
      const syncEngine = () => {
        const eng = engineSel.value;
        const isR2 = eng === 'r2';
        r2Fields.style.display = isR2 ? '' : 'none';
        // R2 不需要公网地址/端口/协议/Host，隐藏避免误填
        addrField.style.display = isR2 ? 'none' : '';
        portField.style.display = isR2 ? 'none' : '';
        schemeField.style.display = isR2 ? 'none' : '';
        // 源站级自定义 Host 只有 socket 引擎能真正手写；fetch 下 Host 恒等于回源地址
        const canHost = eng === 'socket';
        hostEnLabel.style.display = canHost ? '' : 'none';
        hostField.style.display = canHost && hostEn.checked ? '' : 'none';
        // 引擎变化会影响站点级「回源 Host」可选项（fetch 不支持加速域名），通知其重算
        if (typeof onEngineChange === 'function') onEngineChange();
      };
      const addrField = field('源站地址（域名 / IP）', el('input', { class: 'input o-addr', value: o.addr || '', placeholder: 'storage.example.net' }), '你的真实服务器地址。');
      const portField = field('端口', el('input', { class: 'input o-port', type: 'number', value: o.port || 443 }), 'https 默认 443，http 默认 80。');
      const schemeField = field('协议', select('', [''], o.scheme || 'https', [{ value: 'https', label: 'https' }, { value: 'http', label: 'http' }], 'o-scheme'));
      const hostEnLabel = el('label', { class: 'check' }, [hostEn, el('span', { text: '覆盖站点级回源 Host（源站专用）' })]);
      const weightField = field('权重', el('input', { class: 'input o-weight', type: 'number', value: o.weight || 1 }), '配合「加权」策略使用，默认 1 即可。');
      inlineWeightFields.push(weightField);
      const row = el('div', { class: 'origin-row' }, [
        addrField,
        portField,
        schemeField,
        field('路径前缀', el('input', { class: 'input o-pathprefix', value: o.pathPrefix || '', placeholder: '如 /api/v1（留空=用请求原路径）' }), '追加在请求路径前面的固定前缀，每个源站可不同。例如三台同服务源站分别填 /node1、/node2、/node3，请求 /img/x.png 会分别回源到 /node1/img/x.png 等。留空则不加。'),
        hostEnLabel,
        hostField,
        field('引擎', engineSel, '回源方式：① fetch=标准回源，Host 头由「回源域名/地址」决定（源站只看到自己的域名，最通用，所有平台可用）；② socket=仅 CF Workers 支持，基于裸 TCP 手写 HTTP，可自定义 Host / 回源裸 IP / 非标端口（用于源站要靠 Host 做虚拟主机路由、或只暴露 IP 的场景）；③ r2=回源到 R2 桶（仅 CF，需先在 wrangler.toml 绑定）。'),
        r2Fields,
        weightField,
        // 单一源站恒为 1 行，无「移除」按钮：清空地址即视为未填写
      ]);
      engineSel.onchange = syncEngine;
      syncHost();
      syncEngine();
      // 本抽屉只负责「③ 初始回源对象」这一包：地址/端口/协议/前缀/Host/引擎/权重。
      // 源站级的 rewrite/cache/reqHeaders/respHeaders/超时/跟随3xx 属于 ④.5 / ④.8 / ⑧.1，
      // 由「路由规则」「源站」抽屉各自管理；这里原样保留，保存时回写，绝不越界改写。
      row._carry = {};
      ['rewrite', 'cache', 'reqHeaders', 'respHeaders', 'originTimeoutMs', 'followRedirect', 'extraHeaders']
        .forEach((k) => { if (o[k] !== undefined) row._carry[k] = o[k]; });
      inlineOriginList.appendChild(row);
    };
    // 单一源站恰好一行地址，不再回显站点内联数组（该概念已废弃）
    addInlineOrigin();

    const modeSel = select('f-origin-mode', [
      { value: 'pool', label: '选择已有源站（单一源站 / 源站池）' },
      { value: 'inline', label: '新建单一源站（填地址，自动创建）' },
    ], originMode);
    modeSel.className = 'input';
    const syncInlineStrategy = () => {};
    const syncOriginMode = () => {
      const m = modeSel.value;
      fPoolField.style.display = m === 'pool' ? '' : 'none';
      inlineBox.style.display = m === 'inline' ? '' : 'none';
      syncInlineStrategy();
      syncHH();
    };
    modeSel.onchange = syncOriginMode;

    const defaultHH = site.defaultHostHeader || { mode: 'accel', custom: '' };
    const hhSel = select('f-hh', [
      { value: 'accel', label: '加速域名（即你访问的这个域名，默认）' },
      { value: 'origin', label: '源站域名（用源站自己的域名）' },
      { value: 'custom', label: '自定义（指定一个域名）' },
    ], defaultHH.mode || 'accel');
    hhSel.className = 'input';
    const hhCustom = el('input', { class: 'input', id: 'f-hh-custom', value: defaultHH.custom || '', placeholder: 'origin.example.com' });
    const hhField = field('回源 Host（回源时发给源站的 Host 头）', hhSel, '一般保持「加速域名」即可；仅当源站要求特定域名时才改。选择「自定义」后下方出现填写框。');
    const hhCustomField = field('回源 Host 自定义值', hhCustom);
    // fetch 引擎无法自定义 Host（平台强制 Host = 回源 URL 的 hostname），
    // 因此 accel / client 这类「Host 与回源地址不一致」的模式在 fetch 下不可实现。
    // 只有 socket 引擎能手写 Host 头。这里根据新建单一源站实际选用的引擎动态裁剪可选项。
    const hhNote = el('div', { class: 'hint' });
    const HH_ALL = [
      { value: 'accel', label: '加速域名（即你访问的这个域名，默认）', socketOnly: true },
      { value: 'origin', label: '源站域名（用源站自己的域名）', socketOnly: false },
      { value: 'custom', label: '自定义（指定一个域名）', socketOnly: false },
    ];
    // 收集正在填写的单一源站引擎；选择已有源站时由该源站自身定义，此处不判定。
    const inlineEngines = () => Array.from(inlineOriginList.querySelectorAll('.o-engine')).map((s) => s.value);
    const syncHH = () => {
      // 选择已有源站（pool）模式下：源站内每个 origin 已在各自配置里定义回源方式，
      // 站点级再做统一「回源 Host」会与源站级定义冲突，故整块完全隐藏。
      if (modeSel.value === 'pool') {
        hhField.style.display = 'none';
        hhNote.style.display = 'none';
        hhCustomField.style.display = 'none';
        return;
      }
      const engines = inlineEngines();
      // 全部源站都是 r2 → 回源 Host 完全无意义（不走 HTTP 回源），整块隐藏
      const allR2 = engines.length > 0 && engines.every((e) => e === 'r2');
      // 存在 socket 源站才允许 accel（Host ≠ 回源地址）
      const hasSocket = engines.some((e) => e === 'socket');

      hhField.style.display = allR2 ? 'none' : '';
      hhNote.style.display = allR2 ? 'none' : '';
      if (allR2) { hhCustomField.style.display = 'none'; return; }

      const allowed = HH_ALL.filter((o) => hasSocket || !o.socketOnly);
      const cur = hhSel.value;
      clear(hhSel);
      allowed.forEach((o) => {
        const node = el('option', { value: o.value }, o.label);
        if (o.value === cur) node.selected = true;
        hhSel.appendChild(node);
      });
      // 原选中项被裁掉（如 accel 在纯 fetch 下不可用）→ 回落到 origin
      if (!allowed.some((o) => o.value === cur)) hhSel.value = 'origin';

      hhNote.textContent = hasSocket
        ? ''
        : 'fetch / r2 引擎下平台强制 Host = 回源地址，无法伪装成加速域名，故「加速域名」选项不可用；需要该能力请将源站引擎改为 socket。';
      hhNote.style.display = hhNote.textContent ? '' : 'none';
      hhCustomField.style.display = hhSel.value === 'custom' ? '' : 'none';
    };
    hhSel.onchange = syncHH;
    onEngineChange = syncHH;

    // 片段边界：本抽屉 = ③ 初始回源对象（单一最小任务包）。
    const body = el('div', {}, [
      el('div', { class: 'subhead', id: 'sec-origin' }, [el('span', {}, '③ 初始回源对象（首要分流）')]),
      el('div', { class: 'hint' }, '选出「初始回源对象」，它既是规则引擎的 origin 匹配维度，也是所有规则都未命中时的兜底回源目标。'),
      field('源站方式', modeSel, '① 从「源站」页已有条目里选（单一源站和源站池都在同一个下拉里）；② 直接填地址，保存时自动创建一条「单一源站」并绑定，随后可在「源站」页统一管理。'),
      fPoolField,
      el('div', { class: 'hint', id: 'origin-mode-hint' }, '站点不再持有「内联源站」：任何直接填写的地址都会成为「源站」页里的一条单一源站，因此你能在一个地方看到全部上游及其被引用情况。需要多源站负载均衡时，请到「源站」页新建源站池，再回到这里选择它。'),
      inlineBox,
      hhField,
      hhNote,
      hhCustomField,

      el('div', { class: 'hint frag-note' }, '本抽屉只负责 ③ 这包。① 匹配站点、② 安全校验、④ 路由规则、⑧ 源站池细节均有各自独立抽屉，请在「流量序列」中点击对应阶段进入，此处不再重复承载。'),
    ]);

    // 新建单一源站编辑区（直接填地址 → 保存时联动创建）
    inlineBox.appendChild(el('div', { class: 'subhead' }, [
      el('span', {}, '新建单一源站'),
    ]));
    inlineBox.appendChild(el('div', { class: 'hint' }, '只填「这台源站是谁」——地址/端口/协议/路径前缀/引擎。保存后会在「源站」页自动出现一条同名的单一源站，并标记被本站点引用；若已存在完全相同的地址，则直接复用它而不会重复创建。需要多台源站做负载均衡，请改用「源站池」。'));
    inlineBox.appendChild(inlineOriginList);
    syncOriginMode();
    syncInlineStrategy();
    syncInlineWeight();
    syncHH();

    openDrawer('编辑回源对象: ' + host, '', body, async () => {
      const hhMode = hhSel.value;
      // 根据源站方式决定提交字段：选源站组时忽略内联源站，直接填写时清空 poolId
      const useInline = modeSel.value === 'inline';
      const inlineOrigins = [];
      Array.from(inlineOriginList.children).forEach((row, i) => {
        const engine = $('.o-engine', row).value;
        const addr = $('.o-addr', row).value.trim();
        // r2 引擎无公网地址，按 r2Binding 标识；其余引擎必须有 addr
        if (engine !== 'r2' && !addr) return;
        const r2KeyMode = $('.o-r2-keymode', row) ? $('.o-r2-keymode', row).value : 'none';
        inlineOrigins.push({
          id: 'o' + i + '_' + (engine === 'r2' ? ($('.o-r2-binding', row).value.trim() || 'r2') : addr),
          enabled: true,
          order: i,
          weight: Number($('.o-weight', row).value) || 1,
          engine,
          scheme: $('.o-scheme', row) ? $('.o-scheme', row).value : 'https',
          addr: engine === 'r2' ? '' : addr,
          port: Number($('.o-port', row).value) || 443,
          pathPrefix: ($('.o-pathprefix', row).value || '').trim(),
          hostHeader: (() => {
            const en = $('.o-host-en', row);
            const custom = ($('.o-host', row).value || '').trim();
            // 仅在勾选「覆盖」且填写了值时，才作为源站专用 Host；否则沿用站点级
            return en && en.checked && custom ? { mode: 'custom', custom } : { mode: 'inherit', custom: '' };
          })(),
          extraHeaders: {},
          ...(engine === 'r2'
            ? {
                r2Binding: $('.o-r2-binding', row).value.trim(),
                r2KeyPrefix: $('.o-r2-prefix', row).value.trim(),
                r2KeyMode,
                r2KeyPrefixRule: $('.o-r2-rule', row).value.trim(),
                r2KeyRegexTo: $('.o-r2-to', row).value.trim(),
              }
            : {}),
          ...(row._carry || {}),
        });
      });

      // 仅提交 ③ 相关字段，后端浅合并 basics；不影响 ①（基础）/②（安全）等其它包
      const basics = {};
      if (useInline) {
        if (!inlineOrigins.length) throw new Error('请填写源站地址');
        if (inlineOrigins.length > 1) throw new Error('单一源站只能有 1 个地址；需要多个请到「源站」页新建源站池');
        // 不传 poolId：后端 ensureSingleOrigin 会据此把地址落成 kind=single 源站并回填
        basics.origins = inlineOrigins;
        // 站点级「回源 Host」只在单一源站下有意义：源站池里每台源站各自定义，
        // 站点级统一值会与源站级定义冲突，故 pool 模式不提交。
        basics.defaultHostHeader = { mode: hhMode, custom: hhMode === 'custom' ? hhCustom.value.trim() : '' };
      } else {
        if (!fPool.value) throw new Error('请选择一个源站，或改用「新建单一源站」填写地址');
        basics.poolId = fPool.value;
      }
      const res = await API.sites.saveBasics(site.host, basics);
      if (res && res.createdOrigin) {
        toast(\`已自动创建单一源站「\${res.createdOrigin.name || res.createdOrigin.id}」并绑定到本站点\`, 'ok');
      } else {
        toast('初始回源对象片段已保存');
      }
      await refreshData();
    });
    scrollToAnchor(anchor);
  }

  // 安全防护：独立抽屉，只读写站点的 security 字段，不碰基础设置/规则/源站
  // 内部按 ②.1~②.5 五个最小任务包分节，anchor 可直达其中一节
  async function openSecurityDrawer(host, anchor) {
    if (!host) { toast('请先创建站点', 'err'); return; }
    let site;
    try { site = await API.sites.get(host); } catch (e) { toast(e.message, 'err'); return; }
    const sec = site.security || {};

    const refererMode = select('', [
      { value: 'off', label: '关闭' },
      { value: 'whitelist', label: '白名单（允许名单内 Referer 访问）' },
      { value: 'blacklist', label: '黑名单（拦截名单内 Referer）' },
    ], sec.refererMode || 'off');
    refererMode.className = 'input';
    const refererList = el('input', { class: 'input', value: (sec.refererList || []).join(', '), placeholder: '如 example.com, *.test.com' });
    const refererAllowEmpty = el('input', { type: 'checkbox', checked: !!sec.allowEmptyReferer });
    const uaList = el('input', { class: 'input', value: (sec.uaBlacklist || []).join(', '), placeholder: '如 BadBot, scraper' });
    const botEn = el('input', { type: 'checkbox', checked: !!(sec.botManagement && sec.botManagement.enabled) });
    const botMode = select('', [
      { value: 'blacklist', label: '黑名单（命中特征即拦截）' },
      { value: 'allowlist', label: '白名单（仅放行命中特征，其余视为 Bot）' },
    ], (sec.botManagement && sec.botManagement.mode) || 'blacklist');
    botMode.className = 'input';
    const botList = el('input', { class: 'input', value: ((sec.botManagement && sec.botManagement.list) || []).join(', '), placeholder: '如 scrapy, python-requests, HeadlessChrome' });
    const ipBlack = el('input', { class: 'input', value: (sec.ipBlacklist || []).join(', '), placeholder: '如 1.2.3.4, 10.0.0.0/8' });
    const ipWhite = el('input', { class: 'input', value: (sec.ipWhitelist || []).join(', '), placeholder: '如 192.168.1.0/24' });
    const signEn = el('input', { type: 'checkbox', checked: !!(sec.signedUrl && sec.signedUrl.enabled) });
    const signKey = el('input', { class: 'input', value: (sec.signedUrl && sec.signedUrl.secret) || '', placeholder: '签名密钥，建议 16 位以上随机串' });
    const signExpire = el('input', { class: 'input', type: 'number', value: (sec.signedUrl && sec.signedUrl.ttl) || 300 });
    const signParam = el('input', { class: 'input', value: (sec.signedUrl && sec.signedUrl.param) || 'sign', placeholder: 'URL 查询参数名' });
    const rateEn = el('input', { type: 'checkbox', checked: !!(sec.rateLimit && sec.rateLimit.enabled) });
    const rateRpm = el('input', { class: 'input', type: 'number', value: (sec.rateLimit && sec.rateLimit.rpm) || 600 });

    const commaSplit = (v) => v.split(',').map((s) => s.trim()).filter(Boolean);
    const readSecurity = () => ({
      refererMode: refererMode.value,
      refererList: commaSplit(refererList.value),
      allowEmptyReferer: refererAllowEmpty.checked,
      uaBlacklist: commaSplit(uaList.value),
      botManagement: {
        enabled: botEn.checked,
        mode: botMode.value,
        list: commaSplit(botList.value),
      },
      ipBlacklist: commaSplit(ipBlack.value),
      ipWhitelist: commaSplit(ipWhite.value),
      signedUrl: {
        enabled: signEn.checked,
        secret: signKey.value.trim(),
        ttl: Number(signExpire.value) || 300,
        param: signParam.value.trim() || 'sign',
      },
      rateLimit: {
        enabled: rateEn.checked,
        rpm: Number(rateRpm.value) || 600,
      },
    });

    // 按流程图 ②.1~②.5 分节，每节一个最小任务包，一节一个锚点
    const pack = (id, title, desc, children) => {
      const s = section(title, desc, children);
      s.id = id;
      return s;
    };
    // ---- 依赖联动：未启用/关闭的开关，其下属字段完全隐藏（不是折叠） ----
    const refererListField = field('Referer 名单（逗号分隔，可含 *.example.com 通配）', refererList);
    const refererEmptyLabel = el('label', { class: 'check' }, [refererAllowEmpty, el('span', { text: '允许 Referer 为空（直接访问）' })]);
    const syncReferer = () => {
      const on = refererMode.value !== 'off';
      refererListField.style.display = on ? '' : 'none';
      refererEmptyLabel.style.display = on ? '' : 'none';
    };
    refererMode.addEventListener('change', syncReferer);
    syncReferer();

    const botModeField = field('匹配模式', botMode);
    const botListField = field('Bot 特征关键字 / UA（逗号分隔，支持 /regex/ 正则）', botList);
    const botHint1 = el('div', { class: 'hint' }, '小白示例：直接填关键字如 scrapy、python-requests 即可拦截常见爬虫；想更灵活可写正则，如 /^HeadlessChrome/ 只拦无头浏览器，/bot/i 大小写不敏感地拦含 bot 的 UA。');
    const botHint2 = el('div', { class: 'hint' }, '黑名单：UA 命中任一特征即拦截；白名单：仅放行命中特征（如合法搜索引擎），其余视为 Bot 拦截。该字段独立于 ②.2 的 UA 黑名单，互不越界。');
    const syncBot = () => {
      const on = botEn.checked;
      [botModeField, botListField, botHint1, botHint2].forEach((n) => { n.style.display = on ? '' : 'none'; });
    };
    botEn.addEventListener('change', syncBot);
    syncBot();

    const signGrid = el('div', { class: 'grid2' }, [
      field('签名密钥', signKey),
      field('URL 参数名', signParam),
    ]);
    const signExpireField = field('签名有效期（秒）', signExpire);
    const syncSign = () => {
      const on = signEn.checked;
      signGrid.style.display = on ? '' : 'none';
      signExpireField.style.display = on ? '' : 'none';
    };
    signEn.addEventListener('change', syncSign);
    syncSign();

    const rateRpmField = field('每分钟最大请求数', rateRpm);
    const syncRate = () => { rateRpmField.style.display = rateEn.checked ? '' : 'none'; };
    rateEn.addEventListener('change', syncRate);
    syncRate();

    const body = el('div', {}, [
      el('div', { class: 'hint frag-note' }, 'fail-closed：任一包判定异常也按 403 拦截，绝不放行。以下 5 包全部通过才继续 ③ 首要分流。'),
      pack('sec-ip', '②.1 IP 访问规则', 'IP 黑名单优先于白名单拦截', [
        el('div', { class: 'grid2' }, [
          field('IP 黑名单（逗号分隔，支持 CIDR）', ipBlack),
          field('IP 白名单（逗号分隔，支持 CIDR）', ipWhite),
        ]),
      ]),
      pack('sec-waf', '②.2 WAF · 自定义规则（Referer / UA）', '防盗链校验请求 Referer；UA 关键字命中直接 403', [
        field('防盗链模式', refererMode),
        refererListField,
        refererEmptyLabel,
        field('User-Agent 黑名单关键字（逗号分隔）', uaList),
      ]),
      pack('sec-bot', '②.3 自动程序（Bot 管理）', '独立最小任务包：与 ②.2 的 UA 黑名单解耦。支持黑名单拦截 / 白名单仅放行两种模式', [
        el('label', { class: 'check' }, [botEn, el('span', { text: '启用 Bot 管理' })]),
        botModeField,
        botListField,
        botHint1,
        botHint2,
      ]),
      pack('sec-token', '②.4 Access · 令牌鉴权（签名 URL）⚠️实验特性', '仅允许携带合法签名的请求访问（常用于私有资源）。⚠️ 实验特性：校验侧已生效，但内置签名链接签发工具尚未提供，需自行用 HMAC 生成。', [
        el('label', { class: 'check' }, [signEn, el('span', { text: '启用签名 URL 校验' })]),
        signGrid,
        signExpireField,
        el('div', { class: 'hint warn' }, ['⚠️ 实验特性：内置「生成签名链接」工具待开发，开启后需自行用 HMAC-SHA256 签发带签名的 URL。']),
      ]),
      pack('sec-ratelimit', '②.5 速率限制', '单客户端（按 IP）每分钟最大请求数，超出返回 429', [
        el('label', { class: 'check' }, [rateEn, el('span', { text: '启用请求限速' })]),
        rateRpmField,
      ]),
    ]);

    openDrawer('安全防护: ' + host, '仅管理 ② 安全校验的 5 个最小任务包。不影响站点基础（①/③）、路由规则（④）与源站池（⑧）。', body, async () => {
      // 后端 saveSecurity 已是片段 API：仅合并 security 字段，互不越界
      await API.sites.saveSecurity(host, readSecurity());
      await refreshData();
    });
    scrollToAnchor(anchor);
  }

  // 路由规则：独立抽屉，只读写站点的 rules 字段，不碰基础/源站/安全（绝不越界）
  async function openRulesDrawer(host, opts) {
    if (!host) { toast('请先创建站点', 'err'); return; }
    let site;
    try { site = await API.sites.get(host); } catch (e) { toast(e.message, 'err'); return; }
    const poolOptions = buildPoolOptions();
    const confined = !!(opts && opts.allowedOps);

    const rulesBox = el('div', { class: 'rules-box' });
    const ruleReaders = [];
    const makeCard = (r) => {
      const { card, read } = buildRuleCard(r, poolOptions, site, opts || {});
      ruleReaders.push(read);
      rulesBox.appendChild(card);
    };
    const addRuleBtn = el('button', { class: 'btn btn-sm', text: '+ 添加规则' });
    addRuleBtn.onclick = () => makeCard(null);

    // 受限抽屉只展示属于本任务包的规则，避免把其它包的规则混进来导致误改
    const allRules = (site.rules && site.rules.length ? site.rules : []);
    const shownRules = confined && opts.match ? allRules.filter((r) => opts.match(r.action || {})) : allRules;
    shownRules.forEach(makeCard);

    const title = confined ? opts.title : '路由规则（规则引擎）: ' + host;
    const headText = confined ? opts.title : '路由规则（规则引擎）';
    const owner = confined ? opts.owner : '路由规则抽屉 · 规则卡片';
    // 始终把 rulesBox 放进 DOM：否则 shownRules 为空时「+ 添加规则」加进的是
    // 一个游离节点，界面毫无反应。空状态提示单独放一个节点，按列表是否为空切换。
    const emptyHint = el('p', { class: 'empty' }, '暂无属于本任务包的规则，点击「+ 添加规则」新建一条。');
    emptyHint.style.display = shownRules.length ? 'none' : '';
    const body = el('div', { id: 'sec-rules' }, [
      el('div', { class: 'hint' }, confined
        ? '本抽屉只管理「' + opts.title + '」这一最小任务包的规则，只能添加/编辑该包允许的动作类型，不会越界到其它包。保存时只合并 rules 字段。'
        : '按条件把请求路由到不同源站、改写路径、设置回源 Host、请求头、响应头、缓存等。修改不会影响站点基础设置、源站与安全防护。'),
      el('div', { class: 'subhead' }, [el('span', {}, headText), addRuleBtn]),
      emptyHint,
      rulesBox,
    ]);

    openDrawer(title, '仅管理本站点的路由规则。保存时只合并 rules 字段，互不越界。', body, async () => {
      const edited = ruleReaders.map((rd) => rd());
      if (confined && opts.match) {
        // 受限抽屉只动了属于本包的规则，其余规则原样保留，避免误删其它包的规则
        const editedIds = new Set(edited.map((r) => r.id));
        const kept = (site.rules || []).filter((r) => !editedIds.has(r.id) && !opts.match(r.action || {}));
        await API.sites.saveRules(host, kept.concat(edited));
      } else {
        await API.sites.saveRules(host, edited);
      }
      await refreshData();
    });
  }

  async function removeSite(host) {
    const ok = await confirmDialog('删除站点', '确定删除 ' + host + ' ？此操作不可恢复。');
    if (!ok) return;
    try {
      await API.sites.remove(host);
      toast('已删除', 'ok');
      await refreshData();
      await route(location.hash);
    } catch (e) { toast(e.message, 'err'); }
  }

  // ====== 源站（借鉴 nginx upstream：单一源站与源站池同为一等公民） ======

  /** 归一化 kind：兼容后端未回填 kind 的历史数据。 */
  function poolKind(p) {
    return p.kind || ((p.origins || []).length === 1 ? 'single' : 'pool');
  }

  /** 源站地址摘要，供列表「地址」列展示。 */
  function originSummary(p) {
    const list = p.origins || [];
    if (!list.length) return '—';
    const fmt = (o) => (o.engine === 'r2'
      ? \`r2:\${o.r2Binding || '?'}\`
      : \`\${o.scheme || 'https'}://\${o.addr || '?'}\${o.port && o.port !== 443 && o.port !== 80 ? ':' + o.port : ''}\`);
    return list.length === 1 ? fmt(list[0]) : \`\${fmt(list[0])} 等 \${list.length} 个\`;
  }

  /** 统一的源站下拉选项：单一源站在前、源站池在后，标签带类型前缀与地址摘要。 */
  function buildPoolOptions() {
    return [...APP_DATA.pools]
      .sort((a, b) => (poolKind(a) === poolKind(b) ? 0 : (poolKind(a) === 'single' ? -1 : 1)))
      .map((p) => ({
        value: p.id,
        label: \`\${poolKind(p) === 'single' ? '［单一］' : '［池］'} \${p.name || p.id} — \${originSummary(p)}\`,
      }));
  }

  /** 引用徽标：0 引用给出「可安全删除」提示，>0 时可点击查看是谁在用。 */
  function refsCell(p) {
    const refs = p.refs || [];
    if (!refs.length) {
      return el('span', { class: 'hint', text: '未被引用' });
    }
    const btn = el('button', {
      class: 'btn btn-sm',
      text: \`\${refs.length} 处引用\`,
      onclick: () => openRefsDrawer(p),
    });
    return btn;
  }

  async function renderPools() {
    const wrap = el('div', { class: 'section' });
    wrap.appendChild(el('div', { class: 'section-head' }, [
      el('h3', {}, '源站'),
      el('button', { class: 'btn btn-primary', text: '+ 新建源站池', onclick: () => openPoolDrawer(null, 'pool') }),
    ]));
    wrap.appendChild(el('div', { class: 'hint' },
      '这里纵览全部上游。「单一源站」= 一个地址，在新建/编辑站点时直接填写源站地址会自动创建并出现在这里；'
      + '「源站池」= 多个源站 + 负载均衡策略，只能用右上角按钮新建。两者引用方式一致，站点与规则都按同一个下拉选择。'));

    // 升级前遗留的「站点内联源站」尚未迁移：提示用户保存一次即可自动转成独立源站
    const legacy = APP_DATA.poolsLegacySites || [];
    if (legacy.length) {
      wrap.appendChild(el('div', { class: 'hint warn' },
        \`检测到 \${legacy.length} 个站点仍使用旧版「内联源站」（\${legacy.join('、')}），暂未出现在下表中。\`
        + '打开对应站点的「初始回源对象」抽屉保存一次，即可自动迁移为独立源站并纳入统一管理。'));
    }

    if (!APP_DATA.pools.length) {
      wrap.appendChild(el('p', { class: 'empty' }, '暂无源站。新建站点并填写源站地址会自动生成单一源站；需要多源站负载均衡请点「+ 新建源站池」。'));
      return wrap;
    }

    const order = { single: 0, pool: 1 };
    const sorted = [...APP_DATA.pools].sort((a, b) => {
      const d = order[poolKind(a)] - order[poolKind(b)];
      return d !== 0 ? d : String(a.name || a.id).localeCompare(String(b.name || b.id));
    });

    const rows = sorted.map((p) => {
      const kind = poolKind(p);
      const isSingle = kind === 'single';
      return [
        el('span', { class: 'badge ' + (isSingle ? 'badge-single' : 'badge-pool') },
          isSingle ? '单一源站' : '源站池'),
        p.name || p.id,
        originSummary(p),
        isSingle ? '—' : (p.strategy || 'chain'),
        String((p.origins || []).length),
        refsCell(p),
        actions([
          { label: '编辑', onClick: () => openPoolDrawer(p.id) },
          {
            label: '删除',
            cls: 'btn-danger',
            onClick: () => removePool(p.id, p),
          },
        ]),
      ];
    });
    wrap.appendChild(table(['类型', '名称', '地址', '策略', '源站数', '引用', '操作'], rows));
    return wrap;
  }

  /** 引用明细抽屉：列出谁在引用这个源站，可直接跳到对应站点。 */
  function openRefsDrawer(p) {
    const refs = p.refs || [];
    const rows = refs.map((r) => [
      r.type === 'site' ? '站点' : (r.type === 'globalRule' ? '全局规则' : '站点规则'),
      r.label || '—',
      r.detail || '—',
      r.host
        ? actions([{ label: '前往站点', onClick: () => { closeDrawer(); location.hash = '#/sites'; openSiteDrawer(r.host); } }])
        : el('span', { class: 'hint', text: '—' }),
    ]);
    const body = el('div', {}, [
      el('div', { class: 'hint' },
        \`「\${p.name || p.id}」当前被 \${refs.length} 处引用。存在引用时无法删除；请先把这些引用改指到别的源站。\`),
      rows.length
        ? table(['来源', '对象', '说明', '操作'], rows)
        : el('p', { class: 'empty' }, '暂无引用。'),
    ]);
    openDrawer('引用详情: ' + (p.name || p.id), '', body, null);
  }

  async function openPoolDrawer(id, forceKind) {
    let pool;
    if (id) {
      try { pool = await API.pools.get(id); } catch (e) { toast(e.message, 'err'); return; }
    } else {
      pool = { id: '', name: '', kind: forceKind || 'pool', strategy: 'chain', origins: [], failover: { enabled: true, maxRetries: 2, timeoutMs: 10000, retryOn: [500, 502, 503, 504, 522, 524] } };
    }
    // 类型一经创建不可随意切换：single→pool 允许（加源站即升级），pool→single 会丢数据故禁止
    const kind = forceKind || poolKind(pool);
    const isSingle = kind === 'single';
    const socketDisabled = !(APP_DATA.info && APP_DATA.info.caps && APP_DATA.info.caps.hasSocket);

    const originList = el('div', { id: 'origin-list' });
    // 调度策略下拉需在 addOrigin 之前创建：源站行里的「权重」字段要按策略显隐
    const strategySel = select('', [], pool.strategy || 'chain', [
      { value: 'chain', label: '链式回退（遇错换下一源站，最稳）' },
      { value: 'roundrobin', label: '轮询（轮流用每个源站）' },
      { value: 'random', label: '随机' },
      { value: 'weighted', label: '加权（按权重分配，权重越大越多）' },
      { value: 'iphash', label: 'IP 哈希（同 IP 总落到同一源站，利于会话）' },
    ]);
    strategySel.className = 'input';
    // 收集各源站的「权重」字段，调度策略变化时统一显隐（仅加权策略需要权重）
    const weightFields = [];
    const syncWeight = () => {
      const on = strategySel.value === 'weighted';
      weightFields.forEach((f) => { f.style.display = on ? '' : 'none'; });
    };
    strategySel.addEventListener('change', syncWeight);
    const addOrigin = (o) => {
      // 源站组只负责「地址 + 负载均衡」，回源 Host / 路径 / 请求头等一律在规则引擎里绑定
      o = o || { id: '', enabled: true, order: 0, weight: 1, engine: 'fetch', scheme: 'https', addr: '', port: 443 };
      const engineSel = select('', [], '', [
        { value: 'fetch', label: 'fetch' },
        { value: 'socket', label: 'socket（仅 Workers）', disabled: socketDisabled },
        { value: 'r2', label: 'r2（回源到 R2 桶，仅 CF）', disabled: !(APP_DATA.info && APP_DATA.info.caps && APP_DATA.info.caps.hasR2) },
      ]);
      engineSel.value = o.engine || 'fetch';
      engineSel.className = 'input o-engine';
      // ---- R2 引擎专用字段 ----
      const r2BindingIn = el('input', { class: 'input o-r2-binding', value: o.r2Binding || '', placeholder: 'CDN_R2（必须与 wrangler.toml 的 binding 一致）' });
      const r2KeyPrefixIn = el('input', { class: 'input o-r2-prefix', value: o.r2KeyPrefix || '', placeholder: '如 img/（桶内目录隔离，留空=无）' });
      const r2KeyModeSel = select('', [''], o.r2KeyMode || 'none', [
        { value: 'none', label: 'none（pathname 原样作 key）' },
        { value: 'prefix', label: 'prefix（在 key 前加前缀）' },
        { value: 'strip', label: 'strip（剥除开头串）' },
        { value: 'regex', label: 'regex（正则替换）' },
      ], 'o-r2-keymode');
      const r2RuleIn = el('input', { class: 'input o-r2-rule', value: o.r2KeyPrefixRule || '', placeholder: 'prefix/strip: 前缀串；regex: 正则' });
      const r2ToIn = el('input', { class: 'input o-r2-to', value: o.r2KeyRegexTo || '', placeholder: 'regex 模式下的替换值' });
      const r2RuleField = field('转换参数（r2KeyPrefixRule）', r2RuleIn, 'prefix/strip 时填前缀/要剥除的开头；regex 时填正则在 r2KeyPrefixRule。');
      const r2ToField = field('正则替换值（r2KeyRegexTo）', r2ToIn, '仅 regex 模式使用。');
      const r2Fields = el('div', { class: 'o-r2-fields' }, [
        field('R2 绑定名（r2Binding）', r2BindingIn, 'wrangler.toml 里 [[r2_buckets]].binding 的值，如 CDN_R2。引擎选 r2 时必填。'),
        field('R2 key 前缀（r2KeyPrefix）', r2KeyPrefixIn, '拼到最终 key 前面的固定串，用于多站点共用一个桶时隔离目录。'),
        field('pathname → key 转换方式（r2KeyMode）', r2KeyModeSel, 'none 原样；prefix 在前加串；strip 剥开头串；regex 用正则替换。规则级 rewrite 已先作用，这里做最后一步。'),
        r2RuleField,
        r2ToField,
      ]);
      // key 转换方式决定后续参数：none 无需参数，regex 才需要替换值
      const syncR2Key = () => {
        const m = r2KeyModeSel.value;
        r2RuleField.style.display = (m === 'prefix' || m === 'strip' || m === 'regex') ? '' : 'none';
        r2ToField.style.display = m === 'regex' ? '' : 'none';
      };
      r2KeyModeSel.onchange = syncR2Key;
      syncR2Key();
      const addrField = field('源站地址（域名 / IP）', el('input', { class: 'input o-addr', value: o.addr || '', placeholder: 'storage.example.net' }), '你的真实服务器地址。');
      const portField = field('端口', el('input', { class: 'input o-port', type: 'number', value: o.port || 443 }), 'https 默认 443，http 默认 80。');
      const schemeField = field('协议', select('', [''], o.scheme || 'https', [{ value: 'https', label: 'https' }, { value: 'http', label: 'http' }], 'o-scheme'));
      const hostField = field('回源 Host（该源站专用）', el('input', { class: 'input o-host', value: o.hostHeader?.custom || '', placeholder: '如 api1.internal（留空=用规则/站点级 Host）' }), '仅这台源站回源时使用的 Host 头。同组多源站各自 Host 不同时填这里；规则里再设 Host 会覆盖它。');
      // fetch 引擎无法手写 Host 头（平台强制 Host = 回源 URL hostname），
      // 该字段只有 socket 引擎能真正生效，故仅 socket 时显示。
      const hostNote = el('div', { class: 'hint', text: 'fetch 引擎下该 Host 由回源地址决定、无法自定义；如需自定义 Host 请把引擎改为 socket。' });
      // 权重仅在「加权」调度策略下生效，其余策略隐藏（syncWeight 在策略下拉建好后统一调用）
      const weightField = field('权重（加权策略生效）', el('input', { class: 'input o-weight', type: 'number', value: o.weight || 1 }), '默认 1 即可。');
      weightFields.push(weightField);
      const syncEngine = () => {
        const eng = engineSel.value;
        const isR2 = eng === 'r2';
        r2Fields.style.display = isR2 ? '' : 'none';
        addrField.style.display = isR2 ? 'none' : '';
        portField.style.display = isR2 ? 'none' : '';
        schemeField.style.display = isR2 ? 'none' : '';
        hostField.style.display = eng === 'socket' ? '' : 'none';
        hostNote.style.display = eng === 'fetch' ? '' : 'none';
      };
      engineSel.onchange = syncEngine;
      const row = el('div', { class: 'origin-row' }, [
        addrField,
        portField,
        schemeField,
        field('路径前缀', el('input', { class: 'input o-pathprefix', value: o.pathPrefix || '', placeholder: '如 /api/v1（留空=用请求原路径）' }), '追加在请求路径前面的固定前缀，每个源站可不同。例如三台同服务源站分别填 /node1、/node2、/node3，请求 /img/x.png 会分别回源到 /node1/img/x.png 等。留空则不加。'),
        hostField,
        hostNote,
        field('引擎', engineSel, '回源方式：① fetch=标准回源，Host 头由「回源域名/地址」决定（源站只看到自己的域名，最通用，所有平台可用）；② socket=仅 CF Workers 支持，基于裸 TCP 手写 HTTP，可自定义 Host / 回源裸 IP / 非标端口（用于源站要靠 Host 做虚拟主机路由、或只暴露 IP 的场景）；③ r2=回源到 R2 桶（仅 CF，需先在 wrangler.toml 绑定）。'),
        r2Fields,
        weightField,
        el('button', { class: 'btn btn-sm btn-danger', text: '移除源站', onclick: () => row.remove() }),
      ]);
      syncEngine(); // 回显时根据已有 engine 显隐 R2 字段
      originList.appendChild(row);
    };
    (pool.origins || []).forEach(addOrigin);
    if (!pool.origins || !pool.origins.length) addOrigin();
    syncWeight();

    const strategyField = field('调度策略', strategySel, '多个源站之间怎么分配请求。新手直接用「链式回退」最省心。');
    // 单一源站只有 1 个 origin，无调度可言；也不允许在这里加第 2 个源站。
    const addOriginBtn = el('button', { class: 'btn btn-sm', text: '+ 添加源站', onclick: () => { addOrigin(); syncWeight(); } });
    if (isSingle) {
      strategyField.style.display = 'none';
      addOriginBtn.style.display = 'none';
    }

    const refsInfo = (pool.refs && pool.refs.length)
      ? el('div', { class: 'hint' }, \`当前被 \${pool.refs.length} 处引用：\${pool.refs.map((r) => r.label).filter((v, i, a) => a.indexOf(v) === i).join('、')}。修改地址会立刻影响这些站点。\`)
      : el('div', { class: 'hint' }, '当前未被任何站点或规则引用。');

    const body = el('div', {}, [
      // 机器主键 id 由系统自动生成，用户绝不可填；此处仅展示（编辑时可见）
      field(
        '源站 ID（系统自动生成）',
        el('input', { class: 'input', id: 'p-id', value: pool.id || '', placeholder: '保存后自动生成（如 pl_xxx）', disabled: true })
      ),
      field('类型', el('input', {
        class: 'input',
        value: isSingle ? '单一源站（1 个地址）' : '源站池（多源站 + 负载均衡）',
        disabled: true,
      }), isSingle
        ? '单一源站通常由「新建站点时直接填写源站地址」自动创建。若要升级为源站池，请新建一个源站池并把站点改指过去。'
        : '源站池只能在「源站」页手动新建，可被多个站点/规则共享引用。'),
      field('名称（可选，用于区分）', el('input', { class: 'input', id: 'p-name', value: pool.name || '', placeholder: '如：主站源站 / 北京备份' }), '给自己看的备注，方便在站点和规则里选对源站。'),
      strategyField,
      refsInfo,
      el('div', { class: 'hint' }, '源站只负责「地址 + 负载均衡」。回源 Host、路径重写、请求头、响应头、缓存等均由「站点 → 规则引擎」按条件绑定，不在此处设置。源站按列表顺序决定链式回退（越靠前越优先）。「源站 ID」是给机器引用用的内部主键，由系统自动生成、不可改；如需给人区分，请填上面的「名称」。'),
      el('div', { id: 'origin-head', class: 'subhead' }, [
        el('span', {}, isSingle ? '源站地址' : '源站列表'),
        addOriginBtn,
      ]),
      originList,
    ]);
    const kindLabel = isSingle ? '单一源站' : '源站池';
    openDrawer(id ? \`编辑\${kindLabel}: \` + (pool.name || id) : \`新建\${kindLabel}\`, '', body, async () => {
      const pid = pool.id || ''; // 系统主键，编辑时才有；新建为空 → 后端自动生成
      const origins = [];
      Array.from(originList.children).forEach((row, i) => {
        const engine = $('.o-engine', row).value;
        const addr = $('.o-addr', row).value.trim();
        // r2 引擎无公网地址，按 r2Binding 标识；其余引擎必须有 addr
        if (engine !== 'r2' && !addr) return;
        // 保留既有源站的回源高级配置（hostHeader/extraHeaders/pathPrefix），
        // 这些由规则引擎托管，前端此处不编辑，但编辑源站池时不应清空
        const legacy = (pool.origins && pool.origins[i]) || {};
        const r2KeyMode = $('.o-r2-keymode', row) ? $('.o-r2-keymode', row).value : 'none';
        origins.push({
          id: 'o' + i + '_' + (engine === 'r2' ? ($('.o-r2-binding', row).value.trim() || 'r2') : addr),
          enabled: true, order: i, weight: Number($('.o-weight', row).value) || 1,
          engine,
          scheme: $('.o-scheme', row) ? $('.o-scheme', row).value : 'https',
          addr: engine === 'r2' ? '' : addr,
          port: Number($('.o-port', row).value) || 443,
          pathPrefix: ($('.o-pathprefix', row).value || '').trim() || legacy.pathPrefix || '',
          hostHeader: ($('.o-host', row).value || '').trim()
            ? { mode: 'custom', custom: ($('.o-host', row).value || '').trim() }
            : (legacy.hostHeader || { mode: 'inherit', custom: '' }),
          extraHeaders: legacy.extraHeaders || {},
          ...(engine === 'r2'
            ? {
                r2Binding: $('.o-r2-binding', row).value.trim(),
                r2KeyPrefix: $('.o-r2-prefix', row).value.trim(),
                r2KeyMode,
                r2KeyPrefixRule: $('.o-r2-rule', row).value.trim(),
                r2KeyRegexTo: $('.o-r2-to', row).value.trim(),
              }
            : {}),
          // 纯两层架构（站点级 + 源站级基础地址/引擎）：源站级不再承载专属回源规则
          // （路径重写/缓存/请求头/响应头/超时/跟随3xx 一律由「路由规则」按条件绑定，
          // 旧数据若残留这些字段将由后端 failover 原样保留、但不在此编辑）。
        });
      });
      if (!origins.length) throw new Error(isSingle ? '请填写源站地址' : '至少需要一个源站');
      if (isSingle && origins.length > 1) throw new Error('单一源站只能有 1 个地址；需要多个请新建「源站池」');
      const payload = {
        name: $('p-name').value.trim(),
        kind,
        strategy: isSingle ? 'chain' : strategySel.value,
        origins,
        failover: pool.failover || { enabled: true, maxRetries: 2, timeoutMs: 10000, retryOn: [500, 502, 503, 504, 522, 524] },
        ...(pool.createdBy ? { createdBy: pool.createdBy } : {}),
      };
      // 编辑（有 id）走 PUT；新建（无 id）走 POST，机器 id 由后端生成
      await API.pools.save(pid || null, payload);
      await refreshData();
    });
  }

  async function removePool(id, pool) {
    const p = pool || APP_DATA.pools.find((x) => x.id === id) || {};
    const kindName = poolKind(p) === 'single' ? '单一源站' : '源站池';
    const refs = p.refs || [];
    if (refs.length) {
      const who = [...new Set(refs.map((r) => r.label))].join('、');
      toast(\`该\${kindName}仍被 \${refs.length} 处引用（\${who}），请先改指其它源站再删除\`, 'err');
      return;
    }
    const ok = await confirmDialog(
      \`删除\${kindName}\`,
      \`确定删除「\${p.name || id}」？此操作不可恢复。\`
    );
    if (!ok) return;
    try {
      await API.pools.remove(id);
      toast('已删除', 'ok');
      await refreshData();
      await route(location.hash);
    } catch (e) { toast(e.message, 'err'); }
  }

  // ====== 缓存管理 ======
  async function renderCache() {
    const wrap = el('div', { class: 'section' });
    wrap.appendChild(el('h3', {}, '缓存管理'));
    if (!APP_DATA.sites.length) {
      wrap.appendChild(el('p', { class: 'empty' }, '暂无站点。'));
      return wrap;
    }
    const rows = APP_DATA.sites.map((s) => [
      s.host, String(s.cacheGen || 0),
      actions([
        { label: '代次失效', onClick: () => purgeSite(s.host) },
      ]),
    ]);
    wrap.appendChild(table(['Host', '当前代次', '操作'], rows));
    return wrap;
  }

  async function purgeSite(host) {
    const ok = await confirmDialog(
      '清除缓存',
      '站点 ' + host + '\\n操作：代次失效（递增缓存代次，新请求全部回源），是否继续？'
    );
    if (!ok) return;
    try {
      await API.cache.purge({ host });
      toast('已触发代次失效', 'ok');
      await refreshData();
      await route(location.hash);
    } catch (e) { toast(e.message, 'err'); }
  }

  // ====== 系统设置 ======
  async function renderSystem() {
    const wrap = el('div', { class: 'section' });
    wrap.appendChild(el('h3', {}, '系统设置'));

    let info = APP_DATA.info;
    if (!info) { try { info = await API.system.info(); APP_DATA.info = info; } catch (e) { toast(e.message, 'err'); } }

    const caps = (info && info.caps) || {};
    const rows = [
      ['运行平台', (info && info.platform) || PLATFORM],
      ['版本', (info && info.version) || '—'],
      ['边缘缓存', caps.hasEdgeCache ? '可用' : '不可用（降级）'],
      ['TCP Socket', caps.hasSocket ? '可用' : '不可用（socket 引擎降级 fetch）'],
      ['D1', caps.hasD1 ? '可用' : '不可用'],
      ['KV', caps.hasKV ? '可用' : '不可用（配置无法持久化！）'],
      ['统计驱动', (info && info.statsDriver) || 'none'],
    ];
    if (info && Array.isArray(info.limitations) && info.limitations.length) {
      wrap.appendChild(el('div', { class: 'banner warn' },
        info.limitations.map((l) => el('div', {}, '⚠ ' + l.message))));
    }
    wrap.appendChild(table(['项目', '状态'], rows));

    // 全局配置卡片（导航无独立 global 项，合并到系统页）
    //
    // 关键：这里必须持有各输入框的「节点引用」，不能靠 $('g-xxx') 按 id 全局查找。
    // renderSystem() 返回的 wrap 是在函数结束、由 route() 才 append 到 #content 的，
    // 函数体内 document 里根本不存在这些 id，$() 返回 null —— 回填时会抛
    // TypeError（表现为打开设置页永远是空值），保存时同样取不到值。
    const gAdminPath = el('input', { class: 'input', id: 'g-adminPath', placeholder: 'panel' });
    const gTokenTtl = el('input', { class: 'input', id: 'g-tokenTtl', type: 'number' });
    const gConfigCacheTtl = el('input', { class: 'input', id: 'g-configCacheTtl', type: 'number' });
    const gGlobalRateLimit = el('input', { class: 'input', id: 'g-globalRateLimit', type: 'number', placeholder: '0 表示不限制' });
    const gStatsEnabled = el('input', { type: 'checkbox', id: 'g-statsEnabled' });
    const gStatsDriver = select('g-statsDriver', [], '', [
      { value: 'kv', label: 'KV' },
      { value: 'd1', label: 'D1' + (caps.hasD1 ? '' : '（当前平台不可用）'), disabled: !caps.hasD1 },
      { value: 'none', label: '关闭' },
    ]);

    // 未启用统计时「统计驱动」无意义，完全隐藏
    const gStatsDriverField = field('统计驱动', gStatsDriver);
    const syncStats = () => { gStatsDriverField.style.display = gStatsEnabled.checked ? '' : 'none'; };
    gStatsEnabled.addEventListener('change', syncStats);
    syncStats();

    // 表单回填：统一入口，保存后与首次载入复用同一套逻辑
    const fillGlobalForm = (cfg) => {
      if (!cfg) return;
      gAdminPath.value = cfg.adminPath || '';
      gTokenTtl.value = cfg.tokenTtl != null ? cfg.tokenTtl : '';
      gConfigCacheTtl.value = cfg.configCacheTtl != null ? cfg.configCacheTtl : '';
      gStatsEnabled.checked = !!cfg.statsEnabled;
      gStatsDriver.value = cfg.statsDriver || 'none';
      gGlobalRateLimit.value = cfg.globalRateLimit != null ? cfg.globalRateLimit : '';
      syncStats();
    };

    const cfgCard = el('div', { class: 'card-block' }, [
      el('h4', {}, '全局配置'),
      el('div', { class: 'form-stack', id: 'global-form' }, [
        field('管理面路径', gAdminPath, '留空表示沿用当前已保存的值。'),
        field('Token 有效期（秒）', gTokenTtl, '留空表示沿用当前已保存的值。'),
        field('配置缓存 TTL（秒）', gConfigCacheTtl, '留空表示沿用当前已保存的值。'),
        field('全局限流（req/s）⚠️实验特性', gGlobalRateLimit, '⚠️ 实验特性（待开发）：全局请求频率上限，0 表示不限制；最少 10 req/s。当前为实验阶段，不建议生产依赖。'),
        field('启用统计', gStatsEnabled),
        gStatsDriverField,
      ]),
      el('div', { class: 'section-head' }, [
        el('button', {
          class: 'btn btn-primary', text: '保存全局配置',
          onclick: async () => {
            // 留空字段传空串，交由后端 validateGlobal(input, caps, current) 沿用旧值。
            // 注意不要用 Number(...)||0 —— 那会把「留空」变成显式 0，反而覆盖掉旧值。
            const payload = {
              adminPath: gAdminPath.value.trim(),
              tokenTtl: gTokenTtl.value.trim(),
              configCacheTtl: gConfigCacheTtl.value.trim(),
              globalRateLimit: gGlobalRateLimit.value.trim(),
              statsEnabled: gStatsEnabled.checked,
              statsDriver: gStatsDriver.value,
            };
            try {
              // 后端会静默钳制/回退非法值（如 adminPath 非法字符、tokenTtl 越界），
              // 因此以响应中的规范化结果回填表单，避免界面显示与实际存储不一致
              const saved = await API.config.save(payload);
              fillGlobalForm(saved);

              // 仅比较用户「确实填了」的字段，留空字段本就期望被后端替换成旧值，
              // 不应算作「被修正」而误报警告
              const adjusted = Object.keys(payload).filter((k) => {
                const v = payload[k];
                if (typeof v === 'string' && v === '') return false;
                return String(v) !== String(saved[k]);
              });
              if (adjusted.length) {
                toast('已保存，但部分值被后端修正：' + adjusted.join('、'), 'warn');
              } else {
                toast('已保存全局配置', 'ok');
              }
              await loadAll();
            } catch (e) { toast(e.message, 'err'); }
          },
        }),
      ]),
    ]);
    wrap.appendChild(cfgCard);

    // 载入现有全局配置填入表单（此时操作的是节点引用，无需已挂载到 document）
    try {
      fillGlobalForm(await API.config.get());
    } catch (e) { /* 配置尚未初始化时忽略 */ }

    wrap.appendChild(el('div', { class: 'section-head' }, [
      el('button', { class: 'btn', text: '导出配置', onclick: exportConfig }),
      el('button', { class: 'btn', text: '导入配置', onclick: importConfig }),
      el('button', { class: 'btn', text: '修改密码', onclick: openChangePassword }),
      el('button', { class: 'btn btn-danger', text: '退出登录', onclick: doLogout }),
    ]));
    return wrap;
  }

  // 导入配置：读本地 JSON 文件后调 /system/import 整体恢复（备份恢复手段）
  async function importConfig() {
    const ok = await confirmDialog(
      '导入配置',
      '导入将覆盖当前全部站点/源站池/全局规则/全局配置等，且不可恢复。确认继续？',
      { confirmText: 'IMPORT' }
    );
    if (!ok) return;
    const input = el('input', { type: 'file', accept: '.json,application/json' });
    input.onchange = async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      let cfg;
      try {
        cfg = JSON.parse(await file.text());
      } catch {
        toast('配置文件不是合法的 JSON', 'err');
        return;
      }
      try {
        const res = await API.system.import(cfg);
        const msg = res && res.message ? res.message : '配置已导入';
        const errs = res && Array.isArray(res.errors) && res.errors.length ? \`，\${res.errors.length} 项失败\` : '';
        toast(msg + errs, res && res.errors && res.errors.length ? 'warn' : 'ok');
        await loadAll();
      } catch (e) { toast(e.message, 'err'); }
    };
    input.click();
  }

  // 修改密码：自建轻量 modal 表单收集旧/新密码，校验后调 /auth/password。
  // 项目本身没有通用 modal()，这里直接构建覆盖层并复用样式，避免引入不存在的函数。
  function openChangePassword() {
    const oldI = el('input', { class: 'input', type: 'password', placeholder: '当前密码' });
    const newI = el('input', { class: 'input', type: 'password', placeholder: '新密码（至少 8 位）' });
    const confI = el('input', { class: 'input', type: 'password', placeholder: '确认新密码' });

    const mask = el('div', { class: 'modal-mask', style: 'display:flex;' }, [
      el('div', { class: 'modal' }, [
        el('h3', { class: 'modal-title', text: '修改密码' }),
        el('div', { class: 'modal-text', text: '修改成功后需重新登录。' }),
        el('div', { class: 'modal-extra' }, [
          field('当前密码', oldI),
          field('新密码', newI),
          field('确认新密码', confI),
        ]),
        el('div', { class: 'modal-foot', style: 'margin-top:16px;display:flex;gap:8px;justify-content:flex-end;' }, [
          el('button', { class: 'btn', text: '取消', onclick: () => mask.remove() }),
          el('button', {
            class: 'btn btn-primary',
            text: '确认修改',
            onclick: async () => {
              if ((newI.value || '').length < 8) { toast('新密码至少 8 位', 'err'); return; }
              if (newI.value !== confI.value) { toast('两次输入的新密码不一致', 'err'); return; }
              try {
                const res = await API.auth.changePassword(oldI.value, newI.value);
                mask.remove();
                toast(res && res.reloginRequired ? '密码已修改，请重新登录' : '密码已修改', 'ok');
                if (res && res.reloginRequired) setTimeout(doLogout, 800);
              } catch (e) { toast(e.message, 'err'); }
            },
          }),
        ]),
      ]),
    ]);
    document.body.appendChild(mask);
  }

  async function exportConfig() {
    try {
      const resp = await API.system.export();
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = el('a', { href: url, download: 'edgecdn-config.json' });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { toast(e.message, 'err'); }
  }

  // 表单助手 --------------------------------------------------------------
  // 表单字段：label + 控件 + 可选的人话说明 hint（小白友好）
  function field(label, control, hint) {
    return el('div', { class: 'form-field' }, [
      el('label', { class: 'label' }, label),
      control,
      hint ? el('div', { class: 'field-hint muted' }, hint) : null,
    ]);
  }

  // 把分组结构渲染成带 <optgroup> 的 <select>：分类名只做分组标题，
  // 不再作为一个 value='' 的可选项出现在下拉里（以前会误导用户去选「网络优化」）。
  function selectWithGroups(groups, value) {
    const sel = el('select', { class: 'input' });
    sel.appendChild(el('option', { value: '' }, '请选择要添加的操作…'));
    for (const g of groups) {
      const og = el('optgroup', { label: g.group });
      for (const it of g.items) og.appendChild(el('option', { value: it.value }, it.label));
      sel.appendChild(og);
    }
    if (value != null) sel.value = value;
    return sel;
  }
  function select(id, options, value, preset, extraClass) {
    const opts = preset || options.map((o) => ({ value: o.value != null ? o.value : o, label: o.label != null ? o.label : o }));
    const cls = 'input' + (extraClass ? ' ' + extraClass : '');
    const sel = el('select', id ? { id, class: cls } : { class: cls },
      opts.map((o) => {
        const node = el('option', { value: o.value }, o.label);
        if (o.value === value) node.selected = true;
        if (o.disabled) node.disabled = true;
        return node;
      }));
    return sel;
  }

  async function refreshData() {
    const [sites, pools] = await Promise.all([
      API.sites.list().catch(() => ({ sites: [] })),
      API.pools.list().catch(() => ({ pools: [] })),
    ]);
    APP_DATA.sites = sites.sites || [];
    APP_DATA.pools = pools.pools || [];
    APP_DATA.poolsLegacySites = pools.legacySites || [];
  }

  // 主题切换（轻量） ------------------------------------------------------
  function bindTheme() {
    const btn = $('theme-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const root = document.documentElement;
      const dark = !root.classList.contains('light');
      root.classList.toggle('light', dark);
    });
  }

  // 启动 ------------------------------------------------------------------
  function bindStatic() {
    const doSubmit = (e) => {
      if (e && e.preventDefault) e.preventDefault();
      // 提交期间禁用按钮，避免重复点击/原生表单提交导致的整页刷新
      const btn = $('login-btn');
      if (btn) btn.disabled = true;
      doLogin($('login-pwd').value).finally(() => {
        if (btn) btn.disabled = false;
      });
    };
    const form = $('login-form');
    if (form) form.addEventListener('submit', doSubmit);
    // 登录按钮改为显式点击触发（type=button），杜绝 form 原生 GET 提交把 URL
    // 变成 \`.../__panel?\` 并整页刷新回到登录页（CNB 公网代理环境下尤甚）
    const loginBtn = $('login-btn');
    if (loginBtn) {
      loginBtn.type = 'button';
      loginBtn.addEventListener('click', doSubmit);
    }
    const eye = $('login-eye');
    if (eye) eye.addEventListener('click', () => {
      const p = $('login-pwd');
      p.type = p.type === 'password' ? 'text' : 'password';
    });
    $('logout-btn') && $('logout-btn').addEventListener('click', doLogout);
    $('drawer-close') && ($('drawer-close').onclick = closeDrawer);
    $('drawer-cancel') && ($('drawer-cancel').onclick = closeDrawer);
    $('drawer-mask') && $('drawer-mask').addEventListener('click', closeDrawer);
    $('menu-btn') && $('menu-btn').addEventListener('click', () => { $('sidebar').classList.add('open'); $('sidebar-mask').hidden = false; });
    $('sidebar-close') && $('sidebar-close').addEventListener('click', () => { $('sidebar').classList.remove('open'); $('sidebar-mask').hidden = true; });
    $('sidebar-mask') && $('sidebar-mask').addEventListener('click', () => { $('sidebar').classList.remove('open'); $('sidebar-mask').hidden = true; });
    $$nav().forEach((a) => a.addEventListener('click', () => { $('sidebar').classList.remove('open'); $('sidebar-mask').hidden = true; }));
    bindTheme();
    window.addEventListener('hashchange', () => route(location.hash));
  }

  async function boot() {
    try {
      bindStatic();
      // 先看是否已有会话（HttpOnly Cookie）
      if (await ensureAuth()) {
        enterApp();
      } else {
        showLogin();
      }
    } catch (e) {
      // 最坏情况兜底：任何启动异常都回退到登录视图，绝不白屏
      console.error('[boot] fatal:', e && e.message || e);
      showLogin();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
`});var Os={};ze(Os,{socketFetch:()=>Nl});async function Nl(e,n,t,r,o){if(!e.caps?.hasSocket)throw new Error("socket engine not supported on this platform");let s=await $l(),a=new URL(String(t)),i=Number(o)>0?Number(o):1e4,l=Number(n.port)||(a.protocol==="https:"?443:80),c=n.addr||a.hostname,d=(n.scheme||a.protocol.replace(":",""))==="https",p=d?{secureTransport:"on",allowHalfOpen:!1}:{allowHalfOpen:!1};d&&n.sni&&(p.servername=n.sni);let u=s({hostname:c,port:l},p);u.opened&&await u.opened;let h=u.writable.getWriter();try{let g=Ml(e,n,a,r);await h.write(g);let b=(e.request.method||"GET").toUpperCase();return b!=="GET"&&b!=="HEAD"&&e.request.body&&await ql(e.request.body,h),h.releaseLock(),await Ul(u,i,b)}catch(g){try{h.releaseLock()}catch{}try{await u.close()}catch{}throw g}}async function $l(){try{let e=await import("cloudflare:sockets");if(typeof e?.connect!="function")throw new Error("connect() not found in cloudflare:sockets");return e.connect}catch(e){throw new Error(`cloudflare:sockets unavailable: ${e?.message||e}`)}}function Ml(e,n,t,r){let o=(e.request.method||"GET").toUpperCase(),s=`${t.pathname}${t.search}`,a=Fl(e,n,t),i=[`${o} ${s} HTTP/1.1`,`Host: ${a}`];for(let[l,c]of r){let d=l.toLowerCase();d==="host"||d==="connection"||d==="transfer-encoding"||i.push(`${l}: ${c}`)}return i.push("Connection: close"),i.push("",""),new TextEncoder().encode(i.join(`\r
`))}function Fl(e,n,t){switch(n?.hostHeader?.mode||"origin"){case"client":return e.url.host;case"custom":return n.hostHeader.custom||t.host;default:return t.host}}async function ql(e,n){let t=e.getReader();for(;;){let{done:r,value:o}=await t.read();if(r)break;o&&await n.write(o)}}async function Ul(e,n,t){let r=e.readable.getReader(),o=!1,s=setTimeout(()=>{o=!0,e.close().catch(()=>{})},n);try{let a=new Uint8Array(0),i=-1;for(;i<0;){let{done:F,value:q}=await r.read();if(F)break;if(q&&(a=Hs(a,q),i=Kl(a),a.length>65536&&i<0))throw new Error("response header too large")}if(o)throw new Error(`socket timeout after ${n}ms`);if(i<0)throw new Error("malformed response: header terminator not found");let l=new TextDecoder().decode(a.slice(0,i)),c=a.slice(i+4),d=l.split(`\r
`),p=d.shift()||"",u=/^HTTP\/1\.[01]\s+(\d{3})\s*(.*)$/.exec(p);if(!u)throw new Error(`malformed status line: ${p.slice(0,100)}`);let h=parseInt(u[1],10),g=u[2]||"",b=new Headers;for(let F of d){let q=F.indexOf(":");if(q<=0)continue;let U=F.slice(0,q).trim(),S=F.slice(q+1).trim();try{b.append(U,S)}catch{}}let y=/chunked/i.test(b.get("transfer-encoding")||""),x=b.has("content-length")?parseInt(b.get("content-length"),10):null;if(b.delete("transfer-encoding"),b.delete("connection"),b.delete("content-encoding-hint"),t==="HEAD"||h===204||h===304)return clearTimeout(s),r.releaseLock(),e.close().catch(()=>{}),new Response(null,{status:h,statusText:g,headers:b});let _=y?zl(r,c,e,s):Bl(r,c,e,s,x);return new Response(_,{status:h,statusText:g,headers:b})}catch(a){clearTimeout(s);try{r.releaseLock()}catch{}throw e.close().catch(()=>{}),a}}function Bl(e,n,t,r,o){let s=0;return new ReadableStream({start(a){n.length>0&&(a.enqueue(n),s+=n.length),o!==null&&s>=o&&Be(a,e,t,r)},async pull(a){try{let{done:i,value:l}=await e.read();if(i){Be(a,e,t,r);return}l&&(a.enqueue(l),s+=l.length,o!==null&&s>=o&&Be(a,e,t,r))}catch(i){clearTimeout(r),a.error(i),t.close().catch(()=>{})}},cancel(){clearTimeout(r),t.close().catch(()=>{})}})}function zl(e,n,t,r){let o=n,s=!1;function a(i){for(;;){let l=Gl(o);if(l<0)return!1;let c=new TextDecoder().decode(o.slice(0,l)),d=parseInt(c.split(";")[0].trim(),16);if(!Number.isFinite(d))return i.error(new Error(`malformed chunk size: ${c.slice(0,50)}`)),!0;if(d===0)return!0;let p=l+2,u=p+d;if(o.length<u+2)return!1;i.enqueue(o.slice(p,u)),o=o.slice(u+2)}}return new ReadableStream({async pull(i){if(!s)try{if(a(i)){s=!0,Be(i,e,t,r);return}let{done:l,value:c}=await e.read();if(l){s=!0,Be(i,e,t,r);return}c&&(o=Hs(o,c),a(i)&&(s=!0,Be(i,e,t,r)))}catch(l){clearTimeout(r),i.error(l),t.close().catch(()=>{})}},cancel(){clearTimeout(r),t.close().catch(()=>{})}})}function Be(e,n,t,r){clearTimeout(r);try{e.close()}catch{}try{n.releaseLock()}catch{}t.close().catch(()=>{})}function Hs(e,n){if(e.length===0)return n;if(n.length===0)return e;let t=new Uint8Array(e.length+n.length);return t.set(e,0),t.set(n,e.length),t}function Gl(e){for(let n=0;n+1<e.length;n++)if(e[n]===13&&e[n+1]===10)return n;return-1}function Kl(e){for(let n=0;n+3<e.length;n++)if(e[n]===13&&e[n+1]===10&&e[n+2]===13&&e[n+3]===10)return n;return-1}var Ls=X(()=>{});var st=null,ar=null;function B(e){try{return globalThis[e]}catch{return}}function Js(){try{let e=B("navigator");if(e&&typeof e.userAgent=="string")return e.userAgent.toLowerCase()}catch{}return""}function ge(e,n){if(e&&e[n]!=null)return String(e[n]);try{let t=B("process");if(t&&t.env&&t.env[n]!=null)return String(t.env[n])}catch{}}function lr(){try{let e=B("caches");return typeof e<"u"&&e!==null&&typeof e.default<"u"}catch{return!1}}function Zs(){return!!(Js().includes("cloudflare-workers")||typeof B("WebSocketPair")=="function"||lr())}function ea(e,n){let t=(ge(e,"CLOUD_PLATFORM")||"").toLowerCase();if(t==="edgeone"||t==="tencent"||t==="tencent-edgeone")return!0;if(n)return!1;if(B("EdgeOne")!==void 0||B("eo")!==void 0||B("EdgeRuntime")!==void 0||B("edgeone")!==void 0||ge(e,"EO_CLOUD_FUNCTION")!=null||ge(e,"EDGEONE_CLOUD_FUNCTION")!=null)return!0;let r=B("process");return!!!(r&&r.versions&&r.versions.node)&&typeof B("fetch")=="function"&&typeof B("Request")=="function"}function na(e){let n=(ge(e,"CLOUD_PLATFORM")||"").toLowerCase();return n==="pages"||n==="cf-pages"?"pages":n==="workers"||n==="cf"||n==="cloudflare"?"workers":ge(e,"CF_PAGES")!=null||ge(e,"CF_PAGES_BRANCH")!=null||ge(e,"CONTEXT")!=null?"pages":"workers"}function ta(e,n){return e?typeof B("connect")=="function"||n==="workers":!1}function ir(e){return!!(e&&typeof e=="object"&&typeof e.get=="function"&&typeof e.put=="function")}function at(e){return!!(e&&typeof e=="object"&&typeof e.prepare=="function")}function it(e){return!!(e&&typeof e=="object"&&typeof e.get=="function"&&typeof e.put=="function"&&typeof e.head=="function")}function Ge(e){let n=e||{};if(st&&ar===n)return st;let t=Zs(),r=ea(n,t),o=lr(),s=o||r,a=r,i;r?i="edgeone":t?i=na(n):i="unknown";let l=Object.freeze({platform:i,hasEdgeCache:s,hasCacheApi:o,eoEdgeCache:a,hasSocket:ta(t,i),hasD1:at(n.CDN_DB)||at(n.DB)||at(n.D1),hasKV:ir(n.CDN_KV)||ir(n.KV),hasR2:(i==="workers"||i==="pages")&&(it(n.CDN_R2)||it(n.R2)||Object.values(n).some(c=>it(c)))});return st=l,ar=n,l}se();$();N();N();var Mr=220,_a=Object.freeze([[/\b(bearer|basic)\s+[\w\-._~+/]+=*/gi,"$1 ***"],[/\b(token|access_token|refresh_token|api[_-]?key|apikey|secret|password|passwd|pwd|signature|sig|credential|auth)\s*[=:]\s*[^\s&;,"')]+/gi,"$1=***"],[/\bAKIA[0-9A-Z]{16}\b/g,"AKIA***"],[/\bX-Amz-(Signature|Credential|Security-Token)=[^\s&]*/gi,"X-Amz-$1=***"],[/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g,"***.jwt.***"],[/\b(set-)?cookie\s*:\s*[^\n]*/gi,"cookie: ***"]]);function Ve(e){if(e==null)return"";let n=typeof e=="string"?e:String(e);for(let[t,r]of _a)n=n.replace(t,r);return n=n.replace(/\s+/g," ").trim(),n.length>Mr&&(n=n.slice(0,Mr-1)+"…"),n}var de=class extends Error{constructor(n,t={}){super(n),this.name=new.target.name,this.code=t.code||f.INTERNAL,this.status=typeof t.status=="number"?t.status:500,this.expose=t.expose===!0,this.details=t.details||null,t.cause!==void 0&&(this.cause=t.cause)}publicMessage(){return this.expose?Ve(this.message):"服务器内部错误"}},Pn=class extends de{constructor(n="请求参数有误",t={}){super(n,{code:f.BAD_REQUEST,status:400,expose:!0,...t})}},$e=class extends de{constructor(n="未登录或登录已过期",t={}){super(n,{code:f.UNAUTHORIZED,status:401,expose:!0,...t})}};var _n=class extends de{constructor(n="资源不存在",t={}){super(n,{code:f.NOT_FOUND,status:404,expose:!0,...t})}};function In(e){return e instanceof de?e:e instanceof Error?new de(e.message||String(e),{code:f.INTERNAL,status:500,expose:!1,cause:e}):new de(typeof e=="string"?e:"未知错误",{code:f.INTERNAL,status:500,expose:!1,cause:e})}var Se="X-Request-Id",Ia=Object.freeze(["x-request-id","cf-ray","eo-log-uuid","x-amzn-trace-id"]),Ha=/^[A-Za-z0-9._-]{1,64}$/;function Oa(){try{if(typeof crypto<"u"&&typeof crypto.randomUUID=="function")return crypto.randomUUID().replace(/-/g,"").slice(0,24);if(typeof crypto<"u"&&typeof crypto.getRandomValues=="function"){let e=new Uint8Array(12);return crypto.getRandomValues(e),Array.from(e,n=>n.toString(16).padStart(2,"0")).join("")}}catch{}return(Date.now().toString(36)+Math.random().toString(36).slice(2,10)).slice(0,24)}function Fr(e){try{let n=e&&e.headers;if(n)for(let t of Ia){let r=n.get(t);if(r&&Ha.test(r))return r}}catch{}return Oa()}var La="application/json; charset=utf-8";var Da=Object.freeze({"Cache-Control":"no-store, no-cache, must-revalidate","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"}),Na=Object.freeze({[f.UNAUTHORIZED]:401,[f.FORBIDDEN]:403,[f.NOT_FOUND]:404,[f.BAD_REQUEST]:400,[f.CONFLICT]:409,[f.RATE_LIMITED]:429,[f.INTERNAL]:500,[f.STORAGE_UNAVAILABLE]:503});function $a(e,n){let t=new Headers(Da);if(t.set("Content-Type",n),e)if(typeof e.forEach=="function"&&!Array.isArray(e))e.forEach((r,o)=>t.set(o,r));else for(let r of Object.keys(e)){let o=e[r];o!=null&&t.set(r,String(o))}return t}function Ma(e){try{return JSON.stringify(e)}catch{return JSON.stringify({ok:!1,error:{code:f.INTERNAL,message:"响应序列化失败"}})}}function Tt(e,n=200,t){return new Response(Ma(e),{status:n,headers:$a(t,La)})}function k(e=null,n=200,t){return Tt({ok:!0,data:e},n,t)}function m(e,n,t,r){let o=typeof e=="string"&&e!==""?e:f.INTERNAL,s=typeof t=="number"&&t>=100&&t<=599?t:Na[o]??400;return Tt({ok:!1,error:{code:o,message:typeof n=="string"&&n!==""?n:o}},s,r)}function qr(e,n={}){let t=In(e),r=n.reqId,o={ok:!1,error:{code:t.code,message:t.publicMessage()}};r&&(o.error.requestId=r);let s={...n.headers||{}};return r&&(s[Se]=r),Tt(o,t.status,s)}var Fa=new TextEncoder,$c=new TextDecoder;function Hn(){let e=typeof globalThis<"u"?globalThis.crypto:void 0;if(!e||!e.subtle)throw new Error("当前运行时不支持 WebCrypto（crypto.subtle 不可用）");return e}function Ye(e){return Fa.encode(String(e??""))}function On(e){let n=e instanceof Uint8Array?e:new Uint8Array(e),t="",r=32768;for(let o=0;o<n.length;o+=r)t+=String.fromCharCode.apply(null,n.subarray(o,o+r));return btoa(t)}function Ur(e){let n=String(e).replace(/-/g,"+").replace(/_/g,"/"),t=n.length%4;if(t===2)n+="==";else if(t===3)n+="=";else if(t===1)throw new Error("非法的 base64 字符串");let r=atob(n),o=new Uint8Array(r.length);for(let s=0;s<r.length;s++)o[s]=r.charCodeAt(s);return o}function qa(e){return String(e).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")}function Br(e){let n=e instanceof Uint8Array?e:new Uint8Array(e),t="";for(let r=0;r<n.length;r++)t+=n[r].toString(16).padStart(2,"0");return t}async function Et(e,n,t=1e5){let r=Hn(),o=Number.isFinite(t)&&t>0?Math.floor(t):1e5,s=await r.subtle.importKey("raw",Ye(e),"PBKDF2",!1,["deriveBits"]),a=await r.subtle.deriveBits({name:"PBKDF2",salt:Ye(n),iterations:o,hash:"SHA-256"},s,256);return On(a)}async function Ln(e,n){let t=Hn(),r=await t.subtle.importKey("raw",Ye(e),{name:"HMAC",hash:"SHA-256"},!1,["sign"]),o=await t.subtle.sign("HMAC",r,Ye(n));return qa(On(o))}async function zr(e,n,t){if(typeof t!="string"||t==="")return!1;try{let r=await Ln(e,n);return Dn(r,t)}catch{return!1}}async function Gr(e){let t=await Hn().subtle.digest("SHA-256",Ye(e));return Br(t)}function Kr(e=16){let n=Number.isFinite(e)&&e>0?Math.floor(e):16,t=new Uint8Array(n);return Hn().getRandomValues(t),Br(t)}function Dn(e,n){let t=typeof e=="string"?e:String(e??""),r=typeof n=="string"?n:String(n??""),o=t.length^r.length,s=Math.max(t.length,r.length);for(let a=0;a<s;a++){let i=a<t.length?t.charCodeAt(a):0,l=a<r.length?r.charCodeAt(a):0;o|=i^l}return o===0}var Xr=1e5,Vr=16,Yr="ecw_token",Ua=7200,jr=30,Ba=new TextEncoder;function Qr(e){return On(Ba.encode(e)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")}function Wr(e){try{return new TextDecoder().decode(Ur(String(e)))}catch{return""}}async function Rt(e,n){let t=typeof e=="string"?e:String(e??""),r=typeof n=="string"&&n.length>0?n:Kr(Vr);return{hash:await Et(t,r,Xr),salt:r}}async function Ct(e,n,t){try{let r=typeof t=="string"&&t.length>0?t:"0".repeat(Vr*2),o=await Et(e==null?"":String(e),r,Xr);return typeof n!="string"||n.length===0?!1:Dn(o,n)}catch{return!1}}var za=Qr(JSON.stringify({alg:"HS256",typ:"JWT"}));async function Jr(e,n){return await Ln(n,e)}async function Pt(e,n,t){if(typeof n!="string"||n.length===0)throw new Error("signToken: 拒绝使用空密钥签名，请配置 JWT_SECRET 环境变量");let r=Math.floor(Date.now()/1e3),o=Number.isFinite(t)&&t>0?Math.floor(t):Ua,s={...e&&typeof e=="object"?e:{},iat:r,exp:r+o};e&&typeof e=="object"&&Number.isFinite(e.exp)&&(s.exp=e.exp);let a=Qr(JSON.stringify(s)),i=`${za}.${a}`,l=await Jr(i,n);return`${i}.${l}`}async function Ga(e,n){try{if(typeof e!="string"||e.length===0||e.length>4096||typeof n!="string"||n.length===0)return null;let t=e.split(".");if(t.length!==3)return null;let[r,o,s]=t;if(!r||!o||!s)return null;let a=Wr(r);if(!a)return null;let i=JSON.parse(a);if(!i||i.alg!=="HS256")return null;let l=await Jr(`${r}.${o}`,n);if(!Dn(s,l))return null;let c=Wr(o);if(!c)return null;let d=JSON.parse(c);if(!d||typeof d!="object")return null;let p=Math.floor(Date.now()/1e3);return!Number.isFinite(d.exp)||p>d.exp+jr||Number.isFinite(d.nbf)&&p+jr<d.nbf?null:d}catch{return null}}async function Nn(e){try{let t=(e&&e.env||{}).JWT_SECRET;if(typeof t=="string"&&t.length>=8)return t;let{getGlobal:r}=await Promise.resolve().then(()=>($(),$r)),o=await r(e),s=o&&o.passwordHash;return typeof s=="string"&&s.length>0?await Gr(`ecw-jwt-derive:v1:${s}`):""}catch{return""}}function $n(e,n,t=!0){let r=Number.isFinite(n)&&n>0?Math.floor(n):0,o=r>0?String(e??""):"",s=`HttpOnly; SameSite=Strict; Path=/; Max-Age=${r}`;return t&&(s+="; Secure"),`${Yr}=${o}; ${s}`}function _t(e=!0){return $n("",0,e)}function Ka(e){try{if(!e||!e.headers)return null;let n=e.headers.get("Cookie")||e.headers.get("cookie")||"";if(n){let r=n.split(";");for(let o of r){let s=o.indexOf("=");if(s<=0)continue;if(o.slice(0,s).trim()===Yr){let i=o.slice(s+1).trim();return i.length>0?i:null}}}let t=e.headers.get("Authorization")||"";if(t.length>7&&t.slice(0,7).toLowerCase()==="bearer "){let r=t.slice(7).trim();return r.length>0?r:null}return null}catch{return null}}async function It(e){try{let n=Ka(e&&e.request);if(!n)return null;let t=await Nn(e);return t?await Ga(n,t):null}catch{return null}}N();se();var Zr=5,Fn=900,eo=500,ja="lock:";function qn(e,n){try{if(!e||!e.headers)return"unknown";let t=e.headers,r=t.get("CF-Connecting-IP");if(r)return Mn(r);let o=t.get("EO-Connecting-IP");if(o)return Mn(o);if(n&&n.trustProxyHeaders===!0){let s=t.get("X-Forwarded-For");if(s){let i=s.split(",")[0];if(i&&i.trim())return Mn(i)}let a=t.get("X-Real-IP");if(a)return Mn(a)}return"unknown"}catch{return"unknown"}}function Mn(e){let t=String(e).trim().replace(/^\[|\]$/g,"").replace(/[^0-9a-fA-F.:]/g,"");return t?t.slice(0,45).toLowerCase():"unknown"}function Ht(e){return`${ja}${e||"unknown"}`}function Qe(e,n){try{console.warn(`[loginGuard] KV 不可用，降级放行：${e}`,n?String(n&&n.message||n):"")}catch{}}async function no(e,n){let t=await e.get(Ht(n));if(t==null)return{n:0,until:0};if(typeof t=="object")return{n:Number(t.n)||0,until:Number(t.until)||0};let r=String(t).trim();if(/^\d+$/.test(r))return{n:parseInt(r,10),until:0};try{let o=JSON.parse(r);return{n:Number(o.n)||0,until:Number(o.until)||0}}catch{return{n:0,until:0}}}async function to(e,n){try{let t=O(e&&e.env);if(!t)return Qe("checkLoginAllowed: 无 KV 绑定"),{allowed:!0,retryAfter:0,failures:0,degraded:!0};let r=await no(t,n);if(r.n<Zr)return{allowed:!0,retryAfter:0,failures:r.n};let o=Date.now(),s=r.until>o?Math.ceil((r.until-o)/1e3):0;return s<=0&&(s=Fn),{allowed:!1,retryAfter:s,failures:r.n}}catch(t){return Qe("checkLoginAllowed",t),{allowed:!0,retryAfter:0,failures:0,degraded:!0}}}async function Ot(e,n){try{let t=O(e&&e.env);if(!t)return Qe("recordLoginFailure: 无 KV 绑定"),0;let o=(await no(t,n)).n+1,s=Date.now()+Fn*1e3;return await t.put(Ht(n),JSON.stringify({n:o,until:s}),{expirationTtl:Fn}),o}catch(t){return Qe("recordLoginFailure",t),0}}async function ro(e,n){try{let t=O(e&&e.env);if(!t)return;await t.delete(Ht(n))}catch(t){Qe("recordLoginSuccess",t)}}async function re(e){let n=Number.isFinite(e)?e:Date.now(),t=Date.now()-n,r=eo-t;r>0&&await new Promise(o=>setTimeout(o,r))}var Bc=Object.freeze({maxFailures:Zr,lockTtlSec:Fn,constantDelayMs:eo});$();async function oo(e,n){let t=Date.now(),r=qn(e.request),o=await to(e,r);if(!o.allowed)return await re(t),m(f.RATE_LIMITED,`尝试次数过多，请在 ${o.retryAfter} 秒后重试`,429);let s;try{s=await e.request.json()}catch{return await re(t),m(f.BAD_REQUEST,"请求体不是合法的 JSON",400)}let a=typeof s?.password=="string"?s.password:"";if(!a)return await re(t),m(f.BAD_REQUEST,"密码不能为空",400);let i=n||await H(e);if(i?.passwordHash){if(!await Ct(a,i.passwordHash,i.passwordSalt))return await Ot(e,r),await re(t),m(f.UNAUTHORIZED,"密码错误",401)}else{let u=e.env?.ADMIN_PASSWORD;if(!u)return await re(t),m(f.INTERNAL,"尚未初始化管理员密码，请先设置 ADMIN_PASSWORD 环境变量（wrangler secret put ADMIN_PASSWORD）",500);if(a!==u)return await Ot(e,r),await re(t),m(f.UNAUTHORIZED,"密码错误",401);let{hash:h,salt:g}=await Rt(a);i.passwordHash=h,i.passwordSalt=g,await Ne(e,i)}await ro(e,r);let l=await Nn(e),c=i?.tokenTtl||7200,d;try{d=await Pt({sub:"admin",iat:Math.floor(Date.now()/1e3)},l,c)}catch{return await re(t),m(f.INTERNAL,"无法签发登录凭证：签名密钥不可用，请配置 JWT_SECRET 环境变量后重试",500)}await re(t);let p=(e.request.url||"").startsWith("https://");return new Response(JSON.stringify({ok:!0,data:{authed:!0,ttl:c}}),{status:200,headers:{"content-type":"application/json; charset=utf-8","set-cookie":$n(d,c,p),"cache-control":"no-store"}})}async function so(e){let n=(e.request.url||"").startsWith("https://");return new Response(JSON.stringify({ok:!0,data:{loggedOut:!0}}),{status:200,headers:{"content-type":"application/json; charset=utf-8","set-cookie":_t(n),"cache-control":"no-store"}})}async function ao(e,n){let t;try{t=await e.request.json()}catch{return m(f.BAD_REQUEST,"请求体不是合法的 JSON",400)}let r=String(t?.oldPassword||""),o=String(t?.newPassword||"");if(o.length<8)return m(f.BAD_REQUEST,"新密码长度至少 8 位",400);if(o.length>256)return m(f.BAD_REQUEST,"新密码过长",400);let s=n||await H(e);if(s?.passwordHash&&!await Ct(r,s.passwordHash,s.passwordSalt))return m(f.UNAUTHORIZED,"原密码错误",401);let{hash:a,salt:i}=await Rt(o);s.passwordHash=a,s.passwordSalt=i,await Ne(e,s);let l=await Nn(e),c=s?.tokenTtl||7200,d=null;try{d=await Pt({sub:"admin",iat:Math.floor(Date.now()/1e3)},l,c)}catch{d=null}let p=(e.request.url||"").startsWith("https://"),u={"content-type":"application/json; charset=utf-8","cache-control":"no-store","set-cookie":d?$n(d,c,p):_t(p)};return new Response(JSON.stringify({ok:!0,data:{changed:!0,reloginRequired:!d}}),{status:200,headers:u})}N();$();ee();ae();var io=Object.freeze({edgeTtl:Object.freeze({label:"边缘缓存时间",hint:"内容在边缘节点上保留多久。越长回源越少、越省钱，但源站更新后生效越慢。改完内容记得清缓存。",unit:"s",min:0,max:31536e3}),browserTtl:Object.freeze({label:"浏览器缓存时间",hint:"下发给访客浏览器的 max-age。浏览器缓存无法主动清除，除非文件名带版本号（如 app.a1b2c3.js），否则别设太长。填 -1 表示不改写、完全跟随源站。",unit:"s",min:-1,max:31536e3}),staleWhileRevalidate:Object.freeze({label:"过期后宽限时间",hint:"边缘缓存过期后的这段时间内，先拿旧内容响应访客、同时后台悄悄回源刷新。能显著削平源站流量尖峰，设 0 关闭。",unit:"s",min:0,max:604800}),errorTtl:Object.freeze({label:"错误页缓存时间",hint:"源站返回 4xx/5xx（400/401/403/404/405/500/502/503/504）时缓存这么久，挡住对不存在的资源或故障源站的反复穿透。几秒就够了，设 0 不缓存。",unit:"s",min:0,max:3600})}),lo=Object.freeze({edgeTtl:Z.edgeTtl,browserTtl:Z.browserTtl,staleWhileRevalidate:Z.staleWhileRevalidate,errorTtl:0}),Xa=Object.freeze(["css","js","png","jpg","jpeg","gif","webp","svg","ico","woff","woff2"]),Va=Object.freeze(["mp4","m4s","ts","m3u8","mpd","flv","mp3","aac","webm"]),Ya=Object.freeze(["zip","rar","7z","gz","tar","apk","ipa","exe","dmg","pkg","iso","bin"]),co=Object.freeze([{id:"blank",name:"空白（不预置任何规则）",desc:"什么都不生成，全部自己配。已经清楚要怎么配、或要从别处导入配置时选它。",params:{},tuning:[],build:()=>[]},{id:"website",name:"网站加速",desc:"通用网站 / 前后端分离站点。静态资源长缓存，HTML 与 API 不缓存，避免用户看到旧页面。",params:{edgeTtl:2592e3,browserTtl:86400,staleWhileRevalidate:60,errorTtl:10},tuning:["edgeTtl","browserTtl","staleWhileRevalidate","errorTtl"],build:e=>[{name:"静态资源长缓存",note:"带版本号/哈希的 css、js、图片、字体。这类文件内容一变文件名就变，所以可以放心长缓存。",match:{conditions:[[Je(Xa)]]},cache:{enabled:!0,mode:"ttl",edgeTtl:e.edgeTtl,browserTtl:e.browserTtl,staleWhileRevalidate:e.staleWhileRevalidate,ignoreQuery:!1,statusTtl:Un(e)}},{name:"HTML 页面不缓存",note:"HTML 是内容入口，一旦被缓存住，发版后用户会长时间停在旧页面。默认不缓存最安全。",match:{conditions:[[Je(["html","htm"])]]},cache:{enabled:!1,mode:"noCache"}},{name:"API 路径不缓存",note:"/api/ 下通常是动态数据、且常带登录态，缓存会导致串号等严重问题。路径前缀按你的实际情况改。",match:{conditions:[[Qa("/api/")]]},cache:{enabled:!1,mode:"noCache"}}]},{id:"api",name:"API 加速",desc:"纯接口服务。默认全部不缓存，只做就近接入和链路优化；缓存交给你按具体接口逐个开。",params:{errorTtl:0},tuning:["errorTtl"],build:e=>[{name:"全站不缓存（API 默认）",note:"API 响应大多与用户身份相关，默认一律不缓存。若某些接口（如公共配置、字典表）确实可缓存，请单独加一条更高优先级的规则放行。",match:{},cache:{enabled:!1,mode:"noCache",statusTtl:Un(e)}}]},{id:"media",name:"音视频流媒体",desc:"点播 / HLS / DASH。分片长缓存，索引清单短缓存，保证能及时切换码率与更新节目。",params:{edgeTtl:86400,browserTtl:3600,staleWhileRevalidate:30,errorTtl:5},tuning:["edgeTtl","browserTtl","staleWhileRevalidate","errorTtl"],build:e=>[{name:"媒体分片长缓存",note:"ts / m4s / mp4 等分片一旦生成就不再变化，适合长缓存，这是流媒体省带宽的关键。",match:{conditions:[[Je(Va.filter(n=>n!=="m3u8"&&n!=="mpd"))]]},cache:{enabled:!0,mode:"ttl",edgeTtl:e.edgeTtl,browserTtl:e.browserTtl,staleWhileRevalidate:e.staleWhileRevalidate,ignoreQuery:!1,statusTtl:Un(e)}},{name:"索引清单短缓存",note:"m3u8 / mpd 是播放列表，直播或更新中的点播会不断变化。只缓存几秒，既挡住高并发又不影响更新。",match:{conditions:[[Je(["m3u8","mpd"])]]},cache:{enabled:!0,mode:"ttl",edgeTtl:3,browserTtl:0,staleWhileRevalidate:0,ignoreQuery:!1}}]},{id:"download",name:"大文件下载",desc:"安装包 / 镜像 / 静态归档。内容基本不可变，用最长缓存把回源压到最低。",params:{edgeTtl:15552e3,browserTtl:86400,staleWhileRevalidate:300,errorTtl:10},tuning:["edgeTtl","browserTtl","staleWhileRevalidate","errorTtl"],build:e=>[{name:"下载文件长缓存",note:"安装包这类文件发布后通常不再修改（改了一般也是换新版本号），适合最长缓存。",match:{conditions:[[Je(Ya)]]},cache:{enabled:!0,mode:"ttl",edgeTtl:e.edgeTtl,browserTtl:e.browserTtl,staleWhileRevalidate:e.staleWhileRevalidate,ignoreQuery:!0,statusTtl:Un(e)}}]}]);function Je(e){return{target:"extension",op:"equal",ignoreCase:!0,values:e.map(n=>String(n).toLowerCase().replace(/^\./,""))}}function Qa(e){return{target:"path",op:"prefix",ignoreCase:!0,values:[e]}}function Un(e){let n=Number(e?.errorTtl)||0;if(n<=0)return{};let t={};for(let r of[400,401,403,404,405,500,502,503,504])t[String(r)]=n;return t}function po(e){return co.find(n=>n.id===e)||null}function uo(e){let n=po(e);if(!n)return{};let t={};for(let r of n.tuning||[])t[r]=n.params[r]!==void 0?n.params[r]:lo[r];return t}function fo(e,n){let t=po(e);if(!t||typeof t.build!="function")return[];let r={...lo,...uo(e)};if(n&&typeof n=="object")for(let[s,a]of Object.entries(n)){let i=Number(a);Number.isFinite(i)&&(r[s]=i)}return(t.build(r)||[]).map((s,a)=>({id:`tpl-${e}-${a+1}`,priority:(a+1)*10,enabled:!0,name:s.name||"",note:s.note||"",match:s.match||{},action:{cache:{...Z,...s.cache||{}}}}))}function ho(){return co.map(e=>{let n=uo(e.id);return{id:e.id,name:e.name,desc:e.desc,tuning:[...e.tuning||[]],params:n,ruleCount:(e.build(n)||[]).length}})}async function Lt(e,n){let t=Array.isArray(n.origins)?n.origins:[];if(n.poolId)return delete n.origins,delete n.originStrategy,delete n.originFailover,{ok:!0};if(t.length===0)return{ok:!0};if(t.length>1)return{ok:!1,error:"站点只能绑定一个源站；需要多个源站请先在「源站」页新建源站池，再在此处选择"};let r=i=>[i?.engine||"fetch",i?.scheme||"https",String(i?.addr||"").toLowerCase(),String(i?.port??""),i?.pathPrefix||""].join("|"),o=r(t[0]);try{let l=(await we(e)).find(c=>(c.kind||(c.origins?.length===1?"single":"pool"))==="single"&&Array.isArray(c.origins)&&c.origins.length===1&&r(c.origins[0])===o);if(l)return n.poolId=l.id,delete n.origins,delete n.originStrategy,delete n.originFailover,{ok:!0}}catch{}let s=String(t[0]?.addr||"").toLowerCase(),a=V({name:s||n.host,kind:"single",strategy:"chain",origins:t,failover:n.originFailover,createdBy:n.host||""},e.caps);return a.ok?(a.value.updatedAt=Date.now(),await te(e,a.value),n.poolId=a.value.id,delete n.origins,delete n.originStrategy,delete n.originFailover,{ok:!0,created:a.value}):{ok:!1,error:"源站校验失败: "+a.errors.join("; ")}}async function go(){return k({templates:ho(),paramMeta:io})}async function mo(e){let n=Number(e.url.searchParams.get("offset"))||0,t=e.url.searchParams.get("limit"),{sites:r,total:o,truncated:s}=await Cn(e,{offset:n,limit:t?Number(t):void 0});return k({sites:r,total:o,offset:n,truncated:s})}async function bo(e,n){let t=await j(e,n.toLowerCase(),{exact:!0});return t?k(t):m(f.NOT_FOUND,`站点不存在: ${n}`,404)}async function xo(e,n){let t;try{t=await e.request.json()}catch{return m(f.BAD_REQUEST,"请求体不是合法的 JSON",400)}t.host=n.toLowerCase();let r=typeof t.template=="string"?t.template:"";delete t.template;let o=t.templateParams;if(delete t.templateParams,r&&r!=="blank"&&!Array.isArray(t.rules)&&!await j(e,t.host,{exact:!0})){let l=fo(r,o);l.length&&(t.rules=l)}let s=await Lt(e,t);if(!s.ok)return m(f.BAD_REQUEST,s.error,400);let a=xe(t);return a.ok?(a.value.updatedAt=Date.now(),await Q(e,a.value),k({...a.value,createdOrigin:s.created||null})):m(f.BAD_REQUEST,"配置校验失败: "+a.errors.join("; "),400)}async function Dt(e,n){if(n.poolId||!Array.isArray(n.origins)||n.origins.length===0)return delete n.origins,delete n.originStrategy,delete n.originFailover,{ok:!0};if(n.origins.length>1){let o=V({name:`${n.host} 的源站池`,kind:"pool",strategy:n.originStrategy||"chain",origins:n.origins,failover:n.originFailover,createdBy:n.host||""},e.caps);return o.ok?(o.value.updatedAt=Date.now(),await te(e,o.value),n.poolId=o.value.id,delete n.origins,delete n.originStrategy,delete n.originFailover,{ok:!0,created:o.value}):{ok:!1,error:"历史内联源站迁移失败: "+o.errors.join("; ")}}let t={host:n.host,origins:n.origins,originFailover:n.originFailover},r=await Lt(e,t);return r.ok&&(n.poolId=t.poolId,delete n.origins,delete n.originStrategy,delete n.originFailover),r}async function yo(e,n){let t=n.toLowerCase();return await j(e,t,{exact:!0})?(await wt(e,t),k({deleted:t})):m(f.NOT_FOUND,`站点不存在: ${n}`,404)}var Ja=["host","enabled","ipv6Support","poolId","defaultHostHeader"];async function vo(e,n){let t=n.toLowerCase(),r;try{r=await e.request.json()}catch{return m(f.BAD_REQUEST,"请求体不是合法的 JSON",400)}if(!r||typeof r!="object")return m(f.BAD_REQUEST,"请求体必须是 JSON 对象",400);let o=await j(e,t,{exact:!0});if(!o)return m(f.NOT_FOUND,`站点不存在: ${n}`,404);r.host=t;let s=await Lt(e,r);if(!s.ok)return m(f.BAD_REQUEST,s.error,400);let a={...o};for(let c of Ja)c in r&&(a[c]=r[c]);a.host=t;let i=await Dt(e,a);if(!i.ok)return m(f.BAD_REQUEST,i.error,400);a.host=t,a.cacheGen=o.cacheGen||0,a.updatedAt=Date.now();let l=xe(a);return l.ok?(await Q(e,l.value),k({host:t,basics:"ok",poolId:l.value.poolId,createdOrigin:s.created||null})):m(f.BAD_REQUEST,"配置校验失败: "+l.errors.join("; "),400)}async function wo(e,n){let t=n.toLowerCase(),r;try{r=await e.request.json()}catch{return m(f.BAD_REQUEST,"请求体不是合法的 JSON",400)}if(!r||typeof r!="object")return m(f.BAD_REQUEST,"请求体必须是 JSON 对象",400);if(!("rules"in r)||!Array.isArray(r.rules))return m(f.BAD_REQUEST,"rules 必须是数组",400);let o=await j(e,t,{exact:!0});if(!o)return m(f.NOT_FOUND,`站点不存在: ${n}`,404);let s={...o,rules:r.rules,cacheGen:o.cacheGen||0,updatedAt:Date.now()},a=await Dt(e,s);return a.ok?(await Q(e,s),k({host:t,rules:"ok",migratedOrigin:a.created||null})):m(f.BAD_REQUEST,a.error,400)}async function ko(e,n){let t=n.toLowerCase(),r;try{r=await e.request.json()}catch{return m(f.BAD_REQUEST,"请求体不是合法的 JSON",400)}if(!r||typeof r!="object")return m(f.BAD_REQUEST,"请求体必须是 JSON 对象",400);if(!("security"in r)||typeof r.security!="object")return m(f.BAD_REQUEST,"security 必须是对象",400);let o=await j(e,t,{exact:!0});if(!o)return m(f.NOT_FOUND,`站点不存在: ${n}`,404);let s={...o,security:r.security,cacheGen:o.cacheGen||0,updatedAt:Date.now()},a=await Dt(e,s);return a.ok?(await Q(e,s),k({host:t,security:"ok",migratedOrigin:a.created||null})):m(f.BAD_REQUEST,a.error,400)}N();$();ee();ee();async function Nt(e){let n=new Map,t=(a,i)=>{if(!a)return;let l=n.get(a);l?l.push(i):n.set(a,[i])},{sites:r,truncated:o}=await ve(e),s=[];for(let a of r){a.poolId?t(a.poolId,{type:"site",host:a.host,label:a.host,detail:"站点默认源站"}):Array.isArray(a.origins)&&a.origins.length>0&&s.push(a.host);for(let i of a.rules||[]){let l=i?.action?.poolId;l&&t(l,{type:"rule",host:a.host,label:a.host,detail:`规则「${i.name||i.id}」覆盖回源`})}}try{let a=await ke(e);if(Array.isArray(a))for(let i of a){let l=i?.action?.poolId;l&&t(l,{type:"globalRule",host:"",label:"全站通用规则",detail:`规则「${i.name||i.id}」覆盖回源`})}}catch{}return{map:n,truncated:o,legacySites:s}}async function So(e){let n=await we(e),{map:t,truncated:r,legacySites:o}=await Nt(e),s=n.map(a=>{let i=t.get(a.id)||[];return{...a,kind:a.kind||(Array.isArray(a.origins)&&a.origins.length===1?"single":"pool"),refs:i,refCount:i.length,deletable:i.length===0&&!r}});return k({pools:s,refsTruncated:r,legacySites:o})}async function Ao(e,n){if(!await ce(e,n))return m(f.NOT_FOUND,`源站不存在: ${n}`,404);let{map:r,truncated:o}=await Nt(e),s=r.get(n)||[];return k({id:n,refs:s,refCount:s.length,truncated:o})}async function To(e,n){let t=await ce(e,n);return t?k(t):m(f.NOT_FOUND,`源站池不存在: ${n}`,404)}async function Eo(e,n,t){t&&(n.id=t);let r=V(n,e.caps);return r.ok?(r.value.updatedAt=Date.now(),await te(e,r.value),k(r.value)):m(f.BAD_REQUEST,"配置校验失败: "+r.errors.join("; "),400)}async function Ro(e){let n;try{n=await e.request.json()}catch{return m(f.BAD_REQUEST,"请求体不是合法的 JSON",400)}return E(n)?Eo(e,n,null):m(f.BAD_REQUEST,"请求体不是合法对象",400)}async function Co(e,n){let t;try{t=await e.request.json()}catch{return m(f.BAD_REQUEST,"请求体不是合法的 JSON",400)}return E(t)?Eo(e,t,n):m(f.BAD_REQUEST,"请求体不是合法对象",400)}async function Po(e,n){let t=await ce(e,n);if(!t)return m(f.NOT_FOUND,`源站不存在: ${n}`,404);let r=(t.kind||"pool")==="single"?"单一源站":"源站池",{map:o,truncated:s}=await Nt(e),a=o.get(n)||[];if(a.length===0&&s)return m(f.CONFLICT,"站点数量过多，无法完成引用检查，为避免误删已阻止本次操作",409);if(a.length>0){let i=[...new Set(a.map(l=>`${l.label}（${l.detail}）`))];return m(f.CONFLICT,`该${r}仍被以下对象引用，无法删除：${i.join("、")}`,409)}return await St(e,n),k({deleted:n})}N();$();N();var Ze,W={hits:0,misses:0,disabled:0,writes:0,writeErrors:0,purged:0};function Bn(){if(Ze!==void 0)return Ze;try{let e=typeof caches<"u"?caches:null;Ze=e&&typeof e.default<"u"?e.default:null}catch{Ze=null}return Ze}function Ae(e,n){e&&e.debug&&typeof e.debug=="object"&&(e.debug.cache=n)}function $t(e){return!!(e&&e.caps?e.caps:Ge(e&&e.env)).hasEdgeCache}function Mt(e){return!!((e&&e.caps?e.caps:Ge(e&&e.env)).hasCacheApi&&Bn()!==null)}async function _o(e,n){if(!n)return null;if(!$t(e))return W.disabled++,Ae(e,"DISABLED"),null;if(!Mt(e))return Ae(e,"EDGE_HEADER"),null;let t=Bn();try{let r=await t.match(n);return r?(W.hits++,Ae(e,"HIT"),r):(W.misses++,Ae(e,"MISS"),null)}catch{return W.misses++,Ae(e,"MISS"),null}}async function Io(e,n,t){if(!n||!t||!$t(e))return;if(!Mt(e)){Ae(e,"EDGE_HEADER");return}let r=Bn();try{await r.put(n,t),W.writes++}catch{W.writeErrors++}}async function Ho(e,n){if(!n||!$t(e))return!1;if(!Mt(e))return Ae(e,"EDGE_HEADER"),!1;let t=Bn();try{let r=await t.delete(n);return r&&W.purged++,r}catch{return!1}}function Oo(){let e=W.hits+W.misses;return{...W,lookups:e,hitRate:e>0?Number((W.hits/e).toFixed(4)):0}}function Lo(e,n,t){if(!t||t.enabled!==!0||!e||!n)return!1;let r=String(e.method||"GET").toUpperCase();if(r!=="GET"&&r!=="HEAD")return!1;try{if(e.headers&&e.headers.get("range"))return!1}catch{}let o=n.status;if(mn.has(o)||o===206)return!1;try{let s=n.headers;if(s){if(s.has("set-cookie"))return!1;let a=(s.get("cache-control")||"").toLowerCase();if(a.includes("no-store")||a.includes("private"))return!1;let i=(s.get("vary")||"").toLowerCase();if(i&&i.split(",").map(d=>d.trim()).filter(Boolean).some(d=>d!=="*"&&d!=="accept-encoding"))return!1}}catch{}return!0}async function Do(e){let n;try{n=await e.request.json()}catch{return m(f.BAD_REQUEST,"请求体不是合法的 JSON",400)}if(!e.caps.hasEdgeCache)return k({purged:0,message:"当前平台不支持边缘缓存 API，无需清除。缓存由平台 CDN 依据 Cache-Control 管理。"});let t={byUrl:0,byGeneration:null,failed:[]};if(Array.isArray(n.urls)&&n.urls.length>0){if(n.urls.length>100)return m(f.BAD_REQUEST,"单次最多清除 100 个 URL",400);for(let r of n.urls)try{await Ho(e,String(r))&&t.byUrl++}catch(o){t.failed.push({url:r,reason:o.message})}}if(n.host){let r=String(n.host).toLowerCase(),o=await j(e,r,{exact:!0});if(!o)return m(f.NOT_FOUND,`站点不存在: ${r}`,404);o.cacheGen=(Number(o.cacheGen)||0)+1,o.updatedAt=Date.now(),await Q(e,o),t.byGeneration={host:r,generation:o.cacheGen,note:"已递增缓存代次，新请求将全部回源；旧缓存条目会被边缘自动淘汰"}}return t.byUrl===0&&!t.byGeneration?m(f.BAD_REQUEST,"请至少指定 urls 或 host 之一",400):k(t)}$();$();$();var Fo=500,qo=3e5,Uo=500,xi=32,jn=256,ue=new Map,sn=0,Bo=Date.now(),Kn=!1;function yi(){return{requests:0,s2xx:0,s3xx:0,s4xx:0,s5xx:0,sOther:0,bytes:0,cacheHit:0,cacheMiss:0,durSum:0,durSamples:[],origins:Object.create(null)}}function vi(e){return String(e||"unknown").toLowerCase().replace(/[^a-z0-9.\-_*]/g,"").slice(0,128)||"unknown"}function Wt(e,n){try{let t=n||{},r=vi(t.host||e&&e.url&&e.url.hostname),o=ue.get(r);if(!o){if(ue.size>=Uo)return;o=yi(),ue.set(r,o)}o.requests+=1;let s=Number(t.status);s>=200&&s<300?o.s2xx+=1:s>=300&&s<400?o.s3xx+=1:s>=400&&s<500?o.s4xx+=1:s>=500&&s<600?o.s5xx+=1:o.sOther+=1;let a=Number(t.bytes);Number.isFinite(a)&&a>0&&(o.bytes+=a);let i=t.cacheHit,l=i===!0||typeof i=="string"&&i.toUpperCase()==="HIT",c=i===!1||typeof i=="string"&&i.toUpperCase()==="MISS";if(l?o.cacheHit+=1:c&&(o.cacheMiss+=1),t.originId){let p=String(t.originId).slice(0,64);(o.origins[p]!==void 0||Object.keys(o.origins).length<xi)&&(o.origins[p]=(o.origins[p]||0)+1)}let d=Number(t.durationMs!==void 0?t.durationMs:t.duration);if(!Number.isFinite(d)&&e&&Number.isFinite(e.startTime)&&(d=Date.now()-e.startTime),Number.isFinite(d)&&d>=0)if(o.durSum+=d,o.durSamples.length<jn)o.durSamples.push(d);else{let p=Math.random()*o.requests|0;p<jn&&(o.durSamples[p]=d)}sn+=1}catch{}}function wi(e){return sn===0?!1:e||sn>=Fo?!0:Date.now()-Bo>=qo}function Kt(){let e=ue,n=sn;return ue=new Map,sn=0,Bo=Date.now(),{snapshot:e,count:n}}function jt(e,n){if(!e||e.length===0)return 0;let t=e.slice().sort((o,s)=>o-s),r=Math.min(t.length-1,Math.max(0,Math.round(n*(t.length-1))));return Math.round(t[r])}function ki(e,n){return{host:e,requests:n.requests,status2xx:n.s2xx,status3xx:n.s3xx,status4xx:n.s4xx,status5xx:n.s5xx,statusOther:n.sOther,bytes:n.bytes,cacheHit:n.cacheHit,cacheMiss:n.cacheMiss,durAvg:n.requests>0?Math.round(n.durSum/n.requests):0,durP50:jt(n.durSamples,.5),durP95:jt(n.durSamples,.95),durP99:jt(n.durSamples,.99),origins:{...n.origins}}}function Si(e){try{for(let[n,t]of e){let r=ue.get(n);if(!r){if(ue.size>=Uo)continue;ue.set(n,t);continue}if(r.requests+=t.requests,r.s2xx+=t.s2xx,r.s3xx+=t.s3xx,r.s4xx+=t.s4xx,r.s5xx+=t.s5xx,r.sOther+=t.sOther,r.bytes+=t.bytes,r.cacheHit+=t.cacheHit,r.cacheMiss+=t.cacheMiss,r.durSum+=t.durSum,Array.isArray(t.durSamples)&&t.durSamples.length>0){Array.isArray(r.durSamples)||(r.durSamples=[]);for(let o of t.durSamples)if(r.durSamples.length<jn)r.durSamples.push(o);else{let s=Math.random()*jn|0;r.durSamples[s]=o}}for(let[o,s]of Object.entries(t.origins))r.origins[o]=(r.origins[o]||0)+s}}catch{}}async function Xt(e,n=!1){try{if(Kn||!wi(n))return;Kn=!0;try{let t=null;try{t=await H(e)}catch{t=null}if(t&&t.statsEnabled===!1){Kt();return}let r=t&&t.statsDriver||"kv";if(r==="none"){Kt();return}let{snapshot:o}=Kt();if(o.size===0)return;let s=[];for(let[a,i]of o)s.push(ki(a,i));try{r==="d1"?await(await Promise.resolve().then(()=>(zt(),Bt))).writeStats(e,s)||await(await Promise.resolve().then(()=>(on(),rn))).writeStats(e,s):await(await Promise.resolve().then(()=>(on(),rn))).writeStats(e,s)}catch(a){Si(o);try{console.warn("[stats] 落盘失败：",String(a&&a.message||a))}catch{}}}finally{Kn=!1}}catch{Kn=!1}}var bd=Object.freeze({flushCountThreshold:Fo,flushIntervalMs:qo});var Ai=10,zo=6,Ti=10,Ei=24;function Go(){return{requests:0,hitRate:0,bytes:0,statusDist:{"2xx":0,"3xx":0,"4xx":0,"5xx":0},topHosts:[]}}function Vt(e){return{requests:0,hitRate:0,bytes:0,statusDist:{"2xx":0,"3xx":0,"4xx":0,"5xx":0},series:(e||[]).map(n=>({hour:n,requests:0,bytes:0,hit:0,miss:0}))}}function I(e){let n=Number(e);return Number.isFinite(n)&&n>0?n:0}function Yt(e,n){let t=e+n;return t<=0?0:Math.round(e/t*1e4)/1e4}function Ri(e){let n=new Date(e);return`${n.getUTCFullYear()}`+String(n.getUTCMonth()+1).padStart(2,"0")+String(n.getUTCDate()).padStart(2,"0")+String(n.getUTCHours()).padStart(2,"0")}function Ci(e){let n=Date.now(),t=[];for(let r=e-1;r>=0;r--)t.push(Ri(n-r*36e5));return t}async function Pi(e,n){let t=[];for(let r=0;r<e.length;r+=n){let o=e.slice(r,r+n),s=await Promise.all(o.map(a=>a().catch(()=>null)));t.push(...s)}return t}async function Ko(e){let n="kv";try{let t=await H(e);if(t&&t.statsEnabled===!1)return{name:"none",mod:null};t&&t.statsDriver&&(n=t.statsDriver)}catch{n="kv"}if(n==="none")return{name:"none",mod:null};try{if(n==="d1"){let r=await Promise.resolve().then(()=>(zt(),Bt));return typeof r.isAvailable=="function"&&!r.isAvailable(e)?{name:"kv",mod:await Promise.resolve().then(()=>(on(),rn))}:{name:"d1",mod:r}}return{name:"kv",mod:await Promise.resolve().then(()=>(on(),rn))}}catch{return{name:"none",mod:null}}}function _i(e,n){let t=e&&e.total||{},r=new Map;for(let s of e&&e.series||[])s&&s.hour&&r.set(String(s.hour),s);let o=n.map(s=>{let a=r.get(s);return{hour:s,requests:I(a&&a.requests),bytes:I(a&&a.bytes),hit:I(a&&a.cacheHit),miss:I(a&&a.cacheMiss)}});return{requests:I(t.requests),hitRate:Yt(I(t.cacheHit),I(t.cacheMiss)),bytes:I(t.bytes),statusDist:{"2xx":I(t.status2xx),"3xx":I(t.status3xx),"4xx":I(t.status4xx),"5xx":I(t.status5xx)},series:o}}async function jo(e,n,t=24){let r=Go();try{let o=Array.isArray(n)?n.filter(y=>typeof y=="string"&&y):[];if(o.length===0)return r;let{name:s,mod:a}=await Ko(e);if(!a||typeof a.queryStats!="function")return r;let i=Math.max(1,Math.floor(Number(t)||24));s==="kv"&&(i=Math.min(i,Ei));let l=`${o.slice(0,zo).sort().join(",")}:${i}`,c=Date.now();if(Wn.key===l&&c-Wn.at<Xo)return Wn.data;let d=o;s==="kv"&&(d=o.slice(0,zo));let p=d.map(y=>async()=>{let x=await a.queryStats(e,y,i);return{host:y,total:x&&x.total||{}}}),u=await Pi(p,Ai),h=0,g=0,b=[];for(let y of u){if(!y)continue;let x=y.total;r.requests+=I(x.requests),r.bytes+=I(x.bytes),r.statusDist["2xx"]+=I(x.status2xx),r.statusDist["3xx"]+=I(x.status3xx),r.statusDist["4xx"]+=I(x.status4xx),r.statusDist["5xx"]+=I(x.status5xx),h+=I(x.cacheHit),g+=I(x.cacheMiss),b.push({host:y.host,requests:I(x.requests),bytes:I(x.bytes),hitRate:Yt(I(x.cacheHit),I(x.cacheMiss))})}return r.hitRate=Yt(h,g),b.sort((y,x)=>x.requests-y.requests),r.topHosts=b.slice(0,Ti),Wn={key:l,at:c,data:r},r}catch{return Go()}}async function Wo(e,n,t=24){let r=Math.max(1,Math.floor(Number(t)||24)),o=Ci(r);try{if(typeof n!="string"||!n)return Vt(o);let s=`${n}:${r}`,a=Date.now(),i=an.get(s);if(i&&a-i.at<Xo)return i.data;let{mod:l}=await Ko(e);if(!l||typeof l.queryStats!="function")return Vt(o);let c=await l.queryStats(e,n,r),d=_i(c,o);if(an.size>=Ii){let p=an.keys().next().value;p&&an.delete(p)}return an.set(s,{at:a,data:d}),d}catch{return Vt(o)}}var Xo=3e4,Ii=20,an=new Map,Wn={at:0,key:"",data:null};async function Vo(e){let n=await H(e);if(!n?.statsEnabled||n?.statsDriver==="none")return k({enabled:!1,message:"统计功能未开启，可在「系统设置」中启用",requests:0,hitRate:0,bytes:0,statusDist:{},topHosts:[]});let{sites:t}=await ve(e),r=await jo(e,t.map(o=>o.host),24);return k({enabled:!0,siteCount:t.length,...r})}async function Yo(e,n){let t=Hi(e.url.searchParams.get("hours"),1,168,24),r=await Wo(e,n.toLowerCase(),t);return k({host:n,hours:t,...r})}function Hi(e,n,t,r){let o=parseInt(e,10);return Number.isFinite(o)?Math.min(t,Math.max(n,o)):r}N();$();ee();async function Qo(e,n){let t=n||await H(e);return k({version:be,platform:e.caps.platform,caps:e.caps,statsDriver:t?.statsDriver||"none",statsEnabled:!!t?.statsEnabled,cache:Oo(),limitations:Li(e)})}async function Jo(e){let[n,t,r]=await Promise.all([ve(e),we(e),H(e)]),{sites:o,truncated:s}=n,a={...r};delete a.passwordHash,delete a.passwordSalt;let i={version:be,exportedAt:new Date().toISOString(),global:a,sites:o,pools:t,...s?{incomplete:!0,warning:"站点数量超过单次导出上限，本文件仅包含部分站点，请勿用于完整恢复"}:{}};return new Response(JSON.stringify(i,null,2),{headers:{"content-type":"application/json; charset=utf-8","content-disposition":`attachment; filename="cdn-edge-gateway-config-${Date.now()}.json"`,"cache-control":"no-store"}})}async function Zo(e){let n;try{n=await e.request.json()}catch{return m(f.BAD_REQUEST,"请求体不是合法的 JSON",400)}if(!n||typeof n!="object")return m(f.BAD_REQUEST,"配置格式不正确",400);let t=Array.isArray(n.sites)?n.sites:[],r=Array.isArray(n.pools)?n.pools:[];if(t.length===0&&r.length===0)return m(f.BAD_REQUEST,"配置中没有可导入的站点或源站",400);let o=[],s={sites:0,pools:0};for(let a of r){let i=V(a,e.caps);if(!i.ok){o.push(`源站 ${a?.id||"(未命名)"}: ${i.errors.join("; ")}`);continue}try{i.value.updatedAt=Date.now(),await te(e,i.value),s.pools++}catch(l){o.push(`源站 ${i.value.id} 写入失败: ${l.message}`)}}for(let a of t){if(a&&!a.poolId&&Array.isArray(a.origins)&&a.origins.length>0){let l=a.origins.length===1,c=V({name:l?String(a.origins[0]?.addr||a.host):`${a.host} 的源站池`,kind:l?"single":"pool",strategy:l?"chain":a.originStrategy||"chain",origins:a.origins,failover:a.originFailover,createdBy:a.host||""},e.caps);if(!c.ok){o.push(`站点 ${a?.host||"(未命名)"} 的内联源站迁移失败: ${c.errors.join("; ")}`);continue}try{c.value.updatedAt=Date.now(),await te(e,c.value),s.pools++,a.poolId=c.value.id,delete a.origins,delete a.originStrategy,delete a.originFailover}catch(d){o.push(`站点 ${a.host} 的内联源站写入失败: ${d.message}`);continue}}let i=xe(a);if(!i.ok){o.push(`站点 ${a?.host||"(未命名)"}: ${i.errors.join("; ")}`);continue}try{i.value.updatedAt=Date.now(),await Q(e,i.value),s.sites++}catch(l){o.push(`站点 ${i.value.host} 写入失败: ${l.message}`)}}return le(),k({imported:s,errors:o,message:o.length>0?`部分导入成功，${o.length} 项失败`:"全部导入成功"})}function Li(e){let n=e.caps,t=[];n.hasEdgeCache||t.push({key:"edgeCache",message:"当前平台不支持边缘缓存 API，缓存将完全依赖平台自身 CDN 与 Cache-Control 响应头"}),n.hasSocket||t.push({key:"socket",message:"当前平台不支持 TCP Socket，源站引擎 socket 不可用（回源到裸 IP/非标端口/自定义 Host 需要它），将自动降级为 fetch"}),n.hasD1||t.push({key:"d1",message:"当前平台未绑定 D1，统计只能使用 KV 驱动"}),n.hasKV||t.push({key:"kv",message:"未检测到 KV 绑定，配置将无法持久化，当前运行在默认配置下。请先创建并绑定 KV Namespace"});let r=e&&e.env||{};return typeof r.JWT_SECRET=="string"&&r.JWT_SECRET.length>=8||t.push({key:"jwtSecret",message:"未配置独立的 JWT_SECRET 环境变量，鉴权签名密钥由 passwordHash 派生（降级方案，安全性较弱）。强烈建议配置 JWT_SECRET。"}),t}N();$();ee();async function es(e){let n=await H(e);if(!n)return m(f.NOT_FOUND,"全局配置不存在",404);let t={...n};return delete t.passwordHash,delete t.passwordSalt,k(t)}async function ns(e){let n;try{n=await e.request.json()}catch{return m(f.BAD_REQUEST,"请求体不是合法的 JSON",400)}let t=await H(e),r=ye(n,e.caps,t||void 0);if(!r.ok)return m(f.BAD_REQUEST,"配置校验失败: "+r.errors.join("; "),400);let o=r.value;t&&(o.passwordHash=t.passwordHash||"",o.passwordSalt=t.passwordSalt||""),await Ne(e,o);let s={...o};return delete s.passwordHash,delete s.passwordSalt,k(s)}N();$();ee();async function ts(e){let n=await ke(e);return k({rules:n})}async function rs(e){let n;try{n=await e.request.json()}catch{return m(f.BAD_REQUEST,"请求体不是合法的 JSON",400)}if(!Array.isArray(n))return m(f.BAD_REQUEST,"请求体应为规则数组",400);let t=[];for(let r=0;r<n.length;r++){let o=Ir(n[r]);if(!o.ok)return m(f.BAD_REQUEST,`第 ${r+1} 条规则校验失败: ${o.errors.join("; ")}`,400);t.push(o.value)}return await At(e,t),k({rules:t})}var Mi=Object.freeze([{method:"POST",path:"/auth/login",auth:!1,handler:(e,n)=>oo(e,n)},{method:"POST",path:"/auth/logout",auth:!0,handler:e=>so(e)},{method:"GET",path:"/auth/me",auth:!1,handler:async e=>{let n=await It(e);return k({authed:!!(n&&n.sub)})}},{method:"POST",path:"/auth/password",handler:(e,n)=>ao(e,n)},{method:"GET",path:"/sites",handler:e=>mo(e)},{method:"GET",path:"/sites/templates",handler:()=>go()},{method:"GET",path:/^\/sites\/([^/]+)$/,paramName:"host",handler:(e,n,t)=>bo(e,t)},{method:"PUT",path:/^\/sites\/(.+)\/basics$/,paramName:"host",handler:(e,n,t)=>vo(e,t)},{method:"PUT",path:/^\/sites\/(.+)\/rules$/,paramName:"host",handler:(e,n,t)=>wo(e,t)},{method:"PUT",path:/^\/sites\/(.+)\/security$/,paramName:"host",handler:(e,n,t)=>ko(e,t)},{method:"PUT",path:/^\/sites\/([^/]+)$/,paramName:"host",handler:(e,n,t)=>xo(e,t)},{method:"DELETE",path:/^\/sites\/([^/]+)$/,paramName:"host",handler:(e,n,t)=>yo(e,t)},{method:"GET",path:"/pools",handler:e=>So(e)},{method:"POST",path:"/pools",handler:e=>Ro(e)},{method:"GET",path:/^\/pools\/([^/]+)\/refs$/,paramName:"pool id",handler:(e,n,t)=>Ao(e,t)},{method:"GET",path:/^\/pools\/([^/]+)$/,paramName:"pool id",handler:(e,n,t)=>To(e,t)},{method:"PUT",path:/^\/pools\/([^/]+)$/,paramName:"pool id",handler:(e,n,t)=>Co(e,t)},{method:"DELETE",path:/^\/pools\/([^/]+)$/,paramName:"pool id",handler:(e,n,t)=>Po(e,t)},{method:"GET",path:"/rules/global",handler:e=>ts(e)},{method:"PUT",path:"/rules/global",handler:e=>rs(e)},{method:"POST",path:"/cache/purge",handler:e=>Do(e)},{method:"GET",path:"/stats/overview",handler:e=>Vo(e)},{method:"GET",path:/^\/stats\/host\/(.+)$/,paramName:"host",handler:(e,n,t)=>Yo(e,t)},{method:"GET",path:"/system/info",handler:(e,n)=>Qo(e,n)},{method:"GET",path:"/system/export",handler:e=>Jo(e)},{method:"POST",path:"/system/import",handler:e=>Zo(e)},{method:"GET",path:"/config/global",handler:e=>es(e)},{method:"PUT",path:"/config/global",handler:e=>ns(e)}]);async function os(e,n,t){let r=e.request.method.toUpperCase(),o=e.reqId;if(r==="OPTIONS")return new Response(null,{status:204,headers:zi()});let s=n.replace(/\/+$/,"")||"/";try{let a=Fi(r,s);if(!a)throw new _n(`接口不存在: ${r} ${s}`);if(a.route.auth!==!1&&!await qi(e))throw new $e("未登录或登录已过期");let i;if(a.raw!==void 0&&(i=Bi(a.raw),!i))throw new Pn(`非法的 ${a.route.paramName||"路径"} 参数`);return new Set(["POST","PUT","DELETE","PATCH"]).has(r)&&await Ui(e),await a.route.handler(e,t,i)}catch(a){return(!a||a.expose!==!0)&&console.error(`[api] error reqId=${o} ${r} ${s}: ${Ve(a?.message)}`,a?.stack),qr(a,{reqId:o})}}function Fi(e,n){for(let t of Mi){if(t.method!==e)continue;if(typeof t.path=="string"){if(t.path===n)return{route:t};continue}let r=n.match(t.path);if(r)return{route:t,raw:r[1]}}return null}async function qi(e){try{let n=await It(e);return!!(n&&n.sub)}catch{return!1}}async function Ui(e){let n=e.request.headers.get("origin");if(!n)return;let t;try{t=new URL(n).host}catch{throw new $e("非法的 Origin 头")}let r=(()=>{try{return new URL(e.request.url).host}catch{return null}})();if(r&&t!==r)throw new $e("跨站请求被拒绝（CSRF 防护）")}function Bi(e){if(typeof e!="string"||e==="")return"";let n;try{n=decodeURIComponent(e).trim()}catch{return""}return!n||n.includes("%")||n.includes("/")||n.includes("\\")||n.includes("..")||/[\x00-\x1f\x7f]/.test(n)||n.length>255?"":n}function zi(){return{"access-control-allow-methods":"GET,POST,PUT,DELETE,OPTIONS","access-control-allow-headers":"content-type,authorization","access-control-max-age":"86400"}}async function as(e,n,t){let r=(t||"__panel").replace(/^\/+|\/+$/g,"")||"__panel",o=new URL(n.url),s=o.pathname,a=`/${r}`;if(s!==a&&s!==a+"/"&&!s.startsWith(a+"/"))return null;if(s.startsWith(a+"/assets/")){let i=s.slice((a+"/assets/").length);if(i!=="app.css"&&i!=="app.js")return null;let l=i.endsWith(".css"),c=e?.env?.ASSETS;if(c?.fetch)try{let d=new Request(o.origin+"/assets/"+i,n),p=await c.fetch(d);if(p&&p.status<400){let u=new Headers(p.headers);return u.set("cache-control","public, max-age=86400, immutable"),u.set("x-content-type-options","nosniff"),new Response(p.body,{status:p.status,headers:u})}}catch{}try{let d=await Promise.resolve().then(()=>(Jt(),Qt)),p=l?d.UI_CSS:d.UI_JS;if(p)return new Response(p,{status:200,headers:{"content-type":l?"text/css; charset=utf-8":"text/javascript; charset=utf-8","cache-control":"public, max-age=86400, immutable","x-content-type-options":"nosniff"}})}catch{}return null}return s===a||s===a+"/"?Zt(e,r):null}async function Zt(e,n){let t;try{t=(await Promise.resolve().then(()=>(Jt(),Qt))).UI_HTML}catch{t=ss}t||(t=ss);let r=t.replace("</head>",`<script>window.__BASE__=${JSON.stringify("/"+n)};window.__PLATFORM__=${JSON.stringify(e.caps.platform)};</script></head>`);return new Response(r,{headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store, no-cache, must-revalidate","x-frame-options":"DENY","x-content-type-options":"nosniff","referrer-policy":"no-referrer"}})}var ss=`<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>EdgeCDN 管理面</title>
<style>
body{background:#0f1115;color:#e6e6e6;font-family:system-ui,-apple-system,"PingFang SC",sans-serif;
display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.box{max-width:520px;padding:32px;background:#171a21;border:1px solid #262b36;border-radius:12px}
h1{margin:0 0 12px;font-size:18px}code{background:#0b0d11;padding:2px 6px;border-radius:4px}
</style></head><body><div class="box">
<h1>管理面尚未构建</h1>
<p>请在项目根目录执行 <code>npm install &amp;&amp; npm run build</code> 生成前端资源后重新部署。</p>
</div></body></html>`;$();ae();async function is(e){let n=String(e.url.hostname||"").toLowerCase().replace(/:\d+$/,"");if(!n)return null;let t=null;try{t=await j(e,n)}catch(r){return e.debug.siteError=r?.message||String(r),null}return!t||t.enabled===!1?null:(e.debug.siteId=t.host,t)}function Wi(e){let n=e.url,t=n.pathname,r=t.split("/").pop()||"",o=r.lastIndexOf("."),s=o>0&&o!==r.length-1?r.slice(o+1).toLowerCase():"",a=e.request.headers;return{host:String(n.hostname||"").toLowerCase(),path:t,fullUrl:n.href,query:n.search.replace(/^\?/,""),extension:s,filename:r,directory:t.slice(0,t.lastIndexOf("/")+1),method:(e.request.method||"GET").toUpperCase(),protocol:(n.protocol||"https:").replace(":",""),clientIp:a.get("cf-connecting-ip")||a.get("x-real-ip")||"",clientCountry:(a.get("cf-ipcountry")||"").toUpperCase(),userAgent:a.get("user-agent")||"",referer:a.get("referer")||"",origin:e.origin?`${e.origin.id}`:"",originAddr:e.origin?`${e.origin.addr}`:"",_headers:a,_url:n}}function Xi(e,n){let t=n.target;if(t==="header")return e._headers.get(n.key||"");if(t==="cookie"){let o=e._headers.get("cookie")||"",s=n.key||"";if(!s)return null;for(let a of o.split(";")){let i=a.indexOf("=");if(!(i<0)&&a.slice(0,i).trim()===s)return a.slice(i+1).trim()}return null}if(t==="query")return n.key?e._url.searchParams.get(n.key):e.query;if(t==="origin"||t==="originAddr")return e[t]??null;let r=e[t];return r===void 0?null:r}function Vi(e,n,t,r){if(e==="exists")return n!==null;if(e==="notExists")return n===null;if(n===null)return!1;let o=Array.isArray(t)?t:[];if(o.length===0)return!1;let s=r?n.toLowerCase():n,a=l=>r?String(l).toLowerCase():String(l);if(e==="regex"||e==="notRegex"){let l=o.some(c=>{try{return new RegExp(String(c),r?"i":"").test(n)}catch{return!1}});return e==="regex"?l:!l}let i=!1;switch(e){case"equal":case"notEqual":return i=o.some(l=>s===a(l)),e==="equal"?i:!i;case"contain":case"notContain":return i=o.some(l=>s.includes(a(l))),e==="contain"?i:!i;case"prefix":case"notPrefix":return i=o.some(l=>s.startsWith(a(l))),e==="prefix"?i:!i;case"suffix":case"notSuffix":return i=o.some(l=>s.endsWith(a(l))),e==="suffix"?i:!i;default:return!1}}function Yi(e,n){if(!e||!e.target||!e.op||kr.includes(e.target)&&!e.key&&e.target!=="query")return!1;let t=e.ignoreCase!==!1,r=Xi(n,e);return Vi(e.op,r,e.values,t)}function Qi(e,n){let t=e?.match||{};if(!Ji(t,n))return!1;let r=Array.isArray(t.conditions)?t.conditions.filter(o=>Array.isArray(o)&&o.length):[];return r.length===0?!0:r.some(o=>o.every(s=>Yi(s,n)))}function Ji(e,n){if(e.pathPrefix&&!n.path.startsWith(e.pathPrefix))return!1;if(e.pathRegex)try{if(!new RegExp(e.pathRegex).test(n.path))return!1}catch{return!1}if(Array.isArray(e.extIn)&&e.extIn.length>0){let t=e.extIn.map(r=>String(r).toLowerCase().replace(/^\./,""));if(!n.extension||!t.includes(n.extension))return!1}return!(Array.isArray(e.methodIn)&&e.methodIn.length>0&&!e.methodIn.map(r=>String(r).toUpperCase()).includes(n.method))}function er(e,n){let t=Array.isArray(e?.rules)?e.rules:[];if(t.length===0)return null;let r=Wi(n),o=t.filter(s=>s&&s.enabled!==!1).slice().sort((s,a)=>(Number(a.priority)||0)-(Number(s.priority)||0));for(let s of o)if(Qi(s,r))return n.debug.ruleId=s.id,s;return null}N();ae();var Zi=["cf-","x-forwarded-"],el=new Set(["x-real-ip","cookie","referer","origin"]),nl=15552e3,tl=1800;function ls(e,n,t,r,o){let s=new Headers;for(let[i,l]of e.request.headers)mr.has(i.toLowerCase())&&s.set(i,l);for(let[i,l]of Object.entries(br))s.set(i,l);s.has("accept-encoding")||s.set("Accept-Encoding","gzip, deflate, br");let a=n?.extraHeaders||{};for(let[i,l]of Object.entries(a)){let c=ds(l,r);if(c===null){ps(e,`missing-secret:${i}`);continue}s.set(i,c)}if(cs(s,t,e,r),rl(s),o?.enabled){let i=e.request.headers.get("cf-connecting-ip")||e.request.headers.get("x-real-ip")||"";i&&s.set(o.name||"X-Forwarded-For",i)}return s}function nr(e,n,t,r){let o=new Headers(n.headers);for(let c of xr)o.delete(c);let s=n.status,a=t?.statusTtl?.[String(s)];for(let c of["set-cookie","pragma","no-store","private"])o.delete(c);o.get("expires")==="0"&&o.delete("expires");let i=(c,d)=>{let p=d?`, stale-while-revalidate=${d}`:"";o.set("CDN-Cache-Control",`public, max-age=${c}${p}`)};if(a!==void 0)o.set("Cache-Control",`public, max-age=0, s-maxage=${Number(a)||0}`),i(Number(a)||0,t?.staleWhileRevalidate);else if(mn.has(s))o.set("Cache-Control","no-store"),o.set("CDN-Cache-Control","no-store");else if(t?.enabled&&t.mode!=="origin"){let c=Number(t.edgeTtl)||nl,d=Number(t.browserTtl),p=d===0?tl:d;o.set("Cache-Control",p<0?`public, s-maxage=${c}`:`public, max-age=${p}, immutable, s-maxage=${c}`),i(c,t?.staleWhileRevalidate)}cs(o,r,e,null);let l=e.debug||{};return ln(o,"X-Cache",l.cache),ln(o,"X-Origin-Id",l.originId),ln(o,"X-Origin-Addr",l.originAddr),ln(o,"X-Rule-Id",l.ruleId),ln(o,"X-Retry-Count",l.retries!=null?String(l.retries):void 0),o.set("X-Edge-Time",`${Date.now()-e.startTime}ms`),o.set("Server",z),o.set("Via",`1.1 ${z}`),o}function cs(e,n,t,r){if(n){if(Array.isArray(n.remove))for(let o of n.remove)o&&e.delete(String(o));if(n.set&&typeof n.set=="object")for(let[o,s]of Object.entries(n.set))if(r){let a=ds(s,r);if(a===null){ps(t,`missing-secret:${o}`);continue}e.set(o,a)}else e.set(o,String(s))}}function ds(e,n){let t=String(e??"");if(!t.startsWith("@secret:"))return t;let r=t.slice(8).trim();if(!r||!n)return null;let o=n[r];return o==null||o===""?null:String(o)}function rl(e){let n=[];for(let t of e.keys()){let r=t.toLowerCase();(el.has(r)||Zi.some(o=>r.startsWith(o)))&&n.push(t)}for(let t of n)e.delete(t)}function ln(e,n,t){t!=null&&t!==""&&e.set(n,String(t))}function ps(e,n){!e||!e.debug||(Array.isArray(e.debug.notes)||(e.debug.notes=[]),e.debug.notes.push(n))}function ol(e){let n={};for(let t of String(e).split(";")){let r=t.indexOf("=");if(r<0)continue;let o=t.slice(0,r).trim();o&&(n[o]=t.slice(r+1).trim())}return n}function us(e,n,t,r){let o=new URL(String(t));if(n?.ignoreQuery)o.search="";else{let i=Array.isArray(n?.queryWhitelist)?n.queryWhitelist:[],l=o.searchParams,c=[];for(let[p,u]of l)(i.length===0||i.includes(p))&&c.push([p,u]);c.sort((p,u)=>p[0]===u[0]?p[1]<u[1]?-1:1:p[0]<u[0]?-1:1);let d=new URLSearchParams;for(let[p,u]of c)d.append(p,u);o.search=d.toString()}o.searchParams.set("__h",e.url.hostname.toLowerCase());let s=n?.key;if(s){if(s.includeScheme&&o.searchParams.set("__s",e.url.protocol.replace(":","")),Array.isArray(s.headers)&&s.headers.length){let i=[];for(let l of[...s.headers].sort()){let c=e.request.headers.get(l);c!==null&&i.push(`${l}=${c}`)}i.length&&o.searchParams.set("__hd",i.join("&"))}if(Array.isArray(s.cookies)&&s.cookies.length){let i=ol(e.request.headers.get("cookie")||""),l=[];for(let c of[...s.cookies].sort())c in i&&l.push(`${c}=${i[c]}`);l.length&&o.searchParams.set("__ck",l.join("&"))}s.ignoreCase&&(o.pathname=o.pathname.toLowerCase(),o.search=o.search.toLowerCase())}let a=Number(r?.cacheGen)||0;return a>0&&o.searchParams.set("__gen",String(a)),new Request(o.toString(),{method:"GET"})}function fs(e,n){return!!(!n?.enabled||n.mode==="noCache"||(e.request.method||"GET").toUpperCase()!=="GET"||e.request.headers.has("range")||e.request.headers.has("authorization"))}function Xn(e,n){let t=e&&e.type&&e.type!=="none"?e:null,r=n&&n.type&&n.type!=="none"?n:null;return r||t||{type:"none",value:"",regexFrom:"",regexTo:""}}function cn(e,n){let t={...e?.set||{},...n?.set||{}},r=new Set([...Array.isArray(e?.remove)?e.remove:[],...Array.isArray(n?.remove)?n.remove:[]]);return{set:t,remove:Array.from(r)}}function sl(e,n){let t=n?.type||"none",r=e||"/";switch(t){case"prefix":{let o=n.value||"";r=hs(o,r);break}case"strip":{let o=n.value||"";o&&r.startsWith(o)&&(r=r.slice(o.length));break}case"regex":{try{let o=new RegExp(n.regexFrom||"","g");r=r.replace(o,n.regexTo??"")}catch{r=e}break}default:break}return al(r)}function Vn(e,n,t,r){let o=sl(e.url.pathname,t?.action?.rewrite),s=n.pathPrefix?hs(n.pathPrefix,o):o,a=n.scheme||"https",i=n.addr,l=!n.port||a==="https"&&Number(n.port)===443||a==="http"&&Number(n.port)===80,c=i,d=n.port;if(r&&r.mode==="custom"&&r.custom){let[g,b]=String(r.custom).split(":");c=g,b&&(d=Number(b))}else r&&(r.mode==="client"||r.mode==="accel")&&(c=e.url.hostname);let p=c.includes(":")&&!/^\[.*\]$/.test(c)?`[${c}]`:c,u=l?p:`${p}:${d}`,h=new URL(`${a}://${u}`);return h.pathname=s,h.search=e.url.search,h}function hs(e,n){let t=(e||"").replace(/\/+$/,""),r=(n||"").replace(/^\/+/,"");return t?r?`${t}/${r}`:t||"/":`/${r}`}function al(e){let n=e||"/";return n.startsWith("/")||(n=`/${n}`),n=n.replace(/\/{2,}/g,"/"),n}function Yn(e,n,t){let r=e||{};if(r.mode&&r.mode!=="inherit")return{mode:r.mode,custom:r.custom||""};let o=n||{};if(o.mode&&o.mode!=="inherit")return{mode:o.mode,custom:o.custom||""};let s=t||{};return{mode:s.mode||"accel",custom:s.custom||""}}$();ae();var il=`<!DOCTYPE html>
<html>
<head>
<title>Welcome to nginx!</title>
<style>
    body {
        width: 35em;
        margin: 0 auto;
        font-family: Tahoma, Verdana, Arial, sans-serif;
    }
</style>
</head>
<body>
<h1>Welcome to nginx!</h1>
<p>If you see this page, the nginx web server is successfully installed and
working. Further configuration is required.</p>

<p>For online documentation and support please refer to
<a href="http://nginx.org/">nginx.org</a>.<br/>
Commercial support is available at
<a href="http://nginx.com/">nginx.com</a>.</p>

<p><em>Thank you for using nginx.</em></p>
</body>
</html>
`,Qn=86400,ll=600*1e3,Ee=null;async function Jn(e,n){let t=n||Ke;try{if(t.mode==="none")return new Response("Not Found",{status:404,headers:{"content-type":"text/plain; charset=utf-8"}});if(t.mode==="proxy"&&t.target){let r=await cl(e,t.target);if(r)return r}return gs(t.status)}catch{return gs(Ke.status)}}function gs(e){let n=Number.isInteger(e)&&e>=200&&e<=599?e:200;return new Response(il,{status:n,headers:{"content-type":"text/html; charset=utf-8","cache-control":`public, max-age=${Qn}, s-maxage=${Qn}`,server:"nginx"}})}async function cl(e,n){let t=Date.now();if(Ee&&Ee.key===n&&t-Ee.cachedAt<ll)return new Response(Ee.body,{status:Ee.status,headers:new Headers(Ee.headers)});try{let r=await fetch(n,{method:"GET",headers:{"user-agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",accept:"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"},redirect:"follow",signal:AbortSignal.timeout?AbortSignal.timeout(5e3):void 0});if(!r||!r.ok)return null;let o=512*1024,s=await r.arrayBuffer();if(s.byteLength>o)return null;let a=new TextDecoder().decode(s),l={"content-type":r.headers.get("content-type")||"text/html; charset=utf-8","cache-control":`public, max-age=${Qn}, s-maxage=${Qn}`,server:"nginx"};return Ee={key:n,body:a,status:r.status,headers:l,cachedAt:t},new Response(a,{status:r.status,headers:new Headers(l)})}catch{return null}}ae();se();var dl="rl:",pl=120,ul=3e4,fl=5e3,Ue=new Map,tr=-1;function hl(){return Math.floor(Date.now()/6e4)}function gl(e){if(Ue.size>fl){Ue.clear(),tr=e;return}if(e===tr)return;tr=e;let n=`:${e}`;for(let t of Ue.keys())t.endsWith(n)||Ue.delete(t)}function ml(e){return String(e||"unknown").toLowerCase().replace(/[^a-z0-9.\-*_]/g,"").slice(0,128)||"unknown"}function bl(e){return String(e||"unknown").replace(/[^0-9a-fA-F.:]/g,"").slice(0,45).toLowerCase()||"unknown"}function ms(e){return!(e==null||e===""||e==="0")}async function bs(e,n,t,r){let o=Number(r);if(!Number.isFinite(o)||o<=0)return{limited:!1,count:0,rpm:0,retryAfter:0};let s=hl();gl(s);let a=ml(n),i=bl(t),l=`${a}:${i}:${s}`,c=`${dl}${l}`,d=Ue.get(l);d||(d={local:0,tripped:!1,remoteAt:0},Ue.set(l,d)),d.local+=1;let p=Math.max(1,60-Math.floor(Date.now()%6e4/1e3));if(d.tripped)return{limited:!0,count:o+1,rpm:o,retryAfter:p};let u=O(e&&e.env);if(!u)return{limited:d.local>o,count:d.local,rpm:o,retryAfter:p};try{let h=Date.now();if(d.local<=o){if(d.remoteAt===0||h-d.remoteAt>=ul){let b=await u.get(c);if(d.remoteAt=h,ms(b))return d.tripped=!0,{limited:!0,count:o+1,rpm:o,retryAfter:p}}return{limited:!1,count:d.local,rpm:o,retryAfter:p}}let g=await u.get(c);return ms(g)?(d.tripped=!0,{limited:!0,count:o+1,rpm:o,retryAfter:p}):(await u.put(c,"1",{expirationTtl:pl}),d.tripped=!0,d.remoteAt=h,{limited:!0,count:o+1,rpm:o,retryAfter:p})}catch{return{limited:d.local>o,count:d.local,rpm:o,retryAfter:p}}}var Zn={second:0,count:0};function xs(e){let n=Number(e);if(!Number.isFinite(n)||n<=0)return{limited:!1,retryAfter:0};let t=Math.floor(Date.now()/1e3);return Zn.second!==t?(Zn={second:t,count:1},{limited:!1,retryAfter:0}):(Zn.count+=1,Zn.count<=n?{limited:!1,retryAfter:0}:{limited:!0,retryAfter:1})}var xl="Forbidden";function fe(e,n,t=403){try{e&&e.debug&&(e.debug.blockedBy=n)}catch{}return new Response(xl,{status:t,headers:{"Content-Type":"text/plain; charset=utf-8","Cache-Control":"no-store"}})}function ys(e){let n=String(e).split(".");if(n.length!==4)return null;let t=0;for(let r of n){if(!/^\d{1,3}$/.test(r))return null;let o=Number(r);if(o>255)return null;t=t<<8|o}return t>>>0}function yl(e,n){let t=String(n||"").trim().toLowerCase(),r=String(e||"").trim().toLowerCase();if(!t||!r||r==="unknown")return!1;let o=t.indexOf("/");if(o>0){let s=t.slice(0,o),a=parseInt(t.slice(o+1),10);if(!Number.isFinite(a)||a<0||a>32)return!1;let i=ys(s),l=ys(r);if(i===null||l===null)return!1;if(a===0)return!0;let c=a===32?4294967295:4294967295<<32-a>>>0;return(i&c)===(l&c)}return t.endsWith("*")?r.startsWith(t.slice(0,-1)):r===t}function vs(e,n){if(!Array.isArray(n)||n.length===0)return!1;for(let t of n)if(yl(e,t))return!0;return!1}function ws(e,n){if(!Array.isArray(n)||n.length===0)return!1;let r=String(e||"").toLowerCase();for(let o of n){let s=String(o||"").trim();if(s&&r.includes(s.toLowerCase()))return!0}return!1}function vl(e){try{return e?new URL(e).hostname.toLowerCase():""}catch{return""}}function wl(e,n){let t=String(n||"").trim().toLowerCase();if(!t||!e)return!1;if(t==="*")return!0;if(t.includes("://"))try{t=new URL(t).hostname.toLowerCase()}catch{}if(t=t.replace(/\/.*$/,"").replace(/:\d+$/,""),t.startsWith("*.")){let r=t.slice(2);return r?e===r||e.endsWith(`.${r}`):!1}return e===t}function kl(e,n){let t=n.refererMode;if(t!=="whitelist"&&t!=="blacklist")return!1;let r=e.headers.get("Referer")||"",o=vl(r);if(!o)return n.allowEmptyReferer===!1;let s=Array.isArray(n.refererList)?n.refererList:[],a=!1;for(let i of s)if(wl(o,i)){a=!0;break}return t==="whitelist"?s.length===0?!1:!a:a}function Sl(e,n,t){return`${String(e||"").toLowerCase()}
${n}
${t}`}async function Al(e,n){let t=String(n.param||"sign"),r=String(n.secret||"");if(!r)return!0;let o=e.url.searchParams,s=o.get(t),a=o.get("t");if(!s||!a||!/^\d{1,15}$/.test(a))return!0;let i=parseInt(a,10);if(!Number.isFinite(i))return!0;let l=Math.floor(Date.now()/1e3);if(l>i)return!0;let c=Number(n.ttl);if(Number.isFinite(c)&&c>0&&i-l>c)return!0;try{return!await zr(r,Sl(e.url.hostname,e.url.pathname,i),String(s))}catch{return!0}}async function ks(e,n){try{let t=n&&n.security;if(!t||typeof t!="object")return null;let r=e.request,o=qn(r);if(Array.isArray(t.ipWhitelist)&&t.ipWhitelist.length>0&&!vs(o,t.ipWhitelist))return fe(e,"ip-whitelist");if(vs(o,t.ipBlacklist))return fe(e,"ip-blacklist");if(ws(r.headers.get("User-Agent")||"",t.uaBlacklist))return fe(e,"ua-blacklist");let s=t.botManagement;if(s&&s.enabled===!0){let a=r.headers.get("User-Agent")||"",i=ws(a,s.list||[]);if(s.mode==="allowlist"?!i:i)return fe(e,"bot-management")}if(kl(r,t))return fe(e,"referer");if(t.signedUrl&&t.signedUrl.enabled===!0&&await Al(e,t.signedUrl))return fe(e,"signed-url");if(t.rateLimit&&t.rateLimit.enabled===!0){let a=n&&n.host||e.url.hostname,i=await bs(e,a,o,t.rateLimit.rpm);if(i.limited){let l=fe(e,"ratelimit",429);try{l.headers.set("Retry-After",String(i.retryAfter))}catch{}return l}}return null}catch(t){try{console.error("[guard] 安全检查异常，按 fail-closed 拦截：",String(t&&t.message||t))}catch{}try{return fe(e,"guard-error")}catch{return new Response("Forbidden",{status:403,headers:{"cache-control":"no-store"}})}}}var Ss=new Map;function dn(e,n,t){let r=new Set(t||[]),o=(e?.origins||[]).filter(s=>s&&s.enabled!==!1&&!r.has(s.id));if(o.length===0)return null;if(o.length===1)return o[0];switch(e.strategy){case"roundrobin":return Tl(e,o);case"random":return El(o);case"weighted":return Rl(o);case"iphash":return Cl(o,n);default:return As(o)}}function As(e){return e.slice().sort((n,t)=>(Number(n.order)||0)-(Number(t.order)||0))[0]}function Tl(e,n){let t=n.slice().sort((a,i)=>(Number(a.order)||0)-(Number(i.order)||0)),r=e.id||"default",o=Ss.get(r)||0,s=o+1;return Ss.set(r,s%1e9),t[o%t.length]}function El(e){return e[Math.floor(Math.random()*e.length)]}function Rl(e){let n=[],t=0;for(let o of e){let s=Number(o.weight)>0?Number(o.weight):1;t+=s,n.push(t)}let r=Math.random()*t;for(let o=0;o<n.length;o++)if(r<n[o])return e[o];return e[e.length-1]}function Cl(e,n){let t=n?.request?.headers?.get("cf-connecting-ip")||n?.request?.headers?.get("x-real-ip")||"";if(!t)return As(e);let r=e.slice().sort((o,s)=>(Number(o.order)||0)-(Number(s.order)||0));return r[Pl(t)%r.length]}function Pl(e){let n=2166136261;for(let t=0;t<e.length;t++)n^=e.charCodeAt(t),n=n+((n<<1)+(n<<4)+(n<<7)+(n<<8)+(n<<24))>>>0;return n>>>0}se();var Ts=3,Es=60,et=new Map,_l=Es*1e3;function Il(e){let n=et.get(e);if(n){if(Date.now()>n.expireAt){et.delete(e);return}return n.count}}function Rs(e,n){et.set(e,{count:n,expireAt:Date.now()+_l})}function Hl(e){et.delete(e)}function pn(e,n){return`hc:${e}:${n}`}async function Cs(e,n,t){let r=or(e);if(!r)return!1;try{let o=Il(pn(n,t));if(o!==void 0)return o>=Ts;let s=await r.get(pn(n,t));if(s==null)return!1;let a=parseInt(s,10);return Number.isFinite(a)&&Rs(pn(n,t),a),a>=Ts}catch{return!1}}async function rr(e,n,t){let r=or(e);r&&e.waitUntil((async()=>{try{let o=pn(n,t),s=await r.get(o),a=parseInt(s,10),i=(Number.isFinite(a)?a:0)+1;Rs(o,i),await r.put(o,String(i),{expirationTtl:Es})}catch{}})())}async function Ps(e,n,t){let r=or(e);r&&e.waitUntil((async()=>{try{let o=pn(n,t);Hl(o),await r.delete(o)}catch{}})())}function or(e){try{return O(e.env)||null}catch{return null}}async function _s(e,n,t,r,o,s){let a=Number(o)>0?Number(o):1e4,i=new AbortController,l=setTimeout(()=>i.abort(),a),c=(e.request.method||"GET").toUpperCase(),d={method:c,headers:r,signal:i.signal,redirect:s?.followRedirect?"follow":"manual"};c!=="GET"&&c!=="HEAD"&&(s?.bodyBuf!=null?d.body=s.bodyBuf:(d.body=e.request.body,d.duplex="half"));try{return await fetch(String(t),d)}finally{clearTimeout(l)}}function Ol(e,n){let t=e||"/",r=n.r2KeyMode||"none",o=n.r2KeyPrefixRule||"";switch(r){case"prefix":{o&&(t=(o.replace(/\/+$/,"")+"/"+t.replace(/^\/+/,"")).replace(/^\/+/,""));break}case"strip":{o&&t.startsWith(o)&&(t=t.slice(o.length));break}case"regex":{try{let s=new RegExp(o||"","g");t=t.replace(s,n.r2KeyRegexTo??"")}catch{}break}default:break}return t.replace(/^\/+/,"")}function Ll(e,n){let t=(e.r2KeyPrefix||"").replace(/^\/+/,"").replace(/\/+$/,""),r=Ol(n.pathname,e);return t?`${t}/${r}`:r}async function Is(e,n,t,r,o){let s=n.r2Binding,a=e.env?.[s];if(!a||typeof a.get!="function")return new Response(`R2 binding "${s}" 未绑定或不可用（仅 Cloudflare 支持）`,{status:502,headers:{"content-type":"text/plain; charset=utf-8"}});let i=Ll(n,t);if(!i)return new Response("R2 key 为空（请检查源站 r2KeyPrefix / r2KeyMode 配置）",{status:400,headers:{"content-type":"text/plain; charset=utf-8"}});let l=e.request.headers.get("if-none-match"),c=l?{onlyIf:{etagDoesNotMatch:l}}:void 0,d=a.get(i,c),p=await Dl(d,o,`R2 get "${i}"`);if(!p)return new Response("Not Found",{status:404,headers:{"content-type":"text/plain; charset=utf-8"}});if(p.body===null){let b=new Headers;return p.httpEtag&&b.set("etag",p.httpEtag),p.uploaded&&b.set("last-modified",new Date(p.uploaded).toUTCString()),new Response(null,{status:304,headers:b})}let u=new Headers,h=p.httpMetadata?.contentType||n.r2ContentType||"application/octet-stream";u.set("content-type",h),p.httpEtag&&u.set("etag",p.httpEtag),p.uploaded&&u.set("last-modified",new Date(p.uploaded).toUTCString()),p.size!=null&&u.set("content-length",String(p.size));let g=p.customMetadata||{};for(let[b,y]of Object.entries(g))(b.toLowerCase().startsWith("x-")||b.toLowerCase().startsWith("access-control-"))&&u.set(b,y);return new Response(p.body,{status:200,headers:u})}function Dl(e,n,t){return!n||n<=0?e:new Promise((r,o)=>{let s=setTimeout(()=>o(new Error(`${t} 超时（${n}ms）`)),n);e.then(a=>{clearTimeout(s),r(a)},a=>{clearTimeout(s),o(a)})})}N();var jl=5*1024*1024;async function Ds(e,n,t,r){let o=n?.failover||{},s=o.enabled!==!1,a=new Set(Array.isArray(o.retryOn)&&o.retryOn.length>0?o.retryOn:Re),i=s?Number.isFinite(o.maxRetries)?o.maxRetries:2:0,l=Number(o.timeoutMs)>0?Number(o.timeoutMs):1e4,c=await Xl(e,n);e.debug.tried=e.debug.tried||[];let d=null,p=null,u=i+1,h=(e.request.method||"GET").toUpperCase(),g=null;if(h!=="GET"&&h!=="HEAD"&&e.request.body&&(Number(e.request.headers.get("content-length"))||0)<=jl)try{g=await e.request.arrayBuffer()}catch{g=null}for(let x=0;x<u;x++){let P=dn(n,e,c);if(!P)break;let _=t?.action||{},F=_.scheme||P.scheme||"https",q=Number(_.port)>0?Number(_.port):Number(P.port)>0?Number(P.port):F==="http"?80:443,U=_.engine||P.engine||"fetch",S={...P,scheme:F,port:q,engine:U};c.push(S.id),e.debug.tried.push(S.id),e.debug.retries=x,e.debug.originId=S.id,e.debug.originAddr=`${S.addr}:${S.port||(S.scheme==="http"?80:443)}`;let he=Xn(S.rewrite,_.rewrite),tt=cn(S.reqHeaders,_.reqHeaders),A=Vl(S.clientIpHeader,_.clientIpHeader),J=Number(S.originTimeoutMs)||0,hn=Number(_.originTimeoutMs)||0,rt=hn>0?hn:J>0?J:l,ot=_.followRedirect!==void 0?_.followRedirect===!0:S.followRedirect===!0,Ws={action:{rewrite:he}},sr=Yn(t?.action?.hostHeader,S.hostHeader,r),Xs=Vn(e,S,Ws,sr),Vs=ls(e,S,tt,e.env,A);try{let oe=await Wl(e,S,Xs,Vs,rt,{followRedirect:ot,bodyBuf:g,hostHeader:sr});if(s&&a.has(oe.status)){await rr(e,n.id,S.id),await oe.body?.cancel().catch(()=>{}),d={status:oe.status,statusText:oe.statusText,headers:new Headers(oe.headers)},p=null;continue}return await Ps(e,n.id,S.id),oe}catch(oe){if(p=oe,d=null,await rr(e,n.id,S.id),!s)break}}if(d)return new Response(null,{status:d.status,statusText:d.statusText,headers:d.headers});let b=p?p.message||String(p):"no available origin",y=e.debug.tried.length?e.debug.tried.join(", "):"(none)";return new Response(`Bad Gateway: all origins failed.
Tried: ${y}
Last error: ${b}`,{status:502,headers:{"Content-Type":"text/plain; charset=utf-8","Cache-Control":"no-store"}})}async function Wl(e,n,t,r,o,s){if(n.engine==="r2")return Is(e,n,t,r,o,s);if(n.engine==="socket"&&e.caps?.hasSocket)try{let{socketFetch:l}=await Promise.resolve().then(()=>(Ls(),Os));return await l(e,n,t,r,o,s)}catch(l){Array.isArray(e.debug.notes)||(e.debug.notes=[]),e.debug.notes.push(`socket-fallback:${l?.message||l}`)}let a=s?.hostHeader,i=a?.custom;return i&&String(i).trim()&&String(i).trim()!==String(t.hostname)?r.set("Host",String(i).trim()):a?.mode==="accel"&&e.url.hostname&&e.url.hostname!==String(t.hostname)&&r.set("Host",e.url.hostname),_s(e,n,t,r,o,s)}async function Xl(e,n){let t=(n?.origins||[]).filter(s=>s&&s.enabled!==!1);if(t.length===0)return[];let r=20,o=[];for(let s=0;s<t.length;s+=r){let a=t.slice(s,s+r),i=await Promise.all(a.map(async l=>await Cs(e,n.id,l.id)?l.id:null));for(let l of i)l!==null&&o.push(l)}return o.length>=t.length?(Array.isArray(e.debug.notes)||(e.debug.notes=[]),e.debug.notes.push("all-origins-tripped:ignoring"),[]):o}function Vl(e,n){return n&&typeof n.enabled=="boolean"?{enabled:n.enabled,name:n.name||"X-Forwarded-For"}:e&&typeof e.enabled=="boolean"?{enabled:e.enabled,name:e.name||"X-Forwarded-For"}:{enabled:!1,name:"X-Forwarded-For"}}async function Ns(e,n,t){let r=new URL(n.url),o={method:n.method,headers:n.headers,redirect:"follow"},s=String(n.method||"GET").toUpperCase();if(s!=="GET"&&s!=="HEAD")try{o.body=n.clone().body}catch{}return e&&e.debug&&(e.debug.eoEdgeFetch=r.host),fetch(r.toString(),o)}var Yl=Object.freeze({enabled:!1,edgeTtl:0,browserTtl:0,ignoreQuery:!1,queryWhitelist:[]});async function Ql(e,n){if(n.poolId){let t=await ce(e,n.poolId);return t&&Array.isArray(t.origins)&&t.origins.length>0?t:null}return Array.isArray(n.origins)&&n.origins.length>0?{id:`__legacy_${n.host}`,kind:n.origins.length===1?"single":"pool",strategy:n.originStrategy||"chain",origins:n.origins,failover:n.originFailover||Pe}:null}async function Ms(e){try{let n=await H(e);if(n&&n.globalRateLimit>0){let t=xs(n.globalRateLimit);if(t.limited)return new Response("Too Many Requests",{status:429,headers:{"Retry-After":String(t.retryAfter),"Content-Type":"text/plain"}})}return await Jl(e)}catch(n){return fn(500,"Internal Error",`Pipeline failure: ${n?.message||String(n)}`,e)}}async function Jl(e){let n=await is(e);if(!n){let A;try{A=(await H(e))?.disguise}catch{A=void 0}let J=await Jn(e,A);return un(e,{status:J.status,cacheHit:"BYPASS"}),J}let t=await ks(e,n);if(t)return un(e,{status:t.status,cacheHit:"BYPASS",blocked:!0}),t;let r=await Ql(e,n);if(!r)return fn(500,"Config Error",`Site "${n.host}" has no usable origin (poolId="${n.poolId||""}")`,e);let o=dn(r,e,[]);if(!o)return fn(502,"No Origin",`No enabled origin in site "${n.host}"`,e);e.origin=o;let s=er(n,e),a="site";if(!s)try{let A=await ke(e);Array.isArray(A)&&A.length>0&&(s=er({rules:A},e),s&&(a="global"))}catch{}let i=Zl(e,s);if(i)return un(e,{status:i.status,cacheHit:"BYPASS"}),i;let l=Yn(s?.action?.hostHeader,void 0,n.defaultHostHeader),c=s?.action||{},d=r,p="site-default";if(Array.isArray(c.inlineOrigins)&&c.inlineOrigins.length>0)d={id:`__rule_inline_${n.host}`,strategy:"chain",origins:c.inlineOrigins,failover:r.failover||Pe},p="rule-inline";else{let A=c.poolId;if(A&&(d=await ce(e,A),p=`pool:${A}`,!d||!Array.isArray(d.origins)||d.origins.length===0))return fn(502,"Config Error",`Origin "${A}" is empty or missing`,e)}if(p!=="site-default"){let A=dn(d,e,[]);if(!A)return fn(502,"No Origin",`No enabled origin in ${p}`,e);e.origin=A,o=A}let u=o?.cache||{},h=s?.action?.cache||{},g={...Yl,...u,...h},b=fs(e,g),y=null;if(!b&&e.caps?.hasEdgeCache){let A=Xn(o.rewrite,s?.action?.rewrite),J=Vn(e,o,{action:{rewrite:A}},l);y=us(e,g,J,{cacheGen:n.cacheGen||0})}if(y){let A=await _o(e,y);if(A){e.debug.cache="HIT";let J=d?.origins?.find(ot=>ot.id===e.debug.originId)||o,hn=cn(J.respHeaders,s?.action?.respHeaders),rt=nr(e,A,g,hn);return un(e,{status:A.status,cacheHit:"HIT"}),new Response(A.body,{status:A.status,statusText:A.statusText,headers:rt})}e.debug.cache="MISS"}else e.debug.cache=g.enabled&&!e.caps?.hasEdgeCache?"EDGE_HEADER":"BYPASS";let x=e.caps?.eoEdgeCache&&!l&&y&&$s(e,y,new Response(null,{status:200}),g),P;x?(e.debug.cachePath="A_EO_EDGE",P=await Ns(e,e.request,g)):P=await Ds(e,d,s,l);let _=null,F=y&&$s(e,y,P,g);F&&(_=P.clone());let q=d?.origins?.find(A=>A.id===e.debug.originId)||o,U=q?.cache||{};h.enabled===void 0&&U.enabled!==void 0&&(g.enabled=U.enabled),!h.edgeTtl&&U.edgeTtl&&(g.edgeTtl=U.edgeTtl),!h.browserTtl&&U.browserTtl&&(g.browserTtl=U.browserTtl);let S=cn(q.respHeaders,s?.action?.respHeaders),he=nr(e,P,g,S),tt=new Response(P.body,{status:P.status,statusText:P.statusText,headers:he});if(F&&_){let A=new Response(_.body,{status:_.status,statusText:_.statusText,headers:new Headers(he)});e.waitUntil(Io(e,y,A).catch(()=>{}))}return un(e,{status:P.status,cacheHit:e.debug.cache==="HIT"?"HIT":e.debug.cache==="MISS"?"MISS":void 0,originId:e.debug.originId}),tt}function Zl(e,n){let t=n?.action;if(!t)return null;if(t.forceHttps&&e.url.protocol==="http:"){let r=new URL(e.url.href);return r.protocol="https:",new Response(null,{status:t.forceHttpsStatus||301,headers:{Location:r.toString(),"Cache-Control":"no-store",Server:z,Via:`1.1 ${z}`}})}if(t.directResponse?.enabled){let r=t.directResponse;return new Response(r.body||"",{status:r.status||200,headers:{"Content-Type":r.contentType||"text/plain; charset=utf-8","Cache-Control":"no-store",Server:z,Via:`1.1 ${z}`}})}if(t.redirect?.enabled&&t.redirect.target){let r=ec(e,n,t.redirect);if(r)return new Response(null,{status:t.redirect.status||302,headers:{Location:r,"Cache-Control":"no-store",Server:z,Via:`1.1 ${z}`}})}return null}function ec(e,n,t){let r=String(t.target||""),o=n?.match?.pathRegex;if(o&&/\$[1-9]/.test(r))try{let a=new RegExp(o).exec(e.url.pathname);a&&(r=r.replace(/\$([1-9])/g,(i,l)=>a[Number(l)]??""))}catch{}let s;try{s=new URL(r,e.url.href)}catch{return""}if(t.keepQuery)for(let[a,i]of e.url.searchParams)s.searchParams.has(a)||s.searchParams.append(a,i);return s.toString()}function $s(e,n,t,r){try{return Lo(n,t,r)===!0}catch{return!1}}function un(e,n){try{Wt(e,{host:e.url.hostname,path:e.url.pathname,method:e.request.method,duration:Date.now()-e.startTime,...n})}catch{}}function fn(e,n,t,r){let o=new Headers({"Content-Type":"text/plain; charset=utf-8","Cache-Control":"no-store"});return r?.debug&&(r.debug.siteId&&o.set("X-Site-Id",r.debug.siteId),r.debug.ruleId&&o.set("X-Rule-Id",r.debug.ruleId),Array.isArray(r.debug.tried)&&r.debug.tried.length&&o.set("X-Tried-Origins",r.debug.tried.join(","))),r?.startTime&&o.set("X-Edge-Time",`${Date.now()-r.startTime}ms`),o.set("Server",z),o.set("Via",`1.1 ${z}`),new Response(`${n}

${t}
`,{status:e,headers:o})}async function Fs(e){let{url:n}=e,t=n.pathname;if(t==="/__health")return new Response(JSON.stringify({ok:!0,platform:e.caps.platform,caps:e.caps,time:new Date().toISOString()}),{headers:{"content-type":"application/json; charset=utf-8"}});let r;try{r=await H(e)}catch(i){console.error("[app] getGlobal failed:",i?.message),r=null}let o=nc(r?.adminPath)||"__panel",s=`/${o}`;if(t===s||t.startsWith(s+"/")){let i=t.slice(s.length);if(i==="/api"||i.startsWith("/api/")){let l=i.slice(4)||"/";return os(e,l,r)}if(i===""||i==="/"||i==="/index.html"||i.startsWith("/assets/")){if(e.request.method!=="GET"&&e.request.method!=="HEAD")return new Response("Method Not Allowed",{status:405});let l=await as(e,e.request,o);return l||Zt(e,o)}return Jn(e,r?.disguise)}let a=await Ms(e);try{e.waitUntil(Xt(e))}catch{}return a}function nc(e){return!e||typeof e!="string"?"":e.trim().replace(/^\/+/,"").replace(/\/+$/,"")}se();lt();ee();var qs="cfg:global",tc="site:_index",rc="pool:_index",oc=e=>`site:${e}`,sc=e=>`pool:${e}`,Us=!1;async function Gs(e){if(Us)return{normalized:0,scanned:0,message:"already done in this isolate"};Us=!0;let n=O(e);if(!n)return console.warn("[normalize] startup skipped: no KV binding"),{normalized:0,scanned:0,message:"no KV"};let t=0,r=0,o=Date.now();try{await ac(n);let s=await n.get(qs,"json");if(s&&typeof s=="object"){r++;let p=ye(s);if(p.ok&&Ks(s,p.value))try{await n.put(qs,JSON.stringify(p.value)),t++,console.log("[normalize] global config updated")}catch(u){console.error("[normalize] global config write failed:",u?.message)}}let a=await n.get(tc,"json"),i=a&&Array.isArray(a.hosts)?a.hosts.filter(p=>typeof p=="string"):[];i.length>0&&(t+=await zs(n,i,oc,xe,"site"),r+=i.length);let l=await n.get(rc,"json"),c=l&&Array.isArray(l.ids)?l.ids.filter(p=>typeof p=="string"):[];c.length>0&&(t+=await zs(n,c,sc,V,"pool"),r+=c.length);let d=Date.now()-o;return console.log(`[normalize] startup done: scanned=${r} updated=${t} elapsed=${d}ms`),{normalized:t,scanned:r,message:"ok"}}catch(s){return console.error("[normalize] startup failed:",s?.message),{normalized:t,scanned:r,message:`error: ${s?.message||"unknown"}`}}}var Bs="__keycodec_migrated__";async function ac(e){let n={migrated:0,skipped:0,failed:0};if(!e.raw||typeof e.raw.list!="function")return n;try{if(await e.get(Bs,"text"))return n}catch{}try{let t,r=0;do{let o=await e.raw.list(t?{cursor:t}:{}),s=Array.isArray(o.keys)?o.keys:[];for(let a of s){let i=a&&a.name;if(typeof i!="string"||i==="")continue;if(pr(i)){n.skipped++;continue}let l;try{l=me(i)}catch(c){console.error(`[keycodec] 键 "${i}" 编码失败，跳过:`,c?.message),n.failed++;continue}try{let c=await e.raw.get(i);if(c===null){await e.raw.delete(i),n.skipped++;continue}await e.raw.get(l)===null&&await e.put(i,c),await e.raw.delete(i),n.migrated++}catch(c){console.error(`[keycodec] 键 "${i}" 迁移失败:`,c?.message),n.failed++}}t=o.list_complete?void 0:o.cursor,r++}while(t&&r<100);if(n.failed===0)try{await e.put(Bs,String(Date.now()))}catch{}(n.migrated>0||n.failed>0)&&console.log(`[keycodec] 键名迁移完成: migrated=${n.migrated} skipped=${n.skipped} failed=${n.failed}`)}catch(t){console.error("[keycodec] 键名迁移异常终止:",t?.message)}return n}async function zs(e,n,t,r,o){let a=0;for(let i=0;i<n.length;i+=10){let l=n.slice(i,i+10),c=await Promise.all(l.map(async d=>{try{let p=await e.get(t(d),"json");return{id:d,raw:p}}catch{return{id:d,raw:null}}}));for(let{id:d,raw:p}of c){if(!p||typeof p!="object")continue;let u=r(p);if(!(!u||!u.ok||!u.value)&&Ks(p,u.value))try{await e.put(t(d),JSON.stringify(u.value)),a++,console.log(`[normalize] ${o} "${d}" updated`)}catch(h){console.error(`[normalize] ${o} "${d}" write failed:`,h?.message)}}}return a}function Ks(e,n){return nt(e)!==nt(n)}function nt(e){return e===null||typeof e!="object"?JSON.stringify(e):Array.isArray(e)?"["+e.map(nt).join(",")+"]":"{"+Object.keys(e).filter(r=>r!=="version").sort().map(r=>JSON.stringify(r)+":"+nt(e[r])).join(",")+"}"}async function eu(e){let n=e?.env||{},t=typeof e?.waitUntil=="function"?e.waitUntil.bind(e):null;return js(e.request,n,t)}var nu={async fetch(e,n={},t=null){let r=t&&typeof t.waitUntil=="function"?t.waitUntil.bind(t):null;return js(e,n||{},r)}};async function js(e,n,t){let r=[],o=t||(c=>{r.push(Promise.resolve(c).catch(()=>{}))}),s;try{s=new URL(e.url)}catch{return new Response("Bad Request",{status:400})}let a=Fr(e),i=Ge(n);try{await gr(n,i)}catch(c){console.error("[entry] preloadKV 失败，配置存储降级为无持久化:",c?.message)}try{o(Gs(n))}catch{}let l={request:e,url:s,env:n,caps:i,waitUntil:o,startTime:Date.now(),reqId:a,debug:{}};try{let c=await Fs(l);return ic(c,a)}catch(c){let d=In(c);return console.error(`[entry] unhandled error reqId=${a} code=${d.code} msg=${Ve(d.message)}`,d.cause instanceof Error?d.cause.stack:void 0),new Response(`Internal Server Error (request id: ${a})`,{status:500,headers:{"content-type":"text/plain; charset=utf-8",[Se]:a}})}}function ic(e,n){if(!e||!n)return e;try{return e.headers.has(Se)||e.headers.set(Se,n),e}catch{try{let t=new Headers(e.headers);t.set(Se,n);let r=e.status===204||e.status===304;return new Response(r?null:e.body,{status:e.status,statusText:e.statusText,headers:t})}catch{return e}}}export{nu as default,eu as onRequest};
