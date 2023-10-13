import { createNewUser, getUserByEmail, getUserByID, updateUserByUserID } from "@src/controllers/user";
import {Membership, PasswordReset, User} from "@src/interfaces/interfaces";
import { Router } from "express";
import bcrypt from 'bcrypt';
import HttpStatusCodes from "@src/constants/HttpStatusCodes";
import { invalidatedTokens, issueUserJWTToken, passwordResetTokens } from "@src/helpers/auth";
import { createMembership, getMembershipByUserID } from "@src/controllers/membership";
import { authenticateLoginToken } from "@src/middlewares/auth";
import { transporter } from "@src/server";
import { salt } from "@src/constants/auth";
import { handleError } from "@src/helpers/error";
import { getNewRegistrationMailOptions, getPasswordResetMailOptions } from "@src/constants/emails";

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
  let hashedPassword:string = '';

  //verify required fields are provided
  try{
    if (!firstName || !lastName || !email || !hashedPassword) throw new Error('All required fields must be completed.');
  }catch(err){
    handleError(res,HttpStatusCodes.BAD_REQUEST,err);
  };

  //verify provided passwords match
  try{
    if (password!==passwordConfirm) throw new Error('Passwords do not match.');
  }catch(err){
    handleError(res,HttpStatusCodes.BAD_REQUEST,err);
  }

  //attempt to hash the password
  try{
    //generate the hashed password
    hashedPassword = await bcrypt.hash(password,salt);
  }catch(err){
    handleError(res,HttpStatusCodes.INTERNAL_SERVER_ERROR,err);
  };

  //verify the email is not taken by another user
  try{
    if (await getUserByEmail(email)) throw new Error('An account with that email already exists.');
  }catch(err){
    handleError(res,HttpStatusCodes.CONFLICT,err);
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
    //create a membership document for the new user
    await createMembership(UserDoc._id.toString());
    //sign a jwt token for the user so they dont have to sign in again
    const token:string = issueUserJWTToken(UserDoc);
    //send the new user welcome email
    await transporter.sendMail(getNewRegistrationMailOptions(email));
    res.status(HttpStatusCodes.OK).json({token: token});
  }catch(err){
    handleError(res,HttpStatusCodes.INTERNAL_SERVER_ERROR,err);
  };
});

//login an existing user
usersRouter.post('/login', async (req,res,next)=>{
  const {
    email,
    password
  } = req.body;
  //attempt to fetch user doc from mongodb
  try{
    //get the user from mongoDB by email
    const UserDoc = await getUserByEmail(email);
    if (!UserDoc) throw new Error('Account does not exist for the provided email.');

    //verify user has entered correct details
    try{
      //compare the hashed password to the password input provided by the user
      const passwordMatch:boolean = await bcrypt.compare(password,UserDoc.hashedPassword);
      if (!passwordMatch) throw new Error('The entered password is incorrect.');

      //sign a jwt token for the user
      const token:string = issueUserJWTToken(UserDoc);
      res.status(HttpStatusCodes.OK).json({token: token});
    }catch(err){
      handleError(res,HttpStatusCodes.UNAUTHORIZED,err);
    };
  }catch(err){
    handleError(res,HttpStatusCodes.NOT_FOUND,err);
  };
});

usersRouter.post('/logout', authenticateLoginToken, (req:any,res,next)=>{
  try{
    if (!req.tokens) throw new Error('The request is missing a token to logout. You may already be signed out.');
    invalidatedTokens.push(req.tokens.loginToken);
    res.status(HttpStatusCodes.OK).json({message: 'You have been succesfully logged out.'})
  }catch(err){
    handleError(res,HttpStatusCodes.BAD_REQUEST,err);
  };
});

usersRouter.get('/verify', authenticateLoginToken,(req,res,next)=>{
  res.status(HttpStatusCodes.OK).json({isValid: true});
});

usersRouter.get('/membershipLevel', authenticateLoginToken, async (req:any,res,next)=>{
  //get userID
  const userID:string = req.payload.loginPayload.user._id;
  try{
    //get membership level
    const membershipDoc:Membership | null = await getMembershipByUserID(userID);
    if (!membershipDoc) throw new Error('A membership level was not found for the provided user.');
    res.status(HttpStatusCodes.OK).json({membershipLevel: membershipDoc.tier});
  }catch(err){
    //a membership doc was not found so therefore we will set it as a Non-Member
    res.status(HttpStatusCodes.NOT_FOUND).json({membershipLevel: 'Non-Member'});
  };
});

//send forgot password email
usersRouter.post('/forgotPassword', async(req:any,res,next)=>{
  try{
    const userEmail:string | undefined = req.body.email;
    //an email was not provided by the user
    if (!userEmail) throw new Error('A user email was not provided.');
    //send password reset email
    await transporter.sendMail(getPasswordResetMailOptions(userEmail));
    res.status(HttpStatusCodes.OK).json({isEmailSent: true});
  }catch(err){
    handleError(res,HttpStatusCodes.BAD_REQUEST,err);
  };
});

