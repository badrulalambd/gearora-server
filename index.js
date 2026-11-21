import 'dotenv/config'
import express from 'express';
import cors from 'cors'
import { MongoClient, ObjectId } from 'mongodb';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import Stripe from 'stripe';


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
const favoriteCollection = database.collection("favorites");
const paymentCollection = database.collection("payments");

//Stripe client (secret key lives in .env; STRIPTE_SECRET_KEY is the current spelling there)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || process.env.STRIPTE_SECRET_KEY);

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

//Api for the admin All Users page: change a user's role from the dropdown
app.patch("/users/:id/role", async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid user ID." });
    }

    if (!["customer", "owner", "admin"].includes(role)) {
      return res.status(400).send({ message: "Invalid role." });
    }

    const result = await userCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { role, updatedAt: new Date() } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).send({ message: "User not found." });
    }

    res.send({
      message: "Role updated successfully.",
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("Error updating user role:", error);

    res.status(500).send({
      message: "Failed to update role.",
    });
  }
});

//Api for the admin All Users page: delete a customer or owner account
app.delete("/users/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid user ID." });
    }

    const user = await userCollection.findOne({ _id: new ObjectId(id) });

    if (!user) {
      return res.status(404).send({ message: "User not found." });
    }

    //Admin accounts are never deletable from the All Users page.
    if (user.role === "admin") {
      return res
        .status(403)
        .send({ message: "Admin accounts cannot be deleted." });
    }

    const result = await userCollection.deleteOne({ _id: new ObjectId(id) });

    res.send({
      message: "User deleted successfully.",
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error("Error deleting user:", error);

    res.status(500).send({
      message: "Failed to delete user.",
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

//Api for the admin All Equipment page: every listing regardless of status.
//Must be registered before GET /equipments/:email.
app.get("/equipments/all", async (req, res) => {
  try {
    const result = await equipmentCollection.find({}).sort({ _id: -1 }).toArray();
    res.send(result);
  } catch (error) {
    console.error("Error fetching all equipments:", error);
    res.status(500).send({ message: "Failed to fetch equipments." });
  }
})

//Api for the admin All Equipment page: approve or reject a listing
app.patch("/equipments/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid equipment ID." });
    }

    if (!["Pending", "Approved", "Rejected"].includes(status)) {
      return res.status(400).send({ message: "Invalid status." });
    }

    const result = await equipmentCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).send({ message: "Equipment not found." });
    }

    res.send({
      message: "Equipment status updated.",
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("Error updating equipment status:", error);
    res.status(500).send({ message: "Failed to update equipment status." });
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


//Favorites-Related API (customer saved equipment)............................
//Add an equipment to a customer's favorites (stores a snapshot for the list page)
app.post("/favorites", async (req, res) => {
  try {
    const { customerId, customerEmail, equipmentId } = req.body;

    if (!customerEmail || !equipmentId) {
      return res.status(400).send({ success: false, message: "Customer and equipment are required." });
    }
    if (!ObjectId.isValid(equipmentId)) {
      return res.status(400).send({ success: false, message: "Invalid equipment ID." });
    }

    const equipment = await equipmentCollection.findOne({ _id: new ObjectId(equipmentId) });
    if (!equipment) {
      return res.status(404).send({ success: false, message: "Equipment not found." });
    }

    const existing = await favoriteCollection.findOne({ customerEmail, equipmentId });
    if (existing) {
      return res.send({ success: true, message: "Already in your favorites.", data: { _id: existing._id.toString() } });
    }

    const favorite = {
      customerId: customerId || "",
      customerEmail,
      equipmentId,
      equipmentName: equipment.name,
      equipmentImage: equipment.image || "",
      category: equipment.category,
      rentalPrice: equipment.rentalPrice,
      rentalType: equipment.rentalType,
      location: equipment.location,
      addedAt: new Date(),
    };
    const result = await favoriteCollection.insertOne(favorite);

    res.send({
      success: true,
      message: "Added to favorites.",
      data: { _id: result.insertedId.toString() },
    });
  } catch (error) {
    console.error("Error adding favorite:", error);
    res.status(500).send({ success: false, message: "Failed to add to favorites." });
  }
});

//All favorites saved by one customer (newest first)
app.get("/favorites/:email", async (req, res) => {
  try {
    const result = await favoriteCollection
      .find({ customerEmail: req.params.email })
      .sort({ addedAt: -1 })
      .toArray();
    res.send(result);
  } catch (error) {
    console.error("Error fetching favorites:", error);
    res.status(500).send({ message: "Failed to fetch favorites." });
  }
});

//Remove one favorite from the customer's list
app.delete("/favorites/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ success: false, message: "Invalid favorite ID." });
    }

    const result = await favoriteCollection.deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) {
      return res.status(404).send({ success: false, message: "Favorite not found." });
    }

    res.send({ success: true, message: "Removed from favorites." });
  } catch (error) {
    console.error("Error deleting favorite:", error);
    res.status(500).send({ success: false, message: "Failed to remove favorite." });
  }
});


