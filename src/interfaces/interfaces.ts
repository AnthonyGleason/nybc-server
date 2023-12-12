import mongoose from "mongoose"

//user
export interface User{
  firstName:string,
  lastName:string,
  email:string,
  hashedPassword:string,
  group?:string,
  dateCreated:Date,
  frozen:boolean,
  _id:string | mongoose.Types.ObjectId //unique id given by mongodb
};

export interface SpreadItem extends Product{
  price: number
};

//item
export interface BagelItem extends Product{
  dozenPrice:number,
  sixPrice:number
};

export interface PastryItem extends Product{
  price: number
};

export interface CartItem{
  itemData: BagelItem | SpreadItem,
  selection?: string
  quantity: number,
  unitPriceInDollars: number,
};

export interface Product{
  price: number;
  name: string;
  _id: string;
  cat: string;
}

export interface Address{
  line1:string,
  line2?:string,
  city:string,
  state:string,
  postal_code:string,
  country:string,
  phone: string,
  fullName: string
};

export interface CartInterface{
  items:CartItem[];
  subtotalInDollars:number;
  taxInDollars:number;
  totalQuantity:number;
  discountAmountInDollars:number;
  finalPriceInDollars:number;
  desiredShipDate:Date;
};

//order
export interface Order{
  dateCreated:Date,
  userID:string,
  status:string,
  cart:CartInterface,
  shippingAddress:Address,
  trackingNumberArr?:string[],
  giftMessage?:string
  _id: string | mongoose.Types.ObjectId // unique id given by mongodb
};

//membership
export interface Membership{
  expirationDate?: Date,
  tier: string,
  userID: string,
  deliveriesLeft: number
  _id: string | mongoose.Types.ObjectId //unique id given by mongodb
};

export interface PasswordReset{
  email: string,
  resetID: string,
  dateCreated: Date,
  _id: string //unique id given by mongodb
};

export interface TempCartToken{
  userID: string,
  cartToken: string
};

export interface PendingOrder{
  cartToken:string,
  userID:string,
  dateCreated: Date,
  orderID?:string,
  _id: string | mongoose.Types.ObjectId //mongodb unique id
};