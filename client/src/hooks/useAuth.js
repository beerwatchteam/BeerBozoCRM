import { useState, useEffect } from 'react'
import { onAuthStateChanged, signOut, GoogleAuthProvider, signInWithPopup } from 'firebase/auth'
import { auth } from '../firebase'

const GMAIL_TOKEN_KEY = 'gmail_access_token'
const GMAIL_EXPIRY_KEY = 'gmail_token_expiry'

const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.modify',
]

function checkGmailValid() {
  const token = localStorage.getItem(GMAIL_TOKEN_KEY)
  const expiry = localStorage.getItem(GMAIL_EXPIRY_KEY)
  if (!token) return false
  if (expiry && Date.now() > parseInt(expiry)) return false
  return true
}

export function useAuth() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [gmailConnected, setGmailConnected] = useState(checkGmailValid())

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser({
          email: firebaseUser.email,
          name: firebaseUser.displayName,
          picture: firebaseUser.photoURL,
          uid: firebaseUser.uid,
        })
        setGmailConnected(checkGmailValid())
      } else {
        setUser(null)
        setGmailConnected(false)
      }
      setLoading(false)
    })
    return unsubscribe
  }, [])

  const connectGmail = async () => {
    const provider = new GoogleAuthProvider()
    GMAIL_SCOPES.forEach(scope => provider.addScope(scope))
    const result = await signInWithPopup(auth, provider)
    const credential = GoogleAuthProvider.credentialFromResult(result)
    if (credential?.accessToken) {
      localStorage.setItem(GMAIL_TOKEN_KEY, credential.accessToken)
      localStorage.setItem(GMAIL_EXPIRY_KEY, String(Date.now() + 55 * 60 * 1000))
      setGmailConnected(true)
    }
  }

  const logout = async () => {
    await signOut(auth)
    localStorage.removeItem(GMAIL_TOKEN_KEY)
    localStorage.removeItem(GMAIL_EXPIRY_KEY)
    window.location.href = '/'
  }

  return { user, loading, setUser, logout, gmailConnected, connectGmail }
}
