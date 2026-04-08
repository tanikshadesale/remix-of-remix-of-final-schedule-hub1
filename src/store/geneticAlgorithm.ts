import type {
  Division, Subject, Faculty, Classroom, Lab, TimetableSlot,
  GenerationConfig, DayAvailability
} from './types';
import { DAYS, MORNING_BREAK_OPTIONS, LUNCH_BREAK_OPTIONS } from './types';

// ─── Constants ──────────────────────────────────────────────
const timeToMin = (t: string): number => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
const minToTime = (m: number): string =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

const SLOT_DURATION = 60;
const COLLEGE_START = timeToMin('08:15');
const PREFERRED_START = timeToMin('09:15');
const COLLEGE_END = timeToMin('17:30');
const MORNING_BREAK_DURATION = 15;
const LUNCH_BREAK_DURATION = 60;
const HARD_PENALTY = 100000;

// ─── Types ──────────────────────────────────────────────────
interface Gene {
  day: string;
  timeSlot: number; // minutes from midnight
  subjectId: string;
  divisionId: string;
  facultyId: string;
  classroomId?: string;
  labId?: string;
  type: 'theory' | 'lab' | 'mini_project' | 'honours';
  batch?: string;
  duration: number; // in slots (1 or 2)
}

interface BreakAssignment {
  divisionId: string;
  morningBreak: number;
  lunchBreak: number;
}

interface Chromosome {
  genes: Gene[];
  breaks: BreakAssignment[];
  fitness: number;
}

interface GAInput {
  divisions: Division[];
  subjects: Subject[];
  faculty: Faculty[];
  classrooms: Classroom[];
  labs: Lab[];
  config: GenerationConfig;
  departmentId: string;
}

// ─── Helpers ────────────────────────────────────────────────
function genesOverlap(a: Gene, b: Gene): boolean {
  if (a.day !== b.day) return false;
  const aEnd = a.timeSlot + a.duration * SLOT_DURATION;
  const bEnd = b.timeSlot + b.duration * SLOT_DURATION;
  return a.timeSlot < bEnd && b.timeSlot < aEnd;
}

function isDayAvailable(availability: DayAvailability[], day: string, timeStart: number, timeEnd: number): boolean {
  const dayAvail = availability.find(a => a.day === day);
  if (!dayAvail || !dayAvail.enabled) return false;
  return timeStart >= timeToMin(dayAvail.startTime) && timeEnd <= timeToMin(dayAvail.endTime);
}

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function generateBreaks(divisions: Division[], config: GenerationConfig): BreakAssignment[] {
  return divisions.map((div, i) => {
    if (config.enableFlexibleBreaks) {
      return {
        divisionId: div.id,
        morningBreak: timeToMin(MORNING_BREAK_OPTIONS[i % MORNING_BREAK_OPTIONS.length]),
        lunchBreak: timeToMin(LUNCH_BREAK_OPTIONS[i % LUNCH_BREAK_OPTIONS.length]),
      };
    }
    return {
      divisionId: div.id,
      morningBreak: timeToMin('10:15'),
      lunchBreak: timeToMin('12:30'),
    };
  });
}

function getAvailableSlots(morningBreak: number, lunchBreak: number, duration: number = 1): number[] {
  const slots: number[] = [];
  let current = COLLEGE_START;
  while (current + duration * SLOT_DURATION <= COLLEGE_END) {
    const slotEnd = current + duration * SLOT_DURATION;
    const mEnd = morningBreak + MORNING_BREAK_DURATION;
    const lEnd = lunchBreak + LUNCH_BREAK_DURATION;
    const overlapsBreak =
      (current < mEnd && slotEnd > morningBreak) ||
      (current < lEnd && slotEnd > lunchBreak);
    if (!overlapsBreak) slots.push(current);
    current += SLOT_DURATION;
  }
  return slots;
}

function getRequiredSlots(subject: Subject, config: GenerationConfig): { theory: number; lab: number; miniProject: number; honours: number } {
  if (subject.type === 'mini_project' && config.enableMiniProject) {
    return { theory: 0, lab: 0, miniProject: subject.miniProjectHours || 2, honours: 0 };
  }
  if (subject.type === 'honours' && config.enableHonours) {
    return { theory: 0, lab: 0, miniProject: 0, honours: subject.honoursLecturesPerWeek || 4 };
  }
  const theory = (subject.lectureType === 'theory' || subject.lectureType === 'theory_and_lab') ? 3 : 0;
  // STRICT: exactly 1 lab per subject per batch per week
  const lab = (subject.lectureType === 'lab' || subject.lectureType === 'theory_and_lab') ? 1 : 0;
  return { theory, lab, miniProject: 0, honours: 0 };
}

// ─── Occupancy tracker ──────────────────────────────────────
// Tracks ALL occupied minute-slots across all resources

interface OccupancyTracker {
  // "divisionId|day|minute" → { activityType, batches[] }
  // For a division+day+minute: either ALL labs (possibly multiple batches) or ONE theory — never both
  divisionSlots: Map<string, { type: 'theory' | 'lab' | 'mini_project' | 'honours'; batches: Set<string> }>;
  // "facultyId|day|minute"
  facultySlots: Set<string>;
  // "classroomId|day|minute"
  classroomSlots: Set<string>;
  // "labId|day|minute"
  labSlots: Set<string>;
}

