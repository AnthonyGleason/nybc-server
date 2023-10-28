import mongoose from "mongoose";

const PendingOrderSchema = new mongoose.Schema({
  cartToken:{
    type:String,
    required: true
  },
  userID:{
    type:String,
    required:true
  }
});

export const PendingOrderModel = mongoose.model('PendingOrder',PendingOrderSchema);