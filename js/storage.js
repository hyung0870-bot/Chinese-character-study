/**
 * Storage & Multi-User Management + Anki SM-2 Spaced Repetition Engine
 */

const STORAGE_KEYS = {
  USERS: 'hanja_app_users_v1',
  ACTIVE_USER_ID: 'hanja_app_active_user_id_v1',
  GEMINI_KEY: 'hanja_app_gemini_key_v1',
  SETTINGS: 'hanja_app_global_settings_v1'
};

// Preset avatar gradients (matches the design system's translucent ribbon styles)
const AVATAR_GRADIENTS = [
  { name: 'Coral Sunrise', bg: 'linear-gradient(135deg, #FF9A44 0%, #FC6076 100%)' },
  { name: 'Purple Bloom', bg: 'linear-gradient(135deg, #B721FF 0%, #21D4FD 100%)' },
  { name: 'Emerald Wave', bg: 'linear-gradient(135deg, #43E97B 0%, #38F9D7 100%)' },
  { name: 'Cyan Sky', bg: 'linear-gradient(135deg, #00F2FE 0%, #4FACFE 100%)' },
  { name: 'Sunset Gold', bg: 'linear-gradient(135deg, #F6D365 0%, #FDA085 100%)' },
  { name: 'Lime Mint', bg: 'linear-gradient(135deg, #A8EB12 0%, #00BF72 100%)' }
];

class StorageManager {
  constructor() {
    this.users = [];
    this.activeUser = null;
    this.init();
  }

  init() {
    const rawUsers = localStorage.getItem(STORAGE_KEYS.USERS);
    if (rawUsers) {
      try {
        this.users = JSON.parse(rawUsers);
      } catch (e) {
        console.error('Failed to parse users:', e);
        this.users = [];
      }
    }

    if (!this.users || this.users.length === 0) {
      // Create default user
      const defaultUser = this.createDefaultUser('꿈나무 한자왕', '8', 0);
      this.users = [defaultUser];
      this.activeUser = defaultUser;
      this.saveUsers();
    } else {
      const activeId = localStorage.getItem(STORAGE_KEYS.ACTIVE_USER_ID);
      this.activeUser = this.users.find(u => u.id === activeId) || this.users[0];
    }
    localStorage.setItem(STORAGE_KEYS.ACTIVE_USER_ID, this.activeUser.id);
    this.checkAndUpdateStreak();
  }

  createDefaultUser(name, targetLevel = '8', avatarIdx = 0) {
    return {
      id: 'user_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      name: name || '학습자',
      targetLevel: targetLevel,
      avatarIndex: avatarIdx,
      fontPreference: 'serif', // 'serif' | 'sans'
      createdAt: Date.now(),
      streak: {
        count: 1,
        lastDate: new Date().toISOString().split('T')[0]
      },
      // Hanja writing study progress: { [hanjaId]: { learned: true, reps: 3, lastUpdated: timestamp } }
      progress: {},
      // Anki cards: { [hanjaId]: { interval: 1, easeFactor: 2.5, repetitions: 0, lapses: 0, nextReviewDate: timestamp } }
      anki: {},
      // Mock exams history: [ { id, date, level, score, totalQuestions, durationSec, wrongIds: [] } ]
      mockExams: [],
      // Weak character ledger: { [hanjaId]: { lapses: 0, examFails: 0, totalErrors: 0, lastError: timestamp } }
      weakList: {}
    };
  }

