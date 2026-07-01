const express = require('express');
const db = require('../db');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');

// Initialize Claude client with API key from environment
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

const ATS_RULES = `Use only round bullet points. No dash characters as bullets 
or inside sentences. ATS-clean layout, short summary, mirror the job's keywords 
where the candidate genuinely has the experience, never fabricate anything.`;

// Claude generation functions with updated model
const generateResume = async (candidate, jobDescription) => {
  const prompt = `CANDIDATE
Name: ${candidate.name}
Contact: ${candidate.contact || 'Not provided'}
Background:
${candidate.background}

JOB DESCRIPTION:
${jobDescription}

Write a tailored ATS resume. ${ATS_RULES}

Format the resume with these sections:
1. Professional Summary
2. Core Competencies
3. Professional Experience (with bullet points)
4. Education
5. Certifications (if applicable)

Use clear section headers and maintain ATS-friendly formatting.`;

  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022', // Updated to latest model
    max_tokens: 2500,
    messages: [{ role: 'user', content: prompt }]
  });

  return response.content[0].text;
};

const generateCoverLetter = async (candidate, jobDescription) => {
  const prompt = `CANDIDATE
Name: ${candidate.name}
Contact: ${candidate.contact || 'Not provided'}
Background:
${candidate.background}

JOB DESCRIPTION:
${jobDescription}

Write a focused 250-300 word cover letter. ${ATS_RULES}

The cover letter should:
- Address the specific company and role
- Highlight 2-3 key qualifications that match the job
- Show enthusiasm for the position
- Be professional and concise

Use a standard business letter format.`;

  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022', // Updated to latest model
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }]
  });

  return response.content[0].text;
};

const generateInterviewAnswer = async (candidate, jobDescription, question) => {
  const prompt = `CANDIDATE
Name: ${candidate.name}
Contact: ${candidate.contact || 'Not provided'}
Background:
${candidate.background}

JOB DESCRIPTION:
${jobDescription}

INTERVIEW QUESTION:
${question || 'Tell me about yourself and why you are interested in this role?'}

Write a strong, natural-sounding spoken answer that:
- Is grounded in the candidate's actual experience
- Demonstrates relevant skills and achievements
- Shows enthusiasm for the role
- Is conversational and authentic
- Should be about 1-2 minutes when spoken

Provide the answer as if the candidate is speaking directly to the interviewer.`;

  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022', // Updated to latest model
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }]
  });

  return response.content[0].text;
};

// Generate Resume
router.post('/resume/:candidateId', async (req, res) => {
  const { candidateId } = req.params;
  const { clerk_id, job_title, job_description } = req.body;

  if (!clerk_id || !job_description) {
    return res.status(400).json({ 
      error: 'clerk_id and job_description are required' 
    });
  }

  try {
    // Get user
    const [users] = await db.query(
      'SELECT id FROM users WHERE clerk_id = ?',
      [clerk_id]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get candidate
    const [candidates] = await db.query(
      'SELECT * FROM candidates WHERE id = ? AND user_id = ?',
      [candidateId, users[0].id]
    );

    if (candidates.length === 0) {
      return res.status(404).json({ error: 'Candidate not found' });
    }

    const candidate = candidates[0];

    // Generate resume
    const content = await generateResume(candidate, job_description);

    // Save document
    const [result] = await db.query(
      `INSERT INTO documents 
       (candidate_id, kind, job_title, job_description, content) 
       VALUES (?, ?, ?, ?, ?)`,
      [candidateId, 'resume', job_title || 'Untitled Position', job_description, content]
    );

    const [document] = await db.query(
      'SELECT * FROM documents WHERE id = ?',
      [result.insertId]
    );

    res.status(200).json({ 
      document: document[0],
      content,
      message: 'Resume generated successfully'
    });
  } catch (error) {
    console.error('Generate resume error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to generate resume' 
    });
  }
});

// Generate Cover Letter
router.post('/cover-letter/:candidateId', async (req, res) => {
  const { candidateId } = req.params;
  const { clerk_id, job_title, job_description } = req.body;

  if (!clerk_id || !job_description) {
    return res.status(400).json({ 
      error: 'clerk_id and job_description are required' 
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

    const [candidates] = await db.query(
      'SELECT * FROM candidates WHERE id = ? AND user_id = ?',
      [candidateId, users[0].id]
    );

    if (candidates.length === 0) {
      return res.status(404).json({ error: 'Candidate not found' });
    }

    const candidate = candidates[0];
    const content = await generateCoverLetter(candidate, job_description);

    const [result] = await db.query(
      `INSERT INTO documents 
       (candidate_id, kind, job_title, job_description, content) 
       VALUES (?, ?, ?, ?, ?)`,
      [candidateId, 'cover_letter', job_title || 'Untitled Position', job_description, content]
    );

    const [document] = await db.query(
      'SELECT * FROM documents WHERE id = ?',
      [result.insertId]
    );

    res.status(200).json({ 
      document: document[0],
      content,
      message: 'Cover letter generated successfully'
    });
  } catch (error) {
    console.error('Generate cover letter error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to generate cover letter' 
    });
  }
});

// Generate Interview Answer
router.post('/interview/:candidateId', async (req, res) => {
  const { candidateId } = req.params;
  const { clerk_id, job_title, job_description, question } = req.body;

  if (!clerk_id || !job_description) {
    return res.status(400).json({ 
      error: 'clerk_id and job_description are required' 
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

    const [candidates] = await db.query(
      'SELECT * FROM candidates WHERE id = ? AND user_id = ?',
      [candidateId, users[0].id]
    );

    if (candidates.length === 0) {
      return res.status(404).json({ error: 'Candidate not found' });
    }

    const candidate = candidates[0];
    const content = await generateInterviewAnswer(candidate, job_description, question);

    const [result] = await db.query(
      `INSERT INTO documents 
       (candidate_id, kind, job_title, job_description, content) 
       VALUES (?, ?, ?, ?, ?)`,
      [candidateId, 'interview', job_title || 'Untitled Position', job_description, content]
    );

    const [document] = await db.query(
      'SELECT * FROM documents WHERE id = ?',
      [result.insertId]
    );

    res.status(200).json({ 
      document: document[0],
      content,
      message: 'Interview answer generated successfully'
    });
  } catch (error) {
    console.error('Generate interview answer error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to generate interview answer' 
    });
  }
});

// Get generation history
router.get('/history/:candidateId', async (req, res) => {
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

    let query = 'SELECT * FROM documents WHERE candidate_id = ?';
    const params = [candidateId];

    if (kind) {
      query += ' AND kind = ?';
      params.push(kind);
    }

    query += ' ORDER BY created_at DESC';

    const [documents] = await db.query(query, params);

    res.status(200).json({ documents });
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;