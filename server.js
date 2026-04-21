import { createServer } from "node:http";
import { request as httpsRequest } from "node:https";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(__dirname, "public");
const envPath = join(__dirname, ".env");
const execFileAsync = promisify(execFile);

loadEnvFile(envPath);

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.4";
const ANTHROPIC_MODEL =
  process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5-20250929";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const DEMO_MODE = process.env.DEMO_MODE === "true";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function loadEnvFile(path) {
  if (!existsSync(path)) return;

  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

const debateSystemPrompt = `
你正在参与一个双模型分析工作流。目标不是赢得辩论，而是帮助用户得到更可靠的结论。
要求：
- 用中文回答，除非用户明确要求其他语言。
- 观点要清晰、可执行，不要空泛。
- 明确区分事实、推断、假设和不确定性。
- 如果信息不足，指出需要补充的信息，但仍要给出当前可用判断。
- 不要编造外部数据、公司事实或引用来源。
`.trim();

const prompts = {
  gptFirst: (task) => `
你是 GPT，角色是“结构化主分析师”。

用户任务：
${task}

请输出：
1. 你对任务的理解
2. 分析框架
3. 初步判断
4. 最关键的 3 个假设
5. 建议下一步
`.trim(),

  claudeCritique: ({ task, gptFirst }) => `
你是 Claude，角色是“反方审查者和补充分析师”。

用户任务：
${task}

GPT 的初步分析：
${gptFirst}

请输出：
1. 你同意的部分
2. 你认为 GPT 忽略或低估的风险
3. 需要挑战的假设
4. 你给出的替代判断
5. 对最终结论的建议
`.trim(),

  gptRevision: ({ task, gptFirst, claudeCritique }) => `
你仍然是 GPT，角色是“修正后的主分析师”。

用户任务：
${task}

你的初稿：
${gptFirst}

Claude 的反方审查：
${claudeCritique}

请基于 Claude 的意见修正你的分析：
1. 哪些观点保持不变，为什么
2. 哪些观点需要修正，为什么
3. 修正后的核心判断
4. 更稳妥的行动建议
`.trim(),

  claudeFinal: ({ task, gptRevision }) => `
你是 Claude，角色是“最终质询者”。

用户任务：
${task}

GPT 的修正版：
${gptRevision}

请给出最后一轮意见：
1. 目前已经形成的共识
2. 仍然存在的分歧或不确定性
3. 最容易误导用户的地方
4. 你建议最终报告如何表述
`.trim(),

  finalEditor: ({ task, gptFirst, claudeCritique, gptRevision, claudeFinal }) => `
你是最终总编辑。请基于 GPT 和 Claude 的完整讨论，输出一份可以交付给用户的最终结论。

用户任务：
${task}

GPT 初稿：
${gptFirst}

Claude 反方审查：
${claudeCritique}

GPT 修正版：
${gptRevision}

Claude 最终意见：
${claudeFinal}

最终报告格式：
# 最终结论
用一句话给出判断。

## 共识
列出两个模型都支持的判断。

## 主要分歧与不确定性
列出不能被确定解决的问题。

## 风险
列出最值得警惕的风险。

## 建议行动
给出接下来 1-3 步可执行动作。

## 需要补充的信息
列出为了让结论更可靠，用户还应该提供什么。
`.trim()
};

function jsonResponse(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function extractOpenAIText(payload) {
  if (typeof payload.output_text === "string") return payload.output_text.trim();

  const parts = [];
  for (const item of payload.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string") parts.push(content.text);
    }
  }
  return parts.join("\n").trim();
}

function extractClaudeText(payload) {
  return (payload.content || [])
    .filter((block) => block.type === "text" && block.text)
    .map((block) => block.text)
    .join("\n")
    .trim();
}

