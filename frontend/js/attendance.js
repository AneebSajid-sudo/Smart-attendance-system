/* ═══════════════════════════════════════════════
   attendance.js — Live face recognition attendance
═══════════════════════════════════════════════ */

let attendanceStream = null;
let isRecognizing = false;
let isProcessingFrame = false;
let currentCourseId = null;
let markedToday = new Set();

async function renderAttendance(container) {
  const courses = await apiFetch("/courses");

  container.innerHTML = `
    <div class="section-header">
      <div class="section-title">
        <h2>Take Attendance</h2>
        <p>Select a course and start the camera to automatically mark attendance</p>
      </div>
    </div>
    <div class="attendance-layout">
      <!-- Left: Webcam -->
      <div class="webcam-card">
        <div class="webcam-toolbar">
          <h3>Live Camera</h3>
          <div class="indicator" id="live-indicator">
            <div class="indicator-dot" id="indicator-dot"></div>
            <span id="indicator-text">Offline</span>
          </div>
        </div>
        <div class="webcam-body">
          <div class="course-select-wrap">
            <div class="form-group">
              <label>Select Course *</label>
              <select id="att-course-select">
                <option value="">— Choose a course —</option>
                ${courses.map(c => `<option value="${c.id}">[${c.code}] ${c.name} (${c.class_name})</option>`).join("")}
              </select>
            </div>
          </div>

          <div class="video-container" id="video-container">
            <div class="video-overlay" id="video-overlay">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
              <span>Start camera to begin recognition</span>
            </div>
            <video id="att-video" autoplay playsinline muted style="display:none; width:100%; height:100%; object-fit:cover;"></video>
            <canvas id="att-canvas" style="display:none;position:absolute;inset:0;width:100%;height:100%;pointer-events:none;"></canvas>
          </div>

          <div class="webcam-controls">
            <button class="btn btn-primary" id="start-att-btn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              Start Recognition
            </button>
            <button class="btn btn-danger hidden" id="stop-att-btn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>
              Stop
            </button>
            <button class="btn btn-ghost" id="manual-mark-btn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Manual Mark
            </button>
          </div>

          <div id="att-status-msg" style="margin-top:12px;font-size:.82rem;color:var(--text-secondary)"></div>
        </div>
      </div>

      <!-- Right: Recognition Log -->
      <div class="recognition-log">
        <div class="recognition-log-header">
          <h3>Marked Present</h3>
          <span class="log-count" id="log-count">0</span>
        </div>
        <div class="log-list" id="log-list">
          <div class="log-empty">Recognition log will appear here once you start the camera.</div>
        </div>
      </div>
    </div>
  `;

  document.getElementById("start-att-btn").addEventListener("click", startAttendance);
  document.getElementById("stop-att-btn").addEventListener("click", stopAttendance);
  document.getElementById("manual-mark-btn").addEventListener("click", openManualMark);
}

async function startAttendance() {
  currentCourseId = document.getElementById("att-course-select").value;
  if (!currentCourseId) { toast("Please select a course first", "error"); return; }
  markedToday.clear();
  updateLogCount();

  try {
    attendanceStream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
  } catch {
    toast("Camera access denied — please allow camera permissions", "error");
    return;
  }

  const video = document.getElementById("att-video");
  video.srcObject = attendanceStream;
  video.style.display = "block";
  document.getElementById("video-overlay").style.display = "none";
  document.getElementById("video-container").classList.add("active-border");

  document.getElementById("start-att-btn").classList.add("hidden");
  document.getElementById("stop-att-btn").classList.remove("hidden");

  // Live indicator
  document.getElementById("indicator-dot").classList.add("live");
  document.getElementById("indicator-text").textContent = "Live";

  isRecognizing = true;
  setStatus("🎥 Camera active — scanning for faces…");

  // Start pipelined recognition loop
  recognitionLoop();
}

async function recognitionLoop() {
  if (!isRecognizing) return;
  await sendFrameForRecognition();
  if (isRecognizing) setTimeout(recognitionLoop, 1000);
}

function stopAttendance() {
  isRecognizing = false;

  if (attendanceStream) attendanceStream.getTracks().forEach(t => t.stop());
  attendanceStream = null;

  const video = document.getElementById("att-video");
  const canvas = document.getElementById("att-canvas");
  video.style.display = "none";
  canvas.style.display = "none";

  document.getElementById("video-overlay").style.display = "flex";
  document.getElementById("video-container").classList.remove("active-border");

  document.getElementById("stop-att-btn").classList.add("hidden");
  document.getElementById("start-att-btn").classList.remove("hidden");
  document.getElementById("indicator-dot").classList.remove("live");
  document.getElementById("indicator-text").textContent = "Offline";
  setStatus(`Session ended. ${markedToday.size} student(s) marked present.`);
}

