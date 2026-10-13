// Command line: conversation-flow-check <flow file> [options]

import { readFileSync } from 'node:fs';
import { InputError, LIMITS, checkFiles, readOptions } from './check.js';
import { CHANNELS, DEFAULTS, LEVELS } from './data.js';
import { editDistance } from './fields.js';
import { explainJson, explainMarkdown, explainText, listChecksJson, listChecksMarkdown, listChecksText, toJson, toJunit, toMarkdown, toSarif, toText } from './report.js';
import { RULES, ruleById } from './rules.js';
import { safeText } from './text.js';

export const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const FORMATS = { text: toText, markdown: toMarkdown, json: toJson, sarif: toSarif, junit: toJunit };
const LISTS = { text: listChecksText, markdown: listChecksMarkdown, json: listChecksJson };
const EXPLAINS = { text: explainText, markdown: explainMarkdown, json: explainJson };

export const USAGE = `Usage: conversation-flow-check <flow file> [options]
       conversation-flow-check --widget <html file> [options]

Checks a chatbot or voice conversation flow before it reaches users. It reads one flow file, YAML (a small documented subset) or
JSON, with steps that link to each other (docs/inputs.md), and reports steps that cannot be reached, dead ends and loops with no
way out, input steps with no fallback or no reprompt limit, a missing way to a person, voice prompts that ask more than one
question or run long, actions that cannot be undone and run without a confirmation, and an opening that does not say the user is
talking to an automated system. With --widget it also checks that the message list of a chat widget page is a live region. It
does not run the flow. It contacts nothing over the network, reads no clock and writes nothing to disk.

Options:
  --format <name>            text, markdown, json, sarif or junit (default: text)
  --json                     the same as --format json
  --channel <name>           ${CHANNELS.join(' or ')}: overrides the channel of the flow file (default: the file's, else ${DEFAULTS.channel})
  --max-words <number>       the most words a voice prompt may have, from 1 to 1000 (default: ${DEFAULTS.maxWords})
  --max-reprompts <number>   the highest reprompt_limit that is accepted, from 0 to 99 (default: ${DEFAULTS.maxReprompts})
  --handover <mode>          every-input: a handover step must be reachable from every input step; any: the flow must have one;
                             off: no check of the way to a person (default: ${DEFAULTS.handover})
  --irreversible-actions <words>
                             comma-separated words that mark an action step as one that cannot be undone, or none
                             (default: ${DEFAULTS.irreversibleActions})
  --disclosure-phrases <phrases>
                             comma-separated phrases, any one of which in the opening says the user is talking to an automated
                             system (default: ${DEFAULTS.disclosurePhrases})
  --disable <ids>            comma-separated ids of checks to leave out
  --widget <file>            the HTML of a chat widget page: check that its message list is a live region
  --min-severity <level>     the lowest level of a finding that is shown: ${LEVELS.join(', ')} (default: info)
  --fail-on <level>          the lowest level of a finding that fails the run: ${LEVELS.join(', ')} (default: error)
  --list-checks              list the checks with their level and kind, and exit
  --explain <id>             explain one check: what it looks at, what to change, what it cannot see, and exit
  --help                     show this text
  --version                  show the version

Checks: ${RULES.map((r) => r.id).join(', ')}.

Exit codes: 0 no finding at or above the fail-on level, 1 a finding at or above it, 2 usage or input error.
`;

const isUrl = (f) => /^[a-z][a-z0-9+.-]*:\/\//i.test(f);

// The check whose id is nearest to the text, for a message about a misspelt id.
function nearestId(text) {
  let best = null;
  let bestDistance = Infinity;
  for (const r of RULES) {
    const d = editDistance(text.toLowerCase().slice(0, 80), r.id);
    if (d < bestDistance) {
      best = r.id;
      bestDistance = d;
    }
  }
  return bestDistance <= 6 ? best : null;
}

const VALUE_OPTIONS = new Map([
  ['--format', 'format'],
  ['--channel', 'channel'],
  ['--max-words', 'maxWords'],
  ['--max-reprompts', 'maxReprompts'],
  ['--handover', 'handover'],
  ['--irreversible-actions', 'irreversibleActions'],
  ['--disclosure-phrases', 'disclosurePhrases'],
  ['--disable', 'disable'],
  ['--widget', 'widget'],
  ['--min-severity', 'minSeverity'],
  ['--fail-on', 'failOn'],
  ['--explain', 'explain']
]);

