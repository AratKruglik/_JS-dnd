## Ending

- The campaign ends with the final boss, N7 at the stronghold. The scripts refuse a fight with N7 until every quest is solved, and only at tier tough, so do not offer that fight early. Build the dread slowly: the other NPCs can hint at who waits at the stronghold.
- Beating the boss after every quest is solved returns `endingUnlocked: true` in the fight result. Only then run `node game/cli.js ending build`. It writes a page of the hero's whole journey and returns its file path. Tell the player the path, in the voice of the setting, and say it holds what the hero lived through: time played, fights won, tasks solved, honor, and the falls. Never mention the page or the command before the boss falls, and never offer it earlier than `endingUnlocked`.
- If the dice are tampered with after the ending, the ending locks again until the quests and the boss are done once more.
