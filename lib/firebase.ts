import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const requiredFirebaseEnvVars = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
  "NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID",
] as const;

const missingFirebaseEnvVars = requiredFirebaseEnvVars.filter(
  (envVar) => !process.env[envVar],
);

if (missingFirebaseEnvVars.length > 0) {
  console.warn(
    `Missing Firebase environment variables: ${missingFirebaseEnvVars.join(", ")}. Falling back to placeholder Firebase config.`,
  );
}

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "placeholder-api-key",
  authDomain:
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "placeholder.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "placeholder-project",
  storageBucket:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "placeholder.appspot.com",
  messagingSenderId:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "000000000000",
  appId:
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "1:000000000000:web:placeholder",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ?? "G-PLACEHOLDER",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
