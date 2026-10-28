(function () {
  const $ = s => document.querySelector(s);
  const app = $('#app'), modal = $('#modal');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const today = () => iso(new Date());
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const money = n => '\u20B9' + Number(n).toLocaleString('en-IN');
  const fmtDate = d => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const fmtTime = t => new Date(t).toLocaleString();

  let session = JSON.parse(sessionStorage.getItem('hams_session') || 'null');
  if (session) Api.setToken(session.token);
  const setSession = s => { session = s; s ? sessionStorage.setItem('hams_session', JSON.stringify(s)) : sessionStorage.removeItem('hams_session'); };

  function toast(msg, kind) {
    const t = document.createElement('div'); t.className = 'toast ' + (kind || ''); t.textContent = msg;
    $('#toasts').appendChild(t); setTimeout(() => t.remove(), 4200);
  }
  const guard = fn => async (...a) => { try { return await fn(...a); } catch (e) { toast(e.message || 'Something went wrong', 'err'); } };
  const badge = s => {
    const k = { BOOKED: 'warn', RESCHEDULED: 'warn', PENDING: 'warn', PAID: 'ok', CANCELLED: 'bad', REFUNDED: 'bad', FAILED: 'bad' }[s] || '';
    return `<span class="badge ${k}">${esc(s)}</span>`;
  };
  function openModal(html) { modal.innerHTML = html; if (!modal.open) modal.showModal(); }
  const closeModal = () => modal.open && modal.close();

  /* ---------- navigation ---------- */
  const NAV = {
    PATIENT: [['#/dashboard', 'Dashboard'], ['#/doctors', 'Find Doctors'], ['#/appointments', 'My Appointments'], ['#/records', 'Medical Records'], ['#/notifications', 'Notifications']],
    DOCTOR: [['#/dashboard', 'Dashboard'], ['#/appointments', 'Appointments'], ['#/availability', 'Availability'], ['#/records', 'Patient Records']],
    ADMIN: [['#/dashboard', 'Dashboard'], ['#/manage-doctors', 'Doctors'], ['#/reports', 'Reports']]
  };
  function renderTop() {
    const hash = location.hash || '#/dashboard';
    $('#topbar').innerHTML = `<a class="brand" href="#/dashboard">\u271A Hospital Appointment System</a>` + (session ? `
      <nav class="nav">${NAV[session.user.role].map(([h, l]) => `<a href="${h}" class="${hash === h ? 'active' : ''}">${l}</a>`).join('')}</nav>
      <div class="who"><span>${esc(session.user.name)} \u00B7 ${esc(session.user.role.toLowerCase())}</span><button class="btn sec sm" id="logout">Log out</button></div>` : '<span class="nav"></span>');
    const lo = $('#logout'); if (lo) lo.onclick = () => { setSession(null); Api.setToken(null); location.hash = '#/login'; };
  }

  /* ---------- auth ---------- */
  function viewLogin() {
    app.innerHTML = `<div class="card auth">
      <h1>Welcome</h1>
      <div class="tabs"><button class="btn" id="tl">Log in</button><button class="btn sec" id="tr">Register</button></div>
      <form id="f"></form>
      ${Api.isMock() ? `<div class="hint"><b>Demo accounts</b> (simulated services)<br>
        Patient: patient@hospital.test / patient123<br>Doctor: doctor@hospital.test / doctor123<br>Admin: admin@hospital.test / admin123</div>` : ''}
    </div>`;
    const f = $('#f'); let mode = 'login';
    const draw = () => {
      $('#tl').className = 'btn' + (mode === 'login' ? '' : ' sec'); $('#tr').className = 'btn' + (mode === 'register' ? '' : ' sec');
      f.innerHTML = (mode === 'register' ? `<label>Full name</label><input name="name" required><label>Phone</label><input name="phone" inputmode="tel">` : '') +
        `<label>Email</label><input name="email" type="email" required><label>Password</label><input name="password" type="password" required minlength="6">
         <div class="actions"><button class="btn" type="submit">${mode === 'login' ? 'Log in' : 'Create account'}</button></div>`;
    };
    $('#tl').onclick = () => { mode = 'login'; draw(); }; $('#tr').onclick = () => { mode = 'register'; draw(); }; draw();
    f.onsubmit = guard(async e => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(f));
      const res = await Api.call(mode === 'login' ? 'patient.login' : 'patient.register', { body });
      setSession(res); Api.setToken(res.token); location.hash = '#/dashboard'; toast('Welcome, ' + res.user.name, 'ok');
    });
  }

  /* ---------- dashboards ---------- */
  const apptRows = (list, actions) => list.length ? `<div class="tablewrap"><table><thead><tr><th>Date</th><th>Time</th><th>${session.user.role === 'PATIENT' ? 'Doctor' : 'Patient'}</th><th>Status</th><th>Payment</th>${actions ? '<th></th>' : ''}</tr></thead><tbody>` +
    list.map(a => `<tr><td>${fmtDate(a.date)}</td><td>${esc(a.time)}</td><td>${esc(session.user.role === 'PATIENT' ? a.doctorName + ' \u00B7 ' + a.specialization : a.patientName)}</td><td>${badge(a.status)}</td><td>${badge(a.paymentStatus)}</td>${actions ? `<td>${actions(a)}</td>` : ''}</tr>`).join('') + '</tbody></table></div>'
    : '<div class="empty">No appointments yet.</div>';

  const upcoming = a => a.status !== 'CANCELLED' && a.date >= today();

  const viewDashboard = guard(async () => {
    const u = session.user;
    if (u.role === 'ADMIN') {
      const r = await Api.call('admin.report');
      app.innerHTML = `<h1>Admin dashboard</h1><div class="grid g3">
        <div class="card"><div class="stat">${r.patients}</div><div class="mut">Registered patients</div></div>
        <div class="card"><div class="stat">${r.doctors}</div><div class="mut">Doctors</div></div>
        <div class="card"><div class="stat">${r.appointments}</div><div class="mut">Appointments</div></div></div>
        <div class="card"><h2>Quick links</h2><a class="btn sec" href="#/manage-doctors">Manage doctors</a> <a class="btn sec" href="#/reports">View reports</a></div>`;
      return;
    }
    const list = await Api.call('appointment.list', { query: u.role === 'PATIENT' ? { patientId: u.id } : { doctorId: u.doctorId } });
    const up = list.filter(upcoming);
    app.innerHTML = `<h1>Hello, ${esc(u.name)}</h1><div class="grid g3">
      <div class="card"><div class="stat">${up.length}</div><div class="mut">Upcoming appointments</div></div>
      <div class="card"><div class="stat">${list.filter(a => a.paymentStatus === 'PENDING' && a.status !== 'CANCELLED').length}</div><div class="mut">Awaiting payment</div></div>
      <div class="card"><div class="stat">${list.length}</div><div class="mut">Total appointments</div></div></div>
      <div class="card"><h2>Upcoming</h2>${apptRows(up.slice(0, 5))}</div>
      ${u.role === 'PATIENT' ? '<a class="btn" href="#/doctors">Book a new appointment</a>' : ''}`;
  });

  /* ---------- find doctors & booking ---------- */
  const viewDoctors = guard(async () => {
    const all = await Api.call('doctor.search');
    const specs = [...new Set(all.map(d => d.specialization))].sort();
    app.innerHTML = `<h1>Find a doctor</h1><div class="card"><div class="row">
      <div><label>Name or specialization</label><input id="q" placeholder="e.g. Cardiology"></div>
      <div><label>Specialization</label><select id="s"><option value="">All</option>${specs.map(s => `<option>${esc(s)}</option>`).join('')}</select></div></div></div><div id="list"></div>`;
    const draw = guard(async () => {
      const list = await Api.call('doctor.search', { query: { q: $('#q').value, specialization: $('#s').value } });
      $('#list').innerHTML = list.length ? list.map(d => `<div class="card doc"><div><h2>${esc(d.name)}</h2>
        <div class="mut">${esc(d.specialization)} \u00B7 ${d.experience} yrs experience \u00B7 Fee ${money(d.fee)}</div>
        <div class="note">Works ${d.availability.days.map(x => DAYS[x]).join(', ')} \u00B7 ${d.availability.from}:00\u2013${d.availability.to}:00</div></div>
        <button class="btn" data-id="${esc(d.id)}">View slots</button></div>`).join('') : '<div class="empty card">No doctors match your search.</div>';
      document.querySelectorAll('#list [data-id]').forEach(b => b.onclick = () => slotDialog(list.find(d => d.id === b.dataset.id)));
    });
    $('#q').oninput = draw; $('#s').onchange = draw; draw();
  });

  // Shared slot picker for booking and rescheduling
  function slotDialog(doc, existing) {
    let date = today(), time = null;
    const title = existing ? `Reschedule with ${esc(doc.name)}` : `Book with ${esc(doc.name)}`;
    openModal(`<h2>${title}</h2><div class="mut">${esc(doc.specialization)} \u00B7 ${money(doc.fee)}</div>
      <label>Date</label><input type="date" id="dt" min="${today()}" value="${date}">
      <label>Available slots</label><div id="slots" class="slots"></div>
      ${existing ? '' : '<label>Reason for visit (optional)</label><textarea id="rs" rows="2" maxlength="200"></textarea>'}
      <div class="actions"><button class="btn sec" id="cx">Close</button><button class="btn" id="ok" disabled>${existing ? 'Reschedule' : 'Confirm booking'}</button></div>`);
    const draw = guard(async () => {
      time = null; $('#ok').disabled = true; $('#slots').innerHTML = '<span class="mut">Checking availability\u2026</span>';
      const slots = await Api.call('appointment.slots', { query: { doctorId: doc.id, date } });
      $('#slots').innerHTML = slots.length ? slots.map(s => `<button class="slot" data-t="${s.time}" ${s.available ? '' : 'disabled'}>${s.time}</button>`).join('') : '<span class="mut">Doctor is not available on this day.</span>';
      document.querySelectorAll('#slots .slot').forEach(b => b.onclick = () => {
        document.querySelectorAll('#slots .slot').forEach(x => x.classList.remove('sel')); b.classList.add('sel'); time = b.dataset.t; $('#ok').disabled = false;
      });
    });
    $('#dt').onchange = e => { date = e.target.value; if (date) draw(); };
    $('#cx').onclick = closeModal; draw();
    $('#ok').onclick = guard(async () => {
      $('#ok').disabled = true;
      try {
        if (existing) {
          await Api.call('appointment.reschedule', { params: { id: existing.id }, body: { date, time } });
          closeModal(); toast('Appointment rescheduled. A notification was sent.', 'ok'); route();
        } else {
          const a = await Api.call('appointment.book', { body: { patientId: session.user.id, doctorId: doc.id, date, time, reason: ($('#rs') || {}).value } });
          toast('Slot reserved. Complete payment to confirm.', 'ok'); paymentDialog(a);
        }
      } catch (e) { toast(e.message, 'err'); draw(); }   // e.g. slot taken -> refresh slots and let user pick another
    });
  }

  function paymentDialog(a) {
    openModal(`<h2>Payment</h2><p>${esc(a.doctorName)} \u00B7 ${fmtDate(a.date)} at ${esc(a.time)}</p>
      <p><b>Amount: ${money(a.fee)}</b></p>
      <label>Payment method</label><select id="pm"><option>UPI</option><option>Card</option><option>Net Banking</option></select>
      ${Api.isMock() ? '<label><input type="checkbox" id="sf" style="width:auto"> Simulate a failed payment</label>' : ''}
      <p class="note">Payment is simulated; no real transaction takes place.</p>
      <div class="actions"><button class="btn sec" id="later">Pay later</button><button class="btn" id="pay">Pay ${money(a.fee)}</button></div>`);
    $('#later').onclick = () => { closeModal(); location.hash = '#/appointments'; route(); };
    $('#pay').onclick = guard(async () => {
      $('#pay').disabled = true;
      try {
        const r = await Api.call('payment.process', { body: { appointmentId: a.id, method: $('#pm').value, simulateFailure: !!($('#sf') && $('#sf').checked) } });
        openModal(`<h2>Payment successful</h2><p>Receipt <b>${esc(r.payment.receiptNo)}</b> \u00B7 ${money(r.payment.amount)} via ${esc(r.payment.method)}.</p>
          <p>Your appointment with ${esc(r.appointment.doctorName)} on ${fmtDate(r.appointment.date)} at ${esc(r.appointment.time)} is confirmed. A confirmation notification has been sent.</p>
          <div class="actions"><button class="btn" id="done">Done</button></div>`);
        $('#done').onclick = () => { closeModal(); location.hash = '#/appointments'; route(); };
      } catch (e) { toast(e.message, 'err'); $('#pay').disabled = false; $('#pay').textContent = 'Retry payment'; }
    });
  }

  /* ---------- appointments ---------- */
  const viewAppointments = guard(async () => {
    const u = session.user, isP = u.role === 'PATIENT';
    const list = await Api.call('appointment.list', { query: isP ? { patientId: u.id } : { doctorId: u.doctorId } });
    app.innerHTML = `<h1>${isP ? 'My appointments' : 'Appointments'}</h1><div class="card">${apptRows(list, a => {
      if (a.status === 'CANCELLED') return '';
      return isP
        ? `${a.paymentStatus === 'PENDING' ? `<button class="btn sm" data-a="pay" data-id="${esc(a.id)}">Pay</button> ` : ''}<button class="btn sec sm" data-a="re" data-id="${esc(a.id)}">Reschedule</button> <button class="btn danger sm" data-a="cx" data-id="${esc(a.id)}">Cancel</button>`
        : `<button class="btn sec sm" data-a="rec" data-id="${esc(a.id)}">Add record</button>`;
    })}</div>`;
    document.querySelectorAll('[data-a]').forEach(b => b.onclick = guard(async () => {
      const a = list.find(x => x.id === b.dataset.id);
      if (b.dataset.a === 'pay') paymentDialog(a);
      if (b.dataset.a === 're') slotDialog(await Api.call('doctor.get', { params: { id: a.doctorId } }), a);
      if (b.dataset.a === 'cx') {
        openModal(`<h2>Cancel appointment?</h2><p>${esc(a.doctorName)} on ${fmtDate(a.date)} at ${esc(a.time)}.${a.paymentStatus === 'PAID' ? ' Your payment will be refunded (simulated).' : ''}</p>
          <div class="actions"><button class="btn sec" id="no">Keep it</button><button class="btn danger" id="yes">Cancel appointment</button></div>`);
        $('#no').onclick = closeModal;
        $('#yes').onclick = guard(async () => { await Api.call('appointment.cancel', { params: { id: a.id } }); closeModal(); toast('Appointment cancelled. Notification sent.', 'ok'); viewAppointments(); });
      }
      if (b.dataset.a === 'rec') {
        openModal(`<h2>Add consultation record</h2><p class="mut">${esc(a.patientName)} \u00B7 ${fmtDate(a.date)} ${esc(a.time)}</p>
          <label>Notes</label><textarea id="nt" rows="3" required></textarea><label>Prescription</label><textarea id="pr" rows="2"></textarea>
          <div class="actions"><button class="btn sec" id="no">Cancel</button><button class="btn" id="sv">Save record</button></div>`);
        $('#no').onclick = closeModal;
        $('#sv').onclick = guard(async () => {
          await Api.call('record.add', { body: { patientId: a.patientId, doctorId: u.doctorId, appointmentId: a.id, notes: $('#nt').value.trim(), prescription: $('#pr').value.trim() } });
          closeModal(); toast('Record saved.', 'ok');
        });
      }
    }));
  });

  /* ---------- records / notifications ---------- */
  const viewRecords = guard(async () => {
    const u = session.user;
    const list = await Api.call('record.list', { query: u.role === 'PATIENT' ? { patientId: u.id } : { doctorId: u.doctorId } });
    app.innerHTML = `<h1>${u.role === 'PATIENT' ? 'Medical records' : 'Patient records'}</h1>` + (list.length ? list.map(r => `<div class="card">
      <b>${esc(u.role === 'PATIENT' ? r.doctorName : r.patientName)}</b> <span class="mut">\u00B7 ${fmtTime(r.at)}</span>
      <p><b>Notes:</b> ${esc(r.notes)}</p>${r.prescription ? `<p><b>Prescription:</b> ${esc(r.prescription)}</p>` : ''}</div>`).join('') : '<div class="card empty">No records yet.</div>');
  });
  const viewNotifications = guard(async () => {
    const list = await Api.call('notification.list', { query: { userId: session.user.id } });
    app.innerHTML = `<h1>Notifications</h1><div class="card">` + (list.length ? list.map(n => `<div class="notif">${esc(n.message)}<div class="note">${esc(n.channel)} \u00B7 ${fmtTime(n.at)}</div></div>`).join('') : '<div class="empty">No notifications yet.</div>') + '</div>';
  });

  /* ---------- doctor: availability ---------- */
  const viewAvailability = guard(async () => {
    const d = await Api.call('doctor.get', { params: { id: session.user.doctorId } });
    const a = d.availability;
    app.innerHTML = `<h1>Manage availability</h1><div class="card"><form id="f">
      <label>Working days</label><div class="row">${DAYS.map((n, i) => `<label style="font-weight:400;flex:0 0 auto"><input type="checkbox" style="width:auto" name="day" value="${i}" ${a.days.includes(i) ? 'checked' : ''}> ${n}</label>`).join('')}</div>
      <div class="row"><div><label>From (hour)</label><input type="number" name="from" min="0" max="23" value="${a.from}"></div>
      <div><label>To (hour)</label><input type="number" name="to" min="1" max="24" value="${a.to}"></div></div>
      <div class="actions"><button class="btn" type="submit">Save availability</button></div></form></div>`;
    $('#f').onsubmit = guard(async e => {
      e.preventDefault(); const fd = new FormData(e.target);
      await Api.call('doctor.setAvailability', { params: { id: d.id }, body: { days: fd.getAll('day'), from: fd.get('from'), to: fd.get('to') } });
      toast('Availability updated.', 'ok');
    });
  });

  /* ---------- admin ---------- */
  const viewManageDoctors = guard(async () => {
    const list = await Api.call('doctor.search');
    app.innerHTML = `<h1>Manage doctors</h1><div class="card"><h2>Add doctor</h2><form id="f" class="row">
      <div><label>Name</label><input name="name" required></div><div><label>Specialization</label><input name="specialization" required></div>
      <div><label>Experience (yrs)</label><input name="experience" type="number" min="0"></div><div><label>Fee (\u20B9)</label><input name="fee" type="number" min="0"></div>
      <button class="btn" type="submit">Add</button></form></div>
      <div class="card tablewrap"><table><thead><tr><th>Name</th><th>Specialization</th><th>Experience</th><th>Fee</th><th></th></tr></thead><tbody>
      ${list.map(d => `<tr><td>${esc(d.name)}</td><td>${esc(d.specialization)}</td><td>${d.experience} yrs</td><td>${money(d.fee)}</td><td><button class="btn danger sm" data-id="${esc(d.id)}">Remove</button></td></tr>`).join('')}</tbody></table></div>`;
    $('#f').onsubmit = guard(async e => { e.preventDefault(); await Api.call('doctor.add', { body: Object.fromEntries(new FormData(e.target)) }); toast('Doctor added.', 'ok'); viewManageDoctors(); });
    document.querySelectorAll('[data-id]').forEach(b => b.onclick = guard(async () => { await Api.call('doctor.remove', { params: { id: b.dataset.id } }); toast('Doctor removed.', 'ok'); viewManageDoctors(); }));
  });
  const viewReports = guard(async () => {
    const r = await Api.call('admin.report');
    const rows = o => Object.keys(o).length ? Object.entries(o).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('') : '<tr><td colspan="2" class="mut">No data yet.</td></tr>';
    app.innerHTML = `<h1>Reports</h1><div class="grid g2">
      <div class="card"><h2>Appointments by status</h2><table><tbody>${rows(r.byStatus)}</tbody></table></div>
      <div class="card"><h2>Revenue by doctor</h2><table><tbody>${rows(Object.fromEntries(Object.entries(r.revenue).map(([k, v]) => [k, money(v)])))}</tbody></table></div></div>
      ${Api.isMock() ? '<button class="btn danger" id="reset">Reset demo data</button>' : ''}`;
    const rs = $('#reset'); if (rs) rs.onclick = () => { if (confirm('Reset all simulated data?')) { Api.resetDemoData(); toast('Demo data reset.', 'ok'); viewReports(); } };
  });

  /* ---------- router ---------- */
  const ROUTES = {
    '#/login': viewLogin, '#/dashboard': viewDashboard, '#/doctors': viewDoctors, '#/appointments': viewAppointments,
    '#/records': viewRecords, '#/notifications': viewNotifications, '#/availability': viewAvailability,
    '#/manage-doctors': viewManageDoctors, '#/reports': viewReports
  };
  const ALLOWED = { PATIENT: ['#/dashboard', '#/doctors', '#/appointments', '#/records', '#/notifications'],
    DOCTOR: ['#/dashboard', '#/appointments', '#/availability', '#/records'], ADMIN: ['#/dashboard', '#/manage-doctors', '#/reports'] };
  function route() {
    closeModal();
    let h = location.hash || '#/dashboard';
    if (!session && h !== '#/login') { location.hash = '#/login'; return; }
    if (session && (h === '#/login' || !ALLOWED[session.user.role].includes(h))) { if (h !== '#/dashboard') { location.hash = '#/dashboard'; return; } h = '#/dashboard'; }
    renderTop(); (ROUTES[h] || viewDashboard)();
  }
  window.addEventListener('hashchange', route);
  route();
})();
