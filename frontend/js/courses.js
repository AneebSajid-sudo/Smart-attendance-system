/* ═══════════════════════════════════════════════
   courses.js — Course management page
═══════════════════════════════════════════════ */

async function renderCourses(container) {
  container.innerHTML = `
    <div class="section-header">
      <div class="section-title">
        <h2>Courses</h2>
        <p>Manage university courses and subjects</p>
      </div>
      <button class="btn btn-primary" id="add-course-btn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Add Course
      </button>
    </div>
    <div class="table-card">
      <div class="table-toolbar">
        <h3>All Courses</h3>
        <input class="search-input" id="course-search" placeholder="Search courses…"/>
      </div>
      <div id="course-table-wrap"><div class="page-loader"><div class="spinner"></div></div></div>
    </div>
  `;

  const isAdmin = currentUser && currentUser.role === 'admin';

  await loadCoursesTable();
  const addBtn = document.getElementById("add-course-btn");
  if (addBtn) addBtn.style.display = isAdmin ? "" : "none";
  document.getElementById("course-search").addEventListener("input", filterCourses);
  if (isAdmin) {
    document.getElementById("add-course-btn").addEventListener("click", openAddCourseModal);
  }
}

let _allCourses = [];

async function loadCoursesTable() {
  _allCourses = await apiFetch("/courses");
  renderCourseRows(_allCourses);
}

function renderCourseRows(courses) {
  const wrap = document.getElementById("course-table-wrap");
  if (!wrap) return;
  if (courses.length === 0) {
    wrap.innerHTML = `<div class="table-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg><p>No courses added yet. Add one!</p></div>`;
    return;
  }
  wrap.innerHTML = `
    <table>
      <thead><tr><th>Code</th><th>Course Name</th><th>Class/Program</th><th>Instructor</th><th>Created</th><th>Actions</th></tr></thead>
      <tbody>
        ${courses.map(c => `
          <tr>
            <td><span class="badge badge-purple">${c.code}</span></td>
            <td><strong>${c.name}</strong></td>
            <td><span style="color:var(--text-secondary);font-size:0.9rem">${c.class_name}</span></td>
            <td>${c.instructor || '<span style="color:var(--text-muted)">—</span>'}</td>
            <td style="color:var(--text-secondary)">${(c.created_at || "").split("T")[0]}</td>
            <td>
              <button class="btn btn-danger btn-sm delete-course-btn" data-id="${c.id}" data-name="${c.name}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg>
                Delete
              </button>
            </td>
          </tr>`).join("")}
      </tbody>
    </table>`;

  document.querySelectorAll(".delete-course-btn").forEach(btn => {
    if (!currentUser || currentUser.role !== 'admin') {
      btn.style.display = 'none';
      return;
    }
    btn.addEventListener("click", async () => {
      if (!confirm(`Delete course "${btn.dataset.name}"? All related attendance records will be removed.`)) return;
      await apiFetch(`/courses/${btn.dataset.id}`, { method: "DELETE" });
      toast("Course deleted", "success");
      await loadCoursesTable();
    });
  });
}

function filterCourses() {
  const q = document.getElementById("course-search").value.toLowerCase();
  renderCourseRows(_allCourses.filter(c =>
    c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q) || (c.instructor || "").toLowerCase().includes(q)
  ));
}

function openAddCourseModal() {
  openModal("Add New Course", `
      <div class="form-group">
        <label>Course Code *</label>
        <input id="c-code" type="text" placeholder="e.g. CS-401"/>
      </div>
      <div class="form-group">
        <label>Class/Section *</label>
        <input id="c-class" type="text" placeholder="e.g. BS-AI Semester 4"/>
      </div>
    </div>
    <div class="form-group">
      <label>Course Name *</label>
      <input id="c-name" type="text" placeholder="e.g. Artificial Intelligence"/>
    </div>
    <div class="form-group">
      <label>Instructor <span style="color:var(--text-muted)">(optional)</span></label>
      <input id="c-instructor" type="text" placeholder="e.g. Dr. Ahmed"/>
    </div>
    <div id="course-error" class="error-msg hidden"></div>
    <button class="btn btn-primary btn-full" id="save-course-btn">Save Course</button>
  `);
  document.getElementById("save-course-btn").addEventListener("click", saveCourse);
}

async function saveCourse() {
  const code = document.getElementById("c-code").value.trim();
  const class_name = document.getElementById("c-class").value.trim();
  const name = document.getElementById("c-name").value.trim();
  const instructor = document.getElementById("c-instructor").value.trim();
  const errEl = document.getElementById("course-error");
  errEl.classList.add("hidden");

  if (!code || !name || !class_name) {
    errEl.textContent = "Course code, name, and class/section are required.";
    errEl.classList.remove("hidden");
    return;
  }
  const btn = document.getElementById("save-course-btn");
  btn.disabled = true; btn.textContent = "Saving...";

  const res = await apiFetch("/courses", { method: "POST", body: JSON.stringify({ code, class_name, name, instructor }) });
  btn.disabled = false; btn.textContent = "Save Course";

  if (res.success) {
    closeModal();
    toast("Course added!", "success");
    await loadCoursesTable();
  } else {
    errEl.textContent = res.message || "Failed to add course.";
    errEl.classList.remove("hidden");
  }
}
