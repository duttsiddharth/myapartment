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
  const sigChannelRef  = useRef(null)
  const timerRef       = useRef(null)
  const storedOfferRef = useRef(null) // store offer for resending
  const roleRef        = useRef(null) // 'guard' or 'resident'

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
    if (sigChannelRef.current) {
      supabase.removeChannel(sigChannelRef.current)
      sigChannelRef.current = null
    }
    storedOfferRef.current = null
    roleRef.current = null
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
    remoteAudioRef.current.play().catch(e => console.error('Audio play:', e))
    setCallState('connected')
    clearInterval(timerRef.current)
    timerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000)
  }

  const createPC = useCallback((sigChannel) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    pcRef.current = pc

    pc.onicecandidate = ({ candidate }) => {
      if (!candidate) return
      const event = roleRef.current === 'guard' ? 'ice_guard' : 'ice_resident'
      sigChannel.send({
        type: 'broadcast', event,
        payload: { candidate: candidate.toJSON() }
      }).catch(console.error)
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
      roleRef.current = 'guard'

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      localStreamRef.current = stream

      // Use a simple unique channel name
      const sigName = `sig-${channelName}`
      const sigChannel = supabase.channel(sigName, {
        config: { broadcast: { ack: false } }
      })
      sigChannelRef.current = sigChannel

      const pc = createPC(sigChannel)
      stream.getTracks().forEach(t => pc.addTrack(t, stream))

      // Create offer upfront and store it
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      storedOfferRef.current = offer
      console.log('Offer created and ready to send')

      sigChannel
        .on('broadcast', { event: 'resident_ready' }, async () => {
          // Resident subscribed — send the stored offer
          console.log('Resident ready! Sending offer...')
          try {
            await sigChannel.send({
              type: 'broadcast', event: 'offer',
              payload: { sdp: { type: storedOfferRef.current.type, sdp: storedOfferRef.current.sdp } }
            })
            console.log('Offer sent ✅')
          } catch (e) {
            console.error('Failed to send offer:', e)
          }
        })
        .on('broadcast', { event: 'answer' }, async ({ payload }) => {
          console.log('Got answer ✅')
          try {
            if (pc.signalingState === 'have-local-offer') {
              await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
            }
          } catch (e) { console.error('Set remote desc error:', e) }
        })
        .on('broadcast', { event: 'ice_resident' }, async ({ payload }) => {
          try {
            if (pc.remoteDescription && payload.candidate) {
              await pc.addIceCandidate(new RTCIceCandidate(payload.candidate))
            }
          } catch (e) { console.error('ICE error:', e) }
        })
        .subscribe((status) => {
          console.log('Guard signal channel:', status)
        })

    } catch (e) {
      console.error('joinCall error:', e)
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
      roleRef.current = 'resident'

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      localStreamRef.current = stream

      const sigName = `sig-${channelName}`
      const sigChannel = supabase.channel(sigName, {
        config: { broadcast: { ack: false } }
      })
      sigChannelRef.current = sigChannel

      const pc = createPC(sigChannel)
      stream.getTracks().forEach(t => pc.addTrack(t, stream))

      let answered = false

      sigChannel
        .on('broadcast', { event: 'offer' }, async ({ payload }) => {
          if (answered) return
          answered = true
          console.log('Got offer! Creating answer...')
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
            const answer = await pc.createAnswer()
            await pc.setLocalDescription(answer)
            await sigChannel.send({
              type: 'broadcast', event: 'answer',
              payload: { sdp: { type: answer.type, sdp: answer.sdp } }
            })
            console.log('Answer sent ✅')
          } catch (e) {
            console.error('Answer error:', e)
          }
        })
        .on('broadcast', { event: 'ice_guard' }, async ({ payload }) => {
          try {
            if (pc.remoteDescription && payload.candidate) {
              await pc.addIceCandidate(new RTCIceCandidate(payload.candidate))
            }
          } catch (e) { console.error('ICE error:', e) }
        })
        .subscribe(async (status) => {
          console.log('Resident signal channel:', status)
          if (status === 'SUBSCRIBED') {
            // Small delay to ensure guard channel is ready
            setTimeout(async () => {
              console.log('Sending resident_ready...')
              try {
                await sigChannel.send({
                  type: 'broadcast', event: 'resident_ready',
                  payload: { ready: true }
                })
                console.log('resident_ready sent ✅')
              } catch (e) {
                console.error('Failed to send resident_ready:', e)
              }
            }, 500)
          }
        })

    } catch (e) {
      console.error('answerCall error:', e)
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
    joinCall,
    answerCall,
    endCall,
    toggleMute,
  }
}
