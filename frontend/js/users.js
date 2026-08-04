/* ═══════════════════════════════════════════════
   users.js — User Management (admin only)
═══════════════════════════════════════════════ */

async function renderUsers(container) {
  // Guard: only admin should reach this page, but double-check
  if (!currentUser || currentUser.role !== "admin") {
    container.innerHTML = `<div class="table-empty"><p>Access denied.</p></div>`;
    return;
  }

  container.innerHTML = `
    <div class="section-header">
      <div class="section-title">
        <h2>User Management</h2>
        <p>Manage teacher accounts and assign courses to them</p>
      </div>
      <button class="btn btn-primary" id="add-teacher-btn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Add Teacher
      </button>
    </div>
    <div class="table-card">
      <div class="table-toolbar">
        <h3>Teacher Accounts</h3>
        <span id="teacher-count" style="color:var(--text-muted);font-size:.82rem"></span>
      </div>
      <div id="teachers-wrap"><div class="page-loader"><div class="spinner"></div></div></div>
    </div>
  `;

  document.getElementById("add-teacher-btn").addEventListener("click", openAddTeacherModal);
  await loadTeachersTable();
}

async function loadTeachersTable() {
  const teachers = await apiFetch("/teachers");
  const wrap = document.getElementById("teachers-wrap");
  const countEl = document.getElementById("teacher-count");
  if (!wrap) return;

  countEl.textContent = `${teachers.length} teacher(s)`;

  if (teachers.length === 0) {
    wrap.innerHTML = `<div class="table-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
      <p>No teacher accounts yet. Add one!</p>
    </div>`;
    return;
  }

  wrap.innerHTML = `
    <table>
      <thead><tr>
        <th>Username</th>
        <th>Role</th>
        <th>Assigned Courses</th>
        <th>Actions</th>
      </tr></thead>
      <tbody>
        ${teachers.map(t => `
          <tr>
            <td>
              <div class="cell-avatar">
                <div class="mini-avatar">${t.username[0].toUpperCase()}</div>
                <strong>${t.username}</strong>
              </div>
            </td>
            <td><span class="badge badge-purple">Teacher</span></td>
            <td>
              ${t.courses && t.courses.length > 0
      ? t.courses.map(c => `<span class="badge badge-green" style="margin:2px">${c.code}</span>`).join("")
      : `<span style="color:var(--text-muted);font-size:.82rem">None assigned</span>`
    }
            </td>
            <td style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn btn-ghost btn-sm assign-btn" data-id="${t.id}" data-name="${t.username}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                Assign Courses
              </button>
              <button class="btn btn-danger btn-sm delete-teacher-btn" data-id="${t.id}" data-name="${t.username}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg>
                Delete
              </button>
            </td>
          </tr>`).join("")}
      </tbody>
    </table>`;

  // Assign courses buttons
  document.querySelectorAll(".assign-btn").forEach(btn => {
    btn.addEventListener("click", () => openAssignModal(btn.dataset.id, btn.dataset.name));
  });

  // Delete teacher buttons
  document.querySelectorAll(".delete-teacher-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm(`Delete teacher account "${btn.dataset.name}"? Their course assignments will be removed.`)) return;
      await apiFetch(`/teachers/${btn.dataset.id}`, { method: "DELETE" });
      toast("Teacher deleted", "success");
      await loadTeachersTable();
    });
  });
}

function openAddTeacherModal() {
  openModal("Add Teacher Account", `
    <div class="form-group">
      <label>Username *</label>
      <input id="t-username" type="text" placeholder="e.g. john_doe" autocomplete="off"/>
    </div>
    <div class="form-group">
      <label>Password *</label>
      <input id="t-password" type="password" placeholder="Set a password" autocomplete="new-password"/>
    </div>
    <div id="teacher-error" class="error-msg hidden"></div>
    <button class="btn btn-primary btn-full" id="save-teacher-btn">Create Account</button>
  `);
  document.getElementById("save-teacher-btn").addEventListener("click", async () => {
    const username = document.getElementById("t-username").value.trim();
    const password = document.getElementById("t-password").value.trim();
    const errEl = document.getElementById("teacher-error");
    errEl.classList.add("hidden");

    if (!username || !password) {
      errEl.textContent = "Username and password are required.";
      errEl.classList.remove("hidden");
      return;
    }

    const btn = document.getElementById("save-teacher-btn");
    btn.disabled = true; btn.textContent = "Creating...";

    const res = await apiFetch("/teachers", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });

    btn.disabled = false; btn.textContent = "Create Account";

    if (res.success) {
      closeModal();
      toast("Teacher account created!", "success");
      await loadTeachersTable();
    } else {
      errEl.textContent = res.message || "Failed to create teacher.";
      errEl.classList.remove("hidden");
    }
  });
}

async function openAssignModal(teacherId, teacherName) {
  const [allCourses, teachers] = await Promise.all([
    apiFetch("/courses"),  // Admin gets all courses
    apiFetch("/teachers")
  ]);

  const teacher = teachers.find(t => t.id == teacherId);
  const assignedIds = new Set((teacher?.courses || []).map(c => c.id));

  openModal(`Assign Courses — ${teacherName}`, `
    <p style="color:var(--text-secondary);font-size:.85rem;margin-bottom:16px">
      Check the courses this teacher should be able to take attendance for.
    </p>
    ${allCourses.length === 0
      ? `<p style="color:var(--text-muted)">No courses exist yet. Add courses first.</p>`
      : `<div class="course-checklist">
          ${allCourses.map(c => `
            <label class="check-row">
              <input type="checkbox" class="course-chk" data-course-id="${c.id}" ${assignedIds.has(c.id) ? "checked" : ""}>
              <span>
                <span class="badge badge-purple" style="margin-right:6px">${c.code}</span>
                ${c.name} <span style="color:var(--text-muted)">(${c.class_name})</span>
              </span>
            </label>`).join("")}
         </div>`
    }
    <div id="assign-error" class="error-msg hidden"></div>
    <button class="btn btn-primary btn-full" id="save-assign-btn" style="margin-top:16px">Save Assignments</button>
  `);

  document.getElementById("save-assign-btn")?.addEventListener("click", async () => {
    const checkboxes = document.querySelectorAll(".course-chk");
    const btn = document.getElementById("save-assign-btn");
    btn.disabled = true; btn.textContent = "Saving...";

    // KEY FIX: Only touch courses that are relevant to THIS teacher.
    // - If checked → assign to this teacher (regardless of prior state)
    // - If unchecked → only unassign if this course WAS previously assigned to
    //   THIS teacher. If it belongs to another teacher, leave it alone.
    const ops = Array.from(checkboxes)
      .filter(chk => {
        const courseId = parseInt(chk.dataset.courseId);
        const wasAssignedToMe = assignedIds.has(courseId);
        // Process if: newly checking it, OR unchecking one we previously owned
        return chk.checked || wasAssignedToMe;
      })
      .map(chk => {
        const courseId = chk.dataset.courseId;
        const newTeacherId = chk.checked ? parseInt(teacherId) : null;
        return apiFetch(`/courses/${courseId}/assign`, {
          method: "PUT",
          body: JSON.stringify({ teacher_user_id: newTeacherId })
        });
      });

    await Promise.all(ops);
    btn.disabled = false;
    closeModal();
    toast("Course assignments saved!", "success");
    await loadTeachersTable();
  });
}
