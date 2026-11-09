// Ukrainian text the player reads. Same keys as en.js. A plural entry has one, few, many, and other.
// Cyrillic only: Latin letters appear only inside backticks, {placeholders}, and a bracketed English
// term after a JS term. No em-dash or en-dash anywhere. DRAFT until Gogi has reviewed it.
export default {
  'language.changed': 'Мову змінено на {name}.',

  // Стартовий файл бойового прийому.
  'move.stub.title': 'Бойовий прийом: {title}',
  'move.stub.export': 'Експортуй функцію з назвою `solve`.',
  'move.stub.code': 'твій код тут',

  // Що каже перевірка завдання. {call} це код і лишається як є.
  'check.timeout.message': 'Твій код працював довше за {seconds} с і був зупинений.',
  'check.tooMuchOutput.message': 'Твій код вивів забагато тексту.',
  'check.noResult.message': 'Твій код зупинив програму раніше, ніж перевірка встигла завершитися.',
  'check.unreadable.message': 'Перевірка дала нечитабельний результат.',
  'check.fileNotFound.message': 'Файл гравця не знайдено: {path}',
  'check.neverSettled.message':
    'Твій код так і не завершився: обіцянка (promise), яку він повернув, ніколи не виконалася, тому перевірка не отримала відповіді.',
  'check.unknownQuest.message': 'Невідоме завдання "{questId}".',
  'check.missingSolve.message': 'Твій файл має експортувати функцію з назвою `solve`.',
  'check.solveThrew.message': '`solve` викинула помилку: {message}',
  'check.raw.message': '{message}',
  'check.missingExport.expected': 'експортована функція `{name}`',
  'check.missingExport.got': '`{name}` має тип {type}',
  'check.wrongResult.expected': '`{call}` дає {wanted}',
  'check.wrongResult.got': '`{call}` дала {gave}',
  'check.outOfRange.expected': '`{call}` дає ціле число від 1 до {max}',
  'check.outOfRange.got': '`{call}` дала {gave}',
  'check.allFaces.expected': '600 кидків `rollDie(6)` показують усі шість граней',
  'check.allFaces.got': 'побачені грані: {faces}',
  'check.pass.fairDie': 'чесний кубик',
  'check.pass.loud': 'гучний текст',
  'check.pass.totals': 'правильні суми',
  'check.pass.everyTest': 'усі тести пройдено',

  // Смуга витривалості та рядок про знесилення: їх друкують скрипти, Майстра між ними немає.
  // Рядок героя над смугою витривалості.
  'hero.line': '{name} рів. {level} | ЗДОРОВʼЯ {hp}/{maxHp} | золото {gold} | {items} | {location}',
  'hero.items': { one: '{count} річ', few: '{count} речі', many: '{count} речей', other: '{count} речі' },

  'stamina.bar': 'ВИТРИВАЛІСТЬ {bar} {left}% лишилось | оновиться за {reset}',
  'stamina.barEstimated': 'ВИТРИВАЛІСТЬ ~{bar} ~{left}% лишилось (приблизно) | оновиться за {reset}',
  'stamina.unknown': 'ВИТРИВАЛІСТЬ невідома',
  'stamina.duration': '{hours} год {minutes} хв',
  'stamina.collapse': {
    one: 'ти геть виснажений. ти впав там, де стояв, у місці «{location}», на {count} годину',
    few: 'ти геть виснажений. ти впав там, де стояв, у місці «{location}», на {count} години',
    many: 'ти геть виснажений. ти впав там, де стояв, у місці «{location}», на {count} годин',
    other: 'ти геть виснажений. ти впав там, де стояв, у місці «{location}», на {count} години',
  },

  // Сторінка фіналу.
  'ending.title': '{name}: кінець дороги',
  'ending.theHero': 'Герой',
  'ending.subtitle': '{who} у світі «{world}»',
  'ending.duration': '{hours} год {minutes} хв',
  'ending.tasksOf': '{solved} з {total}',
  'ending.stat.time': 'Зіграно (приблизно)',
  'ending.stat.tasks': 'Розвʼязано завдань',
  'ending.stat.enemies': 'Переможено ворогів',
  'ending.stat.fights': 'Проведено боїв',
  'ending.stat.falls': 'Падінь',
  'ending.honor.heading': 'Честь з часом',
  'ending.honor.note': 'Червоні пунктирні лінії позначають падіння.',
  'ending.fall': 'Падіння: кубики підроблено',
  'ending.complexity.heading': 'Складність, яку ти подолав',
  'ending.complexity.chart': 'Сукупна складність завдань з часом',
  'ending.complexity.total': 'разом {total}',
  'ending.quests.heading': 'Завдання',
  'ending.col.quest': 'Завдання',
  'ending.col.rung': 'Щабель',
  'ending.col.complexity': 'Складність',
  'ending.col.hints': 'Підказки',
  'ending.col.solved': 'Розвʼязано',
  'ending.empty': 'Даних ще немає',

  // Перевірка стилю коду.
  'style.line': 'рядок {line}: {message}',
  'style.formatting': 'форматування: рядок {line} має виглядати так: "{text}"',
  'style.notInstalled': 'Інструменти стилю не встановлено. Виконай `npm install` у теці гри.',
  'style.couldNotRun': 'Перевірку стилю не вдалося запустити.',
  'style.badLinterResult': 'Перевірка стилю не змогла прочитати результат лінтера.',
  'style.rule.no-var': 'Не використовуй `var`, обери `let` або `const`.',
  'style.rule.prefer-const': 'Змінну `{name}` ніколи не перепризначають, тож використай `const`.',
  'style.rule.eqeqeq': 'Використовуй `{expected}` замість `{actual}`.',
  'style.rule.no-console': 'Не залишай `console.log` у файлі.',
  'style.rule.no-eval': 'Не використовуй `eval`.',
  'style.rule.no-implied-eval': 'Не передавай рядок у `setTimeout` чи `setInterval`: передай функцію.',
  'style.rule.no-new-func': 'Не створюй функції через `new Function`.',
};

