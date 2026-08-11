// Store-listing screenshots, at the sizes Chrome Web Store requires.
//
//   node scripts/store-screenshots.js      (expects a server on :8899)
//
// Chrome accepts 1280x800 or 640x400 and wants at least one; Firefox accepts
// the same files. These are shot against the fixture harness, so every case
// number and name in them is invented — never a real account.
//
// Writes to docs/store/.

var fs = require('fs');
var path = require('path');
var os = require('os');
var { spawn } = require('child_process');
var CDP = require(path.join(__dirname, 'cdp-lite.js'));

var ROOT = path.join(__dirname, '..');
var OUT = path.join(ROOT, 'docs', 'store');
var BASE = 'http://localhost:8899/test/harness.html';
var PORT = 9530;
var W = 1280, H = 800;

var CHROME = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome'
].filter(function (p) { return fs.existsSync(p); })[0];

// Each shot sets up a state, then we capture the whole 1280x800 viewport with
// the panel positioned so it reads as a product screenshot rather than a crop.
var SHOTS = [
  {
    name: '01-overview',
    caption: 'All cases in one place',
    dark: false,
    setup: "(function(){var p=JSON.parse(localStorage.getItem('uscisTracker.prefs.v1')||'{}');p.collapsed=false;p.dark=false;localStorage.setItem('uscisTracker.prefs.v1',JSON.stringify(p));})()"
  },
  {
    name: '02-record-updated',
    caption: 'Shows activity the website does not',
    dark: false,
    scroll: 320
  },
  {
    name: '03-timeline',
    caption: 'A merged timeline with sources named',
    dark: false,
    scroll: 900
  },
  {
    name: '04-dark',
    caption: 'Dark mode',
    dark: true
  }
];

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

async function main() {
  if (!CHROME) { console.error('Chrome not found.'); process.exit(1); }
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

  var userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'caselens-store-'));
  var chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + userDir, '--hide-scrollbars',
    '--force-device-scale-factor=1', '--window-size=' + W + ',' + H, 'about:blank'
  ], { stdio: 'ignore' });

  process.on('exit', function () {
    try { chrome.kill(); } catch (e) {}
    try { fs.rmSync(userDir, { recursive: true, force: true }); } catch (e) {}
  });

  await sleep(2500);

  for (var i = 0; i < SHOTS.length; i++) {
    var shot = SHOTS[i];
    var client = await CDP.connect(PORT);
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: W, height: H, deviceScaleFactor: 1, mobile: false
    });

    await client.send('Page.navigate', { url: BASE + '?scenario=normal' });
    await sleep(30000);   // four cases load sequentially by design

    // Open the panel, apply the shot's state, hide the harness chrome.
    await client.eval("(function(){var p=document.querySelector('.uscistr-pill'); if (p) p.click();})()");
    await sleep(1500);
    if (shot.setup) { await client.eval(shot.setup); }
    if (shot.dark) {
      await client.eval("(function(){var p=JSON.parse(localStorage.getItem('uscisTracker.prefs.v1')||'{}');p.dark=true;localStorage.setItem('uscisTracker.prefs.v1',JSON.stringify(p));var r=document.querySelector('.uscistr-root'); if(r)r.classList.add('uscistr-dark');})()");
      await sleep(600);
    }
    // Replace the harness strip with a neutral backdrop so the shot reads as
    // the product, not as a test page.
    // Hide the test scaffolding but KEEP the mock account page behind the
    // panel. A panel floating on an empty canvas doesn't show what the product
    // is; sitting over a case list does.
    await client.eval(
      "(function(){" +
      "var strip=document.getElementById('harness-strip'); if(strip) strip.style.display='none';" +
      "var log=document.getElementById('harness-log'); if(log) log.style.display='none';" +
      "var lab=document.getElementById('harness-log-label'); if(lab) lab.style.display='none';" +
      "var body=document.getElementById('harness-body'); if(body) body.style.padding='40px 32px';" +
      "var acct=document.getElementById('harness-mock-account');" +
      "if(acct){acct.style.maxWidth='620px';acct.style.boxShadow='0 1px 3px rgba(0,0,0,.06)';}" +
      "document.documentElement.style.background=" + (shot.dark ? "'#1b1b20'" : "'#f4f5f7'") + ";" +
      "document.body.style.background=" + (shot.dark ? "'#1b1b20'" : "'#f4f5f7'") + ";" +
      (shot.dark ? "if(acct){acct.style.background='#26262d';acct.style.borderColor='#33333c';acct.style.color='#d6d6db';}" : "") +
      "})()");
    if (shot.scroll) {
      await client.eval("(function(){var b=document.querySelector('.uscistr-body'); if(b) b.scrollTop=" + shot.scroll + ";})()");
      await sleep(500);
    }
    await sleep(700);

    var res = await client.send('Page.captureScreenshot', { format: 'png' });
    var file = path.join(OUT, shot.name + '.png');
    fs.writeFileSync(file, Buffer.from(res.data, 'base64'));
    console.log('wrote', path.relative(ROOT, file), '(' + W + 'x' + H + ')  —', shot.caption);
    await client.close();
  }
}

main().then(function () { process.exit(0); })
  .catch(function (e) { console.error(e && e.message); process.exit(1); });
