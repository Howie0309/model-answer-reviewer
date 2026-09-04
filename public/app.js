const form = document.querySelector("#compare-form");
const queryInput = document.querySelector("#query");
const answerAInput = document.querySelector("#answer-a");
const answerBInput = document.querySelector("#answer-b");
const compareButton = document.querySelector("#compare-button");
const promptButton = document.querySelector("#prompt-button");
const configStatus = document.querySelector("#config-status");
const finalOutput = document.querySelector("#final-output");
const copyFinal = document.querySelector("#copy-final");
const judgePrompt = document.querySelector("#judge-prompt");
const copyPrompt = document.querySelector("#copy-prompt");
const promptTemplateInput = document.querySelector("#prompt-template");
const templateVersionSelect = document.querySelector("#template-version");
const saveTemplateAsButton = document.querySelector("#save-template-as");
const renameTemplateVersionButton = document.querySelector("#rename-template-version");
const saveTemplateCurrentButton = document.querySelector("#save-template-current");
const deleteTemplateVersionButton = document.querySelector("#delete-template-version");
const answerAPreview = document.querySelector("#answer-a-preview");
const answerBPreview = document.querySelector("#answer-b-preview");
const answerACount = document.querySelector("#answer-a-count");
const answerBCount = document.querySelector("#answer-b-count");
const judgeProviderSelect = document.querySelector("#judge-provider");
const judgeModelInput = document.querySelector("#judge-model");
const judgeModelSuggestions = document.querySelector("#judge-model-suggestions");
const judgeEndpointInput = document.querySelector("#judge-endpoint");
const judgeApiKeyInput = document.querySelector("#judge-api-key");
const toggleJudgeKeyButton = document.querySelector("#toggle-judge-key");
const judgeTemperatureInput = document.querySelector("#judge-temperature");
const judgeTemperatureValue = document.querySelector("#judge-temperature-value");
const judgeReasoningSelect = document.querySelector("#judge-reasoning");
const judgeReasoningNote = document.querySelector("#judge-reasoning-note");
const judgeWebSearchInput = document.querySelector("#judge-web-search");
const judgeWebSearchNote = document.querySelector("#judge-web-search-note");

let latestFinal = "";
let canAutoCompare = false;
let serverCanAutoCompare = false;
const templateStorageKey = "model-review-template-v1";
const templateVersionsStorageKey = "model-review-template-versions-v1";
const activeTemplateVersionStorageKey = "model-review-active-template-version-v1";
const aiSettingsStorageKey = "model-review-ai-settings-v1";
const aiKeyStorageKey = "model-review-ai-key-v1";
const judgeProviders = {
  deepseek: {
    label: "DeepSeek",
    endpoint: "https://api.deepseek.com/v1",
    models: ["deepseek-chat", "deepseek-reasoner"]
  },
  openai: {
    label: "OpenAI",
    endpoint: "https://api.openai.com/v1",
    models: [
      "gpt-6-astra",
      "gpt-5.6",
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
      "gpt-5.5"
    ]
  },
  anthropic: {
    label: "Anthropic Claude",
    endpoint: "https://api.anthropic.com/v1",
    models: [
      "claude-opus-5",
      "claude-opus-4-8",
      "claude-opus-4-7",
      "claude-opus-4-6",
      "claude-sonnet-5",
      "claude-sonnet-4-6"
    ]
  },
  xiaomi: {
    label: "小米 MiMo",
    endpoint: "https://api.xiaomimimo.com/v1",
    models: ["mimo-v2-flash"]
  },
  custom: { label: "自定义接口", endpoint: "", models: [] }
};
const defaultPromptTemplate = `
你是严格但公平的模型回答评测员。请比较 A 模型回答和 B 模型回答，判断哪个更好。

原始 query：
{{query}}

A 模型回答：
{{answerA}}

B 模型回答：
{{answerB}}

评测要求：
1. 先判断两边是否真正回答了原始 query。
2. 必须重点校验两边回答的准确性：逐条检查关键事实、数字、引用、因果判断和结论是否可靠。
3. 不要默认相信任一模型的说法；如果无法核实某个事实，请标为“未验证”，并说明它会如何影响结论。
4. 如果某一方存在编造事实、过时信息、无依据断言、答非所问、遗漏关键约束，要明确扣分。
5. 从准确性、完整性、逻辑性、可执行性、表达清晰度、风险意识六个维度比较。
6. 不要因为回答更长就判更好。
7. 必须给出 A 相对 B 的五档判断：很好、略好、持平、略差、很差。
8. 五档含义：
   - 很好：A 明显优于 B，关键质量差距大。
   - 略好：A 小幅优于 B，但 B 也基本可用。
   - 持平：A 和 B 整体质量接近，难以区分胜负。
   - 略差：A 小幅差于 B，但仍有可取之处。
   - 很差：A 明显差于 B，存在关键缺陷或严重遗漏。
9. 如果你更习惯判断胜者，可以先判断 A/B/平局，再映射到五档：A 胜=很好或略好，B 胜=略差或很差，平局=持平。

请用中文 Markdown 输出：
# 评测结论
一句话说明哪个更好。

## 准确性核查
列出两边回答中的关键事实/判断，并标注：可靠、存疑、错误、未验证。

## 维度评分
用表格给 A 和 B 分别打 1-5 分，并给出“A 相对 B”的五档判断：很好、略好、持平、略差、很差。

## A 的优点与问题

## B 的优点与问题

## 关键差异

## 最终评级
只写五档之一：很好、略好、持平、略差、很差。这里评价的是 A 相对 B 的质量，并解释原因。
`.trim();
const defaultTemplateVersionId = "default";

