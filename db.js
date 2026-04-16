const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');

const DB_PATH = path.join(__dirname, 'graddy.db');
const db = new Database(DB_PATH);

// Enable WAL mode and foreign keys
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ============ SCHEMA ============
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT DEFAULT '',
    role TEXT DEFAULT 'client' CHECK(role IN ('client','expert','admin')),
    profile_image TEXT DEFAULT '',
    bio TEXT DEFAULT '',
    major TEXT DEFAULT '',
    career_years INTEGER DEFAULT 0,
    verified INTEGER DEFAULT 0,
    points INTEGER DEFAULT 0,
    promo_code TEXT DEFAULT '',
    interests TEXT DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS expert_profiles (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    price_per_30min INTEGER DEFAULT 50000,
    category TEXT DEFAULT '기초연구',
    tags TEXT DEFAULT '[]',
    hashtags TEXT DEFAULT '',
    rating REAL DEFAULT 0,
    review_count INTEGER DEFAULT 0,
    order_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS packages (
    id TEXT PRIMARY KEY,
    expert_id TEXT NOT NULL,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    description TEXT DEFAULT '',
    features TEXT DEFAULT '[]',
    sort_order INTEGER DEFAULT 0,
    FOREIGN KEY (expert_id) REFERENCES expert_profiles(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS chat_rooms (
    id TEXT PRIMARY KEY,
    expert_id TEXT NOT NULL,
    client_id TEXT NOT NULL,
    product_title TEXT DEFAULT '',
    last_message TEXT DEFAULT '',
    last_message_at TEXT DEFAULT (datetime('now')),
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (expert_id) REFERENCES users(id),
    FOREIGN KEY (client_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    chat_room_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    content TEXT NOT NULL,
    msg_type TEXT DEFAULT 'text' CHECK(msg_type IN ('text','system','image','reservation')),
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (chat_room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS message_reads (
    chat_room_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    last_read_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (chat_room_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS reservations (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    expert_id TEXT NOT NULL,
    package_id TEXT,
    chat_room_id TEXT,
    type TEXT DEFAULT 'online' CHECK(type IN ('online','offline')),
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    duration INTEGER DEFAULT 30,
    location TEXT DEFAULT '',
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','confirmed','completed','cancelled')),
    price INTEGER DEFAULT 0,
    note TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (client_id) REFERENCES users(id),
    FOREIGN KEY (expert_id) REFERENCES users(id),
    FOREIGN KEY (package_id) REFERENCES packages(id)
  );

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    category TEXT DEFAULT '',
    budget TEXT DEFAULT '',
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','in_progress','completed')),
    reject_reason TEXT DEFAULT '',
    expert_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (client_id) REFERENCES users(id),
    FOREIGN KEY (expert_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    category TEXT DEFAULT '질문' CHECK(category IN ('질문','후기','스터디','자유')),
    title TEXT NOT NULL,
    body TEXT DEFAULT '',
    views INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS likes (
    user_id TEXT NOT NULL,
    post_id TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, post_id),
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS bookmarks (
    user_id TEXT NOT NULL,
    expert_id TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, expert_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (expert_id) REFERENCES expert_profiles(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS phrases (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT DEFAULT '',
    type TEXT DEFAULT 'general',
    ref_id TEXT DEFAULT '',
    is_read INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id TEXT PRIMARY KEY,
    reservation_id TEXT,
    reviewer_id TEXT NOT NULL,
    expert_id TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
    content TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (reviewer_id) REFERENCES users(id),
    FOREIGN KEY (expert_id) REFERENCES expert_profiles(id)
  );

  CREATE TABLE IF NOT EXISTS chat_stars (
    user_id TEXT NOT NULL,
    chat_room_id TEXT NOT NULL,
    PRIMARY KEY (user_id, chat_room_id)
  );
`);

// ============ SEED DATA ============
function seed() {
  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  if (userCount > 0) return; // already seeded

  const hash = bcrypt.hashSync('password123', 10);

  // Create expert users
  const experts = [
    { id: uuid(), email: 'ethan@graddy.com', name: 'Ethan Cole', major: '화학공학', career: 16, bio: '화학공학 박사, 정부지원 연구과제 다수 수행' },
    { id: uuid(), email: 'james@graddy.com', name: 'James B', major: '생명공학', career: 12, bio: '생명공학 석사, 바이오 스타트업 CTO 출신' },
    { id: uuid(), email: 'john@graddy.com', name: 'John T', major: '컴퓨터공학', career: 8, bio: 'AI/ML 전문가, 논문 50편 이상' },
    { id: uuid(), email: 'viola@graddy.com', name: 'Viola T', major: '데이터사이언스', career: 10, bio: '통계분석 전문, SPSS/R/Python' },
    { id: uuid(), email: 'nora@graddy.com', name: 'Nora K', major: '의료보건', career: 14, bio: '보건학 박사, 임상연구 전문' },
    { id: uuid(), email: 'drkim@graddy.com', name: 'Dr. Kim', major: '생명과학', career: 20, bio: '서울대 교수, Nature 게재 경력' },
  ];

  const insertUser = db.prepare(`INSERT INTO users (id, email, password_hash, name, phone, role, major, career_years, bio, verified, points) VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  const insertExpert = db.prepare(`INSERT INTO expert_profiles (id, user_id, title, description, price_per_30min, category, tags, hashtags, rating, review_count, order_count) VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  const insertPackage = db.prepare(`INSERT INTO packages (id, expert_id, name, price, description, features, sort_order) VALUES (?,?,?,?,?,?,?)`);

  const categories = ['기초연구', '응용연구', 'ICT/소프트웨어', 'AI/딥러닝', '의료/보건', '생명과학'];
  const expertIds = [];

  const seedTx = db.transaction(() => {
    experts.forEach((e, i) => {
      insertUser.run(e.id, e.email, hash, e.name, '010-1234-' + String(i).padStart(4, '0'), 'expert', e.major, e.career, e.bio, 1, 0);
      const epId = uuid();
      expertIds.push(epId);
      const cat = categories[i % categories.length];
      const tags = JSON.stringify([cat, categories[(i + 1) % categories.length]]);
      insertExpert.run(epId, e.id, '정말 쓸모있는 정부지원 페이퍼 쓰는 방법', '연구 계획서 작성부터 최종 보고서까지 체계적으로 가이드합니다. 실제 승인된 과제를 기반으로 노하우를 전수합니다.', 50000 + i * 10000, cat, tags, '#연구 #논문 #정부지원 #' + cat, 4.0 + (i % 10) * 0.1, 10 + i * 5, 20 + i * 3);

      // Packages for each expert
      insertPackage.run(uuid(), epId, 'Basic', 50000 + i * 10000, '기본 상담', JSON.stringify(['30분 화상 상담', '연구 방향 조언', '이메일 팔로업 1회']), 1);
      insertPackage.run(uuid(), epId, 'Standard', 100000 + i * 20000, '심화 상담', JSON.stringify(['60분 화상 상담', '연구계획서 리뷰', '이메일 팔로업 3회', '참고 자료 제공']), 2);
      insertPackage.run(uuid(), epId, 'Premium', 200000 + i * 30000, '프리미엄 패키지', JSON.stringify(['90분 화상 상담 2회', '연구계획서 첨삭', '무제한 이메일 팔로업', '참고 자료 제공', '최종 보고서 리뷰']), 3);
    });

    // Create client users
    const client1Id = uuid();
    const client2Id = uuid();
    insertUser.run(client1Id, 'user@graddy.com', hash, '홍길동', '010-9999-0001', 'client', '', 0, '', 0, 15000);
    insertUser.run(client2Id, 'test@graddy.com', hash, '김연구', '010-9999-0002', 'client', '', 0, '', 0, 8000);

    // Chat rooms
    const chatInsert = db.prepare(`INSERT INTO chat_rooms (id, expert_id, client_id, product_title, last_message, last_message_at) VALUES (?,?,?,?,?,?)`);
    const msgInsert = db.prepare(`INSERT INTO messages (id, chat_room_id, sender_id, content, msg_type, created_at) VALUES (?,?,?,?,?,?)`);

    const cr1 = uuid();
    chatInsert.run(cr1, experts[0].id, client1Id, '정말 쓸모있는 정부지원 페이퍼 쓰는 방법', '예약시간이 다가왔습니다.', datetime(-1));
    msgInsert.run(uuid(), cr1, 'system', '채팅방이 생성되었습니다.', 'system', datetime(-60 * 24));
    msgInsert.run(uuid(), cr1, experts[0].id, '안녕하세요! 문의사항이 있으시면 편하게 말씀해 주세요.', 'text', datetime(-60 * 23));
    msgInsert.run(uuid(), cr1, client1Id, '안녕하세요, 정부지원 연구과제 관련해서 상담받고 싶습니다.', 'text', datetime(-60 * 22));
    msgInsert.run(uuid(), cr1, experts[0].id, '네, 어떤 분야의 연구과제를 준비하고 계신가요?', 'text', datetime(-60 * 20));
    msgInsert.run(uuid(), cr1, client1Id, '화학공학 분야 기초연구입니다. 연구계획서 작성에 도움이 필요합니다.', 'text', datetime(-30));
    msgInsert.run(uuid(), cr1, 'system', '예약시간이 다가왔습니다.', 'system', datetime(-1));

    const cr2 = uuid();
    chatInsert.run(cr2, experts[1].id, client1Id, '바이오 연구 컨설팅', '네, 확인하겠습니다.', datetime(-60));
    msgInsert.run(uuid(), cr2, experts[1].id, '바이오 연구 관련 문의 감사합니다.', 'text', datetime(-120));
    msgInsert.run(uuid(), cr2, client1Id, '생명공학 실험 설계 도움 요청드립니다.', 'text', datetime(-90));
    msgInsert.run(uuid(), cr2, experts[1].id, '네, 확인하겠습니다.', 'text', datetime(-60));

    // Graddy system chat
    const cr3 = uuid();
    chatInsert.run(cr3, experts[0].id, client1Id, 'Graddy 공지', '공지사항입니다. 시스템점검 시간이 안내드립니다.', datetime(-60 * 24));
    msgInsert.run(uuid(), cr3, 'system', '공지사항입니다. 시스템점검 시간이 안내드립니다.', 'system', datetime(-60 * 24));

    // Star a chat
    db.prepare('INSERT INTO chat_stars (user_id, chat_room_id) VALUES (?,?)').run(client1Id, cr1);

    // Reservations
    const resInsert = db.prepare(`INSERT INTO reservations (id, client_id, expert_id, package_id, chat_room_id, type, date, time, duration, location, status, price, note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    resInsert.run(uuid(), client1Id, experts[0].id, null, cr1, 'online', '2026-04-20', '14:00', 30, 'Zoom', 'confirmed', 50000, '정부지원 연구과제 상담');
    resInsert.run(uuid(), client1Id, experts[1].id, null, cr2, 'offline', '2026-04-22', '10:00', 60, '서울 강남구 테헤란로 123', 'pending', 120000, '바이오 실험 설계');
    resInsert.run(uuid(), client1Id, experts[2].id, null, null, 'online', '2026-03-15', '16:00', 30, 'Google Meet', 'completed', 60000, 'AI 모델 리뷰');

    // Projects
    const prjInsert = db.prepare(`INSERT INTO projects (id, client_id, title, description, category, budget, status, reject_reason, expert_id) VALUES (?,?,?,?,?,?,?,?,?)`);
    prjInsert.run(uuid(), client1Id, '정부지원 연구과제 계획서 작성', '2026년 상반기 정부지원 연구과제 신청을 위한 연구계획서 작성 도움 필요', '기초연구', '500,000원', 'approved', '', experts[0].id);
    prjInsert.run(uuid(), client1Id, 'AI 기반 신약 개발 데이터 분석', '딥러닝을 활용한 신약 후보물질 스크리닝 프로젝트', 'AI/딥러닝', '1,200,000원', 'in_progress', '', experts[2].id);
    prjInsert.run(uuid(), client1Id, '임상시험 통계분석', '3상 임상시험 데이터 통계 분석', '의료/보건', '800,000원', 'pending', '', null);
    prjInsert.run(uuid(), client2Id, '논문 번역 및 교정', '영문 논문 한국어 번역 및 교정 작업', '기초연구', '300,000원', 'rejected', '현재 해당 분야 전문가 매칭이 어렵습니다. 카테고리를 조정하여 재등록해 주세요.', null);

    // Community posts
    const postInsert = db.prepare(`INSERT INTO posts (id, user_id, category, title, body, views, created_at) VALUES (?,?,?,?,?,?,?)`);
    const commentInsert = db.prepare(`INSERT INTO comments (id, post_id, user_id, content, created_at) VALUES (?,?,?,?,?)`);

    const p1 = uuid();
    postInsert.run(p1, client1Id, '질문', '연구계획서 주제 선정 어떻게 하세요?', '석사 1학기입니다. 주제를 좁히는 과정에서 교수님과 의견이 잘 안맞는데 다른 분들은 어떻게 주제를 정하셨나요? 선행연구 조사 방법도 공유해주시면 감사하겠습니다.', 128, datetime(-120));
    commentInsert.run(uuid(), p1, client2Id, '저도 같은 고민이었는데, 교수님께 3개 정도 후보를 드리고 선택받는 방식이 좋았어요.', datetime(-60));
    commentInsert.run(uuid(), p1, experts[0].id, '선행연구는 Google Scholar에서 키워드 검색 후, 인용수 높은 논문부터 읽어보시는 걸 추천드립니다.', datetime(-30));

    const p2 = uuid();
    postInsert.run(p2, client2Id, '후기', 'Ethan Cole 선생님께 정부지원 컨설팅 받은 후기', '정말 상세하고 친절하게 방향 잡아주셔서 큰 도움이 됐어요. 연구계획서 구조부터 예산 편성까지 하나하나 설명해주셨습니다. 추천합니다!', 342, datetime(-60 * 24));
    commentInsert.run(uuid(), p2, client1Id, '저도 예약 잡으려고요! 어떤 패키지 선택하셨어요?', datetime(-60 * 12));

    const p3 = uuid();
    postInsert.run(p3, client1Id, '스터디', '통계분석 SPSS 스터디원 모집 (3/4)', '매주 토요일 오프라인(강남) + 온라인 병행. 초보환영! SPSS 기초부터 고급 분석까지 함께 공부해요.', 210, datetime(-60 * 72));

    // Bookmarks
    db.prepare('INSERT INTO bookmarks (user_id, expert_id) VALUES (?,?)').run(client1Id, expertIds[0]);
    db.prepare('INSERT INTO bookmarks (user_id, expert_id) VALUES (?,?)').run(client1Id, expertIds[1]);
    db.prepare('INSERT INTO bookmarks (user_id, expert_id) VALUES (?,?)').run(client1Id, expertIds[3]);

    // Phrases
    const phraseInsert = db.prepare('INSERT INTO phrases (id, user_id, text) VALUES (?,?,?)');
    phraseInsert.run(uuid(), client1Id, '안녕하세요, 문의드립니다.');
    phraseInsert.run(uuid(), client1Id, '감사합니다. 확인하겠습니다.');
    phraseInsert.run(uuid(), client1Id, '빠르고 좋습니다 굿굿');
    phraseInsert.run(uuid(), client1Id, '예약 변경 가능할까요?');

    // Notifications
    const notiInsert = db.prepare('INSERT INTO notifications (id, user_id, title, body, type, ref_id, is_read, created_at) VALUES (?,?,?,?,?,?,?,?)');
    notiInsert.run(uuid(), client1Id, '예약 확정', 'Ethan Cole 전문가와의 상담 예약이 확정되었습니다.', 'reservation', '', 0, datetime(-30));
    notiInsert.run(uuid(), client1Id, '새 메시지', 'Ethan Cole님이 메시지를 보냈습니다.', 'chat', cr1, 0, datetime(-10));
    notiInsert.run(uuid(), client1Id, '프로젝트 승인', '정부지원 연구과제 계획서 작성 프로젝트가 승인되었습니다.', 'project', '', 1, datetime(-60 * 48));

    // Reviews
    const reviewInsert = db.prepare('INSERT INTO reviews (id, reservation_id, reviewer_id, expert_id, rating, content, created_at) VALUES (?,?,?,?,?,?,?)');
    reviewInsert.run(uuid(), null, client1Id, expertIds[0], 5, '정말 친절하고 상세하게 설명해주셨습니다. 연구계획서 구조를 완전히 새로 잡을 수 있었어요.', datetime(-60 * 24 * 7));
    reviewInsert.run(uuid(), null, client2Id, expertIds[0], 4, '전반적으로 만족스러웠습니다. 다만 시간이 조금 부족했어요.', datetime(-60 * 24 * 14));
    reviewInsert.run(uuid(), null, client1Id, expertIds[1], 5, '바이오 분야 전문성이 뛰어나십니다. 재상담 예정입니다.', datetime(-60 * 24 * 5));
    reviewInsert.run(uuid(), null, client2Id, expertIds[2], 4, 'AI 모델 설계에 대한 조언이 실질적이었습니다.', datetime(-60 * 24 * 3));

    // Likes
    db.prepare('INSERT INTO likes (user_id, post_id) VALUES (?,?)').run(client1Id, p2);
    db.prepare('INSERT INTO likes (user_id, post_id) VALUES (?,?)').run(client2Id, p1);
  });

  seedTx();
  console.log('Database seeded successfully');
}

function datetime(minutesAgo) {
  const d = new Date(Date.now() - minutesAgo * 60000);
  return d.toISOString().replace('T', ' ').substring(0, 19);
}

module.exports = { db, seed };
