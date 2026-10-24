import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ChromeVisualBrowser, findChrome } from '../../archify/bin/visual-check.mjs';

const website = fileURLToPath(new URL('../', import.meta.url));
const enabled = process.env.ARCHIFY_SITE_INTEGRATION === '1';
const root = path.resolve(process.env.ARCHIFY_SITE_ROOT || path.join(website, 'dist'));
const mount = process.env.ARCHIFY_SITE_BASE ?? '/archify';
const extension = mount ? '.html' : '';

test('real Chrome: Architecture Center filters the catalog and diagram pages forward focus to the artifact', {
  skip: enabled ? false : 'Set ARCHIFY_SITE_INTEGRATION=1 and ARCHIFY_CHROME to run Architecture Center browser evidence.',
  timeout: 120000,
}, async () => {
  const chrome = findChrome();
  assert.ok(chrome, 'The Architecture Center gate requires usable Chrome.');
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (mount && !url.pathname.startsWith(`${mount}/`)) return response.writeHead(404).end();
    let relative = url.pathname.slice(mount.length).replace(/^\/+/, '') || 'index.html';
    if (!path.extname(relative)) relative += '.html';
    const file = path.resolve(root, relative);
    if (!file.startsWith(`${root}${path.sep}`)) return response.writeHead(404).end();
    try {
      const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json' };
      response.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
      response.end(fs.readFileSync(file));
    } catch { response.writeHead(404).end(); }
  });
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}${mount}`;
    browser = new ChromeVisualBrowser(chrome);
    const session = await browser.sessionPromise;
    const evaluate = async expression => {
      const result = await browser.cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, session);
      assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    const open = async url => {
      const loaded = browser.cdp.waitFor('Page.loadEventFired', session);
      loaded.catch(() => {});
      await browser.cdp.send('Page.navigate', { url }, session);
      await loaded;
    };
    await browser.cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, session);

    // A role link preselects its facet; facets AND across groups, OR within one.
    await open(`${origin}/architecture${extension}?role=architect#catalog`);
    const catalog = await evaluate(`(() => {
      const visible = () => [...document.querySelectorAll('.result-card')].filter(card => !card.hidden);
      const architect = visible().map(card => card.dataset.role.split(' ').includes('architect'));
      const box = (facet, value) => document.querySelector('input[data-facet="' + facet + '"][value="' + value + '"]');
      box('document', 'SDD').click();
      const architectSdd = visible().map(card => card.dataset.document.split(' ').includes('SDD') && card.dataset.role.split(' ').includes('architect'));
      document.querySelector('[data-facet-clear]').click();
      return {
        roleChecked: box('role', 'architect').checked === false,
        architect, architectSdd,
        total: document.querySelectorAll('.result-card').length,
        afterClear: visible().length,
        status: document.querySelector('[data-catalog-status]').textContent,
      };
    })()`);
    assert.ok(catalog.architect.length > 0 && catalog.architect.every(Boolean), 'role filter keeps only architect diagrams');
    assert.ok(catalog.architectSdd.length > 0 && catalog.architectSdd.every(Boolean), 'facets combine across groups');
    assert.equal(catalog.afterClear, catalog.total);
    assert.match(catalog.status, new RegExp(`${catalog.total} of ${catalog.total}`));

    // The diagram page embeds the reference preset and forwards #focus to it.
    await open(`${origin}/packs/careslot/c4-containers${extension}#focus=booking-api`);
    const frame = await evaluate(`(() => {
      const iframe = document.getElementById('ac-artifact-frame');
      const src = new URL(iframe.getAttribute('src'), location.href);
      return { path: src.pathname, preset: src.searchParams.get('preset'), embed: src.searchParams.get('embed'), hash: src.hash,
        crumbs: document.querySelector('.ac-crumbs').textContent.replace(/\\s+/g, ' ').trim(),
        current: document.querySelector('.site-nav .nav-link[aria-current="page"]').textContent.trim(),
        refinedBy: [...document.querySelectorAll('.ac-side a')].map(a => a.textContent.trim()).filter(text => text.startsWith('↓')) };
    })()`);
    assert.ok(frame.path.endsWith('/packs/careslot/artifacts/c4-containers.html'), frame.path);
    assert.equal(frame.preset, 'reference');
    assert.equal(frame.embed, '1');
    assert.equal(frame.hash, '#focus=booking-api');
    assert.match(frame.crumbs, /Architecture Center › CareSlot design documents › SAD · Containers/);
    assert.equal(frame.current, 'Architecture');
    assert.ok(frame.refinedBy.some(text => /Booking API Components/.test(text)), JSON.stringify(frame.refinedBy));
  } finally {
    await browser?.close();
    server.close();
  }
});
