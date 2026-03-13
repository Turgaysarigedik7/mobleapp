/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';

export default function App() {
  useEffect(() => {
    const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const vignette = document.getElementById('vignette');
    const runes = ["ᚠ", "ᚢ", "ᚦ", "ᚨ", "ᚱ", "ᚲ", "ᚷ", "ᚹ", "ᚺ", "ᚾ", "ᛟ", "ᛈ", "ᛉ", "ᛊ", "ᛏ", "ᛒ"];

    let progress = { charLevel: 1, maxHealth: 100, lightMod: 1.0, regenMod: 1.0, totalUpgrades: 0, maxUnlockedLevel: 1, collectedScrolls: [] as string[] };
    let state = { level: 1, score: 0, active: false, cd: false, gridSize: 15, cellSize: 70, scrollsRequired: 0, scrollsCollected: 0, shakeAmount: 0, guardianNear: false, flashActive: false, health: 100, takingDamage: false, inventoryOpen: false };

    let maze: number[][] = [];
    let trailMarks: { r: number, c: number, opacity: number, rune: string }[] = [];
    let player = { x: 1, y: 1, sx: 1, sy: 1, dir: { x: 0, y: 1 } };
    let guardian = { x: 0, y: 0, sx: 0, sy: 0, stunned: 0, wait: 0, speed: 18 };
    let exit = { x: 0, y: 0 };
    let crystals: { x: number, y: number, active: boolean }[] = [], scrolls: { x: number, y: number, active: boolean, text: string }[] = [], camera = { x: 0, y: 0 };

    const texts = [
      "Güneşin terk ettiği bu topraklarda, yalnızca kendi içindeki ışığa güvenebilirsin.",
      "Gölge Yiyen, isimsiz bir açlıktır. O, yalnızca etini değil, hatıralarını da tüketir.",
      "Bu dehlizlerin mimarı, çıkışın anahtarını kelimelerin arasına gizledi.",
      "Ruhun zayıfladığında fenerinin yağı titrer. Mavi kristaller saf iradedir.",
      "Gözlerini kapattığında duyduğun fısıltılar, senden öncekilerin son vasiyetleridir.",
      "Derinlik arttıkça zamanın anlamı yiter. Hızlı ol."
    ];

    function showScene(sceneId: string) {
      document.querySelectorAll('.scene').forEach(s => s.classList.remove('active'));
      const scene = document.getElementById(sceneId);

      const globalTitle = document.getElementById('global-header-title');
      const globalSubtitle = document.getElementById('global-header-subtitle');

      if (scene) {
        scene.classList.add('active');

        // Update Global Header Title based on scene
        if (globalTitle && globalSubtitle) {
          if (sceneId === 'splash-screen') {
            globalTitle.innerText = "Gölge Labirenti";
            globalSubtitle.innerText = "Karanlığın Derinlikleri";
          } else if (sceneId === 'map-screen') {
            globalTitle.innerText = "Kadim Harita";
            globalSubtitle.innerText = "Gölge Diyarı";
          } else if (sceneId === 'door-scene') {
            globalTitle.innerText = "Mühürlü Kapı";
            globalSubtitle.innerText = "Bölge Geçidi";
          } else if (sceneId === 'game-scene') {
            globalTitle.innerText = "Gölge Labirenti";
            globalSubtitle.innerText = `${state.level}. Derinlik`;
          }
        }

        if (sceneId === 'map-screen') {
          updateMapHUD();
          const container = scene.querySelector('.map-container');
          if (container) {
            // Find current active region position
            const activeRegion = regionData.find(r => r.id === progress.maxUnlockedLevel);
            if (activeRegion) {
              const topVal = parseFloat(activeRegion.top); // e.g., 85
              setTimeout(() => {
                // Total map height is 1400px as defined in CSS
                const targetY = (topVal / 100) * 1400 - (window.innerHeight / 2);
                container.scrollTo({ top: targetY, behavior: 'smooth' });
              }, 100);
            } else {
              // Fallback to bottom if for some reason we don't find it
              setTimeout(() => {
                container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
              }, 100);
            }
          }
        }
      }
    }

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
      { id: 1, name: "Kayıp Giriş", desc: "Güneşin son ışıklarının veda ettiği, kadim labirentin ağzı. Burası sadece bir başlangıç.", difficulty: "Düşük", scrolls: 2, icon: SVGS.flame, top: '85%', left: '40%' },
      { id: 2, name: "Katakomplar", desc: "Sessizliğin hüküm sürdüğü, unutulmuş kralların mezarları. Gölgeler burada daha aç.", difficulty: "Orta", scrolls: 4, icon: SVGS.skull, top: '55%', left: '65%' },
      { id: 3, name: "Derinlikler", desc: "Zamanın ve mekanın büküldüğü, karanlığın kalbi. Geri dönüşü olmayan yol.", difficulty: "Yüksek", scrolls: 6, icon: SVGS.swords, top: '25%', left: '35%' },
      { id: 4, name: "Unutulmuş Bahçe", desc: "Zehirli bitkilerin ve eski tanrıların fısıltılarının yankılandığı yer.", difficulty: "Yüksek", scrolls: 8, icon: SVGS.leaf, top: '70%', left: '75%' },
      { id: 5, name: "Fısıltı Mağarası", desc: "Seslerin yankı yapmadığı, sadece zihnindeki korkuların konuştuğu bir mağara.", difficulty: "Çok Yüksek", scrolls: 10, icon: SVGS.ghost, top: '40%', left: '20%' },
      { id: 6, name: "Karanlık Taht", desc: "Gölge Yiyen'in taht odası. Nihai son burada bekliyor.", difficulty: "Efsanevi", scrolls: 12, icon: SVGS.crown, top: '10%', left: '60%' }
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

      if (title) title.innerText = data.name;
      if (desc) desc.innerText = data.desc;
      if (diff) diff.innerText = data.difficulty;
      if (scrolls) scrolls.innerText = data.scrolls.toString();

      infoPanel.classList.add('active');

      const enterBtn = document.getElementById('btn-enter-region');
      if (enterBtn) {
        enterBtn.onclick = () => (window as any).prepareGateTransition(id);
      }
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

      let svgHtml = `
      <svg id="magic-paths" viewBox="0 0 100 100" preserveAspectRatio="none" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 5; overflow: visible;">
        <defs>
          <linearGradient id="gold-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="rgba(255,204,0,0.1)" />
            <stop offset="50%" stop-color="rgba(255,204,0,0.8)" />
            <stop offset="100%" stop-color="rgba(255,204,0,0.1)" />
          </linearGradient>
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

          const cx1 = x1 + (x2 - x1) * 0.2;
          const cy1 = y1 + (y2 - y1) * 0.8;
          const cx2 = x1 + (x2 - x1) * 0.8;
          const cy2 = y1 + (y2 - y1) * 0.2;

          const stroke = isUnlocked ? 'url(#gold-gradient)' : 'rgba(80, 50, 30, 0.5)';
          const width = isUnlocked ? '0.4' : '0.2';
          const extraClass = isUnlocked ? 'active-path' : '';
          svgHtml += `<path d="M${x1} ${y1} C${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}" stroke="${stroke}" stroke-width="${width}" fill="none" class="${extraClass}" stroke-dasharray="2 1"></path>`;
        }
      });
      svgHtml += `</svg>`;

      content.innerHTML = svgHtml + '<div id="nodes-container" style="position: absolute; inset: 0; z-index: 10; width: 100%; height: 100%;"></div>';
      const nodesContainer = content.querySelector('#nodes-container');

      if (!nodesContainer) return;

      regionData.forEach(region => {
        const node = document.createElement('div');
        const isUnlocked = region.id <= progress.maxUnlockedLevel;
        node.className = `map-node ${isUnlocked ? 'active' : 'locked'}`;
        node.style.top = region.top;
        node.style.left = region.left;

        if (isUnlocked) {
          node.onclick = () => (window as any).selectRegion(region.id);
          node.onmouseenter = () => {
            // Sparkles removed for performance
          };
        }

        node.innerHTML = `
                <div class="node-icon" style="color: ${isUnlocked ? 'var(--gold)' : '#555'}">${region.icon}</div>
                <div class="node-label"><i>${region.name}</i></div>
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
      state.gridSize = 13 + (state.level * 2);
      state.scrollsRequired = Math.min(2 + Math.floor(state.level / 2), 5);
      state.scrollsCollected = 0;
      trailMarks = [];
      updateScrollHUD();
      generateMaze();
      exit = { x: state.gridSize - 2, y: state.gridSize - 2 };
      player = { x: 1, y: 1, sx: 1, sy: 1, dir: { x: 0, y: 1 } };
      guardian = { x: state.gridSize - 2, y: 1, sx: state.gridSize - 2, sy: 1, stunned: 0, wait: 0, speed: Math.max(4, 18 - state.level) };
      spawnObjects();
      resize();
      state.active = true;
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
        if (type === 'light') progress.lightMod += 0.15;
        if (type === 'regen') progress.regenMod += 0.4;
        progress.charLevel = 1 + Math.floor(progress.totalUpgrades / 2);
        state.health = progress.maxHealth;
        updateInventoryUI(); updateHealthUI();
        const scoreVal = document.getElementById('map-score-global');
        const charLvlVal = document.getElementById('map-level-global');
        if (scoreVal) scoreVal.innerText = state.score.toString();
        if (charLvlVal) charLvlVal.innerText = progress.charLevel.toString();
      }
    };

    function generateMaze() {
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

    function updateScrollHUD() {
      const scrollCount = document.getElementById('scroll-count');
      if (scrollCount) scrollCount.innerText = `YAZITLAR: ${state.scrollsCollected} / ${state.scrollsRequired}`;
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
      const baseRadius = (30 + 150 * healthMod * progress.lightMod);

      ctx.save(); ctx.translate(-camera.x, -camera.y);
      for (let r = 0; r < state.gridSize; r++) {
        for (let c = 0; c < state.gridSize; c++) {
          const x = c * state.cellSize, y = r * state.cellSize;
          const dx = (x + state.cellSize / 2) - (player.sx * state.cellSize + state.cellSize / 2);
          const dy = (y + state.cellSize / 2) - (player.sy * state.cellSize + state.cellSize / 2);
          const distToPlayer = Math.sqrt(dx * dx + dy * dy);
          const visibility = Math.max(0, 1 - (distToPlayer / (baseRadius * 1.5)));
          if (visibility > 0) {
            if (maze[r][c] === 1) {
              ctx.fillStyle = `rgba(30, 30, 50, ${visibility})`; ctx.fillRect(x, y, state.cellSize, state.cellSize);
              const mark = trailMarks.find(m => m.r === r && m.c === c);
              if (mark && mark.opacity > 0) {
                ctx.fillStyle = `rgba(0, 242, 255, ${mark.opacity * visibility})`;
                ctx.font = `${state.cellSize / 2.5}px serif`; ctx.textAlign = "center";
                ctx.fillText(mark.rune, x + state.cellSize / 2, y + state.cellSize / 1.5);
                mark.opacity -= 0.005;
              }
            } else { ctx.fillStyle = `rgba(10, 10, 15, ${visibility})`; ctx.fillRect(x, y, state.cellSize, state.cellSize); }
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

      if (state.scrollsCollected >= state.scrollsRequired) {
        const dist = Math.hypot(exit.x - player.sx, exit.y - player.sy) * state.cellSize;
        ctx.fillStyle = `rgba(255, 204, 0, ${Math.max(0.2, 1 - (dist / (baseRadius * 3)))})`;
        ctx.beginPath(); ctx.arc(exit.x * state.cellSize + state.cellSize / 2, exit.y * state.cellSize + state.cellSize / 2, state.cellSize / 3.5, 0, Math.PI * 2); ctx.fill();
      }

      guardian.sx += (guardian.x - guardian.sx) * 0.1; guardian.sy += (guardian.y - guardian.sy) * 0.1;
      const distG = Math.hypot(guardian.sx - player.sx, guardian.sy - player.sy) * state.cellSize;
      if (distG < baseRadius * 2.5) {
        ctx.fillStyle = `rgba(255, 0, 76, ${Math.max(0.1, 1 - (distG / (baseRadius * 2.5)))})`;
        ctx.beginPath(); ctx.arc(guardian.sx * state.cellSize + state.cellSize / 2, guardian.sy * state.cellSize + state.cellSize / 2, state.cellSize / 2.2, 0, Math.PI * 2); ctx.fill();
      }

      player.sx += (player.x - player.sx) * 0.2; player.sy += (player.y - player.sy) * 0.2;
      ctx.fillStyle = state.takingDamage ? '#ff004c' : `rgba(255, 255, 255, ${0.4 + 0.6 * healthMod})`;
      ctx.beginPath(); ctx.arc(player.sx * state.cellSize + state.cellSize / 2, player.sy * state.cellSize + state.cellSize / 2, state.cellSize / 5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      const finalRadius = baseRadius;
      const beamX = lx + player.dir.x * (finalRadius * 0.4);
      const beamY = ly + player.dir.y * (finalRadius * 0.4);

      if (vignette) {
        if (state.flashActive) {
          vignette.style.background = `radial-gradient(circle 1200px at ${lx}px ${ly}px, rgba(255, 255, 255, 0.15) 0%, rgba(0,0,0,0.9) 70%, black 100%)`;
        } else {
          vignette.style.background = `
                    radial-gradient(circle ${finalRadius * 1.8}px at ${beamX}px ${beamY}px, rgba(255, 255, 240, 0.1) 0%, transparent 80%),
                    radial-gradient(circle ${finalRadius}px at ${lx}px ${ly}px, rgba(255, 255, 255, 0.05) 0%, rgba(0,0,0,1) 90%, black 100%)
                `;
        }
      }

      const viewport = document.getElementById('viewport');
      if (viewport) {
        if (state.shakeAmount > 0) { viewport.classList.add('hard-shaking'); state.shakeAmount--; }
        else if (state.takingDamage) viewport.classList.add('hard-shaking');
        else if (state.guardianNear) viewport.classList.add('shaking');
        else viewport.classList.remove('shaking', 'hard-shaking');
      }

      requestAnimationFrame(draw);
    }

    function update() {
      if (!state.active) return;
      if (guardian.stunned > 0) guardian.stunned--;
      else {
        guardian.wait++;
        if (guardian.wait >= guardian.speed) {
          guardian.wait = 0;
          const dx = player.x - guardian.x, dy = player.y - guardian.y;
          let nx = guardian.x, ny = guardian.y;
          if (Math.abs(dx) > Math.abs(dy)) nx += Math.sign(dx); else ny += Math.sign(dy);
          if (maze[ny][nx] === 0) { guardian.x = nx; guardian.y = ny; }
        }
      }

      const dirs = [{ x: 0, y: 1 }, { x: 0, y: -1 }, { x: 1, y: 0 }, { x: -1, y: 0 }];
      dirs.forEach(d => {
        const wx = player.x + d.x, wy = player.y + d.y;
        if (maze[wy]?.[wx] === 1) {
          let mark = trailMarks.find(m => m.r === wy && m.c === wx);
          if (!mark) trailMarks.push({ r: wy, c: wx, opacity: 0.8, rune: runes[Math.floor(Math.random() * runes.length)] });
          else mark.opacity = 0.8;
        }
      });

      const distToG = Math.hypot(guardian.x - player.x, guardian.y - player.y);
      state.guardianNear = (distToG < 4);

      if (distToG < 0.7 && guardian.stunned === 0) {
        state.takingDamage = true; state.health -= 2.0;
        const damageOverlay = document.getElementById('damage-overlay');
        if (damageOverlay) damageOverlay.style.opacity = "1";
        updateHealthUI();
        if (state.health <= 0) showModal("RUHUN TÜKENDİ", "Gölge Yiyen ruhunu tamamen çekti...");
      } else {
        state.takingDamage = false;
        const damageOverlay = document.getElementById('damage-overlay');
        if (damageOverlay) damageOverlay.style.opacity = "0";
        if (state.health < progress.maxHealth && distToG > 5) {
          state.health = Math.min(progress.maxHealth, state.health + (0.1 * progress.regenMod)); updateHealthUI();
        }
      }

      scrolls.forEach(s => { if (s.active && s.x === player.x && s.y === player.y) { s.active = false; state.scrollsCollected++; state.score += 500; progress.collectedScrolls.push(s.text); updateScrollHUD(); (window as any).showStory(s.text); const scoreVal = document.getElementById('map-score-global'); if (scoreVal) scoreVal.innerText = state.score.toString(); } });
      crystals.forEach(c => { if (c.active && c.x === player.x && c.y === player.y) { c.active = false; state.score += 100; const scoreVal = document.getElementById('map-score-global'); if (scoreVal) scoreVal.innerText = state.score.toString(); } });

      if (state.scrollsCollected >= state.scrollsRequired && player.x === exit.x && player.y === exit.y) showModal("DERİNLERE İNİŞ", "Ruhun bir sonraki katman için hazır.");
    }

    (window as any).showStory = function (txt: string) { state.active = false; const storyPanel = document.getElementById('story-panel'); if (storyPanel) { storyPanel.style.display = 'block'; const storyContent = document.getElementById('story-content'); if (storyContent) storyContent.innerText = txt; } };
    (window as any).closeStory = function () { const storyPanel = document.getElementById('story-panel'); if (storyPanel) storyPanel.style.display = 'none'; state.active = true; };
    function move(dx: number, dy: number) { if (!state.active) return; player.dir = { x: dx, y: dy }; const nx = player.x + dx, ny = player.y + dy; if (maze[ny]?.[nx] === 0) { player.x = nx; player.y = ny; } }

    (window as any).triggerFlash = function () {
      if (state.cd || !state.active) return;
      state.cd = true; state.flashActive = true; setTimeout(() => state.flashActive = false, 600);
      if (Math.hypot(player.x - guardian.x, player.y - guardian.y) < 5) { guardian.stunned = 160; state.shakeAmount = 40; }
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
        }
        if (state.level > 6) {
          showModal("NİHAİ ZAFER", "Gölge Labirenti'nin tüm sırlarını çözdün. Karanlık artık senden korkuyor.");
          state.level = 1;
          return;
        }
      } else if (titleText === "NİHAİ ZAFER") {
        state.level = 1;
        state.score = 0;
        progress.maxUnlockedLevel = 1;
        progress.collectedScrolls = [];
        (window as any).exitToMap();
        return;
      } else {
        state.level = 1;
        state.score = 0;
        progress.collectedScrolls = [];
        (window as any).exitToMap();
        return;
      }
      init();
    };

    createSplashRunes();
    createMapParticles();
    setTimeout(() => { showScene('map-screen'); updateMapHUD(); }, 5200);

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
          <button className="btn-start-game" onClick={() => (window as any).showScene('map-screen')}>BAŞLA</button>
        </div>
      </div>

      {/* GLOBAL PREMIUM HEADER - Visible on all screens */}
      <div className="premium-header">
        <div className="header-section left-panel-header">
          <div className="header-stat-group">
            <span className="header-stat-label">RUH ENERJİSİ</span>
            <div className="header-stat-value">
              <i>✧</i> <span id="map-score-global">0</span>
            </div>
          </div>
          <div className="header-stat-group">
            <span className="header-stat-label">KADEME</span>
            <div className="header-stat-value">
              <i>◈</i> <span id="map-level-global">1</span>
            </div>
          </div>
        </div>

        <div className="header-center">
          <div className="header-title-box">
            <h1 className="header-main-title" id="global-header-title">Gölge Labirenti</h1>
            <div className="header-subtitle" id="global-header-subtitle">Karanlığın Derinlikleri</div>
          </div>
        </div>

        <div className="header-section right-panel-header">
          <div className="header-stat-group" style={{ alignItems: 'flex-end' }}>
            <span className="header-stat-label">SİSTEM</span>
            <div className="header-stat-value" style={{ fontSize: '0.7rem', color: 'var(--primary)', letterSpacing: '2px' }}>
              AKTİF
            </div>
          </div>
        </div>
      </div>

      <div id="map-screen" className="scene">
        <div className="torchlight-overlay"></div>
        <div id="bag-btn-map" className="bag-btn-ui" onClick={() => (window as any).toggleInventory()} style={{ position: 'absolute', top: '20px', right: '20px' }}>💼</div>
        <div className="map-mist"></div>
        <div className="map-mist mist-2"></div>
        <div className="arch-overlay"></div>
        <div className="pillar-decor"></div>
        <div className="pillar-decor right"></div>
        <div className="corner-ornament corner-tl"></div>
        <div className="corner-ornament corner-tr"></div>
        <div className="corner-ornament corner-bl"></div>
        <div className="corner-ornament corner-br"></div>


        <div className="map-container">
          <div className="moss" style={{ top: '20%', left: '10%', width: '150px', height: '150px' }}></div>
          <div className="moss" style={{ top: '60%', right: '5%', width: '200px', height: '200px' }}></div>
          <div className="moss" style={{ bottom: '10%', left: '20%', width: '120px', height: '120px' }}></div>

          <div className="map-crack" style={{ top: '30%', left: '40%', height: '150px', transform: 'rotate(20deg)' }}></div>
          <div className="map-crack" style={{ top: '70%', right: '30%', height: '200px', transform: 'rotate(-45deg)' }}></div>
          <div className="map-crack" style={{ top: '10%', right: '10%', height: '100px', transform: 'rotate(10deg)' }}></div>

          <div className="rune-float" style={{ top: '15%', left: '15%', animationDelay: '0s' }}>᚛</div>
          <div className="rune-float" style={{ top: '45%', right: '15%', animationDelay: '2s' }}>ᚙ</div>
          <div className="rune-float" style={{ bottom: '25%', left: '25%', animationDelay: '4s' }}>ᚚ</div>

          <div className="map-scroll-content">
            {/* SVG ve dairesel nodelar UpdateMapNodes ile eklenecek */}
          </div>
        </div>

        <div id="region-info-panel">
          <div className="region-title" id="reg-info-title">Bölge Adı</div>
          <div className="region-desc" id="reg-info-desc">Bölge açıklaması buraya gelecek...</div>

          <div className="region-stats">
            <div className="region-stat-item">
              <div className="region-stat-label">ZORLUK</div>
              <div className="region-stat-value" id="reg-info-diff">Düşük</div>
            </div>
            <div className="region-stat-item">
              <div className="region-stat-label">YAZITLAR</div>
              <div className="region-stat-value" id="reg-info-scrolls">2</div>
            </div>
            <div className="region-stat-item">
              <div className="region-stat-label">DURUM</div>
              <div className="region-stat-value" style={{ color: 'var(--primary)' }}>AÇIK</div>
            </div>
          </div>

          <button className="btn-enter-region" id="btn-enter-region">BÖLGEYE GİR</button>
          <button onClick={() => document.getElementById('region-info-panel')?.classList.remove('active')} style={{ width: '100%', background: 'none', border: 'none', color: '#444', fontSize: '0.7rem', marginTop: '15px', letterSpacing: '2px' }}>VAZGEÇ</button>
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
        <div id="scroll-count">YAZITLAR: 0 / 2</div>
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
            <div id="flash-btn"><span>⚡</span><div id="cd-timer"></div></div>
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

      <div id="modal">
        <div className="modal-card">
          <h1 id="m-title" style={{ color: 'var(--danger)' }}>SON</h1>
          <p id="m-desc"></p>
          <button className="btn-action" onClick={() => (window as any).closeModal()}>DEVAM ET</button>
        </div>
      </div>
    </div>
  );
}
