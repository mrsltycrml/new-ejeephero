// Small browser PDF writer for the supervisor report. No remote service or PDF package is needed.
const encoder = new TextEncoder();
const bytes = (value: string) => encoder.encode(value);
const joinBytes = (parts: Uint8Array[]) => {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
};

const clean = (value: unknown) => String(value ?? '').normalize('NFKD')
  .replace(/₱/g, 'PHP ').replace(/[–—]/g, '-').replace(/[•·]/g, '/').replace(/[’‘]/g, "'")
  .replace(/[^\x20-\x7e]/g, '?');
const pdfString = (value: unknown) => clean(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
const linesFor = (value: unknown, maxChars: number) => {
  const words = clean(value).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if ((line + ' ' + word).trim().length > maxChars && line) { lines.push(line); line = word; }
    else line = `${line} ${word}`.trim();
  }
  lines.push(line || '-');
  return lines;
};

type Page = { commands: string[]; y: number };
export class SimplePdf {
  private pages: Page[] = [];
  private page: Page;
  private imageBytes: Uint8Array;
  private imageWidth: number;
  private imageHeight: number;
  private period: string;
  private title: string;

  constructor(imageBytes: Uint8Array, imageWidth: number, imageHeight: number, title: string, period: string) {
    this.imageBytes = imageBytes;
    this.imageWidth = imageWidth;
    this.imageHeight = imageHeight;
    this.title = title;
    this.period = period;
    this.page = this.newPage();
  }

  private newPage(): Page {
    const page: Page = { commands: [], y: 690 };
    this.pages.push(page);
    this.page = page;
    // Official JPEG logo, retaining its own proportions.
    const logoWidth = 155;
    const logoHeight = logoWidth * this.imageHeight / this.imageWidth;
    page.commands.push(`q ${logoWidth.toFixed(2)} 0 0 ${logoHeight.toFixed(2)} 42 ${(779 - logoHeight).toFixed(2)} cm /Im1 Do Q`);
    this.text(this.title, 210, 791, 18, true, '#18282E');
    this.text(this.period, 210, 772, 10, false, '#5B6B70');
    page.commands.push('0.714 0.239 0.196 rg 42 715 511 3 re f');
    return page;
  }

  private color(hex: string) {
    const value = hex.replace('#', '');
    return [0, 2, 4].map((index) => (parseInt(value.slice(index, index + 2), 16) / 255).toFixed(3)).join(' ');
  }

  private text(value: unknown, x: number, y: number, size = 9, bold = false, color = '#18282E') {
    this.page.commands.push(`${this.color(color)} rg BT /${bold ? 'F2' : 'F1'} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${pdfString(value)}) Tj ET`);
  }

  private ensure(height: number) {
    if (this.page.y - height < 58) this.newPage();
  }

  keepTogether(height: number) { this.ensure(height); }

  paragraph(value: unknown, color = '#4F5E63') {
    const lines = linesFor(value, 105);
    this.ensure(lines.length * 13 + 8);
    for (const line of lines) { this.text(line, 42, this.page.y, 9, false, color); this.page.y -= 13; }
    this.page.y -= 8;
  }

  metrics(items: { value: string | number; label: string }[]) {
    this.ensure(74);
    const width = (511 - (items.length - 1) * 7) / items.length;
    items.forEach((item, index) => {
      const x = 42 + index * (width + 7);
      this.page.commands.push(`0.094 0.157 0.180 rg ${x.toFixed(2)} ${(this.page.y - 57).toFixed(2)} ${width.toFixed(2)} 57 re f`);
      this.text(item.value, x + 11, this.page.y - 27, 22, true, '#FFFFFF');
      this.text(item.label.toUpperCase(), x + 11, this.page.y - 44, 8, true, '#D8E1DE');
    });
    this.page.y -= 73;
  }

  section(title: string) {
    this.ensure(38);
    this.page.y -= 8;
    this.page.commands.push(`0.714 0.239 0.196 rg 42 ${(this.page.y - 7).toFixed(2)} 4 18 re f`);
    this.text(title, 54, this.page.y, 13, true);
    this.page.y -= 28;
  }

