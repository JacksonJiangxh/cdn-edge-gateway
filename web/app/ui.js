// toast / openDrawer / closeDrawer / scrollToAnchor / confirmDialog / 认证 / 视图切换
import { $, clear, el } from '../dom.js';
import { route } from './router.js';
import { API } from './state.js';
import { loadAll } from './views/overview.js';
export   function toast(msg, type) {
    const host = $('toasts');
    if (!host) return;
    const t = el('div', { class: 'toast' + (type ? ' ' + type : '') }, msg);
    host.appendChild(t);
    setTimeout(() => {
      t.classList.add('hide');
      setTimeout(() => t.remove(), 200);
    }, 3000);
  }

  // 抽屉 ------------------------------------------------------------------
export   function openDrawer(title, hint, bodyNode, onSave) {
    $('drawer-title').textContent = title;
    $('drawer-hint').textContent = hint || '';
    const body = $('drawer-body');
    clear(body);
    body.appendChild(bodyNode);
    $('drawer-mask').hidden = false;
    $('drawer').hidden = false;
    // onSave 为空 → 只读抽屉（如「引用详情」），隐藏保存按钮
    $('drawer-save').hidden = !onSave;
    if (!onSave) { $('drawer-save').onclick = null; return; }
    $('drawer-save').onclick = async () => {
      try {
        $('drawer-save').disabled = true;
        await onSave();
        closeDrawer();
        toast('已保存', 'ok');
        await route(location.hash); // 刷新当前视图
      } catch (e) {
        toast(e.message || '保存失败', 'err');
      } finally {
        $('drawer-save').disabled = false;
      }
    };
  }
export   function closeDrawer() {
    $('drawer').hidden = true;
    $('drawer-mask').hidden = true;
  }

  // 流量序列跳转：抽屉打开后滚动到指定片段锚点并高亮
export   function scrollToAnchor(anchor) {
    if (!anchor) return;
    requestAnimationFrame(() => {
      const tgt = document.getElementById(anchor);
      if (!tgt) return;
      tgt.scrollIntoView({ block: 'start', behavior: 'smooth' });
      tgt.classList.add('flash-anchor');
      setTimeout(() => tgt.classList.remove('flash-anchor'), 1600);
    });
  }

  // 确认弹窗 --------------------------------------------------------------
export   function confirmDialog(title, text, options) {
    options = options || {};
    return new Promise((resolve) => {
      $('confirm-title').textContent = title;
      $('confirm-text').textContent = text || '';
      const extra = $('confirm-extra');
      const input = $('confirm-input');
      if (options.confirmText) {
        extra.hidden = false;
        $('confirm-extra-label').textContent = options.confirmLabel || '';
        input.value = '';
        input.placeholder = options.confirmPlaceholder || '';
      } else {
        extra.hidden = true;
      }
      const mask = $('confirm-mask');
      mask.hidden = false;
      const done = (ok) => {
        mask.hidden = true;
        if (ok && options.confirmText) {
          resolve(input.value.trim() === options.confirmText);
        } else {
          resolve(ok);
        }
      };
      $('confirm-ok').onclick = () => done(true);
      $('confirm-cancel').onclick = () => done(false);
    });
  }

  // 登录态 ----------------------------------------------------------------
  export async function ensureAuth() {
    try {
      const me = await API.auth.me();
      return !!(me && me.authed);
    } catch {
      return false;
    }
  }

  export async function doLogin(pwd) {
    const errEl = $('login-err');
    errEl.hidden = true;
    try {
      await API.auth.login(pwd);
      enterApp();
    } catch (e) {
      errEl.textContent = e.message || '登录失败';
      errEl.hidden = false;
    }
  }

  export async function doLogout() {
    try { await API.auth.logout(); } catch {}
    showLogin();
  }

  // 视图切换 --------------------------------------------------------------
export   function showLogin() {
    $('view-app').hidden = true;
    $('view-login').hidden = false;
  }
  export function enterApp() {
    $('view-login').hidden = true;
    $('view-app').hidden = false;
    // 启动后拉取首屏数据
    loadAll().catch((e) => toast(e.message, 'err'));
    route(location.hash);
  }

