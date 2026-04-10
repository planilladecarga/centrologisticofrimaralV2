import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDDjOI3Bj26e8OvUmkcBfC99aO16nUfW0I",
  authDomain: "centrologisticofrimaralv2.firebaseapp.com",
  projectId: "centrologisticofrimaralv2",
  storageBucket: "centrologisticofrimaralv2.firebasestorage.app",
  messagingSenderId: "411854720903",
  appId: "1:411854720903:web:1ee6565ed71120e54ccd22",
  measurementId: "G-8K2DGY7V92"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const isFirebaseConfigured = true;
