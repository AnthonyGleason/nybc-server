import { getMembershipByUserID, updateMembershipByUserID } from "@src/controllers/membership";
import { Membership } from "@src/interfaces/interfaces";
import { stripe } from "@src/util/stripe";
import { handleError } from "./error";
import HttpStatusCodes from "@src/constants/HttpStatusCodes";
import { createMemberShipDocForUser } from "@src/__tests__/userTestsHelpers";

export const handleSubscriptionCreated = async function(event:any,res:any){
  try{
    if (event.data.object.payment_status!=='paid') throw new Error('Payment was not received.');
  }catch(err){
    handleError(res,HttpStatusCodes.PAYMENT_REQUIRED,err);
  };

  try{
    //handle subscription was not paid for
    let userID:string = event.data.object.client_reference_id;
    if (!userID) throw new Error('The event request is missing a client reference id.');

    let subscriptionID:string = event.data.object.subscription;
    if (!subscriptionID) throw new Error('The event request is missing a subscription id.');

    let membershipDoc:Membership | null = await getMembershipByUserID(userID);
    try{
      if (!membershipDoc) throw new Error('A membership doc was not found.');
    }catch(err){
      //if a membership was not found create one
      membershipDoc = await createMemberShipDocForUser(userID);
    };

    let expirationDate:Date | null = null;
    let newSubscriptionType:string = '';
    //get the subscription information
    await stripe.subscriptions.retrieve(subscriptionID)
      .then(async(response:any)=>{
        //set the expiration date
        expirationDate = new Date(response.current_period_end * 1000);
        //retrieve the name of the membership that was paid for
        await stripe.products.retrieve(response.plan.product)
          .then((response:any)=>{
            newSubscriptionType = response.name;
          });
      });
    try{
      if (!expirationDate) throw new Error('An expiration date was not found in the subscription data.');
    }catch(err){
      handleError(res,HttpStatusCodes.NOT_FOUND,err);
    };
    
    //calc deliveries left and calc membership name
    let deliveriesLeft:number = 0;
    let membershipName:string = 'Non-Member';

    switch(newSubscriptionType){
      case 'Gold Membership Plan':
        deliveriesLeft = 1;
        membershipName = 'Gold Member';
        break;
      case 'Platinum Membership Plan':
        deliveriesLeft = 2;
        membershipName = 'Platinum Member';
        break;
      case 'Diamond Membership Plan':
        deliveriesLeft = 4;
        membershipName = 'Diamond Member';
        break;
      default:
        break;
    };

    //add userID to subscription metadata for use when updating or deleting subscriptions
    await stripe.subscriptions.update(subscriptionID,{
      metadata:{
        userID: userID
      }
    });

    //update the membership doc
    membershipDoc.deliveriesLeft = deliveriesLeft;
    membershipDoc.tier = membershipName;
    membershipDoc.expirationDate = expirationDate || new Date();
    //send the updated membership doc to mongoDB
    await updateMembershipByUserID(userID,membershipDoc);
    return true;
  }catch(err){
    handleError(res,HttpStatusCodes.BAD_REQUEST,err);
  };
};

