// =============================
// Global config & helpers
// =============================

const API_BASE = "https://tutoring-scheduler.onrender.com/api";

function getCurrentUser() {
  try {
    const raw = localStorage.getItem("user");
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function saveCurrentUser(user) {
  localStorage.setItem("user", JSON.stringify(user));
}

function logout() {
  localStorage.removeItem("user");
  window.location.href = "login.html";
}

function toDateObject(value) {
  if (!value) return null;

  // If it's already a Date, normalize it to local date (strip time)
  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  const str = String(value); // e.g. "2025-12-08" or "2025-12-08T00:00:00.000Z"
  const datePart = str.split("T")[0]; // "2025-12-08"

  const parts = datePart.split("-");
  if (parts.length !== 3) return null;

  const [y, m, d] = parts.map(Number);
  if (!y || !m || !d) return null;

  // Create a local date: year, monthIndex (0-based), day
  return new Date(y, m - 1, d);
}


function formatDate(value) {
  const d = toDateObject(value);
  if (!d) return "";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatTime(timeStr) {
  if (!timeStr) return "";
  // timeStr can be "10:00" or "10:00:00"
  const parts = timeStr.split(":");
  let hour = parseInt(parts[0], 10);
  const mm = parts[1] || "00";
  const ampm = hour >= 12 ? "PM" : "AM";
  hour = ((hour + 11) % 12) + 1;
  return `${hour}:${mm} ${ampm}`;
}

function formatDateTime(dateValue, timeStr) {
  return `${formatDate(dateValue)} • ${formatTime(timeStr)}`;
}

// Add 1 hour to "HH:MM"
function addOneHour(timeStr) {
  const [h, m] = timeStr.split(":").map(Number);
  let h2 = h + 1;
  if (h2 >= 24) h2 -= 24;
  const hh = String(h2).padStart(2, "0");
  return `${hh}:${m.toString().padStart(2, "0")}`;
}

function getLocationForSubject(subjectName) {
  if (!subjectName) return "";

  const name = subjectName.toLowerCase();

  if (name.startsWith("math")) {
    return "Hume Hall 324 or 326";
  }

  if (name.startsWith("csci")) {
    return "Weir Hall 234";
  }

  return "";
}


// =============================
// LOGIN PAGE (login.html)
// =============================

const loginForm = document.getElementById("loginForm");
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    if (!email || !password) {
      alert("Please enter your email and password.");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.message || "Login failed");
        return;
      }

      saveCurrentUser(data.user);

      window.location.href = "dashboard.html";
    } catch (err) {
      console.error("Login error:", err);
      alert("Error connecting to server");
    }
  });
}

// =============================
// REGISTER PAGE (register.html)
// =============================

const registerForm = document.getElementById("registerForm");
if (registerForm) {
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const full_name = document.getElementById("name").value.trim();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const role = document.getElementById("role").value; // student | tutor | admin

    if (!full_name || !email || !password || !role) {
      alert("Please fill in all fields.");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name, email, password, role }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.message || "Registration failed");
        return;
      }

      alert("Registration successful! Please log in.");
      window.location.href = "login.html";
    } catch (err) {
      console.error("Register error:", err);
      alert("Error connecting to server");
    }
  });
}

// =============================
// DASHBOARD (dashboard.html)
// =============================

const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", logout);
}

const studentDashboard = document.getElementById("studentDashboard");
const tutorDashboard = document.getElementById("tutorDashboard");
const adminDashboard = document.getElementById("adminDashboard");
const currentUserLabel = document.getElementById("currentUserLabel");

if (studentDashboard || tutorDashboard || adminDashboard) {
  const user = getCurrentUser();
  if (!user) {
    window.location.href = "login.html";
  } else {
    if (currentUserLabel) {
      currentUserLabel.textContent = `${user.full_name} (${user.role})`;
    }

    if (user.role === "student") {
      studentDashboard?.classList.add("active");
      initStudentDashboard(user);
    } else if (user.role === "tutor") {
      tutorDashboard?.classList.add("active");
      initTutorDashboard(user);
    } else if (user.role === "admin") {
      adminDashboard?.classList.add("active");
      initAdminDashboard(user);
    } else {
      // fallback
      studentDashboard?.classList.add("active");
      initStudentDashboard(user);
    }
  }
}

