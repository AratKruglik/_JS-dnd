// Legal documentation sources (spec 5.6). Everything else is illegal.
// Matching is by exact host (the leading "www." is ignored), never by substring.
export const LEGAL_SOURCES = [
  { host: 'developer.mozilla.org' },
  { host: 'w3schools.com' },
  { host: 'tc39.es', pathPrefixes: ['/ecma262'] },
  { host: 'nodejs.org', pathPrefixes: ['/docs', '/api'] },
  { host: 'fetch.spec.whatwg.org' },
  { host: 'javascript.info' },
  { host: 'uk.javascript.info' },
  { host: 'eloquentjavascript.net' },
];

const underPrefix = (pathname, prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`);

// A beginner often types a link without "https://". If it starts like a host name
// (words, dots, then a path), read it as https so a legal link is not punished.
const looksLikeBareHost = (text) => /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(\/|$)/i.test(text);

export function classifyLink(url) {
  let parsed;
  try {
    const text = typeof url === 'string' && looksLikeBareHost(url) ? `https://${url}` : String(url);
    parsed = new URL(text);
  } catch {
    return { legal: false, host: null };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return { legal: false, host: null };

  const host = parsed.hostname.replace(/^www\./, '');
  // A link with user@ in front of the host is a classic disguise, so it is never legal.
  if (parsed.username || parsed.password) return { legal: false, host };

  const source = LEGAL_SOURCES.find((s) => s.host === host);
  if (!source) return { legal: false, host };
  if (source.pathPrefixes && !source.pathPrefixes.some((p) => underPrefix(parsed.pathname, p))) {
    return { legal: false, host };
  }
  return { legal: true, host };
}
