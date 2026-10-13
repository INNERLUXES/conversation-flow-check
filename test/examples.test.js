import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULES, checkText, parseJson, parseYaml, readOptions } from '../src/index.js';
import { BAD, BAD_CHAT, BAD_SYNTAX, EXPLAIN, GOOD, GOOD_JSON, GOOD_VOICE, run } from '../tools/example.mjs';
import { dump } from './helpers.js';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const read = (rel) => readFile(resolve(root, rel), 'utf8');
const ids = (report) => [...new Set(JSON.parse(report.out).findings.map((f) => f.id))].sort();

test('examples: the good flows pass every check at every level', async () => {
  for (const args of [GOOD, GOOD_VOICE, GOOD_JSON]) {
    for (const level of ['error', 'warning', 'info']) {
      const r = await run([...args, '--fail-on', level]);
      assert.equal(r.code, 0, `${args[0]} at ${level}\n${r.out}`);
      assert.match(r.out, new RegExp(`RESULT: PASS - no finding at or above ${level}\\n$`));
      assert.match(r.out, /\nfindings: 0\n/);
    }
  }
});

test('examples: the good voice flow is voice, the others are chat', async () => {
  assert.match((await run(GOOD_VOICE)).out, /channel: voice \(from the flow file\)/);
  assert.match((await run(GOOD_JSON)).out, /channel: chat \(from the flow file\)/);
  assert.match((await run(GOOD)).out, /channel: chat \(from the flow file\)/);
});

test('examples: the good flows keep their reports clean when read as the other channel', async () => {
  assert.equal((await run([...GOOD_JSON, '--channel', 'voice', '--max-words', '40'])).code, 0);
  assert.equal((await run([...GOOD_VOICE, '--channel', 'chat'])).code, 0);
});

test('examples: the bad voice flow reports a mistake of most checks', async () => {
  const r = await run([...BAD, '--json']);
  assert.equal(r.code, 1);
  assert.deepEqual(ids(r), [
    'ai-disclosure-missing', 'edge-missing', 'field-invalid', 'field-unknown', 'flow-trap', 'input-no-fallback', 'input-no-reprompt-limit',
    'irreversible-unconfirmed', 'no-handover', 'reprompt-limit-high', 'step-dead-end', 'step-target-unknown', 'step-unreachable',
    'voice-multiple-questions', 'voice-prompt-too-long'
  ]);
});

test('examples: the bad chat flow and its widget report what the README says', async () => {
  const r = await run([...BAD_CHAT, '--json']);
  assert.equal(r.code, 1);
  assert.deepEqual(ids(r), ['ai-disclosure-missing', 'edge-missing', 'handover-unreachable', 'irreversible-unconfirmed', 'widget-live-region-missing']);
  const report = JSON.parse(r.out);
  assert.deepEqual(report.findings.filter((f) => f.id === 'handover-unreachable').map((f) => f.subject), ['ask_day', 'confirm_booking']);
  assert.equal(report.findings.find((f) => f.id === 'widget-live-region-missing').file, 'examples/bad/widget.html');
});

test('examples: the flow that cannot be read has one finding and nothing else ran', async () => {
  const r = await run([...BAD_SYNTAX, '--json']);
  assert.equal(r.code, 1);
  assert.deepEqual(ids(r), ['file-unreadable']);
  const report = JSON.parse(r.out);
  assert.equal(report.evaluated, false);
  assert.equal(report.findings[0].line, 6);
});

test('examples: every check but two is shown by a bad example', async () => {
  const shown = new Set();
  for (const args of [BAD, BAD_CHAT, BAD_SYNTAX]) for (const id of ids(await run([...args, '--json']))) shown.add(id);
  const missing = RULES.map((r) => r.id).filter((id) => !shown.has(id));
  assert.deepEqual(missing, ['start-unknown', 'widget-message-list-not-found']);
});

test('examples: the bad widget page names its message list and the comment is not an element', async () => {
  const r = await run(['--widget', 'examples/bad/widget.html', '--json']);
  const found = JSON.parse(r.out).findings;
  assert.equal(found.length, 1);
  assert.equal(found[0].id, 'widget-live-region-missing');
  assert.equal(found[0].line, 10);
});

test('examples: the saved output is what the tool writes today, in every format', async () => {
  const same = async (name, args) => {
    const r = await run(args);
    assert.equal(r.out, await read(`examples/output/${name}`), name);
  };
  await same('bad.txt', BAD);
  await same('bad.md', [...BAD, '--format', 'markdown']);
  await same('bad.json', [...BAD, '--json']);
  await same('bad.sarif', [...BAD, '--format', 'sarif']);
  await same('bad.junit.xml', [...BAD, '--format', 'junit']);
  await same('bad-chat-and-widget.txt', BAD_CHAT);
  await same('bad-syntax-error.txt', BAD_SYNTAX);
  await same('good.txt', GOOD);
  await same('good.md', [...GOOD, '--format', 'markdown']);
  await same('good.json', [...GOOD, '--json']);
  await same('good.sarif', [...GOOD, '--format', 'sarif']);
  await same('good.junit.xml', [...GOOD, '--format', 'junit']);
  await same('good-voice.txt', GOOD_VOICE);
  await same('good-json-flow.txt', GOOD_JSON);
  await same('checks.txt', ['--list-checks']);
  await same('checks.md', ['--list-checks', '--format', 'markdown']);
  await same('checks.json', ['--list-checks', '--format', 'json']);
  await same('explain-flow-trap.txt', EXPLAIN);
  await same('explain-flow-trap.md', [...EXPLAIN, '--format', 'markdown']);
});

