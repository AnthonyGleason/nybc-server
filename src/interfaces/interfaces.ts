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

//item
export interface Item{
  price: number,
  name: string,
  quantity: number,
  _id: string, // unique id given by mongodb
  index:number
};

//order
export interface Order{
  dateCreated:Date,
  userID:string,
  status:string,
  _id: string // unique id given by mongodb
}

//membership
export interface Membership{
  renewalDate?: Date,
  tier: string,
  userID: string,
  _id: string //unique id given by mongodb
}