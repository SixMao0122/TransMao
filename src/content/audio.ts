/**
 * 雙層發音播放器：
 * 1. 優先播放辭典官方真人 MP3 音檔
 * 2. 若無音檔或受目標網站 CSP 阻擋，無縫降級為瀏覽器原生 Web Speech API (TTS)
 */
let activeAudio: HTMLAudioElement | null = null;

export async function speakWord(
  text: string,
  accent: 'us' | 'uk' = 'us',
  audioUrl?: string
): Promise<void> {
  stopSpeaking();

  if (audioUrl) {
    try {
      const audio = new Audio(audioUrl);
      activeAudio = audio;
      await audio.play();
      return;
    } catch {
      // 網站 CSP 阻擋或音檔載入失敗時，自動降級為本機語音合成
    }
  }

  speakWithWebSpeech(text, accent);
}

export function stopSpeaking(): void {
  if (activeAudio) {
    activeAudio.pause();
    activeAudio = null;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

function speakWithWebSpeech(text: string, accent: 'us' | 'uk'): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  const targetLang = accent === 'uk' ? 'en-GB' : 'en-US';
  utterance.lang = targetLang;
  utterance.rate = 0.95;

  const voices = window.speechSynthesis.getVoices();
  const preferred =
    voices.find((v) => v.lang.toLowerCase() === targetLang.toLowerCase()) ??
    voices.find((v) => v.lang.toLowerCase().startsWith('en'));
  if (preferred) {
    utterance.voice = preferred;
  }

  window.speechSynthesis.speak(utterance);
}
