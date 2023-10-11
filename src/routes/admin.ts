import HttpStatusCodes from '@src/constants/HttpStatusCodes';
import { getAllOrders, getAllOrdersByUserID, getOrderByOrderID, updateOrderByOrderID } from '@src/controllers/order';
import { Order } from '@src/interfaces/interfaces';
import { authenticateAdmin, authenticateLoginToken } from '@src/middlewares/auth';
import {Router} from 'express';

//admin menu
const adminRouter = Router();

//get order data by order ID
adminRouter.get('/orders/:userID/:orderID', authenticateLoginToken,authenticateAdmin, async (req:any,res,next)=>{
  const orderID:string = req.params.orderID;
  const orderDoc:Order | null = await getOrderByOrderID(orderID);

  //check if order doc was found
  if (orderDoc){
    res.status(HttpStatusCodes.OK).json({order: orderDoc});
  }else{
    res.status(HttpStatusCodes.NOT_FOUND);
  };
});

//update order
adminRouter.put('/orders/:userID/:orderID', authenticateLoginToken, authenticateAdmin, async (req,res,next)=>{
  const orderID:string = req.params.orderID;
  const orderDoc: Order | null = await getOrderByOrderID(orderID);
  //destructure the req body
  const status:string = req.body.status;
  const trackingNumber:string = req.body.trackingNumber;
  const giftMessage:string = req.body.giftMessage;

  //an order doc must be found to proceed
  if (orderDoc){
    //make a copy of the order doc
    let updatedOrderDoc:Order = orderDoc;
    //update the order doc locally
    updatedOrderDoc.status = status;
    updatedOrderDoc.trackingNumber = trackingNumber;
    updatedOrderDoc.giftMessage = giftMessage;
    //push updated doc to mongodb
    const tempOrderDoc: Order | null = await updateOrderByOrderID(updatedOrderDoc,orderDoc._id as string);
    //order doc must have been successfully updated
    if (tempOrderDoc){
      res.status(HttpStatusCodes.OK).json({updatedOrder: tempOrderDoc});
    }else{
      res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR);
    };
  }else{
    res.status(HttpStatusCodes.NOT_FOUND);
  };
});

//get all orders that need to be shipped
adminRouter.get('/orders/pulls', authenticateLoginToken, authenticateAdmin, async (req,res,next)=>{

});

//get all orders for a user
adminRouter.get('/orders/:userID', authenticateLoginToken, authenticateAdmin, async (req,res,next)=>{
  const userID:string = req.params.userID;
  const orders: Order[] | null = await getAllOrdersByUserID(userID);
  if (orders){
    res.status(HttpStatusCodes.OK).json({orders: orders});
  }else{
    res.status(HttpStatusCodes.NOT_FOUND);
  };
});

//get all orders
adminRouter.get('/orders/', authenticateLoginToken, authenticateAdmin, async (req,res,next)=>{
  const orders: Order[] | null = await getAllOrders();
  if (orders){
    res.status(HttpStatusCodes.OK).json({orders: orders});
  }else{
    res.status(HttpStatusCodes.NOT_FOUND);
  };
});

//create a shipping label for order

export default adminRouter