import mongoose, { Document, Schema, Model } from 'mongoose';

export interface INotification extends Document {
  user?: mongoose.Types.ObjectId;
  type: 'daily_digest' | 'breaking_news' | 'topic_alert' | 'system';
  title: string;
  body: string;
  data?: Record<string, string>;
  articleIds: mongoose.Types.ObjectId[];
  sentAt: Date;
  status: 'pending' | 'sent' | 'failed';
  errorMessage?: string;
  deviceTokens: string[];
  successCount: number;
  failureCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    type: {
      type: String,
      enum: ['daily_digest', 'breaking_news', 'topic_alert', 'system'],
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    body: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    data: {
      type: Map,
      of: String,
    },
    articleIds: [{
      type: Schema.Types.ObjectId,
      ref: 'Article',
    }],
    sentAt: {
      type: Date,
    },
    status: {
      type: String,
      enum: ['pending', 'sent', 'failed'],
      default: 'pending',
      index: true,
    },
    errorMessage: {
      type: String,
    },
    deviceTokens: [{
      type: String,
    }],
    successCount: {
      type: Number,
      default: 0,
    },
    failureCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ type: 1, status: 1 });

export const Notification: Model<INotification> = mongoose.model<INotification>('Notification', notificationSchema);

export default Notification;