// What the Master is told about this language. DRAFT until Gogi has reviewed it.
export const pack = {
  // JS terms the player meets. The Master writes the Ukrainian term with the English one in brackets at
  // its first use in each quest, so players can find both in the docs.
  glossary: [
    { term: 'змінна', english: 'variable' },
    { term: 'константа', english: 'constant' },
    { term: 'рядок', english: 'string' },
    { term: 'число', english: 'number' },
    { term: 'логічне значення', english: 'boolean' },
    { term: 'масив', english: 'array' },
    { term: 'обʼєкт', english: 'object' },
    { term: 'властивість', english: 'property' },
    { term: 'метод', english: 'method' },
    { term: 'функція', english: 'function' },
    { term: 'параметр', english: 'parameter' },
    { term: 'аргумент', english: 'argument' },
    { term: 'значення, що повертається', english: 'return value' },
    { term: 'умова', english: 'condition' },
    { term: 'цикл', english: 'loop' },
    { term: 'рекурсія', english: 'recursion' },
    { term: 'область видимості', english: 'scope' },
    { term: 'замикання', english: 'closure' },
    { term: 'зворотний виклик', english: 'callback' },
    { term: 'таймер', english: 'timeout' },
    { term: 'обіцянка', english: 'promise' },
    { term: 'цикл подій', english: 'event loop' },
    { term: 'помилка', english: 'error' },
    { term: 'виняток', english: 'exception' },
    { term: 'регулярний вираз', english: 'regular expression' },
  ],
  // Same rule as English: savage, with swearing, merciless about the code, never about the person.
  roast: {
    rule: 'Жорстко, з матюками, нещадно до коду, але ніколи до життя людини.',
    fairGame: [
      'код у файлі',
      'зашиті відповіді та обхідні шляхи',
      'недбала структура й погані назви',
      'помилка, яку гравець повторює знову і знову',
    ],
    neverAllowed: [
      'справжнє життя людини, її родина, тіло, здоровʼя чи походження',
      'образи за національною, расовою чи будь-якою іншою ознакою',
      'погрози справжньою шкодою',
    ],
    tone: 'Розлючений досвідчений ревʼюер коду, який говорить голосом цього світу: яскраво, смішно і конкретно про справжній код. Завжди кажи, що саме не так або що саме добре.',
  },
  voiceTips: [
    'Говори як світ, а не як асистент.',
    'Короткі речення. Без вступів і підсумків.',
    'Не пропонуй допомогу і не пояснюй, що ти щойно зробив.',
    'Код, назви файлів і команди лишаються точно такими, як є.',
  ],
  // Chatbot phrases and calques from English helper-speak. Lowercase, at least two words, Cyrillic only.
  bannedPhrases: [
    'як штучний інтелект',
    'як мовна модель',
    'як ші',
    'з радістю допоможу',
    'із задоволенням допоможу',
    'чудове запитання',
    'гарне запитання',
    'важливо зазначити',
    'варто зазначити',
    'сподіваюся, це допоможе',
    'сподіваюсь, це допоможе',
    'не соромтеся',
    'дайте мені знати',
    'на завершення',
    'я перепрошую за',
    'будь ласка, зверніть увагу',
    'можете бути впевнені',
    'зануримося в',
  ],
};

// Ukrainian display names and aliases for races and classes. DRAFT until Gogi has reviewed every name.
// There is no official Ukrainian 5e release, so these follow common usage and the unofficial SRD
// translation. The Ukrainian apostrophe is written as the modifier letter, matching ignores the variants.
export const names = {
  races: {
    human: { name: 'людина', aliases: [] },
    elf: { name: 'ельф', aliases: [] },
    dwarf: { name: 'дварф', aliases: [] },
    halfling: { name: 'напіврослик', aliases: ['гобіт', 'хоббіт', 'халфлінг'] },
    gnome: { name: 'гном', aliases: [] },
    'half-elf': { name: 'напівельф', aliases: ['напів-ельф', 'напів ельф'] },
    'half-orc': { name: 'напіворк', aliases: ['напів-орк', 'напів орк'] },
    tiefling: { name: 'тифлінг', aliases: ['тіфлінг'] },
    dragonborn: { name: 'драконороджений', aliases: ['драконородий'] },
  },
  classes: {
    barbarian: { name: 'варвар', aliases: [] },
    bard: { name: 'бард', aliases: [] },
    cleric: { name: 'жрець', aliases: ['клірик'] },
    druid: { name: 'друїд', aliases: [] },
    fighter: { name: 'воїн', aliases: ['боєць', 'файтер'] },
    monk: { name: 'монах', aliases: [] },
    paladin: { name: 'паладин', aliases: [] },
    ranger: { name: 'рейнджер', aliases: ['слідопит'] },
    rogue: { name: 'плут', aliases: ['шахрай', 'розбійник'] },
    sorcerer: { name: 'чародій', aliases: [] },
    warlock: { name: 'чорнокнижник', aliases: ['варлок'] },
    wizard: { name: 'чарівник', aliases: ['маг'] },
  },
};