// =============================
// STUDENT DASHBOARD LOGIC
// =============================

async function initStudentDashboard(user) {
  const searchForm = document.getElementById("studentSearchForm");
  const resultsList = document.getElementById("studentResultsList");
  const notificationsList = document.getElementById("studentNotificationsList");
  const subjectSelect = document.getElementById("studentSearchSubject");
  const appointmentsList = document.getElementById("studentAppointmentsList");
  
  await loadSubjectsForStudent(subjectSelect);

  if (searchForm && resultsList) {
    searchForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      await loadStudentSearchResults(user, resultsList);
    });
  }

  if (notificationsList) {
    await loadNotifications(user, notificationsList);
  }

  if (appointmentsList) {
    await loadStudentAppointments(user, appointmentsList);
  }
}



async function loadStudentSearchResults(user, resultsList) {
  if (!resultsList) return;

  const subject = document.getElementById("studentSearchSubject").value;
  const tutorName = document.getElementById("studentSearchTutorName").value.trim();
  const date = document.getElementById("studentSearchDate").value;
  const time = document.getElementById("studentSearchTime").value;

  const params = new URLSearchParams();
  if (subject) params.append("subject", subject);
  if (tutorName) params.append("tutorName", tutorName);
  if (date) params.append("date", date);
  if (time) params.append("time", time);

  const url = `${API_BASE}/tutors/availability?${params.toString()}`;
  console.log("Student search URL:", url);

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error("Search failed with status", res.status);
      alert("Error searching for tutors");
      return;
    }
    const slots = await res.json();
    console.log("Search results:", slots);

    resultsList.innerHTML = "";
    if (!Array.isArray(slots) || slots.length === 0) {
      const li = document.createElement("li");
      li.textContent = "No matching tutors or time slots found.";
      resultsList.appendChild(li);
      return;
    }

    slots.forEach((slot) => {
      const li = document.createElement("li");
      const endTime = addOneHour(slot.start_time);

      // If the student selected a subject, we use that.
      // Otherwise, we guess the first subject from slot.subjects (if any).
      let subjectForThisSlot = subject;
      if (!subjectForThisSlot && slot.subjects) {
        subjectForThisSlot = slot.subjects.split(", ")[0]; // first subject in the list
      }

      li.innerHTML = `
        <strong>${slot.tutor_name}</strong><br>
        <span class="small-muted">
          Subjects: ${slot.subjects || "Not set"}<br>
          ${formatDateTime(slot.available_date, slot.start_time)} - ${formatTime(endTime)}
        </span><br>
      `;

      const btn = document.createElement("button");
      btn.textContent = "Request Session";
      btn.classList.add("request-btn");
      btn.dataset.availabilityId = slot.availability_id;
      btn.dataset.tutorId = slot.tutor_id;
      btn.dataset.subjectName = subjectForThisSlot || "";

      btn.addEventListener("click", async () => {
        await createStudentRequest(user, btn.dataset);
        // After requesting, reload the list (slot might go to pending and disappear)
        await loadStudentSearchResults(user, resultsList);
      });

      li.appendChild(btn);
      resultsList.appendChild(li);
    });
  } catch (err) {
    console.error("Error in loadStudentSearchResults:", err);
    alert("Error connecting to server");
  }
}



// Load all subjects into the student search dropdown
async function populateStudentSubjects(selectEl) {
  try {
    const res = await fetch(`${API_BASE}/subjects`);
    if (!res.ok) {
      console.error("Failed to load subjects:", res.status);
      return;
    }
    const subjects = await res.json();

    // Clear existing options
    selectEl.innerHTML = "";

    // Optional "All subjects" choice
    const optAll = document.createElement("option");
    optAll.value = "";
    optAll.textContent = "Any subject";
    selectEl.appendChild(optAll);

    subjects.forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s.subject_id;
      opt.textContent = s.subject_name;
      selectEl.appendChild(opt);
    });
  } catch (err) {
    console.error("Error loading subjects:", err);
  }
}


