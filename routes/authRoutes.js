const express = require('express');
const db = require('../db');
const router = express.Router();

// Sync user from Clerk webhook
router.post('/webhook', async (req, res) => {
  const { data } = req.body;
  
  if (!data || !data.id) {
    return res.status(400).json({ error: 'Invalid webhook data' });
  }

  try {
    const clerkId = data.id;
    const email = data.email_addresses?.[0]?.email_address || '';
    const fullName = `${data.first_name || ''} ${data.last_name || ''}`.trim() || 'User';

    // Check if user exists
    const [existing] = await db.query(
      'SELECT * FROM users WHERE clerk_id = ?',
      [clerkId]
    );

    let user;
    if (existing.length > 0) {
      // Update existing user
      await db.query(
        `UPDATE users SET email = ?, full_name = ? WHERE clerk_id = ?`,
        [email, fullName, clerkId]
      );
      const [updated] = await db.query(
        'SELECT * FROM users WHERE clerk_id = ?',
        [clerkId]
      );
      user = updated[0];
    } else {
      // Create new user
      const [result] = await db.query(
        `INSERT INTO users (clerk_id, email, full_name) VALUES (?, ?, ?)`,
        [clerkId, email, fullName]
      );
      const [newUser] = await db.query(
        'SELECT * FROM users WHERE id = ?',
        [result.insertId]
      );
      user = newUser[0];
    }

    res.status(200).json({ success: true, user });
  } catch (error) {
    console.error('Auth webhook error:', error);
    res.status(500).json({ error: 'Failed to process authentication' });
  }
});

// Get current user
router.get('/me/:clerkId', async (req, res) => {
  const { clerkId } = req.params;

  try {
    const [users] = await db.query(
      'SELECT * FROM users WHERE clerk_id = ?',
      [clerkId]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.status(200).json({ user: users[0] });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;