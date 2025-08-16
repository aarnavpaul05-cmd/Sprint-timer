// Sprint Start Reactor — app.js (Audio-Unlock + iOS-safe)
// Drop-in replacement. Pairs with index.html/style.css from your repo.

const $ = (sel) => document.querySelector(sel);

const state = {
  running: false,
  awaitingGun: false,
  gunAt: 0,
  trial: 0,
  trialsTarget: 10,
  lastMs: null,
  bestMs: null,
  sumMs: 0,
  validCount: 0,
  falseCount: 0,
  autoNext: true,
  mode: 'voice',
  vibrate: true,
  abortController: null,
  unlocked: false,
  beforeInstallPrompt: null,
};

// Elements
const cue = $("#cue");
const startBtn = $("#startBtn");
const tapArea = $("#tapArea");
const status = $("#status");
const lightMark = $("#light-mark");
const lightSet = $("#light-set");
const lightGun = $("#light-gun");
const trialCount = $("#trialCount");
const lastMsEl = $("#lastMs");
const bestMsEl = $("#bestMs");
const avgMsEl = $("#avgMs");
const falseCountEl = $("#falseCount");
const logEl = $("#log");
const installBtn = $("#installBtn");

const trialsInput = $("#trials");
const delayPreMin = $("#delayPreMin");
const delayPreMax = $("#delayPreMax");
const delayMSMin = $("#delayMSMin");
const delayMSMax = $("#delayMSMax");
const delaySGMin = $("#delaySGMin");
const delaySGMax = $("#delaySGMax");
const modeSel = $("#mode");
const vibrateCb = $("#vibrate");
const autoNextCb = $("#autoNext");
const fullscreenBtn = $("#fullscreenBtn");
const resetStatsBtn = $("#resetStatsBtn");

// ---------- Audio ----------
let audioCtx = null;

// Unlock audio & speech on first direct tap
function unlockAVOnce() {
  if (state.unlocked) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    // ultra-short inaudible osc to satisfy iOS gesture requirement
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.connect(g).connect(audioCtx.destination);
    g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    o.frequency.value = 440;
    o.start();
    o.stop(audioCtx.currentTime + 0.02);
  } catch {}
  try {
    if ('speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      window.speechSynthesis.speak(u);
      window.speechSynthesis.cancel();
    }
  } catch {}
  state.unlocked = true;
  log('Audio unlocked', 'meta');
}

function beep(freq=880, dur=120) {
  if (!audioCtx) return;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.connect(g).connect(audioCtx.destination);
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.3, audioCtx.currentTime + 0.01);
  o.start();
  o.stop(audioCtx.currentTime + dur/1000);
  g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur/1000);
}

function speak(text) {
  if (!('speechSynthesis' in window)) return false;
  const u = new SpeechSynthesisUtterance(text);
  const voices = speechSynthesis.getVoices();
  const preferred = voices.find(v => /India|en-IN|UK|GB/i.test(v.lang+v.name)) || voices.find(v => /en|US|GB/i.test(v.lang));
  if (preferred) u.voice = preferred;
  u.rate = 1.0; u.pitch = 1.0; u.volume = 1.0;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
  return true;
}

function sayOrBeep(text) {
  const mode = state.mode;
  if (mode === 'voice') {
    const ok = speak(text);
    if (!ok) beepForText(text);
  } else if (mode === 'beep') {
    beepForText(text);
  } // silent => lights only
}

function beepForText(text) {
  if (!audioCtx) return;
  const t = text.toLowerCase();
  if (t.includes('marks')) beep(440, 140);
  else if (t.includes('set')) beep(660, 160);
  else if (t.includes('gun') || t.includes('go')) { beep(1000, 220); setTimeout(()=>beep(1300, 160), 120); }
  else { beep(800, 160); }
}

// ---------- UI helpers ----------
function resetLights() { [lightMark, lightSet, lightGun].forEach(el => el.classList.remove('on')); }
const rnd = (min, max) => Math.random() * (max - min) + min;
const sleep = (ms, signal) => new Promise((res, rej) => {
  const id = setTimeout(res, ms);
  if (signal) signal.addEventListener('abort', () => { clearTimeout(id); rej(new Error('aborted')) }, {once:true});
});

function zeroStats() {
  state.trial = 0; state.lastMs = null; state.bestMs = null;
  state.sumMs = 0; state.validCount = 0; state.falseCount = 0;
  updateStats(); logEl.innerHTML = '';
}
function updateStats() {
  trialCount.textContent = state.trial;
  lastMsEl.textContent = state.lastMs ?? '—';
  bestMsEl.textContent = state.bestMs ?? '—';
  avgMsEl.textContent = state.validCount ? Math.round(state.sumMs / state.validCount) : '—';
  falseCountEl.textContent = state.falseCount;
}
function setCue(text, extraClass='') { cue.textContent = text; cue.className = 'cue ' + extraClass; }
function setStatus(text) { status.textContent = text; }
function log(msg, cls='meta') { const d=document.createElement('div'); d.textContent=msg; d.className=cls; logEl.prepend(d); }

