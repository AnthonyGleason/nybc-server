import HttpStatusCodes from '@src/constants/HttpStatusCodes';
import { getMembershipByUserID } from '@src/controllers/membership';
import { getAllOrders, getAllOrdersByUserID, getAllPendingOrders, getAllProcessingOrders, getOrderByOrderID, searchForOrderByOrderID, searchForUserByUserID, updateOrderByOrderID } from '@src/controllers/order';
import { getPasswordResetByEmail } from '@src/controllers/passwordReset';
import { handleError } from '@src/helpers/error';
import { isPasswordResetExpired } from '@src/helpers/passwordReset';
import { Membership, Order, PasswordReset, User } from '@src/interfaces/interfaces';
import { authenticateAdmin, authenticateLoginToken } from '@src/middlewares/auth';
import {Router} from 'express';

//admin menu
const adminRouter = Router();

adminRouter.post('/users/passwordResetStatus',authenticateLoginToken,authenticateAdmin,async (req:any,res,next)=>{
  const email:string = req.body.email;
  try{
    const passwordResetDoc: PasswordReset | null = await getPasswordResetByEmail(email);
    if (!passwordResetDoc) throw new Error('A password reset doc was not found.');
    const isExpired:boolean = isPasswordResetExpired(passwordResetDoc); 
    if (isExpired){
      res.status(HttpStatusCodes.UNAUTHORIZED).json({isExpired: isExpired});
    }else{
      res.status(HttpStatusCodes.OK).json({isExpired: isExpired});
    }
  }catch(err){
    handleError(res,HttpStatusCodes.NOT_FOUND,err);
  };
});

//search for order by orderID
adminRouter.get('/orders/search/:searchQuery',authenticateLoginToken,authenticateAdmin, async (req:any,res,next)=>{
  //get the search query from the request params
  const searchQuery:string = req.params.searchQuery;
  const orderResults:Order[] | null = await searchForOrderByOrderID(searchQuery);
  if (orderResults && orderResults.length!==0){
    res.status(HttpStatusCodes.OK).json({'results': orderResults});
  }else{
    res.status(HttpStatusCodes.NOT_FOUND).json({});
  }
});

//get all orders that need to be shipped (basically returns all orders that are pending)
adminRouter.get('/orders/pending', authenticateLoginToken, authenticateAdmin, async (req,res,next)=>{
  try{
    const orders:Order[] | null = await getAllPendingOrders();
    if (!orders || orders.length===0) throw new Error('No orders were found. More orders should come in soon!');
    res.status(HttpStatusCodes.OK).json({orders: orders});
  }catch(err){
    handleError(res,HttpStatusCodes.NOT_FOUND,err);
  };
});

adminRouter.get('/orders/processing', authenticateLoginToken, authenticateAdmin, async (req,res,next)=>{
  try{
    const orders:Order[] | null = await getAllProcessingOrders();
    if (!orders || orders.length===0) throw new Error('No orders were found. More orders should come in soon!');
    res.status(HttpStatusCodes.OK).json({orders: orders});
  }catch(err){
    handleError(res,HttpStatusCodes.NOT_FOUND,err);
  };
});
//get all orders for a user
adminRouter.get('/orders/users/:userID', authenticateLoginToken, authenticateAdmin, async (req,res,next)=>{
  const userID:string = req.params.userID;
  try{
    const orders: Order[] | null = await getAllOrdersByUserID(userID);
    if (!orders || orders.length===0) throw new Error('No orders were found for the specified user.');
    res.status(HttpStatusCodes.OK).json({orders: orders});
  }catch(err){
    handleError(res,HttpStatusCodes.NOT_FOUND,err);
  };
});

//get order data by order ID
adminRouter.get('/orders/:orderID', authenticateLoginToken,authenticateAdmin, async (req:any,res,next)=>{
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
adminRouter.put('/orders/:orderID', authenticateLoginToken, authenticateAdmin, async (req,res,next)=>{
  const orderID:string = req.params.orderID;

  //destructure the req body
  const {
    status,
    trackingNumberArr,
    giftMessage
  }:{
    status:string,
    trackingNumberArr:string[],
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
    updatedOrderDoc.trackingNumberArr = trackingNumberArr;
    updatedOrderDoc.giftMessage = giftMessage;
    //push updated doc to mongodb
    try{
      const tempOrderDoc: Order | null = await updateOrderByOrderID(updatedOrderDoc,orderDoc._id as string);
      //order doc must have been successfully updated
      if (!tempOrderDoc) throw new Error('An error occured when updating the order please try again later.');
      res.status(HttpStatusCodes.OK).json({updatedOrder: updatedOrderDoc});
    }catch(err){
      handleError(res,HttpStatusCodes.INTERNAL_SERVER_ERROR,err);
    };
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

//search for users by userID
adminRouter.get('/users/search/:searchQuery',authenticateLoginToken,authenticateAdmin, async (req:any,res,next)=>{
  //get the search query from the request params
  const searchQuery:string = req.params.searchQuery;
  try{
    const userResults :User[] | null = await searchForUserByUserID(searchQuery);
    if (!userResults|| userResults.length===0) throw new Error('A user was not found for the provided userID');
    res.status(HttpStatusCodes.OK).json({'results': userResults});
  }catch(err){
    handleError(res,HttpStatusCodes.NOT_FOUND,err);
  }
});

adminRouter.get('/users/memberships/:userID',authenticateLoginToken,authenticateAdmin, async (req:any,res,next)=>{
  const userID:string = req.params.userID;
  try{
    const membershipDoc:Membership | null = await getMembershipByUserID(userID);
    if (!membershipDoc) throw new Error('A membership doc was not found.');
    res.status(HttpStatusCodes.OK).json({'membershipDoc': membershipDoc});
  }catch(err){
    handleError(res,HttpStatusCodes.NOT_FOUND,err);
  };
});

export default adminRouter;