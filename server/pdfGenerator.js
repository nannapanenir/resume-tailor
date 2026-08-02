// Renders a tailored career profile (already merged with accepted change
// text on the client) into a clean, ATS-friendly PDF. Single column, no
// tables/text boxes — the same layout patterns pdf-parse-style ATS
// systems most reliably read, mirroring docxGenerator.js.

const PDFDocument = require('pdfkit');

function buildResumePdf(profile) {
  return new Promise((resolve, reject) => {
    const personal = profile.personalInformation || {};
    const doc = new PDFDocument({ size: 'LETTER', margin: 54 });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.font('Helvetica-Bold').fontSize(18).text(personal.fullName || '', { continued: false });
    const contactLine = [personal.email, personal.phone, personal.location, personal.linkedIn]
      .filter(Boolean).join('  |  ');
    if (contactLine) {
      doc.moveDown(0.2);
      doc.font('Helvetica').fontSize(10).fillColor('#444').text(contactLine);
      doc.fillColor('#000');
    }

    const heading = (text) => {
      doc.moveDown(0.8);
      doc.font('Helvetica-Bold').fontSize(13).text(text);
      doc.moveDown(0.2);
    };

    if (profile.summary && profile.summary.text) {
      heading('Summary');
      doc.font('Helvetica').fontSize(11).text(profile.summary.text);
    }

    if (Array.isArray(profile.skills) && profile.skills.length) {
      heading('Skills');
      doc.font('Helvetica').fontSize(11).text(profile.skills.map((s) => s.name).join(', '));
    }

    if (Array.isArray(profile.experience) && profile.experience.length) {
      heading('Experience');
      profile.experience.forEach((exp, i) => {
        if (i > 0) doc.moveDown(0.5);
        doc.font('Helvetica-Bold').fontSize(11).text(`${exp.title || ''} — ${exp.company || ''}`);
        const dateLine = [`${exp.startDate || ''} - ${exp.endDate || ''}`, exp.location].filter(Boolean).join('  |  ');
        if (dateLine.trim()) {
          doc.font('Helvetica-Oblique').fontSize(10).fillColor('#444').text(dateLine);
          doc.fillColor('#000');
        }
        doc.moveDown(0.15);
        (exp.bullets || []).forEach((b) => {
          doc.font('Helvetica').fontSize(11).text(`•  ${b.text}`, { indent: 10 });
        });
      });
    }

    if (Array.isArray(profile.education) && profile.education.length) {
      heading('Education');
      profile.education.forEach((e) => {
        doc.font('Helvetica').fontSize(11).text(`${e.degree || ''}, ${e.institution || ''}${e.endDate ? ' (' + e.endDate + ')' : ''}`);
      });
    }

    if (Array.isArray(profile.certifications) && profile.certifications.length) {
      heading('Certifications');
      profile.certifications.forEach((c) => {
        doc.font('Helvetica').fontSize(11).text([c.name, c.issuer, c.year].filter(Boolean).join(' — '));
      });
    }

    doc.end();
  });
}

module.exports = { buildResumePdf };
