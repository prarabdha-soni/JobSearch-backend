const express = require('express');
const { MongoClient } = require('mongodb');
const cors = require('cors');

const app = express();
const port = 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB connection string
const uri = 'mongodb+srv://collection-app:WvbAzkmupUtZluwY@dev-loans.45jnlrl.mongodb.net/artm-lmos?retryWrites=true&w=majority';
const client = new MongoClient(uri);
const dbName = 'artm-lmos'; // Replace with your database name

// Route to execute MongoDB queries
app.post('/execute-query', async (req, res) => {
  const { query, collectionName } = req.body;

  if (!query || !collectionName) {
    return res.status(400).json({ error: 'Query and collectionName are required' });
  }

  try {
    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection(collectionName);

    // Execute the query
    const results = await collection.find(query).toArray();
    console.log('Results',results);
    res.json({ results });
  } catch (error) {
    console.error('Error executing query:', error);
    res.status(500).json({ error: 'Failed to execute query' });
  } finally {
    await client.close();
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});