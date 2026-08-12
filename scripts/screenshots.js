// Capture documentation screenshots from the local test harness.
//
// Uses only fixture data (invented case numbers), never a real account, so the
// images are safe to publish. Drives headless Chrome over the DevTools
// protocol — no dependencies beyond Node and an installed Chrome.
//
//   node scripts/screenshots.js            (expects a server on :8899)
//
// Writes PNGs to docs/screenshots/.

var http = require('http');
var fs = require('fs');
var path = require('path');
var os = require('os');
var { spawn, execSync } = require('child_process');

var ROOT = path.join(__dirname, '..');
var OUT = path.join(ROOT, 'docs', 'screenshots');
var BASE = 'http://localhost:8899/test/harness.html';
var PORT = 9222;

var CHROME = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome'
].filter(function (p) { return fs.existsSync(p); })[0];

if (!CHROME) {
  console.error('Chrome not found.');
  process.exit(1);
}
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

// Each shot: the scenario to load, and how to prepare the page before capture.
// `intro: true` leaves the first-run note in place. Everywhere else it is
// dismissed, because it is ~40% of the panel and a hero image showing the
// explanation rather than the product is not showing the product.
var SHOTS = [
  { name: 'panel-light', scenario: 'normal', dark: false, expand: true },
  { name: 'panel-dark', scenario: 'normal', dark: true, expand: true },
  { name: 'panel-changed', scenario: 'changed', dark: false, expand: true, refresh: true },
  { name: 'panel-first-run', scenario: 'normal', dark: false, expand: true, intro: true },
  { name: 'launcher-pill', scenario: 'normal', dark: false, expand: false }
];

function get(url) {
  return new Promise(function (resolve, reject) {
    http.get(url, function (res) {
      var body = '';
      res.on('data', function (c) { body += c; });
      res.on('end', function () { resolve(body); });
    }).on('error', reject);
  });
}

function sleep(ms) {
  return new Promise(function (r) { setTimeout(r, ms); });
}

function main() {
  var userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'caselens-shots-'));
  var chrome = spawn(CHROME, [
    '--headless=new',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + userDir,
    '--hide-scrollbars',
    '--force-device-scale-factor=2',
    '--window-size=1200,1400',
    'about:blank'
  ], { stdio: 'ignore' });

  var WebSocket = null;
  try { WebSocket = require('ws'); } catch (e) { /* fall back to CDP over HTTP+raw */ }

  process.on('exit', function () {
    try { chrome.kill(); } catch (e) {}
    try { fs.rmSync(userDir, { recursive: true, force: true }); } catch (e) {}
  });

  run(chrome).then(function () {
    console.log('done');
    process.exit(0);
  }).catch(function (err) {
    console.error(err && err.message ? err.message : err);
    process.exit(1);
  });
}

async function run() {
  // Wait for the debugging endpoint.
  for (var i = 0; i < 40; i++) {
    try { await get('http://localhost:' + PORT + '/json/version'); break; } catch (e) { await sleep(250); }
  }

  var CDP = require(path.join(__dirname, 'cdp-lite.js'));

  for (var s = 0; s < SHOTS.length; s++) {
    var shot = SHOTS[s];
    var client = await CDP.connect(PORT);
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1200, height: 1400, deviceScaleFactor: 2, mobile: false
    });

    await client.send('Page.navigate', { url: BASE + '?scenario=' + shot.scenario });
    await sleep(2000);
    // The panel fetches every case sequentially with a deliberate pause.
    await sleep(22000);

    if (shot.refresh) {
      await client.eval("(function(){var b=Array.prototype.slice.call(document.querySelectorAll('button')).filter(function(x){return /refresh all/i.test(x.textContent||'')})[0]; if(b) b.click(); return !!b;})()");
      await sleep(24000);
    }

    await client.eval(prepScript(shot));
    await sleep(900);

    var clip = await client.eval("(function(){var el=document.querySelector('" + (shot.expand ? '.uscistr-panel' : '.uscistr-pill') + "')||document.querySelector('[class*=uscistr-panel],[class*=uscistr-pill]'); if(!el) return null; var r=el.getBoundingClientRect(); return JSON.stringify({x:Math.max(0,r.left-24),y:Math.max(0,r.top-24),width:r.width+48,height:r.height+48});})()");

    var params = { format: 'png', captureBeyondViewport: true };
    if (clip) {
      var c = JSON.parse(clip);
      params.clip = { x: c.x, y: c.y, width: c.width, height: c.height, scale: 2 };
    }
    var res = await client.send('Page.captureScreenshot', params);
    var file = path.join(OUT, shot.name + '.png');
    fs.writeFileSync(file, Buffer.from(res.data, 'base64'));
    console.log('wrote', path.relative(ROOT, file), fs.statSync(file).size, 'bytes');
    await client.close();
  }
}

// Hide the harness's own chrome so only the panel is in frame, and set the
// theme / expanded state for this shot.
function prepScript(shot) {
  return "(function(){" +
    "var prefs={};try{prefs=JSON.parse(localStorage.getItem('uscisTracker.prefs.v1'))||{}}catch(e){}" +
    "prefs.dark=" + (shot.dark ? 'true' : 'false') + ";" +
    "prefs.collapsed=" + (shot.expand ? 'false' : 'true') + ";" +
    "prefs.seenIntro=" + (shot.intro ? 'false' : 'true') + ";" +
    "localStorage.setItem('uscisTracker.prefs.v1',JSON.stringify(prefs));" +
    "var root=document.querySelector('[class*=uscistr-root]');" +
    "if(root){root.classList." + (shot.dark ? 'add' : 'remove') + "('uscistr-dark');}" +
    "var pill=document.querySelector('[class*=uscistr-pill]');" +
    "var panel=document.querySelector('[class*=uscistr-panel]');" +
    (shot.expand ? "if(pill&&!panel){pill.click();}" : "if(panel){var m=document.querySelector('[title*=inimi],[aria-label*=inimi],[class*=minimi]'); if(m)m.click();}") +
    // The panel holds its own copy of prefs from init, so writing storage is
    // not enough — dismiss the note through the button a real user would use.
    (shot.intro ? "" :
      "var intro=document.querySelector('[class*=uscistr-intro]');" +
      "if(intro){var b=intro.querySelector('button'); if(b)b.click();}") +
    "Array.prototype.forEach.call(document.body.children,function(n){" +
    "  var c=String(n.className||'');" +
    "  if(c.indexOf('uscistr')===-1) n.style.display='none';" +
    "});" +
    "document.documentElement.style.background=" + (shot.dark ? "'#15151a'" : "'#eef0f4'") + ";" +
    "document.body.style.background=" + (shot.dark ? "'#15151a'" : "'#eef0f4'") + ";" +
    "return 'ok';})()";
}

main();
