// A run: read the flow file (and the widget file, if one is given), check them, and build the report object that the formats write.

import { checkFlow, tokensOf } from './checks.js';
import { createCollector, show } from './collect.js';
import { CHANNELS, DEFAULTS, HANDOVER_MODES, LEVELS, LIMITS as WORK_LIMITS, NOTICE } from './data.js';
import { nearest } from './fields.js';
import { InputError, displayPath, locateInput, readInputText } from './files.js';
import { readFlow } from './flow.js';
import { parseJson } from './json.js';
import { ParseError } from './nodes.js';
import { RULES, decide, ruleById } from './rules.js';
import { safeText } from './text.js';
import { checkWidget } from './widget.js';
import { parseYaml } from './yaml.js';

export { InputError };

export const LIMITS = { ...WORK_LIMITS };

const clean = (t, max = 900) => safeText(t, max);

const ORDER = { error: 0, warning: 1, info: 2 };
const KIND_ORDER = { file: 0, step: 1, flow: 2, wording: 3, widget: 4 };
const FILE_ORDER = { flow: 0, widget: 1 };
const VOICE_RULES = ['voice-multiple-questions', 'voice-prompt-too-long'];
const WIDGET_RULES = ['widget-message-list-not-found', 'widget-live-region-missing'];
const REACH_RULES = ['step-unreachable', 'flow-trap', 'handover-unreachable'];
const FLOW_RULES = RULES.map((r) => r.id).filter((id) => !WIDGET_RULES.includes(id));

// A whole number option, from the text of the option.
function whole(flag, given, fallback, min, max) {
  const text = String(given ?? fallback);
  if (!/^\d{1,9}$/.test(text) || Number(text) < min || Number(text) > max) throw new Error(`${flag}: ${show(text, 40)} is not a whole number from ${min} to ${max}`);
  return Number(text);
}

// A comma-separated list option: the entries, trimmed, in lower case, without the empty ones.
function entries(flag, given, fallback) {
  const items = String(given ?? fallback).split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (items.length > 200) throw new Error(`${flag}: more than 200 entries`);
  for (const x of items) if (x.length > 60) throw new Error(`${flag}: an entry is longer than 60 characters`);
  return items;
}

// The options of a run, each given as text or left to its default. A value that cannot be used throws an Error whose message says
// which.
export function readOptions({ channel = null, maxWords = null, maxReprompts = null, handover = null, irreversibleActions = null, disclosurePhrases = null, disable = null } = {}) {
  if (channel !== null && !CHANNELS.includes(channel)) throw new Error(`--channel: ${show(String(channel), 40)} is not ${CHANNELS.join(' or ')}`);
  const mode = handover ?? DEFAULTS.handover;
  if (!HANDOVER_MODES.includes(mode)) throw new Error(`--handover: ${show(String(mode), 40)} is not ${HANDOVER_MODES.join(', ')}`);
  let words = entries('--irreversible-actions', irreversibleActions, DEFAULTS.irreversibleActions);
  if (words.length === 1 && words[0] === 'none') words = [];
  for (const w of words) if (tokensOf(w).length !== 1 || tokensOf(w)[0] !== w) throw new Error(`--irreversible-actions: ${show(w, 40)} is not one word of letters and digits (use "none" for no words)`);
  if (words.length === 0 && irreversibleActions !== null && String(irreversibleActions).trim() !== 'none') throw new Error('--irreversible-actions: give at least one word, or "none"');
  const phrases = entries('--disclosure-phrases', disclosurePhrases, DEFAULTS.disclosurePhrases);
  if (phrases.length === 0) throw new Error('--disclosure-phrases: give at least one phrase; to leave the check out use --disable ai-disclosure-missing');
  for (const p of phrases) if (tokensOf(p).length === 0) throw new Error(`--disclosure-phrases: ${show(p, 40)} holds no letter or digit`);
  const off = entries('--disable', disable, '');
  for (const id of off) {
    if (ruleById(id) === undefined) {
      const near = nearest(id, RULES.map((r) => r.id), 6);
      throw new Error(`--disable: unknown check ${show(id, 60)}${near ? `. Did you mean ${near}?` : ''} (--list-checks lists them)`);
    }
  }
  return {
    channel,
    maxWords: whole('--max-words', maxWords, DEFAULTS.maxWords, 1, 1000),
    maxReprompts: whole('--max-reprompts', maxReprompts, DEFAULTS.maxReprompts, 0, 99),
    handover: mode,
    irreversible: new Set(words),
    irreversibleWords: words,
    disclosure: phrases.map((p) => tokensOf(p)),
    disclosureText: phrases,
    disable: new Set(off),
    disableList: [...off]
  };
}

