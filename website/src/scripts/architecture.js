(function () {
  'use strict';
  // Catalog facets: values within one facet widen the match (OR), different
  // facets narrow it (AND). ?role= and ?document= preselect a facet so role
  // and document cards can link straight into the filtered catalog.
  var boxes = Array.prototype.slice.call(document.querySelectorAll('input[data-facet]'));
  var cards = Array.prototype.slice.call(document.querySelectorAll('.result-card'));
  var status = document.querySelector('[data-catalog-status]');
  var empty = document.querySelector('[data-catalog-empty]');
  var lang = document.documentElement.lang;
  var zh = lang.indexOf('zh') === 0;
  var hant = /^zh-(Hant|TW)/i.test(lang);
  if (!boxes.length || !cards.length) return;

  function selected() {
    var chosen = {};
    boxes.forEach(function (box) {
      if (!box.checked) return;
      (chosen[box.getAttribute('data-facet')] = chosen[box.getAttribute('data-facet')] || []).push(box.value);
    });
    return chosen;
  }

  function apply() {
    var chosen = selected();
    var visible = 0;
    cards.forEach(function (card) {
      var match = Object.keys(chosen).every(function (facet) {
        var values = (card.getAttribute('data-' + facet) || '').split(' ');
        return chosen[facet].some(function (value) { return values.indexOf(value) >= 0; });
      });
      card.hidden = !match;
      if (match) visible += 1;
    });
    status.textContent = hant ? '顯示 ' + visible + ' / ' + cards.length + ' 張圖' : zh ? '显示 ' + visible + ' / ' + cards.length + ' 张图' : visible + ' of ' + cards.length + ' diagrams';
    empty.hidden = visible !== 0;
  }

  var params = new URLSearchParams(location.search);
  ['role', 'document'].forEach(function (facet) {
    var value = params.get(facet);
    if (!value) return;
    boxes.forEach(function (box) {
      if (box.getAttribute('data-facet') === facet && box.value === value) box.checked = true;
    });
  });
  boxes.forEach(function (box) { box.addEventListener('change', apply); });
  document.querySelector('[data-facet-clear]').addEventListener('click', function () {
    boxes.forEach(function (box) { box.checked = false; });
    apply();
  });
  apply();
})();
