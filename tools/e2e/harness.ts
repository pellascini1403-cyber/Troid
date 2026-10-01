import { chromium, type Browser, type Page, type ConsoleMessage } from 'playwright-core';
import { createServer, preview, type PreviewServer, type ViteDevServer } from 'vite';

/** Chromium preinstalled in the cloud container (override with TROID_CHROMIUM). */
export const CHROMIUM_PATH = process.env.TROID_CHROMIUM ?? '/opt/pw-browsers/chromium';

export interface DevServer {
  url: string;
  close(): Promise<void>;
}

/** Starts a Vite dev server on a free port for the duration of a script. */
export async function startServer(): Promise<DevServer> {
  const server: ViteDevServer = await createServer({
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 5199, strictPort: false },
  });
  await server.listen();
  const url = server.resolvedUrls?.local[0];
  if (!url) throw new Error('Vite did not report a local URL');
  return { url: url.replace(/\/$/, ''), close: () => server.close() };
}

/** Serves the PRODUCTION build (`dist/`) — proves relative base paths and copied assets work. */
export async function startPreview(): Promise<DevServer> {
  const server: PreviewServer = await preview({
    logLevel: 'error',
    preview: { host: '127.0.0.1', port: 5198, strictPort: false },
  });
  const url = server.resolvedUrls?.local[0];
  if (!url) throw new Error('Vite preview did not report a local URL');
  return { url: url.replace(/\/$/, ''), close: () => new Promise((res) => server.httpServer.close(() => res())) };
}

export async function launchBrowser(): Promise<Browser> {
  return chromium.launch({
    executablePath: CHROMIUM_PATH,
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      '--no-sandbox',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
}

export interface OpenOptions {
  width?: number;
  height?: number;
  dpr?: number;
  touch?: boolean;
}

export interface OpenedPage {
  page: Page;
  /** console.error / pageerror / failed requests collected since load. */
  errors: string[];
  warnings: string[];
}

/** iPhone-class landscape by default: the size every visual decision is validated at. */
export async function openPage(browser: Browser, url: string, opts: OpenOptions = {}): Promise<OpenedPage> {
  const context = await browser.newContext({
    viewport: { width: opts.width ?? 844, height: opts.height ?? 390 },
    deviceScaleFactor: opts.dpr ?? 1,
    hasTouch: opts.touch ?? false,
    isMobile: opts.touch ?? false,
  });
  const page = await context.newPage();
  const errors: string[] = [];
  const warnings: string[] = [];
  page.on('console', (m: ConsoleMessage) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
    else if (m.type() === 'warning') warnings.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => {
    const reason = r.failure()?.errorText ?? '';
    if (reason.includes('ERR_ABORTED')) return; // navigation / HMR reload aborting in-flight module fetches
    errors.push(`requestfailed: ${r.url()} ${reason}`);
  });
  await page.goto(url, { waitUntil: 'load' });
  return { page, errors, warnings };
}
