import { CALL_CONFIRM_DENYLIST, type AbuseClass, type TaskType } from '@legwork/shared';
import { stringLeaves, type Leaf } from './leaves';
import { findPersonOrIdentifier } from './person';

/** Label → the slug used inside a rule id. The labels themselves come from `@legwork/shared`. */
export const ABUSE_CLASS_SLUG = {
  'credential fraud': 'credential-fraud',
  'identity impersonation': 'identity-impersonation',
  'automated reconnaissance': 'automated-reconnaissance',
  'social media manipulation': 'social-media-manipulation',
  'authentication circumvention': 'authentication-circumvention',
  'referral fraud': 'referral-fraud',
} as const satisfies Record<AbuseClass, string>;

/** A Unicode word boundary. Never `\b`: that is ASCII-only and breaks on `é` and `ç`. */
const B0 = '(?<![\\p{L}\\p{N}])';
const B1 = '(?![\\p{L}\\p{N}])';

const URL_RE = /https?:\/\/|www\./iu;
const DIGIT_RUN_RE = /\d{4,}/u;

/**
 * The `call-confirm` denylist, tagged with the class each term belongs to. The terms are not
 * retyped here: `CALL_CONFIRM_DENYLIST` is frozen in `@legwork/shared` and this file only
 * slices it, so a term can never exist in one place and not the other. The slices follow the
 * order the shared list is written in (10-schemas §5), which is asserted below.
 *
 * Class order matters: referral is evaluated first, so "sign up with referral code XK92"
 * lands on referral fraud rather than on credential fraud or authentication circumvention.
 */
const DENY_GROUPS = [
  { class: 'referral fraud', rule_id: 'deny.referral', from: 22, to: 24 },
  { class: 'authentication circumvention', rule_id: 'deny.auth', from: 0, to: 12 },
  { class: 'identity impersonation', rule_id: 'deny.impersonation', from: 12, to: 18 },
  { class: 'credential fraud', rule_id: 'deny.credential', from: 18, to: 22 },
] as const satisfies readonly { class: AbuseClass; rule_id: string; from: number; to: number }[];

if (CALL_CONFIRM_DENYLIST.length !== 24) {
  throw new Error(
    `CALL_CONFIRM_DENYLIST changed shape (${CALL_CONFIRM_DENYLIST.length} terms); re-slice DENY_GROUPS in gate/rules.ts`,
  );
}

/**
 * The length check above catches a resize but not a reorder, which would silently retag every
 * term with the wrong class. One sentinel per slice boundary makes a reorder throw the same
 * way. These four are assertions about the frozen list, not a second copy of the rule data.
 */
