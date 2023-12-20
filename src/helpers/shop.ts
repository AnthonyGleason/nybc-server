import { Address, CartInterface, CartItem, Membership, Order, PendingOrder, Product, User } from "@src/interfaces/interfaces";
import { handleError } from "./error";
import { createPendingOrderDoc, getPendingOrderDocByDocID, getPendingOrderDocByUserID, updatePendingOrderDocByDocID } from "@src/controllers/pendingOrder";
import Cart from "@src/classes/Cart";
import { createOrder } from "@src/controllers/order";
import HttpStatusCodes from "@src/constants/HttpStatusCodes";
import { getUserByID } from "@src/controllers/user";
import { getOrderPlacedMailOptions } from "@src/constants/emails";
import { transporter } from "@src/server";
import jwt from 'jsonwebtoken';
import { getItemByID } from "@src/controllers/item";
import { getMembershipByUserID, updateMembershipByUserID } from "@src/controllers/membership";
import { redirectSuccessfulCheckoutsToLocalhost } from "@src/config/config";
import { stripe } from '@src/util/stripe';
import { issueCartJWTToken } from "./auth";

export const getSelectionName = function(cartItem:CartItem){
  if (cartItem.itemData.cat==='bagel' && cartItem.selection==='six') return 'Six Pack(s)';
  if (cartItem.itemData.cat==='bagel' && cartItem.selection==='dozen') return 'Dozen(s)';
  if (cartItem.itemData.cat==='bagel' && cartItem.selection==='two') return 'Two Pack(s)';

  //need to have this first because the current store items without category of spread show 
  if (cartItem.itemData.cat==='spread' && cartItem.selection==='halflb') return '1/2 LB';
  if (cartItem.itemData.cat==='spread') return 'One Pound';
  
  if (cartItem.itemData.cat==='pastry') return 'Six Pack(s)';
  if (cartItem.itemData.cat==='mystery') return 'Single(s)';
  return 'N/A';
};

export const handleCreateGuestCheckoutSession = async function(req:any,res:any){
  const guestID:string = `guest${await generateUniqueGuestUserID()}`;

  let membershipTier:string = 'Non-Member';
  let cart:Cart | null = null;
  try{
    if (!req.body.shipDate || typeof req.body.shipDate === undefined || req.body.shipDate.toString() ==='undefined') throw new Error('A ship date was not provided.');
  }catch(err){
    handleError(res,HttpStatusCodes.BAD_REQUEST,err);
  };

  try{
    cart = new Cart(
      req.payload.cartPayload.cart.items,
      req.payload.cartPayload.cart.subtotalInDollars,
      req.payload.cartPayload.cart.taxInDollars,
      req.payload.cartPayload.cart.discountAmountInDollars,
      req.payload.cartPayload.cart.finalPriceInDollars || 0,
      new Date(req.body.shipDate),
      true
    );
    if (!cart || cart.isCartEmpty()) throw new Error('You cannot proceed to checkout with an empty cart.');
    
    //cleanup cart
    await cart.cleanupCart(membershipTier);
  }catch(err){
    handleError(res,HttpStatusCodes.BAD_REQUEST,err);
  };

  //sign new cart token so date is saved to cart
  const updatedCartToken:string = issueCartJWTToken(cart);
  //store the token temporarily because it is too long to be sent through stripe
  const pendingOrderDoc:PendingOrder = await createPendingOrderDoc(updatedCartToken,guestID);

  try{
    if (!pendingOrderDoc) throw new Error('A pending order doc was not found!');
    if (!cart || cart.isCartEmpty()) throw new Error('You cannot proceed to checkout with an empty cart.');
    const giftMessage:string = req.body.giftMessage || '';
    //create session
    const session = await stripe.checkout.sessions.create({
      automatic_tax:{
        'enabled': true
      },
      metadata:{
        'pendingOrderID': pendingOrderDoc._id.toString(),
        'userID': guestID,
        'giftMessage': giftMessage
      },
      "phone_number_collection": {
        "enabled": true
      },
      mode: "payment",
      allow_promotion_codes: true,
      shipping_address_collection:{
        allowed_countries: ['US']
      },
      shipping_options: [
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: {
              amount: 0,
              currency: 'usd',
            },
            display_name: 'Free USPS Priority Mail Shipping',
          },
        }
      ],
      line_items: cart.items.map((item) => {
        return {
          price_data: {
            currency: "usd",
            product_data: {
              name: `${item.itemData.name} ${getSelectionName(item)}`,
            },
            unit_amount: Math.ceil(item.unitPriceInDollars * 100), //round down to the nearest whole integer (stripe wont accept decimal prices)
          },
          quantity: item.quantity,
        }
      }),
      success_url: redirectSuccessfulCheckoutsToLocalhost ? `http://localhost:3000/#/cart/checkout/success/${pendingOrderDoc._id.toString()}` : `https://www.nybagelsclub.com/#/cart/checkout/success/${pendingOrderDoc._id.toString()}`,
      cancel_url: redirectSuccessfulCheckoutsToLocalhost ? 'http://localhost:3000/#/cart' : 'https://www.nybagelsclub.com/#/cart'
    })
    //verify a payment intent was successfully created
    if (!session) throw new Error('An error occured when creating a session.');
    res.status(HttpStatusCodes.OK).json({sessionUrl: session.url});
  }catch(err){
    handleError(res,HttpStatusCodes.INTERNAL_SERVER_ERROR,err);
  };
};

