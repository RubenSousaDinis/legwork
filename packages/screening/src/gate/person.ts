import type { AbuseClass } from '@legwork/shared';
import type { Leaf } from './leaves.js';

/**
 * A small PT + EN first-name list. It exists to catch "photograph João Silva", not to be a
 * census: a first name **alone** is never a hit, because `Pastelaria Ana` is a legitimate
 * shop. The regex below needs a first name followed by a capitalised surname, or an
 * honorific followed by a capitalised word.
 */
export const FIRST_NAMES = [
  'João', 'José', 'Maria', 'Ana', 'António', 'Manuel', 'Rui', 'Pedro', 'Miguel', 'Tiago',
  'Sofia', 'Inês', 'Carlos', 'Paulo', 'Luís', 'Marta', 'Rita', 'Catarina', 'Bruno', 'Ricardo',
  'Hugo', 'Nuno', 'Joana', 'Beatriz', 'Diogo', 'Filipe', 'Sara', 'Daniel', 'André', 'Vasco',
  'John', 'James', 'Mary', 'David', 'Michael', 'Sarah', 'Emma', 'Robert', 'Linda', 'William',
  'Anna', 'Peter', 'Thomas', 'Laura', 'Mark', 'Paul', 'Lisa', 'George', 'Helen', 'Jack',
  'Oliver', 'Sophie', 'Harry', 'Emily',
] as const;

const PARTICLES = 'da|de|do|dos|das|van|von|di';
const HONORIFICS = 'Sr\\.?|Sra\\.?|Dr\\.?|Dra\\.?|Dona|Mr\\.?|Mrs\\.?|Ms\\.?';

/**
 * Case-sensitive on purpose: a capitalised surname is the signal, and `iu` would turn every
 * lowercase `mark`/`anna` into a named person. Boundaries are Unicode lookarounds, never
 * `\b` — `\b` is ASCII-only and splits `José` in the wrong place.
 */
export const NAMED_PERSON_RE = new RegExp(
  `(?<![\\p{L}])(?:${FIRST_NAMES.join('|')})(?![\\p{L}])(?:\\s+(?:${PARTICLES}))?\\s+\\p{Lu}[\\p{L}]+` +
    `|(?<![\\p{L}])(?:${HONORIFICS})\\s+\\p{Lu}[\\p{L}]+`,
  'u',
);

/** Personal identifiers. Each one is its own `ident.<kind>` rule id. */
export const IDENTIFIER_RULES = [
  {
    kind: 'plate',
    // Portuguese plates across the four historical layouts. Uppercase by definition.
    re: /(?<![\p{L}\p{N}])(?:\d{2}-[A-Z]{2}-\d{2}|[A-Z]{2}-\d{2}-\d{2}|\d{2}-\d{2}-[A-Z]{2}|[A-Z]{2}-\d{2}-[A-Z]{2})(?![\p{L}\p{N}])/u,
  },
  { kind: 'phone', re: /(?:\+?351)?\s?9\d{2}\s?\d{3}\s?\d{3}|\+\d{9,14}/u },
  { kind: 'email', re: /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/u },
  {
    kind: 'document',
    re: /(?:(?<![\p{L}\p{N}])(?:NIF|NISS|BI)(?![\p{L}\p{N}])|[Cc]artão de [Cc]idadão)[^\p{L}\p{N}]{0,4}\d/u,
  },
] as const;

export type IdentifierKind = (typeof IDENTIFIER_RULES)[number]['kind'];

/**
 * `spec.phone` is where a phone number belongs on a `call-confirm`, and `spec.place.place_id`
 * is a schema-checked OpenStreetMap id (`node/900000001`) whose digits are not a phone
 * number. Both are exempt from `ident.phone`; every other leaf is scanned.
 */
const PHONE_EXEMPT_PATHS = new Set(['spec.phone', 'spec.place.place_id']);

/** Recon by default; the two fields where a person's name is a script for the worker impersonate. */
export function personClassForPath(path: string): AbuseClass {
  if (/^spec\.slots\./u.test(path) || /^spec\.[^.]+\.text$/u.test(path)) return 'identity impersonation';
  return 'automated reconnaissance';
}

export type PersonHit = { rule_id: string; class: AbuseClass; field: string };

/** Step 3 (b): a named person, or a personal identifier, anywhere in the spec. */
export function findPersonOrIdentifier(leaves: readonly Leaf[]): PersonHit | undefined {
  for (const leaf of leaves) {
    if (NAMED_PERSON_RE.test(leaf.value)) {
      return { rule_id: `person.${leaf.path}`, class: personClassForPath(leaf.path), field: leaf.path };
    }
    for (const rule of IDENTIFIER_RULES) {
      if (rule.kind === 'phone' && PHONE_EXEMPT_PATHS.has(leaf.path)) continue;
      if (rule.re.test(leaf.value)) {
        return { rule_id: `ident.${rule.kind}`, class: personClassForPath(leaf.path), field: leaf.path };
      }
    }
  }
  return undefined;
}