function createTracker(): OccupancyTracker {
  return {
    divisionSlots: new Map(),
    facultySlots: new Set(),
    classroomSlots: new Set(),
    labSlots: new Set(),
  };
}

function minuteKeys(id: string, day: string, start: number, duration: number): string[] {
  const keys: string[] = [];
  for (let i = 0; i < duration; i++) {
    keys.push(`${id}|${day}|${start + i * SLOT_DURATION}`);
  }
  return keys;
}

function canPlace(tracker: OccupancyTracker, gene: Gene, input: GAInput): boolean {
  const dur = gene.duration;
  const isLabType = gene.type === 'lab' || gene.type === 'mini_project';

  // 1. Division-level: STRICT — at any minute, either all labs (different batches, max batchCount) OR one theory, never mixed
  const div = input.divisions.find(d => d.id === gene.divisionId);
  const maxBatches = div?.batchCount || 4;
  for (let i = 0; i < dur; i++) {
    const key = `${gene.divisionId}|${gene.day}|${gene.timeSlot + i * SLOT_DURATION}`;
    const existing = tracker.divisionSlots.get(key);
    if (existing) {
      // If existing is lab-type and new is lab-type with different batch and under max → OK
      const existingIsLab = existing.type === 'lab' || existing.type === 'mini_project';
      if (isLabType && existingIsLab && gene.batch && !existing.batches.has(gene.batch) && existing.batches.size < maxBatches) {
        continue;
      }
      // Everything else is a clash (theory+theory, theory+lab, lab+theory, same batch lab, over max batches)
      return false;
    }
  }

  // 2. Faculty clash — one faculty per slot globally
  if (gene.facultyId) {
    for (const k of minuteKeys(gene.facultyId, gene.day, gene.timeSlot, dur)) {
      if (tracker.facultySlots.has(k)) return false;
    }
    // Faculty availability
    const fac = input.faculty.find(f => f.id === gene.facultyId);
    if (fac && !isDayAvailable(fac.availability, gene.day, gene.timeSlot, gene.timeSlot + dur * SLOT_DURATION)) {
      return false;
    }
  }

  // 3. Classroom clash
  if (gene.classroomId) {
    for (const k of minuteKeys(gene.classroomId, gene.day, gene.timeSlot, dur)) {
      if (tracker.classroomSlots.has(k)) return false;
    }
    const room = input.classrooms.find(c => c.id === gene.classroomId);
    if (room && !isDayAvailable(room.availability, gene.day, gene.timeSlot, gene.timeSlot + dur * SLOT_DURATION)) {
      return false;
    }
  }

  // 4. Lab room clash
  if (gene.labId) {
    for (const k of minuteKeys(gene.labId, gene.day, gene.timeSlot, dur)) {
      if (tracker.labSlots.has(k)) return false;
    }
    const lab = input.labs.find(l => l.id === gene.labId);
    if (lab && !isDayAvailable(lab.availability, gene.day, gene.timeSlot, gene.timeSlot + dur * SLOT_DURATION)) {
      return false;
    }
  }

  return true;
}

function markOccupied(tracker: OccupancyTracker, gene: Gene) {
  const dur = gene.duration;
  const isLabType = gene.type === 'lab' || gene.type === 'mini_project';

  for (let i = 0; i < dur; i++) {
    const minute = gene.timeSlot + i * SLOT_DURATION;
    const divKey = `${gene.divisionId}|${gene.day}|${minute}`;
    const existing = tracker.divisionSlots.get(divKey);
    if (existing && isLabType && gene.batch) {
      // Add batch to existing lab slot
      existing.batches.add(gene.batch);
    } else {
      tracker.divisionSlots.set(divKey, {
        type: gene.type,
        batches: new Set(gene.batch ? [gene.batch] : []),
      });
    }
  }
  if (gene.facultyId) {
    for (const k of minuteKeys(gene.facultyId, gene.day, gene.timeSlot, dur)) {
      tracker.facultySlots.add(k);
    }
  }
  if (gene.classroomId) {
    for (const k of minuteKeys(gene.classroomId, gene.day, gene.timeSlot, dur)) {
      tracker.classroomSlots.add(k);
    }
  }
  if (gene.labId) {
    for (const k of minuteKeys(gene.labId, gene.day, gene.timeSlot, dur)) {
      tracker.labSlots.add(k);
    }
  }
}

// ─── Chromosome creation (constraint-aware, labs first) ─────

