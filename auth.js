// routes/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const db = require('../db/db');

// Login Page
router.get('/login', (req, res) => {
  res.render('login');
});

// Login POST
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);

    if (rows.length > 0) {
      const match = await bcrypt.compare(password, rows[0].password);

      if (match) {
        req.session.user = rows[0];
        return res.send('Login successful');
      }
    }

    res.send('Invalid credentials');
  } catch (err) {
    console.error(err);
    res.send('Server error');
  }
});

// Register Page
router.get('/register', (req, res) => {
  res.render('register');
});

// Register POST
router.post('/register', async (req, res) => {
  const { name, email, password, role } = req.body;

  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    await db.query('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)', [name, email, hashedPassword, role]);
    res.send('Registered successfully');
  } catch (err) {
    console.error(err);
    res.send('Registration error');
  }
});

module.exports = router;