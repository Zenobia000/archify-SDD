import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parse } from 'parse5';
import { sitePages, outputFile } from '../src/data/site-urls.mjs';
import { toTraditional, toTraditionalDocument } from '../src/data/to-traditional.mjs';
import { PACKS } from '../src/data/pack-registry.mjs';

const output = new URL(process.env.ARCHIFY_SITE_TARGET === 'cloudflare' ? '../dist-cloudflare/' : '../dist/', import.meta.url);
const nodes = node => [node, ...(node.childNodes || []).flatMap(nodes)];
const attr = (node, name) => node?.attrs?.find(item => item.name === name)?.value;
const read = file => fs.readFileSync(new URL(file, output), 'utf8');

// Characters that exist only in Simplified. Traditional text must never keep one.
const SIMPLIFIED_ONLY = new Set([...'这为们项据单览阅应业务层级数实现体构验证开关传设计译图档软库载输链边缘选择记录读写网页顺让详细结编码错误运维复贴质属态协议请对话终盘庆场调试']);
// The switcher labels the other script ("简") on purpose.
const visibleText = html => {
  const dom = parse(html);
  const skip = new Set(['script', 'style']);
  const walk = node => node.nodeName === '#text' ? node.value : skip.has(node.tagName) || attr(node, 'data-language-switch') !== undefined ? '' : (node.childNodes || []).map(walk).join('');
  return walk(dom);
};

test('the converter uses Taiwan vocabulary, not just character swaps', () => {
  assert.equal(toTraditional('软件架构师'), '軟體架構師');
  assert.equal(toTraditional('设计文档与代码'), '設計文件與程式碼');
  assert.equal(toTraditional('默认配置服务器'), '預設配置伺服器');
  assert.equal(toTraditional('社区包'), '社群包');
});

test('document conversion leaves the language switcher labels untouched', () => {
  const html = '<a data-language-switch="zh" aria-label="简体中文">简</a><p>软件</p>';
  assert.equal(toTraditionalDocument(html), '<a data-language-switch="zh" aria-label="简体中文">简</a><p>軟體</p>');
});

test('built Traditional pages carry no Simplified-only characters in visible text', () => {
  for (const page of sitePages) {
    const text = visibleText(read(outputFile(page, 'zh-tw')));
    const left = [...new Set([...text].filter(character => SIMPLIFIED_ONLY.has(character)))];
    assert.deepEqual(left, [], `${page}: Simplified characters left in a Traditional page`);
  }
});

test('Traditional pages are real pages: language, canonical, switcher, in-site links', () => {
  for (const page of sitePages) {
    const file = outputFile(page, 'zh-tw');
    const dom = parse(read(file));
    const all = nodes(dom);
    assert.equal(attr(all.find(node => node.tagName === 'html'), 'lang'), 'zh-Hant', file);
    assert.equal(attr(all.find(node => node.tagName === 'meta' && attr(node, 'property') === 'og:locale'), 'content'), 'zh_TW', file);
    const links = all.filter(node => node.tagName === 'a' && attr(node, 'class')?.includes('nav-link')).map(node => attr(node, 'href'));
    for (const href of links.filter(href => !/^https?:/.test(href))) assert.match(href, /^zh-tw(\.html|\/)/, `${file}: navigation stays on the Traditional route`);
    const route = JSON.parse(all.find(node => attr(node, 'id') === 'site-route').childNodes.map(child => child.value).join(''));
    assert.equal(route.lang, 'zh-tw', file);
  }
});

test('authored Traditional pack text is not run through the converter', () => {
  const leave = PACKS.find(pack => pack.id === 'leave-approval');
  const html = read(outputFile('packs/leave-approval', 'zh-tw'));
  const text = visibleText(html);
  for (const document of leave.documents) assert.ok(text.includes(document.title), `pack document title kept: ${document.title}`);
  // "文件" (document) must not become "檔案" (file), "後台" must not become "後臺".
  assert.ok(!text.includes('業務需求檔案'));
  assert.ok(text.includes('人資後台'));
  // The site's own chrome on the same page is converted from Simplified.
  assert.ok(text.includes('視角矩陣'));
});

test('English and Simplified pages are unchanged by the Traditional build', () => {
  const simplified = visibleText(read(outputFile('guide', 'zh')));
  assert.ok(simplified.includes('场景指南'));
  assert.ok(!simplified.includes('場景指南'));
  assert.ok(read(outputFile('guide', 'en')).includes('lang="en"'));
});
