// server.js — เว็บเซิร์ฟเวอร์สภานักเรียนโรงเรียนร้องกวางอนุสรณ์
// เขียนด้วย Node.js core modules ล้วน ๆ (ไม่ต้อง npm install) รันด้วย: node server.js
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const db = require('./db');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 ชั่วโมง

// ---------- เก็บ session แอดมินไว้ในหน่วยความจำ ----------
const sessions = new Map(); // token -> expiresAt(ms)

function makeSession() {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  return token;
}
function isValidSession(token) {
  if (!token) return false;
  const exp = sessions.get(token);
  if (!exp) return false;
  if (Date.now() > exp) { sessions.delete(token); return false; }
  return true;
}

// ---------- ยูทิลิตี ----------
function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  header.split(';').forEach(pair => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    out[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
  });
  return out;
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 2 * 1024 * 1024) { reject(new Error('payload too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function nowThai() {
  const d = new Date();
  return d.toISOString();
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
};

function serveStatic(req, res, pathname) {
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.normalize(filePath).replace(/^(\.\.[/\\])+/, '');
  const full = path.join(PUBLIC_DIR, filePath);
  if (!full.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(full, (err, data) => {
    if (err) {
      // ลองเติม .html เผื่อเข้าแบบไม่ใส่นามสกุล เช่น /vote -> /vote.html
      fs.readFile(full + '.html', (err2, data2) => {
        if (err2) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('ไม่พบหน้านี้ (404)'); return; }
        res.writeHead(200, { 'Content-Type': MIME['.html'] });
        res.end(data2);
      });
      return;
    }
    const ext = path.extname(full);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

// ---------- ตรรกะการประเมินสภาพจิตใจ ----------
// คำถาม 10 ข้อ คะแนน 1-5 ต่อข้อ รวม 10-50 คะแนน
// ระดับ 1 (คะแนนน้อย) = สบายใจดี ... ระดับ 5 (คะแนนมาก) = ควรได้รับการดูแลเป็นพิเศษ
function evaluateSurvey(answers) {
  const score = answers.reduce((sum, v) => sum + Number(v || 0), 0);
  let level, label, advice;
  if (score <= 18) {
    level = 1; label = 'สบายใจดี';
    advice = 'ตอนนี้สภาพจิตใจของนักเรียนอยู่ในเกณฑ์ดีมาก ให้รักษาสมดุลระหว่างการเรียน การพักผ่อน และกิจกรรมที่ชอบต่อไป';
  } else if (score <= 26) {
    level = 2; label = 'ดี';
    advice = 'โดยรวมสภาพจิตใจอยู่ในเกณฑ์ดี ลองหาเวลาทำกิจกรรมที่ผ่อนคลายเพิ่มขึ้น และพูดคุยกับเพื่อนหรือครอบครัวสม่ำเสมอ';
  } else if (score <= 34) {
    level = 3; label = 'ปานกลาง';
    advice = 'มีความเครียดอยู่บ้าง แนะนำให้จัดตารางเวลาการเรียน-พักผ่อนให้สมดุลมากขึ้น และลองปรึกษาเพื่อนสนิทหรือคุณครูที่ไว้ใจ';
  } else if (score <= 42) {
    level = 4; label = 'ควรเฝ้าระวัง';
    advice = 'ควรเฝ้าระวังความเครียดหรือความกังวลที่สะสม แนะนำให้พูดคุยกับครูแนะแนวหรือผู้ปกครองเพื่อขอคำแนะนำเพิ่มเติมโดยเร็ว';
  } else {
    level = 5; label = 'ควรได้รับการดูแลเป็นพิเศษ';
    advice = 'ผลการประเมินบ่งชี้ว่าควรได้รับการดูแลเป็นพิเศษ ขอแนะนำให้พูดคุยกับครูแนะแนว นักจิตวิทยาโรงเรียน หรือผู้ปกครองโดยเร็วที่สุด การขอความช่วยเหลือเป็นเรื่องปกติและเป็นก้าวที่ดีเสมอ';
  }
  return { score, level, label, advice };
}

const SURVEY_QUESTIONS = [
  'ฉันรู้สึกเครียดกับการเรียนในช่วงนี้',
  'ฉันนอนหลับได้ไม่เพียงพอหรือหลับไม่สนิท',
  'ฉันรู้สึกกังวลเกี่ยวกับอนาคตหรือผลการเรียน',
  'ฉันรู้สึกเหนื่อยล้าหรือหมดพลังงานบ่อยครั้ง',
  'ฉันรู้สึกโดดเดี่ยวหรือไม่มีใครเข้าใจ',
  'ฉันมีปัญหาในการจดจ่อกับสิ่งที่ทำอยู่',
  'ฉันรู้สึกกดดันจากความคาดหวังของคนรอบข้าง',
  'ฉันหงุดหงิดหรืออารมณ์แปรปรวนง่ายกว่าปกติ',
  'ฉันรู้สึกไม่อยากไปโรงเรียนหรือทำกิจกรรมที่เคยชอบ',
  'ฉันรู้สึกว่าไม่มีใครที่สามารถพูดคุยหรือขอความช่วยเหลือได้เมื่อมีปัญหา',
];

// ---------- เราเตอร์หลัก ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = url;

  try {
    // ---------- API: คำถามแบบสำรวจ ----------
    if (pathname === '/api/survey/questions' && req.method === 'GET') {
      return sendJson(res, 200, { questions: SURVEY_QUESTIONS });
    }

    // ---------- API: โหวตกิจกรรม (intex2) ----------
    if (pathname === '/api/vote' && req.method === 'POST') {
      const b = await readJsonBody(req);
      if (!b.activity || !b.satisfaction) return sendJson(res, 400, { error: 'กรุณาเลือกกิจกรรมและระดับความชอบ' });
      db.prepare(`INSERT INTO votes (name, no, class, student_id, activity, satisfaction, suggestion, created_at)
                  VALUES (?,?,?,?,?,?,?,?)`)
        .run(b.name || '', b.no || '', b.class || '', b.studentId || '', b.activity, Number(b.satisfaction), b.suggestion || '', nowThai());
      return sendJson(res, 200, { ok: true });
    }
    if (pathname === '/api/votes' && req.method === 'GET') {
      if (!isValidSession(parseCookies(req).sid)) return sendJson(res, 401, { error: 'unauthorized' });
      const rows = db.prepare('SELECT * FROM votes ORDER BY id DESC').all();
      return sendJson(res, 200, { rows });
    }

    // ---------- API: แบบประเมินสภาพจิตใจ (intex3) ----------
    if (pathname === '/api/survey' && req.method === 'POST') {
      const b = await readJsonBody(req);
      const answers = Array.isArray(b.answers) ? b.answers.map(Number) : [];
      if (answers.length !== 10 || answers.some(a => !(a >= 1 && a <= 5))) {
        return sendJson(res, 400, { error: 'กรุณาตอบให้ครบทั้ง 10 ข้อ' });
      }
      const evalResult = evaluateSurvey(answers);
      db.prepare(`INSERT INTO surveys (name, no, class, student_id, answers, score, level, created_at)
                  VALUES (?,?,?,?,?,?,?,?)`)
        .run(b.name || '', b.no || '', b.class || '', b.studentId || '', JSON.stringify(answers), evalResult.score, evalResult.level, nowThai());
      return sendJson(res, 200, evalResult);
    }
    if (pathname === '/api/surveys' && req.method === 'GET') {
      if (!isValidSession(parseCookies(req).sid)) return sendJson(res, 401, { error: 'unauthorized' });
      const rows = db.prepare('SELECT * FROM surveys ORDER BY id DESC').all();
      return sendJson(res, 200, { rows });
    }

    // ---------- API: ปัญหาภายในโรงเรียน (intex4) ----------
    if (pathname === '/api/problem' && req.method === 'POST') {
      const b = await readJsonBody(req);
      if (!b.problem || !b.location) return sendJson(res, 400, { error: 'กรุณาเลือกปัญหาและสถานที่' });
      db.prepare(`INSERT INTO problems (problem, location, created_at) VALUES (?,?,?)`)
        .run(b.problem, b.location, nowThai());
      return sendJson(res, 200, { ok: true });
    }
    if (pathname === '/api/problems' && req.method === 'GET') {
      if (!isValidSession(parseCookies(req).sid)) return sendJson(res, 401, { error: 'unauthorized' });
      const rows = db.prepare('SELECT * FROM problems ORDER BY id DESC').all();
      return sendJson(res, 200, { rows });
    }

    // ---------- API: งบประมาณ (intex6.1) ----------
    if (pathname === '/api/budget' && req.method === 'GET') {
      if (!isValidSession(parseCookies(req).sid)) return sendJson(res, 401, { error: 'unauthorized' });
      const rows = db.prepare('SELECT * FROM budget ORDER BY id DESC').all();
      return sendJson(res, 200, { rows });
    }
    if (pathname === '/api/budget' && req.method === 'POST') {
      if (!isValidSession(parseCookies(req).sid)) return sendJson(res, 401, { error: 'unauthorized' });
      const b = await readJsonBody(req);
      const budgetTotal = Number(b.budgetTotal || 0);
      const actualPaid = Number(b.actualPaid || 0);
      const remaining = budgetTotal - actualPaid;
      db.prepare(`INSERT INTO budget (entry_date, entry_time, item, budget_total, actual_paid, remaining, recorder, note)
                  VALUES (?,?,?,?,?,?,?,?)`)
        .run(b.date || '', b.time || '', b.item || '', budgetTotal, actualPaid, remaining, b.recorder || '', b.note || '');
      return sendJson(res, 200, { ok: true, remaining });
    }

    // ---------- API: สรุปภาพรวม (intex6.5) ----------
    if (pathname === '/api/summary' && req.method === 'GET') {
      if (!isValidSession(parseCookies(req).sid)) return sendJson(res, 401, { error: 'unauthorized' });

      const problems = db.prepare('SELECT problem, COUNT(*) as c FROM problems GROUP BY problem ORDER BY c DESC').all();
      const topProblem = problems[0] || null;
      const totalProblems = problems.reduce((s, p) => s + p.c, 0);

      const budgetRows = db.prepare('SELECT item, budget_total FROM budget').all();
      const cheapestActivity = budgetRows.length
        ? budgetRows.reduce((min, r) => (r.budget_total < min.budget_total ? r : min))
        : null;

      const surveyLevels = db.prepare('SELECT level, COUNT(*) as c FROM surveys GROUP BY level').all();
      const totalSurveys = surveyLevels.reduce((s, r) => s + r.c, 0);
      const topLevelRow = surveyLevels.length ? surveyLevels.reduce((max, r) => (r.c > max.c ? r : max)) : null;

      const votes = db.prepare('SELECT activity, COUNT(*) as c FROM votes GROUP BY activity ORDER BY c DESC').all();
      const topActivity = votes[0] || null;
      const totalVotes = votes.reduce((s, v) => s + v.c, 0);

      const levelLabels = { 1: 'สบายใจดี', 2: 'ดี', 3: 'ปานกลาง', 4: 'ควรเฝ้าระวัง', 5: 'ควรได้รับการดูแลเป็นพิเศษ' };

      return sendJson(res, 200, {
        topProblem: topProblem ? { name: topProblem.problem, percent: totalProblems ? Math.round((topProblem.c / totalProblems) * 100) : 0 } : null,
        cheapestActivity: cheapestActivity ? { name: cheapestActivity.item, amount: cheapestActivity.budget_total } : null,
        topMentalLevel: topLevelRow ? { name: levelLabels[topLevelRow.level], percent: totalSurveys ? Math.round((topLevelRow.c / totalSurveys) * 100) : 0 } : null,
        topActivity: topActivity ? { name: topActivity.activity, percent: totalVotes ? Math.round((topActivity.c / totalVotes) * 100) : 0 } : null,
      });
    }

    // ---------- API: เข้าสู่ระบบแอดมิน (intex5) — ไม่ต้องใช้รหัสผ่านแล้ว ----------
    if (pathname === '/api/admin/login' && req.method === 'POST') {
      const token = makeSession();
      res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; Path=/; Max-Age=${SESSION_TTL_MS / 1000}; SameSite=Strict`);
      return sendJson(res, 200, { ok: true });
    }
    if (pathname === '/api/admin/session' && req.method === 'GET') {
      return sendJson(res, 200, { loggedIn: isValidSession(parseCookies(req).sid) });
    }
    if (pathname === '/api/admin/logout' && req.method === 'POST') {
      const token = parseCookies(req).sid;
      if (token) sessions.delete(token);
      res.setHeader('Set-Cookie', 'sid=; HttpOnly; Path=/; Max-Age=0');
      return sendJson(res, 200, { ok: true });
    }

    // ---------- ไฟล์หน้าเว็บ (static) ----------
    if (req.method === 'GET') return serveStatic(req, res, pathname);

    sendJson(res, 404, { error: 'not found' });
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: 'เกิดข้อผิดพลาดบนเซิร์ฟเวอร์' });
  }
});

server.listen(PORT, () => {
  console.log(`เว็บไซต์สภานักเรียนโรงเรียนร้องกวางอนุสรณ์ กำลังทำงานที่ http://localhost:${PORT}`);
  console.log(`ข้อมูลทั้งหมดถูกเก็บไว้ที่ data/school.db (ใช้ร่วมกันทั้งคอมพิวเตอร์และมือถือ)`);
});
