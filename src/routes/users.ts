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

  
  try{
    //verify provided passwords match
    if (password!==passwordConfirm) throw new Error('Passwords do not match.');
  }catch(err){
    handleError(res,HttpStatusCodes.BAD_REQUEST,err);
  }

  try{
    //generate the hashed password
    hashedPassword = await bcrypt.hash(password,salt);
  }catch(err){
    handleError(res,HttpStatusCodes.INTERNAL_SERVER_ERROR,err);
  };

  try{
    //verify the email is not taken by another user
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
      new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })),
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
    const currentTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })); // Get the current time
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
  let foundItem:PasswordReset | undefined;
  let userDoc:User | null = null;

  const resetID:string = req.params.resetID;
  //get password and password conf from req body
  const password:string = req.body.password;
  const passwordConf:string = req.body.passwordConf;

  try{  
    //attempt to get token from array
    foundItem = passwordResetTokens.find(item => item.resetID === resetID);
    if (!foundItem) throw new Error('Password reset item not found. Please make another password reset request to proceed.');

    //determine if token is expired
    const currentTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })); // Get the current time in eastern
    const tenMinutesAgo = new Date(currentTime.getTime() - 10 * 60 * 1000); // Calculate time 10 minutes ago
    const dateCreated = new Date(foundItem.dateCreated);
    isExpired = dateCreated <= tenMinutesAgo;

    //get user doc based on email
    userDoc = await getUserByEmail(foundItem.email);
  }catch(err){
    handleError(res,HttpStatusCodes.NOT_FOUND,err);
  };

  try{
    if (password!==passwordConf) throw new Error('Provided passwords do not match.');
  }catch(err){
    handleError(res,HttpStatusCodes.BAD_REQUEST,err);
  };

  try{
    if (!isExpired) throw new Error('The password reset link is expired.');
  }catch(err){
    handleError(res,HttpStatusCodes.UNAUTHORIZED,err);
  };

  try{
    //update the doc locally
    if (!userDoc) throw new Error('A user doc was not found');

    //generate the hashed password
    const hashedPassword:string = await bcrypt.hash(password,salt);
    userDoc.hashedPassword = hashedPassword;
    
    //update the user doc on mongodb
    await updateUserByUserID(userDoc._id as string,userDoc);

    //return status to user
    res.status(HttpStatusCodes.OK).json({
      isExpired: isExpired,
      wasUpdated: true
    });
  }catch(err){
    handleError(res,HttpStatusCodes.NOT_FOUND,err);
  };
});

//get current account settings
usersRouter.get('/settings', authenticateLoginToken, async (req:any,res,next)=>{
  try{
    //attempt to get a user doc for the provided jwt token
    const userDoc:User | null = await getUserByID(req.payload.loginPayload.user._id);

    //handle user doc was not found
    if (!userDoc) throw new Error('A user doc was not found.');

    res.status(HttpStatusCodes.OK).json({
      firstName: userDoc.firstName,
      lastName: userDoc.lastName,
      email: userDoc.email,
    });
  }catch(err){
    handleError(res,HttpStatusCodes.NOT_FOUND,err);
  };
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

  let passwordMatch:boolean = false;
  let userDoc:User | null = null;

  try{
    //verify all required fields were provided
    if (
      !currentPasswordInput 
    ) throw new Error('The current password input was left blank. It is required to make any changes to the current account.');

    //a password update was initiated but the required fields were not provided
    if (
      !passwordInput ||
      !passwordConfInput
    ) throw new Error('A password update was requested but the required fields to update the user password were not provided.');
  }catch(err){
    handleError(res,HttpStatusCodes.BAD_REQUEST,err);
  };

  try{
    //get the user doc
    userDoc = await getUserByID(req.payload.loginPayload.user._id);
    if (!userDoc) throw new Error('A user was not found for the login token.');

    //ensure password matches the user doc hashed password
    try{
      passwordMatch = await bcrypt.compare(currentPasswordInput,userDoc.hashedPassword);
      if (!passwordMatch) throw new Error('The provided password is incorrect.');
    }catch(err){
      handleError(res,HttpStatusCodes.UNAUTHORIZED,err);
    };

    try{
      //if the email is already in use do not proceed
      if (await getUserByEmail(emailInput)) throw new Error('An account already exists with that email.');
    }catch(err){
      handleError(res,HttpStatusCodes.CONFLICT,err);
    };

    try{
      //if the password was changed
      if (passwordInput !== passwordConfInput) throw new Error('Password inputs do not match.');
      //hash the new password and update the updated user doc with it
      const hashedPassword:string = await bcrypt.hash(passwordInput,salt);
      userDoc.hashedPassword=hashedPassword;
    }catch(err){
      handleError(res,HttpStatusCodes.BAD_REQUEST,err);
    };

    //determine which fields were updated and apply those changes to a temp user object
    userDoc.firstName = firstNameInput;
    userDoc.lastName = lastNameInput;
    userDoc.email = emailInput;

    try{
      //invalidate the current user login token
      invalidatedTokens.push(req.tokens.loginToken);
      
      // sign a jwt token for the user so they dont have to sign in again
      const token:string = issueUserJWTToken(userDoc);

      //update the document in mongoDB
      const updatedUser:User | null = await updateUserByUserID(userDoc._id as string,userDoc);
      if (!updatedUser) throw new Error('An error has occured when updating the user settings, no changes to your account were made.');

      //respond with wasUserUpdated to client
      res.status(HttpStatusCodes.OK).json({
        wasUserUpdated: true,
        loginToken: token
      });
    }catch(err){
      handleError(res,HttpStatusCodes.NOT_MODIFIED,err);
    };
  }catch(err){
    handleError(res,HttpStatusCodes.NOT_FOUND,err);
  };
});

export default usersRouter;