for (const [index, term] of [
  [0, 'code'],
  [12, 'confirm my identity'],
  [18, 'account'],
  [22, 'referral'],
] as const) {
  if ((CALL_CONFIRM_DENYLIST as readonly string[])[index] !== term) {
    throw new Error(
      `CALL_CONFIRM_DENYLIST[${index}] is no longer "${term}"; re-slice DENY_GROUPS in gate/rules.ts`,
    );
  }
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

export type DenyRule = { rule_id: string; class: AbuseClass; re: RegExp };

/** One compiled regex per group, in class order. */
export const DENY_RULES: DenyRule[] = DENY_GROUPS.map((g) => ({
  rule_id: g.rule_id,
  class: g.class,
  re: new RegExp(`${B0}(?:${CALL_CONFIRM_DENYLIST.slice(g.from, g.to).map(escapeRe).join('|')})${B1}`, 'iu'),
}));

export type KeywordRule = { rule_id: string; class: AbuseClass; re: RegExp };

/**
 * The six-class keyword rules of arXiv:2602.19514, one regex per rule id, in class order.
 * The order is the tie-break: a spec that reads on two classes is refused under the first,
 * which is why "completed KYC screen" is referral fraud and "like and repost … from 10
 * accounts" is social media manipulation rather than credential fraud.
 */
export const KEYWORD_RULES: KeywordRule[] = [
  {
    rule_id: 'kw.referral-fraud.1',
    class: 'referral fraud',
    re: /referral|invite code|código de convite|promo code|código promocional/iu,
  },
  {
    rule_id: 'kw.referral-fraud.2',
    class: 'referral fraud',
    re: /my link|o meu link|through my link|with my link/iu,
  },
  {
    rule_id: 'kw.referral-fraud.3',
    class: 'referral fraud',
    re: /(?<![\p{L}])kyc(?![\p{L}])|know your customer/iu,
  },
  {
    rule_id: 'kw.authentication-circumvention.1',
    class: 'authentication circumvention',
    re: /(?<![\p{L}])(?:code|código|otp|2fa|pin|senha)(?![\p{L}])|one[- ]time|verification|verificação|password|palavra-passe/iu,
  },
  {
    rule_id: 'kw.authentication-circumvention.2',
    class: 'authentication circumvention',
    re: /(?<![\p{L}])sms(?![\p{L}])|text message/iu,
  },
  {
    rule_id: 'kw.authentication-circumvention.3',
    class: 'authentication circumvention',
    re: /captcha|select all|which (?:image|images|picture|pictures|square|squares) (?:contain|contains|has|have|show|shows)|traffic light|crosswalk|fire hydrant|not a robot|não sou um robô/iu,
  },
  {
    rule_id: 'kw.identity-impersonation.1',
    class: 'identity impersonation',
    re: /(?<![\p{L}])as me(?![\p{L}])|pretend|impersonat|pos(?:e|ing) as|fingir|fazer[- ]se passar|em meu nome|on my behalf|say you are|diga que é|(?<![\p{L}])be me(?![\p{L}])/iu,
  },
  {
    rule_id: 'kw.identity-impersonation.2',
    class: 'identity impersonation',
    re: /(?<![\p{L}])id card|(?<![\p{L}])my id(?![\p{L}])|passport|passaporte|cartão de cidadão|driver'?s licen[cs]e|carta de condução|selfie|(?<![\p{L}])face(?![\p{L}])|(?<![\p{L}])rosto(?![\p{L}])|facial/iu,
  },
  {
    rule_id: 'kw.social-media-manipulation.1',
    class: 'social media manipulation',
    re: /like and|repost|retweet|upvote|follow(?:ers?|ing)?(?![\p{L}])(?!\s+(?:him|her|them|the|that|this))|unfollow|subscribe|engagement|viral|comments? (?:on|under)|curtir|seguir|partilhar|gostos?(?![\p{L}])/iu,
  },
  {
    rule_id: 'kw.social-media-manipulation.2',
    class: 'social media manipulation',
    re: /instagram|tiktok|twitter|x\.com|facebook|youtube|linkedin|reddit|(?<![\p{L}])posts(?![\p{L}])/iu,
  },
  {
    rule_id: 'kw.credential-fraud.1',
    class: 'credential fraud',
    re: /creat(?:e|ing|ed)(?![\p{L}]).{0,40}(?<![\p{L}])(?:accounts?|contas?|profiles?|perfi[ls])(?![\p{L}])/iu,
  },
  {
    rule_id: 'kw.credential-fraud.2',
    class: 'credential fraud',
    re: /(?:fake|bulk|multiple|new|throwaway|burner) (?:accounts?|profiles?|contas?|perfi[ls])|sign ?ups?(?![\p{L}])|regist(?:er|ration|ar|o).{0,30}(?:accounts?|contas?)|\d+ (?:accounts|contas|profiles|perfis)/iu,
  },
  {
    rule_id: 'kw.automated-reconnaissance.1',
    class: 'automated reconnaissance',
    re: /where .{0,30}(?<![\p{L}])(?:lives?|works?|is|are|goes)(?![\p{L}])|home address|(?<![\p{L}])morada|onde (?:mora|vive|trabalha)|lives at|(?<![\p{L}])track(?![\p{L}])|follow (?:him|her|them)|stakeout|surveil|watch (?:him|her|them|the house)|licen[cs]e plate|matrícula|who (?:lives|works|owns)|quem (?:mora|vive|trabalha)/iu,
  },
  {
    rule_id: 'kw.automated-reconnaissance.2',
    class: 'automated reconnaissance',
    re: /(?<![\p{L}])(?:the|a|that|this|o|aquela|aquele|esta|este) (?:woman|man|girl|boy|guy|lady|gentleman|person|customer|client|employee|worker|cashier|clerk|kid|child|senhora|senhor|mulher|homem|rapariga|rapaz|pessoa|cliente|funcionári[oa]|empregad[oa]|criança)(?![\p{L}])/iu,
  },
];

/** `spec.a.url` / `spec.b.url` / `spec.reference.url` are the images a compare-two is about. */
const URL_EXEMPT_PATHS = new Set(['spec.a.url', 'spec.b.url', 'spec.reference.url']);

export type RuleHit = { class: AbuseClass; rule_id: string; reason: string; field: string };

function denyHit(leaves: readonly Leaf[]): RuleHit | undefined {
  for (const rule of DENY_RULES) {
    if (rule.rule_id === 'deny.referral') {
      // The URL rule is tagged referral fraud and is evaluated with its class.
      for (const leaf of leaves) {
        if (rule.re.test(leaf.value)) {
          return { class: rule.class, rule_id: rule.rule_id, reason: `denylist ${rule.rule_id}`, field: leaf.path };
        }
      }
      for (const leaf of leaves) {
        if (URL_RE.test(leaf.value)) {
          return { class: rule.class, rule_id: 'deny.url', reason: 'denylist deny.url', field: leaf.path };
        }
      }
      continue;
    }
    for (const leaf of leaves) {
      if (rule.re.test(leaf.value)) {
        return { class: rule.class, rule_id: rule.rule_id, reason: `denylist ${rule.rule_id}`, field: leaf.path };
      }
    }
    if (rule.rule_id === 'deny.auth') {
      for (const leaf of leaves) {
        if (leaf.path.startsWith('spec.slots.') && DIGIT_RUN_RE.test(leaf.value)) {
          return { class: rule.class, rule_id: 'deny.digits', reason: 'denylist deny.digits', field: leaf.path };
        }
      }
    }
  }
  return undefined;
}

/** Step 3 (c) over one string. Also the whole of `KeywordFallbackClassifier`. */
export function matchKeywordRules(text: string): KeywordRule | undefined {
  return KEYWORD_RULES.find((r) => r.re.test(text));
}

/**
 * Step 3 of the pipeline: the denylist, the named-person and identifier regexes, then the
 * six-class keyword rules — in that order, first hit wins. This gate is authoritative: the
 * classifier may add a refusal on the free-text path, it can never overturn one from here.
 */
export function runDeterministicRules(taskType: TaskType, rawSpec: unknown): RuleHit | undefined {
  const leaves = stringLeaves(rawSpec);

  if (taskType === 'call-confirm') {
    const deny = denyHit(leaves);
    if (deny) return deny;
  } else {
    for (const leaf of leaves) {
      if (URL_EXEMPT_PATHS.has(leaf.path)) continue;
      if (URL_RE.test(leaf.value)) {
        return { class: 'referral fraud', rule_id: 'deny.url', reason: 'denylist deny.url', field: leaf.path };
      }
    }
  }

  const person = findPersonOrIdentifier(leaves);
  if (person) {
    return { class: person.class, rule_id: person.rule_id, reason: `rule ${person.rule_id}`, field: person.field };
  }

  for (const rule of KEYWORD_RULES) {
    for (const leaf of leaves) {
      if (rule.re.test(leaf.value)) {
        return { class: rule.class, rule_id: rule.rule_id, reason: `keyword rule ${rule.rule_id}`, field: leaf.path };
      }
    }
  }
  return undefined;
}
