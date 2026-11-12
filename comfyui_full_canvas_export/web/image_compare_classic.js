import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

// ImageCompare ships with a Vue-only display. Paint the same saved images on
// the classic canvas so the comparison also appears in full-canvas PNG exports.
const outputs = new Map();
const images = new Map();
function url(meta) {
  return api.apiURL('/view?' + new URLSearchParams(meta));
}
function image(src) {
  if (!src) return null;
  if (!images.has(src)) {
    const img = new Image();
    img.onload = () => app.graph?.setDirtyCanvas(true, true);
    img.src = src;
    images.set(src, img);
  }
  const img = images.get(src);
  return img.complete && img.naturalWidth ? img : null;
}
function source(node, side) {
  const saved = outputs.get(String(node.id)) ?? app.nodeOutputs?.[node.id];
  const meta = saved?.[side + '_images']?.[0];
  if (meta) return url(meta);
  const slot = node.inputs?.findIndex(input => input.name === 'image_' + side);
  const upstream = slot >= 0 ? node.getInputNode(slot) : null;
  if (!upstream) return null;
  const out = outputs.get(String(upstream.id)) ?? app.nodeOutputs?.[upstream.id];
  if (out?.images?.[0]) return url(out.images[0]);
  if (upstream.imgs?.[0]?.src) return upstream.imgs[0].src;
  const file = upstream.widgets?.find(w => w.name === 'image')?.value;
  return typeof file === 'string' ? url({filename:file, type:'input'}) : null;
}
function install(node) {
  if ((node.comfyClass ?? node.constructor.comfyClass ?? node.type) !== 'ImageCompare') return;
  const widget = node.widgets?.find(w => w.type === 'imagecompare');
  if (!widget || widget._classicCompare) return;
  widget._classicCompare = true;
  let split = 0.5;
  widget.draw = function(ctx, node, width, y) {
    const x = 15, w = width - 30, h = Math.max(100, node.size[1] - y - 15);
    const a = image(source(node, 'a')), b = image(source(node, 'b'));
    ctx.save();
    ctx.fillStyle = '#181818'; ctx.fillRect(x,y,w,h);
    ctx.beginPath(); ctx.rect(x,y,w,h); ctx.clip();
    function paint(img) {
      if (!img) return;
      const scale = Math.min(w/img.naturalWidth, h/img.naturalHeight);
      const iw = img.naturalWidth*scale, ih = img.naturalHeight*scale;
      ctx.drawImage(img,x+(w-iw)/2,y+(h-ih)/2,iw,ih);
    }
    paint(b ?? a);
    if (a && b) {
      ctx.save(); ctx.beginPath(); ctx.rect(x,y,w*split,h); ctx.clip(); paint(a); ctx.restore();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x+w*split,y); ctx.lineTo(x+w*split,y+h); ctx.stroke();
    }
    ctx.fillStyle = '#ffffff'; ctx.font = '12px sans-serif'; ctx.textAlign='left';
    ctx.fillText(a || b ? 'A ← 移动鼠标对比 → B' : '等待输入图像或执行结果', x+8,y+18);
    ctx.restore();
  };
  const oldDown = node.onMouseDown, oldMove = node.onMouseMove;
  function update(pos) {
    const y = widget.last_y ?? widget.y ?? 0;
    if (pos[0] < 15 || pos[0] > node.size[0]-15 || pos[1] < y || pos[1] > node.size[1]-15) return false;
    split = Math.max(0,Math.min(1,(pos[0]-15)/(node.size[0]-30)));
    node.setDirtyCanvas(true,true);
    return true;
  }
  node.onMouseDown = function(event,pos,...rest) {
    return update(pos) || oldDown?.call(this,event,pos,...rest);
  };
  node.onMouseMove = function(event,pos,...rest) {
    update(pos);
    return oldMove?.call(this,event,pos,...rest);
  };
}
app.registerExtension({
  name: 'Local.ClassicImageCompare',
  nodeCreated: install,
  async setup() {
    api.addEventListener('executed', ({detail}) => {
      outputs.set(String(detail.display_node ?? detail.node), detail.output);
      app.graph?.setDirtyCanvas(true,true);
    });
    // Restore completed results after refresh without another GPU generation.
    try {
      const response = await api.fetchApi('/history?max_items=10');
      if (!response.ok) return;
      const history = await response.json();
      for (const item of Object.values(history).sort((a,b)=>(a.prompt?.[0]??0)-(b.prompt?.[0]??0))) {
        for (const [id,out] of Object.entries(item.outputs ?? {})) outputs.set(id,out);
      }
      app.graph?.setDirtyCanvas(true,true);
    } catch (error) { console.warn('Classic comparison history:',error); }
  },
});