async function createStudentRequest(user, dataset) {
  const availabilityId = dataset.availabilityId;
  const tutorId = dataset.tutorId;
  const subjectName = dataset.subjectName;

  if (!availabilityId || !tutorId) {
    alert("Missing information for this slot.");
    return;
  }
  if (!subjectName) {
    alert("No subject selected for this session. Please search by subject first.");
    return;
  }

  if (!confirm(`Request a ${subjectName} session with this tutor?`)) {
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/appointments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        student_id: user.user_id,
        tutor_id: Number(tutorId),
        subject_name: subjectName,
        availability_id: Number(availabilityId),
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      alert(data.message || "Failed to request session");
      return;
    }

    alert(data.message || "Session requested!");
  } catch (err) {
    console.error("Error creating appointment:", err);
    alert("Error connecting to server");
  }
}

function showStudentPanel(panelName) {
  const panels = {
    search: document.getElementById("studentPanel_search"),
    upcoming: document.getElementById("studentPanel_upcoming"),
    requests: document.getElementById("studentPanel_requests"),
    notifications: document.getElementById("studentPanel_notifications"),
  };

  Object.keys(panels).forEach((key) => {
    if (panels[key]) {
      panels[key].style.display = key === panelName ? "block" : "none";
    }
  });

  // Toggle active class on buttons
  const btns = {
    search: document.getElementById("btnStudentSearch"),
    upcoming: document.getElementById("btnStudentUpcoming"),
    requests: document.getElementById("btnStudentRequests"),
    notifications: document.getElementById("btnStudentNotifications"),
  };

  Object.keys(btns).forEach((key) => {
    if (btns[key]) {
      btns[key].classList.toggle("subnav-btn-active", key === panelName);
    }
  });
}




