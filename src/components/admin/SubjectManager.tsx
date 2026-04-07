import { useState } from 'react';
import { useCollegeStore } from '@/store/collegeStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { YEARS } from '@/store/types';
import { dbAddSubject, dbRemoveSubject } from '@/hooks/useDbSync';

interface Props { departmentId: string; }

const SubjectManager = ({ departmentId }: Props) => {
  const { subjects } = useCollegeStore();
  const deptSubjects = subjects.filter(s => s.departmentId === departmentId);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '', year: 'FE', type: 'compulsory' as 'compulsory' | 'optional' | 'mini_project' | 'honours',
    lectureType: 'theory' as 'theory' | 'lab' | 'theory_and_lab',
    labsPerWeek: 1 as 1 | 2,
    miniProjectHours: 2,
    honoursLecturesPerWeek: 4,
  });

  const handleAdd = async () => {
    if (!form.name) { toast.error('Name required'); return; }
    setSaving(true);
    try {
      await dbAddSubject({
        name: form.name,
        type: form.type,
        department_id: parseInt(departmentId),
        theory_per_week: 3,
        has_lab: form.lectureType === 'lab' || form.lectureType === 'theory_and_lab',
        year: form.year,
        lecture_type: form.lectureType,
      });
      setForm({ name: '', year: 'FE', type: 'compulsory', lectureType: 'theory', labsPerWeek: 1, miniProjectHours: 2, honoursLecturesPerWeek: 4 });
      setOpen(false);
      toast.success('Subject added to database');
    } catch (e: any) {
      toast.error(e.message);
    } finally { setSaving(false); }
  };

  const handleRemove = async (id: string) => {
    try {
      await dbRemoveSubject(id);
      toast.success('Subject removed');
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Subjects ({deptSubjects.length})</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="mr-2 h-4 w-4" /> Add Subject</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Subject</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Name</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
              <div><Label>Year</Label>
                <Select value={form.year} onValueChange={v => setForm(p => ({ ...p, year: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{YEARS.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Type</Label>
                <Select value={form.type} onValueChange={(v: 'compulsory' | 'optional' | 'mini_project' | 'honours') => setForm(p => ({ ...p, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="compulsory">Compulsory</SelectItem>
                    <SelectItem value="optional">Optional</SelectItem>
                    <SelectItem value="mini_project">Mini Project (TE/BE)</SelectItem>
                    <SelectItem value="honours">Honours (TE/BE)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.type === 'mini_project' && (
                <div><Label>Continuous Hours</Label>
                  <Input type="number" min={2} max={4} value={form.miniProjectHours} onChange={e => setForm(p => ({ ...p, miniProjectHours: Number(e.target.value) }))} />
                </div>
              )}
              {form.type === 'honours' && (
                <div><Label>Lectures per Week</Label>
                  <Input type="number" min={1} max={6} value={form.honoursLecturesPerWeek} onChange={e => setForm(p => ({ ...p, honoursLecturesPerWeek: Number(e.target.value) }))} />
                </div>
              )}
              <div><Label>Lecture Type</Label>
                <Select value={form.lectureType} onValueChange={(v: 'theory' | 'lab' | 'theory_and_lab') => setForm(p => ({ ...p, lectureType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="theory">Theory Only</SelectItem>
                    <SelectItem value="lab">Lab Only</SelectItem>
                    <SelectItem value="theory_and_lab">Theory & Lab</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(form.lectureType === 'lab' || form.lectureType === 'theory_and_lab') && (
                <div><Label>Labs per Week</Label>
                  <Select value={String(form.labsPerWeek)} onValueChange={v => setForm(p => ({ ...p, labsPerWeek: Number(v) as 1 | 2 }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="1">1</SelectItem><SelectItem value="2">2</SelectItem></SelectContent>
                  </Select>
                </div>
              )}
              <Button className="w-full" onClick={handleAdd} disabled={saving}>
                {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Adding…</> : 'Add Subject'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-2">
        {deptSubjects.length === 0 && (
          <p className="text-sm text-muted-foreground">No subjects added yet.</p>
        )}
        {deptSubjects.map(s => (
          <Card key={s.id}>
            <CardContent className="py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-medium text-foreground">{s.name}</span>
                {s.year && <Badge variant="default">{s.year}</Badge>}
                <Badge variant="secondary">{s.type}</Badge>
                <Badge variant="outline">{s.lectureType.replace('_', ' & ')}</Badge>
              </div>
              <Button variant="ghost" size="icon" onClick={() => handleRemove(s.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default SubjectManager;
