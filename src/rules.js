// The checks. Each has an id that stays the same once released (pipelines and other tools read it from the JSON, SARIF, JUnit and
// markdown output), a level, a kind, what it looks at, what to change, why it is a check at all and what it cannot see.
//
// kind 'file'     a problem with a file as a flow: whether it can be read, and the keys and values in it
// kind 'step'     a problem with one step: its edges, its settings and what it waits for
// kind 'flow'     a problem with the shape of the whole flow: what can be reached, where it can end, and what comes before what
// kind 'wording'  a problem with the text of a prompt
// kind 'widget'   a problem with the HTML of the chat widget
//
// No standard sets the shape of a flow, so every check is a best practice of this tool, and `own` says so and says why the tool
// asks for it. Where a check points at a law or a guideline (the disclosure check at the EU AI Act, the widget check at WCAG),
// it says what that text asks, and that the tool cannot tell whether it applies to you or whether you meet it. The tool reads a
// flow file; it never runs the flow.

import { BEST, LEVELS } from './data.js';

const ONLY = (what, why) => `${what} is ${BEST}; ${why}`;

export const RULES = [
  {
    id: 'file-unreadable',
    severity: 'error',
    kind: 'file',
    summary: 'a file is not a flow the reader can follow (a syntax error in the YAML subset or the JSON, a top level that is not a mapping, no start, no steps, or a file past a limit) or the widget file cannot be read as HTML text; no other check ran on that file',
    fix: 'Fix the line and column named; docs/inputs.md lists the YAML subset and the keys of a flow.',
    own: ONLY('Refusing a file that cannot be followed', 'a tool that guessed would report a clean flow for text it did not read'),
    cannot: 'It says where the reader stopped, not what another YAML or JSON reader would make of the file.'
  },
  {
    id: 'field-invalid',
    severity: 'error',
    kind: 'step',
    summary: 'a value is not what the format says: a step type that is not one of message, input, choice, confirm, action, handover or end; a channel that is not chat or voice; a reprompt_limit that is not a whole number from 0 to 99; a true or false value that is text; a prompt that is not text',
    fix: 'Write the value as docs/inputs.md says. The value is ignored until you do, so a check that needs it may report a second finding.',
    own: ONLY('Reporting a value the tool cannot use', 'a misread value would turn into a wrong answer in a later check'),
    cannot: 'It checks the type of a value. It cannot tell a value that is allowed but wrong from one that is right.'
  },
  {
    id: 'field-unknown',
    severity: 'warning',
    kind: 'file',
    summary: 'a key the tool does not read, at the top level, in a step or in an option, often a misspelt name such as fallbak; nothing under it is checked',
    fix: 'Correct the name to a key of docs/inputs.md, or take the key out of the file.',
    own: ONLY('Reporting a key that is not read', 'a misspelt key would otherwise hide a fallback or a reprompt limit from every check'),
    cannot: 'It suggests the nearest name within two edits and cannot tell a misspelling from a key your own platform reads on purpose.'
  },
  {
    id: 'start-unknown',
    severity: 'error',
    kind: 'flow',
    summary: 'the start of the flow names a step that is not under steps (or names none); the checks of what can be reached did not run',
    fix: 'Set "start" to the id of the step where the conversation begins, spelt as under "steps".',
    own: ONLY('Requiring a start that exists', 'without it nothing can be said about what is reachable'),
    cannot: 'It compares ids as written, with case. It does not know which step your platform opens with.'
  },
  {
    id: 'step-target-unknown',
    severity: 'error',
    kind: 'step',
    summary: 'a next, yes, no, fallback, on_error or option names a step that is not under steps',
    fix: 'Correct the id, or add the step. A user who follows the edge reaches a step that does not exist.',
    own: ONLY('Reporting an edge to nowhere', 'a typo in an id is the most common way a flow breaks and the hardest to see in a long file'),
    cannot: 'It compares ids as written. It does not know about steps that your platform adds at run time.'
  },
  {
    id: 'edge-missing',
    severity: 'error',
    kind: 'step',
    summary: 'an option without a next step, or a confirm step that has only one of yes and no',
    fix: 'Give every option a next, and give a confirm step both a yes and a no.',
    own: ONLY('Reporting a half-written choice', 'a choice with an answer that leads nowhere strands the user who picks it'),
    cannot: 'It looks at the keys of the step. It does not know whether the step you meant is the one you named.'
  },
  {
    id: 'step-unreachable',
    severity: 'warning',
    kind: 'flow',
    summary: 'a step that cannot be reached from the start step by following next, yes, no, fallback, on_error and the options',
    fix: 'Link the step from a step that is reachable, or take it out of the file. A step nobody can reach is dead text that still has to be kept up to date.',
    own: ONLY('Reporting steps that cannot be reached', 'an unreachable step is usually a link that was lost in an edit'),
    cannot: 'It follows the edges of the file. A step that your platform enters from outside the flow (a trigger, another flow) looks unreachable here.'
  },
  {
    id: 'step-dead-end',
    severity: 'error',
    kind: 'step',
    summary: 'a step with no way out (no next, yes, no, fallback, on_error or option) that is not marked as an end, by the type end or handover or by end: true',
    fix: 'Add the step that follows it, or mark it as an end on purpose with type: end, type: handover or end: true.',
    own: ONLY('Telling an end from a step that was left unfinished', 'a conversation that stops without a goodbye or a handover leaves the user with nothing to do'),
    cannot: 'It looks at the edges. It cannot tell whether the platform shows a closing message after a step that is marked as an end.'
  },
  {
    id: 'flow-trap',
    severity: 'error',
    kind: 'flow',
    summary: 'a reachable step from which no end, no handover and no dead end can be reached: a loop with no way out',
    fix: 'Give one step of the loop an edge that leaves it, such as a fallback to a handover after the reprompt limit.',
    own: ONLY('Reporting a loop the user cannot leave', 'a user in such a loop can only close the window'),
    cannot: 'It follows every edge as if the user could take it. A loop that the platform breaks by a counter outside the file looks like a trap here.'
  },
  {
    id: 'input-no-fallback',
    severity: 'error',
    kind: 'step',
    summary: 'an input, choice or confirm step with no fallback: nothing says what happens when the answer does not match',
    fix: 'Add a fallback: the id of the step that handles an answer the step did not understand (a reprompt step, or a handover).',
    own: ONLY('Requiring a plan for an answer that does not match', 'people type and say things the flow did not expect, and a flow with no plan for it stops or guesses'),
    cannot: 'It looks for the key. It cannot tell whether the step named as fallback handles the case well.'
  },
  {
    id: 'input-no-reprompt-limit',
    severity: 'warning',
    kind: 'step',
    summary: 'an input, choice or confirm step with no reprompt_limit: nothing says how many times the user is asked again before the flow gives up and moves on',
    fix: 'Set reprompt_limit to the number of times the step asks again (often 2 or 3) before it follows its fallback.',
    own: ONLY('Requiring a limit on asking again', 'a step that asks forever is the usual way a user gets stuck'),
    cannot: 'It reads the number. It does not know whether your platform counts the way you expect.'
  },
  {
    id: 'reprompt-limit-high',
    severity: 'warning',
    kind: 'step',
    summary: 'a reprompt_limit above --max-reprompts (default 3)',
    fix: 'Lower the limit, or raise --max-reprompts if the step is meant to ask that often.',
    own: ONLY('Warning about a high reprompt limit', 'the fifth time a bot asks the same question is the moment a user gives up'),
    cannot: 'It compares a number with a limit. Three is a convention of this tool, not a measure of what users bear.'
  },
  {
    id: 'no-handover',
    severity: 'error',
    kind: 'flow',
    summary: 'the flow has steps that wait for the user and no step of type handover, so there is no way to a person (--handover every-input or any)',
    fix: 'Add a step of type handover that passes the user to a human agent, and link it from the steps that wait for the user. Turn the check off with --handover off if the bot has no human to pass to.',
    own: ONLY('Asking for a way to a person', 'a bot that cannot hand over leaves a user whose problem it cannot solve with no way forward'),
    cannot: 'It looks for a step of type handover. It does not know whether anyone is on the other end, or whether the hours of the service are open.'
  },
  {
    id: 'handover-unreachable',
    severity: 'error',
    kind: 'flow',
    summary: 'a reachable input, choice or confirm step from which no step of type handover can be reached (--handover every-input, the default)',
    fix: 'Add an edge from the step, or from its fallback, that leads to a handover step, so that a user can ask for a person from where they are stuck.',
    own: ONLY('Asking for a way to a person from every place the user answers', 'the place where a user is stuck is the place where they need a person'),
    cannot: 'It follows edges. It cannot tell whether the user is offered the route in words, or whether a phrase such as "agent" is understood at that step.'
  },
  {
    id: 'voice-multiple-questions',
    severity: 'warning',
    kind: 'wording',
    summary: 'in the voice channel, a prompt with more than one question mark',
    fix: 'Ask one question in each prompt and put the next question in the next step. A caller cannot scroll back to the first question.',
    own: ONLY('Asking one thing at a time by voice', 'a caller who hears two questions answers one and loses the other'),
    cannot: 'It counts question marks. A question written without one is not counted, and a quoted question mark is.'
  },
  {
    id: 'voice-prompt-too-long',
    severity: 'warning',
    kind: 'wording',
    summary: 'in the voice channel, a prompt with more than --max-words words (default 30)',
    fix: 'Shorten the prompt, or split it into two steps. Put the question at the end, and the choices last.',
    own: ONLY('Keeping a spoken prompt short', 'a caller holds less in the head than a reader holds on a screen'),
    cannot: 'It counts the words that are separated by white space. It does not know how long the speech engine takes, or how slowly it is set to speak.'
  },
  {
    id: 'irreversible-unconfirmed',
    severity: 'error',
    kind: 'flow',
    summary: 'a step marked irreversible: true, or an action step whose action (or id) holds a word such as pay, book, cancel, delete or refund, that can be reached without passing a confirm step whose yes leads to it',
    fix: 'Put a step of type confirm in front of the action, say what is about to happen in its text, and send its yes to the action. Every edge into the action must be the yes of a confirm step.',
    own: ONLY('Asking for a confirmation before something that cannot be undone', 'a misheard word or a mistyped number is cheap to fix before a payment and expensive after'),
    cannot: 'It looks at the edges into the action and at the words of its name. An action with a harmless name that cannot be undone needs irreversible: true, and a confirmation that sits two steps before is not seen.'
  },
  {
    id: 'ai-disclosure-missing',
    severity: 'warning',
    kind: 'wording',
    summary: 'the opening of the flow (the start step, and the message steps that follow it up to the first step that waits for the user) does not say that the user is talking to an automated system or to an AI, by none of the phrases set with --disclosure-phrases',
    fix: 'Say it in the first message, in plain words, such as "I am an automated assistant". Article 50 of the EU AI Act asks that people are told when they interact with an AI system, unless that is obvious from the circumstances. Turn the check off with --disable ai-disclosure-missing if it does not apply.',
    own: ONLY('Asking the opening to say what the user is talking to', 'telling people at the start is cheap and avoids the question later'),
    cannot: 'It looks for the phrases in the opening. It cannot tell whether the law applies to you, whether the circumstances make it obvious, whether your wording is enough, or whether the notice is shown to the user at all; it is not legal advice.'
  },
  {
    id: 'widget-message-list-not-found',
    severity: 'warning',
    kind: 'widget',
    summary: 'in the widget HTML (--widget), no element looks like the list of messages (an id or class with messages, transcript, conversation, log or thread)',
    fix: 'Give the element that holds the messages an id or class that says so, with role="log" or an aria-live attribute, so that the check and a reader of the page can find it.',
    own: ONLY('Saying when the message list was not found', 'a check that found nothing and stayed silent would read as a pass'),
    cannot: 'It guesses from names. A list that is built by a script at run time is not in the HTML file and is not seen.'
  },
  {
    id: 'widget-live-region-missing',
    severity: 'error',
    kind: 'widget',
    summary: 'in the widget HTML (--widget), the element that looks like the list of messages carries neither role="log" (or status, or alert) nor aria-live="polite" or "assertive"; WCAG 2.2 success criterion 4.1.3 (Status Messages) asks that a status message can be announced without taking the focus',
    fix: 'Add role="log" to the element that holds the messages (it implies a polite live region), or aria-live="polite". Do not set aria-live="off".',
    own: ONLY('Looking for a live region on the message list', 'a screen reader user hears a new message only if the page announces it'),
    cannot: 'It looks at the attributes in the HTML file. It does not run the page, so it cannot tell whether a script changes them, whether a screen reader announces the messages, or whether the widget meets the rest of WCAG.'
  }
];

export const ruleById = (id) => RULES.find((r) => r.id === id);

export const atOrAbove = (level, floor) => LEVELS.indexOf(level) >= LEVELS.indexOf(floor);

// The result of a run: pass unless a finding is at or above the fail-on level.
export function decide(byLevel, failOn) {
  const failing = LEVELS.filter((l) => atOrAbove(l, failOn)).reduce((n, l) => n + (byLevel[l] ?? 0), 0);
  const total = LEVELS.reduce((n, l) => n + (byLevel[l] ?? 0), 0);
  const parts = ['error', 'warning', 'info'].filter((l) => byLevel[l]).map((l) => `${byLevel[l]} ${l}`);
  const detail = parts.length ? ` (${parts.join(', ')})` : '';
  if (failing > 0) return { pass: false, failOn, text: `FAIL - ${failing} ${failing === 1 ? 'finding' : 'findings'} at or above ${failOn}${detail}` };
  return { pass: true, failOn, text: `PASS - no finding at or above ${failOn}${total ? detail : ''}` };
}
