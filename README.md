# conversation-flow-check

Check a chatbot or voice conversation flow before it reaches users. Give it a flow written as YAML or JSON, a set of steps that
lead to each other, and it reports the mistakes that are cheap to find in a graph and expensive to find in front of a user: steps
that cannot be reached, dead ends and loops with no way out, input steps with no fallback or no reprompt limit, a flow with no way
to a person, voice prompts that ask two things or run long, payments and deletions that run without a confirmation, and an opening
that never says the user is talking to an automated system. With a chat widget page it also checks that the list of messages is a
live region. It fails the run on the level you set, so a flow can be checked on every change.

**The tool reads the text of a flow file and does not run it: it never talks to a bot, and it does not judge the wording. A clean
result means only that none of the problems of its checks were found in the file. It is not a test of the bot, not legal advice and
not an accessibility audit.** Every check is a best practice of this tool: no standard sets any of them, and the reports say so.
Two checks are close to texts that people take seriously, Article 50 of the EU AI Act (people are to be told when they interact
with an AI system, unless that is obvious) and WCAG 2.2 success criterion 4.1.3 (Status Messages). The tool names them and cannot
tell whether they apply to you or whether you meet them. It reads the files you give it and nothing else: it contacts nothing over
the network, runs nothing, needs no key, reads no clock and writes nothing.

The mistakes in a flow tend to be the same: a step renamed and a link left behind, a branch nobody can reach any more, a question
that asks again for ever, a place where the user is stuck and cannot get to a person, a refund that runs on a misheard "yes", a
spoken menu of three questions in one breath. They get past a read of the flow in a builder and are cheap to find in a file. This
tool reads them on every build and points at the line.

- **Graph checks.** Unreachable steps, dead ends (a step with no next step that is not marked as an end), loops with no way out,
  edges to steps that do not exist, a half-written choice. Each finding points at the line of the step or of the edge.
- **Users who get stuck.** An input, choice or confirm step with no `fallback`, with no `reprompt_limit`, or with a limit above
  `--max-reprompts`.
- **A way to a person.** A step of type `handover` must exist and be reachable from every input step (`--handover every-input`,
  `any` or `off`).
- **Voice wording.** For the voice channel, a prompt with more than one question mark or more than `--max-words` words.
- **Actions that cannot be undone.** A step marked `irreversible: true`, or an action whose name holds a word such as pay, book,
  cancel, delete or refund (`--irreversible-actions`), must be reached only through the yes of a confirm step.
- **An opening that says what the user talks to.** The start step and the messages that follow it must hold a phrase such as
  "automated" or "AI" (`--disclosure-phrases`); the finding points at Article 50 of the EU AI Act.
- **The chat widget.** With `--widget`, the element that holds the messages must carry `role="log"` or an `aria-live` attribute
  (WCAG 2.2 success criterion 4.1.3).
- **Checks with ids.** Twenty checks, each marked as a check of a file, of a step, of the flow, of the wording or of the widget, each
  with what it looks at, what to change, why it is a check at all and what it cannot see. Each message says what was found and
  where, as file:line.
- **A reader of its own.** A small, documented subset of YAML and a JSON reader, both with the line and column of every key. They
  refuse what they do not read (anchors, tags, a key written twice) instead of guessing.
- **Bounded work.** Twenty thousand steps, brackets nested a hundred thousand deep and a ring of fifteen thousand steps all end in
  good time, and no function calls itself.
- Reports as text, markdown, JSON, SARIF and JUnit XML (one test case for each check), with an exit code for a pipeline: `0` no
  finding at or above the `--fail-on` level, `1` a finding at or above it, `2` usage or input error.
- Plain JavaScript, no dependencies, no clock and no network.

```
npm test
```

```
tests 330
pass 328
fail 0
skipped 2
```

These are the summary lines that `npm test` prints at the end on Windows. The skipped tests are the ones that need a symbolic link
or a device (a link to a file, and `/dev/null` named as a file); they are guarded with `process.platform`, run on Linux and macOS,
and none of them asserts a line. `npm run test:coverage` runs the same tests with coverage; their time limits are four times wider
when coverage is on.

## Quick start

Requires Node 22 or newer. There is nothing to install.

```
git clone https://github.com/INNERLUXES/conversation-flow-check.git
cd conversation-flow-check
node bin/conversation-flow-check.js examples/bad/support-voice.yaml
```