function createChromosome(input: GAInput): Chromosome {
  const { divisions, subjects, faculty, classrooms, labs, config, departmentId } = input;
  const genes: Gene[] = [];
  const breaks = generateBreaks(divisions, config);
  const breaksMap = new Map(breaks.map(b => [b.divisionId, b]));
  const tracker = createTracker();

  // Track used minutes per division per day for compactness / gap avoidance
  const divDayUsed: Map<string, number[]> = new Map();
  const getDivDay = (divId: string, day: string) => {
    const key = `${divId}|${day}`;
    if (!divDayUsed.has(key)) divDayUsed.set(key, []);
    return divDayUsed.get(key)!;
  };
  const markDivDay = (divId: string, day: string, start: number, dur: number) => {
    const arr = getDivDay(divId, day);
    for (let i = 0; i < dur; i++) arr.push(start + i * SLOT_DURATION);
  };

  // Sort slots to prefer contiguous placement (no gaps)
  const getSortedSlots = (divId: string, day: string, duration: number, divBreak: BreakAssignment): number[] => {
    const available = getAvailableSlots(divBreak.morningBreak, divBreak.lunchBreak, duration);
    const used = getDivDay(divId, day);

    if (used.length === 0) {
      // Prefer 9:15 start
      return available.sort((a, b) => Math.abs(a - PREFERRED_START) - Math.abs(b - PREFERRED_START));
    }

    used.sort((a, b) => a - b);
    const lastEnd = Math.max(...used.map(s => s + SLOT_DURATION));
    const firstStart = Math.min(...used);

    // Prefer: right after last used → right before first used → closest to used block
    return available.sort((a, b) => {
      const aAfter = a === lastEnd ? 0 : (a > lastEnd ? a - lastEnd : 9999);
      const bAfter = b === lastEnd ? 0 : (b > lastEnd ? b - lastEnd : 9999);
      const aBefore = (a + duration * SLOT_DURATION === firstStart) ? 0 : (a < firstStart ? firstStart - a - duration * SLOT_DURATION : 9999);
      const bBefore = (b + duration * SLOT_DURATION === firstStart) ? 0 : (b < firstStart ? firstStart - b - duration * SLOT_DURATION : 9999);
      const aScore = Math.min(aAfter, aBefore);
      const bScore = Math.min(bAfter, bBefore);
      return aScore - bScore;
    });
  };

  // Try to place a gene with all resource combinations
  const tryPlace = (
    divId: string, day: string, subjectId: string, type: Gene['type'],
    duration: number, divBreak: BreakAssignment, batch?: string
  ): Gene | null => {
    const subj = subjects.find(s => s.id === subjectId);
    const eligibleFaculty = faculty.filter(f =>
      f.departmentId === departmentId &&
      f.subjects.some(s => subj && s.toLowerCase() === subj.name.toLowerCase())
    );
    const isLabType = type === 'lab' || type === 'mini_project';
    const deptClassrooms = classrooms.filter(c => !c.departmentId || c.departmentId === departmentId);
    const deptLabs = labs.filter(l => !l.departmentId || l.departmentId === departmentId);

    const sortedSlots = getSortedSlots(divId, day, duration, divBreak);

    for (const slot of sortedSlots) {
      for (const fac of shuffleArray(eligibleFaculty)) {
        const rooms = isLabType ? shuffleArray(deptLabs) : shuffleArray(deptClassrooms);
        for (const room of rooms) {
          const gene: Gene = {
            day, timeSlot: slot, subjectId, divisionId: divId,
            facultyId: fac.id,
            classroomId: isLabType ? undefined : room.id,
            labId: isLabType ? room.id : undefined,
            type, batch, duration,
          };
          if (canPlace(tracker, gene, input)) {
            markOccupied(tracker, gene);
            markDivDay(divId, day, slot, duration);
            return gene;
          }
        }
      }
    }
    return null;
  };

  for (const div of divisions) {
    const yearSubjects = subjects.filter(s => s.departmentId === departmentId && s.year === div.year);
    const divBreak = breaksMap.get(div.id)!;

    // ═══ STEP 1: LABS FIRST (need 2 continuous hours) ═══
    for (const subject of shuffleArray(yearSubjects)) {
      if (subject.type === 'mini_project' && !config.enableMiniProject) continue;
      if (subject.type === 'honours' && !config.enableHonours) continue;
      const required = getRequiredSlots(subject, config);

      // Labs — 1 per batch per subject per week
      for (let labIdx = 0; labIdx < required.lab; labIdx++) {
        // Try to place all batches on the SAME day & time slot (simultaneous labs)
        const days = shuffleArray([...DAYS]);
        let placedAllBatches = false;

        for (const day of days) {
          const batchGenes: Gene[] = [];
          const tempTracker = cloneTracker(tracker);
          const tempDivDay = [...getDivDay(div.id, day)];
          let allPlaced = true;

          for (let b = 1; b <= div.batchCount; b++) {
            const batchId = `B${b}`;
            const subj = subjects.find(s => s.id === subject.id);
            const eligibleFaculty = faculty.filter(f =>
              f.departmentId === departmentId &&
              f.subjects.some(s => subj && s.toLowerCase() === subj.name.toLowerCase())
            );
            const deptLabs = labs.filter(l => !l.departmentId || l.departmentId === departmentId);
            const sortedSlots = getSortedSlots(div.id, day, 2, divBreak);

            let placed = false;
            for (const slot of sortedSlots) {
              // For batch > 1, must use same time slot as batch 1
              if (batchGenes.length > 0 && slot !== batchGenes[0].timeSlot) continue;

              for (const fac of shuffleArray(eligibleFaculty)) {
                for (const labRoom of shuffleArray(deptLabs)) {
                  const gene: Gene = {
                    day, timeSlot: slot, subjectId: subject.id, divisionId: div.id,
                    facultyId: fac.id, labId: labRoom.id,
                    type: 'lab', batch: batchId, duration: 2,
                  };
                  if (canPlace(tempTracker, gene, input)) {
                    markOccupied(tempTracker, gene);
                    batchGenes.push(gene);
                    placed = true;
                    break;
                  }
                }
                if (placed) break;
              }
              if (placed) break;
            }
            if (!placed) { allPlaced = false; break; }
          }

          if (allPlaced) {
            // Commit all batch genes
            for (const g of batchGenes) {
              markOccupied(tracker, g);
              markDivDay(div.id, day, g.timeSlot, g.duration);
              genes.push(g);
            }
            placedAllBatches = true;
            break;
          }
        }

        // Fallback: place batches individually on different days
        if (!placedAllBatches) {
          for (let b = 1; b <= div.batchCount; b++) {
            const batchId = `B${b}`;
            let placed = false;
            for (const day of shuffleArray([...DAYS])) {
              const gene = tryPlace(div.id, day, subject.id, 'lab', 2, divBreak, batchId);
              if (gene) { genes.push(gene); placed = true; break; }
            }
            if (!placed) {
              // Force-place with penalty (will be caught by fitness)
              const day = randomChoice(DAYS);
              const slot = PREFERRED_START;
              genes.push({
                day, timeSlot: slot, subjectId: subject.id, divisionId: div.id,
                facultyId: '', labId: labs[0]?.id,
                type: 'lab', batch: batchId, duration: 2,
              });
            }
          }
        }
      }

      // Mini project
      if (required.miniProject > 0) {
        let placed = false;
        for (const day of shuffleArray([...DAYS])) {
          const gene = tryPlace(div.id, day, subject.id, 'mini_project', required.miniProject, divBreak);
          if (gene) { genes.push(gene); placed = true; break; }
        }
        if (!placed) {
          const day = randomChoice(DAYS);
          genes.push({
            day, timeSlot: PREFERRED_START, subjectId: subject.id, divisionId: div.id,
            facultyId: '', type: 'mini_project', duration: required.miniProject,
          });
        }
      }
    }

    // ═══ STEP 2: THEORY (after labs are placed) ═══
    for (const subject of shuffleArray(yearSubjects)) {
      if (subject.type === 'mini_project' || subject.type === 'honours') continue;
      const required = getRequiredSlots(subject, config);
      const usedDays = new Set<string>();

      for (let i = 0; i < required.theory; i++) {
        // Spread across different days
        const availDays = DAYS.filter(d => !usedDays.has(d));
        const daysToTry = shuffleArray(availDays.length > 0 ? availDays : [...DAYS]);
        let placed = false;

        for (const day of daysToTry) {
          const gene = tryPlace(div.id, day, subject.id, 'theory', 1, divBreak);
          if (gene) {
            genes.push(gene);
            usedDays.add(day);
            placed = true;
            break;
          }
        }
        if (!placed) {
          // Force-place (will be caught by fitness)
          const day = randomChoice(DAYS);
          const slot = PREFERRED_START;
          const fac = faculty.find(f => f.departmentId === departmentId && f.subjects.some(s => {
            const subj = subjects.find(sub => sub.id === subject.id);
            return subj && s.toLowerCase() === subj.name.toLowerCase();
          }));
          const room = classrooms.find(c => !c.departmentId || c.departmentId === departmentId);
          genes.push({
            day, timeSlot: slot, subjectId: subject.id, divisionId: div.id,
            facultyId: fac?.id || '', classroomId: room?.id,
            type: 'theory', duration: 1,
          });
        }
      }
    }

    // ═══ STEP 3: HONOURS (end of day for TE/BE) ═══
    for (const subject of yearSubjects) {
      if (subject.type !== 'honours' || !config.enableHonours) continue;
      const required = getRequiredSlots(subject, config);
      const teBeDivs = divisions.filter(d => d.year === 'TE' || d.year === 'BE');
      if (teBeDivs[0]?.id !== div.id) continue;

      const usedHDays = new Set<string>();
      for (let i = 0; i < required.honours; i++) {
        const availDays = DAYS.filter(d => !usedHDays.has(d));
        const day = availDays.length > 0 ? randomChoice(availDays) : randomChoice(DAYS);
        usedHDays.add(day);
        const lateSlots = [timeToMin('15:15'), timeToMin('16:15')];
        const slot = randomChoice(lateSlots);
        const room = classrooms.find(c => !c.departmentId || c.departmentId === departmentId);
        const fac = faculty.find(f => f.departmentId === departmentId && f.subjects.some(s => {
          const subj = subjects.find(sub => sub.id === subject.id);
          return subj && s.toLowerCase() === subj.name.toLowerCase();
        }));

        for (const tbeDiv of teBeDivs) {
          genes.push({
            day, timeSlot: slot, subjectId: subject.id, divisionId: tbeDiv.id,
            facultyId: fac?.id || '', classroomId: room?.id,
            type: 'honours', duration: 1,
          });
        }
      }
    }
  }

  return { genes, breaks, fitness: 0 };
}