const plural = (n, one, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

// The format of a flow file from its first character: JSON when it opens a mapping or a list in brackets, otherwise YAML.
export function detectFormat(text) {
  for (const c of text) {
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') continue;
    return c === '{' || c === '[' ? 'json' : 'yaml';
  }
  return 'yaml';
}

// The findings of the text of the flow file and of the widget file, with no file system. flowText or widgetText may be null.
// Returns { format, flow, stats, summary, findings, notes, omitted }.
export function checkText(flowText, widgetText = null, { options = readOptions() } = {}) {
  const collector = createCollector();
  const { notes } = collector;
  const add = (id, where, message, subject = null) => {
    if (!options.disable.has(id)) collector.add(id, where, message, subject);
  };
  let flow = null;
  let stats = null;
  let format = null;
  let channel = options.channel ?? DEFAULTS.channel;
  let channelSource = options.channel === null ? 'default' : 'option';
  if (flowText !== null) {
    format = detectFormat(flowText);
    let root = null;
    try {
      root = format === 'json' ? parseJson(flowText, WORK_LIMITS) : parseYaml(flowText, WORK_LIMITS);
    } catch (error) {
      if (!(error instanceof ParseError)) throw error;
      add('file-unreadable', { file: 'flow', line: error.line, column: error.column }, `The flow file cannot be read as ${format === 'json' ? 'JSON' : 'the YAML subset'}: ${error.message}.`);
    }
    if (root !== null) flow = readFlow(root, add, WORK_LIMITS);
    if (flow !== null) {
      if (options.channel === null && flow.channel !== null) {
        channel = flow.channel;
        channelSource = 'flow';
      }
      stats = checkFlow(flow, { channel, maxWords: options.maxWords, maxReprompts: options.maxReprompts, handover: options.handover, irreversible: options.irreversible, disclosure: options.disclosure }, add);
      if (stats.reachable === null) notes.push('what can be reached from the start was not checked because the start step does not exist');
    } else notes.push('no check of the flow ran because the flow file could not be read');
  }
  let widget = null;
  if (widgetText !== null) {
    try {
      widget = checkWidget(widgetText, add, show, WORK_LIMITS);
    } catch (error) {
      if (error instanceof InputError) throw error;
      add('file-unreadable', { file: 'widget', line: 1, column: 1 }, `The widget file cannot be scanned: ${error.message}.`);
    }
  }
  if (options.disable.size > 0) notes.push(`checks turned off with --disable: ${options.disableList.join(', ')}`);
  if (flow !== null && channelSource === 'option' && flow.channel !== null && flow.channel !== channel) notes.push(`the flow file says channel ${flow.channel}; --channel ${channel} was used`);
  let summary = null;
  if (flow !== null) {
    const byType = {};
    for (const s of flow.steps.values()) byType[s.type] = (byType[s.type] ?? 0) + 1;
    summary = {
      name: flow.name === null ? null : clean(flow.name, 120),
      channel,
      channelSource,
      steps: flow.steps.size,
      reachable: stats.reachable === null ? null : stats.reachable.size,
      byType,
      inputSteps: stats.inputs,
      handoverSteps: stats.handovers.length,
      irreversibleSteps: stats.irreversible,
      opening: stats.opening === null ? null : stats.opening.map((id) => clean(id, 120))
    };
  }
  return { format, flow, stats, summary, widget, findings: collector.findings, notes, omitted: collector.omitted, channel };
}

const lineCount = (text) => {
  const parts = text === '' ? [] : text.split(/\r\n|\r|\n/);
  return parts.length > 0 && parts.at(-1) === '' ? parts.length - 1 : parts.length;
};

// Why a check did not run, or null when it did.
function skipReason(id, checked, options, files) {
  if (options.disable.has(id)) return 'turned off with --disable';
  if (WIDGET_RULES.includes(id) && files.widget === null) return 'no --widget file was given';
  if (FLOW_RULES.includes(id) && files.flow === null) return 'no flow file was given';
  if (VOICE_RULES.includes(id) && checked.channel !== 'voice') return 'the channel is chat; it only applies to voice';
  if ((id === 'no-handover' || id === 'handover-unreachable') && options.handover === 'off') return 'turned off with --handover off';
  if (id === 'handover-unreachable' && options.handover === 'any') return 'only applies with --handover every-input';
  return null;
}

// The report object for the findings. files is { flow, widget }, each { file, bytes, lines } or null.
export function buildReport({ files, checked, version, minSeverity = 'info', failOn = 'error', options = readOptions() }) {
  const names = { flow: files.flow?.file ?? null, widget: files.widget?.file ?? null };
  const all = checked.findings.map((f) => {
    const rule = ruleById(f.id);
    const file = f.file === null ? null : names[f.file];
    return {
      id: f.id,
      severity: rule.severity,
      message: clean(f.message),
      file,
      line: f.line,
      column: f.column,
      at: file === null ? 'flow' : `${file}:${f.line}`,
      subject: f.subject == null ? null : clean(f.subject, 120),
      fix: rule.fix,
      kind: rule.kind
    };
  });
  const rank = (f) => (f.file === null ? 2 : FILE_ORDER[f.file === names.flow ? 'flow' : 'widget']);
  all.sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || rank(a) - rank(b) || (a.line ?? 0) - (b.line ?? 0) || (a.column ?? 0) - (b.column ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) || (a.message < b.message ? -1 : a.message > b.message ? 1 : 0));
  const omitted = checked.omitted;
  const shown = all.filter((f) => LEVELS.indexOf(f.severity) >= LEVELS.indexOf(minSeverity));
  const extra = (rule) => omitted.get(rule.id) ?? 0;
  const byLevel = { error: 0, warning: 0, info: 0 };
  const allByLevel = { error: 0, warning: 0, info: 0 };
  for (const f of all) allByLevel[f.severity] += 1;
  for (const f of shown) byLevel[f.severity] += 1;
  for (const rule of RULES) {
    allByLevel[rule.severity] += extra(rule);
    if (LEVELS.indexOf(rule.severity) >= LEVELS.indexOf(minSeverity)) byLevel[rule.severity] += extra(rule);
  }
  const total = (o) => o.error + o.warning + o.info;
  const notes = [...checked.notes];
  for (const [id, n] of omitted) notes.push(`${n.toLocaleString('en-US')} more findings of ${id} are not listed; the first 1,000 are`);
  const evaluated = checked.flow !== null;
  const checks = RULES.map((r) => {
    const count = all.filter((f) => f.id === r.id).length + extra(r);
    const skipped = skipReason(r.id, checked, options, files);
    let status = count > 0 ? 'fail' : 'pass';
    let detail = count > 0 ? `${plural(count, 'finding')}` : 'no finding';
    if (skipped !== null) {
      status = 'skipped';
      detail = skipped;
    } else if (count === 0 && FLOW_RULES.includes(r.id) && r.id !== 'file-unreadable' && !evaluated) {
      status = 'not-evaluated';
      detail = 'the flow file could not be read';
    } else if (count === 0 && REACH_RULES.includes(r.id) && checked.stats && checked.stats.reachable === null) {
      status = 'not-evaluated';
      detail = 'the start step does not exist';
    }
    return { id: r.id, level: r.severity, kind: r.kind, status, findings: count, detail };
  });
  return {
    tool: 'conversation-flow-check',
    version,
    input: {
      flow: files.flow === null ? null : { file: files.flow.file, format: checked.format, bytes: files.flow.bytes, lines: files.flow.lines },
      widget: files.widget === null ? null : { file: files.widget.file, format: 'html', bytes: files.widget.bytes, lines: files.widget.lines }
    },
    evaluated,
    summary: checked.summary,
    widget: checked.widget,
    checks,
    totals: { findings: total(byLevel), byLevel, hidden: total(allByLevel) - total(byLevel) },
    rules: RULES.map((r) => ({ id: r.id, level: r.severity, kind: r.kind, findings: shown.filter((f) => f.id === r.id).length + (LEVELS.indexOf(r.severity) >= LEVELS.indexOf(minSeverity) ? extra(r) : 0) })),
    options: {
      minSeverity,
      failOn,
      channel: checked.channel,
      channelSource: checked.summary ? checked.summary.channelSource : options.channel === null ? 'default' : 'option',
      maxWords: options.maxWords,
      maxReprompts: options.maxReprompts,
      handover: options.handover,
      irreversibleActions: options.irreversibleWords,
      disclosurePhrases: options.disclosureText,
      disabled: options.disableList
    },
    findings: shown,
    notes: notes.map((n) => clean(n)),
    notice: NOTICE,
    result: decide(allByLevel, failOn)
  };
}

