import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true },
);

const progressSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    dayKey: { type: String, required: true },
    status: {
      type: String,
      required: true,
      enum: ['todo', 'review', 'done'],
    },
  },
  { timestamps: true },
);

progressSchema.index({ userId: 1, dayKey: 1 }, { unique: true });

export const UserModel =
  mongoose.models.User || mongoose.model('User', userSchema);
export const ProgressModel =
  mongoose.models.Progress || mongoose.model('Progress', progressSchema);
