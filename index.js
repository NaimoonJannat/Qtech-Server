const express = require('express')
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express();
require('dotenv').config();
const port = process.env.PORT || 5000;


// middleware 
app.use(cors({
    origin: ['http://localhost:5173'],
    credentials: true
  }));
  app.use(express.json())

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.3ywizof.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;



// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    }
  });


  async function run() {
    try {
      // Connect the client to the server	(optional starting in v4.7)
    //   await client.connect();

     const database = client.db('NameofDB');

     const assetCollection = database.collection("nameofCollection");



     } finally {
        // Ensures that the client will close when you finish/error
      //   await client.close();
      }

    }

    run().catch(console.log);


  app.get('/', (req, res) => {
    res.send('Server is Running')
  })
  app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
  })