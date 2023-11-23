import { PasswordReset } from "@src/interfaces/interfaces";

export const isPasswordResetExpired = function(passwordResetDoc:PasswordReset):boolean{
  //calculate expired status
  const currentTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })); // Get the current time
  const tenMinutesAgo = new Date(new Date(currentTime.getTime() - 10 * 60 * 1000).toLocaleDateString('en-US', { timeZone: 'America/New_York' })); // Calculate time 10 minutes ago
  const dateCreated = new Date(passwordResetDoc.dateCreated);
  const isExpired = dateCreated <= tenMinutesAgo;
  return isExpired
};