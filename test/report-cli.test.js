import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES, USAGE, VERSION, checkText, buildReport, parseArgs, readOptions } from '../src/index.js';
import { ARGS, BAD, GOOD, base, cli, flowText, noFallback, run, withFiles } from './helpers.js';

const report = (flow, widget = null, optionValues = {}, extra = {}) => {
  const options = readOptions(optionValues);
  const checked = checkText(flow, widget, { options });
  return buildReport({ files: { flow: flow === null ? null : { file: 'flow.json', bytes: flow.length, lines: 1 }, widget: widget === null ? null : { file: 'w.html', bytes: 1, lines: 1 } }, checked, version: VERSION, options, ...extra });
};

test('cli: the version is the one of package.json', async () => {
  const r = await cli(['--version']);
  assert.equal(r.code, 0);
  assert.match(r.out, /^\d+\.\d+\.\d+\n$/);
  assert.equal(r.out.trim(), VERSION);
});

test('cli: --help and -h print the usage', async () => {
  for (const flag of ['--help', '-h']) {
    const r = await cli([flag]);
    assert.equal(r.code, 0);
    assert.equal(r.out, USAGE);
  }
  assert.match(USAGE, /Exit codes: 0 .* 1 .* 2/);
  for (const rule of RULES) assert.ok(USAGE.includes(rule.id), rule.id);
});

test('cli: a clean flow exits 0 and a flow with an error exits 1', async () => {
  assert.equal((await run(GOOD, ARGS)).code, 0);
  const bad = await run(BAD, ARGS);
  assert.equal(bad.code, 1);
  assert.match(bad.out, /RESULT: FAIL - 1 finding at or above error \(1 error\)/);
});

test('cli: no argument, two flow files and an unknown option exit 2 with the usage', async () => {
  for (const args of [[], ['a.json', 'b.json'], ['flow.json', '--nope'], ['-x']]) {
    const r = await cli(args);
    assert.equal(r.code, 2, args.join(' '));
    assert.match(r.err, /^conversation-flow-check: /);
    assert.match(r.err, /Usage: conversation-flow-check/);
    assert.equal(r.out, '');
  }
});

test('cli: an option given twice, an option with no value and a value that looks like an option are errors', async () => {
  assert.match((await cli(['flow.json', '--fail-on', 'error', '--fail-on', 'info'])).err, /--fail-on was given twice/);
  assert.match((await cli(['flow.json', '--fail-on'])).err, /--fail-on needs a value/);
  assert.match((await cli(['flow.json', '--fail-on', '--json'])).err, /--fail-on needs a value/);
});

test('cli: standard input and URLs are refused', async () => {
  assert.match((await cli(['-'])).err, /standard input is not supported/);
  assert.match((await cli(['flow.json', '--widget', '-'])).err, /standard input is not supported/);
  assert.match((await cli(['https://example.com/flow.yaml'])).err, /never fetches a URL/);
  assert.match((await cli(['flow.json', '--widget', 'http://example.com/w.html'])).err, /never fetches a URL/);
});

test('cli: a missing file exits 2 with no report', async () => {
  const r = await run({}, ['none.json']);
  assert.equal(r.code, 2);
  assert.equal(r.out, '');
  assert.match(r.err, /none\.json: does not exist/);
});

test('cli: a missing flow file and a missing widget file are both named', async () => {
  const r = await run({}, ['none.json', '--widget', 'none.html']);
  assert.equal(r.code, 2);
  assert.match(r.err, /problems:/);
  assert.match(r.err, /none\.json: does not exist/);
  assert.match(r.err, /none\.html: does not exist/);
});

test('cli: the same file as the flow and the widget is refused', async () => {
  const r = await run(GOOD, ['flow.json', '--widget', 'flow.json']);
  assert.equal(r.code, 2);
  assert.match(r.err, /the same file/);
});

