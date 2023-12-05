import Cart from '@src/classes/Cart';
import HttpStatusCodes from '@src/constants/HttpStatusCodes';
import { getAllItems, getItemByID } from '@src/controllers/item';
import { invalidatedTokens, issueCartJWTToken} from '@src/helpers/auth';
import { Router } from 'express'
import { stripe } from '@src/util/stripe';
import { authenticateCartToken, authenticateLoginToken, handleCartLoginAuth} from '@src/middlewares/auth';
import { getMembershipByUserID } from '@src/controllers/membership';
import { getUserByID } from '@src/controllers/user';
import { Address, BagelItem, CartInterface, CartItem, Membership, Order, PendingOrder, PromoCode, SpreadItem, TempCartToken, User } from '@src/interfaces/interfaces';
import { createOrder, getAllOrdersByUserID, getOrderByOrderID } from '@src/controllers/order';
import jwt from 'jsonwebtoken';
import { handleError } from '@src/helpers/error';
import { getPromoCodeByCode, getPromoCodeByID, updatePromoCodeByID } from '@src/controllers/promocode';
import { createPendingOrderDoc, deletePendingOrderDocByCartToken, getPendingOrderDocByCartToken, getPendingOrderDocByDocID, updatePendingOrderDocByDocID } from '@src/controllers/pendingOrder';
import { getCustomOrderMailOptions, getOrderPlacedMailOptions } from '@src/constants/emails';
import { transporter } from "@src/server";
import { getSelectionName } from '@src/helpers/shop';
import { isTestingModeEnabled } from '@src/config/config';

export const shopRouter = Router();

shopRouter.get('/promoCode',authenticateLoginToken,authenticateCartToken,async(req:any,res,next)=>{
  const cart:Cart = new Cart(
    req.payload.cartPayload.cart.items,
    req.payload.cartPayload.cart.subtotalInDollars,
    req.payload.cartPayload.cart.taxInDollars,
    req.payload.cartPayload.cart.promoCodeID,
    req.payload.cartPayload.cart.discountAmountInDollars,
    req.payload.cartPayload.cart.finalPriceInDollars,
    req.payload.cartPayload.cart.desiredShipDate
  );
  try{
    if (!cart.promoCodeID) throw new Error("No promo code is currently applied to the users cart.");
  }catch(err){
    handleError(res,HttpStatusCodes.NOT_FOUND,err);
  };
  try{
    //get promo code doc
    const promoDoc:PromoCode | null = await getPromoCodeByID(cart.promoCodeID);
    if (!promoDoc) throw new Error("No promo code doc was found for the applied promo code.");
    //get discount amount obtained by reversing the discount
    const discountAmount:number = cart.discountAmountInDollars;
    //get promo code input (name of code) for client
    const promoCodeName:string = promoDoc.code;
    //get is promo applied to cart bool
    const isPromoApplied:boolean = true;
    res.status(HttpStatusCodes.OK).json({
      discountAmount: discountAmount,
      isPromoApplied: isPromoApplied,
      promoCodeName: promoCodeName
    });
  }catch(err){
    handleError(res,HttpStatusCodes.NOT_FOUND,err);
  };
});