function cloneTracker(t: OccupancyTracker): OccupancyTracker {
  const clone: OccupancyTracker = {
    divisionSlots: new Map(),
    facultySlots: new Set(t.facultySlots),
    classroomSlots: new Set(t.classroomSlots),
    labSlots: new Set(t.labSlots),
  };
  for (const [k, v] of t.divisionSlots) {
    clone.divisionSlots.set(k, { type: v.type, batches: new Set(v.batches) });
  }
  return clone;
}

// ─── Fitness function ───────────────────────────────────────

function evaluateFitness(chromosome: Chromosome, input: GAInput): number {
  let hardViolations = 0;
  let softPenalty = 0;
  const { genes, breaks } = chromosome;
  const { faculty: allFaculty, classrooms, labs: allLabs, subjects, config } = input;
  const breaksMap = new Map(breaks.map(b => [b.divisionId, b]));

  // Pre-group by division+day
  const divDayGenes: Map<string, Gene[]> = new Map();
  for (const g of genes) {
    const key = `${g.divisionId}|${g.day}`;
    if (!divDayGenes.has(key)) divDayGenes.set(key, []);
    divDayGenes.get(key)!.push(g);
  }

  // ═══ HARD CONSTRAINTS (optimized: group by day to reduce comparisons) ═══

  const dayGenes: Map<string, Gene[]> = new Map();
  for (const g of genes) {
    if (!dayGenes.has(g.day)) dayGenes.set(g.day, []);
    dayGenes.get(g.day)!.push(g);
  }

  for (const [, dGenes] of dayGenes) {
    for (let i = 0; i < dGenes.length; i++) {
      const g1 = dGenes[i];
      for (let j = i + 1; j < dGenes.length; j++) {
        const g2 = dGenes[j];
        if (!genesOverlap(g1, g2)) continue;

        if (g1.facultyId && g1.facultyId === g2.facultyId) hardViolations++;

        if (g1.divisionId === g2.divisionId) {
          const g1IsLab = g1.type === 'lab' || g1.type === 'mini_project';
          const g2IsLab = g2.type === 'lab' || g2.type === 'mini_project';
          if (g1IsLab && g2IsLab && g1.batch !== g2.batch) {
            const div = input.divisions.find(d => d.id === g1.divisionId);
            const maxBatches = div?.batchCount || 4;
            const sameDivSlotGenes = dGenes.filter(g =>
              g.divisionId === g1.divisionId && genesOverlap(g1, g) && (g.type === 'lab' || g.type === 'mini_project')
            );
            if (sameDivSlotGenes.length > maxBatches) hardViolations++;
          } else {
            hardViolations++;
          }
        }

        if (g1.classroomId && g1.classroomId === g2.classroomId) hardViolations++;
        if (g1.labId && g1.labId === g2.labId) hardViolations++;
      }
    }
  }

  // Per-gene checks (H5-H10)
  for (const g1 of genes) {
    if (g1.facultyId) {
      const fac = allFaculty.find(f => f.id === g1.facultyId);
      if (fac && !isDayAvailable(fac.availability, g1.day, g1.timeSlot, g1.timeSlot + g1.duration * SLOT_DURATION))
        hardViolations++;
    }
    if (g1.classroomId) {
      const room = classrooms.find(c => c.id === g1.classroomId);
      if (room && !isDayAvailable(room.availability, g1.day, g1.timeSlot, g1.timeSlot + g1.duration * SLOT_DURATION))
        hardViolations++;
    }
    if (g1.labId) {
      const lab = allLabs.find(l => l.id === g1.labId);
      if (lab && !isDayAvailable(lab.availability, g1.day, g1.timeSlot, g1.timeSlot + g1.duration * SLOT_DURATION))
        hardViolations++;
    }
    if (g1.type === 'lab' && g1.duration !== 2) hardViolations++;
    if (!g1.facultyId) hardViolations++;
    if ((g1.type === 'theory' || g1.type === 'honours') && !g1.classroomId) hardViolations++;
    if ((g1.type === 'lab' || g1.type === 'mini_project') && !g1.labId) hardViolations++;
  }

  // H11: Completeness
  for (const div of input.divisions) {
    const divGenes = genes.filter(g => g.divisionId === div.id);
    const yearSubjects = subjects.filter(s => s.departmentId === input.departmentId && s.year === div.year);

    for (const subject of yearSubjects) {
      if (subject.type === 'mini_project' || subject.type === 'honours') continue;
      const required = getRequiredSlots(subject, config);

      const theoryCount = divGenes.filter(g => g.subjectId === subject.id && g.type === 'theory').length;
      if (theoryCount !== required.theory) hardViolations += Math.abs(theoryCount - required.theory);

      if (required.lab > 0) {
        for (let b = 1; b <= div.batchCount; b++) {
          const labCount = divGenes.filter(g => g.subjectId === subject.id && g.type === 'lab' && g.batch === `B${b}`).length;
          if (labCount !== required.lab) hardViolations += Math.abs(labCount - required.lab);
        }
      }
    }
  }

  if (hardViolations > 0) return -(hardViolations * HARD_PENALTY);

  // ═══ SOFT CONSTRAINTS ═══

  // S1: Gap penalty — continuous timetable (no empty slots between lectures)
  for (const [, dayGenes] of divDayGenes) {
    const sorted = dayGenes
      .filter(g => g.type !== 'honours')
      .sort((a, b) => a.timeSlot - b.timeSlot);
    if (sorted.length < 2) continue;

    const divId = sorted[0].divisionId;
    const divBreak = breaksMap.get(divId);

    // Deduplicate by time slot (multiple lab batches at same time)
    const uniqueSlots: { start: number; end: number }[] = [];
    for (const g of sorted) {
      const end = g.timeSlot + g.duration * SLOT_DURATION;
      const exists = uniqueSlots.find(s => s.start === g.timeSlot && s.end === end);
      if (!exists) uniqueSlots.push({ start: g.timeSlot, end });
    }
    uniqueSlots.sort((a, b) => a.start - b.start);

    for (let i = 1; i < uniqueSlots.length; i++) {
      const prevEnd = uniqueSlots[i - 1].end;
      const currStart = uniqueSlots[i].start;
      const gap = currStart - prevEnd;
      if (gap > 0) {
        let isBreak = false;
        if (divBreak) {
          const mEnd = divBreak.morningBreak + MORNING_BREAK_DURATION;
          const lEnd = divBreak.lunchBreak + LUNCH_BREAK_DURATION;
          if (prevEnd <= divBreak.morningBreak && currStart >= mEnd) isBreak = true;
          if (prevEnd <= divBreak.lunchBreak && currStart >= lEnd) isBreak = true;
        }
        if (!isBreak) softPenalty += 100 * Math.ceil(gap / SLOT_DURATION); // Heavy gap penalty
      }
    }
  }

  // S2: Start time preference — prefer 9:15
  for (const [, dayGenes] of divDayGenes) {
    if (dayGenes.length === 0) continue;
    const earliest = Math.min(...dayGenes.map(g => g.timeSlot));
    if (earliest < PREFERRED_START) softPenalty += 20;
  }

  // S3: Same subject twice on same day for same division (theory)
  for (const [, dayGenes] of divDayGenes) {
    const subjectCounts: Record<string, number> = {};
    for (const g of dayGenes) {
      if (g.type === 'theory') {
        subjectCounts[g.subjectId] = (subjectCounts[g.subjectId] || 0) + 1;
      }
    }
    for (const count of Object.values(subjectCounts)) {
      if (count > 1) softPenalty += 30 * (count - 1);
    }
  }

  // S4: Faculty max lectures per day
  const facultyDayCount: Record<string, Record<string, number>> = {};
  for (const g of genes) {
    if (!g.facultyId) continue;
    if (!facultyDayCount[g.facultyId]) facultyDayCount[g.facultyId] = {};
    if (!facultyDayCount[g.facultyId][g.day]) facultyDayCount[g.facultyId][g.day] = 0;
    facultyDayCount[g.facultyId][g.day] += g.duration;
  }
  for (const fId of Object.keys(facultyDayCount)) {
    const fac = allFaculty.find(f => f.id === fId);
    if (fac?.maxLecturesPerDay) {
      for (const day of Object.keys(facultyDayCount[fId])) {
        if (facultyDayCount[fId][day] > fac.maxLecturesPerDay) {
          softPenalty += 30 * (facultyDayCount[fId][day] - fac.maxLecturesPerDay);
        }
      }
    }
  }

  // S5: Honours not at end of day
  for (const g of genes) {
    if (g.type === 'honours' && g.timeSlot < timeToMin('15:15')) softPenalty += 15;
  }

  // S6: Balanced distribution across days
  for (const div of input.divisions) {
    const dayCounts: Record<string, number> = {};
    for (const day of DAYS) dayCounts[day] = 0;
    for (const g of genes) {
      if (g.divisionId === div.id && g.type === 'theory') dayCounts[g.day]++;
    }
    const counts = Object.values(dayCounts);
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
    for (const c of counts) softPenalty += Math.abs(c - avg) * 5;
  }

  return -softPenalty;
}

