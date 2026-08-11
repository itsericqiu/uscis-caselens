// Minimal Chrome DevTools Protocol client over a raw WebSocket.
//
// Exists so the screenshot script has zero npm dependencies, in keeping with
// the rest of the repo. Implements just enough of RFC 6455 to talk to a local
// headless Chrome: text frames, client masking, and continuation-free reads.

var http = require('http');
var net = require('net');
var crypto = require('crypto');

function httpGet(port, path) {
  return httpRequest(port, path, 'GET');
}

function httpRequest(port, path, method) {
  return new Promise(function (resolve, reject) {
    var req = http.request({ host: '127.0.0.1', port: port, path: path, method: method }, function (res) {
      var body = '';
      res.on('data', function (c) { body += c; });
      res.on('end', function () { resolve(body); });
    });
    req.on('error', reject);
    req.end();
  });
}

function connect(port) {
  // Chrome's /json/new endpoint used to tolerate GET (with a deprecation
  // warning in the response body instead of JSON); current versions
  // enforce PUT-only and return plain text for a GET, which broke JSON
  // parsing here.
  return httpRequest(port, '/json/new?about:blank', 'PUT').then(function (body) {
    var target = JSON.parse(body);
    return open(port, target.webSocketDebuggerUrl, target.id);
  });
}

function open(port, wsUrl, targetId) {
  return new Promise(function (resolve, reject) {
    var m = /ws:\/\/([^:/]+):(\d+)(\/.*)$/.exec(wsUrl);
    if (!m) return reject(new Error('bad ws url: ' + wsUrl));
    var key = crypto.randomBytes(16).toString('base64');
    var sock = net.connect(parseInt(m[2], 10), m[1], function () {
      sock.write(
        'GET ' + m[3] + ' HTTP/1.1\r\n' +
        'Host: ' + m[1] + ':' + m[2] + '\r\n' +
        'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
        'Sec-WebSocket-Key: ' + key + '\r\nSec-WebSocket-Version: 13\r\n\r\n'
      );
    });

    var buf = Buffer.alloc(0);
    var handshakeDone = false;
    var nextId = 1;
    var pending = {};

    var client = {
      send: function (method, params) {
        var id = nextId++;
        var payload = JSON.stringify({ id: id, method: method, params: params || {} });
        writeFrame(sock, payload);
        return new Promise(function (res, rej) { pending[id] = { res: res, rej: rej }; });
      },
      eval: function (expression) {
        return client.send('Runtime.evaluate', {
          expression: expression, returnByValue: true, awaitPromise: true
        }).then(function (r) {
          return r && r.result ? r.result.value : null;
        });
      },
      close: function () {
        return httpGet(port, '/json/close/' + targetId).catch(function () {}).then(function () {
          try { sock.destroy(); } catch (e) {}
        });
      }
    };

    sock.on('data', function (chunk) {
      buf = Buffer.concat([buf, chunk]);
      if (!handshakeDone) {
        var idx = buf.indexOf('\r\n\r\n');
        if (idx === -1) return;
        handshakeDone = true;
        buf = buf.slice(idx + 4);
        resolve(client);
      }
      var frame;
      while ((frame = readFrame(buf)) !== null) {
        buf = buf.slice(frame.consumed);
        if (frame.payload === null) continue;
        var msg;
        try { msg = JSON.parse(frame.payload); } catch (e) { continue; }
        if (msg.id && pending[msg.id]) {
          var p = pending[msg.id];
          delete pending[msg.id];
          if (msg.error) p.rej(new Error(msg.error.message || 'CDP error'));
          else p.res(msg.result);
        }
      }
    });

    sock.on('error', reject);
  });
}

function writeFrame(sock, text) {
  var payload = Buffer.from(text, 'utf8');
  var len = payload.length;
  var header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[1] = 0x80 | len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[1] = 0x80 | 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 0x80 | 127;
    header.writeUInt32BE(0, 2);
    header.writeUInt32BE(len, 6);
  }
  header[0] = 0x81; // FIN + text
  var mask = crypto.randomBytes(4);
  var masked = Buffer.alloc(len);
  for (var i = 0; i < len; i++) masked[i] = payload[i] ^ mask[i % 4];
  sock.write(Buffer.concat([header, mask, masked]));
}

function readFrame(buf) {
  if (buf.length < 2) return null;
  var len = buf[1] & 0x7f;
  var offset = 2;
  if (len === 126) {
    if (buf.length < 4) return null;
    len = buf.readUInt16BE(2);
    offset = 4;
  } else if (len === 127) {
    if (buf.length < 10) return null;
    len = buf.readUInt32BE(6);
    offset = 10;
  }
  if (buf.length < offset + len) return null;
  var opcode = buf[0] & 0x0f;
  var payload = buf.slice(offset, offset + len).toString('utf8');
  return { consumed: offset + len, payload: opcode === 1 ? payload : null };
}

module.exports = { connect: connect };
