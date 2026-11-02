/* ========================================
   SOUNDS — Digital Alarm Clock
   Uses Web Audio API to generate an authentic
   digital alarm clock beep sound.
   ======================================== */

let audioCtx = null;

/**
 * Lazy-initialize the AudioContext.
 */
function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * Play a dual-tone digital beep (two frequencies layered).
 * Real digital alarms use high-frequency tones around 2–4kHz.
 */
function playDigitalBeep(startDelay = 0, duration = 0.08, volume = 0.18) {
  const ctx = getAudioContext();
  const now = ctx.currentTime + startDelay;

  // Two oscillators at different high frequencies create
  // the recognizable sharp electronic alarm tone
  const freqs = [2500, 3200];

  freqs.forEach((freq) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "square";
    osc.frequency.setValueAtTime(freq, now);

    // Hard on/off — no fade — like a real digital alarm
    gain.gain.setValueAtTime(volume, now);
    gain.gain.setValueAtTime(0, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + duration + 0.01);
  });
}

/**
 * Play one burst of the digital alarm:
 * 3 rapid beeps — BIP BIP BIP
 */
function playAlarmBurst(offsetSeconds = 0) {
  playDigitalBeep(offsetSeconds + 0.0, 0.1, 0.18);
  playDigitalBeep(offsetSeconds + 0.2, 0.1, 0.18);
  playDigitalBeep(offsetSeconds + 0.4, 0.1, 0.18);
}

/**
 * Play the full digital alarm alert — fires exactly 2 times.
 * Pattern: BIP-BIP-BIP ... (pause) ... BIP-BIP-BIP
 * @returns {{ stop: () => void }}
 */
export function playAlarmSound() {
  let cancelled = false;

  // First burst immediately
  playAlarmBurst(0);

  // Second burst after 1 second pause
  const timeout = setTimeout(() => {
    if (!cancelled) {
      playAlarmBurst(0);
    }
  }, 1000);

  return {
    stop() {
      cancelled = true;
      clearTimeout(timeout);
    },
  };
}

/**
 * Play a single soft beep — used when the timer is manually stopped.
 */
export function playTimerStopSound() {
  playDigitalBeep(0, 0.12, 0.12);
}

/**
 * Play a short, warm ascending arpeggio for meaningful wins
 * (daily goal reached, Focus 3 cleared).
 */
export function playCelebrationSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 · E5 · G5 · C6

  notes.forEach((freq, index) => {
    const start = now + index * 0.09;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, start);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.16, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.34);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(start);
    osc.stop(start + 0.36);
  });
}