// ─── Crossover ──────────────────────────────────────────────

function crossover(parent1: Chromosome, parent2: Chromosome): Chromosome {
  const genes: Gene[] = [];
  const divisionGenes1 = new Map<string, Gene[]>();
  const divisionGenes2 = new Map<string, Gene[]>();

  for (const g of parent1.genes) {
    if (!divisionGenes1.has(g.divisionId)) divisionGenes1.set(g.divisionId, []);
    divisionGenes1.get(g.divisionId)!.push(g);
  }
  for (const g of parent2.genes) {
    if (!divisionGenes2.has(g.divisionId)) divisionGenes2.set(g.divisionId, []);
    divisionGenes2.get(g.divisionId)!.push(g);
  }

  const allDivs = new Set([...divisionGenes1.keys(), ...divisionGenes2.keys()]);
  for (const divId of allDivs) {
    if (Math.random() < 0.5 && divisionGenes1.has(divId)) {
      genes.push(...divisionGenes1.get(divId)!.map(g => ({ ...g })));
    } else if (divisionGenes2.has(divId)) {
      genes.push(...divisionGenes2.get(divId)!.map(g => ({ ...g })));
    } else if (divisionGenes1.has(divId)) {
      genes.push(...divisionGenes1.get(divId)!.map(g => ({ ...g })));
    }
  }

  const breaks = Math.random() < 0.5 ? [...parent1.breaks] : [...parent2.breaks];
  return { genes, breaks, fitness: 0 };
}

