import { Router } from 'express';
import { clients } from '../utils/serviceClient.js';

export const paymentsRouter = Router();

paymentsRouter.post('/intent', async (req, res, next) => {
  try {
    const { data } = await clients.payment.post('/api/v1/payments/intent', {
      ...req.body, userId: req.user.sub,
    });
    res.json(data);
  } catch (err) { next(err); }
});

paymentsRouter.post('/:id/confirm', async (req, res, next) => {
  try {
    const { data } = await clients.payment.post(`/api/v1/payments/${req.params.id}/confirm`, {
      userId: req.user.sub,
    });
    res.json(data);
  } catch (err) { next(err); }
});

paymentsRouter.get('/history', async (req, res, next) => {
  try {
    const { data } = await clients.payment.get(`/api/v1/payments/user/${req.user.sub}`);
    res.json(data);
  } catch (err) { next(err); }
});
