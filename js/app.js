/**
 * Hanja Study PWA - Main Application Controller
 * Handles 5 Tabs, HanziWriter, Apple Pencil Canvas, SM-2 Flashcards,
 * Mock Exam Engine, Reports with Chart.js, Multi-User Management, and Gemini AI.
 */

class SoundSynthesizer {
  constructor() {
    this.enabled = true;
    this.ctx = null;
  }

  ensureContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playChime(type = 'success') {
    if (!this.enabled) return;
    try {
      this.ensureContext();
      if (!this.ctx) return;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);

      const now = this.ctx.currentTime;

      if (type === 'success') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.1); // E5
        osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.2); // G5
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      } else if (type === 'complete') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.exponentialRampToValueAtTime(880.00, now + 0.18); // A5
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.start(now);
        osc.stop(now + 0.5);
      } else if (type === 'tap') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, now);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
      }
    } catch (_) {}
  }
}

class HanjaApp {
  constructor() {
    this.sound = new SoundSynthesizer();
    this.currentTab = 'study';
    this.studyHanjaList = [];
    this.studyIndex = 0;
    this.studyTargetReps = 3;
    this.studyCurrentReps = 0;
    this.studyFilter = 'all'; // 'all' or 'unlearned'

    // HanziWriter instance
    this.hanziWriter = null;

    // Handwriting Canvases
    this.studyCanvas = null;
    this.cardCanvas = null;
    this.examCanvas = null;

    // Flashcard State
    this.cardDirection = 'hanja_to_hun'; // 'hanja_to_hun' or 'hun_to_hanja'
    this.cardQueue = [];
    this.cardIndex = 0;
    this.cardAnswerRevealed = false;

    // Mock Exam State
    this.examState = {
      active: false,
      level: '8',
      totalCount: 20,
      timeLimitSec: 900,
      timerId: null,
      elapsedSec: 0,
      questions: [],
      currentIndex: 0,
      userAnswers: {},
      examResult: null
    };

    // Chart.js instance
    this.chartExamTrend = null;
    this.chartLevelBreakdown = null;

    this.init();
  }

