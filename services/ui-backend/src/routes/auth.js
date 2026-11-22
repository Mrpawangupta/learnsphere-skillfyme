import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getJwtSecret } from '../utils/config.js';
import { query } from '../utils/db.js';

const JWT_EXPIRES = '7d';
const BCRYPT_ROUNDS = 10;

// Login only needs a non-empty password: any wrong password must return 401, not 400.
const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const RegisterSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8),
});

// Compared against when the email is unknown, so unknown-email and
// wrong-password logins take about the same time.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);

// PostgreSQL-backed user store. Tests pass an in-memory store instead.
export const pgUserStore = {
  async findByEmail(email) {
    const { rows } = await query(
      'SELECT id, name, email, password_hash, role FROM users WHERE LOWER(email) = LOWER($1)',
      [email],
    );
    return rows[0] || null;
  },
  async create({ name, email, passwordHash }) {
    const { rows } = await query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email, role',
      [name, email, passwordHash],
    );
    return rows[0];
  },
};

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role });

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, role: user.role }, getJwtSecret(), {
    expiresIn: JWT_EXPIRES,
  });
}

function handleError(err, res, next) {
  if (err.name === 'ZodError') {
    return res.status(400).json({ error: 'Validation failed', issues: err.issues });
  }
  return next(err);
}

export function createAuthRouter(users = pgUserStore) {
  const router = Router();

  router.post('/login', async (req, res, next) => {
    try {
      const body = LoginSchema.parse(req.body);
      const user = await users.findByEmail(body.email);
      const ok = await bcrypt.compare(body.password, user ? user.password_hash : DUMMY_HASH);
      if (!user || !ok) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }
      return res.json({ user: publicUser(user), token: signToken(user) });
    } catch (err) {
      return handleError(err, res, next);
    }
  });

  router.post('/register', async (req, res, next) => {
    try {
      const body = RegisterSchema.parse(req.body);
      if (await users.findByEmail(body.email)) {
        return res.status(409).json({ error: 'Email already registered' });
      }
      const passwordHash = await bcrypt.hash(body.password, BCRYPT_ROUNDS);
      let user;
      try {
        user = await users.create({ name: body.name, email: body.email, passwordHash });
      } catch (err) {
        // Unique-index violation: two registrations for the same email raced.
        if (err.code === '23505') {
          return res.status(409).json({ error: 'Email already registered' });
        }
        throw err;
      }
      return res.status(201).json({ user: publicUser(user), token: signToken(user) });
    } catch (err) {
      return handleError(err, res, next);
    }
  });

  router.get('/me', (req, res) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const payload = jwt.verify(header.slice(7), getJwtSecret());
      return res.json({ user: { id: payload.sub, email: payload.email, role: payload.role } });
    } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }
  });

  return router;
}

export const authRouter = createAuthRouter();