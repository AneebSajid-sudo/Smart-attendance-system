import os
import psycopg2
import psycopg2.extras
from psycopg2 import IntegrityError
from dotenv import load_dotenv

load_dotenv() # Load variables from .env if present

def get_connection():
    db_url = os.environ.get("SUPABASE_DATABASE_URL")
    if not db_url:
        raise ValueError("SUPABASE_DATABASE_URL environment variable is not set")
    conn = psycopg2.connect(db_url)
    return conn

def init_db():
    conn = get_connection()
    c = conn.cursor()

    c.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT DEFAULT 'teacher'
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS students (
            id SERIAL PRIMARY KEY,
            student_id TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            email TEXT,
            image_path TEXT,
            encoding BYTEA,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS courses (
            id SERIAL PRIMARY KEY,
            code TEXT NOT NULL,
            name TEXT NOT NULL,
            class_name TEXT NOT NULL,
            instructor TEXT,
            teacher_id INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(code, class_name),
            FOREIGN KEY(teacher_id) REFERENCES users(id) ON DELETE SET NULL
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS enrollments (
            id SERIAL PRIMARY KEY,
            student_id INTEGER NOT NULL,
            course_id INTEGER NOT NULL,
            FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE,
            FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
            UNIQUE(student_id, course_id)
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS attendance (
            id SERIAL PRIMARY KEY,
            student_id INTEGER NOT NULL,
            course_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            time TEXT NOT NULL,
            status TEXT DEFAULT 'Present',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(student_id) REFERENCES students(id)  ON DELETE CASCADE,
            FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE
        )
    """)

    # Seed default admin user
    c.execute("""
        INSERT INTO users (username, password, role)
        VALUES ('admin', 'admin123', 'admin')
        ON CONFLICT (username) DO NOTHING
    """)

    # Seed default teacher user
    c.execute("""
        INSERT INTO users (username, password, role)
        VALUES ('teacher', 'teacher123', 'teacher')
        ON CONFLICT (username) DO NOTHING
    """)

    conn.commit()
    conn.close()


def query_all(query, params=()):
    conn = get_connection()
    c = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
    c.execute(query, params)
    rows = c.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def query_one(query, params=()):
    conn = get_connection()
    c = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
    c.execute(query, params)
    row = c.fetchone()
    conn.close()
    return dict(row) if row else None


# ─── Auth / Users ───────────────────────────────────────────────────────────

def get_user_by_credentials(username, password):
    return query_one(
        "SELECT * FROM users WHERE username=%s AND password=%s",
        (username, password)
    )

def get_user_by_id(user_id):
    return query_one("SELECT * FROM users WHERE id=%s", (user_id,))

def change_password(username, old_password, new_password):
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT id FROM users WHERE username=%s AND password=%s", (username, old_password))
    if not c.fetchone():
        conn.close()
        return False, "Incorrect current password"
    c.execute("UPDATE users SET password=%s WHERE username=%s", (new_password, username))
    conn.commit()
    conn.close()
    return True, "Password updated successfully"

def get_all_teachers():
    return query_all("SELECT id, username, role FROM users WHERE role='teacher' ORDER BY username")

def add_teacher(username, password):
    conn = get_connection()
    try:
        c = conn.cursor()
        c.execute(
            "INSERT INTO users (username, password, role) VALUES (%s,%s,%s)",
            (username, password, 'teacher')
        )
        conn.commit()
        return True, "Teacher account created"
    except IntegrityError:
        return False, "Username already exists"
    finally:
        conn.close()

def delete_teacher(user_id):
    conn = get_connection()
    c = conn.cursor()
    c.execute("UPDATE courses SET teacher_id=NULL WHERE teacher_id=%s", (user_id,))
    c.execute("DELETE FROM users WHERE id=%s AND role='teacher'", (user_id,))
    conn.commit()
    conn.close()

def assign_course_teacher(course_id, teacher_user_id):
    conn = get_connection()
    c = conn.cursor()
    c.execute("UPDATE courses SET teacher_id=%s WHERE id=%s", (teacher_user_id, course_id))
    conn.commit()
    conn.close()


# ─── Students ───────────────────────────────────────────────────────────────

def add_student(student_id, name, email, image_path, encoding_bytes):
    conn = get_connection()
    try:
        c = conn.cursor()
        c.execute(
            "INSERT INTO students (student_id, name, email, image_path, encoding) VALUES (%s,%s,%s,%s,%s)",
            (student_id, name, email, image_path, psycopg2.Binary(encoding_bytes))
        )
        conn.commit()
        return True, "Student added successfully"
    except IntegrityError:
        return False, "Student ID already exists"
    finally:
        conn.close()

def get_all_students():
    return query_all("SELECT id, student_id, name, email, image_path, created_at FROM students ORDER BY created_at DESC")

def get_student_by_id(sid):
    return query_one("SELECT * FROM students WHERE id=%s", (sid,))

def delete_student(sid):
    conn = get_connection()
    c = conn.cursor()
    c.execute("DELETE FROM attendance WHERE student_id=%s", (sid,))
    c.execute("DELETE FROM enrollments WHERE student_id=%s", (sid,))
    c.execute("DELETE FROM students WHERE id=%s", (sid,))
    conn.commit()
    conn.close()

def get_all_encodings():
    rows = query_all("SELECT id, name, student_id, encoding FROM students WHERE encoding IS NOT NULL")
    # Postgres encoding comes out as memoryview, so take bytes() to keep compatibility with face_recognition
    for r in rows:
        if r['encoding'] is not None:
            r['encoding'] = bytes(r['encoding'])
    return rows


# ─── Courses ────────────────────────────────────────────────────────────────

def add_course(code, name, class_name, instructor):
    conn = get_connection()
    try:
        c = conn.cursor()
        c.execute(
            "INSERT INTO courses (code, name, class_name, instructor) VALUES (%s,%s,%s,%s)",
            (code, name, class_name, instructor)
        )
        conn.commit()
        return True, "Course added successfully"
    except IntegrityError:
        return False, "This course code is already registered for this class/section"
    finally:
        conn.close()

def get_all_courses():
    return query_all("SELECT * FROM courses ORDER BY created_at DESC")

def get_teacher_courses(teacher_user_id):
    return query_all(
        "SELECT * FROM courses WHERE teacher_id=%s ORDER BY created_at DESC",
        (teacher_user_id,)
    )

def teacher_owns_course(teacher_user_id, course_id):
    row = query_one(
        "SELECT id FROM courses WHERE id=%s AND teacher_id=%s",
        (course_id, teacher_user_id)
    )
    return row is not None

def delete_course(cid):
    conn = get_connection()
    c = conn.cursor()
    c.execute("DELETE FROM attendance WHERE course_id=%s", (cid,))
    c.execute("DELETE FROM enrollments WHERE course_id=%s", (cid,))
    c.execute("DELETE FROM courses WHERE id=%s", (cid,))
    conn.commit()
    conn.close()


# ─── Attendance ─────────────────────────────────────────────────────────────

def mark_attendance(student_db_id, course_id, date, time_str):
    conn = get_connection()
    c = conn.cursor()
    c.execute(
        "SELECT id FROM attendance WHERE student_id=%s AND course_id=%s AND date=%s",
        (student_db_id, course_id, date)
    )
    existing = c.fetchone()
    if existing:
        conn.close()
        return False, "Already marked"
    c.execute(
        "INSERT INTO attendance (student_id, course_id, date, time, status) VALUES (%s,%s,%s,%s,%s)",
        (student_db_id, course_id, date, time_str, "Present")
    )
    conn.commit()
    conn.close()
    return True, "Marked present"

def get_attendance_records(course_id=None, date=None, student_filter=None, teacher_user_id=None):
    query = """
        SELECT a.id, s.student_id, s.name, c.code AS course_code, c.name AS course_name, c.class_name,
               a.date, a.time, a.status
        FROM attendance a
        JOIN students s ON s.id = a.student_id
        JOIN courses c ON c.id = a.course_id
        WHERE 1=1
    """
    params = []
    if teacher_user_id is not None:
        query += " AND c.teacher_id=%s"
        params.append(teacher_user_id)
    if course_id:
        query += " AND a.course_id=%s"
        params.append(course_id)
    if date:
        query += " AND a.date=%s"
        params.append(date)
    if student_filter:
        query += " AND (s.name LIKE %s OR s.student_id LIKE %s)"
        params.extend([f"%{student_filter}%", f"%{student_filter}%"])
    
    query += " ORDER BY a.date DESC, a.time DESC"
    return query_all(query, params)

def get_dashboard_stats(teacher_user_id=None):
    conn = get_connection()
    c = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
    
    c.execute("SELECT COUNT(*) FROM students")
    total_students = c.fetchone()[0]

    if teacher_user_id:
        c.execute("SELECT COUNT(*) FROM courses WHERE teacher_id=%s", (teacher_user_id,))
        total_courses = c.fetchone()[0]
        c.execute(
            "SELECT COUNT(*) FROM attendance a JOIN courses c ON c.id=a.course_id WHERE c.teacher_id=%s",
            (teacher_user_id,)
        )
        total_attendance = c.fetchone()[0]
        c.execute(
            "SELECT COUNT(*) FROM attendance a JOIN courses c ON c.id=a.course_id WHERE c.teacher_id=%s AND a.date=CURRENT_DATE::text",
            (teacher_user_id,)
        )
        today_attendance = c.fetchone()[0]
        c.execute("""
            SELECT a.date, COUNT(*) as count
            FROM attendance a JOIN courses c ON c.id=a.course_id
            WHERE c.teacher_id=%s AND a.date >= (CURRENT_DATE - INTERVAL '6 days')::text
            GROUP BY a.date ORDER BY a.date
        """, (teacher_user_id,))
        weekly = c.fetchall()
    else:
        c.execute("SELECT COUNT(*) FROM courses")
        total_courses = c.fetchone()[0]
        c.execute("SELECT COUNT(*) FROM attendance")
        total_attendance = c.fetchone()[0]
        c.execute("SELECT COUNT(*) FROM attendance WHERE date=CURRENT_DATE::text")
        today_attendance = c.fetchone()[0]
        c.execute("""
            SELECT date, COUNT(*) as count
            FROM attendance
            WHERE date >= (CURRENT_DATE - INTERVAL '6 days')::text
            GROUP BY date ORDER BY date
        """)
        weekly = c.fetchall()

    conn.close()
    return {
        "total_students": total_students,
        "total_courses": total_courses,
        "total_attendance": total_attendance,
        "today_attendance": today_attendance,
        "weekly": [dict(r) for r in weekly]
    }
