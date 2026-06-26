// src/firebase.ts
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyBIbCGcuVWk62SQLVAlfpqUOr0eTj41hRM",
  authDomain: "nolzasam.firebaseapp.com",
  projectId: "nolzasam",
  storageBucket: "nolzasam.firebasestorage.app",
  messagingSenderId: "834731947252",
  appId: "1:834731947252:web:d87e5f6246e4040d339aa1"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();