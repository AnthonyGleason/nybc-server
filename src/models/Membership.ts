import mongoose from "mongoose";

const MembershipSchema = new mongoose.Schema({
  expirationDate:{ //doubles as an expiration date
    type:Date,
  },
  tier:{
    type:String,
    default:"Non-Member"
  },
  userID:{
    type:String,
    required:true
  },
  deliveriesLeft:{
    type:Number,
    default: 0
  }
});

export const MembershipModel = mongoose.model('Membership',MembershipSchema);