async function bookAppointment(user, slot) {
  if (!user || !slot) return;
  if (!confirm(`Request ${slot.subject_name} with ${slot.tutor_name} on ${formatDate(slot.available_date)} at ${formatTime(slot.start_time)}?`)) {
    return;
  }



  try {
    const res = await fetch(`${API_BASE}/appointments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        student_id: user.user_id,
        tutor_id: slot.tutor_id,
        subject_name: slot.subject_name,
        availability_id: slot.availability_id,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.message || "Failed to request appointment");
      return;
    }
    alert(data.message || "Appointment requested!");
  } catch (err) {
    console.error("Error booking appointment:", err);
    alert("Error connecting to server");
  }
}

// Load subjects into the student search dropdown
async function loadSubjectsForStudent(selectEl) {
  if (!selectEl) return;
  try {
    const res = await fetch(`${API_BASE}/subjects`);
    const subjects = await res.json();

    selectEl.innerHTML = `<option value="">Any subject</option>`;
    if (Array.isArray(subjects)) {
      subjects.forEach((s) => {
        const opt = document.createElement("option");
        opt.value = s.subject_name;
        opt.textContent = s.subject_name;
        selectEl.appendChild(opt);
      });
    }
  } catch (err) {
    console.error("Error loading student subjects:", err);
  }
}

async function loadStudentAppointments(user, listEl) {
  if (!user || !listEl) return;

  try {
    const res = await fetch(`${API_BASE}/student/${user.user_id}/appointments/upcoming`);
    if (!res.ok) {
      console.error("Failed to load student appointments:", res.status);
      listEl.innerHTML = "<li>Error loading sessions.</li>";
      return;
    }

    const appts = await res.json();
    console.log("Student upcoming sessions:", appts);

    listEl.innerHTML = "";

    if (!Array.isArray(appts) || appts.length === 0) {
      const li = document.createElement("li");
      li.textContent = "No upcoming sessions.";
      listEl.appendChild(li);
      return;
    }

    appts.forEach((appt) => {
      const li = document.createElement("li");
      const endTime = addOneHour(appt.start_time);

      const pillClass =
        appt.status === "pending"
          ? "pill pill-pending"
          : appt.status === "accepted"
          ? "pill pill-accepted"
          : "pill";

      // NEW: only show location if accepted
      let locationLine = "";
      if (appt.status === "accepted") {
        const loc = getLocationForSubject(appt.subject_name);
        if (loc) {
          locationLine = `<br>Location: ${loc}`;
        }
      }

      li.innerHTML = `
        <strong>${appt.subject_name}</strong><br>
        With: ${appt.tutor_name}<br>
        <span class="small-muted">
          ${formatDateTime(appt.available_date, appt.start_time)} - ${formatTime(endTime)}
        </span>
        ${locationLine}
        <span class="${pillClass}">${appt.status}</span>
      `;
      listEl.appendChild(li);
    });
  } catch (err) {
    console.error("Error loading student appointments:", err);
    listEl.innerHTML = "<li>Error loading sessions.</li>";
  }
}







// =============================
// TUTOR DASHBOARD LOGIC
// =============================

async function initTutorDashboard(user) {
  const subjectForm = document.getElementById("tutorSubjectForm");
  const subjectSelectToAdd = document.getElementById("tutorSubjectSelect");
  const subjectsList = document.getElementById("tutorSubjectsList");

  const availabilityForm = document.getElementById("tutorAvailabilityForm");
  const availabilityList = document.getElementById("tutorAvailabilityList");
  const requestsList = document.getElementById("tutorRequestsList");
  const notificationsList = document.getElementById("tutorNotificationsList");
  const upcomingList = document.getElementById("tutorUpcomingList");

  // 1) Load ALL subjects for the "Add Subject" dropdown
  await loadAllSubjects(subjectSelectToAdd);

  // 2) Load this tutor's subjects, availability, requests, notifications
  await loadTutorSubjects(user, subjectsList, null); // we don't need subject select here anymore
  await loadTutorAvailability(user, availabilityList);
  await loadTutorRequests(user, requestsList);
  await loadNotifications(user, notificationsList);
  if (upcomingList) {
    await loadTutorUpcomingAppointments(user, upcomingList);
  }

  // Add subject to this tutor
  if (subjectForm && subjectSelectToAdd) {
    subjectForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const subjectName = subjectSelectToAdd.value;
      if (!subjectName) {
        alert("Please select a subject to add.");
        return;
      }

      await addTutorSubject(user, subjectName);
      await loadTutorSubjects(user, subjectsList, null);
    });
  }

  // Add availability (no subject!)
  if (availabilityForm) {
    availabilityForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const date = document.getElementById("tutorAvailDate").value;
      const startTime = document.getElementById("tutorAvailStartTime").value;

      if (!date || !startTime) {
        alert("Please choose date and start time.");
        return;
      }

      await addTutorAvailability(user, date, startTime);
      await loadTutorAvailability(user, availabilityList);
    });
  }
}



// Load ALL subjects (for the dropdown where tutor chooses which course to add)
async function loadAllSubjects(selectEl) {
  if (!selectEl) return;
  try {
    const res = await fetch(`${API_BASE}/subjects`);
    const subjects = await res.json();

    selectEl.innerHTML = `<option value="">Select subject to add</option>`;
    if (Array.isArray(subjects)) {
      subjects.forEach((s) => {
        const opt = document.createElement("option");
        opt.value = s.subject_name;
        opt.textContent = s.subject_name;
        selectEl.appendChild(opt);
      });
    }
  } catch (err) {
    console.error("Error loading all subjects:", err);
  }
}

async function loadTutorUpcomingAppointments(user, listEl) {
  if (!user || !listEl) return;

  try {
    const res = await fetch(`${API_BASE}/tutor/${user.user_id}/appointments/upcoming`);
    if (!res.ok) {
      console.error("Failed to load tutor upcoming appointments:", res.status);
      listEl.innerHTML = "<li>Error loading sessions.</li>";
      return;
    }

    const appts = await res.json();
    console.log("Tutor upcoming sessions:", appts);

    listEl.innerHTML = "";

    if (!Array.isArray(appts) || appts.length === 0) {
      const li = document.createElement("li");
      li.textContent = "No upcoming sessions.";
      listEl.appendChild(li);
      return;
    }

    appts.forEach((appt) => {
      const li = document.createElement("li");
      const endTime = addOneHour(appt.start_time);

      const pillClass =
        appt.status === "pending"
          ? "pill pill-pending"
          : appt.status === "accepted"
          ? "pill pill-accepted"
          : "pill";

      // NEW: only show location if accepted
      let locationLine = "";
      if (appt.status === "accepted") {
        const loc = getLocationForSubject(appt.subject_name);
        if (loc) {
          locationLine = `<br>Location: ${loc}`;
        }
      }

      li.innerHTML = `
        <strong>${appt.subject_name}</strong><br>
        With: ${appt.student_name}<br>
        <span class="small-muted">
          ${formatDateTime(appt.available_date, appt.start_time)} - ${formatTime(endTime)}
        </span>
        ${locationLine}
        <span class="${pillClass}">${appt.status}</span>
      `;
      listEl.appendChild(li);
    });
  } catch (err) {
    console.error("Error loading tutor upcoming appointments:", err);
    listEl.innerHTML = "<li>Error loading sessions.</li>";
  }
}




// ---- Tutor subjects ----
async function loadTutorSubjects(user, listEl, selectEl) {
  if (!user) return;
  try {
    const res = await fetch(`${API_BASE}/tutor/${user.user_id}/subjects`);
    const subjects = await res.json();

    if (listEl) {
      listEl.innerHTML = "";
      if (!Array.isArray(subjects) || subjects.length === 0) {
        const li = document.createElement("li");
        li.textContent = "No subjects yet. Add your first one above.";
        listEl.appendChild(li);
      } else {
        subjects.forEach((s) => {
          const li = document.createElement("li");
          li.textContent = s.subject_name;
          listEl.appendChild(li);
        });
      }
    }

    if (selectEl) {
      selectEl.innerHTML = `<option value="">Select subject</option>`;
      if (Array.isArray(subjects)) {
        subjects.forEach((s) => {
          const opt = document.createElement("option");
          opt.value = s.subject_name;
          opt.textContent = s.subject_name;
          selectEl.appendChild(opt);
        });
      }
    }
  } catch (err) {
    console.error("Error loading tutor subjects:", err);
  }
}


async function addTutorSubject(user, subjectName) {
  try {
    const res = await fetch(`${API_BASE}/tutor/subjects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tutor_id: user.user_id,
        subjects: [subjectName],
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.message || "Failed to add subject");
    }
  } catch (err) {
    console.error("Error adding tutor subject:", err);
    alert("Error connecting to server");
  }
}


