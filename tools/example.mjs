// Runs the README examples, checks that they report what the README shows, and writes the reports of the made-up flows to
// examples/output. CI runs it and then fails if those files changed, so the example output in the repository is always the real
// output.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../src/index.js';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');

// Every path is relative to the root of the repository.
export const BAD = ['examples/bad/support-voice.yaml'];
export const BAD_CHAT = ['examples/bad/booking-chat.json', '--widget', 'examples/bad/widget.html'];
export const BAD_SYNTAX = ['examples/bad/syntax-error.yaml'];
export const GOOD = ['examples/good/booking-chat.yaml', '--widget', 'examples/good/widget.html'];
export const GOOD_VOICE = ['examples/good/support-voice.yaml'];
export const GOOD_JSON = ['examples/good/returns-chat.json'];
export const EXPLAIN = ['--explain', 'flow-trap'];

// Runs the tool on files of the repository; the paths shown in the report are relative to the root of the repository.
export async function run(argv, base = root) {
  let out = '';
  let err = '';
  const code = await main(argv, { out: (t) => { out += t; }, err: (t) => { err += t; } }, undefined, base);
  return { code, out, err };
}

// What the README says of the bad voice flow: the counts, a finding of most checks and the result.
export const EXPECTED = [
  'channel: voice (from the flow file)',
  'steps: 11, 9 reachable from the start (message 6, input 2, choice 1, action 1, end 1)',
  'findings: 19 (10 error, 9 warning)',
  'The choice step "ask_topic" has no fallback, so nothing says what happens when the answer does not match.',
  'The option "person" of the step "ask_topic" leads to "no_such_step", which is not under steps.',
  'An option ("cancel") of the step "ask_topic" has no next step, so choosing it leads nowhere.',
  'The step "fault_logged" (type message) has no step after it and is not marked as an end, so the conversation stops there with nothing for the user to do.',
  'The type of the step "odd_step" is "speech", which is not one of message, input, choice, confirm, action, handover, end.',
  'The flow has 3 steps that wait for the user and no step of type handover, so there is no way to a person.',
  'The step "take_payment" cannot be undone (action "take_card_payment") and runs without a confirm step before it',
  'The step "retry_loop_a" is in a loop with no way out',
  'The step "old_menu" cannot be reached from the start step "greeting".',
  'The step "ask_postcode" has the key "fallbak", which the tool does not read; nothing under it is checked. Did you mean "fallback"?',
  'The choice step "ask_topic" asks again up to 6 times; the limit is 3 (--max-reprompts).',
  'The prompt of the step "greeting" has 35 words; the limit is 30 (--max-words).',
  'The prompt of the step "ask_topic" has 3 question marks.',
  'The opening of the flow ("greeting" and "ask_topic") does not tell the user that they are talking to an automated system or an AI.',
  'This report reads the flow file and nothing else.',
  'RESULT: FAIL - 10 findings at or above error (10 error, 9 warning)'
];
// What must not be reported for it: a check that does not apply to it, and a pass.
export const UNWANTED = ['ERROR    widget-', 'WARNING  widget-', 'RESULT: PASS'];

// What the README says of the good flows: no finding.
export const GOOD_EXPECTED = [
  'findings: 0',
  'RESULT: PASS - no finding at or above error'
];

