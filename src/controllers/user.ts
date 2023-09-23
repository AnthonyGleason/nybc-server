import {User} from "@src/interfaces/interfaces";
import { UserModel } from "../models/User";

//get a user by userID
export const getUserByID = async function(userID:string):Promise<User | null>{
  return await UserModel.findById(userID);
};

//get a user by email
export const getUserByEmail = async function(userEmail:string):Promise<User | null>{
  return await UserModel.findOne({email: userEmail});
};

//get all users by group
export const getUsersByGroup = async function(group:string):Promise<User[] | null>{
  return await UserModel.find({group: group});
};

//create a user
export const createNewUser = async function(
  firstName:string,
  lastName:string,
  email:string,
  hashedPassword:string,
  group?:string
):Promise<User>{
  const userData:User = {
    firstName,
    lastName,
    email,
    hashedPassword,
  };

  //a user group was provided to the function such as 'admin' or 'employee'
  if (group) userData.group = group
  
  return await UserModel.create(userData);
};

//update a user by userID
export const updateUserByUserID = async function(userID:string,updatedUser:User):Promise<User | null>{
  return await UserModel.findByIdAndUpdate(userID,updatedUser);
};

//delete a user by userID
export const deleteUserByUserID = async function(userID:string):Promise<User | null>{
  return await UserModel.findByIdAndDelete(userID);
};