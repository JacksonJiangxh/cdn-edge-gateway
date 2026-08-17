// renderTrafficSequence / seqGroup / seqStage / seqRuleInPack

import { $, clear, el } from '../../dom.js';
import { section } from '../rule-editor/card.js';
import { API, APP_DATA, globalStages } from '../state.js';
import { poolName, ruleStage, select } from '../util.js';
import { openInitialOriginDrawer, openRulesDrawer, openSecurityDrawer, openSiteDrawer } from './sites.js';
import { openCacheGenDrawer, openGlobalOnlyStageDrawer, openGlobalRulesDrawer } from '../rule-editor/global.js';
import { GLOBAL_ONLY_STAGE_OPS, STAGE_OPS } from '../../_stage.gen.js';
import { openPoolDrawer, originSummary, poolKind } from './pools.js';
import { toast } from '../ui.js';
import { globalStageToAction } from '../rule-editor/shared.js';
export   async function renderTrafficSequence() {
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

    // 预取全站通用（兜底）规则：新阶段→默认动作映射（每阶段 1 条、无条件）。
    // 用于各阶段「站点未设置→回落全站兜底」的标注与跳转。写入 IIFE 顶层的
    // globalStages（与全站规则编辑器共享），预留失败兜底为 {}。
    try {
      const gr = await API.rules.global().catch(() => null);
      const next = (gr && gr.stages) || {};
      for (const k of Object.keys(globalStages)) delete globalStages[k];
      Object.assign(globalStages, next);
    } catch { for (const k of Object.keys(globalStages)) delete globalStages[k]; }

    // 汇总一条规则的动作子阶段（用于序列展示）
    function ruleSubs(r) {
      const a = r.action || {};
      const subs = [];
      const rw = a.rewrite || {};
      if (rw.type && rw.type !== 'none') subs.push(`URL重写(${rw.type})`);
      if (a.forceHttps) subs.push('强制HTTPS');
      if (a.redirect && a.redirect.enabled) subs.push(`重定向(${a.redirect.status || 302})`);
      if (a.directResponse && a.directResponse.enabled) subs.push(`自定义响应(${a.directResponse.status || 200})`);
      if (a.poolId) subs.push(`源站→${poolName(a.poolId)}`);
      if (a.hostHeader && a.hostHeader.mode && a.hostHeader.mode !== 'accel' && a.hostHeader.mode !== 'inherit') subs.push(`回源Host(${a.hostHeader.mode})`);
      if (a.clientIpHeader && a.clientIpHeader.enabled) subs.push(`客户端IP→${a.clientIpHeader.name || 'X-EdgeGateway-Client-IP'}`);
      if (a.followRedirect) subs.push('回源跟随3xx');
      if (a.originTimeoutMs) subs.push(`回源超时${a.originTimeoutMs}ms`);
      if (a.engine) subs.push(`引擎(${a.engine})`);
      if (a.scheme) subs.push(`协议(${a.scheme})`);
      if (Number(a.port) > 0) subs.push(`端口(${a.port})`);
      const cp = a.cache || {};
      if (cp && cp.mode === 'noCache') subs.push('不缓存');
      else if (cp && cp.enabled) subs.push('缓存');
      const rh = a.reqHeaders || {};
      if (rh.set && Object.keys(rh.set).length || (rh.strip || []).length) subs.push('改请求头');
      const rph = a.respHeaders || {};
      if (rph.set && Object.keys(rph.set).length || (rph.strip || []).length) subs.push('改响应头');
      return subs;
    }

    // 渲染单个站点的完整序列（draggable=true 时规则可拖拽）
    // 严格按「①→⑱」18 个阶段顺序；阶段间相互独立（AND），阶段内规则集是 OR（按「顺序」从上到下匹配，顺序 1 最先，命中即跳出本阶段）。
    // 某阶段站点无规则时，回落全站通用规则（globalStages 阶段映射）作为实际生效，卡片显示「回落全站兜底」。
    function renderSite(site, draggable) {
      const rules = (site.rules || [])
        .slice()
        .sort((a, b) => (b.priority || 0) - (a.priority || 0));
      const ruleNodes = [];

      const sec = site.security || {};

      // 统一渲染一个「规则引擎型」阶段：以 rule.stage 为唯一索引聚合本阶段规则；
      // 本站无该阶段规则时，回落全站通用规则（globalStages[no] 阶段映射中同阶段默认动作）。
      function renderRuleStage(no, icon, title, stageSummary, _matchFn, opts) {
        const matched = rules.filter((r) => ruleStage(r) === no);
        const hasSite = matched.length > 0;
        const hasGlobal = !hasSite && !!globalStages[no];
        const badge = hasSite ? `${matched.length} 条` : (hasGlobal ? '回落全站兜底' : '未配置');
        const summary = hasSite
          ? `${matched.length} 条规则（按优先级从上到下匹配，命中即跳出本阶段）；${stageSummary}`
          : (hasGlobal
            ? `本站无设置 → 实际生效为「全站兜底默认」该阶段默认动作（点击前往编辑）`
            : `本站无设置，且无全站兜底；${stageSummary}`);
        // 修复：只要该阶段属于「规则引擎型」阶段（有 opts），无论本站是否已配置，
        // 都允许点开抽屉——未配置时打开即是一条空白规则待新建，而不是点了没反应。
        // 仅当非规则型阶段（无 opts）且本站无全站兜底时，才无可点入口。
        const onClick = opts
          ? () => openRulesDrawer(site.host, { ...opts, stage: no, isEmpty: !hasSite })
          : (hasGlobal ? () => openGlobalRulesDrawer(no, { ...STAGE_OPS[no], stage: no }) : null);
        const owner = opts ? opts.owner : (hasGlobal ? '全站通用规则（兜底，点击前往）' : null);
        flow.appendChild(seqStage(icon, `${no} ${title}`, summary, badge, 'sec-rules', onClick, owner));
        if (hasSite && matched.length) {
          flow.appendChild(el('div', { class: 'seq-rule-list' }, matched.map((r) => {
            const condCount = (r.match && r.match.conditions || []).reduce((n, g) => n + g.length, 0);
            // 全局下标：用于拖拽定位（保存时按全站 priority 重排）
            const idx = rules.indexOf(r);
            // 阶段内相对序号：展示用（每个阶段只消费自己阶段的规则集）
            const stageIdx = matched.indexOf(r);
            const node = seqRuleInPack(r, ruleSubs(r), condCount, site.host, draggable, ruleStage(r), stageIdx + 1);
            if (draggable && idx >= 0) ruleNodes.push({ node, index: idx });
            return node;
          })));
        }
      }

      // ── ① 匹配站点 ─────────────────────────────────────────────
      flow.appendChild(seqGroup('①', '匹配站点', '按 Host 命中站点配置，决定后续整条管线走哪套设置'));
      flow.appendChild(seqStage('🛰️', '① 匹配站点 matchSite',
        `${site.host} · ${site.enabled === false ? '已停用' : '启用'} · IPv6 ${site.ipv6Support ? '已开启' : '未开启'}`,
        site.enabled === false ? '已停用' : '启用', 'sec-basic',
        () => openSiteDrawer(site.host, 'sec-basic'), '站点基础抽屉'));

      // ── ② 安全校验：5 个最小任务包，各自独立成片段 ───────────────
      flow.appendChild(seqGroup('②', '安全校验 checkSecurity', 'fail-closed：自身异常也按 403 拦截，绝不放行。以下 5 包全部通过才继续 ③'));

      const ipCnt = (sec.ipBlacklist || []).length + (sec.ipWhitelist || []).length;
      flow.appendChild(seqStage('🚧', '②.1 IP 访问规则',
        ipCnt ? `黑名单 ${(sec.ipBlacklist || []).length} 条 · 白名单 ${(sec.ipWhitelist || []).length} 条` : '未配置 IP 访问控制',
        ipCnt ? '已配置' : '未配置', 'sec-ip',
        () => openSecurityDrawer(site.host, 'sec-ip'), '安全防护抽屉 · IP 访问控制'));

      const wafItems = [];
      if (sec.refererMode && sec.refererMode !== 'off') wafItems.push(`防盗链 ${sec.refererMode === 'whitelist' ? '白名单' : '黑名单'} ${(sec.refererList || []).length} 条`);
      if ((sec.uaBlacklist || []).length) wafItems.push(`UA 黑名单 ${(sec.uaBlacklist || []).length} 条`);
      flow.appendChild(seqStage('🛡️', '②.2 WAF · 自定义规则（UA / Referer）',
        wafItems.length ? wafItems.join(' · ') : '未配置 UA / Referer 校验',
        wafItems.length ? '已配置' : '未配置', 'sec-waf',
        () => openSecurityDrawer(site.host, 'sec-waf'), '安全防护抽屉 · UA黑名单 / 防盗链'));

      const bm = sec.botManagement || {};
      flow.appendChild(seqStage('🤖', '②.3 自动程序（Bot 管理）',
        bm.enabled
          ? `已启用 · ${bm.mode === 'allowlist' ? '白名单仅放行' : '黑名单拦截'} ${(bm.list || []).length} 条特征`
          : '未启用 Bot 管理（独立字段 botManagement）',
        bm.enabled ? '已启用' : '未配置', 'sec-bot',
        () => openSecurityDrawer(site.host, 'sec-bot'), '安全防护抽屉 · 自动程序（独立最小任务包）'));

      const su = sec.signedUrl || {};
      flow.appendChild(seqStage('🔑', '②.4 Access · 令牌鉴权（签名 URL）⚠️实验特性',
        su.enabled ? `已启用 · 参数 ${su.param || 'sign'}${su.ttl ? ' · 有效期 ' + su.ttl + 's' : ''}` : '未启用签名 URL',
        su.enabled ? '已启用' : '未配置', 'sec-token',
        () => openSecurityDrawer(site.host, 'sec-token'), '安全防护抽屉 · 签名 URL（内置签发工具待开发）'));

      const rl = sec.rateLimit || {};
      flow.appendChild(seqStage('⏱️', '②.5 速率限制',
        rl.enabled ? `已启用 · ${rl.rpm || 0} 次/分钟` : '未启用请求限速',
        rl.enabled ? '已启用' : '未配置', 'sec-ratelimit',
        () => openSecurityDrawer(site.host, 'sec-ratelimit'), '安全防护抽屉 · 请求限速'));

      // ── ③ 首要分流：由负载均衡实际选出一个具体临时回源对象 ───────
      flow.appendChild(seqGroup('③', '首要分流：选出「本次回源对象」（真实推导的具体临时对象）', '不是虚拟占位：单源站 = 该源站本身；源站池 = 按负载均衡策略（chain 严格串行 / weighted 平滑加权轮询 / iphash 一致性哈希）实际选出的某一个 oX。这个具体对象即后续 ⑤~⑱ 规则的「回源目标」匹配维度（target=origin / originAddr），可在一条线上用它做多分支。'));
      const defPool = APP_DATA.pools.find((p) => p.id === site.poolId);
      const defKind = defPool ? poolKind(defPool) : '';
      const originId = defPool && defKind === 'single'
        ? (defPool.origins && defPool.origins[0] && defPool.origins[0].id)
        : (defPool ? '按策略选出的 oX' : '');
      flow.appendChild(seqStage('🎯', '③ 本次回源对象（推导·只读）',
        site.poolId
          ? (defPool
            ? (defKind === 'single'
              ? `单一源站：${defPool.name || defPool.id} · ${originSummary(defPool)}（回源目标 id=${defPool.origins && defPool.origins[0] && defPool.origins[0].id}）`
              : `源站池：${defPool.name || defPool.id} · 策略 ${defPool.strategy || 'chain'} · ${(defPool.origins || []).length} 个源站（每次按策略选出一个 oX 作为回源目标）`)
            : `源站已被删除或不可用：${site.poolId}`)
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
      flow.appendChild(seqGroup('⑤-⑪', '规则驱动阶段（每个阶段 = 一个独立规则引擎）', '流量依次经过这些阶段，每个阶段内部按「顺序」从上到下匹配（顺序 1 最先匹配，数字越大越靠后），命中即跳出本阶段进入下游；站点无设置则回落全站通用规则。顺序靠拖拽调整。多分支用「回源目标」条件表达：在规则匹配里加 target=origin/originAddr（③ 选出的具体源站），如「路径=/img/ 且 回源目标=oX → 动作」，⑦~⑱ 全部共用一条线，⑩⑭ 是真实只读的实际生效结果。'));

      // 以下各阶段全部以 STAGE_OPS 字典为唯一真相源驱动渲染与抽屉归属
      renderRuleStage('rewrite', '✂️', 'URL 重写', '按规则改写客户端请求路径（不含源站 pathPrefix）', null, STAGE_OPS['rewrite']);
      renderRuleStage('redirect', '↪️', '重定向规则', '把请求重定向到其它 URL（命中即终止回源）', null, STAGE_OPS['redirect']);
      renderRuleStage('terminate', '🔒', '强制 HTTPS / 直接响应（终止型）', '命中 http 返回 301/307 跳 https，或直接用自定义 body/status 响应，不再回源', null, STAGE_OPS['terminate']);
      renderRuleStage('reqHeaders', '📤', '修改请求头', '在回源请求发出去之前增 / 删 / 改 HTTP 头', null, STAGE_OPS['reqHeaders']);
      renderRuleStage('origin', '🔀', 'Origin Rules', '更改回源目标：回源 Host、回源连接参数（引擎/协议/端口）或候选源站', null, STAGE_OPS['origin']);

      // ── ⑩ 确定实际源站（运行时推导，纯只读）──────────────────
      // 池覆盖本质属于 ⑨ Origin Rules 阶段（action.poolId），统一以 ruleStage 索引，
      // 不再从 action 现场反推，与流量序列其它阶段一致。
      const ovrPool = rules.find((r) => ruleStage(r) === 'origin' && r.action && r.action.poolId);
      const globalOv = !ovrPool && globalStages['origin'] && globalStages['origin'].poolId;
      flow.appendChild(seqGroup('⑩', '确定实际源站', '沿用 ③ 首要分流结果，或被 origin 阶段命中的规则覆盖（运行时推导，无独立配置项）'));
      flow.appendChild(seqStage('🧭', '⑩ 实际源站',
        ovrPool
          ? `存在站点规则覆盖 → ${poolName(ovrPool.action.poolId)}（命中该规则时生效）`
          : (globalOv
            ? `站点无覆盖 → 回落全站兜底 → ${poolName(globalOv)}`
            : `无规则覆盖 → 沿用 ③ 的 ${site.poolId ? poolName(site.poolId) : '未配置'}`),
        '推导', null, null, null));

      renderRuleStage('cache', '📥', 'Cache Rules（缓存请求设置）', '缓存策略（edgeTtl / SWR / browserTtl / 绕过缓存）等请求级缓存设置', null, STAGE_OPS['cache']);

      // ── ⑫ 缓存键（可干预：站点缓存版本）──────────────────────
      flow.appendChild(seqGroup('⑫', '缓存键', '合并 policy = 默认 < 源站级 cache < cache 阶段(Cache Rules)；本环节可干预项：站点缓存版本（清空后旧版本自动失效）。'));
      const cacheRules = rules.filter((r) => ruleStage(r) === 'cache');
      const hasCache = cacheRules.some((r) => r.action.cache.enabled);
      flow.appendChild(seqStage('🔖', '⑫ 合并缓存策略 & 构造缓存键',
        `⑪ 缓存动作 ${cacheRules.length} 条 · 站点缓存版本 v${site.cacheGen || 0}${hasCache ? '（已启用节点缓存）' : ''}`,
        '推导', null, () => openCacheGenDrawer(site.host, cacheRules.length, hasCache), '缓存键抽屉（仅调整清空缓存）'));

      // ── ⑬ 查边缘缓存（运行时，纯只读）──────────────────────────
      flow.appendChild(seqGroup('⑬', '查缓存', '命中则直接返回（X-Cache: HIT），未命中继续 ⑭ 真正回源。运行时行为。'));
      flow.appendChild(seqStage('⚡', '⑬ 查边缘缓存 cacheMatch',
        '命中则直接返回（响应头 X-Cache: HIT），未命中继续 ⑭ 真正回源。运行时行为，无配置项。',
        '运行时', null, null, null));

      // ── ⑭ 回源循环（此时才真正发出回源请求；可干预：源站/池）────
      const effPoolId = (ovrPool && ovrPool.action.poolId) || (globalOv && globalOv.action.poolId) || site.poolId;
      const pool = APP_DATA.pools.find((p) => p.id === effPoolId);
      const fo = (pool && pool.failover) || null;
      // 回源连接参数（clientIp/超时/跟随3xx、engine/scheme/port）均属 ⑨ Origin Rules 阶段，
      // 统一以 ruleStage 索引，不再从 action 现场反推。
      const connRule = rules.find((r) => ruleStage(r) === 'origin');
      const gConnRule = !connRule && globalStages['origin'] && (globalStages['origin'].clientIpHeader || globalStages['origin'].followRedirect || globalStages['origin'].originTimeoutMs || globalStages['origin'].engine || globalStages['origin'].scheme || globalStages['origin'].port);
      // 单源站 fo 恒为 null（运行时强制关闭回退）；池未填 fo 时后端按源站数归一（重试=源站数-1）。
      const retryText = (p) => {
        if (!fo) return '无回退（单源站）';
        const n = fo.maxRetries != null ? fo.maxRetries : Math.max((p.origins || []).length - 1, 0);
        return `重试 ${n} 次`;
      };
      flow.appendChild(seqGroup('⑭', '回源循环 requestWithFailover（真正发出回源请求）', '逐个源站尝试；rewrite/origin/reqHeaders 各阶段规则在此对每个源站落地；回源连接参数受规则 clientIp / 超时 / 跟随3xx 影响。可干预：源站地址、策略、故障转移。'));
      flow.appendChild(seqStage('🗄️', '⑭ 源站与故障转移',
        pool
          ? (poolKind(pool) === 'single'
            ? `单一源站 ${pool.name || pool.id} · ${originSummary(pool)} · ${retryText(pool)}${connRule || gConnRule ? '（受规则回源参数影响）' : ''}`
            : `源站池 ${pool.name || pool.id} · 策略 ${pool.strategy || 'chain'} · ${(pool.origins || []).length} 个源站 · ${retryText(pool)}${connRule || gConnRule ? '（受规则回源参数影响）' : ''}`)
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
      flow.appendChild(seqGroup('respHeaders', '改写响应头（含 response cache rule）', '回源响应返回用户前的所有响应头改写，以及 CF 风格 response cache rule（响应级缓存控制）。'));
      renderRuleStage('respHeaders', '📝', '改写响应头 / Response Cache Rule', '增 / 删 / 改响应头，以及响应级缓存控制（response cache rule）', null, STAGE_OPS['respHeaders']);

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

    // 拖拽排序：松手后按新顺序重算每条规则的 priority（顺序 1 = 最前）并保存
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
            // 顺序号 = (总数 - 当前下标)，即拖到最顶的规则 priority 最大、最先匹配；
            // 展示层统一呈现为「顺序 1 最前、数字越大越靠后」。
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
            el('span', { class: 'seq-chip', text: `${(site.rules || []).length} 条规则` }),
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

    // 全站通用（兜底）规则视图：新阶段→默认动作映射（每阶段 1 条、无条件、无优先级）。
    // 它展示「每个阶段默认如何消费」，站点某阶段无设置时即实际生效这些默认动作。
    function renderGlobal() {
      // 全站通用规则视图：同样按 18 阶段展示，每阶段展示该阶段的默认动作（单条）。
      // 全站规则是兜底默认，无更上级兜底；点击阶段进入全局规则编辑器（编辑该阶段默认 action）。
      function gStage(no, icon, title, stageSummary, _matchFn) {
        // 兜底默认动作：取已落盘的全站阶段值（后端保证 KV 空时落盘内置默认，故一般不空）。
        const value = globalStages[no] || {};
        const isBuiltin = !globalStages[no];
        const subs = ruleSubs({ action: globalStageToAction(no, value) });
        const summary = subs.length
          ? `默认动作：${subs.join('、')}；${stageSummary}`
          : `默认空操作（不干预）；${stageSummary}`;
        flow.appendChild(seqStage(icon, `${no} ${title}`, summary, isBuiltin ? '内置默认' : '已配置', 'sec-rules',
          () => openGlobalRulesDrawer(no, { ...STAGE_OPS[no], stage: no }), '全站通用规则编辑器'));
        if (subs.length) {
          flow.appendChild(el('div', { class: 'seq-rule-list' }, [
            seqRuleInPack(
              { id: '__global_' + no, name: isBuiltin ? '内置默认（可改）' : '全站兜底默认', action: globalStageToAction(no, value) },
              subs, 0, '__global__', false, no, 1,
            ),
          ]));
        }
      }

      // 全站独有阶段（匹配站点 / 安全校验 / 错误处理）：一组全站基线参数，
      // 不是规则动作，故用参数表单抽屉编辑。
      // 这些参数以前藏在后端隐藏配置里（前端只显示「未配置 / 暂不支持」，
      // 而后端其实一直按内置值生效），现在一并搬到这里，可视可改。
      function gParamStage(key, no, summary) {
        const meta = GLOBAL_ONLY_STAGE_OPS[key];
        if (!meta) return;
        const value = (globalStages && globalStages[key]) || {};
        const isBuiltin = !(globalStages && globalStages[key]);
        // 摘要里直接把关键参数值摊开，避免「必须点进抽屉才知道当前生效值」
        const parts = (meta.fields || []).slice(0, 3).map((f) => {
          const v = f.path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), value);
          return v === undefined || v === '' ? null : `${f.label} ${v}`;
        }).filter(Boolean);
        const text = parts.length ? `当前：${parts.join('；')}。${summary}` : summary;
        flow.appendChild(seqStage(meta.icon, `${no} ${meta.title.replace('（全站默认）', '')}`, text,
          isBuiltin ? '内置默认' : '已配置', 'sec-rules',
          () => openGlobalOnlyStageDrawer(key), '全站通用规则编辑器'));
      }

      flow.appendChild(seqGroup('全站', '全站通用规则（兜底默认）', '新阶段→默认动作映射，每个阶段恰好 1 条、无条件、无优先级。以下规则对任何站点都生效，仅当站点自身规则未命中（该阶段字段缺失）时才触发，相当于全局默认设置。点击阶段即可编辑该阶段的默认动作。'));

      gParamStage('match', '①', '请求 URL 没带协议时按此协议补全，然后再去匹配站点。');

      flow.appendChild(seqGroup('②-④', '安全 / 首要分流（全站维度）', '全站安全基线与错误响应在此配置；具体的防盗链、IP 名单等仍在各站点自身设置。'));
      gParamStage('security', '②.1~②.5', '全站默认限速与计数参数；站点自己设了限速就以站点为准。');
      gParamStage('error', '②.6', '被拦截时返回什么内容，以及各类 5xx 错误的文案（可直接粘贴自定义错误页 HTML）。');
      flow.appendChild(seqStage('🎯', '③ 初始回源对象', '全站通用规则不选择初始源站，源站由各站点自身决定。', '未配置', null, null, null));
      flow.appendChild(seqStage('🔧', '④ URL 规范化', '全站通用规则暂不支持 URL 规范化。', '暂不支持', null, null, null));

      flow.appendChild(seqGroup('⑤-⑪', '规则驱动阶段（全站兜底）', '各阶段全站兜底规则；站点序列某阶段无设置时，即实际生效这些规则。'));
      gStage('rewrite', '✂️', 'URL 重写', '按规则改写客户端请求路径', null);
      gStage('redirect', '↪️', '重定向规则', '把请求重定向到其它 URL', null);
      gStage('terminate', '🔒', '强制 HTTPS / 直接响应', '命中 http 跳 https，或直接响应', null);
      gStage('reqHeaders', '📤', '修改请求头', '回源前增删改 HTTP 头', null);
      gStage('origin', '🔀', 'Origin Rules', '改回源 Host / 回源连接参数 / 候选源站', null);
      gStage('cache', '📥', 'Cache Rules（缓存规则）', '缓存策略等请求级缓存设置', null);
      gStage('respHeaders', '📝', '改写响应头 / Response Cache Rule', '响应头改写与响应级缓存控制', null);

      flow.appendChild(seqGroup('⑫-⑱', '缓存 / 回源 / 响应（运行时）', '全站兜底规则在此被应用；以下为运行时推导行为。'));
      flow.appendChild(seqStage('🔖', '⑫ 缓存键', '合并 policy 时，全站规则的缓存动作作为最低优先级兜底。', '推导', null, null, null));
      flow.appendChild(seqStage('⚡', '⑬ 查缓存', '运行时行为。', '运行时', null, null, null));
      flow.appendChild(seqStage('🗄️', '⑭ 回源循环', '受全站规则的回源连接参数影响。', '运行时', null, null, null));
      flow.appendChild(seqStage('🧬', '⑮ clone', '运行时行为。', '运行时', null, null, null));
      flow.appendChild(seqStage('💾', '⑰ 写缓存', '按 ⑪ 全站缓存策略写入。', '运行时', null, null, null));
      flow.appendChild(seqStage('👤', '⑱ 返回用户', '固定行为。', '固定', null, null, null));

      const btn = el('button', { class: 'btn', text: '编辑全站通用规则（⑪ 缓存）' });
      btn.onclick = () => openGlobalRulesDrawer('cache', { ...STAGE_OPS['cache'], stage: 'cache' });
      flow.appendChild(el('div', { class: 'seq-tools' }, [btn]));
    }

    hostSel.addEventListener('change', () => render(hostSel.value));
    render(initHost);
    return wrap;
  }
export   function seqGroup(no, title, desc) {
    return el('div', { class: 'seq-group' }, [
      el('span', { class: 'seq-group-no', text: no }),
      el('div', { class: 'seq-group-main' }, [
        el('div', { class: 'seq-group-title', text: title }),
        desc ? el('div', { class: 'seq-group-desc', text: desc }) : null,
      ]),
    ]);
  }
export   function seqStage(icon, title, summary, badge, anchor, onClick, owner) {
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
export   function seqRuleInPack(rule, subs, condCount, host, draggable, stageNo, orderNo) {
    const a = rule.action || {};
    const head = el('div', { class: 'seq-rule-head' }, [
      draggable ? el('span', { class: 'seq-grip', title: '拖拽调整顺序', text: '⠿' }) : null,
      el('span', { class: 'seq-rule-prio', text: '顺序 ' + (orderNo != null ? orderNo : '?') }),
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
        el('div', { class: 'seq-summary', text: `匹配条件：${condCount} 项${condCount ? '（命中即执行下列动作）' : '（匹配全部请求）'}` }),
        sub,
      ]),
      el('div', { class: 'seq-go', text: '编辑规则 →' }),
    ]);
    if (draggable) node.draggable = true;
    // 方案 B：彻底移除「完整编辑器」。单条规则的「编辑规则 →」直接进它所属阶段的
    // 受限抽屉（按 rule.stage 定位），与阶段卡片入口完全一致，绝不越界到其它阶段。
    const rStage = stageNo || ruleStage(rule);
    const rOpts = rStage && STAGE_OPS[rStage] ? { ...STAGE_OPS[rStage], stage: rStage } : null;
    node.onclick = () => rOpts ? openRulesDrawer(host, rOpts) : toast('该规则无有效阶段索引', 'err');
    return node;
  }

  // ---------------------------------------------------------------------------
  // 通用子组件
  // ---------------------------------------------------------------------------

  // 键值对头部编辑器（set）+ 删除列表（strip：精确/前缀/正则）
  // 返回 { root, read() }，read() 返回 { set:{}, strip:[] }
