import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Script } from "node:vm";
import test from "node:test";

function classListFor(element) {
  return {
    add: (...names) => {
      for (const name of names) element.classes.add(name);
    },
    contains: (name) => element.classes.has(name),
    remove: (...names) => {
      for (const name of names) element.classes.delete(name);
    },
  };
}

class FakeElement {
  constructor(tagName, { classes = [], text = "" } = {}) {
    this.tagName = tagName.toUpperCase();
    this.classes = new Set(classes);
    this.classList = classListFor(this);
    this.children = [];
    this.parentElement = null;
    this.attributes = new Map();
    this.listeners = new Map();
    this.ownText = text;
    this.hidden = false;
    this.id = "";
  }

  append(...children) {
    for (const child of children) {
      child.parentElement = this;
      this.children.push(child);
    }
    return this;
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  click() {
    this.listeners.get("click")?.({ preventDefault() {} });
  }

  dispatchKey(key) {
    this.listeners.get("keydown")?.({ key, preventDefault() {} });
  }

  get textContent() {
    return `${this.ownText}${this.children.map((child) => child.textContent).join("")}`;
  }

  getAttribute(name) {
    if (name === "class") return Array.from(this.classes).join(" ");
    if (name === "id") return this.id;
    return this.attributes.get(name) ?? null;
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  setAttribute(name, value) {
    if (name === "id") {
      this.id = String(value);
      return;
    }
    this.attributes.set(name, String(value));
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector) {
    const selectors = selector.split(",").map((part) => part.trim());
    const matches = [];

    const visit = (element) => {
      if (selectors.some((part) => element.matches(part))) matches.push(element);
      for (const child of element.children) visit(child);
    };

    for (const child of this.children) visit(child);
    return matches;
  }

  matches(selector) {
    if (selector.startsWith(".")) return this.classes.has(selector.slice(1));
    if (selector === "[data-active]") return this.hasAttribute("data-active");
    return false;
  }
}

function createStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, String(value)),
  };
}

async function loadNavCollapseApi() {
  const source = await readFile(new URL("../nav-collapse.js", import.meta.url), "utf8");
  const context = {
    module: { exports: {} },
    setTimeout,
    clearTimeout,
  };
  new Script(source).runInNewContext(context);
  return context.module.exports;
}

function section(title, { active = false } = {}) {
  const titleSpan = new FakeElement("span", { text: title });
  const heading = new FakeElement("h3", { classes: ["sidebar-title"] }).append(titleSpan);
  const header = new FakeElement("div", { classes: ["sidebar-group-header"] }).append(heading);
  const list = new FakeElement("ul", { classes: ["sidebar-group"] });
  const link = new FakeElement("a", { text: `${title} page` });
  if (active) link.setAttribute("data-active", "");
  list.append(new FakeElement("li").append(link));

  return new FakeElement("div", { classes: ["mt-6", "lg:mt-8"] }).append(header, list);
}

function documentWithSections(...sections) {
  const sidebar = new FakeElement("div");
  sidebar.id = "sidebar-content";
  sidebar.append(...sections);

  return {
    querySelector: (selector) => (selector === "#sidebar-content" ? sidebar : null),
  };
}

test("enhanceSidebar collapses inactive top-level sections and keeps the active section open", async () => {
  const api = await loadNavCollapseApi();
  const aiSection = section("AI in Runway");
  const dataSection = section("Data in", { active: true });
  const storage = createStorage();

  api.enhanceSidebar(documentWithSections(aiSection, dataSection), storage);

  assert.equal(aiSection.getAttribute("data-runway-collapsed"), "true");
  assert.equal(aiSection.querySelector(".sidebar-group").hidden, true);
  assert.equal(aiSection.querySelector(".sidebar-group-header").getAttribute("aria-expanded"), "false");
  assert.equal(dataSection.getAttribute("data-runway-collapsed"), "false");
  assert.equal(dataSection.querySelector(".sidebar-group").hidden, false);
  assert.equal(dataSection.querySelector(".sidebar-group-header").getAttribute("aria-expanded"), "true");
});

test("enhanceSidebar toggles sections from click and keyboard controls", async () => {
  const api = await loadNavCollapseApi();
  const aiSection = section("AI in Runway");
  const storage = createStorage();

  api.enhanceSidebar(documentWithSections(aiSection), storage);
  const header = aiSection.querySelector(".sidebar-group-header");

  header.click();
  assert.equal(aiSection.getAttribute("data-runway-collapsed"), "false");
  assert.equal(JSON.parse(storage.getItem(api.STORAGE_KEY))["AI in Runway"], false);

  header.dispatchKey("Enter");
  assert.equal(aiSection.getAttribute("data-runway-collapsed"), "true");
  assert.equal(JSON.parse(storage.getItem(api.STORAGE_KEY))["AI in Runway"], true);
});
