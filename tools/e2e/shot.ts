/**
 * Takes a screenshot of the running game in headless Chromium.
 *
 *   npm run shot -- --q "?debug=1" --out .shots/boot.png --w 844 --h 390 --wait 800
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { launchBrowser, openPage, startServer } from './harness';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  return v ?? fallback;
}

const query = arg('q', '');
const out = arg('out', '.shots/shot.png');
const width = Number(arg('w', '844'));
const height = Number(arg('h', '390'));
const dpr = Number(arg('dpr', '1'));
const waitMs = Number(arg('wait', '800'));

const server = await startServer();
const browser = await launchBrowser();
try {
  const { page, errors } = await openPage(browser, `${server.url}/${query}`, { width, height, dpr });
  await page.waitForTimeout(waitMs);
  mkdirSync(dirname(out), { recursive: true });
  await page.screenshot({ path: out });
  console.log(`saved ${out} (${width}x${height}@${dpr})`);
  if (errors.length) {
    console.error(`\n${errors.length} error(s):\n- ${errors.join('\n- ')}`);
    process.exitCode = 1;
  }
} finally {
  await browser.close();
  await server.close();
}
