// Sprint Start Reactor — final clean build with audio unlock + test beep
const $ = (sel) => document.querySelector(sel);

const state = {
  running: false, awaitingGun: false, gunAt: 0,
  trial: 0, trialsTarget: 10, lastMs: null, bestMs: null, sumMs: 0, validCount: 0, falseCount: 0,
  autoNext: true, mode: 'beep', vibrate: true, abortController: null, unlocked: false, beforeInstallPrompt: null,
};

// Elements
const cue = $("#cue"), startBtn = $("#startBtn"), testBeepBtn = $("#testBeepBtn"), tapArea = $("#tapArea"), status = $("#status");
const lightMark = $("#light-mark"), lightSet = $("#light-set"), lightGun = $("#light-gun");
const trialCount = $("#trialCount"), lastMsEl = $("#lastMs"), bestMsEl = $("#bestMs"), avgMsEl = $("#avgMs"), falseCountEl = $("#falseCount"), logEl = $("#log");
const trialsInput = $("#trials"), delayPreMin = $("#delayPreMin"), delayPreMax = $("#delayPreMax"), delayMSMin = $("#delayMSMin"), delayMSMax = $("#delayMSMax"), delaySGMin = $("#delaySGMin"), delaySGMax = $("#delaySGMax"), modeSel = $("#mode"), vibrateCb = $("#vibrate"), autoNextCb = $("#autoNext");
const fullscreenBtn = $("#fullscreenBtn"), resetStatsBtn = $("#resetStatsBtn");

// Audio
let audioCtx = null;
function unlockAVOnce(){ if(state.unlocked) return; try{ if(!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)(); if(audioCtx.state==='suspended') audioCtx.resume(); const o=audioCtx.createOscillator(), g=audioCtx.createGain(); o.connect(g).connect(audioCtx.destination); g.gain.setValueAtTime(0.0001, audioCtx.currentTime); o.frequency.value=440; o.start(); o.stop(audioCtx.currentTime+0.02);}catch{} try{ if('speechSynthesis'in window){const u=new SpeechSynthesisUtterance(' '); u.volume=0; speechSynthesis.speak(u); speechSynthesis.cancel();}}catch{} state.unlocked=true; log('Audio unlocked','meta'); }
function beep(freq=880,dur=120){ if(!audioCtx) return; const o=audioCtx.createOscillator(), g=audioCtx.createGain(); o.connect(g).connect(audioCtx.destination); o.frequency.value=freq; g.gain.setValueAtTime(0.0001,audioCtx.currentTime); g.gain.exponentialRampToValueAtTime(0.35,audioCtx.currentTime+0.01); o.start(); o.stop(audioCtx.currentTime+dur/1000); g.gain.exponentialRampToValueAtTime(0.0001,audioCtx.currentTime+dur/1000); }
function speak(text){ if(!('speechSynthesis'in window)) return false; const u=new SpeechSynthesisUtterance(text); const vs=speechSynthesis.getVoices(); const pref=vs.find(v=>/India|en-IN|UK|GB/i.test(v.lang+v.name))||vs.find(v=>/en|US|GB/i.test(v.lang)); if(pref) u.voice=pref; speechSynthesis.cancel(); speechSynthesis.speak(u); return true; }
function sayOrBeep(text){ const m=state.mode; if(m==='voice'){ const ok=speak(text); if(!ok) beepFor(text);} else if(m==='beep'){ beepFor(text);} }
function beepFor(t){ if(!audioCtx) return; const x=t.toLowerCase(); if(x.includes('marks')) beep(440,140); else if(x.includes('set')) beep(660,160); else if(x.includes('gun')||x.includes('go')){ beep(1000,220); setTimeout(()=>beep(1300,160),120);} else beep(800,160); }

function resetLights(){ [lightMark, lightSet, lightGun].forEach(e=>e.classList.remove('on')); }
const rnd=(min,max)=>Math.random()*(max-min)+min;
const sleep=(ms,signal)=>new Promise((res,rej)=>{const id=setTimeout(res,ms); if(signal) signal.addEventListener('abort',()=>{clearTimeout(id); rej(new Error('aborted'))},{once:true});});
function zeroStats(){ state.trial=0; state.lastMs=null; state.bestMs=null; state.sumMs=0; state.validCount=0; state.falseCount=0; updateStats(); logEl.innerHTML=''; }
function updateStats(){ trialCount.textContent=state.trial; lastMsEl.textContent=state.lastMs??'—'; bestMsEl.textContent=state.bestMs??'—'; avgMsEl.textContent=state.validCount?Math.round(state.sumMs/state.validCount):'—'; falseCountEl.textContent=state.falseCount; }
function setCue(t,c=''){ cue.textContent=t; cue.className='cue '+c; } function setStatus(t){ status.textContent=t; }
function log(msg,cls='meta'){ const d=document.createElement('div'); d.textContent=msg; d.className=cls; logEl.prepend(d); }

