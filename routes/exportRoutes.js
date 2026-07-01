const express = require('express');
const db = require('../db');
const router = express.Router();
const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = require('docx');

// Generate DOCX export
router.get('/docx/:documentId', async (req, res) => {
  const { documentId } = req.params;
  const { clerk_id } = req.query;

  try {
    // Get user
    const [users] = await db.query(
      'SELECT id FROM users WHERE clerk_id = ?',
      [clerk_id]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get document with ownership check
    const [documents] = await db.query(
      `SELECT d.*, c.name as candidate_name 
       FROM documents d
       JOIN candidates c ON d.candidate_id = c.id
       WHERE d.id = ? AND c.user_id = ?`,
      [documentId, users[0].id]
    );

    if (documents.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const document = documents[0];
    const content = document.content;
    const lines = content.split('\n').filter(line => line.trim());

    // Build DOCX
    const paragraphs = lines.map(line => {
      const trimmed = line.trim();
      
      // Check if header (all caps or ends with :)
      const isHeader = (trimmed === trimmed.toUpperCase() && trimmed.length > 3) || 
                       trimmed.endsWith(':');
      
      // Check if bullet point
      const isBullet = trimmed.startsWith('•') || 
                       trimmed.startsWith('-') || 
                       trimmed.startsWith('*');

      const text = isBullet ? trimmed.substring(1).trim() : trimmed;

      return new Paragraph({
        text: text,
        heading: isHeader ? HeadingLevel.HEADING_2 : undefined,
        bullet: isBullet ? { level: 0 } : undefined,
        alignment: AlignmentType.LEFT,
        spacing: {
          before: isHeader ? 200 : 100,
          after: isHeader ? 100 : 100,
        },
        children: [
          new TextRun({
            text: text,
            font: "Calibri",
            size: isHeader ? 26 : 22,
            bold: isHeader,
          })
        ]
      });
    });

    // Create document with header
    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: `${document.kind.replace('_', ' ').toUpperCase()} - ${document.candidate_name}`,
                font: "Calibri",
                size: 32,
                bold: true,
              })
            ],
            alignment: AlignmentType.CENTER,
            spacing: {
              before: 400,
              after: 200,
            }
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Generated: ${new Date(document.created_at).toLocaleString()}`,
                font: "Calibri",
                size: 20,
              })
            ],
            alignment: AlignmentType.CENTER,
            spacing: {
              after: 400,
            }
          }),
          ...paragraphs
        ]
      }]
    });

    const buffer = await Packer.toBuffer(doc);

    // Set response headers for download
    const fileName = `${document.kind}_${document.candidate_name}_${Date.now()}.docx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(buffer);

  } catch (error) {
    console.error('Export DOCX error:', error);
    res.status(500).json({ error: 'Failed to export document' });
  }
});

// Get document content as plain text
router.get('/text/:documentId', async (req, res) => {
  const { documentId } = req.params;
  const { clerk_id } = req.query;

  try {
    const [users] = await db.query(
      'SELECT id FROM users WHERE clerk_id = ?',
      [clerk_id]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const [documents] = await db.query(
      `SELECT d.* 
       FROM documents d
       JOIN candidates c ON d.candidate_id = c.id
       WHERE d.id = ? AND c.user_id = ?`,
      [documentId, users[0].id]
    );

    if (documents.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.status(200).json({ 
      content: documents[0].content,
      document: documents[0]
    });
  } catch (error) {
    console.error('Get text error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;