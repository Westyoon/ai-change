import { createReadStream } from "node:fs";
import { lstat, realpath } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const root = path.resolve(fileURLToPath(new URL("../", import.meta.url)));

const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".m4a", "audio/mp4"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".mp3", "audio/mpeg"],
  [".mp4", "video/mp4"],
  [".ogg", "audio/ogg"],
  [".otf", "font/otf"],
  [".png", "image/png"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".ttf", "font/ttf"],
  [".wav", "audio/wav"],
  [".webm", "video/webm"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"]
]);

function isInsideRoot(candidate, rootDirectory) {
  const relative = path.relative(rootDirectory, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function sendText(response, statusCode, message, method = "GET") {
  const body = `${message}\n`;
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
    "Content-Type": "text/plain; charset=utf-8",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(method === "HEAD" ? undefined : body);
}

export function resolveRequestPath(requestUrl, rootDirectory = root) {
  const rawPath = String(requestUrl ?? "/").split(/[?#]/u, 1)[0];
  let decodedPath;

  try {
    decodedPath = decodeURIComponent(rawPath);
  } catch {
    return { error: 400, message: "Bad Request" };
  }

  if (decodedPath.includes("\0") || decodedPath.includes("\\")) {
    return { error: 403, message: "Forbidden" };
  }

  const segments = decodedPath.split("/").filter(Boolean);
  if (segments.some((segment) => segment === "." || segment === ".." || segment.startsWith("."))) {
    return { error: 403, message: "Forbidden" };
  }

  const absoluteRoot = path.resolve(rootDirectory);
  const candidate = path.resolve(absoluteRoot, ...segments);
  if (!isInsideRoot(candidate, absoluteRoot)) {
    return { error: 403, message: "Forbidden" };
  }

  return { candidate, absoluteRoot };
}

async function serveFile(request, response, rootDirectory) {
  const method = request.method ?? "GET";
  if (method !== "GET" && method !== "HEAD") {
    response.setHeader("Allow", "GET, HEAD");
    sendText(response, 405, "Method Not Allowed", method);
    return;
  }

  const resolved = resolveRequestPath(request.url, rootDirectory);
  if (resolved.error) {
    sendText(response, resolved.error, resolved.message, method);
    return;
  }

  let candidate = resolved.candidate;

  try {
    let fileStats = await lstat(candidate);
    if (fileStats.isSymbolicLink()) {
      candidate = await realpath(candidate);
      if (!isInsideRoot(candidate, await realpath(resolved.absoluteRoot))) {
        sendText(response, 403, "Forbidden", method);
        return;
      }
      fileStats = await lstat(candidate);
    }

    if (fileStats.isDirectory()) {
      candidate = path.join(candidate, "index.html");
      fileStats = await lstat(candidate);
    }

    const realRoot = await realpath(resolved.absoluteRoot);
    const realCandidate = await realpath(candidate);
    if (!isInsideRoot(realCandidate, realRoot)) {
      sendText(response, 403, "Forbidden", method);
      return;
    }
    candidate = realCandidate;
    fileStats = await lstat(candidate);

    if (!fileStats.isFile()) {
      sendText(response, 404, "Not Found", method);
      return;
    }

    const contentType = MIME_TYPES.get(path.extname(candidate).toLowerCase()) ?? "application/octet-stream";
    response.writeHead(200, {
      "Cache-Control": "no-cache",
      "Content-Length": fileStats.size,
      "Content-Type": contentType,
      "X-Content-Type-Options": "nosniff"
    });

    if (method === "HEAD") {
      response.end();
      return;
    }

    const stream = createReadStream(candidate);
    stream.on("error", () => {
      if (!response.headersSent) {
        sendText(response, 500, "Internal Server Error", method);
      } else {
        response.destroy();
      }
    });
    stream.pipe(response);
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") {
      sendText(response, 404, "Not Found", method);
      return;
    }

    sendText(response, 500, "Internal Server Error", method);
  }
}

export function createStaticServer({ rootDirectory = root } = {}) {
  const absoluteRoot = path.resolve(rootDirectory);
  return createServer((request, response) => {
    void serveFile(request, response, absoluteRoot);
  });
}

function parsePort(value) {
  const port = Number(value ?? 4173);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new TypeError(`PORT must be an integer between 1 and 65535; received ${value}`);
  }
  return port;
}

function isDirectExecution() {
  return Boolean(process.argv[1]) && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
}

if (isDirectExecution()) {
  const host = process.env.HOST || "127.0.0.1";
  const port = parsePort(process.env.PORT);
  const server = createStaticServer();

  server.listen(port, host, () => {
    console.log(`ai-change dev server: http://${host}:${port}`);
  });

  const close = () => {
    server.close(() => process.exit(0));
  };

  process.once("SIGINT", close);
  process.once("SIGTERM", close);
}