export const handleSubscriptionUpdated = async function(event:any,res:any):Promise<boolean>{
  try{
    if (event.data.object.object!=='subscription') throw new Error('The event type must be a subscription to proceed.');
    //the below line prevents stripe from sending new subscriptions to this handler, upon recieving a 400 error stripe will then attempt to send a request to checkout.session.completed.
    //additionally by checking for a userID we ensure that the checkout.session.completed was successfully run on first launch. this is because at subscription created we add this metadata to the user subscription
    if (!event.data.object.metadata.userID) throw new Error('The metadata is missing a userID');
    let subscriptionID:string = event.data.object.id;
    if (!subscriptionID) throw new Error('A subscription ID was not found in the request.');

    let expirationDate:Date = new Date();
    let newSubscriptionType:string = '';
    let userID:string = '';
    try{
      //get the subscription information
      await stripe.subscriptions.retrieve(subscriptionID)
        .then(async(response:any)=>{
          //set the userID
          userID = response.metadata.userID;
          //set the expiration date
          expirationDate = new Date(response.current_period_end * 1000);
          //retrieve the name of the membership that was paid for
          await stripe.products.retrieve(response.plan.product)
            .then((response:any)=>{
              newSubscriptionType = response.name;
            });
        });
      if (!userID) throw new Error('A user ID was not found in the subscription metadata.');
      if (!expirationDate) throw new Error('An expiration date was not found for the subscription.');
      
      //handle membership does not exist
      let membershipDoc:Membership | null = await getMembershipByUserID(userID);
      if (!membershipDoc) membershipDoc = await createMemberShipDocForUser(userID);

      //update the membershipDoc with the fetched userID
      
      //if the billing cycle is updated we need to refresh the deliveries for the user
      //we are checking this by looking for changes in the current_period_end
      let isBillingCycleUpdated:boolean = false;
      if (membershipDoc && membershipDoc.expirationDate){
        //comparing both expiration dates as strings
        isBillingCycleUpdated = (expirationDate.toISOString()!==new Date(membershipDoc.expirationDate).toISOString());
      };
      
      
      if (isBillingCycleUpdated && membershipDoc){ //billing cycle is updated
        //get new tier and delivery allowance
        let newMembershipTier:string = '';
        let newPlanAllowance:number = 0;
        switch(newSubscriptionType){
          case 'Gold Membership Plan':
            newMembershipTier = 'Gold Member';
            newPlanAllowance = 1;
            break;
          case 'Platinum Membership Plan':
            newMembershipTier = 'Platinum Member';
            newPlanAllowance = 2;
            break;
          case 'Diamond Membership Plan':
            newMembershipTier = 'Diamond Member';
            newPlanAllowance = 4;
            break;
          default:
            break;
        };

        //update the document in mongodb
        membershipDoc.tier = newMembershipTier;
        membershipDoc.deliveriesLeft = newPlanAllowance;
        membershipDoc.expirationDate = expirationDate;
        await updateMembershipByUserID(userID,membershipDoc);

        return true;
      }else{ //otherwise we assume the subscription is mid cycle and continue normally
        //prevent users from getting free deliveries by downgrading and upgrading subscriptions
        //we are verifing the user is not upgrading their subscription

        let newMembershipTier:string = '';

        let oldSubscriptionNum:number = 0;
        //get old subscription in a numerical form
        switch(membershipDoc?.tier){
          case 'Gold Member':
            oldSubscriptionNum = 0;
            break;
          case 'Platinum Member':
            oldSubscriptionNum = 1;
            break;
          case 'Diamond Member':
            oldSubscriptionNum = 2;
            break;
          default:
            break;
        };

        //get the new subscription in a numerical form
        let newSubscriptionNum:number = 0;
        switch(newSubscriptionType){
          case 'Gold Membership Plan':
            newSubscriptionNum = 0;
            newMembershipTier = 'Gold Member';
            break;
          case 'Platinum Membership Plan':
            newSubscriptionNum = 1;
            newMembershipTier = 'Platinum Member';
            break;
          case 'Diamond Membership Plan':
            newSubscriptionNum = 2;
            newMembershipTier = 'Diamond Member';
            break;
          default:
            break;
        };
        
        //determine if the user is upgrading tiers
        let userIsUpgradingTiers:boolean = oldSubscriptionNum < newSubscriptionNum;
  
        //get amount paid
        let amountDue:number = 0;
        await stripe.invoices.retrieve(event.data.object.latest_invoice)
          .then((response:any)=>{
            amountDue = response.amount_due;
          });

        //user is upgrading back to a tier they previously paid for this billing cycle
        if (membershipDoc && amountDue<=0 && userIsUpgradingTiers ){ 
          membershipDoc.expirationDate = expirationDate;
          membershipDoc.tier = newMembershipTier;
          //push the new membership doc to mongodb
          await updateMembershipByUserID(userID,membershipDoc);
          return true;
        }else if (membershipDoc && !userIsUpgradingTiers){ //user is downgrading tiers in the same billing cycle
          membershipDoc.expirationDate = expirationDate;
          membershipDoc.tier = newMembershipTier;
          //push the new membership doc to mongodb
          await updateMembershipByUserID(userID,membershipDoc);
          return true;
        }else if(membershipDoc){ //user is upgrading to a tier for the first time this billing cycle
          
          let newMembershipTier:string = '';

          //get old membership plan's delivery allowance
          let oldPlanAllowance:number = 0;
          switch(membershipDoc.tier){
            case 'Gold Member':
              oldPlanAllowance = 1;
              break;
            case 'Platinum Member':
              oldPlanAllowance = 2;
              break;
            case 'Diamond Member':
              oldPlanAllowance = 4;
              break;
            default:
              break;
          };

          //get the new membership plan's delivery allowance
          let newPlanAllowance:number = 0;
          //get new membership delivery allowance
          switch(newSubscriptionType){
            case 'Gold Membership Plan':
              newMembershipTier = 'Gold Member';
              newPlanAllowance = 1;
              break;
            case 'Platinum Membership Plan':
              newMembershipTier = 'Platinum Member';
              newPlanAllowance = 2;
              break;
            case 'Diamond Membership Plan':
              newMembershipTier = 'Diamond Member';
              newPlanAllowance = 4;
              break;
            default:
              break;
          };

          //calculate the allowance difference between tiers
          let deliveriesToAdd:number = newPlanAllowance-oldPlanAllowance;

          //update the membership doc
          membershipDoc.deliveriesLeft = deliveriesToAdd+membershipDoc.deliveriesLeft
          membershipDoc.expirationDate = expirationDate;
          membershipDoc.tier = newMembershipTier;
          await updateMembershipByUserID(userID,membershipDoc);
          return true;
        };
      };
    }catch(err){
      handleError(res,HttpStatusCodes.NOT_FOUND,err);
    };
  }catch(err){
    handleError(res,HttpStatusCodes.BAD_REQUEST,err);
  };
  return false;
};

//reset membership doc
export const handleSubscriptionDeleted = async function(event:any,res:any){
  try{
    let userID:string = '';
    
    try{
      userID = event.data.object.metadata.userID;
      if (!userID) throw new Error('A userID is missing from the metadata.');
    }catch(err){
      handleError(res,HttpStatusCodes.BAD_REQUEST,err);
    };
    
    let membershipDoc:Membership | null = await getMembershipByUserID(userID);
    if (!membershipDoc) throw new Error('A membership doc was not found for the userID provided.');

    //update the membership doc in mongoDB
    membershipDoc.deliveriesLeft = 0;
    membershipDoc.expirationDate = new Date();
    membershipDoc.tier = 'Non-Member';
    await updateMembershipByUserID(userID,membershipDoc);
    
    return true;
  }catch(err){
    handleError(res,HttpStatusCodes.NOT_FOUND,err);
  };
};