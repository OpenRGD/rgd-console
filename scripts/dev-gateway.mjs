/** Dependency-free same-origin reverse proxy for local development only.
 * Never publish on a non-loopback interface. Physical actuation is absent.
 */
import { createServer, request } from 'node:http';
import { connect } from 'node:net';
import { pathToFileURL } from 'node:url';

export function createGateway({ apiPort = 8080, webPort = 3000 } = {}) {
  const destination = url => (url?.startsWith('/api/') || url?.startsWith('/healthz')) ? apiPort : webPort;
  const server = createServer((req, res) => {
    const upstream = request({
      hostname: '127.0.0.1', port: destination(req.url), path: req.url,
      method: req.method, headers: req.headers,
    }, proxyResponse => {
      res.writeHead(proxyResponse.statusCode ?? 502, proxyResponse.headers);
      proxyResponse.pipe(res);
    });
    upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end('Local service unavailable'); });
    req.pipe(upstream);
  });
  server.on('upgrade', (req, socket, head) => {
    const upstream = connect({ host: '127.0.0.1', port: destination(req.url) });
    upstream.on('connect', () => {
      const lines = Object.entries(req.headers).map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`).join('\r\n');
      upstream.write(`${req.method} ${req.url} HTTP/1.1\r\n${lines}\r\n\r\n`);
      if (head.length) upstream.write(head);
      socket.pipe(upstream).pipe(socket);
    });
    upstream.on('error', () => socket.destroy());
    socket.on('error', () => upstream.destroy());
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createGateway().listen(8088, '127.0.0.1', () => console.log('OpenRGD Console DEV gateway: http://127.0.0.1:8088'));
}
