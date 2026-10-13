# Inputs

conversation-flow-check reads one flow file, and, if you ask, one HTML file of a chat widget. It reads the text of the files and
nothing else. It does not run the flow, does not talk to a bot and does not open anything a file names. This document is the
format of the flow file, the small subset of YAML the tool reads, and what the widget check looks at.

## A flow file, in YAML or JSON

A flow is a set of **steps** that lead to each other. One step is where the conversation **starts**. The file is read as JSON when
its first character (after white space) is `{` or `[`, and as the YAML subset below otherwise. The two forms mean the same thing.

```yaml
name: Salon booking (chat)        # optional, shown in the report
description: Books visits.        # optional, not read further
channel: chat                     # optional: chat or voice
start: welcome                    # required: the id of the first step
steps:                            # required: a mapping of step ids to steps
  welcome:
    type: message
    text: Hi, I am an automated assistant.
    next: ask_need
  ask_need:
    ...
```

The keys at the top level:

| Key | Meaning |
| --- | --- |
| `name` | A title for the report. Optional text. |
| `description` | Free text, read as text and otherwise ignored. |
| `channel` | `chat` or `voice`. The voice checks (one question, length) run only for `voice`. `--channel` on the command line overrides it. Default: `chat`. |
| `start` | The id of the step where the conversation begins. Required. |
| `steps` | A mapping of step ids to steps. Required, and not empty. A step id is any text, written once. |

A key the tool does not know is a `field-unknown` warning with the nearest name, because a misspelt key hides a setting from every
check.

## A step

A step is a mapping with these keys. Every key is optional; what a step needs depends on its type.

| Key | Meaning |
| --- | --- |
| `type` | One of `message`, `input`, `choice`, `confirm`, `action`, `handover`, `end`. Default: `message`. |
| `text` | What the bot says (or asks) at this step. Text. |
| `next` | The id of the step that follows. |
| `yes`, `no` | The steps that follow the two answers of a `confirm` step. |
| `fallback` | The id of the step to go to when the answer still does not match after `reprompt_limit` tries (see below). |
| `on_error` | The id of the step to go to when an `action` fails. |
| `options` | For a `choice` step: a list of mappings with a `label` and a `next`. |
| `reprompt_limit` | A whole number from 0 to 99: how many times the step asks again before it follows its `fallback`. |
| `action` | For an `action` step: the name of what it does, such as `refund_order`. |
| `irreversible` | `true` marks a step that cannot be undone; `false` clears the words check for this step. |
| `end` | `true` marks the step as an end of the conversation, like the type `end`. |
| `note` | Free text for the team, ignored by the tool. |

### Step types

| Type | What it is | Edges it needs |
| --- | --- | --- |
| `message` | The bot says something and goes on. | `next`, or `end: true` |
| `input` | The bot asks and waits for free text or speech. | `next`, `fallback`, `reprompt_limit` |
| `choice` | The bot asks and offers options. | `options` (each with a `next`), `fallback`, `reprompt_limit` |
| `confirm` | The bot asks yes or no. | `yes` and `no`, `fallback`, `reprompt_limit` |
| `action` | The bot does something (a booking, a payment, a look-up). | `next`, and `on_error` if it can fail |
| `handover` | The bot passes the user to a person. An end. | none |
| `end` | The conversation ends. | none |

The three types that wait for the user (`input`, `choice`, `confirm`) are the **input steps** of the checks.

### Edges

An **edge** is a key that names another step: `next`, `yes`, `no`, `fallback`, `on_error`, and the `next` of each option. The tool
follows all of them, as if a user could take any, when it works out what can be reached. An edge must name a step under `steps`,
spelt the same with the same case (`step-target-unknown` otherwise).

### What a fallback and a reprompt limit mean

When the user's answer does not match what an input step expects, a bot usually asks again. `reprompt_limit` says how many times.
`fallback` says where the flow goes when that is used up, or when the platform has no other plan: a step that explains and offers
a person, or a handover. The tool does not run any of this. It asks for both because a step with neither either stops or asks
for ever.

