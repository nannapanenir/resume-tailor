// Extracts raw text from an uploaded resume file so it can be sent to the
// AI provider for structured extraction. No OCR: scanned/image-only PDFs
// with no embedded text layer will yield little or no text.

const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

// Real PDFs start with "%PDF-"; real .docx files are ZIP archives starting
// with "PK". A mismatch means the file's extension lies about its actual
// content (e.g. an HTML export renamed to .pdf), which otherwise surfaces
// as a cryptic parser error deep inside pdf-parse/mammoth.
function checkSignature(buffer, filename) {
  const head = buffer.slice(0, 8).toString('latin1');
  if (filename.endsWith('.pdf') && !head.startsWith('%PDF-')) {
    throw new Error(`"${filename}" doesn't look like a real PDF (its content doesn't start with the PDF file signature). It may be an HTML export or another format renamed to .pdf — try re-exporting/re-saving it as an actual PDF.`);
  }
  if (filename.endsWith('.docx') && !(buffer[0] === 0x50 && buffer[1] === 0x4b)) {
    throw new Error(`"${filename}" doesn't look like a real .docx file (its content doesn't start with the ZIP file signature .docx files use). Try re-saving it from Word/Google Docs as .docx.`);
  }
}

async function extractResumeText(buffer, filename) {
  const name = filename.toLowerCase();
  checkSignature(buffer, name);
  if (name.endsWith('.pdf')) {
    const result = await pdfParse(buffer);
    return result.text;
  }
  if (name.endsWith('.docx')) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  throw new Error('Unsupported file type. Please upload a .pdf or .docx resume.');
}

module.exports = { extractResumeText };
