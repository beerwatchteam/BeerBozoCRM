import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../utils/api'

export default function BufferCallback() {
  const [status, setStatus] = useState('Connecting Buffer...')
  const [error, setError]   = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const params      = new URLSearchParams(window.location.search)
    const code        = params.get('code')
    const redirectUri = window.location.origin + '/auth/buffer/callback'

    if (!code) {
      setStatus('Connection failed — no authorisation code returned.')
      setError(true)
      return
    }

    api.post('/api/buffer/oauth-callback', { code, redirectUri })
      .then(() => {
        setStatus('Buffer connected!')
        setTimeout(() => navigate('/social'), 1200)
      })
      .catch(err => {
        setStatus(err.message || 'Connection failed.')
        setError(true)
      })
  }, [])

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-[#111827] gap-4">
      {!error && (
        <div className="w-5 h-5 border-2 border-bb-green border-t-transparent rounded-full animate-spin" />
      )}
      <p className={`text-sm ${error ? 'text-red-400' : 'text-white'}`}>{status}</p>
      {error && (
        <button onClick={() => navigate('/social')} className="btn-secondary text-xs">
          Back to Social
        </button>
      )}
    </div>
  )
}
