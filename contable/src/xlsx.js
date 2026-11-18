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

// Estilos (índices de cellXfs): 0 normal · 1 encabezado · 2 dinero · 3 total texto · 4 total dinero
// 5 número · 6 fecha · 7 título del informe · 8 sección (negrita) · 9 total número
function celda(v, ref, estilo) {
  const s = estilo ? ` s="${estilo}"` : ''
  if (v === null || v === undefined || v === '') return `<c r="${ref}"${s}/>`
  if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${s}><v>${v}</v></c>`
  return `<c r="${ref}" t="inlineStr"${s}><is><t xml:space="preserve">${esc(v)}</t></is></c>`
}

// "AAAA-MM-DD" → número de serie de Excel (así se puede ordenar y filtrar por fecha)
const serieFecha = v => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v))
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000 + 25569 : v
}

function hoja({ columnas, filas, total, titulo }) {
  const desfase = titulo ? 2 : 0
  const est = (col, esTotal) => {
    if (col.tipo === 'dinero') return esTotal ? 4 : 2
    if (col.tipo === 'numero') return esTotal ? 9 : 5
    if (col.tipo === 'fecha') return esTotal ? 3 : 6
    return esTotal ? 3 : 0
  }
  const valor = (col, v) => (col.tipo === 'fecha' ? serieFecha(v) : v)
  // Filas de sección: texto en mayúsculas y lo demás vacío (ej. "INGRESOS")
  const esSeccion = f => typeof f[0] === 'string' && f[0].length > 1 && f[0] === f[0].toUpperCase() && f.slice(1).every(x => x === '' || x == null)
  const xml = []
  if (titulo) xml.push(`<row r="1" ht="22" customHeight="1">${celda(titulo, 'A1', 7)}</row>`)
  const h = desfase + 1
  xml.push(`<row r="${h}">${columnas.map((c, i) => celda(c.titulo, `${letra(i)}${h}`, 1)).join('')}</row>`)
  filas.forEach((f, k) => {
    const r = h + 1 + k
    xml.push(`<row r="${r}">${columnas.map((c, i) => celda(valor(c, f[i]), `${letra(i)}${r}`, esSeccion(f) ? 8 : est(c, false))).join('')}</row>`)
  })
  if (total) {
    const r = h + 1 + filas.length
    xml.push(`<row r="${r}">${columnas.map((c, i) => celda(valor(c, total[i]), `${letra(i)}${r}`, est(c, true))).join('')}</row>`)
  }
  const cols = columnas.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.ancho || 14}" customWidth="1"/>`).join('')
  const ultima = h + filas.length
  const filtro = filas.length && !titulo ? `<autoFilter ref="A${h}:${letra(columnas.length - 1)}${ultima}"/>` : ''
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="${h}" topLeftCell="A${h + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${xml.join('')}</sheetData>${filtro}<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`
}

const ESTILOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0;[Red]-&quot;$&quot;#,##0"/><numFmt numFmtId="165" formatCode="#,##0.##"/><numFmt numFmtId="166" formatCode="dd/mm/yyyy"/></numFmts>
<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><color rgb="FF173A31"/><name val="Calibri"/></font></fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF173A31"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF1EDE4"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="3"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="hair"><color rgb="FFD9D3C7"/></bottom><diagonal/></border><border><left/><right/><top style="thin"><color rgb="FF173A31"/></top><bottom style="double"><color rgb="FF173A31"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="10">
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment vertical="center"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="2" xfId="0" applyFont="1" applyBorder="1"/>
<xf numFmtId="164" fontId="2" fillId="0" borderId="2" xfId="0" applyFont="1" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"><alignment horizontal="left"/></xf>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="165" fontId="2" fillId="0" borderId="2" xfId="0" applyFont="1" applyNumberFormat="1" applyBorder="1"/>
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
