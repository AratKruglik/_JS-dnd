## Onboarding

Skip any step that is already done: if the resume state has a hero, ask whether to keep them, and if `world.settingSet` is true, do not ask for the setting again.

1. Race. Run `node game/cli.js rules races`. Offer a handful as a choice prompt, showing each by its `display` name (hobbit means halfling). Pass the player's own words straight to `hero create`: the scripts understand race and class names and aliases in both languages and store the stable English key. When you talk about the hero later, use `raceDisplay` and `classDisplay` from `hero show`. If the player invents a race, ask three or four short questions (looks, culture, what it is good and bad at), then propose ability bonuses: each from -2 to +2, positives adding up to at most 4. Get the player's clear OK before using them.
2. Class. Run `node game/cli.js rules classes` and do the same (magician means wizard). A custom class needs a one-line description and has no bonuses.
3. Scores. Run `node game/cli.js rules pointbuy`. The player has 27 points to spend on six scores from 8 to 15, in the order STR, DEX, CON, INT, WIS, CHA. Explain the costs in plain words and help them spread the points.
4. Name. Ask for the hero's name as plain text.
5. Create the hero with `node game/cli.js hero create --name <name> --race <race> --class <class> --scores <six numbers>` plus `--bonuses STR=2,DEX=1`, `--race-desc` and `--class-desc` for custom picks. If it errors, fix it with the player and retry. Until the world is complete, running it again replaces the hero, so the player can start over. After that the hero is final.
6. Setting. Invent three very different setting versions (a name and one sentence each; think medieval, cyberpunk, wasteland, a film or book world) and offer them as a choice prompt. The player can pick one, customize one, or write their own. Save it with `node game/cli.js world setting --source offered|customized|written --name <name> --desc <description> --voice <voice>`. The voice is a short style guide for how you and the NPCs talk in this world.
7. World. Run `node game/cli.js world skeleton`: it shows 6 location slots with their roles and exits, and 7 NPC slots with their roles. N7 is the final boss of the campaign: give them a name and a voice that fit a last enemy. Invent names, one or two sentence descriptions, and NPC voices that fit the setting and the roles. Send everything in one call, with the JSON on stdin so an apostrophe in a name or description cannot break the command (fantasy text is full of them):

```
node game/cli.js world fill --data - <<'EOF'
{"locations":{"L1":{"name":"...","description":"..."}},"npcs":{"N1":{"name":"...","description":"...","voice":"..."}}}
EOF
```

Include all six locations and all seven NPCs. If it is rejected (banned phrase, duplicate name, missing slot), read the error, fix it, and send it again. For the other commands, wrap any text that has an apostrophe in double quotes.
8. Open the story. Run `node game/cli.js look` and describe the hero's arrival in three or four sentences, in the voice of the setting.
