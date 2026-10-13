# Changes

## 1.0.0

First release.

- Checks a chatbot or voice conversation flow before it reaches users. Reads one flow file, YAML (a small documented subset) or
  JSON, with steps that lead to each other, and, if asked, the HTML of a chat widget page. It reads the text of the files and
  nothing else: it does not run the flow, does not talk to a bot and does not judge the wording. It is not a test of the bot, not
  legal advice and not an accessibility audit. It contacts nothing over the network, runs nothing, needs no key, follows no
  symbolic link, reads no clock and writes nothing to disk.
- The flow format, documented in docs/inputs.md: `name`, `description`, `channel`, `start` and `steps`; a step has a `type`
  (message, input, choice, confirm, action, handover, end), a `text`, the edges `next`, `yes`, `no`, `fallback` and `on_error`,
  `options` with a label and a next, `reprompt_limit`, `action`, `irreversible`, `end` and `note`.
- Two readers of its own with the line and column of every key and value, no dependency and no recursion: JSON, and a documented
  subset of YAML (mappings and lists by indentation, plain and quoted scalars, lists of scalars in square brackets, block scalars
  and comments). Anchors, aliases, tags, mappings in braces, several documents, tabs in the indentation and a key written twice are
  refused with the line and column.
- Graph checks: `step-unreachable`, `step-dead-end`, `flow-trap` (a loop with no way out), `step-target-unknown`, `edge-missing`
  and `start-unknown`.
- Checks for users who get stuck: `input-no-fallback`, `input-no-reprompt-limit` and `reprompt-limit-high` (`--max-reprompts`).
- A way to a person: `no-handover` and `handover-unreachable`, with `--handover every-input`, `any` or `off`.
- Voice wording: `voice-multiple-questions` and `voice-prompt-too-long` (`--max-words`), for the voice channel only, set by the
  flow file or by `--channel`.
- `irreversible-unconfirmed`: a step marked `irreversible: true`, or an action step whose action holds a word of
  `--irreversible-actions` (pay, book, cancel, delete, refund and others), must be reached only through the yes of a confirm step.
- `ai-disclosure-missing`: the opening of the flow must hold a phrase of `--disclosure-phrases`; the finding says what Article 50 of
  the EU AI Act asks and that the tool cannot tell whether it applies.
- `--widget`: a scan of the HTML of a chat widget page for the element that holds the messages, with `widget-message-list-not-found`
  and `widget-live-region-missing` (WCAG 2.2 success criterion 4.1.3, Status Messages).
- Checks of the file: `file-unreadable`, `field-invalid` and `field-unknown`, with the nearest name for a misspelt key.
- Twenty checks in all, each marked as a check of a file, of a step, of the flow, of the wording or of the widget, each a best
  practice of the tool and saying so; `--disable` leaves checks out and the report names them.
- Reports as text, markdown, JSON, SARIF 2.1.0 (for the findings that are in a file, with line and column) and JUnit XML (one test
  case for each check); `--min-severity`, `--fail-on`, `--list-checks` and `--explain <id>` with what a check looks at, why it
  exists, what to change and what it cannot see. Exit code `0` when no finding is at or above the fail-on level, `1` when one is,
  `2` for a usage or input error, with no report.
- Made-up examples: a salon booking flow in YAML with its widget page, a broadband help line for voice and a shop returns flow in
  JSON, which pass every check at every level; a voice flow with a mistake of most checks, a chat flow, a flow that cannot be read
  and a widget page that does not announce new messages; with their real output in all formats, the list of checks and the
  explanation of a check.
- Release packages come with a CycloneDX SBOM, SHA-256 checksums and a build provenance attestation, after the SSDF gate of the
  repository.
