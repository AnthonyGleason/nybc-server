import mongoose from 'mongoose';

const ItemSchema = new mongoose.Schema({
  name:{
    type: String,
    required: true,
  },
  price:{
    type: Number,
  },
  fourPrice:{
    type:Number,
  },
  dozenPrice:{
    type:Number,
  },
  cat:{
    type: String,
  }
});

export const ItemModel = mongoose.model('Item',ItemSchema);