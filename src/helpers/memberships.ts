import { getMembershipByUserID, updateMembershipByUserID } from "@src/controllers/membership";
import { Membership } from "@src/interfaces/interfaces";
import { stripe } from "@src/util/stripe";
import { handleError } from "./error";
import HttpStatusCodes from "@src/constants/HttpStatusCodes";
import { createMemberShipDocForUser } from "@src/__tests__/userTestsHelpers";

export const handleSubscriptionCreated = async function(event:any,res:any){
  let userID:string = event.data.object.client_reference_id;
  let subscriptionID:string = event.data.object.subscription;
  let membershipDoc:Membership | null = await getMembershipByUserID(userID);
  let subscriptionType:string = '';
  let expirationDate:Date = new Date();

  //handle subscription was not paid for
  try{
    if (event.data.object.payment_status!=='paid') throw new Error('Payment was not received.');
  }catch(err){
    handleError(res,HttpStatusCodes.PAYMENT_REQUIRED,err);
  };

  //get the subscription information
  await stripe.subscriptions.retrieve(subscriptionID)
    .then(async(response:any)=>{
      //set the expiration date
      expirationDate = new Date(response.current_period_end * 1000);
      //retrieve the name of the membership that was paid for
      await stripe.products.retrieve(response.plan.product)
        .then((response:any)=>{
          subscriptionType = response.name;
        });
    });
  //if a membership was not found create one
  if (!membershipDoc){
    membershipDoc = await createMemberShipDocForUser(userID);
  };
  //calc deliveries left
  let deliveriesLeft:number = 0;
  switch(subscriptionType){
    case 'Gold Membership Plan':
      deliveriesLeft = 1;
      break;
    case 'Platinum Membership Plan':
      deliveriesLeft = 2;
      break;
    case 'Diamond Membership Plan':
      deliveriesLeft = 4;
      break;
    default:
      break;
  };
  //add userID to subscription metadata
  await stripe.subscriptions.update(subscriptionID,{
    metadata:{
      userID: userID
    }
  });
  //calc membership name
  let membershipName:string = 'Non-Member';
  switch(subscriptionType){
    case 'Gold Membership Plan':
      membershipName = 'Gold Member';
      break;
    case 'Platinum Membership Plan':
      membershipName = 'Platinum Member';
      break;
    case 'Diamond Membership Plan':
      membershipName = 'Diamond Member';
      break;
    default:
      break;
  };
  //update the membership doc
  membershipDoc.deliveriesLeft = deliveriesLeft;
  membershipDoc.tier = membershipName;
  membershipDoc.expirationDate = expirationDate;
  //send the updated membership doc to mongoDB
  await updateMembershipByUserID(userID,membershipDoc);
  //let stripe know we processed the membership
  res.status(HttpStatusCodes.OK);
};

export const handleSubscriptionUpdated = async function(event:any,res:any){
  let subscriptionID:string = event.data.object.id;
  let expirationDate:Date = new Date();
  let newSubscriptionType:string = '';
  let userID:string = '';
  let membershipDoc:Membership | null = null;
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
  //update the membershipDoc with the fetched userID
  membershipDoc = await getMembershipByUserID(userID);
  //handle membership doesnt exist
  if (!membershipDoc){
    membershipDoc = await createMemberShipDocForUser(userID);
  };
  //if the billing cycle is updated we need to refresh the deliveries for the user
  //we are checking this by looking for changes in the current_period_end
  let isBillingCycleUpdated:boolean = false;
  if (membershipDoc && membershipDoc.expirationDate){
    //comparing both expiration dates as strings
    isBillingCycleUpdated = (expirationDate.toISOString()!==new Date(membershipDoc.expirationDate).toISOString());
  };
  if (isBillingCycleUpdated && membershipDoc){
    //apply new tier
    //apply new exp date
    //refresh deliveries for tier
    //update membership doc in mongodb
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
    membershipDoc.tier = newMembershipTier;
    membershipDoc.deliveriesLeft = newPlanAllowance;
    membershipDoc.expirationDate = expirationDate;
    await updateMembershipByUserID(userID,membershipDoc);
    res.status(HttpStatusCodes.OK);
  }else{ //otherwise we assume it is mid cycle and continue normally
    //prevent users from getting free deliveries by downgrading and upgrading subscriptions
    let oldSubscriptionNum:number = 0;
    let newSubscriptionNum:number = 0;
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
    switch(newSubscriptionType){
      case 'Gold Membership Plan':
        newSubscriptionNum = 0;
        break;
      case 'Platinum Membership Plan':
        newSubscriptionNum = 1;
        break;
      case 'Diamond Membership Plan':
        newSubscriptionNum = 2;
        break;
      default:
        break;
    };
    let userIsUpgradingTiers:boolean = oldSubscriptionNum<newSubscriptionNum;
    let newMembershipTier:string = '';
      switch(newSubscriptionType){
        case 'Gold Membership Plan':
          newMembershipTier = 'Gold Member';
          break;
        case 'Platinum Membership Plan':
          newMembershipTier = 'Platinum Member';
          break;
        case 'Diamond Membership Plan':
          newMembershipTier = 'Diamond Member';
          break;
        default:
          break;
      };
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
      res.status(HttpStatusCodes.OK);
    }else if (membershipDoc && !userIsUpgradingTiers){ //user is downgrading tiers in the same billing cycle
      membershipDoc.expirationDate = expirationDate;
      membershipDoc.tier = newMembershipTier;
      //push the new membership doc to mongodb
      await updateMembershipByUserID(userID,membershipDoc);
      res.status(HttpStatusCodes.OK);
    }else if(membershipDoc){ //user is upgrading to a tier for the first time this billing cycle
      let newPlanAllowance:number = 0;
      let oldPlanAllowance:number = 0;
      let newMembershipTier:string = '';
      //get the old plan allowance
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
      //calculate the difference in tiers
      let deliveriesToAdd:number = newPlanAllowance-oldPlanAllowance;
      //update the membership doc
      membershipDoc.deliveriesLeft = deliveriesToAdd+membershipDoc.deliveriesLeft
      membershipDoc.expirationDate = expirationDate;
      membershipDoc.tier = newMembershipTier;
      await updateMembershipByUserID(userID,membershipDoc);
      res.status(HttpStatusCodes.OK);
    };
  };
};

//reset membership doc
export const handleSubscriptionDeleted = async function(event:any,res:any){
  const userID:string = event.data.object.metadata.userID;
  let membershipDoc:Membership | null = await getMembershipByUserID(userID);
  if (membershipDoc){
    membershipDoc.deliveriesLeft = 0;
    membershipDoc.expirationDate = new Date();
    membershipDoc.tier = 'Non-Member';
    await updateMembershipByUserID(userID,membershipDoc);
    res.status(HttpStatusCodes.OK);
  }
};