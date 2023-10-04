import { NextFunction, Response } from "express";
import jwt from 'jsonwebtoken';
import { invalidatedTokens } from "@src/helpers/auth";

//authenticates jwt login tokens
export const authenticateLoginToken = function(req:any, res:any, next:any) {
  req.payload = req.payload || {}; //grabs the payload from the last middleware if it exists otherwise initializes it
  req.tokens = req.tokens || {}; //grabs the payload from the last middleware if it exists otherwise initializes it
  const authHeader:string | undefined = req.headers.authorization;
  const authToken = authHeader && authHeader.split(' ')[1]; //get the token which is at index 1 (index 0 would just say Bearer)
  //handle token does not exist or token is revoked
  if (!authToken || invalidatedTokens.includes(authToken)) {
    return res.status(401).json({ 
      isValid: false,
      message: 'Unauthorized',
    });
  };
  //verify bearer token
  jwt.verify(
    authToken, process.env.SECRET as jwt.Secret,
    (err:any, payload:any) => {
      //an error was found when verifying the bearer token
      if (err) {
        return res.status(403).json({
          isValid: false,
          message: 'Forbidden',
        });
      };
      //assign the payload and token to the request for future use in next middleware/route functions
      req.payload.loginPayload = payload;
      req.tokens.login = authToken;
      next();
    }
  );
};

export const authenticateCartToken = function(req:any,res:any,next:any){
  req.payload = req.payload || {}; //grabs the payload from the last middleware if it exists otherwise initializes it
  req.tokens = req.tokens || {}; //grabs the payload from the last middleware if it exists otherwise initializes it
  const cartTokenHeader:string | undefined = req.headers['cart-token'];
  const cartToken = cartTokenHeader && cartTokenHeader.split(' ')[1];
   //handle token does not exist or token is revoked
   if (! cartToken || invalidatedTokens.includes( cartToken)) {
    return res.status(401).json({ 
      isValid: false,
      message: 'Unauthorized',
    });
  };
  //verify bearer token
  jwt.verify(
    cartToken, process.env.SECRET as jwt.Secret,
    (err:any, payload:any) => {
      //an error was found when verifying the bearer token
      if (err) {
        return res.status(403).json({
          isValid: false,
          message: 'Forbidden',
        });
      };
      //assign the payload and token to the request for future use in next middleware/route functions
      req.payload.cartPayload = payload;
      req.tokens.cart =  cartToken;
      next();
    }
  );
};