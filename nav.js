// nav.js — สร้างแถบหัวข้อ (โลโก้ + เมนู) ให้ทุกหน้าโดยไม่ต้องคัดลอก HTML ซ้ำ
(function () {
  const NAV_GROUPS = {
    main: [
      { id: 'intex1', label: 'หน้าหลัก', href: '/index.html' },
      { id: 'intex2', label: 'โหวตกิจกรรม', href: '/vote.html' },
      { id: 'intex3', label: 'แบบประเมินใจ', href: '/survey.html' },
      { id: 'intex4', label: 'แจ้งปัญหา', href: '/problem.html' },
      { id: 'intex5', label: 'แอดมิน', href: '/admin-login.html' },
    ],
    admin: [
      { id: 'intex1', label: 'หน้าหลัก', href: '/index.html' },
      { id: 'intex6.1', label: 'งบประมาณ', href: '/admin-budget.html' },
      { id: 'intex6.2', label: 'คลังปัญหา', href: '/admin-problems.html' },
      { id: 'intex6.3', label: 'คลังแบบประเมิน', href: '/admin-survey.html' },
      { id: 'intex6.4', label: 'ผลโหวต', href: '/admin-votes.html' },
      { id: 'intex6.5', label: 'สรุป', href: '/admin-summary.html' },
    ],
  };

  function renderHeader() {
    const mount = document.getElementById('site-header');
    if (!mount) return;
    const group = mount.dataset.group || 'main';
    const active = mount.dataset.active || '';
    const links = NAV_GROUPS[group] || NAV_GROUPS.main;

    mount.innerHTML = `
      <div class="brand">
        <img src="/img/school-badge.svg" alt="ตราโรงเรียน">
        <img src="/img/council-badge.svg" alt="ตราสภานักเรียน">
        <span class="brand-text">สภานักเรียน<small>โรงเรียนร้องกวางอนุสรณ์</small></span>
      </div>
      <nav class="nav">
        ${links.map(l => `<a href="${l.href}" class="${l.id === active ? 'active' : ''}">${l.label}</a>`).join('')}
      </nav>
    `;
  }

  document.addEventListener('DOMContentLoaded', renderHeader);
})();
