import { useState, useEffect, useMemo } from 'react';
import { useCollegeStore } from '@/store/collegeStore';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Lightbulb, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { TimetableSlot, Subject, Division } from '@/store/types';
import {
  getAvailableFaculty, getAvailableClassrooms, getAvailableLabs,
  getEndTime, checkSlotConflicts, suggestBestSlot
} from '@/lib/timetableUtils';
import { DAYS } from '@/store/types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  day: string;
  startTime: string;
  departmentId: string;
  allSlots: TimetableSlot[];
  existingSlot?: TimetableSlot | null;
  availableSubjects: Subject[];
  availableDivisions: Division[];
  onSave: (slot: TimetableSlot) => void;
  onDelete?: (slotId: string) => void;
}

const SlotEditModal = ({
  open, onOpenChange, day, startTime, departmentId,
  allSlots, existingSlot, availableSubjects, availableDivisions,
  onSave, onDelete
}: Props) => {
  const { faculty, classrooms, labs } = useCollegeStore();

  const [form, setForm] = useState({
    subjectId: '',
    divisionId: '',
    facultyId: '',
    type: 'theory' as TimetableSlot['type'],
    classroomId: '',
    labId: '',
    batch: '',
  });

  useEffect(() => {
    if (existingSlot) {
      setForm({
        subjectId: existingSlot.subjectId,
        divisionId: existingSlot.divisionId,
        facultyId: existingSlot.facultyId || '',
        type: existingSlot.type,
        classroomId: existingSlot.classroomId || '',
        labId: existingSlot.labId || '',
        batch: existingSlot.batch || '',
      });
    } else {
      setForm({ subjectId: '', divisionId: '', facultyId: '', type: 'theory', classroomId: '', labId: '', batch: '' });
    }
  }, [existingSlot, open]);

  const endTime = useMemo(() => getEndTime(startTime, form.type), [startTime, form.type]);

  const availFaculty = useMemo(() =>
    getAvailableFaculty(faculty, departmentId, day, startTime, endTime, allSlots, existingSlot?.id),
    [faculty, departmentId, day, startTime, endTime, allSlots, existingSlot?.id]
  );

  const availClassrooms = useMemo(() =>
    getAvailableClassrooms(classrooms, departmentId, day, startTime, endTime, allSlots, existingSlot?.id),
    [classrooms, departmentId, day, startTime, endTime, allSlots, existingSlot?.id]
  );

  const availLabs = useMemo(() =>
    getAvailableLabs(labs, departmentId, day, startTime, endTime, allSlots, existingSlot?.id),
    [labs, departmentId, day, startTime, endTime, allSlots, existingSlot?.id]
  );

  const busyFaculty = useMemo(() =>
    faculty.filter(f => f.departmentId === departmentId && !availFaculty.some(af => af.id === f.id)),
    [faculty, departmentId, availFaculty]
  );

  const handleSuggest = () => {
    const suggestion = suggestBestSlot(
      departmentId, form.subjectId, form.divisionId, form.type,
      allSlots, faculty, classrooms, labs, DAYS
    );
    if (suggestion) {
      toast.success(`Best slot: ${suggestion.day} at ${startTime}`);
      if (suggestion.facultyId) setForm(p => ({ ...p, facultyId: suggestion.facultyId! }));
      if (suggestion.classroomId) setForm(p => ({ ...p, classroomId: suggestion.classroomId! }));
      if (suggestion.labId) setForm(p => ({ ...p, labId: suggestion.labId! }));
    } else {
      toast.error('No conflict-free slot found');
    }
  };

  const handleSave = () => {
    if (!form.subjectId || !form.divisionId) {
      toast.error('Subject and division are required');
      return;
    }

    const subject = availableSubjects.find(s => s.id === form.subjectId);
    const division = availableDivisions.find(d => d.id === form.divisionId);
    const fac = faculty.find(f => f.id === form.facultyId);
    const classroom = classrooms.find(c => c.id === form.classroomId);
    const lab = labs.find(l => l.id === form.labId);

    const newSlot: TimetableSlot = {
      id: existingSlot?.id || crypto.randomUUID(),
      day,
      startTime,
      endTime,
      subjectId: form.subjectId,
      subjectName: subject?.name || '',
      facultyId: form.facultyId || undefined,
      facultyName: fac?.name,
      classroomId: form.classroomId || undefined,
      classroomNumber: classroom?.number,
      labId: form.labId || undefined,
      labName: lab?.name,
      divisionId: form.divisionId,
      divisionName: division?.name || '',
      type: form.type,
      batch: form.batch || undefined,
    };

    const conflicts = checkSlotConflicts(newSlot, allSlots, existingSlot?.id);
    if (conflicts.length > 0) {
      newSlot.conflict = true;
      conflicts.forEach(c => toast.error(c));
    }

    onSave(newSlot);
    onOpenChange(false);
  };

  const isLabType = form.type === 'lab' || form.type === 'mini_project';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {existingSlot ? 'Edit' : 'Add'} Slot — {day} {startTime}–{endTime}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Subject</Label>
            <Select value={form.subjectId} onValueChange={v => setForm(p => ({ ...p, subjectId: v }))}>
              <SelectTrigger><SelectValue placeholder="Select subject" /></SelectTrigger>
              <SelectContent>
                {availableSubjects.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name} ({s.type})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Division</Label>
            <Select value={form.divisionId} onValueChange={v => setForm(p => ({ ...p, divisionId: v }))}>
              <SelectTrigger><SelectValue placeholder="Select division" /></SelectTrigger>
              <SelectContent>
                {availableDivisions.map(d => (
                  <SelectItem key={d.id} value={d.id}>{d.name} ({d.year})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Lecture Type</Label>
            <Select value={form.type} onValueChange={(v: TimetableSlot['type']) => setForm(p => ({ ...p, type: v, classroomId: '', labId: '' }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="theory">Theory</SelectItem>
                <SelectItem value="lab">Lab</SelectItem>
                <SelectItem value="mini_project">Mini Project</SelectItem>
                <SelectItem value="honours">Honours</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.type === 'lab' && (
            <div>
              <Label>Batch</Label>
              <Select value={form.batch} onValueChange={v => setForm(p => ({ ...p, batch: v }))}>
                <SelectTrigger><SelectValue placeholder="Select batch" /></SelectTrigger>
                <SelectContent>
                  {['B1', 'B2', 'B3', 'B4'].map(b => (
                    <SelectItem key={b} value={b}>{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label className="flex items-center gap-2">
              Faculty
              <span className="text-xs text-muted-foreground">
                🟢 {availFaculty.length} free · 🔴 {busyFaculty.length} busy
              </span>
            </Label>
            <Select value={form.facultyId} onValueChange={v => setForm(p => ({ ...p, facultyId: v }))}>
              <SelectTrigger><SelectValue placeholder="Select faculty" /></SelectTrigger>
              <SelectContent>
                {availFaculty.map(f => (
                  <SelectItem key={f.id} value={f.id}>
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-green-500" />
                      {f.name}
                    </span>
                  </SelectItem>
                ))}
                {busyFaculty.map(f => (
                  <SelectItem key={f.id} value={f.id} disabled>
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-red-500" />
                      {f.name} (busy)
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!isLabType ? (
            <div>
              <Label className="flex items-center gap-2">
                Classroom
                <span className="text-xs text-muted-foreground">
                  🟢 {availClassrooms.length} free
                </span>
              </Label>
              <Select value={form.classroomId} onValueChange={v => setForm(p => ({ ...p, classroomId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select classroom" /></SelectTrigger>
                <SelectContent>
                  {availClassrooms.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-green-500" />
                        {c.number} (cap: {c.capacity})
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div>
              <Label className="flex items-center gap-2">
                Lab
                <span className="text-xs text-muted-foreground">
                  🟢 {availLabs.length} free
                </span>
              </Label>
              <Select value={form.labId} onValueChange={v => setForm(p => ({ ...p, labId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select lab" /></SelectTrigger>
                <SelectContent>
                  {availLabs.map(l => (
                    <SelectItem key={l.id} value={l.id}>
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-green-500" />
                        {l.name} (cap: {l.capacity})
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button className="flex-1" onClick={handleSave}>
              {existingSlot ? 'Update' : 'Add'} Slot
            </Button>
            <Button variant="outline" size="icon" onClick={handleSuggest} title="Suggest best resources">
              <Lightbulb className="h-4 w-4" />
            </Button>
            {existingSlot && onDelete && (
              <Button variant="destructive" size="icon" onClick={() => { onDelete(existingSlot.id); onOpenChange(false); }}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SlotEditModal;
