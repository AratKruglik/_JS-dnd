# Curriculum Catalog: subjects and quest templates

Status: **draft for the owner to trim.** Nothing here is built. Items marked `[My call]` are not decisions.

Sources used for the subject list: javascript.info Part 1 (The JavaScript language), MDN "Dynamic scripting with JavaScript" (Learn web development, Core), and the spec's ladder (section 5.3). Cut down to what a Node script can check with fixed tests.

## Decisions from the owner

- 17 subjects, **3 quest templates each** (easy, medium, hard), built in one run.
- Callbacks stay as their own subject, but only as **preparation for array methods and string methods**.
- Array methods and string methods are their own subjects. Error handling is its own subject. fetch and JSON are one subject.
- Browser topics (DOM, click events, the debugger) are out. **Future item:** Playwright-style tests for them.
- Quests are **setting-neutral**. The world differs each game, so a template carries only the technical spec, the expected results, and code style directions. The Master dresses it in the world's skin.
- Code style directions come in two parts: **general** (one list for all code) and **specific** (per quest, because checks have obvious caveats).
- Quest handout: the owner dislikes handing each NPC a fixed quest but sees no easier start. Provisional: one NPC per rung, kept in one table so it can be swapped later.

## The universal template

Every quest module carries these fields. The first four exist today.

| Field | What it holds |
|---|---|
| `id`, `title`, `rung`, `complexity` | Identity and ladder position (existing) |
| `subject` | One of the 17 subjects below (new) |
| `tier` | `easy`, `medium`, or `hard` inside its subject (new) |
| `spec` | The technical spec: exported name, parameters, return value, edge cases. No story. Replaces today's story-flavored `brief` text |
| `expected` | 2 to 4 input and output examples shown to the player. The check tests more than these |
| `style.specific` | A short list of directions and caveats for this quest only |
| `stub` | Starter file (existing) |
| `check(mod)` | Fixed check with generated inputs (existing) |

General style, shown with every quest `[My call]`:

1. `const` by default, `let` only when a variable is reassigned, never `var`.
2. Strict equality (`===`), never `==`.
3. Clear camelCase names. A name says what the value is, not its type.
4. Small functions that do one job. Return values, do not print them.
5. Do not change the arguments you receive unless the spec says so.
6. No `console.log` left in the submitted file.
7. Two space indent, single quotes, semicolons.
8. Comments only for the why, never for the what.
9. Solve the real problem. Never hardcode expected results, read the check files, or use `eval`.

## Check rules `[My call]`

- Generated inputs on every run, so a hardcoded answer cannot pass (same as today).
- No network. Subjects that touch fetch take the fetch function as a parameter with `fetch` as the default, and the check passes a fake.
- Timer subjects are checked with `node:test` mock timers inside the child process, so they are deterministic and fast. Event loop quests use the real loop with tiny delays.
- A check reports the first failing case plainly (as today).

## Rungs and who hands them out (provisional)

| Rung | Subjects | Quests | NPC |
|---|---|---|---|
| 1 | Values and variables, Strings, Arrays, Objects | 12 | N1 mentor (L1) |
| 2 | Conditionals and logic, Loops, Functions | 9 | N2 trader (L2) |
| 3 | Callbacks, Array methods, String methods, Scope and closures | 12 | N3 keeper (L5) |
| 4 | Error handling, Timeouts | 6 | N4 wanderer (L3) |
| 5 | Promises, async/await | 6 | N5 recluse (L4) |
| 6 | fetch and JSON, The event loop | 6 | N6 captain (L6) |
| end | the final boss | 1 fight | N7 |

51 templates. The three existing quests are slotted in below and keep working.

---

## Rung 1

### 1. Values and variables
Basics: `let` and `const`, number, string, boolean, `null`, `undefined`, `typeof`, arithmetic and `%`, converting between types, `NaN`.

| Tier | id | Spec | Expected | Specific style and caveats |
|---|---|---|---|---|
| easy | `values-fahrenheit` | `celsiusToFahrenheit(c)` returns `c * 9 / 5 + 32` | 0 gives 32, 100 gives 212, -40 gives -40 | One expression. Do not round. |
| medium | `values-describe` | `describeValue(value)` returns the `typeof` string, except `'null'` for `null` and `'array'` for arrays | 5 gives `'number'`, `null` gives `'null'`, `[1]` gives `'array'`, `undefined` gives `'undefined'` | `typeof null` and `typeof []` are both `'object'`. Use `Array.isArray`. |
| hard | `values-to-number` | `toNumberOrNull(input)` returns a number for numbers and numeric strings, else `null` | `'42'` gives 42, `' 7 '` gives 7, `''` gives `null`, `'abc'` gives `null`, `null` gives `null` | `Number('')`, `Number(' ')`, and `Number(null)` are all 0. Do not trust `Number` alone. `NaN` is never returned. |

