import test from "node:test";
import assert from "node:assert/strict";
import {
  callConfiguredJudge,
  extractChatText,
  extractClaudeText,
  extractResponseText,
  normalizeEndpoint
} from "../lib/evaluator.js";

test("normalizes Responses and Chat Completions endpoints", () => {
  assert.equal(
    normalizeEndpoint("https://api.openai.com/v1/", "responses"),
    "https://api.openai.com/v1/responses"
  );
  assert.equal(
    normalizeEndpoint("https://api.deepseek.com/v1", "chat"),
    "https://api.deepseek.com/v1/chat/completions"
  );
  assert.equal(
    normalizeEndpoint("https://api.anthropic.com/v1", "messages"),
    "https://api.anthropic.com/v1/messages"
  );
});

test("extracts text from both supported response formats", () => {
  assert.equal(extractResponseText({ output_text: "  OpenAI result  " }), "OpenAI result");
  assert.equal(
    extractResponseText({
      output: [{ content: [{ type: "output_text", text: "nested result" }] }]
    }),
    "nested result"
  );
  assert.equal(
    extractChatText({ choices: [{ message: { content: " chat result " } }] }),
    "chat result"
  );
  assert.equal(
    extractClaudeText({ content: [{ type: "text", text: " Claude result " }] }),
    "Claude result"
  );
});

test("uses Responses API for OpenAI without exposing the key in the result", async () => {
  let captured;
  const fakeFetch = async (url, options) => {
    captured = { url, options, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({ output_text: "评测完成", usage: { total_tokens: 12 } }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  const result = await callConfiguredJudge(
    {
      apiKey: "session-key",
      endpoint: "https://api.openai.com/v1",
      model: "gpt-5.4",
      provider: "openai",
      systemPrompt: "你是评测员",
      userPrompt: "比较 A 和 B",
      reasoningEffort: "low"
    },
    fakeFetch
  );

  assert.equal(captured.url, "https://api.openai.com/v1/responses");
  assert.equal(captured.options.headers.authorization, "Bearer session-key");
  assert.deepEqual(captured.body, {
    model: "gpt-5.4",
    instructions: "你是评测员",
    input: "比较 A 和 B",
    reasoning: { effort: "low" }
  });
  assert.deepEqual(result, { text: "评测完成", usage: { total_tokens: 12 } });
  assert.equal(JSON.stringify(result).includes("session-key"), false);
});

test("uses Chat Completions for compatible providers", async () => {
  let captured;
  const fakeFetch = async (url, options) => {
    captured = { url, body: JSON.parse(options.body) };
    return new Response(
      JSON.stringify({ choices: [{ message: { content: "兼容接口结果" } }] }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };

  const result = await callConfiguredJudge(
    {
      apiKey: "test-key",
      endpoint: "https://api.xiaomimimo.com/v1",
      model: "mimo-v2-flash",
      provider: "xiaomi",
      systemPrompt: "你是评测员",
      userPrompt: "比较 A 和 B",
      temperature: 0.2
    },
    fakeFetch
  );

  assert.equal(captured.url, "https://api.xiaomimimo.com/v1/chat/completions");
  assert.equal(captured.body.temperature, 0.2);
  assert.equal(captured.body.messages[1].content, "比较 A 和 B");
  assert.equal(result.text, "兼容接口结果");
});

test("enables native OpenAI web search in the Responses API", async () => {
  let captured;
  const fakeFetch = async (url, options) => {
    captured = { url, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({ output_text: "已联网核验" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  await callConfiguredJudge(
    {
      apiKey: "openai-key",
      endpoint: "https://api.openai.com/v1",
      model: "gpt-6-astra",
      provider: "openai",
      systemPrompt: "你是评测员",
      userPrompt: "核验最新事实",
      reasoningEffort: "low",
      webSearch: true
    },
    fakeFetch
  );

  assert.equal(captured.url, "https://api.openai.com/v1/responses");
  assert.deepEqual(captured.body.tools, [{ type: "web_search" }]);
  assert.equal("temperature" in captured.body, false);
});

test("uses Anthropic Messages with Claude Opus and native web search", async () => {
  let captured;
  const fakeFetch = async (url, options) => {
    captured = { url, headers: options.headers, body: JSON.parse(options.body) };
    return new Response(
      JSON.stringify({
        content: [{ type: "text", text: "Claude 已完成联网评测" }],
        usage: { input_tokens: 20, output_tokens: 10 }
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };

  const result = await callConfiguredJudge(
    {
      apiKey: "anthropic-key",
      endpoint: "https://api.anthropic.com/v1",
      model: "claude-opus-5",
      provider: "anthropic",
      systemPrompt: "你是评测员",
      userPrompt: "比较 A 和 B",
      webSearch: true
    },
    fakeFetch
  );

  assert.equal(captured.url, "https://api.anthropic.com/v1/messages");
  assert.equal(captured.headers["x-api-key"], "anthropic-key");
  assert.equal("authorization" in captured.headers, false);
  assert.deepEqual(captured.body.tools, [
    { type: "web_search_20250305", name: "web_search", max_uses: 5 }
  ]);
  assert.equal(result.text, "Claude 已完成联网评测");
});

test("surfaces provider error messages", async () => {
  await assert.rejects(
    callConfiguredJudge(
      {
        apiKey: "bad-key",
        endpoint: "https://example.com/v1",
        model: "example-model",
        provider: "custom",
        systemPrompt: "system",
        userPrompt: "user"
      },
      async () =>
        new Response(JSON.stringify({ error: { message: "invalid key" } }), {
          status: 401,
          headers: { "content-type": "application/json" }
        })
    ),
    /invalid key/
  );
});
