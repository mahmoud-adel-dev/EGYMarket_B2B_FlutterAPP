import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export interface IShippingRate extends Document {
  _id: Types.ObjectId;
  shipper_organization_id: Types.ObjectId;
  from_governorate: string;
  to_governorate: string;
  price_piasters: number;
  estimated_days: number;
  is_active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ShippingRateSchema = new Schema<IShippingRate>(
  {
    shipper_organization_id: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    from_governorate: { type: String, required: true, trim: true },
    to_governorate: { type: String, required: true, trim: true },
    price_piasters: { type: Number, required: true, min: 0 },
    estimated_days: { type: Number, required: true, min: 1 },
    is_active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

ShippingRateSchema.index(
  { shipper_organization_id: 1, from_governorate: 1, to_governorate: 1 },
  { unique: true }
);

const ShippingRate: Model<IShippingRate> =
  mongoose.models.ShippingRate || mongoose.model<IShippingRate>('ShippingRate', ShippingRateSchema);
export default ShippingRate;
