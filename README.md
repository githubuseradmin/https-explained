English | [Русский](README.ru.md)

# https-explained

An interactive, animated single-page explainer of **what actually happens when you
type an `https://` URL and press Enter** — from URL parsing all the way to the
browser painting pixels.

It is built for people who want a *correct* mental model of the request lifecycle:
DNS, TCP, TLS, HTTP and rendering, each as a navigable step with a moving-packet
diagram, a precise explanation, the relevant OSI layer / port / protocol, and a
"what could go wrong" security note.

Pure HTML / CSS / JavaScript. **No build step, no framework, no runtime
dependencies.** The only network asset is a Google Font loaded via `<link>`.

---

## What it teaches

The app walks through the seven stages of an HTTPS request:

1. **URL parse** — splitting `https://example.com:443/docs` into scheme / host / port / path.
2. **DNS resolution** — recursive resolver → root → TLD → authoritative server, returning the IP (A/AAAA record), over port **53**.
3. **TCP 3-way handshake** — `SYN` / `SYN-ACK` / `ACK` to establish a reliable connection on port **443**.
4. **TLS handshake** — `ClientHello`, `ServerHello` + certificate, ECDHE key exchange, `Finished` → session keys. Notes that **TLS 1.3 completes in 1-RTT** where **TLS 1.2 needed 2-RTT**, and that ephemeral ECDHE gives **forward secrecy**.
5. **Encrypted HTTP request** — method + headers, sent inside the TLS tunnel; contrasts **HTTP/1.1** (one request at a time) with **HTTP/2** (multiplexed) and **HTTP/3** (over QUIC/UDP).
6. **HTTP response** — status line + headers + body (the HTML).
7. **Browser renders** — HTML → DOM, CSS → CSSOM, render tree → layout → paint.

Each step also surfaces a **security angle** — homograph/Punycode phishing, DNS
spoofing and DoH/DoT, SYN-flood DoS, MITM and certificate validation, secure-cookie
flags, HSTS/CSP, and the same-origin policy — so the journey doubles as a tour of
where security lives in the stack.

---

## Features

- **Animated SVG diagram** — packets travel between the client and the
  resolver/server (and via a root/TLD/authoritative node for DNS), driven by the
  Web Animations API.
- **Prev / Next / Play / Replay controls** plus a clickable progress rail and a
  fill bar.
- **"At a glance" timeline** — a compact overview of all seven stages you can scan
  in one view and click to jump to any step.
- **Glossary** — plain-language definitions of every acronym (DNS, TCP, TLS, RTT,
  ECDHE, MITM, HSTS, CSP, QUIC, …) so a beginner is never left guessing.
- **Deep-linkable steps** — the current step lives in the URL hash (e.g.
  `#step/tls`), so you can link straight to a stage and the browser's Back/Forward
  buttons navigate between steps.
- **Keyboard support** — `←` / `→` (or `h`/`l`, `j`/`k`) to navigate, `Space` to
  play/pause, `R` to replay, `Home`/`End` for first/last. An on-screen hint legend
  shows the shortcuts; a skip link and visible focus rings round it out.
- **Mobile-friendly** — single-column layout on small screens, two columns on
  wider viewports; the progress rail scrolls horizontally and keeps the active
  step in view; no horizontal overflow.
- **Respects `prefers-reduced-motion`** — when the OS requests reduced motion,
  packets snap to their destination instead of animating and the blinking cursor
  is stilled.
- **Accessible** — semantic landmarks, `aria-label`s and `aria-current`/`aria-pressed`
  state on controls, an `aria-live` caption that narrates each packet, and a
  meaningful `role="img"` description on the diagram.

---

## Run it locally

It's a static site, so just open the file:

```bash
# Option A: open directly
#   double-click index.html, or
open index.html            # macOS
start index.html           # Windows
xdg-open index.html        # Linux

# Option B: serve it (nicer; avoids any file:// quirks)
python3 -m http.server 8000
# then visit http://localhost:8000
```

No installation, no `npm install`, nothing to compile.

---

## Tests

The content and the pure logic live in `steps.js` with **zero DOM dependencies**, so
they can be unit-tested under Node with no browser and no third-party libraries. The
suite uses Node's built-in test runner:

```bash
node --test
```

It checks that the content stays internally consistent — seven steps in the right
order, every packet has a valid direction/node, only the DNS step uses the auxiliary
node, the glossary covers every acronym the steps rely on, the URL-hash helpers
round-trip for every step, and that **no raw Cyrillic characters leak into the
rendered content** (the homograph example is emitted as an HTML entity so the source
stays pure ASCII).

You can also parse-check the scripts without running anything:

```bash
node --check steps.js
node --check app.js
node --check steps.test.js
```

Example output:

```
$ node --test
✔ there are exactly seven steps in canonical order
✔ every step has the required fields and non-empty content
✔ hashForIndex and indexFromHash round-trip for every step
✔ the glossary covers the core acronyms the steps lean on
✔ no raw Cyrillic characters leak into rendered step content
ℹ tests 15
ℹ pass 15
ℹ fail 0
```

