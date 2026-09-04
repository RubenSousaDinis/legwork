/**
 * Enumerations frozen in T-01a. Every value here is also a Solidity constant, a subgraph
 * field or a database column — changing one is an `interface-change` PR, never a local edit.
 */

export const TASK_TYPES = ['verify-open', 'photo-of', 'call-confirm', 'compare-two'] as const;
export type TaskType = (typeof TASK_TYPES)[number];

/** Matches the on-chain bitmask: a worker's `taskTypes` is the OR of the types they accept. */
export const TASK_TYPE_BIT = {
  'verify-open': 1,
  'photo-of': 2,
  'call-confirm': 4,
  'compare-two': 8,
} as const satisfies Record<TaskType, number>;

export const ALL_TASK_TYPES_BITMASK = 15;

export function taskTypesToBitmask(types: readonly TaskType[]): number {
  return types.reduce((m, t) => m | TASK_TYPE_BIT[t], 0);
}

export function bitmaskToTaskTypes(mask: number): TaskType[] {
  return TASK_TYPES.filter((t) => (mask & TASK_TYPE_BIT[t]) !== 0);
}

/** Ordinals mirror ITaskEscrow.TaskState exactly; the subgraph and the API both decode them. */
export const TASK_STATE = {
  None: 0,
  Open: 1,
  Claimed: 2,
  Submitted: 3,
  Released: 4,
  Refunded: 5,
  Disputed: 6,
  Resolved: 7,
} as const;
export type TaskStateName = keyof typeof TASK_STATE;
export const TASK_STATE_NAMES = Object.keys(TASK_STATE) as TaskStateName[];

export function taskStateName(ordinal: number): TaskStateName {
  const n = TASK_STATE_NAMES[ordinal];
  if (!n) throw new Error(`unknown TaskState ordinal: ${ordinal}`);
  return n;
}

/**
 * The six abuse classes, labels verbatim from Mehta (arXiv:2602.19514), in id order.
 * Nothing else re-types these strings: the zod enum, the UI and the on-chain feedback tag
 * all derive from this tuple, so a typo cannot exist in only one of them.
 */
export const ABUSE_CLASSES = [
  'credential fraud',
  'identity impersonation',
  'automated reconnaissance',
  'social media manipulation',
  'authentication circumvention',
  'referral fraud',
] as const;
export type AbuseClass = (typeof ABUSE_CLASSES)[number];

/** Class ids are 1-based, matching IAbuseMark.mark(classId). */
export const ABUSE_CLASS_ID = Object.fromEntries(
  ABUSE_CLASSES.map((c, i) => [c, i + 1]),
) as Record<AbuseClass, number>;

export function abuseClassById(id: number): AbuseClass {
  const c = ABUSE_CLASSES[id - 1];
  if (!c) throw new Error(`unknown abuse class id: ${id}`);
  return c;
}

/** Mirrors contracts/src/interfaces/Outcomes.sol. */
export const OUTCOME = { Paid: 1, ResolvedToWorker: 2, ResolvedToBuyer: 3 } as const;
export type OutcomeName = keyof typeof OUTCOME;
export type OutcomeCode = (typeof OUTCOME)[OutcomeName];

/** The tag written to the ERC-8004 ReputationRegistry. */
export type FeedbackTag = 'paid-on-proof' | 'disputed' | `task-refused:${AbuseClass}`;

export function refusalTag(c: AbuseClass): FeedbackTag {
  return `task-refused:${c}`;
}
