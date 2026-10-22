/**
 * Maker–checker task workflow (FR-51, AC-10) — one place for the transition
 * rules, used by the task API to enforce them and to tell the screen which
 * buttons to offer, so the two can never disagree.
 *
 * Doer (or a partner / manager / admin acting for them):
 *   not_started → in_progress
 *   in_progress → under_review   (needs a reviewer who is not the doer)
 *   in_progress → blocked
 *   returned    → in_progress
 *   blocked     → in_progress
 *
 * The task's named reviewer only — never the doer, and nobody else:
 *   under_review → completed | returned | not_applicable
 *   not_started / in_progress → not_applicable
 */
export const ASSIGNEE_TRANSITIONS: Record<string, string[]> = {
  not_started: ["in_progress"],
  in_progress: ["under_review", "blocked"],
  returned: ["in_progress"],
  blocked: ["in_progress"],
};

export const REVIEWER_TRANSITIONS: Record<string, string[]> = {
  under_review: ["completed", "returned", "not_applicable"],
  not_started: ["not_applicable"],
  in_progress: ["not_applicable"],
};

/** Roles that may move a task forward on the doer's behalf (Gap #29). Never to sign off. */
export const ACTS_FOR_ASSIGNEE_ROLES = new Set(["managing_partner", "partner", "admin", "manager"]);

export interface WorkflowTask {
  status: string;
  assigned_to: string | null;
  reviewer: string | null;
}

/** Statuses this user may move the task to right now. */
export function allowedTargets(task: WorkflowTask, userId: string, roleName: string | null): string[] {
  const isAssignee = task.assigned_to === userId;
  const isReviewer = task.reviewer !== null && task.reviewer === userId;
  const targets = new Set<string>();

  if (isReviewer && !isAssignee) {
    for (const t of REVIEWER_TRANSITIONS[task.status] ?? []) targets.add(t);
  }
  if (isAssignee || (roleName && ACTS_FOR_ASSIGNEE_ROLES.has(roleName))) {
    for (const t of ASSIGNEE_TRANSITIONS[task.status] ?? []) targets.add(t);
  }
  // Submitting for review needs a reviewer who is not the doer.
  if (!task.reviewer || task.reviewer === task.assigned_to) targets.delete("under_review");
  // FR-51: every task carries a doer, so work can't start on one that has none.
  if (!task.assigned_to) targets.delete("in_progress");
  return [...targets];
}
