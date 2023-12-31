import { ItemModel } from "@src/models/Item"
import { BagelItem, Product, SpreadItem } from '../interfaces/interfaces';

//get shop item by name
export const getItemByName = async function(itemName:string):Promise<Product | null>{
  return await ItemModel.findOne({name: itemName});
};

//get shop item by id
export const getItemByID = async function(itemID:string):Promise<Product | null>{
  return await ItemModel.findById(itemID);
};

//create a shop item
export const createBagelItem = async function(
  dozenPrice:number,
  sixPrice:number,
  name:string,
  cat:string,
){
  return await ItemModel.create({
    dozenPrice,
    sixPrice,
    name,
    cat
  });
};

export const createSpreadItem = async function(
  price:number,
  name:string,
  cat:string
){
  return await ItemModel.create({
    price,
    name,
    cat
  });
};

export const createPastryItem = async function(
  price:number,
  name:string,
  cat:string
){
  return await ItemModel.create({
    price,
    name,
    cat
  });
};

export const insertManyStoreItems = async function(
  storeItems:any[]
){
  return await ItemModel.insertMany(storeItems);
};

//get all items
export const getAllItems = async function(){
  return await ItemModel.find({}).sort({ name: 1 });
};
export const getAllBagelItems = async function(){
  return await ItemModel.find({cat: 'bagel'}).sort({ name: 1 });
};
export const getAllPastryItems = async function(){
  return await ItemModel.find({cat: 'pastry'}).sort({ name: 1 });
};

//get item by identifier
export const getItemByIdentifier = async function(identifier:string):Promise<Product | null>{
  return await ItemModel.findOne({identifier: identifier})
};

//delete a shop item by ID
export const deleteItemByID = async function(itemID:string){
  return await ItemModel.findByIdAndDelete(itemID);
};

//delete a shop item by name
export const deleteItemByName = async function(itemName:string){
  return await ItemModel.findOneAndDelete({name: itemName});
};

//update a shop item by ID
export const updateItemByID = async function(updatedItem:Product,itemID:string):Promise<Product | null | null>{
  return await ItemModel.findByIdAndUpdate(itemID,updatedItem, { new: true });
};

//update a shop item by name
export const updateItemByName = async function(updatedItem:Product,itemName:string):Promise<Product | null | null>{
  return await ItemModel.findOneAndUpdate({name: itemName},updatedItem, { new: true })
}