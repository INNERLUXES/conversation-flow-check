// From the tree of a file to the model of a flow: the steps with their type, their prompt, their edges and their settings. Every
// value that is not what the format says is a finding at its line, and the step is still read as far as it can be, so one
// mistake does not hide the rest. Nothing is run or looked up; a step id is only a name.

import { flat } from './text.js';
import { CHANNELS, FLOW_KEYS, OPTION_KEYS, STEP_KEYS, STEP_TYPES, TERMINAL_TYPES } from './data.js';
import { show } from './collect.js';
import { nearest } from './fields.js';
import { describe } from './nodes.js';

export const EDGE_KEYS = ['next', 'yes', 'no', 'fallback', 'on_error'];

const hint = (name, names) => {
  const near = nearest(name, names);
  return near === null ? '' : ` Did you mean "${near}"?`;
};

// The text of a scalar node that must be text, or undefined (after a finding) when it is not.
function textOf(node, what, where, add) {
  if (node.t === 's' && typeof node.v === 'string') return node.v;
  add('field-invalid', where, `${what} must be text, and it is ${describe(node)}.`, null);
  return undefined;
}

function wholeNumber(node, min, max) {
  return node.t === 's' && typeof node.v === 'number' && Number.isInteger(node.v) && node.v >= min && node.v <= max ? node.v : undefined;
}

// Reads one step. id is the key, entry is { node, line, col } of the key.
function readStep(id, entry, add, limits) {
  const node = entry.node;
  const at = { file: 'flow', line: entry.line, column: entry.col };
  const step = { id, line: entry.line, col: entry.col, type: 'message', typeGiven: null, text: null, textLine: entry.line, textCol: entry.col, edges: [], repromptLimit: null, repromptLine: entry.line, irreversible: null, action: null, end: false, options: 0 };
  const name = show(id);
  if (node.t !== 'm') {
    add('field-invalid', at, `The step "${name}" must be a mapping of settings (type, text, next ...), and it is ${describe(node)}.`, id);
    return step;
  }
  for (const [key, e] of node.entries) {
    if (!STEP_KEYS.includes(key)) {
      add('field-unknown', { file: 'flow', line: e.line, column: e.col }, `The step "${name}" has the key "${show(key)}", which the tool does not read; nothing under it is checked.${hint(key, STEP_KEYS)}`, id);
    }
  }
  const get = (key) => node.entries.get(key);
  const typeEntry = get('type');
  if (typeEntry) {
    const t = textOf(typeEntry.node, `The type of the step "${name}"`, { file: 'flow', line: typeEntry.line, column: typeEntry.col }, add);
    if (t !== undefined) {
      if (STEP_TYPES.includes(t)) {
        step.type = t;
        step.typeGiven = t;
      } else add('field-invalid', { file: 'flow', line: typeEntry.line, column: typeEntry.col }, `The type of the step "${name}" is "${show(t)}", which is not one of ${STEP_TYPES.join(', ')}.${hint(t, STEP_TYPES)}`, id);
    }
  }
  const textEntry = get('text');
  if (textEntry) {
    const t = textOf(textEntry.node, `The text of the step "${name}"`, { file: 'flow', line: textEntry.line, column: textEntry.col }, add);
    step.textLine = textEntry.line;
    step.textCol = textEntry.col;
    if (t !== undefined) {
      if (t.length > limits.maxTextLength) add('field-invalid', { file: 'flow', line: textEntry.line, column: textEntry.col }, `The text of the step "${name}" is longer than ${limits.maxTextLength} characters.`, id);
      else step.text = t;
    }
  }
  for (const key of EDGE_KEYS) {
    const e = get(key);
    if (!e) continue;
    const to = textOf(e.node, `The "${key}" of the step "${name}"`, { file: 'flow', line: e.line, column: e.col }, add);
    if (to !== undefined) step.edges.push({ kind: key, to, line: e.line, col: e.col });
  }
  const optionsEntry = get('options');
  if (optionsEntry) {
    const o = optionsEntry.node;
    if (o.t !== 'q') add('field-invalid', { file: 'flow', line: optionsEntry.line, column: optionsEntry.col }, `The options of the step "${name}" must be a list of mappings with a label and a next, and they are ${describe(o)}.`, id);
    else {
      if (o.items.length > limits.maxOptions) add('field-invalid', { file: 'flow', line: optionsEntry.line, column: optionsEntry.col }, `The step "${name}" has more than ${limits.maxOptions} options.`, id);
      for (const item of o.items.slice(0, limits.maxOptions)) {
        step.options += 1;
        const here = { file: 'flow', line: item.line, column: item.col };
        if (item.t !== 'm') {
          add('field-invalid', here, `An option of the step "${name}" must be a mapping with a label and a next, and it is ${describe(item)}.`, id);
          continue;
        }
        for (const [key, e] of item.entries) if (!OPTION_KEYS.includes(key)) add('field-unknown', { file: 'flow', line: e.line, column: e.col }, `An option of the step "${name}" has the key "${show(key)}", which the tool does not read.${hint(key, OPTION_KEYS)}`, id);
        const label = item.entries.get('label');
        const label2 = label ? textOf(label.node, `The label of an option of the step "${name}"`, { file: 'flow', line: label.line, column: label.col }, add) : undefined;
        const nextEntry = item.entries.get('next');
        if (!nextEntry) {
          add('edge-missing', here, `An option${label2 ? ` ("${show(label2)}")` : ''} of the step "${name}" has no next step, so choosing it leads nowhere.`, id);
          continue;
        }
        const to = textOf(nextEntry.node, `The next of an option of the step "${name}"`, { file: 'flow', line: nextEntry.line, column: nextEntry.col }, add);
        if (to !== undefined) step.edges.push({ kind: 'option', to, line: nextEntry.line, col: nextEntry.col, label: label2 ?? null });
      }
    }
  }
  const limitEntry = get('reprompt_limit');
  if (limitEntry) {
    step.repromptLine = limitEntry.line;
    const n = wholeNumber(limitEntry.node, 0, 99);
    if (n === undefined) add('field-invalid', { file: 'flow', line: limitEntry.line, column: limitEntry.col }, `The reprompt_limit of the step "${name}" must be a whole number from 0 to 99, and it is ${describe(limitEntry.node)}.`, id);
    else step.repromptLimit = n;
  }
  for (const key of ['irreversible', 'end']) {
    const e = get(key);
    if (!e) continue;
    if (e.node.t === 's' && typeof e.node.v === 'boolean') {
      if (key === 'end') step.end = e.node.v;
      else step.irreversible = e.node.v;
    } else add('field-invalid', { file: 'flow', line: e.line, column: e.col }, `The ${key} of the step "${name}" must be true or false, and it is ${describe(e.node)}.`, id);
  }
  const actionEntry = get('action');
  if (actionEntry) {
    const a = textOf(actionEntry.node, `The action of the step "${name}"`, { file: 'flow', line: actionEntry.line, column: actionEntry.col }, add);
    if (a !== undefined) step.action = a;
  }
  const noteEntry = get('note');
  if (noteEntry && noteEntry.node.t !== 's') add('field-invalid', { file: 'flow', line: noteEntry.line, column: noteEntry.col }, `The note of the step "${name}" must be text.`, id);
  // A confirm step needs both answers.
  if (step.type === 'confirm') {
    const has = (k) => step.edges.some((e) => e.kind === k);
    if (step.edges.length > 0 && (!has('yes') || !has('no'))) {
      add('edge-missing', at, `The confirm step "${name}" has no "${has('yes') ? 'no' : 'yes'}" step, so one of the two answers leads nowhere.`, id);
    }
  }
  return step;
}