const problems = [];
function expect(name, result, code, expected, unwanted, stream = 'out') {
  const text = result[stream];
  const missing = expected.filter((e) => !text.includes(e));
  const wrong = unwanted.filter((e) => text.includes(e));
  if (result.code !== code || missing.length || wrong.length) {
    problems.push(`${name}: unexpected report (exit code ${result.code}, expected ${code}; missing: ${missing.join(' / ') || 'none'}; should not appear: ${wrong.join(' / ') || 'none'})${result.err ? `\n${result.err}` : ''}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const bad = await run(BAD);
  process.stdout.write(bad.out);
  expect('bad voice flow', bad, 1, EXPECTED, UNWANTED);

  const good = await run(GOOD);
  expect('good chat flow with its widget', good, 0, GOOD_EXPECTED, ['ERROR    ', 'WARNING  ', 'INFO     ', 'RESULT: FAIL', 'note: ']);
  expect('good voice flow', await run(GOOD_VOICE), 0, GOOD_EXPECTED, ['ERROR    ', 'WARNING  ', 'RESULT: FAIL']);
  expect('good JSON flow', await run(GOOD_JSON), 0, GOOD_EXPECTED, ['ERROR    ', 'WARNING  ', 'RESULT: FAIL']);
  // The good flows also pass when warnings and notes fail the run.
  expect('good, fail on warning', await run([...GOOD, '--fail-on', 'warning']), 0, ['RESULT: PASS - no finding at or above warning'], []);
  expect('good, fail on info', await run([...GOOD, '--fail-on', 'info']), 0, ['RESULT: PASS - no finding at or above info'], []);
  // A voice flow read as chat has nothing to say about wording; the bad one read as voice does.
  expect('bad voice flow read as chat', await run([...BAD, '--channel', 'chat']), 1, ['voice-prompt-too-long          warning  wording  skipped'], ['The prompt of the step "greeting" has 35 words']);
  expect('bad voice flow, longer prompts allowed', await run([...BAD, '--max-words', '40']), 1, [], ['The prompt of the step "greeting" has 35 words']);
  expect('bad voice flow, no way to a person asked for', await run([...BAD, '--handover', 'off']), 1, ['no-handover                    error    flow     skipped'], ['there is no way to a person.']);
  // The bad chat flow with its widget, and the file that cannot be read.
  expect('bad chat flow and widget', await run(BAD_CHAT), 1, [
    'The confirm step "confirm_booking" has no "no" step, so one of the two answers leads nowhere.',
    'From the input step "ask_day" no handover step can be reached',
    'The step "cancel_visit" cannot be undone (irreversible: true) and runs without a confirm step before it',
    'The <div> (id "chat-messages") that looks like the list of messages has no role="log" and no aria-live.',
    'The opening of the flow ("welcome" and "ask_need") does not tell the user'
  ], ['no-handover                    error    flow     fail']);
  expect('flow that cannot be read', await run(BAD_SYNTAX), 1, ['The flow file cannot be read as the YAML subset: a value that holds a colon and a space must be in quotes.', 'examples/bad/syntax-error.yaml:6'], []);
  // A file that is not there stops the run with no report, and so does a value that is not a number.
  expect('missing file', await run(['examples/none/flow.yaml']), 2, ['examples/none/flow.yaml: does not exist'], [], 'err');
  expect('limit that is not a number', await run([...GOOD_VOICE, '--max-words', 'many']), 2, ['--max-words: many is not a whole number from 1 to 1000'], [], 'err');

  // The README shows the head of the report of the bad flow, two of its findings and its end, and the head of a good one.
  const readme = (await readFile(resolve(root, 'README.md'), 'utf8')).split('\r\n').join('\n');
  const lines = bad.out.split('\n');
  const head = lines.slice(0, lines.findIndex((l) => l === 'Checks (20)')).join('\n').trimEnd();
  if (!readme.includes(head)) problems.push('README: the head of the sample output of the bad flow differs from a real run');
  for (const [id, at] of [['flow-trap', 'examples/bad/support-voice.yaml:51'], ['irreversible-unconfirmed', 'examples/bad/support-voice.yaml:42']]) {
    const i = lines.findIndex((l) => l.includes(id) && l.includes(at));
    const sample = lines.slice(i, i + 3).join('\n');
    if (i < 0 || !readme.includes(sample)) problems.push(`README: the sample finding of ${id} differs from a real run`);
  }
  const tail = lines.slice(-4).join('\n');
  if (!readme.includes(tail)) problems.push('README: the tail of the sample output of the bad flow differs from a real run');
  const goodLines = good.out.split('\n');
  const goodHead = goodLines.slice(0, goodLines.findIndex((l) => l === 'Checks (20)')).join('\n').trimEnd();
  if (!readme.includes(goodHead)) problems.push('README: the head of the sample output of the good flow differs from a real run');
  const goodTail = goodLines.slice(-4).join('\n');
  if (!readme.includes(goodTail)) problems.push('README: the tail of the sample output of the good flow differs from a real run');

  await mkdir(resolve(root, 'examples/output'), { recursive: true });
  const outputs = [
    ['bad.txt', BAD, 1],
    ['bad.md', [...BAD, '--format', 'markdown'], 1],
    ['bad.json', [...BAD, '--json'], 1],
    ['bad.sarif', [...BAD, '--format', 'sarif'], 1],
    ['bad.junit.xml', [...BAD, '--format', 'junit'], 1],
    ['bad-chat-and-widget.txt', BAD_CHAT, 1],
    ['bad-syntax-error.txt', BAD_SYNTAX, 1],
    ['good.txt', GOOD, 0],
    ['good.md', [...GOOD, '--format', 'markdown'], 0],
    ['good.json', [...GOOD, '--json'], 0],
    ['good.sarif', [...GOOD, '--format', 'sarif'], 0],
    ['good.junit.xml', [...GOOD, '--format', 'junit'], 0],
    ['good-voice.txt', GOOD_VOICE, 0],
    ['good-json-flow.txt', GOOD_JSON, 0],
    ['checks.txt', ['--list-checks'], 0],
    ['checks.md', ['--list-checks', '--format', 'markdown'], 0],
    ['checks.json', ['--list-checks', '--format', 'json'], 0],
    ['explain-flow-trap.txt', EXPLAIN, 0],
    ['explain-flow-trap.md', [...EXPLAIN, '--format', 'markdown'], 0]
  ];
  for (const [name, args, code] of outputs) {
    const r = await run(args);
    if (r.code !== code) problems.push(`${name}: exit code ${r.code}, expected ${code}`);
    await writeFile(resolve(root, 'examples/output', name), r.out);
  }

  if (problems.length) {
    for (const p of problems) console.error(`example: ${p}`);
    process.exit(1);
  }
}
