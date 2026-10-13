# conversation-flow-check: examples/good/booking-chat.yaml \+ examples/good/widget.html

- Flow file: examples/good/booking-chat.yaml \(yaml, 97 lines, 2,352 bytes\)
- Widget file: examples/good/widget.html \(html, 19 lines, 613 bytes\)
- Name: Salon booking \(chat\)
- Channel: chat \(from the flow file\)
- Steps: 13, 13 reachable from the start \(message 2, input 2, choice 2, confirm 2, action 2, handover 1, end 2\)
- Waiting for the user: 6 steps; 1 handover step; 2 steps that cannot be undone
- Findings: 0
- Result: **PASS - no finding at or above error**

## Checks

| check | level | kind | status | findings |
| --- | --- | --- | --- | --- |
| file-unreadable | error | file | pass | 0 |
| field-invalid | error | step | pass | 0 |
| field-unknown | warning | file | pass | 0 |
| start-unknown | error | flow | pass | 0 |
| step-target-unknown | error | step | pass | 0 |
| edge-missing | error | step | pass | 0 |
| step-unreachable | warning | flow | pass | 0 |
| step-dead-end | error | step | pass | 0 |
| flow-trap | error | flow | pass | 0 |
| input-no-fallback | error | step | pass | 0 |
| input-no-reprompt-limit | warning | step | pass | 0 |
| reprompt-limit-high | warning | step | pass | 0 |
| no-handover | error | flow | pass | 0 |
| handover-unreachable | error | flow | pass | 0 |
| voice-multiple-questions | warning | wording | skipped | - \(the channel is chat; it only applies to voice\) |
| voice-prompt-too-long | warning | wording | skipped | - \(the channel is chat; it only applies to voice\) |
| irreversible-unconfirmed | error | flow | pass | 0 |
| ai-disclosure-missing | warning | wording | pass | 0 |
| widget-message-list-not-found | warning | widget | pass | 0 |
| widget-live-region-missing | error | widget | pass | 0 |

## Findings

None.

This report reads the flow file and nothing else. It does not run the flow and does not talk to a bot. A clean result means that none of the problems of its checks were found in the file; it is not a statement that the bot is good, accessible or lawful.
