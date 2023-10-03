import { Order } from "@src/interfaces/interfaces";
import { OrderModel } from "@src/models/Order";

//create a new order
export const createOrder = async function(userID:string){
  return await OrderModel.create({
    userID: userID,
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