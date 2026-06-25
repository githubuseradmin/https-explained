/* =============================================================================
   https-explained — app.js
   -----------------------------------------------------------------------------
   The browser engine that animates the 7 stages of an HTTPS request. All of the
   CONTENT and the pure helpers live in steps.js (exposed as
   window.HTTPSExplained) so the data layer can be unit-tested under Node with no
   DOM. This file is purely the DOM/animation glue.

   Design notes:
   - No frameworks, no build step. Vanilla DOM + SVG.
   - Packets are <g> elements animated with the Web Animations API
     (element.animate()), which lets us cleanly cancel/await them and respect
     prefers-reduced-motion (we snap instead of animate).
   - Each step describes a sequence of "packets" travelling between the client
     node (left) and a remote node (right), optionally via an aux node (top).
   - The current step is reflected in the URL hash (e.g. #step/tcp) so any step
     is deep-linkable and the browser Back/Forward buttons work.
   ========================================================================== */

(() => {
  "use strict";

  // Content + pure helpers come from steps.js. Fail loudly if it didn't load.
  const DATA = window.HTTPSExplained;
  if (!DATA) {
    // eslint-disable-next-line no-console
    console.error("https-explained: steps.js failed to load before app.js.");
    return;
  }
  const { STEPS, GLOSSARY, hashForIndex, indexFromHash, clampIndex, endpointsFor } = DATA;

  /* ---------------------------------------------------------------------------
     Geometry of the SVG scene (matches the viewBox in index.html: 600 x 320).
     Coordinates are the *centres* of each node.
     ------------------------------------------------------------------------- */
  const CLIENT = { x: 120, y: 170 };
  const REMOTE = { x: 480, y: 170 };
  const AUX = { x: 480, y: 60 };
  const POINTS = { client: CLIENT, remote: REMOTE, aux: AUX };

  /* Map the symbolic colour names from steps.js onto CSS custom properties. */
  const COLOR_VAR = {
    out: "var(--packet-out)",
    in: "var(--packet-in)",
    violet: "var(--violet)",
    amber: "var(--amber)",
    red: "var(--red)",
  };
  const colorVar = (name) => COLOR_VAR[name] || COLOR_VAR.out;

  /* Honour the user's motion preference. Re-evaluated live via the listener. */
  const reduceMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reduceMotion = reduceMotionQuery.matches;
  reduceMotionQuery.addEventListener("change", (e) => {
    reduceMotion = e.matches;
  });

  /* ---------------------------------------------------------------------------
     DOM references
     ------------------------------------------------------------------------- */
  const els = {
    progressList: document.getElementById("progress-list"),
    progressBar: document.getElementById("progress-bar"),
    stageIndex: document.getElementById("stage-index"),
    stageTitle: document.getElementById("step-title"),
    stage: document.getElementById("stage"),
    nodeRemote: document.getElementById("node-remote"),
    remoteEmoji: document.getElementById("remote-emoji"),
    remoteLabel: document.getElementById("remote-label"),
    nodeAux: document.getElementById("node-aux"),
    auxLabel: document.getElementById("aux-label"),
    nodeClient: document.getElementById("node-client"),
    packets: document.getElementById("packets"),
    caption: document.getElementById("scene-caption"),
    explain: document.getElementById("panel-explain"),
    facts: document.getElementById("panel-facts"),
    security: document.getElementById("panel-security"),
    btnPrev: document.getElementById("btn-prev"),
    btnNext: document.getElementById("btn-next"),
    btnPlay: document.getElementById("btn-play"),
    btnReplay: document.getElementById("btn-replay"),
    timeline: document.getElementById("timeline"),
    glossary: document.getElementById("glossary-list"),
  };

  const SVG_NS = "http://www.w3.org/2000/svg";

  /* ---------------------------------------------------------------------------
     State
     ------------------------------------------------------------------------- */
  let current = 0;            // index into STEPS
  let isPlaying = false;      // auto-advance through all steps?
  let animToken = 0;          // bumped to cancel in-flight animation sequences
  let activeAnimations = [];  // Web Animations API handles we may need to cancel
  let suppressHashSync = false; // guard against feedback loops when we set the hash

  /* The node element for a logical name ("client" | "remote" | "aux"). */
  function nodeEl(name) {
    if (name === "client") return els.nodeClient;
    if (name === "aux") return els.nodeAux;
    return els.nodeRemote;
  }

  /* ---------------------------------------------------------------------------
     Build the progress rail once
     ------------------------------------------------------------------------- */
  function buildProgress() {
    const frag = document.createDocumentFragment();
    STEPS.forEach((step, i) => {
      const li = document.createElement("li");
      li.className = "progress-step";
      li.dataset.index = String(i);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "progress-step-btn";
      btn.setAttribute("aria-label", `Go to step ${i + 1}: ${step.title}`);

      const num = document.createElement("span");
      num.className = "progress-step-num";
      num.textContent = String(i + 1);

      const label = document.createElement("span");
      label.className = "progress-step-label";
      label.textContent = step.title;

      btn.append(num, label);
      btn.addEventListener("click", () => {
        stopPlaying();
        goto(i);
      });

      li.append(btn);
      frag.append(li);
    });
    els.progressList.append(frag);
  }

  /* ---------------------------------------------------------------------------
     Build the "view as timeline" overview once. It is a compact, static
     summary of every step (number, title, port, one-line takeaway) that lets a
     reader scan the whole journey at a glance and jump to any step.
     ------------------------------------------------------------------------- */
  function buildTimeline() {
    if (!els.timeline) return;
    const frag = document.createDocumentFragment();
    STEPS.forEach((step, i) => {
      const portFact = step.facts.find((f) => f[2] === "port");
      const protoFact = step.facts.find((f) => f[2] === "proto");
      const meta = (portFact && portFact[1]) || (protoFact && protoFact[1]) || "";

      const item = document.createElement("li");
      item.className = "timeline-item";

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "timeline-btn";
      btn.dataset.index = String(i);
      btn.setAttribute("aria-label", `Jump to step ${i + 1}: ${step.title}`);

      const num = document.createElement("span");
      num.className = "timeline-num";
      num.textContent = String(i + 1);

      const body = document.createElement("span");
      body.className = "timeline-body";

      const t = document.createElement("span");
      t.className = "timeline-title";
      t.textContent = step.title;

      const m = document.createElement("span");
      m.className = "timeline-meta";
      m.textContent = meta;

      body.append(t, m);
      btn.append(num, body);
      btn.addEventListener("click", () => {
        stopPlaying();
        goto(i);
        els.stage.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      });

      item.append(btn);
      frag.append(item);
    });
    els.timeline.append(frag);
  }

  /* Build the glossary once from the data layer. */
  function buildGlossary() {
    if (!els.glossary) return;
    const frag = document.createDocumentFragment();
    GLOSSARY.forEach(([term, def]) => {
      const dt = document.createElement("dt");
      dt.className = "glossary-term";
      dt.textContent = term;
      const dd = document.createElement("dd");
      dd.className = "glossary-def";
      dd.textContent = def;
      frag.append(dt, dd);
    });
    els.glossary.append(frag);
  }

  /* ---------------------------------------------------------------------------
     Small helpers
     ------------------------------------------------------------------------- */

  // Cancel any running packet animations and invalidate the current sequence.
  function cancelAnimations() {
    animToken++;
    activeAnimations.forEach((a) => {
      try { a.cancel(); } catch (_) { /* already finished */ }
    });
    activeAnimations = [];
    els.packets.replaceChildren();
  }

  // Promise that resolves after `ms`, but rejects if the sequence was cancelled.
  function wait(ms, token) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        token === animToken ? resolve() : reject(new Error("cancelled"));
      }, reduceMotion ? Math.min(ms, 120) : ms);
      // No need to track the timer id: the token check guards stale resolves.
    });
  }

  // Create one packet <g> at a start point. Returns the element.
  function makePacket(text, color) {
    const g = document.createElementNS(SVG_NS, "g");
    g.setAttribute("class", "packet");
    g.style.color = color; // drives the drop-shadow via currentColor

    // Width scales a little with label length so text fits.
    const w = Math.max(54, text.length * 7.2 + 18);
    const h = 24;

    const rect = document.createElementNS(SVG_NS, "rect");
    rect.setAttribute("class", "packet-body");
    rect.setAttribute("x", String(-w / 2));
    rect.setAttribute("y", String(-h / 2));
    rect.setAttribute("width", String(w));
    rect.setAttribute("height", String(h));
    rect.setAttribute("rx", "6");
    rect.setAttribute("fill", color);

    const label = document.createElementNS(SVG_NS, "text");
    label.setAttribute("class", "packet-text");
    label.setAttribute("x", "0");
    label.setAttribute("y", "1");
    label.textContent = text;

    g.append(rect, label);
    return g;
  }

  // Briefly pulse a node's ring (visual "send/receive" feedback).
  function pulse(el) {
    if (reduceMotion || !el) return;
    el.classList.remove("is-pulsing");
    // force reflow so the animation can re-trigger
    void el.getBoundingClientRect();
    el.classList.add("is-pulsing");
  }

  /* ---------------------------------------------------------------------------
     Animate a single packet from A to B using the Web Animations API.
     Resolves when the packet has arrived. Honours reduced-motion by snapping.
     `from` and `to` are points from POINTS; `fromName`/`toName` are the logical
     node names used to pulse the right node.
     ------------------------------------------------------------------------- */
  function animatePacket(packet, from, to, fromName, toName, token) {
    return new Promise((resolve, reject) => {
      if (token !== animToken) return reject(new Error("cancelled"));

      els.packets.append(packet);
      packet.setAttribute("transform", `translate(${from.x}, ${from.y})`);

      pulse(nodeEl(fromName));

      const finish = () => {
        if (token !== animToken) return reject(new Error("cancelled"));
        pulse(nodeEl(toName));
        resolve();
      };

      if (reduceMotion) {
        // Snap to destination; no continuous motion.
        packet.setAttribute("transform", `translate(${to.x}, ${to.y})`);
        setTimeout(finish, 90);
        return;
      }

      const anim = packet.animate(
        [
          { transform: `translate(${from.x}px, ${from.y}px)`, opacity: 0.2, offset: 0 },
          { opacity: 1, offset: 0.12 },
          { opacity: 1, offset: 0.88 },
          { transform: `translate(${to.x}px, ${to.y}px)`, opacity: 0.2, offset: 1 },
        ],
        { duration: 1400, easing: "cubic-bezier(0.45, 0, 0.55, 1)", fill: "forwards" }
      );
      activeAnimations.push(anim);
      anim.addEventListener("finish", finish, { once: true });
      anim.addEventListener("cancel", () => reject(new Error("cancelled")), { once: true });
    });
  }

  /* ---------------------------------------------------------------------------
     Play through the packet sequence of the current step.
     ------------------------------------------------------------------------- */
  async function runPackets(step, token) {
    for (const p of step.packets) {
      if (token !== animToken) return;

      els.caption.textContent = p.caption;

      const { from: fromName, to: toName } = endpointsFor(p);
      const from = POINTS[fromName];
      const to = POINTS[toName];

      const packet = makePacket(p.label, colorVar(p.color));

      try {
        if (p.dir === "self") {
          // Local work: show the packet at the client and pulse, no transit.
          els.packets.append(packet);
          packet.setAttribute("transform", `translate(${CLIENT.x}, ${CLIENT.y - 70})`);
          pulse(els.nodeClient);
          await wait(900, token);
        } else {
          await animatePacket(packet, from, to, fromName, toName, token);
          await wait(reduceMotion ? 40 : 220, token);
        }
      } catch (_) {
        return; // cancelled — bail out quietly
      }

      // Remove the packet after it lands (keep the scene tidy).
      if (token === animToken) packet.remove();
    }

    // Sequence finished. If auto-playing, advance to the next step.
    if (token === animToken && isPlaying) {
      try { await wait(650, token); } catch (_) { return; }
      if (token !== animToken) return;
      if (current < STEPS.length - 1) {
        goto(current + 1);
      } else {
        stopPlaying(); // reached the end
      }
    }
  }

  /* ---------------------------------------------------------------------------
     Render a step: update panel text, progress rail, node roles, then animate.
     ------------------------------------------------------------------------- */
  function render() {
    const step = STEPS[current];
    cancelAnimations();
    const token = animToken;

    // Header
    const idx = String(current + 1).padStart(2, "0");
    const total = String(STEPS.length).padStart(2, "0");
    els.stageIndex.textContent = `${idx} / ${total}`;
    els.stageTitle.textContent = step.title;

    // Remote node role (emoji + label)
    els.remoteEmoji.textContent = step.remote.emoji;
    els.remoteLabel.textContent = step.remote.label;

    // Aux node visibility (only the DNS step uses it)
    if (step.aux) {
      els.auxLabel.textContent = step.aux.label;
      els.nodeAux.setAttribute("opacity", "1");
    } else {
      els.nodeAux.setAttribute("opacity", "0");
    }

    // Panel: explanation
    els.explain.innerHTML = step.explain;

    // Panel: facts list (built safely; values are trusted in-repo content)
    els.facts.replaceChildren();
    step.facts.forEach(([term, value, tagClass]) => {
      const dt = document.createElement("dt");
      dt.textContent = term;
      const dd = document.createElement("dd");
      const tag = document.createElement("span");
      tag.className = `fact-tag ${tagClass || ""}`.trim();
      tag.textContent = value;
      dd.append(tag);
      els.facts.append(dt, dd);
    });

    // Panel: security note
    els.security.innerHTML = step.security;

    // Progress rail state
    Array.from(els.progressList.children).forEach((li, i) => {
      li.classList.toggle("is-active", i === current);
      li.classList.toggle("is-done", i < current);
      const btn = li.querySelector(".progress-step-btn");
      if (btn) btn.setAttribute("aria-current", i === current ? "step" : "false");
    });
    // Progress bar fill (0% on step 1 → 100% on last step)
    const pct = STEPS.length > 1 ? (current / (STEPS.length - 1)) * 100 : 100;
    els.progressBar.style.width = `${pct}%`;

    // Timeline active state
    if (els.timeline) {
      Array.from(els.timeline.querySelectorAll(".timeline-btn")).forEach((btn, i) => {
        btn.classList.toggle("is-active", i === current);
        btn.setAttribute("aria-current", i === current ? "step" : "false");
      });
    }

    // Entrance animation on the panel content
    [els.explain, els.facts, els.security].forEach((el) => {
      el.classList.remove("step-enter");
      void el.offsetWidth; // reflow to restart animation
      el.classList.add("step-enter");
    });

    // Prev/Next disabled states
    els.btnPrev.disabled = current === 0;
    els.btnNext.disabled = current === STEPS.length - 1;

    // Keep the active progress chip in view on small screens
    const activeChip = els.progressList.children[current];
    if (activeChip && activeChip.scrollIntoView) {
      activeChip.scrollIntoView({ inline: "center", block: "nearest", behavior: reduceMotion ? "auto" : "smooth" });
    }

    // Reflect the step in the URL hash so it is deep-linkable.
    syncHash();

    // Kick off the packet animation for this step
    els.caption.textContent = "";
    runPackets(step, token);
  }

  /* ---------------------------------------------------------------------------
     URL hash <-> step syncing (deep links + Back/Forward)
     ------------------------------------------------------------------------- */
  function syncHash() {
    const want = hashForIndex(current);
    if (want && window.location.hash !== want) {
      suppressHashSync = true;
      // replaceState avoids spamming history on every auto-play advance, while
      // still updating the address bar so the link is copyable.
      try {
        history.replaceState(null, "", want);
      } catch (_) {
        window.location.hash = want; // file:// fallback
      }
      suppressHashSync = false;
    }
  }

  function onHashChange() {
    if (suppressHashSync) return;
    const i = indexFromHash(window.location.hash);
    if (i >= 0 && i !== current) {
      stopPlaying();
      current = i;
      render();
    }
  }

  /* ---------------------------------------------------------------------------
     Navigation
     ------------------------------------------------------------------------- */
  function goto(i) {
    current = clampIndex(i);
    render();
  }

  function next() {
    if (current < STEPS.length - 1) goto(current + 1);
  }

  function prev() {
    if (current > 0) goto(current - 1);
  }

  function replay() {
    render(); // re-render restarts the current step's animation
  }

  /* ---------------------------------------------------------------------------
     Play / pause
     ------------------------------------------------------------------------- */
  function startPlaying() {
    isPlaying = true;
    els.btnPlay.classList.add("is-playing");
    els.btnPlay.querySelector(".btn-play-icon").textContent = "❚❚"; // pause bars
    els.btnPlay.querySelector(".btn-play-text").textContent = "Pause";
    els.btnPlay.setAttribute("aria-label", "Pause the animation");
    els.btnPlay.setAttribute("aria-pressed", "true");
    // If we're on the last step, restart from the beginning.
    if (current === STEPS.length - 1) goto(0);
    else render(); // restart current step so it advances cleanly
  }

  function stopPlaying() {
    if (!isPlaying) return;
    isPlaying = false;
    els.btnPlay.classList.remove("is-playing");
    els.btnPlay.querySelector(".btn-play-icon").textContent = "▶"; // play triangle
    els.btnPlay.querySelector(".btn-play-text").textContent = "Play";
    els.btnPlay.setAttribute("aria-label", "Play the animation through all steps");
    els.btnPlay.setAttribute("aria-pressed", "false");
  }

  function togglePlay() {
    isPlaying ? stopPlaying() : startPlaying();
  }

  /* ---------------------------------------------------------------------------
     Wire up controls
     ------------------------------------------------------------------------- */
  function bindControls() {
    els.btnPrev.addEventListener("click", () => { stopPlaying(); prev(); });
    els.btnNext.addEventListener("click", () => { stopPlaying(); next(); });
    els.btnReplay.addEventListener("click", () => { stopPlaying(); replay(); });
    els.btnPlay.addEventListener("click", togglePlay);

    // React to deep links / Back-Forward navigation.
    window.addEventListener("hashchange", onHashChange);

    // Keyboard shortcuts: arrows / J-K / Home-End to navigate, space to play.
    document.addEventListener("keydown", (e) => {
      // Ignore when typing in a form field, or with a modifier held.
      const tag = (e.target && e.target.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA" || e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case "ArrowRight":
        case "l":
        case "j":
          stopPlaying(); next(); break;
        case "ArrowLeft":
        case "h":
        case "k":
          stopPlaying(); prev(); break;
        case "Home":
          e.preventDefault(); stopPlaying(); goto(0); break;
        case "End":
          e.preventDefault(); stopPlaying(); goto(STEPS.length - 1); break;
        case "r":
          stopPlaying(); replay(); break;
        case " ":
        case "Spacebar":
          e.preventDefault(); togglePlay(); break;
        default:
          break;
      }
    });
  }

  /* ---------------------------------------------------------------------------
     Boot
     ------------------------------------------------------------------------- */
  function init() {
    buildProgress();
    buildTimeline();
    buildGlossary();
    bindControls();
    // Honour a deep link if one is present, otherwise start at step 1.
    const fromHash = indexFromHash(window.location.hash);
    goto(fromHash >= 0 ? fromHash : 0);
  }

  // The script is loaded with `defer`, so the DOM is ready here.
  init();
})();
