import Cart from '@src/classes/Cart';
import HttpStatusCodes from '@src/constants/HttpStatusCodes';
import { getAllItems, getItemByID } from '@src/controllers/item';
import { invalidatedTokens, issueCartJWTToken, tempCartTokens } from '@src/helpers/auth';
import { Router } from 'express'
import { stripe } from '@src/util/stripe';
import { authenticateCartToken, authenticateLoginToken, handleCartLoginAuth} from '@src/middlewares/auth';
import { getMembershipByUserID } from '@src/controllers/membership';
import { getUserByID } from '@src/controllers/user';
import { Address, BagelItem, CartInterface, CartItem, Membership, Order, PromoCode, SpreadItem, TempCartToken, User } from '@src/interfaces/interfaces';
import { createOrder, getAllOrdersByUserID, getOrderByOrderID } from '@src/controllers/order';
import jwt from 'jsonwebtoken';
import { handleError } from '@src/helpers/error';
import { getPromoCodeByCode, getPromoCodeByID, updatePromoCodeByID } from '@src/controllers/promocode';

export const shopRouter = Router();

shopRouter.get('/promoCode',authenticateLoginToken,authenticateCartToken,async(req:any,res,next)=>{
  const cart:Cart = new Cart(
    req.payload.cartPayload.cart.items,
    undefined,
    undefined,
    req.payload.cartPayload.cart.promoCodeID || undefined,
    req.payload.cartPayload.cart.discountAmount || 0,
    req.payload.cartPayload.cart.finalPrice || 0
  );
  if (!cart.promoCodeID){
    res.status(HttpStatusCodes.NOT_FOUND);
  }else{
    //get promo code doc
    const promoDoc:PromoCode | null = await getPromoCodeByID(cart.promoCodeID);
    if (promoDoc){
      //get discount amount obtained by reversing the discount
      const discountAmount:number = cart.discountAmount;
      //get promo code input (name of code) for client
      const promoCodeName:string = promoDoc.code;
      //get is promo applied to cart bool
      const isPromoApplied:boolean = true;
      res.status(HttpStatusCodes.OK).json({
        discountAmount: discountAmount,
        isPromoApplied: isPromoApplied,
        promoCodeName: promoCodeName
      });
    };
  };
});

shopRouter.put('/promoCode',authenticateLoginToken,authenticateCartToken,async(req:any,res,next)=>{
  const cart:Cart = new Cart(
    req.payload.cartPayload.cart.items,
    undefined,
    undefined,
    req.payload.cartPayload.cart.promoCodeID || undefined,
    req.payload.cartPayload.cart.discountAmount || 0,
    req.payload.cartPayload.cart.finalPrice || 0
  );
  const promoCodeInput:string = req.body.promoCodeInput;
  let paymentID = req.body.clientSecret.split('_secret_')[0]; 
  let paymentIntent:any = {};

  //get membership tier and apply membership discount
  const membershipDoc:Membership | null = await getMembershipByUserID(req.payload.loginPayload.user._id);

  //cleanup cart
  await cart.cleanupCart(membershipDoc?.tier || '');

  //attempt to get promo code data
  const promoCodeDoc:PromoCode | null = await getPromoCodeByCode(promoCodeInput);
  
  //apply promo code to temp payment intent if it exists and the user correctly entered the code
  if (
    promoCodeDoc && //a promo code doc was found
    promoCodeInput===promoCodeDoc.code && //user correctly entered the promo code
    promoCodeDoc.dateOfExpiry > new Date() //verify promo code is not expired
  ){
    //verify promo code still has uses
    if (
      !promoCodeDoc.totalAllowedUses || //promo code has unlimited uses
      (promoCodeDoc.totalAllowedUses && (promoCodeDoc.totalAllowedUses>promoCodeDoc.totalTimesUsed)) //promo code has uses left
    ){
      //add +1 to total uses
      let updatedPromoCodeDoc:PromoCode = promoCodeDoc;
      updatedPromoCodeDoc.totalTimesUsed+=1;
      await updatePromoCodeByID(promoCodeDoc._id,updatedPromoCodeDoc);

      //calc new subtotal
      cart.calcSubtotal();

      //apply promo code
      cart.calcPromoCodeDiscountAmount(promoCodeDoc.perk);

      //calc new final price
      cart.calcFinalPrice();

      //update the payment intent if one exists
      try{
        if (!paymentIntent) throw new Error('There was an error obtaining the payment intent.');
        // Update the PaymentIntent if one already exists for this cart.
        paymentIntent = await stripe.paymentIntents.update(paymentID, {
          amount: Math.floor(cart.finalPrice*100), //convert to cents and round it down
          metadata: {
            promoCodeID: promoCodeDoc._id
          },
        });
      }catch(err){
        handleError(res,HttpStatusCodes.INTERNAL_SERVER_ERROR,err);
      };

      //set the promo code id for retrieval later
      cart.promoCodeID = promoCodeDoc._id;
      //issue updating cart token
      const tempCartToken = issueCartJWTToken(cart);
      
      //respond to client with the updated token
      res.status(200).json({
        clientSecret: paymentIntent.client_secret,
        cartToken: tempCartToken
      });
    }else{
      //promo code is not valid
      console.log('not valid or expired');
    };
  };
});

