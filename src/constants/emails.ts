export const getNewRegistrationMailOptions = function(email:string){
  return({
    from: 'noreply@nybagelsclub.com',
    to: email,
    subject: 'Dear Valued Customer',
    text: `Welcome to the New York Bagels Club Family. We're truly grateful for your interest in our products, and we can't wait to share our delicious menu with you.`,
  })
};