// ---- Tutor availability ----

async function loadTutorAvailability(user, listEl) {
  if (!user || !listEl) return;
  try {
    const res = await fetch(`${API_BASE}/tutor/${user.user_id}/availability`);
    const slots = await res.json();

    listEl.innerHTML = "";
    if (!Array.isArray(slots) || slots.length === 0) {
      const li = document.createElement("li");
      li.textContent = "No availability yet.";
      listEl.appendChild(li);
      return;
    }

    slots.forEach((slot) => {
      const li = document.createElement("li");
      const endTime = addOneHour(slot.start_time);
      const statusPillClass =
        slot.status === "available"
          ? "pill pill-available"
          : slot.status === "pending"
          ? "pill pill-pending"
          : "pill pill-booked";

      li.innerHTML = `
        ${formatDateTime(slot.available_date, slot.start_time)} - ${formatTime(endTime)}
        <span class="${statusPillClass}">${slot.status}</span>
      `;
      listEl.appendChild(li);
    });
  } catch (err) {
    console.error("Error loading tutor availability:", err);
  }
}


async function addTutorAvailability(user, date, startTime) {
  try {
    const res = await fetch(`${API_BASE}/tutor/availability`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tutor_id: user.user_id,
        date,
        start_time: startTime,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.message || "Failed to add availability");
    }
  } catch (err) {
    console.error("Error adding availability:", err);
    alert("Error connecting to server");
  }
}


// Tutor requests (appointments)
async function loadTutorRequests(user, listEl) {
  if (!user || !listEl) return;

  try {
    const res = await fetch(`${API_BASE}/tutor/${user.user_id}/appointments`);
    let appointments = await res.json();

    if (!Array.isArray(appointments)) appointments = [];

    // Only pending requests
    appointments = appointments.filter((appt) => appt.status === "pending");

    listEl.innerHTML = "";

    if (appointments.length === 0) {
      const li = document.createElement("li");
      li.textContent = "No incoming requests.";
      listEl.appendChild(li);
      return;
    }

    appointments.forEach((appt) => {
      const li = document.createElement("li");
      const endTime = addOneHour(appt.start_time);

      const pillClass =
        appt.status === "pending"
          ? "pill pill-pending"
          : appt.status === "accepted"
          ? "pill pill-accepted"
          : appt.status === "declined"
          ? "pill pill-declined"
          : "pill";

      li.innerHTML = `
        <strong>${appt.student_name}</strong><br>
        Subject: ${appt.subject_name}<br>
        Time: ${formatDateTime(appt.available_date, appt.start_time)} - ${formatTime(endTime)}
        <span class="${pillClass}">${appt.status}</span>
      `;

      if (appt.status === "pending") {
        const acceptBtn = document.createElement("button");
        acceptBtn.textContent = "Accept";
        acceptBtn.classList.add("accept");
        acceptBtn.addEventListener("click", () =>
          updateAppointmentStatus(user, appt.appointment_id, "accepted", listEl)
        );

        const declineBtn = document.createElement("button");
        declineBtn.textContent = "Decline";
        declineBtn.classList.add("decline");
        declineBtn.addEventListener("click", () =>
          updateAppointmentStatus(user, appt.appointment_id, "declined", listEl)
        );

        li.appendChild(document.createElement("br"));
        li.appendChild(acceptBtn);
        li.appendChild(declineBtn);
      }

      listEl.appendChild(li);
    });
  } catch (err) {
    console.error("Error loading tutor appointments:", err);
    alert("Error connecting to server");
  }
}