shopRouter.delete('/promoCode',authenticateLoginToken,authenticateCartToken,async(req:any,res,next)=>{
  //verify cart item prices
  //calculate membership discounts
  //remove promo code from cart if it exists
  //calculate subtotal
  //update the payment intent if one exists
  //respond to client with updated token
});

//update the gift message
shopRouter.put('/giftMessage', authenticateLoginToken, authenticateCartToken, async(req:any,res,next)=>{
  const updatedGiftMessage:string = req.body.updatedGiftMessage;
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
  }catch(err){
    handleError(res,HttpStatusCodes.INTERNAL_SERVER_ERROR,err);
  };
  res.status(HttpStatusCodes.OK).json({paymentIntentToken: paymentIntent.client_secret});
});

// relevant documentation for the below webhook route, https://dashboard.stripe.com/webhooks/create?endpoint_location=local
shopRouter.post('/stripe-webhook-payment-succeeded', async(req:any,res,next)=>{
  const sig = req.headers['stripe-signature'];
  const endpointSecret:string | undefined = process.env.STRIPE_SIGNING_SECRET;
  let event;

  try {
    //catch any errors that occur when constructing the webhook event (such as wrong body format, too many characters etc...)
    event = stripe.webhooks.constructEvent(req.rawBody, sig, endpointSecret); //req.rawBody is assigned through middleware in server.js
  } catch (err) {
    handleError(res,HttpStatusCodes.BAD_REQUEST,err);
  };
  
  try{
    //ensure the payment intent is the correct type
    const paymentIntentSucceeded = event.data.object;
    if (event.type!=='payment_intent.succeeded') throw new Error('This route only handles succeeded payments.');

    //get required properties to create the order doc from the payment intent
    const userID:string = paymentIntentSucceeded.metadata.userID;
    const totalAmount:number = paymentIntentSucceeded.amount;
    const shippingAddress:Address = {
      line1: paymentIntentSucceeded.shipping.address.line1,
      line2: paymentIntentSucceeded.shipping.address.line2 || undefined,
      city: paymentIntentSucceeded.shipping.address.city,
      state: paymentIntentSucceeded.shipping.address.state,
      postal_code: paymentIntentSucceeded.shipping.address.postal_code,
      country: paymentIntentSucceeded.shipping.address.country,
      phone: paymentIntentSucceeded.metadata.customer_phone,
      fullName: paymentIntentSucceeded.metadata.customer_fullName
    }; 
    const giftMessage:string = paymentIntentSucceeded.metadata.giftMessage || '';
    const promoCodeID:string = paymentIntentSucceeded.metadata.promoCodeID || '';
    
    //get cart token from memory
    let tempCartToken:TempCartToken | undefined= tempCartTokens.find((tempCartToken:TempCartToken)=>{
      if (tempCartToken.userID===userID) return true;
    });

    //validate all required fields were provided
    if (!tempCartToken||!shippingAddress||!totalAmount) throw new Error('One or more of the required fields were not provided.');

    //remove the array item from memory
    tempCartTokens.splice(tempCartTokens.indexOf(tempCartToken),1);

    //get cart payload from token
    let cart:CartInterface | undefined;
    jwt.verify(
      tempCartToken.cartToken, process.env.SECRET as jwt.Secret,
      async (err:any, payload:any) => {
        //an error was found when verifying the bearer token
        if (err) {
          return res.status(403).json({
            isValid: false,
            message: 'Forbidden',
          });
        };
        cart = payload.cart;
      }
    );
    
    //verify the cart was successfully validated
    if (!cart) throw new Error('A cart was not found or is not valid.');
    
    //now that we have the cart, update the tax (in the future this shouldnt be performed on this route)
    cart.tax = paymentIntentSucceeded.metadata.tax_amount / 100; //convert tax in cents to x.xx (making it human readable)
    
    try{
      const orderDoc: Order = await createOrder(
        userID,
        totalAmount,
        cart,
        shippingAddress,
        giftMessage,
        promoCodeID
      );
      if (!orderDoc) throw new Error('An error has occured when updating the order doc.');
    }catch(err){
      handleError(res,HttpStatusCodes.NOT_MODIFIED,err);
    };
  }catch(err){
    handleError(res,HttpStatusCodes.BAD_REQUEST,err);
  };

  // Return a 200 response to acknowledge receipt of the event
  res.status(HttpStatusCodes.OK).send();
});