// ---------- Main flow ----------
async function runTrial() {
  if (state.running) return;
  state.running = true;
  startBtn.disabled = true;
  tapArea.classList.add('active');
  resetLights();
  setStatus('Get ready. Tap only after "Gun!".');
  setCue('Get Ready');

  state.abortController = new AbortController();
  const sig = state.abortController.signal;

  try {
    const pre = clampRnd(delayPreMin.valueAsNumber, delayPreMax.valueAsNumber);
    await sleep(pre * 1000, sig);

    lightMark.classList.add('on'); setCue('On your marks'); sayOrBeep('On your marks');

    const msDelay = clampRnd(delayMSMin.valueAsNumber, delayMSMax.valueAsNumber);
    await sleep(msDelay * 1000, sig);

    lightSet.classList.add('on'); setCue('Set'); sayOrBeep('Set'); state.awaitingGun = true;

    const sgDelay = clampRnd(delaySGMin.valueAsNumber, delaySGMax.valueAsNumber);
    await sleep(sgDelay * 1000, sig);

    lightGun.classList.add('on'); setCue('GUN!'); sayOrBeep('Gun!');
    if (state.vibrate && navigator.vibrate) navigator.vibrate(60);
    state.gunAt = performance.now();
  } catch (e) { cleanupAfterTrial(); }
}

function finishValidReaction() {
  const rt = Math.round(performance.now() - state.gunAt);
  state.lastMs = rt; if (state.bestMs == null || rt < state.bestMs) state.bestMs = rt;
  state.sumMs += rt; state.validCount += 1; state.trial += 1;
  updateStats(); log(`Trial ${state.trial}: ${rt} ms ✅`, 'good');
  setStatus(`Nice. ${rt} ms`); setCue('Tap Start for next');
  cleanupAfterTrial(); autoMaybeNext();
}
function falseStart() {
  state.falseCount += 1; updateStats(); state.trial += 1;
  log(`Trial ${state.trial}: FALSE START ❌`, 'bad');
  setStatus('False start. Wait for "Gun!"'); setCue('False start');
  cleanupAfterTrial(); autoMaybeNext();
}
function autoMaybeNext() {
  if (state.autoNext && state.trial < state.trialsTarget) setTimeout(()=>{ startBtn.click(); }, 1000);
  else if (state.trial >= state.trialsTarget) setStatus('Set complete. Adjust settings or start again.');
}
function cleanupAfterTrial() {
  state.running = false; state.awaitingGun = false; state.gunAt = 0;
  startBtn.disabled = false; tapArea.classList.remove('active');
  state.abortController?.abort(); state.abortController = null; resetLights();
}
function clampRnd(min, max) { let lo=Math.min(min,max), hi=Math.max(min,max); if (hi===lo) hi=lo+0.001; return rnd(lo,hi); }

// ---------- Events ----------
startBtn.addEventListener('click', () => {
  // Unlock audio/speech immediately on this direct gesture
  unlockAVOnce();

  state.trialsTarget = Math.max(1, Math.min(50, trialsInput.valueAsNumber || 10));
  state.autoNext = !!autoNextCb.checked;
  state.mode = modeSel.value;
  state.vibrate = !!vibrateCb.checked;
  if (state.trial >= state.trialsTarget) state.trial = 0;
  setStatus('');
  runTrial();
});

// Any first tap anywhere also unlocks A/V (fallback)
document.addEventListener('pointerdown', unlockAVOnce, { once: true });

tapArea.addEventListener('pointerdown', () => {
  if (!state.running) return;
  if (state.awaitingGun && state.gunAt === 0) falseStart();
  else if (state.awaitingGun && state.gunAt > 0) finishValidReaction();
});

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space') { e.preventDefault(); tapArea.dispatchEvent(new PointerEvent('pointerdown')); }
});

fullscreenBtn?.addEventListener('click', async () => {
  const elem = document.documentElement;
  try { if (!document.fullscreenElement) { await elem.requestFullscreen(); } else { await document.exitFullscreen(); } } catch {}
});

resetStatsBtn?.addEventListener('click', () => { zeroStats(); setStatus('Stats reset.'); });

tapArea.addEventListener('touchmove', (e)=>{ if (state.running) e.preventDefault(); }, {passive:false});

// PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(()=>{}); });
}
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); state.beforeInstallPrompt = e; installBtn && (installBtn.hidden = false);
});
installBtn?.addEventListener('click', async () => {
  if (!state.beforeInstallPrompt) return;
  state.beforeInstallPrompt.prompt();
  const choice = await state.beforeInstallPrompt.userChoice;
  if (choice && choice.outcome === 'accepted') installBtn.hidden = true;
  state.beforeInstallPrompt = null;
});

// Init
zeroStats(); setCue('Tap Start'); setStatus('');
if ('speechSynthesis' in window) { speechSynthesis.onvoiceschanged = () => {}; }