//get forgot password status
usersRouter.get('/forgotPassword/:resetID',(req,res,next)=>{
  let isExpired:boolean = true;
  const resetID:string = req.params.resetID;

  try{
    //find the password reset item
    const foundItem:PasswordReset | undefined = passwordResetTokens.find(item => item.resetID === resetID);
    if (!foundItem) throw new Error('Password reset item not found. Please make another password reset request to proceed.');
    
    //calculate expired status
    const currentTime = new Date(); // Get the current time
    const tenMinutesAgo = new Date(currentTime.getTime() - 10 * 60 * 1000); // Calculate time 10 minutes ago
    const dateCreated = new Date(foundItem.dateCreated);
    isExpired = dateCreated <= tenMinutesAgo;
    
    res.status(HttpStatusCodes.OK).json({isExpired: isExpired});
  }catch(err){
    handleError(res,HttpStatusCodes.NOT_FOUND,err);
  };
});

//forgot password update route
usersRouter.put('/forgotPassword/:resetID', async (req,res,next)=>{
  let isExpired:boolean = true;
  //get id from route
  const resetID:string = req.params.resetID;
  //get token from array
  const foundItem:PasswordReset | undefined = passwordResetTokens.find(item => item.resetID === resetID);
  //determine if token is expired
  if (foundItem) {
    const currentTime = new Date(); // Get the current time
    const tenMinutesAgo = new Date(currentTime.getTime() - 10 * 60 * 1000); // Calculate time 10 minutes ago
    const dateCreated = new Date(foundItem.dateCreated);
    isExpired = dateCreated <= tenMinutesAgo;
  };
  //get password and password conf from req body
  const password:string = req.body.password;
  const passwordConf:string = req.body.passwordConf;
  //if passwords match proceed and token is not expired
  if ((password === passwordConf) && !isExpired && foundItem){
    //get user doc based on email
    let tempUserDoc:User | null = await getUserByEmail(foundItem.email);
    //generate the hashed password
    const salt:number = 15;
    const hashedPassword:string = await bcrypt.hash(password,salt);
    //update the doc locally
    if (tempUserDoc){
      tempUserDoc.hashedPassword = hashedPassword;
      //update the user doc on mongodb
      await updateUserByUserID(tempUserDoc._id as string,tempUserDoc);
    };
    //return status to user
    res.status(HttpStatusCodes.OK).json({
      isExpired: isExpired,
      wasUpdated: true
    });
  }else{
    //token is expired or passwords do not match
    res.status(HttpStatusCodes.BAD_REQUEST).json({
      isExpired: isExpired,
      wasUpdated: false,
    });
  };
});

//get current account settings
usersRouter.get('/settings', authenticateLoginToken, async (req:any,res,next)=>{
  const userDoc:User | null = await getUserByID(req.payload.loginPayload.user._id);
  if (userDoc){
    res.status(HttpStatusCodes.OK).json({
      firstName: userDoc.firstName,
      lastName: userDoc.lastName,
      email: userDoc.email,
    });
  }else{
    res.status(HttpStatusCodes.NOT_FOUND);
  }
});

//update account settings
usersRouter.put('/settings', authenticateLoginToken, async (req:any,res,next)=>{
  //destructure request body
  const {
    firstNameInput,
    lastNameInput,
    emailInput,
    passwordInput,
    passwordConfInput,
    currentPasswordInput
  }:{
    firstNameInput:string,
    lastNameInput:string,
    emailInput:string,
    passwordInput:string,
    passwordConfInput:string,
    currentPasswordInput:string
  } = req.body;
  //get the user doc
  const userDoc:User | null = await getUserByID(req.payload.loginPayload.user._id);
  //if current password was entered correctly
  if (userDoc && await bcrypt.compare(currentPasswordInput,userDoc.hashedPassword)){
    //determine which fields were updated and apply those changes to a temp user object
    let tempUserDoc:User = userDoc;
    if (firstNameInput) tempUserDoc.firstName = firstNameInput;
    if (lastNameInput) tempUserDoc.lastName = lastNameInput;
    //if the email is already in use do not proceed
    if (!await getUserByEmail(emailInput) && emailInput) tempUserDoc.email = emailInput;
    //if the password was changed
    if (passwordInput && passwordConfInput && (passwordInput===passwordConfInput)){
      //hash the new password and update the updated user doc with it
      const salt:number = 15;
      const hashedPassword:string = await bcrypt.hash(passwordInput,salt);
      tempUserDoc.hashedPassword=hashedPassword;
    };
    //invalidate the current user login token
    invalidatedTokens.push(req.tokens.loginToken);
    /* 
      sign a jwt token for the user so they dont have to sign in again
      we already verified above the user has entered the correct password so 
      this action can be performed safely.
    */
    const token:string = issueUserJWTToken(userDoc);
    //update the document in mongoDB
    await updateUserByUserID(userDoc._id as string,tempUserDoc);
    //respond with wasUserUpdated to client
    res.status(HttpStatusCodes.OK).json({
      wasUserUpdated: true,
      loginToken: token
    });
  }else{
    res.status(HttpStatusCodes.NOT_MODIFIED).json({wasUserUpdated: false});
  };
});

export default usersRouter;