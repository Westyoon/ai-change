import assert from "node:assert/strict";
import test from "node:test";
import { bindTopNavigation } from "../../js/ui/top-navigation.js";
import { readFile } from "node:fs/promises";

class FakeButton {
  constructor(route) {
    this.dataset = { topRoute: route };
    this.disabled = false;
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  removeEventListener(type, listener) {
    if (this.listeners.get(type) === listener) this.listeners.delete(type);
  }

  click() {
    this.listeners.get("click")?.();
  }
}

test("pixel top-bar buttons stay locked during bootstrap and route after enable", () => {
  const account = new FakeButton("account");
  const settings = new FakeButton("settings");
  const ignored = new FakeButton("ranking");
  const calls = [];
  const navigation = bindTopNavigation(
    { querySelectorAll: () => [account, settings, ignored] },
    { navigate: (route) => calls.push(route) },
  );

  assert.equal(account.disabled, true);
  assert.equal(settings.disabled, true);
  account.click();
  assert.deepEqual(calls, []);

  navigation.enable();
  account.click();
  settings.click();
  ignored.click();
  assert.deepEqual(calls, ["account", "settings"]);

  navigation.destroy();
  assert.equal(account.disabled, true);
  assert.equal(account.listeners.size, 0);
});

test("bootstrap enables the top navigation only after content services exist", async () => {
  const source = await readFile(new URL("../../js/app.js", import.meta.url), "utf8");
  assert.match(source, /const\s+started\s*=\s*await\s+context\.router\.start/u);
  assert.match(source, /if\s*\(started\s*&&\s*context\.services\.save\)\s*topNavigation\.enable\(\)/u);
});
