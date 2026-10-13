// The checks of a flow that has been read: edges, reachability, ways out, fallbacks, the way to a person, the wording of voice
// prompts, actions that cannot be undone and the opening of the conversation. Each one reads the model of the flow and nothing
// else. No pattern is built from the file or from an argument, and no walk calls itself.

import { INPUT_TYPES } from './data.js';
import { list, show } from './collect.js';
import { isTerminal } from './flow.js';
import { FULL_WIDTH_QUESTION } from './text.js';
import { buildGraph, canReach, reachableFrom } from './graph.js';

const stepAt = (s) => ({ file: 'flow', line: s.line, column: s.col });
const textAt = (s) => ({ file: 'flow', line: s.textLine, column: s.textCol });
export const isInput = (s) => INPUT_TYPES.includes(s.type);

const TOKEN_SPLIT = /[^\p{L}\p{N}]+/u;

// The lower-case words of a text, split at anything that is not a letter or a digit.
export const tokensOf = (text) => text.normalize('NFKC').toLowerCase().split(TOKEN_SPLIT).filter(Boolean);

// The words of a name such as bookTable, book_table or book-table.
const nameTokens = (text) => tokensOf(text.replace(/([a-z0-9])([A-Z])/g, '$1 $2'));

// Whether the words of the phrase come one after the other in the words of the text.
export function containsPhrase(tokens, phrase) {
  if (phrase.length === 0) return false;
  for (let i = 0; i + phrase.length <= tokens.length; i += 1) {
    let all = true;
    for (let j = 0; j < phrase.length; j += 1) {
      if (tokens[i + j] !== phrase[j]) {
        all = false;
        break;
      }
    }
    if (all) return true;
  }
  return false;
}

export const wordCount = (text) => text.split(/\s+/).filter(Boolean).length;
export const questionMarks = (text) => {
  let n = 0;
  for (const c of text) if (c === '?' || c === FULL_WIDTH_QUESTION) n += 1;
  return n;
};

// Whether the step is one that cannot be undone: irreversible: true, or an action step (irreversible not set to false) whose
// action, or its id when it has no action, holds one of the words.
export function isIrreversible(step, words) {
  if (step.irreversible === true) return true;
  if (step.irreversible === false || step.type !== 'action') return false;
  return nameTokens(step.action ?? step.id).some((t) => words.has(t) || (t.endsWith('s') && words.has(t.slice(0, -1))));
}

// The steps of the opening: the start step, and each message step that follows by its next, up to and including the first step
// that is not a message.
export function openingSteps(flow) {
  const out = [];
  const seen = new Set();
  let current = flow.steps.get(flow.start);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    out.push(current);
    if (current.type !== 'message') break;
    const next = current.edges.find((e) => e.kind === 'next');
    current = next ? flow.steps.get(next.to) : undefined;
  }
  return out;
}

