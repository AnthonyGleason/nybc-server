import { PasswordReset } from "@src/interfaces/interfaces";
import { PasswordResetModel } from "@src/models/PasswordReset";

//create password reset
export const createPasswordReset = async function(email: string, resetID: string, dateCreated?: Date){
  return await PasswordResetModel.create({ 
    email: email, 
    resetID: resetID, 
    dateCreated: dateCreated || new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })) 
  });
};

// Update password reset by email
export const updatePasswordResetByEmail = async (email: string, updatedPasswordReset: PasswordReset): Promise<PasswordReset | null> => {
  return await PasswordResetModel.findOneAndUpdate({ email: email }, updatedPasswordReset, { new: true });
};

// Update password reset by resetID
export const updatePasswordResetByResetID = async (resetID: string, updatedPasswordReset: PasswordReset): Promise<PasswordReset | null> => {
  return await PasswordResetModel.findOneAndUpdate({ resetID: resetID }, updatedPasswordReset, { new: true });
};

// Update password reset by docID
export const updatePasswordResetByDocID = async (docID: string, updatedPasswordReset: PasswordReset): Promise<PasswordReset | null> => {
  return await PasswordResetModel.findByIdAndUpdate(docID, updatedPasswordReset, { new: true });
};

//get password reset by email
export const getPasswordResetByEmail = async function(email:string):Promise<PasswordReset | null>{
  return await PasswordResetModel.findOne({email: email});
};

//get password reset by resetID
export const getPasswordResetByResetID = async function(resetID:string):Promise<PasswordReset | null>{
  return await PasswordResetModel.findOne({resetID: resetID});
};

//get password reset by docID
export const getPasswordResetByDocID = async function(docID:string):Promise<PasswordReset | null>{
  return await PasswordResetModel.findById(docID);
};

//delete a password reset by docID
export const deletePasswordResetByDocID = async function(docID:string){
  return await PasswordResetModel.findByIdAndDelete(docID);
};

//delete a password reset by email
export const deletePasswordResetByEmail = async function(email:string){
  return await PasswordResetModel.findOneAndDelete({ email: email });
};