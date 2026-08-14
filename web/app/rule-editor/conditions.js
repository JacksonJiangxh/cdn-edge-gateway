// conditionsEditor / conditionRow / normalizeMatchForEditor（含顶层常量）
import { field, multiSelectPanel, select } from '../util.js';
import { $, el } from '../../dom.js';
export   const MATCH_TARGET_OPTS = [
    { value: 'host', label: 'Host（客户端请求域名）' },
    { value: 'path', label: 'URL 路径' },
    { value: 'fullUrl', label: '完整 URL（含协议、域名、路径、参数）' },
    { value: 'query', label: '查询字符串（Query String）' },
    { value: 'extension', label: '文件后缀' },
    { value: 'filename', label: '文件名称' },
    { value: 'directory', label: '目录' },
    { value: 'method', label: '请求方法' },
    { value: 'protocol', label: '请求协议（HTTP/HTTPS）' },
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
export   const MATCH_OP_OPTS = [
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
export   const TARGETS_WITH_KEY = ['header', 'cookie', 'query'];
export   const OPS_NO_VALUE = ['exists', 'notExists'];

  // 后缀候选值（与 src/config/templates.js 的 EXTENSION_PRESETS 同构；前端无打包无法 import，
  // 由 build.mjs 做一致性断言。规则编辑器的「文件后缀 / 后缀为」值以此作为下拉候选）。
export   const EXTENSION_PRESETS = [
    '7z', 'avi', 'avif', 'apk', 'bin', 'bmp', 'bz2', 'class', 'css', 'csv',
    'doc', 'docx', 'dmg', 'ejs', 'eot', 'eps', 'exe', 'flac', 'gif', 'gz',
    'ico', 'iso', 'jar', 'jpg', 'jpeg', 'js', 'mid', 'midi', 'mkv', 'mp3',
    'mp4', 'ogg', 'otf', 'pdf', 'pict', 'pls', 'png', 'ppt', 'pptx', 'ps',
    'rar', 'svg', 'svgz', 'swf', 'tar', 'tif', 'tiff', 'ttf', 'webm', 'webp',
    'woff', 'woff2', 'xls', 'xlsx', 'zip', 'zst',
  ];
  // 错误状态码候选值（与 src/config/templates.js 的 ERROR_CODE_PRESETS 同构）。
export   const ERROR_CODE_PRESETS = [
    400, 401, 403, 404, 405, 406, 408, 409, 410, 412, 413, 415, 422, 429,
    500, 502, 503, 504,
  ];
  // 后缀候选按资源类型分组（仅前端展示层，便于 EO/CF 风格的分类多选下拉）。
  // 不改动 EXTENSION_PRESETS 数组定义，避免破坏 build.mjs 一致性断言。
export   const EXTENSION_GROUPS = [
    { label: '网页与脚本', values: ['css', 'js', 'ejs', 'class', 'swf'] },
    { label: '图片', values: ['bmp', 'gif', 'ico', 'jpg', 'jpeg', 'png', 'svg', 'svgz', 'tif', 'tiff', 'avif', 'webp', 'pict', 'eps', 'eot', 'otf', 'ttf', 'woff', 'woff2'] },
    { label: '音视频', values: ['avi', 'flac', 'mid', 'midi', 'mkv', 'mp3', 'mp4', 'ogg', 'webm'] },
    { label: '文档', values: ['csv', 'doc', 'docx', 'pdf', 'ppt', 'pptx', 'ps', 'xls', 'xlsx'] },
    { label: '压缩包与镜像', values: ['7z', 'bz2', 'gz', 'rar', 'tar', 'zip', 'zst', 'dmg', 'iso'] },
    { label: '程序与二进制', values: ['apk', 'bin', 'exe', 'jar', 'pls'] },
  ];
  // 错误码按 4xx / 5xx 分组（仅展示层）。
export   const ERROR_CODE_GROUPS = [
    { label: '4xx 客户端错误', values: [400, 401, 403, 404, 405, 406, 408, 409, 410, 412, 413, 415, 422, 429] },
    { label: '5xx 服务端错误', values: [500, 502, 503, 504] },
  ];

  // 单个条件行：[匹配对象] [键名] [操作符] [值] [忽略大小写] [删除]
export   function conditionRow(cond, onRemove) {
    cond = cond || { target: 'path', op: 'prefix', values: [], key: '', ignoreCase: true };
    const tSel = select('', MATCH_TARGET_OPTS, cond.target || 'path');
    tSel.className = 'input';
    const keyInput = el('input', { class: 'input', value: cond.key || '', placeholder: '键名' });
    const opSel = select('', MATCH_OP_OPTS, cond.op || 'prefix');
    opSel.className = 'input';
    // 后缀候选 datalist（仅文件后缀 / 后缀为 时启用）：下拉多选 + 可手填新值。
    const extDlId = 'ext-presets-dl-' + Math.random().toString(36).slice(2);
    const extDl = el('datalist', { id: extDlId }, EXTENSION_PRESETS.map((e) =>
      el('option', { value: e })));
    const valInput = el('input', {
      class: 'input',
      value: (cond.values || []).join(', '),
      placeholder: '多个值用逗号分隔（之间为“或”）',
    });
    const icCb = el('input', { type: 'checkbox', checked: cond.ignoreCase !== false });
    const valHint = el('span', { class: 'field-hint muted' });
    // 后缀候选：EO/CF 风格分类多选下拉（替代原先在值框下方平铺的 chips）。
    // 点击触发框弹出分类面板，已选填充高亮、未选描边；同时保留逗号手填能力。
    const extMs = multiSelectPanel({
      presets: EXTENSION_PRESETS,
      groups: EXTENSION_GROUPS,
      getValue: () => valInput.value,
      setValue: (t) => { valInput.value = t; valInput.focus(); },
      tokenOf: (e) => String(e).toLowerCase(),
      isSelected: (e) => {
        const norm = String(e).toLowerCase();
        return valInput.value.split(',').map((s) => s.trim().replace(/^\./, '').toLowerCase()).filter(Boolean).includes(norm);
      },
      render: (e) => '.' + e,
      placeholder: '选择文件后缀（可多选）',
    });
    const extTriggerWrap = el('div', { class: 'ms-trigger-wrap' }, [extMs.trigger]);
    valInput.addEventListener('input', () => extMs.syncFromInput());

    const keyWrap = el('div', { class: 'cond-cell' }, [keyInput]);
    const valWrap = el('div', { class: 'cond-cell' }, [valInput, extDl, extTriggerWrap, valHint]);

    // 运算符对应的填写示例，帮小白看懂“值”该写什么
    const OP_EXAMPLES = {
      equal: '例如填 /index.html 表示路径恰好等于它',
      notEqual: '例如填 /admin 表示路径不是它',
      contain: '例如填 /api 表示路径里包含 /api',
      notContain: '例如填 /private 表示路径不含 /private',
      prefix: '例如填 /img 表示以 /img 开头',
      notPrefix: '例如填 /old 表示不以 /old 开头',
      suffix: '例如填 .php 表示以 .php 结尾',
      notSuffix: '例如填 .css 表示不以 .css 结尾',
      regex: '可写标准正则如 ^/old/(.*)，也可写通配符如 /img/*（* 代表任意内容，后台自动转正则）；^/img/ 表示以 /img/ 开头',
      notRegex: '例如 ^/admin 表示不匹配以 /admin 开头；也可写通配符如 /secret/*',
      exists: '无需填值，只要这个头/参数存在就命中',
      notExists: '无需填值，只要这个头/参数不存在就命中',
    };
    const KEY_HINTS = {
      header: '要匹配的请求头名称，如 User-Agent',
      cookie: '要匹配的 Cookie 名称，如 session',
      query: '要匹配的查询参数名，如 id',
    };
    const ORIGIN_HINT = '回源目标 = ③ 首要分流按负载均衡实际选出的源站。可选源站 ID（exact 匹配）或源站地址（支持包含/前缀/正则）。例如源站池里有 3 个源站，就分别用 3 个「回源目标」条件做分支，⑦~⑱ 共用一条线、⑩⑭ 为真实只读结果。';

    // key 仅对 header/cookie/query 有意义；exists/notExists 不需要值
    const sync = () => {
      const needKey = TARGETS_WITH_KEY.includes(tSel.value);
      keyWrap.style.display = needKey ? '' : 'none';
      keyInput.placeholder = needKey ? (KEY_HINTS[tSel.value] || '键名') : '键名';
      valWrap.style.display = OPS_NO_VALUE.includes(opSel.value) ? 'none' : '';
      const isExt = tSel.value === 'extension' || opSel.value === 'suffix' || opSel.value === 'notSuffix';
      // 后缀模式：值输入框启用候选 datalist + 显示多选触发框；否则隐藏。
      if (isExt) {
        valInput.setAttribute('list', extDlId);
        extTriggerWrap.style.display = '';
        extMs.syncFromInput();
      } else {
        valInput.removeAttribute('list');
        extTriggerWrap.style.display = 'none';
      }
      valHint.textContent = OPS_NO_VALUE.includes(opSel.value)
        ? ''
        : (tSel.value === 'origin' || tSel.value === 'originAddr')
          ? ORIGIN_HINT
          : (OP_EXAMPLES[opSel.value] || '');
    };
    tSel.onchange = sync;
    opSel.onchange = sync;
    sync();

    const row = el('div', { class: 'cond-row' }, [
      tSel,
      keyWrap,
      opSel,
      valWrap,
      el('label', { class: 'check', title: '不区分大小写（如 Path 与 path 视为相同）' }, [icCb, el('span', { text: '不区分大小写' })]),
      el('button', { class: 'btn btn-sm btn-danger', text: '×', onclick: () => { row.remove(); onRemove && onRemove(); } }),
    ]);

    // 读取该行的当前值（供条件组编辑器汇总）。
    // 缺失此返回值会导致 conditionsEditor 解构得到 undefined，规则编辑器一打开即崩溃。
    const read = () => {
      const value = valInput.value;
      const values = value
        ? value.split(',').map((s) => s.trim()).filter(Boolean)
        : [];
      return {
        target: tSel.value,
        op: opSel.value,
        key: keyInput.value.trim(),
        values,
        ignoreCase: icCb.checked,
      };
    };
    return { row, read };
  }

  // 条件组编辑器：外层 OR，内层 AND
export   function conditionsEditor(groups) {
    groups = Array.isArray(groups) && groups.length ? groups : [];
    const wrap = el('div', { class: 'cond-groups' });
    const readers = [];

    const addGroup = (conds) => {
      const rows = el('div', { class: 'cond-rows' });
      const groupReaders = [];
      const entry = { readers: groupReaders };

      const addCond = (c) => {
        const { row, read } = conditionRow(c, () => {
          const i = groupReaders.indexOf(read);
          if (i >= 0) groupReaders.splice(i, 1);
        });
        groupReaders.push(read);
        rows.appendChild(row);
      };

      (conds && conds.length ? conds : [null]).forEach(addCond);

      const box = el('div', { class: 'cond-group' }, [
        el('div', { class: 'cond-group-head' }, [
          el('span', { class: 'badge', text: '且（AND）' }),
          el('button', { class: 'btn btn-sm', text: '+ 条件', onclick: () => addCond(null) }),
          el('button', {
            class: 'btn btn-sm btn-danger',
            text: '删除条件组',
            onclick: () => {
              box.remove();
              const i = readers.indexOf(entry);
              if (i >= 0) readers.splice(i, 1);
            },
          }),
        ]),
        rows,
      ]);
      readers.push(entry);
      wrap.appendChild(box);
    };

    groups.forEach(addGroup);

    const root = el('div', {}, [
      el('div', { class: 'muted', text: '条件组之间为「或（OR）」关系，组内条件之间为「且（AND）」关系。不添加任何条件时匹配全部请求。' }),
      wrap,
      el('button', { class: 'btn btn-sm', text: '+ 添加条件组（或）', onclick: () => addGroup(null) }),
    ]);

    const read = () =>
      readers
        .map((g) => g.readers.map((r) => r()).filter((c) => c.op && c.target))
        .filter((g) => g.length > 0);

    return { root, read };
  }
export   function normalizeMatchForEditor(match) {
    match = match || {};
    const groups = Array.isArray(match.conditions) ? match.conditions.map((g) => (Array.isArray(g) ? g.slice() : [])) : [];
    const first = groups.length ? groups[0] : [];
    const push = (c) => first.push(c);
    if (Array.isArray(match.extIn) && match.extIn.length) {
      push({ target: 'extension', op: 'equal', ignoreCase: true, values: match.extIn.map((e) => String(e).toLowerCase().replace(/^\./, '')) });
    }
    if (match.pathPrefix) {
      push({ target: 'path', op: 'prefix', ignoreCase: true, values: [match.pathPrefix] });
    }
    if (match.pathRegex) {
      push({ target: 'path', op: 'regex', values: [match.pathRegex] });
    }
    if (Array.isArray(match.methodIn) && match.methodIn.length) {
      push({ target: 'method', op: 'equal', values: match.methodIn.map((m) => String(m).toUpperCase()) });
    }
    if (first.length) {
      if (!groups.length) groups.push(first);
      else groups[0] = first;
    }
    return { ...match, conditions: groups };
  }

  // 构建单条规则卡片（可视化规则引擎）
  // 测试钩子载体：供 scripts/test-frontend-dom.mjs 在 jsdom 中直接读取 OP_BUILDERS，
  // 验证「规则保存时 read() 汇总结构」等回归点。生产环境不依赖它。
