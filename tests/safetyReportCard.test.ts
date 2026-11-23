import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// Minimal DOM so React 19's client renderer can mount in Node (no jsdom dependency).
class MiniNode {
  childNodes: MiniNode[] = [];
  parentNode: MiniNode | null = null;
  nodeType = 1;
  __handlers: Record<string, Function[]> = {};
  addEventListener(type: string, fn: Function) { (this.__handlers[type] ||= []).push(fn); }
  removeEventListener(type: string, fn: Function) { this.__handlers[type] = (this.__handlers[type] || []).filter(f => f !== fn); }
  dispatchEvent(ev: { type: string }) { for (const fn of this.__handlers[ev?.type] || []) fn(ev); return true; }
  contains(node: MiniNode) { return node === this || this.childNodes.some(child => child.contains(node)); }
  appendChild(child: MiniNode) {
    child.parentNode?.removeChild(child);
    this.childNodes.push(child);
    child.parentNode = this;
    return child;
  }
  removeChild(child: MiniNode) {
    const index = this.childNodes.indexOf(child);
    if (index >= 0) { this.childNodes.splice(index, 1); child.parentNode = null; }
    return child;
  }
  insertBefore(child: MiniNode, ref: MiniNode | null) {
    if (!ref) return this.appendChild(child);
    child.parentNode?.removeChild(child);
    const index = this.childNodes.indexOf(ref);
    this.childNodes.splice(index < 0 ? this.childNodes.length : index, 0, child);
    child.parentNode = this;
    return child;
  }
  get firstChild() { return this.childNodes[0] || null; }
  get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; }
  get nextSibling() {
    if (!this.parentNode) return null;
    return this.parentNode.childNodes[this.parentNode.childNodes.indexOf(this) + 1] || null;
  }
  get previousSibling() {
    if (!this.parentNode) return null;
    return this.parentNode.childNodes[this.parentNode.childNodes.indexOf(this) - 1] || null;
  }
  get textContent(): string { return this.childNodes.map(child => child.textContent).join(''); }
  set textContent(value: string) { while (this.childNodes.length) this.removeChild(this.childNodes[0]); if (value) this.appendChild(new MiniText(value)); }
}
class MiniText extends MiniNode {
  data: string;
  nodeName = '#text';
  constructor(data = '') { super(); this.nodeType = 3; this.data = String(data); }
  get textContent() { return this.data; }
  set textContent(value: string) { this.data = String(value); }
  contains() { return false; }
}
class MiniComment extends MiniNode {
  data: string;
  nodeName = '#comment';
  constructor(data = '') { super(); this.nodeType = 8; this.data = String(data); }
  get textContent() { return this.data; }
  contains() { return false; }
}
const escapeHtml = (value: string) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
class MiniElement extends MiniNode {
  tagName: string;
  nodeName: string;
  localName: string;
  attributes = new Map<string, string>();
  style: Record<string, string> = {};
  ownerDocument: MiniDocument;
  constructor(tag: string, owner: MiniDocument) {
    super();
    this.tagName = String(tag).toUpperCase();
    this.nodeName = this.tagName;
    this.localName = String(tag).toLowerCase();
    this.ownerDocument = owner;
  }
  setAttribute(name: string, value: string) { this.attributes.set(name, String(value)); }
  getAttribute(name: string) { return this.attributes.has(name) ? this.attributes.get(name)! : null; }
  removeAttribute(name: string) { this.attributes.delete(name); }
  hasAttribute(name: string) { return this.attributes.has(name); }
  get innerHTML(): string {
    return this.childNodes.map(child => {
      if (child.nodeType === 3) return escapeHtml((child as MiniText).data);
      if (child.nodeType === 8) return `<!--${(child as MiniComment).data}-->`;
      const element = child as MiniElement;
      const attrs = [...element.attributes.entries()].map(([name, value]) => ` ${name}="${escapeHtml(value)}"`).join('');
      return `<${element.localName}${attrs}>${element.innerHTML}</${element.localName}>`;
    }).join('');
  }
  set innerHTML(_value: string) { while (this.childNodes.length) this.removeChild(this.childNodes[0]); }
  get className() { return this.getAttribute('class') || ''; }
  set className(value: string) { this.setAttribute('class', value); }
  get id() { return this.getAttribute('id') || ''; }
  set id(value: string) { this.setAttribute('id', value); }
}
class HTMLIFrameElement extends MiniElement {}
class HTMLInputElement extends MiniElement {}
class HTMLTextAreaElement extends MiniElement {}
class HTMLSelectElement extends MiniElement {}
class HTMLElement extends MiniElement {}
class MiniDocument extends MiniNode {
  nodeName = '#document';
  documentElement: MiniElement;
  head: MiniElement;
  body: MiniElement;
  defaultView: unknown = null;
  activeElement: MiniElement;
  constructor() {
    super();
    this.nodeType = 9;
    this.documentElement = new MiniElement('html', this);
    this.head = new MiniElement('head', this);
    this.body = new MiniElement('body', this);
    this.documentElement.appendChild(this.head);
    this.documentElement.appendChild(this.body);
    this.activeElement = this.body;
  }
  createElement(tag: string) { return new MiniElement(tag, this); }
  createElementNS(_ns: string, tag: string) { return new MiniElement(tag, this); }
  createTextNode(data: string) { return new MiniText(data); }
  createComment(data: string) { return new MiniComment(data); }
  getElementById(id: string) {
    const walk = (node: MiniNode): MiniElement | null => {
      if (node.nodeType === 1 && (node as MiniElement).id === id) return node as MiniElement;
      for (const child of node.childNodes) { const match = walk(child); if (match) return match; }
      return null;
    };
    return walk(this.documentElement);
  }
}

