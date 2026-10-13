import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph, canReach, containsPhrase, isIrreversible, questionMarks, reachableFrom, tokensOf, wordCount } from '../src/index.js';
import { flowText, idsAfter, lineOf, ofCheck } from './helpers.js';

const words = (list) => new Set(list);

// ---------- start, edges, reachability, dead ends, loops ----------

test('start-unknown: a start that is not under steps', () => {
  const text = flowText((f) => { f.start = 'nowhere'; });
  const found = ofCheck(text, 'start-unknown');
  assert.equal(found.length, 1);
  assert.equal(found[0].line, lineOf(text, '"start"'));
  assert.match(found[0].message, /"nowhere"/);
});

test('start-unknown: the start is compared with case, and the reachability checks do not run', () => {
  const ids = idsAfter((f) => { f.start = 'Hello'; });
  assert.deepEqual(ids, ['start-unknown']);
});

test('start-unknown: near miss, the start spelt as the step is fine', () => {
  assert.deepEqual(idsAfter((f) => { f.start = 'hello'; }), []);
});

test('step-target-unknown: next, yes, no, fallback, on_error and an option to a step that is not there', () => {
  for (const key of ['next', 'fallback', 'on_error']) {
    const found = ofCheck(flowText((f) => { f.steps.ask[key] = 'ghost'; }), 'step-target-unknown');
    assert.equal(found.length, 1, key);
    assert.match(found[0].message, new RegExp(`"${key}" of the step "ask" leads to "ghost"`));
  }
  const confirm = (f) => { f.steps.sure = { type: 'confirm', text: 'Sure?', reprompt_limit: 1, yes: 'ghost', no: 'ghost2', fallback: 'person' }; f.steps.hello.next = 'sure'; };
  assert.equal(ofCheck(flowText(confirm), 'step-target-unknown').length, 2);
  const option = ofCheck(flowText((f) => { f.steps.ask.options = [{ label: 'Pick me', next: 'ghost' }]; }), 'step-target-unknown');
  assert.equal(option.length, 1);
  assert.match(option[0].message, /option "Pick me"/);
});

test('step-target-unknown: the finding is at the line of the edge', () => {
  const text = flowText((f) => { f.steps.ask.next = 'ghost'; });
  assert.equal(ofCheck(text, 'step-target-unknown')[0].line, lineOf(text, '"ghost"'));
});

test('step-target-unknown: near miss, a target spelt with another case is unknown', () => {
  assert.equal(ofCheck(flowText((f) => { f.steps.ask.next = 'Bye'; }), 'step-target-unknown').length, 1);
  assert.equal(ofCheck(flowText((f) => { f.steps.ask.next = 'bye'; }), 'step-target-unknown').length, 0);
});

test('step-unreachable: a step nothing leads to', () => {
  const found = ofCheck(flowText((f) => { f.steps.orphan = { type: 'end', text: 'Never shown.' }; }), 'step-unreachable');
  assert.equal(found.length, 1);
  assert.match(found[0].message, /"orphan".*"hello"/);
});

test('step-unreachable: a step reached only through a fallback or an option is reachable', () => {
  assert.deepEqual(idsAfter((f) => { delete f.steps.ask.fallback; f.steps.ask.options = [{ label: 'x', next: 'person' }]; }), ['input-no-fallback']);
});

test('step-unreachable: a chain of unreachable steps is reported for each step', () => {
  const found = ofCheck(flowText((f) => { f.steps.a = { type: 'message', text: 'a', next: 'b' }; f.steps.b = { type: 'end', text: 'b' }; }), 'step-unreachable');
  assert.deepEqual(found.map((x) => x.subject), ['a', 'b']);
});

test('step-unreachable: a step reached only from an unreachable step is unreachable', () => {
  const ids = idsAfter((f) => { f.steps.a = { type: 'message', text: 'a', next: 'late' }; f.steps.late = { type: 'end', text: 'b' }; });
  assert.equal(ids.filter((i) => i === 'step-unreachable').length, 2);
});

