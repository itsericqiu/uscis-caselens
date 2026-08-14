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
// The backdrop is a replica of the account page, loaded as an iframe behind
// the panel so screenshots show it where it actually appears.
var BACKDROP = 'http://localhost:8899/test/backdrop.html';
var PORT = 9530;
var W = 1280, H = 800;

var CHROME = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome'
].filter(function (p) { return fs.existsSync(p); })[0];

// Each shot sets up a state, then captures the whole 1280x800 viewport with the
// panel over the sample account page, so it reads as a product screenshot
// rather than a crop.
//
// `steps` are page snippets run in order after the panel opens. Earlier versions
// of this file only set a scrollTop on `.uscistr-body`, which does nothing when
// four collapsed rows already fit: shots 02 and 03 came out byte-identical and
// nobody noticed until they were read as a listing. Anything that claims to show
// an open case has to actually open one, and `assertDistinct` below now fails
// the run rather than shipping the same picture twice.
var DISMISS_INTRO =
  "(function(){var b=[].slice.call(document.querySelectorAll('.uscistr-root button'))" +
  ".filter(function(x){return (x.textContent||'').trim()==='Got it';})[0]; if(b)b.click();})()";

// Opens the nth case in the list. `.uscistr-collapsed` is the row button in both
// the narrow list and the wide rail, so this works in either layout.
function openCase(n) {
  return "(function(){var r=document.querySelectorAll('.uscistr-root .uscistr-collapsed');" +
    "if(r[" + n + "])r[" + n + "].click();})()";
}

// The scroll container depends on the layout: `.uscistr-detail` in wide mode,
// `.uscistr-body` in narrow. Scroll whichever exists and actually overflows.
function scrollTo(px) {
  return "(function(){var sel=['.uscistr-detail','.uscistr-body'];" +
    "for(var i=0;i<sel.length;i++){var n=document.querySelector('.uscistr-root '+sel[i]);" +
    "if(n&&n.scrollHeight>n.clientHeight+8){n.scrollTop=" + px + ";return;}}})()";
}

// "Everything USCIS sent", then its first endpoint section. Both are lazy
// disclosures, so each needs a real click; the record toggle re-renders the
// card, which is why the section click is a separate step rather than one
// snippet.
//
// A card carries TWO `.uscistr-raw-toggle` buttons — documents and the record —
// so this selects on `data-focus-key`. Taking the first match opened Documents
// instead, and the shot came out as the top of the card with nothing to show.
var OPEN_RECORD =
  "(function(){var b=document.querySelector('.uscistr-root .uscistr-raw-toggle[data-focus-key^=\"raw:\"]');" +
  "if(b&&b.getAttribute('aria-expanded')!=='true')b.click();})()";
// scrollIntoView acts on the nearest scrollport and does nothing useful here, so
// the offset is applied to the panel's own scroll container directly.
var OPEN_FIRST_RESPONSE =
  "(function(){var s=document.querySelector('.uscistr-root .uscistr-raw-summary'); if(!s)return;" +
  "if(s.getAttribute('aria-expanded')!=='true')s.click();" +
  "var sel=['.uscistr-detail','.uscistr-body'];" +
  "for(var i=0;i<sel.length;i++){var n=document.querySelector('.uscistr-root '+sel[i]);" +
  "if(n&&n.scrollHeight>n.clientHeight+8){" +
  "n.scrollTop+=s.getBoundingClientRect().top-n.getBoundingClientRect().top-12;return;}}})()";

var OPEN_SETTINGS =
  "(function(){var g=document.querySelector('[data-uscistr-settings-toggle]'); if(g)g.click();})()";

// The popover is taller than the panel and scrolls. "Erase everything" sits at
// the bottom, which is the one control this shot exists to show, so scroll it
// fully into frame rather than shipping it clipped.
var SETTINGS_TO_ERASE =
  "(function(){var p=document.querySelector('.uscistr-popover'); if(p)p.scrollTop=p.scrollHeight;})()";

