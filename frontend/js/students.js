/* ═══════════════════════════════════════════════
   students.js — Student management page
═══════════════════════════════════════════════ */

async function renderStudents(container) {
  container.innerHTML = `
    <div class="section-header">
      <div class="section-title">
        <h2>Students</h2>
        <p>Register and manage student face profiles</p>
      </div>
      <button class="btn btn-primary" id="add-student-btn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Add Student
      </button>
    </div>
    <div class="table-card">
      <div class="table-toolbar">
        <h3>All Students</h3>
        <div class="search-wrap">
          <input class="search-input" id="student-search" placeholder="Search by name or ID…"/>
        </div>
      </div>
      <div id="students-tbody-wrap"><div class="page-loader"><div class="spinner"></div></div></div>
    </div>
  `;

  await loadStudentsTable();
  document.getElementById("add-student-btn").addEventListener("click", openAddStudentModal);
  document.getElementById("student-search").addEventListener("input", filterStudentsTable);
}

let _allStudents = [];

async function loadStudentsTable() {
  _allStudents = await apiFetch("/students");
  renderStudentRows(_allStudents);
}

function renderStudentRows(students) {
  const wrap = document.getElementById("students-tbody-wrap");
  if (!wrap) return;
  if (students.length === 0) {
    wrap.innerHTML = `<div class="table-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg><p>No students registered yet. Add one!</p></div>`;
    return;
  }
  wrap.innerHTML = `
    <table>
      <thead>
        <tr><th>Student</th><th>ID</th><th>Email</th><th>Face</th><th>Registered</th><th>Actions</th></tr>
      </thead>
      <tbody>
        ${students.map(s => `
          <tr data-id="${s.id}">
            <td><div class="cell-avatar"><div class="mini-avatar">${s.name[0].toUpperCase()}</div><strong>${s.name}</strong></div></td>
            <td><code style="color:var(--accent-2);background:rgba(56,189,248,0.08);padding:2px 8px;border-radius:4px;font-size:.8rem">${s.student_id}</code></td>
            <td>${s.email || '<span style="color:var(--text-muted)">—</span>'}</td>
            <td>${s.image_path ? '<span class="badge badge-green">✓ Enrolled</span>' : '<span class="badge badge-red">✗ Missing</span>'}</td>
            <td style="color:var(--text-secondary)">${s.created_at ? s.created_at.split("T")[0] : (s.created_at || "")}</td>
            <td>
              <button class="btn btn-danger btn-sm delete-student-btn" data-id="${s.id}" data-name="${s.name}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg>
                Delete
              </button>
            </td>
          </tr>`).join("")}
      </tbody>
    </table>`;

  document.querySelectorAll(".delete-student-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm(`Delete student "${btn.dataset.name}"? This removes all their attendance records.`)) return;
      await apiFetch(`/students/${btn.dataset.id}`, { method: "DELETE" });
      toast("Student deleted", "success");
      await loadStudentsTable();
    });
  });
}

function filterStudentsTable() {
  const q = document.getElementById("student-search").value.toLowerCase();
  renderStudentRows(_allStudents.filter(s =>
    s.name.toLowerCase().includes(q) || s.student_id.toLowerCase().includes(q)
  ));
}

// ─── Add Student Modal ───────────────────────────
let capturedImageB64 = null;
let captureStream = null;
let faceDetectInterval = null;