shopRouter.put('/promoCode',authenticateLoginToken,authenticateCartToken,async(req:any,res,next)=>{
  const cart:Cart = new Cart(
    req.payload.cartPayload.cart.items,
    req.payload.cartPayload.cart.subtotalInDollars,
    req.payload.cartPayload.cart.taxInDollars,
    req.payload.cartPayload.cart.promoCodeID,
    req.payload.cartPayload.cart.discountAmountInDollars,
    req.payload.cartPayload.cart.finalPriceInDollars,
    req.payload.cartPayload.cart.desiredShipDate
  );
  
  const promoCodeInput:string = req.body.promoCodeInput;
  const paymentID = req.body.clientSecret.split('_secret_')[0];
  let paymentIntent:any = {};
  let membershipTier:string = 'Non-Member';

  let membershipDoc:Membership | null = null;
  let promoCodeDoc:PromoCode | null = null;
  
  try{
    if (!promoCodeInput || !paymentID) throw new Error('Required inputs were not provided in request.');
  }catch(err){
    handleError(res,HttpStatusCodes.BAD_REQUEST,err);
  };

  //attempt to get promocode doc and membership info for the current user
  try{
    [membershipDoc, promoCodeDoc] = await Promise.all([
      getMembershipByUserID(req.payload.loginPayload.user._id), //get membership information for user
      getPromoCodeByCode(promoCodeInput)  //attempt to get promo code data
    ]);
    if (membershipDoc?.tier) membershipTier = membershipDoc.tier;
    //ensure promo code exists
    if (!promoCodeDoc) throw new Error('The entered promo code does not exist.');
    
    try{
      //ensure promo code is NOT expired
      if (promoCodeDoc.dateOfExpiry < new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))) throw new Error('The promo code is expired.');
      if (promoCodeDoc.totalAllowedUses && (promoCodeDoc.totalAllowedUses<promoCodeDoc.totalTimesUsed)) throw new Error('The promo code is out of uses.');
    }catch(err){
      handleError(res,HttpStatusCodes.FORBIDDEN,err);
    };

    //apply promo code
    try{
      //add +1 to total uses
      let updatedPromoCodeDoc:PromoCode = promoCodeDoc;
      updatedPromoCodeDoc.totalTimesUsed+=1;
      updatePromoCodeByID(promoCodeDoc._id.toString(),updatedPromoCodeDoc);
      
      const discountAmount:number = cart.calcPromoCodeDiscountAmount(promoCodeDoc.perk);

      //set the promo code in the user's cart
      cart.promoCodeID = promoCodeDoc._id.toString();

      //verify payment intent exists
      if (!paymentIntent) throw new Error('There was an error obtaining the payment intent.');

      //cleanup cart
      await cart.cleanupCart(membershipDoc?.tier || '');

      // Update the PaymentIntent if one already exists for this cart.
      paymentIntent = await stripe.paymentIntents.update(paymentID, {
        amount: Math.floor(cart.finalPriceInDollars*100), //convert to cents and round it down
        metadata: {
          promoCodeID: promoCodeDoc._id.toString() //need to convert from ObjectID("") format to string
        },
      });

      //issue updating cart token
      const tempCartToken = issueCartJWTToken(cart);
      //store the new cart token
      let pendingOrderDoc:PendingOrder | null = await getPendingOrderDocByDocID(paymentIntent.metadata.pendingOrderID.toString());
      if (!pendingOrderDoc){
        //a pending order does not exist create one
        pendingOrderDoc = await createPendingOrderDoc(tempCartToken,req.payload.loginPayload.user._id);
      }else{
        //the pending order exists update it
        pendingOrderDoc.cartToken = tempCartToken;
        pendingOrderDoc = await updatePendingOrderDocByDocID(pendingOrderDoc._id as string,pendingOrderDoc);
      };

      //respond to client with the updated token
      res.status(200).json({
        clientSecret: paymentIntent.client_secret,
        cartToken: tempCartToken,
        discountAmount: discountAmount
      });
    }catch(err){
      handleError(res,HttpStatusCodes.INTERNAL_SERVER_ERROR,err);
    };
  }catch(err){
    handleError(res,HttpStatusCodes.NOT_FOUND,err);
  };   
});

shopRouter.delete('/promoCode',authenticateLoginToken,authenticateCartToken,async(req:any,res,next)=>{
  const cart:Cart = new Cart(
    req.payload.cartPayload.cart.items,
    req.payload.cartPayload.cart.subtotalInDollars,
    req.payload.cartPayload.cart.taxInDollars,
    req.payload.cartPayload.cart.promoCodeID,
    req.payload.cartPayload.cart.discountAmountInDollars,
    req.payload.cartPayload.cart.finalPriceInDollars,
    req.payload.cartPayload.cart.desiredShipDate
  );
  let paymentID = ''; 
  let paymentIntent:any = {};
  try{
    if (!req.body.clientSecret) throw new Error('A client secret was not provided.');
    paymentID = req.body.clientSecret.split('_secret_')[0];
  }catch(err){
    handleError(res,HttpStatusCodes.BAD_REQUEST,err);
  };
  //get membership tier and apply membership discount
  const membershipDoc:Membership | null = await getMembershipByUserID(req.payload.loginPayload.user._id);
  try{
    if (!membershipDoc) throw new Error('A membership doc was not found for the user.');
    if (cart.promoCodeID==='') throw new Error('No promo code is applied to the cart.');
  }catch(err){
    handleError(res,HttpStatusCodes.NOT_FOUND,err);
  };
  cart.discountAmountInDollars = 0;
  cart.promoCodeID = '';
  await cart.cleanupCart(membershipDoc?.tier || '');

  //update the payment intent if one exists
  try{
    if (!paymentIntent) throw new Error('There was an error obtaining the payment intent.');
    // Update the PaymentIntent if one already exists for this cart.
    paymentIntent = await stripe.paymentIntents.update(paymentID, {
      amount: Math.floor(cart.finalPriceInDollars*100), //convert to cents and round it down
      metadata: {
        promoCodeID: ''
      },
    });
  }catch(err){
    handleError(res,HttpStatusCodes.INTERNAL_SERVER_ERROR,err);
  };

  //issue updating cart token
  const tempCartToken = issueCartJWTToken(cart);
  //attempt to get a pending order doc
  let pendingOrderDoc:PendingOrder | null = await getPendingOrderDocByDocID(paymentIntent.metadata.pendingOrderID.toString());
  //store the new cart token
  if (!pendingOrderDoc){
    pendingOrderDoc = await createPendingOrderDoc(tempCartToken,req.payload.loginPayload.user._id);
  }else{
    pendingOrderDoc.cartToken = tempCartToken;
    pendingOrderDoc = await updatePendingOrderDocByDocID(pendingOrderDoc._id as string,pendingOrderDoc);
  };

  //respond to client with the updated token
  res.status(200).json({
    clientSecret: paymentIntent.client_secret,
    cartToken: tempCartToken,
    discountAmount: cart.discountAmountInDollars
  });
});

