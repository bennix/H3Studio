# Colab 端缺失模型下载

此扩展替换缺失模型面板的“下载”和“全部下载”行为：浏览器只提交任务，文件由 Colab 下载到 `/content/ComfyUI/models/<模型类型>/`。

- 使用工作流内的模型名称、类型和 Hugging Face HTTPS 直链。
- 网页显示排队、字节进度、完成路径或错误；模型列表完成后自动刷新。
- 同时下载一个文件；失败保留 `.part`，再次点击可续传。
- 不回退到本机下载；受限模型需要模型站点访问权限，目前未提供 Token 输入。
- 下载接口沿用当前 ComfyUI 的 Nginx 密码保护。
- 模型存储在 Colab 临时磁盘；删除运行时后不会保留。

安装脚本在相邻的 `install_colab_model_download.py`，同一内容也已加入 Colab 笔记本。
