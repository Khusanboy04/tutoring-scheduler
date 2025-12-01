// =============================
// Tutoring Schedule Web App Backend
// =============================

const express = require("express");
const mysql = require("mysql2");
const bodyParser = require("body-parser");
const cors = require("cors");
const bcrypt = require("bcryptjs");

const app = express();
//app.use(cors());
app.use(bodyParser.json());

app.use(
  cors({
    origin: "*", // we can tighten later if needed
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  })
);
app.use(express.json());

// =============================
// DATABASE CONNECTION
// =============================

// const db = mysql.createPool({
//   host: "localhost",
//   user: "root",                // ⬅️ change if needed
//   password: "S@m@nd@r@k2004", // ⬅️ put your MySQL password
//   database: "tutoring_system",
// });

const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.MYSQLHOST || "localhost",
  user: process.env.MYSQLUSER || "root",
  password: process.env.MYSQLPASSWORD || "S@m@nd@r@k2004",
  database: process.env.MYSQLDATABASE || "tutoring_system",
  port: process.env.MYSQLPORT || 3306,
});

// Simple helper using Promises
function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) return reject(err);
      resolve(results);
    });
  });
}

function formatDateForMessage(dateValue) {
  // dateValue may already be a Date (from mysql2)
  const d = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (isNaN(d.getTime())) return String(dateValue);

  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ];
  const month = months[d.getMonth()];
  const day = d.getDate();
  const year = d.getFullYear();
  return `${month} ${day}, ${year}`;
}

function formatTimeForMessage(timeStr) {
  if (!timeStr) return "";
  // timeStr like "13:00:00" or "13:00"
  const parts = timeStr.split(":");
  let hour = parseInt(parts[0], 10);
  const minute = parts[1] || "00";

  const ampm = hour >= 12 ? "PM" : "AM";
  hour = ((hour + 11) % 12) + 1; // convert 0–23 → 1–12

  return `${hour}:${minute} ${ampm}`;
}


// Test connection
db.getConnection((err, conn) => {
  if (err) {
    console.error("❌ MySQL connection failed:", err.message);
  } else {
    console.log("✅ Connected to MySQL");
    conn.release();
  }
});

// =============================
// AUTH ROUTES
// =============================

