// headerEditor / cacheEditor / rewriteEditor / previewRewrite

import { $, clear, el } from '../../dom.js';
import { field, humanDuration, select, varHintBar } from '../util.js';
import { statusTtlEditor } from './status.js';
import { section } from './card.js';
import { normalizeMatchForEditor } from './conditions.js';
export   function headerEditor(initial) {
    initial = initial || { set: {}, remove: [] };
    const setWrap = el('div', { class: 'kv-list' });
    const removeWrap = el('div', { class: 'kv-list' });
    const read = () => {
      const set = {};
      Array.from(setWrap.children).forEach((row) => {
        const k = $('.hk', row).value.trim();
        const v = $('.hv', row).value;
        if (k) set[k] = v;
      });
      const remove = [];
      Array.from(removeWrap.children).forEach((row) => {
        const k = $('.hk', row).value.trim();
        if (k) remove.push(k);
      });
      return { set, remove };
    };
    const addKv = (wrap, k0, v0, withVal) => {
      // 头值支持 ${var} 内置变量（与后端 headers.js 的 applyHeaderOps.set 接入 expandVars 对齐）。
      // 注意：变量提示条只挂一次在编辑器顶部（见 root），不在每行 value 下重复，
      // 否则流量序列里每加一行 key-value 就重复一整段「支持动态变量」说明，极其冗杂。
      const valCell = withVal
        ? el('input', { class: 'input hv', value: v0 || '', placeholder: 'value（可写 ${var} 变量）' })
        : el('span', { class: 'muted', text: '(移除)' });
      const row = el('div', { class: 'kv-row' }, [
        el('input', { class: 'input hk', value: k0 || '', placeholder: 'Header-Name' }),
        valCell,
        el('button', { class: 'btn btn-sm btn-danger', text: '×', onclick: () => row.remove() }),
      ]);
      wrap.appendChild(row);
    };
    Object.keys(initial.set || {}).forEach((k) => addKv(setWrap, k, initial.set[k], true));
    (initial.remove || []).forEach((k) => addKv(removeWrap, k, '', false));
    if (!setWrap.children.length) addKv(setWrap, '', '', true);
    if (!removeWrap.children.length) addKv(removeWrap, '', '', false);
    const root = el('div', { class: 'header-editor' }, [
      varHintBar(),
      el('div', { class: 'kv-label' }, '新增 / 修改（把某个请求头设成指定值）：'),
      setWrap,
      el('button', { class: 'btn btn-sm', text: '+ 添加', onclick: () => addKv(setWrap, '', '', true) }),
      el('div', { class: 'kv-label' }, '删除（回源 / 返回时去掉某个请求头）：'),
      removeWrap,
      el('button', { class: 'btn btn-sm', text: '+ 添加', onclick: () => addKv(removeWrap, '', '', false) }),
      el('div', { class: 'field-hint muted', text: '请求头就像信封上的备注。回源请求头在请求发给源站前改；节点响应头在结果返回给用户前改。不知道填什么可留空。' }),
    ]);
    root.__read = read;
    return { root, read };
  }

  // 折叠分区（功能分组卡片样式）