export const handleCreateUserCheckoutSession = async function(req:any,res:any){
  let membershipTier:string = 'Non-Member';
  let cart:Cart | null = null;
  try{
    if (!req.payload.loginPayload || !req.payload.loginPayload.user || !req.payload.loginPayload.user._id) throw new Error('The required login payload was not provided.');
    if (!req.body.shipDate || typeof req.body.shipDate === undefined || req.body.shipDate.toString() ==='undefined') throw new Error('A ship date was not provided.');
  }catch(err){
    handleError(res,HttpStatusCodes.BAD_REQUEST,err);
  };
  try{
    //get membership tier for user
    const membershipDoc:Membership | null = await getMembershipByUserID(req.payload.loginPayload.user._id);
    if (!membershipDoc) throw new Error('Membership data was not found for the current user.');
    membershipTier = membershipDoc.tier;
  }catch(err){
    handleError(res,HttpStatusCodes.NOT_FOUND,err);
  };
  try{
    cart = new Cart(
      req.payload.cartPayload.cart.items,
      req.payload.cartPayload.cart.subtotalInDollars,
      req.payload.cartPayload.cart.taxInDollars,
      req.payload.cartPayload.cart.discountAmountInDollars,
      req.payload.cartPayload.cart.finalPriceInDollars || 0,
      new Date(req.body.shipDate)
    );
    if (!cart || cart.isCartEmpty()) throw new Error('You cannot proceed to checkout with an empty cart.');
    
    //cleanup cart
    await cart.cleanupCart(membershipTier);
  }catch(err){
    handleError(res,HttpStatusCodes.BAD_REQUEST,err);
  };
  //sign new cart token so date is saved to cart
  const updatedCartToken:string = issueCartJWTToken(cart);
  //store the token temporarily because it is too long to be sent through stripe
  const pendingOrderDoc:PendingOrder = await createPendingOrderDoc(updatedCartToken,req.payload.loginPayload.user._id);

  try{
    if (!pendingOrderDoc) throw new Error('A pending order doc was not found!');
    if (!cart || cart.isCartEmpty()) throw new Error('You cannot proceed to checkout with an empty cart.');
    const giftMessage:string = req.body.giftMessage || '';
    //create session
    const session = await stripe.checkout.sessions.create({
      automatic_tax:{
        'enabled': true
      },
      metadata:{
        'pendingOrderID': pendingOrderDoc._id.toString(),
        'userID': req.payload.loginPayload.user._id.toString(),
        'giftMessage': giftMessage
      },
      "phone_number_collection": {
        "enabled": true
      },
      mode: "payment",
      allow_promotion_codes: true,
      shipping_address_collection:{
        allowed_countries: ['US']
      },
      shipping_options: [
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: {
              amount: 0,
              currency: 'usd',
            },
            display_name: 'Free USPS Priority Mail Shipping',
          },
        }
      ],
      line_items: cart.items.map((item) => {
        return {
          price_data: {
            currency: "usd",
            product_data: {
              name: `${item.itemData.name} ${getSelectionName(item)}`,
            },
            unit_amount: Math.ceil(item.unitPriceInDollars * 100), //round down to the nearest whole integer (stripe wont accept decimal prices)
          },
          quantity: item.quantity,
        }
      }),
      success_url: redirectSuccessfulCheckoutsToLocalhost ? `http://localhost:3000/#/cart/checkout/success/${pendingOrderDoc._id.toString()}` : `https://www.nybagelsclub.com/#/cart/checkout/success/${pendingOrderDoc._id.toString()}`,
      cancel_url: redirectSuccessfulCheckoutsToLocalhost ? 'http://localhost:3000/#/cart' : 'https://www.nybagelsclub.com/#/cart'
    })
    //verify a payment intent was successfully created
    if (!session) throw new Error('An error occured when creating a session.');
    res.status(HttpStatusCodes.OK).json({sessionUrl: session.url});
  }catch(err){
    handleError(res,HttpStatusCodes.INTERNAL_SERVER_ERROR,err);
  };
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
      fullName:  event.data.object.shipping_details.name,
      email: event.data.object.customer_details.email
    }; 

    //verify shipping address fields were provided
    if (!shippingAddress.line1) throw new Error("Shipping address line1 is not provided");
    if (!shippingAddress.city) throw new Error("Shipping address city is not provided");
    if (!shippingAddress.state) throw new Error("Shipping address state is not provided");
    if (!shippingAddress.postal_code) throw new Error("Shipping address postal code is not provided");
    if (!shippingAddress.country) throw new Error("Shipping address country is not provided");
    if (!shippingAddress.phone) throw new Error("Shipping address phone is not provided");
    if (!shippingAddress.fullName) throw new Error("Shipping address full name is not provided");
    if (!shippingAddress.email) throw new Error("shipping address email is not provided");

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

      //verify if this is a club order or not
      const isClubOrder:boolean = event.data.object.metadata.isClubOrder || false;
      //verify order can be placed
      //get users membership doc
      let membershipDoc:Membership | null = await getMembershipByUserID(userID.toString());
      
      if (isClubOrder && !membershipDoc) throw new Error('A membership doc was not found for the user and is required.');
      try{
        //verify they have at least 1 order or more remaining
        //BUG WARNING must have isClubOrder check here or regular shop orders will deduct from users regular deliveries
        if (isClubOrder && membershipDoc && membershipDoc.deliveriesLeft<=0) throw new Error('The user is out of deliveries for this billing cycle.');
        
        //verify user has correct quantity in their cart
        if (isClubOrder){
          let spreadCount:number = 0;
          let bagelCount:number = 0;
          let mysteryCount:number = 0;
          cart.items.forEach((cartItem:CartItem)=>{
            switch(cartItem.itemData.cat){
              case 'spread':
                spreadCount+=cartItem.quantity;
                break;
              case 'bagel':
                bagelCount+=cartItem.quantity;
                break;
              case 'mystery':
                mysteryCount+=cartItem.quantity;
                break;
            }
          });
          if (mysteryCount!==1) throw new Error('The cart must have a mystery item quantity of 1');
          if (bagelCount!==6) throw new Error('The cart must have a total of 6 "two packs".');
          if (spreadCount!==1) throw new Error('The cart must have 1 half pound spread.');
        };
      }catch(err){
        handleError(res,HttpStatusCodes.FORBIDDEN,err);
      };
      //remove the cart prices from cleanup if this is a club cart
      //if the above is not done then all of the cart prices will appear in the users order page and order conf email
      if (isClubOrder){
        for (let i = 0; i<cart.items.length;i++){
          cart.items[i].unitPriceInDollars= 0;
          cart.items[i].itemData.price=0;
        };
      };
      const orderDoc: Order = await createOrder(
        userID,
        cart,
        shippingAddress,
        giftMessage,
        isClubOrder
      );
      if (!orderDoc) throw new Error('An error has occured when updating the order doc.');

      //update the pending order doc with the order DOC ID
      let updatedPendingOrder:PendingOrder = pendingOrderDoc;
      updatedPendingOrder.orderID = orderDoc._id.toString();
      await updatePendingOrderDocByDocID(pendingOrderDoc._id.toString(),updatedPendingOrder);

      //BUG WARNING must have isClubOrder check here or regular shop orders will deduct from users regular deliveries
      //at this point we assume the order was placed so we will update the membership doc if applicable
      if (isClubOrder && membershipDoc && membershipDoc.deliveriesLeft){
        const newDeliveriesAmount:number = membershipDoc.deliveriesLeft-1;
        membershipDoc.deliveriesLeft = newDeliveriesAmount;
        await updateMembershipByUserID(userID,membershipDoc);
      };

      //retrieve user info so we can get their email
      const userDoc:User | null = await getUserByID(orderDoc.userID);
      if (!userDoc) throw new Error('No user doc found!');
      
      //email user that order was successfully placed
      await transporter.sendMail(getOrderPlacedMailOptions(shippingAddress.email,orderDoc));
      
      return true;
    }catch(err){
      handleError(res,HttpStatusCodes.NOT_FOUND,err);
    };
  }catch(err){
    handleError(res,HttpStatusCodes.BAD_REQUEST,err);
  };
};

