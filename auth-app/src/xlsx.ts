/**
 * A real .xlsx with no dependency: six small XML parts in a stored
 * (uncompressed) zip. Header row bold and frozen, first column frozen,
 * long answers wrapped, an autofilter over the whole range.
 */

export type Cell = string | number | null;
export type Table = { headers: string[]; rows: Cell[][]; widths: number[]; wrap?: boolean[] };

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(b: Uint8Array) {
  let c = 0xffffffff;
  for (const x of b) c = CRC[(c ^ x) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function zip(files: { name: string; data: Uint8Array }[]): Blob {
  const enc = new TextEncoder();
  const out: Uint8Array[] = [];
  const cd: Uint8Array[] = [];
  let off = 0;
  for (const f of files) {
    const nm = enc.encode(f.name), crc = crc32(f.data), sz = f.data.length;
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint16(10, 0, true); h.setUint16(12, 33, true); h.setUint32(14, crc, true); h.setUint32(18, sz, true); h.setUint32(22, sz, true);
    h.setUint16(26, nm.length, true); h.setUint16(28, 0, true);
    out.push(new Uint8Array(h.buffer), nm, f.data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
    c.setUint16(12, 0, true); c.setUint16(14, 33, true); c.setUint32(16, crc, true); c.setUint32(20, sz, true); c.setUint32(24, sz, true);
    c.setUint16(28, nm.length, true); c.setUint32(38, 0, true); c.setUint32(42, off, true);
    cd.push(new Uint8Array(c.buffer), nm);
    off += 30 + nm.length + sz;
  }
  const cdSize = cd.reduce((a, b) => a + b.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
  e.setUint32(12, cdSize, true); e.setUint32(16, off, true);
  return new Blob([...out, ...cd, new Uint8Array(e.buffer)] as BlobPart[], { type: XLSX_TYPE });
}

// eslint-disable-next-line no-control-regex
const CTRL = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g;
const esc = (s: string) => s.replace(CTRL, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** 1 → A, 26 → Z, 27 → AA. */
export function col(n: number): string {
  let s = "";
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

function sheetXml(t: Table): string {
  const cols = t.headers.map((_, i) => `<col min="${i + 1}" max="${i + 1}" width="${t.widths[i] ?? 14}" customWidth="1"/>`).join("");
  const str = (ref: string, v: string, s: number) => `<c r="${ref}" t="inlineStr" s="${s}"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
  const rows: string[] = [];
  rows.push(`<row r="1">${t.headers.map((h, i) => str(`${col(i + 1)}1`, h, 1)).join("")}</row>`);
  t.rows.forEach((r, ri) => {
    const n = ri + 2;
    const cells = r.map((v, ci) => {
      if (v == null || v === "") return "";
      const ref = `${col(ci + 1)}${n}`;
      if (typeof v === "number" && Number.isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`;
      return str(ref, String(v), t.wrap?.[ci] ? 2 : 0);
    }).join("");
    rows.push(`<row r="${n}">${cells}</row>`);
  });
  const last = `${col(Math.max(1, t.headers.length))}${t.rows.length + 1}`;
  return HEAD + `<worksheet xmlns="${NS}" xmlns:r="${REL}">`
    + `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" xSplit="1" topLeftCell="B2" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>`
    + `<cols>${cols}</cols><sheetData>${rows.join("")}</sheetData><autoFilter ref="A1:${last}"/></worksheet>`;
}

const STYLES = HEAD + `<styleSheet xmlns="${NS}">`
  + `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>`
  + `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>`
  + `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>`
  + `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>`
  + `<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>`
  + `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>`
  + `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs>`
  + `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>`
  + `</styleSheet>`;

export function toXLSX(t: Table): Blob {
  const enc = new TextEncoder();
  const parts: [string, string][] = [
    ["[Content_Types].xml", HEAD + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
      + `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`
      + `<Default Extension="xml" ContentType="application/xml"/>`
      + `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`
      + `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
      + `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>`
      + `</Types>`],
    ["_rels/.rels", HEAD + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
      + `<Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", HEAD + `<workbook xmlns="${NS}" xmlns:r="${REL}"><sheets><sheet name="Responses" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", HEAD + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
      + `<Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/>`
      + `<Relationship Id="rId2" Type="${REL}/styles" Target="styles.xml"/></Relationships>`],
    ["xl/styles.xml", STYLES],
    ["xl/worksheets/sheet1.xml", sheetXml(t)],
  ];
  return zip(parts.map(([name, xml]) => ({ name, data: enc.encode(xml) })));
}