shopRouter.post('/carts/applyMembershipPricing', authenticateCartToken, handleCartLoginAuth, async (req:any,res,next)=>{
  let membershipDoc:Membership | null = null;
  if (
    req.payload.loginPayload &&
    req.payload.loginPayload.user &&
    req.payload.loginPayload.user._id
  ){
    membershipDoc = await getMembershipByUserID(req.payload.loginPayload.user._id);
  };
    const cart:Cart = new Cart(
    req.payload.cartPayload.cart.items,
    undefined,
    undefined,
    req.payload.cartPayload.cart.promoCodeID || undefined,
    req.payload.cartPayload.cart.discountAmount || 0,
    req.payload.cartPayload.cart.finalPrice || 0
  );
  if (membershipDoc){
    await cart.cleanupCart(membershipDoc.tier);
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

shopRouter.post('/carts/create-tax-calculation',authenticateLoginToken,authenticateCartToken, async(req:any,res,next)=>{
  const cart:Cart = new Cart(
    req.payload.cartPayload.cart.items,
    undefined,
    undefined,
    req.payload.cartPayload.cart.promoCodeID || undefined,
    req.payload.cartPayload.cart.discountAmount || 0,
    req.payload.cartPayload.cart.finalPrice || 0
  );
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
  const lineItems = cart.items.map(
    (cartItem:CartItem,index:number) => ({
      reference: index,
      amount: Math.floor(((cartItem.unitPrice - (cartItem.unitPrice * discountMultiplier))*cartItem.quantity)*100), //convert to cents and apply the promo code discount if applicable
      quantity: cartItem.quantity
    })
  ); 
  
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
          tax_amount: calculation.tax_amount_exclusive,
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
  res.status(200).json({
    paymentIntentToken: paymentIntent.client_secret,
    taxAmount: calculation.tax_amount_exclusive,
    total: calculation.amount_total
  });
});

shopRouter.post('/carts/create-payment-intent',authenticateCartToken,authenticateLoginToken,async (req:any,res,next)=>{
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
      undefined,
      undefined,
      req.payload.cartPayload.cart.promoCodeID || undefined,
      req.payload.cartPayload.cart.discountAmount || 0,
      req.payload.cartPayload.cart.finalPrice || 0
    );
    if (!cart || cart.isCartEmpty()) throw new Error('You cannot proceed to checkout with an empty cart.');
    
    //cleanup cart
    await cart.cleanupCart(membershipTier);
  }catch(err){
    handleError(res,HttpStatusCodes.BAD_REQUEST,err);
  };

  //store the token temporarily because it is too long to be sent through stripe
  const tempCartToken:TempCartToken = {
    cartToken: req.tokens.cart,
    userID: req.payload.loginPayload.user._id
  };
  tempCartTokens.push(tempCartToken);

  try{
    if (!cart || cart.isCartEmpty()) throw new Error('You cannot proceed to checkout with an empty cart.');
    const finalPriceInCents:number = Math.floor(cart.finalPrice * 100);
    //create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: finalPriceInCents,
      currency: 'usd', // Change this to your preferred currency
      metadata:{
        userID: req.payload.loginPayload.user._id
      }
    });
    //verify a payment intent was successfully created
    if (!paymentIntent) throw new Error('An error occured when creating a payment intent.');

    res.status(HttpStatusCodes.OK).json({ paymentIntentToken: paymentIntent.client_secret });
  }catch(err){
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
    undefined,
    undefined,
    req.payload.cartPayload.cart.promoCodeID || undefined,
    req.payload.cartPayload.cart.discountAmount || 0,
    req.payload.cartPayload.cart.finalPrice || 0
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
  }catch(err){
    handleError(res,HttpStatusCodes.BAD_REQUEST,err);
  };

  try{
    //verify a cart was found (it doesn't matter if it is empty)
    if (!cart) throw new Error('An error occured when obtaining cart data.');

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
    undefined,
    undefined,
    req.payload.cartPayload.cart.promoCodeID || undefined,
    req.payload.cartPayload.cart.discountAmount || 0,
    req.payload.cartPayload.cart.finalPrice || 0
  );

  //destructure the request body
  const {
    selection,
    itemID,
    updatedQuantity
  }:{
    selection:string,
    itemID:string,
    updatedQuantity:number
  } = req.body;
  
  try{
    if (!itemID || isNaN(updatedQuantity)) throw new Error('Required fields were not provided, or provided in an incorrect format.');
    if (!cart) throw new Error('A cart is required but not provided.');
  }catch(err){
    handleError(res,HttpStatusCodes.BAD_REQUEST,err);
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

    //handle invalid item quantity, if item quantity is less than 0 set it to 0
    if (updatedQuantity<0){
      cart.handleModifyCart(itemDoc,0,selection);
    }else{
      //handle modify cart
      cart.handleModifyCart(itemDoc,updatedQuantity,selection);
    };

    //invalidate the old cart token
    invalidatedTokens.push(req.tokens.cartToken);

    //cleanup cart
    await cart.cleanupCart(membershipTier);

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
    if (!allItems) throw new Error('No shop items were found.');
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
    if (!orders) throw new Error('No orders were found for the provided user.');
    res.status(HttpStatusCodes.OK).json({orders: orders});
  }catch(err){
    handleError(res,HttpStatusCodes.NOT_FOUND,err);
  };
});