# 3. Read the files on disk, and contact nothing

## Status

Accepted

## Context

A tool that checks a flow could fetch the flow from the platform, look the actions up in a catalogue, load the widget page in a
browser or ask a service whether the wording is lawful. That would need the network and often a key, would make the result depend
on the state of other systems at the moment of the run, would send the text of the bot to a third party, and would let a file in a
pull request make the pipeline reach any address it names.

What a check before a release needs first is a result that can be repeated: the same files give the same report. The files are on
disk.

## Decision

1. The tool reads the files it is given, and nothing else. It contacts nothing over the network, fetches nothing, needs no key,
   runs no program and sends no data anywhere.
2. A path that looks like an address is refused. A symbolic link, a folder and a device are refused. A file that is not text, or is
   too large, is refused with exit code `2` and no report.
3. The tool reads no clock and no locale. Nothing in a check needs the date, so no option gives it one, and the same files give the
   same report on every day. The JUnit report records every time as 0.
4. The tool writes only to standard output and standard error. It keeps no cache, no log and no temporary file.
5. A step id, a text, an action name or a class name written in a file is text. It is never looked up, opened or followed.
6. The widget page is scanned as text. No script is run and nothing the page names is loaded.

## Consequences

- The tool is usable in a pipeline that has no network, and a hostile file cannot make it reach anything.
- The tool does not know what an action does, which platform runs the flow or whether a law applies. The checks work from the files
  alone, and docs/limits.md says what is not seen.
