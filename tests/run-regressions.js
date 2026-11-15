import { spawn } from 'node:child_process';
import * as http from 'node:http';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function reservePort() {
  const server = createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

async function waitForServer(url, child) {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (child.exitCode !== null) throw new Error(`server exited early (${child.exitCode})`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('server did not become ready');
}

function requestStatus(port, requestPath) {
  return new Promise((resolve, reject) => {
    const request = http.request({ hostname: '127.0.0.1', port, path: requestPath }, response => {
      response.resume();
      resolve(response.statusCode);
    });
    request.on('error', reject);
    request.end();
  });
}
const port = await reservePort();
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [path.join(root, 'server.js'), String(port)], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverOutput = '';
server.stdout.setEncoding('utf8').on('data', chunk => { serverOutput += chunk; });
server.stderr.setEncoding('utf8').on('data', chunk => { serverOutput += chunk; });
let browser;
let failed = false;

function assertStatus(label, actual, expected) {
  const pass = actual === expected;
  console.log(`${pass ? 'PASS' : 'FAIL'} ${label}: HTTP ${actual}, expected ${expected}`);
  if (!pass) failed = true;
}

try {
  await waitForServer(`${baseUrl}/`, server);
  assertStatus('root document', (await fetch(`${baseUrl}/`)).status, 200);
  assertStatus('asset manifest', (await fetch(`${baseUrl}/assets/manifest.json`)).status, 200);
  assertStatus('missing path', (await fetch(`${baseUrl}/not-found`)).status, 404);
  assertStatus('malformed percent escape', await requestStatus(port, '/%E0%A4%A'), 400);
  assertStatus('encoded directory traversal', await requestStatus(port, '/%2e%2e%2f..%2foutside'), 403);

  browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', error => { failed = true; console.error(`FAIL browser page error: ${error.message}`); });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__game?.state === 'menu', null, { timeout: 30000 });

  await page.addScriptTag({ url: `${baseUrl}/tests/automated-tests.js` });
  const integration = await page.evaluate(() => window.MetroTests.runAll(window.__game));
  console.log(`Automated regression suite: ${integration.passed}/${integration.total}`);
  for (const result of integration.results) {
    console.log(`${result.pass ? 'PASS' : 'FAIL'} ${result.name}${result.detail ? ` — ${result.detail}` : ''}`);
    if (!result.pass) failed = true;
  }

  await page.addScriptTag({ url: `${baseUrl}/tests/character-assets.js` });
  await page.evaluate(() => window.MetroCharTests.ready);
  const characters = await page.evaluate(() => window.MetroCharTests.runAll(window.__game));
  console.log(`Character asset regression suite: ${characters.filter(result => result.pass).length}/${characters.length}`);
  for (const result of characters) {
    console.log(`${result.pass ? 'PASS' : 'FAIL'} ${result.name}${result.detail ? ` — ${result.detail}` : ''}`);
    if (!result.pass) failed = true;
  }

  const combat = await page.evaluate(async () => {
    const { runCombatObstructionTests } = await import('/tests/combat-obstruction.js');
    return runCombatObstructionTests();
  });
  console.log(`Combat obstruction regression suite: ${combat.passed}/${combat.total}`);
  for (const result of combat.results) {
    console.log(`${result.pass ? 'PASS' : 'FAIL'} ${result.name}${result.error ? ` — ${result.error}` : ''}`);
    if (!result.pass) failed = true;
  }
} catch (error) {
  failed = true;
  console.error(`FAIL regression runner: ${error.stack || error}`);
  if (serverOutput) console.error(serverOutput);
} finally {
  if (browser) await browser.close();
  server.kill();
}

if (failed) process.exitCode = 1;
