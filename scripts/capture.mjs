import puppeteer from 'puppeteer-core';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const screenshotsDir = path.resolve(__dirname, '../docs/screenshots');

async function run() {
  console.log('Launching headless Chrome...');
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 900, deviceScaleFactor: 1 });

  console.log('Navigating to http://localhost:3000/ ...');
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle0' });

  // Wait for game to initialize
  await page.waitForFunction(() => window.game && window.game.state === 'MENU', { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 1500));

  const canvas = await page.$('#game-canvas');
  if (!canvas) throw new Error('#game-canvas not found');

  // 1. Menu
  console.log('Capturing menu.png...');
  await canvas.screenshot({ path: path.join(screenshotsDir, 'menu.png') });

  // 2. Level Select
  console.log('Capturing level_select.png...');
  await page.evaluate(() => {
    window.game.state = 'LEVEL_SELECT';
    if (window.game.levelSelectScene && window.game.levelSelectScene.onEnter) {
      window.game.levelSelectScene.onEnter();
    }
  });
  await new Promise((r) => setTimeout(r, 1200));
  await canvas.screenshot({ path: path.join(screenshotsDir, 'level_select.png') });

  // Eras
  const eras = [
    { id: 'prehistory', file: 'gameplay_prehistory.png' },
    { id: 'egypt', file: 'gameplay_egypt.png' },
    { id: 'castle', file: 'gameplay_castle.png' },
    { id: 'pirates', file: 'gameplay_pirates.png' },
    { id: 'future', file: 'gameplay_future.png' }
  ];

  for (const era of eras) {
    console.log(`Starting level: ${era.id}...`);
    await page.evaluate(async (eraId) => {
      await window.game.startLevel(eraId, 0, 10);
    }, era.id);
    // Allow player & map to render and settle
    await new Promise((r) => setTimeout(r, 2000));
    console.log(`Capturing ${era.file}...`);
    await canvas.screenshot({ path: path.join(screenshotsDir, era.file) });
  }

  await browser.close();
  console.log('All fresh screenshots captured successfully!');
}

run().catch((err) => {
  console.error('Error capturing screenshots:', err);
  process.exit(1);
});
