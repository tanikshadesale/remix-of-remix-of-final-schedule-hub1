import type { TimetableSlot, Faculty, Classroom, Lab, DayAvailability } from '@/store/types';

const timeToMin = (t: string): number => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

export function isResourceAvailableAtTime(
  availability: DayAvailability[],
  day: string,
  startTime: string,
  endTime: string
): boolean {
  const dayAvail = availability.find(a => a.day === day);
  if (!dayAvail || !dayAvail.enabled) return false;
  const availStart = timeToMin(dayAvail.startTime);
  const availEnd = timeToMin(dayAvail.endTime);
  return timeToMin(startTime) >= availStart && timeToMin(endTime) <= availEnd;
}

export function getAvailableFaculty(
  allFaculty: Faculty[],
  departmentId: string,
  day: string,
  startTime: string,
  endTime: string,
  existingSlots: TimetableSlot[],
  excludeSlotId?: string
): Faculty[] {
  const deptFaculty = allFaculty.filter(f => f.departmentId === departmentId);
  return deptFaculty.filter(f => {
    if (!isResourceAvailableAtTime(f.availability, day, startTime, endTime)) return false;
    const busy = existingSlots.some(s =>
      s.id !== excludeSlotId &&
      s.day === day &&
      s.facultyId === f.id &&
      timesOverlap(s.startTime, s.endTime, startTime, endTime)
    );
    return !busy;
  });
}

export function getAvailableClassrooms(
  allClassrooms: Classroom[],
  departmentId: string,
  day: string,
  startTime: string,
  endTime: string,
  existingSlots: TimetableSlot[],
  excludeSlotId?: string
): Classroom[] {
  const deptClassrooms = allClassrooms.filter(c => !c.departmentId || c.departmentId === departmentId);
  return deptClassrooms.filter(c => {
    if (!isResourceAvailableAtTime(c.availability, day, startTime, endTime)) return false;
    const busy = existingSlots.some(s =>
      s.id !== excludeSlotId &&
      s.day === day &&
      s.classroomId === c.id &&
      timesOverlap(s.startTime, s.endTime, startTime, endTime)
    );
    return !busy;
  });
}

export function getAvailableLabs(
  allLabs: Lab[],
  departmentId: string,
  day: string,
  startTime: string,
  endTime: string,
  existingSlots: TimetableSlot[],
  excludeSlotId?: string
): Lab[] {
  const deptLabs = allLabs.filter(l => !l.departmentId || l.departmentId === departmentId);
  return deptLabs.filter(l => {
    if (!isResourceAvailableAtTime(l.availability, day, startTime, endTime)) return false;
    const busy = existingSlots.some(s =>
      s.id !== excludeSlotId &&
      s.day === day &&
      s.labId === l.id &&
      timesOverlap(s.startTime, s.endTime, startTime, endTime)
    );
    return !busy;
  });
}

export function timesOverlap(s1: string, e1: string, s2: string, e2: string): boolean {
  return timeToMin(s1) < timeToMin(e2) && timeToMin(s2) < timeToMin(e1);
}

