# 全画布 PNG 导出

安装后，ComfyUI 网页左下角会出现 **全画布 PNG · 100%** 按钮。

- 按一个画布坐标对应一个 PNG 像素导出，独立于浏览器当前缩放和屏幕大小。
- 包含当前画布的节点、连线、分组和文本框；导出后恢复视图。
- 用于经典 LiteGraph 节点画布；未验证 Nodes 2.0 和第三方 DOM 小组件。
- 超过浏览器画布尺寸限制时会提示，不会自动缩小图片。

Colab 中运行相邻的 `install_full_canvas_export_colab.py` 内容即可安装并重启 ComfyUI 服务。
安装代码也已保存到 Colab 笔记本最后一个单元格中。

## Colab 计算单元卡片

`compute_units.js` 在网页右下角显示剩余单元的估算值、最近核对基准和费率。
Colab 的公开订阅 API 不返回余额；卡片按经过核对的余额减去当前运行时的时间消耗，不是官方实时账单。
其他会话、充值、额度到期和费率变化需要通过“校准余额 / 费率”更新。
校准值保存到 Colab 的 `user/default/colab_compute_units.json`；重新安装不会覆盖已有校准值。
最近核对时间跟随浏览器时区；日本浏览器时区会显示“日本时间 UTC+9”。
卡片默认收起，只显示估算余额；“展开 / 收起”状态保存在当前浏览器，刷新后保留。
对应安装脚本为相邻的 `install_colab_compute_units.py`，无需重启服务。

`web/image_compare_classic.js` 为官方 ImageCompare 添加经典画布显示：
读取节点执行结果和近期历史中的 A/B 图像，支持分割对比；直接绘制到画布，
可随全画布 PNG 一起导出。Colab 使用 `install_classic_image_compare.py` 安装，
只需刷新网页，无需重启后端或重新生成。
