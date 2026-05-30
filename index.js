import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import { MongoClient, ServerApiVersion, ObjectId } from "mongodb";
import Stripe from "stripe";
import serverless from "serverless-http";

const app = express();

app.use(cors({
  origin: [
    "http://localhost:5173",
    "http://localhost:5174",
    "https://styledecor123.netlify.app"
  ],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  credentials: true
}));

app.options("*", cors({
  origin: [
    "http://localhost:5173",
    "http://localhost:5174",
    "https://styledecor123.netlify.app"
  ],
  credentials: true
}));

app.use(express.json());

const client = new MongoClient(process.env.DB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true
  }
});

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const verifyJWT = (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).send({ error: true });

  const token = auth.split(" ")[1];

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).send({ error: true });
    req.decoded = decoded;
    next();
  });
};

let db;
let usersCollection;
let servicesCollection;
let bookingsCollection;
let decoratorsCollection;
let paymentsCollection;

async function connectDB() {
  if (db) return;

  await client.connect();
  db = client.db("styledecor");

  usersCollection = db.collection("users");
  servicesCollection = db.collection("services");
  bookingsCollection = db.collection("bookings");
  decoratorsCollection = db.collection("decorators");
  paymentsCollection = db.collection("payments");
}

app.use(async (req, res, next) => {
  await connectDB();
  next();
});

app.post("/jwt", (req, res) => {
  const token = jwt.sign(req.body, process.env.JWT_SECRET, {
    expiresIn: "7d"
  });
  res.send({ token });
});

app.put("/users", async (req, res) => {
  const result = await usersCollection.updateOne(
    { email: req.body.email },
    { $set: req.body },
    { upsert: true }
  );
  res.send(result);
});

app.get("/users", verifyJWT, async (req, res) => {
  const result = await usersCollection.find().toArray();
  res.send(result);
});

app.get("/users/role/:email", async (req, res) => {
  const user = await usersCollection.findOne({ email: req.params.email });
  res.send({
    role: user?.role || "user",
    status: user?.status || "active"
  });
});

app.patch("/users/role/:id", verifyJWT, async (req, res) => {
  const result = await usersCollection.updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: { role: req.body.role } }
  );
  res.send(result);
});

app.get("/services", async (req, res) => {
  const { search, category, minPrice, maxPrice } = req.query;

  let query = {};

  if (search) {
    query.service_name = { $regex: search, $options: "i" };
  }

  if (category && category !== "all") {
    query.service_category = category;
  }

  if (minPrice || maxPrice) {
    query.cost = {};
    if (minPrice) query.cost.$gte = parseInt(minPrice);
    if (maxPrice) query.cost.$lte = parseInt(maxPrice);
  }

  const result = await servicesCollection.find(query).toArray();
  res.send(result);
});

app.get("/services/:id", async (req, res) => {
  const result = await servicesCollection.findOne({
    _id: new ObjectId(req.params.id)
  });
  res.send(result);
});

app.post("/decorators", verifyJWT, async (req, res) => {
  const result = await decoratorsCollection.insertOne(req.body);
  res.send(result);
});

app.get("/decorators", verifyJWT, async (req, res) => {
  const result = await decoratorsCollection.find().toArray();
  res.send(result);
});

app.get("/decorators/profile", verifyJWT, async (req, res) => {
  const result = await decoratorsCollection.findOne({
    decoratorEmail: req.query.email
  });
  res.send(result);
});

app.patch("/decorators/approve/:id", verifyJWT, async (req, res) => {
  const profile = await decoratorsCollection.findOne({
    _id: new ObjectId(req.params.id)
  });

  await decoratorsCollection.updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: { status: "approved" } }
  );

  const result = await usersCollection.updateOne(
    { email: profile.decoratorEmail },
    { $set: { role: "decorator", status: "approved" } }
  );

  res.send(result);
});

app.post("/bookings", verifyJWT, async (req, res) => {
  const result = await bookingsCollection.insertOne(req.body);
  res.send(result);
});

app.get("/bookings", verifyJWT, async (req, res) => {
  const result = await bookingsCollection.find().toArray();
  res.send(result);
});

app.get("/bookings/client", verifyJWT, async (req, res) => {
  const result = await bookingsCollection.find({
    userEmail: req.query.email
  }).toArray();
  res.send(result);
});

app.get("/bookings/decorator", verifyJWT, async (req, res) => {
  const result = await bookingsCollection.find({
    assignedDecorator: req.query.email
  }).toArray();
  res.send(result);
});

app.patch("/bookings/assign/:id", verifyJWT, async (req, res) => {
  const result = await bookingsCollection.updateOne(
    { _id: new ObjectId(req.params.id) },
    {
      $set: {
        assignedDecorator: req.body.decoratorEmail,
        status: "confirmed"
      }
    }
  );
  res.send(result);
});

app.patch("/bookings/status/:id", verifyJWT, async (req, res) => {
  const result = await bookingsCollection.updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: { status: req.body.status } }
  );
  res.send(result);
});

app.post("/create-payment-intent", verifyJWT, async (req, res) => {
  const amount = parseInt(req.body.price * 100);

  const paymentIntent = await stripe.paymentIntents.create({
    amount,
    currency: "usd",
    payment_method_types: ["card"]
  });

  res.send({ clientSecret: paymentIntent.client_secret });
});

app.post("/payments", verifyJWT, async (req, res) => {
  const result = await paymentsCollection.insertOne(req.body);

  await bookingsCollection.updateOne(
    { _id: new ObjectId(req.body.bookingId) },
    { $set: { paymentStatus: "paid" } }
  );

  res.send(result);
});

app.get("/admin-stats", verifyJWT, async (req, res) => {
  const totalUsers = await usersCollection.countDocuments();
  const totalBookings = await bookingsCollection.countDocuments();

  const payments = await paymentsCollection.find().toArray();
  const revenue = payments.reduce((sum, p) => sum + p.price, 0);

  const servicesBreakdown = await bookingsCollection.aggregate([
    { $group: { _id: "$service_name", count: { $sum: 1 } } }
  ]).toArray();

  res.send({ totalUsers, totalBookings, revenue, servicesBreakdown });
});

export default serverless(app);