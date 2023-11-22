import { PromoCode } from "@src/interfaces/interfaces";
import { PromoCodeModel } from "@src/models/PromoCode";

//create a promo code
export const createPromoCode = async function(
  code:string,
  dateOfExpiry: Date,
  createdByUserID:string,
  description:string,
  perk:string,
  totalAllowedUses?:number,
  disabled?:boolean
){
  return await PromoCodeModel.create({
    code:code,
    dateOfExpiry: dateOfExpiry,
    createdByUserID: createdByUserID,
    description: description,
    perk: perk,
    totalAllowedUses: totalAllowedUses || undefined,
    disabled: disabled || true
  })
};

//get all promo code data
export const getAllPromoCodes = async function():Promise<PromoCode[] | null>{
  return await PromoCodeModel.find({});
};

//get a promo code by id
export const getPromoCodeByID = async function(codeID:string):Promise<PromoCode | null>{
  return await PromoCodeModel.findById(codeID);
};

//get promo code by code name
export const getPromoCodeByCode = async function(code:string):Promise<PromoCode | null>{
  return await PromoCodeModel.findOne({code: code});
};

//update a promo code by id
export const updatePromoCodeByID = async function(codeID:string,updatedPromoCode:PromoCode):Promise<PromoCode | null>{
  return await PromoCodeModel.findByIdAndUpdate(codeID,updatedPromoCode, { new: true });
};

//delete a promo code by id
export const deletePromoCodeByID = async function(codeID:string):Promise<PromoCode | null>{
  return await PromoCodeModel.findByIdAndDelete(codeID);
};