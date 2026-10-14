/**
 * Gemini API Automatic Multi-Model Fallback Router
 * Priority order:
 * 1) gemini-3.8-flash
 * 2) gemini-3.6-flash
 * 3) gemini-3.5-flash
 * 4) gemini-2.5-flash
 */

const GEMINI_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-2.5-flash'
];

class GeminiService {
  constructor() {
    this.models = GEMINI_MODELS;
    this.lastSuccessfulModel = null;
    this.onStatusChange = null; // callback(message, type: 'info'|'warning'|'success'|'error')
  }

  getApiKey() {
    return storage.getGeminiApiKey();
  }

  notify(message, type = 'info') {
    if (typeof this.onStatusChange === 'function') {
      this.onStatusChange(message, type);
    }
  }

  /**
   * Core Fallback Caller:
   * Tries models in sequential order. If any error (429, 404, 5xx, or network failure),
   * falls back immediately to the next model.
   */
  async callWithFallback(prompt, systemInstruction = '') {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('Google Gemini API Key가 설정되지 않았습니다. [설정] 탭에서 API Key를 입력해 주세요.');
    }

    let lastError = null;

    for (let i = 0; i < this.models.length; i++) {
      const model = this.models[i];
      try {
        if (i > 0) {
          this.notify(`⚠️ 이전 모델 오류로 하위 모델 [${model}] 로 자동 전환 시도 중...`, 'warning');
        }

        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        
        const requestBody = {
          contents: [
            {
              parts: [{ text: prompt }]
            }
          ]
        };

        if (systemInstruction) {
          requestBody.systemInstruction = {
            parts: [{ text: systemInstruction }]
          };
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          const errMsg = errData.error?.message || `HTTP ${response.status} ${response.statusText}`;
          throw new Error(`[${model}] ${errMsg}`);
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) {
          throw new Error(`[${model}] 빈 응답이 반환되었습니다.`);
        }

        this.lastSuccessfulModel = model;
        this.notify(`⚡ AI 응답 완료 (${model})`, 'success');
        return { text, model };
      } catch (err) {
        lastError = err;
        console.warn(`Gemini fallback warning: ${model} failed ->`, err.message);
        // Continue to next model in loop
      }
    }

    // If all models failed
    const finalMsg = `모든 Gemini 모델 호출 실패 (마지막 오류: ${lastError?.message || '알 수 없는 오류'})`;
    this.notify(`❌ ${finalMsg}`, 'error');
    throw new Error(finalMsg);
  }

  /**
   * Feature 1: 한자 연상 암기 스토리텔링 (부수 분해 + 재미있는 암기 공식)
   */
  async generateMnemonic(hanjaObj) {
    const systemPrompt = `당신은 한자능력검정시험 전문 스타강사이자 친근한 한자 스토리텔러입니다.
초등학생~일반인 학습자가 한자를 쉽고 재미있게 외울 수 있도록, 글자의 부수와 모양을 쪼개어 기발하고 기억에 쏙쏙 박히는 연상 암기 스토리를 제공해 주세요.
반드시 한국어로 친절하고 밝은 어조로 답변하세요.`;

    const userPrompt = `다음 한자의 연상 암기법을 작성해 주세요:
- 한자: ${hanjaObj.kanji}
- 훈/음: ${hanjaObj.hun} ${hanjaObj.eum}
- 부수: ${hanjaObj.radical} (총 ${hanjaObj.strokeCount}획)
- 대표 단어: ${hanjaObj.exampleWords.join(', ')}

아래 형식으로 간결하고 시각적으로 깔끔하게 작성해 주세요:
1. 💡 **글자 분해 돋보기**: 부수와 글자의 구성 요소를 나누어 설명
2. 📖 **연상 암기 스토리**: 눈앞에 그림이 그려지듯 2~3문장의 흥미로운 이야기
3. 🎯 **단어 속 한자 쏙쏙**: 대표 단어 하나를 골라 실생활 문장 예시`;

    return await this.callWithFallback(userPrompt, systemPrompt);
  }

  /**
   * Feature 2: 취약 한자 분석 & 1:1 맞춤 코칭 리포트
   */
  async generateWeakCoaching(weakList) {
    const systemPrompt = `당신은 에듀테크 한자 학습 코치입니다.
학습자의 오답 데이터(자주 틀리거나 복습 시기를 놓친 한자들)를 분석하여 격려와 함께 핵심 혼동 방지 꿀팁과 복습 처방전을 제공합니다.`;

    const weakSummary = weakList.slice(0, 7).map((item, idx) => {
      const h = item.hanja;
      return `${idx + 1}. [${h.kanji}] (${h.hun} ${h.eum}) - 총 오답 횟수: ${item.totalErrors}회`;
    }).join('\n');

    const userPrompt = `학습자가 가장 많이 틀린 취약 한자 상위 목록입니다:
${weakSummary}

위 한자들을 분석하여 다음 내용을 따뜻하고 전문적으로 작성해 주세요:
1. 🔍 **취약점 정밀 진단**: 왜 이 글자들에서 실수가 잦은지(유사한 모양, 헷갈리기 쉬운 훈음 등)
2. ⚡ **쌍둥이 한자 비교/구분법**: 서로 헷갈리기 쉬운 글자 구별 포인트
3. 🏆 **오늘의 집중 복습 챌린지**: 바로 실천할 수 있는 한 줄 암기 액션 플랜`;

    return await this.callWithFallback(userPrompt, systemPrompt);
  }
}

// Global instance
const gemini = new GeminiService();
