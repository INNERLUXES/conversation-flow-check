# 4. Name the law and the guideline, and never claim compliance

## Status

Accepted

## Context

Two of the checks are close to texts that people take seriously. Article 50 of the EU AI Act asks that people are told when they
interact with an AI system, unless that is obvious from the circumstances. WCAG 2.2 success criterion 4.1.3 (Status Messages) asks
that a status message can be announced without taking the focus. A tool that says "compliant" or "not compliant" about either would
claim to know things it cannot see: whether the law applies to the service, whether the circumstances make the notice obvious,
whether a script changes the attributes of the page, whether a screen reader announces the messages.

A tool that says nothing about them would leave out the reason the checks exist.

## Decision

1. A check that is close to such a text names the text, says in a sentence what it asks, and says in the same place that the tool
   cannot tell whether it applies or whether it is met.
2. The disclosure check is a warning that looks for phrases in the opening, and can be turned off with `--disable`. The phrases are
   a list that the user can replace.
3. The widget check looks for one attribute on one element. It says what it looked at and what it cannot see.
4. No report, no document and no message says that a bot or a page is compliant, lawful or accessible, or that it has passed a certification. A clean report
   says that no finding was made at or above the level.
5. The tool is not legal advice, and says so in the README, the limits and the explanation of each of the two checks.

## Consequences

- A reader learns why the check exists and where to read more, and is not told that they are done.
- Some users will turn the disclosure check off where it does not apply. The report then names the check that was turned off, so a
  reviewer sees the choice.