test('step-dead-end: a message with no next that is not marked as an end', () => {
  const found = ofCheck(flowText((f) => { delete f.steps.hello.next; }), 'step-dead-end');
  assert.equal(found.length, 1);
  assert.match(found[0].message, /"hello" \(type message\)/);
});

test('step-dead-end: near misses, an end, a handover and end: true are not dead ends', () => {
  assert.equal(ofCheck(flowText(), 'step-dead-end').length, 0);
  assert.equal(ofCheck(flowText((f) => { delete f.steps.hello.next; f.steps.hello.end = true; f.steps.ask.next = 'bye'; }), 'step-dead-end').length, 0);
  assert.equal(ofCheck(flowText((f) => { f.steps.bye = { type: 'message', text: 'Bye', end: true }; }), 'step-dead-end').length, 0);
});

test('step-dead-end: an action with no next, and an input with no next', () => {
  const ids = idsAfter((f) => { f.steps.act = { type: 'action', action: 'look_up' }; f.steps.hello.next = 'act'; });
  assert.equal(ids.filter((i) => i === 'step-dead-end').length, 1);
  const ids2 = idsAfter((f) => { delete f.steps.ask.next; delete f.steps.ask.fallback; });
  assert.ok(ids2.includes('step-dead-end'));
});

test('step-dead-end: a step whose only edge leads to an unknown step is not a dead end, but its edge is reported', () => {
  const ids = idsAfter((f) => { f.steps.hello.next = 'ghost'; });
  assert.ok(ids.includes('step-target-unknown'));
  assert.ok(!ids.includes('step-dead-end'));
});

test('flow-trap: two steps that lead to each other with no way out', () => {
  const found = ofCheck(flowText((f) => { f.steps.hello.next = 'a'; f.steps.a = { type: 'message', text: 'a', next: 'b' }; f.steps.b = { type: 'message', text: 'b', next: 'a' }; }), 'flow-trap');
  assert.deepEqual(found.map((x) => x.subject), ['hello', 'a', 'b']);
});

test('flow-trap: a step that leads to itself', () => {
  const found = ofCheck(flowText((f) => { f.steps.hello.next = 'hello'; }), 'flow-trap');
  assert.deepEqual(found.map((x) => x.subject), ['hello']);
});

test('flow-trap: near miss, a loop with one edge out is not a trap', () => {
  assert.deepEqual(idsAfter((f) => { f.steps.a = { type: 'input', text: 'Again?', reprompt_limit: 1, next: 'hello', fallback: 'bye' }; f.steps.ask.next = 'a'; }), []);
  assert.deepEqual(idsAfter((f) => { f.steps.ask.next = 'hello'; }), ['step-unreachable']);
});

test('flow-trap: a loop that is not reachable is only unreachable', () => {
  const ids = idsAfter((f) => { f.steps.a = { type: 'message', text: 'a', next: 'b' }; f.steps.b = { type: 'message', text: 'b', next: 'a' }; });
  assert.equal(ids.filter((i) => i === 'flow-trap').length, 0);
  assert.equal(ids.filter((i) => i === 'step-unreachable').length, 2);
});

test('flow-trap: a loop that leads to a dead end is reported as the dead end, not as a trap', () => {
  const ids = idsAfter((f) => { f.steps.ask.next = 'a'; f.steps.a = { type: 'message', text: 'a', next: 'dead' }; f.steps.dead = { type: 'message', text: 'b' }; });
  assert.ok(ids.includes('step-dead-end'));
  assert.ok(!ids.includes('flow-trap'));
});

// ---------- input steps ----------

