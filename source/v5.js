  /* ===================== v5: take it apart, build it yourself, part sounds, replay the moment, then & now, size comparison =====================
     This file is inserted inside the v4 layer (it uses its helpers: L, clamp, upMat, GH, thud, noise, tell, statusUpd...). */
  const REAL_H = { falcon: 7.0, surv: 3.0, viking: 2.1, vorb: 3.3, heli: 0.49 }; // real heights in metres (approximate)
  const FALCON_PARTS = {
    ascent: ["Ascent stage", "المرحلة الصاعدة", "It carried David Scott and James Irwin back up to lunar orbit on 2 August 1971.", "أعادت ديفيد سكوت وجيمس إروين إلى مدار القمر في 2 أغسطس 1971."],
    descent: ["Descent stage", "المرحلة الهابطة", "It landed on the Moon, then served as the launch pad for the ascent stage. It is still there.", "هبطت على القمر ثم كانت منصة الإطلاق للمرحلة الصاعدة، وما زالت هناك."]
  };

  /* ---------- parts: group the model's meshes into real parts ---------- */
  function partGroups(a, m) {
    m.updateWorldMatrix(true, true);
    const inv = new THREE.Matrix4().copy(m.matrixWorld).invert(), meshes = [];
    m.traverse(n => { if (n.isMesh && n.name != "cap") meshes.push(n); });
    const centre = n => { const g = n.geometry; if (!g.boundingBox) g.computeBoundingBox(); return g.boundingBox.getCenter(new V()).applyMatrix4(n.matrixWorld).applyMatrix4(inv); };
    const lowY = n => { const b = n.geometry.boundingBox.clone().applyMatrix4(n.matrixWorld).applyMatrix4(inv); return b.min.y; };
    const G = new Map(), add = (key, label, n) => { if (!G.has(key)) G.set(key, { key, label, items: [] }); G.get(key).items.push({ n, c: centre(n) }); };
    if (a.shape == "falcon") {
      let lo = 1e9, hi = -1e9; for (const n of meshes) { const c = centre(n); lo = Math.min(lo, c.y); hi = Math.max(hi, c.y); }
      const cut = lo + (hi - lo) * FALCON_CUT;
      for (const n of meshes) add(centre(n).y > cut ? "ascent" : "descent", null, n);
      for (const [k, g] of G) g.label = FALCON_PARTS[k];
    } else {
      const P = PARTS[a.shape] || [];
      for (const n of meshes) { const p = P.find(q => q[0] && q[0] == n.name); if (p) add(n.name, [p[1], p[2], p[3], p[4]], n); }
    }
    for (const g of G.values()) g.low = Math.min(...g.items.map(it => lowY(it.n)));
    return [...G.values()];
  }
  const gName = g => (LANG == "ar" ? g.label[1] : g.label[0]);

  /* ---------- overlay labels inside the 3D viewer ---------- */
  function ovl(o) {
    if (!o.ov) {
      const d = document.createElement("div"); d.className = "v4ovl"; o.el.appendChild(d);
      o.ov = { d, items: new Map() };
    }
    return o.ov;
  }
  const pjV = new V();
  function ovlSet(o, id, text, world, onClick) {
    const O = ovl(o); let it = O.items.get(id);
    if (!world) { if (it && it.vis) { it.b.style.display = "none"; it.vis = 0; } return; }
    if (!it) {
      const b = document.createElement(onClick ? "button" : "span"); b.className = "v4pl"; if (onClick) b.onclick = onClick;
      O.d.appendChild(b); it = { b, vis: 0 }; O.items.set(id, it);
    }
    if (it.t !== text) { it.b.textContent = text; it.t = text; }
    pjV.copy(world).project(o.cm);
    const w = o.el.clientWidth, h = o.el.clientHeight, x = Math.round((pjV.x + 1) / 2 * w), y = Math.round((1 - pjV.y) / 2 * h), vis = pjV.z < 1 && x > 0 && x < w && y > 0 && y < h;
    if (vis != it.vis) { it.b.style.display = vis ? "" : "none"; it.vis = vis; }
    if (vis && (it.x !== x || it.y !== y)) { it.b.style.transform = "translate(" + x + "px," + y + "px) translate(-50%,-50%)"; it.x = x; it.y = y; }
  }
  function ovlClear(o, prefix) { if (!o.ov) return; for (const [k, it] of o.ov.items) if (k.startsWith(prefix) && it.vis) { it.b.style.display = "none"; it.vis = 0; } }

  /* ---------- 1. take it apart: every part slides out from the centre, with a label ---------- */
  function setupParts(o) {
    if (o.P) return o.P;
    o.sc.updateMatrixWorld(true);
    const a = o.a, m = o.m, gs = partGroups(a, m), D = Math.max(o.reach, o.size.y) * 0.55, C0 = m.position.clone().negate(), tmpA = new V(), tmpB = new V();
    for (const g of gs) {
      g.e = 0; g.tgt = 0;
      for (const it of g.items) {
        const d = it.c.clone().sub(C0);
        if (a.shape == "falcon") d.set(0, g.key == "ascent" ? 1 : 0, 0);
        else { if (Math.hypot(d.x, d.z) < 0.15 * o.reach) d.set(0, d.y >= 0 ? 1 : 0.3, 0); else if (d.y < 0) d.y *= 0.15; else d.y *= 0.6; }
        if (d.lengthSq() < 1e-6) d.set(0, 1, 0);
        d.normalize();
        m.localToWorld(tmpA.copy(it.c)); m.localToWorld(tmpB.copy(it.c).addScaledVector(d, D));
        const wp = it.n.getWorldPosition(new V()).add(tmpB.sub(tmpA));
        it.p0 = it.n.position.clone(); it.p1 = it.n.parent.worldToLocal(wp); it.d = d;
      }
      // label sits on the item farthest from the axis
      g.anchor = g.items.reduce((b, it) => (Math.hypot(it.c.x - C0.x, it.c.z - C0.z) > Math.hypot(b.c.x - C0.x, b.c.z - C0.z) ? it : b), g.items[0]);
    }
    const P = { gs, D, exp: 0, C0 };
    const lw = new V();
    o.hooks.push(dt => {
      let moving = 0;
      for (const g of gs) {
        if (g.e !== g.tgt) {
          g.e += (g.tgt - g.e) * Math.min(1, dt * (RMV() ? 60 : 4.5)); if (Math.abs(g.tgt - g.e) < 0.002) g.e = g.tgt;
          for (const it of g.items) it.n.position.lerpVectors(it.p0, it.p1, g.e);
          moving = 1;
        }
      }
      if (o.dust) o.dust.visible = !gs.some(g => g.e > 0.02);
      // labels while apart (and for unplaced parts while building)
      const show = P.exp || P.build;
      for (const g of gs) {
        const on = show && g.e > 0.5 && !(P.build && g.placed);
        if (!on) { ovlSet(o, "p:" + g.key, "", null); continue; }
        o.m.localToWorld(lw.copy(g.anchor.c).addScaledVector(g.anchor.d, P.D * g.e));
        ovlSet(o, "p:" + g.key, gName(g), lw, () => partInfo(o, g));
      }
      if (moving) o.hold = Math.max(o.hold, performance.now() + 1500);
    });
    o.P = P;
    return P;
  }
  function partInfo(o, g) {
    const i = (PARTS[o.a.shape] || []).findIndex(p => p[0] == g.key), chip = i >= 0 && document.querySelector('#pt .chip[data-i="' + i + '"]');
    if (chip) { if (!chip.classList.contains("sel")) chip.click(); return; }
    partSound(g.key); const t = gName(g) + ". " + (LANG == "ar" ? g.label[3] : g.label[2]); say(t, vm); toast(t);
  }
  function explodeToggle() {
    const o = mini; if (!o || !o.a) return; const P = setupParts(o);
    if (P.build) return;
    P.exp = !P.exp; for (const g of P.gs) g.tgt = P.exp ? 1 : 0;
    o.setDist(P.exp ? Math.max(o.getDist(), 7) : 4.7); // step back so the parts stay in view
    if (P.exp) { partSound(o.a.shape == "falcon" ? "ascent" : "clank"); ann(L("Taken apart. Parts: ", "تم التفكيك. القطع: ") + P.gs.map(gName).join(LANG == "ar" ? "، " : ", ") + ". " + L("Click a label to learn about that part.", "اضغط على اسم قطعة لتعرف عنها.")); }
    else ann(L("Put back together.", "تم التركيب."));
    toolsUpd();
  }

  /* ---------- 2. build it yourself: attach the parts from the bottom up ---------- */
  let B = null;
  function buildStart() {
    const o = mini; if (!o || !o.a) return; const P = setupParts(o);
    if (P.gs.length < 3) return;
    P.exp = 0; P.build = 1;
    for (const g of P.gs) { g.tgt = 1.3; g.placed = 0; }
    const H = o.size.y; B = { o, P, left: P.gs.slice(), miss: 0, tol: H * 0.06, done: 0 };
    o.setDist(Math.max(o.getDist(), 7.6));
    hl("");
    buildDraw(L("Build ", "ركّب ") + nm(o.a) + L(" from the bottom up. Which part do we attach first?", " من الأسفل إلى الأعلى. أي قطعة نركّب أولاً؟"), 1);
    toolsUpd();
  }
  function buildDraw(msg, speak) {
    const box = $("#v4build"); if (!B) { box.hidden = true; box.innerHTML = ""; return; }
    box.hidden = false;
    const n = B.P.gs.length, placed = n - B.left.length, order = B.order || (B.order = B.left.slice().sort(() => R() - 0.5));
    const left = order.filter(g => B.left.includes(g));
    box.innerHTML = '<div class="v4bh"><b>🧱 ' + L("Build it yourself", "ركّبها بنفسك") + '</b><span>' + placed + " / " + n + '</span><button class="chip" id="v4bx">✕ ' + L("Stop", "إيقاف") + '</button></div>'
      + '<div class="v4bp"><i style="width:' + (placed / n * 100) + '%"></i></div>'
      + '<p id="v4bm" aria-live="polite">' + esc(msg) + "</p>"
      + (B.done ? '<div class="v4bc"><button class="key" id="v4bagain"><i></i>↻ ' + L("Play again", "العب مرة أخرى") + "</button></div>"
        : '<div class="v4bc">' + left.map((g, i) => '<button class="chip" data-k="' + g.key + '"><kbd>' + (i + 1) + "</kbd> " + esc(gName(g)) + "</button>").join("") + "</div>");
    $("#v4bx").onclick = buildStop;
    const ag = $("#v4bagain"); if (ag) ag.onclick = () => { buildStop(); buildStart(); };
    box.querySelectorAll("[data-k]").forEach(b => b.onclick = () => buildPick(b.dataset.k, b));
    if (speak) { say(msg + (B.done ? "" : " " + left.map((g, i) => (i + 1) + " " + gName(g)).join(LANG == "ar" ? "، " : ", ")), vm); }
  }
  function buildPick(key, btn) {
    if (!B || B.done) return;
    const g = B.left.find(z => z.key == key); if (!g) return;
    const lowest = Math.min(...B.left.map(z => z.low));
    if (g.low <= lowest + B.tol) {
      g.tgt = 0; g.placed = 1; B.left = B.left.filter(z => z !== g); partSound(g.key);
      const desc = (LANG == "ar" ? g.label[3] : g.label[2]) || "", first = (desc.match(/^[^.!؟?]+[.!؟?]?/) || [""])[0];
      if (!B.left.length) {
        B.done = 1; B.P.build = 0; B.o.setDist(4.7);
        const msg = L("Built! ", "اكتمل التركيب! ") + nm(B.o.a) + L(" is complete", " جاهزة") + (B.miss ? L(" with " + B.miss + " wrong tries.", " مع " + B.miss + " محاولات خاطئة.") : L(" with no mistakes. Excellent!", " بلا أي خطأ. ممتاز!"));
        [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.14), i * 130));
        buildDraw(msg, 1);
      } else buildDraw("✅ " + gName(g) + ". " + first + " " + L("What comes next?", "ما التالي؟"), 1);
    } else {
      B.miss++; beep(170, 0.18);
      if (btn) { btn.classList.remove("no"); void btn.offsetWidth; btn.classList.add("no"); }
      const m = L("Not yet: ", "ليس بعد: ") + gName(g) + L(" sits higher up. Attach a lower part first.", " مكانها أعلى. ركّب قطعة أسفل منها أولاً.");
      const p = $("#v4bm"); if (p) p.textContent = m; say(m, vm);
    }
  }
  function buildStop() {
    if (!B) return; const P = B.P; P.build = 0; for (const g of P.gs) { g.tgt = 0; g.placed = 0; }
    if (B.o === mini) B.o.setDist(4.7);
    B = null; buildDraw(); toolsUpd();
  }

  /* ---------- 3. a sound for every part ---------- */
  const SKIND = k => /blade|rot/.test(k) ? "whirr" : /hga|uhf|lga|ant/.test(k) ? "radio" : /eng|ascent/.test(k) ? "engine" : /cam|scan/.test(k) ? "shutter"
    : /solar|panel/.test(k) ? "hum" : /rtg/.test(k) ? "warm" : /sampler|scoop/.test(k) ? "servo" : /leg|pad|descent|clank/.test(k) ? "clank" : /tank/.test(k) ? "slosh" : /met/.test(k) ? "wind" : "click";
  function partSound(key) {
    if (MUTE) return;
    let c; try { c = au(); } catch (e) { return; }
    const T = c.currentTime, V0 = SET.safe ? 0.05 : 0.1, out = c.createGain(); out.gain.value = 1; out.connect(c.destination);
    const env = (g, a, peak, d) => { g.gain.setValueAtTime(0.0001, T + a); g.gain.linearRampToValueAtTime(peak, T + a + 0.02); g.gain.exponentialRampToValueAtTime(0.0005, T + a + d); };
    const osc = (type, f, a, d, peak, f2) => { const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f, T + a); if (f2) o.frequency.linearRampToValueAtTime(f2, T + a + d); env(g, a, peak, d); o.connect(g); g.connect(out); o.start(T + a); o.stop(T + a + d + 0.05); return o; };
    const nz = (ft, f, q, a, d, peak) => { const s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain(); s.buffer = noise(); fl.type = ft; fl.frequency.value = f; fl.Q.value = q; env(g, a, peak, d); s.connect(fl); fl.connect(g); g.connect(out); s.start(T + a, R(), d + 0.05); return g; };
    switch (SKIND(key)) {
      case "radio": [1400, 1000, 1400, 1800].forEach((f, i) => osc("sine", f, i * 0.11, 0.08, V0 * 0.8)); break;
      case "whirr": { const o = osc("sawtooth", 95, 0, 1.2, V0 * 0.7, 140), lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 22; lg.gain.value = 40; lfo.connect(lg); lg.connect(o.frequency); lfo.start(T); lfo.stop(T + 1.3); break; }
      case "engine": nz("lowpass", 320, 0.7, 0, 1.1, V0 * 2.2); osc("sine", 55, 0, 1.1, V0 * 0.8); break;
      case "shutter": nz("highpass", 2500, 0.8, 0, 0.04, V0 * 2); nz("highpass", 1800, 0.8, 0.1, 0.05, V0 * 1.6); break;
      case "hum": osc("sine", 220, 0, 0.8, V0 * 0.5); osc("sine", 330, 0.05, 0.75, V0 * 0.35); break;
      case "warm": osc("sine", 110, 0, 0.9, V0 * 0.6); [0.2, 0.45, 0.6].forEach(a => nz("highpass", 3000, 1, a, 0.02, V0 * 1.2)); break;
      case "servo": osc("square", 180, 0, 0.35, V0 * 0.25, 420); osc("square", 420, 0.4, 0.35, V0 * 0.25, 200); break;
      case "clank": nz("bandpass", 900, 8, 0, 0.35, V0 * 3); osc("sine", 620, 0, 0.4, V0 * 0.5); break;
      case "slosh": { const g = nz("lowpass", 500, 1, 0, 0.9, V0 * 1.6), lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 3; lg.gain.value = V0; lfo.connect(lg); lg.connect(g.gain); lfo.start(T); lfo.stop(T + 1); break; }
      case "wind": nz("bandpass", 600, 1, 0, 1, V0 * 1.6); break;
      default: osc("sine", 880, 0, 0.1, V0);
    }
    setTimeout(() => out.disconnect(), 1800);
  }
  const hl0 = hl;
  hl = function (n) { hl0(n); if (n) partSound(n); };

  /* ---------- 4. replay the moment in the world ---------- */
  const FX = new THREE.Group(); scene.add(FX);
  const fMat = new THREE.MeshBasicMaterial({ color: 0xff9a3a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const fCore = new THREE.MeshBasicMaterial({ color: 0xfff1c0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const mkFlame = () => {
    const g = new THREE.Group(), a = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.8, 16, 1, true), fMat), b = new THREE.Mesh(new THREE.ConeGeometry(0.15, 1.0, 12, 1, true), fCore);
    a.rotation.x = b.rotation.x = Math.PI; a.position.y = -0.9; b.position.y = -0.5; g.add(a, b); FX.add(g); return g;
  };
  const flames = [mkFlame(), mkFlame(), mkFlame()];
  const beam = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0x7fd1ff, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  FX.add(beam);
  const PN = 120, pPos = new Float32Array(PN * 3), pVel = new Float32Array(PN * 3), pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
  const puff = new THREE.Points(pGeo, new THREE.PointsMaterial({ map: SOFT, size: 1.1, color: 0xc8865a, transparent: true, opacity: 0, depthWrite: false }));
  puff.frustumCulled = false; FX.add(puff);
  let puffT = 9, puffI = 0;
  function burst(x, y, z, n, power) {
    puff.material.color.set(cur == "moon" ? 0xb9b9be : 0xc8865a);
    for (let k = 0; k < n; k++) {
      const i = puffI++ % PN, a = R() * TAU, s = power * (0.5 + R());
      pPos[i * 3] = x; pPos[i * 3 + 1] = y + 0.1; pPos[i * 3 + 2] = z;
      pVel[i * 3] = Math.cos(a) * s; pVel[i * 3 + 1] = (0.3 + R() * 0.6) * power * 0.5; pVel[i * 3 + 2] = Math.sin(a) * s;
    }
    puffT = 0; pGeo.attributes.position.needsUpdate = true;
  }
  // compile the effect shaders now, so the first replay does not stutter
  try { for (const f of flames) f.visible = true; beam.visible = puff.visible = true; rd.compile(scene, camera); } catch (e) { console.warn(e); }
  for (const f of flames) f.visible = false; beam.visible = false;

  let RP = null, buzz = null;
  const ease = s => (s <= 0 ? 0 : s >= 1 ? 1 : s * s * (3 - 2 * s));
  const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
  function flameAt(f, p, s, on) { f.visible = on; if (!on) return; f.position.copy(p); const k = s * (0.85 + 0.3 * R()); f.scale.set(s, k, s); }
  function buzzSet(level) {
    if (MUTE || !AC) { if (buzz) buzz.g.gain.value = 0; return; }
    try {
      if (!buzz) { const o = AC.createOscillator(), f = AC.createBiquadFilter(), g = AC.createGain(); o.type = "sawtooth"; o.frequency.value = 92; f.type = "lowpass"; f.frequency.value = 700; g.gain.value = 0; o.connect(f); f.connect(g); g.connect(AC.destination); o.start(); buzz = { o, g }; }
      buzz.g.gain.setTargetAtTime(level, AC.currentTime, 0.1); buzz.o.frequency.setTargetAtTime(70 + level * 500, AC.currentTime, 0.2);
    } catch (e) { console.warn(e); }
  }
  const STORY = {
    surv: ["Surveyor 3, 20 April 1967. Shiny rocks confused my radar, so my engines did not shut off in time, and I bounced twice before I settled.", "سيرفيور 3، 20 أبريل 1967. أربكت صخور لامعة راداري فلم تتوقف محركاتي في الوقت المناسب، فارتددت مرتين قبل أن أستقر."],
    falcon: ["Falcon, Apollo 15, 2 August 1971. The ascent stage fired its engine and carried Scott and Irwin back to orbit, using the descent stage as its launch pad. The descent stage is still on the Moon.", "فالكون، أبولو 15، 2 أغسطس 1971. أشعلت المرحلة الصاعدة محركها وأعادت سكوت وإروين إلى المدار، مستخدمة المرحلة الهابطة منصة إطلاق. وما زالت المرحلة الهابطة على القمر."],
    viking: ["Viking 1, 20 July 1976: the first fully successful landing on Mars. On 28 July my robot arm scooped the first Martian soil into my biology lab.", "فايكنغ 1، 20 يوليو 1976: أول هبوط ناجح تماماً على المريخ. وفي 28 يوليو غرفت ذراعي الآلية أول تربة مريخية إلى مختبر الأحياء."],
    vorb: ["Viking 1 orbiter, 1976. Before the landing my cameras showed the planned site was too rough, so the lander was sent somewhere safer. Then I mapped Mars from orbit.", "مدارية فايكنغ 1، 1976. قبل الهبوط أظهرت كاميراتي أن الموقع المخطط وعر، فأُرسلت الهابطة إلى مكان أكثر أماناً. ثم رسمت خريطة المريخ من المدار."],
    heli: ["Ingenuity, 19 April 2021: the first powered, controlled flight on another planet. I was planned for five flights, and I flew seventy-two.", "إنجينيويتي، 19 أبريل 2021: أول طيران بمحرك ومتحكم به على كوكب آخر. خُطط لي خمس رحلات، وطرت اثنتين وسبعين."]
  };
  function replayStart(a) {
    if (!a) return;
    if (st < 2 || a.k != cur) { tell(L("Land near this machine first, then replay its moment.", "اهبط قرب هذه الآلة أولاً، ثم أعد لحظتها.")); return; }
    if (RP) RP.end();
    if (mo) closeM();
    const m = a.m, base = { p: m.position.clone(), r: m.rotation.clone() }, sc = a.sc || 1, gy = a.p.y - 2.6, W_ = new V();
    let last = 0, dur = 11, upd = () => {}, fin = () => {};
    const hit = (x, z, n, pw) => { burst(x, gy + 0.1, z, n, pw); thud(0, 300, 0.12); };
    if (a.shape == "surv") {
      dur = 10.5;
      upd = t => {
        let h = 0;
        if (t < 5) h = 14 * Math.pow(1 - t / 5, 1.6);
        else if (t < 6.3) { const s = (t - 5) / 1.3; h = 7.2 * s * (1 - s); }
        else if (t < 7.1) { const s = (t - 6.3) / 0.8; h = 2.2 * s * (1 - s); }
        for (const tt of [5, 6.3, 7.1]) if (last < tt && t >= tt) hit(a.x, a.z, tt == 5 ? 40 : 20, tt == 5 ? 3 : 2);
        m.position.y = base.p.y + h; m.rotation.z = base.r.z + (t > 5 && t < 7.4 ? Math.sin(t * 11) * 0.06 * (7.4 - t) : 0);
        flameAt(flames[0], W_.set(a.x, m.position.y + 0.55, a.z), sc * 0.8, t < 5);
        rumble(t < 5 ? 0.22 : 0);
      };
    } else if (a.shape == "falcon") {
      dur = 12.5;
      m.updateWorldMatrix(true, true);
      const ms = []; let lo = 1e9, hi = -1e9;
      m.traverse(n => { if (n.isMesh) { if (!n.geometry.boundingBox) n.geometry.computeBoundingBox(); const c = n.geometry.boundingBox.getCenter(new V()).applyMatrix4(n.matrixWorld); ms.push([n, c]); lo = Math.min(lo, c.y); hi = Math.max(hi, c.y); } });
      const cut = lo + (hi - lo) * FALCON_CUT, asc = ms.filter(q => q[1].y > cut).map(([n]) => { const p0 = n.position.clone(), up = n.parent.worldToLocal(n.getWorldPosition(new V()).add(new V(0, 1, 0))).sub(p0); return { n, p0, up }; });
      const lift = u => { for (const q of asc) q.n.position.copy(q.p0).addScaledVector(q.up, u); };
      upd = t => {
        let u = 0;
        if (t >= 1.2 && t < 8) u = 1.1 * Math.pow(t - 1.2, 2);
        else if (t >= 8 && t < 9.5) u = 60;
        else if (t >= 9.5) u = 9 * (1 - ease(seg(t, 9.5, 12)));
        lift(u);
        if (last < 1.2 && t >= 1.2) hit(a.x, a.z, 50, 3.5);
        flameAt(flames[0], W_.set(a.x, cut + u - 0.2, a.z), 1.1, t > 0.4 && t < 8);
        rumble(t > 0.4 && t < 6 ? 0.25 : 0);
      };
      fin = () => lift(0);
    } else if (a.shape == "viking") {
      dur = 13.5;
      const P0 = new V(1.2, 1.15, 0.2), arm = [];
      m.traverse(n => { if (n.isMesh && n.name == "sampler") arm.push(n); });
      const pivot = new THREE.Group(); pivot.position.copy(P0);
      const u = new V(3, -0.8, 0.8).normalize(), axis = new V().crossVectors(u, new V(0, 1, 0)).normalize(), tip = new V(4.2, 0.33, 1).sub(P0);
      const saved = arm.map(n => ({ n, parent: n.parent, p: n.position.clone(), q: n.quaternion.clone() }));
      m.add(pivot); for (const s of saved) { pivot.add(s.n); s.n.position.copy(s.p).sub(P0); }
      const engines = [0, 1, 2].map(i => { const b = i * TAU / 3 + 0.52 + TAU / 6; return new V(Math.cos(b) * 0.7, 0.45, Math.sin(b) * 0.7); });
      upd = t => {
        const h = t < 4.5 ? 9 * Math.pow(1 - t / 4.5, 2) : 0;
        m.position.y = base.p.y + h;
        if (last < 4.5 && t >= 4.5) hit(a.x, a.z, 45, 3);
        m.updateMatrixWorld(true);
        engines.forEach((e, i) => flameAt(flames[i], m.localToWorld(W_.copy(e)), sc * 0.45, t < 4.5));
        rumble(t < 4.5 ? 0.2 : 0);
        let ang = 0;
        if (t > 5) ang = t < 6.5 ? 0.25 * ease(seg(t, 5, 6.5)) : t < 8 ? 0.25 - 0.36 * ease(seg(t, 6.5, 8)) : t < 9.3 ? -0.11 + Math.sin((t - 8) * 9) * 0.015 : t < 11 ? -0.11 + 0.6 * ease(seg(t, 9.3, 11)) : 0.49 * (1 - ease(seg(t, 11, 12.8)));
        pivot.quaternion.setFromAxisAngle(axis, ang);
        if (last < 8 && t >= 8) { pivot.updateMatrixWorld(true); const w = pivot.localToWorld(W_.copy(tip)); burst(w.x, gy, w.z, 25, 1.2); partSound("sampler"); }
      };
      fin = () => { for (const s of saved) { s.parent.add(s.n); s.n.position.copy(s.p); s.n.quaternion.copy(s.q); } m.remove(pivot); };
    } else if (a.shape == "vorb") {
      dur = 12;
      upd = t => {
        const h = 7 * (t < 2.5 ? ease(t / 2.5) : t < 9.5 ? 1 : 1 - ease(seg(t, 9.5, 12)));
        m.position.y = base.p.y + h; m.rotation.y = base.r.y + TAU * ease(seg(t, 2.5, 9.5));
        const on = t > 2.6 && t < 9.4; beam.visible = on;
        if (on) { const bh = h + 0.6; beam.scale.set(2.2 + Math.sin(t * 2) * 0.4, bh, 2.2 + Math.sin(t * 2) * 0.4); beam.position.set(a.x + Math.sin(t * 1.3) * 1.2, gy + bh / 2, a.z + Math.cos(t * 1.1) * 1.2); beam.material.opacity = 0.12 + 0.06 * Math.sin(t * 6); }
        if (last < 3 && t >= 3) partSound("scan");
      };
    } else if (a.shape == "heli") {
      dur = 14;
      const rots = m.userData.rot || [];
      upd = (t, dt) => {
        const w = 42 * (t < 2 ? ease(t / 2) : t < 12 ? 1 : 1 - ease(seg(t, 12, 14)));
        rots.forEach((q, i) => (q.rotation.y += (i ? -1 : 1) * w * dt));
        const h = 4 * (t < 2 ? 0 : t < 3.5 ? ease(seg(t, 2, 3.5)) : t < 11 ? 1 : 1 - ease(seg(t, 11, 12.5))) + (t > 3.5 && t < 11 ? Math.sin(t * 1.7) * 0.3 : 0);
        const r = 6 * (t < 3.5 ? 0 : t < 5 ? ease(seg(t, 3.5, 5)) : t < 9.5 ? 1 : 1 - ease(seg(t, 9.5, 11))), ph = (t - 3.5) / 7.5 * TAU;
        m.position.set(a.x + Math.sin(ph) * r, gy + 0.38 + h, a.z + (Math.cos(ph) - 1) * r * 0.9);
        m.rotation.set(base.r.x, base.r.y + (r > 0.1 ? ph : 0), r > 0.1 ? -0.14 : 0);
        buzzSet(w / 42 * (SET.safe ? 0.02 : 0.045));
        if (h < 1.2 && w > 20 && Math.floor(t * 4) !== Math.floor(last * 4)) burst(m.position.x, gy, m.position.z, 6, 1.5);
      };
      fin = () => buzzSet(0);
    }
    // camera assist: step back and look at the machine, unless the visitor moves
    const want = { surv: 14, falcon: 17, viking: 14, vorb: 15, heli: 14 }[a.shape] || 14, lookH = { surv: 5, falcon: 7, viking: 3, vorb: 4, heli: 3 }[a.shape] || 3;
    let dx = px - a.x, dz = pz - a.z, dl = Math.hypot(dx, dz); if (dl < 0.5) { dx = 0; dz = 1; dl = 1; }
    const cam = st == 3 ? { x: a.x + dx / dl * want, z: a.z + dz / dl * want } : null;
    RP = {
      a, t: 0, dur, cam,
      upd(dt) {
        const t = this.t;
        if (this.cam && t < 1.4 && !(K.KeyW || K.KeyS || K.KeyA || K.KeyD || K.ArrowUp || K.ArrowDown || K.ArrowLeft || K.ArrowRight)) {
          const k = Math.min(1, dt * 3.2); px += (this.cam.x - px) * k; pz += (this.cam.z - pz) * k;
          yaw += wr(Math.atan2(-(a.x - px), -(a.z - pz)) - yaw) * k; pit += (Math.atan2(lookH - 1.7, Math.hypot(a.x - px, a.z - pz)) - pit) * k;
        } else this.cam = null;
        upd(t, dt); last = t;
        if (puffT < 3) {
          puffT += dt; puff.material.opacity = Math.max(0, 0.55 * (1 - puffT / 2.5));
          for (let i = 0; i < PN; i++) { pPos[i * 3] += pVel[i * 3] * dt; pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt; pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt; pVel[i * 3] *= 0.97; pVel[i * 3 + 2] *= 0.97; pVel[i * 3 + 1] -= 0.4 * dt; }
          pGeo.attributes.position.needsUpdate = true;
        }
      },
      end() {
        try { fin(); } catch (e) { console.warn(e); }
        m.position.copy(base.p); m.rotation.copy(base.r);
        for (const f of flames) f.visible = false; beam.visible = false; rumble(st > 1 && cur == "mars" ? 0.05 : 0); buzzSet(0);
        RP = null;
      }
    };
    const s = STORY[a.shape]; if (s) { const txt = LANG == "ar" ? s[1] : s[0]; say(txt, vm); toast(txt); $("#live").textContent = txt; }
  }
  V4.frame.push(dt => {
    if (puffT < 3 && !RP) { puffT += dt; puff.material.opacity = Math.max(0, 0.55 * (1 - puffT / 2.5)); }
    if (!RP) return;
    if (st < 2 || RP.a.k != cur) { RP.end(); return; }
    RP.t += dt; RP.upd(dt);
    if (RP.t >= RP.dur) RP.end();
  });

  /* ---------- 5. then and now: dust settles on the model over the years ---------- */
  function setupDust(o) {
    if (o.dust !== undefined) return o.dust;
    o.sc.updateMatrixWorld(true);
    const m = o.m, inv = new THREE.Matrix4().copy(m.matrixWorld).invert(), nm3 = new THREE.Matrix3(), pts = [], p = new V(), nn = new V();
    m.traverse(n => {
      if (!n.isMesh || !n.visible) return; const g = n.geometry, P_ = g.attributes.position, N_ = g.attributes.normal; if (!N_) return;
      nm3.getNormalMatrix(n.matrixWorld); const step = Math.max(1, Math.floor(P_.count / 400));
      for (let i = 0; i < P_.count; i += step) {
        nn.fromBufferAttribute(N_, i).applyMatrix3(nm3).normalize(); if (nn.y < 0.55) continue;
        p.fromBufferAttribute(P_, i).applyMatrix4(n.matrixWorld).applyMatrix4(inv); pts.push(p.x, p.y + 0.01 * o.size.y, p.z);
      }
    });
    if (!pts.length) { o.dust = null; return null; }
    const n = pts.length / 3, idx = [...Array(n).keys()].sort(() => R() - 0.5), arr = new Float32Array(n * 3);
    idx.forEach((j, i) => { arr[i * 3] = pts[j * 3] + (R() - 0.5) * 0.04 * o.size.y; arr[i * 3 + 1] = pts[j * 3 + 1]; arr[i * 3 + 2] = pts[j * 3 + 2] + (R() - 0.5) * 0.04 * o.size.y; });
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(arr, 3)); geo.setDrawRange(0, 0);
    const d = new THREE.Points(geo, new THREE.PointsMaterial({ map: SOFT, size: 0.05, color: o.a.k == "moon" ? 0xc9c9cc : 0xc0714a, transparent: true, opacity: 0.95, depthWrite: false }));
    d.userData.n = n; m.add(d); o.dust = d;
    (o.onStop || (o.onStop = [])).push(() => { geo.dispose(); d.material.dispose(); });
    return d;
  }
  const tf0 = timeFx;
  timeFx = function (a, yr, kk) {
    tf0(a, yr, kk);
    const f = Math.max(0, Math.min(1, (yr - a.y0) / (2050 - a.y0))), k = kk !== undefined ? kk : f * a.cov, pc = Math.round(k * 100), moon = a.k == "moon";
    const txt = yr + ": " + (moon ? L("sunlight fades the colours and fine dust settles ≈ ", "الشمس تبهّت الألوان ويستقر غبار ناعم ≈ ") : L("red dust covers it ≈ ", "الغبار الأحمر يغطيها ≈ ")) + pc + "%";
    const ye = $("#ye"); if (ye) ye.textContent = txt;
    const yv = $("#v4yrv"); if (yv) yv.textContent = yr;
    const yrI = $("#yr"); if (yrI) yrI.setAttribute("aria-valuetext", txt);
    if (mini && mini.a === a && mini.m) { const d = k > 0 ? setupDust(mini) : mini.dust; if (d) d.geometry.setDrawRange(0, Math.round(d.userData.n * Math.min(1, k * 1.25))); }
  };

  /* ---------- 6. compare its size with a person ---------- */
  function compareToggle() {
    const o = mini; if (!o || !o.a) return;
    const C = o.C || (o.C = { on: 0, s: 1, x: 0, g: 0 });
    if (!C.person) {
      const modelH = o.size.y * o.k, personH = modelH * 1.8 / (REAL_H[o.a.shape] || 2), G = new THREE.Group();
      let p;
      if (SUIT) { p = SUIT.clone(); p.traverse(n => { if (n.isMesh) { n.userData.noDispose = 1; n.castShadow = true; } }); }
      else {
        p = new THREE.Group(); const mt_ = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.7 });
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.2, 1.0, 16), mt_); body.position.y = 0.95; const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), mt_); head.position.y = 1.62;
        const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.16, 0.5, 12), mt_); legs.position.y = 0.25; p.add(body, head, legs);
      }
      p.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(p), hh = b.max.y - b.min.y || 1, c = b.getCenter(new V());
      p.position.x -= c.x; p.position.z -= c.z; p.position.y -= b.min.y; G.add(p);
      const sc = personH / hh, wdt = Math.max(b.max.x - b.min.x, b.max.z - b.min.z) * sc;
      G.userData.s = sc; G.scale.setScalar(0.0001); G.rotation.y = 0.45; G.position.set(-(o.SR + wdt / 2 + 0.25), o.floor, 0); G.visible = false; o.root.add(G);
      const left = G.position.x - wdt / 2, right = o.SR, pairW = right - left, maxH = Math.max(personH, modelH);
      C.person = G; C.ts = Math.min(1, 2.4 / maxH, 4.2 / pairW); C.tx = -((left + right) / 2) * C.ts; C.personH = personH; C.modelH = modelH;
      const lw = new V();
      o.hooks.push(dt => {
        const k = Math.min(1, dt * (RMV() ? 60 : 4));
        const ts = C.on ? C.ts : 1, tx = C.on ? C.tx : 0; C.s += (ts - C.s) * k; C.x += (tx - C.x) * k;
        o.root.scale.setScalar(C.s); o.root.position.set(C.x, o.floor * (1 - C.s), 0);
        C.g += ((C.on ? 1 : 0) - C.g) * k; G.visible = C.g > 0.01; G.scale.setScalar(Math.max(0.0001, G.userData.s * C.g));
        if (C.on && C.g > 0.9) {
          o.root.updateMatrixWorld(true);
          ovlSet(o, "c:p", "🧑‍🚀 1.8 " + L("m", "م"), G.localToWorld(lw.set(0, personH / G.userData.s * 1.08, 0)));
          ovlSet(o, "c:m", "≈ " + REAL_H[o.a.shape] + " " + L("m", "م"), o.root.localToWorld(lw.set(0, o.floor + modelH * 1.05, 0)));
        } else ovlClear(o, "c:");
      });
    }
    C.on = !C.on;
    o.setDist(C.on ? Math.max(o.getDist(), 5.8) : 4.7);
    if (C.on) {
      const t = L("A person is about 1.8 metres tall. ", "طول الإنسان نحو 1.8 متر. ") + nm(o.a) + L(" is about " + REAL_H[o.a.shape] + " metres tall.", " طولها نحو " + REAL_H[o.a.shape] + " متر.");
      say(t, vm); ann(t);
    }
    toolsUpd();
  }

  /* ---------- the tool bar inside each machine window ---------- */
  {
    const ga = $("#ga");
    ga.insertAdjacentHTML("afterend", '<div id="v4tools" role="group"></div><div id="v4build" hidden></div><div id="v4yrw"><div class="v4yrh"><span id="v4yrl"></span><b id="v4yrv"></b></div><small id="v4yrn"></small></div>');
    const w = $("#v4yrw"); w.insertBefore($("#yr"), $("#v4yrn")); w.insertBefore($("#ye"), $("#v4yrn"));
    $("#yr").setAttribute("aria-labelledby", "v4yrl");
  }
  function toolsUpd() {
    const box = $("#v4tools"); if (!mo || !ca) { box.innerHTML = ""; return; }
    const o = mini, P = o && o.P, nParts = o && o.a === ca ? (P ? P.gs.length : (o.nParts !== undefined ? o.nParts : (o.nParts = partGroups(ca, o.m).length))) : 0;
    const exp = P && P.exp, bld = !!B, cmp = o && o.C && o.C.on;
    const btn = (id, ic, txt, key, on, hide) => hide ? "" : '<button class="key" id="' + id + '" aria-keyshortcuts="' + key + '"' + (on !== undefined ? ' aria-pressed="' + (on ? "true" : "false") + '"' : "") + "><i></i>" + ic + " " + txt + ' <span class="kb">[' + key + "]</span></button>";
    box.setAttribute("aria-label", L("Model tools", "أدوات المجسم"));
    box.innerHTML = btn("v4te", "🧩", exp ? L("Put it together", "ركّب القطع") : L("Take it apart", "فكّك القطع"), "X", !!exp, nParts < 2 || bld)
      + btn("v4tb", "🧱", bld ? L("Building…", "جارٍ التركيب…") : L("Build it yourself", "ركّبها بنفسك"), "Y", bld, nParts < 3)
      + btn("v4tr", "🎬", L("Replay the moment", "أعد اللحظة"), "R")
      + btn("v4tc", "📏", cmp ? L("Hide the person", "أخفِ الإنسان") : L("Compare with a person", "قارن بحجم إنسان"), "Z", !!cmp);
    const on = (id, f) => { const e = $(id); if (e) e.onclick = f; };
    on("#v4te", explodeToggle); on("#v4tb", () => (B ? buildStop() : buildStart())); on("#v4tr", () => replayStart(ca)); on("#v4tc", compareToggle);
    $("#v4yrl").textContent = "🕰️ " + L("Then and now: drag through the years to 2050", "أمس واليوم: اسحب عبر السنين حتى 2050");
    $("#v4yrn").textContent = (ca.k == "moon" ? L("No wind on the Moon: dust settles very slowly, but harsh sunlight fades colours. ", "لا رياح على القمر: يستقر الغبار ببطء شديد، لكن أشعة الشمس القاسية تبهّت الألوان. ") : L("Mars dust storms coat everything in fine red dust. ", "عواصف المريخ تغطي كل شيء بغبار أحمر ناعم. ")) + L("Simulated estimate.", "تقدير محاكى.");
  }
  const om1 = openM;
  openM = function (a) { if (RP) RP.end(); B = null; buildDraw(); om1(a); toolsUpd(); const yr = $("#yr"); if (yr) yr.value = a.y0; timeFx(a, a.y0); };
  const cm1 = closeM;
  closeM = function () { B = null; buildDraw(); cm1(); };
  const al1 = applyLang;
  applyLang = function () { al1(); if (mo) { toolsUpd(); if (B) buildDraw($("#v4bm") ? $("#v4bm").textContent : ""); if (ca) timeFx(ca, +$("#yr").value || ca.y0); } };
  const go1 = go;
  go = function (s, id) { if (RP) RP.end(); go1(s, id); };
  Object.assign(I.en, { pi: "Press E to inspect, R to replay its moment" });
  Object.assign(I.ar, { pi: "اضغط E للفحص، وR لإعادة لحظتها" });
  // keys: in a machine window X / Y / R / Z, digits pick parts while building; near a machine R replays
  addEventListener("keydown", e => {
    if (typing(e) || gmo) return;
    const c = e.code;
    if (mo && !tko) {
      if (B && /^Digit[1-9]$/.test(c)) { const b = document.querySelectorAll("#v4build [data-k]")[+c[5] - 1]; if (b) { e.stopPropagation(); e.preventDefault(); b.click(); } return; }
      const map = { KeyX: "#v4te", KeyY: "#v4tb", KeyR: "#v4tr", KeyZ: "#v4tc" }[c];
      if (map && $(map)) { e.stopPropagation(); e.preventDefault(); $(map).click(); }
      return;
    }
    if (c == "KeyR" && !tko && !mo && $("#start").style.display == "none") {
      e.stopPropagation();
      if (st == 3) { const a = nearArt(9); if (a) replayStart(a); else tell(L("Walk up to a machine (within 9 metres) and press R to replay its moment.", "اقترب من آلة (خلال 9 أمتار) واضغط R لإعادة لحظتها.")); }
    }
  }, true);
  V4.replay = replayStart;
