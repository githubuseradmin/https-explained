/* =============================================================================
   https-explained — app.js
   -----------------------------------------------------------------------------
   A small, dependency-free engine that animates the 7 stages of an HTTPS
   request. Everything is driven by the STEPS array below, so the content and
   the animation stay in sync from a single source of truth.

   Design notes:
   - No frameworks, no build step. Vanilla DOM + SVG.
   - Packets are <g> elements animated with the Web Animations API (element
     .animate()), which lets us cleanly cancel/await them and respect
     prefers-reduced-motion (we snap instead of animate).
   - Each step describes a sequence of "packets" travelling between the client
     node (left) and a remote node (right), optionally via an aux node (top).
   ========================================================================== */

(() => {
  "use strict";

  /* ---------------------------------------------------------------------------
     Geometry of the SVG scene (matches the viewBox in index.html: 600 x 320).
     Coordinates are the *centres* of each node.
     ------------------------------------------------------------------------- */
  const CLIENT = { x: 120, y: 170 };
  const REMOTE = { x: 480, y: 170 };
  const AUX = { x: 480, y: 60 };

  /* Honour the user's motion preference. Re-evaluated live via the listener. */
  const reduceMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reduceMotion = reduceMotionQuery.matches;
  reduceMotionQuery.addEventListener("change", (e) => {
    reduceMotion = e.matches;
  });

  /* ---------------------------------------------------------------------------
     THE CONTENT. Each step is one stage of the request.

     packet fields:
       label    – short text shown inside the moving packet
       dir       – "out" (client → remote) or "in" (remote → client)
       node      – "remote" (default) or "aux" for the DNS root/TLD/auth chain
       color     – CSS var for the packet body
       caption  – narration shown under the diagram while the packet travels
     ------------------------------------------------------------------------- */
  const C = {
    out: "var(--packet-out)",
    in: "var(--packet-in)",
    violet: "var(--violet)",
    amber: "var(--amber)",
    red: "var(--red)",
  };

  const STEPS = [
    {
      key: "url",
      title: "URL parse",
      remote: { emoji: "\u{1F310}", label: "Server" }, // globe
      explain:
        "Before any network traffic, the browser breaks the URL into parts. " +
        "<code>https://example.com:443/docs</code> becomes a <b>scheme</b> (https), " +
        "a <b>host</b> (example.com), a <b>port</b> (443, the default for HTTPS so it's " +
        "usually omitted), and a <b>path</b> (/docs). The scheme decides which protocol " +
        "and default port to use and that the connection must be encrypted.",
      facts: [
        ["Layer", "Application", "layer"],
        ["Default port", "443 (https)", "port"],
        ["Also", "URL = scheme + host + port + path + query + fragment", "proto"],
      ],
      security:
        "A wrong or look-alike host is the root of phishing (e.g. exampхe.com using a " +
        "Cyrillic letter). Browsers display the registrable domain clearly and warn on " +
        "non-https to help you notice. Always read the host, not the path.",
      // Conceptual step: a single "parse" pulse on the client, no real transit.
      packets: [
        { label: "parse", dir: "self", color: C.out, caption: "Splitting the URL into scheme / host / port / path…" },
      ],
    },

    {
      key: "dns",
      title: "DNS resolution",
      remote: { emoji: "\u{1F5C2}️", label: "Resolver" }, // card index dividers
      aux: { label: "Root → TLD → Auth" },
      explain:
        "The host name <code>example.com</code> must be turned into an IP address. " +
        "The browser asks a <b>recursive resolver</b> (often your ISP's or a public one " +
        "like 1.1.1.1). If it isn't cached, the resolver walks the hierarchy: a " +
        "<b>root</b> server points to the <b>.com TLD</b> servers, which point to " +
        "<code>example.com</code>'s <b>authoritative</b> server, which returns the IP " +
        "in an <b>A</b> (IPv4) or <b>AAAA</b> (IPv6) record.",
      facts: [
        ["Layer", "Application", "layer"],
        ["Port", "53 (UDP, falls back to TCP)", "port"],
        ["Protocol", "DNS · returns A / AAAA record", "proto"],
      ],
      security:
        "Plain DNS is unauthenticated and unencrypted, so it can be spoofed or observed " +
        "(DNS hijacking / cache poisoning). Defences: <b>DNSSEC</b> signs records, and " +
        "<b>DNS-over-HTTPS/TLS</b> (DoH/DoT) encrypts the query to the resolver.",
      packets: [
        { label: "A? example.com", dir: "out", color: C.out, caption: "Browser → recursive resolver: “What's the IP for example.com?”" },
        { label: "root → TLD", dir: "out", node: "aux", color: C.violet, caption: "Resolver walks the chain: root → .com TLD → authoritative server…" },
        { label: "93.184.216.34", dir: "in", node: "aux", color: C.in, caption: "Authoritative server returns the A record (the IP address)." },
        { label: "IP", dir: "in", color: C.in, caption: "Resolver → browser: here's the IP. It's cached for the record's TTL." },
      ],
    },

    {
      key: "tcp",
      title: "TCP 3-way handshake",
      remote: { emoji: "\u{1F5A5}️", label: "Server" }, // desktop computer
      explain:
        "Now the browser opens a reliable connection to the server's IP on port 443 " +
        "using TCP's <b>three-way handshake</b>. The client sends <code>SYN</code> " +
        "(synchronise, with an initial sequence number); the server replies " +
        "<code>SYN-ACK</code> (acknowledging and sending its own sequence number); the " +
        "client replies <code>ACK</code>. After that, both sides agree on sequence " +
        "numbers and the connection is established.",
      facts: [
        ["Layer", "Transport", "layer"],
        ["Port", "443 (server side)", "port"],
        ["Protocol", "TCP · reliable, ordered, connection-oriented", "proto"],
      ],
      security:
        "A flood of half-open <code>SYN</code>s can exhaust server resources (a " +
        "<b>SYN flood</b> DoS). <b>SYN cookies</b> let servers avoid keeping state for " +
        "unacknowledged handshakes. TCP itself provides reliability, not secrecy — " +
        "that's TLS's job, next.",
      packets: [
        { label: "SYN", dir: "out", color: C.out, caption: "Client → server: SYN (let's synchronise sequence numbers)." },
        { label: "SYN-ACK", dir: "in", color: C.in, caption: "Server → client: SYN-ACK (acknowledged, here's mine)." },
        { label: "ACK", dir: "out", color: C.out, caption: "Client → server: ACK. Connection established." },
      ],
    },

    {
      key: "tls",
      title: "TLS handshake",
      remote: { emoji: "\u{1F510}", label: "Server" }, // closed lock with key
      explain:
        "Over the open TCP connection, TLS negotiates encryption. The client sends " +
        "<code>ClientHello</code> (supported TLS versions, cipher suites, and a key-share). " +
        "The server replies <code>ServerHello</code> with its choice, its <b>certificate</b> " +
        "(proving it owns the domain, signed by a trusted CA), and its key-share. Both sides " +
        "derive the same <b>session keys</b> via Diffie-Hellman, then exchange " +
        "<code>Finished</code>. In <b>TLS 1.3</b> this takes just <b>one round trip (1-RTT)</b> " +
        "before encrypted data can flow.",
      facts: [
        ["Layer", "Presentation / Session (above TCP)", "layer"],
        ["Port", "443 (same connection)", "port"],
        ["Protocol", "TLS 1.3 · ECDHE key exchange → session keys", "proto"],
      ],
      security:
        "TLS is what stops a <b>man-in-the-middle</b> reading or altering traffic. It only " +
        "holds if certificate validation is correct: the browser checks the cert chains to a " +
        "trusted CA, matches the host name, and isn't expired or revoked. Ignoring a cert " +
        "warning throws that protection away.",
      packets: [
        { label: "ClientHello", dir: "out", color: C.out, caption: "ClientHello: TLS versions, cipher suites, and the client's key-share." },
        { label: "ServerHello + cert", dir: "in", color: C.violet, caption: "ServerHello + certificate + key-share. Browser validates the cert chain." },
        { label: "key exchange", dir: "out", color: C.violet, caption: "Both sides run ECDHE to derive identical session keys — secrets never sent." },
        { label: "Finished \u{1F512}", dir: "in", color: C.in, caption: "Finished. The channel is now encrypted and authenticated (TLS 1.3: 1-RTT)." },
      ],
    },

    {
      key: "request",
      title: "Encrypted HTTP request",
      remote: { emoji: "\u{1F4E1}", label: "Server" }, // satellite antenna
      explain:
        "Now the browser sends the actual HTTP request — but every byte is encrypted " +
        "inside the TLS tunnel, so anyone watching the wire sees only ciphertext. A typical " +
        "request line is <code>GET /docs HTTP/2</code>, followed by headers like " +
        "<code>Host</code>, <code>User-Agent</code>, <code>Accept</code>, and any " +
        "<code>Cookie</code>. Modern sites use <b>HTTP/2</b> or <b>HTTP/3</b> for " +
        "multiplexing.",
      facts: [
        ["Layer", "Application", "layer"],
        ["Port", "443 (encrypted)", "port"],
        ["Protocol", "HTTP/2 over TLS · method + headers + body", "proto"],
      ],
      security:
        "Because it's inside TLS, headers and cookies are protected in transit. Remaining " +
        "risks live at the application layer: send session cookies with <code>Secure</code>, " +
        "<code>HttpOnly</code> and <code>SameSite</code>, and never put secrets in the URL — " +
        "paths and query strings tend to end up in logs.",
      packets: [
        { label: "GET /docs", dir: "out", color: C.out, caption: "Encrypted: GET /docs HTTP/2  ·  Host: example.com  ·  headers…" },
      ],
    },

    {
      key: "response",
      title: "HTTP response",
      remote: { emoji: "\u{1F4E6}", label: "Server" }, // package
      explain:
        "The server processes the request and sends back a response, also encrypted. It " +
        "starts with a <b>status line</b> such as <code>200 OK</code> (or 301 redirect, " +
        "404 not found, 500 server error), then response <b>headers</b> like " +
        "<code>Content-Type</code>, <code>Content-Length</code> and caching directives, " +
        "then the <b>body</b> — usually the HTML document.",
      facts: [
        ["Layer", "Application", "layer"],
        ["Port", "443 (encrypted)", "port"],
        ["Protocol", "HTTP/2 · status + headers + body (HTML)", "proto"],
      ],
      security:
        "Security headers in the response harden the page: <b>HSTS</b> " +
        "(<code>Strict-Transport-Security</code>) forces future visits onto HTTPS, " +
        "<b>CSP</b> limits where scripts can load from (mitigating XSS), and " +
        "<code>X-Content-Type-Options: nosniff</code> stops MIME-type guessing.",
      packets: [
        { label: "200 OK + HTML", dir: "in", color: C.in, caption: "Encrypted: 200 OK  ·  Content-Type: text/html  ·  <!doctype html>…" },
      ],
    },

    {
      key: "render",
      title: "Browser renders",
      remote: { emoji: "\u{1F3A8}", label: "Server" }, // artist palette
      explain:
        "Finally the browser turns bytes into pixels. It parses the HTML into the <b>DOM</b>, " +
        "parses CSS into the <b>CSSOM</b>, combines them into a <b>render tree</b>, then runs " +
        "<b>layout</b> (geometry) and <b>paint</b>. Referenced resources (CSS, JS, images, " +
        "fonts) each trigger their own requests — often reusing this very connection — " +
        "so the whole journey repeats per resource until the page is interactive.",
      facts: [
        ["Layer", "Application (client-side)", "layer"],
        ["Pipeline", "Parse → DOM + CSSOM → layout → paint", "proto"],
        ["Note", "Sub-resources reuse the open TLS connection", "proto"],
      ],
      security:
        "The browser sandboxes the page and enforces the <b>same-origin policy</b> so one " +
        "site can't read another's data. Server-set <b>CSP</b> and the sandbox together limit " +
        "what injected or malicious scripts can do once the page is live.",
      packets: [
        { label: "render", dir: "self", color: C.in, caption: "Parsing HTML → DOM, CSS → CSSOM, then layout and paint. Pixels on screen." },
      ],
    },
  ];

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
  };

  const SVG_NS = "http://www.w3.org/2000/svg";

  /* ---------------------------------------------------------------------------
     State
     ------------------------------------------------------------------------- */
  let current = 0;            // index into STEPS
  let isPlaying = false;      // auto-advance through all steps?
  let animToken = 0;          // bumped to cancel in-flight animation sequences
  let activeAnimations = [];  // Web Animations API handles we may need to cancel

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
      const id = setTimeout(() => {
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
  function pulse(nodeEl) {
    if (reduceMotion) return;
    nodeEl.classList.remove("is-pulsing");
    // force reflow so the animation can re-trigger
    void nodeEl.getBoundingClientRect();
    nodeEl.classList.add("is-pulsing");
  }

  /* ---------------------------------------------------------------------------
     Animate a single packet from A to B using the Web Animations API.
     Resolves when the packet has arrived. Honours reduced-motion by snapping.
     ------------------------------------------------------------------------- */
  function animatePacket(packet, from, to, token) {
    return new Promise((resolve, reject) => {
      if (token !== animToken) return reject(new Error("cancelled"));

      els.packets.append(packet);
      packet.setAttribute("transform", `translate(${from.x}, ${from.y})`);

      const fromNode = from === CLIENT ? els.nodeClient
        : from === AUX ? els.nodeAux : els.nodeRemote;
      const toNode = to === CLIENT ? els.nodeClient
        : to === AUX ? els.nodeAux : els.nodeRemote;

      pulse(fromNode);

      const finish = () => {
        if (token !== animToken) return reject(new Error("cancelled"));
        pulse(toNode);
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

      // Resolve endpoints.
      const remoteIsAux = p.node === "aux";
      const farPoint = remoteIsAux ? AUX : REMOTE;

      let from, to;
      if (p.dir === "out") { from = CLIENT; to = farPoint; }
      else if (p.dir === "in") { from = farPoint; to = CLIENT; }
      else { from = CLIENT; to = CLIENT; } // "self": a local pulse (parse/render)

      const packet = makePacket(p.label, p.color);

      try {
        if (p.dir === "self") {
          // Local work: show the packet at the client and pulse, no transit.
          els.packets.append(packet);
          packet.setAttribute("transform", `translate(${CLIENT.x}, ${CLIENT.y - 70})`);
          pulse(els.nodeClient);
          await wait(900, token);
        } else {
          await animatePacket(packet, from, to, token);
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

    // Panel: facts list (built safely, label text is trusted content)
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
    });
    // Progress bar fill (0% on step 1 → 100% on last step)
    const pct = STEPS.length > 1 ? (current / (STEPS.length - 1)) * 100 : 100;
    els.progressBar.style.width = `${pct}%`;

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

    // Kick off the packet animation for this step
    els.caption.textContent = "";
    runPackets(step, token);
  }

  /* ---------------------------------------------------------------------------
     Navigation
     ------------------------------------------------------------------------- */
  function goto(i) {
    current = Math.max(0, Math.min(STEPS.length - 1, i));
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

    // Keyboard shortcuts: arrows to navigate, space to play/pause.
    document.addEventListener("keydown", (e) => {
      // Ignore when typing in a form field (none here, but future-proof).
      const tag = (e.target && e.target.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if (e.key === "ArrowRight") { stopPlaying(); next(); }
      else if (e.key === "ArrowLeft") { stopPlaying(); prev(); }
      else if (e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        togglePlay();
      }
    });
  }

  /* ---------------------------------------------------------------------------
     Boot
     ------------------------------------------------------------------------- */
  function init() {
    buildProgress();
    bindControls();
    goto(0);
  }

  // The script is loaded with `defer`, so the DOM is ready here.
  init();
})();