//Booking-Related API............................................................
//Rental duration in billing units of the equipment's rental type (simple calculation)
const rentalUnits = (rentalType, startDate, endDate) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const days = Math.max(1, Math.ceil((end - start) / 86400000));
  if (rentalType === "weekly") return Math.ceil(days / 7);
  if (rentalType === "monthly") return Math.ceil(days / 30);
  return days; //daily & hourly are billed per day
};

//Create a pending booking and a Stripe Checkout session for the booking form
app.post("/create-checkout-session", async (req, res) => {
  try {
    const {
      equipmentId, customerEmail, customerId,
      startDate, endDate, quantity, contactNumber, deliveryAddress, notes,
    } = req.body;

    //Step-1: check if the equipment exists
    if (!equipmentId || !ObjectId.isValid(equipmentId)) {
      return res.status(400).send({ success: false, message: "Invalid equipment ID." });
    }
    if (!customerEmail) {
      return res.status(400).send({ success: false, message: "Customer is required." });
    }
    const equipment = await equipmentCollection.findOne({ _id: new ObjectId(equipmentId) });
    if (!equipment) {
      return res.status(404).send({ success: false, message: "Equipment not found" });
    }

    //Step-2: validate quantity against availability
    const qty = Number.parseInt(quantity, 10);
    if (!Number.isFinite(qty) || qty < 1) {
      return res.status(400).send({ success: false, message: "Invalid quantity." });
    }
    if (qty > equipment.quantity) {
      return res.status(400).send({
        success: false,
        message: `Only ${equipment.quantity} unit(s) of this equipment are available.`,
      });
    }

    //Step-3: validate rental dates (no past start date, end on/after start)
    if (!startDate || !endDate) {
      return res.status(400).send({ success: false, message: "Rental dates are required." });
    }
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return res.status(400).send({ success: false, message: "Invalid rental dates." });
    }
    const todayStr = new Date().toISOString().slice(0, 10);
    if (startDate < todayStr) {
      return res.status(400).send({ success: false, message: "Rental start date cannot be in the past." });
    }
    if (end < start) {
      return res.status(400).send({ success: false, message: "Rental end date must be on or after the start date." });
    }

    //Step-4: total rental amount = price × duration units × quantity
    const units = rentalUnits(equipment.rentalType, start, end);
    const totalAmount = equipment.rentalPrice * units * qty; //in the site's currency
    //Stripe charges in USD cents (prices are stored in BDT — existing site conversion)
    const amountCents = Math.max(50, Math.round(totalAmount * 0.00804 * 100));

    //Step-5: Create a booking in the database with booking status pending
    const booking = {
      equipmentId,
      equipmentName: equipment.name,
      equipmentImage: equipment.image || "",
      category: equipment.category,
      customerId: customerId || "",
      customerEmail,
      startDate: start,
      endDate: end,
      quantity: qty,
      contactNumber: typeof contactNumber === "string" ? contactNumber.trim() : "",
      deliveryAddress: typeof deliveryAddress === "string" ? deliveryAddress.trim() : "",
      notes: typeof notes === "string" ? notes.trim() : "",
      rentalType: equipment.rentalType,
      rentalPrice: equipment.rentalPrice,
      durationUnits: units,
      totalAmount,
      status: "pending",
      paymentStatus: "pending",
      createdAt: new Date(),
    };
    const bookingCreatedResult = await bookingCollection.insertOne(booking);
    console.log("bookingCreatedResult: ", bookingCreatedResult);

    //Step-6: Create a Stripe Checkout session
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: customerEmail,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: equipment.name,
              description: `${units} × ${equipment.rentalType} × ${qty} unit(s)`,
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      success_url: `${process.env.CLIENT_URL}/booking/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL}/booking/cancel`,
      metadata: {
        bookingId: bookingCreatedResult.insertedId.toString(),
        equipmentId,
        customerEmail,
      },
    });
    console.log("session: ", session.id);

    await bookingCollection.updateOne(
      { _id: bookingCreatedResult.insertedId },
      { $set: { stripeSessionId: session.id } }
    );

    res.send({ success: true, message: "Checkout session created", data: { redirectUrl: session.url } });
  } catch (error) {
    console.error("Error creating checkout session:", error);
    res.status(500).send({ success: false, message: "Failed to start checkout. Please try again." });
  }
})

