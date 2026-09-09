import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, isAbsolute, join, normalize, relative, resolve } from "node:path";

const host = "127.0.0.1";
const port = Number(process.env.LEGACY_PORT ?? 4173);
const root = resolve("legacy");

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const server = createServer((request, response) => {
  const requestPath = decodeURIComponent(
    new URL(request.url ?? "/", `http://${host}`).pathname,
  );
  const relativePath = requestPath === "/" ? "index.html" : requestPath.slice(1);
  const candidate = normalize(join(root, relativePath));
  const fromRoot = relative(root, candidate);

  if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  try {
    if (!statSync(candidate).isFile()) throw new Error("Not a file");
  } catch {
    response.writeHead(404).end("Not found");
    return;
  }

  response.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Type": mimeTypes[extname(candidate)] ?? "application/octet-stream",
  });
  createReadStream(candidate).pipe(response);
});

server.listen(port, host, () => {
  console.log(`Legacy reference app: http://${host}:${port}`);
});
