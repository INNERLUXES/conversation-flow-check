# Security

## Reporting a problem

Use private vulnerability reporting on this repository (the Security tab, "Report a vulnerability"). Please do not open a public
issue for a vulnerability.

Include a small made-up flow that shows the problem, the command you ran, what you expected and what happened. Use made-up step
ids, texts and actions, never a flow of a real service or the name of a real company or product, and never a real key, token or
password, even an old one.

## Scope

The tool reads the text of a flow file, and optionally of a chat widget page, and checks its shape. It does not run the flow, it is
not a test of the bot, it is not legal advice and it is not an accessibility audit. In scope:

- an input that makes the tool read a file other than the ones it was given, or follow a symbolic link
- an input that makes the tool open a network connection, fetch a URL, write or sign anything, run any other program, or evaluate
  anything it reads, such as an anchor, a tag or a string in the YAML or the JSON
- an input that makes the tool write a file
- an input that makes the tool hang, take very long, exhaust the stack or use unbounded memory, such as a very large file, brackets
  nested very deep, tens of thousands of steps in a ring or all leading to each other, thousands of options in a step, a text of
  the longest length, a line of many quotes, a widget page of hundreds of thousands of tags, or a script that is never closed
- binary or invalid input that the tool reads as if it were a flow
- a key written twice that is read without an error, a misspelt key that is not reported, or an edge that differs from a step id
  only in case that is taken for that step
- a flow that docs/method.md says is reported (an edge to a step that does not exist, a dead end, a loop with no way out, an input
  step with no fallback, an irreversible action with no confirmation) that the tool does not report
- a run that passes at a `--fail-on` level although the input holds a finding at that level that docs/method.md says is reported,
  or a flow that cannot be read and still passes
- text from a file or a file name that rewrites the terminal through control or direction characters, is shown unescaped in the
  output, puts markup into the markdown report or breaks the XML of the JUnit report
- a name such as `__proto__` that changes how objects behave inside the tool

Out of scope: the forms docs/limits.md says the tool does not see, whether a flow is good, whether a law applies to a service or is
met (the tool names Article 50 of the EU AI Act and WCAG 2.2 success criterion 4.1.3 and cannot tell), what a platform does with a
flow, who may change or upload the files, and where your pipeline keeps the output.

Read [docs/threat-model.md](docs/threat-model.md) for the rest.
