import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createServer } from "./server.js";

serveStdio(createServer);
console.error("private-gitlab MCP server running on stdio");