const document = new MiniDocument();
const window = {
  document,
  HTMLElement,
  HTMLIFrameElement,
  HTMLInputElement,
  HTMLTextAreaElement,
  HTMLSelectElement,
  Element: MiniElement,
  Node: MiniNode,
  Text: MiniText,
  Comment: MiniComment,
  Document: MiniDocument,
  requestAnimationFrame: (cb: Function) => setTimeout(cb, 0),
  cancelAnimationFrame: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
  addEventListener() {},
  removeEventListener() {},
  getComputedStyle: () => ({ getPropertyValue: () => '' }),
};
document.defaultView = window;
(window as any).window = window;
Object.assign(globalThis, {
  window, document, HTMLElement, HTMLIFrameElement, HTMLInputElement, HTMLTextAreaElement,
  HTMLSelectElement, IS_REACT_ACT_ENVIRONMENT: true,
  requestAnimationFrame: window.requestAnimationFrame,
  cancelAnimationFrame: window.cancelAnimationFrame,
});

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const en = JSON.parse(readFileSync(join(rootDir, 'src/locales/en.json'), 'utf8'));
const translate = (key: string) => key.split('.').reduce((value: any, part) => value?.[part], en) ?? key;
let authUser: { id: string } | null = { id: 'user-1' };

const host = (tag: string) => (props: any) => {
  const { children, ...rest } = props || {};
  const attrs: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(rest)) {
    if (value == null || typeof value === 'function' || name === 'style' || name.startsWith('accessibility') || name === 'pointerEvents') continue;
    attrs[name] = value;
  }
  return React.createElement(tag, attrs, children);
};

