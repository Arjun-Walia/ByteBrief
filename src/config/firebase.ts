import admin from 'firebase-admin';
import { env } from './env';
import { logger } from '../utils/logger';

let firebaseApp: admin.app.App | null = null;

export const initializeFirebase = (): admin.app.App | null => {
  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_PRIVATE_KEY || !env.FIREBASE_CLIENT_EMAIL) {
    logger.warn('Firebase credentials not configured - push notifications disabled');
    return null;
  }

  if (!firebaseApp) {
    try {
      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert({
          projectId: env.FIREBASE_PROJECT_ID,
          privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
          clientEmail: env.FIREBASE_CLIENT_EMAIL,
        }),
      });
      logger.info('✅ Firebase initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Firebase:', error);
      return null;
    }
  }

  return firebaseApp;
};

export const getFirebaseMessaging = (): admin.messaging.Messaging | null => {
  if (!firebaseApp) {
    initializeFirebase();
  }
  return firebaseApp ? admin.messaging(firebaseApp) : null;
};

export default { initializeFirebase, getFirebaseMessaging };
