import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FULL_WIDTH_QUESTION, KINDS, LEVELS, RULES, atOrAbove, createCollector, decide, describe, editDistance, explainJson, explainMarkdown, explainText, flat, grouped, list,
  listChecksJson, listChecksMarkdown, listChecksText, listText, mapNode, nearest, plural, ruleById, safeText, scalarNode, seqNode, show, toJson, toJunit, toMarkdown, toSarif, toText, xmlSafe,
  FINDING_CAP
} from '../src/index.js';

test('editDistance: insertions, deletions and replacements', () => {
  assert.equal(editDistance('', ''), 0);
  assert.equal(editDistance('abc', 'abc'), 0);
  assert.equal(editDistance('', 'abc'), 3);
  assert.equal(editDistance('abc', ''), 3);
  assert.equal(editDistance('fallbak', 'fallback'), 1);
  assert.equal(editDistance('chanel', 'channel'), 1);
  assert.equal(editDistance('kitten', 'sitting'), 3);
});

test('nearest: the closest name within two edits, or null', () => {
  const names = ['next', 'fallback', 'options'];
  assert.equal(nearest('fallbak', names), 'fallback');
  assert.equal(nearest('NEXT', names), 'next');
  assert.equal(nearest('nxt', names), 'next');
  assert.equal(nearest('something', names), null);
  assert.equal(nearest('optionz', names, 1), 'options');
  assert.equal(nearest('x'.repeat(500), names), null);
});

test('safeText: control, line separator and direction characters become spaces, and the length is capped', () => {
  const bad = ['a', String.fromCharCode(0), 'b', String.fromCharCode(27), 'c', String.fromCharCode(0x202e), 'd', String.fromCharCode(0x2028), 'e', String.fromCharCode(0x85), 'f', String.fromCharCode(0xfeff), 'g'].join('');
  assert.equal(safeText(bad), 'a b c d e f g');
  assert.equal(safeText('x'.repeat(400), 300).length, 300);
  assert.equal(safeText('x'.repeat(400), 300).slice(-3), '...');
  assert.equal(safeText(12), '12');
  assert.equal(safeText('short'), 'short');
});

test('flat: runs of white space become one space', () => {
  assert.equal(flat('  a \n\t b  '), 'a b');
});

test('xmlSafe: lone surrogates and the two non-characters become a question mark, pairs stay', () => {
  const pair = String.fromCharCode(0xd83d, 0xde00);
  assert.equal(xmlSafe(`a${String.fromCharCode(0xd800)}b`), 'a?b');
  assert.equal(xmlSafe(`a${String.fromCharCode(0xdc00)}b`), 'a?b');
  assert.equal(xmlSafe(`a${String.fromCharCode(0xfffe)}${String.fromCharCode(0xffff)}b`), 'a??b');
  assert.equal(xmlSafe(`a${pair}b`), `a${pair}b`);
  assert.equal(xmlSafe(5), '5');
  assert.equal(FULL_WIDTH_QUESTION.charCodeAt(0), 0xff1f);
});

test('grouped, plural, list and listText', () => {
  assert.equal(grouped(1234567), '1,234,567');
  assert.equal(plural(1, 'step'), '1 step');
  assert.equal(plural(2, 'step'), '2 steps');
  assert.equal(plural(0, 'finding'), '0 findings');
  assert.equal(plural(1500, 'batch', 'batches'), '1,500 batches');
  assert.equal(list(['a']), 'a');
  assert.equal(list(['a', 'b']), 'a and b');
  assert.equal(list(['a', 'b', 'c']), 'a, b and c');
  assert.equal(list(['a', 'b', 'c', 'd'], 2), 'a, b and 2 more');
  assert.equal(list([]), '');
  assert.equal(listText(['a', 'b', 'c', 'd', 'e']), 'a, b, c and 2 more');
  assert.equal(listText(['a', 'b']), 'a and b');
  assert.equal(listText([]), '');
});

test('show cuts a text for a message', () => {
  assert.equal(show('a'.repeat(100)).length, 60);
  assert.equal(show(`a${String.fromCharCode(10)}b`), 'a b');
});

