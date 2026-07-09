import { useEffect, useRef } from 'react';
import { Sparkles, Trophy, Cpu, Shield, Zap, Info } from 'lucide-react';

// --- ENGINE GLOBALS ---
let audioCtx: any = null;
let soundManager: any = null;

export default function App() {
  useEffect(() => {
    // --- ERROR LOGGING ---
    (window as any).gameLog = (msg: string) => {
      console.log("[Oyun]: " + msg);
      const logEl = document.getElementById('debug-log');
      if (logEl) logEl.innerText = msg;
    };
    (window as any).gameLog("Başlatılıyor...");

    // --- AUDIO INITIALIZATION ---
    function initAudio() {
      try {
        if (audioCtx) return;
        const AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (AudioContext) audioCtx = new AudioContext();
      } catch (e) {
        console.error("Ses motoru başlatılamadı:", e);
      }
    }

    console.log("Gölge Labirenti başlatılıyor...");

    // 1. DÜZELTME: Tüm sahne geçiş mantığını tek yerde topla (Rekürsiyonu önle)
    const performSceneSwitch = (sceneId: string) => {
      (window as any).gameLog("Sahne yükleniyor: " + sceneId);
      document.querySelectorAll('.scene').forEach(s => s.classList.remove('active'));
      const scene = document.getElementById(sceneId);
      if (scene) scene.classList.add('active');

      // Başlıkları güncelle
      const globalTitle = document.getElementById('global-header-title');
      const globalSubtitle = document.getElementById('global-header-subtitle');
      if (globalTitle && globalSubtitle) {
        const titles: any = {
          'splash-screen': ["Gölge Labirenti", "Karanlığın Derinlikleri"],
          'map-screen': ["Kadim Harita", "Gölge Diyarı"],
          'door-scene': ["Mühürlü Kapı", "Bölge Geçidi"],
          'game-scene': ["Gölge Labirenti", `${state.level}. Derinlik`]
        };
        if (titles[sceneId]) {
          globalTitle.innerText = titles[sceneId][0];
          globalSubtitle.innerText = titles[sceneId][1];
        }
      }

      // Harita kaydırma
      if (sceneId === 'map-screen') {
        try {
          updateMapHUD();
          const container = scene?.querySelector('.map-container');
          const scrollContent = scene?.querySelector('.map-scroll-content');
          if (container && scrollContent) {
            const activeRegion = regionData.find(r => r.id === progress.maxUnlockedLevel);
            if (activeRegion) {
              const topVal = parseFloat(activeRegion.top);
              const contentHeight = scrollContent.clientHeight || 1100;
              setTimeout(() => {
                const targetY = (topVal / 100) * contentHeight - (window.innerHeight / 2);
                container.scrollTo({ top: Math.max(0, targetY), behavior: 'smooth' });
              }, 100);
            }
          }
        } catch (e) { console.error(e); }
      }
    };

    (window as any).showScene = function (sceneId: string) {
      if (soundManager) soundManager.play('click', 0.4);
      if (sceneId === 'game-scene' && soundManager) soundManager.startAmbient();
      performSceneSwitch(sceneId);
    };

    function showScene(sceneId: string) {
      performSceneSwitch(sceneId);
    }

    const runes = ["ᚠ", "ᚢ", "ᚦ", "ᚨ", "ᚱ", "ᚲ", "ᚷ", "ᚹ", "ᚺ", "ᚾ", "ᛟ", "ᛈ", "ᛉ", "ᛊ", "ᛏ", "ᛒ"];
    const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
    const ctx = canvas?.getContext('2d');
    const vignette = document.getElementById('vignette');

    let progress = { charLevel: 1, maxHealth: 100, lightMod: 1.0, regenMod: 1.0, totalUpgrades: 0, maxUnlockedLevel: 1, collectedScrolls: [] as string[] };
    let state = {
      level: 1, score: 0, active: false, cd: false, attackCd: false,
      gridSize: 15, cellSize: 70,
      scrollsRequired: 0, scrollsCollected: 0,
      shakeAmount: 0, guardianNear: false, flashActive: false,
      health: 100, takingDamage: false, inventoryOpen: false, lightRadius: 180,
      keysRequired: 0, keysCollected: 0,
      fragmentsCollected: 0,
      exitLocked: false,
      mapOverlayTimer: 0,
      revealedDoors: 0,
      trapDamageCooldown: 0,
      zone: 0,
      maxZone: 0,
      sanctuaryCount: 7
    };

    interface Enemy {
      id: number;
      type: 'stalker' | 'wraith' | 'sharpshooter' | 'devourer' | 'wallmaw' | 'ivy mimic' | 'illusion';
      x: number;
      y: number;
      sx: number;
      sy: number;
      speed: number;
      wait: number;
      inLight: boolean;
      state: 'idle' | 'chase' | 'search' | 'stun';
      aggroRadius: number;
      searchTimer: number;
      stunTimer: number;
      lastSeenX: number;
      lastSeenY: number;
      hidden?: boolean;
      revealed?: boolean;
      aggro?: boolean;
      cloneOf?: number;
    }
    let enemies: Enemy[] = [];
    let nextEnemyId = 1;

    interface Fragment {
      id: number;
      x: number;
      y: number;
      active: boolean;
      title: string;
      text: string;
      clue: string;
    }
    let fragments: Fragment[] = [];

    interface MapPiece {
      x: number;
      y: number;
      active: boolean;
      duration: number;
    }
    let mapPieces: MapPiece[] = [];

    interface KeyItem {
      x: number;
      y: number;
      active: boolean;
    }
    let keys: KeyItem[] = [];

    interface Trap {
      x: number;
      y: number;
      type: 'spike' | 'pit' | 'poison';
      armed: boolean;
      visible: boolean;
      cooldown: number;
    }
    let traps: Trap[] = [];

    interface RuneButton {
      x: number;
      y: number;
      rune: string;
      pressed: boolean;
      order: number;
    }
    let runeButtons: RuneButton[] = [];
    let runeSequence: number[] = [];
    let runeTargetSequence: number[] = [];

    interface SecretDoor {
      x: number;
      y: number;
      open: boolean;
      revealed: boolean;
    }
    let secretDoors: SecretDoor[] = [];

    interface WhisperWall {
      x: number;
      y: number;
      text: string;
      shown: boolean;
      cooldown: number;
    }
    let whisperWalls: WhisperWall[] = [];

    interface GuideNPC {
      x: number;
      y: number;
      active: boolean;
      met: boolean;
      trust: number;
      realIntent: 'ally' | 'traitor';
      revealed: boolean;
      currentDialog: string;
    }
    let guide: GuideNPC | null = null;

    interface Sanctuary {
      id: number;
      x: number;
      y: number;
      zone: number;
      visited: boolean;
      keyTaken: boolean;
      radius: number;
      width: number;
      height: number;
      minX: number;
      minY: number;
      maxX: number;
      maxY: number;
    }
    let sanctuaries: Sanctuary[] = [];

    let maze: number[][] = [];
    let trailMarks: { r: number, c: number, opacity: number, rune: string }[] = [];
    let player = { x: 1, y: 1, sx: 1, sy: 1, dir: { x: 0, y: 1 } };
    let exit = { x: 0, y: 0 };
    let crystals: { x: number, y: number, active: boolean }[] = [], scrolls: { x: number, y: number, active: boolean, text: string }[] = [], camera = { x: 0, y: 0 };
    let particles: { x: number, y: number, vx: number, vy: number, life: number, color: string }[] = [];

    function spawnParticles(x: number, y: number, color: string, count = 10) {
      for (let i = 0; i < count; i++) {
        particles.push({
          x, y,
          vx: (Math.random() - 0.5) * 5,
          vy: (Math.random() - 0.5) * 5,
          life: 1.0,
          color
        });
      }
    }

    const texts = [
      "Güneşin terk ettiği bu topraklarda, yalnızca kendi içindeki ışığa güvenebilirsin.",
      "Gölge Yiyen, isimsiz bir açlıktır. O, yalnızca etini değil, hatıralarını da tüketir.",
      "Bu dehlizlerin mimarı, çıkışın anahtarını kelimelerin arasına gizledi.",
      "Ruhun zayıfladığında fenerinin yağı titrer. Mavi kristaller saf iradedir.",
      "Gözlerini kapattığında duyduğun fısıltılar, senden öncekilerin son vasiyetleridir.",
      "Derinlik arttıkça zamanın anlamı yiter. Hızlı ol."
    ];

    // --- SOUND ENGINE ---
    soundManager = {
      play: (type: string, volume = 0.5) => {
        if (!audioCtx) initAudio();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);

        const now = audioCtx.currentTime;
        if (type === 'step') {
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(150, now);
          osc.frequency.exponentialRampToValueAtTime(40, now + 0.1);
          gain.gain.setValueAtTime(volume, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
          osc.start(); osc.stop(now + 0.1);
        } else if (type === 'click') {
          osc.type = 'sine';
          osc.frequency.setValueAtTime(800, now);
          gain.gain.setValueAtTime(volume, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
          osc.start(); osc.stop(now + 0.05);
        } else if (type === 'collect') {
          osc.type = 'square';
          osc.frequency.setValueAtTime(440, now);
          osc.frequency.exponentialRampToValueAtTime(880, now + 0.2);
          gain.gain.setValueAtTime(volume, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
          osc.start(); osc.stop(now + 0.2);
        } else if (type === 'damage') {
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(120, now);
          osc.frequency.exponentialRampToValueAtTime(40, now + 0.3);
          gain.gain.setValueAtTime(volume, now);
          gain.gain.linearRampToValueAtTime(0, now + 0.3);
          osc.start(); osc.stop(now + 0.3);
        }
      },
      heartbeat: (intensity: number) => {
        if (!audioCtx) initAudio();
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(60, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + 0.1);
        gain.gain.setValueAtTime(intensity * 0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(); osc.stop(now + 0.1);

        setTimeout(() => {
          if (!audioCtx) return;
          const osc2 = audioCtx.createOscillator();
          const gain2 = audioCtx.createGain();
          osc2.connect(gain2); gain2.connect(audioCtx.destination);
          osc2.type = 'sine';
          osc2.frequency.setValueAtTime(50, audioCtx.currentTime);
          osc2.frequency.exponentialRampToValueAtTime(25, audioCtx.currentTime + 0.15);
          gain2.gain.setValueAtTime(intensity * 0.2, audioCtx.currentTime);
          gain2.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
          osc2.start(); osc2.stop(audioCtx.currentTime + 0.15);
        }, 150);
      },
      playStep: () => {
        if (!audioCtx) initAudio();
        const now = audioCtx.currentTime;
        // Düşük gürültü + kısa sine darbesi (ayak basışı)
        const bufferSize = audioCtx.sampleRate * 0.08;
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
        const noise = audioCtx.createBufferSource();
        noise.buffer = buffer;
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass'; filter.frequency.setValueAtTime(250, now);
        const gain = audioCtx.createGain();
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        noise.connect(filter); filter.connect(gain); gain.connect(audioCtx.destination);
        noise.start(); noise.stop(now + 0.08);
      },
      playGrowl: (volume = 0.25) => {
        if (!audioCtx) initAudio();
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        const filter = audioCtx.createBiquadFilter();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(80, now);
        osc.frequency.linearRampToValueAtTime(45, now + 0.35);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(300, now);
        filter.frequency.linearRampToValueAtTime(120, now + 0.35);
        gain.gain.setValueAtTime(volume, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
        osc.connect(filter); filter.connect(gain); gain.connect(audioCtx.destination);
        osc.start(); osc.stop(now + 0.35);
      },
      playSanctuaryAlert: (volume = 0.4) => {
        if (!audioCtx) initAudio();
        const now = audioCtx.currentTime;
        // Derin gong / uyarı
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.exponentialRampToValueAtTime(35, now + 0.8);
        gain.gain.setValueAtTime(volume, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(); osc.stop(now + 0.8);
      },
      playSanctuaryBell: (volume = 0.5) => {
        if (!audioCtx) initAudio();
        const now = audioCtx.currentTime;
        [440, 554, 659].forEach((freq, i) => {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + i * 0.08);
          gain.gain.setValueAtTime(volume * 0.6, now + i * 0.08);
          gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.08 + 0.6);
          osc.connect(gain); gain.connect(audioCtx.destination);
          osc.start(now + i * 0.08);
          osc.stop(now + i * 0.08 + 0.6);
        });
      },
      playKey: (volume = 0.4) => {
        if (!audioCtx) initAudio();
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, now);
        osc.frequency.exponentialRampToValueAtTime(1800, now + 0.15);
        gain.gain.setValueAtTime(volume, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(); osc.stop(now + 0.15);
      },
      playBurst: (volume = 0.4) => {
        if (!audioCtx) initAudio();
        const now = audioCtx.currentTime;
        const bufferSize = audioCtx.sampleRate * 0.3;
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.25));
        const noise = audioCtx.createBufferSource();
        noise.buffer = buffer;
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1200, now);
        filter.frequency.exponentialRampToValueAtTime(200, now + 0.3);
        const gain = audioCtx.createGain();
        gain.gain.setValueAtTime(volume, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        noise.connect(filter); filter.connect(gain); gain.connect(audioCtx.destination);
        noise.start(); noise.stop(now + 0.3);
      },
      playDoorCreak: (volume = 0.35) => {
        if (!audioCtx) initAudio();
        const now = audioCtx.currentTime;
        const bufferSize = audioCtx.sampleRate * 0.5;
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1);
        const noise = audioCtx.createBufferSource();
        noise.buffer = buffer;
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(600, now);
        filter.frequency.linearRampToValueAtTime(100, now + 0.5);
        const gain = audioCtx.createGain();
        gain.gain.setValueAtTime(volume, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.5);
        noise.connect(filter); filter.connect(gain); gain.connect(audioCtx.destination);
        noise.start(); noise.stop(now + 0.5);
      },
      playWhisper: (volume = 0.2) => {
        if (!audioCtx) initAudio();
        const now = audioCtx.currentTime;
        const bufferSize = audioCtx.sampleRate * 0.6;
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1);
        const noise = audioCtx.createBufferSource();
        noise.buffer = buffer;
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1800, now);
        filter.Q.setValueAtTime(2, now);
        const gain = audioCtx.createGain();
        gain.gain.setValueAtTime(volume, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.6);
        noise.connect(filter); filter.connect(gain); gain.connect(audioCtx.destination);
        noise.start(); noise.stop(now + 0.6);
      },
      ambient: null as any,
      startAmbient: () => {
        if (!audioCtx) initAudio();
        if (soundManager.ambient) return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        const filter = audioCtx.createBiquadFilter();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(40, audioCtx.currentTime);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(200, audioCtx.currentTime);

        gain.gain.setValueAtTime(0.04, audioCtx.currentTime);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start();

        setInterval(() => {
          if (audioCtx && audioCtx.state === 'running') {
            filter.frequency.exponentialRampToValueAtTime(100 + Math.random() * 400, audioCtx.currentTime + 2);
          }
        }, 2000);

        soundManager.ambient = { osc, gain };
      }
    };

    // --- SAVE / LOAD SYSTEM ---
    function saveGame() {
      const data = {
        progress: progress,
        score: state.score
      };
      localStorage.setItem('golge_labirenti_save', JSON.stringify(data));
      console.log("Oyun kaydedildi.");
    }

    function loadGame() {
      const saved = localStorage.getItem('golge_labirenti_save');
      if (saved) {
        const data = JSON.parse(saved);
        Object.assign(progress, data.progress);
        state.score = data.score || 0;
        console.log("Oyun yüklendi.");
        updateMapHUD();
      }
    }


    // showScene consolidated above to prevent recursion

    (window as any).prepareGateTransition = function (lvl: number) {
      state.level = lvl;
      const arch = document.getElementById('gate-arch');
      if (arch) arch.classList.remove('open');
      const whiteout = document.getElementById('transition-whiteout');
      if (whiteout) whiteout.classList.remove('active');
      const infoPanel = document.getElementById('region-info-panel');
      if (infoPanel) infoPanel.classList.remove('active');
      showScene('door-scene');
    };

    const SVGS = {
      flame: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>`,
      skull: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m12.5 17-.5-1-.5 1h1z"/><path d="M15 22a1 1 0 0 0 1-1v-1a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20v1a1 1 0 0 0 1 1z"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="12" r="1"/></svg>`,
      swords: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 17.5 3 6V3h3l11.5 11.5"/><path d="M13 19l6-6"/><path d="M16 16l4 4"/><path d="M19 21l2-2"/><path d="M14.5 14.5l-9-9"/></svg>`,
      leaf: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>`,
      ghost: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 10h.01"/><path d="M15 10h.01"/><path d="M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z"/></svg>`,
      crown: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"/></svg>`
    };

    const regionData = [
      { id: 1, name: "Kayıp Giriş", desc: "Güneşin son ışıklarının veda ettiği, kadim labirentin ağzı. Burası sadece bir başlangıç.", difficulty: "Düşük", scrolls: 2, reward: 250, icon: SVGS.flame, top: '82%', left: '50%', color: '#ffcc00', type: 'normal', reqLevel: 1 },
      { id: 2, name: "Katakomplar", desc: "Sessizliğin hüküm sürdüğü, unutulmuş kralların mezarları. Gölgeler burada daha aç.", difficulty: "Orta", scrolls: 4, reward: 500, icon: SVGS.skull, top: '66%', left: '30%', color: '#00f2ff', type: 'normal', reqLevel: 1 },
      { id: 3, name: "Unutulmuş Bahçe", desc: "Zehirli bitkilerin ve eski tanrıların fısıltılarının yankılandığı yer.", difficulty: "Yüksek", scrolls: 6, reward: 800, icon: SVGS.leaf, top: '58%', left: '70%', color: '#4ade80', type: 'elite', reqLevel: 2 },
      { id: 4, name: "Fısıltı Mağarası", desc: "Seslerin yankı yapmadığı, sadece zihnindeki korkuların konuştuğu bir mağara.", difficulty: "Çok Yüksek", scrolls: 8, reward: 1200, icon: SVGS.ghost, top: '42%', left: '45%', color: '#a855f7', type: 'elite', reqLevel: 3 },
      { id: 5, name: "Derinlikler", desc: "Zamanın ve mekanın büküldüğü, karanlığın kalbi. Geri dönüşü olmayan yol.", difficulty: "Yüksek", scrolls: 6, reward: 1500, icon: SVGS.swords, top: '28%', left: '25%', color: '#f43f5e', type: 'elite', reqLevel: 4 },
      { id: 6, name: "Karanlık Taht", desc: "Gölge Yiyen'in taht odası. Nihai son burada bekliyor.", difficulty: "Efsanevi", scrolls: 12, reward: 3000, icon: SVGS.crown, top: '12%', left: '55%', color: '#ff4d00', type: 'boss', reqLevel: 5 }
    ];

    (window as any).selectRegion = function (id: number) {
      const data = regionData.find(r => r.id === id);
      if (!data) return;

      const infoPanel = document.getElementById('region-info-panel');
      if (!infoPanel) return;

      const title = document.getElementById('reg-info-title');
      const desc = document.getElementById('reg-info-desc');
      const diff = document.getElementById('reg-info-diff');
      const scrolls = document.getElementById('reg-info-scrolls');
      const reward = document.getElementById('reg-info-reward');
      const reqLevel = document.getElementById('reg-info-req-level');
      const typeBadge = document.getElementById('reg-info-type');
      const panel = document.getElementById('region-info-panel');

      if (title) title.innerText = data.name;
      if (desc) desc.innerText = data.desc;
      if (diff) {
        diff.innerText = data.difficulty;
        diff.style.color = data.color;
      }
      const diffBar = document.getElementById('reg-info-diff-bar');
      if (diffBar) {
        const diffMap: Record<string, number> = { 'Düşük': 25, 'Orta': 50, 'Yüksek': 75, 'Çok Yüksek': 90, 'Efsanevi': 100 };
        diffBar.style.width = (diffMap[data.difficulty] || 30) + '%';
        diffBar.style.background = data.color;
      }
      if (scrolls) scrolls.innerText = data.scrolls.toString();
      if (reward) reward.innerText = data.reward.toString();
      if (reqLevel) reqLevel.innerText = `Seviye ${data.reqLevel}`;
      if (typeBadge) {
        typeBadge.innerText = data.type === 'boss' ? 'BOSS' : data.type === 'elite' ? 'ELİT' : 'BÖLGE';
        typeBadge.className = `region-type-badge ${data.type}`;
      }
      if (panel) panel.style.setProperty('--region-accent', data.color);

      infoPanel.classList.add('active');

      const enterBtn = document.getElementById('btn-enter-region');
      if (enterBtn) {
        enterBtn.onclick = () => (window as any).prepareGateTransition(id);
      }

      // Seçili düğümü vurgula
      document.querySelectorAll('.map-node').forEach(n => n.classList.remove('selected'));
      const selectedNode = document.querySelector(`.map-node[data-region-id="${id}"]`);
      if (selectedNode) selectedNode.classList.add('selected');
    };

    (window as any).unlockGate = function () {
      const arch = document.getElementById('gate-arch');
      if (!arch || arch.classList.contains('open')) return;

      arch.classList.add('open');

      setTimeout(() => {
        const whiteout = document.getElementById('transition-whiteout');
        if (whiteout) whiteout.classList.add('active');
      }, 2500);

      setTimeout(() => {
        startLevel(state.level);
        const whiteout = document.getElementById('transition-whiteout');
        if (whiteout) whiteout.classList.remove('active');
        arch.classList.remove('open');
      }, 4000);
    };

    function createMapParticles() {
      const container = document.getElementById('map-screen');
      if (!container) return;
      for (let i = 0; i < 20; i++) {
        const p = document.createElement('div');
        p.className = 'map-particle';
        const size = Math.random() * 3 + 1;
        p.style.width = size + 'px';
        p.style.height = size + 'px';
        p.style.left = Math.random() * 100 + 'vw';
        p.style.top = Math.random() * 100 + 'vh';
        p.style.animation = `floatRune ${Math.random() * 10 + 10}s infinite linear`;
        container.appendChild(p);
      }
    }

    function createSplashRunes() {
      const splash = document.getElementById('splash-screen');
      if (!splash) return;
      for (let i = 0; i < 15; i++) {
        const rune = document.createElement('div');
        rune.className = 'rune-float';
        rune.innerText = runes[Math.floor(Math.random() * runes.length)];
        rune.style.left = Math.random() * 100 + 'vw';
        rune.style.animationDelay = Math.random() * 8 + 's';
        rune.style.fontSize = (Math.random() * 2 + 1) + 'rem';
        splash.appendChild(rune);
      }
    }

    (window as any).exitToMap = function () {
      state.active = false;
      const arch = document.getElementById('gate-arch');
      if (arch) arch.classList.remove('open');
      showScene('map-screen');
      updateMapHUD();
    };

    function updateMapHUD() {
      const mapScore = document.getElementById('map-score-global');
      const mapLevel = document.getElementById('map-level-global');
      if (mapScore) mapScore.innerText = state.score.toString();
      if (mapLevel) mapLevel.innerText = progress.charLevel.toString();
      (window as any).updateMapNodes();
    }

    (window as any).updateMapNodes = function () {
      const content = document.querySelector('.map-scroll-content');
      if (!content) return;

      // SVG yollar: animasyonlu, parıltılı ve waypoint taşlarıyla
      let svgHtml = `
      <svg id="magic-paths" viewBox="0 0 100 100" preserveAspectRatio="none" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 5; overflow: visible;">
        <defs>
          <linearGradient id="path-gold" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="rgba(255,204,0,0.05)" />
            <stop offset="50%" stop-color="rgba(255,204,0,0.9)" />
            <stop offset="100%" stop-color="rgba(255,204,0,0.05)" />
          </linearGradient>
          <filter id="path-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="0.6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      `;

      regionData.forEach((region, i) => {
        if (i > 0) {
          const prev = regionData[i - 1];
          const isUnlocked = region.id <= progress.maxUnlockedLevel;
          const x1 = parseFloat(prev.left);
          const y1 = parseFloat(prev.top);
          const x2 = parseFloat(region.left);
          const y2 = parseFloat(region.top);

          const cx1 = x1 + (x2 - x1) * 0.3;
          const cy1 = y1 + (y2 - y1) * 0.7;
          const cx2 = x1 + (x2 - x1) * 0.7;
          const cy2 = y1 + (y2 - y1) * 0.3;

          const stroke = isUnlocked ? 'url(#path-gold)' : 'rgba(80, 50, 30, 0.35)';
          const width = isUnlocked ? '0.85' : '0.4';
          const extraClass = isUnlocked ? 'active-path' : 'locked-path';
          const pathId = `path-${prev.id}-${region.id}`;

          svgHtml += `<path id="${pathId}" d="M${x1} ${y1} C${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}" stroke="${stroke}" stroke-width="${width}" fill="none" class="${extraClass}" filter="url(#path-glow)" stroke-linecap="round"></path>`;

          if (isUnlocked) {
            const midX = 0.125 * x1 + 0.375 * cx1 + 0.375 * cx2 + 0.125 * x2;
            const midY = 0.125 * y1 + 0.375 * cy1 + 0.375 * cy2 + 0.125 * y2;
            svgHtml += `<circle cx="${midX}" cy="${midY}" r="0.8" class="waypoint-stone" fill="rgba(255,204,0,0.7)"></circle>`;
          }
        }
      });
      svgHtml += `</svg>`;

      content.innerHTML = svgHtml + '<div id="nodes-container" style="position: absolute; inset: 0; z-index: 10; width: 100%; height: 100%;"></div>';
      const nodesContainer = content.querySelector('#nodes-container');
      if (!nodesContainer) return;

      // Arka planda bölge isimleri
      regionData.forEach(region => {
        const isUnlocked = region.id <= progress.maxUnlockedLevel;
        const labelBack = document.createElement('div');
        labelBack.className = 'map-region-backlabel';
        labelBack.style.top = `calc(${region.top} - 60px)`;
        labelBack.style.left = region.left;
        labelBack.innerText = region.name.toUpperCase();
        labelBack.style.color = isUnlocked ? region.color : '#444';
        labelBack.style.opacity = isUnlocked ? '0.18' : '0.08';
        nodesContainer.appendChild(labelBack);
      });

      regionData.forEach(region => {
        const node = document.createElement('div');
        const isUnlocked = region.id <= progress.maxUnlockedLevel;
        const sizeClass = region.type === 'boss' ? 'boss' : region.type === 'elite' ? 'elite' : 'normal';
        node.className = `map-node ${isUnlocked ? 'active' : 'locked'} ${sizeClass}`;
        node.setAttribute('data-region-id', region.id.toString());
        node.style.top = region.top;
        node.style.left = region.left;
        node.style.setProperty('--node-color', region.color);
        if (!isUnlocked) node.title = `Kilitli - Seviye ${region.reqLevel} gerekli`;

        if (isUnlocked) {
          node.onclick = () => (window as any).selectRegion(region.id);
        }

        const lockHtml = isUnlocked ? '' : `
          <div class="node-lock">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
            <span>Lv.${region.reqLevel}</span>
          </div>
        `;

        const typeMark = region.type === 'boss' ? '♛' : region.type === 'elite' ? '✦' : '◆';
        const completed = region.id < progress.maxUnlockedLevel;
        const starHtml = completed ? `<div class="node-star">★</div>` : '';

        node.innerHTML = `
          <div class="node-outer-glow"></div>
          <div class="node-badge" style="--node-accent:${region.color}">
            <div class="node-icon" style="color:${isUnlocked ? region.color : '#555'}">${region.icon}</div>
            <div class="node-type-mark" style="color:${isUnlocked ? region.color : '#333'}">${typeMark}</div>
          </div>
          <div class="node-ring"></div>
          ${starHtml}
          ${lockHtml}
          <div class="node-label"><i>${region.name}</i></div>
          <div class="node-meta">
            <span class="node-difficulty" style="color:${isUnlocked ? region.color : '#555'}">${region.difficulty}</span>
            <span class="node-reward">${region.reward} Ruh</span>
          </div>
        `;
        nodesContainer.appendChild(node);
      });
    };

    function init() {
      const lvlVal = document.getElementById('global-header-subtitle');
      const scoreVal = document.getElementById('map-score-global');
      const charLvlVal = document.getElementById('map-level-global');
      if (lvlVal) lvlVal.innerText = `${state.level}. Derinlik`;
      if (scoreVal) scoreVal.innerText = state.score.toString();
      if (charLvlVal) charLvlVal.innerText = progress.charLevel.toString();
      state.health = progress.maxHealth;
      updateHealthUI();
      state.scrollsRequired = 0; // Tapınak kurgusunda yazıt gereksinimi kaldırıldı
      state.scrollsCollected = 0;
      trailMarks = [];
      state.zone = 0;
      state.maxZone = 0;
      state.sanctuaryCount = 7;
      state.keysRequired = state.sanctuaryCount;
      state.keysCollected = 0;
      state.exitLocked = true;
      state.fragmentsCollected = 0;
      state.mapOverlayTimer = 0;
      state.revealedDoors = 0;
      state.trapDamageCooldown = 0;
      updateScrollHUD();
      generateMaze();
      spawnSanctuaries();
      // Çıkışı en uzak tapınağın ilerisine koy
      const lastSanctuary = sanctuaries[sanctuaries.length - 1];
      if (lastSanctuary) {
        exit = { x: Math.min(state.gridSize - 2, lastSanctuary.x + 2), y: Math.min(state.gridSize - 2, lastSanctuary.y + 2) };
        while (maze[exit.y]?.[exit.x] === 1) {
          exit.x--; if (exit.x < 1) { exit.x = state.gridSize - 2; exit.y--; }
          if (exit.y < 1) { exit = { x: state.gridSize - 2, y: state.gridSize - 2 }; break; }
        }
      } else {
        exit = { x: state.gridSize - 2, y: state.gridSize - 2 };
      }
      player = { x: 1, y: 1, sx: 1, sy: 1, dir: { x: 0, y: 1 } };
      enemies = [];
      nextEnemyId = 1;
      fragments = [];
      mapPieces = [];
      keys = [];
      traps = [];
      runeButtons = [];
      runeSequence = [];
      runeTargetSequence = [];
      secretDoors = [];
      whisperWalls = [];
      guide = null;

      spawnEnemies();
      spawnObjects();
      spawnFragments();
      spawnMapPieces();
      spawnTraps();
      spawnRunePuzzle();
      spawnSecretDoors();
      spawnWhisperWalls();
      spawnGuideNPC();
      resize();
      state.active = true;
    }

    function createEnemy(x: number, y: number, type: Enemy['type']): Enemy {
      const stats: Record<Enemy['type'], { speed: number; aggro: number }> = {
        stalker: { speed: Math.max(4, 16 - state.level), aggro: 5 },
        wraith: { speed: 6, aggro: 7 },
        sharpshooter: { speed: 8, aggro: 6 },
        devourer: { speed: 14, aggro: 4 },
        wallmaw: { speed: 12, aggro: 5 },
        'ivy mimic': { speed: 10, aggro: 5 },
        illusion: { speed: 7, aggro: 6 }
      };
      const s = stats[type];
      return {
        id: nextEnemyId++,
        type, x, y,
        sx: x, sy: y,
        speed: s.speed, wait: 0,
        inLight: false,
        state: 'idle',
        aggroRadius: s.aggro,
        searchTimer: 0,
        stunTimer: 0,
        lastSeenX: x, lastSeenY: y
      };
    }

    function spawnEnemies() {
      const enemyCount = Math.min(1 + Math.floor(state.level / 2), 5);
      const types: Enemy['type'][] = ['stalker'];
      if (state.level >= 2) types.push('wallmaw');
      if (state.level >= 3) types.push('ivy mimic');
      if (state.level >= 4) types.push('illusion');
      if (state.level >= 5) types.push('wraith');
      if (state.level >= 6) types.push('sharpshooter');
      if (state.level >= 8) types.push('devourer');

      for (let i = 0; i < enemyCount; i++) {
        const type = types[Math.floor(Math.random() * types.length)];
        const isWallHider = type === 'wallmaw';
        let rx, ry, attempts = 0;
        do {
          rx = Math.floor(Math.random() * state.gridSize);
          ry = Math.floor(Math.random() * state.gridSize);
          attempts++;
        } while (
          ((isWallHider ? maze[ry]?.[rx] !== 1 : maze[ry]?.[rx] !== 0) ||
            (Math.abs(rx - player.x) < 5 && Math.abs(ry - player.y) < 5) ||
            (rx === exit.x && ry === exit.y) ||
            enemies.some(e => e.x === rx && e.y === ry)) &&
          attempts < 100
        );
        if (attempts >= 100) continue;
        const enemy = createEnemy(rx, ry, type);
        if (isWallHider) enemy.hidden = true;
        enemies.push(enemy);
      }
    }

    function startLevel(lvl: number) {
      state.level = lvl;
      showScene('game-scene');
      init();
    }

    (window as any).toggleInventory = function () {
      state.inventoryOpen = !state.inventoryOpen;
      if (!state.inventoryOpen) state.active = true;
      else state.active = false;

      const invPanel = document.getElementById('inventory-panel');
      if (invPanel) invPanel.style.display = state.inventoryOpen ? 'flex' : 'none';
      if (state.inventoryOpen) {
        (window as any).switchTab('shop');
        updateInventoryUI();
      }
    };

    (window as any).switchTab = function (tab: string) {
      const shopContent = document.getElementById('shop-content');
      const invContent = document.getElementById('inv-content');
      const shopBtn = document.getElementById('tab-shop-btn');
      const invBtn = document.getElementById('tab-inv-btn');
      if (shopContent) shopContent.classList.remove('active');
      if (invContent) invContent.classList.remove('active');
      if (shopBtn) shopBtn.classList.remove('active');
      if (invBtn) invBtn.classList.remove('active');
      if (tab === 'shop') {
        if (shopContent) shopContent.classList.add('active');
        if (shopBtn) shopBtn.classList.add('active');
      } else {
        if (invContent) invContent.classList.add('active');
        if (invBtn) invBtn.classList.add('active');
        renderScrollList();
      }
    };

    function renderScrollList() {
      const list = document.getElementById('collected-scrolls-list');
      if (!list) return;
      if (progress.collectedScrolls.length === 0) {
        list.innerHTML = '<div style="color: #444; text-align: center; margin-top: 20px; font-style: italic;">Henüz hiç yazıt bulunamadı...</div>';
        return;
      }
      list.innerHTML = progress.collectedScrolls.map(txt => `< div class="scroll-list-item" > "${txt}"</div > `).join('');
    }

    function updateInventoryUI() {
      const totalScore = document.getElementById('inv-total-score');
      const buyHp = document.getElementById('buy-hp') as HTMLButtonElement;
      const buyLight = document.getElementById('buy-light') as HTMLButtonElement;
      const buyRegen = document.getElementById('buy-regen') as HTMLButtonElement;
      const statHp = document.getElementById('stat-hp');
      const statLight = document.getElementById('stat-light');
      const statRegen = document.getElementById('stat-regen');

      if (totalScore) totalScore.innerText = state.score.toString();
      if (buyHp) buyHp.disabled = state.score < 500;
      if (buyLight) buyLight.disabled = state.score < 800;
      if (buyRegen) buyRegen.disabled = state.score < 1000;
      if (statHp) statHp.innerText = progress.maxHealth.toString();
      if (statLight) statLight.innerText = progress.lightMod.toFixed(1) + "x";
      if (statRegen) statRegen.innerText = progress.regenMod.toFixed(1) + "x";
    }

    (window as any).buyUpgrade = function (type: string) {
      let cost = (type === 'hp' ? 500 : (type === 'light' ? 800 : 1000));
      if (state.score >= cost) {
        state.score -= cost;
        progress.totalUpgrades++;
        if (type === 'hp') progress.maxHealth += 25;
        if (type === 'light') progress.lightMod += 0.3;
        if (type === 'regen') progress.regenMod += 0.4;
        progress.charLevel = 1 + Math.floor(progress.totalUpgrades / 2);
        state.health = progress.maxHealth;
        saveGame();
        updateInventoryUI(); updateHealthUI();
        const scoreVal = document.getElementById('map-score-global');
        const charLvlVal = document.getElementById('map-level-global');
        if (scoreVal) scoreVal.innerText = state.score.toString();
        if (charLvlVal) charLvlVal.innerText = progress.charLevel.toString();
      }
    };


    function generateMaze() {
      state.gridSize = 23 + state.level * 2; // Daha büyük labirentler
      maze = Array(state.gridSize).fill(null).map(() => Array(state.gridSize).fill(1));
      const stack = [{ x: 1, y: 1 }]; maze[1][1] = 0;
      while (stack.length > 0) {
        const c = stack[stack.length - 1];
        const neighbors = [{ x: 0, y: 2 }, { x: 0, y: -2 }, { x: 2, y: 0 }, { x: -2, y: 0 }].sort(() => Math.random() - 0.5);
        let found = false;
        for (let n of neighbors) {
          const nx = c.x + n.x, ny = c.y + n.y;
          if (nx > 0 && nx < state.gridSize - 1 && ny > 0 && ny < state.gridSize - 1 && maze[ny][nx] === 1) {
            maze[ny][nx] = 0; maze[c.y + (ny - c.y) / 2][c.x + (nx - c.x) / 2] = 0;
            stack.push({ x: nx, y: ny }); found = true; break;
          }
        }
        if (!found) stack.pop();
      }

      // Döngüler ekle: rastgele bazı duvarları kaldır (saklanma rotaları için)
      const loops = Math.floor(state.gridSize * state.gridSize * 0.02);
      for (let i = 0; i < loops; i++) {
        const rx = Math.floor(Math.random() * (state.gridSize - 2)) + 1;
        const ry = Math.floor(Math.random() * (state.gridSize - 2)) + 1;
        if (maze[ry][rx] === 1) {
          const openNeighbors = [[0, 1], [0, -1], [1, 0], [-1, 0]].filter(([dx, dy]) => maze[ry + dy]?.[rx + dx] === 0);
          if (openNeighbors.length >= 2) maze[ry][rx] = 0;
        }
      }

      // Odacıklar ekle: bazı 3x3 alanları boşalt
      const rooms = 2 + Math.floor(state.level / 2);
      for (let i = 0; i < rooms; i++) {
        const cx = Math.floor(Math.random() * (state.gridSize - 5)) + 2;
        const cy = Math.floor(Math.random() * (state.gridSize - 5)) + 2;
        for (let r = cy - 1; r <= cy + 1; r++) {
          for (let c = cx - 1; c <= cx + 1; c++) {
            if (r > 0 && r < state.gridSize - 1 && c > 0 && c < state.gridSize - 1) maze[r][c] = 0;
          }
        }
      }
    }

    function spawnObjects() {
      crystals = []; scrolls = [];
      for (let i = 0; i < 15; i++) {
        let rx, ry; do { rx = Math.floor(Math.random() * state.gridSize); ry = Math.floor(Math.random() * state.gridSize); } while (maze[ry][rx] !== 0);
        crystals.push({ x: rx, y: ry, active: true });
      }
      for (let i = 0; i < state.scrollsRequired; i++) {
        let rx, ry; do { rx = Math.floor(Math.random() * state.gridSize); ry = Math.floor(Math.random() * state.gridSize); } while (maze[ry][rx] !== 0 || (rx === 1 && ry === 1) || (rx === exit.x && ry === exit.y));
        scrolls.push({ x: rx, y: ry, active: true, text: texts[Math.floor(Math.random() * texts.length)] });
      }
    }

    function getEmptyCell(minDistFromPlayer = 3, excludeExit = false) {
      let rx, ry, attempts = 0;
      do {
        rx = Math.floor(Math.random() * state.gridSize);
        ry = Math.floor(Math.random() * state.gridSize);
        attempts++;
      } while (
        (maze[ry]?.[rx] !== 0 ||
          (Math.abs(rx - player.x) < minDistFromPlayer && Math.abs(ry - player.y) < minDistFromPlayer) ||
          (excludeExit && rx === exit.x && ry === exit.y) ||
          crystals.some(c => c.active && c.x === rx && c.y === ry) ||
          scrolls.some(s => s.active && s.x === rx && s.y === ry) ||
          fragments.some(f => f.active && f.x === rx && f.y === ry) ||
          mapPieces.some(m => m.active && m.x === rx && m.y === ry) ||
          keys.some(k => k.active && k.x === rx && k.y === ry) ||
          traps.some(t => t.x === rx && t.y === ry) ||
          runeButtons.some(b => b.x === rx && b.y === ry) ||
          secretDoors.some(d => d.x === rx && d.y === ry) ||
          whisperWalls.some(w => w.x === rx && w.y === ry) ||
          sanctuaries.some(s => Math.hypot(s.x - rx, s.y - ry) < 2)) &&
        attempts < 200
      );
      return attempts >= 200 ? null : { x: rx, y: ry };
    }

    function spawnFragments() {
      const fragmentTexts = [
        { title: "Gölge Yiyen'in Doğuşu", text: "Işık taşıyan ilk yolcu, karanlığı kendi bedeninde taşımıştı. Gölge Yiyen onun ruhunun parçasıdır.", clue: "Işık onu zayıflatır ama asla öldürmez." },
        { title: "Unutulmuş Çıkış", text: "Labirentin kalbi, kendi gölgesini arar. Çıkışa giden yol, bazen geriye gitmekten geçer.", clue: "Bazı duvarlar geçilebilir; fenerin ışığıyla sınan." },
        { title: "Rehberin Yemini", text: "Kadim rehberler iki yüzlüdür: biri ışığı sever, öteki gölgede büyür. Verdiği sözü değil, verdiği ipucu dinle.", clue: "Gerçek dost, seni asla tuzağa sürükleyen yola göndermez." }
      ];
      const count = Math.min(1 + Math.floor(state.level / 3), 2);
      for (let i = 0; i < count; i++) {
        const cell = getEmptyCell(5, true);
        if (!cell) continue;
        const data = fragmentTexts[(state.level - 1 + i) % fragmentTexts.length];
        fragments.push({
          id: i + 1,
          x: cell.x, y: cell.y, active: true,
          title: data.title,
          text: data.text,
          clue: data.clue
        });
      }
    }

    function spawnMapPieces() {
      const count = Math.min(1 + Math.floor(state.level / 4), 2);
      for (let i = 0; i < count; i++) {
        const cell = getEmptyCell(4, true);
        if (!cell) continue;
        mapPieces.push({ x: cell.x, y: cell.y, active: true, duration: 400 });
      }
    }

    function spawnKeysAndLockedExit() {
      if (state.level < 2) return;
      state.keysRequired = Math.min(1 + Math.floor(state.level / 3), 2);
      state.keysCollected = 0;
      state.exitLocked = state.keysRequired > 0;
      for (let i = 0; i < state.keysRequired; i++) {
        const cell = getEmptyCell(6, true);
        if (cell) keys.push({ x: cell.x, y: cell.y, active: true });
      }
    }

    function spawnTraps() {
      const trapCount = Math.min(2 + Math.floor(state.level / 2), 6);
      const types: Trap['type'][] = ['spike', 'pit', 'poison'];
      for (let i = 0; i < trapCount; i++) {
        const cell = getEmptyCell(4, true);
        if (!cell) continue;
        traps.push({
          x: cell.x, y: cell.y,
          type: types[Math.floor(Math.random() * types.length)],
          armed: true, visible: false, cooldown: 0
        });
      }
    }

    function spawnRunePuzzle() {
      if (state.level < 3) return;
      const count = 3;
      const available = [...runes].sort(() => Math.random() - 0.5).slice(0, count);
      const seq: number[] = [];
      for (let i = 0; i < count; i++) {
        const cell = getEmptyCell(5, true);
        if (!cell) continue;
        runeButtons.push({ x: cell.x, y: cell.y, rune: available[i], pressed: false, order: i });
        seq.push(i);
      }
      // Rastgele karıştırılmış hedef sıra
      runeTargetSequence = [...seq].sort(() => Math.random() - 0.5);
    }

    function spawnSecretDoors() {
      const doorCount = Math.min(1 + Math.floor(state.level / 3), 3);
      let placed = 0;
      for (let r = 1; r < state.gridSize - 1 && placed < doorCount; r++) {
        for (let c = 1; c < state.gridSize - 1 && placed < doorCount; c++) {
          if (maze[r][c] === 1 &&
            ((maze[r - 1]?.[c] === 0 && maze[r + 1]?.[c] === 0) ||
              (maze[r][c - 1] === 0 && maze[r][c + 1] === 0))) {
            // Yalnızca bazı uygun duvarlara gizli geçit
            if (Math.random() < 0.25) {
              secretDoors.push({ x: c, y: r, open: false, revealed: false });
              placed++;
            }
          }
        }
      }
    }

    function spawnWhisperWalls() {
      const whispers = [
        "Arkandaki duvar nefes alıyor...",
        "Çıkış, ışığın en zayıf olduğu yerdedir.",
        "O sana yalan söylüyor.",
        "Sarmaşıklar canlıdır, dokunma.",
        "Rune'leri doğru sırada oku, kapı açılır.",
        "Gölge Yiyen seni bekliyor."
      ];
      const count = Math.min(2 + Math.floor(state.level / 2), 5);
      for (let i = 0; i < count; i++) {
        // Duvar hücreleri arasından seç
        let rx, ry, attempts = 0;
        do {
          rx = Math.floor(Math.random() * state.gridSize);
          ry = Math.floor(Math.random() * state.gridSize);
          attempts++;
        } while (
          (maze[ry]?.[rx] !== 1 ||
            (rx === exit.x && ry === exit.y) ||
            whisperWalls.some(w => w.x === rx && w.y === ry)) &&
          attempts < 200
        );
        if (attempts >= 200) continue;
        whisperWalls.push({
          x: rx, y: ry,
          text: whispers[(state.level + i) % whispers.length],
          shown: false, cooldown: 0
        });
      }
    }

    function spawnGuideNPC() {
      if (state.level < 3 || Math.random() > 0.6) return;
      const cell = getEmptyCell(7, true);
      if (!cell) return;
      const isAlly = Math.random() < 0.5;
      guide = {
        x: cell.x, y: cell.y,
        active: true, met: false,
        trust: 30,
        realIntent: isAlly ? 'ally' : 'traitor',
        revealed: false,
        currentDialog: isAlly
          ? "Işık taşıyıcı... çıkışa gitmen gerekiyor. Bu yol seni oraya götürür."
          : "Gölge Diyarı sana yardım etmek istiyor. Beni takip et, çıkış yakın."
      };
    }

    function spawnSanctuaries() {
      sanctuaries = [];
      const count = state.sanctuaryCount;
      const roomSizes = [4, 5, 4, 5, 4, 5, 4];

      // Tüm boş hücreleri aday olarak topla
      const candidates: { x: number, y: number }[] = [];
      for (let r = 2; r < state.gridSize - 2; r++) {
        for (let c = 2; c < state.gridSize - 2; c++) {
          if (maze[r][c] === 0) candidates.push({ x: c, y: r });
        }
      }
      candidates.sort(() => Math.random() - 0.5);

      for (let i = 0; i < count; i++) {
        const w = roomSizes[i % roomSizes.length];
        const h = w;
        const halfW = Math.floor(w / 2);
        const halfH = Math.floor(h / 2);
        let rx = 0, ry = 0;
        let placed = false;

        // Rastgele boş hücreden uygun aday bul
        for (const cand of candidates) {
          rx = cand.x;
          ry = cand.y;
          if (Math.abs(rx - player.x) < 6 && Math.abs(ry - player.y) < 6) continue;
          if (rx >= exit.x - 3 && rx <= exit.x + 3 && ry >= exit.y - 3 && ry <= exit.y + 3) continue;
          if (sanctuaries.some(s => Math.hypot(s.x - rx, s.y - ry) < 8)) continue;
          placed = true;
          break;
        }

        if (!placed) {
          // Son çare: merkeze yakın bir boş hücre
          const fallback = candidates.find(c => Math.hypot(c.x - state.gridSize / 2, c.y - state.gridSize / 2) < state.gridSize / 3) || candidates[0] || { x: 5, y: 5 };
          rx = fallback.x; ry = fallback.y;
        }

        // Oda sınırlarını labirent sınırlarına göre ayarla ve duvarları kaldır
        const minX = Math.max(1, rx - halfW);
        const minY = Math.max(1, ry - halfH);
        const maxX = Math.min(state.gridSize - 2, rx + halfW);
        const maxY = Math.min(state.gridSize - 2, ry + halfH);
        for (let r = minY; r <= maxY; r++) {
          for (let c = minX; c <= maxX; c++) {
            maze[r][c] = 0;
          }
        }

        // Merkezi oda içinde yenile
        rx = Math.floor((minX + maxX) / 2);
        ry = Math.floor((minY + maxY) / 2);

        // Rastgele bir giriş aç
        const midX = Math.floor((minX + maxX) / 2);
        const midY = Math.floor((minY + maxY) / 2);
        const sides = [
          { x: midX, y: minY - 1 },
          { x: midX, y: maxY + 1 },
          { x: minX - 1, y: midY },
          { x: maxX + 1, y: midY }
        ];
        const entrance = sides[Math.floor(Math.random() * sides.length)];
        if (entrance.x > 0 && entrance.x < state.gridSize - 1 && entrance.y > 0 && entrance.y < state.gridSize - 1) {
          maze[entrance.y][entrance.x] = 0;
        }

        sanctuaries.push({
          id: i,
          x: rx, y: ry,
          zone: i,
          visited: false,
          keyTaken: false,
          radius: Math.max(halfW, halfH) + 0.5,
          width: maxX - minX + 1,
          height: maxY - minY + 1,
          minX, minY, maxX, maxY
        });
      }
      // Tapınakları merkeze yakınlığa göre sırala (zone 0 başlangıç bölgesi)
      sanctuaries.sort((a, b) => Math.hypot(a.x - 1, a.y - 1) - Math.hypot(b.x - 1, b.y - 1));
      sanctuaries.forEach((s, idx) => { s.zone = idx; s.id = idx; });

      console.log("Tapınaklar:", sanctuaries.map(s => ({ zone: s.zone, x: s.x, y: s.y, w: s.width, h: s.height })));
    }

    function updateScrollHUD() {
      const scrollCount = document.getElementById('scroll-count');
      if (scrollCount) scrollCount.innerText = `YAZITLAR: ${state.scrollsCollected} / ${Math.max(1, state.scrollsRequired)}`;
      const keyCount = document.getElementById('key-count');
      if (keyCount) keyCount.innerText = `ANAHTAR: ${state.keysCollected} / ${Math.max(1, state.keysRequired)}`;
      const fragmentCount = document.getElementById('fragment-count');
      if (fragmentCount) fragmentCount.innerText = `PARÇA: ${state.fragmentsCollected}`;
      const zoneCount = document.getElementById('zone-count');
      if (zoneCount) zoneCount.innerText = `BÖLGE: ${state.zone + 1} / ${state.sanctuaryCount}`;
      const sanctuaryCount = document.getElementById('sanctuary-count');
      if (sanctuaryCount) sanctuaryCount.innerText = `TAPINAK: ${state.maxZone} / ${state.sanctuaryCount}`;
    }
    function updateHealthUI() {
      const perc = (state.health / progress.maxHealth) * 100;
      const healthBar = document.getElementById('health-bar');
      if (healthBar) healthBar.style.width = perc + "%";
    }
    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      state.cellSize = Math.min(window.innerWidth, window.innerHeight) / 5;
    }

    function drawScroll(x: number, y: number) {
      if (!ctx) return;
      ctx.save(); ctx.translate(x, y); ctx.fillStyle = '#f2e6d0';
      ctx.fillRect(state.cellSize * 0.3, state.cellSize * 0.2, state.cellSize * 0.4, state.cellSize * 0.6);
      ctx.fillStyle = '#a68b5e';
      ctx.fillRect(state.cellSize * 0.25, state.cellSize * 0.15, state.cellSize * 0.5, state.cellSize * 0.1);
      ctx.fillRect(state.cellSize * 0.25, state.cellSize * 0.75, state.cellSize * 0.5, state.cellSize * 0.1);
      ctx.restore();
    }

    function drawEnemy(enemy: Enemy, gx: number, gy: number) {
      if (!ctx) return;
      if (enemy.hidden) return; // Duvar içindeki wallmaw görünmez
      const size = state.cellSize * (enemy.type === 'devourer' ? 0.9 : 0.65);
      const colors: Record<Enemy['type'], string> = {
        stalker: '255, 0, 50',
        wraith: '160, 32, 240',
        sharpshooter: '0, 242, 255',
        devourer: '255, 50, 0',
        wallmaw: '120, 120, 140',
        'ivy mimic': '34, 139, 34',
        illusion: '180, 180, 200'
      };
      const color = colors[enemy.type];

      ctx.save();
      ctx.translate(gx, gy);

      // Durum bazlı görsel
      let alpha = 1.0;
      if (enemy.state === 'stun') alpha = 0.45;
      else if (enemy.state === 'search') alpha = 0.65;
      ctx.globalAlpha = alpha;

      if (enemy.type === 'wraith') {
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = `rgba(${color}, 0.5)`;
        ctx.beginPath();
        ctx.ellipse(0, 0, size * 0.35, size * 0.65, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (enemy.type === 'sharpshooter') {
        ctx.fillStyle = `rgba(${color}, 0.8)`;
        ctx.beginPath();
        ctx.arc(0, 0, size * 0.25, 0, Math.PI * 2);
        ctx.fill();
        const angle = Math.atan2(player.sy - enemy.sy, player.sx - enemy.sx);
        ctx.strokeStyle = `rgba(${color}, 0.4)`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(angle) * size * 0.7, Math.sin(angle) * size * 0.7);
        ctx.stroke();
      } else if (enemy.type === 'wallmaw') {
        // Duvar içinden çıkan: duvar renginde, büyük çatlak ağız
        ctx.fillStyle = `rgba(${color}, ${enemy.revealed ? 0.9 : 0.35})`;
        ctx.beginPath();
        ctx.ellipse(0, size * 0.1, size * 0.45, size * 0.35, 0, 0, Math.PI * 2);
        ctx.fill();
        // Dişler / çatlaklar
        ctx.strokeStyle = `rgba(${color}, 0.8)`;
        ctx.lineWidth = 2;
        for (let i = -2; i <= 2; i++) {
          ctx.beginPath();
          ctx.moveTo(i * 8, -5);
          ctx.lineTo(i * 8 + 3, 10);
          ctx.stroke();
        }
      } else if (enemy.type === 'ivy mimic') {
        // Sarmaşık görünümlü: kıvrımlı dallar
        ctx.strokeStyle = `rgba(${color}, 0.9)`;
        ctx.lineWidth = 3;
        for (let i = 0; i < 5; i++) {
          ctx.beginPath();
          ctx.rotate(Math.PI * 2 / 5);
          ctx.moveTo(0, 0);
          const t = Date.now() / 200 + i;
          ctx.quadraticCurveTo(15, Math.sin(t) * 8, 25, Math.cos(t) * 12);
          ctx.stroke();
        }
        ctx.fillStyle = `rgba(${color}, 0.6)`;
        ctx.beginPath(); ctx.arc(0, 0, size * 0.2, 0, Math.PI * 2); ctx.fill();
      } else if (enemy.type === 'illusion') {
        // Soluk, dalgalı kopya
        ctx.globalAlpha = 0.35;
        ctx.strokeStyle = `rgba(${color}, 0.7)`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const ang = (Date.now() / 300 + i) * 0.5;
          const r = size * 0.3 + Math.sin(ang * 2) * 5;
          ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
        }
        ctx.closePath(); ctx.stroke();
      } else {
        const pulse = 1 + Math.sin(Date.now() / 200) * 0.15;
        ctx.scale(pulse, pulse);
        const grad = ctx.createRadialGradient(0, 0, 5, 0, 0, size / 2);
        grad.addColorStop(0, `rgba(${color}, 0.85)`);
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = `rgba(${color}, 0.45)`;
        ctx.lineWidth = 2;
        const tentacles = enemy.type === 'devourer' ? 12 : 8;
        for (let i = 0; i < tentacles; i++) {
          ctx.rotate(Math.PI * 2 / tentacles);
          ctx.beginPath();
          ctx.moveTo(10, 0);
          const t = Date.now() / 100 + i;
          ctx.quadraticCurveTo(20, Math.sin(t) * 10, 35, Math.cos(t) * 6);
          ctx.stroke();
        }
      }

      // Durum göstergesi
      if (enemy.state === 'stun') {
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, -size * 0.5, size * 0.1, 0, Math.PI * 2);
        ctx.stroke();
      } else if (enemy.state === 'chase') {
        ctx.fillStyle = 'rgba(255, 0, 0, 0.6)';
        ctx.beginPath();
        ctx.arc(0, -size * 0.55, size * 0.08, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }

    function drawMiniMap() {
      if (!ctx) return;
      const size = Math.min(canvas.width, canvas.height) * 0.25;
      const cell = size / state.gridSize;
      const mx = canvas.width - size - 20;
      const my = 20;

      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.fillRect(mx - 10, my - 10, size + 20, size + 20);
      ctx.strokeStyle = 'rgba(255, 204, 0, 0.5)';
      ctx.lineWidth = 2;
      ctx.strokeRect(mx - 10, my - 10, size + 20, size + 20);

      // Sadece tapınaklar, çıkış ve oyuncu
      sanctuaries.forEach(s => {
        ctx.fillStyle = s.keyTaken ? 'rgba(255, 215, 0, 0.85)' : 'rgba(200, 180, 255, 0.85)';
        ctx.beginPath(); ctx.arc(mx + s.x * cell + cell / 2, my + s.y * cell + cell / 2, Math.max(cell, 3), 0, Math.PI * 2); ctx.fill();
      });

      ctx.fillStyle = 'rgba(255, 204, 0, 0.9)';
      ctx.beginPath(); ctx.arc(mx + exit.x * cell + cell / 2, my + exit.y * cell + cell / 2, Math.max(cell * 1.3, 4), 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(mx + player.sx * cell + cell / 2, my + player.sy * cell + cell / 2, Math.max(cell * 1.3, 4), 0, Math.PI * 2); ctx.fill();

      ctx.restore();
    }

    function draw() {
      const gameScene = document.getElementById('game-scene');
      if (!gameScene || !gameScene.classList.contains('active')) { requestAnimationFrame(draw); return; }
      if (!ctx) return;
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      const storyPanel = document.getElementById('story-panel');
      if (!state.active && !state.inventoryOpen && storyPanel && storyPanel.style.display !== 'block') { requestAnimationFrame(draw); return; }

      const targetCamX = player.sx * state.cellSize - canvas.width / 2 + state.cellSize / 2;
      const targetCamY = player.sy * state.cellSize - canvas.height / 2 + state.cellSize / 2;
      camera.x += (targetCamX - camera.x) * 0.12;
      camera.y += (targetCamY - camera.y) * 0.12;

      const lx = (player.sx * state.cellSize + state.cellSize / 2) - camera.x;
      const ly = (player.sy * state.cellSize + state.cellSize / 2) - camera.y;
      const healthMod = state.health / progress.maxHealth;
      state.lightRadius = (60 + 240 * healthMod * progress.lightMod);
      const baseRadius = state.lightRadius;

      ctx.save(); ctx.translate(-camera.x, -camera.y);
      for (let r = 0; r < state.gridSize; r++) {
        for (let c = 0; c < state.gridSize; c++) {
          const x = c * state.cellSize, y = r * state.cellSize;
          const dx = (x + state.cellSize / 2) - (player.sx * state.cellSize + state.cellSize / 2);
          const dy = (y + state.cellSize / 2) - (player.sy * state.cellSize + state.cellSize / 2);
          const distToPlayer = Math.sqrt(dx * dx + dy * dy);
          const visibility = Math.max(0, 1 - (distToPlayer / (baseRadius * 2.2)));
          const ambient = 0.22;
          const wallOpacity = Math.min(1, visibility + ambient);
          const floorOpacity = Math.min(1, visibility * 0.8 + ambient * 0.7);
          if (visibility + ambient > 0) {
            if (maze[r][c] === 1) {
              ctx.fillStyle = `rgba(55, 58, 85, ${wallOpacity})`; ctx.fillRect(x, y, state.cellSize, state.cellSize);
              // Duvarlara hafif esrarengiz glow
              if (wallOpacity > 0.3) {
                ctx.strokeStyle = `rgba(80, 70, 110, ${wallOpacity * 0.3})`;
                ctx.lineWidth = 1;
                ctx.strokeRect(x + 2, y + 2, state.cellSize - 4, state.cellSize - 4);
              }
              const mark = trailMarks.find(m => m.r === r && m.c === c);
              if (mark && mark.opacity > 0) {
                ctx.fillStyle = `rgba(0, 242, 255, ${mark.opacity * wallOpacity})`;
                ctx.font = `${state.cellSize / 2.5}px serif`; ctx.textAlign = "center";
                ctx.fillText(mark.rune, x + state.cellSize / 2, y + state.cellSize / 1.5);
                mark.opacity -= 0.005;
              }
              // Fısıldayan duvar gözü
              const whisper = whisperWalls.find(w => w.x === c && w.y === r);
              if (whisper && wallOpacity > 0.15) {
                const eyeOpen = Math.sin(Date.now() / 400 + c + r) > -0.3;
                ctx.fillStyle = eyeOpen ? `rgba(180, 60, 60, ${wallOpacity})` : `rgba(60, 40, 40, ${wallOpacity * 0.5})`;
                ctx.beginPath();
                ctx.ellipse(x + state.cellSize / 2, y + state.cellSize / 2, state.cellSize * 0.18, state.cellSize * 0.1, 0, 0, Math.PI * 2);
                ctx.fill();
                if (eyeOpen) {
                  ctx.fillStyle = `rgba(255, 80, 80, ${wallOpacity})`;
                  ctx.beginPath();
                  ctx.arc(x + state.cellSize / 2, y + state.cellSize / 2, state.cellSize * 0.05, 0, Math.PI * 2);
                  ctx.fill();
                }
              }
            } else { ctx.fillStyle = `rgba(18, 19, 30, ${floorOpacity})`; ctx.fillRect(x, y, state.cellSize, state.cellSize); }
          }
        }
      }

      scrolls.forEach(s => {
        const dist = Math.hypot(s.x - player.sx, s.y - player.sy) * state.cellSize;
        if (s.active && dist < baseRadius * 2) { ctx.globalAlpha = Math.max(0, 1 - (dist / (baseRadius * 1.8))); drawScroll(s.x * state.cellSize, s.y * state.cellSize); ctx.globalAlpha = 1; }
      });

      crystals.forEach(cr => {
        const dist = Math.hypot(cr.x - player.sx, cr.y - player.sy) * state.cellSize;
        if (cr.active && dist < baseRadius * 2) {
          ctx.fillStyle = `rgba(0, 242, 255, ${Math.max(0, 1 - (dist / (baseRadius * 1.8)))})`;
          ctx.beginPath(); ctx.arc(cr.x * state.cellSize + state.cellSize / 2, cr.y * state.cellSize + state.cellSize / 2, state.cellSize / 10, 0, Math.PI * 2); ctx.fill();
        }
      });

      // Fragments
      fragments.forEach(f => {
        const dist = Math.hypot(f.x - player.sx, f.y - player.sy) * state.cellSize;
        if (f.active && dist < baseRadius * 2) {
          const fx = f.x * state.cellSize + state.cellSize / 2;
          const fy = f.y * state.cellSize + state.cellSize / 2;
          ctx.fillStyle = `rgba(200, 160, 255, ${Math.max(0, 1 - (dist / (baseRadius * 1.8)))})`;
          ctx.beginPath(); ctx.arc(fx, fy, state.cellSize / 5, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0, 1 - (dist / (baseRadius * 1.5)))})`;
          ctx.font = `${state.cellSize / 2}px serif`; ctx.textAlign = "center";
          ctx.fillText("✦", fx, fy + state.cellSize / 6);
        }
      });

      // Map pieces
      mapPieces.forEach(m => {
        const dist = Math.hypot(m.x - player.sx, m.y - player.sy) * state.cellSize;
        if (m.active && dist < baseRadius * 2) {
          const mx = m.x * state.cellSize + state.cellSize / 2;
          const my = m.y * state.cellSize + state.cellSize / 2;
          ctx.fillStyle = `rgba(255, 204, 0, ${Math.max(0, 1 - (dist / (baseRadius * 1.8)))})`;
          ctx.beginPath(); ctx.arc(mx, my, state.cellSize / 6, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = `rgba(255, 204, 0, ${Math.max(0, 1 - (dist / (baseRadius * 1.5)))})`;
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(mx - 5, my - 5); ctx.lineTo(mx + 5, my + 5); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(mx + 5, my - 5); ctx.lineTo(mx - 5, my + 5); ctx.stroke();
        }
      });

      // Keys
      keys.forEach(k => {
        const dist = Math.hypot(k.x - player.sx, k.y - player.sy) * state.cellSize;
        if (k.active && dist < baseRadius * 2) {
          const kx = k.x * state.cellSize + state.cellSize / 2;
          const ky = k.y * state.cellSize + state.cellSize / 2;
          ctx.fillStyle = `rgba(255, 215, 0, ${Math.max(0, 1 - (dist / (baseRadius * 1.8)))})`;
          ctx.beginPath(); ctx.arc(kx - 3, ky - 3, state.cellSize / 8, 0, Math.PI * 2); ctx.fill();
          ctx.fillRect(kx - 1, ky - 1, state.cellSize / 3, state.cellSize / 8);
        }
      });

      // Traps
      traps.forEach(t => {
        const dist = Math.hypot(t.x - player.sx, t.y - player.sy) * state.cellSize;
        const visible = t.visible || dist < baseRadius * 0.8;
        if (visible && dist < baseRadius * 2) {
          const tx = t.x * state.cellSize + state.cellSize / 2;
          const ty = t.y * state.cellSize + state.cellSize / 2;
          const alpha = Math.max(0, 1 - (dist / (baseRadius * 1.8)));
          if (t.type === 'spike') {
            ctx.fillStyle = `rgba(180, 40, 40, ${alpha})`;
            for (let i = -1; i <= 1; i++) {
              ctx.beginPath();
              ctx.moveTo(tx + i * 8, ty + 6);
              ctx.lineTo(tx + i * 8 + 3, ty - 8);
              ctx.lineTo(tx + i * 8 + 6, ty + 6);
              ctx.fill();
            }
          } else if (t.type === 'pit') {
            ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
            ctx.beginPath(); ctx.arc(tx, ty, state.cellSize / 3.5, 0, Math.PI * 2); ctx.fill();
          } else {
            ctx.fillStyle = `rgba(40, 120, 40, ${alpha})`;
            ctx.beginPath(); ctx.arc(tx, ty, state.cellSize / 4, 0, Math.PI * 2); ctx.fill();
          }
        }
      });

      // Rune buttons
      runeButtons.forEach(b => {
        const dist = Math.hypot(b.x - player.sx, b.y - player.sy) * state.cellSize;
        if (dist < baseRadius * 2) {
          const bx = b.x * state.cellSize + state.cellSize / 2;
          const by = b.y * state.cellSize + state.cellSize / 2;
          const alpha = Math.max(0, 1 - (dist / (baseRadius * 1.8)));
          ctx.fillStyle = b.pressed ? `rgba(0, 242, 255, ${alpha})` : `rgba(80, 80, 100, ${alpha})`;
          ctx.beginPath(); ctx.arc(bx, by, state.cellSize / 4, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
          ctx.font = `${state.cellSize / 2}px serif`; ctx.textAlign = "center";
          ctx.fillText(b.rune, bx, by + state.cellSize / 6);
        }
      });

      // Secret doors
      secretDoors.forEach(d => {
        const dist = Math.hypot(d.x - player.sx, d.y - player.sy) * state.cellSize;
        if (d.revealed && dist < baseRadius * 2) {
          const dx = d.x * state.cellSize, dy = d.y * state.cellSize;
          const alpha = Math.max(0, 1 - (dist / (baseRadius * 1.8)));
          ctx.fillStyle = `rgba(60, 55, 80, ${alpha})`;
          ctx.fillRect(dx, dy, state.cellSize, state.cellSize);
          if (d.open) {
            ctx.strokeStyle = `rgba(0, 242, 255, ${alpha})`;
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(dx + state.cellSize / 2, dy); ctx.lineTo(dx + state.cellSize / 2, dy + state.cellSize); ctx.stroke();
            ctx.fillStyle = `rgba(0, 242, 255, ${alpha * 0.5})`;
            ctx.font = `${state.cellSize / 3}px serif`; ctx.textAlign = "center";
            ctx.fillText("AÇIK", dx + state.cellSize / 2, dy + state.cellSize / 1.6);
          }
        }
      });

      // Sanctuaries (tapınaklar)
      sanctuaries.forEach(s => {
        const dist = Math.hypot(s.x - player.sx, s.y - player.sy) * state.cellSize;
        if (dist < baseRadius * 4) {
          const alpha = Math.max(0, 1 - (dist / (baseRadius * 3)));
          const cx = (s.minX + s.maxX + 1) * state.cellSize / 2;
          const cy = (s.minY + s.maxY + 1) * state.cellSize / 2;
          const w = (s.maxX - s.minX + 1) * state.cellSize;
          const h = (s.maxY - s.minY + 1) * state.cellSize;
          // Oda zemin rengi
          ctx.fillStyle = s.visited ? `rgba(255, 215, 0, ${alpha * 0.12})` : `rgba(200, 180, 255, ${alpha * 0.12})`;
          ctx.fillRect(s.minX * state.cellSize, s.minY * state.cellSize, w, h);
          // Çerçeve
          ctx.strokeStyle = s.visited ? `rgba(255, 215, 0, ${alpha * 0.5})` : `rgba(200, 180, 255, ${alpha * 0.5})`;
          ctx.lineWidth = 3;
          ctx.strokeRect(s.minX * state.cellSize, s.minY * state.cellSize, w, h);
          // Güvenli alan glow
          const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.6);
          grad.addColorStop(0, s.visited ? `rgba(255, 215, 0, ${alpha * 0.25})` : `rgba(200, 180, 255, ${alpha * 0.25})`);
          grad.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = grad;
          ctx.beginPath(); ctx.arc(cx, cy, Math.max(w, h) * 0.6, 0, Math.PI * 2); ctx.fill();
          // Tapınak işareti (merkezde)
          ctx.fillStyle = s.keyTaken ? `rgba(255, 215, 0, ${alpha})` : `rgba(200, 180, 255, ${alpha})`;
          ctx.font = `${state.cellSize * 0.7}px serif`; ctx.textAlign = "center";
          ctx.fillText(s.keyTaken ? "☆" : "⌂", cx, cy + state.cellSize * 0.25);
        }
      });

      // Guide NPC
      if (guide && guide.active) {
        const dist = Math.hypot(guide.x - player.sx, guide.y - player.sy) * state.cellSize;
        if (dist < baseRadius * 2) {
          const gx = guide.x * state.cellSize + state.cellSize / 2;
          const gy = guide.y * state.cellSize + state.cellSize / 2;
          const alpha = Math.max(0, 1 - (dist / (baseRadius * 1.8)));
          ctx.fillStyle = `rgba(160, 120, 255, ${alpha})`;
          ctx.beginPath(); ctx.arc(gx, gy, state.cellSize / 4, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
          ctx.font = `${state.cellSize / 2}px serif`; ctx.textAlign = "center";
          ctx.fillText("?", gx, gy + state.cellSize / 6);
        }
      }

      if (state.scrollsCollected >= state.scrollsRequired) {
        const dist = Math.hypot(exit.x - player.sx, exit.y - player.sy) * state.cellSize;
        ctx.fillStyle = `rgba(255, 204, 0, ${Math.max(0.2, 1 - (dist / (baseRadius * 3)))})`;
        ctx.beginPath(); ctx.arc(exit.x * state.cellSize + state.cellSize / 2, exit.y * state.cellSize + state.cellSize / 2, state.cellSize / 3.5, 0, Math.PI * 2); ctx.fill();
      }

      // Mini map overlay
      if (state.mapOverlayTimer > 0) {
        drawMiniMap();
      }

      enemies.forEach(enemy => {
        enemy.sx += (enemy.x - enemy.sx) * 0.1;
        enemy.sy += (enemy.y - enemy.sy) * 0.1;
        const distG = Math.hypot(enemy.sx - player.sx, enemy.sy - player.sy) * state.cellSize;
        if (distG < baseRadius * 2.5) {
          const gx = enemy.sx * state.cellSize + state.cellSize / 2;
          const gy = enemy.sy * state.cellSize + state.cellSize / 2;
          drawEnemy(enemy, gx, gy);
        }
      });

      player.sx += (player.x - player.sx) * 0.2; player.sy += (player.y - player.sy) * 0.2;

      // Draw Particles
      particles.forEach((p, i) => {
        p.x += p.vx; p.y += p.vy; p.life -= 0.02;
        if (p.life <= 0) particles.splice(i, 1);
        ctx.fillStyle = p.color.replace(')', `, ${p.life})`);
        ctx.fillRect(p.x, p.y, 3, 3);
      });

      // Player Orb (Restored to Circle with Polish)
      const px = player.sx * state.cellSize + state.cellSize / 2;
      const py = player.sy * state.cellSize + state.cellSize / 2;
      const orbRadius = state.cellSize / 5;

      ctx.beginPath();
      const playerGrad = ctx.createRadialGradient(px, py, 0, px, py, orbRadius);
      playerGrad.addColorStop(0, state.takingDamage ? '#ff004c' : '#fff');
      playerGrad.addColorStop(1, state.takingDamage ? 'rgba(255, 0, 76, 0)' : 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = playerGrad;
      ctx.arc(px, py, orbRadius * 1.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.fillStyle = state.takingDamage ? '#ff004c' : '#fff';
      ctx.arc(px, py, orbRadius * 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();


      const finalRadius = baseRadius;
      const beamX = lx + player.dir.x * (finalRadius * 0.4);
      const beamY = ly + player.dir.y * (finalRadius * 0.4);

      if (vignette) {
        if (state.flashActive) {
          vignette.style.background = `radial-gradient(circle 1200px at ${lx}px ${ly}px, rgba(255, 255, 255, 0.22) 0%, rgba(0,0,0,0.85) 70%, black 100%)`;
        } else {
          vignette.style.background = `
                    radial-gradient(circle ${finalRadius * 2.2}px at ${beamX}px ${beamY}px, rgba(255, 255, 230, 0.16) 0%, transparent 70%),
                    radial-gradient(circle ${finalRadius * 1.5}px at ${lx}px ${ly}px, rgba(255, 255, 255, 0.10) 0%, transparent 60%),
                    radial-gradient(circle ${finalRadius * 3.0}px at ${lx}px ${ly}px, transparent 0%, rgba(0,0,0,0.80) 75%, black 100%)
                `;
        }
      }

      const viewport = document.getElementById('viewport');
      if (viewport) {
        if (state.shakeAmount > 0) { viewport.classList.add('hard-shaking'); state.shakeAmount--; }
        else if (state.takingDamage) viewport.classList.add('hard-shaking');
        else if (state.guardianNear) viewport.classList.add('shaking');
        else viewport.classList.remove('shaking', 'hard-shaking');

        const distToNearest = enemies.reduce((min, e) => Math.min(min, Math.hypot(e.x - player.x, e.y - player.y)), Infinity);
        if (state.active && distToNearest < 2) viewport.classList.add('glitch-active');
        else viewport.classList.remove('glitch-active');
      }

      requestAnimationFrame(draw);
    }

    function update() {
      if (!state.active) return;

      // Işık yarıçapını güncelle
      const healthMod = state.health / progress.maxHealth;
      state.lightRadius = (60 + 240 * healthMod * progress.lightMod);

      let nearestEnemyDist = Infinity;
      let touchingEnemy = false;

      function hasLineOfSight(x1: number, y1: number, x2: number, y2: number) {
        let x = Math.round(x1), y = Math.round(y1);
        const tx = Math.round(x2), ty = Math.round(y2);
        const dx = Math.abs(tx - x), dy = Math.abs(ty - y);
        const sx = Math.sign(tx - x), sy = Math.sign(ty - y);
        let err = dx - dy;
        let steps = 0;
        while ((x !== tx || y !== ty) && steps < 30) {
          if (maze[y]?.[x] === 1) return false;
          const e2 = 2 * err;
          if (e2 > -dy) { err -= dy; x += sx; }
          if (e2 < dx) { err += dx; y += sy; }
          steps++;
        }
        return true;
      }

      // Oyuncu herhangi bir tapınak içinde mi?
      const insideSanctuary = sanctuaries.find(s => isInsideSanctuary(player.x, player.y, s));
      const sanctuarySafe = insideSanctuary !== undefined;

      // Tapınağa yaklaşma: ziyaret edilmemiş tapınak görülünce tüm canavarlar oraya koşar
      const approaching = sanctuaries.find(s => !s.visited && Math.hypot(s.x - player.x, s.y - player.y) < 7);
      if (approaching && !(window as any).sanctuaryAlertFired) {
        (window as any).sanctuaryAlertFired = true;
        showToast("Tapınak! Canavarlar akın ediyor...");
        state.shakeAmount = 30;
        soundManager.play('sanctuaryAlert', 0.6);
      }
      if (!approaching) (window as any).sanctuaryAlertFired = false;

      enemies.forEach(enemy => {
        const rushingSanctuary = approaching !== undefined && !sanctuarySafe;
        const gridDist = Math.hypot(enemy.x - player.x, enemy.y - player.y);
        const pixelDist = gridDist * state.cellSize;
        enemy.inLight = pixelDist < state.lightRadius;

        // Stun timer azalt
        if (enemy.stunTimer > 0) {
          enemy.stunTimer--;
          if (enemy.stunTimer <= 0) enemy.state = 'search';
        }
        if (enemy.state === 'stun' && enemy.stunTimer <= 0) enemy.state = 'search';

        if (enemy.state === 'stun') {
          if (gridDist < nearestEnemyDist) nearestEnemyDist = gridDist;
          return;
        }

        // Wallmaw reveal
        if (enemy.type === 'wallmaw') {
          if (enemy.hidden && gridDist < 3.5) {
            enemy.hidden = false; enemy.revealed = true;
            const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]].sort(() => Math.random() - 0.5);
            for (const [dx, dy] of dirs) {
              const nx = enemy.x + dx, ny = enemy.y + dy;
              if (maze[ny]?.[nx] === 0) { enemy.x = nx; enemy.y = ny; break; }
            }
            state.shakeAmount = 20;
            soundManager.play('growl', 0.3);
          }
          if (enemy.hidden) return;
        }

        // Ivy mimic aggro
        if (enemy.type === 'ivy mimic') {
          if (!enemy.aggro && gridDist < 2.5) {
            enemy.aggro = true;
            state.shakeAmount = 15;
            soundManager.play('growl', 0.3);
          }
          if (!enemy.aggro) return;
        }

        // Işıkta yavaşla ve stun birikimi
        let lightSlow = 1.0;
        if (enemy.inLight) {
          lightSlow = 0.5;
          enemy.stunTimer += 0.4;
          if (enemy.stunTimer > 50) {
            enemy.stunTimer = 90;
            enemy.state = 'stun';
          }
        } else {
          enemy.stunTimer = Math.max(0, enemy.stunTimer - 0.08);
        }

        let contactDamage = 2.0;
        if (enemy.type === 'illusion') contactDamage = 0.8;

        // Görüş / aggro (line of sight + mesafe)
        const seesPlayer = gridDist < enemy.aggroRadius && hasLineOfSight(enemy.x, enemy.y, player.x, player.y);

        if (seesPlayer) {
          enemy.state = 'chase';
          enemy.lastSeenX = player.x;
          enemy.lastSeenY = player.y;
          enemy.searchTimer = 120;
        } else if (enemy.state === 'chase' && !rushingSanctuary) {
          enemy.state = 'search';
          enemy.searchTimer = 120;
        }

        // Tapınağa akın: tüm canavarlar tapınağı hedef alır
        if (rushingSanctuary) {
          enemy.state = 'chase';
          enemy.lastSeenX = approaching.x;
          enemy.lastSeenY = approaching.y;
          enemy.searchTimer = 300;
        }

        // Tapınak güvenli alanı: oyuncu içerideyse canavarlar etrafında arar, saldıramaz
        if (sanctuarySafe) {
          if (enemy.state === 'chase') enemy.state = 'search';
          enemy.searchTimer = Math.max(enemy.searchTimer, 180);
        }

        // Hareket
        enemy.wait++;
        let targetX = enemy.x, targetY = enemy.y;
        if (enemy.state === 'chase') {
          if (rushingSanctuary && approaching) { targetX = approaching.x; targetY = approaching.y; }
          else { targetX = player.x; targetY = player.y; }
        }
        else if (enemy.state === 'search') { targetX = enemy.lastSeenX; targetY = enemy.lastSeenY; }
        else {
          // idle: rastgele dolaş
          const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
          const d = dirs[Math.floor(Math.random() * dirs.length)];
          targetX = enemy.x + d[0]; targetY = enemy.y + d[1];
        }

        let moveSpeed = enemy.speed;
        if (enemy.state === 'chase') moveSpeed = Math.max(2, enemy.speed - 3);
        if (enemy.inLight) moveSpeed = Math.ceil(moveSpeed / lightSlow);
        if (enemy.state === 'search') moveSpeed = Math.ceil(moveSpeed * 0.7);

        if (enemy.wait >= moveSpeed) {
          enemy.wait = 0;
          const dx = targetX - enemy.x;
          const dy = targetY - enemy.y;
          let nx = enemy.x, ny = enemy.y;
          if (Math.abs(dx) > Math.abs(dy)) nx += Math.sign(dx); else ny += Math.sign(dy);
          if (maze[ny]?.[nx] === 0) { enemy.x = nx; enemy.y = ny; }
        }

        // Arama durumu sonu
        if (enemy.state === 'search') {
          enemy.searchTimer--;
          if (Math.hypot(enemy.x - enemy.lastSeenX, enemy.y - enemy.lastSeenY) < 0.5 || enemy.searchTimer <= 0) {
            enemy.state = 'idle';
          }
        }

        if (gridDist < nearestEnemyDist) nearestEnemyDist = gridDist;

        // Temas hasarı (tapınak içindeyken yok)
        if (gridDist < 0.7 && !sanctuarySafe) {
          touchingEnemy = true;
          state.health -= contactDamage;
        }
      });

      // Canavarlar artık ölmüyor; ölüm filtresi kaldırıldı

      // TrailMarks (duvarlara rune işareti)
      const dirs = [{ x: 0, y: 1 }, { x: 0, y: -1 }, { x: 1, y: 0 }, { x: -1, y: 0 }];
      dirs.forEach(d => {
        const wx = player.x + d.x, wy = player.y + d.y;
        if (maze[wy]?.[wx] === 1) {
          let mark = trailMarks.find(m => m.r === wy && m.c === wx);
          if (!mark) trailMarks.push({ r: wy, c: wx, opacity: 0.8, rune: runes[Math.floor(Math.random() * runes.length)] });
          else mark.opacity = 0.8;
        }
      });

      state.guardianNear = nearestEnemyDist < 5;

      // Heartbeat pulse logic
      if (state.active && state.guardianNear) {
        if (!(window as any).lastHeartbeat || Date.now() - (window as any).lastHeartbeat > (nearestEnemyDist * 200 + 300)) {
          soundManager.heartbeat(Math.max(0, 1 - nearestEnemyDist / 6));
          (window as any).lastHeartbeat = Date.now();
        }
      }

      // Hasar alma / iyileşme durumu
      const damageOverlay = document.getElementById('damage-overlay');
      if (touchingEnemy) {
        if (!state.takingDamage) { soundManager.play('damage', 0.4); spawnParticles(player.sx * state.cellSize, player.sy * state.cellSize, 'rgba(255,0,0,1)'); }
        state.takingDamage = true;
        if (damageOverlay) damageOverlay.style.opacity = "1";
        updateHealthUI();
        if (state.health <= 0) showModal("RUHUN TÜKENDİ", "Gölge Yiyen ruhunu tamamen çekti...");
      } else {
        state.takingDamage = false;
        if (damageOverlay) damageOverlay.style.opacity = "0";
        if (state.health < progress.maxHealth && nearestEnemyDist > 5) {
          state.health = Math.min(progress.maxHealth, state.health + (0.1 * progress.regenMod)); updateHealthUI();
        }
      }

      // Fragments
      fragments.forEach(f => {
        if (f.active && f.x === player.x && f.y === player.y) {
          f.active = false;
          state.fragmentsCollected++;
          state.score += 300;
          showFragment(f.title, f.text, f.clue);
          const scoreVal = document.getElementById('map-score-global');
          if (scoreVal) scoreVal.innerText = state.score.toString();
          soundManager.play('collect', 0.5);
          spawnParticles(f.x * state.cellSize, f.y * state.cellSize, 'rgba(200,160,255,1)', 10);
          // Rehberin güveni fragment bilgisine göre değişebilir
          if (guide && !guide.revealed) guide.trust += 10;
        }
      });

      // Map pieces
      mapPieces.forEach(m => {
        if (m.active && m.x === player.x && m.y === player.y) {
          m.active = false;
          state.score += 150;
          state.mapOverlayTimer = m.duration;
          const scoreVal = document.getElementById('map-score-global');
          if (scoreVal) scoreVal.innerText = state.score.toString();
          soundManager.play('click', 0.4);
          spawnParticles(m.x * state.cellSize, m.y * state.cellSize, 'rgba(255,204,0,1)', 8);
        }
      });
      if (state.mapOverlayTimer > 0) state.mapOverlayTimer--;

      // Keys
      keys.forEach(k => {
        if (k.active && k.x === player.x && k.y === player.y) {
          k.active = false;
          state.keysCollected++;
          if (state.keysCollected >= state.keysRequired) state.exitLocked = false;
          state.score += 250;
          const scoreVal = document.getElementById('map-score-global');
          if (scoreVal) scoreVal.innerText = state.score.toString();
          soundManager.play('collect', 0.5);
          spawnParticles(k.x * state.cellSize, k.y * state.cellSize, 'rgba(255,215,0,1)', 10);
          showToast(`Anahtar ${state.keysCollected}/${state.keysRequired}`);
        }
      });

      // Traps
      if (state.trapDamageCooldown > 0) state.trapDamageCooldown--;
      traps.forEach(t => {
        if (t.cooldown > 0) t.cooldown--;
        if (t.x === player.x && t.y === player.y && t.armed && t.cooldown === 0 && state.trapDamageCooldown === 0) {
          t.cooldown = 120;
          state.trapDamageCooldown = 60;
          state.health -= 12;
          state.shakeAmount = 20;
          state.takingDamage = true;
          soundManager.play('damage', 0.5);
          spawnParticles(player.sx * state.cellSize, player.sy * state.cellSize, 'rgba(255,0,0,0.9)', 12);
          showToast("Tuzak!");
          updateHealthUI();
          if (state.health <= 0) showModal("RUHUN TÜKENDİ", "Bir tuzak ruhunu çekti...");
        }
        // Fener ışığında tuzak biraz görünür
        const pd = Math.hypot(t.x - player.x, t.y - player.y) * state.cellSize;
        t.visible = pd < state.lightRadius * 0.7;
      });

      // Rune buttons
      runeButtons.forEach(b => {
        if (b.x === player.x && b.y === player.y) {
          // Butona basılı tutma hissi: her adımda bir kez tetikle
          if (!b.pressed) {
            b.pressed = true;
            runeSequence.push(b.order);
            soundManager.play('click', 0.4);
            spawnParticles(b.x * state.cellSize, b.y * state.cellSize, 'rgba(0,242,255,1)', 6);
            // Doğru sıra kontrolü
            let correct = true;
            for (let i = 0; i < runeSequence.length; i++) {
              if (runeSequence[i] !== runeTargetSequence[i]) { correct = false; break; }
            }
            if (!correct) {
              // Yanlış: düşman çağır
              runeSequence = [];
              runeButtons.forEach(bb => bb.pressed = false);
              showToast("Rune dizilimi yanlış!");
              const cell = getEmptyCell(3, true);
              if (cell) enemies.push(createEnemy(cell.x, cell.y, 'stalker'));
            } else if (runeSequence.length === runeTargetSequence.length) {
              // Doğru: gizli kapı aç
              runeButtons.forEach(bb => bb.pressed = false);
              runeSequence = [];
              showToast("Gizli geçit açıldı!");
              secretDoors.forEach(d => { d.open = true; d.revealed = true; });
            }
          }
        } else {
          b.pressed = false;
        }
      });

      // Secret doors: fener ışığında reveal ol
      secretDoors.forEach(d => {
        const pd = Math.hypot(d.x - player.x, d.y - player.y) * state.cellSize;
        if (!d.revealed && pd < state.lightRadius * 0.8) {
          d.revealed = true;
          state.revealedDoors++;
        }
      });

      // Whisper walls
      whisperWalls.forEach(w => {
        if (w.cooldown > 0) w.cooldown--;
        const pd = Math.hypot(w.x - player.x, w.y - player.y) * state.cellSize;
        if (pd < state.lightRadius * 0.7 && w.cooldown === 0) {
          w.shown = true;
          w.cooldown = 180;
          showWhisper(w.x, w.y, w.text);
          // Rehber hakkında ipucu veren duvarlar güveni etkiler
          if (guide && !guide.revealed && w.text.includes("yalan")) guide.trust -= 15;
        }
      });

      // Guide NPC interaction
      if (guide && guide.active && guide.x === player.x && guide.y === player.y) {
        if (!guide.met) {
          guide.met = true;
          showGuideDialog(guide.currentDialog);
        }
      }

      scrolls.forEach(s => { if (s.active && s.x === player.x && s.y === player.y) { s.active = false; state.scrollsCollected++; state.score += 500; progress.collectedScrolls.push(s.text); updateScrollHUD(); (window as any).showStory(s.text); const scoreVal = document.getElementById('map-score-global'); if (scoreVal) scoreVal.innerText = state.score.toString(); soundManager.play('collect', 0.6); spawnParticles(s.x * state.cellSize, s.y * state.cellSize, 'rgba(255,204,0,1)'); } });
      crystals.forEach(c => { if (c.active && c.x === player.x && c.y === player.y) { c.active = false; state.score += 100; const scoreVal = document.getElementById('map-score-global'); if (scoreVal) scoreVal.innerText = state.score.toString(); soundManager.play('click', 0.3); spawnParticles(c.x * state.cellSize, c.y * state.cellSize, 'rgba(0,242,255,1)'); } });

      // Sanctuaries
      let zoneChanged = false;
      sanctuaries.forEach(s => {
        const dist = Math.hypot(s.x - player.x, s.y - player.y);
        if (dist <= s.radius) {
          if (!s.visited) {
            s.visited = true;
            state.maxZone = Math.max(state.maxZone, s.zone + 1);
            showToast(`${s.zone + 1}. tapınak bulundu! Bölge açıldı.`);
            soundManager.play('sanctuaryBell', 0.6);
            spawnParticles(s.x * state.cellSize, s.y * state.cellSize, 'rgba(255,215,0,1)', 16);
            zoneChanged = true;
          }
          if (!s.keyTaken) {
            s.keyTaken = true;
            state.keysCollected++;
            if (state.keysCollected >= state.keysRequired) state.exitLocked = false;
            showToast(`Tapınak anahtarı! ${state.keysCollected}/${state.keysRequired}`);
            soundManager.play('key', 0.5);
            spawnParticles(s.x * state.cellSize, s.y * state.cellSize, 'rgba(255,215,0,1)', 12);
            zoneChanged = true;
          }
          // Saklanma yeri: tapınak içinde hafif iyileşme
          if (state.health < progress.maxHealth) {
            state.health = Math.min(progress.maxHealth, state.health + 0.03 * progress.regenMod);
            updateHealthUI();
          }
        }
      });
      const newZone = getPlayerZone();
      if (newZone !== state.zone) zoneChanged = true;
      state.zone = newZone;
      if (zoneChanged) updateScrollHUD();

      // Exit: 7 tapınak anahtarı gerekli
      if (player.x === exit.x && player.y === exit.y) {
        if (state.exitLocked) {
          if ((window as any).lastLockedMsg === undefined || Date.now() - (window as any).lastLockedMsg > 3000) {
            (window as any).lastLockedMsg = Date.now();
            showToast(`Çıkış kilitli! Anahtar ${state.keysCollected}/${state.keysRequired}`);
          }
        } else {
          showModal("DERİNLERE İNİŞ", "Tüm tapınakları aştın. Ruhun bir sonraki katmana hazır.");
        }
      }
    }

    (window as any).showStory = function (txt: string) { state.active = false; soundManager.play('click', 0.5); const storyPanel = document.getElementById('story-panel'); if (storyPanel) { storyPanel.style.display = 'block'; const storyContent = document.getElementById('story-content'); if (storyContent) storyContent.innerText = txt; } };
    (window as any).closeStory = function () { soundManager.play('click', 0.3); const storyPanel = document.getElementById('story-panel'); if (storyPanel) storyPanel.style.display = 'none'; state.active = true; };

    function showFragment(title: string, text: string, clue: string) {
      state.active = false;
      const panel = document.getElementById('fragment-panel');
      const t = document.getElementById('fragment-title');
      const c = document.getElementById('fragment-content');
      const cl = document.getElementById('fragment-clue');
      if (panel) panel.style.display = 'flex';
      if (t) t.innerText = title;
      if (c) c.innerText = text;
      if (cl) cl.innerText = "İpucu: " + clue;
    }
    (window as any).closeFragment = function () {
      const panel = document.getElementById('fragment-panel');
      if (panel) panel.style.display = 'none';
      state.active = true;
    };

    function showToast(msg: string) {
      const el = document.getElementById('game-toast');
      if (!el) return;
      el.innerText = msg;
      el.classList.add('show');
      setTimeout(() => el.classList.remove('show'), 2000);
    }

    function showWhisper(x: number, y: number, text: string) {
      const container = document.getElementById('whisper-container');
      if (!container) return;
      const el = document.createElement('div');
      el.className = 'whisper-text';
      el.innerText = text;
      container.appendChild(el);
      soundManager.playWhisper(0.25);
      setTimeout(() => {
        if (container.contains(el)) container.removeChild(el);
      }, 4000);
    }

    function showGuideDialog(text: string) {
      state.active = false;
      const panel = document.getElementById('guide-panel');
      const txt = document.getElementById('guide-text');
      if (panel) panel.style.display = 'flex';
      if (txt) txt.innerText = text;
    }
    (window as any).guideChoice = function (choice: 'trust' | 'doubt' | 'attack') {
      const panel = document.getElementById('guide-panel');
      if (panel) panel.style.display = 'none';
      if (!guide) { state.active = true; return; }

      if (choice === 'trust') {
        guide.trust += 20;
        if (guide.realIntent === 'ally') {
          showToast("Rehber sana kısa bir yol gösterdi.");
          // Rastgele açık kapı yarat veya feneri güçlendir
          state.lightRadius += 60;
        } else {
          showToast("Rehberin gözleri karanlık parlıyor...");
          const cell = getEmptyCell(3, true);
          if (cell) enemies.push(createEnemy(cell.x, cell.y, 'stalker'));
          enemies.push(createEnemy(guide.x, guide.y, 'stalker'));
        }
      } else if (choice === 'doubt') {
        guide.trust -= 10;
        if (guide.realIntent === 'traitor') {
          showToast("Rehber kaçtı; ihanetini fark ettin.");
          guide.active = false;
        } else {
          showToast("Rehber üzgün görünüyor ama sana zarar vermiyor.");
        }
      } else if (choice === 'attack') {
        if (guide.realIntent === 'traitor') {
          showToast("Rehberi avladın; ihanetine geç kalmadın.");
          state.score += 1000;
        } else {
          showToast("Masum rehberi vurdun... ruhun kirlendi.");
          state.health -= 20;
          updateHealthUI();
        }
        guide.active = false;
      }
      guide.revealed = true;
      state.active = true;
    };

    function getZoneAt(x: number, y: number) {
      if (sanctuaries.length === 0) return 0;
      let nearest = sanctuaries[0];
      let minDist = Infinity;
      for (const s of sanctuaries) {
        const d = Math.hypot(s.x - x, s.y - y);
        if (d < minDist) { minDist = d; nearest = s; }
      }
      return nearest.zone;
    }
    function getPlayerZone() { return getZoneAt(player.x, player.y); }
    function isInsideSanctuary(x: number, y: number, s: Sanctuary) { return x >= s.minX && x <= s.maxX && y >= s.minY && y <= s.maxY; }

    function move(dx: number, dy: number) {
      if (!state.active) return;
      player.dir = { x: dx, y: dy };
      const nx = player.x + dx, ny = player.y + dy;
      const isOpenSecretDoor = secretDoors.some(d => d.x === nx && d.y === ny && d.open);
      if (maze[ny]?.[nx] === 0 || isOpenSecretDoor) {
        const targetZone = getZoneAt(nx, ny);
        const enteringSanctuary = sanctuaries.some(s => isInsideSanctuary(nx, ny, s));
        // Kilitli bölge: sessizce engelle, ama tapınağın içine girmeye izin ver
        if (targetZone > state.maxZone && !enteringSanctuary) return;
        player.x = nx; player.y = ny;
        state.zone = getPlayerZone();
        soundManager.playStep();
      }
    }


    (window as any).triggerFlash = function () {
      if (state.cd || !state.active) return;
      state.cd = true; state.flashActive = true; setTimeout(() => state.flashActive = false, 500);

      // Işık Patlaması: Işık alanındaki düşmanları sersemletir, kaçış penceresi yaratır
      let hitAny = false;
      const burstRange = state.lightRadius * 1.2;
      const stunDuration = 120 + (progress.charLevel * 15);

      enemies.forEach(enemy => {
        const dist = Math.hypot(enemy.x - player.x, enemy.y - player.y) * state.cellSize;
        if (dist < burstRange) {
          hitAny = true;
          enemy.stunTimer = stunDuration;
          enemy.state = 'stun';
          enemy.searchTimer = 0;
          spawnParticles(enemy.sx * state.cellSize, enemy.sy * state.cellSize, 'rgba(255,255,255,1)', 8);
        }
      });

      if (hitAny) {
        state.shakeAmount = 30;
        soundManager.play('burst', 0.5);
      }

      let start = Date.now();
      const timer = setInterval(() => {
        let p = (Date.now() - start) / 8000 * 100;
        const cdTimer = document.getElementById('cd-timer');
        if (cdTimer) cdTimer.style.height = (100 - p) + "%";
        if (p >= 100) { clearInterval(timer); state.cd = false; }
      }, 50);
    };

    function showModal(t: string, d: string) { state.active = false; const mTitle = document.getElementById('m-title'); const mDesc = document.getElementById('m-desc'); const modal = document.getElementById('modal'); if (mTitle) mTitle.innerText = t; if (mDesc) mDesc.innerText = d; if (modal) modal.style.display = 'flex'; }
    (window as any).closeModal = function () {
      const modal = document.getElementById('modal');
      if (modal) modal.style.display = 'none';
      const mTitle = document.getElementById('m-title');
      const titleText = mTitle?.innerText || "";

      if (titleText === "DERİNLERE İNİŞ") {
        state.level++;
        if (state.level > progress.maxUnlockedLevel) {
          progress.maxUnlockedLevel = state.level;
          saveGame();
        }
        if (state.level > 6) {
          showModal("NİHAİ ZAFER", "Gölge Labirenti'nin tüm sırlarını çözdün. Karanlık artık senden korkuyor.");
          state.level = 1;
          saveGame();
          return;
        }
      } else if (titleText === "NİHAİ ZAFER") {
        state.level = 1;
        state.score = 0;
        progress.maxUnlockedLevel = 1;
        progress.collectedScrolls = [];
        saveGame();
        (window as any).exitToMap();
        return;
      } else {
        state.level = 1;
        state.score = 0;
        progress.collectedScrolls = [];
        saveGame();
        (window as any).exitToMap();
        return;
      }
      init();
    };

    function processStep() {
      soundManager.play('step', 0.1);
    }


    // İlk sahneyi anında yükle (Siyah ekranı önlemek için)
    try {
      (window as any).showScene('splash-screen');
      (window as any).gameLog("Splash ekranı aktif.");
    } catch (e) { console.error(e); }

    createSplashRunes();
    createMapParticles();
    loadGame();
    setTimeout(() => {
      try {
        if (progress.maxUnlockedLevel === 1 && state.score === 0) {
          (window as any).showScene('splash-screen');
        } else {
          (window as any).showScene('map-screen');
          updateMapHUD();
        }
      } catch (e) { (window as any).gameLog("Hata: " + e); }

      const resume = () => { if (audioCtx) audioCtx.resume(); };
      document.addEventListener('mousedown', resume, { once: true });
      document.addEventListener('touchstart', resume, { once: true });
    }, 1500); // Reduced delay to avoid "black screen" confusion

    // window.showScene logic consolidated at the start of useEffect to prevent recursion


    const moveMap: Record<string, [number, number]> = { 'up': [0, -1], 'down': [0, 1], 'left': [-1, 0], 'right': [1, 0] };
    Object.keys(moveMap).forEach(id => {
      const btn = document.getElementById(id);
      if (btn) {
        btn.onmousedown = (e) => { e.preventDefault(); move(...moveMap[id]); };
        btn.ontouchstart = (e) => { e.preventDefault(); move(...moveMap[id]); };
      }
    });
    const flashBtn = document.getElementById('flash-btn');
    if (flashBtn) flashBtn.onclick = (window as any).triggerFlash;

    const handleMapMouseMove = (e: MouseEvent) => {
      const mapScreen = document.getElementById('map-screen');
      if (mapScreen && mapScreen.classList.contains('active')) {
        const x = e.clientX;
        const y = e.clientY;
        document.documentElement.style.setProperty('--mouse-x', `${x}px`);
        document.documentElement.style.setProperty('--mouse-y', `${y}px`);

        const xRatio = (x / window.innerWidth - 0.5) * 2;
        const yRatio = (y / window.innerHeight - 0.5) * 2;

        // Remove map movement so nodes are static on the parchment

        const mists = document.querySelectorAll('.map-mist');
        mists.forEach((mist, i) => {
          const depth = (i + 1) * 30;
          (mist as HTMLElement).style.marginLeft = `${xRatio * depth}px`;
          (mist as HTMLElement).style.marginTop = `${yRatio * depth}px`;
        });
      }
    };
    window.addEventListener('mousemove', handleMapMouseMove);

    window.onresize = resize;
    const updateInterval = setInterval(update, 30);
    const drawId = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener('mousemove', handleMapMouseMove);
      clearInterval(updateInterval);
      cancelAnimationFrame(drawId);
      window.onresize = null;
    };
  }, []);

  return (
    <div className="game-container">
      {/* Sahne 1: Splash Screen - Cinematic Experience */}
      <div id="splash-screen" className="scene active">
        <div className="splash-overlay"></div>
        <div className="splash-runes">
          <div className="floating-rune" style={{ top: '20%', left: '10%' }}>᚛</div>
          <div className="floating-rune" style={{ top: '60%', right: '15%' }}>ᚙ</div>
          <div className="floating-rune" style={{ bottom: '15%', left: '20%' }}>ᚚ</div>
          <div className="floating-rune" style={{ top: '30%', right: '25%' }}>ᚠ</div>
        </div>
        <div id="splash-content">
          <div className="splash-title-container">
            <h1 className="splash-title">Gölge Labirenti</h1>
            <div className="splash-subtitle">Karanlığın Derinliklerinde</div>
          </div>
          <button className="btn-start-game" onClick={() => {
            if (audioCtx) audioCtx.resume();
            if (soundManager) soundManager.play('collect', 0.8);
            (window as any).showScene('map-screen');
          }}>BAŞLA</button>
        </div>
      </div>

      <div className="mystic-header">
        <div className="header-glass-layer"></div>
        <div className="header-glow-line"></div>

        <div className="mystic-left">
          <div className="player-soul-plate">
            <div className="soul-avatar">
              <div className="avatar-ring"></div>
              <Shield size={20} color="var(--gold)" />
              <div className="soul-lvl" id="map-level-global">1</div>
            </div>
            <div className="soul-vitals">
              <div className="vital-row">
                <Zap size={10} color="#00ffcc" />
                <div className="vital-bar hp">
                  <div className="vital-fill" id="hp-bar-fill" style={{ width: '100%' }}></div>
                </div>
              </div>
              <div className="vital-row">
                <Sparkles size={10} color="var(--primary)" />
                <div className="vital-bar xp">
                  <div className="vital-fill" style={{ width: '65%' }}></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mystic-center">
          <div className="mystic-title-group">
            <h1 id="global-header-title">GÖLGE LABİRENTİ</h1>
            <div className="mystic-subtitle">
              <div className="line-accent"></div>
              <span id="global-header-subtitle">DERİNLİK 1</span>
              <div className="line-accent"></div>
            </div>
          </div>
        </div>

        <div className="mystic-right">
          <div className="mystic-stat">
            <div className="stat-label">TOPLANAN RUH</div>
            <div className="stat-value-group">
              <Sparkles size={14} color="var(--primary)" />
              <span id="map-score-global">0</span>
            </div>
          </div>
          <div className="mystic-divider"></div>
          <div className="mystic-system-status">
            <div className="status-indicator"></div>
            <span>KARARLI</span>
          </div>
        </div>
      </div>
      <div id="map-screen" className="scene">
        <div className="torchlight-overlay"></div>
        <div id="bag-btn-map" className="bag-btn-ui" onClick={() => (window as any).toggleInventory()}>💼</div>

        <div className="map-embers"></div>
        <div className="map-fog fog-back"></div>
        <div className="map-fog fog-front"></div>

        <div className="map-outer-frame"></div>
        <div className="map-sigils">
          <div className="map-sigil" style={{ top: '12%', left: '10%' }}>᚛</div>
          <div className="map-sigil" style={{ top: '38%', right: '12%' }}>ᚙ</div>
          <div className="map-sigil" style={{ bottom: '20%', left: '18%' }}>ᚚ</div>
          <div className="map-sigil" style={{ bottom: '35%', right: '22%' }}>ᚠ</div>
        </div>

        <div className="map-container">
          <div className="map-scroll-content">
            {/* SVG yollar ve rozet düğümler updateMapNodes ile eklenecek */}
          </div>
        </div>

        <div id="region-info-panel">
          <div className="region-panel-glow"></div>
          <div className="region-panel-border"></div>

          <div className="region-panel-header">
            <div className="region-type-badge" id="reg-info-type">BÖLGE</div>
            <div className="region-title" id="reg-info-title">Bölge Adı</div>
          </div>

          <div className="region-desc" id="reg-info-desc">Bölge açıklaması buraya gelecek...</div>

          <div className="region-stats-grid">
            <div className="region-stat-item">
              <div className="region-stat-label">ZORLUK</div>
              <div className="region-stat-value" id="reg-info-diff">Düşük</div>
              <div className="region-difficulty-bar"><div className="region-difficulty-fill" id="reg-info-diff-bar"></div></div>
            </div>
            <div className="region-stat-item">
              <div className="region-stat-label">YAZITLAR</div>
              <div className="region-stat-value" id="reg-info-scrolls">2</div>
            </div>
            <div className="region-stat-item">
              <div className="region-stat-label">ÖDÜL</div>
              <div className="region-stat-value" id="reg-info-reward">0</div>
            </div>
            <div className="region-stat-item">
              <div className="region-stat-label">GEREKEN</div>
              <div className="region-stat-value" id="reg-info-req-level">Seviye 1</div>
            </div>
          </div>

          <button className="btn-enter-region" id="btn-enter-region">BÖLGEYE GİR</button>
          <button className="btn-cancel-region" onClick={() => document.getElementById('region-info-panel')?.classList.remove('active')}>VAZGEÇ</button>
        </div>
      </div>

      <div id="door-scene" className="scene">
        <div className="btn-gate-back" onClick={() => (window as any).exitToMap()}>«</div>
        <p className="door-subtitle">Mühürlenmiş Kadim Geçit</p>

        <div className="gate-image-wrapper" id="gate-arch" onClick={() => (window as any).unlockGate()}>
          <div className="gate-arch-base"></div>
          <div className="torch-flame left-flame"></div>
          <div className="torch-flame right-flame"></div>
          <div className="door-3d-container">
            <div className="door-leaf left">
              <div className="door-texture"></div>
            </div>
            <div className="door-leaf right">
              <div className="door-texture"></div>
            </div>
          </div>
          <div className="portal-glow"></div>
          <div className="gate-overlay" id="gate-overlay"></div>
        </div>
        <p className="door-hint">KADİM MÜHRÜ ÇÖZMEK İÇİN DOKUN</p>
      </div>

      <div id="game-scene" className="scene">
        <div id="bag-btn-game" className="bag-btn-ui" onClick={() => (window as any).toggleInventory()}>💼</div>
        <div id="game-back-to-map-global" onClick={() => (window as any).exitToMap()} style={{ position: 'fixed', top: '110px', left: '20px', zIndex: 1000, background: 'rgba(0,0,0,0.5)', padding: '10px', borderRadius: '50%', cursor: 'pointer', color: 'var(--gold)', border: '1px solid var(--gold)' }}>◀</div>

        <div id="health-container"><div id="health-bar"></div></div>
        <div id="scroll-count">YAZITLAR: 0 / 1</div>
        <div id="zone-count">BÖLGE: 1 / 7</div>
        <div id="sanctuary-count">TAPINAK: 0 / 7</div>
        <div id="key-count">ANAHTAR: 0 / 7</div>
        <div id="fragment-count">PARÇA: 0</div>
        <div id="game-toast"></div>
        <div id="whisper-container"></div>
        <div id="viewport">
          <canvas id="gameCanvas"></canvas>
          <div id="vignette"></div>
          <div id="damage-overlay"></div>
        </div>
        <div id="ui-layer">
          <div className="left-controls">
            <div className="btn" id="up">▲</div>
            <div className="btn" id="down">▼</div>
          </div>
          <div className="right-controls">
            <div id="flash-btn" title="Işık Patlaması"><span>☀</span><div id="cd-timer"></div></div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <div className="btn" id="left">◀</div>
              <div className="btn" id="right">▶</div>
            </div>
          </div>
        </div>
      </div>

      <div id="inventory-panel">
        <div className="panel-header">
          <h2 style={{ margin: 0, color: 'var(--gold)', fontSize: '1.2rem', letterSpacing: '2px' }}>KADİM ÇANTA</h2>
          <button onClick={() => (window as any).toggleInventory()} style={{ background: 'none', border: '1px solid #444', color: '#fff', padding: '8px 15px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.7rem' }}>KAPAT</button>
        </div>
        <div className="tab-bar">
          <div className="tab-btn active" id="tab-shop-btn" onClick={() => (window as any).switchTab('shop')}>RUH MAĞAZASI</div>
          <div className="tab-btn" id="tab-inv-btn" onClick={() => (window as any).switchTab('inv')}>ENVANTER</div>
        </div>
        <div id="shop-content" className="tab-content active">
          <div className="currency-display">
            <div style={{ fontSize: '0.7rem', color: '#aaa', textTransform: 'uppercase', marginBottom: '5px' }}>Toplam Ruh Enerjisi</div>
            <div className="currency-value" id="inv-total-score">0</div>
          </div>
          <div className="shop-item">
            <div className="item-info"><h4>Ruh Kapasitesi</h4><p>Maksimum canı +25 artırır.</p></div>
            <button className="buy-btn" id="buy-hp" onClick={() => (window as any).buyUpgrade('hp')}>500 P</button>
          </div>
          <div className="shop-item">
            <div className="item-info"><h4>Odaklanmış Işık</h4><p>Aydınlatma alanını %15 büyütür.</p></div>
            <button className="buy-btn" id="buy-light" onClick={() => (window as any).buyUpgrade('light')}>800 P</button>
          </div>
          <div className="shop-item">
            <div className="item-info"><h4>Ruhun Sessizliği</h4><p>Yenilenme hızını %40 artırır.</p></div>
            <button className="buy-btn" id="buy-regen" onClick={() => (window as any).buyUpgrade('regen')}>1000 P</button>
          </div>
        </div>
        <div id="inv-content" className="tab-content">
          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
            <div className="stat-card" style={{ flex: 1, flexDirection: 'column', alignItems: 'flex-start' }}><i>CAN</i><span id="stat-hp" style={{ fontWeight: 'bold' }}>100</span></div>
            <div className="stat-card" style={{ flex: 1, flexDirection: 'column', alignItems: 'flex-start' }}><i>IŞIK</i><span id="stat-light" style={{ fontWeight: 'bold' }}>1.0x</span></div>
            <div className="stat-card" style={{ flex: 1, flexDirection: 'column', alignItems: 'flex-start' }}><i>RUH</i><span id="stat-regen" style={{ fontWeight: 'bold' }}>1.0x</span></div>
          </div>
          <div style={{ color: 'var(--gold)', fontSize: '0.7rem', letterSpacing: '2px', marginBottom: '15px', borderBottom: '1px solid #333', paddingBottom: '5px' }}>TOPLANAN YAZITLAR</div>
          <div id="collected-scrolls-list"></div>
        </div>
      </div>

      <div id="transition-whiteout"></div>

      <div id="story-panel">
        <div className="story-title">ANTİK KEHANET</div>
        <div id="story-content">...</div>
        <button onClick={() => (window as any).closeStory()} style={{ marginTop: '20px', background: 'none', border: '1px solid #a68b5e', color: '#a68b5e', padding: '5px 15px', cursor: 'pointer', fontFamily: 'serif' }}>KAPAT</button>
      </div>

      <div id="fragment-panel">
        <div className="story-title" id="fragment-title">PARÇA</div>
        <div id="fragment-content"></div>
        <div id="fragment-clue"></div>
        <button onClick={() => (window as any).closeFragment()} style={{ marginTop: '20px', background: 'none', border: '1px solid #c8a0ff', color: '#c8a0ff', padding: '5px 15px', cursor: 'pointer', fontFamily: 'serif' }}>KAPAT</button>
      </div>

      <div id="guide-panel">
        <div className="story-title">GÖLGE REHBER</div>
        <div id="guide-text"></div>
        <div style={{ display: 'flex', gap: '10px', marginTop: '20px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <button className="btn-action" onClick={() => (window as any).guideChoice('trust')}>GÜVEN</button>
          <button className="btn-action" onClick={() => (window as any).guideChoice('doubt')}>ŞÜPHELEN</button>
          <button className="btn-action" onClick={() => (window as any).guideChoice('attack')}>SALDIR</button>
        </div>
      </div>

      <div id="modal">
        <div className="modal-card">
          <h1 id="m-title" style={{ color: 'var(--danger)' }}>SON</h1>
          <p id="m-desc"></p>
          <button className="btn-action" onClick={() => (window as any).closeModal()}>DEVAM ET</button>
        </div>
      </div>
      <div id="debug-log" style={{ position: 'fixed', bottom: 0, left: 0, background: 'rgba(255,0,0,0.5)', color: 'white', fontSize: '10px', zIndex: 9999, pointerEvents: 'none' }}></div>
    </div>
  );
}
