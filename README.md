# 🏢 MyApartment Intercom System

Smart visitor management & intercom for 200 flats — built on React + Supabase + Vercel.
**Zero hardware. Zero monthly cost. Full audit trail.**

---

## 📁 Project Structure

```
myapartment-intercom/
├── public/
│   └── favicon.svg
├── src/
│   ├── components/
│   │   └── Icons.jsx
│   ├── hooks/
│   │   ├── useAuth.jsx
│   │   └── useRealtime.js
│   ├── pages/
│   │   ├── Login.jsx
│   │   ├── Guard.jsx
│   │   ├── Resident.jsx
│   │   └── Admin.jsx
│   ├── styles/
│   │   └── global.css
│   ├── App.jsx
│   ├── main.jsx
│   └── supabaseClient.js
├── supabase/
│   ├── schema.sql       ← Run first
│   ├── rls.sql          ← Run second
│   └── seed.sql         ← Run third (200 flats)
├── .env.example
├── .gitignore
├── index.html
├── package.json
├── vercel.json
└── vite.config.js
```

---

## 🚀 DEPLOYMENT STEPS

### STEP 1 — Supabase Setup (10 minutes)

1. Go to **https://supabase.com** → Sign up (free) → Create New Project
   - Project name: `myapartment-intercom`
   - Database password: Save this somewhere safe
   - Region: `ap-south-1` (Mumbai — lowest latency for India)

2. Wait ~2 minutes for project to provision.

3. Go to **SQL Editor** (left sidebar) → **New Query**
   - Paste contents of `supabase/schema.sql` → Click **Run**
   - Paste contents of `supabase/rls.sql` → Click **Run**
   - Paste contents of `supabase/seed.sql` → Click **Run**
   - You should see "Success" for each.

4. Go to **Project Settings** → **API**
   - Copy **Project URL** → this is your `VITE_SUPABASE_URL`
   - Copy **anon public** key → this is your `VITE_SUPABASE_ANON_KEY`

5. Enable Realtime: Go to **Database** → **Replication** → Enable for tables:
   - `calls`, `emergency_alerts`, `announcements`

---

### STEP 2 — Create Users in Supabase

Go to **Authentication** → **Users** → **Add User** for each:

| Email | Password | Role |
|-------|----------|------|
| admin@myapartment.com | (set strong pw) | admin |
| guard@myapartment.com | (set strong pw) | guard |
| (resident email) | (set pw) | resident |

After creating each user, go to **SQL Editor** and run:

```sql
-- Set admin role (replace UUID with actual user ID from Auth → Users)
UPDATE public.profiles 
SET role = 'admin', name = 'RWA Admin'
WHERE id = 'PASTE-ADMIN-UUID-HERE';

-- Set guard role
UPDATE public.profiles 
SET role = 'guard', name = 'Gate Security'
WHERE id = 'PASTE-GUARD-UUID-HERE';

-- Set resident role + link to flat (e.g., A-101)
UPDATE public.profiles 
SET role = 'resident', name = 'Sharma Family', flat_id = 'A-101'
WHERE id = 'PASTE-RESIDENT-UUID-HERE';
```

> **How to find UUID**: Authentication → Users → click the user → copy the `id` field.

---

### STEP 3 — GitHub Setup (5 minutes)

```bash
# On your machine
git clone (or create new repo on github.com)
cd myapartment-intercom

# Copy all project files into this folder, then:
git init
git add .
git commit -m "Initial commit: MyApartment Intercom System"

# Push to GitHub
git remote add origin https://github.com/YOUR_USERNAME/myapartment-intercom.git
git branch -M main
git push -u origin main
```

> ⚠️ Make sure `.gitignore` includes `.env.local` — never push secrets to GitHub.

---

### STEP 4 — Vercel Deployment (5 minutes)

1. Go to **https://vercel.com** → Sign up with GitHub

2. Click **Add New Project** → Import your `myapartment-intercom` repo

3. In **Environment Variables**, add:
   ```
   VITE_SUPABASE_URL       = https://xxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY  = eyJhbGci...
   VITE_SOCIETY_NAME       = MyApartment
   VITE_ADMIN_EMAIL        = admin@myapartment.com
   VITE_GUARD_EMAIL        = guard@myapartment.com
   ```

4. Framework Preset: **Vite**
   Build Command: `npm run build`
   Output Directory: `dist`

5. Click **Deploy** → Wait ~60 seconds → You get a live URL like:
   `https://myapartment-intercom.vercel.app`

