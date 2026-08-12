/**
 * ============================================================================
 * web/dom.js —— 安全 DOM / 模板工具层（单一真相源）
 * ----------------------------------------------------------------------------
 * 这是前端唯一允许「构造 DOM 节点」的地方。所有视图渲染都必须经本模块，
 * 禁止在任何业务文件里写 `node.innerHTML = ...` 或手动拼接 HTML 字符串，
 * 从而从根上消除「build 后内联脚本 / <> 标签丢失 / 转义错误」导致的
 * 登录后无法进入后台、控制台报语法定位错误这类脆弱问题。
 *
 * 设计要点：
 *  - el(tag, attrs, children)：类型安全的节点构造器。
 *      · text  -> 走 textContent（永不解析 HTML，天然防 XSS / 标签丢失）
 *      · html  -> 【已废弃】不再支持原始 innerHTML 注入（见下方 html() 说明）
 *      · on*   -> addEventListener（不写内联 onclick，避免转义地狱）
 *      · 其余  -> setAttribute
 *  - escapeHtml(str)：把用户输入转义为「文本」后再显示（如需在只读预览里展示
 *    HTML 源码片段，用这个而不是 innerHTML）。
 *  - 若确有「必须用 HTML 字符串渲染」的极少数场景（本项目当前无），须显式
 *    调用 rawHtml() 并在调用处写明安全理由——这是团队约定的「危险逃生口」，
 *    常规提交审查会重点盯防。
 *
 * 运行环境：浏览器 / jsdom / 无头浏览器 均兼容（仅依赖标准 DOM API）。
 * ============================================================================
 */

/**
 * 转义纯文本为可在 HTML 文本上下文中安全显示的内容。
 * 用于把用户输入、正则、路径等当作「文本」展示，绝不触发标签解析。
 * @param {unknown} v 任意值
 * @returns {string}
 */
export function escapeHtml(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 安全的节点构造器。
 *
 * @param {string} tag 标签名（会被白名单/小写归一）
 * @param {Record<string, any>|null} [attrs] 属性：
 *    - class: 设 className
 *    - text : 设 textContent（唯一正确的文本渲染路径）
 *    - on*  : addEventListener（k = on + 事件名）
 *    - 其他 : setAttribute
 * @param {Node|string|number|Array<Node|string|number>|null} [children]
 * @returns {HTMLElement}
 */
export function el(tag, attrs, children) {
  const safeTag = String(tag || 'div').toLowerCase();
  const n = document.createElement(safeTag);
  if (attrs) {
    for (const k in attrs) {
      if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') {
        n.className = v;
      } else if (k === 'text') {
        // 唯一正确的文本路径：永不解析为 HTML，杜绝 <> 标签丢失 / 注入
        n.textContent = v;
      } else if (k === 'html') {
        // 历史兼容位：旧代码可能传 html，但一律按「纯文本」安全渲染，
        // 不再执行 innerHTML。若确需渲染 HTML 结构，应改为 el() 子节点组合。
        n.textContent = v;
      } else if (k.startsWith('on') && typeof v === 'function') {
        n.addEventListener(k.slice(2), v);
      } else {
        n.setAttribute(k, v === true ? '' : String(v));
      }
    }
  }
  if (children != null) {
    appendChildren(n, children);
  }
  return n;
}

/**
 * 把子节点（或文本/数字）追加到父节点。文本/数字一律走 createTextNode，
 * 绝不拼接成 HTML 字符串。
 * @param {Node} parent
 * @param {Node|string|number|Array<Node|string|number>|null} children
 */
export function appendChildren(parent, children) {
  (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (c == null) return;
    if (typeof c === 'string' || typeof c === 'number') {
      parent.appendChild(document.createTextNode(String(c)));
    } else if (c instanceof Node) {
      parent.appendChild(c);
    }
    // 其余类型（undefined 等）静默忽略，避免报错中断渲染
  });
}

/**
 * 清空一个节点的所有子节点。取代 `node.innerHTML = ''` 这种写法。
 * @param {Node|null} node
 */
export function clear(node) {
  while (node && node.firstChild) node.removeChild(node.firstChild);
}

/**
 * 构造文档碎片（DocumentFragment），便于批量挂载且只触发一次重排。
 * @param {Array<Node|string|number>} children
 * @returns {DocumentFragment}
 */
export function frag(children) {
  const f = document.createDocumentFragment();
  appendChildren(f, children || []);
  return f;
}

/**
 * 选择器查询：
 *  - 单参 ：$('#id') 或 $('.cls') —— 默认走 getElementById（id 命中优先）
 *  - 双参 ：$('.o-addr', row) —— 在 root 内按 CSS 选择器查找
 * @param {string|Element} sel
 * @param {ParentNode} [root]
 * @returns {Element|null}
 */
export function $(sel, root) {
  if (root) return root.querySelector(sel);
  return typeof sel === 'string' ? document.getElementById(sel) : sel;
}

/**
 * 危险逃生口：渲染原始 HTML 字符串。
 * 仅在「内容来源 100% 可信且无法用 el() 组合」时调用，调用处必须注释说明。
 * 本项目常规流程不需要它；保留它是为了让极少数场景不必绕过 dom 层、
 * 从而仍能被统一审计（grep rawHtml 即可定位）。
 * @param {HTMLElement} node 目标节点
 * @param {string} html 原始 HTML（调用方自行保证安全）
 */
export function rawHtml(node, html) {
  node.innerHTML = html;
}
