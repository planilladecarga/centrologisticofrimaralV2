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
  const errorMessage = `Missing required Firebase environment variables: ${missingFirebaseEnvVars.join(", ")}.`;

  if (process.env.NODE_ENV !== "production") {
    throw new Error(
      `${errorMessage} Define them in .env.local (see .env.example).`,
    );
  }

  throw new Error(errorMessage);
}

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID!,
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
