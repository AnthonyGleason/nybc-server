import Cart from '@src/classes/Cart';
import HttpStatusCodes from '@src/constants/HttpStatusCodes';
import { getAllItems, getItemByID, getItemByIdentifier, getItemByName } from '@src/controllers/item';
import { invalidatedTokens, issueCartJWTToken } from '@src/helpers/auth';
import { Router } from 'express'
import { Item, Membership } from '../interfaces/interfaces';
import { stripe } from '@src/util/stripe';
import { authenticateCartToken, authenticateLoginToken } from '@src/middlewares/auth';
import { getMembershipByUserID } from '@src/controllers/membership';

export const shopRouter = Router();

shopRouter.post('/carts/create-tax-calculation',authenticateLoginToken,authenticateCartToken, async(req:any,res,next)=>{
  const cartItems:Item[] = req.payload.cartPayload.cart.items;
  // Convert each cart item to a Stripe line item object
  const lineItems = cartItems.map(
    cartItem => ({
      reference: cartItem._id,
      amount: Math.ceil((cartItem.price * cartItem.quantity)*100), //convert to cents
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

  let paymentIntent;

  // Update the PaymentIntent if one already exists for this cart.
  if (req.body.paymentIntent) {
    paymentIntent = await stripe.paymentIntents.update(req.body.paymentIntent, {
      amount: calculation.amount_total,
      metadata: {tax_calculation: calculation.id},
    });
  } else {
    paymentIntent = await stripe.paymentIntents.create({
      currency: 'usd',
      amount: calculation.amount_total,
      metadata: {tax_calculation: calculation.id},
      // In the latest version of the API, specifying the `automatic_payment_methods` parameter is optional because Stripe enables its functionality by default.
      automatic_payment_methods: {enabled: true},
    });
  };

  res.status(200).json({
    paymentIntentToken: paymentIntent.client_secret,
    taxAmount: calculation.tax_amount_exclusive,
    total: calculation.amount_total
  })
});

shopRouter.post('/carts/create-payment-intent',authenticateCartToken,authenticateLoginToken,async (req:any,res,next)=>{
  const items:Item[] = req.payload.cartPayload.cart.items;
  //get membership level for user
  const membershipDoc:Membership | null = await getMembershipByUserID(req.payload.loginPayload.user._id);

  let totalAmount:number = 0; //IN CENTS!!!
  //grab the items from mongodb and verify the pricing of each item
  let verifiedItems:Item[] = items;

  items.forEach(async (item:Item)=>{
    let verifiedItem:Item = item;
    const itemDoc:Item | null = await getItemByID(item._id);
    //break look if itemDoc is not found
    if (!itemDoc) return;
    verifiedItem.price=itemDoc.price;
    verifiedItems.push(verifiedItem);
  });
  //apply the membership discount pricing to the cart
  if (membershipDoc){
    const membershipTier:string = membershipDoc.tier;
    //apply membership pricing in switch statement
    verifiedItems.forEach((item:Item)=>{
      let discountPercent = 1;
      switch(membershipTier){
        case 'Gold Member':
          discountPercent = 0.05;
          break;
        case 'Platinum Member':
          discountPercent = 0.10;
          break;
        case 'Diamond Member':
          discountPercent = 0.15;
          break;
        default: //user is a non-member
          discountPercent = 1;
          break;
      }
      //update the item
      item.price=item.price*discountPercent;
      //apply the discount to the total amount 
      totalAmount+=Math.ceil(item.price*100); //CONVERT TO CENTS BY MULTIPLYING 100!!!!
    });
  }else{
    //apply non member pricing a membership document was not found.
    items.forEach((item:Item)=>{
      totalAmount+=Math.ceil(item.price*100); //CONVERT TO CENTS BY MULTIPLYING 100!!!!
    });
  };
  //create payment intent
  const paymentIntent = await stripe.paymentIntents.create({
    amount: totalAmount,
    currency: 'usd', // Change this to your preferred currency
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
shopRouter.get('/carts',authenticateCartToken,(req:any,res,next)=>{
  res.status(HttpStatusCodes.OK).json({cart: req.payload.cartPayload.cart});
});

//update a cart based on the provided bearer token
shopRouter.put('/carts',authenticateCartToken, authenticateLoginToken, async (req:any,res,next)=>{
  const itemID:string = req.body.itemID;
  let updatedQuantity:number = req.body.updatedQuantity;
  //get membership tier for user
  const membershipDoc:Membership | null = await getMembershipByUserID(req.payload.loginPayload.user._id);
  let membershipTier:string = 'Non-Member';
  if (membershipDoc) membershipTier = membershipDoc.tier;
  //handle invalid quantity
  if (updatedQuantity<0) updatedQuantity=0;
    //get cart
    let cart:Cart = new Cart(req.payload.cartPayload.cart.items);
    try{
      //get item data from mongoDB
      const itemDoc:Item | null = await getItemByID(itemID);
      if (itemDoc){
        //handle modify cart
        cart.handleModifyCart(itemDoc, updatedQuantity,membershipTier);
        //invalidate old token
        invalidatedTokens.push(req.tokens.cartToken);
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
    const allItems:Item[] | null = await getAllItems();
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
  const itemID = req.params.itemID;
  try{
    const item:Item | null = await getItemByID(itemID);
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

//get the order data for provided order id
shopRouter.get('/orders',(req,res,next)=>{

});