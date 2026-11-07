const DASHES = new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`, 'g');
const stripDashes = (text) => text.replace(DASHES, '-');

export function renderGreeting(state, board) {
  const lines = ['Confirmed state'];

  if (state.tasks.length === 0) {
    lines.push('- No tasks recorded yet.');
  } else {
    for (const task of state.tasks) {
      const detail = task.detail ? ` (${task.detail})` : '';
      lines.push(`- #${task.issue_number} [${task.status}] ${task.title}${detail}`);
    }
  }
  lines.push(`- Last completed: ${state.lastCompleted ? state.lastCompleted.body : 'nothing yet'}`);

  lines.push('', 'Predictions (not confirmed)');
  if (state.predictions.length === 0) {
    lines.push('- none');
  } else {
    for (const prediction of state.predictions) lines.push(`- ${prediction.body}`);
  }

  if (board !== null) {
    lines.push('', 'Board');
    if (!board.ok) {
      lines.push(`- Board unavailable: ${board.reason}`);
    } else if (board.items.length === 0) {
      lines.push('- Board is empty.');
    } else {
      for (const item of board.items) lines.push(`- #${item.number} [${item.status}] ${item.title}`);
    }
  }

  return stripDashes(lines.join('\n'));
}
