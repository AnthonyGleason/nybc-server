import Cart from '@src/classes/Cart';
import HttpStatusCodes from '@src/constants/HttpStatusCodes';
import { getAllItems, getItemByID } from '@src/controllers/item';
import { invalidatedTokens, issueCartJWTToken, tempCartTokens } from '@src/helpers/auth';
import { Router } from 'express'
import { stripe } from '@src/util/stripe';
import { authenticateCartToken, authenticateLoginToken, handleCartLoginAuth} from '@src/middlewares/auth';
import { getMembershipByUserID } from '@src/controllers/membership';
import { getUserByID } from '@src/controllers/user';
import { Address, BagelItem, CartInterface, CartItem, Membership, Order, SpreadItem, TempCartToken, User } from '@src/interfaces/interfaces';
import { createOrder, getAllOrdersByUserID, getOrderByOrderID } from '@src/controllers/order';
import jwt from 'jsonwebtoken';
import { handleError } from '@src/helpers/error';

export const shopRouter = Router();

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
      country: paymentIntentSucceeded.shipping.address.country
    }; 
    const giftMessage = paymentIntentSucceeded.metadata.giftMessage || '';
    
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
        cart = payload;
      }
    );
    
    //verify the cart was successfully validated
    if (!cart) throw new Error('A cart was not found or is not valid.');
    
    //now that we have the cart, update the tax (in the future this shouldnt be performed on this route)
    cart.tax = paymentIntentSucceeded.metadata.tax_amount / 100; //convert tax in cents to x.xx 
    
    try{
      const orderDoc: Order = await createOrder(
        userID,
        totalAmount,
        cart, //parse stringified cart
        shippingAddress,
        giftMessage
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

shopRouter.post('/carts/create-tax-calculation',authenticateLoginToken,authenticateCartToken, async(req:any,res,next)=>{
  const cart:Cart = new Cart(req.payload.cartPayload.cart.items);
  // Convert each cart item to a Stripe line item object
  const lineItems = cart.items.map(
    (cartItem:CartItem,index:number) => ({
      reference: index,
      amount: Math.floor((cartItem.unitPrice * cartItem.quantity)*100), //convert to cents
      quantity: cartItem.quantity
    })
  );

  // Get the customer's address from the request body
  const address = req.body.address;

  // Create a tax calculation using the Stripe API
  const calculation = await stripe.tax.calculations.create({
    currency: 'usd',
    line_items: lineItems,
    customer_details: {
      address: {
        line1: address.line1,
        line2: address.line2 || '',
        city: address.city,
        state: address.state,
        postal_code: address.postal_code,
        country: address.country,
      },
      address_source: "billing"
    },
    expand: ['line_items.data.tax_breakdown']
  });

  let paymentID = req.body.clientSecret.split('_secret_')[0]; //obtain the payment id from the first half of the clientSecret
  let paymentIntent:any = {};
  // Update the PaymentIntent if one already exists for this cart.
  if (paymentID) {
    paymentIntent = await stripe.paymentIntents.update(paymentID, {
      amount: calculation.amount_total,
      metadata: {
        tax_calculation: calculation.id,
        tax_amount: calculation.tax_amount_exclusive
      },
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
  res.status(200).json({
    paymentIntentToken: paymentIntent.client_secret,
    taxAmount: calculation.tax_amount_exclusive,
    total: calculation.amount_total
  });
});

shopRouter.post('/carts/create-payment-intent',authenticateCartToken,authenticateLoginToken,async (req:any,res,next)=>{
  let cart:Cart = new Cart(req.payload.cartPayload.cart.items);
  //get membership level for user
  const membershipDoc:Membership | null = await getMembershipByUserID(req.payload.loginPayload.user._id);
  //perform cleanup and verification
  cart.verifyUnitPrices();
  cart.calcTotalQuantity();
  //reapply discounts to items
  if (membershipDoc) cart.applyMembershipPricing(membershipDoc.tier);
  cart.calcSubtotal();
  //store the token temporarily because it is too long to be sent through stripe
  const tempCartToken:TempCartToken = {
    cartToken: req.tokens.cart,
    userID: req.payload.loginPayload.user._id
  };
  tempCartTokens.push(tempCartToken);
  //create payment intent
  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.floor(cart.subtotal * 100),
    currency: 'usd', // Change this to your preferred currency
    metadata:{
      userID: req.payload.loginPayload.user._id
    }
  });
  res.json({ paymentIntentToken: paymentIntent.client_secret });
});

//verify a cart token
shopRouter.get('/carts/verify',authenticateCartToken,(req:any,res,next)=>{
  res.status(HttpStatusCodes.OK).json({isValid: true,cart: req.payload.cartPayload.cart});
});

//create a cart and return the jwt token of the cart to the user
shopRouter.post('/carts',(req,res,next)=>{
  //create an empty cart
  const cart:Cart = new Cart();
  //sign a token for the cart
  const token = issueCartJWTToken(cart);
  res.status(HttpStatusCodes.OK).json({cartToken:token});
});

//get the user's current cart based on provided bearer token
shopRouter.get('/carts',authenticateCartToken,handleCartLoginAuth, async(req:any,res,next)=>{
  const cart:Cart = new Cart(req.payload.cartPayload.cart.items);
  let userDoc:User | null = null;
  let membershipTier:string = 'Non-Member';
  //a login token was provided
  if (req.payload.loginPayload && req.payload.loginPayload.user._id){
    userDoc = await getUserByID(req.payload.loginPayload.user._id);
  };
  //a user was found for the provided token
  if (userDoc){
    const membershipDoc: Membership | null = await getMembershipByUserID(userDoc._id as string);
    if (membershipDoc) membershipTier = membershipDoc.tier;
  };
  //perform cleanup and verification
  cart.verifyUnitPrices();
  cart.calcTotalQuantity();
  //reapply discounts to items
  cart.applyMembershipPricing(membershipTier);
  cart.calcSubtotal();
  res.status(HttpStatusCodes.OK).json({cart: req.payload.cartPayload.cart});
});

//update a cart based on the provided bearer token
shopRouter.put('/carts',authenticateCartToken, handleCartLoginAuth,async (req:any,res,next)=>{
  let userDoc:User | null = null;
  const selection:string | undefined = req.body.selection;
  //attempt to get the user's membership status
  if (req.payload.loginPayload && req.payload.loginPayload.user._id){
    userDoc = await getUserByID(req.payload.loginPayload.user._id);
  };
  let membershipTier:string = 'Non-Member';
  if (userDoc){
    const membershipDoc: Membership | null = await getMembershipByUserID(userDoc._id as string);
    if (membershipDoc) membershipTier = membershipDoc.tier;
  };
  const itemID:string = req.body.itemID;
  let updatedQuantity:number = req.body.updatedQuantity;

  //handle invalid quantity
  if (updatedQuantity<0) updatedQuantity=0;
  //get cart
  let cart:Cart = new Cart(req.payload.cartPayload.cart.items);
  try{
    //get item data from mongoDB
    const itemDoc:BagelItem | SpreadItem | null = await getItemByID(itemID);
    if (itemDoc){
      //handle modify cart
      cart.handleModifyCart(itemDoc,updatedQuantity,selection);
      //invalidate old token
      invalidatedTokens.push(req.tokens.cartToken);
      //perform cleanup and verification
      cart.verifyUnitPrices();
      cart.calcTotalQuantity();
      //reapply discounts to items
      cart.applyMembershipPricing(membershipTier);
      cart.calcSubtotal();
      
      //sign a new token for the user
      const token:string = issueCartJWTToken(cart);
      //send it to the client
      res.status(HttpStatusCodes.OK).json({
        cartToken: token,
        cart: cart
      });
    };
  }catch(err){
    console.log(err);
    res.status(HttpStatusCodes.NOT_FOUND).json({message: 'The requested item was not found.'});
  };
});

//get all shop items
shopRouter.get('/all', async (req,res,next)=>{
  try{
    const allItems:(BagelItem | SpreadItem)[] | null = await getAllItems();
    if (allItems){
      res.status(HttpStatusCodes.OK).json({allItems:allItems});
    }else{
      res.status(HttpStatusCodes.NOT_FOUND).json({allItems: []});
    };
  }catch(err){
    console.log(err);
    res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR)
      .json({message: 'An error has occured when fetching item data!',allItems: []});
  };
});

//get shop item by item id
shopRouter.get('/item/:itemID', async (req,res,next)=>{
  const itemID:string = req.params.itemID;
  try{
    const item:BagelItem | SpreadItem | null = await getItemByID(itemID);
    if (item){
      res.status(HttpStatusCodes.OK).json({item: item});
    }else{
      res.status(HttpStatusCodes.NOT_FOUND);
    };
  }catch(err){
    console.log(err);
    res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR)
      .json({message: 'An error has occured when fetching item data!',allItems: []});
  };
});

//get order by order id (users)
shopRouter.get('/orders/:orderID', authenticateLoginToken, async (req:any,res,next)=>{
  const orderID:string = req.params.orderID;
  const userID:string = req.payload.loginPayload.user._id;
  const orderDoc:Order | null = await getOrderByOrderID(orderID);
  //if a doc was found and user is authorized to access info
  if (orderDoc && (userID===orderDoc.userID)){
    res.status(HttpStatusCodes.OK).json({'orderDoc': orderDoc});
  }
  //a doc is not found by user
  else if (!orderDoc){
    res.status(HttpStatusCodes.NOT_FOUND);
  }
  //user is not authorized to access content
  else{
    res.status(HttpStatusCodes.UNAUTHORIZED);
  }
});

//get all orders for user
shopRouter.get('/orders/', authenticateLoginToken, async (req:any,res,next)=>{
  const userID:string = req.payload.loginPayload.user._id;
  const orders:Order[] | null = await getAllOrdersByUserID(userID);
  if (orders){
    res.status(HttpStatusCodes.OK).json({orders: orders});
  }else{
    res.status(HttpStatusCodes.NOT_FOUND);
  };
});