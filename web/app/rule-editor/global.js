// openGlobalRulesDrawer / openGlobalOnlyStageDrawer / openCacheGenDrawer

import { GLOBAL_ONLY_STAGE_OPS, STAGE_OPS, isGlobalOnlyStage } from '../../_stage.gen.js';
import { GLOBAL_STAGE_OPS, actionToGlobalStage, globalStageToAction } from './shared.js';
import { API, globalStages } from '../state.js';
import { openDrawer, toast } from '../ui.js';
import { buildPoolOptions } from '../views/pools.js';
import { buildRuleCard } from './card.js';
import { $, el } from '../../dom.js';
import { field, humanDuration, select } from '../util.js';
export   async function openGlobalRulesDrawer(stage, opts) {
    // 全站独有阶段（匹配站点 / 安全校验 / 错误处理）不是「规则动作」，
    // 不能按 URL 条件差异化，因此走专属的参数表单抽屉，而非规则卡片编辑器。
    if (isGlobalOnlyStage(stage)) return openGlobalOnlyStageDrawer(stage);
    // 全站通用规则编辑器：新阶段→默认动作映射，编辑「该阶段恰好 1 条」的默认动作。
    // stage/opts 缺省时回落到 cache（缓存阶段），确保任何入口都不会打开越界编辑器。
    const effStage = stage && STAGE_OPS[stage] ? stage : 'cache';
    // 仅允许编辑本阶段拥有的动作（与后端 buildActionByStage 的 ownedFields 对应）。
    // 注意 terminate 阶段剔除 redirect（redirect 是独立 stage），否则会误并入 terminate。
    const effOpts = {
      ...STAGE_OPS[effStage],
      stage: effStage,
      allowedOps: (GLOBAL_STAGE_OPS[effStage] || STAGE_OPS[effStage].allowedOps || []).slice(),
      hideTargetPool: true,
      // 让缓存 / 请求头编辑器额外渲染「全站专属」子字段（不缓存状态码名单、
      // 伪装页缓存时长、透传白名单、剥离规则）——这些在站点规则里不出现。
      globalScope: true,
    };
    // 读取全站阶段映射（优先用已预取的 globalStages，缺失再拉一次保证新鲜）
    let stages = globalStages || {};
    if (!stages[effStage]) {
      try {
        const data = await API.rules.global();
        stages = (data && data.stages) || {};
      } catch (e) {
        toast('读取全站通用规则失败：' + (e && e.message ? e.message : '未知错误'), 'err');
        return;
      }
    }
    const poolOptions = buildPoolOptions();

    // 该阶段现有默认动作（单条），包装成一条「规则」交给 buildRuleCard 编辑。
    const stageValue = stages[effStage] || {};
    const baseRule = {
      id: '__global__',
      priority: 0,
      enabled: true,
      name: '全站兜底默认',
      note: '内置保守默认，可自由修改。',
      match: { conditions: [] },
      action: globalStageToAction(effStage, stageValue),
    };

    const rulesBox = el('div', { class: 'rules-box' });
    const { card, read } = buildRuleCard(baseRule, poolOptions, null, effOpts);
    rulesBox.appendChild(card);

    const resetBtn = el('button', { class: 'btn btn-sm', text: '↺ 恢复该阶段内置默认' });
    resetBtn.onclick = () => {
      // 重建一张「空默认」卡片（buildRuleCard(null) 生成各 op 默认空动作），保存时后端
      // validateGlobalRulesStages 会用内置 DEFAULT_GLOBAL_RULES[effStage] 补全为该阶段保守默认。
      rulesBox.innerHTML = '';
      const rebuilt = buildRuleCard(null, poolOptions, null, effOpts);
      rulesBox.appendChild(rebuilt.card);
      rebuiltCardRead = rebuilt.read;
      toast('已恢复该阶段内置默认，记得点保存', 'ok');
    };
    let rebuiltCardRead = null;

    const hint = el('p', { class: 'hint' },
      '全站兜底默认动作：对任何站点都生效，仅当某站点的自身规则在该阶段无设置时才触发，相当于全局默认设置（EO 的全局规则概念）。本抽屉只编辑「' + effOpts.title + '」这一阶段的默认动作（每阶段恰好 1 条、无条件），保存即覆盖该阶段默认值。');

    const body = el('div', { class: 'drawer-body' }, [
      hint,
      el('div', { class: 'subhead' }, [el('span', {}, '全站兜底默认 · ' + effOpts.title), resetBtn]),
      rulesBox,
    ]);

    const onSave = async () => {
      const editedAction = (rebuiltCardRead || read)();
      const nextStages = { ...stages };
      nextStages[effStage] = actionToGlobalStage(effStage, editedAction.action || {});
      try {
        await API.rules.saveGlobal({ stages: nextStages });
        toast('已保存全站兜底默认', 'ok');
        // 同步本地缓存，避免保存后回看仍是旧值（保持引用，清空后复制）
        for (const k of Object.keys(globalStages)) delete globalStages[k];
        Object.assign(globalStages, nextStages);
        refreshData();
      } catch (e) {
        toast('保存失败：' + (e && e.message ? e.message : '未知错误'), 'err');
      }
    };

    openDrawer('全站兜底默认 · ' + effOpts.title, '编辑该阶段对所有站点生效的默认动作（兜底）', body, onSave);
  }

  /**
   * 「全站独有阶段」参数抽屉（匹配站点 / 安全校验 / 错误处理）。
   *
   * 这三个阶段承载的是跨请求、全站维度的参数（默认协议、限速阈值、拦截响应与错误文案），
   * 天然没有「匹配条件 + 动作」的结构，所以不用规则卡片，而是按字段渲染成一张普通表单。
   * 字段定义来自 GLOBAL_ONLY_STAGE_OPS（与后端 src/config/stages.js 同一真相源）。
   *
   * 这些参数原先藏在后端 settings 段里——前端看不见、也没有任何入口能改，
   * 但它们确实在后端生效（比如全站默认限速、被拦截时返回什么内容）。
   * 单轨化后它们和其他阶段一样出现在「全站通用规则」里，可视、可改、可回滚。
   */
