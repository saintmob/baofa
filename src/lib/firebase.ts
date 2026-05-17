import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore, type Firestore } from 'firebase/firestore';

type FirebaseEnvConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId: string;
  firestoreDatabaseId: string;
};

function readFirebaseConfig(): FirebaseEnvConfig {
  const env = import.meta.env;

  return {
    apiKey: env.VITE_FIREBASE_API_KEY ?? '',
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
    projectId: env.VITE_FIREBASE_PROJECT_ID ?? '',
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? '',
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
    appId: env.VITE_FIREBASE_APP_ID ?? '',
    measurementId: env.VITE_FIREBASE_MEASUREMENT_ID ?? '',
    firestoreDatabaseId: env.VITE_FIREBASE_DATABASE_ID ?? '',
  };
}

const firebaseConfig = readFirebaseConfig();

const hasRequiredFirebaseConfig =
  Boolean(firebaseConfig.apiKey) &&
  Boolean(firebaseConfig.projectId) &&
  Boolean(firebaseConfig.firestoreDatabaseId);

export const isFirebaseEnabled =
  hasRequiredFirebaseConfig &&
  !String(firebaseConfig.apiKey).startsWith('YOUR_') &&
  !String(firebaseConfig.projectId).startsWith('YOUR_') &&
  !String(firebaseConfig.firestoreDatabaseId).startsWith('YOUR_');

let app: FirebaseApp | null = null;

export let db: Firestore | null = null;
export let auth: Auth | null = null;

if (isFirebaseEnabled) {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
  auth = getAuth(app);
}

// Test connection
async function testConnection() {
  if (!isFirebaseEnabled || !db) {
    return;
  }

  try {
    const testDoc = doc(db, 'global', 'state');
    await getDocFromServer(testDoc);
    console.log("Firebase connection established");
  } catch (error) {
    console.error("Firebase connection error:", error);
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration or network status.");
    }
  }
}

void testConnection();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid,
      email: auth?.currentUser?.email,
      emailVerified: auth?.currentUser?.emailVerified,
      isAnonymous: auth?.currentUser?.isAnonymous,
      tenantId: auth?.currentUser?.tenantId,
      providerInfo: auth?.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  const errorMsg = JSON.stringify(errInfo);
  console.error('Firestore Error: ', errorMsg);
  throw new Error(errorMsg);
}