//update the gift message
shopRouter.put('/giftMessage', authenticateLoginToken, authenticateCartToken, async(req:any,res,next)=>{
  try{
    const updatedGiftMessage:string = req.body.updatedGiftMessage;
    if (!updatedGiftMessage || updatedGiftMessage==='') throw new Error('An updated gift message was not provided.');
    if (!req.body.clientSecret) throw new Error('A payment intent (client secret) was not provided.');
    //obtain the payment id from the first half of the clientSecret
    let paymentID = req.body.clientSecret.split('_secret_')[0]; 
    let paymentIntent:any = {};

    try{
      if (!paymentIntent) throw new Error('There was an error obtaining the payment intent.');
      // Update the PaymentIntent if one already exists for this cart.
      paymentIntent = await stripe.paymentIntents.update(paymentID, {
        metadata: {
          giftMessage: updatedGiftMessage
        },
      });
      res.status(HttpStatusCodes.OK).json({
        paymentIntentToken: paymentIntent.client_secret
      });
    }catch(err){
      handleError(res,HttpStatusCodes.INTERNAL_SERVER_ERROR,err);
    };
  }catch(err){
    handleError(res,HttpStatusCodes.BAD_REQUEST,err);
  };
});

//add the users desired ship date to their cart
shopRouter.put('/carts/shipDate',authenticateCartToken,handleCartLoginAuth,async (req:any,res,next)=>{
  try{
    if (!req.body.desiredShipDate) throw new Error("An ship date was not provided.");
    const desiredShipDate:Date = new Date(req.body.desiredShipDate);
    //get cart from payload
    const cart:Cart = new Cart(
      req.payload.cartPayload.cart.items,
      req.payload.cartPayload.cart.subtotalInDollars,
      req.payload.cartPayload.cart.taxInDollars,
      req.payload.cartPayload.cart.promoCodeID,
      req.payload.cartPayload.cart.discountAmountInDollars,
      req.payload.cartPayload.cart.finalPriceInDollars,
      desiredShipDate
    );
    //sign the new cart token
    const newCartToken:string = issueCartJWTToken(cart);
    //return it to the user
    res.status(HttpStatusCodes.OK).json({'cartToken': newCartToken});
  }catch(err){
    handleError(res,HttpStatusCodes.BAD_REQUEST,err);
  };
});

