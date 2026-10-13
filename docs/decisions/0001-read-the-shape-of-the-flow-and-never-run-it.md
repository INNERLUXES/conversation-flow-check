# 1. Read the shape of the flow, and never run it

## Status

Accepted

## Context

A tool that checks a conversation flow could run it: send test messages to the bot, follow the answers, and report where the
conversation broke. That would find more, such as a reply that makes no sense. It would also need the bot, an address, often a key,
and the state of another system at the moment of the run; it would send test text to a third party, and a pull request could make
the pipeline call any bot it names.

The mistakes that cost most are also the ones that are visible in the file: an edge to a step that is gone, a step nobody can
reach, a question with no plan for a wrong answer, a payment with no question before it. They need no running bot to find.

## Decision

1. The tool reads the text of the flow file, builds a graph of its steps and checks the shape of the graph and a few properties of
   the text of a prompt. It never runs the flow and never talks to a bot.
2. Every finding points at a file, a line and a column that a reader can check by looking at the file.
3. Everything the file does not hold (triggers, intents, conditions, the platform's own handling) is said, in docs/limits.md, to
   be outside what the tool sees. A check that would depend on it is not added.
4. A clean result is worded "no finding at or above the level", never as an approval of the bot.

## Consequences

- The same file gives the same report on every machine and on every day, and a report can be kept as a record of what was checked.
- The tool misses everything that only a run shows. Test the bot with people as well.
- A step that the platform enters from outside the file looks unreachable. The warning level of that check is the price.
