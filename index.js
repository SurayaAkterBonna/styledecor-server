import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { MongoClient, ServerApiVersion, ObjectId } from 'mongodb';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5000;

app.use(cors({
  origin: ['http://localhost:5173', 'https://localhost:5174'],
  credentials: true
}));
app.use(express.json());

const uri = process.env.DB_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ error: true, message: 'Unauthorised clearance token missing' });
  }
  const token = authorization.split(' ')[1];
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).send({ error: true, message: 'Forbidden security allocation violation' });
    }
    req.decoded = decoded;
    next();
  });
};

async function run() {
  try {
    const db = client.db('styledecor');
    const usersCollection = db.collection('users');
    const servicesCollection = db.collection('services');
    const bookingsCollection = db.collection('bookings');
    const decoratorsCollection = db.collection('decorators');
    const paymentsCollection = db.collection('payments');

    app.post('/jwt', (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '7d' });
      res.send({ token });
    });

    app.put('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const options = { upsert: true };
      const updateDoc = { $set: user };
      const result = await usersCollection.updateOne(query, updateDoc, options);
      res.send(result);
    });

    app.get('/users', verifyJWT, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    app.get('/users/role/:email', async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      res.send({ 
        role: user?.role || 'user', 
        status: user?.status || 'active' 
      });
    });

    app.patch('/users/role/:id', verifyJWT, async (req, res) => {
      const id = req.params.id;
      const { role } = req.body;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = { $set: { role: role } };
      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.get('/services', async (req, res) => {
      const { search, category, minPrice, maxPrice } = req.query;
      let query = {};

      if (search) {
        query.service_name = { $regex: search, $options: 'i' };
      }
      if (category && category !== 'all') {
        query.service_category = category;
      }
      if (minPrice || maxPrice) {
        query.cost = {};
        if (minPrice) query.cost.$gte = parseInt(minPrice, 10);
        if (maxPrice) query.cost.$lte = parseInt(maxPrice, 10);
      }

      const result = await servicesCollection.find(query).toArray();
      res.send(result);
    });

    app.get('/services/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await servicesCollection.findOne(query);
      res.send(result);
    });

    app.post('/decorators', verifyJWT, async (req, res) => {
      const profile = req.body;
      const result = await decoratorsCollection.insertOne(profile);
      res.send(result);
    });

    app.get('/decorators', verifyJWT, async (req, res) => {
      const result = await decoratorsCollection.find().toArray();
      res.send(result);
    });

    app.get('/decorators/profile', verifyJWT, async (req, res) => {
      const email = req.query.email;
      const query = { decoratorEmail: email };
      const result = await decoratorsCollection.findOne(query);
      res.send(result);
    });

    app.patch('/decorators/approve/:id', verifyJWT, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const profile = await decoratorsCollection.findOne(filter);
      
      await decoratorsCollection.updateOne(filter, { $set: { status: 'approved' } });
      const result = await usersCollection.updateOne(
        { email: profile.decoratorEmail }, 
        { $set: { role: 'decorator', status: 'approved' } }
      );
      res.send(result);
    });

    app.post('/bookings', verifyJWT, async (req, res) => {
      const booking = req.body;
      const result = await bookingsCollection.insertOne(booking);
      res.send(result);
    });

    app.get('/bookings', verifyJWT, async (req, res) => {
      const result = await bookingsCollection.find().toArray();
      res.send(result);
    });

    app.get('/bookings/client', verifyJWT, async (req, res) => {
      const email = req.query.email;
      const result = await bookingsCollection.find({ userEmail: email }).toArray();
      res.send(result);
    });

    app.get('/bookings/decorator', verifyJWT, async (req, res) => {
      const email = req.query.email;
      const result = await bookingsCollection.find({ assignedDecorator: email }).toArray();
      res.send(result);
    });

    app.patch('/bookings/assign/:id', verifyJWT, async (req, res) => {
      const id = req.params.id;
      const { decoratorEmail } = req.body;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = { $set: { assignedDecorator: decoratorEmail, status: 'confirmed' } };
      const result = await bookingsCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.patch('/bookings/status/:id', verifyJWT, async (req, res) => {
      const id = req.params.id;
      const { status } = req.body;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = { $set: { status: status } };
      const result = await bookingsCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.post('/create-payment-intent', verifyJWT, async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'bdt',
        payment_method_types: ['card'],
      });

      res.send({ clientSecret: paymentIntent.client_secret });
    });

    app.post('/payments', verifyJWT, async (req, res) => {
      const payment = req.body;
      const insertResult = await paymentsCollection.insertOne(payment);

      const query = { _id: new ObjectId(payment.bookingId) };
      const updateDoc = { $set: { paymentStatus: 'paid' } };
      await bookingsCollection.updateOne(query, updateDoc);

      res.send(insertResult);
    });

    app.get('/admin-stats', verifyJWT, async (req, res) => {
      const totalUsers = await usersCollection.countDocuments();
      const totalBookings = await bookingsCollection.countDocuments();
      
      const payments = await paymentsCollection.find().toArray();
      const revenue = payments.reduce((sum, p) => sum + p.price, 0);

      const servicesBreakdown = await bookingsCollection.aggregate([
        { $group: { _id: '$service_name', count: { $sum: 1 } } }
      ]).toArray();

      res.send({ totalUsers, totalBookings, revenue, servicesBreakdown });
    });

    console.log("Database communication array maps verified.");
  } catch (err) {
    console.error("Database initialization fault caught:", err);
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('StyleDecor Luxury Spatial Orchestration Engines Online.');
});

app.listen(port, () => {
  console.log(`Server core mapping executing cleanly over node connection port: ${port}`);
});