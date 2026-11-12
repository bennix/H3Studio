import { app } from '../../scripts/app.js';
const labels = {
  instructions: '补充编辑指令', width: '输出宽度', height: '输出高度',
  face_enabled: '启用换脸', style_enabled: '启用造型 / 姿态',
  clothing_enabled: '启用换衣', background_enabled: '启用背景',
};
app.registerExtension({
  name: 'Local.H3ReferenceEditLabels',
  nodeCreated(node) {
    if ((node.comfyClass ?? node.constructor.comfyClass ?? node.type) !== 'H3ReferenceEdit') return;
    for (const widget of node.widgets ?? []) {
      if (labels[widget.name]) widget.label = labels[widget.name];
    }
  },
});
