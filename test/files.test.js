import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, symlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { FILE_LIMITS, InputError, decode, displayPath, locateInput, main, readInputText } from '../src/index.js';
import { ARGS, GOOD, cli, flowText, run, withFiles } from './helpers.js';

test('files: a folder, and a file that is not there, are refused with the path as given', async () => {
  await withFiles({ 'dir/x.txt': 'x' }, async (dir) => {
    await assert.rejects(locateInput('dir', dir), (e) => e instanceof InputError && /dir: is a folder/.test(e.message));
    await assert.rejects(locateInput('nope.json', dir), (e) => e instanceof InputError && /nope\.json: does not exist/.test(e.message));
    await assert.rejects(locateInput('dir/x.txt/more', dir), (e) => e instanceof InputError && /does not exist/.test(e.message));
  });
});

test('files: a symbolic link is refused', { skip: process.platform === 'win32' ? 'creating a link needs a privilege on Windows' : false }, async () => {
  await withFiles(GOOD, async (dir) => {
    await symlink(resolve(dir, 'flow.json'), resolve(dir, 'link.json'));
    await assert.rejects(locateInput('link.json', dir), (e) => e instanceof InputError && /symbolic link/.test(e.message));
    const r = await cli(['link.json'], dir);
    assert.equal(r.code, 2);
    assert.match(r.err, /symbolic link/);
  });
});

test('files: a device is refused', { skip: process.platform === 'win32' ? 'there is no /dev/null on Windows' : false }, async () => {
  const r = await cli(['/dev/null'], '/');
  assert.equal(r.code, 2);
  assert.match(r.err, /not a regular file/);
});

test('files: a file past the size limit is refused whole, not read in part', async () => {
  await withFiles({ 'big.json': 'x'.repeat(50) }, async (dir) => {
    await assert.rejects(readInputText(resolve(dir, 'big.json'), dir, { maxBytes: 10 }), (e) => e instanceof InputError && /larger than 10 bytes/.test(e.message));
    const r = await (async () => {
      let err = '';
      const code = await main(['big.json'], { out: () => {}, err: (t) => { err += t; } }, { maxBytes: 10 }, dir);
      return { code, err };
    })();
    assert.equal(r.code, 2);
    assert.match(r.err, /larger than 10 bytes/);
  });
});

test('files: the tool refuses a file over 4 MiB, and reads one of exactly that size', async () => {
  const limit = 4 * 1024 * 1024;
  assert.ok(FILE_LIMITS.maxBytes >= limit);
  const over = await run({ 'flow.json': Buffer.alloc(limit + 1, 0x20) }, ARGS);
  assert.equal(over.code, 2);
  assert.match(over.err, /larger than 4194304 bytes/);
  const exact = await run({ 'flow.json': Buffer.alloc(limit, 0x20) }, ARGS);
  assert.equal(exact.code, 1);
  assert.match(exact.out, /file-unreadable/);
});

test('files: a null byte means it is not a text file', async () => {
  const r = await run({ 'flow.json': Buffer.from('{"a":\0 1}') }, ARGS);
  assert.equal(r.code, 2);
  assert.match(r.err, /holds a null byte/);
});

test('files: invalid UTF-8 is refused', async () => {
  const r = await run({ 'flow.json': Buffer.from([0x7b, 0xc3, 0x28, 0x7d]) }, ARGS);
  assert.equal(r.code, 2);
  assert.match(r.err, /not valid UTF-8/);
});

test('files: a byte order mark is dropped; UTF-8 and UTF-16 read the same flow', async () => {
  const text = flowText();
  const plain = JSON.parse((await run({ 'flow.json': text }, [...ARGS, '--json'])).out);
  const bom = JSON.parse((await run({ 'flow.json': Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text)]) }, [...ARGS, '--json'])).out);
  const le = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]);
  const be = Buffer.from(le);
  be.subarray(2).swap16();
  be[0] = 0xfe;
  be[1] = 0xff;
  const utf16le = JSON.parse((await run({ 'flow.json': le }, [...ARGS, '--json'])).out);
  const utf16be = JSON.parse((await run({ 'flow.json': be }, [...ARGS, '--json'])).out);
  for (const r of [bom, utf16le, utf16be]) {
    assert.deepEqual(r.findings, plain.findings);
    assert.equal(r.summary.steps, 4);
  }
});

test('files: UTF-16 with an odd number of bytes is refused', () => {
  assert.throws(() => decode(Buffer.from([0xff, 0xfe, 0x41])), /odd number of bytes/);
});

test('files: LF, CRLF and CR line ends give the same findings', async () => {
  const yaml = 'start: a\nsteps:\n  a:\n    type: input\n    text: Name?\n    next: b\n  b:\n    type: end\n';
  const lf = JSON.parse((await run({ 'f.yaml': yaml }, ['f.yaml', '--json'])).out);
  const crlf = JSON.parse((await run({ 'f.yaml': yaml.replaceAll('\n', '\r\n') }, ['f.yaml', '--json'])).out);
  const cr = JSON.parse((await run({ 'f.yaml': yaml.replaceAll('\n', '\r') }, ['f.yaml', '--json'])).out);
  assert.deepEqual(crlf.findings, lf.findings);
  assert.deepEqual(cr.findings, lf.findings);
  assert.ok(lf.findings.length > 0);
});

test('files: the path in a report is relative to the folder, with forward slashes', async () => {
  const r = await run({ 'flows/sub/flow.json': flowText((f) => { delete f.steps.ask.fallback; }) }, ['flows/sub/flow.json']);
  assert.match(r.out, /flows\/sub\/flow\.json:\d+/);
  assert.equal(displayPath(resolve('/tmp/x/a/b.json'), resolve('/tmp/x')), 'a/b.json');
});

test('files: a path outside the folder is shown whole', () => {
  const shown = displayPath(resolve('/tmp/other/a.json'), resolve('/tmp/x'));
  assert.ok(shown.endsWith('other/a.json'));
});

test('files: nothing is written: the tool leaves the folder as it found it', async () => {
  await withFiles({ ...GOOD, 'sub/.keep': '' }, async (dir) => {
    const { readdir } = await import('node:fs/promises');
    const before = (await readdir(dir, { recursive: true })).sort();
    await cli([...ARGS, '--format', 'junit'], dir);
    await mkdir(resolve(dir, 'again'), { recursive: true });
    await writeFile(resolve(dir, 'again/a.txt'), 'a');
    const after = (await readdir(dir, { recursive: true })).sort().filter((f) => !f.startsWith('again'));
    assert.deepEqual(after, before);
  });
});
