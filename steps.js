/* =============================================================================
   https-explained — steps.js
   -----------------------------------------------------------------------------
   The CONTENT and pure helpers for the explainer, with zero DOM dependencies.

   Keeping this data-and-logic layer free of the DOM means it can be:
     - imported by app.js in the browser (attached to window.HTTPSExplained), and
     - imported by the Node test suite (steps.test.js) to assert the content is
       internally consistent (valid keys, directions, hash round-trips, etc.).

   A tiny UMD-style export guard at the bottom makes the same file work as a
   browser global and as a CommonJS module, with no build step and no deps.
   ========================================================================== */

(function (root, factory) {
  "use strict";
  // Export shape: CommonJS for Node tests, global object for the browser.
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.HTTPSExplained = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* Symbolic colour names; app.js maps these to CSS custom properties. Keeping
     them as plain strings here keeps this module free of any CSS coupling. */
  const COLOR = {
    out: "out",     // client -> remote
    in: "in",       // remote -> client
    violet: "violet", // TLS / crypto
    amber: "amber", // warnings
    red: "red",     // errors / danger
  };

  /* The example request the whole story is built around. */
  const EXAMPLE_URL = {
    scheme: "https",
    host: "example.com",
    port: 443,
    path: "/docs",
    /* 93.184.216.34 is the address historically published for example.com; it
       is used purely as an illustrative constant, never contacted. */
    ip: "93.184.216.34",
  };

  /* ---------------------------------------------------------------------------
     THE STEPS. Each entry is one stage of an HTTPS request.

     packet fields:
       label   - short text shown inside the moving packet
       dir     - "out" (client -> remote), "in" (remote -> client), or
                 "self" (local work on the client, no transit)
       node    - "remote" (default) or "aux" for the DNS root/TLD/auth chain
       color   - one of COLOR.* (mapped to a CSS var in app.js)
       caption - narration shown under the diagram while the packet travels
     ------------------------------------------------------------------------- */
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
        "and default port to use, and that the connection must be encrypted.",
      facts: [
        ["Layer", "Application", "layer"],
        ["Default port", "443 (https)", "port"],
        ["Also", "URL = scheme + host + port + path + query + fragment", "proto"],
      ],
      security:
        "A wrong or look-alike host is the root of phishing — for example a " +
        "<b>homograph attack</b> swaps a Latin letter for an identical-looking one from " +
        // The HTML entity below is &#1072; (U+0430), the Cyrillic small letter that looks
        // identical to a Latin "a" (U+0061). Using the numeric entity keeps this source
        // file pure ASCII while the browser still renders the look-alike character.
        "another script (a Cyrillic <code>&#1072;</code> rendered next to a Latin " +
        "<code>a</code> looks the same but is a different domain). Browsers display the " +
        "registrable domain clearly, show <b>Punycode</b> (<code>xn--</code>) for " +
        "mixed-script names, and warn on non-https to help you notice. Always read the " +
        "host, not the path.",
      // Conceptual step: a single "parse" pulse on the client, no real transit.
      packets: [
        { label: "parse", dir: "self", color: COLOR.out, caption: "Splitting the URL into scheme / host / port / path…" },
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
        "(DNS hijacking / cache poisoning). Defences: <b>DNSSEC</b> signs records so " +
        "tampering is detectable, and <b>DNS-over-HTTPS/TLS</b> (DoH/DoT) encrypts the " +
        "query to the resolver so on-path observers can't read or alter it.",
      packets: [
        { label: "A? example.com", dir: "out", color: COLOR.out, caption: "Browser → recursive resolver: “What's the IP for example.com?”" },
        { label: "root → TLD", dir: "out", node: "aux", color: COLOR.violet, caption: "Resolver walks the chain: root → .com TLD → authoritative server…" },
        { label: "93.184.216.34", dir: "in", node: "aux", color: COLOR.in, caption: "Authoritative server returns the A record (the IP address)." },
        { label: "IP", dir: "in", color: COLOR.in, caption: "Resolver → browser: here's the IP. It's cached for the record's TTL." },
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
        { label: "SYN", dir: "out", color: COLOR.out, caption: "Client → server: SYN (let's synchronise sequence numbers)." },
        { label: "SYN-ACK", dir: "in", color: COLOR.in, caption: "Server → client: SYN-ACK (acknowledged, here's mine)." },
        { label: "ACK", dir: "out", color: COLOR.out, caption: "Client → server: ACK. Connection established." },
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
        "derive the same <b>session keys</b> via Diffie-Hellman (ECDHE), then exchange " +
        "<code>Finished</code>. In <b>TLS 1.3</b> this takes just <b>one round trip (1-RTT)</b> " +
        "before encrypted data can flow; <b>TLS 1.2</b> needed two (2-RTT).",
      facts: [
        ["Layer", "Presentation / Session (above TCP)", "layer"],
        ["Port", "443 (same connection)", "port"],
        ["Protocol", "TLS 1.3 · ECDHE key exchange → session keys", "proto"],
      ],
      security:
        "TLS is what stops a <b>man-in-the-middle</b> reading or altering traffic. It only " +
        "holds if certificate validation is correct: the browser checks the cert chains to a " +
        "trusted CA, matches the host name, and isn't expired or revoked. <b>Forward secrecy</b> " +
        "(from ephemeral ECDHE keys) means a later key compromise can't decrypt past sessions. " +
        "Ignoring a cert warning throws all of this away.",
      packets: [
        { label: "ClientHello", dir: "out", color: COLOR.out, caption: "ClientHello: TLS versions, cipher suites, and the client's key-share." },
        { label: "ServerHello + cert", dir: "in", color: COLOR.violet, caption: "ServerHello + certificate + key-share. Browser validates the cert chain." },
        { label: "key exchange", dir: "out", color: COLOR.violet, caption: "Both sides run ECDHE to derive identical session keys — secrets never sent." },
        { label: "Finished \u{1F512}", dir: "in", color: COLOR.in, caption: "Finished. The channel is now encrypted and authenticated (TLS 1.3: 1-RTT)." },
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
        "<code>Cookie</code>. <b>HTTP/1.1</b> sends one request at a time per connection; " +
        "<b>HTTP/2</b> multiplexes many over one connection; <b>HTTP/3</b> does the same over " +
        "<b>QUIC</b> (UDP) to avoid head-of-line blocking.",
      facts: [
        ["Layer", "Application", "layer"],
        ["Port", "443 (encrypted)", "port"],
        ["Protocol", "HTTP/2 over TLS · method + headers + body", "proto"],
      ],
      security:
        "Because it's inside TLS, headers and cookies are protected in transit. Remaining " +
        "risks live at the application layer: send session cookies with <code>Secure</code>, " +
        "<code>HttpOnly</code> and <code>SameSite</code>, and never put secrets in the URL — " +
        "paths and query strings tend to end up in logs and <code>Referer</code> headers.",
      packets: [
        { label: "GET /docs", dir: "out", color: COLOR.out, caption: "Encrypted: GET /docs HTTP/2  ·  Host: example.com  ·  headers…" },
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
        "<b>CSP</b> (<code>Content-Security-Policy</code>) limits where scripts can load from " +
        "(mitigating XSS), and <code>X-Content-Type-Options: nosniff</code> stops MIME-type " +
        "guessing.",
      packets: [
        { label: "200 OK + HTML", dir: "in", color: COLOR.in, caption: "Encrypted: 200 OK  ·  Content-Type: text/html  ·  <!doctype html>…" },
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
        { label: "render", dir: "self", color: COLOR.in, caption: "Parsing HTML → DOM, CSS → CSSOM, then layout and paint. Pixels on screen." },
      ],
    },
  ];

  /* ---------------------------------------------------------------------------
     GLOSSARY. Plain-language definitions of the acronyms used above. Beginner
     readers can expand this on the page; the test suite checks every term that
     the steps lean on is actually defined here.
     ------------------------------------------------------------------------- */
  const GLOSSARY = [
    ["DNS", "Domain Name System — the phone book that maps a host name like example.com to an IP address."],
    ["IP address", "The numeric address of a machine on a network, e.g. 93.184.216.34 (IPv4) or an IPv6 form."],
    ["TTL", "Time To Live — how long a cached DNS answer may be reused before it must be looked up again."],
    ["TCP", "Transmission Control Protocol — delivers a reliable, ordered byte stream between two machines."],
    ["SYN / ACK", "TCP control flags: SYN starts a connection, ACK acknowledges received data."],
    ["RTT", "Round-Trip Time — how long one message takes to reach the other side and come back."],
    ["TLS", "Transport Layer Security — encrypts and authenticates a connection. The S in HTTPS."],
    ["Certificate", "A signed document proving a server owns its domain, issued by a Certificate Authority (CA)."],
    ["CA", "Certificate Authority — a trusted organisation that signs certificates the browser already trusts."],
    ["ECDHE", "Elliptic-Curve Diffie-Hellman Ephemeral — a key exchange that gives each session fresh keys (forward secrecy)."],
    ["MITM", "Man-in-the-middle — an attacker who sits between you and the server, reading or altering traffic."],
    ["HTTP", "HyperText Transfer Protocol — the request/response format browsers and servers speak."],
    ["QUIC", "A UDP-based transport that underpins HTTP/3, merging the TCP and TLS handshakes."],
    ["HSTS", "HTTP Strict Transport Security — a header that forces future visits onto HTTPS."],
    ["CSP", "Content-Security-Policy — a header restricting where scripts and other resources may load from."],
    ["DOM / CSSOM", "In-memory trees the browser builds from HTML and CSS before laying out and painting the page."],
    ["Same-origin policy", "The rule that scripts from one site can't read data belonging to another site."],
  ];

  /* ---------------------------------------------------------------------------
     Pure helpers (no DOM). Shared by the browser app and the test suite.
     ------------------------------------------------------------------------- */

  // Index of a step by its key, or -1 if unknown.
  function indexOfKey(key) {
    for (let i = 0; i < STEPS.length; i++) {
      if (STEPS[i].key === key) return i;
    }
    return -1;
  }

  // Build the URL hash for a step index, e.g. 2 -> "#step/tcp".
  function hashForIndex(i) {
    const step = STEPS[i];
    return step ? `#step/${step.key}` : "";
  }

  // Parse a location hash back into a step index, or -1 if it doesn't match.
  // Accepts "#step/tcp" and the bare "#tcp" form for convenience.
  function indexFromHash(hash) {
    if (!hash) return -1;
    const cleaned = String(hash).replace(/^#/, "");
    const key = cleaned.startsWith("step/") ? cleaned.slice("step/".length) : cleaned;
    return indexOfKey(key);
  }

  // Clamp an arbitrary number to a valid step index.
  function clampIndex(i) {
    if (Number.isNaN(i)) return 0;
    return Math.max(0, Math.min(STEPS.length - 1, i | 0));
  }

  // Resolve a packet's logical endpoints to "from"/"to" node names.
  // Returns { from, to } where each is "client" | "remote" | "aux".
  function endpointsFor(packet) {
    const far = packet.node === "aux" ? "aux" : "remote";
    if (packet.dir === "out") return { from: "client", to: far };
    if (packet.dir === "in") return { from: far, to: "client" };
    return { from: "client", to: "client" }; // "self"
  }

  return {
    COLOR,
    EXAMPLE_URL,
    STEPS,
    GLOSSARY,
    indexOfKey,
    hashForIndex,
    indexFromHash,
    clampIndex,
    endpointsFor,
  };
});
