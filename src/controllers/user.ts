import { User } from "@src/interfaces/interfaces";
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
  dateCreated:Date,
  frozen:boolean,
  group?:string
):Promise<User>{

  const userData = {
    firstName,
    lastName,
    email,
    hashedPassword,
    dateCreated,
    frozen,
    group: group || undefined
  };
  
  return await UserModel.create(userData);
};

//get all users
export const getAllUsers = async function():Promise<User[] | null>{
  return await UserModel.find({});
}
// update a user by userID
export const updateUserByUserID = async function(userID: string, updatedUser: User): Promise<User | null> {
  return await UserModel.findByIdAndUpdate(userID, updatedUser, { new: true });
};

//delete a user by userID
export const deleteUserByUserID = async function(userID:string){
  return await UserModel.findByIdAndDelete(userID);
};