Or without a clone, in your own project:

```
npx --yes github:INNERLUXES/conversation-flow-check flows/support.yaml --channel voice --max-words 25
```

To check a flow together with the page of its chat widget:

```
node bin/conversation-flow-check.js examples/good/booking-chat.yaml --widget examples/good/widget.html
```

To see why a check exists, what it cannot see and what to change:

```
node bin/conversation-flow-check.js --explain flow-trap
node bin/conversation-flow-check.js --list-checks
```

To show each check as a test in a build system:

```
node bin/conversation-flow-check.js flows/support.yaml --format junit > junit.xml
```

`examples/` holds made-up flows for made-up businesses. The good ones, in `examples/good`, are a salon booking flow in YAML with its
chat widget page, a broadband help line for the voice channel, and a shop returns flow in JSON; each has an opening that says the
user talks to an automated system, a fallback and a reprompt limit on every question, a confirm step before every booking, payment,
cancellation and refund, and a way to a person from every question, and they pass every check at error, warning and info level. The
bad ones, in `examples/bad`, are a voice flow with a mistake of most checks (an unknown key and a misspelt one, a step type that
does not exist, an edge to a step that is not there, an option with no next, a step that stops, a loop with no way out, steps
nobody can reach, questions with no fallback or reprompt limit, a limit of six, no handover, a payment with no confirmation, a
greeting of thirty-five words, three questions in one prompt and no disclosure), a chat flow with a confirm step that has no "no"
answer, an input step from which no person can be reached and a cancellation with no confirmation, a flow that cannot be read, and a
widget page whose message list does not announce new messages.

## Usage

```
conversation-flow-check <flow file> [options]
conversation-flow-check --widget <html file> [options]
conversation-flow-check --list-checks
conversation-flow-check --explain <id>
```

```
--format <name>            text, markdown, json, sarif or junit (default: text)
--json                     the same as --format json
--channel <name>           chat or voice: overrides the channel of the flow file (default: the file's, else chat)
--max-words <number>       the most words a voice prompt may have, from 1 to 1000 (default: 30)
--max-reprompts <number>   the highest reprompt_limit that is accepted, from 0 to 99 (default: 3)
--handover <mode>          every-input: a handover step must be reachable from every input step; any: the flow must have one;
                           off: no check of the way to a person (default: every-input)
--irreversible-actions <words>
                           comma-separated words that mark an action step as one that cannot be undone, or none
--disclosure-phrases <phrases>
                           comma-separated phrases, any one of which in the opening says the user is talking to an automated
                           system
--disable <ids>            comma-separated ids of checks to leave out
--widget <file>            the HTML of a chat widget page: check that its message list is a live region
--min-severity <level>     the lowest level of a finding that is shown: info, warning, error (default: info)
--fail-on <level>          the lowest level of a finding that fails the run: info, warning, error (default: error)
--list-checks              list the checks with their level and kind, and exit
--explain <id>             explain one check: what it looks at, what to change, what it cannot see, and exit
--help                     show the usage
--version                  show the version
```

[docs/inputs.md](docs/inputs.md) is the format of the flow file, the YAML subset the tool reads, and what the widget check looks at,
with a short flow that passes every check. The path in the report is relative to the folder you run the command in, with forward
slashes on every system, followed by the line.

## A sample run

The voice flow in `examples/bad`, as the tool reports it (the head, two of the findings, and the end; `examples/output` holds the
whole report in every format):

```
conversation-flow-check: examples/bad/support-voice.yaml
flow file: examples/bad/support-voice.yaml (yaml, 69 lines, 1,616 bytes)
name: Broadband help line (voice, with mistakes)
channel: voice (from the flow file)
steps: 11, 9 reachable from the start (message 6, input 2, choice 1, action 1, end 1)
waiting for the user: 3 steps; 0 handover steps; 1 step that cannot be undone
findings: 19 (10 error, 9 warning)
```

```
  ERROR    irreversible-unconfirmed       examples/bad/support-voice.yaml:42
           The step "take_payment" cannot be undone (action "take_card_payment") and runs without a confirm step before it: "ask_amount" (next) leads to it without a confirmation.
           fix: Put a step of type confirm in front of the action, say what is about to happen in its text, and send its yes to the action. Every edge into the action must be the yes of a confirm step.

  ERROR    flow-trap                      examples/bad/support-voice.yaml:51
           The step "retry_loop_a" is in a loop with no way out: from here no end, no handover and no dead end can be reached.
           fix: Give one step of the loop an edge that leaves it, such as a fallback to a handover after the reprompt limit.
```

