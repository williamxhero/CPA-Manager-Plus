import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const brandDir = path.resolve(repoRoot, 'apps/web/src/assets/brand');
const indexPath = path.resolve(repoRoot, 'apps/web/index.html');
const faviconWeb = path.resolve(repoRoot, 'apps/web/public/favicon.ico');
const faviconServer = path.resolve(
  repoRoot,
  'apps/manager-server/internal/httpapi/web/favicon.ico'
);
const appleWeb = path.resolve(repoRoot, 'apps/web/public/apple-touch-icon.png');
const appleServer = path.resolve(
  repoRoot,
  'apps/manager-server/internal/httpapi/web/apple-touch-icon.png'
);

const SVG_MARKER = 'data-cpamp-ex="1"';
// Pillow PNG text chunks store the marker as plain bytes, so a raw scan suffices.
const PNG_MARKER = Buffer.from('cpamp-ex');
const read = (file) => readFileSync(file);

const brandSvgFiles = readdirSync(brandDir).filter((name) => name.endsWith('.svg'));
const brandPngFiles = readdirSync(brandDir).filter((name) => name.endsWith('.png'));

describe('CPAMP EX fork branding', () => {
  it('enumerates the full CPAMP brand asset set (svg + png)', () => {
    expect(brandSvgFiles.length).toBeGreaterThanOrEqual(15);
    expect(brandPngFiles.length).toBeGreaterThanOrEqual(15);
  });

  it.each(brandSvgFiles)('embeds the EX corner badge in %s', (name) => {
    expect(read(path.join(brandDir, name)).toString('utf8')).toContain(SVG_MARKER);
  });

  it.each(brandPngFiles)('embeds the EX badge marker in %s', (name) => {
    expect(read(path.join(brandDir, name)).includes(PNG_MARKER)).toBe(true);
  });

  it('keeps the favicon.ico EX build byte-identical between web and manager-server', () => {
    const web = read(faviconWeb);
    const server = read(faviconServer);
    expect(Buffer.compare(web, server)).toBe(0);
    expect(web.includes(PNG_MARKER)).toBe(true);
  });

  it('keeps the apple-touch-icon EX build byte-identical between web and manager-server', () => {
    const web = read(appleWeb);
    const server = read(appleServer);
    expect(Buffer.compare(web, server)).toBe(0);
    expect(web.includes(PNG_MARKER)).toBe(true);
  });

  it('binds every EX favicon/apple/svg fallback to the current asset bytes in index.html', () => {
    const html = read(indexPath).toString('utf8');
    const ico = read(faviconWeb).toString('base64');
    const apple = read(appleWeb).toString('base64');
    const svg = read(path.join(brandDir, 'favicon.svg')).toString('base64');

    expect(html).toContain(`data:image/x-icon;base64,${ico}`);
    expect(html).toContain(`data:image/png;base64,${apple}`);
    expect(html).toContain(`data:image/svg+xml;base64,${svg}`);
  });

  it('never stamps an EX marker onto third-party provider icons', () => {
    const iconsDir = path.resolve(repoRoot, 'apps/web/src/assets/icons');
    for (const name of readdirSync(iconsDir)) {
      if (name.startsWith('opencode-')) continue; // provider asset, still must be untouched
      const data = read(path.join(iconsDir, name));
      expect(data.includes(PNG_MARKER)).toBe(false);
      expect(data.toString('utf8').includes(SVG_MARKER)).toBe(false);
    }
  });
});
