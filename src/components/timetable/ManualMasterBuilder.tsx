import { useState, useMemo } from 'react';
import { useCollegeStore } from '@/store/collegeStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import type { TimetableSlot, MasterTimetable } from '@/store/types';
import DraggableTimetableGrid from './DraggableTimetableGrid';
import SlotEditModal from './SlotEditModal';
import { getEndTime, rebuildFacultyTimetables, checkSlotConflicts } from '@/lib/timetableUtils';
import { Save, CheckCircle } from 'lucide-react';

interface Props {
  departmentId: string;
  existingMasterTT?: MasterTimetable;
  onBack: () => void;
  onSave: (data: {
    divisionTimetables: Record<string, TimetableSlot[]>;
    facultyTimetables: Record<string, TimetableSlot[]>;
    name: string;
  }) => void;
  onFinalize?: () => void;
}

const ManualMasterBuilder = ({ departmentId, existingMasterTT, onBack, onSave, onFinalize }: Props) => {
  const { subjects, divisions, faculty, classrooms, labs } = useCollegeStore();
  const deptSubjects = subjects.filter(s => s.departmentId === departmentId);
  const deptDivisions = divisions.filter(d => d.departmentId === departmentId);

  const [name, setName] = useState(existingMasterTT?.name || '');
  const [divisionTimetables, setDivisionTimetables] = useState<Record<string, TimetableSlot[]>>(
    existingMasterTT?.divisionTimetables || {}
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [selectedSlot, setSelectedSlot] = useState<TimetableSlot | null>(null);

  // Flatten all slots for conflict checking
  const allSlots = useMemo(() =>
    Object.values(divisionTimetables).flat(),
    [divisionTimetables]
  );

  const handleSlotClick = (day: string, time: string, slot?: TimetableSlot) => {
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

      // Remove old slot if editing
      if (selectedSlot) {
        // Remove from old division if changed
        for (const key of Object.keys(updated)) {
          updated[key] = updated[key].filter(s => s.id !== selectedSlot.id);
        }
      }

      updated[divId] = [...updated[divId], slot];

      // For lab/mini_project (2hr), add second hour slot
      if (slot.type === 'lab' || slot.type === 'mini_project') {
        const [h, m] = slot.startTime.split(':').map(Number);
        const nextTime = `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        updated[divId].push({
          ...slot,
          id: crypto.randomUUID(),
          startTime: nextTime,
        });
      }

      return updated;
    });
    toast.success(selectedSlot ? 'Slot updated' : 'Slot added');
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

  const handleSave = () => {
    if (!name) { toast.error('Name required'); return; }
    const facultyTimetables = rebuildFacultyTimetables(divisionTimetables);
    onSave({ divisionTimetables, facultyTimetables, name });
    toast.success('Master timetable saved');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack}>← Back</Button>
          <h3 className="text-lg font-semibold text-foreground">
            {existingMasterTT ? 'Edit' : 'Create'} Master Timetable
          </h3>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleSave}>
            <Save className="mr-2 h-4 w-4" /> Save Draft
          </Button>
          {onFinalize && (
            <Button size="sm" onClick={onFinalize}>
              <CheckCircle className="mr-2 h-4 w-4" /> Finalize
            </Button>
          )}
        </div>
      </div>

      {!existingMasterTT && (
        <div className="max-w-xs">
          <Label>Timetable Name</Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Sem 1 Master Timetable" />
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        Click any cell to add a slot. Drag slots to rearrange. Click existing slots to edit.
        <span className="ml-2">
          <span className="inline-block h-3 w-3 rounded bg-blue-500 align-middle mr-1" />Theory
          <span className="inline-block h-3 w-3 rounded bg-green-500 align-middle mx-1 ml-3" />Lab
          <span className="inline-block h-3 w-3 rounded bg-purple-500 align-middle mx-1 ml-3" />Mini Project
          <span className="inline-block h-3 w-3 rounded bg-orange-500 align-middle mx-1 ml-3" />Honours
        </span>
      </p>

      <DraggableTimetableGrid
        slots={allSlots}
        onSlotClick={handleSlotClick}
        onSlotDrop={handleSlotDrop}
        editable
        breakSchedule={existingMasterTT?.breakSchedule[Object.keys(existingMasterTT?.breakSchedule || {})[0]]}
      />

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
    </div>
  );
};

export default ManualMasterBuilder;
