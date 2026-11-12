import { app } from "../../scripts/app.js";

const endpoint = "/userdata/colab_compute_units.json";
const notebook = "https://colab.research.google.com/";

function valid(data) {
  return data && Number.isFinite(data.balance) && data.balance >= 0 &&
    Number.isFinite(data.rate_per_hour) && data.rate_per_hour >= 0 &&
    Number.isFinite(data.observed_at_ms) && data.observed_at_ms > 0;
}

app.registerExtension({
  name: "Local.ColabComputeUnits",
  setup() {
    let baseline;
    const panel = document.createElement("section");
    panel.id = "colab-compute-units";
    panel.setAttribute("aria-label", "Colab 剩余计算单元");
    panel.title = "依据最近核对的余额和当前运行时费率估算；其他会话、充值、额度到期和费率变化不计入。实际余额以 Colab 为准。";
    panel.style.cssText = "position:fixed;right:18px;bottom:78px;z-index:1000;width:260px;padding:12px;border:1px solid #666;border-radius:8px;background:#202020ed;color:#eee;font:12px/1.6 sans-serif;box-shadow:0 3px 12px #0007";
    panel.innerHTML = `<button type="button" data-action="toggle" style="position:absolute;right:9px;top:9px;background:none;border:0;color:#c8dfff;cursor:pointer;font:12px sans-serif"></button>
      <div data-field="heading" style="color:#bbb">剩余计算单元（估算）</div>
      <strong data-field="remaining" style="font-size:23px;font-variant-numeric:tabular-nums">读取中…</strong>
      <div data-field="details">
      <div data-field="base" style="color:#bbb"></div>
      <div data-field="checked" style="color:#aaa"></div>
      <div style="color:#aaa">仅按当前运行时估算 · 官方余额为准</div>
      <a href="${notebook}" target="_blank" rel="noopener" style="color:#9bc6ff">查看 Colab 官方余额</a>
      <details style="margin-top:5px"><summary style="cursor:pointer">校准余额 / 费率</summary>
        <form style="display:grid;gap:5px;margin-top:6px">
          <label>Colab 当前余额 <input name="balance" aria-label="Colab 当前余额" type="number" min="0" step="0.01" required style="width:100%;color:#eee;background:#333;border:1px solid #666;border-radius:3px"></label>
          <label>每小时消耗 <input name="rate" aria-label="每小时消耗计算单元" type="number" min="0" step="0.01" required style="width:100%;color:#eee;background:#333;border:1px solid #666;border-radius:3px"></label>
          <button type="submit" style="background:#3c6297;color:white;border:0;border-radius:4px;padding:5px;cursor:pointer">保存校准值</button>
        </form>
      </details><div data-field="message" role="status" style="color:#c8dfff"></div></div>`;
    document.body.appendChild(panel);
    const field = name => panel.querySelector(`[data-field="${name}"]`);
    const form = panel.querySelector("form");
    const toggle = panel.querySelector('[data-action="toggle"]');
    let collapsed = localStorage.getItem("colab-compute-units-collapsed") !== "false";
    function applyCollapsed() {
      field("heading").hidden = collapsed;
      field("details").hidden = collapsed;
      field("remaining").style.fontSize = collapsed ? "16px" : "23px";
      panel.style.width = collapsed ? "auto" : "260px";
      panel.style.paddingRight = collapsed ? "52px" : "12px";
      toggle.textContent = collapsed ? "展开" : "收起";
      toggle.setAttribute("aria-label", collapsed ? "展开余额详情" : "收起余额详情");
      toggle.setAttribute("aria-expanded", String(!collapsed));
    }
    toggle.onclick = () => {
      collapsed = !collapsed;
      localStorage.setItem("colab-compute-units-collapsed", String(collapsed));
      applyCollapsed();
    };
    applyCollapsed();
    function render() {
      if (!baseline) { field("remaining").textContent = "待校准"; return; }
      const hours = Math.max(0, Date.now() - baseline.observed_at_ms) / 3600000;
      const remaining = Math.max(0, baseline.balance - hours * baseline.rate_per_hour);
      field("remaining").textContent = `≈${remaining.toFixed(2)} 单元`;
      field("base").textContent = `核对基准 ${baseline.balance.toFixed(2)} · ${baseline.rate_per_hour.toFixed(2)} 单元/小时`;
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const zoneLabel = zone === "Asia/Tokyo" ? "日本时间 UTC+9" : zone;
      const checked = new Date(baseline.observed_at_ms).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
      field("checked").textContent = `最近核对 ${checked}（${zoneLabel}）`;
      if (hours > 24) field("message").textContent = "基准已超过一天，请核对并校准余额。";
    }
    async function refresh() {
      try {
        const response = await fetch(endpoint + "?t=" + Date.now(), { cache: "no-store", credentials: "same-origin" });
        if (response.status === 404) { render(); return; }
        if (!response.ok) throw new Error("余额基准读取失败");
        const data = await response.json();
        if (!valid(data)) throw new Error("余额基准格式无效，请校准");
        baseline = data;
        if (!panel.querySelector("details").open) {
          form.elements.balance.value = data.balance;
          form.elements.rate.value = data.rate_per_hour;
        }
        render();
      } catch (error) { field("message").textContent = error.message; render(); }
    }
    form.onsubmit = async event => {
      event.preventDefault();
      const data = { balance: Number(form.elements.balance.value), rate_per_hour: Number(form.elements.rate.value), observed_at_ms: Date.now(), source: "用户依据 Colab 显示值校准" };
      if (!valid(data)) return;
      field("message").textContent = "正在保存…";
      try {
        const response = await fetch(endpoint, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
        if (!response.ok) throw new Error("校准值保存失败");
        baseline = data;
        panel.querySelector("details").open = false;
        field("message").textContent = "校准值已保存到 Colab";
        render();
      } catch (error) { field("message").textContent = error.message; }
    };
    void refresh();
    setInterval(render, 15000);
    setInterval(refresh, 60000);
  },
});
