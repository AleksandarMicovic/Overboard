/**
 * A DOM small enough to run the renderer under `node --test`.
 *
 * The alternative was a headless browser, which would put a heavyweight
 * dependency in front of anyone running the tests. The renderer only touches a
 * narrow slice of the DOM, so standing that slice up here keeps the suite at
 * zero packages. Browser-level behavior (layout, CSS, animation) is verified by
 * driving demo/index.html, not here.
 */

class Style {
  #props = new Map();

  setProperty(name, value) {
    this.#props.set(name, value);
  }

  getPropertyValue(name) {
    return this.#props.get(name) ?? '';
  }
}

class Element {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName;
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentNode = null;
    this.style = new Style();
    this.dataset = {};
    this.className = '';
    this.innerHTML = '';
    this.textContent = '';
    this.attributes = {};
  }

  appendChild(child) {
    child.parentNode?.removeChild(child);
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
    child.parentNode = null;
  }

  remove() {
    this.parentNode?.removeChild(this);
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  /** Supports only the class selectors the tests need. */
  querySelectorAll(selector) {
    const wanted = selector.replace(/^\./, '');
    const found = [];
    const walk = (node) => {
      for (const child of node.children) {
        if (child.className.split(/\s+/).includes(wanted)) found.push(child);
        walk(child);
      }
    };
    walk(this);
    return found;
  }
}

class Document {
  constructor() {
    this.head = new Element('head', this);
    this.body = new Element('body', this);
    this.byId = new Map();
  }

  createElement(tagName) {
    return new Element(tagName, this);
  }

  getElementById(id) {
    // The renderer registers its stylesheet by id; nothing else looks anything up.
    for (const node of this.head.children) if (node.id === id) return node;
    return null;
  }
}

/**
 * A fresh document with an empty container attached.
 * @returns {{document: Document, container: Element}}
 */
export function makeDom() {
  const document = new Document();
  const container = document.createElement('div');
  document.body.appendChild(container);

  // `style.id` is set by the renderer; mirror it so getElementById can find it.
  const create = document.createElement.bind(document);
  document.createElement = (tagName) => {
    const element = create(tagName);
    Object.defineProperty(element, 'id', {
      get: () => element.attributes.id,
      set: (value) => { element.attributes.id = value; },
      configurable: true,
    });
    return element;
  };

  return { document, container };
}

/** Every piece node on the board, as `{square, piece}`. */
export function piecesOf(board) {
  return board.element
    .querySelectorAll('.ob-piece')
    .map((node) => ({ square: node.dataset.square, piece: node.dataset.piece }));
}

/** Squares currently highlighted. */
export function highlightsOf(board) {
  return board.element.querySelectorAll('.ob-highlight').map((node) => node.dataset.square);
}
