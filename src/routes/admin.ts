import HttpStatusCodes from '@src/constants/HttpStatusCodes';
import { getAllOrders, getAllOrdersByUserID, getAllPendingOrders, getOrderByOrderID, updateOrderByOrderID } from '@src/controllers/order';
import { handleError } from '@src/helpers/error';
import { Order } from '@src/interfaces/interfaces';
import { authenticateAdmin, authenticateLoginToken } from '@src/middlewares/auth';
import { error } from 'console';
import {Router} from 'express';

//admin menu
const adminRouter = Router();

adminRouter.get('/verifyAdmin',authenticateLoginToken,authenticateAdmin,async(req,res,next)=>{
  res.status(200).json({isAdmin: true});
});

//get order data by order ID
adminRouter.get('/orders/:userID/:orderID', authenticateLoginToken,authenticateAdmin, async (req:any,res,next)=>{
  //get the order id from the request params (url)
  const orderID:string = req.params.orderID;
  //initialize the orderDoc 
  let orderDoc: Order | null;
  //attempt to get the order doc
  try{
    orderDoc =  await getOrderByOrderID(orderID);
    if (!orderDoc) throw new Error('An order doc was not found.');
    res.status(HttpStatusCodes.OK).json({order: orderDoc});
  }catch(err){
    //order doc was not found
    handleError(res,HttpStatusCodes.NOT_FOUND,err);
  };
});

//update order
adminRouter.put('/orders/:userID/:orderID', authenticateLoginToken, authenticateAdmin, async (req,res,next)=>{
  const orderID:string = req.params.orderID;

  //destructure the req body
  const {
    status,
    trackingNumber,
    giftMessage
  }:{
    status:string,
    trackingNumber:string,
    giftMessage:string
  } = req.body;

  //attempt to get the an order doc from mongodb
  try{
    //initialize the order doc
    let orderDoc: Order | null = null;
    orderDoc = await getOrderByOrderID(orderID);
    //order doc was not found
    if (!orderDoc) throw new Error('An order was not found.');
    //make a copy of the order doc
    let updatedOrderDoc:Order = orderDoc;
    //update the order doc locally
    updatedOrderDoc.status = status;
    updatedOrderDoc.trackingNumber = trackingNumber;
    updatedOrderDoc.giftMessage = giftMessage;

    //push updated doc to mongodb
    try{
      const tempOrderDoc: Order | null = await updateOrderByOrderID(updatedOrderDoc,orderDoc._id as string);
      //order doc must have been successfully updated
      if (!tempOrderDoc) throw new Error('An error occured when updating the order please try again later.');
      res.status(HttpStatusCodes.OK).json({updatedOrder: tempOrderDoc});
    }catch(err){
      handleError(res,HttpStatusCodes.INTERNAL_SERVER_ERROR,err);
    };
  }catch(err){
    handleError(res,HttpStatusCodes.NOT_FOUND,err);
  };
});

//get all orders that need to be shipped (basically returns all orders that are pending)
adminRouter.get('/orders/pending', authenticateLoginToken, authenticateAdmin, async (req,res,next)=>{
  try{
    const orders:Order[] | null = await getAllPendingOrders();
    if (!orders) throw new Error('No orders were found. More orders should come in soon!');
    res.status(HttpStatusCodes.OK).json({orders: orders});
  }catch(err){
    handleError(res,HttpStatusCodes.NOT_FOUND,err);
  };
});

//get all orders for a user
adminRouter.get('/orders/:userID', authenticateLoginToken, authenticateAdmin, async (req,res,next)=>{
  const userID:string = req.params.userID;
  try{
    const orders: Order[] | null = await getAllOrdersByUserID(userID);
    if (!orders) throw new Error('No orders were found for the specified user.');
    res.status(HttpStatusCodes.OK).json({orders: orders});
  }catch(err){
    handleError(res,HttpStatusCodes.NOT_FOUND,err);
  };
});

//get all orders
adminRouter.get('/orders/', authenticateLoginToken, authenticateAdmin, async (req,res,next)=>{
  try{
    const orders: Order[] | null = await getAllOrders();
    if (!orders) throw new Error('No orders were found.');
    res.status(HttpStatusCodes.OK).json({orders: orders});
  }catch(err){
    handleError(res,HttpStatusCodes.NOT_FOUND,err);
  };
});

export default adminRouter