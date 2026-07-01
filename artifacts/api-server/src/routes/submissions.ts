import { Router, type IRouter } from "express";
import { and, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import {
  db,
  submissionsTable,
  workersTable,
  sheetsTable,
  shiftRequirementsTable,
} from "@workspace/db";
import {
  ListSubmissionsQueryParams,
  CreateSubmissionBody,
  UpdateSubmissionOutcomeParams,
  UpdateSubmissionOutcomeBody,
  DeleteSubmissionParams,
} from "@workspace/api-zod";
import { getUserId, requireAdmin } from "../lib/auth";

const router: IRouter = Router();

// Build the shared select shape for a submission joined to its worker, sheet and
// (optional) requirement, plus the total number of submissions recorded against
// that requirement (for the "submitted vs needed" comparison in the view).
function submissionSelect() {
  return {
    id: submissionsTable.id,
    workerId: submissionsTable.workerId,
    // Display name: the existing worker's full name, or the standalone candidate
    // name for a candidate submission (workerId null).
    workerName: sql<string>`coalesce(${workersTable.fullName}, ${submissionsTable.candidateName})`,
    candidatePhone: submissionsTable.candidatePhone,
    submittedDate: submissionsTable.submittedDate,
    outcome: submissionsTable.outcome,
    sheetId: submissionsTable.sheetId,
    // Derive the sheet name as "Client — Depot" (matching sheetDisplayName)
    // rather than the legacy stored sheets.name, so it displays consistently.
    sheetName: sql<string | null>`(
      CASE WHEN ${sheetsTable.id} IS NULL THEN NULL
      WHEN ${sheetsTable.depot} IS NOT NULL AND btrim(${sheetsTable.depot}) <> ''
        THEN ${sheetsTable.clientCompany} || ' — ' || ${sheetsTable.depot}
      ELSE ${sheetsTable.clientCompany} END
    )`,
    requirementId: submissionsTable.requirementId,
    requirementReqDate: shiftRequirementsTable.reqDate,
    requirementJobRole: shiftRequirementsTable.jobRole,
    requirementQuantityNeeded: shiftRequirementsTable.quantityNeeded,
    requirementSubmittedCount: sql<number | null>`(
      CASE WHEN ${submissionsTable.requirementId} IS NULL THEN NULL
      ELSE (
        SELECT count(*)::int FROM submissions s2
        WHERE s2.requirement_id = ${submissionsTable.requirementId}
      ) END
    )`,
  };
}

type SubmissionRow = {
  id: number;
  workerId: number | null;
  workerName: string;
  candidatePhone: string | null;
  submittedDate: string;
  outcome: string;
  sheetId: number | null;
  sheetName: string | null;
  requirementId: number | null;
  requirementReqDate: string | null;
  requirementJobRole: string | null;
  requirementQuantityNeeded: number | null;
  requirementSubmittedCount: number | null;
};

function serializeRow(r: SubmissionRow) {
  return {
    id: r.id,
    workerId: r.workerId,
    workerName: r.workerName,
    candidatePhone: r.candidatePhone,
    submittedDate: r.submittedDate,
    outcome: r.outcome,
    sheetId: r.sheetId,
    sheetName: r.sheetName,
    requirementId: r.requirementId,
    requirementReqDate: r.requirementReqDate,
    requirementJobRole: r.requirementJobRole,
    requirementQuantityNeeded: r.requirementQuantityNeeded,
    requirementSubmittedCount: r.requirementSubmittedCount,
  };
}

async function fetchOne(id: number): Promise<SubmissionRow | undefined> {
  const [row] = await db
    .select(submissionSelect())
    .from(submissionsTable)
    .leftJoin(workersTable, eq(workersTable.id, submissionsTable.workerId))
    .leftJoin(sheetsTable, eq(sheetsTable.id, submissionsTable.sheetId))
    .leftJoin(
      shiftRequirementsTable,
      eq(shiftRequirementsTable.id, submissionsTable.requirementId),
    )
    .where(eq(submissionsTable.id, id));
  return row as SubmissionRow | undefined;
}

// List submissions, optionally filtered by sheet and submitted-date range.
router.get("/submissions", async (req, res): Promise<void> => {
  const query = ListSubmissionsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const { sheetId, from, to } = query.data;

  const filters: SQL[] = [];
  if (sheetId) filters.push(eq(submissionsTable.sheetId, sheetId));
  if (from) filters.push(gte(submissionsTable.submittedDate, from));
  if (to) filters.push(lte(submissionsTable.submittedDate, to));

  const rows = await db
    .select(submissionSelect())
    .from(submissionsTable)
    .leftJoin(workersTable, eq(workersTable.id, submissionsTable.workerId))
    .leftJoin(sheetsTable, eq(sheetsTable.id, submissionsTable.sheetId))
    .leftJoin(
      shiftRequirementsTable,
      eq(shiftRequirementsTable.id, submissionsTable.requirementId),
    )
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(submissionsTable.submittedDate), desc(submissionsTable.id));

  res.json((rows as SubmissionRow[]).map(serializeRow));
});

