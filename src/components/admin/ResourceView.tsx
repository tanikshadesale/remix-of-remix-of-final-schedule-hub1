import { useState } from 'react';
import { useCollegeStore } from '@/store/collegeStore';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { DoorOpen, FlaskConical, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { DAYS } from '@/store/types';
import type { DayAvailability } from '@/store/types';
import { dbAddClassroom, dbRemoveClassroom, dbAddLab, dbRemoveLab } from '@/hooks/useDbSync';
import { Loader2 } from 'lucide-react';

interface Props {
  departmentId: string;
}

const defaultAvail = (): DayAvailability[] =>
  DAYS.map(d => ({ day: d, enabled: true, startTime: '08:15', endTime: '17:30' }));

const ResourceView = ({ departmentId }: Props) => {
  const { classrooms, labs, removeClassroom, removeLab, departments } = useCollegeStore();
  const [saving, setSaving] = useState(false);

  const deptClassrooms = classrooms.filter(c => c.departmentId === departmentId);
  const deptLabs = labs.filter(l => l.departmentId === departmentId);
  const sharedClassrooms = classrooms.filter(c => !c.departmentId);
  const sharedLabs = labs.filter(l => !l.departmentId);

  const [classroomOpen, setClassroomOpen] = useState(false);
  const [labOpen, setLabOpen] = useState(false);

  const [crForm, setCrForm] = useState({ number: '', capacity: '', availability: defaultAvail() });
  const [labForm, setLabForm] = useState({ name: '', capacity: '', batchSize: '', availability: defaultAvail() });

  const handleAddClassroom = async () => {
    if (!crForm.number) { toast.error('Room number required'); return; }
    setSaving(true);
    try {
      await dbAddClassroom({
        room_number: crForm.number,
        department_id: parseInt(departmentId),
      });
      setCrForm({ number: '', capacity: '', availability: defaultAvail() });
      setClassroomOpen(false);
      toast.success('Classroom added to database');
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const handleAddLab = async () => {
    if (!labForm.name) { toast.error('Lab name required'); return; }
    setSaving(true);
    try {
      await dbAddLab({
        lab_name: labForm.name,
        department_id: parseInt(departmentId),
        batch_support: Number(labForm.batchSize) || 3,
      });
      setLabForm({ name: '', capacity: '', batchSize: '', availability: defaultAvail() });
      setLabOpen(false);
      toast.success('Lab added to database');
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const updateAvail = (
    avails: DayAvailability[],
    day: string,
    field: keyof DayAvailability,
    value: string | boolean
  ): DayAvailability[] =>
    avails.map(a => a.day === day ? { ...a, [field]: value } : a);

  return (
    <div className="space-y-8">
      {/* Classrooms */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <DoorOpen className="h-5 w-5 text-accent" />
            <h3 className="text-lg font-semibold">Department Classrooms ({deptClassrooms.length})</h3>
          </div>
          <Dialog open={classroomOpen} onOpenChange={setClassroomOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="mr-2 h-4 w-4" /> Add Classroom</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Add Classroom</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Room Number</Label><Input value={crForm.number} onChange={e => setCrForm(p => ({ ...p, number: e.target.value }))} placeholder="101" /></div>
                  <div><Label>Capacity</Label><Input type="number" value={crForm.capacity} onChange={e => setCrForm(p => ({ ...p, capacity: e.target.value }))} placeholder="60" /></div>
                </div>
                <div>
                  <Label className="mb-2 block text-sm font-medium">Day-wise Availability</Label>
                  <div className="space-y-2 max-h-[240px] overflow-y-auto">
                    {crForm.availability.map(a => (
                      <div key={a.day} className="flex items-center gap-2 text-sm">
                        <Switch checked={a.enabled} onCheckedChange={v => setCrForm(p => ({ ...p, availability: updateAvail(p.availability, a.day, 'enabled', v) }))} />
                        <span className="w-20 text-foreground">{a.day}</span>
                        <Input className="w-24 h-8 text-xs" type="time" value={a.startTime} onChange={e => setCrForm(p => ({ ...p, availability: updateAvail(p.availability, a.day, 'startTime', e.target.value) }))} disabled={!a.enabled} />
                        <span className="text-muted-foreground">–</span>
                        <Input className="w-24 h-8 text-xs" type="time" value={a.endTime} onChange={e => setCrForm(p => ({ ...p, availability: updateAvail(p.availability, a.day, 'endTime', e.target.value) }))} disabled={!a.enabled} />
                      </div>
                    ))}
                  </div>
                </div>
                <Button className="w-full" onClick={handleAddClassroom}>Add Classroom</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {deptClassrooms.map(c => (
            <Card key={c.id}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-foreground">{c.number}</p>
                    <p className="text-sm text-muted-foreground">Capacity: {c.capacity}</p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={async () => { try { await dbRemoveClassroom(c.id); toast.success('Removed'); } catch(e:any) { toast.error(e.message); } }}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
                <div className="mt-2 space-y-0.5">
                  {c.availability.filter(a => a.enabled).map(a => (
                    <p key={a.day} className="text-xs text-muted-foreground">{a.day}: {a.startTime}–{a.endTime}</p>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        {sharedClassrooms.length > 0 && (
          <div className="mt-4">
            <p className="text-xs text-muted-foreground mb-2">Shared/Unassigned Classrooms ({sharedClassrooms.length})</p>
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
              {sharedClassrooms.map(c => (
                <div key={c.id} className="text-xs border rounded px-2 py-1.5 text-muted-foreground">
                  {c.number} (Cap: {c.capacity})
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Labs */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-accent" />
            <h3 className="text-lg font-semibold">Department Labs ({deptLabs.length})</h3>
          </div>
          <Dialog open={labOpen} onOpenChange={setLabOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="mr-2 h-4 w-4" /> Add Lab</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Add Lab</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div><Label>Lab Name</Label><Input value={labForm.name} onChange={e => setLabForm(p => ({ ...p, name: e.target.value }))} placeholder="CS Lab 1" /></div>
                  <div><Label>Capacity</Label><Input type="number" value={labForm.capacity} onChange={e => setLabForm(p => ({ ...p, capacity: e.target.value }))} placeholder="30" /></div>
                  <div><Label>Batch Size</Label><Input type="number" value={labForm.batchSize} onChange={e => setLabForm(p => ({ ...p, batchSize: e.target.value }))} placeholder="20" /></div>
                </div>
                <div>
                  <Label className="mb-2 block text-sm font-medium">Day-wise Availability</Label>
                  <div className="space-y-2 max-h-[240px] overflow-y-auto">
                    {labForm.availability.map(a => (
                      <div key={a.day} className="flex items-center gap-2 text-sm">
                        <Switch checked={a.enabled} onCheckedChange={v => setLabForm(p => ({ ...p, availability: updateAvail(p.availability, a.day, 'enabled', v) }))} />
                        <span className="w-20 text-foreground">{a.day}</span>
                        <Input className="w-24 h-8 text-xs" type="time" value={a.startTime} onChange={e => setLabForm(p => ({ ...p, availability: updateAvail(p.availability, a.day, 'startTime', e.target.value) }))} disabled={!a.enabled} />
                        <span className="text-muted-foreground">–</span>
                        <Input className="w-24 h-8 text-xs" type="time" value={a.endTime} onChange={e => setLabForm(p => ({ ...p, availability: updateAvail(p.availability, a.day, 'endTime', e.target.value) }))} disabled={!a.enabled} />
                      </div>
                    ))}
                  </div>
                </div>
                <Button className="w-full" onClick={handleAddLab}>Add Lab</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {deptLabs.map(l => (
            <Card key={l.id}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-foreground">{l.name}</p>
                    <p className="text-sm text-muted-foreground">Capacity: {l.capacity} | Batch: {l.batchSize}</p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={async () => { try { await dbRemoveLab(l.id); toast.success('Removed'); } catch(e:any) { toast.error(e.message); } }}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
                <div className="mt-2 space-y-0.5">
                  {l.availability.filter(a => a.enabled).map(a => (
                    <p key={a.day} className="text-xs text-muted-foreground">{a.day}: {a.startTime}–{a.endTime}</p>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        {sharedLabs.length > 0 && (
          <div className="mt-4">
            <p className="text-xs text-muted-foreground mb-2">Shared/Unassigned Labs ({sharedLabs.length})</p>
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
              {sharedLabs.map(l => (
                <div key={l.id} className="text-xs border rounded px-2 py-1.5 text-muted-foreground">
                  {l.name} (Cap: {l.capacity})
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

export default ResourceView;
