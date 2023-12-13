import { isTestingModeEnabled } from "@src/config/config";
import HttpStatusCodes from "@src/constants/HttpStatusCodes";
import { handleError } from "@src/helpers/error";
import { stripe } from "@src/util/stripe";
import { Router } from "express";
import { handleSubscriptionCreated, handleSubscriptionDeleted, handleSubscriptionUpdated} from '../helpers/memberships';

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
export default membershipsRouter;