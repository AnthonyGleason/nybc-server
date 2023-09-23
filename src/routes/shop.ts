import Cart from '@src/classes/Cart';
import HttpStatusCodes from '@src/constants/HttpStatusCodes';
import { getItemByID, getItemByName } from '@src/controllers/item';
import { invalidatedTokens, issueCartJWTToken } from '@src/helpers/auth';
import { authenticateToken } from '@src/middlewares/auth';
import {Router} from 'express'
import {Item} from '../interfaces/interfaces';

export const shopRouter = Router();

//check out a cart
shopRouter.post('/carts/checkout',(req,res,next)=>{

});

//verify a cart token
shopRouter.get('/carts/verify',authenticateToken,(req:any,res,next)=>{
  res.status(HttpStatusCodes.OK).json({isValid: true,cart: req.payload.cart});
});

//create a cart and return the jwt token of the cart to the user
shopRouter.post('/carts',(req,res,next)=>{
  //create an empty cart
  const cart:Cart = new Cart();
  //sign a token for the cart
  const token = issueCartJWTToken(cart);
  res.status(HttpStatusCodes.OK).json({cartToken:token});
});

//gets current cart based on provided bearer token
shopRouter.get('/carts',authenticateToken,(req:any,res,next)=>{
  res.status(HttpStatusCodes.OK).json({cart: req.payload.cart});
});

//update a cart based on the provided bearer token
shopRouter.put('/carts',authenticateToken, async (req:any,res,next)=>{
  const {
    itemName,
    quantity
  }:{
    itemName:string,
    quantity:number
  } = req.body;
  //handle invalid quantity
  if (quantity<0){
    res.status(HttpStatusCodes.BAD_REQUEST).json({message: 'You cannot have a quantity of less than 0.'});
  }else{
    //get cart
    let cart:Cart = new Cart(req.payload.cart.items);
    try{
      //get item data from mongoDB
      const itemDoc: Item | null = await getItemByName(itemName);
      if (itemDoc){
        //handle modify cart
        cart.handleModifyCart(itemDoc,quantity);
        //invalidate old token
        invalidatedTokens.push(req.token);
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
  };
});


//get the order data for provided order id
shopRouter.get('/orders',authenticateToken,(req,res,next)=>{

});