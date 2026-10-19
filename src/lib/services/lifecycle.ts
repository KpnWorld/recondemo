import type { RequestStatus } from "@/lib/constants";
import { STATUS_LABELS } from "@/lib/constants";
import type { Tx } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { Actor } from "@/lib/permissions";
import { can } from "@/lib/permissions";

/**
 * Server-side request lifecycle. Every status change goes through `transition`,
 * which checks the move is allowed for this kind of actor, checks the actor's
 * relationship to the request, applies the change with a compare-and-set on the
 * current status (so two people can't move the same request at once), and records
 * who did it and when in RequestStatusHistory.
 */

export type ActorKind = "CUSTOMER" | "PROVIDER" | "ADMIN" | "SYSTEM";

type Rule = { from: RequestStatus; to: RequestStatus; by: ActorKind[] };

export const TRANSITIONS: Rule[] = [
  { from: "SUBMITTED", to: "SEARCHING", by: ["SYSTEM", "ADMIN"] },
  { from: "SUBMITTED", to: "ASSIGNED", by: ["ADMIN"] },
  { from: "SUBMITTED", to: "CANCELLED", by: ["CUSTOMER", "ADMIN", "SYSTEM"] },

  { from: "SEARCHING", to: "ASSIGNED", by: ["PROVIDER", "ADMIN"] },
  { from: "SEARCHING", to: "NO_PROVIDER_AVAILABLE", by: ["SYSTEM", "ADMIN"] },
  { from: "SEARCHING", to: "CANCELLED", by: ["CUSTOMER", "ADMIN"] },

  {
    from: "NO_PROVIDER_AVAILABLE",
    to: "SEARCHING",
    by: ["CUSTOMER", "ADMIN", "SYSTEM"],
  },
  { from: "NO_PROVIDER_AVAILABLE", to: "ASSIGNED", by: ["ADMIN"] },
  { from: "NO_PROVIDER_AVAILABLE", to: "CANCELLED", by: ["CUSTOMER", "ADMIN"] },

  { from: "ASSIGNED", to: "EN_ROUTE", by: ["PROVIDER", "ADMIN"] },
  { from: "ASSIGNED", to: "SEARCHING", by: ["PROVIDER", "ADMIN"] }, // provider released / reassignment
  { from: "ASSIGNED", to: "ASSIGNED", by: ["ADMIN"] }, // direct reassignment
  { from: "ASSIGNED", to: "CANCELLED", by: ["CUSTOMER", "ADMIN"] },

  { from: "EN_ROUTE", to: "ARRIVED", by: ["PROVIDER", "ADMIN"] },
  { from: "EN_ROUTE", to: "SEARCHING", by: ["PROVIDER", "ADMIN"] },
  { from: "EN_ROUTE", to: "ASSIGNED", by: ["ADMIN"] },
  { from: "EN_ROUTE", to: "CANCELLED", by: ["CUSTOMER", "ADMIN"] },

  { from: "ARRIVED", to: "IN_PROGRESS", by: ["PROVIDER", "ADMIN"] },
  { from: "ARRIVED", to: "CANCELLED", by: ["ADMIN"] },

  { from: "IN_PROGRESS", to: "COMPLETED", by: ["PROVIDER", "ADMIN"] },
  { from: "IN_PROGRESS", to: "CANCELLED", by: ["ADMIN"] },
];

export function allowedTransitions(from: RequestStatus, by: ActorKind): RequestStatus[] {
  return TRANSITIONS.filter((t) => t.from === from && t.by.includes(by)).map((t) => t.to);
}

export function isTransitionAllowed(from: RequestStatus, to: RequestStatus, by: ActorKind) {
  return TRANSITIONS.some((t) => t.from === from && t.to === to && t.by.includes(by));
}

export function actorKind(actor: Actor | "SYSTEM"): ActorKind {
  return actor === "SYSTEM" ? "SYSTEM" : actor.role;
}

export type TransitionInput = {
  requestId: string;
  to: RequestStatus;
  actor: Actor | "SYSTEM";
  reason?: string | null;
  /** Optional extra columns to set atomically with the status change. */
  data?: Record<string, unknown>;
};

/** Authorization for a status change, separate from whether the move is legal. */
async function assertActorMayChange(tx: Tx, request: { id: string; customerId: string; status: string }, actor: Actor | "SYSTEM", to: RequestStatus) {
  if (actor === "SYSTEM") return;
  if (actor.role === "CUSTOMER") {
    if (request.customerId !== actor.id) throw new AppError("NOT_FOUND", "Request not found.");
    return;
  }
  if (actor.role === "PROVIDER") {
    // Accepting an offer goes through dispatch.acceptOffer, which creates the
    // assignment in the same transaction before calling transition().
    const assignment = await tx.providerAssignment.findFirst({
      where: {
        requestId: request.id,
        active: true,
        provider: { userId: actor.id },
      },
    });
    if (!assignment) throw new AppError("FORBIDDEN", "This job isn't assigned to you.");
    return;
  }
  if (actor.role === "ADMIN") {
    const needed = to === "CANCELLED" ? "requests.cancel" : to === "ASSIGNED" || to === "SEARCHING" ? "dispatch.assign" : "requests.override_status";
    if (!can(actor, needed)) throw new AppError("FORBIDDEN", "You don't have permission to change this request's status.");
    return;
  }
  throw new AppError("FORBIDDEN", "Not allowed.");
}

export async function transition(tx: Tx, input: TransitionInput) {
  const request = await tx.serviceRequest.findUnique({
    where: { id: input.requestId },
    select: { id: true, customerId: true, status: true },
  });
  if (!request) throw new AppError("NOT_FOUND", "Request not found.");
  const from = request.status as RequestStatus;
  const kind = actorKind(input.actor);

  await assertActorMayChange(tx, request, input.actor, input.to);

  if (!isTransitionAllowed(from, input.to, kind)) {
    throw new AppError("INVALID_TRANSITION", `This request is "${STATUS_LABELS[from]}" and can't be moved to "${STATUS_LABELS[input.to]}"${kind === "SYSTEM" ? "" : " by you"}.`);
  }

  const now = new Date();
  const extra: Record<string, unknown> = { ...(input.data ?? {}) };
  if (input.to === "COMPLETED") extra.completedAt = now;
  if (input.to === "CANCELLED") extra.cancelledAt = now;

  // Compare-and-set: only succeeds if nobody changed the status since we read it.
  const updated = await tx.serviceRequest.updateMany({
    where: { id: request.id, status: from },
    data: { status: input.to, ...extra },
  });
  if (updated.count !== 1) {
    throw new AppError("CONFLICT", "This request was just updated by someone else. Please refresh and try again.");
  }

  await tx.requestStatusHistory.create({
    data: {
      requestId: request.id,
      fromStatus: from,
      toStatus: input.to,
      actorId: input.actor === "SYSTEM" ? null : input.actor.id,
      actorRole: kind,
      reason: input.reason ?? null,
    },
  });

  return { from, to: input.to };
}
