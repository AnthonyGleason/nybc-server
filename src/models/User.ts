import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
  firstName:{
    type: String,
    required: true,
  },
  lastName:{
    type: String,
    required: true,
  },
  email:{
    type:String,
    required: true,
  },
  hashedPassword:{
    type: String,
    required: true,
  },
  group:{
    type:String,
    default: 'user',
  },
  dateCreated:{
    type: Date,
    required: true,
    default: Date.now(),
  },
  frozen:{
    type:Boolean,
    default: false
  }
});

export const UserModel = mongoose.model('User',UserSchema);