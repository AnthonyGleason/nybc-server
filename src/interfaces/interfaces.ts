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

export interface SpreadItem{
  price: number,
  name: string,
  _id: string //unique id given by mongodb,
  cat:string,
};

//item
export interface BagelItem{
  dozenPrice:number,
  fourPrice:number,
  name: string,
  _id: string, // unique id given by mongodb
  cat:string,
};

export interface CartItem{
  itemData: BagelItem | SpreadItem,
  selection?: string
  quantity: number,
  unitPrice: number,
};

//order
export interface Order{
  dateCreated:Date,
  userID:string,
  status:string,
  _id: string // unique id given by mongodb
};

//membership
export interface Membership{
  renewalDate?: Date,
  tier: string,
  userID: string,
  _id: string //unique id given by mongodb
};