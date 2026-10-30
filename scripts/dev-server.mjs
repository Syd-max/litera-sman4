import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const args = process.argv.slice(2);

function option(name, fallback) {
  const exactIndex = args.indexOf(name);
  if (exactIndex >= 0 && args[exactIndex + 1]) return args[exactIndex + 1];
  const inline = args.find((argument) => argument.startsWith(`${name}=`));
  return inline ? inline.slice(name.length + 1) : fallback;
}

const port = Number(option("--port", process.env.PORT || "4173"));
const host = option("--host", process.env.HOST || "127.0.0.1");

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("Port harus berupa angka antara 1 dan 65535.");
}

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"]
]);

function send(response, status, body, contentType = "text/plain; charset=utf-8") {
  response.writeHead(status, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(body);
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    const pathname = decodeURIComponent(url.pathname);
    if (pathname.split("/").some((segment) => segment.startsWith("."))) {
      send(response, 403, "Forbidden");
      return;
    }
    const requestedPath = pathname === "/" ? "/index.html" : pathname;
    let target = path.resolve(root, `.${requestedPath}`);

    if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
      send(response, 403, "Forbidden");
      return;
    }

    const info = await stat(target);
    if (info.isDirectory()) target = path.join(target, "index.html");

    const body = await readFile(target);
    const contentType = contentTypes.get(path.extname(target).toLowerCase()) || "application/octet-stream";
    send(response, 200, body, contentType);
  } catch (error) {
    const status = error?.code === "ENOENT" ? 404 : 500;
    send(response, status, status === 404 ? "404: File tidak ditemukan" : "500: Server error");
  }
});

server.listen(port, host, () => {
  const displayHost = host === "0.0.0.0" ? "localhost" : host;
  console.log(`LITERA berjalan di http://${displayHost}:${port}`);
  console.log("Tekan Ctrl+C untuk menghentikan server.");
});

process.on("SIGINT", () => server.close(() => process.exit(0)));
