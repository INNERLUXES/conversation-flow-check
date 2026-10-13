import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCollector, parseJson, readFlow, WORK_LIMITS } from '../src/index.js';
import { base, findingsOf, flowText, idsAfter, idsOf, lineOf, ofCheck } from './helpers.js';

const read = (text) => {
  const c = createCollector();
  const flow = readFlow(parseJson(text), c.add, WORK_LIMITS);
  return { flow, findings: c.findings };
};

test('flow: the base flow is read with its steps in order and passes every check', () => {
  const { flow, findings } = read(flowText());
  assert.deepEqual([...flow.steps.keys()], ['hello', 'ask', 'bye', 'person']);
  assert.equal(flow.start, 'hello');
  assert.equal(flow.channel, 'chat');
  assert.equal(flow.name, 'Test flow');
  assert.deepEqual(findings, []);
  assert.deepEqual(idsOf(flowText()), []);
});

test('flow: the type of a step defaults to message', () => {
  const { flow } = read(flowText((f) => { delete f.steps.hello.type; }));
  assert.equal(flow.steps.get('hello').type, 'message');
  assert.equal(flow.steps.get('hello').typeGiven, null);
});

test('flow: edges are kept with their kind, target and place', () => {
  const text = flowText();
  const { flow } = read(text);
  const ask = flow.steps.get('ask');
  assert.deepEqual(ask.edges.map((e) => [e.kind, e.to]), [['next', 'bye'], ['fallback', 'person']]);
  assert.equal(ask.edges[0].line, lineOf(text, '"next": "bye"'));
  assert.equal(ask.repromptLimit, 2);
});

test('flow: options become edges with their label', () => {
  const { flow } = read(flowText((f) => {
    f.steps.ask = { type: 'choice', text: 'Pick', reprompt_limit: 1, options: [{ label: 'A', next: 'bye' }, { label: 'B', next: 'person' }], fallback: 'person' };
  }));
  const ask = flow.steps.get('ask');
  assert.deepEqual(ask.edges.map((e) => [e.kind, e.to, e.label ?? null]), [['fallback', 'person', null], ['option', 'bye', 'A'], ['option', 'person', 'B']]);
  assert.equal(ask.options, 2);
});

test('flow: the top level must be a mapping', () => {
  const c = createCollector();
  assert.equal(readFlow(parseJson('[1]'), c.add, WORK_LIMITS), null);
  assert.deepEqual(c.findings.map((f) => f.id), ['file-unreadable']);
  assert.match(c.findings[0].message, /must be a mapping/);
});

test('flow: no steps and no start are file-unreadable', () => {
  assert.deepEqual(idsOf('{"start": "a"}'), ['file-unreadable']);
  assert.deepEqual(idsOf('{"steps": {"a": {"type": "end"}}}'), ['file-unreadable', 'start-unknown']);
  assert.deepEqual(idsOf('{"start": "a", "steps": {}}'), ['file-unreadable']);
  assert.deepEqual(idsOf('{"start": "a", "steps": [1]}'), ['file-unreadable']);
});

test('flow: a start that is not text is field-invalid', () => {
  assert.ok(idsOf('{"start": 5, "steps": {"a": {"type": "end"}}}').includes('field-invalid'));
});

test('flow: more steps than the limit are refused, not read in part', () => {
  const c = createCollector();
  const steps = {};
  for (let i = 0; i < 5; i += 1) steps[`s${i}`] = { type: 'end' };
  const flow = readFlow(parseJson(JSON.stringify({ start: 's0', steps })), c.add, { ...WORK_LIMITS, maxSteps: 4 });
  assert.equal(flow, null);
  assert.match(c.findings[0].message, /more than 4 steps/);
});