// Reads the tree of a flow file. Returns the flow, or null when the file has no usable start or steps (a finding says why).
export function readFlow(root, add, limits) {
  const here = { file: 'flow', line: root.line, column: root.col };
  if (root.t !== 'm') {
    add('file-unreadable', here, `The top level of the file must be a mapping with a start and the steps, and it is ${describe(root)}.`);
    return null;
  }
  for (const [key, e] of root.entries) {
    if (!FLOW_KEYS.includes(key)) add('field-unknown', { file: 'flow', line: e.line, column: e.col }, `The file has the key "${show(key)}" at the top level, which the tool does not read; nothing under it is checked.${hint(key, FLOW_KEYS)}`);
  }
  const flow = { name: null, channel: null, channelLine: root.line, start: null, startLine: root.line, startCol: root.col, steps: new Map() };
  for (const key of ['name', 'description']) {
    const e = root.entries.get(key);
    if (!e) continue;
    const t = textOf(e.node, `The ${key} of the flow`, { file: 'flow', line: e.line, column: e.col }, add);
    if (key === 'name' && t !== undefined) flow.name = flat(t);
  }
  const channel = root.entries.get('channel');
  if (channel) {
    flow.channelLine = channel.line;
    const c = textOf(channel.node, 'The channel of the flow', { file: 'flow', line: channel.line, column: channel.col }, add);
    if (c !== undefined) {
      if (CHANNELS.includes(c)) flow.channel = c;
      else add('field-invalid', { file: 'flow', line: channel.line, column: channel.col }, `The channel of the flow is "${show(c)}", which is not one of ${CHANNELS.join(' and ')}.`);
    }
  }
  const start = root.entries.get('start');
  if (!start) {
    add('file-unreadable', here, 'The flow has no "start": the id of the step where the conversation begins.');
  } else {
    flow.startLine = start.line;
    flow.startCol = start.col;
    const s = textOf(start.node, 'The start of the flow', { file: 'flow', line: start.line, column: start.col }, add);
    if (s !== undefined) flow.start = s;
  }
  const steps = root.entries.get('steps');
  if (!steps) {
    add('file-unreadable', here, 'The flow has no "steps": a mapping of step ids to steps.');
    return null;
  }
  if (steps.node.t !== 'm') {
    add('file-unreadable', { file: 'flow', line: steps.line, column: steps.col }, `The "steps" of the flow must be a mapping of step ids to steps, and it is ${describe(steps.node)}.`);
    return null;
  }
  if (steps.node.entries.size === 0) {
    add('file-unreadable', { file: 'flow', line: steps.line, column: steps.col }, 'The flow has no step under "steps".');
    return null;
  }
  if (steps.node.entries.size > limits.maxSteps) {
    add('file-unreadable', { file: 'flow', line: steps.line, column: steps.col }, `The flow has more than ${limits.maxSteps} steps; the tool refuses it rather than read a part.`);
    return null;
  }
  for (const [id, entry] of steps.node.entries) flow.steps.set(id, readStep(id, entry, add, limits));
  return flow;
}

export const isTerminal = (step) => step.end || TERMINAL_TYPES.includes(step.type);