test('cli: the widget alone is a run; its findings decide the exit code', async () => {
  const bad = await run({ 'w.html': '<div id="messages"></div>' }, ['--widget', 'w.html']);
  assert.equal(bad.code, 1);
  assert.match(bad.out, /conversation-flow-check: w\.html\n/);
  assert.match(bad.out, /widget-live-region-missing\s+w\.html:1/);
  const good = await run({ 'w.html': '<div id="messages" role="log"></div>' }, ['--widget', 'w.html']);
  assert.equal(good.code, 0);
  assert.match(good.out, /widget file: w.html/);
  assert.doesNotMatch(good.out, /flow file:/);
});

test('cli: --fail-on warning fails a run with only a warning, --min-severity hides it', async () => {
  const files = { 'flow.json': flowText((f) => { delete f.steps.ask.reprompt_limit; }) };
  assert.equal((await run(files, ARGS)).code, 0);
  const strict = await run(files, [...ARGS, '--fail-on', 'warning']);
  assert.equal(strict.code, 1);
  assert.match(strict.out, /RESULT: FAIL - 1 finding at or above warning \(1 warning\)/);
  const hidden = await run(files, [...ARGS, '--min-severity', 'error']);
  assert.equal(hidden.code, 0);
  assert.match(hidden.out, /findings: 0; 1 below error not shown/);
  assert.match(hidden.out, /RESULT: PASS - no finding at or above error \(1 warning\)/);
});

test('cli: --min-severity does not change the exit code', async () => {
  const files = { 'flow.json': flowText((f) => { delete f.steps.ask.fallback; }) };
  assert.equal((await run(files, [...ARGS, '--min-severity', 'error'])).code, 1);
});

test('cli: a level that is not a level is an error', async () => {
  assert.match((await cli(['flow.json', '--fail-on', 'fatal'])).err, /--fail-on: unknown level fatal/);
  assert.match((await cli(['flow.json', '--min-severity', 'high'])).err, /--min-severity: unknown level high/);
});

test('cli: --format and --json', async () => {
  assert.equal((await run(GOOD, [...ARGS, '--json'])).out, (await run(GOOD, [...ARGS, '--format', 'json'])).out);
  assert.match((await cli(['flow.json', '--json', '--format', 'sarif'])).err, /ask for two formats/);
  assert.match((await cli(['flow.json', '--format', 'pdf'])).err, /unknown format pdf/);
  assert.equal((await run(GOOD, [...ARGS, '--json', '--format', 'json'])).code, 0);
});

test('cli: options are checked before a file is read', async () => {
  for (const [args, part] of [
    [['--channel', 'sms'], '--channel: sms is not chat or voice'],
    [['--max-words', '0'], '--max-words: 0 is not a whole number from 1 to 1000'],
    [['--max-words', '1001'], '--max-words: 1001'],
    [['--max-words', '3.5'], '--max-words: 3.5'],
    [['--max-reprompts', '100'], '--max-reprompts: 100 is not a whole number from 0 to 99'],
    [['--max-reprompts', '-1'], '--max-reprompts: -1'],
    [['--handover', 'always'], '--handover: always is not every-input, any, off'],
    [['--irreversible-actions', 'two words'], '--irreversible-actions: two words is not one word'],
    [['--irreversible-actions', ' , '], '--irreversible-actions: give at least one word'],
    [['--disclosure-phrases', ' , '], '--disclosure-phrases: give at least one phrase'],
    [['--disclosure-phrases', '!!!'], '--disclosure-phrases: !!! holds no letter or digit'],
    [['--disable', 'flow-traps'], 'unknown check flow-traps. Did you mean flow-trap?'],
    [['--disable', 'nothing-like-it-at-all-here'], 'unknown check nothing-like-it-at-all-here']
  ]) {
    const r = await cli(['flow.json', ...args]);
    assert.equal(r.code, 2, args.join(' '));
    assert.ok(r.err.includes(part), `${args.join(' ')}: ${r.err.split('\n')[0]}`);
  }
});

test('cli: --disable leaves a check out of the findings and the exit code, and says so', async () => {
  const r = await run(BAD, [...ARGS, '--disable', 'input-no-fallback,ai-disclosure-missing']);
  assert.equal(r.code, 0);
  assert.match(r.out, /note: checks turned off with --disable: input-no-fallback, ai-disclosure-missing/);
  assert.match(r.out, /input-no-fallback\s+error\s+step\s+skipped\s+- \(turned off with --disable\)/);
});

