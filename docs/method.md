# Method

conversation-flow-check reads the text of a flow file, builds a graph of its steps and looks for the mistakes that are cheap to
find in a graph and expensive to find in front of a user. This document says what it does, in order, what each check looks at and
what each one cannot see. It does not run the flow, talk to a bot or look anything up.

## The order of the work

1. **Read the files.** Each file is opened once, as a regular file of bounded size, never through a link, and decoded as UTF-8 or
   as UTF-16 with a byte order mark. A file that holds a null byte or is not valid text is refused with exit code `2` and no
   report. Nothing else on the disk is opened.
2. **Read the flow.** A first character of `{` or `[` means JSON, anything else the YAML subset of docs/inputs.md. Both readers
   build the same tree, with the line and column of every key and value. A syntax error is a `file-unreadable` finding with its
   line and column, and no other check of the flow runs.
3. **Read the model.** The tree becomes steps with a type, a text, edges and settings. A value that is not what the format says
   is a `field-invalid` finding; a key that is not read is `field-unknown`; an option with no next, or a confirm step with one
   answer, is `edge-missing`. The step is still read as far as it can be.
4. **Build the graph.** An edge to a step that exists is an edge of the graph; an edge to a step that does not exist is a
   `step-target-unknown` finding and is left out.
5. **Walk the graph.** What can be reached from the start, and what can reach an end, a handover or a dead end, are worked out with
   a list of steps still to visit and a set of steps seen. No walk calls itself, so a long chain or a ring cannot exhaust the stack.
6. **Run the checks.** Each check reads the model and the walks. Findings are collected with a cap of 1,000 for each check; the
   rest are counted and the report says so.
7. **Check the widget,** if one was given, in the same run.
8. **Write the report** in the format asked for, to standard output.

## The checks

Every check is a best practice of this tool. No standard sets the shape of a conversation flow, and each check says in its `own`
text why the tool asks for it. Where a check points at a law or a guideline, it says what that text asks, and that the tool cannot
tell whether it applies to you or whether you meet it.

### step-unreachable

A step that cannot be reached from the start by following `next`, `yes`, `no`, `fallback`, `on_error` and the options is a warning.
It is usually a link lost in an edit. *Cannot see:* a step that your platform enters from outside the flow (a trigger, another
flow, a deep link) looks unreachable here. If the start does not exist, the check does not run and `start-unknown` says so.

### step-dead-end

A step with no edge at all that is not an end (type `end` or `handover`, or `end: true`) is an error: the conversation stops
there. A step whose only edge leads to a step that does not exist is not a dead end; its edge is a `step-target-unknown`.
*Cannot see:* a platform that closes the conversation with a message after a step that is not marked as an end.

### flow-trap

A reachable step from which no end, no handover and no dead end can be reached is a loop with no way out. A loop with one edge
that leaves it is not a trap. A loop that leads to a dead end is reported as the dead end. *Cannot see:* a counter or a timeout
outside the file that breaks a loop; the tool follows every edge as if a user could take it.

### input-no-fallback, input-no-reprompt-limit, reprompt-limit-high

An input step (`input`, `choice`, `confirm`) is where users say things the flow did not expect. The tool asks that it has a
`fallback` (error), a `reprompt_limit` (warning), and that the limit is not above `--max-reprompts` (default 3, warning). A limit of
0 is a limit. *Cannot see:* whether the step named as the fallback handles the case well, or how your platform counts a reprompt.

### no-handover, handover-unreachable

With `--handover every-input` (the default) the flow needs a step of type `handover`, and one must be reachable from every
reachable input step by any path. With `--handover any` one handover step is enough, and with `--handover off` neither check runs.
A flow with no input step at all needs no handover. *Cannot see:* whether the user is told how to ask for a person, whether the
words they say at that step are understood, or whether anyone is on the other end.

### voice-multiple-questions, voice-prompt-too-long

