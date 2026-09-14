import { createServer } from "node:http";
import { readFile } from "node:fs";
import { extname, resolve, sep } from "node:path";

const root = process.cwd();
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

createServer((request, response) => {
  const pathname = request.url.split("?")[0];
  const relative = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
  const file = resolve(root, relative);

  if (!file.startsWith(`${root}${sep}`)) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  readFile(file, (error, contents) => {
    if (error) {
      response.writeHead(404).end("Not found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": types[extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(contents);
  });
}).listen(8765, "127.0.0.1", () => {
  console.log("Servidor listo en http://127.0.0.1:8765");
});
