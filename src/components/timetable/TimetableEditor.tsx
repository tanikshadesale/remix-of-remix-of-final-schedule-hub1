import { useState, useMemo } from 'react';
import { useCollegeStore } from '@/store/collegeStore';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { Timetable, TimetableSlot } from '@/store/types';
import DraggableTimetableGrid from './DraggableTimetableGrid';
import SlotEditModal from './SlotEditModal';
import { getEndTime, checkSlotConflicts } from '@/lib/timetableUtils';

interface Props {
  timetable: Timetable;
  departmentId: string;
  onBack: () => void;
}

const TimetableEditor = ({ timetable, departmentId, onBack }: Props) => {
  const { updateTimetable, finalizeTimetable, subjects, divisions } = useCollegeStore();
  const deptSubjects = subjects.filter(s => s.departmentId === departmentId);
  const deptDivisions = divisions.filter(d => d.departmentId === departmentId && d.year === timetable.year);

  const [slots, setSlots] = useState<TimetableSlot[]>(timetable.slots);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [selectedSlot, setSelectedSlot] = useState<TimetableSlot | null>(null);

  const handleSlotClick = (day: string, time: string, slot?: TimetableSlot) => {
    setSelectedDay(day);
    setSelectedTime(time);
    setSelectedSlot(slot || null);
    setModalOpen(true);
  };

  const handleSlotSave = (slot: TimetableSlot) => {
    setSlots(prev => {
      let updated = selectedSlot ? prev.filter(s => s.id !== selectedSlot.id) : [...prev];
      updated.push(slot);
      if (slot.type === 'lab' || slot.type === 'mini_project') {
        const [h, m] = slot.startTime.split(':').map(Number);
        const nextTime = `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        updated.push({ ...slot, id: crypto.randomUUID(), startTime: nextTime });
      }
      return updated;
    });
  };

  const handleSlotDelete = (slotId: string) => {
    setSlots(prev => prev.filter(s => s.id !== slotId));
    toast.success('Slot deleted');
  };

  const handleSlotDrop = (slotId: string, newDay: string, newTime: string) => {
    const slot = slots.find(s => s.id === slotId);
    if (!slot) return;
    const endTime = getEndTime(newTime, slot.type);
    const conflicts = checkSlotConflicts({ ...slot, day: newDay, startTime: newTime, endTime }, slots, slotId);
    if (conflicts.length > 0) { conflicts.forEach(c => toast.error(c)); return; }
    setSlots(prev => prev.map(s => s.id === slotId ? { ...s, day: newDay, startTime: newTime, endTime } : s));
    toast.success('Slot moved');
  };

  const handleSave = () => { updateTimetable(timetable.id, slots); toast.success('Timetable saved'); };
  const handleFinalize = () => { updateTimetable(timetable.id, slots); finalizeTimetable(timetable.id); toast.success('Finalized'); onBack(); };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack}>← Back</Button>
          <h3 className="text-lg font-semibold">{timetable.name} — Editor</h3>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleSave}>Save Draft</Button>
          <Button size="sm" onClick={handleFinalize}>Finalize</Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        Click cells to add/edit. Drag to rearrange. Color coded by type.
      </p>

      <DraggableTimetableGrid
        slots={slots}
        onSlotClick={handleSlotClick}
        onSlotDrop={handleSlotDrop}
        editable
      />

      <SlotEditModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        day={selectedDay}
        startTime={selectedTime}
        departmentId={departmentId}
        allSlots={slots}
        existingSlot={selectedSlot}
        availableSubjects={deptSubjects}
        availableDivisions={deptDivisions}
        onSave={handleSlotSave}
        onDelete={handleSlotDelete}
      />
    </div>
  );
};

export default TimetableEditor;
