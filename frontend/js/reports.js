/* ═══════════════════════════════════════════════
   reports.js — Attendance reports and CSV export
═══════════════════════════════════════════════ */

async function renderReports(container) {
  const courses = await apiFetch("/courses");

  container.innerHTML = `
    <div class="section-header">
      <div class="section-title">
        <h2>Attendance Reports</h2>
        <p>Filter and export attendance records</p>
      </div>
      <button class="btn btn-success" id="export-btn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Export CSV
      </button>
    </div>

    <!-- Filters -->
    <div class="filters-bar">
      <div class="filter-item">
        <label>Course</label>
        <select id="r-course">
          <option value="">All Courses</option>
          ${courses.map(c => `<option value="${c.id}">[${c.code}] ${c.name} (${c.class_name})</option>`).join("")}
        </select>
      </div>
      <div class="filter-item">
        <label>Date</label>
        <input type="date" id="r-date" value="${new Date().toISOString().slice(0, 10)}"/>
      </div>
      <div class="filter-item">
        <label>Student (name or ID)</label>
        <input type="text" id="r-student" placeholder="Search student…"/>
      </div>
      <button class="btn btn-primary" id="filter-btn" style="margin-top:20px">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
        Filter
      </button>
      <button class="btn btn-ghost" id="clear-btn" style="margin-top:20px">Clear</button>
    </div>

    <!-- Summary Row -->
    <div id="report-summary" style="margin-bottom:16px;color:var(--text-secondary);font-size:.85rem"></div>

    <!-- Table -->
    <div class="table-card">
      <div class="table-toolbar">
        <h3>Records</h3>
        <span id="record-count" style="color:var(--text-muted);font-size:.82rem"></span>
      </div>
      <div id="report-table-wrap"><div class="page-loader"><div class="spinner"></div></div></div>
    </div>
  `;

  await loadReportTable();

  document.getElementById("filter-btn").addEventListener("click", loadReportTable);
  document.getElementById("clear-btn").addEventListener("click", () => {
    document.getElementById("r-course").value = "";
    document.getElementById("r-date").value = "";
    document.getElementById("r-student").value = "";
    loadReportTable();
  });
  document.getElementById("export-btn").addEventListener("click", exportCSV);
}

async function loadReportTable() {
  const course = document.getElementById("r-course").value;
  const date = document.getElementById("r-date").value;
  const student = document.getElementById("r-student").value;

  let path = "/attendance/records?";
  if (course) path += `course_id=${course}&`;
  if (date) path += `date=${date}&`;
  if (student) path += `student=${encodeURIComponent(student)}&`;

  const wrap = document.getElementById("report-table-wrap");
  wrap.innerHTML = `<div class="page-loader"><div class="spinner"></div></div>`;

  const records = await apiFetch(path);
  document.getElementById("record-count").textContent = `${records.length} record(s)`;

  // Stats summary
  const uniqueStudents = new Set(records.map(r => r.student_id)).size;
  document.getElementById("report-summary").innerHTML = records.length > 0 ? `
    Showing <strong style="color:var(--text-primary)">${records.length}</strong> records · 
    <strong style="color:var(--text-primary)">${uniqueStudents}</strong> unique students
  ` : "";

  if (records.length === 0) {
    wrap.innerHTML = `<div class="table-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><p>No records found for the selected filters.</p></div>`;
    return;
  }

  wrap.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Student</th>
          <th>ID</th>
          <th>Course</th>
          <th>Class/Section</th>
          <th>Date</th>
          <th>Time</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${records.map((r, i) => `
          <tr>
            <td style="color:var(--text-muted)">${i + 1}</td>
            <td>
              <div class="cell-avatar">
                <div class="mini-avatar">${r.name[0].toUpperCase()}</div>
                ${r.name}
              </div>
            </td>
            <td><code style="color:var(--accent-2);background:rgba(56,189,248,0.08);padding:2px 8px;border-radius:4px;font-size:.78rem">${r.student_id}</code></td>
            <td>
              <span class="badge badge-purple">${r.course_code}</span>
              <span style="margin-left:6px;color:var(--text-secondary);font-size:.82rem">${r.course_name}</span>
            </td>
            <td><span style="color:var(--text-secondary);font-size:0.9rem">${r.class_name}</span></td>
            <td>${r.date}</td>
            <td style="color:var(--text-secondary)">${r.time}</td>
            <td><span class="badge badge-green">${r.status}</span></td>
          </tr>`).join("")}
      </tbody>
    </table>`;
}

async function exportCSV() {
  const course = document.getElementById("r-course").value;
  const date = document.getElementById("r-date").value;

  const baseApi = window.location.protocol === "file:" ? "http://localhost:5000/api" : "/api";
  let path = `${baseApi}/attendance/export?`;
  if (course) path += `course_id=${course}&`;
  if (date) path += `date=${date}&`;

  try {
    const res = await fetch(path);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance_${date || "all"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast("CSV exported successfully!", "success");
  } catch {
    toast("Export failed", "error");
  }
}
