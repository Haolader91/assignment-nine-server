const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { createRemoteJWKSet, jwtVerify } = require("jose-cjs");
dotenv.config();
const uri = process.env.MONGODB_URI;
const app = express();
const PORT = process.env.PORT;

app.use(express.json());
app.use(cors());

const JWKS = createRemoteJWKSet(
  new URL(`${process.env.CLIENT_URL}/api/auth/jwks`),
);

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const middle = (req, res, next) => {
  console.log(`${req.method} | ${req.url}`);
  next();
};

const veryToken = async (req, res, next) => {
  const { authorization } = req.headers;
  const token = authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Unauthorize" });
  }

  try {
    const { payload } = await jwtVerify(token, JWKS);
    req.user = payload;

    next();
  } catch (error) {
    console.error("Token validation failed:", error);
    return res.status(401).json({ message: "Unauthorize" });
  }
};
async function run() {
  try {
    await client.connect();

    const db = client.db("StudyNook");

    const roomsCollection = db.collection("rooms");
    const bookingCollection = db.collection("bookings");

    app.delete("/rooms/:id", middle, veryToken, async (req, res) => {
      const { id } = req.params;
      const userEmail = req.user?.email;

      const room = await roomsCollection.findOne({ _id: new ObjectId(id) });
      if (!room) {
        return res.status(404).json({ message: "Room not found" });
      }

      if (room.ownerEmail !== userEmail) {
        return res
          .status(403)
          .json({ message: "Forbidden: You are not the owner of this room" });
      }

      const filter = { _id: new ObjectId(id) };
      const result = await roomsCollection.deleteOne(filter);
      res.json(result);
    });

    app.patch("/rooms/:id", middle, veryToken, async (req, res) => {
      const { id } = req.params;
      const updatedData = req.body;
      const userEmail = req.user?.email;

      const room = await roomsCollection.findOne({ _id: new ObjectId(id) });
      if (!room) {
        return res.status(404).json({ message: "Room not found" });
      }

      if (room.ownerEmail !== userEmail) {
        return res
          .status(403)
          .json({ message: "Forbidden: You are not the owner of this room" });
      }

      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          roomName: updatedData.roomName,
          description: updatedData.description,
          imageUrl: updatedData.imageUrl,
          floor: updatedData.floor,
          capacity: Number(updatedData.capacity),
          price: Number(updatedData.price),
          amenities: updatedData.amenities,
        },
      };

      const result = await roomsCollection.updateOne(filter, updateDoc);
      res.json(result);
    });

    app.get("/rooms", async (req, res) => {
      const { search } = req.query;
      let result;
      if (search) {
        result = await roomsCollection
          .find({
            roomName: { $regex: search, $options: "i" },
          })
          .toArray();
      } else {
        result = await roomsCollection.find().toArray();
      }
      res.json(result);
    });

    app.get("/rooms/:id", async (req, res) => {
      const { id } = req.params;
      const result = await roomsCollection.findOne({ _id: new ObjectId(id) });
      res.json(result);
    });

    app.post("/rooms", async (req, res) => {
      const requestRoomsData = req.body;
      console.log(requestRoomsData);
      const result = await roomsCollection.insertOne(requestRoomsData);
      res.json(result);
    });

    // booking
    app.post("/booking", async (req, res) => {
      const bookingData = req.body;
      const result = await bookingCollection.insertOne(bookingData);
      res.json(result);
    });
    app.get("/booking/:id", async (req, res) => {
      const { id } = req.params;
      const result = await bookingCollection.find({ userId: id }).toArray();
      res.json(result);
    });

    app.patch("/booking/:id", async (req, res) => {
      const { id } = req.params;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          status: "Cancelled",
        },
      };
      const result = await bookingCollection.updateOne(filter, updateDoc);
      res.json(result);
    });

    // Available
    app.get("/available", async (req, res) => {
      const available = roomsCollection.find().sort({ _id: -1 }).limit(6);
      const result = await available.toArray();
      res.json(result);
    });

    // await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("server is running");
});
app.listen(PORT, () => {
  console.log(`server is running on prot ${PORT}`);
});
