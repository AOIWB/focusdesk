import { invoke, isTauri } from "@tauri-apps/api/core";
import type { SyncSettings } from "./device";
import { readLocal } from "./storage";
import { emptyDocument, mergeDocuments, type SyncDocument } from "./syncModel";
const encode = (text: string) => {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
};
const decode = (text: string) =>
  new TextDecoder().decode(
    Uint8Array.from(atob(text.replace(/\s/g, "")), (c) => c.charCodeAt(0)),
  );
const segment = encodeURIComponent;
export function targetKey(s: SyncSettings) {
  return `${s.provider}/${s.owner}/${s.repo}/${s.branch}/${s.directory}`;
}
export async function repoRequest(
  s: SyncSettings,
  path: string,
  method = "GET",
  body?: unknown,
): Promise<{ status: number; body: any }> {
  if (isTauri())
    return invoke("repository_request", {
      provider: s.provider,
      path,
      token: s.token,
      method,
      body: body ?? null,
    });
  const base =
    s.provider === "github"
      ? "https://api.github.com"
      : "https://gitee.com/api/v5";
  const endpoint =
    s.provider === "gitee"
      ? `${base}${path}${path.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(s.token)}`
      : base + path;
  const response = await fetch(endpoint, {
    method,
    headers: {
      ...(s.provider === "github"
        ? { Authorization: `Bearer ${s.token}` }
        : {}),
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(45000),
  });
  return { status: response.status, body: await response.json() };
}
const repoPath = (s: SyncSettings) =>
  `/repos/${segment(s.owner)}/${segment(s.repo)}`;
function assertResponse(result: { status: number; body: any }) {
  if (result.status < 200 || result.status >= 300)
    throw new Error(
      result.status === 409 || result.status === 422
        ? "云端已变化，请重新同步后合并"
        : `仓库请求失败（${result.status}）：${String(result.body?.message || "请检查令牌、仓库和分支")}`,
    );
}
export async function testRepository(s: SyncSettings) {
  if (!s.owner.trim() || !s.repo.trim() || !s.branch.trim() || !s.token.trim())
    throw new Error("请填写所有仓库配置");
  const info = await repoRequest(s, repoPath(s));
  assertResponse(info);
  if (info.body.private !== true && info.body.public !== false)
    throw new Error("请选择私有仓库，工作记录会上传到这里");
  const branch = await repoRequest(
    s,
    `${repoPath(s)}/branches/${segment(s.branch)}`,
  );
  assertResponse(branch);
  return "连接成功（读取权限已验证，写入权限在同步时验证）";
}
function contentPath(s: SyncSettings, file: string) {
  return `${repoPath(s)}/contents/${[...s.directory.split("/").filter(Boolean), ...file.split("/")].map(segment).join("/")}`;
}
async function readFile(s: SyncSettings, file: string) {
  const result = await repoRequest(
    s,
    `${contentPath(s, file)}?ref=${segment(s.branch)}`,
  );
  if (result.status === 404) return null;
  assertResponse(result);
  if (typeof result.body.content !== "string")
    throw new Error("仓库文件超出当前接口直接读取范围，请减少单份笔记图片大小");
  return {
    content: result.body.content as string,
    sha: result.body.sha as string,
  };
}
async function putFile(
  s: SyncSettings,
  file: string,
  content: string,
  sha?: string,
) {
  const method = s.provider === "gitee" && !sha ? "POST" : "PUT";
  const result = await repoRequest(s, contentPath(s, file), method, {
    message: `Pinecone sync ${new Date().toISOString()}`,
    content,
    branch: s.branch,
    ...(sha ? { sha } : {}),
  });
  assertResponse(result);
}
export async function externalizeImages(
  doc: SyncDocument,
  upload: (path: string, base64: string) => Promise<void>,
) {
  const refs = new Map<string, string>();
  async function walk(value: any): Promise<any> {
    if (
      typeof value === "string" &&
      /^data:image\/[\w.+-]+;base64,/.test(value)
    ) {
      if (refs.has(value)) return refs.get(value);
      const [header, base64] = value.split(",");
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(value),
      );
      const hash = Array.from(new Uint8Array(digest), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join("");
      const ref = `pinecone-asset:${hash}:${header.slice(5, -7)}`;
      refs.set(value, ref);
      await upload(`assets/${hash}`, base64);
      return ref;
    }
    if (Array.isArray(value)) return Promise.all(value.map(walk));
    if (value && typeof value === "object") {
      const result: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(value))
        result[key] = await walk(item);
      return result;
    }
    return value;
  }
  return walk(doc) as Promise<SyncDocument>;
}
async function hydrateImages(s: SyncSettings, doc: SyncDocument) {
  const cache = new Map<string, string>();
  async function walk(value: any): Promise<any> {
    if (typeof value === "string" && value.startsWith("pinecone-asset:")) {
      if (cache.has(value)) return cache.get(value);
      const [, hash, mime] = value.split(":");
      const asset = await readFile(s, `assets/${hash}`);
      if (!asset) throw new Error("云端图片缺失，请检查仓库 assets 目录");
      const image = `data:${mime};base64,${asset.content.replace(/\s/g, "")}`;
      cache.set(value, image);
      return image;
    }
    if (Array.isArray(value)) return Promise.all(value.map(walk));
    if (value && typeof value === "object") {
      const result: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(value))
        result[key] = await walk(item);
      return result;
    }
    return value;
  }
  return walk(doc) as Promise<SyncDocument>;
}
export interface SyncPlan {
  base: SyncDocument;
  local: SyncDocument;
  remote: SyncDocument;
  sha?: string;
  first: boolean;
  target: string;
}
export async function prepareSync(
  s: SyncSettings,
  local: SyncDocument,
): Promise<SyncPlan> {
  await testRepository(s);
  const target = targetKey(s),
    saved = await readLocal(`sync-base:${target}`);
  const file = await readFile(s, "workspace.json");
  const raw = file ? JSON.parse(decode(file.content)) : emptyDocument();
  if (raw.schema !== 1 || !raw.records || !raw.deleted)
    throw new Error("云端数据格式不兼容");
  const remote = await hydrateImages(s, raw);
  return {
    local,
    remote,
    base: saved ? JSON.parse(saved) : emptyDocument(),
    sha: file?.sha,
    first: !saved,
    target,
  };
}
export async function uploadSync(
  s: SyncSettings,
  plan: SyncPlan,
  choices: Record<string, "local" | "remote">,
) {
  const result = mergeDocuments(plan.base, plan.local, plan.remote, choices);
  if (result.conflicts.length) throw new Error("请先选择冲突内容的保留版本");
  if (JSON.stringify(result.document) === JSON.stringify(plan.remote))
    return result.document;
  const doc = await externalizeImages(
    result.document,
    async (path, content) => {
      if (!(await readFile(s, path))) await putFile(s, path, content);
    },
  );
  await putFile(s, "workspace.json", encode(JSON.stringify(doc)), plan.sha);
  return result.document;
}
