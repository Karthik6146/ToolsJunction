// @vitest-environment happy-dom
import { inertHtml } from './convert';

const DATA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const LEAK = /file:|\\\\|evil\.example|javascript:|onerror|@import|<iframe|<object|<link|<base|<video|<script/i;

describe('inertHtml (untrusted HTML before HTML/Word/Excel to PDF)', () => {
  it.each([
    ['local file image', '<img src="file:///C:/Windows/win.ini">'],
    ['network share image', '<img src="\\\\attacker\\share\\x.png">'],
    ['remote image', '<img src="https://evil.example/t.png">'],
    ['mixed srcset', `<img src="${DATA}" srcset="${DATA} 1x, https://evil.example/2x.png 2x">`],
    ['css url', `<div style="background:url('file:///C:/x.png')">a</div>`],
    ['css escape', '<div style="background:\\75 rl(https://evil.example/x)">c</div>'],
    ['style import', '<style>@import url(https://evil.example/a.css); p{background:url(//evil.example/b.png)}</style><p>x</p>'],
    ['svg href', '<svg><image href="file:///C:/x.png"/><use href="https://evil.example/s.svg#a"/></svg>'],
    ['handlers and js links', `<img src="${DATA}" onerror="alert(1)"><a href="javascript:alert(1)">l</a>`],
    ['embeds', '<iframe src="file:///C:/"></iframe><object data="x.pdf"></object><link rel=stylesheet href="https://evil.example/c.css"><base href="https://evil.example/"><video poster="https://evil.example/p.png"></video><script>alert(1)</script>'],
    ['image input', '<input type="image" src="https://evil.example/i.png">'],
  ])('removes %s', (_name, html) => {
    expect(inertHtml(html)).not.toMatch(LEAK);
  });

  it('keeps embedded images and normal content', () => {
    const out = inertHtml(`<h1>Title</h1><img src="${DATA}"><div style="color:red;background:url(${DATA})">x</div><table><tr><td>1</td></tr></table>`);
    expect(out).toContain('<h1>Title</h1>');
    expect(out.match(/data:image\/png/g)?.length).toBe(2);
    expect(out).toContain('color:red');
    expect(out).toContain('<td>1</td>');
  });
});
