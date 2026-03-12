import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("literature.db");
const JWT_SECRET = process.env.JWT_SECRET || "literature-secret-key";

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    phone_number TEXT UNIQUE,
    password TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    score INTEGER,
    total INTEGER,
    type TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

// Migration: Add profile_photo, about, and phone_number if they don't exist
const tableInfo = db.prepare("PRAGMA table_info(users)").all();
const columns = (tableInfo as any[]).map((c: any) => c.name);
if (!columns.includes("profile_photo")) {
  db.exec("ALTER TABLE users ADD COLUMN profile_photo TEXT");
}
if (!columns.includes("about")) {
  db.exec("ALTER TABLE users ADD COLUMN about TEXT");
}
if (!columns.includes("phone_number")) {
  db.exec("ALTER TABLE users ADD COLUMN phone_number TEXT UNIQUE");
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // Auth Middleware
  const authenticateToken = (req: any, res: any, next: any) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
      if (err) return res.sendStatus(403);
      if (!user || typeof user !== 'object' || !user.id) {
        return res.status(401).json({ error: "Invalid token payload" });
      }
      req.user = user;
      next();
    });
  };

  // Auth Routes
  app.post("/api/auth/signup", async (req, res) => {
    const { username, password, phone_number } = req.body;
    if (!username || !password || !phone_number) {
      return res.status(400).json({ error: "Username, password, and phone number are required" });
    }
    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      const stmt = db.prepare("INSERT INTO users (username, password, phone_number) VALUES (?, ?, ?)");
      const info = stmt.run(username, hashedPassword, phone_number);
      const userId = Number(info.lastInsertRowid);
      const token = jwt.sign({ id: userId, username }, JWT_SECRET);
      res.json({ token, user: { id: userId, username, phone_number, profile_photo: null, about: null } });
    } catch (error: any) {
      if (error.code === 'SQLITE_CONSTRAINT') {
        if (error.message.includes('username')) {
          res.status(400).json({ error: "Username already exists" });
        } else if (error.message.includes('phone_number')) {
          res.status(400).json({ error: "Phone number already registered" });
        } else {
          res.status(400).json({ error: "User already exists" });
        }
      } else {
        res.status(500).json({ error: "Server error" });
      }
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    const { identifier, password } = req.body; // identifier can be username or phone_number
    if (!identifier || !password) {
      return res.status(400).json({ error: "Identifier and password are required" });
    }
    
    const user: any = db.prepare("SELECT * FROM users WHERE username = ? OR phone_number = ?").get(identifier, identifier);
    if (!user) return res.status(400).json({ error: "User not found" });

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(400).json({ error: "Invalid password" });

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET);
    res.json({ token, user: { id: user.id, username: user.username, phone_number: user.phone_number, profile_photo: user.profile_photo, about: user.about } });
  });

  app.post("/api/auth/forgot-password", (req, res) => {
    const { username, phone_number } = req.body;
    if (!username || !phone_number) {
      return res.status(400).json({ error: "Username and phone number are required to verify identity" });
    }

    const user: any = db.prepare("SELECT id FROM users WHERE username = ? AND phone_number = ?").get(username, phone_number);
    if (!user) {
      return res.status(404).json({ error: "No user found with that username and phone number combination" });
    }

    res.json({ success: true, message: "Identity verified. You can now reset your password." });
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    const { username, phone_number, new_password } = req.body;
    if (!username || !phone_number || !new_password) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const user: any = db.prepare("SELECT id FROM users WHERE username = ? AND phone_number = ?").get(username, phone_number);
    if (!user) {
      return res.status(404).json({ error: "Identity verification failed" });
    }

    try {
      const hashedPassword = await bcrypt.hash(new_password, 10);
      db.prepare("UPDATE users SET password = ? WHERE id = ?").run(hashedPassword, user.id);
      res.json({ success: true, message: "Password reset successfully" });
    } catch (error) {
      res.status(500).json({ error: "Failed to reset password" });
    }
  });

  app.get("/api/user/profile", authenticateToken, (req: any, res) => {
    const user: any = db.prepare("SELECT id, username, profile_photo, about FROM users WHERE id = ?").get(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  });

  app.patch("/api/user/profile", authenticateToken, (req: any, res) => {
    const { username, profile_photo, about } = req.body;
    const userId = Number(req.user.id);
    
    try {
      const currentUser: any = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
      
      if (!currentUser) {
        console.error(`PATCH /api/user/profile: User ${userId} not found in database`);
        return res.status(404).json({ error: "User not found" });
      }

      // Check if username is taken if it's being changed
      if (username && username !== currentUser.username) {
        const existing: any = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
        if (existing && Number(existing.id) !== userId) {
          return res.status(400).json({ error: "Username already taken" });
        }
      }

      const stmt = db.prepare("UPDATE users SET username = ?, profile_photo = ?, about = ? WHERE id = ?");
      stmt.run(
        username !== undefined ? username : currentUser.username, 
        profile_photo !== undefined ? profile_photo : currentUser.profile_photo, 
        about !== undefined ? about : currentUser.about, 
        userId
      );
      
      const updatedUser = db.prepare("SELECT id, username, profile_photo, about FROM users WHERE id = ?").get(userId);
      res.json(updatedUser);
    } catch (error: any) {
      console.error("Profile update error:", error);
      res.status(500).json({ error: "Failed to update profile", details: error.message });
    }
  });

  // Score Routes
  app.post("/api/scores", authenticateToken, (req: any, res) => {
    const { score, total, type } = req.body;
    const stmt = db.prepare("INSERT INTO scores (user_id, score, total, type) VALUES (?, ?, ?, ?)");
    stmt.run(req.user.id, score, total, type);
    res.json({ success: true });
  });

  app.get("/api/scores", authenticateToken, (req: any, res) => {
    const scores = db.prepare("SELECT * FROM scores WHERE user_id = ? ORDER BY created_at DESC").all(req.user.id);
    res.json(scores);
  });

  app.get("/api/user/stats", authenticateToken, (req: any, res) => {
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total_quizzes,
        AVG(score * 100.0 / total) as avg_score,
        MAX(score * 100.0 / total) as high_score
      FROM scores 
      WHERE user_id = ?
    `).get(req.user.id);
    res.json(stats);
  });

  app.get("/api/leaderboard", (req, res) => {
    const leaderboard = db.prepare(`
      SELECT 
        u.username,
        COUNT(s.id) as total_quizzes,
        AVG(s.score * 100.0 / s.total) as avg_score,
        MAX(s.score * 100.0 / s.total) as high_score,
        SUM(s.score) as total_points
      FROM users u
      JOIN scores s ON u.id = s.user_id
      GROUP BY u.id
      ORDER BY total_points DESC, avg_score DESC
      LIMIT 10
    `).all();
    res.json(leaderboard);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
