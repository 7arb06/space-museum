  /* ===================== v7: post-processing (bloom, grade, MSAA), zero-stutter pass, full experience profiles, kids mode, problems & solutions ===================== */

  /* ---------- 1. Post-processing: soft bloom, cinematic grade, multisampled edges (High quality only) ---------- */
  const rdRender = rd.render.bind(rd);
  let FXC = null, inFX = false, fxFrame = 0;
  function fxBuild() {
    if (FXC || !THREE.EffectComposer || !THREE.UnrealBloomPass || !THREE.RenderPass || !THREE.ShaderPass) return;
    try {
      const pr = rd.getPixelRatio(), w = innerWidth, h = innerHeight, opts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, encoding: rd.outputEncoding };
      const ms = rd.capabilities.isWebGL2 && THREE.WebGLMultisampleRenderTarget;
      const rt = ms ? new THREE.WebGLMultisampleRenderTarget(w * pr, h * pr, opts) : new THREE.WebGLRenderTarget(w * pr, h * pr, opts);
      if (ms) rt.samples = pr > 1 ? 2 : 4; // high-density screens need fewer samples for the same smoothness
      const c = new THREE.EffectComposer(rd, rt); c.setPixelRatio(pr); c.setSize(w, h);
      c.addPass(new THREE.RenderPass(scene, camera));
      const bloom = new THREE.UnrealBloomPass(new THREE.Vector2(w, h), 0.42, 0.5, 0.9); c.addPass(bloom);
      { const bs = bloom.setSize.bind(bloom); bloom.setSize = (a, b) => bs(Math.max(2, Math.round(a / 2)), Math.max(2, Math.round(b / 2))); bloom.setSize(w * pr, h * pr); } // same glow, a quarter of the work
      const grade = new THREE.ShaderPass({
        uniforms: { tDiffuse: { value: null }, vig: { value: 0.32 }, warm: { value: 0 }, sat: { value: 1.06 } },
        vertexShader: "varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
        fragmentShader: "uniform sampler2D tDiffuse;uniform float vig,warm,sat;varying vec2 vUv;void main(){vec4 c=texture2D(tDiffuse,vUv);vec3 k=c.rgb;float l=dot(k,vec3(.299,.587,.114));k=mix(vec3(l),k,sat);k*=mix(vec3(1.),vec3(1.035,1.,.965),warm);vec2 d=vUv-.5;k*=clamp(1.-dot(d,d)*vig*2.,0.,1.);gl_FragColor=vec4(k,c.a);}"
      });
      c.addPass(grade);
      let fxaa = null;
      if (!ms && THREE.FXAAShader) { fxaa = new THREE.ShaderPass(THREE.FXAAShader); fxaa.material.uniforms.resolution.value.set(1 / (w * pr), 1 / (h * pr)); c.addPass(fxaa); }
      FXC = { c, bloom, grade, fxaa };
    } catch (e) { console.warn("Post-processing unavailable, using the normal renderer:", e); FXC = null; }
  }
  const fxOn = () => FXC && SET.q >= 2 && !FXC.off;
  function fxResize() {
    if (!FXC) return;
    const pr = rd.getPixelRatio(), w = innerWidth, h = innerHeight;
    FXC.c.setPixelRatio(pr); FXC.c.setSize(w, h); FXC.bloom.setSize(w * pr, h * pr);
    if (FXC.fxaa) FXC.fxaa.material.uniforms.resolution.value.set(1 / (w * pr), 1 / (h * pr));
  }
  addEventListener("resize", fxResize);
  rd.render = function (s, c) {
    if (s === scene && c === camera && rd.getRenderTarget() === null && !inFX) {
      if ((mo || gmo) && fxFrame) return;   // a full window covers the scene: keep the last frame, leave the GPU to the 3D viewer
      fxFrame = 1;
      if (fxOn()) {
        inFX = true;
        try { FXC.grade.uniforms.warm.value = st > 1 && cur == "mars" ? 1 : 0; FXC.bloom.strength = SET.safe ? 0.25 : st == 1 ? 0.55 : 0.42; FXC.c.render(); }
        catch (e) { console.warn("Post-processing failed, switching it off:", e); FXC.off = 1; rdRender(s, c); }
        finally { inFX = false; }
        return;
      }
    }
    rdRender(s, c);
  };
  fxBuild();
  { let n = 0, sum = 0, wait = 0;
    V4.frame.push(dt => {
      if (!fxOn() || mo || gmo || tr || st < 2) { n = sum = 0; wait = 2; return; }
      if (wait > 0) { wait -= dt; return; }          // ignore the first seconds after arriving
      n++; sum += dt;
      if (n >= 90) { const avg = sum / n; n = sum = 0; if (avg > 1 / 45) { FXC.off = 1; console.info("Visual effects switched off to keep movement smooth (avg frame " + Math.round(avg * 1000) + " ms)"); } }
    }); }

  /* ---------- 2. Zero-stutter pass ---------- */
  // 2a. quality changes no longer rebuild every shader (only switching shadows fully on/off does)
  applyQ = function () {
    const q = SET.q;
    rd.setPixelRatio(q == 0 ? 1 : Math.min(devicePixelRatio, q == 1 ? 1.25 : 1.5));
    const s = q >= 2 ? 2048 : 1024;
    if (sun.shadow.mapSize.x !== s) { sun.shadow.mapSize.set(s, s); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
    const sh = q > 0;
    if (rd.shadowMap.enabled !== sh) { rd.shadowMap.enabled = sh; sun.castShadow = sh; scene.traverse(o => { if (o.material && !Array.isArray(o.material)) o.material.needsUpdate = true; }); }
    rd.setSize(innerWidth, innerHeight); fxResize();
  };
  // 2b. the automatic quality drop stops at Medium (dropping shadows would rebuild every shader mid-walk)
  const autoQ0 = autoQ;
  autoQ = function (dt) { if (SET.q <= 1) { AQ.done = 1; return; } autoQ0(dt); };
  // 2c. the cockpit screen texture (1024²) was re-uploaded 8 times a second; 4 is plenty
  const scr0 = scrDraw; let scrT = 0;
  scrDraw = function () { const n = performance.now(); if (n - scrT < 240) return; scrT = n; scr0(); };
  // 2d. recorded voices: index the 50 MB voice pack in small slices instead of one ~0.5 s JSON.parse freeze
  if (window.VDATA === undefined) {
    window.VDATA = {};
    const idx = () => {
      const el = document.getElementById("vdata"); if (!el) return;
      const raw = el.textContent, D = window.VDATA; el.remove();
      let i = raw.indexOf("{") + 1;
      const step = () => {
        const t0 = performance.now();
        while (i > 0 && i < raw.length && performance.now() - t0 < 6) {
          const ks = raw.indexOf('"', i); if (ks < 0) { i = raw.length; break; }
          const ke = raw.indexOf('"', ks + 1), vs = raw.indexOf('"', ke + 1) + 1, ve = raw.indexOf('"', vs);
          if (ke < 0 || vs <= 0 || ve < 0) { i = raw.length; break; }
          const k = raw.slice(ks + 1, ke), a = vs, b = ve;
          Object.defineProperty(D, k, { get: () => raw.slice(a, b), enumerable: true, configurable: true });
          i = ve + 1;
        }
        if (i < raw.length) (window.requestIdleCallback || setTimeout)(step, { timeout: 300 });
      };
      step();
    };
    if (document.readyState == "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(idx, 50)); else setTimeout(idx, 50);
  }
  // 2e. safe / reduced motion: no flickering cockpit power-up
  const ck7 = ckUpdate;
  ckUpdate = function (dt) { if (SET.safe || SET.rm) ckP = 1; ck7(dt); };
  // 2f. warm-up of everything: hidden objects too (footprints, flames, sand), with and without fog, the post-processing, and every 3D viewer model
  function warmPass(fogId, outside) {
    const saved = { fog: scene.fog, env: scene.environment }, hid = [], cull = [], rt = new THREE.WebGLRenderTarget(32, 32);
    rt.texture.encoding = rd.outputEncoding;
    try {
      scene.traverse(o => { if (!o.visible) { hid.push(o); o.visible = true; } if (o.frustumCulled) { cull.push(o); o.frustumCulled = false; } });
      const ckVis = CK.visible; if (outside) CK.visible = false; // on the surface the cockpit lamps are gone: a different light count means different shaders
      scene.fog = fogId ? new THREE.FogExp2(PL[fogId].fog, 0.01) : null; scene.environment = (V4.env && V4.env[fogId || "space"]) || null;
      rd.setRenderTarget(rt); rdRender(scene, camera);
      CK.visible = ckVis;
    } catch (e) { console.warn("warm-up:", e); }
    finally { rd.setRenderTarget(null); for (const o of hid) o.visible = false; for (const o of cull) o.frustumCulled = true; rt.dispose(); scene.fog = saved.fog; scene.environment = saved.env; }
  }
  function warmViewer(list) {
    const a = list.shift(); if (!a) return;
    if (mo || gmo) { setTimeout(() => warmViewer([a].concat(list)), 1500); return; }
    try {
      const box = document.createElement("div"); box.style.cssText = "position:absolute;left:-9999px;top:0;width:320px;height:220px"; document.body.appendChild(box);
      const o = miniView(a, box); if (o) { o.r.render(o.sc, o.cm); o.stop(); } box.remove();
    } catch (e) { console.warn("viewer warm-up:", e); }
    (window.requestIdleCallback || setTimeout)(() => warmViewer(list), { timeout: 800 });
  }
  warm = function () {
    if (warmed || st == 3 || tr || mo) return;
    warmed = 1;
    // one small step per idle moment, so the warm-up itself never causes a long freeze
    const steps = [() => warmPass("moon"), () => warmPass("mars"), () => warmPass("moon", 1), () => warmPass("mars", 1), () => warmPass(null),
      () => { if (fxOn()) { inFX = true; try { FXC.c.render(); } catch (e) { FXC.off = 1; } inFX = false; } }, () => warmViewer(ALL.slice())];
    const run = () => { const f = steps.shift(); if (!f) return; try { f(); } catch (e) { console.warn(e); } if (steps.length) (window.requestIdleCallback || setTimeout)(run, { timeout: 400 }); };
    run();
  };

  /* ---------- 3. Kids mode: a real conversation for children (also used by Easy Read) ---------- */
  const KIDS = {
    surv: {
      hi: ["Hi friend! I'm Surveyor 3, a robot that landed on the Moon!", "مرحباً يا صديقي! أنا سيرفيور 3، روبوت هبط على القمر!"],
      who: ["I'm a NASA robot with three legs, a camera and a little scoop.", "أنا روبوت من ناسا، عندي ثلاث أرجل وكاميرا ومجرفة صغيرة."],
      did: ["In 1967 I landed on the Moon. I took thousands of pictures and dug in the dust to check it was safe for astronauts.", "في عام 1967 هبطت على القمر. التقطت آلاف الصور وحفرت في الغبار لأتأكد أنه آمن لروّاد الفضاء."],
      cool: [["When I landed, I bounced two times, like a ball!", "عندما هبطت ارتددت مرتين، مثل الكرة!"], ["Two years later, real astronauts walked over to visit me!", "بعد سنتين جاء روّاد فضاء حقيقيون لزيارتي!"], ["The astronauts took my camera and my scoop home to Earth.", "أخذ الروّاد كاميرتي ومجرفتي معهم إلى الأرض."]],
      parts: ["My camera is my eye, my scoop is my hand, and my three legs keep me standing.", "كاميرتي هي عيني، ومجرفتي هي يدي، وأرجلي الثلاث تُبقيني واقفاً."],
      end: ["I stopped talking in May 1967, but I'm still standing on the Moon today!", "توقفت عن الكلام في مايو 1967، لكنني ما زلت واقفاً على القمر حتى اليوم!"]
    },
    falcon: {
      hi: ["Hello! I'm Falcon, a Moon lander from Apollo 15!", "أهلاً! أنا فالكون، مركبة هبوط من أبولو 15!"],
      who: ["I carried two astronauts, Dave and Jim, down to the Moon in 1971.", "حملتُ رائدَي فضاء، ديف وجيم، إلى القمر عام 1971."],
      did: ["The astronauts drove a Moon car and collected lots of Moon rocks!", "قاد الرائدان سيارة القمر وجمعا الكثير من صخور القمر!"],
      cool: [["I have two parts. My bottom part stayed on the Moon!", "أنا من جزأين، وجزئي السفلي بقي على القمر!"], ["My top part flew the astronauts back up to space.", "جزئي العلوي طار بالروّاد عائداً إلى الفضاء."], ["The astronauts left their Moon car there. It is still on the Moon!", "ترك الروّاد سيارة القمر هناك، وما زالت على القمر!"]],
      parts: ["My gold blanket protects me from the hot Sun and the cold dark, and my four legs look like a spider's!", "بطانيتي الذهبية تحميني من الشمس الحارقة والظلام البارد، وأرجلي الأربع تشبه أرجل العنكبوت!"],
      end: ["My bottom part still sits on the Moon, like a little launch pad.", "ما زال جزئي السفلي على القمر، مثل منصة إطلاق صغيرة."]
    },
    viking: {
      hi: ["Hi! I'm Viking 1, the first robot that really worked on Mars!", "مرحباً! أنا فايكنغ 1، أول روبوت عمل فعلاً على المريخ!"],
      who: ["I'm a NASA lander. I landed on Mars in 1976.", "أنا مركبة هبوط من ناسا، هبطت على المريخ عام 1976."],
      did: ["I took the very first photo from the ground of Mars, and I scooped up dirt to look for tiny life.", "التقطت أول صورة على الإطلاق من أرض المريخ، وغرفت التربة لأبحث عن حياة صغيرة جداً."],
      cool: [["It was super cold: 86 degrees below zero before sunrise!", "كان الجو بارداً جداً: 86 درجة تحت الصفر قبل شروق الشمس!"], ["I worked on Mars for more than six years!", "عملت على المريخ أكثر من ست سنوات!"], ["My friend the orbiter flew above me and passed my messages to Earth.", "صديقتي المدارية كانت تطير فوقي وتوصل رسائلي إلى الأرض."]],
      parts: ["My long arm is a scooper, my dish talks to Earth, and my two cameras are my eyes.", "ذراعي الطويلة مجرفة، وطبقي يتكلم مع الأرض، وكاميرتاي هما عيناي."],
      end: ["In 1982 a wrong message from Earth stopped me. I'm still on Mars!", "في 1982 أوقفتني رسالة خاطئة من الأرض، وما زلت على المريخ!"]
    },
    vorb: {
      hi: ["Hello! I'm the Viking 1 orbiter. I flew around and around Mars!", "أهلاً! أنا مدارية فايكنغ 1، دُرت حول المريخ مرة بعد مرة!"],
      who: ["I'm a space robot with four big solar wings. The Sun gave me my power.", "أنا روبوت فضائي بأربعة أجنحة شمسية كبيرة، والشمس تعطيني الطاقة."],
      did: ["I took pictures of Mars from space and helped my friend the lander find a safe place to land.", "التقطت صوراً للمريخ من الفضاء، وساعدت صديقتي الهابطة على إيجاد مكان آمن للهبوط."],
      cool: [["With my twin, we took more than fifty thousand pictures of Mars!", "مع توأمي التقطنا أكثر من خمسين ألف صورة للمريخ!"], ["I went around Mars 1,489 times!", "دُرت حول المريخ 1,489 مرة!"], ["Our pictures made a map of almost all of Mars.", "صورنا صنعت خريطة لكل المريخ تقريباً."]],
      parts: ["My solar wings make electricity, my dish talks to Earth, and my cameras hang underneath like eyes.", "أجنحتي الشمسية تصنع الكهرباء، وطبقي يتكلم مع الأرض، وكاميراتي معلّقة تحتي مثل العيون."],
      end: ["In 1980 I ran out of steering gas, so NASA turned me off. Good night!", "في 1980 نفد غاز التوجيه عندي، فأطفأتني ناسا. تصبحون على خير!"]
    },
    heli: {
      hi: ["Whirr! Hi! I'm Ingenuity, a tiny helicopter on Mars!", "ززز! مرحباً! أنا إنجينيويتي، مروحية صغيرة على المريخ!"],
      who: ["I weigh 1.8 kilograms, about as much as two big bottles of water!", "وزني 1.8 كيلوغرام، تقريباً مثل قارورتَي ماء كبيرتين!"],
      did: ["In 2021 I became the first helicopter to fly on another planet!", "في 2021 صرت أول مروحية تطير على كوكب آخر!"],
      cool: [["They planned 5 flights for me, but I flew 72 times!", "خططوا لي 5 رحلات، لكنني طرت 72 مرة!"], ["My two blades spin in opposite directions, super fast!", "شفرتاي تدوران باتجاهين متعاكسين وبسرعة كبيرة!"], ["The air on Mars is very thin, so flying there is really hard.", "هواء المريخ رقيق جداً، لذلك الطيران هناك صعب جداً."]],
      parts: ["My blades lift me up, my solar panel on top charges my battery, and my four legs help me land.", "شفراتي ترفعني، ولوحي الشمسي في الأعلى يشحن بطاريتي، وأرجلي الأربع تساعدني على الهبوط."],
      end: ["In 2024 my blades got hurt, so I stopped flying. I'm still standing on Mars.", "في 2024 تضررت شفراتي فتوقفت عن الطيران، وما زلت واقفة على المريخ."]
    }
  };
  const kidOn = () => !!SET.kid; // only the child profile; Easy Read keeps the original answers, which have recorded voices
  const menu0 = menu;
  menu = function (a) {
    const K_ = KIDS[a.shape]; if (!kidOn() || !K_) return menu0(a);
    const T = p => (LANG == "ar" ? p[1] : p[0]);
    return [
      ["👋", L("Say hi", "قل مرحباً"), () => T(K_.hi), "hi hello مرحبا"],
      ["🤖", L("Who are you?", "من أنت؟"), () => T(K_.who), "who من"],
      ["🚀", L("What did you do?", "ماذا فعلت؟"), () => T(K_.did), "did do فعلت"],
      ["🤩", L("Tell me something cool!", "أخبرني شيئاً رائعاً!"), () => T(K_.cool[(ch.f++) % K_.cool.length]), "cool fact رائع"],
      ["🔧", L("What are your parts?", "ما هي أجزاؤك؟"), () => T(K_.parts), "parts أجزاء"],
      ["😢", L("What happened to you?", "ماذا حدث لك؟"), () => T(K_.end), "happened حدث"],
      ["🎮", L("Let's play!", "هيا نلعب!"), () => { setTimeout(() => { if (GAMES[a.shape]) openGame(a.shape); }, 1600); return L("Yay! Let's play a game about me!", "رائع! هيا نلعب لعبة عنّي!"); }, "play game لعب"],
      ["👋", L("Bye!", "مع السلامة!"), () => L("Bye bye, explorer! Come back soon!", "مع السلامة يا مستكشف! عُد قريباً!"), "bye وداعا"]
    ];
  };
  const NOVAK = {
    hi: ["Hi, little explorer! I'm Commander Nova. Do you want to meet some space robots?", "أهلاً أيها المستكشف الصغير! أنا القائد نوفا. هل تريد أن تقابل روبوتات الفضاء؟"],
    who: ["I'm Commander Nova! I help explorers like you in the museum.", "أنا القائد نوفا! أساعد المستكشفين مثلك في المتحف."],
    about: ["People sent robots to the Moon and Mars, and they are still there! Walk to each robot and press E to talk to it.", "أرسل الناس روبوتات إلى القمر والمريخ، وما زالت هناك! امشِ إلى كل روبوت واضغط E لتتكلم معه."],
    ctl: ["Use the arrow keys to walk, Space to jump, and E to talk to a robot. Press N and I will walk you to the next robot!", "استخدم الأسهم للمشي، والمسافة للقفز، وE للكلام مع الروبوت. اضغط N وسأمشي بك إلى الروبوت التالي!"],
    bye: ["Bye bye, little explorer! See you soon!", "مع السلامة أيها المستكشف الصغير! أراك قريباً!"]
  };
  const dTexts0 = dTexts;
  dTexts = function (id) { const k = kidOn() && NOVAK[id]; return k ? (LANG == "ar" ? k[1] : k[0]) : dTexts0(id); };

  /* ---------- 4. "Choose how you experience it": complete, honest profiles ---------- */
  const PROF = [
    ["blind", "🦯", "pBl", ["A spoken guide reads everything aloud", "Sound pings show the way: higher = closer, two low notes = behind you", "N walks you to the next machine, C tells you what is around you", "Every machine describes how it looks, then reads your options", "High contrast and larger text for low vision"],
      ["دليل صوتي يقرأ كل شيء بصوت عالٍ", "نبضات صوتية تدلّك على الطريق: أعلى = أقرب، ونغمتان منخفضتان = خلفك", "N يمشي بك إلى الآلة التالية، وC يخبرك بما حولك", "كل آلة تصف شكلها ثم تقرأ لك الخيارات", "تباين عالٍ ونص أكبر لضعاف البصر"]],
    ["deaf", "🧏", "pDf", ["Everything spoken appears as captions", "A visible arrow shows the way instead of sound pings", "Chats, stories and Commander Nova are all written on screen"],
      ["كل ما يُقال يظهر مكتوباً على الشاشة", "سهم مرئي يدلّك على الطريق بدل النبضات الصوتية", "المحادثات والقصص والقائد نوفا كلها مكتوبة"]],
    ["motor", "🦾", "pMt", ["One-switch mode: Space turns an autopilot on and off in the games", "Games run slower", "Bigger buttons", "Press N to walk to the next machine with no steering"],
      ["وضع المفتاح الواحد: المسافة تشغّل الطيار الآلي وتوقفه في الألعاب", "الألعاب أبطأ", "أزرار أكبر", "اضغط N لتمشي إلى الآلة التالية بلا توجيه"]],
    ["read", "📖", "pRd", ["A dyslexia-friendly font", "Simple words in every chat", "Larger text with more space between lines"],
      ["خط مناسب لعُسر القراءة", "كلمات بسيطة في كل محادثة", "نص أكبر ومسافات أوسع بين الأسطر"]],
    ["child", "🧒", "pCh", ["A child's voice and simple, friendly chats with every machine", "Commander Nova speaks like a friend", "\"Let's play!\" button inside every chat", "Slower games and bigger text"],
      ["صوت طفل ومحادثات بسيطة ولطيفة مع كل آلة", "القائد نوفا يتكلم مثل صديق", "زر «هيا نلعب!» داخل كل محادثة", "ألعاب أبطأ ونص أكبر"]],
    ["photo", "🌗", "pPh", ["No flashing, shaking or warp effects", "No dust storms, softer glow", "Less movement everywhere and gentler sounds"],
      ["بلا وميض ولا اهتزاز ولا مؤثرات قفز", "بلا عواصف غبار، وتوهّج أخف", "حركة أقل في كل مكان وأصوات ألطف"]]
  ];
  openProfile = function () {
    const ar = LANG == "ar", curP = new Set(SET.prof || []);
    openOv(Tx("pfT"), "<p>" + Tx("pfQ") + '</p><div class="pfg">' + PROF.map(p => '<label class="pfc' + (curP.has(p[0]) ? " on" : "") + '"><input type="checkbox" data-p="' + p[0] + '"' + (curP.has(p[0]) ? " checked" : "") + '><span class="pfi" aria-hidden="true">' + p[1] + "</span><span><b>" + esc(Tx(p[2])) + "</b><ul>" + (ar ? p[4] : p[3]).map(x => "<li>" + esc(x) + "</li>").join("") + "</ul></span></label>").join("")
      + '</div><div class="pfb"><button class="key" id="pfG"><i></i>' + Tx("pfGo") + '</button><button class="chip" id="pfN">' + L("Standard experience", "التجربة العادية") + "</button></div>");
    $("#ovb").querySelectorAll("[data-p]").forEach(i => i.onchange = () => i.closest(".pfc").classList.toggle("on", i.checked));
    $("#pfG").onclick = () => { applyProfile([...$("#ovb").querySelectorAll("[data-p]")].filter(i => i.checked).map(i => i.dataset.p)); closeOv(); };
    $("#pfN").onclick = () => { applyProfile([]); closeOv(); };
  };
  applyProfile = function (Lp) {
    const h = k => Lp.includes(k);
    Object.assign(SET, { hc: 0, big: 0, deaf: 0, vis: 0, one: 0, assist: 0, dys: 0, easy: 0, kid: 0, safe: 0, rm: 0 });
    guide = 0; let v = "adult";
    if (h("photo")) { SET.safe = 1; SET.rm = 1; }
    if (h("read")) { SET.dys = 1; SET.easy = 1; SET.big = 1; }
    if (h("child")) { SET.kid = 1; SET.easy = 1; SET.big = 1; SET.assist = 1; v = "kids"; }
    if (h("motor")) { SET.one = 1; SET.assist = 1; SET.big = 1; }
    if (h("deaf")) { SET.deaf = 1; SET.vis = 1; }
    if (h("blind")) { guide = 1; v = "blind"; SET.hc = 1; SET.big = 1; }
    vm = v; SET.prof = Lp.slice(); applySet();
    if (mo && ch) { ch.m = []; chat(); }
    const ar = LANG == "ar", names = PROF.filter(p => h(p[0])).map(p => p[1] + " " + Tx(p[2]));
    const msg = Lp.length ? (ar ? "تم تجهيز تجربتك: " : "Your experience is ready: ") + names.join(ar ? "، " : ", ") : (ar ? "التجربة العادية." : "Standard experience.");
    toast(msg); $("#live").textContent = msg; if (guide) setTimeout(() => say(msg, "blind"), 400);
  };
  const kidCls = () => document.documentElement.classList.toggle("kid", !!SET.kid);
  const as7 = applySet; applySet = function () { as7(); kidCls(); };
  kidCls();

  /* ---------- 5. Problems and solutions: what NASA, people and students get, with a "try it now" for each ---------- */
  const WHY = {
    aud: [
      ["nasa", "🛰️", ["NASA", "ناسا"], [
        ["Turns NASA mission pages into an experience anyone can explore, and every fact links back to its NASA source.", "يحوّل صفحات مهام ناسا إلى تجربة يستكشفها أي شخص، وكل معلومة مربوطة بمصدرها في ناسا."],
        ["Reaches people NASA rarely reaches: Arabic speakers, blind and deaf visitors, children.", "يصل إلى جمهور نادراً ما تصله ناسا: الناطقون بالعربية والمكفوفون والصم والأطفال."],
        ["A template: adding another machine means adding data (dates, parts, timeline), not rebuilding the museum.", "قالب جاهز: إضافة آلة جديدة تعني إضافة بيانات (تواريخ وأجزاء وخط زمني)، لا إعادة بناء المتحف."],
        ["Shows what left-behind hardware could mean for future Moon and Mars bases.", "يُظهر ما قد تعنيه المعدات المتروكة لقواعد مستقبلية على القمر والمريخ."]]],
      ["people", "🌍", ["Everyone", "الناس"], [
        ["Free, in the browser, nothing to install, and it works with no internet.", "مجاني، يعمل في المتصفح، بلا تثبيت، ويعمل حتى بدون إنترنت."],
        ["Arabic and English everywhere.", "بالعربية والإنجليزية في كل مكان."],
        ["Designed for blind, deaf, limited-movement, dyslexic and light-sensitive visitors, and for children.", "مصمم للمكفوفين والصم ومحدودي الحركة وأصحاب عُسر القراءة والحساسين للضوء، وللأطفال."]]],
      ["school", "🎒", ["School students", "طلاب المدارس"], [
        ["Physics by doing: jump in real Moon and Mars gravity, land Surveyor softly, fly Ingenuity on one battery.", "فيزياء بالتجربة: اقفز بجاذبية القمر والمريخ الحقيقية، واهبط بسيرفيور بنعومة، وطِر بإنجينيويتي ببطارية واحدة."],
        ["History through spoken timelines that change the 3D model at every step.", "تاريخ عبر خطوط زمنية مروية تغيّر المجسم ثلاثي الأبعاد في كل محطة."],
        ["Engineering and sustainability: take machines apart, build them, and recycle their parts into a base.", "هندسة واستدامة: فكّك الآلات وركّبها، وأعد تدوير أجزائها لبناء قاعدة."],
        ["Works on any school computer, even with no internet.", "يعمل على أي حاسوب في المدرسة، حتى بلا إنترنت."]]]
    ],
    pr: [
      ["🔤", ["Space history is written in technical English, far from Arabic-speaking students.", "تاريخ الفضاء مكتوب بإنجليزية تقنية، بعيداً عن الطلاب الناطقين بالعربية."], ["Every word in Arabic and English, plus a simple-words mode.", "كل كلمة بالعربية والإنجليزية، مع وضع الكلمات البسيطة."], ["Switch the language now", "بدّل اللغة الآن"], "lang"],
      ["🦯", ["Blind visitors can't explore a 3D museum.", "لا يستطيع المكفوفون استكشاف متحف ثلاثي الأبعاد."], ["An audio guide: sound pings show the way, N walks you to the next machine, and every machine describes itself.", "دليل صوتي: نبضات صوتية تدلّك على الطريق، وN يمشي بك إلى الآلة التالية، وكل آلة تصف نفسها."], ["Close your eyes and try it", "أغمض عينيك وجرّب"], "eyes"],
      ["🧏", ["Deaf visitors miss the spoken stories.", "يفوت الصمَّ ما يُروى بالصوت."], ["Every spoken line appears as captions, and an arrow shows the way.", "كل جملة منطوقة تظهر مكتوبة، وسهم يدلّك على الطريق."], ["Try it with the sound off", "جرّبها والصوت مطفأ"], "deaf"],
      ["♻️", ["Machines left on the Moon and Mars are seen as junk.", "تُعَدّ الآلات المتروكة على القمر والمريخ خردة."], ["A recycling lab: every part becomes an idea for a future base.", "ورشة تدوير: كل قطعة تصبح فكرة لقاعدة مستقبلية."], ["Open the recycling lab", "افتح ورشة التدوير"], "recycle"],
      ["🧱", ["Students find space history abstract and boring.", "يجد الطلاب تاريخ الفضاء مجرداً ومملاً."], ["Build the machine yourself, replay its real moment, and play its game.", "ركّب الآلة بنفسك، وأعد لحظتها الحقيقية، والعب لعبتها."], ["Build Viking 1 now", "ركّب فايكنغ 1 الآن"], "build"],
      ["📏", ["It is hard to picture real size and the passing of time.", "يصعب تخيّل الحجم الحقيقي ومرور الزمن."], ["Compare each machine with a person, and drag through the years to 2050.", "قارن كل آلة بإنسان، واسحب عبر السنين حتى 2050."], ["Compare Ingenuity with a person", "قارن إنجينيويتي بإنسان"], "size"]
    ]
  };
  let whyAud = "nasa";
  function openWhy() {
    const ar = LANG == "ar", T = p => (ar ? p[1] : p[0]);
    const aud = WHY.aud.find(x => x[0] == whyAud) || WHY.aud[0];
    openOv(L("Problems we solve", "المشكلات التي نحلّها"),
      '<p class="v4note">' + L("Each problem below has a working solution in the museum. Press a button to try it right now.", "لكل مشكلة بالأسفل حلّ يعمل داخل المتحف. اضغط الزر لتجربته الآن.") + "</p>"
      + '<div class="whyl">' + WHY.pr.map((p, i) => '<article class="whyc" style="--i:' + i + '"><div class="whyi">' + p[0] + '</div><div><p class="whyp"><b>' + L("Problem", "المشكلة") + ":</b> " + esc(T(p[1])) + '</p><p class="whys"><b>' + L("Our solution", "حلّنا") + ":</b> " + esc(T(p[2])) + '</p><button class="key" data-try="' + p[4] + '"><i></i>▶ ' + esc(T(p[3])) + "</button></div></article>").join("") + "</div>"
      + '<h3 class="whyh">' + L("Who benefits", "من يستفيد") + '</h3><div class="labst" role="tablist">' + WHY.aud.map(x => '<button role="tab" class="labtab' + (x[0] == whyAud ? " on" : "") + '" aria-selected="' + (x[0] == whyAud) + '" data-aud="' + x[0] + '"><span>' + x[1] + "</span>" + esc(T(x[2])) + "</button>").join("") + "</div>"
      + '<ul class="whyb">' + aud[3].map(b => "<li>" + esc(T(b)) + "</li>").join("") + "</ul>");
    $("#ovb").querySelectorAll("[data-aud]").forEach(b => b.onclick = () => { whyAud = b.dataset.aud; openWhy(); const t_ = $('#ovb [data-aud="' + whyAud + '"]'); if (t_) t_.focus(); });
    $("#ovb").querySelectorAll("[data-try]").forEach(b => b.onclick = () => tryIt(b.dataset.try));
  }
  function toSurface(id, then) {
    const done = () => { if (then) setTimeout(then, 120); };
    if (st == 3 && cur == id) { done(); return; }
    const jump = () => { go(2, id); go(3); done(); };
    if (RM()) jump(); else dkGo(jump);
  }
  function openMachine(shape, then) {
    const a = ALL.find(z => z.shape == shape); if (!a) return;
    toSurface(a.k, () => { px = a.x; pz = a.z + 7; yaw = 0; pit = 0; openM(a); if (then) setTimeout(() => then(a), 150); });
  }
  const eyes = document.createElement("div"); eyes.id = "v4eyes"; eyes.hidden = true; eyes.setAttribute("aria-hidden", "true"); document.body.appendChild(eyes);
  function eyesOn() {
    guide = 1; if (MUTE) muteT();
    eyes.innerHTML = '<div><span class="v4ring"></span><b>' + L("Eyes closed: explore by sound", "العينان مغمضتان: استكشف بالصوت") + "</b><p>" + L("Listen to the pings: higher means closer, two low notes mean behind you. Press N to walk to the next machine, E to inspect it, C to hear what is around you. Escape opens your eyes.", "استمع للنبضات: الأعلى يعني أقرب، والنغمتان المنخفضتان تعنيان أنها خلفك. اضغط N لتمشي إلى الآلة التالية، وE لفحصها، وC لتسمع ما حولك. Escape تفتح عينيك.") + "</p></div>";
    eyes.hidden = false;
    const m = L("Eyes-closed mode. Listen to the pings, press N to walk to the next machine, then E.", "وضع العينين المغمضتين. استمع للنبضات، واضغط N لتمشي إلى الآلة التالية ثم E.");
    $("#live").textContent = m; say(m, "blind");
  }
  function eyesOff() { if (eyes.hidden) return; eyes.hidden = true; guide = (SET.prof || []).includes("blind") ? 1 : 0; ann(L("Eyes open.", "العينان مفتوحتان.")); }
  addEventListener("keydown", e => { if (e.code == "Escape" && !eyes.hidden) eyesOff(); }, true);
  function tryIt(k) {
    closeOv();
    setTimeout(() => {
      if (k == "lang") { setLang(LANG == "ar" ? "en" : "ar"); toast(L("Now in English. Every word in the museum switched.", "الآن بالعربية. تغيّرت كل كلمة في المتحف.")); }
      else if (k == "eyes") toSurface("mars", eyesOn);
      else if (k == "deaf") toSurface("mars", () => { SET.deaf = 1; SET.vis = 1; applySet(); if (!MUTE) muteT(); setTimeout(() => say(L("Captions are on and the sound is off. Everything spoken now appears here, and the arrow at the top points to the nearest machine. Press M to turn the sound back on.", "التعليقات تعمل والصوت مطفأ. كل ما يُقال يظهر هنا الآن، والسهم في الأعلى يدلّك على أقرب آلة. اضغط M لإعادة الصوت."), vm), 300); });
      else if (k == "recycle") openMachine("viking", a => { labSt = "r"; future(a); const t_ = $('#rt [data-v="u"]'); if (t_) t_.click(); });
      else if (k == "build") openMachine("viking", () => { const b = $("#v4tb"); if (b) b.click(); });
      else if (k == "size") openMachine("heli", () => { const b = $("#v4tc"); if (b) b.click(); });
    }, 60);
  }
  // toolbar button + start-screen link
  IC.why = '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>';
  bar.insertAdjacentHTML("afterbegin", '<button class="b" id="v4why">' + svg("why") + "</button>");
  $("#v4why").onclick = openWhy;
  $("#stb").insertAdjacentHTML("afterend", '<button class="chip v4whys" id="v4whyS"></button>');
  $("#v4whyS").onclick = () => { $("#start").style.display = "none"; fromStart = 1; openWhy(); };
  function why7Lang() {
    const t_ = L("Problems we solve", "المشكلات التي نحلّها"); const b = $("#v4why"); b.title = t_; b.setAttribute("aria-label", t_);
    $("#v4whyS").textContent = "🎯 " + L("Why this museum? Problems and solutions", "لماذا هذا المتحف؟ المشكلات والحلول");
  }
  const al7 = applyLang; applyLang = function () { al7(); why7Lang(); };
  why7Lang();
  V4.fx = () => FXC; // for diagnostics

  /* ---------- 6. Escape in full screen: a short press is for the museum (free the mouse, close a window); hold it to leave full screen ----------
     Keyboard Lock (Edge/Chrome) delivers Escape to the page while in full screen; the browser then exits only on a long press. */
  document.addEventListener("fullscreenchange", () => {
    const kb = navigator.keyboard;
    if (!kb || !kb.lock) return;
    if (document.fullscreenElement) kb.lock(["Escape"]).then(() => {
      toast(L("Full screen: press Esc to free the mouse or close a window. Hold Esc to leave full screen.", "ملء الشاشة: اضغط Esc لتحرير الماوس أو إغلاق نافذة، واضغط مطوّلاً على Esc للخروج من ملء الشاشة."));
    }).catch(e => console.info("Keyboard lock not available:", e));
    else try { kb.unlock(); } catch (e) {}
  });
  // with the key locked the browser no longer frees the mouse by itself, so do it here
  addEventListener("keydown", e => { if (e.code == "Escape" && document.pointerLockElement) document.exitPointerLock(); }, true);

  /* ---------- 7. A line with no recording and no Arabic computer voice on this device: show it instead of staying silent ---------- */
  const local0 = local; let noArWarned = 0;
  local = function (txt, kind) {
    if (LANG == "ar" && SS && !SS.getVoices().some(v => /^ar/i.test(v.lang))) {
      toast(txt);
      if (!noArWarned) { noArWarned = 1; console.info("No Arabic system voice: unrecorded Arabic lines are shown as captions."); }
      return new Promise(r => setTimeout(r, Math.min(9000, 1200 + String(txt).length * 55))); // keep stories and timelines paced as if spoken
    }
    return local0(txt, kind);
  };

  /* ---------- 8. Only one thing moves the visitor at a time: guided tour, auto-walk (N) and replay (R) stop each other ---------- */
  const tour0 = tourStart;
  tourStart = function () { if (RP) RP.end(); aw = null; tour0(); };
  const rp0 = replayStart;
  replayStart = function (a) { if (tour) tourStop(); aw = null; rp0(a); };
  V4.replay = replayStart;
  { const aw0 = autoWalk; autoWalk = function () { if (tour) tourStop(); if (RP) RP.end(); aw0(); }; }
  $("#btour").onclick = () => tourStart(); // the toolbar kept a reference to the old function