// relevant documentation for the below webhook route, https://dashboard.stripe.com/webhooks/create?endpoint_location=local
shopRouter.post('/stripe-webhook-payment-succeeded', async(req:any,res,next)=>{
  const sig = req.headers['stripe-signature'];
  const endpointSecret: string | undefined = isTestingModeEnabled ? process.env.STRIPE_TEST_SIGNING_SECRET : process.env.STRIPE_SIGNING_SECRET;
  let event;
  try {
    //catch any errors that occur when constructing the webhook event (such as wrong body format, too many characters etc...)
    event = stripe.webhooks.constructEvent(req.rawBody, sig, endpointSecret); //req.rawBody is assigned through middleware in server.js
  } catch (err) {
    handleError(res,HttpStatusCodes.BAD_REQUEST,err);
  };
  
  try{
    //ensure the event is the correct type
    const checkoutSessionCompleted = event.data.object;
    console.log(checkoutSessionCompleted);
    if (event.type!=='checkout.session.completed') throw new Error('This route only handles checkout session succeess payments right now.');

    //get required properties to create the order doc from the payment intent
    const userID:string = checkoutSessionCompleted.metadata.userID;
    const shippingAddress:Address = {
      line1: checkoutSessionCompleted.customer_details.address.line1,
      line2: checkoutSessionCompleted.customer_details.address.line2 || undefined,
      city: checkoutSessionCompleted.customer_details.address.city,
      state: checkoutSessionCompleted.customer_details.address.state,
      postal_code: checkoutSessionCompleted.customer_details.address.postal_code,
      country: checkoutSessionCompleted.customer_details.address.country,
      phone: checkoutSessionCompleted.customer_phone,
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
        console.log(checkoutSessionCompleted);
        //MUST BE SET TO PAYLOAD.CART DO NOT USE REQ THIS IS HANDLED DIFFERENTLY THAN THE OTHERS!!!
        cart = new Cart(
          payload.cart.items,
          checkoutSessionCompleted.amount_subtotal /100,
          checkoutSessionCompleted.amount_total /100 - checkoutSessionCompleted.amount_subtotal /100,
          payload.cart.promoCodeID,
          payload.cart.discountAmountInDollars,
          checkoutSessionCompleted.amount_total /100,
          payload.cart.desiredShipDate
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
      if (!orderDoc){
        throw new Error('An error has occured when updating the order doc.');
      }else{
        //order was successfully processed in our system

        //update stripe payment intent by the payment intent's id
        // await stripe.paymentIntents.update(paymentIntentSucceeded.id,{
        //   metadata:{
        //     orderID: orderDoc._id.toString()
        //   }
        // });
        //remove the cart token items from mongoDB
        //await deletePendingOrderDocByCartToken(pendingOrder.cartToken);

        //update the pending order do with the order DOC ID
        let updatedPendingOrder:PendingOrder = pendingOrder;
        updatedPendingOrder.orderID = orderDoc._id.toString();
        console.log('orderID',orderDoc._id.toString());
        console.log('updated pending order',updatedPendingOrder);
        await updatePendingOrderDocByDocID(pendingOrder._id.toString(),updatedPendingOrder);
        //retrieve user info so we can get their email
        const userDoc:User | null = await getUserByID(orderDoc.userID);
        if (!userDoc) throw new Error('No user doc found!');
        //email user that order was successfully placed
        await transporter.sendMail(getOrderPlacedMailOptions(userDoc.email,orderDoc));
        // Return a 200 response to acknowledge receipt of the event
        res.status(HttpStatusCodes.OK).send();
      };
    }catch(err){
      handleError(res,HttpStatusCodes.NOT_MODIFIED,err);
    };
  }catch(err){
    handleError(res,HttpStatusCodes.BAD_REQUEST,err);
  };
});

shopRouter.post('/carts/applyMembershipPricing', authenticateCartToken, handleCartLoginAuth, async (req:any,res,next)=>{
  let membershipDoc:Membership | null = null;
  try{
    if (
      req.payload.loginPayload &&
      req.payload.loginPayload.user &&
      req.payload.loginPayload.user._id
    ){
      membershipDoc = await getMembershipByUserID(req.payload.loginPayload.user._id);
    };
    //handle user is signed in and no membership doc is present.
    //if the user is not signed in we will apply non member pricing later
    if (req.tokens.login && !membershipDoc) throw new Error("A membership doc was not found for the user.");
  }catch(err){
    handleError(res,HttpStatusCodes.NOT_FOUND,err);
  };
  const cart:Cart = new Cart(
    req.payload.cartPayload.cart.items,
    req.payload.cartPayload.cart.subtotalInDollars,
    req.payload.cartPayload.cart.taxInDollars,
    req.payload.cartPayload.cart.promoCodeID,
    req.payload.cartPayload.cart.discountAmountInDollars,
    req.payload.cartPayload.cart.finalPriceInDollars,
    req.payload.cartPayload.cart.desiredShipDate
  );
  if (membershipDoc){
    await cart.cleanupCart(membershipDoc.tier);
    try{
      if (membershipDoc.renewalDate && membershipDoc.renewalDate<new Date()) throw new Error('Your membership has expired.');
    }catch(err){
      handleError(res,HttpStatusCodes.FORBIDDEN,err);
    };
    const tempCartToken:string = issueCartJWTToken(cart);
    res.status(HttpStatusCodes.OK).json({
      cartToken: tempCartToken,
      cart: cart
    });
  }else{
    await cart.cleanupCart('Non-Member');
    const tempCartToken:string = issueCartJWTToken(cart);
    res.status(HttpStatusCodes.OK).json({
      cartToken: tempCartToken,
      cart: cart
    });
  };
});

shopRouter.get('/orders/checkout/fetchPlacedOrder/:pendingOrderDocID',authenticateLoginToken,async(req:any,res,next)=>{
  try{
    const pendingOrderDocID:string = req.params.pendingOrderDocID;
    if (!pendingOrderDocID) throw new Error('A pending order doc ID was not provided in the request.');
    try{
      const pendingOrderDoc: PendingOrder | null = await getPendingOrderDocByDocID(pendingOrderDocID.toString());
      if (!pendingOrderDoc) throw new Error('A pending order doc was not found for the provided pending order docID');
      if (!pendingOrderDoc.orderID) throw new Error('A pending order doc ID was not found.');
      const orderDoc:Order | null = await getOrderByOrderID(pendingOrderDoc.orderID);
      if (!orderDoc) throw new Error('An order doc was not found.');
      //verify user owns the pending order doc
      try{
        if (pendingOrderDoc.userID.toString()!==req.payload.loginPayload.user._id.toString()){
          throw new Error('The user is not authorized to view this order.');
        }else{
          res.status(HttpStatusCodes.OK).json({orderData: orderDoc});
        };
      }catch(err){
        handleError(res,HttpStatusCodes.UNAUTHORIZED,err);
      };
    }catch(err){
      handleError(res,HttpStatusCodes.NOT_FOUND,err);
    };
  }catch(err){
    handleError(res,HttpStatusCodes.BAD_REQUEST,err);
  };
});

shopRouter.post('/carts/create-tax-calculation',authenticateLoginToken,authenticateCartToken, async(req:any,res,next)=>{
  const cart:Cart = new Cart(
    req.payload.cartPayload.cart.items,
    req.payload.cartPayload.cart.subtotalInDollars,
    req.payload.cartPayload.cart.taxInDollars,
    req.payload.cartPayload.cart.promoCodeID,
    req.payload.cartPayload.cart.discountAmountInDollars,
    req.payload.cartPayload.cart.finalPriceInDollars,
    req.payload.cartPayload.cart.desiredShipDate
  );
  //need to cleanup cart before performing tax calculations
  try{
    let membershipTier:string = 'Non-Member';
    const membershipDoc: Membership | null = await getMembershipByUserID(req.payload.loginPayload.user._id as string);
    if (membershipDoc) membershipTier = membershipDoc.tier;

    //need to cleanup cart to verify cart data and calc totalquantity / final price
    await cart.cleanupCart(membershipTier);
  }catch(err){
    handleError(res,HttpStatusCodes.NOT_FOUND,err);
  };
  // Get the customer's address from the request body
  const address:Address = req.body.address;
  // obtain the payment id from the first half of the clientSecret
  let paymentID = req.body.clientSecret.split('_secret_')[0]; 
  let paymentIntent:any = {};
  let calculation;
  //validate required inputs were provided
  try{
    if (!address || !paymentID) throw new Error('A address or paymentID was not provided.');
    if (!cart || cart.isCartEmpty()) throw new Error('You cannot proceed with an empty cart');
  }catch(err){
    handleError(res,HttpStatusCodes.BAD_REQUEST,err);
  };

  //attempt to get promo code perk data
  let perk:string = '';
  let promoCodeDoc:PromoCode | null;

  if (cart.promoCodeID){
    promoCodeDoc = await getPromoCodeByID(cart.promoCodeID);
    if (promoCodeDoc) perk = promoCodeDoc.perk;
  };
  
  const discountMultiplier:number = cart.getPromoCodeDiscountMultiplier(perk);

  // Convert each cart item to a Stripe line item object
  const lineItems = cart.items.map((cartItem: CartItem, index: number) => {

    //calculate the total cost in cents for each item
    const adjustedUnitPriceInDollars:number = cartItem.unitPriceInDollars * discountMultiplier;
    const adjustedUnitPriceWithDiscountInDollars:number = cartItem.unitPriceInDollars - adjustedUnitPriceInDollars
    const totalAmountInDollars:number = adjustedUnitPriceWithDiscountInDollars * cartItem.quantity;
    const totalAmountInCents:number = Math.floor(totalAmountInDollars*100);

    return {
      reference: index,
      amount: totalAmountInCents,
      quantity: cartItem.quantity
    };
  });
  
  try{
    // Create a tax calculation using the Stripe API
    calculation = await stripe.tax.calculations.create({
      currency: 'usd',
      line_items: lineItems,
      customer_details: {
        address: {
          line1: address.line1,
          line2: address.line2 || '',
          city: address.city,
          state: address.state,
          postal_code: address.postal_code,
          country: address.country
        },
        address_source: "billing"
      },
      expand: ['line_items.data.tax_breakdown']
    });
    if (!calculation) throw new Error('There was an error creating a tax calculation please ensure all required inputs are completed.');
  }catch(err){
    handleError(res,HttpStatusCodes.INTERNAL_SERVER_ERROR,err);
  };

  try{
    // Update the PaymentIntent if one already exists for this cart.
    if (paymentID) {
      paymentIntent = await stripe.paymentIntents.update(paymentID, {
        amount: calculation.amount_total,
        metadata: {
          tax_calculation: calculation.id,
          tax_amount: calculation.tax_amount_exclusive, //should be in cents
          customer_phone: address.phone,
          customer_fullName: address.fullName
        }
      });
    } else {
      paymentIntent = await stripe.paymentIntents.create({
        currency: 'usd',
        amount: calculation.amount_total,
        metadata: {
          tax_calculation: calculation.id,
          tax_amount: calculation.tax_amount_exclusive
        },
        // In the latest version of the API, specifying the `automatic_payment_methods` parameter is optional because Stripe enables its functionality by default.
        automatic_payment_methods: {enabled: true},
      });
    };

    if (!paymentIntent) throw new Error('There was an error creating a payment intent.');
  }catch(err){
    handleError(res,HttpStatusCodes.INTERNAL_SERVER_ERROR,err);
  };

  //calculate the tax amount IN DOLLARS
  cart.taxInDollars = calculation.tax_amount_exclusive / 100; //convert to $x.xx format, the tax_amount_exclusive is in cents
  //re calculate the final price with the tax information
  cart.calcFinalPrice();

  //issue updated cart token
  const tempCartToken = issueCartJWTToken(cart);

  //store the new cart token
  let pendingOrderDoc:PendingOrder | null = await getPendingOrderDocByDocID(paymentIntent.metadata.pendingOrderID.toString());
  if (!pendingOrderDoc){
    //a doc does not exist
    pendingOrderDoc = await createPendingOrderDoc(tempCartToken,req.payload.loginPayload.user._id);
  }else{
    //a doc already exists 
    pendingOrderDoc.cartToken = tempCartToken;
    pendingOrderDoc = await updatePendingOrderDocByDocID(pendingOrderDoc._id as string,pendingOrderDoc);
  };

  res.status(200).json({
    paymentIntentToken: paymentIntent.client_secret,
    taxAmount: calculation.tax_amount_exclusive,
    total: calculation.amount_total
  });
});

shopRouter.post('/carts/create-checkout-session',authenticateCartToken,authenticateLoginToken,async (req:any,res,next)=>{
  let membershipTier:string = 'Non-Member';
  let cart:Cart | null = null;

  //validate the required payload fields are present
  try{
    if (!req.payload.loginPayload || !req.payload.loginPayload.user || !req.payload.loginPayload.user._id) throw new Error('The required login payload was not provided.');
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
      req.payload.cartPayload.cart.promoCodeID,
      req.payload.cartPayload.cart.discountAmountInDollars,
      req.payload.cartPayload.cart.finalPriceInDollars || 0,
      req.payload.cartPayload.cart.desiredShipDate
    );
    if (!cart || cart.isCartEmpty()) throw new Error('You cannot proceed to checkout with an empty cart.');
    
    //cleanup cart
    await cart.cleanupCart(membershipTier);
  }catch(err){
    handleError(res,HttpStatusCodes.BAD_REQUEST,err);
  };

  //store the token temporarily because it is too long to be sent through stripe
  const pendingOrderDoc:PendingOrder = await createPendingOrderDoc(req.tokens.cart,req.payload.loginPayload.user._id);

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
      payment_method_types: [
        'card',
      ],
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
      line_items: cart.items.map(item => {
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
      success_url: isTestingModeEnabled ? `http://localhost:3000/#/cart/checkout/success/${pendingOrderDoc._id.toString()}` : `https://www.nybagelsclub.com/#/checkout/success/${pendingOrderDoc._id.toString()}`,
      cancel_url: isTestingModeEnabled ? 'http://localhost:3000/#/cart' : 'https://www.nybagelsclub.com/#/cart'
    })
    //verify a payment intent was successfully created
    if (!session) throw new Error('An error occured when creating a session.');
    res.status(HttpStatusCodes.OK).json({sessionUrl: session.url});
  }catch(err){
    console.log(err);
    handleError(res,HttpStatusCodes.INTERNAL_SERVER_ERROR,err);
  };
});

