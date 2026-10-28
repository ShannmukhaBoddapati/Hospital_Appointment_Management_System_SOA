# Hospital Appointment Management System using SOA — Frontend

Static web client (HTML, CSS, JavaScript; no build step) for the SOA hospital appointment system described in the project report.

## Features
- **Patient:** register / log in, search doctors by name or specialization, view slots, book, pay (simulated), cancel, reschedule, notifications, medical records.
- **Doctor:** appointments, add consultation records, manage availability.
- **Admin:** manage doctors, reports (appointments by status, revenue by doctor).
- Conflict checking on booking and rescheduling (slot not available -> choose another slot).

## Run
Open `index.html` directly, or serve the folder:

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

## Demo mode vs. real backend
`js/config.js` controls where requests go:

- `API_BASE: ""` (default) — the UI uses simulated Patient, Doctor, Appointment, Payment, Notification and Medical Record services stored in browser `localStorage`. Demo accounts:
  - Patient: `patient@hospital.test` / `patient123`
  - Doctor: `doctor@hospital.test` / `doctor123`
  - Admin: `admin@hospital.test` / `admin123`
- `API_BASE: "http://localhost:8080"` — every call goes to the API Gateway as JSON over REST. The route table is at the top of `js/api.js`; adjust paths to match your Spring Boot controllers.

Mock passwords are stored in plain text in the browser for demonstration only and must not be used in production.

## Structure
```
index.html
css/styles.css
js/config.js   API base URL
js/api.js      gateway + simulated services + REST route table
js/app.js      views, routing, dialogs
```