Only for the voice channel, on the `text` of message, input, choice and confirm steps. A prompt with more than one `?` (also the
full-width one) is a warning, and so is a prompt with more words than `--max-words` (default 30; words are separated by white
space). *Cannot see:* a question written without a question mark, the speaking time, or a prompt that is split over several
message steps that the user hears in a row.

### irreversible-unconfirmed

A step is **irreversible** if it has `irreversible: true`, or if it is an `action` step (with `irreversible` not set to `false`)
whose `action` (or id, if it has no `action`) holds one of the words of `--irreversible-actions`. The default words are pay,
payment, charge, purchase, checkout, book, booking, reserve, cancel, delete, remove, erase, refund, transfer, order, submit and
terminate. A name is split at anything that is not a letter or a digit and at a lower-case letter followed by a capital, and a
trailing `s` is ignored, so `refundOrder`, `refund_order` and `refunds` match `refund`, and `payload` and `reorder` do not. The
step is **confirmed** if it is not the start step, something leads to it, and every edge into it is the `yes` of a `confirm`
step. One other way in is enough to report it. *Cannot see:* an action with a harmless name that cannot be undone (mark it with
`irreversible: true`), a confirmation that sits two steps before the action, or whether the confirm step says what is about to
happen.

### ai-disclosure-missing

The **opening** of the flow is the start step and each message step that follows it by `next`, up to and including the first step
that is not a message. If none of the texts of the opening holds one of the phrases of `--disclosure-phrases` (default: automated,
bot, chatbot, ai, artificial intelligence, virtual assistant, digital assistant, not a human, not a person, not a real person) it
is a warning. A phrase matches whole words in order, in any case: `bot` does not match `robotic`, and `ai` does not match `Aimee`.
The finding says that Article 50 of the EU AI Act asks that people are told when they interact with an AI system, unless that is
obvious from the circumstances. *Cannot see:* whether the law applies to you, whether the circumstances make it obvious, whether
your wording is enough, or whether the notice reaches the user. It is not legal advice. Turn the check off with
`--disable ai-disclosure-missing`.

### The widget checks

`widget-message-list-not-found` (warning) and `widget-live-region-missing` (error) look at the HTML of the chat widget. WCAG 2.2
success criterion 4.1.3 (Status Messages) asks that a status message can be announced by assistive technology without taking the
focus; for a list of messages the usual way is `role="log"` (which implies a polite live region) or an `aria-live` attribute. The
tool scans start tags, picks the elements that look like the message list (docs/inputs.md), and passes when one of them announces
new content. *Cannot see:* what a script sets after the page loads, whether a screen reader announces the messages, whether
the focus is handled, or the rest of WCAG. A page that builds its message list at run time has none in the file, and the tool says
it found none.

### The checks about the file

`file-unreadable` (a syntax error, no start, no steps, a top level that is not a mapping, a file past a limit),
`field-invalid`, `field-unknown`, `start-unknown`, `step-target-unknown` and `edge-missing` say that the file is not the flow the
author meant. They come first in the report because every other check depends on them.

## Levels, exit codes and the result

Each check has a level: `error`, `warning` or `info`. A run **fails** when a finding is at or above `--fail-on` (default `error`).
`--min-severity` only hides findings from the listing; it never changes the exit code. A clean result is worded as "no finding at
or above the level" and never as an approval. The exit codes are `0` (no finding at or above the level), `1` (one or more) and
`2` (a usage or input error, with no report).

## What the formats show

- **text** and **markdown:** the head (files, name, channel, steps by type), the table of the 20 checks with a status (`pass`,
  `fail`, `skipped` with the reason, or `not-evaluated`), the findings with a fix for each, the notes and the result.
- **json:** the report object all the other formats are built from.
- **sarif:** SARIF 2.1.0, the checks as rules and one result for each finding that has a place in a file, with line and column.
- **junit:** one test suite `flow` with one test case for each check: a failure with the messages of the findings, a skip with the
  reason, or an error when the flow file could not be read. Every time is 0, because the tool reads no clock.
