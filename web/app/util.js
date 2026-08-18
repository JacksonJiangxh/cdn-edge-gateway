// 通用工具：格式化与通用 UI 组件（原 IIFE 内函数平移）。

import { $, el } from '../dom.js';
import { APP_DATA, PLATFORM } from './state.js';
import { normalizeStage } from '../_stage.gen.js';
export function fmtNum(n) {
  n = Number(n) || 0;
  if (n >= 1e9) return (n / 1e9).toFixed(2) + ' GB';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + ' MB';
  if (n >= 1e3) return (n / 1e3).toFixed(2) + ' KB';
  return String(n) + ' B';
}
export const fmtRate = (r) => (r == null || isNaN(r) ? '0%' : (r * 100).toFixed(1) + '%');
export const fmtDate = (ts) => (ts ? new Date(ts).toLocaleString() : '-');

// 把秒数换算成人话，追加在输入框说明后面。
export function humanSecs(s) {
  if (!Number.isFinite(s)) return '';
  if (s < 0) return '　当前：跟随源站，不改写';
  if (s === 0) return '　当前：0（不缓存）';
  if (s < 60) return `　当前：${s} 秒`;
  if (s < 3600) return `　当前：≈ ${(s / 60).toFixed(s % 60 ? 1 : 0)} 分钟`;
  if (s < 86400) return `　当前：≈ ${(s / 3600).toFixed(s % 3600 ? 1 : 0)} 小时`;
  return `　当前：≈ ${(s / 86400).toFixed(s % 86400 ? 1 : 0)} 天`;
}

export function statCard(label, value) {
  return el('div', { class: 'card' }, [
    el('div', { class: 'card-label' }, label),
    el('div', { class: 'card-value' }, value),
  ]);
}

// 根据池 id 取用户可见名称（找不到时回退 id 本体）
export function poolName(id) {
  if (!id) return '未设置';
  const p = APP_DATA.pools.find((x) => x.id === id);
  return (p && (p.name || p.id)) || id;
}

// 规则阶段索引：只认落库的 r.stage 字段，绝不反推。
export function ruleStage(r) {
  return normalizeStage(r && r.stage) || null;
}

export function humanDuration(sec) {
  sec = Number(sec) || 0;
  if (sec <= 0) return '';
  if (sec >= 86400) return `（约 ${Math.round(sec / 86400)} 天）`;
  if (sec >= 3600) return `（约 ${Math.round(sec / 3600)} 小时）`;
  if (sec >= 60) return `（约 ${Math.round(sec / 60)} 分钟）`;
  return `（${sec} 秒）`;
}

export function table(headers, rows) {
  const t = el('table', { class: 'table' });
  t.appendChild(el('thead', {}, el('tr', {}, headers.map((h) => el('th', {}, h)))));
  const tb = el('tbody');
  rows.forEach((r) => tb.appendChild(el('tr', {}, r.map((c) => (c && c.nodeType ? el('td', {}, c) : el('td', {}, String(c)))))));
  t.appendChild(tb);
  return t;
}
export function actions(btns) {
  return el('div', { class: 'row-actions' }, btns.map((b) =>
    el('button', { class: 'btn btn-sm ' + (b.cls || 'btn-ghost'), text: b.label, onclick: b.onClick })
  ));
}

export function renderPlatBadge() {
  const badge = $('plat-badge');
  if (!badge) return;
  const caps = (APP_DATA.info && APP_DATA.info.caps) || {};
  const parts = ['平台: ' + (APP_DATA.info ? APP_DATA.info.platform : PLATFORM)];
  if (caps.hasEdgeCache) parts.push('边缘缓存 ✓');
  if (!caps.hasD1) parts.push('D1 ✗');
  badge.textContent = parts.join(' · ');
  badge.title = (APP_DATA.info && APP_DATA.info.limitations || []).map((l) => l.message).join('\n');
}

export function field(label, control, hint, extra) {
  return el('div', { class: 'form-field' }, [
    el('label', { class: 'label' }, label),
    control,
    hint ? el('div', { class: 'field-hint muted' }, hint) : null,
    ...(Array.isArray(extra) ? extra : []),
  ]);
}

// 动态变量提示条：在支持 ${var} 的字段旁统一展示「可用变量」说明。
export function varHintBar(text) {
  return el('div', { class: 'field-hint muted var-hint' }, [
    el('span', { class: 'var-hint-tag', text: '支持动态变量' }),
    el('span', { text: text || '头值可写 ${host} ${client_ip} ${uri} ${path} ${product_name} 等内置变量，运行时替换为真实值。' }),
  ]);
}

