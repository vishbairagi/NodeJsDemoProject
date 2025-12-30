import mongoose from "mongoose";

const ChatSchema = new mongoose.Schema({
  prompt: {
    type: String,
    required: true
  },
  response: {
    type: String,
    required: true
  },
  domain: {
    type: String,
    default: "news"
  },
  context: {
    type: Object
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.model("Chat", ChatSchema);