### What counts as an end

A step is an end if its type is `end` or `handover`, or if it has `end: true`. A step with no edge that is not an end is a dead
end (`step-dead-end`).

## The YAML subset

The tool reads its own small reader of YAML, with no dependency. It reads what a flow needs, and it refuses the rest with the
line and column instead of guessing.

| Supported | Example |
| --- | --- |
| Mappings and lists by indentation with spaces | `steps:` then indented keys |
| A list at the level of its key | `options:` then `- label: A` on lines that start at the same column |
| A mapping inside a list item | `- label: A` then `  next: b` |
| Plain, single-quoted and double-quoted scalars | `text: Hello`, `text: 'It''s here'`, `text: "Say \"yes\""` |
| `true`, `false`, `null`, `~` and whole numbers (up to 15 digits) | `reprompt_limit: 2` |
| Escapes in double quotes | `\n \t \r \0 \" \\ \/ \xNN` |
| Lists of scalars in square brackets, and `[]`, `{}` | `tags: [a, b]` |
| Block scalars `\|` (keep line breaks) and `>` (fold lines into one) | `text: \|` then indented lines |
| Comments | `# text`, and `text: Hi # note` (a `#` after a space) |
| One `---` at the start | |
| Keys in quotes | `"a b": 1` |

| Not supported (an error with line and column) | Why |
| --- | --- |
| Tabs in the indentation | ambiguous |
| Anchors, aliases and tags (`&a`, `*a`, `!t`) | a flow does not need them, and they hide what a step holds |
| Mappings in braces (`{a: 1}`), other than `{}` | write the keys on lines of their own, or use JSON |
| Several documents, `...`, complex keys (`?`) | one flow per file |
| A quoted value over several lines | use a block scalar |
| A plain value with a colon and a space (`text: Note: this`) | put it in quotes |
| A key written twice in one mapping | the second would silently win in other readers |
| `yes`, `no`, `on`, `off` as booleans | they stay text, so `yes:` and `no:` are plain keys of a confirm step |

Nothing the reader reads is evaluated: a string is only a string. The reader keeps no state between runs.

## JSON

JSON is read as JSON: double quotes, no comments, no trailing commas. A key written twice in one object is an error. The line and
column of every key are kept, so a finding points at the line of the step in either form.

## The widget file (optional)

`--widget <file>` names the HTML of a page with the chat widget. The tool scans its start tags (comments, scripts and styles are
skipped) and looks for the element that holds the messages: a `div`, `ul`, `ol`, `section`, `article`, `aside`, `main`, `dl`,
`table` or `tbody` whose `id` or `class` has a word such as `messages`, `transcript`, `conversation`, `log` or `thread`
(`chat-messages`, `chatLog`), or the words `message` and `list`, `container`, `area`, `history`, `window`, `wrapper` or `panel`
together; or any element with `role="log"`. That element must carry `role="log"`, `role="status"` or `role="alert"`, or
`aria-live="polite"` or `"assertive"`. `aria-live="off"` never counts. If one candidate announces, the check passes. See
docs/method.md for what this does and does not show.

## How the files and options are matched

- The flow file and the widget file are separate checks. Either can be given alone; a run needs at least one.
- The channel of a run is `--channel` if given, otherwise the `channel` of the file, otherwise `chat`. The report says which.
- Ids are compared as written, with case. `Hello` and `hello` are two steps.
- The path shown in a report is relative to the folder you run the command in, with forward slashes, followed by the line.

## A short flow

This flow passes every check at every level. The tests run it.

```yaml
name: Short flow
channel: chat
start: hello
steps:
  hello:
    type: message
    text: Hi, I am an automated assistant.
    next: ask
  ask:
    type: input
    text: What is your name?
    reprompt_limit: 2
    next: bye
    fallback: person
  bye:
    type: end
    text: Goodbye.
  person:
    type: handover
    text: Passing you to a person.
```
