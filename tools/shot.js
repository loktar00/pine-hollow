// shot.js <url> <steps.json> <outdir> [w h] -- headless driver for screenshots and smoke checks (npm i playwright).
// steps: ["wait",ms] ["shot","name"] ["eval","js"] ["fps",ms] ["click"] ["waitfor","js-expr",timeoutMs]
const { chromium } = require('playwright');
const LAUNCH = { headless: true, args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization'] };
(async () => {
  const url = process.argv[2], steps = JSON.parse(require('fs').readFileSync(process.argv[3], 'utf8')), out = process.argv[4];
  const W = +(process.argv[5] || 1920), H = +(process.argv[6] || 1080);
  const browser = await chromium.launch({ ...LAUNCH, args: [...LAUNCH.args, '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push('[' + m.type() + '] ' + m.text()); });
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 5).join('\n')));
  page.on('requestfailed', r => errors.push('[requestfailed] ' + r.url()));
  page.on('response', r => { if (r.status() >= 400) errors.push('[http ' + r.status() + '] ' + r.url()); });
  await page.goto(url, { waitUntil: 'load' });
  for (const s of steps) {
    if (s[0] === 'goto') await page.goto(url + s[1], { waitUntil: 'load' });
    else if (s[0] === 'wait') await page.waitForTimeout(s[1]);
    else if (s[0] === 'shot') await page.screenshot({ path: out + '/' + s[1] + '.png' });
    else if (s[0] === 'click') await page.mouse.click(W / 2, H / 2);
    else if (s[0] === 'eval') { try { console.log('eval', JSON.stringify(await page.evaluate(s[1]))); } catch (e) { console.log('eval err', e.message); } }
    else if (s[0] === 'waitfor') { try { await page.waitForFunction(s[1], null, { timeout: s[2] || 30000, polling: 50 }); } catch (e) { console.log('waitfor timeout', s[1]); } }
    else if (s[0] === 'fps') console.log('fps', await page.evaluate((ms) => new Promise(r => { let n = 0; const a = performance.now(); const k = () => { n++; if (performance.now() - a < ms) requestAnimationFrame(k); else r(Math.round(n * 1000 / (performance.now() - a) * 10) / 10); }; requestAnimationFrame(k); }), s[1] || 3000));
  }
  console.log('errors', JSON.stringify(errors, null, 1));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
