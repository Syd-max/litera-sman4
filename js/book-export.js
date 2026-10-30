const columns = [
  ["title", "Judul", 32], ["authors", "Penulis", 26], ["isbn", "ISBN", 18], ["publisher", "Penerbit", 24],
  ["publish_year", "Tahun terbit", 12, "Number"], ["category", "Kategori", 22], ["synopsis", "Sinopsis", 60],
  ["total_stock", "Total stok", 12, "Number"], ["available_stock", "Stok tersedia", 14, "Number"],
  ["shelf_location", "Lokasi rak", 14], ["inventory_number", "Nomor induk", 18], ["classification", "Klasifikasi", 16],
  ["acquisition_source", "Sumber perolehan", 22], ["source_note", "Keterangan", 30], ["created_at", "Tanggal ditambahkan", 18, "Date"]
];

const clean = (value) => String(value ?? "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
const validDate = (value) => { const date = value ? new Date(value) : null; return date && !Number.isNaN(date.getTime()) ? date : ""; };
const formatDate = (date) => new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
const csvCell = (value) => `"${clean(value instanceof Date ? formatDate(value) : value).replace(/"/g, '""')}"`;
const xmlCell = (value) => clean(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function bookExportRows(books) {
  return books.map((book) => ({
    title: book.title, authors: book.authors, isbn: book.isbn, publisher: book.publisher, publish_year: book.publish_year,
    category: book.category?.name || "", synopsis: book.synopsis, total_stock: Number(book.total_stock || 0),
    available_stock: Number(book.available_stock || 0), shelf_location: book.shelf_location, inventory_number: book.inventory_number,
    classification: book.classification, acquisition_source: book.acquisition_source, source_note: book.source_note,
    created_at: validDate(book.created_at)
  }));
}

export function createBooksCsv(books) {
  const rows = bookExportRows(books);
  const data = [columns.map(([, label]) => label), ...rows.map((row) => columns.map(([key]) => row[key]))];
  return `\uFEFFsep=;\r\n${data.map((row) => row.map(csvCell).join(";")).join("\r\n")}`;
}

const columnName = (index) => {
  let result = "";
  for (let value = index + 1; value; value = Math.floor((value - 1) / 26)) result = String.fromCharCode(65 + ((value - 1) % 26)) + result;
  return result;
};
const excelDate = (date) => (date.getTime() - Date.UTC(1899, 11, 30)) / 86400000;

function xlsxCell(value, rowIndex, columnIndex, type, header = false) {
  const reference = `${columnName(columnIndex)}${rowIndex}`;
  if (header) return `<c r="${reference}" s="1" t="inlineStr"><is><t>${xmlCell(value)}</t></is></c>`;
  if (type === "Number" && Number.isFinite(Number(value))) return `<c r="${reference}" s="2"><v>${Number(value)}</v></c>`;
  if (type === "Date" && value instanceof Date) return `<c r="${reference}" s="3"><v>${excelDate(value)}</v></c>`;
  return `<c r="${reference}" s="2" t="inlineStr"><is><t xml:space="preserve">${xmlCell(value)}</t></is></c>`;
}

function worksheetXml(rows) {
  const lastColumn = columnName(columns.length - 1);
  const lastRow = rows.length + 1;
  const widths = columns.map(([, , width], index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("");
  const header = columns.map(([, label], index) => xlsxCell(label, 1, index, "String", true)).join("");
  const body = rows.map((row, rowOffset) => `<row r="${rowOffset + 2}">${columns.map(([key, , , type = "String"], index) => xlsxCell(row[key], rowOffset + 2, index, type)).join("")}</row>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><dimension ref="A1:${lastColumn}${lastRow}"/><sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/><cols>${widths}</cols><sheetData><row r="1" ht="26" customHeight="1">${header}</row>${body}</sheetData><autoFilter ref="A1:${lastColumn}${lastRow}"/><tableParts count="1"><tablePart r:id="rId1"/></tableParts></worksheet>`;
}

function tableXml(rowCount) {
  const lastColumn = columnName(columns.length - 1);
  const lastRow = rowCount + 1;
  const tableColumns = columns.map(([, label], index) => `<tableColumn id="${index + 1}" name="${xmlCell(label)}"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="1" name="DataBukuTable" displayName="DataBukuTable" ref="A1:${lastColumn}${lastRow}" totalsRowShown="0"><autoFilter ref="A1:${lastColumn}${lastRow}"/><tableColumns count="${columns.length}">${tableColumns}</tableColumns><tableStyleInfo name="TableStyleMedium2" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/></table>`;
}

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="10"/><name val="Arial"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="10"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F4DA8"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FFD9E3EF"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="14" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

function workbookFiles(rows) {
  const now = new Date().toISOString();
  return {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/tables/table1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`,
    "docProps/app.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>LITERA</Application><AppVersion>1.0</AppVersion></Properties>`,
    "docProps/core.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>LITERA</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created></cp:coreProperties>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets><sheet name="Data Buku" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    "xl/styles.xml": stylesXml,
    "xl/worksheets/sheet1.xml": worksheetXml(rows),
    "xl/worksheets/_rels/sheet1.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/table" Target="../tables/table1.xml"/></Relationships>`,
    "xl/tables/table1.xml": tableXml(rows.length)
  };
}

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? (0xEDB88320 ^ (crc >>> 1)) : (crc >>> 1);
  return crc >>> 0;
});
function crc32(bytes) { let crc = 0xFFFFFFFF; for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xFF] ^ (crc >>> 8); return (crc ^ 0xFFFFFFFF) >>> 0; }
const zipHeader = (length) => new Uint8Array(length);
const write16 = (bytes, offset, value) => new DataView(bytes.buffer).setUint16(offset, value, true);
const write32 = (bytes, offset, value) => new DataView(bytes.buffer).setUint32(offset, value >>> 0, true);
const joinBytes = (chunks) => { const output = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0)); let offset = 0; for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; } return output; };

function createZip(files) {
  const encoder = new TextEncoder();
  const localChunks = [];
  const centralChunks = [];
  let localOffset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(content);
    const crc = crc32(data);
    const local = zipHeader(30);
    write32(local, 0, 0x04034B50); write16(local, 4, 20); write16(local, 6, 0x0800); write16(local, 8, 0); write32(local, 14, crc); write32(local, 18, data.length); write32(local, 22, data.length); write16(local, 26, nameBytes.length);
    localChunks.push(local, nameBytes, data);
    const central = zipHeader(46);
    write32(central, 0, 0x02014B50); write16(central, 4, 20); write16(central, 6, 20); write16(central, 8, 0x0800); write16(central, 10, 0); write32(central, 16, crc); write32(central, 20, data.length); write32(central, 24, data.length); write16(central, 28, nameBytes.length); write32(central, 42, localOffset);
    centralChunks.push(central, nameBytes);
    localOffset += local.length + nameBytes.length + data.length;
  }
  const centralBytes = joinBytes(centralChunks);
  const end = zipHeader(22);
  const count = Object.keys(files).length;
  write32(end, 0, 0x06054B50); write16(end, 8, count); write16(end, 10, count); write32(end, 12, centralBytes.length); write32(end, 16, localOffset);
  return joinBytes([...localChunks, centralBytes, end]);
}

export function createBooksXlsx(books) { return createZip(workbookFiles(bookExportRows(books))); }

function download(content, type, filename) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
export function downloadBooksCsv(books, filename) { download(createBooksCsv(books), "text/csv;charset=utf-8", filename); }
export function downloadBooksSpreadsheet(books, filename) { download(createBooksXlsx(books), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename); }
