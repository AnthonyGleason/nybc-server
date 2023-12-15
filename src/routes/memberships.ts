import { isTestingModeEnabled, redirectSuccessfulCheckoutsToLocalhost } from "@src/config/config";
import HttpStatusCodes from "@src/constants/HttpStatusCodes";
import { handleError } from "@src/helpers/error";
import { stripe } from "@src/util/stripe";
import { Router } from "express";
import { getSelectionName } from "@src/helpers/shop";
import { CartItem, Membership, PendingOrder } from "@src/interfaces/interfaces";
import { issueCartJWTToken } from "@src/helpers/auth";
import { createPendingOrderDoc } from "@src/controllers/pendingOrder";
import { authenticateCartToken, authenticateLoginToken } from "@src/middlewares/auth";
import Cart from "@src/classes/Cart";
import { getMembershipByUserID } from "@src/controllers/membership";

const membershipsRouter = Router();

membershipsRouter.get('/pricingTableKeys',(req:any,res,next)=>{
  if (isTestingModeEnabled){
    //testing mode ENABLED
    res.status(200).json({
      'pricingTableID': "prctbl_1OMjA2J42zMuNqyLawMzujZ1",
      'publishableKey': "pk_test_51MkbRQJ42zMuNqyLhOP6Aluvz4TVAxVFFeofdem3PAvRDUoRzwYxfm0tBeOKYhdCNhbIzSSKeVFdrp7IvVku60Yz001xBUoHhk"
    });
  }else{
    //LIVE MODE
    res.status(200).json({
      'pricingTableID': "prctbl_1OMet3J42zMuNqyLNo0BiWpN",
      'publishableKey': "pk_live_51MkbRQJ42zMuNqyLM3bL3QNb9f320fNzmvx0T9nbBUd9GKiKUSiX4zBcPy0DQ0TN303aWOckXd4bq2COmaaBerjM003vesDiuL"
    });
  };
});

membershipsRouter.post('/create-club-checkout-session',authenticateCartToken,authenticateLoginToken,async (req:any,res,next)=>{
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
    try{
      //membership must be valid
      const currentDateStr = new Date().toISOString();
      if ((!membershipDoc.tier || membershipDoc.tier==='Non-Member') || (membershipDoc.expirationDate && new Date(membershipDoc.expirationDate).toISOString() < currentDateStr)) throw new Error('You are not a member or the membership is expired.');
    }catch(err){
      handleError(res,HttpStatusCodes.UNAUTHORIZED,err);
    };

    //there must be deliveries remaining
    try{
      if (membershipDoc.deliveriesLeft<=0) throw new Error('There are no remaining deliveries left for this billing cycle.');
    }catch(err){
      handleError(res,HttpStatusCodes.FORBIDDEN,err);
    };
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
    //create session
    const session = await stripe.checkout.sessions.create({
      automatic_tax:{
        'enabled': true
      },
      metadata:{
        'pendingOrderID': pendingOrderDoc._id.toString(),
        'userID': req.payload.loginPayload.user._id.toString(),
        'isClubOrder': true
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
      line_items: cart.items.map((item:CartItem) => {
        return {
          price_data: {
            currency: "usd",
            product_data: {
              name: `${item.itemData.name} ${getSelectionName(item)}`,
            },
            unit_amount: 0, //ORDER IS FREE
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

export default membershipsRouter;