  table(headers: string[], widths: number[], records: unknown[][]) {
    const total = widths.reduce((sum, width) => sum + width, 0);
    const cells = widths.map((width) => width * 511 / total);
    const drawHeader = () => {
      this.ensure(30);
      this.page.commands.push(`0.898 0.863 0.816 rg 42 ${(this.page.y - 22).toFixed(2)} 511 24 re f`);
      let x = 46;
      headers.forEach((header, index) => { this.text(header.toUpperCase(), x, this.page.y - 14, 7, true); x += cells[index]; });
      this.page.y -= 26;
    };
    drawHeader();
    if (!records.length) {
      this.ensure(25);
      this.text('No recorded entries for this period.', 46, this.page.y - 12, 8, false, '#607079');
      this.page.y -= 31;
      return;
    }
    records.forEach((record, rowIndex) => {
      const wrapped = record.map((value, index) => linesFor(value, Math.max(7, Math.floor((cells[index] - 10) / 4.5))));
      const height = Math.max(...wrapped.map((cell) => cell.length)) * 10 + 10;
      const oldPage = this.page;
      this.ensure(height + 3);
      if (oldPage !== this.page) drawHeader();
      if (rowIndex % 2 === 0) this.page.commands.push(`0.973 0.960 0.944 rg 42 ${(this.page.y - height).toFixed(2)} 511 ${height.toFixed(2)} re f`);
      let x = 46;
      wrapped.forEach((cell, index) => {
        cell.forEach((line, lineIndex) => this.text(line, x, this.page.y - 12 - lineIndex * 10, 7.6));
        x += cells[index];
      });
      this.page.y -= height;
    });
    this.page.y -= 7;
  }

  preparedBy() {
    this.ensure(85);
    this.page.y -= 23;
    this.page.commands.push(`0.094 0.157 0.180 rg 42 ${this.page.y.toFixed(2)} 511 2 re f`);
    this.text('Prepared by: Admin', 42, this.page.y - 22, 11, true);
    this.text('eSAKAY supervisor', 42, this.page.y - 38, 8, false, '#607079');
    this.page.commands.push(`0.094 0.157 0.180 RG 385 ${(this.page.y - 35).toFixed(2)} m 553 ${(this.page.y - 35).toFixed(2)} l S`);
    this.text('Signature / date', 385, this.page.y - 48, 8, false, '#607079');
  }

  toBytes(): Uint8Array {
    this.pages.forEach((page, index) => {
      const footer = `Page ${index + 1} of ${this.pages.length}   /   Generated in Philippine time`;
      page.commands.push(`0.376 0.439 0.475 rg BT /F1 8 Tf 1 0 0 1 42 32 Tm (${pdfString(footer)}) Tj ET`);
    });
    const objects: Uint8Array[] = [];
    objects[0] = bytes('<< /Type /Catalog /Pages 2 0 R >>');
    objects[1] = bytes(`<< /Type /Pages /Count ${this.pages.length} /Kids [${this.pages.map((_, index) => `${7 + index * 2} 0 R`).join(' ')}] >>`);
    objects[2] = bytes('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    objects[3] = bytes('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    objects[4] = joinBytes([bytes(`<< /Type /XObject /Subtype /Image /Width ${this.imageWidth} /Height ${this.imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${this.imageBytes.length} >>\nstream\n`), this.imageBytes, bytes('\nendstream')]);
    this.pages.forEach((page, index) => {
      const content = bytes(page.commands.join('\n') + '\n');
      objects.push(joinBytes([bytes(`<< /Length ${content.length} >>\nstream\n`), content, bytes('endstream')]));
      objects.push(bytes(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << /Im1 5 0 R >> >> /Contents ${6 + index * 2} 0 R >>`));
    });
    const parts: Uint8Array[] = [bytes('%PDF-1.4\n')];
    const offsets = [0];
    for (let index = 0; index < objects.length; index++) {
      offsets.push(parts.reduce((sum, part) => sum + part.length, 0));
      parts.push(bytes(`${index + 1} 0 obj\n`), objects[index], bytes('\nendobj\n'));
    }
    const xrefStart = parts.reduce((sum, part) => sum + part.length, 0);
    parts.push(bytes(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`));
    return joinBytes(parts);
  }
}