// Runs the checks of the flow. options: { channel, maxWords, maxReprompts, handover, irreversible (a Set of words),
// disclosure (a list of lists of words) }. Returns the numbers the report shows.
export function checkFlow(flow, options, add) {
  const graph = buildGraph(flow);
  const steps = [...flow.steps.values()];
  const startKnown = flow.start !== null && flow.steps.has(flow.start);
  const reachable = startKnown ? reachableFrom([flow.start], graph.out) : null;

  if (!startKnown) {
    const given = flow.start === null ? 'no step' : `the step "${show(flow.start)}"`;
    add('start-unknown', { file: 'flow', line: flow.startLine, column: flow.startCol }, `The start of the flow names ${given}, which is not under steps. What can be reached from the start was not checked.`, flow.start);
  }

  for (const step of steps) {
    for (const edge of step.edges) {
      if (!flow.steps.has(edge.to)) {
        add('step-target-unknown', { file: 'flow', line: edge.line, column: edge.col }, `The ${edge.kind === 'option' ? `option${edge.label ? ` "${show(edge.label)}"` : ''}` : `"${edge.kind}"`} of the step "${show(step.id)}" leads to "${show(edge.to)}", which is not under steps.`, step.id);
      }
    }
    if (step.edges.length === 0 && !isTerminal(step)) {
      add('step-dead-end', stepAt(step), `The step "${show(step.id)}" (type ${step.type}) has no step after it and is not marked as an end, so the conversation stops there with nothing for the user to do.`, step.id);
    }
  }

  if (reachable !== null) {
    const lost = steps.filter((s) => !reachable.has(s.id));
    for (const s of lost) add('step-unreachable', stepAt(s), `The step "${show(s.id)}" cannot be reached from the start step "${show(flow.start)}".`, s.id);
    const sinks = steps.filter((s) => isTerminal(s) || graph.out.get(s.id).length === 0).map((s) => s.id);
    const leaves = canReach(sinks, graph.into);
    for (const s of steps) {
      if (reachable.has(s.id) && !leaves.has(s.id)) add('flow-trap', stepAt(s), `The step "${show(s.id)}" is in a loop with no way out: from here no end, no handover and no dead end can be reached.`, s.id);
    }
  }

  for (const s of steps.filter(isInput)) {
    if (!s.edges.some((e) => e.kind === 'fallback')) {
      add('input-no-fallback', stepAt(s), `The ${s.type} step "${show(s.id)}" has no fallback, so nothing says what happens when the answer does not match.`, s.id);
    }
    if (s.repromptLimit === null) {
      add('input-no-reprompt-limit', stepAt(s), `The ${s.type} step "${show(s.id)}" has no reprompt_limit, so nothing says how many times the user is asked again.`, s.id);
    } else if (s.repromptLimit > options.maxReprompts) {
      add('reprompt-limit-high', { file: 'flow', line: s.repromptLine, column: s.col }, `The ${s.type} step "${show(s.id)}" asks again up to ${s.repromptLimit} times; the limit is ${options.maxReprompts} (--max-reprompts).`, s.id);
    }
  }

  // The way to a person.
  const handovers = steps.filter((s) => s.type === 'handover').map((s) => s.id);
  const inputs = steps.filter(isInput);
  if (options.handover !== 'off' && inputs.length > 0) {
    if (handovers.length === 0) {
      add('no-handover', { file: 'flow', line: flow.startLine, column: flow.startCol }, `The flow has ${inputs.length} ${inputs.length === 1 ? 'step' : 'steps'} that wait for the user and no step of type handover, so there is no way to a person.`, null);
    } else if (options.handover === 'every-input' && reachable !== null) {
      const toPerson = canReach(handovers, graph.into);
      for (const s of inputs) {
        if (reachable.has(s.id) && !toPerson.has(s.id)) add('handover-unreachable', stepAt(s), `From the ${s.type} step "${show(s.id)}" no handover step can be reached, so a user who is stuck here cannot get to a person.`, s.id);
      }
    }
  }

  // The wording of a voice prompt.
  if (options.channel === 'voice') {
    for (const s of steps) {
      if (s.text === null || !['message', 'input', 'choice', 'confirm'].includes(s.type)) continue;
      const q = questionMarks(s.text);
      if (q > 1) add('voice-multiple-questions', textAt(s), `The prompt of the step "${show(s.id)}" has ${q} question marks. A caller can answer one question at a time.`, s.id);
      const w = wordCount(s.text);
      if (w > options.maxWords) add('voice-prompt-too-long', textAt(s), `The prompt of the step "${show(s.id)}" has ${w} words; the limit is ${options.maxWords} (--max-words).`, s.id);
    }
  }

  // An action that cannot be undone needs a confirm step before it.
  let irreversible = 0;
  for (const s of steps) {
    if (!isIrreversible(s, options.irreversible)) continue;
    irreversible += 1;
    const incoming = graph.into.get(s.id);
    const confirmed = flow.start !== s.id && incoming.length > 0 && incoming.every((e) => flow.steps.get(e.from).type === 'confirm' && e.kind === 'yes');
    if (!confirmed) {
      const how = flow.start === s.id ? 'it is the start step' : incoming.length === 0 ? 'no step leads to it through a confirm step' : `${list(incoming.filter((e) => !(flow.steps.get(e.from).type === 'confirm' && e.kind === 'yes')).map((e) => `"${show(e.from)}" (${e.kind})`), 3)} lead${incoming.length === 1 ? 's' : ''} to it without a confirmation`;
      add('irreversible-unconfirmed', stepAt(s), `The step "${show(s.id)}" cannot be undone (${s.irreversible === true ? 'irreversible: true' : `action "${show(s.action ?? s.id)}"`}) and runs without a confirm step before it: ${how}.`, s.id);
    }
  }

  // The opening says what the user is talking to.
  let opening = null;
  if (startKnown && options.disclosure.length > 0) {
    opening = openingSteps(flow);
    const found = opening.some((s) => s.text !== null && options.disclosure.some((p) => containsPhrase(tokensOf(s.text), p)));
    if (!found) {
      const first = opening[0];
      const shown = opening.map((s) => `"${show(s.id)}"`);
      add('ai-disclosure-missing', first.text === null ? stepAt(first) : textAt(first), `The opening of the flow (${list(shown, 4)}) does not tell the user that they are talking to an automated system or an AI. Article 50 of the EU AI Act asks that people are told when they interact with an AI system, unless that is obvious from the circumstances.`, first.id);
    }
  }

  return { graph, reachable, handovers, inputs: inputs.length, irreversible, opening: opening === null ? null : opening.map((s) => s.id) };
}
