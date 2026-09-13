/**
 * Staffing coverage (SC-01, SC-04, D-02/D-03): effective-dated requirements per zone and shift
 * template, qualification holdings with validity, and a per-zone/date/template comparison of
 * required against distinct eligible people. A zone without a requirement row is unknown, never
 * sufficient. Pure calculation; the caller supplies dated data and planned intervals.
 */

export interface StaffingRequirementRule {
  readonly id: string;
  readonly zoneId: string;
  readonly templateId: string;
  readonly requiredCount: number;
  /** Required qualification for every counted person; null means any active worker. */
  readonly qualificationId: string | null;
  /** Business dates (YYYY-MM-DD), inclusive; `effectiveTo` null means open ended. */
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
}

export interface QualificationHolding {
  readonly employeeId: string;
  readonly qualificationId: string;
  readonly validFrom: string;
  readonly validUntil: string | null;
}

export interface CoveredAssignment {
  readonly employeeId: string;
  readonly businessDate: string;
  readonly templateId: string;
  readonly zoneId?: string | null | undefined;
  /** Planned interval in epoch milliseconds; a shorter custom interval covers less. */
  readonly startMs?: number | undefined;
  readonly endMs?: number | undefined;
}

export interface RequirementInterval {
  readonly zoneId: string;
  readonly templateId: string;
  readonly businessDate: string;
  readonly startMs: number;
  readonly endMs: number;
}

export type CoverageStatus = 'UNKNOWN' | 'COVERED' | 'SHORT';

export interface CoverageCell {
  readonly zoneId: string;
  readonly businessDate: string;
  readonly templateId: string;
  readonly requirementId: string;
  readonly qualificationId: string | null;
  readonly required: number;
  /** Distinct assigned people eligible for this row, each counted for one row only. */
  readonly eligible: number;
  readonly missing: number;
  readonly status: CoverageStatus;
}

function activeOn(from: string, to: string | null, date: string): boolean {
  return from <= date && (to === null || date <= to);
}

/** The requirement rows in force for a zone, template and business date. */
export function effectiveRequirements(
  rules: readonly StaffingRequirementRule[],
  zoneId: string,
  templateId: string,
  date: string,
): StaffingRequirementRule[] {
  return rules
    .filter(
      (rule) =>
        rule.zoneId === zoneId &&
        rule.templateId === templateId &&
        activeOn(rule.effectiveFrom, rule.effectiveTo, date),
    )
    .sort((a, b) => (a.qualificationId === null ? 1 : 0) - (b.qualificationId === null ? 1 : 0));
}

export function holdsQualification(
  holdings: readonly QualificationHolding[],
  employeeId: string,
  qualificationId: string,
  date: string,
): boolean {
  return holdings.some(
    (holding) =>
      holding.employeeId === employeeId &&
      holding.qualificationId === qualificationId &&
      activeOn(holding.validFrom, holding.validUntil, date),
  );
}

/**
 * Qualifications an assignee must hold: when every effective requirement row of the zone and
 * template demands a qualification, a person without any of them cannot be planned there (D-03).
 * Returns an empty list when the zone accepts unqualified people or has no requirement.
 */
export function requiredQualifications(
  rules: readonly StaffingRequirementRule[],
  zoneId: string,
  templateId: string,
  date: string,
): string[] {
  const effective = effectiveRequirements(rules, zoneId, templateId, date);
  if (effective.length === 0 || effective.some((rule) => rule.qualificationId === null)) return [];
  return [...new Set(effective.map((rule) => rule.qualificationId as string))];
}

/** Whether the assignee satisfies the mandatory qualification rule for the zone and template. */
export function qualifiedFor(
  rules: readonly StaffingRequirementRule[],
  holdings: readonly QualificationHolding[],
  assignment: Pick<CoveredAssignment, 'employeeId' | 'businessDate' | 'templateId' | 'zoneId'>,
): boolean {
  if (!assignment.zoneId) return true;
  const required = requiredQualifications(
    rules,
    assignment.zoneId,
    assignment.templateId,
    assignment.businessDate,
  );
  return (
    required.length === 0 ||
    required.some((qualificationId) =>
      holdsQualification(holdings, assignment.employeeId, qualificationId, assignment.businessDate),
    )
  );
}

/**
 * Coverage of every requirement row in force on the given dates. People are counted once: rows
 * demanding a qualification take their eligible people first, then unqualified rows take the
 * rest, so one person never satisfies two simultaneous roles. An assignment with a planned
 * interval that does not contain the requirement interval does not count.
 */
export function coverage(input: {
  readonly rules: readonly StaffingRequirementRule[];
  readonly holdings: readonly QualificationHolding[];
  readonly assignments: readonly CoveredAssignment[];
  readonly dates: readonly string[];
  readonly zoneIds: readonly string[];
  /** Planned interval of the template on a date; omitted means whole-shift coverage. */
  readonly interval?: (
    zoneId: string,
    templateId: string,
    businessDate: string,
  ) => RequirementInterval | null;
}): CoverageCell[] {
  const cells: CoverageCell[] = [];
  const templates = new Set(input.rules.map((rule) => rule.templateId));
  for (const zoneId of input.zoneIds)
    for (const businessDate of input.dates)
      for (const templateId of templates) {
        const rows = effectiveRequirements(input.rules, zoneId, templateId, businessDate);
        if (rows.length === 0) continue;
        const required = input.interval?.(zoneId, templateId, businessDate) ?? null;
        const people = [
          ...new Set(
            input.assignments
              .filter(
                (item) =>
                  item.zoneId === zoneId &&
                  item.templateId === templateId &&
                  item.businessDate === businessDate &&
                  (required === null ||
                    item.startMs === undefined ||
                    item.endMs === undefined ||
                    (item.startMs <= required.startMs && item.endMs >= required.endMs)),
              )
              .map((item) => item.employeeId),
          ),
        ];
        const taken = new Set<string>();
        for (const rule of rows) {
          const eligible = people.filter(
            (employeeId) =>
              !taken.has(employeeId) &&
              (rule.qualificationId === null ||
                holdsQualification(input.holdings, employeeId, rule.qualificationId, businessDate)),
          );
          const counted = eligible.slice(0, rule.requiredCount);
          for (const employeeId of counted) taken.add(employeeId);
          const missing = Math.max(0, rule.requiredCount - counted.length);
          cells.push({
            zoneId,
            businessDate,
            templateId,
            requirementId: rule.id,
            qualificationId: rule.qualificationId,
            required: rule.requiredCount,
            eligible: counted.length,
            missing,
            status: missing > 0 ? 'SHORT' : 'COVERED',
          });
        }
      }
  return cells;
}

/** Whether a zone has any requirement in force on at least one of the dates. */
export function zoneHasRequirement(
  rules: readonly StaffingRequirementRule[],
  zoneId: string,
  dates: readonly string[],
): boolean {
  return rules.some(
    (rule) =>
      rule.zoneId === zoneId &&
      dates.some((date) => activeOn(rule.effectiveFrom, rule.effectiveTo, date)),
  );
}
