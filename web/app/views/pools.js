// poolKind / originSummary / buildPoolOptions / refsCell / renderPools / openRefsDrawer / openPoolDrawer / removePool

import { $, el } from '../../dom.js';
import { API, APP_DATA } from '../state.js';
import { section } from '../rule-editor/card.js';
import { actions, field, select, table } from '../util.js';
import { closeDrawer, confirmDialog, openDrawer, toast } from '../ui.js';
import { openSiteDrawer } from './sites.js';
import { route } from '../router.js';
export   function poolKind(p) {
    if (p && (p.kind === 'single' || p.kind === 'pool')) return p.kind;
    return ((p && p.origins) || []).length === 1 ? 'single' : 'pool';
  }

  /** 源站地址摘要，供列表「地址」列展示。 */
export   function originSummary(p) {
    const list = p.origins || [];
    if (!list.length) return '—';
    const fmt = (o) => (o.engine === 'r2'
      ? `r2:${o.r2Binding || '?'}`
      : `${o.scheme || 'https'}://${o.addr || '?'}${o.port && o.port !== 443 && o.port !== 80 ? ':' + o.port : ''}`);
    return list.length === 1 ? fmt(list[0]) : `${fmt(list[0])} 等 ${list.length} 个`;
  }

  /** 统一的源站下拉选项：单一源站在前、源站池在后，标签带类型前缀与地址摘要。 */
export   function buildPoolOptions() {
    return [...APP_DATA.pools]
      .sort((a, b) => (poolKind(a) === poolKind(b) ? 0 : (poolKind(a) === 'single' ? -1 : 1)))
      .map((p) => ({
        value: p.id,
        label: `${poolKind(p) === 'single' ? '［单一］' : '［池］'} ${p.name || p.id} — ${originSummary(p)}`,
      }));
  }

  /** 引用徽标：0 引用给出「可安全删除」提示，>0 时可点击查看是谁在用。 */
export   function refsCell(p) {
    const refs = p.refs || [];
    if (!refs.length) {
      return el('span', { class: 'hint', text: '未被引用' });
    }
    const btn = el('button', {
      class: 'btn btn-sm',
      text: `${refs.length} 处引用`,
      onclick: () => openRefsDrawer(p),
    });
    return btn;
  }
export 
  async function renderPools() {
    const wrap = el('div', { class: 'section' });
    wrap.appendChild(el('div', { class: 'section-head' }, [
      el('h3', {}, '源站'),
      el('button', { class: 'btn btn-primary', text: '+ 新建源站池', onclick: () => openPoolDrawer(null, 'pool') }),
    ]));
    wrap.appendChild(el('div', { class: 'hint' },
      '这里纵览全部上游。「单一源站」= 一个地址，在新建/编辑站点时直接填写源站地址会自动创建并出现在这里；'
      + '「源站池」= 多个源站 + 负载均衡策略，只能用右上角按钮新建。两者引用方式一致，站点与规则都按同一个下拉选择。'));

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
export   function openRefsDrawer(p) {
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
        `「${p.name || p.id}」当前被 ${refs.length} 处引用。存在引用时无法删除；请先把这些引用改指到别的源站。`),
      rows.length
        ? table(['来源', '对象', '说明', '操作'], rows)
        : el('p', { class: 'empty' }, '暂无引用。'),
    ]);
    openDrawer('引用详情: ' + (p.name || p.id), '', body, null);
  }
