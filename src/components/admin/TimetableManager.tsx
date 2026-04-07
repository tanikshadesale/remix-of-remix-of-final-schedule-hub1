import { useState } from 'react';
import { useCollegeStore } from '@/store/collegeStore';
import { generateMasterTimetable } from '@/store/geneticAlgorithm';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Trash2, Eye, Zap, Edit2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { YEARS } from '@/store/types';
import type { GenerationConfig, TimetableSlot } from '@/store/types';
import MasterTimetableView from '@/components/timetable/MasterTimetableView';
import ManualMasterBuilder from '@/components/timetable/ManualMasterBuilder';
import { rebuildFacultyTimetables } from '@/lib/timetableUtils';
import { dbSaveTimetable } from '@/hooks/useDbSync';

interface Props { departmentId: string; }

const TimetableManager = ({ departmentId }: Props) => {
  const {
    masterTimetables, addMasterTimetable, deleteMasterTimetable, updateMasterTimetable,
    finalizeMasterTimetable, divisions, subjects, faculty, classrooms, labs
  } = useCollegeStore();
  const deptMasterTTs = masterTimetables.filter(t => t.departmentId === departmentId);
  const deptDivisions = divisions.filter(d => d.departmentId === departmentId);

  const [generateOpen, setGenerateOpen] = useState(false);
  const [genForm, setGenForm] = useState<GenerationConfig & { name: string }>({
    name: '',
    enableMiniProject: false,
    enableHonours: false,
    enableFlexibleBreaks: true,
    selectedYears: [],
  });
  const [generating, setGenerating] = useState(false);
  const [viewingMasterId, setViewingMasterId] = useState<string | null>(null);
  const [editingMasterId, setEditingMasterId] = useState<string | null>(null);
  const [creatingManual, setCreatingManual] = useState(false);

  const handleGenerate = () => {
    if (!genForm.name) { toast.error('Name required'); return; }
    if (genForm.selectedYears.length === 0) { toast.error('Select at least one year'); return; }

    const selectedDivisions = deptDivisions.filter(d => genForm.selectedYears.includes(d.year));
    if (selectedDivisions.length === 0) { toast.error('No divisions found for selected years'); return; }

    setGenerating(true);
    setTimeout(async () => {
      try {
        const deptSubjects = subjects.filter(s => s.departmentId === departmentId);
        const deptFaculty = faculty.filter(f => f.departmentId === departmentId);
        const deptClassrooms = classrooms.filter(c => !c.departmentId || c.departmentId === departmentId);
        const deptLabs = labs.filter(l => !l.departmentId || l.departmentId === departmentId);

        const result = generateMasterTimetable({
          divisions: selectedDivisions,
          subjects: deptSubjects,
          faculty: deptFaculty,
          classrooms: deptClassrooms,
          labs: deptLabs,
          config: genForm,
          departmentId,
        });

        addMasterTimetable({
          departmentId,
          name: genForm.name,
          config: genForm,
          divisionTimetables: result.divisionTimetables,
          facultyTimetables: result.facultyTimetables,
          breakSchedule: result.breakSchedule,
          isFinalized: false,
        });

        // Save to database
        try {
          const allSlots = Object.values(result.divisionTimetables).flat();
          await dbSaveTimetable(departmentId, allSlots);
          toast.success('Master timetable generated and saved to database!');
        } catch (dbErr: any) {
          console.error('DB save error:', dbErr);
          toast.success('Timetable generated (local). DB save failed: ' + dbErr.message);
        }
        setGenerateOpen(false);
        setGenForm({ name: '', enableMiniProject: false, enableHonours: false, enableFlexibleBreaks: true, selectedYears: [] });
      } catch (e) {
        toast.error('Generation failed. Check your data configuration.');
        console.error(e);
      } finally {
        setGenerating(false);
      }
    }, 100);
  };

  const toggleYear = (year: string) => {
    setGenForm(prev => ({
      ...prev,
      selectedYears: prev.selectedYears.includes(year)
        ? prev.selectedYears.filter(y => y !== year)
        : [...prev.selectedYears, year],
    }));
  };

  const viewingMasterTT = deptMasterTTs.find(t => t.id === viewingMasterId);
  const editingMasterTT = deptMasterTTs.find(t => t.id === editingMasterId);

  if (creatingManual) {
    return (
      <ManualMasterBuilder
        departmentId={departmentId}
        onBack={() => setCreatingManual(false)}
        onSave={({ divisionTimetables, facultyTimetables, name }) => {
          addMasterTimetable({
            departmentId,
            name,
            config: { enableMiniProject: true, enableHonours: true, enableFlexibleBreaks: false, selectedYears: [] },
            divisionTimetables,
            facultyTimetables,
            breakSchedule: {},
            isFinalized: false,
          });
          setCreatingManual(false);
        }}
      />
    );
  }

  if (editingMasterTT) {
    return (
      <ManualMasterBuilder
        departmentId={departmentId}
        existingMasterTT={editingMasterTT}
        onBack={() => setEditingMasterId(null)}
        onSave={({ divisionTimetables, facultyTimetables }) => {
          updateMasterTimetable(editingMasterTT.id, divisionTimetables, facultyTimetables);
          setEditingMasterId(null);
        }}
        onFinalize={() => {
          finalizeMasterTimetable(editingMasterTT.id);
          setEditingMasterId(null);
          toast.success('Timetable finalized');
        }}
      />
    );
  }

  if (viewingMasterTT) {
    return (
      <MasterTimetableView
        masterTimetable={viewingMasterTT}
        departmentId={departmentId}
        onBack={() => setViewingMasterId(null)}
        onEdit={() => { setViewingMasterId(null); setEditingMasterId(viewingMasterTT.id); }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Master Timetables ({deptMasterTTs.length})</h3>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setCreatingManual(true)}>
              <Plus className="mr-2 h-4 w-4" /> Manual Builder
            </Button>
            <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90">
                  <Zap className="mr-2 h-4 w-4" /> Generate (GA)
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>Generate Master Timetable</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Timetable Name</Label>
                    <Input value={genForm.name} onChange={e => setGenForm(p => ({ ...p, name: e.target.value }))} placeholder="Sem 1 Master Timetable" />
                  </div>

                  <div>
                    <Label className="mb-2 block">Select Years to Include</Label>
                    <div className="flex flex-wrap gap-3">
                      {YEARS.map(year => {
                        const divCount = deptDivisions.filter(d => d.year === year).length;
                        return (
                          <label key={year} className="flex items-center gap-2 cursor-pointer">
                            <Checkbox
                              checked={genForm.selectedYears.includes(year)}
                              onCheckedChange={() => toggleYear(year)}
                              disabled={divCount === 0}
                            />
                            <span className={divCount === 0 ? 'text-muted-foreground' : 'text-foreground'}>
                              {year} ({divCount} div{divCount !== 1 ? 's' : ''})
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-3 border-t pt-3">
                    <Label className="text-sm font-semibold">Generation Options</Label>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-foreground">Mini Project Slots</p>
                        <p className="text-xs text-muted-foreground">SE, TE & BE — continuous 2hr blocks</p>
                      </div>
                      <Switch checked={genForm.enableMiniProject} onCheckedChange={v => setGenForm(p => ({ ...p, enableMiniProject: v }))} />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-foreground">Honours Lectures</p>
                        <p className="text-xs text-muted-foreground">TE & BE combined, 4/week, end of day</p>
                      </div>
                      <Switch checked={genForm.enableHonours} onCheckedChange={v => setGenForm(p => ({ ...p, enableHonours: v }))} />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-foreground">Flexible Breaks</p>
                        <p className="text-xs text-muted-foreground">Different break times per class</p>
                      </div>
                      <Switch checked={genForm.enableFlexibleBreaks} onCheckedChange={v => setGenForm(p => ({ ...p, enableFlexibleBreaks: v }))} />
                    </div>
                  </div>

                  <Button className="w-full" onClick={handleGenerate} disabled={generating}>
                    {generating ? 'Generating… (this may take a moment)' : 'Generate Timetable'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="space-y-3">
          {deptMasterTTs.map(t => (
            <Card key={t.id}>
              <CardContent className="py-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">{t.name}</p>
                  <div className="flex gap-2 mt-1 flex-wrap">
                    {t.config.selectedYears.map(y => <Badge key={y} variant="secondary">{y}</Badge>)}
                    <Badge variant={t.isFinalized ? 'default' : 'outline'}>{t.isFinalized ? 'Finalized' : 'Draft'}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {Object.keys(t.divisionTimetables).length} divisions
                    </span>
                    {t.config.enableMiniProject && <Badge variant="outline" className="text-xs">Mini Project</Badge>}
                    {t.config.enableHonours && <Badge variant="outline" className="text-xs">Honours</Badge>}
                    {t.config.enableFlexibleBreaks && <Badge variant="outline" className="text-xs">Flex Breaks</Badge>}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => setViewingMasterId(t.id)}>
                    <Eye className="h-4 w-4" />
                  </Button>
                  {!t.isFinalized && (
                    <Button variant="ghost" size="icon" onClick={() => setEditingMasterId(t.id)}>
                      <Edit2 className="h-4 w-4" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" onClick={() => { deleteMasterTimetable(t.id); toast.success('Deleted'); }}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {deptMasterTTs.length === 0 && (
            <Card><CardContent className="py-6 text-center text-muted-foreground text-sm">
              No master timetables yet. Use the generator or manual builder to create one.
            </CardContent></Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default TimetableManager;
