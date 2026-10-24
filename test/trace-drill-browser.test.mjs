import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ChromeVisualBrowser, findChrome } from '../archify/bin/visual-check.mjs';
import { createScratchDirectory } from './helpers/scratch-directory.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'archify/bin/archify.mjs');
const skip = process.env.ARCHIFY_CHROME ? false : 'Set ARCHIFY_CHROME to run trace browser checks.';

function renderArtifact(directory, meta) {
  const diagram = JSON.parse(fs.readFileSync(path.join(root, 'archify/examples/production-deployment.architecture.json'), 'utf8'));
  diagram.meta = { ...diagram.meta, output: 'trace.html', ...meta };
  const input = path.join(directory, 'input.json');
  const artifactPath = path.join(directory, 'trace.html');
  fs.writeFileSync(input, JSON.stringify(diagram));
  const result = spawnSync(process.execPath, [cli, 'render', 'architecture', input, artifactPath], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return artifactPath;
}

async function evaluate(browser, expression) {
  const sessionId = await browser.sessionPromise;
  const response = await browser.cdp.send('Runtime.evaluate', { expression, returnByValue: true }, sessionId);
  assert.equal(response.exceptionDetails, undefined, JSON.stringify(response.exceptionDetails));
  return response.result.value;
}

async function navigate(browser, url) {
  const sessionId = await browser.sessionPromise;
  await browser.cdp.send('Page.navigate', { url }, sessionId);
  for (let attempt = 0; attempt < 100; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    const ready = await evaluate(browser, `location.href === ${JSON.stringify(url)} && document.readyState === 'complete' && Boolean(window.Archify && Archify.preset)`);
    if (ready) return;
  }
  assert.fail(`timed out loading ${url}`);
}

test('node panel lists authored drill-down links and the header names the viewpoint', { skip, timeout: 60000 }, async () => {
  const directory = createScratchDirectory(path.join(os.tmpdir(), 'archify-trace-browser-'));
  const artifactPath = renderArtifact(directory, {
    viewpoint: { level: 'system', concern: 'structure', c4_level: 'container', status: 'current' },
    trace: {
      id: 'deployment-view',
      drills_into: [{ node: 'gateway', target: 'gateway-components.html', focus: 'router', label: 'Gateway components' }],
    },
  });
  const browser = new ChromeVisualBrowser(findChrome());
  try {
    await browser.inspect({ artifactPath, width: 1440, height: 900, theme: 'light' });
    const observed = await evaluate(browser, `(() => {
      const select = (id) => document.querySelector('[data-node-id="' + id + '"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      select('gateway');
      const panel = document.getElementById('focus-drill');
      const links = [...panel.querySelectorAll('a')].map((a) => ({
        href: a.getAttribute('href'), target: a.target, text: a.querySelector('strong').textContent, aria: a.getAttribute('aria-label'),
      }));
      const shownForGateway = !panel.hidden;
      select('clients');
      return { links, shownForGateway, shownForClients: !panel.hidden, chip: document.getElementById('viewpoint-chip').textContent };
    })()`);
    assert.deepEqual(observed.links, [{
      href: 'gateway-components.html#focus=router',
      target: '_top',
      text: 'Gateway components',
      aria: 'Open detailed diagram: Gateway components',
    }]);
    assert.equal(observed.shownForGateway, true);
    assert.equal(observed.shownForClients, false);
    assert.equal(observed.chip, 'System · Structure · C4 L2 Container · Current');
  } finally { await browser.close(); }
});

test('embedded artifacts honour a first-paint reference preset request', { skip, timeout: 60000 }, async () => {
  const directory = createScratchDirectory(path.join(os.tmpdir(), 'archify-trace-browser-'));
  const artifactPath = renderArtifact(directory, {});
  const browser = new ChromeVisualBrowser(findChrome());
  try {
    await browser.inspect({ artifactPath, width: 1200, height: 800, theme: 'dark' });
    const url = pathToFileURL(artifactPath);
    url.searchParams.set('embed', '1');
    url.searchParams.set('preset', 'reference');
    await navigate(browser, url.href);
    const observed = await evaluate(browser, `({
      html: document.documentElement.getAttribute('data-preset'),
      svg: document.querySelector('.diagram-container svg').getAttribute('data-preset'),
      theme: document.documentElement.getAttribute('data-theme'),
      background: getComputedStyle(document.body).backgroundColor,
    })`);
    assert.deepEqual(observed, { html: 'reference', svg: 'reference', theme: 'light', background: 'rgb(255, 255, 255)' });

    // Unknown requests are ignored and the authored preset stays in effect.
    url.searchParams.set('preset', 'javascript:alert(1)');
    await navigate(browser, url.href);
    assert.equal(await evaluate(browser, `document.documentElement.getAttribute('data-preset')`), 'blueprint');
  } finally { await browser.close(); }
});
