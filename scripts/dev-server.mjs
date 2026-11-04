import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import resetStudentPassword from "../api/student-password.js";
import registrationSelfie from "../api/registration-selfie.js";
import studentSelfie from "../api/student-selfie.js";
import cleanupSelfies from "../api/cleanup-selfies.js";
import deleteStudent from "../api/student-delete.js";

const apiRoutes = new Map([["/api/student-password", resetStudentPassword], ["/api/student-delete", deleteStudent], ["/api/registration-selfie", registrationSelfie], ["/api/student-selfie", studentSelfie], ["/api/cleanup-selfies", cleanupSelfies]]);

try { process.loadEnvFile(); } catch (error) { if (error.code !== "ENOENT") throw error; }

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
    const pathname = decodeURIComponent(url.pathname).replace(/\\/g, "/");
    if (apiRoutes.has(pathname)) {
      const chunks = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        const maxBody = pathname === "/api/registration-selfie" ? 300 * 1024 : 4096;
        if (size > maxBody) { send(response, 413, '{"error":"Data terlalu besar."}', "application/json"); return; }
        chunks.push(chunk);
      }
      request.body = Buffer.concat(chunks).toString("utf8");
      await apiRoutes.get(pathname)(request, response);
      return;
    }
    if (pathname.toLowerCase().startsWith("/api/")) { send(response, 404, "Not found"); return; }
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
