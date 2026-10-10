import { api } from './hub'
import type { HubState } from './hub'

export const firebaseConfigured = Boolean(import.meta.env.VITE_FIREBASE_API_KEY && import.meta.env.VITE_FIREBASE_PROJECT_ID && import.meta.env.VITE_FIREBASE_AUTH_DOMAIN)

export async function signIn(): Promise<HubState> {
  if (!firebaseConfigured) throw new Error('Firebase sign-in needs project configuration. Local demo sessions work without it.')
  const [{ initializeApp, getApps }, { getAuth, GoogleAuthProvider, signInWithPopup }] = await Promise.all([import('firebase/app'), import('firebase/auth')])
  const app = getApps()[0] ?? initializeApp({ apiKey: import.meta.env.VITE_FIREBASE_API_KEY, projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID, authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN })
  const credential = await signInWithPopup(getAuth(app), new GoogleAuthProvider())
  return api<HubState>('/auth/firebase', 'POST', { token: await credential.user.getIdToken() })
}
