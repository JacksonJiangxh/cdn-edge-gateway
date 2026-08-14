// renderSystem / importConfig / openChangePassword / exportConfig

import { $, el } from '../../dom.js';
import { section } from '../rule-editor/card.js';
import { API, APP_DATA, PLATFORM } from '../state.js';
import { confirmDialog, doLogout, toast } from '../ui.js';
import { field, fmtRate, select, table } from '../util.js';
import { route } from '../router.js';
import { loadAll } from './overview.js';
export   async function renderSystem() {
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
    // 缓存观测：展示当前 isolate 的边缘缓存命中情况，帮助用户直观评估「缓存收益 /
    // 额度克制」。注意这是单实例内存统计，实例回收即归零，用于观察趋势而非精确计量。
    const cacheStat = (info && info.cache) || null;
    if (cacheStat && typeof cacheStat.hitRate === 'number') {
      rows.push([
        '缓存命中（本实例）',
        `${fmtRate(cacheStat.hitRate)}（命中 ${cacheStat.hits || 0} / 未中 ${cacheStat.misses || 0} / 查询 ${cacheStat.lookups || 0}）`,
      ]);
    }
    if (info && Array.isArray(info.limitations) && info.limitations.length) {
      wrap.appendChild(el('div', { class: 'banner warn' },
        info.limitations.map((l) => el('div', {}, '⚠ ' + l.message))));
    }
    wrap.appendChild(table(['项目', '状态'], rows));

    // ---- KV 后端 / Redis(Webdis) 状态与连通性测试 ----
    // 面向「无原生 KV 平台」（EO Pages / ESA 等）的自部署 Redis 兜底存储。
    const kvBackend = (info && info.kvBackend) || (caps.hasKV ? 'native' : 'none');
    const redisConfigured = !!(info && info.redisConfigured);
    const kvStateText =
      kvBackend === 'redis'
        ? '自部署 Redis（Webdis）✅'
        : kvBackend === 'native'
          ? '平台 KV（CDN_KV / KV）✅'
          : '无（配置无法持久化）❌';
    const kvCard = el('div', { class: 'card-block' }, [
      el('h4', {}, 'KV 存储后端'),
      el('div', { class: 'form-stack' }, [
        field('当前后端', el('span', {}, kvStateText)),
        field('REDIS_URL 已配置', el('span', {}, redisConfigured ? '是' : '否（使用平台 KV 或默认配置）')),
      ]),
      el('div', { class: 'section-head' }, [
        el('button', {
          class: 'btn', text: '测试连通性（读写回环）',
          onclick: async (ev) => {
            const btn = ev.target;
            btn.disabled = true; btn.textContent = '测试中…';
            const out = document.getElementById('kv-ping-out');
            if (out) { out.textContent = '请求中…'; out.className = 'muted'; }
            try {
              const r = await API.kv.ping();
              const okk = r && r.ok;
              if (out) {
                out.className = okk ? 'ok-text' : 'err-text';
                out.textContent = okk
                  ? `✅ 后端=${r.backend} 延迟=${r.latencyMs}ms 读写回环一致`
                  : `❌ 后端=${r.backend || '?'} 错误=${r.error || '未知'}`;
              }
            } catch (e) {
              if (out) { out.className = 'err-text'; out.textContent = '请求失败: ' + e.message; }
            } finally {
              btn.disabled = false; btn.textContent = '测试连通性（读写回环）';
            }
          },
        }),
        el('span', { id: 'kv-ping-out', class: 'muted' }, '点击测试自部署 Redis 是否可读可写'),
      ]),
      el('p', { class: 'muted small' },
        '无原生 KV 的平台（如 EdgeOne Pages / ESA）可自部署 Webdis（HTTP↔Redis 网关），' +
        '并在环境变量配置 REDIS_URL 指向它，本项目即可获得与平台 KV 完全同构的持久化能力，配置 / 统计自动落到您的 Redis。'),
    ]);
    wrap.appendChild(kvCard);

    // 全局配置卡片（导航无独立 global 项，合并到系统页）
    //
    // 关键：这里必须持有各输入框的「节点引用」，不能靠 $('g-xxx') 按 id 全局查找。
    // renderSystem() 返回的 wrap 是在函数结束、由 route() 才 append 到 #content 的，
    // 函数体内 document 里根本不存在这些 id，$() 返回 null —— 回填时会抛
    // TypeError（表现为打开设置页永远是空值），保存时同样取不到值。
    const gAdminPath = el('input', { class: 'input', id: 'g-adminPath', placeholder: 'panel' });
    const gAdminDomain = el('input', { class: 'input', id: 'g-adminDomain', placeholder: 'panel.example.com' });
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
      gAdminDomain.value = cfg.adminDomain || '';
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
        field('自定义面板域名', gAdminDomain, '留空=任意绑定域名均可进管理面板（兼容旧逻辑）；填写后仅此域名 + 管理面路径可进入，规避探测与越界。'),
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
              adminDomain: gAdminDomain.value.trim(),
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

    // 注：原「调试响应头」「全站品牌与请求特征」两张卡片对应的 settings 字段
    // （settings.debug.*、settings.respHeaders.serverName/viaName、
    // settings.request.clientIpHeaders、settings.disguise.staticServerName）
    // 已下沉为规则引擎变量/阶段动作与代码常量，不再作为可配 settings，故此处移除对应表单。
    // 详见 docs/12-request-flow.md「全局配置收敛」一节。

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
export   async function importConfig() {
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
        const errs = res && Array.isArray(res.errors) && res.errors.length ? `，${res.errors.length} 项失败` : '';
        toast(msg + errs, res && res.errors && res.errors.length ? 'warn' : 'ok');
        await loadAll();
      } catch (e) { toast(e.message, 'err'); }
    };
    input.click();
  }

  // 修改密码：自建轻量 modal 表单收集旧/新密码，校验后调 /auth/password。
  // 项目本身没有通用 modal()，这里直接构建覆盖层并复用样式，避免引入不存在的函数。
export   function openChangePassword() {
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
export 
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
