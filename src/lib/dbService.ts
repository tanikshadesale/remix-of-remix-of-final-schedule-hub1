import { supabase } from '@/integrations/supabase/client';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

async function callApi(path: string, method = 'GET', body?: unknown) {
  const url = `${SUPABASE_URL}/functions/v1/db-api/${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_KEY,
  };

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(errData.error || `API error ${res.status}`);
  }
  return res.json();
}

// ─── Departments ───
export const dbDepartments = {
  getAll: () => callApi('departments'),
  create: (data: { name: string; admin_email: string; department_key: string; password: string }) =>
    callApi('departments', 'POST', data),
  remove: (id: number) => callApi(`departments/${id}`, 'DELETE'),
};

// ─── Classrooms ───
export const dbClassrooms = {
  getAll: (departmentId?: number) =>
    callApi(`classrooms${departmentId ? `?department_id=${departmentId}` : ''}`),
  create: (data: { room_number: string; department_id?: number }) =>
    callApi('classrooms', 'POST', data),
  remove: (id: number) => callApi(`classrooms/${id}`, 'DELETE'),
};

// ─── Labs ───
export const dbLabs = {
  getAll: (departmentId?: number) =>
    callApi(`labs${departmentId ? `?department_id=${departmentId}` : ''}`),
  create: (data: { lab_name: string; department_id?: number; batch_support?: number }) =>
    callApi('labs', 'POST', data),
  remove: (id: number) => callApi(`labs/${id}`, 'DELETE'),
};

// ─── Faculty ───
export const dbFaculty = {
  getAll: (departmentId?: number) =>
    callApi(`faculty${departmentId ? `?department_id=${departmentId}` : ''}`),
  create: (data: { name: string; email: string; department_id: number; password: string; subjects?: string[]; teaching_type?: string }) =>
    callApi('faculty', 'POST', data),
  update: (data: { id: number; subjects?: string[]; teaching_type?: string }) =>
    callApi('faculty', 'PUT', data),
  remove: (id: number) => callApi(`faculty/${id}`, 'DELETE'),
};

// ─── Auth ───
export const dbAuth = {
  adminLogin: (data: { email: string; password: string; department_key: string }) =>
    callApi('auth/admin-login', 'POST', data),
  facultyLogin: (data: { email: string; password: string }) =>
    callApi('auth/faculty-login', 'POST', data),
};

// ─── Subjects ───
export const dbSubjects = {
  getAll: (departmentId?: number) =>
    callApi(`subjects${departmentId ? `?department_id=${departmentId}` : ''}`),
  create: (data: { name: string; type?: string; department_id: number; theory_per_week?: number; has_lab?: boolean; year?: string; lecture_type?: string }) =>
    callApi('subjects', 'POST', data),
  remove: (id: number) => callApi(`subjects/${id}`, 'DELETE'),
};

// ─── Classes (Divisions) ───
export const dbClasses = {
  getAll: (departmentId?: number) =>
    callApi(`classes${departmentId ? `?department_id=${departmentId}` : ''}`),
  create: (data: { name: string; year: string; department_id: number; batch_count?: number }) =>
    callApi('classes', 'POST', data),
  remove: (id: number) => callApi(`classes/${id}`, 'DELETE'),
};

// ─── Timetables ───
export const dbTimetables = {
  getAll: (departmentId?: number) =>
    callApi(`timetables${departmentId ? `?department_id=${departmentId}` : ''}`),
  create: (data: { department_id: number; slots: unknown[] }) =>
    callApi('timetables', 'POST', data),
  remove: (id: number) => callApi(`timetables/${id}`, 'DELETE'),
};

// ─── Timetable Slots ───
export const dbTimetableSlots = {
  getByTimetable: (timetableId: number) =>
    callApi(`timetable-slots?timetable_id=${timetableId}`),
  update: (data: { id: number; faculty_id?: number; classroom_id?: number; lab_id?: number }) =>
    callApi('timetable-slots', 'PUT', data),
};

// ─── Availability ───
export const dbAvailability = {
  check: (day: string, timeSlot: string, type: 'classroom' | 'lab' | 'faculty') =>
    callApi(`availability?day=${encodeURIComponent(day)}&time_slot=${encodeURIComponent(timeSlot)}&type=${type}`),
  grid: () => callApi('availability-grid'),
};
