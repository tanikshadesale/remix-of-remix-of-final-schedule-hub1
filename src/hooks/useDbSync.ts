import { useEffect, useState, useCallback } from 'react';
import { useCollegeStore } from '@/store/collegeStore';
import { dbDepartments, dbClassrooms, dbLabs, dbFaculty, dbSubjects, dbClasses, dbTimetables, dbTimetableSlots } from '@/lib/dbService';
import { DAYS } from '@/store/types';
import type { Department, Classroom, Lab, Faculty, Subject, Division, DayAvailability } from '@/store/types';
import { toast } from 'sonner';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const defaultAvailability = (): DayAvailability[] =>
  DAYS.map(day => ({ day, enabled: true, startTime: '08:15', endTime: '17:30' }));

// Map DB row to app type
function mapDepartment(row: any): Department {
  return { id: String(row.id), name: row.name, adminEmail: row.admin_email, adminPassword: '', departmentKey: row.department_key };
}

function mapClassroom(row: any): Classroom {
  return { id: String(row.id), number: row.room_number, capacity: 60, departmentId: row.department_id ? String(row.department_id) : undefined, availability: defaultAvailability() };
}

function mapLab(row: any): Lab {
  return { id: String(row.id), name: row.lab_name, capacity: 30, batchSize: row.batch_support || 3, departmentId: row.department_id ? String(row.department_id) : undefined, availability: defaultAvailability() };
}

function mapFaculty(row: any): Faculty {
  const subjectsArr = Array.isArray(row.subjects) ? row.subjects : [];
  return {
    id: String(row.id), departmentId: String(row.department_id), name: row.name, email: row.email, password: '',
    subjects: subjectsArr,
    teachingType: row.teaching_type || 'both',
    availability: defaultAvailability(),
  };
}

function mapSubject(row: any): Subject {
  return {
    id: String(row.id), departmentId: String(row.department_id),
    year: row.year || '',
    name: row.name,
    type: row.type || 'compulsory',
    lectureType: row.lecture_type || (row.has_lab ? 'theory_and_lab' : 'theory'),
    labsPerWeek: 1, optionGroup: undefined,
  };
}

function mapDivision(row: any): Division {
  return { id: String(row.id), departmentId: String(row.department_id), year: row.year || '', name: row.name, batchCount: (row.batch_count || 3) as 3 | 4 };
}

async function ensureSchema() {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/db-api/setup-schema`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
    });
  } catch (e) {
    console.warn('Schema setup skipped:', e);
  }
}

export function useDbSync() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Ensure new columns exist
      await ensureSchema();

      const [depts, rooms, labsData, facData, subsData, classesData] = await Promise.all([
        dbDepartments.getAll(),
        dbClassrooms.getAll(),
        dbLabs.getAll(),
        dbFaculty.getAll(),
        dbSubjects.getAll(),
        dbClasses.getAll(),
      ]);

      // Replace store data with DB data
      useCollegeStore.setState({
        departments: depts.map(mapDepartment),
        classrooms: rooms.map(mapClassroom),
        labs: labsData.map(mapLab),
        faculty: facData.map(mapFaculty),
        subjects: subsData.map(mapSubject),
        divisions: classesData.map(mapDivision),
      });
    } catch (e: any) {
      console.error('DB sync error:', e);
      setError(e.message);
      toast.error('Failed to load data from database: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  return { loading, error, reload: loadAll };
}

// ─── DB-aware CRUD operations ───

export async function dbAddDepartment(data: { name: string; admin_email: string; department_key: string; password: string }) {
  const row = await dbDepartments.create(data);
  const dept = mapDepartment(row);
  useCollegeStore.setState(s => ({ departments: [...s.departments, dept] }));
  return dept;
}

export async function dbRemoveDepartment(id: string) {
  await dbDepartments.remove(parseInt(id));
  useCollegeStore.setState(s => ({ departments: s.departments.filter(d => d.id !== id) }));
}

export async function dbAddClassroom(data: { room_number: string; department_id?: number }) {
  const row = await dbClassrooms.create(data);
  const c = mapClassroom(row);
  useCollegeStore.setState(s => ({ classrooms: [...s.classrooms, c] }));
  return c;
}

export async function dbRemoveClassroom(id: string) {
  await dbClassrooms.remove(parseInt(id));
  useCollegeStore.setState(s => ({ classrooms: s.classrooms.filter(c => c.id !== id) }));
}

export async function dbAddLab(data: { lab_name: string; department_id?: number; batch_support?: number }) {
  const row = await dbLabs.create(data);
  const l = mapLab(row);
  useCollegeStore.setState(s => ({ labs: [...s.labs, l] }));
  return l;
}

export async function dbRemoveLab(id: string) {
  await dbLabs.remove(parseInt(id));
  useCollegeStore.setState(s => ({ labs: s.labs.filter(l => l.id !== id) }));
}

export async function dbAddFaculty(data: { name: string; email: string; department_id: number; password: string; subjects?: string[]; teaching_type?: string }) {
  const row = await dbFaculty.create(data);
  const f = mapFaculty(row);
  useCollegeStore.setState(s => ({ faculty: [...s.faculty, f] }));
  return f;
}

export async function dbRemoveFaculty(id: string) {
  await dbFaculty.remove(parseInt(id));
  useCollegeStore.setState(s => ({ faculty: s.faculty.filter(f => f.id !== id) }));
}

export async function dbAddSubject(data: { name: string; type?: string; department_id: number; theory_per_week?: number; has_lab?: boolean; year?: string; lecture_type?: string }) {
  const row = await dbSubjects.create(data);
  const s = mapSubject(row);
  useCollegeStore.setState(st => ({ subjects: [...st.subjects, s] }));
  return s;
}

export async function dbRemoveSubject(id: string) {
  await dbSubjects.remove(parseInt(id));
  useCollegeStore.setState(s => ({ subjects: s.subjects.filter(sub => sub.id !== id) }));
}

export async function dbAddDivision(data: { name: string; year: string; department_id: number; batch_count?: number }) {
  const row = await dbClasses.create(data);
  const d = mapDivision(row);
  useCollegeStore.setState(s => ({ divisions: [...s.divisions, d] }));
  return d;
}

export async function dbRemoveDivision(id: string) {
  await dbClasses.remove(parseInt(id));
  useCollegeStore.setState(s => ({ divisions: s.divisions.filter(d => d.id !== id) }));
}

// ─── Timetable Operations ───

export async function dbSaveTimetable(departmentId: string, slots: any[]) {
  const dbSlots = slots
    .filter(s => !s.isBreak)
    .map(s => ({
      day: s.day,
      time_slot: s.startTime,
      class_id: s.divisionId ? parseInt(s.divisionId) : null,
      subject_id: s.subjectId ? parseInt(s.subjectId) : null,
      faculty_id: s.facultyId ? parseInt(s.facultyId) : null,
      classroom_id: s.classroomId ? parseInt(s.classroomId) : null,
      lab_id: s.labId ? parseInt(s.labId) : null,
      type: s.type === 'theory' ? 'Theory' : s.type === 'lab' ? 'Lab' : s.type === 'mini_project' ? 'Mini Project' : 'Honours',
    }));

  const result = await dbTimetables.create({
    department_id: parseInt(departmentId),
    slots: dbSlots,
  });

  return result;
}

export async function dbDeleteTimetable(id: number) {
  await dbTimetables.remove(id);
}

export async function dbLoadTimetableSlots(timetableId: number) {
  return dbTimetableSlots.getByTimetable(timetableId);
}

export async function dbLoadTimetables(departmentId: string) {
  return dbTimetables.getAll(parseInt(departmentId));
}
