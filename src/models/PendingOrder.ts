import mongoose from "mongoose";

const PendingOrderSchema = new mongoose.Schema({
  cartToken:{
    type:String,
    required: true
  },
  userID:{
    type:String,
    required:true
  },
  dateCreated:{
    type: Date,
    required: true,
    default: new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
  },
  orderID:{
    type:String,
    required:false,
  }
});

export const PendingOrderModel = mongoose.model('PendingOrder',PendingOrderSchema);