  saveUsers() {
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(this.users));
    if (this.activeUser) {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_USER_ID, this.activeUser.id);
    }
    if (typeof firebaseService !== 'undefined' && firebaseService.triggerAutoSync) {
      firebaseService.triggerAutoSync();
    }
  }

  getActiveUser() {
    return this.activeUser;
  }

  getAllUsers() {
    return this.users;
  }

  setActiveUser(userId) {
    const user = this.users.find(u => u.id === userId);
    if (user) {
      this.activeUser = user;
      localStorage.setItem(STORAGE_KEYS.ACTIVE_USER_ID, userId);
      this.checkAndUpdateStreak();
      return true;
    }
    return false;
  }

  addUser(name, targetLevel = '8', avatarIndex = 0) {
    const newUser = this.createDefaultUser(name, targetLevel, avatarIndex);
    this.users.push(newUser);
    this.activeUser = newUser;
    this.saveUsers();
    return newUser;
  }

  updateUserProfile(userId, updates) {
    const user = this.users.find(u => u.id === userId);
    if (!user) return false;
    Object.assign(user, updates);
    if (this.activeUser.id === userId) {
      this.activeUser = user;
    }
    this.saveUsers();
    return true;
  }

  deleteUser(userId) {
    if (this.users.length <= 1) {
      return { success: false, message: '최소 한 명의 사용자가 유지되어야 합니다.' };
    }
    this.users = this.users.filter(u => u.id !== userId);
    if (this.activeUser.id === userId) {
      this.activeUser = this.users[0];
    }
    this.saveUsers();
    return { success: true };
  }

  checkAndUpdateStreak() {
    if (!this.activeUser) return;
    const today = new Date().toISOString().split('T')[0];
    const streak = this.activeUser.streak || { count: 0, lastDate: '' };
    if (!streak.lastDate) {
      streak.count = 1;
      streak.lastDate = today;
    } else if (streak.lastDate !== today) {
      const last = new Date(streak.lastDate);
      const curr = new Date(today);
      const diffDays = Math.round((curr - last) / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        streak.count += 1;
      } else if (diffDays > 1) {
        streak.count = 1;
      }
      streak.lastDate = today;
    }
    this.activeUser.streak = streak;
    this.saveUsers();
  }

  // --- Study Progress Management ---
  markCharacterLearned(hanjaId, targetReps = 3) {
    if (!this.activeUser) return;
    if (!this.activeUser.progress) this.activeUser.progress = {};
    const curr = this.activeUser.progress[hanjaId] || { reps: 0 };
    this.activeUser.progress[hanjaId] = {
      learned: true,
      reps: Math.max(curr.reps || 0, targetReps),
      lastUpdated: Date.now()
    };

    // If card doesn't exist in Anki yet, initialize it
    if (!this.activeUser.anki[hanjaId]) {
      this.activeUser.anki[hanjaId] = {
        interval: 1,
        easeFactor: 2.5,
        repetitions: 1,
        lapses: 0,
        nextReviewDate: Date.now() + 24 * 60 * 60 * 1000 // due tomorrow
      };
    }

    this.saveUsers();
  }

  getCharacterProgress(hanjaId) {
    return this.activeUser?.progress?.[hanjaId] || null;
  }

  // --- Anki SM-2 Spaced Repetition Algorithm ---
  /**
   * Rating options:
   * 'again': 0 (fail) -> 1 min later, reset interval
   * 'hard': 1 -> interval * 1.2
   * 'good': 2 -> interval * 2.5
   * 'easy': 3 -> interval * 4.0
   */
  processAnkiReview(hanjaId, rating) {
    if (!this.activeUser) return null;
    if (!this.activeUser.anki) this.activeUser.anki = {};
    if (!this.activeUser.weakList) this.activeUser.weakList = {};

    let card = this.activeUser.anki[hanjaId];
    if (!card) {
      card = {
        interval: 1,
        easeFactor: 2.5,
        repetitions: 0,
        lapses: 0,
        nextReviewDate: Date.now()
      };
    }

    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;

    switch (rating) {
      case 'again':
        card.lapses = (card.lapses || 0) + 1;
        card.interval = 0.001; // ~ 1.5 minutes
        card.easeFactor = Math.max(1.3, (card.easeFactor || 2.5) - 0.2);
        card.repetitions = 0;
        card.nextReviewDate = now + 90 * 1000; // 90 seconds
        
        // Record in weak list
        this.recordWeakness(hanjaId, 'anki');
        break;

      case 'hard':
        card.interval = Math.max(1, Math.round((card.interval || 1) * 1.2));
        card.easeFactor = Math.max(1.3, (card.easeFactor || 2.5) - 0.15);
        card.repetitions = (card.repetitions || 0) + 1;
        card.nextReviewDate = now + card.interval * oneDayMs;
        break;

      case 'good':
        if (card.repetitions === 0) {
          card.interval = 1;
        } else if (card.repetitions === 1) {
          card.interval = 3;
        } else {
          card.interval = Math.round((card.interval || 1) * (card.easeFactor || 2.5));
        }
        card.repetitions = (card.repetitions || 0) + 1;
        card.nextReviewDate = now + card.interval * oneDayMs;
        break;

      case 'easy':
        if (card.repetitions === 0) {
          card.interval = 3;
        } else {
          card.interval = Math.round((card.interval || 1) * (card.easeFactor || 2.5) * 1.5);
        }
        card.easeFactor = Math.min(3.0, (card.easeFactor || 2.5) + 0.15);
        card.repetitions = (card.repetitions || 0) + 1;
        card.nextReviewDate = now + card.interval * oneDayMs;
        break;
    }

    this.activeUser.anki[hanjaId] = card;
    this.saveUsers();
    return card;
  }

  getAnkiQueue(levelFilter = 'all') {
    if (!this.activeUser) return [];
    let hanjas = levelFilter === 'all' ? HANJA_DATA : getHanjaUpToLevel(levelFilter);
    const now = Date.now();
    const ankiMap = this.activeUser.anki || {};

    const dueCards = [];
    const newCards = [];

    for (const h of hanjas) {
      const card = ankiMap[h.id];
      if (!card) {
        newCards.push(h);
      } else if (card.nextReviewDate <= now) {
        dueCards.push(h);
      }
    }

    // Sort due cards: highest lapses first, then earliest review date
    dueCards.sort((a, b) => {
      const cA = ankiMap[a.id];
      const cB = ankiMap[b.id];
      return (cB.lapses || 0) - (cA.lapses || 0) || cA.nextReviewDate - cB.nextReviewDate;
    });

    return [...dueCards, ...newCards];
  }

  // --- Weak Character Tracking ---
  recordWeakness(hanjaId, source = 'anki') {
    if (!this.activeUser) return;
    if (!this.activeUser.weakList) this.activeUser.weakList = {};
    const item = this.activeUser.weakList[hanjaId] || { lapses: 0, examFails: 0, totalErrors: 0 };
    if (source === 'anki') {
      item.lapses = (item.lapses || 0) + 1;
    } else if (source === 'exam') {
      item.examFails = (item.examFails || 0) + 1;
    }
    item.totalErrors = (item.lapses || 0) + (item.examFails || 0);
    item.lastError = Date.now();
    this.activeUser.weakList[hanjaId] = item;
    this.saveUsers();
  }

  clearWeakness(hanjaId) {
    if (this.activeUser && this.activeUser.weakList && this.activeUser.weakList[hanjaId]) {
      delete this.activeUser.weakList[hanjaId];
      this.saveUsers();
    }
  }

  getWeakListSorted() {
    if (!this.activeUser || !this.activeUser.weakList) return [];
    const entries = Object.entries(this.activeUser.weakList);
    entries.sort((a, b) => b[1].totalErrors - a[1].totalErrors);
    return entries.map(([id, info]) => {
      const hanja = getHanjaById(id);
      return { hanja, ...info };
    }).filter(item => item.hanja);
  }

  // --- Mock Exam Recording ---
  recordMockExamResult(result) {
    if (!this.activeUser) return;
    if (!this.activeUser.mockExams) this.activeUser.mockExams = [];
    const examRecord = {
      id: 'exam_' + Date.now(),
      date: new Date().toISOString(),
      level: result.level,
      score: result.score,
      totalQuestions: result.totalQuestions,
      passed: result.score >= 80,
      durationSec: result.durationSec || 0,
      wrongQuestions: result.wrongQuestions || []
    };
    this.activeUser.mockExams.push(examRecord);

    // Register wrong questions into weakList
    if (result.wrongQuestions && result.wrongQuestions.length > 0) {
      for (const w of result.wrongQuestions) {
        if (w.hanjaId) {
          this.recordWeakness(w.hanjaId, 'exam');
        }
      }
    }

    this.saveUsers();
    return examRecord;
  }

  getMockExamHistory() {
    return this.activeUser?.mockExams || [];
  }

  // --- Global Gemini API Key ---
  getGeminiApiKey() {
    return localStorage.getItem(STORAGE_KEYS.GEMINI_KEY) || '';
  }

  setGeminiApiKey(key) {
    if (key) {
      localStorage.setItem(STORAGE_KEYS.GEMINI_KEY, key.trim());
    } else {
      localStorage.removeItem(STORAGE_KEYS.GEMINI_KEY);
    }
  }

  // --- Data Export & Import ---
  exportAllDataJSON() {
    const payload = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      users: this.users,
      activeUserId: this.activeUser?.id,
      geminiKey: this.getGeminiApiKey()
    };
    return JSON.stringify(payload, null, 2);
  }

  importAllDataJSON(jsonStr) {
    try {
      const data = JSON.parse(jsonStr);
      if (!data.users || !Array.isArray(data.users) || data.users.length === 0) {
        throw new Error('올바른 데이터 형식이 아닙니다.');
      }
      this.users = data.users;
      this.activeUser = this.users.find(u => u.id === data.activeUserId) || this.users[0];
      if (data.geminiKey) {
        this.setGeminiApiKey(data.geminiKey);
      }
      this.saveUsers();
      return { success: true, userCount: this.users.length };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }
}

// Global instance
const storage = new StorageManager();
