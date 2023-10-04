import { createNewUser, getUserByEmail } from "@src/controllers/user";
import {Membership, User} from "@src/interfaces/interfaces";
import { Router } from "express";
import bcrypt from 'bcrypt';
import HttpStatusCodes from "@src/constants/HttpStatusCodes";
import { invalidatedTokens, issueUserJWTToken } from "@src/helpers/auth";
import { createMembership, getMembershipByUserID } from "@src/controllers/membership";
import { authenticateLoginToken } from "@src/middlewares/auth";

const usersRouter = Router();

//register a new user
usersRouter.post('/register', async(req,res,next)=>{
  //destructure req.body
  const {
    firstName,
    lastName,
    email,
    password,
    passwordConfirm
  } = req.body;

  //generate the hashed password
  const salt:number = 15;
  const hashedPassword:string = await bcrypt.hash(password,salt);

  //verify required fields are provided
  try{
    if (!firstName || !lastName || !email || !hashedPassword) throw new Error('Required fields are missing.');
  }catch(err){
    console.log(err);
    res.status(HttpStatusCodes.BAD_REQUEST).json({message: err});
  };

  //verify passwords match
  try{
    if (password!==passwordConfirm) throw new Error('Passwords do not match.');
  }catch(err){
    console.log(err);
    res.status(HttpStatusCodes.BAD_REQUEST).json({message: err});
  }

  //verify the email is not taken by another user
  try{
    if (await getUserByEmail(email)) throw new Error('An account with that email already exists.');
  }catch(err){
    console.log(err);
    res.status(HttpStatusCodes.CONFLICT).json({message: err});
  };

  //attempt to create a new user
  try{
    //create the user document
    const UserDoc:User = await createNewUser(
      firstName,
      lastName,
      email,
      hashedPassword,
      new Date(),
      false,
    );
    //user does not exist
    if (!UserDoc) throw new Error('An error occured when creating a user, please try again later.');
    //create a membership document for the new user
    try{
      await createMembership(UserDoc._id.toString());
    }catch(err){
      console.log(err);
      res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR);
    };
    //sign a jwt token for the user so they dont have to sign in again
    const token:string = issueUserJWTToken(UserDoc);
    res.status(HttpStatusCodes.OK).json({token: token});
  }catch(err){
    console.log(err);
    res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({message: err});
  };
});

//attempt to login an existing user
usersRouter.post('/login', async (req,res,next)=>{
  const {
    email,
    password
  } = req.body;
  let UserDoc:User | null;
  //attempt to fetch user doc from mongodb
  try{
    //get the user from mongoDB by email
    UserDoc = await getUserByEmail(email);
    if (!UserDoc) throw new Error('Account does not exist.');
    //verify user has entered correct details
    try{
      if (await bcrypt.compare(password,UserDoc.hashedPassword)){
        //sign a jwt token for the user
        const token:string = issueUserJWTToken(UserDoc);
        res.status(HttpStatusCodes.OK).json({token: token});
      }else{
        throw new Error('The entered password is incorrect.');
      };
    }catch(err){
      console.log(err);
      res.status(HttpStatusCodes.UNAUTHORIZED).json({message: err})
    };
  }catch(err){
    console.log(err);
    res.status(HttpStatusCodes.NOT_FOUND).json({message: err});
  };
});

usersRouter.post('/logout', authenticateLoginToken, (req:any,res,next)=>{
  if (req.tokens){
    invalidatedTokens.push(req.tokens.loginToken);
    res.status(HttpStatusCodes.OK).json({message: 'You have been succesfully logged out.'})
  };
});

usersRouter.get('/verify', authenticateLoginToken,(req,res,next)=>{
  res.status(HttpStatusCodes.OK).json({isValid: true});
});

usersRouter.get('/membershipLevel', authenticateLoginToken, async (req:any,res,next)=>{
  //get userID
  const userID:string = req.payload.loginPayload.user._id;
  //get membership level
  const membershipDoc:Membership | null = await getMembershipByUserID(userID);
  //return it to the client if it exists
  if (membershipDoc){
    res.status(HttpStatusCodes.OK).json({membershipLevel: membershipDoc.tier});
  }else{
    res.status(HttpStatusCodes.NOT_FOUND).json({message: 'Membership information not found.'});
  };
});

export default usersRouter;