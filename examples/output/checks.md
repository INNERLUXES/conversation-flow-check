# conversation-flow-check checks

| Check | Level | Kind | What it looks at |
| --- | --- | --- | --- |
| file-unreadable | error | file | a file is not a flow the reader can follow \(a syntax error in the YAML subset or the JSON, a top level that is not a mapping, no start, no steps, or a file past a limit\) or the widget file cannot be read as HTML text; no other check ran on that file |
| field-invalid | error | step | a value is not what the format says: a step type that is not one of message, input, choice, confirm, action, handover or end; a channel that is not chat or voice; a reprompt\_limit that is not a whole number from 0 to 99; a true or false value that is text; a prompt that is not text |
| field-unknown | warning | file | a key the tool does not read, at the top level, in a step or in an option, often a misspelt name such as fallbak; nothing under it is checked |
| start-unknown | error | flow | the start of the flow names a step that is not under steps \(or names none\); the checks of what can be reached did not run |
| step-target-unknown | error | step | a next, yes, no, fallback, on\_error or option names a step that is not under steps |
| edge-missing | error | step | an option without a next step, or a confirm step that has only one of yes and no |
| step-unreachable | warning | flow | a step that cannot be reached from the start step by following next, yes, no, fallback, on\_error and the options |
| step-dead-end | error | step | a step with no way out \(no next, yes, no, fallback, on\_error or option\) that is not marked as an end, by the type end or handover or by end: true |
| flow-trap | error | flow | a reachable step from which no end, no handover and no dead end can be reached: a loop with no way out |
| input-no-fallback | error | step | an input, choice or confirm step with no fallback: nothing says what happens when the answer does not match |
| input-no-reprompt-limit | warning | step | an input, choice or confirm step with no reprompt\_limit: nothing says how many times the user is asked again before the flow gives up and moves on |
| reprompt-limit-high | warning | step | a reprompt\_limit above --max-reprompts \(default 3\) |
| no-handover | error | flow | the flow has steps that wait for the user and no step of type handover, so there is no way to a person \(--handover every-input or any\) |
| handover-unreachable | error | flow | a reachable input, choice or confirm step from which no step of type handover can be reached \(--handover every-input, the default\) |
| voice-multiple-questions | warning | wording | in the voice channel, a prompt with more than one question mark |
| voice-prompt-too-long | warning | wording | in the voice channel, a prompt with more than --max-words words \(default 30\) |
| irreversible-unconfirmed | error | flow | a step marked irreversible: true, or an action step whose action \(or id\) holds a word such as pay, book, cancel, delete or refund, that can be reached without passing a confirm step whose yes leads to it |
| ai-disclosure-missing | warning | wording | the opening of the flow \(the start step, and the message steps that follow it up to the first step that waits for the user\) does not say that the user is talking to an automated system or to an AI, by none of the phrases set with --disclosure-phrases |
| widget-message-list-not-found | warning | widget | in the widget HTML \(--widget\), no element looks like the list of messages \(an id or class with messages, transcript, conversation, log or thread\) |
| widget-live-region-missing | error | widget | in the widget HTML \(--widget\), the element that looks like the list of messages carries neither role="log" \(or status, or alert\) nor aria-live="polite" or "assertive"; WCAG 2.2 success criterion 4.1.3 \(Status Messages\) asks that a status message can be announced without taking the focus |
