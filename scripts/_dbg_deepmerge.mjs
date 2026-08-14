import { DEFAULT_GLOBAL_RULES } from '../src/config/defaults.js';

function deepMerge(target, src) {
  for (const k of Object.keys(src)) {
    if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k]) && target[k] && typeof target[k] === 'object') {
      deepMerge(target[k], src[k]);
    } else {
      target[k] = Array.isArray(src[k]) ? src[k].slice() : (src[k] && typeof src[k] === 'object' ? structuredClone(src[k]) : src[k]);
    }
  }
  return target;
}

const gs = structuredClone(DEFAULT_GLOBAL_RULES);
console.error('BEFORE keys=', JSON.stringify(Object.keys(gs.security)));
deepMerge(gs, { security: { ipBlacklist: ['1.2.3.4'] } });
console.error('AFTER ipBL=', JSON.stringify(gs.security.ipBlacklist), 'keys=', JSON.stringify(Object.keys(gs.security)));
const gs2 = structuredClone(DEFAULT_GLOBAL_RULES);
deepMerge(gs2, { security: { uaBlocklist: ['BlockUA'] } });
console.error('AFTER uaBL=', JSON.stringify(gs2.security.uaBlacklist));