export   function cacheEditor(c, opts) {
    c = c || {};
    opts = opts || {};
    const globalScope = opts.globalScope === true;
    const key = c.key || {};
    const mode = select('', [
      { value: 'ttl', label: '自定义缓存时间（推荐新手）' },
      { value: 'origin', label: '跟随源站 Cache-Control' },
      { value: 'noCache', label: '不缓存（每次回源）' },
    ], c.mode || 'ttl');
    mode.className = 'input';
    const edge = el('input', { class: 'input', type: 'number', value: c.edgeTtl != null ? c.edgeTtl : 15552000, placeholder: '秒' });
    const browser = el('input', { class: 'input', type: 'number', value: c.browserTtl != null ? c.browserTtl : 1800, placeholder: '秒，-1=跟随源站' });
    const edgeHint = el('span', { class: 'field-hint muted' });
    const browserHint = el('span', { class: 'field-hint muted' });
    const iq = el('input', { type: 'checkbox', checked: c.ignoreQuery !== false });
    const qw = el('input', { class: 'input', value: (c.queryWhitelist || []).join(', '), placeholder: '如 id, page（留空=全部保留）' });

    // 自定义 Cache Key
    const ckCase = el('input', { type: 'checkbox', checked: !!key.ignoreCase });
    const ckScheme = el('input', { type: 'checkbox', checked: !!key.includeScheme });
    const ckHeaders = el('input', { class: 'input', value: (key.headers || []).join(', '), placeholder: '如 accept-language' });
    const ckCookies = el('input', { class: 'input', value: (key.cookies || []).join(', '), placeholder: '如 tier' });

    // 错误码缓存（合并原「状态码缓存时长」与「不缓存的状态码」两卡片）：
    // 一行一个「状态码模式 → 秒数」，0 = 不缓存（no-store）。段通配 + 精确码可共存，
    // 精确码优先（如 4xx:0 且 404:10 → 404 缓存 10 秒、其余 4xx 不缓存）。
    const statusTtlEd = statusTtlEditor(c.statusTtl || {});
    const dgInit = (c.disguise && typeof c.disguise === 'object') ? c.disguise : {};
    const dgCdn = globalScope
      ? el('input', { class: 'input', type: 'number', min: '0', value: dgInit.cdnMaxAge != null ? dgInit.cdnMaxAge : 86400 })
      : null;
    const dgIso = globalScope
      ? el('input', { class: 'input', type: 'number', min: '0', value: dgInit.isolateTtlMs != null ? dgInit.isolateTtlMs : 600000 })
      : null;
    const preRefresh = el('input', { type: 'checkbox', checked: !!c.preRefresh });
    const preP = el('input', { class: 'input', type: 'number', value: c.preRefreshPercent || 80, placeholder: '%' });
    const offline = el('input', { type: 'checkbox', checked: !!c.offlineCache });

    const refreshHints = () => {
      edgeHint.textContent = '节点保存多久再回源' + humanDuration(edge.value);
      browserHint.textContent = '浏览器本地缓存多久（用户重复访问更快）' + humanDuration(browser.value);
    };
    edge.addEventListener('input', refreshHints);
    browser.addEventListener('input', refreshHints);
    refreshHints();

    const ttlBox = el('div', { class: 'grid2' }, [
      field('边缘缓存时长（秒）', edge, edgeHint.textContent),
      field('浏览器缓存时长（秒，-1=跟随源站）', browser, browserHint.textContent),
    ]);
    // 提前刷新百分比：只有开启「提前回源刷新」时才有意义
    const prePField = field('提前刷新触发时机（剩余百分比）', preP, '例如 80 表示缓存还剩 20% 有效期时就开始后台刷新。');
    const syncPre = () => { prePField.style.display = preRefresh.checked ? '' : 'none'; };
    preRefresh.addEventListener('change', syncPre);
    syncPre();
    // 仅当「不忽略查询串」时才需要填白名单
    // 关键：必须持有 field() 返回的容器节点引用，不能用 qw.parentElement —— 此刻
    // qw 尚未插入任何父节点，parentElement 为 null，直接取 .style 会抛
    // TypeError 并中断整个 cacheEditor / 抽屉渲染（表现为按钮点了没反应）
    const qwField = field('只保留这些查询参数（其余忽略）', qw, '关闭「忽略查询参数」后才需要填；例如 id,page，留空表示保留全部。');
    const syncIQ = () => { qwField.style.display = iq.checked ? 'none' : ''; };
    iq.addEventListener('change', syncIQ);
    syncIQ();

    // 「不缓存」模式下，以下全部与缓存相关的字段都无意义，整体隐藏
    const cacheDetail = el('div', {}, [
      ttlBox,
      el('div', { class: 'grid2' }, [
        el('label', { class: 'check' }, [iq, el('span', { text: '忽略 URL 里的查询参数 ?x=1（推荐开启，命中率更高）' })]),
        el('label', { class: 'check' }, [ckCase, el('span', { text: '缓存键不区分大小写' })]),
      ]),
      qwField,
      section('自定义缓存区分维度', '默认按 URL 缓存即可；此项仅在「同一网址但不同内容」时才用', [
        el('div', { class: 'grid2' }, [
          el('label', { class: 'check' }, [ckScheme, el('span', { text: '区分 http 与 https 为两份缓存' })]),
        ]),
        field('额外按请求头来区分（逗号分隔）', ckHeaders, '例如 accept-language，常用于多语言站点。一般不用填。'),
        field('额外按 Cookie 来区分（逗号分隔）', ckCookies, '例如 tier（会员等级）。一般不用填。'),
      ]),
      section('错误码缓存', '按状态码控制缓存：给错误页加缓存 / 或明确某个码不缓存——合并了原来的「错误码缓存设置」与「不缓存的状态码」', [
        el('div', { class: 'kv-label' }, '状态码 → 缓存时长（一行一条）：'),
        el('div', { class: 'field-hint muted', text: '例如 404 → 10，表示 404 页面也缓存 10 秒，挡住对源站的重复穿透；填 0 表示该状态码完全不缓存（no-store）。支持整段通配：4xx / 5xx / 52x，填 0 即该段所有错误码都不缓存。精确码优先于段通配——写 4xx → 0 再写 404 → 10，则 404 缓存 10 秒、其余 4xx 不缓存。' }),
        statusTtlEd.root,
        el('div', { class: 'grid2' }, [
          el('label', { class: 'check' }, [preRefresh, el('span', { text: '缓存即将过期时提前回源刷新' })]),
          el('label', { class: 'check' }, [offline, el('span', { text: '源站挂了就用旧缓存顶着' })]),
        ]),
        prePField,
      ]),
      // ---- 以下为全站默认专属（不随单条规则差异化）----
      globalScope ? section('伪装页缓存时长（全站）', '站点未匹配时返回的伪装页缓存多久', [
        field('CDN 缓存时长（秒）', dgCdn, '伪装页在 CDN 层缓存多久。伪装页内容固定，建议保持较长时间以减少函数调用。'),
        field('节点内存缓存时长（毫秒）', dgIso, '反代型伪装页在边缘节点内存里缓存多久，避免每次都去拉取伪装目标站。'),
      ]) : null,
    ]);
    // 只有「自定义缓存时间」才需要填 TTL；「不缓存」则隐藏所有缓存细节
    const syncMode = () => {
      const noCache = mode.value === 'noCache';
      cacheDetail.style.display = noCache ? 'none' : '';
      ttlBox.style.display = mode.value === 'ttl' ? '' : 'none';
    };
    mode.onchange = syncMode;
    syncMode();

    const root = el('div', {}, [
      field('缓存模式', mode, '自定义缓存时间：固定存多久；跟随源站：由源站响应头决定；不缓存：每次都回源（适合动态内容）。'),
      cacheDetail,
    ]);

    const read = () => {
      const out = {
        enabled: mode.value !== 'noCache',
        mode: mode.value,
        edgeTtl: Number(edge.value) || 0,
        browserTtl: browser.value === '' ? 0 : Number(browser.value),
        ignoreQuery: iq.checked,
        queryWhitelist: qw.value.split(',').map((s) => s.trim()).filter(Boolean),
        key: {
          ignoreCase: ckCase.checked,
          includeScheme: ckScheme.checked,
          headers: ckHeaders.value.split(',').map((s) => s.trim()).filter(Boolean),
          cookies: ckCookies.value.split(',').map((s) => s.trim()).filter(Boolean),
        },
        statusTtl: statusTtlEd.read(),
        preRefresh: preRefresh.checked,
        preRefreshPercent: Number(preP.value) || 80,
        offlineCache: offline.checked,
      };
      if (globalScope) {
        out.disguise = {
          cdnMaxAge: Number(dgCdn.value) || 0,
          isolateTtlMs: Number(dgIso.value) || 0,
        };
      }
      return out;
    };
    return { root, read };
  }

  // 前端通配符编译（与 src/config/schema.js 的 compileWildcard 保持一致）：
  // 把 * 编译为等价正则，让本地预览所见即所得。kind 决定 * 的匹配范围，
  // 路径类不匹配斜杠，其余匹配任意字符。返回 null 表示不含通配符（原样正则）。
  function compileGlobLocal(src, kind) {
    if (!src || !src.includes('*')) return null;
    const star = kind === 'path' ? '([^/]*)' : '(.*)';
    let escaped = src.replace(/\\/g, '\\\\');
    escaped = escaped.replace(/[.+?(){}|[\]^$]/g, '\\$&');
    return escaped.split('*').join(star);
  }

  // 重写编辑器
  // 路径重写的纯前端预览（与 src/proxy/rewrite.js 的 applyRewrite 保持一致）
