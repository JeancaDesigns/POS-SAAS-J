// Excel (.xlsx) sin librerías: un .xlsx es un zip con unos XML. Se guarda sin comprimir (más simple
// y Excel lo abre igual). Cada hoja: { nombre, columnas: [{ titulo, ancho, tipo: 'texto'|'dinero'|'numero' }], filas: [[...]], total?: [...] }

const enc = new TextEncoder()
// Caracteres de control que Excel no acepta en el XML
const sinControl = s => [...s].filter(c => { const n = c.charCodeAt(0); return n >= 32 || n === 9 || n === 10 || n === 13 }).join('')
const esc = s => sinControl(String(s ?? '')).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const TABLA_CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(b) {
  let c = 0xFFFFFFFF
  for (let i = 0; i < b.length; i++) c = TABLA_CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8)
  return (c ^ 0xFFFFFFFF) >>> 0
}

function zip(archivos) { // [{ nombre, datos: Uint8Array }]
  const partes = [], central = []
  let offset = 0
  for (const a of archivos) {
    const nombre = enc.encode(a.nombre), crc = crc32(a.datos), n = a.datos.length
    const h = new DataView(new ArrayBuffer(30))
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true)
    h.setUint16(8, 0, true); h.setUint16(10, 0, true); h.setUint16(12, 0x21, true)
    h.setUint32(14, crc, true); h.setUint32(18, n, true); h.setUint32(22, n, true)
    h.setUint16(26, nombre.length, true); h.setUint16(28, 0, true)
    partes.push(new Uint8Array(h.buffer), nombre, a.datos)
    const c = new DataView(new ArrayBuffer(46))
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true)
    c.setUint16(10, 0, true); c.setUint16(12, 0, true); c.setUint16(14, 0x21, true)
    c.setUint32(16, crc, true); c.setUint32(20, n, true); c.setUint32(24, n, true)
    c.setUint16(28, nombre.length, true); c.setUint32(42, offset, true)
    central.push(new Uint8Array(c.buffer), nombre)
    offset += 30 + nombre.length + n
  }
  const tamCentral = central.reduce((s, x) => s + x.length, 0)
  const fin = new DataView(new ArrayBuffer(22))
  fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, archivos.length, true); fin.setUint16(10, archivos.length, true)
  fin.setUint32(12, tamCentral, true); fin.setUint32(16, offset, true)
  return new Blob([...partes, ...central, new Uint8Array(fin.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

const letra = i => { let s = ''; i++; while (i) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26) } return s }

// Estilos: 0 normal · 1 encabezado · 2 dinero · 3 total (negrita) · 4 total dinero · 5 número con decimales
function celda(v, ref, estilo) {
  if (v === null || v === undefined || v === '') return `<c r="${ref}"${estilo ? ` s="${estilo}"` : ''}/>`
  if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${estilo ? ` s="${estilo}"` : ''}><v>${v}</v></c>`
  return `<c r="${ref}" t="inlineStr"${estilo ? ` s="${estilo}"` : ''}><is><t xml:space="preserve">${esc(v)}</t></is></c>`
}

function hoja({ columnas, filas, total }) {
  const est = (col, esTotal) => {
    if (col.tipo === 'dinero') return esTotal ? 4 : 2
    if (col.tipo === 'numero') return esTotal ? 3 : 5
    return esTotal ? 3 : 0
  }
  const filasXml = [
    `<row r="1">${columnas.map((c, i) => celda(c.titulo, `${letra(i)}1`, 1)).join('')}</row>`,
    ...filas.map((f, r) => `<row r="${r + 2}">${columnas.map((c, i) => celda(f[i], `${letra(i)}${r + 2}`, est(c, false))).join('')}</row>`),
  ]
  if (total) {
    const r = filas.length + 2
    filasXml.push(`<row r="${r}">${columnas.map((c, i) => celda(total[i], `${letra(i)}${r}`, est(c, true))).join('')}</row>`)
  }
  const cols = columnas.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.ancho || 14}" customWidth="1"/>`).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${filasXml.join('')}</sheetData></worksheet>`
}

const ESTILOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0"/><numFmt numFmtId="165" formatCode="#,##0.##"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE4ECE9"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="6">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`

export function libroExcel(hojas) {
  const nombres = hojas.map((h, i) => esc(String(h.nombre || `Hoja ${i + 1}`).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31)))
  const archivos = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${nombres.map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', ESTILOS],
    ...hojas.map((h, i) => [`xl/worksheets/sheet${i + 1}.xml`, hoja(h)]),
  ]
  return zip(archivos.map(([nombre, txt]) => ({ nombre, datos: enc.encode(txt) })))
}

export function descargar(blob, nombre) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

export const descargarExcel = (hojas, nombre) => descargar(libroExcel(hojas), nombre.endsWith('.xlsx') ? nombre : `${nombre}.xlsx`)
