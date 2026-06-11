import { Router } from 'express';
import { redis } from '../utils/redis.js';
import { clients } from '../utils/serviceClient.js';

export const cartRouter = Router();

function cartKey(userId) { return `cart:${userId}`; }

cartRouter.get('/', async (req, res, next) => {
  try {
    const raw = await redis.get(cartKey(req.user.sub));
    const cart = raw ? JSON.parse(raw) : { items: [], total: 0, discount: 0 };
    res.json(cart);
  } catch (err) { next(err); }
});

cartRouter.post('/items', async (req, res, next) => {
  try {
    const key = cartKey(req.user.sub);
    const raw = await redis.get(key);
    const cart = raw ? JSON.parse(raw) : { items: [], total: 0, discount: 0 };

    const existing = cart.items.find((i) => i.courseId === req.body.courseId);
    if (!existing) {
      cart.items.push({ id: `ci-${Date.now()}`, ...req.body });
      cart.total = cart.items.reduce((s, i) => s + (i.price || 0), 0);
      await redis.setEx(key, 3600, JSON.stringify(cart));
    }

    res.status(201).json(cart);
  } catch (err) { next(err); }
});

cartRouter.delete('/items/:itemId', async (req, res, next) => {
  try {
    const key = cartKey(req.user.sub);
    const raw = await redis.get(key);
    if (!raw) return res.json({ items: [], total: 0 });

    const cart = JSON.parse(raw);
    cart.items = cart.items.filter((i) => i.id !== req.params.itemId);
    cart.total = cart.items.reduce((s, i) => s + (i.price || 0), 0);
    await redis.setEx(key, 3600, JSON.stringify(cart));

    res.json(cart);
  } catch (err) { next(err); }
});

cartRouter.post('/checkout', async (req, res, next) => {
  try {
    const key = cartKey(req.user.sub);
    const raw = await redis.get(key);
    const cart = raw ? JSON.parse(raw) : { items: [] };

    // Enroll user in every course from the cart
    const enrollResults = await Promise.allSettled(
      cart.items.map((item) =>
        clients.enrollment.post('/api/v1/enrollments', {
          userId: req.user.sub,
          courseId: item.courseId,
        })
      )
    );

    // Clear cart after checkout
    await redis.del(key);

    const enrolledCourses = cart.items.map((i) => i.courseId);
    res.json({ success: true, enrolledCourses });
  } catch (err) { next(err); }
});