test('flow: a step type that is not known is field-invalid with a suggestion and is read as a message', () => {
  const text = flowText((f) => { f.steps.hello.type = 'mesage'; });
  const found = ofCheck(text, 'field-invalid');
  assert.equal(found.length, 1);
  assert.match(found[0].message, /"mesage".*Did you mean "message"\?/);
  assert.equal(found[0].line, lineOf(text, '"mesage"'));
  assert.equal(read(text).flow.steps.get('hello').type, 'message');
});

test('flow: every step type is accepted', () => {
  for (const type of ['message', 'input', 'choice', 'confirm', 'action', 'handover', 'end']) {
    const { findings } = read(flowText((f) => { f.steps.extra = { type }; }));
    assert.deepEqual(findings, [], type);
  }
});

test('flow: a channel that is not chat or voice is field-invalid', () => {
  const found = ofCheck(flowText((f) => { f.channel = 'sms'; }), 'field-invalid');
  assert.equal(found.length, 1);
  assert.match(found[0].message, /"sms".*chat and voice/);
});

test('flow: a channel that is not text is field-invalid', () => {
  assert.equal(ofCheck(flowText((f) => { f.channel = 5; }), 'field-invalid').length, 1);
});

test('flow: a text that is not text is field-invalid and the step has no text', () => {
  const { flow, findings } = read(flowText((f) => { f.steps.hello.text = 5; }));
  assert.deepEqual(findings.map((f) => f.id), ['field-invalid']);
  assert.equal(flow.steps.get('hello').text, null);
});

test('flow: a text longer than the limit is field-invalid', () => {
  const c = createCollector();
  const flow = readFlow(parseJson(flowText((f) => { f.steps.hello.text = 'x'.repeat(30); })), c.add, { ...WORK_LIMITS, maxTextLength: 20 });
  assert.equal(flow.steps.get('hello').text, null);
  assert.match(c.findings[0].message, /longer than 20/);
});

test('flow: an edge that is not text is field-invalid', () => {
  const ids = idsAfter((f) => { f.steps.hello.next = 7; });
  assert.ok(ids.includes('field-invalid'));
  assert.ok(ids.includes('step-dead-end'));
});

test('flow: a reprompt_limit must be a whole number from 0 to 99', () => {
  for (const bad of ['two', -1, 100, 1.5, true, null]) {
    const found = ofCheck(flowText((f) => { f.steps.ask.reprompt_limit = bad; }), 'field-invalid');
    assert.equal(found.length, 1, String(bad));
    assert.match(found[0].message, /whole number from 0 to 99/);
  }
  for (const good of [0, 1, 99]) assert.deepEqual(idsAfter((f) => { f.steps.ask.reprompt_limit = good; }, { maxReprompts: 99 }), [], String(good));
});

test('flow: irreversible and end must be true or false', () => {
  assert.equal(ofCheck(flowText((f) => { f.steps.bye.irreversible = 'yes'; }), 'field-invalid').length, 1);
  assert.equal(ofCheck(flowText((f) => { f.steps.bye.end = 'yes'; }), 'field-invalid').length, 1);
  assert.deepEqual(idsAfter((f) => { f.steps.bye.irreversible = false; f.steps.bye.end = true; }), []);
});

test('flow: an action must be text, a note must not be a mapping', () => {
  assert.equal(ofCheck(flowText((f) => { f.steps.bye.action = 3; }), 'field-invalid').length, 1);
  assert.equal(ofCheck(flowText((f) => { f.steps.bye.note = { a: 1 }; }), 'field-invalid').length, 1);
  assert.deepEqual(idsAfter((f) => { f.steps.bye.note = 'free text for the team'; }), []);
});

test('flow: a step that is not a mapping is field-invalid and a dead end', () => {
  const ids = idsAfter((f) => { f.steps.extra = 'oops'; });
  assert.ok(ids.includes('field-invalid'));
  assert.ok(ids.includes('step-dead-end'));
  assert.ok(ids.includes('step-unreachable'));
});