test('examples: the saved SARIF and JSON output parse, and the JUnit output has one case for each check', async () => {
  for (const name of ['bad.sarif', 'good.sarif', 'bad.json', 'good.json', 'checks.json']) JSON.parse(await read(`examples/output/${name}`));
  for (const name of ['bad.junit.xml', 'good.junit.xml']) {
    const xml = await read(`examples/output/${name}`);
    assert.equal(xml.match(/<testcase /g).length, RULES.length, name);
  }
});

test('examples: the README shows the real head, two findings and the end of the report of the bad flow', async () => {
  const readme = await read('README.md');
  const lines = (await run(BAD)).out.split('\n');
  const head = lines.slice(0, lines.indexOf('Checks (20)')).join('\n').trimEnd();
  assert.ok(readme.includes(head));
  for (const [id, at] of [['flow-trap', 'support-voice.yaml:51'], ['irreversible-unconfirmed', 'support-voice.yaml:42']]) {
    const i = lines.findIndex((l) => l.includes(id) && l.includes(at));
    assert.ok(i >= 0);
    assert.ok(readme.includes(lines.slice(i, i + 3).join('\n')), id);
  }
  assert.ok(readme.includes(lines.slice(-4).join('\n')));
});

test('examples: the README shows the real head and end of the report of the good flow', async () => {
  const readme = await read('README.md');
  const lines = (await run(GOOD)).out.split('\n');
  assert.ok(readme.includes(lines.slice(0, lines.indexOf('Checks (20)')).join('\n').trimEnd()));
  assert.ok(readme.includes(lines.slice(-4).join('\n')));
});

test('examples: the YAML flows and the same flows as JSON give the same findings', async () => {
  for (const file of ['examples/good/booking-chat.yaml', 'examples/good/support-voice.yaml', 'examples/bad/support-voice.yaml']) {
    const yaml = await read(file);
    const asJson = JSON.stringify(dump(parseYaml(yaml)), null, 2);
    const a = checkText(yaml, null, { options: readOptions() }).findings.map((f) => [f.id, f.subject]);
    const b = checkText(asJson, null, { options: readOptions() }).findings.map((f) => [f.id, f.subject]);
    assert.deepEqual(b, a, file);
  }
});

test('examples: the JSON example is the same tree when read by JSON.parse', async () => {
  const text = await read('examples/good/returns-chat.json');
  assert.deepEqual(JSON.parse(JSON.stringify(dump(parseJson(text)))), JSON.parse(text));
});

test('examples: the flows give the same findings with CRLF and CR line ends', async () => {
  for (const file of ['examples/good/booking-chat.yaml', 'examples/bad/support-voice.yaml', 'examples/bad/booking-chat.json', 'examples/bad/widget.html']) {
    const text = await read(file);
    const flow = file.endsWith('.html') ? null : text;
    const widget = file.endsWith('.html') ? text : null;
    const base = checkText(flow, widget, { options: readOptions() }).findings.map((f) => [f.id, f.line, f.column]);
    for (const eol of ['\r\n', '\r']) {
      const changed = text.replaceAll('\n', eol);
      const found = checkText(flow === null ? null : changed, widget === null ? null : changed, { options: readOptions() }).findings.map((f) => [f.id, f.line, f.column]);
      assert.deepEqual(found, base, `${file} ${JSON.stringify(eol)}`);
    }
  }
});

test('examples: every example file is plain ASCII with LF line ends and no tab in the YAML', async () => {
  for (const file of ['examples/good/booking-chat.yaml', 'examples/good/support-voice.yaml', 'examples/good/returns-chat.json', 'examples/good/widget.html', 'examples/bad/support-voice.yaml', 'examples/bad/booking-chat.json', 'examples/bad/syntax-error.yaml', 'examples/bad/widget.html']) {
    const text = await read(file);
    assert.doesNotMatch(text, /[^\x00-\x7f]/, file);
    assert.ok(!text.includes('\r'), file);
    assert.ok(text.endsWith('\n'), file);
    if (file.endsWith('.yaml')) assert.ok(!text.includes('\t'), file);
  }
});

test('examples: the made-up businesses are generic and the files hold no date, year or address of a person', async () => {
  for (const file of ['examples/good/booking-chat.yaml', 'examples/good/support-voice.yaml', 'examples/good/returns-chat.json', 'examples/good/widget.html', 'examples/bad/support-voice.yaml', 'examples/bad/booking-chat.json', 'examples/bad/widget.html']) {
    const text = await read(file);
    assert.doesNotMatch(text, /\b(?:19|20)\d{2}\b/, file);
    assert.doesNotMatch(text, /@|https?:\/\//, file);
  }
});
