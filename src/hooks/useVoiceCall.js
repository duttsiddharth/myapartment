import { useState, useRef, useCallback } from 'react'

const DAILY_API_KEY = '37beeb1fa7be79be512fbf84267e0c03e9911ce1fa5b4368f851176ec3f277cc'
const DAILY_DOMAIN  = 'siddharthdutt.daily.co'

export function useVoiceCall() {
  const [callState, setCallState]       = useState('idle')
  const [isMuted, setIsMuted]           = useState(false)
  const [error, setError]               = useState(null)
  const [callDuration, setCallDuration] = useState(0)

  const callFrameRef  = useRef(null)
  const timerRef      = useRef(null)
  const containerRef  = useRef(null)

  const loadDailySDK = () => new Promise((resolve, reject) => {
    if (window.DailyIframe) return resolve()
    const script = document.createElement('script')
    script.src = 'https://unpkg.com/@daily-co/daily-js'
    script.crossOrigin = 'anonymous'
    script.onload = resolve
    script.onerror = () => reject(new Error('Failed to load Daily.co SDK'))
    document.head.appendChild(script)
  })

  const createRoom = async (roomName) => {
    const safeName = roomName.replace(/[^a-zA-Z0-9-]/g, '-').slice(0, 40)
    // Try to delete existing room first (ignore errors)
    await fetch(`https://api.daily.co/v1/rooms/${safeName}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${DAILY_API_KEY}` }
    }).catch(() => {})

    const res = await fetch('https://api.daily.co/v1/rooms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DAILY_API_KEY}`,
      },
      body: JSON.stringify({
        name: safeName,
        properties: {
          exp: Math.floor(Date.now() / 1000) + 3600,
          max_participants: 2,
          enable_chat: false,
          enable_screenshare: false,
          start_video_off: true,
          start_audio_off: false,
          enable_knocking: false,
        }
      })
    })
    const data = await res.json()
    if (!res.ok) throw new Error(`Room error: ${data.error || res.status}`)
    return `https://${DAILY_DOMAIN}/${safeName}`
  }

  const joinCall = useCallback(async (channelName) => {
    try {
      setError(null)
      setCallState('calling')

      await loadDailySDK()

      // Build room URL directly — guard already created it
      const safeName = channelName.replace(/[^a-zA-Z0-9-]/g, '-').slice(0, 40)
      const roomUrl = `https://${DAILY_DOMAIN}/${safeName}`

      // If guard: create the room first
      // If resident: room already exists, just join
      try {
        await fetch('https://api.daily.co/v1/rooms', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${DAILY_API_KEY}`,
          },
          body: JSON.stringify({
            name: safeName,
            properties: {
              exp: Math.floor(Date.now() / 1000) + 3600,
              max_participants: 2,
              enable_chat: false,
              enable_screenshare: false,
              start_video_off: true,
              start_audio_off: false,
            }
          })
        })
      } catch {
        // Room already exists or API unavailable — proceed to join anyway
        console.log('Room may already exist, proceeding to join:', roomUrl)
      }

      // Remove existing container
      if (containerRef.current) containerRef.current.remove()

      const container = document.createElement('div')
      container.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;bottom:0;right:0;'
      document.body.appendChild(container)
      containerRef.current = container

      // Destroy existing frame
      if (callFrameRef.current) {
        try { callFrameRef.current.destroy() } catch {}
        callFrameRef.current = null
      }

      const frame = window.DailyIframe.createFrame(container, {
        showLeaveButton: false,
        showFullscreenButton: false,
        iframeStyle: { width: '1px', height: '1px', border: 'none' },
      })
      callFrameRef.current = frame

      frame.on('joined-meeting', () => {
        setCallState('connected')
        clearInterval(timerRef.current)
        timerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000)
      })

      frame.on('participant-joined', () => {
        setCallState('connected')
      })

      frame.on('left-meeting', () => {
        endCall()
      })

      frame.on('error', (e) => {
        console.error('Daily error:', e)
        setError(e.errorMsg || 'Voice call error')
        setCallState('idle')
      })

      await frame.join({
        url: roomUrl,
        startVideoOff: true,
        startAudioOff: false,
      })

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
    setTimeout(() => { setCallState('idle'); setError(null) }, 1500)
  }, [])

  const cleanup = async () => {
    try {
      if (callFrameRef.current) {
        await callFrameRef.current.leave().catch(() => {})
        callFrameRef.current.destroy()
        callFrameRef.current = null
      }
    } catch {}
    try {
      if (containerRef.current) {
        containerRef.current.remove()
        containerRef.current = null
      }
    } catch {}
  }

  const toggleMute = useCallback(async () => {
    if (callFrameRef.current) {
      const muted = !isMuted
      await callFrameRef.current.setLocalAudio(!muted)
      setIsMuted(muted)
    }
  }, [isMuted])

  const fmt = (s) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`

  return { callState, isMuted, error, callDuration: fmt(callDuration), joinCall, endCall, toggleMute }
}
