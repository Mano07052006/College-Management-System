// Usage: node scripts/createAdmin.js <username> <password>
const bcrypt = require('bcryptjs');
const db = require('../db');
(async () => {
  const [username, password] = process.argv.slice(2);
  if (!username || !password) { console.log('Usage: node scripts/createAdmin.js <username> <password>'); process.exit(1); }
  const hash = await bcrypt.hash(password, 10);
  await db.query("INSERT INTO users(username,password_hash,role) VALUES(?,?,'admin')", [username, hash]);
  console.log('Admin created:', username);
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
