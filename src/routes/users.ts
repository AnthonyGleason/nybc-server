import { createNewUser, getUserByEmail, getUserByID, updateUserByUserID } from "@src/controllers/user";
import {Membership, PasswordReset, User} from "@src/interfaces/interfaces";
import { Router } from "express";
import bcrypt from 'bcrypt';
import HttpStatusCodes from "@src/constants/HttpStatusCodes";
import { invalidatedTokens, issueUserJWTToken, passwordResetTokens } from "@src/helpers/auth";
import { createMembership, getMembershipByUserID } from "@src/controllers/membership";
import { authenticateLoginToken } from "@src/middlewares/auth";
import { transporter } from "@src/server";

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

    const mailOptions = {
      from: 'noreply@nybagelsclub.com',
      to: email,
      subject: 'Dear Valued Customer',
      text: `Welcome to the New York Bagels Club Family. We're truly grateful for your interest in our products, and we can't wait to share our delicious menu with you.`,
    };

    //send the new user welcome email
    transporter.sendMail(mailOptions);

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

//send forgot password email
usersRouter.post('/forgotPassword', async(req:any,res,next)=>{
  const userEmail:string = req.body.email;
  const getRandomString = function(length: number) {
    let counter: number = length;
    let string: string = '';
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz1234567890';
    while (counter > 0) {
      string += charset.charAt(Math.floor(Math.random() * charset.length));
      counter--;
    }
    return string;
  };

  const randomString:string = getRandomString(50);
  const url:string = `https://nybagelsclub.com/accounts/password/reset/${randomString}`;
  if (userEmail){
    const mailOptions = {
      from: 'noreply@nybagelsclub.com',
      to: userEmail,
      subject: 'Forgot Password',
      text: `We have received a request to update your account password. If you initiated this action and wish to proceed with resetting your password, please click on the securely generated link: ${url}. Please note that this link will expire in 10 minutes for security purposes.`,
    };
  
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.log(error);
        res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({isEmailSent: false});
      } else {
        //no errors email was sent

        //create the password reset object
        const passwordReset:PasswordReset = {
          dateCreated: new Date(),
          resetID: randomString,
          email: userEmail
        };
        
        //if the passwordResetTokens array is not empty check to see if there are any current pending tokens for the email and remove them
        if (passwordResetTokens.length>0){
          for (let i = passwordResetTokens.length - 1; i >= 0; i--) {
            if (passwordResetTokens[i].email === userEmail) {
              passwordResetTokens.splice(i, 1);
            };
          };     
        };

        passwordResetTokens.push(passwordReset);
        res.status(HttpStatusCodes.OK).json({isEmailSent: true});
      };
    });
  }else{
    res.status(HttpStatusCodes.NOT_FOUND).json({isEmailSent: false});
  };
});

//get forgot password status
usersRouter.get('/forgotPassword/:resetID',(req,res,next)=>{
  let isExpired:boolean = true;
  //get id from route
  const resetID:string = req.params.resetID;
  //find the password reset item
  const foundItem:PasswordReset | undefined = passwordResetTokens.find(item => item.resetID === resetID);
  //send the user its expired status
  if (foundItem) {
    const currentTime = new Date(); // Get the current time
    const tenMinutesAgo = new Date(currentTime.getTime() - 10 * 60 * 1000); // Calculate time 10 minutes ago
    const dateCreated = new Date(foundItem.dateCreated);
    isExpired = dateCreated <= tenMinutesAgo;
    res.status(HttpStatusCodes.OK).json({isExpired: isExpired});
  } else {
    // No item with the matching email was found
    res.status(HttpStatusCodes.NOT_FOUND).json({isExpired: isExpired});
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

//get current account info
//update account settings

export default usersRouter;