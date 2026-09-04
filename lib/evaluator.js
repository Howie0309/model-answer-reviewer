export function normalizeEndpoint(endpoint, apiMode = "chat") {
  const trimmed = String(endpoint || "").trim().replace(/\/+$/, "");
  if (!/^https:\/\//i.test(trimmed)) {
    throw new Error("API 地址必须以 https:// 开头。");
  }

  if (apiMode === "responses") {
    return trimmed.endsWith("/responses") ? trimmed : `${trimmed}/responses`;
  }

  if (apiMode === "messages") {
    return trimmed.endsWith("/messages") ? trimmed : `${trimmed}/messages`;
  }

  return trimmed.endsWith("/chat/completions")
    ? trimmed
    : `${trimmed}/chat/completions`;
}

export function extractResponseText(payload) {
  if (typeof payload?.output_text === "string") {
    return payload.output_text.trim();
  }

  const parts = [];
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === "string") parts.push(content.text);
    }
  }
  return parts.join("\n").trim();
}

export function extractChatText(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => (typeof part === "string" ? part : part?.text || ""))
    .filter(Boolean)
    .join("\n")
    .trim();
}

export function extractClaudeText(payload) {
  return (payload?.content || [])
    .filter((part) => part?.type === "text" && typeof part?.text === "string")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function modelUsesReasoning(model) {
  return /^(gpt-[56]|o[134])/i.test(String(model || ""));
}

function buildRequestBody({
  provider,
  model,
  systemPrompt,
  userPrompt,
  temperature = 0,
  reasoningEffort = "auto",
  webSearch = false
}) {
  if (provider === "openai") {
    const body = {
      model,
      instructions: systemPrompt,
      input: userPrompt
    };
    if (reasoningEffort !== "auto") {
      body.reasoning = { effort: reasoningEffort };
    }
    if (!modelUsesReasoning(model)) {
      body.temperature = Number(temperature) || 0;
    }
    if (webSearch) body.tools = [{ type: "web_search" }];
    return body;
  }

  if (provider === "anthropic") {
    const body = {
      model,
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }]
    };
    if (webSearch) {
      const supportsDynamicSearch =
        /^claude-(opus-4-[678]|sonnet-(5|4-6)|fable-5|mythos-5)/i.test(model);
      body.tools = [
        {
          type: supportsDynamicSearch
            ? "web_search_20260318"
            : "web_search_20250305",
          name: "web_search",
          max_uses: 5
        }
      ];
    }
    return body;
  }

  return {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    temperature: Number(temperature) || 0
  };
}

export async function callConfiguredJudge(
  {
    apiKey,
    endpoint,
    model,
    provider = "custom",
    systemPrompt,
    userPrompt,
    temperature = 0,
    reasoningEffort = "auto",
    webSearch = false
  },
  fetchImpl = fetch,
  externalSignal = null
) {
  if (!String(apiKey || "").trim()) throw new Error("请先填写 API Key。");
  if (!String(model || "").trim()) throw new Error("请先填写评测模型。");
  if (!String(systemPrompt || "").trim()) throw new Error("评测系统指令不能为空。");
  if (!String(userPrompt || "").trim()) throw new Error("评测内容不能为空。");

  const apiMode = provider === "openai"
    ? "responses"
    : provider === "anthropic"
      ? "messages"
      : "chat";
  const timeoutSignal = AbortSignal.timeout(180000);
  const signal = externalSignal
    ? AbortSignal.any([externalSignal, timeoutSignal])
    : timeoutSignal;
  const response = await fetchImpl(
    normalizeEndpoint(endpoint, apiMode),
    {
      method: "POST",
      headers:
        provider === "anthropic"
          ? {
              "x-api-key": String(apiKey).trim(),
              "anthropic-version": "2023-06-01",
              "content-type": "application/json"
            }
          : {
              authorization: `Bearer ${String(apiKey).trim()}`,
              "content-type": "application/json"
            },
      body: JSON.stringify(
        buildRequestBody({
          provider,
          model: String(model).trim(),
          systemPrompt,
          userPrompt,
          temperature,
          reasoningEffort,
          webSearch
        })
      ),
      signal
    }
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      payload?.error?.message ||
        payload?.message ||
        `模型接口请求失败（HTTP ${response.status}）。`
    );
    error.status = response.status;
    throw error;
  }

  const text = apiMode === "responses"
    ? extractResponseText(payload)
    : apiMode === "messages"
      ? extractClaudeText(payload)
      : extractChatText(payload);
  if (!text) throw new Error("模型接口没有返回可用文本。");

  return {
    text,
    usage: payload?.usage || null
  };
}
