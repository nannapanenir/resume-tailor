// Renders a tailored career profile (already merged with accepted change
// text on the client) into a clean, ATS-friendly .docx file. Plain
// paragraphs/headings only — no tables, text boxes, or multi-column
// layouts, since those are the layout patterns that most commonly break
// ATS resume parsers.

const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx');

function heading(text) {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 120 } });
}

function buildResumeDocx(profile) {
  const personal = profile.personalInformation || {};
  const children = [];

  children.push(new Paragraph({
    children: [new TextRun({ text: personal.fullName || '', bold: true, size: 32 })],
    spacing: { after: 80 },
  }));

  const contactLine = [personal.email, personal.phone, personal.location, personal.linkedIn]
    .filter(Boolean).join('  |  ');
  if (contactLine) {
    children.push(new Paragraph({ children: [new TextRun({ text: contactLine, size: 20 })], spacing: { after: 200 } }));
  }

  if (profile.summary && profile.summary.text) {
    children.push(heading('Summary'));
    children.push(new Paragraph({ text: profile.summary.text, spacing: { after: 120 } }));
  }

  if (Array.isArray(profile.skills) && profile.skills.length) {
    children.push(heading('Skills'));
    children.push(new Paragraph({ text: profile.skills.map((s) => s.name).join(', '), spacing: { after: 120 } }));
  }

  if (Array.isArray(profile.experience) && profile.experience.length) {
    children.push(heading('Experience'));
    profile.experience.forEach((exp) => {
      children.push(new Paragraph({
        children: [
          new TextRun({ text: `${exp.title || ''} — ${exp.company || ''}`, bold: true }),
        ],
        spacing: { before: 160, after: 20 },
      }));
      const dateLine = [`${exp.startDate || ''} – ${exp.endDate || ''}`, exp.location].filter(Boolean).join('  |  ');
      if (dateLine.trim()) {
        children.push(new Paragraph({ children: [new TextRun({ text: dateLine, italics: true, size: 20 })], spacing: { after: 60 } }));
      }
      (exp.bullets || []).forEach((b) => {
        children.push(new Paragraph({ text: b.text, bullet: { level: 0 }, spacing: { after: 40 } }));
      });
    });
  }

  if (Array.isArray(profile.education) && profile.education.length) {
    children.push(heading('Education'));
    profile.education.forEach((e) => {
      children.push(new Paragraph({ text: `${e.degree || ''}, ${e.institution || ''}${e.endDate ? ' (' + e.endDate + ')' : ''}`, spacing: { after: 40 } }));
    });
  }

  if (Array.isArray(profile.certifications) && profile.certifications.length) {
    children.push(heading('Certifications'));
    profile.certifications.forEach((c) => {
      const line = [c.name, c.issuer, c.year].filter(Boolean).join(' — ');
      children.push(new Paragraph({ text: line, spacing: { after: 40 } }));
    });
  }

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

module.exports = { buildResumeDocx };
