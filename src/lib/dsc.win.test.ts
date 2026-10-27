import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { tmpdir } from 'os';
import { join } from 'path';
import { PDFDocument } from '@cantoo/pdf-lib';
import { signPdf } from './dsc';

const { SIGN } = createRequire(import.meta.url)('../../electron/dsc.cjs') as { SIGN: string };

// same CMS code the desktop app runs, but with a throwaway in-memory certificate instead of the user's store
const IN_MEMORY_CERT = `
$rsa = [System.Security.Cryptography.RSA]::Create(2048)
$req = New-Object System.Security.Cryptography.X509Certificates.CertificateRequest ('CN=TJ Test Signer', $rsa, [System.Security.Cryptography.HashAlgorithmName]::SHA256, [System.Security.Cryptography.RSASignaturePadding]::Pkcs1)
$cert = $req.CreateSelfSigned([DateTimeOffset]::Now.AddDays(-1), [DateTimeOffset]::Now.AddDays(1))`;

const VERIFY = `
Add-Type -AssemblyName System.Security
$cms = New-Object System.Security.Cryptography.Pkcs.SignedCms ((New-Object System.Security.Cryptography.Pkcs.ContentInfo (,[IO.File]::ReadAllBytes($env:TJ_IN))), $true)
$cms.Decode([IO.File]::ReadAllBytes($env:TJ_OUT))
$cms.CheckSignature($true)
$cms.SignerInfos[0].Certificate.Subject`;

const ps = (script: string, env: Record<string, string>) =>
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { env: { ...process.env, ...env } }).toString().trim();

describe.skipIf(process.platform !== 'win32')('DSC signing with Windows CMS', () => {
  it('produces a CMS that verifies over the PDF byte range', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tj-dsc-test-'));
    const env = { TJ_IN: join(dir, 'in.bin'), TJ_OUT: join(dir, 'out.p7s') };
    try {
      const d = await PDFDocument.create();
      d.addPage().drawText('contract');
      const signed = await signPdf(await d.save(), { signer: 'TJ Test Signer' }, async (data) => {
        writeFileSync(env.TJ_IN, data);
        ps(SIGN.replace(/^\$cert = Get-Item.*$/m, IN_MEMORY_CERT), env);
        return new Uint8Array(readFileSync(env.TJ_OUT));
      });
      expect(ps(VERIFY, env)).toBe('CN=TJ Test Signer');
      expect((await PDFDocument.load(signed)).getPageCount()).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
