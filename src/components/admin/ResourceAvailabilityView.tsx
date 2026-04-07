import { useState, useMemo } from 'react';
import { useCollegeStore } from '@/store/collegeStore';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DAYS } from '@/store/types';
import { getResourceAvailabilityGrid } from '@/lib/timetableUtils';
import { cn } from '@/lib/utils';

interface Props {
  departmentId: string;
}

const TIMES = ['08:15', '09:15', '10:30', '11:30', '13:30', '14:30', '15:30', '16:30'];

const ResourceAvailabilityView = ({ departmentId }: Props) => {
  const { classrooms, labs, faculty, masterTimetables } = useCollegeStore();
  const [selectedDay, setSelectedDay] = useState(DAYS[0]);
  const [selectedTTId, setSelectedTTId] = useState<string>('');

  const deptMasterTTs = masterTimetables.filter(t => t.departmentId === departmentId);

  const allSlots = useMemo(() => {
    if (!selectedTTId) return [];
    const tt = deptMasterTTs.find(t => t.id === selectedTTId);
    if (!tt) return [];
    return Object.values(tt.divisionTimetables).flat();
  }, [selectedTTId, deptMasterTTs]);

  const grid = useMemo(() =>
    getResourceAvailabilityGrid(allSlots, classrooms, labs, faculty, departmentId, selectedDay),
    [allSlots, classrooms, labs, faculty, departmentId, selectedDay]
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-4 items-end flex-wrap">
        <div>
          <Label className="text-xs">Timetable</Label>
          <Select value={selectedTTId} onValueChange={setSelectedTTId}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="Select timetable" /></SelectTrigger>
            <SelectContent>
              {deptMasterTTs.map(t => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Day</Label>
          <Select value={selectedDay} onValueChange={setSelectedDay}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {DAYS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2 items-center text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-green-500" /> Free</span>
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-destructive" /> Occupied</span>
        </div>
      </div>

      {!selectedTTId ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Select a timetable to view resource availability.</p>
      ) : (
        <Tabs defaultValue="classrooms">
          <TabsList>
            <TabsTrigger value="classrooms">Classrooms ({grid.classroomGrid.length})</TabsTrigger>
            <TabsTrigger value="labs">Labs ({grid.labGrid.length})</TabsTrigger>
            <TabsTrigger value="faculty">Faculty ({grid.facultyGrid.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="classrooms">
            <AvailabilityTable
              headers={TIMES}
              rows={grid.classroomGrid.map(r => ({
                label: r.resource.number,
                sublabel: `Cap: ${r.resource.capacity}`,
                slots: r.slots,
              }))}
            />
          </TabsContent>
          <TabsContent value="labs">
            <AvailabilityTable
              headers={TIMES}
              rows={grid.labGrid.map(r => ({
                label: r.resource.name,
                sublabel: `Cap: ${r.resource.capacity}`,
                slots: r.slots,
              }))}
            />
          </TabsContent>
          <TabsContent value="faculty">
            <AvailabilityTable
              headers={TIMES}
              rows={grid.facultyGrid.map(r => ({
                label: r.resource.name,
                sublabel: r.resource.email,
                slots: r.slots,
              }))}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
};

function AvailabilityTable({ headers, rows }: {
  headers: string[];
  rows: { label: string; sublabel: string; slots: { time: string; occupied: boolean; occupiedBy?: string }[] }[];
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground py-4 text-center">No resources found.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border mt-2">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-muted/40">
            <th className="text-left p-2 font-medium text-muted-foreground border-r min-w-[120px]">Resource</th>
            {headers.map(h => (
              <th key={h} className="p-2 font-medium text-muted-foreground text-center min-w-[80px]">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t">
              <td className="p-2 border-r">
                <p className="font-medium text-foreground">{row.label}</p>
                <p className="text-muted-foreground text-[10px]">{row.sublabel}</p>
              </td>
              {row.slots.map((slot, j) => (
                <td key={j} className="p-1 text-center" title={slot.occupiedBy || 'Free'}>
                  <div className={cn(
                    "rounded px-1 py-1.5 text-[10px] font-medium",
                    slot.occupied
                      ? "bg-destructive/15 text-destructive dark:bg-destructive/25"
                      : "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400"
                  )}>
                    {slot.occupied ? '🔴' : '🟢'}
                    {slot.occupiedBy && (
                      <p className="text-[9px] mt-0.5 truncate max-w-[70px]">{slot.occupiedBy}</p>
                    )}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default ResourceAvailabilityView;
