import { useMemo } from 'react';
import type { TimetableSlot } from '@/store/types';
import { DAYS } from '@/store/types';
import { cn } from '@/lib/utils';

/** Time columns matching the real college timetable format */
const TIME_COLUMNS = [
  { start: '08:15', end: '09:15', label: '8:15-9:15' },
  { start: '09:15', end: '10:15', label: '9:15-10:15' },
  { start: '10:15', end: '10:30', label: '10:15-10:30', isBreak: true },
  { start: '10:30', end: '11:30', label: '10:30-11:30' },
  { start: '11:30', end: '12:30', label: '11:30-12:30' },
  { start: '12:30', end: '13:30', label: '12:30-1:30', isBreak: true },
  { start: '13:30', end: '14:30', label: '1:30-2:30' },
  { start: '14:30', end: '15:30', label: '2:30-3:30' },
  { start: '15:30', end: '16:30', label: '3:30-4:30' },
  { start: '16:30', end: '17:30', label: '4:30-5:30' },
];

interface DivisionInfo {
  id: string;
  name: string;
  year: string;
}

interface Props {
  divisionTimetables: Record<string, TimetableSlot[]>;
  divisions: DivisionInfo[];
  breakSchedule?: Record<string, { morningBreak: string; lunchBreak: string }>;
  onSlotClick?: (day: string, time: string, slot?: TimetableSlot) => void;
  editable?: boolean;
}

/** Compact slot label: SubjectCode-FacultyInitials-Room */
function formatSlotCompact(slot: TimetableSlot): string {
  const parts: string[] = [];
  // Subject abbreviation
  const subj = slot.subjectName || '??';
  parts.push(subj);
  // Faculty initials
  if (slot.facultyName) {
    const initials = slot.facultyName
      .split(' ')
      .map(w => w[0])
      .join('')
      .toUpperCase();
    parts.push(initials);
  }
  // Room or lab
  if (slot.classroomNumber) parts.push(slot.classroomNumber);
  else if (slot.labName) parts.push(slot.labName);

  return parts.join('-');
}

/** Group lab batch slots into compact batch notation */
function formatCellSlots(slots: TimetableSlot[]): { text: string; type: string; batch?: string }[] {
  if (slots.length === 0) return [];

  // Group lab slots by type
  const labSlots = slots.filter(s => s.type === 'lab');
  const theorySlots = slots.filter(s => s.type === 'theory');
  const mpSlots = slots.filter(s => s.type === 'mini_project');
  const honSlots = slots.filter(s => s.type === 'honours');

  const results: { text: string; type: string; batch?: string }[] = [];

  // Lab batches shown as "SubjA-Batch-Fac-Room / SubjB-Batch-Fac-Room"
  if (labSlots.length > 0) {
    const labText = labSlots
      .map(s => {
        const parts = [s.subjectName];
        if (s.batch) parts.push(s.batch);
        if (s.facultyName) {
          parts.push(
            s.facultyName
              .split(' ')
              .map(w => w[0])
              .join('')
              .toUpperCase()
          );
        }
        if (s.labName || s.classroomNumber) parts.push(s.labName || s.classroomNumber || '');
        return parts.join('-');
      })
      .join('/');
    results.push({ text: labText, type: 'lab' });
  }

  theorySlots.forEach(s => results.push({ text: formatSlotCompact(s), type: 'theory' }));
  mpSlots.forEach(s => results.push({ text: formatSlotCompact(s), type: 'mini_project' }));
  honSlots.forEach(s => results.push({ text: formatSlotCompact(s), type: 'honours' }));

  return results;
}

const typeColors: Record<string, string> = {
  theory: 'bg-blue-50 text-blue-900 dark:bg-blue-950 dark:text-blue-200',
  lab: 'bg-green-50 text-green-900 dark:bg-green-950 dark:text-green-200',
  mini_project: 'bg-purple-50 text-purple-900 dark:bg-purple-950 dark:text-purple-200',
  honours: 'bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
};

