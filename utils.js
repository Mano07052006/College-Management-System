const db = require('./db');

// Catches async errors so every route can just throw
exports.wrap = fn => (req, res) =>
  fn(req, res).catch(e => { console.error(e); res.status(500).json({ error: 'Server error' }); });

// Student / teacher / HOD row for the logged-in user (null for admin)
exports.profile = async user => {
  const table = { student: 'students', teacher: 'teachers', hod: 'hods' }[user.role];
  if (!table) return null;
  const [r] = await db.query(`SELECT * FROM ${table} WHERE user_id=?`, [user.id]);
  return r[0] || null;
};

// user_ids of everyone in a department (or the whole college when departmentId is null)
exports.audience = async (conn, departmentId) => {
  if (!departmentId) {
    const [r] = await conn.query("SELECT user_id FROM users WHERE status='active'");
    return r.map(x => x.user_id);
  }
  const [r] = await conn.query(
    `SELECT user_id FROM students WHERE department_id=? UNION
     SELECT user_id FROM teachers WHERE department_id=? UNION
     SELECT user_id FROM hods WHERE department_id=?`, [departmentId, departmentId, departmentId]);
  return r.map(x => x.user_id);
};

// Create one notification and deliver it to many users
exports.notify = async (conn, title, message, type, userIds) => {
  if (!userIds.length) return;
  const [r] = await conn.query('INSERT INTO notifications(title,message,type) VALUES(?,?,?)', [title, message, type]);
  await conn.query('INSERT INTO notification_recipients(notification_id,user_id) VALUES ?',
    [userIds.map(id => [r.insertId, id])]);
};
