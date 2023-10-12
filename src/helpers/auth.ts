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