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
  try{
    //get required properties to create the order doc from the payment intent
    //metadata is added when the checkout session is created
    const userID:string =  event.data.object.metadata.userID; 
    if (!userID) throw new Error('A userID was not found!');

    const pendingOrderDocID:string =  event.data.object.metadata.pendingOrderID;
    if (!pendingOrderDocID) throw new Error('Unable to process order because a pending order docID was not provided.');
    
    //gift message is not required
    const giftMessage:string =  event.data.object.metadata.giftMessage || '';

    //shipping address is required
    const shippingAddress:Address = {
      line1:  event.data.object.shipping_details.address.line1,
      line2:  event.data.object.shipping_details.address.line2 || undefined,
      city:  event.data.object.shipping_details.address.city,
      state:  event.data.object.shipping_details.address.state,
      postal_code:  event.data.object.shipping_details.address.postal_code,
      country:  event.data.object.shipping_details.address.country,
      phone:  event.data.object.customer_details.phone,
      fullName:  event.data.object.shipping_details.name
    }; 
    //verify shipping address fields were provided
    if (!shippingAddress.line1) throw new Error("Shipping address line1 is not provided");
    if (!shippingAddress.city) throw new Error("Shipping address city is not provided");
    if (!shippingAddress.state) throw new Error("Shipping address state is not provided");
    if (!shippingAddress.postal_code) throw new Error("Shipping address postal code is not provided");
    if (!shippingAddress.country) throw new Error("Shipping address country is not provided");
    if (!shippingAddress.phone) throw new Error("Shipping address phone is not provided");
    if (!shippingAddress.fullName) throw new Error("Shipping address full name is not provided");

    //get pending order from mongoDB
    let pendingOrderDoc:PendingOrder | null = null;
    try{
      pendingOrderDoc = await getPendingOrderDocByDocID(pendingOrderDocID);
      if (!pendingOrderDoc ) throw new Error('A pending order doc was not found or does not exist.');
      //if the updated pending order already has an orderID that means an order was already placed (duplicate order)
      try{
        if (pendingOrderDoc.orderID) throw new Error('A duplicate order was prevented. This order has already been processed.');
      }catch(err){
        handleError(res,HttpStatusCodes.CONFLICT,err);
      };

      //get cart payload from token
      let cart:Cart | undefined;
      jwt.verify(
        pendingOrderDoc.cartToken, process.env.SECRET as jwt.Secret,
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
            event.data.object.amount_subtotal /100,
            event.data.object.total_details.amount_tax / 100,
            event.data.object.total_details.amount_discount / 100,
            event.data.object.amount_total /100,
            new Date(payload.cart.desiredShipDate)
          );
          //we don't have a field for the total quantity calculations so we will calculate it here, we can just put this in the cart constructor
          cart.calcTotalQuantity();
        }
      );
      //verify the cart was successfully validated
      if (!cart) throw new Error('A cart was not found or is not valid.');

      const orderDoc: Order = await createOrder(
        userID,
        cart,
        shippingAddress,
        giftMessage
      );
      if (!orderDoc) throw new Error('An error has occured when updating the order doc.');

      //update the pending order doc with the order DOC ID
      let updatedPendingOrder:PendingOrder = pendingOrderDoc;
      updatedPendingOrder.orderID = orderDoc._id.toString();
      await updatePendingOrderDocByDocID(pendingOrderDoc._id.toString(),updatedPendingOrder);

      //retrieve user info so we can get their email
      const userDoc:User | null = await getUserByID(orderDoc.userID);
      if (!userDoc) throw new Error('No user doc found!');
      
      //email user that order was successfully placed
      await transporter.sendMail(getOrderPlacedMailOptions(userDoc.email,orderDoc));
      
      return true;
    }catch(err){
      handleError(res,HttpStatusCodes.NOT_FOUND,err);
    };
  }catch(err){
    handleError(res,HttpStatusCodes.BAD_REQUEST,err);
  };
};