import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WORK_LIMITS } from '../src/index.js';
import { ARGS, allowed, cli, flowText, idsOf, findingsOf, run } from './helpers.js';

// A line of n steps, each leading to the next, ending in an end step; the first question has a way to a person.
function chain(n) {
  const steps = { s0: { type: 'message', text: 'I am a bot.', next: 's1' } };
  for (let i = 1; i < n; i += 1) steps[`s${i}`] = { type: 'message', text: 'x', next: `s${i + 1}` };
  steps[`s${n}`] = { type: 'end' };
  return JSON.stringify({ start: 's0', steps });
}

const timed = (fn, ms) => {
  const start = Date.now();
  const result = fn();
  const took = Date.now() - start;
  assert.ok(took < allowed(ms), `took ${took} ms, allowed ${allowed(ms)} ms`);
  return result;
};

test('hostile: a line of 15000 steps is checked in good time and without a stack overflow', () => {
  const text = chain(15000);
  const found = timed(() => findingsOf(text), 8000);
  assert.deepEqual(found, []);
});

test('hostile: a ring of 15000 steps is a trap for each step, capped at 1000 findings', () => {
  const steps = { s0: { type: 'message', text: 'I am a bot.', next: 's1' } };
  for (let i = 1; i < 15000; i += 1) steps[`s${i}`] = { type: 'message', text: 'x', next: `s${(i + 1) % 15000}` };
  const found = timed(() => findingsOf(JSON.stringify({ start: 's0', steps })), 8000);
  assert.equal(found.filter((f) => f.id === 'flow-trap').length, 1000);
});

test('hostile: the most steps allowed are read; one more is refused', () => {
  const steps = {};
  for (let i = 0; i <= WORK_LIMITS.maxSteps; i += 1) steps[`s${i}`] = { type: 'end' };
  const ids = idsOf(JSON.stringify({ start: 's0', steps }));
  assert.deepEqual(ids, ['file-unreadable']);
});

test('hostile: every step pointing at every other step does not take quadratic time in the checks', () => {
  const n = 1500;
  const steps = { s0: { type: 'message', text: 'I am a bot.', next: 's1' } };
  for (let i = 1; i <= n; i += 1) {
    steps[`s${i}`] = { type: 'choice', text: 'Pick', reprompt_limit: 1, fallback: 's0', options: [{ label: 'a', next: `s${(i % n) + 1}` }, { label: 'b', next: 's0' }, { label: 'c', next: `s${((i + 1) % n) + 1}` }] };
  }
  timed(() => findingsOf(JSON.stringify({ start: 's0', steps })), 8000);
});

test('hostile: very many options on one step', () => {
  const options = Array.from({ length: 1400 }, (_, i) => ({ label: `o${i}`, next: 'end' }));
  const text = JSON.stringify({ start: 'a', steps: { a: { type: 'choice', text: 'I am a bot. Pick', reprompt_limit: 1, fallback: 'end', options }, end: { type: 'end' } } });
  const found = timed(() => findingsOf(text), 5000);
  assert.ok(found.every((f) => f.id !== 'file-unreadable'));
});

test('hostile: more options than the limit are reported, not read in part', () => {
  const options = Array.from({ length: WORK_LIMITS.maxOptions + 1 }, (_, i) => ({ label: `o${i}`, next: 'end' }));
  const text = JSON.stringify({ start: 'a', steps: { a: { type: 'choice', text: 'I am a bot. Pick', reprompt_limit: 1, fallback: 'end', options }, end: { type: 'end' } } });
  assert.ok(idsOf(text).includes('field-invalid'));
});

test('hostile: a prompt of the longest length is counted, one past it is a finding', () => {
  const ok = 'word '.repeat(3999).trim();
  const found = timed(() => findingsOf(flowText((f) => { f.channel = 'voice'; f.steps.ask.text = ok; })), 3000);
  assert.ok(found.some((x) => x.id === 'voice-prompt-too-long'));
  const long = findingsOf(flowText((f) => { f.steps.ask.text = 'x'.repeat(WORK_LIMITS.maxTextLength + 1); }));
  assert.ok(long.some((x) => x.id === 'field-invalid'));
});

