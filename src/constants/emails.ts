import { passwordResetTokens } from "@src/helpers/auth";
import { getRandomUrlString } from "@src/helpers/misc";
import { PasswordReset } from "@src/interfaces/interfaces";

export const getNewRegistrationMailOptions = function(email:string){
  return({
    from: 'noreply@nybagelsclub.com',
    to: email,
    subject: 'Account Registration Confirmation',
    html: 
    `
      <p font-size: 16px;">Welcome to the New York Bagels Club Family!</p>
      <p font-size: 16px;">This email is confirmation that we have successfully created your account.</p>
      <p font-size: 16px;">We're truly grateful for your interest in our products, and we can't wait to share our delicious hand-curated menu with you.</p>
      <p font-size: 16px;">Sincerly,</p>
      <p font-size: 16px;">New York Bagels Club
    `,
  })
};

export const getCustomOrderMailOptions = function(
  salesEmail:string,
  request:string,
  userEmail:string,
  quantityInput:string,
  requestsPackageDeal:boolean
){
  let requestsPackageDealStr:string = '';
  if (requestsPackageDeal){
    requestsPackageDealStr='want';
  }else{
    requestsPackageDealStr="don't want";
  };
  return({
    from: 'noreply@nybagelsclub.com',
    to: salesEmail,
    subject: 'Personalized Order Request',
    text: `A user with the email "${userEmail}" has requested a quantity of "${quantityInput}" for a custom order with the following request "${request}". They ${requestsPackageDealStr} the $275 package offering. `,
  })
};

export const getPasswordResetMailOptions = function(email:string){
  const randomString:string = getRandomUrlString(50);

  //get a random url string of 50 characters long and generate a reset url with it
  const url:string = `https://nybagelsclub.com/accounts/password/reset/${randomString}`;

  //create the password reset object
  const passwordReset:PasswordReset = {
    dateCreated: new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })),
    resetID: randomString,
    email: email
  };
  
  //if the passwordResetTokens array is not empty check to see if there are any current pending tokens for the email and remove them
  if (passwordResetTokens.length>0){
    for (let i = passwordResetTokens.length - 1; i >= 0; i--) {
      if (passwordResetTokens[i].email === email) passwordResetTokens.splice(i, 1);
    };     
  };

  //push the password reset object to the reset tokens array for retrieval later
  passwordResetTokens.push(passwordReset);

  return({
    from: 'noreply@nybagelsclub.com',
    to: email,
    subject: 'Forgot Password',
    text: `We have received a request to update your account password. If you initiated this action and wish to proceed with resetting your password, please click on the securely generated link: ${url}. Please note that this link will expire in 10 minutes for security purposes.`,
  });
};