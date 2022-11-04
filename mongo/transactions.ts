import { Schema, model, models } from 'mongoose';

interface TransData {
  marketplace: string,
  signature: string;
  instruction: string;
  data: any;
}

const dataSchema = new Schema<TransData>(
  {
    marketplace: { type: String, required: true },
    signature: { type: String, required: true },
    instruction: { type: String, required: true },
    data: { type: Array }
  },
  {
    timestamps: true,
  }
);

dataSchema.set('timestamps', true);

export const Transactions = models.transactions || model<TransData>('transactions', dataSchema);
