// Local browser smoke with synthetic catalogue data. All non-local requests and
// every local API call are intercepted; this never signs into a real account.
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';

if (!process.argv[2]) throw Error('Informe o módulo Playwright e a URL local.');
const { chromium } = await import(pathToFileURL(path.resolve(process.argv[2])).href);
const base = new URL(process.argv[3] || 'http://127.0.0.1:3111');
if (!['127.0.0.1', 'localhost'].includes(base.hostname)) throw Error('Somente servidor local permitido.');
const browser = await chromium.launch({ headless: true, ...(process.env.VOID_TEST_BROWSER ? { executablePath: process.env.VOID_TEST_BROWSER } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const errors = [];
const movie = { id: 123, categoria: 'filmes', titulo: 'Filme de teste', estreia: '2020-01-01', ano: '2020', sinopse: 'Fixture sintética para auditoria.', poster: null, backdrop: null };
const json = (route, data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
try {
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.pathname.includes('/auth/v1/token')) return json(route, { error: 'invalid_grant', error_code: 'invalid_credentials', code: 'invalid_credentials', message: 'Invalid login credentials', msg: 'Invalid login credentials' }, 400);
    if (url.origin !== base.origin) return json(route, {}, 503);
    if (url.pathname === '/api/obra') return json(route, { obra: movie });
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/_next/image')) return json(route, {}, 503);
    return route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.cspViolations = [];
    document.addEventListener('securitypolicyviolation', event => window.cspViolations.push(event.effectiveDirective));
  });
  const response = await page.goto(base.href + 'conta', { waitUntil: 'networkidle' });
  assert.equal(response.status(), 200);
  const headers = await response.allHeaders();
  assert.equal(headers['x-content-type-options'], 'nosniff');
  assert.equal(headers['x-frame-options'], 'DENY');
  assert.ok(headers['content-security-policy'].includes("object-src 'none'"));
  assert.ok(headers['content-security-policy'].includes("script-src 'self';"));
  await page.locator('input[type=email]').waitFor();
  const screenshot = process.env.VOID_TEST_SCREENSHOT || 'tmp/publication-account.jpg';
  await mkdir(path.dirname(screenshot), { recursive: true });
  await page.screenshot({ path: screenshot, type: 'jpeg', quality: 85, fullPage: true });
  await page.locator('input[type=email]').fill('browser@example.test');
  await page.locator('input[type=password]').fill('synthetic-password');
  await page.locator('button[type=submit]').click();
  try { await page.getByText(/E-mail ou senha incorretos/).waitFor({ timeout: 8000 }); }
  catch (error) { console.error((await page.locator('body').innerText()).slice(-2500)); throw error; }
  await page.goto(base.href + 'avaliar?categoria=filmes&id=123', { waitUntil: 'networkidle' });
  await page.getByLabel('Nota exata', { exact: false }).fill('4,2');
  await page.locator('#texto').fill('<script>window.unexpectedExecution=true</script> Review sintética.');
  await page.getByRole('button', { name: /Salvar avaliação/ }).click();
  await page.getByText('Avaliação salva com sucesso.', { exact: true }).waitFor();
  const review = await page.evaluate(() => JSON.parse(localStorage.getItem('void:reviews:v1'))['filmes:123']);
  assert.equal(review.nota, 4.2);
  assert.equal(await page.evaluate(() => window.unexpectedExecution), undefined);
  await page.reload({ waitUntil: 'networkidle' });
  assert.ok(await page.getByText('Filme de teste', { exact: true }).count());
  assert.equal(await page.evaluate(() => window.unexpectedExecution), undefined);
  await page.goto(base.href + 'listas?tab=mine', { waitUntil: 'networkidle' });
  await page.getByRole('link', { name: /Ver depois/ }).first().waitFor();
  assert.deepEqual(await page.evaluate(() => window.cspViolations), [], 'Normal UI must not violate the CSP');
  await page.evaluate(() => {
    const script = document.createElement('script');
    script.textContent = 'window.inlineScriptExecuted = true';
    document.body.appendChild(script);
  });
  await page.waitForFunction(() => window.cspViolations.includes('script-src-elem'));
  assert.equal(await page.evaluate(() => window.inlineScriptExecuted), undefined);
  assert.deepEqual(errors, []);
  console.log('Browser smoke passou: login inválido simulado, headers, review visitante 4,2/5 persistida após reload, texto sem execução de script e navegação de listas. Sem serviços remotos.');
} finally { await context.close(); await browser.close(); }
