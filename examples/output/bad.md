# conversation-flow-check: examples/bad/support-voice.yaml

- Flow file: examples/bad/support-voice.yaml \(yaml, 69 lines, 1,616 bytes\)
- Name: Broadband help line \(voice, with mistakes\)
- Channel: voice \(from the flow file\)
- Steps: 11, 9 reachable from the start \(message 6, input 2, choice 1, action 1, end 1\)
- Waiting for the user: 3 steps; 0 handover steps; 1 step that cannot be undone
- Findings: 19 \(10 error, 9 warning\)
- Result: **FAIL - 10 findings at or above error \(10 error, 9 warning\)**

## Checks

| check | level | kind | status | findings |
| --- | --- | --- | --- | --- |
| file-unreadable | error | file | pass | 0 |
| field-invalid | error | step | fail | 1 |
| field-unknown | warning | file | fail | 2 |
| start-unknown | error | flow | pass | 0 |
| step-target-unknown | error | step | fail | 1 |
| edge-missing | error | step | fail | 1 |
| step-unreachable | warning | flow | fail | 2 |
| step-dead-end | error | step | fail | 1 |
| flow-trap | error | flow | fail | 2 |
| input-no-fallback | error | step | fail | 2 |
| input-no-reprompt-limit | warning | step | fail | 1 |
| reprompt-limit-high | warning | step | fail | 1 |
| no-handover | error | flow | fail | 1 |
| handover-unreachable | error | flow | pass | 0 |
| voice-multiple-questions | warning | wording | fail | 1 |
| voice-prompt-too-long | warning | wording | fail | 1 |
| irreversible-unconfirmed | error | flow | fail | 1 |
| ai-disclosure-missing | warning | wording | fail | 1 |
| widget-message-list-not-found | warning | widget | skipped | - \(no --widget file was given\) |
| widget-live-region-missing | error | widget | skipped | - \(no --widget file was given\) |

## Findings

| Level | Check | Where | Message |
| --- | --- | --- | --- |
| error | input-no-fallback | examples/bad/support-voice.yaml:12 | The choice step "ask\_topic" has no fallback, so nothing says what happens when the answer does not match. Fix: Add a fallback: the id of the step that handles an answer the step did not understand \(a reprompt step, or a handover\). |
| error | step-target-unknown | examples/bad/support-voice.yaml:21 | The option "person" of the step "ask\_topic" leads to "no\_such\_step", which is not under steps. Fix: Correct the id, or add the step. A user who follows the edge reaches a step that does not exist. |
| error | edge-missing | examples/bad/support-voice.yaml:22 | An option \("cancel"\) of the step "ask\_topic" has no next step, so choosing it leads nowhere. Fix: Give every option a next, and give a confirm step both a yes and a no. |
| error | input-no-fallback | examples/bad/support-voice.yaml:25 | The input step "ask\_postcode" has no fallback, so nothing says what happens when the answer does not match. Fix: Add a fallback: the id of the step that handles an answer the step did not understand \(a reprompt step, or a handover\). |
| error | step-dead-end | examples/bad/support-voice.yaml:31 | The step "fault\_logged" \(type message\) has no step after it and is not marked as an end, so the conversation stops there with nothing for the user to do. Fix: Add the step that follows it, or mark it as an end on purpose with type: end, type: handover or end: true. |
| error | field-invalid | examples/bad/support-voice.yaml:67 | The type of the step "odd\_step" is "speech", which is not one of message, input, choice, confirm, action, handover, end. Fix: Write the value as docs/inputs.md says. The value is ignored until you do, so a check that needs it may report a second finding. |
| error | no-handover | examples/bad/support-voice.yaml:4 | The flow has 3 steps that wait for the user and no step of type handover, so there is no way to a person. Fix: Add a step of type handover that passes the user to a human agent, and link it from the steps that wait for the user. Turn the check off with --handover off if the bot has no human to pass to. |
| error | irreversible-unconfirmed | examples/bad/support-voice.yaml:42 | The step "take\_payment" cannot be undone \(action "take\_card\_payment"\) and runs without a confirm step before it: "ask\_amount" \(next\) leads to it without a confirmation. Fix: Put a step of type confirm in front of the action, say what is about to happen in its text, and send its yes to the action. Every edge into the action must be the yes of a confirm step. |
| error | flow-trap | examples/bad/support-voice.yaml:51 | The step "retry\_loop\_a" is in a loop with no way out: from here no end, no handover and no dead end can be reached. Fix: Give one step of the loop an edge that leaves it, such as a fallback to a handover after the reprompt limit. |
| error | flow-trap | examples/bad/support-voice.yaml:56 | The step "retry\_loop\_b" is in a loop with no way out: from here no end, no handover and no dead end can be reached. Fix: Give one step of the loop an edge that leaves it, such as a fallback to a handover after the reprompt limit. |
| warning | field-unknown | examples/bad/support-voice.yaml:5 | The file has the key "mode" at the top level, which the tool does not read; nothing under it is checked. Fix: Correct the name to a key of docs/inputs.md, or take the key out of the file. |
| warning | field-unknown | examples/bad/support-voice.yaml:29 | The step "ask\_postcode" has the key "fallbak", which the tool does not read; nothing under it is checked. Did you mean "fallback"? Fix: Correct the name to a key of docs/inputs.md, or take the key out of the file. |
| warning | reprompt-limit-high | examples/bad/support-voice.yaml:23 | The choice step "ask\_topic" asks again up to 6 times; the limit is 3 \(--max-reprompts\). Fix: Lower the limit, or raise --max-reprompts if the step is meant to ask that often. |
| warning | input-no-reprompt-limit | examples/bad/support-voice.yaml:25 | The input step "ask\_postcode" has no reprompt\_limit, so nothing says how many times the user is asked again. Fix: Set reprompt\_limit to the number of times the step asks again \(often 2 or 3\) before it follows its fallback. |
| warning | step-unreachable | examples/bad/support-voice.yaml:61 | The step "old\_menu" cannot be reached from the start step "greeting". Fix: Link the step from a step that is reachable, or take it out of the file. A step nobody can reach is dead text that still has to be kept up to date. |
| warning | step-unreachable | examples/bad/support-voice.yaml:66 | The step "odd\_step" cannot be reached from the start step "greeting". Fix: Link the step from a step that is reachable, or take it out of the file. A step nobody can reach is dead text that still has to be kept up to date. |
| warning | ai-disclosure-missing | examples/bad/support-voice.yaml:9 | The opening of the flow \("greeting" and "ask\_topic"\) does not tell the user that they are talking to an automated system or an AI. Article 50 of the EU AI Act asks that people are told when they interact with an AI system, unless that is obvious from the circumstances. Fix: Say it in the first message, in plain words, such as "I am an automated assistant". Article 50 of the EU AI Act asks that people are told when they interact with an AI system, unless that is obvious from the circumstances. Turn the check off with --disable ai-disclosure-missing if it does not apply. |
| warning | voice-prompt-too-long | examples/bad/support-voice.yaml:9 | The prompt of the step "greeting" has 35 words; the limit is 30 \(--max-words\). Fix: Shorten the prompt, or split it into two steps. Put the question at the end, and the choices last. |
| warning | voice-multiple-questions | examples/bad/support-voice.yaml:14 | The prompt of the step "ask\_topic" has 3 question marks. A caller can answer one question at a time. Fix: Ask one question in each prompt and put the next question in the next step. A caller cannot scroll back to the first question. |

This report reads the flow file and nothing else. It does not run the flow and does not talk to a bot. A clean result means that none of the problems of its checks were found in the file; it is not a statement that the bot is good, accessible or lawful.
