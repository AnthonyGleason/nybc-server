import { createNewUser, getUserByEmail, getUserByID, updateUserByUserID } from "@src/controllers/user";
import {Membership, Order, PasswordReset, User} from "@src/interfaces/interfaces";
import { Router } from "express";
import bcrypt from 'bcrypt';
import HttpStatusCodes from "@src/constants/HttpStatusCodes";
import { invalidatedTokens, issueCartJWTToken, issueUserJWTToken, passwordResetTokens } from "@src/helpers/auth";
import { createMembership, deleteMembershipByUserID, getMembershipByUserID } from "@src/controllers/membership";
import { authenticateLoginToken } from "@src/middlewares/auth";
import { transporter } from "@src/server";
import { salt } from "@src/constants/auth";
import { handleError } from "@src/helpers/error";
import { getNewRegistrationMailOptions, getPasswordResetMailOptions } from "@src/constants/emails";
import { getMostRecentOrderByUserID, getOrderByOrderID } from "@src/controllers/order";
import { stripe } from "@src/util/stripe";
import { getRandomUrlString } from "@src/helpers/misc";
import { createPasswordReset, deletePasswordResetByDocID, deletePasswordResetByEmail, getPasswordResetByEmail, getPasswordResetByResetID } from "@src/controllers/passwordReset";
import { isPasswordResetExpired } from "@src/helpers/passwordReset";

const usersRouter = Router();

//get user data
usersRouter.get('/',authenticateLoginToken, async (req:any,res,next)=>{
  try{
    const userDoc:User | null = await getUserByEmail(req.payload.loginPayload.user.email);
    if (!userDoc) throw new Error('A userDoc was not found for the provided login token');
    const membershipDoc:Membership | null = await getMembershipByUserID(userDoc._id.toString());
    res.status(HttpStatusCodes.OK).json({
      user:userDoc,
      membership:membershipDoc
    });
  }catch(err){
    handleError(res,HttpStatusCodes.NOT_FOUND,err);
  };
});

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

  //verify required fields are provided
  try{
    if (!firstName || !lastName || !email || !password || !passwordConfirm) throw new Error('All required fields must be completed.');
    if (password!==passwordConfirm) throw new Error('Passwords do not match.');
  }catch(err){
    handleError(res,HttpStatusCodes.BAD_REQUEST,err);
  };

  let hashedPassword:string = '';
  try {
    // Verify the email is not taken by another user and generate the hashed password
    const [existingUser, tempHashedPassword]:any= await Promise.all([
      getUserByEmail(email),
      bcrypt.hash(password, salt)
    ])
    hashedPassword=tempHashedPassword;
    if (existingUser) throw new Error('An account with that email already exists.');
  } catch (err) {
    handleError(res, HttpStatusCodes.CONFLICT, err);
  };

  //attempt to create a new user
  try{
    const [UserDoc,emailResponse]:any = await Promise.all([
      createNewUser(
        firstName,
        lastName,
        email,
        hashedPassword,
        new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })),
        false,
      ),
      transporter.sendMail(getNewRegistrationMailOptions(email))
    ])
    //create a membership document for the new user
    await createMembership(UserDoc._id.toString());
    //sign a jwt token for the user so they dont have to sign in again
    const token:string = issueUserJWTToken(UserDoc);

    res.status(HttpStatusCodes.OK).json({
      token: token,
      isEmailSent: emailResponse.accepted.length===1
    });
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

  try{
    if (!email) throw new Error('An email input was not provided.');
    if (!password) throw new Error('A password input was not provided.');
  }catch(err){
    handleError(res,HttpStatusCodes.BAD_REQUEST,err);
  };

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
    const isLoggedOut:boolean = invalidatedTokens.includes(req.tokens.loginToken)
    
    res.status(HttpStatusCodes.OK).json({
      message: 'You have been succesfully logged out.',
      isLoggedOut: isLoggedOut
    })
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

usersRouter.delete('/membershipLevel',authenticateLoginToken, async(req:any,res,next)=>{
  const userID:string = req.payload.loginPayload.user._id;
  await deleteMembershipByUserID(userID.toString());
  res.status(HttpStatusCodes.OK).json({});
});

usersRouter.post('/forgotPassword', async (req: any, res: any, next: any) => {
  try{
    const userEmail: string | undefined = req.body.email;
    if (!userEmail) throw new Error('A user email was not provided.');
    const userDoc = await getUserByEmail(userEmail);
    if (await getPasswordResetByEmail(userEmail)) await deletePasswordResetByEmail(userEmail);
    try{
      if (!userDoc) throw new Error('A user was not found with the provided email.');
      const randomString: string = getRandomUrlString(50);
      await createPasswordReset(
        userEmail,
        randomString,
        new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
      );
      const emailResponse = await transporter.sendMail(getPasswordResetMailOptions(userEmail, randomString));
      res.status(HttpStatusCodes.OK).json({ isEmailSent: emailResponse.accepted.length === 1 });
    }catch(err){
      handleError(res,HttpStatusCodes.NOT_FOUND,err);
    };
  }catch(err){
    handleError(res,HttpStatusCodes.BAD_REQUEST,err);
  };
});


