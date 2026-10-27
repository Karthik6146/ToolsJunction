// DSC (USB token / installed certificate) signing via the Windows certificate store.
// Token drivers (ePass2003, ProxKey, mToken...) register their certificates in CurrentUser\My,
// and Windows shows the token's own PIN prompt when the private key is used.
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function ps(script, env = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { env: { ...process.env, ...env }, windowsHide: true, maxBuffer: 10 * 1024 * 1024, timeout: 5 * 60 * 1000 },
      (err, stdout, stderr) => (err ? reject(new Error((stderr || err.message).trim().split('\n')[0])) : resolve(stdout)),
    );
  });
}

const LIST = `
$now = Get-Date
$certs = Get-ChildItem Cert:\\CurrentUser\\My | Where-Object { $_.HasPrivateKey -and $_.NotAfter -gt $now -and $_.NotBefore -lt $now } | ForEach-Object {
  [pscustomobject]@{
    thumbprint = $_.Thumbprint
    name = $_.GetNameInfo('SimpleName', $false)
    issuer = $_.GetNameInfo('SimpleName', $true)
    expires = $_.NotAfter.ToString('yyyy-MM-dd')
  }
}
ConvertTo-Json @($certs) -Compress`;

// paths and thumbprint come in through env vars, never interpolated into the script
const SIGN = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$cert = Get-Item ("Cert:\\CurrentUser\\My\\" + $env:TJ_THUMB)
$content = New-Object System.Security.Cryptography.Pkcs.ContentInfo (,[IO.File]::ReadAllBytes($env:TJ_IN))
$cms = New-Object System.Security.Cryptography.Pkcs.SignedCms ($content, $true)
$signer = New-Object System.Security.Cryptography.Pkcs.CmsSigner ($cert)
$signer.DigestAlgorithm = New-Object System.Security.Cryptography.Oid '2.16.840.1.101.3.4.2.1'
$signer.IncludeOption = [System.Security.Cryptography.X509Certificates.X509IncludeOption]::WholeChain
[void]$signer.SignedAttributes.Add((New-Object System.Security.Cryptography.Pkcs.Pkcs9SigningTime))
$cms.ComputeSignature($signer, $false)
[IO.File]::WriteAllBytes($env:TJ_OUT, $cms.Encode())`;

async function list() {
  if (process.platform !== 'win32') throw new Error('DSC signing is available on Windows only');
  const out = (await ps(LIST)).trim();
  return out ? JSON.parse(out) : [];
}

async function sign(thumbprint, data) {
  if (process.platform !== 'win32') throw new Error('DSC signing is available on Windows only');
  if (!/^[0-9A-F]{40}$/i.test(thumbprint)) throw new Error('Invalid certificate');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tj-dsc-'));
  const input = path.join(dir, 'data.bin');
  const output = path.join(dir, 'sig.p7s');
  try {
    fs.writeFileSync(input, Buffer.from(data));
    await ps(SIGN, { TJ_THUMB: thumbprint, TJ_IN: input, TJ_OUT: output });
    return new Uint8Array(fs.readFileSync(output));
  } catch (e) {
    const msg = String(e.message || e);
    if (/cancel/i.test(msg)) throw new Error('Signing was cancelled');
    if (/keyset|key set|smart card|token/i.test(msg)) throw new Error('Could not use the certificate key: is the DSC token plugged in?');
    throw new Error(msg);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

module.exports = { list, sign, SIGN };
