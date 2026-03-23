import * as admin from 'firebase-admin';

admin.initializeApp({
  projectId: "PROJECT_ID"
});

const db = admin.firestore();
const auth = admin.auth();

export { admin, db, auth };