  init() {
    this.authMode = 'login';
    this.initGlobalSettings();
    this.initCanvases();
    this.initNavigation();
    this.initUserHeader();
    this.initGeminiNotification();
    this.initFirebaseSync();
    this.loadActiveUserLevelData();

    // Start in Study Tab
    this.switchTab('study');
    this.renderHeaderUserInfo();

    // PWA Service Worker Registration (Only on http/https, ignore file://)
    if ('serviceWorker' in navigator && (window.location.protocol === 'http:' || window.location.protocol === 'https:')) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(err => {
          console.warn('SW registration failed:', err);
        });
      });
    }
  }

  initGlobalSettings() {
    const user = storage.getActiveUser();
    this.applyFontPreference(user?.fontPreference || 'serif');
  }

  applyFontPreference(pref) {
    const elements = document.querySelectorAll('.hanja-font-target');
    elements.forEach(el => {
      if (pref === 'sans') {
        el.classList.remove('hanja-serif');
        el.classList.add('hanja-sans');
      } else {
        el.classList.remove('hanja-sans');
        el.classList.add('hanja-serif');
      }
    });
  }

  initGeminiNotification() {
    gemini.onStatusChange = (msg, type) => {
      this.showToast(msg, type);
      const badge = document.getElementById('ai-model-badge');
      if (badge && gemini.lastSuccessfulModel) {
        badge.textContent = `⚡ ${gemini.lastSuccessfulModel}`;
        badge.className = 'px-3 py-1 text-xs font-semibold rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200';
      }
    };
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    const colorClass = type === 'success' 
      ? 'bg-emerald-600 text-white shadow-emerald-200'
      : type === 'warning'
      ? 'bg-amber-500 text-white shadow-amber-200'
      : type === 'error'
      ? 'bg-rose-500 text-white shadow-rose-200'
      : 'bg-slate-800 text-white shadow-slate-200';

    toast.className = `px-4 py-3 rounded-2xl text-sm font-medium shadow-xl flex items-center gap-2 transform transition-all duration-300 translate-y-3 opacity-0 ${colorClass}`;
    toast.innerHTML = `<span>${message}</span>`;
    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.remove('translate-y-3', 'opacity-0');
    });

    setTimeout(() => {
      toast.classList.add('translate-y-3', 'opacity-0');
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  initNavigation() {
    const tabs = ['study', 'card', 'exam', 'report', 'settings'];
    tabs.forEach(tab => {
      const btn = document.getElementById(`nav-btn-${tab}`);
      if (btn) {
        btn.addEventListener('click', () => {
          this.sound.playChime('tap');
          this.switchTab(tab);
        });
      }
    });
  }

  switchTab(tabName) {
    this.currentTab = tabName;
    const tabs = ['study', 'card', 'exam', 'report', 'settings'];
    
    tabs.forEach(t => {
      const pane = document.getElementById(`tab-pane-${t}`);
      const btn = document.getElementById(`nav-btn-${t}`);
      if (pane) {
        pane.classList.toggle('hidden', t !== tabName);
      }
      if (btn) {
        btn.classList.toggle('active', t === tabName);
        const squircle = btn.querySelector('.ribbon-icon-squircle');
        if (squircle) squircle.classList.toggle('active', t === tabName);
      }
    });

    // Refresh tab specific modules
    if (tabName === 'study') {
      this.refreshStudyTab();
      setTimeout(() => this.studyCanvas?.resize(), 50);
    } else if (tabName === 'card') {
      this.refreshCardTab();
      setTimeout(() => this.cardCanvas?.resize(), 50);
    } else if (tabName === 'exam') {
      this.refreshExamTab();
      setTimeout(() => this.examCanvas?.resize(), 50);
    } else if (tabName === 'report') {
      this.refreshReportTab();
    } else if (tabName === 'settings') {
      this.refreshSettingsTab();
    }
  }

  initCanvases() {
    // 1. Study Canvas
    const studyCanvasEl = document.getElementById('study-draw-canvas');
    if (studyCanvasEl) {
      this.studyCanvas = new HandwritingCanvas(studyCanvasEl, {
        strokeColor: '#1E293B',
        strokeWidth: 6,
        gridType: 'mi'
      });
    }

    // 2. Flashcard Canvas
    const cardCanvasEl = document.getElementById('card-draw-canvas');
    if (cardCanvasEl) {
      this.cardCanvas = new HandwritingCanvas(cardCanvasEl, {
        strokeColor: '#1E293B',
        strokeWidth: 6,
        gridType: 'mi'
      });
    }

    // 3. Exam Canvas
    const examCanvasEl = document.getElementById('exam-draw-canvas');
    if (examCanvasEl) {
      this.examCanvas = new HandwritingCanvas(examCanvasEl, {
        strokeColor: '#1E293B',
        strokeWidth: 6,
        gridType: 'mi'
      });
    }
  }

  loadActiveUserLevelData() {
    const user = storage.getActiveUser();
    const level = user?.targetLevel || '8';
    this.studyHanjaList = getHanjaByLevel(level);
    this.studyIndex = 0;
    this.studyCurrentReps = 0;
  }

  renderHeaderUserInfo() {
    const user = storage.getActiveUser();
    if (!user) return;

    const nameEl = document.getElementById('header-user-name');
    const avatarEl = document.getElementById('header-user-avatar');
    const streakEl = document.getElementById('header-user-streak');
    const levelBadgeEl = document.getElementById('header-user-level');

    if (nameEl) nameEl.textContent = user.name;
    if (streakEl) streakEl.textContent = `${user.streak?.count || 1}일 연속`;
    if (avatarEl) {
      const grad = AVATAR_GRADIENTS[user.avatarIndex || 0] || AVATAR_GRADIENTS[0];
      avatarEl.style.background = grad.bg;
      avatarEl.textContent = (user.name || '한')[0];
    }
    if (levelBadgeEl) {
      const lvlObj = HANJA_LEVELS.find(l => l.id === user.targetLevel) || HANJA_LEVELS[0];
      levelBadgeEl.textContent = lvlObj.name;
    }
  }

  initUserHeader() {
    const trigger = document.getElementById('header-user-pill');
    if (trigger) {
      trigger.addEventListener('click', () => {
        this.sound.playChime('tap');
        this.openUserModal();
      });
    }
  }

  openUserModal() {
    const modal = document.getElementById('user-modal');
    if (!modal) return;
    this.renderUserModalList();
    modal.classList.remove('hidden');
  }

  closeUserModal() {
    const modal = document.getElementById('user-modal');
    if (modal) modal.classList.add('hidden');
  }

  renderUserModalList() {
    const listContainer = document.getElementById('user-modal-list');
    if (!listContainer) return;
    const users = storage.getAllUsers();
    const active = storage.getActiveUser();

    listContainer.innerHTML = users.map(u => {
      const isActive = u.id === active.id;
      const grad = AVATAR_GRADIENTS[u.avatarIndex || 0] || AVATAR_GRADIENTS[0];
      const lvl = HANJA_LEVELS.find(l => l.id === u.targetLevel)?.name || '8급';
      return `
        <div class="flex items-center justify-between p-3 rounded-2xl ${isActive ? 'bg-indigo-50/60 border border-indigo-200' : 'bg-slate-50 border border-slate-100'} transition cursor-pointer" onclick="app.selectUser('${u.id}')">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-sm" style="background: ${grad.bg}">
              ${u.name[0]}
            </div>
            <div>
              <div class="font-bold text-slate-800 text-sm flex items-center gap-2">
                ${u.name}
                ${isActive ? '<span class="px-2 py-0.5 text-[10px] font-bold bg-indigo-600 text-white rounded-full">학습 중</span>' : ''}
              </div>
              <div class="text-xs text-slate-400 font-medium">목표: ${lvl} | 🔥 ${u.streak?.count || 1}일 연속</div>
            </div>
          </div>
          ${users.length > 1 ? `
            <button onclick="event.stopPropagation(); app.deleteUser('${u.id}')" class="p-2 text-slate-300 hover:text-rose-500 rounded-lg transition" title="삭제">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </button>
          ` : ''}
        </div>
      `;
    }).join('');
  }

  selectUser(userId) {
    storage.setActiveUser(userId);
    this.loadActiveUserLevelData();
    this.renderHeaderUserInfo();
    this.closeUserModal();
    this.switchTab(this.currentTab);
    this.showToast('학습자 프로필을 전환했습니다.', 'success');
  }

  addUserFromModal() {
    const nameInput = document.getElementById('new-user-name');
    const levelSelect = document.getElementById('new-user-level');
    const name = nameInput.value.trim();
    if (!name) {
      alert('학습자 이름을 입력해 주세요.');
      return;
    }
    const avatarIdx = Math.floor(Math.random() * AVATAR_GRADIENTS.length);
    storage.addUser(name, levelSelect.value, avatarIdx);
    nameInput.value = '';
    this.loadActiveUserLevelData();
    this.renderHeaderUserInfo();
    this.closeUserModal();
    this.switchTab(this.currentTab);
    this.showToast(`[${name}] 학습자 프로필이 추가되었습니다.`, 'success');
  }

  deleteUser(userId) {
    if (confirm('정말 이 사용자를 삭제하시겠습니까? 학습 데이터가 초기화됩니다.')) {
      const res = storage.deleteUser(userId);
      if (res.success) {
        this.loadActiveUserLevelData();
        this.renderHeaderUserInfo();
        this.renderUserModalList();
        this.switchTab(this.currentTab);
        this.showToast('사용자를 삭제했습니다.', 'info');
      } else {
        alert(res.message);
      }
    }
  }

  // =========================================================================
  // TAB 1: 공부 모드 (순차 학습 & 획순 연습 & 반복 쓰기)
  // =========================================================================

  refreshStudyTab() {
    const user = storage.getActiveUser();
    const levelSelect = document.getElementById('study-level-select');
    if (levelSelect) {
      levelSelect.value = user?.targetLevel || '8';
    }

    let list = getHanjaByLevel(levelSelect?.value || '8');
    if (this.studyFilter === 'unlearned') {
      list = list.filter(h => !storage.getCharacterProgress(h.id)?.learned);
      if (list.length === 0) {
        list = getHanjaByLevel(levelSelect?.value || '8');
        this.showToast('모든 한자를 학습 완료하여 전체 목록으로 표시합니다! 🎉', 'success');
      }
    }
    this.studyHanjaList = list;
    if (this.studyIndex >= this.studyHanjaList.length) {
      this.studyIndex = 0;
    }
    this.renderCurrentStudyCharacter();
  }

  changeStudyLevel(newLevel) {
    storage.updateUserProfile(storage.getActiveUser().id, { targetLevel: newLevel });
    this.loadActiveUserLevelData();
    this.renderHeaderUserInfo();
    this.refreshStudyTab();
  }

  setStudyFilter(filterType) {
    this.studyFilter = filterType;
    this.studyIndex = 0;
    this.refreshStudyTab();
  }

  renderCurrentStudyCharacter() {
    const hanja = this.studyHanjaList[this.studyIndex];
    if (!hanja) return;

    // Info elements
    document.getElementById('study-current-idx').textContent = `${this.studyIndex + 1} / ${this.studyHanjaList.length}`;
    document.getElementById('study-char-kanji').textContent = hanja.kanji;
    document.getElementById('study-char-hun-eum').textContent = `${hanja.hun} ${hanja.eum}`;
    document.getElementById('study-char-meta').textContent = `부수: ${hanja.radical} | 총 ${hanja.strokeCount}획`;
    
    // Example words
    const wordsContainer = document.getElementById('study-example-words');
    if (wordsContainer) {
      wordsContainer.innerHTML = hanja.exampleWords.map(w => 
        `<span class="px-3 py-1 bg-slate-100 text-slate-700 text-xs font-medium rounded-full">${w}</span>`
      ).join('');
    }

    // Repetition targets
    this.studyCurrentReps = 0;
    this.updateStudyRepetitionUI();

    // Check if already learned
    const progress = storage.getCharacterProgress(hanja.id);
    const learnedBadge = document.getElementById('study-learned-badge');
    if (learnedBadge) {
      learnedBadge.classList.toggle('hidden', !progress?.learned);
    }

    // HanziWriter initialization
    this.initHanziWriter(hanja.kanji);

    // Setup Canvas watermark with current character
    if (this.studyCanvas) {
      this.studyCanvas.clear();
      const user = storage.getActiveUser();
      const font = user?.fontPreference === 'sans' ? 'Noto Sans KR, sans-serif' : 'Noto Serif KR, serif';
      this.studyCanvas.setWatermark(hanja.kanji, font);
    }
  }

  initHanziWriter(kanjiChar) {
    const box = document.getElementById('hanzi-writer-box');
    if (!box) return;
    box.innerHTML = '';

    const size = Math.min(box.clientWidth || 220, 240);
    try {
      this.hanziWriter = HanziWriter.create('hanzi-writer-box', kanjiChar, {
        width: size,
        height: size,
        padding: 15,
        strokeColor: '#FC6076',
        radicalColor: '#FF9A44',
        outlineColor: '#E2E8F0',
        showOutline: true,
        showCharacter: false,
        strokeAnimationSpeed: 1.2,
        delayBetweenStrokes: 200
      });
      // Auto animate once on load
      this.hanziWriter.animateCharacter();
    } catch (e) {
      console.warn('HanziWriter fallback:', e);
      box.innerHTML = `<div class="text-7xl flex items-center justify-center h-full text-slate-800 font-serif">${kanjiChar}</div>`;
    }
  }

  playStrokeAnimation() {
    if (this.hanziWriter) {
      this.sound.playChime('tap');
      this.hanziWriter.animateCharacter();
    }
  }

  startStrokeQuiz() {
    if (this.hanziWriter) {
      this.sound.playChime('tap');
      this.showToast('화면의 한자 획순을 순서대로 터치/마우스로 따라 그려보세요!', 'info');
      this.hanziWriter.quiz({
        onMistake: (strokeData) => {
          this.showToast(`획순이 틀렸습니다! (다시 시도해 보세요)`, 'warning');
        },
        onCorrectStroke: (strokeData) => {
          this.sound.playChime('success');
        },
        onComplete: (summary) => {
          this.sound.playChime('complete');
          this.showToast(`🎉 획순 완성! (총 ${summary.totalMistakes}회 실수)`, 'success');
        }
      });
    }
  }

  setStudyTargetReps(num) {
    this.studyTargetReps = num;
    this.studyCurrentReps = 0;
    this.updateStudyRepetitionUI();
    const btns = [3, 5, 10];
    btns.forEach(b => {
      const btn = document.getElementById(`rep-target-btn-${b}`);
      if (btn) {
        btn.classList.toggle('bg-slate-900', b === num);
        btn.classList.toggle('text-white', b === num);
        btn.classList.toggle('bg-slate-100', b !== num);
        btn.classList.toggle('text-slate-600', b !== num);
      }
    });
  }

  updateStudyRepetitionUI() {
    const textEl = document.getElementById('study-rep-counter-text');
    const barEl = document.getElementById('study-rep-progress-bar');
    if (textEl) {
      textEl.textContent = `${this.studyCurrentReps} / ${this.studyTargetReps} 회 완료`;
    }
    if (barEl) {
      const pct = Math.min(100, Math.round((this.studyCurrentReps / this.studyTargetReps) * 100));
      barEl.style.width = `${pct}%`;
    }
  }

  completeSingleRepetition() {
    if (this.studyCanvas.isEmpty()) {
      this.showToast('캔버스에 한자를 먼저 작성해 주세요.', 'warning');
      return;
    }

    this.studyCurrentReps += 1;
    this.sound.playChime('success');
    this.studyCanvas.clear();
    this.updateStudyRepetitionUI();

    if (this.studyCurrentReps >= this.studyTargetReps) {
      const hanja = this.studyHanjaList[this.studyIndex];
      storage.markCharacterLearned(hanja.id, this.studyTargetReps);
      this.sound.playChime('complete');
      
      // Confetti burst
      if (window.confetti) {
        confetti({ particleCount: 50, spread: 60, origin: { y: 0.6 } });
      }

      this.showToast(`🎉 [${hanja.kanji}] ${this.studyTargetReps}회 쓰기 완성! 학습 완료되었습니다.`, 'success');

      // Auto advance to next after short delay
      setTimeout(() => {
        this.nextStudyCharacter();
      }, 700);
    }
  }

  nextStudyCharacter() {
    if (this.studyIndex < this.studyHanjaList.length - 1) {
      this.studyIndex += 1;
      this.renderCurrentStudyCharacter();
    } else {
      this.showToast('현재 급수의 모든 한자를 확인했습니다!', 'success');
      this.studyIndex = 0;
      this.renderCurrentStudyCharacter();
    }
  }

  prevStudyCharacter() {
    if (this.studyIndex > 0) {
      this.studyIndex -= 1;
      this.renderCurrentStudyCharacter();
    }
  }

  async askAiMnemonicForCurrentHanja() {
    const hanja = this.studyHanjaList[this.studyIndex];
    if (!hanja) return;

    this.openAiModal(`[${hanja.kanji}] 연상 암기 스토리 생성 중...`);
    try {
      const result = await gemini.generateMnemonic(hanja);
      this.renderAiModalContent(`💡 [${hanja.kanji}] ${hanja.hun} ${hanja.eum} 연상 암기 비법`, result.text, result.model);
    } catch (err) {
      this.renderAiModalError(err.message);
    }
  }

  // =========================================================================
  // TAB 2: 플래시카드 모드 (Anki Spaced Repetition + 필기 자가 검증)
  // =========================================================================

  refreshCardTab() {
    const user = storage.getActiveUser();
    this.cardQueue = storage.getAnkiQueue(user?.targetLevel || '8');
    this.cardIndex = 0;
    this.cardAnswerRevealed = false;
    this.renderCurrentCard();
  }

  setCardDirection(direction) {
    this.cardDirection = direction;
    this.cardAnswerRevealed = false;
    document.getElementById('card-dir-btn-1').classList.toggle('bg-purple-600', direction === 'hanja_to_hun');
    document.getElementById('card-dir-btn-1').classList.toggle('text-white', direction === 'hanja_to_hun');
    document.getElementById('card-dir-btn-2').classList.toggle('bg-purple-600', direction === 'hun_to_hanja');
    document.getElementById('card-dir-btn-2').classList.toggle('text-white', direction === 'hun_to_hanja');
    this.renderCurrentCard();
  }

  renderCurrentCard() {
    const card = this.cardQueue[this.cardIndex];
    const container = document.getElementById('card-main-container');
    const emptyNotice = document.getElementById('card-empty-notice');

    if (!card) {
      if (container) container.classList.add('hidden');
      if (emptyNotice) emptyNotice.classList.remove('hidden');
      return;
    }

    if (container) container.classList.remove('hidden');
    if (emptyNotice) emptyNotice.classList.add('hidden');

    this.cardAnswerRevealed = false;
    document.getElementById('card-queue-badge').textContent = `오늘 복습 큐: ${this.cardIndex + 1} / ${this.cardQueue.length}`;

    // Front Prompt
    const promptTitle = document.getElementById('card-prompt-title');
    const promptSub = document.getElementById('card-prompt-sub');
    const answerPanel = document.getElementById('card-answer-panel');
    const checkBtn = document.getElementById('card-check-btn');
    const ratingButtons = document.getElementById('card-rating-buttons');

    if (this.cardDirection === 'hanja_to_hun') {
      promptTitle.textContent = card.kanji;
      promptTitle.className = 'text-7xl font-bold text-slate-800 hanja-font-target';
      promptSub.textContent = `부수: ${card.radical} | 총 ${card.strokeCount}획 ➔ 뜻과 음을 손글씨로 적어보세요!`;
    } else {
      promptTitle.textContent = `${card.hun} ${card.eum}`;
      promptTitle.className = 'text-4xl font-bold text-slate-800';
      promptSub.textContent = `대표 단어: ${card.exampleWords.join(', ')} ➔ 해당 한자를 손글씨로 직접 써보세요!`;
    }

    if (answerPanel) answerPanel.classList.add('hidden');
    if (checkBtn) checkBtn.classList.remove('hidden');
    if (ratingButtons) ratingButtons.classList.add('hidden');

    if (this.cardCanvas) {
      this.cardCanvas.clear();
      this.cardCanvas.setWatermark('');
    }
  }

  revealCardAnswer() {
    this.cardAnswerRevealed = true;
    const card = this.cardQueue[this.cardIndex];
    if (!card) return;

    this.sound.playChime('tap');
    const answerPanel = document.getElementById('card-answer-panel');
    const checkBtn = document.getElementById('card-check-btn');
    const ratingButtons = document.getElementById('card-rating-buttons');

    // Fill answer details
    document.getElementById('card-ans-kanji').textContent = card.kanji;
    document.getElementById('card-ans-hun-eum').textContent = `${card.hun} ${card.eum}`;
    document.getElementById('card-ans-meta').textContent = `부수: ${card.radical} (${card.strokeCount}획) | 예문: ${card.exampleWords.join(', ')}`;

    if (answerPanel) answerPanel.classList.remove('hidden');
    if (checkBtn) checkBtn.classList.add('hidden');
    if (ratingButtons) ratingButtons.classList.remove('hidden');
  }

  rateCard(rating) {
    const card = this.cardQueue[this.cardIndex];
    if (!card) return;

    this.sound.playChime('tap');
    storage.processAnkiReview(card.id, rating);

    // If rated 'again', push to end of current session queue to re-test
    if (rating === 'again') {
      this.cardQueue.push(card);
    }

    this.cardIndex += 1;
    if (this.cardIndex < this.cardQueue.length) {
      this.renderCurrentCard();
    } else {
      // Completed all cards in queue
      this.renderCurrentCard();
      this.sound.playChime('complete');
      if (window.confetti) {
        confetti({ particleCount: 70, spread: 80, origin: { y: 0.6 } });
      }
      this.showToast('🎉 오늘의 플래시카드 복습을 모두 완료했습니다!', 'success');
    }
  }

  // =========================================================================
  // TAB 3: 모의시험 모드 (실전 한자능력검정시험 스타일)
  // =========================================================================

  refreshExamTab() {
    if (this.examState.active) {
      // If exam is in progress, stay in exam screen
      return;
    }
    document.getElementById('exam-start-panel').classList.remove('hidden');
    document.getElementById('exam-active-panel').classList.add('hidden');
    document.getElementById('exam-grading-panel').classList.add('hidden');
  }

  startMockExam() {
    const level = document.getElementById('exam-level-select').value;
    const count = parseInt(document.getElementById('exam-count-select').value, 10);
    const timeLimitMins = parseInt(document.getElementById('exam-time-select').value, 10);

    const pool = getHanjaUpToLevel(level);
    if (pool.length < 5) {
      alert('시험을 출제하기에 한자 데이터가 부족합니다.');
      return;
    }

    // Shuffle and pick questions
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, Math.min(count, shuffled.length));

    // Generate question varieties
    const questions = selected.map((target, idx) => {
      const qTypeRand = Math.random();
      let type = 'eum'; // 독음 고르기
      if (qTypeRand < 0.3) {
        type = 'hun_eum'; // 훈음 고르기
      } else if (qTypeRand < 0.6) {
        type = 'meaning_to_kanji'; // 뜻에 맞는 한자 고르기
      } else if (qTypeRand < 0.85) {
        type = 'handwriting'; // 주관식 손글씨 쓰기 (자가채점형)
      }

      // Generate 4 choices
      const choices = [target];
      const otherChoices = pool.filter(h => h.id !== target.id).sort(() => Math.random() - 0.5);
      for (let i = 0; i < 3 && i < otherChoices.length; i++) {
        choices.push(otherChoices[i]);
      }
      choices.sort(() => Math.random() - 0.5);

      return {
        index: idx + 1,
        type: type,
        target: target,
        choices: choices
      };
    });

    this.examState = {
      active: true,
      level: level,
      totalCount: questions.length,
      timeLimitSec: timeLimitMins * 60,
      elapsedSec: 0,
      questions: questions,
      currentIndex: 0,
      userAnswers: {},
      examResult: null
    };

    document.getElementById('exam-start-panel').classList.add('hidden');
    document.getElementById('exam-active-panel').classList.remove('hidden');
    document.getElementById('exam-grading-panel').classList.add('hidden');

    this.startExamTimer();
    this.renderExamCurrentQuestion();
    this.renderExamNavigationGrid();
  }

  startExamTimer() {
    if (this.examState.timerId) clearInterval(this.examState.timerId);
    this.examState.timerId = setInterval(() => {
      this.examState.elapsedSec += 1;
      const remaining = Math.max(0, this.examState.timeLimitSec - this.examState.elapsedSec);
      
      const m = Math.floor(remaining / 60).toString().padStart(2, '0');
      const s = (remaining % 60).toString().padStart(2, '0');
      const timerEl = document.getElementById('exam-timer-display');
      if (timerEl) timerEl.textContent = `${m}:${s}`;

      if (remaining <= 0) {
        clearInterval(this.examState.timerId);
        this.showToast('시험 시간이 종료되었습니다! 자동 채점으로 이동합니다.', 'warning');
        this.submitExamForGrading();
      }
    }, 1000);
  }

  renderExamCurrentQuestion() {
    const q = this.examState.questions[this.examState.currentIndex];
    if (!q) return;

    document.getElementById('exam-q-num').textContent = `제 ${q.index} 문항 (총 ${this.examState.totalCount}문항)`;
    const titleEl = document.getElementById('exam-q-title');
    const mcContainer = document.getElementById('exam-mc-choices');
    const subjectiveContainer = document.getElementById('exam-subjective-container');

    const currAns = this.examState.userAnswers[q.index];

    if (q.type === 'handwriting') {
      titleEl.innerHTML = `<span class="text-rose-500 font-semibold">[주관식 쓰기]</span> 다음 훈음에 알맞은 한자를 캔버스에 바르게 쓰시오: <span class="font-bold underline text-slate-800 ml-2">"${q.target.hun} ${q.target.eum}"</span>`;
      mcContainer.classList.add('hidden');
      subjectiveContainer.classList.remove('hidden');
      
      if (this.examCanvas) {
        this.examCanvas.clear();
        this.examCanvas.setWatermark('');
      }
    } else {
      subjectiveContainer.classList.add('hidden');
      mcContainer.classList.remove('hidden');

      if (q.type === 'eum') {
        titleEl.innerHTML = `다음 한자의 알맞은 <span class="text-indigo-600 font-bold">음(소리)</span>을 고르시오: <span class="text-4xl font-serif text-slate-900 ml-2">${q.target.kanji}</span>`;
      } else if (q.type === 'hun_eum') {
        titleEl.innerHTML = `다음 한자의 알맞은 <span class="text-indigo-600 font-bold">훈과 음(뜻/소리)</span>을 고르시오: <span class="text-4xl font-serif text-slate-900 ml-2">${q.target.kanji}</span>`;
      } else if (q.type === 'meaning_to_kanji') {
        titleEl.innerHTML = `다음 뜻을 가진 <span class="text-indigo-600 font-bold">한자</span>로 알맞은 것은? : <span class="text-xl font-bold text-slate-800 ml-2">"${q.target.hun}"</span>`;
      }

      mcContainer.innerHTML = q.choices.map((c, i) => {
        let label = '';
        if (q.type === 'eum') label = c.eum;
        else if (q.type === 'hun_eum') label = `${c.hun} ${c.eum}`;
        else if (q.type === 'meaning_to_kanji') label = `${c.kanji} (${c.eum})`;

        const isSelected = currAns && currAns.choiceIndex === i;
        return `
          <button onclick="app.selectExamChoice(${i})" class="p-4 rounded-2xl text-left border font-medium text-base transition flex items-center justify-between ${isSelected ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300'}">
            <span><strong class="mr-2">${i + 1}.</strong> ${label}</span>
            ${isSelected ? '<svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>' : ''}
          </button>
        `;
      }).join('');
    }

    this.renderExamNavigationGrid();
  }

  selectExamChoice(choiceIndex) {
    this.sound.playChime('tap');
    const q = this.examState.questions[this.examState.currentIndex];
    const selected = q.choices[choiceIndex];
    this.examState.userAnswers[q.index] = {
      choiceIndex: choiceIndex,
      selectedHanjaId: selected.id,
      isCorrect: selected.id === q.target.id
    };
    this.renderExamCurrentQuestion();
  }

  saveExamHandwritingAnswer() {
    const q = this.examState.questions[this.examState.currentIndex];
    if (this.examCanvas.isEmpty()) {
      this.showToast('손글씨를 캔버스에 작성 후 저장해 주세요.', 'warning');
      return;
    }
    const dataUrl = this.examCanvas.toDataURL();
    this.examState.userAnswers[q.index] = {
      drawingDataUrl: dataUrl,
      selfGraded: null // To be self-graded after submit
    };
    this.sound.playChime('success');
    this.showToast('답안이 저장되었습니다.', 'info');
    this.renderExamNavigationGrid();
  }

  renderExamNavigationGrid() {
    const grid = document.getElementById('exam-nav-grid');
    if (!grid) return;

    grid.innerHTML = this.examState.questions.map((q, idx) => {
      const isCurrent = idx === this.examState.currentIndex;
      const isAnswered = !!this.examState.userAnswers[q.index];
      let bg = 'bg-slate-100 text-slate-500';
      if (isCurrent) bg = 'bg-indigo-600 text-white font-bold ring-2 ring-indigo-300';
      else if (isAnswered) bg = 'bg-emerald-100 text-emerald-800 font-semibold';

      return `
        <button onclick="app.jumpToExamQuestion(${idx})" class="w-8 h-8 rounded-xl text-xs flex items-center justify-center transition ${bg}">
          ${idx + 1}
        </button>
      `;
    }).join('');
  }

  jumpToExamQuestion(idx) {
    this.examState.currentIndex = idx;
    this.renderExamCurrentQuestion();
  }

  nextExamQuestion() {
    if (this.examState.currentIndex < this.examState.totalCount - 1) {
      this.examState.currentIndex += 1;
      this.renderExamCurrentQuestion();
    }
  }

  prevExamQuestion() {
    if (this.examState.currentIndex > 0) {
      this.examState.currentIndex -= 1;
      this.renderExamCurrentQuestion();
    }
  }

  submitExamForGrading() {
    if (this.examState.timerId) clearInterval(this.examState.timerId);

    // Check subjective questions for self check
    document.getElementById('exam-active-panel').classList.add('hidden');
    document.getElementById('exam-grading-panel').classList.remove('hidden');

    this.renderSelfGradingView();
  }

  renderSelfGradingView() {
    const listContainer = document.getElementById('exam-self-grading-list');
    if (!listContainer) return;

    const questions = this.examState.questions;
    listContainer.innerHTML = questions.map(q => {
      const userAns = this.examState.userAnswers[q.index];
      const isHandwriting = q.type === 'handwriting';

      if (isHandwriting) {
        return `
          <div class="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
            <div class="flex-1">
              <div class="text-sm font-semibold text-slate-500 mb-1">문항 ${q.index} (주관식 쓰기)</div>
              <div class="text-base font-bold text-slate-800">문제: "${q.target.hun} ${q.target.eum}" ➔ 정답: <span class="text-2xl text-emerald-600 font-serif ml-2">${q.target.kanji}</span></div>
            </div>
            <div class="flex items-center gap-4">
              <div class="w-24 h-24 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden">
                ${userAns?.drawingDataUrl ? `<img src="${userAns.drawingDataUrl}" class="w-full h-full object-contain" />` : '<span class="text-xs text-slate-400">미작성</span>'}
              </div>
              <div class="flex flex-col gap-2">
                <button onclick="app.setSubjectiveGrade(${q.index}, true)" id="subj-btn-o-${q.index}" class="px-4 py-2 rounded-xl text-xs font-bold border ${userAns?.selfGraded === true ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'}">⭕ 정답 (맞음)</button>
                <button onclick="app.setSubjectiveGrade(${q.index}, false)" id="subj-btn-x-${q.index}" class="px-4 py-2 rounded-xl text-xs font-bold border ${userAns?.selfGraded === false ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-700'}">❌ 오답 (틀림)</button>
              </div>
            </div>
          </div>
        `;
      } else {
        const isCorrect = userAns && userAns.isCorrect;
        return `
          <div class="p-4 rounded-2xl ${isCorrect ? 'bg-emerald-50/50 border-emerald-200' : 'bg-rose-50/50 border-rose-200'} border flex items-center justify-between">
            <div>
              <div class="text-xs font-semibold ${isCorrect ? 'text-emerald-700' : 'text-rose-700'}">문항 ${q.index} - ${isCorrect ? '정답' : '오답'}</div>
              <div class="text-sm font-bold text-slate-800 mt-1">정답: ${q.target.kanji} (${q.target.hun} ${q.target.eum})</div>
            </div>
            <div class="text-xl font-bold ${isCorrect ? 'text-emerald-600' : 'text-rose-600'}">
              ${isCorrect ? '⭕ 100%' : '❌ 오답'}
            </div>
          </div>
        `;
      }
    }).join('');
  }

  setSubjectiveGrade(qIndex, isCorrect) {
    if (!this.examState.userAnswers[qIndex]) {
      this.examState.userAnswers[qIndex] = {};
    }
    this.examState.userAnswers[qIndex].selfGraded = isCorrect;
    this.examState.userAnswers[qIndex].isCorrect = isCorrect;
    this.renderSelfGradingView();
  }

  finalizeExamResult() {
    let correctCount = 0;
    const wrongQuestions = [];

    this.examState.questions.forEach(q => {
      const ans = this.examState.userAnswers[q.index];
      if (ans && ans.isCorrect === true) {
        correctCount += 1;
      } else {
        wrongQuestions.push({
          qIndex: q.index,
          hanjaId: q.target.id,
          kanji: q.target.kanji,
          hun: q.target.hun,
          eum: q.target.eum
        });
      }
    });

    const score = Math.round((correctCount / this.examState.totalCount) * 100);
    const resultRecord = storage.recordMockExamResult({
      level: this.examState.level,
      score: score,
      totalQuestions: this.examState.totalCount,
      durationSec: this.examState.elapsedSec,
      wrongQuestions: wrongQuestions
    });

    this.examState.lastExamRecord = resultRecord;
    this.examState.lastWrongQuestions = wrongQuestions;
    this.examState.active = false;

    // Show Result Modal
    this.showExamFinalModal(score, resultRecord, wrongQuestions);
  }

  showExamFinalModal(score, record, wrongQuestions) {
    const modal = document.getElementById('exam-result-modal');
    if (!modal) return;

    const isPassed = score >= 80;
    if (isPassed) {
      this.sound.playChime('complete');
      if (window.confetti) {
        confetti({ particleCount: 90, spread: 100, origin: { y: 0.5 } });
      }
    }

    document.getElementById('res-score').textContent = `${score}점`;
    document.getElementById('res-pass-badge').textContent = isPassed ? '🏆 합격 (80점 이상)' : '재도전 필요 (합격 기준 80점)';
    document.getElementById('res-pass-badge').className = `px-4 py-1.5 rounded-full text-sm font-bold inline-block mb-3 ${isPassed ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`;
    document.getElementById('res-meta').textContent = `총 ${this.examState.totalCount}문항 중 ${this.examState.totalCount - wrongQuestions.length}문항 정답 | 오답 ${wrongQuestions.length}문항 오답노트 자동 등록 완료`;

    modal.classList.remove('hidden');
  }

  async askAiExamCritique() {
    const rec = this.examState.lastExamRecord;
    const wrongs = this.examState.lastWrongQuestions || [];
    if (!rec) return;

    this.openAiModal('모의시험 결과 심층 분석 및 AI 총평 생성 중...');
    try {
      const lvlName = HANJA_LEVELS.find(l => l.id === rec.level)?.name || rec.level;
      const prompt = `학습자가 한자능력검정시험 모의시험(${lvlName})을 치렀습니다.
- 총점: ${rec.score}점 / 100점 (합격 여부: ${rec.score >= 80 ? '합격' : '불합격'})
- 총 문항: ${rec.totalQuestions}문항 중 ${rec.totalQuestions - wrongs.length}문항 정답
- 오답 문항 및 틀린 한자:
${wrongs.length > 0 ? wrongs.map((w, i) => `${i + 1}. [${w.kanji}] (${w.hun} ${w.eum})`).join('\n') : '전 문항 100% 정답!'}

위 결과를 바탕으로 에듀테크 한자 전문 코치로서 다음 내용을 친절하고 격려 넘치게 작성해 주세요:
1. 🌟 **총평 및 성취도 평가**: 점수와 합격 여부에 따른 따뜻한 격려와 강점 칭찬
2. 🎯 **틀린 한자 핵심 처방**: 오답이 발생한 한자들의 주요 혼동 포인트 및 암기 팁 (만약 100점이면 만점 축하 메시지와 다음 상위 급수 도전 팁)
3. 🚀 **다음 회차 목표 및 공부법 제안**: 플래시카드 복습 주기와 쓰기 연습 활용 가이드`;

      const result = await gemini.callWithFallback(prompt, '당신은 상냥하고 전문적인 한자능력검정시험 AI 수석 코치입니다.');
      this.renderAiModalContent(`📝 ${rec.score}점 모의시험 AI 맞춤 총평`, result.text, result.model);
    } catch (err) {
      this.renderAiModalError(err.message);
    }
  }

  closeExamResultModal() {
    const modal = document.getElementById('exam-result-modal');
    if (modal) modal.classList.add('hidden');
    this.refreshExamTab();
  }

  // =========================================================================
  // TAB 4: 리포트 & 대시보드 (누적 성장 & 취약 한자 분석)
  // =========================================================================

  refreshReportTab() {
    const user = storage.getActiveUser();
    if (!user) return;

    // Daily Study Counts
    const progressMap = user.progress || {};
    const learnedCount = Object.values(progressMap).filter(p => p.learned).length;
    const ankiMap = user.anki || {};
    const reviewedCount = Object.values(ankiMap).filter(a => a.repetitions > 0).length;

    document.getElementById('rep-stat-streak').textContent = `${user.streak?.count || 1}일`;
    document.getElementById('rep-stat-learned').textContent = `${learnedCount}자`;
    document.getElementById('rep-stat-anki').textContent = `${reviewedCount}장`;

    // Target Grade Mastery
    const targetHanjas = getHanjaByLevel(user.targetLevel || '8');
    const masteredInLevel = targetHanjas.filter(h => progressMap[h.id]?.learned).length;
    const pct = Math.round((masteredInLevel / targetHanjas.length) * 100);
    document.getElementById('rep-mastery-pct').textContent = `${pct}%`;
    document.getElementById('rep-mastery-bar').style.width = `${pct}%`;
    document.getElementById('rep-mastery-sub').textContent = `목표 급수(${HANJA_LEVELS.find(l => l.id === user.targetLevel)?.name}): ${masteredInLevel} / ${targetHanjas.length}자`;

    // Render Charts
    this.renderExamScoreTrendChart(user.mockExams || []);

    // Render Weak Characters List
    this.renderWeakCharactersList();
  }

  renderExamScoreTrendChart(mockExams) {
    const ctx = document.getElementById('chart-exam-trend')?.getContext('2d');
    if (!ctx) return;

    if (this.chartExamTrend) {
      this.chartExamTrend.destroy();
    }

    const recent = mockExams.slice(-7);
    const labels = recent.length > 0 ? recent.map((e, i) => `${i + 1}회차`) : ['1회차', '2회차', '3회차'];
    const data = recent.length > 0 ? recent.map(e => e.score) : [70, 85, 90];

    this.chartExamTrend = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: '모의시험 점수',
          data: data,
          borderColor: '#00F2FE',
          backgroundColor: 'rgba(0, 242, 254, 0.12)',
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#4FACFE',
          pointRadius: 6,
          pointHoverRadius: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: {
            min: 0,
            max: 100,
            grid: { color: 'rgba(226, 232, 240, 0.6)' }
          },
          x: {
            grid: { display: false }
          }
        }
      }
    });
  }

  renderWeakCharactersList() {
    const container = document.getElementById('weak-characters-list');
    if (!container) return;

    const weakList = storage.getWeakListSorted();
    if (weakList.length === 0) {
      container.innerHTML = `
        <div class="p-8 text-center bg-white rounded-2xl border border-slate-100">
          <div class="text-4xl mb-2">🎉</div>
          <div class="font-bold text-slate-700">현재 등록된 취약 한자가 없습니다!</div>
          <div class="text-xs text-slate-400 mt-1">플래시카드나 모의시험에서 틀린 한자가 이곳에 자동으로 기록됩니다.</div>
        </div>
      `;
      return;
    }

    container.innerHTML = weakList.map(item => {
      const h = item.hanja;
      return `
        <div class="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div class="flex items-center gap-4">
            <div class="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center text-2xl font-serif font-bold border border-rose-100">
              ${h.kanji}
            </div>
            <div>
              <div class="font-bold text-slate-800 text-base">${h.hun} ${h.eum}</div>
              <div class="text-xs text-slate-400">부수: ${h.radical} | ${h.strokeCount}획 | 예: ${h.exampleWords[0]}</div>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <span class="px-2.5 py-1 text-xs font-semibold rounded-full bg-rose-100 text-rose-700">
              오답 ${item.totalErrors}회
            </span>
            <button onclick="app.removeWeakHanja('${h.id}')" class="text-slate-300 hover:text-slate-500 p-1" title="오답노트에서 제거">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  removeWeakHanja(hanjaId) {
    storage.clearWeakness(hanjaId);
    this.renderWeakCharactersList();
    this.showToast('오답노트에서 제외했습니다.', 'info');
  }

  startWeakDrill() {
    const weakList = storage.getWeakListSorted();
    if (weakList.length === 0) {
      alert('복습할 취약 한자가 없습니다!');
      return;
    }
    // Switch to flashcard with weak cards only
    this.cardQueue = weakList.map(item => item.hanja);
    this.cardIndex = 0;
    this.switchTab('card');
    this.showToast(`🔥 취약 한자 ${this.cardQueue.length}개 집중 복습을 시작합니다!`, 'success');
  }

  async askAiWeakCoaching() {
    const weakList = storage.getWeakListSorted();
    if (weakList.length === 0) {
      alert('분석할 취약 한자 데이터가 없습니다.');
      return;
    }

    this.openAiModal('취약 한자 정밀 분석 및 맞춤 코칭 리포트 생성 중...');
    try {
      const result = await gemini.generateWeakCoaching(weakList);
      this.renderAiModalContent('🔍 AI 취약 한자 정밀 진단 및 처방전', result.text, result.model);
    } catch (err) {
      this.renderAiModalError(err.message);
    }
  }

  // =========================================================================
  // TAB 5: 설정 및 AI 어시스턴트 (Gemini API & Backup)
  // =========================================================================

  refreshSettingsTab() {
    this.updateCloudSyncPillUI();
    const apiKeyInput = document.getElementById('setting-gemini-key');
    if (apiKeyInput) {
      apiKeyInput.value = storage.getGeminiApiKey();
    }
    const user = storage.getActiveUser();
    const fontRadio = document.querySelector(`input[name="font-pref"][value="${user?.fontPreference || 'serif'}"]`);
    if (fontRadio) fontRadio.checked = true;

    const soundToggle = document.getElementById('setting-sound-toggle');
    if (soundToggle) soundToggle.checked = this.sound.enabled;
  }

  saveGeminiApiKey() {
    const key = document.getElementById('setting-gemini-key').value.trim();
    storage.setGeminiApiKey(key);
    this.showToast('Gemini API Key가 안전하게 저장되었습니다.', 'success');
  }

  async testGeminiConnection() {
    this.saveGeminiApiKey();
    this.showToast('Gemini API Fallback 연결 테스트 중...', 'info');
    try {
      const res = await gemini.callWithFallback('한자능력검정시험 학습자를 위한 짧은 격려 명언 1줄을 작성해 줘.');
      this.showToast(`✅ 연결 성공! (${res.model}) : ${res.text.trim()}`, 'success');
    } catch (err) {
      this.showToast(`❌ 연결 실패: ${err.message}`, 'error');
    }
  }

  setFontPreference(pref) {
    const user = storage.getActiveUser();
    storage.updateUserProfile(user.id, { fontPreference: pref });
    this.applyFontPreference(pref);
    this.showToast(`한자 글꼴을 [${pref === 'serif' ? '명조/해서체' : '고딕체'}] 로 변경했습니다.`, 'info');
  }

  toggleSound(enabled) {
    this.sound.enabled = enabled;
    this.showToast(`효과음이 [${enabled ? '켜짐' : '꺼짐'}] 상태로 변경되었습니다.`, 'info');
  }

  exportDataBackup() {
    const json = storage.exportAllDataJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hanja_study_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.showToast('전체 학습 데이터 백업 파일이 다운로드되었습니다.', 'success');
  }

  importDataBackup(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const res = storage.importAllDataJSON(e.target.result);
      if (res.success) {
        this.loadActiveUserLevelData();
        this.renderHeaderUserInfo();
        this.switchTab('study');
        this.showToast(`데이터 복원 성공! (총 ${res.userCount}명 사용자 복원)`, 'success');
      } else {
        alert('데이터 복원에 실패했습니다: ' + res.message);
      }
    };
    reader.readAsText(file);
  }

  // =========================================================================
  // AI Modal Helper
  // =========================================================================

  openAiModal(loadingMessage) {
    const modal = document.getElementById('ai-modal');
    if (!modal) return;
    document.getElementById('ai-modal-title').textContent = '🤖 Gemini AI 어시스턴트';
    document.getElementById('ai-modal-model-badge').textContent = '호출 준비 중...';
    document.getElementById('ai-modal-body').innerHTML = `
      <div class="p-8 text-center">
        <div class="inline-block w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <div class="text-slate-600 font-medium">${loadingMessage}</div>
        <div class="text-xs text-slate-400 mt-2">우선순위: gemini-3.8-flash ➔ 3.6 ➔ 3.5 ➔ 2.5 자동 폴백 중...</div>
      </div>
    `;
    modal.classList.remove('hidden');
  }

  renderAiModalContent(title, content, model) {
    document.getElementById('ai-modal-title').textContent = title;
    const badge = document.getElementById('ai-modal-model-badge');
    badge.textContent = `⚡ ${model} 응답 완료`;
    badge.className = 'px-3 py-1 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-800';

    // Simple markdown line formatter
    const formatted = content
      .replace(/\*\*(.*?)\*\*/g, '<strong class="text-slate-900">$1</strong>')
      .replace(/\n/g, '<br/>');

    document.getElementById('ai-modal-body').innerHTML = `
      <div class="p-6 text-slate-700 leading-relaxed space-y-3 font-normal text-sm md:text-base">
        ${formatted}
      </div>
    `;
  }

  renderAiModalError(errorMsg) {
    document.getElementById('ai-modal-model-badge').textContent = '호출 실패';
    document.getElementById('ai-modal-model-badge').className = 'px-3 py-1 text-xs font-semibold rounded-full bg-rose-100 text-rose-700';
    document.getElementById('ai-modal-body').innerHTML = `
      <div class="p-6 text-center text-rose-600">
        <div class="text-3xl mb-2">⚠️</div>
        <div class="font-bold mb-2">AI 응답 생성 실패</div>
        <div class="text-xs text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-200">${errorMsg}</div>
        <div class="mt-4">
          <button onclick="app.closeAiModal()" class="px-5 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold">닫기</button>
        </div>
      </div>
    `;
  }

  closeAiModal() {
    const modal = document.getElementById('ai-modal');
    if (modal) modal.classList.add('hidden');
  }

  // =========================================================================
  // Firebase Authentication & Multi-Device Cloud Sync
  // =========================================================================

  initFirebaseSync() {
    if (typeof firebaseService !== 'undefined') {
      firebaseService.onStatusChange = (status, user) => {
        this.updateCloudSyncPillUI();
      };
      this.updateCloudSyncPillUI();
    }
  }

  updateCloudSyncPillUI() {
    const isUserLoggedIn = firebaseService && firebaseService.currentUser;
    const user = isUserLoggedIn ? firebaseService.currentUser : null;

    // 1. Header Sync Button & Dot
    const syncText = document.getElementById('cloud-sync-text');
    const syncDot = document.getElementById('cloud-sync-dot');

    if (syncText) {
      syncText.textContent = user ? (user.displayName || user.email.split('@')[0]) : '동기화';
    }
    if (syncDot) {
      syncDot.className = user 
        ? 'w-2 h-2 rounded-full bg-emerald-500 shadow-sm ring-2 ring-emerald-200' 
        : 'w-2 h-2 rounded-full bg-slate-300';
    }

    // 2. Settings Tab Sync Card
    const statusBadge = document.getElementById('setting-sync-status-badge');
    const emailEl = document.getElementById('setting-sync-email');
    const timeEl = document.getElementById('setting-sync-time');
    const loginBtn = document.getElementById('setting-sync-login-btn');
    const nowBtn = document.getElementById('setting-sync-now-btn');
    const fetchBtn = document.getElementById('setting-sync-fetch-btn');
    const logoutBtn = document.getElementById('setting-sync-logout-btn');

    if (statusBadge) {
      statusBadge.textContent = user ? '☁️ 클라우드 동기화 활성' : '비로그인 상태';
      statusBadge.className = `px-3 py-1 rounded-full text-xs font-bold ${user ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600'}`;
    }
    if (emailEl) {
      emailEl.textContent = user ? `${user.email} (${user.displayName || '학습자'})` : '로그인 필요';
    }
    if (timeEl) {
      timeEl.textContent = firebaseService?.lastSyncTime 
        ? firebaseService.lastSyncTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) 
        : '-';
    }

    if (loginBtn) loginBtn.classList.toggle('hidden', !!user);
    if (nowBtn) nowBtn.classList.toggle('hidden', !user);
    if (fetchBtn) fetchBtn.classList.toggle('hidden', !user);
    if (logoutBtn) logoutBtn.classList.toggle('hidden', !user);

    // 3. Modal internal view
    const loggedInView = document.getElementById('auth-logged-in-view');
    const formView = document.getElementById('auth-form-view');
    const modalEmail = document.getElementById('auth-user-email-display');
    const modalSyncTime = document.getElementById('auth-last-sync-display');

    if (loggedInView && formView) {
      if (user) {
        loggedInView.classList.remove('hidden');
        formView.classList.add('hidden');
        if (modalEmail) modalEmail.textContent = user.email;
        if (modalSyncTime) {
          modalSyncTime.textContent = firebaseService?.lastSyncTime 
            ? `최근 동기화: ${firebaseService.lastSyncTime.toLocaleTimeString()}` 
            : '최근 동기화: 방금 전';
        }
      } else {
        loggedInView.classList.add('hidden');
        formView.classList.remove('hidden');
      }
    }
  }

  openAuthModal() {
    this.updateCloudSyncPillUI();
    const modal = document.getElementById('auth-modal');
    if (modal) modal.classList.remove('hidden');
  }

  closeAuthModal() {
    const modal = document.getElementById('auth-modal');
    if (modal) modal.classList.add('hidden');
  }

  switchAuthTab(mode) {
    this.authMode = mode;
    const tabLogin = document.getElementById('auth-tab-login');
    const tabSignup = document.getElementById('auth-tab-signup');
    const nameContainer = document.getElementById('auth-field-name-container');
    const submitBtn = document.getElementById('auth-submit-btn');

    if (mode === 'login') {
      tabLogin.className = 'py-2 rounded-xl bg-white text-slate-900 shadow-sm transition';
      tabSignup.className = 'py-2 rounded-xl text-slate-500 transition';
      nameContainer.classList.add('hidden');
      submitBtn.textContent = '로그인하고 동기화 시작';
    } else {
      tabSignup.className = 'py-2 rounded-xl bg-white text-slate-900 shadow-sm transition';
      tabLogin.className = 'py-2 rounded-xl text-slate-500 transition';
      nameContainer.classList.remove('hidden');
      submitBtn.textContent = '회원가입하고 폰/패드 동기화 시작';
    }
  }

  async handleAuthSubmit() {
    const email = document.getElementById('auth-email-input').value.trim();
    const password = document.getElementById('auth-password-input').value;
    const displayName = document.getElementById('auth-name-input')?.value.trim() || '';

    if (!email || !password) {
      alert('이메일(ID)과 비밀번호(PW)를 입력해 주세요.');
      return;
    }

    const submitBtn = document.getElementById('auth-submit-btn');
    const origText = submitBtn.textContent;
    submitBtn.textContent = '처리 중...';
    submitBtn.disabled = true;

    try {
      if (this.authMode === 'login') {
        await firebaseService.signIn(email, password);
        this.showToast(`로그인 성공! [${email}] 기기 동기화가 시작됩니다.`, 'success');
      } else {
        await firebaseService.signUp(email, password, displayName);
        this.showToast(`가입 완료! [${email}] 클라우드 동기화가 활성화되었습니다.`, 'success');
      }
      this.closeAuthModal();
      this.updateCloudSyncPillUI();
      this.sound.playChime('complete');
    } catch (err) {
      alert(err.message);
    } finally {
      submitBtn.textContent = origText;
      submitBtn.disabled = false;
    }
  }

  async syncCloudNow() {
    this.showToast('클라우드에 학습 데이터를 업로드 중...', 'info');
    const res = await firebaseService.saveToCloud();
    if (res.success) {
      this.sound.playChime('success');
      this.showToast('☁️ 클라우드 동기화 완료! 다른 기기에서도 이어서 학습할 수 있습니다.', 'success');
      this.updateCloudSyncPillUI();
    } else {
      this.showToast(`동기화 실패: ${res.error || '잠시 후 다시 시도해 주세요.'}`, 'error');
    }
  }

  async fetchCloudDataNow() {
    this.showToast('클라우드에서 최신 데이터를 가져오는 중...', 'info');
    const cloudData = await firebaseService.fetchFromCloud();
    if (cloudData && Array.isArray(cloudData.users)) {
      storage.importAllDataJSON(JSON.stringify(cloudData));
      this.loadActiveUserLevelData();
      this.renderHeaderUserInfo();
      this.switchTab(this.currentTab);
      this.sound.playChime('complete');
      this.showToast('☁️ 클라우드 최신 데이터 동기화 완료!', 'success');
      this.updateCloudSyncPillUI();
    } else {
      this.showToast('클라우드에 저장된 데이터가 없습니다.', 'warning');
    }
  }

  async handleSignOut() {
    if (confirm('클라우드 동기화를 해제하고 로그아웃하시겠습니까?')) {
      await firebaseService.signOut();
      this.closeAuthModal();
      this.updateCloudSyncPillUI();
      this.showToast('로그아웃되었습니다. (로컬 데이터는 안전하게 유지됩니다)', 'info');
    }
  }

  async handlePasswordReset() {
    const email = prompt('비밀번호 재설정 이메일을 입력해 주세요:');
    if (!email) return;
    try {
      await firebaseService.sendPasswordReset(email);
      alert(`${email} 주소로 비밀번호 재설정 링크를 전송했습니다.`);
    } catch (err) {
      alert(err.message);
    }
  }
}

// Global Application Instance
let app;
window.addEventListener('DOMContentLoaded', () => {
  app = new HanjaApp();
  window.app = app;
});
