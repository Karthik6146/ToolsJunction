import { acceptsFile } from './files';

describe('acceptsFile', () => {
  it('matches by MIME type, wildcard and extension', () => {
    expect(acceptsFile('image/*', { name: 'a.jpg', type: 'image/jpeg' })).toBe(true);
    expect(acceptsFile('.pdf,application/pdf', { name: 'A.PDF', type: '' })).toBe(true);
    expect(acceptsFile('.docx', { name: 'report.docx', type: 'application/x-whatever' })).toBe(true);
  });
  it('falls back to the extension when the MIME type is empty', () => {
    expect(acceptsFile('image/*', { name: 'IMG_20261118.JPG', type: '' })).toBe(true);
    expect(acceptsFile('image/*', { name: 'photo.heic', type: '' })).toBe(true);
  });
  it('rejects files that match nothing', () => {
    expect(acceptsFile('image/*', { name: 'notes.txt', type: 'text/plain' })).toBe(false);
    expect(acceptsFile('image/*', { name: 'mystery', type: '' })).toBe(false);
    expect(acceptsFile('.pdf', { name: 'scan.pdf.exe', type: '' })).toBe(false);
  });
});