test('input-no-fallback: input, choice and confirm without a fallback', () => {
  assert.equal(ofCheck(flowText((f) => { delete f.steps.ask.fallback; }), 'input-no-fallback').length, 1);
  const choice = ofCheck(flowText((f) => { f.steps.ask = { type: 'choice', text: 'Pick', reprompt_limit: 1, options: [{ label: 'a', next: 'bye' }, { label: 'b', next: 'person' }] }; }), 'input-no-fallback');
  assert.equal(choice.length, 1);
  assert.match(choice[0].message, /choice step "ask"/);
  const confirm = ofCheck(flowText((f) => { f.steps.ask = { type: 'confirm', text: 'Sure?', reprompt_limit: 1, yes: 'bye', no: 'person' }; }), 'input-no-fallback');
  assert.match(confirm[0].message, /confirm step "ask"/);
});

test('input-no-fallback: near misses, a message and an action need no fallback', () => {
  assert.deepEqual(idsAfter((f) => { f.steps.hello.text = 'Hi, I am an automated assistant.'; }), []);
  assert.equal(ofCheck(flowText((f) => { f.steps.act = { type: 'action', action: 'look_up', next: 'bye' }; f.steps.ask.next = 'act'; }), 'input-no-fallback').length, 0);
});

test('input-no-fallback: an on_error or next is not a fallback', () => {
  assert.equal(ofCheck(flowText((f) => { delete f.steps.ask.fallback; f.steps.ask.on_error = 'person'; }), 'input-no-fallback').length, 1);
});

test('input-no-reprompt-limit: no reprompt_limit on an input step is a warning', () => {
  const found = ofCheck(flowText((f) => { delete f.steps.ask.reprompt_limit; }), 'input-no-reprompt-limit');
  assert.equal(found.length, 1);
  assert.equal(found[0].subject, 'ask');
});

test('input-no-reprompt-limit: near miss, a limit of 0 is a limit', () => {
  assert.deepEqual(idsAfter((f) => { f.steps.ask.reprompt_limit = 0; }), []);
});

test('reprompt-limit-high: above 3 by default, 3 itself is fine', () => {
  assert.equal(ofCheck(flowText((f) => { f.steps.ask.reprompt_limit = 4; }), 'reprompt-limit-high').length, 1);
  assert.equal(ofCheck(flowText((f) => { f.steps.ask.reprompt_limit = 3; }), 'reprompt-limit-high').length, 0);
});

test('reprompt-limit-high: --max-reprompts sets the limit', () => {
  assert.equal(ofCheck(flowText((f) => { f.steps.ask.reprompt_limit = 3; }), 'reprompt-limit-high', { maxReprompts: '2' }).length, 1);
  assert.equal(ofCheck(flowText((f) => { f.steps.ask.reprompt_limit = 5; }), 'reprompt-limit-high', { maxReprompts: '5' }).length, 0);
  assert.equal(ofCheck(flowText((f) => { f.steps.ask.reprompt_limit = 1; }), 'reprompt-limit-high', { maxReprompts: '0' }).length, 1);
});

// ---------- the way to a person ----------

test('no-handover: input steps and no handover step', () => {
  const found = ofCheck(flowText((f) => { delete f.steps.person; f.steps.ask.fallback = 'bye'; }), 'no-handover');
  assert.equal(found.length, 1);
  assert.match(found[0].message, /1 step that wait/);
});

test('no-handover: near misses, a flow with no input step needs no handover', () => {
  const ids = idsAfter((f) => { delete f.steps.person; delete f.steps.ask; f.steps.hello.next = 'bye'; });
  assert.deepEqual(ids, []);
});

test('no-handover: a step of type end named handover is not a handover', () => {
  const found = ofCheck(flowText((f) => { f.steps.person.type = 'end'; }), 'no-handover');
  assert.equal(found.length, 1);
});

test('handover-unreachable: an input step that cannot reach a handover', () => {
  const found = ofCheck(flowText((f) => { f.steps.second = { type: 'input', text: 'Why?', reprompt_limit: 1, next: 'bye', fallback: 'bye' }; f.steps.ask.next = 'second'; }), 'handover-unreachable');
  assert.deepEqual(found.map((x) => x.subject), ['second']);
});

