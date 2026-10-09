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
const CR = String.fromCharCode(13);

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
    // favicon.svg is a text asset: the committed blob is LF, but a Windows checkout with
    // core.autocrlf may materialise CRLF on disk. Strip CR before hashing so the guard
    // compares the LF bytes that ship in the build, not the checkout's line endings.
    const svg = Buffer.from(
      read(path.join(brandDir, 'favicon.svg')).toString('utf8').split(CR).join(''),
      'utf8'
    ).toString('base64');

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

  it('renders the sidebar EX tag as theme-independent DOM text, not baked pixels', () => {
    const layout = read(
      path.resolve(repoRoot, 'apps/web/src/components/layout/MainLayout.tsx')
    ).toString('utf8');
    // The 30x32 sidebar raster bakes an EX chip that is only ~5px tall, so the
    // sidebar must carry a crisp DOM tag anchored to the symbol's corner.
    expect(layout).toContain('className="sidebar-brand-symbol-wrap"');
    expect(layout).toContain('className="sidebar-brand-ex"');

    const scss = read(path.resolve(repoRoot, 'apps/web/src/styles/layout.scss')).toString('utf8');
    expect(scss).toContain('.sidebar-brand-symbol-wrap');
    expect(scss).toMatch(/\.sidebar-brand-ex\s*\{[^}]*position:\s*absolute[^}]*\}/s);
    expect(scss).toMatch(/\.sidebar-brand-ex\s*\{[^}]*background:\s*#005cff/s);
  });

  it('keeps the baked EX chip large enough relative to icon-like assets', () => {
    // v1 used 0.26 * shorter side; the final acceptance round required a bigger,
    // bolder corner chip so it still resolves at small render sizes.
    const symbol = read(path.join(brandDir, 'cpamp-symbol-color.svg')).toString('utf8');
    const rect = symbol.match(/<rect x="([\d.]+)"[^>]*?\bwidth="([\d.]+)"/);
    expect(rect).not.toBeNull();
    const [, , width] = rect;
    // cpamp-symbol-color.svg viewBox is 272 wide (shorter side).
    expect(Number(width)).toBeGreaterThanOrEqual(272 * 0.28);
  });
});
