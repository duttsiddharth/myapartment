import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/global.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// Register Service Worker and inject Supabase config so SW can make API calls
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js')
      console.log('SW registered:', reg.scope)

      // Inject Supabase URL + anon key into SW scope so it can call Supabase directly
      // (anon key is safe to expose — RLS protects the data)
      if (reg.active) {
        reg.active.postMessage({
          type: 'INIT_CONFIG',
          supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
          supabaseKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        })
      }
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        navigator.serviceWorker.controller?.postMessage({
          type: 'INIT_CONFIG',
          supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
          supabaseKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        })
      })
    } catch (e) {
      console.error('SW registration failed:', e)
    }
  })
}
