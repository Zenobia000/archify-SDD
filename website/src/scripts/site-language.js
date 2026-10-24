(function (global) {
  'use strict';
  var config = JSON.parse(document.getElementById('site-route').textContent);
  // Routes are en, zh (Simplified) and zh-tw (Traditional). Both Chinese routes
  // render the same authored `zh` copy, so scripts select text with read().
  var PREFIX = { en: '', zh: 'zh', 'zh-tw': 'zh-tw' };
  var HTML_LANG = { en: 'en', zh: 'zh-Hans', 'zh-tw': 'zh-Hant' };
  var normalize = function (value) {
    var route = String(value || '').toLowerCase();
    return Object.prototype.hasOwnProperty.call(PREFIX, route) ? route : null;
  };
  var route = normalize(config.lang) || 'en';
  var content = route === 'en' ? 'en' : 'zh';
  function pagePath(page, lang) {
    var prefix = PREFIX[lang];
    if (page === 'index') return prefix ? prefix + (config.cloudflare ? '' : '.html') : './';
    return (prefix ? prefix + '/' : '') + page + (config.cloudflare ? '' : '.html');
  }
  function destination(lang) {
    var current = new URL(global.location.href);
    var next = new URL(pagePath(config.page, lang), document.baseURI);
    current.searchParams.delete('lang');
    next.search = current.search;
    next.hash = current.hash;
    return next;
  }
  // An explicit legacy query requests a route. Stored preferences never override a URL.
  var current = new URL(global.location.href);
  if (current.searchParams.has('lang')) {
    var requested = normalize(current.searchParams.get('lang'));
    current.searchParams.delete('lang');
    if (requested && requested !== route) {
      global.location.replace(destination(requested).href);
    } else {
      try { global.history.replaceState(global.history.state, '', current.href); } catch (_) {}
    }
  }
  function localizeLinks() {
    document.querySelectorAll('a[href]').forEach(function (link) {
      if (link.hasAttribute('data-language-switch')) return;
      var match = link.getAttribute('href').match(/^(index|architecture|guide|start|gallery|community|agent-diagrams|cases\/mco-runtime|packs\/[a-z0-9-]+(?:\/[a-z0-9-]+)?)\.html([?#].*)?$/);
      if (match) link.setAttribute('href', pagePath(match[1], route) + (match[2] || ''));
    });
  }
  global.ArchifySiteLanguage = Object.freeze({
    key: 'archify-lang',
    // The language of the authored copy: en or zh.
    read: function () { return content; },
    // The route actually being shown: en, zh or zh-tw.
    route: function () { return route; },
    htmlLang: function () { return HTML_LANG[route]; },
    write: function () {
      try { global.localStorage.setItem('archify-lang', route); } catch (_) {}
      return content;
    },
    page: function (page, suffix) { return pagePath(page, route) + (suffix || ''); },
    localizeLinks: localizeLinks,
  });
  document.addEventListener('DOMContentLoaded', function () {
    localizeLinks();
    document.querySelectorAll('[data-language-switch]').forEach(function (link) {
      var target = normalize(link.getAttribute('data-language-switch'));
      if (!target) return;
      function sync() { link.href = destination(target).href; }
      sync();
      link.addEventListener('pointerdown', sync);
      link.addEventListener('focus', sync);
      link.addEventListener('click', sync);
    });
  });
}(window));