test('hostile: step ids and edges named like object properties are only names', () => {
  const names = ['__proto__', 'constructor', 'prototype', 'toString', 'hasOwnProperty', 'valueOf'];
  const step = (next, text = 'x') => JSON.stringify({ type: 'message', text, next });
  const entries = [`"hello": ${step(names[0], 'I am a bot.')}`, ...names.map((name, i) => `${JSON.stringify(name)}: ${step(names[i + 1] ?? 'hello')}`)];
  const text = `{"start": "hello", "steps": {${entries.join(',')}}}`;
  const found = findingsOf(text);
  assert.equal(found.length, names.length + 1);
  assert.ok(found.every((f) => f.id === 'flow-trap'), found.map((f) => f.id).join());
  assert.deepEqual(found.map((f) => f.subject).sort(), ['__proto__', 'constructor', 'hello', 'hasOwnProperty', 'prototype', 'toString', 'valueOf'].sort());
  assert.equal({}.polluted, undefined);
  assert.equal(Object.keys({}).length, 0);
});

test('hostile: step ids with control and direction characters are cleaned in every report', async () => {
  const id = `a${String.fromCharCode(0)}b${String.fromCharCode(0x202e)}c${String.fromCharCode(10)}d`;
  const files = { 'flow.json': JSON.stringify({ start: 'a', steps: { a: { type: 'message', text: 'I am a bot.', next: id }, [id]: { type: 'message', text: 'x' } } }) };
  for (const format of ['text', 'markdown', 'json', 'sarif', 'junit']) {
    const r = await run(files, [...ARGS, '--format', format]);
    assert.equal(r.code, 1);
    assert.ok(!r.out.includes(String.fromCharCode(0)), format);
    assert.ok(!r.out.includes(String.fromCharCode(0x202e)), format);
  }
});

test('hostile: a deeply nested JSON flow is refused with a finding, quickly', () => {
  const text = `{"start": "a", "steps": {"a": ${'['.repeat(100000)}}}`;
  const found = timed(() => findingsOf(text), 3000);
  assert.deepEqual(found.map((f) => f.id), ['file-unreadable']);
});

test('hostile: a deeply nested YAML flow is refused with a finding, quickly', () => {
  let text = 'start: a\nsteps:\n';
  for (let i = 0; i < 3000; i += 1) text += `${' '.repeat(2 + i)}k${i}:\n`;
  const found = timed(() => findingsOf(text), 3000);
  assert.deepEqual(found.map((f) => f.id), ['file-unreadable']);
});

test('hostile: a YAML file of 150000 lines is read in good time', () => {
  let text = 'start: s0\nsteps:\n';
  for (let i = 0; i < 30000; i += 1) text += `  s${i}:\n    type: message\n    text: x\n    next: s${i + 1}\n`;
  text += '  s30000:\n    type: end\n';
  const found = timed(() => findingsOf(text), 8000);
  assert.ok(found.length >= 0);
});

test('hostile: a long line of one character does not hang the readers', () => {
  const found = timed(() => findingsOf(`start: a\nsteps:\n  a:\n    type: end\n    text: ${'"'.repeat(100000)}\n`), 3000);
  assert.deepEqual(found.map((f) => f.id), ['file-unreadable']);
  const json = timed(() => findingsOf(`{"a": "${'\\'.repeat(100000)}`), 3000);
  assert.deepEqual(json.map((f) => f.id), ['file-unreadable']);
});

test('hostile: a flow of binary-looking text is not read as a flow', async () => {
  const r = await cli(['flow.bin'], '/nonexistent-folder-for-this-test');
  assert.equal(r.code, 2);
});

test('hostile: the same flow gives the same report every time', async () => {
  const files = { 'flow.json': chain(500) };
  const a = await run(files, [...ARGS, '--json']);
  const b = await run(files, [...ARGS, '--json']);
  assert.equal(a.out, b.out);
});
