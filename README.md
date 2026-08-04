# Smart Attendance System Using AI-Based Face Recognition

An automated, modern web-based attendance system that uses Facial Recognition to instantly mark students present without manual roll calls. This project solves the issues of proxy attendance (signing in for friends) and slow manual class administration.

## 🚀 Features

- **Real-Time Facial Recognition**: Automatically identifies registered students via webcam using `dlib` and `face_recognition`.
- **Role-Based Access Control (RBAC)**: Distinct permissions for System Admins and Teachers.
  - **Admin**: Has full power. Can create teachers, add classes, and assign specific classes to specific teachers.
  - **Teacher**: Can only take attendance and generate reports for the specific classes they are assigned to.
  - **Student**: No login required. Their face is their identity.
- **Biometric Security**: Stores a 128-dimensional mathematical facial embedding instead of raw images. New faces are cross-checked to prevent duplicate enrollments (one ID per face).
- **Responsive Web UI**: A beautiful "Bento Box" glassmorphism dashboard that works on desktops and mobiles.
- **Reporting**: Advanced filtering (by date, class, or student name) and instant CSV export.

## 🛠️ Technology Stack

- **Backend Development**: Python 3, Flask REST API
- **Cloud Database**: PostgreSQL (Supabase cloud hosting)
- **Computer Vision / AI**: OpenCV, `face_recognition` (HOG model)
- **Frontend**: HTML5, Vanilla JavaScript (ES6+), Vanilla CSS variables
- **Deployment**: Render (Backend) + GitHub Pages (Frontend)

## 📌 Architecture Highlights
- Fully decoupled API architecture (Frontend and Backend are deployed on completely separate domains and securely communicate using CORS and session cookies).
- REST API protected entirely by `@login_required` and `@admin_required` server-side decorators to prevent URL spoofing.

---
*Developed for a University Artificial Intelligence project assignment.*
