// api.js — ตัวช่วยเรียก API และตรวจสอบสิทธิ์แอดมิน
async function postJson(url, data) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(data),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

async function getJson(url) {
  const res = await fetch(url, { credentials: 'same-origin' });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

// เรียกในทุกหน้าแอดมิน (ยกเว้นหน้า login) เพื่อเช็คว่าล็อกอินอยู่หรือยัง
async function requireAdmin() {
  const { body } = await getJson('/api/admin/session');
  if (!body.loggedIn) {
    window.location.href = '/admin-login.html';
  }
}
