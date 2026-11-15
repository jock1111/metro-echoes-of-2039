// All DOM UI: HUD, menus, inventory, dialogue, notes, toasts.
const $ = (id) => document.getElementById(id);

export class UI {
  constructor(G) {
    this.G = G;
    this.hintT = 0;
    this.subtitleT = 0;
    this.toastT = 0;
    this.pickupT = 0;
    this.damageK = 0;
    this._objective = '';
    this.els = {};
    for (const id of ['hud', 'main-menu', 'pause-menu', 'settings-menu', 'loading-screen', 'death-screen',
      'complete-screen', 'exit-screen', 'dialogue-box', 'note-reader', 'inventory-screen', 'mask-overlay',
      'objective-text', 'objective-toast', 'interaction-prompt', 'interaction-text', 'health-fill', 'health-num',
      'rad-fill', 'geiger-lamp', 'ammo-mag', 'ammo-reserve', 'ammo-wrap', 'weapon-name', 'fire-mode',
      'filter-wrap', 'filter-timer', 'battery-fill', 'subtitle-box', 'subtitle-speaker', 'subtitle-text',
      'pickup-toast', 'hint-toast', 'dialogue-speaker', 'dialogue-text', 'note-title', 'note-body',
      'inv-grid', 'loading-fill', 'loading-tip', 'death-cause', 'complete-stats', 'damage-vignette',
      'rad-overlay', 'fade-overlay', 'crosshair', 'hitmarker', 'btn-continue']) this.els[id] = $(id);
    this._invOpen = false;
  }

  show(id) { this.els[id]?.classList.remove('hidden'); }
  hide(id) { this.els[id]?.classList.add('hidden'); }
  hideMenus() {
    for (const id of ['main-menu', 'pause-menu', 'settings-menu', 'loading-screen', 'death-screen', 'complete-screen', 'exit-screen']) this.hide(id);
  }

  // ---------- HUD ----------
  setHUDVisible(v) { v ? this.show('hud') : this.hide('hud'); }
  setAmmo(mag, reserve, def) {
    this.els['ammo-mag'].textContent = mag;
    this.els['ammo-reserve'].textContent = reserve;
    this.els['ammo-wrap'].classList.toggle('low', mag <= def.magSize * 0.25);
  }
  setWeapon(def) {
    this.els['weapon-name'].textContent = def.name;
    this.els['fire-mode'].textContent = def.mode;
  }
  setHealth(hp) {
    this.els['health-fill'].style.width = `${hp}%`;
    this.els['health-num'].textContent = Math.ceil(hp);
  }
  setFilter(time, maskOn) {
    this.els['filter-wrap'].classList.toggle('hidden', !maskOn);
    if (maskOn) {
      const m = Math.floor(time / 60), s = Math.floor(time % 60);
      this.els['filter-timer'].textContent = `${m}:${String(s).padStart(2, '0')}`;
      this.els['filter-wrap'].classList.toggle('urgent', time < 20);
    }
  }
  setBattery(pct) { this.els['battery-fill'].style.width = `${pct}%`; }
  setRad(rate) {
    this.els['rad-fill'].style.width = `${Math.min(100, rate * 11)}%`;
    this.els['rad-overlay'].style.opacity = Math.min(0.8, rate * 0.07);
  }
  geigerTick() {
    this.els['geiger-lamp'].classList.add('tick');
    setTimeout(() => this.els['geiger-lamp'].classList.remove('tick'), 60);
  }
  setCrosshairSpread(px, ads) {
    this.els['crosshair'].style.setProperty('--spread', `${Math.max(3, Math.min(30, px))}px`);
    this.els['crosshair'].classList.toggle('ads', ads);
  }
  hitmarker(kill) {
    const h = this.els['hitmarker'];
    h.classList.remove('fade'); h.classList.add('show');
    h.classList.toggle('kill', !!kill);
    clearTimeout(this._hmT);
    this._hmT = setTimeout(() => { h.classList.remove('show'); h.classList.add('fade'); }, 90);
  }
  flashDamage(k) { this.damageK = Math.max(this.damageK, k); }
  setMask(on) {
    this.els['mask-overlay'].classList.toggle('hidden', !on);
    requestAnimationFrame(() => this.els['mask-overlay'].classList.toggle('on', on));
  }
  setInteraction(text) {
    if (text) { this.els['interaction-text'].textContent = text; this.show('interaction-prompt'); }
    else this.hide('interaction-prompt');
  }
  setObjective(text) {
    if (text === this._objective) return;
    this._objective = text;
    this.els['objective-text'].textContent = text;
    this.els['objective-toast'].textContent = '— OBJECTIVE UPDATED —';
    this.show('objective-toast');
    this.toastT = 3;
  }
  hint(text, dur = 3.5) {
    this.els['hint-toast'].textContent = text;
    this.show('hint-toast');
    this.hintT = dur;
  }
  pickupToast(text) {
    this.els['pickup-toast'].textContent = text;
    this.show('pickup-toast');
    this.pickupT = 2.5;
  }
  subtitle(speaker, text, dur = 3) {
    this.els['subtitle-speaker'].textContent = speaker ? speaker + ':' : '';
    this.els['subtitle-text'].textContent = text;
    this.show('subtitle-box');
    this.subtitleT = dur;
  }

