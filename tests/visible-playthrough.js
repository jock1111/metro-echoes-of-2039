import { spawn } from 'node:child_process';
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

try {
  await waitForServer(`${baseUrl}/`, server);
  console.log(`Server ready at ${baseUrl}`);

  // Launch VISIBLE Chromium window for real input testing
  browser = await chromium.launch({
    headless: false,
    args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--disable-dev-shm-usage'],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  page.on('console', msg => console.log(`[console] ${msg.type()}: ${msg.text()}`));
  page.on('pageerror', error => console.error(`[page error] ${error.message}`));

  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  console.log('Game loaded. Waiting for menu...');
  await page.waitForFunction(() => window.__game?.state === 'menu', null, { timeout: 30000 });

  // Click NEW GAME button - this is a real UI interaction
  console.log('Clicking NEW GAME...');
  await page.click('#btn-new');
  await page.waitForTimeout(1000); // loading delay from game

  // Wait for playing state
  await page.waitForFunction(() => window.__game?.state === 'playing', null, { timeout: 30000 });
  console.log('Game state: playing. Canvas should be visible.');

  // In a real browser, pointer lock requires a user gesture on the canvas
  // Playwright's click on canvas counts as a user gesture
  console.log('Clicking canvas to attempt pointer lock...');
  await page.click('#game-canvas');
  await page.waitForTimeout(200);

  // Verify pointer lock was acquired
  const lockState = await page.evaluate(() => ({
    pointerLockElement: document.pointerLockElement?.id || null,
    inputLocked: window.__game?.input?.locked ?? false,
    state: window.__game?.state ?? 'unknown',
    pos: window.__game?.player?.pos?.toArray?.() ?? [],
    hp: window.__game?.player?.hp ?? null,
    objective: window.__game?.mission?.currentObjective?.() ?? 'none',
  }));
  console.log('Post-click lock state:', JSON.stringify(lockState, null, 2));

  // If pointer lock acquired, attempt basic movement
  if (lockState.inputLocked) {
    console.log('Pointer lock ACQUIRED. Testing WASD movement...');
    // Press W for 2 seconds
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(2000);
    await page.keyboard.up('KeyW');
    await page.waitForTimeout(100);

    const movementCheck = await page.evaluate(() => ({
      pos: window.__game?.player?.pos?.toArray?.() ?? [],
      yaw: window.__game?.player?.yaw ?? null,
    }));
    console.log('After W press:', JSON.stringify(movementCheck, null, 2));

    // Test mouse look (relative move)
    console.log('Testing mouse look...');
    await page.mouse.move(640 + 100, 360); // move right
    await page.waitForTimeout(100);
    await page.mouse.move(640, 360); // back center
    await page.waitForTimeout(100);

    const lookCheck = await page.evaluate(() => ({
      yaw: window.__game?.player?.yaw ?? null,
      pitch: window.__game?.player?.pitch ?? null,
    }));
    console.log('After mouse move:', JSON.stringify(lookCheck, null, 2));
  } else {
    console.log('POINTER LOCK NOT ACQUIRED. Cannot proceed with movement test.');
    console.log('This confirms the known limitation: hidden/unfocused browser or missing user gesture.');
  }

  // Keep browser open for manual observation
  console.log('\n=== Browser kept open for manual inspection ===');
  console.log('Press Enter in this terminal to close...');
  await new Promise(resolve => process.stdin.once('data', resolve));
} catch (error) {
  console.error(`Error: ${error.stack || error}`);
  if (serverOutput) console.error(serverOutput);
} finally {
  if (browser) await browser.close();
  server.kill();
}