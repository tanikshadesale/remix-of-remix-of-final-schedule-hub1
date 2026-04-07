import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCollegeStore } from '@/store/collegeStore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GraduationCap, ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { dbAuth } from '@/lib/dbService';

const LoginPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const deptId = searchParams.get('dept');
  const isSuperAdmin = searchParams.get('role') === 'super_admin';
  const { login, departments } = useCollegeStore();

  const dept = deptId ? departments.find(d => d.id === deptId) : null;

  const [adminForm, setAdminForm] = useState({ email: '', password: '', key: '' });
  const [facultyForm, setFacultyForm] = useState({ email: '', password: '' });
  const [superForm, setSuperForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);

  const handleAdminLogin = async () => {
    if (!adminForm.email || !adminForm.password || !adminForm.key) {
      toast.error('All fields required'); return;
    }
    setLoading(true);
    try {
      const result = await dbAuth.adminLogin({
        email: adminForm.email,
        password: adminForm.password,
        department_key: adminForm.key,
      });
      // Set user in store
      useCollegeStore.setState({
        currentUser: {
          email: result.admin_email,
          role: 'admin',
          departmentId: String(result.id),
          name: result.name + ' Admin',
        }
      });
      toast.success('Logged in as admin');
      navigate('/admin');
    } catch (e: any) {
      toast.error(e.message || 'Invalid credentials');
    } finally { setLoading(false); }
  };

  const handleFacultyLogin = async () => {
    if (!facultyForm.email || !facultyForm.password) {
      toast.error('Email & password required'); return;
    }
    setLoading(true);
    try {
      const result = await dbAuth.facultyLogin({
        email: facultyForm.email,
        password: facultyForm.password,
      });
      useCollegeStore.setState({
        currentUser: {
          email: result.email,
          role: 'faculty',
          departmentId: String(result.department_id),
          facultyId: String(result.id),
          name: result.name,
        }
      });
      toast.success('Logged in as faculty');
      navigate('/faculty');
    } catch (e: any) {
      toast.error(e.message || 'Invalid credentials');
    } finally { setLoading(false); }
  };

  const handleSuperLogin = () => {
    const err = login(superForm.email, superForm.password);
    if (err) { toast.error(err); return; }
    toast.success('Logged in as super admin');
    navigate('/super-admin');
  };

  if (isSuperAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <Button variant="ghost" size="sm" className="w-fit mb-2" onClick={() => navigate('/')}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <div className="flex items-center gap-2">
              <GraduationCap className="h-6 w-6 text-accent" />
              <CardTitle>Super Admin Login</CardTitle>
            </div>
            <CardDescription>Manage the entire college system</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={superForm.email} onChange={e => setSuperForm(p => ({ ...p, email: e.target.value }))} placeholder="admin@college.edu" />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input type="password" value={superForm.password} onChange={e => setSuperForm(p => ({ ...p, password: e.target.value }))} />
            </div>
            <Button className="w-full" onClick={handleSuperLogin}>Login</Button>
            <p className="text-xs text-muted-foreground text-center">Default: admin@college.edu / admin123</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <Button variant="ghost" size="sm" className="w-fit mb-2" onClick={() => navigate('/')}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <div className="flex items-center gap-2">
            <GraduationCap className="h-6 w-6 text-accent" />
            <CardTitle>{dept ? `${dept.name} Login` : 'Department Login'}</CardTitle>
          </div>
          <CardDescription>Login as admin or faculty</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="admin">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="admin">Admin</TabsTrigger>
              <TabsTrigger value="faculty">Faculty</TabsTrigger>
            </TabsList>

            <TabsContent value="admin" className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={adminForm.email} onChange={e => setAdminForm(p => ({ ...p, email: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <Input type="password" value={adminForm.password} onChange={e => setAdminForm(p => ({ ...p, password: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Department Key</Label>
                <Input value={adminForm.key} onChange={e => setAdminForm(p => ({ ...p, key: e.target.value }))} />
              </div>
              <Button className="w-full" onClick={handleAdminLogin} disabled={loading}>
                {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Logging in…</> : 'Login as Admin'}
              </Button>
            </TabsContent>

            <TabsContent value="faculty" className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={facultyForm.email} onChange={e => setFacultyForm(p => ({ ...p, email: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <Input type="password" value={facultyForm.password} onChange={e => setFacultyForm(p => ({ ...p, password: e.target.value }))} />
              </div>
              <Button className="w-full" onClick={handleFacultyLogin} disabled={loading}>
                {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Logging in…</> : 'Login as Faculty'}
              </Button>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default LoginPage;
