require('dotenv').config();
const express = require('express');
const path = require('path');
const rateLimit = require('express-rate-limit');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 30, message: { error: 'Too many login attempts, try later' } }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api', require('./routes/lookup'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/resources', require('./routes/resources'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api', require('./routes/announcements')); // /circulars and /exams

app.listen(process.env.PORT || 3000, () => console.log('ICAM-SIS running on port ' + (process.env.PORT || 3000)));
