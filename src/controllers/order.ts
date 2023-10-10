import { Address, CartInterface, Order } from "@src/interfaces/interfaces";
import { OrderModel } from "@src/models/Order";

//create a new order
export const createOrder = async function(
  userID:string,
  orderNum:string,
  totalAmount:number,
  cart:CartInterface,
  shippingAddress:Address,
  trackingNumber?:string,
  billingAddress?:Address,
  giftMessage?:string
  ){
  return await OrderModel.create({
    userID: userID,
    orderNum: orderNum,
    totalAmount:totalAmount,
    cart:cart,
    shippingAddress:shippingAddress,
    trackingNumber:trackingNumber,
    billingAddress:billingAddress,
    giftMessage:giftMessage,
  });
};

//update an existing order by orderID
export const updateOrderByOrderID = async function(updatedOrder:Order,orderID:string){
  return await OrderModel.findByIdAndUpdate(orderID,updatedOrder);
};

//get an existing order by orderID
export const getOrderByOrderID = async function(orderID:string){
  return await OrderModel.findById(orderID);
};

//get all orders by userID
export const getAllOrdersByUserID = async function(userID:string){
  return await OrderModel.find({userID: userID});
};

//delete an existing order by orderID
export const deleteOrderByOrderID = async function(orderID:string){
  return await OrderModel.findByIdAndDelete(orderID);
};