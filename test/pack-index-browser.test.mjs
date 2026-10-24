import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ChromeVisualBrowser, findChrome } from '../archify/bin/visual-check.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skip = process.env.ARCHIFY_CHROME ? false : 'Set ARCHIFY_CHROME to run pack index browser checks.';
const indexUrl = (pack) => pathToFileURL(path.join(root, 'docs/packs', pack, 'artifacts/index.html')).href;

async function withBrowser(run) {
  const browser = new ChromeVisualBrowser(findChrome());
  try {
    const session = await browser.sessionPromise;
    await browser.cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, session);
    const evaluate = async (expression) => {
      const result = await browser.cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, session);
      assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    const open = async (url) => {
      const loaded = browser.cdp.waitFor('Page.loadEventFired', session);
      loaded.catch(() => {});
      await browser.cdp.send('Page.navigate', { url }, session);
      await loaded;
    };
    await run({ evaluate, open });
  } finally { await browser.close(); }
}

// Resolves once the predicate is true, so hash routing has time to settle.
const until = (expression) => `new Promise((resolve, reject) => { const stop = Date.now() + 4000; (function tick() { try { if (${expression}) return resolve(true); } catch (error) { return reject(error); } if (Date.now() > stop) return reject(new Error('timed out waiting for: ' + ${JSON.stringify(expression)})); setTimeout(tick, 25); })(); })`;

