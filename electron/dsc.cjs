// DSC (USB token / installed certificate) signing via the Windows certificate store.
// Token drivers (ePass2003, ProxKey, mToken...) register their certificates in CurrentUser\My.
// We build the CMS (PKCS#7) signature here and ask Windows only for the raw RSA signature,
// on the same key handle the PIN was given to, so the token never needs its own PIN dialog.
const { execFile } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const LOG = path.join(os.tmpdir(), 'toolsjunction-dsc.log');
const log = (msg) => { try { fs.appendFileSync(LOG, `${new Date().toISOString()} ${msg}\n`); } catch { /* logging is best effort */ } };

// `interactive`: the token driver may open its own PIN dialog. windowsHide would make Windows turn that
// dialog's first ShowWindow(SW_SHOWDEFAULT) into SW_HIDE, so instead let PowerShell hide only its console.
function ps(script, env = {}, { interactive = false, timeoutMs = 2 * 60 * 1000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', ...(interactive ? ['-WindowStyle', 'Hidden'] : []), '-Command', script],
      { env: { ...process.env, ...env }, windowsHide: !interactive, maxBuffer: 10 * 1024 * 1024, timeout: timeoutMs },
      (err, stdout, stderr) => {
        if (!err) return resolve(stdout);
        if (err.killed) return reject(new Error('Timed out waiting for the DSC token. Check for its PIN window (also on the taskbar), or unplug and replug the token.'));
        const detail = String(stderr || '').trim();
        reject(new Error(detail ? detail.split('\n').find((l) => l.trim()) : `PowerShell exited with code ${err.code}`));
      },
    );
  });
}

// every script reports failures as one readable line on stderr
const wrap = (body) => `$ErrorActionPreference = 'Stop'
try {
${body}
} catch {
  $ex = $_.Exception; while ($ex.InnerException) { $ex = $ex.InnerException }
  [Console]::Error.WriteLine($ex.Message + ' [0x' + $ex.HResult.ToString('X8') + ']')
  exit 1
}`;

const LIST = wrap(`
$now = Get-Date
$certs = Get-ChildItem Cert:\\CurrentUser\\My | Where-Object { $_.HasPrivateKey -and $_.NotAfter -gt $now -and $_.NotBefore -lt $now } | ForEach-Object {
  [pscustomobject]@{
    thumbprint = $_.Thumbprint
    name = $_.GetNameInfo('SimpleName', $false)
    issuer = $_.GetNameInfo('SimpleName', $true)
    expires = $_.NotAfter.ToString('yyyy-MM-dd')
  }
}
ConvertTo-Json @($certs) -Compress`);

// leaf first, then issuers; no key access
const CHAIN = wrap(`
$cert = Get-Item ("Cert:\\CurrentUser\\My\\" + $env:TJ_THUMB)
$chain = New-Object System.Security.Cryptography.X509Certificates.X509Chain
$chain.ChainPolicy.RevocationMode = 'NoCheck'
[void]$chain.Build($cert)
if ($chain.ChainElements.Count -eq 0) { [Convert]::ToBase64String($cert.RawData) }
foreach ($el in $chain.ChainElements) { [Convert]::ToBase64String($el.Certificate.RawData) }`);

// The driver may still pop up its own dialog; keep any window of this process on top.
const PIN_ON_TOP = `
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices; using System.Threading;
public static class TjPinOnTop {
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint f);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool ShowWindowAsync(IntPtr h, int cmd);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h, System.Text.StringBuilder s, int n);
  static volatile bool run;
  public static void Start() {
    run = true;
    uint me = (uint)System.Diagnostics.Process.GetCurrentProcess().Id;
    var t = new Thread(() => {
      while (run) {
        EnumWindows((h, l) => {
          uint pid; GetWindowThreadProcessId(h, out pid);
          if (pid != me) return true;
          if (!IsWindowVisible(h)) {
            var cls = new System.Text.StringBuilder(64); GetClassName(h, cls, 64);
            if (cls.ToString() == "#32770") ShowWindowAsync(h, 5); // a dialog (PIN prompt) that came up hidden: SW_SHOW
          }
          if (IsWindowVisible(h)) {
            // async variants never wait on the dialog's thread, which may be busy talking to the token
            SetWindowPos(h, new IntPtr(-1), 0, 0, 0, 0, 0x4053); // HWND_TOPMOST, NOSIZE|NOMOVE|NOACTIVATE|SHOWWINDOW|ASYNCWINDOWPOS
            SetForegroundWindow(h);
          }
          return true;
        }, IntPtr.Zero);
        Thread.Sleep(250);
      }
    });
    t.IsBackground = true; t.Start();
  }
  public static void Stop() { run = false; }
}
'@
[TjPinOnTop]::Start()`;

