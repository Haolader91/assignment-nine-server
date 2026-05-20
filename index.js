const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
dotenv.config();
const uri = process.env.MONGODB_URI;
const app = express();
const PORT = process.env.PORT;

app.use(express.json());
app.use(cors());

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
async function run() {
  try {
    await client.connect();

    const db = client.db("StudyNook");

    const roomsCollection = db.collection("rooms");
    const bookingCollection = db.collection("bookings");

    app.get("/rooms", async (req, res) => {
      const result = await roomsCollection.find().toArray();
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
