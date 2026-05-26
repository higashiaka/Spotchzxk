import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

/** 환경변수에서 주입된 Firebase 프로젝트 설정값
 *  Firebase project configuration injected from environment variables */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

/** Firebase 인증 인스턴스 / Firebase Auth instance */
export const auth = getAuth(app);

/** Google 소셜 로그인 제공자 / Google social login provider */
export const googleProvider = new GoogleAuthProvider();

/** Firestore DB 인스턴스 / Firestore database instance */
export const db = getFirestore(app);