// ─── Mutation ───────────────────────────────────────────────

function mutate(chromosome: Chromosome, input: GAInput, mutationRate: number = 0.1): Chromosome {
  const genes = chromosome.genes.map(g => {
    if (Math.random() > mutationRate) return { ...g };

    const gene = { ...g };
    const breaksMap = new Map(chromosome.breaks.map(b => [b.divisionId, b]));
    const divBreak = breaksMap.get(gene.divisionId);

    const mutation = Math.random();
    if (mutation < 0.3) {
      gene.day = randomChoice(DAYS);
    } else if (mutation < 0.6) {
      const available = divBreak
        ? getAvailableSlots(divBreak.morningBreak, divBreak.lunchBreak, gene.duration)
        : [PREFERRED_START];
      if (available.length > 0) {
        // Weight towards preferred start
        const weights = available.map(s => 1 / (1 + Math.abs(s - PREFERRED_START) / SLOT_DURATION));
        const total = weights.reduce((a, b) => a + b, 0);
        let r = Math.random() * total;
        for (let i = 0; i < available.length; i++) {
          r -= weights[i];
          if (r <= 0) { gene.timeSlot = available[i]; break; }
        }
      }
    } else if (mutation < 0.8) {
      const eligibleFaculty = input.faculty.filter(f =>
        f.departmentId === input.departmentId &&
        f.subjects.some(s => {
          const subj = input.subjects.find(sub => sub.id === gene.subjectId);
          return subj && s.toLowerCase() === subj.name.toLowerCase();
        })
      );
      if (eligibleFaculty.length > 0) gene.facultyId = randomChoice(eligibleFaculty).id;
    } else {
      if (gene.type === 'theory' || gene.type === 'honours') {
        const rooms = input.classrooms.filter(c => !c.departmentId || c.departmentId === input.departmentId);
        if (rooms.length > 0) gene.classroomId = randomChoice(rooms).id;
      } else {
        const labRooms = input.labs.filter(l => !l.departmentId || l.departmentId === input.departmentId);
        if (labRooms.length > 0) gene.labId = randomChoice(labRooms).id;
      }
    }
    return gene;
  });

  const breaks = chromosome.breaks.map(b => {
    if (Math.random() > mutationRate * 2) return { ...b };
    return {
      ...b,
      morningBreak: timeToMin(randomChoice(MORNING_BREAK_OPTIONS)),
      lunchBreak: timeToMin(randomChoice(LUNCH_BREAK_OPTIONS)),
    };
  });

  return { genes, breaks, fitness: 0 };
}

