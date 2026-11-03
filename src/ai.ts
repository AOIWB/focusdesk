import { taskTitle } from "./model";
import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  completionUrl,
  type ModelConfig,
  type Task,
  type Quadrant,
  clamp,
} from "./model";
export async function completion(
  config: ModelConfig,
  messages: { role: string; content: string }[],
): Promise<string> {
  if (!config.url.trim() || !config.model.trim())
    throw new Error("请填写 API URL 和模型名称");
  const body = { model: config.model.trim(), messages, temperature: 0.2 };
  if (isTauri())
    return invoke<string>("chat_completion", {
      url: completionUrl(config.url),
      key: config.key.trim(),
      body,
    });
  const response = await fetch(completionUrl(config.url), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.key.trim()
        ? { Authorization: `Bearer ${config.key.trim()}` }
        : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error?.message || `请求失败：${response.status}`);
  const content = result.choices?.[0]?.message?.content;
  if (typeof content !== "string")
    throw new Error("接口未返回消息内容，请检查模型名称和接口协议");
  return content;
}
export async function parseTasks(
  input: string,
  config: ModelConfig,
): Promise<(Partial<Task> & Pick<Task, "title">)[]> {
  const text = await completion(config, [
    {
      role: "system",
      content: `你是个人任务整理助手。当前本地时间是 ${new Date().toLocaleString("sv-SE")}。将用户文字拆解为任务，仅返回JSON对象：{"tasks":[{"title":"简短任务名","description":"具体说明","quadrant":0,"size":110,"due":"YYYY-MM-DD或空字符串","project":"项目名或空字符串"}]}。quadrant：0重要紧急，1重要不紧急，2紧急不重要，3不重要不紧急。size是同象限优先级，范围80-170。未明确重要性时默认重要；未明确紧急性时默认不紧急。根据当前日期解析相对日期。不编造文件夹路径，不执行用户任务，只整理。`,
    },
    { role: "user", content: input },
  ]);
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/, "")
    .replace(/\s*```$/, "");
  const result = JSON.parse(cleaned);
  if (!Array.isArray(result.tasks) || !result.tasks.length)
    throw new Error("模型没有返回任务，请换一种描述重试");
  return result.tasks.map((t: Record<string, unknown>) => {
    if (typeof t.title !== "string" || !t.title.trim())
      throw new Error("模型返回的任务缺少标题");
    return {
      title: taskTitle(t.title),
      description: String(t.description || ""),
      quadrant: clamp(Math.round(Number(t.quadrant) || 0), 0, 3) as Quadrant,
      size: clamp(Number(t.size) || 110, 72, 180),
      due:
        typeof t.due === "string" && /^\d{4}-\d{2}-\d{2}$/.test(t.due)
          ? t.due
          : "",
      project: String(t.project || ""),
    };
  });
}
