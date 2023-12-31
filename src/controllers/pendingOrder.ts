import { PendingOrder } from "@src/interfaces/interfaces";
import { PendingOrderModel } from "@src/models/PendingOrder";

//create a pending order doc
export const createPendingOrderDoc = async function(cartToken:string,userID:string){
  return await PendingOrderModel.create({
    cartToken: cartToken,
    userID: userID
  });
};

//get a pending order doc by cart token
export const getPendingOrderDocByCartToken = async function(cartToken:string):Promise<PendingOrder | null>{
  return await PendingOrderModel.findOne({
    cartToken: cartToken
  });
};

//get a pending order doc by cart token
export const getPendingOrderDocByDocID= async function(docID:string):Promise<PendingOrder | null>{
  return await PendingOrderModel.findById(docID);
};

export const getPendingOrderDocByUserID= async function(userID:string):Promise<PendingOrder | null>{
  return await PendingOrderModel.findOne({
    userID: userID
  });
};

export const updatePendingOrderDocByDocID = async function(docID:string, updatedPendingOrderDoc:PendingOrder):Promise<PendingOrder | null>{
  return await PendingOrderModel.findByIdAndUpdate(docID,updatedPendingOrderDoc, { new: true });
};

//delete a pending order doc by cart token
export const deletePendingOrderDocByCartToken = async function(cartToken:string){
  return await PendingOrderModel.findOneAndDelete({
    cartToken: cartToken
  });
};
