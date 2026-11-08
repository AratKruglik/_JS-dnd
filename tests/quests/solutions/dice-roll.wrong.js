// Off by one: faces run 0 to sides - 1.
export function rollDie(sides, rng = Math.random) {
  return Math.floor(rng() * sides);
}
