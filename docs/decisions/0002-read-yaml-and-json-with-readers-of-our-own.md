# 2. Read YAML and JSON with readers of our own

## Status

Accepted

## Context

Flows are written in YAML and in JSON. A library would read full YAML, but full YAML has anchors, aliases, tags, merge keys and
several documents, and some readers turn tagged values into objects. A library is also a dependency, and the tool has none. The
finding of a check should point at a line and a column, which most readers do not keep, and a key written twice should be an
error, which most readers resolve in silence.

## Decision

1. The tool reads JSON with a small reader that keeps the line and column of every key and value, refuses a key written twice and
   a trailing comma, and works through a stack and a loop.
2. The tool reads a documented subset of YAML (docs/inputs.md) with a reader of its own that does the same. It refuses what it does
   not read, with the line and column, instead of guessing: anchors, aliases, tags, mappings in braces, several documents, tabs in
   the indentation, a quoted value over several lines, a plain value with a colon and a space.
3. Both readers build the same tree of scalars, mappings and lists, kept in maps, so a key such as `__proto__` is only a name. The
   readers have limits of size, lines and depth, and no function calls itself.
4. `yes`, `no`, `on` and `off` stay text. The keys `yes` and `no` of a confirm step would otherwise turn into booleans.

## Consequences

- A flow that another YAML reader accepts can be refused here, with a message that says why. The cure is to quote the value or to
  use JSON.
- The tool never builds an object from a tag, and a file cannot make it run anything.
- The subset is documented, and a test compares both readers on the same content.