// ─── Main generation function ───────────────────────────────

export function generateMasterTimetable(input: GAInput): {
  divisionTimetables: Record<string, TimetableSlot[]>;
  facultyTimetables: Record<string, TimetableSlot[]>;
  breakSchedule: Record<string, { morningBreak: string; lunchBreak: string }>;
} {
  const POPULATION_SIZE = 50;
  const GENERATIONS = 300;
  const ELITE_COUNT = 8;
  const MUTATION_RATE = 0.12;
  const MAX_RETRIES = 5;

  let bestOverall: Chromosome | null = null;

  for (let retry = 0; retry < MAX_RETRIES; retry++) {
    let population: Chromosome[] = [];
    for (let i = 0; i < POPULATION_SIZE; i++) {
      const c = createChromosome(input);
      c.fitness = evaluateFitness(c, input);
      population.push(c);
    }

    for (let gen = 0; gen < GENERATIONS; gen++) {
      population.sort((a, b) => b.fitness - a.fitness);

      // Perfect solution found
      if (population[0].fitness === 0) break;

      const newPopulation: Chromosome[] = [];
      for (let i = 0; i < ELITE_COUNT; i++) {
        newPopulation.push(population[i]);
      }

      const bestFit = population[0].fitness;
      const hasHardViolations = bestFit <= -HARD_PENALTY;
      const adaptiveMutation = hasHardViolations ? MUTATION_RATE * 2.5 : MUTATION_RATE;

      while (newPopulation.length < POPULATION_SIZE) {
        // Inject fresh constraint-aware chromosomes more aggressively
        if (hasHardViolations && Math.random() < 0.4) {
          const fresh = createChromosome(input);
          fresh.fitness = evaluateFitness(fresh, input);
          newPopulation.push(fresh);
          continue;
        }

        const p1Idx = Math.floor(Math.random() * Math.min(15, population.length));
        const p2Idx = Math.floor(Math.random() * Math.min(15, population.length));
        const parent1 = population[p1Idx];
        const parent2 = population[p2Idx];

        let child = crossover(parent1, parent2);
        child = mutate(child, input, adaptiveMutation);
        child.fitness = evaluateFitness(child, input);
        newPopulation.push(child);
      }

      population = newPopulation.slice(0, POPULATION_SIZE);
    }

    population.sort((a, b) => b.fitness - a.fitness);
    const best = population[0];

    if (!bestOverall || best.fitness > bestOverall.fitness) {
      bestOverall = best;
    }

    if (best.fitness > -HARD_PENALTY) break;
  }

  const best = bestOverall!;

  // ═══ REJECT invalid timetable ═══
  if (best.fitness <= -HARD_PENALTY) {
    console.error('⚠️ Timetable has hard constraint violations. Fitness:', best.fitness);
    // Still return it but mark conflicts
  }

  // Convert genes to TimetableSlots
  const divisionTimetables: Record<string, TimetableSlot[]> = {};
  const facultyTimetables: Record<string, TimetableSlot[]> = {};

  // Detect actual clashes for conflict marking
  const clashSet = new Set<number>();
  for (let i = 0; i < best.genes.length; i++) {
    for (let j = i + 1; j < best.genes.length; j++) {
      if (!genesOverlap(best.genes[i], best.genes[j])) continue;
      const g1 = best.genes[i], g2 = best.genes[j];
      if (g1.facultyId && g1.facultyId === g2.facultyId) { clashSet.add(i); clashSet.add(j); }
      if (g1.divisionId === g2.divisionId) {
        const bothLab = (g1.type === 'lab') && (g2.type === 'lab');
        if (!(bothLab && g1.batch !== g2.batch)) { clashSet.add(i); clashSet.add(j); }
      }
      if (g1.classroomId && g1.classroomId === g2.classroomId) { clashSet.add(i); clashSet.add(j); }
      if (g1.labId && g1.labId === g2.labId) { clashSet.add(i); clashSet.add(j); }
    }
  }

  for (let idx = 0; idx < best.genes.length; idx++) {
    const gene = best.genes[idx];
    const subject = input.subjects.find(s => s.id === gene.subjectId);
    const fac = input.faculty.find(f => f.id === gene.facultyId);
    const division = input.divisions.find(d => d.id === gene.divisionId);
    const classroom = input.classrooms.find(c => c.id === gene.classroomId);
    const lab = input.labs.find(l => l.id === gene.labId);

    const slot: TimetableSlot = {
      id: crypto.randomUUID(),
      day: gene.day,
      startTime: minToTime(gene.timeSlot),
      endTime: minToTime(gene.timeSlot + gene.duration * SLOT_DURATION),
      subjectId: gene.subjectId,
      subjectName: subject?.name || '',
      facultyId: gene.facultyId || undefined,
      facultyName: fac?.name,
      classroomId: gene.classroomId,
      classroomNumber: classroom?.number,
      labId: gene.labId,
      labName: lab?.name,
      divisionId: gene.divisionId,
      divisionName: division?.name || '',
      type: gene.type,
      batch: gene.batch,
      conflict: clashSet.has(idx),
    };

    if (!divisionTimetables[gene.divisionId]) divisionTimetables[gene.divisionId] = [];
    divisionTimetables[gene.divisionId].push(slot);

    // For 2-hour blocks, add second slot entry
    if (gene.duration === 2) {
      divisionTimetables[gene.divisionId].push({
        ...slot,
        id: crypto.randomUUID(),
        startTime: minToTime(gene.timeSlot + SLOT_DURATION),
      });
    }

    if (gene.facultyId) {
      if (!facultyTimetables[gene.facultyId]) facultyTimetables[gene.facultyId] = [];
      facultyTimetables[gene.facultyId].push({ ...slot });
      if (gene.duration === 2) {
        facultyTimetables[gene.facultyId].push({
          ...slot,
          id: crypto.randomUUID(),
          startTime: minToTime(gene.timeSlot + SLOT_DURATION),
        });
      }
    }
  }

  // Add break slots
  const breakSchedule: Record<string, { morningBreak: string; lunchBreak: string }> = {};
  for (const b of best.breaks) {
    breakSchedule[b.divisionId] = {
      morningBreak: minToTime(b.morningBreak),
      lunchBreak: minToTime(b.lunchBreak),
    };
  }

  for (const divId of Object.keys(divisionTimetables)) {
    const brk = breakSchedule[divId];
    if (!brk) continue;
    for (const day of DAYS) {
      divisionTimetables[divId].push({
        id: crypto.randomUUID(),
        day,
        startTime: brk.morningBreak,
        endTime: minToTime(timeToMin(brk.morningBreak) + MORNING_BREAK_DURATION),
        subjectId: '', subjectName: 'Short Break',
        divisionId: divId, divisionName: '',
        type: 'theory', isBreak: true, breakType: 'morning',
      });
      divisionTimetables[divId].push({
        id: crypto.randomUUID(),
        day,
        startTime: brk.lunchBreak,
        endTime: minToTime(timeToMin(brk.lunchBreak) + LUNCH_BREAK_DURATION),
        subjectId: '', subjectName: 'Lunch Break',
        divisionId: divId, divisionName: '',
        type: 'theory', isBreak: true, breakType: 'lunch',
      });
    }
  }

  return { divisionTimetables, facultyTimetables, breakSchedule };
}
