// 路由：ROUTES / TITLES / route() / $$nav()

// 路由表（与侧边栏/导航一致）。
import { renderOverview } from './views/overview.js';
import { renderSites } from './views/sites.js';
import { renderTrafficSequence } from './views/sequence.js';
import { renderPools } from './views/pools.js';
import { renderCache } from './views/cache.js';
import { renderSystem } from './views/system.js';
import { $, clear, el } from '../dom.js';
const ROUTES = {
  overview: renderOverview,
  sites: renderSites,
  sequence: renderTrafficSequence,
  pools: renderPools,
  cache: renderCache,
  system: renderSystem,
};
const TITLES = {
  overview: '概览',
  sites: '站点管理',
  sequence: '流量序列',
  pools: '源站管理',
  cache: '缓存管理',
  system: '系统设置',
};

export async function route(hash) {
  const key = (hash || location.hash || '').replace(/^#\/?/, '') || 'overview';
  const fn = ROUTES[key] || renderOverview;
  $('page-title').textContent = TITLES[key] || '概览';
  // 高亮导航
  $$nav().forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#/' + key));
  const content = $('content');
  clear(content);
  content.appendChild(el('div', { class: 'loading' }, '加载中…'));
  try {
    const node = await fn();
    clear(content);
    if (node) content.appendChild(node);
  } catch (e) {
    clear(content);
    content.appendChild(el('div', { class: 'empty err' }, e.message || '加载失败'));
  }
}
export function $$nav() {
  return Array.from(document.querySelectorAll('#nav a[href^="#/"]'));
}
