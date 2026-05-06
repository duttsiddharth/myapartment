import { useEffect } from 'react'
import { supabase } from '../supabaseClient'

// Resident receives incoming calls - filter out self-initiated calls
export function useIncomingCall(flatId, onIncoming) {
  useEffect(() => {
    if (!flatId) return
    console.log('Subscribing to incoming calls for flat:', flatId)

    // Get current user to filter out self-calls
    let currentUserId = null
    supabase.auth.getSession().then(({ data: { session } }) => {
      currentUserId = session?.user?.id
    })

    const channel = supabase
      .channel(`incoming-${flatId}-${Math.random().toString(36).slice(2,6)}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'calls',
        filter: `flat_id=eq.${flatId}`,
      }, (payload) => {
        const call = payload.new
        console.log('📞 Incoming call received:', call)
        // Skip calls initiated by this user (prevents self-ring when calling guard)
        if (call.initiated_by === currentUserId) {
          console.log('Skipping self-initiated call')
          return
        }
        if (call.status === 'ringing') onIncoming(call)
      })
      .subscribe((status) => {
        console.log(`Incoming call subscription [${flatId}]:`, status)
      })

    return () => {
      console.log('Unsubscribing from incoming calls for flat:', flatId)
      supabase.removeChannel(channel)
    }
  }, [flatId])
}

// Guard watches for call status updates
export function useCallStatusUpdate(callId, onUpdate) {
  useEffect(() => {
    if (!callId) return
    const channel = supabase
      .channel(`call-update-${callId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'calls',
        filter: `id=eq.${callId}`,
      }, (payload) => onUpdate(payload.new))
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [callId])
}

// Emergency alerts
export function useEmergencyAlerts(role, onAlert) {
  useEffect(() => {
    if (!role) return
    const channel = supabase
      .channel(`emergency-${role}-${Math.random().toString(36).slice(2,6)}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'emergency_alerts',
      }, (payload) => onAlert(payload.new))
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [role])
}

// Announcements
export function useAnnouncements(onNew) {
  useEffect(() => {
    const channel = supabase
      .channel(`announcements-${Math.random().toString(36).slice(2,6)}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'announcements',
      }, (payload) => onNew(payload.new))
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])
}