//verify a cart token
shopRouter.get('/carts/verify',authenticateCartToken,(req:any,res,next)=>{
  res.status(HttpStatusCodes.OK).json({isValid: true, cart: req.payload.cartPayload.cart});
});

//create a cart and return the jwt token of the cart to the user
shopRouter.post('/carts',(req,res,next)=>{
  try{
    //create an empty cart
    const cart:Cart = new Cart();
    if (!cart) throw new Error('An error has occured when creating an empty cart.');
    
    //sign a token for the cart
    const token = issueCartJWTToken(cart);
    if (!token) throw new Error('An error has occured when signing a session token for the cart.');

    res.status(HttpStatusCodes.OK).json({cartToken:token});
  }catch(err){
    handleError(res,HttpStatusCodes.INTERNAL_SERVER_ERROR,err);
  };
});

//get the user's current cart based on provided bearer token
shopRouter.get('/carts',authenticateCartToken,handleCartLoginAuth, async(req:any,res,next)=>{
  const cart:Cart = new Cart(
    req.payload.cartPayload.cart.items,
    req.payload.cartPayload.cart.subtotalInDollars,
    req.payload.cartPayload.cart.taxInDollars,
    req.payload.cartPayload.cart.promoCodeID,
    req.payload.cartPayload.cart.discountAmountInDollars,
    req.payload.cartPayload.cart.finalPriceInDollars,
    req.payload.cartPayload.cart.desiredShipDate
  );

  //initialize the membership tier as a NonMember
  let membershipTier:string = 'Non-Member';
  let userDoc:User | null = null;
  
  //the user is signed in and provided a login token (obtain user data)
  try{
    if (req.payload.loginPayload && req.payload.loginPayload.user._id){
      userDoc = await getUserByID(req.payload.loginPayload.user._id);
      if (!userDoc) throw new Error('An error has occured when fetching user data for the signed in user.');
      const membershipDoc: Membership | null = await getMembershipByUserID(userDoc._id as string);
      if (!membershipDoc) throw new Error('An error has occured when getting membership info for the signed in user.');
      membershipTier = membershipDoc.tier;
    };
    //cleanup cart
    await cart.cleanupCart(membershipTier);
    res.status(HttpStatusCodes.OK).json({cart: req.payload.cartPayload.cart});
  }catch(err){
    handleError(res,HttpStatusCodes.NOT_FOUND,err);
  };
});