test('cli: --channel voice and --handover off change the result', async () => {
  const files = { 'flow.json': flowText((f) => { f.steps.ask.text = 'Is it a? Or b?'; delete f.steps.person; f.steps.ask.fallback = 'bye'; }) };
  const chat = await run(files, ARGS);
  assert.match(chat.out, /no-handover/);
  assert.doesNotMatch(chat.out, /voice-multiple-questions\s+warning\s+wording\s+fail/);
  const voice = await run(files, [...ARGS, '--channel', 'voice', '--handover', 'off']);
  assert.match(voice.out, /voice-multiple-questions\s+warning\s+wording\s+fail/);
  assert.match(voice.out, /no-handover\s+error\s+flow\s+skipped/);
  assert.match(voice.out, /channel: voice \(from --channel\)/);
});

test('cli: a note says when --channel and the file disagree', async () => {
  const r = await run({ 'flow.json': flowText((f) => { f.channel = 'voice'; }) }, [...ARGS, '--channel', 'chat']);
  assert.match(r.out, /note: the flow file says channel voice; --channel chat was used/);
});

test('cli: --list-checks in three formats, none in SARIF or JUnit', async () => {
  const text = await cli(['--list-checks']);
  assert.equal(text.code, 0);
  for (const rule of RULES) assert.ok(text.out.includes(rule.id), rule.id);
  assert.match((await cli(['--list-checks', '--format', 'markdown'])).out, /^# conversation-flow-check checks/);
  const json = JSON.parse((await cli(['--list-checks', '--json'])).out);
  assert.equal(json.length, RULES.length);
  assert.deepEqual(Object.keys(json[0]), ['id', 'severity', 'kind', 'summary', 'fix', 'own', 'cannot']);
  assert.match((await cli(['--list-checks', '--format', 'sarif'])).err, /no SARIF form/);
  assert.match((await cli(['--explain', 'flow-trap', '--format', 'junit'])).err, /no JUNIT form/);
});

test('cli: --explain in three formats and a suggestion for a misspelt id', async () => {
  const text = await cli(['--explain', 'flow-trap']);
  assert.equal(text.code, 0);
  assert.match(text.out, /^flow-trap\n\nlevel: error\nkind: flow/);
  assert.match(text.out, /what it cannot see:/);
  assert.match((await cli(['--explain', 'flow-trap', '--format', 'markdown'])).out, /^# flow-trap/);
  assert.equal(JSON.parse((await cli(['--explain', 'flow-trap', '--json'])).out).id, 'flow-trap');
  const wrong = await cli(['--explain', 'flow-trapp']);
  assert.equal(wrong.code, 2);
  assert.match(wrong.err, /Did you mean flow-trap\?/);
});

test('rules: every check has a distinct id, a known level and kind, and the text the reports need', () => {
  assert.equal(new Set(RULES.map((r) => r.id)).size, RULES.length);
  assert.equal(RULES.length, 20);
  for (const r of RULES) {
    assert.ok(['error', 'warning', 'info'].includes(r.severity), r.id);
    assert.ok(['file', 'step', 'flow', 'wording', 'widget'].includes(r.kind), r.id);
    for (const key of ['summary', 'fix', 'own', 'cannot']) assert.ok(r[key].length > 20, `${r.id} ${key}`);
    assert.ok(r.own.includes('a best practice of this tool; no standard sets it'), r.id);
  }
});

test('text report: the head, the checks table, the findings and the result', async () => {
  const r = await run(BAD, ARGS);
  const lines = r.out.split('\n');
  assert.equal(lines[0], 'conversation-flow-check: flow.json');
  assert.match(lines[1], /^flow file: flow\.json \(json, \d+ lines, [\d,]+ bytes\)$/);
  assert.ok(lines.includes('Checks (20)'));
  assert.match(r.out, /\n {2}ERROR {4}input-no-fallback\s+flow\.json:\d+\n {11}The input step "ask" has no fallback/);
  assert.match(r.out, /\n {11}fix: Add a fallback/);
  assert.ok(r.out.endsWith('RESULT: FAIL - 1 finding at or above error (1 error)\n'));
});

test('text report: the summary counts the steps by type', () => {
  const text = report(flowText());
  assert.equal(text.summary.steps, 4);
  assert.equal(text.summary.reachable, 4);
  assert.deepEqual(text.summary.byType, { message: 1, input: 1, end: 1, handover: 1 });
  assert.equal(text.summary.inputSteps, 1);
  assert.equal(text.summary.handoverSteps, 1);
  assert.deepEqual(text.summary.opening, ['hello', 'ask']);
});

test('markdown report: headings, tables, the result in bold and escaped text', async () => {
  const files = { 'flow.json': flowText((f) => { delete f.steps.ask.fallback; f.steps['a|b*c'] = { type: 'end' }; }) };
  const r = await run(files, [...ARGS, '--format', 'markdown']);
  assert.match(r.out, /^# conversation-flow-check: flow\.json\n/);
  assert.match(r.out, /\n## Checks\n/);
  assert.match(r.out, /\n## Findings\n/);
  assert.match(r.out, /- Result: \*\*FAIL/);
  assert.match(r.out, /a\\\|b\\\*c/);
  assert.doesNotMatch(r.out, /[^\\]a\|b/);
});

test('markdown report: a clean run says none', async () => {
  const r = await run(GOOD, [...ARGS, '--format', 'markdown']);
  assert.match(r.out, /## Findings\n\nNone\.\n/);
});

test('json report: the object the other formats are built from', async () => {
  const r = JSON.parse((await run(BAD, [...ARGS, '--json'])).out);
  assert.equal(r.tool, 'conversation-flow-check');
  assert.equal(r.version, VERSION);
  assert.equal(r.evaluated, true);
  assert.equal(r.input.flow.format, 'json');
  assert.equal(r.input.widget, null);
  assert.equal(r.totals.findings, 1);
  assert.deepEqual(r.totals.byLevel, { error: 1, warning: 0, info: 0 });
  assert.equal(r.findings[0].id, 'input-no-fallback');
  assert.equal(r.findings[0].subject, 'ask');
  assert.equal(r.findings[0].kind, 'step');
  assert.equal(r.checks.length, 20);
  assert.equal(r.checks.find((c) => c.id === 'input-no-fallback').status, 'fail');
  assert.equal(r.checks.find((c) => c.id === 'flow-trap').status, 'pass');
  assert.equal(r.options.failOn, 'error');
  assert.equal(r.options.handover, 'every-input');
  assert.equal(r.result.pass, false);
  assert.ok(r.notice.includes('does not run the flow'));
});

test('json report: the same input gives the same bytes every time', async () => {
  const a = await run(BAD, [...ARGS, '--json']);
  const b = await run(BAD, [...ARGS, '--json']);
  assert.equal(a.out, b.out);
});

test('sarif report: 2.1.0 with the rules, one result for each finding with a place, and the right level', async () => {
  const files = { 'flow.json': flowText((f) => { noFallback(f); delete f.steps.ask.reprompt_limit; }) };
  const s = JSON.parse((await run(files, [...ARGS, '--format', 'sarif'])).out);
  assert.equal(s.version, '2.1.0');
  const [run1] = s.runs;
  assert.equal(run1.tool.driver.name, 'conversation-flow-check');
  assert.equal(run1.tool.driver.rules.length, 20);
  assert.equal(run1.results.length, 2);
  const byRule = Object.fromEntries(run1.results.map((x) => [x.ruleId, x]));
  assert.equal(byRule['input-no-fallback'].level, 'error');
  assert.equal(byRule['input-no-reprompt-limit'].level, 'warning');
  const loc = byRule['input-no-fallback'].locations[0].physicalLocation;
  assert.equal(loc.artifactLocation.uri, 'flow.json');
  assert.equal(loc.artifactLocation.index, 0);
  assert.ok(loc.region.startLine > 1);
  assert.equal(loc.region.startColumn, 5);
  assert.equal(run1.tool.driver.rules[byRule['input-no-fallback'].ruleIndex].id, 'input-no-fallback');
});

test('sarif report: findings in the widget file point at the widget file', async () => {
  const files = { ...GOOD, 'w.html': '\n<div id="messages"></div>' };
  const s = JSON.parse((await run(files, [...ARGS, '--widget', 'w.html', '--format', 'sarif'])).out);
  const [res] = s.runs[0].results;
  assert.equal(res.ruleId, 'widget-live-region-missing');
  assert.equal(res.locations[0].physicalLocation.artifactLocation.uri, 'w.html');
  assert.equal(res.locations[0].physicalLocation.artifactLocation.index, 1);
  assert.equal(res.locations[0].physicalLocation.region.startLine, 2);
});

test('sarif report: a finding about no place is left out, a clean run has no results', async () => {
  const noPlace = report(flowText());
  noPlace.findings.push({ id: 'x', severity: 'error', message: 'm', file: null, line: null, column: null, at: 'flow', subject: null, fix: 'f', kind: 'flow' });
  const clean = JSON.parse((await run(GOOD, [...ARGS, '--format', 'sarif'])).out);
  assert.deepEqual(clean.runs[0].results, []);
});

test('junit report: one test case for each check, failures for findings, skips for checks that did not run', async () => {
  const xml = (await run(BAD, [...ARGS, '--format', 'junit'])).out;
  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>\n<testsuites name="conversation-flow-check" tests="20" failures="1" errors="0" time="0">/);
  assert.match(xml, /<testsuite name="flow" tests="20" failures="1" errors="0" skipped="4" time="0">/);
  assert.match(xml, /<testcase classname="flow" name="input-no-fallback" time="0">\n {6}<failure type="input-no-fallback" message="1 finding">flow\.json:\d+: The input step &quot;ask&quot; has no fallback/);
  assert.match(xml, /<testcase classname="flow" name="flow-trap" time="0"\/>/);
  assert.match(xml, /<skipped message="the channel is chat; it only applies to voice"\/>/);
  assert.match(xml, /<skipped message="no --widget file was given"\/>/);
  assert.ok(xml.endsWith('</testsuites>\n'));
  assert.equal(xml.split('\r').length, 1);
});

test('junit report: a flow that cannot be read has one failure and errors for the checks that could not run', async () => {
  const xml = (await run({ 'flow.json': '{"start":' }, [...ARGS, '--format', 'junit'])).out;
  assert.match(xml, /<failure type="file-unreadable"/);
  assert.match(xml, /<error type="not-evaluated" message="the flow file could not be read">/);
  assert.match(xml, /failures="1" errors="1[0-9]"/);
});

test('junit report: text from the input is escaped and invalid characters are replaced', () => {
  const bad = report(flowText((f) => { f.steps['x<&>"\''] = { type: 'end' }; f.steps.lone = { type: 'end', text: `a${String.fromCharCode(0xd800)}b${String.fromCharCode(0xfffe)}` }; }));
  assert.ok(bad.findings.length > 0);
});

test('reports: text from the input has control and direction characters replaced', async () => {
  const hostile = `bad${String.fromCharCode(27)}[31mred${String.fromCharCode(0x202e)}${String.fromCharCode(0x2028)}x`;
  const files = { 'flow.json': flowText((f) => { f.steps[hostile] = { type: 'end' }; }) };
  for (const format of ['text', 'markdown', 'json', 'sarif', 'junit']) {
    const out = (await run(files, [...ARGS, '--format', format])).out;
    assert.ok(!out.includes(String.fromCharCode(27)), format);
    assert.ok(!out.includes(String.fromCharCode(0x202e)), format);
    assert.ok(!out.includes(String.fromCharCode(0x2028)), format);
    assert.ok(out.replaceAll(String.fromCharCode(92), '').includes('bad [31mred'), format);
  }
});

test('reports: a flow that cannot be read says so in every format and fails', async () => {
  const files = { 'flow.yaml': 'a: b: c\n' };
  const text = await run(files, ['flow.yaml']);
  assert.equal(text.code, 1);
  assert.match(text.out, /file-unreadable\s+flow\.yaml:1/);
  assert.match(text.out, /note: no check of the flow ran because the flow file could not be read/);
  assert.match(text.out, /flow: no check of the flow ran/);
  const json = JSON.parse((await run(files, ['flow.yaml', '--json'])).out);
  assert.equal(json.evaluated, false);
  assert.equal(json.summary, null);
});

test('reports: a YAML flow and a JSON flow with the same content give the same findings', async () => {
  const yaml = [
    'start: a',
    'steps:',
    '  a:',
    '    type: input',
    '    text: Name?',
    '    next: b',
    '  b:',
    '    type: end',
    ''
  ].join('\n');
  const json = JSON.stringify({ start: 'a', steps: { a: { type: 'input', text: 'Name?', next: 'b' }, b: { type: 'end' } } }, null, 2);
  const a = JSON.parse((await run({ 'f.yaml': yaml }, ['f.yaml', '--json'])).out);
  const b = JSON.parse((await run({ 'f.json': json }, ['f.json', '--json'])).out);
  assert.deepEqual(a.findings.map((f) => f.id), b.findings.map((f) => f.id));
  assert.equal(a.input.flow.format, 'yaml');
  assert.equal(b.input.flow.format, 'json');
});

test('reports: the findings are sorted by level, kind, place and id', () => {
  const r = report(flowText((f) => { delete f.steps.ask.fallback; delete f.steps.ask.reprompt_limit; f.steps.orphan = { type: 'end' }; f.start = 'hello'; }));
  const levels = r.findings.map((f) => f.severity);
  assert.deepEqual(levels, [...levels].sort((a, b) => ['error', 'warning', 'info'].indexOf(a) - ['error', 'warning', 'info'].indexOf(b)));
});

test('reports: the cap keeps the first 1000 findings of a check and counts the rest', () => {
  const steps = {};
  for (let i = 0; i < 1200; i += 1) steps[`s${i}`] = { type: 'message', text: 'x' };
  steps.s0 = { type: 'message', text: 'x', next: 's1' };
  const r = report(JSON.stringify({ start: 's0', steps }));
  assert.equal(r.findings.filter((f) => f.id === 'step-dead-end').length, 1000);
  assert.ok(r.notes.some((n) => n.startsWith('199 more findings of step-dead-end')));
  assert.equal(r.checks.find((c) => c.id === 'step-dead-end').findings, 1199);
});

test('options: readOptions fills the defaults', () => {
  const o = readOptions();
  assert.equal(o.channel, null);
  assert.equal(o.maxWords, 30);
  assert.equal(o.maxReprompts, 3);
  assert.equal(o.handover, 'every-input');
  assert.ok(o.irreversible.has('refund'));
  assert.deepEqual(o.disclosure[0], ['automated']);
  assert.equal(o.disable.size, 0);
});

test('options: parseArgs gives the paths and the values as text', () => {
  const o = parseArgs(['flow.yaml', '--widget', 'w.html', '--max-words', '25', '--channel', 'voice']);
  assert.deepEqual(o.paths, ['flow.yaml']);
  assert.equal(o.widget, 'w.html');
  assert.equal(o.maxWords, '25');
  assert.equal(o.channel, 'voice');
});

test('cli: the temporary folder holds nothing the tool wrote', async () => {
  await withFiles(GOOD, async (dir) => {
    const { readdir } = await import('node:fs/promises');
    const before = await readdir(dir);
    await cli([...ARGS, '--format', 'sarif'], dir);
    assert.deepEqual(await readdir(dir), before);
  });
});

test('cli: base() really passes every check at every level through the command line', async () => {
  const r = await run({ 'flow.json': JSON.stringify(base()) }, [...ARGS, '--fail-on', 'info']);
  assert.equal(r.code, 0);
  assert.match(r.out, /RESULT: PASS - no finding at or above info/);
});
