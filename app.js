const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const mysql = require('mysql');
const bcrypt = require('bcrypt');
const path = require('path');

const app = express();
const port = 3000;

const multer = require('multer');

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    const uniqueName = Date.now() + '-' + file.originalname;
    cb(null, uniqueName);
  }
});

const upload = multer({ storage: storage });

// MySQL connection
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '12345abhinav', // your MySQL password
  database: 'localdatabase'
});

db.connect(err => {
  if (err) throw err;
  console.log('Connected to MySQL!');
});

// Middleware
app.use(session({
  secret: 'pixelforge_secret',
  resave: false,
  saveUninitialized: true
}));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes (will add later)
app.get('/', (req, res) => {
  res.redirect('/login');
});

// Render login and register page
app.get('/login', (req, res) => {
  res.render('login');
});

app.get('/register', (req, res) => {
  res.render('register');
});

// Handle Add Project
// For adding a project
app.post('/add-project', (req, res) => {
    console.log('Received project data:', req.body);  // <== Add this

    const { name, description } = req.body;
    db.query('INSERT INTO projects (name, description) VALUES (?, ?)', [name, description], (err, result) => {
        if (err) {
            console.error('Insert error:', err);
            return res.status(500).send('DB error');
        }
        res.redirect('/dashboard_admin');
    });
});

app.post('/upload', upload.single('document'), (req, res) => {
    const { project_id } = req.body;
    const filename = req.file.filename;
    const uploaded_by = req.session.user.id; // <-- THIS LINE

    const sql = 'INSERT INTO documents (filename, project_id, uploaded_by) VALUES (?, ?, ?)';
    db.query(sql, [filename, project_id, uploaded_by], (err, result) => {
        if (err) {
            console.error('Database Error during file upload:', err);
            return res.send('Database error');
        }
        res.redirect('/dashboard_admin');
    });
});

// For adding a user
app.post('/add-user', async (req, res) => {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password || !role) {
        return res.status(400).send('All fields are required.');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const query = 'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)';
    db.query(query, [name, email, hashedPassword, role], (err) => {
        if (err) {
            console.error('Error inserting user:', err);
            return res.status(500).send('Database error');
        }
        res.redirect('/dashboard_admin');
    });
});

// Handle Delete Project
app.post('/delete-project', (req, res) => {
    const { project_id } = req.body;

    // Delete related documents first (foreign key constraints)
    const deleteDocsQuery = 'DELETE FROM documents WHERE project_id = ?';
    db.query(deleteDocsQuery, [project_id], (err) => {
        if (err) {
            console.error('Error deleting documents:', err);
            return res.send('Database error while deleting documents.');
        }

        // Then delete project assignments
        const deleteAssignQuery = 'DELETE FROM project_assignments WHERE project_id = ?';
        db.query(deleteAssignQuery, [project_id], (err) => {
            if (err) {
                console.error('Error deleting project assignments:', err);
                return res.send('Database error while deleting project assignments.');
            }

            // Finally delete the project
            const deleteProjectQuery = 'DELETE FROM projects WHERE id = ?';
            db.query(deleteProjectQuery, [project_id], (err) => {
                if (err) {
                    console.error('Error deleting project:', err);
                    return res.send('Database error while deleting project.');
                }

                res.redirect('/dashboard_admin');
            });
        });
    });
});

// Admin Dashboard
app.get('/dashboard_admin', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.redirect('/login');
    }

    db.query('SELECT * FROM projects', (err, results) => {
        if (err) {
            console.error('Error fetching projects:', err);
            return res.status(500).send('Database error');
        }

        res.render('dashboard_admin', {
            user: req.session.user,
            projects: results
        });
    });
});

// Lead Dashboard
app.get('/dashboard_lead', (req, res) => {
  if (req.session.user && req.session.user.role === 'lead') {
    const fetchDevelopers = 'SELECT id, username FROM users WHERE role = "developer"';
    const fetchProjects = 'SELECT id, name FROM projects';

    db.query(fetchDevelopers, (err, devs) => {
      if (err) return res.status(500).send('Error fetching developers');
      db.query(fetchProjects, (err, projects) => {
        if (err) return res.status(500).send('Error fetching projects');

        res.render('dashboard_lead', {
          username: req.session.user.username,
          developers: devs,
          projects: projects
        });
      });
    });
  } else {
    res.send('Unauthorized access.');
  }
});

// Developer Dashboard
app.get('/dashboard_developer', (req, res) => {
  if (req.session.user && req.session.user.role === 'developer') {
    res.render('dashboard_developer', { username: req.session.user.username });
  } else {
    res.send('Unauthorized access.');
  }
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// Handle registration (anyone can register)
app.post('/register', async (req, res) => {
  const { username, email, password, role } = req.body;

  const hashedPassword = await bcrypt.hash(password, 10);
  db.query(
    'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
    [username, email, hashedPassword, role],
    (err) => {
      if (err) {
        console.log(err);
        return res.send('Error: Username or email may already exist.');
      }
      res.send('Registration successful. You can now <a href="/login" class="text-blue-400">login</a>.');
    }
  );
});

// Handle login
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.query('SELECT * FROM users WHERE username = ?', [username], async (err, results) => {
    if (err) throw err;
    if (results.length === 0) return res.send('User not found.');

    const match = await bcrypt.compare(password, results[0].password);
    if (match) {
      req.session.user = results[0];
      const role = results[0].role;
      if (role === 'admin') res.redirect('/dashboard_admin');
      else if (role === 'lead') res.redirect('/dashboard_lead');
      else res.redirect('/dashboard_developer');
    } else {
      res.send('Incorrect password.');
    }
  });
});

app.post('/assign_developer', (req, res) => {
  const { project_id, developer_id } = req.body;

  if (!req.session.user || req.session.user.role !== 'lead') {
    return res.send('Unauthorized');
  }

  // Prevent duplicate assignment
  const checkQuery = 'SELECT * FROM project_assignments WHERE user_id = ? AND project_id = ?';
  db.query(checkQuery, [developer_id, project_id], (err, results) => {
    if (err) return res.status(500).send('Database error');
    if (results.length > 0) return res.send('This developer is already assigned to this project.');

    const insertQuery = 'INSERT INTO project_assignments (user_id, project_id) VALUES (?, ?)';
    db.query(insertQuery, [developer_id, project_id], (err) => {
      if (err) return res.status(500).send('Error assigning developer');
      res.redirect('/dashboard_lead');
    });
  });
});


// Start server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
