import os
import csv
import io
from functools import wraps
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory, make_response, session

from flask_cors import CORS

import database as db
import face_utils

app = Flask(__name__, static_folder="frontend", static_url_path="")
app.secret_key = "sas-rbac-secret-key-2026-xK9mP2"

# Allow credentials (cookies) to be sent cross-origin when loaded from another domain (like github pages)
ALLOWED_ORIGINS = [
    "https://aneebkhan.github.io",
    "http://localhost:5000",
    "http://127.0.0.1:5000"
]
CORS(app, supports_credentials=True, origins=ALLOWED_ORIGINS)
app.config.update(
    SESSION_COOKIE_SAMESITE="None",
    SESSION_COOKIE_SECURE=True,
)

IMAGES_DIR = os.path.join(os.path.dirname(__file__), "student_images")
os.makedirs(IMAGES_DIR, exist_ok=True)

db.init_db()

import traceback
from werkzeug.exceptions import HTTPException


@app.errorhandler(Exception)
def handle_exception(e):
    if isinstance(e, HTTPException):
        return e
    print("CRASH:", traceback.format_exc())
    return jsonify({
        "success": False,
        "message": f"Server Crash: {str(e)}"
    }), 500


# ─── Auth Decorators ─────────────────────────────────────────────────────────

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get("user_id"):
            return jsonify({"success": False, "message": "Authentication required"}), 401
        return f(*args, **kwargs)
    return decorated


def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get("user_id"):
            return jsonify({"success": False, "message": "Authentication required"}), 401
        if session.get("role") != "admin":
            return jsonify({"success": False, "message": "Admin access required"}), 403
        return f(*args, **kwargs)
    return decorated


def get_session_user():
    """Return (user_id, role) from session."""
    return session.get("user_id"), session.get("role")


# ─── Serve Frontend ──────────────────────────────────────────────────────────

@app.route("/")
def index():
    return send_from_directory("frontend", "index.html")


# ─── Auth ────────────────────────────────────────────────────────────────────

@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    username = data.get("username", "")
    password = data.get("password", "")
    user = db.get_user_by_credentials(username, password)
    if user:
        session["user_id"] = user["id"]
        session["role"] = user["role"]
        session["username"] = user["username"]
        return jsonify({
            "success": True,
            "role": user["role"],
            "username": user["username"],
            "user_id": user["id"]
        })
    return jsonify({"success": False, "message": "Invalid credentials"}), 401


@app.route("/api/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"success": True})


@app.route("/api/me")
def me():
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"success": False, "message": "Not logged in"}), 401
    user = db.get_user_by_id(user_id)
    if not user:
        session.clear()
        return jsonify({"success": False, "message": "User not found"}), 401
    return jsonify({
        "success": True,
        "user_id": user["id"],
        "username": user["username"],
        "role": user["role"]
    })


@app.route("/api/auth/password", methods=["PUT"])
@login_required
def change_password():
    data = request.get_json(silent=True) or {}
    username = session.get("username")
    old_pwd = data.get("old_password", "")
    new_pwd = data.get("new_password", "")

    if not old_pwd or not new_pwd:
        return jsonify({"success": False, "message": "All fields are required"}), 400

    ok, msg = db.change_password(username, old_pwd, new_pwd)
    if ok:
        return jsonify({"success": True, "message": msg})
    return jsonify({"success": False, "message": msg}), 400


# ─── Dashboard ───────────────────────────────────────────────────────────────

@app.route("/api/dashboard/stats")
@login_required
def dashboard_stats():
    user_id, role = get_session_user()
    teacher_id = None if role == "admin" else user_id
    stats = db.get_dashboard_stats(teacher_user_id=teacher_id)
    return jsonify(stats)


# ─── Students ────────────────────────────────────────────────────────────────

@app.route("/api/students", methods=["GET"])
@login_required
def get_students():
    students = db.get_all_students()
    return jsonify(students)


@app.route("/api/students", methods=["POST"])
@admin_required
def add_student():
    data = request.get_json(silent=True) or {}
    student_id = data.get("student_id", "").strip().upper()
    name = data.get("name", "").strip()
    email = data.get("email", "").strip()
    image_b64 = data.get("image_b64", "")

    if not student_id or not name:
        return jsonify({"success": False, "message": "Student ID and name are required"}), 400

    encoding_bytes = None
    image_path = None
    if image_b64:
        encoding_bytes, frame_bgr = face_utils.encode_face_from_base64(image_b64)
        if encoding_bytes is None:
            return jsonify({"success": False, "message": "No face detected in the image. Please retake."}), 400

        known_students = db.get_all_encodings()
        duplicate = face_utils.find_duplicate_face(encoding_bytes, known_students)
        if duplicate:
            return jsonify({
                "success": False,
                "message": f"This face is already registered to '{duplicate['name']}' ({duplicate['student_id']})."
            }), 400

        import cv2
        img_filename = f"{student_id}.jpg"
        image_path = os.path.join(IMAGES_DIR, img_filename)
        cv2.imwrite(image_path, frame_bgr)

    ok, msg = db.add_student(student_id, name, email, image_path, encoding_bytes)
    if ok:
        return jsonify({"success": True, "message": msg})
    return jsonify({"success": False, "message": msg}), 400


@app.route("/api/students/<int:sid>", methods=["DELETE"])
@admin_required
def delete_student(sid):
    student = db.get_student_by_id(sid)
    if student and student.get("image_path") and os.path.exists(student["image_path"]):
        os.remove(student["image_path"])
    db.delete_student(sid)
    return jsonify({"success": True})


# ─── Courses ─────────────────────────────────────────────────────────────────

@app.route("/api/courses", methods=["GET"])
@login_required
def get_courses():
    user_id, role = get_session_user()
    if role == "admin":
        courses = db.get_all_courses()
    else:
        courses = db.get_teacher_courses(user_id)
    return jsonify(courses)


