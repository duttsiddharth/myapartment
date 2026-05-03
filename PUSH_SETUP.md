# 🔔 Push Notifications Setup Guide
## (So residents receive gate calls even when app is closed)

---

## STEP 1 — Generate VAPID Keys (run once on your machine)

```bash
npx web-push generate-vapid-keys
```

Output will look like:
```
Public Key:  BK3x9z2...long_string...
Private Key: Kp2mN...long_string...
```

Save both. You'll use them in Steps 2 and 3.

---

## STEP 2 — Add to Vercel Environment Variables

Vercel Dashboard → Your Project → Settings → Environment Variables → Add:

| Key | Value |
|-----|-------|
| `VITE_SUPABASE_URL` | your Supabase URL |
| `VITE_SUPABASE_ANON_KEY` | your Supabase anon key |
| `VITE_VAPID_PUBLIC_KEY` | your VAPID **public** key |

Redeploy after adding.

---

## STEP 3 — Run Push Schema SQL

In Supabase → SQL Editor, run the contents of `supabase/push_schema.sql`

---

## STEP 4 — Deploy the Edge Function

Install Supabase CLI if you haven't:
```bash
npm install -g supabase
supabase login
```

Link your project:
```bash
supabase link --project-ref YOUR_PROJECT_REF
```

Deploy the function:
```bash
supabase functions deploy send-push
```

Set Edge Function secrets (these are server-side, never exposed to browser):
```bash
supabase secrets set VAPID_PUBLIC_KEY="your_vapid_public_key"
supabase secrets set VAPID_PRIVATE_KEY="your_vapid_private_key"
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="your_service_role_key"
```

> Service role key: Supabase → Project Settings → API → service_role (secret)

---

## STEP 5 — Set Up Database Webhook

This fires the Edge Function every time a guard calls a flat.

Supabase Dashboard → Database → Webhooks → Create new webhook:

| Field | Value |
|-------|-------|
| Name | `on-call-insert` |
| Table | `public.calls` |
| Events | ✅ INSERT |
| Type | HTTP Request |
| URL | `https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-push` |
| HTTP Method | POST |
| Headers | `Authorization: Bearer YOUR_SERVICE_ROLE_KEY` |

Click Save.

---

## STEP 6 — Test It

1. Open the app on a resident's phone
2. Log in as the resident
3. Tap **"Enable Gate Call Notifications"** → Allow when browser asks
4. Close the app completely (swipe away from recents)
5. On another device, log in as Guard
6. Call that resident's flat
7. The resident's phone should vibrate and show a notification with **Allow Entry** and **Deny Entry** buttons
8. Resident can tap directly from the notification — no need to open the app

---

## How It Works (Technical Summary for RWA)

```
Guard calls flat
    ↓
New row inserted in Supabase `calls` table
    ↓
Supabase Database Webhook fires instantly
    ↓
Edge Function (send-push) runs on Supabase servers
    ↓
Fetches resident's push subscription from database
    ↓
Sends encrypted Web Push to Google/Apple push servers
    ↓
Push servers deliver to resident's device (even if locked)
    ↓
Resident sees notification with Allow / Deny buttons
    ↓
Tapping a button updates the call status in Supabase
    ↓
Guard's screen updates in real-time
```

## Browser Support

| Platform | Browser | Push Support |
|----------|---------|-------------|
| Android | Chrome | ✅ Full support |
| Android | Firefox | ✅ Full support |
| iPhone iOS 16.4+ | Safari | ✅ Supported (PWA must be installed) |
| iPhone iOS < 16.4 | Safari | ❌ Not supported |
| PC/Mac | Chrome | ✅ Full support |

> **iPhone note**: Push only works after the resident installs the app to their home screen (Add to Home Screen in Safari). Once installed as a PWA, it works in the background.
