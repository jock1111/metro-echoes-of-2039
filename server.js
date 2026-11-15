// Zero-dependency static server for METRO: ECHOES OF 2039
// Usage: node server.js [port]   (default 8039)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fs.realpathSync(path.dirname(fileURLToPath(import.meta.url)));
const port = process.argv[2] === undefined ? 8039 : Number(process.argv[2]);

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function respond(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' });
  res.end(body);
}

http.createServer((req, res) => {
  let pathname;
  try {
    pathname = new URL(req.url, 'http://localhost').pathname;
    pathname = decodeURIComponent(pathname);
  } catch {
    respond(res, 400, 'bad request');
    return;
  }

  if (pathname.includes('\\') || pathname.includes('\0')) {
    respond(res, 400, 'bad request');
    return;
  }

  const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = path.resolve(root, requested);
  const relative = path.relative(root, file);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    respond(res, 403, 'forbidden');
    return;
  }

  fs.realpath(file, (resolveError, realFile) => {
    if (resolveError) { respond(res, 404, 'not found'); return; }
    const realRelative = path.relative(root, realFile);
    if (realRelative === '..' || realRelative.startsWith(`..${path.sep}`) || path.isAbsolute(realRelative)) {
      respond(res, 403, 'forbidden');
      return;
    }

    fs.readFile(realFile, (readError, data) => {
      if (readError) { respond(res, 404, 'not found'); return; }
      res.writeHead(200, {
        'Content-Type': mime[path.extname(realFile).toLowerCase()] || 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(data);
    });
  });
}).listen(port, () => {
  console.log(`METRO: ECHOES OF 2039 running at http://localhost:${port}`);
});
