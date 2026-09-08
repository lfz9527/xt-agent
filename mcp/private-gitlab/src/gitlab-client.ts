import type { GitLabConfig } from "./config.js";

type QueryValue = string | number | boolean | undefined;

export interface ListOptions {
  page?: number;
  perPage?: number;
}

export interface IssueListOptions extends ListOptions {
  state?: "opened" | "closed" | "all";
  scope?: "created_by_me" | "assigned_to_me" | "all";
  search?: string;
  labels?: string[];
}

export interface MergeRequestListOptions extends ListOptions {
  state?: "opened" | "closed" | "locked" | "merged" | "all";
  scope?: "created_by_me" | "assigned_to_me" | "all";
  search?: string;
}

export interface CreateIssueInput {
  title: string;
  description?: string;
  labels?: string[];
  assigneeIds?: number[];
}

export interface UpdateIssueInput {
  title?: string;
  description?: string;
  labels?: string[];
  stateEvent?: "close" | "reopen";
}

export interface CreateMergeRequestInput {
  sourceBranch: string;
  targetBranch: string;
  title: string;
  description?: string;
  removeSourceBranch?: boolean;
  squash?: boolean;
}

export interface UpdateMergeRequestInput {
  title?: string;
  description?: string;
  targetBranch?: string;
  stateEvent?: "close" | "reopen";
  removeSourceBranch?: boolean;
  squash?: boolean;
}

export interface FileCommitInput {
  filePath: string;
  branch: string;
  content: string;
  commitMessage: string;
  operation: "create" | "update";
  previousPath?: string;
}

export class GitLabApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    message: string,
  ) {
    super("GitLab API 请求失败（HTTP " + status + " " + statusText + "）：" + message);
    this.name = "GitLabApiError";
  }
}

export class GitLabClient {
  constructor(private readonly config: GitLabConfig) {}

  private projectPath(projectId: string): string {
    return "/projects/" + encodeURIComponent(projectId);
  }

