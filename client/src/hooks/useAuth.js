import { useState, useEffect } from 'react'
import { api } from '../utils/api'

export function useAuth() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('auth_token')
    if (!token) {
      setLoading(false)
      return
    }

    api.get('/auth/me')
      .then((data) => {
        setUser(data)
        setLoading(false)
      })
      .catch(() => {
        localStorage.removeItem('auth_token')
        setLoading(false)
      })
  }, [])

  const logout = async () => {
    await api.post('/auth/logout').catch(() => {})
    localStorage.removeItem('auth_token')
    setUser(null)
    window.location.href = '/'
  }

  return { user, loading, setUser, logout }
}
