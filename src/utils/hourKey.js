/**
 * 生成 UTC 小时键，形如 "2026080814"（yyyymmddhh）。
 *
 * 统计模块（kvDriver / d1Driver / index 门面）统一复用本实现，
 * 避免同一逻辑在三处重复。
 *
 * @param {number} [ts] 时间戳（ms）；缺省或非法时取当前时间
 * @returns {string} 小时键
 */
export function hourKey(ts) {
  const d = new Date(Number.isFinite(ts) ? ts : Date.now());
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const h = String(d.getUTCHours()).padStart(2, '0');
  return `${y}${m}${day}${h}`;
}
