import { useEffect } from 'react'
import { supabase } from '../supabaseClient'

// Subscribes to incoming calls for a specific flat (resident)
// Uses BOTH postgres_changes AND broadcast as backup
export function useIncomingCall(flatId, onIncoming) {
  useEffect(() => {
    if (!flatId) return

    // Method 1: Postgres realtime changes
    const dbChannel = supabase
      .channel(`calls-db:${flatId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'calls',
        filter: `flat_id=eq.${flatId}`,
      }, (payload) => {
        console.log('Incoming call via DB:', payload.new)
        if (payload.new.status === 'ringing') onIncoming(payload.new)
      })
      .subscribe((status) => {
        console.log('DB subscription status:', status)
      })

    // Method 2: Broadcast channel as backup
    const broadcastChannel = supabase
      .channel(`calls-broadcast:${flatId}`)
      .on('broadcast', { event: 'incoming_call' }, (payload) => {
        console.log('Incoming call via broadcast:', payload)
        if (payload.payload?.flatId === flatId) onIncoming(payload.payload)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(dbChannel)
      supabase.removeChannel(broadcastChannel)
    }
  }, [flatId])
}

// Guard watches for call status updates
export function useCallStatusUpdate(callId, onUpdate) {
  useEffect(() => {
    if (!callId) return
    const channel = supabase
      .channel(`call-status:${callId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'calls',
        filter: `id=eq.${callId}`,
      }, (payload) => onUpdate(payload.new))
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [callId])
}

// All roles subscribe to emergency alerts
export function useEmergencyAlerts(role, onAlert) {
  useEffect(() => {
    if (!role) return
    const channel = supabase
      .channel('emergency-alerts')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'emergency_alerts',
      }, (payload) => onAlert(payload.new))
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [role])
}

// All roles subscribe to new announcements
export function useAnnouncements(onNew) {
  useEffect(() => {
    const channel = supabase
      .channel('announcements')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'announcements',
      }, (payload) => onNew(payload.new))
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])
}
