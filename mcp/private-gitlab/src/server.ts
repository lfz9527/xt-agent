import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { loadConfig } from "./config.js";
import { GitLabApiError, GitLabClient } from "./gitlab-client.js";

function response(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) ?? "null" }],
  };
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const details = error instanceof GitLabApiError ? { status: error.status, message } : { message };
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify({ error: details }, null, 2) }],
  };
}

async function run<T>(operation: () => Promise<T>) {
  try {
    return response(await operation());
  } catch (error) {
    return errorResponse(error);
  }
}

export function createServer(): McpServer {
  const client = new GitLabClient(loadConfig());
  const server = new McpServer({ name: "private-gitlab", version: "0.1.0" });

  server.registerTool("gitlab_health_check", {
    description: "检查私有 GitLab API 连通性，并返回当前认证用户和 GitLab 版本。",
    inputSchema: z.object({}),
  }, async () => run(async () => ({ user: await client.getCurrentUser(), version: await client.getVersion() })));

  server.registerTool("gitlab_list_projects", {
    description: "列出当前 token 可访问的 GitLab 项目。projectId 支持数字 ID 或 group/project 路径。",
    inputSchema: z.object({
      search: z.string().optional().describe("按项目名称或路径搜索"),
      membership: z.boolean().optional().describe("只返回当前用户所属项目"),
      page: z.number().int().positive().optional(),
      perPage: z.number().int().min(1).max(100).optional(),
    }),
  }, async ({ search, membership, page, perPage }) => run(() => client.listProjects({ search, membership, page, perPage })));

  server.registerTool("gitlab_get_project", {
    description: "获取一个 GitLab 项目的详情。",
    inputSchema: z.object({ projectId: z.string().min(1) }),
  }, async ({ projectId }) => run(() => client.getProject(projectId)));

  const issueListSchema = z.object({
    projectId: z.string().min(1),
    state: z.enum(["opened", "closed", "all"]).optional(),
    scope: z.enum(["created_by_me", "assigned_to_me", "all"]).optional(),
    search: z.string().optional(),
    labels: z.array(z.string()).optional(),
    page: z.number().int().positive().optional(),
    perPage: z.number().int().min(1).max(100).optional(),
  });

  server.registerTool("gitlab_list_issues", {
    description: "列出项目 Issue，支持状态、范围、关键词和标签筛选。",
    inputSchema: issueListSchema,
  }, async ({ projectId, ...options }) => run(() => client.listIssues(projectId, options)));

  server.registerTool("gitlab_get_issue", {
    description: "获取项目中指定 IID 的 Issue。",
    inputSchema: z.object({ projectId: z.string().min(1), issueIid: z.number().int().positive() }),
  }, async ({ projectId, issueIid }) => run(() => client.getIssue(projectId, issueIid)));

  server.registerTool("gitlab_create_issue", {
    description: "在项目中创建 Issue。除非启用只读模式，否则会写入 GitLab。",
    inputSchema: z.object({
      projectId: z.string().min(1),
      title: z.string().min(1),
      description: z.string().optional(),
      labels: z.array(z.string()).optional(),
      assigneeIds: z.array(z.number().int().positive()).optional(),
    }),
  }, async ({ projectId, title, description, labels, assigneeIds }) => run(() => client.createIssue(projectId, {
    title,
    description,
    labels,
    assigneeIds,
  })));

  server.registerTool("gitlab_update_issue", {
    description: "更新项目 Issue 的标题、描述、标签或开启/关闭状态。",
    inputSchema: z.object({
      projectId: z.string().min(1),
      issueIid: z.number().int().positive(),
      title: z.string().min(1).optional(),
      description: z.string().optional(),
      labels: z.array(z.string()).optional(),
      stateEvent: z.enum(["close", "reopen"]).optional(),
    }),
  }, async ({ projectId, issueIid, ...input }) => run(() => client.updateIssue(projectId, issueIid, input)));

  server.registerTool("gitlab_add_issue_note", {
    description: "向项目 Issue 添加评论。",
    inputSchema: z.object({
      projectId: z.string().min(1),
      issueIid: z.number().int().positive(),
      body: z.string().min(1),
    }),
  }, async ({ projectId, issueIid, body }) => run(() => client.addIssueNote(projectId, issueIid, body)));

  const mergeRequestListSchema = z.object({
    projectId: z.string().min(1),
    state: z.enum(["opened", "closed", "locked", "merged", "all"]).optional(),
    scope: z.enum(["created_by_me", "assigned_to_me", "all"]).optional(),
    search: z.string().optional(),
    page: z.number().int().positive().optional(),
    perPage: z.number().int().min(1).max(100).optional(),
  });

  server.registerTool("gitlab_list_merge_requests", {
    description: "列出项目 Merge Request。",
    inputSchema: mergeRequestListSchema,
  }, async ({ projectId, ...options }) => run(() => client.listMergeRequests(projectId, options)));

  server.registerTool("gitlab_get_merge_request", {
    description: "获取项目中指定 IID 的 Merge Request。",
    inputSchema: z.object({ projectId: z.string().min(1), mergeRequestIid: z.number().int().positive() }),
  }, async ({ projectId, mergeRequestIid }) => run(() => client.getMergeRequest(projectId, mergeRequestIid)));

  server.registerTool("gitlab_create_merge_request", {
    description: "创建 Merge Request。",
    inputSchema: z.object({
      projectId: z.string().min(1),
      sourceBranch: z.string().min(1),
      targetBranch: z.string().min(1),
      title: z.string().min(1),
      description: z.string().optional(),
      removeSourceBranch: z.boolean().optional(),
      squash: z.boolean().optional(),
    }),
  }, async ({ projectId, sourceBranch, targetBranch, title, description, removeSourceBranch, squash }) => run(() => client.createMergeRequest(projectId, {
    sourceBranch,
    targetBranch,
    title,
    description,
    removeSourceBranch,
    squash,
  })));

  server.registerTool("gitlab_update_merge_request", {
    description: "更新 Merge Request 的标题、描述、目标分支、状态或合并选项。",
    inputSchema: z.object({
      projectId: z.string().min(1),
      mergeRequestIid: z.number().int().positive(),
      title: z.string().min(1).optional(),
      description: z.string().optional(),
      targetBranch: z.string().min(1).optional(),
      stateEvent: z.enum(["close", "reopen"]).optional(),
      removeSourceBranch: z.boolean().optional(),
      squash: z.boolean().optional(),
    }),
  }, async ({ projectId, mergeRequestIid, ...input }) => run(() => client.updateMergeRequest(projectId, mergeRequestIid, input)));

  server.registerTool("gitlab_add_merge_request_note", {
    description: "向 Merge Request 添加评论。",
    inputSchema: z.object({
      projectId: z.string().min(1),
      mergeRequestIid: z.number().int().positive(),
      body: z.string().min(1),
    }),
  }, async ({ projectId, mergeRequestIid, body }) => run(() => client.addMergeRequestNote(projectId, mergeRequestIid, body)));

  server.registerTool("gitlab_list_branches", {
    description: "列出项目分支。",
    inputSchema: z.object({
      projectId: z.string().min(1),
      search: z.string().optional(),
      page: z.number().int().positive().optional(),
      perPage: z.number().int().min(1).max(100).optional(),
    }),
  }, async ({ projectId, ...options }) => run(() => client.listBranches(projectId, options)));

  server.registerTool("gitlab_get_file", {
    description: "读取项目仓库中的文件元数据和 Base64 内容；需要文本内容时可将 decode 设为 true。",
    inputSchema: z.object({
      projectId: z.string().min(1),
      filePath: z.string().min(1),
      ref: z.string().min(1).default("main"),
      decode: z.boolean().default(false),
    }),
  }, async ({ projectId, filePath, ref, decode }) => run(async () => {
    const file = await client.getFile(projectId, filePath, ref) as { content?: string; encoding?: string };
    if (!decode || file.encoding !== "base64" || !file.content) {
      return file;
    }
    return { ...file, content: Buffer.from(file.content, "base64").toString("utf8"), encoding: "utf8" };
  }));

  server.registerTool("gitlab_commit_file", {
    description: "在项目仓库创建或更新单个文件，并提交到指定分支。",
    inputSchema: z.object({
      projectId: z.string().min(1),
      filePath: z.string().min(1),
      branch: z.string().min(1),
      content: z.string(),
      commitMessage: z.string().min(1),
      operation: z.enum(["create", "update"]),
      previousPath: z.string().min(1).optional(),
    }),
  }, async ({ projectId, ...input }) => run(() => client.commitFile(projectId, input)));

  return server;
}