//Confirm a paid checkout: booking pending→confirmed + record the payment
app.post("/bookings/confirm", async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).send({ success: false, message: "Session ID is required." });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== "paid") {
      return res.status(402).send({ success: false, message: "Payment has not been completed." });
    }

    const bookingId = session.metadata?.bookingId;
    if (!bookingId || !ObjectId.isValid(bookingId)) {
      return res.status(400).send({ success: false, message: "Invalid booking reference." });
    }
    const booking = await bookingCollection.findOne({ _id: new ObjectId(bookingId) });
    if (!booking) {
      return res.status(404).send({ success: false, message: "Booking not found." });
    }

    const paymentIntentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id || "";

    //Record the transaction once (success page can be refreshed safely)
    const existingPayment = await paymentCollection.findOne({ sessionId });
    if (!existingPayment) {
      await paymentCollection.insertOne({
        bookingId,
        sessionId,
        paymentIntentId,
        amount: session.amount_total,
        currency: session.currency,
        customerEmail: booking.customerEmail,
        equipmentId: booking.equipmentId,
        status: "succeeded",
        createdAt: new Date(),
      });
    }

    //Update the booking's payment status from pending to confirmed
    if (booking.status !== "confirmed") {
      await bookingCollection.updateOne(
        { _id: new ObjectId(bookingId) },
        {
          $set: {
            status: "confirmed",
            paymentStatus: "confirmed",
            paidAt: new Date(),
            transactionId: paymentIntentId,
            amountPaid: session.amount_total,
            currency: session.currency,
          },
        }
      );
    }

    const updatedBooking = await bookingCollection.findOne({ _id: new ObjectId(bookingId) });
    res.send({ success: true, message: "Payment confirmed.", data: { booking: updatedBooking } });
  } catch (error) {
    console.error("Error confirming booking:", error);
    res.status(500).send({ success: false, message: "Failed to confirm payment." });
  }
})

//Confirmed rentals for the customer's My Rentals page
app.get("/bookings/customer/:email", async (req, res) => {
  try {
    const result = await bookingCollection
      .find({ customerEmail: req.params.email, status: "confirmed" })
      .sort({ createdAt: -1 })
      .toArray();
    res.send(result);
  } catch (error) {
    console.error("Error fetching bookings:", error);
    res.status(500).send({ message: "Failed to fetch rentals." });
  }
})

//Api for the admin All Rentals page: every booking, joined with the customer
//and owner details. `?status=Pending|Approved|Rejected` filters on the
//equipment's status directly in the database.
app.get("/bookings", async (req, res) => {
  try {
    const { status } = req.query;
    const query = {};

    if (["Pending", "Approved", "Rejected"].includes(status)) {
      const matching = await equipmentCollection
        .find({ status }, { projection: { _id: 1 } })
        .toArray();
      //Bookings keep the equipment id as a plain string.
      query.equipmentId = { $in: matching.map((eq) => eq._id.toString()) };
    }

    const bookings = await bookingCollection
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    //Owner details live on the equipment document.
    const equipmentIds = [
      ...new Set(bookings.map((b) => b.equipmentId).filter((id) => id && ObjectId.isValid(id))),
    ];
    const equipments = await equipmentCollection
      .find({ _id: { $in: equipmentIds.map((id) => new ObjectId(id)) } })
      .toArray();
    const equipmentMap = new Map(equipments.map((eq) => [eq._id.toString(), eq]));

    //Customer details live on the user document.
    const emails = [...new Set(bookings.map((b) => b.customerEmail).filter(Boolean))];
    const customers = await userCollection.find({ email: { $in: emails } }).toArray();
    const customerMap = new Map(customers.map((u) => [u.email, u]));

    const result = bookings.map((booking) => {
      const equipment = equipmentMap.get(booking.equipmentId);
      const customer = customerMap.get(booking.customerEmail);

      return {
        ...booking,
        customerName: customer?.name || booking.customerEmail,
        customerImage: customer?.image || "",
        ownerName: equipment?.ownerName || "",
        ownerEmail: equipment?.ownerEmail || "",
        equipmentStatus: equipment?.status || "",
      };
    });

    res.send(result);
  } catch (error) {
    console.error("Error fetching bookings:", error);
    res.status(500).send({ message: "Failed to fetch rentals." });
  }
})

//Listener....................................................................
app.listen(port, () => {
  console.log(`GearOra server is running on port ${port}`)
})

export default app;