async function updateAppointmentStatus(user, appointmentId, status, listEl) {
  try {
    const res = await fetch(`${API_BASE}/appointments/${appointmentId}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });

    const data = await res.json();
    if (!res.ok) {
      alert(data.message || "Failed to update appointment");
      return;
    }

    alert(data.message || "Status updated");

    // 1) Reload the tutor's incoming requests list
    await loadTutorRequests(user, listEl);

    // 2) Reload notifications so tutor sees "You accepted/declined..." right away
    const notifListEl = document.getElementById("notificationList");
    if (notifListEl) {
      await loadNotifications(user, notifListEl);
    }
  } catch (err) {
    console.error("Error updating appointment status:", err);
    alert("Error connecting to server");
  }
}

// =============================
// Notifications (student + tutor)
// =============================

async function loadNotifications(user, listEl) {
  if (!user || !listEl) return;
  try {
    const res = await fetch(`${API_BASE}/notifications/${user.user_id}`);
    let notifs = await res.json();

    listEl.innerHTML = "";
    if (!Array.isArray(notifs) || notifs.length === 0) {
      const li = document.createElement("li");
      li.textContent = "No notifications.";
      listEl.appendChild(li);
      return;
    }

    // Just to be safe, cap to 40 on the frontend as well
    notifs = notifs.slice(0, 40);

    notifs.forEach((n) => {
      const li = document.createElement("li");
      li.classList.add("notification-item");

      if (n.status === "unread") {
        li.classList.add("unread");
      }

      // Message
      const msgSpan = document.createElement("span");
      msgSpan.textContent = n.message;
      li.appendChild(msgSpan);

      // Time (created_at)
      if (n.created_at) {
        const timeDiv = document.createElement("div");
        timeDiv.classList.add("small-muted");
        const dt = new Date(n.created_at);
        timeDiv.textContent = dt.toLocaleString(); // you can customize format if you want
        li.appendChild(timeDiv);
      }

      // "Mark as read" button only for unread notifications
      if (n.status === "unread") {
        const btn = document.createElement("button");
        btn.textContent = "Mark as read";
        btn.classList.add("mark-read-btn");
        btn.addEventListener("click", async () => {
          try {
            const res2 = await fetch(
              `${API_BASE}/notifications/${n.notification_id}/read`,
              { method: "PUT" }
            );
            if (!res2.ok) {
              console.error("Failed to mark notification read");
              return;
            }
            // Update UI state without full reload
            li.classList.remove("unread");
            btn.remove();
          } catch (err) {
            console.error("Error marking notification read:", err);
          }
        });
        li.appendChild(document.createTextNode(" "));
        li.appendChild(btn);
      }

      listEl.appendChild(li);
    });
  } catch (err) {
    console.error("Error loading notifications:", err);
  }
}



async function markNotificationRead(id) {
  try {
    await fetch(`${API_BASE}/notifications/${id}/read`, {
      method: "PUT",
    });
  } catch (err) {
    console.error("Error marking notification read:", err);
  }
}

// ADMIN Dashboard

async function initAdminDashboard(user) {
  const totalUsersEl = document.getElementById("adminTotalUsers");
  const totalStudentsEl = document.getElementById("adminTotalStudents");
  const totalTutorsEl = document.getElementById("adminTotalTutors");
  const totalAppointmentsEl = document.getElementById("adminTotalAppointments");
  const pendingAppointmentsEl = document.getElementById("adminPendingAppointments");

  const subjectsList = document.getElementById("adminSubjectsList");
  const subjectForm = document.getElementById("adminSubjectForm");
  const newSubjectInput = document.getElementById("adminNewSubjectName");

  const availabilityList = document.getElementById("adminAvailabilityList");

  // Load overview
  await loadAdminSummary({
    totalUsersEl,
    totalStudentsEl,
    totalTutorsEl,
    totalAppointmentsEl,
    pendingAppointmentsEl,
  });

  // Load subjects
  await loadAdminSubjects(subjectsList);

  // Load availability + sessions
  await loadAdminAvailability(availabilityList);

  // Subject form submit
  if (subjectForm && newSubjectInput) {
    subjectForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = newSubjectInput.value.trim();
      if (!name) return;

      await adminAddSubject(name);
      newSubjectInput.value = "";
      await loadAdminSubjects(subjectsList);
    });
  }
}

async function loadAdminSummary(els) {
  const {
    totalUsersEl,
    totalStudentsEl,
    totalTutorsEl,
    totalAppointmentsEl,
    pendingAppointmentsEl,
  } = els;

  try {
    const res = await fetch(`${API_BASE}/admin/summary`);
    if (!res.ok) {
      console.error("Failed to load admin summary", res.status);
      return;
    }
    const data = await res.json();
    if (totalUsersEl) totalUsersEl.textContent = data.total_users ?? 0;
    if (totalStudentsEl) totalStudentsEl.textContent = data.total_students ?? 0;
    if (totalTutorsEl) totalTutorsEl.textContent = data.total_tutors ?? 0;
    if (totalAppointmentsEl) totalAppointmentsEl.textContent = data.active_appointments ?? 0;
    if (pendingAppointmentsEl) pendingAppointmentsEl.textContent = data.pending_appointments ?? 0;
  } catch (err) {
    console.error("Error loading admin summary:", err);
  }
}

async function loadAdminSubjects(listEl) {
  if (!listEl) return;
  try {
    const res = await fetch(`${API_BASE}/subjects`);
    const subjects = await res.json();

    listEl.innerHTML = "";
    if (!Array.isArray(subjects) || subjects.length === 0) {
      const li = document.createElement("li");
      li.textContent = "No subjects defined.";
      listEl.appendChild(li);
      return;
    }

    subjects.forEach((s) => {
      const li = document.createElement("li");
      li.innerHTML = `
        ${s.subject_name}
      `;

      const delBtn = document.createElement("button");
      delBtn.textContent = "Delete";
      delBtn.classList.add("decline");
      delBtn.style.marginLeft = "8px";

      delBtn.addEventListener("click", async () => {
        if (
          !confirm(
            `Delete subject "${s.subject_name}"?\nThis may affect tutors or appointments using it.`
          )
        ) {
          return;
        }
        await adminDeleteSubject(s.subject_id);
        await loadAdminSubjects(listEl);
      });

      li.appendChild(delBtn);
      listEl.appendChild(li);
    });
  } catch (err) {
    console.error("Error loading admin subjects:", err);
  }
}

async function adminAddSubject(name) {
  try {
    const res = await fetch(`${API_BASE}/subjects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject_name: name }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.message || "Failed to add subject");
    }
  } catch (err) {
    console.error("Error adding subject:", err);
    alert("Error connecting to server");
  }
}