### 2. Strings
Basics: length, indexing, concatenation, template literals, `trim`, upper and lower case, escape characters.

| Tier | id | Spec | Expected | Specific style and caveats |
|---|---|---|---|---|
| easy | `string-shout` (existing) | `shout(text)` trims, uppercases, adds `!` | `'hello'` gives `'HELLO!'`, `''` gives `'!'` | Use a template literal or `+`, not both. |
| medium | `strings-count-label` | `countLabel(count, noun)` gives `'1 apple'` for one and `'3 apples'` otherwise, including 0 | (1, `'apple'`) gives `'1 apple'`, (0, `'apple'`) gives `'0 apples'` | Regular plural only, add `s`. Use a template literal. |
| hard | `strings-middle` | `middle(text)` returns the middle character, or the middle two when the length is even, or `''` for empty | `'abc'` gives `'b'`, `'abcd'` gives `'bc'`, `''` gives `''` | Work from `length` and indexes. Surrogate pairs are not tested. |

### 3. Arrays
Basics: index, `length`, `push`, `pop`, `shift`, `unshift`, `slice`, `includes`, copying, nested arrays.

| Tier | id | Spec | Expected | Specific style and caveats |
|---|---|---|---|---|
| easy | `arrays-first-last` | `firstAndLast(items)` returns `[first, last]` | `[1,2,3]` gives `[1,3]`, `[7]` gives `[7,7]`, `[]` gives `[]` | Do not change the input array. |
| medium | `array-sum` (existing) | `sumEven(numbers)` totals the even numbers | `[1,2,3,4]` gives 6, `[]` gives 0 | A negative even number counts. |
| hard | `arrays-rotate` | `rotateLeft(items, steps)` returns a new array rotated left | (`[1,2,3,4]`, 1) gives `[2,3,4,1]`, steps may be larger than the length or negative | The input is not changed. `steps` of 0 returns a copy, not the same array. |

### 4. Objects
Basics: properties with dot and bracket access, adding and deleting, `Object.keys`, `Object.values`, `Object.entries`, nested objects, shorthand, `this` in a method.

| Tier | id | Spec | Expected | Specific style and caveats |
|---|---|---|---|---|
| easy | `objects-full-name` | `fullName(person)` joins `first` and `last` with one space, or gives just `first` when `last` is missing | `{first:'Ada', last:'Lovelace'}` gives `'Ada Lovelace'`, `{first:'Ada'}` gives `'Ada'` | No trailing space when `last` is missing. |
| medium | `objects-count-words` | `countWords(words)` returns an object of how often each word appears | `['a','b','a']` gives `{a:2, b:1}` | Return a new object. Words like `'constructor'` must still count correctly. |
| hard | `objects-merge-deep` | `mergeDeep(a, b)` returns a new object where `b` wins, merging nested plain objects recursively | `{x:{y:1,z:2}}` with `{x:{y:9}}` gives `{x:{y:9,z:2}}` | Neither input is changed. Arrays are replaced, not merged. |

## Rung 2

### 5. Conditionals and logic
Basics: `if`, `else if`, ternary, `&&`, `||`, `??`, truthy and falsy, comparison.

| Tier | id | Spec | Expected | Specific style and caveats |
|---|---|---|---|---|
| easy | `logic-fizzbuzz` | `fizzBuzz(n)` gives `'Fizz'` for multiples of 3, `'Buzz'` for 5, `'FizzBuzz'` for both, else the number as a string | 3 gives `'Fizz'`, 10 gives `'Buzz'`, 15 gives `'FizzBuzz'`, 7 gives `'7'` | Check the multiple-of-both case first. |
| medium | `logic-leap-year` | `isLeapYear(year)` follows the Gregorian rule | 2024 true, 1900 false, 2000 true, 2023 false | One boolean expression or a short `if` chain. No lookup table. |
| hard | `logic-shipping-fee` | `shippingFee({ weightKg, express, country })`: up to 1 kg costs 5, up to 5 kg costs 9, above 5 costs 15. `express` adds 50 percent. Country `'PT'` takes 2 off, never below 0. Weight that is not a positive number gives `null` | (`{weightKg:2, express:false, country:'US'}`) gives 9, (`{weightKg:2, express:true, country:'PT'}`) gives 11.5, (`{weightKg:-1}`) gives `null` | Apply the express step before the country discount. Decide the order from the spec, not by guessing. |

