const router = require('express').Router();
const db = require('../db');
const { auth } = require('../middleware/auth');
const { wrap } = require('../utils');
router.use(auth);

router.get('/', wrap(async (req, res) => {
  const [rows] = await db.query(
    `SELECT n.id, n.title, n.message, n.type, n.created_at, nr.is_read
     FROM notification_recipients nr JOIN notifications n ON n.id=nr.notification_id
     WHERE nr.user_id=? ORDER BY n.created_at DESC LIMIT 50`, [req.user.id]);
  res.json({ unread: rows.filter(r => !r.is_read).length, notifications: rows });
}));

router.post('/:id/read', wrap(async (req, res) => {
  await db.query('UPDATE notification_recipients SET is_read=1 WHERE notification_id=? AND user_id=?', [req.params.id, req.user.id]);
  res.json({ message: 'Marked as read' });
}));

module.exports = router;
