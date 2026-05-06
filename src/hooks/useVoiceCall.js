import { useState, useRef, useCallback } from 'react'
import { supabase } from '../supabaseClient'

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
]

// Send a signal via Supabase DB (reliable, uses postgres_changes)
const sendSignal = async (channel, type, payload) => {
  const { error } = await supabase.from('webrtc_signals').insert({
    channel, type, payload
  })
  if (error) console.error('Signal send error:', error)
  else console.log(`Signal sent: ${type}`)
}

// Subscribe to signals for a channel, filtered by type
const subscribeSignals = (channel, types, handler) => {
  const sub = supabase
    .channel(`signals-${channel}-${Math.random().toString(36).slice(2,8)}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'webrtc_signals',
      filter: `channel=eq.${channel}`,
    }, (payload) => {
      const sig = payload.new
      if (types.includes(sig.type)) {
        console.log(`Signal received: ${sig.type}`)
        handler(sig.type, sig.payload)
      }
    })
    .subscribe((status) => console.log(`Signal sub [${channel}]:`, status))
  return sub
}

export function useVoiceCall() {
  const [callState, setCallState]       = useState('idle')
  const [isMuted, setIsMuted]           = useState(false)
  const [error, setError]               = useState(null)
  const [callDuration, setCallDuration] = useState(0)

  const pcRef          = useRef(null)
  const localStreamRef = useRef(null)
  const remoteAudioRef = useRef(null)
  const subRef         = useRef(null)
  const timerRef       = useRef(null)
  const storedOfferRef = useRef(null)
  const channelRef     = useRef(null)

  const fmt = (s) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`

  const cleanup = useCallback(() => {
    clearInterval(timerRef.current)
    localStreamRef.current?.getTracks().forEach(t => t.stop())
    localStreamRef.current = null
    try { pcRef.current?.close() } catch {}
    pcRef.current = null
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null
      try { document.body.removeChild(remoteAudioRef.current) } catch {}
      remoteAudioRef.current = null
    }
    try { supabase.removeChannel(subRef.current) } catch {}
    subRef.current = null
    storedOfferRef.current = null
    // Clean up old signals
    if (channelRef.current) {
      supabase.from('webrtc_signals').delete().eq('channel', channelRef.current).then(() => {})
      channelRef.current = null
    }
  }, [])

  const setupAudio = (stream) => {
    console.log('Setting up audio stream...')
    const audio = remoteAudioRef.current
    if (!audio) {
      console.error('No audio element found!')
      return
    }
    // Clear the silence placeholder and set real stream
    audio.srcObject = stream
    audio.muted = false
    audio.volume = 1.0
    audio.play()
      .then(() => console.log('🔊 Audio playing!'))
      .catch(e => console.error('Audio play failed:', e))
    setCallState('connected')
    clearInterval(timerRef.current)
    timerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000)
  }

  const createPC = useCallback((channelName, role) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    pcRef.current = pc

    const iceType = role === 'guard' ? 'ice_guard' : 'ice_resident'
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        sendSignal(channelName, iceType, { candidate: candidate.toJSON() })
      }
    }

    pc.ontrack = (e) => {
      console.log('🔊 Remote audio received!')
      setupAudio(e.streams[0])
    }

    pc.onconnectionstatechange = () => {
      console.log('PC state:', pc.connectionState)
      if (pc.connectionState === 'connected') {
        setCallState('connected')
        clearInterval(timerRef.current)
        timerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000)
      }
      if (['failed', 'disconnected'].includes(pc.connectionState)) {
        endCall()
      }
    }

    return pc
  }, [])

  // ── GUARD ─────────────────────────────────────────────────────────
  const joinCall = useCallback(async (channelName) => {
    try {
      cleanup()
      setError(null)
      setCallState('calling')
      channelRef.current = channelName

      // Pre-create and unlock audio during user gesture
      const audio = document.createElement('audio')
      audio.autoplay = true
      audio.playsInline = true
      audio.muted = false
      audio.volume = 1.0
      audio.style.cssText = 'position:fixed;bottom:0;left:0;width:1px;height:1px;opacity:0.01;'
      document.body.appendChild(audio)
      remoteAudioRef.current = audio
      audio.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='
      audio.play().catch(() => {})

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      localStreamRef.current = stream

      const pc = createPC(channelName, 'guard')
      stream.getTracks().forEach(t => pc.addTrack(t, stream))

      // Create and store offer
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      storedOfferRef.current = { type: offer.type, sdp: offer.sdp }
      console.log('Offer ready ✅')

      // Subscribe to incoming signals: ready, answer, ice_resident
      subRef.current = subscribeSignals(channelName, ['ready', 'answer', 'ice_resident'], async (type, payload) => {
        if (type === 'ready') {
          console.log('Resident ready → sending offer via DB')
          await sendSignal(channelName, 'offer', storedOfferRef.current)
        }
        if (type === 'answer') {
          if (pc.signalingState === 'have-local-offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(payload))
            console.log('Remote description set ✅')
          }
        }
        if (type === 'ice_resident' && pc.remoteDescription && payload.candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)).catch(console.error)
        }
      })

    } catch (e) {
      console.error('Guard error:', e)
      setError(e.message)
      setCallState('idle')
      cleanup()
    }
  }, [createPC, cleanup])

  // ── RESIDENT ──────────────────────────────────────────────────────
  const answerCall = useCallback(async (channelName) => {
    try {
      cleanup()
      setError(null)
      setCallState('calling')
      channelRef.current = channelName

      // Pre-create audio element NOW during user gesture (tap Accept)
      // This is critical — Chrome blocks audio.play() unless initiated by user gesture
      const audio = document.createElement('audio')
      audio.autoplay = true
      audio.playsInline = true
      audio.muted = false
      audio.volume = 1.0
      audio.style.cssText = 'position:fixed;bottom:0;left:0;width:1px;height:1px;opacity:0.01;'
      document.body.appendChild(audio)
      remoteAudioRef.current = audio
      // Play silence to unlock audio context during user gesture
      audio.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='
      audio.play().catch(() => {})

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      localStreamRef.current = stream

      const pc = createPC(channelName, 'resident')
      stream.getTracks().forEach(t => pc.addTrack(t, stream))

      let answered = false

      // Subscribe to incoming signals: offer, ice_guard
      subRef.current = subscribeSignals(channelName, ['offer', 'ice_guard'], async (type, payload) => {
        if (type === 'offer' && !answered) {
          answered = true
          console.log('Got offer → creating answer')
          await pc.setRemoteDescription(new RTCSessionDescription(payload))
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          await sendSignal(channelName, 'answer', { type: answer.type, sdp: answer.sdp })
          console.log('Answer sent ✅')
        }
        if (type === 'ice_guard' && pc.remoteDescription && payload.candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)).catch(console.error)
        }
      })

      // Small delay then signal ready
      setTimeout(async () => {
        console.log('Sending ready signal via DB...')
        await sendSignal(channelName, 'ready', { ok: true })
        console.log('Ready sent ✅')
      }, 1000)

    } catch (e) {
      console.error('Resident error:', e)
      setError(e.message)
      setCallState('idle')
      cleanup()
    }
  }, [createPC, cleanup])

  const endCall = useCallback(async () => {
    cleanup()
    setCallState('ended')
    setCallDuration(0)
    setIsMuted(false)
    setTimeout(() => { setCallState('idle'); setError(null) }, 1500)
  }, [cleanup])

  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const muted = !isMuted
      localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !muted })
      setIsMuted(muted)
    }
  }, [isMuted])

  return {
    callState, isMuted, error,
    callDuration: fmt(callDuration),
    joinCall, answerCall, endCall, toggleMute,
  }
}