### 6. Loops
Basics: `for`, `while`, `for...of`, `break`, `continue`, accumulating a result.

| Tier | id | Spec | Expected | Specific style and caveats |
|---|---|---|---|---|
| easy | `loops-countdown` | `countdown(from)` returns `[from, from-1, ..., 1]`, or `[]` for 0 or less | 3 gives `[3,2,1]`, 0 gives `[]` | Use a loop. A fixed lookup is caught by generated inputs. |
| medium | `loops-primes` | `primesUpTo(n)` returns every prime from 2 to n inclusive | 10 gives `[2,3,5,7]`, 1 gives `[]` | Large n (up to 5000) must finish fast. Stop testing divisors at the square root. |
| hard | `loops-collatz` | `collatzSteps(n)` counts the steps to reach 1: even halves, odd becomes 3n+1. n of 1 gives 0. Anything below 1 gives -1 | 6 gives 8, 1 gives 0, 27 gives 111, 0 gives -1 | `while` fits better than `for` here. |

### 7. Functions
Basics: declarations, expressions, arrow functions, parameters, default values, return, functions as values.

| Tier | id | Spec | Expected | Specific style and caveats |
|---|---|---|---|---|
| easy | `functions-clamp` | `clamp(value, min, max)` keeps `value` inside the range | (15, 0, 10) gives 10, (-3, 0, 10) gives 0, (5, 0, 10) gives 5 | Do not mutate anything. A call with `min` above `max` is not tested. |
| medium | `dice-roll` (existing) | `rollDie(sides, rng = Math.random)` returns a whole number from 1 to `sides` | `rollDie(6, () => 0)` gives 1, `rollDie(6, () => 0.999999)` gives 6 | The default parameter is the point. Read `game/dice.js` first, then write your own. |
| hard | `functions-compose` | `compose(...fns)` returns a function that applies the functions right to left | `compose(double, addOne)(3)` gives 8 | With no functions, the result returns its input unchanged. Do not use `eval`. |

## Rung 3

### 8. Callbacks (preparation for array and string methods only)
Basics: a function as a value, passing a function in, calling it back, giving it arguments.

| Tier | id | Spec | Expected | Specific style and caveats |
|---|---|---|---|---|
| easy | `callbacks-times` | `times(n, fn)` calls `fn(i)` for each `i` from 0 to n-1 and returns nothing | `times(3, spy)` records 0, 1, 2 | Return `undefined`. Do not collect results. |
| medium | `callbacks-my-map` | `myMap(items, fn)` returns a new array of `fn(item, index)` results, without using `.map` | `myMap([1,2], x => x*2)` gives `[2,4]` | The callback receives both the item and its index. |
| hard | `callbacks-my-filter` | `myFilter(items, fn)` returns a new array of items for which `fn(item, index)` is truthy, without using `.filter` | `myFilter([1,2,3,4], x => x%2===0)` gives `[2,4]` | Keep the original order. Items that are falsy but kept (like `0` when `fn` says true) must stay. |

### 9. Array methods
Basics: `map`, `filter`, `find`, `some`, `every`, `reduce`, `sort` with a compare function, `forEach`, chaining.

| Tier | id | Spec | Expected | Specific style and caveats |
|---|---|---|---|---|
| easy | `methods-names` | `names(users)` returns the `name` of each user | `[{name:'Ada'},{name:'Bo'}]` gives `['Ada','Bo']` | Use `map`, not a loop. |
| medium | `methods-adult-names` | `adultNames(users)` returns names of users aged 18 or more, youngest first, ties by name | (`[{name:'Bo',age:30},{name:'Ada',age:17},{name:'Cy',age:18}]`) gives `['Cy','Bo']` | `sort` changes the array it is called on. Copy first. Chain `filter`, `sort`, `map`. |
| hard | `methods-totals-by-category` | `totalsByCategory(orders)` returns an object of summed `amount` per `category` | (`[{category:'a',amount:2},{category:'b',amount:1},{category:'a',amount:3}]`) gives `{a:5,b:1}` | Use `reduce`. Start from an empty object. Do not change the orders. |

### 10. String methods
Basics: `split`, `join`, `slice`, `substring`, `indexOf`, `includes`, `startsWith`, `replace`, `replaceAll`, `padStart`, `at`.

