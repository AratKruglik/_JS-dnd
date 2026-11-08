export function rollDie(sides, rng = Math.random) {
  return Math.floor(rng() * sides) + 1;
}