test('createCollector: keeps the first FINDING_CAP of each check and counts the rest', () => {
  const c = createCollector();
  for (let i = 0; i < FINDING_CAP + 5; i += 1) c.add('x', { file: 'flow', line: 1, column: 2 }, 'm');
  c.add('y', {}, 'm2', 'subject');
  assert.equal(c.findings.filter((f) => f.id === 'x').length, FINDING_CAP);
  assert.equal(c.omitted.get('x'), 5);
  assert.deepEqual(c.findings.at(-1), { id: 'y', file: null, line: null, column: null, message: 'm2', subject: 'subject' });
});

test('nodes: describe says what a node is', () => {
  assert.equal(describe(mapNode(1, 1)), 'a mapping');
  assert.equal(describe(seqNode(1, 1)), 'a list');
  assert.equal(describe(scalarNode(null, 1, 1)), 'empty');
  assert.equal(describe(scalarNode(true, 1, 1)), 'a true or false value');
  assert.equal(describe(scalarNode(3, 1, 1)), 'a number');
  assert.equal(describe(scalarNode('x', 1, 1)), 'text');
});

test('rules: ruleById, atOrAbove and decide', () => {
  assert.equal(ruleById('flow-trap').kind, 'flow');
  assert.equal(ruleById('nothing'), undefined);
  assert.deepEqual(LEVELS, ['info', 'warning', 'error']);
  assert.deepEqual(KINDS, ['file', 'step', 'flow', 'wording', 'widget']);
  assert.equal(atOrAbove('error', 'warning'), true);
  assert.equal(atOrAbove('info', 'warning'), false);
  assert.deepEqual(decide({ error: 0, warning: 0, info: 0 }, 'error'), { pass: true, failOn: 'error', text: 'PASS - no finding at or above error' });
  assert.equal(decide({ error: 0, warning: 2, info: 0 }, 'error').text, 'PASS - no finding at or above error (2 warning)');
  assert.equal(decide({ error: 0, warning: 2, info: 0 }, 'warning').text, 'FAIL - 2 findings at or above warning (2 warning)');
  assert.equal(decide({ error: 1, warning: 0, info: 3 }, 'info').text, 'FAIL - 4 findings at or above info (1 error, 3 info)');
});

const sample = () => ({
  tool: 'conversation-flow-check',
  version: '1.0.0',
  input: { flow: { file: 'f.json', format: 'json', bytes: 10, lines: 1 }, widget: null },
  evaluated: true,
  summary: { name: null, channel: 'chat', channelSource: 'default', steps: 1, reachable: 1, byType: { end: 1 }, inputSteps: 0, handoverSteps: 0, irreversibleSteps: 0, opening: [] },
  widget: null,
  checks: RULES.map((r) => ({ id: r.id, level: r.severity, kind: r.kind, status: 'pass', findings: 0, detail: 'no finding' })),
  totals: { findings: 0, byLevel: { error: 0, warning: 0, info: 0 }, hidden: 0 },
  rules: [],
  options: { minSeverity: 'info', failOn: 'error' },
  findings: [],
  notes: [],
  notice: 'notice',
  result: { pass: true, failOn: 'error', text: 'PASS - no finding at or above error' }
});

test('report writers: each writes a clean report from a minimal report object', () => {
  const r = sample();
  assert.match(toText(r), /^conversation-flow-check: f\.json\n/);
  assert.match(toText(r), /RESULT: PASS - no finding at or above error\n$/);
  assert.match(toMarkdown(r), /^# conversation-flow-check: f\.json\n/);
  assert.equal(JSON.parse(toJson(r)).tool, 'conversation-flow-check');
  assert.equal(JSON.parse(toSarif(r)).runs[0].results.length, 0);
  assert.match(toJunit(r), /tests="20" failures="0" errors="0"/);
});

test('report writers: the lists of checks and the explanations', () => {
  assert.equal(listChecksText().split('\n').filter((l) => l.startsWith('  ')).length, RULES.length);
  assert.equal(listChecksMarkdown().split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| Check') && !l.startsWith('| ---')).length, RULES.length);
  assert.equal(JSON.parse(listChecksJson()).length, RULES.length);
  const rule = ruleById('input-no-fallback');
  assert.match(explainText(rule), /^input-no-fallback\n\nlevel: error\nkind: step\n/);
  assert.match(explainMarkdown(rule), /^# input-no-fallback\n/);
  assert.equal(JSON.parse(explainJson(rule)).kind, 'step');
});