export const handleGuestOrderPayment = async function(event:any,res:any){
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
      fullName:  event.data.object.shipping_details.name,
      email: event.data.object.customer_details.email
    }; 

    //verify shipping address fields were provided
    if (!shippingAddress.line1) throw new Error("Shipping address line1 is not provided");
    if (!shippingAddress.city) throw new Error("Shipping address city is not provided");
    if (!shippingAddress.state) throw new Error("Shipping address state is not provided");
    if (!shippingAddress.postal_code) throw new Error("Shipping address postal code is not provided");
    if (!shippingAddress.country) throw new Error("Shipping address country is not provided");
    if (!shippingAddress.phone) throw new Error("Shipping address phone is not provided");
    if (!shippingAddress.fullName) throw new Error("Shipping address full name is not provided");
    if (!shippingAddress.email) throw new Error('A customer email was not provided.');

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
        giftMessage,
        false
      );

      if (!orderDoc) throw new Error('An error has occured when updating the order doc.');

      //update the pending order doc with the order DOC ID
      let updatedPendingOrder:PendingOrder = pendingOrderDoc;
      updatedPendingOrder.orderID = orderDoc._id.toString();
      await updatePendingOrderDocByDocID(pendingOrderDoc._id.toString(),updatedPendingOrder);
      
      //email user that order was successfully placed
      await transporter.sendMail(getOrderPlacedMailOptions(shippingAddress.email,orderDoc));
      
      return true;
    }catch(err){
      handleError(res,HttpStatusCodes.NOT_FOUND,err);
    };
  }catch(err){
    handleError(res,HttpStatusCodes.BAD_REQUEST,err);
  };
};

