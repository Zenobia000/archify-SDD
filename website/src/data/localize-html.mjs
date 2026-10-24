import { parseFragment, serialize } from 'parse5';
import { contentLang, hreflang, localPagePath } from './site-urls.mjs';

// Each language names itself, so the switcher reads the same on every page.
const SWITCH_NAME = { en: 'English', zh: '简体中文', 'zh-tw': '繁體中文' };

// `lang` is the route (en, zh or zh-tw); its authored copy is en or zh.
// `convert` post-processes copy picked from data-* attributes or the shared
// dictionary, for pages whose authored content must not be converted wholesale.
/**
 * @param {string} html
 * @param {{ lang: string, page: string, cloudflare?: boolean, copy?: Record<string, Record<string, string>>, convert?: ((text: string) => string) | null }} options
 */
export function localizeHtml(html, { lang, page, cloudflare = false, copy = {}, convert = null }) {
  const content = contentLang(lang);
  const tree = parseFragment(html);
  function walk(node) {
    const attrs = new Map((node.attrs || []).map(item => [item.name, item]));
    const get = name => attrs.get(name)?.value;
    const set = (name, value) => {
      if (attrs.has(name)) attrs.get(name).value = value;
      else { const attr = { name, value }; node.attrs.push(attr); attrs.set(name, attr); }
    };
    const remove = name => {
      if (!attrs.has(name)) return;
      node.attrs = node.attrs.filter(item => item.name !== name);
      attrs.delete(name);
    };
    if (node.tagName === 'script' && get('src') === 'assets/site-language.js') {
      node.parentNode.childNodes = node.parentNode.childNodes.filter(child => child !== node);
      return;
    }
    const key = get('data-i18n') || get('data-i18n-html');
    const picked = key ? copy[content]?.[key] : get(`data-${content}`);
    if (typeof picked === 'string') {
      const value = convert ? convert(picked) : picked;
      if (convert && attrs.has(`data-${content}`)) set(`data-${content}`, value);
      // Only authored dictionary strings or explicit markup may contain HTML.
      const markup = key || get('data-translation-html') !== undefined || page === 'gallery';
      node.childNodes = markup ? parseFragment(value).childNodes : [{ nodeName: '#text', value, parentNode: node }];
      for (const child of node.childNodes) child.parentNode = node;
    }
    const placeholder = copy[content]?.[get('data-i18n-placeholder')];
    if (typeof placeholder === 'string') set('placeholder', convert ? convert(placeholder) : placeholder);
    const target = get('data-language-switch');
    if (target !== undefined && SWITCH_NAME[target]) {
      set('href', localPagePath(page, target, cloudflare));
      set('hreflang', hreflang(target));
      set('lang', hreflang(target));
      set('aria-label', SWITCH_NAME[target]);
      if (target === lang) set('aria-current', 'true'); else remove('aria-current');
    } else if (node.tagName === 'a') {
      const href = get('href');
      const match = href?.match(/^(?:(index|architecture|guide|start|gallery|community|agent-diagrams|cases\/mco-runtime|packs\/[a-z0-9-]+(?:\/[a-z0-9-]+)?)\.html|(\.\/))([?#].*)?$/);
      if (match) set('href', localPagePath(match[1] || 'index', lang, cloudflare) + (match[3] || ''));
      else if (href?.startsWith('#')) set('href', localPagePath(page, lang, cloudflare) + href);
    }
    for (const child of [...(node.childNodes || [])]) walk(child);
  }
  walk(tree);
  return serialize(tree);
}