export function getEndTime(startTime: string, type: 'theory' | 'lab' | 'mini_project' | 'honours'): string {
  const [h, m] = startTime.split(':').map(Number);
  const hours = type === 'lab' || type === 'mini_project' ? 2 : 1;
  return `${String(h + hours).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function checkSlotConflicts(
  slot: Partial<TimetableSlot>,
  allSlots: TimetableSlot[],
  excludeSlotId?: string
): string[] {
  const conflicts: string[] = [];
  for (const s of allSlots) {
    if (s.id === excludeSlotId) continue;
    if (s.day !== slot.day) continue;
    if (!timesOverlap(s.startTime, s.endTime || '', slot.startTime || '', slot.endTime || '')) continue;

    if (slot.facultyId && s.facultyId === slot.facultyId)
      conflicts.push(`Faculty clash: ${s.facultyName} already assigned`);
    if (slot.classroomId && s.classroomId === slot.classroomId)
      conflicts.push(`Classroom clash: ${s.classroomNumber} occupied`);
    if (slot.labId && s.labId === slot.labId)
      conflicts.push(`Lab clash: ${s.labName} occupied`);

    // Division-level: no two non-lab slots overlap
    if (s.divisionId === slot.divisionId && s.type !== 'lab' && slot.type !== 'lab')
      conflicts.push(`Division ${s.divisionName} already has a slot`);
    if (s.divisionId === slot.divisionId && s.batch === slot.batch && s.type === 'lab' && slot.type === 'lab')
      conflicts.push(`Division ${s.divisionName} batch ${s.batch} already has lab`);

    // *** CRITICAL: Lab blocks entire slot for division — no theory allowed ***
    if (s.divisionId === slot.divisionId) {
      const sIsLab = s.type === 'lab' || s.type === 'mini_project';
      const slotIsTheory = slot.type === 'theory' || slot.type === 'honours';
      const slotIsLab = slot.type === 'lab' || slot.type === 'mini_project';
      const sIsTheory = s.type === 'theory' || s.type === 'honours';

      if (sIsLab && slotIsTheory) {
        conflicts.push(`Lab session blocks this slot for ${s.divisionName} — no theory allowed`);
      }
      if (slotIsLab && sIsTheory) {
        conflicts.push(`Cannot place lab — theory for ${s.divisionName} already at this time`);
      }
    }
  }
  return conflicts;
}

export function suggestBestSlot(
  departmentId: string,
  subjectId: string,
  divisionId: string,
  type: 'theory' | 'lab' | 'mini_project' | 'honours',
  allSlots: TimetableSlot[],
  faculty: Faculty[],
  classrooms: Classroom[],
  labs: Lab[],
  days: string[]
): { day: string; startTime: string; facultyId?: string; classroomId?: string; labId?: string } | null {
  // Prefer 9:15 start, then other times
  const times = ['09:15', '10:30', '11:30', '13:30', '14:30', '15:30', '08:15', '16:30'];

  for (const day of days) {
    for (const time of times) {
      const endTime = getEndTime(time, type);
      const availFaculty = getAvailableFaculty(faculty, departmentId, day, time, endTime, allSlots);
      const isTheory = type === 'theory' || type === 'honours';
      const availRooms = isTheory
        ? getAvailableClassrooms(classrooms, departmentId, day, time, endTime, allSlots)
        : getAvailableLabs(labs, departmentId, day, time, endTime, allSlots);

      if (availFaculty.length > 0 && availRooms.length > 0) {
        const conflicts = checkSlotConflicts(
          { day, startTime: time, endTime, divisionId, type },
          allSlots
        );
        if (conflicts.length === 0) {
          return {
            day,
            startTime: time,
            facultyId: availFaculty[0].id,
            ...(isTheory ? { classroomId: availRooms[0].id } : { labId: availRooms[0].id }),
          };
        }
      }
    }
  }
  return null;
}

// Rebuild faculty timetables from division timetables
export function rebuildFacultyTimetables(
  divisionTimetables: Record<string, TimetableSlot[]>
): Record<string, TimetableSlot[]> {
  const facultyTT: Record<string, TimetableSlot[]> = {};
  for (const slots of Object.values(divisionTimetables)) {
    for (const slot of slots) {
      if (slot.facultyId && !slot.isBreak) {
        if (!facultyTT[slot.facultyId]) facultyTT[slot.facultyId] = [];
        facultyTT[slot.facultyId].push({ ...slot });
      }
    }
  }
  return facultyTT;
}

// Get resource availability grid for a department
export function getResourceAvailabilityGrid(
  allSlots: TimetableSlot[],
  classrooms: Classroom[],
  labs: Lab[],
  faculty: Faculty[],
  departmentId: string,
  day: string
): {
  classroomGrid: { resource: Classroom; slots: { time: string; occupied: boolean; occupiedBy?: string }[] }[];
  labGrid: { resource: Lab; slots: { time: string; occupied: boolean; occupiedBy?: string }[] }[];
  facultyGrid: { resource: Faculty; slots: { time: string; occupied: boolean; occupiedBy?: string }[] }[];
} {
  const times = ['08:15', '09:15', '10:30', '11:30', '13:30', '14:30', '15:30', '16:30'];
  const deptClassrooms = classrooms.filter(c => !c.departmentId || c.departmentId === departmentId);
  const deptLabs = labs.filter(l => !l.departmentId || l.departmentId === departmentId);
  const deptFaculty = faculty.filter(f => f.departmentId === departmentId);

  const daySlots = allSlots.filter(s => s.day === day && !s.isBreak);

  const classroomGrid = deptClassrooms.map(c => ({
    resource: c,
    slots: times.map(time => {
      const occ = daySlots.find(s => s.classroomId === c.id && timesOverlap(s.startTime, s.endTime, time, getEndTime(time, 'theory')));
      return { time, occupied: !!occ, occupiedBy: occ ? `${occ.subjectName} (${occ.divisionName})` : undefined };
    }),
  }));

  const labGrid = deptLabs.map(l => ({
    resource: l,
    slots: times.map(time => {
      const occ = daySlots.find(s => s.labId === l.id && timesOverlap(s.startTime, s.endTime, time, getEndTime(time, 'theory')));
      return { time, occupied: !!occ, occupiedBy: occ ? `${occ.subjectName} (${occ.divisionName})` : undefined };
    }),
  }));

  const facultyGrid = deptFaculty.map(f => ({
    resource: f,
    slots: times.map(time => {
      const occ = daySlots.find(s => s.facultyId === f.id && timesOverlap(s.startTime, s.endTime, time, getEndTime(time, 'theory')));
      return { time, occupied: !!occ, occupiedBy: occ ? `${occ.subjectName} (${occ.divisionName})` : undefined };
    }),
  }));

  return { classroomGrid, labGrid, facultyGrid };
}
