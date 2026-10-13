# Context

This document says what checking a conversation flow before release is good for, and where it misleads. It is background for
reading the reports, not a claim that the tool makes a bot better.

## What a flow is

A chatbot or a voice assistant that follows a script is a set of steps. Each step says something, asks something or does
something, and each leads to the next. The set is written in a builder, a spreadsheet or a file, and it grows: a step is added for
a new case, another is renamed, a third is left behind. Nobody reads the whole graph again after each edit, and the mistakes that
come from that are the same few:

- a link that names a step that was renamed;
- a step that nothing leads to any more;
- a question with no plan for an answer that does not match, so it asks again for ever or stops;
- a place where the user is stuck and cannot reach a person;
- a payment, a booking or a deletion that runs on a word the bot may have misheard;
- a voice prompt that is too long to remember, or asks two things at once;
- an opening that never says that the user is talking to a machine.

conversation-flow-check reads the file and looks for exactly these. That makes the check cheap, repeatable and the same on every
machine, which is what a check before a release needs. It also makes it narrow.

## Why these checks

- **Graph mistakes** (unreachable steps, dead ends, loops with no exit, edges to nothing) are facts about the file. They need no
  judgement, and they are the ones a person misses in a long file.
- **Stuck users** are the cost of a flow that asks without a plan. A fallback and a limit on asking again are the plan. A route to
  a person from every question is the way out when the plan fails.
- **Irreversible actions** are where a wrong guess costs most. Asking "shall I do this?" before a payment is old advice in
  every kind of interface, and it is cheap to look for in a graph.
- **Voice prompts** are heard once, in order. One question at a time and a short prompt are the usual advice of voice design. The
  numbers in the tool (one question mark, thirty words) are a starting point that you can change.
- **Telling people they talk to a machine** is the subject of Article 50 of the EU AI Act, which asks that people are told when they
  interact with an AI system, unless that is obvious from the circumstances. The tool looks for a phrase in the opening and
  points at the article. Whether the article applies to your service is a question for a lawyer.
- **A live region on the message list** is what WCAG 2.2 success criterion 4.1.3 (Status Messages) asks of a widget whose content
  changes without the focus: a screen reader user hears a new message only if the page announces it.

## Where it misleads

- **A flow in a file is not the bot.** The platform adds its own handling: an intent engine, a timeout, a counter, a default reply.
  The tool sees none of it, and says so in docs/limits.md.
- **A clean report is not a good bot.** It means that the mistakes the tool knows were not found. A bot can pass every check and
  still be confusing, wrong or unhelpful.
- **A finding can be a choice.** A flow with no handover may be right for a bot that has no one to hand over to, and
  `--handover off` says so. An opening without a disclosure may be right where it is obvious; `--disable` says so. The tool asks;
  you decide.
- **Words are not meaning.** The irreversible check works from the words of a name, the disclosure check from phrases. Both have
  near misses on each side, and both can be wrong for a flow written in a style the lists do not know.
- **Counting is not hearing.** Thirty words can be too long or fine depending on how they are spoken.

## Using it well

Keep the flow in a file that is checked on every change, as a step of the build that fails on `error`. Read each finding as a
question to the author, not as a verdict. Set the options to what your service needs (`--channel`, `--max-words`, `--handover`,
`--irreversible-actions`, `--disclosure-phrases`) and write them down in the build, so that the next person sees the same rules.
Mark an action that cannot be undone with `irreversible: true` instead of trusting its name. Test the bot with people as well:
the tool cannot do that part.
