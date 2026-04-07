import { useState } from 'react';
import { useCollegeStore } from '@/store/collegeStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { dbAddFaculty, dbRemoveFaculty } from '@/hooks/useDbSync';

interface Props { departmentId: string; }

const FacultyManager = ({ departmentId }: Props) => {
  const { faculty, subjects } = useCollegeStore();
  const deptFaculty = faculty.filter(f => f.departmentId === departmentId);
  const deptSubjects = subjects.filter(s => s.departmentId === departmentId);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [form, setForm] = useState({
    name: '', email: '', password: '',
    teachingType: 'both' as 'theory' | 'lab' | 'both',
  });

  const handleAdd = async () => {
    if (!form.name || !form.email || !form.password) { toast.error('Name, email & password required'); return; }
    setSaving(true);
    try {
      await dbAddFaculty({
        name: form.name,
        email: form.email,
        department_id: parseInt(departmentId),
        password: form.password,
        subjects: selectedSubjects,
        teaching_type: form.teachingType,
      });
      setForm({ name: '', email: '', password: '', teachingType: 'both' });
      setSelectedSubjects([]);
      setOpen(false);
      toast.success('Faculty added to database');
    } catch (e: any) {
      toast.error(e.message);
    } finally { setSaving(false); }
  };

  const handleRemove = async (id: string) => {
    try {
      await dbRemoveFaculty(id);
      toast.success('Faculty removed');
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Faculty ({deptFaculty.length})</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="mr-2 h-4 w-4" /> Add Faculty</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Faculty</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Full Name</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
              <div><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></div>
              <div><Label>Password</Label><Input type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} placeholder="Set faculty password" /></div>
              <div><Label>Teaching Type</Label>
                <Select value={form.teachingType} onValueChange={(v: 'theory' | 'lab' | 'both') => setForm(p => ({ ...p, teachingType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="theory">Theory</SelectItem>
                    <SelectItem value="lab">Lab</SelectItem>
                    <SelectItem value="both">Both</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Subjects</Label>
                <div className="border rounded-md p-2 max-h-40 overflow-y-auto space-y-1.5 mt-1">
                  {deptSubjects.length === 0 && (
                    <p className="text-xs text-muted-foreground">No subjects added yet</p>
                  )}
                  {deptSubjects.map(s => (
                    <label key={s.id} className="flex items-center gap-2 cursor-pointer text-sm">
                      <Checkbox
                        checked={selectedSubjects.includes(s.name)}
                        onCheckedChange={(checked) => {
                          setSelectedSubjects(prev =>
                            checked ? [...prev, s.name] : prev.filter(n => n !== s.name)
                          );
                        }}
                      />
                      {s.name} <span className="text-muted-foreground">({s.type})</span>
                    </label>
                  ))}
                </div>
              </div>
              <Button className="w-full" onClick={handleAdd} disabled={saving}>
                {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Adding…</> : 'Add Faculty'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-2">
        {deptFaculty.map(f => (
          <Card key={f.id}>
            <CardContent className="py-3 flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground">{f.name}</p>
                <p className="text-xs text-muted-foreground">{f.email}</p>
                <div className="flex gap-1 mt-1 flex-wrap">
                  <Badge variant="outline">{f.teachingType}</Badge>
                  {f.subjects.map(s => <Badge key={s} variant="secondary">{s}</Badge>)}
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => handleRemove(f.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default FacultyManager;