export const verifyModifyClubCart = async function (
  selection: string,
  itemID: string,
  updatedQuantity: number,
  cart: CartInterface
): Promise<boolean> {
  // Calculate bagel and spread totals
  let bagelNewTotalQuantity: number = 0;
  let spreadNewTotalQuantity: number = 0;

  let exactItemFound:boolean = false;
  cart.items.forEach((item: CartItem) => {
    switch (item.itemData.cat) {
      case 'bagel':
        if (item.itemData._id.toString()===itemID.toString()){
          bagelNewTotalQuantity+=updatedQuantity
          exactItemFound=true;
        }else{
          bagelNewTotalQuantity+=item.quantity;
        };
        break;
      case 'spread':
        if (item.itemData._id.toString()===itemID.toString()){
          spreadNewTotalQuantity+=updatedQuantity;
          exactItemFound=true;
        }else{
          spreadNewTotalQuantity+=item.quantity;
        };
        break;
    }
  });

  //handle event where a new item is being added
  const itemDoc:Product | null = await getItemByID(itemID.toString());
  if (!exactItemFound && itemDoc && itemDoc.cat==='bagel'){
    bagelNewTotalQuantity+=updatedQuantity;
  }else if(!exactItemFound &&itemDoc && itemDoc.cat==='spread'){
    spreadNewTotalQuantity+=updatedQuantity;
  };

  return (bagelNewTotalQuantity<=6 && spreadNewTotalQuantity<=1);
};

export async function generateUniqueGuestUserID() {
  const currentDate = new Date();
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let randomString = '';

  for (let i = 0; i < 55; i++) {
    const randomIndex = Math.floor(Math.random() * (characters.length-1)) +1;
    randomString += characters.charAt(randomIndex-1);
  };

  //get pending order docID
  const pendingOrder:PendingOrder | null = await getPendingOrderDocByUserID(`guest${randomString}`);
  if (pendingOrder){
    return generateUniqueGuestUserID();
  }else{
    return randomString;
  };
};

export const validateDate = function (date: string): boolean {
  const selectedDate = new Date(date);

  // Format today's date with the "America/New_York" time zone
  const today = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });

  // Format selected date with the "America/New_York" time zone
  const formattedSelectedDate = new Date(selectedDate.toLocaleString("en-US", { timeZone: "America/New_York" }));

  // Check if the day is either Wednesday or Thursday
  const isWednesdayOrThursday = formattedSelectedDate.getDay() === 2 || formattedSelectedDate.getDay() === 3;
  console.log(formattedSelectedDate.getTime(), new Date(today).getTime());

  // Check if the selected date is today or in the future
  const isFutureDate = formattedSelectedDate.getTime() > new Date(today).getTime();

  return isWednesdayOrThursday && isFutureDate;
};