---

## Use in teaching / course

This piece is designed to double as **course material for an introductory networking
or web-security module**. It is deliberately beginner-friendly and self-explanatory:

- **Project a single step at a time.** Each stage is a self-contained slide — open
  the page, press `→`, and talk over the diagram while packets move.
- **Deep-link from your notes or LMS.** Every step has a stable URL hash
  (`#step/dns`, `#step/tls`, …). Drop those links into slides, a wiki, or an
  assignment so students land exactly where you want them.
- **Use the glossary as a vocabulary handout.** It maps every acronym to one plain
  sentence — a ready-made cheat sheet for a quiz or revision.
- **Use the security notes as discussion prompts.** Each "what could go wrong" card
  is a natural seed for a question ("why is plain DNS spoofable, and what fixes it?").
- **Extend it as an exercise.** Because every step is one entry in the `STEPS` array
  in `steps.js`, asking students to add a step (for example HTTP/3 over QUIC) or to
  correct a simplification is a contained, satisfying coding task — and the test
  suite gives them immediate feedback.

The "Accuracy notes" section below is intended to be read alongside the app so the
simplifications are explicit rather than misleading.

---

## Deploy to GitHub Pages

Because `index.html` lives at the repository root, this deploys as-is:

1. Push the repository to GitHub.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source = Deploy from a branch**.
4. Choose your branch (e.g. `main`) and folder **`/ (root)`**, then **Save**.
5. Your site will be live at `https://<user>.github.io/<repo>/` within a minute.

No GitHub Action or build configuration is required.

---

## Project structure

```
https-explained/
├── index.html      # markup + the SVG scene skeleton + timeline/glossary containers
├── style.css       # dark "network/terminal" theme; all tokens in :root
├── steps.js        # the STEPS + GLOSSARY data and pure helpers (no DOM) — testable
├── app.js          # the DOM/animation engine that consumes steps.js
├── steps.test.js   # Node unit tests for the data + helpers (node --test)
├── README.md
├── README.ru.md    # Russian translation
└── .gitignore
```

The seven steps — their text, facts, security notes, and packet sequences — and the
glossary all live in `steps.js`. To change the content or add a step, edit that file;
the diagram, panel, progress rail, timeline and glossary update automatically, and the
test suite verifies the result is consistent.

---

## Accuracy notes (intentional simplifications)

This is a teaching tool. The model is accurate in its essentials but deliberately
simplified in places:

- **TLS 1.3 handshake.** The real flow is `ClientHello` → `ServerHello`,
  `EncryptedExtensions`, `Certificate`, `CertificateVerify`, `Finished` (server),
  then client `Finished`. The app collapses this to four illustrative messages and
  highlights the key facts: the certificate proves the server's identity, keys are
  derived via **ECDHE** (so the shared secret is never transmitted and each session
  gets **forward secrecy**), and the handshake is **1-RTT**. TLS 1.2 needs an extra
  round trip (2-RTT); 1.3 also supports **0-RTT** resumption (with replay caveats),
  which the app mentions but doesn't animate.
- **DNS.** Real resolution involves caching at several levels, possible CNAME
  chains, and separate queries to root, TLD and authoritative servers. The app
  shows one representative round trip plus the hierarchy walk. The IP shown
  (`93.184.216.34`) is the well-known address historically associated with
  `example.com` and is used purely as an illustrative constant; nothing is contacted.
- **Ports.** DNS is shown on **53** (UDP, with TCP fallback for large responses);
  HTTPS on **443**. These are the IANA defaults; the URL's `:443` is normally
  omitted because it's the default for the `https` scheme.
- **TCP / TLS layering.** TLS is often described as sitting between the transport
  and application layers; the panel labels it "Presentation / Session (above TCP)"
  as a pragmatic OSI mapping rather than a strict one.
- **HTTP versions.** The app references HTTP/2 over TLS and notes the differences
  between HTTP/1.1, HTTP/2 and HTTP/3. HTTP/3 runs over **QUIC (UDP)** rather than
  TCP and merges the transport and TLS handshakes, which would change the earlier
  steps; animating that variant is out of scope for this walkthrough.
- **Homograph example.** The phishing card shows a Cyrillic `а` (U+0430) next to a
  Latin `a` (U+0061). In the source it is written as the HTML entity `&#1072;` so
  the files stay pure ASCII while the browser still renders the look-alike.

If you spot something inaccurate, that's worth fixing — correctness is the point.

---

## Tech

- Vanilla JavaScript (ES2015+), no dependencies.
- A small UMD-style export guard lets `steps.js` work as a browser global *and* a
  CommonJS module, so the same file powers the page and the Node tests — still with
  no build step.
- SVG for the diagram; Web Animations API for packet motion.
- CSS custom properties for theming; CSS Grid for layout.
- Google Fonts: [Inter](https://fonts.google.com/specimen/Inter) (UI) and
  [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) (terminal feel).

## License

MIT — do whatever you like; attribution appreciated.
