import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCollegeStore } from '@/store/collegeStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LogOut, Calendar, BookOpen, Loader2, GraduationCap, BarChart3 } from 'lucide-react';
import DraggableTimetableGrid from '@/components/timetable/DraggableTimetableGrid';
import { useDbSync } from '@/hooks/useDbSync';
import AvailabilityGrid from '@/components/availability/AvailabilityGrid';

const FacultyDashboard = () => {
  const navigate = useNavigate();
  const { currentUser, logout, masterTimetables, timetables } = useCollegeStore();
  const { loading } = useDbSync();

  const mySlots = useMemo(() => {
    if (!currentUser || currentUser.role !== 'faculty') return [];
    const masterSlots = masterTimetables
      .filter(t => t.departmentId === currentUser.departmentId)
      .flatMap(t => t.facultyTimetables[currentUser.facultyId || ''] || []);
    if (masterSlots.length > 0) return masterSlots;
    return timetables
      .filter(t => t.departmentId === currentUser.departmentId)
      .flatMap(t => t.slots)
      .filter(s => s.facultyId === currentUser.facultyId);
  }, [masterTimetables, timetables, currentUser]);

  const uniqueSubjects = useMemo(() => {
    const seen = new Set<string>();
    return mySlots.filter(s => !s.isBreak && s.subjectName).filter(s => {
      if (seen.has(s.subjectId)) return false;
      seen.add(s.subjectId);
      return true;
    });
  }, [mySlots]);

  const lectureCount = mySlots.filter(s => !s.isBreak).length;

  if (!currentUser || currentUser.role !== 'faculty') {
    navigate('/');
    return null;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">Loading…</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
              <GraduationCap className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-foreground leading-tight">Faculty Dashboard</h1>
              <p className="text-xs text-muted-foreground">{currentUser.name}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => { logout(); navigate('/'); }}>
            <LogOut className="mr-1.5 h-4 w-4" /> Logout
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-6 py-6 space-y-6 max-w-6xl">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card>
            <CardContent className="py-4 flex items-center gap-3">
              <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center">
                <Calendar className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xl font-semibold text-foreground">{lectureCount}</p>
                <p className="text-xs text-muted-foreground">Weekly lectures</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 flex items-center gap-3">
              <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center">
                <BookOpen className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xl font-semibold text-foreground">{uniqueSubjects.length}</p>
                <p className="text-xs text-muted-foreground">Subjects assigned</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <p className="text-xs font-medium text-muted-foreground mb-2">Assigned Subjects</p>
              <div className="flex flex-wrap gap-1.5">
                {uniqueSubjects.map(s => (
                  <span key={s.subjectId} className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded">
                    {s.subjectName}
                  </span>
                ))}
                {uniqueSubjects.length === 0 && <span className="text-xs text-muted-foreground">None assigned</span>}
              </div>
            </CardContent>
          </Card>
        </div>

        <section>
          <h2 className="text-sm font-semibold text-foreground mb-3">My Timetable</h2>
          {mySlots.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No lectures assigned yet.</CardContent></Card>
          ) : (
            <DraggableTimetableGrid slots={mySlots} editable={false} />
          )}
        </section>

        {/* Available Resources */}
        <section>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                Available Resources
              </CardTitle>
              <p className="text-xs text-muted-foreground">Free classrooms, labs, and faculty slots</p>
            </CardHeader>
            <CardContent>
              <AvailabilityGrid compact />
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
};

export default FacultyDashboard;