test('handover-unreachable: reaching a handover through a later step counts', () => {
  assert.deepEqual(idsAfter((f) => { f.steps.second = { type: 'input', text: 'Why?', reprompt_limit: 1, next: 'bye', fallback: 'person' }; f.steps.ask.next = 'second'; }), []);
});

test('handover-unreachable: a step that cannot be reached is not reported', () => {
  const ids = idsAfter((f) => { f.steps.second = { type: 'input', text: 'Why?', reprompt_limit: 1, next: 'bye', fallback: 'bye' }; });
  assert.ok(!ids.includes('handover-unreachable'));
  assert.ok(ids.includes('step-unreachable'));
});

test('handover mode any: one handover step is enough', () => {
  const change = (f) => { f.steps.second = { type: 'input', text: 'Why?', reprompt_limit: 1, next: 'bye', fallback: 'bye' }; f.steps.ask.next = 'second'; };
  assert.equal(ofCheck(flowText(change), 'handover-unreachable', { handover: 'any' }).length, 0);
  assert.equal(ofCheck(flowText(change), 'handover-unreachable', { handover: 'every-input' }).length, 1);
  assert.equal(ofCheck(flowText((f) => { change(f); delete f.steps.person; f.steps.ask.fallback = 'bye'; }), 'no-handover', { handover: 'any' }).length, 1);
});

test('handover mode off: neither check runs', () => {
  const change = (f) => { delete f.steps.person; f.steps.ask.fallback = 'bye'; };
  assert.deepEqual(ofCheck(flowText(change), 'no-handover', { handover: 'off' }), []);
});

// ---------- voice wording ----------

test('voice-multiple-questions: two question marks in a voice prompt', () => {
  const text = flowText((f) => { f.channel = 'voice'; f.steps.ask.text = 'Is it a fault? Or a bill?'; });
  const found = ofCheck(text, 'voice-multiple-questions');
  assert.equal(found.length, 1);
  assert.equal(found[0].line, lineOf(text, '"Is it a fault? Or a bill?"'));
});

test('voice-multiple-questions: near misses, one question, none, and the chat channel', () => {
  assert.equal(ofCheck(flowText((f) => { f.channel = 'voice'; f.steps.ask.text = 'Is it a fault or a bill?'; }), 'voice-multiple-questions').length, 0);
  assert.equal(ofCheck(flowText((f) => { f.channel = 'voice'; f.steps.ask.text = 'Say your name.'; }), 'voice-multiple-questions').length, 0);
  assert.equal(ofCheck(flowText((f) => { f.steps.ask.text = 'Is it a fault? Or a bill?'; }), 'voice-multiple-questions').length, 0);
});

test('voice-multiple-questions: a full-width question mark counts', () => {
  assert.equal(ofCheck(flowText((f) => { f.channel = 'voice'; f.steps.ask.text = `One${String.fromCharCode(0xff1f)} Two?`; }), 'voice-multiple-questions').length, 1);
});

test('voice-multiple-questions: it also looks at message steps', () => {
  assert.equal(ofCheck(flowText((f) => { f.channel = 'voice'; f.steps.hello.text = 'Hi, I am an automated assistant. Ready? Sure?'; }), 'voice-multiple-questions').length, 1);
});

test('voice-prompt-too-long: more than 30 words by default, 30 is fine', () => {
  const n = (k) => Array.from({ length: k }, (_, i) => `w${i}`).join(' ');
  assert.equal(ofCheck(flowText((f) => { f.channel = 'voice'; f.steps.ask.text = n(31); }), 'voice-prompt-too-long').length, 1);
  assert.equal(ofCheck(flowText((f) => { f.channel = 'voice'; f.steps.ask.text = n(30); }), 'voice-prompt-too-long').length, 0);
});

