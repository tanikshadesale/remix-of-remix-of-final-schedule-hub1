import { useState } from 'react';
import { useCollegeStore } from '@/store/collegeStore';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { MasterTimetable, TimetableSlot } from '@/store/types';
import DraggableTimetableGrid from './DraggableTimetableGrid';
import MasterGridView from './MasterGridView';
import SlotEditModal from './SlotEditModal';
import { getEndTime, checkSlotConflicts, rebuildFacultyTimetables } from '@/lib/timetableUtils';
import { Edit2, UserCheck, LayoutGrid, Table2 } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  masterTimetable: MasterTimetable;
  departmentId: string;
  onBack: () => void;
  onEdit?: () => void;
}

const MasterTimetableView = ({ masterTimetable, departmentId, onBack, onEdit }: Props) => {
  const { divisions, faculty, subjects, classrooms, labs, updateMasterTimetable } = useCollegeStore();
  const deptDivisions = divisions.filter(d => d.departmentId === departmentId);
  const deptFaculty = faculty.filter(f => f.departmentId === departmentId);
  const deptSubjects = subjects.filter(s => s.departmentId === departmentId);

  const activeDivisions = deptDivisions.filter(d => masterTimetable.divisionTimetables[d.id]);
  const activeFaculty = deptFaculty.filter(f => masterTimetable.facultyTimetables[f.id]);

  const [viewMode, setViewMode] = useState<'master' | 'divisions' | 'faculty'>('master');
  const [editMode, setEditMode] = useState(false);
  const [divisionTimetables, setDivisionTimetables] = useState(masterTimetable.divisionTimetables);

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [selectedSlot, setSelectedSlot] = useState<TimetableSlot | null>(null);

  const allSlots = Object.values(divisionTimetables).flat();

  const handleSlotClick = (day: string, time: string, slot?: TimetableSlot) => {
    if (!editMode) return;
    setSelectedDay(day);
    setSelectedTime(time);
    setSelectedSlot(slot || null);
    setModalOpen(true);
  };

  const handleSlotSave = (slot: TimetableSlot) => {
    setDivisionTimetables(prev => {
      const updated = { ...prev };
      const divId = slot.divisionId;
      if (!updated[divId]) updated[divId] = [];

      if (selectedSlot) {
        for (const key of Object.keys(updated)) {
          updated[key] = updated[key].filter(s => s.id !== selectedSlot.id);
        }
      }

      updated[divId] = [...updated[divId], slot];

      if (slot.type === 'lab' || slot.type === 'mini_project') {
        const [h, m] = slot.startTime.split(':').map(Number);
        const nextTime = `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        updated[divId].push({ ...slot, id: crypto.randomUUID(), startTime: nextTime });
      }

      return updated;
    });
    toast.success('Slot updated');
  };

  const handleSlotDelete = (slotId: string) => {
    setDivisionTimetables(prev => {
      const updated = { ...prev };
      for (const key of Object.keys(updated)) {
        updated[key] = updated[key].filter(s => s.id !== slotId);
      }
      return updated;
    });
    toast.success('Slot deleted');
  };

  const handleSlotDrop = (slotId: string, newDay: string, newTime: string) => {
    const slot = allSlots.find(s => s.id === slotId);
    if (!slot) return;

    const endTime = getEndTime(newTime, slot.type);
    const testSlot = { ...slot, day: newDay, startTime: newTime, endTime };
    const conflicts = checkSlotConflicts(testSlot, allSlots, slotId);

    if (conflicts.length > 0) {
      conflicts.forEach(c => toast.error(c));
      return;
    }

    setDivisionTimetables(prev => {
      const updated = { ...prev };
      for (const key of Object.keys(updated)) {
        updated[key] = updated[key].map(s =>
          s.id === slotId ? { ...s, day: newDay, startTime: newTime, endTime } : s
        );
      }
      return updated;
    });
    toast.success('Slot moved');
  };

  const handleSaveEdits = () => {
    const facultyTT = rebuildFacultyTimetables(divisionTimetables);
    updateMasterTimetable(masterTimetable.id, divisionTimetables, facultyTT);
    setEditMode(false);
    toast.success('Timetable changes saved — faculty & division views updated');
  };

  const handleAssignToFaculty = () => {
    // Rebuild faculty timetables and persist
    const facultyTT = rebuildFacultyTimetables(divisionTimetables);
    updateMasterTimetable(masterTimetable.id, divisionTimetables, facultyTT);

    const assignedCount = Object.keys(facultyTT).length;
    const totalSlots = Object.values(facultyTT).flat().length;
    toast.success(`Assigned ${totalSlots} slots to ${assignedCount} faculty members. Faculty dashboards updated.`);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack}>← Back</Button>
          <h3 className="text-lg font-semibold text-foreground">{masterTimetable.name}</h3>
        </div>
        <div className="flex gap-2 flex-wrap">
          {masterTimetable.config.enableFlexibleBreaks && <Badge variant="outline">Flexible Breaks</Badge>}
          {masterTimetable.config.enableMiniProject && <Badge variant="outline">Mini Project</Badge>}
          {masterTimetable.config.enableHonours && <Badge variant="outline">Honours</Badge>}

          <Button variant="outline" size="sm" onClick={handleAssignToFaculty}>
            <UserCheck className="mr-2 h-4 w-4" /> Assign to Faculty
          </Button>

          {!masterTimetable.isFinalized && (
            editMode ? (
              <>
                <Button size="sm" onClick={handleSaveEdits}>Save Changes</Button>
                <Button variant="outline" size="sm" onClick={() => { setDivisionTimetables(masterTimetable.divisionTimetables); setEditMode(false); }}>Cancel</Button>
              </>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={() => setEditMode(true)}>
                  <Edit2 className="mr-2 h-4 w-4" /> Edit
                </Button>
                {onEdit && (
                  <Button variant="outline" size="sm" onClick={onEdit}>
                    Full Editor
                  </Button>
                )}
              </>
            )
          )}
        </div>
      </div>

      {editMode && (
        <p className="text-sm text-muted-foreground mb-3">
          🟢 Editing mode — click cells to edit, drag to rearrange. Changes auto-sync faculty & division views.
          <span className="ml-2">
            <span className="inline-block h-3 w-3 rounded bg-blue-500 align-middle mr-1" />Theory
            <span className="inline-block h-3 w-3 rounded bg-green-500 align-middle mx-1 ml-2" />Lab
            <span className="inline-block h-3 w-3 rounded bg-purple-500 align-middle mx-1 ml-2" />MP
            <span className="inline-block h-3 w-3 rounded bg-orange-500 align-middle mx-1 ml-2" />Honours
          </span>
        </p>
      )}

      {masterTimetable.config.enableFlexibleBreaks && Object.keys(masterTimetable.breakSchedule).length > 0 && (
        <Card className="mb-4">
          <CardContent className="py-3">
            <p className="text-sm font-medium text-foreground mb-2">Break Schedule</p>
            <div className="flex flex-wrap gap-3">
              {activeDivisions.map(div => {
                const brk = masterTimetable.breakSchedule[div.id];
                return brk ? (
                  <div key={div.id} className="text-xs bg-muted rounded px-2 py-1">
                    <span className="font-medium text-foreground">{div.name}</span>
                    <span className="text-muted-foreground"> — Break: {brk.morningBreak} | Lunch: {brk.lunchBreak}</span>
                  </div>
                ) : null;
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2 mb-4">
        <Button variant={viewMode === 'master' ? 'default' : 'outline'} size="sm" onClick={() => setViewMode('master')}>
          <Table2 className="mr-1 h-4 w-4" /> Master View
        </Button>
        <Button variant={viewMode === 'divisions' ? 'default' : 'outline'} size="sm" onClick={() => setViewMode('divisions')}>
          <LayoutGrid className="mr-1 h-4 w-4" /> Division ({activeDivisions.length})
        </Button>
        <Button variant={viewMode === 'faculty' ? 'default' : 'outline'} size="sm" onClick={() => setViewMode('faculty')}>
          Faculty ({activeFaculty.length})
        </Button>
      </div>

      {viewMode === 'master' && (
        <MasterGridView
          divisionTimetables={divisionTimetables}
          divisions={activeDivisions.map(d => ({ id: d.id, name: d.name, year: d.year }))}
          breakSchedule={masterTimetable.breakSchedule}
          onSlotClick={editMode ? handleSlotClick : undefined}
          editable={editMode}
        />
      )}

      {viewMode === 'divisions' && (
        <Tabs defaultValue={activeDivisions[0]?.id} className="space-y-4">
          <TabsList className="flex-wrap h-auto gap-1">
            {activeDivisions.map(div => (
              <TabsTrigger key={div.id} value={div.id}>{div.name}</TabsTrigger>
            ))}
          </TabsList>
          {activeDivisions.map(div => (
            <TabsContent key={div.id} value={div.id}>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">
                {div.name} — {div.year}
                {masterTimetable.breakSchedule[div.id] && (
                  <span className="ml-2 text-xs">
                    (Break: {masterTimetable.breakSchedule[div.id].morningBreak} |
                    Lunch: {masterTimetable.breakSchedule[div.id].lunchBreak})
                  </span>
                )}
              </h4>
              <DraggableTimetableGrid
                slots={divisionTimetables[div.id] || []}
                onSlotClick={handleSlotClick}
                onSlotDrop={handleSlotDrop}
                breakSchedule={masterTimetable.breakSchedule[div.id]}
                editable={editMode}
              />
            </TabsContent>
          ))}
        </Tabs>
      )}

      {viewMode === 'faculty' && (
        <Tabs defaultValue={activeFaculty[0]?.id} className="space-y-4">
          <TabsList className="flex-wrap h-auto gap-1">
            {activeFaculty.map(fac => (
              <TabsTrigger key={fac.id} value={fac.id}>{fac.name}</TabsTrigger>
            ))}
          </TabsList>
          {activeFaculty.map(fac => {
            const facSlots = editMode
              ? rebuildFacultyTimetables(divisionTimetables)[fac.id] || []
              : masterTimetable.facultyTimetables[fac.id] || [];
            return (
              <TabsContent key={fac.id} value={fac.id}>
                <h4 className="text-sm font-medium text-muted-foreground mb-2">{fac.name} — {fac.email}</h4>
                <DraggableTimetableGrid slots={facSlots} editable={false} />
              </TabsContent>
            );
          })}
          {activeFaculty.length === 0 && (
            <Card><CardContent className="py-6 text-center text-muted-foreground text-sm">
              No faculty assignments found. Click "Assign to Faculty" to update.
            </CardContent></Card>
          )}
        </Tabs>
      )}

      {editMode && (
        <SlotEditModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          day={selectedDay}
          startTime={selectedTime}
          departmentId={departmentId}
          allSlots={allSlots}
          existingSlot={selectedSlot}
          availableSubjects={deptSubjects}
          availableDivisions={deptDivisions}
          onSave={handleSlotSave}
          onDelete={handleSlotDelete}
        />
      )}
    </div>
  );
};

export default MasterTimetableView;