// 把分组结构渲染成带 <optgroup> 的 <select>
export function selectWithGroups(groups, value) {
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
export function select(id, options, value, preset, extraClass) {
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

// multiSelectPanel（组合框多选）：与 singleSelectPanel 同款 combobox 形态，
// 触发器内嵌入真实输入框——既可手填逗号分隔的值，也可点箭头展开分组面板勾选。
// 这样整体上与「可输入可下拉」的状态码组合框风格统一，不再额外并排一个独立选择框。
export   function multiSelectPanel({ presets, groups, tokenOf, render, placeholder }) {
    const tokenOfSafe = tokenOf || ((r) => String(r));
    const renderSafe = render || ((r) => String(r));

    // 组合框：输入框（显示逗号分隔值、可手填）+ 右侧下拉箭头。
    const input = el('input', {
      class: 'input ms-combobox-input',
      type: 'text',
      value: '',
      placeholder: placeholder || '请选择…',
      spellcheck: 'false',
      autocomplete: 'off',
    });
    const caret = el('span', { class: 'ms-caret', text: '▾' });
    const trigger = el('div', { class: 'ms-trigger ms-trigger--combo' }, [input, caret]);
    const getV = () => input.value;
    const setV = (v) => { input.value = v; };

    // 弹出面板（初始隐藏，挂在 body 上）。
    const panel = el('div', { class: 'ms-panel', hidden: true });
    // raw -> 候选按钮节点
    const optEls = new Map();

    function isSelSafe(raw) {
      const cur = getV().split(',').map((s) => s.trim()).filter(Boolean);
      return cur.includes(tokenOfSafe(raw));
    }

    for (const g of groups) {
      const groupEl = el('div', { class: 'ms-group' }, [
        el('div', { class: 'ms-group-label', text: g.label }),
      ]);
      const optWrap = el('div', { class: 'ms-opts' });
      for (const raw of g.values) {
        const opt = el('button', {
          type: 'button',
          class: 'ms-opt',
          text: renderSafe(raw),
          onclick: (e) => { e.stopPropagation(); toggleItem(raw); },
        });
        optEls.set(raw, opt);
        optWrap.appendChild(opt);
      }
      groupEl.appendChild(optWrap);
      panel.appendChild(groupEl);
    }
    // 兜底：分组未覆盖的候选值（防止 presets 与 groups 不一致时漏选）
    const covered = new Set();
    groups.forEach((g) => g.values.forEach((v) => covered.add(String(v))));
    const missing = presets.filter((p) => !covered.has(String(p)));
    if (missing.length) {
      const optWrap = el('div', { class: 'ms-opts' });
      for (const raw of missing) {
        const opt = el('button', {
          type: 'button', class: 'ms-opt', text: renderSafe(raw),
          onclick: (e) => { e.stopPropagation(); toggleItem(raw); },
        });
        optEls.set(raw, opt);
        optWrap.appendChild(opt);
      }
      panel.appendChild(el('div', { class: 'ms-group' }, [el('div', { class: 'ms-group-label', text: '其它' }), optWrap]));
    }

    function syncTrigger() {
      const count = [...optEls.keys()].filter((r) => isSelSafe(r)).length;
      // 多选用输入框本身承载已选值，trigger 不再显示独立摘要，仅高亮有无内容。
      if (count > 0) trigger.classList.add('has-value');
      else trigger.classList.remove('has-value');
    }
    function syncOpts() {
      for (const [raw, node] of optEls) {
        node.classList.toggle('is-selected', isSelSafe(raw));
      }
    }
    function toggleItem(raw) {
      const cur = getV().split(',').map((s) => s.trim()).filter(Boolean);
      const token = tokenOfSafe(raw);
      const idx = cur.indexOf(token);
      if (idx >= 0) cur.splice(idx, 1);
      else cur.push(token);
      setV(cur.join(', '));
      syncTrigger();
      syncOpts();
    }
    function position() {
      const r = trigger.getBoundingClientRect();
      panel.style.position = 'fixed';
      panel.style.top = (r.bottom + 6) + 'px';
      panel.style.left = r.left + 'px';
      panel.style.minWidth = Math.max(r.width, 280) + 'px';
    }
    let open = false;
    function show() {
      position();
      panel.hidden = false;
      open = true;
      trigger.classList.add('is-open');
      document.addEventListener('click', onDocClick, true);
      window.addEventListener('resize', onDocClick);
      window.addEventListener('scroll', onDocClick, true);
      syncOpts();
      syncTrigger();
    }
    function hide() {
      panel.hidden = true;
      open = false;
      trigger.classList.remove('is-open');
      document.removeEventListener('click', onDocClick, true);
      window.removeEventListener('resize', onDocClick);
      window.removeEventListener('scroll', onDocClick, true);
    }
    function toggle() { open ? hide() : show(); }
    // 点击面板外部即关闭（面板自身点击已 stopPropagation，不会触发这里）。
    function onDocClick(e) {
      if (panel.hidden) return;
      if (panel.contains(e.target) || trigger.contains(e.target)) return;
      hide();
    }
    // 手填值框时反向同步选中态与高亮。
    function syncFromInput() { syncOpts(); syncTrigger(); }

    input.addEventListener('focus', show);
    caret.addEventListener('click', (e) => { e.stopPropagation(); open ? hide() : (input.focus(), show()); });

    document.body.appendChild(panel);
    syncTrigger();

    return {
      combobox: trigger, input, panel, syncFromInput,
      destroy() {
        hide();
        panel.remove();
      },
    };
  }

  // singleSelectPanel：与 multiSelectPanel 同款「触发框 + 分组面板」交互，
  // 但为「单选」——点击候选即把该值写入输入框（覆盖填入，不拼接逗号），随后收起面板。
  // 用于「一行一个」的取值场景（如错误码缓存：每行一个状态码模式，而非逗号分隔列表）。
  export function singleSelectPanel({ groups, getValue, setValue, render, placeholder, allowFreetext = true }) {
    const renderSafe = render || ((r) => String(r));

    // 组合框（combobox）：一个可直接手输的输入框 + 右侧下拉箭头。
    // 输入框本身既展示当前值、也允许自由输入（支持精确码 / 通配 / !例外），
    // 箭头点击展开分组面板，选中候选即回填输入框并收起——一行仅需此一个控件。
    const input = el('input', {
      class: 'input ms-combobox-input',
      type: 'text',
      value: (getValue() || '').trim(),
      placeholder: placeholder || '请选择…',
      spellcheck: 'false',
      autocomplete: 'off',
    });
    const caret = el('span', { class: 'ms-caret', text: '▾' });
    const trigger = el('div', { class: 'ms-trigger ms-trigger--combo' }, [input, caret]);

    const panel = el('div', { class: 'ms-panel', hidden: true });
    const optEls = new Map();
    for (const g of groups) {
      const groupEl = el('div', { class: 'ms-group' }, [el('div', { class: 'ms-group-label', text: g.label })]);
      const optWrap = el('div', { class: 'ms-opts' });
      for (const raw of g.values) {
        const opt = el('button', {
          type: 'button', class: 'ms-opt', text: renderSafe(raw),
          onclick: (e) => { e.stopPropagation(); pick(raw); },
        });
        optEls.set(raw, opt);
        optWrap.appendChild(opt);
      }
      groupEl.appendChild(optWrap);
      panel.appendChild(groupEl);
    }

    function syncOpts() {
      const v = (getValue() || '').trim().toLowerCase();
      for (const [raw, node] of optEls) {
        node.classList.toggle('is-selected', String(raw).toLowerCase() === v);
      }
    }
    function pick(raw) {
      setValue(String(raw));
      input.value = String(raw);
      syncOpts();
      hide();
    }
    function position() {
      const r = trigger.getBoundingClientRect();
      panel.style.position = 'fixed';
      panel.style.top = (r.bottom + 6) + 'px';
      panel.style.left = r.left + 'px';
      panel.style.minWidth = Math.max(r.width, 280) + 'px';
    }
    let open = false;
    function show() {
      position();
      panel.hidden = false;
      open = true;
      trigger.classList.add('is-open');
      document.addEventListener('click', onDocClick, true);
      window.addEventListener('resize', onDocClick);
      window.addEventListener('scroll', onDocClick, true);
      syncOpts();
    }
    function hide() {
      panel.hidden = true;
      open = false;
      trigger.classList.remove('is-open');
      document.removeEventListener('click', onDocClick, true);
      window.removeEventListener('resize', onDocClick);
      window.removeEventListener('scroll', onDocClick, true);
    }
    function toggle() { open ? hide() : show(); }
    function onDocClick(e) {
      if (panel.hidden) return;
      if (panel.contains(e.target) || trigger.contains(e.target)) return;
      hide();
    }
    function syncFromInput() { input.value = (getValue() || '').trim(); syncOpts(); }

    // 输入框聚焦即展开下拉；手输时实时回填 getValue 并同步选中高亮。
    input.addEventListener('focus', show);
    input.addEventListener('input', () => {
      setValue(input.value);
      syncOpts();
    });
    // 点击箭头展开 / 收起（输入框自身 focus 已可展开，这里避免重复 toggle 抖动）。
    caret.addEventListener('click', (e) => { e.stopPropagation(); open ? hide() : (input.focus(), show()); });

    document.body.appendChild(panel);

    return {
      combobox: trigger, input, panel, syncFromInput,
      destroy() { hide(); panel.remove(); },
    };
  }

  // 动态变量提示条：在支持 ${var} 的字段旁统一展示「可用变量」说明。
  // 仅作人话提示，不参与表单读取（read() 仍只取用户输入框的值）。
  // 变量名与后端 src/config/vars.js 的 SCALAR_VARS / PREFIXED_VARS 白名单一致；
  // 其中 ${product_name} 是「全站品牌头单一真相源」核心变量（Server/Via 经它注入真实品牌名）。
