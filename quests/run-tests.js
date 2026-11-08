// Child process entry for combat moves: import the player's file, call its exported solve()
// for each test read from stdin, and print one token-prefixed result line.
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
const show = (value) => (value === undefined ? 'undefined' : JSON.stringify(value));
const call = (args) => `solve(${args.map(show).join(', ')})`;

function emit(result) {
  const line = `\n${token} ${JSON.stringify({ expected: '', got: '', message: '', ...result })}\n`;
  process.stdout.write(line, () => process.exit(0));
}

try {
  const tests = JSON.parse(stdin.slice(cut + 1));
  let mod;
  try {
    mod = await import(pathToFileURL(resolve(playerPath)).href);
  } catch (error) {
    emit({ status: 'error', message: firstLine(error) });
  }
  if (mod) {
    if (typeof mod.solve !== 'function') {
      emit({ status: 'error', message: 'Your file must export a function named solve.' });
    } else {
      let outcome = { status: 'pass', expected: 'every test passes', got: 'every test passes' };
      for (const { args, expected } of tests) {
        let got;
        try {
          got = await mod.solve(...structuredClone(args));
        } catch (error) {
          outcome = { status: 'error', message: `solve threw: ${firstLine(error)}` };
          break;
        }
        if (!isDeepStrictEqual(got, expected)) {
          outcome = {
            status: 'fail',
            expected: `${call(args)} gives ${show(expected)}`,
            got: `${call(args)} gave ${show(got)}`,
          };
          break;
        }
      }
      emit(outcome);
    }
  }
} catch (error) {
  emit({ status: 'error', message: firstLine(error) });
}
