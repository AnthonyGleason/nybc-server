import { passwordResetTokens } from "@src/helpers/auth";
import { getRandomUrlString } from "@src/helpers/misc";
import { PasswordReset } from "@src/interfaces/interfaces";

export const getNewRegistrationMailOptions = function(email:string){
  return({
    from: 'noreply@nybagelsclub.com',
    to: email,
    subject: 'Dear Valued Customer',
    text: `Welcome to the New York Bagels Club Family. We're truly grateful for your interest in our products, and we can't wait to share our delicious menu with you.`,
  })
};

export const getCustomOrderMailOptions = function(
  salesEmail:string,
  request:string,
  userEmail:string,
  quantityInput:string
){
  return({
    from: 'noreply@nybagelsclub.com',
    to: salesEmail,
    subject: 'Personalized Order Request',
    text: `A user with the email "${userEmail}" has requested a quantity of "${quantityInput}" for a custom order with the following request "${request}"`,
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