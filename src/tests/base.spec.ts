import { before } from "mocha";
import mongoose from "mongoose";
before(async () => {
  await mongoose.connect(process.env.MONGO_URI_TEST);
  await mongoose.connection.db.dropDatabase();
});

after(async () => {
  await mongoose.disconnect();
});
