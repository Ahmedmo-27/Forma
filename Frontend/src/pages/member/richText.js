import { Fragment, createElement } from 'react';

/**
 * Renders a translated sentence that contains markup. Translate the sentence
 * with `{placeholders}` (no vars), then pass the nodes to drop in:
 *
 *   rich(t('Starts on {date}'), { date: <strong>{fmtDate(d)}</strong> })
 */
export function rich(text, nodes) {
  return String(text).split(/(\{\w+\})/g).map((part, i) => {
    const m = /^\{(\w+)\}$/.exec(part);
    if (m && Object.prototype.hasOwnProperty.call(nodes, m[1])) {
      return createElement(Fragment, { key: i }, nodes[m[1]]);
    }
    return part;
  });
}