  private buildQuery(values: Record<string, QueryValue>): string {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) {
      if (value !== undefined) {
        query.set(key, String(value));
      }
    }
    return query.toString();
  }

  private async request<T>(path: string, init: RequestInit = {}, writable = false): Promise<T> {
    if (writable && this.config.readOnly) {
      throw new Error("当前已启用 GITLAB_READ_ONLY=true，写操作被拒绝");
    }

    const url = new URL(this.config.apiUrl + path);
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    headers.set("PRIVATE-TOKEN", this.config.token);
    if (init.body !== undefined) {
      headers.set("Content-Type", "application/json");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await fetch(url, { ...init, headers, signal: controller.signal });
      const raw = await response.text();
      const payload = raw ? this.parsePayload(raw) : null;
      if (!response.ok) {
        throw new GitLabApiError(response.status, response.statusText, this.describePayload(payload));
      }
      return payload as T;
    } catch (error) {
      if (error instanceof GitLabApiError) {
        throw error;
      }
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error("GitLab API 请求超过 " + this.config.timeoutMs + "ms 未返回");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private parsePayload(raw: string): unknown {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }

  private describePayload(payload: unknown): string {
    if (typeof payload === "string") {
      return payload.slice(0, 1_000);
    }
    if (payload && typeof payload === "object" && "message" in payload) {
      return String(payload.message).slice(0, 1_000);
    }
    return JSON.stringify(payload).slice(0, 1_000);
  }

  private jsonBody(body: unknown): RequestInit {
    return { method: "POST", body: JSON.stringify(body) };
  }

  async getCurrentUser(): Promise<unknown> {
    return this.request("/user");
  }

  async getVersion(): Promise<unknown> {
    return this.request("/version");
  }

  async listProjects(options: ListOptions & { search?: string; membership?: boolean } = {}): Promise<unknown> {
    const query = this.buildQuery({
      page: options.page,
      per_page: options.perPage,
      search: options.search,
      membership: options.membership,
    });
    return this.request("/projects" + (query ? "?" + query : ""));
  }

  async getProject(projectId: string): Promise<unknown> {
    return this.request(this.projectPath(projectId));
  }

  async listIssues(projectId: string, options: IssueListOptions = {}): Promise<unknown> {
    const query = this.buildQuery({
      page: options.page,
      per_page: options.perPage,
      state: options.state,
      scope: options.scope,
      search: options.search,
      labels: options.labels?.join(","),
    });
    return this.request(this.projectPath(projectId) + "/issues" + (query ? "?" + query : ""));
  }

  async getIssue(projectId: string, issueIid: number): Promise<unknown> {
    return this.request(this.projectPath(projectId) + "/issues/" + issueIid);
  }

  async createIssue(projectId: string, input: CreateIssueInput): Promise<unknown> {
    return this.request(this.projectPath(projectId) + "/issues", this.jsonBody({
      title: input.title,
      description: input.description,
      labels: input.labels?.join(","),
      assignee_ids: input.assigneeIds,
    }), true);
  }

  async updateIssue(projectId: string, issueIid: number, input: UpdateIssueInput): Promise<unknown> {
    return this.request(this.projectPath(projectId) + "/issues/" + issueIid, {
      method: "PUT",
      body: JSON.stringify({
        title: input.title,
        description: input.description,
        labels: input.labels?.join(","),
        state_event: input.stateEvent,
      }),
    }, true);
  }

  async addIssueNote(projectId: string, issueIid: number, body: string): Promise<unknown> {
    return this.request(this.projectPath(projectId) + "/issues/" + issueIid + "/notes", this.jsonBody({ body }), true);
  }

  async listMergeRequests(projectId: string, options: MergeRequestListOptions = {}): Promise<unknown> {
    const query = this.buildQuery({
      page: options.page,
      per_page: options.perPage,
      state: options.state,
      scope: options.scope,
      search: options.search,
    });
    return this.request(this.projectPath(projectId) + "/merge_requests" + (query ? "?" + query : ""));
  }

  async getMergeRequest(projectId: string, mergeRequestIid: number): Promise<unknown> {
    return this.request(this.projectPath(projectId) + "/merge_requests/" + mergeRequestIid);
  }

  async createMergeRequest(projectId: string, input: CreateMergeRequestInput): Promise<unknown> {
    return this.request(this.projectPath(projectId) + "/merge_requests", this.jsonBody({
      source_branch: input.sourceBranch,
      target_branch: input.targetBranch,
      title: input.title,
      description: input.description,
      remove_source_branch: input.removeSourceBranch,
      squash: input.squash,
    }), true);
  }

  async updateMergeRequest(projectId: string, mergeRequestIid: number, input: UpdateMergeRequestInput): Promise<unknown> {
    return this.request(this.projectPath(projectId) + "/merge_requests/" + mergeRequestIid, {
      method: "PUT",
      body: JSON.stringify({
        title: input.title,
        description: input.description,
        target_branch: input.targetBranch,
        state_event: input.stateEvent,
        remove_source_branch: input.removeSourceBranch,
        squash: input.squash,
      }),
    }, true);
  }

  async addMergeRequestNote(projectId: string, mergeRequestIid: number, body: string): Promise<unknown> {
    return this.request(this.projectPath(projectId) + "/merge_requests/" + mergeRequestIid + "/notes", this.jsonBody({ body }), true);
  }

  async listBranches(projectId: string, options: ListOptions & { search?: string } = {}): Promise<unknown> {
    const query = this.buildQuery({
      page: options.page,
      per_page: options.perPage,
      search: options.search,
    });
    return this.request(this.projectPath(projectId) + "/repository/branches" + (query ? "?" + query : ""));
  }

  async getFile(projectId: string, filePath: string, ref: string): Promise<unknown> {
    return this.request(
      this.projectPath(projectId) + "/repository/files/" + encodeURIComponent(filePath) + "?ref=" + encodeURIComponent(ref),
    );
  }

  async commitFile(projectId: string, input: FileCommitInput): Promise<unknown> {
    const endpoint = this.projectPath(projectId) + "/repository/files/" + encodeURIComponent(input.filePath);
    const body = {
      branch: input.branch,
      content: input.content,
      commit_message: input.commitMessage,
      ...(input.previousPath ? { previous_path: input.previousPath } : {}),
    };
    return this.request(endpoint, {
      method: input.operation === "create" ? "POST" : "PUT",
      body: JSON.stringify(body),
    }, true);
  }
}
