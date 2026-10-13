// Shared test helpers: flows built inline as objects or as text, checked in memory or written into a temporary folder that is
// removed after the test. Paths are built with resolve() from forward-slash names, so the same test runs on Linux, macOS and
// Windows. The line a test expects is found with lineOf(), which counts lines the way the readers do, so a test never holds a
// line number worked out by hand for one system only. No test reads the clock, the time zone or the locale. Every step, flow
// and phrase in the tests is made up.

import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { checkText, main, readOptions } from '../src/index.js';

export async function withFiles(files, fn) {
  const dir = await mkdtemp(resolve(tmpdir(), 'conversation-flow-check-'));
  try {
    for (const [rel, content] of Object.entries(files)) {
      await mkdir(dirname(resolve(dir, rel)), { recursive: true });
      await writeFile(resolve(dir, rel), content);
    }
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// The line (from 1) of the n-th place where needle starts in text.
export function lineOf(text, needle, n = 1) {
  let at = -1;
  for (let i = 0; i < n; i += 1) {
    at = text.indexOf(needle, at + 1);
    if (at < 0) throw new Error(`${needle} is not in the text ${n} times`);
  }
  return text.slice(0, at).split('\n').length;
}

// A small flow that passes every check: an opening that says what the user talks to, one question with a fallback and a
// reprompt limit, a way to a person, and an end.
export function base() {
  return {
    name: 'Test flow',
    channel: 'chat',
    start: 'hello',
    steps: {
      hello: { type: 'message', text: 'Hi, I am an automated assistant.', next: 'ask' },
      ask: { type: 'input', text: 'What is your name?', reprompt_limit: 2, next: 'bye', fallback: 'person' },
      bye: { type: 'end', text: 'Goodbye.' },
      person: { type: 'handover', text: 'Passing you to a person.' }
    }
  };
}

// The text (JSON) of the base flow after change(flow) has edited a copy of it.
export function flowText(change = () => {}) {
  const flow = base();
  change(flow);
  return JSON.stringify(flow, null, 2);
}

// The whole run in memory.
export const runOf = (flow, widget = null, options = {}) => checkText(flow, widget, { options: readOptions(options) });

// The findings of a run in memory.
export const findingsOf = (flow, options, widget = null) => runOf(flow, widget, options).findings;

// The ids of the findings of a run.
export const idsOf = (flow, options, widget = null) => findingsOf(flow, options, widget).map((f) => f.id);

// The findings of one check.
export const ofCheck = (flow, id, options, widget = null) => findingsOf(flow, options, widget).filter((f) => f.id === id);

// The ids of the findings of the base flow after change(flow) has edited a copy of it.
export const idsAfter = (change, options) => idsOf(flowText(change), options);

// Runs the command line with exactly these arguments, in a folder.
export async function cli(argv, base2) {
  let out = '';
  let err = '';
  const code = await main(argv, { out: (t) => { out += t; }, err: (t) => { err += t; } }, undefined, base2);
  return { code, out, err };
}

// Writes the files and runs the command line in the folder.
export async function run(files, args) {
  return withFiles(files, (dir) => cli(args, dir));
}

export const GOOD = { 'flow.json': flowText() };
export const noFallback = (f) => { delete f.steps.ask.fallback; f.steps.ask.on_error = 'person'; };
export const BAD = { 'flow.json': flowText(noFallback) };
export const ARGS = ['flow.json'];

// A tree as plain data, for tests of the readers.
export function dump(node) {
  const done = [];
  const todo = [[node, (v) => done.push(v)]];
  while (todo.length) {
    const [n, set] = todo.pop();
    if (n.t === 's') set(n.v);
    else if (n.t === 'q') {
      const arr = [];
      set(arr);
      [...n.items.entries()].reverse().forEach(([i, item]) => todo.push([item, (v) => { arr[i] = v; }]));
    } else {
      const obj = Object.create(null);
      set(obj);
      for (const [k, e] of [...n.entries].reverse()) todo.push([e.node, (v) => { obj[k] = v; }]);
    }
  }
  return done[0];
}

// A tree as a plain object, for deepStrictEqual.
export const plain = (node) => JSON.parse(JSON.stringify(dump(node)));

// The time a hostile test may take: four times as long when the runner collects coverage, which sets NODE_V8_COVERAGE.
export const allowed = (ms) => (process.env.NODE_V8_COVERAGE ? ms * 4 : ms);