function extractGeminiText(payload) {
  return (payload.candidates || [])
    .flatMap((candidate) => candidate.content?.parts || [])
    .filter((part) => part.text)
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function envValue(name) {
  const value = process.env[name]?.trim();
  if (!value || value.startsWith("your_")) return "";
  return value;
}

async function postJsonWithHttps(url, headers, payload) {
  const target = new URL(url);
  const body = JSON.stringify(payload);

  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      {
        hostname: target.hostname,
        path: `${target.pathname}${target.search}`,
        method: "POST",
        headers: {
          ...headers,
          "content-length": Buffer.byteLength(body)
        }
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          let parsed;
          try {
            parsed = data ? JSON.parse(data) : {};
          } catch {
            return reject(new Error(`Invalid JSON response: ${data.slice(0, 120)}`));
          }
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, payload: parsed });
        });
      }
    );

    req.on("error", reject);
    req.end(body);
  });
}

async function postJsonWithCurl(url, headers, payload) {
  const args = ["-sS", "--max-time", "180", "-X", "POST", url];
  for (const [key, value] of Object.entries(headers)) {
    args.push("-H", `${key}: ${value}`);
  }
  args.push("-d", JSON.stringify(payload), "-w", "\n__HTTP_STATUS__:%{http_code}");

  const { stdout } = await execFileAsync("curl", args, {
    maxBuffer: 1024 * 1024 * 8
  });
  const marker = "\n__HTTP_STATUS__:";
  const markerIndex = stdout.lastIndexOf(marker);
  const rawBody = markerIndex === -1 ? stdout : stdout.slice(0, markerIndex);
  const status = markerIndex === -1 ? 0 : Number(stdout.slice(markerIndex + marker.length));

  let parsed;
  try {
    parsed = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    throw new Error(`Invalid JSON response: ${rawBody.slice(0, 120)}`);
  }

  return { ok: status >= 200 && status < 300, payload: parsed };
}

async function callOpenAI(prompt) {
  if (DEMO_MODE) return demoAnswer("GPT", prompt);
  const apiKey = envValue("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY. Set it in your shell or .env file.");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: [
        { role: "system", content: debateSystemPrompt },
        { role: "user", content: prompt }
      ]
    })
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error?.message || "OpenAI request failed.");
  }

  const text = extractOpenAIText(payload);
  if (!text) throw new Error("OpenAI returned an empty response.");
  return text;
}

async function callClaude(prompt) {
  if (DEMO_MODE) return demoAnswer("Claude", prompt);
  const apiKey = envValue("ANTHROPIC_API_KEY");
  if (!apiKey) {
    throw new Error(
      "Missing ANTHROPIC_API_KEY. Set it in your shell or .env file."
    );
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 2200,
      system: debateSystemPrompt,
      messages: [{ role: "user", content: prompt }]
    })
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error?.message || "Claude request failed.");
  }

  const text = extractClaudeText(payload);
  if (!text) throw new Error("Claude returned an empty response.");
  return text;
}

async function callGemini(prompt) {
  if (DEMO_MODE) return demoAnswer("Gemini", prompt);
  const apiKey = envValue("GEMINI_API_KEY");
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY. Set it in your .env file.");
  }

  let result;
  const requestUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  const requestHeaders = {
    "x-goog-api-key": apiKey,
    "content-type": "application/json"
  };
  const requestPayload = {
    systemInstruction: {
      parts: [{ text: debateSystemPrompt }]
    },
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 4096
    }
  };

  try {
    result = await postJsonWithCurl(requestUrl, requestHeaders, requestPayload);
  } catch (error) {
    const cause = error?.cause?.code || error?.cause?.message || "no cause";
    throw new Error(`Gemini network request failed: ${error.message}; ${cause}`);
  }

  const payload = result.payload;
  if (!result.ok) {
    throw new Error(payload.error?.message || "Gemini request failed.");
  }

  const text = extractGeminiText(payload);
  if (!text) throw new Error("Gemini returned an empty response.");
  return text;
}

function hasAnyRealProvider() {
  return Boolean(
    envValue("OPENAI_API_KEY") ||
      envValue("ANTHROPIC_API_KEY") ||
      envValue("GEMINI_API_KEY")
  );
}

