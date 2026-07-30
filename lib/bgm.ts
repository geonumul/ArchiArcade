"use client";

/**
 * 8비트 칩튠 BGM — 외부 음원 없이 Web Audio 로 직접 합성한다(라이선스 클린).
 *
 * 원본보다 빠르고 높게 잡았다. 템포를 올리고 16분음표로 쪼갠 아르페지오를 얹어
 * 오락실에서 나던 그 들뜬 느낌을 내되, 파형은 square/triangle 만 써서 레트로 질감은
 * 그대로 둔다. 필터나 리버브 같은 현대적 효과는 일부러 쓰지 않았다.
 *
 * 소리는 항상 꺼진 상태로 시작한다. 도서관이나 강의실에서 열었을 때 갑자기 울리지
 * 않도록 하는 원본의 정책을 유지한다.
 */

const BPM = 152; // 원본보다 빠르게 — 밤샘 중에도 손이 움직이는 속도
const STEP = 60 / BPM / 4; // 16분음표 한 칸

// 음이름 → 주파수. 옥타브를 원본보다 하나 올려 밝게 들리게 했다.
const N: Record<string, number> = {
  "A3": 220.0, "B3": 246.94,
  "C4": 261.63, "D4": 293.66, "E4": 329.63, "F4": 349.23, "G4": 392.0, "A4": 440.0, "B4": 493.88,
  "C5": 523.25, "D5": 587.33, "E5": 659.25, "F5": 698.46, "G5": 783.99, "A5": 880.0, "B5": 987.77,
  "C6": 1046.5, "D6": 1174.66, "E6": 1318.51,
};

const R = 0; // 쉼표

/// 리드 — 16분음표로 쪼갠 아르페지오. 32칸(2마디) 단위로 4번 반복해 한 루프.
const LEAD: (string | 0)[][] = [
  ["C5","E5","G5","C6","G5","E5","C5","E5", "A4","C5","E5","A5","E5","C5","A4","C5",
   "F4","A4","C5","F5","C5","A4","F4","A4", "G4","B4","D5","G5","D5","B4","G4","B4"],
  ["C5","E5","G5","C6","E6","C6","G5","E5", "A4","C5","E5","A5","C6","A5","E5","C5",
   "F4","A4","C5","F5","A5","F5","C5","A4", "G4","D5","G5","B5","D6","B5","G5","D5"],
];

/// 베이스 — 8분음표. 리드가 바쁘므로 단순하게 받쳐준다.
const BASS: (string | 0)[] = [
  "C4",R,"C4",R,"G3"==="G3"?"A3":"A3",R,"A3",R,
  "F4",R,"F4",R,"G4",R,"G4",R,
];

interface Voice {
  osc: OscillatorNode;
  gain: GainNode;
}

export class Bgm {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private step = 0;
  private bar = 0;
  private _playing = false;
  private _volume = 0.5;

  get playing() {
    return this._playing;
  }

  setVolume(v: number) {
    this._volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.value = this._volume * 0.22;
  }

  private ensure(): AudioContext {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this._volume * 0.22;
      this.master.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  private blip(freq: number, at: number, dur: number, type: OscillatorType, peak: number) {
    if (!this.ctx || !this.master || freq <= 0) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    // 칩튠 특유의 딱딱한 감쇠 — 곡선을 쓰지 않고 각지게 떨어뜨린다.
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(peak, at + 0.005);
    gain.gain.linearRampToValueAtTime(0, at + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  /// 하이햇 대용 노이즈 — 16분음표 뒷박에 짧게 넣어 속도감을 준다.
  private hat(at: number) {
    if (!this.ctx || !this.master) return;
    const len = Math.floor(this.ctx.sampleRate * 0.02);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    src.buffer = buf;
    gain.gain.value = 0.05;
    src.connect(gain);
    gain.connect(this.master);
    src.start(at);
  }

  private tick = () => {
    if (!this._playing || !this.ctx) return;
    const now = this.ctx.currentTime + 0.05;

    const lead = LEAD[this.bar % LEAD.length];
    const n = lead[this.step % lead.length];
    if (n) this.blip(N[n] ?? 0, now, STEP * 0.9, "square", 0.16);

    // 베이스는 8분음표 자리에서만
    if (this.step % 2 === 0) {
      const b = BASS[(this.step / 2) % BASS.length];
      if (b) this.blip((N[b] ?? 0) / 2, now, STEP * 1.6, "triangle", 0.3);
    }
    // 뒷박 하이햇
    if (this.step % 2 === 1) this.hat(now);

    this.step++;
    if (this.step % 32 === 0) this.bar++;

    this.timer = setTimeout(this.tick, STEP * 1000);
  };

  start() {
    if (this._playing) return;
    const ctx = this.ensure();
    if (ctx.state === "suspended") void ctx.resume();
    this._playing = true;
    this.tick();
  }

  stop() {
    this._playing = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.step = 0;
    this.bar = 0;
  }
}

let shared: Bgm | null = null;
export function bgm(): Bgm {
  if (!shared) shared = new Bgm();
  return shared;
}

/// 효과음 — BGM 과 같은 컨텍스트를 쓰지 않고 짧게 만들어 쓰고 버린다.
export function sfx(kind: "select" | "next" | "clear") {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor();
    const seq: [number, number][] =
      kind === "select"
        ? [[880, 0.06]]
        : kind === "next"
          ? [[660, 0.05], [990, 0.07]]
          : [[523, 0.08], [659, 0.08], [784, 0.08], [1046, 0.16]];
    let t = ctx.currentTime;
    for (const [f, d] of seq) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.12, t);
      g.gain.linearRampToValueAtTime(0, t + d);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + d);
      t += d;
    }
    setTimeout(() => void ctx.close(), (t - ctx.currentTime + 0.2) * 1000);
  } catch {
    /* 오디오를 쓸 수 없는 환경이면 조용히 넘어간다 */
  }
}
