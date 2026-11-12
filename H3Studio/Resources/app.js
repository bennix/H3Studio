const $ = id => document.getElementById(id);
const roles = [
  { key: 'base', label: '原图', hint: '编辑的主体画面', isBase: true },
  { key: 'face', label: '人脸参考', hint: '面部身份' },
  { key: 'style', label: '造型参考', hint: '发型 · 妆容 · 姿态' },
  { key: 'clothing', label: '衣服参考', hint: '服装 · 面料 · 版型' },
  { key: 'background', label: '背景参考', hint: '场景 · 环境' },
];
const state = {
  connected: false, busy: false, connectionID: 0, supportsTrash: false, lastDeletedToken: null, attachments: {},
  result: null, resultURL: null, resultBaseURL: null, showingBase: false,
  baseline: null, template: null, remoteResults: [], resultIndex: -1, resultRequestID: 0, view: { scale: 1, x: 0, y: 0 },
};
async function bridge(action, values = {}) {
  if (!window.webkit?.messageHandlers?.h3) throw new Error('请在 H3 Studio 应用中打开此界面');
  return window.webkit.messageHandlers.h3.postMessage({ action, ...values });
}
function errorMessage(error) { return typeof error === 'string' ? error : error.message || String(error); }
function showError(error) {
  $('errorBox').textContent = errorMessage(error);
  $('errorBox').hidden = false;
}
function updateControls() {
  const hasInput = !!$('instructions').value.trim() || Object.values(state.attachments).some(item => item.enabled);
  $('generateButton').disabled = !state.connected || !hasInput || state.busy;
  $('connectionButton').disabled = state.busy;
  $('instructions').disabled = state.busy;
  $('resolution').disabled = state.busy;
  $('seed').disabled = state.busy;
  $('actionHint').textContent = state.busy ? 'Colab 正在处理本次任务' : !state.connected ? '连接远端后开始' : !hasInput ? '填写指令或添加参考图后开始' : '已就绪 · 原图和参考图均可选';
  $('compareButton').hidden = !state.result || !state.resultBaseURL;
  $('saveButton').hidden = !state.result;
  $('copyButton').hidden = !state.result;
  $('deleteResultButton').hidden = !state.result || !state.supportsTrash;
  $('deleteResultButton').disabled = state.busy;
  $('undoDeleteButton').hidden = !state.lastDeletedToken;
  $('undoDeleteButton').disabled = state.busy;
  $('zoomOpenButton').hidden = !state.result;
  $('syncButton').disabled = !state.connected || state.busy;
  $('saveBalanceButton').disabled = !state.connected;
  updateHistoryNavigation();
  $('saveButton').disabled = state.busy;
  $('copyButton').disabled = state.busy;
  $('zoomOpenButton').disabled = state.busy;
}
function renderAttachments() {
  const grid = $('attachments');
  grid.replaceChildren();
  for (const role of roles) {
    const item = state.attachments[role.key];
    const card = document.createElement('div');
    card.className = 'attachment' + (item?.enabled ? ' active' : '');
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/png,image/jpeg,image/webp'; input.hidden = true;
    input.addEventListener('change', () => { if (input.files[0]) addAttachment(role.key, input.files[0]); });
    const preview = document.createElement('div');
    preview.className = 'attachment-preview';
    preview.tabIndex = state.busy ? -1 : 0;
    preview.setAttribute('role', 'button');
    preview.setAttribute('aria-label', `${item ? '更换' : '添加'}${role.label}`);
    preview.onclick = () => { if (!state.busy) input.click(); };
    preview.onkeydown = event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); preview.click(); } };
    preview.ondragover = event => { event.preventDefault(); if (!state.busy) preview.classList.add('dragover'); };
    preview.ondragleave = () => preview.classList.remove('dragover');
    preview.ondrop = event => {
      event.preventDefault(); preview.classList.remove('dragover');
      if (!state.busy && event.dataTransfer.files[0]) addAttachment(role.key, event.dataTransfer.files[0]);
    };
    if (item) {
      const image = document.createElement('img'); image.src = item.preview; image.alt = role.label + '缩略图'; image.title = item.file.name;
      preview.append(image);
      const remove = document.createElement('button');
      remove.className = 'attachment-remove'; remove.textContent = '×'; remove.type = 'button';
      remove.setAttribute('aria-label', '删除' + role.label); remove.title = '删除' + role.label; remove.disabled = state.busy;
      remove.onclick = () => {
        URL.revokeObjectURL(item.preview);
        delete state.attachments[role.key];
        renderAttachments(); updateControls();
      };
      card.append(remove);
    } else {
      const placeholder = document.createElement('span'); placeholder.className = 'upload-placeholder';
      const plus = document.createElement('span'); plus.className = 'plus'; plus.textContent = '+';
      const caption = document.createElement('span'); caption.textContent = '添加' + role.label;
      placeholder.append(plus, caption); preview.append(placeholder);
    }
    const footer = document.createElement('div'); footer.className = 'attachment-footer';
    const title = document.createElement('span'); title.className = 'attachment-title'; title.textContent = role.label;
    const hint = document.createElement('small'); hint.textContent = role.hint; title.append(hint); footer.append(title);
    if (role.isBase) {
      const required = document.createElement('span'); required.className = 'optional'; required.textContent = '可选'; footer.append(required);
    } else {
      const toggle = document.createElement('label'); toggle.className = 'toggle';
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = !!item?.enabled; checkbox.disabled = !item || state.busy;
      checkbox.setAttribute('aria-label', '启用' + role.label);
      checkbox.onchange = () => { item.enabled = checkbox.checked; renderAttachments(); };
      const track = document.createElement('span'); track.className = 'track'; toggle.append(checkbox, track); footer.append(toggle);
    }
    card.append(input, preview, footer); grid.append(card);
  }
}
async function addAttachment(key, file) {
  try {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('参考图支持 PNG、JPEG 和 WebP');
    if (file.size > 30 * 1024 * 1024) throw new Error('单张图片请控制在 30 MB 以内');
    const preview = URL.createObjectURL(file);
    try {
      const image = new Image(); image.src = preview; await image.decode();
    } catch { URL.revokeObjectURL(preview); throw new Error('这张图片无法读取，请换一张有效图片'); }
    if (state.attachments[key]) URL.revokeObjectURL(state.attachments[key].preview);
    state.attachments[key] = { file, preview, enabled: true };
    $('errorBox').hidden = true;
    renderAttachments(); updateControls();
  } catch (error) { showError(error); }
}
function fileBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.slice(reader.result.indexOf(',') + 1));
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.readAsDataURL(file);
  });
}
function setConnection(connected, label = '尚未连接 Colab') {
  state.connected = connected;
  $('connectionDot').classList.toggle('online', connected);
  $('connectionStatus').textContent = label;
  updateControls();
}
$('copyDeployButton').onclick = async () => {
  try { await bridge('copyDeployScript'); toast('部署脚本已拷贝，请粘贴到自己的 Colab GPU 代码单元格运行'); }
  catch (error) { showError(error); }
};
$('newNotebookButton').onclick = () => bridge('newNotebook').catch(showError);
$('startRemoteButton').onclick = async () => {
  try {
    await bridge('copyDeployScript');
    await bridge('startRemote');
    toast('脚本已拷贝，在新 Colab 中选择 GPU，粘贴到代码单元格运行');
  } catch (error) { showError(error); }
};
$('connectionButton').onclick = () => $('connectionDialog').showModal();
$('closeConnection').onclick = () => $('connectionDialog').close();
$('notebookButton').onclick = () => bridge('notebook').catch(showError);
$('mailButton').onclick = () => bridge('mail').catch(showError);
$('connectionForm').onsubmit = async event => {
  event.preventDefault();
  $('connectionError').hidden = true; $('connectSubmit').disabled = true;
  setConnection(false, '正在连接 Colab');
  try {
    const result = await bridge('connect', { url: $('remoteURL').value, username: $('username').value.trim().toLowerCase() === 'comfy' ? 'comfy' : $('username').value.trim(), password: $('password').value });
    state.supportsTrash = !!result.supportsTrash;
    state.lastDeletedToken = null;
    state.connectionID += 1;
    state.resultRequestID += 1;
    if (state.resultBaseURL) URL.revokeObjectURL(state.resultBaseURL);
    state.result = null;
    state.resultURL = null;
    state.resultBaseURL = null;
    state.showingBase = false;
    $('resultImage').hidden = true;
    $('resultImage').removeAttribute('src');
    $('emptyState').hidden = false;
    $('resultCaption').textContent = '图片在远端 Colab 生成';

    const device = result.stats.devices?.[0];
    const gpu = device?.name?.match(/NVIDIA\s+[^:]+/)?.[0]?.trim() || device?.name || '远端 GPU';
    setConnection(true, gpu + ' 已连接');
    $('gpuInfo').textContent = device?.vram_total ? `${gpu} · ${(device.vram_total / 1024 ** 3).toFixed(1)} GiB` : gpu;
    $('password').value = '';
    $('connectionDialog').close();
    await refreshBalance();
    await refreshRemoteResults(true);
  } catch (error) {
    setConnection(false);
    $('connectionError').textContent = errorMessage(error); $('connectionError').hidden = false;
  } finally { $('connectSubmit').disabled = false; }
};
async function refreshBalance() {
  if (!state.connected) return;
  state.baseline = await bridge('balance'); renderBalance();
  if (!$('balanceSettings').open && Number.isFinite(state.baseline?.balance)) {
    const data = state.baseline;
    $('balanceInput').value = Math.max(0, data.balance - Math.max(0, Date.now() - data.observed_at_ms) / 3600000 * data.rate_per_hour).toFixed(2);
    $('rateInput').value = data.rate_per_hour;
  }
}
function renderBalance() {
  const data = state.baseline;
  if (!data || !Number.isFinite(data.balance) || !Number.isFinite(data.rate_per_hour) || !Number.isFinite(data.observed_at_ms)) {
    $('balance').textContent = state.connected ? '待校准' : '—';
    $('balanceDetail').textContent = state.connected ? '请填写 Colab 官方余额和费率，保存后自动估算' : '连接后读取远端校准值';
    return;
  }
  const remaining = Math.max(0, data.balance - Math.max(0, Date.now() - data.observed_at_ms) / 3600000 * data.rate_per_hour);
  $('balance').textContent = '≈' + remaining.toFixed(2);
  $('balanceDetail').textContent = `${data.rate_per_hour.toFixed(2)} 单元/小时 · 官方余额为准`;
}
$('officialBalanceButton').onclick = () => bridge('newNotebook').catch(showError);
$('balanceForm').onsubmit = async event => {
  event.preventDefault();
  if (!state.connected) return;
  const balance = Number($('balanceInput').value), rate = Number($('rateInput').value);
  if (!$('balanceInput').value.trim() || !$('rateInput').value.trim() || !Number.isFinite(balance) || balance < 0 || !Number.isFinite(rate) || rate < 0) return;
  $('saveBalanceButton').disabled = true;
  try {
    state.baseline = await bridge('saveBalance', { balance, rate });
    renderBalance();
    $('balanceSettings').open = false;
    $('balanceMessage').textContent = '';
    toast('余额基准已保存到 Colab，后续连接自动读取');
  } catch (error) { $('balanceMessage').textContent = errorMessage(error); }
  finally { $('saveBalanceButton').disabled = !state.connected; }
};
function disconnectWorkflowInput(workflow, targetID, inputName) {
  const input = workflow.nodes.find(node => node.id === targetID).inputs.find(input => input.name === inputName);
  const link = workflow.links.find(link => link[0] === input.link);
  if (!link) return;
  const source = workflow.nodes.find(node => node.id === link[1]);
  const output = source.outputs[link[2]];
  output.links = output.links.filter(id => id !== link[0]);
  workflow.links = workflow.links.filter(item => item[0] !== link[0]);
  input.link = null;
}
function createPrompt(uploaded, width, height, seed) {
  const prompt = {
    '1': { class_type: 'UNETLoader', inputs: { unet_name: 'minimax_h3_image_pruned_w4a8.safetensors', weight_dtype: 'default' } },
    '2': { class_type: 'CLIPLoader', inputs: { clip_name: 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors', type: 'minimax', device: 'default' } },
    '3': { class_type: 'VAELoader', inputs: { vae_name: 'minimax_h3_image_vae_fp16.safetensors' } },
    '5': { class_type: 'H3ReferenceEdit', inputs: { clip: ['2', 0], vae: ['3', 0], instructions: $('instructions').value, width, height } },
    '6': { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['5', 0] } },
    '7': { class_type: 'KSampler', inputs: { model: ['1', 0], positive: ['5', 0], negative: ['6', 0], latent_image: ['5', 1], seed, steps: 6, cfg: 1, sampler_name: 'euler', scheduler: 'simple', denoise: 1 } },
    '8': { class_type: 'VAEDecode', inputs: { samples: ['7', 0], vae: ['3', 0] } },
    '9': { class_type: 'SaveImage', inputs: { images: ['8', 0], filename_prefix: 'H3Studio' } },
  };
  const workflow = structuredClone(state.template);
  const controls = workflow.nodes.find(node => node.id === 5);
  controls.widgets_values = [$('instructions').value, width, height];
  controls.widgets_values_named = { instructions: $('instructions').value, width, height };
  for (const [index, role] of roles.entries()) {
    const enabled = !!uploaded[role.key];
    if (role.key !== 'base') {
      prompt['5'].inputs[role.key + '_enabled'] = enabled;
      controls.widgets_values.push(enabled);
      controls.widgets_values_named[role.key + '_enabled'] = enabled;
    }
    if (role.key === 'base' && enabled) prompt['5'].inputs.base_image = ['10', 0];
    if (!enabled) {
      disconnectWorkflowInput(workflow, 5, role.key === 'base' ? 'base_image' : role.key + '_reference');
      if (role.key === 'base') disconnectWorkflowInput(workflow, 15, 'image_a');
      continue;
    }
    const metadata = uploaded[role.key];
    const filename = (metadata.subfolder ? metadata.subfolder + '/' : '') + metadata.name;
    const id = String(10 + index);
    prompt[id] = { class_type: 'LoadImage', inputs: { image: filename } };
    if (role.key !== 'base') prompt['5'].inputs[role.key + '_reference'] = [id, 0];
    workflow.nodes.find(node => node.id === 10 + index).widgets_values = [filename, 'image'];
  }
  const sampler = workflow.nodes.find(node => node.id === 7);
  sampler.widgets_values = [seed, 'fixed', 6, 1, 'euler', 'simple', 1];
  sampler.widgets_values_named = { seed, control_after_generate: 'fixed', steps: 6, cfg: 1, sampler_name: 'euler', scheduler: 'simple', denoise: 1 };
  return { prompt, workflow };
}
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
$('generateButton').onclick = async () => {
  if (state.busy || !state.connected) return;
  let seed;
  try {
    const text = $('seed').value.trim();
    if (text) {
      seed = Number(text);
      if (!Number.isSafeInteger(seed) || seed < 0) throw new Error('种子需要是 0 到 9007199254740991 之间的整数');
    } else {
      const random = crypto.getRandomValues(new Uint32Array(2));
      seed = (random[0] & 0x1fffff) * 4294967296 + random[1];
    }
    state.busy = true; state.showingBase = false;
    $('errorBox').hidden = true; $('processing').hidden = false;
    $('elapsed').textContent = ''; $('compareButton').textContent = '查看原图';
    renderAttachments(); updateControls();
    const uploaded = {};
    for (const role of roles) {
      const item = state.attachments[role.key];
      if (!item || !item.enabled) continue;
      $('processingStatus').textContent = '正在上传' + role.label;
      if (item.connectionID !== state.connectionID || !item.uploaded) {
        item.uploaded = await bridge('upload', { mime: item.file.type, base64: await fileBase64(item.file) });
        item.connectionID = state.connectionID;
      }
      uploaded[role.key] = item.uploaded;
    }
    const [width, height] = $('resolution').value.split(',').map(Number);
    const submission = await bridge('generate', createPrompt(uploaded, width, height, seed));
    if (!submission.prompt_id) throw new Error('远端未返回任务编号');
    const start = Date.now();
    let failures = 0;
    for (;;) {
      $('processingStatus').textContent = failures ? '正在重新连接远端' : '远端生成中';
      $('elapsed').textContent = `已用时 ${Math.floor((Date.now() - start) / 1000)} 秒`;
      let history;
      try { history = await bridge('history', { id: submission.prompt_id }); failures = 0; }
      catch (error) {
        if (++failures >= 10) throw new Error('连接暂时中断，任务可能仍在远端运行。请在 ComfyUI 检查队列后再生成。\n' + errorMessage(error));
        await sleep(3000); continue;
      }
      const job = history[submission.prompt_id];
      if (job?.status?.status_str === 'error') {
        const message = job.status.messages?.find(item => item[0] === 'execution_error')?.[1]?.exception_message;
        throw new Error(message || '远端生成失败，请检查参考图和 ComfyUI 日志');
      }
      const image = job?.outputs?.['9']?.images?.[0];
      if (image) {
        $('processingStatus').textContent = '正在取回图片';
        const result = await bridge('view', { image });
        if (state.resultBaseURL) URL.revokeObjectURL(state.resultBaseURL);
        state.resultBaseURL = state.attachments.base ? URL.createObjectURL(state.attachments.base.file) : null;
        state.result = image; state.resultURL = `data:${result.mime};base64,${result.base64}`;
        $('resultImage').src = state.resultURL; $('resultImage').hidden = false; $('emptyState').hidden = true;
        $('viewerImage').src = state.resultURL;
        $('resultStage').classList.add('has-image');
        fitImage();
        $('resultCaption').textContent = `${width} × ${height} · ${Math.round((Date.now() - start) / 1000)} 秒 · 种子 ${seed}`;
        break;
      }
      if (Date.now() - start > 3600000) throw new Error('任务超过一小时，请在 ComfyUI 中查看运行状态');
      await sleep(2000);
    }
  } catch (error) { showError(error); }
  finally {
    state.busy = false; $('processing').hidden = true;
    renderAttachments(); updateControls();
    refreshBalance().catch(() => {});
    refreshRemoteResults(false).catch(() => {});
  }
};
$('compareButton').onclick = () => {
  state.showingBase = !state.showingBase;
  const source = state.showingBase ? state.resultBaseURL : state.resultURL;
  $('resultImage').src = source;
  $('viewerImage').src = source;
  $('compareButton').textContent = state.showingBase ? '查看结果' : '查看原图';
};
$('saveButton').onclick = async () => {
  $('saveButton').disabled = true;
  try { await bridge('save', { image: state.result }); }
  catch (error) { showError(error); }
  finally { $('saveButton').disabled = false; }
};
function updateHistoryNavigation() {
  const count = state.remoteResults.length;
  $('previousResult').hidden = count < 2;
  $('nextResult').hidden = count < 2;
  $('resultIndex').hidden = count < 1;
  $('resultIndex').textContent = count ? `${state.resultIndex + 1} / ${count}` : '';
  $('previousResult').disabled = state.busy || state.resultIndex <= 0;
  $('nextResult').disabled = state.busy || state.resultIndex >= count - 1;
}
function imageKey(image) { return image ? [image.type || 'output', image.subfolder || '', image.filename].join('/') : null; }
async function refreshRemoteResults(followLatest) {
  if (!state.connected || state.busy) return;
  const previous = imageKey(state.result);
  const connectionID = state.connectionID;
  const previousIndex = state.resultIndex;
  const results = await bridge('recent');
  if (connectionID !== state.connectionID || !state.connected) return;
  if (!Array.isArray(results) || !results.length) {
    if (!state.result) $('resultCaption').textContent = '远端暂无已保存的图片';
    return;
  }
  state.remoteResults = results;
  const retained = results.findIndex(item => imageKey(item.image) === previous);
  const canFollow = previousIndex <= 0 && !$('viewerDialog').open && state.view.scale === 1;
  const index = followLatest || canFollow || retained < 0 ? 0 : retained;
  state.resultIndex = index;
  updateHistoryNavigation();
  if (followLatest || !state.result || imageKey(results[index].image) !== previous) await displayRemoteResult(index);
}
async function displayRemoteResult(index) {
  const item = state.remoteResults[index];
  if (!item) return;
  const requestID = ++state.resultRequestID;
  state.resultIndex = index;
  updateHistoryNavigation();
  $('resultCaption').textContent = '正在读取远端图片…';
  const result = await bridge('view', { image: item.image });
  if (requestID !== state.resultRequestID) return;
  if (state.resultBaseURL) URL.revokeObjectURL(state.resultBaseURL);
  state.resultBaseURL = null;
  state.showingBase = false;
  state.result = item.image;
  state.resultURL = `data:${result.mime};base64,${result.base64}`;
  $('resultImage').src = state.resultURL;
  $('viewerImage').src = state.resultURL;
  $('resultImage').hidden = false;
  $('emptyState').hidden = true;
  $('resultStage').classList.add('has-image');
  fitImage();
  await $('resultImage').decode();
  $('resultCaption').textContent = `${item.image.filename} · ${$('resultImage').naturalWidth} × ${$('resultImage').naturalHeight}`;
  updateControls();
}
$('syncButton').onclick = async () => {
  $('syncButton').disabled = true;
  try { await refreshRemoteResults(true); }
  catch (error) { showError(error); }
  finally { updateControls(); }
};
$('previousResult').onclick = () => displayRemoteResult(state.resultIndex - 1).catch(showError);
$('nextResult').onclick = () => displayRemoteResult(state.resultIndex + 1).catch(showError);
function clearResult() {
  state.resultRequestID += 1;
  if (state.resultBaseURL) URL.revokeObjectURL(state.resultBaseURL);
  state.result = null; state.resultURL = null; state.resultBaseURL = null;
  $('resultImage').hidden = true;
  $('emptyState').hidden = false;
  $('resultStage').classList.remove('has-image');
  $('viewerDialog').close();
  fitImage();
}
$('deleteResultButton').onclick = async () => {
  if (!state.result || state.busy) return;
  $('deleteResultButton').disabled = true;
  try {
    const deleted = await bridge('trash', { image: state.result });
    state.lastDeletedToken = deleted.token;
    clearResult();
    state.remoteResults = []; state.resultIndex = -1;
    await refreshRemoteResults(true);
    toast('已移到远端回收站，可撤销删除');
  } catch (error) { showError(error); }
  finally { updateControls(); }
};
$('undoDeleteButton').onclick = async () => {
  if (!state.lastDeletedToken) return;
  $('undoDeleteButton').disabled = true;
  try {
    const restored = await bridge('restore', { token: state.lastDeletedToken });
    state.lastDeletedToken = null;
    await refreshRemoteResults(false);
    const index = state.remoteResults.findIndex(item => imageKey(item.image) === imageKey(restored.image));
    if (index >= 0) await displayRemoteResult(index);
    toast('已恢复远端图片');
  } catch (error) { showError(error); }
  finally { updateControls(); }
};
function renderView() {
  const transform = `translate(${state.view.x}px,${state.view.y}px) scale(${state.view.scale})`;
  $('resultImage').style.transform = transform;
  $('viewerImage').style.transform = transform;
  $('zoomValue').textContent = Math.round(state.view.scale * 100) + '%';
}
function fitImage() { state.view = { scale: 1, x: 0, y: 0 }; renderView(); }
function zoomImage(scale, point = { x: 0, y: 0 }) {
  const next = Math.min(8, Math.max(0.25, scale));
  const ratio = next / state.view.scale;
  state.view.x = point.x - (point.x - state.view.x) * ratio;
  state.view.y = point.y - (point.y - state.view.y) * ratio;
  state.view.scale = next;
  renderView();
}
function bindImageGestures(stage) {
  let drag;
  stage.addEventListener('wheel', event => {
    if (!state.result) return;
    event.preventDefault();
    const rect = stage.getBoundingClientRect();
    zoomImage(state.view.scale * Math.exp(-event.deltaY * 0.002), { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 });
  }, { passive: false });
  stage.addEventListener('pointerdown', event => {
    if (!state.result || state.busy || event.button !== 0) return;
    stage.setPointerCapture(event.pointerId);
    drag = { startX: event.clientX, startY: event.clientY, x: state.view.x, y: state.view.y };
    stage.classList.add('dragging');
  });
  stage.addEventListener('pointermove', event => {
    if (!drag) return;
    state.view.x = drag.x + event.clientX - drag.startX;
    state.view.y = drag.y + event.clientY - drag.startY;
    renderView();
  });
  const release = () => { drag = null; stage.classList.remove('dragging'); };
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);
  stage.addEventListener('dblclick', fitImage);
}
bindImageGestures($('resultStage'));
bindImageGestures($('viewerStage'));
$('zoomOpenButton').onclick = () => { $('viewerImage').src = $('resultImage').src; fitImage(); $('viewerDialog').showModal(); };
$('closeViewer').onclick = () => { $('viewerDialog').close(); fitImage(); };
$('zoomIn').onclick = () => zoomImage(state.view.scale * 1.25);
$('zoomOut').onclick = () => zoomImage(state.view.scale / 1.25);
$('zoomFit').onclick = fitImage;
let toastTimer;
function toast(text) {
  $('toast').textContent = text; $('toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 2200);
}
async function copyResult() {
  if (!state.result) return;
  try { await bridge('copy', { image: state.result }); toast('已拷贝图片'); }
  catch (error) { showError(error); }
}
$('copyButton').onclick = copyResult;
$('viewerCopy').onclick = copyResult;
$('viewerSave').onclick = () => $('saveButton').click();
$('instructions').addEventListener('input', updateControls);
renderAttachments(); updateControls();
bridge('template').then(template => { state.template = template; }).catch(showError);
setInterval(renderBalance, 15000);
setInterval(() => refreshRemoteResults(false).catch(() => {}), 15000);
setInterval(() => refreshBalance().catch(() => {}), 60000);
$('connectionDialog').showModal();
