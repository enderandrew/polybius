/**
 * voiceCache.js
 *
 * speechSynthesis.getVoices() is asynchronous in most browsers — on first
 * page load it very often returns an empty array, because the underlying
 * voice list hasn't finished loading from the OS/browser yet. Calling it
 * once, immediately, at the exact moment you need a specific voice (e.g.
 * inside ScreenGameEnd's constructor) is a race: it usually returns [],
 * so voice-matching silently falls back to the default voice with no error.
 *
 * Fix: listen for the 'voiceschanged' event once at app boot, and cache
 * the result. Anything that wants a specific voice reads from this cache
 * instead of calling getVoices() directly.
 *
 * Usage:
 *   import { getCachedVoices, findVoice } from '@/utils/voiceCache';
 *   const deepVoice = findVoice(/daniel|google uk|alex|thomas|french/i);
 */

let _voices = [];
let _ready  = false;
let _readyPromise = null;

function _captureVoices () {
  const list = window.speechSynthesis?.getVoices?.() ?? [];
  if (list.length > 0) {
    _voices = list;
    _ready  = true;
  }
  return list;
}

/**
 * Call once at app boot (e.g. from main.js / App.vue mounted hook).
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export function initVoiceCache () {
  if (_readyPromise) return _readyPromise;

  _readyPromise = new Promise((resolve) => {
    // Some browsers (notably Chrome) have voices available immediately;
    // others only populate the list after 'voiceschanged' fires once.
    const initial = _captureVoices();
    if (initial.length > 0) {
      resolve(_voices);
      return;
    }

    if (!window.speechSynthesis) {
      resolve([]);   // No TTS support at all — resolve empty, callers handle gracefully
      return;
    }

    const onVoicesChanged = () => {
      _captureVoices();
      window.speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged);
      resolve(_voices);
    };
    window.speechSynthesis.addEventListener('voiceschanged', onVoicesChanged);

    // Safety timeout — some browsers never fire voiceschanged at all
    // (older Firefox, some mobile WebViews). Don't hang forever.
    setTimeout(() => {
      window.speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged);
      _captureVoices();
      resolve(_voices);
    }, 2000);
  });

  return _readyPromise;
}

/** Synchronous read of whatever's cached so far (may be empty before init resolves). */
export function getCachedVoices () {
  return _voices;
}

export function isVoiceCacheReady () {
  return _ready;
}

/**
 * Find the first cached voice whose name matches the given RegExp.
 * Returns undefined if no match or cache isn't populated yet.
 */
export function findVoice (nameRegex) {
  return _voices.find(v => nameRegex.test(v.name));
}