function openAddStudentModal() {
  capturedImageB64 = null;
  if (captureStream) { captureStream.getTracks().forEach(t => t.stop()); captureStream = null; }
  clearInterval(faceDetectInterval);

  openModal("Register New Student", `
    <div class="form-row">
      <div class="form-group">
        <label>Student ID *</label>
        <input id="m-sid" type="text" placeholder="e.g. CS-2021-001"/>
      </div>
      <div class="form-group">
        <label>Full Name *</label>
        <input id="m-name" type="text" placeholder="e.g. Ali Hassan"/>
      </div>
    </div>
    <div class="form-group">
      <label>Email <span style="color:var(--text-muted)">(optional)</span></label>
      <input id="m-email" type="email" placeholder="student@university.edu"/>
    </div>

    <div class="form-group">
      <label>Face Photo</label>
      <!-- Camera preview always visible -->
      <div class="capture-preview" id="capture-preview" style="position:relative;">
        <video id="capture-video" autoplay playsinline muted style="width:100%;height:100%;object-fit:cover;transform:scaleX(-1);display:block;"></video>
        <canvas id="capture-canvas" style="display:none;position:absolute;inset:0;width:100%;height:100%;"></canvas>
        <!-- Face status overlay -->
        <div id="face-status-overlay" style="position:absolute;bottom:10px;left:50%;transform:translateX(-50%);
          background:rgba(0,0,0,.65);color:#fff;padding:5px 14px;border-radius:20px;
          font-size:.78rem;font-weight:600;white-space:nowrap;pointer-events:none;">
          🔍 Detecting face…
        </div>
      </div>

      <!-- Action buttons below preview -->
      <div style="display:flex;gap:10px;margin-top:10px;flex-wrap:wrap;align-items:center;">
        <button class="btn btn-ghost btn-sm" id="cam-toggle-btn" type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
          Open Camera
        </button>
        <button class="btn btn-outline btn-sm hidden" id="snap-btn" type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>
          Capture
        </button>
        
        <div style="color:var(--text-muted);font-size:12px;">OR</div>
        
        <label for="upload-photo" class="btn btn-ghost btn-sm" style="margin:0;cursor:pointer;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          Upload Photo
        </label>
        <input type="file" id="upload-photo" accept="image/png, image/jpeg" style="display:none;" />
        
        <button class="btn btn-ghost btn-sm hidden" id="retake-btn" type="button">↺ Retake/Clear</button>
      </div>
      <p id="face-hint" style="margin-top:6px;font-size:.78rem;color:var(--text-secondary);">Open camera and position your face — auto-detects when ready.</p>
    </div>

    <div id="modal-error" class="error-msg hidden"></div>
    <button class="btn btn-primary btn-full" id="save-student-btn" type="button">Save Student</button>
  `);

  document.getElementById("cam-toggle-btn").addEventListener("click", startLiveCamera);
  document.getElementById("snap-btn").addEventListener("click", snapPhoto);
  document.getElementById("retake-btn").addEventListener("click", retakePhoto);
  document.getElementById("upload-photo").addEventListener("change", handlePhotoUpload);
  document.getElementById("save-student-btn").addEventListener("click", saveStudent);

  // Close modal hook to stop stream
  const origClose = window._modalCloseHook;
  window._modalCloseHook = () => {
    stopCaptureCamera();
    if (origClose) origClose();
  };
}

async function startLiveCamera() {
  try {
    captureStream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
  } catch {
    toast("Camera access denied — please allow camera in browser settings", "error");
    return;
  }
  capturedImageB64 = null;
  const video = document.getElementById("capture-video");
  video.srcObject = captureStream;
  video.style.display = "block";

  const canvas = document.getElementById("capture-canvas");
  canvas.style.display = "none";

  document.getElementById("cam-toggle-btn").classList.add("hidden");
  document.getElementById("snap-btn").classList.remove("hidden");
  document.getElementById("retake-btn").classList.add("hidden");
  document.getElementById("face-hint").textContent = "Face the camera — click Capture Photo when ready.";

  setFaceStatus("🎥 Camera active", "#818cf8");
}

function snapPhoto() {
  const video = document.getElementById("capture-video");
  if (!video || video.readyState < 2) { toast("Camera not ready yet", "error"); return; }

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  const ctx = canvas.getContext("2d");
  // Do not mirror the backend data so it perfectly matches the live attendance feed.
  // The CSS purely handles the frontend mirror display.
  ctx.drawImage(video, 0, 0);

  capturedImageB64 = canvas.toDataURL("image/jpeg", 0.92);

  // Show frozen preview
  const previewCanvas = document.getElementById("capture-canvas");
  previewCanvas.width = canvas.width;
  previewCanvas.height = canvas.height;
  previewCanvas.getContext("2d").drawImage(canvas, 0, 0);
  previewCanvas.style.display = "block";
  video.style.display = "none";

  stopCaptureCamera();

  document.getElementById("snap-btn").classList.add("hidden");
  document.getElementById("retake-btn").classList.remove("hidden");
  setFaceStatus("📸 Photo captured — save when ready", "#34d399");
  document.getElementById("face-hint").textContent = "Photo captured! Fill in the details and click Save Student.";
}

function handlePhotoUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (evt) {
    stopCaptureCamera();

    const previewCanvas = document.getElementById("capture-canvas");
    const video = document.getElementById("capture-video");
    video.style.display = "none";

    const img = new Image();
    img.onload = () => {
      // Calculate scaling to prevent multi-megabyte payloads
      const MAX_WIDTH = 800;
      let width = img.width;
      let height = img.height;
      if (width > MAX_WIDTH) {
        height = Math.round((height * MAX_WIDTH) / width);
        width = MAX_WIDTH;
      }

      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = width;
      tempCanvas.height = height;
      tempCanvas.getContext("2d").drawImage(img, 0, 0, width, height);
      capturedImageB64 = tempCanvas.toDataURL("image/jpeg", 0.85);

      previewCanvas.width = width;
      previewCanvas.height = height;
      const ctx = previewCanvas.getContext("2d");
      ctx.drawImage(tempCanvas, 0, 0);
      previewCanvas.style.display = "block";
    };
    img.src = evt.target.result;

    document.getElementById("cam-toggle-btn").classList.add("hidden");
    document.getElementById("snap-btn").classList.add("hidden");
    document.getElementById("retake-btn").classList.remove("hidden");

    setFaceStatus("📸 Photo uploaded — save when ready", "#34d399");
    document.getElementById("face-hint").textContent = "Photo uploaded! Fill in the details and click Save Student.";
  };
  reader.readAsDataURL(file);
}

function retakePhoto() {
  capturedImageB64 = null;
  const fileInput = document.getElementById("upload-photo");
  if (fileInput) fileInput.value = "";
  // Reset to camera-off state
  document.getElementById("capture-canvas").style.display = "none";
  document.getElementById("capture-video").style.display = "block";
  document.getElementById("retake-btn").classList.add("hidden");
  document.getElementById("cam-toggle-btn").classList.remove("hidden");
  document.getElementById("snap-btn").classList.add("hidden");
  setFaceStatus("🔍 Open camera to try again", "#94a3b8");
  document.getElementById("face-hint").textContent = "Click Open Camera to try again.";
}

function stopCaptureCamera() {
  clearInterval(faceDetectInterval);
  if (captureStream) {
    captureStream.getTracks().forEach(t => t.stop());
    captureStream = null;
  }
}

function setFaceStatus(text, color = "#94a3b8") {
  const el = document.getElementById("face-status-overlay");
  if (el) { el.textContent = text; el.style.color = color; }
}

async function saveStudent() {
  const sid = document.getElementById("m-sid").value.trim();
  const name = document.getElementById("m-name").value.trim();
  const email = document.getElementById("m-email").value.trim();
  const errEl = document.getElementById("modal-error");
  errEl.classList.add("hidden");

  if (!sid || !name) {
    errEl.textContent = "Student ID and Name are required.";
    errEl.classList.remove("hidden");
    return;
  }
  if (!capturedImageB64) {
    errEl.textContent = "Please open the camera and capture a face photo first.";
    errEl.classList.remove("hidden");
    return;
  }

  const btn = document.getElementById("save-student-btn");
  btn.disabled = true;
  btn.textContent = "Processing face…";

  const res = await apiFetch("/students", {
    method: "POST",
    body: JSON.stringify({ student_id: sid, name, email, image_b64: capturedImageB64 }),
  });

  btn.disabled = false;
  btn.textContent = "Save Student";

  if (res.success) {
    stopCaptureCamera();
    closeModal();
    toast(`${name} registered successfully!`, "success");
    await loadStudentsTable();
  } else {
    errEl.textContent = res.message || "Failed to save student.";
    errEl.classList.remove("hidden");
  }
}
