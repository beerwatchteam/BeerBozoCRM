import { useState, useEffect } from 'react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { auth } from '../firebase'

const GMAIL_TOKEN_KEY = 'gmail_access_token'
const GMAIL_EXPIRY_KEY = 'gmail_token_expiry'

export function useAuth() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Check if the Gmail token has expired
        const expiry = localStorage.getItem(GMAIL_EXPIRY_KEY)
        if (expiry && Date.now() > parseInt(expiry)) {
          // Token expired — sign out so the user re-authenticates and gets a fresh Gmail token
          await signOut(auth)
          localStorage.removeItem(GMAIL_TOKEN_KEY)
          localStorage.removeItem(GMAIL_EXPIRY_KEY)
          setUser(null)
        } else {
          setUser({
            email: firebaseUser.email,
            name: firebaseUser.displayName,
            picture: firebaseUser.photoURL,
            uid: firebaseUser.uid,
          })
        }
      } else {
        setUser(null)
      }
      setLoading(false)
    })
    return unsubscribe
  }, [])

  const logout = async () => {
    await signOut(auth)
    localStorage.removeItem(GMAIL_TOKEN_KEY)
    localStorage.removeItem(GMAIL_EXPIRY_KEY)
    window.location.href = '/'
  }

  return { user, loading, setUser, logout }
}