// Order is the argument, not a gallery. Carousel drop-off is steep — most
// shoppers never reach slide 4 — so positions 1 to 3 go to the things the
// account page cannot already do. The collapsed overview led this set once; it
// shows "all your cases in one place" and nothing a reader could not get by
// looking at the page itself, so it sits at 4 now. The set ends on the privacy
// controls rather than on dark mode: for a tool handling immigration data,
// showing "Erase everything" closes an argument the description can only assert.
var SHOTS = [
  {
    name: '01-record-updated',
    caption: 'Office, stage, and when the record was last touched',
    steps: [DISMISS_INTRO, openCase(0)]
  },
  {
    name: '02-changed',
    caption: 'What changed since the last visit is named',
    scenario: 'changed',
    steps: [DISMISS_INTRO]
  },
  {
    name: '03-timeline',
    caption: 'One timeline per case, with each entry sourced',
    steps: [DISMISS_INTRO, openCase(0), scrollTo(760)]
  },
  {
    name: '04-overview',
    caption: 'Every case on the account, one line each',
    steps: [DISMISS_INTRO]
  },
  {
    name: '05-privacy',
    caption: 'Stored in this browser, and erasable from Settings',
    steps: [DISMISS_INTRO, OPEN_SETTINGS, SETTINGS_TO_ERASE]
  },
  // Sixth because Chrome shows five. AMO takes ten, and this is the shot that
  // proves the description's strongest claim — every field, unfiltered — rather
  // than asserting it.
  {
    name: '06-record',
    caption: 'Every field USCIS returned, in the agency’s own order',
    steps: [DISMISS_INTRO, openCase(0), OPEN_RECORD, OPEN_FIRST_RESPONSE]
  }
];

// A listing image that duplicates another teaches a shopper nothing and reads as
// padding. Cheap to check, and the failure it catches was invisible in review.
function assertDistinct(files) {
  var crypto = require('crypto');
  var seen = {};
  files.forEach(function (f) {
    var sum = crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex');
    if (seen[sum]) {
      console.error('store-screenshots: FAILED — ' + path.basename(f) +
        ' is identical to ' + path.basename(seen[sum]) + '.');
      process.exit(1);
    }
    seen[sum] = f;
  });
  console.log('store-screenshots: ' + files.length + ' distinct images.');
}

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

  var written = [];
  for (var i = 0; i < SHOTS.length; i++) {
    var shot = SHOTS[i];
    var client = await CDP.connect(PORT);
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: W, height: H, deviceScaleFactor: 1, mobile: false
    });

    await client.send('Page.navigate', { url: BASE + '?scenario=' + (shot.scenario || 'normal') });
    await sleep(30000);   // four cases load sequentially by design

    // Open the panel, then dress the page, then drive the panel. Steps run last
    // because opening a case re-renders, which would discard a scroll applied
    // before it.
    await client.eval("(function(){var p=document.querySelector('.uscistr-pill'); if (p) p.click();})()");
    await sleep(1500);
    if (shot.dark) {
      await client.eval("(function(){var p=JSON.parse(localStorage.getItem('uscisTracker.prefs.v1')||'{}');p.dark=true;localStorage.setItem('uscisTracker.prefs.v1',JSON.stringify(p));var r=document.querySelector('.uscistr-root'); if(r)r.classList.add('uscistr-dark');})()");
      await sleep(600);
    }
    // Replace the harness scaffolding with the sample account page, so the
    // panel is shown over the kind of page it actually overlays.
    await client.eval(
      "(function(){" +
      "Array.prototype.forEach.call(document.body.children,function(n){" +
      "  var c=String(n.className||''); if(c.indexOf('uscistr')===-1) n.style.display='none';});" +
      "var f=document.createElement('iframe');" +
      "f.src='" + BACKDROP + "';" +
      "f.style.cssText='position:fixed;inset:0;width:100%;height:100%;border:0;z-index:0';" +
      "document.body.insertBefore(f, document.body.firstChild);" +
      "})()");
    await sleep(2500);

    for (var s = 0; s < (shot.steps || []).length; s++) {
      await client.eval(shot.steps[s]);
      await sleep(1200);   // dismissing the note and opening a case each re-render
    }
    await sleep(700);

    var res = await client.send('Page.captureScreenshot', { format: 'png' });
    var file = path.join(OUT, shot.name + '.png');
    fs.writeFileSync(file, Buffer.from(res.data, 'base64'));
    written.push(file);
    console.log('wrote', path.relative(ROOT, file), '(' + W + 'x' + H + ')  —', shot.caption);
    await client.close();
  }

  assertDistinct(written);
}

main().then(function () { process.exit(0); })
  .catch(function (e) { console.error(e && e.message); process.exit(1); });
