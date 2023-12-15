import Cart from '@src/classes/Cart';
import HttpStatusCodes from '@src/constants/HttpStatusCodes';
import { getAllItems, getItemByID } from '@src/controllers/item';
import { invalidatedTokens, issueCartJWTToken} from '@src/helpers/auth';
import { Router } from 'express'
import { stripe } from '@src/util/stripe';
import { authenticateCartToken, authenticateLoginToken, handleCartLoginAuth} from '@src/middlewares/auth';
import { getMembershipByUserID } from '@src/controllers/membership';
import { getUserByID } from '@src/controllers/user';
import { Membership, Order, PendingOrder, Product, User } from '@src/interfaces/interfaces';
import { getAllOrdersByUserID, getOrderByOrderID } from '@src/controllers/order';
import { handleError } from '@src/helpers/error';
import { createPendingOrderDoc, getPendingOrderDocByDocID, updatePendingOrderDocByDocID } from '@src/controllers/pendingOrder';
import { getCustomOrderMailOptions, getOrderPlacedMailOptions } from '@src/constants/emails';
import { transporter } from "@src/server";
import { getSelectionName, handleOrderPayment, verifyModifyClubCart } from '@src/helpers/shop';
import { isTestingModeEnabled, redirectSuccessfulCheckoutsToLocalhost } from '@src/config/config';
import { handleSubscriptionCreated, handleSubscriptionDeleted, handleSubscriptionUpdated } from '@src/helpers/memberships';

export const shopRouter = Router();

// relevant documentation for the below webhook route, https://dashboard.stripe.com/webhooks/create?endpoint_location=local
shopRouter.post('/stripe-webhook-listener', async(req:any,res,next)=>{
  try{
    const sig = req.headers['stripe-signature'];
    const endpointSecret: string | undefined = isTestingModeEnabled===true ? process.env.STRIPE_WEBHOOK_TEST_SIGNING_SECRET : process.env.STRIPE_WEBHOOK_SIGNING_SECRET;
    //catch any errors that occur when constructing the webhook event (such as wrong body format, too many characters etc...)
    const event:any = stripe.webhooks.constructEvent(req.rawBody, sig, endpointSecret); //req.rawBody is assigned through middleware in server.js
    if (!event || !event.data) throw new Error('No event data was found! This route requires this.');

    //ensure the event is the correct type
    switch(event.type){

      case 'checkout.session.completed':
        switch (event.data.object.mode) {
          case 'subscription':
            await handleSubscriptionCreated(event, res);
            break;

          case 'payment':
            await handleOrderPayment(event, res);
            break;

          default:
            throw new Error(`Unhandled mode: ${event.data.object.mode}`);
        };
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event,res);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event,res)
        break;

      default:
        throw new Error('This route does not support the event, '+event.type);
    };
    res.status(HttpStatusCodes.OK).send();
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
    req.payload.cartPayload.cart.discountAmountInDollars,
    req.payload.cartPayload.cart.finalPriceInDollars,
    req.payload.cartPayload.cart.desiredShipDate
  );
  if (membershipDoc){
    try{
      const currentDateStr = new Date().toISOString();
      if (membershipDoc.expirationDate && new Date(membershipDoc.expirationDate).toISOString() < currentDateStr) throw new Error('Your membership has expired.');
      await cart.cleanupCart(membershipDoc.tier);
    }catch(err){
      await cart.cleanupCart('Non-Member');
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

//used to get order data on checkout
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

shopRouter.post('/carts/create-checkout-session',authenticateCartToken,authenticateLoginToken,async (req:any,res,next)=>{
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
  let isClubCart:boolean = req.body.isClubCart || false;
  //get cart from payload
  const cart:Cart = new Cart(
    req.payload.cartPayload.cart.items,
    req.payload.cartPayload.cart.subtotalInDollars,
    req.payload.cartPayload.cart.taxInDollars,
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

  //if it is a club cart make sure the item can be added
  //we only allow 6 bagel types and 1 spread type
  try{
    if (isClubCart){
      const isValidRequest:boolean = await verifyModifyClubCart(selection,itemID,updatedQuantity,cart);
      console.log('isvalid', isValidRequest);
      if (!isValidRequest) throw new Error('You cannot add any more of that item type to your cart.');
    };
  }catch(err){
    handleError(res,HttpStatusCodes.NOT_EXTENDED,err);
  };

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
    const itemDoc:Product | null = await getItemByID(itemID);
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
    const allItems:Product[] | null = await getAllItems();
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
    const item:Product | null = await getItemByID(itemID);
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