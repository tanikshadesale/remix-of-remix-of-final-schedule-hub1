import { useNavigate } from 'react-router-dom';
import { useCollegeStore } from '@/store/collegeStore';
import { Building2, GraduationCap, LogIn, Settings, ArrowRight, BarChart3 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import AvailabilityGrid from '@/components/availability/AvailabilityGrid';

const HomePage = () => {
  const navigate = useNavigate();
  const { departments } = useCollegeStore();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
              <GraduationCap className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-sm font-semibold text-foreground">Smart Timetable</span>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate('/login')}>
              <LogIn className="mr-1.5 h-4 w-4" />
              Login
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('/login?role=super_admin')}>
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8 space-y-8 max-w-6xl">
        {/* Departments */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Departments</h2>
          </div>
          {departments.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No departments yet. Login as super admin to create.</CardContent></Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {departments.map(dept => (
                <Card key={dept.id} className="cursor-pointer group hover:border-primary/40 transition-colors" onClick={() => navigate(`/login?dept=${dept.id}`)}>
                  <CardContent className="py-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">{dept.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Click to login</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Global Availability Dashboard */}
        <section>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                Global Resource Availability
              </CardTitle>
              <p className="text-xs text-muted-foreground">Real-time availability of classrooms, labs, and faculty across all departments</p>
            </CardHeader>
            <CardContent>
              <AvailabilityGrid />
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
};

export default HomePage;