const express = require('express');
const { v4: uuid } = require('uuid');
const { db } = require('../db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

// GET /api/reservations
router.get('/', authRequired, (req, res) => {
  const { status } = req.query;
  let where = '(r.client_id = ? OR r.expert_id = ?)';
  const params = [req.user.id, req.user.id];
  if (status) {
    where += ' AND r.status = ?';
    params.push(status);
  }
  const reservations = db.prepare(`
    SELECT r.*,
      eu.name as expert_name, eu.profile_image as expert_image, eu.major as expert_major,
      cu.name as client_name,
      ep.title as product_title
    FROM reservations r
    JOIN users eu ON r.expert_id = eu.id
    JOIN users cu ON r.client_id = cu.id
    LEFT JOIN expert_profiles ep ON ep.user_id = r.expert_id
    WHERE ${where}
    ORDER BY r.date DESC, r.time DESC
  `).all(...params);
  res.json({ reservations });
});

// POST /api/reservations
router.post('/', authRequired, (req, res) => {
  const { expert_id, package_id, type, date, time, duration, location, note, price } = req.body;
  if (!expert_id || !date || !time) {
    return res.status(400).json({ error: '필수 항목을 입력해주세요.' });
  }

  // Find or create chat room
  const expert = db.prepare('SELECT id FROM users WHERE id = ?').get(expert_id);
  if (!expert) return res.status(404).json({ error: '전문가를 찾을 수 없습니다.' });

  let chatRoom = db.prepare('SELECT id FROM chat_rooms WHERE expert_id = ? AND client_id = ?').get(expert_id, req.user.id);
  if (!chatRoom) {
    const crId = uuid();
    db.prepare('INSERT INTO chat_rooms (id, expert_id, client_id, product_title) VALUES (?,?,?,?)').run(crId, expert_id, req.user.id, '');
    chatRoom = { id: crId };
  }

  const id = uuid();
  db.prepare(`INSERT INTO reservations (id, client_id, expert_id, package_id, chat_room_id, type, date, time, duration, location, status, price, note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, req.user.id, expert_id, package_id || null, chatRoom.id, type || 'online', date, time, duration || 30, location || '', 'pending', price || 0, note || ''
  );

  // System message in chat
  db.prepare('INSERT INTO messages (id, chat_room_id, sender_id, content, msg_type) VALUES (?,?,?,?,?)').run(
    uuid(), chatRoom.id, 'system', `예약이 요청되었습니다. (${date} ${time}, ${type === 'offline' ? '오프라인' : '온라인'})`, 'reservation'
  );
  db.prepare(`UPDATE chat_rooms SET last_message = ?, last_message_at = datetime('now') WHERE id = ?`).run('예약이 요청되었습니다.', chatRoom.id);

  // Notification to expert
  const clientName = db.prepare('SELECT name FROM users WHERE id = ?').get(req.user.id)?.name;
  db.prepare('INSERT INTO notifications (id, user_id, title, body, type, ref_id) VALUES (?,?,?,?,?,?)').run(
    uuid(), expert_id, '새 예약 요청', `${clientName}님이 예약을 요청했습니다. (${date} ${time})`, 'reservation', id
  );

  const reservation = db.prepare('SELECT * FROM reservations WHERE id = ?').get(id);
  res.json({ reservation });
});

// PUT /api/reservations/:id/status
router.put('/:id/status', authRequired, (req, res) => {
  const { status } = req.body;
  if (!['confirmed', 'cancelled', 'completed'].includes(status)) {
    return res.status(400).json({ error: '유효하지 않은 상태입니다.' });
  }
  const resv = db.prepare('SELECT * FROM reservations WHERE id = ?').get(req.params.id);
  if (!resv) return res.status(404).json({ error: '예약을 찾을 수 없습니다.' });
  if (resv.client_id !== req.user.id && resv.expert_id !== req.user.id) {
    return res.status(403).json({ error: '권한이 없습니다.' });
  }

  db.prepare('UPDATE reservations SET status = ? WHERE id = ?').run(status, req.params.id);

  // Notification
  const otherId = resv.expert_id === req.user.id ? resv.client_id : resv.expert_id;
  const statusKr = { confirmed: '확정', cancelled: '취소', completed: '완료' }[status];
  db.prepare('INSERT INTO notifications (id, user_id, title, body, type, ref_id) VALUES (?,?,?,?,?,?)').run(
    uuid(), otherId, `예약 ${statusKr}`, `예약이 ${statusKr}되었습니다. (${resv.date} ${resv.time})`, 'reservation', req.params.id
  );

  if (resv.chat_room_id) {
    db.prepare('INSERT INTO messages (id, chat_room_id, sender_id, content, msg_type) VALUES (?,?,?,?,?)').run(
      uuid(), resv.chat_room_id, 'system', `예약이 ${statusKr}되었습니다.`, 'system'
    );
  }

  res.json({ success: true, status });
});

module.exports = router;