---

### STEP 5 — Local Testing (Optional)

```bash
npm install

# Create .env.local from template
cp .env.example .env.local
# Edit .env.local with your actual Supabase keys

npm run dev
# Open http://localhost:3000
```

---

## 📱 TESTING ON PHONE

1. Open `https://myapartment-intercom.vercel.app` on your phone browser
2. Login as **guard@myapartment.com**
3. Open same URL in another tab or another phone → Login as a **resident**
4. On guard tab: fill visitor name → select a flat → tap **Call Flat**
5. On resident tab: incoming call modal appears → Accept → Allow/Deny
6. Check visitor log updates in real-time on both devices ✅

---

## 🔐 SECURITY ARCHITECTURE (For RWA Justification)

### Authentication
- **Supabase Auth** — industry-standard JWT-based authentication
- Passwords are hashed with bcrypt — never stored in plain text
- Session tokens auto-expire and rotate

### Data Security
- **Row Level Security (RLS)** on every table in PostgreSQL:
  - Guards can only see/write visitor logs — not other residents' data
  - Residents can only see their own flat's visitor history
  - Admins have full read access for audit purposes
  - No one can delete visitor logs (immutable audit trail)
- **HTTPS only** — all data encrypted in transit (TLS 1.3)
- **No data stored on devices** — all data in Supabase cloud (Mumbai region)

### What Data Is Stored
| Data | Who Can See |
|------|-------------|
| Visitor names & purpose | Guard, Admin, Flat Resident (own only) |
| Timestamps of all entries | Guard, Admin, Flat Resident (own only) |
| Emergency alerts | Guard, Admin |
| Announcements | All residents |
| Flat directory | All authenticated users |
| Passwords | Nobody (hashed, Supabase-managed) |

### Audit Trail
Every visitor entry is **permanently logged** with:
- Visitor name, purpose, flat visited
- Allow/Deny decision + timestamp
- Whether decision was by guard or resident
- Cannot be deleted by guard role (admin only, for RWA compliance)

---

## 💰 COST BREAKDOWN (For RWA Presentation)

| Component | Provider | Cost |
|-----------|----------|------|
| Database + Auth + Realtime | Supabase Free Tier | ₹0/month |
| Web Hosting | Vercel Free Tier | ₹0/month |
| AI Assistant (SecureAI) | Claude API | ~₹2-5/month (per use) |
| Hardware | None required | ₹0 |
| **Total** | | **₹0–5/month** |

**Comparison with traditional intercom systems:**
- Hardware intercom installation: ₹3–8 lakhs
- Annual Maintenance Contract (AMC): ₹50,000–1,50,000/year
- This system: ₹0 setup, ₹0–5/month ongoing

**Supabase Free Tier limits** (more than sufficient for 200 flats):
- 500 MB database storage
- 2 GB bandwidth/month
- 50,000 monthly active users
- Unlimited API requests

---

## 🗺️ UPGRADE PATH (Post-Pilot)

If the society grows or needs more features:
1. **Supabase Pro** ($25/month = ~₹2,000) for 8 GB storage + priority support
2. **Custom domain**: myapartment-intercom.com (~₹800/year)
3. **Mobile PWA**: Already PWA-ready — residents can "Add to Home Screen"
4. **WhatsApp notifications**: Integrate Twilio for visitor SMS alerts (~₹5/message)

---

## 📋 RWA PILOT PROPOSAL

**Suggested 30-day pilot:**
- Block A only (50 flats)
- Guard uses Guard view from personal phone
- 5–10 willing residents register as residents
- Admin (RWA secretary) monitors via Admin panel
- Review visitor log data after 30 days
- Decision to expand to all 200 flats

**Success metrics to track:**
- Number of visitors logged per day
- Response rate from residents (answer vs missed calls)
- Emergency alerts raised and response time
- Resident satisfaction (simple WhatsApp poll after 30 days)

---

## 🆘 TROUBLESHOOTING


**"Missing Supabase environment variables"**
→ Check `.env.local` file exists and has correct values. Restart `npm run dev`.

**Incoming call not appearing on resident's phone**
→ Check Supabase → Database → Replication → ensure `calls` table is enabled for Realtime.

**"Invalid login credentials"**
→ Verify user exists in Supabase Auth → Users. Check email spelling.

**Resident sees "No flat assigned"**
→ Run the profile UPDATE SQL to link their UUID to a flat_id.

---

*Built with React 18, Supabase, Vercel — MyApartment 2025*