// RSA-SHA256 (PKCS#1 v1.5) over TJ_IN with the certificate's key; PIN set on that same key handle.
// Thumbprint, paths and PIN arrive as environment variables, never interpolated into the script.
const RAW_SIGN = wrap(`
${PIN_ON_TOP}
$cert = Get-Item ("Cert:\\CurrentUser\\My\\" + $env:TJ_THUMB)
$key = [System.Security.Cryptography.X509Certificates.RSACertificateExtensions]::GetRSAPrivateKey($cert)
if (-not $key) { throw 'This certificate has no RSA private key available' }
$pin = $env:TJ_PIN
# Some drivers accept a PIN from the app; others (e.g. HyperPKI/ePass KSP) always show their own dialog.
if (-not $pin) { }
elseif ($key -is [System.Security.Cryptography.RSACng]) {
  $pinBytes = [Text.Encoding]::Unicode.GetBytes($pin + [char]0)
  # drivers that don't support it reject the property; their own PIN dialog then takes over
  try { $key.Key.SetProperty((New-Object System.Security.Cryptography.CngProperty ('SmartCardPin', $pinBytes, [System.Security.Cryptography.CngPropertyOptions]::None))) } catch { }
} elseif ($key -is [System.Security.Cryptography.RSACryptoServiceProvider]) {
  $info = $key.CspKeyContainerInfo
  $secure = New-Object System.Security.SecureString
  foreach ($ch in $pin.ToCharArray()) { $secure.AppendChar($ch) }
  $csp = New-Object System.Security.Cryptography.CspParameters ($info.ProviderType, $info.ProviderName, $info.KeyContainerName)
  $csp.KeyPassword = $secure
  $csp.Flags = [System.Security.Cryptography.CspProviderFlags]::UseExistingKey
  $key = New-Object System.Security.Cryptography.RSACryptoServiceProvider ($csp)
}
$sig = $key.SignData([IO.File]::ReadAllBytes($env:TJ_IN), [System.Security.Cryptography.HashAlgorithmName]::SHA256, [System.Security.Cryptography.RSASignaturePadding]::Pkcs1)
[TjPinOnTop]::Stop()
[IO.File]::WriteAllBytes($env:TJ_OUT, $sig)`);

// ---------- minimal DER for a detached CMS SignedData ----------
const len = (n) => (n < 128 ? Buffer.from([n]) : (() => { const b = []; for (; n; n >>= 8) b.unshift(n & 255); return Buffer.from([0x80 | b.length, ...b]); })());
const tlv = (tag, ...parts) => { const body = Buffer.concat(parts); return Buffer.concat([Buffer.from([tag]), len(body.length), body]); };
const seq = (...p) => tlv(0x30, ...p);
const set = (...p) => tlv(0x31, ...p);
const NULL = Buffer.from([0x05, 0x00]);
const INT1 = Buffer.from([0x02, 0x01, 0x01]);
function oid(s) {
  const [a, b, ...rest] = s.split('.').map(Number);
  const out = [40 * a + b];
  for (let v of rest) { const t = [v & 127]; for (v = Math.floor(v / 128); v; v = Math.floor(v / 128)) t.unshift((v & 127) | 128); out.push(...t); }
  return tlv(0x06, Buffer.from(out));
}
const utcTime = (d) => tlv(0x17, Buffer.from(d.toISOString().replace(/^\d\d|[-:T]|\.\d+/g, '').slice(0, 12) + 'Z'));
const sha256 = (b) => crypto.createHash('sha256').update(b).digest();

/** One TLV at `off`: returns its full byte range. */
function readTlv(buf, off) {
  let n = buf[off + 1], hdr = 2;
  if (n & 0x80) { const k = n & 0x7f; n = 0; for (let i = 0; i < k; i++) n = n * 256 + buf[off + 2 + i]; hdr += k; }
  return { start: off, body: off + hdr, end: off + hdr + n };
}

/** issuer Name and serialNumber, raw DER, from a certificate. */
function issuerSerial(cert) {
  const tbs = readTlv(cert, readTlv(cert, 0).body);
  let p = tbs.body;
  if (cert[p] === 0xa0) p = readTlv(cert, p).end; // [0] version
  const serial = readTlv(cert, p);
  const sigAlg = readTlv(cert, serial.end);
  const issuer = readTlv(cert, sigAlg.end);
  return { serial: cert.subarray(serial.start, serial.end), issuer: cert.subarray(issuer.start, issuer.end) };
}

