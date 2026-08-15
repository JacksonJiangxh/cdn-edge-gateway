// poolKind / originSummary / buildPoolOptions / refsCell / renderPools / openRefsDrawer / openPoolDrawer / removePool

import { $, el } from '../../dom.js';
import { API, APP_DATA, refreshData } from '../state.js';
import { section } from '../rule-editor/card.js';
import { actions, field, select, table } from '../util.js';
import { closeDrawer, confirmDialog, openDrawer, toast } from '../ui.js';
import { openSiteDrawer } from './sites.js';
import { route } from '../router.js';
import { buildRepoPresetRules, REPO_ENGINE_LABEL } from '../lib/repoPreset.js';
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
      { value: 'chain', label: '链式回退 ·均衡（坏源站排除后剩余源站全部参与，order 派生权重）' },
      { value: 'roundrobin', label: '平滑加权轮询（配 weight 生效，未配则轮流）' },
      { value: 'random', label: '随机（配 weight 按权重随机，未配等概率）' },
      { value: 'weighted', label: '平滑加权（严格按权重比例平滑分配）' },
      { value: 'iphash', label: 'IP 一致性哈希（增删源站最小迁移；命中坏源站环内回退）' },
    ]);
    strategySel.className = 'input';
    // 收集各源站的「权重」字段，调度策略变化时统一显隐。
    // 加权类策略（chain 用 order 派生权重、roundrobin/weighted 用 weight）都需要权重列。
    const weightFields = [];
    const syncWeight = () => {
      const on = ['weighted', 'roundrobin', 'chain'].includes(strategySel.value);
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
        { value: 'cnb', label: 'cnb（CNB 仓库 raw，自动生成的规则）' },
        { value: 'github', label: 'github（GitHub 仓库 raw，自动生成的规则）' },
      ]);
      engineSel.value = o.engine || 'fetch';
      engineSel.className = 'input o-engine';
      // 不同引擎：地址格式 + 提示不同（先选引擎，再据此切换地址占位与可见字段）
      const ENGINE_ADDR = {
        fetch: { ph: '域名 / IP（可带端口），如 storage.example.net 或 1.2.3.4:8080', hint: '你的真实服务器地址（fetch 为标准 HTTP 回源）。' },
        socket: { ph: '真实目标主机（域名/IP，可带端口），如 origin.internal:9000', hint: 'TCP 透传（已弃用）。' },
        r2: { ph: 'R2 桶名，如 my-bucket（地址栏隐藏，改用下方 R2 字段）', hint: '回源到 R2 桶（仅 CF）；地址由下方 R2 绑定决定。' },
        cnb: { ph: '仓库地址，如 https://cnb.cool/owner/repo', hint: 'CNB 仓库型引擎：地址栏隐藏，改用下方仓库字段。' },
        github: { ph: '仓库地址，如 https://github.com/owner/repo', hint: 'GitHub 仓库型引擎：地址栏隐藏，改用下方仓库字段。' },
      };
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
      // ---- cnb / github 仓库型引擎专用字段 ----
      const repoUserIn = el('input', { class: 'input o-repo-user', value: o.repoUser || '', placeholder: '组织 / owner' });
      const repoNameIn = el('input', { class: 'input o-repo-name', value: o.repoName || '', placeholder: '仓库名（不含 .git）' });
      const repoBranchIn = el('input', { class: 'input o-repo-branch', value: o.repoBranch || 'main', placeholder: '分支，默认 main' });
      const repoPrivateIn = el('input', { class: 'input o-repo-private', type: 'checkbox', checked: !!o.repoPrivate });
      const repoTokenIn = el('input', { class: 'input o-repo-token', type: 'password', value: o._tokenPlain || '', placeholder: '访问令牌（公开仓库可留空）' });
      const repoFields = el('div', { class: 'o-repo-fields' }, [
        field('仓库归属（repoUser）', repoUserIn, 'cnb=组织/用户；github=owner。'),
        field('仓库名（repoName）', repoNameIn, '不含 .git 后缀、不含组织前缀。'),
        field('分支（repoBranch）', repoBranchIn, '映射到 raw URL 的 ref 段，默认 main。'),
        field('是否私有仓库（repoPrivate）', repoPrivateIn, '勾选=私有（注入 Authorization 鉴权）；不勾=公开（匿名回源，可不填 token）。'),
        field('访问令牌（token）', repoTokenIn, '加密后落盘（每站独立）。公开仓库可留空；编辑时留空表示不改。'),
      ]);
      // 回源连接参数（协议/端口/引擎/Host）属于整池物理默认；⑨ Origin Rules
      // 可针对请求条件覆盖这些参数，故仅作「默认」保留、不再与⑨重复成独立编辑点。
      const overrideHint = el('div', { class: 'hint', text: '回源连接参数（协议 / 端口 / 引擎 / Host）作为本源站整池默认；如需按请求条件差异化，请在⑨「Origin Rules」里设置对应规则，规则级设置会覆盖此处默认值。' });
      const addrInput = el('input', { class: 'input o-addr', value: o.addr || '', placeholder: ENGINE_ADDR[o.engine || 'fetch'].ph });
      const addrField = field('源站地址', addrInput, '格式随「引擎类型」变化，见上方提示。');
      const portField = field('端口', el('input', { class: 'input o-port', type: 'number', value: o.port || 443 }), 'https 默认 443，http 默认 80。可被⑨规则覆盖。');
      const schemeField = field('协议', select('', [''], o.scheme || 'https', [{ value: 'https', label: 'https' }, { value: 'http', label: 'http' }], 'o-scheme'), '可被⑨规则覆盖。');
      const hostField = field('回源 Host（该源站专用）', el('input', { class: 'input o-host', value: o.hostHeader?.custom || '', placeholder: '如 api1.internal（留空=用规则/站点级 Host）' }), '仅这台源站回源时使用的 Host 头（整池默认）。同组多源站各自 Host 不同时填这里；⑨规则再设 Host 会覆盖它。');
      // fetch 引擎无法手写 Host 头（平台强制 Host = 回源 URL hostname），
      // 该字段只有 socket 引擎能真正生效，故仅 socket 时显示。
      const hostNote = el('div', { class: 'hint', text: 'fetch 引擎下该 Host 由回源地址决定、无法自定义；如需自定义 Host 请把引擎改为 socket。' });
      // 别名（仅展示用，方便在列表里区分）
      const nameField = field('别名（选填）', el('input', { class: 'input o-name', value: o.name || '', placeholder: '如 主站 / 北京备份' }), '给自己看的备注，不写则回显为地址。');
      // 权重仅在「加权」调度策略下生效，其余策略隐藏（syncWeight 在策略下拉建好后统一调用）
      const weightField = field('权重（加权/轮询/链式策略生效）', el('input', { class: 'input o-weight', type: 'number', value: o.weight || 1 }), '默认 1 即可。weighted 严格按权重平滑分配；roundrobin 配了权重即生效；chain 用 order 派生权重、显式填了则优先按此权重。');
      weightFields.push(weightField);
      const syncEngine = () => {
        const eng = engineSel.value;
        const isR2 = eng === 'r2';
        const isRepo = eng === 'cnb' || eng === 'github';
        // 地址格式随引擎切换
        addrInput.placeholder = (ENGINE_ADDR[eng] || ENGINE_ADDR.fetch).ph;
        addrField.querySelector('.field-hint').textContent = (ENGINE_ADDR[eng] || ENGINE_ADDR.fetch).hint;
        r2Fields.style.display = isR2 ? '' : 'none';
        repoFields.style.display = isRepo ? '' : 'none';
        addrField.style.display = (isR2 || isRepo) ? 'none' : '';
        portField.style.display = (isR2 || isRepo) ? 'none' : '';
        schemeField.style.display = (isR2 || isRepo) ? 'none' : '';
        hostField.style.display = eng === 'socket' ? '' : 'none';
        hostNote.style.display = eng === 'fetch' ? '' : 'none';
      };
      engineSel.onchange = syncEngine;
      // —— 整行可折叠（仿流量序列规则卡）：头部先选引擎，再填地址，点头部折叠/展开 ——
      const head = el('div', { class: 'section-toggle origin-row-head' }, [
        el('span', { class: 'origin-grip', text: '⠿', title: '拖拽调整优先级（上=优先）' }),
        field('引擎类型', engineSel, '先选引擎，下方地址格式与字段随之变化：① fetch=标准 HTTP 回源；② socket=已弃用；③ r2=回源到 R2 桶（仅 CF）；④ cnb/github=仓库型引擎（自动生成重写+请求头规则）。可被⑨规则覆盖。'),
        addrField,
        nameField,
      ]);
      const body = el('div', { class: 'section-body' }, [
        portField,
        schemeField,
        hostField,
        hostNote,
        r2Fields,
        repoFields,
        weightField,
        overrideHint,
      ]);
      const removeBtn = el('button', { class: 'btn btn-sm btn-danger', text: '移除源站', onclick: (e) => { e.stopPropagation(); row.remove(); } });
      head.appendChild(removeBtn);
      const row = el('div', { class: 'subcard origin-card' }, [ head, body ]);
      // 默认折叠，让多源站列表更紧凑；点头部切换（输入控件上的点击不触发展开/折叠）
      row.classList.add('collapsed');
      head.onclick = (e) => { if (e.target.closest('input,select,button')) return; row.classList.toggle('collapsed'); };
      // 回显时根据已有 engine 显隐 R2 字段 + 地址提示
      syncEngine();
      originList.appendChild(row);
    };
    (pool.origins || []).forEach(addOrigin);
    if (!pool.origins || !pool.origins.length) addOrigin();
    syncWeight();

    const strategyField = field('调度策略', strategySel, '多个源站之间怎么分配请求。新手直接用「链式回退」最省心。');

    // ---- 回源重试 / 故障转移参数（跟随全站默认，留空即不覆盖）----
    // 默认全部留空：新建/编辑源站池时不写死一份默认值（避免又造一个真相源）。
    const fb = pool.failover || {};
    const penaltyIn = el('input', { class: 'input o-penalty', type: 'number', min: '0', max: '600', value: fb.penaltySeconds ?? '', placeholder: '默认 15（0=关闭）' });
    const totalTimeoutIn = el('input', { class: 'input o-total-timeout', type: 'number', min: '0', max: '120000', value: fb.totalTimeoutMs ?? '', placeholder: '默认 0=按平台上限自动推导' });
    const speculativeIn = el('input', { class: 'input o-speculative', type: 'number', min: '0', max: '60000', value: fb.speculativeMs ?? '', placeholder: '默认 500（0=关闭）' });
    const failoverCard = section('回源重试 / 故障转移', '失败即冷却 · 总时间预算 · 竞速（留空=跟随全站默认）', [
      field('失败即冷却（秒）', penaltyIn, '一次回源失败立即把该源站放入冷却名单 ~15s（仅本边缘内存生效，不跨边缘即时同步）。配合「60s 内累计 3 次熔断」并存互补，避免反复打同一个刚失败的源站。0=关闭。'),
      field('总时间预算（毫秒）', totalTimeoutIn, '整请求回源最长时间硬顶；超过后不再尝试新源站，触发「全员失败兜底」。默认 0=按平台执行上限自动推导（EO/ESA 120s、CF 30s 减安全余量），避免 (换源次数+1)×超时 无预算叠加撞平台墙钟。'),
      field('竞速阈值（毫秒）', speculativeIn, '首个源站超过该时间未返回首字节，立即并行打第二个候选源站，谁先成功用谁（仅 GET/HEAD 及已物化 body 的请求启用，双写安全）。默认 500；0=关闭竞速。'),
    ]);
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
      failoverCard,
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
      // 系统主键，编辑时才有；新建为空 → 后端自动生成
      const pid = pool.id || '';
      const origins = [];
      Array.from(originList.children).forEach((row, i) => {
        const engine = $('.o-engine', row).value;
        const addr = $('.o-addr', row).value.trim();
        const isRepo = engine === 'cnb' || engine === 'github';
        // r2 / 仓库型 引擎无公网地址；其余引擎必须有 addr
        if (engine !== 'r2' && !isRepo && !addr) return;
        // 保留既有源站的回源高级配置（hostHeader/extraHeaders/pathPrefix），
        // 这些由规则引擎托管，前端此处不编辑，但编辑源站池时不应清空
        const legacy = (pool.origins && pool.origins[i]) || {};
        const r2KeyMode = $('.o-r2-keymode', row) ? $('.o-r2-keymode', row).value : 'none';

        // 仓库型引擎：收集仓库参数 + 自动铺「内置预设规则模板」（rewrite + reqHeaders）
        let repoExtra = {};
        if (isRepo) {
          const repoUser = $('.o-repo-user', row).value.trim();
          const repoName = $('.o-repo-name', row).value.trim();
          const repoBranch = $('.o-repo-branch', row).value.trim() || 'main';
          const repoPrivate = !!$('.o-repo-private', row).checked;
          const tokenField = engine === 'cnb' ? 'cnbTokenEnc' : 'githubTokenEnc';
          // 明文输入；留空=不改（保留密文）
          const tokenPlain = $('.o-repo-token', row).value;
          // 编辑时留空：保留 legacy 已有的（加密）token；新建必填校验交给后端
          const tokenVal = tokenPlain ? tokenPlain : (legacy[tokenField] || '');
          const preset = buildRepoPresetRules(engine, { repoUser, repoName, repoBranch, repoPrivate });
          repoExtra = {
            repoUser, repoName, repoBranch, repoPrivate,
            [tokenField]: tokenVal,
            // 引擎关联的预设规则：rewrite + reqHeaders（公开为 null）+ respHeaders（剥离仓库特有头）
            // 一并写入源站级；站点里仍可叠加「网站加速 / api」等其它模板规则。
            rewrite: preset.rewrite,
            reqHeaders: preset.reqHeaders || { match: { type: 'all', conditions: [] }, actions: [{ type: 'setHeaders', set: {}, remove: [] }] },
            respHeaders: preset.respHeaders,
          };
        }

        origins.push({
          id: 'o' + i + '_' + (engine === 'r2'
            ? ($('.o-r2-binding', row).value.trim() || 'r2')
            : isRepo
              ? (engine + '_' + $('.o-repo-name', row).value.trim())
              : addr),
          enabled: true, order: i, weight: Number($('.o-weight', row).value) || 1,
          engine,
          scheme: $('.o-scheme', row) ? $('.o-scheme', row).value : 'https',
          addr: (engine === 'r2' || isRepo) ? '' : addr,
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
          ...repoExtra,
          // 纯两层架构（站点级 + 源站级基础地址/引擎）：源站级不再承载专属回源规则
          // （路径重写/缓存/请求头/响应头/超时/跟随3xx 一律由「路由规则」按条件绑定，
          // 旧数据若残留这些字段将由后端 failover 原样保留、但不在此编辑）。
        });
      });
      if (!origins.length) throw new Error(isSingle ? '请填写源站地址' : '至少需要一个源站');
      if (isSingle && origins.length > 1) throw new Error('单一源站只能有 1 个地址；需要多个请新建「源站池」');

      // 组装池级 failover：仅当用户填了任意一项时下发，否则留空让后端回落全站默认
      // （不产生双份真相源）。与既有 pool.failover 合并，保留旧 key。
      const fo = { ...(pool.failover || {}) };
      let foDirty = false;
      const numOrUndef = (v) => {
        const n = Number(v);
        return v === '' || v == null || Number.isNaN(n) ? undefined : n;
      };
      const pen = numOrUndef(penaltyIn.value);
      const tot = numOrUndef(totalTimeoutIn.value);
      const spec = numOrUndef(speculativeIn.value);
      if (pen !== undefined) { fo.penaltySeconds = pen; foDirty = true; }
      if (tot !== undefined) { fo.totalTimeoutMs = tot; foDirty = true; }
      if (spec !== undefined) { fo.speculativeMs = spec; foDirty = true; }

      const payload = {
        name: $('p-name').value.trim(),
        kind,
        strategy: isSingle ? 'chain' : strategySel.value,
        origins,
        // 池级未单独配置时不下发 failover，由后端回落到「源站」阶段的全站默认，
        // 保证「改一处全站生效」，不产生双份真相源。
        ...(foDirty ? { failover: fo } : (pool.failover ? { failover: pool.failover } : {})),
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