// Record a submission (a worker put forward to a client). Optionally linked to a
// shift requirement and/or sheet.
router.post("/submissions", async (req, res): Promise<void> => {
  const parsed = CreateSubmissionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const {
    workerId,
    candidateName,
    candidatePhone,
    submittedDate,
    outcome,
    requirementId,
    sheetId,
  } = parsed.data;
  const userId = getUserId(req);

  // A submission is EITHER for an existing worker OR a brand-new candidate not in
  // the worker list. Recording a candidate here must NEVER create a bookable
  // worker — they exist only as this submission record.
  const trimmedCandidate = candidateName?.trim();
  const hasWorker = workerId != null;
  const hasCandidate = trimmedCandidate != null && trimmedCandidate !== "";
  if (hasWorker === hasCandidate) {
    res.status(400).json({
      error:
        "Provide exactly one of: an existing worker, or a new candidate name.",
    });
    return;
  }

  if (hasWorker) {
    const [worker] = await db
      .select({ id: workersTable.id })
      .from(workersTable)
      .where(eq(workersTable.id, workerId));
    if (!worker) {
      res.status(400).json({ error: "Worker not found" });
      return;
    }
  }

  // A submission linked to a requirement always belongs to that requirement's
  // sheet — the requirement is the source of truth. We force the sheet to match
  // (overriding any conflicting client-supplied sheetId) so a submission can
  // never claim one sheet while its requirement linkage/count belongs to another.
  let resolvedSheetId = sheetId ?? null;
  if (requirementId != null) {
    const [req2] = await db
      .select({ sheetId: shiftRequirementsTable.sheetId })
      .from(shiftRequirementsTable)
      .where(eq(shiftRequirementsTable.id, requirementId));
    if (!req2) {
      res.status(400).json({ error: "Requirement not found" });
      return;
    }
    resolvedSheetId = req2.sheetId;
  }

  const [created] = await db
    .insert(submissionsTable)
    .values({
      workerId: hasWorker ? workerId : null,
      candidateName: hasWorker ? null : trimmedCandidate,
      candidatePhone: hasWorker ? null : candidatePhone?.trim() || null,
      submittedDate,
      outcome,
      requirementId: requirementId ?? null,
      sheetId: resolvedSheetId,
      createdBy: userId ?? null,
    })
    .returning({ id: submissionsTable.id });

  const row = await fetchOne(created.id);
  if (!row) {
    res.status(500).json({ error: "Failed to load created submission" });
    return;
  }
  res.json(serializeRow(row));
});

// Change the outcome of an existing submission (e.g. Submitted -> Passed).
router.patch("/submissions/:id", async (req, res): Promise<void> => {
  const params = UpdateSubmissionOutcomeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateSubmissionOutcomeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [updated] = await db
    .update(submissionsTable)
    .set({ outcome: parsed.data.outcome })
    .where(eq(submissionsTable.id, params.data.id))
    .returning({ id: submissionsTable.id });

  if (!updated) {
    res.status(404).json({ error: "Submission not found" });
    return;
  }

  const row = await fetchOne(updated.id);
  if (!row) {
    res.status(500).json({ error: "Failed to load updated submission" });
    return;
  }
  res.json(serializeRow(row));
});

// Admin only. Permanently delete a single submission record. Nothing references
// a submission, so this is a clean row delete; the record then disappears from
// every KPI report. requireAdmin is attached per-route so the admin gate does
// not leak onto the other routes in this router.
router.delete(
  "/submissions/:id",
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = DeleteSubmissionParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const deleted = await db
      .delete(submissionsTable)
      .where(eq(submissionsTable.id, params.data.id))
      .returning({ id: submissionsTable.id });

    if (deleted.length === 0) {
      res.status(404).json({ error: "Submission not found" });
      return;
    }

    res.status(204).end();
  },
);

export default router;
