import mongoose from "mongoose";

const MembershipSchema = new mongoose.Schema({
  renewalDate:{ //doubles as an expiration date
    type:Date,
  },
  tier:{
    type:String,
    default:"Non-Member"
  },
  userID:{
    type:String,
    required:true
  }
});

export const MembershipModel = mongoose.model('Membership',MembershipSchema);