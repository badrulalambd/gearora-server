import 'dotenv/config'
import express from 'express';
import cors from 'cors'
import { MongoClient, ObjectId } from 'mongodb';

const app = express();
const port = process.env.PORT || 5000;

//Middleware
app.use(express.json());
app.use(cors());

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

const connection = await connectToMongoDB();
const database = connection.db("gearoradb");
const userCollection = database.collection("user");
const equipmentCollection = database.collection("equipments");

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

//Equipment-Related API............................................................
app.post("/equipments", async (req, res) => {
  const equipment = req.body;
  const result = await equipmentCollection.insertOne(equipment);
  res.send(result);
  console.log("Equipment: ", result);
})

//Listener....................................................................
app.listen(port, () => {
  console.log(`GearOra server is running on port ${port}`)
})