test('voice-prompt-too-long: --max-words sets the limit, white space is one separator', () => {
  const text = flowText((f) => { f.channel = 'voice'; f.steps.hello.text = 'I am a bot.'; f.steps.ask.text = 'one  two\nthree\tfour five'; });
  assert.equal(ofCheck(text, 'voice-prompt-too-long', { maxWords: '4' }).length, 1);
  assert.equal(ofCheck(text, 'voice-prompt-too-long', { maxWords: '5' }).length, 0);
});

test('voice-prompt-too-long: the chat channel is not checked, and --channel voice overrides the file', () => {
  const long = Array.from({ length: 40 }, (_, i) => `w${i}`).join(' ');
  assert.equal(ofCheck(flowText((f) => { f.steps.ask.text = long; }), 'voice-prompt-too-long').length, 0);
  assert.equal(ofCheck(flowText((f) => { f.steps.ask.text = long; }), 'voice-prompt-too-long', { channel: 'voice' }).length, 1);
  assert.equal(ofCheck(flowText((f) => { f.channel = 'voice'; f.steps.ask.text = long; }), 'voice-prompt-too-long', { channel: 'chat' }).length, 0);
});

test('voice: end and handover text is not checked', () => {
  const long = Array.from({ length: 40 }, (_, i) => `w${i}`).join(' ');
  assert.equal(ofCheck(flowText((f) => { f.channel = 'voice'; f.steps.bye.text = long; f.steps.person.text = long; }), 'voice-prompt-too-long').length, 0);
});

// ---------- irreversible actions ----------

const actionFlow = (action, over = {}, how = 'next') => (f) => {
  f.steps.act = { type: 'action', action, next: 'bye', ...over };
  f.steps.sure = { type: 'confirm', text: 'Go ahead?', reprompt_limit: 1, yes: 'act', no: 'person', fallback: 'person' };
  if (how === 'next') f.steps.ask.next = 'act';
  else f.steps.ask.next = 'sure';
};

test('irreversible-unconfirmed: a payment reached by next from an input step', () => {
  const found = ofCheck(flowText(actionFlow('take_payment')), 'irreversible-unconfirmed');
  assert.equal(found.length, 1);
  assert.match(found[0].message, /action "take_payment"/);
  assert.match(found[0].message, /"ask" \(next\)/);
});

test('irreversible-unconfirmed: near miss, the same action behind a confirm step is fine', () => {
  assert.deepEqual(ofCheck(flowText(actionFlow('take_payment', {}, 'confirm')), 'irreversible-unconfirmed'), []);
});

test('irreversible-unconfirmed: every word of the default list marks an action', () => {
  for (const w of ['pay', 'payment', 'charge', 'purchase', 'checkout', 'book', 'booking', 'reserve', 'cancel', 'delete', 'remove', 'erase', 'refund', 'transfer', 'order', 'submit', 'terminate']) {
    assert.equal(ofCheck(flowText(actionFlow(`${w}_thing`)), 'irreversible-unconfirmed').length, 1, w);
  }
});

test('irreversible-unconfirmed: an action name is split at underscores, dashes, spaces and capitals', () => {
  for (const name of ['do-refund', 'do refund', 'doRefund', 'DO_REFUND', 'refunds_all']) {
    assert.equal(ofCheck(flowText(actionFlow(name)), 'irreversible-unconfirmed').length, 1, name);
  }
});

test('irreversible-unconfirmed: near misses, a word inside a longer word is not a match', () => {
  for (const name of ['payload', 'booklet', 'reorder_list', 'lookup', 'transferable']) {
    assert.equal(ofCheck(flowText(actionFlow(name)), 'irreversible-unconfirmed').length, 0, name);
  }
});

