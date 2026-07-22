import { Router, type IRouter } from "express";
import { and, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import {
  db,
  submissionsTable,
  workersTable,
  workerSheetsTable,
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
import { formatNameOrNull, formatUkMobile, strictUkMobile } from "../lib/format";
import { resolveCustomJobTitle, rememberJobTitle } from "../lib/jobTitles";
import { workerTypeForJobRole } from "../lib/workerType";

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
    jobRole: submissionsTable.jobRole,
    customJobTitle: submissionsTable.customJobTitle,
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
  jobRole: string | null;
  customJobTitle: string | null;
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
    jobRole: r.jobRole,
    customJobTitle: r.customJobTitle,
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
    jobRole,
    customJobTitle,
    submittedDate,
    outcome,
    requirementId,
    sheetId,
  } = parsed.data;
  const userId = getUserId(req);

  // The role is part of the submission record; "Other" requires a free-text
  // title exactly like it does on a worker.
  const resolvedTitle = resolveCustomJobTitle(jobRole, customJobTitle ?? null);
  if (!resolvedTitle.ok) {
    res.status(400).json({ error: resolvedTitle.error });
    return;
  }

  // A submission is EITHER for an existing worker OR a brand-new candidate not in
  // the worker list. Recording a candidate here must NEVER create a bookable
  // worker — they exist only as this submission record.
  const trimmedCandidate = formatNameOrNull(candidateName) ?? undefined;
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
  let resolvedSheetId: number | null = sheetId;
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

  // Ensure the sheet actually exists (it is now a required part of the record).
  const [sheet] = await db
    .select({ id: sheetsTable.id })
    .from(sheetsTable)
    .where(eq(sheetsTable.id, resolvedSheetId));
  if (!sheet) {
    res.status(400).json({ error: "Sheet not found" });
    return;
  }

  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(submissionsTable)
      .values({
        workerId: hasWorker ? workerId : null,
        candidateName: hasWorker ? null : trimmedCandidate,
        candidatePhone: hasWorker ? null : formatUkMobile(candidatePhone),
        jobRole,
        customJobTitle: resolvedTitle.value,
        submittedDate,
        outcome,
        requirementId: requirementId ?? null,
        sheetId: resolvedSheetId,
        createdBy: userId ?? null,
      })
      .returning({ id: submissionsTable.id });
    await rememberJobTitle(tx, resolvedTitle.value);
    return row;
  });

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

  const [existing] = await db
    .select()
    .from(submissionsTable)
    .where(eq(submissionsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Submission not found" });
    return;
  }

  const newOutcome = parsed.data.outcome;
  const becomingPassed = newOutcome === "passed" && existing.outcome !== "passed";

  // Changing to "passed" is the moment a candidate becomes a real, bookable
  // worker on the sheet + role recorded on the submission. An existing worker
  // is never duplicated — they are just linked to the sheet. Changing AWAY
  // from "passed" deliberately does NOT delete the worker (the frontend warns
  // and asks for confirmation before calling this).
  let workerCreated = false;
  let workerLinkedToSheet = false;

  if (becomingPassed) {
    if (existing.sheetId == null) {
      res.status(400).json({
        error:
          "This submission has no sheet recorded, so the worker cannot be placed. Re-record the submission with a sheet.",
      });
      return;
    }

    try {
      await db.transaction(async (tx) => {
        // Re-read WITH a row lock: two concurrent pass-transitions must not
        // both see workerId=null and each create a worker. The second request
        // blocks here until the first commits, then sees the created worker.
        const [locked] = await tx
          .select()
          .from(submissionsTable)
          .where(eq(submissionsTable.id, existing.id))
          .for("update");
        if (!locked) return;

        let targetWorkerId = locked.workerId;

        if (targetWorkerId == null) {
          // Candidate → create the worker now, with the submission's role.
          if (locked.jobRole == null) {
            throw Object.assign(
              new Error(
                "This submission has no job role recorded, so the worker cannot be created. Re-record the submission with a job role.",
              ),
              { statusCode: 400 },
            );
          }
          const [worker] = await tx
            .insert(workersTable)
            .values({
              fullName: locked.candidateName ?? "Unknown",
              // Keep the candidate's phone if it is a valid UK mobile;
              // otherwise leave it blank — the strict rule then applies the
              // next time the worker is edited.
              phone: strictUkMobile(locked.candidatePhone),
              jobRole: locked.jobRole,
              customJobTitle: locked.customJobTitle,
              workerType: workerTypeForJobRole(locked.jobRole),
              status: "active",
            })
            .returning({ id: workersTable.id });
          targetWorkerId = worker.id;
          workerCreated = true;

          // The submission now belongs to a real worker (identity CHECK:
          // worker_id set ⇒ candidate_name must be null).
          await tx
            .update(submissionsTable)
            .set({ workerId: targetWorkerId, candidateName: null })
            .where(eq(submissionsTable.id, existing.id));
        }

        // Link the worker to the submission's sheet (no-op when already linked).
        const linked = await tx
          .insert(workerSheetsTable)
          .values({ workerId: targetWorkerId, sheetId: locked.sheetId ?? existing.sheetId! })
          .onConflictDoNothing()
          .returning({ workerId: workerSheetsTable.workerId });
        if (linked.length > 0 && !workerCreated) workerLinkedToSheet = true;

        await tx
          .update(submissionsTable)
          .set({ outcome: newOutcome })
          .where(eq(submissionsTable.id, existing.id));
      });
    } catch (err) {
      const e = err as Error & { statusCode?: number };
      if (e.statusCode === 400) {
        res.status(400).json({ error: e.message });
        return;
      }
      throw err;
    }
  } else {
    await db
      .update(submissionsTable)
      .set({ outcome: newOutcome })
      .where(eq(submissionsTable.id, existing.id));
  }

  const row = await fetchOne(existing.id);
  if (!row) {
    res.status(500).json({ error: "Failed to load updated submission" });
    return;
  }
  res.json({ ...serializeRow(row), workerCreated, workerLinkedToSheet });
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
