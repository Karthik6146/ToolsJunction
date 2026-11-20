import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

const UPDATED = '20 November 2026';
const REPO = 'https://github.com/Karthik6146/ToolsJunction';
const ISSUES = `${REPO}/issues`;
const Ext = ({ href, children }: { href: string; children: ReactNode }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>;

function Page({ title, children }: { title: string; children: ReactNode }) {
  useEffect(() => { document.title = `${title} – ToolsJunction`; window.scrollTo(0, 0); }, [title]);
  return (
    <main className="wrap legal">
      <Link to="/" className="back">← All tools</Link>
      <h1>{title}</h1>
      <p className="muted">Last updated {UPDATED}</p>
      {children}
    </main>
  );
}

export function Privacy() {
  return (
    <Page title="Privacy Policy">
      <p>ToolsJunction is a free set of image and PDF tools made by Karthik Shakyawar. This page explains what happens to your files and data when you use the website or the Windows app.</p>

      <h2>Your files stay on your device</h2>
      <p>Every tool runs inside your browser or the Windows app. The files you open, and the files the tools create, are processed on your own device. They are never uploaded to us or to anyone else, and we cannot see them.</p>

      <h2>What we do not collect</h2>
      <p>There are no accounts, no sign-up, no analytics, no advertising and no tracking cookies. We do not collect your name, email address or any other personal information.</p>

      <h2>What is stored on your device</h2>
      <ul>
        <li><b>App files for offline use.</b> The website saves its own code in your browser so it opens quickly and works without internet.</li>
        <li><b>Photo Editor uploads.</b> Images you add to the Photo Editor are kept in your browser's storage so you can reuse them. You can delete them in the editor, or clear this site's data in your browser settings.</li>
        <li><b>OCR language data.</b> The OCR tool keeps downloaded language files in your browser so it does not download them again.</li>
        <li><b>Windows app signing log.</b> When you sign with a DSC token, the app writes a short technical log (certificate ID, file sizes, success or error) to your Windows temp folder to help fix problems. It never contains your PIN or your document.</li>
      </ul>
      <p>None of this leaves your device.</p>

      <h2>Services that see basic connection details</h2>
      <p>Like any website, a few services receive your IP address and browser details when your device connects to them. They do not receive your files.</p>
      <ul>
        <li><b>GitHub Pages</b> hosts the website and the app downloads. See <Ext href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement">GitHub's privacy statement</Ext>.</li>
        <li><b>jsDelivr</b> delivers OCR language data the first time you use OCR in a language. Only the language name is requested. See <Ext href="https://www.jsdelivr.com/terms/privacy-policy-jsdelivr-net">jsDelivr's privacy policy</Ext>.</li>
      </ul>

      <h2>Children</h2>
      <p>ToolsJunction does not knowingly collect information from anyone, including children, because it does not collect personal information at all.</p>

      <h2>Changes</h2>
      <p>If this policy changes, the new version will be posted on this page with a new date.</p>

      <h2>Contact</h2>
      <p>Questions about privacy? Open an issue on <Ext href={ISSUES}>GitHub</Ext>. Please do not attach private documents to a public issue.</p>
    </Page>
  );
}

export function Terms() {
  return (
    <Page title="Terms of Use">
      <p>These terms apply to the ToolsJunction website and Windows app. By using them you agree to these terms. If you do not agree, please do not use ToolsJunction.</p>

      <h2>Free to use</h2>
      <p>ToolsJunction is free for personal and commercial use. The source code is available under the <Ext href={`${REPO}/blob/main/LICENSE`}>MIT License</Ext>, which also applies to any copy you make of it.</p>

      <h2>Your files and your responsibility</h2>
      <ul>
        <li>You keep all rights to your files. We never receive them.</li>
        <li>Only use files you have the right to use, edit or convert. Do not use ToolsJunction for anything illegal, such as forging documents or signatures, or removing protection from files that are not yours.</li>
        <li>Keep your own copy of important files. Check every result before you rely on it, especially signed, redacted, compressed or converted documents.</li>
      </ul>

      <h2>Digital signatures</h2>
      <p>DSC signing in the Windows app uses the certificate on your own token, protected by your own PIN. You are responsible for what you sign and for keeping your token and PIN safe. Whether a signed document is accepted, for example by the MCA or another authority, depends on their rules and on your certificate.</p>

      <h2>No warranty</h2>
      <p>ToolsJunction is provided "as is", without warranties of any kind. Conversions can differ from the original (see the notes on each tool), and the tools may contain mistakes or stop working.</p>

      <h2>Limitation of liability</h2>
      <p>To the extent the law allows, the author is not liable for any loss or damage from using or not being able to use ToolsJunction, including lost or damaged files, rejected documents or lost time.</p>

      <h2>Other services</h2>
      <p>Links to other websites, and services such as GitHub Pages and jsDelivr, are governed by their own terms.</p>

      <h2>Changes</h2>
      <p>These terms may change. The new version will be posted on this page with a new date. Using ToolsJunction after that means you accept the new terms.</p>

      <h2>Governing law</h2>
      <p>These terms are governed by the laws of India.</p>

      <h2>Contact</h2>
      <p>Questions about these terms? Open an issue on <Ext href={ISSUES}>GitHub</Ext>.</p>
    </Page>
  );
}
