/* API layer.
 * Every call goes through the "gateway" (single entry point, as in the architecture diagram).
 * - Real mode (HAMS_CONFIG.API_BASE set): calls the REST route for the operation via fetch (JSON).
 * - Mock mode (default): runs the same operation against simulated services stored in localStorage,
 *   so the UI works without a backend. Mock data/passwords are for demonstration only.
 */
(function () {
  const CFG = window.HAMS_CONFIG || {};

  // Route table: operation -> [HTTP method, path builder]. Adjust to match the Spring Boot controllers.
  const ROUTES = {
    'patient.register':     ['POST', () => '/api/patients/register'],
    'patient.login':        ['POST', () => '/api/patients/login'],
    'doctor.search':        ['GET',  () => '/api/doctors'],
    'doctor.get':           ['GET',  p => `/api/doctors/${p.id}`],
    'doctor.add':           ['POST', () => '/api/doctors'],
    'doctor.remove':        ['DELETE', p => `/api/doctors/${p.id}`],
    'doctor.setAvailability': ['PUT', p => `/api/doctors/${p.id}/availability`],
    'appointment.slots':    ['GET',  () => '/api/appointments/slots'],
    'appointment.book':     ['POST', () => '/api/appointments'],
    'appointment.list':     ['GET',  () => '/api/appointments'],
    'appointment.cancel':   ['PUT',  p => `/api/appointments/${p.id}/cancel`],
    'appointment.reschedule': ['PUT', p => `/api/appointments/${p.id}/reschedule`],
    'payment.process':      ['POST', () => '/api/payments'],
    'notification.list':    ['GET',  () => '/api/notifications'],
    'record.list':          ['GET',  () => '/api/records'],
    'record.add':           ['POST', () => '/api/records'],
    'admin.report':         ['GET',  () => '/api/reports/summary']
  };

  let token = null;
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  async function call(op, { params = {}, query = {}, body } = {}) {
    if (CFG.API_BASE) {
      const [method, path] = ROUTES[op];
      const qs = new URLSearchParams(query).toString();
      const res = await fetch(CFG.API_BASE + path(params) + (qs ? '?' + qs : ''), {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
        body: body ? JSON.stringify(body) : undefined
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
      if (data.token) token = data.token;
      return data;
    }
    await sleep(CFG.MOCK_LATENCY_MS ?? 200);
    return Mock[op]({ params, query, body: body || {} });
  }

  /* ---------------- Mock services ---------------- */
  const KEY = 'hams_db_v1';
  const uid = p => p + Math.random().toString(36).slice(2, 8);
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const fail = m => { throw new Error(m); };

  function seed() {
    const doctors = [
      ['d1', 'Dr. Ananya Rao', 'Cardiology', 12, 800],
      ['d2', 'Dr. Vikram Shah', 'Dermatology', 8, 600],
      ['d3', 'Dr. Meera Iyer', 'Pediatrics', 10, 500],
      ['d4', 'Dr. Arjun Reddy', 'Orthopedics', 15, 900],
      ['d5', 'Dr. Sana Khan', 'General Medicine', 6, 400]
    ].map(([id, name, spec, exp, fee]) => ({ id, name, specialization: spec, experience: exp, fee,
      availability: { days: [1, 2, 3, 4, 5], from: 9, to: 17 } }));
    const users = [
      { id: 'p1', name: 'Demo Patient', email: 'patient@hospital.test', password: 'patient123', phone: '9000000001', role: 'PATIENT' },
      { id: 'u_d1', name: 'Dr. Ananya Rao', email: 'doctor@hospital.test', password: 'doctor123', role: 'DOCTOR', doctorId: 'd1' },
      { id: 'a1', name: 'Hospital Admin', email: 'admin@hospital.test', password: 'admin123', role: 'ADMIN' }
    ];
    return { doctors, users, appointments: [], payments: [], notifications: [], records: [] };
  }
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || seed(); } catch { return seed(); } };
  const save = db => localStorage.setItem(KEY, JSON.stringify(db));
  const pub = u => ({ id: u.id, name: u.name, email: u.email, role: u.role, doctorId: u.doctorId });

  function notify(db, userId, type, message) {
    db.notifications.push({ id: uid('n'), userId, type, channel: 'Email/SMS (simulated)', message, at: new Date().toISOString() });
  }
  function slotTimes(doc, date) {
    const day = new Date(date + 'T00:00:00').getDay();
    if (!doc.availability.days.includes(day)) return [];
    const out = [];
    for (let h = doc.availability.from; h < doc.availability.to; h++) out.push(String(h).padStart(2, '0') + ':00');
    return out;
  }
  const active = a => a.status !== 'CANCELLED';
  function conflict(db, { doctorId, patientId, date, time, ignoreId }) {
    return db.appointments.find(a => active(a) && a.id !== ignoreId && a.date === date && a.time === time &&
      (a.doctorId === doctorId || a.patientId === patientId));
  }
  const withNames = (db, a) => ({ ...a,
    doctorName: (db.doctors.find(d => d.id === a.doctorId) || {}).name || 'Unknown',
    specialization: (db.doctors.find(d => d.id === a.doctorId) || {}).specialization || '',
    patientName: (db.users.find(u => u.id === a.patientId) || {}).name || 'Unknown' });

  const Mock = {
    'patient.register'({ body }) {
      const db = load();
      if (!body.name || !body.email || !body.password) fail('Name, email and password are required.');
      if (db.users.some(u => u.email.toLowerCase() === body.email.toLowerCase())) fail('An account with this email already exists.');
      const u = { id: uid('p'), name: body.name, email: body.email, password: body.password, phone: body.phone || '', role: 'PATIENT' };
      db.users.push(u); notify(db, u.id, 'WELCOME', 'Welcome! Your patient account has been created.'); save(db);
      return { user: pub(u), token: 'mock-' + u.id };
    },
    'patient.login'({ body }) {
      const u = load().users.find(x => x.email.toLowerCase() === (body.email || '').toLowerCase() && x.password === body.password);
      if (!u) fail('Invalid credentials.');
      return { user: pub(u), token: 'mock-' + u.id };
    },
    'doctor.search'({ query }) {
      const q = (query.q || '').toLowerCase(), s = query.specialization || '';
      return load().doctors.filter(d => (!q || d.name.toLowerCase().includes(q) || d.specialization.toLowerCase().includes(q)) && (!s || d.specialization === s));
    },
    'doctor.get'({ params }) { return load().doctors.find(d => d.id === params.id) || fail('Doctor not found.'); },
    'doctor.add'({ body }) {
      const db = load();
      if (!body.name || !body.specialization) fail('Name and specialization are required.');
      const d = { id: uid('d'), name: body.name, specialization: body.specialization, experience: +body.experience || 0, fee: +body.fee || 500,
        availability: { days: [1, 2, 3, 4, 5], from: 9, to: 17 } };
      db.doctors.push(d); save(db); return d;
    },
    'doctor.remove'({ params }) {
      const db = load();
      if (db.appointments.some(a => a.doctorId === params.id && active(a))) fail('Doctor has active appointments and cannot be removed.');
      db.doctors = db.doctors.filter(d => d.id !== params.id); save(db); return { ok: true };
    },
    'doctor.setAvailability'({ params, body }) {
      const db = load(); const d = db.doctors.find(x => x.id === params.id) || fail('Doctor not found.');
      if (!(body.from < body.to)) fail('Start time must be before end time.');
      if (!body.days.length) fail('Select at least one working day.');
      d.availability = { days: body.days.map(Number), from: +body.from, to: +body.to }; save(db); return d;
    },
    'appointment.slots'({ query }) {
      const db = load(); const doc = db.doctors.find(d => d.id === query.doctorId) || fail('Doctor not found.');
      const now = new Date();
      return slotTimes(doc, query.date).map(time => {
        const taken = db.appointments.some(a => active(a) && a.doctorId === doc.id && a.date === query.date && a.time === time);
        const past = query.date === iso(now) && +time.slice(0, 2) <= now.getHours();
        return { time, available: !taken && !past };
      });
    },
    'appointment.book'({ body }) {
      const db = load();
      const doc = db.doctors.find(d => d.id === body.doctorId) || fail('Doctor not found.');
      if (!slotTimes(doc, body.date).includes(body.time)) fail('Selected time is outside the doctor\'s availability.');
      const c = conflict(db, body);
      if (c) fail(c.doctorId === body.doctorId ? 'Slot not available. Please choose another slot.' : 'You already have an appointment at this time.');
      const a = { id: uid('A'), patientId: body.patientId, doctorId: doc.id, date: body.date, time: body.time, reason: body.reason || '',
        status: 'BOOKED', paymentStatus: 'PENDING', fee: doc.fee, createdAt: new Date().toISOString() };
      db.appointments.push(a); save(db); return withNames(db, a);
    },
    'appointment.list'({ query }) {
      const db = load();
      let list = db.appointments;
      if (query.patientId) list = list.filter(a => a.patientId === query.patientId);
      if (query.doctorId) list = list.filter(a => a.doctorId === query.doctorId);
      return list.map(a => withNames(db, a)).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    },
    'appointment.cancel'({ params }) {
      const db = load(); const a = db.appointments.find(x => x.id === params.id) || fail('Appointment not found.');
      if (a.status === 'CANCELLED') fail('Appointment is already cancelled.');
      a.status = 'CANCELLED';
      if (a.paymentStatus === 'PAID') a.paymentStatus = 'REFUNDED';
      notify(db, a.patientId, 'CANCELLED', `Your appointment on ${a.date} at ${a.time} was cancelled.` + (a.paymentStatus === 'REFUNDED' ? ' A refund has been initiated (simulated).' : ''));
      save(db); return withNames(db, a);
    },
    'appointment.reschedule'({ params, body }) {
      const db = load(); const a = db.appointments.find(x => x.id === params.id) || fail('Appointment not found.');
      if (a.status === 'CANCELLED') fail('Cancelled appointments cannot be rescheduled.');
      const doc = db.doctors.find(d => d.id === a.doctorId);
      if (!slotTimes(doc, body.date).includes(body.time)) fail('Selected time is outside the doctor\'s availability.');
      if (conflict(db, { doctorId: a.doctorId, patientId: a.patientId, date: body.date, time: body.time, ignoreId: a.id })) fail('Slot not available. Please choose another slot.');
      a.date = body.date; a.time = body.time; a.status = 'RESCHEDULED';
      notify(db, a.patientId, 'RESCHEDULED', `Your appointment with ${doc.name} was moved to ${a.date} at ${a.time}.`);
      save(db); return withNames(db, a);
    },
    'payment.process'({ body }) {
      const db = load(); const a = db.appointments.find(x => x.id === body.appointmentId) || fail('Appointment not found.');
      if (a.paymentStatus === 'PAID') fail('Payment already completed.');
      const p = { id: uid('T'), appointmentId: a.id, amount: a.fee, method: body.method, at: new Date().toISOString() };
      if (body.simulateFailure) {
        p.status = 'FAILED'; db.payments.push(p); save(db);
        fail('Payment failed: the payment gateway declined the transaction (simulated). Please retry.');
      }
      p.status = 'SUCCESS'; p.receiptNo = 'RCPT-' + Math.floor(100000 + Math.random() * 900000);
      db.payments.push(p); a.paymentStatus = 'PAID';
      const doc = db.doctors.find(d => d.id === a.doctorId);
      notify(db, a.patientId, 'CONFIRMED', `Appointment confirmed with ${doc.name} on ${a.date} at ${a.time}. Receipt ${p.receiptNo}.`);
      save(db); return { payment: p, appointment: withNames(db, a) };
    },
    'notification.list'({ query }) {
      return load().notifications.filter(n => n.userId === query.userId).sort((a, b) => b.at.localeCompare(a.at));
    },
    'record.list'({ query }) {
      const db = load();
      return db.records.filter(r => (!query.patientId || r.patientId === query.patientId) && (!query.doctorId || r.doctorId === query.doctorId))
        .map(r => ({ ...r, doctorName: (db.doctors.find(d => d.id === r.doctorId) || {}).name, patientName: (db.users.find(u => u.id === r.patientId) || {}).name }))
        .sort((a, b) => b.at.localeCompare(a.at));
    },
    'record.add'({ body }) {
      const db = load();
      if (!body.notes) fail('Consultation notes are required.');
      const r = { id: uid('R'), patientId: body.patientId, doctorId: body.doctorId, appointmentId: body.appointmentId, notes: body.notes, prescription: body.prescription || '', at: new Date().toISOString() };
      db.records.push(r); save(db); return r;
    },
    'admin.report'() {
      const db = load();
      const byStatus = {}, revenue = {};
      db.appointments.forEach(a => { byStatus[a.status] = (byStatus[a.status] || 0) + 1; });
      db.payments.filter(p => p.status === 'SUCCESS').forEach(p => {
        const a = db.appointments.find(x => x.id === p.appointmentId); const d = a && db.doctors.find(x => x.id === a.doctorId);
        const n = d ? d.name : 'Unknown'; revenue[n] = (revenue[n] || 0) + p.amount;
      });
      return { patients: db.users.filter(u => u.role === 'PATIENT').length, doctors: db.doctors.length, appointments: db.appointments.length, byStatus, revenue };
    }
  };

  window.Api = {
    call,
    setToken: t => { token = t; },
    resetDemoData: () => { localStorage.removeItem(KEY); },
    isMock: () => !CFG.API_BASE
  };
})();
