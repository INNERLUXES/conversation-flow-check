// The optional check of the HTML of a chat widget: does the element that holds the messages announce new ones? WCAG 2.2 success
// criterion 4.1.3 (Status Messages) asks that a status message can be announced by assistive technology without taking the
// focus; for a message list the usual way is role="log" or an aria-live attribute. The file is read as text by a small scanner
// of start tags that works in a loop. It runs no script, loads nothing and builds no tree; comments, doctypes, scripts and
// styles are skipped. It sees the attributes in the file, not those a script sets later.

import { LIMITS } from './data.js';
import { tokensOf } from './checks.js';

const CANDIDATE_TAGS = new Set(['div', 'ul', 'ol', 'section', 'article', 'aside', 'main', 'dl', 'table', 'tbody']);
const LIST_WORDS = new Set(['messages', 'transcript', 'conversation', 'log', 'thread', 'chatlog']);
const CONTAINER_WORDS = new Set(['list', 'container', 'area', 'history', 'window', 'wrapper', 'panel']);
const LIVE_ROLES = new Set(['log', 'status', 'alert']);
const RAW_TEXT = new Set(['script', 'style']);

const isNameChar = (c) => /[A-Za-z0-9:_-]/.test(c);
const isSpace = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f';

// Walks the start tags of the HTML: calls onTag({ name, attrs, line, col }) for each, with the attribute names in lower case
// and the first of a repeated name kept. Returns the number of tags.
export function scanTags(html, onTag, limits = LIMITS) {
  const n = html.length;
  let i = 0;
  let line = 1;
  let lineStart = 0;
  let tags = 0;
  // Moves to position pos, counting the line ends passed on the way.
  const to = (pos) => {
    while (i < pos) {
      const c = html[i];
      if (c === '\n' || (c === '\r' && html[i + 1] !== '\n')) {
        line += 1;
        lineStart = i + 1;
      }
      i += 1;
    }
  };
  while (i < n) {
    const lt = html.indexOf('<', i);
    if (lt < 0) break;
    to(lt);
    if (html.startsWith('<!--', i)) {
      const end = html.indexOf('-->', i + 4);
      to(end < 0 ? n : end + 3);
      continue;
    }
    const next = html[i + 1] ?? '';
    if (next === '!' || next === '?' || next === '/') {
      const end = html.indexOf('>', i + 1);
      to(end < 0 ? n : end + 1);
      continue;
    }
    if (!/[A-Za-z]/.test(next)) {
      to(i + 1);
      continue;
    }
    const tagLine = line;
    const tagCol = i - lineStart + 1;
    let j = i + 1;
    while (j < n && isNameChar(html[j])) j += 1;
    const name = html.slice(i + 1, j).toLowerCase();
    const attrs = new Map();
    for (;;) {
      while (j < n && (isSpace(html[j]) || html[j] === '/')) j += 1;
      if (j >= n || html[j] === '>') break;
      let k = j;
      while (k < n && !isSpace(html[k]) && html[k] !== '=' && html[k] !== '>' && html[k] !== '/') k += 1;
      if (k === j) {
        j += 1;
        continue;
      }
      const attr = html.slice(j, k).toLowerCase();
      j = k;
      while (j < n && isSpace(html[j])) j += 1;
      let value = '';
      if (html[j] === '=') {
        j += 1;
        while (j < n && isSpace(html[j])) j += 1;
        if (html[j] === '"' || html[j] === "'") {
          const close = html.indexOf(html[j], j + 1);
          const stop = close < 0 ? n : close;
          value = html.slice(j + 1, stop);
          j = close < 0 ? n : close + 1;
        } else {
          let m = j;
          while (m < n && !isSpace(html[m]) && html[m] !== '>') m += 1;
          value = html.slice(j, m);
          j = m;
        }
      }
      if (attrs.size < limits.maxAttributes && !attrs.has(attr)) attrs.set(attr, value);
    }
    tags += 1;
    if (tags > limits.maxTags) throw new Error(`the file has more than ${limits.maxTags} tags`);
    onTag({ name, attrs, line: tagLine, col: tagCol });
    to(Math.min(j + 1, n));
    if (RAW_TEXT.has(name)) {
      let k = i;
      for (;;) {
        k = html.indexOf('</', k);
        if (k < 0) {
          k = n;
          break;
        }
        if (html.slice(k + 2, k + 2 + name.length).toLowerCase() === name) break;
        k += 2;
      }
      to(k);
    }
  }
  return tags;
}

// Whether the element announces new content: a live role, or aria-live polite or assertive; aria-live="off" never does.
export function announces(attrs) {
  const live = (attrs.get('aria-live') ?? '').trim().toLowerCase();
  if (live === 'off') return false;
  const role = (attrs.get('role') ?? '').trim().toLowerCase().split(/\s+/)[0];
  return LIVE_ROLES.has(role) || live === 'polite' || live === 'assertive';
}

// The elements of the HTML that look like the list of messages, each with whether it announces new content.
export function findMessageLists(html, limits = LIMITS) {
  const candidates = [];
  const tags = scanTags(html, (tag) => {
    const role = (tag.attrs.get('role') ?? '').trim().toLowerCase().split(/\s+/)[0];
    const words = tokensOf(`${tag.attrs.get('id') ?? ''} ${tag.attrs.get('class') ?? ''}`.replace(/([a-z0-9])([A-Z])/g, '$1 $2'));
    const byName = CANDIDATE_TAGS.has(tag.name) && (words.some((w) => LIST_WORDS.has(w)) || (words.includes('message') && words.some((w) => CONTAINER_WORDS.has(w))));
    if (!byName && role !== 'log') return;
    candidates.push({ tag: tag.name, line: tag.line, col: tag.col, id: tag.attrs.get('id') ?? null, role: role || null, live: tag.attrs.get('aria-live') ?? null, ok: announces(tag.attrs) });
  }, limits);
  return { tags, candidates };
}

// Adds the findings for the HTML of a widget; returns { tags, candidates, ok }.
export function checkWidget(html, add, show, limits = LIMITS) {
  const found = findMessageLists(html, limits);
  const ok = found.candidates.some((c) => c.ok);
  if (found.candidates.length === 0) {
    add('widget-message-list-not-found', { file: 'widget', line: 1, column: 1 }, `The widget file has ${found.tags} start ${found.tags === 1 ? 'tag' : 'tags'} and none of them looks like the list of messages (an id or class with messages, transcript, conversation, log or thread). The live region was not checked.`, null);
  } else if (!ok) {
    const first = found.candidates[0];
    const what = first.live !== null && first.live.trim().toLowerCase() === 'off' ? 'aria-live="off"' : 'no role="log" and no aria-live';
    const label = first.id !== null ? ` (id "${show(first.id)}")` : '';
    add('widget-live-region-missing', { file: 'widget', line: first.line, column: first.col }, `The <${first.tag}>${label} that looks like the list of messages has ${what}${found.candidates.length > 1 ? `; none of the ${found.candidates.length} candidates announces new messages` : ''}. WCAG 2.2 success criterion 4.1.3 (Status Messages) asks that a status message can be announced without taking the focus.`, first.id);
  }
  return { tags: found.tags, candidates: found.candidates.length, ok };
}
