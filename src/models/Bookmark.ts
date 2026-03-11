import mongoose, { Document, Schema } from 'mongoose';

export interface IBookmark extends Document {
  user: mongoose.Types.ObjectId;
  article: mongoose.Types.ObjectId;
  createdAt: Date;
  folder?: string;
  notes?: string;
}

const BookmarkSchema = new Schema<IBookmark>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    article: {
      type: Schema.Types.ObjectId,
      ref: 'Article',
      required: true,
    },
    folder: {
      type: String,
      trim: true,
      default: 'General',
    },
    notes: {
      type: String,
      maxlength: 500,
    },
  },
  {
    timestamps: true,
  }
);

// Compound unique index to prevent duplicate bookmarks
BookmarkSchema.index({ user: 1, article: 1 }, { unique: true });

// Index for folder-based queries
BookmarkSchema.index({ user: 1, folder: 1 });

// Index for sorting by creation date
BookmarkSchema.index({ user: 1, createdAt: -1 });

export const Bookmark = mongoose.model<IBookmark>('Bookmark', BookmarkSchema);
