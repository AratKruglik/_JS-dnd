// How a quest check says what went wrong or right, without words. A check returns these parts and the
// game renders them in the language of the save (keys are in game/locales). Values like the call
// text are already plain strings, so code stays exactly as written.
export const part = (key, params = {}) => ({ key, params });

// What the player's code returned, as text. The parts travel as JSON, which drops undefined and turns NaN
// into null, so the value is turned into text here, the way a template string would show it.
const shown = (value) => {
  try {
    return String(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
};

export const missingExport = (name, type) => ({
  pass: false,
  expected: part('check.missingExport.expected', { name }),
  got: part('check.missingExport.got', { name, type }),
});

export const wrongResult = (call, wanted, gave) => {
  const params = { call, wanted: shown(wanted), gave: shown(gave) };
  return {
    pass: false,
    expected: part('check.wrongResult.expected', params),
    got: part('check.wrongResult.got', params),
  };
};

export const outOfRange = (call, max, gave) => ({
  pass: false,
  expected: part('check.outOfRange.expected', { call, max: shown(max) }),
  got: part('check.outOfRange.got', { call, gave: shown(gave) }),
});

export const allFacesMissing = (faces) => ({
  pass: false,
  expected: part('check.allFaces.expected'),
  got: part('check.allFaces.got', { faces }),
});

export const passed = (key) => ({ pass: true, expected: part(key), got: part(key) });