function loadTemplateVersions() {
  try {
    const parsed = JSON.parse(localStorage.getItem(templateVersionsStorageKey) || "[]");
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch {}
  return [
    {
      id: defaultTemplateVersionId,
      name: "默认模板",
      content: defaultPromptTemplate
    }
  ];
}

function saveTemplateVersions(versions) {
  localStorage.setItem(templateVersionsStorageKey, JSON.stringify(versions));
}

function getActiveVersionId() {
  return localStorage.getItem(activeTemplateVersionStorageKey) || defaultTemplateVersionId;
}

function setActiveVersionId(id) {
  localStorage.setItem(activeTemplateVersionStorageKey, id);
}

function renderTemplateVersionOptions() {
  const versions = loadTemplateVersions();
  const activeId = getActiveVersionId();
  templateVersionSelect.innerHTML = versions
    .map(
      (version) =>
        `<option value="${escapeHtml(version.id)}"${version.id === activeId ? " selected" : ""}>${escapeHtml(version.name)}</option>`
    )
    .join("");
}

function syncTemplateEditorFromVersion(versionId = getActiveVersionId()) {
  const versions = loadTemplateVersions();
  const version = versions.find((item) => item.id === versionId) || versions[0];
  if (!version) return;
  setActiveVersionId(version.id);
  promptTemplateInput.value = version.content;
  renderTemplateVersionOptions();
  updatePrompt();
}

function setStatus(message, type = "") {
  configStatus.textContent = message;
  configStatus.className = `status ${type}`.trim();
  configStatus.hidden = !message;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderMarkdown(markdown) {
  const normalizedMarkdown = markdown
    .replace(/\r\n/g, "\n")
    .replace(/\\\\n/g, "\n")
    .replace(/\\n/g, "\n");
  const lines = normalizedMarkdown.split(/\r?\n/);
  const html = [];
  let inList = false;
  let inCode = false;
  let paragraph = [];
  let codeLines = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    html.push(`<p>${inlineMarkdown(escapeHtml(paragraph.join(" ")))}</p>`);
    paragraph = [];
  };

  const closeList = () => {
    if (!inList) return;
    html.push("</ul>");
    inList = false;
  };

  const flushCode = () => {
    if (!inCode) return;
    html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
    codeLines = [];
    inCode = false;
  };

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      if (inCode) flushCode();
      else {
        flushParagraph();
        closeList();
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      closeList();
      continue;
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${inlineMarkdown(escapeHtml(heading[2]))}</h${level}>`);
      continue;
    }

    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${inlineMarkdown(escapeHtml(bullet[1]))}</li>`);
      continue;
    }

    const numbered = trimmed.match(/^\d+\.\s+(.+)$/);
    if (numbered) {
      flushParagraph();
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${inlineMarkdown(escapeHtml(numbered[1]))}</li>`);
      continue;
    }

    paragraph.push(trimmed);
  }

  flushParagraph();
  closeList();
  flushCode();
  return html.join("");
}

function inlineMarkdown(value) {
  return value
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function fillTemplate(template, values) {
  return template
    .replaceAll("{{query}}", values.query)
    .replaceAll("{{answerA}}", values.answerA)
    .replaceAll("{{answerB}}", values.answerB);
}

function getActiveTemplate() {
  return promptTemplateInput.value.trim() || defaultPromptTemplate;
}

function buildJudgePrompt() {
  const query = queryInput.value.trim();
  const answerA = answerAInput.value.trim();
  const answerB = answerBInput.value.trim();

  return fillTemplate(getActiveTemplate(), {
    query: query || "这里填写用户原始 query。",
    answerA: answerA || "这里填写 A 模型回答。",
    answerB: answerB || "这里填写 B 模型回答。"
  }).trim();
}

function validateInputs() {
  const query = queryInput.value.trim();
  const answerA = answerAInput.value.trim();
  const answerB = answerBInput.value.trim();

  if (query.length < 4 || answerA.length < 4 || answerB.length < 4) {
    setStatus("请填写 query、A 回答和 B 回答", "error");
    return null;
  }

  return { query, answerA, answerB };
}

function currentJudgeConfig() {
  const apiKey = judgeApiKeyInput.value.trim();
  const model = judgeModelInput.value.trim();
  const endpoint = judgeEndpointInput.value.trim();
  if (!model || !endpoint) return null;
  return {
    provider: judgeProviderSelect.value,
    model,
    endpoint,
    apiKey,
    temperature: judgeTemperatureInput.value,
    reasoningEffort: judgeReasoningSelect.value,
    webSearch: judgeWebSearchInput.checked
  };
}

function saveAiSettings() {
  localStorage.setItem(
    aiSettingsStorageKey,
    JSON.stringify({
      provider: judgeProviderSelect.value,
      model: judgeModelInput.value,
      endpoint: judgeEndpointInput.value,
      temperature: judgeTemperatureInput.value,
      reasoningEffort: judgeReasoningSelect.value,
      webSearch: judgeWebSearchInput.checked
    })
  );
  sessionStorage.setItem(aiKeyStorageKey, judgeApiKeyInput.value);
}

function updateJudgeReasoningOptions(preferredValue = judgeReasoningSelect.value || "auto") {
  const provider = judgeProviderSelect.value;
  const model = judgeModelInput.value.trim();
  const labels = {
    auto: "自动（模型默认）",
    none: "None · 不推理",
    minimal: "Minimal · 极少",
    low: "Low · 较少",
    medium: "Medium · 均衡",
    high: "High · 深入",
    xhigh: "XHigh · 很深入"
  };
  let values = ["auto"];
  if (provider === "openai" && /^(gpt-[56]|o[134])/i.test(model)) {
    values = ["auto", "none", "minimal", "low", "medium", "high", "xhigh"];
  }
  if (provider === "openai" && /^gpt-6/i.test(model)) {
    values = ["auto", "low", "medium", "high", "xhigh"];
  }
  judgeReasoningSelect.innerHTML = values
    .map((value) => `<option value="${value}">${labels[value]}</option>`)
    .join("");
  judgeReasoningSelect.value = values.includes(preferredValue) ? preferredValue : "auto";

  const usesReasoning = provider === "openai" && /^(gpt-[56]|o[134])/i.test(model);
  const omitsTemperature = usesReasoning || provider === "anthropic";
  judgeTemperatureInput.disabled = omitsTemperature;
  judgeReasoningNote.textContent = usesReasoning
    ? "OpenAI 推理模型使用思考强度；温度不会发送。"
    : provider === "anthropic"
      ? "Claude Opus 使用模型默认推理；温度不会发送。"
    : "当前接口按温度控制稳定性，不发送思考强度。";
}

function updateWebSearchAvailability() {
  const provider = judgeProviderSelect.value;
  const supported = provider === "openai" || provider === "anthropic";
  judgeWebSearchInput.disabled = !supported;
  if (!supported) judgeWebSearchInput.checked = false;
  judgeWebSearchNote.textContent = supported
    ? provider === "openai"
      ? "使用 OpenAI Responses API 的原生 Web Search。"
      : "使用 Anthropic Messages API 的原生 Web Search。"
    : "当前服务商暂不支持原生联网搜索。";
}

function updateJudgeProvider(overwrite = true, preferredReasoning = "auto") {
  const config = judgeProviders[judgeProviderSelect.value] || judgeProviders.custom;
  if (overwrite) {
    judgeEndpointInput.value = config.endpoint;
    judgeModelInput.value = config.models[0] || "";
  }
  judgeModelSuggestions.innerHTML = config.models
    .map((model) => `<option value="${escapeHtml(model)}"></option>`)
    .join("");
  updateJudgeReasoningOptions(preferredReasoning);
  updateWebSearchAvailability();
  saveAiSettings();
}

function loadAiSettings() {
  let settings = {};
  try {
    settings = JSON.parse(localStorage.getItem(aiSettingsStorageKey) || "{}");
  } catch {}

  if (judgeProviders[settings.provider]) judgeProviderSelect.value = settings.provider;
  updateJudgeProvider(false, settings.reasoningEffort);
  if (settings.model) judgeModelInput.value = settings.model;
  if (settings.endpoint) judgeEndpointInput.value = settings.endpoint;
  if (settings.temperature != null) judgeTemperatureInput.value = settings.temperature;
  judgeWebSearchInput.checked = Boolean(settings.webSearch);
  judgeApiKeyInput.value = sessionStorage.getItem(aiKeyStorageKey) || "";
  judgeTemperatureValue.value = judgeTemperatureInput.value;
  updateJudgeReasoningOptions(settings.reasoningEffort);
  updateWebSearchAvailability();
  saveAiSettings();
}

function refreshAutoCompareState() {
  const hasSessionKey = Boolean(judgeApiKeyInput.value.trim());
  const sessionConfigReady = Boolean(
    hasSessionKey && judgeModelInput.value.trim() && judgeEndpointInput.value.trim()
  );
  canAutoCompare = sessionConfigReady || (!hasSessionKey && serverCanAutoCompare);
  compareButton.disabled = !canAutoCompare;
  compareButton.textContent = canAutoCompare ? "自动评测" : "自动评测（需配置 API）";

  if (sessionConfigReady) {
    const provider = judgeProviders[judgeProviderSelect.value] || judgeProviders.custom;
    setStatus(`已就绪 · ${provider.label} / ${judgeModelInput.value.trim()}`, "ok");
  } else if (hasSessionKey) {
    setStatus("还需要填写评测模型和 API 地址", "warn");
  } else if (serverCanAutoCompare) {
    setStatus("已就绪 · 将使用服务器 API 配置", "ok");
  } else {
    setStatus("填写 API Key 后即可自动评测；也可以继续手工复制 Prompt", "warn");
  }
}

function setLoading(isLoading) {
  compareButton.disabled = isLoading || !canAutoCompare;
  promptButton.disabled = isLoading;
  queryInput.disabled = isLoading;
  answerAInput.disabled = isLoading;
  answerBInput.disabled = isLoading;
  judgeProviderSelect.disabled = isLoading;
  judgeModelInput.disabled = isLoading;
  judgeEndpointInput.disabled = isLoading;
  judgeApiKeyInput.disabled = isLoading;
  judgeTemperatureInput.disabled =
    isLoading ||
    judgeProviderSelect.value === "anthropic" ||
    (judgeProviderSelect.value === "openai" && /^(gpt-[56]|o[134])/i.test(judgeModelInput.value.trim()));
  judgeReasoningSelect.disabled = isLoading;
  judgeWebSearchInput.disabled =
    isLoading || !["openai", "anthropic"].includes(judgeProviderSelect.value);
  compareButton.textContent = isLoading
    ? "评测中"
    : canAutoCompare
      ? "自动评测"
      : "自动评测（需配置 API）";
}

async function loadConfig() {
  try {
    const response = await fetch("/api/config");
    const config = await response.json();
    if (!response.ok) throw new Error(config.error || "配置读取失败");
    serverCanAutoCompare =
      Boolean(config.demoMode) ||
      Boolean(config.hasOpenAIKey) ||
      Boolean(config.hasAnthropicKey) ||
      Boolean(config.hasDeepSeekKey) ||
      Boolean(config.hasGeminiKey) ||
      Boolean(config.hasXiaomiKey);
    refreshAutoCompareState();
  } catch {
    serverCanAutoCompare = false;
    refreshAutoCompareState();
  }
}

function updatePrompt() {
  judgePrompt.value = buildJudgePrompt();
  copyPrompt.disabled = !judgePrompt.value;
  updatePreview();
}

function updatePreview() {
  const textA = answerAInput.value.trim();
  const textB = answerBInput.value.trim();

  answerAPreview.innerHTML = textA
    ? renderMarkdown(textA)
    : '<p class="preview-placeholder">A 回答会显示在这里。</p>';
  answerBPreview.innerHTML = textB
    ? renderMarkdown(textB)
    : '<p class="preview-placeholder">B 回答会显示在这里。</p>';
  answerAPreview.classList.toggle("empty", !textA);
  answerBPreview.classList.toggle("empty", !textB);
  answerACount.textContent = `${textA.length} 字`;
  answerBCount.textContent = `${textB.length} 字`;
}

promptButton.addEventListener("click", async () => {
  updatePrompt();
  await navigator.clipboard.writeText(judgePrompt.value);
  finalOutput.classList.remove("empty", "loading");
  finalOutput.innerHTML = renderMarkdown(`
# 已生成评审 Prompt

评审 Prompt 已自动复制到剪贴板。

你现在可以直接粘贴到 ChatGPT 或 Gemini 网页端，让它判断 A/B 哪个回答更好。
`);
  latestFinal = judgePrompt.value;
  copyFinal.disabled = false;
  promptButton.textContent = "已复制";
  window.setTimeout(() => {
    promptButton.textContent = "复制 Prompt 手动评测";
  }, 1200);
  setStatus("", "");
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const payload = validateInputs();
  if (!payload) return;
  const judgeConfig = currentJudgeConfig();
  if (judgeApiKeyInput.value.trim() && (!judgeConfig?.model || !judgeConfig?.endpoint)) {
    setStatus("请填写评测模型和 API 地址", "error");
    return;
  }

  updatePrompt();
  setLoading(true);
  copyFinal.disabled = true;
  latestFinal = "";
  finalOutput.classList.add("empty", "loading");
  finalOutput.textContent = "正在评测 A/B 回答，请稍等。";
  setStatus("正在自动评测", "ok");

  try {
    const response = await fetch("/api/compare", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...payload,
        template: getActiveTemplate(),
        judgeConfig
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "评测失败");

    latestFinal = result.final;
    finalOutput.classList.remove("empty", "loading");
    finalOutput.innerHTML = renderMarkdown(result.final);
    copyFinal.disabled = false;
    const provider = result.modelConfig?.provider;
    const model = result.modelConfig?.model;
    const searched = result.modelConfig?.webSearch;
    setStatus(
      provider && model
        ? `评测完成 · ${provider} / ${model}${searched ? " · 已联网" : ""}`
        : "评测完成",
      "ok"
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "评测失败";
    finalOutput.classList.remove("loading");
    finalOutput.classList.add("empty");
    finalOutput.textContent = message;
    setStatus(message, "error");
  } finally {
    setLoading(false);
  }
});

[queryInput, answerAInput, answerBInput].forEach((input) => {
  input.addEventListener("input", updatePrompt);
});

promptTemplateInput.addEventListener("input", () => {
  updatePrompt();
});

templateVersionSelect.addEventListener("change", () => {
  syncTemplateEditorFromVersion(templateVersionSelect.value);
  setStatus("已切换模板版本", "ok");
});

saveTemplateAsButton.addEventListener("click", () => {
  const name = window.prompt("给这个模板版本起个名字", "");
  if (!name || !name.trim()) return;
  const versions = loadTemplateVersions();
  const newVersion = {
    id: crypto.randomUUID(),
    name: name.trim(),
    content: ""
  };
  versions.unshift(newVersion);
  saveTemplateVersions(versions);
  setActiveVersionId(newVersion.id);
  renderTemplateVersionOptions();
  syncTemplateEditorFromVersion(newVersion.id);
  setStatus("已保存为新模板版本", "ok");
});

renameTemplateVersionButton.addEventListener("click", () => {
  const activeId = getActiveVersionId();
  if (activeId === defaultTemplateVersionId) {
    setStatus("默认模板不能重命名", "warn");
    return;
  }
  const versions = loadTemplateVersions();
  const current = versions.find((item) => item.id === activeId);
  if (!current) return;

  const nextName = window.prompt("修改模板版本名称", current.name);
  if (!nextName || !nextName.trim()) return;

  const updatedVersions = versions.map((item) =>
    item.id === activeId ? { ...item, name: nextName.trim() } : item
  );
  saveTemplateVersions(updatedVersions);
  renderTemplateVersionOptions();
  setStatus("已重命名模板版本", "ok");
});

saveTemplateCurrentButton.addEventListener("click", () => {
  const activeId = getActiveVersionId();
  const versions = loadTemplateVersions();
  const index = versions.findIndex((item) => item.id === activeId);
  if (index === -1) {
    setStatus("当前模板版本不存在，请先另存为新版本", "warn");
    return;
  }
  versions[index] = { ...versions[index], content: getActiveTemplate() };
  saveTemplateVersions(versions);
  setStatus("已更新当前模板版本", "ok");
});

deleteTemplateVersionButton.addEventListener("click", () => {
  const activeId = getActiveVersionId();
  if (activeId === defaultTemplateVersionId) {
    setStatus("默认模板不能删除", "warn");
    return;
  }
  const versions = loadTemplateVersions().filter((item) => item.id !== activeId);
  saveTemplateVersions(versions);
  setActiveVersionId(defaultTemplateVersionId);
  syncTemplateEditorFromVersion(defaultTemplateVersionId);
  setStatus("已删除模板版本", "ok");
});

copyPrompt.addEventListener("click", async () => {
  if (!judgePrompt.value) return;
  await navigator.clipboard.writeText(judgePrompt.value);
  copyPrompt.textContent = "已复制";
  window.setTimeout(() => {
    copyPrompt.textContent = "复制 Prompt";
  }, 1200);
});

copyFinal.addEventListener("click", async () => {
  if (!latestFinal) return;
  await navigator.clipboard.writeText(latestFinal);
  copyFinal.textContent = "已复制";
  window.setTimeout(() => {
    copyFinal.textContent = "复制结果";
  }, 1200);
});

judgeProviderSelect.addEventListener("change", () => {
  updateJudgeProvider(true);
  refreshAutoCompareState();
});
judgeModelInput.addEventListener("input", () => {
  updateJudgeReasoningOptions();
  saveAiSettings();
  refreshAutoCompareState();
});
judgeEndpointInput.addEventListener("input", () => {
  saveAiSettings();
  refreshAutoCompareState();
});
judgeApiKeyInput.addEventListener("input", () => {
  saveAiSettings();
  refreshAutoCompareState();
});
judgeTemperatureInput.addEventListener("input", () => {
  judgeTemperatureValue.value = judgeTemperatureInput.value;
  saveAiSettings();
});
judgeReasoningSelect.addEventListener("change", saveAiSettings);
judgeWebSearchInput.addEventListener("change", saveAiSettings);
toggleJudgeKeyButton.addEventListener("click", () => {
  const hidden = judgeApiKeyInput.type === "password";
  judgeApiKeyInput.type = hidden ? "text" : "password";
  toggleJudgeKeyButton.textContent = hidden ? "隐藏" : "显示";
});

loadAiSettings();
refreshAutoCompareState();
loadConfig();
if (!localStorage.getItem(templateVersionsStorageKey)) {
  saveTemplateVersions([
    {
      id: defaultTemplateVersionId,
      name: "默认模板",
      content:
        localStorage.getItem(templateStorageKey) || defaultPromptTemplate
    }
  ]);
}
renderTemplateVersionOptions();
syncTemplateEditorFromVersion();
setStatus("", "");