async function adminDeleteSubject(subjectId) {
  try {
    const res = await fetch(`${API_BASE}/subjects/${subjectId}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.message || "Failed to delete subject");
    }
  } catch (err) {
    console.error("Error deleting subject:", err);
    alert("Error connecting to server");
  }
}

async function loadAdminAvailability(listEl) {
  if (!listEl) return;

  try {
    const res = await fetch(`${API_BASE}/admin/availability`);
    if (!res.ok) {
      console.error("Failed to load admin availability", res.status);
      listEl.innerHTML = "<li>Error loading availability.</li>";
      return;
    }
    const items = await res.json();
    console.log("Admin availability view:", items);

    listEl.innerHTML = "";
    if (!Array.isArray(items) || items.length === 0) {
      const li = document.createElement("li");
      li.textContent = "No availability or sessions found.";
      listEl.appendChild(li);
      return;
    }

    items.forEach((row) => {
      const li = document.createElement("li");
      const endTime = addOneHour(row.start_time);

      const statusPill = document.createElement("span");
      statusPill.classList.add("admin-pill");
      statusPill.classList.add(row.status); // available/pending/booked/unavailable
      statusPill.textContent = row.status;

      const line1 = document.createElement("div");
      line1.innerHTML = `<strong>${row.tutor_name}</strong> – ${formatDateTime(
        row.available_date,
        row.start_time
      )} - ${formatTime(endTime)}`;
      line1.appendChild(statusPill);

      const line2 = document.createElement("div");
      line2.classList.add("small-muted");

      if (row.appointment_id) {
        line2.textContent = `Appointment with ${row.student_name} – ${row.subject_name} (${row.appointment_status})`;
      } else {
        line2.textContent = `No appointment for this slot.`;
      }


      li.appendChild(line1);
      li.appendChild(line2);

      // Buttons
      const btnRow = document.createElement("div");
      btnRow.style.marginTop = "4px";

      // Delete slot (only if no active appointment)
      if (!row.appointment_id) {
        const delBtn = document.createElement("button");
        delBtn.textContent = "Delete Slot";
        delBtn.classList.add("decline");
        delBtn.addEventListener("click", async () => {
          if (!confirm("Delete this availability slot?")) return;
          await adminDeleteAvailability(row.availability_id);
          await loadAdminAvailability(listEl);
        });
        btnRow.appendChild(delBtn);
      }

      // Cancel session (only if there is a pending/accepted appointment)
      if (row.appointment_id && (row.appointment_status === "pending" || row.appointment_status === "accepted")) {
        const cancelBtn = document.createElement("button");
        cancelBtn.textContent = "Cancel Session";
        cancelBtn.classList.add("decline");
        cancelBtn.style.marginLeft = "8px";
        cancelBtn.addEventListener("click", async () => {
          if (
            !confirm(
              `Cancel this session with ${row.student_name} for ${row.subject_name}?`
            )
          )
            return;
          await adminCancelSession(row.appointment_id);
          await loadAdminAvailability(listEl);
        });
        btnRow.appendChild(cancelBtn);
      }

      if (btnRow.children.length > 0) {
        li.appendChild(btnRow);
      }

      listEl.appendChild(li);
    });
  } catch (err) {
    console.error("Error loading admin availability:", err);
    listEl.innerHTML = "<li>Error loading availability.</li>";
  }
}

async function adminDeleteAvailability(availabilityId) {
  try {
    const res = await fetch(`${API_BASE}/admin/availability/${availabilityId}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.message || "Failed to delete availability");
    }
  } catch (err) {
    console.error("Error deleting availability:", err);
    alert("Error connecting to server");
  }
}

