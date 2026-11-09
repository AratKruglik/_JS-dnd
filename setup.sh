#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Every message the script prints is in this table, in English and in Ukrainian, one "language:key" line
# each. A test checks that both languages have every key and the same commands, files, and links.
say() {
  case "$SETUP_LANG:$1" in
    en:node_missing)
      echo "Node.js is missing." ;;
    uk:node_missing)
      echo "Node.js не знайдено." ;;
    en:sqlite_missing)
      echo "This Node.js ($(node --version)) has no built-in SQLite (node:sqlite)." ;;
    uk:sqlite_missing)
      echo "У цього Node.js ($(node --version)) немає вбудованого SQLite (node:sqlite)." ;;
    en:install_help)
      cat <<'HELP'
Install the current Node.js release (this game was built on 25.8.1), then run this script again:
  macOS with Homebrew:  brew install node
  Linux or macOS:       install nvm from https://github.com/nvm-sh/nvm, then run: nvm install node
  Anywhere:             download the installer from https://nodejs.org
HELP
      ;;
    uk:install_help)
      cat <<'HELP'
Встанови поточний випуск Node.js (гру створено на 25.8.1) і запусти цей скрипт ще раз:
  macOS з Homebrew:     brew install node
  Linux або macOS:      встанови nvm з https://github.com/nvm-sh/nvm, потім виконай: nvm install node
  Будь-де:              завантаж інсталятор з https://nodejs.org
HELP
      ;;
    en:no_ukrainian)
      echo "This Node.js has no Ukrainian language data, so setup continues in English." ;;
    uk:no_ukrainian)
      echo "У цьому Node.js немає українських мовних даних, тому налаштування триває англійською." ;;
    en:npm_failed)
      echo "Could not install the style tools with npm, so the style check will be skipped. Run npm install in the game folder to turn it on." ;;
    uk:npm_failed)
      echo "Не вдалося встановити інструменти стилю через npm, тому перевірку стилю буде пропущено. Виконай npm install у теці гри, щоб увімкнути її." ;;
    en:npm_missing)
      echo "npm was not found, so the style check will be skipped. Install npm and run npm install in the game folder to turn it on." ;;
    uk:npm_missing)
      echo "npm не знайдено, тому перевірку стилю буде пропущено. Встанови npm і виконай npm install у теці гри, щоб увімкнути її." ;;
    en:init_failed)
      echo "Could not create the game database. The game said:" ;;
    uk:init_failed)
      echo "Не вдалося створити базу даних гри. Гра повідомила:" ;;
    en:init_hint)
      echo "If that mentions the dice, restore game/dice.js and game/rolls.js from the repo. Otherwise check that the data/ folder is writable, then run this script again." ;;
    uk:init_hint)
      echo "Якщо там згадано кубики, відновіть game/dice.js і game/rolls.js з репозиторію. Інакше перевір, що в теку data/ можна писати, і запусти цей скрипт ще раз." ;;
    en:done)
      echo "Setup complete" ;;
    uk:done)
      echo "Налаштування завершено" ;;
  esac
}

# The language is asked once, on a terminal. JSDND_SETUP_LANG answers it without one. With no answer
# the script speaks English and leaves the language empty, so /play asks later.
SETUP_LANG="en"
LANG_CHOSEN=""
case "${JSDND_SETUP_LANG:-}" in
  en|uk) SETUP_LANG="$JSDND_SETUP_LANG"; LANG_CHOSEN="$JSDND_SETUP_LANG" ;;
  *)
    # JSDND_SETUP_PROMPT=1 asks even without a terminal (a test hook), reading the answer from stdin.
    if [ "${JSDND_SETUP_PROMPT:-}" = "1" ] || { [ -t 0 ] && [ -t 1 ]; }; then
      printf 'Language / Мова: [1] English  [2] Українська (1): '
      read -r answer || answer=""
      case "$answer" in
        2|uk|UK|Uk|укр*|Укр*) SETUP_LANG="uk" ;;
      esac
      LANG_CHOSEN="$SETUP_LANG"
    fi
    ;;
esac

if ! command -v node >/dev/null 2>&1; then
  say node_missing >&2
  say install_help >&2
  exit 1
fi

if ! node -e "require('node:sqlite')" >/dev/null 2>&1; then
  say sqlite_missing >&2
  say install_help >&2
  exit 1
fi

# Ukrainian needs the language data that ships with most Node builds. Without it, stay in English.
if [ "$SETUP_LANG" = "uk" ] && ! node -e "process.exit(Intl.PluralRules.supportedLocalesOf(['uk']).length ? 0 : 1)" >/dev/null 2>&1; then
  SETUP_LANG="en"
  LANG_CHOSEN=""
  say no_ukrainian >&2
fi

# Prettier and ESLint power the style check on quest files. The game plays without them.
if [ ! -x "$HERE/node_modules/.bin/prettier" ]; then
  if command -v npm >/dev/null 2>&1; then
    if ! npm install --no-audit --no-fund --prefix "$HERE" >/dev/null 2>&1; then
      say npm_failed >&2
    fi
  else
    say npm_missing >&2
  fi
fi

if ! INIT_OUTPUT="$(node "$HERE/game/cli.js" init 2>&1)"; then
  say init_failed >&2
  echo "$INIT_OUTPUT" >&2
  say init_hint >&2
  exit 1
fi

# The chosen language goes into the save, so /play does not ask again.
if [ -n "$LANG_CHOSEN" ]; then
  node "$HERE/game/cli.js" lang set "$LANG_CHOSEN" >/dev/null
fi

say done
