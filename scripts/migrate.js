// Usage: npm run migrate
// Upgrades an EXISTING database (safe to run more than once):
//  - adds document columns to circulars
//  - creates the exam_timetable_files table
//  - adds a starter list of departments if the departments table is empty
const db = require('../db');
(async () => {
  const [cols] = await db.query("SELECT COLUMN_NAME c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='circulars'");
  const have = cols.map(r => r.c);
  if (!have.includes('file_name')) { await db.query('ALTER TABLE circulars ADD COLUMN file_name VARCHAR(255) NULL'); console.log('circulars.file_name added'); }
  if (!have.includes('stored_name')) { await db.query('ALTER TABLE circulars ADD COLUMN stored_name VARCHAR(255) NULL'); console.log('circulars.stored_name added'); }

  await db.query(`CREATE TABLE IF NOT EXISTS exam_timetable_files (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(150) NOT NULL,
    exam_type ENUM('internal','university') NOT NULL,
    department_id INT NULL,
    semester_id TINYINT NULL,
    file_name VARCHAR(255) NOT NULL,
    stored_name VARCHAR(255) NOT NULL,
    uploaded_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  console.log('exam_timetable_files table ready');

  const [[{ n }]] = await db.query('SELECT COUNT(*) n FROM departments');
  if (n === 0) {
    await db.query('INSERT INTO departments(name) VALUES ?', [[
      ['Information Technology'], ['Computer Science and Engineering'], ['Electronics and Communication Engineering'],
      ['Electrical and Electronics Engineering'], ['Mechanical Engineering'], ['Civil Engineering']]]);
    console.log('Starter departments added');
  }
  console.log('Migration complete');
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
