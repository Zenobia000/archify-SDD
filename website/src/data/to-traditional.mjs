// Traditional Chinese (Taiwan usage) is derived from the site's Simplified
// copy at build time with OpenCC (s2twp), the same route the viewer's zh-TW
// catalog took. Only Simplified sources go through here: running the converter
// over text that is already Traditional rewrites it ("文件" becomes "檔案",
// "後台" becomes "後臺"), so authored Traditional content must bypass it.
import * as OpenCC from 'opencc-js/cn2t';

const convert = OpenCC.Converter({ from: 'cn', to: 'twp' });

export function toTraditional(text) {
  return convert(String(text));
}

// Language switcher links carry their label in its own script ("简", "繁"),
// so they are set aside while the rest of a document is converted.
const SWITCH_LINK = /<a\b[^>]*\bdata-language-switch\b[^>]*>[\s\S]*?<\/a>/g;

export function toTraditionalDocument(html) {
  const kept = [];
  const masked = String(html).replace(SWITCH_LINK, (link) => `\u0000${kept.push(link) - 1}\u0000`);
  return convert(masked).replace(/\u0000(\d+)\u0000/g, (_match, index) => kept[Number(index)]);
}

export function toTraditionalDeep(value) {
  if (typeof value === 'string') return convert(value);
  if (Array.isArray(value)) return value.map(toTraditionalDeep);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toTraditionalDeep(item)]));
  return value;
}
