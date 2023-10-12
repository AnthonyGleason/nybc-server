import { Address, CartInterface, Order } from "@src/interfaces/interfaces";
import { OrderModel } from "@src/models/Order";

//create a new order
export const createOrder = async function(
  userID:string,
  totalAmount:number,
  cart:CartInterface,
  shippingAddress:Address,
  giftMessage?:string
  ):Promise<Order>{
  return await OrderModel.create({
    userID: userID,
    totalAmount:totalAmount,
    cart:cart,
    shippingAddress:shippingAddress,
    giftMessage:giftMessage
  });
};

//update an existing order by orderID
export const updateOrderByOrderID = async function(updatedOrder:Order,orderID:string):Promise<Order | null>{
  return await OrderModel.findByIdAndUpdate(orderID,updatedOrder);
};

//get an existing order by orderID
export const getOrderByOrderID = async function(orderID:string):Promise<Order | null>{
  return await OrderModel.findById(orderID);
};

//get all orders by userID
export const getAllOrdersByUserID = async function(userID:string):Promise<Order[] | null>{
  return await OrderModel.find({userID: userID});
};

export const getAllOrders = async function():Promise<Order[] | null>{
  return await OrderModel.find({});
};

//delete an existing order by orderID
export const deleteOrderByOrderID = async function(orderID:string){
  return await OrderModel.findByIdAndDelete(orderID);
};