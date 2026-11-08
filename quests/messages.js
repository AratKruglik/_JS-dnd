// How a quest check says what went wrong or right, without words. A check returns these parts and the
// game renders them in the language of the save (keys are in game/locales). Values like the call
// text are already plain strings, so code stays exactly as written.
export const part = (key, params = {}) => ({ key, params });

export const missingExport = (name, type) => ({
  pass: false,
  expected: part('check.missingExport.expected', { name }),
  got: part('check.missingExport.got', { name, type }),
});

export const wrongResult = (call, wanted, gave) => ({
  pass: false,
  expected: part('check.wrongResult.expected', { call, wanted, gave }),
  got: part('check.wrongResult.got', { call, wanted, gave }),
});

export const outOfRange = (call, max, gave) => ({
  pass: false,
  expected: part('check.outOfRange.expected', { call, max }),
  got: part('check.outOfRange.got', { call, gave }),
});

export const allFacesMissing = (faces) => ({
  pass: false,
  expected: part('check.allFaces.expected'),
  got: part('check.allFaces.got', { faces }),
});

export const passed = (key) => ({ pass: true, expected: part(key), got: part(key) });
