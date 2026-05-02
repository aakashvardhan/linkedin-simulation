import '@testing-library/jest-dom/vitest';

/**
 * pdfjs-dist expects browser canvas APIs. Vitest/jsdom omits them; stub minimally so
 * modules that import pdfjs (e.g. Jobs, CareerCoachPanel) load in tests.
 */
if (typeof globalThis.DOMMatrix === 'undefined') {
  globalThis.DOMMatrix = class DOMMatrix {
    constructor() {
      this.a = 1;
      this.b = 0;
      this.c = 0;
      this.d = 1;
      this.e = 0;
      this.f = 0;
    }
  };
}
if (typeof globalThis.Path2D === 'undefined') {
  globalThis.Path2D = class Path2D {
    constructor() {}
  };
}

