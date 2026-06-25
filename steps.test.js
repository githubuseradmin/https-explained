/* =============================================================================
   https-explained — steps.test.js
   -----------------------------------------------------------------------------
   Unit tests for the pure data/logic layer in steps.js. They run under Node's
   built-in test runner with no third-party dependencies:

       node --test

   The point of these tests is to catch content drift: a step with an unknown
   packet direction, a hash that doesn't round-trip, a glossary that forgot a
   term the steps rely on, and so on. None of this needs a browser or a DOM.
   ========================================================================== */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  STEPS,
  GLOSSARY,
  EXAMPLE_URL,
  indexOfKey,
  hashForIndex,
  indexFromHash,
  clampIndex,
  endpointsFor,
} = require("./steps.js");

const VALID_DIRS = new Set(["out", "in", "self"]);
const VALID_NODES = new Set([undefined, "remote", "aux"]);

test("there are exactly seven steps in canonical order", () => {
  assert.equal(STEPS.length, 7);
  const keys = STEPS.map((s) => s.key);
  assert.deepEqual(keys, ["url", "dns", "tcp", "tls", "request", "response", "render"]);
});

test("every step has the required fields and non-empty content", () => {
  for (const step of STEPS) {
    assert.ok(step.key, "key");
    assert.ok(step.title, `title for ${step.key}`);
    assert.ok(step.remote && step.remote.emoji && step.remote.label, `remote for ${step.key}`);
    assert.ok(step.explain.length > 40, `explain for ${step.key}`);
    assert.ok(step.security.length > 40, `security for ${step.key}`);
    assert.ok(Array.isArray(step.facts) && step.facts.length >= 1, `facts for ${step.key}`);
    assert.ok(Array.isArray(step.packets) && step.packets.length >= 1, `packets for ${step.key}`);
  }
});

test("step keys are unique", () => {
  const seen = new Set();
  for (const step of STEPS) {
    assert.equal(seen.has(step.key), false, `duplicate key ${step.key}`);
    seen.add(step.key);
  }
});

test("every fact is a [term, value, tagClass] triple with a known tag", () => {
  const KNOWN_TAGS = new Set(["layer", "port", "proto"]);
  for (const step of STEPS) {
    for (const fact of step.facts) {
      assert.equal(fact.length, 3, `fact shape in ${step.key}`);
      const [term, value, tag] = fact;
      assert.ok(term && value, `fact text in ${step.key}`);
      assert.ok(KNOWN_TAGS.has(tag), `unknown fact tag "${tag}" in ${step.key}`);
    }
  }
});

test("every packet has a valid direction, node and caption", () => {
  for (const step of STEPS) {
    for (const p of step.packets) {
      assert.ok(VALID_DIRS.has(p.dir), `bad dir "${p.dir}" in ${step.key}`);
      assert.ok(VALID_NODES.has(p.node), `bad node "${p.node}" in ${step.key}`);
      assert.ok(p.label && p.label.length > 0, `packet label in ${step.key}`);
      assert.ok(p.caption && p.caption.length > 0, `packet caption in ${step.key}`);
    }
  }
});

test("only the DNS step uses the aux node, and it declares aux meta", () => {
  for (const step of STEPS) {
    const usesAux = step.packets.some((p) => p.node === "aux");
    if (step.key === "dns") {
      assert.equal(usesAux, true, "dns should use aux");
      assert.ok(step.aux && step.aux.label, "dns should declare aux meta");
    } else {
      assert.equal(usesAux, false, `${step.key} should not use aux`);
      assert.equal(step.aux, undefined, `${step.key} should not declare aux meta`);
    }
  }
});

test("indexOfKey finds known keys and rejects unknown ones", () => {
  assert.equal(indexOfKey("url"), 0);
  assert.equal(indexOfKey("render"), STEPS.length - 1);
  assert.equal(indexOfKey("tcp"), 2);
  assert.equal(indexOfKey("nope"), -1);
  assert.equal(indexOfKey(""), -1);
});

test("hashForIndex and indexFromHash round-trip for every step", () => {
  for (let i = 0; i < STEPS.length; i++) {
    const hash = hashForIndex(i);
    assert.match(hash, /^#step\/[a-z]+$/, `hash shape for ${i}`);
    assert.equal(indexFromHash(hash), i, `round-trip for ${i}`);
  }
});

test("indexFromHash accepts the bare '#key' form and rejects junk", () => {
  assert.equal(indexFromHash("#tcp"), 2);
  assert.equal(indexFromHash("#step/tls"), 3);
  assert.equal(indexFromHash("tcp"), 2); // tolerate a missing leading '#'
  assert.equal(indexFromHash("#step/unknown"), -1);
  assert.equal(indexFromHash("#"), -1);
  assert.equal(indexFromHash(""), -1);
  assert.equal(indexFromHash(null), -1);
});

test("clampIndex keeps indices in range and tolerates bad input", () => {
  assert.equal(clampIndex(-5), 0);
  assert.equal(clampIndex(0), 0);
  assert.equal(clampIndex(3), 3);
  assert.equal(clampIndex(999), STEPS.length - 1);
  assert.equal(clampIndex(NaN), 0);
  assert.equal(clampIndex(2.9), 2); // truncates toward zero
});

test("endpointsFor maps directions to the right nodes", () => {
  assert.deepEqual(endpointsFor({ dir: "out" }), { from: "client", to: "remote" });
  assert.deepEqual(endpointsFor({ dir: "in" }), { from: "remote", to: "client" });
  assert.deepEqual(endpointsFor({ dir: "self" }), { from: "client", to: "client" });
  assert.deepEqual(endpointsFor({ dir: "out", node: "aux" }), { from: "client", to: "aux" });
  assert.deepEqual(endpointsFor({ dir: "in", node: "aux" }), { from: "aux", to: "client" });
});

test("the glossary has no duplicate terms and every entry is defined", () => {
  const terms = new Set();
  for (const [term, def] of GLOSSARY) {
    assert.ok(term && def, "glossary entry");
    assert.ok(def.length > 15, `definition for ${term} should be a real sentence`);
    assert.equal(terms.has(term), false, `duplicate glossary term ${term}`);
    terms.add(term);
  }
});

test("the glossary covers the core acronyms the steps lean on", () => {
  const haystack = GLOSSARY.map((g) => g[0]).join(" | ");
  for (const needle of ["DNS", "TCP", "TLS", "RTT", "ECDHE", "MITM", "HSTS", "CSP", "QUIC"]) {
    assert.ok(haystack.includes(needle), `glossary should define ${needle}`);
  }
});

test("the illustrative IP is internally consistent across data and DNS step", () => {
  // The DNS step's inbound A-record packet should carry the same IP constant.
  const dns = STEPS.find((s) => s.key === "dns");
  const carries = dns.packets.some((p) => p.label.includes(EXAMPLE_URL.ip));
  assert.equal(carries, true, "DNS step should return EXAMPLE_URL.ip");
});

test("no raw Cyrillic characters leak into rendered step content", () => {
  // The homograph teaching example must be expressed as an HTML entity, not a raw
  // Cyrillic literal that a code-quality scan would flag. The range below is written
  // with \u escapes so this assertion is itself pure ASCII.
  const cyrillic = /[\u0400-\u04FF]/;
  for (const step of STEPS) {
    const blob = JSON.stringify(step);
    assert.equal(cyrillic.test(blob), false, `raw Cyrillic found in step ${step.key}`);
  }
});
