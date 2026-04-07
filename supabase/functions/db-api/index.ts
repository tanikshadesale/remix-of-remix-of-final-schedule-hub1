import postgres from "postgres";

// PBKDF2-based password hashing using Web Crypto API
async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, key, 256);
  const hashArr = new Uint8Array(bits);
  const saltHex = [...salt].map(b => b.toString(16).padStart(2, '0')).join('');
  const hashHex = [...hashArr].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${saltHex}:${hashHex}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map(b => parseInt(b, 16)));
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, key, 256);
  const computed = [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
  return computed === hashHex;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(msg: string, status = 400) {
  return json({ error: msg }, status);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/db-api\/?/, "");
  const method = req.method;

  const databaseUrl = Deno.env.get("DATABASE_URL");
  if (!databaseUrl) return err("DATABASE_URL not configured", 500);

  const sql = postgres(databaseUrl, { ssl: "require" });

  try {
    // ─── SETUP SCHEMA (adds missing columns if needed) ───
    if (path === "setup-schema" && method === "POST") {
      // Add year and lecture_type to subjects if missing
      await sql`ALTER TABLE subjects ADD COLUMN IF NOT EXISTS year VARCHAR(10)`;
      await sql`ALTER TABLE subjects ADD COLUMN IF NOT EXISTS lecture_type VARCHAR(20) DEFAULT 'theory'`;
      // Add subjects array to faculty if missing
      await sql`ALTER TABLE faculty ADD COLUMN IF NOT EXISTS subjects TEXT[] DEFAULT '{}'`;
      await sql`ALTER TABLE faculty ADD COLUMN IF NOT EXISTS teaching_type VARCHAR(10) DEFAULT 'both'`;
      return json({ success: true, message: "Schema updated" });
    }

    // ─── DEPARTMENTS ───
    if (path === "departments" && method === "GET") {
      const rows = await sql`SELECT id, name, admin_email, department_key FROM departments ORDER BY id`;
      return json(rows);
    }

    if (path === "departments" && method === "POST") {
      const body = await req.json();
      const { name, admin_email, department_key, password } = body;
      if (!name || !admin_email || !department_key || !password) return err("Missing fields");
      const hashed = await hashPassword(password);
      const [row] = await sql`INSERT INTO departments (name, admin_email, department_key, password) VALUES (${name}, ${admin_email}, ${department_key}, ${hashed}) RETURNING id, name, admin_email, department_key`;
      return json(row, 201);
    }

    if (path.startsWith("departments/") && method === "DELETE") {
      const id = parseInt(path.split("/")[1]);
      await sql`DELETE FROM departments WHERE id = ${id}`;
      return json({ success: true });
    }

    // ─── CLASSROOMS ───
    if (path === "classrooms" && method === "GET") {
      const deptId = url.searchParams.get("department_id");
      const rows = deptId
        ? await sql`SELECT id, room_number, department_id FROM classrooms WHERE department_id = ${parseInt(deptId)} OR department_id IS NULL ORDER BY id`
        : await sql`SELECT id, room_number, department_id FROM classrooms ORDER BY id`;
      return json(rows);
    }

    if (path === "classrooms" && method === "POST") {
      const body = await req.json();
      const { room_number, department_id } = body;
      if (!room_number) return err("Missing room_number");
      const [row] = department_id
        ? await sql`INSERT INTO classrooms (room_number, department_id) VALUES (${room_number}, ${parseInt(department_id)}) RETURNING *`
        : await sql`INSERT INTO classrooms (room_number) VALUES (${room_number}) RETURNING *`;
      return json(row, 201);
    }

    if (path.startsWith("classrooms/") && method === "DELETE") {
      const id = parseInt(path.split("/")[1]);
      await sql`DELETE FROM classrooms WHERE id = ${id}`;
      return json({ success: true });
    }

    // ─── LABS ───
    if (path === "labs" && method === "GET") {
      const deptId = url.searchParams.get("department_id");
      const rows = deptId
        ? await sql`SELECT id, lab_name, department_id, batch_support FROM labs WHERE department_id = ${parseInt(deptId)} OR department_id IS NULL ORDER BY id`
        : await sql`SELECT id, lab_name, department_id, batch_support FROM labs ORDER BY id`;
      return json(rows);
    }

    if (path === "labs" && method === "POST") {
      const body = await req.json();
      const { lab_name, department_id, batch_support } = body;
      if (!lab_name) return err("Missing lab_name");
      const [row] = department_id
        ? await sql`INSERT INTO labs (lab_name, department_id, batch_support) VALUES (${lab_name}, ${parseInt(department_id)}, ${batch_support || 3}) RETURNING *`
        : await sql`INSERT INTO labs (lab_name, batch_support) VALUES (${lab_name}, ${batch_support || 3}) RETURNING *`;
      return json(row, 201);
    }

    if (path.startsWith("labs/") && method === "DELETE") {
      const id = parseInt(path.split("/")[1]);
      await sql`DELETE FROM labs WHERE id = ${id}`;
      return json({ success: true });
    }

    // ─── FACULTY ───
    if (path === "faculty" && method === "GET") {
      const deptId = url.searchParams.get("department_id");
      const rows = deptId
        ? await sql`SELECT id, name, email, department_id, subjects, teaching_type FROM faculty WHERE department_id = ${parseInt(deptId)} ORDER BY id`
        : await sql`SELECT id, name, email, department_id, subjects, teaching_type FROM faculty ORDER BY id`;
      return json(rows);
    }

    if (path === "faculty" && method === "POST") {
      const body = await req.json();
      const { name, email, department_id, password, subjects, teaching_type } = body;
      if (!name || !email || !department_id || !password) return err("Missing fields");
      const hashed = await hashPassword(password);
      const subjectsArr = subjects && Array.isArray(subjects) ? subjects : [];
      const tt = teaching_type || 'both';
      const [row] = await sql`INSERT INTO faculty (name, email, department_id, password, subjects, teaching_type) VALUES (${name}, ${email}, ${parseInt(department_id)}, ${hashed}, ${subjectsArr}, ${tt}) RETURNING id, name, email, department_id, subjects, teaching_type`;
      return json(row, 201);
    }

    if (path === "faculty" && method === "PUT") {
      const body = await req.json();
      const { id, subjects, teaching_type } = body;
      if (!id) return err("Faculty id required");
      const subjectsArr = subjects && Array.isArray(subjects) ? subjects : [];
      const tt = teaching_type || 'both';
      const [row] = await sql`UPDATE faculty SET subjects = ${subjectsArr}, teaching_type = ${tt} WHERE id = ${parseInt(id)} RETURNING id, name, email, department_id, subjects, teaching_type`;
      return json(row);
    }

    if (path.startsWith("faculty/") && method === "DELETE") {
      const id = parseInt(path.split("/")[1]);
      await sql`DELETE FROM faculty WHERE id = ${id}`;
      return json({ success: true });
    }

    // ─── SUBJECTS ───
    if (path === "subjects" && method === "GET") {
      const deptId = url.searchParams.get("department_id");
      const rows = deptId
        ? await sql`SELECT id, name, type, department_id, theory_per_week, has_lab, year, lecture_type FROM subjects WHERE department_id = ${parseInt(deptId)} ORDER BY id`
        : await sql`SELECT id, name, type, department_id, theory_per_week, has_lab, year, lecture_type FROM subjects ORDER BY id`;
      return json(rows);
    }

    if (path === "subjects" && method === "POST") {
      const body = await req.json();
      const { name, type, department_id, theory_per_week, has_lab, year, lecture_type } = body;
      if (!name || !department_id) return err("Missing fields");
      const [row] = await sql`INSERT INTO subjects (name, type, department_id, theory_per_week, has_lab, year, lecture_type) VALUES (${name}, ${type || 'compulsory'}, ${parseInt(department_id)}, ${theory_per_week || 3}, ${has_lab || false}, ${year || null}, ${lecture_type || 'theory'}) RETURNING *`;
      return json(row, 201);
    }

    if (path.startsWith("subjects/") && method === "DELETE") {
      const id = parseInt(path.split("/")[1]);
      await sql`DELETE FROM subjects WHERE id = ${id}`;
      return json({ success: true });
    }

    // ─── CLASSES (divisions) ───
    if (path === "classes" && method === "GET") {
      const deptId = url.searchParams.get("department_id");
      const rows = deptId
        ? await sql`SELECT id, name, year, department_id, batch_count FROM classes WHERE department_id = ${parseInt(deptId)} ORDER BY id`
        : await sql`SELECT id, name, year, department_id, batch_count FROM classes ORDER BY id`;
      return json(rows);
    }

    if (path === "classes" && method === "POST") {
      const body = await req.json();
      const { name, year, department_id, batch_count } = body;
      if (!name || !year || !department_id) return err("Missing fields");
      const [row] = await sql`INSERT INTO classes (name, year, department_id, batch_count) VALUES (${name}, ${year}, ${parseInt(department_id)}, ${batch_count || 3}) RETURNING *`;
      return json(row, 201);
    }

    if (path.startsWith("classes/") && method === "DELETE") {
      const id = parseInt(path.split("/")[1]);
      await sql`DELETE FROM classes WHERE id = ${id}`;
      return json({ success: true });
    }

    // ─── TIMETABLES ───
    if (path === "timetables" && method === "GET") {
      const deptId = url.searchParams.get("department_id");
      const rows = deptId
        ? await sql`SELECT id, department_id, created_at FROM timetables WHERE department_id = ${parseInt(deptId)} ORDER BY created_at DESC`
        : await sql`SELECT id, department_id, created_at FROM timetables ORDER BY created_at DESC`;
      return json(rows);
    }

    if (path === "timetables" && method === "POST") {
      const body = await req.json();
      const { department_id, slots } = body;
      if (!department_id || !slots || !Array.isArray(slots)) return err("Missing department_id or slots");

      const result = await sql.begin(async (tx) => {
        const [timetable] = await tx`INSERT INTO timetables (department_id) VALUES (${parseInt(department_id)}) RETURNING id, department_id, created_at`;

        for (const slot of slots) {
          if (slot.isBreak) continue;
          await tx`INSERT INTO timetable_slots (timetable_id, day, time_slot, class_id, subject_id, faculty_id, classroom_id, lab_id, type)
            VALUES (
              ${timetable.id},
              ${slot.day},
              ${slot.startTime || slot.time_slot},
              ${slot.class_id ? parseInt(slot.class_id) : null},
              ${slot.subject_id ? parseInt(slot.subject_id) : null},
              ${slot.faculty_id ? parseInt(slot.faculty_id) : null},
              ${slot.classroom_id ? parseInt(slot.classroom_id) : null},
              ${slot.lab_id ? parseInt(slot.lab_id) : null},
              ${slot.type || 'Theory'}
            )
            ON CONFLICT DO NOTHING`;
        }
        return timetable;
      });
      return json(result, 201);
    }

    if (path.startsWith("timetables/") && method === "DELETE") {
      const id = parseInt(path.split("/")[1]);
      await sql.begin(async (tx) => {
        await tx`DELETE FROM timetable_slots WHERE timetable_id = ${id}`;
        await tx`DELETE FROM timetables WHERE id = ${id}`;
      });
      return json({ success: true });
    }

    // ─── TIMETABLE SLOTS ───
    if (path === "timetable-slots" && method === "GET") {
      const ttId = url.searchParams.get("timetable_id");
      if (!ttId) return err("timetable_id required");
      const rows = await sql`
        SELECT 
          ts.id, ts.timetable_id, ts.day, ts.time_slot, ts.class_id, ts.subject_id, 
          ts.faculty_id, ts.classroom_id, ts.lab_id, ts.type,
          s.name as subject_name,
          f.name as faculty_name,
          c.name as class_name,
          cr.room_number as classroom_number,
          l.lab_name
        FROM timetable_slots ts
        LEFT JOIN subjects s ON ts.subject_id = s.id
        LEFT JOIN faculty f ON ts.faculty_id = f.id
        LEFT JOIN classes c ON ts.class_id = c.id
        LEFT JOIN classrooms cr ON ts.classroom_id = cr.id
        LEFT JOIN labs l ON ts.lab_id = l.id
        WHERE ts.timetable_id = ${parseInt(ttId)}
        ORDER BY ts.day, ts.time_slot
      `;
      return json(rows);
    }

    if (path === "timetable-slots" && method === "PUT") {
      const body = await req.json();
      const { id, faculty_id, classroom_id, lab_id } = body;
      if (!id) return err("Slot id required");
      const [row] = await sql`UPDATE timetable_slots SET 
        faculty_id = ${faculty_id ? parseInt(faculty_id) : null},
        classroom_id = ${classroom_id ? parseInt(classroom_id) : null},
        lab_id = ${lab_id ? parseInt(lab_id) : null}
        WHERE id = ${parseInt(id)} RETURNING *`;
      return json(row);
    }

    // ─── AVAILABILITY CHECK ───
    if (path === "availability" && method === "GET") {
      const day = url.searchParams.get("day");
      const timeSlot = url.searchParams.get("time_slot");
      const resourceType = url.searchParams.get("type");
      if (!day || !timeSlot || !resourceType) return err("day, time_slot, type required");

      if (resourceType === "classroom") {
        const rows = await sql`
          SELECT cr.id, cr.room_number FROM classrooms cr
          WHERE cr.id NOT IN (
            SELECT ts.classroom_id FROM timetable_slots ts WHERE ts.day = ${day} AND ts.time_slot = ${timeSlot} AND ts.classroom_id IS NOT NULL
          ) ORDER BY cr.room_number`;
        return json(rows);
      }
      if (resourceType === "lab") {
        const rows = await sql`
          SELECT l.id, l.lab_name FROM labs l
          WHERE l.id NOT IN (
            SELECT ts.lab_id FROM timetable_slots ts WHERE ts.day = ${day} AND ts.time_slot = ${timeSlot} AND ts.lab_id IS NOT NULL
          ) ORDER BY l.lab_name`;
        return json(rows);
      }
      if (resourceType === "faculty") {
        const rows = await sql`
          SELECT f.id, f.name FROM faculty f
          WHERE f.id NOT IN (
            SELECT ts.faculty_id FROM timetable_slots ts WHERE ts.day = ${day} AND ts.time_slot = ${timeSlot} AND ts.faculty_id IS NOT NULL
          ) ORDER BY f.name`;
        return json(rows);
      }
      return err("Invalid resource type");
    }

    // ─── AVAILABILITY GRID ───
    if (path === "availability-grid" && method === "GET") {
      const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const times = ['08:15', '09:15', '10:30', '11:30', '13:30', '14:30', '15:30', '16:30'];

      const [allClassrooms, allLabs, allFaculty, busySlots] = await Promise.all([
        sql`SELECT id, room_number, department_id FROM classrooms ORDER BY room_number`,
        sql`SELECT id, lab_name, department_id FROM labs ORDER BY lab_name`,
        sql`SELECT id, name, department_id FROM faculty ORDER BY name`,
        sql`SELECT day, time_slot, classroom_id, lab_id, faculty_id FROM timetable_slots`,
      ]);

      const busyKey = (day: string, time: string) => `${day}|${time}`;
      const busyClassrooms = new Map<string, Set<number>>();
      const busyLabs = new Map<string, Set<number>>();
      const busyFaculty = new Map<string, Set<number>>();

      for (const s of busySlots) {
        const k = busyKey(s.day, s.time_slot);
        if (s.classroom_id) {
          if (!busyClassrooms.has(k)) busyClassrooms.set(k, new Set());
          busyClassrooms.get(k)!.add(s.classroom_id);
        }
        if (s.lab_id) {
          if (!busyLabs.has(k)) busyLabs.set(k, new Set());
          busyLabs.get(k)!.add(s.lab_id);
        }
        if (s.faculty_id) {
          if (!busyFaculty.has(k)) busyFaculty.set(k, new Set());
          busyFaculty.get(k)!.add(s.faculty_id);
        }
      }

      const grid = days.map(day => ({
        day,
        slots: times.map(time => {
          const k = busyKey(day, time);
          const bc = busyClassrooms.get(k) || new Set();
          const bl = busyLabs.get(k) || new Set();
          const bf = busyFaculty.get(k) || new Set();
          return {
            time,
            freeClassrooms: allClassrooms.filter((c: any) => !bc.has(c.id)).map((c: any) => ({ id: c.id, room_number: c.room_number })),
            freeLabs: allLabs.filter((l: any) => !bl.has(l.id)).map((l: any) => ({ id: l.id, lab_name: l.lab_name })),
            freeFaculty: allFaculty.filter((f: any) => !bf.has(f.id)).map((f: any) => ({ id: f.id, name: f.name })),
            totalClassrooms: allClassrooms.length,
            totalLabs: allLabs.length,
            totalFaculty: allFaculty.length,
          };
        }),
      }));

      return json(grid);
    }

    // ─── AUTH / LOGIN ───
    if (path === "auth/admin-login" && method === "POST") {
      const body = await req.json();
      const { email, password, department_key } = body;
      if (!email || !password || !department_key) return err("Missing fields");
      const rows = await sql`SELECT id, name, admin_email, department_key, password FROM departments WHERE admin_email = ${email} AND department_key = ${department_key}`;
      if (rows.length === 0) return err("Invalid credentials", 401);
      const dept = rows[0];
      const valid = await verifyPassword(password, dept.password);
      if (!valid) return err("Invalid credentials", 401);
      return json({ id: dept.id, name: dept.name, admin_email: dept.admin_email, department_key: dept.department_key });
    }

    if (path === "auth/faculty-login" && method === "POST") {
      const body = await req.json();
      const { email, password } = body;
      if (!email || !password) return err("Missing fields");
      const rows = await sql`SELECT id, name, email, department_id, password FROM faculty WHERE email = ${email}`;
      if (rows.length === 0) return err("Invalid credentials", 401);
      const fac = rows[0];
      const valid = await verifyPassword(password, fac.password);
      if (!valid) return err("Invalid credentials", 401);
      return json({ id: fac.id, name: fac.name, email: fac.email, department_id: fac.department_id });
    }

    return err("Not found", 404);
  } catch (e) {
    console.error("DB API error:", e);
    return err(e.message || "Internal error", 500);
  } finally {
    await sql.end();
  }
});
