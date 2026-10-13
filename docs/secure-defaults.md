# Secure defaults

The default run is the safe run. Nothing in the first section needs a flag, and none of it can be switched off. The rest of the
document is about what the tool cannot do for you: which files you give it, where the output goes, and who may change the files
it reads. A clean result is a flow with none of the problems the checks look for, not a finding that a bot is good: the tool reads
the text of a flow file, it does not run the flow, and it is neither legal advice nor an accessibility audit.

## How the tool behaves by default

- **Reads, never writes.** The tool reads the flow file and the widget file it is given. It follows no symbolic link, fetches no
  URL, refuses an argument that looks like an address, contacts nothing over the network, evaluates nothing, runs no program and
  writes nothing to disk.
- **Never runs the flow.** It has no code that sends a message, calls a bot, an intent engine or a platform, or opens a page in a
  browser. It needs no API key, no address of a server and no account, and has no option to take one.
- **Its own readers, nothing evaluated.** The YAML subset and the JSON reader are written for this tool. They refuse anchors,
  aliases, tags, mappings in braces, several documents and a key written twice, and they turn no text into an object or a command.
- **Every check on from the first run.** A file the reader cannot follow, a value that is not what the format says, an edge to a
  step that does not exist, a dead end, a loop with no way out, an input step with no fallback, a missing way to a person, an
  irreversible action with no confirmation and a message list that is not a live region are errors; an unknown key, an unreachable
  step, a missing or high reprompt limit, a voice prompt that is long or asks two things and an opening that does not say what the
  user talks to are warnings. There is no configuration file of the tool that could set a check off; only the command line can, and
  the report names every check that was turned off.
- **Fail closed.** When the flow file cannot be read, no check of the flow runs, the checks are reported as not evaluated, and the
  run fails. A file past a limit of size, lines, depth or steps is refused; it is never read in part.
- **No clock.** The tool reads no date and no time. The same files and options give the same report on every day, and the JUnit
  report records every time as 0.
- **Unknown arguments are errors.** An option the tool does not know, a value that looks like an option and an option given twice
  stop the run, so a typo such as `--fail-no` cannot leave a default in place. A value that is not in its range is refused.
- **No pattern from the input.** No regular expression is built from a file or from an argument.
- **Bounded work.** The readers have limits of size, lines, depth, steps, options, text and tags, the graph walks visit each step and
  each edge a bounded number of times, and no function calls itself (docs/limits.md), so a large or hostile file cannot exhaust the
  stack, the memory or the time.
- **No prototype tricks.** Names from the files are kept in maps and sets, never set as properties of an object, so `__proto__` is
  only a name.
- **Clean output.** Text from the input, file names and step ids included, has control characters, line separators and direction
  controls replaced and its length capped before it reaches a report or an error message; the markdown report also escapes what
  markdown gives a meaning to, and the JUnit report escapes what XML gives a meaning to.
- **No dependencies.** Node 22 or newer and nothing else.

## Settings that make the check stricter

- **`--fail-on warning`.** An unknown key, an unreachable step, a missing reprompt limit, a long voice prompt and a missing
  disclosure fail the run too. Use it on the flow that is about to go live, and record each warning the team keeps on purpose.
- **`--max-reprompts` and `--max-words`.** Lower them to what your service needs.
- **`--handover every-input`** is the default. Leave it on unless the bot has no person to hand over to.
- **`--irreversible-actions`.** Add the words of your own actions, and mark the rest with `irreversible: true` in the flow.
- **`--disclosure-phrases`.** Set the words your service uses to say that the user talks to an automated system, in the language
  of the flow.
- **The whole flow.** Check the whole flow at once; a flow cut in the middle shows steps as unreachable and ends as dead ends.

## Running it in a pipeline

```yaml
permissions:
  contents: read
steps:
  - uses: actions/checkout@<full commit hash> # vX.Y.Z
  - uses: actions/setup-node@<full commit hash> # vX.Y.Z
    with:
      node-version: 22
  - name: Check the conversation flow
    run: npx --yes github:INNERLUXES/conversation-flow-check flows/support.yaml --widget web/chat.html --format junit > flow-junit.xml
```

- Give the job read access to the contents and nothing more. The tool needs no secret, no API key and no access to a server;
  never give it one.
- Pin every action to a full commit, as above, and pin the tool to a release commit or a tag you have read, because `npx`
  runs what it downloads.
- Check the exact files that the next step deploys. Files edited after the check are not what was checked.
- Do not hide the exit code with a trailing `|| true`. To keep the report without failing, keep `--fail-on` at `error` and keep
  the JUnit, SARIF or JSON report as an artifact of the job.
- Keep the reports with the same care as the flow, because a finding quotes step ids and the start of texts of the file.
- Treat a report built from files you do not trust as untrusted data.
- Do not put a secret in a flow file. The tool does not look for secrets, and a finding can quote the text it is about.

## SSDF

The repository is checked against NIST SP 800-218 (SSDF) in its own pipeline and before every release, with `ssdf-repo-check`
pinned to its release commit. The evidence it looks for is in these files:

| Practice | Evidence in this repository |
| --- | --- |
| PO.1 Define security requirements | CONTRIBUTING.md, docs/secure-defaults.md |
| PO.2 Roles and responsibilities | .github/CODEOWNERS |
| PO.3 Toolchain | .github/workflows/ci.yml, codeql.yml, release.yml |
| PO.4 Criteria for security checks | CodeQL with the security-extended queries, the SSDF gate in ci.yml and release.yml |
| PO.5 Secure environments | a `permissions:` block in every workflow, actions pinned to commits |
| PS.1 Protect the code | .gitignore for keys and `.env`, `npm run check` for committed secrets |
| PS.2 Integrity of releases | SHA-256 checksums and a build provenance attestation in release.yml |
| PS.3 Archive and provenance | a CycloneDX SBOM and the CHANGELOG with every release |
| PW.1 Design for security | docs/threat-model.md |
| PW.2 Review the design | docs/decisions |
| PW.4 Reuse secure components | no runtime dependencies, a lock file, Dependabot |
| PW.5 Secure coding | CONTRIBUTING.md, `npm run check` |
| PW.6 Build settings | `npm ci` from the lock file |
| PW.7 Code review | the pull request template and CODEOWNERS |
| PW.8 Testing | `npm test` on Linux, Windows and macOS with Node 22 and 24, `npm run test:coverage`, hostile input tests |
| PW.9 Secure defaults | this document |
| RV.1 Find vulnerabilities | SECURITY.md, Dependabot |
| RV.2 Respond to vulnerabilities | SECURITY.md |
