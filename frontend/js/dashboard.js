/* ═══════════════════════════════════════════════
   dashboard.js — Dashboard page
═══════════════════════════════════════════════ */

async function renderDashboard(container) {
  container.innerHTML = `
    <div class="section-header">
      <div class="section-title">
        <h2>Welcome back 👋</h2>
        <p>Here's what's happening with your attendance system today.</p>
      </div>
    </div>
    <div class="dashboard-bento flex-col gap-4">
      <div class="stats-grid" id="stats-grid">
        ${[1, 2, 3, 4].map(() => `
          <div class="stat-card">
            <div class="stat-icon purple" style="background:rgba(168,85,247,0.1);width:52px;height:52px;border-radius:12px;"></div>
            <div style="height:36px;background:rgba(255,255,255,0.05);border-radius:6px;width:70%;margin-top:8px;"></div>
            <div style="height:16px;background:rgba(255,255,255,0.03);border-radius:4px;width:90%;"></div>
          </div>`).join("")}
      </div>
      <div class="chart-card" id="chart-card">
        <h3>Weekly Attendance</h3>
        <div class="bar-chart" id="bar-chart"><div class="page-loader"><div class="spinner"></div></div></div>
      </div>
    </div>
    <div class="table-card" style="margin-top:24px">
      <div class="table-toolbar">
        <h3>Recent Attendance</h3>
      </div>
      <div id="recent-table-wrap"></div>
    </div>
  `;

  const stats = await apiFetch("/dashboard/stats");
  const cards = [
    { label: "Total Students", value: stats.total_students, icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>`, color: "purple", page: "students" },
    { label: "Total Courses", value: stats.total_courses, icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`, color: "blue", page: "courses" },
    { label: "Total Records", value: stats.total_attendance, icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`, color: "green", page: "reports" },
    { label: "Today Present", value: stats.today_attendance, icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`, color: "orange", page: "reports" },
  ];

  document.getElementById("stats-grid").innerHTML = cards.map(c => `
    <div class="stat-card" style="cursor:pointer;" onclick="navigate('${c.page}')">
      <div class="stat-icon ${c.color}">${c.icon}</div>
      <div class="stat-value ${c.color}" data-target="${c.value}">0</div>
      <div class="stat-label">${c.label}</div>
    </div>
  `).join("");

  // Animate numbers
  document.querySelectorAll(".stat-value[data-target]").forEach(el => {
    const target = parseInt(el.dataset.target);
    let current = 0;
    const step = Math.ceil(target / 20) || 1;
    const timer = setInterval(() => {
      current = Math.min(current + step, target);
      el.textContent = current;
      if (current >= target) clearInterval(timer);
    }, 40);
  });

  // Bar chart
  const weekly = stats.weekly || [];
  const maxVal = Math.max(...weekly.map(w => w.count), 1);
  const getLast7Days = () => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().slice(0, 10));
    }
    return days;
  };
  const days = getLast7Days();
  const weekMap = {};
  weekly.forEach(w => weekMap[w.date] = w.count);

  document.getElementById("bar-chart").innerHTML = days.map(d => {
    const count = weekMap[d] || 0;
    const pct = (count / maxVal) * 100;
    const label = new Date(d + "T00:00:00").toLocaleDateString("en", { weekday: "short" });
    return `
      <div class="bar-col">
        <div class="bar-val">${count}</div>
        <div class="bar" style="height:${Math.max(pct, 4)}%" title="${d}: ${count}"></div>
        <div class="bar-label">${label}</div>
      </div>`;
  }).join("");

  // Recent attendance table
  const records = await apiFetch("/attendance/records");
  const recent = records.slice(0, 10);
  const wrap = document.getElementById("recent-table-wrap");
  if (recent.length === 0) {
    wrap.innerHTML = `<div class="table-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2"/></svg><p>No attendance records yet</p></div>`;
    return;
  }
  wrap.innerHTML = `
    <table>
      <thead><tr><th>Student</th><th>Course</th><th>Date</th><th>Time</th><th>Status</th></tr></thead>
      <tbody>
        ${recent.map(r => `
          <tr>
            <td><div class="cell-avatar"><div class="mini-avatar">${r.name[0].toUpperCase()}</div>${r.name}</div></td>
            <td><span class="badge badge-blue">${r.course_code}</span></td>
            <td>${r.date}</td>
            <td>${r.time}</td>
            <td><span class="badge badge-green">${r.status}</span></td>
          </tr>`).join("")}
      </tbody>
    </table>`;
}