export 
  async function openPoolDrawer(id, forceKind) {
    let pool;
    if (id) {
      try { pool = await API.pools.get(id); } catch (e) { toast(e.message, 'err'); return; }
    } else {
      // 新建源站池的回源重试参数「跟随全站默认」：不在此写死一份，
      // 而是留空交给后端回落到「源站」阶段的全站默认（stages.origin.failover）。
      // 前端硬编码一份默认值就等于又造了一个真相源——全站默认改了、新建的池却还是老值。
      pool = { id: '', name: '', kind: forceKind || 'pool', strategy: 'chain', origins: [], failover: null };
    }
    // 类型一经创建不可随意切换：single→pool 允许（加源站即升级），pool→single 会丢数据故禁止
    const kind = forceKind || poolKind(pool);
    const isSingle = kind === 'single';
    // socket 引擎已弃用，恒为 disabled；hasRawIpFetch 仅作语义占位（CF 上裸 IP+SNI 由 fetchEngine 自动兜底）
    const socketDisabled = !(APP_DATA.info && APP_DATA.info.caps && APP_DATA.info.caps.hasRawIpFetch);

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
        { value: 'fetch', label: 'fetch（支持自定义 Host）' },
        { value: 'socket', label: 'socket（已弃用）', disabled: true },
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
      // 回源连接参数（协议/端口/引擎/Host）属于整池物理默认；⑨ Origin Rules
      // 可针对请求条件覆盖这些参数，故仅作「默认」保留、不再与⑨重复成独立编辑点。
      const overrideHint = el('div', { class: 'hint', text: '回源连接参数（协议 / 端口 / 引擎 / Host）作为本源站整池默认；如需按请求条件差异化，请在⑨「Origin Rules」里设置对应规则，规则级设置会覆盖此处默认值。' });
      const addrField = field('源站地址（域名 / IP）', el('input', { class: 'input o-addr', value: o.addr || '', placeholder: 'storage.example.net' }), '你的真实服务器地址。');
      const portField = field('端口', el('input', { class: 'input o-port', type: 'number', value: o.port || 443 }), 'https 默认 443，http 默认 80。可被⑨规则覆盖。');
      const schemeField = field('协议', select('', [''], o.scheme || 'https', [{ value: 'https', label: 'https' }, { value: 'http', label: 'http' }], 'o-scheme'), '可被⑨规则覆盖。');
      const hostField = field('回源 Host（该源站专用）', el('input', { class: 'input o-host', value: o.hostHeader?.custom || '', placeholder: '如 api1.internal（留空=用规则/站点级 Host）' }), '仅这台源站回源时使用的 Host 头（整池默认）。同组多源站各自 Host 不同时填这里；⑨规则再设 Host 会覆盖它。');
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
        hostField,
        hostNote,
        field('引擎', engineSel, '回源方式（整池默认）：① fetch=标准回源，支持自定义 Host 头（CF/EO/ESA 均可用，Host 由「回源域名/地址」或规则级 hostHeader 决定）；② socket=已弃用（自定义 Host 现由 fetch 原生支持，CF 上裸 IP+HTTPS+自定义 SNI 由 fetchEngine 内部自动走 socket 兜底）；③ r2=回源到 R2 桶（仅 CF，需先在 wrangler.toml 绑定）。可被⑨规则覆盖。'),
        r2Fields,
        weightField,
        overrideHint,
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
      ? el('div', { class: 'hint' }, `当前被 ${pool.refs.length} 处引用：${pool.refs.map((r) => r.label).filter((v, i, a) => a.indexOf(v) === i).join('、')}。修改地址会立刻影响这些站点。`)
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
    openDrawer(id ? `编辑${kindLabel}: ` + (pool.name || id) : `新建${kindLabel}`, '', body, async () => {
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
          pathPrefix: legacy.pathPrefix || '',
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
        // 池级未单独配置时不下发 failover，由后端回落到「源站」阶段的全站默认，
        // 保证「改一处全站生效」，不产生双份真相源。
        ...(pool.failover ? { failover: pool.failover } : {}),
        ...(pool.createdBy ? { createdBy: pool.createdBy } : {}),
      };
      // 编辑（有 id）走 PUT；新建（无 id）走 POST，机器 id 由后端生成
      await API.pools.save(pid || null, payload);
      await refreshData();
    });
  }
export 
  async function removePool(id, pool) {
    const p = pool || APP_DATA.pools.find((x) => x.id === id) || {};
    const kindName = poolKind(p) === 'single' ? '单一源站' : '源站池';
    const refs = p.refs || [];
    if (refs.length) {
      const who = [...new Set(refs.map((r) => r.label))].join('、');
      toast(`该${kindName}仍被 ${refs.length} 处引用（${who}），请先改指其它源站再删除`, 'err');
      return;
    }
    const ok = await confirmDialog(
      `删除${kindName}`,
      `确定删除「${p.name || id}」？此操作不可恢复。`
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
