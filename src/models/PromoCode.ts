import mongoose from "mongoose";

const PromoCodeSchema = new mongoose.Schema({
  code:{
    type:String,
    required: true
  },
  dateOfExpiry:{
    type:Date,
    default: new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })), //if a date wasn't provided the code instantly expires
    required: true
  },
  totalAllowedUses:{
    type:Number
  },
  totalTimesUsed:{
    type:Number,
    required: true,
    default: 0
  },
  createdByUserID:{
    type: String,
    required: true
  },
  description:{
    type: String,
    required: true
  },
  disabled: {
    type: Boolean,
    required: true,
    default: true //disables the promo code by default
  },
  perk:{
    type: String, // for example "Free Shipping", "15% Off", "$25 Off"
    required: true
  }
});

export const PromoCodeModel = mongoose.model('PromoCode',PromoCodeSchema);