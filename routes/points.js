const express = require('express');
const { v4: uuid } = require('uuid');
const { db } = require('../db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

// Initialize point-related tables
db.exec(`
  CREATE TABLE IF NOT EXISTS attendance (
    user_id TEXT NOT NULL,
    date TEXT NOT NULL,
    PRIMARY KEY (user_id, date)
  );
  CREATE TABLE IF NOT EXISTS point_history (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    amount INTEGER NOT NULL,
    type TEXT NOT NULL,
    description TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS shop_orders (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    item_name TEXT NOT NULL,
    cost INTEGER NOT NULL,
    status TEXT DEFAULT 'completed',
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

const SHOP_ITEMS = [
  { id: 'discount-5', name: '5% 할인쿠폰', cost: 1000, category: '쿠폰', desc: '전 서비스 5% 할인 (1회 사용)', icon: 'discount' },
  { id: 'discount-10', name: '10% 할인쿠폰', cost: 2500, category: '쿠폰', desc: '전 서비스 10% 할인 (1회 사용)', icon: 'discount' },
  { id: 'discount-20', name: '20% 할인쿠폰', cost: 5000, category: '쿠폰', desc: '전 서비스 20% 할인 (1회 사용)', icon: 'discount' },
  { id: 'free-30', name: '무료 상담 30분', cost: 8000, category: '상담', desc: '원하는 전문가와 30분 무료 상담', icon: 'clock' },
  { id: 'priority', name: '프리미엄 매칭', cost: 3000, category: '서비스', desc: '7일간 우선 매칭 서비스', icon: 'star' },
  { id: 'badge-vip', name: 'VIP 뱃지 (30일)', cost: 4000, category: '서비스', desc: '프로필 VIP 뱃지 30일', icon: 'badge' },
  { id: 'starbucks-5k', name: '스타벅스 5,000원', cost: 6000, category: '기프티콘', desc: '스타벅스 5,000원 모바일 상품권', icon: 'gift' },
  { id: 'starbucks-10k', name: '스타벅스 10,000원', cost: 12000, category: '기프티콘', desc: '스타벅스 10,000원 모바일 상품권', icon: 'gift' },
  { id: 'baemin-5k', name: '배민 5,000원', cost: 6000, category: '기프티콘', desc: '배달의민족 5,000원 상품권', icon: 'gift' },
  { id: 'cgv-12k', name: 'CGV 영화관람권', cost: 14000, category: '기프티콘', desc: 'CGV 영화 1회 관람권', icon: 'gift' },
];

// GET /api/points/shop
router.get('/shop', (req, res) => {
  res.json({ items: SHOP_ITEMS });
});

// GET /api/points/balance
router.get('/balance', authRequired, (req, res) => {
  const u = db.prepare('SELECT points FROM users WHERE id = ?').get(req.user.id);
  res.json({ points: u?.points || 0 });
});

// GET /api/points/history
router.get('/history', authRequired, (req, res) => {
  const items = db.prepare('SELECT * FROM point_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(req.user.id);
  res.json({ history: items });
});

// POST /api/points/attendance
router.post('/attendance', authRequired, (req, res) => {
  const today = new Date().toISOString().substring(0, 10);
  const existing = db.prepare('SELECT 1 FROM attendance WHERE user_id = ? AND date = ?').get(req.user.id, today);
  if (existing) {
    return res.status(409).json({ error: '오늘은 이미 출석체크를 하셨어요!', already: true });
  }
  const reward = 100;
  db.prepare('INSERT INTO attendance (user_id, date) VALUES (?, ?)').run(req.user.id, today);
  db.prepare('UPDATE users SET points = points + ? WHERE id = ?').run(reward, req.user.id);
  db.prepare('INSERT INTO point_history (id, user_id, amount, type, description) VALUES (?,?,?,?,?)').run(
    uuid(), req.user.id, reward, 'attendance', `출석체크 보상 (${today})`
  );
  const u = db.prepare('SELECT points FROM users WHERE id = ?').get(req.user.id);
  res.json({ reward, balance: u.points });
});

// POST /api/points/shop/buy
router.post('/shop/buy', authRequired, (req, res) => {
  const { item_id } = req.body;
  const item = SHOP_ITEMS.find(i => i.id === item_id);
  if (!item) return res.status(404).json({ error: '상품을 찾을 수 없습니다.' });

  const u = db.prepare('SELECT points FROM users WHERE id = ?').get(req.user.id);
  if (u.points < item.cost) {
    return res.status(400).json({ error: 'G-POINT가 부족합니다.', needed: item.cost - u.points });
  }

  const buyTx = db.transaction(() => {
    db.prepare('UPDATE users SET points = points - ? WHERE id = ?').run(item.cost, req.user.id);
    db.prepare('INSERT INTO shop_orders (id, user_id, item_id, item_name, cost) VALUES (?,?,?,?,?)').run(
      uuid(), req.user.id, item.id, item.name, item.cost
    );
    db.prepare('INSERT INTO point_history (id, user_id, amount, type, description) VALUES (?,?,?,?,?)').run(
      uuid(), req.user.id, -item.cost, 'shop', `${item.name} 구매`
    );
    db.prepare('INSERT INTO notifications (id, user_id, title, body, type, ref_id) VALUES (?,?,?,?,?,?)').run(
      uuid(), req.user.id, '상품 교환 완료', `${item.name} 교환이 완료되었습니다.`, 'shop', item.id
    );
  });
  buyTx();

  const after = db.prepare('SELECT points FROM users WHERE id = ?').get(req.user.id);
  res.json({ success: true, balance: after.points, item });
});

// GET /api/points/orders
router.get('/orders', authRequired, (req, res) => {
  const orders = db.prepare('SELECT * FROM shop_orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(req.user.id);
  res.json({ orders });
});

module.exports = router;
