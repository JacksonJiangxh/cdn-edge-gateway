// statusQuickPick / statusTtlEditor / statusPatternListEditor / stringListEditor（含顶层常量）
import { $, el } from '../../dom.js';
import { ERROR_CODE_GROUPS } from './conditions.js';
import { field, humanDuration, select, singleSelectPanel } from '../util.js';
export   const STATUS_PATTERN_RE = /^!?(?:[1-5]\d{2}|[1-5]xx|[1-5]\dx)$/i;
export   const STATUS_PATTERN_HINT = '支持三种写法：精确码 404；整段通配 4xx / 5xx；十位段 52x（CDN 扩展错误码）。加 ! 前缀表示例外，例如先写 4xx 再写 !418，就是「除 418 以外的所有 4xx」。';
  /** 常用状态码模式速填组（含段通配，鼓励用户用通配而非逐个枚举） */
export   const STATUS_PATTERN_GROUPS = [
    { label: '整段通配', values: ['4xx', '5xx', '52x'] },
    ...ERROR_CODE_GROUPS.map((g) => ({ label: g.label, values: g.values.map(String) })),
  ];

  /**
   * 状态码速填条：点一下就往列表里插一行，省得手打。
   * @param {(v:string)=>void} onPick 选中某个模式时的回调
   */
export   function statusQuickPick(onPick) {
    return el('div', { class: 'chips' }, STATUS_PATTERN_GROUPS.map((g) => el('div', { class: 'chip-group' }, [
      el('span', { class: 'muted', text: g.label + '：' }),
      ...g.values.map((v) => el('button', {
        class: 'btn btn-sm',
        text: v,
        onclick: (ev) => { ev.preventDefault(); onPick(v); },
      })),
    ])));
  }

  /**
   * 「状态码 + 时长」行式编辑器（一行一条，点击添加/删除）。
   *
   * 取代原先「码:秒, 码:秒」的单一逗号分隔输入框——那种写法既看不出有几条、
   * 也无法逐条删除，且用户很容易漏写冒号导致整条被静默丢弃。
   * 行式录入与「修改响应头」的 set/strip 控件是同一种交互，前后一致。
   *
   * @param {Record<string, any>} initial 初始 {模式: 秒数}
   * @returns {{root: HTMLElement, read: () => Record<string, number>}}
   */
export   function statusTtlEditor(initial) {
    const listWrap = el('div', { class: 'kv-list' });
    const errBox = el('div', { class: 'field-hint muted' });

    const validate = () => {
      const bad = [];
      Array.from(listWrap.children).forEach((row) => {
        const codeInput = $('.st-code', row);
        const code = codeInput.value.trim();
        if (code && !STATUS_PATTERN_RE.test(code)) bad.push(code);
        codeInput.classList.toggle('input-err', !!code && !STATUS_PATTERN_RE.test(code));
      });
      errBox.textContent = bad.length
        ? `⚠ 写法不认识：${bad.join('、')}。${STATUS_PATTERN_HINT}`
        : '';
      return bad.length === 0;
    };

    const addRow = (code, ttl) => {
      // 状态码「可输入可下拉」组合框：既支持手输精确码/通配，也可点箭头从分组面板选。
      // 该组合框本身即输入框（class 含 st-code 供 validate/read 统一取值），无需再并列独立框。
      // codeInput 先声明为 null：singleSelectPanel 初始化期会同步调用 getValue（此时尚为 null，
      // 返回空串即可），picker 建好后再指向其真实 input，避免引用未初始化的 picker 触发 TDZ。
      let codeInput = null;
      const picker = singleSelectPanel({
        groups: STATUS_PATTERN_GROUPS,
        placeholder: '404 / 4xx / 52x',
        getValue: () => (codeInput ? codeInput.value : ''),
        setValue: (v) => { if (codeInput) { codeInput.value = v; validate(); } },
      });
      codeInput = picker.input;
      codeInput.classList.add('st-code');
      // 把初始值回填到 combobox 输入框（singleSelectPanel 内部创建 input 时 getValue
      // 因 codeInput 尚未赋值而返回空串，所以需在此处显式写入后端数据中的状态码）。
      if (code) { codeInput.value = code; }
      const pickerEl = picker.combobox;

      const ttlInput = el('input', {
        class: 'input st-ttl',
        type: 'number',
        min: '0',
        value: ttl == null ? '' : String(ttl),
        placeholder: '秒（0 = 不缓存）',
      });
      const ttlHint = el('span', { class: 'field-hint muted' });
      const syncTtlHint = () => {
        const n = Number(ttlInput.value);
        // 0 是「明确不缓存」而不是「缓存 0 秒」，必须讲清楚，
        // 否则用户填 0 会以为只是很快过期、结果 CDN 仍可能返回旧副本。
        ttlHint.textContent = ttlInput.value === ''
          ? ''
          : (n <= 0 ? '　= 完全不缓存（no-store）' : humanDuration(n));
      };
      ttlInput.addEventListener('input', syncTtlHint);
      syncTtlHint();

      const row = el('div', { class: 'kv-row' }, [
        pickerEl,
        el('div', { class: 'kv-val' }, [ttlInput, ttlHint]),
        el('button', {
          class: 'btn btn-sm btn-danger',
          text: '×',
          onclick: () => { row.remove(); validate(); },
        }),
      ]);
      listWrap.appendChild(row);
    };

    Object.keys(initial || {}).forEach((k) => addRow(k, initial[k]));
    if (!listWrap.children.length) addRow('', '');

    const root = el('div', { class: 'header-editor' }, [
      el('div', { class: 'kv-label' }, '状态码 → 缓存时长（一行一条）：'),
      listWrap,
      el('button', { class: 'btn btn-sm', text: '+ 添加一条', onclick: () => addRow('', '') }),
      el('div', { class: 'field-hint muted', text: STATUS_PATTERN_HINT }),
      errBox,
    ]);

    const read = () => {
      const out = {};
      Array.from(listWrap.children).forEach((row) => {
        const code = $('.st-code', row).value.trim().toLowerCase();
        const ttlRaw = $('.st-ttl', row).value.trim();
        if (!code || !STATUS_PATTERN_RE.test(code) || ttlRaw === '') return;
        const ttl = Number(ttlRaw);
        if (!Number.isFinite(ttl) || ttl < 0) return;
        out[code] = ttl;
      });
      return out;
    };
    return { root, read, validate };
  }

  /**
   * 「不缓存的状态码」列表编辑器（一行一个模式，点击添加/删除）。
   *
   * 这是全站缓存阶段的配置：命中这些状态码的响应一律不写缓存。
   * 与 statusTtl 同级——statusTtl 给某个码单独开缓存，此处则是「一律不缓存」名单。
   *
   * @param {Array<string|number>} initial 初始模式列表
   * @returns {{root: HTMLElement, read: () => string[]}}
   */
