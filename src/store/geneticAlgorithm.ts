import type {
  Division, Subject, Faculty, Classroom, Lab, TimetableSlot,
  GenerationConfig, DayAvailability
} from './types';
import { DAYS, MORNING_BREAK_OPTIONS, LUNCH_BREAK_OPTIONS } from './types';

const timeToMin = (t: string): number => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
const minToTime = (m: number): string =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

const SLOT_DURATION = 60;
const LAB_SLOTS = 2;
const COLLEGE_START = timeToMin('08:15');
const PREFERRED_START = timeToMin('09:15');
const COLLEGE_END = timeToMin('17:30');
const MORNING_BREAK_DURATION = 15;
const LUNCH_BREAK_DURATION = 60;

// Hard constraint penalty — makes solution unacceptable
const HARD_PENALTY = 100000;

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
  const availStart = timeToMin(dayAvail.startTime);
  const availEnd = timeToMin(dayAvail.endTime);
  return timeStart >= availStart && timeEnd <= availEnd;
}

function getAvailableSlots(
  morningBreak: number,
  lunchBreak: number,
  duration: number = 1
): number[] {
  const slots: number[] = [];
  let current = COLLEGE_START;
  while (current + duration * SLOT_DURATION <= COLLEGE_END) {
    const slotEnd = current + duration * SLOT_DURATION;
    const mBreakEnd = morningBreak + MORNING_BREAK_DURATION;
    const lBreakEnd = lunchBreak + LUNCH_BREAK_DURATION;
    const overlapsBreak =
      (current < mBreakEnd && slotEnd > morningBreak) ||
      (current < lBreakEnd && slotEnd > lunchBreak);
    if (!overlapsBreak) slots.push(current);
    current += SLOT_DURATION;
  }
  return slots;
}

function getPreferredSlots(morningBreak: number, lunchBreak: number, duration: number = 1): number[] {
  const slots = getAvailableSlots(morningBreak, lunchBreak, duration);
  return slots.sort((a, b) => Math.abs(a - PREFERRED_START) - Math.abs(b - PREFERRED_START));
}

function getRequiredSlots(subject: Subject, config: GenerationConfig): { theory: number; lab: number; miniProject: number; honours: number } {
  if (subject.type === 'mini_project' && config.enableMiniProject) {
    return { theory: 0, lab: 0, miniProject: subject.miniProjectHours || 2, honours: 0 };
  }
  if (subject.type === 'honours' && config.enableHonours) {
    return { theory: 0, lab: 0, miniProject: 0, honours: subject.honoursLecturesPerWeek || 4 };
  }
  const theory = (subject.lectureType === 'theory' || subject.lectureType === 'theory_and_lab') ? 3 : 0;
  const lab = (subject.lectureType === 'lab' || subject.lectureType === 'theory_and_lab') ? subject.labsPerWeek : 0;
  return { theory, lab, miniProject: 0, honours: 0 };
}

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function weightedRandomChoice<T>(arr: T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < arr.length; i++) {
    r -= weights[i];
    if (r <= 0) return arr[i];
  }
  return arr[arr.length - 1];
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

// ─── Occupancy tracker for clash-free chromosome creation ───

