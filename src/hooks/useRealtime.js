import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'

// Subscribes to incoming calls for a specific flat (resident)
export function useIncomingCall(flatId, onIncoming) {
  useEffect(() => {
    if (!flatId) return
    const channel = supabase
      .channel(`calls:${flatId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'calls',
        filter: `flat_id=eq.${flatId}`,
      }, (payload) => {
        if (payload.new.status === 'ringing') onIncoming(payload.new)
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [flatId])
}

// Guard watches for call status updates (accepted/denied by resident)
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
