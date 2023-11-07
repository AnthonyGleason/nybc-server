import { Address, CartInterface, Order, User } from "@src/interfaces/interfaces";
import { OrderModel } from "@src/models/Order";
import { UserModel } from "@src/models/User";

//create a new order
export const createOrder = async function(
  userID:string,
  cart:CartInterface,
  shippingAddress:Address,
  giftMessage?:string,
  ):Promise<Order>{
  return await OrderModel.create({
    userID: userID,
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

//search for an order by orderID
export const searchForOrderByOrderID = async function(orderID:string):Promise<Order[] | null>{
  const allOrders = await OrderModel.find({}); // Fetch all orders
  
  // Filter the orders based on the partialID
  const matchingOrders = allOrders.filter(order => order._id.toString().includes(orderID));

  return matchingOrders;
};

//search for a user by userID
export const searchForUserByUserID = async function(userID:string):Promise<User[] | null>{
  const allUsers = await UserModel.find({}); // Fetch all orders
  
  // Filter the orders based on the partialID
  const matchingOrders = allUsers.filter(user => user._id.toString().includes(userID));

  return matchingOrders;
};

//return the most recent order for a user
export const getMostRecentOrderByUserID = async function(userID: string): Promise<Order | null> {
  return await OrderModel
    .findOne({ userID: userID })
    .sort({ dateCreated: -1 }) // Sort in descending order
    .exec();
};

//get all pending orders
export const getAllPendingOrders = async function():Promise<Order[] | null>{
  return await OrderModel.find({status: 'Pending'});
};

export const getAllOrders = async function():Promise<Order[] | null>{
  return await OrderModel.find({});
};

//delete an existing order by orderID
export const deleteOrderByOrderID = async function(orderID:string){
  return await OrderModel.findByIdAndDelete(orderID);
};