import { Address, CartItem, Order, PendingOrder, User } from "@src/interfaces/interfaces";
import { handleError } from "./error";
import { getPendingOrderDocByDocID, updatePendingOrderDocByDocID } from "@src/controllers/pendingOrder";
import Cart from "@src/classes/Cart";
import { createOrder } from "@src/controllers/order";
import HttpStatusCodes from "@src/constants/HttpStatusCodes";
import { getUserByID } from "@src/controllers/user";
import { getOrderPlacedMailOptions } from "@src/constants/emails";
import { transporter } from "@src/server";
import jwt from 'jsonwebtoken';

export const getSelectionName = function(cartItem:CartItem){
  if (cartItem.itemData.cat==='bagel' && cartItem.selection==='six') return 'Six Pack(s)';
  if (cartItem.itemData.cat==='bagel' && cartItem.selection==='dozen') return 'Dozen(s)';
  if (cartItem.itemData.cat==='spread') return 'One Pound';
  if (cartItem.itemData.cat==='pastry') return 'Six Pack(s)';

  return 'N/A';
};

export const handleOrderPayment = async function(event:any,res:any){
  const checkoutSessionCompleted = event.data.object;
  //get required properties to create the order doc from the payment intent
  const userID:string = checkoutSessionCompleted.metadata.userID;
  const shippingAddress:Address = {
    line1: checkoutSessionCompleted.customer_details.address.line1,
    line2: checkoutSessionCompleted.customer_details.address.line2 || undefined,
    city: checkoutSessionCompleted.customer_details.address.city,
    state: checkoutSessionCompleted.customer_details.address.state,
    postal_code: checkoutSessionCompleted.customer_details.address.postal_code,
    country: checkoutSessionCompleted.customer_details.address.country,
    phone: checkoutSessionCompleted.customer_details.phone,
    fullName: checkoutSessionCompleted.customer_details.name
  }; 
  const giftMessage:string = checkoutSessionCompleted.metadata.giftMessage || '';
  const pendingOrderDocID:string = checkoutSessionCompleted.metadata.pendingOrderID;
  //get pending order from mongoDB
  let pendingOrder:PendingOrder | null = await getPendingOrderDocByDocID(pendingOrderDocID);
  //validate all required fields were provided
  if (!pendingOrder || !shippingAddress) throw new Error('Missing either a shipping address or a pending order.');

  //get cart payload from token
  let cart:Cart | undefined;
  jwt.verify(
    pendingOrder.cartToken, process.env.SECRET as jwt.Secret,
    async (err:any, payload:any) => {
      //an error was found when verifying the bearer token
      if (err) {
        return res.status(403).json({
          isValid: false,
          message: 'Forbidden',
        });
      };
      //MUST BE SET TO PAYLOAD.CART DO NOT USE REQ THIS IS HANDLED DIFFERENTLY THAN THE OTHERS!!!
      cart = new Cart(
        payload.cart.items,
        checkoutSessionCompleted.amount_subtotal /100,
        checkoutSessionCompleted.total_details.amount_tax / 100,
        checkoutSessionCompleted.total_details.amount_discount / 100,
        checkoutSessionCompleted.amount_total /100,
        new Date(payload.cart.desiredShipDate)
      );
      //we don't have a field for the total quantity calculations so we will calculate it here, we can just put this in the cart constructor
      cart.calcTotalQuantity();
    }
  );
  
  //verify the cart was successfully validated
  if (!cart) throw new Error('A cart was not found or is not valid.');
  try{
    const orderDoc: Order = await createOrder(
      userID,
      cart,
      shippingAddress,
      giftMessage
    );
    if (!orderDoc) throw new Error('An error has occured when updating the order doc.');

    //update the pending order do with the order DOC ID
    let updatedPendingOrder:PendingOrder = pendingOrder;
    //if the updated pending order already has an orderID that means an order was already placed
    //PREVENTS DUPLICATE ORDERS
    try{
      if (pendingOrder.orderID) throw new Error('A duplicate order was prevented. This order has already been processed.');
    }catch(err){
      handleError(res,HttpStatusCodes.CONFLICT,err);
    };
    updatedPendingOrder.orderID = orderDoc._id.toString();
    await updatePendingOrderDocByDocID(pendingOrder._id.toString(),updatedPendingOrder);
    //retrieve user info so we can get their email
    const userDoc:User | null = await getUserByID(orderDoc.userID);
    if (!userDoc) throw new Error('No user doc found!');
    //email user that order was successfully placed
    await transporter.sendMail(getOrderPlacedMailOptions(userDoc.email,orderDoc));
    // Return a 200 response to acknowledge receipt of the event
    res.status(HttpStatusCodes.OK).send();
  }catch(err){
    handleError(res,HttpStatusCodes.NOT_MODIFIED,err);
  };
}