import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCollegeStore } from '@/store/collegeStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Building2, DoorOpen, FlaskConical, LogOut, Plus, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { DAYS } from '@/store/types';
import { useDbSync, dbAddDepartment, dbRemoveDepartment, dbAddClassroom, dbRemoveClassroom, dbAddLab, dbRemoveLab } from '@/hooks/useDbSync';

const SuperAdminPage = () => {
  const navigate = useNavigate();
  const { currentUser, logout, departments, classrooms, labs } = useCollegeStore();
  const { loading, error } = useDbSync();

  const [deptForm, setDeptForm] = useState({ name: '', adminEmail: '', adminPassword: '', departmentKey: '' });
  const [classForm, setClassForm] = useState({ number: '', capacity: '' });
  const [labForm, setLabForm] = useState({ name: '', capacity: '', batchSize: '' });
  const [openDept, setOpenDept] = useState(false);
  const [openClass, setOpenClass] = useState(false);
  const [openLab, setOpenLab] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!currentUser || currentUser.role !== 'super_admin') {
    navigate('/');
    return null;
  }

  const handleAddDept = async () => {
    if (!deptForm.name || !deptForm.adminEmail || !deptForm.departmentKey || !deptForm.adminPassword) {
      toast.error('Name, email, password & key required'); return;
    }
    setSaving(true);
    try {
      await dbAddDepartment({ name: deptForm.name, admin_email: deptForm.adminEmail, department_key: deptForm.departmentKey, password: deptForm.adminPassword });
      setDeptForm({ name: '', adminEmail: '', adminPassword: '', departmentKey: '' });
      setOpenDept(false);
      toast.success('Department created');
    } catch (e: any) {
      toast.error(e.message);
    } finally { setSaving(false); }
  };

  const handleAddClassroom = async () => {
    if (!classForm.number) { toast.error('Room number required'); return; }
    setSaving(true);
    try {
      await dbAddClassroom({ room_number: classForm.number });
      setClassForm({ number: '', capacity: '' });
      setOpenClass(false);
      toast.success('Classroom added');
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const handleAddLab = async () => {
    if (!labForm.name) { toast.error('Lab name required'); return; }
    setSaving(true);
    try {
      await dbAddLab({ lab_name: labForm.name, batch_support: Number(labForm.batchSize) || 3 });
      setLabForm({ name: '', capacity: '', batchSize: '' });
      setOpenLab(false);
      toast.success('Lab added');
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const handleDeleteDept = async (id: string) => {
    try { await dbRemoveDepartment(id); toast.success('Deleted'); }
    catch (e: any) { toast.error(e.message); }
  };

  const handleDeleteClassroom = async (id: string) => {
    try { await dbRemoveClassroom(id); } catch (e: any) { toast.error(e.message); }
  };

  const handleDeleteLab = async (id: string) => {
    try { await dbRemoveLab(id); } catch (e: any) { toast.error(e.message); }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground">Loading from database…</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <h1 className="text-xl font-bold text-foreground">Super Admin Dashboard</h1>
          <Button variant="outline" size="sm" onClick={() => { logout(); navigate('/'); }}>
            <LogOut className="mr-2 h-4 w-4" /> Logout
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-8">
        {error && (
          <div className="bg-destructive/10 text-destructive p-4 rounded-md text-sm">
            Database error: {error}. Showing cached data.
          </div>
        )}

        {/* Departments */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-accent" />
              <h2 className="text-lg font-semibold">Departments ({departments.length})</h2>
            </div>
            <Dialog open={openDept} onOpenChange={setOpenDept}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="mr-2 h-4 w-4" /> Add Department</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Create Department</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>Department Name</Label><Input value={deptForm.name} onChange={e => setDeptForm(p => ({ ...p, name: e.target.value }))} placeholder="Computer Engineering" /></div>
                  <div><Label>Admin Email</Label><Input value={deptForm.adminEmail} onChange={e => setDeptForm(p => ({ ...p, adminEmail: e.target.value }))} /></div>
                  <div><Label>Admin Password</Label><Input type="password" value={deptForm.adminPassword} onChange={e => setDeptForm(p => ({ ...p, adminPassword: e.target.value }))} placeholder="Set admin password" /></div>
                  <div><Label>Unique Department Key</Label><Input value={deptForm.departmentKey} onChange={e => setDeptForm(p => ({ ...p, departmentKey: e.target.value }))} placeholder="CS2025" /></div>
                  <Button className="w-full" onClick={handleAddDept} disabled={saving}>
                    {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating…</> : 'Create'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {departments.map(d => (
              <Card key={d.id}>
                <CardContent className="py-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-foreground">{d.name}</p>
                    <p className="text-xs text-muted-foreground">Key: {d.departmentKey}</p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => handleDeleteDept(d.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Classrooms */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <DoorOpen className="h-5 w-5 text-accent" />
              <h2 className="text-lg font-semibold">Classrooms ({classrooms.length})</h2>
            </div>
            <Dialog open={openClass} onOpenChange={setOpenClass}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="mr-2 h-4 w-4" /> Add Classroom</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add Classroom</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>Room Number</Label><Input value={classForm.number} onChange={e => setClassForm(p => ({ ...p, number: e.target.value }))} placeholder="101" /></div>
                  <Button className="w-full" onClick={handleAddClassroom} disabled={saving}>
                    {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Adding…</> : 'Add'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {classrooms.map(c => (
              <Card key={c.id}>
                <CardContent className="py-3 flex items-center justify-between">
                  <p className="font-medium text-foreground">{c.number}</p>
                  <Button variant="ghost" size="icon" onClick={() => handleDeleteClassroom(c.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Labs */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-accent" />
              <h2 className="text-lg font-semibold">Labs ({labs.length})</h2>
            </div>
            <Dialog open={openLab} onOpenChange={setOpenLab}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="mr-2 h-4 w-4" /> Add Lab</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add Lab</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>Lab Name</Label><Input value={labForm.name} onChange={e => setLabForm(p => ({ ...p, name: e.target.value }))} placeholder="Computer Lab 1" /></div>
                  <div><Label>Batch Size</Label><Input type="number" value={labForm.batchSize} onChange={e => setLabForm(p => ({ ...p, batchSize: e.target.value }))} /></div>
                  <Button className="w-full" onClick={handleAddLab} disabled={saving}>
                    {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Adding…</> : 'Add'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {labs.map(l => (
              <Card key={l.id}>
                <CardContent className="py-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-foreground">{l.name}</p>
                    <p className="text-xs text-muted-foreground">Batch: {l.batchSize}</p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => handleDeleteLab(l.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
};

export default SuperAdminPage;
