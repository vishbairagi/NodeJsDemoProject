import mongoose from "mongoose";

/* -------- Chat Schema -------- */
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

/* -------- URL Schema -------- */
const UrlSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: true
    },
    content: {
      type: String,
      required: true
    }
  },
  { timestamps: true }
);

/* -------- Models -------- */
export const Chat = mongoose.model("Chat", ChatSchema);
export const UrlContent = mongoose.model("UrlContent", UrlSchema);
