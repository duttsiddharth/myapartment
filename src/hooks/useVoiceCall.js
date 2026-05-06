import { useState, useRef, useCallback } from 'react'
import { supabase } from '../supabaseClient'

// Free TURN servers from Metered.ca — reliable NAT traversal for India
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  // Open TURN relay — works even behind strict NAT/firewall
  { urls: 'turn:openrelay.metered.ca:80',    username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443',   username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
]

const sendSignal = async (channel, type, payload) => {
  const { error } = await supabase.from('webrtc_signals').insert({ channel, type, payload })
  if (error) console.error('Signal error:', error)
  else console.log('Signal sent:', type)
}

const subscribeSignals = (channel, types, handler) => {
  return supabase
    .channel(`sig-${channel}-${Math.random().toString(36).slice(2,8)}`)
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'webrtc_signals',
      filter: `channel=eq.${channel}`,
    }, (payload) => {
      const sig = payload.new
      if (types.includes(sig.type)) {
        console.log('Signal received:', sig.type)
        handler(sig.type, sig.payload)
      }
    })
    .subscribe((s) => console.log(`Signal sub [${channel}]:`, s))
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
  const channelRef     = useRef(null)

  const fmt = (s) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`

  const unlockAudio = () => {
    // Create and unlock audio element during user gesture
    if (remoteAudioRef.current) {
      try { document.body.removeChild(remoteAudioRef.current) } catch {}
    }
    const audio = document.createElement('audio')
    audio.autoplay = true
    audio.playsInline = true
    audio.muted = false
    audio.volume = 1.0
    audio.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0.01;bottom:0;left:0;'
    document.body.appendChild(audio)
    // Play 1 second of silence to unlock audio context
    audio.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='
    audio.play().catch(() => {})
    remoteAudioRef.current = audio
    return audio
  }

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
    try { if (subRef.current) supabase.removeChannel(subRef.current) } catch {}
    subRef.current = null
    if (channelRef.current) {
      supabase.from('webrtc_signals').delete().eq('channel', channelRef.current).then(() => {})
      channelRef.current = null
    }
  }, [])

  const createPC = useCallback((channelName, role) => {
    const pc = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
      iceTransportPolicy: 'all',
    })
    pcRef.current = pc

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        const type = role === 'guard' ? 'ice_guard' : 'ice_resident'
        sendSignal(channelName, type, { candidate: candidate.toJSON() })
      }
    }

    pc.oniceconnectionstatechange = () => {
      console.log('ICE state:', pc.iceConnectionState)
    }

    pc.onconnectionstatechange = () => {
      console.log('PC state:', pc.connectionState)
      if (pc.connectionState === 'connected') {
        setCallState('connected')
        clearInterval(timerRef.current)
        timerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000)
      }
      if (['failed', 'disconnected'].includes(pc.connectionState)) {
        setError('Call disconnected')
        endCall()
      }
    }

    pc.ontrack = (e) => {
      console.log('🔊 Remote track received! Kind:', e.track.kind, 'Streams:', e.streams.length)
      const stream = e.streams[0]
      const audio = remoteAudioRef.current
      if (audio) {
        audio.srcObject = stream
        audio.muted = false
        audio.volume = 1.0
        audio.play()
          .then(() => console.log('✅ Audio playing! Tracks:', stream.getAudioTracks().length))
          .catch(err => console.error('Audio play failed:', err))
      } else {
        console.error('No audio element available!')
      }
      setCallState('connected')
      clearInterval(timerRef.current)
      timerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000)
    }

    return pc
  }, [])

  // ── GUARD initiates call ──────────────────────────────────────────
  const joinCall = useCallback(async (channelName) => {
    try {
      cleanup()
      setError(null)
      setCallState('calling')
      channelRef.current = channelName
      unlockAudio() // unlock during user gesture

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false
      })
      localStreamRef.current = stream
      console.log('Mic tracks:', stream.getAudioTracks().map(t => t.label))

      const pc = createPC(channelName, 'guard')
      stream.getTracks().forEach(t => pc.addTrack(t, stream))

      const offer = await pc.createOffer({ offerToReceiveAudio: true })
      await pc.setLocalDescription(offer)
      console.log('Offer ready ✅')

      subRef.current = subscribeSignals(channelName, ['ready', 'answer', 'ice_resident'], async (type, payload) => {
        if (type === 'ready') {
          console.log('Resident ready → sending offer')
          await sendSignal(channelName, 'offer', { type: offer.type, sdp: offer.sdp })
        }
        if (type === 'answer' && pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(payload))
          console.log('Remote desc set ✅')
        }
        if (type === 'ice_resident' && pc.remoteDescription && payload?.candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)).catch(console.error)
        }
      })

    } catch (e) {
      console.error('Guard joinCall error:', e)
      setError(e.message)
      setCallState('idle')
      cleanup()
    }
  }, [createPC, cleanup])

  // ── RESIDENT answers call ─────────────────────────────────────────
  const answerCall = useCallback(async (channelName) => {
    try {
      cleanup()
      setError(null)
      setCallState('calling')
      channelRef.current = channelName
      unlockAudio() // unlock during user gesture

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false
      })
      localStreamRef.current = stream
      console.log('Mic tracks:', stream.getAudioTracks().map(t => t.label))

      const pc = createPC(channelName, 'resident')
      stream.getTracks().forEach(t => pc.addTrack(t, stream))

      let answered = false

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
        if (type === 'ice_guard' && pc.remoteDescription && payload?.candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)).catch(console.error)
        }
      })

      // Signal ready after 1 second
      setTimeout(async () => {
        await sendSignal(channelName, 'ready', { ok: true })
        console.log('Ready sent ✅')
      }, 1000)

    } catch (e) {
      console.error('Resident answerCall error:', e)
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

  return { callState, isMuted, error, callDuration: fmt(callDuration), joinCall, answerCall, endCall, toggleMute }
}
