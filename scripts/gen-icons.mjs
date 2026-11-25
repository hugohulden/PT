// Genererar app-ikoner och iOS-startskärmar från SVG med Playwright.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
import { mkdirSync } from 'node:fs';

const icon = (pad = 0) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FF3D8B"/><stop offset=".55" stop-color="#F7A8C4"/><stop offset="1" stop-color="#CDB4F5"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#g)"/>
  <g transform="translate(${256} ${256}) scale(${1 - pad}) translate(-256 -256)">
    <path d="M256 418c-12 0-150-86-174-170-16-56 18-118 80-118 40 0 72 24 94 56 22-32 54-56 94-56 62 0 96 62 80 118-24 84-162 170-174 170z" fill="#fff" opacity=".95"/>
    <g fill="#FF3D8B">
      <rect x="150" y="232" width="212" height="24" rx="12"/>
      <rect x="130" y="196" width="34" height="96" rx="14"/>
      <rect x="348" y="196" width="34" height="96" rx="14"/>
      <rect x="104" y="214" width="26" height="60" rx="11"/>
      <rect x="382" y="214" width="26" height="60" rx="11"/>
    </g>
  </g>
</svg>`;

const browser = await chromium.launch();
const page = await browser.newPage();
mkdirSync('public/icons', { recursive: true });
mkdirSync('public/splash', { recursive: true });

async function shot(html, w, h, path) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<html><body style="margin:0">${html}</body></html>`);
  await page.screenshot({ path, omitBackground: false });
}
const sq = (svg, s) => svg.replace('<svg ', `<svg width="${s}" height="${s}" `);

await shot(sq(icon(), 192), 192, 192, 'public/icons/icon-192.png');
await shot(sq(icon(), 512), 512, 512, 'public/icons/icon-512.png');
await shot(sq(icon(0.22), 512), 512, 512, 'public/icons/icon-maskable-512.png');
await shot(sq(icon(), 180), 180, 180, 'public/icons/apple-touch-icon.png');

const sizes = [[1170,2532],[1179,2556],[1290,2796],[1206,2622],[1320,2868],[1125,2436],[828,1792],[750,1334]];
for (const [w, h] of sizes) {
  const s = Math.round(w * 0.32);
  const html = `<div style="width:${w}px;height:${h}px;display:flex;flex-direction:column;align-items:center;justify-content:center;background:linear-gradient(160deg,#FFE3EE,#F7A8C4 60%,#CDB4F5);font-family:system-ui;color:#5A1F4B">
    <div style="width:${s}px;height:${s}px;border-radius:${s*0.22}px;overflow:hidden;box-shadow:0 20px 60px rgba(90,31,75,.25)">${sq(icon(), s)}</div>
    <div style="margin-top:${w*0.06}px;font-size:${w*0.07}px;font-weight:700">Nellies träning</div></div>`;
  await shot(html, w, h, `public/splash/splash-${w}x${h}.png`);
}
await browser.close();
console.log('Ikoner och startskärmar klara');
