# PadhaiZone Production Starter

This version includes a real Express backend and SQLite database.

## Working now
- Student signup/login
- Admin role
- Notes upload and library
- PYQ upload and library
- Question bank
- Admin statistics
- Search
- Session authentication
- Password hashing
- Responsive light-purple UI

## Run
Install Node.js 20+ on a computer.
Then:
npm install
npm start
Open http://localhost:3000

Default admin:
ADMIN_EMAIL=admin@padhaizone.in
ADMIN_PASSWORD=ChangeMe123!
Set environment variables before production.

## Deploy
`render.yaml` is included for a Render deployment with a persistent disk. You still need to create your own hosting account and connect/deploy this repository. A public launch cannot be completed from this chat because the hosting provider must authorize the account and billing/domain ownership.

## Production checklist
- Change admin password and SESSION_SECRET.
- Use HTTPS.
- Use a real managed database for scale (Postgres/Supabase).
- Use object storage for large PDF libraries.
- Add email verification, password reset, rate limiting and CSRF protection.
- Verify you own or license every PDF/PYQ you publish.