test('irreversible-unconfirmed: irreversible: true marks any step, false clears the words', () => {
  assert.equal(ofCheck(flowText(actionFlow('look_up', { irreversible: true })), 'irreversible-unconfirmed').length, 1);
  assert.equal(ofCheck(flowText(actionFlow('take_payment', { irreversible: false })), 'irreversible-unconfirmed').length, 0);
  assert.equal(ofCheck(flowText((f) => { f.steps.ask.irreversible = true; }), 'irreversible-unconfirmed').length, 1);
});

test('irreversible-unconfirmed: an action step with no action field uses its id', () => {
  const found = ofCheck(flowText((f) => { f.steps.cancel_booking = { type: 'action', next: 'bye' }; f.steps.ask.next = 'cancel_booking'; }), 'irreversible-unconfirmed');
  assert.equal(found.length, 1);
  assert.match(found[0].message, /action "cancel_booking"/);
});

test('irreversible-unconfirmed: a step that is not an action is not marked by its words', () => {
  assert.equal(ofCheck(flowText((f) => { f.steps.ask.action = 'delete_all'; }), 'irreversible-unconfirmed').length, 0);
  assert.equal(ofCheck(flowText((f) => { f.steps.hello.text = 'Pay now'; }), 'irreversible-unconfirmed').length, 0);
});

test('irreversible-unconfirmed: the no answer of a confirm step does not confirm', () => {
  const found = ofCheck(flowText((f) => {
    f.steps.act = { type: 'action', action: 'delete_account', next: 'bye' };
    f.steps.sure = { type: 'confirm', text: 'Keep it?', reprompt_limit: 1, yes: 'person', no: 'act', fallback: 'person' };
    f.steps.ask.next = 'sure';
  }), 'irreversible-unconfirmed');
  assert.equal(found.length, 1);
  assert.match(found[0].message, /"sure" \(no\)/);
});

test('irreversible-unconfirmed: one unconfirmed way in is enough to report it', () => {
  const found = ofCheck(flowText((f) => {
    actionFlow('take_payment', {}, 'confirm')(f);
    f.steps.ask.fallback = 'act';
  }), 'irreversible-unconfirmed');
  assert.equal(found.length, 1);
  assert.match(found[0].message, /"ask" \(fallback\)/);
});

test('irreversible-unconfirmed: two confirm steps that both lead to the action are fine', () => {
  const found = ofCheck(flowText((f) => {
    actionFlow('take_payment', {}, 'confirm')(f);
    f.steps.sure2 = { type: 'confirm', text: 'Really?', reprompt_limit: 1, yes: 'act', no: 'person', fallback: 'person' };
    f.steps.ask.fallback = 'sure2';
  }), 'irreversible-unconfirmed');
  assert.deepEqual(found, []);
});

test('irreversible-unconfirmed: the start step cannot be confirmed, and a step nothing leads to is not confirmed', () => {
  const start = ofCheck(flowText((f) => { f.steps.hello = { type: 'action', action: 'delete_all', text: 'Hi, I am an automated assistant.', next: 'ask' }; }), 'irreversible-unconfirmed');
  assert.equal(start.length, 1);
  assert.match(start[0].message, /start step/);
  const orphan = ofCheck(flowText((f) => { f.steps.act = { type: 'action', action: 'delete_all', next: 'bye' }; }), 'irreversible-unconfirmed');
  assert.equal(orphan.length, 1);
  assert.match(orphan[0].message, /no step leads to it/);
});

test('irreversible-unconfirmed: --irreversible-actions replaces the list; none leaves irreversible: true only', () => {
  assert.equal(ofCheck(flowText(actionFlow('take_payment')), 'irreversible-unconfirmed', { irreversibleActions: 'ship' }).length, 0);
  assert.equal(ofCheck(flowText(actionFlow('ship_parcel')), 'irreversible-unconfirmed', { irreversibleActions: 'ship' }).length, 1);
  assert.equal(ofCheck(flowText(actionFlow('take_payment')), 'irreversible-unconfirmed', { irreversibleActions: 'none' }).length, 0);
  assert.equal(ofCheck(flowText(actionFlow('take_payment', { irreversible: true })), 'irreversible-unconfirmed', { irreversibleActions: 'none' }).length, 1);
  assert.equal(ofCheck(flowText(actionFlow('Ship_Parcel')), 'irreversible-unconfirmed', { irreversibleActions: ' SHIP , other ' }).length, 1);
});

