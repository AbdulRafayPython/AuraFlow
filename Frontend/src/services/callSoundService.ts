// services/callSoundService.ts — Programmatic call sounds via Web Audio API
// No external audio files needed. Generates ringtone / ringback / end tone.

type SoundType = 'ringtone' | 'ringback' | 'callEnd';

class CallSoundService {
  private ctx: AudioContext | null = null;
  private activeNodes: { oscillator?: OscillatorNode; gain?: GainNode; timeout?: ReturnType<typeof setTimeout> }[] = [];
  private loopTimeout: ReturnType<typeof setTimeout> | null = null;
  private isPlaying = false;
  private currentType: SoundType | null = null;

  private getContext(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') {
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  // ── Ringtone: pleasant two-tone pattern (1s on, 2s off) looping ──
  playRingtone() {
    if (this.isPlaying && this.currentType === 'ringtone') return;
    this.stop();
    this.isPlaying = true;
    this.currentType = 'ringtone';
    this._loopRingtone();
  }

  private _loopRingtone() {
    if (!this.isPlaying || this.currentType !== 'ringtone') return;
    this._playToneSequence([
      { freq: 440, duration: 0.15 },
      { pause: 0.08 },
      { freq: 587, duration: 0.15 },
      { pause: 0.08 },
      { freq: 440, duration: 0.15 },
      { pause: 0.08 },
      { freq: 587, duration: 0.15 },
    ], 0.25);
    this.loopTimeout = setTimeout(() => this._loopRingtone(), 2500);
  }

  // ── Ringback: calm single tone (0.4s on, 2s off) — caller hears this ──
  playRingback() {
    if (this.isPlaying && this.currentType === 'ringback') return;
    this.stop();
    this.isPlaying = true;
    this.currentType = 'ringback';
    this._loopRingback();
  }

  private _loopRingback() {
    if (!this.isPlaying || this.currentType !== 'ringback') return;
    this._playTone(440, 0.4, 0.12);
    this.loopTimeout = setTimeout(() => this._loopRingback(), 2800);
  }

  // ── Call end: short descending beep ──
  playCallEnd() {
    this.stop();
    const ctx = this.getContext();
    const now = ctx.currentTime;
    
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(480, now);
    osc.frequency.linearRampToValueAtTime(320, now + 0.25);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.3);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.35);
  }

  // ── Stop all sounds ──
  stop() {
    this.isPlaying = false;
    this.currentType = null;
    if (this.loopTimeout) {
      clearTimeout(this.loopTimeout);
      this.loopTimeout = null;
    }
    for (const node of this.activeNodes) {
      try { node.oscillator?.stop(); } catch {}
      try { node.gain?.disconnect(); } catch {}
      if (node.timeout) clearTimeout(node.timeout);
    }
    this.activeNodes = [];
  }

  // ── Helpers ──
  private _playTone(freq: number, duration: number, volume: number) {
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(volume, now);
      gain.gain.linearRampToValueAtTime(0, now + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + duration + 0.05);
      this.activeNodes.push({ oscillator: osc, gain });
    } catch {}
  }

  private _playToneSequence(steps: ({ freq: number; duration: number } | { pause: number })[], volume: number) {
    let delay = 0;
    for (const step of steps) {
      if ('pause' in step) {
        delay += step.pause;
      } else {
        const t = setTimeout(() => {
          if (this.isPlaying) this._playTone(step.freq, step.duration, volume);
        }, delay * 1000);
        this.activeNodes.push({ timeout: t });
        delay += step.duration;
      }
    }
  }
}

export const callSoundService = new CallSoundService();
