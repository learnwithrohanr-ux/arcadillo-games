
class Component {
  constructor(props) {
    this.props = props || {};
    this.stageRef = { current: null };
    this.games = this.buildGames();
    this.state = {
      route: (typeof location !== 'undefined' && location.hash) || '#/',
      theme: this.props.defaultTheme || 'dark',
      query: '', cat: 'All', sort: 'Popular',
      menuOpen: false, favs: [], recents: [], scores: {},
      score: 0, status: 'ready', overMsg: '', soundOn: true,
      copied: false, contactNotice: false,
      diff: 'Normal', twoPlayer: false, showPad: false,
      badges: [], streak: 0, played: {}, newBadge: ''
    };
    this.ctl = null;
    this.mountedId = null;
    this._lastRoute = this.state.route;
    this._speedy = false;
    this.speedScale = 1;
  }

  setState(patch) {
    this.state = Object.assign({}, this.state, patch || {});
  }


  /* ---------- storage ---------- */
  read(key, dflt) {
    try { const v = localStorage.getItem('arcadillo_' + key); return v ? JSON.parse(v) : dflt; }
    catch (e) { return dflt; }
  }
  write(key, val) {
    try { localStorage.setItem('arcadillo_' + key, JSON.stringify(val)); } catch (e) {}
  }

  componentDidMount() {
    const theme = this.read('theme', this.props.defaultTheme || 'dark');
    this.setState({
      theme: theme === 'light' ? 'light' : 'dark',
      favs: this.read('favorites', []) || [],
      recents: this.read('recent_games', []) || [],
      scores: this.read('scores', {}) || {},
      soundOn: this.read('sound', true) !== false,
      diff: this.read('difficulty', 'Normal') || 'Normal',
      badges: this.read('badges', []) || [],
      played: this.read('played', {}) || {},
      streak: this.dailyStreak(),
      showPad: (typeof matchMedia !== 'undefined' && matchMedia('(hover: none)').matches)
    });
    this.onHash = () => this.setState({ route: location.hash || '#/', menuOpen: false, copied: false });
    window.addEventListener('hashchange', this.onHash);
    try {
      if (!document.querySelector('title')) {
        const t = document.createElement('title');
        t.textContent = this.brand();
        document.head.appendChild(t);
      }
      if (!document.querySelector('meta[name="description"]')) {
        const m = document.createElement('meta');
        m.setAttribute('name', 'description');
        m.setAttribute('content', 'Free original browser games at ' + this.brand() + '.');
        document.head.appendChild(m);
      }
    } catch (e) {}
    this.syncMeta();
    this.syncGame();
    this.stageTimer = setInterval(() => this.syncGame(), 1500);
  }
  componentWillUnmount() {
    window.removeEventListener('hashchange', this.onHash);
    if (this.stageTimer) clearInterval(this.stageTimer);
    this.destroyGame();
  }
  componentDidUpdate() {
    if (this._lastRoute !== this.state.route) {
      this._lastRoute = this.state.route;
      try { window.scrollTo(0, 0); } catch (e) {}
    }
    this.syncGame();
    this.syncMeta();
  }

  syncMeta() {
    try {
      const g = this.currentGame();
      const title = g ? g.name + ' — Play free online | ' + this.brand()
        : this.brand() + ' — Free original browser games';
      if (document.title !== title) document.title = title;
      const m = document.querySelector('meta[name="description"]');
      if (m && g) m.setAttribute('content', g.blurb + ' Play ' + g.name + ' free in your browser, no download.');
    } catch (e) {}
  }

  brand() { return this.props.brandName || 'Arcadillo'; }

  /* ---------- routing ---------- */
  route() { return (this.state.route || '#/').replace(/^#/, '') || '/'; }
  currentGame() {
    const m = this.route().match(/^\/game\/([a-z0-9-]+)$/i);
    if (!m) return null;
    return this.games.find(g => g.id === m[1]) || null;
  }
  routeKind() {
    const r = this.route();
    if (r === '/' || r === '') return 'home';
    if (this.currentGame()) return 'game';
    if (/^\/game\//.test(r)) return '404';
    if (r === '/games' || r === '/new' || r === '/popular' || r === '/favorites' || /^\/c\//.test(r)) return 'library';
    if (['/about', '/contact', '/privacy', '/terms', '/disclaimer', '/cookies', '/sitemap'].indexOf(r) >= 0) return 'page';
    return '404';
  }
  go(hash) { location.hash = hash; }

  /* ---------- sound ---------- */
  beep(freq, dur, type) {
    if (!this.state.soundOn) return;
    try {
      if (!this.actx) this.actx = new (window.AudioContext || window.webkitAudioContext)();
      const a = this.actx;
      if (a.state === 'suspended') a.resume();
      const o = a.createOscillator(), g = a.createGain();
      o.type = type || 'square'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, a.currentTime);
      g.gain.exponentialRampToValueAtTime(0.09, a.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + (dur || 0.1));
      o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + (dur || 0.1) + 0.02);
    } catch (e) {}
  }

  /* ---------- daily streak, badges, score hooks ---------- */
  today() { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  yesterday() { const d = new Date(Date.now() - 864e5); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  dailyStreak() { const s = this.read('daily', { date: '', n: 0 }); return s && s.date === this.today() ? s.n : (s && s.date === this.yesterday() ? s.n : 0); }
  markDaily(gameId) {
    const daily = this.dailyPick();
    if (gameId !== daily.id) return;
    const s = this.read('daily', { date: '', n: 0 }) || { date: '', n: 0 };
    if (s.date === this.today()) return;
    const n = s.date === this.yesterday() ? s.n + 1 : 1;
    this.write('daily', { date: this.today(), n: n });
    this.setState({ streak: n });
  }
  badgeList() {
    return [
      { id: 'first', label: 'First run', hint: 'Finish any game once.' },
      { id: 'explorer', label: 'Explorer', hint: 'Play five different games.' },
      { id: 'regular', label: 'Regular', hint: 'Play twelve different games.' },
      { id: 'sharp', label: 'Sharp eye', hint: 'Score 500 or more in one run.' },
      { id: 'grinder', label: 'Grinder', hint: 'Score 2,000 or more in one run.' },
      { id: 'streak3', label: 'Three-day streak', hint: 'Take the daily challenge three days running.' },
      { id: 'collector', label: 'Collector', hint: 'Favourite five games.' }
    ];
  }
  checkBadges(score) {
    const have = (this.state.badges || []).slice();
    const played = Object.keys(this.state.played || {}).length;
    const add = id => { if (have.indexOf(id) < 0) have.push(id); };
    add('first');
    if (played >= 5) add('explorer');
    if (played >= 12) add('regular');
    if (score >= 500) add('sharp');
    if (score >= 2000) add('grinder');
    if (this.dailyStreak() >= 3) add('streak3');
    if ((this.state.favs || []).length >= 5) add('collector');
    if (have.length !== (this.state.badges || []).length) {
      const fresh = have.filter(id => (this.state.badges || []).indexOf(id) < 0);
      const b = this.badgeList().find(x => x.id === fresh[fresh.length - 1]);
      this.setState({ badges: have, newBadge: b ? b.label : '' });
      this.write('badges', have);
      setTimeout(() => this.setState({ newBadge: '' }), 4200);
    }
  }
  emitScore(gameId, score) {
    try {
      const payload = { game: gameId, score: score, best: this.bestOf(gameId), at: new Date().toISOString() };
      if (typeof window.ArcadilloOnScore === 'function') window.ArcadilloOnScore(payload);
      window.dispatchEvent(new CustomEvent('arcadillo:score', { detail: payload }));
    } catch (e) {}
  }

  /* ---------- score / favs / recents ---------- */
  bestOf(id) { return (this.state.scores || {})[id] || 0; }
  recordScore(id, n) {
    if (n <= this.bestOf(id)) return;
    const scores = Object.assign({}, this.state.scores); scores[id] = n;
    this.setState({ scores }); this.write('scores', scores);
  }
  toggleFav(id) {
    const favs = (this.state.favs || []).slice();
    const i = favs.indexOf(id);
    if (i >= 0) favs.splice(i, 1); else favs.push(id);
    this.setState({ favs }); this.write('favorites', favs);
  }
  pushRecent(id) {
    const r = (this.state.recents || []).filter(x => x !== id);
    r.unshift(id); const out = r.slice(0, 10);
    this.setState({ recents: out }); this.write('recent_games', out);
  }

  /* ---------- game mounting ---------- */
  destroyGame() {
    if (this.ctl && this.ctl.destroy) { try { this.ctl.destroy(); } catch (e) {} }
    this.ctl = null; this.mountedId = null;
  }
  stageHost() {
    if (this.stageRef.current && this.stageRef.current.isConnected) return this.stageRef.current;
    let el = null;
    try {
      const root = (this.rootEl && this.rootEl.isConnected) ? this.rootEl : document;
      el = root.querySelector('[data-stage="1"]');
    } catch (e) {}
    this.stageRef.current = el;
    return el;
  }
  syncGame() {
    const g = this.currentGame();
    const host = this.stageHost();
    if (!g || !host) { if (this.mountedId) this.destroyGame(); return; }
    if (this.mountedId === g.id) return;
    this.destroyGame();
    this.mountedId = g.id;
    const api = {
      setScore: n => this.setState({ score: n }),
      gameOver: msg => {
        const sc = this.state.score;
        this.recordScore(g.id, sc);
        this.setState({ status: 'over', overMsg: msg || '' });
        this.beep(160, 0.28, 'sawtooth');
        const played = Object.assign({}, this.state.played || {});
        played[g.id] = (played[g.id] || 0) + 1;
        this.setState({ played: played });
        this.write('played', played);
        this.markDaily(g.id);
        this.emitScore(g.id, sc);
        setTimeout(() => this.checkBadges(sc), 30);
      },
      sound: (f, d, t) => this.beep(f, d, t),
      best: () => this.bestOf(g.id),
      twoPlayer: () => !!this.state.twoPlayer,
      difficulty: () => this.state.diff,
      touch: (typeof matchMedia !== 'undefined' && matchMedia('(hover: none)').matches)
    };
    this._speedy = ['snake-rush', 'brick-cascade', 'star-defender', 'road-racer', 'jump-runner'].indexOf(g.id) >= 0;
    this.speedScale = { Easy: 0.82, Normal: 1, Hard: 1.25 }[this.state.diff] || 1;
    try {
      this.ctl = g.mount(host, api);
      this.setState({ score: 0, status: 'ready', overMsg: '' });
      this.pushRecent(g.id);
    } catch (e) {
      host.innerHTML = '';
      const p = document.createElement('p');
      p.style.cssText = 'padding:40px 20px;text-align:center;color:#9a9cb8';
      p.textContent = 'This game could not start in your browser. Try another game — the rest of the site keeps working.';
      host.appendChild(p);
      this.ctl = null;
    }
  }

  /* ---------- canvas helpers ---------- */
  mkCanvas(host, aspect) {
    host.innerHTML = '';
    const c = document.createElement('canvas');
    c.style.cssText = 'width:100%;max-width:620px;aspect-ratio:' + (aspect || '1 / 1') +
      ';display:block;border-radius:18px;background:#0a0b18;touch-action:none;cursor:pointer';
    c.setAttribute('tabindex', '0');
    host.appendChild(c);
    const ctx = c.getContext('2d');
    const fit = () => {
      const r = c.getBoundingClientRect();
      const d = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(r.width * d)), h = Math.max(1, Math.round(r.height * d));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      ctx.setTransform(d, 0, 0, d, 0, 0);
    };
    fit();
    let ro = null, pending = 0;
    const deferFit = () => {
      if (pending) return;
      pending = requestAnimationFrame(() => { pending = 0; fit(); });
    };
    try { ro = new ResizeObserver(deferFit); ro.observe(c); } catch (e) { window.addEventListener('resize', deferFit); }
    return {
      c: c, ctx: ctx,
      W: () => c.getBoundingClientRect().width || 320,
      H: () => c.getBoundingClientRect().height || 320,
      pos: ev => { const r = c.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; },
      dispose: () => { if (pending) cancelAnimationFrame(pending); if (ro) ro.disconnect(); else window.removeEventListener('resize', deferFit); }
    };
  }
  loop(fn) {
    let id = 0, last = performance.now(), stopped = false;
    const step = t => {
      if (stopped) return;
      let dt = Math.min(0.05, (t - last) / 1000); last = t;
      if (this._speedy) dt *= (this.speedScale || 1);
      fn(dt); id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    return () => { stopped = true; cancelAnimationFrame(id); };
  }
  swipe(el, cb) {
    let sx = 0, sy = 0, on = false;
    const d = e => { on = true; sx = e.clientX; sy = e.clientY; };
    const u = e => {
      if (!on) return; on = false;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) < 18 && Math.abs(dy) < 18) { cb('tap'); return; }
      cb(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    };
    el.addEventListener('pointerdown', d);
    el.addEventListener('pointerup', u);
    return () => { el.removeEventListener('pointerdown', d); el.removeEventListener('pointerup', u); };
  }
  rr(ctx, x, y, w, h, r) {
    const rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }
  hud(ctx, w, text) {
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.font = '600 13px "DM Sans", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(text, 14, 22);
    ctx.textAlign = 'start';
  }

  /* ================= GAMES ================= */
  gameSnake(host, api) {
    const g = this.mkCanvas(host, '1 / 1'), ctx = g.ctx, N = 18;
    let s = null, run = false;
    const reset = () => {
      s = { body: [{ x: 8, y: 9 }, { x: 7, y: 9 }], dir: { x: 1, y: 0 }, next: { x: 1, y: 0 }, food: { x: 13, y: 9 }, t: 0, step: 0.16, score: 0 };
      api.setScore(0);
    };
    const place = () => {
      let p; let tries = 0;
      do { p = { x: Math.floor(Math.random() * N), y: Math.floor(Math.random() * N) }; tries++; }
      while (tries < 200 && s.body.some(q => q.x === p.x && q.y === p.y));
      s.food = p;
    };
    const turn = d => {
      const map = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
      const n = map[d]; if (!n) return;
      if (n.x === -s.dir.x && n.y === -s.dir.y) return;
      s.next = n;
    };
    const key = e => {
      const k = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right' }[e.key];
      if (k) { e.preventDefault(); turn(k); }
    };
    const tick = dt => {
      if (run) {
        s.t += dt;
        if (s.t >= s.step) {
          s.t = 0; s.dir = s.next;
          const h = { x: s.body[0].x + s.dir.x, y: s.body[0].y + s.dir.y };
          if (h.x < 0 || h.y < 0 || h.x >= N || h.y >= N || s.body.some(q => q.x === h.x && q.y === h.y)) {
            run = false; api.gameOver('You crashed at ' + s.score + ' points.');
          } else {
            s.body.unshift(h);
            if (h.x === s.food.x && h.y === s.food.y) {
              s.score += 10; api.setScore(s.score); api.sound(880, 0.07);
              s.step = Math.max(0.07, s.step - 0.004); place();
            } else s.body.pop();
          }
        }
      }
      const W = g.W(), H = g.H(), cs = Math.min(W, H) / N, ox = (W - cs * N) / 2, oy = (H - cs * N) / 2;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#0a0b18'; ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        if ((i + j) % 2 === 0) { ctx.fillStyle = 'rgba(255,255,255,.028)'; ctx.fillRect(ox + i * cs, oy + j * cs, cs, cs); }
      }
      ctx.fillStyle = '#ff6b5d';
      this.rr(ctx, ox + s.food.x * cs + cs * 0.18, oy + s.food.y * cs + cs * 0.18, cs * 0.64, cs * 0.64, cs * 0.2); ctx.fill();
      s.body.forEach((p, i) => {
        ctx.fillStyle = i === 0 ? '#d8f24b' : 'rgba(216,242,75,' + Math.max(0.3, 1 - i / (s.body.length + 4)) + ')';
        this.rr(ctx, ox + p.x * cs + cs * 0.08, oy + p.y * cs + cs * 0.08, cs * 0.84, cs * 0.84, cs * 0.26); ctx.fill();
      });
      this.hud(ctx, W, 'Length ' + s.body.length);
    };
    reset(); place();
    window.addEventListener('keydown', key);
    const offSwipe = this.swipe(g.c, d => turn(d));
    const stop = this.loop(tick);
    return {
      start: () => { run = true; },
      pause: () => { run = !run; return run; },
      restart: () => { reset(); place(); run = true; },
      destroy: () => { stop(); offSwipe(); window.removeEventListener('keydown', key); g.dispose(); }
    };
  }

  gameBricks(host, api) {
    const g = this.mkCanvas(host, '4 / 3'), ctx = g.ctx;
    let s = null, run = false;
    const COLS = 8, ROWS = 5;
    const reset = () => {
      s = { px: 0.5, ball: { x: 0.5, y: 0.7, vx: 0.34, vy: -0.46 }, bricks: [], lives: 3, score: 0, level: 1 };
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) s.bricks.push({ r: r, c: c, on: true });
      api.setScore(0);
    };
    const move = ev => { const p = g.pos(ev); s.px = Math.max(0.06, Math.min(0.94, p.x / g.W())); };
    const key = e => {
      if (e.key === 'ArrowLeft' || e.key === 'a') { s.px = Math.max(0.06, s.px - 0.06); e.preventDefault(); }
      if (e.key === 'ArrowRight' || e.key === 'd') { s.px = Math.min(0.94, s.px + 0.06); e.preventDefault(); }
    };
    const tick = dt => {
      const W = g.W(), H = g.H(), pw = W * 0.19, ph = 12, by = H - 26, br = Math.max(6, W * 0.016);
      if (run) {
        s.ball.x += s.ball.vx * dt; s.ball.y += s.ball.vy * dt;
        if (s.ball.x < 0.02) { s.ball.x = 0.02; s.ball.vx *= -1; api.sound(520, 0.04); }
        if (s.ball.x > 0.98) { s.ball.x = 0.98; s.ball.vx *= -1; api.sound(520, 0.04); }
        if (s.ball.y < 0.05) { s.ball.y = 0.05; s.ball.vy *= -1; api.sound(520, 0.04); }
        const bx = s.ball.x * W, byy = s.ball.y * H;
        if (byy > by - br && byy < by + ph && Math.abs(bx - s.px * W) < pw / 2 + br) {
          s.ball.vy = -Math.abs(s.ball.vy);
          s.ball.vx += (bx - s.px * W) / (pw / 2) * 0.14;
          s.ball.vx = Math.max(-0.75, Math.min(0.75, s.ball.vx));
          api.sound(700, 0.05);
        }
        if (s.ball.y > 1.02) {
          s.lives--;
          if (s.lives <= 0) { run = false; api.gameOver('Out of balls — ' + s.score + ' points.'); }
          else { s.ball = { x: 0.5, y: 0.7, vx: 0.34, vy: -0.46 }; api.sound(200, 0.15); }
        }
        const bw = W / COLS, bh = H * 0.058, top = H * 0.1;
        s.bricks.forEach(b => {
          if (!b.on) return;
          const x = b.c * bw, y = top + b.r * bh;
          if (bx > x && bx < x + bw && byy > y && byy < y + bh) {
            b.on = false; s.ball.vy *= -1; s.score += 15; api.setScore(s.score); api.sound(940, 0.05);
          }
        });
        if (!s.bricks.some(b => b.on)) {
          s.level++; s.score += 100; api.setScore(s.score);
          s.bricks.forEach(b => { b.on = true; });
          s.ball = { x: 0.5, y: 0.7, vx: 0.34 * (1 + s.level * 0.08), vy: -0.46 * (1 + s.level * 0.08) };
          api.sound(1200, 0.12);
        }
      }
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#0a0b18'; ctx.fillRect(0, 0, W, H);
      const bw = W / COLS, bh = H * 0.058, top = H * 0.1;
      const palette = ['#d8f24b', '#7c6cff', '#ff6b5d', '#4bd6f2', '#f2b04b'];
      s.bricks.forEach(b => {
        if (!b.on) return;
        ctx.fillStyle = palette[b.r % palette.length];
        this.rr(ctx, b.c * bw + 3, top + b.r * bh + 3, bw - 6, bh - 6, 6); ctx.fill();
      });
      ctx.fillStyle = '#f2f2f7';
      this.rr(ctx, s.px * W - pw / 2, by, pw, ph, 6); ctx.fill();
      ctx.beginPath(); ctx.arc(s.ball.x * W, s.ball.y * H, br, 0, 6.3); ctx.fillStyle = '#d8f24b'; ctx.fill();
      this.hud(ctx, W, 'Lives ' + s.lives + '   Level ' + s.level);
    };
    reset();
    g.c.addEventListener('pointermove', move);
    g.c.addEventListener('pointerdown', move);
    window.addEventListener('keydown', key);
    const stop = this.loop(tick);
    return {
      start: () => { run = true; },
      pause: () => { run = !run; return run; },
      restart: () => { reset(); run = true; },
      destroy: () => { stop(); g.c.removeEventListener('pointermove', move); g.c.removeEventListener('pointerdown', move); window.removeEventListener('keydown', key); g.dispose(); }
    };
  }

  gameMerge(host, api) {
    const g = this.mkCanvas(host, '1 / 1'), ctx = g.ctx, N = 4;
    let grid = [], score = 0, run = false;
    const empty = () => { const o = []; for (let i = 0; i < N * N; i++) o.push(0); return o; };
    const spawn = () => {
      const free = grid.map((v, i) => v === 0 ? i : -1).filter(i => i >= 0);
      if (!free.length) return;
      grid[free[Math.floor(Math.random() * free.length)]] = Math.random() < 0.9 ? 2 : 4;
    };
    const reset = () => { grid = empty(); score = 0; api.setScore(0); spawn(); spawn(); };
    const line = arr => {
      const v = arr.filter(x => x); const out = [];
      for (let i = 0; i < v.length; i++) {
        if (v[i] === v[i + 1]) { out.push(v[i] * 2); score += v[i] * 2; i++; } else out.push(v[i]);
      }
      while (out.length < N) out.push(0);
      return out;
    };
    const slide = dir => {
      if (!run) return;
      const before = grid.join(',');
      for (let i = 0; i < N; i++) {
        let idx = [];
        for (let j = 0; j < N; j++) {
          idx.push(dir === 'left' || dir === 'right' ? i * N + j : j * N + i);
        }
        if (dir === 'right' || dir === 'down') idx.reverse();
        const res = line(idx.map(k => grid[k]));
        idx.forEach((k, n) => { grid[k] = res[n]; });
      }
      if (grid.join(',') !== before) { spawn(); api.setScore(score); api.sound(660, 0.05); }
      const full = grid.every(v => v);
      if (full) {
        let can = false;
        for (let i = 0; i < N; i++) for (let j = 0; j < N - 1; j++) {
          if (grid[i * N + j] === grid[i * N + j + 1]) can = true;
          if (grid[j * N + i] === grid[(j + 1) * N + i]) can = true;
        }
        if (!can) { run = false; api.gameOver('Board jammed at ' + score + ' points.'); }
      }
    };
    const key = e => {
      const m = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', a: 'left', d: 'right', w: 'up', s: 'down' }[e.key];
      if (m) { e.preventDefault(); slide(m); }
    };
    const tileColor = v => ({ 2: '#2a2d4d', 4: '#36396b', 8: '#7c6cff', 16: '#5f7cff', 32: '#4bd6f2', 64: '#4bf2a7', 128: '#d8f24b', 256: '#f2d24b', 512: '#f2a04b', 1024: '#ff6b5d', 2048: '#ff4bd8' }[v] || '#ff4bd8');
    const tick = () => {
      const W = g.W(), H = g.H(), S = Math.min(W, H), pad = S * 0.03, cs = (S - pad * 5) / 4;
      const ox = (W - S) / 2, oy = (H - S) / 2;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#0a0b18'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#15172b'; this.rr(ctx, ox, oy, S, S, S * 0.05); ctx.fill();
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const v = grid[i * N + j];
        const x = ox + pad + j * (cs + pad), y = oy + pad + i * (cs + pad);
        ctx.fillStyle = v ? tileColor(v) : 'rgba(255,255,255,.045)';
        this.rr(ctx, x, y, cs, cs, cs * 0.16); ctx.fill();
        if (v) {
          ctx.fillStyle = v >= 64 ? '#14152b' : '#f2f2f7';
          ctx.font = '800 ' + Math.round(cs * (v > 999 ? 0.3 : 0.38)) + 'px "Bricolage Grotesque", sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(String(v), x + cs / 2, y + cs / 2 + 1);
          ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
        }
      }
    };
    reset();
    window.addEventListener('keydown', key);
    const offSwipe = this.swipe(g.c, d => { if (d !== 'tap') slide(d); });
    const stop = this.loop(tick);
    return {
      start: () => { run = true; },
      pause: () => { run = !run; return run; },
      restart: () => { reset(); run = true; },
      destroy: () => { stop(); offSwipe(); window.removeEventListener('keydown', key); g.dispose(); }
    };
  }

