import { NextFunction, Response } from "express";
import jwt from 'jsonwebtoken';
import { invalidatedTokens } from "@src/helpers/auth";

//authenticates jwt tokens
export const authenticateToken = function(req:any, res:any, next:any) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1]; //get the token which is at index 1 (index 0 would just say Bearer)
  //handle token does not exist or token is revoked
  if (!token || invalidatedTokens.includes(token)) {
    return res.status(401).json({ 
      isValid: false,
      message: 'Unauthorized',
    });
  };
  //verify bearer token
  jwt.verify(
    token, process.env.SECRET as jwt.Secret,
    (err:any, payload:any) => {
      //an error was found when verifying the bearer token
      if (err) {
        return res.status(403).json({
          isValid: false,
          message: 'Forbidden',
        });
      };
      //assign the payload and token to the request for future use in next middleware/route functions
      req.payload = payload;
      req.token = token;
      next();
    }
  );
};