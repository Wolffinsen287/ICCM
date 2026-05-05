// Firebase configuration placeholder
// Replace the values below with your project's credentials from Firebase Console.
// Go to Firebase Console → Project Settings → Your apps → SDK setup and config
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js";

// TODO: Reemplazar los valores de ejemplo por los reales de tu proyecto
const firebaseConfig = {
  apiKey: "AIzaSyCjvnRLKoEQ2Mqt15PnolXmbdKSBlzYmy0",
  authDomain: "iccm-112d9.firebaseapp.com",
  projectId: "iccm-112d9",
  storageBucket: "iccm-112d9.firebasestorage.app",
  messagingSenderId: "730932348856",
  appId: "1:730932348856:web:b3da0669ffcc1ce8ccb14d",
  measurementId: "G-0ZPVJ4Y85C"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Keep this file in the root `js/` folder. Other modules import from './firebase-config.js'

// Helpful runtime check to detect placeholder config and warn early.
export function checkFirebaseConfigured() {
  const isPlaceholder = Object.values(firebaseConfig).some(v => typeof v === 'string' && v.includes('REPLACE_'));
  if (isPlaceholder) {
    const msg = 'Firebase config still has placeholders. Replace values in js/firebase-config.js with your Firebase project config. Auth/Firestore/Storage calls will fail until configured.';
    if (typeof window !== 'undefined' && window.console) console.error(msg);
    else console.error(msg);
  }
  return !isPlaceholder;
}
