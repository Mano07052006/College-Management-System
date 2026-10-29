# ICAM-SIS - Integrated College Academic Management & Student Information System

Node.js + Express + MySQL backend with a simple HTML/JS frontend.

## Setup
1. Install Node.js (18+) and MySQL.
2. `mysql -u root -p < schema.sql`
3. `npm install`
3b. Already have the database from an older version? Run `npm run migrate` once instead of re-importing `schema.sql` (it keeps your data).
4. Copy `.env.example` to `.env` and fill in your MySQL password and a long random JWT_SECRET.
5. Create the first admin: `npm run create-admin -- admin YourStrongPassword`
6. `npm start` then open http://localhost:3000

## First-time use (log in as admin)
1. **College Setup**: add department -> classes -> subjects.
2. **Register Users**: pick the role, then choose Department and Year from the dropdowns (students also get Semester and Section). The class is created automatically. A password is generated if left blank; note it down.
3. **College Setup**: assign teachers to subject + class.
4. Teachers log in and mark attendance; students log in and view attendance, notes, papers.
5. Admin publishes circulars and uploads exam timetables as documents (pdf, doc, docx, xls, xlsx, jpg, png, max 20 MB) for the whole college or one department; everyone concerned is notified and can download them.

## Who can do what
| Role | Access |
|---|---|
| Student | Own attendance (subject-wise, month or custom range), department resources, circulars, exam timetable, notifications |
| Teacher | Mark/edit attendance for assigned subject+class only; class coordinators can upload notes |
| HOD | Department shortage list, department resources, circulars, timetables |
| Admin | Everything: register users, setup, upload/replace/delete resources, circulars, exams, threshold |

## Attendance
Attendance % = present / total marked sessions x 100, per subject and overall.
Use `?month=2026-10` for monthly, or `?from=...&to=...` for a semester or any custom range.
After every save, students below the threshold (default 75%, changeable by admin) get an in-app notification (max one per subject per day).

## Next steps
- Student academic-record history table (keep every year/semester instead of overwriting)
- Audit log for attendance edits
- HTTPS, helmet, backups before deployment
