import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export interface ICart extends Document {
  _id: Types.ObjectId;
  buyer_organization_id: Types.ObjectId;
  items: Array<{ product_id: Types.ObjectId; quantity: number; added_at: Date }>;
  createdAt: Date;
  updatedAt: Date;
}

const CartSchema = new Schema<ICart>(
  {
    buyer_organization_id: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, unique: true },
    items: {
      type: [
        new Schema(
          {
            product_id: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
            quantity: { type: Number, required: true, min: 1 },
            added_at: { type: Date, default: Date.now },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
  },
  { timestamps: true }
);

const Cart: Model<ICart> = mongoose.models.Cart || mongoose.model<ICart>('Cart', CartSchema);
export default Cart;
