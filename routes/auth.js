const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { auth } = require('../middleware/auth');
const { wrap, profile } = require('../utils');

router.post('/login', wrap(async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  const [rows] = await db.query("SELECT * FROM users WHERE username=? AND status='active'", [username]);
  const u = rows[0];
  if (!u || !(await bcrypt.compare(password, u.password_hash)))
    return res.status(401).json({ error: 'Invalid username or password' });
  const token = jwt.sign({ id: u.user_id, role: u.role }, process.env.JWT_SECRET, { expiresIn: '8h' });
  const p = await profile({ id: u.user_id, role: u.role });
  res.json({ token, role: u.role, username: u.username, name: p ? p.name : 'Admin',
             is_class_coordinator: p ? !!p.is_class_coordinator : false });
}));

router.post('/change-password', auth, wrap(async (req, res) => {
  const { old_password, new_password } = req.body;
  if (!new_password || new_password.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' });
  const [rows] = await db.query('SELECT password_hash FROM users WHERE user_id=?', [req.user.id]);
  if (!(await bcrypt.compare(old_password || '', rows[0].password_hash)))
    return res.status(401).json({ error: 'Old password is wrong' });
  await db.query('UPDATE users SET password_hash=? WHERE user_id=?', [await bcrypt.hash(new_password, 10), req.user.id]);
  res.json({ message: 'Password changed' });
}));

module.exports = router;
