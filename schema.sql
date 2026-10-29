CREATE DATABASE IF NOT EXISTS icam_sis;
USE icam_sis;

CREATE TABLE users (
  user_id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,
  role ENUM('admin','hod','teacher','student') NOT NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE departments (
  department_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE
);
CREATE TABLE classes (
  class_id INT AUTO_INCREMENT PRIMARY KEY,
  department_id INT NOT NULL,
  year_of_study TINYINT NOT NULL,
  section VARCHAR(5) NOT NULL DEFAULT 'A',
  UNIQUE (department_id, year_of_study, section),
  FOREIGN KEY (department_id) REFERENCES departments(department_id)
);
CREATE TABLE semesters (
  semester_id INT AUTO_INCREMENT PRIMARY KEY,
  number TINYINT NOT NULL UNIQUE
);
CREATE TABLE subjects (
  subject_id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  department_id INT NOT NULL,
  semester_id INT NOT NULL,
  FOREIGN KEY (department_id) REFERENCES departments(department_id),
  FOREIGN KEY (semester_id) REFERENCES semesters(semester_id)
);
CREATE TABLE students (
  student_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  register_number VARCHAR(30) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  dob DATE, email VARCHAR(100), phone VARCHAR(20),
  department_id INT NOT NULL,
  class_id INT NOT NULL,
  semester_id INT NOT NULL,
  admission_year YEAR,
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  FOREIGN KEY (department_id) REFERENCES departments(department_id),
  FOREIGN KEY (class_id) REFERENCES classes(class_id),
  FOREIGN KEY (semester_id) REFERENCES semesters(semester_id)
);
CREATE TABLE teachers (
  teacher_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  employee_id VARCHAR(30) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100), phone VARCHAR(20),
  department_id INT NOT NULL,
  designation VARCHAR(60),
  is_class_coordinator BOOLEAN NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  FOREIGN KEY (department_id) REFERENCES departments(department_id)
);
CREATE TABLE hods (
  hod_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  employee_id VARCHAR(30) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  department_id INT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  FOREIGN KEY (department_id) REFERENCES departments(department_id)
);
CREATE TABLE teacher_subjects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  teacher_id INT NOT NULL,
  subject_id INT NOT NULL,
  class_id INT NOT NULL,
  UNIQUE (teacher_id, subject_id, class_id),
  FOREIGN KEY (teacher_id) REFERENCES teachers(teacher_id),
  FOREIGN KEY (subject_id) REFERENCES subjects(subject_id),
  FOREIGN KEY (class_id) REFERENCES classes(class_id)
);
CREATE TABLE attendance (
  attendance_id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  subject_id INT NOT NULL,
  teacher_id INT NULL,
  class_id INT NOT NULL,
  attendance_date DATE NOT NULL,
  status ENUM('P','A') NOT NULL,
  marked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_att (student_id, subject_id, attendance_date),
  INDEX idx_att_date (attendance_date),
  FOREIGN KEY (student_id) REFERENCES students(student_id),
  FOREIGN KEY (subject_id) REFERENCES subjects(subject_id),
  FOREIGN KEY (class_id) REFERENCES classes(class_id)
);
CREATE TABLE resources (
  resource_id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(150) NOT NULL,
  description TEXT,
  type ENUM('notes','lab_manual','question_paper','important') NOT NULL,
  subject_id INT NOT NULL,
  department_id INT NOT NULL,
  semester_id INT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  stored_name VARCHAR(255) NOT NULL,
  uploaded_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (subject_id) REFERENCES subjects(subject_id),
  FOREIGN KEY (uploaded_by) REFERENCES users(user_id)
);
CREATE TABLE notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(150) NOT NULL,
  message TEXT,
  type ENUM('attendance','circular','exam','resource','general') NOT NULL DEFAULT 'general',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE notification_recipients (
  id INT AUTO_INCREMENT PRIMARY KEY,
  notification_id INT NOT NULL,
  user_id INT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT 0,
  INDEX idx_user (user_id, is_read),
  FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);
CREATE TABLE circulars (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(150) NOT NULL,
  description TEXT,
  department_id INT NULL,            -- NULL = whole college
  created_by INT NOT NULL,
  file_name VARCHAR(255) NULL,       -- uploaded document (optional)
  stored_name VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE exam_timetables (
  id INT AUTO_INCREMENT PRIMARY KEY,
  exam_type ENUM('internal','university') NOT NULL,
  department_id INT NOT NULL,
  semester_id INT NOT NULL,
  subject_id INT NOT NULL,
  exam_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  venue VARCHAR(100),
  FOREIGN KEY (subject_id) REFERENCES subjects(subject_id)
);
CREATE TABLE exam_timetable_files (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(150) NOT NULL,
  exam_type ENUM('internal','university') NOT NULL,
  department_id INT NULL,            -- NULL = all departments
  semester_id TINYINT NULL,          -- NULL = all semesters
  file_name VARCHAR(255) NOT NULL,
  stored_name VARCHAR(255) NOT NULL,
  uploaded_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE system_settings (
  name VARCHAR(50) PRIMARY KEY,
  value VARCHAR(100) NOT NULL
);

INSERT INTO system_settings VALUES ('attendance_threshold','75');
INSERT INTO semesters(number) VALUES (1),(2),(3),(4),(5),(6),(7),(8);
INSERT INTO departments(name) VALUES
  ('Information Technology'),('Computer Science and Engineering'),('Electronics and Communication Engineering'),
  ('Electrical and Electronics Engineering'),('Mechanical Engineering'),('Civil Engineering');