  gameMemory(host, api) {
    const g = this.mkCanvas(host, '1 / 1'), ctx = g.ctx, N = 4;
    let cards = [], open = [], moves = 0, run = false, lock = 0, score = 0;
    const colors = ['#d8f24b', '#7c6cff', '#ff6b5d', '#4bd6f2', '#4bf2a7', '#f2b04b', '#ff4bd8', '#f2f2f7'];
    const reset = () => {
      const pairs = [];
      for (let i = 0; i < 8; i++) { pairs.push(i, i); }
      for (let i = pairs.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = pairs[i]; pairs[i] = pairs[j]; pairs[j] = t; }
      cards = pairs.map(k => ({ k: k, up: false, done: false }));
      open = []; moves = 0; score = 0; api.setScore(0);
    };
    const click = ev => {
      if (!run || lock > 0) return;
      const W = g.W(), H = g.H(), S = Math.min(W, H), pad = S * 0.025, cs = (S - pad * 5) / 4;
      const p = g.pos(ev), ox = (W - S) / 2, oy = (H - S) / 2;
      const j = Math.floor((p.x - ox - pad) / (cs + pad)), i = Math.floor((p.y - oy - pad) / (cs + pad));
      if (i < 0 || j < 0 || i > 3 || j > 3) return;
      const idx = i * N + j, c = cards[idx];
      if (!c || c.done || c.up) return;
      c.up = true; open.push(idx); api.sound(700, 0.05);
      if (open.length === 2) {
        moves++;
        const [a, b] = open;
        if (cards[a].k === cards[b].k) {
          cards[a].done = cards[b].done = true; open = [];
          score += 25; api.setScore(score); api.sound(1100, 0.09);
          if (cards.every(c2 => c2.done)) {
            run = false;
            score += Math.max(0, 200 - moves * 8); api.setScore(score);
            api.gameOver('Cleared in ' + moves + ' moves — ' + score + ' points.');
          }
        } else {
          lock = 0.75; score = Math.max(0, score - 3); api.setScore(score);
        }
      }
    };
    const tick = dt => {
      if (lock > 0) {
        lock -= dt;
        if (lock <= 0 && open.length === 2) { cards[open[0]].up = false; cards[open[1]].up = false; open = []; }
      }
      const W = g.W(), H = g.H(), S = Math.min(W, H), pad = S * 0.025, cs = (S - pad * 5) / 4;
      const ox = (W - S) / 2, oy = (H - S) / 2;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#0a0b18'; ctx.fillRect(0, 0, W, H);
      cards.forEach((c, idx) => {
        const i = Math.floor(idx / N), j = idx % N;
        const x = ox + pad + j * (cs + pad), y = oy + pad + i * (cs + pad);
        const face = c.up || c.done;
        ctx.fillStyle = face ? colors[c.k] : '#1d2040';
        ctx.globalAlpha = c.done ? 0.45 : 1;
        this.rr(ctx, x, y, cs, cs, cs * 0.18); ctx.fill();
        if (face) {
          ctx.fillStyle = '#0a0b18';
          const cx = x + cs / 2, cy = y + cs / 2, r = cs * 0.2;
          ctx.beginPath();
          if (c.k % 4 === 0) ctx.arc(cx, cy, r, 0, 6.3);
          else if (c.k % 4 === 1) { ctx.rect(cx - r, cy - r, r * 2, r * 2); }
          else if (c.k % 4 === 2) { ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy + r); ctx.lineTo(cx - r, cy + r); }
          else { ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy); }
          ctx.closePath(); ctx.fill();
        } else {
          ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = 2;
          this.rr(ctx, x + cs * 0.2, y + cs * 0.2, cs * 0.6, cs * 0.6, cs * 0.12); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      });
      this.hud(ctx, W, 'Moves ' + moves);
    };
    reset();
    g.c.addEventListener('pointerdown', click);
    const stop = this.loop(tick);
    return {
      start: () => { run = true; },
      pause: () => { run = !run; return run; },
      restart: () => { reset(); run = true; },
      destroy: () => { stop(); g.c.removeEventListener('pointerdown', click); g.dispose(); }
    };
  }

  gameTicTac(host, api) {
    const g = this.mkCanvas(host, '1 / 1'), ctx = g.ctx;
    let b = [], run = false, msg = '', wins = 0, streak = 0, human = 'X';
    const reset = () => {
      b = ['', '', '', '', '', '', '', '', ''];
      human = 'X';
      msg = (api.twoPlayer && api.twoPlayer()) ? 'X to play' : 'Your turn — you are X';
    };
    const winner = bd => {
      const L = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
      for (const l of L) if (bd[l[0]] && bd[l[0]] === bd[l[1]] && bd[l[1]] === bd[l[2]]) return { p: bd[l[0]], line: l };
      return bd.every(v => v) ? { p: 'draw' } : null;
    };
    const minimax = (bd, me) => {
      const w = winner(bd);
      if (w) return { s: w.p === 'O' ? 10 : w.p === 'X' ? -10 : 0 };
      let best = null;
      for (let i = 0; i < 9; i++) {
        if (bd[i]) continue;
        bd[i] = me ? 'O' : 'X';
        const r = minimax(bd, !me).s;
        bd[i] = '';
        if (best === null || (me ? r > best.s : r < best.s)) best = { s: r, i: i };
      }
      return best;
    };
    const finish = () => {
      const w = winner(b);
      if (!w) return false;
      run = false;
      const two = api.twoPlayer && api.twoPlayer();
      if (w.p === 'X') { wins++; streak++; api.setScore(wins * 100 + streak * 20); api.gameOver(two ? 'X wins this board.' : 'You win! Streak ' + streak); }
      else if (w.p === 'O') { if (two) { wins++; api.setScore(wins * 100); api.gameOver('O wins this board.'); } else { streak = 0; api.gameOver('The machine takes this one.'); } }
      else { api.setScore(wins * 100 + streak * 20); api.gameOver("It's a draw."); }
      return true;
    };
    const click = ev => {
      if (!run) return;
      const W = g.W(), H = g.H(), S = Math.min(W, H) * 0.86, ox = (W - S) / 2, oy = (H - S) / 2, cs = S / 3;
      const p = g.pos(ev);
      const j = Math.floor((p.x - ox) / cs), i = Math.floor((p.y - oy) / cs);
      if (i < 0 || j < 0 || i > 2 || j > 2) return;
      const idx = i * 3 + j;
      if (b[idx]) return;
      if (api.twoPlayer && api.twoPlayer()) {
        b[idx] = human; api.sound(human === 'X' ? 760 : 520, 0.05);
        human = human === 'X' ? 'O' : 'X';
        msg = human === 'X' ? 'X to play' : 'O to play';
        finish();
        return;
      }
      b[idx] = 'X'; api.sound(760, 0.05);
      if (finish()) return;
      const m = minimax(b.slice(), true);
      if (m && m.i !== undefined) { b[m.i] = 'O'; api.sound(420, 0.06); }
      finish();
    };
    const tick = () => {
      const W = g.W(), H = g.H(), S = Math.min(W, H) * 0.86, ox = (W - S) / 2, oy = (H - S) / 2, cs = S / 3;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#0a0b18'; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 3;
      for (let k = 1; k < 3; k++) {
        ctx.beginPath(); ctx.moveTo(ox + k * cs, oy + 8); ctx.lineTo(ox + k * cs, oy + S - 8); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ox + 8, oy + k * cs); ctx.lineTo(ox + S - 8, oy + k * cs); ctx.stroke();
      }
      b.forEach((v, idx) => {
        if (!v) return;
        const i = Math.floor(idx / 3), j = idx % 3;
        const cx = ox + j * cs + cs / 2, cy = oy + i * cs + cs / 2, r = cs * 0.26;
        ctx.lineWidth = Math.max(6, cs * 0.09);
        if (v === 'X') {
          ctx.strokeStyle = '#d8f24b';
          ctx.beginPath(); ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx + r, cy + r);
          ctx.moveTo(cx + r, cy - r); ctx.lineTo(cx - r, cy + r); ctx.stroke();
        } else {
          ctx.strokeStyle = '#7c6cff';
          ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.3); ctx.stroke();
        }
      });
      this.hud(ctx, W, (api.twoPlayer && api.twoPlayer() ? msg + '   ' : '') + 'Wins ' + wins + '   Streak ' + streak);
    };
    reset();
    g.c.addEventListener('pointerdown', click);
    const stop = this.loop(tick);
    return {
      start: () => { run = true; },
      pause: () => { run = !run; return run; },
      restart: () => { reset(); run = true; },
      destroy: () => { stop(); g.c.removeEventListener('pointerdown', click); g.dispose(); }
    };
  }

  gameSpace(host, api) {
    const g = this.mkCanvas(host, '3 / 4'), ctx = g.ctx;
    let s = null, run = false;
    const reset = () => {
      s = { x: 0.5, shots: [], foes: [], stars: [], t: 0, spawn: 0, fire: 0, lives: 3, score: 0, wave: 1 };
      for (let i = 0; i < 40; i++) s.stars.push({ x: Math.random(), y: Math.random(), v: 0.05 + Math.random() * 0.2 });
      api.setScore(0);
    };
    const move = ev => { const p = g.pos(ev); s.x = Math.max(0.06, Math.min(0.94, p.x / g.W())); };
    const key = e => {
      if (e.key === 'ArrowLeft' || e.key === 'a') { s.x = Math.max(0.06, s.x - 0.07); e.preventDefault(); }
      if (e.key === 'ArrowRight' || e.key === 'd') { s.x = Math.min(0.94, s.x + 0.07); e.preventDefault(); }
      if (e.key === ' ') { e.preventDefault(); s.fire = 0; }
    };
    const tick = dt => {
      const W = g.W(), H = g.H();
      if (run) {
        s.t += dt; s.fire -= dt; s.spawn -= dt;
        if (s.fire <= 0) { s.shots.push({ x: s.x, y: 0.88 }); s.fire = 0.28; api.sound(1500, 0.03, 'triangle'); }
        if (s.spawn <= 0) {
          s.foes.push({ x: 0.1 + Math.random() * 0.8, y: -0.05, v: 0.1 + Math.random() * 0.07 + s.wave * 0.012, k: Math.random() < 0.25 ? 2 : 1 });
          s.spawn = Math.max(0.35, 1.1 - s.wave * 0.05);
        }
        s.shots.forEach(b => { b.y -= dt * 1.1; });
        s.shots = s.shots.filter(b => b.y > -0.05);
        s.foes.forEach(f => { f.y += f.v * dt * 1.6; });
        s.foes.forEach(f => {
          s.shots.forEach(b => {
            if (!f.dead && !b.dead && Math.abs(b.x - f.x) < 0.06 && Math.abs(b.y - f.y) < 0.05) {
              b.dead = true; f.k--; if (f.k <= 0) { f.dead = true; s.score += 20; }
              else s.score += 5;
              api.setScore(s.score); api.sound(300, 0.06, 'sawtooth');
            }
          });
          if (!f.dead && f.y > 0.9 && Math.abs(f.x - s.x) < 0.08) { f.dead = true; s.lives--; api.sound(140, 0.2, 'sawtooth'); }
          if (f.y > 1.1) { f.dead = true; s.lives--; }
        });
        s.shots = s.shots.filter(b => !b.dead);
        s.foes = s.foes.filter(f => !f.dead);
        if (s.score > s.wave * 260) s.wave++;
        if (s.lives <= 0) { run = false; api.gameOver('Shields down at ' + s.score + ' points.'); }
        s.stars.forEach(st => { st.y += st.v * dt; if (st.y > 1) { st.y = 0; st.x = Math.random(); } });
      }
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#070814'; ctx.fillRect(0, 0, W, H);
      s.stars.forEach(st => { ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(st.x * W, st.y * H, 2, 2); });
      ctx.fillStyle = '#d8f24b';
      const sx = s.x * W, sy = H * 0.9;
      ctx.beginPath(); ctx.moveTo(sx, sy - 16); ctx.lineTo(sx + 13, sy + 12); ctx.lineTo(sx - 13, sy + 12); ctx.closePath(); ctx.fill();
      s.shots.forEach(b => { ctx.fillStyle = '#4bd6f2'; ctx.fillRect(b.x * W - 2, b.y * H - 10, 4, 12); });
      s.foes.forEach(f => {
        ctx.fillStyle = f.k > 1 ? '#ff4bd8' : '#ff6b5d';
        this.rr(ctx, f.x * W - 15, f.y * H - 11, 30, 22, 8); ctx.fill();
        ctx.fillStyle = '#0a0b18';
        ctx.fillRect(f.x * W - 8, f.y * H - 3, 5, 5); ctx.fillRect(f.x * W + 3, f.y * H - 3, 5, 5);
      });
      this.hud(ctx, W, 'Shields ' + Math.max(0, s.lives) + '   Wave ' + s.wave);
    };
    reset();
    g.c.addEventListener('pointermove', move);
    g.c.addEventListener('pointerdown', move);
    window.addEventListener('keydown', key);
    const stop = this.loop(tick);
    return {
      start: () => { run = true; },
      pause: () => { run = !run; return run; },
      restart: () => { reset(); run = true; },
      destroy: () => { stop(); g.c.removeEventListener('pointermove', move); g.c.removeEventListener('pointerdown', move); window.removeEventListener('keydown', key); g.dispose(); }
    };
  }

  gameReaction(host, api) {
    const g = this.mkCanvas(host, '4 / 3'), ctx = g.ctx;
    let target = null, run = false, round = 0, times = [], wait = 0, shown = 0, score = 0;
    const reset = () => { target = null; round = 0; times = []; wait = 0.7; score = 0; api.setScore(0); };
    const next = () => { target = null; wait = 0.4 + Math.random() * 1.2; };
    const click = ev => {
      if (!run) return;
      if (!target) { score = Math.max(0, score - 20); api.setScore(score); api.sound(180, 0.1, 'sawtooth'); return; }
      const p = g.pos(ev);
      const d = Math.hypot(p.x - target.x, p.y - target.y);
      if (d > target.r + 6) { score = Math.max(0, score - 10); api.setScore(score); return; }
      const ms = (performance.now() - shown);
      times.push(ms); round++;
      score += Math.max(20, Math.round(900 - ms)); api.setScore(score);
      api.sound(1000, 0.05);
      if (round >= 10) {
        run = false;
        const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
        api.gameOver('Average reaction ' + avg + ' ms over 10 targets.');
      } else next();
    };
    const tick = dt => {
      const W = g.W(), H = g.H();
      if (run && !target) {
        wait -= dt;
        if (wait <= 0) {
          const r = Math.max(22, Math.min(W, H) * (0.11 - round * 0.004));
          target = { x: r + Math.random() * (W - r * 2), y: r + 30 + Math.random() * (H - r * 2 - 40), r: r };
          shown = performance.now();
        }
      }
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#0a0b18'; ctx.fillRect(0, 0, W, H);
      if (target) {
        ctx.fillStyle = '#d8f24b';
        ctx.beginPath(); ctx.arc(target.x, target.y, target.r, 0, 6.3); ctx.fill();
        ctx.fillStyle = '#0a0b18';
        ctx.beginPath(); ctx.arc(target.x, target.y, target.r * 0.42, 0, 6.3); ctx.fill();
      } else if (run) {
        ctx.fillStyle = 'rgba(255,255,255,.35)';
        ctx.font = '600 15px "DM Sans", sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('Wait for the dot…', W / 2, H / 2); ctx.textAlign = 'start';
      }
      this.hud(ctx, W, 'Target ' + Math.min(10, round + 1) + ' of 10' + (times.length ? '   Last ' + Math.round(times[times.length - 1]) + 'ms' : ''));
    };
    reset();
    g.c.addEventListener('pointerdown', click);
    const stop = this.loop(tick);
    return {
      start: () => { run = true; },
      pause: () => { run = !run; return run; },
      restart: () => { reset(); run = true; },
      destroy: () => { stop(); g.c.removeEventListener('pointerdown', click); g.dispose(); }
    };
  }

  gameDropFour(host, api) {
    const g = this.mkCanvas(host, '7 / 6'), ctx = g.ctx, C = 7, R = 6;
    let b = [], run = false, turn = 1, wins = 0, side = 1;
    const reset = () => { b = new Array(C * R).fill(0); turn = 1; side = 1; };
    const at = (c, r) => b[r * C + c];
    const drop = (c, p) => {
      for (let r = R - 1; r >= 0; r--) if (!at(c, r)) { b[r * C + c] = p; return r; }
      return -1;
    };
    const won = p => {
      for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
        if (at(c, r) !== p) continue;
        const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
        for (const d of dirs) {
          let n = 1;
          while (n < 4) {
            const cc = c + d[0] * n, rr = r + d[1] * n;
            if (cc < 0 || cc >= C || rr < 0 || rr >= R || at(cc, rr) !== p) break;
            n++;
          }
          if (n >= 4) return true;
        }
      }
      return false;
    };
    const aiMove = () => {
      const free = [];
      for (let c = 0; c < C; c++) if (!at(c, 0)) free.push(c);
      if (!free.length) return -1;
      for (const p of [2, 1]) {
        for (const c of free) {
          const snap = b.slice(); drop(c, p);
          const w = won(p); b = snap;
          if (w) return c;
        }
      }
      free.sort((a, z) => Math.abs(3 - a) - Math.abs(3 - z));
      return free[Math.random() < 0.7 ? 0 : Math.floor(Math.random() * free.length)];
    };
    const click = ev => {
      if (!run || turn !== 1) return;
      const W = g.W(), cw = W / C;
      const c = Math.floor(g.pos(ev).x / cw);
      if (c < 0 || c >= C || at(c, 0)) return;
      if (api.twoPlayer && api.twoPlayer()) {
        drop(c, side); api.sound(side === 1 ? 600 : 400, 0.06);
        if (won(side)) { run = false; api.setScore(120); api.gameOver((side === 1 ? 'Yellow' : 'Coral') + ' connects four!'); return; }
        if (b.every(v => v)) { run = false; api.gameOver('Board full — a draw.'); return; }
        side = side === 1 ? 2 : 1;
        return;
      }
      drop(c, 1); api.sound(600, 0.06);
      if (won(1)) { run = false; wins++; api.setScore(wins * 100); api.gameOver('Four in a row — you win!'); return; }
      if (b.every(v => v)) { run = false; api.gameOver('Board full — a draw.'); return; }
      turn = 2;
      setTimeout(() => {
        if (!run) return;
        const c2 = aiMove();
        if (c2 >= 0) { drop(c2, 2); api.sound(360, 0.07); }
        if (won(2)) { run = false; api.gameOver('The machine connected four.'); return; }
        if (b.every(v => v)) { run = false; api.gameOver('Board full — a draw.'); return; }
        turn = 1;
      }, 320);
    };
    const tick = () => {
      const W = g.W(), H = g.H(), cw = W / C, ch = H / R, r = Math.min(cw, ch) * 0.38;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#141733'; ctx.fillRect(0, 0, W, H);
      for (let rr = 0; rr < R; rr++) for (let c = 0; c < C; c++) {
        const v = at(c, rr);
        ctx.beginPath(); ctx.arc(c * cw + cw / 2, rr * ch + ch / 2, r, 0, 6.3);
        ctx.fillStyle = v === 1 ? '#d8f24b' : v === 2 ? '#ff6b5d' : '#0a0b18';
        ctx.fill();
      }
      this.hud(ctx, W, (api.twoPlayer && api.twoPlayer())
        ? (side === 1 ? 'Yellow to play' : 'Coral to play')
        : (turn === 1 ? 'Your turn (yellow)' : 'Thinking…'));
    };
    reset();
    g.c.addEventListener('pointerdown', click);
    const stop = this.loop(tick);
    return {
      start: () => { run = true; },
      pause: () => { run = !run; return run; },
      restart: () => { reset(); run = true; },
      destroy: () => { stop(); g.c.removeEventListener('pointerdown', click); g.dispose(); }
    };
  }

  gameColorClash(host, api) {
    const g = this.mkCanvas(host, '4 / 3'), ctx = g.ctx;
    const names = ['RED', 'BLUE', 'GREEN', 'YELLOW', 'PURPLE'];
    const hex = { RED: '#ff5d5d', BLUE: '#4b8cf2', GREEN: '#4bf2a7', YELLOW: '#f2d24b', PURPLE: '#9c6cff' };
    let q = null, run = false, time = 30, score = 0, streak = 0;
    const nextQ = () => {
      const word = names[Math.floor(Math.random() * names.length)];
      const match = Math.random() < 0.5;
      const ink = match ? word : names.filter(n => n !== word)[Math.floor(Math.random() * (names.length - 1))];
      q = { word: word, ink: ink, match: match };
    };
    const reset = () => { time = 30; score = 0; streak = 0; api.setScore(0); nextQ(); };
    const answer = yes => {
      if (!run || !q) return;
      if (yes === q.match) { streak++; score += 10 + streak * 2; api.sound(950, 0.05); }
      else { streak = 0; score = Math.max(0, score - 8); api.sound(200, 0.1, 'sawtooth'); }
      api.setScore(score); nextQ();
    };
    const click = ev => {
      const W = g.W(), H = g.H(), p = g.pos(ev);
      if (p.y < H * 0.66) return;
      answer(p.x < W / 2);
    };
    const key = e => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); answer(true); }
      if (e.key === 'ArrowRight') { e.preventDefault(); answer(false); }
    };
    const tick = dt => {
      const W = g.W(), H = g.H();
      if (run) {
        time -= dt;
        if (time <= 0) { run = false; time = 0; api.gameOver('Time! ' + score + ' points.'); }
      }
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#0a0b18'; ctx.fillRect(0, 0, W, H);
      if (q) {
        ctx.fillStyle = hex[q.ink];
        ctx.font = '800 ' + Math.round(Math.min(W * 0.16, 74)) + 'px "Bricolage Grotesque", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(q.word, W / 2, H * 0.38);
        ctx.fillStyle = 'rgba(255,255,255,.5)';
        ctx.font = '600 14px "DM Sans", sans-serif';
        ctx.fillText('Does the word match its ink colour?', W / 2, H * 0.5);
        ctx.textAlign = 'start';
      }
      const by = H * 0.66, bh = H * 0.28, pad = 10;
      ctx.fillStyle = '#1d5c3a'; this.rr(ctx, pad, by, W / 2 - pad * 1.5, bh, 14); ctx.fill();
      ctx.fillStyle = '#5c1d2a'; this.rr(ctx, W / 2 + pad * 0.5, by, W / 2 - pad * 1.5, bh, 14); ctx.fill();
      ctx.fillStyle = '#f2f2f7'; ctx.font = '800 20px "Bricolage Grotesque", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('MATCH', W / 4, by + bh / 2 + 7);
      ctx.fillText('NO MATCH', W * 0.75, by + bh / 2 + 7);
      ctx.textAlign = 'start';
      this.hud(ctx, W, 'Time ' + Math.ceil(time) + 's   Streak ' + streak);
    };
    reset();
    g.c.addEventListener('pointerdown', click);
    window.addEventListener('keydown', key);
    const stop = this.loop(tick);
    return {
      start: () => { run = true; },
      pause: () => { run = !run; return run; },
      restart: () => { reset(); run = true; },
      destroy: () => { stop(); g.c.removeEventListener('pointerdown', click); window.removeEventListener('keydown', key); g.dispose(); }
    };
  }

  gameTyping(host, api) {
    host.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.style.cssText = 'width:100%;max-width:620px;display:flex;flex-direction:column;gap:14px';
    const prompt = document.createElement('p');
    prompt.style.cssText = 'margin:0;padding:20px;border-radius:16px;background:#12142a;color:#c9cbe4;font-size:19px;line-height:1.7;min-height:96px';
    const input = document.createElement('input');
    input.type = 'text';
    input.setAttribute('aria-label', 'Type the phrase shown above');
    input.autocomplete = 'off';
    input.style.cssText = 'padding:15px 16px;border-radius:14px;border:1px solid rgba(255,255,255,.14);background:#0a0b18;color:#f2f2f7;font-size:17px;min-height:48px;outline:none';
    const meta = document.createElement('p');
    meta.style.cssText = 'margin:0;color:#9a9cb8;font-size:14px;display:flex;gap:18px;flex-wrap:wrap';
    wrap.appendChild(prompt); wrap.appendChild(input); wrap.appendChild(meta);
    host.appendChild(wrap);

    const bank = [
      'the quick otter drifts past a quiet harbour at dawn',
      'small pixels make big worlds when you keep them tidy',
      'press start and let the arcade lights do the talking',
      'seven paper lanterns floated over the river last night',
      'a steady hand beats a fast one on the final level',
      'copy nothing build everything and ship it on friday'
    ];
    let run = false, time = 30, target = '', typed = 0, correct = 0, words = 0, timer = 0;
    const pick = () => { target = bank[Math.floor(Math.random() * bank.length)]; input.value = ''; render(); };
    const reset = () => { time = 30; typed = 0; correct = 0; words = 0; api.setScore(0); pick(); };
    const render = () => {
      prompt.textContent = target;
      meta.textContent = 'Time ' + Math.ceil(time) + 's  ·  WPM ' + wpm() + '  ·  Accuracy ' + acc() + '%';
    };
    const wpm = () => time >= 30 ? 0 : Math.max(0, Math.round((correct / 5) / ((30 - time) / 60)) || 0);
    const acc = () => typed ? Math.round((correct / typed) * 100) : 100;
    const onInput = () => {
      if (!run) return;
      const v = input.value;
      if (v.length > typedLen) { typed += v.length - typedLen; }
      typedLen = v.length;
      if (target.startsWith(v)) {
        correct = Math.max(correct, v.length + words * 0);
      }
      if (v === target) {
        words += target.split(' ').length;
        correct += target.length;
        api.setScore(Math.round(correct * 2 + words * 5));
        api.sound(1000, 0.05);
        typedLen = 0; pick();
      }
      render();
    };
    let typedLen = 0;
    input.addEventListener('input', onInput);
    const stop = this.loop(dt => {
      if (!run) return;
      time -= dt; timer += dt;
      if (timer > 0.25) { timer = 0; render(); }
      if (time <= 0) {
        time = 0; run = false; input.blur();
        api.setScore(Math.round(correct * 2 + words * 5));
        api.gameOver('Finished at roughly ' + Math.max(0, Math.round((correct / 5) / 0.5)) + ' WPM, ' + acc() + '% accurate.');
      }
    });
    reset();
    return {
      start: () => { run = true; input.focus(); },
      pause: () => { run = !run; if (run) input.focus(); return run; },
      restart: () => { reset(); run = true; input.focus(); },
      destroy: () => { stop(); input.removeEventListener('input', onInput); host.innerHTML = ''; }
    };
  }

  gameRoad(host, api) {
    const g = this.mkCanvas(host, '3 / 4'), ctx = g.ctx;
    let s = null, run = false;
    const lanes = [0.2, 0.4, 0.6, 0.8];
    const reset = () => { s = { x: 0.4, target: 0.4, cars: [], spawn: 0, speed: 0.36, score: 0, dash: 0 }; api.setScore(0); };
    const move = ev => { s.target = Math.max(0.14, Math.min(0.86, g.pos(ev).x / g.W())); };
    const key = e => {
      if (e.key === 'ArrowLeft' || e.key === 'a') { s.target = Math.max(0.14, s.target - 0.2); e.preventDefault(); }
      if (e.key === 'ArrowRight' || e.key === 'd') { s.target = Math.min(0.86, s.target + 0.2); e.preventDefault(); }
    };
    const tick = dt => {
      const W = g.W(), H = g.H();
      if (run) {
        s.x += (s.target - s.x) * Math.min(1, dt * 9);
        s.spawn -= dt; s.dash += s.speed * dt * 3;
        s.score += dt * 30; api.setScore(Math.floor(s.score));
        s.speed = Math.min(1.1, 0.36 + s.score / 900);
        if (s.spawn <= 0) {
          s.cars.push({ x: lanes[Math.floor(Math.random() * 4)], y: -0.12, c: ['#ff6b5d', '#4bd6f2', '#7c6cff', '#f2b04b'][Math.floor(Math.random() * 4)] });
          s.spawn = 0.55 + Math.random() * 0.5 - Math.min(0.35, s.score / 3000);
        }
        s.cars.forEach(c => { c.y += s.speed * dt; });
        s.cars = s.cars.filter(c => c.y < 1.2);
        for (const c of s.cars) {
          if (Math.abs(c.x - s.x) < 0.12 && Math.abs(c.y - 0.84) < 0.09) {
            run = false; api.gameOver('Crashed after ' + Math.floor(s.score) + ' metres.');
          }
        }
      }
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#101226'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#181b34'; ctx.fillRect(W * 0.1, 0, W * 0.8, H);
      ctx.fillStyle = 'rgba(255,255,255,.22)';
      for (let k = 1; k < 4; k++) {
        const lx = W * (0.1 + 0.2 * k);
        for (let y = -40 + ((s.dash * 100) % 40); y < H; y += 40) ctx.fillRect(lx - 2, y, 4, 20);
      }
      s.cars.forEach(c => {
        ctx.fillStyle = c.c;
        this.rr(ctx, c.x * W - W * 0.075, c.y * H - 26, W * 0.15, 52, 10); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(c.x * W - W * 0.05, c.y * H - 12, W * 0.1, 12);
      });
      ctx.fillStyle = '#d8f24b';
      this.rr(ctx, s.x * W - W * 0.075, H * 0.84 - 28, W * 0.15, 56, 10); ctx.fill();
      ctx.fillStyle = '#101226'; ctx.fillRect(s.x * W - W * 0.05, H * 0.84 - 12, W * 0.1, 13);
      this.hud(ctx, W, 'Speed ' + Math.round(s.speed * 190) + ' km/h');
    };
    reset();
    g.c.addEventListener('pointermove', move); g.c.addEventListener('pointerdown', move);
    window.addEventListener('keydown', key);
    const stop = this.loop(tick);
    return {
      start: () => { run = true; }, pause: () => { run = !run; return run; },
      restart: () => { reset(); run = true; },
      destroy: () => { stop(); g.c.removeEventListener('pointermove', move); g.c.removeEventListener('pointerdown', move); window.removeEventListener('keydown', key); g.dispose(); }
    };
  }

  gameParking(host, api) {
    const g = this.mkCanvas(host, '4 / 3'), ctx = g.ctx;
    let s = null, run = false, keys = {}, zone = 0;
    const level = n => {
      const L = [
        { slot: { x: 0.82, y: 0.22, a: 0 }, walls: [{ x: 0.5, y: 0.55, w: 0.5, h: 0.06 }] },
        { slot: { x: 0.18, y: 0.78, a: 0 }, walls: [{ x: 0.55, y: 0.4, w: 0.06, h: 0.5 }, { x: 0.2, y: 0.45, w: 0.3, h: 0.06 }] },
        { slot: { x: 0.8, y: 0.8, a: Math.PI / 2 }, walls: [{ x: 0.45, y: 0.3, w: 0.06, h: 0.45 }, { x: 0.7, y: 0.5, w: 0.35, h: 0.06 }] }
      ];
      return L[(n - 1) % L.length];
    };
    const reset = () => { s = { x: 0.12, y: 0.15, a: 0, v: 0, lvl: 1, score: 0, t: 0 }; api.setScore(0); };
    const nextLevel = () => { s.lvl++; s.x = 0.12; s.y = 0.15; s.a = 0; s.v = 0; };
    const down = ev => {
      const p = g.pos(ev), W = g.W(), H = g.H();
      if (p.y > H * 0.78) { zone = p.x < W / 3 ? -1 : p.x > W * 2 / 3 ? 1 : 2; }
      else zone = 2;
    };
    const up = () => { zone = 0; };
    const key = e => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'].indexOf(e.key) >= 0) e.preventDefault();
      keys[e.key] = e.type === 'keydown';
    };
    const tick = dt => {
      const W = g.W(), H = g.H(), lv = level(s.lvl);
      if (run) {
        const gas = keys.ArrowUp || keys.w || zone === 2, rev = keys.ArrowDown || keys.s;
        const left = keys.ArrowLeft || keys.a || zone === -1, right = keys.ArrowRight || keys.d || zone === 1;
        if (gas) s.v = Math.min(0.28, s.v + dt * 0.42);
        else if (rev) s.v = Math.max(-0.16, s.v - dt * 0.36);
        else s.v *= (1 - dt * 2.2);
        if (Math.abs(s.v) > 0.005) {
          if (left) s.a -= dt * 2.2 * (s.v > 0 ? 1 : -1);
          if (right) s.a += dt * 2.2 * (s.v > 0 ? 1 : -1);
        }
        s.x += Math.cos(s.a) * s.v * dt; s.y += Math.sin(s.a) * s.v * dt;
        let hit = s.x < 0.05 || s.x > 0.95 || s.y < 0.05 || s.y > 0.95;
        lv.walls.forEach(w => {
          if (Math.abs(s.x - w.x) < w.w / 2 + 0.03 && Math.abs(s.y - w.y) < w.h / 2 + 0.03) hit = true;
        });
        if (hit) { s.v = -s.v * 0.4; s.score = Math.max(0, s.score - 5); api.setScore(Math.floor(s.score)); api.sound(150, 0.1, 'sawtooth'); s.x = Math.max(0.06, Math.min(0.94, s.x)); s.y = Math.max(0.06, Math.min(0.94, s.y)); }
        const da = Math.abs(((s.a - lv.slot.a) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI) - Math.PI;
        if (Math.hypot(s.x - lv.slot.x, s.y - lv.slot.y) < 0.06 && Math.abs(da) < 0.45 && Math.abs(s.v) < 0.05) {
          s.score += 150; api.setScore(Math.floor(s.score)); api.sound(1100, 0.14);
          if (s.lvl >= 3) { run = false; api.gameOver('All three bays parked — ' + Math.floor(s.score) + ' points.'); }
          else nextLevel();
        }
      }
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#14162c'; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = '#d8f24b'; ctx.lineWidth = 3; ctx.setLineDash([8, 6]);
      ctx.save(); ctx.translate(lv.slot.x * W, lv.slot.y * H); ctx.rotate(lv.slot.a);
      ctx.strokeRect(-W * 0.07, -H * 0.05, W * 0.14, H * 0.1); ctx.restore(); ctx.setLineDash([]);
      lv.walls.forEach(w => { ctx.fillStyle = '#2b2f52'; ctx.fillRect((w.x - w.w / 2) * W, (w.y - w.h / 2) * H, w.w * W, w.h * H); });
      ctx.save(); ctx.translate(s.x * W, s.y * H); ctx.rotate(s.a);
      ctx.fillStyle = '#4bd6f2'; this.rr(ctx, -W * 0.06, -H * 0.038, W * 0.12, H * 0.076, 8); ctx.fill();
      ctx.fillStyle = '#0a0b18'; ctx.fillRect(W * 0.01, -H * 0.024, W * 0.03, H * 0.048); ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.fillRect(0, H * 0.78, W, H * 0.22);
      ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.font = '700 13px "DM Sans", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('◀ STEER', W / 6, H * 0.9); ctx.fillText('GAS', W / 2, H * 0.9); ctx.fillText('STEER ▶', W * 5 / 6, H * 0.9);
      ctx.textAlign = 'start';
      this.hud(ctx, W, 'Bay ' + s.lvl + ' of 3');
    };
    reset();
    g.c.addEventListener('pointerdown', down); g.c.addEventListener('pointerup', up); g.c.addEventListener('pointerleave', up);
    window.addEventListener('keydown', key); window.addEventListener('keyup', key);
    const stop = this.loop(tick);
    return {
      start: () => { run = true; }, pause: () => { run = !run; return run; },
      restart: () => { reset(); run = true; },
      destroy: () => { stop(); g.c.removeEventListener('pointerdown', down); g.c.removeEventListener('pointerup', up); g.c.removeEventListener('pointerleave', up); window.removeEventListener('keydown', key); window.removeEventListener('keyup', key); g.dispose(); }
    };
  }

  gameMaze(host, api) {
    const g = this.mkCanvas(host, '1 / 1'), ctx = g.ctx;
    let N = 9, cells = [], px = 0, py = 0, run = false, lvl = 1, score = 0, t = 0;
    const idx = (x, y) => y * N + x;
    const build = () => {
      cells = [];
      for (let i = 0; i < N * N; i++) cells.push({ n: true, e: true, s: true, w: true, v: false });
      const stack = [{ x: 0, y: 0 }];
      cells[0].v = true;
      while (stack.length) {
        const c = stack[stack.length - 1];
        const opts = [];
        if (c.y > 0 && !cells[idx(c.x, c.y - 1)].v) opts.push('n');
        if (c.x < N - 1 && !cells[idx(c.x + 1, c.y)].v) opts.push('e');
        if (c.y < N - 1 && !cells[idx(c.x, c.y + 1)].v) opts.push('s');
        if (c.x > 0 && !cells[idx(c.x - 1, c.y)].v) opts.push('w');
        if (!opts.length) { stack.pop(); continue; }
        const d = opts[Math.floor(Math.random() * opts.length)];
        const nx = c.x + (d === 'e' ? 1 : d === 'w' ? -1 : 0), ny = c.y + (d === 's' ? 1 : d === 'n' ? -1 : 0);
        cells[idx(c.x, c.y)][d] = false;
        cells[idx(nx, ny)][{ n: 's', s: 'n', e: 'w', w: 'e' }[d]] = false;
        cells[idx(nx, ny)].v = true;
        stack.push({ x: nx, y: ny });
      }
    };
    const reset = () => { N = 9; lvl = 1; score = 0; t = 0; px = py = 0; build(); api.setScore(0); };
    const step = d => {
      if (!run) return;
      const c = cells[idx(px, py)];
      if (d === 'up' && !c.n) py--;
      else if (d === 'down' && !c.s) py++;
      else if (d === 'left' && !c.w) px--;
      else if (d === 'right' && !c.e) px++;
      else { api.sound(180, 0.04, 'sawtooth'); return; }
      api.sound(680, 0.03);
      if (px === N - 1 && py === N - 1) {
        score += Math.max(60, 400 - Math.floor(t) * 6); api.setScore(score); api.sound(1200, 0.15);
        if (lvl >= 3) { run = false; api.gameOver('Three mazes escaped — ' + score + ' points.'); return; }
        lvl++; N += 2; t = 0; px = py = 0; build();
      }
    };
    const key = e => {
      const m = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' }[e.key];
      if (m) { e.preventDefault(); step(m); }
    };
    const tick = dt => {
      if (run) t += dt;
      const W = g.W(), H = g.H(), S = Math.min(W, H) * 0.94, cs = S / N, ox = (W - S) / 2, oy = (H - S) / 2;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#0a0b18'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(216,242,75,.16)'; ctx.fillRect(ox + (N - 1) * cs, oy + (N - 1) * cs, cs, cs);
      ctx.strokeStyle = '#585d8f'; ctx.lineWidth = Math.max(2, cs * 0.09); ctx.lineCap = 'round';
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const c = cells[idx(x, y)], X = ox + x * cs, Y = oy + y * cs;
        ctx.beginPath();
        if (c.n) { ctx.moveTo(X, Y); ctx.lineTo(X + cs, Y); }
        if (c.w) { ctx.moveTo(X, Y); ctx.lineTo(X, Y + cs); }
        if (y === N - 1 && c.s) { ctx.moveTo(X, Y + cs); ctx.lineTo(X + cs, Y + cs); }
        if (x === N - 1 && c.e) { ctx.moveTo(X + cs, Y); ctx.lineTo(X + cs, Y + cs); }
        ctx.stroke();
      }
      ctx.fillStyle = '#d8f24b';
      ctx.beginPath(); ctx.arc(ox + px * cs + cs / 2, oy + py * cs + cs / 2, cs * 0.28, 0, 6.3); ctx.fill();
      this.hud(ctx, W, 'Maze ' + lvl + ' of 3   ' + Math.floor(t) + 's');
    };
    reset();
    window.addEventListener('keydown', key);
    const offSwipe = this.swipe(g.c, d => { if (d !== 'tap') step(d); });
    const stop = this.loop(tick);
    return {
      start: () => { run = true; }, pause: () => { run = !run; return run; },
      restart: () => { reset(); run = true; },
      destroy: () => { stop(); offSwipe(); window.removeEventListener('keydown', key); g.dispose(); }
    };
  }

  gameMines(host, api) {
    const g = this.mkCanvas(host, '1 / 1'), ctx = g.ctx, N = 9, MINES = 10;
    let cells = [], run = false, flagMode = false, score = 0, left = 0;
    const reset = () => {
      cells = [];
      for (let i = 0; i < N * N; i++) cells.push({ m: false, r: false, f: false, n: 0 });
      let placed = 0;
      while (placed < MINES) { const i = Math.floor(Math.random() * N * N); if (!cells[i].m) { cells[i].m = true; placed++; } }
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < N && ny < N && cells[ny * N + nx].m) n++;
        }
        cells[y * N + x].n = n;
      }
      score = 0; left = N * N - MINES; flagMode = false; api.setScore(0);
    };
    const reveal = (x, y) => {
      if (x < 0 || y < 0 || x >= N || y >= N) return;
      const c = cells[y * N + x];
      if (c.r || c.f) return;
      c.r = true;
      if (c.m) { run = false; cells.forEach(k => { if (k.m) k.r = true; }); api.gameOver('Boom — you hit a mine.'); return; }
      score += 12; left--; api.setScore(score);
      if (c.n === 0) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) reveal(x + dx, y + dy);
      if (left <= 0) { run = false; score += 200; api.setScore(score); api.gameOver('Field cleared — ' + score + ' points.'); }
    };
    const click = ev => {
      const W = g.W(), H = g.H(), S = Math.min(W, H) * 0.94, cs = S / N, ox = (W - S) / 2, oy = (H - S) / 2;
      const p = g.pos(ev);
      if (p.y < oy - 6) { flagMode = !flagMode; api.sound(500, 0.05); return; }
      if (!run) return;
      const x = Math.floor((p.x - ox) / cs), y = Math.floor((p.y - oy) / cs);
      if (x < 0 || y < 0 || x >= N || y >= N) return;
      const c = cells[y * N + x];
      if (flagMode) { if (!c.r) { c.f = !c.f; api.sound(760, 0.04); } return; }
      reveal(x, y); api.sound(620, 0.04);
    };
    const tick = () => {
      const W = g.W(), H = g.H(), S = Math.min(W, H) * 0.94, cs = S / N, ox = (W - S) / 2, oy = (H - S) / 2;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#0a0b18'; ctx.fillRect(0, 0, W, H);
      const cols = ['', '#4bd6f2', '#4bf2a7', '#d8f24b', '#f2b04b', '#ff6b5d', '#ff4bd8', '#9c6cff', '#f2f2f7'];
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const c = cells[y * N + x], X = ox + x * cs + 2, Y = oy + y * cs + 2, s2 = cs - 4;
        ctx.fillStyle = c.r ? (c.m ? '#ff6b5d' : 'rgba(255,255,255,.07)') : '#242848';
        this.rr(ctx, X, Y, s2, s2, 5); ctx.fill();
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        if (c.r && !c.m && c.n) {
          ctx.fillStyle = cols[c.n]; ctx.font = '800 ' + Math.round(cs * 0.5) + 'px "Bricolage Grotesque", sans-serif';
          ctx.fillText(String(c.n), X + s2 / 2, Y + s2 / 2 + 1);
        } else if (c.f && !c.r) {
          ctx.fillStyle = '#d8f24b'; ctx.font = '800 ' + Math.round(cs * 0.45) + 'px "DM Sans", sans-serif';
          ctx.fillText('⚑', X + s2 / 2, Y + s2 / 2 + 1);
        } else if (c.r && c.m) {
          ctx.fillStyle = '#0a0b18'; ctx.beginPath(); ctx.arc(X + s2 / 2, Y + s2 / 2, s2 * 0.22, 0, 6.3); ctx.fill();
        }
        ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
      }
      ctx.fillStyle = flagMode ? '#d8f24b' : 'rgba(255,255,255,.12)';
      this.rr(ctx, W - 132, 6, 126, oy - 14 > 22 ? oy - 14 : 22, 8); ctx.fill();
      ctx.fillStyle = flagMode ? '#14152b' : 'rgba(255,255,255,.6)';
      ctx.font = '700 12px "DM Sans", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(flagMode ? '⚑ FLAG MODE ON' : 'TAP FOR FLAG MODE', W - 69, 6 + Math.max(22, oy - 14) / 2 + 4);
      ctx.textAlign = 'start';
      this.hud(ctx, W, 'Safe cells left ' + left);
    };
    reset();
    g.c.addEventListener('pointerdown', click);
    const stop = this.loop(tick);
    return {
      start: () => { run = true; }, pause: () => { run = !run; return run; },
      restart: () => { reset(); run = true; },
      destroy: () => { stop(); g.c.removeEventListener('pointerdown', click); g.dispose(); }
    };
  }

  gameSudoku(host, api) {
    host.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.style.cssText = 'width:100%;max-width:620px;display:flex;flex-direction:column;gap:12px';
    const board = document.createElement('div');
    const pad = document.createElement('div');
    pad.style.cssText = 'display:grid;grid-template-columns:repeat(5,1fr);gap:8px';
    wrap.appendChild(board); wrap.appendChild(pad); host.appendChild(wrap);
    const g = this.mkCanvas(board, '1 / 1'), ctx = g.ctx;
    let sol = [], grid = [], fixed = [], sel = -1, run = false, score = 0, wrong = 0;
    const ok = (b, i, v) => {
      const r = Math.floor(i / 9), c = i % 9;
      for (let k = 0; k < 9; k++) {
        if (b[r * 9 + k] === v || b[k * 9 + c] === v) return false;
      }
      const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
      for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) if (b[(br + y) * 9 + bc + x] === v) return false;
      return true;
    };
    const solve = b => {
      const i = b.indexOf(0);
      if (i < 0) return true;
      const nums = [1, 2, 3, 4, 5, 6, 7, 8, 9].sort(() => Math.random() - 0.5);
      for (const v of nums) {
        if (ok(b, i, v)) { b[i] = v; if (solve(b)) return true; b[i] = 0; }
      }
      return false;
    };
    const reset = () => {
      sol = new Array(81).fill(0); solve(sol);
      grid = sol.slice(); fixed = new Array(81).fill(true);
      let holes = 44;
      while (holes > 0) { const i = Math.floor(Math.random() * 81); if (grid[i]) { grid[i] = 0; fixed[i] = false; holes--; } }
      sel = -1; score = 0; wrong = 0; api.setScore(0); paint();
    };
    const place = v => {
      if (!run || sel < 0 || fixed[sel]) return;
      if (v === 0) { grid[sel] = 0; return; }
      grid[sel] = v;
      if (sol[sel] === v) { score += 15; api.setScore(score); api.sound(880, 0.05); }
      else { wrong++; score = Math.max(0, score - 5); api.setScore(score); api.sound(200, 0.1, 'sawtooth'); }
      if (grid.every((x, i) => x === sol[i])) {
        run = false; score += 250; api.setScore(score);
        api.gameOver('Grid solved with ' + wrong + ' slips — ' + score + ' points.');
      }
    };
    for (let v = 1; v <= 9; v++) {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = String(v);
      b.style.cssText = 'padding:14px 0;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:#1b1e3a;color:#f2f2f7;font-weight:700;font-size:18px;cursor:pointer;min-height:48px';
      b.addEventListener('click', () => place(v));
      pad.appendChild(b);
    }
    const er = document.createElement('button');
    er.type = 'button'; er.textContent = 'Erase';
    er.style.cssText = 'padding:14px 0;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:transparent;color:#9a9cb8;font-weight:700;cursor:pointer;min-height:48px';
    er.addEventListener('click', () => place(0));
    pad.appendChild(er);
    const click = ev => {
      if (!run) return;
      const W = g.W(), H = g.H(), S = Math.min(W, H) * 0.96, cs = S / 9, ox = (W - S) / 2, oy = (H - S) / 2;
      const p = g.pos(ev);
      const x = Math.floor((p.x - ox) / cs), y = Math.floor((p.y - oy) / cs);
      if (x < 0 || y < 0 || x > 8 || y > 8) return;
      sel = y * 9 + x;
    };
    const key = e => {
      if (/^[1-9]$/.test(e.key)) { e.preventDefault(); place(parseInt(e.key, 10)); }
      if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); place(0); }
    };
    const paint = () => {
      const W = g.W(), H = g.H(), S = Math.min(W, H) * 0.96, cs = S / 9, ox = (W - S) / 2, oy = (H - S) / 2;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#0f1128'; ctx.fillRect(0, 0, W, H);
      if (sel >= 0) { ctx.fillStyle = 'rgba(216,242,75,.16)'; ctx.fillRect(ox + (sel % 9) * cs, oy + Math.floor(sel / 9) * cs, cs, cs); }
      for (let i = 0; i <= 9; i++) {
        ctx.strokeStyle = i % 3 === 0 ? 'rgba(255,255,255,.4)' : 'rgba(255,255,255,.12)';
        ctx.lineWidth = i % 3 === 0 ? 2.5 : 1;
        ctx.beginPath(); ctx.moveTo(ox + i * cs, oy); ctx.lineTo(ox + i * cs, oy + S); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ox, oy + i * cs); ctx.lineTo(ox + S, oy + i * cs); ctx.stroke();
      }
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '700 ' + Math.round(cs * 0.56) + 'px "DM Sans", sans-serif';
      grid.forEach((v, i) => {
        if (!v) return;
        ctx.fillStyle = fixed[i] ? '#f2f2f7' : (v === sol[i] ? '#d8f24b' : '#ff6b5d');
        ctx.fillText(String(v), ox + (i % 9) * cs + cs / 2, oy + Math.floor(i / 9) * cs + cs / 2 + 1);
      });
      ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
    };
    reset();
    g.c.addEventListener('pointerdown', click);
    window.addEventListener('keydown', key);
    const stop = this.loop(paint);
    return {
      start: () => { run = true; }, pause: () => { run = !run; return run; },
      restart: () => { reset(); run = true; },
      destroy: () => { stop(); g.c.removeEventListener('pointerdown', click); window.removeEventListener('keydown', key); g.dispose(); host.innerHTML = ''; }
    };
  }

  gameWordSprint(host, api) {
    host.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.style.cssText = 'width:100%;max-width:620px;display:flex;flex-direction:column;gap:14px;text-align:center';
    const scram = document.createElement('p');
    scram.style.cssText = 'margin:0;padding:26px 18px;border-radius:16px;background:#12142a;color:#d8f24b;font-family:"Bricolage Grotesque",sans-serif;font-weight:800;font-size:40px;letter-spacing:.18em';
    const hint = document.createElement('p');
    hint.style.cssText = 'margin:0;color:#9a9cb8;font-size:15px';
    const input = document.createElement('input');
    input.type = 'text'; input.setAttribute('aria-label', 'Unscramble the word');
    input.autocomplete = 'off';
    input.style.cssText = 'padding:15px 16px;border-radius:14px;border:1px solid rgba(255,255,255,.14);background:#0a0b18;color:#f2f2f7;font-size:18px;min-height:48px;text-align:center;outline:none';
    const meta = document.createElement('p');
    meta.style.cssText = 'margin:0;color:#9a9cb8;font-size:14px';
    [scram, hint, input, meta].forEach(el => wrap.appendChild(el));
    host.appendChild(wrap);
    const bank = [
      ['harbour', 'where boats tie up'], ['lantern', 'a carried light'], ['gravity', 'what pulls you down'],
      ['pixel', 'smallest picture dot'], ['otter', 'river swimmer'], ['arcade', 'a hall of games'],
      ['puzzle', 'something to solve'], ['marble', 'small glass ball'], ['compass', 'points north'],
      ['thunder', 'follows lightning'], ['ribbon', 'tied on a gift'], ['sprint', 'a short fast run']
    ];
    let run = false, time = 60, word = '', score = 0, solved = 0;
    const scramble = w => {
      let a = w.split('');
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
      const out = a.join('');
      return out === w ? scramble(w) : out;
    };
    const pick = () => {
      const p = bank[Math.floor(Math.random() * bank.length)];
      word = p[0]; scram.textContent = scramble(word).toUpperCase();
      hint.textContent = 'Hint: ' + p[1]; input.value = '';
    };
    const reset = () => { time = 60; score = 0; solved = 0; api.setScore(0); pick(); render(); };
    const render = () => { meta.textContent = 'Time ' + Math.ceil(time) + 's  ·  Solved ' + solved; };
    const onInput = () => {
      if (!run) return;
      if (input.value.trim().toLowerCase() === word) {
        solved++; score += 40 + Math.ceil(time); api.setScore(score); api.sound(1000, 0.06); pick();
      }
    };
    input.addEventListener('input', onInput);
    const stop = this.loop(dt => {
      if (!run) return;
      time -= dt; render();
      if (time <= 0) { time = 0; run = false; input.blur(); api.gameOver('Time! ' + solved + ' words, ' + score + ' points.'); }
    });
    reset();
    return {
      start: () => { run = true; input.focus(); },
      pause: () => { run = !run; if (run) input.focus(); return run; },
      restart: () => { reset(); run = true; input.focus(); },
      destroy: () => { stop(); input.removeEventListener('input', onInput); host.innerHTML = ''; }
    };
  }

  gameMathBlitz(host, api) {
    host.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.style.cssText = 'width:100%;max-width:620px;display:flex;flex-direction:column;gap:14px;text-align:center';
    const q = document.createElement('p');
    q.style.cssText = 'margin:0;padding:30px 18px;border-radius:16px;background:#12142a;color:#f2f2f7;font-family:"Bricolage Grotesque",sans-serif;font-weight:800;font-size:44px';
    const opts = document.createElement('div');
    opts.style.cssText = 'display:grid;grid-template-columns:repeat(2,1fr);gap:10px';
    const meta = document.createElement('p');
    meta.style.cssText = 'margin:0;color:#9a9cb8;font-size:14px';
    wrap.appendChild(q); wrap.appendChild(opts); wrap.appendChild(meta); host.appendChild(wrap);
    const btns = [];
    for (let i = 0; i < 4; i++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.style.cssText = 'padding:18px 10px;border-radius:14px;border:1px solid rgba(255,255,255,.14);background:#1b1e3a;color:#f2f2f7;font-weight:700;font-size:20px;cursor:pointer;min-height:56px';
      b.addEventListener('click', () => answer(i));
      opts.appendChild(b); btns.push(b);
    }
    let run = false, time = 45, score = 0, streak = 0, correct = 0, cur = null, right = 0;
    const make = () => {
      const lvl = Math.min(4, 1 + Math.floor(correct / 5));
      const ops = ['+', '-', '×'].slice(0, lvl >= 3 ? 3 : 2);
      const op = ops[Math.floor(Math.random() * ops.length)];
      const cap = 8 + lvl * 9;
      let a = 1 + Math.floor(Math.random() * cap), b = 1 + Math.floor(Math.random() * (op === '×' ? Math.min(12, cap) : cap));
      if (op === '-' && b > a) { const t = a; a = b; b = t; }
      const v = op === '+' ? a + b : op === '-' ? a - b : a * b;
      q.textContent = a + ' ' + op + ' ' + b;
      const set = [v];
      while (set.length < 4) {
        const d = v + (Math.floor(Math.random() * 11) - 5) * (op === '×' ? 2 : 1);
        if (d !== v && set.indexOf(d) < 0) set.push(d);
      }
      set.sort(() => Math.random() - 0.5);
      right = set.indexOf(v);
      cur = set;
      btns.forEach((b2, i) => { b2.textContent = String(set[i]); });
    };
    const answer = i => {
      if (!run || !cur) return;
      if (i === right) { correct++; streak++; score += 20 + streak * 4; api.sound(960, 0.05); }
      else { streak = 0; score = Math.max(0, score - 10); api.sound(190, 0.1, 'sawtooth'); }
      api.setScore(score); make(); render();
    };
    const render = () => { meta.textContent = 'Time ' + Math.ceil(time) + 's  ·  Correct ' + correct + '  ·  Streak ' + streak; };
    const reset = () => { time = 45; score = 0; streak = 0; correct = 0; api.setScore(0); make(); render(); };
    const key = e => { if (/^[1-4]$/.test(e.key)) { e.preventDefault(); answer(parseInt(e.key, 10) - 1); } };
    window.addEventListener('keydown', key);
    const stop = this.loop(dt => {
      if (!run) return;
      time -= dt; render();
      if (time <= 0) { time = 0; run = false; api.gameOver(correct + ' correct in 45 seconds — ' + score + ' points.'); }
    });
    reset();
    return {
      start: () => { run = true; }, pause: () => { run = !run; return run; },
      restart: () => { reset(); run = true; },
      destroy: () => { stop(); window.removeEventListener('keydown', key); host.innerHTML = ''; }
    };
  }

  gameJumpRunner(host, api) {
    const g = this.mkCanvas(host, '4 / 3'), ctx = g.ctx;
    let s = null, run = false;
    const reset = () => { s = { y: 0.45, v: 0, pipes: [], t: 1.1, score: 0, rot: 0 }; api.setScore(0); };
    const flap = () => { if (run) { s.v = -0.62; api.sound(880, 0.04); } };
    const key = e => { if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w') { e.preventDefault(); flap(); } };
    const tick = dt => {
      const W = g.W(), H = g.H();
      if (run) {
        s.v += dt * 1.9; s.y += s.v * dt; s.rot = Math.max(-0.5, Math.min(0.9, s.v * 0.9));
        s.t -= dt;
        if (s.t <= 0) { s.pipes.push({ x: 1.1, gap: 0.22 + Math.random() * 0.42, w: 0.14, passed: false }); s.t = 1.5; }
        s.pipes.forEach(p => { p.x -= dt * 0.42; });
        s.pipes = s.pipes.filter(p => p.x > -0.2);
        const GAP = 0.26;
        for (const p of s.pipes) {
          if (!p.passed && p.x + p.w / 2 < 0.25) { p.passed = true; s.score += 10; api.setScore(s.score); api.sound(1200, 0.05); }
          if (Math.abs(p.x - 0.25) < p.w / 2 + 0.03 && (s.y < p.gap || s.y > p.gap + GAP)) {
            run = false; api.gameOver('Clipped a pillar at ' + s.score + ' points.');
          }
        }
        if (s.y > 0.97 || s.y < 0.01) { run = false; api.gameOver('Down at ' + s.score + ' points.'); }
      }
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#101a2e'; ctx.fillRect(0, 0, W, H);
      const GAP = 0.26;
      s.pipes.forEach(p => {
        ctx.fillStyle = '#4bf2a7';
        ctx.fillRect((p.x - p.w / 2) * W, 0, p.w * W, p.gap * H);
        ctx.fillRect((p.x - p.w / 2) * W, (p.gap + GAP) * H, p.w * W, H);
      });
      ctx.save(); ctx.translate(0.25 * W, s.y * H); ctx.rotate(s.rot);
      ctx.fillStyle = '#d8f24b'; this.rr(ctx, -16, -12, 32, 24, 9); ctx.fill();
      ctx.fillStyle = '#101a2e'; ctx.fillRect(6, -5, 5, 5); ctx.restore();
      this.hud(ctx, W, 'Tap or press space to rise');
    };
    reset();
    g.c.addEventListener('pointerdown', flap);
    window.addEventListener('keydown', key);
    const stop = this.loop(tick);
    return {
      start: () => { run = true; s.v = -0.5; }, pause: () => { run = !run; return run; },
      restart: () => { reset(); run = true; s.v = -0.5; },
      destroy: () => { stop(); g.c.removeEventListener('pointerdown', flap); window.removeEventListener('keydown', key); g.dispose(); }
    };
  }

  gameHoops(host, api) {
    const g = this.mkCanvas(host, '4 / 3'), ctx = g.ctx;
    let s = null, run = false;
    const reset = () => { s = { phase: 'angle', ang: 0, pow: 0, dir: 1, ball: null, shots: 0, made: 0, score: 0, hoopX: 0.78, hoopY: 0.34, msg: '' }; api.setScore(0); };
    const tap = () => {
      if (!run) return;
      if (s.phase === 'angle') { s.phase = 'power'; s.pow = 0; s.dir = 1; api.sound(700, 0.04); return; }
      if (s.phase === 'power') {
        const a = (25 + s.ang * 45) * Math.PI / 180, p = 0.55 + s.pow * 0.85;
        s.ball = { x: 0.16, y: 0.78, vx: Math.cos(a) * p, vy: -Math.sin(a) * p, scored: false, t: 0 };
        s.phase = 'fly'; api.sound(420, 0.06);
      }
    };
    const key = e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); tap(); } };
    const tick = dt => {
      const W = g.W(), H = g.H();
      if (run) {
        if (s.phase === 'angle') { s.ang += dt * 0.9 * s.dir; if (s.ang > 1) { s.ang = 1; s.dir = -1; } if (s.ang < 0) { s.ang = 0; s.dir = 1; } }
        else if (s.phase === 'power') { s.pow += dt * 1.3 * s.dir; if (s.pow > 1) { s.pow = 1; s.dir = -1; } if (s.pow < 0) { s.pow = 0; s.dir = 1; } }
        else if (s.phase === 'fly' && s.ball) {
          const b = s.ball;
          b.t += dt; b.vy += dt * 1.35; b.x += b.vx * dt; b.y += b.vy * dt;
          if (!b.scored && b.vy > 0 && Math.abs(b.x - s.hoopX) < 0.045 && Math.abs(b.y - s.hoopY) < 0.03) {
            b.scored = true; s.made++; s.score += 100; api.setScore(s.score); api.sound(1300, 0.12);
          }
          if (b.y > 1.05 || b.x > 1.2) {
            s.shots++;
            if (s.shots >= 10) {
              run = false;
              api.gameOver(s.made + ' of 10 shots made — ' + s.score + ' points.');
            } else { s.phase = 'angle'; s.ball = null; s.ang = 0; s.dir = 1; s.hoopX = 0.7 + Math.random() * 0.14; s.hoopY = 0.28 + Math.random() * 0.14; }
          }
        }
      }
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#1a1226'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#2b2040'; ctx.fillRect(0, H * 0.84, W, H * 0.16);
      ctx.fillStyle = '#f2f2f7'; ctx.fillRect(s.hoopX * W + 42, s.hoopY * H - 46, 8, 92);
      ctx.fillStyle = '#ff6b5d'; ctx.fillRect(s.hoopX * W - 40, s.hoopY * H - 3, 80, 6);
      ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(s.hoopX * W - 34, s.hoopY * H + 3); ctx.lineTo(s.hoopX * W - 20, s.hoopY * H + 34);
      ctx.lineTo(s.hoopX * W + 20, s.hoopY * H + 34); ctx.lineTo(s.hoopX * W + 34, s.hoopY * H + 3); ctx.stroke();
      if (s.ball) { ctx.fillStyle = '#f2a04b'; ctx.beginPath(); ctx.arc(s.ball.x * W, s.ball.y * H, 13, 0, 6.3); ctx.fill(); }
      else { ctx.fillStyle = '#f2a04b'; ctx.beginPath(); ctx.arc(0.16 * W, 0.78 * H, 13, 0, 6.3); ctx.fill(); }
      if (s.phase === 'angle' || s.phase === 'power') {
        const barY = H * 0.92, val = s.phase === 'angle' ? s.ang : s.pow;
        ctx.fillStyle = 'rgba(255,255,255,.14)'; this.rr(ctx, W * 0.1, barY, W * 0.8, 14, 7); ctx.fill();
        ctx.fillStyle = s.phase === 'angle' ? '#4bd6f2' : '#d8f24b';
        this.rr(ctx, W * 0.1, barY, W * 0.8 * val, 14, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.font = '700 12px "DM Sans", sans-serif';
        ctx.fillText(s.phase === 'angle' ? 'TAP TO SET ANGLE' : 'TAP TO SET POWER', W * 0.1, barY - 8);
      }
      this.hud(ctx, W, 'Shot ' + Math.min(10, s.shots + 1) + ' of 10   Made ' + s.made);
    };
    reset();
    g.c.addEventListener('pointerdown', tap);
    window.addEventListener('keydown', key);
    const stop = this.loop(tick);
    return {
      start: () => { run = true; }, pause: () => { run = !run; return run; },
      restart: () => { reset(); run = true; },
      destroy: () => { stop(); g.c.removeEventListener('pointerdown', tap); window.removeEventListener('keydown', key); g.dispose(); }
    };
  }

  gamePenalty(host, api) {
    const g = this.mkCanvas(host, '4 / 3'), ctx = g.ctx;
    let s = null, run = false;
    const reset = () => { s = { aim: 0.5, dir: 1, phase: 'aim', shots: 0, goals: 0, score: 0, ball: null, keeper: 0.5, kmove: 0, flash: 0 }; api.setScore(0); };
    const shoot = () => {
      if (!run || s.phase !== 'aim') return;
      const target = s.aim;
      s.keeper = 0.28 + Math.random() * 0.44;
      s.ball = { x: 0.5, y: 0.82, tx: target, t: 0 };
      s.phase = 'fly';
      api.sound(300, 0.08);
    };
    const key = e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); shoot(); } };
    const tick = dt => {
      const W = g.W(), H = g.H();
      if (run) {
        if (s.phase === 'aim') {
          const sp = 0.55 + s.shots * 0.09;
          s.aim += dt * sp * s.dir;
          if (s.aim > 0.86) { s.aim = 0.86; s.dir = -1; }
          if (s.aim < 0.14) { s.aim = 0.14; s.dir = 1; }
        } else if (s.phase === 'fly' && s.ball) {
          s.ball.t += dt * 1.5;
          s.ball.x = 0.5 + (s.ball.tx - 0.5) * Math.min(1, s.ball.t);
          s.ball.y = 0.82 - 0.52 * Math.min(1, s.ball.t);
          s.kmove = Math.min(1, s.ball.t * 1.2);
          if (s.ball.t >= 1) {
            const saved = Math.abs(s.ball.tx - s.keeper) < 0.12;
            s.shots++;
            if (!saved) { s.goals++; s.score += 120; api.setScore(s.score); api.sound(1200, 0.14); }
            else { api.sound(200, 0.14, 'sawtooth'); }
            s.flash = saved ? -1 : 1;
            if (s.shots >= 5) { run = false; api.gameOver(s.goals + ' of 5 scored — ' + s.score + ' points.'); }
            else { s.phase = 'aim'; s.ball = null; s.kmove = 0; }
          }
        }
      }
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#0f2418'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#123020'; ctx.fillRect(0, H * 0.55, W, H * 0.45);
      ctx.strokeStyle = '#f2f2f7'; ctx.lineWidth = 6;
      ctx.strokeRect(W * 0.12, H * 0.16, W * 0.76, H * 0.34);
      ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.lineWidth = 1;
      for (let x = 0; x <= 10; x++) { ctx.beginPath(); ctx.moveTo(W * 0.12 + x * W * 0.076, H * 0.16); ctx.lineTo(W * 0.12 + x * W * 0.076, H * 0.5); ctx.stroke(); }
      const kx = 0.5 + (s.keeper - 0.5) * s.kmove;
      ctx.fillStyle = '#f2b04b';
      this.rr(ctx, kx * W - 22, H * 0.3, 44, H * 0.2, 10); ctx.fill();
      ctx.fillRect(kx * W - 40, H * 0.32, 80, 10);
      if (s.phase === 'aim') {
        ctx.strokeStyle = '#d8f24b'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(s.aim * W, H * 0.3, 16, 0, 6.3); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(s.aim * W - 24, H * 0.3); ctx.lineTo(s.aim * W + 24, H * 0.3); ctx.stroke();
      }
      const bx = s.ball ? s.ball.x : 0.5, by = s.ball ? s.ball.y : 0.82;
      ctx.fillStyle = '#f2f2f7'; ctx.beginPath(); ctx.arc(bx * W, by * H, 12, 0, 6.3); ctx.fill();
      this.hud(ctx, W, 'Kick ' + Math.min(5, s.shots + 1) + ' of 5   Scored ' + s.goals);
    };
    reset();
    g.c.addEventListener('pointerdown', shoot);
    window.addEventListener('keydown', key);
    const stop = this.loop(tick);
    return {
      start: () => { run = true; }, pause: () => { run = !run; return run; },
      restart: () => { reset(); run = true; },
      destroy: () => { stop(); g.c.removeEventListener('pointerdown', shoot); window.removeEventListener('keydown', key); g.dispose(); }
    };
  }

  gameMiniGolf(host, api) {
    const g = this.mkCanvas(host, '3 / 4'), ctx = g.ctx;
    let s = null, run = false, drag = null;
    const holes = [
      { ball: { x: 0.5, y: 0.85 }, hole: { x: 0.5, y: 0.16 }, walls: [{ x: 0.5, y: 0.52, w: 0.44, h: 0.04 }] },
      { ball: { x: 0.22, y: 0.86 }, hole: { x: 0.78, y: 0.18 }, walls: [{ x: 0.5, y: 0.62, w: 0.06, h: 0.4 }, { x: 0.42, y: 0.34, w: 0.5, h: 0.05 }] },
      { ball: { x: 0.5, y: 0.88 }, hole: { x: 0.5, y: 0.12 }, walls: [{ x: 0.28, y: 0.5, w: 0.3, h: 0.05 }, { x: 0.72, y: 0.34, w: 0.3, h: 0.05 }] }
    ];
    const load = n => {
      const h = holes[n % holes.length];
      s.ball = { x: h.ball.x, y: h.ball.y, vx: 0, vy: 0 };
      s.hole = h.hole; s.walls = h.walls; s.strokes = 0;
    };
    const reset = () => { s = { n: 0, total: 0, score: 0 }; load(0); api.setScore(0); };
    const down = ev => { if (!run || Math.hypot(s.ball.vx, s.ball.vy) > 0.01) return; drag = g.pos(ev); };
    const up = ev => {
      if (!run || !drag) return;
      const p = g.pos(ev), W = g.W(), H = g.H();
      const dx = (drag.x - p.x) / W, dy = (drag.y - p.y) / H;
      const m = Math.min(1.4, Math.hypot(dx, dy) * 2.6);
      if (m > 0.05) {
        const a = Math.atan2(dy, dx);
        s.ball.vx = Math.cos(a) * m; s.ball.vy = Math.sin(a) * m;
        s.strokes++; s.total++; api.sound(520, 0.06);
      }
      drag = null;
    };
    const tick = dt => {
      const W = g.W(), H = g.H();
      if (run) {
        const b = s.ball;
        b.x += b.vx * dt; b.y += b.vy * dt;
        b.vx *= (1 - dt * 1.3); b.vy *= (1 - dt * 1.3);
        if (Math.abs(b.vx) < 0.008 && Math.abs(b.vy) < 0.008) { b.vx = 0; b.vy = 0; }
        if (b.x < 0.04) { b.x = 0.04; b.vx = -b.vx * 0.7; }
        if (b.x > 0.96) { b.x = 0.96; b.vx = -b.vx * 0.7; }
        if (b.y < 0.04) { b.y = 0.04; b.vy = -b.vy * 0.7; }
        if (b.y > 0.96) { b.y = 0.96; b.vy = -b.vy * 0.7; }
        s.walls.forEach(w => {
          if (Math.abs(b.x - w.x) < w.w / 2 + 0.02 && Math.abs(b.y - w.y) < w.h / 2 + 0.02) {
            if (w.w > w.h) { b.vy = -b.vy * 0.75; b.y += b.vy > 0 ? 0.015 : -0.015; }
            else { b.vx = -b.vx * 0.75; b.x += b.vx > 0 ? 0.015 : -0.015; }
            api.sound(360, 0.04);
          }
        });
        if (Math.hypot(b.x - s.hole.x, (b.y - s.hole.y) * 0.75) < 0.035 && Math.hypot(b.vx, b.vy) < 0.5) {
          s.score += Math.max(40, 220 - s.strokes * 35); api.setScore(s.score); api.sound(1250, 0.16);
          s.n++;
          if (s.n >= holes.length) { run = false; api.gameOver('Three holes in ' + s.total + ' strokes — ' + s.score + ' points.'); }
          else load(s.n);
        }
      }
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#123522'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#17442b'; ctx.fillRect(W * 0.03, H * 0.03, W * 0.94, H * 0.94);
      s.walls.forEach(w => { ctx.fillStyle = '#7c5a3a'; this.rr(ctx, (w.x - w.w / 2) * W, (w.y - w.h / 2) * H, w.w * W, w.h * H, 5); ctx.fill(); });
      ctx.fillStyle = '#0a0b18'; ctx.beginPath(); ctx.arc(s.hole.x * W, s.hole.y * H, 15, 0, 6.3); ctx.fill();
      ctx.fillStyle = '#d8f24b'; ctx.fillRect(s.hole.x * W - 1, s.hole.y * H - 44, 3, 44);
      ctx.fillStyle = '#ff6b5d'; ctx.beginPath(); ctx.moveTo(s.hole.x * W + 2, s.hole.y * H - 44); ctx.lineTo(s.hole.x * W + 26, s.hole.y * H - 36); ctx.lineTo(s.hole.x * W + 2, s.hole.y * H - 28); ctx.fill();
      ctx.fillStyle = '#f2f2f7'; ctx.beginPath(); ctx.arc(s.ball.x * W, s.ball.y * H, 10, 0, 6.3); ctx.fill();
      if (drag) {
        ctx.strokeStyle = 'rgba(216,242,75,.7)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(s.ball.x * W, s.ball.y * H); ctx.lineTo(drag.x, drag.y); ctx.stroke();
      }
      this.hud(ctx, W, 'Hole ' + (s.n + 1) + ' of 3   Strokes ' + s.strokes + '   Drag back to putt');
    };
    reset();
    g.c.addEventListener('pointerdown', down); g.c.addEventListener('pointerup', up);
    const stop = this.loop(tick);
    return {
      start: () => { run = true; }, pause: () => { run = !run; return run; },
      restart: () => { reset(); run = true; },
      destroy: () => { stop(); g.c.removeEventListener('pointerdown', down); g.c.removeEventListener('pointerup', up); g.dispose(); }
    };
  }

  gameCheckers(host, api) {
    const g = this.mkCanvas(host, '1 / 1'), ctx = g.ctx, N = 8;
    let b = [], run = false, sel = -1, score = 0, msg = '', side = 1;
    const reset = () => {
      side = 1;
      b = new Array(64).fill(0);
      for (let y = 0; y < 3; y++) for (let x = 0; x < N; x++) if ((x + y) % 2 === 1) b[y * N + x] = -1;
      for (let y = 5; y < 8; y++) for (let x = 0; x < N; x++) if ((x + y) % 2 === 1) b[y * N + x] = 1;
      sel = -1; score = 0; msg = 'Your move'; api.setScore(0);
    };
    const own = (v, p) => p > 0 ? v > 0 : v < 0;
    const moves = p => {
      const out = [];
      for (let i = 0; i < 64; i++) {
        const v = b[i];
        if (!v || !own(v, p)) continue;
        const x = i % N, y = Math.floor(i / N), king = Math.abs(v) === 2;
        const dirs = king ? [[1, 1], [1, -1], [-1, 1], [-1, -1]] : (p > 0 ? [[1, -1], [-1, -1]] : [[1, 1], [-1, 1]]);
        dirs.forEach(d => {
          const nx = x + d[0], ny = y + d[1];
          if (nx < 0 || ny < 0 || nx >= N || ny >= N) return;
          const t = b[ny * N + nx];
          if (!t) out.push({ from: i, to: ny * N + nx, cap: -1 });
          else if (!own(t, p)) {
            const jx = x + d[0] * 2, jy = y + d[1] * 2;
            if (jx >= 0 && jy >= 0 && jx < N && jy < N && !b[jy * N + jx]) out.push({ from: i, to: jy * N + jx, cap: ny * N + nx });
          }
        });
      }
      const caps = out.filter(m => m.cap >= 0);
      return caps.length ? caps : out;
    };
    const apply = m => {
      const v = b[m.from];
      b[m.from] = 0; b[m.to] = v;
      if (m.cap >= 0) b[m.cap] = 0;
      const y = Math.floor(m.to / N);
      if (v === 1 && y === 0) b[m.to] = 2;
      if (v === -1 && y === N - 1) b[m.to] = -2;
    };
    const finish = () => {
      const mine = moves(1), theirs = moves(-1);
      if (!mine.length) { run = false; api.gameOver('No moves left — the machine wins.'); return true; }
      if (!theirs.length) { run = false; score += 300; api.setScore(score); api.gameOver('You locked it down — ' + score + ' points.'); return true; }
      return false;
    };
    const aiTurn = () => {
      const ms = moves(-1);
      if (!ms.length) { finish(); return; }
      const caps = ms.filter(m => m.cap >= 0);
      const pick = caps.length ? caps[Math.floor(Math.random() * caps.length)] : ms[Math.floor(Math.random() * ms.length)];
      apply(pick); api.sound(360, 0.06);
      msg = 'Your move';
      finish();
    };
    const click = ev => {
      if (!run) return;
      const W = g.W(), H = g.H(), S = Math.min(W, H) * 0.96, cs = S / N, ox = (W - S) / 2, oy = (H - S) / 2;
      const p = g.pos(ev);
      const x = Math.floor((p.x - ox) / cs), y = Math.floor((p.y - oy) / cs);
      if (x < 0 || y < 0 || x > 7 || y > 7) return;
      const two = api.twoPlayer && api.twoPlayer();
      const i = y * N + x, ms = moves(two ? side : 1);
      if (sel >= 0) {
        const m = ms.find(k => k.from === sel && k.to === i);
        if (m) {
          apply(m); sel = -1;
          if (m.cap >= 0) { score += 45; api.setScore(score); api.sound(950, 0.06); } else api.sound(620, 0.05);
          if (two) {
            side = -side;
            msg = side > 0 ? 'Lime to play' : 'Coral to play';
            if (!moves(side).length) { run = false; api.gameOver((side > 0 ? 'Coral' : 'Lime') + ' wins — no moves left.'); }
            return;
          }
          msg = 'Thinking…';
          if (!finish()) setTimeout(() => { if (run) aiTurn(); }, 360);
          return;
        }
      }
      sel = (two ? (side > 0 ? b[i] > 0 : b[i] < 0) : b[i] > 0) ? i : -1;
    };
    const tick = () => {
      const W = g.W(), H = g.H(), S = Math.min(W, H) * 0.96, cs = S / N, ox = (W - S) / 2, oy = (H - S) / 2;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#0a0b18'; ctx.fillRect(0, 0, W, H);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        ctx.fillStyle = (x + y) % 2 === 1 ? '#232746' : '#131630';
        ctx.fillRect(ox + x * cs, oy + y * cs, cs, cs);
      }
      if (sel >= 0) {
        ctx.fillStyle = 'rgba(216,242,75,.2)';
        ctx.fillRect(ox + (sel % N) * cs, oy + Math.floor(sel / N) * cs, cs, cs);
        moves(api.twoPlayer && api.twoPlayer() ? side : 1).filter(m => m.from === sel).forEach(m => {
          ctx.fillStyle = 'rgba(216,242,75,.32)';
          ctx.beginPath(); ctx.arc(ox + (m.to % N) * cs + cs / 2, oy + Math.floor(m.to / N) * cs + cs / 2, cs * 0.16, 0, 6.3); ctx.fill();
        });
      }
      b.forEach((v, i) => {
        if (!v) return;
        const cx = ox + (i % N) * cs + cs / 2, cy = oy + Math.floor(i / N) * cs + cs / 2;
        ctx.fillStyle = v > 0 ? '#d8f24b' : '#ff6b5d';
        ctx.beginPath(); ctx.arc(cx, cy, cs * 0.34, 0, 6.3); ctx.fill();
        if (Math.abs(v) === 2) {
          ctx.fillStyle = '#0a0b18'; ctx.font = '800 ' + Math.round(cs * 0.34) + 'px "Bricolage Grotesque", sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('K', cx, cy + 1); ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
        }
      });
      this.hud(ctx, W, msg);
    };
    reset();
    g.c.addEventListener('pointerdown', click);
    const stop = this.loop(tick);
    return {
      start: () => { run = true; }, pause: () => { run = !run; return run; },
      restart: () => { reset(); run = true; },
      destroy: () => { stop(); g.c.removeEventListener('pointerdown', click); g.dispose(); }
    };
  }

  gameBubblePop(host, api) {
    const g = this.mkCanvas(host, '1 / 1'), ctx = g.ctx, N = 8;
    const cols = ['#d8f24b', '#ff6b5d', '#4bd6f2', '#7c6cff', '#4bf2a7'];
    let grid = [], run = false, score = 0, time = 60, pops = 0;
    const reset = () => {
      grid = [];
      for (let i = 0; i < N * N; i++) grid.push(Math.floor(Math.random() * cols.length));
      score = 0; time = 60; pops = 0; api.setScore(0);
    };
    const group = start => {
      const c = grid[start], seen = {}, stack = [start], out = [];
      if (c === null) return out;
      while (stack.length) {
        const i = stack.pop();
        if (seen[i] || grid[i] !== c) continue;
        seen[i] = 1; out.push(i);
        const x = i % N, y = Math.floor(i / N);
        if (x > 0) stack.push(i - 1);
        if (x < N - 1) stack.push(i + 1);
        if (y > 0) stack.push(i - N);
        if (y < N - 1) stack.push(i + N);
      }
      return out;
    };
    const collapse = () => {
      for (let x = 0; x < N; x++) {
        const col = [];
        for (let y = N - 1; y >= 0; y--) { const v = grid[y * N + x]; if (v !== null) col.push(v); }
        for (let y = N - 1, k = 0; y >= 0; y--, k++) grid[y * N + x] = k < col.length ? col[k] : Math.floor(Math.random() * cols.length);
      }
    };
    const click = ev => {
      if (!run) return;
      const W = g.W(), H = g.H(), S = Math.min(W, H) * 0.96, cs = S / N, ox = (W - S) / 2, oy = (H - S) / 2;
      const p = g.pos(ev);
      const x = Math.floor((p.x - ox) / cs), y = Math.floor((p.y - oy) / cs);
      if (x < 0 || y < 0 || x >= N || y >= N) return;
      const grp = group(y * N + x);
      if (grp.length < 2) { api.sound(200, 0.05, 'sawtooth'); return; }
      grp.forEach(i => { grid[i] = null; });
      collapse();
      pops++; score += grp.length * grp.length * 4; api.setScore(score);
      api.sound(700 + grp.length * 55, 0.05);
    };
    const tick = dt => {
      const W = g.W(), H = g.H(), S = Math.min(W, H) * 0.96, cs = S / N, ox = (W - S) / 2, oy = (H - S) / 2;
      if (run) {
        time -= dt;
        if (time <= 0) { time = 0; run = false; api.gameOver(pops + ' clusters popped — ' + score + ' points.'); }
      }
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#0a0b18'; ctx.fillRect(0, 0, W, H);
      grid.forEach((v, i) => {
        if (v === null) return;
        const x = i % N, y = Math.floor(i / N);
        ctx.fillStyle = cols[v];
        ctx.beginPath(); ctx.arc(ox + x * cs + cs / 2, oy + y * cs + cs / 2, cs * 0.42, 0, 6.3); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.25)';
        ctx.beginPath(); ctx.arc(ox + x * cs + cs * 0.36, oy + y * cs + cs * 0.34, cs * 0.1, 0, 6.3); ctx.fill();
      });
      this.hud(ctx, W, 'Time ' + Math.ceil(time) + 's   Clusters ' + pops);
    };
    reset();
    g.c.addEventListener('pointerdown', click);
    const stop = this.loop(tick);
    return {
      start: () => { run = true; }, pause: () => { run = !run; return run; },
      restart: () => { reset(); run = true; },
      destroy: () => { stop(); g.c.removeEventListener('pointerdown', click); g.dispose(); }
    };
  }

  gameBowling(host, api) {
    const g = this.mkCanvas(host, '3 / 4'), ctx = g.ctx;
    let s = null, run = false;
    const newPins = () => {
      const p = [], rows = [[0.5], [0.44, 0.56], [0.38, 0.5, 0.62], [0.32, 0.44, 0.56, 0.68]];
      rows.forEach((r, i) => r.forEach(x => p.push({ x: x, y: 0.16 + i * 0.055, up: true })));
      return p;
    };
    const reset = () => { s = { phase: 'aim', aim: 0.5, dir: 1, pow: 0, ball: null, pins: newPins(), throws: 0, down: 0, score: 0 }; api.setScore(0); };
    const tap = () => {
      if (!run) return;
      if (s.phase === 'aim') { s.phase = 'power'; s.pow = 0; s.dir = 1; api.sound(620, 0.04); return; }
      if (s.phase === 'power') {
        s.ball = { x: s.aim, y: 0.92, vx: (0.5 - s.aim) * 0.18, vy: -(0.5 + s.pow * 0.85) };
        s.phase = 'roll'; api.sound(300, 0.08);
      }
    };
    const key = e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); tap(); } };
    const tick = dt => {
      const W = g.W(), H = g.H();
      if (run) {
        if (s.phase === 'aim') { s.aim += dt * 0.5 * s.dir; if (s.aim > 0.72) { s.aim = 0.72; s.dir = -1; } if (s.aim < 0.28) { s.aim = 0.28; s.dir = 1; } }
        else if (s.phase === 'power') { s.pow += dt * 1.2 * s.dir; if (s.pow > 1) { s.pow = 1; s.dir = -1; } if (s.pow < 0) { s.pow = 0; s.dir = 1; } }
        else if (s.phase === 'roll' && s.ball) {
          const b = s.ball;
          b.x += b.vx * dt; b.y += b.vy * dt;
          s.pins.forEach(p => {
            if (p.up && Math.hypot(p.x - b.x, p.y - b.y) < 0.045) {
              p.up = false; s.down++; s.score += 30; api.setScore(s.score); api.sound(900, 0.05);
              s.pins.forEach(q => { if (q.up && Math.hypot(q.x - p.x, q.y - p.y) < 0.075 && Math.random() < 0.6) { q.up = false; s.down++; s.score += 30; } });
              api.setScore(s.score);
            }
          });
          if (b.y < 0.06) {
            s.throws++;
            const standing = s.pins.filter(p => p.up).length;
            if (standing === 0) { s.score += 100; api.setScore(s.score); api.sound(1300, 0.16); }
            if (s.throws >= 5) { run = false; api.gameOver(s.down + ' pins in 5 throws — ' + s.score + ' points.'); }
            else { s.phase = 'aim'; s.ball = null; s.pins = newPins(); s.aim = 0.5; s.dir = 1; }
          }
        }
      }
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#171226'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#3a2c1c'; ctx.fillRect(W * 0.2, 0, W * 0.6, H * 0.96);
      ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 1;
      for (let k = 1; k < 6; k++) { ctx.beginPath(); ctx.moveTo(W * (0.2 + k * 0.1), 0); ctx.lineTo(W * (0.2 + k * 0.1), H * 0.96); ctx.stroke(); }
      s.pins.forEach(p => {
        if (!p.up) return;
        ctx.fillStyle = '#f2f2f7';
        this.rr(ctx, p.x * W - 7, p.y * H - 14, 14, 26, 6); ctx.fill();
        ctx.fillStyle = '#ff6b5d'; ctx.fillRect(p.x * W - 7, p.y * H - 6, 14, 4);
      });
      if (s.ball) { ctx.fillStyle = '#7c6cff'; ctx.beginPath(); ctx.arc(s.ball.x * W, s.ball.y * H, 15, 0, 6.3); ctx.fill(); }
      else { ctx.fillStyle = '#7c6cff'; ctx.beginPath(); ctx.arc(s.aim * W, 0.92 * H, 15, 0, 6.3); ctx.fill(); }
      if (s.phase === 'aim' || s.phase === 'power') {
        const val = s.phase === 'aim' ? (s.aim - 0.28) / 0.44 : s.pow;
        ctx.fillStyle = 'rgba(255,255,255,.14)'; this.rr(ctx, W * 0.1, H * 0.965, W * 0.8, 12, 6); ctx.fill();
        ctx.fillStyle = s.phase === 'aim' ? '#4bd6f2' : '#d8f24b';
        this.rr(ctx, W * 0.1, H * 0.965, W * 0.8 * val, 12, 6); ctx.fill();
      }
      this.hud(ctx, W, 'Throw ' + Math.min(5, s.throws + 1) + ' of 5   ' + (s.phase === 'aim' ? 'Tap to aim' : s.phase === 'power' ? 'Tap for power' : 'Rolling…'));
    };
    reset();
    g.c.addEventListener('pointerdown', tap);
    window.addEventListener('keydown', key);
    const stop = this.loop(tick);
    return {
      start: () => { run = true; }, pause: () => { run = !run; return run; },
      restart: () => { reset(); run = true; },
      destroy: () => { stop(); g.c.removeEventListener('pointerdown', tap); window.removeEventListener('keydown', key); g.dispose(); }
    };
  }

  gameSliding(host, api) {
    const g = this.mkCanvas(host, '1 / 1'), ctx = g.ctx, N = 4;
    let t = [], run = false, moves = 0, secs = 0, score = 0;
    const blank = () => t.indexOf(0);
    const canMove = i => {
      const b = blank(), bx = b % N, by = Math.floor(b / N), x = i % N, y = Math.floor(i / N);
      return Math.abs(bx - x) + Math.abs(by - y) === 1;
    };
    const slide = i => {
      if (!canMove(i)) return false;
      const b = blank(); t[b] = t[i]; t[i] = 0; return true;
    };
    const solved = () => t.every((v, i) => v === (i === N * N - 1 ? 0 : i + 1));
    const reset = () => {
      t = [];
      for (let i = 1; i < N * N; i++) t.push(i);
      t.push(0);
      for (let k = 0; k < 400; k++) {
        const b = blank(), opts = [];
        if (b % N > 0) opts.push(b - 1);
        if (b % N < N - 1) opts.push(b + 1);
        if (b >= N) opts.push(b - N);
        if (b < N * N - N) opts.push(b + N);
        const i = opts[Math.floor(Math.random() * opts.length)];
        t[b] = t[i]; t[i] = 0;
      }
      if (solved()) { const a = t[0]; t[0] = t[1]; t[1] = a; }
      moves = 0; secs = 0; score = 0; api.setScore(0);
    };
    const click = ev => {
      if (!run) return;
      const W = g.W(), H = g.H(), S = Math.min(W, H) * 0.94, cs = S / N, ox = (W - S) / 2, oy = (H - S) / 2;
      const p = g.pos(ev);
      const x = Math.floor((p.x - ox) / cs), y = Math.floor((p.y - oy) / cs);
      if (x < 0 || y < 0 || x >= N || y >= N) return;
      if (!slide(y * N + x)) { api.sound(200, 0.04, 'sawtooth'); return; }
      moves++; api.sound(680, 0.04);
      if (solved()) {
        run = false;
        score = Math.max(120, 1400 - moves * 8 - Math.floor(secs) * 4);
        api.setScore(score);
        api.gameOver('Solved in ' + moves + ' moves and ' + Math.floor(secs) + 's — ' + score + ' points.');
      }
    };
    const key = e => {
      const b = blank(), map = { ArrowUp: b + N, ArrowDown: b - N, ArrowLeft: b + 1, ArrowRight: b - 1 };
      const i = map[e.key];
      if (i === undefined) return;
      e.preventDefault();
      if (i < 0 || i >= N * N) return;
      if (Math.abs((i % N) - (b % N)) + Math.abs(Math.floor(i / N) - Math.floor(b / N)) !== 1) return;
      if (slide(i)) {
        moves++; api.sound(680, 0.04);
        if (solved()) { run = false; score = Math.max(120, 1400 - moves * 8 - Math.floor(secs) * 4); api.setScore(score); api.gameOver('Solved in ' + moves + ' moves — ' + score + ' points.'); }
      }
    };
    const tick = dt => {
      if (run) secs += dt;
      const W = g.W(), H = g.H(), S = Math.min(W, H) * 0.94, cs = S / N, ox = (W - S) / 2, oy = (H - S) / 2;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#0a0b18'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#15172b'; this.rr(ctx, ox, oy, S, S, 16); ctx.fill();
      t.forEach((v, i) => {
        if (!v) return;
        const x = ox + (i % N) * cs + 5, y = oy + Math.floor(i / N) * cs + 5, s2 = cs - 10;
        const done = v === i + 1;
        ctx.fillStyle = done ? '#d8f24b' : '#2a2d4d';
        this.rr(ctx, x, y, s2, s2, 12); ctx.fill();
        ctx.fillStyle = done ? '#14152b' : '#f2f2f7';
        ctx.font = '800 ' + Math.round(cs * 0.38) + 'px "Bricolage Grotesque", sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(v), x + s2 / 2, y + s2 / 2 + 1);
        ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
      });
      this.hud(ctx, W, 'Moves ' + moves + '   ' + Math.floor(secs) + 's');
    };
    reset();
    g.c.addEventListener('pointerdown', click);
    window.addEventListener('keydown', key);
    const stop = this.loop(tick);
    return {
      start: () => { run = true; }, pause: () => { run = !run; return run; },
      restart: () => { reset(); run = true; },
      destroy: () => { stop(); g.c.removeEventListener('pointerdown', click); window.removeEventListener('keydown', key); g.dispose(); }
    };
  }

  /* ================= registry ================= */
  buildGames() {
    const mk = (id, name, category, difficulty, blurb, description, howTo, controls, tips, faqs, plays, isNew, quick, mount, art) =>
      ({ id, name, category, difficulty, blurb, description, howTo, controls, tips, faqs, plays, isNew, quick, mount, art });
    return [
      mk('snake-rush', 'Snake Rush', 'Arcade', 'Easy',
        'Grow a neon snake, grab pellets and never bite your own tail.',
        'Snake Rush is our take on the classic growing-snake idea, rebuilt from scratch with a neon board, a speed curve that tightens with every pellet and controls that work equally well with a thumb or a keyboard. Each pellet is worth ten points and nudges the tempo up, so the longer you survive the sharper your reflexes need to be.',
        ['Steer the snake toward the coral pellet.', 'Every pellet adds a segment and a little speed.', 'Hitting a wall or your own body ends the run.'],
        ['Desktop: arrow keys or WASD.', 'Mobile: swipe anywhere on the board.'],
        ['Hug the outer edges early so the middle stays open.', 'Turn in long sweeps rather than tight spirals.', 'Slow down mentally when the snake passes twenty segments — most runs end from panic turns.'],
        [{ q: 'Is Snake Rush free?', a: 'Yes. Every game on the site is free and needs no account.' },
         { q: 'Does it save my best score?', a: 'Your best score is stored in your own browser, so it survives a reload but never leaves your device.' },
         { q: 'Can I play on a phone?', a: 'Yes — swipe controls and a square board that fits any screen width.' }],
        980, false, true, (h, a) => this.gameSnake(h, a), 'snake'),

      mk('brick-cascade', 'Brick Cascade', 'Arcade', 'Medium',
        'Bounce, break and clear five rows of colour before your balls run out.',
        'Brick Cascade is an original brick-breaking arcade round: a paddle you steer with the mouse, a ball that speeds up as levels stack, and a fresh wall every time you clear the board. Bricks are worth fifteen points and a full clear pays a hundred-point bonus.',
        ['Keep the ball in play with the paddle.', 'Clear all bricks to advance a level and earn a bonus.', 'You get three balls per run.'],
        ['Desktop: move the mouse, or arrow keys / A and D.', 'Mobile: drag your finger across the board.'],
        ['Hit the ball with the paddle edge to steepen the angle.', 'Open a tunnel up one side and let the ball rattle along the top row.', 'Late levels are faster — track the ball, not the bricks.'],
        [{ q: 'How many levels are there?', a: 'Endless — the wall refills and the ball gets faster each time you clear it.' },
         { q: 'Do I lose points when I miss?', a: 'No, you only lose a ball. Points are kept.' },
         { q: 'Does it work on a tablet?', a: 'Yes, drag anywhere on the board to move the paddle.' }],
        870, false, false, (h, a) => this.gameBricks(h, a), 'bricks'),

      mk('number-merge', 'Number Merge', 'Puzzle', 'Medium',
        'Slide matching tiles together and chase a four-digit tile.',
        'Number Merge is a sliding number puzzle written for this site. Every swipe pushes the whole grid, equal tiles fuse into their sum, and a new tile appears in the gap. Simple to learn, brutal once the board fills — the trick is keeping your biggest tile parked in a corner.',
        ['Swipe or press an arrow key to slide every tile.', 'Two equal tiles merge into one and add to your score.', 'The game ends when no move is left.'],
        ['Desktop: arrow keys or WASD.', 'Mobile: swipe up, down, left or right.'],
        ['Pick one corner and never move your biggest tile out of it.', 'Build rows in descending order so merges cascade.', 'Avoid the fourth direction — most players lose by swiping up out of habit.'],
        [{ q: 'What is the goal?', a: 'There is no hard finish line; most players aim for a 2048 tile and then keep pushing.' },
         { q: 'Is the board random?', a: 'New tiles appear at random empty cells, weighted toward the number two.' },
         { q: 'Can I undo a move?', a: 'No — every slide is final, which is what makes the planning matter.' }],
        930, true, false, (h, a) => this.gameMerge(h, a), 'merge'),

      mk('memory-flip', 'Memory Flip', 'Kids', 'Easy',
        'Flip sixteen cards and pair up every shape in as few moves as possible.',
        'Memory Flip is a calm sixteen-card matching game with big touch targets and code-drawn shapes instead of licensed characters. Matches pay twenty-five points, misses cost three, and a tidy finish earns a move bonus — ideal for younger players and for warming up before something faster.',
        ['Tap a card to reveal its shape.', 'Find its twin to lock the pair open.', 'Clear all eight pairs to finish and earn a move bonus.'],
        ['Desktop: click the cards.', 'Mobile: tap the cards.'],
        ['Work along one row at a time so positions are easier to remember.', 'Say the shape and its spot in your head as you flip.', 'Fewer moves means a bigger end bonus, so resist random flipping.'],
        [{ q: 'Is this suitable for young children?', a: 'Yes — no timers, no fail state, no scary imagery, and large tap areas.' },
         { q: 'How is the score calculated?', a: 'Twenty-five per pair, minus three per mismatch, plus a bonus for finishing in few moves.' },
         { q: 'Are the cards shuffled every game?', a: 'Yes, a fresh shuffle on every restart.' }],
        760, false, true, (h, a) => this.gameMemory(h, a), 'memory'),

      mk('tic-tac-arena', 'Tic Tac Arena', 'Board', 'Easy',
        'Three in a row against an opponent that never makes a mistake.',
        'Tic Tac Arena puts you against a perfect-play opponent built on a full minimax search. You cannot beat it with tricks — only a mistake on its side would let you win, and it does not make any — so the real game is holding a draw streak while the board stays clean.',
        ['You play X and always move first.', 'Tap an empty square to place your mark.', 'Three in a row wins; a full board is a draw.'],
        ['Desktop: click a square.', 'Mobile: tap a square.'],
        ['Open in the centre — it belongs to the strongest lines.', 'Watch both diagonals before you block a row.', 'A draw against perfect play is a good result; keep the streak alive for points.'],
        [{ q: 'Can the computer be beaten?', a: 'Not with correct play from its side — it searches the whole game tree. Aim for draws.' },
         { q: 'Do draws score?', a: 'Yes, your streak of non-losses feeds the score.' },
         { q: 'Is there a two-player mode?', a: 'Not yet — say the word and we can add pass-and-play.' }],
        640, false, true, (h, a) => this.gameTicTac(h, a), 'tictac'),

      mk('star-defender', 'Star Defender', 'Arcade', 'Hard',
        'Hold the line against descending waves with an auto-firing cannon.',
        'Star Defender is a vertical shooter with a procedural starfield, auto-fire so mobile players never need a second button, and armoured pink attackers that take two hits. Waves tighten as your score climbs and every leaked enemy costs a shield.',
        ['Slide left and right to line up your shots.', 'Your cannon fires automatically.', 'Pink attackers need two hits; letting any through costs a shield.'],
        ['Desktop: mouse, arrow keys or A and D.', 'Mobile: drag your thumb along the bottom of the board.'],
        ['Stay near the centre and make small corrections.', 'Kill armoured attackers early — they cost you two hits later.', 'Let a harmless straggler drift while you clear a cluster.'],
        [{ q: 'Why does it fire on its own?', a: 'So the game plays identically on a phone and a keyboard with no extra buttons.' },
         { q: 'How many waves are there?', a: 'Endless, with spawn speed rising every wave.' },
         { q: 'Is there violence?', a: 'No — abstract shapes only, family-friendly throughout.' }],
        890, true, false, (h, a) => this.gameSpace(h, a), 'space'),

      mk('reaction-rush', 'Reaction Rush', 'Casual', 'Easy',
        'Ten targets, one measurement: how fast are you really?',
        'Reaction Rush measures your click-to-target time across ten shrinking dots and reports the average in milliseconds. Missing or clicking early costs points, so it rewards being fast and accurate rather than mashing.',
        ['Wait for the lime dot to appear.', 'Hit it as fast as you can.', 'Ten targets make one run; targets shrink as you go.'],
        ['Desktop: click the dot.', 'Mobile: tap the dot.'],
        ['Rest your finger just off the centre of the board.', 'Do not pre-click — early clicks cost twenty points.', 'A relaxed hand is measurably faster than a tense one.'],
        [{ q: 'What is a good reaction time?', a: 'Most people land between 250 and 400 ms including the click itself.' },
         { q: 'Does screen refresh rate matter?', a: 'Slightly — a faster display shows the dot sooner.' },
         { q: 'Is the score just my speed?', a: 'Points come from speed per target, minus penalties for misses.' }],
        520, false, true, (h, a) => this.gameReaction(h, a), 'reaction'),

      mk('drop-four', 'Drop Four', 'Board', 'Medium',
        'Drop discs into a seven-column grid and line up four before the machine does.',
        'Drop Four is a connect-four style board game against an opponent that always takes an immediate win, always blocks yours, and otherwise crowds the centre. Winnable with a plan, punishing if you drift.',
        ['Tap a column to drop your yellow disc.', 'Discs stack from the bottom.', 'Four in a row in any direction wins.'],
        ['Desktop: click a column.', 'Mobile: tap a column.'],
        ['Take the centre column early — it feeds the most lines.', 'Set up two threats at once; a single threat always gets blocked.', 'Count the parity of empty cells in a column before committing.'],
        [{ q: 'How strong is the opponent?', a: 'It plays immediate wins and blocks, and prefers the centre otherwise — beatable with a double threat.' },
         { q: 'Who moves first?', a: 'You always do, playing yellow.' },
         { q: 'Can two people play?', a: 'Not yet, but pass-and-play is easy to add.' }],
        700, false, false, (h, a) => this.gameDropFour(h, a), 'four'),

      mk('color-clash', 'Color Clash', 'Casual', 'Medium',
        'Thirty seconds of word-versus-ink confusion. Trust your eyes, not the text.',
        'Color Clash is a timed attention game built on the classic word-colour interference effect. A colour name appears in a possibly different ink and you have thirty seconds to answer match or no match as often as you can. Streaks multiply the payoff.',
        ['Read the ink colour, not the word.', 'Answer MATCH or NO MATCH.', 'You have thirty seconds; streaks raise the points per answer.'],
        ['Desktop: click a button, or left arrow for match and right arrow for no match.', 'Mobile: tap the button panels.'],
        ['Squint slightly so the word blurs and the colour dominates.', 'Commit fast — hesitation costs more than a wrong answer.', 'Build a streak; the multiplier is where the score comes from.'],
        [{ q: 'Why is this hard?', a: 'Reading is automatic, so the word fights the colour your eyes report.' },
         { q: 'Is it colour-blind friendly?', a: 'Partly — the words are always spelled out, so the text gives a second channel.' },
         { q: 'How long is a round?', a: 'Thirty seconds.' }],
        560, true, true, (h, a) => this.gameColorClash(h, a), 'color'),

      mk('typing-sprint', 'Typing Sprint', 'Word', 'Medium',
        'Type original phrases for thirty seconds and get an honest WPM.',
        'Typing Sprint gives you thirty seconds and a rotating set of original phrases, then reports words per minute and accuracy. No leaderboards, no sign-up — just a quick, repeatable measure of your keyboard speed.',
        ['Press Start and begin typing the phrase shown.', 'Finish a phrase and the next one appears.', 'The run ends after thirty seconds.'],
        ['Desktop: your keyboard.', 'Mobile: the on-screen keyboard works, though scores run lower.'],
        ['Accuracy beats speed — corrections cost more than careful keys.', 'Keep your eyes on the phrase, not your hands.', 'Sit up and keep wrists level; posture is worth a few WPM.'],
        [{ q: 'What counts as a word?', a: 'Five characters, the standard convention for WPM.' },
         { q: 'Is my typing sent anywhere?', a: 'No. Everything stays in your browser.' },
         { q: 'Can I use a phone?', a: 'Yes, but touch keyboards score much lower than physical ones.' }],
        610, false, false, (h, a) => this.gameTyping(h, a), 'typing'),

      mk('road-racer', 'Road Racer', 'Racing', 'Medium',
        'Weave through four lanes of traffic as the speedometer climbs.',
        'Road Racer is an endless lane-dodging run. Distance earns points, traffic thickens as your speed rises, and the whole board scales to your screen so a phone plays exactly like a desktop. One touch of another car ends the run.',
        ['Steer left and right between four lanes.', 'Distance travelled is your score.', 'Traffic gets denser the faster you go.'],
        ['Desktop: mouse, arrow keys or A and D.', 'Mobile: slide your thumb across the road.'],
        ['Sit in a lane rather than drifting between two.', 'Look at the top of the screen, not at your own car.', 'Move early — late swerves at high speed rarely land.'],
        [{ q: 'Does the car ever stop accelerating?', a: 'Speed keeps climbing with distance, so every run ends eventually.' },
         { q: 'Is there a crash animation?', a: 'No blood, no wreckage — the run simply ends. The site is family-friendly.' },
         { q: 'Best control on mobile?', a: 'Rest your thumb near the bottom of the road and slide.' }],
        910, true, false, (h, a) => this.gameRoad(h, a), 'road'),

      mk('car-parking-pro', 'Car Parking Pro', 'Racing', 'Hard',
        'Three bays, real steering physics and no bumping the walls.',
        'Car Parking Pro gives you a car with momentum and a turning circle, then asks you to place it inside three increasingly awkward bays. Bumps cost points, a clean stop inside the markings pays 150, and the final bay needs a proper turn.',
        ['Drive into the dashed bay and stop inside it.', 'You must be nearly straight and nearly stopped to park.', 'Bumping walls costs points.'],
        ['Desktop: arrow keys or WASD — up accelerates, down reverses.', 'Mobile: on-screen STEER / GAS / STEER strip along the bottom.'],
        ['Go slow — the parking check needs you almost stopped.', 'Steering only works while the car is moving, like a real car.', 'Reverse into the tight third bay instead of nosing in.'],
        [{ q: 'Why will it not park?', a: 'You are probably still rolling or at an angle. Ease off and straighten up.' },
         { q: 'Can I reverse on mobile?', a: 'The touch strip is forward-only; a keyboard gives you reverse.' },
         { q: 'How many bays?', a: 'Three, each harder than the last.' }],
        680, true, false, (h, a) => this.gameParking(h, a), 'parking'),

      mk('maze-escape', 'Maze Escape', 'Puzzle', 'Medium',
        'Three generated mazes, each bigger than the last, against the clock.',
        'Maze Escape builds a fresh maze every single run with a depth-first generator, so no two games repeat. Reach the lit corner to advance; a faster escape keeps more of the time bonus. The grid grows from nine cells wide to thirteen.',
        ['Move through the corridors to the highlighted corner.', 'Each escape grows the maze and adds a time bonus.', 'Three mazes complete the run.'],
        ['Desktop: arrow keys or WASD.', 'Mobile: swipe in the direction you want to move.'],
        ['Follow one wall consistently — it always finds the exit eventually.', 'Glance at the goal corner and bias every choice toward it.', 'The clock only affects your bonus, not your survival, so do not panic.'],
        [{ q: 'Are the mazes always solvable?', a: 'Yes — the generator produces a perfect maze with exactly one path between any two cells.' },
         { q: 'Does it get harder?', a: 'Each level adds two cells in each direction.' },
         { q: 'Can I zoom on mobile?', a: 'No need — the maze always fits the board.' }],
        720, true, false, (h, a) => this.gameMaze(h, a), 'maze'),

      mk('mine-finder', 'Mine Finder', 'Strategy', 'Hard',
        'Nine by nine, ten hidden mines, one careless tap away from over.',
        'Mine Finder is a logic sweep across an 81-cell grid with ten mines. Numbers tell you how many mines touch a cell, empty regions open in a cascade, and a flag mode keeps mobile play safe without long-press guesswork.',
        ['Tap a cell to reveal it.', 'Numbers count the mines in the eight neighbouring cells.', 'Clear every safe cell to win; hitting a mine ends the run.'],
        ['Desktop: click to reveal, or switch on flag mode to mark.', 'Mobile: tap the FLAG MODE bar at the top to toggle marking.'],
        ['Start in a corner — cascades open more board there.', 'A one touching exactly one unknown cell means that cell is a mine.', 'Flag what you know before guessing anywhere.'],
        [{ q: 'Is the first tap always safe?', a: 'Not in this version, so open a corner where the odds are best.' },
         { q: 'How do I flag on a phone?', a: 'Tap the bar above the grid to switch to flag mode, then tap cells.' },
         { q: 'How many mines?', a: 'Ten, in an 81-cell grid.' }],
        640, true, false, (h, a) => this.gameMines(h, a), 'mines'),

      mk('sudoku-master', 'Sudoku Master', 'Puzzle', 'Hard',
        'A freshly generated grid every game, with a number pad built for thumbs.',
        'Sudoku Master generates a complete valid solution with a randomised backtracking solver, then removes cells to make your puzzle — so every game is new. Correct entries turn lime, mistakes turn coral, and finishing pays a 250-point bonus.',
        ['Tap a cell, then tap a number on the pad.', 'Every row, column and 3×3 box needs the digits one to nine.', 'Fill the grid correctly to finish.'],
        ['Desktop: click a cell, then press 1–9, Backspace to erase.', 'Mobile: tap a cell, then use the number pad below the grid.'],
        ['Scan for the row, column or box with the fewest blanks first.', 'Look for a digit that only fits one cell in a box.', 'Erase and rethink rather than filling on a hunch — wrong entries cost points.'],
        [{ q: 'Is every puzzle solvable?', a: 'Yes — the grid is generated from a complete valid solution before cells are removed.' },
         { q: 'Does it tell me when I am wrong?', a: 'Yes, wrong digits show in coral so you never grind on a broken grid.' },
         { q: 'Are the puzzles the same each visit?', a: 'No, a new one is generated every restart.' }],
        700, true, false, (h, a) => this.gameSudoku(h, a), 'sudoku'),

      mk('word-sprint', 'Word Sprint', 'Word', 'Medium',
        'Sixty seconds to unscramble as many words as you can, hints included.',
        'Word Sprint scrambles an original word list and gives you a one-line hint for each. Every solve pays forty points plus whatever time is left, so early speed compounds. Answers check themselves as you type — no submit button to slow you down.',
        ['Read the scrambled letters and the hint.', 'Type the word; it accepts itself the moment it is right.', 'The round lasts sixty seconds.'],
        ['Desktop: your keyboard.', 'Mobile: the on-screen keyboard works fine.'],
        ['Say the letters out loud — sound finds words faster than sight.', 'Lock the first two letters and permute the rest.', 'The hint is always literal; trust it.'],
        [{ q: 'Where do the words come from?', a: 'An original word list written for this site, plain English, nothing obscure.' },
         { q: 'Do I need to press enter?', a: 'No, a correct answer registers as you finish typing it.' },
         { q: 'Are the hints optional?', a: 'They are always shown — this is a speed game, not a guessing game.' }],
        590, true, true, (h, a) => this.gameWordSprint(h, a), 'word'),

      mk('math-blitz', 'Math Blitz', 'Kids', 'Easy',
        'Forty-five seconds of mental arithmetic with a streak multiplier.',
        'Math Blitz serves quick sums with four answer buttons and steps up the difficulty every five correct answers — addition and subtraction first, then multiplication and bigger numbers. Streaks raise the points per question, so accuracy pays better than luck.',
        ['Pick the correct answer from four options.', 'Every five correct answers raises the difficulty.', 'Streaks multiply your points; a wrong answer resets them.'],
        ['Desktop: click an answer, or press 1–4.', 'Mobile: tap an answer.'],
        ['Round to the nearest ten and compare, rather than solving exactly.', 'Eliminate the obviously-wrong option first.', 'Guard the streak — one careless tap costs several questions of progress.'],
        [{ q: 'Is this suitable for school-age children?', a: 'Yes, it starts with small sums and only escalates as they succeed.' },
         { q: 'How long is a round?', a: 'Forty-five seconds.' },
         { q: 'Are there negative numbers?', a: 'Subtraction is always ordered so the answer stays positive.' }],
        670, true, true, (h, a) => this.gameMathBlitz(h, a), 'math'),

      mk('jump-runner', 'Jump Runner', 'Arcade', 'Hard',
        'One button, endless pillars, and a very small gap.',
        'Jump Runner is a single-input obstacle run: gravity pulls, a tap lifts, and every pillar you clear is ten points. The gap never changes size — only your nerve does. It is the hardest game in the arcade and the easiest to learn.',
        ['Tap to rise; let go to fall.', 'Pass between pillars without touching them.', 'Every pillar cleared is ten points.'],
        ['Desktop: space, up arrow or W, or click.', 'Mobile: tap anywhere on the board.'],
        ['Tap in a light steady rhythm instead of holding altitude.', 'Aim for the lower third of each gap.', 'Watch the next pillar, not the one you are passing.'],
        [{ q: 'Why is my score so low?', a: 'It is meant to be brutal. Ten pillars is respectable.' },
         { q: 'Does it get faster?', a: 'The speed is constant — the difficulty is entirely in your rhythm.' },
         { q: 'Does the gap ever widen?', a: 'No, it is the same every pillar.' }],
        850, true, true, (h, a) => this.gameJumpRunner(h, a), 'jump'),

      mk('basketball-shot', 'Basketball Shot', 'Sports', 'Medium',
        'Two taps — angle then power — and ten shots to prove you can read an arc.',
        'Basketball Shot is a timing game about projectile arcs. The first tap locks the launch angle from a sweeping meter, the second locks power, then physics does the rest. The hoop moves between shots so you cannot memorise a single setting.',
        ['Tap once to set the angle from the sweeping bar.', 'Tap again to set power.', 'Ten shots per run; each basket is 100 points.'],
        ['Desktop: click, or press space or enter.', 'Mobile: tap the board.'],
        ['Higher angle plus lower power drops the ball in more reliably.', 'Watch where the last shot landed and adjust one meter, not both.', 'The hoop moves — check its height before your first tap.'],
        [{ q: 'Do rim bounces count?', a: 'The ball scores when it falls through the hoop area; rim physics is deliberately forgiving.' },
         { q: 'How many shots?', a: 'Ten per run.' },
         { q: 'Does the hoop move mid-shot?', a: 'No, only between shots.' }],
        620, true, false, (h, a) => this.gameHoops(h, a), 'hoops'),

      mk('penalty-kick', 'Penalty Kick', 'Sports', 'Easy',
        'Five kicks, one moving sight, and a keeper who guesses.',
        'Penalty Kick is a five-shot shootout. A sight sweeps across the goal and your tap decides where the ball goes; the keeper commits to a random third at the same moment. The sight speeds up with every kick, so the last one is genuinely tense.',
        ['Tap to shoot when the sight is where you want the ball.', 'The keeper dives as you strike.', 'Five kicks per run; each goal is 120 points.'],
        ['Desktop: click, or press space or enter.', 'Mobile: tap the board.'],
        ['The corners beat a diving keeper more often than the middle.', 'The sight accelerates each kick — commit slightly early.', 'Vary your side; the keeper is random, but your rhythm is not.'],
        [{ q: 'Can the keeper be beaten every time?', a: 'No, the dive is random — a perfect five is luck plus good corners.' },
         { q: 'Are there ten kicks?', a: 'Five, then the run reports your total.' },
         { q: 'Is there a run-up to time?', a: 'No, one tap keeps it playable on any device.' }],
        700, true, true, (h, a) => this.gamePenalty(h, a), 'penalty'),

      mk('mini-golf', 'Mini Golf', 'Sports', 'Medium',
        'Three holes, wooden bumpers, and a drag-back putt with real friction.',
        'Mini Golf is a top-down putting game: drag back from the ball like a slingshot and release. The ball rolls with friction, bounces off bumpers and walls, and each hole pays more the fewer strokes you take. Three holes make a round.',
        ['Drag back from the ball and release to putt.', 'Bumpers and walls bounce the ball.', 'Fewer strokes per hole means more points.'],
        ['Desktop: press, drag back, release.', 'Mobile: the same gesture with your finger.'],
        ['Bank off a bumper deliberately rather than fighting it.', 'Short putts near the hole beat one heroic long one.', 'The ball must be slow to drop — hammering it rolls straight over the cup.'],
        [{ q: 'Why did my ball skip the hole?', a: 'It was moving too fast. The cup only takes a slow ball, like real golf.' },
         { q: 'How many holes?', a: 'Three, each with a different bumper layout.' },
         { q: 'Is there wind or slope?', a: 'No — friction and bumpers only.' }],
        660, true, false, (h, a) => this.gameMiniGolf(h, a), 'golf'),

      mk('checkers-challenge', 'Checkers Challenge', 'Board', 'Medium',
        'Full draughts rules, forced captures, kings — against a capture-hungry opponent.',
        'Checkers Challenge plays proper draughts on an eight-by-eight board: diagonal moves, jump captures, promotion to king on the far row, and captures forced when one is available. The opponent always takes a capture if it can, so leaving a piece hanging is punished immediately.',
        ['Tap your piece, then tap a highlighted square.', 'If a capture is available you must take it.', 'Reach the far row to promote a piece to a king.'],
        ['Desktop: click a piece then its destination.', 'Mobile: tap a piece then its destination.'],
        ['Keep your back row intact early — it stops promotions.', 'Trade pieces when you are ahead in material.', 'Offer a piece to set up a double capture; the opponent always bites.'],
        [{ q: 'Are captures compulsory?', a: 'Yes, for both sides, as in standard draughts.' },
         { q: 'Do kings move backwards?', a: 'Yes, kings move and capture in all four diagonal directions.' },
         { q: 'How strong is the opponent?', a: 'It plays every capture it sees but does not look ahead — plan two moves and you will win.' }],
        690, true, false, (h, a) => this.gameCheckers(h, a), 'checkers'),

      mk('bubble-pop', 'Bubble Pop', 'Casual', 'Easy',
        'Clear clusters of colour for sixty seconds — bigger groups pay squared.',
        'Bubble Pop is a relaxed cluster-clearing game on an eight-by-eight board. Tap any group of two or more touching bubbles of the same colour and they vanish; the column above drops and refills from the top. Points scale with the square of the cluster, so patience beats tapping.',
        ['Tap a group of two or more touching bubbles of one colour.', 'Bubbles above fall down and new ones drop in.', 'Score grows with the square of the group size.'],
        ['Desktop: click a cluster.', 'Mobile: tap a cluster.'],
        ['Grow a cluster by clearing around it rather than popping it early.', 'A group of six scores four times what two threes do.', 'Work bottom-up so the refill builds new clusters for you.'],
        [{ q: 'Can the board dead-end?', a: 'No — new bubbles drop in constantly, so there is always a move.' },
         { q: 'How long is a round?', a: 'Sixty seconds.' },
         { q: 'Is it colour-blind friendly?', a: 'Partly — the palette is high-contrast, but it does rely on colour. Tell us if you need shapes.' }],
        580, true, true, (h, a) => this.gameBubblePop(h, a), 'bubble'),

      mk('bowling-strike', 'Bowling Strike', 'Sports', 'Easy',
        'Aim, power, roll — five throws at a full rack of ten pins.',
        'Bowling Strike is a two-tap bowling round: the first tap sets your line from a sweeping marker, the second sets power, then the ball rolls with a slight curve toward the rack. Pins knock their neighbours, and clearing all ten pays a hundred-point strike bonus.',
        ['Tap once to lock your line, again to lock power.', 'Pins topple their neighbours as they fall.', 'Five throws, with a fresh rack each time.'],
        ['Desktop: click, or press space or enter.', 'Mobile: tap the lane.'],
        ['Aim slightly off centre — the pocket clears more pins than the head pin.', 'Full power is not always best; a mid-power ball stays on line.', 'The ball curves toward the middle, so allow for it from the edges.'],
        [{ q: 'Is it ten-pin scoring?', a: 'No — this is a simplified five-throw score, not full frames-and-splits scoring.' },
         { q: 'What is a strike worth?', a: 'Thirty per pin plus a hundred-point bonus for clearing the rack.' },
         { q: 'Does the rack reset?', a: 'Yes, every throw starts with ten pins.' }],
        600, true, false, (h, a) => this.gameBowling(h, a), 'bowling'),

      mk('sliding-puzzle', 'Sliding Puzzle', 'Puzzle', 'Medium',
        'Fifteen tiles, one gap, and a shuffle that is always solvable.',
        'Sliding Puzzle is the classic fifteen-tile slide, shuffled by four hundred random legal moves so the board is guaranteed solvable. Tiles turn lime when they reach their home position, and your score rewards both few moves and a fast finish.',
        ['Tap a tile beside the gap to slide it.', 'Order the tiles one to fifteen with the gap last.', 'Correct tiles turn lime as you go.'],
        ['Desktop: click a tile, or use the arrow keys to slide into the gap.', 'Mobile: tap the tile you want to move.'],
        ['Finish the top two rows completely before touching the bottom half.', 'Solve the last row as a pair of tiles, cycling them around.', 'Every move costs points — think before sliding.'],
        [{ q: 'Is every shuffle solvable?', a: 'Yes. The board is shuffled by legal moves only, which cannot create an unsolvable position.' },
         { q: 'What do the arrow keys do?', a: 'They slide the tile from that direction into the gap.' },
         { q: 'Is there a picture mode?', a: 'Not yet — numbers only, which keeps it readable on small screens.' }],
        570, true, false, (h, a) => this.gameSliding(h, a), 'sliding')
    ];
  }

  /* ================= art ================= */
  art(kind, h) {
    const R = React.createElement;
    const box = children => R('svg', { viewBox: '0 0 300 168', width: '100%', height: h || 'auto', role: 'img', 'aria-hidden': 'true', style: { display: 'block' } }, children);
    const rect = (x, y, w, hh, fill, rx) => R('rect', { key: x + '-' + y + '-' + fill + '-' + w, x, y, width: w, height: hh, fill, rx: rx === undefined ? 4 : rx });
    const circ = (cx, cy, r, fill) => R('circle', { key: 'c' + cx + '-' + cy + '-' + r, cx, cy, r, fill });
    const bg = '#191c36';
    const kids = {
      snake: [rect(0, 0, 300, 168, bg, 0), rect(96, 60, 26, 26, '#d8f24b'), rect(124, 60, 26, 26, '#b9d63f'), rect(152, 60, 26, 26, '#9bb833'), rect(152, 88, 26, 26, '#7d9a28'), circ(196, 100, 13, '#ff6b5d')],
      bricks: [rect(0, 0, 300, 168, bg, 0), rect(40, 30, 52, 16, '#d8f24b'), rect(96, 30, 52, 16, '#7c6cff'), rect(152, 30, 52, 16, '#ff6b5d'), rect(208, 30, 52, 16, '#4bd6f2'), rect(68, 52, 52, 16, '#f2b04b'), rect(124, 52, 52, 16, '#4bf2a7'), circ(150, 104, 10, '#d8f24b'), rect(112, 130, 76, 12, '#f2f2f7', 6)],
      merge: [rect(0, 0, 300, 168, bg, 0), rect(88, 34, 46, 46, '#7c6cff', 10), rect(140, 34, 46, 46, '#4bd6f2', 10), rect(88, 86, 46, 46, '#d8f24b', 10), rect(140, 86, 46, 46, 'rgba(255,255,255,.08)', 10), R('text', { key: 't1', x: 111, y: 64, fill: '#fff', fontSize: 20, fontWeight: 800, textAnchor: 'middle', fontFamily: 'Bricolage Grotesque, sans-serif' }, '8'), R('text', { key: 't2', x: 163, y: 64, fill: '#0a0b18', fontSize: 20, fontWeight: 800, textAnchor: 'middle', fontFamily: 'Bricolage Grotesque, sans-serif' }, '16'), R('text', { key: 't3', x: 111, y: 116, fill: '#0a0b18', fontSize: 18, fontWeight: 800, textAnchor: 'middle', fontFamily: 'Bricolage Grotesque, sans-serif' }, '32')],
      memory: [rect(0, 0, 300, 168, bg, 0), rect(74, 34, 46, 46, '#d8f24b', 10), rect(126, 34, 46, 46, '#1d2040', 10), rect(178, 34, 46, 46, '#ff6b5d', 10), rect(74, 88, 46, 46, '#1d2040', 10), rect(126, 88, 46, 46, '#4bd6f2', 10), rect(178, 88, 46, 46, '#1d2040', 10), circ(97, 57, 10, '#0a0b18'), circ(201, 57, 10, '#0a0b18'), circ(149, 111, 10, '#0a0b18')],
      tictac: [rect(0, 0, 300, 168, bg, 0), rect(118, 24, 3, 120, 'rgba(255,255,255,.18)', 0), rect(180, 24, 3, 120, 'rgba(255,255,255,.18)', 0), rect(88, 62, 124, 3, 'rgba(255,255,255,.18)', 0), rect(88, 104, 124, 3, 'rgba(255,255,255,.18)', 0), R('path', { key: 'x1', d: 'M96 34 L112 52 M112 34 L96 52', stroke: '#d8f24b', strokeWidth: 6, strokeLinecap: 'round' }), R('circle', { key: 'o1', cx: 150, cy: 84, r: 12, stroke: '#7c6cff', strokeWidth: 6, fill: 'none' }), R('path', { key: 'x2', d: 'M190 118 L206 136 M206 118 L190 136', stroke: '#d8f24b', strokeWidth: 6, strokeLinecap: 'round' })],
      space: [rect(0, 0, 300, 168, '#0f1128', 0), circ(60, 40, 2, '#fff'), circ(240, 30, 2, '#fff'), circ(120, 22, 2, '#fff'), circ(200, 70, 2, '#fff'), rect(96, 44, 30, 20, '#ff6b5d', 8), rect(150, 36, 30, 20, '#ff4bd8', 8), rect(204, 48, 30, 20, '#ff6b5d', 8), rect(148, 92, 4, 16, '#4bd6f2', 2), R('path', { key: 'ship', d: 'M150 118 L164 144 L136 144 Z', fill: '#d8f24b' })],
      reaction: [rect(0, 0, 300, 168, bg, 0), circ(150, 84, 40, '#d8f24b'), circ(150, 84, 16, bg), circ(66, 44, 6, 'rgba(216,242,75,.35)'), circ(238, 124, 8, 'rgba(216,242,75,.25)')],
      four: [rect(0, 0, 300, 168, '#141733', 0), circ(90, 50, 15, '#0a0b18'), circ(126, 50, 15, '#0a0b18'), circ(162, 50, 15, '#ff6b5d'), circ(198, 50, 15, '#0a0b18'), circ(90, 86, 15, '#d8f24b'), circ(126, 86, 15, '#ff6b5d'), circ(162, 86, 15, '#d8f24b'), circ(198, 86, 15, '#0a0b18'), circ(90, 122, 15, '#d8f24b'), circ(126, 122, 15, '#d8f24b'), circ(162, 122, 15, '#ff6b5d'), circ(198, 122, 15, '#d8f24b')],
      color: [rect(0, 0, 300, 168, bg, 0), R('text', { key: 'w', x: 150, y: 74, fill: '#4b8cf2', fontSize: 40, fontWeight: 800, textAnchor: 'middle', fontFamily: 'Bricolage Grotesque, sans-serif' }, 'RED'), rect(48, 104, 92, 34, '#1d5c3a', 10), rect(160, 104, 92, 34, '#5c1d2a', 10)],
      typing: [rect(0, 0, 300, 168, bg, 0), rect(48, 40, 204, 12, 'rgba(255,255,255,.16)', 6), rect(48, 62, 150, 12, 'rgba(216,242,75,.75)', 6), rect(48, 100, 44, 26, '#2a2d4d', 6), rect(98, 100, 44, 26, '#2a2d4d', 6), rect(148, 100, 44, 26, '#d8f24b', 6), rect(198, 100, 54, 26, '#2a2d4d', 6)],
      road: [rect(0, 0, 300, 168, '#101226', 0), rect(70, 0, 160, 168, '#181b34', 0), rect(108, 12, 4, 22, 'rgba(255,255,255,.25)', 0), rect(108, 62, 4, 22, 'rgba(255,255,255,.25)', 0), rect(108, 112, 4, 22, 'rgba(255,255,255,.25)', 0), rect(186, 12, 4, 22, 'rgba(255,255,255,.25)', 0), rect(186, 62, 4, 22, 'rgba(255,255,255,.25)', 0), rect(186, 112, 4, 22, 'rgba(255,255,255,.25)', 0), rect(124, 26, 34, 54, '#ff6b5d', 9), rect(200, 46, 34, 54, '#4bd6f2', 9), rect(124, 106, 34, 54, '#d8f24b', 9)],
      parking: [rect(0, 0, 300, 168, '#14162c', 0), rect(150, 30, 6, 90, '#2b2f52', 3), R('rect', { key: 'slot', x: 196, y: 40, width: 74, height: 48, fill: 'none', stroke: '#d8f24b', strokeWidth: 3, strokeDasharray: '8 6', rx: 4 }), rect(40, 96, 62, 38, '#4bd6f2', 9), rect(86, 106, 18, 18, '#0a0b18', 3)],
      maze: [rect(0, 0, 300, 168, bg, 0), R('path', { key: 'm', d: 'M60 24 H240 M60 24 V144 M240 24 V144 M60 144 H240 M96 24 V108 M132 60 V144 M168 24 V108 M204 60 V144', stroke: '#585d8f', strokeWidth: 6, fill: 'none', strokeLinecap: 'round' }), circ(78, 42, 9, '#d8f24b'), rect(212, 116, 22, 22, 'rgba(216,242,75,.3)', 4)],
      mines: [rect(0, 0, 300, 168, bg, 0), rect(96, 34, 34, 34, '#242848', 5), rect(133, 34, 34, 34, 'rgba(255,255,255,.07)', 5), rect(170, 34, 34, 34, '#242848', 5), rect(96, 71, 34, 34, 'rgba(255,255,255,.07)', 5), rect(133, 71, 34, 34, '#ff6b5d', 5), rect(170, 71, 34, 34, '#242848', 5), rect(96, 108, 34, 34, '#242848', 5), rect(133, 108, 34, 34, 'rgba(255,255,255,.07)', 5), rect(170, 108, 34, 34, '#242848', 5), circ(150, 88, 8, '#0a0b18'), R('text', { key: 'n1', x: 150, y: 96, fill: '#4bd6f2', fontSize: 0 }, '')],
      sudoku: [rect(0, 0, 300, 168, '#0f1128', 0), R('path', { key: 'grid', d: 'M96 24 H204 M96 60 H204 M96 96 H204 M96 132 H204 M96 24 V132 M132 24 V132 M168 24 V132 M204 24 V132', stroke: 'rgba(255,255,255,.28)', strokeWidth: 2, fill: 'none' }), R('text', { key: 's1', x: 114, y: 50, fill: '#f2f2f7', fontSize: 20, fontWeight: 700, textAnchor: 'middle', fontFamily: 'DM Sans, sans-serif' }, '5'), R('text', { key: 's2', x: 150, y: 86, fill: '#d8f24b', fontSize: 20, fontWeight: 700, textAnchor: 'middle', fontFamily: 'DM Sans, sans-serif' }, '3'), R('text', { key: 's3', x: 186, y: 122, fill: '#f2f2f7', fontSize: 20, fontWeight: 700, textAnchor: 'middle', fontFamily: 'DM Sans, sans-serif' }, '8')],
      word: [rect(0, 0, 300, 168, bg, 0), rect(62, 52, 36, 44, '#2a2d4d', 6), rect(104, 52, 36, 44, '#d8f24b', 6), rect(146, 52, 36, 44, '#2a2d4d', 6), rect(188, 52, 36, 44, '#2a2d4d', 6), rect(76, 112, 148, 10, 'rgba(255,255,255,.16)', 5)],
      math: [rect(0, 0, 300, 168, bg, 0), R('text', { key: 'q', x: 150, y: 78, fill: '#f2f2f7', fontSize: 38, fontWeight: 800, textAnchor: 'middle', fontFamily: 'Bricolage Grotesque, sans-serif' }, '7 × 8'), rect(70, 104, 74, 30, '#1b1e3a', 8), rect(156, 104, 74, 30, '#d8f24b', 8)],
      jump: [rect(0, 0, 300, 168, '#101a2e', 0), rect(120, 0, 40, 54, '#4bf2a7', 0), rect(120, 110, 40, 58, '#4bf2a7', 0), rect(220, 0, 40, 82, '#4bf2a7', 0), rect(220, 138, 40, 30, '#4bf2a7', 0), rect(56, 74, 32, 24, '#d8f24b', 9), rect(78, 80, 6, 6, '#101a2e', 1)],
      hoops: [rect(0, 0, 300, 168, '#1a1226', 0), rect(0, 138, 300, 30, '#2b2040', 0), rect(232, 34, 8, 92, '#f2f2f7', 2), rect(184, 62, 52, 6, '#ff6b5d', 3), circ(96, 92, 15, '#f2a04b'), R('path', { key: 'arc', d: 'M96 92 Q150 20 200 62', stroke: 'rgba(216,242,75,.5)', strokeWidth: 3, fill: 'none', strokeDasharray: '6 6' })],
      penalty: [rect(0, 0, 300, 168, '#0f2418', 0), rect(0, 96, 300, 72, '#123020', 0), R('rect', { key: 'goal', x: 46, y: 26, width: 208, height: 76, fill: 'none', stroke: '#f2f2f7', strokeWidth: 5 }), rect(132, 40, 40, 50, '#f2b04b', 8), circ(150, 130, 11, '#f2f2f7'), R('circle', { key: 'sight', cx: 92, cy: 62, r: 13, fill: 'none', stroke: '#d8f24b', strokeWidth: 3 })],
      golf: [rect(0, 0, 300, 168, '#123522', 0), rect(14, 12, 272, 144, '#17442b', 0), rect(78, 82, 144, 12, '#7c5a3a', 5), circ(220, 48, 12, '#0a0b18'), rect(219, 14, 3, 34, '#d8f24b', 0), R('path', { key: 'flag', d: 'M222 14 L246 22 L222 30 Z', fill: '#ff6b5d' }), circ(84, 126, 9, '#f2f2f7')],
      bubble: [rect(0, 0, 300, 168, bg, 0), circ(96, 48, 20, '#d8f24b'), circ(140, 48, 20, '#ff6b5d'), circ(184, 48, 20, '#4bd6f2'), circ(96, 92, 20, '#4bd6f2'), circ(140, 92, 20, '#4bd6f2'), circ(184, 92, 20, '#7c6cff'), circ(118, 132, 20, '#4bf2a7'), circ(162, 132, 20, '#d8f24b')],
      bowling: [rect(0, 0, 300, 168, '#171226', 0), rect(90, 0, 120, 168, '#3a2c1c', 0), rect(143, 22, 14, 26, '#f2f2f7', 6), rect(125, 52, 14, 26, '#f2f2f7', 6), rect(161, 52, 14, 26, '#f2f2f7', 6), rect(107, 82, 14, 26, '#f2f2f7', 6), rect(143, 82, 14, 26, '#f2f2f7', 6), rect(179, 82, 14, 26, '#f2f2f7', 6), circ(150, 142, 16, '#7c6cff')],
      sliding: [rect(0, 0, 300, 168, bg, 0), rect(90, 24, 34, 34, '#d8f24b', 8), rect(128, 24, 34, 34, '#d8f24b', 8), rect(166, 24, 34, 34, '#2a2d4d', 8), rect(90, 62, 34, 34, '#2a2d4d', 8), rect(128, 62, 34, 34, '#2a2d4d', 8), rect(166, 62, 34, 34, '#2a2d4d', 8), rect(90, 100, 34, 34, '#2a2d4d', 8), rect(128, 100, 34, 34, '#2a2d4d', 8)],
      checkers: [rect(0, 0, 300, 168, '#131630', 0), rect(96, 24, 36, 36, '#232746', 0), rect(168, 24, 36, 36, '#232746', 0), rect(132, 60, 36, 36, '#232746', 0), rect(96, 96, 36, 36, '#232746', 0), rect(168, 96, 36, 36, '#232746', 0), circ(114, 42, 13, '#ff6b5d'), circ(186, 42, 13, '#ff6b5d'), circ(150, 78, 13, '#d8f24b'), circ(114, 114, 13, '#d8f24b'), circ(186, 114, 13, '#d8f24b')]
    }[kind] || [rect(0, 0, 300, 168, bg, 0)];
    return box(kids);
  }

  icon(kind) {
    const R = React.createElement;
    const glyph = { Arcade: '#d8f24b', Puzzle: '#7c6cff', Board: '#4bd6f2', Casual: '#ff6b5d', Word: '#4bf2a7', Kids: '#f2b04b', Racing: '#ff4bd8', Sports: '#4b8cf2', Strategy: '#f2a04b' }[kind] || '#d8f24b';
    return R('svg', { viewBox: '0 0 40 40', width: 34, height: 34, 'aria-hidden': 'true', style: { display: 'block' } }, [
      R('rect', { key: 'r', x: 2, y: 2, width: 36, height: 36, rx: 11, fill: glyph, opacity: 0.18 }),
      R('rect', { key: 'r2', x: 11, y: 11, width: 8, height: 8, rx: 2.5, fill: glyph }),
      R('rect', { key: 'r3', x: 21, y: 11, width: 8, height: 8, rx: 2.5, fill: glyph, opacity: 0.6 }),
      R('rect', { key: 'r4', x: 11, y: 21, width: 8, height: 8, rx: 2.5, fill: glyph, opacity: 0.6 }),
      R('rect', { key: 'r5', x: 21, y: 21, width: 8, height: 8, rx: 2.5, fill: glyph })
    ]);
  }

  /* ================= pages ================= */
  pageData(route) {
    const brand = this.brand();
    const P = {
      '/about': {
        title: 'About ' + brand,
        lede: brand + ' is a small, independent browser arcade. Every game here was written for this site — no embedded third-party games, no borrowed art, no trackers riding along.',
        blocks: [
          { h: 'What we make', p: 'Short, replayable games that load in a second and work with a thumb or a keyboard. Art is drawn with Canvas and SVG, sound is generated at runtime with the Web Audio API, and nothing needs an install.' },
          { h: 'Why originals only', p: 'Reproducing someone else\'s game — even a familiar one — puts a site at risk. Basic mechanics are fair game, so we take a well-understood mechanic and build our own version around it, with our own names, visuals, scoring and progression.' },
          { h: 'Your data', p: 'Best scores, favourites, recently played games and your theme choice live in your own browser storage. There is no account, no login and no profile to fill in.' },
          { h: 'Contact and credits', p: 'Everything is built and maintained by Rohan Rawat. Feedback, bug reports and game ideas are welcome via the contact page.' }
        ]
      },
      '/contact': {
        title: 'Contact us',
        lede: 'Bug reports, game ideas, business enquiries — send them over and we will get back to you.',
        blocks: [
          { h: 'Direct email', p: 'Write to learnwithrohan.r@gmail.com. Include the game name and your device or browser if you are reporting a problem.' },
          { h: 'Response time', p: 'We usually reply within 2–3 business days.' },
          { h: 'Business details', p: 'Arcadillo is an independent site run by Rohan Rawat. For business or advertising enquiries, use the email address above.' }
        ]
      },
      '/privacy': {
        title: 'Privacy policy',
        lede: 'Last updated 30 August 2026. This policy describes how ' + brand + ' handles information.',
        blocks: [
          { h: 'Information we store', p: 'The site itself asks for no personal information. Game progress — best scores, favourites, recently played games and your light or dark preference — is written to your browser\'s local storage on your own device and is never transmitted to us.' },
          { h: 'Cookies and similar technologies', p: 'Core gameplay uses local storage, not cookies. If you enable advertising or analytics, those providers may set cookies or use device identifiers. Where advertising or analytics is enabled, providers such as Google AdSense and Google Analytics may set cookies or use device identifiers under their own policies.' },
          { h: 'Advertising', p: 'Third-party vendors, including Google, may use cookies to serve ads based on prior visits to this or other websites. Users may opt out of personalised advertising through the ad-settings pages of those vendors. ' },
          { h: 'Children', p: 'This site is family-friendly and does not knowingly collect personal information from children. If you believe a child has provided information, contact us at learnwithrohan.r@gmail.com and we will delete it.' },
          { h: 'Your choices', p: 'You can clear local game data at any time by clearing site data in your browser, or by using the clear-history button on the home page. Doing so removes your scores and favourites.' },
          { h: 'Changes and contact', p: 'We may update this policy; the date above will change with it. Questions go to learnwithrohan.r@gmail.com.' }
        ]
      },
      '/terms': {
        title: 'Terms & conditions',
        lede: 'Last updated 30 August 2026. By using ' + brand + ' you agree to these terms.',
        blocks: [
          { h: 'Use of the site', p: 'The games are provided for personal, non-commercial entertainment. You may not copy, redistribute, resell or repackage the games, code or artwork without written permission from Rohan Rawat.' },
          { h: 'Intellectual property', p: 'All games, code, names and artwork on this site were created for ' + brand + ' and remain the property of Rohan Rawat. Familiar game mechanics are used generically and no affiliation with any other game or publisher is claimed.' },
          { h: 'Availability', p: 'The site is offered as-is. Games may be added, changed or removed at any time, and we do not guarantee uninterrupted availability.' },
          { h: 'Limitation of liability', p: 'To the extent permitted by law, Rohan Rawat is not liable for any loss arising from use of the site. Local scores are stored on your device and may be lost if you clear your browser data.' },
          { h: 'Governing law', p: 'These terms are governed by the laws of India.' }
        ]
      },
      '/disclaimer': {
        title: 'Disclaimer',
        lede: 'Last updated 30 August 2026. Please read this alongside our terms and privacy policy.',
        blocks: [
          { h: 'General information', p: 'All content on ' + brand + ' is provided for entertainment and general information. We make no warranty as to accuracy or completeness.' },
          { h: 'External links', p: 'Where we link to other sites we do not control their content or policies. Following an external link is at your own discretion.' },
          { h: 'No professional advice', p: 'Nothing here constitutes professional advice of any kind. Reaction and typing measurements are informal and should not be used for medical or diagnostic purposes.' },
          { h: 'Advertising', p: 'Advertisements are supplied by third parties and are marked as advertisements. We do not endorse advertised products and are not responsible for their claims.' }
        ]
      },
      '/cookies': {
        title: 'Cookie policy',
        lede: 'Last updated 30 August 2026. This explains what is stored on your device when you play at ' + brand + '.',
        blocks: [
          { h: 'What we use', p: 'Gameplay features rely on local storage rather than cookies, under keys prefixed arcadillo_ — theme, favourites, recent games and best scores. This data stays on your device.' },
          { h: 'Third-party cookies', p: 'If advertising or analytics is enabled, providers such as Google AdSense and Google Analytics may set their own cookies. These are set by the provider, not by Arcadillo, and are governed by their own policies.' },
          { h: 'Managing storage', p: 'Every major browser lets you view and delete cookies and site data. Clearing this site\'s data resets your scores and favourites but does not stop you playing.' },
          { h: 'Consent', p: 'Visitors in regions that require consent for advertising cookies — for example the EEA and the UK — will be shown a consent notice before any ad personalisation is enabled.' }
        ]
      },
      '/sitemap': {
        title: 'Sitemap',
        lede: 'Every page on ' + brand + ' in one place — handy for visitors and for search engines.',
        blocks: [
          { h: 'Main sections', p: 'Home, all games, new games, popular games, my favorites, about, contact and the legal pages are all reachable from the menu in the header and from the footer.' },
          { h: 'Search engines', p: 'Submit your sitemap to Google Search Console after publishing. On Blogger the generated sitemap lives at /sitemap.xml, and custom robots settings are under Settings → Crawlers and indexing.' }
        ]
      }
    };
    return P[route] || null;
  }

  /* ================= derived ================= */
  cardOf(g) {
    return {
      id: g.id, name: g.name, category: g.category, difficulty: g.difficulty, blurb: g.blurb,
      href: '#/game/' + g.id, aria: 'Play ' + g.name + ', a ' + g.difficulty.toLowerCase() + ' ' + g.category.toLowerCase() + ' game',
      art: this.art(g.art), icon: this.icon(g.category),
      best: this.bestOf(g.id),
      favIcon: (this.state.favs || []).indexOf(g.id) >= 0 ? '♥' : '♡',
      favAria: ((this.state.favs || []).indexOf(g.id) >= 0 ? 'Remove ' : 'Add ') + g.name + ' to favorites',
      favColor: (this.state.favs || []).indexOf(g.id) >= 0 ? '#ff6b5d' : '#9a9cb8',
      toggleFav: e => { e.preventDefault(); e.stopPropagation(); this.toggleFav(g.id); }
    };
  }

  libraryScope() {
    const r = this.route();
    if (r === '/new') return { title: 'New games', intro: 'The most recent additions to the arcade — fresh mechanics, same instant loading.', list: this.games.filter(g => g.isNew) };
    if (r === '/popular') return { title: 'Popular games', intro: 'What visitors play most. Sorted by plays across the site.', list: this.games.slice().sort((a, b) => b.plays - a.plays) };
    if (r === '/favorites') return { title: 'My favorites', intro: 'Games you have hearted. Saved in this browser only — no account needed.', list: this.games.filter(g => (this.state.favs || []).indexOf(g.id) >= 0) };
    const m = r.match(/^\/c\/(.+)$/);
    if (m) {
      const cat = decodeURIComponent(m[1]);
      return { title: cat + ' games', intro: 'Every ' + cat.toLowerCase() + ' game in the arcade, playable in your browser right now.', list: this.games.filter(g => g.category.toLowerCase() === cat.toLowerCase()) };
    }
    return { title: 'All games', intro: 'The whole library. Filter by category, sort how you like, and start playing in one tap.', list: this.games.slice() };
  }

  dailyPick() {
    const d = new Date();
    const seed = d.getFullYear() * 372 + d.getMonth() * 31 + d.getDate();
    return this.games[seed % this.games.length];
  }

  renderVals() {
    const st = this.state;
    const kind = this.routeKind();
    const dark = st.theme !== 'light';
    const rootStyle = dark
      ? '--bg:#0d0e1c;--surface:#16182c;--surface2:#1e2140;--line:rgba(255,255,255,.09);--text:#f2f2f7;--muted:#9a9cb8;--accent:' + (this.props.accentColor || '#d8f24b') + ';--accent2:#ff6b5d;--accent3:#7c6cff;--headerBg:rgba(13,14,28,.82)'
      : '--bg:#f7f5ef;--surface:#ffffff;--surface2:#efece2;--line:rgba(15,16,32,.12);--text:#14152b;--muted:#5b5d78;--accent:' + (this.props.accentColor || '#d8f24b') + ';--accent2:#ff5d4d;--accent3:#6a58f5;--headerBg:rgba(247,245,239,.86)';

    const cats = ['Arcade', 'Puzzle', 'Racing', 'Sports', 'Board', 'Strategy', 'Word', 'Casual', 'Kids'];
    const categories = cats.map(c => ({ label: c, href: '#/c/' + encodeURIComponent(c) }));
    const categoryCards = cats.map(c => ({
      label: c, href: '#/c/' + encodeURIComponent(c),
      count: this.games.filter(g => g.category === c).length,
      icon: this.icon(c)
    }));

    // library filtering
    const scope = this.libraryScope();
    let list = scope.list;
    const q = (st.query || '').trim().toLowerCase();
    if (q) list = this.games.filter(g =>
      (g.name + ' ' + g.category + ' ' + g.difficulty + ' ' + g.blurb).toLowerCase().indexOf(q) >= 0);
    if (st.cat !== 'All') list = list.filter(g => g.category === st.cat);
    if (st.sort === 'A–Z') list = list.slice().sort((a, b) => a.name.localeCompare(b.name));
    else if (st.sort === 'Newest') list = list.slice().sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0));
    else list = list.slice().sort((a, b) => b.plays - a.plays);

    const chip = (label, active, click) => ({
      label, active, click,
      bg: active ? 'var(--accent, #d8f24b)' : 'transparent',
      fg: active ? '#14152b' : 'var(--muted, #9a9cb8)'
    });

    const game = this.currentGame();
    const daily = this.dailyPick();
    const url = (typeof location !== 'undefined' ? location.href : '');
    const shareText = game ? 'Playing ' + game.name + ' on ' + this.brand() : 'Free browser games at ' + this.brand();

    const vals = {
      rootStyle,
      brandName: this.brand(),
      showAds: this.props.showAdSlots !== false,
      themeIcon: dark ? '☀' : '☾',
      menuOpen: !!st.menuOpen,
      query: st.query,
      gameCount: this.games.length,
      categories, categoryCards,
      allGames: this.games.map(g => ({ name: g.name, href: '#/game/' + g.id })),
      isHome: kind === 'home', isLibrary: kind === 'library', isGame: kind === 'game',
      isPage: kind === 'page', is404: kind === '404',
      featuredHref: '#/game/' + this.games[0].id,

      toggleTheme: () => { const t = dark ? 'light' : 'dark'; this.setState({ theme: t }); this.write('theme', t); },
      toggleMenu: () => this.setState({ menuOpen: !st.menuOpen }),
      closeMenu: () => this.setState({ menuOpen: false }),
      onSearch: e => {
        const v = e.target.value;
        this.setState({ query: v });
        if (v && this.routeKind() !== 'library') this.go('#/games');
      },
      randomGame: () => {
        const pool = this.games.filter(g => !game || g.id !== game.id);
        this.go('#/game/' + pool[Math.floor(Math.random() * pool.length)].id);
      },

      // home
      dailyTitle: daily.name + ' — beat your own best',
      dailyObjective: 'Today the arcade is pointing at ' + daily.name + '. ' + daily.howTo[0] + ' Your target: better the score stored in this browser.',
      dailyHref: '#/game/' + daily.id,
      dailyBest: this.bestOf(daily.id),
      dailyArt: this.art(daily.art, 168),
      trending: this.games.slice().sort((a, b) => b.plays - a.plays).slice(0, 4).map(g => this.cardOf(g)),
      quickPlay: this.games.filter(g => g.quick).map(g => this.cardOf(g)),
      hasRecents: (st.recents || []).length > 0,
      recentCards: (st.recents || []).map(id => this.games.find(g => g.id === id)).filter(Boolean).map(g => this.cardOf(g)),
      clearRecents: () => { this.setState({ recents: [] }); this.write('recent_games', []); },

      // library
      libraryTitle: q ? 'Search: “' + st.query + '”' : scope.title,
      libraryIntro: q ? 'Matching games from the whole library.' : scope.intro,
      catChips: ['All'].concat(cats).map(c => chip(c, st.cat === c, () => this.setState({ cat: c }))),
      sortChips: ['Popular', 'Newest', 'A–Z'].map(s => chip(s, st.sort === s, () => this.setState({ sort: s }))),
      cards: list.map(g => this.cardOf(g)),
      resultCount: list.length + (list.length === 1 ? ' game' : ' games'),
      hasResults: list.length > 0,
      noResults: list.length === 0,
      emptyTitle: q ? 'No games found.' : this.route() === '/favorites' ? 'No favorites yet.' : 'Nothing here yet.',
      emptyBody: q ? 'Try another search — “snake”, “puzzle” or “board” all land somewhere.'
        : this.route() === '/favorites' ? 'Tap the heart on any game card and it will show up here.'
        : 'Try a different category.',
      resetFilters: () => { this.setState({ query: '', cat: 'All' }); this.go('#/games'); },

      // game view
      gameName: game ? game.name : '',
      gameCategory: game ? game.category : '',
      gameCatHref: game ? '#/c/' + encodeURIComponent(game.category) : '#/games',
      gameDifficulty: game ? game.difficulty : '',
      gameDescription: game ? game.description : '',
      howTo: game ? game.howTo : [],
      controlsList: game ? game.controls : [],
      tips: game ? game.tips : [],
      faqs: game ? game.faqs : [],
      related: game ? this.games.filter(g => g.id !== game.id)
        .sort((a, b) => (b.category === game.category ? 1 : 0) - (a.category === game.category ? 1 : 0))
        .slice(0, 4).map(g => this.cardOf(g)) : [],
      stageRef: this.stageRef,
      score: st.score,
      best: game ? Math.max(this.bestOf(game.id), st.score) : 0,
      showOverlay: kind === 'game' && st.status !== 'playing' && st.status !== 'paused',
      overlayTitle: st.status === 'over' ? 'Game over' : (game ? 'Ready?' : ''),
      overlayBody: st.status === 'over' ? (st.overMsg || 'Have another go.')
        : (game ? game.howTo.join(' ') : ''),
      overlayCta: st.status === 'over' ? 'Play again' : 'Start game',
      startGame: () => {
        if (this.ctl) { if (st.status === 'over') this.ctl.restart(); else this.ctl.start(); }
        this.setState({ status: 'playing', score: st.status === 'over' ? 0 : st.score, overMsg: '' });
        this.beep(880, 0.08);
      },
      pauseGame: () => {
        if (!this.ctl || st.status === 'ready' || st.status === 'over') return;
        const running = this.ctl.pause();
        this.setState({ status: running ? 'playing' : 'paused' });
      },
      pauseLabel: st.status === 'paused' ? 'Resume' : 'Pause',
      restartGame: () => {
        if (this.ctl) this.ctl.restart();
        this.setState({ status: 'playing', score: 0, overMsg: '' });
      },
      toggleSound: () => { const v = !st.soundOn; this.setState({ soundOn: v }); this.write('sound', v); },
      soundOn: !!st.soundOn,
      soundLabel: st.soundOn ? 'Sound on' : 'Sound off',
      goFullscreen: () => {
        const host = this.stageRef.current;
        if (!host) return;
        try {
          if (document.fullscreenElement) document.exitFullscreen();
          else if (host.requestFullscreen) host.requestFullscreen();
        } catch (e) {}
      },
      diffChips: ['Easy', 'Normal', 'Hard'].map(d => chip(d, st.diff === d, () => {
        this.speedScale = { Easy: 0.82, Normal: 1, Hard: 1.25 }[d];
        this.setState({ diff: d }); this.write('difficulty', d);
      })),
      speedGame: !!game && ['snake-rush', 'brick-cascade', 'star-defender', 'road-racer', 'jump-runner'].indexOf(game.id) >= 0,
      supportsTwoPlayer: !!game && ['tic-tac-arena', 'drop-four', 'checkers-challenge'].indexOf(game.id) >= 0,
      twoPlayerOn: !!st.twoPlayer,
      twoPlayerLabel: st.twoPlayer ? 'Two players: on' : 'Two players: off',
      toggleTwoPlayer: () => {
        this.setState({ twoPlayer: !st.twoPlayer, status: 'ready', score: 0 });
        this.destroyGame();
      },
      showPad: !!st.showPad,
      togglePad: () => this.setState({ showPad: !st.showPad }),
      padKeys: [
        { label: '←', key: 'ArrowLeft' }, { label: '↑', key: 'ArrowUp' },
        { label: '↓', key: 'ArrowDown' }, { label: '→', key: 'ArrowRight' },
        { label: 'Action', key: ' ' }
      ].map(k => Object.assign({}, k, {
        press: e => {
          e.preventDefault();
          try {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: k.key, bubbles: true }));
            setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { key: k.key, bubbles: true })), 90);
          } catch (err) {}
        }
      })),
      streak: st.streak || 0,
      badgeCards: this.badgeList().map(b => ({
        label: b.label, hint: b.hint,
        earned: (st.badges || []).indexOf(b.id) >= 0,
        bg: (st.badges || []).indexOf(b.id) >= 0 ? 'var(--accent, #d8f24b)' : 'transparent',
        fg: (st.badges || []).indexOf(b.id) >= 0 ? '#14152b' : 'var(--muted, #9a9cb8)'
      })),
      earnedCount: (st.badges || []).length + ' of ' + this.badgeList().length + ' badges',
      newBadge: st.newBadge || '',
      hasNewBadge: !!st.newBadge,
      toggleFavCurrent: () => { if (game) this.toggleFav(game.id); },
      favLabelCurrent: game && (st.favs || []).indexOf(game.id) >= 0 ? '♥ In favorites' : '♡ Add to favorites',
      favColorCurrent: game && (st.favs || []).indexOf(game.id) >= 0 ? '#ff6b5d' : 'var(--text, #f2f2f7)',
      shareLinks: [
        { label: 'WhatsApp', href: 'https://wa.me/?text=' + encodeURIComponent(shareText + ' ' + url) },
        { label: 'Facebook', href: 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url) },
        { label: 'X', href: 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(shareText) + '&url=' + encodeURIComponent(url) },
        { label: 'Telegram', href: 'https://t.me/share/url?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent(shareText) }
      ],
      copyLabel: st.copied ? 'Link copied' : 'Copy link',
      copyLink: () => {
        try { navigator.clipboard.writeText(url); } catch (e) {}
        this.setState({ copied: true });
        setTimeout(() => this.setState({ copied: false }), 1800);
      },

      // static pages
      pageTitle: '', pageLede: '', pageBlocks: [],
      isContact: this.route() === '/contact',
      isSitemap: this.route() === '/sitemap',
      contactNotice: !!st.contactNotice,
      onContactSubmit: e => { e.preventDefault(); this.setState({ contactNotice: true }); }
    };

    const pd = this.pageData(this.route());
    if (pd) { vals.pageTitle = pd.title; vals.pageLede = pd.lede; vals.pageBlocks = pd.blocks; }
    return vals;
  }
}



// Standalone public API for GitHub Pages.
// The original source's game engines are retained; the application renderer is not required.
try {
  const arcadillo = new Component({ defaultTheme: 'dark' });
  window.ARCADILLO_GAMES = arcadillo.games;
  window.ARCADILLO_GAME_ENGINE = arcadillo;
  window.ARCADILLO_GAMES_VERSION = 'standalone-1';
} catch (e) {
  window.ARCADILLO_GAMES_ERROR = String(e && e.stack || e);
  console.error('Arcadillo game registry failed to initialize:', e);
}
