import { test } from 'node:test';
import assert from 'node:assert/strict';
import { announces, findMessageLists, scanTags, WORK_LIMITS } from '../src/index.js';
import { allowed, flowText, idsOf, ofCheck, lineOf, findingsOf } from './helpers.js';

const widget = (html) => findingsOf(flowText(), undefined, html).filter((f) => f.file === 'widget');
const ids = (html) => widget(html).map((f) => f.id);
const page = (inner) => `<!doctype html>\n<html>\n<body>\n${inner}\n</body>\n</html>\n`;

test('widget: role="log" on the message list passes', () => {
  assert.deepEqual(ids(page('<div id="messages" role="log"></div>')), []);
});

test('widget: aria-live polite or assertive on the message list passes', () => {
  assert.deepEqual(ids(page('<div class="chat-messages" aria-live="polite"></div>')), []);
  assert.deepEqual(ids(page('<div class="chat-messages" aria-live="assertive"></div>')), []);
});

test('widget: role status and role alert pass', () => {
  assert.deepEqual(ids(page('<ul id="message-list" role="status"></ul>')), []);
  assert.deepEqual(ids(page('<ol class="transcript" role="alert"></ol>')), []);
});

test('widget: a message list with neither is an error at its line and column', () => {
  const html = page('  <div id="chat-messages" class="chat"></div>');
  const found = widget(html);
  assert.deepEqual(found.map((f) => f.id), ['widget-live-region-missing']);
  assert.equal(found[0].line, lineOf(html, '<div id'));
  assert.equal(found[0].column, 3);
  assert.equal(found[0].file, 'widget');
});

test('widget: aria-live="off" does not pass, even with role="log"', () => {
  const found = widget(page('<div id="messages" role="log" aria-live="off"></div>'));
  assert.deepEqual(found.map((f) => f.id), ['widget-live-region-missing']);
  assert.match(found[0].message, /aria-live="off"/);
});

test('widget: aria-live="off" is read without regard to case and white space', () => {
  assert.deepEqual(ids(page('<div id="messages" aria-live=" OFF "></div>')), ['widget-live-region-missing']);
  assert.deepEqual(ids(page('<div id="messages" ARIA-LIVE="Polite"></div>')), []);
  assert.deepEqual(ids(page('<div id="messages" ROLE="LOG"></div>')), []);
});

test('widget: a role list may hold several roles; the first counts', () => {
  assert.deepEqual(ids(page('<div id="messages" role="log region"></div>')), []);
  assert.deepEqual(ids(page('<div id="messages" role="region log"></div>')), ['widget-live-region-missing']);
});

test('widget: other live words in the role do not pass', () => {
  assert.deepEqual(ids(page('<div id="messages" role="list" aria-live="true"></div>')), ['widget-live-region-missing']);
});

test('widget: no element that looks like a message list is a warning', () => {
  const found = widget(page('<div id="app"><p>Hello</p></div>'));
  assert.deepEqual(found.map((f) => f.id), ['widget-message-list-not-found']);
  assert.equal(found[0].line, 1);
});

test('widget: a file with no tags at all is reported as not found', () => {
  assert.deepEqual(ids('just some text, no tags'), ['widget-message-list-not-found']);
  assert.deepEqual(ids(''), ['widget-message-list-not-found']);
});

test('widget: the words that mark a message list', () => {
  for (const name of ['messages', 'transcript', 'conversation', 'log', 'thread', 'chatlog', 'chat-log', 'chat_messages', 'ConversationView']) {
    assert.deepEqual(ids(page(`<div id="${name}"></div>`)), ['widget-live-region-missing'], name);
  }
  for (const name of ['message-list', 'message-container', 'message-area', 'message-history', 'message-window', 'message-wrapper', 'message-panel']) {
    assert.deepEqual(ids(page(`<div class="${name}"></div>`)), ['widget-live-region-missing'], name);
  }
});

test('widget: near misses, a single message bubble, an input and a button are not a list', () => {
  assert.deepEqual(ids(page('<div class="message bot"></div>')), ['widget-message-list-not-found']);
  assert.deepEqual(ids(page('<input id="message-input">')), ['widget-message-list-not-found']);
  assert.deepEqual(ids(page('<button class="chat-log-toggle">Open</button>')), ['widget-message-list-not-found']);
  assert.deepEqual(ids(page('<p class="messages">x</p>')), ['widget-message-list-not-found']);
});

test('widget: one candidate that announces is enough; the others are not reported', () => {
  assert.deepEqual(ids(page('<div class="chat-log-wrapper"><div id="messages" role="log"></div></div>')), []);
});

