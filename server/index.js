require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const {
  DB_HOST = 'localhost',
  DB_PORT = 3306,
  DB_USER = 'root',
  DB_PASSWORD = '',
  DB_NAME = 'moyeo_20519',
  JWT_SECRET = 'moyeo-dev-secret',
  PORT = 3001,
} = process.env;

const CHANNELS = ['일반', '잡담', '질문', '공지'];
let db;

// DB와 테이블이 없으면 자동 생성 → 실습실 PC에서 mysql만 켜면 바로 실행됨
async function initDb() {
  const base = { host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASSWORD };
  const conn = await mysql.createConnection(base);
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` DEFAULT CHARACTER SET utf8mb4`);
  await conn.end();

  db = mysql.createPool({ ...base, database: DB_NAME });
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(20) NOT NULL UNIQUE,
      password VARCHAR(100) NOT NULL,
      nickname VARCHAR(20) NOT NULL,
      status_msg VARCHAR(100) NOT NULL DEFAULT '',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
  await db.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      channel VARCHAR(20) NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);
}

const app = express();
app.use(express.json());

const fail = (res, code, error) => res.status(code).json({ error });
const sign = (id) => jwt.sign({ id }, JWT_SECRET, { expiresIn: '7d' });
const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// 로그인 필수 미들웨어
function auth(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    req.userId = jwt.verify(token, JWT_SECRET).id;
    next();
  } catch {
    fail(res, 401, '로그인이 필요합니다.');
  }
}

const PROFILE = 'id, username, nickname, status_msg, created_at';

/* ───────── 회원 관리 (users) ───────── */

// Create: 회원가입 (bcrypt 암호화)
app.post('/api/signup', async (req, res) => {
  const username = clean(req.body.username, 20);
  const nickname = clean(req.body.nickname, 20);
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) return fail(res, 400, '아이디는 영문/숫자/_ 3~20자입니다.');
  if (password.length < 4) return fail(res, 400, '비밀번호는 4자 이상입니다.');
  if (!nickname) return fail(res, 400, '닉네임을 입력하세요.');
  try {
    const hash = await bcrypt.hash(password, 10);
    const [r] = await db.query('INSERT INTO users (username, password, nickname) VALUES (?, ?, ?)', [username, hash, nickname]);
    res.json({ token: sign(r.insertId) });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return fail(res, 409, '이미 사용 중인 아이디입니다.');
    throw e;
  }
});

// Read: 로그인
app.post('/api/login', async (req, res) => {
  const [[user]] = await db.query('SELECT id, password FROM users WHERE username = ?', [clean(req.body.username, 20)]);
  if (!user || !(await bcrypt.compare(String(req.body.password || ''), user.password)))
    return fail(res, 401, '아이디 또는 비밀번호가 올바르지 않습니다.');
  res.json({ token: sign(user.id) });
});

// Read: 내 프로필 조회
app.get('/api/me', auth, async (req, res) => {
  const [[user]] = await db.query(`SELECT ${PROFILE} FROM users WHERE id = ?`, [req.userId]);
  if (!user) return fail(res, 401, '존재하지 않는 회원입니다.');
  res.json(user);
});

// Update: 프로필 수정 (비밀번호는 입력했을 때만 변경)
app.put('/api/me', auth, async (req, res) => {
  const nickname = clean(req.body.nickname, 20);
  const statusMsg = clean(req.body.status_msg, 100);
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!nickname) return fail(res, 400, '닉네임을 입력하세요.');
  if (password && password.length < 4) return fail(res, 400, '비밀번호는 4자 이상입니다.');
  await db.query('UPDATE users SET nickname = ?, status_msg = ? WHERE id = ?', [nickname, statusMsg, req.userId]);
  if (password) await db.query('UPDATE users SET password = ? WHERE id = ?', [await bcrypt.hash(password, 10), req.userId]);
  const [[user]] = await db.query(`SELECT ${PROFILE} FROM users WHERE id = ?`, [req.userId]);
  res.json(user);
});

// Delete: 회원 탈퇴 (작성한 메시지는 FK CASCADE 로 함께 삭제)
app.delete('/api/me', auth, async (req, res) => {
  await db.query('DELETE FROM users WHERE id = ?', [req.userId]);
  res.json({ ok: true });
});

/* ───────── 핵심 데이터: 메시지 (messages) ───────── */

// Read: 전체 조회 — 로그인 없이도 가능, users 와 JOIN (조인 결과 ①)
app.get('/api/messages', async (req, res) => {
  const [rows] = await db.query(
    `SELECT m.id, m.user_id, m.channel, m.content, m.created_at, m.updated_at,
            u.nickname, u.username, u.status_msg
       FROM messages m
       JOIN users u ON u.id = m.user_id
      WHERE m.channel = ?
      ORDER BY m.id`,
    [String(req.query.channel || CHANNELS[0])]
  );
  res.json(rows);
});

// Create: 로그인 상태에서만 작성
app.post('/api/messages', auth, async (req, res) => {
  const content = clean(req.body.content, 2000);
  if (!CHANNELS.includes(req.body.channel)) return fail(res, 400, '없는 채널입니다.');
  if (!content) return fail(res, 400, '내용을 입력하세요.');
  const [[user]] = await db.query('SELECT id FROM users WHERE id = ?', [req.userId]);
  if (!user) return fail(res, 401, '존재하지 않는 회원입니다.');
  await db.query('INSERT INTO messages (user_id, channel, content) VALUES (?, ?, ?)', [req.userId, req.body.channel, content]);
  res.json({ ok: true });
});

// Update: 본인 글만 (WHERE user_id 로 소유자 검사)
app.put('/api/messages/:id', auth, async (req, res) => {
  const content = clean(req.body.content, 2000);
  if (!content) return fail(res, 400, '내용을 입력하세요.');
  const [r] = await db.query('UPDATE messages SET content = ?, updated_at = NOW() WHERE id = ? AND user_id = ?', [content, req.params.id, req.userId]);
  if (!r.affectedRows) return fail(res, 403, '본인이 작성한 메시지만 수정할 수 있습니다.');
  res.json({ ok: true });
});

// Delete: 본인 글만
app.delete('/api/messages/:id', auth, async (req, res) => {
  const [r] = await db.query('DELETE FROM messages WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
  if (!r.affectedRows) return fail(res, 403, '본인이 작성한 메시지만 삭제할 수 있습니다.');
  res.json({ ok: true });
});

/* ───────── JOIN 조회 메뉴: 멤버별 활동 (조인 결과 ②) ───────── */
app.get('/api/members', async (req, res) => {
  const [rows] = await db.query(
    `SELECT u.id, u.username, u.nickname, u.status_msg, u.created_at,
            COUNT(m.id) AS message_count, MAX(m.created_at) AS last_message_at
       FROM users u
       LEFT JOIN messages m ON m.user_id = u.id
      GROUP BY u.id
      ORDER BY message_count DESC, u.id`
  );
  res.json(rows);
});

app.get('/api/channels', (req, res) => res.json(CHANNELS));

app.use((err, req, res, next) => {
  console.error(err);
  fail(res, 500, '서버 오류가 발생했습니다.');
});

initDb()
  .then(() => app.listen(PORT, () => console.log(`모여 서버 실행 중: http://localhost:${PORT} (DB: ${DB_NAME})`)))
  .catch((e) => {
    console.error('DB 연결 실패 — mysql 서버가 켜져 있는지, server/.env 설정이 맞는지 확인하세요.\n', e.message);
    process.exit(1);
  });
