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
const resetTemplateButton = document.querySelector("#reset-template");
const copyTemplateButton = document.querySelector("#copy-template");
const answerAPreview = document.querySelector("#answer-a-preview");
const answerBPreview = document.querySelector("#answer-b-preview");
const answerACount = document.querySelector("#answer-a-count");
const answerBCount = document.querySelector("#answer-b-count");

let latestFinal = "";
const templateStorageKey = "model-review-template-v1";
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

function setLoading(isLoading) {
  compareButton.disabled = isLoading;
  promptButton.disabled = isLoading;
  queryInput.disabled = isLoading;
  answerAInput.disabled = isLoading;
  answerBInput.disabled = isLoading;
  compareButton.textContent = isLoading ? "评测中" : "自动评测";
}

async function loadConfig() {
  try {
    const response = await fetch("/api/config");
    const config = await response.json();

    if (config.demoMode) {
      setStatus("", "");
      return;
    }

    if (!config.hasOpenAIKey && !config.hasAnthropicKey && !config.hasGeminiKey) {
      setStatus("", "");
      return;
    }

    if (config.hasOpenAIKey) {
      setStatus("", "");
      return;
    }

    if (config.hasGeminiKey) {
      setStatus("", "");
      return;
    }

    setStatus("", "");
  } catch {
    setStatus("", "");
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
    promptButton.textContent = "生成评审 Prompt";
  }, 1200);
  setStatus("", "");
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const payload = validateInputs();
  if (!payload) return;

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
      body: JSON.stringify({ ...payload, template: getActiveTemplate() })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "评测失败");

    latestFinal = result.final;
    finalOutput.classList.remove("empty", "loading");
    finalOutput.innerHTML = renderMarkdown(result.final);
    copyFinal.disabled = false;
    setStatus("评测完成", "ok");
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
  localStorage.setItem(templateStorageKey, promptTemplateInput.value);
  updatePrompt();
});

resetTemplateButton.addEventListener("click", () => {
  promptTemplateInput.value = defaultPromptTemplate;
  localStorage.setItem(templateStorageKey, defaultPromptTemplate);
  updatePrompt();
  setStatus("已恢复默认模板", "ok");
});

copyTemplateButton.addEventListener("click", async () => {
  await navigator.clipboard.writeText(getActiveTemplate());
  copyTemplateButton.textContent = "已复制";
  window.setTimeout(() => {
    copyTemplateButton.textContent = "复制模板";
  }, 1200);
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

loadConfig();
promptTemplateInput.value =
  localStorage.getItem(templateStorageKey) || defaultPromptTemplate;
updatePrompt();
setStatus("", "");
