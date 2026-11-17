/* A/B UT 실험 런너 — STUDY-001 / EXP-001 / TASK-001 (01-ut-spec.md 기준, 기준선 런너와 같은 엔진)
   Figma 프로토타입(기존 앱 화면 1:2)을 이미지 + 터치 영역으로 재현하고, ut-event-schema.json 형식으로 이벤트를 기록한다. */
(() => {
  "use strict";

  // ---- 설정 ----
  const CFG = {
    study_id: "STUDY-001",
    task_id: "TASK-001",
    experiment_id: "EXP-001",
    variant_id: null, // URL ?v=A|B (링크에 배정 포함, 세션 동안 유지)
    prototype_version: "ab-v1.0",
  };
  const SCENARIO = "이번 주 토요일(19일), 친구들과 함께 영화 '오디세이'를 관람하려고 합니다. 용산아이파크몰 CGV와 영등포 CGV 중에서 15시 이후의 2D 일반관 상영 중 세 명이 나란히 앉을 수 있는 맨 뒷자리가 남아 있는 가장 이른 상영을 찾아주세요. 해당 상영을 선택한 후, 세 명이 나란히 앉을 수 있는 맨 뒷자리 좌석을 선택하고 결제 페이지로 이동하세요.";
  // 화면은 변형본마다 노드 ID 가 달라 화면 코드(SCR-xx)로 판정한다
  const SUCCESS_CODE = "SCR-70"; // 후보4 경로
  const FAIL_CODES = { "SCR-76": 1, "SCR-82": 2, "SCR-88": 3 };
  const SEAT_CODES = { "SCR-66": 4, "SCR-67": 4, "SCR-72": 1, "SCR-73": 1, "SCR-78": 2, "SCR-79": 2, "SCR-84": 3, "SCR-85": 3 };
  const PANEL_VIEW_MS = 1000; // D-03: 50% 이상 1초 이상 노출

  const qs = new URLSearchParams(location.search);
  CFG.variant_id = ["A", "B"].includes((qs.get("v") || "").toUpperCase()) ? qs.get("v").toUpperCase() : null;
  const ORIGIN = ["real", "pilot", "synthetic"].includes(qs.get("origin")) ? qs.get("origin") : "pilot";
  if (qs.has("debug")) document.body.classList.add("debug");

  const $ = (s, r = document) => r.querySelector(s);
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : "s-" + Date.now().toString(36) + Math.random().toString(36).slice(2));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장 불가 시 메모리만 유지 */ } },
  };

  // ---- 세션 ----
  const session = {
    id: uid(),
    pid: (qs.get("pid") || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24) || "P-" + Math.random().toString(36).slice(2, 7).toUpperCase(),
    consent: null,
    events: [],
    t0: null,
    ended: false,
  };
  const KEY = "utlog-ab:" + session.id;

  function device() {
    const ua = navigator.userAgent;
    return /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : "기타";
  }

  function log(event_name, extra = {}) {
    if (session.consent !== "granted") return; // 동의 전·거부 시 기록하지 않음
    const now = Date.now();
    const e = {
      study_id: CFG.study_id, participant_id: session.pid, session_id: session.id,
      task_id: CFG.task_id, experiment_id: CFG.experiment_id, variant_id: CFG.variant_id,
      prototype_version: CFG.prototype_version, event_name,
      event_ts: new Date(now).toISOString(),
      elapsed_ms: session.t0 ? now - session.t0 : null,
      screen_id: null, target_id: null,
      data_origin: ORIGIN, consent_state: session.consent, ...extra,
    };
    e.seq = session.events.length;
    session.events.push(e);
    store.set(KEY, { meta: meta(), events: session.events });
  }
  const meta = () => ({ session_id: session.id, participant_id: session.pid, variant_id: CFG.variant_id, data_origin: ORIGIN, prototype_version: CFG.prototype_version, device: device(), ended: session.ended });

  // ---- 페이지 전환 ----
  function go(id) {
    document.querySelectorAll(".page").forEach(p => p.classList.toggle("on", p.id === id));
    sessionStorage.setItem("utpage", id);
    window.scrollTo(0, 0);
  }
  document.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => go(b.dataset.go)));
  document.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", () => b.closest(".modal").hidden = true));

  // ---- 설문 정의 (ut-plan.md §2.2 배경 변수, §5 Q-01~Q-06, Q-08) ----
  const PRE = [
    { id: "BG-01", q: "최근 6개월 동안 휴대폰으로 영화를 예매한 횟수는?", type: "one", opts: ["없음", "1~2회", "3~5회", "6회 이상"] },
    { id: "BG-02", q: "여러 극장이나 시간대를 비교해서 상영을 고른 적이 있나요?", type: "one", opts: ["자주 있다", "가끔 있다", "거의 없다"] },
    { id: "BG-03", q: "CGV 앱을 사용해 본 적이 있나요?", type: "one", opts: ["자주 사용", "가끔 사용", "거의 사용 안 함", "사용한 적 없음"] },
  ];
  const POST = [
    { id: "Q-01", q: "여러 상영 후보의 조건을 비교하기 쉬웠나요?", type: "scale" },
    { id: "Q-02", q: "원하는 조건에 맞는 상영을 찾는 과정이 쉬웠나요?", type: "scale" },
    { id: "Q-03", q: "최종적으로 선택한 상영이 본인의 조건에 맞는다는 확신이 있었나요?", type: "scale" },
    { id: "Q-04", q: "상영을 선택할 때 가장 중요하게 고려한 정보는 무엇이었나요? (여러 개 선택 가능)", type: "multi", opts: ["극장 위치", "상영시간", "상영관·포맷", "좌석 상태", "가격", "기타"], other: true },
    { id: "Q-05", q: "상영 후보를 비교하는 과정에서 다시 확인하거나 헷갈렸던 정보가 있었나요?", type: "one", opts: ["있음", "없음"], follow: { when: "있음", q: "어떤 정보였나요?" } },
    { id: "Q-06", q: "좌석 상태를 확인하는 시점과 방식은 적절했나요?", type: "scale", reason: true },
    { id: "Q-08", q: "상영을 결정할 때 추가로 필요했던 정보나 개선되었으면 하는 점이 있나요?", type: "text" },
  ];
  function renderForm(form, items) {
    form.innerHTML = items.map(it => {
      let body = "";
      if (it.type === "scale") {
        body = `<div class="scale">${[1, 2, 3, 4, 5].map(v => `<label><input type="radio" name="${it.id}" value="${v}">${v}</label>`).join("")}</div>
          <div class="scale-legend"><span>1 전혀 그렇지 않다</span><span>5 매우 그렇다</span></div>`;
        if (it.reason) body += `<textarea name="${it.id}-reason" rows="2" placeholder="이유 (선택)"></textarea>`;
      } else if (it.type === "one" || it.type === "multi") {
        const t = it.type === "one" ? "radio" : "checkbox";
        body = `<div class="opts">${it.opts.map(o => `<label><input type="${t}" name="${it.id}" value="${o}">${o}</label>`).join("")}</div>`;
        if (it.other) body += `<input type="text" name="${it.id}-other" placeholder="기타 (선택)">`;
        if (it.follow) body += `<div data-follow="${it.id}" hidden><p class="note">${it.follow.q}</p><input type="text" name="${it.id}-detail"></div>`;
      } else body = `<textarea name="${it.id}" rows="3" placeholder="자유롭게 적어 주세요 (선택)"></textarea>`;
      return `<fieldset><legend>${it.id.startsWith("Q") ? "" : ""}${it.q}</legend>${body}</fieldset>`;
    }).join("");
    items.filter(i => i.follow).forEach(i => form.querySelectorAll(`[name="${i.id}"]`).forEach(r => r.addEventListener("change", () => {
      form.querySelector(`[data-follow="${i.id}"]`).hidden = form.querySelector(`[name="${i.id}"]:checked`)?.value !== i.follow.when;
    })));
  }
  function readForm(form, items) {
    const fd = new FormData(form), out = {};
    for (const it of items) {
      if (it.type === "multi") out[it.id] = fd.getAll(it.id); else out[it.id] = fd.get(it.id) || null;
      for (const suf of ["reason", "other", "detail"]) if (fd.has(`${it.id}-${suf}`)) out[`${it.id}-${suf}`] = (fd.get(`${it.id}-${suf}`) || "").trim() || null;
    }
    return out;
  }
  renderForm($("#f-pre"), PRE);
  renderForm($("#f-post"), POST);
  $("#scenario-text").textContent = SCENARIO;
  $("#scenario-text-2").textContent = SCENARIO;

  // ---- 동의 / 사전 질문 ----
  $("#consent-yes").addEventListener("click", () => {
    session.consent = "granted";
    log("consent", { device: device() });
    log("variant_assignment", { assigned: CFG.variant_id, method: "link" });
    go("p-pre");
  });
  $("#consent-no").addEventListener("click", () => { session.consent = "denied"; go("p-declined"); });
  $("#pre-next").addEventListener("click", () => {
    log("survey_submit", { phase: "pre", answers: { ...readForm($("#f-pre"), PRE), device: device() } });
    go("p-brief");
  });

  // ---- 프로토타입 엔진 ----
  let DATA = null;
  const device$ = $("#device");
  const stack = []; // [{sid, pos, bg, closeOutside}] 0 = base
  const hist = [];
  let timers = [];
  let lastTop = null;

  function fit() {
    const wrap = $("#stage-wrap");
    const s = Math.min(wrap.clientWidth / 350, wrap.clientHeight / 761);
    device$.style.transform = `scale(${s})`;
    device$.style.marginRight = `${350 * s - 350}px`;
    device$.style.marginBottom = `${761 * s - 761}px`;
  }
  window.addEventListener("resize", fit);

  function layerBox(entry, s, isBase) {
    if (s.partial) { const [x0, y0, x1, y1] = s.partial; return { left: x0, top: y0, w: x1 - x0, h: y1 - y0 }; }
    if (isBase) return { left: 0, top: 0, w: s.w, h: s.h };
    const left = (350 - s.w) / 2;
    const top = entry.pos === "BOTTOM_CENTER" ? 761 - s.h : entry.pos === "TOP_CENTER" ? 0 : (761 - s.h) / 2;
    return { left, top, w: s.w, h: s.h };
  }

  function hotEl(h, ox, oy, s) {
    const b = document.createElement("button");
    b.className = "hot"; b.type = "button";
    Object.assign(b.style, { left: h.x - ox + "px", top: h.y - oy + "px", width: h.w + "px", height: h.h + "px" });
    b.setAttribute("aria-label", h.name);
    b.addEventListener("click", ev => {
      ev.stopPropagation();
      log("target_click", { screen_id: s.code, target_id: h.name, node_id: h.id });
      for (const a of h.acts) if (a[0] === "C") act(a[1], a[2]);
    });
    return b;
  }

  function buildLayer(entry, idx) {
    const s = DATA.screens[entry.sid];
    const isBase = idx === 0;
    const box = layerBox(entry, s, isBase);
    const el = document.createElement("div");
    el.className = "layer" + (!isBase && entry.pos === "BOTTOM_CENTER" ? " sheet-bottom" : "");
    Object.assign(el.style, { left: box.left + "px", top: box.top + "px", width: box.w + "px", height: box.h + "px" });
    el.dataset.sid = s.id;

    const sc = document.createElement("div");
    sc.className = "scroller" + (s.scroll && !s.partial ? " y" : "");
    const content = document.createElement("div");
    content.className = "content";
    const offX = s.partial ? s.partial[0] : 0, offY = s.partial ? s.partial[1] : 0;
    content.style.height = s.contentH + "px";
    if (s.partial) { content.style.transform = `translate(${-offX}px, ${-offY}px)`; content.style.width = s.w + "px"; }
    const img = new Image(); img.className = "bg"; img.src = s.img; img.alt = ""; img.decoding = "async";
    content.appendChild(img);
    for (const h of s.hot.filter(h => h.layer === "content")) content.appendChild(hotEl(h, 0, s.y0, s));
    for (const n of s.nests) {
      const ne = document.createElement("div"); ne.className = "nest";
      Object.assign(ne.style, { left: n.x + "px", top: n.y - s.y0 + "px", width: n.w + "px", height: n.h + "px" });
      const inner = document.createElement("div"); inner.className = "nest-inner"; inner.style.height = n.contentH + "px";
      const ni = new Image(); ni.className = "bg"; ni.src = n.src; ni.alt = ""; inner.appendChild(ni);
      for (const h of s.hot.filter(h => h.layer === "nest:" + n.id)) inner.appendChild(hotEl(h, n.x, n.y, s));
      ne.appendChild(inner); content.appendChild(ne);
    }
    if (s.panel) {
      const p = document.createElement("div"); p.className = "probe";
      p.style.top = s.panel[0] - s.y0 + "px"; p.style.height = s.panel[1] - s.panel[0] + "px";
      content.appendChild(p); watchPanel(p, sc, s, entry);
    }
    sc.appendChild(content); el.appendChild(sc);
    if (s.fixed) {
      const [fx, fy, fw, fh] = s.fixed.box;
      const f = document.createElement("div"); f.className = "fixedlayer";
      Object.assign(f.style, { left: fx + "px", top: fy + "px", width: fw + "px", height: fh + "px",
        backgroundImage: `url(${s.fixed.src})`, backgroundSize: `${s.w}px ${s.h}px`, backgroundPosition: `${-fx}px ${-fy}px` });
      for (const h of s.hot.filter(h => h.layer === "fixed")) f.appendChild(hotEl(h, fx, fy, s));
      el.appendChild(f);
    }
    el.addEventListener("click", ev => {
      if (ev.target.closest(".hot")) return;
      const r = el.getBoundingClientRect(), k = r.width / box.w;
      const x = Math.round((ev.clientX - r.left) / k), y = Math.round((ev.clientY - r.top) / k + (s.scroll ? sc.scrollTop : 0) + s.y0);
      log("unsupported_tap", { screen_id: s.code, x, y });
    });
    entry.sc = sc; entry.elSid = s.id;
    const keep = entry.keepScroll;
    requestAnimationFrame(() => { if (s.scroll) sc.scrollTop = keep != null ? keep : -s.y0; });
    return el;
  }

  // D-03 좌석 현황 패널 노출 감지
  function watchPanel(probe, root, s, entry) {
    let t = null, done = !!(entry.panelLogged && entry.panelLogged === s.id);
    const io = new IntersectionObserver(([en]) => {
      if (done) return;
      if (en.intersectionRatio >= 0.5) {
        if (!t) t = setTimeout(() => { done = true; io.disconnect(); entry.panelLogged = s.id; log("seat_panel_view", { screen_id: s.code, candidate: s.cand, via: "panel" }); }, PANEL_VIEW_MS);
      } else if (t) { clearTimeout(t); t = null; }
    }, { root, threshold: [0, 0.5, 1], rootMargin: `0px 0px ${-(s.fixed ? 761 - s.fixed.box[1] : 0)}px 0px` }); // 하단 고정 바에 가려진 부분은 보이지 않는 것으로 처리
    io.observe(probe);
    observers.push(io);
  }
  let observers = [];

  function render() {
    stack.forEach(e => { e.keepScroll = e.sc && e.elSid === e.sid ? e.sc.scrollTop : null; if (e.elSid !== e.sid) e.panelLogged = null; });
    observers.forEach(o => o.disconnect()); observers = [];
    timers.forEach(clearTimeout); timers = [];
    device$.innerHTML = "";
    stack.forEach((entry, i) => {
      const s = DATA.screens[entry.sid];
      if (i > 0 && entry.bg) {
        const d = document.createElement("div"); d.className = "dim";
        const c = entry.bg; d.style.background = `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${c.a})`;
        if (i < stack.length - 1) d.style.pointerEvents = "none";
        d.addEventListener("click", () => {
          if (entry.closeOutside) { log("target_click", { screen_id: s.code, target_id: "overlay_outside" }); act("CLOSE"); }
          else log("unsupported_tap", { screen_id: s.code, target_id: "overlay_outside" });
        });
        device$.appendChild(d);
      }
      const el = buildLayer(entry, i);
      if (i < stack.length - 1) el.classList.add("inactive");
      device$.appendChild(el);
      if (i === stack.length - 1 && entry.firedFor !== entry.sid) for (const a of s.self) if (a[0].startsWith("T")) {
        const ms = Math.max(0, parseFloat(a[0].slice(1)) * 1000);
        timers.push(setTimeout(() => { entry.firedFor = entry.sid; act(a[1], a[2], entry); }, ms));
      }
    });
    const top = stack[stack.length - 1].sid;
    const sig = stack.map(e => e.sid).join(">");
    if (sig !== lastTop) { lastTop = sig; onView(top); }
  }

  function onView(sid) {
    const s = DATA.screens[sid];
    log("screen_view", { screen_id: s.code, node_id: sid, stack: stack.map(e => DATA.screens[e.sid].code) });
    if (SEAT_CODES[s.code]) log("seat_panel_view", { screen_id: s.code, candidate: SEAT_CODES[s.code], via: "seat_screen" });
    if (s.sheet) { // 좌석 시트: 1초 이상 맨 위에 보이면 좌석 확인으로 기록 (D-03 과 같은 기준)
      const sig = stack.map(e => e.sid).join(">");
      setTimeout(() => { if (stack.map(e => e.sid).join(">") === sig && !session.ended) log("seat_panel_view", { screen_id: s.code, candidate: s.cand, via: "sheet" }); }, 1000);
    }
    if (s.code === SUCCESS_CODE) endTask("success");
    else if (FAIL_CODES[s.code]) endTask("fail", { reason: "wrong_screening", candidate: FAIL_CODES[s.code] });
  }

  function act(type, dest, fromEntry) {
    if (session.ended) return;
    const top = stack[stack.length - 1];
    if (fromEntry && fromEntry !== top && type === "CLOSE") { // 타이머로 닫히는 오버레이(토스트)
      const i = stack.indexOf(fromEntry); if (i > 0) stack.splice(i, 1); render(); return;
    }
    switch (type) {
      case "NAVIGATE": hist.push(stack[0].sid); stack.length = 0; stack.push({ sid: dest }); break;
      case "OVERLAY": { const d = DATA.screens[dest]; stack.push({ sid: dest, pos: d.overlay.pos, bg: d.overlay.bg, closeOutside: d.overlay.closeOutside }); break; }
      case "SWAP": if (stack.length > 1) top.sid = dest; else stack[0] = { sid: dest }; break;
      case "CLOSE": if (stack.length > 1) stack.pop(); break;
      case "BACK": if (stack.length > 1) stack.pop(); else if (hist.length) stack[0] = { sid: hist.pop() }; break;
      default: return;
    }
    render();
  }

  // ---- 과업 시작 / 종료 ----
  $("#task-start").addEventListener("click", async () => {
    $("#task-start").disabled = true;
    if (!DATA) DATA = window["UT_SCREENS_" + CFG.variant_id];
    go("p-task"); fit();
    session.t0 = Date.now();
    stack.length = 0; stack.push({ sid: DATA.start });
    log("task_start", { screen_id: DATA.screens[DATA.start].code });
    sessionStorage.setItem("utactive", session.id);
    render();
    preload();
  });
  function preload() { Object.values(DATA.screens).forEach(s => { const i = new Image(); i.src = s.img; }); }

  $("#rb-scenario").addEventListener("click", () => { log("target_click", { target_id: "runner:scenario" }); $("#m-scenario").hidden = false; });
  $("#rb-abandon").addEventListener("click", () => { log("target_click", { target_id: "runner:abandon_open" }); $("#m-abandon").hidden = false; });
  $("#abandon-yes").addEventListener("click", () => { $("#m-abandon").hidden = true; endTask("abandon"); });

  function endTask(result, extra = {}) {
    if (session.ended) return;
    session.ended = true;
    const name = result === "success" ? "task_success" : result === "fail" ? "task_fail" : "task_abandon";
    log(name, { screen_id: DATA.screens[stack[stack.length - 1].sid].code, ...extra });
    sessionStorage.removeItem("utactive");
    timers.forEach(clearTimeout);
    const show = () => { $("#m-ended").hidden = false; setTimeout(() => { $("#m-ended").hidden = true; go("p-post"); }, 1500); };
    sendAll("task_end");
    result === "abandon" ? go("p-post") : setTimeout(show, 600);
  }

  $("#post-next").addEventListener("click", () => {
    log("survey_submit", { phase: "post", answers: readForm($("#f-post"), POST) });
    store.set(KEY, { meta: meta(), events: session.events });
    $("#session-info").textContent = `session ${session.id} · ${session.pid} · ${ORIGIN} · events ${session.events.length}`;
    go("p-done");
    const st = $("#send-status");
    if (!CONF.endpoint) return;
    $("#operator-box").hidden = !qs.has("debug");
    st.textContent = "응답을 저장하는 중입니다…";
    sendAll("survey_submit").then(ok => {
      st.textContent = ok ? "응답이 저장되었습니다. 창을 닫으셔도 됩니다." : "응답 저장에 실패했습니다. 아래 버튼으로 파일을 저장해 진행자에게 보내 주세요.";
      if (!ok) $("#operator-box").hidden = false;
    });
  });

  // ---- 중앙 전송 (config.js endpoint, Google Apps Script) ----
  const CONF = window.UT_CONFIG || {};
  let lastSent = -1;
  async function sendAll(reason) {
    if (!CONF.endpoint || session.consent !== "granted" || !session.events.length) return null;
    const body = JSON.stringify({ token: CONF.token, reason, meta: meta(), events: session.events });
    try {
      const r = await fetch(CONF.endpoint, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body, redirect: "follow" });
      const ok = r.ok && (await r.text()).startsWith("ok");
      if (ok) lastSent = session.events.length;
      return ok;
    } catch { return false; }
  }
  // 창을 닫거나 다른 앱으로 나갈 때 남은 기록 전송 (중복은 분석 시 session_id+seq 로 제거)
  addEventListener("pagehide", () => {
    if (CONF.endpoint && session.consent === "granted" && session.events.length > lastSent && navigator.sendBeacon)
      navigator.sendBeacon(CONF.endpoint, new Blob([JSON.stringify({ token: CONF.token, reason: "pagehide", meta: meta(), events: session.events })], { type: "text/plain;charset=utf-8" }));
  });

  // ---- 내보내기 ----
  const COLS = ["study_id", "participant_id", "session_id", "task_id", "experiment_id", "variant_id", "prototype_version", "event_name", "event_ts", "elapsed_ms", "screen_id", "target_id", "data_origin", "consent_state"];
  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function toCSV(events) {
    const esc = v => v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
    return [COLS.concat("extra").join(","), ...events.map(e => {
      const extra = {}; for (const k in e) if (!COLS.includes(k)) extra[k] = e[k];
      return COLS.map(c => esc(e[c])).concat(esc(JSON.stringify(extra))).join(",");
    })].join("\n");
  }
  const fname = (sid, pid, ext) => `ut-ab-${CFG.variant_id}_${pid}_${sid.slice(0, 8)}.${ext}`;
  $("#dl-json").addEventListener("click", () => download(fname(session.id, session.pid, "json"), JSON.stringify({ meta: meta(), events: session.events }, null, 1), "application/json"));
  $("#dl-csv").addEventListener("click", () => download(fname(session.id, session.pid, "csv"), toCSV(session.events), "text/csv"));

  // ---- 진행자 화면 (?admin) ----
  function adminView() {
    const keys = Object.keys(localStorage).filter(k => k.startsWith("utlog-ab:"));
    const all = keys.map(k => store.get(k, null)).filter(Boolean);
    $("#admin-list").innerHTML = all.length ? all.map((s, i) => `<p class="box mono">${s.meta.participant_id} · ${s.meta.data_origin} · ${s.events.length} events · ${s.meta.ended ? "종료" : "미종료"}<br>${s.meta.session_id}
      <button class="btn" data-i="${i}">이 세션 저장 (JSON)</button></p>`).join("") : "<p>저장된 세션이 없습니다.</p>";
    $("#admin-list").querySelectorAll("[data-i]").forEach(b => b.addEventListener("click", () => {
      const s = all[b.dataset.i]; download(fname(s.meta.session_id, s.meta.participant_id, "json"), JSON.stringify(s, null, 1), "application/json");
    }));
    $("#admin-all").onclick = () => download(`ut-ab_all_${Date.now()}.json`, JSON.stringify(all, null, 1), "application/json");
    go("p-admin");
  }

  // ---- 시작 ----
  if (qs.has("admin")) return adminView();
  if (!CFG.variant_id) { document.body.innerHTML = '<main class="page on"><h1>링크가 올바르지 않습니다</h1><p>진행자에게 받은 링크를 그대로 열어 주세요.</p></main>'; return; }
  const active = sessionStorage.getItem("utactive");
  if (active) { // 과업 도중 새로고침: 이어하기 불가, 기록만 보존
    const prev = store.get("utlog-ab:" + active, null);
    $("#dl-json-2").onclick = () => prev && download(fname(active, prev.meta.participant_id, "json"), JSON.stringify(prev, null, 1), "application/json");
    $("#restart").onclick = () => { sessionStorage.clear(); location.reload(); };
    return go("p-interrupted");
  }
  go("p-intro");
})();
