/**
 * The eight `TaskState` names, spelled exactly as `ITaskEscrow.TaskState` and
 * `TASK_STATE` in `packages/shared/src/enums.ts`. A mapping stores the name, not the
 * ordinal, so a reader of the index never has to carry the enum with it.
 *
 * AssemblyScript has no string enum, so these are constants; they are the only place
 * in the mappings a state string is spelled.
 */
export const STATE_NONE: string = "None";
export const STATE_OPEN: string = "Open";
export const STATE_CLAIMED: string = "Claimed";
export const STATE_SUBMITTED: string = "Submitted";
export const STATE_RELEASED: string = "Released";
export const STATE_REFUNDED: string = "Refunded";
export const STATE_DISPUTED: string = "Disputed";
export const STATE_RESOLVED: string = "Resolved";