export   function previewRewrite(pathname, rewrite) {
    const type = rewrite && rewrite.type || 'none';
    let out = pathname || '/';
    try {
      if (type === 'prefix') {
        const v = (rewrite.value || '').replace(/\/+$/, '');
        const right = (out || '').replace(/^\/+/, '');
        out = (v ? `${v}/${right || ''}` : `/${right}`);
      } else if (type === 'strip') {
        const v = rewrite.value || '';
        if (v && out.startsWith(v)) out = out.slice(v.length);
      } else if (type === 'regex') {
        // 支持通配符（*）语法：本地编译为等价正则后再预览，与后端行为对齐
        const compiled = compileGlobLocal(rewrite.regexFrom, 'path') || (rewrite.regexFrom || '');
        const re = new RegExp(compiled, 'g');
        const to = rewrite.regexTo ?? '';
        // glob 模式下 $0=首个*段、$1=完整输入、$2..=其余段，与后端 applyRewrite 的别名映射对齐。
        // 用函数式 replace 一次性映射，避免字符串替换里 $& 的转义地狱。
        if (rewrite.regexFrom && rewrite.regexFrom.includes('*')) {
          out = out.replace(re, (...args) => {
            const full = args[0];
            const groups = args.slice(1, -2);
            return to.replace(/\$(\d)\b/g, (_, d) => {
              const n = Number(d);
              if (n === 0) return groups[0] ?? '';
              if (n === 1) return full;
              return groups[n - 1] ?? '';
            });
          });
        } else {
          out = out.replace(re, to);
        }
      }
    } catch { out = pathname; }
    if (!out.startsWith('/')) out = `/${out}`;
    out = out.replace(/\/{2,}/g, '/');
    return out || '/';
  }
