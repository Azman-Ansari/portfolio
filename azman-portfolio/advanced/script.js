(function(){
  "use strict";

  /*PURE_START*/
  function mulberry32(a){ return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function gauss(r){ var u = 1 - r(), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

  // demand forecasting
  function makeSeries(noise, festival){
    var r = mulberry32(7), n = 84, y = [];
    for (var i = 0; i < n; i++){
      var z = gauss(r);
      var v = 40 + 0.14 * i + 6 * Math.sin(2 * Math.PI * (i % 7) / 7 - 1.2) + (festival ? 22 * Math.exp(-Math.pow((i - 62) / 3, 2)) : 0) + z * noise;
      y.push(Math.max(5, Math.round(v * 10) / 10));
    }
    return y;
  }
  var MODELS = {
    ma: function(y, h){ var m = Math.min(7, y.length), s = 0, o = [], i; for (i = y.length - m; i < y.length; i++) s += y[i]; for (i = 0; i < h; i++) o.push(s / m); return o; },
    es: function(y, h){ var a = .3, l = y[0], o = [], i; for (i = 1; i < y.length; i++) l = a * y[i] + (1 - a) * l; for (i = 0; i < h; i++) o.push(l); return o; },
    ts: function(y, h){
      var n = y.length, sx = 0, sy = 0, sxx = 0, sxy = 0, i;
      for (i = 0; i < n; i++){ sx += i; sy += y[i]; sxx += i * i; sxy += i * y[i]; }
      var b = (n * sxy - sx * sy) / (n * sxx - sx * sx), a = (sy - b * sx) / n;
      var sum = [0,0,0,0,0,0,0], cnt = [0,0,0,0,0,0,0], o = [];
      for (i = 0; i < n; i++){ sum[i % 7] += y[i] - (a + b * i); cnt[i % 7]++; }
      for (i = 0; i < h; i++){ var t = n + i; o.push(a + b * t + sum[t % 7] / cnt[t % 7]); }
      return o;
    }
  };
  function maeOf(p, a){ var s = 0; for (var i = 0; i < p.length; i++) s += Math.abs(p[i] - a[i]); return s / p.length; }
  function backtest(y, key){
    var hold = 14, pred = MODELS[key](y.slice(0, y.length - hold), hold);
    return { pred: pred, mae: maeOf(pred, y.slice(y.length - hold)) };
  }

  // customer segmentation
  function makeCustomers(){
    var r = mulberry32(21), pts = [];
    [[8,900,26,1.2,140],[9,250,36,1.3,50],[2,1100,24,.7,160],[1.2,220,34,.6,55]].forEach(function(b){
      for (var i = 0; i < b[2]; i++) pts.push({ f: Math.max(.3, b[0] + gauss(r) * b[3]), b: Math.max(60, b[1] + gauss(r) * b[4]) });
    });
    var fmin = Infinity, fmax = -Infinity, bmin = Infinity, bmax = -Infinity;
    pts.forEach(function(p){ fmin = Math.min(fmin, p.f); fmax = Math.max(fmax, p.f); bmin = Math.min(bmin, p.b); bmax = Math.max(bmax, p.b); });
    pts.forEach(function(p){ p.x = (p.f - fmin) / (fmax - fmin); p.y = (p.b - bmin) / (bmax - bmin); });
    return pts;
  }
  function kmInit(pts, k, seed){
    var r = mulberry32(seed), p0 = pts[Math.floor(r() * pts.length)], c = [{ x:p0.x, y:p0.y }];
    while (c.length < k){
      var d2 = pts.map(function(p){ var m = Infinity; c.forEach(function(q){ m = Math.min(m, (p.x - q.x) * (p.x - q.x) + (p.y - q.y) * (p.y - q.y)); }); return m; });
      var tot = d2.reduce(function(a, b){ return a + b; }, 0), t = r() * tot, i = 0;
      while (i < d2.length - 1 && t > d2[i]){ t -= d2[i]; i++; }
      c.push({ x:pts[i].x, y:pts[i].y });
    }
    return { cent:c, assign:pts.map(function(){ return -1; }), iter:0, done:false };
  }
  function kmStep(st, pts){
    var changed = false;
    pts.forEach(function(p, i){
      var best = 0, bd = Infinity;
      st.cent.forEach(function(c, j){ var d = (p.x - c.x) * (p.x - c.x) + (p.y - c.y) * (p.y - c.y); if (d < bd){ bd = d; best = j; } });
      if (st.assign[i] !== best){ changed = true; st.assign[i] = best; }
    });
    var sx = st.cent.map(function(){ return 0; }), sy = sx.slice(), n = sx.slice();
    pts.forEach(function(p, i){ var a = st.assign[i]; sx[a] += p.x; sy[a] += p.y; n[a]++; });
    st.cent = st.cent.map(function(c, j){ return n[j] ? { x:sx[j] / n[j], y:sy[j] / n[j] } : c; });
    st.iter++;
    if (!changed) st.done = true;
    return changed;
  }

  // go-hybrid projection
  function sCurve(t){ var raw = function(x){ return 1 / (1 + Math.exp(-(x - 4.5) * .9)); }, b = raw(0); return (raw(t) - b) / (1 - b); }
  function roiProject(p){
    var rows = [], cum = 0, lastNeg = 0;
    for (var t = 1; t <= 12; t++){
      var o = p.r0 * p.uplift * sCurve(t), c = p.r0 - .2 * o, tot = o + c;
      var profit = p.margin * tot - p.cost * o - p.ads - (t === 1 ? p.setup : 0);
      var extra = profit - p.margin * p.r0;
      cum += extra;
      if (cum < 0) lastNeg = t;
      rows.push({ t:t, o:o, c:c, extra:extra, cum:cum });
    }
    return { rows:rows, payback: lastNeg === 12 ? null : lastNeg + 1 };
  }
  /*PURE_END*/

  /* ---------- helpers ---------- */
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var $ = function(s, r){ return (r || document).querySelector(s); };
  var $$ = function(s, r){ return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var inr = function(n){ return "₹" + Math.round(n).toLocaleString("en-IN"); };
  var inrC = function(n){ var a = Math.abs(n), s = n < 0 ? "-" : ""; return a >= 1e5 ? s + "₹" + (a / 1e5).toFixed(1) + "L" : a >= 1e3 ? s + "₹" + Math.round(a / 1e3) + "k" : s + "₹" + Math.round(a); };
  var sleep = function(ms){ return new Promise(function(r){ setTimeout(r, ms); }); };
  var root = document.documentElement;
  var tok = function(n){ return getComputedStyle(root).getPropertyValue(n).trim(); };
  var isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  $("#kbdHint").textContent = $("#kbdHint2").textContent = isMac ? "⌘ K" : "Ctrl K";
  $("#yr").textContent = new Date().getFullYear();
  $("#kDate").textContent = new Date().toLocaleDateString("en-IN", { weekday:"short", day:"numeric", month:"short" });

  var toastEl = $("#toast"), toastT;
  function toast(m){ toastEl.textContent = m; toastEl.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(function(){ toastEl.classList.remove("show"); }, 2600); }

  function tween(el, to, fmt){
    var from = el._v || 0; el._v = to;
    if (reduce || from === to){ el.textContent = fmt(to); return; }
    var t0 = performance.now();
    (function step(t){ var k = Math.min(1, (t - t0) / 600), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(from + (to - from) * e); if (k < 1) requestAnimationFrame(step); })(t0);
  }
  function openDlg(d){ if (d.showModal) d.showModal(); else d.setAttribute("open", ""); }
  function closeDlg(d){ if (d.close) d.close(); else d.removeAttribute("open"); }
  $$("dialog").forEach(function(d){ d.addEventListener("click", function(e){ if (e.target === d) closeDlg(d); }); });

  /* ---------- coin and sparkle bursts ---------- */
  var fx = $("#fx"), fctx = fx.getContext("2d"), parts = [], fxRaf = 0;
  function fxSize(){ var d = Math.min(2, window.devicePixelRatio || 1); fx.width = Math.round(window.innerWidth * d); fx.height = Math.round(window.innerHeight * d); fctx.setTransform(d, 0, 0, d, 0, 0); }
  fxSize(); window.addEventListener("resize", fxSize);
  function burst(x, y, n){
    if (reduce) return;
    var cols = [tok("--counter"), tok("--online"), tok("--k3"), tok("--k4")], i;
    for (i = 0; i < n; i++){
      var a = Math.random() * 6.283, sp = 2 + Math.random() * 5;
      parts.push({ x:x, y:y, vx:Math.cos(a) * sp, vy:Math.sin(a) * sp - 3, c:cols[i % 4], coin:i % 3 === 0, life:1, rot:Math.random() * 6 });
    }
    if (!fxRaf) fxRaf = requestAnimationFrame(fxLoop);
  }
  function fxLoop(){
    fctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    parts = parts.filter(function(p){ return p.life > 0 && p.y < window.innerHeight + 20; });
    var bg = tok("--bg");
    parts.forEach(function(p){
      p.vy += .18; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.life -= .012; p.rot += .15;
      fctx.globalAlpha = Math.min(1, p.life * 1.6); fctx.fillStyle = p.c;
      if (p.coin){ fctx.beginPath(); fctx.arc(p.x, p.y, 8, 0, 6.283); fctx.fill(); fctx.fillStyle = bg; fctx.font = "700 10px 'IBM Plex Mono', monospace"; fctx.textAlign = "center"; fctx.textBaseline = "middle"; fctx.fillText("₹", p.x, p.y + .5); }
      else { fctx.save(); fctx.translate(p.x, p.y); fctx.rotate(p.rot); fctx.fillRect(-3, -3, 6, 6); fctx.restore(); }
    });
    fctx.globalAlpha = 1;
    if (parts.length) fxRaf = requestAnimationFrame(fxLoop); else { fxRaf = 0; fctx.clearRect(0, 0, window.innerWidth, window.innerHeight); }
  }
  function celebrate(){
    toast("Festive sales all round!");
    for (var i = 0; i < 5; i++) (function(k){ setTimeout(function(){ burst(window.innerWidth * (.15 + Math.random() * .7), window.innerHeight * (.25 + Math.random() * .35), 34); }, k * 180); })(i);
  }

  /* ---------- ticker of sample shop signals ---------- */
  (function(){
    var T = [["counter","Sample signals",1],["online","Chai stock cover 4.3 days"],["counter","Festival demand +22%"],["online","3 online orders waiting"],["counter","UPI settled ₹2,340"],["online","Reorder Mustard Oil about 22 units"],["counter","Walk-in 62% · Online 38%"],["online","Repeat customers up this week"]];
    var one = T.map(function(t){ return '<span class="tk' + (t[2] ? " lead" : "") + '"><i style="background:var(--' + t[0] + ')"></i>' + t[1] + '</span>'; }).join("");
    $("#tkTrack").innerHTML = one + one;
  })();

  /* canvas */
  function setup(c){
    var w = c.clientWidth, h = c.clientHeight;
    if (w < 10 || h < 10) return null;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    if (c._w !== w || c._h !== h || c._d !== dpr){ c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); c._w = w; c._h = h; c._d = dpr; }
    var ctx = c.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    return { ctx:ctx, w:w, h:h };
  }
  var FONT = "11px 'IBM Plex Mono', monospace";
  var redraws = {};
  function redrawAll(){ Object.keys(redraws).forEach(function(k){ redraws[k](); }); }
  if ("ResizeObserver" in window){ var ro = new ResizeObserver(function(){ redrawAll(); }); }

  /* ---------- theme ---------- */
  try { var sv = localStorage.getItem("aa-theme2"); if (sv) root.setAttribute("data-theme", sv); } catch(e){}
  function toggleTheme(){
    var cur = root.getAttribute("data-theme") || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    var nx = cur === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", nx);
    try { localStorage.setItem("aa-theme2", nx); } catch(e){}
    setTimeout(function(){ redrawAll(); }, 30);
  }
  $("#themeBtn").addEventListener("click", toggleTheme);
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener && window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function(){ setTimeout(redrawAll, 30); });

  /* ---------- progress, spy, reveal ---------- */
  var prog = $("#prog"), tl = $("#tl"), tlFill = $("#tlFill"), tlItems = $$("#tl li"), ticking = false;
  function onScroll(){
    var h = document.documentElement.scrollHeight - window.innerHeight;
    prog.style.transform = "scaleX(" + (h > 0 ? Math.min(1, window.scrollY / h) : 0) + ")";
    var r = tl.getBoundingClientRect(), mid = window.innerHeight * .6;
    var fill = Math.max(0, Math.min(r.height - 12, mid - r.top));
    tlFill.style.height = fill + "px";
    tlItems.forEach(function(li){ var t = li.getBoundingClientRect().top; li.classList.toggle("on", t < mid); });
    ticking = false;
  }
  window.addEventListener("scroll", function(){ if (!ticking){ ticking = true; requestAnimationFrame(onScroll); } }, { passive:true });
  window.addEventListener("resize", onScroll);
  onScroll();
  var links = $$(".links a");
  if ("IntersectionObserver" in window){
    var spy = new IntersectionObserver(function(es){
      es.forEach(function(en){ if (en.isIntersecting){ links.forEach(function(a){ a.setAttribute("aria-current", a.getAttribute("href") === "#" + en.target.id ? "true" : "false"); }); } });
    }, { rootMargin:"-45% 0px -50% 0px" });
    $$("main section[id]").forEach(function(s){ spy.observe(s); });
    if (!reduce){
      var io = new IntersectionObserver(function(es){ es.forEach(function(en){ if (en.isIntersecting){ en.target.classList.add("in"); io.unobserve(en.target); } }); }, { threshold:.12 });
      $$(".reveal").forEach(function(el){ if (el.getBoundingClientRect().top < window.innerHeight) return; io.observe(el); });
    }
  }

  /* ---------- hero: network canvas ---------- */
  var net = $("#net"), nodes = [], pulses = [], mouse = null, netOn = true, lastPulse = 0;
  function initNodes(){
    var w = net.clientWidth, h = net.clientHeight, n = Math.round(Math.min(70, w * h / 16000)), r = mulberry32(3);
    nodes = [];
    for (var i = 0; i < n; i++) nodes.push({ x:r() * w, y:r() * h, vx:(r() - .5) * .3, vy:(r() - .5) * .3, t:r() < .5 ? 0 : 1 });
  }
  function drawNet(ts){
    var s = setup(net); if (!s) return;
    var ctx = s.ctx, w = s.w, h = s.h, cc = tok("--counter"), oc = tok("--online"), ln = tok("--line"), ink = tok("--ink"), i, j;
    nodes.forEach(function(n){
      if (!reduce){
        n.x += n.vx; n.y += n.vy;
        if (n.x < 0){ n.x = 0; n.vx = Math.abs(n.vx); } else if (n.x > w){ n.x = w; n.vx = -Math.abs(n.vx); }
        if (n.y < 0){ n.y = 0; n.vy = Math.abs(n.vy); } else if (n.y > h){ n.y = h; n.vy = -Math.abs(n.vy); }
        if (mouse){ var dx = mouse.x - n.x, dy = mouse.y - n.y, d = Math.sqrt(dx * dx + dy * dy); if (d < 140 && d > 1){ n.x += dx / d * .35; n.y += dy / d * .35; } }
      }
    });
    ctx.lineWidth = 1;
    var near = [];
    for (i = 0; i < nodes.length; i++) for (j = i + 1; j < nodes.length; j++){
      var a = nodes[i], b = nodes[j], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < 120){ ctx.globalAlpha = (1 - d / 120) * .9; ctx.strokeStyle = ln; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); if (d < 80) near.push([i, j]); }
    }
    ctx.globalAlpha = 1;
    if (mouse){ nodes.forEach(function(n){ var d = Math.hypot(mouse.x - n.x, mouse.y - n.y); if (d < 140){ ctx.globalAlpha = (1 - d / 140) * .8; ctx.strokeStyle = oc; ctx.beginPath(); ctx.moveTo(mouse.x, mouse.y); ctx.lineTo(n.x, n.y); ctx.stroke(); } }); ctx.globalAlpha = 1; }
    if (!reduce && ts - lastPulse > 700 && near.length){ lastPulse = ts; var pr = near[Math.floor(Math.random() * near.length)]; pulses.push({ a:pr[0], b:pr[1], p:0 }); if (pulses.length > 8) pulses.shift(); }
    pulses = pulses.filter(function(q){ return q.p < 1; });
    pulses.forEach(function(q){ q.p += .02; var a = nodes[q.a], b = nodes[q.b]; ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(a.x + (b.x - a.x) * q.p, a.y + (b.y - a.y) * q.p, 3, 0, 6.283); ctx.fill(); });
    nodes.forEach(function(n){ ctx.fillStyle = n.t ? oc : cc; ctx.beginPath(); ctx.arc(n.x, n.y, 3, 0, 6.283); ctx.fill(); });
  }
  function netLoop(ts){ if (netOn){ drawNet(ts || 0); } requestAnimationFrame(netLoop); }
  initNodes();
  if (reduce){ drawNet(0); redraws.net = function(){ initNodes(); drawNet(0); }; }
  else { requestAnimationFrame(netLoop); }
  if (!reduce){ redraws.net = function(){ if (!nodes.length || net._w !== net.clientWidth) initNodes(); }; }
  $(".hero").addEventListener("pointermove", function(e){ var r = net.getBoundingClientRect(); mouse = { x:e.clientX - r.left, y:e.clientY - r.top }; });
  $(".hero").addEventListener("pointerleave", function(){ mouse = null; });
  if ("IntersectionObserver" in window) new IntersectionObserver(function(es){ netOn = es[0].isIntersecting; }).observe($(".hero"));
  if (ro) ro.observe($(".hero"));

  /* ---------- hero: typed line ---------- */
  var PH = ["forecasting models", "customer insight tools", "hybrid sales dashboards", "simple ML products for shops"], typed = $("#typed");
  if (!reduce){
    var pi = 0, ci = 0, del = false;
    (function tick(){
      var ph = PH[pi];
      typed.textContent = ph.slice(0, ci);
      var wait = del ? 28 : 55;
      if (!del && ci === ph.length){ del = true; wait = 1500; }
      else if (del && ci === 0){ del = false; pi = (pi + 1) % PH.length; wait = 350; }
      else ci += del ? -1 : 1;
      setTimeout(tick, wait);
    })();
  }

  /* ---------- hero: ledger feed ---------- */
  var FEED = [
    ["09:12","counter","2 × Masala Chai, 3 × Notebook",420],["09:48","online","Basmati Rice 5 kg, 2 × Turmeric",660],
    ["10:20","counter","Mustard Oil 1 L, Masala Chai",305],["11:05","online","4 × Notebook, 2 × Masala Chai",480],
    ["11:40","counter","Turmeric, 2 × Notebook",210],["12:15","online","2 × Mustard Oil 1 L",370],
    ["12:52","counter","3 × Masala Chai",360],["13:30","online","Basmati Rice 5 kg",480],
    ["14:05","counter","5 × Notebook",300],["14:41","online","Masala Chai, Turmeric, Notebook",270]
  ];
  var kRows = $("#kRows"), kTotal = $("#kTotal"), kSum = 0, kIdx = 0;
  function kRow(r, fresh){
    var li = document.createElement("li"); li.className = "krow" + (fresh ? " fresh" : "");
    li.innerHTML = '<span class="t">' + r[0] + '</span><span class="pill ' + r[1] + '">' + (r[1] === "counter" ? "Counter" : "Online") + '</span><span class="d">' + r[2] + '</span><span class="a">' + inr(r[3]) + '</span>';
    return li;
  }
  for (; kIdx < 5; kIdx++){ kRows.appendChild(kRow(FEED[kIdx], false)); kSum += FEED[kIdx][3]; }
  tween(kTotal, kSum, inr);
  if (!reduce) setInterval(function(){
    if (document.hidden) return;
    var r = FEED[kIdx % FEED.length]; kIdx++;
    kRows.insertBefore(kRow(r, true), kRows.firstChild);
    if (kRows.children.length > 5) kRows.removeChild(kRows.lastChild);
    kSum += r[3]; tween(kTotal, kSum, inr);
  }, 3200);

  /* click or tap the hero to make a sale */
  var AMTS = [60, 90, 120, 180, 240, 310, 360, 480, 540, 720], ITEMS = ["Masala Chai", "Notebook", "Turmeric", "Mustard Oil 1 L", "Basmati Rice 5 kg"];
  $(".hero").addEventListener("click", function(e){
    if (e.target.closest("a,button")) return;
    var amt = AMTS[Math.floor(Math.random() * AMTS.length)], ch = Math.random() < .5 ? "counter" : "online", it = ITEMS[Math.floor(Math.random() * ITEMS.length)];
    kRows.insertBefore(kRow([new Date().toLocaleTimeString("en-GB", { hour:"2-digit", minute:"2-digit" }), ch, "You sold " + it, amt], true), kRows.firstChild);
    if (kRows.children.length > 5) kRows.removeChild(kRows.lastChild);
    kSum += amt; tween(kTotal, kSum, inr);
    if (reduce) return;
    burst(e.clientX, e.clientY, 22);
    var p = document.createElement("div"); p.className = "pop"; p.textContent = "+" + inr(amt); p.style.left = e.clientX + "px"; p.style.top = e.clientY + "px";
    document.body.appendChild(p); p.addEventListener("animationend", function(){ p.remove(); }); setTimeout(function(){ p.remove(); }, 1400);
  });

  /* ---------- projects + case studies ---------- */
  var PROJECTS = [
    { id:"books", cat:"web", pill:"counter", tag:"Counter + Online", status:"Live demo in the lab", title:"Hybrid Sales Books",
      blurb:"One ledger for walk-in and online orders, with GST, delivery rules and stock updated as each sale is recorded.",
      problem:"Shops that start selling online end up with two sets of records: a notebook at the counter and an app for orders. Nobody sees the full picture.",
      approach:["Record both channels in one transaction ledger","Apply GST and delivery rules automatically","Update stock and revenue split the moment a sale completes"],
      build:"A small web app a shop owner can open on a phone, working offline-first and syncing later.", stack:["HTML","CSS","JavaScript"], tab:"co" },
    { id:"stock", cat:"forecasting", pill:"online", tag:"Forecasting", status:"Demo in the lab", title:"Kirana Stock Forecaster",
      blurb:"Predicts weekly demand per item from past sales and festivals, then suggests how much to reorder.",
      problem:"Small shops either run out of fast-moving items or lock cash in slow ones, because reordering is done by feel.",
      approach:["Compare a simple average, exponential smoothing and a trend plus weekday model","Pick the model with the lowest error on the most recent two weeks","Turn the forecast into a reorder quantity with a week of cover"],
      build:"A Python notebook first, then a one-page tool that reads a CSV export of daily sales.", stack:["Python","pandas","Time series"], tab:"fc" },
    { id:"radar", cat:"customers", pill:"counter", tag:"Customers", status:"Demo in the lab", title:"Repeat Customer Radar",
      blurb:"Groups customers by how often and how much they buy, then drafts the right message for each group.",
      problem:"Regulars quietly stop coming and the shop only notices months later. Every customer gets the same offer, or none at all.",
      approach:["Describe each customer by orders per month and average basket","Group them with k-means and name each group in plain words","Attach an action to each group: loyalty, bundle, refill reminder, win-back"],
      build:"A segment report plus ready-to-send WhatsApp message drafts for each group.", stack:["scikit-learn","Segmentation","SQL"], tab:"seg" },
    { id:"price", cat:"pricing", pill:"online", tag:"Pricing", status:"Demo in the lab", title:"Festival Price Advisor",
      blurb:"Shows how demand moves around Diwali and Eid, and what going online is worth in profit.",
      problem:"Owners guess whether online sales are worth the ad spend, delivery cost and effort, and whether prices should move at festival time.",
      approach:["Model online sales as a ramp that adds new customers and shifts some old ones","Subtract delivery, platform and ad costs from the extra margin","Show the month when the extra profit pays back the setup cost"],
      build:"A calculator and festival demand chart a shop owner can try with their own numbers.", stack:["Regression","Dashboards","Excel"], tab:"roi" }
  ];
  var grid = $("#projGrid");
  grid.innerHTML = PROJECTS.map(function(p, i){
    return '<button class="proj reveal" type="button" data-id="' + p.id + '" data-cat="' + p.cat + '" style="--d:' + (i % 2 * .06) + 's"><span class="proj-top"><span class="pill ' + p.pill + '">' + p.tag + '</span><span class="status">' + p.status + '</span></span><h3>' + p.title + '</h3><p>' + p.blurb + '</p><span class="tags">' + p.stack.map(function(s){ return '<span class="tag">' + s + '</span>'; }).join("") + '</span><span class="more">Read the case study →</span></button>';
  }).join("");
  $$(".fbtn").forEach(function(b){
    b.addEventListener("click", function(){
      $$(".fbtn").forEach(function(x){ x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
      var f = b.getAttribute("data-f");
      $$(".proj", grid).forEach(function(c){ c.hidden = !(f === "all" || c.getAttribute("data-cat") === f); });
    });
  });
  function openCase(id){
    var p = PROJECTS.filter(function(x){ return x.id === id; })[0]; if (!p) return;
    $("#caseBody").innerHTML = '<div class="dlg-h"><div><span class="pill ' + p.pill + '">' + p.tag + '</span><h3 id="caseTitle" style="margin-top:12px">' + p.title + '</h3></div><button class="x" type="button" data-close aria-label="Close">×</button></div>' +
      '<div><h4>The problem</h4><p>' + p.problem + '</p></div><div><h4>Approach</h4><ul>' + p.approach.map(function(a){ return "<li>" + a + "</li>"; }).join("") + '</ul></div>' +
      '<div><h4>What I will ship</h4><p>' + p.build + '</p></div><div class="tags">' + p.stack.map(function(s){ return '<span class="tag">' + s + '</span>'; }).join("") + '</div>' +
      '<div><button class="btn" type="button" data-lab="' + p.tab + '">Try it in the lab →</button></div>';
    openDlg($("#case"));
  }
  grid.addEventListener("click", function(e){ var c = e.target.closest(".proj"); if (c) openCase(c.getAttribute("data-id")); });
  $("#case").addEventListener("click", function(e){
    if (e.target.closest("[data-close]")) closeDlg($("#case"));
    var l = e.target.closest("[data-lab]"); if (l){ closeDlg($("#case")); goLab(l.getAttribute("data-lab")); }
  });

  /* ---------- lab tabs ---------- */
  var TABS = ["fc", "seg", "roi", "co"];
  function showTab(id){
    TABS.forEach(function(t){
      var sel = t === id;
      $("#tab-" + t).setAttribute("aria-selected", sel ? "true" : "false"); $("#tab-" + t).tabIndex = sel ? 0 : -1;
      $("#pane-" + t).hidden = !sel;
    });
    requestAnimationFrame(redrawAll);
  }
  function goLab(id){ showTab(id); $("#lab").scrollIntoView({ behavior: reduce ? "auto" : "smooth" }); }
  $$(".tab").forEach(function(t){
    t.addEventListener("click", function(){ showTab(t.getAttribute("data-tab")); });
    t.addEventListener("keydown", function(e){
      var i = TABS.indexOf(t.getAttribute("data-tab")), n = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : null;
      if (n === null) return; e.preventDefault(); n = (n + TABS.length) % TABS.length; showTab(TABS[n]); $("#tab-" + TABS[n]).focus();
    });
  });

  /* ---------- lab 1: forecast ---------- */
  var fc = { model:"ts", h:14, noise:5, fest:true, hover:null, y:[], bt:{}, fut:[] }, cvFc = $("#cvFc");
  var MNAME = { ma:"7-day average", es:"Smoothing", ts:"Trend + weekday" };
  function fcCompute(){
    fc.y = makeSeries(fc.noise, fc.fest);
    ["ma","es","ts"].forEach(function(k){ fc.bt[k] = backtest(fc.y, k); });
    fc.fut = MODELS[fc.model](fc.y, fc.h);
  }
  function fcText(){
    var best = "ma"; ["es","ts"].forEach(function(k){ if (fc.bt[k].mae < fc.bt[best].mae) best = k; });
    var worst = Math.max(fc.bt.ma.mae, fc.bt.es.mae, fc.bt.ts.mae);
    $("#mcards").innerHTML = ["ma","es","ts"].map(function(k){
      return '<div class="mcard" data-sel="' + (k === fc.model) + '"><span class="k"><span>' + MNAME[k] + '</span>' + (k === best ? '<span class="pill ok">Best</span>' : "") + '</span><span class="v">' + fc.bt[k].mae.toFixed(1) + ' <span class="muted" style="font:400 .75rem var(--font-body)">units off per day</span></span><span class="bar-track"><i style="width:' + Math.max(4, fc.bt[k].mae / worst * 100) + '%"></i></span></div>';
    }).join("");
    var wk = 0; for (var i = 0; i < Math.min(7, fc.fut.length); i++) wk += fc.fut[i];
    $("#fcSum").textContent = MNAME[fc.model] + " expects about " + Math.round(wk) + " units over the next 7 days (typical error ±" + fc.bt[fc.model].mae.toFixed(1) + " a day).";
    $("#fcInsight").textContent = best === fc.model
      ? "Model selection: " + MNAME[best] + " has the lowest error on the last 14 days, so it is the one I would trust for reordering."
      : "Model selection: " + MNAME[best] + " has a lower error (" + fc.bt[best].mae.toFixed(1) + " vs " + fc.bt[fc.model].mae.toFixed(1) + " units a day). Try it.";
    cvFc.setAttribute("aria-label", "Line chart of 84 days of sales with a " + fc.h + "-day forecast from the " + MNAME[fc.model] + " model. " + $("#fcSum").textContent);
  }
  function drawForecast(){
    var s = setup(cvFc); if (!s || !fc.y.length) return;
    var ctx = s.ctx, w = s.w, h = s.h, n = fc.y.length, H = fc.h, N = n + H, pad = { l:42, r:14, t:14, b:28 };
    var m = fc.bt[fc.model].mae, pred = fc.bt[fc.model].pred, fut = fc.fut;
    var maxV = Math.max.apply(null, fc.y.concat(fut.map(function(v){ return v + m; }))), top = Math.ceil(maxV * 1.05 / 10) * 10;
    var X = function(i){ return pad.l + i * (w - pad.l - pad.r) / (N - 1); }, Y = function(v){ return pad.t + (1 - v / top) * (h - pad.t - pad.b); };
    var ln = tok("--line"), mu = tok("--muted"), ink = tok("--ink"), cc = tok("--counter"), oc = tok("--online"), sf = tok("--surface-2"), i;
    ctx.font = FONT; ctx.textBaseline = "middle";
    for (i = 0; i <= 4; i++){ var yv = top * i / 4, yy = Y(yv); ctx.strokeStyle = ln; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(pad.l, yy); ctx.lineTo(w - pad.r, yy); ctx.stroke(); ctx.fillStyle = mu; ctx.textAlign = "right"; ctx.fillText(Math.round(yv), pad.l - 8, yy); }
    ctx.fillStyle = sf; ctx.fillRect(X(n - 14), pad.t, X(n - 1) - X(n - 14), h - pad.t - pad.b);
    ctx.fillStyle = mu; ctx.textAlign = "center"; ctx.textBaseline = "top";
    for (i = 0; i < N; i += 14){ ctx.fillText(i + 1, X(i), h - pad.b + 8); }
    ctx.fillText("day", w - pad.r - 8, h - pad.b + 8 + 0);
    ctx.textAlign = "left"; ctx.fillText("backtest", X(n - 14) + 4, pad.t + 2);
    ctx.setLineDash([3, 4]); ctx.strokeStyle = mu; ctx.beginPath(); ctx.moveTo(X(n - 1), pad.t); ctx.lineTo(X(n - 1), h - pad.b); ctx.stroke(); ctx.setLineDash([]);
    ctx.textAlign = "left"; ctx.fillText("today", X(n - 1) + 4, pad.t + 14);
    // band
    ctx.globalAlpha = .18; ctx.fillStyle = oc; ctx.beginPath(); ctx.moveTo(X(n - 1), Y(fc.y[n - 1]));
    for (i = 0; i < H; i++) ctx.lineTo(X(n + i), Y(fut[i] + m));
    for (i = H - 1; i >= 0; i--) ctx.lineTo(X(n + i), Y(Math.max(0, fut[i] - m)));
    ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
    // actual
    ctx.strokeStyle = ink; ctx.lineWidth = 1.75; ctx.lineJoin = "round"; ctx.beginPath();
    fc.y.forEach(function(v, j){ j ? ctx.lineTo(X(j), Y(v)) : ctx.moveTo(X(j), Y(v)); }); ctx.stroke();
    // backtest
    ctx.strokeStyle = cc; ctx.lineWidth = 2.25; ctx.setLineDash([6, 4]); ctx.beginPath();
    pred.forEach(function(v, j){ var x = X(n - 14 + j); j ? ctx.lineTo(x, Y(v)) : ctx.moveTo(x, Y(v)); }); ctx.stroke(); ctx.setLineDash([]);
    // forecast
    ctx.strokeStyle = oc; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(X(n - 1), Y(fc.y[n - 1]));
    fut.forEach(function(v, j){ ctx.lineTo(X(n + j), Y(v)); }); ctx.stroke();
    ctx.fillStyle = oc; ctx.beginPath(); ctx.arc(X(N - 1), Y(fut[H - 1]), 4, 0, 6.283); ctx.fill();
    // hover
    var hi = fc.hover;
    if (hi !== null){
      hi = Math.max(0, Math.min(N - 1, hi));
      var lines = [], val;
      if (hi < n){ lines.push("Day " + (hi + 1) + ": " + fc.y[hi].toFixed(0) + " units"); if (hi >= n - 14) lines.push("Model: " + pred[hi - (n - 14)].toFixed(0)); val = fc.y[hi]; }
      else { lines.push("Day " + (hi + 1) + ": about " + fut[hi - n].toFixed(0)); lines.push("± " + m.toFixed(1)); val = fut[hi - n]; }
      ctx.strokeStyle = mu; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X(hi), pad.t); ctx.lineTo(X(hi), h - pad.b); ctx.stroke();
      ctx.fillStyle = hi < n ? ink : oc; ctx.beginPath(); ctx.arc(X(hi), Y(val), 4, 0, 6.283); ctx.fill();
      ctx.font = FONT; var tw = 0; lines.forEach(function(t){ tw = Math.max(tw, ctx.measureText(t).width); });
      var bw = tw + 16, bh = lines.length * 16 + 10, bx = X(hi) + 10; if (bx + bw > w - 4) bx = X(hi) - bw - 10; var by = pad.t + 24;
      ctx.fillStyle = ink; ctx.fillRect(bx, by, bw, bh); ctx.fillStyle = tok("--bg"); ctx.textAlign = "left"; ctx.textBaseline = "top";
      lines.forEach(function(t, k){ ctx.fillText(t, bx + 8, by + 6 + k * 16); });
    }
  }
  redraws.fc = drawForecast;
  function fcUpdate(){ fcCompute(); fcText(); drawForecast(); }
  function fcHover(e){
    var r = cvFc.getBoundingClientRect(), x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left, N = fc.y.length + fc.h;
    fc.hover = Math.round((x - 42) / (r.width - 56) * (N - 1)); drawForecast();
  }
  cvFc.addEventListener("pointermove", fcHover); cvFc.addEventListener("pointerleave", function(){ fc.hover = null; drawForecast(); });
  $$("[data-m]").forEach(function(b){ b.addEventListener("click", function(){ fc.model = b.getAttribute("data-m"); $$("[data-m]").forEach(function(x){ x.setAttribute("aria-pressed", x === b ? "true" : "false"); }); fcUpdate(); }); });
  $("#fcH").addEventListener("input", function(e){ fc.h = +e.target.value; $("#oH").textContent = fc.h + " days"; fcUpdate(); });
  $("#fcN").addEventListener("input", function(e){ fc.noise = +e.target.value; $("#oN").textContent = fc.noise; fcUpdate(); });
  $("#fcF").addEventListener("change", function(e){
    fc.fest = e.target.checked; fcUpdate();
    if (fc.fest){ var r = e.target.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 2, 18); }
  });
  if (ro) ro.observe(cvFc);

  /* ---------- lab 2: k-means ---------- */
  var cvSeg = $("#cvSeg"), pts = makeCustomers(), seg = { k:4, seed:5, st:null, disp:[], running:false, trails:[] };
  var KC = ["--k1","--k2","--k3","--k4","--k5"];
  var med = function(a){ var s = a.slice().sort(function(x, y){ return x - y; }); return s[Math.floor(s.length / 2)]; };
  var medF = med(pts.map(function(p){ return p.f; })), medB = med(pts.map(function(p){ return p.b; }));
  var fMin = Math.min.apply(null, pts.map(function(p){ return p.f; })), fMax = Math.max.apply(null, pts.map(function(p){ return p.f; }));
  var bMin = Math.min.apply(null, pts.map(function(p){ return p.b; })), bMax = Math.max.apply(null, pts.map(function(p){ return p.b; }));
  function segReset(){
    seg.st = kmInit(pts, seg.k, seg.seed); seg.disp = seg.st.cent.map(function(c){ return { x:c.x, y:c.y }; });
    seg.trails = seg.st.cent.map(function(c){ return [{ x:c.x, y:c.y }]; }); segInfo(); segAnim();
  }
  function segName(f, b){
    var hf = f >= medF, hb = b >= medB;
    return hf && hb ? ["Loyal big spenders", "Early access and loyalty points"] : hf ? ["Regulars, small baskets", "Bundle offers to raise the basket"] : hb ? ["Occasional big baskets", "Refill reminder before they run out"] : ["Quiet or at risk", "Win-back message with a small offer"];
  }
  function segInfo(){
    var st = seg.st, rows = "", has = st.iter > 0;
    st.cent.forEach(function(c, j){
      var m = pts.filter(function(p, i){ return st.assign[i] === j; });
      if (!has || !m.length){ return; }
      var f = m.reduce(function(a, p){ return a + p.f; }, 0) / m.length, b = m.reduce(function(a, p){ return a + p.b; }, 0) / m.length, nm = segName(f, b);
      rows += '<tr><td><span class="sw" style="background:var(' + KC[j] + ')"></span>' + nm[0] + '</td><td>' + m.length + '</td><td>' + f.toFixed(1) + '</td><td>' + inr(b) + '</td><td>' + nm[1] + '</td></tr>';
    });
    $("#segTbl").innerHTML = rows || '<tr><td colspan="5" class="muted">Press Step or Run to start grouping.</td></tr>';
    $("#segStatus").textContent = st.done ? "Converged after " + (st.iter - 1) + " updates: no customer changed segment on the last pass." : st.iter ? "Iteration " + st.iter + ": each customer joins the nearest centre, then each centre moves to the middle of its group." : "Centres start at random customers (k-means++). 120 sample customers, shown by orders per month and average basket.";
  }
  function drawSeg(){
    var s = setup(cvSeg); if (!s) return;
    var ctx = s.ctx, w = s.w, h = s.h, pad = { l:52, r:16, t:14, b:38 }, ln = tok("--line"), mu = tok("--muted"), sf = tok("--surface"), ink = tok("--ink"), i;
    var X = function(v){ return pad.l + v * (w - pad.l - pad.r); }, Y = function(v){ return pad.t + (1 - v) * (h - pad.t - pad.b); };
    ctx.font = FONT;
    for (i = 0; i <= 4; i++){
      var t = i / 4; ctx.strokeStyle = ln; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(pad.l, Y(t)); ctx.lineTo(w - pad.r, Y(t)); ctx.stroke(); ctx.beginPath(); ctx.moveTo(X(t), pad.t); ctx.lineTo(X(t), h - pad.b); ctx.stroke();
      ctx.fillStyle = mu; ctx.textAlign = "right"; ctx.textBaseline = "middle"; ctx.fillText(inrC(bMin + t * (bMax - bMin)), pad.l - 8, Y(t));
      ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillText((fMin + t * (fMax - fMin)).toFixed(0), X(t), h - pad.b + 8);
    }
    ctx.fillStyle = mu; ctx.textAlign = "center"; ctx.fillText("Orders per month →", pad.l + (w - pad.l - pad.r) / 2, h - 16);
    ctx.save(); ctx.translate(12, pad.t + (h - pad.t - pad.b) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText("Average basket →", 0, 0); ctx.restore();
    var st = seg.st;
    pts.forEach(function(p, j){ var a = st.assign[j]; ctx.fillStyle = a < 0 ? mu : tok(KC[a]); ctx.globalAlpha = a < 0 ? .55 : .9; ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), 4.5, 0, 6.283); ctx.fill(); });
    ctx.globalAlpha = 1;
    seg.disp.forEach(function(c, j){
      var col = tok(KC[j]), tr = seg.trails[j];
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.globalAlpha = .6; ctx.beginPath(); tr.forEach(function(q, k){ k ? ctx.lineTo(X(q.x), Y(q.y)) : ctx.moveTo(X(q.x), Y(q.y)); }); ctx.lineTo(X(c.x), Y(c.y)); ctx.stroke(); ctx.globalAlpha = 1;
      ctx.fillStyle = col; ctx.strokeStyle = ink; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(X(c.x), Y(c.y) - 10); ctx.lineTo(X(c.x) + 10, Y(c.y)); ctx.lineTo(X(c.x), Y(c.y) + 10); ctx.lineTo(X(c.x) - 10, Y(c.y)); ctx.closePath(); ctx.fill(); ctx.stroke();
    });
  }
  redraws.seg = drawSeg;
  var segRaf = 0;
  function segAnim(){
    cancelAnimationFrame(segRaf);
    (function f(){
      var moving = false;
      seg.disp.forEach(function(c, j){ var t = seg.st.cent[j], k = reduce ? 1 : .18; c.x += (t.x - c.x) * k; c.y += (t.y - c.y) * k; if (Math.abs(t.x - c.x) > .001 || Math.abs(t.y - c.y) > .001) moving = true; else { c.x = t.x; c.y = t.y; } });
      drawSeg(); if (moving) segRaf = requestAnimationFrame(f);
    })();
  }
  function segStep(){
    if (seg.st.done) return false;
    kmStep(seg.st, pts);
    seg.st.cent.forEach(function(c, j){ seg.trails[j].push({ x:c.x, y:c.y }); });
    segInfo(); segAnim(); return !seg.st.done;
  }
  async function segRun(){
    if (seg.running) return; seg.running = true;
    var guard = 0;
    while (segStep() && guard++ < 40) await sleep(reduce ? 50 : 650);
    seg.running = false;
  }
  $("#segStep").addEventListener("click", function(){ if (!seg.running) segStep(); });
  $("#segRun").addEventListener("click", segRun);
  $("#segNew").addEventListener("click", function(){ if (seg.running) return; seg.seed += 7; segReset(); });
  $("#segK").addEventListener("input", function(e){ if (seg.running) return; seg.k = +e.target.value; $("#oK").textContent = seg.k; segReset(); });
  if (ro) ro.observe(cvSeg);

  /* ---------- lab 3: go-hybrid ---------- */
  var ROI_DEF = { r0:250000, up:60, mg:25, cs:8, ad:5000, st:30000 };
  var cvR1 = $("#cvRoi1"), cvR2 = $("#cvRoi2"), roiOut = null;
  function roiParams(){ return { r0:+$("#roiR0").value, uplift:+$("#roiUp").value / 100, margin:+$("#roiMg").value / 100, cost:+$("#roiCs").value / 100, ads:+$("#roiAd").value, setup:+$("#roiSt").value }; }
  function roiUpdate(){
    var p = roiParams(); roiOut = roiProject(p);
    $("#oR0").textContent = inr(p.r0); $("#oUp").textContent = "+" + Math.round(p.uplift * 100) + "%"; $("#oMg").textContent = Math.round(p.margin * 100) + "%";
    $("#oCs").textContent = Math.round(p.cost * 100) + "%"; $("#oAd").textContent = inr(p.ads); $("#oSt").textContent = inr(p.setup);
    var last = roiOut.rows[11];
    $("#tPay").textContent = roiOut.payback ? "Month " + roiOut.payback : "Over 12 months";
    $("#tGain").textContent = inrC(last.cum); $("#tShare").textContent = Math.round(last.o / (last.o + last.c) * 100) + "%";
    cvR1.setAttribute("aria-label", "Stacked bars of monthly revenue; online reaches " + inrC(last.o) + " a month by month 12.");
    cvR2.setAttribute("aria-label", "Cumulative extra profit reaches " + inrC(last.cum) + " by month 12" + (roiOut.payback ? ", paying back in month " + roiOut.payback + "." : " and does not pay back within the year."));
    drawRoi();
  }
  function drawRoi(){
    if (!roiOut) return;
    var rows = roiOut.rows, ln = tok("--line"), mu = tok("--muted"), cc = tok("--counter"), oc = tok("--online"), ink = tok("--ink"), i;
    var s = setup(cvR1);
    if (s){
      var ctx = s.ctx, w = s.w, h = s.h, pad = { l:46, r:10, t:10, b:24 }, mx = 0;
      rows.forEach(function(r){ mx = Math.max(mx, r.o + r.c); });
      var step = Math.pow(10, Math.floor(Math.log(mx) / Math.LN10)) / 2, top = Math.ceil(mx / step) * step;
      var Y = function(v){ return pad.t + (1 - v / top) * (h - pad.t - pad.b); }, bw = (w - pad.l - pad.r) / 12;
      ctx.font = FONT;
      for (i = 0; i <= 4; i++){ var v = top * i / 4; ctx.strokeStyle = ln; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(pad.l, Y(v)); ctx.lineTo(w - pad.r, Y(v)); ctx.stroke(); ctx.fillStyle = mu; ctx.textAlign = "right"; ctx.textBaseline = "middle"; ctx.fillText(inrC(v), pad.l - 6, Y(v)); }
      rows.forEach(function(r, k){
        var x = pad.l + k * bw + bw * .15, ww = bw * .7;
        ctx.fillStyle = cc; ctx.fillRect(x, Y(r.c), ww, Y(0) - Y(r.c));
        ctx.fillStyle = oc; ctx.fillRect(x, Y(r.c + r.o), ww, Y(r.c) - Y(r.c + r.o));
        ctx.fillStyle = mu; ctx.textAlign = "center"; ctx.textBaseline = "top"; if (w > 420 || k % 2 === 0) ctx.fillText("M" + r.t, x + ww / 2, h - pad.b + 7);
      });
    }
    s = setup(cvR2);
    if (s){
      var c2 = s.ctx, W = s.w, H = s.h, P = { l:46, r:14, t:14, b:24 }, mn = 0, mxx = 0;
      rows.forEach(function(r){ mn = Math.min(mn, r.cum); mxx = Math.max(mxx, r.cum); });
      var span = (mxx - mn) || 1, lo = mn - span * .08, hi = mxx + span * .08;
      var YY = function(v){ return P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b); }, XX = function(k){ return P.l + k * (W - P.l - P.r) / 11; };
      c2.font = FONT;
      for (i = 0; i <= 4; i++){ var vv = lo + (hi - lo) * i / 4; c2.strokeStyle = ln; c2.lineWidth = 1; c2.beginPath(); c2.moveTo(P.l, YY(vv)); c2.lineTo(W - P.r, YY(vv)); c2.stroke(); c2.fillStyle = mu; c2.textAlign = "right"; c2.textBaseline = "middle"; c2.fillText(inrC(vv), P.l - 6, YY(vv)); }
      c2.strokeStyle = ink; c2.lineWidth = 1.5; c2.beginPath(); c2.moveTo(P.l, YY(0)); c2.lineTo(W - P.r, YY(0)); c2.stroke();
      c2.fillStyle = mu; c2.textAlign = "left"; c2.textBaseline = "bottom"; c2.fillText("break-even", P.l + 4, YY(0) - 3);
      c2.strokeStyle = oc; c2.lineWidth = 2.5; c2.lineJoin = "round"; c2.beginPath(); rows.forEach(function(r, k){ k ? c2.lineTo(XX(k), YY(r.cum)) : c2.moveTo(XX(k), YY(r.cum)); }); c2.stroke();
      rows.forEach(function(r, k){ c2.fillStyle = oc; c2.beginPath(); c2.arc(XX(k), YY(r.cum), 3, 0, 6.283); c2.fill(); c2.fillStyle = mu; c2.textAlign = "center"; c2.textBaseline = "top"; if (W > 420 || k % 2 === 0) c2.fillText("M" + r.t, XX(k), H - P.b + 7); });
      if (roiOut.payback){
        var pk = roiOut.payback - 1; c2.setLineDash([4, 4]); c2.strokeStyle = cc; c2.lineWidth = 2; c2.beginPath(); c2.moveTo(XX(pk), P.t); c2.lineTo(XX(pk), H - P.b); c2.stroke(); c2.setLineDash([]);
        c2.fillStyle = ink; c2.textBaseline = "top"; c2.textAlign = pk > 8 ? "right" : "left"; c2.fillText("Payback M" + roiOut.payback, XX(pk) + (pk > 8 ? -6 : 6), P.t + 2);
      }
    }
  }
  redraws.roi = drawRoi;
  [["roiR0"],["roiUp"],["roiMg"],["roiCs"],["roiAd"],["roiSt"]].forEach(function(a){ $("#" + a[0]).addEventListener("input", roiUpdate); });
  $("#roiReset").addEventListener("click", function(){ $("#roiR0").value = ROI_DEF.r0; $("#roiUp").value = ROI_DEF.up; $("#roiMg").value = ROI_DEF.mg; $("#roiCs").value = ROI_DEF.cs; $("#roiAd").value = ROI_DEF.ad; $("#roiSt").value = ROI_DEF.st; roiUpdate(); });
  if (ro){ ro.observe(cvR1); ro.observe(cvR2); }

  /* ---------- lab 4: checkout ---------- */
  var GST = .05, FREE_OVER = 500, DELIVERY = 30;
  var PRODS = [
    { id:"chai", name:"Masala Chai 250 g", price:120, stock:48 }, { id:"rice", name:"Basmati Rice 5 kg", price:480, stock:14 },
    { id:"turmeric", name:"Turmeric Powder 200 g", price:90, stock:31 }, { id:"notebook", name:"Notebook A5", price:60, stock:40 },
    { id:"oil", name:"Mustard Oil 1 L", price:185, stock:12 }
  ], byId = {}; PRODS.forEach(function(p){ byId[p.id] = p; });
  var METHODS = { counter:["Cash","UPI"], online:["UPI","Card","Cash on delivery"] };
  var co = { ch:"counter", cart:{}, tx:[], busy:false, next:1001, last:null };
  function calc(items, ch){
    var sub = 0, units = 0; Object.keys(items).forEach(function(id){ sub += byId[id].price * items[id]; units += items[id]; });
    var gst = Math.round(sub * GST), del = (ch === "online" && sub > 0 && sub < FREE_OVER) ? DELIVERY : 0;
    return { sub:sub, gst:gst, del:del, total:sub + gst + del, units:units };
  }
  function short(n){ return n.replace(/ \d+ ?(g|kg|L)$/i, ""); }
  function summary(items){ return Object.keys(items).map(function(id){ return items[id] > 1 ? items[id] + "× " + short(byId[id].name) : short(byId[id].name); }).join(", "); }
  [{ ch:"counter", m:"Cash", t:"09:12", items:{ chai:2, notebook:3 } }, { ch:"online", m:"UPI", t:"09:48", items:{ rice:1, turmeric:2 } },
   { ch:"counter", m:"UPI", t:"10:20", items:{ oil:1, chai:1 } }, { ch:"online", m:"Card", t:"11:05", items:{ notebook:4, chai:2 } }].forEach(function(s){
    co.tx.unshift({ id:"TX-" + co.next++, ch:s.ch, m:s.m, t:s.t, items:s.items, c:calc(s.items, s.ch) });
  });
  function coMethods(){
    $("#coMethod").innerHTML = METHODS[co.ch].map(function(m){ return "<option>" + m + "</option>"; }).join("");
    $("#coRule").textContent = co.ch === "online" ? "Online orders pay ₹" + DELIVERY + " delivery under ₹" + FREE_OVER + ". GST is " + (GST * 100) + "%." : "Counter sales have no delivery charge. GST is " + (GST * 100) + "%.";
  }
  function coRender(){
    $("#coList").innerHTML = PRODS.map(function(p){
      var left = p.stock - (co.cart[p.id] || 0);
      return '<li class="prod"><div class="prod-i"><strong>' + p.name + '</strong><span class="muted mono">' + inr(p.price) + ' · ' + left + ' in stock</span></div><button class="add" type="button" data-add="' + p.id + '"' + ((left <= 0 || co.busy) ? " disabled" : "") + ' aria-label="Add ' + p.name + '">+ Add</button></li>';
    }).join("");
    var ids = Object.keys(co.cart);
    $("#coLines").innerHTML = ids.length ? ids.map(function(id){
      var p = byId[id], q = co.cart[id];
      return '<div class="cline"><span class="n">' + p.name + '</span><span class="step"><button type="button" data-dec="' + id + '" aria-label="Remove one ' + p.name + '"' + (co.busy ? " disabled" : "") + '>−</button><span>' + q + '</span><button type="button" data-inc="' + id + '" aria-label="Add one ' + p.name + '"' + ((q >= p.stock || co.busy) ? " disabled" : "") + '>+</button></span><span class="amt">' + inr(p.price * q) + '</span></div>';
    }).join("") : '<p class="cart-empty">Cart is empty. Add an item to start a sale.</p>';
    var c = calc(co.cart, co.ch);
    $("#coTotals").innerHTML = '<div><span>Subtotal</span><span class="mono">' + inr(c.sub) + '</span></div><div><span>GST (' + (GST * 100) + '%)</span><span class="mono">' + inr(c.gst) + '</span></div>' +
      (co.ch === "online" ? '<div><span>Delivery</span><span class="mono">' + (c.del ? inr(c.del) : "Free") + '</span></div>' : "") + '<div class="grand"><span>Total</span><span class="mono">' + inr(c.total) + '</span></div>';
    $("#coPay").disabled = !c.units || co.busy;
    $("#coPay").textContent = (co.ch === "online" ? "Place order" : "Record sale") + (c.units ? " · " + inr(c.total) : "");
    $("#coLedger").innerHTML = co.tx.slice(0, 10).map(function(t, i){
      return '<li class="' + (i === 0 && t.id === co.last ? "fresh" : "") + '"><span class="id">' + t.id + '</span><span class="tm">' + t.t + '</span><span class="pill ' + t.ch + '">' + (t.ch === "counter" ? "Counter" : "Online") + '</span><span class="it">' + summary(t.items) + '</span><span class="am">' + inr(t.c.total) + '</span></li>';
    }).join("");
    var rev = 0, cr = 0, orv = 0; co.tx.forEach(function(t){ rev += t.c.total; if (t.ch === "counter") cr += t.c.total; else orv += t.c.total; });
    tween($("#cRev"), rev, inr); tween($("#cOrd"), co.tx.length, function(x){ return String(Math.round(x)); }); tween($("#cSh"), rev ? orv / rev * 100 : 0, function(x){ return Math.round(x) + "%"; });
    $("#spC").style.width = (rev ? cr / rev * 100 : 0) + "%"; $("#spO").style.width = (rev ? orv / rev * 100 : 0) + "%";
  }
  function showReceipt(t){
    var rows = Object.keys(t.items).map(function(id){ return "<div><span>" + t.items[id] + " × " + byId[id].name + "</span><span>" + inr(byId[id].price * t.items[id]) + "</span></div>"; }).join("");
    var ref = t.m === "UPI" ? "<div><span>UPI ref</span><span>" + (Math.floor(Math.random() * 9e11) + 1e11) + "</span></div>" : "";
    $("#rcptBody").innerHTML = '<div class="stamp ' + (t.m === "Cash on delivery" ? "cod" : "paid") + '">' + (t.m === "Cash on delivery" ? "TO PAY" : "PAID") + '</div><div class="dlg-h"><div><span class="pill ' + t.ch + '">' + (t.ch === "counter" ? "Counter" : "Online") + '</span><h3 id="rcptTitle" style="margin-top:12px">Sale recorded</h3></div><button class="x" type="button" data-close aria-label="Close">×</button></div>' +
      '<div class="rcpt"><div><span>' + t.id + '</span><span>' + t.t + '</span></div><hr>' + rows + '<hr><div><span>Subtotal</span><span>' + inr(t.c.sub) + '</span></div><div><span>GST</span><span>' + inr(t.c.gst) + '</span></div>' + (t.c.del ? "<div><span>Delivery</span><span>" + inr(t.c.del) + "</span></div>" : "") +
      '<div><strong>Total</strong><strong>' + inr(t.c.total) + '</strong></div><hr><div><span>Paid by</span><span>' + t.m + '</span></div>' + ref + '</div><p class="note">Sample receipt for this demo. No real payment is made.</p>';
    openDlg($("#rcpt"));
  }
  $("#rcpt").addEventListener("click", function(e){ if (e.target.closest("[data-close]")) closeDlg($("#rcpt")); });
  async function checkout(){
    var c = calc(co.cart, co.ch); if (!c.units || co.busy) return;
    co.busy = true; coRender();
    var labels = co.ch === "online" ? ["Order placed", "Payment confirmed", "Ledger and stock updated"] : ["Bill generated", "Payment received", "Ledger and stock updated"], el = $("#coSteps");
    el.hidden = false; el.innerHTML = labels.map(function(l){ return "<li><i></i>" + l + "</li>"; }).join("");
    var lis = $$("li", el), gap = reduce ? 150 : 650;
    for (var i = 0; i < lis.length; i++){ lis[i].className = "active"; await sleep(gap); lis[i].className = "done"; lis[i].firstChild.textContent = "✓"; }
    await sleep(reduce ? 100 : 300);
    var items = Object.assign({}, co.cart); Object.keys(items).forEach(function(id){ byId[id].stock -= items[id]; });
    var tx = { id:"TX-" + co.next++, ch:co.ch, m:$("#coMethod").value, t:new Date().toLocaleTimeString("en-GB", { hour:"2-digit", minute:"2-digit" }), items:items, c:c };
    co.tx.unshift(tx); co.last = tx.id; co.cart = {}; co.busy = false; el.hidden = true;
    coRender();
    var pb = $("#coPay").getBoundingClientRect(); burst(pb.left + pb.width / 2, pb.top + pb.height / 2, 36);
    await sleep(reduce ? 0 : 700);
    showReceipt(tx);
  }
  $("#pane-co").addEventListener("click", function(e){
    var b = e.target.closest("button"); if (!b || b.disabled || co.busy) return;
    var id = b.getAttribute("data-add") || b.getAttribute("data-inc");
    if (id){ if ((co.cart[id] || 0) < byId[id].stock){ co.cart[id] = (co.cart[id] || 0) + 1; coRender(); } return; }
    id = b.getAttribute("data-dec");
    if (id){ co.cart[id]--; if (co.cart[id] <= 0) delete co.cart[id]; coRender(); return; }
    if (b.getAttribute("data-ch")){ co.ch = b.getAttribute("data-ch"); $$("[data-ch]").forEach(function(x){ x.setAttribute("aria-pressed", x === b ? "true" : "false"); }); coMethods(); coRender(); return; }
    if (b.id === "coPay") checkout();
  });

  /* ---------- skills radar ---------- */
  // Edit these self-assessed levels (1 to 5)
  var SK = [["Python", 3], ["Machine learning", 3], ["SQL and data", 3], ["Business thinking", 4], ["Web (HTML, CSS, JS)", 3], ["Data visualisation", 3]];
  (function(){
    var R = 120, svg = $("#radar"), n = SK.length, out = "", i, j;
    var pt = function(k, v){ var a = -Math.PI / 2 + k * 2 * Math.PI / n; return [Math.cos(a) * R * v / 5, Math.sin(a) * R * v / 5]; };
    for (j = 1; j <= 5; j++){ out += '<polygon class="ring" points="' + SK.map(function(_, k){ return pt(k, j).map(function(x){ return x.toFixed(1); }).join(","); }).join(" ") + '"/>'; }
    for (i = 0; i < n; i++){ var e = pt(i, 5); out += '<line class="axis" x1="0" y1="0" x2="' + e[0].toFixed(1) + '" y2="' + e[1].toFixed(1) + '"/>'; }
    for (j = 1; j <= 5; j++){ out += '<text class="tick" x="4" y="' + (-R * j / 5 + 3) + '">' + j + '</text>'; }
    out += '<g class="radar-g"><polygon class="radar-poly" points="' + SK.map(function(s, k){ return pt(k, s[1]).map(function(x){ return x.toFixed(1); }).join(","); }).join(" ") + '"/>';
    SK.forEach(function(s, k){ var p = pt(k, s[1]); out += '<circle class="radar-dot" cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="5"/>'; });
    out += "</g>";
    SK.forEach(function(s, k){ var p = pt(k, 5.9); out += '<text class="lbl" x="' + p[0].toFixed(1) + '" y="' + (p[1] + 4).toFixed(1) + '">' + s[0] + '</text>'; });
    svg.innerHTML = out;
    var W = ["", "Starting", "Learning", "Working", "Strong", "Expert"];
    $("#skRows").innerHTML = SK.map(function(s){ return '<div class="sk-row"><span>' + s[0] + '</span><span class="bar-track"><i style="width:' + s[1] / 5 * 100 + '%"></i></span><span class="lv">' + W[s[1]] + '</span></div>'; }).join("");
    if ("IntersectionObserver" in window && !reduce && svg.getBoundingClientRect().top >= window.innerHeight){
      new IntersectionObserver(function(es, ob){ if (es[0].isIntersecting){ svg.classList.add("in"); ob.disconnect(); } }, { threshold:.3 }).observe(svg);
    }
  })();

  /* ---------- contact ---------- */
  $$("[data-copy]").forEach(function(btn){
    btn.addEventListener("click", function(){
      var el = document.getElementById(btn.getAttribute("data-copy")), txt = el.textContent;
      var fb = function(){ var r = document.createRange(); r.selectNodeContents(el); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); toast("Selected. Press copy to finish."); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(function(){ toast("Copied " + txt); }, fb); else fb();
    });
  });
  $("#cf").addEventListener("submit", function(e){
    e.preventDefault();
    var nm = $("#cfName"), ml = $("#cfMail"), ms = $("#cfMsg"), ok = true;
    function chk(el, err, bad, msg){ err.textContent = bad ? msg : ""; el.setAttribute("aria-invalid", bad ? "true" : "false"); if (bad) ok = false; }
    chk(nm, $("#eName"), !nm.value.trim(), "Enter your name.");
    chk(ml, $("#eMail"), !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ml.value.trim()), "Enter an email address like name@example.com.");
    chk(ms, $("#eMsg"), ms.value.trim().length < 10, "Write at least a sentence so I know what you need.");
    if (!ok) return;
    $("#draftTxt").textContent = "Hi Azman,\n\n" + ms.value.trim() + "\n\nThanks,\n" + nm.value.trim() + "\n" + ml.value.trim();
    $("#draft").hidden = false; toast("Message written. Copy it to send.");
  });
  $("#draftCopy").addEventListener("click", function(){
    var t = $("#draftTxt").textContent;
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(function(){ toast("Message copied"); }, function(){ var r = document.createRange(); r.selectNodeContents($("#draftTxt")); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); toast("Selected. Press copy to finish."); });
  });

  /* ---------- command palette ---------- */
  var go = function(h){ $(h).scrollIntoView({ behavior: reduce ? "auto" : "smooth" }); };
  var CMDS = [
    { l:"Go to Approach", h:"section", run:function(){ go("#fusion"); } }, { l:"Go to Projects", h:"section", run:function(){ go("#work"); } },
    { l:"Go to ML lab", h:"section", run:function(){ go("#lab"); } }, { l:"Go to Skills", h:"section", run:function(){ go("#skills"); } },
    { l:"Go to Path", h:"section", run:function(){ go("#path"); } }, { l:"Go to Contact", h:"section", run:function(){ go("#contact"); } },
    { l:"Run the demand forecast", h:"lab", run:function(){ goLab("fc"); } }, { l:"Run customer segmentation", h:"lab", run:function(){ goLab("seg"); setTimeout(segRun, 500); } },
    { l:"Open the go-hybrid calculator", h:"lab", run:function(){ goLab("roi"); } }, { l:"Try the shop checkout", h:"lab", run:function(){ goLab("co"); } },
    { l:"Toggle light or dark theme", h:"theme", run:toggleTheme },
    { l:"Celebrate with a festival burst", h:"fun", run:celebrate }
  ].concat(PROJECTS.map(function(p){ return { l:"Case study: " + p.title, h:"project", run:function(){ openCase(p.id); } }; }));
  var palSel = 0, palItems = CMDS.slice();
  function palRender(){
    $("#palList").innerHTML = palItems.length ? palItems.map(function(c, i){ return '<li role="option" data-i="' + i + '" aria-selected="' + (i === palSel) + '"><span>' + c.l + '</span><span class="h">' + c.h + '</span></li>'; }).join("") : '<li class="muted">Nothing matches that.</li>';
    var a = $('#palList [aria-selected="true"]'); if (a && a.scrollIntoView) a.scrollIntoView({ block:"nearest" });
  }
  function palFilter(){
    var q = $("#palIn").value.toLowerCase().split(/\s+/).filter(Boolean);
    palItems = CMDS.filter(function(c){ var s = (c.l + " " + c.h).toLowerCase(); return q.every(function(t){ return s.indexOf(t) > -1; }); }); palSel = 0; palRender();
  }
  function palOpen(){ $("#palIn").value = ""; palFilter(); openDlg($("#pal")); setTimeout(function(){ $("#palIn").focus(); }, 20); }
  function palRun(i){ var c = palItems[i]; if (!c) return; closeDlg($("#pal")); setTimeout(c.run, 80); }
  $("#palBtn").addEventListener("click", palOpen);
  $("#palIn").addEventListener("input", palFilter);
  $("#palIn").addEventListener("keydown", function(e){
    if (e.key === "ArrowDown"){ e.preventDefault(); palSel = Math.min(palItems.length - 1, palSel + 1); palRender(); }
    else if (e.key === "ArrowUp"){ e.preventDefault(); palSel = Math.max(0, palSel - 1); palRender(); }
    else if (e.key === "Enter"){ e.preventDefault(); palRun(palSel); }
  });
  $("#palList").addEventListener("click", function(e){ var li = e.target.closest("li[data-i]"); if (li) palRun(+li.getAttribute("data-i")); });
  window.addEventListener("keydown", function(e){ if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k"){ e.preventDefault(); palOpen(); } });

  /* ---------- boot ---------- */
  fcUpdate(); segReset(); roiUpdate(); coMethods(); coRender();
  $("#oH").textContent = fc.h + " days";
  window.addEventListener("load", function(){ redrawAll(); });
})();