const SHA256_ALG = seq(oid('2.16.840.1.101.3.4.2.1'), NULL);
const RSA_ALG = seq(oid('1.2.840.113549.1.1.1'), NULL);
const DATA = '1.2.840.113549.1.7.1';
const attr = (id, value) => seq(oid(id), set(value));

/** Detached CMS over `content`; `rawSign` returns an RSA-SHA256 signature of the given bytes. */
async function buildCms(content, chain, rawSign, when = new Date()) {
  const leaf = chain[0];
  const { issuer, serial } = issuerSerial(leaf);
  const attrs = Buffer.concat([
    attr('1.2.840.113549.1.9.3', oid(DATA)), // contentType
    attr('1.2.840.113549.1.9.5', utcTime(when)), // signingTime
    attr('1.2.840.113549.1.9.4', tlv(0x04, sha256(content))), // messageDigest
    attr('1.2.840.113549.1.9.16.2.47', seq(seq(seq(tlv(0x04, sha256(leaf)))))), // signingCertificateV2 (PAdES)
  ].sort(Buffer.compare)); // DER SET OF: sorted encodings
  const signature = await rawSign(set(attrs));
  const signerInfo = seq(INT1, seq(issuer, serial), SHA256_ALG, tlv(0xa0, attrs), RSA_ALG, tlv(0x04, signature));
  const signedData = seq(INT1, set(SHA256_ALG), seq(oid(DATA)), tlv(0xa0, ...chain), set(signerInfo));
  return seq(oid('1.2.840.113549.1.7.2'), tlv(0xa0, signedData));
}

async function list() {
  if (process.platform !== 'win32') throw new Error('DSC signing is available on Windows only');
  const out = (await ps(LIST)).trim();
  return out ? JSON.parse(out) : [];
}

function friendly(msg) {
  if (/blocked|maximum number|0x8010006C/i.test(msg)) return 'Your token PIN is blocked. Unblock it with the token tool from your DSC provider.';
  if (/wrong|incorrect|0x8010006B|CHV/i.test(msg)) return 'Wrong PIN. Careful: tokens lock after a few wrong attempts.';
  if (/cancel/i.test(msg)) return 'Signing was cancelled';
  if (/keyset|key set|smart card|no card|0x80100069|0x8010000C/i.test(msg)) return `Could not use the token key: is the DSC token plugged in? (${msg})`;
  return msg;
}

const MAX_SIGN_BYTES = 512 * 1024 * 1024;

async function sign(thumbprint, data, pin = '') {
  if (process.platform !== 'win32') throw new Error('DSC signing is available on Windows only');
  if (!/^[0-9A-F]{40}$/i.test(thumbprint)) throw new Error('Invalid certificate');
  if (typeof pin !== 'string' || pin.length > 64 || /[\0-\x1f]/.test(pin)) throw new Error('Invalid PIN');
  // only raw document bytes from signPdf; anything else (strings, objects, huge buffers) is refused
  if (!(data instanceof Uint8Array) || data.length === 0 || data.length > MAX_SIGN_BYTES) throw new Error('Invalid document data');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tj-dsc-'));
  const input = path.join(dir, 'tbs.bin');
  const output = path.join(dir, 'sig.bin');
  try {
    log(`sign start, cert ${thumbprint}, ${data.length} bytes`);
    const chain = (await ps(CHAIN, { TJ_THUMB: thumbprint })).trim().split(/\s+/).map((b) => Buffer.from(b, 'base64'));
    log(`chain: ${chain.length} certificate(s)`);
    const cms = await buildCms(Buffer.from(data), chain, async (tbs) => {
      fs.writeFileSync(input, tbs);
      // PIN only in this child's environment, not on its command line
      await ps(RAW_SIGN, { TJ_THUMB: thumbprint, TJ_IN: input, TJ_OUT: output, TJ_PIN: pin }, { interactive: true });
      return fs.readFileSync(output);
    });
    log(`signed ok, CMS ${cms.length} bytes`);
    return new Uint8Array(cms);
  } catch (e) {
    const msg = String(e.message || e);
    log(`sign failed: ${msg}`);
    throw new Error(friendly(msg));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

module.exports = { list, sign, buildCms, LOG, RAW_SIGN, CHAIN, ps };
