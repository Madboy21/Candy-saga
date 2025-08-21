import mongoose from 'mongoose';
const winnerSchema = new mongoose.Schema(
  { day: { type: String, unique: true, index: true }, winners: [ { uid: String, nickname: String, points: Number } ] },
  { timestamps: true }
);
export default mongoose.model('Winner', winnerSchema);
