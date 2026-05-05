import { useState, useRef, useCallback } from 'react'
import { supabase } from '../supabaseClient'

// Lazy-load Agora SDK to avoid SSR issues
let AgoraRTC = null
const getAgora = async () => {
  if (!AgoraRTC) {
    const mod = await import('agora-rtc-sdk-ng')
    AgoraRTC = mod.default
    AgoraRTC.setLogLevel(4) // errors only
  }
  return AgoraRTC
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export function useVoiceCall() {
  const [callState, setCallState] = useState('idle') // idle | calling | connected | ended
  const [isMuted, setIsMuted]     = useState(false)
  const [error, setError]         = useState(null)
  const [callDuration, setCallDuration] = useState(0)

  const clientRef       = useRef(null)
  const localTrackRef   = useRef(null)
  const timerRef        = useRef(null)
  const channelRef      = useRef(null)

  // Get Agora token from Edge Function, fallback to no-token mode for testing
  const getToken = async (channelName) => {
    const appId = import.meta.env.VITE_AGORA_APP_ID
    if (!appId) throw new Error('VITE_AGORA_APP_ID not set in Vercel environment variables')

    // Try Edge Function first (production)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-agora-token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ channelName, uid: 0 }),
        })
        if (res.ok) return res.json()
      }
    } catch (e) {
      console.warn('Edge function unavailable, using no-token mode:', e.message)
    }

    // Fallback: no token (works in Agora testing mode — disable App Certificate in Agora console)
    return { token: null, appId, channelName }
  }

  // Join a voice channel (called by both guard and resident)
  const joinCall = useCallback(async (channelName) => {
    try {
      setError(null)
      setCallState('calling')
      channelRef.current = channelName

      const Agora = await getAgora()

      // Create client
      const client = Agora.createClient({ mode: 'rtc', codec: 'vp8' })
      clientRef.current = client

      // Listen for remote users (resident joining)
      client.on('user-published', async (user, mediaType) => {
        await client.subscribe(user, mediaType)
        if (mediaType === 'audio') {
          user.audioTrack?.play()
          setCallState('connected')
          // Start timer
          timerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000)
        }
      })

      client.on('user-unpublished', () => {
        // Remote hung up
        endCall()
      })

      client.on('user-left', () => {
        endCall()
      })

      // Get token from Edge Function
      const { token, appId } = await getToken(channelName)

      // Join the channel
      await client.join(appId, channelName, token, null)

      // Create and publish microphone track
      const micTrack = await Agora.createMicrophoneAudioTrack({
        encoderConfig: 'speech_low_quality', // optimised for voice
        AEC: true,  // acoustic echo cancellation
        ANS: true,  // ambient noise suppression
        AGC: true,  // auto gain control
      })
      localTrackRef.current = micTrack
      await client.publish(micTrack)

      // If no one joins in 45 seconds → mark as missed
      const missedTimer = setTimeout(() => {
        if (callState !== 'connected') {
          endCall('missed')
        }
      }, 45000)

      // Clear missed timer when connected
      client.on('user-published', () => clearTimeout(missedTimer))

    } catch (e) {
      console.error('Voice call error:', e)
      setError(e.message || 'Could not start voice call')
      setCallState('idle')
      cleanup()
    }
  }, [])

  const endCall = useCallback(async (status = 'ended') => {
    clearInterval(timerRef.current)
    setCallState(status === 'missed' ? 'missed' : 'ended')
    setCallDuration(0)
    await cleanup()
    setTimeout(() => setCallState('idle'), 2000)
  }, [])

  const cleanup = async () => {
    try {
      localTrackRef.current?.stop()
      localTrackRef.current?.close()
      localTrackRef.current = null
      if (clientRef.current) {
        await clientRef.current.leave()
        clientRef.current = null
      }
    } catch (e) {
      console.error('Cleanup error:', e)
    }
  }

  const toggleMute = useCallback(() => {
    if (localTrackRef.current) {
      const muted = !isMuted
      localTrackRef.current.setEnabled(!muted)
      setIsMuted(muted)
    }
  }, [isMuted])

  const formatDuration = (s) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  return {
    callState,   // idle | calling | connected | ended | missed
    isMuted,
    error,
    callDuration: formatDuration(callDuration),
    joinCall,
    endCall,
    toggleMute,
  }
}
