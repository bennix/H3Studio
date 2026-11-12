const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('H3Studio/Resources/app.js', 'utf8');
const start = source.indexOf('function renderView()');
const end = source.indexOf("bindImageGestures($('resultStage'));", start);
const elements = new Map();
const state = { view: { scale: 1, x: 0, y: 0 }, result: { filename: 'test.png' }, busy: false };
const context = { state, $: id => {
  if (!elements.has(id)) elements.set(id, { style: {}, textContent: '' });
  return elements.get(id);
}};
vm.runInNewContext(source.slice(start, end) + '\nthis.viewer = { fitImage, zoomImage, bindImageGestures };', context);
context.viewer.fitImage();
context.viewer.zoomImage(2, { x: 100, y: 50 });
assert.equal(state.view.x, -100);
assert.equal(state.view.y, -50);
assert.equal(elements.get('zoomValue').textContent, '200%');
context.viewer.zoomImage(20);
assert.equal(state.view.scale, 8);
context.viewer.zoomImage(0.01);
assert.equal(state.view.scale, 0.25);
context.viewer.fitImage();
const handlers = new Map();
const stage = {
  addEventListener: (name, callback) => handlers.set(name, callback),
  classList: { add() {}, remove() {} }, setPointerCapture() {},
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 500, height: 400 }),
};
context.viewer.bindImageGestures(stage);
handlers.get('pointerdown')({ button: 0, clientX: 100, clientY: 100, pointerId: 1 });
handlers.get('pointermove')({ clientX: 150, clientY: 120 });
assert.equal(state.view.x, 50);
assert.equal(state.view.y, 20);
handlers.get('pointerup')();
handlers.get('pointermove')({ clientX: 300, clientY: 300 });
assert.equal(state.view.x, 50);
handlers.get('dblclick')();
assert.equal(state.view.scale, 1);
assert.equal(state.view.x, 0);
assert.equal(state.view.y, 0);
let prevented = false;
handlers.get('wheel')({ deltaY: 50, clientX: 250, clientY: 200, preventDefault() { prevented = true; } });
assert(prevented);
assert(state.view.scale < 1);
console.log('缩放锚点、缩放上下限、拖动平移、滚轮和双击复位验证通过。');
