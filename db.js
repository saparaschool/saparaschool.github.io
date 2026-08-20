// db.js — ฐานข้อมูล SQLite ในตัว Node.js (ไม่ต้องติดตั้งแพ็กเกจเพิ่ม)
'use strict';
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'school.db'));

db.exec(`
CREATE TABLE IF NOT EXISTS votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT, no TEXT, class TEXT, student_id TEXT,
  activity TEXT NOT NULL,
  satisfaction INTEGER NOT NULL,
  suggestion TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS surveys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT, no TEXT, class TEXT, student_id TEXT,
  answers TEXT NOT NULL,
  score INTEGER NOT NULL,
  level INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS problems (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  problem TEXT NOT NULL,
  location TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS budget (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_date TEXT NOT NULL,
  entry_time TEXT NOT NULL,
  item TEXT NOT NULL,
  budget_total REAL NOT NULL,
  actual_paid REAL NOT NULL,
  remaining REAL NOT NULL,
  recorder TEXT,
  note TEXT
);

CREATE TABLE IF NOT EXISTS admin_lock (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT
);
`);

// แถวเดียวสำหรับสถานะล็อคการเข้าสู่ระบบแอดมิน
db.exec(`INSERT OR IGNORE INTO admin_lock (id, attempts, locked_until) VALUES (1, 0, NULL)`);

module.exports = db;
