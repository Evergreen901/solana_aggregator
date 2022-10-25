import { Schema, model } from 'mongoose';

interface TransData {
  marketplace: string,
  signature: string;
  instruction: string;
  data: any;
}

const dataSchema = new Schema<TransData>({
  marketplace: { type: String, required: true },
  signature: { type: String, required: true },
  instruction: { type: String, required: true },
  data: { type: Array }
});

export const Transactions = model<TransData>('transactions', dataSchema);