const React = await import('react');
const fixtures: Record<string, unknown> = {
  'react-native': {
    View: host('div'),
    Text: host('span'),
    TextInput: host('input'),
    TouchableOpacity: host('button'),
    StyleSheet: { create: (sheet: unknown) => sheet, hairlineWidth: 1 },
  },
  '@react-navigation/native': { useFocusEffect: () => {} },
  'react-i18next': { useTranslation: () => ({ t: translate }) },
  '@expo/vector-icons': { Ionicons: host('span') },
  '/components/PassengerUI': { passengerStyles: {} },
  '/components/AppUI': {
    FormScrollView: React.forwardRef((props: any, ref: any) => React.createElement('div', { ref }, props.children)),
    BottomSheetModal: () => null,
    triggerHaptic: () => {},
  },
  '/components/EmergencyHotlines': { default: () => React.createElement('section', null, 'Hotlines') },
  '/components/SOSButton': { default: () => React.createElement('button', null, 'Emergency SOS') },
  '/components/FleetIncidentReporter': {
    default: () => React.createElement('section', { 'data-card': 'fleet-report' }, translate('passenger.incident.reportTitle')),
  },
  '/contexts/AuthContext': { useAuth: () => ({ user: authUser }) },
  '/contexts/PassengerJourneyContext': { usePassengerJourney: () => ({ unit: null }) },
  '/services/emergencyService': {
    readEmergencyContacts: async () => ({ contacts: [], synced: true }),
    saveEmergencyContact: async () => ({}),
    removeEmergencyContact: async () => {},
  },
  '/constants/theme': { color: {}, tapTarget: 48 },
};

const hooks = registerHooks({
  resolve(specifier, context, next) {
    const key = Object.keys(fixtures).find(name => specifier === name || specifier.endsWith(name));
    if (key) return { url: 'data:text/javascript,' + encodeURIComponent(
      'const values = globalThis.__safetyFixtures[' + JSON.stringify(key) + '];' +
      (key === 'react-native'
        ? 'export const View=values.View,Text=values.Text,TextInput=values.TextInput,TouchableOpacity=values.TouchableOpacity,StyleSheet=values.StyleSheet;'
        : key === '@react-navigation/native' ? 'export const useFocusEffect=values.useFocusEffect;'
        : key === 'react-i18next' ? 'export const useTranslation=values.useTranslation;'
        : key === '@expo/vector-icons' ? 'export const Ionicons=values.Ionicons;'
        : key === '/components/PassengerUI' ? 'export const passengerStyles=values.passengerStyles;'
        : key === '/components/AppUI' ? 'export const FormScrollView=values.FormScrollView,BottomSheetModal=values.BottomSheetModal,triggerHaptic=values.triggerHaptic;'
        : key === '/contexts/AuthContext' ? 'export const useAuth=values.useAuth;'
        : key === '/contexts/PassengerJourneyContext' ? 'export const usePassengerJourney=values.usePassengerJourney;'
        : key === '/services/emergencyService' ? 'export const readEmergencyContacts=values.readEmergencyContacts,saveEmergencyContact=values.saveEmergencyContact,removeEmergencyContact=values.removeEmergencyContact;'
        : key === '/constants/theme' ? 'export const color=values.color,tapTarget=values.tapTarget;'
        : 'export default values.default;'),
    ), shortCircuit: true };
    if (specifier.startsWith('.') && !/\.[cm]?[jt]sx?$/.test(specifier)) return next(`${specifier}.ts`, context);
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith('/SafetyScreen.tsx')) {
      return {
        format: 'module',
        source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), {
          compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
        }).outputText,
        shortCircuit: true,
      };
    }
    return next(url, context);
  },
});
(globalThis as any).__safetyFixtures = fixtures;
const { default: SafetyScreen } = await import('../src/screens/passenger/SafetyScreen.tsx');
hooks.deregister();

const { createRoot } = await import('react-dom/client');

test('Safety keeps a single fleet report card after the signed-in user id changes', async () => {
  const rootEl = document.createElement('div') as MiniElement;
  document.body.appendChild(rootEl);
  let setUser!: (user: { id: string }) => void;
  function App() {
    const [user, set] = React.useState({ id: 'user-1' });
    authUser = user;
    setUser = set;
    return React.createElement(SafetyScreen);
  }
  const root = createRoot(rootEl as unknown as Element);
  await React.act(async () => { root.render(React.createElement(App)); });
  const count = () => (rootEl.innerHTML.match(/Report to fleet operations/g) || []).length;
  assert.equal(count(), 1, 'first paint should show one report card');
  await React.act(async () => { setUser({ id: 'user-2' }); });
  assert.equal(count(), 1, 'changing user.id must not leave a second report card');
  assert.match(rootEl.innerHTML, /Report to fleet operations/);
  await React.act(async () => { root.unmount(); });
});
