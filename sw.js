const CACHE = 'myapartment-v3'
const STATIC = ['/', '/index.html']

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

self.addEventListener('fetch', e => {
  // Skip non-GET, chrome extensions, and API calls
  if (e.request.method !== 'GET') return
  if (!e.request.url.startsWith('http')) return
  if (e.request.url.includes('supabase')) return
  if (e.request.url.includes('api.anthropic')) return
  if (e.request.url.includes('daily.co')) return

  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone()
        caches.open(CACHE).then(c => {
          try { c.put(e.request, clone) } catch {}
        })
        return res
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('/index.html')))
  )
})

let __SUPABASE_URL__ = ''
let __SUPABASE_KEY__ = ''

self.addEventListener('message', e => {
  if (e.data?.type === 'INIT_CONFIG') {
    __SUPABASE_URL__ = e.data.supabaseUrl || ''
    __SUPABASE_KEY__ = e.data.supabaseKey || ''
  }
})

self.addEventListener('push', e => {
  let data = {}
  try { data = e.data?.json() ?? {} } catch {}
  e.waitUntil(
    self.registration.showNotification(data.title || '🔔 Visitor at Gate', {
      body: data.body || 'Someone is at the gate',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      vibrate: [300, 100, 300, 100, 300],
      requireInteraction: true,
      tag: `call-${data.callId || Date.now()}`,
      renotify: true,
      data,
      actions: [
        { action: 'allow', title: '✅ Allow Entry' },
        { action: 'deny',  title: '🚫 Deny Entry' },
      ],
    })
  )
})

self.addEventListener('notificationclick', e => {
  e.notification.close()
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clients => {
        const app = clients.find(c => c.url.includes(self.location.origin))
        if (app) { app.focus(); return }
        self.clients.openWindow('/')
      })
  )
})
