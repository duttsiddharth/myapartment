import { useState, useRef, useCallback } from 'react'
import { supabase } from '../supabaseClient'

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
]

export function useVoiceCall() {
  const [callState, setCallState]       = useState('idle')
  const [isMuted, setIsMuted]           = useState(false)
  const [error, setError]               = useState(null)
  const [callDuration, setCallDuration] = useState(0)

  const pcRef          = useRef(null)
  const localStreamRef = useRef(null)
  const remoteAudioRef = useRef(null)
  const sendChannelRef = useRef(null)  // channel this peer sends on
  const recvChannelRef = useRef(null)  // channel this peer receives on
  const timerRef       = useRef(null)
  const storedOfferRef = useRef(null)

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
    try { supabase.removeChannel(sendChannelRef.current) } catch {}
    try { supabase.removeChannel(recvChannelRef.current) } catch {}
    sendChannelRef.current = null
    recvChannelRef.current = null
    storedOfferRef.current = null
  }, [])

  const setupAudio = (stream) => {
    if (!remoteAudioRef.current) {
      const audio = document.createElement('audio')
      audio.autoplay = true
      audio.playsInline = true
      audio.style.display = 'none'
      document.body.appendChild(audio)
      remoteAudioRef.current = audio
    }
    remoteAudioRef.current.srcObject = stream
    remoteAudioRef.current.play().catch(console.error)
    setCallState('connected')
    clearInterval(timerRef.current)
    timerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000)
  }

  const createPC = useCallback(() => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    pcRef.current = pc
    pc.ontrack = (e) => {
      console.log('🔊 Remote audio!')
      setupAudio(e.streams[0])
    }
    pc.onconnectionstatechange = () => {
      console.log('PC:', pc.connectionState)
      if (pc.connectionState === 'connected') {
        setCallState('connected')
        clearInterval(timerRef.current)
        timerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000)
      }
      if (['failed','disconnected'].includes(pc.connectionState)) endCall()
    }
    return pc
  }, [])

  // ── GUARD: creates offer, listens for resident_ready ──────────────
  const joinCall = useCallback(async (channelName) => {
    try {
      cleanup()
      setError(null)
      setCallState('calling')

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      localStreamRef.current = stream

      const pc = createPC()
      stream.getTracks().forEach(t => pc.addTrack(t, stream))

      // Guard sends on 'guard->{channelName}', receives on 'resident->{channelName}'
      const sendCh = supabase.channel(`guard-${channelName}`)
      const recvCh = supabase.channel(`resident-${channelName}`)
      sendChannelRef.current = sendCh
      recvChannelRef.current = recvCh

      // ICE candidates → send to resident channel
      pc.onicecandidate = ({ candidate }) => {
        if (!candidate) return
        sendCh.send({
          type: 'broadcast', event: 'ice',
          payload: { candidate: candidate.toJSON() }
        }).catch(console.error)
      }

      // Create offer immediately
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      storedOfferRef.current = { type: offer.type, sdp: offer.sdp }
      console.log('Offer ready ✅')

      // Listen on resident channel for: ready signal, answer, ICE
      recvCh
        .on('broadcast', { event: 'ready' }, async () => {
          console.log('Resident ready → sending offer')
          await sendCh.send({
            type: 'broadcast', event: 'offer',
            payload: { sdp: storedOfferRef.current }
          })
          console.log('Offer sent ✅')
        })
        .on('broadcast', { event: 'answer' }, async ({ payload }) => {
          console.log('Got answer ✅')
          if (pc.signalingState === 'have-local-offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
          }
        })
        .on('broadcast', { event: 'ice' }, async ({ payload }) => {
          if (pc.remoteDescription && payload.candidate) {
            await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)).catch(console.error)
          }
        })
        .subscribe((s) => console.log('Guard recv channel:', s))

      sendCh.subscribe((s) => console.log('Guard send channel:', s))

    } catch (e) {
      console.error('Guard error:', e)
      setError(e.message)
      setCallState('idle')
      cleanup()
    }
  }, [createPC, cleanup])

  // ── RESIDENT: listens for offer, sends answer ─────────────────────
  const answerCall = useCallback(async (channelName) => {
    try {
      cleanup()
      setError(null)
      setCallState('calling')

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      localStreamRef.current = stream

      const pc = createPC()
      stream.getTracks().forEach(t => pc.addTrack(t, stream))

      // Resident sends on 'resident->{channelName}', receives on 'guard->{channelName}'
      const sendCh = supabase.channel(`resident-${channelName}`)
      const recvCh = supabase.channel(`guard-${channelName}`)
      sendChannelRef.current = sendCh
      recvChannelRef.current = recvCh

      // ICE → send to guard channel
      pc.onicecandidate = ({ candidate }) => {
        if (!candidate) return
        sendCh.send({
          type: 'broadcast', event: 'ice',
          payload: { candidate: candidate.toJSON() }
        }).catch(console.error)
      }

      let answered = false

      // Listen on guard channel for offer and ICE
      recvCh
        .on('broadcast', { event: 'offer' }, async ({ payload }) => {
          if (answered) return
          answered = true
          console.log('Got offer → creating answer')
          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          await sendCh.send({
            type: 'broadcast', event: 'answer',
            payload: { sdp: { type: answer.type, sdp: answer.sdp } }
          })
          console.log('Answer sent ✅')
        })
        .on('broadcast', { event: 'ice' }, async ({ payload }) => {
          if (pc.remoteDescription && payload.candidate) {
            await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)).catch(console.error)
          }
        })
        .subscribe((s) => {
          console.log('Resident recv channel:', s)
          if (s === 'SUBSCRIBED') {
            // Signal ready after short delay
            setTimeout(async () => {
              console.log('Sending ready signal...')
              await sendCh.send({
                type: 'broadcast', event: 'ready',
                payload: { ok: true }
              })
              console.log('Ready sent ✅')
            }, 800)
          }
        })

      sendCh.subscribe((s) => console.log('Resident send channel:', s))

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

  return { callState, isMuted, error, callDuration: fmt(callDuration), joinCall, answerCall, endCall, toggleMute }
}