test('widget: when none of several candidates announces, one error names how many', () => {
  const found = widget(page('<div class="chat-log-wrapper"><div id="messages"></div></div>'));
  assert.deepEqual(found.map((f) => f.id), ['widget-live-region-missing']);
  assert.match(found[0].message, /none of the 2 candidates/);
});

test('widget: an element with role="log" is a candidate whatever its name', () => {
  assert.deepEqual(ids(page('<section class="foo" role="log"></section>')), []);
  assert.deepEqual(ids(page('<section class="foo" role="log" aria-live="off"></section>')), ['widget-live-region-missing']);
});

test('widget: comments, doctype and the text of scripts and styles hold no elements', () => {
  const html = page('<!-- <div id="messages"></div> -->\n<script>var s = "<div id=\\"messages\\"></div>";</script>\n<style>.messages { color: red }</style>\n<div id="app"></div>');
  assert.deepEqual(ids(html), ['widget-message-list-not-found']);
});

test('widget: a script that is never closed swallows the rest, without a hang', () => {
  assert.deepEqual(ids(page('<script>var a = 1;\n<div id="messages"></div>')), ['widget-message-list-not-found']);
});

test('widget: attributes with single quotes, no quotes, a bare name and a slash', () => {
  assert.deepEqual(ids(page("<div id='messages' role='log'/>")), []);
  assert.deepEqual(ids(page('<div id=messages role=log></div>')), []);
  assert.deepEqual(ids(page('<div id="messages" hidden role="log"></div>')), []);
  assert.deepEqual(ids(page('<div\n  id="messages"\n  role="log"\n></div>')), []);
});

test('widget: the line and column of a tag that starts after other lines and a multi-line comment', () => {
  const html = '<!--\n a\n b -->\n\n   <div id="messages"></div>\n';
  const found = widget(html);
  assert.equal(found[0].line, 5);
  assert.equal(found[0].column, 4);
});

test('widget: the first of a repeated attribute counts', () => {
  assert.deepEqual(ids(page('<div id="messages" role="log" role="presentation"></div>')), []);
  assert.deepEqual(ids(page('<div id="messages" role="presentation" role="log"></div>')), ['widget-live-region-missing']);
});

test('widget: a lone less-than sign in text is not a tag', () => {
  assert.deepEqual(ids(page('<p>1 < 2 and 3 <4</p><div id="messages" role="log"></div>')), []);
});

test('widget: the widget check does not need a flow and works with one', () => {
  const found = findingsOf(flowText(), undefined, page('<div id="messages"></div>'));
  assert.deepEqual(found.map((f) => [f.id, f.file]), [['widget-live-region-missing', 'widget']]);
  assert.deepEqual(idsOf(flowText()), []);
  assert.equal(ofCheck(flowText(), 'widget-live-region-missing').length, 0);
});

test('widget: scanTags reports every start tag in order with its attributes in lower case', () => {
  const seen = [];
  const n = scanTags('<A HREF="x" Title=y><b></b><IMG SRC=a /></A>', (t) => seen.push([t.name, [...t.attrs.entries()]]));
  assert.equal(n, 3);
  assert.deepEqual(seen, [['a', [['href', 'x'], ['title', 'y']]], ['b', []], ['img', [['src', 'a']]]]);
});

test('widget: announces and findMessageLists', () => {
  assert.equal(announces(new Map([['role', 'log']])), true);
  assert.equal(announces(new Map([['aria-live', 'polite']])), true);
  assert.equal(announces(new Map([['role', 'log'], ['aria-live', 'off']])), false);
  assert.equal(announces(new Map()), false);
  const found = findMessageLists('<div id="messages" aria-live="polite"></div><div id="messages-extra"></div>');
  assert.equal(found.tags, 2);
  assert.deepEqual(found.candidates.map((c) => [c.id, c.ok]), [['messages', true], ['messages-extra', false]]);
});

test('widget: more tags than the limit is refused, not read in part', () => {
  assert.throws(() => scanTags('<p>'.repeat(11), () => {}, { ...WORK_LIMITS, maxTags: 10 }), /more than 10 tags/);
});

test('widget: attributes past the limit are dropped, not a hang', () => {
  const many = Array.from({ length: 200 }, (_, i) => `a${i}="x"`).join(' ');
  const seen = [];
  scanTags(`<div ${many}>`, (t) => seen.push(t.attrs.size));
  assert.deepEqual(seen, [WORK_LIMITS.maxAttributes]);
});

test('widget: a big page is scanned in good time', () => {
  const html = page(`${'<div class="row"><span>text</span></div>\n'.repeat(60000)}<div id="messages" role="log"></div>`);
  const start = Date.now();
  assert.deepEqual(ids(html), []);
  assert.ok(Date.now() - start < allowed(5000));
});
