// 入口装配：保留对 _stage.gen.js / dom.js 的 import，组合各 ESM 子模块。
// 所有视图/组件/路由逻辑已下沉到 ./app/*，本文件只负责启动与测试钩子挂载。
import { APP_DATA, API } from './app/state.js';
import { el } from './dom.js';
import {
  closeDrawer, doLogin, doLogout, ensureAuth, enterApp, showLogin,
} from './app/ui.js';
import { route, $$nav } from './app/router.js';
import { getOp } from './app/rule-editor/card.js';
import { headerEditor, cacheEditor, rewriteEditor } from './app/rule-editor/ops.js';
import { refreshData } from './app/state.js';

// 主题切换（轻量）
function bindTheme() {
  const btn = document.getElementById('theme-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const root = document.documentElement;
    const dark = !root.classList.contains('light');
    root.classList.toggle('light', dark);
  });
}

// 启动
function bindStatic() {
  const doSubmit = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const btn = document.getElementById('login-btn');
    if (btn) btn.disabled = true;
    doLogin(document.getElementById('login-pwd').value).finally(() => {
      if (btn) btn.disabled = false;
    });
  };
  const form = document.getElementById('login-form');
  if (form) form.addEventListener('submit', doSubmit);
  const loginBtn = document.getElementById('login-btn');
  if (loginBtn) {
    loginBtn.type = 'button';
    loginBtn.addEventListener('click', doSubmit);
  }
  const eye = document.getElementById('login-eye');
  if (eye) eye.addEventListener('click', () => {
    const p = document.getElementById('login-pwd');
    p.type = p.type === 'password' ? 'text' : 'password';
  });
  document.getElementById('logout-btn') && document.getElementById('logout-btn').addEventListener('click', doLogout);
  document.getElementById('drawer-close') && (document.getElementById('drawer-close').onclick = closeDrawer);
  document.getElementById('drawer-cancel') && (document.getElementById('drawer-cancel').onclick = closeDrawer);
  document.getElementById('drawer-mask') && document.getElementById('drawer-mask').addEventListener('click', closeDrawer);
  document.getElementById('menu-btn') && document.getElementById('menu-btn').addEventListener('click', () => { document.getElementById('sidebar').classList.add('open'); document.getElementById('sidebar-mask').hidden = false; });
  document.getElementById('sidebar-close') && document.getElementById('sidebar-close').addEventListener('click', () => { document.getElementById('sidebar').classList.remove('open'); document.getElementById('sidebar-mask').hidden = true; });
  document.getElementById('sidebar-mask') && document.getElementById('sidebar-mask').addEventListener('click', () => { document.getElementById('sidebar').classList.remove('open'); document.getElementById('sidebar-mask').hidden = true; });
  $$nav().forEach((a) => a.addEventListener('click', () => { document.getElementById('sidebar').classList.remove('open'); document.getElementById('sidebar-mask').hidden = true; }));
  bindTheme();
  window.addEventListener('hashchange', () => route(location.hash));
}

async function boot() {
  try {
    bindStatic();
    if (await ensureAuth()) {
      enterApp();
    } else {
      showLogin();
    }
  } catch (e) {
    console.error('[boot] fatal:', e && e.message || e);
    showLogin();
  }
}

// ── 测试钩子（仅测试环境使用）────────────────────────────────────────────
// 供 scripts/test-frontend-dom.mjs 在 jsdom 中直接调用内部函数，验证
// 「规则保存时 read() 汇总结构」等回归点（见 rule-editor/card.js 的 read() 契约）。
if (typeof window !== 'undefined' && window.__ENABLE_TEST_HOOK__) {
  window.__TEST__ = {
    getOp,
    headerEditor, cacheEditor, rewriteEditor, el,
  };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
