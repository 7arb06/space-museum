/* ===================== v4: polish layer =====================
   Loaded after the main script. Adds: richer terrain (rock fields, albedo patches),
   footprints, weather (Mars dust storms with wind sound, blowing sand, sky + fog),
   reflections, better audio guide for blind visitors (front/behind cues, footsteps,
   "blocked" bump, arrival chime), new keys (N auto-walk, C compass, / key sheet),
   focus trapping in dialogs, localized toolbar, telemetry toggle, progress, celebration.
   It wraps a few original functions (go, applyLang, openM, ckUpdate) instead of editing them. */
(() => {
  "use strict";
  const L = (en, ar) => (LANG == "ar" ? ar : en);
  const RM = () => RMV() || SET.safe;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const tri = (x, z, s) => Math.sin(x * 0.013 + s) * Math.cos(z * 0.011 - s) + 0.5 * Math.sin(x * 0.031 - z * 0.027 + s * 2) + 0.25 * Math.sin(x * 0.071 + z * 0.063);

  /* ---------- 1. Renderer: shadows sized to the quality setting (soft shadows cost too much on laptops) ---------- */
  rd.shadowMap.type = THREE.PCFShadowMap;
  const aq0 = applyQ;
  applyQ = function () {
    const s = SET.q >= 2 ? 2048 : 1024;
    if (sun.shadow.mapSize.x !== s) { sun.shadow.mapSize.set(s, s); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
    aq0();
  };
  applyQ();

  /* ---------- 1a. Fast ground height: read the terrain mesh itself instead of the slow height formula ----------
     (the formula costs ~15 µs per call; the blowing sand alone called it 380 times a frame) */
  const GH = {};
  for (const id of ["moon", "mars"]) {
    const gm = W[id].children.find(o => o.isMesh && o.geometry.type == "PlaneGeometry"), pa = gm.geometry.attributes.position, N = 301, S = 480 / 300;
    GH[id] = (x, z) => {
      const fx = clamp((x + 240) / S, 0, N - 1.001), fz = clamp((z + 240) / S, 0, N - 1.001), ix = fx | 0, iz = fz | 0, tx = fx - ix, tz = fz - iz;
      const h = (c, r) => pa.getY(r * N + c);
      return (h(ix, iz) * (1 - tx) + h(ix + 1, iz) * tx) * (1 - tz) + (h(ix, iz + 1) * (1 - tx) + h(ix + 1, iz + 1) * tx) * tz;
    };
  }

  /* ---------- 1b. Cockpit buttons: the caps were glossy, so the cabin lamps washed them out white ---------- */
  for (const b of BT) {
    Object.assign(b.cap.material, { roughness: 0.9, metalness: 0, envMapIntensity: 0 }); b.cap.material.userData.v4e = 1;
    if (b.cover) { const c = b.cover.children[0].material; Object.assign(c, { opacity: 0.32, roughness: 0.15, metalness: 0, envMapIntensity: 0.4 }); c.userData.v4e = 1; }
  }

  /* ---------- 2. Terrain: albedo patches + instanced rock fields ---------- */
  function rockGeo(seed, detail = 1) {
    const g = new THREE.IcosahedronGeometry(1, detail), p = g.attributes.position, v = new V();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const n = 0.78 + 0.22 * Math.sin(v.x * 4.1 + seed) * Math.cos(v.y * 3.3 - seed) + 0.12 * Math.sin(v.z * 7.7 + v.x * 2.3 + seed);
      v.multiplyScalar(n); v.y *= 0.7; p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return g;
  }
  function freeSpot(id, x, z, pad) {
    if (Math.hypot(x, z) < 7.5 + pad) return false;
    if (Math.hypot(x - KX, z - KZ) < 5 + pad) return false;
    for (const a of ART[id]) {
      if (Math.hypot(x - a.x, z - a.z) < (PR[a.shape] || 4) * (a.sc ? Math.min(a.sc, 1.3) : 1) + 2 + pad) return false;
      if (Math.hypot(x - a.x, z - (a.z - (PD[a.shape] || 4.5))) < 1.6 + pad) return false;
    }
    return true;
  }
  const V4 = { pebbles: [], env: {}, rings: [], frame: [] };
  // finer ground detail close to the camera (the old 10x repeat looked blurry and blocky up close)
  for (const [k, n, b] of [["moonGround", 22, 0.35], ["marsGround", 16, 0.4]]) {
    const m = mt[k]; for (const tk of [m.map, m.bumpMap]) if (tk && tk.repeat) tk.repeat.set(n, n);
    m.bumpScale = b; m.needsUpdate = true;
  }
  for (const id of ["moon", "mars"]) {
    const w = W[id], hf = GH[id], rockC = new THREE.Color(PL[id].rock).convertSRGBToLinear();
    // albedo variation baked into vertex colours (Moon: darker maria; Mars: basalt and bright dust)
    const ground = w.children.find(o => o.isMesh && o.geometry.type == "PlaneGeometry");
    if (ground) {
      const g = ground.geometry, p = g.attributes.position, col = new Float32Array(p.count * 3), s = id == "moon" ? 1.7 : 4.2;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), z = p.getZ(i), n = clamp(0.5 + 0.45 * tri(x, z, s), 0, 1), f = THREE.MathUtils.smoothstep(n, 0.35, 0.75);
        let r, gg, b;
        if (id == "moon") { const k = 0.82 + 0.26 * f; r = gg = b = k; }
        else { r = 0.8 + 0.3 * f; gg = 0.76 + 0.3 * f; b = 0.74 + 0.28 * f; }
        col[i * 3] = r; col[i * 3 + 1] = gg; col[i * 3 + 2] = b;
      }
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      ground.material.vertexColors = true; ground.material.needsUpdate = true;
    }
    // medium rocks (cast shadows, you bump into them) and many small pebbles
    const mat = new THREE.MeshStandardMaterial({ color: rockC, roughness: 0.95, metalness: 0, flatShading: true });
    const dummy = new THREE.Object3D();
    const place = (geo, count, rMin, rMax, sMin, sMax, collide) => {
      const im = new THREE.InstancedMesh(geo, mat, count);
      let n = 0;
      for (let tries = 0; n < count && tries < count * 8; tries++) {
        const a = R() * TAU, rr = rMin + Math.sqrt(R()) * (rMax - rMin), x = Math.cos(a) * rr, z = Math.sin(a) * rr, s = sMin + R() * R() * (sMax - sMin);
        if (!freeSpot(id, x, z, s)) continue;
        dummy.position.set(x, hf(x, z) - s * 0.18, z);
        dummy.rotation.set(R() * 0.6, R() * TAU, R() * 0.6);
        dummy.scale.set(s, s * (0.55 + R() * 0.4), s * (0.8 + R() * 0.4));
        dummy.updateMatrix(); im.setMatrixAt(n++, dummy.matrix);
        if (collide && s > 0.5 && rr < 100) COL[id].push({ x, z, r: s * 0.85 });
      }
      im.count = n; im.instanceMatrix.needsUpdate = true;
      w.add(im);
      return im;
    };
    const big = place(rockGeo(id == "moon" ? 1 : 3), 140, 12, 115, 0.35, 1.6, true);
    big.castShadow = big.receiveShadow = true;
    const peb = place(rockGeo(id == "moon" ? 5 : 7, 0), 1600, 6, 70, 0.04, 0.2, false);
    peb.receiveShadow = true;
    V4.pebbles.push(peb);
  }

  /* ---------- 3. Footprints (the old FP pool was never used): permanent on the Moon, fading on Mars ---------- */
  const fpTex = (() => {
    const c = document.createElement("canvas"); c.width = 64; c.height = 128; const x = c.getContext("2d");
    x.fillStyle = "#fff";
    x.beginPath(); x.ellipse(32, 40, 22, 34, 0, 0, TAU); x.fill();
    x.beginPath(); x.ellipse(32, 100, 17, 22, 0, 0, TAU); x.fill();
    x.globalCompositeOperation = "destination-out";
    for (let y = 12; y < 124; y += 9) { x.fillRect(8, y, 48, 3); }
    const t_ = new THREE.CanvasTexture(c); return t_;
  })();
  const fpGeo = new THREE.PlaneGeometry(0.15, 0.32).rotateX(-Math.PI / 2);
  for (const m of FP) {
    m.geometry = fpGeo; m.scale.set(1, 1, 1);
    m.material = new THREE.MeshBasicMaterial({ map: fpTex, color: 0x1d1d20, transparent: true, opacity: 0.45, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
  }
  let fpN = 0, fpSide = 1, fpLast = null, fpDist = 0;

  /* ---------- 4. Sky: Martian blue sunset halo, dust-storm tint ---------- */
  for (const id of ["moon", "mars"]) {
    const sk = W[id].userData.sk, o = sk.material.uniforms;
    sk.material = new THREE.ShaderMaterial({
      side: 1, depthWrite: false, fog: false,
      uniforms: { a: o.a, b: o.b, z: o.z, s: o.s, st: { value: 0 }, mr: { value: id == "mars" ? 1 : 0 } },
      vertexShader: "varying vec3 d;void main(){d=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
      fragmentShader: "uniform vec3 a,b,z,s;uniform float st,mr;varying vec3 d;void main(){float h=max(d.y,0.);vec3 c=mix(a,b,smoothstep(0.,.35,h));c=mix(c,z,smoothstep(.3,1.,h));vec3 sn=normalize(s);float g=max(dot(d,sn),0.);float low=1.-smoothstep(0.,.45,sn.y);c+=vec3(1.,.75,.5)*(pow(g,8.)*.35+pow(g,120.)*.9)*mr*(1.-st*.75);c+=vec3(.32,.52,.92)*pow(g,12.)*.6*mr*(.35+.65*low)*(1.-st);c=mix(c,a*1.05,exp(-h*18.)*.5);c=mix(c,vec3(.58,.40,.27)*(.6+.4*h),st*.8*mr);gl_FragColor=vec4(c,1.);}"
    });
  }

  /* ---------- 5. Reflections: a soft environment map per place ---------- */
  try {
    const pm = new THREE.PMREMGenerator(rd); pm.compileEquirectangularShader();
    const make = (top, hor, gnd) => {
      const c = document.createElement("canvas"); c.width = 256; c.height = 128; const x = c.getContext("2d"), g = x.createLinearGradient(0, 0, 0, 128);
      g.addColorStop(0, top); g.addColorStop(0.48, hor); g.addColorStop(0.52, gnd); g.addColorStop(1, gnd);
      x.fillStyle = g; x.fillRect(0, 0, 256, 128);
      const sg = x.createRadialGradient(70, 40, 0, 70, 40, 26); sg.addColorStop(0, "#fff"); sg.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = sg; x.fillRect(0, 0, 256, 128);
      const t_ = new THREE.CanvasTexture(c); t_.mapping = THREE.EquirectangularReflectionMapping; t_.encoding = THREE.sRGBEncoding;
      const r = pm.fromEquirectangular(t_).texture; t_.dispose(); return r;
    };
    V4.env = { moon: make("#000000", "#2a2a2e", "#5f5f63"), mars: make("#6f5a5c", "#d1a27a", "#8a4a2e"), space: make("#02030a", "#0a1020", "#05070d") };
    pm.dispose();
  } catch (e) { console.warn("Environment map skipped:", e); }
  const tuneEnv = () => {
    scene.traverse(o => {
      if (!o.isMesh) return;
      for (const m of [].concat(o.material)) {
        if (!m || m.userData.v4e || !m.isMeshStandardMaterial) continue;
        m.userData.v4e = 1;
        m.envMapIntensity = m.envMapIntensity === 0 ? 0 : m.metalness > 0.25 ? 0.7 : 0.3;
      }
    });
  };

  /* ---------- 6. Weather: storm level, blowing sand, haze, wind sound ---------- */
  const SAND = 380, sp_ = new Float32Array(SAND * 6), sandG = new THREE.BufferGeometry();
  for (let i = 0; i < SAND; i++) { const x = (R() - 0.5) * 50, y = R() * 3, z = (R() - 0.5) * 50; sp_.set([x, y, z, x + 0.4, y, z], i * 6); }
  sandG.setAttribute("position", new THREE.BufferAttribute(sp_, 3));
  const sand = new THREE.LineSegments(sandG, new THREE.LineBasicMaterial({ color: 0xe0b48a, transparent: true, opacity: 0, depthWrite: false }));
  sand.frustumCulled = false; scene.add(sand);
  /* ---------- 6b. Dust devil: a real swirling column (replaces the ring of spinning dots) ----------
     Two nested open funnels with a shader: dust rises and spins faster near the ground, the walls look
     denser at the edges (you look through more dust there), it is lit from the sun side and fades into the haze. */
  // seamless 3D value noise (2D noise around a circle leaves a seam, and growing inputs band up)
  const NOISE_GLSL = "float hs(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}float ns(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);return mix(mix(mix(hs(i),hs(i+vec3(1,0,0)),f.x),mix(hs(i+vec3(0,1,0)),hs(i+vec3(1,1,0)),f.x),f.y),mix(mix(hs(i+vec3(0,0,1)),hs(i+vec3(1,0,1)),f.x),mix(hs(i+vec3(0,1,1)),hs(i+vec3(1,1,1)),f.x),f.y),f.z);}float fbm(vec3 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*ns(p);p=p*2.03+vec3(1.7,9.2,3.1);a*=.5;}return v;}";
  const devU = { t: { value: 0 }, sun: { value: new V(1, 0.4, 0) }, fogc: { value: new THREE.Color(PL.mars.fog) }, fd: { value: 0.011 }, op: { value: 1 } };
  const funnel = (seed, den, R0, R1, H) => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: Object.assign({ sd: { value: seed }, den: { value: den }, R0: { value: R0 }, R1: { value: R1 }, H: { value: H } }, devU),
    vertexShader: "uniform float t,sd,R0,R1,H;varying float vh,ang;varying vec3 wp,nr;void main(){float h=position.y;vh=h;float a=atan(position.z,position.x);ang=a;float r=mix(R0,R1,pow(h,1.7))*(1.+.08*sin(a*3.+t*2.+h*9.));vec3 p=vec3(cos(a)*r,h*H,sin(a)*r);p.x+=sin(h*3.1+t*.6+sd)*h*h*5.+sin(t*1.1+sd)*h*1.6;p.z+=cos(h*2.4+t*.45+sd*2.)*h*h*3.5;nr=vec3(cos(a),0.,sin(a));vec4 w=modelMatrix*vec4(p,1.);wp=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}",
    fragmentShader: "uniform float t,sd,den,op,fd;uniform vec3 sun,fogc;varying float vh,ang;varying vec3 wp,nr;" + NOISE_GLSL + "void main(){float tt=mod(t,300.);float a2=ang-tt*(2.4-vh*1.4)+vh*2.5;vec3 P=vec3(cos(a2)*1.8,sin(a2)*1.8,vh*4.5-tt*.9+sd);float n=fbm(P),n2=fbm(P*2.2+4.);float d=smoothstep(.3,.72,n*.8+n2*.35);vec3 Vd=cameraPosition-wp;vec2 vv=normalize(Vd.xz);float rim=1.-abs(dot(nr.xz,vv));float a=d*den*(.3+pow(rim,1.4));a*=smoothstep(0.,.05,vh)*(1.-smoothstep(.5,1.,vh));a*=1.+(1.-smoothstep(0.,.18,vh))*1.3;float lit=.6+.5*max(dot(nr.xz,normalize(sun.xz)),0.);vec3 c=vec3(.80,.60,.44)*lit*(.82+.35*n2);float dist=length(Vd);float f=1.-exp(-fd*fd*dist*dist);c=mix(c,fogc,f*.85);gl_FragColor=vec4(c,clamp(a*op*(1.-f*.5),0.,.9));}"
  });
  const devil = new THREE.Group();
  {
    const g = new THREE.CylinderGeometry(1, 1, 1, 48, 36, true); g.translate(0, 0.5, 0);
    devil.add(new THREE.Mesh(g, funnel(1.3, 1.05, 2, 13, 46)), new THREE.Mesh(g, funnel(5.1, 0.85, 1.1, 8, 40)));
    const sk = new THREE.Mesh(new THREE.CircleGeometry(1, 48, 0, TAU).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: devU,
      vertexShader: "varying vec2 q;varying vec3 wp;void main(){q=position.xz;vec4 w=modelMatrix*vec4(position,1.);wp=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}",
      fragmentShader: "uniform float t,op,fd;uniform vec3 fogc;varying vec2 q;varying vec3 wp;" + NOISE_GLSL + "void main(){float r=length(q),tt=mod(t,300.),a=atan(q.y,q.x)-tt*1.6+r*2.;float n=fbm(vec3(cos(a)*r*3.,sin(a)*r*3.,tt*.4));float al=(1.-smoothstep(.15,1.,r))*smoothstep(.3,.75,n)*.55;float dist=length(cameraPosition-wp);float f=1.-exp(-fd*fd*dist*dist);gl_FragColor=vec4(mix(vec3(.78,.58,.42),fogc,f*.85),al*op*(1.-f*.5));}"
    }));
    sk.scale.setScalar(12); sk.position.y = 0.3; devil.add(sk);
    for (const m of devil.children) { m.frustumCulled = false; m.renderOrder = 3; }
  }
  devil.visible = false; scene.add(devil);
  DD.material.visible = false; // retire the old ring of dots
  let devPh = R() * 100;

  const haze = document.createElement("div"); haze.id = "v4haze"; document.body.appendChild(haze);
  let stK = 0, wxPrev = -1;
  const fogBase = new THREE.Color(PL.mars.fog), fogStorm = new THREE.Color(0x8e623f);

  // audio helpers (share the main AudioContext)
  let noiseBuf = null, windG = null, windF = null;
  const noise = () => {
    const c = au();
    if (!noiseBuf) { noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = R() * 2 - 1; }
    return noiseBuf;
  };
  function windAudio(level) {
    if (!AC) return;
    try {
      if (!windG) {
        const c = AC, s = c.createBufferSource(); s.buffer = noise(); s.loop = true;
        windF = c.createBiquadFilter(); windF.type = "bandpass"; windF.Q.value = 0.8; windF.frequency.value = 500;
        windG = c.createGain(); windG.gain.value = 0;
        s.connect(windF); windF.connect(windG); windG.connect(c.destination); s.start();
      }
      const c = AC;
      windG.gain.setTargetAtTime(MUTE ? 0 : level, c.currentTime, 0.4);
      windF.frequency.setTargetAtTime(380 + wind * 45 + Math.sin(t * 0.7) * 120, c.currentTime, 0.5);
    } catch (e) { console.warn(e); }
  }
  function thud(pan, bright, vol) {
    if (MUTE || !AC) return;
    try {
      const c = AC, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), p = c.createStereoPanner ? c.createStereoPanner() : null;
      s.buffer = noise(); f.type = "lowpass"; f.frequency.value = bright;
      g.gain.setValueAtTime(vol, c.currentTime); g.gain.exponentialRampToValueAtTime(0.0008, c.currentTime + 0.13);
      s.connect(f); f.connect(g);
      if (p) { p.pan.value = pan; g.connect(p); p.connect(c.destination); } else g.connect(c.destination);
      s.start(c.currentTime, R() * 1.5, 0.15);
    } catch (e) { console.warn(e); }
  }
  // a guide ping that tells front from behind: behind = lower, muffled double blip
  function gping(freq, pan, behind, centred) {
    if (MUTE || !AC) return;
    try {
      const c = AC, T = c.currentTime;
      const blip = (f, at, v) => {
        const o = c.createOscillator(), fl = c.createBiquadFilter(), g = c.createGain(), p = c.createStereoPanner ? c.createStereoPanner() : null;
        o.type = centred ? "triangle" : "sine"; o.frequency.value = f;
        fl.type = "lowpass"; fl.frequency.value = behind ? 650 : 6000;
        g.gain.setValueAtTime(0.0001, T + at); g.gain.linearRampToValueAtTime(v, T + at + 0.01); g.gain.exponentialRampToValueAtTime(0.0008, T + at + 0.11);
        o.connect(fl); fl.connect(g);
        if (p) { p.pan.value = pan; g.connect(p); p.connect(c.destination); } else g.connect(c.destination);
        o.start(T + at); o.stop(T + at + 0.13);
      };
      const v = SET.safe ? 0.08 : 0.15;
      if (behind) { blip(freq * 0.6, 0, v); blip(freq * 0.5, 0.12, v); }
      else { blip(freq, 0, v); if (centred) blip(freq * 1.5, 0.07, v * 0.6); }
    } catch (e) { console.warn(e); }
  }

  /* ---------- 7. Toolbar: status chips, help and telemetry buttons, polite live region ---------- */
  const live2 = document.createElement("div"); live2.className = "sr"; live2.setAttribute("aria-live", "polite"); document.body.appendChild(live2);
  const bar = $("#top .row");
  bar.insertAdjacentHTML("afterbegin", '<button class="b" id="v4kb" aria-keyshortcuts="/">⌨️</button><button class="b" id="v4telb" aria-pressed="true">📊</button>');
  $("#tp").insertAdjacentHTML("afterend", '<span id="v4st"><button class="chip" id="v4wx"></button><span class="chip" id="v4pg" role="status"></span></span>');
  $("#v4kb").onclick = () => keySheet();
  const telSet = on => { $("#tel").classList.toggle("v4min", !on); $("#v4telb").setAttribute("aria-pressed", on ? "true" : "false"); try { localStorage.setItem("smtel", on ? "1" : "0"); } catch (e) {} };
  { let s = null; try { s = localStorage.getItem("smtel"); } catch (e) {} telSet(innerWidth < 620 ? false : s ? s == "1" : innerWidth > 900); }
  $("#v4telb").onclick = () => telSet($("#tel").classList.contains("v4min"));
  $("#tel").addEventListener("click", e => { if (e.target.closest(".th")) telSet($("#tel").classList.contains("v4min")); });
  const WXI = ["☀️", "🌫️", "🌪️"];
  function wxLabel() {
    if (st < 2) return "";
    if (cur == "moon") return "🌑 " + L("Vacuum: no weather", "فراغ: لا طقس");
    return WXI[WX.s] + " " + WX.nm() + " · " + Math.round(wind) + L(" m/s", " م/ث");
  }
  $("#v4wx").onclick = () => {
    if (cur == "mars" && st > 1) {
      WX.s = (WX.s + 1) % (SET.safe ? 2 : 3); WX.t = 60;
      const m = L("Weather set to: ", "تم ضبط الطقس: ") + WX.nm(); toast(m); live2.textContent = m;
    } else toast(L("The Moon has no air, so it has no wind, clouds or storms.", "لا هواء على القمر، فلا رياح ولا غيوم ولا عواصف."));
  };
  function v4lang() {
    const T_ = {
      "#bgm": ["Games", "الألعاب"], "#bset": ["Settings", "الإعدادات"], "#bab": ["About the project", "عن المشروع"], "#bfs": ["Full screen", "ملء الشاشة"],
      "#bmu": ["Sound on or off (M)", "تشغيل أو كتم الصوت (M)"], "#btour": ["Guided tour", "جولة مرشدة"], "#lg": ["Switch language", "تبديل اللغة"],
      "#v4kb": ["Keyboard shortcuts (/)", "اختصارات لوحة المفاتيح (/)"], "#v4telb": ["Show or hide the live data panel", "إظهار أو إخفاء لوحة البيانات"],
      "#v4wx": ["Weather: click to change it on Mars", "الطقس: اضغط لتغييره على المريخ"]
    };
    for (const k in T_) { const e = $(k); if (e) { e.title = L(...T_[k]); e.setAttribute("aria-label", L(...T_[k])); } }
    $("#md").setAttribute("aria-labelledby", "mn"); $("#ov").setAttribute("aria-labelledby", "ovt"); $("#gm").setAttribute("aria-labelledby", "gmt");
    $("#dash").setAttribute("aria-label", L("Cockpit controls", "أزرار القمرة"));
    Object.assign(I.en, { h2: I.en.h2.replace(/ N auto-walks.*$/, "") + " N auto-walks to the next machine you have not seen, C tells you where you are facing and what is around you, and / shows all keys." });
    Object.assign(I.ar, { h2: I.ar.h2.replace(/ N يمشي.*$/, "") + " N يمشي بك تلقائياً إلى الآلة التالية التي لم تزرها، وC يخبرك باتجاهك وبما حولك، و/ يعرض كل المفاتيح." });
    statusUpd(1);
  }
  let stCache = "";
  function statusUpd(force) {
    const seen = ALL.filter(z => z.seen).length, w = wxLabel(), k = st + "|" + w + "|" + seen + "|" + LANG;
    if (k === stCache && !force) return; stCache = k;
    const wx = $("#v4wx"), pg = $("#v4pg");
    wx.style.display = st > 1 ? "" : "none"; wx.textContent = w;
    pg.textContent = "✅ " + seen + "/" + ALL.length; pg.title = L("Machines inspected", "الآلات التي فحصتها");
    pg.setAttribute("aria-label", L("Machines inspected: ", "الآلات التي فحصتها: ") + seen + L(" of ", " من ") + ALL.length);
  }

  /* ---------- 8. Keyboard: N auto-walk, C compass, / key sheet, Tab focus trap ---------- */
  let aw = null;
  function nextTarget() {
    const here = ART[cur].filter(a => !a.seen).sort((a, b) => Math.hypot(a.x - px, a.z - pz) - Math.hypot(b.x - px, b.z - pz));
    if (here[0]) return { x: here[0].x, z: here[0].z, a: here[0], stop: 6, name: nm(here[0]) };
    return { x: KX, z: KZ, stop: 4, name: Tx("kiosk"), k: 1 };
  }
  function tell(m) { $("#live").textContent = m; toast(m); if (guide) say(m, "blind"); }
  function autoWalk() {
    if (st != 3) { tell(L("Open the hatch first: land on a planet and press H.", "افتح الباب أولاً: اهبط على كوكب واضغط H.")); return; }
    aw = nextTarget(); tourStop();
    tell(L("Walking to ", "أمشي بك إلى ") + aw.name + L(". Press a movement key or Escape to stop.", ". اضغط مفتاح حركة أو Escape للإيقاف."));
  }
  const DIRS = { en: ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"], ar: ["الشمال", "الشمال الشرقي", "الشرق", "الجنوب الشرقي", "الجنوب", "الجنوب الغربي", "الغرب", "الشمال الغربي"] };
  function sideWord(an) { const a = Math.abs(an); return a < 0.35 ? L("ahead", "أمامك") : a > 2.4 ? L("behind you", "خلفك") : an > 0 ? (a < 1.2 ? L("ahead on your right", "أمامك يميناً") : a < 2 ? L("on your right", "على يمينك") : L("behind on your right", "خلفك يميناً")) : (a < 1.2 ? L("ahead on your left", "أمامك يساراً") : a < 2 ? L("on your left", "على يسارك") : L("behind on your left", "خلفك يساراً")); }
  function compass() {
    if (st < 2) { tell(L("You are in deep space. Press 1 for the Moon or 2 for Mars.", "أنت في الفضاء العميق. اضغط 1 للقمر أو 2 للمريخ.")); return; }
    const y = st == 2 ? Math.PI : yaw, b = Math.atan2(-Math.sin(y), Math.cos(y)), i = ((Math.round(b / (Math.PI / 4)) % 8) + 8) % 8;
    const items = ART[cur].map(a => ({ n: nm(a) + (a.seen ? L(" (seen)", " (زرتها)") : ""), x: a.x, z: a.z })).concat([{ n: Tx("kiosk"), x: KX, z: KZ }, { n: L("your spaceship", "مركبتك"), x: 0, z: 0 }]);
    const parts = items.map(o => ({ o, r: rel(o) })).sort((p, q) => p.r.d - q.r.d).map(p => p.o.n + ": " + Math.round(p.r.d) + " " + Tx("m") + " " + sideWord(p.r.an));
    tell(L("You are facing ", "أنت تتجه نحو ") + DIRS[LANG][i] + ". " + parts.join(L(". ", ". ")) + ".");
  }
  function keySheet() {
    const rows = [
      ["W A S D / ↑ ↓ ← →", L("Walk", "المشي")], ["Shift", L("Run", "الركض")], [L("Mouse / drag", "الفأرة / السحب"), L("Look around (Esc frees the mouse)", "النظر حولك (Esc يحرر الفأرة)")],
      ["Space / J", L("Jump (real Moon and Mars gravity)", "القفز (جاذبية القمر والمريخ الحقيقية)")], ["E", L("Inspect a machine, talk to Nova, enter the ship", "افحص آلة، كلّم نوفا، ادخل المركبة")],
      ["F", L("Describe the nearest machine", "صف أقرب آلة")], ["N", L("Auto-walk to the next machine you have not seen", "امشِ تلقائياً إلى الآلة التالية التي لم تزرها")],
      ["C", L("Compass: where you face and what is around", "البوصلة: اتجاهك وما حولك")], ["T", L("Read the live data", "اقرأ البيانات الحية")],
      ["B", L("Audio guide with direction pings on or off", "الدليل الصوتي بنبضات الاتجاه")], ["M", L("Sound on or off", "تشغيل أو كتم الصوت")], ["P", L("Pause or continue speech", "إيقاف الكلام مؤقتاً أو متابعته")],
      ["1 / 2", L("Cockpit: travel to the Moon / Mars", "القمرة: السفر إلى القمر / المريخ")], ["L / H", L("Cockpit: launch / open the hatch", "القمرة: الإقلاع / فتح الباب")],
      ["R", L("Near a machine: replay its famous moment", "قرب آلة: أعد لحظتها الشهيرة")],
      ["X / Y / Z", L("In a machine window: take it apart / build it / compare with a person", "في نافذة الآلة: فكّكها / ركّبها / قارنها بإنسان")],
      ["1–9", L("In a machine window: pick a question (or a part while building)", "في نافذة الآلة: اختر سؤالاً (أو قطعة أثناء التركيب)")], ["A / D", L("In a machine window: normal voice / audio description", "في نافذة الآلة: صوت عادي / وصف صوتي")],
      ["Tab", L("Move between buttons (stays inside open windows)", "التنقل بين الأزرار (يبقى داخل النافذة المفتوحة)")], ["Esc", L("Close any window or free the mouse (hold it to leave full screen)", "إغلاق أي نافذة أو تحرير الماوس (اضغطه مطوّلاً للخروج من ملء الشاشة)")], ["/", L("This list", "هذه القائمة")]
    ];
    openOv(L("Keyboard shortcuts", "اختصارات لوحة المفاتيح"), '<p class="v4note">' + L("Everything in the museum works with the keyboard alone.", "كل شيء في المتحف يعمل بلوحة المفاتيح وحدها.") + '</p><ul class="gk v4keys">' + rows.map(r => "<li><kbd>" + esc(r[0]) + "</kbd><span>" + esc(r[1]) + "</span></li>").join("") + "</ul>");
    if (guide) say(HELP[st - 1], "blind");
  }
  const typing = e => { const t_ = e.target; return t_ && (t_.tagName == "INPUT" && t_.type != "range" || t_.tagName == "TEXTAREA" || t_.tagName == "SELECT"); };
  const DLGS = ["#gm", "#ov", "#tk", "#md", "#dlg", "#start"];
  const openDialog = () => { for (const s of DLGS) { const e = $(s); if (e && getComputedStyle(e).display != "none") return e; } return null; };
  const focusables = el => [...el.querySelectorAll('button,[href],input,select,textarea,canvas[tabindex],[tabindex]:not([tabindex="-1"])')].filter(n => !n.disabled && n.offsetParent !== null);
  addEventListener("keydown", e => {
    if (e.code == "Tab") {
      const d = openDialog(); if (!d) return; const f = focusables(d); if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && (i <= 0)) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && (i == -1 || i == f.length - 1)) { e.preventDefault(); f[0].focus(); }
      return;
    }
    if (typing(e) || $("#start").style.display != "none" || gmo || mo || tko) return;
    if (e.code == "Slash") { e.stopPropagation(); e.preventDefault(); keySheet(); }
    else if (e.code == "KeyN") { e.stopPropagation(); autoWalk(); }
    else if (e.code == "KeyC") { e.stopPropagation(); compass(); }
    else if (aw && (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Escape"].includes(e.code))) { aw = null; }
  }, true);
  // give focus back to whatever opened a window once it closes
  let lastOut = null;
  const remember = el => { if (el && el.closest && el !== document.body && !DLGS.some(s => el.closest(s))) lastOut = el; };
  document.addEventListener("focusin", e => remember(e.target));
  document.addEventListener("click", e => remember(e.target.closest && e.target.closest("button,a,[tabindex]")), true);
  const mo_ = new MutationObserver(() => {
    const a = document.activeElement;
    if ((!a || a == document.body || a.offsetParent === null) && !openDialog() && lastOut && lastOut.isConnected && lastOut.offsetParent !== null) lastOut.focus({ preventScroll: true });
  });
  for (const s of DLGS) { const e = $(s); if (e) mo_.observe(e, { attributes: true, attributeFilter: ["style"] }); }

  /* ---------- 9. Celebration when every machine is inspected ---------- */
  let party = 0;
  function celebrate() {
    if (party) return; party = 1;
    beep(523, 0.15); setTimeout(() => beep(659, 0.15), 150); setTimeout(() => beep(784, 0.15), 300); setTimeout(() => beep(1047, 0.35), 450);
    if (RM()) return;
    const box = document.createElement("div"); box.id = "v4party"; box.setAttribute("aria-hidden", "true");
    const C = ["#f2c46d", "#7fd1ff", "#38ff8a", "#ff9d3c", "#ffffff"];
    for (let i = 0; i < 90; i++) { const s = document.createElement("i"); s.style.cssText = "left:" + R() * 100 + "%;background:" + C[i % 5] + ";animation-delay:" + R() * 0.6 + "s;animation-duration:" + (2 + R() * 1.6) + "s;transform:rotate(" + R() * 360 + "deg)"; box.appendChild(s); }
    document.body.appendChild(box); setTimeout(() => box.remove(), 4500);
  }

  /* ---------- 9b. Materials: real-looking gold foil, bare metal and paint instead of flat glowing plastic ---------- */
  const lumOf = c => c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
  function upMat(root) {
    root.traverse(o => {
      if (!o.isMesh) return;
      for (const m of [].concat(o.material)) {
        if (!m || !m.isMeshStandardMaterial || m.userData.v4m) continue;
        m.userData.v4m = m.userData.v4e = 1;
        const c = m.color, lum = lumOf(c), sat = Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
        let me, ro, em;
        if (m.map === FOIL) { me = 0.9; ro = 0.3; em = 0.02; m.bumpScale = 0.25; }
        else if (m.map === PANEL) { me = 0.55; ro = 0.25; em = 0.04; }
        else if (lum > 0.5) { me = sat < 0.06 ? 0.5 : 0.12; ro = 0.36; em = 0.03; }
        else if (lum < 0.05) { me = 0.35; ro = 0.45; em = 0.02; }
        else { me = 0.45; ro = 0.42; em = 0.03; }
        if (m.transparent) { em = m.emissiveIntensity; }
        Object.assign(m, { metalness: me, roughness: ro, envMapIntensity: 1 });
        if (m.emissive && !m.emissiveMap) m.emissiveIntensity = em;
        m.needsUpdate = true;
      }
    });
  }
  for (const a of ALL) if (a.shape != "falcon") upMat(a.m);

  /* ---------- 9c. The 3D viewer in every machine window: studio light, reflections, shadow on a stand, keyboard control ---------- */
  const mv0 = miniView;
  function studioEnv(r) {
    const pm = new THREE.PMREMGenerator(r), c = document.createElement("canvas"); c.width = 512; c.height = 256; const x = c.getContext("2d"), g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, "#9aa6bd"); g.addColorStop(0.45, "#39425a"); g.addColorStop(0.55, "#151a26"); g.addColorStop(1, "#07090f");
    x.fillStyle = g; x.fillRect(0, 0, 512, 256); x.fillStyle = "#ffffff";
    x.fillRect(60, 30, 110, 26); x.fillRect(320, 22, 140, 20); x.fillStyle = "#cfe4ff"; x.fillRect(220, 70, 60, 12);
    const t_ = new THREE.CanvasTexture(c); t_.mapping = THREE.EquirectangularReflectionMapping; t_.encoding = THREE.sRGBEncoding;
    const e = pm.fromEquirectangular(t_).texture; t_.dispose(); pm.dispose(); return e;
  }
  function viewRenderer() {
    if (V4.vr) return V4.vr;
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    r.localClippingEnabled = true; r.outputEncoding = THREE.sRGBEncoding; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap;
    try { r.userData = { env: studioEnv(r) }; } catch (e) { console.warn(e); r.userData = { env: null }; }
    return (V4.vr = r);
  }
  V4.viewRenderer = viewRenderer;
  miniView = function (a, el) {
    if (a.glb) return mv0(a, el);
    const w = el.clientWidth || 400, h = el.clientHeight || 260, r = viewRenderer(), ac = new AbortController(), sig = { signal: ac.signal };
    r.setPixelRatio(Math.min(devicePixelRatio, SET.q > 1 ? 1.5 : 1)); r.setSize(w, h); el.appendChild(r.domElement);
    const sc = new THREE.Scene(), cm = new THREE.PerspectiveCamera(40, w / h, 0.1, 100), m = new THREE.Group(), pv = new THREE.Group();
    const env = r.userData.env; sc.environment = env;
    const shared = a.shape == "falcon" && !!FALCON;
    if (shared) m.add(FALCON.clone()); else { SHP[a.shape](m); upMat(m); }
    m.traverse(n => { if (n.isMesh) n.castShadow = n.receiveShadow = true; });
    const b = new THREE.Box3().setFromObject(m), size = b.getSize(new V());
    m.position.sub(b.getCenter(new V())); pv.add(m);
    // the stand must hold every point of the machine at every spin angle: find the point farthest from the spin axis
    let reach = 0; { pv.updateMatrixWorld(true); const q = new V(); m.traverse(n => { if (!n.isMesh) return; const p = n.geometry.attributes.position; for (let i = 0; i < p.count; i++) { q.fromBufferAttribute(p, i).applyMatrix4(n.matrixWorld); reach = Math.max(reach, Math.hypot(q.x, q.z)); } }); }
    const k = 3.3 / Math.max(reach * 2, size.y * 1.25);
    const root = new THREE.Group(); sc.add(root); // everything on the stand; the size comparison scales this
    pv.scale.setScalar(k); root.add(pv);
    const floor = -size.y * k / 2;
    // display stand
    const stand = new THREE.Group(); stand.position.y = floor;
    const SR = Math.max(1.1, reach * k * 1.06 + 0.06);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(SR, SR + 0.08, 0.1, 72), new THREE.MeshStandardMaterial({ color: 0x0b0e15, roughness: 0.7, metalness: 0.2, envMapIntensity: 0.22 }));
    top.position.y = -0.05; top.receiveShadow = true; stand.add(top);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(SR + 0.04, 0.016, 8, 96), new THREE.MeshBasicMaterial({ color: a.seen ? 0xf2c46d : 0x7fd1ff }));
    rim.rotation.x = Math.PI / 2; stand.add(rim); root.add(stand);
    // studio lights: warm key with soft shadow, cool rim, gentle sky fill
    const key = new THREE.DirectionalLight(0xfff1e0, 2.1); key.position.set(3, 6, 4); key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 0.5, far: 20 }); key.shadow.bias = -0.0005; key.shadow.normalBias = 0.02; key.shadow.radius = 4;
    const rimL = new THREE.DirectionalLight(0x9ecbff, 1.3); rimL.position.set(-4, 3, -5);
    sc.add(key, rimL, new THREE.HemisphereLight(0xcfd8ff, 0x1a1410, 0.35));
    // the camera orbits up and down around the machine; the machine itself only spins on its stand, so it never sinks into it
    let dist = 4.7, elev = 0.3;
    const reset = () => { dist = 4.7; elev = 0.3; pv.rotation.y = 0; place(); };
    const place = () => { const ty = floor * 0.08; cm.position.set(0, ty + Math.sin(elev) * dist, Math.cos(elev) * dist); cm.lookAt(0, ty, 0); };
    place();
    const o = { id: 0, m, hold: 0, rx: 0, a, r, sc, cm, pv, root, stand, size, k, reach, floor, SR, el, hooks: [], shared,
      setDist(v) { dist = clamp(v, 3, 14); place(); }, getDist: () => dist };
    // keep the canvas matched to its box (the box shrinks when a part description opens)
    const ro = window.ResizeObserver ? new ResizeObserver(() => {
      const W_ = el.clientWidth, H_ = el.clientHeight; if (!W_ || !H_) return;
      r.setSize(W_, H_); cm.aspect = W_ / H_; cm.updateProjectionMatrix();
    }) : null;
    if (ro) ro.observe(el);
    o.stop = () => {
      if (ro) ro.disconnect();
      cancelAnimationFrame(o.id);
      const keep = new Set(); if (shared) m.traverse(n => keep.add(n)); // Falcon shares its geometry with the world copy
      sc.traverse(n => { if (n.isMesh) { if (keep.has(n) || n.userData.noDispose) return; n.geometry.dispose(); } }); // materials are left alone so their compiled shaders stay cached for the next window
      for (const f of o.onStop || []) try { f(); } catch (e) { console.warn(e); }
      ac.abort(); r.domElement.remove(); // the renderer and its environment are kept for the next window
    };
    // pointer: drag to rotate, wheel to zoom, double-click to reset
    const d = r.domElement; d.style.cursor = "grab"; d.style.touchAction = "none"; d.tabIndex = 0; d.setAttribute("role", "img");
    d.setAttribute("aria-label", nm(a) + ". " + bd(a) + " " + L("Arrow keys rotate the model, plus and minus zoom, zero resets.", "الأسهم تدوّر المجسم، وزائد وناقص للتكبير والتصغير، وصفر لإعادة الضبط."));
    let dn = 0, ax = 0, ay = 0; const pts = new Map(); let pinch = 0;
    const hold = () => { o.hold = Math.max(o.hold, performance.now() + 4000); };
    d.addEventListener("pointerdown", e => { pts.set(e.pointerId, [e.clientX, e.clientY]); dn = 1; ax = e.clientX; ay = e.clientY; try { d.setPointerCapture(e.pointerId); } catch (_) {} d.style.cursor = "grabbing"; }, sig);
    d.addEventListener("pointermove", e => {
      if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size == 2) { const [p, q] = [...pts.values()], dd = Math.hypot(p[0] - q[0], p[1] - q[1]); if (pinch) dist = clamp(dist * pinch / dd, 3, 11); pinch = dd; place(); hold(); return; }
      if (!dn) return; pv.rotation.y += (e.clientX - ax) * 0.01; elev = clamp(elev + (e.clientY - ay) * 0.006, 0.02, 1.25); place(); ax = e.clientX; ay = e.clientY; hold();
    }, sig);
    const up = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = 0; if (!pts.size) { dn = 0; d.style.cursor = "grab"; } };
    d.addEventListener("pointerup", up, sig); d.addEventListener("pointercancel", up, sig);
    d.addEventListener("wheel", e => { e.preventDefault(); dist = clamp(dist + e.deltaY * 0.004, 3, 11); place(); }, { passive: false, signal: ac.signal });
    d.addEventListener("dblclick", reset, sig);
    d.addEventListener("keydown", e => {
      const c = e.code; let used = 1;
      if (c == "ArrowLeft") pv.rotation.y -= 0.25; else if (c == "ArrowRight") pv.rotation.y += 0.25;
      else if (c == "ArrowUp") { elev = clamp(elev + 0.12, 0.02, 1.25); place(); } else if (c == "ArrowDown") { elev = clamp(elev - 0.12, 0.02, 1.25); place(); }
      else if (c == "Equal" || c == "NumpadAdd") { dist = clamp(dist - 0.6, 3, 11); place(); } else if (c == "Minus" || c == "NumpadSubtract") { dist = clamp(dist + 0.6, 3, 11); place(); }
      else if (c == "Digit0" || c == "Numpad0" || c == "Home") reset();
      else used = 0;
      if (used) { e.preventDefault(); e.stopPropagation(); hold(); }
    }, sig);
    // Apollo 15 Falcon: cut plane that hides the ascent stage in the timeline
    if (shared) {
      o.clip = new THREE.Plane(new V(0, -1, 0), 1e4); const H = size.y * k; o.cutY = -H / 2 + H * FALCON_CUT;
      // cloning copies userData through JSON, which turns the saved colours (c0/h0) into plain numbers and the model went black on the
      // second visit; give each clone a clean userData so they are saved again from the real colours
      m.traverse(n => { if (n.isMesh) { n.material = n.material.clone(); n.material.userData = {}; n.material.clippingPlanes = [o.clip]; n.material.clipShadows = true; } });
    }
    o.pose = { s: 1, h: 0, t: 0 }; o.cur = { s: 1, h: 0, t: 0 };
    const lieLift = Math.max(0, (Math.max(size.x, size.z) - size.y) * k / 2); // a machine laid on its side must rise so it stays above the stand
    let lastV = performance.now();
    const loopV = () => {
      o.id = requestAnimationFrame(loopV);
      const now = performance.now(), dtv = Math.min(0.05, (now - lastV) / 1000); lastV = now;
      if (el.offsetParent === null) return; // viewer hidden (photos tab): don't render
      for (const h of o.hooks) try { h(dtv); } catch (e) { console.warn("viewer hook:", e); }
      const P = o.pose, C = o.cur; for (const q in C) C[q] += ((P[q] || 0) - C[q]) * 0.06;
      if (performance.now() > o.hold && !RMV()) pv.rotation.y += 0.006;
      pv.rotation.x = 0; pv.rotation.z = C.t; pv.position.y = C.h * 0.5 + lieLift * Math.abs(Math.sin(C.t));
      if (m.userData.rot) m.userData.rot.forEach((q, i) => (q.rotation.y += (i ? -1 : 1) * 0.6 * C.s));
      rim.material.color.setHex(a.seen ? (SET.cb ? 0xffb000 : 0xf2c46d) : 0x7fd1ff);
      r.render(sc, cm);
    };
    o.id = requestAnimationFrame(loopV); // first 3D frame right after the window appears, so opening never blocks
    return o;
  };

  /* ---------- 10. Wrap original functions ---------- */
  const go0 = go;
  go = function (s, id) {
    go0(s, id); aw = null;
    scene.environment = V4.env ? (s == 1 ? V4.env.space : V4.env[cur]) || null : null;
    for (const m of FP) m.material.color.set(cur == "moon" ? 0x1d1d20 : 0x4a2214);
    fpLast = null; statusUpd(1);
  };
  const al0 = applyLang;
  applyLang = function () { al0(); v4lang(); };
  // floating labels: the original rewrote text and position every frame, forcing page layout each frame; only write what changed
  const lpV = new V();
  lab = function (el, v, txt, on) {
    let vis = false, x = 0, y = 0;
    if (on) { lpV.copy(v).project(camera); x = Math.round((lpV.x + 1) / 2 * innerWidth); y = Math.round((1 - lpV.y) / 2 * innerHeight); vis = !(lpV.z > 1 || y < 90 || x < 0 || x > innerWidth); }
    const c = el._v4 || (el._v4 = {});
    if (c.vis !== vis) { el.style.display = vis ? "block" : "none"; c.vis = vis; }
    if (!vis) return;
    if (c.x !== x || c.y !== y) { el.style.transform = "translate(" + x + "px," + y + "px) translate(-50%,-100%)"; c.x = x; c.y = y; }
    if (c.t !== txt) { el.textContent = txt; c.t = txt; }
  };
  for (const e of document.querySelectorAll(".lb")) { e.style.left = "0px"; e.style.top = "0px"; }
  const tl0 = tlShow;
  tlShow = function (i, sp) { tl0(i, sp); document.querySelectorAll("#tld .tdot span").forEach(s => { if (!/^\d{4}$/.test(s.textContent.trim())) s.remove(); }); };
  const om0 = openM;
  openM = function (a) { om0(a); statusUpd(1); $("#vw").dataset.h = L("Drag or arrow keys to rotate · wheel, pinch or +/− to zoom · double-click resets", "اسحب أو استخدم الأسهم للتدوير · العجلة أو القرص أو +/− للتكبير · نقرتان لإعادة الضبط"); if (ALL.every(z => z.seen)) setTimeout(celebrate, 400); };

  /* ---------- 11. Per-frame update (runs inside the main loop, before rendering) ---------- */
  let envT = 0, bumpT = 0, bumpMsgT = 0, lpx = px, lpz = pz, arrived = null;
  const ck0 = ckUpdate;
  ckUpdate = function (dt) {
    ck0(dt);
    // disabled cockpit buttons were lit white by the nearby lamp; make "off" look off
    if (CK.visible) for (const b of BT) b.cap.material.color.setHex($(b.id).disabled ? 0x2c313b : 0xffffff);
    try { v4frame(dt); } catch (e) { console.warn("v4 frame:", e); }
  };
  function v4frame(dt) {
    if (!(dt > 0)) return;
    if (wind < 0) wind = 0;
    const onSurf = st > 1, mars = cur == "mars" && onSurf, free = st == 3 && !mo && !tr && !tko;
    // environment intensity for newly loaded models
    envT -= dt; if (envT <= 0) { envT = 5; tuneEnv(); }
    for (const p of V4.pebbles) p.visible = SET.q > 1; // pebbles only on "High"; the museum lowers quality by itself on slow devices

    // weather
    const tgt = mars ? (SET.safe ? Math.min(0.35, [0, 0.35, 1][WX.s]) : [0, 0.35, 1][WX.s]) : 0;
    stK += (tgt - stK) * Math.min(1, dt * 0.35);
    W.mars.userData.sk.material.uniforms.st.value = stK;
    W.mars.userData.spr.material.opacity = 1 - 0.75 * stK;
    if (mars && scene.fog) { scene.fog.color.copy(fogBase).lerp(fogStorm, stK); HEM.intensity = 0.3 + 0.3 * stK; }
    haze.style.opacity = mars && !SET.safe ? (stK * 0.45).toFixed(3) : 0;
    sand.visible = mars && !RMV() && stK > 0.02;
    if (sand.visible) {
      sand.material.opacity = 0.08 + 0.32 * stK;
      const c = camera.position, len = 0.1 + wind * 0.03, sp = (2 + wind * 1.4) * dt;
      for (let i = 0; i < SAND; i++) {
        const o = i * 6; let x = sp_[o] + sp * (0.7 + (i % 7) * 0.08), z = sp_[o + 2] + Math.sin(t + i) * dt * 0.3, y = sp_[o + 1];
        if (x - c.x > 25) x -= 50; else if (x - c.x < -25) x += 50;
        if (z - c.z > 25) z -= 50; else if (z - c.z < -25) z += 50;
        const gy = GH.mars(x, z); if (y < gy + 0.03 || y > gy + 1.9) y = gy + 0.05 + R() * R() * 1.8;
        sp_[o] = x; sp_[o + 1] = y; sp_[o + 2] = z; sp_[o + 3] = x + len; sp_[o + 4] = y - len * 0.08; sp_[o + 5] = z;
      }
      sandG.attributes.position.needsUpdate = true;
    }
    // dust devil wanders across the plain, 45–95 m away; it fades in a storm (you cannot see it) and in the safe mode
    devil.visible = mars && !SET.safe;
    if (devil.visible) {
      devPh += dt * (RMV() ? 0 : 1); devU.t.value = devPh;
      const ang = devPh * 0.012, rr = 58 + 18 * Math.sin(devPh * 0.021), x = Math.cos(ang) * rr, z = Math.sin(ang) * rr + 10;
      devil.position.set(x, GH.mars(x, z) - 0.4, z);
      devU.op.value = (1 - 0.8 * stK) * (0.75 + 0.25 * Math.sin(devPh * 0.05));
      devU.sun.value.copy(sun.position).sub(sun.target.position).normalize();
      if (scene.fog) { devU.fogc.value.copy(scene.fog.color); devU.fd.value = scene.fog.density; }
    }
    windAudio(mars && !SET.safe ? (st == 2 ? 0.015 : 0.02 + 0.07 * stK) * (wind / 10) : 0);
    if (mars && WX.s !== wxPrev) { if (wxPrev >= 0) live2.textContent = L("Mars weather: ", "طقس المريخ: ") + WX.nm(); wxPrev = WX.s; }
    if (!mars) wxPrev = -1;

    // plinth rings: pulse when you are near, turn gold once inspected
    if (!V4.rings.length) for (const a of ALL) { const w = W[a.k]; w.traverse(o => { if (o.isMesh && o.geometry.type == "TorusGeometry" && o.material.isMeshBasicMaterial) { const p = o.getWorldPosition(new V()); if (Math.hypot(p.x - a.x, p.z - a.z) < 0.6) V4.rings.push([o, a]); } }); }
    for (const [o, a] of V4.rings) {
      if (a.k != cur) continue;
      const near = onSurf && Math.hypot(a.x - px, a.z - pz) < 14, k = near && !RMV() ? 1 + 0.035 * Math.sin(t * 3.2) : 1;
      o.scale.set(k, k, 1);
      o.material.color.set(a.seen ? (SET.cb ? 0xffb000 : 0xf2c46d) : near ? 0xbfeaff : 0x7fd1ff);
    }
    for (const r of RINGS) r.material.opacity = 1;

    // auto-walk
    if (aw && free) {
      const dx = aw.x - px, dz = aw.z - pz, d = Math.hypot(dx, dz);
      yaw += wr(Math.atan2(-dx, -dz) - yaw) * Math.min(1, dt * 3); pit -= pit * Math.min(1, dt * 3);
      if (d > aw.stop + 0.05) {
        const s = Math.min(4 * dt, d - aw.stop); px += dx / d * s; pz += dz / d * s;
        for (const c of COL[cur]) { const ax = px - c.x, az = pz - c.z, dd = Math.hypot(ax, az), q = c.r + 0.5; if (dd < q && dd > 1e-4) { px = c.x + ax / dd * q; pz = c.z + az / dd * q; } }
      } else {
        const m = L("You have arrived at ", "وصلت إلى ") + aw.name + ". " + (aw.k ? Tx("pk") : Tx("pi")) + ".";
        aw = null; gping(1100, 0, false, true); tell(m);
      }
    }

    // footprints and footsteps, plus "blocked" bump
    const moved = Math.hypot(px - lpx, pz - lpz);
    if (free && onG && pj <= 0 && moved > 0 && moved < 1) {
      fpDist += moved;
      const stride = cur == "moon" ? 0.95 : 0.72;
      if (fpDist >= stride) {
        fpDist = 0; fpSide = -fpSide;
        const fy = yaw, sx = Math.cos(fy) * 0.14 * fpSide, sz = -Math.sin(fy) * 0.14 * fpSide, x = px + sx, z = pz + sz, m = FP[fpN++ % FP.length];
        m.position.set(x, GH[cur](x, z) + 0.03, z); m.rotation.set(0, fy, 0); m.material.opacity = cur == "moon" ? 0.5 : 0.4; m.userData.b = t; m.visible = true;
        thud(fpSide * 0.15, cur == "moon" ? 260 : 1400, cur == "moon" ? 0.05 : 0.035);
      }
    }
    const keys = K.KeyW || K.KeyS || K.KeyA || K.KeyD || K.ArrowUp || K.ArrowDown || K.ArrowLeft || K.ArrowRight;
    const want = Math.hypot(pvx, pvz);
    if (free && keys && !aw && !tour && want > 1 && dt > 0 && moved / dt < want * 0.3) {
      bumpT += dt;
      if (bumpT > 0.25) {
        bumpT = -0.6; thud(0, 180, 0.09);
        bumpMsgT -= 1; if (guide && performance.now() > bumpMsgT) { bumpMsgT = performance.now() + 4000; ann(L("Blocked. Turn a little and try again.", "يوجد عائق. استدر قليلاً وحاول مرة أخرى.")); }
      }
    } else bumpT = Math.max(0, bumpT - dt);
    lpx = px; lpz = pz;

    // better audio guide: replaces the original ping
    if (guide) ping = 1e9;
    if (guide && free) {
      V4.gp = (V4.gp || 0) - dt;
      const tg = ART[cur].filter(a => !a.seen), pool = tg.length ? tg : ART[cur];
      let a = pool[0]; for (const q of pool) if (Math.hypot(q.x - px, q.z - pz) < Math.hypot(a.x - px, a.z - pz)) a = q;
      const r = rel(a);
      if (V4.gp <= 0) {
        V4.gp = clamp(r.d / 18, 0.3, 2.2);
        const behind = Math.abs(r.an) > Math.PI / 2, centred = Math.abs(r.an) < 0.15;
        gping(r.d < 6.2 ? 1100 : 420 + Math.max(0, 40 - r.d) * 8, clamp(Math.sin(r.an), -1, 1), behind, centred);
      }
      if (r.d < 6.2 && arrived !== a) { arrived = a; gping(1320, 0, false, true); ann(Tx("pi") + ": " + nm(a)); }
      if (r.d > 9) arrived = arrived === a ? null : arrived;
    }

    for (const f of V4.frame) f(dt);
    statusUpd();
  }

  /*@@INCLUDE:v5.js@@*/
  /*@@INCLUDE:v6.js@@*/
  /*@@INCLUDE:v7.js@@*/

  /* ---------- 12. Start-up preferences from the operating system ---------- */
  try {
    if (localStorage.getItem("smset") == null) {
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) SET.rm = 1;
      if (matchMedia("(prefers-contrast: more)").matches) SET.hc = 1;
      applySet();
    }
  } catch (e) { console.warn(e); }

  v4lang();
  go(st, cur);
  window.V4 = V4;
})();