//get forgot password status
usersRouter.get('/forgotPassword/:resetID',async (req,res,next)=>{
  let isExpired:boolean = true;
  const resetID:string = req.params.resetID;
  try{
    //find the password reset item
    const passwordResetDoc:PasswordReset | null = await getPasswordResetByResetID(resetID);
    if (!passwordResetDoc) throw new Error('A password reset doc was not found.');
    isExpired = isPasswordResetExpired(passwordResetDoc);   
    res.status(HttpStatusCodes.OK).json({isExpired: isExpired});
  }catch(err){
    handleError(res,HttpStatusCodes.NOT_FOUND,err);
  };
});

//forgot password update route
usersRouter.put('/forgotPassword/:resetID', async (req,res,next)=>{
  let isExpired:boolean = true;
  let passwordResetDoc:PasswordReset | null;
  let userDoc:User | null = null;

  const resetID:string = req.params.resetID;
  //get password and password conf from req body
  const password:string = req.body.password;
  const passwordConf:string = req.body.passwordConf;
  
  try{
    if (!password || !passwordConf) throw new Error('Required password inputs were not provided.');
    if (password!==passwordConf) throw new Error('Provided passwords do not match.');
  }catch(err){
    handleError(res,HttpStatusCodes.BAD_REQUEST,err);
  };

  try{  
    passwordResetDoc = await getPasswordResetByResetID(resetID);
    if (!passwordResetDoc) throw new Error('A password reset doc was not provided.');
    try{
      isExpired = isPasswordResetExpired(passwordResetDoc);
      if (isExpired) throw new Error('The password reset link is expired.');
    }catch(err){
      handleError(res,HttpStatusCodes.UNAUTHORIZED,err);
    };
    //get user doc based on email
    userDoc = await getUserByEmail(passwordResetDoc.email);
    //update the doc locally
    if (!userDoc) throw new Error('A user doc was not found');

    //generate the hashed password
    const hashedPassword:string = await bcrypt.hash(password,salt);
    userDoc.hashedPassword = hashedPassword;
    
    //update the user doc on mongodb
    await updateUserByUserID(userDoc._id as string,userDoc);

    //delete the password reset from mongodDB
    await deletePasswordResetByDocID(passwordResetDoc._id);
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
    if (!userDoc){
      throw new Error('A user doc was not found.');
    }else{
      res.status(HttpStatusCodes.OK).json({
        firstName: userDoc.firstName,
        lastName: userDoc.lastName,
        email: userDoc.email,
      });
    }
  }catch(err){
    handleError(res,HttpStatusCodes.NOT_FOUND,err);
  };
});

//update account settings
usersRouter.put('/settings', authenticateLoginToken, async (req:any,res,next)=>{
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
  try{
    if(
      !firstNameInput ||
      !lastNameInput ||
      !emailInput ||
      !passwordInput ||
      !passwordConfInput ||
      !currentPasswordInput
    ) throw new Error('One or more input fields were not provided.');
    if (passwordInput!==passwordConfInput) throw new Error('Provided passwords do not match.');
  }catch(err){
    handleError(res,HttpStatusCodes.BAD_REQUEST,err);
  };
  
  try{
    let [userDoc, tempUserDoc,hashedPassword] = await Promise.all([
      getUserByID(req.payload.loginPayload.user._id),
      getUserByEmail(emailInput),
      await bcrypt.hash(passwordInput,salt)
    ]);
    
    if (tempUserDoc && req.payload.loginPayload.user.email !== tempUserDoc.email) {
      throw new Error('An account already exists with that email.');
    };
    
    if (userDoc){
      userDoc.firstName=firstNameInput;
      userDoc.lastName=lastNameInput;
      userDoc.email = emailInput;
      userDoc.hashedPassword = hashedPassword
      const updatedUser:User | null = await updateUserByUserID(userDoc._id.toString(),userDoc);
      invalidatedTokens.push(req.tokens.login);
      const token:string = issueCartJWTToken(updatedUser);
      res.status(HttpStatusCodes.OK).json({
        user: updatedUser,
        wasUserUpdated: true,
        loginToken: token
      });
    };
  }catch(err){
    handleError(res,HttpStatusCodes.CONFLICT,err);
  };
});

usersRouter.post('/orders/getByIntent',authenticateLoginToken, async (req:any,res,next)=>{
  //get payment intent from params
  const paymentIntentID:string | null = req.body.paymentIntentID.split('_secret_')[0];
  //fetch payment intent data from stripe
  const paymentIntent:any = await stripe.paymentIntents.retrieve(paymentIntentID);
  //obtain order data from our server
  let orderData:Order | null = null;
  if (paymentIntent) orderData = await getOrderByOrderID(paymentIntent.metadata.orderID);
  if (orderData){
    res.status(HttpStatusCodes.OK).json({orderData: orderData});
  }else{
    res.status(HttpStatusCodes.NOT_FOUND);
  };
});

export default usersRouter;