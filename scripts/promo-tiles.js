// Chrome Web Store promotional tiles.
//
//   node scripts/promo-tiles.js
//
// Chrome asks for a 440x280 small tile (listed under required assets) and an
// optional 1400x560 marquee, used only if the listing is considered for the
// homepage carousel. Both are rendered here rather than hand-encoded, so the
// lens mark and the wordmark stay identical to the icons and the panel.
//
// Nothing in these tiles may carry federal insignia — no seal, no agency
// wordmark, no government banner — for the same reason test/backdrop.html
// omits them: the listing beside these images states that CaseLens is
// unaffiliated with USCIS. See docs/PUBLISHING.md.
//
// Writes to docs/store/.

var fs = require('fs');
var path = require('path');
var os = require('os');
var { spawn } = require('child_process');
var CDP = require(path.join(__dirname, 'cdp-lite.js'));

var ROOT = path.join(__dirname, '..');
var OUT = path.join(ROOT, 'docs', 'store');
var PORT = 9540;

var CHROME = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome'
].filter(function (p) { return fs.existsSync(p); })[0];

// The ink teal is the panel's own accent, and is conspicuously not the navy
// the agency uses — which is doing quiet work on a listing that has to read as
// third-party at a glance.
var TEAL = '#1F5D5B';
var TEAL_DEEP = '#123B3A';

// Ring proportions taken from scripts/make-icons.js so the tile mark and the
// installed icon are the same drawing at different sizes.
function mark(size) {
  return '<div style="' +
    'width:' + size + 'px;height:' + size + 'px;border-radius:50%;' +
    'border:' + (size * 0.22).toFixed(1) + 'px solid #fff;' +
    'box-sizing:border-box;position:relative;flex:none">' +
    '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);' +
    'width:' + (size * 0.30).toFixed(1) + 'px;height:' + (size * 0.30).toFixed(1) + 'px;' +
    'border-radius:50%;background:#fff"></div></div>';
}

function page(body, w, h) {
  return '<!DOCTYPE html><meta charset="utf-8"><style>' +
    '*{box-sizing:border-box;margin:0;padding:0}' +
    'html,body{width:' + w + 'px;height:' + h + 'px;overflow:hidden}' +
    'body{background:linear-gradient(135deg,' + TEAL + ' 0%,' + TEAL_DEEP + ' 100%);' +
    'color:#fff;font-family:-apple-system,"Helvetica Neue",Helvetica,Arial,sans-serif;' +
    '-webkit-font-smoothing:antialiased}' +
    '.name{font-weight:700;letter-spacing:-.02em;line-height:1}' +
    '.tag{opacity:.82;line-height:1.35}' +
    '</style>' + body;
}

var TILES = [
  {
    name: 'promo-small-440x280',
    w: 440, h: 280,
    html: function (w, h) {
      return page(
        '<div style="height:100%;display:flex;flex-direction:column;' +
        'align-items:center;justify-content:center;gap:20px;padding:34px;text-align:center">' +
        mark(72) +
        '<div>' +
        '<div class="name" style="font-size:44px">CaseLens</div>' +
        '<div class="tag" style="font-size:16px;margin-top:10px">' +
        'Unofficial USCIS case tracker</div>' +
        '</div></div>', w, h);
    }
  },
  {
    name: 'promo-marquee-1400x560',
    w: 1400, h: 560,
    html: function (w, h) {
      return page(
        // Centred lockup: a left-anchored one left the right third of a very
        // wide canvas empty, which reads as a cropping mistake rather than as
        // composition.
        '<div style="height:100%;display:flex;align-items:center;justify-content:center;' +
        'gap:64px;padding:0 80px">' +
        mark(172) +
        '<div style="min-width:0">' +
        '<div class="name" style="font-size:100px">CaseLens</div>' +
        '<div class="tag" style="font-size:34px;margin-top:20px;max-width:34ch">' +
        'Every case on your USCIS account in one place. Nothing leaves your browser.</div>' +
        '</div></div>', w, h);
    }
  }
];

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

async function main() {
  if (!CHROME) { console.error('Chrome not found.'); process.exit(1); }
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

  var userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'caselens-promo-'));
  var chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + userDir, '--hide-scrollbars',
    '--force-device-scale-factor=1', 'about:blank'
  ], { stdio: 'ignore' });

  process.on('exit', function () {
    try { chrome.kill(); } catch (e) {}
    try { fs.rmSync(userDir, { recursive: true, force: true }); } catch (e) {}
  });

  await sleep(3000);

  for (var i = 0; i < TILES.length; i++) {
    var t = TILES[i];
    var client = await CDP.connect(PORT);
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: t.w, height: t.h, deviceScaleFactor: 1, mobile: false
    });
    await client.send('Page.navigate', {
      url: 'data:text/html;charset=utf-8,' + encodeURIComponent(t.html(t.w, t.h))
    });
    await sleep(1200);

    var res = await client.send('Page.captureScreenshot', { format: 'png' });
    var file = path.join(OUT, t.name + '.png');
    fs.writeFileSync(file, Buffer.from(res.data, 'base64'));
    console.log('wrote', path.relative(ROOT, file), '(' + t.w + 'x' + t.h + ')');
    await client.close();
  }
}

main().then(function () { process.exit(0); })
  .catch(function (e) { console.error(e && e.message); process.exit(1); });