```
This report reads the flow file and nothing else. It does not run the flow and does not talk to a bot. A clean result means that none of the problems of its checks were found in the file; it is not a statement that the bot is good, accessible or lawful.

RESULT: FAIL - 10 findings at or above error (10 error, 9 warning)
```

The salon flow in `examples/good` with its widget page:

```
conversation-flow-check: examples/good/booking-chat.yaml + examples/good/widget.html
flow file: examples/good/booking-chat.yaml (yaml, 97 lines, 2,352 bytes)
widget file: examples/good/widget.html (html, 19 lines, 613 bytes)
name: Salon booking (chat)
channel: chat (from the flow file)
steps: 13, 13 reachable from the start (message 2, input 2, choice 2, confirm 2, action 2, handover 1, end 2)
waiting for the user: 6 steps; 1 handover step; 2 steps that cannot be undone
widget: 12 start tags, 1 element that looks like the list of messages; one announces new messages
findings: 0
```

```
This report reads the flow file and nothing else. It does not run the flow and does not talk to a bot. A clean result means that none of the problems of its checks were found in the file; it is not a statement that the bot is good, accessible or lawful.

RESULT: PASS - no finding at or above error
```

## How the files are read

- The flow file is read as JSON when its first character is `{` or `[`, and as the YAML subset otherwise. The reader keeps the line
  and column of every key, so a finding points at the line.
- A syntax error is a `file-unreadable` finding with its line and column, and no other check of the flow runs. The run fails; a
  flow that cannot be read never passes.
- A step is read as far as it can be: a value that is not what the format says is a finding, and the step is still checked.
- The widget file is scanned as text for start tags. Comments, scripts and styles are skipped, and nothing is run or loaded.
- A file that is larger than 4 MiB, a link, a folder, a device, an address and text that is not UTF-8 or UTF-16 stop the run with
  exit code `2` and no report.

## What it checks

| Check | Level | What it looks at |
| --- | --- | --- |
| file-unreadable | error | a file is not a flow the reader can follow (a syntax error in the YAML subset or the JSON, a top level that is not a mapping, no start, no steps, or a file past a limit) or the widget file cannot be read as HTML text; no other check ran on that file |
| field-invalid | error | a value is not what the format says: a step type that is not one of message, input, choice, confirm, action, handover or end; a channel that is not chat or voice; a reprompt_limit that is not a whole number from 0 to 99; a true or false value that is text; a prompt that is not text |
| field-unknown | warning | a key the tool does not read, at the top level, in a step or in an option, often a misspelt name such as fallbak; nothing under it is checked |
| start-unknown | error | the start of the flow names a step that is not under steps (or names none); the checks of what can be reached did not run |
| step-target-unknown | error | a next, yes, no, fallback, on_error or option names a step that is not under steps |
| edge-missing | error | an option without a next step, or a confirm step that has only one of yes and no |
| step-unreachable | warning | a step that cannot be reached from the start step by following next, yes, no, fallback, on_error and the options |
| step-dead-end | error | a step with no way out (no next, yes, no, fallback, on_error or option) that is not marked as an end, by the type end or handover or by end: true |
| flow-trap | error | a reachable step from which no end, no handover and no dead end can be reached: a loop with no way out |
| input-no-fallback | error | an input, choice or confirm step with no fallback: nothing says what happens when the answer does not match |
| input-no-reprompt-limit | warning | an input, choice or confirm step with no reprompt_limit: nothing says how many times the user is asked again before the flow gives up and moves on |
| reprompt-limit-high | warning | a reprompt_limit above --max-reprompts (default 3) |
| no-handover | error | the flow has steps that wait for the user and no step of type handover, so there is no way to a person (--handover every-input or any) |
| handover-unreachable | error | a reachable input, choice or confirm step from which no step of type handover can be reached (--handover every-input, the default) |
| voice-multiple-questions | warning | in the voice channel, a prompt with more than one question mark |
| voice-prompt-too-long | warning | in the voice channel, a prompt with more than --max-words words (default 30) |
| irreversible-unconfirmed | error | a step marked irreversible: true, or an action step whose action (or id) holds a word such as pay, book, cancel, delete or refund, that can be reached without passing a confirm step whose yes leads to it |
| ai-disclosure-missing | warning | the opening of the flow (the start step, and the message steps that follow it up to the first step that waits for the user) does not say that the user is talking to an automated system or to an AI, by none of the phrases set with --disclosure-phrases |
| widget-message-list-not-found | warning | in the widget HTML (--widget), no element looks like the list of messages (an id or class with messages, transcript, conversation, log or thread) |
| widget-live-region-missing | error | in the widget HTML (--widget), the element that looks like the list of messages carries neither role="log" (or status, or alert) nor aria-live="polite" or "assertive"; WCAG 2.2 success criterion 4.1.3 (Status Messages) asks that a status message can be announced without taking the focus |