async function runTrial(){ if(state.running) return; state.running=true; startBtn.disabled=true; tapArea.classList.add('active'); resetLights(); setStatus('Get ready. Tap only after \"Gun!\".'); setCue('Get Ready');
  state.abortController=new AbortController(); const sig=state.abortController.signal;
  try{
    const pre=clampRnd(delayPreMin.valueAsNumber, delayPreMax.valueAsNumber); await sleep(pre*1000,sig);
    lightMark.classList.add('on'); setCue('On your marks'); sayOrBeep('On your marks');
    const msD=clampRnd(delayMSMin.valueAsNumber, delayMSMax.valueAsNumber); await sleep(msD*1000,sig);
    lightSet.classList.add('on'); setCue('Set'); sayOrBeep('Set'); state.awaitingGun=true;
    const sgD=clampRnd(delaySGMin.valueAsNumber, delaySGMax.valueAsNumber); await sleep(sgD*1000,sig);
    lightGun.classList.add('on'); setCue('GUN!'); sayOrBeep('Gun!'); if(state.vibrate&&navigator.vibrate) navigator.vibrate(60); state.gunAt=performance.now();
  }catch(e){ cleanupAfterTrial(); }
}
function finishValidReaction(){ const rt=Math.round(performance.now()-state.gunAt); state.lastMs=rt; if(state.bestMs==null||rt<state.bestMs) state.bestMs=rt; state.sumMs+=rt; state.validCount+=1; state.trial+=1; updateStats(); log(`Trial ${state.trial}: ${rt} ms ✅`,'good'); setStatus(`Nice. ${rt} ms`); setCue('Tap Start for next'); cleanupAfterTrial(); autoMaybeNext(); }
function falseStart(){ state.falseCount+=1; updateStats(); state.trial+=1; log(`Trial ${state.trial}: FALSE START ❌`,'bad'); setStatus('False start. Wait for \"Gun!\"'); setCue('False start'); cleanupAfterTrial(); autoMaybeNext(); }
function autoMaybeNext(){ if(state.autoNext&&state.trial<state.trialsTarget) setTimeout(()=>{startBtn.click();},1000); else if(state.trial>=state.trialsTarget) setStatus('Set complete. Adjust settings or start again.'); }
function cleanupAfterTrial(){ state.running=false; state.awaitingGun=false; state.gunAt=0; startBtn.disabled=false; tapArea.classList.remove('active'); state.abortController?.abort(); state.abortController=null; resetLights(); }
function clampRnd(min,max){ let lo=Math.min(min,max), hi=Math.max(min,max); if(hi===lo) hi=lo+0.001; return rnd(lo,hi); }

startBtn.addEventListener('click', ()=>{ unlockAVOnce(); state.trialsTarget=Math.max(1,Math.min(50,trialsInput.valueAsNumber||10)); state.autoNext=!!autoNextCb.checked; state.mode=modeSel.value; state.vibrate=!!vibrateCb.checked; if(state.trial>=state.trialsTarget) state.trial=0; setStatus(''); runTrial(); });
testBeepBtn.addEventListener('click', ()=>{ unlockAVOnce(); state.mode==='voice'?speak('Test'):beep(1200,200); });
document.addEventListener('pointerdown', unlockAVOnce, { once:true });
tapArea.addEventListener('pointerdown', ()=>{ if(!state.running) return; if(state.awaitingGun && state.gunAt===0) falseStart(); else if(state.awaitingGun && state.gunAt>0) finishValidReaction(); });
document.addEventListener('keydown', (e)=>{ if(e.code==='Space'){ e.preventDefault(); tapArea.dispatchEvent(new PointerEvent('pointerdown')); } });
fullscreenBtn?.addEventListener('click', async()=>{ const el=document.documentElement; try{ if(!document.fullscreenElement) await el.requestFullscreen(); else await document.exitFullscreen(); }catch{} });
resetStatsBtn?.addEventListener('click', ()=>{ zeroStats(); setStatus('Stats reset.'); });
tapArea.addEventListener('touchmove', e=>{ if(state.running) e.preventDefault(); }, {passive:false});

if('serviceWorker'in navigator){ window.addEventListener('load', ()=>{ navigator.serviceWorker.register('./sw.js').catch(()=>{}); }); }
zeroStats(); setCue('Tap Start'); setStatus('');
if('speechSynthesis'in window){ speechSynthesis.onvoiceschanged=()=>{}; }