@app.route("/api/courses", methods=["POST"])
@admin_required
def add_course():
    data = request.get_json(silent=True) or {}
    code = data.get("code", "").strip().upper()
    name = data.get("name", "").strip()
    class_name = data.get("class_name", "").strip()
    instructor = data.get("instructor", "").strip()
    if not code or not name or not class_name:
        return jsonify({"success": False, "message": "Code, Name, and Class/Section are required"}), 400
    ok, msg = db.add_course(code, name, class_name, instructor)
    if ok:
        return jsonify({"success": True, "message": msg})
    return jsonify({"success": False, "message": msg}), 400


@app.route("/api/courses/<int:cid>", methods=["DELETE"])
@admin_required
def delete_course(cid):
    db.delete_course(cid)
    return jsonify({"success": True})


@app.route("/api/courses/<int:cid>/assign", methods=["PUT"])
@admin_required
def assign_course(cid):
    data = request.get_json(silent=True) or {}
    teacher_user_id = data.get("teacher_user_id")  # None to unassign
    db.assign_course_teacher(cid, teacher_user_id)
    return jsonify({"success": True})


# ─── Teachers (admin only) ────────────────────────────────────────────────────

@app.route("/api/teachers", methods=["GET"])
@admin_required
def get_teachers():
    teachers = db.get_all_teachers()
    # Annotate each teacher with their assigned courses
    all_courses = db.get_all_courses()
    for t in teachers:
        t["courses"] = [c for c in all_courses if c.get("teacher_id") == t["id"]]
    return jsonify(teachers)


@app.route("/api/teachers", methods=["POST"])
@admin_required
def create_teacher():
    data = request.get_json(silent=True) or {}
    username = data.get("username", "").strip()
    password = data.get("password", "").strip()
    if not username or not password:
        return jsonify({"success": False, "message": "Username and password are required"}), 400
    ok, msg = db.add_teacher(username, password)
    if ok:
        return jsonify({"success": True, "message": msg})
    return jsonify({"success": False, "message": msg}), 400


@app.route("/api/teachers/<int:tid>", methods=["DELETE"])
@admin_required
def remove_teacher(tid):
    db.delete_teacher(tid)
    return jsonify({"success": True})


# ─── Attendance ──────────────────────────────────────────────────────────────

@app.route("/api/attendance/recognize", methods=["POST"])
@login_required
def recognize():
    user_id, role = get_session_user()
    data = request.get_json(silent=True) or {}
    image_b64 = data.get("image_b64", "")
    course_id = data.get("course_id")

    if not image_b64:
        return jsonify({"success": False, "message": "No image provided"}), 400

    # Ownership check for teachers
    if role == "teacher" and course_id:
        if not db.teacher_owns_course(user_id, int(course_id)):
            return jsonify({"success": False, "message": "You are not assigned to this course"}), 403

    known_students = db.get_all_encodings()
    faces_data = face_utils.recognize_faces_in_frame(image_b64, known_students)

    marked_list = []
    recognised_count = 0
    now_date = datetime.now().strftime("%Y-%m-%d")
    now_time = datetime.now().strftime("%H:%M:%S")

    for face in faces_data:
        if face["matched"]:
            recognised_count += 1
            ok, _ = db.mark_attendance(face["id"], course_id, now_date, now_time)
            if ok:
                marked_list.append(face)

    return jsonify({
        "success": True,
        "faces": faces_data,
        "marked": marked_list,
        "recognised_count": recognised_count
    })


@app.route("/api/attendance/mark-manual", methods=["POST"])
@login_required
def mark_manual():
    user_id, role = get_session_user()
    data = request.get_json(silent=True) or {}
    student_db_id = data.get("student_id")
    course_id = data.get("course_id")

    if role == "teacher" and course_id:
        if not db.teacher_owns_course(user_id, int(course_id)):
            return jsonify({"success": False, "message": "You are not assigned to this course"}), 403

    now = datetime.now()
    ok, msg = db.mark_attendance(student_db_id, course_id, now.strftime("%Y-%m-%d"), now.strftime("%H:%M:%S"))
    return jsonify({"success": ok, "message": msg})


@app.route("/api/attendance/records", methods=["GET"])
@login_required
def get_records():
    user_id, role = get_session_user()
    course_id = request.args.get("course_id")
    date = request.args.get("date")
    student_filter = request.args.get("student")
    teacher_id = None if role == "admin" else user_id
    records = db.get_attendance_records(course_id, date, student_filter, teacher_user_id=teacher_id)
    return jsonify(records)


@app.route("/api/attendance/export", methods=["GET"])
@login_required
def export_csv():
    user_id, role = get_session_user()
    course_id = request.args.get("course_id")
    date = request.args.get("date")
    teacher_id = None if role == "admin" else user_id
    records = db.get_attendance_records(course_id, date, teacher_user_id=teacher_id)

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=[
        "student_id", "name", "course_code", "course_name", "class_name", "date", "time", "status"
    ])
    writer.writeheader()
    for r in records:
        writer.writerow({k: r[k] for k in ["student_id", "name", "course_code", "course_name", "class_name", "date", "time", "status"]})

    response = make_response(output.getvalue())
    response.headers["Content-Disposition"] = "attachment; filename=attendance_report.csv"
    response.headers["Content-Type"] = "text/csv"
    return response


if __name__ == "__main__":
    print("=" * 55)
    print("  Smart Attendance System")
    print("  Open http://localhost:5000 in your browser")
    print("  Admin login:   admin   / admin123")
    print("  Teacher login: teacher / teacher123")
    print("=" * 55)
    app.run(debug=True, host="0.0.0.0", port=5000)
