import mongoose, { Document, Schema, Model } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IUser extends Document {
  email: string;
  password: string;
  displayName?: string;
  avatarUrl?: string;
  preferences: {
    categories: string[];
    notificationsEnabled: boolean;
    notificationTime: string;
    darkMode: boolean;
  };
  bookmarks: mongoose.Types.ObjectId[];
  readHistory: Array<{
    article: mongoose.Types.ObjectId;
    readAt: Date;
  }>;
  deviceTokens: string[];
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 8,
      select: false,
    },
    displayName: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    avatarUrl: {
      type: String,
      trim: true,
    },
    preferences: {
      categories: [{
        type: String,
        trim: true,
      }],
      notificationsEnabled: {
        type: Boolean,
        default: true,
      },
      notificationTime: {
        type: String,
        default: '08:00',
      },
      darkMode: {
        type: Boolean,
        default: true,
      },
    },
    bookmarks: [{
      type: Schema.Types.ObjectId,
      ref: 'Article',
    }],
    readHistory: [{
      article: {
        type: Schema.Types.ObjectId,
        ref: 'Article',
      },
      readAt: {
        type: Date,
        default: Date.now,
      },
    }],
    deviceTokens: [{
      type: String,
      trim: true,
    }],
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLoginAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error as Error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

// Index for read history queries
userSchema.index({ 'readHistory.readAt': -1 });

export const User: Model<IUser> = mongoose.model<IUser>('User', userSchema);

export default User;