export   async function openGlobalOnlyStageDrawer(stage) {
    const meta = GLOBAL_ONLY_STAGE_OPS[stage];
    if (!meta) { toast('未知的全站阶段：' + stage, 'err'); return; }

    // 读取全站阶段映射（优先用已预取的 globalStages，缺失再拉一次保证新鲜）
    let stages = globalStages || {};
    if (!stages[stage]) {
      try {
        const data = await API.rules.global();
        stages = (data && data.stages) || {};
      } catch (e) {
        toast('读取全站通用规则失败：' + (e && e.message ? e.message : '未知错误'), 'err');
        return;
      }
    }
    const cur = (stages[stage] && typeof stages[stage] === 'object') ? stages[stage] : {};

    /** 按点号路径取值（支持 messages.internal 这类嵌套字段） */
    const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
    /** 按点号路径写值，自动补建中间对象 */
    const setPath = (obj, path, val) => {
      const keys = path.split('.');
      let cursor = obj;
      for (let i = 0; i < keys.length - 1; i++) {
        if (!cursor[keys[i]] || typeof cursor[keys[i]] !== 'object') cursor[keys[i]] = {};
        cursor = cursor[keys[i]];
      }
      cursor[keys[keys.length - 1]] = val;
    };

    /** @type {Array<{path:string, type:string, input:HTMLElement}>} */
    const bound = [];
    const fields = (meta.fields || []).map((f) => {
      const cv = getPath(cur, f.path);
      let input;
      if (f.type === 'select') {
        input = select('', f.options || [], cv == null ? '' : String(cv));
        input.className = 'input';
      } else if (f.type === 'number') {
        input = el('input', {
          class: 'input',
          type: 'number',
          value: cv == null ? '' : String(cv),
          ...(f.min !== undefined ? { min: String(f.min) } : {}),
          ...(f.max !== undefined ? { max: String(f.max) } : {}),
        });
      } else if (f.type === 'textarea') {
        input = el('textarea', { class: 'input', rows: '8', value: cv == null ? '' : String(cv) });
      } else {
        input = el('input', { class: 'input', value: cv == null ? '' : String(cv) });
      }
      bound.push({ path: f.path, type: f.type, input });

      // 数字字段附带「人类可读时长」提示：600000 毫秒到底是多久，光看数字很难有体感
      const extras = [];
      if (f.type === 'number' && /Ms$/.test(f.path)) {
        const dur = el('div', { class: 'field-hint muted' });
        const sync = () => {
          const n = Number(input.value);
          dur.textContent = Number.isFinite(n) && n > 0 ? '≈ ' + humanDuration(Math.round(n / 1000)) : '';
        };
        input.addEventListener('input', sync);
        sync();
        extras.push(dur);
      } else if (f.type === 'number' && /Sec$/.test(f.path)) {
        const dur = el('div', { class: 'field-hint muted' });
        const sync = () => {
          const n = Number(input.value);
          dur.textContent = Number.isFinite(n) && n > 0 ? '≈ ' + humanDuration(n) : '';
        };
        input.addEventListener('input', sync);
        sync();
        extras.push(dur);
      }
      return field(f.label, input, f.hint || '', extras);
    });

    const resetBtn = el('button', { class: 'btn btn-sm', text: '↺ 恢复内置默认' });
    resetBtn.onclick = () => {
      // 清空全部输入：保存时后端 validateGlobalOnlyStage 会用内置默认逐字段补全，
      // 因此「清空 + 保存」等价于恢复该阶段内置默认，无需前端再抄一份默认值（避免双份真相源）。
      bound.forEach((b) => {
        if (b.type === 'select') return;
        b.input.value = '';
        b.input.dispatchEvent(new Event('input'));
      });
      toast('已清空，保存后将恢复内置默认', 'ok');
    };

    const body = el('div', { class: 'drawer-body' }, [
      el('p', { class: 'hint' },
        '这一组参数对所有站点生效，属于全站基线设置（不能按 URL 差异化，所以不放在路由规则里）。留空的字段保存时会自动填回内置默认值。'),
      el('div', { class: 'subhead' }, [el('span', {}, '全站默认 · ' + meta.title), resetBtn]),
      el('div', {}, fields),
    ]);

    const onSave = async () => {
      const next = {};
      for (const b of bound) {
        const raw = b.input.value;
        if (b.type === 'number') {
          const n = Number(raw);
          // 空值/非法值不写入 → 交给后端补内置默认（宽进严出，避免前端塞进 NaN）
          if (raw !== '' && Number.isFinite(n)) setPath(next, b.path, n);
        } else if (raw !== '') {
          setPath(next, b.path, raw);
        }
      }
      const nextStages = { ...stages, [stage]: next };
      try {
        const saved = await API.rules.saveGlobal({ stages: nextStages });
        toast('已保存全站默认设置', 'ok');
        // 用后端规范化后的结果回填本地缓存，避免「前端留空、后端补默认」造成的显示不一致（保持引用）
        const merged = (saved && saved.stages) || nextStages;
        for (const k of Object.keys(globalStages)) delete globalStages[k];
        Object.assign(globalStages, merged);
        refreshData();
      } catch (e) {
        toast('保存失败：' + (e && e.message ? e.message : '未知错误'), 'err');
      }
    };

    openDrawer('全站默认 · ' + meta.title, '编辑对所有站点生效的全站基线参数', body, onSave);
  }

  // ⑫ 缓存键阶段的专属抽屉：清空该站点的边缘缓存。
  //
  // 底层实现是给缓存 key 加一个自增的「版本号」（旧称 cacheGen「缓存代次」）——
  // 版本号一变，所有旧 key 全部失配，等价于清空缓存。
  // 但「代次」是实现细节，用户看不懂也不需要懂，所以界面上只呈现「清空缓存」这个动作，
  // 不再让用户手填一个数字（手填还容易改小、反而让已失效的旧缓存复活）。
