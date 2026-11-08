// Sample Master content for tests: a setting and a full world for the fixed skeleton.
export const SETTING = {
  source: 'offered',
  name: 'Neon Harbor',
  description: 'A rain-soaked port city where every deal is brokered over noodle steam.',
  voice: 'Clipped, wry, street-smart. Short sentences, dry jokes, no lectures.',
};

export function goodWorld(prefix = '') {
  const locations = {};
  const npcs = {};
  ['L1', 'L2', 'L3', 'L4', 'L5', 'L6'].forEach((slot, i) => {
    locations[slot] = { name: `${prefix}Place ${i + 1}`, description: `A dripping corner of the harbor, number ${i + 1}.` };
  });
  ['N1', 'N2', 'N3', 'N4', 'N5', 'N6', 'N7'].forEach((slot, i) => {
    npcs[slot] = {
      name: `${prefix}Person ${i + 1}`,
      description: `A wary local, number ${i + 1}.`,
      voice: 'Mumbles, trails off, squints at everything.',
    };
  });
  return { locations, npcs };
}
