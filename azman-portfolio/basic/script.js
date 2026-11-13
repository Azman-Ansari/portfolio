(function(){
  "use strict";
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var $ = function(s, r){ return (r || document).querySelector(s); };
  var inr = function(n){ return "₹" + Math.round(n).toLocaleString("en-IN"); };
  var sleep = function(ms){ return new Promise(function(r){ setTimeout(r, ms); }); };

  /* ---------- theme ---------- */
  var root = document.documentElement;
  try { var saved = localStorage.getItem("aa-theme"); if (saved) root.setAttribute("data-theme", saved); } catch(e){}
  $("#themeBtn").addEventListener("click", function(){
    var cur = root.getAttribute("data-theme");
    if (!cur) cur = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    var next = cur === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem("aa-theme", next); } catch(e){}
  });

  /* ---------- toast ---------- */
  var toastEl = $("#toast"), toastTimer;
  function toast(msg){
    toastEl.textContent = msg; toastEl.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(function(){ toastEl.classList.remove("show"); }, 2600);
  }

  /* ---------- small helpers ---------- */
  $("#yr").textContent = new Date().getFullYear();
  $("#kDate").textContent = new Date().toLocaleDateString("en-IN", { weekday:"short", day:"numeric", month:"short" });

  function tween(el, to, fmt){
    var from = el._v || 0; el._v = to;
    if (reduce || from === to){ el.textContent = fmt(to); return; }
    var t0 = performance.now(), dur = 600;
    (function step(t){
      var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(step);
    })(t0);
  }

  /* ---------- scroll reveal (content is visible at rest) ---------- */
  var reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !reduce){
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(en){
        if (en.isIntersecting){ en.target.classList.add("in"); io.unobserve(en.target); }
      });
    }, { threshold: .12 });
    reveals.forEach(function(el){
      if (el.getBoundingClientRect().top < window.innerHeight) return;
      io.observe(el);
    });
  }

  /* ---------- hero ledger feed ---------- */
  var FEED = [
    ["09:12","counter","2 × Masala Chai, 3 × Notebook",420],
    ["09:48","online","Basmati Rice 5 kg, 2 × Turmeric",660],
    ["10:20","counter","Mustard Oil 1 L, Masala Chai",305],
    ["11:05","online","4 × Notebook, 2 × Masala Chai",480],
    ["11:40","counter","Turmeric, 2 × Notebook",210],
    ["12:15","online","2 × Mustard Oil 1 L",370],
    ["12:52","counter","3 × Masala Chai",360],
    ["13:30","online","Basmati Rice 5 kg",480],
    ["14:05","counter","5 × Notebook",300],
    ["14:41","online","Masala Chai, Turmeric, Notebook",270]
  ];
  var kRows = $("#kRows"), kTotal = $("#kTotal"), kSum = 0, kIdx = 0;
  function kRow(r, fresh){
    var li = document.createElement("li");
    li.className = "krow" + (fresh ? " fresh" : "");
    li.innerHTML = '<span class="t">' + r[0] + '</span><span class="pill ' + r[1] + '">' + (r[1] === "counter" ? "Counter" : "Online") + '</span><span class="d">' + r[2] + '</span><span class="a">' + inr(r[3]) + '</span>';
    return li;
  }
  for (; kIdx < 5; kIdx++){ kRows.appendChild(kRow(FEED[kIdx], false)); kSum += FEED[kIdx][3]; }
  tween(kTotal, kSum, inr);
  if (!reduce){
    setInterval(function(){
      if (document.hidden) return;
      var r = FEED[kIdx % FEED.length]; kIdx++;
      kRows.insertBefore(kRow(r, true), kRows.firstChild);
      if (kRows.children.length > 5) kRows.removeChild(kRows.lastChild);
      kSum += r[3]; tween(kTotal, kSum, inr);
    }, 3200);
  }

  /* ---------- shop demo ---------- */
  var GST = .05, FREE_OVER = 500, DELIVERY = 30, LOW_COVER = 3, ALPHA = .4;
  var PRODUCTS = [
    { id:"chai",     name:"Masala Chai 250 g",  price:120, stock:48, hist:[9,11,8,12,10,13] },
    { id:"rice",     name:"Basmati Rice 5 kg",  price:480, stock:14, hist:[3,4,2,5,4,4] },
    { id:"turmeric", name:"Turmeric Powder 200 g", price:90, stock:31, hist:[6,5,7,6,8,7] },
    { id:"notebook", name:"Notebook A5",        price:60,  stock:40, hist:[12,9,14,11,10,15] },
    { id:"oil",      name:"Mustard Oil 1 L",    price:185, stock:12, hist:[4,5,3,4,6,5] }
  ];
  var byId = {}; PRODUCTS.forEach(function(p){ p.today = 0; byId[p.id] = p; });
  var METHODS = { counter:["Cash","UPI"], online:["UPI","Card","Cash on delivery"] };
  var state = { channel:"counter", cart:{}, tx:[], busy:false, nextId:1001 };

  function calc(items, ch){
    var sub = 0, units = 0;
    Object.keys(items).forEach(function(id){ sub += byId[id].price * items[id]; units += items[id]; });
    var gst = Math.round(sub * GST);
    var del = (ch === "online" && sub > 0 && sub < FREE_OVER) ? DELIVERY : 0;
    return { sub:sub, gst:gst, del:del, total:sub + gst + del, units:units };
  }
  function forecast(p){
    var f = p.hist[0];
    for (var i = 1; i < p.hist.length; i++) f = ALPHA * p.hist[i] + (1 - ALPHA) * f;
    return f;
  }
  function summary(items){
    return Object.keys(items).map(function(id){
      var n = byId[id].name.replace(/ \d+ ?(g|kg|L)$/i, "").replace(/ \d+ L$/, "");
      return items[id] > 1 ? items[id] + "× " + n : n;
    }).join(", ");
  }

  // sample transactions already recorded today
  [
    { ch:"counter", m:"Cash", t:"09:12", items:{ chai:2, notebook:3 } },
    { ch:"online",  m:"UPI",  t:"09:48", items:{ rice:1, turmeric:2 } },
    { ch:"counter", m:"UPI",  t:"10:20", items:{ oil:1, chai:1 } },
    { ch:"online",  m:"Card", t:"11:05", items:{ notebook:4, chai:2 } },
    { ch:"counter", m:"Cash", t:"11:40", items:{ turmeric:1, notebook:2 } }
  ].forEach(function(s){
    var c = calc(s.items, s.ch);
    Object.keys(s.items).forEach(function(id){ byId[id].today += s.items[id]; });
    state.tx.unshift({ id:"TX-" + state.nextId++, ch:s.ch, m:s.m, t:s.t, sum:summary(s.items), total:c.total });
  });

  var elList = $("#plist"), elLines = $("#cartLines"), elTotals = $("#totals"), elPay = $("#payBtn"),
      elMethod = $("#method"), elRule = $("#rule"), elSteps = $("#steps"), elFc = $("#fc"), elLedger = $("#ledger");

  function cartCalc(){ return calc(state.cart, state.channel); }

  function renderMethods(){
    elMethod.innerHTML = METHODS[state.channel].map(function(m){ return "<option>" + m + "</option>"; }).join("");
    elRule.textContent = state.channel === "online"
      ? "Online orders pay ₹" + DELIVERY + " delivery under ₹" + FREE_OVER + ". GST is " + (GST * 100) + "%."
      : "Counter sales have no delivery charge. GST is " + (GST * 100) + "%.";
  }
  function renderProducts(){
    elList.innerHTML = PRODUCTS.map(function(p){
      var left = p.stock - (state.cart[p.id] || 0);
      return '<li class="prod"><div class="prod-i"><strong>' + p.name + '</strong><span class="muted mono">' + inr(p.price) + ' · ' + left + ' in stock</span></div>' +
        '<button class="add" type="button" data-add="' + p.id + '"' + ((left <= 0 || state.busy) ? " disabled" : "") + ' aria-label="Add ' + p.name + ' to cart">+ Add</button></li>';
    }).join("");
  }
  function renderCart(){
    var ids = Object.keys(state.cart);
    if (!ids.length){
      elLines.innerHTML = '<p class="cart-empty">Cart is empty. Add an item to start a sale.</p>';
    } else {
      elLines.innerHTML = ids.map(function(id){
        var p = byId[id], q = state.cart[id];
        return '<div class="cline"><span class="n">' + p.name + '</span>' +
          '<span class="step"><button type="button" data-dec="' + id + '" aria-label="Remove one ' + p.name + '"' + (state.busy ? " disabled" : "") + '>−</button><span>' + q + '</span>' +
          '<button type="button" data-inc="' + id + '" aria-label="Add one ' + p.name + '"' + ((q >= p.stock || state.busy) ? " disabled" : "") + '>+</button></span>' +
          '<span class="amt">' + inr(p.price * q) + '</span></div>';
      }).join("");
    }
    var c = cartCalc();
    elTotals.innerHTML = '<div><span>Subtotal</span><span class="mono">' + inr(c.sub) + '</span></div>' +
      '<div><span>GST (' + (GST * 100) + '%)</span><span class="mono">' + inr(c.gst) + '</span></div>' +
      (state.channel === "online" ? '<div><span>Delivery</span><span class="mono">' + (c.del ? inr(c.del) : "Free") + '</span></div>' : "") +
      '<div class="grand"><span>Total</span><span class="mono">' + inr(c.total) + '</span></div>';
    elPay.disabled = !c.units || state.busy;
    elPay.textContent = (state.channel === "online" ? "Place order" : "Record sale") + (c.units ? " · " + inr(c.total) : "");
  }
  function spark(p){
    var v = p.hist.concat([p.today]), w = 84, h = 24, max = Math.max.apply(null, v.concat([1]));
    var pts = v.map(function(y, i){ return (i / (v.length - 1) * w).toFixed(1) + "," + (h - y / max * h).toFixed(1); });
    var last = pts[pts.length - 1].split(",");
    return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true"><polyline points="' + pts.join(" ") + '"/><circle cx="' + last[0] + '" cy="' + last[1] + '" r="3"/></svg>';
  }
  function renderForecast(){
    elFc.innerHTML = PRODUCTS.map(function(p){
      var f = forecast(p), cover = p.stock / f, q = Math.max(1, Math.ceil(f * 7 - p.stock));
      var st = cover < LOW_COVER ? '<span class="pill bad">Reorder ~' + q + '</span>' : '<span class="pill ok">OK</span>';
      return "<tr><td>" + p.name.replace(/ \d+ ?(g|kg|L)$/i, "") + "</td><td>" + spark(p) + '</td><td class="mono">' + f.toFixed(1) + "/day</td><td class=\"mono\">" + cover.toFixed(1) + " days</td><td>" + st + "</td></tr>";
    }).join("");
  }
  var lastTxId = null;
  function renderLedger(){
    elLedger.innerHTML = state.tx.slice(0, 12).map(function(t, i){
      return '<li class="' + (i === 0 && t.id === lastTxId ? "fresh" : "") + '"><span class="id">' + t.id + '</span><span class="tm">' + t.t + '</span><span class="pill ' + t.ch + '">' + (t.ch === "counter" ? "Counter" : "Online") + '</span><span class="it" title="' + t.sum + " · " + t.m + '">' + t.sum + '</span><span class="am">' + inr(t.total) + '</span></li>';
    }).join("");
  }
  function renderStats(){
    var rev = 0, c = 0, o = 0;
    state.tx.forEach(function(t){ rev += t.total; if (t.ch === "counter") c += t.total; else o += t.total; });
    var n = state.tx.length;
    tween($("#sRev"), rev, inr); tween($("#sOrd"), n, function(x){ return String(Math.round(x)); }); tween($("#sAov"), n ? rev / n : 0, inr);
    $("#spC").style.width = (rev ? c / rev * 100 : 0) + "%"; $("#spO").style.width = (rev ? o / rev * 100 : 0) + "%";
    tween($("#lgC"), c, inr); tween($("#lgO"), o, inr);
    tween($("#lgS"), rev ? o / rev * 100 : 0, function(x){ return Math.round(x) + "%"; });
  }
  function renderAll(){ renderProducts(); renderCart(); renderForecast(); renderLedger(); renderStats(); }

  async function checkout(){
    var c = cartCalc(); if (!c.units || state.busy) return;
    state.busy = true; renderProducts(); renderCart();
    var labels = state.channel === "online"
      ? ["Order placed", "Payment confirmed", "Ledger and stock updated"]
      : ["Bill generated", "Payment received", "Ledger and stock updated"];
    elSteps.hidden = false;
    elSteps.innerHTML = labels.map(function(l){ return "<li><i></i>" + l + "</li>"; }).join("");
    var lis = elSteps.querySelectorAll("li"), gap = reduce ? 150 : 650;
    for (var i = 0; i < lis.length; i++){
      lis[i].className = "active"; await sleep(gap);
      lis[i].className = "done"; lis[i].firstChild.textContent = "✓";
    }
    await sleep(reduce ? 100 : 350);
    var items = Object.assign({}, state.cart), now = new Date();
    Object.keys(items).forEach(function(id){ byId[id].stock -= items[id]; byId[id].today += items[id]; });
    var tx = { id:"TX-" + state.nextId++, ch:state.channel, m:elMethod.value, t:now.toLocaleTimeString("en-GB", { hour:"2-digit", minute:"2-digit" }), sum:summary(items), total:c.total };
    state.tx.unshift(tx); lastTxId = tx.id;
    state.cart = {}; state.busy = false; elSteps.hidden = true;
    renderAll();
    toast(tx.id + " recorded: " + inr(tx.total) + " via " + (tx.ch === "counter" ? "counter" : "online"));
  }

  $("#demo").addEventListener("click", function(e){
    var b = e.target.closest("button"); if (!b || b.disabled || state.busy) return;
    var id;
    if ((id = b.getAttribute("data-add")) || (id = b.getAttribute("data-inc"))){
      if ((state.cart[id] || 0) < byId[id].stock){ state.cart[id] = (state.cart[id] || 0) + 1; renderProducts(); renderCart(); }
    } else if ((id = b.getAttribute("data-dec"))){
      state.cart[id]--; if (state.cart[id] <= 0) delete state.cart[id]; renderProducts(); renderCart();
    } else if (b.getAttribute("data-channel")){
      state.channel = b.getAttribute("data-channel");
      document.querySelectorAll("[data-channel]").forEach(function(x){ x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
      renderMethods(); renderCart();
    } else if (b.id === "payBtn"){
      checkout();
    }
  });

  renderMethods(); renderAll();

  /* ---------- copy buttons ---------- */
  document.querySelectorAll("[data-copy]").forEach(function(btn){
    btn.addEventListener("click", function(){
      var el = document.getElementById(btn.getAttribute("data-copy")), txt = el.textContent;
      function fallback(){
        var r = document.createRange(); r.selectNodeContents(el);
        var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
        toast("Selected. Press copy to finish.");
      }
      if (navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(txt).then(function(){ toast("Copied " + txt); }, fallback);
      } else { fallback(); }
    });
  });
})();
