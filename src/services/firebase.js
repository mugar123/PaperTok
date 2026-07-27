/**
 * Firebase Configuration
 * Live project configuration for PaperTok
 */

export const IS_DEMO = false;

import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyAQKtRz0-PJH7_xOBrFhGeQdbIAHkzV4Q0",
  authDomain: "papertok-168df.firebaseapp.com",
  projectId: "papertok-168df",
  storageBucket: "papertok-168df.firebasestorage.app",
  messagingSenderId: "310243065214",
  appId: "1:310243065214:web:623735321262c6e154c72f",
  measurementId: "G-LHG0SGJ6G8"
};

const app = initializeApp(firebaseConfig);
const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
// IndexedDB-backed cache: documents survive reloads, so pages can paint from
// local data instantly and refresh from the network afterwards. The multi-tab
// manager keeps several open PaperTok tabs consistent; on browsers without
// IndexedDB the SDK silently degrades to the in-memory cache.
let db;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
} catch {
  // Hot reload or a browser without persistent IndexedDB support can leave an
  // existing instance behind. Reuse it instead of failing the whole app.
  db = getFirestore(app);
}

export { auth, googleProvider, db, analytics };
export default app;
