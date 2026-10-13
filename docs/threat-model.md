# Threat model

conversation-flow-check reads a conversation flow written as YAML or JSON, and optionally the HTML of a chat widget, and reports
problems in them. It does not run the flow, does not talk to a bot, is not legal advice and is not an accessibility audit. This
document is about the tool itself: what it touches, what a hostile or careless file can try, and what stops it.

## What the tool touches

- It reads the flow file and the widget file named on the command line. Nothing else is opened, and no path, address or text
  written in a file is looked up, opened or followed.
- It writes the report to standard output and its errors to standard error. It writes nothing to disk.
- It opens no network connection, fetches no URL, follows no symbolic link, runs nothing it reads, evaluates nothing and reads no
  clock and no locale.

## What the input may hold

The files come from a person, from a colleague, from an export, or, in a pipeline that checks every pull request, from whoever sent
the pull request. Through the files, a person can try to, or a careless run can:

- make the tool read outside the files: a link named on the command line, a folder, an address given as the path, a step id or a
  text that looks like a path or a URL;
- make the tool run something: an anchor, a tag or a string in the YAML that another reader would turn into an object or a
  command; a script in the widget page;
- exhaust the memory, the stack or the time: files of many megabytes, a hundred thousand lines, brackets nested a hundred thousand
  deep, twenty thousand steps in a ring or all leading to each other, thousands of options in a step, a text of the longest length,
  a widget page of hundreds of thousands of tags or of attributes, a script that is never closed;
- move the result: a key written twice so that two readers see two values, a misspelt key that hides a fallback, a step id named
  `__proto__` or `constructor` that changes how objects behave, an edge that differs from a step id only in case, a very long text
  that pushes a finding out of sight;
- rewrite the terminal or the report: control characters, escape sequences, line and paragraph separators or direction controls in a
  step id, a text or a file name; markup or an XML special character in a text that ends in the markdown or the JUnit report;
- make the exit code lie: a flow that cannot be read must not pass, a check that did not run must say so, and a step that was not
  read must not be taken for one that is fine.

## What stops it

| Risk | What the tool does |
| --- | --- |
| Reading outside the files | Only the two paths given are opened, through one handle whose type and size are checked first; a link, a folder, a device and an address are refused; nothing in a file is used as a path. |
| Running something | The readers are its own and evaluate nothing. Anchors, aliases, tags and mappings in braces are refused. The widget scanner reads start tags as text, runs no script and loads no style. |
| Memory, stack and time | Limits on size, lines, depth, steps, options, text and tags (docs/limits.md). No function calls itself: the readers use a stack and a loop, the graph walks use a list and a set. A file past a limit is refused whole. |
| Two readings of one file | A key written twice is an error in both readers. An unknown key is a warning with the nearest name. |
| Object tricks | Keys and ids are kept in maps and sets, never set as properties of an object. `__proto__` is only a name. |
| Output tricks | Text from the input goes through `safeText` before it reaches a report or an error message; the markdown report escapes what markdown gives a meaning to; the XML report escapes what XML gives a meaning to and replaces the characters XML 1.0 cannot hold. |
| A pass by silence | A file that cannot be read is an error, every check that did not run is shown as skipped or not-evaluated with the reason, and the run fails at the default level. |
| Patterns from the input | No regular expression is built from a file or from an argument; the phrases of the opening check are split into words and compared as words. |
| Dependencies | None. Node 22 or newer and its own library. |

## What it does not stop

- A flow that is wrong but well formed. The tool checks the shape, not the intent.
- A secret in a text of the flow. The tool does not look for secrets and does not log texts, but it prints the text of a finding, so
  keep the report with the same care as the file.
- A pipeline that gives the tool a file it should not read, or that passes the report on somewhere. See docs/secure-defaults.md.
- The meaning of the law. The tool points at Article 50 of the EU AI Act and at WCAG 2.2 success criterion 4.1.3 and cannot say
  whether they apply to you.
