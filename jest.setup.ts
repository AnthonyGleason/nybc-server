// jest.setup.ts
import mongoose from 'mongoose';

//NOTE THIS IS VERY CPU INTENSIVE IF YOU ARE EXPERIENCING TIMEOUTS ENSURE YOUR CPU IS NOT THROTTLING!!!

beforeAll(async () => {
  // Check if the connection is already open
  if (mongoose.connection.readyState === 0) {
    // Connection is not open, so connect to the testing database
    await mongoose.connect('mongodb://localhost:27017/nybc_test_db');
    console.log('Successfully connected to the mongodb TESTING database.');
  } else {
    // Connection is already open
    console.log('Database connection already established.');
  }
  // Remember to seed (populate the database with test data) if needed
});

afterAll(async () => {
  // Disconnect from the testing database only if the connection was opened in this file
  if (mongoose.connection.readyState === 1) {
    // Drop the database to remove all data
    await mongoose.connection.db.dropDatabase();
    
    // Disconnect from the testing database
    await mongoose.disconnect();
    console.log('Successfully detached from the mongodb TESTING database.');
  }
  // Remember to reset (reset the database and perform cleanup) if needed
});