const MasterGridView = ({
  divisionTimetables,
  divisions,
  breakSchedule,
  onSlotClick,
  editable = false,
}: Props) => {
  // Group divisions by year for day-row ordering
  const sortedDivisions = useMemo(() => {
    const yearOrder = ['FE', 'SE', 'TE', 'BE'];
    return [...divisions].sort(
      (a, b) => yearOrder.indexOf(a.year) - yearOrder.indexOf(b.year) || a.name.localeCompare(b.name)
    );
  }, [divisions]);

  // Build lookup: day+divisionId+startTime → slots
  const slotMap = useMemo(() => {
    const map = new Map<string, TimetableSlot[]>();
    for (const [divId, slots] of Object.entries(divisionTimetables)) {
      for (const slot of slots) {
        if (slot.isBreak) continue;
        const key = `${slot.day}|${divId}|${slot.startTime}`;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(slot);
      }
    }
    return map;
  }, [divisionTimetables]);

  const colCount = TIME_COLUMNS.length;

  return (
    <div className="overflow-x-auto border border-border rounded-lg">
      <table className="w-full border-collapse text-[11px] min-w-[1100px]">
        <thead>
          <tr className="bg-primary/10">
            <th className="border border-border px-2 py-2 text-left font-semibold text-foreground w-[60px]">Day</th>
            <th className="border border-border px-2 py-2 text-left font-semibold text-foreground w-[50px]">Class</th>
            {TIME_COLUMNS.map(col => (
              <th
                key={col.start}
                className={cn(
                  'border border-border px-1 py-2 text-center font-semibold text-foreground whitespace-nowrap',
                  col.isBreak && 'bg-muted/60 w-[60px]'
                )}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DAYS.map(day => {
            const divsForDay = sortedDivisions;
            return divsForDay.map((div, divIdx) => (
              <tr
                key={`${day}-${div.id}`}
                className={cn(
                  'hover:bg-accent/5 transition-colors',
                  divIdx === divsForDay.length - 1 && 'border-b-2 border-b-border'
                )}
              >
                {/* Day label — rowspan for first division */}
                {divIdx === 0 && (
                  <td
                    rowSpan={divsForDay.length}
                    className="border border-border px-2 py-1 font-bold text-foreground bg-muted/30 align-middle text-center uppercase tracking-wide text-xs"
                    style={{ writingMode: 'vertical-lr', textOrientation: 'mixed', minWidth: 40 }}
                  >
                    {day.toUpperCase()}
                  </td>
                )}

                {/* Division name */}
                <td className="border border-border px-2 py-1 font-semibold text-foreground bg-muted/20 whitespace-nowrap">
                  {div.name}
                </td>

                {/* Time slot cells */}
                {TIME_COLUMNS.map(col => {
                  if (col.isBreak) {
                    // Check if this division's break schedule matches
                    const divBreak = breakSchedule?.[div.id];
                    const isMorning = col.start === '10:15';
                    const isLunch = col.start === '12:30';

                    // Show BREAK label
                    return (
                      <td
                        key={col.start}
                        className="border border-border bg-muted/40 text-center text-muted-foreground font-medium italic px-1 py-1"
                      >
                        {isMorning ? 'B' : 'BREAK'}
                        {isMorning && (
                          <span className="block text-[9px]">R<br />E<br />A<br />K</span>
                        )}
                      </td>
                    );
                  }

                  const key = `${day}|${div.id}|${col.start}`;
                  const cellSlots = slotMap.get(key) || [];
                  const formatted = formatCellSlots(cellSlots);

                  return (
                    <td
                      key={col.start}
                      className={cn(
                        'border border-border px-1 py-1 align-top min-w-[90px] max-w-[160px]',
                        editable && 'cursor-pointer hover:bg-accent/10',
                        cellSlots.some(s => s.conflict) && 'bg-destructive/10'
                      )}
                      onClick={() => {
                        if (editable && onSlotClick) {
                          onSlotClick(day, col.start, cellSlots[0]);
                        }
                      }}
                    >
                      {formatted.map((item, i) => (
                        <div
                          key={i}
                          className={cn(
                            'rounded px-1 py-0.5 mb-0.5 text-[10px] leading-tight font-medium break-all',
                            typeColors[item.type] || 'bg-muted/30 text-foreground'
                          )}
                          title={cellSlots[i]?.subjectName}
                        >
                          {item.text}
                        </div>
                      ))}
                    </td>
                  );
                })}
              </tr>
            ));
          })}
        </tbody>
      </table>
    </div>
  );
};

export default MasterGridView;
