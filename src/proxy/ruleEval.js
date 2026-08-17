/**
 * 按源站求值阶段规则（共享纯函数）
 * ----------------------------------------------------------------------------
 * 本模块把「7 个规则型阶段的全站兜底 + 站点覆盖」这套合并逻辑抽成可复用函数。
 *
 * 为什么必须抽出来？
 * ---------------------------------------------------------------------------
 * 站点规则可以用 `origin` / `originAddr` 作为匹配条件（「按源站分流」），
 * 典型场景是仓库型源站池：
 *   - CNB   源站的 raw 路径是  /<owner>/<repo>/-/git/raw/<branch>/<path>
 *   - GitHub 源站的 raw 路径是 /<owner>/<repo>/<branch>/<path>
 * 两者重写目标完全不同。于是「求值规则时假定的源站」必须与「实际拨号的源站」
 * 严格一致，否则就会把 A 源站的路径 / 鉴权头打到 B 源站的域名上 → 必然 404。
 *
 * 过去管线只在请求级求值一次并冻结结果，而故障转移 / 竞速会重新选源，
 * 导致上述错配。现在管线与故障转移共用本函数：故障转移的每次尝试
 * （含竞速的每条通道）都以「本次实际使用的 origin」重新求值一遍。
 *
 * 本函数是纯内存操作（对象合并 + 规则条件求值），无 KV / 网络 I/O，
 * 因此按尝试重复调用的成本相对一次跨网回源可忽略。
 */

import { matchRuleByStage } from './matcher.js';
import { mergeStageHeaderOps } from './rewrite.js';
import { deepClone } from '../config/defaults.js';
import { STAGE_ORDER } from '../config/stages.js';

/**
 * 以「指定源站」为匹配维度，求值站点在 7 个规则型阶段上的最终生效动作。
 *
 * 合并模型（与 docs/12-request-flow.md ④.2 一致，逐阶段独立、先全站后站点）：
 *   ① 先取全站兜底 ctx.__globalStages[stage] 注入 eff（全站先出手）；
 *   ② 再 matchRuleByStage 在该阶段的站点规则集里按 priority 取命中的一条规则；
 *   ③ 站点命中则用其「同阶段字段」覆盖 eff 的对应字段（站点优先于全站），
 *      未命中则全站结果原样保留进入下一阶段。
 *
 * 注意：本函数会把 ctx.origin 设为传入的 origin（作为 matcher 的 origin /
 * originAddr 匹配维度），并在返回前保持为该 origin —— 调用方应当把它视为
 * 「本次尝试实际使用的源站」，从而让下游调试头与统计保持真实。
 *
 * @param {import('../contracts.js').Ctx} ctx 请求上下文（需已设置 ctx.__globalStages）
 * @param {Object} site 命中的站点配置
 * @param {Object} origin 本次求值所依据的源站对象（写入 ctx.origin 作为匹配维度）
 * @returns {Object} effAction：阶段名 → 该阶段整段配置
 *   （rewrite / redirect / terminate / reqHeaders / origin / cache / respHeaders）
 */
export function evalStagesForOrigin(ctx, site, origin) {
  // 规则匹配维度：matcher 的 buildMatchSubject 会读 ctx.origin 得到 origin / originAddr。
  // 这里显式改写，确保「求值依据的源站」就是调用方本次要拨号的源站。
  if (origin !== undefined) ctx.origin = origin;

  const globalStages = ctx.__globalStages || {};
  const effAction = {};
  ctx.debug.ruleSource = ctx.debug.ruleSource || {};

  for (const stage of STAGE_ORDER) {
    const sr = matchRuleByStage(site, stage, ctx);
    // 性能：仅在「站点规则命中、需要就地覆盖」时才 deepClone 全站快照；
    // 未命中的阶段直接复用全站对象的引用（下游 mergeRewrite / mergeHeaderOps /
    // buildOriginHeaders 均只读并返回新对象，不会原地改写 effAction）。
    // 这样多次尝试（故障转移 / 竞速）下不会产生无谓的深拷贝开销。
    if (sr && sr.action) {
      const eff = deepClone(globalStages[stage] || {});
      // sr.action 的 key 即阶段名（如 'reqHeaders' / 'terminate'），其值是「该阶段的扁平对象」。
      // 而 eff 已经是「全站同阶段扁平对象」（deepClone(globalStages[stage])）。
      // 因此每个阶段都是把 eff（全站）与站点同阶段对象合并——这才是「全站默认 + 站点覆盖」的语义。
      // 注意：绝不能写成 eff[k] = sr.action[k]——eff 本身已是该阶段对象，k 是它的「阶段名包装」，
      // 嵌套赋值会把站点值错误地塞进 eff.terminate，而 eff 顶层全站字段（如 forceHttps）反而没被覆盖。
      for (const k of Object.keys(sr.action)) {
        const siteStageObj = sr.action[k];
        if (!siteStageObj || typeof siteStageObj !== 'object') continue;
        if (stage === 'reqHeaders' || stage === 'respHeaders') {
          // HeaderOps 段：整段并集（set 站点覆盖全站同名 key、全站其余保留；
          // 站点 strip 中的 exact 项在合并期即从 set 剔除全站被点名 key）
          const merged = mergeStageHeaderOps(eff, siteStageObj);
          eff.set = merged.set;
          eff.strip = merged.strip;
          if (siteStageObj.forwardWhitelist !== undefined) eff.forwardWhitelist = siteStageObj.forwardWhitelist;
        } else {
          // 标量段（rewrite/redirect/terminate/origin/cache 等）：整段逐字段覆盖（含子对象整段覆盖），
          // 未设字段沿用全站 eff 中的值。
          for (const fk of Object.keys(siteStageObj)) {
            eff[fk] = deepClone(siteStageObj[fk]);
          }
        }
      }
      ctx.debug.ruleSource[stage] = 'site';
      effAction[stage] = eff;
    } else {
      // 该阶段站点规则集未命中 → 全站结果保留进入下一阶段。
      ctx.debug.ruleSource[stage] = 'global';
      effAction[stage] = globalStages[stage] || {};
    }
    // 每个阶段的结果都以「整段」形式挂到 effAction[stage]，与 STAGE_ORDER 一一对应：
    //   effAction.rewrite / redirect / terminate / reqHeaders / origin / cache / respHeaders
    // 这样下游（buildClientHeaders 读 effAction.cache、mergeRewrite 读 effAction.rewrite、
    // applyTerminalActions 读 effAction.terminate / effAction.redirect 等）按统一「阶段名 → 整段」路径取值，
    // 不会出现「标量段被展开到 effAction 顶层、而消费代码又整段读取」的错位。
    // 注：HeaderOps 段（reqHeaders/respHeaders）同样是整段 {set, strip} 存放，与此一致。
  }

  return effAction;
}

/**
 * 求值并包装成 pipeline 使用的 rule 结构。
 *
 * `_source` 的判定沿用历史语义：matchRuleByStage 命中站点规则时会写入
 * ctx.debug.ruleId（首次锁定），据此判断本次规则整体来源于站点还是全站兜底。
 *
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {Object} site 命中的站点配置
 * @param {Object} origin 本次求值所依据的源站
 * @returns {{action: Object, _source: string}} rule 结构
 */
export function buildRuleForOrigin(ctx, site, origin) {
  const action = evalStagesForOrigin(ctx, site, origin);
  return { action, _source: ctx.debug.ruleId ? 'site' : 'global' };
}
