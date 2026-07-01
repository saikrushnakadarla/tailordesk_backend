const express = require('express');
const db = require('../db');
const router = express.Router();

// Get document by ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;
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
      `SELECT d.* FROM documents d
       JOIN candidates c ON d.candidate_id = c.id
       WHERE d.id = ? AND c.user_id = ?`,
      [id, users[0].id]
    );

    if (documents.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.status(200).json({ document: documents[0] });
  } catch (error) {
    console.error('Get document error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get all documents for a candidate
router.get('/candidate/:candidateId', async (req, res) => {
  const { candidateId } = req.params;
  const { clerk_id, kind } = req.query;

  try {
    const [users] = await db.query(
      'SELECT id FROM users WHERE clerk_id = ?',
      [clerk_id]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    let query = `SELECT d.* FROM documents d
                JOIN candidates c ON d.candidate_id = c.id
                WHERE d.candidate_id = ? AND c.user_id = ?`;
    const params = [candidateId, users[0].id];

    if (kind) {
      query += ' AND d.kind = ?';
      params.push(kind);
    }

    query += ' ORDER BY d.created_at DESC';

    const [documents] = await db.query(query, params);

    res.status(200).json({ documents });
  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Delete document
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const { clerk_id } = req.query;

  try {
    const [users] = await db.query(
      'SELECT id FROM users WHERE clerk_id = ?',
      [clerk_id]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const [result] = await db.query(
      `DELETE d FROM documents d
       JOIN candidates c ON d.candidate_id = c.id
       WHERE d.id = ? AND c.user_id = ?`,
      [id, users[0].id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.status(200).json({ message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;