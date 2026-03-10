/** Job completion checklist: service-aware profiles. */

export interface ChecklistSection {
  title: string;
  items: string[];
}

const BEFORE_STARTING_ITEMS = [
  'Vehicle matches booking (make/model/color)',
  'Customer present or access confirmed',
  'Pre-existing damage documented',
];

const EXTERIOR_ITEMS = [
  'Exterior hand wash complete',
  'Wheels and rims cleaned',
  'Tire shine applied',
  'Exterior windows cleaned streak-free',
  'Hand dried with microfiber',
];

const INTERIOR_ITEMS = [
  'Seats vacuumed',
  'Carpets and trunk vacuumed',
  'Dashboard and console wiped',
  'Door panels wiped',
  'Interior windows cleaned',
];

const WRAP_UP_ITEMS = [
  'Vehicle inspected for quality',
  'Area cleaned up',
  'Customer notified',
];

/** EXTERIOR ONLY: service name includes "exterior" or "wash" */
export const CHECKLIST_EXTERIOR_ONLY: ChecklistSection[] = [
  { title: 'BEFORE STARTING', items: BEFORE_STARTING_ITEMS },
  { title: 'EXTERIOR', items: EXTERIOR_ITEMS },
  { title: 'WRAP UP', items: WRAP_UP_ITEMS },
];

/** INTERIOR ONLY: service name includes "interior" */
export const CHECKLIST_INTERIOR_ONLY: ChecklistSection[] = [
  { title: 'BEFORE STARTING', items: BEFORE_STARTING_ITEMS },
  { title: 'INTERIOR', items: INTERIOR_ITEMS },
  { title: 'WRAP UP', items: WRAP_UP_ITEMS },
];

/** FULL DETAIL: default, all sections */
export const CHECKLIST_FULL_DETAIL: ChecklistSection[] = [
  { title: 'BEFORE STARTING', items: BEFORE_STARTING_ITEMS },
  { title: 'EXTERIOR', items: EXTERIOR_ITEMS },
  { title: 'INTERIOR', items: INTERIOR_ITEMS },
  { title: 'WRAP UP', items: WRAP_UP_ITEMS },
];

/**
 * Returns the checklist profile for the given service name.
 * Match by lowercasing and checking for "exterior", "wash", or "interior". Default: full detail.
 */
export function getChecklistForService(serviceName: string): ChecklistSection[] {
  const lower = (serviceName ?? '').toLowerCase();
  if (lower.includes('exterior') || lower.includes('wash')) {
    return CHECKLIST_EXTERIOR_ONLY;
  }
  if (lower.includes('interior')) {
    return CHECKLIST_INTERIOR_ONLY;
  }
  return CHECKLIST_FULL_DETAIL;
}

/** Legacy export: full-detail sections (for admin display). */
export const JOB_CHECKLIST_SECTIONS = CHECKLIST_FULL_DETAIL;

/** All item labels in order for full detail (for progress total / completed_items when using full list). */
export const JOB_CHECKLIST_ALL_ITEMS: string[] = CHECKLIST_FULL_DETAIL.flatMap((s) => s.items);

export const JOB_CHECKLIST_TOTAL = JOB_CHECKLIST_ALL_ITEMS.length;
