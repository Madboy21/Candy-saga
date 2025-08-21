import mongoose from 'mongoose';
const userSchema = new mongoose.Schema(
  { uid: { type: String, unique: true, index: true }, nickname: { type: String, default: 'Guest' } },
  { timestamps: true }
);
export default mongoose.model('User', userSchema);
