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
4. **TLS handshake** — `ClientHello`, `ServerHello` + certificate, ECDHE key exchange, `Finished` → session keys. Notes that **TLS 1.3 completes in 1-RTT**.
5. **Encrypted HTTP request** — method + headers, sent inside the TLS tunnel.
6. **HTTP response** — status line + headers + body (the HTML).
7. **Browser renders** — HTML → DOM, CSS → CSSOM, render tree → layout → paint.

Each step also surfaces a **security angle** — DNS spoofing and DoH/DoT, SYN-flood
DoS, MITM and certificate validation, secure-cookie flags, HSTS/CSP, and the
same-origin policy — so the journey doubles as a tour of where security lives in
the stack.

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

## Deploy to GitHub Pages

Because `index.html` lives at the repository root, this deploys as-is:

1. Push the repository to GitHub.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source = Deploy from a branch**.
4. Choose your branch (e.g. `main`) and folder **`/ (root)`**, then **Save**.
5. Your site will be live at `https://<user>.github.io/<repo>/` within a minute.

No GitHub Action or build configuration is required.

---

## Features

- **Animated SVG diagram** — packets travel between the client and the
  resolver/server (and via a root/TLD/authoritative node for DNS), driven by the
  Web Animations API.
- **Prev / Next / Play / Replay controls** plus a clickable progress rail and a
  fill bar.
- **Keyboard support** — `←` / `→` to navigate, `Space` to play/pause; a skip
  link and visible focus rings.
- **Mobile-friendly** — single-column layout on small screens, two columns on
  wider viewports; the progress rail scrolls horizontally and keeps the active
  step in view.
- **Respects `prefers-reduced-motion`** — when the OS requests reduced motion,
  packets snap to their destination instead of animating and the blinking cursor
  is stilled.
- **Accessible** — semantic landmarks, `aria-label`s on controls, an
  `aria-live` caption that narrates each packet, and a meaningful `role="img"`
  description on the diagram.

---

## Project structure

```
https-explained/
├── index.html     # markup + the SVG scene skeleton
├── style.css      # dark "network/terminal" theme; all tokens in :root
├── app.js         # the STEPS data + animation engine (single source of truth)
├── README.md
└── .gitignore
```

The seven steps — their text, facts, security notes, and packet sequences — all
live in the `STEPS` array in `app.js`. To change the content or add a step, edit
that array; the diagram, panel and progress rail update automatically.

---

## Accuracy notes (intentional simplifications)

This is a teaching tool. The model is accurate in its essentials but deliberately
simplified in places:

- **TLS 1.3 handshake.** The real flow is `ClientHello` → `ServerHello`,
  `EncryptedExtensions`, `Certificate`, `CertificateVerify`, `Finished` (server),
  then client `Finished`. The app collapses this to four illustrative messages and
  highlights the key facts: the certificate proves the server's identity, keys are
  derived via **ECDHE** so the shared secret is never transmitted, and the
  handshake is **1-RTT**. TLS 1.2 needs an extra round trip; 1.3 also supports
  **0-RTT** resumption (with replay caveats), which the app mentions but doesn't
  animate.
- **DNS.** Real resolution involves caching at several levels, possible CNAME
  chains, and separate queries to root, TLD and authoritative servers. The app
  shows one representative round trip plus the hierarchy walk. The IP shown
  (`93.184.216.34`) is the well-known address historically associated with
  `example.com` and is used purely as an illustrative constant.
- **Ports.** DNS is shown on **53** (UDP, with TCP fallback for large responses);
  HTTPS on **443**. These are the IANA defaults; the URL's `:443` is normally
  omitted because it's the default for the `https` scheme.
- **TCP / TLS layering.** TLS is often described as sitting between the transport
  and application layers; the panel labels it "Presentation / Session (above TCP)"
  as a pragmatic OSI mapping rather than a strict one.
- **HTTP versions.** The app references HTTP/2 over TLS. HTTP/3 runs over **QUIC
  (UDP)** rather than TCP, which would change the handshake steps; that variant is
  out of scope for this walkthrough.

If you spot something inaccurate, that's worth fixing — correctness is the point.

---

## Tech

- Vanilla JavaScript (ES2015+), no dependencies.
- SVG for the diagram; Web Animations API for packet motion.
- CSS custom properties for theming; CSS Grid for layout.
- Google Fonts: [Inter](https://fonts.google.com/specimen/Inter) (UI) and
  [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) (terminal feel).

## License

MIT — do whatever you like; attribution appreciated.
