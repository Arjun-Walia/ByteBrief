import mongoose, { Document, Schema, Model } from 'mongoose';

/**
 * AI-generated summary structure
 */
export interface IAISummary {
  title: string;
  summary: string;
  whyItMatters: string;
  generatedAt: Date;
  tokensUsed: number;
}

export interface IArticle extends Document {
  title: string;
  summary: string;
  content: string;
  sourceUrl: string;
  sourceName: string;
  imageUrl?: string;
  category: mongoose.Types.ObjectId;
  categorySlug: string;
  tags: string[];
  author?: string;
  publishedAt: Date;
  score: number;
  readTime: number;
  fingerprint: string;
  clusterId?: string;
  isFeatured: boolean;
  viewCount: number;
  bookmarkCount: number;
  /** AI-generated structured summary */
  aiSummary?: IAISummary;
  createdAt: Date;
  updatedAt: Date;
}

const articleSchema = new Schema<IArticle>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },
    summary: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    content: {
      type: String,
      default: '',
    },
    sourceUrl: {
      type: String,
      required: true,
      unique: true,
    },
    sourceName: {
      type: String,
      required: true,
      trim: true,
    },
    imageUrl: {
      type: String,
      trim: true,
    },
    category: {
      type: Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
    },
    categorySlug: {
      type: String,
      required: true,
      index: true,
    },
    tags: [{
      type: String,
      trim: true,
      lowercase: true,
    }],
    author: {
      type: String,
      trim: true,
    },
    publishedAt: {
      type: Date,
      required: true,
      index: true,
    },
    score: {
      type: Number,
      default: 0,
      index: true,
    },
    readTime: {
      type: Number,
      default: 5,
    },
    fingerprint: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    clusterId: {
      type: String,
      index: true,
    },
    isFeatured: {
      type: Boolean,
      default: false,
      index: true,
    },
    viewCount: {
      type: Number,
      default: 0,
    },
    bookmarkCount: {
      type: Number,
      default: 0,
    },
    aiSummary: {
      title: { type: String },
      summary: { type: String },
      whyItMatters: { type: String },
      generatedAt: { type: Date },
      tokensUsed: { type: Number, default: 0 },
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for common queries
articleSchema.index({ publishedAt: -1, score: -1 });
articleSchema.index({ categorySlug: 1, publishedAt: -1 });
articleSchema.index({ isFeatured: 1, publishedAt: -1 });

// Text index for search
articleSchema.index({ title: 'text', summary: 'text', tags: 'text' });

export const Article: Model<IArticle> = mongoose.model<IArticle>('Article', articleSchema);

export default Article;
