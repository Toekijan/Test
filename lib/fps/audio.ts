/**
 * Fully procedural sound design via the Web Audio API. There is no asset pipeline
 * for licensed samples, so every effect (gunfire, footsteps, impacts, ambience) is
 * synthesized at runtime from oscillators + filtered noise.
 */
export class AudioEngine {
  private ctx: AudioContext;
  private master: GainNode;
  private ambienceGain: GainNode;
  private noiseBuffer: AudioBuffer;

  constructor() {
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.85;
    this.master.connect(this.ctx.destination);

    this.ambienceGain = this.ctx.createGain();
    this.ambienceGain.gain.value = 0.12;
    this.ambienceGain.connect(this.master);

    this.noiseBuffer = this.makeNoiseBuffer(2);
    this.startAmbience();
  }

  resume() {
    if (this.ctx.state === "suspended") this.ctx.resume();
  }

  private makeNoiseBuffer(seconds: number): AudioBuffer {
    const length = Math.floor(this.ctx.sampleRate * seconds);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  private noiseSource(): AudioBufferSourceNode {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    return src;
  }

  private startAmbience() {
    const src = this.noiseSource();
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 220;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 60;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();
    src.connect(filter);
    filter.connect(this.ambienceGain);
    src.start();
  }

  /** Punchy, layered gunshot: transient click + body thump + filtered noise crack. */
  gunshot(weaponPitch = 1, volume = 1) {
    const t = this.ctx.currentTime;
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    gain.connect(this.master);

    // Transient click
    const click = this.ctx.createOscillator();
    click.type = "square";
    click.frequency.setValueAtTime(1200 * weaponPitch, t);
    click.frequency.exponentialRampToValueAtTime(200 * weaponPitch, t + 0.03);
    const clickGain = this.ctx.createGain();
    clickGain.gain.setValueAtTime(0.9, t);
    clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    click.connect(clickGain).connect(gain);
    click.start(t);
    click.stop(t + 0.05);

    // Body thump
    const thump = this.ctx.createOscillator();
    thump.type = "sine";
    thump.frequency.setValueAtTime(120 * weaponPitch, t);
    thump.frequency.exponentialRampToValueAtTime(45 * weaponPitch, t + 0.09);
    const thumpGain = this.ctx.createGain();
    thumpGain.gain.setValueAtTime(1.0, t);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    thump.connect(thumpGain).connect(gain);
    thump.start(t);
    thump.stop(t + 0.13);

    // Noise crack
    const noise = this.noiseSource();
    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.value = 2500 * weaponPitch;
    noiseFilter.Q.value = 0.7;
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.8, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    noise.connect(noiseFilter).connect(noiseGain).connect(gain);
    noise.start(t);
    noise.stop(t + 0.16);

    setTimeout(() => gain.disconnect(), 300);
  }

  footstep(volume = 0.4) {
    const t = this.ctx.currentTime;
    const noise = this.noiseSource();
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 700 + Math.random() * 300;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    noise.connect(filter).connect(gain).connect(this.master);
    noise.start(t);
    noise.stop(t + 0.1);
  }

  reload() {
    const t = this.ctx.currentTime;
    for (let i = 0; i < 2; i++) {
      const click = this.ctx.createOscillator();
      click.type = "square";
      click.frequency.value = 900 + i * 300;
      const g = this.ctx.createGain();
      const start = t + i * 0.18;
      g.gain.setValueAtTime(0.001, start);
      g.gain.linearRampToValueAtTime(0.5, start + 0.005);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.06);
      click.connect(g).connect(this.master);
      click.start(start);
      click.stop(start + 0.07);
    }
  }

  hitmarker() {
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(1800, t);
    osc.frequency.exponentialRampToValueAtTime(900, t + 0.05);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.09);
  }

  impact(volume = 0.5) {
    const t = this.ctx.currentTime;
    const noise = this.noiseSource();
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1500;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    noise.connect(filter).connect(gain).connect(this.master);
    noise.start(t);
    noise.stop(t + 0.11);
  }

  explosion(volume = 1) {
    const t = this.ctx.currentTime;
    const noise = this.noiseSource();
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(2000, t);
    filter.frequency.exponentialRampToValueAtTime(80, t + 0.8);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
    noise.connect(filter).connect(gain).connect(this.master);
    noise.start(t);
    noise.stop(t + 1.2);

    const sub = this.ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.setValueAtTime(90, t);
    sub.frequency.exponentialRampToValueAtTime(30, t + 0.5);
    const subGain = this.ctx.createGain();
    subGain.gain.setValueAtTime(volume, t);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    sub.connect(subGain).connect(this.master);
    sub.start(t);
    sub.stop(t + 0.65);
  }

  damageThud() {
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(90, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.2);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.6, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.26);
  }

  dispose() {
    this.ctx.close();
  }
}