| Tier | id | Spec | Expected | Specific style and caveats |
|---|---|---|---|---|
| easy | `smethods-title-case` | `titleCase(text)` capitalizes the first letter of each word and lowercases the rest | `'hello bIG world'` gives `'Hello Big World'` | Keep single spaces between words. Empty text gives `''`. |
| medium | `smethods-slugify` | `slugify(title)` lowercases, replaces every run of non-letters-and-digits with one `-`, no leading or trailing `-` | `'Hello, World!'` gives `'hello-world'`, `'  A  b '` gives `'a-b'` | A regular expression is fine here. Test with accents is not required. |
| hard | `smethods-parse-query` | `parseQuery(qs)` turns `'a=1&b=two&a=3'` into `{a:['1','3'], b:['two']}`, decoding `%20` and `+` | `'name=Ada%20L'` gives `{name:['Ada L']}`, `''` gives `{}` | Repeated keys collect into one array. Use `decodeURIComponent`. A key without `=` gets the value `''`. |

### 11. Scope and closures
Basics: block scope, shadowing, a function remembering its surroundings, private state.

| Tier | id | Spec | Expected | Specific style and caveats |
|---|---|---|---|---|
| easy | `closures-counter` | `makeCounter(start = 0)` returns a function that gives `start`, then `start + 1`, and so on | Two counters count independently | State lives inside the closure. No global variable. |
| medium | `closures-once` | `once(fn)` returns a function that runs `fn` only on the first call and returns that first result every time | `fn` called three times runs once | Pass arguments through on the first call. Later arguments are ignored. |
| hard | `closures-memoize` | `memoize(fn)` returns a function that caches results by arguments | Calling twice with `(2, 3)` runs `fn` once | Cache key must tell `(1, 23)` from `(12, 3)`. The cache is not reachable from outside. |

## Rung 4

### 12. Error handling
Basics: `throw`, `try`, `catch`, `finally`, `Error` and its subtypes, messages.

| Tier | id | Spec | Expected | Specific style and caveats |
|---|---|---|---|---|
| easy | `errors-safe-parse` | `safeParse(json, fallback)` returns the parsed value, or `fallback` when the text is not valid JSON | `'{"a":1}'` gives `{a:1}`, `'nope'` gives the fallback | Only swallow the parse error, not everything. |
| medium | `errors-positive-int` | `requirePositiveInt(value)` returns the value, throws `TypeError` when it is not a whole number, and `RangeError` when it is below 1 | 3 gives 3, `'3'` throws `TypeError`, 0 throws `RangeError` | Use the exact error types. The message mentions the bad value. |
| hard | `errors-retry` | `retry(fn, attempts)` calls `fn` until it does not throw and returns its result. After the last failed attempt, throw the last error | `fn` fails twice then returns 7 with 3 attempts gives 7 | Do not call `fn` more than `attempts` times. Do not hide the original error. |

### 13. Timeouts
Basics: `setTimeout`, `clearTimeout`, callbacks that run later, `setInterval` and why to clear it.

| Tier | id | Spec | Expected | Specific style and caveats |
|---|---|---|---|---|
| easy | `timeouts-call-later` | `callLater(fn, ms)` runs `fn` once after `ms` milliseconds | `fn` has not run at `ms - 1`, has run at `ms` | Use `setTimeout`. Checked with mock timers. |
| medium | `timeouts-cancellable` | `cancellable(fn, ms)` schedules `fn` and returns a `cancel` function that stops it | After `cancel()`, `fn` never runs | Use `clearTimeout`. Calling `cancel` twice is fine. |
| hard | `timeouts-debounce` | `debounce(fn, ms)` returns a function that runs `fn` only after `ms` of quiet, with the latest arguments | Three calls within `ms` run `fn` once with the third call's arguments | Each call restarts the wait. Keep the timer id in a closure. |

### Rung 5

### 14. Promises
Basics: creating a promise, `then`, `catch`, `finally`, chaining, `Promise.all`, `Promise.race`, `Promise.any`.

| Tier | id | Spec | Expected | Specific style and caveats |
|---|---|---|---|---|
| easy | `promises-wait` | `wait(ms, value)` returns a promise that resolves with `value` after `ms` | Resolves at `ms`, not earlier | Wrap `setTimeout` in `new Promise`. Checked with mock timers. |
| medium | `promises-run-all` | `runAll(tasks)` starts every task (each is a function returning a promise) at once and resolves with the results in order | Three 10 ms tasks finish in about 10 ms, not 30 | Do not await inside a loop one by one. Rejection of any task rejects the whole result. |
| hard | `promises-first-success` | `firstSuccess(promises)` resolves with the first promise that fulfills and rejects with an `AggregateError` only if all reject | (reject, resolve `'b'`) gives `'b'`, all reject gives an `AggregateError` with every reason | A rejection that comes first must not win. Do not use `Promise.any`. |

