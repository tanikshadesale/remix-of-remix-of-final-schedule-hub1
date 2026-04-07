export interface Department {
  id: string;
  name: string;
  adminEmail: string;
  adminPassword: string;
  departmentKey: string;
}

export interface Classroom {
  id: string;
  number: string;
  capacity: number;
  departmentId?: string;
  availability: DayAvailability[];
}

export interface Lab {
  id: string;
  name: string;
  capacity: number;
  batchSize: number;
  departmentId?: string;
  availability: DayAvailability[];
}

export interface DayAvailability {
  day: string;
  enabled: boolean;
  startTime: string;
  endTime: string;
}

export interface Faculty {
  id: string;
  departmentId: string;
  name: string;
  email: string;
  password: string;
  subjects: string[];
  teachingType: 'theory' | 'lab' | 'both';
  maxLecturesPerDay?: number;
  availability: DayAvailability[];
}

export interface Subject {
  id: string;
  departmentId: string;
  year: string;
  name: string;
  type: 'compulsory' | 'optional' | 'mini_project' | 'honours';
  lectureType: 'theory' | 'lab' | 'theory_and_lab';
  labsPerWeek: 1 | 2;
  optionGroup?: number;
  combineDivisions?: boolean;
  miniProjectHours?: number; // 2 or more continuous hours
  honoursLecturesPerWeek?: number; // default 4 for honours
}

export interface Division {
  id: string;
  departmentId: string;
  year: string;
  name: string;
  batchCount: 3 | 4;
}

export interface TimetableSlot {
  id: string;
  day: string;
  startTime: string;
  endTime: string;
  subjectId: string;
  subjectName: string;
  facultyId?: string;
  facultyName?: string;
  classroomId?: string;
  classroomNumber?: string;
  labId?: string;
  labName?: string;
  divisionId: string;
  divisionName: string;
  type: 'theory' | 'lab' | 'mini_project' | 'honours';
  batch?: string;
  isBreak?: boolean;
  breakType?: 'morning' | 'lunch';
  conflict?: boolean;
}

export interface GenerationConfig {
  enableMiniProject: boolean;
  enableHonours: boolean;
  enableFlexibleBreaks: boolean;
  selectedYears: string[];
}

export interface MasterTimetable {
  id: string;
  departmentId: string;
  name: string;
  config: GenerationConfig;
  divisionTimetables: Record<string, TimetableSlot[]>; // divisionId -> slots
  facultyTimetables: Record<string, TimetableSlot[]>; // facultyId -> slots
  breakSchedule: Record<string, { morningBreak: string; lunchBreak: string }>; // divisionId -> breaks
  createdAt: string;
  isFinalized: boolean;
}

export interface Timetable {
  id: string;
  departmentId: string;
  year: string;
  name: string;
  slots: TimetableSlot[];
  createdAt: string;
  isFinalized: boolean;
}

export type UserRole = 'super_admin' | 'admin' | 'faculty';

export interface AuthUser {
  email: string;
  role: UserRole;
  departmentId?: string;
  facultyId?: string;
  name?: string;
}

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
export const YEARS = ['FE', 'SE', 'TE', 'BE'];

// All possible time slots (1-hour blocks)
export const ALL_TIME_SLOTS = [
  '08:15', '09:15', '10:15', '11:15', '12:15',
  '13:15', '14:15', '15:15', '16:15'
];

export const TIME_SLOTS = [
  '08:15', '09:15', '10:15', '10:30', '11:30',
  '12:30', '13:30', '14:30', '15:30', '16:30'
];

export const THEORY_DURATION = 60;
export const LAB_DURATION = 120;

// Possible break time options
export const MORNING_BREAK_OPTIONS = ['10:15', '11:15'];
export const LUNCH_BREAK_OPTIONS = ['12:15', '12:30', '13:15', '13:30'];
