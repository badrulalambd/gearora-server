import 'dotenv/config'
import express from 'express';
import cors from 'cors'
import { MongoClient, ObjectId } from 'mongodb';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const app = express();
const port = process.env.PORT || 5000;

//Middleware
app.use(express.json());
app.use(cors());

//MongoDB connection
const client = new MongoClient(`mongodb://${process.env.MONGODB_USER}:${process.env.MONGODB_PASSWORD}@ac-n9vqlya-shard-00-00.d1i0h77.mongodb.net:27017,ac-n9vqlya-shard-00-01.d1i0h77.mongodb.net:27017,ac-n9vqlya-shard-00-02.d1i0h77.mongodb.net:27017/?ssl=true&replicaSet=atlas-7upjpt-shard-0&authSource=admin`);
export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}
// Call this only when your application terminates
export async function disconnectFromMongoDB() {
  await client.close();
}

//Connect mongoDB database.......................................................
const connection = await connectToMongoDB();
const database = connection.db("gearoradb");
//Create database collections
const userCollection = database.collection("user");
const equipmentCollection = database.collection("equipments");
const bookingCollection = database.collection("bookings");

//JSON Web Token (JWT) Middleware method.....................................................
const verifyUserWithMiddlewareToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ msg: "Unauthorized authHeader" });
  }
  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).send({ msg: "Unauthorized Token" });
  }
  const JWKS = createRemoteJWKSet(
    new URL(`${process.env.CLIENT_URL}/api/auth/jwks`)
  )

  try {
    const { payload } = await jwtVerify(token, JWKS);
    next();
  } catch (error) {
    return res.status(500).send({ msg: "Server Error" }, error);
  }
}


//API creation start.............................................................
app.get('/', (req, res) => {
  res.send('GearOra Server is running!')
})

//User-Related API............................................................
//GET API
app.get('/users', async (req, res) => {
  const result = await userCollection.find({}).toArray();
  console.log(result);
  res.send(result);
})

//Api to update a user's profile details from the profile page
app.patch("/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, image, phone, address } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid user ID." });
    }

    //Only whitelisted profile fields are updatable — never email or role.
    const updates = {};
    if (typeof name === "string") updates.name = name.trim();
    if (typeof image === "string") updates.image = image;
    if (typeof phone === "string") updates.phone = phone.trim();
    if (typeof address === "string") updates.address = address.trim();
    updates.updatedAt = new Date();

    const result = await userCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updates }
    );

    if (result.matchedCount === 0) {
      return res.status(404).send({ message: "User not found." });
    }

    res.send({
      message: "Profile updated successfully.",
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("Error updating user profile:", error);

    res.status(500).send({
      message: "Failed to update profile.",
    });
  }
});

//Equipment-Related API............................................................
//Api for add-equipment page as owner
app.post("/equipments", async (req, res) => {
  const equipment = req.body;
  const result = await equipmentCollection.insertOne(equipment);
  res.send(result);
  console.log("Equipment: ", result);
})
//Helper to keep user search input out of regex syntax
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

//Api for all equipments public page: approved equipment only, with backend
//search, filtering and sorting via query params.
//Params: search, category, rentalType, minPrice, maxPrice, availability, sort
app.get("/equipments", async (req, res) => {
  try {
    const { search, category, rentalType, minPrice, maxPrice, availability, sort } = req.query;

    //Only approved equipment is publicly visible.
    const query = { status: "Approved" };

    //Search by equipment name OR location (case-insensitive).
    if (typeof search === "string" && search.trim()) {
      const pattern = new RegExp(escapeRegex(search.trim()), "i");
      query.$or = [{ name: pattern }, { location: pattern }];
    }

    if (typeof category === "string" && category) query.category = category;
    if (typeof rentalType === "string" && rentalType) query.rentalType = rentalType;

    //Price range filter.
    const price = {};
    if (typeof minPrice === "string" && minPrice && Number.isFinite(Number(minPrice))) {
      price.$gte = Number(minPrice);
    }
    if (typeof maxPrice === "string" && maxPrice && Number.isFinite(Number(maxPrice))) {
      price.$lte = Number(maxPrice);
    }
    if (Object.keys(price).length > 0) query.rentalPrice = price;

    //Availability filter (availability is derived from quantity).
    if (availability === "available") query.quantity = { $gt: 0 };
    else if (availability === "out-of-stock") query.quantity = { $lte: 0 };

    //Sorting: price low→high, price high→low, or recently added (newest first).
    let sortSpec = { _id: -1 };
    if (sort === "price-asc") sortSpec = { rentalPrice: 1, _id: -1 };
    else if (sort === "price-desc") sortSpec = { rentalPrice: -1, _id: -1 };

    const result = await equipmentCollection.find(query).sort(sortSpec).toArray();
    res.send(result);
  } catch (error) {
    console.error("Error fetching equipments:", error);
    res.status(500).send({ message: "Failed to fetch equipments." });
  }
})
//Distinct categories of approved equipment, for the public page's category filter
app.get("/equipments/categories", async (req, res) => {
  try {
    const categories = await equipmentCollection
      .distinct("category", { status: "Approved", category: { $exists: true, $ne: "" } });
    res.send(categories.sort());
  } catch (error) {
    console.error("Error fetching equipment categories:", error);
    res.status(500).send({ message: "Failed to fetch equipment categories." });
  }
})
//Api for a single equipment detail page
app.get("/equipment/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid equipment ID." });
    }

    const result = await equipmentCollection.findOne({ _id: new ObjectId(id) });

    if (!result) {
      return res.status(404).send({ message: "Equipment not found." });
    }

    res.send(result);
  } catch (error) {
    console.error("Error fetching equipment:", error);
    res.status(500).send({ message: "Failed to fetch equipment." });
  }
})
//Api for the my-equipment page for owner
app.get("/equipments/:email", async (req, res) => {
  const email = req.params.email;
  const result = await equipmentCollection.find({ ownerEmail: email }).toArray();
  res.send(result);
  console.log("Get Equipments: ", result);
})
//Api to delete an equipment from the my-equipment page from owner
app.delete("/equipments/:id", async (req, res) => {
  const id = req.params.id;
  const query = { _id: new ObjectId(id) };
  const result = await equipmentCollection.deleteOne(query);
  res.send(result);
  console.log("Deleted Job: ", result);
})
//Api to update an equipment detail as a owner from the my-equipment page
app.patch("/update-equipment/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updatedEquipment = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid equipment ID." });
    }

    const result = await equipmentCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: updatedEquipment,
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).send({ message: "Equipment not found." });
    }

    res.send({
      message: "Equipment updated successfully.",
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("Error updating equipment:", error);

    res.status(500).send({
      message: "Failed to update equipment.",
    });
  }
});



//Listener....................................................................
app.listen(port, () => {
  console.log(`GearOra server is running on port ${port}`)
})