// REGISTER
app.post("/api/register", async (req, res) => {
  try {
    const { full_name, email, password, role } = req.body;

    if (!full_name || !email || !password || !role) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Check if user already exists
    const existing = await query(
      "SELECT user_id FROM users WHERE email = ?",
      [email]
    );
    if (existing.length > 0) {
      return res.status(400).json({ message: "Email already registered" });
    }

    // Hash password
    const hashed = await bcrypt.hash(password, 10);

    const result = await query(
      "INSERT INTO users (full_name, email, password, role) VALUES (?, ?, ?, ?)",
      [full_name, email, hashed, role]
    );

    const newUser = {
      user_id: result.insertId,
      full_name,
      email,
      role,
    };

    res.status(201).json({ message: "User registered successfully", user: newUser });
  } catch (err) {
    console.error("Error in /api/register:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// LOGIN
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const users = await query("SELECT * FROM users WHERE email = ?", [email]);
    if (users.length === 0) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const user = users[0];

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Don't send password back
    const safeUser = {
      user_id: user.user_id,
      full_name: user.full_name,
      email: user.email,
      role: user.role,
    };

    res.json({ message: "Login successful", user: safeUser });
  } catch (err) {
    console.error("Error in /api/login:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =============================
// STUDENT: FIND TUTORS / AVAILABILITY
// =============================
// GET /api/tutors/availability?subject=Mathematics&date=2025-10-27&time=14:00
// Search available tutors by subject / date / time / tutorName
app.get("/api/tutors/availability", async (req, res) => {
  try {
    const { subject, tutorName, date, time } = req.query;

    let sql = `
      SELECT
        a.availability_id,
        a.tutor_id,
        a.available_date,
        a.start_time,
        a.end_time,
        a.status,
        u.full_name AS tutor_name,
        GROUP_CONCAT(DISTINCT s.subject_name ORDER BY s.subject_name SEPARATOR ', ') AS subjects
      FROM availability a
      JOIN users u ON a.tutor_id = u.user_id
      LEFT JOIN tutor_subjects ts ON ts.tutor_id = u.user_id
      LEFT JOIN subjects s ON s.subject_id = ts.subject_id
      WHERE a.status = 'available'
    `;
    const params = [];

    if (subject) {
      // exact match with dropdown value
      sql += " AND s.subject_name = ?";
      params.push(subject);
    }

    if (tutorName) {
      sql += " AND u.full_name LIKE ?";
      params.push(`%${tutorName}%`);
    }

    if (date) {
      sql += " AND a.available_date = ?";
      params.push(date);
    }

    if (time) {
      // time comes in like "10:00" from dropdown
      const t = `${time}:00`;
      sql += " AND a.start_time <= ? AND a.end_time >= ?";
      params.push(t, t);
    }

    sql += `
      GROUP BY
        a.availability_id,
        a.tutor_id,
        a.available_date,
        a.start_time,
        a.end_time,
        a.status,
        u.full_name
      ORDER BY a.available_date, a.start_time
    `;

    const rows = await query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error("Error in GET /api/tutors/availability:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =============================
// STUDENT: CREATE APPOINTMENT
// =============================
// POST /api/appointments
// body: { student_id, tutor_id, subject_name, availability_id }
// GET /api/tutors/availability?subject=&date=&time=&tutorName=
app.get("/api/tutors/availability", async (req, res) => {
  try {
    const { subject, date, time, tutorName } = req.query;

    let sql = `
      SELECT 
        a.availability_id,
        a.tutor_id,
        a.available_date,
        a.start_time,
        a.end_time,
        a.status,
        u.full_name AS tutor_name,
        s.subject_name
      FROM availability a
      JOIN users u ON a.tutor_id = u.user_id
      JOIN tutor_subjects ts ON ts.tutor_id = u.user_id
      JOIN subjects s ON s.subject_id = ts.subject_id
      WHERE a.status = 'available'
    `;
    const params = [];

    if (subject) {
      sql += " AND s.subject_name LIKE ?";
      params.push(`%${subject}%`);
    }
    if (date) {
      sql += " AND a.available_date = ?";
      params.push(date);
    }
    if (time) {
      sql += " AND a.start_time <= ? AND a.end_time >= ?";
      params.push(`${time}:00`, `${time}:00`);
    }
    if (tutorName) {
      sql += " AND u.full_name LIKE ?";
      params.push(`%${tutorName}%`);
    }

    sql += " ORDER BY a.available_date, a.start_time";

    const rows = await query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error("Error in /api/tutors/availability:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// STUDENT: UPCOMING (PENDING + ACCEPTED) APPOINTMENTS
app.get("/api/student/:studentId/appointments/upcoming", async (req, res) => {
  try {
    const studentId = req.params.studentId;

    const rows = await query(
      `
      SELECT
        ap.appointment_id,
        ap.status,
        a.available_date,
        a.start_time,
        a.end_time,
        s.subject_name,
        tut.full_name AS tutor_name
        
      FROM appointments ap
      JOIN availability a ON ap.availability_id = a.availability_id
      JOIN subjects s ON ap.subject_id = s.subject_id
      JOIN users tut ON ap.tutor_id = tut.user_id
      WHERE ap.student_id = ?
        AND ap.status IN ('pending', 'accepted')
      ORDER BY a.available_date, a.start_time
      `,
      [studentId]
    );

    res.json(rows);
  } catch (err) {
    console.error("Error in GET /api/student/:id/appointments/upcoming:", err);
    res.status(500).json({ message: "Server error" });
  }
});




// =============================
// TUTOR: VIEW APPOINTMENTS
// =============================
// GET /api/tutor/:tutorId/appointments
// POST /api/appointments
// STUDENT: CREATE APPOINTMENT (REQUEST SESSION)
app.post("/api/appointments", async (req, res) => {
  try {
    const { student_id, tutor_id, subject_name, availability_id } = req.body;

    if (!student_id || !tutor_id || !subject_name || !availability_id) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // 1) Make sure the time slot is still 'available'
    const slots = await query(
      "SELECT * FROM availability WHERE availability_id = ? AND status = 'available'",
      [availability_id]
    );
    if (slots.length === 0) {
      return res.status(400).json({ message: "Time slot is no longer available" });
    }
    const slot = slots[0];

    // 2) Get subject_id from subject_name
    const subjects = await query(
      "SELECT subject_id FROM subjects WHERE subject_name = ?",
      [subject_name]
    );
    if (subjects.length === 0) {
      return res.status(400).json({ message: "Unknown subject" });
    }
    const subject_id = subjects[0].subject_id;

    // 3) Create the appointment as 'pending'
    const result = await query(
      `INSERT INTO appointments
       (student_id, tutor_id, subject_id, availability_id, status)
       VALUES (?, ?, ?, ?, 'pending')`,
      [student_id, tutor_id, subject_id, availability_id]
    );

    // 4) Mark the availability as 'pending' so others can't grab it
    await query(
      "UPDATE availability SET status = 'pending' WHERE availability_id = ?",
      [availability_id]
    );

    // 5) Create a notification for the tutor
    const studentRows = await query(
      "SELECT full_name FROM users WHERE user_id = ?",
      [student_id]
    );
    const studentName = studentRows[0]?.full_name || "A student";

    const dateStr = formatDateForMessage(slot.available_date);
    const timeStr = formatTimeForMessage(slot.start_time);

    const message = `${studentName} requested a ${subject_name} session on ${dateStr} at ${timeStr}.`;

    await query(
      "INSERT INTO notifications (user_id, message) VALUES (?, ?)",
      [tutor_id, message]
    );

    res.status(201).json({
      message: "Appointment request sent to tutor",
      appointment_id: result.insertId,
    });
  } catch (err) {
    console.error("Error in POST /api/appointments:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// TUTOR: UPCOMING (PENDING + ACCEPTED) APPOINTMENTS
app.get("/api/tutor/:tutorId/appointments/upcoming", async (req, res) => {
  try {
    const tutorId = req.params.tutorId;

    const rows = await query(
      `
      SELECT
        ap.appointment_id,
        ap.status,
        a.available_date,
        a.start_time,
        a.end_time,
        s.subject_name,
        stu.full_name AS student_name
        
      FROM appointments ap
      JOIN availability a ON ap.availability_id = a.availability_id
      JOIN subjects s ON ap.subject_id = s.subject_id
      JOIN users stu ON ap.student_id = stu.user_id
      WHERE ap.tutor_id = ?
        AND ap.status IN ('pending', 'accepted')
      ORDER BY a.available_date, a.start_time
      `,
      [tutorId]
    );

    res.json(rows);
  } catch (err) {
    console.error("Error in GET /api/tutor/:id/appointments/upcoming:", err);
    res.status(500).json({ message: "Server error" });
  }
});




// =============================
// TUTOR: UPDATE APPOINTMENT STATUS
// =============================
// PUT /api/appointments/:id/status  body: { status: 'accepted' | 'declined' | 'completed' }
// TUTOR: UPDATE APPOINTMENT STATUS
app.put("/api/appointments/:id/status", async (req, res) => {
  try {
    const appointmentId = req.params.id;
    const { status } = req.body;

    const allowed = ["accepted", "declined", "completed"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const appts = await query(
      `SELECT 
         ap.appointment_id,
         ap.student_id,
         ap.tutor_id,
         ap.subject_id,
         ap.availability_id,
         a.available_date,
         a.start_time,
         s.subject_name,
         stu.full_name AS student_name,
         tut.full_name AS tutor_name
       FROM appointments ap
       JOIN availability a ON ap.availability_id = a.availability_id
       JOIN subjects s ON ap.subject_id = s.subject_id
       JOIN users stu ON ap.student_id = stu.user_id
       JOIN users tut ON ap.tutor_id = tut.user_id
       WHERE ap.appointment_id = ?`,
      [appointmentId]
    );

    if (appts.length === 0) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    const appt = appts[0];

    // Update appointment status
    await query(
      "UPDATE appointments SET status = ? WHERE appointment_id = ?",
      [status, appointmentId]
    );

    // Adjust availability depending on status
    if (status === "accepted") {
      await query(
        "UPDATE availability SET status = 'booked' WHERE availability_id = ?",
        [appt.availability_id]
      );
    } else if (status === "declined") {
      await query(
        "UPDATE availability SET status = 'available' WHERE availability_id = ?",
        [appt.availability_id]
      );
    }

    // Notification for student
    let msg;
    const dateStr = formatDateForMessage(appt.available_date);
    const timeStr = formatTimeForMessage(appt.start_time);

    if (status === "accepted") {
      msg = `${appt.tutor_name} accepted your ${appt.subject_name} session on ${dateStr} at ${timeStr}.`;
    } else if (status === "declined") {
      msg = `${appt.tutor_name} declined your ${appt.subject_name} session on ${dateStr} at ${timeStr}.`;
    } else if (status === "completed") {
      msg = `Your ${appt.subject_name} session on ${dateStr} was marked completed.`;
    }


    if (msg) {
      await query(
        "INSERT INTO notifications (user_id, message) VALUES (?, ?)",
        [appt.student_id, msg]
      );
    }

    res.json({ message: "Appointment status updated" });
  } catch (err) {
    console.error("Error in PUT /api/appointments/:id/status:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// TUTOR: SEE ONLY AVAILABLE / PENDING SLOTS IN "My Availability"
app.get("/api/tutor/:tutorId/availability", async (req, res) => {
  try {
    const tutorId = req.params.tutorId;

    const rows = await query(
      `
      SELECT
        availability_id,
        tutor_id,
        available_date,
        start_time,
        end_time,
        status
      FROM availability
      WHERE tutor_id = ?
        AND status IN ('available', 'pending')
      ORDER BY available_date, start_time
      `,
      [tutorId]
    );

    res.json(rows);
  } catch (err) {
    console.error("Error in GET /api/tutor/:tutorId/availability:", err);
    res.status(500).json({ message: "Server error" });
  }
});


// =============================
// START SERVER
// =============================
// const PORT = 3000;
// app.listen(PORT, () =>
//   console.log(`🚀 Server running on http://localhost:${PORT}`)
// );

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Get ALL subjects (for dropdowns)
app.get("/api/subjects", async (req, res) => {
  try {
    const rows = await query(
      "SELECT subject_id, subject_name FROM subjects ORDER BY subject_name"
    );
    res.json(rows);
  } catch (err) {
    console.error("Error in GET /api/subjects:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// TUTOR: VIEW ALL THEIR APPOINTMENT REQUESTS
app.get("/api/tutor/:tutorId/appointments", async (req, res) => {
  try {
    const tutorId = req.params.tutorId;

    const rows = await query(
      `
      SELECT 
        ap.appointment_id,
        ap.status,
        ap.created_at,
        a.availability_id,
        a.available_date,
        a.start_time,
        a.end_time,
        s.subject_name,
        stu.full_name AS student_name
      FROM appointments ap
      JOIN users stu ON ap.student_id = stu.user_id
      JOIN availability a ON ap.availability_id = a.availability_id
      JOIN subjects s ON ap.subject_id = s.subject_id
      WHERE ap.tutor_id = ?
      ORDER BY 
        CASE ap.status 
          WHEN 'pending' THEN 0
          WHEN 'accepted' THEN 1
          WHEN 'declined' THEN 2
          WHEN 'completed' THEN 3
          ELSE 4
        END,
        ap.created_at DESC
      `,
      [tutorId]
    );

    res.json(rows);
  } catch (err) {
    console.error("Error in GET /api/tutor/:tutorId/appointments:", err);
    res.status(500).json({ message: "Server error" });
  }
});


// GET tutor's subjects
app.get("/api/tutor/:tutorId/subjects", async (req, res) => {
  const tutorId = req.params.tutorId;
  try {
    const rows = await query(
      `SELECT s.subject_id, s.subject_name
       FROM tutor_subjects ts
       JOIN subjects s ON ts.subject_id = s.subject_id
       WHERE ts.tutor_id = ?
       ORDER BY s.subject_name`,
      [tutorId]
    );
    res.json(rows);
  } catch (err) {
    console.error("Error in GET tutor subjects:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST add subjects for a tutor
app.post("/api/tutor/subjects", async (req, res) => {
  try {
    const { tutor_id, subjects } = req.body;
    if (!tutor_id || !Array.isArray(subjects) || subjects.length === 0) {
      return res.status(400).json({ message: "tutor_id and subjects[] are required" });
    }

    for (const subjectName of subjects) {
      const name = subjectName.trim();
      if (!name) continue;

      let rows = await query("SELECT subject_id FROM subjects WHERE subject_name = ?", [name]);
      let subject_id;
      if (rows.length === 0) {
        const result = await query(
          "INSERT INTO subjects (subject_name) VALUES (?)",
          [name]
        );
        subject_id = result.insertId;
      } else {
        subject_id = rows[0].subject_id;
      }

      await query(
        "INSERT IGNORE INTO tutor_subjects (tutor_id, subject_id) VALUES (?, ?)",
        [tutor_id, subject_id]
      );
    }

    res.json({ message: "Subjects saved" });
  } catch (err) {
    console.error("Error in POST tutor subjects:", err);
    res.status(500).json({ message: "Server error" });
  }
});
// POST add availability slot
app.post("/api/tutor/availability", async (req, res) => {
  try {
    const { tutor_id, date, start_time } = req.body;
    if (!tutor_id || !date || !start_time) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Normalize start_time to HH:MM:SS for DB
    const startTimeDb = `${start_time}:00`;

    // 1) Check if a slot already exists for this tutor/date/start_time
    const existing = await query(
      `SELECT availability_id, status
       FROM availability
       WHERE tutor_id = ?
         AND available_date = ?
         AND start_time = ?`,
      [tutor_id, date, startTimeDb]
    );

    if (existing.length > 0) {
      return res
        .status(400)
        .json({ message: "You already have a slot at this time." });
    }

    // 2) Calculate 1-hour end time
    const [h, m] = start_time.split(":").map(Number);
    let endH = h + 1;
    if (endH >= 24) endH -= 24;
    const end_time = `${String(endH).padStart(2, "0")}:${String(m).padStart(
      2,
      "0"
    )}:00`;

    // 3) Insert new availability slot as 'available'
    await query(
      `INSERT INTO availability (tutor_id, available_date, start_time, end_time, status)
       VALUES (?, ?, ?, ?, 'available')`,
      [tutor_id, date, startTimeDb, end_time]
    );

    res.status(201).json({ message: "Availability added" });
  } catch (err) {
    console.error("Error in POST /api/tutor/availability:", err);
    res.status(500).json({ message: "Server error" });
  }
});


// GET notifications for a user
app.get("/api/notifications/:userId", async (req, res) => {
  const userId = req.params.userId;
  try {
    const rows = await query(
      `SELECT notification_id, message, status, created_at
       FROM notifications
       WHERE user_id = ?
       ORDER BY created_at DESC`,
      [userId]
    );

    res.json(rows);
  } catch (err) {
    console.error("Error in GET /api/notifications/:userId:", err);
    res.status(500).json({ message: "Server error" });
  }
});



// PUT mark notification read
app.put("/api/notifications/:id/read", async (req, res) => {
  const id = req.params.id;
  try {
    await query(
      "UPDATE notifications SET status = 'read' WHERE notification_id = ?",
      [id]
    );
    res.json({ message: "Notification marked as read" });
  } catch (err) {
    console.error("Error in PUT /api/notifications/:id/read:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ADMIN: SYSTEM SUMMARY
app.get("/api/admin/summary", async (req, res) => {
  try {
    const [users, students, tutors, allAppointments, activeAppointments, pending, accepted] =
      await Promise.all([
        query("SELECT COUNT(*) AS c FROM users"),
        query("SELECT COUNT(*) AS c FROM users WHERE role = 'student'"),
        query("SELECT COUNT(*) AS c FROM users WHERE role = 'tutor'"),
        query("SELECT COUNT(*) AS c FROM appointments"), // all-time
        query(
          "SELECT COUNT(*) AS c FROM appointments WHERE status IN ('pending','accepted')"
        ), // active
        query("SELECT COUNT(*) AS c FROM appointments WHERE status = 'pending'"),
        query("SELECT COUNT(*) AS c FROM appointments WHERE status = 'accepted'"),
      ]);

    res.json({
      total_users: users[0].c,
      total_students: students[0].c,
      total_tutors: tutors[0].c,
      total_appointments: allAppointments[0].c,          // all-time total
      active_appointments: activeAppointments[0].c,      // only pending+accepted
      pending_appointments: pending[0].c,
      accepted_appointments: accepted[0].c,
    });
  } catch (err) {
    console.error("Error in GET /api/admin/summary:", err);
    res.status(500).json({ message: "Server error" });
  }
});


// ADMIN: ADD SUBJECT
app.post("/api/subjects", async (req, res) => {
  try {
    const { subject_name } = req.body;
    if (!subject_name || !subject_name.trim()) {
      return res.status(400).json({ message: "Subject name is required" });
    }

    // prevent duplicates
    const existing = await query(
      "SELECT subject_id FROM subjects WHERE subject_name = ?",
      [subject_name.trim()]
    );
    if (existing.length > 0) {
      return res.status(400).json({ message: "Subject already exists" });
    }

    const result = await query(
      "INSERT INTO subjects (subject_name) VALUES (?)",
      [subject_name.trim()]
    );
    res
      .status(201)
      .json({ message: "Subject added", subject_id: result.insertId });
  } catch (err) {
    console.error("Error in POST /api/subjects:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ADMIN: DELETE SUBJECT
app.delete("/api/subjects/:id", async (req, res) => {
  const subjectId = req.params.id;
  try {
    // check if used in tutor_subjects or appointments
    const used = await query(
      `
      SELECT 'tutor_subject' AS src FROM tutor_subjects WHERE subject_id = ?
      UNION
      SELECT 'appointment' AS src FROM appointments WHERE subject_id = ?
      `,
      [subjectId, subjectId]
    );
    if (used.length > 0) {
      return res.status(400).json({
        message:
          "Cannot delete subject: it is used by tutors or appointments.",
      });
    }

    await query("DELETE FROM subjects WHERE subject_id = ?", [subjectId]);
    res.json({ message: "Subject deleted" });
  } catch (err) {
    console.error("Error in DELETE /api/subjects/:id:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ADMIN: VIEW ALL AVAILABILITY + ACTIVE SESSIONS
app.get("/api/admin/availability", async (req, res) => {
  try {
    const rows = await query(
      `
      SELECT
        a.availability_id,
        a.tutor_id,
        a.available_date,
        a.start_time,
        a.end_time,
        a.status,
        u.full_name AS tutor_name,
        ap.appointment_id,
        ap.status AS appointment_status,
        s.subject_name,
        stu.full_name AS student_name
      FROM availability a
      JOIN users u ON a.tutor_id = u.user_id
      LEFT JOIN appointments ap 
        ON ap.availability_id = a.availability_id
        AND ap.status IN ('pending', 'accepted')
      LEFT JOIN subjects s ON ap.subject_id = s.subject_id
      LEFT JOIN users stu ON ap.student_id = stu.user_id
      ORDER BY a.available_date DESC, a.start_time DESC
      `
    );

    res.json(rows);
  } catch (err) {
    console.error("Error in GET /api/admin/availability:", err);
    res.status(500).json({ message: "Server error" });
  }
});


// ADMIN: DELETE AVAILABILITY (only if no appointment)
app.delete("/api/admin/availability/:id", async (req, res) => {
  const availabilityId = req.params.id;
  try {
    const used = await query(
      "SELECT appointment_id FROM appointments WHERE availability_id = ?",
      [availabilityId]
    );
    if (used.length > 0) {
      return res.status(400).json({
        message:
          "Cannot delete: this slot has an appointment. Cancel the session instead.",
      });
    }

    await query("DELETE FROM availability WHERE availability_id = ?", [
      availabilityId,
    ]);
    res.json({ message: "Availability slot deleted" });
  } catch (err) {
    console.error("Error in DELETE /api/admin/availability/:id:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ADMIN: CANCEL A SESSION (APPOINTMENT + AVAILABILITY)
app.post("/api/admin/appointments/:id/cancel", async (req, res) => {
  const appointmentId = req.params.id;
  try {
    const appts = await query(
      `
      SELECT 
        ap.appointment_id,
        ap.student_id,
        ap.tutor_id,
        ap.subject_id,
        ap.availability_id,
        ap.status AS appointment_status,
        a.available_date,
        a.start_time,
        s.subject_name,
        stu.full_name AS student_name,
        tut.full_name AS tutor_name
      FROM appointments ap
      JOIN availability a ON ap.availability_id = a.availability_id
      JOIN subjects s ON ap.subject_id = s.subject_id
      JOIN users stu ON ap.student_id = stu.user_id
      JOIN users tut ON ap.tutor_id = tut.user_id
      WHERE ap.appointment_id = ?
      `,
      [appointmentId]
    );

    if (appts.length === 0) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    const appt = appts[0];

    // Only cancel if it's currently pending or accepted
    if (appt.appointment_status !== "pending" && appt.appointment_status !== "accepted") {
      return res.status(400).json({ message: "Only pending or accepted sessions can be cancelled." });
    }

    // 1) Update appointment status to 'declined'
    await query(
      "UPDATE appointments SET status = 'declined' WHERE appointment_id = ?",
      [appointmentId]
    );

    // 2) Free the availability slot
    await query(
      "UPDATE availability SET status = 'available' WHERE availability_id = ?",
      [appt.availability_id]
    );

    // 3) Notify both student and tutor
    const dateStr = formatDateForMessage(appt.available_date);
    const timeStr = formatTimeForMessage(appt.start_time);

    const msgStudent = `An administrator cancelled your ${appt.subject_name} session on ${dateStr} at ${timeStr}.`;
    const msgTutor = `An administrator cancelled your ${appt.subject_name} session with ${appt.student_name} on ${dateStr} at ${timeStr}.`;

    await query(
      "INSERT INTO notifications (user_id, message) VALUES (?, ?), (?, ?)",
      [appt.student_id, msgStudent, appt.tutor_id, msgTutor]
    );

    res.json({ message: "Session cancelled by admin" });
  } catch (err) {
    console.error("Error in POST /api/admin/appointments/:id/cancel:", err);
    res.status(500).json({ message: "Server error" });
  }
});