Every check is a best practice of this tool; `--explain <id>` says why it exists, what to change and what it cannot see.

## What is not checked

- Whether the bot works. The tool does not run the flow, and it cannot see triggers, intents, conditions or the platform's own
  handling of an answer that does not match.
- Whether the wording is good. It counts words and question marks of voice prompts and looks for phrases in the opening.
- Whether a law applies to you or you meet it. The opening check points at Article 50 of the EU AI Act and cannot tell whether the
  article applies, whether the circumstances make the notice obvious, or whether your wording is enough. It is not legal advice.
- Whether a widget is accessible. The widget check looks for one attribute, on the element that looks like the message list, in the
  file. It runs no script and does not see what a script sets later.
- The export formats of any platform. Convert the flow to the format of docs/inputs.md first.

[docs/limits.md](docs/limits.md) has the full list.

## Formats

- `text` for a terminal, `markdown` for a job summary or a pull request comment.
- `json` is the report object the other formats are built from.
- `sarif` is SARIF 2.1.0, for code scanning: the checks are the rules and each finding with a place in a file is a result with its
  line and column.
- `junit` has one test case for each check, a failure for a check with findings, a skip with the reason for a check that did not run
  and an error when the flow file could not be read. Every time is 0.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | No finding at or above the `--fail-on` level (default `error`). |
| `1` | At least one finding at or above it. |
| `2` | A usage error, or a file that cannot be read at all (missing, a link, a folder, too large, not text); no report. |

`--min-severity` hides findings from the listing and never changes the exit code.

## Limits

A file past 4 MiB, 200,000 lines, 40 levels of nesting, 20,000 steps, 1,500 options in a step, a text of 20,000 characters or
400,000 tags in a widget page is refused whole. Up to 1,000 findings of one check are listed; the rest are counted. See
docs/limits.md.

## Architecture

```
bin/conversation-flow-check.js   the command
src/cli.js                       arguments and the exit code
src/check.js                     options, a run, the report object
src/yaml.js, src/json.js         the two readers, with line and column
src/nodes.js                     the tree they build
src/flow.js                      the model of a flow: steps, edges, settings
src/graph.js                     the graph and its walks
src/checks.js                    the checks of a flow
src/widget.js                    the scan of the widget page and its check
src/rules.js                     the 20 checks: id, level, kind, text
src/report.js                    text, markdown, JSON, SARIF, JUnit
src/files.js, text.js, size.js   reading a file, cleaning text, numbers
tools/check.mjs                  the repository checks that run next to the tests
tools/example.mjs                runs the examples and writes examples/output
```

## Where the ideas come from

- Article 50 of the EU AI Act asks that people are told when they interact with an AI system, unless that is obvious from the
  circumstances. The opening check looks for the words that tell them.
- WCAG 2.2 success criterion 4.1.3 (Status Messages) asks that a status message can be announced by assistive technology without
  taking the focus. The widget check looks for the live region that does it for a list of messages.
- The advice on voice prompts (one question at a time, short prompts) and on conversation flows (a plan for an answer that does not
  match, a way to a person, a confirmation before an action that cannot be undone) is the common advice of conversation design.
  The numbers the tool uses are its own choice and can be changed.

docs/context.md says what a flow check is good for and where it misleads, docs/method.md has the method, docs/decisions has the
decisions, docs/threat-model.md and docs/secure-defaults.md have the security notes.

## License

MIT, see [LICENSE](LICENSE).
