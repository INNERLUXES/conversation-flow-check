// The reports: text for a terminal, markdown for a job summary or a pull request, JSON for other tools, SARIF for code scanning and
// JUnit XML for the test view of a build system. Every text that comes from the input (a file name, a step id, a prompt, a
// message) was cleaned by safeText before it reached the report object. The markdown format also escapes what markdown gives a
// meaning to, the XML format escapes what XML gives a meaning to and drops the characters XML 1.0 cannot hold, and the SARIF and
// JSON formats are built as objects and written by JSON.stringify.

import { BEST, NOT_A, STEP_TYPES } from './data.js';
import { RULES } from './rules.js';
import { grouped, plural } from './size.js';
import { safeText, xmlSafe } from './text.js';

const URI = 'https://github.com/INNERLUXES/conversation-flow-check';

const clean = (t, max = 120) => safeText(t, max);

function findingsLine(r) {
  const b = r.totals.byLevel;
  const parts = ['error', 'warning', 'info'].filter((l) => b[l]).map((l) => `${grouped(b[l])} ${l}`);
  return `${grouped(r.totals.findings)}${parts.length ? ` (${parts.join(', ')})` : ''}${r.totals.hidden ? `; ${grouped(r.totals.hidden)} below ${r.options.minSeverity} not shown` : ''}`;
}

const fileLine = (f) => `${f.file} (${f.format}, ${plural(f.lines, 'line')}, ${plural(f.bytes, 'byte')})`;

const SOURCE = { option: 'from --channel', flow: 'from the flow file', default: 'the default' };

// The lines about the flow, one for each fact.
function summaryLines(r) {
  if (!r.evaluated) return [['flow', 'no check of the flow ran because the file could not be read or was not given']];
  const s = r.summary;
  const types = STEP_TYPES.filter((t) => s.byType[t]).map((t) => `${t} ${grouped(s.byType[t])}`).join(', ');
  const lines = [];
  if (s.name !== null) lines.push(['name', clean(s.name)]);
  lines.push(['channel', `${s.channel} (${SOURCE[s.channelSource]})`]);
  lines.push(['steps', `${grouped(s.steps)}${s.reachable === null ? '' : `, ${grouped(s.reachable)} reachable from the start`} (${types})`]);
  lines.push(['waiting for the user', `${plural(s.inputSteps, 'step')}; ${plural(s.handoverSteps, 'handover step')}; ${plural(s.irreversibleSteps, 'step')} that cannot be undone`]);
  return lines;
}

function table(head, rows, indent = '  ') {
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((row) => row[i].length)));
  const line = (cells) => `${indent}${cells.map((c, i) => (i === cells.length - 1 ? c : c.padEnd(widths[i]))).join('  ')}`.trimEnd();
  return [line(head), ...rows.map(line)];
}

const CHECK_HEAD = ['check', 'level', 'kind', 'status', 'findings'];
const checkRows = (r) => r.checks.map((c) => [c.id, c.level, c.kind, c.status, c.status === 'skipped' || c.status === 'not-evaluated' ? `- (${c.detail})` : grouped(c.findings)]);

const PAD = ' '.repeat(11);

export function toText(r) {
  const out = [];
  const files = [r.input.flow?.file, r.input.widget?.file].filter(Boolean).join(' + ');
  out.push(`conversation-flow-check: ${files}`);
  if (r.input.flow) out.push(`flow file: ${fileLine(r.input.flow)}`);
  if (r.input.widget) out.push(`widget file: ${fileLine(r.input.widget)}`);
  if (r.input.flow) for (const [k, v] of summaryLines(r)) out.push(`${k}: ${v}`);
  if (r.widget) out.push(`widget: ${plural(r.widget.tags, 'start tag')}, ${plural(r.widget.candidates, 'element')} that look${r.widget.candidates === 1 ? 's' : ''} like the list of messages; ${r.widget.ok ? 'one announces new messages' : 'none announces new messages'}`);
  out.push(`findings: ${findingsLine(r)}`);
  out.push('', `Checks (${grouped(r.checks.length)})`, '');
  out.push(...table(CHECK_HEAD, checkRows(r)), '');
  out.push(`Findings (${grouped(r.findings.length)})`, '');
  if (!r.findings.length) out.push('  none', '');
  const width = Math.max(...RULES.map((x) => x.id.length));
  for (const f of r.findings) {
    out.push(`  ${f.severity.toUpperCase().padEnd(8)} ${f.id.padEnd(width)}  ${f.at}`);
    out.push(`${PAD}${f.message}`);
    out.push(`${PAD}fix: ${f.fix}`);
    out.push('');
  }
  for (const n of r.notes) out.push(`note: ${n}`);
  if (r.notes.length) out.push('');
  out.push(r.notice, '');
  out.push(`RESULT: ${r.result.text}`);
  return `${out.join('\n')}\n`;
}

