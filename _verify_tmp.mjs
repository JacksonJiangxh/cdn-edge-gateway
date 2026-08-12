import('./src/ui.gen.js').then((m) => {
  const h = m.UI_HTML;
  console.log('UI_HTML type:', typeof h, 'len:', h.length);
  console.log('is base64-like?', /^[A-Za-z0-9+/=]+$/.test(h.slice(0, 50)));
  console.log('looks like HTML?', /<!DOCTYPE|<html/i.test(h));
  console.log('has <script>?', /<script/i.test(h));
  console.log('has </body>?', /<\/body>/i.test(h));
  console.log('UI_CSS type:', typeof m.UI_CSS, 'len:', m.UI_CSS.length);
  // 关键：确认 UI_HTML 里的内联脚本可被 esbuild 解析（模拟 syntaxChecks）
  const mScript = h.match(/<script>([\s\S]*?)<\/script>/i);
  console.log('inline script extracted len:', mScript ? mScript[1].length : 'NONE');
}).catch((e) => { console.error('ERR', e.message); process.exit(1); });
