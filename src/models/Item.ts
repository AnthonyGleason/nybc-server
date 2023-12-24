import mongoose from 'mongoose';

const ItemSchema = new mongoose.Schema({
  name:{
    type: String,
    required: true,
  },
  price:{
    type: Number,
  },
  sixPrice:{
    type:Number,
  },
  dozenPrice:{
    type:Number,
  },
  twoPrice:{
    type:Number,
  },
  cat:{
    type: String,
  }
});

export const ItemModel = mongoose.model('Item',ItemSchema);