export function parseArgs(argv) {
  const o = { paths: [], format: null, json: false, channel: null, maxWords: null, maxReprompts: null, handover: null, irreversibleActions: null, disclosurePhrases: null, disable: null, widget: null, minSeverity: null, failOn: null, listChecks: false, explain: null, help: false, version: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined || (v.startsWith('--') && v.length > 2)) throw new Error(`${a} needs a value`);
      if (v === '-') throw new Error('reading from standard input is not supported; give a file');
      i += 1;
      return v;
    };
    if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--version' || a === '-v') o.version = true;
    else if (a === '--json') o.json = true;
    else if (a === '--list-checks') o.listChecks = true;
    else if (VALUE_OPTIONS.has(a)) {
      const key = VALUE_OPTIONS.get(a);
      if (o[key] !== null) throw new Error(`${a} was given twice`);
      o[key] = next();
    } else if (a === '-') throw new Error('reading from standard input is not supported; give a file');
    else if (a.startsWith('-')) throw new Error(`unknown argument ${safeText(a, 60)}`);
    else {
      if (o.paths.length === 1) throw new Error('give one flow file; check another flow in another run');
      o.paths.push(a);
    }
  }
  if (o.json) {
    if (o.format !== null && o.format !== 'json') throw new Error(`--json and --format ${safeText(o.format, 40)} ask for two formats; give one`);
    o.format = 'json';
  }
  if (o.format === null) o.format = 'text';
  if (!Object.hasOwn(FORMATS, o.format)) throw new Error(`unknown format ${safeText(o.format, 40)} (text, markdown, json, sarif or junit)`);
  for (const [flag, v] of [['--min-severity', o.minSeverity], ['--fail-on', o.failOn]]) if (v !== null && !LEVELS.includes(v)) throw new Error(`${flag}: unknown level ${safeText(v, 40)} (${LEVELS.join(', ')})`);
  if (o.explain !== null && ruleById(o.explain) === undefined) {
    const near = nearestId(o.explain);
    throw new Error(`--explain: unknown check ${safeText(o.explain, 60)}${near ? `. Did you mean ${near}?` : ''} (--list-checks lists them)`);
  }
  if ((o.listChecks || o.explain !== null) && (o.format === 'sarif' || o.format === 'junit')) throw new Error(`${o.listChecks ? '--list-checks' : '--explain'} has no ${o.format.toUpperCase()} form; use text, markdown or json`);
  if (!o.help && !o.version && !o.listChecks && o.explain === null) {
    if (o.paths.length === 0 && o.widget === null) throw new Error('give the flow file, such as conversation-flow-check flow.yaml');
    for (const p of [...o.paths, ...(o.widget === null ? [] : [o.widget])]) if (isUrl(p)) throw new Error('give a local path; the tool never fetches a URL');
    optionsOf(o);
  }
  return o;
}

// The options of a run from the parsed arguments; throws an Error that names the option that cannot be used.
function optionsOf(o) {
  return readOptions({ channel: o.channel, maxWords: o.maxWords, maxReprompts: o.maxReprompts, handover: o.handover, irreversibleActions: o.irreversibleActions, disclosurePhrases: o.disclosurePhrases, disable: o.disable });
}

const clean = (text) => safeText(text, 1500);

// Exit code: 0 no finding at or above the fail-on level, 1 a finding at or above it, 2 usage or input error.
export async function main(argv, io = { out: (t) => process.stdout.write(t), err: (t) => process.stderr.write(t) }, limits = undefined, base = process.cwd()) {
  let o;
  try {
    o = parseArgs(argv);
  } catch (error) {
    io.err(`conversation-flow-check: ${clean(error.message)}\n\n${USAGE}`);
    return 2;
  }
  if (o.help) {
    io.out(USAGE);
    return 0;
  }
  if (o.version) {
    io.out(`${VERSION}\n`);
    return 0;
  }
  if (o.listChecks) {
    io.out(LISTS[o.format]());
    return 0;
  }
  if (o.explain !== null) {
    io.out(EXPLAINS[o.format](ruleById(o.explain)));
    return 0;
  }
  const merged = { ...LIMITS, ...(limits ?? {}) };
  try {
    const report = await checkFiles({
      flowPath: o.paths[0] ?? null,
      widgetPath: o.widget,
      minSeverity: o.minSeverity ?? 'info',
      failOn: o.failOn ?? 'error',
      options: optionsOf(o),
      version: VERSION,
      limits: merged,
      base
    });
    io.out(FORMATS[o.format](report));
    return report.result.pass ? 0 : 1;
  } catch (error) {
    if (error instanceof InputError) io.err(`conversation-flow-check: no result, the input has ${error.problems.length === 1 ? 'a problem' : 'problems'}:\n${error.problems.map((p) => `  ${clean(p)}`).join('\n')}\n`);
    else io.err(`conversation-flow-check: ${clean(error.message)}\n`);
    return 2;
  }
}
