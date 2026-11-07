import { openDevDb } from './db.js';
import { setTask, addNote, getState, setMeta } from './notes.js';
import { renderGreeting } from './greeting.js';

const USAGE = `Usage:
  node dev/cli.js task <issue> <todo|in_progress|blocked|done> "<title>" ["<detail>"]
  node dev/cli.js note <status|completed|prediction> <issue|-> "<text>"
  node dev/cli.js status
  node dev/cli.js board-config <owner> <number>`;

const STATUSES = ['todo', 'in_progress', 'blocked', 'done'];
const KINDS = ['status', 'completed', 'prediction'];

function fail(message) {
  console.error(message);
  process.exit(1);
}

function parseIssue(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) fail(`Issue must be a positive integer, got "${value}".`);
  return n;
}

const [command, ...args] = process.argv.slice(2);
const db = openDevDb();

switch (command) {
  case 'task': {
    const [issue, status, title, detail] = args;
    if (!STATUSES.includes(status)) fail(`Unknown status "${status}". Use one of: ${STATUSES.join(', ')}.`);
    if (!title) fail('A task title is required.');
    setTask(db, { issueNumber: parseIssue(issue), title, status, detail });
    console.log(`Task #${issue} set to ${status}.`);
    break;
  }
  case 'note': {
    const [kind, issue, text] = args;
    if (!KINDS.includes(kind)) fail(`Unknown note kind "${kind}". Use one of: ${KINDS.join(', ')}.`);
    if (!text) fail('Note text is required.');
    const issueNumber = issue === '-' ? null : parseIssue(issue);
    try {
      addNote(db, { issueNumber, kind, body: text });
    } catch {
      fail(`No task #${issue} recorded yet. Create it first with the task command.`);
    }
    console.log(`Saved ${kind} note.`);
    break;
  }
  case 'status':
    console.log(renderGreeting(getState(db), null));
    break;
  case 'board-config': {
    const [owner, number] = args;
    if (!owner || !Number.isInteger(Number(number))) fail('Usage: board-config <owner> <number>');
    setMeta(db, 'board_owner', owner);
    setMeta(db, 'board_number', String(number));
    console.log(`Board set to ${owner} project ${number}.`);
    break;
  }
  default:
    fail(USAGE);
}
