import { packPages } from './pack-registry.mjs';

export const canonicalOrigin = 'https://archify.si';
export const sitePages = ['index', 'architecture', 'guide', 'start', 'gallery', 'community', 'agent-diagrams', 'cases/mco-runtime', ...packPages];

// Routes, not just languages: Simplified and Traditional Chinese share their
// source copy (`zh`) but are separate pages with separate URLs.
export const SITE_LANGS = ['en', 'zh', 'zh-tw'];
const PREFIX = { en: '', zh: 'zh', 'zh-tw': 'zh-tw' };
const HTML_LANG = { en: 'en', zh: 'zh-Hans', 'zh-tw': 'zh-Hant' };
const OG_LOCALE = { en: 'en_US', zh: 'zh_CN', 'zh-tw': 'zh_TW' };

// The language whose authored copy a route renders.
export const contentLang = (lang) => (lang === 'en' ? 'en' : 'zh');
export const htmlLang = (lang) => HTML_LANG[lang];
export const ogLocale = (lang) => OG_LOCALE[lang];
// The attribute value other pages use to point at a route (hreflang, lang).
export const hreflang = htmlLang;

export function canonicalPath(page, lang = 'en') {
  const prefix = PREFIX[lang];
  if (page === 'index') return prefix ? `/${prefix}` : '/';
  return `${prefix ? `/${prefix}/` : '/'}${page}`;
}
export function canonicalUrl(page, lang = 'en') {
  return new URL(canonicalPath(page, lang), canonicalOrigin).href;
}
// Paths are relative to the site's root <base>, so exported files also work on file://.
export function localPagePath(page, lang = 'en', cloudflare = false) {
  const prefix = PREFIX[lang];
  if (page === 'index') return prefix ? prefix + (cloudflare ? '' : '.html') : './';
  return `${prefix ? `${prefix}/` : ''}${page}${cloudflare ? '' : '.html'}`;
}
// The built HTML file of a page on the GitHub Pages layout.
export function outputFile(page, lang = 'en') {
  const path = localPagePath(page, lang, false);
  return path === './' ? 'index.html' : path;
}
