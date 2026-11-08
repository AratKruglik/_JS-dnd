// Child process entry. Loads one quest and the player's file, runs the quest's check, and
// prints exactly one result line prefixed with a token the parent chose. Player output can
// never forge that line because it does not know the token.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [questId, playerPath, questsModule] = process.argv.slice(2);
// The token arrives on stdin and is read before the player's file is imported.
const token = readFileSync(0, 'utf8').split('\n')[0];

const firstLine = (error) =>
  String(error?.message ?? error)
    .split('\n')[0]
    .trim();

function emit(result) {
  const line = `\n${token} ${JSON.stringify({ expected: '', got: '', message: '', ...result })}\n`;
  // Exit only after the line is flushed, so a player timer left running cannot hold the process open.
  process.stdout.write(line, () => process.exit(0));
}

// If the event loop runs dry before a result was printed, something player code returned (or a
// top-level await in their file) will never settle. Say so, instead of exiting without a word.
process.once('beforeExit', () =>
  emit({
    status: 'error',
    message: 'Your code never finished: a promise it returned never settled, so the check had no answer to read.',
  }),
);

try {
  const registry = await import(questsModule ? pathToFileURL(resolve(questsModule)).href : './index.js');
  const quest = registry.getQuest(questId);
  if (!quest) {
    emit({ status: 'error', message: `Unknown quest "${questId}".` });
  } else {
    let mod;
    try {
      mod = await import(pathToFileURL(resolve(playerPath)).href);
    } catch (error) {
      emit({ status: 'error', message: firstLine(error) });
    }
    if (mod) {
      const result = await quest.check(mod);
      emit({
        status: result.pass ? 'pass' : 'fail',
        expected: String(result.expected),
        got: String(result.got),
        message: result.message ?? '',
      });
    }
  }
} catch (error) {
  emit({ status: 'error', message: firstLine(error) });
}
