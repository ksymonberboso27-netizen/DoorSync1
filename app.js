const STORAGE_KEY = "doorsync-state-v1";
const SESSION_KEY = "doorsync-session-v1";

let state = normalizeState(loadState());
let session = loadSession();
let activeRole = session ? session.role : "student";
let selectedStudentId = session?.role === "student" ? session.userId : "STU-002";
let selectedProfessorId = session?.role === "professor" ? session.userId : "PROF-001";
let selectedPersonnelId = session?.role === "personnel" ? session.userId : "PERS-001";
let selectedRoomId = null;

const views = {
  student: document.querySelector("#studentView"),
  professor: document.querySelector("#professorView"),
  personnel: document.querySelector("#personnelView"),
};

const titles = {
  student: ["Student view", "Classroom status"],
  professor: ["Professor view", "Availability and unlock requests"],
  personnel: ["Personnel view", "Request queue"],
};

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    return structuredClone(DOORSYNC_SEED);
  }

  try {
    return JSON.parse(saved);
  } catch {
    return structuredClone(DOORSYNC_SEED);
  }
}

function normalizeState(nextState) {
  if (!Array.isArray(nextState.classSchedules)) {
    nextState.classSchedules = structuredClone(DOORSYNC_SEED.classSchedules);
  }
  const seededByEmail = new Map(
    ["students", "professors", "personnel"].flatMap((key) =>
      DOORSYNC_SEED[key].map((item) => [item.Email.toLowerCase(), item]),
    ),
  );

  ["students", "professors", "personnel"].forEach((key) => {
    nextState[key] = nextState[key].map((item) => ({
      ...item,
      Password:
        item.Password ||
        seededByEmail.get(item.Email.toLowerCase())?.Password ||
        "doorsync123",
    }));
  });

  return nextState;
}

