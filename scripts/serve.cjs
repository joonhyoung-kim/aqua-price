const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const routes = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
};
http.createServer((req, res) => {
  const route = routes[new URL(req.url, 'http://localhost').pathname];
  if (!route) { res.writeHead(404); res.end('Not found'); return; }
  fs.readFile(path.join(__dirname, '..', 'dist', route[0]), (error, content) => {
    if (error) { res.writeHead(500); res.end('Unable to read file'); return; }
    res.writeHead(200, { 'Content-Type': route[1] });
    res.end(content);
  });
}).listen(8080, '127.0.0.1', () => console.log('아쿠아픽: http://127.0.0.1:8080'));
