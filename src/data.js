// What every report says about itself. The tool reads a conversation flow of a chatbot or a voice assistant, written as YAML or
// JSON, and optionally the HTML of a chat widget. It reads the text of the files and checks the shape of the flow. It never runs
// the flow, never talks to a bot and never judges whether the wording is good. The checks are best practices of this tool: no
// standard sets any of them, and the reports and the documents say so.

export const LEVELS = ['info', 'warning', 'error'];

// The kinds of check: about a file (whether it can be read as a flow), about one step, about the shape of the whole flow, about
// the wording of a prompt, or about the chat widget.
export const KINDS = ['file', 'step', 'flow', 'wording', 'widget'];

export const NOT_A = 'a read of the shape of a conversation flow and of the text of its prompts, from a file, without running the flow; it does not know what users say, whether the wording is good or whether a law applies to you, and it is neither a certification nor legal advice';

export const NOTICE = 'This report reads the flow file and nothing else. It does not run the flow and does not talk to a bot. A clean result means that none of the problems of its checks were found in the file; it is not a statement that the bot is good, accessible or lawful.';

// Why a check is a best practice and not a rule.
export const BEST = 'a best practice of this tool; no standard sets it';

export const CHANNELS = ['chat', 'voice'];
export const HANDOVER_MODES = ['every-input', 'any', 'off'];

// The step types of the flow format (docs/inputs.md).
export const STEP_TYPES = ['message', 'input', 'choice', 'confirm', 'action', 'handover', 'end'];
// The types that wait for the user.
export const INPUT_TYPES = ['input', 'choice', 'confirm'];
// The types that end the conversation.
export const TERMINAL_TYPES = ['handover', 'end'];

// The keys of the flow and of a step that the tool reads.
export const FLOW_KEYS = ['name', 'description', 'channel', 'start', 'steps'];
export const STEP_KEYS = ['type', 'text', 'next', 'yes', 'no', 'fallback', 'on_error', 'options', 'reprompt_limit', 'action', 'irreversible', 'end', 'note'];
export const OPTION_KEYS = ['label', 'next'];

// The defaults of the options, as the text of the option.
export const DEFAULTS = {
  channel: 'chat',
  maxWords: '30',
  maxReprompts: '3',
  handover: 'every-input',
  irreversibleActions: 'pay,payment,charge,purchase,checkout,book,booking,reserve,cancel,delete,remove,erase,refund,transfer,order,submit,terminate',
  disclosurePhrases: 'automated,bot,chatbot,ai,artificial intelligence,virtual assistant,digital assistant,not a human,not a person,not a real person'
};

// The limits of the work. A file past a limit is refused; the tool never reads a part of a file and goes on.
export const LIMITS = {
  maxBytes: 4 * 1024 * 1024,
  maxLines: 200000,
  maxDepth: 40,
  maxSteps: 20000,
  maxOptions: 1500,
  maxTextLength: 20000,
  maxTags: 400000,
  maxAttributes: 64
};
