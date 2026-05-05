import { useState, useRef, useCallback } from 'react'
import { supabase } from '../supabaseClient'

// Pure WebRTC voice call — no third party SDK
// Uses Supabase Realtime as signaling channel
// Works on Chrome laptop + Chrome/Safari mobile

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

  const pcRef          = useRef(null)  // RTCPeerConnection
  const localStreamRef = useRef(null)  // local mic stream
  const remoteAudioRef = useRef(null)  // remote audio element
  const sigChannelRef  = useRef(null)  // supabase signaling channel
  const timerRef       = useRef(null)
  const channelNameRef = useRef(null)

  const fmt = (s) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`

  // ── Cleanup ───────────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    clearInterval(timerRef.current)
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop())
      localStreamRef.current = null
    }
    if (pcRef.current) {
      pcRef.current.close()
      pcRef.current = null
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null
      remoteAudioRef.current = null
    }
    if (sigChannelRef.current) {
      supabase.removeChannel(sigChannelRef.current)
      sigChannelRef.current = null
    }
  }, [])

  // ── Create PeerConnection ─────────────────────────────────────────
  const createPC = useCallback((sigChannel, isInitiator) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    pcRef.current = pc

    // Send ICE candidates to remote peer via Supabase
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        sigChannel.send({
          type: 'broadcast',
          event: 'ice',
          payload: { candidate: candidate.toJSON() }
        })
      }
    }

    // Play remote audio
    pc.ontrack = (e) => {
      console.log('Got remote track:', e.track.kind)
      if (!remoteAudioRef.current) {
        const audio = new Audio()
        audio.autoplay = true
        audio.playsInline = true
        document.body.appendChild(audio)
        remoteAudioRef.current = audio
      }
      remoteAudioRef.current.srcObject = e.streams[0]
      remoteAudioRef.current.play().catch(console.error)
      setCallState('connected')
      clearInterval(timerRef.current)
      timerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000)
    }

    pc.onconnectionstatechange = () => {
      console.log('PC state:', pc.connectionState)
      if (pc.connectionState === 'connected') setCallState('connected')
      if (['failed','disconnected','closed'].includes(pc.connectionState)) {
        endCall()
      }
    }

    return pc
  }, [])

  // ── Guard initiates call (creates offer) ──────────────────────────
  const joinCall = useCallback(async (channelName) => {
    try {
      setError(null)
      setCallState('calling')
      channelNameRef.current = channelName

      // Get mic
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false
      })
      localStreamRef.current = stream

      // Set up signaling channel
      const sigChannel = supabase.channel(`webrtc:${channelName}`)
      sigChannelRef.current = sigChannel

      const pc = createPC(sigChannel, true)

      // Add local tracks
      stream.getTracks().forEach(track => pc.addTrack(track, stream))

      // Listen for answer and ICE from resident
      sigChannel
        .on('broadcast', { event: 'answer' }, async ({ payload }) => {
          console.log('Got answer')
          if (pc.signalingState !== 'closed') {
            await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
          }
        })
        .on('broadcast', { event: 'ice' }, async ({ payload }) => {
          console.log('Got ICE from resident')
          if (pc.remoteDescription && payload.candidate) {
            await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)).catch(console.error)
          }
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            // Create offer
            const offer = await pc.createOffer()
            await pc.setLocalDescription(offer)
            // Send offer
            sigChannel.send({
              type: 'broadcast',
              event: 'offer',
              payload: { sdp: pc.localDescription }
            })
            console.log('Offer sent')
          }
        })

    } catch (e) {
      console.error('joinCall error:', e)
      setError(e.message || 'Could not start voice call. Check microphone permission.')
      setCallState('idle')
      cleanup()
    }
  }, [createPC, cleanup])

  // ── Resident answers call (creates answer) ────────────────────────
  const answerCall = useCallback(async (channelName) => {
    try {
      setError(null)
      setCallState('calling')
      channelNameRef.current = channelName

      // Get mic
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false
      })
      localStreamRef.current = stream

      // Set up signaling channel
      const sigChannel = supabase.channel(`webrtc:${channelName}`)
      sigChannelRef.current = sigChannel

      const pc = createPC(sigChannel, false)

      // Add local tracks
      stream.getTracks().forEach(track => pc.addTrack(track, stream))

      let offerReceived = false

      sigChannel
        .on('broadcast', { event: 'offer' }, async ({ payload }) => {
          if (offerReceived) return
          offerReceived = true
          console.log('Got offer, sending answer')
          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          sigChannel.send({
            type: 'broadcast',
            event: 'answer',
            payload: { sdp: pc.localDescription }
          })
        })
        .on('broadcast', { event: 'ice' }, async ({ payload }) => {
          if (pc.remoteDescription && payload.candidate) {
            await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)).catch(console.error)
          }
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            // Request the offer by broadcasting join
            sigChannel.send({
              type: 'broadcast',
              event: 'resident_joined',
              payload: { channelName }
            })
          }
        })

    } catch (e) {
      console.error('answerCall error:', e)
      setError(e.message || 'Could not join voice call. Check microphone permission.')
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
    joinCall,    // called by guard
    answerCall,  // called by resident
    endCall,
    toggleMute,
  }
}