test('flow: an unknown key at the top level, in a step and in an option is field-unknown with a suggestion', () => {
  const top = ofCheck(flowText((f) => { f.chanel = 'chat'; }), 'field-unknown');
  assert.equal(top.length, 1);
  assert.match(top[0].message, /"chanel".*Did you mean "channel"\?/);
  const step = ofCheck(flowText((f) => { f.steps.ask.fallbak = 'person'; }), 'field-unknown');
  assert.equal(step.length, 1);
  assert.match(step[0].message, /"fallbak".*Did you mean "fallback"\?/);
  const option = ofCheck(flowText((f) => { f.steps.ask = { type: 'choice', reprompt_limit: 1, fallback: 'person', options: [{ label: 'A', nxt: 'bye', next: 'bye' }] }; }), 'field-unknown');
  assert.equal(option.length, 1);
  assert.match(option[0].message, /"nxt".*Did you mean "next"\?/);
});

test('flow: an unknown key far from every name has no suggestion', () => {
  const found = ofCheck(flowText((f) => { f.steps.ask.completelydifferent = 1; }), 'field-unknown');
  assert.equal(found.length, 1);
  assert.ok(!found[0].message.includes('Did you mean'));
});

test('flow: the options of a step must be a list of mappings', () => {
  assert.equal(ofCheck(flowText((f) => { f.steps.ask.options = 'a'; }), 'field-invalid').length, 1);
  assert.equal(ofCheck(flowText((f) => { f.steps.ask.options = ['a']; }), 'field-invalid').length, 1);
});

test('flow: an option without a next is edge-missing, with its label', () => {
  const found = ofCheck(flowText((f) => { f.steps.ask.options = [{ label: 'Lonely' }]; }), 'edge-missing');
  assert.equal(found.length, 1);
  assert.match(found[0].message, /"Lonely"/);
});

test('flow: an option with a label that is not text is field-invalid', () => {
  assert.equal(ofCheck(flowText((f) => { f.steps.ask.options = [{ label: 5, next: 'bye' }]; }), 'field-invalid').length, 1);
});

test('flow: a confirm step with only one answer is edge-missing; one with none is a dead end', () => {
  const onlyYes = ofCheck(flowText((f) => { f.steps.sure = { type: 'confirm', text: 'Sure?', reprompt_limit: 1, yes: 'bye', fallback: 'person' }; f.steps.hello.next = 'sure'; }), 'edge-missing');
  assert.equal(onlyYes.length, 1);
  assert.match(onlyYes[0].message, /no "no" step/);
  const onlyNo = ofCheck(flowText((f) => { f.steps.sure = { type: 'confirm', text: 'Sure?', reprompt_limit: 1, no: 'bye', fallback: 'person' }; f.steps.hello.next = 'sure'; }), 'edge-missing');
  assert.match(onlyNo[0].message, /no "yes" step/);
  const none = idsAfter((f) => { f.steps.sure = { type: 'confirm', text: 'Sure?' }; f.steps.hello.next = 'sure'; });
  assert.ok(none.includes('step-dead-end'));
  assert.ok(!none.includes('edge-missing'));
});

test('flow: the name is cut to one line and a description must be text', () => {
  const { flow } = read(flowText((f) => { f.name = 'A   long\n name'; }));
  assert.equal(flow.name, 'A long name');
  assert.equal(ofCheck(flowText((f) => { f.description = 5; }), 'field-invalid').length, 1);
});

test('flow: findings of a step point at the line of the step or of the key', () => {
  const text = flowText((f) => { delete f.steps.ask.fallback; });
  const found = ofCheck(text, 'input-no-fallback');
  assert.equal(found.length, 1);
  assert.equal(found[0].line, lineOf(text, '"ask": {'));
  assert.equal(found[0].column, 5);
  assert.equal(found[0].file, 'flow');
});

test('flow: base() is a fresh copy every time', () => {
  const a = base();
  a.steps.hello.text = 'changed';
  assert.notEqual(base().steps.hello.text, 'changed');
  assert.deepEqual(findingsOf(flowText()), []);
});
