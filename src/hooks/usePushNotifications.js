import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

export function usePushNotifications(userId, flatId, role) {
  const [permission, setPermission] = useState(Notification.permission)
  const [subscribed, setSubscribed] = useState(false)
  const [loading, setLoading]       = useState(false)

  // Check if already subscribed on mount
  useEffect(() => {
    if (!userId) return
    checkSubscription()
  }, [userId])

  const checkSubscription = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    setSubscribed(!!sub)
    setPermission(Notification.permission)
  }

  const subscribe = async () => {
    if (!VAPID_PUBLIC_KEY) {
      alert('Push notifications not configured. Add VITE_VAPID_PUBLIC_KEY to Vercel env vars.')
      return
    }
    setLoading(true)
    try {
      // 1. Request permission
      const perm = await Notification.requestPermission()
      setPermission(perm)
      if (perm !== 'granted') { setLoading(false); return }

      // 2. Get SW registration
      const reg = await navigator.serviceWorker.ready

      // 3. Subscribe to push
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })

      const key  = sub.getKey('p256dh')
      const auth = sub.getKey('auth')

      // 4. Save subscription to Supabase
      await supabase.from('push_subscriptions').upsert({
        user_id:  userId,
        flat_id:  flatId || null,
        role:     role || 'resident',
        endpoint: sub.endpoint,
        p256dh:   btoa(String.fromCharCode(...new Uint8Array(key))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''),
        auth:     btoa(String.fromCharCode(...new Uint8Array(auth))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''),
      }, { onConflict: 'endpoint' })

      setSubscribed(true)
    } catch (e) {
      console.error('Push subscribe error:', e)
      alert('Could not enable notifications: ' + e.message)
    }
    setLoading(false)
  }

  const unsubscribe = async () => {
    setLoading(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
        await sub.unsubscribe()
      }
      setSubscribed(false)
    } catch (e) {
      console.error('Push unsubscribe error:', e)
    }
    setLoading(false)
  }

  const isSupported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

  return { permission, subscribed, loading, subscribe, unsubscribe, isSupported }
}
