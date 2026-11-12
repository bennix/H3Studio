import { app } from "../../scripts/app.js";

// Render at one output pixel per graph coordinate, independently of screen zoom.
async function renderFullCanvas() {
  const view = app.canvas;
  const graph = view.graph;
  const nodes = graph?._nodes ?? [];
  if (!nodes.length) throw new Error("当前画布没有节点。");
  view.draw(true, true);
  await Promise.resolve();
  const bounds = nodes.map(node => Array.from(node.getBounding(undefined, true)));
  for (const group of graph._groups ?? []) bounds.push(Array.from(group._bounding));
  for (const reroute of graph.reroutes?.values?.() ?? []) {
    const pos = reroute.pos ?? reroute._pos;
    if (pos) bounds.push([pos[0] - 10, pos[1] - 10, 20, 20]);
  }
  const minX = Math.min(...bounds.map(b => b[0]));
  const minY = Math.min(...bounds.map(b => b[1]));
  const maxX = Math.max(...bounds.map(b => b[0] + b[2]));
  const maxY = Math.max(...bounds.map(b => b[1] + b[3]));
  // LiteGraph spline handles can extend by a quarter of the link length.
  const padding = Math.max(80, Math.ceil(Math.hypot(maxX - minX, maxY - minY) / 4) + 24);
  const left = Math.floor(minX - padding);
  const top = Math.floor(minY - padding);
  const width = Math.ceil(maxX + padding - left);
  const height = Math.ceil(maxY + padding - top);
  const dpr = window.devicePixelRatio || 1;
  if (Math.max(width, height) * dpr > 16384 || width * height * dpr * dpr > 64000000) {
    throw new Error(`画布过大（${width}×${height}），请缩小节点间距后再导出；不会自动缩小图片。`);
  }
  const canvas = view.canvas;
  const ctx = view.ctx;
  const state = {
    width: canvas.width, height: canvas.height,
    scale: view.ds.scale, offset: Array.from(view.ds.offset),
    transform: ctx.getTransform(), viewport: view.viewport,
    viewportSize: view.ds.getViewportSize?.(), dirtyArea: view.dirty_area,
    showInfo: view.show_info,
  };
  const patches = [];
  try {
    // DOM textareas are not part of Canvas.toBlob, so paint them during this draw.
    for (const node of nodes) for (const widget of node.widgets ?? []) {
      if (widget.type !== "customtext" || typeof widget.draw !== "function") continue;
      const original = widget.draw;
      const own = Object.prototype.hasOwnProperty.call(widget, "draw");
      widget.draw = function(context, node, widgetWidth, y, widgetHeight, ...rest) {
        original.call(this, context, node, widgetWidth, y, widgetHeight, ...rest);
        const element = this.element ?? this.inputEl;
        const text = String(element?.value ?? this.value ?? "");
        const margin = this.margin ?? 10;
        const w = widgetWidth - margin * 2;
        const h = (this.computedHeight ?? widgetHeight ?? 80) - margin * 2;
        const style = element ? getComputedStyle(element) : null;
        context.save();
        context.beginPath();
        context.rect(margin, y + margin, w, h);
        context.clip();
        context.fillStyle = style?.backgroundColor || "#222";
        context.fillRect(margin, y + margin, w, h);
        context.fillStyle = style?.color || "#eee";
        context.font = style?.font || "12px monospace";
        context.textBaseline = "top";
        const lineHeight = parseFloat(style?.lineHeight) || (parseFloat(style?.fontSize) || 12) * 1.35;
        let textY = y + margin + 4;
        for (const paragraph of text.split("\n")) {
          let line = "";
          for (const character of paragraph) {
            if (line && context.measureText(line + character).width > w - 8) {
              context.fillText(line, margin + 4, textY);
              textY += lineHeight;
              line = "";
            }
            line += character;
          }
          context.fillText(line, margin + 4, textY);
          textY += lineHeight;
          if (textY > y + margin + h) break;
        }
        context.restore();
      };
      patches.push(() => { if (own) widget.draw = original; else delete widget.draw; });
    }
    canvas.width = Math.ceil(width * dpr);
    canvas.height = Math.ceil(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    view.viewport = undefined;
    view.dirty_area = undefined;
    view.ds.setViewportSize?.(width, height);
    view.show_info = false;
    view.ds.scale = 1;
    view.ds.offset = [-left, -top];
    view.draw(true, true);
    if (view.visible_nodes.length !== nodes.length) {
      throw new Error(`渲染范围不完整：${view.visible_nodes.length}/${nodes.length} 个节点，已取消导出。`);
    }
    // ComfyUI queues preview-image drawing in microtasks; flush before snapshot.
    await Promise.resolve();
    // Restore before the next animation frame or awaiting PNG encoding.
    const output = document.createElement("canvas");
    output.width = width;
    output.height = height;
    const out = output.getContext("2d");
    out.fillStyle = view.clear_background_color || "#181818";
    out.fillRect(0, 0, width, height);
    out.drawImage(canvas, 0, 0, width, height);
    return output;
  } finally {
    for (const undo of patches) undo();
    canvas.width = state.width;
    canvas.height = state.height;
    ctx.setTransform(state.transform);
    view.viewport = state.viewport;
    view.dirty_area = state.dirtyArea;
    if (state.viewportSize) view.ds.setViewportSize?.(...state.viewportSize);
    view.show_info = state.showInfo;
    view.ds.scale = state.scale;
    view.ds.offset = state.offset;
    view.draw(true, true);
  }
}

app.registerExtension({
  name: "Local.FullCanvasPNG",
  setup() {
    const button = document.createElement("button");
    button.id = "full-canvas-export";
    button.textContent = "全画布 PNG · 100%";
    button.title = "以 100% 比例导出当前画布全部节点、连线和文本，不受屏幕范围限制";
    button.style.cssText = "position:fixed;left:76px;bottom:18px;z-index:1000;padding:9px 14px;border:1px solid #666;border-radius:7px;background:#252525;color:#fff;font:13px sans-serif;cursor:pointer;box-shadow:0 2px 8px #0006";
    button.onclick = async () => {
      button.disabled = true;
      button.textContent = "正在导出…";
      try {
        await document.fonts.ready;
        const image = await renderFullCanvas();
        const blob = await new Promise(resolve => image.toBlob(resolve, "image/png"));
        if (!blob) throw new Error("浏览器无法编码此画布。");
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `ComfyUI-full-canvas-100pct-${image.width}x${image.height}.png`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        button.textContent = `已导出 ${image.width}×${image.height}`;
      } catch (error) {
        console.error("Full canvas export:", error);
        window.alert("全画布导出失败：" + error.message);
      } finally {
        button.disabled = false;
        setTimeout(() => { button.textContent = "全画布 PNG · 100%"; }, 4000);
      }
    };
    document.body.appendChild(button);
  },
});
