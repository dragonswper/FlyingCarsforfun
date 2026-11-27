import test from "node:test";
import assert from "node:assert/strict";
import { readCareer, recordCareer } from "../src/career.js";

test("unavailable browser storage cannot stop a match ending or returning to the menu", (t) => {
  const old = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      throw Error("Storage blocked");
    },
  });
  t.after(() => {
    if (old) Object.defineProperty(globalThis, "localStorage", old);
    else delete globalThis.localStorage;
  });
  assert.equal(readCareer().matches, 0);
  const result = recordCareer(
    { hits: 3, kills: 1, longestCombo: 2 },
    "ironwood",
  );
  assert.equal(result.matches, 1);
  assert.equal(result.hits, 3);
  assert.equal(result.longestCombo, 2);
});
