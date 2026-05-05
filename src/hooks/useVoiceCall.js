import { useState, useRef, useCallback } from 'react'

// Daily.co WebRTC voice calls
// Free tier: 10,000 minutes/month — more than enough for 200 flats
// No App Certificate needed — just an API key

const DAILY_API_KEY = import.meta.env.VITE_DAILY_API_KEY || '37beeb1fa7be79be512fbf84267e0c03e9911ce1fa5b4368f851176ec3f277cc'
const DAILY_DOMAIN  = import.meta.env.VITE_DAILY_DOMAIN  || 'siddharthdutt.daily.co'

export function useVoiceCall() {
  const [callState, setCallState]       = useState('idle')
  const [isMuted, setIsMuted]           = useState(false)
  const [error, setError]               = useState(null)
  const [callDuration, setCallDuration] = useState(0)

  const callFrameRef  = useRef(null)
  const timerRef      = useRef(null)
  const containerRef  = useRef(null)

  const createOrGetRoom = async (channelName) => {
    // Create a Daily room via their API
    const res = await fetch('https://api.daily.co/v1/rooms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DAILY_API_KEY}`,
      },
      body: JSON.stringify({
        name: channelName.replace(/[^a-zA-Z0-9-]/g, '-').slice(0, 40),
        properties: {
          exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour expiry
          max_participants: 2,
          enable_chat: false,
          enable_screenshare: false,
          start_audio_off: false,
          start_video_off: true,  // audio only — no video
        }
      })
    })
    if (!res.ok) {
      const err = await res.json()
      // Room may already exist — try to get it
      if (err.error === 'invalid-request-error') {
        const getRes = await fetch(`https://api.daily.co/v1/rooms/${channelName.replace(/[^a-zA-Z0-9-]/g, '-').slice(0, 40)}`, {
          headers: { 'Authorization': `Bearer ${DAILY_API_KEY}` }
        })
        if (getRes.ok) return getRes.json()
      }
      throw new Error(`Daily room error: ${err.error || res.status}`)
    }
    return res.json()
  }

  const joinCall = useCallback(async (channelName) => {
    try {
      setError(null)
      setCallState('calling')

      if (!DAILY_API_KEY || !DAILY_DOMAIN) {
        throw new Error('Daily.co not configured. Add VITE_DAILY_API_KEY and VITE_DAILY_DOMAIN to Vercel.')
      }

      // Create room
      const room = await createOrGetRoom(channelName)
      const roomUrl = room.url

      // Load Daily.co SDK dynamically
      if (!window.DailyIframe) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script')
          script.src = 'https://unpkg.com/@daily-co/daily-js'
          script.onload = resolve
          script.onerror = reject
          document.head.appendChild(script)
        })
      }

      // Create invisible iframe for audio-only call
      const container = document.createElement('div')
      container.style.cssText = 'position:fixed;bottom:0;right:0;width:1px;height:1px;opacity:0;pointer-events:none;'
      document.body.appendChild(container)
      containerRef.current = container

      const frame = window.DailyIframe.createFrame(container, {
        showLeaveButton: false,
        showFullscreenButton: false,
        iframeStyle: { width: '1px', height: '1px' },
      })
      callFrameRef.current = frame

      frame.on('joined-meeting', () => {
        setCallState('connected')
        timerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000)
      })

      frame.on('participant-joined', () => {
        setCallState('connected')
      })

      frame.on('left-meeting', () => {
        endCall()
      })

      frame.on('error', (e) => {
        setError(e.errorMsg || 'Voice call error')
        setCallState('idle')
        cleanup()
      })

      await frame.join({ url: roomUrl, startVideoOff: true, startAudioOff: false })

    } catch (e) {
      console.error('Voice call error:', e)
      setError(e.message || 'Could not start voice call')
      setCallState('idle')
      cleanup()
    }
  }, [])

  const endCall = useCallback(async () => {
    clearInterval(timerRef.current)
    setCallDuration(0)
    setCallState('ended')
    await cleanup()
    setTimeout(() => setCallState('idle'), 1500)
  }, [])

  const cleanup = async () => {
    try {
      if (callFrameRef.current) {
        await callFrameRef.current.leave()
        callFrameRef.current.destroy()
        callFrameRef.current = null
      }
      if (containerRef.current) {
        containerRef.current.remove()
        containerRef.current = null
      }
    } catch (e) { console.error('Cleanup:', e) }
  }

  const toggleMute = useCallback(async () => {
    if (callFrameRef.current) {
      const muted = !isMuted
      await callFrameRef.current.setLocalAudio(!muted)
      setIsMuted(muted)
    }
  }, [isMuted])

  const formatDuration = (s) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  return {
    callState,
    isMuted,
    error,
    callDuration: formatDuration(callDuration),
    joinCall,
    endCall,
    toggleMute,
  }
}
