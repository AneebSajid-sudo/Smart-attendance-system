/* ═══════════════════════════════════════════════
   app.js — SPA Router + Global Utilities + RBAC
═══════════════════════════════════════════════ */

const PROD_API_URL = "https://your-flask-app.onrender.com/api"; // You will replace this later!

const API = window.location.hostname.includes("github.io")
    ? PROD_API_URL
    : (window.location.protocol === "file:" ? "http://localhost:5000/api" : "/api");

// ─── Auth State ──────────────────────────────────
let currentUser = null; // { user_id, username, role }

// ─── Toast ───────────────────────────────────────
function toast(message, type = "info") {
    const icons = {
        success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`,
        error: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
        info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
    };
    const el = document.createElement("div");
    el.className = `toast toast-${type}`;
    el.innerHTML = `${icons[type] || icons.info}<span>${message}</span>`;
    document.getElementById("toast-container").appendChild(el);
    setTimeout(() => {
        el.style.opacity = "0";
        el.style.transform = "translateX(30px)";
        el.style.transition = "all 0.3s ease";
        setTimeout(() => el.remove(), 300);
    }, 3500);
}

// ─── Modal ───────────────────────────────────────
function openModal(title, bodyHTML) {
    document.getElementById("modal-title").textContent = title;
    document.getElementById("modal-body").innerHTML = bodyHTML;
    document.getElementById("modal-overlay").classList.remove("hidden");
}
function closeModal() {
    document.getElementById("modal-overlay").classList.add("hidden");
    document.getElementById("modal-body").innerHTML = "";
}

// ─── API Fetch Helper ────────────────────────────
async function apiFetch(path, options = {}) {
    try {
        const res = await fetch(API + path, {
            headers: { "Content-Type": "application/json" },
            credentials: "include",   // Send session cookie on every request
            ...options,
        });

        // Global 401 handler — session expired or bypassed
        if (res.status === 401 && !path.includes("/login")) {
            forceLogout("Your session has expired. Please log in again.");
            return { success: false, message: "Session expired" };
        }

        if (path.includes("export")) return res;

        const text = await res.text();
        try {
            return JSON.parse(text);
        } catch {
            console.error("Non-JSON from", path, ":", text.slice(0, 300));
            return { success: false, message: `Server error ${res.status}` };
        }
    } catch (e) {
        toast("Cannot reach server — open http://localhost:5000 (not the file directly!)", "error");
        throw e;
    }
}

// ─── Role-Based Navigation ───────────────────────
// Nav items accessible per role
const ADMIN_PAGES = ["dashboard", "students", "courses", "attendance", "reports", "users"];
const TEACHER_PAGES = ["attendance", "reports"];

function applyRoleUI(role) {
    const isAdmin = role === "admin";

    // Show/hide nav items
    document.querySelectorAll(".nav-item").forEach(a => {
        const page = a.dataset.page;
        if (isAdmin) {
            a.style.display = "";
        } else {
            a.style.display = TEACHER_PAGES.includes(page) ? "" : "none";
        }
    });

    // Update user role label in sidebar footer
    document.getElementById("user-role-label").textContent = isAdmin ? "Administrator" : "Teacher";

    // Show/hide admin-only badge on avatar
    const badge = document.getElementById("user-role-badge");
    if (badge) {
        badge.textContent = isAdmin ? "ADMIN" : "TEACHER";
        badge.className = isAdmin ? "role-badge role-admin" : "role-badge role-teacher";
    }
}

// ─── Router ──────────────────────────────────────
const pages = {
    dashboard: (c) => renderDashboard(c),
    students: (c) => renderStudents(c),
    courses: (c) => renderCourses(c),
    attendance: (c) => renderAttendance(c),
    reports: (c) => renderReports(c),
    users: (c) => renderUsers(c),
};

const pageTitles = {
    dashboard: "Dashboard",
    students: "Student Management",
    courses: "Course Management",
    attendance: "Take Attendance",
    reports: "Attendance Reports",
    users: "User Management",
};

function navigate(page) {
    // Guard: teachers can only access allowed pages
    if (currentUser && currentUser.role === "teacher" && !TEACHER_PAGES.includes(page)) {
        page = "attendance";
    }

    document.querySelectorAll(".nav-item").forEach(a => {
        a.classList.toggle("active", a.dataset.page === page);
    });
    document.querySelectorAll(".page").forEach(p => {
        p.classList.toggle("active", p.id === `page-${page}`);
    });
    document.getElementById("page-title").textContent = pageTitles[page] || page;
    document.getElementById("topbar-actions").innerHTML = "";

    if (pages[page]) pages[page](document.getElementById(`page-${page}`));

    document.getElementById("sidebar").classList.remove("open");
}

// ─── Login ───────────────────────────────────────
document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("login-btn");
    const errEl = document.getElementById("login-error");
    const text = btn.querySelector(".btn-text");
    const spin = btn.querySelector(".btn-spinner");

    text.classList.add("hidden");
    spin.classList.remove("hidden");
    errEl.classList.add("hidden");
    btn.disabled = true;

    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;

    const data = await apiFetch("/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
    }).catch(() => null);

    text.classList.remove("hidden");
    spin.classList.add("hidden");
    btn.disabled = false;

    if (data && data.success) {
        activateApp(data);
    } else {
        errEl.textContent = (data && data.message) || "Login failed";
        errEl.classList.remove("hidden");
    }
});

function activateApp(userData) {
    currentUser = {
        user_id: userData.user_id,
        username: userData.username,
        role: userData.role,
    };

    // Update UI identity
    document.getElementById("logged-user").textContent = userData.username;
    document.getElementById("user-avatar").textContent = userData.username[0].toUpperCase();

    // Apply role-based navigation
    applyRoleUI(userData.role);

    document.getElementById("login-screen").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");

    // Start on appropriate default page
    const defaultPage = userData.role === "teacher" ? "attendance" : "dashboard";
    navigate(defaultPage);
}

function forceLogout(message) {
    currentUser = null;
    document.getElementById("app").classList.add("hidden");
    document.getElementById("login-screen").classList.remove("hidden");
    document.getElementById("login-form").reset();
    if (message) {
        const errEl = document.getElementById("login-error");
        errEl.textContent = message;
        errEl.classList.remove("hidden");
    }
}

// ─── Profile Settings ────────────────────────────
document.getElementById("profile-btn").addEventListener("click", () => {
    openModal("Change Password", `
      <div class="form-group">
        <label>Current Password</label>
        <input type="password" id="old-pwd" />
      </div>
      <div class="form-group">
        <label>New Password</label>
        <input type="password" id="new-pwd" />
      </div>
      <div id="pwd-error" class="error-msg hidden"></div>
      <button class="btn btn-primary btn-full" id="save-pwd-btn">Update Password</button>
    `);

    document.getElementById("save-pwd-btn").addEventListener("click", async () => {
        const old_password = document.getElementById("old-pwd").value;
        const new_password = document.getElementById("new-pwd").value;
        const errEl = document.getElementById("pwd-error");

        if (!old_password || !new_password) {
            errEl.textContent = "Please fill in all fields.";
            errEl.classList.remove("hidden");
            return;
        }

        const btn = document.getElementById("save-pwd-btn");
        btn.disabled = true;
        btn.textContent = "Updating...";

        const res = await apiFetch("/auth/password", {
            method: "PUT",
            body: JSON.stringify({ old_password, new_password })
        });

        btn.disabled = false;
        btn.textContent = "Update Password";

        if (res.success) {
            closeModal();
            toast("Password changed successfully", "success");
        } else {
            errEl.textContent = res.message;
            errEl.classList.remove("hidden");
        }
    });
});

// ─── Logout ──────────────────────────────────────
document.getElementById("logout-btn").addEventListener("click", async () => {
    await apiFetch("/logout", { method: "POST" }).catch(() => { });
    forceLogout();
});

// ─── Sidebar toggle ──────────────────────────────
document.getElementById("sidebar-toggle").addEventListener("click", () => {
    document.getElementById("sidebar").classList.toggle("collapsed");
});
document.getElementById("mobile-menu-btn").addEventListener("click", () => {
    document.getElementById("sidebar").classList.toggle("open");
});

// ─── Nav links ───────────────────────────────────
document.querySelectorAll(".nav-item").forEach(a => {
    a.addEventListener("click", (e) => {
        e.preventDefault();
        navigate(a.dataset.page);
    });
});

// ─── Modal close ─────────────────────────────────
document.getElementById("modal-close").addEventListener("click", closeModal);
document.getElementById("modal-overlay").addEventListener("click", (e) => {
    if (e.target === document.getElementById("modal-overlay")) closeModal();
});