### 15. async/await
Basics: `async` functions, `await`, `try/catch` around `await`, running things in parallel with `await Promise.all`.

| Tier | id | Spec | Expected | Specific style and caveats |
|---|---|---|---|---|
| easy | `async-sum` | `sumAsync(getA, getB)` awaits both getters and returns the sum | (async () => 2, async () => 3) gives 5 | Start both before awaiting so they run together. |
| medium | `async-with-timeout` | `withTimeout(promise, ms)` rejects with `Error('timeout')` if the promise takes longer than `ms`, otherwise passes its result | A 50 ms promise with `ms` of 20 rejects, with 100 resolves | Clear the timer when the promise wins. |
| hard | `async-map-limit` | `mapLimit(items, limit, fn)` runs `fn` on every item with at most `limit` running at once, results in input order | 10 items with limit 3 never run more than 3 at once | Count running tasks to prove the limit. Order of results must not depend on finish order. |

## Rung 6

### 16. fetch and JSON
Basics: calling `fetch`, `response.ok`, `response.status`, `response.json()`, `JSON.stringify` and `JSON.parse`, request options (`method`, `headers`, `body`).

The fetch function arrives as a parameter, with `fetch` as the default, so checks use a fake and never touch the network.

| Tier | id | Spec | Expected | Specific style and caveats |
|---|---|---|---|---|
| easy | `fetch-user-name` | `getUserName(id, fetchFn = fetch)` requests `https://api.example.test/users/<id>` and returns the `name` from the JSON | A fake returning `{name:'Ada'}` gives `'Ada'`, URL contains the id | Await both the request and `.json()`. |
| medium | `fetch-get-json` | `getJson(url, fetchFn = fetch)` returns parsed JSON, and throws `Error('HTTP <status>')` when `response.ok` is false | Status 404 throws `Error('HTTP 404')` | `fetch` does not throw on 404, you must check `ok`. |
| hard | `fetch-post-json` | `postJson(url, data, fetchFn = fetch)` sends a POST with a JSON body and a `Content-Type: application/json` header, returns the parsed reply, and throws on a non-ok status | The fake sees method `POST`, the header, and body equal to `JSON.stringify(data)` | Do not forget `JSON.stringify`. Reuse the error rule from `fetch-get-json`. |

### 17. The event loop
Basics: the call stack, the task queue, the microtask queue, why a timer of 0 still waits, blocking the loop.

| Tier | id | Spec | Expected | Specific style and caveats |
|---|---|---|---|---|
| easy | `loop-order` | `schedule(log)` must make `log` get `'sync'` first, then `'microtask'`, then `'timeout'`, using `queueMicrotask` and `setTimeout` | `['sync','microtask','timeout']` | `'sync'` must be logged before `schedule` returns. |
| medium | `loop-interleave` | `interleave(log)` must produce `['A','D','C','B']` using a resolved promise `.then`, a `setTimeout` of 0, and plain code | `['A','D','C','B']` | Work out the order by the rules, not by trial. Explain it in a comment. |
| hard | `loop-chunked-work` | `processInChunks(items, work, chunkSize)` runs `work` on every item without blocking the loop: between chunks a timer that was already scheduled must get its turn | A timer set before the call fires before the last chunk finishes | Yield with `setTimeout(0)` between chunks. Results must come back in order. |

---

## Open questions for the owner

1. **Opening quest.** The spec says one of the first quests is the dice code. Here `dice-roll` sits in Functions (rung 2). Do we move it to the front of rung 1 as a special opening quest, or leave it where the ladder puts it?
2. **General style list** above: keep, change, or drop any line? Especially "two space indent, single quotes, semicolons".
3. **Hardest quests** (shipping fee, merge deep, parse query, map limit, chunked work) are real work for a beginner. Cut any, or keep as the "hard" bar?
4. **Handout.** One NPC per rung is provisional. The 12 quests per rung 1 and 3 concentrate on N1 and N3.

## Parked

- Playwright-style tests for browser topics (DOM, events), later.
- A smarter, less static quest handout, later.
- Generators, classes, Map and Set, modules, regular expressions as their own subject, later.
