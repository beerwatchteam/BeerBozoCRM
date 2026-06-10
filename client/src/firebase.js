import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getFunctions } from 'firebase/functions'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey: 'AIzaSyD5y13B284yg_RYEnvPsXIRMQ_Yo8aDMP8',
  authDomain: 'beerbozocrm.firebaseapp.com',
  projectId: 'beerbozocrm',
  storageBucket: 'beerbozocrm.firebasestorage.app',
  messagingSenderId: '440154301857',
  appId: '1:440154301857:web:cf255b89deb13da50bd7e0',
  measurementId: 'G-DGY9MBX3ZB',
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)
export const functions = getFunctions(app)
export const storage = getStorage(app)
