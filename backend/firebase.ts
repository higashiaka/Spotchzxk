import * as admin from 'firebase-admin';
import * as path from 'path';

const serviceAccount = path.resolve(__dirname, './serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const auth = admin.auth();

export { admin, db, auth };
