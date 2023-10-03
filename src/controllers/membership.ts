import { Membership } from "@src/interfaces/interfaces";
import { MembershipModel } from "@src/models/Membership";

//create a membership for userID
export const createMembership = async function(userID:string,renewalDate?:Date){
  let membershipObj = {
    userID: userID,
    renewalDate: renewalDate || undefined
  };
  
  return await MembershipModel.create(membershipObj);
};

//get a membership by membershipID
export const getMembershipByMembershipID = async function(membershipID:string){
  return await MembershipModel.findById(membershipID);
};

//get a membership by userID
export const getMembershipByUserID = async function(userID:string):Promise<Membership | null>{
  return await MembershipModel.findOne({userID:userID});
};

//update a membership by membershipID
export const updateMembershipByMembershipID = async function(membershipID:string,updatedMembership:Membership){
  return await MembershipModel.findByIdAndUpdate(membershipID,updatedMembership);
};

//update a membership by userID
export const updateMembershipByUserID = async function(userID:string,updatedMembership:Membership){
  return await MembershipModel.findOneAndUpdate({userID:userID},updatedMembership);
};

//delete a membership by membershipID
export const deleteMembershipByMembershipID = async function(membershipID:string){
  return await MembershipModel.findByIdAndDelete(membershipID);
};

//delete a membership by userID
export const deleteMembershipByUserID = async function(userID:string){
  return await MembershipModel.findOneAndDelete({userID: userID});
};