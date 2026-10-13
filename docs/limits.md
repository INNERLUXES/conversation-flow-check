# Limits

This document says what a clean result means, what the tool is not, what it cannot see and which limits bound its work.

## What a clean result means

A clean result means that none of the problems that the checks look for were found in the flow file (and the widget file, if one
was given), at the level you set. It is worded "no finding at or above the level" and nothing stronger. It is not a statement that
the bot is good, that users will get what they need, that the wording is clear, that the flow is lawful or that the widget is
accessible.

## What the tool is not

- **Not a test of the bot.** It does not run the flow, send a message, call an intent engine or check what a platform does with the
  file. A flow that passes can still fail in front of a user.
- **Not a review of the wording.** It counts words and question marks of voice prompts and looks for a few phrases in the opening.
  It does not judge tone, clarity or accuracy.
- **Not legal advice.** The opening check points at Article 50 of the EU AI Act. The tool cannot tell whether that article applies
  to you, whether the circumstances make it obvious that people talk to an AI system, or whether your wording meets it. Ask a
  lawyer.
- **Not an accessibility audit.** The widget check looks for one thing, a live region on the message list, that WCAG 2.2 success
  criterion 4.1.3 asks for. A widget has many other things to get right, and the tool looks at none of them.
- **Not a standard.** Every check is a best practice of this tool, and says so. The defaults (three reprompts, thirty words) are its
  own choice.

## What the tool cannot see

- **Anything outside the file.** Triggers, other flows, deep links, intents, entities, slots, variables, conditions, scripts and
  the platform's own handling of an unmatched answer are not in the file. A step that is entered from outside looks unreachable,
  and a loop that the platform breaks looks like a trap.
- **Formats of other platforms.** The tool reads the format of docs/inputs.md. A flow exported from a platform has to be
  converted to it; the tool does not read the export formats of any platform.
- **What the user is told.** A handover step exists in the file; whether the user is told how to reach it is not seen.
- **Whether a name says what a step does.** The irreversible check works from the words of an action's name, or from
  `irreversible: true`. An action with a harmless name needs the flag.
- **Conditions on an edge.** Every edge is followed as if a user could take it. A step that is reachable only when a condition
  that can never hold is true looks reachable.
- **Order in time.** A confirmation that sits two steps before an action is not seen; the confirm step has to lead to the action.
- **Text built at run time.** A prompt that a script fills in is only the text in the file.
- **Languages.** The word count splits on white space and the phrase search on letters and digits. A language without spaces between
  words is counted as one word for each run of characters, and a disclosure written in another language needs
  `--disclosure-phrases` in that language.
- **The page as the user sees it.** The widget check reads attributes in a file. It runs no script, loads no style and builds no
  tree; an attribute that a script sets later is not seen, and one a script removes is.
- **Which of two candidates is the message list.** The widget check passes when one element that looks like the message list
  announces, and does not know whether it is the right one.

## Limits of the work

A file past a limit is refused whole; the tool never reads a part of a file and goes on.

| Limit | Value |
| --- | --- |
| Size of a file | 4 MiB |
| Lines of a YAML flow | 200,000 |
| Nesting of YAML, or of brackets in JSON | 40 levels |
| Steps in a flow | 20,000 |
| Options in one step | 1,500 |
| Length of one text | 20,000 characters |
| Start tags in a widget file | 400,000 |
| Attributes kept for one tag | 64 |
| Findings kept for one check | 1,000 (the rest are counted) |

No function of the tool calls itself, so no shape of file can exhaust the stack. The readers, the graph walks and the checks visit
each step and each edge a bounded number of times; they never compare every pair of steps. The tests run a line and a ring of 15,000
steps, 1,500 steps that all lead to each other, a tag soup of 60,000 lines, brackets nested 100,000 deep and a line of 100,000
quotes, each in a few seconds.