test('pack index routes between the overview and diagram views and embeds the reference preset', { skip, timeout: 60000 }, async () => {
  await withBrowser(async ({ evaluate, open }) => {
    await open(indexUrl('careslot'));
    const overview = await evaluate(`({
      visible: [...document.querySelectorAll('[data-view]')].filter((view) => !view.hidden).map((view) => view.dataset.view),
      count: document.querySelector('[data-count]').textContent,
      lang: document.documentElement.lang,
      title: document.title,
    })`);
    assert.deepEqual(overview.visible, ['overview']);
    assert.equal(overview.count, 'Showing 14 of 14 diagrams');
    assert.equal(overview.lang, 'en');

    await evaluate(`document.querySelector('a.side-art[data-nav="c4-containers"]').click()`);
    await evaluate(until(`location.hash === '#a=c4-containers'`));
    const diagram = await evaluate(`(() => {
      const view = document.getElementById('view-c4-containers');
      const src = view.querySelector('iframe').getAttribute('src');
      return {
        visible: [...document.querySelectorAll('[data-view]')].filter((item) => !item.hidden).map((item) => item.dataset.view),
        src, title: document.title,
        current: [...document.querySelectorAll('[aria-current="page"]')].map((item) => item.dataset.nav),
        loadedOthers: [...document.querySelectorAll('iframe')].filter((frame) => frame.getAttribute('src')).length,
      };
    })()`);
    assert.deepEqual(diagram.visible, ['c4-containers']);
    assert.match(diagram.src, /^c4-containers\.html\?embed=1&preset=reference&theme=(light|dark)$/);
    assert.match(diagram.title, /^CareSlot Containers \(C4 L2\) — /);
    assert.ok(diagram.current.every((id) => id === 'c4-containers') && diagram.current.length >= 1);
    assert.equal(diagram.loadedOthers, 1, 'only the shown diagram is loaded');

    // A traced element changes only the fragment of the same document.
    await evaluate(`document.querySelector('#view-c4-containers .info a[href*="focus=booking-api"]').click()`);
    await evaluate(until(`location.hash === '#a=c4-containers&focus=booking-api'`));
    const focused = await evaluate(`document.querySelector('#view-c4-containers iframe').getAttribute('src')`);
    assert.match(focused, /^c4-containers\.html\?embed=1&preset=reference&theme=(light|dark)#focus=booking-api$/);

    // Unknown routes, including prototype names, fall back to the overview.
    await evaluate(`location.hash = '#a=constructor'`);
    await evaluate(until(`!document.querySelector('[data-view="overview"]').hidden`));
    await evaluate(`location.hash = '#a=nope'`);
    await evaluate(until(`!document.querySelector('[data-view="overview"]').hidden`));
  });
});

test('pack index facets narrow across groups, widen within one, and clear', { skip, timeout: 60000 }, async () => {
  await withBrowser(async ({ evaluate, open }) => {
    await open(indexUrl('careslot'));
    const result = await evaluate(`(() => {
      const box = (facet, value) => document.querySelector('input[data-facet="' + facet + '"][value="' + value + '"]');
      const shown = () => [...new Set([...document.querySelectorAll('.af')].filter((item) => !item.hidden).map((item) => item.dataset.nav))];
      const all = shown();
      const has = (item, facet, value) => (item.dataset[facet] || '').split(' ').includes(value);
      const items = (id) => [...document.querySelectorAll('.af[data-nav="' + id + '"]')][0];

      box('document', 'SAD').click();
      const sad = shown();
      box('document', 'SDD').click();
      const sadOrSdd = shown();
      box('level', 'implementation').click();
      const narrowed = shown();
      const status = document.querySelector('[data-count]').textContent;
      document.querySelector('[data-facet-clear]').click();
      return {
        all: all.length, sad, sadOrSdd, narrowed, status,
        sadOk: sad.every((id) => has(items(id), 'document', 'SAD')),
        narrowedOk: narrowed.every((id) => has(items(id), 'level', 'implementation') && (has(items(id), 'document', 'SAD') || has(items(id), 'document', 'SDD'))),
        cleared: shown().length,
        anyChecked: [...document.querySelectorAll('input[data-facet]')].some((input) => input.checked),
      };
    })()`);
    assert.equal(result.all, 14);
    assert.ok(result.sad.length > 0 && result.sad.length < result.all && result.sadOk);
    assert.ok(result.sadOrSdd.length > result.sad.length, 'a second value in one facet widens the match');
    assert.ok(result.narrowed.length > 0 && result.narrowed.length < result.sadOrSdd.length && result.narrowedOk, 'another facet narrows it');
    assert.equal(result.status, `Showing ${result.narrowed.length} of 14 diagrams`);
    assert.equal(result.cleared, 14);
    assert.equal(result.anyChecked, false);
  });
});

test('pack index theme choice reaches the embedded diagram and the hash survives it', { skip, timeout: 60000 }, async () => {
  await withBrowser(async ({ evaluate, open }) => {
    await open(`${indexUrl('careslot')}#a=schema-booking&focus=appointments`);
    await evaluate(until(`document.querySelector('#view-schema-booking iframe').getAttribute('src')`));
    await evaluate(`document.querySelector('[data-theme-choice="dark"]').click()`);
    const dark = await evaluate(`({
      theme: document.documentElement.dataset.theme,
      src: document.querySelector('#view-schema-booking iframe').getAttribute('src'),
      pressed: document.querySelector('[data-theme-choice="dark"]').getAttribute('aria-pressed'),
    })`);
    assert.equal(dark.theme, 'dark');
    assert.equal(dark.pressed, 'true');
    assert.equal(dark.src, 'schema-booking.html?embed=1&preset=reference&theme=dark#focus=appointments');
    await evaluate(`document.querySelector('[data-theme-choice="light"]').click()`);
    assert.equal(await evaluate(`document.querySelector('#view-schema-booking iframe').getAttribute('src')`), 'schema-booking.html?embed=1&preset=reference&theme=light#focus=appointments');
  });
});

test('pack index speaks the pack locale and routes Traditional Chinese titles', { skip, timeout: 60000 }, async () => {
  await withBrowser(async ({ evaluate, open }) => {
    await open(`${indexUrl('leave-approval')}#a=biz-process`);
    const page = await evaluate(`({
      lang: document.documentElement.lang,
      count: document.querySelector('[data-count]').textContent,
      title: document.title,
      matrix: document.querySelector('#view-overview h2').textContent,
      crumb: document.querySelector('#view-biz-process .crumbs').textContent.replace(/\\s+/g, ' '),
    })`);
    assert.equal(page.lang, 'zh-TW');
    assert.equal(page.count, '顯示 14 / 14 張圖');
    assert.match(page.title, /^LeaveFlow 請假簽核業務流程 — LeaveFlow 請假簽核系統設計文件$/);
    assert.match(page.crumb, /BRD · BRD-4 請假簽核業務流程/);
    assert.equal(page.matrix, '視角矩陣');
  });
});