async function callModel(preferredProvider, prompt) {
  if (DEMO_MODE) return demoAnswer(preferredProvider, prompt);

  if (!hasAnyRealProvider()) {
    throw new Error(
      "Missing API key. Set OPENAI_API_KEY, ANTHROPIC_API_KEY, or GEMINI_API_KEY in your .env file."
    );
  }

  if (preferredProvider === "GPT" && envValue("OPENAI_API_KEY")) {
    return callOpenAI(prompt);
  }

  if (preferredProvider === "Claude" && envValue("ANTHROPIC_API_KEY")) {
    return callClaude(prompt);
  }

  if (envValue("GEMINI_API_KEY")) return callGemini(prompt);
  if (envValue("OPENAI_API_KEY")) return callOpenAI(prompt);
  if (envValue("ANTHROPIC_API_KEY")) return callClaude(prompt);

  throw new Error("No available model provider.");
}

function roleLabel(preferredProvider) {
  if (DEMO_MODE) return preferredProvider;
  if (preferredProvider === "GPT" && envValue("OPENAI_API_KEY")) return "GPT";
  if (preferredProvider === "Claude" && envValue("ANTHROPIC_API_KEY")) {
    return "Claude";
  }
  if (envValue("GEMINI_API_KEY")) return `${preferredProvider} by Gemini`;
  if (envValue("OPENAI_API_KEY")) return `${preferredProvider} by GPT`;
  if (envValue("ANTHROPIC_API_KEY")) return `${preferredProvider} by Claude`;
  return preferredProvider;
}

async function runDebate(task) {
  if (
    envValue("GEMINI_API_KEY") &&
    !envValue("OPENAI_API_KEY") &&
    !envValue("ANTHROPIC_API_KEY") &&
    !DEMO_MODE
  ) {
    return runGeminiOnlyDebate(task);
  }

  const gptLabel = roleLabel("GPT");
  const claudeLabel = roleLabel("Claude");
  const editorLabel = roleLabel("GPT");

  const gptFirst = await callModel("GPT", prompts.gptFirst(task));
  const claudeCritique = await callModel(
    "Claude",
    prompts.claudeCritique({ task, gptFirst })
  );
  const gptRevision = await callModel(
    "GPT",
    prompts.gptRevision({ task, gptFirst, claudeCritique })
  );
  const claudeFinal = await callModel(
    "Claude",
    prompts.claudeFinal({ task, gptRevision })
  );
  const final = await callModel(
    "GPT",
    prompts.finalEditor({
      task,
      gptFirst,
      claudeCritique,
      gptRevision,
      claudeFinal
    })
  );

  return {
    modelConfig: {
      openai: OPENAI_MODEL,
      anthropic: ANTHROPIC_MODEL,
      gemini: GEMINI_MODEL,
      demoMode: DEMO_MODE
    },
    rounds: [
      { role: gptLabel, title: "初步分析", content: gptFirst },
      { role: claudeLabel, title: "反方审查", content: claudeCritique },
      { role: gptLabel, title: "修正观点", content: gptRevision },
      { role: claudeLabel, title: "最终质询", content: claudeFinal }
    ],
    finalRole: editorLabel,
    final
  };
}

const defaultComparePromptTemplate = `
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

function fillPromptTemplate(template, values) {
  return template
    .replaceAll("{{query}}", values.query)
    .replaceAll("{{answerA}}", values.answerA)
    .replaceAll("{{answerB}}", values.answerB);
}

function buildComparePrompt({ query, answerA, answerB, template }) {
  const chosenTemplate = String(template || "").trim() || defaultComparePromptTemplate;
  return fillPromptTemplate(chosenTemplate, { query, answerA, answerB });
}

async function runComparison({ query, answerA, answerB, template }) {
  const prompt = buildComparePrompt({ query, answerA, answerB, template });
  const final = await callModel("GPT", prompt);

  return {
    modelConfig: {
      openai: OPENAI_MODEL,
      anthropic: ANTHROPIC_MODEL,
      gemini: GEMINI_MODEL,
      demoMode: DEMO_MODE
    },
    prompt,
    final
  };
}

async function runGeminiOnlyDebate(task) {
  const combined = await callGemini(`
你要在一次回复中模拟一个双模型讨论工作流。

用户任务：
${task}

请严格按下面 3 个分隔标题输出，不要省略标题：

[[MODEL_A]]
你扮演模型 A：结构化分析师。输出核心判断、关键依据、最大假设、下一步建议。

[[MODEL_B]]
你扮演模型 B：反方质询者。针对模型 A 的观点，输出同意什么、哪里可能错、最大风险、需要补充什么。

