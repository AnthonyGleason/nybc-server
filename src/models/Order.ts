import mongoose from "mongoose"

const OrderSchema = new mongoose.Schema({
  dateCreated:{
    type: Date,
    required: true,
    default: Date.now()
  },
  userID:{
    type: String,
    ref: 'User',
    required: true
  },
  status:{
    type: String,
    required: true,
    default: 'Pending',
  },
  totalAmount:{
    type: Number,
    required:true
  },
  cart:{
    type: Object,
    required: true
  },
  shippingAddress:{
    type: Object,
    required: true,
  },
  trackingNumber:{
    type: String
  },
  giftMessage:{
    type: String,
  },
  promoCodeID:{
    type: String,
  }
});

export const OrderModel = mongoose.model('Order',OrderSchema);