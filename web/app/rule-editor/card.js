// section / opSection / buildRuleCard / _OP_BUILDERS

import { $, el } from '../../dom.js';
import { field, select, selectWithGroups, varHintBar } from '../util.js';
import { conditionsEditor, normalizeMatchForEditor } from './conditions.js';
import { cacheEditor, headerEditor, rewriteEditor } from './ops.js';
import { stringListEditor } from './status.js';
import { STAGE_OPS } from '../../_stage.gen.js';
export   function section(title, desc, children) {
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
export   function opSection(key, title, desc, opts, children) {
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
  let _OP_BUILDERS = null;
export 
  function buildRuleCard(rule, poolOptions, site, opts) {
    opts = opts || {};
    // allowedOps：受限模式下，只允许添加/编辑这些操作（一个最小任务包一个抽屉，禁止越界）。
    // 为 null 表示「完整规则编辑器」（通用抽屉，含全部规则阶段 ⑤~⑯），不做限制。
    const allowed = opts.allowedOps ? new Set(opts.allowedOps) : null;
    const hideTargetPool = !!opts.hideTargetPool;
    // globalScope：本卡片编辑的是「全站通用规则」的阶段默认动作，而非某站点的一条规则。
    // 为 true 时，缓存/请求头等编辑器会额外显示「全站专属」子字段
    // （不缓存的状态码名单、伪装页缓存时长、回源请求头透传白名单、剥离规则）。
    // 这些字段无法按 URL 条件差异化，只在全站默认层面成立——单轨化前它们藏在后端
    // settings 段里，前端完全不可见，用户既看不到也改不了。
    const globalScope = opts.globalScope === true;
    // 新建规则的 action 默认「不缓存」（enabled:false）——此前误默认 enabled:true，
    // 导致在 ⑯「改写响应头」等受限抽屉新建的纯头操作规则，保存后也带着 enabled:true
    // 而被 ⑪「Cache Rules」误判命中、越界出现在缓存阶段。仅在用户确实配置了缓存时才挂缓存。
    rule = rule || { id: '', priority: 0, enabled: true, match: { conditions: [] }, action: { poolId: '', rewrite: { type: 'none' }, cache: { enabled: false }, reqHeaders: { set: {}, strip: [] }, respHeaders: { set: {}, strip: [] } } };
    const en = el('input', { type: 'checkbox', checked: rule.enabled !== false });
    // 规则名与备注：纯展示用，不影响匹配。模板生成的规则预填了它们，
    // 手动加的规则也建议写上，否则几个月后没人记得这条规则是干嘛的。
    const rName = el('input', { class: 'input', value: rule.name || '', placeholder: '如：静态资源长缓存（选填）' });
    const rNote = el('input', { class: 'input', value: rule.note || '', placeholder: '这条规则为什么这么配（选填）' });
    // 注意：不暴露「顺序/权重」输入框。规则顺序完全由流量序列里的拖拽决定
    // （wireRuleDrag 重算 priority 并落库）；新建规则默认排在本阶段顺序最后
    // （priority 取原值或 0 = 最靠后）。
    // 目标源站：下拉选择已有源站（单一源站或源站池），也可直接输入其 id；
    // 单一源站与源站池在同一个下拉里，引用方式完全一致（都是 poolId）。
    // （该字段仅属于 ⑨ Origin Rules 的「候选源站」动作，非该包的受限抽屉会隐藏它以避免越界。）
    const poolListId = 'poollist-' + (rule.id || 'new') + '-' + Math.random().toString(36).slice(2, 7);
    const poolSel = el('input', { class: 'input', list: poolListId, value: rule.action.poolId || '', placeholder: '留空=用站点默认源站；或选择本规则专用的源站' });
    const poolDatalist = el('datalist', { id: poolListId }, poolOptions.map((o) => el('option', { value: o.value, label: o.label })));
    // 旧版快捷条件（extIn / pathPrefix / pathRegex / methodIn）仅在「打开规则」时由
    // normalizeMatchForEditor 并入 conditions 用于展示；保存只写 conditions（后端从
    // conditions 解析等价条件），不再保留旧字段。
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
    // 提升为可见性：赋值给外层 _OP_BUILDERS，使末尾测试钩子可访问（见文件底部）
    _OP_BUILDERS = {
      cache(a) {
        // globalScope：编辑「全站通用规则」时额外显示全站专属子字段
        // （不缓存的状态码名单、伪装页缓存时长）——它们无法按 URL 差异化，
        // 只在全站默认层面有意义，故站点规则抽屉里不出现。
        const ed = cacheEditor(a.cache, { globalScope });
        // 与 reqHeaders/respHeaders/rewrite 同理：cacheEditor.read() 返回扁平结构，
        // 必须包成 { cache: {...} } 才能被汇总 read() 的 Object.assign(action, r()) 正确合并
        // （后端 normRule 从 a.cache 读取嵌套字段）。
        return opNode('cache', '缓存配置', 'EO：节点缓存 TTL、缓存模式、自定义 Cache Key', [ed.root], () => ({ cache: ed.read() }));
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
        const targetField = field('目标 URL（支持 $1..$9 引用路径正则捕获组）', target, '可写 ${var} 内置变量，如 https://${host}/new/$1', [varHintBar()]);
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
        const rh = a.reqHeaders || {};
        const ed = headerEditor(rh);
        // 全站专属：透传白名单。
        // 决定「客户端的哪些请求头会被带到源站」，是整站级的隐私/伪装基线，
        // 不能按 URL 差异化，故只在全站通用规则里出现。
        // 注：删除请求头（strip：精确/前缀/正则）已并入 headerEditor 的删除区，
        // 不再单独有「额外剥离」板块——精确删除与额外剥离语义等价，统一在此入口。
        const wlEd = globalScope ? stringListEditor(rh.forwardWhitelist, {
          label: '允许透传到源站的客户端请求头（一行一个）：',
          placeholder: 'accept-language',
          tag: '(透传)',
          hint: '只有列在这里的客户端请求头才会被带到源站，其余（Cookie、Referer、Origin 等）一律丢弃。清空则表示一个都不透传（最严格）。',
        }) : null;
        const extra = globalScope ? [
          el('hr', { class: 'sep' }),
          el('div', { class: 'kv-label' }, '—— 以下为全站默认专属（不随单条规则变化）——'),
          wlEd.root,
        ] : [];
        // 注意：汇总 read() 用 Object.assign(action, r()) 合并各 op，
        // 必须返回嵌套结构 { reqHeaders: {set, strip} }（与其它 op 一致），
        // 不能返回扁平 {set, strip}——否则会被挂到 action 顶层，后端 schema 不识别而丢失。
        return opNode('reqHeaders', '回源请求头', '转发到源站前修改', [ed.root, ...extra], () => {
          const v = ed.read();
          if (globalScope) {
            v.forwardWhitelist = wlEd.read();
          }
          return { reqHeaders: v };
        });
      },
      respHeaders(a) {
        const ed = headerEditor(a.respHeaders);
        return opNode('respHeaders', '节点响应头', '返回给客户端前修改', [ed.root], () => ({ respHeaders: ed.read() }));
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
        const customField = field('自定义值', custom, '支持 ${var} 变量，如 ${host}', [varHintBar()]);
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
        // 与 reqHeaders/respHeaders 同理：汇总 read() 用 Object.assign(action, r()) 合并，
        // 必须返回嵌套结构 { rewrite: {...} }（后端 normRule 从 a.rewrite 读取）。
        // rewriteEditor.read() 本身返回扁平 {type,value,...} 不能直挂 action 顶层。
        return opNode('rewrite', '路径重写', '改写回源 URL 路径', [ed.root], () => ({ rewrite: ed.read() }));
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
      // 仅当规则真正启用了缓存（enabled 或显式 noCache）才视为含「缓存」操作，
      // 避免默认 cache 对象（enabled:false）被当成 active 操作挂载缓存卡片。
      if (a.cache && (a.cache.enabled || a.cache.mode === 'noCache')) s.add('cache');
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
      if (!_OP_BUILDERS[key]) return;
      // 受限模式：不允许挂载白名单之外的操作，杜绝越界
      if (allowed && !allowed.has(key)) return;
      if (mounted.has(key)) {
        const n = document.getElementById('op-' + key);
        if (n) n.classList.remove('collapsed');
        return;
      }
      const built = _OP_BUILDERS[key](rule.action);
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
      ensureExpanded();
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

    // 折叠：已有规则（带 id）默认折叠，只显示规则名；新建规则默认展开便于立即配置。
    // 点 header 切换展开/折叠；「删除」与「启用」等交互元素 stopPropagation，避免误触折叠。
    const isExisting = !!(rule && rule.id);
    const card = el('div', { class: 'rule-card' + (isExisting ? ' collapsed' : ''), id: 'rule-' + (rule.id || 'new') }, [
      el('div', { class: 'rule-head' }, [
        el('span', { class: 'rule-grip', text: '⠿', title: '拖拽调整顺序' }),
        el('span', { class: 'rule-tw', text: '▸' }),
        el('span', { class: 'rule-name-label', text: (rule && rule.name) || (isExisting ? '（未命名规则）' : '新建规则') }),
        el('label', { class: 'check' }, [en, el('span', { text: '启用' })]),
        el('span', { class: 'rule-prio-hint', text: '顺序靠拖拽调整' }),
        el('button', { class: 'btn btn-sm btn-danger', text: '删除', onclick: (e) => { e.stopPropagation(); card.remove(); } }),
      ]),
      // 详情区：折叠时整体隐藏
      el('div', { class: 'rule-detail' }, [
        field('规则名称', rName, '给这条规则起个一眼能看懂的名字，会显示在流量序列里。'),
        field('备注', rNote, '记下这么配的原因，方便日后自己或同事回看。'),
        section('匹配条件（决定哪些请求命中此规则）', '每个条件组内的多条条件为「与」关系，多个条件组之间为「或」关系', [
          conds.root,
        ]),
        // 目标源站 + 按需添加的「操作卡片」：未添加的操作不渲染
        section('操作（命中后执行的操作）', allowed
          ? '本抽屉仅允许配置「' + opts.title + '」所属的最小任务包。该阶段所有可用操作已直接列于下方，无需再点「添加操作」。'
          : '先选「目标源站」，再点「添加操作」加入需要的动作；每个动作是独立卡片，未添加的不显示', [
          // 目标源站属于 ⑨ Origin Rules 的「候选源站」动作，非该包的受限抽屉隐藏，避免越界
          ...(hideTargetPool ? [] : [field('目标源站（这条规则命中后回到哪台后端）', el('div', {}, [poolSel, poolDatalist]),
            '决定「命中条件的请求」回源到哪个源站：留空则回退到站点默认源站；也可从「源站」页已有的单一源站 / 源站池里选一个。简单站一般不用改，留空即可。')]),
          // 受限模式（最小任务包）：不再渲染「添加操作」下拉，进入即内联列出 allowedOps 全部卡片。
          // 不限模式（完整规则编辑器）：保留原下拉，未添加的操作不渲染。
          ...(allowed ? [] : (shownGroups.length ? [el('div', { class: 'op-add' }, [
            el('span', { class: 'op-add-label', text: '添加操作：' }),
            actionAddSel,
          ])] : [el('div', { class: 'hint' }, '本任务包没有可添加的子操作（仅「目标源站」一项）。')])),
          opsList,
        ]),
      ]),
    ]);
    // 点 header 折叠/展开
    card.querySelector('.rule-head').addEventListener('click', () => card.classList.toggle('collapsed'));
    // 「添加操作」后确保卡片处于展开态并滚动可见（否则折叠态下看不到刚加的操作卡）
    const ensureExpanded = () => card.classList.remove('collapsed');

    // 初始挂载：
    // - 受限模式（最小任务包）：进入抽屉即内联列出该阶段 allowedOps 全部卡片，
    //   不依赖 activeOpKeys（例如 cache 默认 enabled:false、forceHttps 默认未勾选
    //   也应直接呈现，让用户无需「点添加」即可看到本阶段所有可用操作）。
    // - 不限模式（完整规则编辑器）：只挂载规则实际启用的操作卡片。
    // 必须放在 ensureExpanded 定义之后执行：mountOp 内部同步调用 ensureExpanded()。
    if (allowed) {
      allowed.forEach((k) => mountOp(k));
    } else {
      activeOpKeys(rule.action).forEach((k) => mountOp(k));
    }

    const read = () => {
      // 受限模式：以原始 action 为基底，只覆盖本包允许编辑的字段，其余字段原样保留（不丢数据、不越界）
      const action = allowed ? JSON.parse(JSON.stringify(rule.action || {})) : {};
      if (!allowed || !hideTargetPool) action.poolId = poolSel.value;
      for (const r of opReaders) Object.assign(action, r());
      // 关键：stage 是全链路唯一阶段索引，且只来自「抽屉入口」，绝不反推。
      // 受限抽屉的 opts.stage 直接来自 STAGE_OPS 字典（下拉框选项受 allowedOps
      // 约束，只能是本阶段那一个动作类型），故落库阶段在「用户选择抽屉」那一刻
      // 就唯一确定了，不需要、也不允许从 action 反推（反推顺序不可控，曾导致
      // 响应头规则被误判进缓存阶段）。方案 B 已彻底移除完整编辑器，此处 opts.stage 必然存在。
      const stage = opts.stage;
      return {
        id: rule.id || ('r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
        // name/note 跟随规则一起回写。不带上就会在每次保存时被抹掉，
        // 模板生成的说明文字也会随之丢失。
        name: rName.value.trim(),
        note: rNote.value.trim(),
        enabled: en.checked,
        // 优先级不暴露输入框，完全由拖拽排序决定（wireRuleDrag 重算后落库）。
        // 新建规则默认 priority 0（排在本阶段顺序最后）；编辑沿用其原 priority。
        priority: rule.priority || 0,
        // 阶段索引字段：流量序列渲染 / 抽屉归属 / 规则集聚合 / 合并落库 全部以它为准
        stage,
        match: {
          conditions: conds.read(),
        },
        action,
      };
    };
    return { card, read };
  }

  // 全站通用规则（兜底）编辑器：规则对所有站点生效，仅当站点自身规则未命中时触发

// 测试钩子用：读取 _OP_BUILDERS 注册的 op 构建器（key: 'header'/'cache'/'rewrite'...）
export function getOp(key) {
  return _OP_BUILDERS ? _OP_BUILDERS[key] : null;
}
