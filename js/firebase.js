/**
 * Firebase Authentication & Cloud Storage / Firestore Multi-Device Sync Engine
 * Enables seamless synchronization across iPhone, iPad, and PC browsers.
 */

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBhFBCe8Z988iUyhqRBXMGmikQzOz2b-_4",
  authDomain: "chinese-character-study.firebaseapp.com",
  databaseURL: "https://chinese-character-study-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "chinese-character-study",
  storageBucket: "chinese-character-study.firebasestorage.app",
  messagingSenderId: "687403819840",
  appId: "1:687403819840:web:d193cdd8ece24c645110a5",
  measurementId: "G-BPV473SXHK"
};

class FirebaseSyncService {
  constructor() {
    this.app = null;
    this.auth = null;
    this.storage = null;
    this.firestore = null;
    this.database = null;

    this.currentUser = null;
    this.isSyncing = false;
    this.lastSyncTime = null;
    this.autoSyncTimer = null;
    this.onStatusChange = null; // callback(status, user)

    this.init();
  }

  init() {
    if (typeof firebase === 'undefined') {
      console.warn('Firebase SDK not loaded.');
      return;
    }

    try {
      if (!firebase.apps.length) {
        this.app = firebase.initializeApp(FIREBASE_CONFIG);
      } else {
        this.app = firebase.app();
      }

      this.auth = firebase.auth();
      
      // Cloud Storage (Firestorage)
      if (typeof firebase.storage === 'function') {
        this.storage = firebase.storage();
      }
      
      // Firestore & Realtime DB
      if (typeof firebase.firestore === 'function') {
        this.firestore = firebase.firestore();
      }
      if (typeof firebase.database === 'function') {
        this.database = firebase.database();
      }

      // Listen for auth state changes
      this.auth.onAuthStateChanged(async (user) => {
        this.currentUser = user;
        if (user) {
          console.log('Firebase User logged in:', user.email);
          // Initial cloud sync on login
          await this.syncFromCloudOnLogin();
        } else {
          console.log('Firebase User logged out.');
        }
        if (typeof this.onStatusChange === 'function') {
          this.onStatusChange(user ? 'logged_in' : 'logged_out', user);
        }
      });

    } catch (err) {
      console.error('Firebase initialization error:', err);
    }
  }

  // --- Authentication Methods ---

  async signUp(email, password, displayName = '') {
    if (!this.auth) throw new Error('Firebase Auth가 초기화되지 않았습니다.');
    try {
      const userCredential = await this.auth.createUserWithEmailAndPassword(email.trim(), password);
      const user = userCredential.user;
      if (displayName) {
        await user.updateProfile({ displayName: displayName.trim() });
      }

      // Upload initial local data to cloud storage for this new user
      await this.saveToCloud();
      return user;
    } catch (err) {
      throw new Error(this.translateAuthError(err));
    }
  }

  async signIn(email, password) {
    if (!this.auth) throw new Error('Firebase Auth가 초기화되지 않았습니다.');
    try {
      const userCredential = await this.auth.signInWithEmailAndPassword(email.trim(), password);
      return userCredential.user;
    } catch (err) {
      throw new Error(this.translateAuthError(err));
    }
  }

  async signOut() {
    if (!this.auth) return;
    try {
      await this.auth.signOut();
    } catch (err) {
      console.error('Sign out error:', err);
    }
  }

  async sendPasswordReset(email) {
    if (!this.auth) throw new Error('Firebase Auth가 초기화되지 않았습니다.');
    try {
      await this.auth.sendPasswordResetEmail(email.trim());
    } catch (err) {
      throw new Error(this.translateAuthError(err));
    }
  }

  translateAuthError(err) {
    const code = err.code || '';
    switch (code) {
      case 'auth/invalid-email':
        return '올바른 이메일 주소 형식이 아닙니다.';
      case 'auth/user-disabled':
        return '해당 계정은 비활성화되었습니다.';
      case 'auth/user-not-found':
        return '가입되지 않은 이메일 계정입니다. 회원가입을 먼저 진행해 주세요.';
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return '비밀번호가 올바르지 않습니다. 다시 확인해 주세요.';
      case 'auth/email-already-in-use':
        return '이미 사용 중인 이메일입니다. 로그인해 주세요.';
      case 'auth/weak-password':
        return '비밀번호는 최소 6자 이상이어야 합니다.';
      case 'auth/too-many-requests':
        return '시도가 너무 많았습니다. 잠시 후 다시 시도해 주세요.';
      default:
        return err.message || '인증 중 오류가 발생했습니다.';
    }
  }

  // --- Cloud Sync Engine (Firestorage & Multi-backend Fallback) ---

  /**
   * Prepares complete synchronization payload from local storage
   */
  getSyncPayload() {
    return {
      version: '1.0',
      syncedAt: new Date().toISOString(),
      syncedTimestamp: Date.now(),
      users: storage.getAllUsers(),
      activeUserId: storage.getActiveUser()?.id,
      geminiKey: storage.getGeminiApiKey(),
      deviceInfo: navigator.userAgent
    };
  }