// ---------- the opening ----------

test('ai-disclosure-missing: an opening that does not say what the user talks to', () => {
  const text = flowText((f) => { f.steps.hello.text = 'Welcome! How can we help?'; });
  const found = ofCheck(text, 'ai-disclosure-missing');
  assert.equal(found.length, 1);
  assert.equal(found[0].line, lineOf(text, '"Welcome!'));
  assert.match(found[0].message, /Article 50 of the EU AI Act/);
});

test('ai-disclosure-missing: each default phrase is accepted, in any case', () => {
  for (const phrase of ['automated', 'a bot', 'chatbot', 'an AI', 'Artificial Intelligence', 'virtual assistant', 'digital assistant', 'not a human', 'not a person', 'not a real person', 'BOT']) {
    assert.equal(ofCheck(flowText((f) => { f.steps.hello.text = `Hi, I am ${phrase}.`; }), 'ai-disclosure-missing').length, 0, phrase);
  }
});

test('ai-disclosure-missing: near misses, words that only contain a phrase do not count', () => {
  for (const text of ['Hi, I am robotic.', 'Hi, welcome to Bottle Shop.', 'Hi, I am Aimee.', 'Hi, we are automatic.', 'Hi, I am an assistant.']) {
    assert.equal(ofCheck(flowText((f) => { f.steps.hello.text = text; }), 'ai-disclosure-missing').length, 1, text);
  }
});

test('ai-disclosure-missing: a phrase of several words must come in order', () => {
  assert.equal(ofCheck(flowText((f) => { f.steps.hello.text = 'Intelligence is artificial here.'; }), 'ai-disclosure-missing').length, 1);
  assert.equal(ofCheck(flowText((f) => { f.steps.hello.text = 'This is artificial   intelligence.'; }), 'ai-disclosure-missing').length, 0);
});

test('ai-disclosure-missing: the opening runs through message steps up to the first question', () => {
  const second = (f) => {
    f.steps.hello.text = 'Welcome!';
    f.steps.hello.next = 'intro';
    f.steps.intro = { type: 'message', text: 'I am a virtual assistant.', next: 'ask' };
  };
  assert.equal(ofCheck(flowText(second), 'ai-disclosure-missing').length, 0);
  const third = (f) => { second(f); f.steps.intro.text = 'Welcome again!'; f.steps.ask.text = 'I am a bot. What is your name?'; };
  assert.equal(ofCheck(flowText(third), 'ai-disclosure-missing').length, 0);
});

test('ai-disclosure-missing: what is said after the first question does not count', () => {
  assert.equal(ofCheck(flowText((f) => { f.steps.hello.text = 'Welcome!'; f.steps.bye.text = 'I am a bot.'; f.steps.person.text = 'I am automated.'; }), 'ai-disclosure-missing').length, 1);
});

test('ai-disclosure-missing: a start step with no text is reported at the step', () => {
  const text = flowText((f) => { delete f.steps.hello.text; });
  const found = ofCheck(text, 'ai-disclosure-missing');
  assert.equal(found.length, 1);
  assert.equal(found[0].line, lineOf(text, '"hello": {'));
});

test('ai-disclosure-missing: a loop of message steps in the opening ends', () => {
  assert.equal(ofCheck(flowText((f) => { f.steps.hello.text = 'Hi'; f.steps.hello.next = 'again'; f.steps.again = { type: 'message', text: 'Hi again', next: 'hello' }; }), 'ai-disclosure-missing').length, 1);
});

