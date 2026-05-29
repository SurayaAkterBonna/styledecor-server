import jwt from 'jsonwebtoken';
import { getDB } from '../config/db.js';

export const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ error: true, message: 'Unauthorized access' });
  }
  const token = authorization.split(' ')[1];
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).send({ error: true, message: 'Forbidden access' });
    }
    req.decoded = decoded;
    next();
  });
};

export const verifyAdmin = async (req, res, next) => {
  const db = getDB();
  const email = req.decoded.email;
  const user = await db.collection('users').findOne({ email: email });
  if (user?.role !== 'admin') {
    return res.status(403).send({ error: true, message: 'Forbidden access' });
  }
  next();
};

export const verifyDecorator = async (req, res, next) => {
  const db = getDB();
  const email = req.decoded.email;
  const user = await db.collection('users').findOne({ email: email });
  if (user?.role !== 'decorator') {
    return res.status(403).send({ error: true, message: 'Forbidden access' });
  }
  next();
};