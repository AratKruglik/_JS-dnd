// Child process entry for combat moves: import the player's file, call its exported solve()
// for each test read from stdin, and print one token-prefixed result line. Messages travel as
// { key, params } parts, and the parent renders them in the language of the save.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const [playerPath] = process.argv.slice(2);
// The first stdin line is the result token, the rest is the tests JSON.
const stdin = readFileSync(0, 'utf8');
const cut = stdin.indexOf('\n');
const token = stdin.slice(0, cut);

const firstLine = (error) =>
  String(error?.message ?? error)
    .split('\n')[0]
    .trim();
const part = (key, params = {}) => ({ key, params });
const raw = (error) => part('check.raw.message', { message: firstLine(error) });
const show = (value) => (value === undefined ? 'undefined' : JSON.stringify(value));
const call = (args) => `solve(${args.map(show).join(', ')})`;

function emit(result) {
  const line = `\n${token} ${JSON.stringify({ expected: '', got: '', message: '', ...result })}\n`;
  process.stdout.write(line, () => process.exit(0));
}

// If the event loop runs dry before a result was printed, something player code returned (or a
// top-level await in their file) will never settle. Say so, instead of exiting without a word.
process.once('beforeExit', () => emit({ status: 'error', message: part('check.neverSettled.message') }));

try {
  const tests = JSON.parse(stdin.slice(cut + 1));
  let mod;
  try {
    mod = await import(pathToFileURL(resolve(playerPath)).href);
  } catch (error) {
    emit({ status: 'error', message: raw(error) });
  }
  if (mod) {
    if (typeof mod.solve !== 'function') {
      emit({ status: 'error', message: part('check.missingSolve.message') });
    } else {
      let outcome = {
        status: 'pass',
        expected: part('check.pass.everyTest'),
        got: part('check.pass.everyTest'),
      };
      for (const { args, expected } of tests) {
        let got;
        try {
          got = await mod.solve(...structuredClone(args));
        } catch (error) {
          outcome = { status: 'error', message: part('check.solveThrew.message', { message: firstLine(error) }) };
          break;
        }
        if (!isDeepStrictEqual(got, expected)) {
          const params = { call: call(args), wanted: show(expected), gave: show(got) };
          outcome = {
            status: 'fail',
            expected: part('check.wrongResult.expected', params),
            got: part('check.wrongResult.got', params),
          };
          break;
        }
      }
      emit(outcome);
    }
  }
} catch (error) {
  emit({ status: 'error', message: raw(error) });
}
