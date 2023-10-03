import mongoose from "mongoose"

const OrderSchema = new mongoose.Schema({
  dateCreated:{
    type: Date,
    required: true,
    default: Date.now()
  },
  userID:{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status:{
    type: String,
    required: true,
    default: 'Pending',
  }
});

export const OrderModel = mongoose.model('Order',OrderSchema);