//update a cart based on the provided bearer token
shopRouter.put('/carts',authenticateCartToken, handleCartLoginAuth,async (req:any,res,next)=>{
  let userDoc:User | null = null;
  let membershipTier:string = 'Non-Member';
  //get cart from payload
  const cart:Cart = new Cart(
    req.payload.cartPayload.cart.items,
    req.payload.cartPayload.cart.subtotalInDollars,
    req.payload.cartPayload.cart.taxInDollars,
    req.payload.cartPayload.cart.promoCodeID,
    req.payload.cartPayload.cart.discountAmountInDollars,
    req.payload.cartPayload.cart.finalPriceInDollars,
    req.payload.cartPayload.cart.desiredShipDate
  );

  // Destructure the request body
  const {
    selection,
    itemID,
    updatedQuantity
  }: {
    selection: string;
    itemID: string;
    updatedQuantity: number;
  } = req.body;

  try {
    // Check for missing or incorrect fields
    if (!itemID || typeof updatedQuantity !== 'number' || updatedQuantity<0) {
      throw new Error('Required fields were not provided, or provided in an incorrect format.');
    };
    // Check if a cart is provided
    if (!cart) {
      throw new Error('A cart is required but not provided.');
    };
  } catch (err) {
    handleError(res, HttpStatusCodes.BAD_REQUEST, err);
  };

  //the user is signed in and provided a login token (obtain user data)
  try{
    if (req.payload.loginPayload && req.payload.loginPayload.user._id){
      userDoc = await getUserByID(req.payload.loginPayload.user._id);
      if (!userDoc) throw new Error('An error has occured when fetching user data for the signed in user.');

      const membershipDoc: Membership | null = await getMembershipByUserID(userDoc._id as string);
      if (!membershipDoc) throw new Error('An error has occured when getting membership info for the signed in user.');
      membershipTier = membershipDoc.tier;
    };
  }catch(err){
    handleError(res,HttpStatusCodes.BAD_REQUEST,err);
  };

  try{
    //get item data from mongoDB
    const itemDoc:BagelItem | SpreadItem | null = await getItemByID(itemID);
    if (!itemDoc) throw new Error('An error has occured when retrieving item data.');
    
    try{
      //handle invalid item quantity, if item quantity is less than 0 set it to 0
      if (updatedQuantity<0){
        cart.handleModifyCart(itemDoc,0,selection);
      }else{
        //handle modify cart
        cart.handleModifyCart(itemDoc,updatedQuantity,selection);
      };
    }catch(err){
      handleError(res,HttpStatusCodes.NOT_MODIFIED,err);
    };
    
    //cleanup cart
    await cart.cleanupCart(membershipTier);
    //update the promo code pricing if a code was used
    if (cart.promoCodeID){
      //attempt to get promo code data
      const promoCodeDoc:PromoCode | null = await getPromoCodeByID(cart.promoCodeID);
    
      //apply promo code
      cart.discountAmountInDollars = cart.calcPromoCodeDiscountAmount(promoCodeDoc?.perk || '');
    };
    
    //invalidate the old cart token
    invalidatedTokens.push(req.tokens);

    //sign a new cart token for the user
    const token:string = issueCartJWTToken(cart);
    
    //send it to the client
    res.status(HttpStatusCodes.OK).json({
      cartToken: token,
      cart: cart
    });
  }catch(err){
    handleError(res,HttpStatusCodes.NOT_FOUND,err);
  };
});