  /**
   * Saves study records to Firebase Cloud Storage (Firestorage)
   * with fallback to Firestore and Realtime Database
   */
  async saveToCloud() {
    if (!this.currentUser) return { success: false, reason: 'not_logged_in' };
    this.isSyncing = true;
    const uid = this.currentUser.uid;
    const payload = this.getSyncPayload();
    const payloadStr = JSON.stringify(payload);

    let saved = false;
    // 1. Try Realtime Database (Fastest, WebSocket-based, no CORS restrictions)
    if (this.database) {
      try {
        await this.database.ref(`users/${uid}/studyData`).set(payloadStr);
        saved = true;
      } catch (err) {
        errors.push(`RTDB: ${err.message}`);
      }
    }

    // 2. Try Firestore
    if (this.firestore) {
      try {
        await this.firestore.collection('users').doc(uid).set({
          studyData: payloadStr,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        saved = true;
      } catch (err) {
        errors.push(`Firestore: ${err.message}`);
      }
    }

    // 3. Try Firebase Cloud Storage (Firestorage) - Skip on file:// to avoid browser origin 'null' CORS rejection
    const isFileProtocol = window.location.protocol === 'file:';
    if (this.storage && !isFileProtocol) {
      try {
        const storageRef = this.storage.ref(`users/${uid}/hanja_study_data.json`);
        await storageRef.putString(payloadStr, 'raw', { contentType: 'application/json' });
        saved = true;
      } catch (err) {
        errors.push(`Storage: ${err.message}`);
      }
    }

    this.isSyncing = false;
    if (saved) {
      this.lastSyncTime = new Date();
      return { success: true, timestamp: this.lastSyncTime };
    } else {
      console.warn('Sync notice:', errors.join(', '));
      return { success: false, error: errors.join(', ') };
    }
  }

  /**
   * Fetches latest data from Firebase Realtime DB, Firestore, or Cloud Storage
   */
  async fetchFromCloud() {
    if (!this.currentUser) return null;
    const uid = this.currentUser.uid;
    const isFileProtocol = window.location.protocol === 'file:';

    // 1. Try Realtime DB (Realtime & WebSocket-based)
    if (this.database) {
      try {
        const snapshot = await this.database.ref(`users/${uid}/studyData`).once('value');
        if (snapshot.exists()) {
          const val = snapshot.val();
          const parsed = typeof val === 'string' ? JSON.parse(val) : val;
          if (parsed && Array.isArray(parsed.users) && parsed.users.length > 0) {
            return parsed;
          }
        }
      } catch (err) {
        console.warn('RTDB read notice:', err.message);
      }
    }

    // 2. Try Firestore
    if (this.firestore) {
      try {
        const doc = await this.firestore.collection('users').doc(uid).get();
        if (doc.exists && doc.data()?.studyData) {
          const parsed = JSON.parse(doc.data().studyData);
          if (parsed && Array.isArray(parsed.users) && parsed.users.length > 0) {
            return parsed;
          }
        }
      } catch (err) {
        console.warn('Firestore read notice:', err.message);
      }
    }

    // 3. Try Firebase Cloud Storage (Firestorage) - Only on http/https
    if (this.storage && !isFileProtocol) {
      try {
        const storageRef = this.storage.ref(`users/${uid}/hanja_study_data.json`);
        const downloadUrl = await storageRef.getDownloadURL();
        const response = await fetch(downloadUrl);
        if (response.ok) {
          const data = await response.json();
          if (data && Array.isArray(data.users) && data.users.length > 0) {
            return data;
          }
        }
      } catch (err) {
        console.warn('Storage read notice:', err.message);
      }
    }

    return null;
  }

  /**
   * Executed automatically right after login to synchronize cloud data
   */
  async syncFromCloudOnLogin() {
    try {
      const cloudData = await this.fetchFromCloud();
      if (cloudData && Array.isArray(cloudData.users) && cloudData.users.length > 0) {
        // Cloud data exists -> Import and update local
        storage.importAllDataJSON(JSON.stringify(cloudData));
        this.lastSyncTime = new Date();
        if (window.app) {
          window.app.loadActiveUserLevelData();
          window.app.renderHeaderUserInfo();
          window.app.switchTab(window.app.currentTab);
          window.app.showToast('☁️ 클라우드 학습 데이터 동기화 완료!', 'success');
        }
      } else {
        // No cloud data yet -> Upload current local device data to cloud
        await this.saveToCloud();
      }
    } catch (err) {
      console.warn('Sync on login error:', err);
    }
  }

  /**
   * Debounced Auto-sync: triggered on study completion or Anki review
   */
  triggerAutoSync(delayMs = 1500) {
    if (!this.currentUser) return;
    if (this.autoSyncTimer) clearTimeout(this.autoSyncTimer);
    this.autoSyncTimer = setTimeout(async () => {
      const res = await this.saveToCloud();
      if (res.success && window.app) {
        window.app.updateCloudSyncPillUI();
      }
    }, delayMs);
  }
}

// Global instance
const firebaseService = new FirebaseSyncService();