  // ---------- dialogue ----------
  showDialogue(speaker, text) {
    this.els['dialogue-speaker'].textContent = speaker.toUpperCase();
    this.els['dialogue-text'].textContent = text;
    this.show('dialogue-box');
  }
  hideDialogue() { this.hide('dialogue-box'); }

  // ---------- notes ----------
  showNote(title, body) {
    this.els['note-title'].textContent = title;
    this.els['note-body'].textContent = body;
    this.show('note-reader');
  }
  hideNote() { this.hide('note-reader'); }

  // ---------- inventory ----------
  get invOpen() { return this._invOpen; }
  openInventory() {
    this._invOpen = true;
    this.renderInventory();
    this.show('inventory-screen');
  }
  closeInventory() { this._invOpen = false; this.hide('inventory-screen'); }
  renderInventory() {
    const p = this.G.player;
    const items = [
      { key: 'pistolAmmo', icon: '▪', name: 'Pistol rounds', count: p.inv.pistolAmmo, use: false },
      { key: 'rifleAmmo', icon: '▮', name: 'Rifle rounds', count: p.inv.rifleAmmo, use: false },
      { key: 'medkit', icon: '✚', name: 'Medkit (+55 HP)', count: p.inv.medkit, use: true, fn: () => p.useMedkit() },
      { key: 'filter', icon: '◔', name: 'Mask filter (90s)', count: p.inv.filter, use: true, fn: () => p.useFilter() },
      { key: 'battery', icon: '▯', name: 'Battery (+65%)', count: p.inv.battery, use: true, fn: () => p.useBattery() },
      { key: 'fuel', icon: '⛽', name: 'Diesel canister', count: p.inv.fuel, use: false },
    ];
    const grid = this.els['inv-grid'];
    grid.innerHTML = '';
    for (const it of items) {
      const d = document.createElement('div');
      d.className = 'inv-slot' + (it.count === 0 ? ' empty' : '');
      d.innerHTML = `<span class="inv-count">${it.count}</span><span class="inv-icon">${it.icon}</span><span class="inv-name">${it.name}</span>${it.use && it.count > 0 ? '<span class="inv-use">USE</span>' : ''}`;
      if (it.use && it.count > 0) {
        d.addEventListener('click', () => {
          if (it.fn()) { this.renderInventory(); this.G.audio.play('ui_click', { vol: 0.6 }); }
        });
      }
      grid.appendChild(d);
    }
  }

  // ---------- screens ----------
  setLoading(k, tip) {
    this.els['loading-fill'].style.width = `${Math.round(k * 100)}%`;
    if (tip) this.els['loading-tip'].textContent = tip;
  }
  showDeath(cause) {
    this.els['death-cause'].textContent = cause;
    this.show('death-screen');
  }
  showComplete(stats) {
    const acc = stats.shots > 0 ? Math.round((stats.hits / stats.shots) * 100) : 0;
    const m = Math.floor(stats.time / 60), s = Math.floor(stats.time % 60);
    this.els['complete-stats'].innerHTML =
      `TIME &nbsp;${m}:${String(s).padStart(2, '0')}<br>` +
      `SHOTS FIRED &nbsp;${stats.shots} &nbsp;·&nbsp; ACCURACY &nbsp;${acc}%<br>` +
      `HOSTILES DOWN &nbsp;${stats.kills}<br>` +
      `SUPPLIES FOUND &nbsp;${stats.loot}`;
    this.show('complete-screen');
  }
  fade(on) { this.els['fade-overlay'].classList.toggle('on', on); }

  update(dt) {
    if (this.hintT > 0) { this.hintT -= dt; if (this.hintT <= 0) this.hide('hint-toast'); }
    if (this.subtitleT > 0) { this.subtitleT -= dt; if (this.subtitleT <= 0) this.hide('subtitle-box'); }
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.hide('objective-toast'); }
    if (this.pickupT > 0) { this.pickupT -= dt; if (this.pickupT <= 0) this.hide('pickup-toast'); }
    if (this.damageK > 0) {
      this.damageK = Math.max(0, this.damageK - dt * 1.8);
      this.els['damage-vignette'].style.opacity = this.damageK;
    }
    const p = this.G.player;
    if (p && this.G.state === 'playing') {
      const lowHp = p.hp < 30 ? 0.25 + Math.sin(this.G.engine.elapsed * 4) * 0.1 : 0;
      if (lowHp > 0 && this.damageK <= 0) this.els['damage-vignette'].style.opacity = lowHp;
      else if (this.damageK <= 0) this.els['damage-vignette'].style.opacity = 0;
    }
  }
}