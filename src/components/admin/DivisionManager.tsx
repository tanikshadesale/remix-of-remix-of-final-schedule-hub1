import { useState } from 'react';
import { useCollegeStore } from '@/store/collegeStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { YEARS } from '@/store/types';
import { dbAddDivision, dbRemoveDivision } from '@/hooks/useDbSync';

interface Props { departmentId: string; }

const DivisionManager = ({ departmentId }: Props) => {
  const { divisions } = useCollegeStore();
  const deptDivisions = divisions.filter(d => d.departmentId === departmentId);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', year: 'FE', batchCount: 3 as 3 | 4 });

  const handleAdd = async () => {
    if (!form.name) { toast.error('Name required'); return; }
    setSaving(true);
    try {
      await dbAddDivision({
        name: form.name,
        year: form.year,
        department_id: parseInt(departmentId),
        batch_count: form.batchCount,
      });
      setForm({ name: '', year: 'FE', batchCount: 3 });
      setOpen(false);
      toast.success('Division added to database');
    } catch (e: any) {
      toast.error(e.message);
    } finally { setSaving(false); }
  };

  const handleRemove = async (id: string) => {
    try {
      await dbRemoveDivision(id);
      toast.success('Division removed');
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Divisions ({deptDivisions.length})</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="mr-2 h-4 w-4" /> Add Division</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Division</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Division Name</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="SE1" /></div>
              <div><Label>Year</Label>
                <Select value={form.year} onValueChange={v => setForm(p => ({ ...p, year: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{YEARS.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Lab Batches</Label>
                <Select value={String(form.batchCount)} onValueChange={v => setForm(p => ({ ...p, batchCount: Number(v) as 3 | 4 }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="3">3 Batches</SelectItem><SelectItem value="4">4 Batches</SelectItem></SelectContent>
                </Select>
              </div>
              <Button className="w-full" onClick={handleAdd} disabled={saving}>
                {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Adding…</> : 'Add Division'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {YEARS.map(year => {
        const yearDivs = deptDivisions.filter(d => d.year === year);
        if (yearDivs.length === 0) return null;
        return (
          <div key={year} className="mb-4">
            <h4 className="text-sm font-medium text-muted-foreground mb-2">{year}</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {yearDivs.map(d => (
                <Card key={d.id}>
                  <CardContent className="py-3 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-foreground">{d.name}</p>
                      <p className="text-xs text-muted-foreground">{d.batchCount} batches</p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => handleRemove(d.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default DivisionManager;
