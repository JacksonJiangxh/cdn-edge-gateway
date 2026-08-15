/**
 * ============================================================================
 * utils/mime.js —— 内容类型（MIME）修正辅助
 * ----------------------------------------------------------------------------
 * 项目定位：本项目本质是一个边缘网关，代替用户去上游源站（如 CNB / Git 仓库）
 * 拉取资源（图片 / 文件 raw 等）再回传给浏览器。上游 raw 接口返回的 Content-Type
 * 往往不正确（缺失、统一给 text/plain、application/octet-stream，甚至带 charset
 * 的文本类型），而部分浏览器不会回退到 URL 后缀名判定，导致图片等无法正确渲染
 * （「未知类型」错误）。作为中间人，网关有责任识别并纠正为正确的 MIME。
 *
 * 设计（贴合本项目选型）：
 *   - 零 body 成本：只依据「请求 URL 的后缀名」判定，绝不读取响应体（无内存压力）。
 *   - 智能触发：仅当上游 Content-Type 缺失 / 通用 / 疑似错误时才覆盖；
 *     上游已给出具体、可信的类型则尊重之。
 *   - 全站通用、可关闭：是否启用由全站默认阶段 fixContentType.enabled 控制
 *     （见 config/stages-defaults.js 的 DEFAULT_GLOBAL_RULES.fixContentType）。
 * ============================================================================
 */

/**
 * 后缀名（小写，不含点）→ MIME 类型的映射表。
 * 覆盖常见静态资源；缺失后缀名时回落到 null（交给调用方决定是否覆盖）。
 * 取值与浏览器 / Nginx mime.types 常用值对齐。
 */
export const EXT_TO_MIME = Object.freeze({
  // 图片
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  heic: 'image/heic',
  heif: 'image/heif',
  // 文本 / 标记
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'application/javascript; charset=utf-8',
  mjs: 'application/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  xml: 'application/xml; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  // 字体
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  eot: 'application/vnd.ms-fontobject',
  // 音视频
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  flac: 'audio/flac',
  aac: 'audio/aac',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',
  m4a: 'audio/mp4',
  m4v: 'video/mp4',
  // 文档
  pdf: 'application/pdf',
  zip: 'application/zip',
  '7z': 'application/x-7z-compressed',
  gz: 'application/gzip',
  tar: 'application/x-tar',
  rar: 'application/vnd.rar',
  wasm: 'application/wasm',
});

/**
 * 被认为「需要被纠正」的上游 Content-Type（缺失或过于通用 / 疑似错误）。
 * 这些是上游 raw 接口最常见的「坏类型」，且无法可靠表达真实媒体类型：
 *   - 空 / undefined                          → 完全没有类型
 *   - text/plain                              → 通用文本（raw 接口最常误标）
 *   - application/octet-stream                → 通用二进制流
 *   - application/json / text/*（非 charset） → 上游可能给错，按后缀更可信
 * 注意：带具体子类型且非上述通用的类型（如 image/png、video/mp4）视为可信，不覆盖。
 */
const GENERIC_OR_SUSPECT_TYPES = new Set([
  'text/plain',
  'application/octet-stream',
  'application/json',
  'application/xml',
  'text/xml',
]);

/**
 * 判断一个上游 Content-Type 是否「需要被纠正」。
 * @param {string|null|undefined} contentType 上游响应头里的 Content-Type
 * @returns {boolean} true = 应被纠正（缺失 / 通用 / 疑似错误）
 */
export function shouldFixContentType(contentType) {
  if (!contentType || !contentType.trim()) return true;
  const normalized = contentType.trim().toLowerCase().split(';')[0].trim();
  if (!normalized) return true;
  // 带具体子类型的可信类型（非通用列表、且不是裸 text/*）不纠正，
  // 例如 image/*、video/*、audio/*、font/*、application/pdf 等具体类型。
  // 这里用白名单式判断：仅当落在「通用/疑似」集合，或属于裸 text/* 时才纠正。
  if (GENERIC_OR_SUSPECT_TYPES.has(normalized)) return true;
  // 裸 text/*（如 text/plain 已覆盖；这里兜底其它 text/ 子类型，除 text/html/css 等可信）
  if (normalized.startsWith('text/') && !/^text\/(html|css|markdown|csv)$/.test(normalized)) {
    return true;
  }
  return false;
}

/**
 * 从 URL 中解析出小写后缀名（不含点），无后缀返回 null。
 * @param {string} url 请求 URL（path 或完整 URL 均可）
 * @returns {string|null}
 */
export function getExtension(url) {
  if (!url) return null;
  // 去掉查询串与 hash，避免 ?v=1 干扰
  const pathPart = url.split('?')[0].split('#')[0];
  if (!pathPart) return null;
  // 取最后一段路径里的文件名
  const lastSeg = pathPart.split('/').pop();
  if (!lastSeg) return null;
  const dotIdx = lastSeg.lastIndexOf('.');
  // 点必须在非首位（避免 .gitignore 这类隐藏文件被当成后缀）
  if (dotIdx <= 0 || dotIdx === lastSeg.length - 1) return null;
  const ext = lastSeg.slice(dotIdx + 1).toLowerCase();
  return ext || null;
}

/**
 * 根据请求 URL 的后缀名推导应使用的 MIME 类型；
 * 若后缀名未知 / 无后缀，返回 null（调用方据此决定是否仍要纠正）。
 * @param {string} url 请求 URL
 * @returns {string|null}
 */
export function mimeFromUrl(url) {
  const ext = getExtension(url);
  if (!ext) return null;
  return EXT_TO_MIME[ext] || null;
}

/**
 * 综合判定：给定上游 Content-Type 与请求 URL，返回应下发给客户端的 Content-Type。
 * 仅当（上游需要纠正）且（URL 能推导出 MIME）时返回纠正值；否则返回上游原值。
 *
 * @param {string|null|undefined} upstreamContentType 上游响应头 Content-Type
 * @param {string} requestUrl 本次请求 URL（用于取后缀名）
 * @returns {{ changed: boolean, contentType: string|null }} 纠正结果与最终类型
 */
export function resolveContentType(upstreamContentType, requestUrl) {
  const original = upstreamContentType || null;
  if (!shouldFixContentType(upstreamContentType)) {
    return { changed: false, contentType: original };
  }
  const corrected = mimeFromUrl(requestUrl);
  if (!corrected) {
    // 无法从后缀名推断，尊重上游（哪怕它通用），不强行改为 octet-stream
    return { changed: false, contentType: original };
  }
  return { changed: true, contentType: corrected };
}
