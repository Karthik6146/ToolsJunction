import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { tmpdir } from 'os';
import { join } from 'path';
import { PDFDocument } from '@cantoo/pdf-lib';
import { signPdf } from './dsc';

type BuildCms = (content: Uint8Array, chain: Uint8Array[], rawSign: (tbs: Uint8Array) => Promise<Uint8Array>) => Promise<Uint8Array>;
const { buildCms } = createRequire(import.meta.url)('../../electron/dsc.cjs') as { buildCms: BuildCms };

const ps = (script: string, env: Record<string, string>) =>
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { env: { ...process.env, ...env } }).toString().trim();

// throwaway certificate, never added to any certificate store
const MAKE_CERT = `
$rsa = New-Object System.Security.Cryptography.RSACng 2048
$req = New-Object System.Security.Cryptography.X509Certificates.CertificateRequest ('CN=TJ Test Signer', $rsa, [System.Security.Cryptography.HashAlgorithmName]::SHA256, [System.Security.Cryptography.RSASignaturePadding]::Pkcs1)
$cert = $req.CreateSelfSigned([DateTimeOffset]::Now.AddDays(-1), [DateTimeOffset]::Now.AddDays(1))
[IO.File]::WriteAllBytes($env:TJ_PFX, $cert.Export('Pfx', 'test'))
[IO.File]::WriteAllBytes($env:TJ_DER, $cert.RawData)`;

const RAW_SIGN = `
$cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2 ($env:TJ_PFX, 'test')
$key = [System.Security.Cryptography.X509Certificates.RSACertificateExtensions]::GetRSAPrivateKey($cert)
[IO.File]::WriteAllBytes($env:TJ_OUT, $key.SignData([IO.File]::ReadAllBytes($env:TJ_IN), [System.Security.Cryptography.HashAlgorithmName]::SHA256, [System.Security.Cryptography.RSASignaturePadding]::Pkcs1))`;

const VERIFY = `
Add-Type -AssemblyName System.Security
$cms = New-Object System.Security.Cryptography.Pkcs.SignedCms ((New-Object System.Security.Cryptography.Pkcs.ContentInfo (,[IO.File]::ReadAllBytes($env:TJ_IN))), $true)
$cms.Decode([IO.File]::ReadAllBytes($env:TJ_CMS))
$cms.CheckSignature($true)
$cms.SignerInfos[0].Certificate.Subject`;

describe.skipIf(process.platform !== 'win32')('DSC CMS built in-app', () => {
  it('Windows verifies the CMS over the PDF byte range', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tj-dsc-test-'));
    const env = { TJ_PFX: join(dir, 't.pfx'), TJ_DER: join(dir, 't.cer'), TJ_IN: join(dir, 'in.bin'), TJ_OUT: join(dir, 'sig.bin'), TJ_CMS: join(dir, 'cms.p7s') };
    try {
      ps(MAKE_CERT, env);
      const chain = [new Uint8Array(readFileSync(env.TJ_DER))];
      let content: Uint8Array = new Uint8Array();
      const signed = await signPdf(await (await PDFDocument.create().then((d) => { d.addPage(); return d; })).save(), { signer: 'TJ Test Signer' }, async (data) => {
        content = data;
        return buildCms(data, chain, async (tbs) => {
          writeFileSync(env.TJ_IN, tbs);
          ps(RAW_SIGN, env);
          return new Uint8Array(readFileSync(env.TJ_OUT));
        });
      });
      // verify the CMS against exactly the bytes the PDF signature covers
      const cms = await buildCms(content, chain, async (tbs) => { writeFileSync(env.TJ_IN, tbs); ps(RAW_SIGN, env); return new Uint8Array(readFileSync(env.TJ_OUT)); });
      writeFileSync(env.TJ_IN, content);
      writeFileSync(env.TJ_CMS, cms);
      expect(ps(VERIFY, env)).toBe('CN=TJ Test Signer');
      expect((await PDFDocument.load(signed)).getPageCount()).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
