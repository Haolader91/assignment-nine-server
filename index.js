const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { createRemoteJWKSet, jwtVerify } = require("jose-cjs");
dotenv.config();
const uri = process.env.MONGODB_URI;
const app = express();
const PORT = process.env.PORT || 5000;

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

// verify jwt token
const veryToken = async (req, res, next) => {
  const { authorization } = req.headers;
  const token = authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Unauthorized access" });
  }

  try {
    const { payload } = await jwtVerify(token, JWKS);
    req.user = payload;
    next();
  } catch (error) {
    console.error("Token validation failed:", error);
    return res.status(401).json({ message: "Unauthorized access" });
  }
};

async function run() {
  try {
    await client.connect();

    const db = client.db("StudyNook");

    const roomsCollection = db.collection("rooms");

    const bookingCollection = db.collection("bookings");

    // delete room
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

    // edit room
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

    // all rooms page
    app.get("/rooms", async (req, res) => {
      const { search, amenities } = req.query;
      let query = {};

      if (search) {
        query.roomName = { $regex: search, $options: "i" };
      }

      if (amenities) {
        // const amenitiesArray = amenities.split(",");
        // query.amenities = { $all: amenitiesArray };
        query[`amenities.${amenities}`] = true;
      }

      const result = await roomsCollection.find(query).toArray();
      res.json(result);
    });

    // use room to
    app.get("/my-rooms", middle, veryToken, async (req, res) => {
      const userEmail = req.user?.email;

      if (!userEmail) {
        return res
          .status(401)
          .json({ message: "Unauthorized: User email not found" });
      }

      try {
        const query = { ownerEmail: userEmail };
        const result = await roomsCollection.find(query).toArray();
        res.json(result);
      } catch (error) {
        console.error("Error fetching user listings:", error);
        res.status(500).json({ message: "Failed to fetch your listings" });
      }
    });

    //room details
    app.get("/rooms/:id", async (req, res) => {
      const { id } = req.params;
      const result = await roomsCollection.findOne({ _id: new ObjectId(id) });
      res.json(result);
    });

    // create room
    app.post("/rooms", middle, veryToken, async (req, res) => {
      const requestRoomsData = req.body;
      const userEmail = req.user?.email;

      if (!userEmail) {
        return res
          .status(401)
          .json({ message: "User email not found in token" });
      }

      const finalRoomData = {
        ...requestRoomsData,
        ownerEmail: userEmail,
        capacity: Number(requestRoomsData.capacity),
        price: Number(requestRoomsData.price),
        createdAt: new Date(),
      };

      const result = await roomsCollection.insertOne(finalRoomData);
      res.status(201).json(result);
    });

    // create booking
    app.post("/booking", middle, veryToken, async (req, res) => {
      const bookingData = req.body;
      const { roomId, date, startHour, endHour } = bookingData;

      try {
        const existingConflict = await bookingCollection.findOne({
          roomId: roomId,
          date: date,
          status: "Confirmed",
          $or: [
            {
              startHour: { $lt: endHour },
              endHour: { $gt: startHour },
            },
          ],
        });

        if (existingConflict) {
          return res.status(400).json({
            message:
              "Conflict detected: This room is already booked for the selected time slot.",
          });
        }

        const result = await bookingCollection.insertOne({
          ...bookingData,
          status: "Confirmed",
          createdAt: new Date(),
        });

        await roomsCollection.updateOne(
          { _id: new ObjectId(roomId) },
          { $inc: { bookingCount: 1 } },
        );

        res.status(201).json(result);
      } catch (error) {
        console.error("Booking error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    // use booking
    app.get("/booking/:id", middle, async (req, res) => {
      const { id } = req.params;
      try {
        const result = await bookingCollection.find({ userId: id }).toArray();
        res.json(result);
      } catch (error) {
        res.status(500).json({ message: "Failed to fetch bookings" });
      }
    });

    // cancel booking
    app.patch("/booking/:id", middle, veryToken, async (req, res) => {
      const { id } = req.params;
      const userEmail = req.user?.email;

      try {
        const booking = await bookingCollection.findOne({
          _id: new ObjectId(id),
        });
        if (!booking) {
          return res.status(404).json({ message: "Booking not found" });
        }

        if (booking.userEmail !== userEmail) {
          return res.status(403).json({
            message: "Forbidden: You cannot cancel someone else's booking",
          });
        }

        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            status: "Cancelled",
          },
        };

        const result = await bookingCollection.updateOne(filter, updateDoc);

        await roomsCollection.updateOne(
          { _id: new ObjectId(booking.roomId) },
          { $inc: { bookingCount: -1 } },
        );

        res.json(result);
      } catch (error) {
        res.status(500).json({ message: "Failed to cancel booking" });
      }
    });

    // available
    app.get("/available", async (req, res) => {
      const available = roomsCollection.find().sort({ _id: -1 }).limit(6);
      const result = await available.toArray();
      res.json(result);
    });

    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("server is running");
});

app.listen(PORT, () => {
  console.log(`server is running on port ${PORT}`);
});
