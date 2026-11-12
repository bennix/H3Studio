import { app } from "../../scripts/app.js";

const singleSelector = '[data-testid="missing-model-download"]';
const allSelector = '[data-testid="missing-model-download-all"]';

function modelsInWorkflow() {
  const models = new Map();
  function walk(value) {
    if (!value || typeof value !== "object") return;
    if (typeof value.name === "string" && typeof value.url === "string" && typeof value.directory === "string") {
      models.set(value.directory + "/" + value.name, { name: value.name, url: value.url, directory: value.directory });
    }
    for (const child of Object.values(value)) walk(child);
  }
  walk(app.graph.serialize());
  return [...models.values()];
}

function modelForButton(button, models) {
  const label = button.getAttribute("aria-label") || "";
  return models.find(model => label.includes(model.name));
}

app.registerExtension({
  name: "Local.ColabModelDownloads",
  setup() {
    const panel = document.createElement("section");
    panel.id = "colab-model-download-status";
    panel.setAttribute("aria-label", "Colab 模型下载进度");
    panel.style.cssText = "display:none;position:fixed;left:76px;bottom:72px;z-index:1001;width:440px;max-height:280px;overflow:auto;padding:14px;border:1px solid #666;border-radius:8px;background:#202020;color:#eee;font:12px/1.6 sans-serif;box-shadow:0 3px 12px #0008";
    document.body.appendChild(panel);
    const refreshed = new Set();
    let polling = false;
    function message(text) { panel.style.display = "block"; panel.textContent = text; }
    function bytes(n) { return (n / 1024**3).toFixed(2) + " GiB"; }
    async function poll() {
      if (polling) return;
      polling = true;
      try {
        const response = await fetch("/colab/models/jobs", { credentials: "same-origin" });
        if (!response.ok) throw new Error("无法读取 Colab 下载进度");
        const data = await response.json();
        const active = data.jobs.filter(job => ["排队中", "下载中"].includes(job.state));
        const shown = data.jobs.slice(-12);
        if (shown.length) {
          panel.replaceChildren();
          panel.style.display = "block";
          const heading = document.createElement("strong");
          heading.textContent = "Colab 端模型下载";
          panel.appendChild(heading);
          const close = document.createElement("button");
          close.textContent = "收起";
          close.style.cssText = "float:right;background:none;border:0;color:#aaa;cursor:pointer";
          close.onclick = () => { panel.style.display = "none"; };
          panel.appendChild(close);
          for (const job of shown) {
            const row = document.createElement("div");
            row.style.cssText = "margin-top:8px;overflow-wrap:anywhere";
            const progress = job.total ? ` ${Math.floor(job.downloaded / job.total * 100)}% · ${bytes(job.downloaded)} / ${bytes(job.total)}` : ` ${bytes(job.downloaded)}`;
            row.textContent = `${job.name} — ${job.state}${progress}`;
            const path = document.createElement("div");
            path.style.color = "#aaa";
            path.textContent = job.error || job.path;
            row.appendChild(path);
            panel.appendChild(row);
            if (job.state === "完成" && !refreshed.has(job.id)) {
              refreshed.add(job.id);
              await app.refreshMissingModels({ silent: true });
            }
          }
        }
        if (active.length) setTimeout(poll, 1500);
      } catch (error) { message(error.message); }
      finally { polling = false; }
    }
    async function submit(models) {
      if (!models.length) throw new Error("工作流中找不到模型下载地址；已阻止浏览器本地下载。");
      message("正在提交到 Colab；文件将写入 /content/ComfyUI/models/ …");
      const response = await fetch("/colab/models/download", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ models }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Colab 下载提交失败");
      await poll();
    }
    document.addEventListener("click", event => {
      const button = event.target.closest?.(`${singleSelector},${allSelector}`);
      if (!button) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      try {
        const available = modelsInWorkflow();
        const selected = button.matches(singleSelector)
          ? [modelForButton(button, available)].filter(Boolean)
          : [...document.querySelectorAll(singleSelector)].map(b => modelForButton(b, available)).filter(Boolean);
        void submit(selected).catch(error => message(error.message));
      } catch (error) { message(error.message); }
    }, true);
    function relabel() {
      for (const button of document.querySelectorAll(singleSelector)) {
        button.title = "下载至 Colab 的模型目录，不保存到本机";
        const label = button.getAttribute("aria-label");
        if (label?.startsWith("下载 ")) button.setAttribute("aria-label", label.replace("下载 ", "下载到 Colab "));
        for (const child of button.childNodes) {
          if (child.nodeType === Node.TEXT_NODE && ["下载", "Download"].includes(child.textContent.trim())) child.textContent = "下载到 Colab";
        }
      }
      for (const button of document.querySelectorAll(allSelector)) {
        const text = button.querySelector("span.truncate");
        if (text && !text.textContent.includes("Colab")) text.textContent = text.textContent.replace("全部下载", "全部下载到 Colab").replace("Download All", "Download All to Colab");
        button.title = "全部下载至 Colab，不通过浏览器下载到本机";
      }
    }
    new MutationObserver(relabel).observe(document.body, { childList: true, subtree: true });
    relabel();
    void poll();
  },
});
