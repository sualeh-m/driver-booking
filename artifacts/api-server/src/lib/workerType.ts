import { isRestRuleJobRole } from "@workspace/rest-rules";

// A worker is only ever HGV or Warehouse. The type is derived from the job
// role (the single source of truth): HGV-type roles → HGV, everything else →
// Warehouse. Shared by worker create/update AND the auto-create-worker-on-
// passed-submission path so the two can never diverge.
export function workerTypeForJobRole(jobRole: string | null): "HGV" | "Warehouse" {
  return isRestRuleJobRole(jobRole) ? "HGV" : "Warehouse";
}