test('ai-disclosure-missing: --disclosure-phrases replaces the list', () => {
  const text = flowText((f) => { f.steps.hello.text = 'Hello, I am Robo, a computer program.'; });
  assert.equal(ofCheck(text, 'ai-disclosure-missing').length, 1);
  assert.equal(ofCheck(text, 'ai-disclosure-missing', { disclosurePhrases: 'computer program, other' }).length, 0);
  assert.equal(ofCheck(flowText(), 'ai-disclosure-missing', { disclosurePhrases: 'computer program' }).length, 1);
});

test('ai-disclosure-missing: the check does not run when the start does not exist', () => {
  assert.deepEqual(idsAfter((f) => { f.start = 'ghost'; f.steps.hello.text = 'Hi'; }), ['start-unknown']);
});

// ---------- the functions the checks use ----------

test('tokensOf: lower case words split at anything but a letter or a digit', () => {
  assert.deepEqual(tokensOf("Hello, I'm A-I (v2)!"), ['hello', 'i', 'm', 'a', 'i', 'v2']);
  assert.deepEqual(tokensOf(''), []);
  const e = String.fromCharCode(0xe9);
  const u = String.fromCharCode(0xdc);
  assert.deepEqual(tokensOf(`Caf${e} ${u}ber`), [`caf${e}`, `${String.fromCharCode(0xfc)}ber`]);
});

test('containsPhrase: whole words in order', () => {
  assert.equal(containsPhrase(['a', 'virtual', 'assistant'], ['virtual', 'assistant']), true);
  assert.equal(containsPhrase(['virtual', 'big', 'assistant'], ['virtual', 'assistant']), false);
  assert.equal(containsPhrase(['bot'], ['bot']), true);
  assert.equal(containsPhrase(['bot'], []), false);
  assert.equal(containsPhrase(['a'], ['a', 'b']), false);
});

test('wordCount and questionMarks', () => {
  assert.equal(wordCount('  one   two\nthree '), 3);
  assert.equal(wordCount(''), 0);
  assert.equal(questionMarks('a? b?? c'), 3);
  assert.equal(questionMarks('none'), 0);
});

test('isIrreversible: the rules in one place', () => {
  const w = words(['refund']);
  assert.equal(isIrreversible({ type: 'action', id: 'x', action: 'refund', irreversible: null }, w), true);
  assert.equal(isIrreversible({ type: 'action', id: 'refund', action: null, irreversible: null }, w), true);
  assert.equal(isIrreversible({ type: 'action', id: 'x', action: 'refund', irreversible: false }, w), false);
  assert.equal(isIrreversible({ type: 'message', id: 'refund', action: null, irreversible: null }, w), false);
  assert.equal(isIrreversible({ type: 'message', id: 'x', action: null, irreversible: true }, w), true);
});

test('graph: reachability forward and backward, with a loop and a missing target', () => {
  const steps = new Map([
    ['a', { id: 'a', edges: [{ kind: 'next', to: 'b' }] }],
    ['b', { id: 'b', edges: [{ kind: 'next', to: 'a' }, { kind: 'fallback', to: 'c' }, { kind: 'next', to: 'ghost' }] }],
    ['c', { id: 'c', edges: [] }],
    ['d', { id: 'd', edges: [{ kind: 'next', to: 'c' }] }]
  ]);
  const g = buildGraph({ steps });
  assert.deepEqual([...reachableFrom(['a'], g.out)].sort(), ['a', 'b', 'c']);
  assert.deepEqual([...canReach(['c'], g.into)].sort(), ['a', 'b', 'c', 'd']);
  assert.deepEqual([...canReach(['a'], g.into)].sort(), ['a', 'b']);
  assert.deepEqual([...reachableFrom(['ghost'], g.out)], []);
  assert.deepEqual(g.into.get('c').map((e) => [e.from, e.kind]), [['b', 'fallback'], ['d', 'next']]);
});