export   async function openCacheGenDrawer(host, cacheRuleCount, hasCache) {
    if (host === '__global__' || host === '__all__') { toast('全站通用规则请使用全站规则编辑器', 'info'); return; }
    if (!host) { toast('请先创建站点', 'err'); return; }
    let site;
    try { site = await API.sites.get(host); } catch (e) { toast(e.message, 'err'); return; }
    const curGen = Math.max(0, Number(site.cacheGen) || 0);

    const doClear = el('input', { type: 'checkbox' });
    const body = el('div', {}, [
      el('div', { class: 'subhead' }, [el('span', {}, '⑫ 缓存键 · 清空缓存')]),
      el('div', { class: 'hint' },
        '在这里可以一键清空本站点在边缘节点上的全部缓存：勾选后保存，访客的下一次访问会重新回源取最新内容。'
        + '适合刚更新了页面 / 图片、但访客还看到旧版本的情况。'),
      el('label', { class: 'check' }, [doClear, el('span', { text: '清空该站点的全部边缘缓存（立即生效，不可撤销）' })]),
      el('div', { class: 'hint' },
        `当前缓存版本：第 ${curGen + 1} 版（已清空过 ${curGen} 次）。清空不会改动任何缓存策略，只是让旧缓存立刻失效。`),
      el('div', { class: 'hint' },
        `本站点的缓存规则共 ${cacheRuleCount} 条${hasCache ? '（已启用节点缓存）' : '（未启用节点缓存，清空后也不会产生新缓存）'}。`
        + '缓存时长、是否缓存等设置属于「Cache Rules（缓存规则）」阶段，请到该阶段的规则抽屉里调整。'),
    ]);
    openDrawer('⑫ 缓存键: ' + host, '一键清空本站点的边缘缓存。', body, async () => {
      if (!doClear.checked) { toast('未勾选「清空缓存」，无改动', 'info'); return; }
      // 版本号只增不减：递增即代表清空一次。绝不允许回退，否则旧缓存会「复活」。
      try {
        await API.sites.saveBasics(host, { cacheGen: curGen + 1 });
        toast('已清空该站点缓存，访客下次访问将重新回源', 'ok');
        await refreshData();
      } catch (e) { toast(e.message, 'err'); }
    });
  }

