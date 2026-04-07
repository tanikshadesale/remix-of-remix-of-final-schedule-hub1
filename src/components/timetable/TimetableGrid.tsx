import type { TimetableSlot } from '@/store/types';
import { DAYS } from '@/store/types';
import { cn } from '@/lib/utils';

function generateTimeLabels(breakSchedule?: { morningBreak: string; lunchBreak: string }) {
  const labels: { start: string; end: string; isBreak?: boolean; label?: string }[] = [];
  const startMin = 8 * 60 + 15;
  const endMinTotal = 17 * 60 + 30;
  const morningBreakMin = breakSchedule
    ? parseInt(breakSchedule.morningBreak.split(':')[0]) * 60 + parseInt(breakSchedule.morningBreak.split(':')[1])
    : 10 * 60 + 15;
  const lunchBreakMin = breakSchedule
    ? parseInt(breakSchedule.lunchBreak.split(':')[0]) * 60 + parseInt(breakSchedule.lunchBreak.split(':')[1])
    : 12 * 60 + 30;
  let currentMin = startMin;
  while (currentMin < endMinTotal) {
    const h = Math.floor(currentMin / 60);
    const m = currentMin % 60;
    const start = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    if (currentMin === morningBreakMin) {
      const breakEnd = currentMin + 15;
      labels.push({ start, end: `${String(Math.floor(breakEnd / 60)).padStart(2, '0')}:${String(breakEnd % 60).padStart(2, '0')}`, isBreak: true, label: 'Short Break' });
      currentMin = breakEnd;
      continue;
    }
    if (currentMin === lunchBreakMin) {
      const breakEnd = currentMin + 60;
      labels.push({ start, end: `${String(Math.floor(breakEnd / 60)).padStart(2, '0')}:${String(breakEnd % 60).padStart(2, '0')}`, isBreak: true, label: 'Lunch Break' });
      currentMin = breakEnd;
      continue;
    }
    const nextMin = currentMin + 60;
    if ((currentMin < morningBreakMin + 15 && nextMin > morningBreakMin) || (currentMin < lunchBreakMin + 60 && nextMin > lunchBreakMin)) {
      if (currentMin < morningBreakMin && nextMin > morningBreakMin) {
        labels.push({ start, end: `${String(Math.floor(morningBreakMin / 60)).padStart(2, '0')}:${String(morningBreakMin % 60).padStart(2, '0')}` });
        currentMin = morningBreakMin;
        continue;
      }
      if (currentMin < lunchBreakMin && nextMin > lunchBreakMin) {
        labels.push({ start, end: `${String(Math.floor(lunchBreakMin / 60)).padStart(2, '0')}:${String(lunchBreakMin % 60).padStart(2, '0')}` });
        currentMin = lunchBreakMin;
        continue;
      }
      currentMin = nextMin;
      continue;
    }
    labels.push({ start, end: `${String(Math.floor(nextMin / 60)).padStart(2, '0')}:${String(nextMin % 60).padStart(2, '0')}` });
    currentMin = nextMin;
  }
  return labels;
}

const DEFAULT_TIME_LABELS = [
  { start: '08:15', end: '09:15' },
  { start: '09:15', end: '10:15' },
  { start: '10:15', end: '10:30', isBreak: true, label: 'Short Break' },
  { start: '10:30', end: '11:30' },
  { start: '11:30', end: '12:30' },
  { start: '12:30', end: '13:30', isBreak: true, label: 'Lunch Break' },
  { start: '13:30', end: '14:30' },
  { start: '14:30', end: '15:30' },
  { start: '15:30', end: '16:30' },
  { start: '16:30', end: '17:30' },
];

const TYPE_STYLES: Record<string, string> = {
  theory: 'bg-[hsl(var(--tt-theory))] border-l-[3px] border-l-[hsl(var(--tt-theory-border))]',
  lab: 'bg-[hsl(var(--tt-lab))] border-l-[3px] border-l-[hsl(var(--tt-lab-border))]',
  mini_project: 'bg-[hsl(var(--tt-mp))] border-l-[3px] border-l-[hsl(var(--tt-mp-border))]',
  honours: 'bg-[hsl(var(--tt-honours))] border-l-[3px] border-l-[hsl(var(--tt-honours-border))]',
};

const TYPE_LABELS: Record<string, string> = {
  theory: 'TH',
  lab: 'LAB',
  mini_project: 'MP',
  honours: 'HON',
};

interface Props {
  slots: TimetableSlot[];
  onSlotClick?: (day: string, time: string) => void;
  breakSchedule?: { morningBreak: string; lunchBreak: string };
}

const TimetableGrid = ({ slots, onSlotClick, breakSchedule }: Props) => {
  const timeLabels = breakSchedule ? generateTimeLabels(breakSchedule) : DEFAULT_TIME_LABELS;

  const getSlots = (day: string, startTime: string) =>
    slots.filter(s => s.day === day && s.startTime === startTime && !s.isBreak);

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full min-w-[900px] border-collapse">
        <thead>
          <tr className="bg-muted/50">
            <th className="text-left text-xs font-medium text-muted-foreground p-3 w-[110px] border-b border-r border-border">Time</th>
            {DAYS.map(day => (
              <th key={day} className="text-center text-xs font-medium text-foreground p-3 border-b border-border">{day}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {timeLabels.map((time, idx) => (
            <tr key={idx} className={time.isBreak ? 'bg-muted/30' : ''}>
              <td className={cn(
                "text-xs p-2.5 border-r border-b border-border font-medium text-muted-foreground",
                time.isBreak && "italic"
              )}>
                {time.start}–{time.end}
              </td>
              {DAYS.map(day => {
                if (time.isBreak) {
                  return (
                    <td key={`${day}-${time.start}`} className="text-center text-xs text-muted-foreground border-b border-border italic p-2">
                      {time.label}
                    </td>
                  );
                }
                const daySlots = getSlots(day, time.start);
                return (
                  <td
                    key={`${day}-${time.start}`}
                    className={cn(
                      "p-1 border-b border-border align-top cursor-pointer hover:bg-primary/[0.03] transition-colors",
                      daySlots.some(s => s.conflict) && "bg-destructive/5"
                    )}
                    onClick={() => onSlotClick?.(day, time.start)}
                  >
                    <div className="space-y-1">
                      {daySlots.map(slot => (
                        <div key={slot.id} className={cn("rounded px-2 py-1.5", TYPE_STYLES[slot.type] || 'bg-muted/40')}>
                          <div className="flex items-start justify-between gap-1">
                            <p className="text-xs font-medium text-foreground leading-tight">{slot.subjectName}</p>
                            <span className="text-[9px] font-semibold text-muted-foreground shrink-0 bg-background/60 px-1 rounded">
                              {TYPE_LABELS[slot.type] || slot.type}
                            </span>
                          </div>
                          {slot.facultyName && <p className="text-[10px] text-muted-foreground mt-0.5">{slot.facultyName}</p>}
                          <div className="flex items-center gap-1 mt-0.5 text-[10px] text-muted-foreground">
                            {slot.divisionName && <span>{slot.divisionName}</span>}
                            {slot.batch && <><span>·</span><span>{slot.batch}</span></>}
                            {(slot.classroomNumber || slot.labName) && (
                              <><span>·</span><span>{slot.classroomNumber || slot.labName}</span></>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default TimetableGrid;
