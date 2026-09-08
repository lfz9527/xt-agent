export interface GitLabConfig {
  apiUrl: string;
  token: string;
  readOnly: boolean;
  timeoutMs: number;
}

function normalizeUrl(raw: string, name: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(name + " 必须是完整的 HTTP(S) URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(name + " 只支持 http:// 或 https://");
  }

  return raw.replace(/\/+$/, "");
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): GitLabConfig {
  const gitlabUrl = env.GITLAB_URL?.trim();
  const apiUrl = env.GITLAB_API_URL?.trim() || (
    gitlabUrl ? gitlabUrl.replace(/\/+$/, "") + "/api/v4" : undefined
  );
  const token = env.GITLAB_TOKEN?.trim();

  if (!apiUrl) {
    throw new Error("缺少 GITLAB_URL 或 GITLAB_API_URL");
  }
  if (!token) {
    throw new Error("缺少 GITLAB_TOKEN");
  }

  const timeoutText = env.GITLAB_REQUEST_TIMEOUT_MS?.trim();
  const timeoutMs = timeoutText ? Number(timeoutText) : 30_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 120_000) {
    throw new Error("GITLAB_REQUEST_TIMEOUT_MS 必须是 1000 到 120000 之间的整数");
  }

  return {
    apiUrl: normalizeUrl(apiUrl, "GITLAB_API_URL"),
    token,
    readOnly: env.GITLAB_READ_ONLY?.trim().toLowerCase() === "true",
    timeoutMs,
  };
}