function loadSession() {
  const saved = localStorage.getItem(SESSION_KEY);
  if (!saved) return null;

  try {
    return JSON.parse(saved);
  } catch {
    return null;
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function saveSession() {
  if (session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } else {
    localStorage.removeItem(SESSION_KEY);
  }
}

function byId(collection, key, id) {
  return collection.find((item) => item[key] === id);
}

function formatTime(value) {
  if (!value) return "Not yet";
  return new Intl.DateTimeFormat("en-PH", {
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function minutesAgo(value) {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.round(diff / 60000));
  if (minutes < 1) return "just now";
  if (minutes === 1) return "1 min ago";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours === 1 ? "1 hr ago" : `${hours} hrs ago`;
}

function makeBadge(status) {
  const className = status.toLowerCase();
  return `<span class="badge ${className}">${status}</span>`;
}

function notify(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(notify.timer);
  notify.timer = window.setTimeout(() => toast.classList.remove("visible"), 2800);
}

function addActivity(type, message) {
  state.activity.unshift({
    id: `ACT-${String(state.activity.length + 1).padStart(3, "0")}`,
    type,
    message,
    timestamp: new Date().toISOString(),
  });
}

function roleCollection(role) {
  if (role === "student") {
    return {
      items: state.students,
      idKey: "StudentID",
      subtitle: (student) => `${student.Course} · ${student.YearLevel}`,
    };
  }

  if (role === "professor") {
    return {
      items: state.professors,
      idKey: "ProfessorID",
      subtitle: (professor) => professor.Department,
    };
  }

  return {
    items: state.personnel,
    idKey: "PersonnelID",
    subtitle: (personnel) => personnel.AssignedBuilding,
  };
}

function findUserByCredentials(email, password) {
  const normalizedEmail = email.trim().toLowerCase();
  const roles = ["student", "professor", "personnel"];

  for (const role of roles) {
    const collection = roleCollection(role);
    const user = collection.items.find(
      (item) =>
        item.Email.toLowerCase() === normalizedEmail && item.Password === password,
    );

    if (user) {
      return {
        role,
        userId: user[collection.idKey],
      };
    }
  }

  return null;
}

function currentUser() {
  if (!session) return null;
  const collection = roleCollection(session.role);
  return byId(collection.items, collection.idKey, session.userId);
}

function currentUserName() {
  return currentUser()?.FullName || "Demo user";
}

function applySession() {
  const hasSession = Boolean(session);
  document.querySelector("#loginScreen").classList.toggle("hidden", hasSession);
  document.querySelector("#appShell").classList.toggle("hidden", !hasSession);

  if (!hasSession) {
    document.querySelector("#loginEmail").focus();
    return;
  }

  activeRole = session.role;
  if (session.role === "student") selectedStudentId = session.userId;
  if (session.role === "professor") selectedProfessorId = session.userId;
  if (session.role === "personnel") selectedPersonnelId = session.userId;

  setRole(session.role);
}

function renderShell() {
  document.querySelector("#pendingRequestSummary").classList.toggle("hidden", activeRole === "student");
  document.querySelector("#lockedRoomCount").textContent = state.rooms.filter(
    (room) => room.CurrentStatus === "Locked",
  ).length;
  document.querySelector("#pendingRequestCount").textContent = state.unlockRequests.filter(
    (request) => request.Status === "Pending",
  ).length;
  document.querySelector("#availableProfessorCount").textContent = state.professors.filter(
    (professor) => professor.CurrentStatus === "Available",
  ).length;

  document.querySelector("#roleEyebrow").textContent = titles[activeRole][0];
  document.querySelector("#pageTitle").textContent = titles[activeRole][1];
  document.querySelector("#signedInUser").innerHTML = `
    <strong>${currentUserName()}</strong>
    <span>${activeRole.charAt(0).toUpperCase() + activeRole.slice(1)}</span>
  `;

  const now = new Date();
  document.querySelector("#todayLabel").textContent = new Intl.DateTimeFormat("en-PH", {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(now);
  document.querySelector("#timeLabel").textContent = new Intl.DateTimeFormat("en-PH", {
    hour: "numeric",
    minute: "2-digit",
  }).format(now);
}

function renderStudent() {
  const rooms = [...state.rooms].sort((a, b) => {
    if (a.CurrentStatus === b.CurrentStatus) {
      return a.RoomName.localeCompare(b.RoomName);
    }

    return a.CurrentStatus === "Locked" ? -1 : 1;
  });

  document.querySelector("#studentRooms").innerHTML =
    rooms.length === 0
      ? `<div class="empty-state">No classroom records yet.</div>`
      : rooms
          .map(
            (room) => `
        <article class="room-status-card">
          <div class="card-topline">
            <h4>${room.RoomName}</h4>
            ${makeBadge(room.CurrentStatus)}
          </div>
          <p class="room-building">${room.Building}</p>
          <div class="card-meta">
            <span>Updated ${formatTime(room.StatusUpdatedAt)}</span>
          </div>
        </article>
      `,
          )
          .join("");

  const professors = [...state.professors].sort((a, b) => {
    if (a.CurrentStatus === b.CurrentStatus) {
      return a.FullName.localeCompare(b.FullName);
    }

    return a.CurrentStatus === "Available" ? -1 : 1;
  });

  document.querySelector("#studentProfessors").innerHTML =
    professors.length === 0
      ? `<div class="empty-state">No professor records yet.</div>`
      : professors
          .map(
            (professor) => `
        <article class="card professor-card">
          <div class="card-topline">
            <h4>${professor.FullName}</h4>
            ${makeBadge(professor.CurrentStatus)}
          </div>
          <p class="professor-department">${professor.Department}</p>
          <p class="professor-email">${professor.Email}</p>
          <div class="card-meta">
            <span>Updated ${formatTime(professor.StatusUpdatedAt)}</span>
          </div>
        </article>
      `,
          )
          .join("");
}

function fillSelects() {
  const professorSelect = document.querySelector("#professorSelect");
  const activeProfessor = selectedProfessorId;
  const availableProfessors =
    session?.role === "professor"
      ? state.professors.filter((professor) => professor.ProfessorID === selectedProfessorId)
      : state.professors;
  professorSelect.innerHTML = availableProfessors
    .map(
      (professor) =>
        `<option value="${professor.ProfessorID}">${professor.FullName}</option>`,
    )
    .join("");
  professorSelect.value = activeProfessor;
  professorSelect.disabled = session?.role === "professor";

}

function renderSchedule() {
  const now = new Date();
  const lessons = DoorSyncSchedule.occurrences(state.classSchedules, selectedProfessorId, now);
  const upcoming = lessons.filter((lesson) => lesson.start > now);
  const select = document.querySelector("#roomSelect");
  const previous = select.value;
  const eligible = upcoming.find((lesson) => DoorSyncSchedule.eligibility(lesson, state.rooms, state.unlockRequests, now).allowed);
  const options = upcoming.length ? upcoming.map((lesson) => {
    const room = byId(state.rooms, "RoomID", lesson.RoomID);
    return `<option value="${lesson.key}">${DoorSyncSchedule.day(lesson.start)}, ${DoorSyncSchedule.clock(lesson.start)} - ${room?.RoomName || lesson.RoomID} - ${lesson.Subject}</option>`;
  }).join("") : '<option value="">No upcoming classes</option>';
  if (select.dataset.options !== options) {
    select.innerHTML = options;
    select.dataset.options = options;
  }
  select.value = upcoming.some((lesson) => lesson.key === previous) ? previous : (eligible || upcoming[0])?.key || "";
  select.disabled = !upcoming.length;
  const selected = upcoming.find((lesson) => lesson.key === select.value);
  const access = DoorSyncSchedule.eligibility(selected, state.rooms, state.unlockRequests, now);
  document.querySelector("#notifyPersonnel").disabled = session?.role !== "professor" || !access.allowed;
  document.querySelector("#requestWindowStatus").textContent = selected
    ? `${access.reason}. Request window: ${DoorSyncSchedule.day(selected.start)}, ${DoorSyncSchedule.clock(selected.opens)} to ${DoorSyncSchedule.clock(selected.start)} (class start).`
    : "No scheduled classes in the next seven days.";

  document.querySelector("#professorSchedule").innerHTML = lessons.length ? lessons.map((lesson) => {
    const room = byId(state.rooms, "RoomID", lesson.RoomID);
    const access = DoorSyncSchedule.eligibility(lesson, state.rooms, state.unlockRequests, now);
    const label = now >= lesson.end ? "Finished" : now >= lesson.start ? "In class" : now < lesson.opens ? "Upcoming" : access.reason;
    return `<article class="schedule-item${access.allowed ? " schedule-open" : ""}">
      <div><strong>${DoorSyncSchedule.day(lesson.start)}</strong><p>${DoorSyncSchedule.clock(lesson.start)} - ${DoorSyncSchedule.clock(lesson.end)}</p></div>
      <div><h4>${lesson.Subject}</h4><p>${room?.RoomName || lesson.RoomID} · ${room?.Building || ""}</p></div>
      <div><span class="badge ${access.allowed ? "available" : "schedule-label"}">${label}</span><p>Requests ${DoorSyncSchedule.clock(lesson.opens)} - ${DoorSyncSchedule.clock(lesson.start)}</p></div>
    </article>`;
  }).join("") : '<div class="empty-state">No classes scheduled.</div>';
}

function renderProfessor() {
  fillSelects();
  renderSchedule();
  const professor = byId(
    state.professors,
    "ProfessorID",
    document.querySelector("#professorSelect").value,
  );

  document.querySelector("#setAvailable").setAttribute("aria-pressed", professor.CurrentStatus === "Available");
  document.querySelector("#setOccupied").setAttribute("aria-pressed", professor.CurrentStatus === "Occupied");
  document.querySelector("#selectedProfessorStatus").innerHTML = `
    ${makeBadge(professor.CurrentStatus)}
    <span>Updated ${formatTime(professor.StatusUpdatedAt)}</span>
  `;

  document.querySelector("#professorActivity").innerHTML = state.activity
    .slice(0, 8)
    .map(
      (item) => `
        <article class="timeline-item">
          <span class="timeline-dot"></span>
          <div>
            <strong>${item.message}</strong>
            <p>${formatTime(item.timestamp)}</p>
          </div>
        </article>
      `,
    )
    .join("");
}

function renderPersonnel() {
  const pending = state.unlockRequests.filter((request) => request.Status === "Pending");
  document.querySelector("#pendingRequests").innerHTML =
    pending.length === 0
      ? `<div class="empty-state">No pending requests.</div>`
      : pending.map(renderRequestCard).join("");

  renderUnlockedRooms();

  const completed = state.unlockRequests
    .filter((request) => request.Status === "Completed")
    .sort((a, b) => new Date(b.CompletedAt) - new Date(a.CompletedAt));
  document.querySelector("#completedRequests").innerHTML = completed
    .map(renderCompletedCard)
    .join("");

  renderRoomDetail();
}

function renderUnlockedRooms() {
  const unlockedRooms = state.rooms.filter((room) => room.CurrentStatus === "Unlocked");
  document.querySelector("#unlockedRooms").innerHTML =
    unlockedRooms.length === 0
      ? `<div class="empty-state">No unlocked rooms right now.</div>`
      : unlockedRooms.map(renderUnlockedRoomCard).join("");
}

function renderUnlockedRoomCard(room) {
  return `
    <article class="request-card">
      <div>
        <div class="card-topline">
          ${makeBadge(room.CurrentStatus)}
          <span>Updated ${formatTime(room.StatusUpdatedAt)}</span>
        </div>
        <h4>${room.RoomName}</h4>
        <p>${room.Building}</p>
      </div>
      <div class="request-actions">
        <button class="status-action warning" type="button" data-lock-room="${room.RoomID}">Mark locked</button>
      </div>
    </article>
  `;
}

function renderRequestCard(request) {
  const room = byId(state.rooms, "RoomID", request.RoomID);
  const professor = byId(state.professors, "ProfessorID", request.ProfessorID);
  const personnel = byId(state.personnel, "PersonnelID", request.PersonnelID);
  const assignmentText = personnel
    ? `Routed to ${personnel.FullName}`
    : "Visible in the shared personnel queue";
  return `
    <article class="request-card">
      <div>
        <div class="card-topline">
          ${makeBadge(room.CurrentStatus)}
          <span>Flagged ${minutesAgo(request.FlaggedAt)}</span>
        </div>
        <h4>${room.RoomName}</h4>
        <p>${room.Building} · flagged by ${professor.FullName}</p>
        <p>${assignmentText}</p>
      </div>
      <div class="request-actions">
        <button class="ghost-button" type="button" data-view-room="${room.RoomID}">View room</button>
        <button class="primary-button" type="button" data-resolve="${request.RequestID}">Mark unlocked</button>
      </div>
    </article>
  `;
}

function renderCompletedCard(request) {
  const room = byId(state.rooms, "RoomID", request.RoomID);
  const professor = byId(state.professors, "ProfessorID", request.ProfessorID);
  return `
    <article class="request-card muted">
      <div>
        <div class="card-topline">
          ${makeBadge("Completed")}
          <span>${formatTime(request.CompletedAt)}</span>
        </div>
        <h4>${room.RoomName}</h4>
        <p>Requested by ${professor.FullName}</p>
      </div>
    </article>
  `;
}

function renderRoomDetail() {
  const detail = document.querySelector("#roomDetail");
  if (!selectedRoomId) {
    detail.className = "room-detail empty-state";
    detail.textContent = "No room selected.";
    return;
  }

  const room = byId(state.rooms, "RoomID", selectedRoomId);
  const subscribers = state.roomSubscriptions
    .filter((subscription) => subscription.RoomID === selectedRoomId)
    .map((subscription) => byId(state.students, "StudentID", subscription.StudentID).FullName);

  detail.className = "room-detail";
  detail.innerHTML = `
    <div class="detail-line">
      <span>Room</span>
      <strong>${room.RoomName}</strong>
    </div>
    <div class="detail-line">
      <span>Building</span>
      <strong>${room.Building}</strong>
    </div>
    <div class="detail-line">
      <span>Status</span>
      ${makeBadge(room.CurrentStatus)}
    </div>
    <div class="detail-line">
      <span>Subscribers</span>
      <strong>${subscribers.length ? subscribers.join(", ") : "None"}</strong>
    </div>
  `;
}

function setRole(role) {
  if (session && role !== session.role) return;
  activeRole = role;
  Object.entries(views).forEach(([key, element]) => {
    element.classList.toggle("active", key === role);
  });
  document.querySelectorAll(".role-tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.role === role);
    button.classList.toggle("hidden", Boolean(session) && button.dataset.role !== role);
  });
  render();
}

function setProfessorStatus(status) {
  const id = selectedProfessorId;
  const professor = byId(state.professors, "ProfessorID", id);
  professor.CurrentStatus = status;
  professor.StatusUpdatedAt = new Date().toISOString();
  addActivity("professor", `${professor.FullName} set status to ${status}.`);
  saveState();
  render();
  notify(`Status updated to ${status}.`);
}

function createUnlockRequest() {
  if (session?.role !== "professor") return;
  const now = new Date();
  const lesson = DoorSyncSchedule.occurrences(state.classSchedules, session.userId, now)
    .find((item) => item.key === document.querySelector("#roomSelect").value);
  const access = DoorSyncSchedule.eligibility(lesson, state.rooms, state.unlockRequests, now);
  if (!access.allowed) {
    renderSchedule();
    notify(access.reason);
    return;
  }
  const professor = byId(
    state.professors,
    "ProfessorID",
    selectedProfessorId,
  );
  const room = byId(state.rooms, "RoomID", lesson.RoomID);
  const existingRequest = state.unlockRequests.find(
    (request) => request.RoomID === room.RoomID && request.Status === "Pending",
  );

  if (existingRequest) {
    notify(`${room.RoomName} already has a pending unlock request.`);
    return;
  }

  const personnel = state.personnel.find((person) => person.AssignedBuilding === room.Building);
  const nextNumber = state.unlockRequests.length + 1;
  const request = {
    RequestID: `REQ-${String(nextNumber).padStart(3, "0")}`,
    RoomID: room.RoomID,
    ProfessorID: professor.ProfessorID,
    ScheduleID: lesson.ScheduleID,
    ClassDate: lesson.date,
    PersonnelID: personnel ? personnel.PersonnelID : "",
    FlaggedAt: new Date().toISOString(),
    CompletedAt: null,
    Status: "Pending",
  };

  room.CurrentStatus = "Locked";
  room.StatusUpdatedAt = request.FlaggedAt;
  state.unlockRequests.unshift(request);
  addActivity("request", `${room.RoomName} was flagged by ${professor.FullName}.`);
  saveState();
  render();
  notify("Request sent to personnel and is awaiting unlock.");
}

function resolveRequest(requestId) {
  const request = byId(state.unlockRequests, "RequestID", requestId);
  const room = byId(state.rooms, "RoomID", request.RoomID);
  const resolverId = session?.role === "personnel" ? selectedPersonnelId : request.PersonnelID;
  const personnel = byId(state.personnel, "PersonnelID", resolverId);
  request.PersonnelID = resolverId;
  request.Status = "Completed";
  request.CompletedAt = new Date().toISOString();
  room.CurrentStatus = "Unlocked";
  room.StatusUpdatedAt = request.CompletedAt;
  addActivity("room", `${room.RoomName} was marked unlocked by ${personnel?.FullName || currentUserName()}.`);
  saveState();
  render();
  notify(`${room.RoomName} marked unlocked.`);
}

function lockRoom(roomId) {
  const room = byId(state.rooms, "RoomID", roomId);
  room.CurrentStatus = "Locked";
  room.StatusUpdatedAt = new Date().toISOString();
  addActivity("room", `${room.RoomName} was marked locked by ${currentUserName()}.`);
  saveState();
  render();
  notify(`${room.RoomName} marked locked.`);
}

function render() {
  renderShell();
  renderStudent();
  renderProfessor();
  renderPersonnel();
}

document.querySelectorAll(".role-tab").forEach((button) => {
  button.addEventListener("click", () => setRole(button.dataset.role));
});

document.querySelector("#loginForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const loginError = document.querySelector("#loginError");
  const email = document.querySelector("#loginEmail").value;
  const password = document.querySelector("#loginPassword").value;
  const matchedSession = findUserByCredentials(email, password);

  if (!matchedSession) {
    loginError.textContent = "Email or password does not match a DoorSync account.";
    return;
  }

  loginError.textContent = "";
  session = matchedSession;
  saveSession();
  applySession();
  notify(`Signed in as ${currentUserName()}.`);
});

document.querySelector("#professorSelect").addEventListener("change", () => {
  selectedProfessorId = document.querySelector("#professorSelect").value;
  renderProfessor();
});
document.querySelector("#setAvailable").addEventListener("click", () => setProfessorStatus("Available"));
document.querySelector("#setOccupied").addEventListener("click", () => setProfessorStatus("Occupied"));
document.querySelector("#notifyPersonnel").addEventListener("click", createUnlockRequest);
document.querySelector("#roomSelect").addEventListener("change", renderSchedule);

document.querySelector("#personnelView").addEventListener("click", (event) => {
  const roomButton = event.target.closest("[data-view-room]");
  if (roomButton) {
    selectedRoomId = roomButton.dataset.viewRoom;
    renderRoomDetail();
  }

  const resolveButton = event.target.closest("[data-resolve]");
  if (resolveButton) {
    resolveRequest(resolveButton.dataset.resolve);
  }

  const lockButton = event.target.closest("[data-lock-room]");
  if (lockButton) {
    lockRoom(lockButton.dataset.lockRoom);
  }
});

document.querySelector("#resetData").addEventListener("click", () => {
  state = normalizeState(structuredClone(DOORSYNC_SEED));
  selectedRoomId = null;
  saveState();
  render();
  notify("Demo data reset.");
});

document.querySelector("#logoutButton").addEventListener("click", () => {
  session = null;
  saveSession();
  document.querySelector("#loginForm").reset();
  document.querySelector("#loginError").textContent = "";
  document.querySelector("#toast").classList.remove("visible");
  applySession();
});

applySession();
setInterval(renderShell, 30000);
setInterval(() => {
  if (session?.role === "professor") renderSchedule();
}, 1000);
