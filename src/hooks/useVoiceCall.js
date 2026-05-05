```javascript
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
  const storedOfferRef = useRef(null)
  const roleRef        = useRef(null)

  const fmt = (s) =>
    `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`

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
    remoteAudioRef.current.play().catch(console.error)

    setCallState('connected')
    clearInterval(timerRef.current)
    timerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000)
  }

  // 🔁 Reconnectable channel creator
  const createChannel = (name) => {
    const channel = supabase.channel(name, {
      config: { broadcast: { ack: false } }
    })

    channel.subscribe((status) => {
      console.log('Channel status:', status)

      if (status === 'SUBSCRIBED') {
        console.log('✅ Channel ready')
      }

      if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
        console.warn('❌ Channel closed. Reconnecting...')
        setTimeout(() => {
          if (sigChannelRef.current) {
            supabase.removeChannel(sigChannelRef.current)
          }
          sigChannelRef.current = createChannel(name)
        }, 1000)
      }
    })

    return channel
  }

  const createPC = useCallback((sigChannel) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    pcRef.current = pc

    pc.onicecandidate = ({ candidate }) => {
      if (!candidate) return
      const event = roleRef.current === 'guard' ? 'ice_guard' : 'ice_resident'

      sigChannel.httpSend({
        type: 'broadcast',
        event,
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

    pc.oniceconnectionstatechange = () => {
      console.log('ICE state:', pc.iceConnectionState)
    }

    return pc
  }, [])

  // ── GUARD ─────────────────────────────
  const joinCall = useCallback(async (channelName) => {
    try {
      cleanup()
      setError(null)
      setCallState('calling')
      roleRef.current = 'guard'

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      localStreamRef.current = stream

      const sigName = `sig-${channelName}`
      const sigChannel = createChannel(sigName)
      sigChannelRef.current = sigChannel

      const pc = createPC(sigChannel)
      stream.getTracks().forEach(t => pc.addTrack(t, stream))

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      storedOfferRef.current = offer

      console.log('Offer ready')

      sigChannel
        .on('broadcast', { event: 'resident_ready' }, async () => {
          console.log('Resident ready → sending offer')

          setTimeout(async () => {
            await sigChannel.httpSend({
              type: 'broadcast',
              event: 'offer',
              payload: {
                sdp: {
                  type: storedOfferRef.current.type,
                  sdp: storedOfferRef.current.sdp
                }
              }
            })
          }, 1000)
        })
        .on('broadcast', { event: 'answer' }, async ({ payload }) => {
          try {
            if (pc.signalingState === 'have-local-offer') {
              await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
            }
          } catch (e) {
            console.error('Answer error:', e)
          }
        })
        .on('broadcast', { event: 'ice_resident' }, async ({ payload }) => {
          try {
            if (pc.remoteDescription && payload.candidate) {
              await pc.addIceCandidate(new RTCIceCandidate(payload.candidate))
            }
          } catch (e) {
            console.error('ICE error:', e)
          }
        })

    } catch (e) {
      console.error(e)
      setError(e.message)
      cleanup()
    }
  }, [createPC, cleanup])

  // ── RESIDENT ─────────────────────────────
  const answerCall = useCallback(async (channelName) => {
    try {
      cleanup()
      setError(null)
      setCallState('calling')
      roleRef.current = 'resident'

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      localStreamRef.current = stream

      const sigName = `sig-${channelName}`
      const sigChannel = createChannel(sigName)
      sigChannelRef.current = sigChannel

      const pc = createPC(sigChannel)
      stream.getTracks().forEach(t => pc.addTrack(t, stream))

      sigChannel
        .on('broadcast', { event: 'offer' }, async ({ payload }) => {
          console.log('Offer received')

          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)

          await sigChannel.httpSend({
            type: 'broadcast',
            event: 'answer',
            payload: {
              sdp: {
                type: answer.type,
                sdp: answer.sdp
              }
            }
          })
        })
        .on('broadcast', { event: 'ice_guard' }, async ({ payload }) => {
          try {
            if (pc.remoteDescription && payload.candidate) {
              await pc.addIceCandidate(new RTCIceCandidate(payload.candidate))
            }
          } catch (e) {
            console.error(e)
          }
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            setTimeout(async () => {
              console.log('Sending resident_ready')
              await sigChannel.httpSend({
                type: 'broadcast',
                event: 'resident_ready',
                payload: { ready: true }
              })
            }, 1000)
          }
        })

    } catch (e) {
      console.error(e)
      setError(e.message)
      cleanup()
    }
  }, [createPC, cleanup])

  const endCall = useCallback(() => {
    cleanup()
    setCallState('ended')
    setCallDuration(0)
    setIsMuted(false)

    setTimeout(() => {
      setCallState('idle')
      setError(null)
    }, 1500)
  }, [cleanup])

  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const muted = !isMuted
      localStreamRef.current.getAudioTracks().forEach(t => {
        t.enabled = !muted
      })
      setIsMuted(muted)
    }
  }, [isMuted])

  return {
    callState,
    isMuted,
    error,
    callDuration: fmt(callDuration),
    joinCall,
    answerCall,
    endCall,
    toggleMute,
  }
}
```
