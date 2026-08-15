// renderSites / openSiteDrawer / openInitialOriginDrawer / openSecurityDrawer / openRulesDrawer / removeSite

import { $, clear, el } from '../../dom.js';
import { buildRuleCard, section } from '../rule-editor/card.js';
import { API, APP_DATA, refreshData } from '../state.js';
import { buildPoolOptions, poolKind } from './pools.js';
import { buildRepoPresetRules, REPO_ENGINE_LABEL } from '../lib/repoPreset.js';
import { openCacheDrawer } from './cache.js';
import { actions, field, ruleStage, select, table } from '../util.js';
import { confirmDialog, openDrawer, scrollToAnchor, toast } from '../ui.js';
import { STAGE_OPS } from '../../_stage.gen.js';
import { route } from '../router.js';
export   async function renderSites() {
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
    // 「缓存版本」= 底层 cacheGen。展示成「第 N 版」比「代次 N」易懂得多。
    wrap.appendChild(table(['Host', '状态', '源站', '规则数', '缓存版本', '操作'], rows));
    return wrap;
  }

  // ====== 流量序列（借鉴 Cloudflare Traffic Sequence 的前端方案）======
  /** 根据池 id 取用户可见名称（找不到时回退 id 本体） */
export   async function openSiteDrawer(host, anchor) {
    if (host === '__global__' || host === '__all__') { toast('全站通用规则请使用全站规则编辑器', 'info'); return; }
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
      el('div', { class: 'hint' }, '按 Host 命中站点配置，决定后续整条管线走哪套设置。源站（③ 首要分流 / ⑭ 源站池）、规则（⑤~⑯）、安全（②）各有独立抽屉配置，互不越界。'),
      field('加速域名（Host）', fHost, editing ? '编辑时不能修改，如需更改请在「站点总览」删除重建。' : '你接入加速的域名，例如 example.com。'),
      field('启用', fEnabled),
      field('支持 IPv6 访问', fIpv6),
    ]);

    // ── ② 默认源站（仅新建时出现）────────────────────────────────────
    // 新建站点时必须绑定一个源站；可选「填写域名/IP」（自动创建单一源站）或「选择已有源站」
    let fOriginMode, fPoolSel, fAddr, fPort, fScheme, fEngine, fR2Binding, fHostMode, fHostCustom;
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
        { value: 'fetch', label: 'fetch（标准回源，支持自定义 Host）' },
        { value: 'socket', label: 'socket（已弃用：自定义 Host 现由 fetch 支持，勿用）', disabled: true },
        { value: 'r2', label: 'r2（回源到 R2 桶，仅 CF）', disabled: !(APP_DATA.info && APP_DATA.info.caps && APP_DATA.info.caps.hasR2) },
        { value: 'cnb', label: 'cnb（CNB 仓库 raw，自动生成关联规则）' },
        { value: 'github', label: 'github（GitHub 仓库 raw，自动生成关联规则）' },
      ]);
      fEngine.className = 'input';
      fHostMode = select('f-host-mode', [], 'origin', [
        { value: 'accel', label: '加速域名（当前站点 Host）' },
        { value: 'origin', label: '回源域名（源站地址本身）' },
        { value: 'custom', label: '自定义域名' },
      ]);
      fHostMode.className = 'input';
      fHostCustom = el('input', { class: 'input', id: 'f-host-custom', value: '', placeholder: '如 backend.internal' });

      const addrField = field('源站地址（域名 / IP）', fAddr, '你的真实服务器地址。r2 / cnb / github 引擎不需要此字段。');
      const portField = field('端口', fPort, 'https 默认 443，http 默认 80。');
      const schemeField = field('回源协议', fScheme, '选择 https 则回源时走加密通道。');
      const engineField = field('引擎', fEngine, 'fetch=标准回源（支持自定义 Host）；r2=回源到 R2 桶（仅 CF）；cnb/github=仓库型引擎（填仓库参数即可，自动生成 URL 重写 + 请求头 + 响应头 关联规则）。');
      // R2 引擎必填的绑定名（与 wrangler.toml 的 [[r2_buckets]].binding 一致），仅在引擎选 r2 时显示
      fR2Binding = el('input', { class: 'input', id: 'f-r2-binding', value: '', placeholder: 'CDN_R2（必须与 wrangler.toml 的 R2 绑定名一致）' });
      const r2BindingField = field('R2 绑定名（r2Binding）', fR2Binding, 'wrangler.toml 里 [[r2_buckets]].binding 的值，如 CDN_R2。引擎选 r2 时必填，保存时自动创建「单一源站」。');
      const hostModeField = field('回源 Host', fHostMode, '源站响应请求时看到的 Host 头。选「自定义域名」时需填下方输入框。');
      const hostCustomField = field('回源 Host 自定义值', fHostCustom, '仅用于回源请求的 Host 头，与站点配置的「加速域名」无关。');

      // ---- cnb / github 仓库型引擎专用字段（仅引擎选 cnb/github 时显示）----
      const fRepoUser = el('input', { class: 'input f-repo-user', value: '', placeholder: '组织 / owner' });
      const fRepoName = el('input', { class: 'input f-repo-name', value: '', placeholder: '仓库名（不含 .git）' });
      const fRepoBranch = el('input', { class: 'input f-repo-branch', value: 'main', placeholder: '分支，默认 main' });
      const fRepoPrivate = el('input', { class: 'input f-repo-private', type: 'checkbox', checked: false });
      const fRepoToken = el('input', { class: 'input f-repo-token', type: 'password', value: '', placeholder: '访问令牌（公开仓库可留空）' });
      const repoFields = el('div', { class: 'f-repo-fields' }, [
        field('仓库归属（repoUser）', fRepoUser, 'cnb=组织/用户；github=owner。'),
        field('仓库名（repoName）', fRepoName, '不含 .git 后缀、不含组织前缀。'),
        field('分支（repoBranch）', fRepoBranch, '映射到 raw URL 的 ref 段，默认 main。'),
        field('是否私有仓库（repoPrivate）', fRepoPrivate, '勾选=私有（注入 Authorization 鉴权，回源到 api.cnb.cool）；不勾=公开（走 cnb.cool 公网，可不填 token）。'),
        field('访问令牌（token）', fRepoToken, '加密后落盘（每站独立）。公开仓库可留空；编辑时留空表示不改。'),
      ]);

      const inlineFields = el('div', { id: 'origin-inline-fields' }, [
        engineField, addrField, portField, schemeField, r2BindingField, hostModeField, hostCustomField, repoFields,
      ]);

      const syncEngine = () => {
        const eng = fEngine.value;
        const isR2 = eng === 'r2';
        const isRepo = eng === 'cnb' || eng === 'github';
        addrField.style.display = (isR2 || isRepo) ? 'none' : '';
        portField.style.display = (isR2 || isRepo) ? 'none' : '';
        schemeField.style.display = (isR2 || isRepo) ? 'none' : '';
        r2BindingField.style.display = isR2 ? '' : 'none';
        repoFields.style.display = isRepo ? '' : 'none';
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
    // 模板参数是固定的预设值，新建时不开放给用户修改；选中后直接以流量序列的规则
    // 接口把规则写进该站点的「流量序列」，等价于用户自己新建空白站点后再手动去
    // 添加这些规则。落库后即为普通规则，用户要调整直接去「流量序列 → 规则」改即可。
    const tplState = { id: 'blank', list: [] };
    if (!editing) {
      const tplSel = select('f-template', [], 'blank', [{ value: 'blank', label: '加载中…' }]);
      const tplDesc = el('div', { class: 'field-hint muted' }, '');
      const tplPreview = el('div', { class: 'field-hint muted' }, '');

      // 仅更新选中态、描述与「将生成 N 条规则」提示；模板参数固定，不渲染可编辑输入框。
      const syncTpl = () => {
        const tpl = tplState.list.find((t) => t.id === tplSel.value);
        tplState.id = tplSel.value;
        tplDesc.textContent = tpl ? tpl.desc : '';
        const n = (tpl && tpl.rules) ? tpl.rules.length : 0;
        if (tplSel.value === 'blank') {
          tplPreview.textContent = '不会生成任何规则，建站后请自行到「流量序列 → 规则（⑤~⑯）」添加。';
        } else {
          tplPreview.textContent = '建站后将自动以流量序列规则接口写入 ' + n + ' 条规则（参数已固定），可随时在「流量序列 → 规则（⑤~⑯）」增删改。';
        }
      };
      tplSel.onchange = syncTpl;

      body.appendChild(el('div', { class: 'subhead' }, [el('span', {}, '站点场景模板')]));
      body.appendChild(el('div', { class: 'hint' },
        '按站点类型一键铺好该场景下通用且固定的基础规则，省去从零配起。模板参数为固定预设、不可在此修改；如需调整，建站后直接到「流量序列 → 规则」改对应规则即可。'));
      body.appendChild(field('加速类型', tplSel, ''));
      body.appendChild(tplDesc);
      body.appendChild(tplPreview);

      // 异步拉取模板清单（含固定的 rules），失败则静默降级为「空白」，不阻塞建站
      API.sites.templates().then((d) => {
        tplState.list = (d && d.templates) || [];
        clear(tplSel);
        for (const t of tplState.list) {
          const o = el('option', { value: t.id }, t.name);
          // 最常见场景作默认
          if (t.id === 'website') o.selected = true;
          tplSel.appendChild(o);
        }
        syncTpl();
      }).catch(() => {
        clear(tplSel);
        tplSel.appendChild(el('option', { value: 'blank' }, '空白（模板加载失败）'));
      });
    }

    openDrawer(host ? '编辑站点: ' + host : '新建站点', '', body, async () => {
      const h = fHost.value.trim();
      if (!h) throw new Error('请填写 Host');
      const basics = { host: h, enabled: fEnabled.checked, ipv6Support: fIpv6.checked };
      // 新建站点时整合源站信息：选「已有源站」则传 poolId；选「域名/IP」则传 origins + defaultHostHeader
      // 记录「选已有源站」模式下选中的池 id，供下方新建保存时识别 cnb/github 源站并铺预设规则。
      let selectedPoolId = '';
      if (!editing && fOriginMode) {
        if (fOriginMode.value === 'pool') {
          if (!fPoolSel.value) throw new Error('请选择一个已有源站');
          basics.poolId = fPoolSel.value;
          selectedPoolId = fPoolSel.value;
        } else {
          // 「填写域名/IP」：构建 origin 对象，后端 ensureSingleOrigin 自动查重/创建并回填 poolId
          const eng = fEngine.value;
          const isRepo = eng === 'cnb' || eng === 'github';
          if (eng === 'r2') {
            if (!(fR2Binding && fR2Binding.value.trim())) {
              throw new Error('引擎为 r2 时必须填写 R2 绑定名（如 CDN_R2）');
            }
          } else if (isRepo) {
            if (!fRepoUser.value.trim() || !fRepoName.value.trim()) {
              throw new Error(`引擎为 ${REPO_ENGINE_LABEL[eng]} 时必须填写仓库归属与仓库名`);
            }
            if (fRepoPrivate.checked && !fRepoToken.value.trim()) {
              throw new Error(`私有 ${REPO_ENGINE_LABEL[eng]} 仓库必须填写访问令牌`);
            }
          } else if (!fAddr.value.trim()) {
            throw new Error('请填写源站地址');
          }
          const o = {
            addr: (eng === 'r2' || isRepo) ? '' : fAddr.value.trim(),
            port: eng === 'r2' ? null : (Number(fPort.value) || 443),
            scheme: eng === 'r2' ? 'https' : fScheme.value,
            engine: eng,
          };
          if (eng === 'r2') o.r2Binding = (fR2Binding && fR2Binding.value.trim()) || '';
          if (isRepo) {
            // 仓库型：把参数与 token 一并带上，后端加密落盘 + 自动铺预设规则到源站级
            o.repoUser = fRepoUser.value.trim();
            o.repoName = fRepoName.value.trim();
            o.repoBranch = fRepoBranch.value.trim() || 'main';
            o.repoPrivate = !!fRepoPrivate.checked;
            const tokenField = eng === 'cnb' ? 'cnbTokenEnc' : 'githubTokenEnc';
            o[tokenField] = fRepoToken.value.trim();
          }
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
        // 先建站点（不含任何模板专属字段）。模板参数是固定的预设，
        // 选中后直接以流量序列的规则接口（saveRules）把规则写进该站点的
        // 「流量序列」，等价于用户自己新建空白站点后再手动添加这些规则。
        await API.sites.save(h, basics);
        // 合并「站点场景模板规则」+「引擎关联预设规则」后统一写入流量序列。
        const mergedRules = [];
        if (tplState.id && tplState.id !== 'blank') {
          const tpl = tplState.list.find((t) => t.id === tplState.id);
          const rules = (tpl && tpl.rules) || [];
          mergedRules.push(...rules);
        }
        // cnb/github 引擎：把关联的 rewrite + reqHeaders + respHeaders 预设规则并入
        const eng = fEngine.value;
        if ((eng === 'cnb' || eng === 'github') && basics.origins && basics.origins[0]) {
          const origin = basics.origins[0];
          const preset = buildRepoPresetRules(eng, {
            repoUser: origin.repoUser,
            repoName: origin.repoName,
            repoBranch: origin.repoBranch,
            repoPrivate: origin.repoPrivate,
            host: h,
          });
          mergedRules.push(preset.rewrite, preset.respHeaders);
          if (preset.reqHeaders) mergedRules.push(preset.reqHeaders);
        }
        // 选「已有源站（池）」模式：读取池内所有 cnb/github 源站，按各自真实 id
        // 构建 rewrite + 响应头剥离（+ 私有 cnb 鉴权）预设规则，与模板规则合并落盘。
        // 用 originId 匹配精确命中对应源站，cnb / github 同池并存互不冲突。
        if (selectedPoolId) {
          const pool = (APP_DATA.pools || []).find((p) => p.id === selectedPoolId);
          if (pool && Array.isArray(pool.origins)) {
            for (const o of pool.origins) {
              if (o.engine !== 'cnb' && o.engine !== 'github') continue;
              const preset = buildRepoPresetRules(o.engine, {
                repoUser: o.repoUser,
                repoName: o.repoName,
                repoBranch: o.repoBranch,
                repoPrivate: o.repoPrivate,
                originId: o.id,
              });
              mergedRules.push(preset.rewrite, preset.respHeaders);
              if (preset.reqHeaders) mergedRules.push(preset.reqHeaders);
            }
          }
        }
        if (mergedRules.length) {
          await API.sites.saveRules(h, mergedRules);
        }
        const n = mergedRules.length;
        toast(n ? `站点已创建，并已写入 ${n} 条基础规则（模板 + 引擎关联规则）` : '站点已创建');
      }
      await refreshData();
    });
    scrollToAnchor(anchor);
  }

  // ③ 初始回源对象（首要分流）：独立抽屉，只承载「选择回源目标」这一包。
  // 与 ① 匹配站点彻底分离（一个最小任务包一个抽屉），② 安全 / 规则（⑤~⑯）/ ⑭ 源站池各有独立抽屉。
export   async function openInitialOriginDrawer(host, anchor) {
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
        { value: 'fetch', label: 'fetch（支持自定义 Host）' },
        { value: 'socket', label: 'socket（已弃用）', disabled: true },
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
      // 回源连接参数（协议/端口/引擎/Host）作为整池物理默认；⑨ Origin Rules
      // 可针对请求条件覆盖这些参数，故仅作「默认」保留、不再与⑨重复成独立编辑点。
      const overrideHint = el('div', { class: 'hint', text: '回源连接参数（协议 / 端口 / 引擎 / Host）作为本源站整池默认；如需按请求条件差异化，请在⑨「Origin Rules」里设置对应规则，规则级设置会覆盖此处默认值。' });
      const addrField = field('源站地址（域名 / IP）', el('input', { class: 'input o-addr', value: o.addr || '', placeholder: 'storage.example.net' }), '你的真实服务器地址。');
      const portField = field('端口', el('input', { class: 'input o-port', type: 'number', value: o.port || 443 }), 'https 默认 443，http 默认 80。可被⑨规则覆盖。');
      const schemeField = field('协议', select('', [''], o.scheme || 'https', [{ value: 'https', label: 'https' }, { value: 'http', label: 'http' }], 'o-scheme'), '可被⑨规则覆盖。');
      const hostEnLabel = el('label', { class: 'check' }, [hostEn, el('span', { text: '覆盖站点级回源 Host（源站专用）' })]);
      const weightField = field('权重', el('input', { class: 'input o-weight', type: 'number', value: o.weight || 1 }), '配合「加权」策略使用，默认 1 即可。');
      inlineWeightFields.push(weightField);
      const row = el('div', { class: 'origin-row' }, [
        addrField,
        portField,
        schemeField,
        hostEnLabel,
        hostField,
        field('引擎', engineSel, '回源方式（整池默认）：① fetch=标准回源，支持自定义 Host 头（CF/EO/ESA 均可用，Host 由「回源域名/地址」或规则级 hostHeader 决定）；② socket=已弃用（自定义 Host 现由 fetch 原生支持，CF 上裸 IP+HTTPS+自定义 SNI 由 fetchEngine 内部自动走 socket 兜底）；③ r2=回源到 R2 桶（仅 CF，需先在 wrangler.toml 绑定）。可被⑨规则覆盖。'),
        r2Fields,
        weightField,
        overrideHint,
        // 单一源站恒为 1 行，无「移除」按钮：清空地址即视为未填写
      ]);
      engineSel.onchange = syncEngine;
      syncHost();
      syncEngine();
      // 本抽屉只负责「③ 初始回源对象」这一包：地址/端口/协议/前缀/Host/引擎/权重。
      // 源站级的 rewrite/cache/reqHeaders/respHeaders/超时/跟随3xx 属于 ⑨ / ⑪ / ⑭，
      // 由「路由规则」「源站池」抽屉各自管理；这里原样保留，保存时回写，绝不越界改写。
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

      el('div', { class: 'hint frag-note' }, '本抽屉只负责 ③ 首要分流这包。① 匹配站点、② 安全校验、规则（⑤~⑯）、源站池（⑭）细节均有各自独立抽屉，请在「流量序列」中点击对应阶段进入，此处不再重复承载。'),
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
          pathPrefix: '',
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
        toast(`已自动创建单一源站「${res.createdOrigin.name || res.createdOrigin.id}」并绑定到本站点`, 'ok');
      } else {
        toast('初始回源对象片段已保存');
      }
      await refreshData();
    });
    scrollToAnchor(anchor);
  }

  // 安全防护：独立抽屉，只读写站点的 security 字段，不碰基础设置/规则/源站
  // 内部按 ②.1~②.5 五个最小任务包分节，anchor 可直达其中一节