interface OccupancyTracker {
  // key: "divisionId|day|timeMinute" → activity type & batch
  divisionSlots: Map<string, { type: string; batch?: string }>;
  // key: "facultyId|day|timeMinute"
  facultySlots: Set<string>;
  // key: "classroomId|day|timeMinute"
  classroomSlots: Set<string>;
  // key: "labId|day|timeMinute"
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

function slotKeys(id: string, day: string, start: number, duration: number): string[] {
  const keys: string[] = [];
  for (let i = 0; i < duration; i++) {
    keys.push(`${id}|${day}|${start + i * SLOT_DURATION}`);
  }
  return keys;
}

function canPlace(
  tracker: OccupancyTracker,
  gene: Gene,
  input: GAInput
): boolean {
  const dur = gene.duration;

  // 1. Division-level: no other activity at this time for this division
  //    Exception: different batches can have labs at the same time
  for (let i = 0; i < dur; i++) {
    const key = `${gene.divisionId}|${gene.day}|${gene.timeSlot + i * SLOT_DURATION}`;
    const existing = tracker.divisionSlots.get(key);
    if (existing) {
      // Allow multiple lab batches for same division at same time
      if (gene.type === 'lab' && existing.type === 'lab' && gene.batch !== existing.batch) {
        continue;
      }
      return false; // HARD: class clash
    }
  }

  // 2. Faculty clash
  if (gene.facultyId) {
    for (const k of slotKeys(gene.facultyId, gene.day, gene.timeSlot, dur)) {
      if (tracker.facultySlots.has(k)) return false;
    }
  }

  // 3. Classroom clash
  if (gene.classroomId) {
    for (const k of slotKeys(gene.classroomId, gene.day, gene.timeSlot, dur)) {
      if (tracker.classroomSlots.has(k)) return false;
    }
  }

  // 4. Lab room clash
  if (gene.labId) {
    for (const k of slotKeys(gene.labId, gene.day, gene.timeSlot, dur)) {
      if (tracker.labSlots.has(k)) return false;
    }
  }

  // 5. Faculty availability
  if (gene.facultyId) {
    const fac = input.faculty.find(f => f.id === gene.facultyId);
    if (fac && !isDayAvailable(fac.availability, gene.day, gene.timeSlot, gene.timeSlot + dur * SLOT_DURATION)) {
      return false;
    }
  }

  // 6. Classroom availability
  if (gene.classroomId) {
    const room = input.classrooms.find(c => c.id === gene.classroomId);
    if (room && !isDayAvailable(room.availability, gene.day, gene.timeSlot, gene.timeSlot + dur * SLOT_DURATION)) {
      return false;
    }
  }

  // 7. Lab availability
  if (gene.labId) {
    const lab = input.labs.find(l => l.id === gene.labId);
    if (lab && !isDayAvailable(lab.availability, gene.day, gene.timeSlot, gene.timeSlot + dur * SLOT_DURATION)) {
      return false;
    }
  }

  return true;
}

function markOccupied(tracker: OccupancyTracker, gene: Gene) {
  const dur = gene.duration;
  for (let i = 0; i < dur; i++) {
    const minute = gene.timeSlot + i * SLOT_DURATION;
    const divKey = `${gene.divisionId}|${gene.day}|${minute}`;
    // For labs, we store per-batch; for theory we just block the slot
    tracker.divisionSlots.set(divKey, { type: gene.type, batch: gene.batch });
  }
  if (gene.facultyId) {
    for (const k of slotKeys(gene.facultyId, gene.day, gene.timeSlot, dur)) {
      tracker.facultySlots.add(k);
    }
  }
  if (gene.classroomId) {
    for (const k of slotKeys(gene.classroomId, gene.day, gene.timeSlot, dur)) {
      tracker.classroomSlots.add(k);
    }
  }
  if (gene.labId) {
    for (const k of slotKeys(gene.labId, gene.day, gene.timeSlot, dur)) {
      tracker.labSlots.add(k);
    }
  }
}

// ─── Chromosome creation (constraint-aware) ─────────────────

function createChromosome(input: GAInput): Chromosome {
  const { divisions, subjects, faculty, classrooms, labs, config, departmentId } = input;
  const genes: Gene[] = [];
  const breaks = generateBreaks(divisions, config);
  const breaksMap = new Map(breaks.map(b => [b.divisionId, b]));
  const tracker = createTracker();

  // Track used slots per division per day for compactness
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

  // Find next compact slot for a division on a day
  const pickCompactSlot = (divId: string, day: string, duration: number, divBreak: BreakAssignment): number => {
    const available = getPreferredSlots(divBreak.morningBreak, divBreak.lunchBreak, duration);
    const used = getDivDay(divId, day);

    if (used.length === 0) return available[0] || PREFERRED_START;

    used.sort((a, b) => a - b);
    const lastEnd = Math.max(...used.map(s => s + SLOT_DURATION));

    // Try contiguous after last
    const nextSlot = available.find(s => s === lastEnd);
    if (nextSlot !== undefined) return nextSlot;

    const afterSlot = available.find(s => s >= lastEnd);
    if (afterSlot !== undefined) return afterSlot;

    const firstStart = Math.min(...used);
    const beforeSlot = available.find(s => s + duration * SLOT_DURATION <= firstStart);
    if (beforeSlot !== undefined) return beforeSlot;

    return available.length > 0 ? available[0] : PREFERRED_START;
  };

  // Try to place a gene, attempting multiple slots/resources
  const tryPlace = (
    divId: string, day: string, subjectId: string, type: Gene['type'],
    duration: number, divBreak: BreakAssignment, batch?: string
  ): Gene | null => {
    const eligibleFaculty = faculty.filter(f =>
      f.departmentId === departmentId &&
      f.subjects.some(s => {
        const subj = subjects.find(sub => sub.id === subjectId);
        return subj && s.toLowerCase() === subj.name.toLowerCase();
      })
    );
    const deptClassrooms = classrooms.filter(c => !c.departmentId || c.departmentId === departmentId);
    const deptLabs = labs.filter(l => !l.departmentId || l.departmentId === departmentId);

    const available = getAvailableSlots(divBreak.morningBreak, divBreak.lunchBreak, duration);
    // Sort by compactness preference
    const used = getDivDay(divId, day);
    const sorted = [...available].sort((a, b) => {
      if (used.length === 0) return Math.abs(a - PREFERRED_START) - Math.abs(b - PREFERRED_START);
      const lastEnd = Math.max(...used.map(s => s + SLOT_DURATION));
      // Prefer slot right after last used
      const aDist = a === lastEnd ? 0 : Math.abs(a - lastEnd);
      const bDist = b === lastEnd ? 0 : Math.abs(b - lastEnd);
      return aDist - bDist;
    });

    for (const slot of sorted) {
      const shuffledFaculty = shuffleArray(eligibleFaculty);
      const shuffledRooms = type === 'lab' || type === 'mini_project'
        ? shuffleArray(deptLabs)
        : shuffleArray(deptClassrooms);

      for (const fac of shuffledFaculty.length > 0 ? shuffledFaculty : [null]) {
        for (const room of shuffledRooms.length > 0 ? shuffledRooms : [null]) {
          const gene: Gene = {
            day, timeSlot: slot, subjectId, divisionId: divId,
            facultyId: fac?.id || '',
            classroomId: (type === 'theory' || type === 'honours') ? room?.id : undefined,
            labId: (type === 'lab' || type === 'mini_project') ? room?.id : undefined,
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

    // *** LAB FIRST: Allocate labs before theory (they need continuous slots) ***
    for (const subject of shuffleArray(yearSubjects)) {
      if (subject.type === 'mini_project' && !config.enableMiniProject) continue;
      if (subject.type === 'honours' && !config.enableHonours) continue;

      const required = getRequiredSlots(subject, config);

      // Labs
      for (let labIdx = 0; labIdx < required.lab; labIdx++) {
        for (let b = 1; b <= div.batchCount; b++) {
          const days = shuffleArray([...DAYS]);
          let placed = false;
          for (const day of days) {
            const gene = tryPlace(div.id, day, subject.id, 'lab', 2, divBreak, `B${b}`);
            if (gene) { genes.push(gene); placed = true; break; }
          }
          // If couldn't place, add anyway with random slot (will get penalized in fitness)
          if (!placed) {
            const day = randomChoice(DAYS);
            const slot = pickCompactSlot(div.id, day, 2, divBreak);
            const fac = faculty.find(f => f.departmentId === departmentId && f.subjects.some(s => {
              const subj = subjects.find(sub => sub.id === subject.id);
              return subj && s.toLowerCase() === subj.name.toLowerCase();
            }));
            const labRoom = labs.find(l => !l.departmentId || l.departmentId === departmentId);
            genes.push({
              day, timeSlot: slot, subjectId: subject.id, divisionId: div.id,
              facultyId: fac?.id || '', labId: labRoom?.id,
              type: 'lab', batch: `B${b}`, duration: 2,
            });
          }
        }
      }

      // Mini project
      if (required.miniProject > 0) {
        const days = shuffleArray([...DAYS]);
        let placed = false;
        for (const day of days) {
          const gene = tryPlace(div.id, day, subject.id, 'mini_project', required.miniProject, divBreak);
          if (gene) { genes.push(gene); placed = true; break; }
        }
        if (!placed) {
          const day = randomChoice(DAYS);
          const slot = pickCompactSlot(div.id, day, required.miniProject, divBreak);
          genes.push({
            day, timeSlot: slot, subjectId: subject.id, divisionId: div.id,
            facultyId: '', type: 'mini_project', duration: required.miniProject,
          });
        }
      }
    }

    // *** THEORY SECOND: After labs are placed ***
    for (const subject of shuffleArray(yearSubjects)) {
      if (subject.type === 'mini_project' || subject.type === 'honours') continue;

      const required = getRequiredSlots(subject, config);
      const theoryDays = shuffleArray([...DAYS]);
      const usedDays = new Set<string>();

      for (let i = 0; i < required.theory; i++) {
        // Try to spread across different days
        const availDays = theoryDays.filter(d => !usedDays.has(d));
        const daysToTry = availDays.length > 0 ? availDays : shuffleArray([...DAYS]);
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
          // Fallback: place anyway
          const day = randomChoice(DAYS);
          const slot = pickCompactSlot(div.id, day, 1, divBreak);
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

    // Honours — schedule at end of day for combined TE/BE
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
          const gene: Gene = {
            day, timeSlot: slot, subjectId: subject.id, divisionId: tbeDiv.id,
            facultyId: fac?.id || '', classroomId: room?.id,
            type: 'honours', duration: 1,
          };
          genes.push(gene);
        }
      }
    }
  }

  return { genes, breaks, fitness: 0 };
}

// ─── Fitness function with HARD constraints ──────────────────

function evaluateFitness(chromosome: Chromosome, input: GAInput): number {
  let hardViolations = 0;
  let softPenalty = 0;
  const { genes, breaks } = chromosome;
  const { faculty, classrooms, labs } = input;
  const breaksMap = new Map(breaks.map(b => [b.divisionId, b]));

  // Pre-group by division+day
  const divDayGenes: Map<string, Gene[]> = new Map();
  for (const g of genes) {
    const key = `${g.divisionId}|${g.day}`;
    if (!divDayGenes.has(key)) divDayGenes.set(key, []);
    divDayGenes.get(key)!.push(g);
  }

  // ═══ HARD CONSTRAINTS ═══
  for (let i = 0; i < genes.length; i++) {
    const g1 = genes[i];
    for (let j = i + 1; j < genes.length; j++) {
      const g2 = genes[j];
      if (!genesOverlap(g1, g2)) continue;

      // HARD 1: Faculty clash — same faculty, overlapping time
      if (g1.facultyId && g1.facultyId === g2.facultyId) {
        hardViolations++;
      }

      // HARD 2: Class-level conflict — same division, overlapping time
      if (g1.divisionId === g2.divisionId) {
        // Allow different lab batches at same time
        if (g1.type === 'lab' && g2.type === 'lab' && g1.batch !== g2.batch) {
          // OK: different batches can overlap
        } else {
          // ANY other combination is a hard violation
          hardViolations++;
        }
      }

      // HARD 3: Classroom clash — same room, overlapping time
      if (g1.classroomId && g1.classroomId === g2.classroomId) {
        hardViolations++;
      }

      // HARD 4: Lab room clash — same lab, overlapping time
      if (g1.labId && g1.labId === g2.labId) {
        hardViolations++;
      }
    }

    // HARD 5: Faculty availability
    if (g1.facultyId) {
      const fac = faculty.find(f => f.id === g1.facultyId);
      if (fac && !isDayAvailable(fac.availability, g1.day, g1.timeSlot, g1.timeSlot + g1.duration * SLOT_DURATION)) {
        hardViolations++;
      }
    }

    // HARD 6: Classroom availability
    if (g1.classroomId) {
      const room = classrooms.find(c => c.id === g1.classroomId);
      if (room && !isDayAvailable(room.availability, g1.day, g1.timeSlot, g1.timeSlot + g1.duration * SLOT_DURATION)) {
        hardViolations++;
      }
    }

    // HARD 7: Lab availability
    if (g1.labId) {
      const lab = labs.find(l => l.id === g1.labId);
      if (lab && !isDayAvailable(lab.availability, g1.day, g1.timeSlot, g1.timeSlot + g1.duration * SLOT_DURATION)) {
        hardViolations++;
      }
    }

    // HARD 8: Lab must be exactly 2 continuous hours
    if ((g1.type === 'lab') && g1.duration !== 2) {
      hardViolations++;
    }
  }

  // If ANY hard constraint is violated, return massive negative fitness
  if (hardViolations > 0) {
    return -(hardViolations * HARD_PENALTY);
  }

  // ═══ SOFT CONSTRAINTS (optimize) ═══

  // S1: Gap penalty — no empty slots between lectures
  for (const [, dayGenes] of divDayGenes) {
    const sorted = dayGenes
      .filter(g => g.type !== 'honours')
      .sort((a, b) => a.timeSlot - b.timeSlot);
    if (sorted.length < 2) continue;

    const divId = sorted[0].divisionId;
    const divBreak = breaksMap.get(divId);

    for (let i = 1; i < sorted.length; i++) {
      const prevEnd = sorted[i - 1].timeSlot + sorted[i - 1].duration * SLOT_DURATION;
      const currStart = sorted[i].timeSlot;
      const gap = currStart - prevEnd;
      if (gap > 0) {
        let isBreak = false;
        if (divBreak) {
          const mEnd = divBreak.morningBreak + MORNING_BREAK_DURATION;
          const lEnd = divBreak.lunchBreak + LUNCH_BREAK_DURATION;
          if (prevEnd <= divBreak.morningBreak && currStart >= mEnd) isBreak = true;
          if (prevEnd <= divBreak.lunchBreak && currStart >= lEnd) isBreak = true;
        }
        if (!isBreak) {
          softPenalty += 50 * Math.ceil(gap / SLOT_DURATION);
        }
      }
    }
  }

  // S2: Start time preference — prefer 9:15
  for (const [, dayGenes] of divDayGenes) {
    if (dayGenes.length === 0) continue;
    const earliest = Math.min(...dayGenes.map(g => g.timeSlot));
    if (earliest < PREFERRED_START) softPenalty += 15;
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
      if (count > 1) softPenalty += 25 * (count - 1);
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
    const fac = faculty.find(f => f.id === fId);
    if (fac?.maxLecturesPerDay) {
      for (const day of Object.keys(facultyDayCount[fId])) {
        if (facultyDayCount[fId][day] > fac.maxLecturesPerDay) {
          softPenalty += 30 * (facultyDayCount[fId][day] - fac.maxLecturesPerDay);
        }
      }
    }
  }

  // S5: Too many consecutive theory (>3)
  for (const div of input.divisions) {
    for (const day of DAYS) {
      const key = `${div.id}|${day}`;
      const dayGenes = (divDayGenes.get(key) || [])
        .filter(g => g.type === 'theory')
        .sort((a, b) => a.timeSlot - b.timeSlot);
      let consecutive = 1;
      for (let i = 1; i < dayGenes.length; i++) {
        if (dayGenes[i].timeSlot === dayGenes[i - 1].timeSlot + SLOT_DURATION) {
          consecutive++;
          if (consecutive > 3) softPenalty += 10;
        } else {
          consecutive = 1;
        }
      }
    }
  }

  // S6: Honours not at end of day
  for (const g of genes) {
    if (g.type === 'honours' && g.timeSlot < timeToMin('15:15')) {
      softPenalty += 15;
    }
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
        ? getPreferredSlots(divBreak.morningBreak, divBreak.lunchBreak, gene.duration)
        : [PREFERRED_START];
      if (available.length > 0) {
        const weights = available.map(s => 1 / (1 + Math.abs(s - PREFERRED_START) / SLOT_DURATION));
        gene.timeSlot = weightedRandomChoice(available, weights);
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
  const POPULATION_SIZE = 80;
  const GENERATIONS = 500;
  const ELITE_COUNT = 10;
  const MUTATION_RATE = 0.12;
  const MAX_RETRIES = 3;

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

      // Perfect solution found (no violations at all)
      if (population[0].fitness === 0) break;

      const newPopulation: Chromosome[] = [];
      // Elitism
      for (let i = 0; i < ELITE_COUNT; i++) {
        newPopulation.push(population[i]);
      }

      // Adaptive mutation: increase if stuck with hard violations
      const bestFit = population[0].fitness;
      const hasHardViolations = bestFit <= -HARD_PENALTY;
      const adaptiveMutation = hasHardViolations ? MUTATION_RATE * 2 : MUTATION_RATE;

      while (newPopulation.length < POPULATION_SIZE) {
        // Tournament selection
        const t1 = [randomChoice(population), randomChoice(population), randomChoice(population)];
        const t2 = [randomChoice(population), randomChoice(population), randomChoice(population)];
        const parent1 = t1.sort((a, b) => b.fitness - a.fitness)[0];
        const parent2 = t2.sort((a, b) => b.fitness - a.fitness)[0];

        let child = crossover(parent1, parent2);
        child = mutate(child, input, adaptiveMutation);
        child.fitness = evaluateFitness(child, input);
        newPopulation.push(child);

        // Inject fresh chromosomes if stuck
        if (hasHardViolations && Math.random() < 0.1) {
          const fresh = createChromosome(input);
          fresh.fitness = evaluateFitness(fresh, input);
          newPopulation.push(fresh);
        }
      }

      population = newPopulation.slice(0, POPULATION_SIZE);
    }

    population.sort((a, b) => b.fitness - a.fitness);
    const best = population[0];

    if (!bestOverall || best.fitness > bestOverall.fitness) {
      bestOverall = best;
    }

    // If we have a valid solution (no hard violations), stop retrying
    if (best.fitness > -HARD_PENALTY) break;
  }

  const best = bestOverall!;

  // Convert genes to TimetableSlots
  const divisionTimetables: Record<string, TimetableSlot[]> = {};
  const facultyTimetables: Record<string, TimetableSlot[]> = {};

  for (const gene of best.genes) {
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
    };

    if (!divisionTimetables[gene.divisionId]) divisionTimetables[gene.divisionId] = [];
    divisionTimetables[gene.divisionId].push(slot);

    // For 2-hour blocks, add second slot entry
    if (gene.duration === 2) {
      const slot2: TimetableSlot = {
        ...slot,
        id: crypto.randomUUID(),
        startTime: minToTime(gene.timeSlot + SLOT_DURATION),
      };
      divisionTimetables[gene.divisionId].push(slot2);
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
