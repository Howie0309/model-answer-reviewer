# 模型回答评测器

一个最小可运行的 MVP：用户输入原始 query，再粘贴 A 模型和 B 模型的回答，系统输出评测结果，或者生成可复制到网页端模型的评审 Prompt。

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
GEMINI_API_KEY=your_gemini_api_key
OPENAI_MODEL=gpt-5.4
ANTHROPIC_MODEL=claude-sonnet-4-5-20250929
GEMINI_MODEL=gemini-2.5-flash
```

如果你暂时只有 Gemini API key，也可以只填：

```bash
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash
DEMO_MODE=false
```

这时系统会用 Gemini 做自动评测；也可以直接走“生成评审 Prompt”的手动模式。

启动服务：

```bash
npm run dev
```

打开：

```text
http://localhost:3000
```

## 部署到 Render

这个项目已经包含 [`render.yaml`](./render.yaml)，可以直接部署到 Render。

1. 把项目推到 GitHub
2. 登录 Render
3. 选择 `New +` -> `Blueprint`
4. 选中这个仓库
5. 在 Render 后台补充环境变量：

```bash
GEMINI_API_KEY=your_gemini_api_key
DEMO_MODE=false
```

如果你也要启用 OpenAI / Anthropic 自动评测，可以继续加：

```bash
OPENAI_API_KEY=your_openai_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
OPENAI_MODEL=gpt-5.4
ANTHROPIC_MODEL=claude-sonnet-4-5-20250929
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
