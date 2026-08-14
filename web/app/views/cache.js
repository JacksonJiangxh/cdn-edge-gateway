// renderCache / purgeSite

import { el } from '../../dom.js';
import { section } from '../rule-editor/card.js';
import { API, APP_DATA } from '../state.js';
import { actions, table } from '../util.js';
import { confirmDialog, toast } from '../ui.js';
import { route } from '../router.js';
export   async function renderCache() {
    const wrap = el('div', { class: 'section' });
    wrap.appendChild(el('h3', {}, '缓存管理'));
    if (!APP_DATA.sites.length) {
      wrap.appendChild(el('p', { class: 'empty' }, '暂无站点。'));
      return wrap;
    }
    const rows = APP_DATA.sites.map((s) => [
      s.host, 'v' + String(s.cacheGen || 0),
      actions([
        { label: '清空缓存', onClick: () => purgeSite(s.host) },
      ]),
    ]);
    wrap.appendChild(table(['Host', '缓存版本', '操作'], rows));
    return wrap;
  }
export 
  async function purgeSite(host) {
    const ok = await confirmDialog(
      '清空缓存',
      '站点 ' + host + '\n操作：清空缓存（递增缓存版本，新请求全部回源），是否继续？'
    );
    if (!ok) return;
    try {
      await API.cache.purge({ host });
      toast('已触发清空缓存', 'ok');
      await refreshData();
      await route(location.hash);
    } catch (e) { toast(e.message, 'err'); }
  }

  // ====== 系统设置 ======