export   async function openSecurityDrawer(host, anchor) {
    if (host === '__global__' || host === '__all__') { toast('全站通用规则请使用全站规则编辑器', 'info'); return; }
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

    openDrawer('安全防护: ' + host, '仅管理 ② 安全校验的 5 个最小任务包。不影响站点基础（①/③）、路由规则（⑤~⑯）与源站池（⑭）。', body, async () => {
      // 后端 saveSecurity 已是片段 API：仅合并 security 字段，互不越界
      await API.sites.saveSecurity(host, readSecurity());
      await refreshData();
    });
    scrollToAnchor(anchor);
  }

  // 路由规则：独立抽屉，只读写站点的 rules 字段，不碰基础/源站/安全（绝不越界）
export   async function openRulesDrawer(host, opts) {
    if (!host) { toast('请先创建站点', 'err'); return; }
    let site;
    try { site = await API.sites.get(host); } catch (e) { toast(e.message, 'err'); return; }
    const poolOptions = buildPoolOptions();
    // 方案 B：彻底移除「完整编辑器」。任何入口都必须携带 STAGE_OPS 字典的 opts（含 allowedOps）
    // 以进入受限抽屉；若调用方未传（防御性兜底），回落到 ⑪ 受限抽屉，绝不打开无限制的完整编辑器。
    if (!opts || !opts.allowedOps) opts = { ...STAGE_OPS['cache'], stage: 'cache' };
    // 受限抽屉的 opts 来自 STAGE_OPS 字典，统一补上 stage（归属阶段）字段，
    // 作为「抽屉归属 / 规则筛选 / 合并落库」的唯一索引。
    opts = { ...opts, stage: opts.stage || null };
    const confined = !!(opts && opts.allowedOps);
    const confinedStage = confined ? opts.stage : null;

    const rulesBox = el('div', { class: 'rules-box' });
    const ruleReaders = [];
    const makeCard = (r) => {
      const { card, read } = buildRuleCard(r, poolOptions, site, opts || {});
      ruleReaders.push(read);
      rulesBox.appendChild(card);
    };
    const addRuleBtn = el('button', { class: 'btn btn-sm', text: '+ 添加规则' });
    addRuleBtn.onclick = () => makeCard(null);

    // 受限抽屉只展示属于本阶段（rule.stage === 本抽屉 stage）的规则，避免把其它阶段混进来误改
    const allRules = (site.rules && site.rules.length ? site.rules : []);
    const shownRules = confinedStage ? allRules.filter((r) => ruleStage(r) === confinedStage) : allRules;
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
      if (confinedStage) {
        // 受限抽屉只动了属于本阶段的规则，其余规则原样保留，避免误删其它阶段的规则
        const editedIds = new Set(edited.map((r) => r.id));
        const kept = (site.rules || []).filter((r) => !editedIds.has(r.id) && ruleStage(r) !== confinedStage);
        await API.sites.saveRules(host, kept.concat(edited));
      } else {
        await API.sites.saveRules(host, edited);
      }
      await refreshData();
    });
  }
export 
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

  /**
   * 归一化 kind：与 stage 字典字段模式对齐——kind 是源站的「单一/池」唯一索引，
   * 由 schema 规范化后必然存在（POOL_KINDS=['single','pool']），渲染层直接读它，
   * 不再现场按 origins 长度反推（避免与后端判定口径漂移）。
   * 仅对后端未回填 kind 的历史数据按 origins 长度兜底一次。
   */
