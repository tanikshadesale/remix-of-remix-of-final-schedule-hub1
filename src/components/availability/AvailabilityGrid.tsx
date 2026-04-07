import { useState, useEffect } from 'react';
import { dbAvailability } from '@/lib/dbService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Monitor, FlaskConical, Users } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface SlotData {
  time: string;
  freeClassrooms: { id: number; room_number: string }[];
  freeLabs: { id: number; lab_name: string }[];
  freeFaculty: { id: number; name: string }[];
  totalClassrooms: number;
  totalLabs: number;
  totalFaculty: number;
}

interface DayData {
  day: string;
  slots: SlotData[];
}

const TIME_LABELS: Record<string, string> = {
  '08:15': '8:15–9:15',
  '09:15': '9:15–10:15',
  '10:30': '10:30–11:30',
  '11:30': '11:30–12:30',
  '13:30': '1:30–2:30',
  '14:30': '2:30–3:30',
  '15:30': '3:30–4:30',
  '16:30': '4:30–5:30',
};

export default function AvailabilityGrid({ compact = false }: { compact?: boolean }) {
  const [grid, setGrid] = useState<DayData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState('Monday');

  useEffect(() => {
    dbAvailability.grid().then((data) => {
      setGrid(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading availability…</span>
      </div>
    );
  }

  const dayData = grid.find(d => d.day === selectedDay);
  if (!dayData) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Select value={selectedDay} onValueChange={setSelectedDay}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {grid.map(d => (
              <SelectItem key={d.day} value={d.day}>{d.day}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="classrooms">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="classrooms" className="text-xs">
            <Monitor className="h-3.5 w-3.5 mr-1.5" />Classrooms
          </TabsTrigger>
          <TabsTrigger value="labs" className="text-xs">
            <FlaskConical className="h-3.5 w-3.5 mr-1.5" />Labs
          </TabsTrigger>
          <TabsTrigger value="faculty" className="text-xs">
            <Users className="h-3.5 w-3.5 mr-1.5" />Faculty
          </TabsTrigger>
        </TabsList>

        <TabsContent value="classrooms">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Time Slot</th>
                  <th className="text-center py-2 px-3 font-medium text-muted-foreground">Free / Total</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Available Rooms</th>
                </tr>
              </thead>
              <tbody>
                {dayData.slots.map(slot => {
                  const ratio = slot.freeClassrooms.length / slot.totalClassrooms;
                  return (
                    <tr key={slot.time} className="border-b border-border/50">
                      <td className="py-2.5 px-3 font-medium text-foreground whitespace-nowrap">{TIME_LABELS[slot.time] || slot.time}</td>
                      <td className="py-2.5 px-3 text-center">
                        <Badge variant={ratio === 0 ? 'destructive' : ratio < 0.3 ? 'secondary' : 'default'} className="text-[10px] px-1.5">
                          {slot.freeClassrooms.length}/{slot.totalClassrooms}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex flex-wrap gap-1">
                          {slot.freeClassrooms.length === 0 ? (
                            <span className="text-destructive">All occupied</span>
                          ) : (
                            slot.freeClassrooms.slice(0, compact ? 4 : 20).map(c => (
                              <span key={c.id} className="bg-accent text-accent-foreground px-1.5 py-0.5 rounded text-[10px]">{c.room_number}</span>
                            ))
                          )}
                          {compact && slot.freeClassrooms.length > 4 && (
                            <span className="text-muted-foreground">+{slot.freeClassrooms.length - 4}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="labs">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Time Slot</th>
                  <th className="text-center py-2 px-3 font-medium text-muted-foreground">Free / Total</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Available Labs</th>
                </tr>
              </thead>
              <tbody>
                {dayData.slots.map(slot => {
                  const ratio = slot.totalLabs > 0 ? slot.freeLabs.length / slot.totalLabs : 1;
                  return (
                    <tr key={slot.time} className="border-b border-border/50">
                      <td className="py-2.5 px-3 font-medium text-foreground whitespace-nowrap">{TIME_LABELS[slot.time] || slot.time}</td>
                      <td className="py-2.5 px-3 text-center">
                        <Badge variant={ratio === 0 ? 'destructive' : ratio < 0.3 ? 'secondary' : 'default'} className="text-[10px] px-1.5">
                          {slot.freeLabs.length}/{slot.totalLabs}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex flex-wrap gap-1">
                          {slot.freeLabs.length === 0 ? (
                            <span className="text-destructive">All occupied</span>
                          ) : (
                            slot.freeLabs.map(l => (
                              <span key={l.id} className="bg-accent text-accent-foreground px-1.5 py-0.5 rounded text-[10px]">{l.lab_name}</span>
                            ))
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="faculty">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Time Slot</th>
                  <th className="text-center py-2 px-3 font-medium text-muted-foreground">Free / Total</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Available Faculty</th>
                </tr>
              </thead>
              <tbody>
                {dayData.slots.map(slot => {
                  const ratio = slot.totalFaculty > 0 ? slot.freeFaculty.length / slot.totalFaculty : 1;
                  return (
                    <tr key={slot.time} className="border-b border-border/50">
                      <td className="py-2.5 px-3 font-medium text-foreground whitespace-nowrap">{TIME_LABELS[slot.time] || slot.time}</td>
                      <td className="py-2.5 px-3 text-center">
                        <Badge variant={ratio === 0 ? 'destructive' : ratio < 0.3 ? 'secondary' : 'default'} className="text-[10px] px-1.5">
                          {slot.freeFaculty.length}/{slot.totalFaculty}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex flex-wrap gap-1">
                          {slot.freeFaculty.length === 0 ? (
                            <span className="text-destructive">All occupied</span>
                          ) : (
                            slot.freeFaculty.slice(0, compact ? 5 : 30).map(f => (
                              <span key={f.id} className="bg-accent text-accent-foreground px-1.5 py-0.5 rounded text-[10px]">{f.name}</span>
                            ))
                          )}
                          {compact && slot.freeFaculty.length > 5 && (
                            <span className="text-muted-foreground">+{slot.freeFaculty.length - 5}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}