import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Department, Classroom, Lab, Faculty, Subject, Division, Timetable, TimetableSlot, AuthUser, DayAvailability, MasterTimetable, GenerationConfig } from './types';
import { DAYS } from './types';

const defaultAvailability = (): DayAvailability[] =>
  DAYS.map(day => ({ day, enabled: true, startTime: '08:15', endTime: '17:30' }));

interface CollegeStore {
  currentUser: AuthUser | null;
  login: (email: string, password: string, departmentKey?: string) => string | null;
  logout: () => void;

  departments: Department[];
  addDepartment: (dept: Omit<Department, 'id'>) => void;
  removeDepartment: (id: string) => void;

  classrooms: Classroom[];
  addClassroom: (c: Omit<Classroom, 'id'>) => void;
  removeClassroom: (id: string) => void;

  labs: Lab[];
  addLab: (l: Omit<Lab, 'id'>) => void;
  removeLab: (id: string) => void;

  faculty: Faculty[];
  addFaculty: (f: Omit<Faculty, 'id'>) => void;
  removeFaculty: (id: string) => void;

  subjects: Subject[];
  addSubject: (s: Omit<Subject, 'id'>) => void;
  removeSubject: (id: string) => void;

  divisions: Division[];
  addDivision: (d: Omit<Division, 'id'>) => void;
  removeDivision: (id: string) => void;

  timetables: Timetable[];
  addTimetable: (t: Omit<Timetable, 'id' | 'createdAt'>) => void;
  updateTimetable: (id: string, slots: TimetableSlot[]) => void;
  deleteTimetable: (id: string) => void;
  finalizeTimetable: (id: string) => void;

  masterTimetables: MasterTimetable[];
  addMasterTimetable: (t: Omit<MasterTimetable, 'id' | 'createdAt'>) => void;
  updateMasterTimetable: (id: string, divisionTimetables: Record<string, TimetableSlot[]>, facultyTimetables: Record<string, TimetableSlot[]>) => void;
  deleteMasterTimetable: (id: string) => void;
  finalizeMasterTimetable: (id: string) => void;
}

const genId = () => crypto.randomUUID();

const SUPER_ADMIN = { email: 'admin@college.edu', password: 'admin123' };

export const useCollegeStore = create<CollegeStore>()(
  persist(
    (set, get) => ({
      currentUser: null,

      login: (email, password, departmentKey) => {
        if (email === SUPER_ADMIN.email && password === SUPER_ADMIN.password) {
          set({ currentUser: { email, role: 'super_admin', name: 'Super Admin' } });
          return null;
        }
        if (departmentKey) {
          const dept = get().departments.find(
            d => d.adminEmail === email && d.departmentKey === departmentKey &&
              (d.adminPassword === password || d.adminPassword === '') // DB-backed depts have no password stored
          );
          if (dept) {
            set({ currentUser: { email, role: 'admin', departmentId: dept.id, name: dept.name + ' Admin' } });
            return null;
          }
          return 'Invalid admin credentials or department key';
        }
        const fac = get().faculty.find(f => f.email === email && (f.password === password || f.password === ''));
        if (fac) {
          set({ currentUser: { email, role: 'faculty', departmentId: fac.departmentId, facultyId: fac.id, name: fac.name } });
          return null;
        }
        return 'Invalid credentials';
      },

      logout: () => set({ currentUser: null }),

      departments: [],
      addDepartment: (dept) => set(s => ({ departments: [...s.departments, { ...dept, id: genId() }] })),
      removeDepartment: (id) => set(s => ({ departments: s.departments.filter(d => d.id !== id) })),

      classrooms: [],
      addClassroom: (c) => set(s => ({ classrooms: [...s.classrooms, { ...c, id: genId() }] })),
      removeClassroom: (id) => set(s => ({ classrooms: s.classrooms.filter(c => c.id !== id) })),

      labs: [],
      addLab: (l) => set(s => ({ labs: [...s.labs, { ...l, id: genId() }] })),
      removeLab: (id) => set(s => ({ labs: s.labs.filter(l => l.id !== id) })),

      faculty: [],
      addFaculty: (f) => set(s => ({ faculty: [...s.faculty, { ...f, id: genId() }] })),
      removeFaculty: (id) => set(s => ({ faculty: s.faculty.filter(f => f.id !== id) })),

      subjects: [],
      addSubject: (s) => set(st => ({ subjects: [...st.subjects, { ...s, id: genId() }] })),
      removeSubject: (id) => set(s => ({ subjects: s.subjects.filter(sub => sub.id !== id) })),

      divisions: [],
      addDivision: (d) => set(s => ({ divisions: [...s.divisions, { ...d, id: genId() }] })),
      removeDivision: (id) => set(s => ({ divisions: s.divisions.filter(d => d.id !== id) })),

      timetables: [],
      addTimetable: (t) => set(s => ({
        timetables: [...s.timetables, { ...t, id: genId(), createdAt: new Date().toISOString() }]
      })),
      updateTimetable: (id, slots) => set(s => ({
        timetables: s.timetables.map(t => t.id === id ? { ...t, slots } : t)
      })),
      deleteTimetable: (id) => set(s => ({
        timetables: s.timetables.filter(t => t.id !== id)
      })),
      finalizeTimetable: (id) => set(s => ({
        timetables: s.timetables.map(t => t.id === id ? { ...t, isFinalized: true } : t)
      })),

      masterTimetables: [],
      addMasterTimetable: (t) => set(s => ({
        masterTimetables: [...s.masterTimetables, { ...t, id: genId(), createdAt: new Date().toISOString() }]
      })),
      updateMasterTimetable: (id, divisionTimetables, facultyTimetables) => set(s => ({
        masterTimetables: s.masterTimetables.map(t => t.id === id ? { ...t, divisionTimetables, facultyTimetables } : t)
      })),
      deleteMasterTimetable: (id) => set(s => ({
        masterTimetables: s.masterTimetables.filter(t => t.id !== id)
      })),
      finalizeMasterTimetable: (id) => set(s => ({
        masterTimetables: s.masterTimetables.map(t => t.id === id ? { ...t, isFinalized: true } : t)
      })),
    }),
    { name: 'college-timetable-store' }
  )
);
