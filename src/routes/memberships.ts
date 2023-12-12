import { isTestingModeEnabled } from "@src/config/config";
import HttpStatusCodes from "@src/constants/HttpStatusCodes";
import { handleError } from "@src/helpers/error";
import { stripe } from "@src/util/stripe";
import { Router } from "express";
import { handleSubscriptionCreated, handleSubscriptionDeleted, handleSubscriptionUpdated} from '../helpers/memberships';

const membershipsRouter = Router();

membershipsRouter.post('/stripe-webhook-subscriptions',(req:any,res,next)=>{
  try {
    const sig = req.headers['stripe-signature'];
    const endpointSecret: string | undefined = isTestingModeEnabled===true ? process.env.STRIPE_WEBHOOK_TEST_SIGNING_SECRET : process.env.STRIPE_WEBHOOK_SUBSCRIPTIONS_SECRET;
    //catch any errors that occur when constructing the webhook event (such as wrong body format, too many characters etc...)
    const event = stripe.webhooks.constructEvent(req.rawBody, sig, endpointSecret); //req.rawBody is assigned through middleware in server.js
    switch(event.type){
      case 'customer.subscription.updated':
        try{
          //the below line prevents stripe from sending new subscriptions to this handler
          //by checking for a userID we ensure that the checkout.session.completed was successfully run on first launch
          if (!event.data.object.metadata.userID) throw new Error('The metadata is missing a userID');
          if (event.data.object.object==='subscription') handleSubscriptionUpdated(event,res);
        }catch(err){
          handleError(res,HttpStatusCodes.BAD_REQUEST,err);
        };
        break;
      case 'customer.subscription.deleted':
        handleSubscriptionDeleted(event,res);
        break;
      default:
        console.log('This route does not support the event, '+event.type);
        throw new Error('This route does not support the event, '+event.type);
    };
  } catch (err) {
    handleError(res,HttpStatusCodes.BAD_REQUEST,err);
  };
});
export default membershipsRouter;