[[FINAL]]
你扮演总编辑。输出最终交付物，包含：
# 最终结论
## 共识
## 主要风险
## 建议行动
## 仍需补充的信息
`.trim());

  const analyst = extractSection(combined, "MODEL_A");
  const critic = extractSection(combined, "MODEL_B");
  const final = extractSection(combined, "FINAL") || combined;

  return {
    modelConfig: {
      openai: OPENAI_MODEL,
      anthropic: ANTHROPIC_MODEL,
      gemini: GEMINI_MODEL,
      demoMode: DEMO_MODE
    },
    rounds: [
      { role: "模型 A by Gemini", title: "初步分析", content: analyst },
      { role: "模型 B by Gemini", title: "反方审查", content: critic }
    ],
    finalRole: "总编辑 by Gemini",
    final
  };
}

function extractSection(content, sectionName) {
  const pattern = new RegExp(
    `\\[\\[${sectionName}\\]\\]([\\s\\S]*?)(?=\\n\\[\\[[A-Z_]+\\]\\]|$)`,
    "i"
  );
  return content.match(pattern)?.[1]?.trim() || "";
}

function demoAnswer(model, prompt) {
  const compactPrompt = prompt.replace(/\s+/g, " ").slice(0, 140);
  return `
${model} 演示回复

这是 DEMO_MODE=true 下的占位输出。实际接入 API key 后，这里会返回真实模型的分析。

我会基于当前任务先给出一个谨慎判断：这个方向值得做小范围验证，但不要直接投入完整产品。第一步应确认目标用户、使用频率、愿付费场景和最终交付物标准。

参考输入片段：${compactPrompt}
`.trim();
}

async function handleApi(req, res) {
  if (req.url === "/api/config" && req.method === "GET") {
    return jsonResponse(res, 200, {
      openaiModel: OPENAI_MODEL,
      anthropicModel: ANTHROPIC_MODEL,
      geminiModel: GEMINI_MODEL,
      demoMode: DEMO_MODE,
      hasOpenAIKey: Boolean(envValue("OPENAI_API_KEY")),
      hasAnthropicKey: Boolean(envValue("ANTHROPIC_API_KEY")),
      hasGeminiKey: Boolean(envValue("GEMINI_API_KEY"))
    });
  }

  if (req.url === "/api/debate" && req.method === "POST") {
    try {
      const body = await readJson(req);
      const task = String(body.task || "").trim();
      if (task.length < 8) {
        return jsonResponse(res, 400, {
          error: "请写一个更完整的分析任务，至少 8 个字符。"
        });
      }

      const result = await runDebate(task);
      return jsonResponse(res, 200, result);
    } catch (error) {
      return jsonResponse(res, 500, {
        error: error instanceof Error ? error.message : "Unknown server error."
      });
    }
  }

  if (req.url === "/api/compare" && req.method === "POST") {
    try {
      const body = await readJson(req);
      const query = String(body.query || "").trim();
      const answerA = String(body.answerA || "").trim();
      const answerB = String(body.answerB || "").trim();
      const template = String(body.template || "");

      if (query.length < 4 || answerA.length < 4 || answerB.length < 4) {
        return jsonResponse(res, 400, {
          error: "请填写原始 query、A 模型回答和 B 模型回答。"
        });
      }

      const result = await runComparison({ query, answerA, answerB, template });
      return jsonResponse(res, 200, result);
    } catch (error) {
      return jsonResponse(res, 500, {
        error: error instanceof Error ? error.message : "Unknown server error."
      });
    }
  }

  return jsonResponse(res, 404, { error: "API route not found." });
}

async function serveStatic(req, res) {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  const requestPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const normalized = normalize(requestPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(publicDir, normalized);

  try {
    const file = await readFile(filePath);
    res.writeHead(200, {
      "content-type": mimeTypes[extname(filePath)] || "application/octet-stream"
    });
    res.end(file);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

createServer(async (req, res) => {
  if ((req.url || "").startsWith("/api/")) {
    await handleApi(req, res);
    return;
  }

  await serveStatic(req, res);
}).listen(PORT, HOST, () => {
  console.log(`Dual Model Debate is running at http://${HOST}:${PORT}`);
});
