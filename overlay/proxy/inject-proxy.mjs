// Browser-injection proxy: forwards every request to an upstream site unchanged, and injects the
// Secure Flow overlay <script> into HTML documents. Used to validate the overlay on a designated
// domain before the site embeds the script itself.
//
//   node overlay/proxy/inject-proxy.mjs --upstream https://portal.example.com \
//        --script http://localhost:3000/overlay/secure-flow-overlay.js \
//        --config http://localhost:3000/overlay/mock-payload.json [--port 5056]
//
// Then open http://localhost:5056/ in a browser. The upstream's Content-Security-Policy is left
// untouched: if it blocks the script origin, the browser console says so, which is the same
// result the real embed would have.

import http from 'node:http';
import https from 'node:https';
import { pathToFileURL } from 'node:url';

const MAX_HTML_BYTES = 10 * 1024 * 1024;
const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade']);

const escapeAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export function injectTag(html, tag) {
  for (const marker of [/<\/head\s*>/i, /<\/body\s*>/i]) {
    const m = marker.exec(html);
    if (m) return html.slice(0, m.index) + tag + html.slice(m.index);
  }
  return html + tag;
}

export function createInjectionProxy({ upstream, script, config, log = () => {} }) {
  const target = new URL(upstream);
  const client = target.protocol === 'https:' ? https : http;
  const tag = `<script src="${escapeAttr(script)}"${config ? ` data-config-url="${escapeAttr(config)}"` : ''} defer data-injected-by="secure-flow-proxy"></script>`;

  return http.createServer((req, res) => {
    const headers = { ...req.headers, host: target.host, 'accept-encoding': 'identity' };
    for (const h of HOP_BY_HOP) delete headers[h];
    const upstreamReq = client.request(
      { protocol: target.protocol, hostname: target.hostname, port: target.port, method: req.method, path: req.url, headers },
      (up) => {
        const outHeaders = { ...up.headers };
        for (const h of HOP_BY_HOP) delete outHeaders[h];
        if (outHeaders.location) {
          // Keep redirects inside the proxy.
          const loc = new URL(outHeaders.location, target);
          if (loc.host === target.host) outHeaders.location = loc.pathname + loc.search + loc.hash;
        }
        const isHtml = /^text\/html\b/i.test(up.headers['content-type'] || '') && req.method !== 'HEAD';
        if (!isHtml || up.headers['content-encoding']) {
          res.writeHead(up.statusCode || 502, outHeaders);
          up.pipe(res);
          return;
        }
        const chunks = [];
        let size = 0;
        up.on('data', (c) => {
          size += c.length;
          if (size > MAX_HTML_BYTES) {
            up.destroy();
            res.writeHead(502).end('Upstream document too large to inject');
            return;
          }
          chunks.push(c);
        });
        up.on('end', () => {
          if (res.headersSent) return;
          const html = injectTag(Buffer.concat(chunks).toString('utf8'), tag);
          const body = Buffer.from(html, 'utf8');
          outHeaders['content-length'] = String(body.length);
          outHeaders['x-secure-flow-injected'] = '1';
          if (up.headers['content-security-policy']) log(`note: ${req.url} sends a Content-Security-Policy; the script origin must be allowed by it`);
          res.writeHead(up.statusCode || 200, outHeaders);
          res.end(body);
          log(`injected ${req.method} ${req.url}`);
        });
      }
    );
    upstreamReq.on('error', (err) => {
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' });
      res.end(`Upstream error: ${err.message}`);
    });
    req.pipe(upstreamReq);
  });
}

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) out[argv[i].replace(/^--/, '')] = argv[i + 1];
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = args(process.argv.slice(2));
  if (!a.upstream || !a.script) {
    console.error('usage: inject-proxy.mjs --upstream <url> --script <overlay.js url> [--config <config url>] [--port 5056] [--host 127.0.0.1]');
    process.exit(2);
  }
  const port = Number(a.port || 5056);
  const host = a.host || '127.0.0.1';
  createInjectionProxy({ upstream: a.upstream, script: a.script, config: a.config, log: console.log }).listen(port, host, () => {
    console.log(`Injection proxy: http://localhost:${port}/  ->  ${a.upstream}`);
  });
}
