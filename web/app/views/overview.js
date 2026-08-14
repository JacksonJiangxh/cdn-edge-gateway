// renderOverview / loadAll

import { API, APP_DATA } from '../state.js';
import { fmtNum, fmtRate, renderPlatBadge, statCard, table } from '../util.js';
import { el } from '../../dom.js';
import { section } from '../rule-editor/card.js';
import { openSiteDrawer } from './sites.js';
import { openPoolDrawer } from './pools.js';
export   async function loadAll() {
    const [info, sites, pools] = await Promise.all([
      API.system.info().catch(() => null),
      API.sites.list().catch(() => ({ sites: [] })),
      API.pools.list().catch(() => ({ pools: [] })),
    ]);
    APP_DATA.info = info;
    APP_DATA.sites = sites.sites || [];
    APP_DATA.pools = pools.pools || [];
    renderPlatBadge();
  }
export 
  async function renderOverview() {
    const wrap = el('div', { class: 'section' });
    wrap.appendChild(el('h3', {}, '概览'));

    let stats = null;
    try { stats = await API.stats.overview(); } catch {}
    const totalSites = APP_DATA.sites.length;
    const totalPools = APP_DATA.pools.length;
    const cards = el('div', { class: 'cards' }, [
      statCard('站点数', String(totalSites)),
      statCard('源站数', String(totalPools)),
      statCard('请求数(24h)', stats && stats.enabled ? fmtNum(stats.requests) : '未启用'),
      statCard('缓存命中率', stats && stats.enabled ? fmtRate(stats.hitRate) : '—'),
    ]);
    wrap.appendChild(cards);

    if (stats && stats.enabled && Array.isArray(stats.topHosts)) {
      wrap.appendChild(el('h4', {}, 'Top 站点'));
      const rows = stats.topHosts.slice(0, 8).map((h) => [
        h.host, fmtNum(h.requests), fmtNum(h.bytes), fmtRate(h.hitRate),
      ]);
      wrap.appendChild(table(['Host', '请求', '流量', '命中率'], rows));
    } else {
      wrap.appendChild(el('p', { class: 'empty' }, '统计未启用，可在「系统设置」中开启。'));
    }

    // 快速入口
    wrap.appendChild(el('div', { class: 'quick' }, [
      el('button', { class: 'btn btn-primary', text: '+ 新建站点', onclick: () => openSiteDrawer(null) }),
      el('button', { class: 'btn btn-primary', text: '+ 新建源站池', onclick: () => openPoolDrawer(null, 'pool') }),
    ]));
    return wrap;
  }
