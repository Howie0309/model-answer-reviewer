# 模型回答评测器

一个最小可运行的 MVP：用户输入原始 query，再粘贴 A 模型和 B 模型的回答，系统输出评测结果，或者生成可复制到网页端模型的评审 Prompt。

自动评测支持在页面直接配置 DeepSeek、OpenAI、Anthropic Claude、小米 MiMo 或其他 OpenAI-compatible API。服务商、模型和 API 地址保存在浏览器本地；API Key 只保存在当前标签页所属的 `sessionStorage`，随本次评测请求临时发送给后端，不写入项目文件或服务器磁盘。OpenAI 使用 Responses API，Anthropic 使用 Messages API，其他页面配置的服务商使用 Chat Completions 兼容接口。OpenAI 与 Anthropic 可在页面开启原生联网搜索。

已线上部署：https://model-answer-reviewer.onrender.com

## 运行

```bash
cd dual-model-debate
cp .env.example .env
```

填写 `.env`：

```bash
OPENAI_API_KEY=your_openai_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
DEEPSEEK_API_KEY=your_deepseek_api_key
GEMINI_API_KEY=your_gemini_api_key
XIAOMI_API_KEY=your_xiaomi_api_key
OPENAI_MODEL=gpt-5.6-sol
ANTHROPIC_MODEL=claude-opus-5
GEMINI_MODEL=gemini-2.5-flash
XIAOMI_MODEL=mimo-v2.5-pro
XIAOMI_BASE_URL=https://api.xiaomimimo.com/v1
```

如果你暂时只有 Gemini API key，也可以只填：

```bash
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash
DEMO_MODE=false
```

这时系统会用 Gemini 做自动评测；也可以直接走“生成评审 Prompt”的手动模式。

如果你使用小米 MiMo API key，也可以只填：

```bash
XIAOMI_API_KEY=your_xiaomi_api_key
XIAOMI_MODEL=mimo-v2.5-pro
XIAOMI_BASE_URL=https://api.xiaomimimo.com/v1
DEMO_MODE=false
```

这时系统会通过小米的 OpenAI-compatible 接口做自动评测。

启动服务：

```bash
npm run dev
```

打开：

```text
http://localhost:3000
```

## 自动评测

打开页面后，在“自动评测 API”区域选择服务商，并填写模型、HTTPS API 地址和 API Key。然后输入 query、A 回答和 B 回答，点击“自动评测”。

页面配置支持：

- DeepSeek：`https://api.deepseek.com`，包含 `deepseek-v4-pro`、`deepseek-v4-flash`、`deepseek-v4-flash-vision-exp`
- OpenAI：`https://api.openai.com/v1`，包含 GPT-6 Astra、GPT-5.6 Sol / Terra / Luna、GPT-5.5，通过 Responses API 调用
- Anthropic Claude：`https://api.anthropic.com/v1`，包含 Claude Fable 5.1、Opus 5、Sonnet 5、Opus 4.8、Haiku 4.5，通过 Messages API 调用
- 小米 MiMo：`https://api.xiaomimimo.com/v1`，包含 `mimo-v2.5-pro`、`mimo-v2.5`
- 自定义 OpenAI-compatible 接口

选择 OpenAI 或 Anthropic 后可以开启“联网搜索”。程序会按模型添加其原生 Web Search 工具；联网搜索可能产生额外费用，并且需要对应账号或组织已开通该能力。

如果页面没有填写 API Key，程序仍会按下方 `.env` 环境变量寻找可用模型，兼容已有的 Render 部署方式。手工“生成评审 Prompt”功能始终可用。

## 部署到 Render

这个项目已经包含 [`render.yaml`](./render.yaml)，可以直接部署到 Render。

1. 把项目推到 GitHub
2. 登录 Render
3. 选择 `New +` -> `Blueprint`
4. 选中这个仓库
5. 在 Render 后台补充环境变量：

```bash
GEMINI_API_KEY=your_gemini_api_key
XIAOMI_API_KEY=your_xiaomi_api_key
DEMO_MODE=false
```

如果你也要启用 OpenAI / Anthropic 自动评测，可以继续加：

```bash
OPENAI_API_KEY=your_openai_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
OPENAI_MODEL=gpt-5.6-sol
ANTHROPIC_MODEL=claude-opus-5
```

部署完成后，Render 会给你一个公网 URL，别人就能直接访问。

## 演示模式

如果暂时没有 API key，可以把 `.env` 里的 `DEMO_MODE` 改为：

```bash
DEMO_MODE=true
```

演示模式只返回本地占位内容，不会调用真实模型。

## 工作流

```text
用户输入 query + A/B 回答
  -> 自动评测
  -> 或生成评审 Prompt
  -> 输出最终评级
```

## 主要文件

```text
server.js             后端、模型调用、评测接口
public/index.html     页面结构
public/app.js         前端交互
public/styles.css     样式
.env.example          环境变量示例
render.yaml           Render 部署配置
```
