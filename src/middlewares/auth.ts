import jwt from 'jsonwebtoken';
import { invalidatedTokens } from "@src/helpers/auth";
import { User } from "@src/interfaces/interfaces";
import { getUserByID } from "@src/controllers/user";
import HttpStatusCodes from "@src/constants/HttpStatusCodes";

export const handleCartLoginAuth = function(req: any, res: any, next: any) {
  const authHeader: string | undefined = req.headers.authorization;
  if (authHeader && authHeader.split(' ')[1] !== 'null') { //null is stringified when passed to the server
    // Assuming authenticateLoginToken handles authentication properly
    authenticateLoginToken(req, res, next);
  } else{
    next();
  };
};


//authenticates jwt login tokens
export const authenticateLoginToken = function(req:any, res:any, next:any) {
  req.payload = req.payload || {}; //grabs the payload from the last middleware if it exists otherwise initializes it
  req.tokens = req.tokens || {}; //grabs the payload from the last middleware if it exists otherwise initializes it
  const authHeader:string | undefined = req.headers.authorization;
  const authToken = authHeader && authHeader.split(' ')[1]; //get the token which is at index 1 (index 0 would just say Bearer)
  //handle token does not exist or token is revoked
  if (!authToken || invalidatedTokens.includes(authToken)) {
    return res.status(HttpStatusCodes.UNAUTHORIZED).json({ 
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
        return res.status(HttpStatusCodes.UNAUTHORIZED).json({
          isValid: false,
          message: 'Unauthorized',
        });
      };
      //assign the payload and token to the request for future use in next middleware/route functions
      req.payload.loginPayload = payload;
      req.tokens.login = authToken;
      next();
    }
  );
};

//authenticates jwt login tokens
export const authenticateAdmin = async function(req:any, res:any, next:any) {
  //get user id from payload
  const userID:string = req.payload.loginPayload.user._id;
  //get user doc from mongodb
  const userDoc:User | null = await getUserByID(userID);
  //if the user is not apart of admin group then they are unauthorized
  if (userDoc && userDoc.group==='admin'){
    next();
  }else{
    res.status(HttpStatusCodes.UNAUTHORIZED).json({isAdmin: false});
  }
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