async function adminCancelSession(appointmentId) {
  try {
    const res = await fetch(
      `${API_BASE}/admin/appointments/${appointmentId}/cancel`,
      {
        method: "POST",
      }
    );
    const data = await res.json();
    if (!res.ok) {
      alert(data.message || "Failed to cancel session");
      return;
    }
    alert(data.message || "Session cancelled");
  } catch (err) {
    console.error("Error cancelling session:", err);
    alert("Error connecting to server");
  }
}



function showSection(sectionId) {
  // Hide all dashboard sections
  document.querySelectorAll(".dashboard-section").forEach((sec) => {
    sec.style.display = "none";
  });

  // Show the one we want
  const section = document.getElementById(sectionId);
  if (section) {
    section.style.display = "block";
  }
}

// Run on dashboard.html load
document.addEventListener("DOMContentLoaded", () => {
  // Only run this on the dashboard page (where these sections exist)
  const hasDashboard =
    document.getElementById("studentDashboard") ||
    document.getElementById("tutorDashboard") ||
    document.getElementById("adminDashboard");

  // If we're on index.html or login.html (login), do nothing here
  if (!hasDashboard) {
    return;
  }

  const user = getCurrentUser();
  if (!user) {
    // No logged-in user → go to login
    window.location.href = "login.html";
    return;
  }

  if (user.role === "student") {
    showSection("studentDashboard");
    initStudentDashboard(user);
  } else if (user.role === "tutor") {
    showSection("tutorDashboard");
    initTutorDashboard(user);
  } else if (user.role === "admin") {
    showSection("adminDashboard");
    initAdminDashboard(user);
  } else {
    console.error("Unknown role:", user.role);
  }

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", logout);
  }
});
