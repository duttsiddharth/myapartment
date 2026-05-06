// MyApartment Service Worker
// Handles: PWA caching + Web Push notifications + notification action buttons

const CACHE = 'myapartment-v2'
const STATIC = ['/', '/index.html']

// Config injected from main.jsx after registration
let __SUPABASE_URL__ = ''
let __SUPABASE_KEY__ = ''

self.addEventListener('message', e => {
  if (e.data?.type === 'INIT_CONFIG') {
    __SUPABASE_URL__ = e.data.supabaseUrl || ''
    __SUPABASE_KEY__ = e.data.supabaseKey || ''
  }
})

// ── Install & Cache ───────────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)))
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// ── Fetch (network-first, fallback cache) ────────────────────────────
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return
  if (e.request.url.startsWith('chrome-extension://')) return
  if (e.request.url.includes('supabase') || e.request.url.includes('api.anthropic')) return
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone()
        caches.open(CACHE).then(c => c.put(e.request, clone))
        return res
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('/index.html')))
  )
})

// ── Push Notification ─────────────────────────────────────────────────
self.addEventListener('push', e => {
  let data = {}
  try { data = e.data?.json() ?? {} } catch {}

  const title   = data.title   || '🔔 Visitor at Gate'
  const body    = data.body    || 'Someone is at the gate'
  const callId  = data.callId  || ''
  const flatId  = data.flatId  || ''
  const visitor = data.visitorName || 'Visitor'
  const purpose = data.visitorPurpose || 'Visit'

  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon:    '/icon-192.png',
      badge:   '/icon-192.png',
      vibrate: [300, 100, 300, 100, 300],
      requireInteraction: true,   // stays on screen until tapped
      tag: `call-${callId}`,      // replaces duplicate notifications
      renotify: true,
      data: { callId, flatId, visitor, purpose },
      actions: [
        { action: 'allow', title: '✅ Allow Entry' },
        { action: 'deny',  title: '🚫 Deny Entry'  },
      ],
    })
  )
})

// ── Notification Click ────────────────────────────────────────────────
self.addEventListener('notificationclick', e => {
  const { action } = e
  const { callId, flatId, visitor, purpose } = e.notification.data || {}

  e.notification.close()

  // User tapped Allow or Deny action button directly from notification
  if ((action === 'allow' || action === 'deny') && callId) {
    const status = action === 'allow' ? 'allowed' : 'denied'

    e.waitUntil((async () => {
      // Update call status in Supabase directly from service worker
      const supabaseUrl = __SUPABASE_URL__
      const supabaseKey = __SUPABASE_KEY__

      if (supabaseUrl && supabaseKey) {
        try {
          // Update call status
          await fetch(`${supabaseUrl}/rest/v1/calls?id=eq.${callId}`, {
            method: 'PATCH',
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=minimal',
            },
            body: JSON.stringify({ status }),
          })

          // Log visitor entry
          await fetch(`${supabaseUrl}/rest/v1/visitor_log`, {
            method: 'POST',
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=minimal',
            },
            body: JSON.stringify({
              visitor_name: visitor,
              purpose,
              flat_id: flatId,
              status,
            }),
          })
        } catch (err) {
          console.error('SW: Supabase update failed', err)
        }
      }

      // Open app to show the result
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const appClient = clients.find(c => c.url.includes(self.location.origin))
      if (appClient) {
        appClient.focus()
        appClient.postMessage({ type: 'CALL_RESOLVED', callId, status })
      } else {
        await self.clients.openWindow(`/?call=${callId}&status=${status}`)
      }
    })())
    return
  }

  // User tapped the notification body — open app to see incoming call
  e.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const appClient = clients.find(c => c.url.includes(self.location.origin))
    if (appClient) {
      appClient.focus()
      appClient.postMessage({ type: 'INCOMING_CALL', callId, flatId, visitor, purpose })
    } else {
      await self.clients.openWindow(`/?incoming=${callId}`)
    }
  })())
})