// Text for a markdown table cell or line: the characters markdown gives a meaning to are escaped.
const md = (t) => String(t).replace(/[\\`*_{}[\]<>()#+!|~]/g, (c) => `\\${c}`).replace(/\r?\n/g, ' ');

function mdTable(head, rows) {
  return [`| ${head.map(md).join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((row) => `| ${row.map(md).join(' | ')} |`), ''];
}

export function toMarkdown(r) {
  const out = [];
  const files = [r.input.flow?.file, r.input.widget?.file].filter(Boolean).join(' + ');
  out.push(`# conversation-flow-check: ${md(files)}`, '');
  if (r.input.flow) out.push(`- Flow file: ${md(fileLine(r.input.flow))}`);
  if (r.input.widget) out.push(`- Widget file: ${md(fileLine(r.input.widget))}`);
  if (r.input.flow) for (const [k, v] of summaryLines(r)) out.push(`- ${k[0].toUpperCase()}${k.slice(1)}: ${md(v)}`);
  out.push(`- Findings: ${md(findingsLine(r))}`);
  out.push(`- Result: **${md(r.result.text)}**`, '');
  out.push('## Checks', '', ...mdTable(CHECK_HEAD, checkRows(r)));
  out.push('## Findings', '');
  if (!r.findings.length) out.push('None.', '');
  else {
    out.push('| Level | Check | Where | Message |', '| --- | --- | --- | --- |');
    for (const f of r.findings) out.push(`| ${f.severity} | ${f.id} | ${md(f.at)} | ${md(f.message)} Fix: ${md(f.fix)} |`);
    out.push('');
  }
  for (const n of r.notes) out.push(`Note: ${md(n)}`, '');
  out.push(`${md(r.notice)}`, '');
  return `${out.join('\n')}`;
}

export function toJson(r) {
  return `${JSON.stringify(r, null, 2)}\n`;
}

const SARIF_LEVEL = { error: 'error', warning: 'warning', info: 'note' };

// SARIF 2.1.0: the checks as rules of the driver, the files as the artifacts, and one result for each finding that has a place in a
// file, with its line and column. A finding about no place is left out.
export function toSarif(r) {
  const files = [r.input.flow?.file, r.input.widget?.file].filter(Boolean);
  const sarif = {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'conversation-flow-check',
            version: r.version,
            informationUri: URI,
            rules: RULES.map((x) => ({
              id: x.id,
              name: x.id,
              shortDescription: { text: x.summary },
              help: { text: `${x.fix} (${x.kind})` },
              defaultConfiguration: { level: SARIF_LEVEL[x.severity] },
              properties: { kind: x.kind }
            }))
          }
        },
        artifacts: files.map((uri) => ({ location: { uri } })),
        results: r.findings.filter((f) => f.file !== null).map((f) => ({
          ruleId: f.id,
          ruleIndex: RULES.findIndex((x) => x.id === f.id),
          level: SARIF_LEVEL[f.severity],
          message: { text: `${f.message} Fix: ${f.fix}` },
          locations: [{ physicalLocation: { artifactLocation: { uri: f.file, index: files.indexOf(f.file) }, region: { startLine: f.line, startColumn: f.column } } }],
          properties: { kind: f.kind, subject: f.subject }
        })),
        properties: { notice: r.notice, result: r.result.text }
      }
    ]
  };
  return `${JSON.stringify(sarif, null, 2)}\n`;
}

// Text for XML: the five characters XML gives a meaning to are escaped, and the characters XML 1.0 cannot hold (a lone surrogate,
// U+FFFE and U+FFFF) are replaced by a question mark.
const xml = (t) => xmlSafe(t)
  .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);