export 
  function rewriteEditor(r) {
    r = r || { type: 'none', value: '', regexFrom: '', regexTo: '' };
    const TYPES = {
      none:   { label: '不重写（保持原路径）', desc: '客户端请求什么路径，就回源什么路径。绝大多数情况选这个即可。' },
      prefix: { label: '前缀替换（在路径前加一段）', desc: '把请求路径整体“搬”到一个新目录下，例如把 /img/x.png 变成 /api/img/x.png。' },
      strip:  { label: '去除前缀（去掉开头的某段）', desc: '剥掉路径开头的固定前缀，例如把 /img/x.png 变成 /x.png（常用于隐藏子目录）。' },
      regex:  { label: '正则重写（高级，按规则改写）', desc: '用正则表达式把路径的一部分替换为另一段，适合批量/复杂改写。不懂正则也没关系，下面给了几个最常⻏又好用的简单示例，点一下就能套用。' },
    };
    const typeSel = select('', [], r.type || 'none', Object.entries(TYPES).map(([v, t]) => ({ value: v, label: t.label })));
    typeSel.className = 'input';
    const desc = el('div', { class: 'rw-desc muted' });
    const valueInput = el('input', { class: 'input rw-val', value: r.value || '', placeholder: '例如 /api 或 /img' });
    const fromInput = el('input', { class: 'input rw-from', value: r.regexFrom || '', placeholder: '例如 /img/* 或 ^/old/(.*)' });
    const toInput = el('input', { class: 'input rw-to', value: r.regexTo || '', placeholder: '例如 /images/$0' });
    const fieldsBox = el('div', { class: 'rw-fields' });
    // 示例请求路径：仅用于本地预览，不写入规则配置（避免被误当成真实字段填写）
    const sampleInput = el('input', { class: 'input', value: '/img/photo.png', placeholder: '示例路径，仅用于预览，不会保存' });
    // 预览结果：只读展示，用户不可修改（不是编辑框）
    const previewBox = el('code', { class: 'rw-preview' });

    function renderFields() {
      const t = typeSel.value;
      desc.textContent = TYPES[t].desc;
      clear(fieldsBox);
      if (t === 'prefix' || t === 'strip') {
        fieldsBox.appendChild(field(t === 'prefix' ? '要添加 / 去除的路径前缀' : '要去除的开头前缀', valueInput));
        fieldsBox.appendChild(el('div', { class: 'rw-example muted', text: t === 'prefix'
          ? '示例：填 /api，则 /img/x.png → /api/img/x.png'
          : '示例：填 /img，则 /img/x.png → /x.png' }));
      } else if (t === 'regex') {
        fieldsBox.appendChild(field('匹配规则（源）', fromInput, '不会写正则也没关系：直接写 /img/* 这种通配符，* 代表「后面任意内容」，后台会自动转成正则。'));
        fieldsBox.appendChild(field('替换为（目标）', toInput, '用 $0 引用 * 匹配到的那段内容，$1 引用完整路径（如 /images/$0）。也支持标准 $1 $2 引用分组。', [varHintBar()]));
        // 小白友好的常用简单示例：点一下即可套用（源 + 目标）
        const EXAMPLES = [
          { from: '/img/*', to: '/images/$0', note: '通配符写法：/img/a/b.png → /images/a/b.png（最直观，推荐小白）' },
          { from: '^(.*)$', to: '$1', note: '整体原样透传（保留完整路径，仅做占位/后续拼接用）' },
          { from: '^/old/(.*)', to: '/new/$1', note: '目录迁移：/old/a.png → /new/a.png' },
          { from: '^(.*)\\.html$', to: '$1', note: '去掉 .html 后缀：/page.html → /page' },
        ];
        const exampleBox = el('div', { class: 'rw-examples' }, [
          el('div', { class: 'muted', text: '常用简单示例（点击套用）：' }),
          ...EXAMPLES.map((ex) => {
            const btn = el('button', { class: 'rw-example-btn', type: 'button', text: `${ex.from}  →  ${ex.to}` });
            btn.addEventListener('click', () => {
              fromInput.value = ex.from;
              toInput.value = ex.to;
              renderPreview();
            });
            return el('div', { class: 'rw-example-item' }, [
              btn,
              el('span', { class: 'muted', text: ex.note }),
            ]);
          }),
        ]);
        fieldsBox.appendChild(exampleBox);
      }
    }
    function renderPreview() {
      const sample = sampleInput.value || '/';
      const result = previewRewrite(sample, { type: typeSel.value, value: valueInput.value, regexFrom: fromInput.value, regexTo: toInput.value });
      previewBox.textContent = `${sample}  →  ${result}`;
    }
    typeSel.addEventListener('change', () => { renderFields(); renderPreview(); });
    valueInput.addEventListener('input', renderPreview);
    fromInput.addEventListener('input', renderPreview);
    toInput.addEventListener('input', renderPreview);
    sampleInput.addEventListener('input', renderPreview);

    renderFields();
    renderPreview();

    const root = el('div', { class: 'rw-editor' }, [
      field('类型', typeSel),
      desc,
      fieldsBox,
      el('div', { class: 'rw-preview-row' }, [
        field('示例请求路径（仅预览用，不保存）', sampleInput),
        el('div', { class: 'rw-preview-wrap' }, [
          el('span', { class: 'ro-tag', text: '只读预览' }),
          el('span', { class: 'muted', text: '实际回源路径：' }),
          previewBox,
        ]),
      ]),
    ]);
    const read = () => ({
      type: typeSel.value,
      value: valueInput.value,
      regexFrom: fromInput.value,
      regexTo: toInput.value,
    });
    return { root, read };
  }

  // 旧版快捷条件（extIn / pathPrefix / pathRegex / methodIn）由 normalizeMatchForEditor
  // 在打开规则时并入 conditions 用于展示；保存只写 conditions，后端 matcher 从 conditions
  // 解析等价条件，不再回写旧字段，避免「脏旧字段与干净 conditions 并存」。

  // 把旧版快捷条件并入 conditions（用于编辑器展示）。已存在的 conditions 不动，
  // 旧字段转换为等价的 conditions 条目追加进第 0 个 AND 组。
