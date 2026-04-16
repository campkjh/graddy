const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const { db } = require('../db');
const { generateToken, authRequired } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/signup
router.post('/signup', (req, res) => {
  const { email, password, name, phone, interests, promo_code } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: '이메일, 비밀번호, 이름은 필수입니다.' });
  }
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (exists) {
    return res.status(409).json({ error: '이미 가입된 이메일입니다.' });
  }
  const id = uuid();
  const password_hash = bcrypt.hashSync(password, 10);
  db.prepare(`INSERT INTO users (id, email, password_hash, name, phone, interests, promo_code, points) VALUES (?,?,?,?,?,?,?,?)`).run(
    id, email, password_hash, name, phone || '', JSON.stringify(interests || []), promo_code || '', promo_code ? 5000 : 0
  );
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  const token = generateToken(user);
  res.json({ token, user: sanitizeUser(user) });
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: '이메일과 비밀번호를 입력해주세요.' });
  }
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
  }
  const token = generateToken(user);
  res.json({ token, user: sanitizeUser(user) });
});

// GET /api/auth/me
router.get('/me', authRequired, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
  res.json({ user: sanitizeUser(user) });
});

// PUT /api/auth/me
router.put('/me', authRequired, (req, res) => {
  const { name, phone, bio, major, career_years, profile_image } = req.body;
  const updates = [];
  const params = [];
  if (name !== undefined) { updates.push('name = ?'); params.push(name); }
  if (phone !== undefined) { updates.push('phone = ?'); params.push(phone); }
  if (bio !== undefined) { updates.push('bio = ?'); params.push(bio); }
  if (major !== undefined) { updates.push('major = ?'); params.push(major); }
  if (career_years !== undefined) { updates.push('career_years = ?'); params.push(career_years); }
  if (profile_image !== undefined) { updates.push('profile_image = ?'); params.push(profile_image); }
  if (updates.length === 0) return res.status(400).json({ error: '수정할 항목이 없습니다.' });
  params.push(req.user.id);
  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: sanitizeUser(user) });
});

// POST /api/auth/check-email
router.post('/check-email', (req, res) => {
  const { email } = req.body;
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  res.json({ available: !exists });
});

function sanitizeUser(u) {
  const { password_hash, ...rest } = u;
  rest.interests = JSON.parse(rest.interests || '[]');
  return rest;
}

module.exports = router;
