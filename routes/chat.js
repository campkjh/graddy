const express = require('express');
const { v4: uuid } = require('uuid');
const { db } = require('../db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

// GET /api/chat/rooms - list chat rooms
router.get('/rooms', authRequired, (req, res) => {
  const { filter } = req.query; // all, starred
  const userId = req.user.id;

  let rooms = db.prepare(`
    SELECT cr.*,
      CASE WHEN cr.expert_id = ? THEN cu.name ELSE eu.name END as other_name,
      CASE WHEN cr.expert_id = ? THEN cu.profile_image ELSE eu.profile_image END as other_image,
      CASE WHEN cr.expert_id = ? THEN cr.client_id ELSE cr.expert_id END as other_id,
      eu.name as expert_name,
      (SELECT COUNT(*) FROM messages m WHERE m.chat_room_id = cr.id
        AND m.created_at > COALESCE((SELECT last_read_at FROM message_reads WHERE chat_room_id = cr.id AND user_id = ?), '2000-01-01')
        AND m.sender_id != ?
      ) as unread_count,
      CASE WHEN cs.user_id IS NOT NULL THEN 1 ELSE 0 END as is_starred
    FROM chat_rooms cr
    JOIN users eu ON cr.expert_id = eu.id
    JOIN users cu ON cr.client_id = cu.id
    LEFT JOIN chat_stars cs ON cs.chat_room_id = cr.id AND cs.user_id = ?
    WHERE cr.expert_id = ? OR cr.client_id = ?
    ORDER BY cr.last_message_at DESC
  `).all(userId, userId, userId, userId, userId, userId, userId, userId);

  if (filter === 'starred') {
    rooms = rooms.filter(r => r.is_starred);
  }

  res.json({ rooms });
});

// POST /api/chat/rooms - create or get chat room
router.post('/rooms', authRequired, (req, res) => {
  const { expert_user_id, product_title } = req.body;
  const clientId = req.user.id;

  // Check if room already exists
  let room = db.prepare('SELECT * FROM chat_rooms WHERE expert_id = ? AND client_id = ?').get(expert_user_id, clientId);
  if (!room) {
    const id = uuid();
    db.prepare('INSERT INTO chat_rooms (id, expert_id, client_id, product_title) VALUES (?,?,?,?)').run(id, expert_user_id, clientId, product_title || '');
    // System message
    db.prepare('INSERT INTO messages (id, chat_room_id, sender_id, content, msg_type) VALUES (?,?,?,?,?)').run(uuid(), id, 'system', '채팅방이 생성되었습니다.', 'system');
    room = db.prepare('SELECT * FROM chat_rooms WHERE id = ?').get(id);
  }
  res.json({ room });
});

// GET /api/chat/rooms/:id/messages
router.get('/rooms/:id/messages', authRequired, (req, res) => {
  const { before, limit = 50 } = req.query;
  const roomId = req.params.id;

  // Verify user is in this room
  const room = db.prepare('SELECT * FROM chat_rooms WHERE id = ? AND (expert_id = ? OR client_id = ?)').get(roomId, req.user.id, req.user.id);
  if (!room) return res.status(403).json({ error: '접근 권한이 없습니다.' });

  let messages;
  if (before) {
    messages = db.prepare('SELECT m.*, u.name as sender_name FROM messages m LEFT JOIN users u ON m.sender_id = u.id WHERE m.chat_room_id = ? AND m.created_at < ? ORDER BY m.created_at DESC LIMIT ?').all(roomId, before, Number(limit));
  } else {
    messages = db.prepare('SELECT m.*, u.name as sender_name FROM messages m LEFT JOIN users u ON m.sender_id = u.id WHERE m.chat_room_id = ? ORDER BY m.created_at DESC LIMIT ?').all(roomId, Number(limit));
  }

  // Mark as read
  db.prepare(`INSERT OR REPLACE INTO message_reads (chat_room_id, user_id, last_read_at) VALUES (?, ?, datetime('now'))`).run(roomId, req.user.id);

  // Room info
  const expert = db.prepare('SELECT u.name, u.profile_image FROM users u WHERE u.id = ?').get(room.expert_id);
  const client = db.prepare('SELECT u.name, u.profile_image FROM users u WHERE u.id = ?').get(room.client_id);

  res.json({ messages: messages.reverse(), room, expert, client });
});

// POST /api/chat/rooms/:id/messages - send message
router.post('/rooms/:id/messages', authRequired, (req, res) => {
  const { content, msg_type = 'text' } = req.body;
  const roomId = req.params.id;

  const room = db.prepare('SELECT * FROM chat_rooms WHERE id = ? AND (expert_id = ? OR client_id = ?)').get(roomId, req.user.id, req.user.id);
  if (!room) return res.status(403).json({ error: '접근 권한이 없습니다.' });
  if (!content || !content.trim()) return res.status(400).json({ error: '메시지를 입력해주세요.' });

  const msgId = uuid();
  db.prepare('INSERT INTO messages (id, chat_room_id, sender_id, content, msg_type) VALUES (?,?,?,?,?)').run(msgId, roomId, req.user.id, content.trim(), msg_type);
  db.prepare(`UPDATE chat_rooms SET last_message = ?, last_message_at = datetime('now') WHERE id = ?`).run(content.trim(), roomId);
  db.prepare(`INSERT OR REPLACE INTO message_reads (chat_room_id, user_id, last_read_at) VALUES (?, ?, datetime('now'))`).run(roomId, req.user.id);

  const msg = db.prepare('SELECT m.*, u.name as sender_name FROM messages m LEFT JOIN users u ON m.sender_id = u.id WHERE m.id = ?').get(msgId);

  // Emit via socket.io if available
  if (req.app.io) {
    req.app.io.to('room:' + roomId).emit('new_message', msg);
  }

  // Create notification for other user
  const otherId = room.expert_id === req.user.id ? room.client_id : room.expert_id;
  const senderName = db.prepare('SELECT name FROM users WHERE id = ?').get(req.user.id)?.name || '알 수 없음';
  db.prepare('INSERT INTO notifications (id, user_id, title, body, type, ref_id) VALUES (?,?,?,?,?,?)').run(
    uuid(), otherId, '새 메시지', `${senderName}님이 메시지를 보냈습니다.`, 'chat', roomId
  );

  res.json({ message: msg });
});

// POST /api/chat/rooms/:id/star - toggle star
router.post('/rooms/:id/star', authRequired, (req, res) => {
  const roomId = req.params.id;
  const existing = db.prepare('SELECT 1 FROM chat_stars WHERE user_id = ? AND chat_room_id = ?').get(req.user.id, roomId);
  if (existing) {
    db.prepare('DELETE FROM chat_stars WHERE user_id = ? AND chat_room_id = ?').run(req.user.id, roomId);
    res.json({ starred: false });
  } else {
    db.prepare('INSERT INTO chat_stars (user_id, chat_room_id) VALUES (?,?)').run(req.user.id, roomId);
    res.json({ starred: true });
  }
});

module.exports = router;
