  /* ===================== v6: smoother arrival, cockpit nav computer, landing feel, hatch walk, chat & toolbar look, Nova fixes, future lab =====================
     Inserted inside the v4 layer after v5 (uses its helpers). */

  /* ---------- 1. Warm-up: build every shader and upload every texture before the first trip ----------
     Measured: the first frame on Mars took ~2.9 s (15 shader programs + textures built on arrival). */
  let warmed = 0;
  function warm() {
    if (warmed || st == 3 || tr || mo) return;
    warmed = 1;
    const st0 = st, cur0 = cur, saved = { fog: scene.fog, env: scene.environment, bg: scene.background }, cull = [], rt = new THREE.WebGLRenderTarget(32, 32);
    rt.texture.encoding = rd.outputEncoding; // same colour output as the screen, or the shaders are built again on arrival
    try {
      for (const id of ["moon", "mars"]) {
        for (const k in W) { W[k].visible = k == id; W[k].userData.ship.visible = true; }
        space.visible = true; devil.visible = id == "mars"; sand.visible = id == "mars"; for (const f of flames) f.visible = true; beam.visible = true;
        scene.fog = new THREE.FogExp2(PL[id].fog, id == "moon" ? 0.0028 : 0.011); scene.environment = (V4.env && V4.env[id]) || null;
        scene.traverse(o => { if (o.frustumCulled) { o.frustumCulled = false; cull.push(o); } });
        rd.setRenderTarget(rt); rd.render(scene, camera);
      }
    } catch (e) { console.warn("warm-up:", e); }
    finally {
      rd.setRenderTarget(null); for (const o of cull) o.frustumCulled = true; rt.dispose();
      for (const f of flames) f.visible = false; beam.visible = false;
      scene.fog = saved.fog; scene.environment = saved.env; scene.background = saved.bg;
      go(st0, cur0);
    }
  }
  {
    const t0 = performance.now();
    const wait = () => {
      if (warmed) return;
      const ready = document.readyState == "complete" && ((FALCON && SUIT) || performance.now() - t0 > 12000);
      if (ready && st != 3 && !tr) (window.requestIdleCallback || setTimeout)(warm, { timeout: 1500 }); else setTimeout(wait, 600);
    };
    setTimeout(wait, 1500);
  }

  /* ---------- 2. Nova: no duplicate caption over the dialogue box ---------- */
  const toast0 = toast;
  toast = function (t) { if ($("#dlg").style.display == "flex" && String(t) === dTxt) return; toast0(t); };

  /* ---------- 3. Toolbar: one consistent set of line icons ---------- */
  const IC = {
    kb: '<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6 10h1M9.5 10h1M13 10h1M16.5 10h1M7 14h10"/>',
    tel: '<path d="M4 19V11M9.5 19V6M15 19v-6M20.5 19V9"/>',
    game: '<path d="M7 9h10a4 4 0 0 1 3.9 4.9l-.6 2.6a2 2 0 0 1-3.5.8L15 15H9l-1.8 2.3a2 2 0 0 1-3.5-.8l-.6-2.6A4 4 0 0 1 7 9z"/><path d="M8 11.5v3M6.5 13h3M15.5 12.5h.01M17.5 14h.01"/>',
    set: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M2.5 12h3M18.5 12h3M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
    fs: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    fsx: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
    snd: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
    mute: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
    tour: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/>'
  };
  const svg = k => '<svg class="v4i" viewBox="0 0 24 24" aria-hidden="true">' + IC[k] + "</svg>";
  function iconsUpd() {
    const set = (id, k) => { const e = $(id); if (e && e.dataset.ic !== k) { e.innerHTML = svg(k); e.dataset.ic = k; } };
    set("#v4kb", "kb"); set("#v4telb", "tel"); set("#bgm", "game"); set("#bset", "set"); set("#bab", "info"); set("#btour", "tour");
    set("#bfs", document.fullscreenElement ? "fsx" : "fs"); set("#bmu", MUTE ? "mute" : "snd");
  }
  iconsUpd();
  document.addEventListener("fullscreenchange", () => setTimeout(iconsUpd, 0));
  const mute0 = muteT; muteT = function () { mute0(); iconsUpd(); };

  /* ---------- 4. Chat: a mission-control look, with the real radio delay ---------- */
  function distKm(id) {
    const jd = Date.now() / 864e5 + 2440587.5, d = jd - 2451545;
    if (id == "moon") return 385001 - 20905 * Math.cos((134.963 + 13.06499 * d) * Math.PI / 180);
    const dl = ((100.46 + 0.985647 * d) - (355.45 + 0.524033 * d)) * Math.PI / 180; return 149597871 * Math.sqrt(3.3217 - 3.0474 * Math.cos(dl));
  }
  const delayTxt = id => { const s = distKm(id) / 299792.458; return s < 90 ? s.toFixed(1) + L(" s", " ثانية") : (s / 60).toFixed(1) + L(" min", " دقيقة"); };
  const chat0 = chat;
  chat = function (an) {
    chat0(an);
    const h = $("#ch > div"); if (!h || !ch) return;
    const s = document.createElement("small"); s.className = "v4sig"; s.innerHTML = '<i></i><i></i><i></i><i></i> ' + esc(L("Signal delay from Earth: ", "تأخر الإشارة من الأرض: ") + delayTxt(ch.a.k));
    h.appendChild(s);
  };

  /* ---------- 5. Cockpit navigation computer ---------- */
  const nav = document.createElement("section"); nav.id = "v4nav"; nav.setAttribute("aria-label", "Navigation computer"); document.body.appendChild(nav);
  let navMode = "home", navPick = null, navKey = "", navT = 0, trip = null;
  const PLN = { moon: ["Moon", "القمر", "🌕"], mars: ["Mars", "المريخ", "🔴"] };
  const REAL_TRIP = { moon: ["Apollo 15 really took about 4 days to reach the Moon.", "استغرقت أبولو 15 فعلياً نحو 4 أيام للوصول إلى القمر."], mars: ["Viking 1 really took about 11 months to land on Mars.", "استغرقت فايكنغ 1 فعلياً نحو 11 شهراً حتى هبطت على المريخ."] };
  const fmtKm = km => (km >= 1e6 ? (km / 1e6).toFixed(1) + L(" million km", " مليون كم") : Math.round(km).toLocaleString("en-US") + L(" km", " كم"));
  function navCard(id) {
    const n = PLN[id], g = id == "moon" ? "1.62" : "3.71", sel = navPick == id;
    return '<button class="v4dest' + (sel ? " on" : "") + '" data-d="' + id + '" aria-pressed="' + sel + '"><span class="v4orb ' + id + '"></span><span><b>' + L(n[0], n[1]) + "</b><small>" + fmtKm(distKm(id)) + L(" from Earth", " من الأرض") + "</small><small>" + L("Gravity ", "الجاذبية ") + g + L(" m/s²", " م/ث²") + "</small></span></button>";
  }
  function navRender() {
    const hide = st == 3 || mo || tko || gmo || $("#start").style.display != "none";
    nav.hidden = hide; if (hide) return;
    const key = [navMode, st, cur, LANG, tr ? 1 : 0, navPick, busy].join("|");
    if (key !== navKey) {
      navKey = key;
      const head = '<div class="v4nh"><span class="v4dot"></span>NAV · ' + L("Navigation computer", "حاسوب الملاحة") + "</div>";
      let body = "";
      if (tr) body = '<div class="v4ph" id="v4ph"></div><div class="v4bar"><i id="v4pb"></i></div><div class="v4g"><div><small>' + L("Speed", "السرعة") + '</small><b id="v4sp"></b></div><div><small id="v4dl"></small><b id="v4ds"></b></div></div><p class="v4note2" id="v4rt"></p>';
      else if (st == 1 && navMode == "home") body = "<p>" + L("Deep space. Where to?", "الفضاء العميق. إلى أين؟") + '</p><button class="key v4go" id="v4trip"><i></i>🚀 ' + L("Plan a trip", "خطّط رحلة") + "</button>";
      else if (st == 1) body = "<p>" + L("Choose a destination:", "اختر الوجهة:") + '</p><div class="v4dests">' + navCard("moon") + navCard("mars") + "</div>"
        + (navPick ? '<button class="key red v4go" id="v4eng"><i></i>' + L("Engage engines", "شغّل المحركات") + " → " + L(PLN[navPick][0], PLN[navPick][1]) + ' <span class="kb">[Enter]</span></button>' : "")
        + '<button class="chip" id="v4back">◀ ' + L("Back", "رجوع") + "</button>";
      else {
        const other = cur == "moon" ? "mars" : "moon";
        body = "<p>" + L("Landed on ", "هبطنا على ") + L(PLN[cur][0], PLN[cur][1]) + ". " + L("What next?", "ماذا بعد؟") + '</p><div class="v4acts">'
          + '<button class="key v4go" data-a="#bh"><i></i>🚪 ' + L("Open the hatch and step out", "افتح الباب وانزل") + ' <span class="kb">[H]</span></button>'
          + '<button class="key" data-a="#bl"><i></i>🛰️ ' + L("Launch back to space", "أقلع عائداً إلى الفضاء") + ' <span class="kb">[L]</span></button>'
          + '<button class="key" data-a="' + (other == "moon" ? "#bm" : "#bk") + '"><i></i>' + PLN[other][2] + " " + L("Fly to ", "سافر إلى ") + L(PLN[other][0], PLN[other][1]) + ' <span class="kb">[' + (other == "moon" ? 1 : 2) + "]</span></button></div>";
      }
      nav.innerHTML = head + body;
      const on = (s, f) => { const e = nav.querySelector(s); if (e) e.onclick = f; };
      on("#v4trip", () => { navMode = "pick"; navRender(); const b = nav.querySelector(".v4dest"); if (b) b.focus(); });
      on("#v4back", () => { navMode = "home"; navPick = null; navRender(); });
      on("#v4eng", engage);
      nav.querySelectorAll("[data-d]").forEach(b => b.onclick = () => { navPick = b.dataset.d; partSound("radio"); ann(L(PLN[navPick][0], PLN[navPick][1]) + ". " + fmtKm(distKm(navPick)) + L(" from Earth.", " من الأرض.")); navRender(); const e = $("#v4eng"); if (e) e.focus(); });
      nav.querySelectorAll("[data-a]").forEach(b => b.onclick = () => { const t = $(b.dataset.a); if (t && !t.disabled) { if (b.dataset.a == "#bl") { $("#gd").classList.add("up"); } t.click(); } });
    }
    if (tr) navLive();
  }
  function engage() { if (!navPick || busy) return; const id = navPick; navMode = "home"; navPick = null; $(id == "moon" ? "#bm" : "#bk").click(); }
  function navLive() {
    if (!trip) return;
    const e = t - tr.t0, ph = tr.ph, list = trip.phases, idx = Math.max(0, list.indexOf(ph)), D = { "-1": 2.4, "0": 3.8, "1": 4.6 }[ph], p = Math.min(1, e / D), all = (idx + p) / list.length;
    const id = trip.id, km = id ? distKm(id) : 0, mars = id == "mars";
    let phase, sp, lab, val;
    if (ph == -1) { phase = L("Launch", "الإقلاع"); sp = 7.8 * p * p; lab = L("Altitude", "الارتفاع"); val = Math.round(p * p * 200) + L(" km", " كم"); }
    else if (ph == 0) { phase = L("Cruise to ", "الرحلة إلى ") + L(PLN[id][0], PLN[id][1]); sp = mars ? 11.5 : 10.8; lab = L("Distance left", "المسافة المتبقية"); val = fmtKm(km * (1 - p)); }
    else { const q = 1 - Math.pow(1 - p, 3); phase = mars ? (p < 0.45 ? L("Atmospheric entry", "دخول الغلاف الجوي") : p < 0.8 ? L("Parachute", "المظلة") : L("Retro-rockets", "الصواريخ العكسية")) : L("Powered descent", "هبوط بالمحركات"); sp = mars ? 4.6 * Math.pow(1 - q, 1.6) : 1.7 * (1 - q); lab = L("Altitude", "الارتفاع"); val = ((1 - q) * (mars ? 125 : 15)).toFixed(1) + L(" km", " كم"); }
    const set = (s, v) => { const el = $(s); if (el && el.textContent !== v) el.textContent = v; };
    set("#v4ph", phase); set("#v4sp", sp.toFixed(2) + L(" km/s", " كم/ث")); set("#v4dl", lab); set("#v4ds", val);
    set("#v4rt", id ? L(...REAL_TRIP[id]) + " " + L("(simulated values)", "(قيم محاكاة)") : L("Going back to orbit.", "العودة إلى المدار."));
    const b = $("#v4pb"); if (b) b.style.width = (all * 100).toFixed(1) + "%";
  }
  const travel0 = travel;
  travel = function (id) {
    if (busy) return;
    if (!warmed) warm();
    trip = { id, phases: id ? (st == 2 ? [-1, 0, 1] : [0, 1]) : [-1], marks: {} };
    travel0(id); navKey = "";
  };
  addEventListener("keydown", e => {
    if (e.code == "Enter" && navPick && st == 1 && !tr && !mo && !tko && !gmo && !typing(e) && !nav.hidden) { e.preventDefault(); e.stopPropagation(); engage(); }
  }, true);

  /* ---------- 6. Landing feel: smooth on the airless Moon, rough Martian entry ---------- */
  function travelFeel() {
    if (!tr || tr.ph != 1) return;
    const p = Math.min(1, (t - tr.t0) / 4.6);
    if (cur == "moon") { camera.position.x = 0; rumble(0.08); }   // no air: a steady powered descent, no buffeting
    else if (!SET.safe && !SET.rm) {
      const a = Math.pow(1 - p, 1.4);
      camera.position.x += (R() - 0.5) * 0.3 * a; camera.position.y += (R() - 0.5) * 0.15 * a; camera.rotation.z = (R() - 0.5) * 0.045 * a;
      rumble(0.12 + 0.4 * a);
      if (trip && !trip.marks.chute && p > 0.45) { trip.marks.chute = 1; ckMsg(L("PARACHUTE DEPLOYED", "فُتحت المظلة")); thud(0, 400, 0.15); }
      if (trip && !trip.marks.retro && p > 0.8) { trip.marks.retro = 1; ckMsg(L("RETRO-ROCKETS", "الصواريخ العكسية")); }
    }
  }

  /* ---------- 7. Hatch: walk down the ramp, and walk back up ---------- */
  let HT = null;
  function hiss() {
    if (MUTE || !AC) return;
    try { const c = AC, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); s.buffer = noise(); f.type = "highpass"; f.frequency.value = 1800; g.gain.setValueAtTime(0.0001, c.currentTime); g.gain.linearRampToValueAtTime(SET.safe ? 0.03 : 0.07, c.currentTime + 0.1); g.gain.exponentialRampToValueAtTime(0.0005, c.currentTime + 1.1); s.connect(f); f.connect(g); g.connect(c.destination); s.start(c.currentTime, R(), 1.2); } catch (e) { console.warn(e); }
  }
  const RAMP = new V(0, 3.3, 2.8);
  function hatchOut() {
    if (busy || st != 2 || tr) return;
    if (RM()) { dkGo(() => { go(3); ann(Tx("hopen") + " " + HELP[2]); }); return; }
    busy = 1; hiss(); thud(0, 300, 0.1); ckMsg(L("HATCH OPEN", "الباب مفتوح")); go(3);
    HT = { t: 0, dur: 2.6, dir: 1, px, pz, yaw0: yaw, steps: 0 };
  }
  $("#bh").onclick = hatchOut;
  const act0 = act;
  act = function () {
    if (st == 3 && !busy && !mo && !tko && !HT && !RM() && !nearArt(6.2) && Math.hypot(px - KX, pz - KZ) >= 5.5 && Math.hypot(px, pz) < 6.2) {
      busy = 1; hiss(); HT = { t: 0, dur: 1.8, dir: -1, from: camera.position.clone(), px, pz, yaw0: yaw, pit0: pit, steps: 0 }; return;
    }
    act0();
  };
  pr.onclick = () => act();
  function hatchCam(dt) {
    if (!HT) return;
    if (HT.hold) { px = HT.px; pz = HT.pz; camera.position.copy(RAMP); camera.rotation.set(0.1, HT.yaw0, 0); return; } // stay at the door while the screen fades
    HT.t += dt; const k = ease(Math.min(1, HT.t / HT.dur)), moon = cur == "moon";
    px = HT.px; pz = HT.pz; // hold the walker still while the camera moves
    const ground = new V(HT.px, W[cur].userData.hf(HT.px, HT.pz) + 1.7, HT.pz);
    if (HT.dir > 0) { camera.position.lerpVectors(RAMP, ground, k); camera.rotation.set(-0.28 * (1 - k), HT.yaw0, 0); }
    else { camera.position.lerpVectors(HT.from, RAMP, k); camera.rotation.set(HT.pit0 * (1 - k) + 0.1 * k, HT.yaw0 + wr(Math.PI - HT.yaw0) * k * 0.0, 0); }
    // the Moon's low gravity: one slow floating hop; Mars: normal steps
    if (moon) camera.position.y += Math.sin(k * Math.PI) * 0.35;
    else { camera.position.y += Math.abs(Math.sin(k * Math.PI * 4)) * 0.06; }
    const step = Math.floor(k * (moon ? 2 : 4)); if (step > HT.steps) { HT.steps = step; thud(step % 2 ? 0.15 : -0.15, moon ? 260 : 1300, 0.05); }
    if (HT.t >= HT.dur) {
      if (HT.dir > 0) { HT = null; busy = 0; ann(Tx("hopen") + " " + HELP[2]); }
      else { HT.hold = 1; busy = 0; dkGo(() => { HT = null; go(2); ann(Tx("back") + " " + HELP[1]); }); }
    }
  }

  // run the camera tweaks before the cockpit is placed on the camera
  const ck6 = ckUpdate;
  ckUpdate = function (dt) {
    try { hatchCam(dt); travelFeel(); } catch (e) { console.warn(e); }
    ck6(dt);
    navT -= dt; if (navT <= 0) { navT = 0.1; try { navRender(); } catch (e) { console.warn(e); } }
  };
  const go6 = go;
  go = function (s, id) { go6(s, id); if (s != 1) { navMode = "home"; navPick = null; } navKey = ""; camera.rotation.z = 0; };

  /* ---------- 8. Benefits and future → a small lab ---------- */
  const RECY = {};
  let labSt = "e";
  future = function (a) {
    const L_ = FUT[a.shape] || [], ar = LANG == "ar", mn = a.k == "moon", PT = (PARTS[a.shape] || []).filter(q => q[5]);
    const TG = { f: ar ? "من مصادر ناسا" : "From NASA sources", k: ar ? "معلومة علمية من مصادر أخرى" : "Science fact from other sources", i: ar ? "فكرة للتخيّل، ليست خطة من ناسا" : "An idea to imagine, not a NASA plan" };
    const ST = [["e", "🌍", ar ? "الأرض اليوم" : "Earth today", ar ? "كيف تفيدنا هذه الآلة نحن على الأرض؟" : "How does this machine help us here on Earth?"],
      ["n", "🔭", ar ? "الحاضر" : "Now", ar ? "كيف تستفيد ناسا والعلماء منها اليوم؟" : "How do NASA and scientists use it today?"],
      ["u", "🚀", ar ? (mn ? "قاعدة القمر" : "قاعدة المريخ") : (mn ? "Moon base" : "Mars base"), mn ? (ar ? "لو قرّر البشر العيش على القمر، كيف تفيدهم؟" : "If people decide to live on the Moon, how would it help?") : (ar ? "لو قرّر البشر العيش على المريخ، كيف تفيدهم؟" : "If people decide to live on Mars, how would it help?")]];
    if (PT.length) ST.push(["r", "♻️", ar ? "ورشة التدوير" : "Recycling lab", ar ? "أرسل كل قطعة إلى جهاز التدوير وابنِ بها جزءاً من القاعدة. أفكار للتخيّل، ليست خطط ناسا." : "Send each part to the recycler and build part of the base. Ideas to imagine, not NASA plans."]);
    if (!ST.some(s => s[0] == labSt)) labSt = "e";
    const cur_ = ST.find(s => s[0] == labSt), count = k => (k == "r" ? PT.length : L_.filter(c => c[6] == k).length);
    let html = '<div class="lab"><div class="labh"><span class="labic">🧪</span><div><b>' + (ar ? "مختبر الفائدة والمستقبل" : "Benefits and future lab") + "</b><small>" + (ar ? "اختر محطة في المختبر" : "Pick a lab station") + '</small></div></div><div class="labst" role="tablist">'
      + ST.map(s => '<button role="tab" aria-selected="' + (s[0] == labSt) + '" class="labtab' + (s[0] == labSt ? " on" : "") + '" data-st="' + s[0] + '"><span>' + s[1] + "</span>" + esc(s[2]) + "<i>" + count(s[0]) + "</i></button>").join("") + "</div>"
      + '<p class="labq">' + esc(cur_[3]) + "</p>";
    if (labSt != "r") {
      html += '<div class="labcards">' + L_.map((c, i) => [c, i]).filter(x => x[0][6] == labSt).map(([c, i], j) => '<article class="labcard t' + c[5] + '" style="--i:' + j + '"><div class="laborb">' + c[0] + '</div><div><span class="ftag ' + c[5] + '">' + TG[c[5]] + "</span><h3>" + esc(ar ? c[2] : c[1]) + "</h3><p>" + esc(ar ? c[4] : c[3]) + '</p><div class="labact"><button class="chip" data-s="' + i + '">🔊 ' + (ar ? "استمع" : "Listen") + "</button>" + (c[7] ? '<a class="chip" href="' + c[7] + '" target="_blank" rel="noopener">🔗 ' + (ar ? "المصدر" : "Source") + "</a>" : "") + "</div></div></article>").join("") + "</div>";
    } else {
      const done = RECY[a.shape] || (RECY[a.shape] = new Set()), n = done.size, pc = Math.round(n / PT.length * 100);
      const stage = pc == 100 ? "🏠" : pc >= 60 ? "🏗️" : pc > 0 ? "🧱" : "📐";
      html += '<div class="labbase"><span class="labbic">' + stage + "</span><div><b>" + (ar ? (mn ? "وحدة في قاعدة القمر" : "وحدة في قاعدة المريخ") : (mn ? "A Moon base module" : "A Mars base module")) + " · " + pc + '%</b><div class="v4bp"><i style="width:' + pc + '%"></i></div><small>' + (ar ? "قطع أُعيد تدويرها: " : "Parts recycled: ") + n + " / " + PT.length + "</small></div></div>"
        + '<div class="crates">' + PT.map((q, i) => { const d = done.has(i); return '<button class="crate' + (d ? " done" : "") + '" data-p="' + i + '" aria-pressed="' + d + '"><span class="cric">' + (d ? "✅" : "📦") + "</span><b>" + esc(ar ? q[2] : q[1]) + "</b>" + (d ? "<span>" + esc(ar ? q[6] : q[5]) + "</span>" : "<small>" + (ar ? "♻️ أرسلها إلى جهاز التدوير" : "♻️ Send it to the recycler") + "</small>") + "</button>"; }).join("") + "</div>";
    }
    $("#fu").innerHTML = html + "</div>";
    $("#fu").querySelectorAll("[data-st]").forEach(b => b.onclick = () => { labSt = b.dataset.st; future(a); const t_ = $('#fu [data-st="' + labSt + '"]'); if (t_) t_.focus(); });
    $("#fu").querySelectorAll("[data-s]").forEach(b => b.onclick = () => { const c = L_[+b.dataset.s]; say(ar ? c[2] + ". " + c[4] : c[1] + ". " + c[3], vm); });
    $("#fu").querySelectorAll("[data-p]").forEach(b => b.onclick = () => {
      const i = +b.dataset.p, q = PT[i], done = RECY[a.shape];
      if (q[0]) hl(q[0]); else partSound("clank");
      const first = !done.has(i); done.add(i);
      say((ar ? q[2] + ". " + q[6] : q[1] + ". " + q[5]), vm);
      if (first) { beep(660, 0.08); setTimeout(() => beep(880, 0.1), 90); }
      future(a);
      if (first && done.size == PT.length) { [523, 659, 784, 1047].forEach((f, k) => setTimeout(() => beep(f, 0.14), 300 + k * 130)); ann(ar ? "اكتملت الوحدة! بنيتها كلها من قطع أُعيد تدويرها." : "Module complete! You built it all from recycled parts."); }
      const nb = $('#fu [data-p="' + i + '"]'); if (nb) nb.focus();
    });
  };
  if (mo && ca) future(ca);

  /* ---------- 9. Switching language inside a machine window: rebuild the left-side buttons too ---------- */
  const al6 = applyLang;
  applyLang = function () {
    al6();
    if (mo && ca) {
      tabs(); toolsUpd();
      $("#vw").dataset.h = L("Drag or arrow keys to rotate · wheel, pinch or +/− to zoom · double-click resets", "اسحب أو استخدم الأسهم للتدوير · العجلة أو القرص أو +/− للتكبير · نقرتان لإعادة الضبط");
    }
    navKey = "";
  };