//get all shop items
shopRouter.get('/all', async (req,res,next)=>{
  try{
    const allItems:(BagelItem | SpreadItem)[] | null = await getAllItems();
    if (!allItems || allItems.length===0) throw new Error('No shop items were found.');
    res.status(HttpStatusCodes.OK).json({allItems:allItems});
  }catch(err){
    handleError(res,HttpStatusCodes.NOT_FOUND,err);
  };
});

//get shop item by item id
shopRouter.get('/item/:itemID', async (req,res,next)=>{
  const itemID:string = req.params.itemID;

  try{
    const item:BagelItem | SpreadItem | null = await getItemByID(itemID);
    if (!item) throw new Error('Item not found for the provided itemID');
    res.status(HttpStatusCodes.OK).json({item: item});
  }catch(err){
    handleError(res,HttpStatusCodes.NOT_FOUND,err);
  };
});

//request a personalized order
shopRouter.post('/orders/custom',async(req:any,res,next)=>{
  const {
    emailInput,
    requestInput,
    quantityInput,
    requestsPackageDeal
  }:{
    emailInput:string,
    requestInput:string,
    quantityInput:string,
    requestsPackageDeal:boolean
  } = req.body;
  //validate inputs
  try{
    if (!emailInput) throw new Error('No email input was recieved.');
    if (!requestInput) throw new Error('No request input was recieved.');
    if (!quantityInput) throw new Error('No quantity input was recieved');
    if (!requestsPackageDeal) throw new Error('No package deal choice was selected.');
  }catch(err){
    handleError(res,HttpStatusCodes.BAD_REQUEST,err);
  };

  //send email to sales team
  const salesEmail:string = 'sales@nybagelsclub.com';
  const response = await transporter.sendMail(getCustomOrderMailOptions(salesEmail,requestInput,emailInput,quantityInput,requestsPackageDeal));
  
  res.status(HttpStatusCodes.OK).json({
    isEmailSent: response.accepted.length===1
  });
});

