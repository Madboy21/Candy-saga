import mongoose from 'mongoose';
const scoreSchema = new mongoose.Schema(
  { uid: { type: String, index: true }, nickname: String, points: { type: Number, index: true }, day: { type: String, index: true } },
  { timestamps: true }
);
export default mongoose.model('Score', scoreSchema);