async function load({ path, limits, base }) {
  const absolute = await locateInput(path, base);
  const { text, bytes } = await readInputText(absolute, base, limits);
  return { absolute, text, file: { file: displayPath(absolute, base), bytes, lines: lineCount(text) } };
}

// Reads the files and builds the report. Problems with either file are collected, so a run that cannot read both says so for both.
export async function checkFiles({ flowPath = null, widgetPath = null, minSeverity = 'info', failOn = 'error', options = null, optionValues = {}, version, limits = LIMITS, base = process.cwd() }) {
  const used = options ?? readOptions(optionValues);
  const problems = [];
  const loaded = { flow: null, widget: null };
  for (const [name, path] of [['flow', flowPath], ['widget', widgetPath]]) {
    if (path === null) continue;
    try {
      loaded[name] = await load({ path, limits, base });
    } catch (error) {
      if (!(error instanceof InputError)) throw error;
      problems.push(...error.problems);
    }
  }
  if (problems.length > 0) throw new InputError(problems);
  if (loaded.flow && loaded.widget && loaded.flow.absolute === loaded.widget.absolute) throw new InputError([`${loaded.flow.file.file}: the flow file and the widget file are the same file`]);
  const checked = checkText(loaded.flow?.text ?? null, loaded.widget?.text ?? null, { options: used });
  return buildReport({ files: { flow: loaded.flow?.file ?? null, widget: loaded.widget?.file ?? null }, checked, version, minSeverity, failOn, options: used });
}