// JUnit XML: one test suite, "flow", with one test case for each check. A check with a finding at its own level or any other is a
// failure, with the messages of its findings; a check that did not run is skipped, and one that could not run because the file could
// not be read is an error. No time is recorded, because the tool reads no clock, so every time is 0.
export function toJunit(r) {
  const cases = r.checks.map((c) => {
    const head = `    <testcase classname="flow" name="${xml(c.id)}" time="0"`;
    if (c.status === 'pass') return { kind: 'pass', xml: `${head}/>` };
    if (c.status === 'skipped') return { kind: 'skipped', xml: `${head}>\n      <skipped message="${xml(c.detail)}"/>\n    </testcase>` };
    if (c.status === 'not-evaluated') return { kind: 'error', xml: `${head}>\n      <error type="not-evaluated" message="${xml(c.detail)}">${xml(c.detail)}</error>\n    </testcase>` };
    const found = r.findings.filter((f) => f.id === c.id);
    const text = found.length ? found.map((f) => `${f.at}: ${f.message}`).join('\n') : c.detail;
    return { kind: 'failure', xml: `${head}>\n      <failure type="${xml(c.id)}" message="${xml(c.detail)}">${xml(text)}</failure>\n    </testcase>` };
  });
  const n = (kind) => cases.filter((c) => c.kind === kind).length;
  const attrs = `tests="${cases.length}" failures="${n('failure')}" errors="${n('error')}"`;
  const out = ['<?xml version="1.0" encoding="UTF-8"?>'];
  out.push(`<testsuites name="conversation-flow-check" ${attrs} time="0">`);
  out.push(`  <testsuite name="flow" ${attrs} skipped="${n('skipped')}" time="0">`);
  out.push(...cases.map((c) => c.xml));
  out.push('  </testsuite>', '</testsuites>', '');
  return out.join('\n');
}

// The list of checks, for --list-checks.
export function listChecksText() {
  const width = Math.max(...RULES.map((x) => x.id.length));
  const out = ['conversation-flow-check checks', ''];
  for (const x of RULES) out.push(`  ${x.id.padEnd(width)}  ${x.severity.padEnd(7)}  ${x.kind.padEnd(7)}  ${x.summary}`);
  out.push('', `Every check is ${BEST}. A check of a file is about whether it can be read and which keys it holds, a check of a step is about one step, a check of the flow is about the shape of the whole flow, a check of the wording is about the text of a prompt, and a check of the widget is about the HTML of the chat widget. The tool is ${NOT_A}.`, '');
  return out.join('\n');
}

export function listChecksMarkdown() {
  const out = ['# conversation-flow-check checks', '', '| Check | Level | Kind | What it looks at |', '| --- | --- | --- | --- |'];
  for (const x of RULES) out.push(`| ${x.id} | ${x.severity} | ${x.kind} | ${md(x.summary)} |`);
  out.push('');
  return out.join('\n');
}

export function listChecksJson() {
  return `${JSON.stringify(RULES.map((x) => ({ id: x.id, severity: x.severity, kind: x.kind, summary: x.summary, fix: x.fix, own: x.own, cannot: x.cannot })), null, 2)}\n`;
}

export function explainText(rule) {
  const out = [`${rule.id}`, ''];
  out.push(`level: ${rule.severity}`, `kind: ${rule.kind}`, '');
  out.push(`what it looks at: ${rule.summary}`, '', `why it exists: ${rule.own}`, '', `what to change: ${rule.fix}`, '', `what it cannot see: ${rule.cannot}`, '');
  out.push(`This check is ${BEST}. The tool is ${NOT_A}.`, '');
  return out.join('\n');
}

export function explainMarkdown(rule) {
  const out = [`# ${md(rule.id)}`, ''];
  out.push(`- Level: ${rule.severity}`, `- Kind: ${rule.kind}`, '');
  out.push(`**What it looks at.** ${md(rule.summary)}`, '', `**Why it exists.** ${md(rule.own)}`, '', `**What to change.** ${md(rule.fix)}`, '', `**What it cannot see.** ${md(rule.cannot)}`, '');
  out.push(`This check is ${md(BEST)}.`, '');
  return out.join('\n');
}

export function explainJson(rule) {
  return `${JSON.stringify({ id: rule.id, severity: rule.severity, kind: rule.kind, summary: rule.summary, fix: rule.fix, own: rule.own, cannot: rule.cannot, note: `This check is ${BEST}.` }, null, 2)}\n`;
}