//get order by order id (users)
shopRouter.get('/orders/:orderID', authenticateLoginToken, async (req:any,res,next)=>{
  const orderID:string = req.params.orderID;
  const userID:string = req.payload.loginPayload.user._id;
  let orderDoc:Order | null = null;
  
  try{
    orderDoc= await getOrderByOrderID(orderID);
    if (!orderDoc) throw new Error('An order doc was not found for the provided orderID.');
  }catch(err){
    handleError(res,HttpStatusCodes.NOT_FOUND,err);
  };

  try{
    // verify user is authorized to access info
    if (orderDoc && (userID !== orderDoc.userID)) throw new Error('You are not authorized to access this order info.');
    res.status(HttpStatusCodes.OK).json({'orderDoc': orderDoc});
  }catch(err){
    handleError(res,HttpStatusCodes.UNAUTHORIZED,err);
  };
});

//get all orders for user
shopRouter.get('/orders/', authenticateLoginToken, async (req:any,res,next)=>{
  const userID:string = req.payload.loginPayload.user._id;
  try{
    const orders:Order[] | null = await getAllOrdersByUserID(userID);
    if (!orders || orders.length===0) throw new Error('No orders were found for the provided user.');
    res.status(HttpStatusCodes.OK).json({orders: orders});
  }catch(err){
    handleError(res,HttpStatusCodes.NOT_FOUND,err);
  };
});