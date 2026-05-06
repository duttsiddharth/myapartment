import { useEffect } from 'react'
import { supabase } from '../supabaseClient'

export function useIncomingCall(flatId, onIncoming) {
  useEffect(() => {
    if (!flatId) return
    console.log('Subscribing to incoming calls for flat:', flatId)

    const channel = supabase
      .channel(`incoming-call-${flatId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'calls',
        filter: `flat_id=eq.${flatId}`,
      }, (payload) => {
        console.log('📞 Incoming call received:', payload.new)
        if (payload.new.status === 'ringing') onIncoming(payload.new)
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

export function useCallStatusUpdate(callId, onUpdate) {
  useEffect(() => {
    if (!callId) return
    const channel = supabase
      .channel(`call-update-${callId}`)
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

export function useEmergencyAlerts(role, onAlert) {
  useEffect(() => {
    if (!role) return
    const channel = supabase
      .channel(`emergency-${role}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'emergency_alerts',
      }, (payload) => onAlert(payload.new))
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [role])
}

export function useAnnouncements(onNew) {
  useEffect(() => {
    const channel = supabase
      .channel('announcements-live')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'announcements',
      }, (payload) => onNew(payload.new))
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])
}
