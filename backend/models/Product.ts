import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface IProduct extends Document {
  _id: Types.ObjectId;
  title: string;
  description: string;
  price: number;
  price_piasters: number;
  price_tiers: Array<{ min_quantity: number; unit_price_piasters: number }>;
  moq: number; // Minimum Order Quantity
  images: string[];
  video_urls: string[];
  category: string;
  tags: string[]; // Sub-category tags
  wholesaler_id: Types.ObjectId;
  organization_id?: Types.ObjectId;
  sku?: string;
  stock_quantity: number;
  reserved_quantity: number;
  unit: string;
  sale_type: 'piece' | 'pack' | 'carton' | 'pallet';
  units_per_sale: number;
  cost_price_piasters: number;
  discount_percent: number;
  lead_time_days: number;
  return_policy?: string;
  specifications: Record<string, string>;
  faqs: Array<{ question: string; answer: string }>;
  status: 'draft' | 'active' | 'out_of_stock' | 'archived';
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ProductSchema = new Schema<IProduct>(
  {
    title: {
      type: String,
      required: [true, 'Product title is required'],
      trim: true,
      index: true,
    },
    description: {
      type: String,
      required: [true, 'Product description is required'],
      trim: true,
    },
    price: {
      type: Number,
      required: false,
      min: [0, 'Price must be greater than or equal to 0'],
    },
    price_piasters: {
      type: Number,
      required: [true, 'Price in piasters is required'],
      min: [0, 'Price cannot be negative'],
    },
    price_tiers: {
      type: [
        new Schema(
          {
            min_quantity: { type: Number, required: true, min: 1 },
            unit_price_piasters: { type: Number, required: true, min: 0 },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    moq: {
      type: Number,
      required: [true, 'Minimum Order Quantity (MOQ) is required'],
      min: [1, 'MOQ must be at least 1'],
      default: 1,
    },
    images: {
      type: [String],
      required: [true, 'At least one product image is required'],
      validate: {
        validator: (v: string[]) => Array.isArray(v) && v.length > 0,
        message: 'Product must have at least one image URL',
      },
    },
    video_urls: {
      type: [String],
      default: [],
      validate: {
        validator: (values: string[]) => values.length <= 8,
        message: 'A product can have at most 8 videos',
      },
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      trim: true,
      index: true,
    },
    tags: {
      type: [String],
      default: [],
      index: true,
    },
    wholesaler_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: false,
      index: true,
    },
    organization_id: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: false,
      index: true,
    },
    sku: { type: String, trim: true, uppercase: true },
    stock_quantity: { type: Number, min: 0, default: 0 },
    reserved_quantity: { type: Number, min: 0, default: 0 },
    unit: { type: String, trim: true, default: 'قطعة' },
    sale_type: {
      type: String,
      enum: ['piece', 'pack', 'carton', 'pallet'],
      default: 'piece',
      index: true,
    },
    units_per_sale: { type: Number, min: 1, default: 1 },
    cost_price_piasters: { type: Number, min: 0, default: 0, select: false },
    discount_percent: { type: Number, min: 0, max: 95, default: 0 },
    lead_time_days: { type: Number, min: 0, max: 365, default: 1 },
    return_policy: { type: String, trim: true, maxlength: 1000 },
    specifications: { type: Map, of: String, default: {} },
    faqs: {
      type: [
        new Schema(
          {
            question: { type: String, required: true, trim: true, maxlength: 300 },
            answer: { type: String, required: true, trim: true, maxlength: 1000 },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    status: {
      type: String,
      enum: ['draft', 'active', 'out_of_stock', 'archived'],
      default: 'draft',
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for querying active products by category and wholesaler
ProductSchema.index({ category: 1, isActive: 1 });
ProductSchema.index({ wholesaler_id: 1, isActive: 1 });
ProductSchema.index({ organization_id: 1, status: 1 });
ProductSchema.index({ organization_id: 1, sku: 1 }, { unique: true, sparse: true });
ProductSchema.index({ title: 'text', description: 'text', category: 'text', tags: 'text' });

const Product: Model<IProduct> =
  mongoose.models.Product || mongoose.model<IProduct>('Product', ProductSchema);

export default Product;
