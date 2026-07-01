const express = require('express');
const db = require('../db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['.pdf', '.docx', '.txt'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedTypes.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only PDF, DOCX, and TXT are allowed.'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: fileFilter
});

// Parse resume file
const parseResumeFile = async (filePath, originalName) => {
  const ext = path.extname(originalName).toLowerCase();
  const buffer = fs.readFileSync(filePath);

  if (ext === '.pdf') {
    const data = await pdfParse(buffer);
    return data.text;
  } else if (ext === '.docx') {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  } else if (ext === '.txt') {
    return buffer.toString('utf-8');
  } else {
    throw new Error('Unsupported file format');
  }
};

// Create candidate
router.post('/', async (req, res) => {
  const { clerk_id, name, contact, background } = req.body;

  if (!clerk_id || !name || !background) {
    return res.status(400).json({ 
      error: 'clerk_id, name, and background are required' 
    });
  }

  try {
    const [users] = await db.query(
      'SELECT id FROM users WHERE clerk_id = ?',
      [clerk_id]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userId = users[0].id;

    const [result] = await db.query(
      `INSERT INTO candidates (user_id, name, contact, background) 
       VALUES (?, ?, ?, ?)`,
      [userId, name, contact || null, background]
    );

    const [candidate] = await db.query(
      'SELECT * FROM candidates WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json({ candidate: candidate[0] });
  } catch (error) {
    console.error('Create candidate error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Upload and parse resume
router.post('/:id/upload-resume', upload.single('resume'), async (req, res) => {
  const { id } = req.params;
  const { clerk_id } = req.body;

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    const [users] = await db.query(
      'SELECT id FROM users WHERE clerk_id = ?',
      [clerk_id]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userId = users[0].id;

    const [candidates] = await db.query(
      'SELECT * FROM candidates WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (candidates.length === 0) {
      fs.unlinkSync(req.file.path);
      return res.status(403).json({ error: 'Access denied' });
    }

    const parsedText = await parseResumeFile(req.file.path, req.file.originalname);

    await db.query(
      `UPDATE candidates 
       SET background = ?, resume_file_url = ?, resume_original_name = ? 
       WHERE id = ?`,
      [parsedText, `/uploads/${req.file.filename}`, req.file.originalname, id]
    );

    const [updatedCandidate] = await db.query(
      'SELECT * FROM candidates WHERE id = ?',
      [id]
    );

    res.status(200).json({ 
      candidate: updatedCandidate[0],
      parsed_text: parsedText,
      message: 'Resume uploaded and parsed successfully'
    });
  } catch (error) {
    console.error('Upload resume error:', error);
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupError) {
        console.error('Cleanup error:', cleanupError);
      }
    }
    res.status(500).json({ error: error.message || 'Failed to upload and parse resume' });
  }
});

// Get all candidates for user
router.get('/user/:clerkId', async (req, res) => {
  const { clerkId } = req.params;

  try {
    const [users] = await db.query(
      'SELECT id FROM users WHERE clerk_id = ?',
      [clerkId]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const [candidates] = await db.query(
      'SELECT * FROM candidates WHERE user_id = ? ORDER BY created_at DESC',
      [users[0].id]
    );

    res.status(200).json({ candidates });
  } catch (error) {
    console.error('Get candidates error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get candidate by ID
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

    const [candidates] = await db.query(
      'SELECT * FROM candidates WHERE id = ? AND user_id = ?',
      [id, users[0].id]
    );

    if (candidates.length === 0) {
      return res.status(404).json({ error: 'Candidate not found' });
    }

    res.status(200).json({ candidate: candidates[0] });
  } catch (error) {
    console.error('Get candidate error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Update candidate
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { clerk_id, name, contact, background } = req.body;

  try {
    const [users] = await db.query(
      'SELECT id FROM users WHERE clerk_id = ?',
      [clerk_id]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updates = [];
    const values = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }
    if (contact !== undefined) {
      updates.push('contact = ?');
      values.push(contact);
    }
    if (background !== undefined) {
      updates.push('background = ?');
      values.push(background);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id, users[0].id);

    const [result] = await db.query(
      `UPDATE candidates SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`,
      values
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Candidate not found' });
    }

    const [candidate] = await db.query(
      'SELECT * FROM candidates WHERE id = ?',
      [id]
    );

    res.status(200).json({ candidate: candidate[0] });
  } catch (error) {
    console.error('Update candidate error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Delete candidate
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
      'DELETE FROM candidates WHERE id = ? AND user_id = ?',
      [id, users[0].id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Candidate not found' });
    }

    res.status(200).json({ message: 'Candidate deleted successfully' });
  } catch (error) {
    console.error('Delete candidate error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;