export   function statusPatternListEditor(initial) {
    const listWrap = el('div', { class: 'kv-list' });
    const errBox = el('div', { class: 'field-hint muted' });

    const validate = () => {
      const bad = [];
      Array.from(listWrap.children).forEach((row) => {
        const input = $('.st-code', row);
        const v = input.value.trim();
        if (v && !STATUS_PATTERN_RE.test(v)) bad.push(v);
        input.classList.toggle('input-err', !!v && !STATUS_PATTERN_RE.test(v));
      });
      errBox.textContent = bad.length ? `⚠ 写法不认识：${bad.join('、')}。${STATUS_PATTERN_HINT}` : '';
      return bad.length === 0;
    };

    const addRow = (v) => {
      const input = el('input', {
        class: 'input st-code',
        value: v == null ? '' : String(v),
        placeholder: '4xx / 5xx / 52x / !418',
      });
      input.addEventListener('input', validate);
      const row = el('div', { class: 'kv-row' }, [
        input,
        el('span', { class: 'muted', text: '(不写缓存)' }),
        el('button', {
          class: 'btn btn-sm btn-danger',
          text: '×',
          onclick: () => { row.remove(); validate(); },
        }),
      ]);
      listWrap.appendChild(row);
    };

    (Array.isArray(initial) ? initial : []).forEach((v) => addRow(v));
    if (!listWrap.children.length) addRow('');

    const root = el('div', { class: 'header-editor' }, [
      el('div', { class: 'kv-label' }, '这些状态码的响应不写缓存（一行一个）：'),
      listWrap,
      el('button', { class: 'btn btn-sm', text: '+ 添加一条', onclick: () => addRow('') }),
      statusQuickPick((v) => { addRow(v); validate(); }),
      el('div', { class: 'field-hint muted', text: STATUS_PATTERN_HINT + ' 清空整个列表则表示「不按状态码拦缓存」。' }),
      errBox,
    ]);

    const read = () => {
      const out = [];
      Array.from(listWrap.children).forEach((row) => {
        const v = $('.st-code', row).value.trim().toLowerCase();
        if (v && STATUS_PATTERN_RE.test(v) && !out.includes(v)) out.push(v);
      });
      return out;
    };
    return { root, read, validate };
  }


  /**
   * 简单字符串列表编辑器（一行一个），用于回源请求头透传白名单等。
   * @param {string[]} initial
   * @param {{label:string, placeholder?:string, hint?:string, tag?:string}} opts
   */
export   function stringListEditor(initial, opts) {
    opts = opts || {};
    const listWrap = el('div', { class: 'kv-list' });
    const addRow = (v) => {
      const row = el('div', { class: 'kv-row' }, [
        el('input', { class: 'input sl-val', value: v || '', placeholder: opts.placeholder || '' }),
        el('span', { class: 'muted', text: opts.tag || '' }),
        el('button', { class: 'btn btn-sm btn-danger', text: '×', onclick: () => row.remove() }),
      ]);
      listWrap.appendChild(row);
    };
    (Array.isArray(initial) ? initial : []).forEach((v) => addRow(v));
    if (!listWrap.children.length) addRow('');
    const root = el('div', { class: 'header-editor' }, [
      el('div', { class: 'kv-label' }, opts.label || ''),
      listWrap,
      el('button', { class: 'btn btn-sm', text: '+ 添加一条', onclick: () => addRow('') }),
      opts.hint ? el('div', { class: 'field-hint muted', text: opts.hint }) : null,
    ]);
    const read = () => {
      const out = [];
      Array.from(listWrap.children).forEach((row) => {
        const v = $('.sl-val', row).value.trim().toLowerCase();
        if (v && !out.includes(v)) out.push(v);
      });
      return out;
    };
    return { root, read };
  }
