import {PasswordReset, TempCartToken, User} from '@src/interfaces/interfaces';
import jwt from 'jsonwebtoken'

//issue jwt login tokens
export const issueUserJWTToken = function(user:User){
  //returns a jwt token for the user session containing a payload with the users vault
  return jwt.sign({
    user: user,
  },
    process.env.SECRET as jwt.Secret,
  {
    expiresIn: '1D',
  });
};

//issue jwt login tokens
export const issueCartJWTToken = function(cart:any){
  //returns a jwt token for the user session containing a payload with the users vault
  return jwt.sign({
    cart:cart
  },
    process.env.SECRET as jwt.Secret,
  {
    expiresIn: '1H',
  });
};

export let passwordResetTokens: PasswordReset[] = [];
export let invalidatedTokens: String[] = [];
export let tempCartTokens: TempCartToken[] = [];

export const getCartTokenByUserID = (userID:string):TempCartToken | undefined=>{
  //get cart token from memory
  let tempCartToken:TempCartToken | undefined= tempCartTokens.find((tempCartToken:TempCartToken)=>{
    if (tempCartToken.userID===userID) return true;
  });
  return tempCartToken;
};

export const deleteCartTokenByTempCartToken = (tempCartToken:TempCartToken)=>{
  tempCartTokens.splice(tempCartTokens.indexOf(tempCartToken),1);
};

export const storeTempCartToken = (tempCartToken:TempCartToken)=>{
  //a token doesnt exist yet
  if (!getCartTokenByUserID(tempCartToken.userID)){
    tempCartTokens.push(tempCartToken);
  }else{
    //update the token one already exists
    //delete the old one
    const oldTempCartToken:TempCartToken | undefined = getCartTokenByUserID(tempCartToken.userID);
    if (oldTempCartToken) deleteCartTokenByTempCartToken(oldTempCartToken); 
    //add the new one
    tempCartTokens.push(tempCartToken);
  }
};