async function sendFrameForRecognition() {
  if (!isRecognizing || isProcessingFrame) return;
  const video = document.getElementById("att-video");
  if (!video || video.readyState < 2) return;

  isProcessingFrame = true;

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0);
  const b64 = canvas.toDataURL("image/jpeg", 0.6); // Lowered quality for much faster upload

  const res = await apiFetch("/attendance/recognize", {
    method: "POST",
    body: JSON.stringify({ image_b64: b64, course_id: currentCourseId }),
  }).catch(() => null);

  isProcessingFrame = false;
  if (!res || !res.success || !isRecognizing) return;

  // Draw overlay tracking boxes
  const overlay = document.getElementById("att-canvas");
  overlay.style.display = "block";
  overlay.width = overlay.clientWidth;
  overlay.height = overlay.clientHeight;
  const oCtx = overlay.getContext("2d");
  oCtx.clearRect(0, 0, overlay.width, overlay.height);

  const scaleX = overlay.width / canvas.width;
  const scaleY = overlay.height / canvas.height;

  if (res.faces) {
    res.faces.forEach(f => {
      const [top, right, bottom, left] = f.box;
      const x = left * scaleX;
      const y = top * scaleY;
      const w = (right - left) * scaleX;
      const h = (bottom - top) * scaleY;

      const color = f.matched ? "#00e676" : "#ff3b30";
      oCtx.strokeStyle = color;
      oCtx.lineWidth = 3;
      oCtx.strokeRect(x, y, w, h);

      oCtx.fillStyle = color;
      oCtx.fillRect(x, Math.max(0, y - 24), w, 24);

      oCtx.fillStyle = "#ffffff";
      oCtx.font = "bold 13px sans-serif";
      oCtx.fillText(f.name, x + 4, Math.max(16, y - 6));
    });
  }

  // Add newly marked students to log
  if (res.marked && res.marked.length > 0) {
    res.marked.forEach(s => {
      if (!markedToday.has(s.id)) {
        markedToday.add(s.id);
        addToLog(s);
      }
    });
    updateLogCount();
  }

  const count = (res.faces || []).length;
  setStatus(count > 0 ? `👁 Detected ${count} face(s)` : "👁 No recognized faces in frame");
}

function addToLog(student) {
  const logList = document.getElementById("log-list");
  const emptyMsg = logList.querySelector(".log-empty");
  if (emptyMsg) emptyMsg.remove();

  const now = new Date().toLocaleTimeString();
  const item = document.createElement("div");
  item.className = "log-item";
  item.innerHTML = `
    <div class="log-item-avatar">${student.name[0].toUpperCase()}</div>
    <div class="log-item-info">
      <strong>${student.name}</strong>
      <small>${student.student_id} &middot; ${now}</small>
    </div>
    <div class="log-item-check">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
    </div>`;
  logList.prepend(item);
  toast(`✓ ${student.name} marked present`, "success");
}

function updateLogCount() {
  const el = document.getElementById("log-count");
  if (el) el.textContent = markedToday.size;
}

function setStatus(msg) {
  const el = document.getElementById("att-status-msg");
  if (el) el.textContent = msg;
}

// ─── Manual Mark Modal ───────────────────────────
async function openManualMark() {
  const [students, courses] = await Promise.all([apiFetch("/students"), apiFetch("/courses")]);
  openModal("Manual Attendance Mark", `
    <div class="form-group">
      <label>Student *</label>
      <select id="mm-student">
        <option value="">— Select student —</option>
        ${students.map(s => `<option value="${s.id}">${s.name} (${s.student_id})</option>`).join("")}
      </select>
    </div>
    <div class="form-group">
      <label>Course *</label>
      <select id="mm-course">
        <option value="">— Select course —</option>
        ${courses.map(c => `<option value="${c.id}">[${c.code}] ${c.name} (${c.class_name})</option>`).join("")}
      </select>
    </div>
    <div id="mm-error" class="error-msg hidden"></div>
    <button class="btn btn-primary btn-full" id="mm-save-btn">Mark Present</button>
  `);
  document.getElementById("mm-save-btn").addEventListener("click", async () => {
    const sid = document.getElementById("mm-student").value;
    const cid = document.getElementById("mm-course").value;
    const errEl = document.getElementById("mm-error");
    if (!sid || !cid) { errEl.textContent = "Please select both student and course."; errEl.classList.remove("hidden"); return; }
    const res = await apiFetch("/attendance/mark-manual", {
      method: "POST",
      body: JSON.stringify({ student_id: parseInt(sid), course_id: parseInt(cid) }),
    });
    if (res.success) {
      closeModal();
      toast("Attendance marked manually!", "success");
    } else {
      errEl.textContent = res.message || "Failed.";
      errEl.classList.remove("hidden");
    }
  });
}
